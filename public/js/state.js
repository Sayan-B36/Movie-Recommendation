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
  searchSeed: null
};

export function setFilter(name, value) {
  state.filters = { ...state.filters, [name]: value };
}
