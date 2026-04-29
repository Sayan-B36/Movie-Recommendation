// All TMDB / OMDb traffic goes through our Express backend.
// The browser never sees the API keys.

export async function getStatus() {
  const r = await fetch("/api/status");
  return r.json();
}

export async function discoverMedia(mediaType, params) {
  const url = new URL(`/api/discover/${mediaType}`, window.location.origin);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  const r = await fetch(url);
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || `Discover failed (${r.status}).`);
  }
  return r.json();
}

export async function getMediaDetails(mediaType, id) {
  const r = await fetch(`/api/details/${mediaType}/${encodeURIComponent(id)}`);
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || `Details failed (${r.status}).`);
  }
  return r.json();
}

export async function searchTitles(query) {
  const q = (query || "").trim();
  if (!q) return { results: [] };
  const url = new URL("/api/search", window.location.origin);
  url.searchParams.set("q", q);
  const r = await fetch(url);
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || `Search failed (${r.status}).`);
  }
  return r.json();
}

export async function getSeasonDetail(tvId, seasonNumber) {
  const r = await fetch(
    `/api/season/${encodeURIComponent(tvId)}/${encodeURIComponent(seasonNumber)}`
  );
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || `Season detail failed (${r.status}).`);
  }
  return r.json();
}

export async function getCollection(collectionId) {
  if (!collectionId) return null;
  const r = await fetch(`/api/collection/${encodeURIComponent(collectionId)}`);
  if (!r.ok) return null;
  return r.json();
}

export async function getRecommendations(mediaType, id, page = 1) {
  const r = await fetch(
    `/api/recommendations/${mediaType}/${encodeURIComponent(id)}?page=${encodeURIComponent(page)}`
  );
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || `Recommendations failed (${r.status}).`);
  }
  return r.json();
}

export async function getOmdbTitle(imdbId) {
  if (!imdbId) return null;
  const url = new URL("/api/omdb", window.location.origin);
  url.searchParams.set("imdbId", imdbId);
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json();
}

export function imageUrl(path, size = "w500") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
}
