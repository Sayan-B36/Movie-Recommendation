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
  // Discover hub - one independent slice per media type. Each slice
  // tracks its active tab, the industry filter, the in-flight loading
  // state and a per-(list,industry) cache.
  discover: {
    movie: {
      tab: "trending", // trending | watched | liked | popular | upcoming
      industry: "all", // all | bollywood | hollywood | dubbed
      items: [],
      loading: false,
      cache: {} // { "<list>:<industry>": [...] }
    },
    tv: {
      tab: "trending",
      industry: "all",
      items: [],
      loading: false,
      cache: {}
    }
  }
};

export function setFilter(name, value) {
  state.filters = { ...state.filters, [name]: value };
}
