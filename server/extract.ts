import { parseHTML } from "linkedom";
import { apifyTarget } from "./apify.js";
import { youtubePublicMetadata } from "./youtube.js";
import { fetchWebResource, readWithJina } from "./reader.js";
import { Readability } from "@mozilla/readability";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { safeFetch, validatePublic } from "./network.js";
import { required, HttpError, config } from "./config.js";
import { storage } from "./storage.js";
import { ocrImage } from "./ocr.js";
import { createCanvas } from "@napi-rs/canvas";
import type { Extraction, Item } from "./types.js";

export function platform(url: string) {
  const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  const is = (d: string) => host === d || host.endsWith("." + d);
  if (is("instagram.com")) return "Instagram";
  if (is("pinterest.com") || is("pin.it")) return "Pinterest";
  if (is("x.com") || is("twitter.com")) return "X";
  if (is("youtube.com") || is("youtu.be")) return "YouTube";
  return "Website";
}
export function youtubeId(url: string) {
  const u = new URL(url),
    id =
      u.hostname === "youtu.be"
        ? u.pathname.slice(1)
        : u.searchParams.get("v") ||
          u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id))
    throw new HttpError(422, "Use a YouTube video or Shorts URL.");
  return id;
}
async function serviceJson(url: string, options: RequestInit = {}) {
  const r = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(40000),
  });
  if (!r.ok)
    throw new HttpError(
      r.status === 429 ? 429 : 502,
      `Extraction provider returned HTTP ${r.status}.`,
    );
  return r.json();
}
function strings(values: unknown[]) {
  return values.filter((v) => typeof v === "string" && v.trim()).join("\n");
}
export function normalizeActor(row: any, source: string): Extraction {
  const pin = source === 'Pinterest';
  const pinTitle = pin ? [row.title, row.grid_title, row.seo_title].find(v => typeof v === 'string' && v.trim()) : '';
  const title = strings(pin ? [pinTitle] : [row.title, row.article?.title, row.name]).slice(
    0,
    250,
  );
  const text = strings([
    title,
    row.caption,
    row.description,
    row.text,
    row.full_text,
    row.fullText,
    row.article?.text,
    row.article?.plainText,
    row.article?.body,
    ...(pin ? [row.closeup_description, row.closeup_unified_description, row.seo_description] : []),
    Array.isArray(row.hashtags) ? row.hashtags.join(" ") : "",
  ]);
  const images = [
    row.displayUrl,
    row.image,
    row.imageUrl,
    row.thumbnailUrl,
    row.images?.orig?.url,
    ...(Array.isArray(row.images)
      ? row.images.filter((v: any) => typeof v === "string")
      : []),
  ]
    .filter((v) => typeof v === "string" && /^https?:/.test(v))
    .slice(0, 3);
  return {
    title,
    text,
    images,
    coverage: text ? "partial content" : "metadata only",
    adapter: `apify:${source}`,
    details: {
      ...(pin ? {metadataFields: ['title','grid_title','seo_title','description','closeup_description','closeup_unified_description','seo_description'].filter(key => typeof row[key] === 'string' && row[key].trim())} : {}),
      articleBodyAvailable: !!(
        row.article?.text ||
        row.article?.plainText ||
        row.article?.body
      ),
      modalities: [
        "written metadata",
        ...(images.length ? ["accessible images"] : []),
      ],
    },
  };
}
async function actor(
  item: Item,
  checkpoint: (patch: Record<string, any>) => Promise<void>,
) {
  const prefix = item.platform === "X" ? "X" : item.platform.toUpperCase();
  const target = apifyTarget(prefix),
    token = required("APIFY_TOKEN");
  await validatePublic(item.url);
  const template =
    process.env[`APIFY_${prefix}_INPUT`] || '{"startUrls":[{"url":"{{url}}"}]}';
  let input: any;
  try {
    input = JSON.parse(
      template.replaceAll("{{url}}", JSON.stringify(item.url).slice(1, -1)),
    );
  } catch {
    throw new HttpError(503, `Invalid APIFY_${prefix}_INPUT JSON template.`);
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  let runId = item.apifyRunId;
  if (!runId) {
    const result = await serviceJson(
      `https://api.apify.com/v2/${target.path}/runs?memory=512&timeout=240&maxTotalChargeUsd=${Number(process.env.APIFY_MAX_RUN_USD || 0.25)}`,
      { method: "POST", headers, body: JSON.stringify(input) },
    );
    runId = result.data.id;
    await checkpoint({ apifyRunId: runId });
  }
  for (let i = 0; i < 12; i++) {
    const { data: run } = await serviceJson(
      `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}?waitForFinish=20`,
      { headers },
    );
    if (run.status === "SUCCEEDED") {
      const rows = await serviceJson(
        `https://api.apify.com/v2/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?clean=true&limit=10`,
        { headers },
      );
      if (!Array.isArray(rows) || !rows.length)
        throw new HttpError(422, "No accessible content returned by Apify.");
      // Input must return the supplied single URL, not an unrelated feed.
      const row =
        rows.find((r: any) =>
          [r.url, r.postUrl, r.inputUrl, r.pinUrl].includes(item.url),
        ) || (rows.length === 1 ? rows[0] : null);
      if (!row)
        throw new HttpError(
          422,
          "Actor returned multiple unrelated results; configure single-URL input.",
        );
      const normalized = normalizeActor(row, item.platform);
      return {
        ...normalized,
        details: {
          ...normalized.details,
          runId,
          usageTotalUsd: run.usageTotalUsd || 0,
        },
      };
    }
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) {
      await checkpoint({ apifyRunId: "" });
      throw new HttpError(422, `Apify run ${run.status.toLowerCase()}.`);
    }
  }
  throw new HttpError(
    504,
    "Apify is still running. Retry resumes the same run.",
  );
}
async function document(
  buffer: Buffer,
  mime: string,
  name: string,
): Promise<Extraction> {
  if (mime !== "application/pdf") {
    const text = await ocrImage(buffer);
    const pages = [{ text, location: "Image OCR", derived: true }];
    return {
      title: name,
      text,
      pages,
      coverage: text.trim() ? "partial content" : "link only",
      adapter: "local-ocr",
    };
  }
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  const pdf = await task.promise;
  try {
    const pages: { text: string; location: string; derived?: boolean }[] = [];
    const cap = Math.min(pdf.numPages, 60);
    for (let i = 1; i <= cap; i++) {
      const page = await pdf.getPage(i),
        content = await page.getTextContent();
      pages.push({
        text: content.items.map((v: any) => v.str || "").join(" "),
        location: `PDF page ${i}`,
      });
    }
    let ocr = false;
    for (let i = 0; i < pages.length; i++)
      if (pages[i].text.trim().length < 30) {
        ocr = true;
        const page = await pdf.getPage(i + 1);
        let viewport = page.getViewport({ scale: 1.5 });
        if (viewport.width * viewport.height > 12000000)
          viewport = page.getViewport({
            scale:
              Math.sqrt(12000000 / (viewport.width * viewport.height)) * 1.5,
          });
        const canvas = createCanvas(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height),
        );
        await page.render({
          canvasContext: canvas.getContext("2d") as any,
          viewport,
          canvas: canvas as any,
        }).promise;
        pages[i] = {
          text: await ocrImage(canvas.toBuffer("image/png")),
          location: "PDF page " + (i + 1) + " (OCR)",
          derived: true,
        };
      }
    return {
      title: name,
      text: pages.map((p) => p.text).join("\n"),
      pages,
      coverage:
        ocr || pdf.numPages > cap
          ? "partial content"
          : "full supported extraction",
      adapter: ocr ? "pdf-text+ocr" : "pdf-text",
      details: { pageCount: pdf.numPages, processedPages: cap },
    };
  } finally {
    await task.destroy();
  }
}
export async function extract(
  item: Item,
  checkpoint: (patch: Record<string, any>) => Promise<void>,
): Promise<Extraction> {
  if (item.kind === "note")
    return {
      title: item.title,
      text: item.content || item.description,
      coverage: "full supported extraction",
      adapter: "note",
    };
  if (item.fileKey)
    return document(await storage.get(item.fileKey), item.mime, item.title);
  if (["Instagram", "Pinterest", "X"].includes(item.platform))
    return actor(item, checkpoint);
  if (item.platform === "YouTube") {
    const id = youtubeId(item.url);
    if (!process.env.YOUTUBE_API_KEY?.trim()) return youtubePublicMetadata(id);
    try {
    const result = await serviceJson(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${id}&key=${encodeURIComponent(required("YOUTUBE_API_KEY"))}`,
    );
    const snippet = result.items?.[0]?.snippet;
    if (!snippet) throw new HttpError(422, "YouTube metadata unavailable.");
    return {
      title: snippet.title,
      text: strings([snippet.title, snippet.description]),
      coverage: "metadata only",
      adapter: "youtube-title-description",
      details: { modalities: ["title", "description"] },
    };
    } catch {
      // Public metadata remains usable when the key is restricted or quota is exhausted.
      return youtubePublicMetadata(id);
    }
  }
  const fetched = await fetchWebResource(item.url);
  if (fetched.kind === 'reader') return fetched.extraction;
  const resource = fetched.resource;
  const redirected = platform(resource.url);
  if (redirected !== "Website")
    return extract(
      { ...item, url: resource.url, platform: redirected },
      checkpoint,
    );
  if (resource.type === "application/pdf" || resource.type.startsWith("image/"))
    return document(resource.buffer, resource.type, item.title);
  if (resource.type === "text/plain")
    return {
      title: item.title,
      text: resource.buffer.toString("utf8").slice(0, 150000),
      coverage: "full supported extraction",
      adapter: "text",
    };
  const { document: dom } = parseHTML(resource.buffer.toString("utf8"));
  const meta = (s: string) =>
    dom.querySelector(s)?.getAttribute("content") || "";
  const title = meta('meta[property="og:title"]') || dom.title || item.title;
  const description =
    meta('meta[name="description"]') || meta('meta[property="og:description"]');
  const image = meta('meta[property="og:image"]');
  let article: any;
  try {
    article = new Readability(dom as any).parse();
  } catch {}
  let text = article?.textContent?.trim() || "";
  let adapter = "readability";
  if (text.length < 100 && process.env.JINA_API_KEY) {
    return readWithJina(resource.url, title);
  }
  return {
    title,
    text: strings([title, description, text]).slice(0, 150000),
    coverage: text.length >= 100 ? "partial content" : "metadata only",
    adapter,
    images: image ? [new URL(image, resource.url).href] : [],
    details: { resolvedUrl: resource.url },
  };
}
export async function addImageEvidence(extraction: Extraction) {
  if (!extraction.images?.length) return extraction;
  const pages = extraction.pages || [
    { text: extraction.text, location: "Source text", derived: false },
  ];
  const failures: string[] = [];
  for (const url of extraction.images.slice(0, 2)) {
    try {
      const file = await safeFetch(url, 10 * 1024 * 1024);
      if (!file.type.startsWith("image/")) continue;
      const text = await ocrImage(file.buffer);
      pages.push({ text, location: `Image OCR: ${url}`, derived: true });
    } catch (e) {
      failures.push(
        e instanceof HttpError ? e.message : "Image OCR unavailable.",
      );
    }
  }
  return {
    ...extraction,
    pages,
    text: pages.map((p) => p.text).join("\n"),
    details: { ...extraction.details, imageFailures: failures },
  };
}
