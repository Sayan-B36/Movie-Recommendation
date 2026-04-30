# 🎬 MoodFlix — Mood-First Movie & Series Recommender

A cinematic, mood-driven full-stack discovery app that blends your vibe, weather, time of day, occasion, and genre into a hand-ranked watchlist with posters, trailers, cast photos, ratings, and global streaming availability.

---

## 🌐 Live Demo

👉 _Add your deployment URL here (Render / Railway / Fly.io)_

---

## 🚀 Features

- 🎭 **Five preference dials** — mood, climate, time of day (auto-detects), occasion, and genre — all rendered as tappable chip rows
- 🎚️ **Power filters** — content type (movies / series / both), industry (Hollywood / Bollywood / Korean / Anime / Tamil / Telugu / Bengali / Malayalam), dub language, streaming platform, region, minimum rating, dubbed-only toggle
- 🃏 **Ranked watchlist** with TMDB + IMDb ratings, dub-availability badge, year, runtime, and per-region streaming-provider chips on every card
- 🔍 **Live search** with as-you-type TMDB suggestions, instant dropdown, and a "more like this" similarity engine seeded from the matched title
- ♾️ **Endless scroll with relevance gating** — IntersectionObserver-driven; new pages must clear a vote-count floor and share at least one genre with the seed (search) or with the active preference profile (filters), so results never drift into unrelated padding
- 🎬 **Cinematic detail modal** with embedded YouTube trailer, **genre line + truncated description with View More**, scrollable **cast & crew row** (circular avatars for director/creator + top 10 cast), full provider list, and "more like this" carousel
- 📺 **TV deep-dive** — clickable season cards expand into a per-season episode list with **season-specific trailers** and per-episode stills, runtime, and air date
- 🎞️ **Movie collections** — auto-detects franchises (e.g. *John Wick*, *Culpa Mía*) and lists every entry of the saga in release order
- 🌐 **Multi-language trailer preference** — picks the dubbed trailer in your selected language when TMDB has one, else falls back to English / first available
- 💎 **Premium glassmorphism UI** with film-grain backdrop, animated grid drift, gold/coral/violet accent system, and 3D card tilt that follows the cursor
- 📱 **Fully responsive** — three breakpoints (1024 / 720 / 480 px) tailor the topbar, chip rows, filter grid, modal padding, cast cards, and seasons grid for desktop, tablet, and small phones
- 🔐 **API keys never leave the server** — Express proxies every TMDB and OMDb request; nothing sensitive ships to the browser
- ⚡ **Performance-tuned** — in-memory response cache (12 h details, 24 h OMDb), poster lazy-loading, and `node --watch` hot-reload in dev

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript (ES modules) — zero build step
- **Backend:** Node.js, Express
- **Icons:** Lucide (UMD bundle, ~700 SVG icons)
- **Recommendation Engine:** Custom genre-weighted scoring + dedupe + enrichment pipeline
- **Endless Scroll:** IntersectionObserver with two-stage relevance filter (vote-count floor + genre overlap)
- **Movie API:** TMDB (`api.themoviedb.org/3`)
- **IMDb Ratings:** OMDb (`omdbapi.com`) — optional
- **Embedded Media:** YouTube IFrame for trailers, OpenStreetMap-style poster CDN via `image.tmdb.org`

---

## ⚙️ Architecture

```
Browser ─▶ Express static server ─▶ /api/status         ─▶ self (key-presence flags)
                                  ─▶ /api/discover/:t   ─▶ TMDB /discover/{movie|tv}
                                  ─▶ /api/search        ─▶ TMDB /search/multi
                                  ─▶ /api/details/:t/:id─▶ TMDB /{movie|tv}/{id}
                                                          (videos, watch/providers,
                                                           external_ids, credits,
                                                           similar, translations)
                                  ─▶ /api/recommendations
                                                /:t/:id?page=N
                                                        ─▶ TMDB /{t}/{id}/recommendations
                                  ─▶ /api/season/:tv/:n ─▶ TMDB /tv/{id}/season/{n}
                                                          (with append=videos)
                                  ─▶ /api/collection/:id─▶ TMDB /collection/{id}
                                  ─▶ /api/omdb          ─▶ OMDb (IMDb rating fallback)
```

Frontend pipeline:

```
filters / search ─▶ buildPreferenceProfile ─▶ buildDiscoverJobs (parallel)
                                            ─▶ dedupeAndRank (genre-weighted score)
                                            ─▶ enrichItem (details + providers + IMDb)
                                            ─▶ filter (dubbed / platform / rating)
                                            ─▶ render grid + IntersectionObserver footer
```

---

## 🔒 Security

- API keys live in `.env` as `TMDB_KEY` and `OMDB_KEY`
- Express backend proxies every third-party call — keys are never serialized into responses or query strings sent to the browser
- `.gitignore` blocks `.env`, `node_modules/`, and logs
- The header pill shows **"TMDB connected"** when `TMDB_KEY` is present and **"TMDB key missing in .env"** otherwise — no silent failures

---

## 📁 Project Structure

```
Movie-Recommendation/
├── server.js                  ← Express API proxy + in-memory cache
├── package.json
├── .env                       ← TMDB_KEY=... / OMDB_KEY=... / PORT=3000
├── README.md
└── public/                    ← Static frontend served by Express
    ├── index.html             ← App shell + DOM scaffolding
    ├── styles.css             ← Full design system (~2 200 lines, 3 breakpoints)
    └── js/
        ├── main.js            ← Bootstrap, event wiring, endless-scroll observer
        ├── state.js           ← In-memory app state (filters, results, pagination)
        ├── data.js            ← Option sets: mood / climate / time / occasion / genre,
        │                        languages, regions, platforms, industries, defaults
        ├── icons.js           ← Lucide SVG icon renderer (data-icon → <svg>)
        ├── api.js             ← Frontend fetch helpers for /api/*
        ├── engine.js          ← Discover → dedupe → enrich → rank pipeline
        │                        + loadMoreRecommendations / loadMoreSimilar
        ├── recommendations.js ← Profile builder, scoring, dub inference, trailer pick
        ├── render.js          ← Header, hero, choice stack, filters, results, footer
        └── modal.js           ← Detail modal: trailer, cast row, providers,
                                  seasons (lazy episode + season-trailer fetch),
                                  similar/collection grid, View More toggle
```

---

## ▶️ Run Locally

**1. Get free API keys**
- TMDB (required): https://www.themoviedb.org/settings/api
- OMDb (optional, enables IMDb ratings): https://www.omdbapi.com/apikey.aspx

**2. Create `.env` in the project root**
```
TMDB_KEY=your_tmdb_key_here
OMDB_KEY=your_omdb_key_here
PORT=3000
```

**3. Install and start**
```bash
npm install
npm start
```

Open: http://localhost:3000

For hot-reload during development:
```bash
npm run dev
```

> ⚠️ TMDB keys are usually active immediately. If you see *"TMDB key was rejected"*, double-check the key and that you copied the **API Read Access Token (v3 auth)** value, not the v4 token.

---

## 🚀 Deployment (Render)

1. Push to GitHub
2. Create a new **Web Service** on Render
3. Set **Build command**: `npm install`
4. Set **Start command**: `npm start`
5. Add environment variables: `TMDB_KEY = your_key` and (optional) `OMDB_KEY = your_key`
6. Deploy

The same recipe works on **Railway**, **Fly.io**, **Heroku**, or any **VPS** running Node 18+ (`pm2 start server.js`). For **Vercel**, split `server.js` route handlers into individual files under `api/`.

---

## 🎚️ Recommendation Engine

Five preference groups feed a single weighted scoring profile:

| Group | Weight | Source |
|---|---|---|
| `mood` | 4 | Happy / Sad / Romantic / Chill / Inspired / Scared / Bored / Excited |
| `climate` | 2 | Rainy / Sunny / Cold / Cloudy / Stormy / Night |
| `time` | 2 | Auto / Morning / Afternoon / Evening / Late night |
| `occasion` | 3 | Solo / Date / Family / Friends / Kids / Weekend |
| `genre` | 5 | Any / Action / Adventure / Comedy / Drama / Romance / Thriller / Horror / Sci-Fi / Fantasy / Animation / Documentary / Mystery / Crime / War / Western / Musical / Biopic / Superhero / Satire / Sports / Noir |

Each option maps to TMDB movie + TV genre IDs that contribute to `profile.movieGenreWeights` / `profile.tvGenreWeights`. The engine then:

1. **Discovers** in parallel across the top 4 weighted genres × 2 pages × selected media types.
2. **Dedupes** by `media_type-id` and ranks via `scoreTitle()`:
   `genreScore × 12 + log10(popularity) × 5 + rating × 3 + log10(votes) × 2 + recencyScore + languageBoost + typeBoost`
3. **Enriches** the top 28 with details, watch providers, OMDb IMDb rating, and dub-availability inference.
4. **Filters** by `dubbedOnly` (only if a dub language is selected), platform availability in the selected region, and minimum rating.
5. **Renders** the top 18, with an IntersectionObserver footer that lazily appends more pages — gated by a vote-count floor and genre-overlap check so results never drift into unrelated titles.

---

## ⚡ Performance Notes

- **Server-side cache** — `Map`-based, 12 h TTL on TMDB details, 24 h on OMDb.
- **Cache key includes the full query string** — adding a new `append_to_response` field automatically allocates a fresh cache slot, no manual invalidation.
- **Hard pagination cap** — endless scroll stops at page 10 (filter mode) / page 9 (search mode) even if the API keeps responding, preventing runaway requests.
- **Two-stage relevance filter** drops obscure / off-topic titles *before* expensive enrichment so we don't waste TMDB requests on rejects.
- **Lazy episode + season-trailer fetch** — seasons load only when the user clicks a season card; cached client-side per modal session.
- **Lucide icons** loaded via UMD CDN (~30 KB gz); only the `data-icon` spans actually rendered are converted to inline SVG.

---

## 📊 API & Feature Coverage

| Capability | Status |
|---|---|
| Mood-first discovery | ✅ Five chip groups, weighted scoring |
| Search by title | ✅ Live suggestions + similar engine |
| Endless scroll | ✅ Relevance-gated, both modes |
| Dub language preference | ✅ 10 languages + "None" |
| Region streaming providers | ✅ 7 regions + "Any" fallback chain |
| Trailer (main) | ✅ Language-preferred YouTube embed |
| Trailer (per season) | ✅ Season-specific trailer when TMDB has one |
| Cast & crew with photos | ✅ Director / Creator + top 10 cast |
| Episode list with stills | ✅ Lazy-fetched per season |
| Movie collections | ✅ Auto-detected, sorted chronologically |
| IMDb rating overlay | ✅ Via OMDb (optional key) |
| Mobile responsive | ✅ 3 breakpoints (1024 / 720 / 480 px) |
| API keys hidden from browser | ✅ Express proxy on every request |

---

## 👨‍💻 Author

**Sayan Bhowmick**

> This product uses the **TMDB API** but is not endorsed or certified by TMDB. Optional IMDb ratings are sourced through **OMDb**.

## 📜 License

[MIT](./LICENSE)

