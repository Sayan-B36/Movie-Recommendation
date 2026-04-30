import { iconHtml, renderIcons } from "./icons.js";
import { imageUrl } from "./api.js";
import {
  contentTypeOptions,
  industryOptions,
  languageOptions,
  platformOptions,
  preferenceGroups,
  regionOptions,
  RESULT_LIMITS,
  sortOptions
} from "./data.js";
import {
  getGenresText,
  getLanguageLabel,
  getMediaLabel,
  getPlatformLabel,
  getTitle,
  getYear
} from "./recommendations.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getOptionLabel(groupKey, value) {
  return preferenceGroups[groupKey].options.find((o) => o.value === value)?.label;
}

/* --------------------------------- Header --------------------------------- */

export function renderApiPill(apiReady) {
  const pill = document.getElementById("api-pill");
  const text = document.getElementById("api-pill-text");
  pill.classList.toggle("ready", apiReady);
  text.textContent = apiReady ? "TMDB connected" : "TMDB key missing in .env";
}

/* ------------------------------- Choice groups ----------------------------- */

const CHOICE_GROUP_KEYS = ["mood", "climate", "time", "occasion", "genre"];

export function renderChoiceStack({ filters, onChange }) {
  const root = document.getElementById("choice-stack");
  root.innerHTML = CHOICE_GROUP_KEYS.map((groupKey) => {
    const group = preferenceGroups[groupKey];
    return `
      <div class="choice-group">
        <div class="choice-label">${escapeHtml(group.label)}</div>
        <div class="choice-row" data-group="${groupKey}">
          ${group.options
            .map(
              (opt) => `
            <button
              type="button"
              class="choice-chip ${filters[groupKey] === opt.value ? "active" : ""}"
              data-value="${escapeHtml(opt.value)}"
            >
              ${iconHtml(opt.icon || "Sparkles", 15)}
              ${escapeHtml(opt.label)}
            </button>`
            )
            .join("")}
        </div>
      </div>
    `;
  }).join("");

  renderIcons(root);

  root.querySelectorAll(".choice-row").forEach((row) => {
    const groupKey = row.dataset.group;
    row.querySelectorAll(".choice-chip").forEach((btn) => {
      btn.addEventListener("click", () => onChange(groupKey, btn.dataset.value));
    });
  });
}

/* -------------------------------- Hero panel ------------------------------- */

export function renderSelectionLine(filters) {
  const line = document.getElementById("selection-line");
  const timeLabel =
    filters.time === "auto" ? "Auto time" : getOptionLabel("time", filters.time);
  const parts = [
    getOptionLabel("mood", filters.mood),
    getOptionLabel("climate", filters.climate),
    timeLabel
  ];
  if (filters.genre && filters.genre !== "any") {
    parts.push(getOptionLabel("genre", filters.genre));
  }
  line.textContent = parts.filter(Boolean).join(" / ");
}

export function renderRunButton({ loading }) {
  const btn = document.getElementById("run-button");
  const icon = document.getElementById("run-icon");
  const label = document.getElementById("run-label");
  btn.disabled = loading;
  label.textContent = loading ? "Finding matches" : "Find matches";
  icon.dataset.icon = loading ? "Search" : "Wand2";
  renderIcons(btn);
}

export function renderShowcase({ featured, filters, apiReady, onOpenFeatured }) {
  const root = document.getElementById("showcase-panel");
  if (featured) {
    const backdrop = imageUrl(
      featured.backdrop_path || featured.detail?.backdrop_path,
      "w1280"
    );
    const styleAttr = backdrop ? `style="--backdrop: url(${backdrop})"` : "";
    root.innerHTML = `
      <article class="featured-title" ${styleAttr}>
        <div class="featured-shade"></div>
        <div class="featured-content">
          <span class="media-pill">
            ${featured.media_type === "tv" ? iconHtml("Tv", 15) : iconHtml("Film", 15)}
            Best match
          </span>
          <h2>${escapeHtml(getTitle(featured))}</h2>
          <p>${escapeHtml(featured.overview || featured.detail?.overview || "Description pending.")}</p>
          <div class="featured-meta">
            <span>${iconHtml("Star", 15)} TMDB ${Number(featured.vote_average || 0).toFixed(1)}</span>
            ${featured.imdbRating ? `<span>IMDb ${escapeHtml(featured.imdbRating)}</span>` : ""}
            <span>${escapeHtml(getYear(featured))}</span>
          </div>
          <button class="light-button" type="button" id="featured-open">
            ${iconHtml("Play", 17)} Open trailer
          </button>
        </div>
      </article>
    `;
    renderIcons(root);
    root.querySelector("#featured-open").addEventListener("click", onOpenFeatured);
  } else {
    const language = getLanguageLabel(filters.dubLanguage);
    root.innerHTML = `
      <div class="preview-deck" aria-label="MoodFlix preview">
        <div class="glass-toolbar"><span></span><span></span><span></span></div>
        <div class="preview-frame">
          <div class="preview-copy">
            <span class="eyebrow">MoodFlix</span>
            <h2>${apiReady ? "Build tonight's watchlist" : "Configure server keys"}</h2>
            <p>${escapeHtml(language)} preference / ${escapeHtml(getPlatformLabel(filters.platform))}</p>
          </div>
          <div class="poster-stack" aria-hidden="true">
            <div class="poster-plane plane-one"></div>
            <div class="poster-plane plane-two"></div>
            <div class="poster-plane plane-three"></div>
          </div>
        </div>
      </div>
    `;
  }
}

/* -------------------------------- Filters --------------------------------- */

function selectField({ icon, label, name, value, options }) {
  return `
    <label class="select-field">
      <span>${iconHtml(icon, 16)} ${escapeHtml(label)}</span>
      <select data-filter="${name}">
        ${options
          .map(
            (o) =>
              `<option value="${escapeHtml(o.value)}" ${
                String(o.value) === String(value) ? "selected" : ""
              }>${escapeHtml(o.label)}</option>`
          )
          .join("")}
      </select>
      ${iconHtml("ChevronDown", 16)}
    </label>
  `;
}

export function renderFilters({ filters, onChange }) {
  const root = document.getElementById("filter-grid");
  root.innerHTML = `
    ${selectField({ icon: "Clapperboard", label: "Type", name: "type", value: filters.type, options: contentTypeOptions })}
    ${selectField({ icon: "Globe2", label: "Industry", name: "industry", value: filters.industry, options: industryOptions })}
    ${selectField({ icon: "Languages", label: "Dub language", name: "dubLanguage", value: filters.dubLanguage, options: languageOptions })}
    ${selectField({ icon: "MonitorPlay", label: "Platform", name: "platform", value: filters.platform, options: platformOptions })}
    ${selectField({ icon: "Globe2", label: "Region", name: "region", value: filters.region, options: regionOptions })}
    <div class="range-field">
      <label>
        ${iconHtml("Star", 16)} Min rating
        <strong id="min-rating-label">${Number(filters.minRating).toFixed(1)}</strong>
      </label>
      <input type="range" min="0" max="9" step="0.5" value="${filters.minRating}" data-filter="minRating" />
    </div>
    <button type="button" class="toggle-button ${filters.dubbedOnly ? "active" : ""}" data-filter="dubbedOnly">
      ${iconHtml("BadgeCheck", 16)} Dubbed likely only
    </button>
  `;
  renderIcons(root);

  root.querySelectorAll("select[data-filter]").forEach((sel) => {
    sel.addEventListener("change", (e) => onChange(sel.dataset.filter, e.target.value));
  });
  const range = root.querySelector('input[data-filter="minRating"]');
  range.addEventListener("input", (e) => {
    document.getElementById("min-rating-label").textContent = Number(e.target.value).toFixed(1);
    onChange("minRating", e.target.value);
  });
  const toggle = root.querySelector('button[data-filter="dubbedOnly"]');
  toggle.addEventListener("click", () => onChange("dubbedOnly", !filters.dubbedOnly));
}

/* -------------------------------- Results --------------------------------- */

function skeletonGridHtml() {
  return `
    <div class="movie-grid">
      ${Array.from({ length: RESULT_LIMITS.skeleton })
        .map(() => `<div class="skeleton-card"><div></div><span></span><span></span></div>`)
        .join("")}
    </div>
  `;
}

function movieCardHtml(item) {
  const poster = imageUrl(item.poster_path || item.detail?.poster_path, "w500");
  const platforms = item.platforms?.slice(0, 3) || [];
  const collectionBadge = item.isCollectionPart && item.collectionName
    ? `<span class="collection-badge" title="${escapeHtml(item.collectionName)}">${iconHtml("Layers", 12)} Part of ${escapeHtml(item.collectionName)}</span>`
    : "";
  return `
    <button class="movie-card" type="button" data-card-id="${escapeHtml(`${item.media_type}-${item.id}`)}">
      <div class="poster-wrap">
        ${
          poster
            ? `<img src="${poster}" alt="${escapeHtml(getTitle(item))} poster" loading="lazy" />`
            : `<div class="poster-fallback">No poster</div>`
        }
        <span class="media-badge">${escapeHtml(getMediaLabel(item.media_type))}</span>
        <span class="dub-badge ${item.dub?.available ? "yes" : ""}">${escapeHtml(item.dub?.label || "Dub unknown")}</span>
        ${collectionBadge}
      </div>
      <div class="card-body">
        <h3>${escapeHtml(getTitle(item))}</h3>
        <p>${escapeHtml(getGenresText(item))}</p>
        <div class="rating-row">
          <span>${iconHtml("Star", 14)} ${Number(item.vote_average || 0).toFixed(1)}</span>
          <span>${item.imdbRating ? `IMDb ${escapeHtml(item.imdbRating)}` : "IMDb pending"}</span>
          <span>${escapeHtml(getYear(item))}</span>
        </div>
        <div class="platform-row">
          ${
            platforms.length
              ? platforms.map((p) => `<span>${escapeHtml(p.provider_name)}</span>`).join("")
              : `<span>Platform pending</span>`
          }
        </div>
      </div>
    </button>
  `;
}

function attachCardTilt(area) {
  area.querySelectorAll(".movie-card").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const rotateY = ((x / rect.width - 0.5) * 10).toFixed(2);
      const rotateX = ((0.5 - y / rect.height) * 10).toFixed(2);
      card.style.setProperty("--tilt-x", `${rotateX}deg`);
      card.style.setProperty("--tilt-y", `${rotateY}deg`);
    });
    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--tilt-x", "0deg");
      card.style.setProperty("--tilt-y", "0deg");
    });
  });
}

function conceptHeading(concept, query) {
  if (!concept) return null;
  const name = concept.name || query;
  const pretty = name.replace(/\b\w/g, (c) => c.toUpperCase());
  if (concept.type === "person") return `Films & shows by ${pretty}`;
  if (concept.type === "genre") return `${pretty} picks`;
  if (concept.type === "keyword") return `Titles tagged "${pretty}"`;
  return `Results for "${query}"`;
}

export function renderResults({
  loading,
  results,
  hasSearched,
  onSelect,
  mode,
  searchQuery,
  searchSeed,
  searchConcept,
  loadingMore = false,
  canLoadMore = false
}) {
  const heading = document.getElementById("results-heading");
  const eyebrow = document.querySelector(".results-section .eyebrow");
  const area = document.getElementById("results-area");
  if (loading) {
    if (eyebrow) eyebrow.textContent = mode === "search" ? "Searching" : "Your watchlist";
    heading.textContent =
      mode === "search" ? `Finding titles like "${searchQuery || ""}"` : "Curating titles";
  } else if (results.length) {
    if (mode === "search" && searchSeed) {
      if (eyebrow) eyebrow.textContent = "Similar titles";
      heading.textContent = `More like ${getTitle(searchSeed)}`;
    } else if (mode === "search" && searchConcept) {
      if (eyebrow) eyebrow.textContent =
        searchConcept.type === "person"
          ? "Filmography"
          : searchConcept.type === "genre"
          ? "Genre picks"
          : "Keyword matches";
      heading.textContent = conceptHeading(searchConcept, searchQuery);
    } else {
      if (eyebrow) eyebrow.textContent = "Your watchlist";
      heading.textContent = `${results.length} matches`;
    }
  } else {
    if (eyebrow) eyebrow.textContent = "Your watchlist";
    heading.textContent = "Ready when you are";
  }

  if (loading) {
    area.innerHTML = skeletonGridHtml();
    return;
  }

  if (results.length) {
    const footerHtml = `
      <div class="results-footer" id="results-footer" data-state="${
        loadingMore ? "loading" : canLoadMore ? "ready" : "end"
      }">
        ${
          loadingMore
            ? `<div class="results-footer-loading">
                ${iconHtml("Loader", 18)} Loading more matches...
              </div>`
            : canLoadMore
            ? `<div class="results-footer-ready">
                ${iconHtml("ChevronDown", 16)} Scroll for more
              </div>`
            : `<div class="results-footer-end">
                ${iconHtml("Check", 14)} You've seen everything we found.
              </div>`
        }
      </div>
    `;
    area.innerHTML = `
      <div class="movie-grid">
        ${results.map(movieCardHtml).join("")}
      </div>
      ${footerHtml}
    `;
    renderIcons(area);
    attachCardTilt(area);
    area.querySelectorAll(".movie-card").forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.dataset.cardId;
        const item = results.find((r) => `${r.media_type}-${r.id}` === id);
        if (item) onSelect(item);
      });
    });
    return;
  }

  if (hasSearched) {
    area.innerHTML = `
      <div class="empty-state">
        ${iconHtml("Search", 28)}
        <h3>No clean match found</h3>
        <p>Relax the platform, dubbed, or rating filter and search again.</p>
      </div>
    `;
    renderIcons(area);
    return;
  }

  area.innerHTML = "";
}

export function renderError(message) {
  const panel = document.getElementById("error-panel");
  if (message) {
    panel.textContent = message;
    panel.hidden = false;
  } else {
    panel.textContent = "";
    panel.hidden = true;
  }
}

export function renderRefreshButton({ loading, apiReady }) {
  const btn = document.getElementById("refresh-button");
  btn.disabled = loading || !apiReady;
}

/* ----------------------------- Discover Hub ----------------------------- */

const DISCOVER_TITLES = {
  trending: "Trending this week",
  popular: "Most watched right now",
  top: "Most liked of all time"
};

function discoverCardHtml(item) {
  const poster = imageUrl(item.poster_path, "w342");
  const rating = Number(item.vote_average || 0).toFixed(1);
  return `
    <button
      class="discover-card"
      type="button"
      data-card-id="${escapeHtml(`${item.media_type || "movie"}-${item.id}`)}"
    >
      <div class="discover-poster">
        ${
          poster
            ? `<img src="${poster}" alt="${escapeHtml(getTitle(item))} poster" loading="lazy" />`
            : `<div class="poster-fallback">No poster</div>`
        }
        <span class="discover-rating">${iconHtml("Star", 11)} ${rating}</span>
        <span class="discover-type">${escapeHtml(getMediaLabel(item.media_type || "movie"))}</span>
      </div>
      <div class="discover-meta">
        <strong>${escapeHtml(getTitle(item))}</strong>
        <span>${escapeHtml(getYear(item) || "—")}</span>
      </div>
    </button>
  `;
}

function discoverSkeleton() {
  return `
    <div class="discover-track">
      ${Array.from({ length: 8 })
        .map(() => `<div class="discover-skel"></div>`)
        .join("")}
    </div>
  `;
}

export function renderDiscoverHub({ tab, items, loading, onSelect, onTabChange }) {
  const root = document.getElementById("discover-hub");
  if (!root) return;
  const area = document.getElementById("discover-area");
  const title = document.getElementById("discover-title");
  if (title) title.textContent = DISCOVER_TITLES[tab] || DISCOVER_TITLES.trending;

  // tab active state
  document.querySelectorAll("#discover-tabs .discover-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  if (!area) return;
  if (loading) {
    area.innerHTML = discoverSkeleton();
    return;
  }
  if (!items || !items.length) {
    area.innerHTML = `<div class="discover-empty">Nothing to show right now.</div>`;
    return;
  }

  area.innerHTML = `
    <div class="discover-track">
      ${items.slice(0, 20).map(discoverCardHtml).join("")}
    </div>
  `;
  renderIcons(area);
  area.querySelectorAll(".discover-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.cardId;
      const item = items.find((r) => `${r.media_type || "movie"}-${r.id}` === id);
      if (item && onSelect) onSelect(item);
    });
  });

  // Wire tab buttons (idempotent — replace listeners)
  document.querySelectorAll("#discover-tabs .discover-tab").forEach((btn) => {
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener("click", () => onTabChange && onTabChange(fresh.dataset.tab));
  });
  renderIcons(document.getElementById("discover-tabs"));
}

/* ------------------------------ Sort field ------------------------------ */

export function renderSortField({ sortBy, visible, onChange }) {
  const wrap = document.getElementById("sort-field");
  if (!wrap) return;
  wrap.hidden = !visible;
  if (!visible) return;
  const sel = document.getElementById("results-sort");
  if (!sel) return;
  sel.innerHTML = sortOptions
    .map(
      (o) =>
        `<option value="${o.value}" ${o.value === sortBy ? "selected" : ""}>${escapeHtml(
          o.label
        )}</option>`
    )
    .join("");
  // re-bind change handler (clear old via clone)
  const fresh = sel.cloneNode(true);
  sel.parentNode.replaceChild(fresh, sel);
  fresh.value = sortBy;
  fresh.addEventListener("change", (e) => onChange && onChange(e.target.value));
  renderIcons(wrap);
}
