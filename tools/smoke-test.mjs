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

function isFullTimestamp(value) {
  return typeof value === "string"
    && value.includes("T")
    && Number.isFinite(Date.parse(value));
}

async function assertRejects(action, expectedText, message) {
  try {
    await action();
  } catch (error) {
    const actualText = String(error?.message || "").toLowerCase();
    assert(actualText.includes(String(expectedText).toLowerCase()), message);
    return;
  }

  throw new Error(message);
}

const service = await import("../public/js/firebase-service.js");
const readingStore = await import("../public/js/reading-store.js");
const libraryStore = await import("../public/js/library-store.js");
const bookAccess = await import("../public/js/book-access.js");
const libraryAssistant = await import("../public/js/library-assistant.js");

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

const codingRecommendations = libraryAssistant.recommendLibraryBooks(
  "Recommend a coding book",
  publishedBooks
);
assert(codingRecommendations.length > 0, "Expected the Library Assistant to recommend catalog books.");
assert(codingRecommendations.length <= 3, "Expected the Library Assistant to return at most three books.");
assert(
  codingRecommendations.every((book) => publishedBooks.some((candidate) => candidate.id === book.id)),
  "Expected assistant recommendations to be grounded in the published catalog."
);
assert(
  libraryAssistant.getLibraryAssistantReply("How do reviews work?", publishedBooks).intent === "feature-reviews",
  "Expected the Library Assistant to explain review features."
);

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
assert(createdBook.viewCount === 0, "Expected new books to start with zero views.");
assert(createdBook.downloadCount === 0, "Expected new books to start with zero downloads.");
assert(isFullTimestamp(createdBook.createdAt), "Expected new books to include a full created timestamp.");

const loadedBook = await service.getBook(createdBook.id);
assert(loadedBook.title === "Smoke Test Book", "Expected created book to be readable.");
assert(isFullTimestamp(loadedBook.createdAt), "Expected loaded books to preserve their full created timestamp.");

const viewedBook = await service.recordBookInteraction(createdBook.id, "view");
assert(viewedBook.viewCount === 1, "Expected one view interaction to increment the view count exactly once.");
assert(viewedBook.downloadCount === 0, "Expected a view interaction not to increment downloads.");

const downloadedBook = await service.recordBookInteraction(createdBook.id, "download");
assert(downloadedBook.viewCount === 1, "Expected a download interaction not to increment views.");
assert(downloadedBook.downloadCount === 1, "Expected one download interaction to increment the download count exactly once.");

const interactedBook = await service.getBook(createdBook.id);
assert(interactedBook.viewCount === 1, "Expected the incremented view count to persist.");
assert(interactedBook.downloadCount === 1, "Expected the incremented download count to persist.");

await new Promise((resolve) => setTimeout(resolve, 20));
const newerCreatedBook = await service.createBook({
  title: "Newer Smoke Test Book",
  author: "Read_Master",
  category: "Education",
  format: "PDF",
  language: "English",
  releaseDate: "2000-01-01",
  licenseType: "Creative Commons",
  licenseChecked: true,
  sourceName: "Smoke Test",
  resourceUrl: "https://example.com/newer-book.pdf",
  coverUrl: "",
  status: "published",
  description: "A second temporary book used to verify created-time ordering."
});

assert(isFullTimestamp(newerCreatedBook.createdAt), "Expected subsequently created books to include a full timestamp.");
const booksByCreatedTime = await service.listPublishedBooks();
const originalCreatedIndex = booksByCreatedTime.findIndex((book) => book.id === createdBook.id);
const newerCreatedIndex = booksByCreatedTime.findIndex((book) => book.id === newerCreatedBook.id);
assert(originalCreatedIndex >= 0 && newerCreatedIndex >= 0, "Expected both temporary books in the published catalog.");
assert(newerCreatedIndex < originalCreatedIndex, "Expected recently created books to sort ahead of older additions regardless of release date.");

localStorage.setItem("readmaster:reading-list", JSON.stringify(["legacy-favorite"]));
readingStore.toggleSavedBook(createdBook.id);
assert(readingStore.isBookSaved(createdBook.id), "Expected reading-list storage to save a book.");
assert(readingStore.isBookSaved("legacy-favorite"), "Expected the previous unscoped favorites list to migrate.");
assert(localStorage.getItem("readmaster:reading-list") === null, "Expected favorites migration to retire the legacy key.");

const userSession = await service.registerUser("Demo Reader", "reader@example.com", "reader123");
assert(userSession.email === "reader@example.com", "Expected demo user registration to work.");
assert(readingStore.isBookSaved(createdBook.id), "Expected guest favorites to follow the reader who signs in.");
assert(readingStore.isBookSaved("legacy-favorite"), "Expected migrated favorites to follow the reader who signs in.");

const currentUser = await service.getCurrentUser();
assert(currentUser.name === "Demo Reader", "Expected demo user profile to be readable.");

await libraryStore.clearLibraryActivity();
const openedActivity = libraryStore.recordBookActivity(createdBook.id, "opened");
assert(openedActivity.openCount === 1, "Expected opening a book to populate its open count.");
assert(isFullTimestamp(openedActivity.firstOpenedAt), "Expected opening a book to populate its first-opened timestamp.");
assert(isFullTimestamp(openedActivity.lastOpenedAt), "Expected opening a book to populate its latest-opened timestamp.");
assert(isFullTimestamp(openedActivity.openedAt), "Expected opening a book to populate its compatibility timestamp.");

const readActivity = libraryStore.recordBookActivity(createdBook.id, "read");
assert(readActivity.readCount === 1, "Expected reading a book to populate its read count.");
assert(isFullTimestamp(readActivity.lastReadAt), "Expected reading a book to populate its read timestamp.");
assert(isFullTimestamp(readActivity.readAt), "Expected reading a book to populate its compatibility timestamp.");

const activityAfterDownload = libraryStore.recordBookActivity(createdBook.id, "downloaded");
assert(activityAfterDownload.downloadCount === 1, "Expected downloading a book to populate its activity count.");
assert(isFullTimestamp(activityAfterDownload.lastDownloadedAt), "Expected downloading a book to populate its activity timestamp.");
assert(isFullTimestamp(activityAfterDownload.downloadedAt), "Expected downloading a book to populate its compatibility timestamp.");

const reopenedActivity = libraryStore.recordBookActivity(createdBook.id, "opened");
assert(reopenedActivity.openCount === 2, "Expected a second open to increment the activity count exactly once.");
const storedActivity = libraryStore.getBookActivity(createdBook.id);
assert(storedActivity?.readCount === 1, "Expected per-book activity to retain read state.");
assert(storedActivity?.downloadCount === 1, "Expected per-book activity to retain download state.");
assert(
  libraryStore.getLibraryActivity().some((activity) => activity.bookId === createdBook.id),
  "Expected library activity to include the interacted book."
);

const hydratedActivity = await libraryStore.hydrateLibraryActivityForCurrentUser();
assert(
  hydratedActivity.some((activity) => activity.bookId === createdBook.id),
  "Expected library activity hydration to preserve local demo activity."
);

const initialReviews = await service.listBookReviews(createdBook.id);
assert(initialReviews.length === 0, "Expected a newly created book to start without reviews.");

await service.saveBookReview(createdBook.id, {
  rating: 5,
  comment: "A useful smoke-test review."
});
let reviews = await service.listBookReviews(createdBook.id);
assert(reviews.length === 1, "Expected a saved review to be listed.");
assert(reviews[0].rating === 5, "Expected a saved review to preserve its rating.");
assert(reviews[0].comment === "A useful smoke-test review.", "Expected a saved review to preserve its comment.");
assert(isFullTimestamp(reviews[0].createdAt), "Expected a saved review to include a created timestamp.");

await service.saveBookReview(createdBook.id, {
  rating: 4,
  comment: "An updated smoke-test review."
});
reviews = await service.listBookReviews(createdBook.id);
assert(reviews.length === 1, "Expected review updates not to create a duplicate review.");
assert(reviews[0].rating === 4, "Expected a review update to replace the rating.");
assert(reviews[0].comment === "An updated smoke-test review.", "Expected a review update to replace the comment.");
assert(isFullTimestamp(reviews[0].updatedAt), "Expected an updated review to include an updated timestamp.");

await assertRejects(
  () => service.saveBookReview(createdBook.id, { rating: 0, comment: "Invalid rating." }),
  "rating",
  "Expected out-of-range review ratings to be rejected."
);

await assertRejects(
  () => service.saveBookReview(createdBook.id, { rating: 5, comment: "   " }),
  "comment",
  "Expected blank review comments to be rejected."
);

await service.deleteBookReview(createdBook.id);
assert((await service.listBookReviews(createdBook.id)).length === 0, "Expected a deleted review to be removed.");

const updatedUser = await service.updateUserProfile({ name: "Updated Reader" });
assert(updatedUser.name === "Updated Reader", "Expected a reader to update their display name.");
assert((await service.getCurrentUser()).name === "Updated Reader", "Expected profile changes to persist locally.");

const publicProfile = await service.updatePublicProfileSettings({
  bio: "I enjoy open educational books.",
  isPublic: true,
  showReadingHistory: true
});
assert(publicProfile.isPublic, "Expected readers to opt in to a public profile.");
assert(publicProfile.showReadingHistory, "Expected readers to opt in to shared read history.");
assert(publicProfile.bio === "I enjoy open educational books.", "Expected a public bio to persist.");
assert(
  (await service.getPublicReaderProfile(updatedUser.uid))?.displayName === "Updated Reader",
  "Expected a public reader profile to expose only the display identity."
);
assert(
  (await service.listPublicReadingHistory(updatedUser.uid)).some((activity) => activity.bookId === createdBook.id),
  "Expected completed books to appear in opted-in public reading history."
);

const notification = await service.createNotification({
  title: "Smoke test update",
  message: "A new library update is ready.",
  kind: "announcement",
  linkUrl: "index.html#libraryShelf",
  active: true
});
assert(notification.id, "Expected an administrator notification to receive an ID.");
assert(
  service.getCachedNotifications().some((item) => item.id === notification.id),
  "Expected active notifications to be available to the reader bell."
);
await service.markCurrentUserNotificationsRead([notification]);
assert(
  (await service.listCurrentUserNotificationReads()).some((read) => read.notificationId === notification.id),
  "Expected notification read state to persist for the current reader."
);
await assertRejects(
  () => service.createNotification({
    title: "Unsafe link",
    message: "This link must stay inside Read_Master.",
    kind: "announcement",
    linkUrl: "https://example.com/outside"
  }),
  "inside Read_Master",
  "Expected external notification links to be rejected."
);

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

await libraryStore.clearLibraryActivity();
assert(libraryStore.getLibraryActivity().length === 0, "Expected clearing activity to empty My Library history.");
assert(
  (await service.listPublicReadingHistory(updatedUser.uid)).length === 0,
  "Expected clearing read activity to clear the shared read-history view."
);

if (readingStore.isBookSaved(createdBook.id)) readingStore.toggleSavedBook(createdBook.id);
assert(!readingStore.isBookSaved(createdBook.id), "Expected the temporary saved book to be cleaned up.");

await service.logoutUser();
assert(!readingStore.isBookSaved("legacy-favorite"), "Expected signed-out guests not to inherit a reader's favorites.");

const secondReader = await service.loginUser("second-reader@example.com", "reader123");
assert(secondReader.uid !== userSession.uid, "Expected the second demo reader to have a separate account scope.");
assert(!readingStore.isBookSaved("legacy-favorite"), "Expected a second reader not to inherit the first reader's favorites.");
assert(
  !(await service.listCurrentUserNotificationReads()).some((read) => read.notificationId === notification.id),
  "Expected notification read state to stay isolated between readers."
);
await service.saveProfileComment(updatedUser.uid, "Your shared reading list is helpful.");
await service.saveProfileComment(updatedUser.uid, "Your shared book history is very helpful.");
let profileWallComments = await service.listProfileComments(updatedUser.uid);
assert(profileWallComments.length === 1, "Expected one editable profile comment per visitor.");
assert(
  profileWallComments[0].comment === "Your shared book history is very helpful.",
  "Expected reposting a profile comment to update it instead of duplicating it."
);
readingStore.toggleSavedBook("second-reader-favorite");
await service.logoutUser();

await service.loginUser("reader@example.com", "reader123");
assert(readingStore.isBookSaved("legacy-favorite"), "Expected the first reader's favorites to return after signing back in.");
assert(!readingStore.isBookSaved("second-reader-favorite"), "Expected reader favorites to stay isolated on a shared device.");
readingStore.clearSavedBooks();
assert(readingStore.getSavedIds().length === 0, "Expected scoped favorite cleanup to clear the active reader only.");
await service.deleteProfileComment(updatedUser.uid, secondReader.uid);
profileWallComments = await service.listProfileComments(updatedUser.uid);
assert(profileWallComments.length === 0, "Expected a profile owner to moderate comments on their profile.");

await service.setNotificationActive(notification.id, false);
assert(
  !service.getCachedNotifications().some((item) => item.id === notification.id),
  "Expected inactive notifications to disappear from the reader bell."
);
await service.deleteNotification(notification.id);
assert(
  !(await service.listAllNotifications()).some((item) => item.id === notification.id),
  "Expected deleted notifications to be removed."
);

await service.deleteBook(createdBook.id);
assert(!await service.getBook(createdBook.id), "Expected book delete to work.");

await service.deleteBook(newerCreatedBook.id);
assert(!await service.getBook(newerCreatedBook.id), "Expected the ordering fixture book to be cleaned up.");

console.log("Smoke test passed.");
