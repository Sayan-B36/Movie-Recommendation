require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const TMDB_KEY = process.env.TMDB_KEY || "";
const OMDB_KEY = process.env.OMDB_KEY || "";

const TMDB_BASE = "https://api.themoviedb.org/3";
const OMDB_BASE = "https://www.omdbapi.com/";
const DETAIL_TTL = 1000 * 60 * 60 * 12;
const OMDB_TTL = 1000 * 60 * 60 * 24;
const cache = new Map();

function readCache(key, ttl) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function writeCache(key, data) {
  cache.set(key, { time: Date.now(), data });
}

async function tmdbGet(pathname, params, cacheTtl) {
  if (!TMDB_KEY) {
    const error = new Error("TMDB_KEY is not configured on the server.");
    error.status = 500;
    throw error;
  }
  const url = new URL(`${TMDB_BASE}${pathname}`);
  url.searchParams.set("api_key", TMDB_KEY);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });

  const cacheKey = `${url.pathname}?${url.searchParams.toString()}`;
  if (cacheTtl) {
    const cached = readCache(cacheKey, cacheTtl);
    if (cached) return cached;
  }

  const response = await fetch(url);
  if (!response.ok) {
    const message =
      response.status === 401
        ? "TMDB key was rejected. Check TMDB_KEY in .env."
        : response.status === 429
        ? "TMDB rate limit reached. Try again in a minute."
        : `TMDB request failed with status ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  if (cacheTtl) writeCache(cacheKey, data);
  return data;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (_req, res) => {
  res.json({
    tmdb: Boolean(TMDB_KEY),
    omdb: Boolean(OMDB_KEY)
  });
});

app.get("/api/discover/:mediaType", async (req, res) => {
  const { mediaType } = req.params;
  if (mediaType !== "movie" && mediaType !== "tv") {
    return res.status(400).json({ error: "mediaType must be 'movie' or 'tv'." });
  }
  const q = req.query;
  try {
    const data = await tmdbGet(`/discover/${mediaType}`, {
      include_adult: "false",
      include_video: "false",
      sort_by: "popularity.desc",
      "vote_count.gte": q.voteCount || 80,
      "vote_average.gte": q.minRating || 0,
      with_genres: q.genre,
      with_original_language: q.language,
      with_watch_providers: q.platform,
      watch_region: q.platform ? q.region : "",
      page: q.page || 1
    });
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/search", async (req, res) => {
  const query = (req.query.q || "").toString().trim();
  if (!query) return res.json({ results: [] });
  try {
    const data = await tmdbGet(
      "/search/multi",
      {
        query,
        include_adult: "false",
        page: 1
      },
      1000 * 60 * 10
    );
    const results = (data.results || [])
      .filter((item) => item.media_type === "movie" || item.media_type === "tv")
      .filter((item) => item.poster_path || item.backdrop_path)
      .slice(0, 12);
    res.json({ results });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/recommendations/:mediaType/:id", async (req, res) => {
  const { mediaType, id } = req.params;
  if (mediaType !== "movie" && mediaType !== "tv") {
    return res.status(400).json({ error: "mediaType must be 'movie' or 'tv'." });
  }
  try {
    const data = await tmdbGet(
      `/${mediaType}/${encodeURIComponent(id)}/recommendations`,
      { page: 1 },
      DETAIL_TTL
    );
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/details/:mediaType/:id", async (req, res) => {
  const { mediaType, id } = req.params;
  if (mediaType !== "movie" && mediaType !== "tv") {
    return res.status(400).json({ error: "mediaType must be 'movie' or 'tv'." });
  }
  try {
    const data = await tmdbGet(
      `/${mediaType}/${encodeURIComponent(id)}`,
      {
        append_to_response: "videos,watch/providers,external_ids,translations,credits,similar"
      },
      DETAIL_TTL
    );
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/omdb", async (req, res) => {
  const imdbId = req.query.imdbId;
  if (!OMDB_KEY || !imdbId) return res.json(null);

  const cacheKey = `omdb:${imdbId}`;
  const cached = readCache(cacheKey, OMDB_TTL);
  if (cached) return res.json(cached);

  const url = new URL(OMDB_BASE);
  url.searchParams.set("apikey", OMDB_KEY);
  url.searchParams.set("i", imdbId);
  url.searchParams.set("plot", "short");
  url.searchParams.set("r", "json");

  try {
    const response = await fetch(url);
    if (!response.ok) return res.json(null);
    const data = await response.json();
    if (data?.Response === "False") return res.json(null);
    writeCache(cacheKey, data);
    res.json(data);
  } catch {
    res.json(null);
  }
});

app.listen(PORT, () => {
  const tmdbState = TMDB_KEY ? "configured" : "MISSING";
  const omdbState = OMDB_KEY ? "configured" : "missing (optional)";
  console.log(`MoodFlix server listening on http://localhost:${PORT}`);
  console.log(`  TMDB_KEY: ${tmdbState}`);
  console.log(`  OMDB_KEY: ${omdbState}`);
});
