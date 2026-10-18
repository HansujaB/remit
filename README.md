<div align="center">

# Remit

### Save it. Find it again.

Your links, PDFs, images, and notes — connected by topic.

![React](https://img.shields.io/badge/React-19-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Radix UI](https://img.shields.io/badge/Radix_UI-161618?logo=radixui&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)

![FalkorDB](https://img.shields.io/badge/FalkorDB-Graph_Database-6C3BFF)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-F55036?logoColor=white)
![Hugging Face](https://img.shields.io/badge/Hugging_Face-FFD21E?logo=huggingface&logoColor=black)
![Clerk](https://img.shields.io/badge/Clerk-6C47FF?logo=clerk&logoColor=white)
![Apify](https://img.shields.io/badge/Apify-FF9013?logo=apify&logoColor=white)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare_R2-F38020?logo=cloudflare&logoColor=white)

[What it does](#what-it-does) · [Why FalkorDB](#why-falkordb) · [Run locally](#run-locally)

</div>

## One library for everything you want to revisit

A useful reel disappears into Instagram saves. A paper sits in your downloads. A bookmarked article gets buried in another tab.

Remit brings those saves together. Add a link, upload a PDF or image, or write a note. Remit extracts the available text, assigns topics, and connects related material in your personal knowledge graph. Find it later by topic, search by meaning, or ask a question grounded in your saved sources.

## A look at Remit

<details open>
<summary><strong>The landing page</strong></summary>
<br />
<p align="center">
  <img src="docs/screenshots/landing.jpg" alt="Remit's landing page, with Save it. Find it again., example collections, features, and footer." width="740" />
</p>

<summary><strong>Library and search page</strong></summary>
<br />
<p align="center">
  <img src="docs/screenshots/library.png" alt="Remit's library page , it shows everything you have saved with tags search it with keywords or ask questions directly." width="740" />
</p>
</details>

## What it does

- **Save in one place.** Add links and notes through the chat interface, or upload PDFs and images.
- **Organize by subject.** Related saves belong together regardless of their original platform. Automatic tags focus on the content's main subject.
- **Find by words or meaning.** Search combines text matching, semantic similarity, and connections through shared concepts.
- **Ask your library.** Get answers with citations to supporting saved passages, so you can return to the source.
- **Keep your organization.** Explicit preferences and deliberate topic edits are retained during processing.
- **Keep a personal library.** Clerk authenticates requests, and each user has a separate FalkorDB graph. Original uploads are served through authorized file access.

### Different sources. The same interest.

| What you save | Where it belongs |
| --- | --- |
| A Pinterest rangoli pin + an Instagram rangoli reel | **Rangoli** |
| An HLD interview reel + a system design article + a related paper | **System design** |
| A Java exception-handling PDF + your study notes | **Java / Exception Handling** |

These examples illustrate topic grouping when the extracted text supports the subject. You do not need to remember which platform you saved it on.

## Why FalkorDB

**FalkorDB is Remit's primary database and retrieval engine.** It stores saves, topics, text chunks, concepts, embeddings, processing state, preferences, and answer evidence.

The connections are part of how retrieval works:

1. **Topics connect formats.** A PDF and a reel can point to the same topic. Topic hierarchies let retrieval include subtopics.
2. **Concepts connect sources.** Retrieval can follow shared concepts from an initially relevant save to passages in other saves.
3. **Text and vectors support discovery.** FalkorDB full-text search and cosine similarity over locally generated embeddings help retrieve relevant passages.
4. **Answers retain their evidence.** Answer nodes link back to the items used and the chunks supporting the response.

```mermaid
flowchart LR
    I[Saved item] -->|HAS_TOPIC| T[Topic]
    T -->|SUBTOPIC_OF| P[Parent topic]
    I -->|HAS_CHUNK| C[Text chunk + embedding]
    C -->|MENTIONS| K[Concept]
    C2[Chunk from another save] -->|MENTIONS| K
    I2[Another saved item] -->|HAS_CHUNK| C2
    A[Answer] -->|SUPPORTED_BY| C
    A -->|USES_ITEM| I
```

For example, two saved sources mentioning the same concept can be discovered through their graph connections even when they came from different platforms. The resulting answer retains links to its supporting passages.

See the implementation in [`server/graph.ts`](server/graph.ts) and [`server/retrieval.ts`](server/retrieval.ts).

## From a save to an answer

```mermaid
flowchart TD
    UI[React interface] -->|Clerk authentication| API[Express API]
    API -->|Persist save| DB[(FalkorDB)]
    API -->|Uploaded originals| FILES[Cloudflare R2 / local development storage]
    DB -->|Queued item| WORKER[Background worker]
    WORKER --> EXTRACT[Extract text and metadata]
    EXTRACT --> TAG[Subject tagging with local rules + Groq]
    TAG --> EMBED[Local Hugging Face embeddings]
    EMBED -->|Topics, concepts, chunks, vectors| DB
    API --> SEARCH[Text + semantic + graph retrieval]
    DB --> SEARCH
    SEARCH --> ANSWER[Groq answer with source citations]
    ANSWER --> UI
```

Saves are persisted before extraction starts. The background worker processes them, with bounded automatic retries for recoverable failures. If extraction cannot complete, the original save remains in the library.

### Supported content

| Source | How Remit reads it |
| --- | --- |
| Instagram, Pinterest, X | Apify Actors extract available captions, descriptions, and post metadata |
| YouTube | YouTube Data API for title and description, with a public-page metadata fallback |
| Articles and public web pages | Readability, with Jina Reader fallback for supported failures or thin content |
| PDFs | PDF.js text extraction; OCR for scanned pages |
| Images | Tesseract OCR for visible text |
| Notes | Direct text ingestion |

Embeddings run locally through Hugging Face Transformers. Groq handles text classification and answers. Uploaded originals support private Cloudflare R2 storage, with an explicit local-storage option for development.

Current scope is text and metadata: no audio processing, video transcription, or visual scene understanding. Private posts, paywalls, and provider restrictions can limit extraction; captions are not treated as full video content.

## Run locally

**Prerequisites:** Node.js 24, npm, and Docker Desktop with Linux containers.

```sh
npm install
```

Copy [`.env.example`](.env.example) to `.env` and add your provider keys. Use Clerk keys from the same application, configure Groq and Apify, and choose R2 or local development storage. The environment template includes the remaining options.

```sh
docker compose up -d --wait
npm run build:server
npm run models:prepare
npm run dev:all
```

Open **[http://127.0.0.1:5173](http://127.0.0.1:5173)**.

| Service | Local address |
| --- | --- |
| Frontend | `http://127.0.0.1:5173` |
| API health | `http://127.0.0.1:5174/api/health` |
| FalkorDB | `redis://127.0.0.1:6379` |
| FalkorDB browser | `http://127.0.0.1:3000` |

The launcher starts the frontend, API, and worker. Model preparation downloads the local embedding model and OCR language data. After backend edits, rebuild the server and restart the launcher.

For provider configuration, Apify Actor inputs, API routes, and Docker persistence, see the **[setup guide](docs/SETUP.md)**.

## Verification

```sh
# Type checking, unit/HTTP tests, and frontend production build
npm run check

# Integration tests against the configured FalkorDB
npm run test:integration
```

Integration coverage includes user isolation, duplicate saves, processing leases, evidence persistence, topic hierarchy, merge/undo, and ownership checks. Integration tests create temporary graphs and clean them up afterward.

## Project structure

```text
src/                  React interface, components, and client API
server/               Express API, background worker, and extraction pipeline
  graph.ts            FalkorDB persistence and graph operations
  retrieval.ts        Search, graph expansion, and answer evidence
  ai.ts               Groq text inference
  embeddings.ts       Local text embeddings
  tests/              Backend and integration tests
scripts/              Development launcher and verification tools
docs/                 Setup guide and application screenshots
compose.yaml          Local FalkorDB service and persistent volume
```
