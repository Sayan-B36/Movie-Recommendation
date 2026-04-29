# MoodFlix

> Mood-first movie & series recommender. Vanilla HTML/CSS/JS frontend with an Express backend that **keeps your TMDB and OMDb API keys server-side**.

![Stack](https://img.shields.io/badge/stack-Node%20%7C%20Express%20%7C%20Vanilla%20JS-1f6feb)
![License](https://img.shields.io/badge/license-MIT-blue)
![Status](https://img.shields.io/badge/status-active-success)

Blend your **mood**, **weather**, **time of day**, **occasion**, **language**, **dub preference**, **streaming platform**, and **region** into a curated watchlist with posters, trailers, ratings, and provider availability.

---

## Why a backend?

The earlier React version stored TMDB/OMDb keys in `localStorage` and called the APIs directly from the browser — meaning the keys were visible in DevTools and travelled in every request URL. This rewrite moves all third-party calls behind an Express proxy, so the keys live only in `.env` on the server.

```
Browser  ──fetch──▶  Express (server.js)  ──fetch──▶  TMDB / OMDb
                       (TMDB_KEY, OMDB_KEY
                        from .env)
```

---

## Features

- 🎭 4 preference dials: mood, climate, time, occasion (auto-detects time of day).
- 🎚️ Filters: type (movie/TV/both), industry, dub language, platform, region, minimum rating, dubbed-only toggle.
- 🃏 Ranked watchlist of up to 18 titles with TMDB + IMDb ratings, dub-likelihood badge, and provider chips.
- 🎬 Detail modal with embedded YouTube trailer, cast, full provider list, and "more like this".
- ⚡ In-memory server cache (12 h for details, 24 h for OMDb) to reduce upstream calls.
- 🔐 No keys in the browser — keys come from `.env`.

---

## Quick start

### Prerequisites

- Node.js **18+** ([download](https://nodejs.org/))
- A free **TMDB** API key — https://www.themoviedb.org/settings/api
- (Optional) A free **OMDb** API key for IMDb ratings — https://www.omdbapi.com/apikey.aspx

### Install & run

```bash
git clone https://github.com/<your-username>/Movie-Recommendation.git
cd Movie-Recommendation
npm install
cp .env.example .env        # On Windows PowerShell: Copy-Item .env.example .env
# Edit .env and paste your keys
npm start
```

Open http://localhost:3000.

> The header pill shows **"TMDB connected"** once the server has a valid `TMDB_KEY`.

### Scripts

| Command | Action |
| --- | --- |
| `npm start` | Start the production server (`PORT`, default `3000`). |
| `npm run dev` | Start with `node --watch` (auto-restart on file changes). |

---

## Project structure

```
Movie-Recommendation/
├─ .env.example          Template for required environment variables
├─ .gitignore            Keeps node_modules/, .env, and logs out of git
├─ LICENSE               MIT
├─ README.md
├─ package.json          Dependencies: express, dotenv
├─ package-lock.json
├─ server.js             Express server + TMDB/OMDb proxy + in-memory cache
└─ public/               Static frontend served by Express
   ├─ index.html
   ├─ styles.css
   └─ js/
      ├─ main.js                Bootstrap, event wiring, top-level orchestration
      ├─ state.js               In-memory app state (filters, results, flags)
      ├─ data.js                Option sets: mood, climate, time, occasion, etc.
      ├─ icons.js               Renders Lucide SVG icons from data-icon spans
      ├─ api.js                 Frontend fetch helpers for /api/*
      ├─ engine.js              Discover → dedupe → enrich → rank pipeline
      ├─ recommendations.js     Profile build, scoring, dub inference
      ├─ render.js              Renders header / hero / filters / results
      └─ modal.js               Detail modal (trailer, providers, similar)
```

---

## Backend API

All endpoints are server-only proxies; the browser never receives the API keys.

| Method | Path                                 | Purpose                                                     |
| ------ | ------------------------------------ | ----------------------------------------------------------- |
| `GET`  | `/api/status`                        | Reports `{ tmdb: boolean, omdb: boolean }` configuration.   |
| `GET`  | `/api/discover/:mediaType`           | Proxies TMDB `/discover/movie` or `/discover/tv`.           |
| `GET`  | `/api/details/:mediaType/:id`        | Proxies TMDB details with `videos,watch/providers,external_ids,translations,credits,similar`. |
| `GET`  | `/api/omdb?imdbId=tt...`             | Proxies OMDb (returns `null` if `OMDB_KEY` missing).        |

Caching is in-memory (lost on restart). For production deployments behind multiple instances, swap the `Map` for Redis or a similar store.

---

## Configuration

Create `.env` from `.env.example`:

```
TMDB_KEY=your_tmdb_key_here
OMDB_KEY=your_omdb_key_here       # optional, enables IMDb ratings
PORT=3000
```

`.env` is **gitignored** — never commit it.

---

## Deployment

This is a standard Node.js + Express app and works on any platform that runs Node:

- **Render** / **Railway** / **Fly.io**: connect the repo, set `TMDB_KEY` and `OMDB_KEY` as environment variables, set the start command to `npm start`.
- **VPS**: `npm install --omit=dev && pm2 start server.js`.
- **Vercel**: works as a Node serverless function with minimal changes (move `server.js` routes under `/api/*` files).

---

## Roadmap ideas

- Persist the cache across restarts (Redis / SQLite).
- User-saved watchlists with a lightweight auth layer.
- More region/language presets.
- Trailer autoplay with mute toggle.

---

## Attribution

This product uses the **TMDB API** but is not endorsed or certified by TMDB. Optional IMDb ratings are sourced through **OMDb**.

## License

[MIT](./LICENSE)
