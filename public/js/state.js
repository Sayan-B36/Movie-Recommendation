import { defaultFilters } from "./data.js";

export const state = {
  filters: { ...defaultFilters },
  apiReady: false,
  loading: false,
  hasSearched: false,
  results: [],
  error: ""
};

export function setFilter(name, value) {
  state.filters = { ...state.filters, [name]: value };
}
