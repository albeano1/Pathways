# Pathways

A web game where you connect two related words through a commonsense graph built from ConceptNet. Type words one at a time; each word must be a direct neighbor of the previous word. Reach the target in as few hops as possible.

## Stack

- React + Vite frontend
- Express + SQLite backend
- ConceptNet 5.7 assertions (top 20,000 English words by connectivity)

Daily puzzles are generated at runtime from the graph: pick a well-connected start word, then an end word along shortest-path layers. Through 2026-06-21 puzzles are 4–7 nodes; from 2026-06-22 onward they are 6–8 nodes. Words need degree 8–300, readable length, and skip abstract hubs like "thing" or "person".

## Setup

```bash
npm install
```

Build the graph database. For a quick local demo graph:

```bash
npm run build:graph -- --mini
```

For the full ConceptNet subset (downloads ~500MB, takes several minutes):

```bash
npm run build:graph
```

## Development

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Production

```bash
npm run build
npm start
```

The server serves the built client and API from one port (default 3001).

## Netlify

The repo includes `netlify.toml`. Connect the site to Netlify and deploy from the repo root.

**Build command:** `npm run build:netlify`  
**Publish directory:** `client/dist`  
**Functions directory:** `netlify/functions`

Each deploy builds the full ConceptNet graph (~20,000 most-connected English words, ~24MB SQLite database), precomputes 60 days of daily puzzles into `client/public/daily/`, validates that every cached start/goal avoids technical vocabulary, then builds the client and API function. Repeat visits load instantly from browser cache; first visits fetch the static puzzle from the CDN instead of waiting on a cold serverless function.

Regenerate the cache locally with `npm run embed:daily` (requires `data/graph.db`). CI and Netlify builds run `npm run validate:daily` to ensure committed embed files never ship with scientific or medical jargon as endpoints.

To speed up later deploys, add a cached path in Netlify:

1. Site configuration → Build & deploy → Build settings
2. **Cached paths:** `data/assertions.csv.gz`

The CSV is reused across builds; only the graph is rebuilt when the build script changes.

API routes (`/api/puzzle`, `/api/validate-step`, etc.) are rewritten to the `api` function. Check `https://your-site.netlify.app/api/health` after deploy — it should report ~20,000 words.

### Scheduled embed refresh (~2.5 deploys/month)

Daily puzzles are precomputed at build time and inlined for the next 14 days (zero-network start/goal). To keep that window rolling without pushing code, a GitHub Action triggers a Netlify rebuild on the **1st, 15th, and 29th** of each month (~6 AM Pacific).

1. Netlify → **Site configuration** → **Build & deploy** → **Build hooks** → **Add build hook** (e.g. name: `scheduled-embed-refresh`)
2. GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
   - Name: `NETLIFY_BUILD_HOOK_URL`
   - Value: the build hook URL from step 1
3. Confirm under **Actions** → **Scheduled Netlify deploy** (or wait for the next 1st / 15th / 29th)

You can also run it manually: **Actions** → **Scheduled Netlify deploy** → **Run workflow**.

For local development without the full download, use `npm run build:graph -- --mini`.

## How to play

1. A new puzzle is available each day at midnight Pacific time.
2. Type a word that connects to your current word in the graph.
3. Keep going until you reach the target.
4. After you solve, a countdown shows when the next puzzle unlocks.

Progress is saved in your browser, so refreshing the page resumes today's puzzle instead of starting over.

Use **Undo** to remove your last word, or **Give up** to reveal a shortest path.

Debug a specific pair with `?puzzle=start,end` in the URL.

## API

- `GET /api/puzzle` — today's daily puzzle
- `GET /api/puzzle?date=YYYY-MM-DD` — puzzle for a specific Pacific calendar date
- `GET /api/puzzle?start=...&end=...` — debug pair
- `POST /api/validate-step` `{ "from": "dog", "to": "animal" }`
- `POST /api/score` `{ "start": "dog", "end": "cat", "path": ["dog", "animal", "cat"] }`
- `GET /api/hint?start=dog&end=cat`

## Data files

- `data/graph.db` — generated SQLite graph (gitignored; includes a precomputed `degree` column)
- `data/assertions.csv.gz` — ConceptNet download cache (gitignored)

Run `npm run build:graph` after cloning to create the full graph locally. Use `--mini` only for a small offline dev graph without downloading ConceptNet.
