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
 * Search by title, then return [seedTitle, ...similarTitles] enriched with
 * platforms / IMDb ratings so the user can play the trailer and see where
 * it streams. Falls back from /recommendations to /similar if needed.
 */
export async function searchByTitle(query, filters) {
  const q = (query || "").trim();
  if (!q) return { seed: null, results: [] };

  const { results: matches } = await searchTitles(q);
  if (!matches.length) return { seed: null, results: [] };

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
  return { seed: seedEnriched, results: final, collection };
}

/* ==========================================================================
 * Endless scrolling helpers
 * ==========================================================================
 * Both functions return additional enriched items to append after the
 * initial result set. They dedupe against `existingIds` so the UI never
 * shows the same title twice. An empty array signals "no more pages".
 */

const LOAD_MORE_BATCH = 12;

export async function loadMoreRecommendations(filters, page, existingIds) {
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

  // Dedupe against what's already on screen + dedupe among themselves
  const seen = new Set();
  const fresh = basic
    .filter((item) => item.poster_path || item.backdrop_path)
    .filter((item) => {
      const key = `${item.media_type}-${item.id}`;
      if (existingIds.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (!fresh.length) return [];

  const ranked = fresh
    .map((item) => ({ ...item, matchScore: scoreTitle(item, profile, filters) }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, LOAD_MORE_BATCH);

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
  let basic = [];
  try {
    const recs = await getRecommendations(seed.media_type, seed.id, page);
    basic = (recs?.results || []).map((s) => normalizeResult(s, seed.media_type));
  } catch {
    return [];
  }

  const seen = new Set();
  const fresh = basic
    .filter((item) => item.poster_path || item.backdrop_path)
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
