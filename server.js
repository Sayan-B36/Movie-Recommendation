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
// Force browser to revalidate every request so HTML/JS/CSS changes
// pick up immediately. Without this, browsers aggressively cache the
// JS bundles and users see stale UI after deploys.
app.use(
  express.static(path.join(__dirname, "public"), {
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (/\.(html|js|css)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "no-cache, must-revalidate");
      }
    }
  })
);

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
const MOVIE_SUFFIX_RE = /\b(movies?|films?|cinema)\b/i;
const TV_SUFFIX_RE = /\b(series|shows?|tv|tv shows?)\b/i;

/**
 * Alias map for common franchise abbreviations. TMDB's keyword search
 * returns sub-franchises first (e.g. "dc" -> "tomorrowverse (dc)") which
 * give very narrow results; mapping to the canonical franchise keyword
 * gives the wide list users expect.
 */
const QUERY_ALIASES = {
  dcu: "dc extended universe",
  dceu: "dc extended universe",
  dc: "dc extended universe",
  mcu: "marvel cinematic universe",
  marvel: "marvel cinematic universe",
  starwars: "star wars",
  "star wars": "star wars",
  harrypotter: "harry potter",
  hp: "harry potter",
  fastandfurious: "fast and the furious",
  potterhead: "harry potter",
  jamesbond: "james bond",
  bond: "james bond",
  jurassic: "jurassic park",
  lotr: "lord of the rings",
  lordoftherings: "lord of the rings",
  hobbit: "the hobbit"
};

function cleanQuery(q) {
  return q
    .toLowerCase()
    .replace(SUFFIX_RE, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Out of the keywords returned by /search/keyword, pick the one whose
 * name best matches the lookup. Priority:
 *   1. Exact name match
 *   2. Name starts with lookup
 *   3. Shortest name containing the lookup (most general franchise)
 *   4. First result
 */
function bestKeyword(keywords, lookup) {
  if (!keywords.length) return null;
  const exact = keywords.find((k) => k.name.toLowerCase() === lookup);
  if (exact) return exact;
  const startsWith = keywords.find((k) => k.name.toLowerCase().startsWith(lookup));
  if (startsWith) return startsWith;
  const containing = keywords
    .filter((k) => k.name.toLowerCase().includes(lookup))
    .sort((a, b) => a.name.length - b.name.length);
  if (containing.length) return containing[0];
  return keywords[0];
}

/**
 * Combined credits include lots of guest appearances (talk shows, awards,
 * "behind the scenes" docs, cameos as themselves on TV) that are tagged
 * either with character "Self" / "Himself" or with the person's own name.
 * Strip those plus News (10763) and Talk (10767) so we surface real
 * films/series the person actually made.
 */
function isWorthwhilePersonCredit(credit, personName) {
  const character = (credit.character || "").toLowerCase().trim();
  const name = (personName || "").toLowerCase();
  const isSelfCameo =
    character.startsWith("self") ||
    character === "himself" ||
    character === "herself" ||
    (name && (character === name || character === `${name} (uncredited)`));
  if (isSelfCameo && !credit.job) return false;
  const genres = credit.genre_ids || [];
  if (genres.includes(10763) || genres.includes(10767)) return false; // News, Talk
  // Drop low-credibility items (TMDB sometimes lists rumours / shorts with no metadata)
  if ((credit.vote_count || 0) < 25 && (credit.popularity || 0) < 5) return false;
  return true;
}

/**
 * Famous fictional characters mapped to the TMDB person id of their
 * lead actor. TMDB's keyword search has no usable "tony stark" or
 * "iron man" keyword (it only finds sub-string noise), so for character
 * queries we hop straight to the actor's filmography.
 */
const CHARACTER_TO_PERSON_ID = {
  "tony stark": 3223, // Robert Downey Jr.
  "iron man": 3223,
  "peter parker": 1136406, // Tom Holland
  "spider man": 1136406,
  spiderman: 1136406,
  "bruce wayne": 3894, // Christian Bale (most acclaimed Batman)
  batman: 3894,
  "clark kent": 17276, // Henry Cavill
  superman: 17276,
  thor: 74568, // Chris Hemsworth
  "steve rogers": 16828, // Chris Evans
  "captain america": 16828,
  "natasha romanoff": 1245, // Scarlett Johansson
  "black widow": 1245,
  "bruce banner": 103, // Mark Ruffalo
  hulk: 103,
  hermione: 10990, // Emma Watson
  "frodo baggins": 109, // Elijah Wood
  "luke skywalker": 2, // Mark Hamill
  "darth vader": 5658, // James Earl Jones
  "ethan hunt": 500, // Tom Cruise
  "james bond": 8784, // Daniel Craig (most recent)
  "john wick": 6384, // Keanu Reeves
  "indiana jones": 3, // Harrison Ford
  joker: 1810 // Heath Ledger
};

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
  const rawLookup = cleaned || q.toLowerCase();
  // Apply franchise alias (e.g. "dcu" -> "dc extended universe")
  const lookup = QUERY_ALIASES[rawLookup] || rawLookup;

  // Detect explicit media-type intent so "marvel movies" returns ONLY
  // movies (not Daredevil/SHIELD TV series) and "marvel series" returns
  // only TV. Default = both.
  const wantMovies = MOVIE_SUFFIX_RE.test(q);
  const wantTv = TV_SUFFIX_RE.test(q);
  const includeMovies = !wantTv;
  const includeTv = !wantMovies;

  // 1) Direct genre map (e.g. "horror", "horror movies", "comedy")
  if (GENRE_KEYWORD_MAP[lookup]) {
    const g = GENRE_KEYWORD_MAP[lookup];
    const fetchPages = page === 1 ? [1, 2, 3] : [page + 2];
    const requests = fetchPages.flatMap((p) => [
      includeMovies ? discoverByGenre(g.movie, "movie", p).catch(() => ({ results: [] })) : Promise.resolve({ results: [] }),
      includeTv ? discoverByGenre(g.tv, "tv", p).catch(() => ({ results: [] })) : Promise.resolve({ results: [] })
    ]);
    const responses = await Promise.all(requests);
    const merged = [];
    for (let i = 0; i < responses.length; i += 2) {
      merged.push(
        ...(responses[i].results || []).map((r) => ({ ...r, media_type: "movie" })),
        ...(responses[i + 1].results || []).map((r) => ({ ...r, media_type: "tv" }))
      );
    }
    const seen = new Set();
    const deduped = merged
      .filter((r) => r.poster_path || r.backdrop_path)
      .filter((r) => {
        const k = `${r.media_type}-${r.id}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    return {
      mode: "concept",
      concept: { type: "genre", name: lookup },
      results: deduped
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
  // When the user appended "...movies" / "...films" we strip those words
  // from the cleaned lookup; use the cleaned form for title search too
  // so "harry potter movies" can match the actual Harry Potter films
  // instead of the literal phrase "harry potter movies".
  const titleQuery = hadSuffix ? lookup : q;
  const multiPromise = tmdbGet(
    "/search/multi",
    { query: titleQuery, include_adult: "false", page },
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
  let strongTitle =
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
  //    (e.g. "marvel" -> "marvel cinematic universe"; "ghost" -> "ghost").
  const keywords = (keywordData.results || []).filter((k) => {
    const name = k.name.toLowerCase();
    return name === lookup || name.includes(lookup) || lookup.includes(name);
  });
  const topKeyword = bestKeyword(keywords, lookup);
  // Exact-name franchise match always wins. Without this, a query like
  // "star wars" pins Star Wars (1977) as the title seed and skips the
  // franchise keyword that would surface the whole saga.
  if (topKeyword && topKeyword.name.toLowerCase() === lookup) {
    strongTitle = false;
  }

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
          .filter((c) => c.media_type === "movie" || c.media_type === "tv")
          .filter((c) => (c.media_type === "movie" ? includeMovies : includeTv))
          .filter((c) => c.poster_path || c.backdrop_path)
          .filter((c) => isWorthwhilePersonCredit(c, topPerson.name))
      : [];
    // Dedupe (people can appear in both cast & crew). Prefer the entry
    // with a `job` (crew) when both exist - that's how directors/writers
    // get attributed correctly even if they cameo'd as themselves.
    const seen = new Map();
    list.forEach((c) => {
      const key = `${c.media_type}-${c.id}`;
      const existing = seen.get(key);
      if (!existing || (c.job && !existing.job)) seen.set(key, c);
    });
    const uniq = Array.from(seen.values());
    uniq.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    if (uniq.length) {
      // Page 1 returns up to 60 (full filmography in one go); subsequent
      // pages of 40 keep load-more working if the person has 100+ credits.
      const PAGE_SIZE = page === 1 ? 60 : 40;
      const start = page === 1 ? 0 : 60 + (page - 2) * 40;
      return {
        mode: "concept",
        concept: { type: "person", id: topPerson.id, name: topPerson.name },
        results: uniq.slice(start, start + PAGE_SIZE)
      };
    }
  }

  if (!strongTitle && topKeyword) {
    // Use the single best-matching keyword. Combining multiple keywords
    // with comma is OR-semantics in TMDB and produced noisy results
    // (e.g. "marvel" mixed unrelated marvel-tagged comedies in).
    // Page 1 fetches 3 TMDB pages (60 movies + 60 tv max) for a richer
    // initial view; subsequent pages fetch 1 each.
    const fetchPages = page === 1 ? [1, 2, 3] : [page + 2];
    const movieRequests = includeMovies
      ? fetchPages.map((p) =>
          tmdbGet(
            "/discover/movie",
            {
              with_keywords: topKeyword.id,
              sort_by: "popularity.desc",
              "vote_count.gte": 30,
              include_adult: "false",
              include_video: "false",
              page: p
            },
            DETAIL_TTL
          ).catch(() => ({ results: [] }))
        )
      : [];
    const tvRequests = includeTv
      ? fetchPages.map((p) =>
          tmdbGet(
            "/discover/tv",
            {
              with_keywords: topKeyword.id,
              sort_by: "popularity.desc",
              "vote_count.gte": 30,
              include_adult: "false",
              page: p
            },
            DETAIL_TTL
          ).catch(() => ({ results: [] }))
        )
      : [];
    const responses = await Promise.all([...movieRequests, ...tvRequests]);
    const movieResults = responses.slice(0, movieRequests.length).flatMap((r) => r.results || []);
    const tvResults = responses.slice(movieRequests.length).flatMap((r) => r.results || []);
    const merged = [
      ...movieResults.map((r) => ({ ...r, media_type: "movie" })),
      ...tvResults.map((r) => ({ ...r, media_type: "tv" }))
    ]
      .filter((r) => r.poster_path || r.backdrop_path)
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    // Dedupe in case TMDB returned overlap across pages
    const seen = new Set();
    const deduped = merged.filter((m) => {
      const k = `${m.media_type}-${m.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // Only commit to the keyword route if it actually returned a
    // meaningful list. Some franchise keywords are sparsely tagged
    // (e.g. "star wars" has 2 movies because curators use more
    // specific keywords) - in that case fall through to title search.
    if (deduped.length >= 6) {
      return {
        mode: "concept",
        concept: { type: "keyword", id: topKeyword.id, name: topKeyword.name },
        results: deduped
      };
    }
  }

  // 5) Character fallback - "tony stark", "iron man", "batman" etc.
  //    Triggers only if no franchise keyword was found above. Routes to
  //    the lead actor's full filmography (TMDB has no usable keyword
  //    for character names like "tony stark").
  const characterPersonId = CHARACTER_TO_PERSON_ID[rawLookup];
  if (characterPersonId) {
    try {
      const [person, credits] = await Promise.all([
        tmdbGet(`/person/${characterPersonId}`, {}, DETAIL_TTL),
        tmdbGet(`/person/${characterPersonId}/combined_credits`, {}, DETAIL_TTL)
      ]);
      const list = (credits.cast || [])
        .concat(credits.crew || [])
        .filter((c) => c.media_type === "movie" || c.media_type === "tv")
        .filter((c) => (c.media_type === "movie" ? includeMovies : includeTv))
        .filter((c) => c.poster_path || c.backdrop_path)
        .filter((c) => isWorthwhilePersonCredit(c, person.name));
      const seenIds = new Map();
      list.forEach((c) => {
        const key = `${c.media_type}-${c.id}`;
        const ex = seenIds.get(key);
        if (!ex || (c.job && !ex.job)) seenIds.set(key, c);
      });
      const uniq = Array.from(seenIds.values()).sort(
        (a, b) => (b.popularity || 0) - (a.popularity || 0)
      );
      if (uniq.length) {
        const PAGE_SIZE = page === 1 ? 60 : 40;
        const start = page === 1 ? 0 : 60 + (page - 2) * 40;
        return {
          mode: "concept",
          concept: { type: "person", id: person.id, name: `${rawLookup} (${person.name})` },
          results: uniq.slice(start, start + PAGE_SIZE)
        };
      }
    } catch {
      /* fall through */
    }
  }

  // 6) Collection fallback - "harry potter", "the godfather" etc. have
  //    no usable keyword, but they DO have a TMDB collection that
  //    bundles all the films. Surface those plus any related titles
  //    (sequel collections like Fantastic Beasts, the new HBO series,
  //    anthology spin-offs) so the user sees the full universe, not
  //    just one collection.
  if (page === 1) {
    const collectionData = await tmdbGet(
      "/search/collection",
      { query: lookup, page: 1 },
      1000 * 60 * 60
    ).catch(() => ({ results: [] }));
    // Match every collection whose name contains the lookup. For
    // "harry potter" this returns both "Harry Potter Collection" and
    // "Fantastic Beasts Collection" (extended Wizarding World).
    const matchingCollections = (collectionData.results || []).filter((c) => {
      const name = (c.name || "").toLowerCase();
      const cleaned = name.replace(/\s*-?\s*collection$/i, "").trim();
      return name.includes(lookup) || cleaned.includes(lookup) || lookup.includes(cleaned);
    });

    if (matchingCollections.length) {
      // Pull all parts from up to 3 related collections in parallel.
      const collectionDetails = await Promise.all(
        matchingCollections.slice(0, 3).map((c) =>
          tmdbGet(`/collection/${c.id}`, {}, DETAIL_TTL).catch(() => null)
        )
      );
      const fromCollections = [];
      const seenIds = new Set();
      for (const detail of collectionDetails) {
        if (!detail || !Array.isArray(detail.parts)) continue;
        for (const p of detail.parts) {
          const key = `movie-${p.id}`;
          if (seenIds.has(key)) continue;
          if (!p.poster_path && !p.backdrop_path) continue;
          // Skip low-credibility entries (fan edits, fireplace videos,
          // minor promo specials). Real franchise films easily clear 50.
          if ((p.vote_count || 0) < 50 && (p.popularity || 0) < 3) continue;
          seenIds.add(key);
          fromCollections.push({ ...p, media_type: "movie" });
        }
      }

      if (fromCollections.length) {
        // Merge in TV series + standalone titles that share the lookup
        // string (e.g. the new "Harry Potter" HBO series).
        const titleExtras = (multiData.results || [])
          .filter((r) => r.media_type === "movie" || r.media_type === "tv")
          .filter((r) => r.poster_path || r.backdrop_path)
          .filter((r) => {
            const t = ((r.title || r.name) || "").toLowerCase();
            return t.includes(lookup);
          });
        for (const extra of titleExtras) {
          const key = `${extra.media_type}-${extra.id}`;
          if (seenIds.has(key)) continue;
          // For movies require some traction; for TV allow upcoming
          // releases (first_air_date set, even if no votes yet) so the
          // new HBO Harry Potter series shows up before it airs.
          if (extra.media_type === "movie") {
            if ((extra.vote_count || 0) < 50 && (extra.popularity || 0) < 3) continue;
          } else {
            const hasDate = extra.first_air_date || extra.release_date;
            if (!hasDate && (extra.vote_count || 0) < 10) continue;
          }
          seenIds.add(key);
          fromCollections.push(extra);
        }

        // Sort: movies chronologically by release year, TV at the end.
        fromCollections.sort((a, b) => {
          const da = (a.release_date || a.first_air_date || "").slice(0, 4);
          const db = (b.release_date || b.first_air_date || "").slice(0, 4);
          if (a.media_type !== b.media_type) {
            return a.media_type === "movie" ? -1 : 1;
          }
          return da.localeCompare(db);
        });

        const filtered = fromCollections.filter((r) =>
          r.media_type === "movie" ? includeMovies : includeTv
        );
        if (filtered.length) {
          const topName = matchingCollections[0].name;
          return {
            mode: "concept",
            concept: { type: "collection", id: matchingCollections[0].id, name: topName },
            results: filtered
          };
        }
      }
    }
  }

  // 7) Fallback: plain title search. If still empty AND user
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

/**
 * Fetch a TMDB list endpoint across N pages and merge/dedupe results.
 */
async function fetchPaged(path, baseParams, pages, mediaType, ttl) {
  const responses = await Promise.all(
    pages.map((p) =>
      tmdbGet(path, { ...baseParams, page: p }, ttl).catch(() => ({ results: [] }))
    )
  );
  const seen = new Set();
  const merged = [];
  for (const r of responses) {
    for (const item of r.results || []) {
      if (!item.poster_path && !item.backdrop_path) continue;
      const mt = item.media_type || mediaType;
      if (mt !== "movie" && mt !== "tv") continue;
      const key = `${mt}-${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...item, media_type: mt });
    }
  }
  return merged;
}

// Discover hub fetches 5 TMDB pages for ~100 titles per tab.
const DISCOVER_PAGES = [1, 2, 3, 4, 5];

app.get("/api/trending", async (req, res) => {
  const window = req.query.window === "day" ? "day" : "week";
  try {
    const results = await fetchPaged(
      `/trending/all/${window}`,
      {},
      DISCOVER_PAGES,
      null,
      1000 * 60 * 30
    );
    res.json({ results });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * "Most Watched" tab. TMDB doesn't expose actual watch counts, so we
 * use vote_count.desc as a proxy: the films/shows with the highest
 * number of user ratings are by definition the most-watched ones.
 * This surfaces the cultural blockbusters (Avatar, Endgame, Titanic,
 * Dark Knight, Inception, Shawshank...) instead of "trending right
 * now" noise.
 */
app.get("/api/popular/:mediaType", async (req, res) => {
  const { mediaType } = req.params;
  if (mediaType !== "movie" && mediaType !== "tv") {
    return res.status(400).json({ error: "mediaType must be 'movie' or 'tv'." });
  }
  try {
    const results = await fetchPaged(
      `/discover/${mediaType}`,
      {
        sort_by: "vote_count.desc",
        "vote_count.gte": 1000,
        include_adult: "false",
        ...(mediaType === "movie" ? { include_video: "false" } : {})
      },
      DISCOVER_PAGES,
      mediaType,
      1000 * 60 * 60
    );
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
  try {
    const results = await fetchPaged(
      `/${mediaType}/top_rated`,
      {},
      DISCOVER_PAGES,
      mediaType,
      1000 * 60 * 60
    );
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
