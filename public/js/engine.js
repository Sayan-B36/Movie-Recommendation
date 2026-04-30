import {
  discoverMedia,
  getCollection,
  getMediaDetails,
  getOmdbTitle,
  getRecommendations,
  searchTitles
} from "./api.js";
import { RESULT_LIMITS } from "./data.js";
import {
  buildPreferenceProfile,
  extractPlatforms,
  getDiscoverGenres,
  getIndustry,
  inferDubStatus,
  isSelectedPlatformAvailable,
  normalizeResult,
  scoreTitle
} from "./recommendations.js";

function buildDiscoverJobs(filters, profile) {
  const mediaTypes = filters.type === "all" ? ["movie", "tv"] : [filters.type];
  const industry = getIndustry(filters);
  const jobs = [];
  mediaTypes.forEach((mediaType) => {
    const genres = getDiscoverGenres(profile, mediaType);
    const seeds = genres.length ? genres : [""];
    seeds.forEach((genre) => {
      jobs.push({
        mediaType,
        promise: discoverMedia(mediaType, {
          genre,
          language: industry.language,
          platform: filters.platform,
          region: filters.region,
          minRating: profile.minRating,
          page: 1
        })
      });
    });
    if (genres[0]) {
      jobs.push({
        mediaType,
        promise: discoverMedia(mediaType, {
          genre: genres[0],
          language: industry.language,
          platform: filters.platform,
          region: filters.region,
          minRating: profile.minRating,
          page: 2
        })
      });
    }
  });
  return jobs;
}

function dedupeAndRank(basicResults, profile, filters) {
  const seen = new Set();
  return basicResults
    .filter((item) => item.poster_path || item.backdrop_path)
    .filter((item) => {
      const key = `${item.media_type}-${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => ({ ...item, matchScore: scoreTitle(item, profile, filters) }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, RESULT_LIMITS.preEnrichment);
}

async function enrichItem(item, filters) {
  try {
    const detail = await getMediaDetails(item.media_type, item.id);
    const platforms = extractPlatforms(detail, filters.region);
    const imdbId = detail.external_ids?.imdb_id;
    const omdb = await getOmdbTitle(imdbId).catch(() => null);
    const imdbRating =
      omdb?.imdbRating && omdb.imdbRating !== "N/A" ? omdb.imdbRating : null;
    const dub = inferDubStatus({ ...item, detail }, filters.dubLanguage);
    const enrichedScore =
      (item.matchScore || 0) +
      (dub.available ? 8 : 0) +
      (platforms.length ? 4 : 0) +
      (Number(imdbRating) ? Number(imdbRating) * 2 : 0);
    return {
      ...item,
      detail,
      platforms,
      omdb,
      imdbRating,
      dub,
      matchScore: enrichedScore
    };
  } catch {
    return {
      ...item,
      detail: null,
      platforms: [],
      omdb: null,
      imdbRating: null,
      dub: inferDubStatus(item, filters.dubLanguage)
    };
  }
}

export async function fetchRecommendations(filters) {
  const profile = buildPreferenceProfile(filters);
  const jobs = buildDiscoverJobs(filters, profile);

  const settled = await Promise.allSettled(jobs.map((job) => job.promise));
  const basicResults = settled.flatMap((result, index) => {
    if (result.status !== "fulfilled") return [];
    return (result.value.results || []).map((item) =>
      normalizeResult(item, jobs[index].mediaType)
    );
  });

  if (!basicResults.length && settled.some((r) => r.status === "rejected")) {
    throw settled.find((r) => r.status === "rejected").reason;
  }

  const ranked = dedupeAndRank(basicResults, profile, filters);
  const enriched = await Promise.all(ranked.map((item) => enrichItem(item, filters)));

  return enriched
    .filter((item) =>
      filters.dubbedOnly && filters.dubLanguage ? item.dub.available : true
    )
    .filter((item) => isSelectedPlatformAvailable(item, filters.platform))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, RESULT_LIMITS.final);
}

/**
 * Search by query, returns either:
 *  - title mode: { mode:"title", seed, results:[seed, ...collection, ...similar] }
 *  - concept mode (genre/keyword/person): { mode:"concept", seed:null, concept, results:[...] }
 *
 * Title mode pins a seed and uses /recommendations for "more like this".
 * Concept mode treats the smart-search response like discover output and
 * lets `loadMoreConcept` paginate via /api/search?page=N.
 */
export async function searchByTitle(query, filters) {
  const q = (query || "").trim();
  if (!q) return { seed: null, results: [], mode: "title", concept: null };

  const data = await searchTitles(q);
  const matches = data.results || [];
  const mode = data.mode || "title";
  const concept = data.concept || null;
  if (!matches.length) {
    return { seed: null, results: [], mode, concept };
  }

  // ---- Concept mode (no seed pinning) ----
  if (mode === "concept") {
    const candidates = matches
      .filter((m) => m.poster_path || m.backdrop_path)
      .slice(0, RESULT_LIMITS.preEnrichment)
      .map((m) => normalizeResult(m, m.media_type || "movie"));

    const seen = new Set();
    const unique = candidates.filter((item) => {
      const k = `${item.media_type}-${item.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const enriched = await Promise.all(unique.map((item) => enrichItem(item, filters)));
    const minRating = Number(filters.minRating || 0);
    const final = enriched
      .filter((item) => (item.vote_average || 0) >= minRating)
      .filter((item) =>
        filters.dubbedOnly && filters.dubLanguage ? item.dub.available : true
      )
      .filter((item) => isSelectedPlatformAvailable(item, filters.platform))
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, RESULT_LIMITS.final);

    return { seed: null, results: final, mode: "concept", concept, collection: null };
  }

  // ---- Title mode: existing seed + similar + collection flow ----
  const seedRaw = matches[0];
  const mediaType = seedRaw.media_type;
  const seed = normalizeResult(seedRaw, mediaType);

  // Fetch seed details up-front so we can detect movie collections
  // (e.g. "My Fault" -> Culpa Mia trilogy) and grab seasons for TV.
  let seedDetail = null;
  try {
    seedDetail = await getMediaDetails(mediaType, seed.id);
  } catch {
    seedDetail = null;
  }

  // 1) Collection parts (movies in the same franchise).
  let collectionParts = [];
  let collection = null;
  if (mediaType === "movie" && seedDetail?.belongs_to_collection?.id) {
    try {
      collection = await getCollection(seedDetail.belongs_to_collection.id);
      collectionParts = (collection?.parts || [])
        .filter((p) => p.id !== seed.id)
        .map((p) => normalizeResult(p, "movie"));
    } catch {
      /* ignore */
    }
  }

  // 2) TMDB /recommendations
  let similarBasic = [];
  try {
    const recs = await getRecommendations(mediaType, seed.id);
    similarBasic = recs.results || [];
  } catch {
    similarBasic = [];
  }

  // 3) Fallback to /details.similar if recs are weak
  if (similarBasic.length < 6 && seedDetail?.similar?.results) {
    const seenIds = new Set(similarBasic.map((s) => s.id));
    seedDetail.similar.results.forEach((s) => {
      if (!seenIds.has(s.id)) {
        similarBasic.push(s);
        seenIds.add(s.id);
      }
    });
  }

  // Compose candidates: [seed, ...collectionParts, ...similar]
  // Collection parts are tagged so the UI can label them.
  const taggedCollectionParts = collectionParts.map((p) => ({
    ...p,
    isCollectionPart: true,
    collectionName: collection?.name || seedDetail?.belongs_to_collection?.name || ""
  }));

  const similarNormalized = similarBasic.map((s) => normalizeResult(s, mediaType));

  const seedTagged = collection
    ? {
        ...seed,
        isCollectionPart: true,
        collectionName: collection?.name || seedDetail?.belongs_to_collection?.name || ""
      }
    : seed;

  const candidates = [seedTagged, ...taggedCollectionParts, ...similarNormalized]
    .filter((item) => item.poster_path || item.backdrop_path)
    .slice(0, RESULT_LIMITS.preEnrichment);

  // De-dupe (seed could appear inside similarBasic occasionally)
  const seen = new Set();
  const unique = candidates.filter((item) => {
    const k = `${item.media_type}-${item.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const enriched = await Promise.all(unique.map((item) => enrichItem(item, filters)));

  // Pin seed first. Then collection parts (sorted by release date asc -
  // part 1, part 2, part 3...), then similar by score.
  const seedEnriched = enriched[0];
  const collectionEnriched = enriched
    .slice(1)
    .filter((it) => it.isCollectionPart)
    .sort((a, b) => {
      const ay = Number((a.release_date || "0").slice(0, 4)) || 0;
      const by = Number((b.release_date || "0").slice(0, 4)) || 0;
      return ay - by;
    });
  const similarEnriched = enriched
    .slice(1)
    .filter((it) => !it.isCollectionPart)
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  const final = [seedEnriched, ...collectionEnriched, ...similarEnriched].slice(
    0,
    RESULT_LIMITS.final
  );
  return { seed: seedEnriched, results: final, collection, mode: "title", concept: null };
}

/**
 * Page through concept-mode search results (genre/keyword/person)
 * by re-querying /api/search with an incrementing page. Stops when
 * the server runs out of fresh, in-budget items.
 */
export async function loadMoreConcept(query, filters, page, existingIds) {
  if (page > MAX_LOAD_MORE_PAGES + 2) return [];
  let data;
  try {
    data = await searchTitles(query, page);
  } catch {
    return [];
  }
  if (!data || data.mode !== "concept") return [];

  const seen = new Set();
  const minRating = Number(filters.minRating || 0);
  const fresh = (data.results || [])
    .filter((item) => item.poster_path || item.backdrop_path)
    .filter((item) => (item.vote_count || 0) >= VOTE_COUNT_FLOOR)
    .filter((item) => (item.vote_average || 0) >= minRating)
    .map((item) => normalizeResult(item, item.media_type || "movie"))
    .filter((item) => {
      const key = `${item.media_type}-${item.id}`;
      if (existingIds.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, LOAD_MORE_BATCH);

  if (!fresh.length) return [];

  const enriched = await Promise.all(fresh.map((item) => enrichItem(item, filters)));
  return enriched
    .filter((item) =>
      filters.dubbedOnly && filters.dubLanguage ? item.dub.available : true
    )
    .filter((item) => isSelectedPlatformAvailable(item, filters.platform))
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
}

/* ==========================================================================
 * Endless scrolling helpers
 * ==========================================================================
 * Both helpers append more enriched items beyond the initial set. They
 * enforce relevance gates so the user never sees padding:
 *   - Filter mode: items must clear the user's minRating + a vote-count
 *     floor + the active genre weights (matchScore > 0).
 *   - Search mode: items must share at least one genre with the seed AND
 *     clear a vote-count floor.
 * They dedupe against `existingIds` so the same title never repeats.
 * Returning [] signals "no more relevant matches" and the UI stops loading.
 */

const LOAD_MORE_BATCH = 12;
const VOTE_COUNT_FLOOR = 40; // skip obscure / unverified titles
const MAX_LOAD_MORE_PAGES = 8; // hard cap so we never scrape forever

export async function loadMoreRecommendations(filters, page, existingIds) {
  if (page > MAX_LOAD_MORE_PAGES + 2) return [];

  const profile = buildPreferenceProfile(filters);
  const mediaTypes = filters.type === "all" ? ["movie", "tv"] : [filters.type];
  const industry = getIndustry(filters);

  const jobs = [];
  mediaTypes.forEach((mediaType) => {
    const genres = getDiscoverGenres(profile, mediaType);
    const seeds = genres.length ? genres.slice(0, 2) : [""];
    seeds.forEach((genre) => {
      jobs.push({
        mediaType,
        promise: discoverMedia(mediaType, {
          genre,
          language: industry.language,
          platform: filters.platform,
          region: filters.region,
          minRating: profile.minRating,
          page
        })
      });
    });
  });

  const settled = await Promise.allSettled(jobs.map((j) => j.promise));
  const basic = settled.flatMap((result, idx) => {
    if (result.status !== "fulfilled") return [];
    return (result.value.results || []).map((item) =>
      normalizeResult(item, jobs[idx].mediaType)
    );
  });

  // Stage 1: cheap relevance filter (no enrichment yet)
  const seen = new Set();
  const minRating = Number(filters.minRating || 0);
  const fresh = basic
    .filter((item) => item.poster_path || item.backdrop_path)
    .filter((item) => (item.vote_count || 0) >= VOTE_COUNT_FLOOR)
    .filter((item) => (item.vote_average || 0) >= minRating)
    .filter((item) => {
      const key = `${item.media_type}-${item.id}`;
      if (existingIds.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (!fresh.length) return [];

  // Stage 2: rank by user profile, drop anything that doesn't actually
  // align with their mood/genre/etc. (matchScore must include genre signal)
  const ranked = fresh
    .map((item) => ({ ...item, matchScore: scoreTitle(item, profile, filters) }))
    .filter((item) => hasRelevantGenreOverlap(item, profile))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, LOAD_MORE_BATCH);

  if (!ranked.length) return [];

  const enriched = await Promise.all(ranked.map((item) => enrichItem(item, filters)));

  return enriched
    .filter((item) =>
      filters.dubbedOnly && filters.dubLanguage ? item.dub.available : true
    )
    .filter((item) => isSelectedPlatformAvailable(item, filters.platform))
    .sort((a, b) => b.matchScore - a.matchScore);
}

export async function loadMoreSimilar(seed, filters, page, existingIds) {
  if (!seed) return [];
  if (page > MAX_LOAD_MORE_PAGES + 1) return [];

  let basic = [];
  try {
    const recs = await getRecommendations(seed.media_type, seed.id, page);
    basic = (recs?.results || []).map((s) => normalizeResult(s, seed.media_type));
  } catch {
    return [];
  }

  // Build the seed's genre set once (genre_ids on the search result OR
  // the genres array on the enriched detail).
  const seedGenres = new Set([
    ...(seed.genre_ids || []),
    ...((seed.detail?.genres || []).map((g) => g.id))
  ]);

  const seen = new Set();
  const fresh = basic
    .filter((item) => item.poster_path || item.backdrop_path)
    .filter((item) => (item.vote_count || 0) >= VOTE_COUNT_FLOOR)
    .filter((item) => {
      // Must share at least one genre with the seed - this is what stops
      // the scroll from drifting into unrelated popular titles.
      if (seedGenres.size === 0) return true;
      const itemGenres = item.genre_ids || [];
      return itemGenres.some((g) => seedGenres.has(g));
    })
    .filter((item) => {
      const key = `${item.media_type}-${item.id}`;
      if (existingIds.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, LOAD_MORE_BATCH);

  if (!fresh.length) return [];

  const enriched = await Promise.all(fresh.map((item) => enrichItem(item, filters)));
  return enriched
    .filter((item) =>
      filters.dubbedOnly && filters.dubLanguage ? item.dub.available : true
    )
    .filter((item) => isSelectedPlatformAvailable(item, filters.platform));
}

/**
 * True if `item.genre_ids` overlaps with at least one genre carrying
 * non-zero weight in the user's preference profile. Prevents Discover's
 * later pages from injecting titles whose genres don't align with the
 * user's mood/genre selection.
 */
function hasRelevantGenreOverlap(item, profile) {
  const weights =
    item.media_type === "tv" ? profile.tvGenreWeights : profile.movieGenreWeights;
  const weightedGenres = Object.keys(weights);
  if (!weightedGenres.length) return true; // no profile constraint -> allow
  const itemGenres = (item.genre_ids || []).map(String);
  return itemGenres.some((g) => weights[g] > 0);
}
