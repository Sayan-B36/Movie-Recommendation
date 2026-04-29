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
  // Pagination for endless scrolling
  page: 1, // next page to fetch when loadMore() runs
  loadingMore: false,
  canLoadMore: false
};

export function setFilter(name, value) {
  state.filters = { ...state.filters, [name]: value };
}
