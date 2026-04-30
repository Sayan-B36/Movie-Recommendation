import { defaultFilters } from "./data.js";

export const state = {
  filters: { ...defaultFilters },
  apiReady: false,
  loading: false,
  hasSearched: false,
  results: [],
  error: "",
  mode: "mood", // 'mood' | 'search'
  searchQuery: "",
  searchSeed: null,
  searchConcept: null, // { type:'genre'|'keyword'|'person', id, name } | null
  searchMode: "title", // 'title' | 'concept'
  // Pagination for endless scrolling
  page: 1, // next page to fetch when loadMore() runs
  loadingMore: false,
  canLoadMore: false,
  // Discover hub (trending / popular / top-rated)
  discover: {
    tab: "trending", // 'trending' | 'popular' | 'top'
    items: [],
    loading: false,
    cache: {} // { trending: [...], popular: [...], top: [...] }
  }
};

export function setFilter(name, value) {
  state.filters = { ...state.filters, [name]: value };
}
