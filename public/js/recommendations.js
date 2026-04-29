import {
  genreNames,
  industryOptions,
  languageOptions,
  platformOptions,
  preferenceGroups
} from "./data.js";

const groupWeights = { mood: 4, climate: 2, time: 2, occasion: 3 };

export function getLanguageLabel(value) {
  return (
    languageOptions.find((item) => item.value === value)?.label ||
    value?.toUpperCase() ||
    "Any"
  );
}

export function getPlatformLabel(value) {
  return (
    platformOptions.find((item) => item.value === String(value))?.label ||
    "Selected platform"
  );
}

export function getIndustry(filters) {
  return (
    industryOptions.find((item) => item.value === filters.industry) ||
    industryOptions[0]
  );
}

export function detectTimeValue(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "late-night";
}

function addGenreWeights(target, genres = [], weight) {
  genres.forEach((genreId) => {
    target[genreId] = (target[genreId] || 0) + weight;
  });
}

export function buildPreferenceProfile(filters) {
  const profile = {
    movieGenreWeights: {},
    tvGenreWeights: {},
    minRating: Number(filters.minRating || 0),
    maxRuntime: null,
    activeValues: {},
    industry: getIndustry(filters)
  };

  Object.entries(preferenceGroups).forEach(([groupKey, group]) => {
    const value =
      groupKey === "time" && filters.time === "auto"
        ? detectTimeValue()
        : filters[groupKey];
    profile.activeValues[groupKey] = value;
    const option = group.options.find((item) => item.value === value);
    if (!option) return;
    const weight = groupWeights[groupKey] || 1;
    addGenreWeights(profile.movieGenreWeights, option.movieGenres, weight);
    addGenreWeights(profile.tvGenreWeights, option.tvGenres, weight);
    if (option.minRating) profile.minRating = Math.max(profile.minRating, option.minRating);
    if (option.maxRuntime) {
      profile.maxRuntime = profile.maxRuntime
        ? Math.min(profile.maxRuntime, option.maxRuntime)
        : option.maxRuntime;
    }
  });

  if (profile.industry.movieGenres) addGenreWeights(profile.movieGenreWeights, profile.industry.movieGenres, 3);
  if (profile.industry.tvGenres) addGenreWeights(profile.tvGenreWeights, profile.industry.tvGenres, 3);

  return profile;
}

export function getDiscoverGenres(profile, mediaType) {
  const weights = mediaType === "tv" ? profile.tvGenreWeights : profile.movieGenreWeights;
  return Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([genreId]) => genreId);
}

function getRecencyScore(item) {
  const year = Number(getYear(item));
  if (!year) return 0;
  if (year >= new Date().getFullYear() - 2) return 4;
  if (year >= 2016) return 2;
  if (year < 1990) return 1;
  return 0;
}

function getLanguageBoost(item, filters, profile) {
  let boost = 0;
  if (profile.industry.language && item.original_language === profile.industry.language) boost += 16;
  if (filters.dubLanguage && item.original_language === filters.dubLanguage) boost += 8;
  return boost;
}

export function scoreTitle(item, profile, filters) {
  const genreWeights = item.media_type === "tv" ? profile.tvGenreWeights : profile.movieGenreWeights;
  const genreScore = (item.genre_ids || []).reduce(
    (score, genreId) => score + (genreWeights[genreId] || 0),
    0
  );
  const popularity = Math.log10((item.popularity || 0) + 1) * 5;
  const rating = Number(item.vote_average || 0) * 3;
  const votes = Math.log10((item.vote_count || 0) + 1) * 2;
  const recency = getRecencyScore(item);
  const languageBoost = getLanguageBoost(item, filters, profile);
  const typeBoost = filters.type === "all" || filters.type === item.media_type ? 5 : 0;
  return genreScore * 12 + popularity + rating + votes + recency + languageBoost + typeBoost;
}

export function getYear(item) {
  return (item.release_date || item.first_air_date || item.Year || "").toString().slice(0, 4);
}

export function getTitle(item) {
  return item.title || item.name || item.original_title || item.original_name || "Untitled";
}

export function getMediaLabel(mediaType) {
  return mediaType === "tv" ? "Series" : "Movie";
}

export function getGenresText(item, limit = 3) {
  const genres =
    item.detail?.genres?.map((genre) => genre.name) ||
    item.genre_ids?.map((genreId) => genreNames[genreId]);
  return (genres || []).filter(Boolean).slice(0, limit).join(" / ") || "Genre pending";
}

export function extractPlatforms(detail, region) {
  const providers = detail?.["watch/providers"]?.results || {};
  const regionData =
    providers[region] || providers.IN || providers.US || providers[Object.keys(providers)[0]];
  if (!regionData) return [];
  const buckets = ["flatrate", "free", "ads", "rent", "buy"];
  const seen = new Set();
  return buckets
    .flatMap((bucket) =>
      (regionData[bucket] || []).map((provider) => ({ ...provider, bucket }))
    )
    .filter((provider) => {
      if (seen.has(provider.provider_id)) return false;
      seen.add(provider.provider_id);
      return true;
    });
}

export function inferDubStatus(item, language) {
  if (!language) {
    return {
      available: false,
      label: "Dub preference off",
      detail: "No preferred dub language selected."
    };
  }
  const languageLabel = getLanguageLabel(language);
  const translations = item.detail?.translations?.translations || [];
  const originalLanguage = item.original_language || item.detail?.original_language;
  const hasTranslation = translations.some((entry) => entry.iso_639_1 === language);
  if (originalLanguage === language) {
    return {
      available: true,
      label: `Original ${languageLabel}`,
      detail: `${languageLabel} is the original language for this title.`
    };
  }
  if (hasTranslation) {
    return {
      available: true,
      label: `${languageLabel} dub likely`,
      detail: `TMDB has ${languageLabel} localization metadata. Dub availability is best-effort.`
    };
  }
  return {
    available: false,
    label: `${languageLabel} dub unknown`,
    detail: `Free APIs do not confirm a ${languageLabel} dub for this title.`
  };
}

export function getTrailer(videos = [], preferredLanguage) {
  const youtube = videos.filter((v) => v.site === "YouTube");
  const trailers = youtube.filter((v) => v.type === "Trailer");
  const pool = trailers.length ? trailers : youtube;
  return (
    pool.find((v) => v.iso_639_1 === preferredLanguage && v.official) ||
    pool.find((v) => v.iso_639_1 === preferredLanguage) ||
    pool.find((v) => v.iso_639_1 === "en" && v.official) ||
    pool.find((v) => v.iso_639_1 === "en") ||
    pool[0]
  );
}

export function formatRuntime(item) {
  const runtime = item.detail?.runtime || item.detail?.episode_run_time?.[0];
  if (runtime) return `${runtime} min`;
  if (item.detail?.number_of_seasons) return `${item.detail.number_of_seasons} seasons`;
  return "Runtime pending";
}

export function isSelectedPlatformAvailable(item, platformId) {
  if (!platformId) return true;
  return item.platforms?.some(
    (provider) => String(provider.provider_id) === String(platformId)
  );
}

export function normalizeResult(item, mediaType) {
  return { ...item, media_type: item.media_type || mediaType };
}
