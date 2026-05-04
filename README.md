# 🎬 MoodFlix — Mood-First Movie & Series Recommender

A full-stack movie and series discovery app that recommends what to watch based on your mood, weather, time of day, occasion, and genre — with real streaming availability, trailers, and cast info.

🌐 **Live Demo:** https://moodflix-jjrt.onrender.com

---

## ✨ Features

- 🎭 Pick your **mood, climate, time, occasion, and genre** to get a personalized watchlist
- 🔍 **Smart search** — type a title, actor, director, franchise ("marvel", "dcu"), or genre ("horror movies") and get relevant results
- 🃏 Results show **poster, rating, year, runtime, genres**, and which **streaming platforms** have it in your region
- 🎬 Click any title for a **detail modal** — embedded trailer, full cast with photos, episode list for series, and similar titles
- 👤 Click any **actor or director** to browse their full filmography
- 🎞️ Auto-detects **movie franchises** and lists the full saga in order
- 📱 Fully **responsive** — works on desktop, tablet, and mobile
- 🔐 API keys are **server-side only** — never exposed to the browser

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript (ES Modules) — no framework, no build step
- **Backend:** Node.js + Express
- **APIs:** TMDB (movies/series data), OMDb (IMDb ratings)
- **Icons:** Lucide

---

## ▶️ Run Locally

**1. Get API keys**
- TMDB (required, free): https://www.themoviedb.org/settings/api
- OMDb (optional, free): https://www.omdbapi.com/apikey.aspx

**2. Create a `.env` file in the project root**
```
TMDB_KEY=your_tmdb_key_here
OMDB_KEY=your_omdb_key_here
PORT=3000
```

**3. Install dependencies and start**
```bash
npm install
npm start
```

Open http://localhost:3000 in your browser.

> Use `npm run dev` for auto-reload during development.

---

## 📁 Project Structure

```
Movie-Recommendation/
├── server.js        ← Express backend + API proxy + caching
├── package.json
├── .env             ← API keys (never committed)
└── public/
    ├── index.html   ← App shell
    ├── styles.css   ← Full UI design system
    └── js/
        ├── main.js            ← App bootstrap + event wiring
        ├── state.js           ← App state (filters, results, pagination)
        ├── data.js            ← All option sets and defaults
        ├── api.js             ← Frontend fetch helpers
        ├── engine.js          ← Discover → dedupe → enrich → rank pipeline
        ├── recommendations.js ← Scoring, dub inference, trailer selection
        ├── render.js          ← All DOM rendering
        ├── modal.js           ← Detail modal, seasons, cast, collections
        ├── icons.js           ← Lucide SVG renderer
        └── custom-select.js   ← Custom dropdown component
```

---

## 🚀 Deployment (Render)

1. Push the project to a GitHub repository
2. Go to [render.com](https://render.com) and create a new **Web Service**
3. Connect your GitHub repo
4. Set the following:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
5. Under **Environment Variables**, add:
   - `TMDB_KEY` = your TMDB key
   - `OMDB_KEY` = your OMDb key (optional)
6. Click **Deploy**

> Render's free tier spins down after inactivity — the first load may take ~30 seconds to wake up.

---

## 👨‍💻 Author

**Sayan Bhowmick** — B.Tech IT, Techno Main Salt Lake

> This product uses the TMDB API but is not endorsed or certified by TMDB.