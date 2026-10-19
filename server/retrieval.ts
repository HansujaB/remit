import { randomUUID } from "node:crypto";
import { Library } from "./graph.js";
import { embeddings, composeAnswer } from "./ai.js";
import { HttpError, normalize } from "./config.js";
import { exploreLibrary } from './ask-agent.js';
import { compactEvidence } from './ask-context.js';

export type SearchOptions = {
  query: string;
  topic?: string;
  platform?: string;
  kind?: string;
  from?: string;
  to?: string;
  favorite?: boolean;
  graph?: boolean;
  semantic?: boolean;
};
const queryStopWords = new Set('i me my we our you your did do does have has had save saved something anything related about to for the a an is are was were in on of and or it this that can could please show find'.split(' '));
export const words = (s: string) =>
  [...new Set(s.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [])].filter(w => !queryStopWords.has(w)).slice(
    0,
    24,
  );
export function lexical(text: string, query: string) {
  const tokens = words(query);
  return tokens.length
    ? tokens.filter((w) => text.toLocaleLowerCase().includes(w)).length /
        tokens.length
    : 0;
}
const filter = `i.status<>'deleting' AND ($platform='' OR i.platform=$platform) AND ($kind='' OR i.kind=$kind) AND ($from='' OR i.createdAt >= $from) AND ($to='' OR i.createdAt <= $to) AND ($favorite=false OR i.favorite=true) AND ($topic='' OR i.id IN $topicIds)`;
export async function retrieve(lib: Library, o: SearchOptions) {
  const started = Date.now();
  let topicIds: string[] = [];
  if (o.topic && o.topic !== "All") {
    const rows = await lib.q(
      `MATCH (root:Topic) WHERE root.key=$key OR $key IN coalesce(root.aliases,[]) MATCH (t:Topic)-[:SUBTOPIC_OF*0..20]->(root) MATCH (i:Item)-[:HAS_TOPIC]->(t) RETURN DISTINCT i.id AS id`,
      { key: normalize(o.topic) },
    );
    topicIds = rows.map((r) => r.id);
  }
  const params = {
    platform: o.platform === "All" ? "" : o.platform || "",
    kind: o.kind || "",
    from: o.from || "",
    to: o.to || "",
    favorite: !!o.favorite,
    topic: o.topic === "All" ? "" : o.topic || "",
    topicIds,
  };
  const candidates = await lib.q(
    `MATCH (i:Item) WHERE ${filter} RETURN i.id AS id,i.title AS title,i.notes AS notes,i.url AS url,i.description AS description`,
    params,
  );
  const allowed = new Set(candidates.map((r) => r.id));
  if (!o.query.trim())
    return {
      ids: candidates.map((r) => r.id),
      evidence: [],
      paths: [],
      warnings: [],
      timingMs: Date.now() - started,
    };
  const scores = new Map<string, number>();
  const evidence = new Map<string, any>();
  const paths: any[] = [];
  const warnings: string[] = [];
  const add = (r: any, score: number, reason: string) => {
    if (!allowed.has(r.itemId)) return;
    const old = evidence.get(r.id);
    if (!old || old.score < score) evidence.set(r.id, { ...r, score, reason });
    scores.set(r.itemId, Math.max(scores.get(r.itemId) || 0, score));
  };
  for (const item of candidates) {
    const score = lexical(
      [item.title, item.notes, item.url, item.description].join(" "),
      o.query,
    );
    if (score > 0) scores.set(item.id, score);
  }
  const tokens = words(o.query);
  if (tokens.length) {
    const lucene = tokens.map((w) => `"${w}"`).join(" | ");
    const rows = await lib.q(
      `CALL db.idx.fulltext.queryNodes('Chunk',$query) YIELD node,score MATCH (i:Item)-[:HAS_CHUNK]->(node) WHERE i.id IN $ids RETURN node.id AS id,node.text AS text,node.location AS location,node.derived AS derived,i.id AS itemId,i.title AS title,i.url AS url,score ORDER BY score DESC LIMIT 60`,
      { query: lucene, ids: [...allowed] },
    );
    rows.forEach((r, index) => add(r, 0.65 + 0.25 / (index + 1), "Text match"));
    // Literal matching handles sparse metadata, topic aliases and languages not covered by the full-text stemmer.
    const topics = await lib.q(
      "MATCH (i:Item)-[:HAS_TOPIC]->(t:Topic) WHERE i.id IN $ids RETURN i.id AS id,t.name AS name,t.aliases AS aliases",
      { ids: [...allowed] },
    );
    for (const t of topics) {
      const score = lexical([t.name, ...(t.aliases || [])].join(" "), o.query);
      if (score) scores.set(t.id, Math.max(scores.get(t.id) || 0, score));
    }
  }
  if (o.semantic !== false) {
    try {
      const [vector] = await embeddings([o.query], "query");
      // Exact scoring within the already-filtered candidate set avoids global top-k recall loss.
      const rows = await lib.q(
        `MATCH (i:Item)-[:HAS_CHUNK]->(c:Chunk) WHERE i.id IN $ids AND c.vector IS NOT NULL RETURN c.id AS id,c.text AS text,c.location AS location,c.derived AS derived,i.id AS itemId,i.title AS title,i.url AS url, (1 - vec.cosineDistance(c.vector,vecf32($vector))) AS similarity ORDER BY similarity DESC LIMIT 40`,
        { ids: [...allowed], vector },
      );
      rows
        .filter((r) => r.similarity >= 0.25)
        .forEach((r) => add(r, Math.max(0, r.similarity), "Semantic match"));
    } catch {
      warnings.push(
        "Semantic retrieval unavailable; showing keyword and graph results.",
      );
    }
  }
  if (o.graph !== false) {
    const seeds = [...scores]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id]) => id);
    const rows = await lib.q(
      `MATCH (seed:Item)-[:HAS_CHUNK]->(:Chunk)-[:MENTIONS]->(concept:Concept)<-[:MENTIONS]-(c:Chunk)<-[:HAS_CHUNK]-(i:Item)
      WHERE seed.id IN $seeds AND i.id IN $ids AND i.id<>seed.id
      RETURN DISTINCT seed.id AS seedId,concept.name AS concept,c.id AS id,c.text AS text,c.location AS location,c.derived AS derived,i.id AS itemId,i.title AS title,i.url AS url LIMIT 80`,
      { seeds, ids: [...allowed] },
    );
    for (const r of rows) {
      add(
        r,
        0.35 + 0.25 * lexical(r.text, o.query),
        "Connected through " + r.concept,
      );
      paths.push({
        from: r.seedId,
        concept: r.concept,
        to: r.itemId,
        chunkId: r.id,
      });
    }
  }
  // Title/topic hits need source passages too; include notes as a distinct, explicitly user-authored source.
  const topIds = [...scores]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([id]) => id);
  const rows = await lib.q(
    "MATCH (i:Item)-[:HAS_CHUNK]->(c:Chunk) WHERE i.id IN $ids RETURN c.id AS id,c.text AS text,c.location AS location,c.derived AS derived,i.id AS itemId,i.title AS title,i.url AS url",
    { ids: topIds },
  );
  for (const r of rows)
    if (!evidence.has(r.id))
      add(
        r,
        0.15 + 0.35 * lexical(r.text, o.query),
        "Passage from matched save",
      );
  for (const item of candidates.filter((i) => topIds.includes(i.id) && i.notes))
    add(
      {
        id: "note:" + item.id,
        itemId: item.id,
        text: item.notes,
        title: item.title,
        url: item.url,
        location: "Your notes",
        derived: false,
      },
      0.2 + 0.5 * lexical(item.notes, o.query),
      "Your notes",
    );
  const selected: any[] = [];
  const perItem = new Map<string, number>();
  for (const row of [...evidence.values()].sort((a, b) => b.score - a.score)) {
    if ((perItem.get(row.itemId) || 0) >= 3) continue;
    selected.push(row);
    perItem.set(row.itemId, (perItem.get(row.itemId) || 0) + 1);
    if (selected.length >= 16) break;
  }
  return {
    ids: [...scores].sort((a, b) => b[1] - a[1]).map(([id]) => id),
    evidence: selected,
    paths: paths.filter((p) => selected.some((e) => e.id === p.chunkId)),
    warnings,
    timingMs: Date.now() - started,
  };
}
export async function ask(lib: Library, o: SearchOptions) {
  if (!process.env.GROQ_API_KEY)
    throw new HttpError(503, "Configure GROQ_API_KEY to ask your library.");
  const started = Date.now();
  const explored = await exploreLibrary(lib, o, retrieve);
  const retrieval = { ...explored, evidence: compactEvidence(explored.evidence, o.query), timingMs:Date.now()-started };
  const extras = {matches:explored.matches, clarification:explored.clarification, trace:explored.trace,
    selectedTopics:explored.selectedTopics};
  if (explored.intent === 'discover') return {
    ...extras, insufficient:!explored.matches.length,
    answer: explored.matches.length
      ? `I found ${explored.matches.length} potentially relevant save${explored.matches.length === 1 ? '' : 's'}${explored.selectedTopics.length ? ' while exploring ' + explored.selectedTopics.join(', ') : ''}. `
      : 'I did not find matching saves in the current filters. Try a specific subject or broaden your filters.',
    claims:[], sources:[], paths:explored.paths, warnings:explored.warnings,
  };
  if (!retrieval.evidence.length)
    return {
      ...extras,
      insufficient: true,
      answer:
        "There is not enough evidence in your saved content to answer this.",
      claims: [],
      sources: [],
      paths: [],
      warnings: retrieval.warnings,
    };
  const context = await lib.preferences();
  extras.trace.push({tool:'read_evidence',count:retrieval.evidence.length,characters:retrieval.evidence.reduce((n,e)=>n+e.text.length,0)});
  const answer = await composeAnswer(
    o.query,
    retrieval.evidence,
    context.filter((p) => p.scope === "library" || p.scope === o.topic),
  );
  const sources = retrieval.evidence.filter((e) =>
    answer.claims.some((c) => c.citations.some((ref) => ref.id === e.id)),
  );
  const id = randomUUID();
  const result = {
    ...extras,
    id,
    insufficient: answer.insufficient,
    answer: answer.insufficient
      ? "There is not enough supporting evidence to answer this confidently."
      : answer.claims.map((c) => c.text).join("\n\n"),
    claims: answer.claims,
    sources,
    paths: retrieval.paths,
    warnings: retrieval.warnings,
    timingMs: retrieval.timingMs,
  };
  if (!answer.insufficient) {
    // Verify source items still exist immediately before retaining the answer.
    const ids = [...new Set(sources.map((s) => s.itemId))];
    const stored = await lib.q(
      `MATCH (i:Item) WHERE i.id IN $ids AND i.status<>'deleting' WITH collect(i) AS items WHERE size(items)=$count
      CREATE (a:Answer {id:$id,question:$question,result:$result,createdAt:$now}) FOREACH (i IN items | MERGE (a)-[:USES_ITEM]->(i))
      WITH a MATCH (c:Chunk) WHERE c.id IN $chunks MERGE (a)-[:SUPPORTED_BY]->(c) RETURN a.id AS id`,
      {
        ids,
        count: ids.length,
        id,
        question: o.query,
        result: JSON.stringify(result),
        now: new Date().toISOString(),
        chunks: sources
          .filter((s) => !s.id.startsWith("note:"))
          .map((s) => s.id),
      },
    );
    if (!stored.length && sources.some((s) => !s.id.startsWith("note:")))
      throw new HttpError(
        409,
        "Sources changed while answering. Please ask again.",
      );
  }
  return result;
}
