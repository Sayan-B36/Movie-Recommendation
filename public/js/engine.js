import {
  discoverMedia,
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
    .filter((item) => (filters.dubbedOnly ? item.dub.available : true))
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

  let similarBasic = [];
  try {
    const recs = await getRecommendations(mediaType, seed.id);
    similarBasic = recs.results || [];
  } catch {
    similarBasic = [];
  }

  // If TMDB recs are weak, fall back to /details.similar
  if (similarBasic.length < 6) {
    try {
      const det = await getMediaDetails(mediaType, seed.id);
      const fromDetail = det?.similar?.results || [];
      const seen = new Set(similarBasic.map((s) => s.id));
      fromDetail.forEach((s) => {
        if (!seen.has(s.id)) {
          similarBasic.push(s);
          seen.add(s.id);
        }
      });
    } catch {
      /* ignore */
    }
  }

  const candidates = [seed, ...similarBasic.map((s) => normalizeResult(s, mediaType))]
    .filter((item) => item.poster_path || item.backdrop_path)
    .slice(0, RESULT_LIMITS.preEnrichment);

  // De-dupe just in case
  const seen = new Set();
  const unique = candidates.filter((item) => {
    const k = `${item.media_type}-${item.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const enriched = await Promise.all(unique.map((item) => enrichItem(item, filters)));

  // Keep the seed pinned at index 0; rank the rest by enriched score.
  const [seedEnriched, ...rest] = enriched;
  const ranked = rest.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  const final = [seedEnriched, ...ranked].slice(0, RESULT_LIMITS.final);
  return { seed: seedEnriched, results: final };
}
