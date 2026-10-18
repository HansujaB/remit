# Remit

Save links from anywhere. Organize them by topic. Find and ask about what you saved.

## Product goal

Remit is a personal library that groups saved content by subject, regardless of its platform or format. A Pinterest pin and an Instagram reel about rangoli belong in the same Rangoli collection. A reel, an X article, and a research paper about system design belong in the same System design collection.

FalkorDB is the authoritative knowledge store for saved items, topics, concepts, content chunks, relationships, preferences, and answer evidence. Its graph shapes organization and retrieval on each request. Cloudflare R2 holds private uploaded documents and images.

Remit turns scattered saves into connected personal knowledge: it organizes new content using existing saves, remembers explicit corrections, and answers questions with traceable sources. The interface stays minimalist; users do not need to understand or browse a graph to benefit from it.

## Core experience

1. Paste a web link, upload a PDF or image, or save text. Optionally add a note or topic.
2. Remit saves the item immediately and processes it in the background.
3. Remit suggests or assigns topics using accessible content, related saves, existing topics, and explicit user preferences.
4. The item appears in its topic collections across all platforms.
5. Search by topic, keyword, or natural language, or ask questions grounded in saved content.

The main views are Home, Library, Collections, Search, and an item detail view. Item details show the original source, notes, topic assignments, available content, and processing status. Questions can be asked across the library or within a selected collection.

## Topic collections

- A collection is a live view of items assigned to a topic, not a platform-specific folder.
- An item can belong to multiple topics without duplicating the saved item.
- Reuse existing topics before creating new ones. Normalize spelling and formatting variants through aliases.
- Keep related topics distinct unless the user chooses to merge them.
- Support optional parent topics: Caching can belong under System design. Parent collection views include descendant topics and deduplicate items.
- Allow users to add, remove, rename, merge, and split topics. Preserve corrections during reprocessing and make merges reversible.
- Record whether an assignment came from the user or the model, with supporting evidence and confidence for model assignments.
- Automatically apply well-supported assignments. Keep uncertain items untagged in the Library with suggestions rather than forcing a classification.

| Saved content                       | Collection    | Possible additional topics     |
| ----------------------------------- | ------------- | ------------------------------ |
| Pinterest pin showing rangoli       | Rangoli       | Floral, beginner               |
| Instagram rangoli tutorial          | Rangoli       | Diwali, tutorial               |
| Instagram reel about load balancing | System design | Load balancing                 |
| X article about caching             | System design | Caching                        |
| Paper about distributed databases   | System design | Distributed systems, databases |

These examples describe intended behavior; actual assignments depend on available content or user input.

## Link support and content understanding

Remit accepts valid HTTP and HTTPS links even when their content cannot be extracted. Saving, classifying, and fully understanding an item are separate capabilities.

Extraction uses Apify Actors for Instagram, Pinterest, and X; ordinary page extraction and a reader-service fallback handle other websites. Resolve share-link redirects, preserve the original URL, and remove only known tracking parameters when detecting duplicates.

| Input                                                    | Processing approach                                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Articles and websites                                    | Extract title, metadata, main text, and useful accessible images                                                              |
| PDFs                                                     | Extract text; use OCR for scanned pages and retain page references                                                            |
| Pinterest pins                                           | Use an Apify Actor to retrieve available pin titles, descriptions, and images; extract readable text from accessible images using OCR |
| Instagram posts and reels                                | Use an Apify Actor to retrieve available post captions, hashtags, images, and reel thumbnails; classify from this evidence    |
| X posts and articles                                     | Use an Apify Actor to retrieve available post text, article body, and images; distinguish a full article from a preview       |
| YouTube videos and Shorts                                | Retrieve only the title and description through a metadata adapter; use these fields for classification and search            |
| Other video links                                        | Save the link and available page metadata                                                                                     |
| Pasted text and uploaded screenshots                     | Process directly and optionally attach to an existing saved item                                                              |
| Private, deleted, blocked, or otherwise unreadable links | Preserve the bookmark; allow a manual topic, note, screenshot, or text attachment                                             |

Select the specific Apify Actors after validating their outputs against representative saved links, especially Instagram reels, Pinterest share links, and full X articles. Keep Actor identifiers and versions configurable, normalize outputs into Remit's item schema, and track run status and cost. Missing fields or failed runs must preserve the saved bookmark and its coverage status.

Images and scanned PDFs use OCR only. No vision model or visual-content descriptions are included. Images without readable text remain available for manual topics and notes. Embeddings use a dedicated local text encoder, not a chat LLM. Groq handles text-only classification and cited answers; no OpenAI service is used.

Video content is not watched or fully analyzed in the current scope. Post captions mean written descriptions, not subtitles. YouTube extraction excludes transcripts, subtitles, media downloads, and frame analysis. Metadata may support a tentative topic assignment but not a detailed summary of the underlying video. A manual Rangoli tag makes an unreadable reel searchable under Rangoli immediately.

Show processing state separately from coverage:

- Processing: queued, processing, complete, or failed with retry available.
- Coverage: link only, metadata only, partial content, or full supported extraction.

Full supported extraction means the extractor completed its supported scope; it does not guarantee every part of a source was captured. Record which modalities and sections were actually processed.

## Ingestion pipeline

`Persist item → Queue processing → Extract content → Identify concepts → Consult graph and preferences → Assign topics → Index content → Update status`

- Save the item and its pending-work state together before confirming success.
- Use a background worker with bounded retries and resumable, idempotent stages.
- Make link-only items searchable by URL, user title, notes, and manual topics immediately.
- Keep original material separate from model-generated descriptions and summaries.
- Store extraction provenance, retrieval timestamps, and source locations such as PDF page numbers when available.
- Reprocessing must update the existing item without losing user edits or creating duplicate chunks.
- Detect repeated URLs and exact content duplicates. Suggest review for similar content instead of silently merging distinct sources.

## Architecture and data model

| Component         | Responsibility                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Web application   | Saving, browsing collections, editing topics, searching, and asking questions                                           |
| Backend API       | Authentication, validation, ownership checks, ingestion coordination, and retrieval                                     |
| Background worker | Apify run coordination, page and document extraction, OCR, topic assignment, and embedding generation |
| Apify             | Platform-specific Actors for Instagram, Pinterest, and X extraction                                                     |
| FalkorDB          | Primary library records, topic graph, chunk text, processing state, full-text indexes, and vector indexes               |
| Cloudflare R2      | Uploaded PDFs, images, and permitted source assets                                                                      |
| Model services    | Groq for text classification and grounded answers; local dedicated models for embeddings                                             |

Run FalkorDB locally in Docker Compose with a persistent named volume. Use Node.js, TypeScript, and Express for the API, with Clerk session verification and the official FalkorDB TypeScript client. A separate worker handles queued processing. A Python worker is optional if adopting FalkorDB's GraphRAG SDK or Python-specific document tooling materially reduces implementation work; do not introduce a second backend language by default. Neon is not required for this architecture.

Use a separate graph per user library initially. The backend selects the graph from the authenticated identity; clients cannot choose arbitrary graph names. File access must enforce the same ownership boundaries.

Core nodes:

- **Item:** identifier, original and canonical URLs, source platform, content type, title, user notes, saved time, processing state, coverage, and file references.
- **Topic:** identifier, name, normalized name, description, and aliases.
- **Chunk:** identifier, source text or OCR-derived text, provenance, source location, extraction version, and embedding model/version.
- **Concept:** a specific idea such as dot grids, symmetry, caching, or replication, with a canonical name and aliases. Concepts support discovery; Topics remain user-facing collections.
- **Preference:** an explicit instruction or correction, its scope, origin, creation time, and active or superseded status. Users can inspect, edit, or remove it.
- **Answer:** a question and generated response with creation time and references to the evidence used; distinguish historical answers from currently valid evidence.

Core relationships:

- `Item -[:HAS_TOPIC]-> Topic`, with assignment origin, evidence, and confidence where applicable.
- `Topic -[:SUBTOPIC_OF]-> Topic`, with cycles prevented.
- `Item -[:HAS_CHUNK]-> Chunk`.
- `Chunk -[:MENTIONS]-> Concept`, with evidence location and extraction version. Item-level concept matches are derived through chunks.
- `Preference -[:APPLIES_TO]-> Topic`, `Concept`, or `Item`, as appropriate; library-wide preferences carry an explicit scope.
- `Answer -[:SUPPORTED_BY]-> Chunk`, retaining the source references used to support its claims.

For example, a Pinterest pin and an Instagram reel can both belong to Rangoli while their captions mention the same Dot grid concept. A system-design article and a research paper can connect through Caching despite using different wording. Only add more specific concept relationships when source evidence supports them; shared topics or graph proximity alone do not establish factual claims.

Use indexed identifiers and canonical URLs for lookup, full-text indexes for searchable text, and vector indexes for semantic retrieval. Keep embeddings consistent with their index dimensions and model versions.

FalkorDB remains the source of truth for library state. No separate vector database is required initially. Start with a constrained concept schema rather than unrestricted entity and relationship extraction. Models propose concepts and assignments; validate their structure and preserve evidence before writing them. Configure persistent volumes, persistence, backups, and restore verification before relying on it for saved data. Measure graph and embedding memory use against the intended library size.

## Graph-driven organization and memory

Before assigning a new save, the organizing agent queries existing topics, related concepts and saves, and applicable preferences. It then reuses a suitable collection or proposes a new one. Well-supported assignments can be automatic; uncertain ones remain suggestions. Record the graph evidence behind each decision.

Manual edits override inferred assignments. Do not generalize a one-item correction into a library-wide rule without an explicit instruction. Instructions such as “Keep Rangoli and Mandala separate” or “Prefer beginner-friendly system-design explanations” persist across sessions and influence subsequent organization or retrieval within their stated scope.

Use narrow agent tools for finding related saves, reading preferences, proposing assignments, and retrieving evidence. Execute validated, parameterized queries with bounded traversal depth and result limits. The model cannot choose another user's graph or execute unrestricted database writes.

Top interests initially reflect topic assignments and save counts from the graph. Add sophisticated ranking only when it improves a demonstrated user need.

## Search and answers

- Selecting a topic returns its assigned items across platforms, including manually tagged unreadable links.
- Keyword search covers titles, aliases, notes, captions, and extracted text.
- Semantic search retrieves content by meaning, such as “the video I saved about scaling databases.”
- Combine keyword and semantic rankings and group chunk matches into item-level results.
- Expand relevant search candidates through shared concepts and supported relationships to retrieve connected evidence from other saves. Rank and filter the expanded evidence before answering; avoid unrestricted graph expansion.
- Support topic, platform, content-type, and saved-date filters.
- Topic-filtered semantic search must not simply filter a small global top-k result set. Use exact scoring within small filtered candidate sets or expanded retrieval with recall checks.
- Show why an item matched and indicate limited content coverage.

Answers retrieve supporting chunks from the selected library or collection and cite the saved items, with page references when available. Answers about YouTube are grounded only in the title, description, and user notes. If the evidence is incomplete or missing, say so. Source content is treated as data, never as instructions to the application.

A target question is: “Which of my saved examples illustrate the caching trade-offs discussed in this paper?” Resolve the paper and its concepts, traverse to related saves, retrieve supporting passages, and compose a cited answer only when those passages establish the connection.

Add a compact, expandable “Why?” explanation to assignments and answers. Show the relevant evidence and linked sources, such as Paper → Caching → Article → Supporting passage. Explanations must derive from recorded retrieval results, not a newly invented rationale. A developer inspection view can expose the actual query, paths, and retrieved passages without cluttering the normal interface.

## Reliability and privacy

- Keep libraries private and enforce ownership before retrieval, model calls, and file access.
- Validate fetched URLs and every redirect; block access to local and private network addresses and limit download size, duration, and content types.
- Use supported access paths without bypassing source access controls.
- Explain which external services process saved content and send only the material required for the operation.
- Support deletion of an item, its chunks, embeddings, and associated files, with a documented backup-retention policy.
- Remove unsupported derived relationships after deletion or reprocessing, preserve concepts still supported by other saves, and invalidate affected answer evidence. Prevent historical answers or cached results from exposing deleted source content.
- Support export of saved URLs, notes, topics, and available extracted text.
- Record extraction failures and processing costs so unreliable adapters and expensive media processing can be improved.

## Scope

The first release includes URL saving, text and file inputs, topic collections, evidence-backed automatic assignments, a constrained concept graph, persistent explicit preferences, OCR text extraction, keyword and semantic search with graph expansion, and cited answers over accessible content. Instagram, Pinterest, and X use Apify. YouTube uses titles and descriptions only. Audio ingestion, audio processing, speech transcription, and video-content analysis are outside the current scope.

Browser extensions, native mobile share targets, unrestricted relationship extraction, full-screen graph visualizations, community detection, PageRank-based interests, multiple autonomous agents, collaboration, and recommendations are later additions. They are not required for the core workflow.

## Implementation sequence

1. Validate FalkorDB schema, indexes, persistence, and representative save, filter, and retrieval queries. Pin compatible client and database versions.
2. Connect Clerk-authenticated saving, collection management, and favorites to the database; replace browser-only persistence.
3. Add private PDF and image uploads and reliable queued processing with retries and accurate coverage states.
4. Integrate source adapters individually, preserving the agreed Apify and YouTube boundaries.
5. Add evidence-backed concepts, graph-aware topic assignment, and editable persistent preferences.
6. Deliver keyword and semantic search, then bounded graph expansion and cross-save cited answers.
7. Add compact explanations and validate the graph's contribution, account isolation, deletion, recovery, latency, and cost.

## Acceptance criteria

- A rangoli pin and reel appear together under Rangoli when their content or manual tags support that assignment.
- A system-design reel, X article, and paper appear together under System design.
- Topic filters return all assigned items regardless of platform or extraction coverage.
- An extraction failure never removes a successfully saved bookmark.
- User topic corrections survive retries and reprocessing.
- An explicit preference survives a fresh session and changes the handling of a subsequent relevant save.
- New save classification consults existing graph context rather than independently generating a fresh set of tags every time.
- Duplicate saves preserve existing notes and assignments.
- Answers cite supporting saved content and do not invent details from inaccessible sources.
- A cross-save question retrieves evidence from multiple sources through concept relationships, with a traceable path and supporting passages.
- “Why?” explanations accurately reflect the stored assignment evidence or answer retrieval trace.
- YouTube processing retrieves only the title and description, without subtitles, transcripts, audio, or video downloads.
- Apify failures and incomplete article results retain the bookmark with accurate coverage labels.
- Tests cover unseen links, redirects, blocked pages, image-only content, sparse captions, scanned PDFs, and mixed-language material.
- Retrieval tests measure topic-assignment accuracy and search relevance separately from extraction success.
- Restart and restore checks preserve saved data, and isolation checks prevent access to another user's library.

## Validation of graph value

Use a fixed evaluation set containing direct lookups, cross-save questions, ambiguous topic assignments, explicit corrections, and questions with insufficient evidence. Compare text/vector retrieval alone with the same retrieval plus graph expansion, holding source content, models, and comparable retrieval budgets constant.

Measure relevant evidence retrieval, citation support, grouping accuracy, correction preservation, appropriate abstention, latency, and processing cost. Report actual results and failure cases; do not assume graphs improve every question type.

The end-to-end demonstration saves a rangoli pin and reel, explains their grouping, connects a system-design article and paper, answers a question using both, then preserves an explicit correction into a new session. Disabling graph traversal and preference lookup should measurably remove the corresponding connected retrieval and memory behavior while basic bookmark saving continues to work.

## Technical references

- [FalkorDB documentation](https://docs.falkordb.com/)
- [FalkorDB TypeScript client](https://github.com/FalkorDB/falkordb-ts)
- [FalkorDB GraphRAG SDK and provenance patterns](https://github.com/FalkorDB/GraphRAG-SDK)
- [FalkorDB vector indexes](https://docs.falkordb.com/cypher/indexing/vector-index)
- [FalkorDB full-text indexes](https://docs.falkordb.com/cypher/indexing/fulltext-index)
- [FalkorDB persistence](https://docs.falkordb.com/operations/durability/persistence)
- [Jina Reader](https://jina.ai/reader/)
- [Apify Store](https://console.apify.com/store)
