import { iconHtml, renderIcons } from "./icons.js";
import {
  getCollection,
  getPersonDetails,
  getSeasonDetail,
  imageUrl
} from "./api.js";
import {
  formatRuntime,
  getGenresText,
  getMediaLabel,
  getTitle,
  getTrailer,
  getYear,
  normalizeResult
} from "./recommendations.js";

const OVERVIEW_CLAMP = 280;
const BIO_CLAMP = 420;

let escListener = null;
let currentItem = null;
let onSelectSimilarHandler = null;
let openSeasonNum = null;
let collectionPartsCache = [];
const seasonCache = new Map(); // key: `${tvId}:${seasonNum}` -> season data
const personCache = new Map(); // key: personId -> full person payload

// Most-recent detail-modal context, used to drive the "Back" button
// from the person modal back to the title detail it came from.
let lastDetailContext = null; // { item, filters, onSelectSimilar }

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
  // Remember context so the person modal's "Back" button can return.
  lastDetailContext = { item, filters, onSelectSimilar };

  const title = getTitle(item);
  const backdrop = imageUrl(item.backdrop_path || item.detail?.backdrop_path, "w1280");
  const poster = imageUrl(item.poster_path || item.detail?.poster_path, "w500");
  const trailer = getTrailer(item.detail?.videos?.results || [], filters.dubLanguage);
  // Build a unified "people" list: Director(s)/Creator(s) first, then top cast.
  const credits = item.detail?.credits || {};
  const directors = (credits.crew || [])
    .filter((c) => c.job === "Director")
    .slice(0, 2)
    .map((c) => ({ ...c, role: "Director" }));
  // For TV shows, TMDB exposes creators on the detail itself, not in credits.crew.
  const creators =
    item.media_type === "tv"
      ? (item.detail?.created_by || []).slice(0, 2).map((c) => ({
          id: c.id,
          name: c.name,
          profile_path: c.profile_path,
          role: "Creator"
        }))
      : [];
  const topCast = (credits.cast || []).slice(0, 10).map((c) => ({
    ...c,
    role: c.character ? `as ${c.character}` : "Cast"
  }));
  const people = [...directors, ...creators, ...topCast].slice(0, 12);

  const similar = item.detail?.similar?.results?.slice(0, 6) || [];

  // Description / "View More" handling
  const fullOverview =
    item.overview || item.detail?.overview || "No description available.";
  const overviewIsLong = fullOverview.length > OVERVIEW_CLAMP;
  const shortOverview = overviewIsLong
    ? fullOverview.slice(0, OVERVIEW_CLAMP).trimEnd() + "..."
    : fullOverview;

  // Genre line text (e.g. "Action, Superhero, Sci-Fi, Romance")
  const genreText = getGenresText(item, 6);

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
            <p class="detail-genres">
              <span>Genre:</span> ${escapeHtml(genreText)}
            </p>
            <p class="detail-overview" data-expanded="false">
              <span class="overview-text">${escapeHtml(shortOverview)}</span>
              ${
                overviewIsLong
                  ? `<button type="button" class="view-more-btn" data-action="toggle-overview">View More</button>`
                  : ""
              }
            </p>
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
            <div class="fact"><span>Language</span><strong>${escapeHtml(
              (item.original_language || item.detail?.original_language || "N/A").toUpperCase()
            )}</strong></div>
            <div class="fact"><span>Dub status</span><strong>${escapeHtml(item.dub?.label || "Unknown")}</strong></div>
            <div class="fact"><span>Dub note</span><strong>${escapeHtml(item.dub?.detail || "Best-effort metadata only.")}</strong></div>
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
          people.length
            ? `<section class="cast-section">
              <div class="section-minihead">
                ${iconHtml("Users", 16)} Cast & crew
              </div>
              <div class="cast-row">
                ${people
                  .map((p) => {
                    const avatar = p.profile_path
                      ? imageUrl(p.profile_path, "w185")
                      : "";
                    const initials = (p.name || "")
                      .split(/\s+/)
                      .map((part) => part[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join("")
                      .toUpperCase();
                    return `
                  <button
                    type="button"
                    class="cast-card"
                    data-person-id="${escapeHtml(p.id)}"
                    data-person-role="${escapeHtml(p.role)}"
                    title="See ${escapeHtml(p.name || "this person")}'s filmography"
                  >
                    <div class="cast-avatar">
                      ${
                        avatar
                          ? `<img src="${avatar}" alt="${escapeHtml(p.name)}" loading="lazy" />`
                          : `<span class="cast-avatar-fallback">${escapeHtml(initials || "?")}</span>`
                      }
                    </div>
                    <strong>${escapeHtml(p.name || "Unknown")}</strong>
                    <span class="cast-role">${escapeHtml(p.role)}</span>
                  </button>`;
                  })
                  .join("")}
              </div>
            </section>`
            : ""
        }

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

  // Cast / crew avatar clicks - open the person filmography modal.
  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".cast-card[data-person-id]");
    if (!btn || !root.contains(btn)) return;
    const personId = btn.dataset.personId;
    const role = btn.dataset.personRole || "";
    if (!personId) return;
    openPersonModal({ personId, role });
  });

  // View More / Less toggle for the overview text
  const overviewBtn = root.querySelector("[data-action='toggle-overview']");
  if (overviewBtn) {
    overviewBtn.addEventListener("click", () => {
      const p = overviewBtn.closest(".detail-overview");
      const textEl = p?.querySelector(".overview-text");
      if (!p || !textEl) return;
      const expanded = p.dataset.expanded === "true";
      if (expanded) {
        textEl.textContent = shortOverview;
        overviewBtn.textContent = "View More";
        p.dataset.expanded = "false";
      } else {
        textEl.textContent = fullOverview;
        overviewBtn.textContent = "View Less";
        p.dataset.expanded = "true";
      }
    });
  }

  // Season card clicks → expand inline episode list
  if (seasons.length) {
    root.querySelectorAll(".season-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const num = Number(btn.dataset.seasonNum);
        toggleSeason(item.id, num, filters);
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

async function toggleSeason(tvId, seasonNum, filters) {
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

  const seasonTrailer = getTrailer(
    data?.videos?.results || [],
    filters?.dubLanguage
  );

  panel.innerHTML = `
    <div class="episode-panel-head">
      <strong>${escapeHtml(seasonName)}</strong>
      <span>${episodes.length} episode${episodes.length > 1 ? "s" : ""}</span>
    </div>
    ${
      seasonTrailer
        ? `<div class="season-trailer-box">
            <iframe
              src="https://www.youtube.com/embed/${encodeURIComponent(seasonTrailer.key)}?rel=0"
              title="${escapeHtml(seasonName)} trailer"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            ></iframe>
          </div>`
        : `<div class="season-trailer-empty">
            ${iconHtml("VideoOff", 14)} No trailer available for ${escapeHtml(seasonName)}.
          </div>`
    }
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

/* ========================================================================
   Person modal — clicking any cast/crew avatar opens this view, showing
   the person's profile photo, biography, and full filmography (acting +
   directing). Each filmography card is clickable and opens that title's
   detail modal. A "Back" button restores the title detail the user came
   from.
   ====================================================================== */

/**
 * Open the person filmography modal.
 *
 * @param {{ personId: string|number, role?: string }} args
 *   personId  — TMDB person id
 *   role      — the role label that was clicked (e.g. "Director", "as Carl")
 *               used only to pick which filmography tab to highlight
 *               first ("Directing" vs "Acting").
 */
async function openPersonModal({ personId, role }) {
  const root = document.getElementById("modal-root");
  if (!root) return;
  const returnCtx = lastDetailContext;
  // Render a skeleton so the UI feels instant while we fetch.
  root.innerHTML = personSkeletonHtml();
  document.body.classList.add("modal-open");
  renderIcons(root);
  wirePersonChrome(root, returnCtx);

  // Fetch (with in-memory cache).
  let person = personCache.get(String(personId));
  if (!person) {
    try {
      person = await getPersonDetails(personId);
      personCache.set(String(personId), person);
    } catch (err) {
      const skel = root.querySelector(".person-modal");
      if (skel) {
        skel.innerHTML = `
          <button class="modal-close" type="button" data-action="close" title="Close">
            ${iconHtml("X", 20)}
          </button>
          <div class="person-error">
            ${iconHtml("AlertTriangle", 18)}
            <span>Could not load this person (${escapeHtml(err.message || "error")}).</span>
          </div>
        `;
        renderIcons(skel);
        wirePersonChrome(root, returnCtx);
      }
      return;
    }
  }

  // If the user closed/navigated away meanwhile, abort.
  if (!document.body.classList.contains("modal-open")) return;

  root.innerHTML = personModalHtml(person, role);
  renderIcons(root);
  wirePersonChrome(root, returnCtx);
  wirePersonFilmography(root, person, returnCtx);
}

function personSkeletonHtml() {
  return `
    <div class="modal-backdrop" data-role="backdrop">
      <article class="person-modal">
        <button class="modal-close" type="button" data-action="close" title="Close">
          ${iconHtml("X", 20)}
        </button>
        <div class="person-loading">
          ${iconHtml("Loader", 18)}
          <span>Loading filmography...</span>
        </div>
      </article>
    </div>
  `;
}

function personModalHtml(person, clickedRole) {
  const name = person.name || "Unknown";
  const photo = person.profile_path
    ? imageUrl(person.profile_path, "w342")
    : "";
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const known = person.known_for_department || "";
  const birthday = (person.birthday || "").slice(0, 10);
  const deathday = (person.deathday || "").slice(0, 10);
  const placeOfBirth = person.place_of_birth || "";
  const fullBio = person.biography || "";
  const bioIsLong = fullBio.length > BIO_CLAMP;
  const shortBio = bioIsLong
    ? fullBio.slice(0, BIO_CLAMP).trimEnd() + "..."
    : fullBio;

  // Build filmography groups
  const credits = person.combined_credits || {};
  const cast = (credits.cast || []).slice();
  const crew = (credits.crew || []).slice();

  // Acting credits — dedupe by media id (a person can be billed multiple
  // times in one show / various episodes, especially for TV).
  const actingMap = new Map();
  cast.forEach((c) => {
    const key = `${c.media_type}:${c.id}`;
    if (!actingMap.has(key) || (c.episode_count || 0) > (actingMap.get(key).episode_count || 0)) {
      actingMap.set(key, c);
    }
  });
  const acting = Array.from(actingMap.values());

  // Directing credits
  const directing = crew.filter((c) => c.job === "Director");
  const directingMap = new Map();
  directing.forEach((c) => directingMap.set(`${c.media_type}:${c.id}`, c));
  const directed = Array.from(directingMap.values());

  // Other notable crew work (Writer, Producer, Creator, etc.)
  const otherCrewMap = new Map();
  crew
    .filter((c) => c.job !== "Director")
    .forEach((c) => {
      const key = `${c.media_type}:${c.id}`;
      if (!otherCrewMap.has(key)) otherCrewMap.set(key, c);
    });
  const otherCrew = Array.from(otherCrewMap.values());

  // Sort newest first within each group
  const sortByDate = (a, b) => {
    const ad = a.release_date || a.first_air_date || "";
    const bd = b.release_date || b.first_air_date || "";
    return bd.localeCompare(ad);
  };
  acting.sort(sortByDate);
  directed.sort(sortByDate);
  otherCrew.sort(sortByDate);

  // Decide which section is opened first based on the role the user clicked
  // ("Director" → directing first; otherwise acting first).
  const directingFirst = /director/i.test(clickedRole || "") || known === "Directing";

  const sections = [];
  if (directingFirst) {
    if (directed.length) sections.push(filmographySection("Directed", "Clapperboard", directed));
    if (acting.length) sections.push(filmographySection("Acting", "Users", acting));
  } else {
    if (acting.length) sections.push(filmographySection("Acting", "Users", acting));
    if (directed.length) sections.push(filmographySection("Directed", "Clapperboard", directed));
  }
  if (otherCrew.length) {
    sections.push(filmographySection("Other work", "Wrench", otherCrew, /* showJob */ true));
  }

  const totalCount = acting.length + directed.length + otherCrew.length;

  return `
    <div class="modal-backdrop" data-role="backdrop">
      <article class="person-modal">
        <button class="modal-close" type="button" data-action="close" title="Close">
          ${iconHtml("X", 20)}
        </button>

        <div class="person-hero">
          ${
            lastDetailContext
              ? `<button type="button" class="person-back" data-action="back">
                  ${iconHtml("ArrowLeft", 16)} Back to ${escapeHtml(getTitle(lastDetailContext.item))}
                </button>`
              : ""
          }
          <div class="person-hero-grid">
            <div class="person-photo">
              ${
                photo
                  ? `<img src="${photo}" alt="${escapeHtml(name)}" />`
                  : `<span class="person-photo-fallback">${escapeHtml(initials || "?")}</span>`
              }
            </div>
            <div class="person-summary">
              <span class="person-eyebrow">${iconHtml("UserRound", 14)} ${escapeHtml(known || "Person")}</span>
              <h2>${escapeHtml(name)}</h2>
              <div class="person-facts">
                ${
                  birthday
                    ? `<span>${iconHtml("Cake", 13)} Born ${escapeHtml(birthday)}</span>`
                    : ""
                }
                ${
                  deathday
                    ? `<span>${iconHtml("Flame", 13)} Died ${escapeHtml(deathday)}</span>`
                    : ""
                }
                ${
                  placeOfBirth
                    ? `<span>${iconHtml("MapPin", 13)} ${escapeHtml(placeOfBirth)}</span>`
                    : ""
                }
                <span>${iconHtml("Film", 13)} ${totalCount} credit${totalCount === 1 ? "" : "s"}</span>
              </div>
              ${
                fullBio
                  ? `<p class="person-bio" data-expanded="false" data-full="${escapeHtml(fullBio)}">
                      <span class="bio-text">${escapeHtml(shortBio)}</span>
                      ${
                        bioIsLong
                          ? `<button type="button" class="view-more-btn" data-action="toggle-bio">View More</button>`
                          : ""
                      }
                    </p>`
                  : ""
              }
            </div>
          </div>
        </div>

        <div class="person-body">
          ${
            sections.length
              ? sections.join("")
              : `<div class="person-empty">${iconHtml("Info", 16)} No public credits found for this person.</div>`
          }
        </div>
      </article>
    </div>
  `;
}

/**
 * Build one filmography section with a heading and a grid of clickable
 * poster cards. `showJob` adds the crew job label below the year for the
 * "Other work" section so the user knows whether it was Writer / Producer
 * / etc.
 */
function filmographySection(heading, icon, items, showJob = false) {
  return `
    <section class="filmography-section">
      <div class="section-minihead">
        ${iconHtml(icon, 16)} ${escapeHtml(heading)}
        <span class="filmography-count">${items.length}</span>
      </div>
      <div class="filmography-grid">
        ${items
          .map((it) => {
            const t = it.title || it.name || "Untitled";
            const year =
              (it.release_date || it.first_air_date || "").slice(0, 4) || "—";
            const poster = it.poster_path
              ? imageUrl(it.poster_path, "w342")
              : "";
            const sub = showJob
              ? `${escapeHtml(it.job || "Crew")} / ${escapeHtml(year)}`
              : it.character
              ? `as ${escapeHtml(it.character)}`
              : escapeHtml(year);
            const mediaBadge =
              it.media_type === "tv" ? "TV" : "Movie";
            return `
              <button
                type="button"
                class="filmography-card"
                data-media-id="${escapeHtml(it.id)}"
                data-media-type="${escapeHtml(it.media_type || "movie")}"
                title="${escapeHtml(t)}"
              >
                <div class="filmography-poster">
                  ${
                    poster
                      ? `<img src="${poster}" alt="${escapeHtml(t)} poster" loading="lazy" />`
                      : `<span class="filmography-poster-fallback">${iconHtml(
                          it.media_type === "tv" ? "Tv" : "Film",
                          22
                        )}</span>`
                  }
                  <span class="filmography-media-badge">${mediaBadge}</span>
                  ${
                    year && year !== "—"
                      ? `<span class="filmography-year-badge">${escapeHtml(year)}</span>`
                      : ""
                  }
                </div>
                <strong>${escapeHtml(t)}</strong>
                <span class="filmography-sub">${sub}</span>
              </button>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

/**
 * Wire the close button, backdrop click, ESC key, and the "Back to ..."
 * button. Called for both the loading skeleton and the loaded view.
 */
function wirePersonChrome(root, returnCtx) {
  root.querySelector("[data-action='close']")?.addEventListener("click", close);
  root.querySelector("[data-role='backdrop']")?.addEventListener("mousedown", (e) => {
    if (e.target === e.currentTarget) close();
  });
  // Reuse the same ESC listener flow used by the detail modal: ensure
  // exactly one listener is bound at a time.
  if (escListener) {
    window.removeEventListener("keydown", escListener);
  }
  escListener = (e) => {
    if (e.key === "Escape") close();
  };
  window.addEventListener("keydown", escListener);

  const backBtn = root.querySelector("[data-action='back']");
  if (backBtn && returnCtx) {
    backBtn.addEventListener("click", () => {
      openDetailModal(returnCtx);
    });
  }

  // View More / Less toggle for the biography
  const bioBtn = root.querySelector("[data-action='toggle-bio']");
  if (bioBtn) {
    bioBtn.addEventListener("click", () => {
      const p = bioBtn.closest(".person-bio");
      const textEl = p?.querySelector(".bio-text");
      if (!p || !textEl) return;
      const expanded = p.dataset.expanded === "true";
      const full = p.dataset.full || textEl.textContent;
      if (expanded) {
        textEl.textContent =
          full.length > BIO_CLAMP ? full.slice(0, BIO_CLAMP).trimEnd() + "..." : full;
        bioBtn.textContent = "View More";
        p.dataset.expanded = "false";
      } else {
        textEl.textContent = full;
        bioBtn.textContent = "View Less";
        p.dataset.expanded = "true";
      }
    });
  }
}

/**
 * Wire clicks on filmography cards so they open that title's detail
 * modal via the originating `onSelectSimilar` callback (which is wired
 * to main.js's openModal -> getMediaDetails -> openDetailModal pipeline).
 */
function wirePersonFilmography(root, person, returnCtx) {
  root.addEventListener("click", (e) => {
    const card = e.target.closest(".filmography-card[data-media-id]");
    if (!card || !root.contains(card)) return;
    const id = Number(card.dataset.mediaId);
    const mediaType = card.dataset.mediaType || "movie";
    if (!id) return;
    // Find the original credit entry (so we can normalize via recommendations.js).
    const credits = person.combined_credits || {};
    const all = [].concat(credits.cast || [], credits.crew || []);
    const raw = all.find(
      (c) => Number(c.id) === id && (c.media_type || "movie") === mediaType
    );
    if (!raw) return;
    const normalized = normalizeResult(raw, mediaType);
    // Reuse the title-detail open pipeline. If the user originally came
    // from a detail modal, re-use the same onSelectSimilar callback
    // (= main.js openModal) so opening this title fetches details
    // and rewires everything correctly.
    if (returnCtx?.onSelectSimilar) {
      returnCtx.onSelectSimilar(normalized);
    }
  });
}

export { close as closeDetailModal };
