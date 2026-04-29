import { iconHtml, renderIcons } from "./icons.js";
import { getCollection, getSeasonDetail, imageUrl } from "./api.js";
import {
  formatRuntime,
  getGenresText,
  getMediaLabel,
  getTitle,
  getTrailer,
  getYear,
  normalizeResult
} from "./recommendations.js";

let escListener = null;
let currentItem = null;
let onSelectSimilarHandler = null;
let openSeasonNum = null;
let collectionPartsCache = [];
const seasonCache = new Map(); // key: `${tvId}:${seasonNum}` -> season data

function close() {
  const root = document.getElementById("modal-root");
  root.replaceChildren();
  document.body.classList.remove("modal-open");
  if (escListener) {
    window.removeEventListener("keydown", escListener);
    escListener = null;
  }
  currentItem = null;
  openSeasonNum = null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function openDetailModal({ item, filters, onSelectSimilar }) {
  if (currentItem) close();
  currentItem = item;
  onSelectSimilarHandler = onSelectSimilar;
  openSeasonNum = null;
  collectionPartsCache = [];

  const title = getTitle(item);
  const backdrop = imageUrl(item.backdrop_path || item.detail?.backdrop_path, "w1280");
  const poster = imageUrl(item.poster_path || item.detail?.poster_path, "w500");
  const trailer = getTrailer(item.detail?.videos?.results || [], filters.dubLanguage);
  const cast = item.detail?.credits?.cast
    ?.slice(0, 4)
    .map((m) => m.name)
    .join(", ");
  const similar = item.detail?.similar?.results?.slice(0, 6) || [];

  // Filter out "Specials" (season_number === 0) and seasons with 0 episodes.
  const seasons =
    item.media_type === "tv"
      ? (item.detail?.seasons || [])
          .filter((s) => s.season_number > 0 && (s.episode_count || 0) > 0)
          .sort((a, b) => a.season_number - b.season_number)
      : [];

  const totalEpisodes = seasons.reduce((acc, s) => acc + (s.episode_count || 0), 0);

  const heroStyle = backdrop ? `style="--detail-backdrop: url(${backdrop})"` : "";

  const html = `
    <div class="modal-backdrop" data-role="backdrop">
      <article class="detail-modal">
        <button class="modal-close" type="button" title="Close details" data-action="close">
          ${iconHtml("X", 20)}
        </button>

        <div class="detail-hero" ${heroStyle}>
          <div class="detail-overlay"></div>
          <div class="detail-copy">
            <span class="media-pill">
              ${item.media_type === "tv" ? iconHtml("Tv", 15) : iconHtml("Film", 15)}
              ${escapeHtml(getMediaLabel(item.media_type))}
            </span>
            <h2>${escapeHtml(title)}</h2>
            <div class="detail-meta">
              <span>
                ${iconHtml("Star", 15)}
                TMDB ${Number(item.vote_average || 0).toFixed(1)}
              </span>
              ${
                item.imdbRating
                  ? `<span>IMDb ${escapeHtml(item.imdbRating)}</span>`
                  : `<span>IMDb pending</span>`
              }
              <span>${escapeHtml(getYear(item))}</span>
              <span>${escapeHtml(formatRuntime(item))}</span>
            </div>
            <p>${escapeHtml(item.overview || item.detail?.overview || "No description available.")}</p>
          </div>
          ${
            poster
              ? `<img class="detail-poster" src="${poster}" alt="${escapeHtml(title)} poster" />`
              : ""
          }
        </div>

        <div class="detail-grid">
          <section class="trailer-box">
            ${
              trailer
                ? `<iframe
                    src="https://www.youtube.com/embed/${encodeURIComponent(trailer.key)}?rel=0"
                    title="${escapeHtml(title)} trailer"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                  ></iframe>`
                : `<div class="trailer-empty">${iconHtml("Play", 24)} Trailer unavailable</div>`
            }
          </section>

          <aside class="detail-facts">
            <div class="fact"><span>Genres</span><strong>${escapeHtml(getGenresText(item, 5))}</strong></div>
            <div class="fact"><span>Language</span><strong>${escapeHtml(
              (item.original_language || item.detail?.original_language || "N/A").toUpperCase()
            )}</strong></div>
            <div class="fact"><span>Dub status</span><strong>${escapeHtml(item.dub?.label || "Unknown")}</strong></div>
            <div class="fact"><span>Dub note</span><strong>${escapeHtml(item.dub?.detail || "Best-effort metadata only.")}</strong></div>
            ${cast ? `<div class="fact"><span>Cast</span><strong>${escapeHtml(cast)}</strong></div>` : ""}
          </aside>
        </div>

        <section class="platform-section">
          <div class="section-minihead">
            ${iconHtml("MonitorPlay", 16)} Available on
          </div>
          <div class="provider-list">
            ${
              item.platforms?.length
                ? item.platforms
                    .slice(0, 10)
                    .map(
                      (p) => `
                    <span>
                      ${
                        p.logo_path
                          ? `<img src="${imageUrl(p.logo_path, "w92")}" alt="" />`
                          : ""
                      }
                      ${escapeHtml(p.provider_name)}
                    </span>`
                    )
                    .join("")
                : `<span>Platform data pending for ${escapeHtml(filters.region)}</span>`
            }
          </div>
        </section>

        ${
          seasons.length
            ? `<section class="seasons-section">
              <div class="section-minihead">
                ${iconHtml("ListVideo", 16)} ${seasons.length} season${seasons.length > 1 ? "s" : ""} / ${totalEpisodes} episodes total
              </div>
              <div class="seasons-grid">
                ${seasons
                  .map((s) => {
                    const sPoster = s.poster_path ? imageUrl(s.poster_path, "w342") : "";
                    const sYear = (s.air_date || "").slice(0, 4);
                    const sName =
                      s.name && !/^Season\s*\d+$/i.test(s.name)
                        ? s.name
                        : `Season ${s.season_number}`;
                    return `
                  <button type="button" class="season-card" data-season-num="${s.season_number}" aria-expanded="false">
                    <div class="season-poster">
                      ${
                        sPoster
                          ? `<img src="${sPoster}" alt="${escapeHtml(sName)} poster" loading="lazy" />`
                          : `<span class="season-poster-fallback">S${s.season_number}</span>`
                      }
                      <span class="season-num-badge">S${s.season_number}</span>
                    </div>
                    <div class="season-meta">
                      <strong>${escapeHtml(sName)}</strong>
                      <span class="season-stats">
                        ${iconHtml("Tv", 12)} ${s.episode_count} episode${s.episode_count > 1 ? "s" : ""}
                        ${sYear ? ` / ${escapeHtml(sYear)}` : ""}
                      </span>
                    </div>
                  </button>`;
                  })
                  .join("")}
              </div>
              <div id="episode-panel" class="episode-panel" hidden></div>
            </section>`
            : ""
        }

        <div id="collection-section-slot"></div>

        ${
          similar.length
            ? `<section class="similar-section">
              <div class="section-minihead">${iconHtml("Sparkles", 16)} More like this</div>
              <div class="similar-row">
                ${similar
                  .map(
                    (s) => `
                  <button type="button" class="similar-card" data-similar-id="${s.id}">
                    ${
                      s.poster_path
                        ? `<img src="${imageUrl(s.poster_path, "w342")}" alt="${escapeHtml(getTitle(s))} poster" />`
                        : `<span>No poster</span>`
                    }
                    <strong>${escapeHtml(getTitle(s))}</strong>
                  </button>`
                  )
                  .join("")}
              </div>
            </section>`
            : ""
        }
      </article>
    </div>
  `;

  const root = document.getElementById("modal-root");
  root.innerHTML = html;
  document.body.classList.add("modal-open");
  renderIcons(root);

  // Close interactions
  root.querySelector("[data-action='close']").addEventListener("click", close);
  root.querySelector("[data-role='backdrop']").addEventListener("mousedown", (e) => {
    if (e.target === e.currentTarget) close();
  });
  escListener = (e) => {
    if (e.key === "Escape") close();
  };
  window.addEventListener("keydown", escListener);

  // Similar card clicks (event delegation so dynamically-injected
  // collection cards also work)
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-similar-id]");
    if (!btn || !root.contains(btn)) return;
    const id = btn.dataset.similarId;
    const fromMedia = btn.dataset.similarMedia || item.media_type;
    // Look up from similar OR injected collection parts
    const similarItem =
      similar.find((s) => String(s.id) === String(id)) ||
      collectionPartsCache.find((p) => String(p.id) === String(id));
    if (similarItem && onSelectSimilarHandler) {
      onSelectSimilarHandler(normalizeResult(similarItem, fromMedia));
    }
  });

  // Season card clicks → expand inline episode list
  if (seasons.length) {
    root.querySelectorAll(".season-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const num = Number(btn.dataset.seasonNum);
        toggleSeason(item.id, num, btn);
      });
    });
  }

  // Async: pull collection parts and inject "From the collection"
  if (item.media_type === "movie" && item.detail?.belongs_to_collection?.id) {
    loadCollectionForModal(item, root);
  }
}

async function loadCollectionForModal(item, root) {
  const seedItem = item;
  try {
    const coll = await getCollection(item.detail.belongs_to_collection.id);
    if (!coll || currentItem !== seedItem) return;
    const parts = (coll.parts || [])
      .filter((p) => p.id !== item.id && (p.poster_path || p.backdrop_path))
      .sort((a, b) => {
        const ay = Number((a.release_date || "0").slice(0, 4)) || 0;
        const by = Number((b.release_date || "0").slice(0, 4)) || 0;
        return ay - by;
      });
    if (!parts.length) return;
    collectionPartsCache = parts;
    const slot = root.querySelector("#collection-section-slot");
    if (!slot) return;
    slot.innerHTML = `
      <section class="collection-section">
        <div class="section-minihead">
          ${iconHtml("Layers", 16)} From the ${escapeHtml(coll.name || "collection")}
        </div>
        <div class="similar-row">
          ${parts
            .map(
              (p) => `
            <button type="button" class="similar-card collection-card"
                    data-similar-id="${p.id}" data-similar-media="movie">
              ${
                p.poster_path
                  ? `<img src="${imageUrl(p.poster_path, "w342")}" alt="${escapeHtml(getTitle(p))} poster" loading="lazy" />`
                  : `<span>No poster</span>`
              }
              <strong>${escapeHtml(getTitle(p))}</strong>
              <span class="collection-card-year">${escapeHtml((p.release_date || "").slice(0, 4) || "—")}</span>
            </button>`
            )
            .join("")}
        </div>
      </section>
    `;
    renderIcons(slot);
  } catch {
    /* silently ignore - the user still has /similar */
  }
}

async function toggleSeason(tvId, seasonNum, btn) {
  const root = document.getElementById("modal-root");
  const panel = root?.querySelector("#episode-panel");
  if (!panel) return;

  // Toggle off if same season clicked again
  if (openSeasonNum === seasonNum) {
    panel.hidden = true;
    panel.innerHTML = "";
    openSeasonNum = null;
    root.querySelectorAll(".season-card").forEach((c) => {
      c.classList.remove("active");
      c.setAttribute("aria-expanded", "false");
    });
    return;
  }

  // Highlight active card
  root.querySelectorAll(".season-card").forEach((c) => {
    const isThis = Number(c.dataset.seasonNum) === seasonNum;
    c.classList.toggle("active", isThis);
    c.setAttribute("aria-expanded", isThis ? "true" : "false");
  });

  // Show loading state
  openSeasonNum = seasonNum;
  panel.hidden = false;
  panel.innerHTML = `
    <div class="episode-panel-loading">
      ${iconHtml("Loader", 16)} Loading Season ${seasonNum} episodes...
    </div>
  `;
  renderIcons(panel);

  // Cache check
  const cacheKey = `${tvId}:${seasonNum}`;
  let data = seasonCache.get(cacheKey);
  try {
    if (!data) {
      data = await getSeasonDetail(tvId, seasonNum);
      seasonCache.set(cacheKey, data);
    }
  } catch (err) {
    panel.innerHTML = `
      <div class="episode-panel-empty">
        ${iconHtml("AlertTriangle", 16)} Could not load episodes (${escapeHtml(err.message || "error")}).
      </div>
    `;
    renderIcons(panel);
    return;
  }

  // If user closed/changed in the meantime, bail
  if (openSeasonNum !== seasonNum) return;

  const episodes = (data?.episodes || []).filter((ep) => ep.episode_number);
  if (!episodes.length) {
    panel.innerHTML = `
      <div class="episode-panel-empty">
        ${iconHtml("Info", 16)} No episode metadata available for this season yet.
      </div>
    `;
    renderIcons(panel);
    return;
  }

  const seasonName =
    data?.name && !/^Season\s*\d+$/i.test(data.name) ? data.name : `Season ${seasonNum}`;

  panel.innerHTML = `
    <div class="episode-panel-head">
      <strong>${escapeHtml(seasonName)}</strong>
      <span>${episodes.length} episode${episodes.length > 1 ? "s" : ""}</span>
    </div>
    <ul class="episode-list">
      ${episodes
        .map((ep) => {
          const still = ep.still_path ? imageUrl(ep.still_path, "w300") : "";
          const air = (ep.air_date || "").slice(0, 10);
          const runtime = ep.runtime ? `${ep.runtime} min` : "";
          const rating = ep.vote_average ? Number(ep.vote_average).toFixed(1) : "";
          return `
        <li class="episode-row">
          <div class="episode-thumb">
            ${
              still
                ? `<img src="${still}" alt="" loading="lazy" />`
                : `<span class="episode-thumb-fallback">EP ${ep.episode_number}</span>`
            }
            <span class="episode-num">E${ep.episode_number}</span>
          </div>
          <div class="episode-body">
            <div class="episode-title-row">
              <strong>${escapeHtml(ep.name || `Episode ${ep.episode_number}`)}</strong>
              <span class="episode-meta">
                ${rating ? `${iconHtml("Star", 12)} ${rating}` : ""}
                ${runtime ? ` / ${escapeHtml(runtime)}` : ""}
                ${air ? ` / ${escapeHtml(air)}` : ""}
              </span>
            </div>
            ${
              ep.overview
                ? `<p>${escapeHtml(ep.overview)}</p>`
                : `<p class="muted">No description.</p>`
            }
          </div>
        </li>`;
        })
        .join("")}
    </ul>
  `;
  renderIcons(panel);
  // Smoothly scroll the panel into view
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

export { close as closeDetailModal };
