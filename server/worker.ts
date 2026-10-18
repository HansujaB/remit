import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Library, database, closeDatabase } from "./graph.js";
import { extract, addImageEvidence } from "./extract.js";
import { classify, chunkText, embeddings } from "./ai.js";
import { config, HttpError, normalize } from "./config.js";
import { storage } from "./storage.js";
import type { Item } from "./types.js";
import { subjectAssignments, TAGGING_VERSION } from './topic-policy.js';
export async function processItem(lib: Library, item: Item, token: string, options: { localOnly?: boolean } = {}) {
  let stage = 'extraction';
  const timer = setInterval(
    () => void lib.heartbeat(item.id, token).catch(() => {}),
    25000,
  );
  try {
    const checkpoint = (patch: Record<string, any>) =>
      lib.saveStage(item.id, token, patch);
    let extraction = item.extraction ? JSON.parse(item.extraction) : null;
    if (!extraction) {
      extraction = await addImageEvidence(await extract(item, checkpoint));
      await checkpoint({
        extraction: JSON.stringify(extraction),
        coverage: extraction.coverage,
      });
    }
    stage = 'classification';
    const topics = await lib.topics(),
      preferences = await lib.preferences();
    const related = await lib.q(
      "MATCH (i:Item)-[:HAS_CHUNK]->(:Chunk)-[:MENTIONS]->(c:Concept) RETURN DISTINCT i.title AS title,c.name AS concept LIMIT 150",
    );
    let organized;
    try {
      if (options.localOnly) {
        const assignments = subjectAssignments(extraction.text);
        if (!assignments.length) throw new HttpError(422, 'No explicit subject available for local organization.');
        organized = {data:{assignments,concepts:assignments.map(a=>({name:normalize(a.name),quote:a.quote}))},usage:undefined,diagnostics:{method:'local-only',acceptedTopics:assignments.length}};
      } else {
      organized = await classify(extraction.text, { topics, preferences, relatedSaves: related });
      }
    } catch (error) {
      const assignments = subjectAssignments(extraction.text);
      if (!assignments.length) throw error;
      organized = {
        data: {assignments, concepts: assignments.map(a => ({name:normalize(a.name),quote:a.quote}))},
        usage: undefined,
        diagnostics: {method:'local-fallback',acceptedTopics:assignments.length},
      };
    }
    if (!organized.data.assignments.length) {
      // Retry automatically using the cached extraction; do not ask users to tag.
      throw new HttpError(429, 'Organization is still in progress. Another attempt will run automatically.');
    }
    // Reuse exact aliases instead of producing parallel topic nodes.
    const assignments = organized.data.assignments.map((a) => {
      const existing = topics.find(
        (t) =>
          t.key === normalize(a.name) || t.aliases?.includes(normalize(a.name)),
      );
      return { ...a, name: existing?.name || a.name.trim() };
    });
    const pages = extraction.pages || [
      {
        text: extraction.text,
        location:
          item.platform === "YouTube"
            ? "YouTube title and description"
            : "Source text",
      },
    ];
    const chunks = chunkText(pages);
    if (!chunks.length)
      throw new HttpError(
        422,
        "No readable evidence was extracted. Add a note or a manual topic.",
      );
    for (const chunk of chunks) {
      chunk.id = randomUUID();
      chunk.concepts = organized.data.concepts
        .filter((c) => chunk.text.includes(c.quote))
        .map((c) => c.name);
    }
    stage = 'embeddings';
    const vectors = await embeddings(chunks.map((c) => c.text));
    chunks.forEach((c, i) => (c.embedding = vectors[i]));
    const current = await lib.get(item.id);
    const patch: Record<string, any> = {
      description: extraction.text.slice(0, 300),
      coverage:
        chunks.length >= config.MAX_CHUNKS
          ? "partial content"
          : extraction.coverage,
      processingDetails: JSON.stringify({
        adapter: extraction.adapter,
        ...extraction.details,
        classificationUsage: organized.usage,
        classification: organized.diagnostics,
        processedAt: new Date().toISOString(),
        chunks: chunks.length,
        taggingVersion: TAGGING_VERSION,
      }),
      extraction: "",
    };
    if (!current.manualTitle && extraction.title)
      patch.title = extraction.title.slice(0, 250);
    stage = 'indexing';
    await lib.commit(
      item.id,
      token,
      item.generation,
      chunks,
      assignments,
      patch,
    );
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return;
    const message =
      e instanceof HttpError
        ? e.message
        : `Processing stopped during ${stage}.`;
    await lib.saveStage(item.id, token, { failureStage: stage, failureStatus: (e as {status?:number}).status || 0 });
    await lib.fail(
      item,
      token,
      message,
      e instanceof HttpError && [400, 401, 403, 413, 503].includes(e.status),
    );
    console.error(
      JSON.stringify({
        event: "processing_failed",
        id: item.id,
        stage,
        attempt: item.attempts,
        generation: item.generation,
        status: (e as { status?: number }).status,
        kind: e instanceof Error ? e.name : "Error",
        message,
      }),
    );
  } finally {
    clearInterval(timer);
  }
}
export async function tick() {
  const db = await database();
  const names = await db.list();
  for (const name of names.filter((n: string) =>
    n.startsWith(config.GRAPH_PREFIX),
  )) {
    const lib = new Library(name);
    await lib.init();
    const deleting = await lib.q(
      "MATCH (i:Item {status:'deleting'}) RETURN i.id AS id,i.fileKey AS fileKey LIMIT 10",
    );
    for (const item of deleting) {
      if (item.fileKey) await storage.delete(item.fileKey);
      await lib.finishDelete(item.id);
    }
    await lib.q(
      "MATCH (i:Item) WHERE i.status='processing' AND i.leaseUntil<$now AND i.attempts >= $max SET i.status='failed',i.error='Retry limit reached after worker interruption.'",
      { now: Date.now(), max: config.MAX_ATTEMPTS },
    );
    const job = await lib.claim();
    if (job) await processItem(lib, job.item, job.token);
  }
}
export async function runWorker() {
  let stop = false;
  process.on("SIGINT", () => (stop = true));
  process.on("SIGTERM", () => (stop = true));
  console.log("Remit worker started.");
  while (!stop) {
    try {
      await tick();
    } catch (e) {
      console.error("Worker storage unavailable; retrying.");
    }
    if (!stop) await new Promise((r) => setTimeout(r, config.WORKER_POLL_MS));
  }
  await closeDatabase();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void runWorker();
