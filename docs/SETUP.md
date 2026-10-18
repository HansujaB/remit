# Running Remit locally

[Back to Remit](../README.md)

## Local setup

Use Node.js 24 (tested with 24.18.0), npm, and Docker Desktop with the Linux container engine running.

```sh
npm install
```

For a fresh checkout, copy [`.env.example`](../.env.example) to `.env` and fill in the values. Preserve an existing `.env`; it is ignored by Git. Never prefix backend secrets with `VITE_`.

```sh
docker compose up -d --wait
npm run build:server
npm run models:prepare
npm run dev:all
```

Open [Remit](http://127.0.0.1:5173). The launcher starts the API, worker, and frontend. Rebuild the server and restart the launcher after backend changes; it does not watch TypeScript files.

| Service | Address |
| --- | --- |
| Frontend via `dev:all` | `http://127.0.0.1:5173` |
| API health | `http://127.0.0.1:5174/api/health` |
| FalkorDB connection | `redis://127.0.0.1:6379` |
| FalkorDB browser | `http://127.0.0.1:3000` |

Alternatively, run `npm run api`, `npm run worker`, and `npm run dev` in separate terminals after compiling. Standalone `npm run dev` uses port **5173**. Vite proxies `/api` to the backend `PORT` from `.env` (default **5174**). Both frontend launch commands use **5173**. `npm run preview` is a frontend build preview, not the full backend launcher.

If the Windows npm shim fails, use `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run <script>`.

## Environment configuration

| Variables | Purpose |
| --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Frontend and backend keys from the **same Clerk application**. Configure local frontend origins in Clerk. |
| `FALKORDB_URL`, `GRAPH_PREFIX` | Docker database address and application graph namespace. |
| `GROQ_API_KEY`, `GROQ_MODEL` | Text inference credentials and model. |
| `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` | Defaults: `Xenova/multilingual-e5-small`, `384`. Changing them requires a matching index and re-embedding existing content. |
| `OCR_LANGUAGES` | Default `eng`; use appropriate Tesseract languages, such as `eng+hin`, for other writing systems. |
| `APIFY_TOKEN` | Apify API token. |
| `APIFY_INSTAGRAM_ACTOR_ID`, `APIFY_PINTEREST_ACTOR_ID`, `APIFY_X_ACTOR_ID` | Direct Actor names such as `epctex/pinterest-scraper`. No saved task is required. |
| `APIFY_INSTAGRAM_INPUT`, `APIFY_PINTEREST_INPUT`, `APIFY_X_INPUT` | JSON input matching each Actor's schema; `{{url}}` is replaced with the submitted URL. |
| `APIFY_MAX_RUN_USD` | Maximum charge parameter sent for each Actor run; default `0.25`. Provider pricing and limits still apply. |
| `YOUTUBE_API_KEY` | Optional Google API key with YouTube Data API v3 enabled. Preferred for complete descriptions; missing/rejected keys fall back to public-page metadata, whose descriptions may be shortened. |
| `JINA_API_KEY` | Optional fallback reader key. |
| `STORAGE_DRIVER` | Keep `r2` for the intended storage setup. Explicit `local` storage is available for offline development/tests. |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Private R2 bucket and bucket-scoped read/write credentials. |
| `APP_ORIGINS`, `PORT`, `HOST` | Allowed frontend origins and local API listener. |

Other limits are documented in [`.env.example`](../.env.example). The health endpoint reports credential **presence**, not whether a provider accepts those credentials.

### Apify setup

1. Select an Actor for each platform in the [Apify Console](https://console.apify.com/store).
2. Copy its Actor name from the JavaScript example, such as `client.actor("epctex/pinterest-scraper")`.
3. Set the corresponding `APIFY_*_ACTOR_ID` to that name. Remit invokes the Actor directly through Apify's REST API and resumes/polls the run in its worker.
4. Adjust the JSON input template to the Actor's schema. Pinterest uses `{"startUrls":["{{url}}"],"maxItems":1,"endPage":1}`. Do not use profile, board, or search URLs to bulk crawl when saving one pin. JavaScript functions from examples cannot be pasted into JSON; the identity `customMapFunction` is unnecessary.
5. Test representative links, including a reel, a Pinterest share link, and a full X article. Caption-only results must not be treated as full video or article content.

Apify processing and Groq inference can incur charges. The worker processes queued saves whenever it is running.

Existing saved tasks remain supported through `APIFY_<PLATFORM>_TASK_ID` when the corresponding Actor variable is absent. If both are supplied, the Actor takes precedence. The backend uses the [direct Actor run endpoint](https://docs.apify.com/api/v2/actors-runs-post); the Apify JavaScript SDK is not required.

## Tests

```sh
npm run check
npm run test:integration
node scripts/check-services.mjs
npm run models:prepare
node scripts/smoke-pipeline.mjs
node scripts/smoke-youtube.mjs
node scripts/smoke-youtube.mjs --fallback
```

- `check`: TypeScript, frontend tests, backend unit/HTTP tests, and production frontend build. Database tests are skipped here intentionally.
- `test:integration`: explicitly runs against the configured FalkorDB. Creates temporary test graphs and deletes those graphs afterward; covers isolation, duplicate saves, leases, evidence, hierarchy, merge/undo, and ownership checks.
- `check-services.mjs`: read-only provider checks; prints statuses without credentials or account data. Checks configured Actor/task availability, not successful extraction. Compile the server first. R2 is currently skipped explicitly.
- `models:prepare`: downloads/caches local embeddings and OCR language data, then runs a small OCR fixture.
- `smoke-pipeline.mjs`: processes synthetic text through Groq, local embeddings, graph persistence, semantic retrieval, and a cited answer. Makes a few billable Groq requests and cleans up its temporary graph. Does not test Clerk sign-in, R2, or social extraction.

## API and processing

All `/api` routes except `/api/health` require a Clerk bearer token. Each authenticated user gets a separate graph. The server resolves that graph from verified identity; clients cannot choose another user's graph.

| Routes | Purpose |
| --- | --- |
| `GET /api/library` | Saves, topics, and preferences |
| `POST /api/items` | Save a URL or text with optional topics/notes |
| `GET/PATCH/DELETE /api/items/:id` | Read, edit, or queue deletion |
| `POST /api/items/:id/retry` | Retry processing |
| `GET /api/items/:id/evidence` | Stored classification and content evidence |
| `POST /api/uploads` | Multipart upload, field `file`, maximum 20 MB |
| `GET /api/items/:id/file` | Authorized original-file download |
| `/api/topics` and topic edit/merge/undo/split routes | Topic management |
| `/api/preferences` | Persistent explicit organization instructions |
| `POST /api/search`, `POST /api/ask` | Retrieval and cited answers |
| `GET /api/answers`, `GET /api/export` | Answer history and library JSON export |

Saves are persisted before background extraction. The worker extracts text, consults topics/concepts/preferences, classifies, embeds, and commits evidence. Failures preserve the bookmark. Manual topic corrections are retained during processing. Deletion is asynchronous and needs the worker to remove files and graph records.

## Docker persistence

Compose binds database ports to loopback and stores database files in the `remit-graph` named volume (normally `remit_remit-graph`). AOF persistence and periodic snapshots are enabled.

```sh
docker compose ps
docker compose logs --tail=100 falkordb
docker compose stop
docker compose start
```

Stopping/recreating the container retains the named volume. **`docker compose down -v` deletes the database volume.** Library JSON export is not a complete database/R2 backup. A verified backup-and-restore procedure is still pending.

