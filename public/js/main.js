import {
  getDiscoverList,
  getMediaDetails,
  getStatus,
  imageUrl,
  searchTitles
} from "./api.js";
import {
  fetchRecommendations,
  loadMoreConcept,
  loadMoreRecommendations,
  loadMoreSimilar,
  searchByTitle
} from "./engine.js";
import { renderIcons } from "./icons.js";
import { setFilter, state } from "./state.js";
import { openDetailModal } from "./modal.js";
import {
  extractPlatforms,
  getMediaLabel,
  getTitle,
  getYear,
  inferDubStatus
} from "./recommendations.js";
import {
  renderApiPill,
  renderChoiceStack,
  renderDiscoverHub,
  renderError,
  renderFilters,
  renderRefreshButton,
  renderResults,
  renderRunButton,
  renderSelectionLine,
  renderShowcase,
  renderSortField
} from "./render.js";

/* ---------------- Endless scroll ---------------- */

let footerObserver = null;
let lastObservedFooter = null;

async function loadMore() {
  if (state.loading || state.loadingMore || !state.canLoadMore) return;
  state.loadingMore = true;
  rerender();

  const existingIds = new Set(
    state.results.map((r) => `${r.media_type}-${r.id}`)
  );

  let newItems = [];
  try {
    if (state.mode === "search" && state.searchMode === "concept") {
      newItems = await loadMoreConcept(
        state.searchQuery,
        state.filters,
        state.page,
        existingIds
      );
    } else if (state.mode === "search") {
      newItems = await loadMoreSimilar(
        state.searchSeed,
        state.filters,
        state.page,
        existingIds
      );
    } else {
      newItems = await loadMoreRecommendations(
        state.filters,
        state.page,
        existingIds
      );
    }
  } catch (err) {
    console.warn("loadMore failed", err);
  }

  if (newItems.length) {
    // Re-order the merged list so franchise members from the new page
    // slot next to existing parts (Iron Man 2 lands after Iron Man 1
    // even when it arrives via load-more).
    state.results = orderResults([...state.results, ...newItems], state.filters.sortBy);
    state.page += 1;
  } else {
    // No fresh items returned; assume the catalog is exhausted.
    state.canLoadMore = false;
  }
  state.loadingMore = false;
  rerender();
}

/* ---------------- Sort ---------------- */

function sortResults(items, sortBy) {
  const arr = [...items];
  switch (sortBy) {
    case "popularity":
      return arr.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    case "rating":
      return arr.sort((a, b) => {
        const aR = Number(a.imdbRating) || a.vote_average || 0;
        const bR = Number(b.imdbRating) || b.vote_average || 0;
        return bR - aR;
      });
    case "trending":
      // approximate: weight popularity + recent vote count
      return arr.sort(
        (a, b) =>
          (b.popularity || 0) * 0.7 + Math.log10((b.vote_count || 0) + 1) * 5 -
          ((a.popularity || 0) * 0.7 + Math.log10((a.vote_count || 0) + 1) * 5)
      );
    case "year":
      return arr.sort((a, b) => Number(getYear(b) || 0) - Number(getYear(a) || 0));
    case "match":
    default:
      return arr.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  }
}

/**
 * Pull movies that belong to the same TMDB collection (Marvel, Harry
 * Potter, Fast & Furious, Conjuring, etc.) into a contiguous block,
 * placed at the earliest member's current position, ordered by release
 * date ascending so the user sees Part 1 -> Part 2 -> Part 3 instead
 * of a random middle entry. Single-member collections are left alone.
 * TV series are skipped because TMDB models seasons inside one show
 * (the modal already shows seasons sequentially).
 */
function groupFranchises(items) {
  if (!Array.isArray(items) || items.length < 2) return items;

  const groups = new Map(); // collectionId -> { firstIndex, members: [] }
  items.forEach((item, idx) => {
    if (item.media_type !== "movie") return;
    const cid = item.detail?.belongs_to_collection?.id;
    if (!cid) return;
    if (!groups.has(cid)) {
      groups.set(cid, { firstIndex: idx, members: [] });
    }
    groups.get(cid).members.push(item);
  });

  // Drop groups with fewer than 2 members - nothing to "sequence".
  for (const [cid, g] of groups) {
    if (g.members.length < 2) {
      groups.delete(cid);
    } else {
      g.members.sort((a, b) => {
        const ay = a.release_date || a.first_air_date || "9999-99-99";
        const by = b.release_date || b.first_air_date || "9999-99-99";
        return ay.localeCompare(by);
      });
    }
  }

  if (groups.size === 0) return items;

  const out = [];
  const placed = new Set();
  items.forEach((item, idx) => {
    const key = `${item.media_type}-${item.id}`;
    if (placed.has(key)) return;
    const cid = item.detail?.belongs_to_collection?.id;
    if (cid && groups.has(cid)) {
      // Only emit the whole ordered group when we reach its earliest
      // member; later members get skipped via the placed set.
      if (groups.get(cid).firstIndex === idx) {
        for (const member of groups.get(cid).members) {
          const k = `${member.media_type}-${member.id}`;
          if (!placed.has(k)) {
            out.push(member);
            placed.add(k);
          }
        }
      }
      return;
    }
    out.push(item);
    placed.add(key);
  });
  return out;
}

function orderResults(items, sortBy) {
  return groupFranchises(sortResults(items, sortBy));
}

function applySortToState() {
  state.results = orderResults(state.results, state.filters.sortBy);
}

function observeResultsFooter() {
  // Lazily set up the IntersectionObserver once.
  if (!footerObserver && "IntersectionObserver" in window) {
    footerObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            loadMore();
          }
        }
      },
      { rootMargin: "300px 0px" } // start loading slightly before footer hits viewport
    );
  }
  if (!footerObserver) return;

  // Re-target observer on every render (footer element is replaced each time).
  if (lastObservedFooter) {
    footerObserver.unobserve(lastObservedFooter);
    lastObservedFooter = null;
  }
  const footer = document.getElementById("results-footer");
  if (footer && state.canLoadMore && !state.loadingMore) {
    footerObserver.observe(footer);
    lastObservedFooter = footer;
  }
}

function rerender() {
  renderApiPill(state.apiReady);
  renderChoiceStack({ filters: state.filters, onChange: handleFilterChange });
  renderSelectionLine(state.filters);
  renderRunButton({ loading: state.loading });
  renderShowcase({
    featured: state.results[0],
    filters: state.filters,
    apiReady: state.apiReady,
    onOpenFeatured: () => state.results[0] && openModal(state.results[0])
  });
  renderFilters({ filters: state.filters, onChange: handleFilterChange });
  ["movie", "tv"].forEach((mt) => {
    const slice = state.discover[mt];
    renderDiscoverHub({
      mediaType: mt,
      tab: slice.tab,
      industry: slice.industry,
      items: slice.items,
      loading: slice.loading,
      onSelect: openModal,
      onTabChange: (tab) => handleDiscoverTabChange(mt, tab),
      onIndustryChange: (industry) => handleDiscoverIndustryChange(mt, industry)
    });
  });
  renderResults({
    loading: state.loading,
    results: state.results,
    hasSearched: state.hasSearched,
    mode: state.mode,
    searchQuery: state.searchQuery,
    searchSeed: state.searchSeed,
    searchConcept: state.searchConcept,
    loadingMore: state.loadingMore,
    canLoadMore: state.canLoadMore,
    onSelect: openModal
  });
  renderSortField({
    sortBy: state.filters.sortBy,
    visible: state.hasSearched && state.results.length > 0,
    onChange: handleSortChange
  });
  renderError(state.error);
  renderRefreshButton({ loading: state.loading, apiReady: state.apiReady });
  observeResultsFooter();
}

function handleSortChange(value) {
  setFilter("sortBy", value);
  applySortToState();
  rerender();
}

/* ---------------- Discover hub ---------------- */

function discoverCacheKey(list, industry) {
  return `${list}:${industry}`;
}

async function handleDiscoverTabChange(mediaType, tab) {
  const slice = state.discover[mediaType];
  if (slice.tab === tab && slice.items.length) return;
  slice.tab = tab;
  await loadDiscoverTab(mediaType);
}

async function handleDiscoverIndustryChange(mediaType, industry) {
  const slice = state.discover[mediaType];
  if (slice.industry === industry) return;
  slice.industry = industry;
  await loadDiscoverTab(mediaType);
}

async function loadDiscoverTab(mediaType) {
  const slice = state.discover[mediaType];
  const key = discoverCacheKey(slice.tab, slice.industry);
  // Serve from cache if available
  if (slice.cache[key]?.length) {
    slice.items = slice.cache[key];
    slice.loading = false;
    rerender();
    return;
  }
  slice.loading = true;
  slice.items = [];
  rerender();
  try {
    const data = await getDiscoverList(slice.tab, mediaType, slice.industry);
    const items = data.results || [];
    slice.cache[key] = items;
    slice.items = items;
  } catch (e) {
    console.warn(`discover ${mediaType} load failed`, e);
    slice.items = [];
  } finally {
    slice.loading = false;
    rerender();
  }
}

async function openModal(item) {
  // If `item.detail` is missing (e.g. clicked from a similar/collection card),
  // fetch the details so trailer/platforms/seasons all populate.
  let enriched = item;
  if (!item.detail) {
    try {
      const detail = await getMediaDetails(item.media_type, item.id);
      const platforms = extractPlatforms(detail, state.filters.region);
      const dub = inferDubStatus({ ...item, detail }, state.filters.dubLanguage);
      enriched = { ...item, detail, platforms, dub };
    } catch {
      // fall through with whatever we have
    }
  }
  openDetailModal({
    item: enriched,
    filters: state.filters,
    onSelectSimilar: openModal // recursive
  });
}

function handleFilterChange(name, value) {
  setFilter(name, value);
  // Lightweight re-render: just refresh choice chips, selection line, filters band.
  renderChoiceStack({ filters: state.filters, onChange: handleFilterChange });
  renderSelectionLine(state.filters);
  renderFilters({ filters: state.filters, onChange: handleFilterChange });
  renderShowcase({
    featured: state.results[0],
    filters: state.filters,
    apiReady: state.apiReady,
    onOpenFeatured: () => state.results[0] && openModal(state.results[0])
  });
}

async function run() {
  if (!state.apiReady) {
    state.error = "TMDB key is not configured on the server. Edit .env and restart.";
    renderError(state.error);
    return;
  }
  state.mode = "mood";
  state.searchSeed = null;
  state.searchConcept = null;
  state.searchMode = "title";
  state.loading = true;
  state.error = "";
  state.hasSearched = true;
  state.page = 3; // pages 1+2 are consumed by the initial fetch
  state.canLoadMore = false;
  state.loadingMore = false;
  renderError("");
  renderRunButton({ loading: true });
  renderResults({ loading: true, results: [], hasSearched: true, onSelect: () => {} });
  renderRefreshButton({ loading: true, apiReady: state.apiReady });

  try {
    const finalResults = await fetchRecommendations(state.filters);
    state.results = orderResults(finalResults, state.filters.sortBy);
    state.canLoadMore = finalResults.length > 0;
  } catch (error) {
    state.results = [];
    state.error = error?.message || "Could not load recommendations.";
    state.canLoadMore = false;
  } finally {
    state.loading = false;
    rerender();
  }
}

async function runSearch(query) {
  const q = (query || "").trim();
  if (!q) return;
  if (!state.apiReady) {
    state.error = "TMDB key is not configured on the server. Edit .env and restart.";
    renderError(state.error);
    return;
  }
  state.mode = "search";
  state.searchQuery = q;
  state.loading = true;
  state.error = "";
  state.hasSearched = true;
  state.page = 2; // page 1 already consumed by initial searchByTitle()
  state.canLoadMore = false;
  state.loadingMore = false;
  hideSuggestions();
  renderError("");
  renderResults({ loading: true, results: [], hasSearched: true, onSelect: () => {} });
  renderRefreshButton({ loading: true, apiReady: state.apiReady });

  try {
    const { seed, results, mode: searchMode, concept } = await searchByTitle(
      q,
      state.filters
    );
    state.searchSeed = seed;
    state.searchMode = searchMode || "title";
    state.searchConcept = concept || null;
    state.results = orderResults(results, state.filters.sortBy);
    // Concept results paginate via /api/search?page=N (so even without a seed
    // we have endless scroll). Title results paginate via /recommendations.
    state.canLoadMore =
      results.length > 0 && (state.searchMode === "concept" || Boolean(seed));
    if (!results.length) {
      state.error = `No matches found for "${q}".`;
    }
  } catch (error) {
    state.results = [];
    state.searchSeed = null;
    state.searchConcept = null;
    state.searchMode = "title";
    state.canLoadMore = false;
    state.error = error?.message || "Search failed.";
  } finally {
    state.loading = false;
    rerender();
  }
}

/* ---------------- Live search suggestions ---------------- */

let suggestTimer = null;
let suggestionItems = [];

function hideSuggestions() {
  const root = document.getElementById("search-suggestions");
  if (!root) return;
  root.hidden = true;
  root.replaceChildren();
  suggestionItems = [];
}

function renderSuggestions(items) {
  const root = document.getElementById("search-suggestions");
  if (!root) return;
  suggestionItems = items;
  if (!items.length) {
    hideSuggestions();
    return;
  }
  root.innerHTML = items
    .slice(0, 8)
    .map((item, idx) => {
      const poster = item.poster_path ? imageUrl(item.poster_path, "w92") : "";
      return `
        <button type="button" class="suggestion-item" data-idx="${idx}" role="option">
          ${
            poster
              ? `<img src="${poster}" alt="" loading="lazy" />`
              : `<div class="suggestion-thumb-fallback"></div>`
          }
          <div class="suggestion-meta">
            <strong>${escapeText(getTitle(item))}</strong>
            <span>${escapeText(getMediaLabel(item.media_type))} / ${escapeText(getYear(item) || "—")}</span>
          </div>
        </button>
      `;
    })
    .join("");
  root.hidden = false;
  root.querySelectorAll(".suggestion-item").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      // mousedown fires before input blur, so the click registers
      e.preventDefault();
      const idx = Number(btn.dataset.idx);
      const picked = suggestionItems[idx];
      if (!picked) return;
      const input = document.getElementById("search-input");
      input.value = getTitle(picked);
      runSearch(getTitle(picked));
    });
  });
}

function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function handleSearchInput(value) {
  const clearBtn = document.getElementById("search-clear");
  if (clearBtn) clearBtn.hidden = !value;

  if (suggestTimer) clearTimeout(suggestTimer);
  const q = value.trim();
  if (q.length < 2) {
    hideSuggestions();
    return;
  }
  suggestTimer = setTimeout(async () => {
    try {
      const { results } = await searchTitles(q);
      // Only render if input still matches (race guard)
      const current = document.getElementById("search-input")?.value.trim();
      if (current === q) renderSuggestions(results || []);
    } catch {
      hideSuggestions();
    }
  }, 220);
}

async function init() {
  // Render initial UI before API check completes so the page never looks empty.
  renderIcons(document);
  rerender();

  // Wire global buttons
  document.getElementById("run-button").addEventListener("click", run);
  document.getElementById("refresh-button").addEventListener("click", () => {
    if (state.mode === "search" && state.searchQuery) runSearch(state.searchQuery);
    else run();
  });

  // Wire search form
  const searchForm = document.getElementById("search-form");
  const searchInput = document.getElementById("search-input");
  const searchClear = document.getElementById("search-clear");
  if (searchForm && searchInput) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      runSearch(searchInput.value);
    });
    searchInput.addEventListener("input", (e) => handleSearchInput(e.target.value));
    searchInput.addEventListener("focus", () => {
      if (suggestionItems.length) {
        document.getElementById("search-suggestions").hidden = false;
      }
    });
    searchInput.addEventListener("blur", () => {
      // Slight delay so suggestion mousedown can fire first.
      setTimeout(hideSuggestions, 120);
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        hideSuggestions();
      }
    });
    if (searchClear) {
      searchClear.addEventListener("click", () => {
        searchInput.value = "";
        searchClear.hidden = true;
        hideSuggestions();
        searchInput.focus();
      });
    }
  }

  try {
    const status = await getStatus();
    state.apiReady = Boolean(status.tmdb);
    if (!state.apiReady) {
      state.error = "Server is missing TMDB_KEY. Add it to .env and restart `npm start`.";
    }
  } catch {
    state.apiReady = false;
    state.error = "Could not reach the MoodFlix backend.";
  }
  rerender();

  // Kick off both discover hubs once we know TMDB is reachable.
  if (state.apiReady) {
    loadDiscoverTab("movie");
    loadDiscoverTab("tv");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
