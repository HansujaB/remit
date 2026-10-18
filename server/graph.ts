import { createHash, randomUUID } from "node:crypto";
import { FalkorDB } from "falkordb";
import { config, HttpError, normalize } from "./config.js";
import type { Item, Chunk, Assignment } from "./types.js";

export const userHash = (id: string) =>
  createHash("sha256").update(id).digest("hex");
export const graphName = (id: string) => config.GRAPH_PREFIX + userHash(id);
let connection: Promise<FalkorDB> | undefined;
export function database() {
  return (connection ||= FalkorDB.connect({
    url: config.FALKORDB_URL,
    socket: { connectTimeout: 5000 },
  }).catch((e) => {
    connection = undefined;
    throw e;
  }));
}
export async function closeDatabase() {
  if (connection) (await connection).close();
  connection = undefined;
}
const initialized = new Map<string, Promise<void>>();
export class Library {
  constructor(public name: string) {
    if (!name.startsWith(config.GRAPH_PREFIX) || !/^[a-z0-9_]+$/.test(name))
      throw new Error("Invalid graph namespace");
  }
  static forUser(id: string) {
    return new Library(graphName(id));
  }
  async q(query: string, params: Record<string, any> = {}): Promise<any[]> {
    const g = (await database()).selectGraph(this.name);
    const result = await g.query(query, { params, TIMEOUT: 10000 });
    return result.data || [];
  }
  async init() {
    let pending = initialized.get(this.name);
    if (!pending) {
      pending = this.setup().catch((e) => {
        initialized.delete(this.name);
        throw e;
      });
      initialized.set(this.name, pending);
    }
    await pending;
  }
  private async setup() {
    for (const query of [
      "CREATE INDEX FOR (i:Item) ON (i.id)",
      "CREATE INDEX FOR (i:Item) ON (i.dedupe)",
      "CREATE INDEX FOR (t:Topic) ON (t.key)",
      "CREATE INDEX FOR (c:Chunk) ON (c.id)",
      "CREATE INDEX FOR (c:Concept) ON (c.key)",
      "CREATE INDEX FOR (p:Preference) ON (p.id)",
      "CALL db.idx.fulltext.createNodeIndex('Chunk', 'text')",
      `CREATE VECTOR INDEX FOR (c:Chunk) ON (c.vector) OPTIONS {dimension:${config.EMBEDDING_DIMENSIONS}, similarityFunction:'cosine'}`,
    ]) {
      try {
        await this.q(query);
      } catch (e) {
        if (!/already|exists|indexed/i.test(String(e))) throw e;
      }
    }
    await this.q("MERGE (m:Library {id: $id}) ON CREATE SET m.createdAt=$now", {
      id: this.name,
      now: new Date().toISOString(),
    });
  }
  async list() {
    const rows = await this.q(
      "MATCH (i:Item) WHERE i.status <> 'deleting' OPTIONAL MATCH (i)-[:HAS_TOPIC]->(t:Topic) WITH i, collect(t.name) AS topics ORDER BY i.createdAt DESC RETURN properties(i) AS item, topics",
    );
    const topics = await this.topics();
    return {
      items: rows.map((r) => publicItem({ ...r.item, topics: r.topics })),
      topics: topics.map((t) => t.name),
      topicDetails: topics,
      preferences: await this.preferences(),
    };
  }
  async get(id: string): Promise<Item> {
    const [row] = await this.q(
      "MATCH (i:Item {id:$id}) WHERE i.status <> 'deleting' OPTIONAL MATCH (i)-[:HAS_TOPIC]->(t:Topic) RETURN properties(i) AS item, collect(t.name) AS topics",
      { id },
    );
    if (!row) throw new HttpError(404, "Save not found.");
    return { ...row.item, topics: row.topics };
  }
  async topics() {
    return (
      await this.q(
        "MATCH (t:Topic) WHERE coalesce(t.archived,false)=false OPTIONAL MATCH (t)-[:SUBTOPIC_OF]->(p:Topic) RETURN properties(t) AS topic, p.name AS parent ORDER BY t.name",
      )
    ).map((r) => ({ ...r.topic, parent: r.parent }));
  }
  async topic(name: string, aliases: string[] = [], parent?: string) {
    const key = normalize(name);
    if (parent && normalize(parent) === key)
      throw new HttpError(400, "A topic cannot be its own parent.");
    const existing = (await this.topics()).find(
      (t) =>
        t.key !== key &&
        [t.key, ...(t.aliases || [])].some((k: string) =>
          [key, ...aliases.map(normalize)].includes(k),
        ),
    );
    if (existing)
      throw new HttpError(409, "A topic or alias already uses that name.");
    if (parent) {
      if (!(await this.topics()).some((t) => t.key === normalize(parent)))
        throw new HttpError(404, "Parent topic not found.");
      if (
        (
          await this.q(
            "MATCH (p:Topic {key:$parent})-[:SUBTOPIC_OF*1..20]->(t:Topic {key:$key}) RETURN t.key AS key",
            { parent: normalize(parent), key },
          )
        ).length
      )
        throw new HttpError(400, "Topic hierarchy would form a cycle.");
    }
    await this.q(
      "MERGE (t:Topic {key:$key}) ON CREATE SET t.name=$name,t.aliases=[],t.archived=false SET t.aliases=$aliases",
      { key, name: name.trim(), aliases: aliases.map(normalize) },
    );
    if (parent !== undefined) {
      await this.q(
        "MATCH (t:Topic {key:$key}) OPTIONAL MATCH (t)-[r:SUBTOPIC_OF]->() DELETE r",
        { key },
      );
      if (parent)
        await this.q(
          "MATCH (t:Topic {key:$key}),(p:Topic {key:$parent}) MERGE (t)-[:SUBTOPIC_OF]->(p)",
          { key, parent: normalize(parent) },
        );
    }
  }
  async create(input: Partial<Item>) {
    const id = randomUUID(),
      now = new Date().toISOString();
    const dedupe = input.canonicalUrl || input.contentHash || id;
    const [count] = await this.q("MATCH (i:Item) RETURN count(i) AS n");
    if (count.n >= config.MAX_ITEMS)
      throw new HttpError(
        429,
        "Library limit reached. Export or remove saves before adding more.",
      );
    const row = {
      id,
      title: input.title || "",
      url: input.url || "",
      canonicalUrl: input.canonicalUrl || "",
      dedupe,
      platform: input.platform || "Note",
      kind: input.kind || "note",
      notes: input.notes || "",
      content: input.content || "",
      description: input.description || "",
      fileKey: input.fileKey || "",
      fileSize: input.fileSize || 0,
      mime: input.mime || "",
      contentHash: input.contentHash || "",
      createdAt: now,
      favorite: false,
      status: "queued",
      coverage:
        input.kind === "note" ? "full supported extraction" : "link only",
      manualTopics: !!input.topics?.length,
      manualTitle: !!input.manualTitle,
      generation: 1,
      attempts: 0,
      nextAttempt: 0,
      leaseUntil: 0,
      error: "",
      extraction: "",
      revision: 1,
    };
    const [result] = await this.q(
      "MERGE (i:Item {dedupe:$dedupe}) ON CREATE SET i += $item RETURN i.id AS id",
      { dedupe, item: row },
    );
    if (result.id === id && input.topics?.length)
      await this.assign(id, input.topics, "user");
    return {
      item: publicItem(await this.get(result.id)),
      duplicate: result.id !== id,
    };
  }
  async assign(
    id: string,
    names: string[],
    origin = "user",
    assignments: Assignment[] = [],
  ) {
    for (const name of names) await this.topic(name);
    await this.q(
      "MATCH (i:Item {id:$id}) OPTIONAL MATCH (i)-[r:HAS_TOPIC]->() DELETE r",
      { id },
    );
    for (const name of names) {
      const a = assignments.find((a) => normalize(a.name) === normalize(name));
      await this.q(
        "MATCH (i:Item {id:$id}),(t:Topic {key:$key}) MERGE (i)-[r:HAS_TOPIC]->(t) SET r.origin=$origin,r.evidence=$evidence,r.reason=$reason,r.confidence=$confidence",
        {
          id,
          key: normalize(name),
          origin,
          evidence: a?.quote || "",
          reason: a?.reason || "Assigned by you",
          confidence: a?.confidence || 1,
        },
      );
    }
    if (origin === "user")
      await this.q(
        "MATCH (i:Item {id:$id}) SET i.manualTopics=true,i.revision=i.revision+1",
        { id },
      );
  }
  async patch(id: string, patch: Record<string, any>) {
    await this.get(id);
    if (patch.topics) {
      await this.assign(id, patch.topics);
      delete patch.topics;
    }
    if (patch.title !== undefined) patch.manualTitle = true;
    if (Object.keys(patch).length)
      await this.q(
        "MATCH (i:Item {id:$id}) SET i += $patch, i.revision=i.revision+1",
        { id, patch },
      );
    // Cached answers may include user text; invalidate whenever it changes.
    await this.invalidateAnswers(id);
    return publicItem(await this.get(id));
  }
  async invalidateAnswers(id: string) {
    await this.q(
      "MATCH (i:Item {id:$id})<-[:USES_ITEM]-(a:Answer) DETACH DELETE a",
      { id },
    );
  }
  async retry(id: string) {
    await this.get(id);
    await this.q(
      "MATCH (i:Item {id:$id}) SET i.status='queued',i.generation=i.generation+1,i.attempts=0,i.nextAttempt=0,i.leaseUntil=0,i.error=''",
      { id },
    );
  }
  async markDelete(id: string) {
    await this.get(id);
    await this.invalidateAnswers(id);
    await this.q(
      "MATCH (i:Item {id:$id}) SET i.status='deleting',i.generation=i.generation+1,i.leaseUntil=0",
      { id },
    );
  }
  async finishDelete(id: string) {
    await this.q(
      "MATCH (i:Item {id:$id}) OPTIONAL MATCH (i)-[:HAS_CHUNK]->(c:Chunk) DETACH DELETE c,i",
      { id },
    );
    await this.cleanup();
  }
  async cleanup() {
    await this.q(
      "MATCH (c:Concept) WHERE NOT (c)<-[:MENTIONS]-() DETACH DELETE c",
    );
  }
  async claim(id = '') {
    const token = randomUUID(),
      now = Date.now();
    const rows = await this.q(
      `MATCH (i:Item) WHERE ($id='' OR i.id=$id) AND ((i.status='queued' AND i.nextAttempt <= $now) OR (i.status='processing' AND i.leaseUntil < $now)) AND i.attempts < $max WITH i ORDER BY i.createdAt LIMIT 1 SET i.status='processing',i.lease=$token,i.leaseUntil=$until,i.attempts=i.attempts+1 RETURN properties(i) AS item`,
      { id, now, until: now + 90000, token, max: config.MAX_ATTEMPTS },
    );
    if (!rows.length) return null;
    return { item: await this.get(rows[0].item.id), token };
  }
  async heartbeat(id: string, token: string) {
    await this.q(
      "MATCH (i:Item {id:$id,lease:$token}) SET i.leaseUntil=$until",
      { id, token, until: Date.now() + 90000 },
    );
  }
  async saveStage(id: string, token: string, patch: Record<string, any>) {
    await this.q(
      "MATCH (i:Item {id:$id,lease:$token}) WHERE i.status='processing' SET i += $patch",
      { id, token, patch },
    );
  }
  async commit(
    id: string,
    token: string,
    generation: number,
    chunks: Chunk[],
    assignments: Assignment[],
    patch: Record<string, any>,
  ) {
    // One guarded write swaps old evidence for new evidence and checks the current manual assignment flag.
    const topics = assignments;
    const [guard] = await this.q(
      "MATCH (i:Item {id:$id,lease:$token,generation:$generation}) WHERE i.status='processing' RETURN i.id AS id",
      { id, token, generation },
    );
    if (!guard) return false;
    const data = chunks.map((c) => ({ ...c, embedding: c.embedding || [] }));
    const query = `MATCH (i:Item {id:$id,lease:$token,generation:$generation}) WHERE i.status='processing'
      OPTIONAL MATCH (i)-[:HAS_CHUNK]->(old:Chunk) WITH i,collect(old) AS olds
      FOREACH (old IN olds | DETACH DELETE old)
      SET i += $patch, i.status='complete',i.leaseUntil=0,i.error='',i.extractionVersion=$version
      FOREACH (ch IN $chunks | CREATE (c:Chunk {id:ch.id,text:ch.text,location:ch.location,derived:ch.derived,version:$version,embeddingModel:$model}) MERGE (i)-[:HAS_CHUNK]->(c)
        FOREACH (v IN CASE WHEN size(ch.embedding)>0 THEN [1] ELSE [] END | SET c.vector=vecf32(ch.embedding))
        FOREACH (name IN ch.concepts | MERGE (concept:Concept {key:name}) ON CREATE SET concept.name=name MERGE (c)-[:MENTIONS]->(concept)))
      WITH i OPTIONAL MATCH (i)-[oldTopic:HAS_TOPIC]->() WHERE oldTopic.origin='model' AND i.manualTopics=false
      WITH i,collect(oldTopic) AS oldTopics FOREACH (r IN oldTopics | DELETE r)
      FOREACH (a IN CASE WHEN i.manualTopics THEN [] ELSE $assignments END | MERGE (t:Topic {key:a.key}) ON CREATE SET t.name=a.name,t.aliases=[],t.archived=false MERGE (i)-[r:HAS_TOPIC]->(t) SET r.origin='model',r.evidence=a.quote,r.confidence=a.confidence,r.reason=a.reason)
      RETURN i.id AS id`;
    const result = await this.q(query, {
      id,
      token,
      generation,
      chunks: data,
      assignments: topics.map((a) => ({ ...a, key: normalize(a.name) })),
      patch,
      version: new Date().toISOString(),
      model: config.embeddingModel,
    });
    if (result.length) {
      await this.invalidateAnswers(id);
      await this.cleanup();
    }
    return !!result.length;
  }
  async fail(item: Item, token: string, message: string, blocked = false) {
    await this.q(
      "MATCH (i:Item {id:$id,lease:$token,generation:$generation}) SET i.status=$status,i.error=$message,i.nextAttempt=$next,i.leaseUntil=0",
      {
        id: item.id,
        token,
        generation: item.generation,
        status:
          blocked || item.attempts >= config.MAX_ATTEMPTS ? "failed" : "queued",
        message: message.slice(0, 500),
        next: Date.now() + Math.min(300000, 5000 * 2 ** item.attempts),
      },
    );
  }
  async preferences() {
    return (
      await this.q(
        "MATCH (p:Preference) RETURN properties(p) AS p ORDER BY p.createdAt",
      )
    ).map((r) => r.p);
  }
  async preference(text: string, scope: string, id: string = randomUUID()) {
    await this.q(
      "MERGE (p:Preference {id:$id}) SET p.text=$text,p.scope=$scope,p.createdAt=$now",
      { id, text, scope, now: new Date().toISOString() },
    );
    return id;
  }
  async deletePreference(id: string) {
    await this.q("MATCH (p:Preference {id:$id}) DETACH DELETE p", { id });
  }
  async evidence(id: string) {
    await this.get(id);
    const assignments = await this.q(
      "MATCH (i:Item {id:$id})-[r:HAS_TOPIC]->(t:Topic) RETURN t.name AS topic,properties(r) AS assignment",
      { id },
    );
    const chunks = await this.q(
      "MATCH (i:Item {id:$id})-[:HAS_CHUNK]->(c:Chunk) OPTIONAL MATCH (c)-[:MENTIONS]->(n:Concept) RETURN c.id AS id,c.text AS text,c.location AS location,c.derived AS derived,collect(n.name) AS concepts",
      { id },
    );
    return { assignments, chunks };
  }
  async renameTopic(old: string, name: string) {
    const key = normalize(old),
      next = normalize(name);
    if (
      key !== next &&
      (await this.topics()).some(
        (t) => t.key === next || t.aliases?.includes(next),
      )
    )
      throw new HttpError(409, "Topic already exists. Use merge instead.");
    await this.q(
      "MATCH (t:Topic {key:$key}) SET t.name=$name,t.key=$next,t.aliases=coalesce(t.aliases,[])+[$key]",
      { key, name, next },
    );
  }
  async removeTopic(name: string) {
    await this.q("MATCH (t:Topic {key:$key}) DETACH DELETE t", {
      key: normalize(name),
    });
  }
  async mergeTopic(source: string, target: string) {
    if (normalize(source) === normalize(target))
      throw new HttpError(400, "Choose distinct topics.");
    const all = await this.topics();
    if (
      !all.some((t) => t.key === normalize(source)) ||
      !all.some((t) => t.key === normalize(target))
    )
      throw new HttpError(404, "Topic not found.");
    const id = randomUUID();
    await this.q(
      `MATCH (s:Topic {key:$source}),(t:Topic {key:$target})
      CREATE (m:Merge {id:$id,source:$source,target:$target,createdAt:$now})
      WITH s,t,m OPTIONAL MATCH (i:Item)-[r:HAS_TOPIC]->(s)
      FOREACH (x IN CASE WHEN i IS NULL THEN [] ELSE [i] END |
        CREATE (m)-[:MOVED {revision:i.revision,origin:r.origin,evidence:coalesce(r.evidence,''),reason:coalesce(r.reason,''),confidence:coalesce(r.confidence,1.0)}]->(i)
        MERGE (i)-[nr:HAS_TOPIC]->(t) ON CREATE SET nr.origin='merge',nr.mergeId=$id)
      DELETE r SET s.archived=true`,
      {
        source: normalize(source),
        target: normalize(target),
        id,
        now: new Date().toISOString(),
      },
    );
    return id;
  }
  async undoMerge(id: string) {
    const rows = await this.q("MATCH (m:Merge {id:$id}) RETURN m.id AS id", {
      id,
    });
    if (!rows.length) throw new HttpError(404, "Merge not found.");
    const conflicts = await this.q(
      "MATCH (m:Merge {id:$id})-[r:MOVED]->(i:Item) WHERE r.revision<>i.revision RETURN i.id AS id",
      { id },
    );
    if (conflicts.length)
      throw new HttpError(
        409,
        "Some affected saves changed after merging. Reassign them explicitly before undoing.",
      );
    await this.q(
      `MATCH (m:Merge {id:$id}),(s:Topic) WHERE s.key=m.source SET s.archived=false
      WITH m,s OPTIONAL MATCH (m)-[r:MOVED]->(i:Item)
      FOREACH (x IN CASE WHEN i IS NULL THEN [] ELSE [i] END | MERGE (i)-[nr:HAS_TOPIC]->(s) SET nr.origin=r.origin,nr.evidence=r.evidence,nr.reason=r.reason,nr.confidence=r.confidence)
      WITH m OPTIONAL MATCH ()-[merged:HAS_TOPIC]->() WHERE merged.mergeId=$id DELETE merged
      WITH DISTINCT m DETACH DELETE m`,
      { id },
    );
  }
}
export function publicItem(item: Item) {
  const {
    lease,
    leaseUntil,
    dedupe,
    extraction,
    content,
    contentHash,
    nextAttempt,
    ...safe
  } = item;
  return {
    ...safe,
    fileKey: item.fileKey ? `remote:${item.id}` : "",
    hasFile: !!item.fileKey,
  };
}
