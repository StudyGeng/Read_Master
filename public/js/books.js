import {
  listCachedPublishedBooks,
  listCachedUpcomingBooks,
  listPublishedBooks,
  listUpcomingBooks
} from "./firebase-service.js";
import { getSavedIds, isBookSaved, toggleSavedBook } from "./reading-store.js";
import { $, escapeAttribute, escapeHtml, categoryTone, formatDate, initialsFromTitle } from "./utils.js";

const state = {
  books: [],
  upcomingBooks: [],
  search: "",
  category: "All",
  format: "All",
  sort: "newest"
};

const bookGrid = $("#bookGrid");
const emptyState = $("#emptyState");
const searchInput = $("#searchInput");
const searchSuggestions = $("#searchSuggestions");
const clearSearchButton = $("#clearSearchButton");
const categoryButtons = $("#categoryButtons");
const formatSelect = $("#formatSelect");
const sortSelect = $("#sortSelect");
const totalCount = $("#totalCount");
const visibleCount = $("#visibleCount");
const savedCount = $("#savedCount");
const catalogTitle = $("#catalogTitle");
const libraryContent = $(".library-content");
const catalogFilterStatus = document.createElement("p");
catalogFilterStatus.className = "catalog-filter-status";
catalogFilterStatus.setAttribute("role", "status");
catalogFilterStatus.hidden = true;
catalogTitle.closest(".content-toolbar")?.after(catalogFilterStatus);
const trendingTrack = $("#trendingTrack");
const trendCarousel = trendingTrack?.closest(".trend-carousel");
const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
const newReleaseSpotlight = $("#newReleaseSpotlight");
const upcomingSpotlight = $("#upcomingSpotlight");
const trendPreviousButton = $("[data-trend-prev]");
const trendNextButton = $("[data-trend-next]");
const bookModal = $("#bookModal");
const modalBookContent = $("#modalBookContent");

let trendTimer = null;
let trendSliding = false;
let trendSlideTimeout = null;
let trendSlideFrame = null;
let eventsBound = false;
let activeModalBookId = "";
let modalReturnFocus = null;
let activeSuggestionIndex = -1;
let filterChangeNote = "";

function allCatalogBooks() {
  return [...state.books, ...state.upcomingBooks];
}

function metricValue(value) {
  const metric = Number(value || 0);
  return Number.isFinite(metric) ? Math.max(0, metric) : 0;
}

function sortableBookDate(book) {
  const timestamp = Date.parse(book.createdAt || book.releaseDate || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareNewestBooks(a, b) {
  return sortableBookDate(b) - sortableBookDate(a)
    || String(a.title || "").localeCompare(String(b.title || ""));
}

function popularityScore(book) {
  return metricValue(book.viewCount) + (3 * metricValue(book.downloadCount));
}

function comparePopularBooks(a, b) {
  return popularityScore(b) - popularityScore(a)
    || metricValue(b.trendScore) - metricValue(a.trendScore)
    || compareNewestBooks(a, b);
}

function formatMetric(value) {
  return new Intl.NumberFormat("en").format(metricValue(value));
}

function activeCatalogBooks() {
  return state.sort === "coming-soon" ? state.upcomingBooks : state.books;
}

function uniqueValues(books, key) {
  return [...new Set(books.map((book) => book[key]).filter(Boolean))].sort();
}

function matchingBooks() {
  const term = state.search.trim().toLowerCase();

  return activeCatalogBooks()
    .filter((book) => {
      const text = [
        book.title,
        book.author,
        book.category,
        book.format,
        book.description,
        book.sourceName,
        book.status
      ].join(" ").toLowerCase();

      const categoryMatch = state.category === "All" || book.category === state.category;
      const formatMatch = state.format === "All" || book.format === state.format;
      const searchMatch = !term || text.includes(term);

      return categoryMatch && formatMatch && searchMatch;
    })
    .sort((a, b) => {
      if (state.sort === "coming-soon") return String(a.releaseDate || "").localeCompare(String(b.releaseDate || ""));
      if (state.sort === "popular") return comparePopularBooks(a, b);
      if (state.sort === "title") return a.title.localeCompare(b.title);
      if (state.sort === "author") return a.author.localeCompare(b.author);
      return compareNewestBooks(a, b);
    });
}

function clearConflictingCategoryFilters() {
  if (matchingBooks().length || !allCatalogBooks().length) return;

  const cleared = [];
  if (state.search.trim()) {
    state.search = "";
    searchInput.value = "";
    clearSearchButton.hidden = true;
    closeSearchSuggestions();
    cleared.push("search");
  }
  if (!matchingBooks().length && state.format !== "All") {
    state.format = "All";
    formatSelect.value = "All";
    cleared.push("format");
  }
  if (!matchingBooks().length && state.sort === "coming-soon"
    && state.books.some((book) => state.category === "All" || book.category === state.category)) {
    state.sort = "newest";
    sortSelect.value = "newest";
    cleared.push("coming soon view");
  }
  if (!matchingBooks().length && state.category !== "All") {
    state.category = "All";
    cleared.push("unavailable category");
  }
  filterChangeNote = cleared.length
    ? `Reset ${cleared.join(", ")} to show available books.`
    : "";
}

function revealCatalogResults() {
  const firstResult = bookGrid.firstElementChild || emptyState;
  if (!firstResult || !libraryContent) return;

  const top = firstResult.getBoundingClientRect().top;
  const headerHeight = document.querySelector(".site-header")?.getBoundingClientRect().height || 72;
  const safeTop = headerHeight + 18;
  const usefulBottom = Math.min(window.innerHeight - 80, window.innerHeight * 0.72);
  if (top >= safeTop && top < usefulBottom) return;

  const contentTop = libraryContent.getBoundingClientRect().top;
  window.scrollTo({
    top: Math.max(0, window.scrollY + contentTop - safeTop),
    behavior: reducedMotionQuery?.matches ? "auto" : "smooth"
  });
}

function suggestedBooks() {
  const term = state.search.trim().toLowerCase();
  if (!term) return [];

  return activeCatalogBooks()
    .filter((book) => {
      const searchMatch = [book.title, book.author, book.category, book.description]
        .some((value) => String(value || "").toLowerCase().includes(term));
      const categoryMatch = state.category === "All" || book.category === state.category;
      const formatMatch = state.format === "All" || book.format === state.format;
      return searchMatch && categoryMatch && formatMatch;
    })
    .sort((a, b) => {
      const aTitle = a.title.toLowerCase();
      const bTitle = b.title.toLowerCase();
      const aStarts = aTitle.startsWith(term) ? 0 : 1;
      const bStarts = bTitle.startsWith(term) ? 0 : 1;
      return aStarts - bStarts || aTitle.localeCompare(bTitle);
    })
    .slice(0, 6);
}

function closeSearchSuggestions() {
  if (!searchSuggestions) return;
  activeSuggestionIndex = -1;
  searchSuggestions.hidden = true;
  searchInput.setAttribute("aria-expanded", "false");
  searchInput.removeAttribute("aria-activedescendant");
}

function setActiveSuggestion(index) {
  const options = [...searchSuggestions.querySelectorAll("[data-search-suggestion]")];
  if (!options.length) return;

  activeSuggestionIndex = (index + options.length) % options.length;
  options.forEach((option, optionIndex) => {
    const active = optionIndex === activeSuggestionIndex;
    option.classList.toggle("active", active);
    option.setAttribute("aria-selected", String(active));
  });
  searchInput.setAttribute("aria-activedescendant", options[activeSuggestionIndex].id);
  options[activeSuggestionIndex].scrollIntoView({ block: "nearest" });
}

function renderSearchSuggestions() {
  if (!searchSuggestions) return;

  const term = state.search.trim();
  const suggestions = suggestedBooks();
  clearSearchButton.hidden = !term;
  activeSuggestionIndex = -1;
  searchInput.removeAttribute("aria-activedescendant");

  if (!term || !suggestions.length || document.activeElement !== searchInput) {
    closeSearchSuggestions();
    return;
  }

  searchSuggestions.innerHTML = suggestions.map((book, index) => `
    <button
      id="searchSuggestion${index}"
      class="search-suggestion"
      type="button"
      role="option"
      aria-selected="false"
      data-search-suggestion="${escapeAttribute(book.title)}"
    >
      <strong>${escapeHtml(book.title)}</strong>
      <span>${escapeHtml(book.author)} · ${escapeHtml(book.category)}</span>
    </button>
  `).join("");
  searchSuggestions.hidden = false;
  searchInput.setAttribute("aria-expanded", "true");
}

function applySearch(searchTerm, { focus = false, resetFilters = false } = {}) {
  filterChangeNote = "";
  if (resetFilters) {
    state.category = "All";
    state.format = "All";
    if (state.sort === "coming-soon") state.sort = "newest";
    sortSelect.value = state.sort;
    renderFilters();
  }
  state.search = searchTerm;
  searchInput.value = searchTerm;
  clearSearchButton.hidden = !searchTerm;
  closeSearchSuggestions();
  renderBooks();
  if (focus) searchInput.focus();
}

function detailUrl(book) {
  return `book-details.html?id=${encodeURIComponent(book.id)}`;
}

function isUpcomingBook(book) {
  return String(book.status || "").toLowerCase() === "upcoming";
}

function statusLabel(book) {
  return isUpcomingBook(book) ? "Coming Soon" : "Published";
}

function findBook(bookId) {
  return allCatalogBooks().find((book) => book.id === bookId);
}

function renderCover(book, size = "small") {
  const className = size === "large" ? "book-cover-large" : "book-cover";
  const coverStyle = `--cover-bg: ${categoryTone(book.category)}`;

  if (book.coverUrl) {
    return `
      <div class="${className}" style="${coverStyle}">
        <img src="${escapeAttribute(book.coverUrl)}" alt="${escapeAttribute(book.title)} cover">
      </div>
    `;
  }

  return `
    <div class="${className}" style="${coverStyle}">
      <span class="cover-initials">${escapeHtml(initialsFromTitle(book.title))}</span>
    </div>
  `;
}

function renderBookCard(book) {
  const saved = isBookSaved(book.id);
  const upcoming = isUpcomingBook(book);

  return `
    <article class="book-card ${upcoming ? "upcoming-book-card" : ""}">
      ${renderCover(book)}
      <div class="book-body">
        <div>
          <h3>${escapeHtml(book.title)}</h3>
          <p class="book-meta">${escapeHtml(book.author)}</p>
        </div>
        <p class="book-description">${escapeHtml(book.description)}</p>
        <div class="tag-row">
          <span class="tag">${escapeHtml(book.category)}</span>
          <span class="tag">${escapeHtml(book.format)}</span>
          <span class="tag">${escapeHtml(book.licenseType)}</span>
          ${upcoming ? `<span class="tag status-tag">${statusLabel(book)}</span>` : ""}
        </div>
        <div class="book-actions">
          <button class="btn primary" type="button" data-view-more-book="${escapeAttribute(book.id)}">View More</button>
          <button class="btn secondary ${saved ? "saved" : ""}" type="button" aria-pressed="${saved}" data-save-book="${escapeAttribute(book.id)}">
            ${saved ? "Favorited" : "Add to Favorites"}
          </button>
        </div>
      </div>
    </article>
  `;
}

function newestBooks(limit = 1) {
  return [...state.books]
    .sort(compareNewestBooks)
    .slice(0, limit);
}

function popularBooks(limit = 4) {
  return [...state.books].sort(comparePopularBooks).slice(0, limit);
}

function renderTrendCard(book, index) {
  const coverContent = book.coverUrl
    ? `<img src="${escapeAttribute(book.coverUrl)}" alt="${escapeAttribute(book.title)} cover">`
    : `<span>${escapeHtml(initialsFromTitle(book.title))}</span>`;

  return `
    <article class="trend-book-card">
      <button class="trend-cover" type="button" data-view-more-book="${escapeAttribute(book.id)}" style="--cover-bg: ${categoryTone(book.category)}">
        ${coverContent}
      </button>
      <div class="trend-card-body">
        <span class="trend-badge">Popular ${String(index + 1).padStart(2, "0")}</span>
        <h3>${escapeHtml(book.title)}</h3>
        <p>${escapeHtml(book.author)}</p>
        <div class="book-activity-stats" aria-label="${formatMetric(book.viewCount)} views and ${formatMetric(book.downloadCount)} downloads">
          <span><strong>${formatMetric(book.viewCount)}</strong> views</span>
          <span><strong>${formatMetric(book.downloadCount)}</strong> downloads</span>
        </div>
        <div class="tag-row">
          <span class="tag">${escapeHtml(book.category)}</span>
          <span class="tag">${escapeHtml(book.format)}</span>
        </div>
        <div class="book-actions">
          <button class="btn primary" type="button" data-view-more-book="${escapeAttribute(book.id)}">View More</button>
          <button class="btn secondary ${isBookSaved(book.id) ? "saved" : ""}" type="button" aria-pressed="${isBookSaved(book.id)}" data-save-book="${escapeAttribute(book.id)}">
            ${isBookSaved(book.id) ? "Favorited" : "Add to Favorites"}
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderWideBookFeature(book, options) {
  const saved = isBookSaved(book.id);
  const upcoming = isUpcomingBook(book);
  const primaryAction = options.modalAction
    ? `<button class="btn primary" type="button" data-view-more-book="${escapeAttribute(book.id)}">${escapeHtml(options.primaryAction)}</button>`
    : `<a class="btn primary" href="${escapeAttribute(detailUrl(book))}">${escapeHtml(options.primaryAction)}</a>`;
  const viewMoreAction = options.modalAction
    ? ""
    : `<button class="btn secondary" type="button" data-view-more-book="${escapeAttribute(book.id)}">View More</button>`;
  const posterContent = book.coverUrl
    ? `<img src="${escapeAttribute(book.coverUrl)}" alt="${escapeAttribute(book.title)} cover">`
    : `<span>${escapeHtml(initialsFromTitle(book.title))}</span>`;

  return `
    <article class="wide-book-feature ${escapeAttribute(options.variant)} ${upcoming ? "upcoming-book-card" : ""}">
      <div class="wide-book-info">
        <p class="eyebrow">${escapeHtml(options.label)}</p>
        <h2>${escapeHtml(options.heading)}</h2>
        <h3>${escapeHtml(book.title)}</h3>
        <p>${escapeHtml(options.copy || book.description)}</p>
        <div class="tag-row">
          <span class="tag">${escapeHtml(book.category)}</span>
          <span class="tag">${escapeHtml(book.format)}</span>
          <span class="tag">${escapeHtml(book.licenseType)}</span>
          ${upcoming ? `<span class="tag status-tag">${statusLabel(book)}</span>` : ""}
        </div>
        <div class="book-actions">
          ${primaryAction}
          ${viewMoreAction}
          <button class="btn secondary ${saved ? "saved" : ""}" type="button" aria-pressed="${saved}" data-save-book="${escapeAttribute(book.id)}">
            ${saved ? "Favorited" : "Add to Favorites"}
          </button>
        </div>
      </div>
      <button class="wide-book-poster" type="button" data-view-more-book="${escapeAttribute(book.id)}" style="--cover-bg: ${categoryTone(book.category)}">
        ${posterContent}
      </button>
    </article>
  `;
}

function renderModalCover(book) {
  const coverStyle = `--cover-bg: ${categoryTone(book.category)}`;
  const coverContent = book.coverUrl
    ? `<img src="${escapeAttribute(book.coverUrl)}" alt="${escapeAttribute(book.title)} cover">`
    : `<span class="cover-initials">${escapeHtml(initialsFromTitle(book.title))}</span>`;

  return `<div class="modal-book-cover" style="${coverStyle}">${coverContent}</div>`;
}

function renderBookModal(book) {
  const saved = isBookSaved(book.id);
  const upcoming = isUpcomingBook(book);
  const readAction = upcoming
    ? `<button class="btn primary" type="button" disabled>Coming Soon</button>`
    : `<a class="btn primary" href="${escapeAttribute(detailUrl(book))}">Read Preview</a>`;

  modalBookContent.innerHTML = `
    <div class="book-modal-layout">
      ${renderModalCover(book)}
      <div class="book-modal-copy">
        <p class="eyebrow">${escapeHtml(statusLabel(book))}</p>
        <h2 id="modalBookTitle">${escapeHtml(book.title)}</h2>
        <p class="book-meta">${escapeHtml(book.author)}</p>
        <p>${escapeHtml(book.description)}</p>
        <div class="tag-row">
          <span class="tag">${escapeHtml(book.category)}</span>
          <span class="tag">${escapeHtml(book.format)}</span>
          <span class="tag">${escapeHtml(book.licenseType)}</span>
          <span class="tag status-tag">${escapeHtml(statusLabel(book))}</span>
        </div>
        <dl class="modal-meta-list">
          <div><dt>Release date</dt><dd>${escapeHtml(formatDate(book.releaseDate))}</dd></div>
          <div><dt>Language</dt><dd>${escapeHtml(book.language || "-")}</dd></div>
          <div><dt>Source</dt><dd>${escapeHtml(book.sourceName || "-")}</dd></div>
        </dl>
        <div class="book-actions">
          ${readAction}
          <button class="btn secondary ${saved ? "saved" : ""}" type="button" aria-pressed="${saved}" data-save-book="${escapeAttribute(book.id)}">
            ${saved ? "Favorited" : "Add to Favorites"}
          </button>
        </div>
      </div>
    </div>
  `;
}

function openBookModal(bookId) {
  const book = findBook(bookId);
  if (!book || !bookModal || !modalBookContent) return;

  modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  activeModalBookId = book.id;
  renderBookModal(book);
  bookModal.hidden = false;
  document.body.classList.add("modal-open");
  bookModal.querySelector("[data-modal-close]")?.focus();
}

function closeBookModal() {
  if (!bookModal) return;

  activeModalBookId = "";
  bookModal.hidden = true;
  modalBookContent.innerHTML = "";
  document.body.classList.remove("modal-open");
  if (modalReturnFocus?.isConnected) modalReturnFocus.focus();
  modalReturnFocus = null;
}

function getTrendStep() {
  if (!trendingTrack || trendingTrack.children.length < 2) return null;

  const firstCard = trendingTrack.firstElementChild;
  const viewportWidth = trendingTrack.parentElement?.getBoundingClientRect().width || 0;
  const cardWidth = firstCard.getBoundingClientRect().width;
  if (!viewportWidth || !cardWidth) return null;

  const styles = window.getComputedStyle(trendingTrack);
  const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
  const contentWidth = (cardWidth * trendingTrack.children.length)
    + (gap * (trendingTrack.children.length - 1));
  return contentWidth > viewportWidth + 1 ? cardWidth + gap : null;
}

function resetTrendSlide() {
  window.clearTimeout(trendSlideTimeout);
  window.cancelAnimationFrame(trendSlideFrame);
  trendSlideTimeout = null;
  trendSlideFrame = null;
  trendSliding = false;
  if (!trendingTrack) return;
  trendingTrack.style.transition = "";
  trendingTrack.style.transform = "";
}

function stopTrendTimer() {
  window.clearInterval(trendTimer);
  trendTimer = null;
}

function slideTrendNext() {
  const distance = getTrendStep();
  if (!distance || trendSliding) return;

  const firstCard = trendingTrack.firstElementChild;
  if (reducedMotionQuery?.matches) {
    trendingTrack.append(firstCard);
    return;
  }

  trendSliding = true;
  trendingTrack.style.transition = "transform 520ms ease";
  trendingTrack.style.transform = `translateX(-${distance}px)`;

  trendSlideTimeout = window.setTimeout(() => {
    trendSlideTimeout = null;
    trendingTrack.append(firstCard);
    trendingTrack.style.transition = "none";
    trendingTrack.style.transform = "translateX(0)";
    trendSlideFrame = window.requestAnimationFrame(() => {
      trendSlideFrame = null;
      trendingTrack.style.transition = "";
      trendSliding = false;
    });
  }, 540);
}

function slideTrendPrevious() {
  const distance = getTrendStep();
  if (!distance || trendSliding) return;

  const lastCard = trendingTrack.lastElementChild;
  trendingTrack.prepend(lastCard);
  if (reducedMotionQuery?.matches) return;

  trendSliding = true;
  trendingTrack.style.transition = "none";
  trendingTrack.style.transform = `translateX(-${distance}px)`;

  trendSlideFrame = window.requestAnimationFrame(() => {
    trendSlideFrame = null;
    trendingTrack.style.transition = "transform 520ms ease";
    trendingTrack.style.transform = "translateX(0)";

    trendSlideTimeout = window.setTimeout(() => {
      trendSlideTimeout = null;
      trendingTrack.style.transition = "";
      trendSliding = false;
    }, 540);
  });
}

function restartTrendTimer() {
  stopTrendTimer();
  const canSlide = Boolean(getTrendStep());
  if (trendPreviousButton) trendPreviousButton.disabled = !canSlide;
  if (trendNextButton) trendNextButton.disabled = !canSlide;

  if (canSlide
    && !reducedMotionQuery?.matches
    && !document.hidden
    && !trendCarousel?.matches(":hover")
    && !trendCarousel?.contains(document.activeElement)) {
    trendTimer = window.setInterval(slideTrendNext, 5000);
  }
}

function renderHomeHighlights() {
  if (trendingTrack) {
    const books = popularBooks(5);
    resetTrendSlide();
    trendingTrack.innerHTML = books.map(renderTrendCard).join("");
    restartTrendTimer();
  }

  if (newReleaseSpotlight) {
    const [book] = newestBooks(1);

    if (!book) {
      newReleaseSpotlight.innerHTML = `<p class="empty-state">No recently added book yet.</p>`;
      return;
    }

    newReleaseSpotlight.innerHTML = renderWideBookFeature(book, {
      variant: "new-release-feature",
      label: "Library update",
      heading: "Recently Added",
      copy: `${book.createdAt || book.releaseDate ? `Added ${formatDate(book.createdAt || book.releaseDate)}. ` : ""}${book.description}`,
      primaryAction: "Preview Book"
    });
  }

  if (upcomingSpotlight) {
    const [book] = state.upcomingBooks.length
      ? state.upcomingBooks
      : newestBooks(2).slice(-1);

    if (!book) {
      upcomingSpotlight.innerHTML = `<p class="empty-state">No upcoming book yet.</p>`;
      return;
    }

    upcomingSpotlight.innerHTML = renderWideBookFeature(book, {
      variant: "upcoming-feature",
      label: "Upcoming book",
      heading: "Next release preview",
      copy: "A new read is on its way. Save it now and check back when it joins the collection.",
      primaryAction: "View More",
      modalAction: true
    });
  }
}

function renderFilters() {
  const sourceBooks = activeCatalogBooks();
  const categories = ["All", ...uniqueValues(sourceBooks, "category")];
  const formats = ["All", ...uniqueValues(sourceBooks, "format")];

  if (!categories.includes(state.category)) state.category = "All";
  if (!formats.includes(state.format)) state.format = "All";

  categoryButtons.innerHTML = categories.map((category) => {
    const count = category === "All"
      ? sourceBooks.length
      : sourceBooks.filter((book) => book.category === category).length;

    return `
      <button class="category-button ${state.category === category ? "active" : ""}" type="button" data-category="${escapeAttribute(category)}" aria-pressed="${state.category === category}">
        <span>${escapeHtml(category)}</span>
        <small>${count}</small>
      </button>
    `;
  }).join("");

  formatSelect.innerHTML = formats.map((format) => {
    return `<option value="${escapeAttribute(format)}">${format === "All" ? "All formats" : escapeHtml(format)}</option>`;
  }).join("");
  formatSelect.value = state.format;
}

function syncCategoryButtons() {
  categoryButtons.querySelectorAll("[data-category]").forEach((button) => {
    const active = button.dataset.category === state.category;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderBooks() {
  const books = matchingBooks();
  const sourceBooks = activeCatalogBooks();
  catalogTitle.textContent = state.search.trim()
    ? `Results for “${state.search.trim()}”`
    : state.category !== "All"
      ? state.sort === "coming-soon" ? `Coming soon in ${state.category}` : `${state.category} books`
      : state.sort === "coming-soon" ? "Coming soon books"
        : state.sort === "popular" ? "Popular books"
          : "Available books";
  totalCount.textContent = sourceBooks.length;
  visibleCount.textContent = books.length;
  savedCount.textContent = getSavedIds().length;

  bookGrid.innerHTML = books.map(renderBookCard).join("");
  emptyState.hidden = books.length > 0;
  const hasFilters = Boolean(state.search.trim() || state.category !== "All"
    || state.format !== "All" || state.sort === "coming-soon");
  emptyState.innerHTML = `<span>${state.sort === "coming-soon"
    ? "No coming soon books match these filters."
    : "No books match these filters."}</span>${hasFilters
    ? ' <button class="catalog-reset-button" type="button" data-reset-catalog-filters>Clear filters</button>'
    : ""}`;

  const statusParts = [];
  if (state.category !== "All") statusParts.push(state.category);
  if (state.format !== "All") statusParts.push(state.format);
  if (state.sort === "coming-soon") statusParts.push("coming soon");
  catalogFilterStatus.hidden = !statusParts.length && !filterChangeNote;
  const filterLabel = statusParts.length ? `${statusParts.join(" ")} ` : "";
  const statusText = `${books.length} ${filterLabel}${books.length === 1 ? "book" : "books"} shown.${filterChangeNote ? ` ${filterChangeNote}` : ""}`;
  if (catalogFilterStatus.textContent !== statusText) catalogFilterStatus.textContent = statusText;
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  searchInput.addEventListener("input", (event) => {
    filterChangeNote = "";
    state.search = event.target.value;
    renderBooks();
    renderSearchSuggestions();
  });

  searchInput.addEventListener("focus", renderSearchSuggestions);

  searchInput.addEventListener("keydown", (event) => {
    const options = [...searchSuggestions.querySelectorAll("[data-search-suggestion]")];

    if (event.key === "ArrowDown" && options.length) {
      event.preventDefault();
      setActiveSuggestion(activeSuggestionIndex + 1);
    } else if (event.key === "ArrowUp" && options.length) {
      event.preventDefault();
      setActiveSuggestion(activeSuggestionIndex - 1);
    } else if (event.key === "Enter" && activeSuggestionIndex >= 0) {
      event.preventDefault();
      applySearch(options[activeSuggestionIndex].dataset.searchSuggestion);
    } else if (event.key === "Escape") {
      closeSearchSuggestions();
    }
  });

  clearSearchButton.addEventListener("click", () => applySearch("", { focus: true }));

  document.addEventListener("click", (event) => {
    const suggestion = event.target.closest("[data-search-suggestion]");
    if (suggestion) {
      applySearch(suggestion.dataset.searchSuggestion);
      return;
    }

    const keyword = event.target.closest("[data-search-keyword]");
    if (keyword) {
      applySearch(keyword.dataset.searchKeyword, { resetFilters: true });
      document.querySelector("#libraryShelf")?.scrollIntoView({
        behavior: reducedMotionQuery?.matches ? "auto" : "smooth",
        block: "start"
      });
      return;
    }

    if (!event.target.closest(".search-field")) closeSearchSuggestions();
  });

  categoryButtons.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;

    filterChangeNote = "";
    state.category = button.dataset.category;
    const previousSort = state.sort;
    clearConflictingCategoryFilters();
    if (state.sort !== previousSort) {
      renderFilters();
      categoryButtons.querySelector(".category-button.active")?.focus({ preventScroll: true });
    } else {
      syncCategoryButtons();
    }
    renderBooks();
    window.requestAnimationFrame(revealCatalogResults);
  });

  formatSelect.addEventListener("change", (event) => {
    filterChangeNote = "";
    state.format = event.target.value;
    renderBooks();
  });

  sortSelect.addEventListener("change", (event) => {
    filterChangeNote = "";
    state.sort = event.target.value;
    renderFilters();
    renderBooks();
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-reset-catalog-filters]")) {
      filterChangeNote = "";
      state.search = "";
      state.category = "All";
      state.format = "All";
      state.sort = "newest";
      searchInput.value = "";
      clearSearchButton.hidden = true;
      sortSelect.value = state.sort;
      closeSearchSuggestions();
      renderFilters();
      renderBooks();
      bookGrid.querySelector("[data-view-more-book]")?.focus({ preventScroll: true });
      return;
    }

    const viewButton = event.target.closest("[data-view-more-book]");
    if (viewButton) {
      openBookModal(viewButton.dataset.viewMoreBook);
      return;
    }

    if (event.target === bookModal || event.target.closest("[data-modal-close]")) {
      closeBookModal();
      return;
    }

    const button = event.target.closest("[data-save-book]");
    if (!button) return;

    toggleSavedBook(button.dataset.saveBook);
    renderHomeHighlights();
    renderBooks();
    if (activeModalBookId) {
      const activeBook = findBook(activeModalBookId);
      if (activeBook) {
        renderBookModal(activeBook);
        modalBookContent.querySelector("[data-save-book]")?.focus();
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeBookModal();
      return;
    }
    if (event.key !== "Tab" || bookModal?.hidden) return;

    const focusable = [...bookModal.querySelectorAll("button:not([disabled]), a[href]")];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  trendNextButton?.addEventListener("click", () => {
    slideTrendNext();
    restartTrendTimer();
  });

  trendPreviousButton?.addEventListener("click", () => {
    slideTrendPrevious();
    restartTrendTimer();
  });

  trendCarousel?.addEventListener("mouseenter", stopTrendTimer);
  trendCarousel?.addEventListener("mouseleave", restartTrendTimer);
  trendCarousel?.addEventListener("focusin", stopTrendTimer);
  trendCarousel?.addEventListener("focusout", (event) => {
    if (!trendCarousel.contains(event.relatedTarget)) queueMicrotask(restartTrendTimer);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) resetTrendSlide();
    restartTrendTimer();
  });
  window.addEventListener("resize", () => {
    resetTrendSlide();
    restartTrendTimer();
  });
  reducedMotionQuery?.addEventListener?.("change", () => {
    resetTrendSlide();
    restartTrendTimer();
  });
}

function renderLibrary() {
  renderHomeHighlights();
  renderFilters();
  renderBooks();
}

async function initLibrary() {
  bindEvents();

  const cachedPublishedBooks = listCachedPublishedBooks();
  const cachedUpcomingBooks = listCachedUpcomingBooks();

  if (cachedPublishedBooks.length) {
    state.books = cachedPublishedBooks;
    state.upcomingBooks = cachedUpcomingBooks;
    renderLibrary();
  }

  try {
    const [publishedBooks, upcomingBooks] = await Promise.all([
      listPublishedBooks(),
      listUpcomingBooks()
    ]);

    state.books = publishedBooks;
    state.upcomingBooks = upcomingBooks;
    renderLibrary();
  } catch (error) {
    if (!state.books.length) {
      bookGrid.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    }
  }
}

initLibrary();
