import express, {
  type RequestHandler,
  type ErrorRequestHandler,
} from "express";
import { clerkMiddleware, getAuth } from "@clerk/express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { config, HttpError } from "./config.js";
import { Library, database, publicItem, userHash } from "./graph.js";
import { canonical, validatePublic } from "./network.js";
import { platform } from "./extract.js";
import { storage, detectFile } from "./storage.js";
import { retrieve, ask } from "./retrieval.js";

const topicName = z.string().trim().min(1).max(60);
const itemInput = z
  .object({
    url: z.string().max(4000).optional(),
    text: z.string().trim().max(100000).optional(),
    title: z.string().trim().max(250).optional(),
    notes: z.string().max(20000).default(""),
    topics: z.array(topicName).max(12).default([]),
  })
  .refine((v) => !!v.url || !!v.text, "Provide a URL or text.");
const itemPatch = z
  .object({
    title: z.string().trim().min(1).max(250).optional(),
    notes: z.string().max(20000).optional(),
    favorite: z.boolean().optional(),
    topics: z.array(topicName).max(12).optional(),
  })
  .strict();
const searchSchema = z.object({
  query: z.string().max(2000).default(""),
  topic: z.string().max(60).optional(),
  platform: z.string().max(40).optional(),
  kind: z.string().max(20).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  favorite: z.boolean().optional(),
  graph: z.boolean().optional(),
  semantic: z.boolean().optional(),
});
type Context = { lib: Library; userId: string };
const ctx = (res: express.Response) => res.locals as Context;

export function createApp(authOverride?: RequestHandler) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "256kb" }));
  app.get("/api/health", async (_req, res) => {
    let db = false;
    try {
      await database();
      db = true;
    } catch {}
    res
      .status(db ? 200 : 503)
      .json({
        status: db ? "ok" : "setup-required",
        database: db,
        auth: !!process.env.CLERK_SECRET_KEY,
        integrations: {
          groq: !!process.env.GROQ_API_KEY,
          youtube: !!process.env.YOUTUBE_API_KEY,
          apify: !!process.env.APIFY_TOKEN,
          storage: config.STORAGE_DRIVER,
          r2: !!(
            process.env.R2_ACCOUNT_ID &&
            process.env.R2_BUCKET &&
            process.env.R2_ACCESS_KEY_ID &&
            process.env.R2_SECRET_ACCESS_KEY
          ),
        },
      });
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use("/api", (req, res, next) => {
    const origin = req.get("origin");
    if (origin && !config.origins.includes(origin))
      return res.status(403).json({ error: "Origin is not allowed." });
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PATCH,DELETE,OPTIONS",
      );
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  if (authOverride) app.use("/api", authOverride);
  else {
    app.use("/api", (req, res, next) => {
      if (
        !process.env.CLERK_SECRET_KEY ||
        !process.env.VITE_CLERK_PUBLISHABLE_KEY
      )
        return res
          .status(503)
          .json({ error: "Configure Clerk keys to connect your workspace." });
      clerkMiddleware({
        secretKey: process.env.CLERK_SECRET_KEY,
        publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
        authorizedParties: config.origins,
      })(req, res, next);
    });
    app.use("/api", (req, res, next) => {
      const { userId } = getAuth(req);
      if (!userId)
        return res
          .status(401)
          .json({ error: "Sign in to access your library." });
      res.locals.userId = userId;
      next();
    });
  }
  app.use("/api", async (_req, res, next) => {
    if (!res.locals.userId)
      throw new HttpError(401, "Sign in to access your library.");
    const lib = Library.forUser(res.locals.userId);
    await lib.init();
    res.locals.lib = lib;
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const costly = rateLimit({
    windowMs: 60000,
    limit: 10,
    keyGenerator: (_req, res) => res.locals.userId,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.get("/api/library", async (_req, res) =>
    res.json(await ctx(res).lib.list()),
  );
  app.post("/api/items", costly, async (req, res) => {
    const input = itemInput.parse(req.body);
    const { lib } = ctx(res);
    let url = "",
      canonicalUrl = "",
      source = "Note";
    if (input.url) {
      await validatePublic(input.url);
      url = input.url;
      canonicalUrl = canonical(url);
      source = platform(url);
    }
    const result = await lib.create({
      title:
        input.title ||
        (url ? new URL(url).hostname : input.text!.split("\n")[0].slice(0, 90)),
      manualTitle: !!input.title,
      url,
      canonicalUrl,
      platform: source,
      kind: url ? "link" : "note",
      notes: input.notes,
      content: input.text || "",
      description: url ? "" : input.text!.slice(0, 300),
      topics: input.topics,
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 1,
      fields: 2,
      fieldSize: 1000,
    },
  });
  app.post("/api/uploads", costly, upload.single("file"), async (req, res) => {
    if (!req.file) throw new HttpError(400, "Choose a file.");
    const topics = z
      .array(topicName)
      .max(12)
      .parse(JSON.parse(req.body.topics || "[]"));
    const mime = detectFile(req.file.buffer),
      { lib, userId } = ctx(res),
      key = `${userHash(userId)}/${randomUUID()}`;
    const hash = createHash("sha256").update(req.file.buffer).digest("hex");
    await storage.put(key, req.file.buffer, mime);
    try {
      const result = await lib.create({
        title: req.file.originalname.replace(/[\r\n]/g, "").slice(0, 250),
        kind: mime === "application/pdf" ? "pdf" : "image",
        platform: mime === "application/pdf" ? "PDF" : "Image",
        fileKey: key,
        mime,
        fileSize: req.file.size,
        topics,
        contentHash: hash,
      });
      if (result.duplicate) await storage.delete(key);
      res.status(result.duplicate ? 200 : 201).json(result);
    } catch (e) {
      await storage.delete(key).catch(() => {});
      throw e;
    }
  });
  app.get("/api/items/:id/file", async (req, res) => {
    const item = await ctx(res).lib.get(String(req.params.id));
    if (!item.fileKey) throw new HttpError(404, "No attached file.");
    const data = await storage.get(item.fileKey);
    res.setHeader("Content-Type", item.mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(item.title)}`,
    );
    res.send(data);
  });
  app.get("/api/items/:id", async (req, res) =>
    res.json(publicItem(await ctx(res).lib.get(String(req.params.id)))),
  );
  app.patch("/api/items/:id", async (req, res) =>
    res.json(
      await ctx(res).lib.patch(
        String(req.params.id),
        itemPatch.parse(req.body),
      ),
    ),
  );
  app.delete("/api/items/:id", async (req, res) => {
    await ctx(res).lib.markDelete(String(req.params.id));
    res.status(202).json({ status: "deleting" });
  });
  app.post("/api/items/:id/retry", costly, async (req, res) => {
    await ctx(res).lib.retry(String(req.params.id));
    res.json({ status: "queued" });
  });
  app.get("/api/items/:id/evidence", async (req, res) =>
    res.json(await ctx(res).lib.evidence(String(req.params.id))),
  );
  app.post("/api/topics", async (req, res) => {
    const body = z
      .object({
        name: topicName,
        aliases: z.array(topicName).max(20).default([]),
        parent: z.string().max(60).optional(),
      })
      .parse(req.body);
    await ctx(res).lib.topic(body.name, body.aliases, body.parent);
    res.status(201).json({ ok: true });
  });
  app.patch("/api/topics/:name", async (req, res) => {
    const body = z.object({ name: topicName }).parse(req.body);
    await ctx(res).lib.renameTopic(String(req.params.name), body.name);
    res.json({ ok: true });
  });
  app.delete("/api/topics/:name", async (req, res) => {
    await ctx(res).lib.removeTopic(String(req.params.name));
    res.json({ ok: true });
  });
  app.post("/api/topics/merge", async (req, res) => {
    const body = z
      .object({ source: topicName, target: topicName })
      .parse(req.body);
    res.json({
      mergeId: await ctx(res).lib.mergeTopic(body.source, body.target),
    });
  });
  app.post("/api/topics/merge/:id/undo", async (req, res) => {
    await ctx(res).lib.undoMerge(String(req.params.id));
    res.json({ ok: true });
  });
  app.post("/api/topics/split", async (req, res) => {
    const b = z
      .object({
        source: topicName,
        target: topicName,
        itemIds: z.array(z.string().uuid()).min(1).max(200),
      })
      .parse(req.body);
    const lib = ctx(res).lib;
    if (b.source === b.target)
      throw new HttpError(400, "Choose distinct topics.");
    const items = await Promise.all(b.itemIds.map((id) => lib.get(id)));
    if (items.some((i) => !i.topics.includes(b.source)))
      throw new HttpError(
        409,
        "Every selected save must belong to the source topic.",
      );
    await lib.topic(b.target);
    for (const item of items)
      await lib.assign(item.id, [
        ...new Set(item.topics.filter((t) => t !== b.source).concat(b.target)),
      ]);
    res.json({ ok: true });
  });
  app.get("/api/preferences", async (_req, res) =>
    res.json(await ctx(res).lib.preferences()),
  );
  app.post("/api/preferences", async (req, res) => {
    const b = z
      .object({
        text: z.string().trim().min(1).max(1000),
        scope: z.string().max(60).default("library"),
      })
      .parse(req.body);
    res
      .status(201)
      .json({ id: await ctx(res).lib.preference(b.text, b.scope) });
  });
  app.patch("/api/preferences/:id", async (req, res) => {
    const b = z
      .object({
        text: z.string().trim().min(1).max(1000),
        scope: z.string().max(60).default("library"),
      })
      .parse(req.body);
    await ctx(res).lib.preference(b.text, b.scope, String(req.params.id));
    res.json({ ok: true });
  });
  app.delete("/api/preferences/:id", async (req, res) => {
    await ctx(res).lib.deletePreference(String(req.params.id));
    res.json({ ok: true });
  });
  app.post("/api/search", costly, async (req, res) =>
    res.json(await retrieve(ctx(res).lib, searchSchema.parse(req.body))),
  );
  app.post("/api/ask", costly, async (req, res) => {
    const o = searchSchema.parse(req.body);
    if (!o.query.trim()) throw new HttpError(400, "Enter a question.");
    res.json(await ask(ctx(res).lib, o));
  });
  app.get("/api/answers", async (_req, res) => {
    const rows = await ctx(res).lib.q(
      "MATCH (a:Answer) RETURN a.result AS result ORDER BY a.createdAt DESC LIMIT 30",
    );
    res.json(rows.map((r) => JSON.parse(r.result)));
  });
  app.get("/api/export", async (_req, res) => {
    const lib = ctx(res).lib,
      data = await lib.list();
    const evidence = await lib.q(
      "MATCH (i:Item)-[:HAS_CHUNK]->(c:Chunk) RETURN i.id AS itemId,c.text AS text,c.location AS location,c.derived AS derived",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="remit-library.json"',
    );
    res.json({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      ...data,
      evidence,
    });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const status =
      err instanceof HttpError
        ? err.status
        : err instanceof z.ZodError || err instanceof SyntaxError
          ? 400
          : err instanceof multer.MulterError
            ? 413
            : 503;
    const message =
      err instanceof HttpError
        ? err.message
        : err instanceof z.ZodError
          ? "Invalid request: " +
            err.issues
              .map((i) => i.path.join(".") + ": " + i.message)
              .join("; ")
          : status === 400
            ? "Invalid JSON request."
            : status === 413
              ? "Upload exceeds the allowed limit."
              : "Backend unavailable. Check database and service configuration.";
    console.error(
      JSON.stringify({
        event: "api_error",
        status,
        type: err?.name || "Error",
      }),
    );
    res.status(status).json({ error: message });
  };
  app.use(errorHandler);
  return app;
}
