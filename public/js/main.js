import { getStatus } from "./api.js";
import { fetchRecommendations } from "./engine.js";
import { renderIcons } from "./icons.js";
import { setFilter, state } from "./state.js";
import { openDetailModal } from "./modal.js";
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
    onOpenFeatured: () => state.results[0] && openDetailModal({
      item: state.results[0],
      filters: state.filters,
      onSelectSimilar: (item) => openDetailModal({ item, filters: state.filters, onSelectSimilar: () => {} })
    })
  });
  renderFilters({ filters: state.filters, onChange: handleFilterChange });
  renderResults({
    loading: state.loading,
    results: state.results,
    hasSearched: state.hasSearched,
    onSelect: (item) =>
      openDetailModal({
        item,
        filters: state.filters,
        onSelectSimilar: (next) =>
          openDetailModal({
            item: next,
            filters: state.filters,
            onSelectSimilar: () => {}
          })
      })
  });
  renderError(state.error);
  renderRefreshButton({ loading: state.loading, apiReady: state.apiReady });
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
    onOpenFeatured: () => state.results[0] && openDetailModal({
      item: state.results[0],
      filters: state.filters,
      onSelectSimilar: (item) => openDetailModal({ item, filters: state.filters, onSelectSimilar: () => {} })
    })
  });
}

async function run() {
  if (!state.apiReady) {
    state.error = "TMDB key is not configured on the server. Edit .env and restart.";
    renderError(state.error);
    return;
  }
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

async function init() {
  // Render initial UI before API check completes so the page never looks empty.
  renderIcons(document);
  rerender();

  // Wire global buttons
  document.getElementById("run-button").addEventListener("click", run);
  document.getElementById("refresh-button").addEventListener("click", run);

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
