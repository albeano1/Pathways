# Pathways

A web game where you connect two related words through a commonsense graph built from ConceptNet. Type words one at a time; each word must be a direct neighbor of the previous word. Reach the target in as few hops as possible.

## Stack

- React + Vite frontend
- Express + SQLite backend
- ConceptNet 5.7 assertions (local subset)

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

- `data/graph.db` — generated SQLite graph (gitignored)

Run `npm run build:graph` after cloning to create it locally.
