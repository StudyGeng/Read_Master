import {
  getCachedUser,
  getCurrentUser,
  hydrateSavedBooksForCurrentUser,
  listCachedPublishedBooks,
  listCachedUpcomingBooks,
  listPublishedBooks,
  listUpcomingBooks
} from "./firebase-service.js";
import {
  clearLibraryActivity,
  getLibraryActivity,
  hydrateLibraryActivityForCurrentUser
} from "./library-store.js";
import { clearSavedBooks, getSavedIds, isBookSaved, toggleSavedBook } from "./reading-store.js";
import { $, $$, categoryTone, escapeAttribute, escapeHtml, initialsFromTitle } from "./utils.js";

const tabConfig = {
  favorites: {
    eyebrow: "Favorites / Wishlist",
    empty: "No favorites yet. Browse the library and add books you want to keep.",
    clearLabel: "Clear Favorites",
    clearedMessage: "Favorites cleared."
  },
  history: {
    eyebrow: "Recently opened",
    empty: "No reading history yet. Books you open will appear here.",
    activityType: "opened",
    timestampLabel: "Last opened",
    clearLabel: "Clear History",
    clearedMessage: "Reading history cleared."
  },
  read: {
    eyebrow: "Books read",
    empty: "No books read yet. Start a preview or open a full book to build this list.",
    activityType: "read",
    timestampLabel: "Last read",
    clearLabel: "Clear Read Activity",
    clearedMessage: "Read activity cleared."
  },
  downloaded: {
    eyebrow: "Downloads",
    empty: "No downloaded books yet. Available PDF downloads will appear here.",
    activityType: "downloaded",
    timestampLabel: "Last downloaded",
    clearLabel: "Clear Download Activity",
    clearedMessage: "Download activity cleared."
  }
};

const libraryTabs = $(".library-tabs");
const libraryTabPanel = $("#libraryTabPanel");
const librarySectionEyebrow = $("#librarySectionEyebrow");
const libraryModeCopy = $("#libraryModeCopy");
const savedBooksGrid = $("#savedBooksGrid");
const savedEmptyState = $("#savedEmptyState");
const savedListCount = $("#savedListCount");
const clearSavedButton = $("#clearSavedButton");
const libraryFeedback = $("#libraryFeedback");

const requestedTab = window.location.hash.replace(/^#/, "");
const state = {
  activeTab: Object.hasOwn(tabConfig, requestedTab) ? requestedTab : "favorites",
  activity: [],
  books: [],
  loading: true,
  loadError: ""
};

function mergeBooks(...bookLists) {
  const booksById = new Map();

  bookLists.flat().forEach((book) => {
    if (!book?.id) return;
    booksById.set(book.id, { ...booksById.get(book.id), ...book });
  });

  return [...booksById.values()];
}

function activityTimestamp(activity, tab = state.activeTab) {
  if (!activity) return "";
  if (tab === "history") return activity.lastOpenedAt || activity.openedAt || "";
  if (tab === "read") return activity.lastReadAt || activity.readAt || "";
  if (tab === "downloaded") return activity.lastDownloadedAt || activity.downloadedAt || "";
  return "";
}

function activityCount(activity, tab = state.activeTab) {
  if (!activity) return 0;
  if (tab === "history") return Number(activity.openCount || 0);
  if (tab === "read") return Number(activity.readCount || 0);
  if (tab === "downloaded") return Number(activity.downloadCount || 0);
  return 0;
}

function activityEntries(tab) {
  const booksById = new Map(state.books.map((book) => [book.id, book]));

  if (tab === "favorites") {
    return getSavedIds()
      .map((bookId) => ({ book: booksById.get(bookId), activity: null, timestamp: "" }))
      .filter((entry) => entry.book);
  }

  return state.activity
    .map((activity) => ({
      activity,
      book: booksById.get(activity.bookId),
      timestamp: activityTimestamp(activity, tab)
    }))
    .filter((entry) => entry.book && entry.timestamp)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

function tabEntries() {
  return Object.fromEntries(Object.keys(tabConfig).map((tab) => [tab, activityEntries(tab)]));
}

function renderCover(book) {
  const coverStyle = `--cover-bg: ${categoryTone(book.category)}`;

  if (book.coverUrl) {
    return `
      <div class="book-cover" style="${coverStyle}">
        <img src="${escapeAttribute(book.coverUrl)}" alt="${escapeAttribute(book.title)} cover">
      </div>
    `;
  }

  return `
    <div class="book-cover" style="${coverStyle}">
      <span class="cover-initials">${escapeHtml(initialsFromTitle(book.title))}</span>
    </div>
  `;
}

function formatActivityDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function activityCountLabel(count) {
  if (!count) return "";
  return count === 1 ? "1 time" : `${count} times`;
}

function renderActivityMeta(entry, tab) {
  if (tab === "favorites") {
    return `
      <div class="library-activity-meta">
        <span class="tag library-state-tag">Favorite</span>
        <span>Saved for later</span>
      </div>
    `;
  }

  const config = tabConfig[tab];
  const count = activityCount(entry.activity, tab);
  const countLabel = activityCountLabel(count);

  return `
    <div class="library-activity-meta">
      <span class="tag library-state-tag">${escapeHtml(config.timestampLabel)}</span>
      <time datetime="${escapeAttribute(entry.timestamp)}">${escapeHtml(formatActivityDate(entry.timestamp))}</time>
      ${countLabel ? `<span class="library-activity-count">${escapeHtml(countLabel)}</span>` : ""}
    </div>
  `;
}

function renderLibraryCard(entry, tab) {
  const { book } = entry;
  const favorite = isBookSaved(book.id);
  const upcoming = String(book.status || "").toLowerCase() === "upcoming";

  return `
    <article class="book-card library-book-card">
      ${renderCover(book)}
      <div class="book-body">
        <div>
          <h3>${escapeHtml(book.title)}</h3>
          <p class="book-meta">${escapeHtml(book.author)}</p>
        </div>
        ${renderActivityMeta(entry, tab)}
        <p class="book-description">${escapeHtml(book.description)}</p>
        <div class="tag-row">
          <span class="tag">${escapeHtml(book.category)}</span>
          <span class="tag">${escapeHtml(book.format)}</span>
          ${upcoming ? `<span class="tag status-tag">Coming Soon</span>` : ""}
        </div>
        <div class="book-actions">
          <a class="btn primary" href="book-details.html?id=${encodeURIComponent(book.id)}">Details</a>
          <button
            class="btn secondary ${favorite ? "saved" : ""}"
            type="button"
            aria-pressed="${favorite}"
            data-library-favorite="${escapeAttribute(book.id)}"
          >${favorite ? "Remove from Favorites" : "Add to Favorites"}</button>
        </div>
      </div>
    </article>
  `;
}

function summaryText(tab, count) {
  const books = count === 1 ? "book" : "books";
  if (tab === "favorites") return `${count} favorite ${books}`;
  if (tab === "history") return `${count} ${books} opened`;
  if (tab === "read") return `${count} ${books} read`;
  return `${count} ${books} downloaded`;
}

function renderTabs(entriesByTab) {
  $$('[data-library-tab]').forEach((tabButton) => {
    const active = tabButton.dataset.libraryTab === state.activeTab;
    tabButton.setAttribute("aria-selected", String(active));
    tabButton.tabIndex = active ? 0 : -1;
  });

  $$('[data-library-count]').forEach((count) => {
    count.textContent = String(entriesByTab[count.dataset.libraryCount]?.length || 0);
  });

  const activeTabButton = $(`[data-library-tab="${state.activeTab}"]`);
  if (activeTabButton) libraryTabPanel.setAttribute("aria-labelledby", activeTabButton.id);
}

function renderLibrary() {
  state.activity = getLibraryActivity();
  const entriesByTab = tabEntries();
  const entries = entriesByTab[state.activeTab];
  const config = tabConfig[state.activeTab];

  renderTabs(entriesByTab);
  librarySectionEyebrow.textContent = config.eyebrow;
  savedListCount.textContent = summaryText(state.activeTab, entries.length);
  clearSavedButton.textContent = config.clearLabel;
  clearSavedButton.hidden = entries.length === 0;
  clearSavedButton.disabled = false;

  savedBooksGrid.innerHTML = entries.map((entry) => renderLibraryCard(entry, state.activeTab)).join("");
  savedEmptyState.hidden = entries.length > 0;
  savedEmptyState.textContent = state.loading
    ? "Loading your library..."
    : state.loadError && !state.books.length
      ? state.loadError
      : config.empty;
}

function hideFeedback() {
  libraryFeedback.hidden = true;
  libraryFeedback.textContent = "";
  libraryFeedback.classList.remove("success", "error");
}

function showFeedback(message, type = "success") {
  libraryFeedback.textContent = message;
  libraryFeedback.classList.remove("success", "error");
  libraryFeedback.classList.add(type);
  libraryFeedback.hidden = false;
}

function updateLibraryModeCopy(user) {
  if (user?.uid) {
    const readerName = user.name || user.displayName || user.email || "your account";
    libraryModeCopy.textContent = `Signed in as ${readerName}. Favorites and reading activity sync with your reader account.`;
    return;
  }

  libraryModeCopy.textContent = "Favorites and reading activity are saved on this device. Sign in to sync them across devices.";
}

function activateTab(tab, { focus = false, updateHash = true } = {}) {
  if (!Object.hasOwn(tabConfig, tab)) return;
  state.activeTab = tab;
  hideFeedback();
  renderLibrary();

  const tabButton = $(`[data-library-tab="${tab}"]`);
  if (focus) tabButton?.focus();
  if (updateHash && window.location.hash !== `#${tab}`) {
    window.history.replaceState(null, "", `#${tab}`);
  }
}

libraryTabs.addEventListener("click", (event) => {
  const tabButton = event.target.closest("[data-library-tab]");
  if (!tabButton) return;
  activateTab(tabButton.dataset.libraryTab);
});

libraryTabs.addEventListener("keydown", (event) => {
  const tabButtons = $$('[data-library-tab]');
  const currentIndex = tabButtons.indexOf(document.activeElement);
  if (currentIndex < 0) return;

  let nextIndex = currentIndex;
  if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabButtons.length;
  else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = tabButtons.length - 1;
  else return;

  event.preventDefault();
  activateTab(tabButtons[nextIndex].dataset.libraryTab, { focus: true });
});

savedBooksGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-library-favorite]");
  if (!button) return;

  toggleSavedBook(button.dataset.libraryFavorite);
  hideFeedback();
  renderLibrary();
});

clearSavedButton.addEventListener("click", async () => {
  const config = tabConfig[state.activeTab];
  clearSavedButton.disabled = true;

  try {
    if (state.activeTab === "favorites") {
      clearSavedBooks();
    } else {
      await clearLibraryActivity(config.activityType);
    }
    renderLibrary();
    showFeedback(config.clearedMessage);
  } catch (error) {
    renderLibrary();
    showFeedback(error.message || "This library section could not be cleared.", "error");
  }
});

window.addEventListener("hashchange", () => {
  const tab = window.location.hash.replace(/^#/, "");
  if (Object.hasOwn(tabConfig, tab)) activateTab(tab, { updateHash: false });
});

async function initMyLibrary() {
  state.books = mergeBooks(listCachedPublishedBooks(), listCachedUpcomingBooks());
  state.activity = getLibraryActivity();
  updateLibraryModeCopy(getCachedUser());
  renderLibrary();

  const [publishedResult, upcomingResult, userResult] = await Promise.allSettled([
    listPublishedBooks(),
    listUpcomingBooks(),
    getCurrentUser()
  ]);

  if (userResult.status === "fulfilled") updateLibraryModeCopy(userResult.value);

  const [savedResult, activityResult] = await Promise.allSettled([
    hydrateSavedBooksForCurrentUser(),
    hydrateLibraryActivityForCurrentUser()
  ]);

  const loadedBookLists = [publishedResult, upcomingResult]
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  state.books = mergeBooks(state.books, ...loadedBookLists);
  state.activity = getLibraryActivity();
  state.loading = false;

  const bookErrors = [publishedResult, upcomingResult]
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason?.message)
    .filter(Boolean);
  state.loadError = bookErrors[0] || "";

  if (savedResult.status === "rejected") {
    console.warn("Favorites could not load from Firebase.", savedResult.reason);
  }
  if (activityResult.status === "rejected") {
    console.warn("Library activity could not load from Firebase.", activityResult.reason);
  }
  renderLibrary();
}

initMyLibrary();
