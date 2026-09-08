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
const trendingTrack = $("#trendingTrack");
const newReleaseSpotlight = $("#newReleaseSpotlight");
const upcomingSpotlight = $("#upcomingSpotlight");
const trendPreviousButton = $("[data-trend-prev]");
const trendNextButton = $("[data-trend-next]");
const bookModal = $("#bookModal");
const modalBookContent = $("#modalBookContent");

let trendTimer = null;
let trendSliding = false;
let eventsBound = false;
let activeModalBookId = "";
let activeSuggestionIndex = -1;

function allCatalogBooks() {
  return [...state.books, ...state.upcomingBooks];
}

function activeCatalogBooks() {
  return state.sort === "coming-soon" ? state.upcomingBooks : state.books;
}

function uniqueValues(key) {
  return [...new Set(allCatalogBooks().map((book) => book[key]).filter(Boolean))].sort();
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
      if (state.sort === "title") return a.title.localeCompare(b.title);
      if (state.sort === "author") return a.author.localeCompare(b.author);
      return String(b.releaseDate || "").localeCompare(String(a.releaseDate || ""));
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
          <button class="btn secondary ${saved ? "saved" : ""}" type="button" data-save-book="${escapeAttribute(book.id)}">
            ${saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
    </article>
  `;
}

function newestBooks(limit = 1) {
  return [...state.books]
    .sort((a, b) => String(b.releaseDate || "").localeCompare(String(a.releaseDate || "")))
    .slice(0, limit);
}

function trendingBooks(limit = 4) {
  return [...state.books]
    .sort((a, b) => {
      const aScore = Number(a.trendScore || 0);
      const bScore = Number(b.trendScore || 0);
      if (aScore !== bScore) return bScore - aScore;

      const dateCompare = String(b.releaseDate || "").localeCompare(String(a.releaseDate || ""));
      if (dateCompare) return dateCompare;

      const aFallback = String(a.title || "").length + String(a.category || "").length;
      const bFallback = String(b.title || "").length + String(b.category || "").length;
      return bFallback - aFallback;
    })
    .slice(0, limit);
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
        <span class="trend-badge">Trend ${String(index + 1).padStart(2, "0")}</span>
        <h3>${escapeHtml(book.title)}</h3>
        <p>${escapeHtml(book.author)}</p>
        <div class="tag-row">
          <span class="tag">${escapeHtml(book.category)}</span>
          <span class="tag">${escapeHtml(book.format)}</span>
        </div>
        <div class="book-actions">
          <button class="btn primary" type="button" data-view-more-book="${escapeAttribute(book.id)}">View More</button>
          <button class="btn secondary ${isBookSaved(book.id) ? "saved" : ""}" type="button" data-save-book="${escapeAttribute(book.id)}">
            ${isBookSaved(book.id) ? "Wishlisted" : "Wishlist"}
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
          <button class="btn secondary ${saved ? "saved" : ""}" type="button" data-save-book="${escapeAttribute(book.id)}">
            ${saved ? "Wishlisted" : "Wishlist"}
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
          <button class="btn secondary ${saved ? "saved" : ""}" type="button" data-save-book="${escapeAttribute(book.id)}">
            ${saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
    </div>
  `;
}

function openBookModal(bookId) {
  const book = findBook(bookId);
  if (!book || !bookModal || !modalBookContent) return;

  activeModalBookId = book.id;
  renderBookModal(book);
  bookModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeBookModal() {
  if (!bookModal) return;

  activeModalBookId = "";
  bookModal.hidden = true;
  modalBookContent.innerHTML = "";
  document.body.classList.remove("modal-open");
}

function slideTrendNext() {
  if (!trendingTrack || trendSliding || trendingTrack.children.length <= 3) return;

  const firstCard = trendingTrack.firstElementChild;
  const styles = window.getComputedStyle(trendingTrack);
  const gap = Number.parseFloat(styles.columnGap || styles.gap || "0");
  const distance = firstCard.getBoundingClientRect().width + gap;

  trendSliding = true;
  trendingTrack.style.transition = "transform 520ms ease";
  trendingTrack.style.transform = `translateX(-${distance}px)`;

  window.setTimeout(() => {
    trendingTrack.append(firstCard);
    trendingTrack.style.transition = "none";
    trendingTrack.style.transform = "translateX(0)";
    window.requestAnimationFrame(() => {
      trendingTrack.style.transition = "";
      trendSliding = false;
    });
  }, 540);
}

function slideTrendPrevious() {
  if (!trendingTrack || trendSliding || trendingTrack.children.length <= 3) return;

  const lastCard = trendingTrack.lastElementChild;
  trendingTrack.prepend(lastCard);

  const styles = window.getComputedStyle(trendingTrack);
  const gap = Number.parseFloat(styles.columnGap || styles.gap || "0");
  const distance = lastCard.getBoundingClientRect().width + gap;

  trendSliding = true;
  trendingTrack.style.transition = "none";
  trendingTrack.style.transform = `translateX(-${distance}px)`;

  window.requestAnimationFrame(() => {
    trendingTrack.style.transition = "transform 520ms ease";
    trendingTrack.style.transform = "translateX(0)";

    window.setTimeout(() => {
      trendingTrack.style.transition = "";
      trendSliding = false;
    }, 540);
  });
}

function restartTrendTimer() {
  window.clearInterval(trendTimer);
  trendTimer = null;

  if (trendingTrack && trendingTrack.children.length > 3) {
    trendTimer = window.setInterval(slideTrendNext, 5000);
  }
}

function renderHomeHighlights() {
  if (trendingTrack) {
    const books = trendingBooks(5);
    trendingTrack.innerHTML = books.map(renderTrendCard).join("");
    restartTrendTimer();
  }

  if (newReleaseSpotlight) {
    const [book] = newestBooks(1);

    if (!book) {
      newReleaseSpotlight.innerHTML = `<p class="empty-state">No new release yet.</p>`;
      return;
    }

    newReleaseSpotlight.innerHTML = renderWideBookFeature(book, {
      variant: "new-release-feature",
      label: "New release",
      heading: "Latest on the shelf",
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
      copy: "This book can be prepared by admin first, then published when the resource is ready.",
      primaryAction: "View More",
      modalAction: true
    });
  }
}

function renderFilters() {
  const sourceBooks = activeCatalogBooks();
  const categories = ["All", ...uniqueValues("category")];
  const formats = ["All", ...uniqueValues("format")];

  categoryButtons.innerHTML = categories.map((category) => {
    const count = category === "All"
      ? sourceBooks.length
      : sourceBooks.filter((book) => book.category === category).length;

    return `
      <button class="category-button ${state.category === category ? "active" : ""}" type="button" data-category="${escapeAttribute(category)}">
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

function renderBooks() {
  const books = matchingBooks();
  const sourceBooks = activeCatalogBooks();
  catalogTitle.textContent = state.search.trim()
    ? `Results for “${state.search.trim()}”`
    : state.sort === "coming-soon" ? "Coming soon books" : "Available books";
  totalCount.textContent = sourceBooks.length;
  visibleCount.textContent = books.length;
  savedCount.textContent = getSavedIds().length;

  bookGrid.innerHTML = books.map(renderBookCard).join("");
  emptyState.hidden = books.length > 0;
  emptyState.textContent = state.sort === "coming-soon" ? "No coming soon books found." : "No books found.";
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  searchInput.addEventListener("input", (event) => {
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
      document.querySelector("#libraryShelf")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (!event.target.closest(".search-field")) closeSearchSuggestions();
  });

  categoryButtons.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;

    state.category = button.dataset.category;
    renderFilters();
    renderBooks();
  });

  formatSelect.addEventListener("change", (event) => {
    state.format = event.target.value;
    renderBooks();
  });

  sortSelect.addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderFilters();
    renderBooks();
  });

  document.addEventListener("click", (event) => {
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
      if (activeBook) renderBookModal(activeBook);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeBookModal();
  });

  trendNextButton?.addEventListener("click", () => {
    slideTrendNext();
    restartTrendTimer();
  });

  trendPreviousButton?.addEventListener("click", () => {
    slideTrendPrevious();
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
