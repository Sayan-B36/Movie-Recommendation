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

/* ============================================================
 * Smart search
 * ============================================================
 * TMDB's /search/multi only matches words inside *titles*. So
 * queries like "horror movies", "ghost movies", "marvel movies"
 * or "christopher nolan movies" return random docs whose titles
 * happen to contain those words (e.g. *Halloween 25 Years of
 * Terror*) - or nothing at all.
 *
 * To fix that we detect intent before calling TMDB:
 *   1. Strip generic suffix words ("movies"/"films"/"series"/...)
 *   2. If the cleaned phrase is a known genre word -> /discover
 *      with with_genres
 *   3. Else, try /search/person and /search/keyword in parallel
 *      with /search/multi. If a strong person/keyword match
 *      exists, route to that person's credits or
 *      /discover?with_keywords. Otherwise fall back to titles.
 *
 * The response always includes a `mode` field:
 *   - "title"   -> classic title hit, frontend pins a seed and
 *                  loads /recommendations for "more like this"
 *   - "concept" -> genre/keyword/person results, frontend treats
 *                  the whole list like discover output and
 *                  paginates via /api/search?page=N
 */

const GENRE_KEYWORD_MAP = {
  horror: { movie: 27, tv: 9648 },
  scary: { movie: 27, tv: 9648 },
  thriller: { movie: 53, tv: 9648 },
  comedy: { movie: 35, tv: 35 },
  funny: { movie: 35, tv: 35 },
  drama: { movie: 18, tv: 18 },
  romance: { movie: 10749, tv: 10749 },
  romantic: { movie: 10749, tv: 10749 },
  love: { movie: 10749, tv: 10749 },
  action: { movie: 28, tv: 10759 },
  adventure: { movie: 12, tv: 10759 },
  "sci-fi": { movie: 878, tv: 10765 },
  scifi: { movie: 878, tv: 10765 },
  "science fiction": { movie: 878, tv: 10765 },
  fantasy: { movie: 14, tv: 10765 },
  mystery: { movie: 9648, tv: 9648 },
  crime: { movie: 80, tv: 80 },
  animation: { movie: 16, tv: 16 },
  cartoon: { movie: 16, tv: 16 },
  anime: { movie: 16, tv: 16 },
  documentary: { movie: 99, tv: 99 },
  family: { movie: 10751, tv: 10751 },
  kids: { movie: 10751, tv: 10762 },
  war: { movie: 10752, tv: 10768 },
  western: { movie: 37, tv: 37 },
  music: { movie: 10402, tv: 10402 },
  musical: { movie: 10402, tv: 10402 },
  history: { movie: 36, tv: 99 },
  biopic: { movie: 36, tv: 99 },
  biography: { movie: 36, tv: 99 }
};

const SUFFIX_RE = /\b(movies?|films?|cinema|series|shows?|tv|netflix|prime)\b/g;

function cleanQuery(q) {
  return q
    .toLowerCase()
    .replace(SUFFIX_RE, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function discoverByGenre(genreId, mediaType, page) {
  return tmdbGet(
    `/discover/${mediaType}`,
    {
      with_genres: genreId,
      sort_by: "popularity.desc",
      "vote_count.gte": 50,
      include_adult: "false",
      include_video: "false",
      page
    },
    DETAIL_TTL
  );
}

async function smartSearch(rawQuery, page) {
  const q = rawQuery.trim();
  if (!q) return { mode: "title", concept: null, results: [] };

  const cleaned = cleanQuery(q);
  const hadSuffix = cleaned !== q.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
  const lookup = cleaned || q.toLowerCase();

  // 1) Direct genre map (e.g. "horror", "horror movies", "comedy")
  if (GENRE_KEYWORD_MAP[lookup]) {
    const g = GENRE_KEYWORD_MAP[lookup];
    const [movieData, tvData] = await Promise.all([
      discoverByGenre(g.movie, "movie", page).catch(() => ({ results: [] })),
      discoverByGenre(g.tv, "tv", page).catch(() => ({ results: [] }))
    ]);
    const merged = [
      ...(movieData.results || []).map((r) => ({ ...r, media_type: "movie" })),
      ...(tvData.results || []).map((r) => ({ ...r, media_type: "tv" }))
    ]
      .filter((r) => r.poster_path || r.backdrop_path)
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    return {
      mode: "concept",
      concept: { type: "genre", name: lookup },
      results: merged
    };
  }

  // 2) Run parallel: title search + (page 1 only) person + keyword
  const personPromise =
    page === 1
      ? tmdbGet("/search/person", { query: lookup, include_adult: "false", page: 1 }, 1000 * 60 * 30).catch(() => ({ results: [] }))
      : Promise.resolve({ results: [] });
  const keywordPromise =
    page === 1
      ? tmdbGet("/search/keyword", { query: lookup, page: 1 }, 1000 * 60 * 60).catch(() => ({ results: [] }))
      : Promise.resolve({ results: [] });
  const multiPromise = tmdbGet(
    "/search/multi",
    { query: q, include_adult: "false", page },
    1000 * 60 * 10
  ).catch(() => ({ results: [] }));

  const [multiData, personData, keywordData] = await Promise.all([
    multiPromise,
    personPromise,
    keywordPromise
  ]);

  const titleMatches = (multiData.results || [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .filter((r) => r.poster_path || r.backdrop_path);

  // Strong title hit = first result is popular AND user did NOT
  // hint a concept ("...movies/series"). Pinning by title makes
  // sense only for a real title intent.
  const strongTitle =
    !hadSuffix &&
    titleMatches[0] &&
    (titleMatches[0].popularity || 0) > 8 &&
    titleMatches[0].vote_count > 25;

  // 3) Person path - check if the cleaned query closely matches a
  //    known person (Christopher Nolan, Spielberg, etc.).
  //
  // Single-word queries must match the FULL name exactly (e.g.
  // "spielberg" -> Steven Spielberg). Otherwise common nouns
  // like "ghost" would route to people whose name contains
  // them ("Lil Ghost") instead of the keyword route.
  const people = (personData.results || []).filter(
    (p) =>
      p.profile_path &&
      (p.known_for_department === "Directing" ||
        p.known_for_department === "Acting" ||
        p.known_for_department === "Writing") &&
      (p.popularity || 0) >= 1.5
  );
  const lookupTokens = lookup.split(" ").filter((t) => t.length >= 2);
  const topPerson = people.find((p) => {
    const name = p.name.toLowerCase();
    const nameTokens = name.split(/\s+/);
    if (name === lookup) return true;
    if (lookupTokens.length === 1) {
      // single-word query: only match if it's the person's last name
      // (avoids "ghost" -> "Lil Ghost") and the person is well known.
      return (
        nameTokens[nameTokens.length - 1] === lookup &&
        (p.popularity || 0) >= 5
      );
    }
    // multi-word query: require every meaningful token to appear in name
    return lookupTokens.every((tok) => name.includes(tok));
  });

  // 4) Keyword path - check for a TMDB keyword whose name matches
  //    (e.g. "marvel" -> keyword "marvel comic"; "ghost" -> keyword "ghost").
  const keywords = (keywordData.results || []).filter((k) => {
    const name = k.name.toLowerCase();
    return name === lookup || name.includes(lookup) || lookup.includes(name);
  });
  const topKeyword = keywords[0];

  // Concept routes win when:
  //  - the title hit isn't strong, AND
  //  - we have a person OR keyword match
  if (!strongTitle && topPerson) {
    const credits = await tmdbGet(
      `/person/${topPerson.id}/combined_credits`,
      {},
      DETAIL_TTL
    ).catch(() => null);
    const list = credits
      ? (credits.cast || [])
          .concat(credits.crew || [])
          .filter((c) => (c.media_type === "movie" || c.media_type === "tv"))
          .filter((c) => c.poster_path || c.backdrop_path)
      : [];
    // Dedupe (people can appear in both cast & crew)
    const seen = new Set();
    const uniq = list.filter((c) => {
      const k = `${c.media_type}-${c.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    uniq.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    if (uniq.length) {
      const start = (page - 1) * 20;
      return {
        mode: "concept",
        concept: { type: "person", id: topPerson.id, name: topPerson.name },
        results: uniq.slice(start, start + 20)
      };
    }
  }

  if (!strongTitle && topKeyword) {
    // Combine top 1-3 matching keywords for richer results
    const ids = keywords.slice(0, 3).map((k) => k.id).join(",");
    const [movieData, tvData] = await Promise.all([
      tmdbGet(
        "/discover/movie",
        {
          with_keywords: ids,
          sort_by: "popularity.desc",
          "vote_count.gte": 30,
          include_adult: "false",
          include_video: "false",
          page
        },
        DETAIL_TTL
      ).catch(() => ({ results: [] })),
      tmdbGet(
        "/discover/tv",
        {
          with_keywords: ids,
          sort_by: "popularity.desc",
          "vote_count.gte": 30,
          include_adult: "false",
          page
        },
        DETAIL_TTL
      ).catch(() => ({ results: [] }))
    ]);
    const merged = [
      ...(movieData.results || []).map((r) => ({ ...r, media_type: "movie" })),
      ...(tvData.results || []).map((r) => ({ ...r, media_type: "tv" }))
    ]
      .filter((r) => r.poster_path || r.backdrop_path)
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    if (merged.length) {
      return {
        mode: "concept",
        concept: { type: "keyword", id: topKeyword.id, name: topKeyword.name },
        results: merged
      };
    }
  }

  // 5) Fallback: plain title search. If still empty AND user
  //    hinted "...movies", do a last-ditch keyword discover.
  if (titleMatches.length) {
    return {
      mode: "title",
      concept: null,
      results: titleMatches.slice(0, page === 1 ? 12 : 20)
    };
  }

  if (topKeyword) {
    const data = await tmdbGet(
      "/discover/movie",
      {
        with_keywords: topKeyword.id,
        sort_by: "popularity.desc",
        "vote_count.gte": 20,
        include_adult: "false",
        page
      },
      DETAIL_TTL
    ).catch(() => null);
    if (data?.results?.length) {
      return {
        mode: "concept",
        concept: { type: "keyword", id: topKeyword.id, name: topKeyword.name },
        results: data.results.map((r) => ({ ...r, media_type: "movie" }))
      };
    }
  }

  return { mode: "title", concept: null, results: [] };
}

app.get("/api/search", async (req, res) => {
  const query = (req.query.q || "").toString().trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  if (!query) return res.json({ mode: "title", concept: null, results: [] });
  try {
    const data = await smartSearch(query, page);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/* ============================================================
 * Trending / Popular / Top-rated (home discover hub)
 * ============================================================ */

app.get("/api/trending", async (req, res) => {
  const window = req.query.window === "day" ? "day" : "week";
  const page = Math.max(1, Number(req.query.page) || 1);
  try {
    const data = await tmdbGet(
      `/trending/all/${window}`,
      { page },
      1000 * 60 * 30
    );
    const results = (data.results || [])
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .filter((r) => r.poster_path || r.backdrop_path);
    res.json({ results });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/popular/:mediaType", async (req, res) => {
  const { mediaType } = req.params;
  if (mediaType !== "movie" && mediaType !== "tv") {
    return res.status(400).json({ error: "mediaType must be 'movie' or 'tv'." });
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  try {
    const data = await tmdbGet(`/${mediaType}/popular`, { page }, 1000 * 60 * 30);
    const results = (data.results || [])
      .filter((r) => r.poster_path || r.backdrop_path)
      .map((r) => ({ ...r, media_type: mediaType }));
    res.json({ results });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/top-rated/:mediaType", async (req, res) => {
  const { mediaType } = req.params;
  if (mediaType !== "movie" && mediaType !== "tv") {
    return res.status(400).json({ error: "mediaType must be 'movie' or 'tv'." });
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  try {
    const data = await tmdbGet(`/${mediaType}/top_rated`, { page }, 1000 * 60 * 60);
    const results = (data.results || [])
      .filter((r) => r.poster_path || r.backdrop_path)
      .map((r) => ({ ...r, media_type: mediaType }));
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
    const page = Math.max(1, Number(req.query.page) || 1);
    const data = await tmdbGet(
      `/${mediaType}/${encodeURIComponent(id)}/recommendations`,
      { page },
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

app.get("/api/season/:tvId/:seasonNumber", async (req, res) => {
  const { tvId, seasonNumber } = req.params;
  if (!/^\d+$/.test(seasonNumber)) {
    return res.status(400).json({ error: "seasonNumber must be a number." });
  }
  try {
    const data = await tmdbGet(
      `/tv/${encodeURIComponent(tvId)}/season/${encodeURIComponent(seasonNumber)}`,
      { append_to_response: "videos" },
      DETAIL_TTL
    );
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/collection/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const data = await tmdbGet(
      `/collection/${encodeURIComponent(id)}`,
      {},
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

app.get('/api/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  const tmdbState = TMDB_KEY ? "configured" : "MISSING";
  const omdbState = OMDB_KEY ? "configured" : "missing (optional)";
  console.log(`MoodFlix server listening on http://localhost:${PORT}`);
  console.log(`  TMDB_KEY: ${tmdbState}`);
  console.log(`  OMDB_KEY: ${omdbState}`);
});
