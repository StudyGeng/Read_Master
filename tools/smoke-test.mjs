const store = new Map();

process.env.READ_MASTER_DEMO_MODE = "1";

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  }
};

globalThis.window = {
  crypto: globalThis.crypto
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const service = await import("../js/firebase-service.js");
const readingStore = await import("../js/reading-store.js");

const cachedPublishedBooks = service.listCachedPublishedBooks();
assert(cachedPublishedBooks.length >= 10, "Expected cached demo books to load instantly.");
assert(
  cachedPublishedBooks.some((book) => book.resourceUrl.endsWith(".pdf") && book.coverUrl.includes(".svg")),
  "Expected demo books to include local PDF resources and cover images."
);

const publishedBooks = await service.listPublishedBooks();
assert(publishedBooks.length >= 10, "Expected expanded demo books to load.");

const upcomingBooks = await service.listUpcomingBooks();
assert(upcomingBooks.length >= 1, "Expected upcoming demo books to load.");

const seedResult = await service.seedDemoBooks();
assert(seedResult.total >= 10, "Expected demo book seeding to be available.");

const createdBook = await service.createBook({
  title: "Smoke Test Book",
  author: "Read_Master",
  category: "Education",
  format: "PDF",
  language: "English",
  releaseDate: "2026-01-01",
  licenseType: "Creative Commons",
  licenseChecked: true,
  sourceName: "Smoke Test",
  resourceUrl: "https://example.com/book.pdf",
  coverUrl: "",
  status: "published",
  description: "Temporary smoke-test book."
});

assert(createdBook.id, "Expected created book to have an ID.");

const loadedBook = await service.getBook(createdBook.id);
assert(loadedBook.title === "Smoke Test Book", "Expected created book to be readable.");

readingStore.toggleSavedBook(createdBook.id);
assert(readingStore.isBookSaved(createdBook.id), "Expected reading-list storage to save a book.");

const userSession = await service.registerUser("Demo Reader", "reader@example.com", "reader123");
assert(userSession.email === "reader@example.com", "Expected demo user registration to work.");

const currentUser = await service.getCurrentUser();
assert(currentUser.name === "Demo Reader", "Expected demo user profile to be readable.");

const users = await service.listUsers();
assert(users.some((user) => user.email === "reader@example.com"), "Expected demo user list to include reader.");

const session = await service.loginAdmin("admin@example.com", "admin123");
assert(session.email === "admin@example.com", "Expected demo admin login to work.");

await service.updateBook(createdBook.id, {
  ...loadedBook,
  status: "draft"
});

const updatedBook = await service.getBook(createdBook.id);
assert(updatedBook.status === "draft", "Expected book update to work.");

await service.deleteBook(createdBook.id);
assert(!await service.getBook(createdBook.id), "Expected book delete to work.");

console.log("Smoke test passed.");
