import {
  hydrateSavedBooksForCurrentUser,
  listCachedPublishedBooks,
  listPublishedBooks
} from "./firebase-service.js";
import { clearSavedBooks, getSavedIds, toggleSavedBook } from "./reading-store.js";
import { $, categoryTone, escapeAttribute, escapeHtml, initialsFromTitle } from "./utils.js";

const savedBooksGrid = $("#savedBooksGrid");
const savedEmptyState = $("#savedEmptyState");
const savedListCount = $("#savedListCount");
const clearSavedButton = $("#clearSavedButton");

let allBooks = [];

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

function renderSavedList() {
  const savedIds = getSavedIds();
  const savedBooks = savedIds
    .map((id) => allBooks.find((book) => book.id === id))
    .filter(Boolean);

  savedListCount.textContent = `${savedBooks.length} saved ${savedBooks.length === 1 ? "book" : "books"}`;
  savedEmptyState.hidden = savedBooks.length > 0;

  savedBooksGrid.innerHTML = savedBooks.map((book) => `
    <article class="book-card">
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
        </div>
        <div class="book-actions">
          <a class="btn primary" href="book-details.html?id=${encodeURIComponent(book.id)}">Details</a>
          <button class="btn secondary saved" type="button" data-remove-book="${escapeAttribute(book.id)}">Remove</button>
        </div>
      </div>
    </article>
  `).join("");
}

savedBooksGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-book]");
  if (!button) return;

  toggleSavedBook(button.dataset.removeBook);
  renderSavedList();
});

clearSavedButton.addEventListener("click", () => {
  clearSavedBooks();
  renderSavedList();
});

async function initReadingList() {
  allBooks = listCachedPublishedBooks();
  if (allBooks.length) renderSavedList();

  try {
    allBooks = await listPublishedBooks();
    renderSavedList();
    hydrateSavedBooksForCurrentUser()
      .then(() => renderSavedList())
      .catch((error) => {
        console.warn("Saved books could not load from Firebase.", error);
      });
  } catch (error) {
    savedBooksGrid.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

initReadingList();
