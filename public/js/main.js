import { getMediaDetails, getStatus, imageUrl, searchTitles } from "./api.js";
import { fetchRecommendations, searchByTitle } from "./engine.js";
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
  renderError,
  renderFilters,
  renderRefreshButton,
  renderResults,
  renderRunButton,
  renderSelectionLine,
  renderShowcase
} from "./render.js";

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
  renderResults({
    loading: state.loading,
    results: state.results,
    hasSearched: state.hasSearched,
    mode: state.mode,
    searchQuery: state.searchQuery,
    searchSeed: state.searchSeed,
    onSelect: openModal
  });
  renderError(state.error);
  renderRefreshButton({ loading: state.loading, apiReady: state.apiReady });
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
  state.loading = true;
  state.error = "";
  state.hasSearched = true;
  renderError("");
  renderRunButton({ loading: true });
  renderResults({ loading: true, results: [], hasSearched: true, onSelect: () => {} });
  renderRefreshButton({ loading: true, apiReady: state.apiReady });

  try {
    const finalResults = await fetchRecommendations(state.filters);
    state.results = finalResults;
  } catch (error) {
    state.results = [];
    state.error = error?.message || "Could not load recommendations.";
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
  hideSuggestions();
  renderError("");
  renderResults({ loading: true, results: [], hasSearched: true, onSelect: () => {} });
  renderRefreshButton({ loading: true, apiReady: state.apiReady });

  try {
    const { seed, results } = await searchByTitle(q, state.filters);
    state.searchSeed = seed;
    state.results = results;
    if (!results.length) {
      state.error = `No matches found for "${q}".`;
    }
  } catch (error) {
    state.results = [];
    state.searchSeed = null;
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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
