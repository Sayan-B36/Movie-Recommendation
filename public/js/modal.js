import { iconHtml, renderIcons } from "./icons.js";
import { imageUrl } from "./api.js";
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

function close() {
  const root = document.getElementById("modal-root");
  root.replaceChildren();
  document.body.classList.remove("modal-open");
  if (escListener) {
    window.removeEventListener("keydown", escListener);
    escListener = null;
  }
  currentItem = null;
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

  const title = getTitle(item);
  const backdrop = imageUrl(item.backdrop_path || item.detail?.backdrop_path, "w1280");
  const poster = imageUrl(item.poster_path || item.detail?.poster_path, "w500");
  const trailer = getTrailer(item.detail?.videos?.results || [], filters.dubLanguage);
  const cast = item.detail?.credits?.cast
    ?.slice(0, 4)
    .map((m) => m.name)
    .join(", ");
  const similar = item.detail?.similar?.results?.slice(0, 6) || [];

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

  // Similar card clicks
  root.querySelectorAll("[data-similar-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.similarId;
      const similarItem = similar.find((s) => String(s.id) === String(id));
      if (similarItem && onSelectSimilarHandler) {
        onSelectSimilarHandler(normalizeResult(similarItem, item.media_type));
      }
    });
  });
}

export { close as closeDetailModal };
