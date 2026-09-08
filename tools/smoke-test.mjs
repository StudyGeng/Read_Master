import { readFile } from "node:fs/promises";

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

async function assertRejects(action, expectedText, message) {
  try {
    await action();
  } catch (error) {
    assert(String(error?.message || "").includes(expectedText), message);
    return;
  }

  throw new Error(message);
}

const service = await import("../public/js/firebase-service.js");
const readingStore = await import("../public/js/reading-store.js");
const bookAccess = await import("../public/js/book-access.js");

const cachedPublishedBooks = service.listCachedPublishedBooks();
assert(cachedPublishedBooks.length >= 10, "Expected cached demo books to load instantly.");
assert(
  cachedPublishedBooks.some((book) => book.resourceUrl.endsWith(".pdf") && book.coverUrl.includes(".svg")),
  "Expected demo books to include local PDF resources and cover images."
);

const pdfBook = cachedPublishedBooks.find((book) => book.resourceUrl.endsWith(".pdf"));
const guestPdfAccess = bookAccess.getBookAccess(pdfBook, null, "http://localhost/book-details.html");
assert(guestPdfAccess.canPreview, "Expected guests to be able to preview published books.");
assert(!guestPdfAccess.canRead, "Expected full reading to require a reader account.");
assert(!guestPdfAccess.canDownload, "Expected PDF downloads to require a reader account.");
assert(
  !JSON.stringify(guestPdfAccess).includes(pdfBook.resourceUrl),
  "Expected guest access decisions not to expose the full resource URL."
);

const memberPdfAccess = bookAccess.getBookAccess(pdfBook, { uid: "reader-test" }, "http://localhost/book-details.html");
assert(memberPdfAccess.canPreview, "Expected signed-in readers to retain preview access.");
assert(memberPdfAccess.canRead, "Expected signed-in readers to unlock full reading.");
assert(memberPdfAccess.canDownload, "Expected signed-in readers to unlock PDF downloads.");

const externalBook = cachedPublishedBooks.find((book) => book.resourceUrl && !book.resourceUrl.endsWith(".pdf"));
const guestExternalAccess = bookAccess.getBookAccess(externalBook, null);
const memberExternalAccess = bookAccess.getBookAccess(externalBook, { uid: "reader-test" });
assert(guestExternalAccess.canPreview && !guestExternalAccess.canRead, "Expected guests to preview external resources without opening them.");
assert(memberExternalAccess.canRead && !memberExternalAccess.canDownload, "Expected members to read non-PDF resources without a PDF download action.");

const missingResourceAccess = bookAccess.getBookAccess({ status: "published", resourceUrl: "" }, { uid: "reader-test" });
assert(missingResourceAccess.canPreview, "Expected published metadata to remain previewable without a resource link.");
assert(!missingResourceAccess.canRead && !missingResourceAccess.canDownload, "Expected missing resources to deny full access.");

const cachedUpcomingBook = service.listCachedUpcomingBooks()[0];
const upcomingAccess = bookAccess.getBookAccess(cachedUpcomingBook, { uid: "reader-test" });
assert(!upcomingAccess.canPreview, "Expected upcoming books not to expose a reading preview.");
assert(!upcomingAccess.canRead && !upcomingAccess.canDownload, "Expected upcoming books to deny full access.");

const loginReturnUrl = bookAccess.buildBookLoginUrl(pdfBook.id);
assert(loginReturnUrl.startsWith("login.html?returnTo="), "Expected protected actions to lead to reader login.");
assert(
  bookAccess.getSafeReturnPath("book-details.html?id=test-book", "http://localhost/login.html") === "book-details.html?id=test-book",
  "Expected a local book return URL to be accepted."
);
assert(
  bookAccess.getSafeReturnPath("https://example.com/phishing", "http://localhost/login.html") === "profile.html",
  "Expected an external return URL to be rejected."
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

const updatedUser = await service.updateUserProfile({ name: "Updated Reader" });
assert(updatedUser.name === "Updated Reader", "Expected a reader to update their display name.");
assert((await service.getCurrentUser()).name === "Updated Reader", "Expected profile changes to persist locally.");

await assertRejects(
  () => service.updateUserProfile({ name: "" }),
  "display name",
  "Expected blank profile names to be rejected."
);

await assertRejects(
  () => service.requestUserEmailChange("new-reader@example.com", "reader123"),
  "Firebase Authentication",
  "Expected demo mode to reject security-sensitive email changes."
);

await assertRejects(
  () => service.changeUserPassword("reader123", "new-reader-password"),
  "Firebase Authentication",
  "Expected demo mode to reject password changes."
);

const users = await service.listUsers();
assert(users.some((user) => user.email === "reader@example.com"), "Expected demo user list to include reader.");

await assertRejects(
  () => service.loginAdmin("test-admin@invalid.example", "not-a-real-password"),
  "Firebase Authentication",
  "Expected local demo admin access to stay disabled."
);

const securitySourceFiles = [
  "../public/js/firebase-config.js",
  "../public/js/firebase-service.js",
  "../public/js/admin-auth.js",
  "../public/admin/login.html"
];
const securitySource = (await Promise.all(
  securitySourceFiles.map((file) => readFile(new URL(file, import.meta.url), "utf8"))
)).join("\n");
const forbiddenAdminValues = [
  `admin${"@"}example.com`,
  `admin${123}`,
  `demo${"AdminPassword"}`
];
assert(
  forbiddenAdminValues.every((value) => !securitySource.includes(value)),
  "Expected public source files not to contain demo administrator credentials."
);

await service.updateBook(createdBook.id, {
  ...loadedBook,
  status: "draft"
});

const updatedBook = await service.getBook(createdBook.id);
assert(updatedBook.status === "draft", "Expected book update to work.");

await service.deleteBook(createdBook.id);
assert(!await service.getBook(createdBook.id), "Expected book delete to work.");

console.log("Smoke test passed.");
