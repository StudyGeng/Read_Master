import {
  listCachedPublishedBooks,
  listCachedUpcomingBooks,
  listPublishedBooks,
  listUpcomingBooks
} from "./firebase-service.js";
import { buildLibraryAiPrompt } from "./library-ai-prompt.js";

const assistantRootId = "libraryAssistant";
const maximumQuestionLength = 240;
const maximumRecommendations = 3;

const stopWords = new Set([
  "a",
  "about",
  "an",
  "and",
  "any",
  "book",
  "books",
  "can",
  "could",
  "find",
  "for",
  "help",
  "i",
  "is",
  "like",
  "me",
  "of",
  "on",
  "please",
  "read",
  "reading",
  "recommend",
  "recommendation",
  "recommendations",
  "should",
  "show",
  "something",
  "suggest",
  "suggestion",
  "suggestions",
  "the",
  "to",
  "want",
  "what",
  "which",
  "with",
  "would",
  "you"
]);

const discoveryWords = new Set([
  "added",
  "coming",
  "downloaded",
  "latest",
  "most",
  "new",
  "newest",
  "next",
  "popular",
  "recent",
  "recently",
  "release",
  "soon",
  "top",
  "trending",
  "upcoming",
  "viewed"
]);

const topicGroups = [
  ["accessibility", "accessible", "inclusive", "design", "readable"],
  ["biology", "life", "science"],
  ["business", "commerce", "management", "work"],
  ["climate", "environment", "green", "sustainability"],
  ["code", "coding", "developer", "programming", "software", "technology"],
  ["creative", "essay", "stories", "story", "write", "writing"],
  ["data", "ethics", "privacy"],
  ["education", "learn", "learning", "notes", "study"],
  ["finance", "financial", "money", "personal"],
  ["algebra", "math", "mathematics"],
  ["mystery", "detective", "sherlock", "thriller"],
  ["research", "sources", "workbook"]
];

const safeFeatureActions = Object.freeze({
  browse: Object.freeze({ label: "Browse the library", href: "index.html#libraryShelf" }),
  downloaded: Object.freeze({ label: "View downloaded books", href: "reading-list.html#downloaded" }),
  favorites: Object.freeze({ label: "View favorites", href: "reading-list.html#favorites" }),
  history: Object.freeze({ label: "View reading history", href: "reading-list.html#history" }),
  login: Object.freeze({ label: "Sign in", href: "login.html" }),
  profile: Object.freeze({ label: "Open profile", href: "profile.html" }),
  read: Object.freeze({ label: "View books read", href: "reading-list.html#read" })
});

let assistantCatalog = [];
let catalogLoadPromise = null;
let activeAssistantController = null;

function normalizedText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanQuestion(value) {
  return String(value || "").trim().slice(0, maximumQuestionLength);
}

function normalizedStatus(book) {
  return normalizedText(book?.status) || "published";
}

function validCatalogBook(book) {
  return Boolean(
    book
    && String(book.id || "").trim()
    && String(book.title || "").trim()
    && ["published", "upcoming"].includes(normalizedStatus(book))
  );
}

function mergeCatalogBooks(...bookLists) {
  const booksById = new Map();

  bookLists.flat().forEach((book) => {
    if (!validCatalogBook(book)) return;
    const id = String(book.id).trim();
    booksById.set(id, { ...booksById.get(id), ...book, id });
  });

  return [...booksById.values()];
}

function metricValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function popularityScore(book) {
  return metricValue(book?.viewCount) + (3 * metricValue(book?.downloadCount));
}

function dateValue(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function bookDateValue(book) {
  return dateValue(book?.createdAt || book?.releaseDate);
}

function comparePopularity(a, b) {
  return popularityScore(b) - popularityScore(a)
    || metricValue(b?.trendScore) - metricValue(a?.trendScore)
    || bookDateValue(b) - bookDateValue(a)
    || String(a.title || "").localeCompare(String(b.title || ""));
}

function compareNewest(a, b) {
  return bookDateValue(b) - bookDateValue(a)
    || comparePopularity(a, b);
}

function compareUpcoming(a, b) {
  const aDate = dateValue(a?.releaseDate);
  const bDate = dateValue(b?.releaseDate);

  if (!aDate && bDate) return 1;
  if (aDate && !bDate) return -1;
  return aDate - bDate || String(a.title || "").localeCompare(String(b.title || ""));
}

function discoveryMode(question) {
  const text = normalizedText(question);

  if (/\b(upcoming|coming soon|next release)\b/.test(text)) return "upcoming";
  if (/\b(popular|trending|most viewed|most downloaded|top books?)\b/.test(text)) return "popular";
  if (/\b(newest|latest|recently added|new books?|recent books?)\b/.test(text)) return "newest";
  return "topic";
}

function questionTokens(question) {
  return normalizedText(question)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(token) && !discoveryWords.has(token));
}

function expandedTopicTerms(tokens) {
  const terms = new Set(tokens);

  tokens.forEach((token) => {
    topicGroups.forEach((group) => {
      if (group.includes(token)) group.forEach((term) => terms.add(term));
    });
  });

  return [...terms];
}

function topicScore(book, terms, phrase) {
  const fields = {
    title: normalizedText(book.title),
    author: normalizedText(book.author),
    category: normalizedText(book.category),
    description: normalizedText(book.description),
    source: normalizedText(book.sourceName),
    format: normalizedText(book.format),
    language: normalizedText(book.language)
  };
  let score = 0;

  if (phrase) {
    if (fields.title.includes(phrase)) score += 24;
    if (fields.category.includes(phrase)) score += 16;
    if (fields.description.includes(phrase)) score += 8;
  }

  terms.forEach((term) => {
    if (fields.title.includes(term)) score += 9;
    if (fields.category.includes(term)) score += 7;
    if (fields.author.includes(term)) score += 5;
    if (fields.description.includes(term)) score += 3;
    if (fields.source.includes(term)) score += 2;
    if (fields.format.includes(term) || fields.language.includes(term)) score += 2;
  });

  return score;
}

function publicBookSummary(book) {
  return {
    id: String(book.id || "").trim(),
    title: String(book.title || "Untitled Book").trim().slice(0, 180),
    author: String(book.author || "Unknown Author").trim().slice(0, 120),
    category: String(book.category || "Book").trim().slice(0, 80),
    status: normalizedStatus(book)
  };
}

function rankedLibraryBooks(question, books, options = {}) {
  const requestedLimit = Number.parseInt(options.limit, 10);
  const limit = Math.min(
    maximumRecommendations,
    Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : maximumRecommendations)
  );
  const mode = discoveryMode(question);
  const catalog = mergeCatalogBooks(Array.isArray(books) ? books : []);
  const candidates = catalog.filter((book) => {
    return mode === "upcoming"
      ? normalizedStatus(book) === "upcoming"
      : normalizedStatus(book) === "published";
  });

  if (mode === "popular") {
    return { books: [...candidates].sort(comparePopularity).slice(0, limit), mode, topicMatched: false };
  }

  if (mode === "newest") {
    return { books: [...candidates].sort(compareNewest).slice(0, limit), mode, topicMatched: false };
  }

  if (mode === "upcoming") {
    return { books: [...candidates].sort(compareUpcoming).slice(0, limit), mode, topicMatched: false };
  }

  const tokens = questionTokens(question);
  const terms = expandedTopicTerms(tokens);
  const phrase = tokens.join(" ");
  const scoredBooks = candidates
    .map((book) => ({ book, score: topicScore(book, terms, phrase) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      return b.score - a.score
        || comparePopularity(a.book, b.book);
    });

  if (scoredBooks.length) {
    return {
      books: scoredBooks.slice(0, limit).map((entry) => entry.book),
      mode,
      topicMatched: true
    };
  }

  return {
    books: [...candidates].sort(comparePopularity).slice(0, limit),
    mode: "fallback",
    topicMatched: false
  };
}

function featureHelpReply(question, context = {}) {
  const text = normalizedText(question);
  const currentBookId = String(context.bookId || "").trim();

  if (/\b(notification|notifications|bell|library updates?)\b/.test(text)) {
    return {
      intent: "feature-notifications",
      message: "Use the notification bell near the top navigation to check recent library and administrator updates.",
      books: [],
      action: null
    };
  }

  if (/\b(review|reviews|comment|comments|rating|rate)\b/.test(text)) {
    const action = currentBookId
      ? {
          label: "Go to this book's reviews",
          href: `book-details.html?id=${encodeURIComponent(currentBookId)}#bookReviews`
        }
      : safeFeatureActions.browse;

    return {
      intent: "feature-reviews",
      message: "To write a review, sign in, open a published book, choose a rating from 1 to 5, enter at least 3 characters, and select Post Review.",
      books: [],
      action
    };
  }

  if (/\b(favorite|favorites|favourite|favourites|wishlist|saved books?|save a book)\b/.test(text)) {
    return {
      intent: "feature-favorites",
      message: "Select Add to Favorites on a book to save it. Your saved books appear in the Favorites tab of My Library.",
      books: [],
      action: safeFeatureActions.favorites
    };
  }

  if (/\b(reading history|my history|history tab|where (?:is |can i find )?(?:my )?history|opened books?|books? i (?:have )?opened|previously opened)\b/.test(text)) {
    return {
      intent: "feature-history",
      message: "Opening a book adds it to the History tab in My Library, where you can see when and how often it was opened.",
      books: [],
      action: safeFeatureActions.history
    };
  }

  if (
    !/\bmost downloaded\b/.test(text)
    && /\b(my downloads?|downloaded books?|how (?:do i |to )?download|download a book|download)\b/.test(text)
  ) {
    return {
      intent: "feature-downloads",
      message: "Sign in and open an available PDF book to use Download PDF. Download activity appears in the Downloaded tab of My Library.",
      books: [],
      action: safeFeatureActions.downloaded
    };
  }

  if (/\b(my read books?|books? i (?:have )?read|read activity|full book|read preview|preview a book)\b/.test(text)) {
    return {
      intent: "feature-reading",
      message: "Open a published book to read its preview. Signed-in readers can use Read Full Book when the full resource is available, and reading activity appears in My Library.",
      books: [],
      action: safeFeatureActions.read
    };
  }

  if (/\b(login|log in|sign in|signup|sign up|account)\b/.test(text)) {
    return {
      intent: "feature-account",
      message: "Sign in to sync favorites and reading activity, write reviews, read full resources, and download available PDFs.",
      books: [],
      action: safeFeatureActions.login
    };
  }

  if (/\b(profile|edit my name|profile photo|change password|change email)\b/.test(text)) {
    return {
      intent: "feature-profile",
      message: "Your profile contains your reader details and account settings. Open it to update the information available for your account.",
      books: [],
      action: safeFeatureActions.profile
    };
  }

  if (/\b(search|filter|category|format|browse)\b/.test(text) && /\b(how|where|help|use|find)\b/.test(text)) {
    return {
      intent: "feature-search",
      message: "On the Home page, use Search for a title, author, category, or topic. You can also filter by category and format or sort by newest and most popular.",
      books: [],
      action: safeFeatureActions.browse
    };
  }

  return null;
}

/**
 * Returns up to three catalog-grounded recommendations without reading or writing browser state.
 */
export function recommendLibraryBooks(question, books = [], options = {}) {
  return rankedLibraryBooks(cleanQuestion(question), books, options).books.map(publicBookSummary);
}

/**
 * Builds a serializable assistant response. This function is pure and safe to use in tests.
 */
export function getLibraryAssistantReply(question, books = [], context = {}) {
  const cleanedQuestion = cleanQuestion(question);

  if (!cleanedQuestion) {
    return {
      intent: "welcome",
      message: "Ask me about books or reading. I use Gemini for answers when available, and every book link comes from this library's public catalog.",
      books: [],
      action: null
    };
  }

  const featureReply = featureHelpReply(cleanedQuestion, context);
  if (featureReply) return featureReply;

  const currentBookId = String(context.bookId || "").trim();
  if (currentBookId && /\b(this|current) book\b/.test(normalizedText(cleanedQuestion))) {
    const currentBook = mergeCatalogBooks(books).find((book) => book.id === currentBookId);
    if (currentBook) {
      return {
        intent: "current-book",
        message: "Here is the book currently open on this page.",
        books: [publicBookSummary(currentBook)],
        action: null
      };
    }
  }

  const ranked = rankedLibraryBooks(cleanedQuestion, books);
  const recommendedBooks = ranked.books.map(publicBookSummary);

  if (!recommendedBooks.length) {
    return {
      intent: ranked.mode,
      message: ranked.mode === "upcoming"
        ? "There are no public upcoming books in the library right now."
        : "I could not find an available published book right now. Please try browsing the library.",
      books: [],
      action: safeFeatureActions.browse
    };
  }

  if (ranked.mode === "popular") {
    return {
      intent: "popular",
      message: "These published books are popular based on their views and downloads.",
      books: recommendedBooks,
      action: null
    };
  }

  if (ranked.mode === "newest") {
    return {
      intent: "newest",
      message: "These are the most recently added published books.",
      books: recommendedBooks,
      action: null
    };
  }

  if (ranked.mode === "upcoming") {
    return {
      intent: "upcoming",
      message: "These books are currently listed as coming soon.",
      books: recommendedBooks,
      action: null
    };
  }

  if (ranked.topicMatched) {
    return {
      intent: "topic",
      message: "I found these books related to your request.",
      books: recommendedBooks,
      action: null
    };
  }

  return {
    intent: "fallback",
    message: "I could not find an exact topic match, so here are some popular books you could try.",
    books: recommendedBooks,
    action: null
  };
}

function primeCachedCatalog() {
  try {
    assistantCatalog = mergeCatalogBooks(
      assistantCatalog,
      listCachedPublishedBooks(),
      listCachedUpcomingBooks()
    );
  } catch (error) {
    console.warn("The Library Assistant could not read cached books.", error);
  }

  return assistantCatalog;
}

async function loadAssistantCatalog() {
  primeCachedCatalog();

  if (!catalogLoadPromise) {
    catalogLoadPromise = Promise.allSettled([
      listPublishedBooks(),
      listUpcomingBooks()
    ]).then(([publishedResult, upcomingResult]) => {
      const publishedBooks = publishedResult.status === "fulfilled" ? publishedResult.value : [];
      const upcomingBooks = upcomingResult.status === "fulfilled" ? upcomingResult.value : [];
      assistantCatalog = mergeCatalogBooks(assistantCatalog, publishedBooks, upcomingBooks);
      return assistantCatalog;
    });
  }

  return catalogLoadPromise;
}

function createElement(tagName, className = "", text = "") {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function safeActionHref(href) {
  const value = String(href || "");
  const exactPaths = new Set([
    "index.html#libraryShelf",
    "login.html",
    "profile.html",
    "reading-list.html#downloaded",
    "reading-list.html#favorites",
    "reading-list.html#history",
    "reading-list.html#read"
  ]);

  if (exactPaths.has(value)) return value;
  if (/^book-details\.html\?id=[A-Za-z0-9_%.-]+#bookReviews$/.test(value)) return value;
  return "";
}

function appendMessage(messages, sender, message) {
  const item = createElement(
    "div",
    `library-assistant-message library-assistant-message--${sender}`
  );
  const bubble = createElement("div", "library-assistant-message-bubble");
  bubble.textContent = cleanQuestion(message);
  item.append(bubble);
  messages.append(item);
  messages.scrollTop = messages.scrollHeight;
  return item;
}

function appendAssistantReply(messages, reply) {
  const item = createElement(
    "div",
    "library-assistant-message library-assistant-message--assistant"
  );
  const bubble = createElement("div", "library-assistant-message-bubble");
  bubble.append(createElement("p", "library-assistant-reply", reply.message));

  const books = Array.isArray(reply.books)
    ? reply.books.slice(0, maximumRecommendations)
    : [];

  if (books.length) {
    const resultList = createElement("ul", "library-assistant-results");

    books.forEach((book) => {
      if (!book?.id) return;
      const result = createElement("li", "library-assistant-result");
      const title = createElement("strong", "library-assistant-result-title", book.title || "Untitled Book");
      const meta = createElement(
        "span",
        "library-assistant-result-meta",
        [book.author, book.category].filter(Boolean).join(" · ")
      );
      const link = createElement("a", "library-assistant-result-link", "View book");
      link.href = `book-details.html?id=${encodeURIComponent(String(book.id))}`;

      result.append(title, meta, link);
      resultList.append(result);
    });

    if (resultList.children.length) bubble.append(resultList);
  }

  const actionHref = safeActionHref(reply.action?.href);
  if (actionHref) {
    const action = createElement(
      "a",
      "library-assistant-action",
      reply.action?.label || "Open"
    );
    action.href = actionHref;
    bubble.append(action);
  }

  item.append(bubble);
  messages.append(item);
  messages.scrollTop = messages.scrollHeight;
  return item;
}

function pageContext() {
  let bookId = "";

  try {
    bookId = new URL(window.location.href).searchParams.get("id") || "";
  } catch {
    bookId = "";
  }

  return {
    page: document.body?.dataset.page || "",
    bookId
  };
}

/**
 * Adds the accessible Library Assistant to a reader-facing page.
 */
export function initLibraryAssistant(options = {}) {
  if (typeof document === "undefined" || !document.body) return null;
  if (document.body.classList.contains("admin-page")) return null;
  if (activeAssistantController) return activeAssistantController;

  const existingRoot = document.getElementById(assistantRootId);
  if (existingRoot) return null;

  if (Array.isArray(options.books)) {
    assistantCatalog = mergeCatalogBooks(assistantCatalog, options.books);
  }
  primeCachedCatalog();

  const root = createElement("div", "library-assistant");
  root.id = assistantRootId;

  const panel = createElement("section", "library-assistant-panel");
  panel.id = "libraryAssistantPanel";
  panel.hidden = true;
  panel.tabIndex = -1;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "libraryAssistantTitle");

  const header = createElement("header", "library-assistant-header");
  const headingGroup = createElement("div", "library-assistant-heading-group");
  headingGroup.append(
    createElement("span", "library-assistant-kicker", "Read_Master"),
    createElement("h2", "library-assistant-title", "Library Assistant")
  );
  headingGroup.lastElementChild.id = "libraryAssistantTitle";

  const closeButton = createElement("button", "library-assistant-close", "×");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close Library Assistant");
  header.append(headingGroup, closeButton);

  const messages = createElement("div", "library-assistant-messages");
  messages.id = "libraryAssistantMessages";
  messages.setAttribute("role", "log");
  messages.setAttribute("aria-live", "polite");
  messages.setAttribute("aria-relevant", "additions text");
  messages.setAttribute("aria-label", "Library Assistant conversation");

  const suggestions = createElement("div", "library-assistant-suggestions");
  suggestions.setAttribute("aria-label", "Suggested questions");
  const suggestedQuestions = [
    ["Popular", "Show me popular books"],
    ["Newest", "Show me the newest books"],
    ["Study", "Recommend a study book"],
    ["Coding", "Recommend a coding book"],
    ["Review help", "How do reviews work?"]
  ];

  const suggestionButtons = suggestedQuestions.map(([label, query]) => {
    const button = createElement("button", "library-assistant-suggestion", label);
    button.type = "button";
    button.dataset.assistantQuery = query;
    suggestions.append(button);
    return button;
  });

  const form = createElement("form", "library-assistant-form");
  const label = createElement(
    "label",
    "library-assistant-label",
    "Ask about books or library features"
  );
  label.htmlFor = "libraryAssistantInput";

  const formRow = createElement("div", "library-assistant-form-row");
  const input = createElement("input", "library-assistant-input");
  input.id = "libraryAssistantInput";
  input.name = "question";
  input.type = "text";
  input.maxLength = maximumQuestionLength;
  input.autocomplete = "off";
  input.placeholder = "What would you like to read?";
  input.setAttribute("aria-describedby", "libraryAssistantStatus");

  const submitButton = createElement("button", "library-assistant-submit", "Send");
  submitButton.type = "submit";
  formRow.append(input, submitButton);

  const status = createElement("p", "library-assistant-status");
  status.id = "libraryAssistantStatus";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  form.append(label, formRow, status);

  panel.append(header, messages, suggestions, form);

  const launcher = createElement("button", "library-assistant-launcher");
  launcher.type = "button";
  launcher.title = "Library Assistant";
  launcher.setAttribute("aria-label", "Open Library Assistant");
  launcher.setAttribute("aria-controls", panel.id);
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-haspopup", "dialog");
  const launcherIcon = createElement("span", "library-assistant-launcher-icon", "🤖");
  launcherIcon.setAttribute("aria-hidden", "true");
  launcher.append(launcherIcon);

  root.append(panel, launcher);
  document.body.append(root);

  appendAssistantReply(messages, getLibraryAssistantReply(""));

  let lastFocusedElement = null;
  let answering = false;
  const conversation = [];

  function setBusy(busy, message = "") {
    answering = busy;
    submitButton.disabled = busy;
    input.setAttribute("aria-busy", String(busy));
    panel.setAttribute("aria-busy", String(busy));
    status.textContent = message;
  }

  function openAssistant() {
    if (!panel.hidden) return;
    lastFocusedElement = document.activeElement;
    panel.hidden = false;
    root.classList.add("is-open");
    launcher.setAttribute("aria-expanded", "true");
    launcher.setAttribute("aria-label", "Close Library Assistant");
    window.requestAnimationFrame(() => input.focus());
    loadAssistantCatalog().catch((error) => {
      console.warn("The Library Assistant catalog could not refresh.", error);
    });
  }

  function closeAssistant({ restoreFocus = true } = {}) {
    if (panel.hidden) return;
    panel.hidden = true;
    root.classList.remove("is-open");
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-label", "Open Library Assistant");

    if (restoreFocus) {
      const focusTarget = lastFocusedElement?.isConnected ? lastFocusedElement : launcher;
      focusTarget?.focus();
    }
  }

  async function askAssistant(question) {
    const cleanedQuestion = cleanQuestion(question);
    if (!cleanedQuestion || answering) {
      input.focus();
      return null;
    }

    appendMessage(messages, "user", cleanedQuestion);
    input.value = "";
    setBusy(true, "Searching the library…");

    try {
      const books = await loadAssistantCatalog();
      const context = pageContext();
      const localReply = getLibraryAssistantReply(cleanedQuestion, books, context);
      let reply = localReply;

      if (!["popular", "newest", "upcoming", "current-book"].includes(localReply.intent)
        && !localReply.intent.startsWith("feature-")) {
        setBusy(true, "Thinking with Gemini…");
        try {
          const { askGemini } = await import("./firebase-ai-assistant.js");
          const prompt = buildLibraryAiPrompt(cleanedQuestion, books, { ...context, conversation });
          const answer = await askGemini(prompt);
          reply = {
            intent: "ai",
            message: answer,
            books: localReply.intent === "topic" ? localReply.books : [],
            action: null
          };
        } catch (error) {
          console.warn("Gemini is unavailable; using catalog results.", error);
          reply = {
            ...localReply,
            message: `Live AI is unavailable right now. ${localReply.message}`
          };
        }
      }

      conversation.push(
        { role: "user", text: cleanedQuestion },
        { role: "assistant", text: reply.message }
      );
      if (conversation.length > 6) conversation.splice(0, conversation.length - 6);
      appendAssistantReply(messages, reply);
      return reply;
    } catch (error) {
      const reply = {
        intent: "error",
        message: "I could not search the catalog just now. Please try again or browse the library.",
        books: [],
        action: safeFeatureActions.browse
      };
      console.warn("The Library Assistant could not answer this question.", error);
      appendAssistantReply(messages, reply);
      return reply;
    } finally {
      setBusy(false);
      if (!panel.hidden) input.focus();
    }
  }

  function handleLauncherClick() {
    if (panel.hidden) openAssistant();
    else closeAssistant();
  }

  function handleSubmit(event) {
    event.preventDefault();
    askAssistant(input.value);
  }

  function handleEscape(event) {
    if (event.key !== "Escape" || panel.hidden) return;
    event.preventDefault();
    closeAssistant();
  }

  launcher.addEventListener("click", handleLauncherClick);
  closeButton.addEventListener("click", () => closeAssistant());
  form.addEventListener("submit", handleSubmit);
  suggestionButtons.forEach((button) => {
    button.addEventListener("click", () => askAssistant(button.dataset.assistantQuery));
  });
  document.addEventListener("keydown", handleEscape);

  activeAssistantController = {
    root,
    open: openAssistant,
    close: closeAssistant,
    ask: askAssistant,
    destroy() {
      document.removeEventListener("keydown", handleEscape);
      root.remove();
      activeAssistantController = null;
    }
  };

  return activeAssistantController;
}
