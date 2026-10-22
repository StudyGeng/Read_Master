import {
  firebaseCollections,
  firebaseConfig,
  hasFirebaseConfig,
  recaptchaEnterpriseSiteKey
} from "./firebase-config.js";
import {
  clearLocalLibraryActivity,
  getLocalLibraryActivity,
  mergeLocalLibraryActivity,
  recordLocalBookActivity
} from "./library-store.js";
import {
  adoptGuestSavedBooksForUser,
  getSavedIdsForUser,
  replaceSavedIdsForUser
} from "./reading-store.js";
import { sampleBooks } from "./sample-data.js";

const firebaseSdkVersion = "13.1.0";
const booksKey = "readmaster:books";
const usersKey = "readmaster:users";
const reviewsKey = "readmaster:book-reviews:v1";
const publicProfilesKey = "readmaster:public-profiles:v1";
const profileCommentsKey = "readmaster:profile-comments:v1";
const notificationsKey = "readmaster:notifications:v1";
const notificationReadsKey = "readmaster:notification-reads:v1";
const sampleDataVersionKey = "readmaster:sample-data-version";
const sampleDataVersion = "9";
const adminSessionKey = "readmaster:admin-session";
const userSessionKey = "readmaster:demo-user-session";
const forceDemoMode = globalThis.process?.env?.READ_MASTER_DEMO_MODE === "1";
const configured = hasFirebaseConfig() && !forceDemoMode;
const firebaseReadTimeoutMs = 2500;
const sampleCoverVersion = "trade-cover-2";
const allowedLicenseTypeValues = [
  "Public Domain",
  "Creative Commons",
  "Open Educational Resource",
  "Open Documentation",
  "Open Resource",
  "School-owned",
  "Author-approved"
];
const allowedLicenseTypes = new Set(allowedLicenseTypeValues);
const profilePhotoMaxBytes = 2 * 1024 * 1024;
const profilePhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const reviewCommentMaxLength = 1000;
const profileCommentMaxLength = 500;
const notificationMessageMaxLength = 400;
const notificationKinds = new Set(["announcement", "new-book", "maintenance"]);
const bookInteractionTypes = new Set(["view", "download"]);
const libraryActivityTypes = new Set(["opened", "read", "downloaded"]);
const sampleBookIds = new Set(sampleBooks.map((book) => book.id));

let firebasePromise;

function withTimeout(promise, label, timeoutMs = firebaseReadTimeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} is taking too long. Showing demo data for now.`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}

export function isFirebaseEnabled() {
  return configured;
}

export function getDataModeLabel() {
  return configured ? "Firebase connected" : "Demo mode using local storage";
}

async function getFirebase() {
  if (!configured) return null;

  if (!firebasePromise) {
    const appCheckImport = import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-app-check.js`)
      .then((module) => ({ module, error: null }), (error) => ({ module: null, error }));

    firebasePromise = Promise.all([
      import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-auth.js`),
      appCheckImport
    ]).then(([appModule, firestoreModule, authModule, appCheckImportResult]) => {
      const app = appModule.getApps().length
        ? appModule.getApp()
        : appModule.initializeApp(firebaseConfig);

      let appCheck = null;
      let appCheckError = appCheckImportResult.error;
      if (appCheckImportResult.module && recaptchaEnterpriseSiteKey) {
        try {
          appCheck = appCheckImportResult.module.initializeAppCheck(app, {
            provider: new appCheckImportResult.module.ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey),
            isTokenAutoRefreshEnabled: true
          });
        } catch (error) {
          appCheckError = error;
          console.warn("Firebase App Check could not initialize; AI answers are unavailable.", error);
        }
      }

      return {
        app,
        appCheck,
        appCheckError,
        db: firestoreModule.getFirestore(app),
        auth: authModule.getAuth(app),
        appModule,
        firestoreModule,
        authModule
      };
    });
  }

  return firebasePromise;
}

export async function getFirebaseAIContext() {
  const firebase = await getFirebase();
  if (!firebase?.appCheck) {
    throw firebase?.appCheckError || new Error("Firebase App Check is unavailable.");
  }
  return { app: firebase.app, sdkVersion: firebaseSdkVersion };
}

function getFirebaseForRead(label) {
  return withTimeout(getFirebase(), label);
}

function readLocal(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function readUserSession() {
  const session = readLocal(userSessionKey, null);
  return session?.uid ? session : null;
}

function storeUserSession(session) {
  if (!session) {
    localStorage.removeItem(userSessionKey);
    return;
  }

  const storedSession = {
    ...session,
    cachedAt: new Date().toISOString()
  };
  writeLocal(userSessionKey, storedSession);
  upsertLocalPublicProfile(storedSession);
}

export function getCachedUser() {
  return readUserSession();
}

function readAdminSession() {
  const session = readLocal(adminSessionKey, null);
  return session?.uid && session?.role === "admin" ? session : null;
}

function storeAdminSession(session) {
  if (!session) {
    localStorage.removeItem(adminSessionKey);
    return;
  }

  writeLocal(adminSessionKey, {
    ...session,
    cachedAt: new Date().toISOString()
  });
}

export function getCachedAdmin() {
  return readAdminSession();
}

function clearCachedAdminSession() {
  storeAdminSession(null);
}

function clearCachedUserSession() {
  storeUserSession(null);
}

function createLocalId(prefix = "book") {
  if (window.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function timestampToDateInput(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (value.toDate) return value.toDate().toISOString().slice(0, 10);
  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000).toISOString().slice(0, 10);
  }
  return "";
}

function timestampToIso(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value.seconds === "number") {
    return new Date((value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1e6)).toISOString();
  }
  return "";
}

function normalizedNonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  if (Number.isFinite(number) && number >= 0) return Math.floor(number);
  return Math.max(0, Math.floor(Number(fallback) || 0));
}

function normalizedTrendScore(value) {
  const score = Number(value || 0);
  return Number.isFinite(score) && score > 0 ? score : 0;
}

function legacyInteractionCounts(data = {}) {
  const trendScore = normalizedTrendScore(data.trendScore ?? data.trend_score);
  return {
    viewCount: normalizedNonNegativeInteger(
      data.viewCount ?? data.view_count,
      trendScore * 12
    ),
    downloadCount: normalizedNonNegativeInteger(
      data.downloadCount ?? data.download_count,
      trendScore * 3
    )
  };
}

function normalizeBook(data, id = data.id) {
  const normalizedId = id || data.id;
  const generatedCoverUrl = sampleBookIds.has(normalizedId)
    ? `assets/covers/${normalizedId}.svg?v=${sampleCoverVersion}`
    : "";
  const rawCoverUrl = data.coverUrl || data.cover_image || "";
  const coverUrl = generatedCoverUrl && (!rawCoverUrl || rawCoverUrl.startsWith(`assets/covers/${normalizedId}.svg`))
    ? generatedCoverUrl
    : rawCoverUrl;

  const interactionCounts = legacyInteractionCounts(data);

  return {
    id: normalizedId,
    title: data.title || "Untitled Book",
    author: data.author || "Unknown Author",
    category: data.category || "Education",
    format: data.format || "PDF",
    language: data.language || "English",
    releaseDate: timestampToDateInput(data.releaseDate || data.release_date || data.publishedYear),
    licenseType: data.licenseType || data.license_type || "Free Resource",
    licenseChecked: Boolean(data.licenseChecked || data.license_checked),
    sourceName: data.sourceName || data.source_name || "",
    resourceUrl: data.resourceUrl || data.resource_url || "",
    coverUrl,
    status: data.status || "published",
    viewCount: interactionCounts.viewCount,
    downloadCount: interactionCounts.downloadCount,
    trendScore: normalizedTrendScore(data.trendScore ?? data.trend_score),
    description: data.description || "",
    createdAt: timestampToIso(data.createdAt || data.created_at),
    updatedAt: timestampToIso(data.updatedAt || data.updated_at)
  };
}

function normalizeReview(data = {}, id = data.userId || data.id, bookId = data.bookId) {
  return {
    id: String(id || data.userId || "").trim(),
    bookId: String(bookId || data.bookId || "").trim(),
    userId: String(data.userId || id || "").trim(),
    userName: String(data.userName || "Reader").trim().slice(0, 80) || "Reader",
    rating: normalizedNonNegativeInteger(data.rating),
    comment: String(data.comment || "").trim().slice(0, reviewCommentMaxLength),
    createdAt: timestampToIso(data.createdAt || data.created_at),
    updatedAt: timestampToIso(data.updatedAt || data.updated_at)
  };
}

function validateReviewInput(review = {}) {
  const rating = Number(review.rating);
  const comment = String(review.comment || "").trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("Please choose a rating from 1 to 5.");
  }
  if (comment.length < 3) throw new Error("Review comments must be at least 3 characters.");
  if (comment.length > reviewCommentMaxLength) {
    throw new Error(`Review comments must be ${reviewCommentMaxLength} characters or fewer.`);
  }

  return { rating, comment };
}

function readLocalReviews() {
  const reviews = readLocal(reviewsKey, []);
  return Array.isArray(reviews)
    ? reviews.map((review) => normalizeReview(review)).filter((review) => {
        return review.id
          && review.bookId
          && review.rating >= 1
          && review.rating <= 5
          && review.comment.length >= 3;
      })
    : [];
}

function writeLocalReviews(reviews) {
  const normalized = (Array.isArray(reviews) ? reviews : [])
    .map((review) => normalizeReview(review))
    .filter((review) => {
      return review.id
        && review.bookId
        && review.rating >= 1
        && review.rating <= 5
        && review.comment.length >= 3;
    })
    .slice(0, 500);
  writeLocal(reviewsKey, normalized);
}

function cacheBookReviews(bookId, reviews) {
  const otherReviews = readLocalReviews().filter((review) => review.bookId !== bookId);
  writeLocalReviews([...reviews, ...otherReviews]);
}

function upsertLocalReview(review) {
  const normalized = normalizeReview(review);
  const reviews = readLocalReviews().filter((item) => {
    return item.bookId !== normalized.bookId || item.userId !== normalized.userId;
  });
  writeLocalReviews([normalized, ...reviews]);
  return normalized;
}

function removeLocalReview(bookId, userId) {
  writeLocalReviews(readLocalReviews().filter((review) => {
    return review.bookId !== bookId || review.userId !== userId;
  }));
}

function sortReviewsNewest(a, b) {
  const dateCompare = String(b.updatedAt || b.createdAt || "")
    .localeCompare(String(a.updatedAt || a.createdAt || ""));
  return dateCompare || String(a.userName || "").localeCompare(String(b.userName || ""));
}

function normalizePublicProfile(data = {}, id = data.userId || data.uid || data.id) {
  const userId = String(id || data.userId || data.uid || "").trim();
  const isPublic = Boolean(data.isPublic);

  return {
    userId,
    displayName: String(data.displayName || data.name || "Reader").trim().slice(0, 80) || "Reader",
    avatarURL: String(data.avatarURL || data.photoURL || "").trim().slice(0, 2048),
    bio: String(data.bio || "").trim().slice(0, 300),
    isPublic,
    showReadingHistory: isPublic && Boolean(data.showReadingHistory),
    joinedAt: timestampToIso(data.joinedAt || data.createdAt),
    updatedAt: timestampToIso(data.updatedAt)
  };
}

function readLocalPublicProfiles() {
  const profiles = readLocal(publicProfilesKey, []);
  return Array.isArray(profiles)
    ? profiles.map((profile) => normalizePublicProfile(profile)).filter((profile) => profile.userId)
    : [];
}

function writeLocalPublicProfiles(profiles) {
  writeLocal(publicProfilesKey, (Array.isArray(profiles) ? profiles : [])
    .map((profile) => normalizePublicProfile(profile))
    .filter((profile) => profile.userId));
}

function upsertLocalPublicProfile(profileData) {
  const userId = String(profileData?.userId || profileData?.uid || "").trim();
  if (!userId) return null;

  const profiles = readLocalPublicProfiles();
  const index = profiles.findIndex((profile) => profile.userId === userId);
  const existing = index >= 0 ? profiles[index] : null;
  const nextProfile = normalizePublicProfile({
    ...existing,
    ...profileData,
    userId,
    displayName: profileData.displayName || profileData.name || existing?.displayName,
    avatarURL: profileData.avatarURL ?? profileData.photoURL ?? existing?.avatarURL,
    isPublic: profileData.isPublic ?? existing?.isPublic ?? false,
    showReadingHistory: profileData.showReadingHistory ?? existing?.showReadingHistory ?? false,
    joinedAt: profileData.joinedAt || existing?.joinedAt,
    updatedAt: profileData.updatedAt || new Date().toISOString()
  }, userId);

  if (index >= 0) profiles[index] = nextProfile;
  else profiles.unshift(nextProfile);
  writeLocalPublicProfiles(profiles);
  return nextProfile;
}

function normalizeProfileComment(data = {}, id = data.id || data.authorId, profileId = data.profileId) {
  return {
    id: String(id || data.id || data.authorId || "").trim(),
    profileId: String(profileId || data.profileId || "").trim(),
    authorId: String(data.authorId || id || "").trim(),
    authorName: String(data.authorName || "Reader").trim().slice(0, 80) || "Reader",
    authorPhotoURL: String(data.authorPhotoURL || "").trim().slice(0, 2048),
    comment: String(data.comment || "").trim().slice(0, profileCommentMaxLength),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt)
  };
}

function readLocalProfileComments() {
  const comments = readLocal(profileCommentsKey, []);
  return Array.isArray(comments)
    ? comments.map((comment) => normalizeProfileComment(comment)).filter((comment) => {
        return comment.id && comment.profileId && comment.authorId && comment.comment.length >= 3;
      })
    : [];
}

function writeLocalProfileComments(comments) {
  writeLocal(profileCommentsKey, (Array.isArray(comments) ? comments : [])
    .map((comment) => normalizeProfileComment(comment))
    .filter((comment) => comment.id && comment.profileId && comment.authorId && comment.comment.length >= 3)
    .slice(0, 1000));
}

function sortProfileCommentsNewest(a, b) {
  return String(b.updatedAt || b.createdAt || "")
    .localeCompare(String(a.updatedAt || a.createdAt || ""));
}

function validateProfileCommentInput(value) {
  const comment = String(value || "").trim();
  if (comment.length < 3) throw new Error("Profile comments must be at least 3 characters.");
  if (comment.length > profileCommentMaxLength) {
    throw new Error(`Profile comments must be ${profileCommentMaxLength} characters or fewer.`);
  }
  return comment;
}

function safeNotificationLink(value) {
  const linkUrl = String(value || "").trim();
  if (!linkUrl) return "";

  try {
    const baseUrl = new URL("https://read-master.local/");
    const parsed = new URL(linkUrl, baseUrl);
    if (parsed.origin !== baseUrl.origin || parsed.username || parsed.password || linkUrl.includes("\\")) {
      throw new Error("external or unsafe address");
    }
    return linkUrl.slice(0, 500);
  } catch {
    throw new Error("Notification links must point to a page inside Read_Master.");
  }
}

function normalizeNotification(data = {}, id = data.id) {
  const kind = notificationKinds.has(data.kind) ? data.kind : "announcement";
  return {
    id: String(id || data.id || "").trim(),
    title: String(data.title || "Library update").trim().slice(0, 80) || "Library update",
    message: String(data.message || "").trim().slice(0, notificationMessageMaxLength),
    kind,
    linkUrl: String(data.linkUrl || data.link || "").trim().slice(0, 500),
    active: Boolean(data.active),
    createdBy: String(data.createdBy || "").trim(),
    createdByName: String(data.createdByName || "Administrator").trim().slice(0, 80) || "Administrator",
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt)
  };
}

function validateNotificationInput(notification = {}) {
  const title = String(notification.title || "").trim();
  const message = String(notification.message || "").trim();
  const kind = String(notification.kind || "announcement").trim();

  if (!title) throw new Error("Notification title is required.");
  if (title.length > 80) throw new Error("Notification titles must be 80 characters or fewer.");
  if (message.length < 3) throw new Error("Notification messages must be at least 3 characters.");
  if (message.length > notificationMessageMaxLength) {
    throw new Error(`Notification messages must be ${notificationMessageMaxLength} characters or fewer.`);
  }
  if (!notificationKinds.has(kind)) throw new Error("Choose a valid notification type.");

  return {
    title,
    message,
    kind,
    linkUrl: safeNotificationLink(notification.linkUrl),
    active: notification.active !== false
  };
}

function readLocalNotifications() {
  const notifications = readLocal(notificationsKey, []);
  return Array.isArray(notifications)
    ? notifications.map((notification) => normalizeNotification(notification)).filter((notification) => {
        return notification.id && notification.title && notification.message;
      })
    : [];
}

function writeLocalNotifications(notifications) {
  writeLocal(notificationsKey, (Array.isArray(notifications) ? notifications : [])
    .map((notification) => normalizeNotification(notification))
    .filter((notification) => notification.id && notification.title && notification.message)
    .slice(0, 100));
}

function sortNotificationsNewest(a, b) {
  return String(b.updatedAt || b.createdAt || "")
    .localeCompare(String(a.updatedAt || a.createdAt || ""));
}

function notificationVersion(notification) {
  return String(notification?.updatedAt || notification?.createdAt || "");
}

function notificationReadScope(userId = "") {
  const uid = String(userId || readUserSession()?.uid || "").trim();
  return uid ? `user:${uid}` : "guest";
}

function readLocalNotificationReadStore() {
  const stored = readLocal(notificationReadsKey, {});
  const scopes = stored?.scopes;
  return {
    version: 1,
    scopes: scopes && typeof scopes === "object" && !Array.isArray(scopes) ? scopes : {}
  };
}

function writeLocalNotificationReadStore(store) {
  writeLocal(notificationReadsKey, { version: 1, scopes: store.scopes || {} });
}

function listLocalNotificationReads(userId = "") {
  const reads = readLocalNotificationReadStore().scopes[notificationReadScope(userId)];
  if (!reads || typeof reads !== "object" || Array.isArray(reads)) return [];

  return Object.entries(reads).map(([id, version]) => ({
    notificationId: id,
    version: String(version || "")
  }));
}

function markLocalNotificationsRead(notifications, userId = "") {
  const store = readLocalNotificationReadStore();
  const scope = notificationReadScope(userId);
  const reads = {
    ...(store.scopes[scope] && typeof store.scopes[scope] === "object" ? store.scopes[scope] : {})
  };

  (Array.isArray(notifications) ? notifications : []).forEach((notification) => {
    if (notification?.id) reads[notification.id] = notificationVersion(notification);
  });
  store.scopes[scope] = reads;
  writeLocalNotificationReadStore(store);
  return listLocalNotificationReads(userId);
}

function normalizeLibraryActivity(data = {}, bookId = data.bookId) {
  const lastOpenedAt = timestampToIso(data.lastOpenedAt || data.openedAt);
  const lastReadAt = timestampToIso(data.lastReadAt || data.readAt);
  const lastDownloadedAt = timestampToIso(data.lastDownloadedAt || data.downloadedAt);

  return {
    bookId: String(bookId || data.bookId || "").trim(),
    firstOpenedAt: timestampToIso(data.firstOpenedAt || lastOpenedAt),
    lastOpenedAt,
    openedAt: lastOpenedAt,
    openCount: normalizedNonNegativeInteger(data.openCount ?? data.openedCount),
    lastReadAt,
    readAt: lastReadAt,
    readCount: normalizedNonNegativeInteger(data.readCount),
    lastDownloadedAt,
    downloadedAt: lastDownloadedAt,
    downloadCount: normalizedNonNegativeInteger(data.downloadCount ?? data.downloadedCount),
    updatedAt: timestampToIso(data.updatedAt)
  };
}

function normalizePublicReadingHistory(data = {}, bookId = data.bookId) {
  return {
    bookId: String(bookId || data.bookId || "").trim(),
    userId: String(data.userId || "").trim(),
    readCount: normalizedNonNegativeInteger(data.readCount),
    lastReadAt: timestampToIso(data.lastReadAt || data.readAt),
    updatedAt: timestampToIso(data.updatedAt)
  };
}

function validateLibraryActivityType(type) {
  if (!libraryActivityTypes.has(type)) {
    throw new Error("Activity type must be opened, read, or downloaded.");
  }
}

export function isPublicBook(book) {
  return Boolean(
    book
    && book.licenseChecked
    && allowedLicenseTypes.has(book.licenseType)
    && ["published", "upcoming"].includes(book.status)
  );
}

function cleanBookPayload(bookData) {
  return {
    title: String(bookData.title || "").trim(),
    author: String(bookData.author || "").trim(),
    category: String(bookData.category || "Education").trim(),
    format: String(bookData.format || "PDF").trim(),
    language: String(bookData.language || "English").trim(),
    releaseDate: String(bookData.releaseDate || "").trim(),
    licenseType: String(bookData.licenseType || "").trim(),
    licenseChecked: Boolean(bookData.licenseChecked),
    sourceName: String(bookData.sourceName || "").trim(),
    resourceUrl: String(bookData.resourceUrl || "").trim(),
    coverUrl: String(bookData.coverUrl || "").trim(),
    status: String(bookData.status || "published").trim(),
    description: String(bookData.description || "").trim()
  };
}

function getLocalBooks() {
  const storedBooks = readLocal(booksKey, null);

  if (storedBooks === null) {
    const seededBooks = sampleBooks.map((book) => normalizeBook(book));
    writeLocal(booksKey, seededBooks);
    localStorage.setItem(sampleDataVersionKey, sampleDataVersion);
    return seededBooks;
  }

  if (!Array.isArray(storedBooks)) return [];

  const storedVersion = localStorage.getItem(sampleDataVersionKey);
  if (storedVersion !== sampleDataVersion) {
    const sampleBookById = new Map(sampleBooks.map((book) => [book.id, book]));
    const storedIds = new Set(storedBooks.map((book) => book.id));
    const newSampleBooks = sampleBooks
      .filter((book) => !storedIds.has(book.id))
      .map((book) => normalizeBook(book));
    const refreshedBooks = storedBooks.map((book) => {
      const sampleBook = sampleBookById.get(book.id);
      if (!sampleBook) return normalizeBook(book);

      return normalizeBook({
        ...sampleBook,
        ...book,
        licenseChecked: book.licenseChecked ?? sampleBook.licenseChecked
      }, book.id);
    });
    const mergedBooks = [...newSampleBooks, ...refreshedBooks];

    writeLocal(booksKey, mergedBooks);
    localStorage.setItem(sampleDataVersionKey, sampleDataVersion);
    return mergedBooks;
  }

  return storedBooks;
}

function setLocalBooks(books) {
  writeLocal(booksKey, books);
}

function sortNewest(a, b) {
  const createdCompare = String(b.createdAt || b.releaseDate || "")
    .localeCompare(String(a.createdAt || a.releaseDate || ""));
  if (createdCompare) return createdCompare;

  const releaseCompare = String(b.releaseDate || "").localeCompare(String(a.releaseDate || ""));
  if (releaseCompare) return releaseCompare;

  return String(a.title || "").localeCompare(String(b.title || ""));
}

function safeFileName(name) {
  return String(name || "file").replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
}

function validateBookPayload(payload, files = {}) {
  if (!payload.title || !payload.author || !payload.description || !payload.licenseType) {
    throw new Error("Title, author, license type, and description are required.");
  }

  if (!allowedLicenseTypes.has(payload.licenseType)) {
    throw new Error("Please choose an approved license/source type.");
  }

  if (!payload.sourceName) {
    throw new Error("Please enter the official source name for this resource.");
  }

  if (!payload.licenseChecked) {
    throw new Error("Please confirm the legal source and license before saving.");
  }

  if (payload.status === "published" && !payload.resourceUrl && !files.resourceFile) {
    throw new Error("Published books need an official resource URL or an approved uploaded file.");
  }
}

async function uploadBookFile(bookId, file, type) {
  if (!file || !configured) return "";

  const firebase = await getFirebase();
  const storageModule = await import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-storage.js`);
  const storage = storageModule.getStorage(firebase.app);
  const path = `books/${bookId}/${type}-${Date.now()}-${safeFileName(file.name)}`;
  const storageRef = storageModule.ref(storage, path);

  await storageModule.uploadBytes(storageRef, file);
  return storageModule.getDownloadURL(storageRef);
}

function validateProfilePhoto(file) {
  if (!file) return;
  if (!profilePhotoTypes.has(file.type)) {
    throw new Error("Profile photos must be JPG, PNG, or WebP images.");
  }
  if (file.size > profilePhotoMaxBytes) {
    throw new Error("Profile photos must be smaller than 2 MB.");
  }
}

function profilePhotoDataUrl(file) {
  validateProfilePhoto(file);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
    reader.addEventListener("error", () => reject(new Error("The selected profile photo could not be read.")), { once: true });
    reader.readAsDataURL(file);
  });
}

async function uploadProfilePhoto(firebase, userId, file) {
  validateProfilePhoto(file);
  const storageModule = await import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-storage.js`);
  const storage = storageModule.getStorage(firebase.app);
  const path = `profile-images/${userId}/avatar-${Date.now()}-${safeFileName(file.name)}`;
  const storageRef = storageModule.ref(storage, path);

  await storageModule.uploadBytes(storageRef, file, { contentType: file.type });
  return {
    photoURL: await storageModule.getDownloadURL(storageRef),
    photoPath: path
  };
}

async function deleteProfilePhoto(firebase, photoPath) {
  if (!photoPath) return;

  const storageModule = await import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-storage.js`);
  const storage = storageModule.getStorage(firebase.app);

  try {
    await storageModule.deleteObject(storageModule.ref(storage, photoPath));
  } catch (error) {
    if (error?.code !== "storage/object-not-found") throw error;
  }
}

async function getAdminDoc(uid) {
  const firebase = await getFirebase();
  const { db, firestoreModule } = firebase;
  return firestoreModule.getDoc(
    firestoreModule.doc(db, firebaseCollections.admins, uid)
  );
}

async function getAdminAccessStatus(uid) {
  if (!uid) {
    return {
      allowed: false,
      reason: "No signed-in Firebase user was found."
    };
  }

  const adminDoc = await getAdminDoc(uid);
  if (!adminDoc.exists()) {
    return {
      allowed: false,
      reason: `Firebase signed in, but Firestore cannot find admins/${uid}. Use this exact UID as the admin document ID.`
    };
  }

  const data = adminDoc.data();
  if (data.active !== true) {
    return {
      allowed: false,
      reason: `Firestore found admins/${uid}, but active is not true. Change active to Boolean true.`
    };
  }

  return {
    allowed: true,
    data
  };
}

function normalizeUser(user, fallbackProfile = {}) {
  if (!user) return null;

  const fallback = typeof fallbackProfile === "string"
    ? { name: fallbackProfile }
    : fallbackProfile || {};

  return {
    uid: user.uid,
    email: user.email || "",
    name: user.displayName || fallback.name || user.email?.split("@")[0] || "Reader",
    photoURL: user.photoURL || fallback.photoURL || "",
    photoPath: fallback.photoPath || "",
    role: "user",
    joinedAt: user.metadata?.creationTime || user.joinedAt || fallback.joinedAt || "",
    emailVerified: Boolean(user.emailVerified),
    demo: Boolean(user.demo)
  };
}

function demoUserSession(email = "reader@example.com", name = "Read_Master Reader") {
  const cleanEmail = String(email || "reader@example.com").trim().toLowerCase();

  return {
    uid: `demo-user-${cleanEmail}`,
    email: cleanEmail,
    name: name || cleanEmail.split("@")[0] || "Read_Master Reader",
    photoURL: "",
    photoPath: "",
    role: "user",
    joinedAt: "2026-09-04",
    demo: true
  };
}

function defaultLocalUsers() {
  return [
    demoUserSession("reader@example.com", "Read_Master Reader"),
    demoUserSession("student@example.com", "Student Reader")
  ].map((user) => normalizeManagedUser(user));
}

function normalizeManagedUser(data, id = data.uid || data.id) {
  return {
    uid: id,
    id,
    name: data.name || data.displayName || data.email?.split("@")[0] || "Reader",
    email: data.email || "",
    photoURL: data.photoURL || "",
    photoPath: data.photoPath || "",
    role: data.role || "user",
    joinedAt: timestampToDateInput(data.joinedAt || data.createdAt) || "2026-09-04",
    demo: Boolean(data.demo)
  };
}

function getLocalUsers() {
  const users = readLocal(usersKey, null);

  if (users === null) {
    const seededUsers = defaultLocalUsers();
    writeLocal(usersKey, seededUsers);
    return seededUsers;
  }

  if (!Array.isArray(users)) return defaultLocalUsers();

  const normalizedUsers = users.map((user) => normalizeManagedUser(user, user.uid || user.id));
  const normalizedIds = new Set(normalizedUsers.map((user) => user.uid));
  const missingDefaultUsers = defaultLocalUsers().filter((user) => !normalizedIds.has(user.uid));

  return [...normalizedUsers, ...missingDefaultUsers];
}

function getStoredLocalUsers() {
  const users = readLocal(usersKey, []);
  return Array.isArray(users)
    ? users.map((user) => normalizeManagedUser(user, user.uid || user.id))
    : [];
}

function setLocalUsers(users) {
  writeLocal(usersKey, users);
}

function listSampleBooksByStatus(status) {
  return sampleBooks
    .map((book) => normalizeBook(book))
    .filter((book) => book.status === status && isPublicBook(book))
    .sort(sortNewest);
}

function mergeBooksWithSamples(books, status) {
  const sourceBooks = Array.isArray(books) ? books : [];
  const sourceIds = new Set(sourceBooks.map((book) => book.id));
  const sampleFallbackBooks = listSampleBooksByStatus(status)
    .filter((book) => !sourceIds.has(book.id));

  return [...sourceBooks, ...sampleFallbackBooks].sort(sortNewest);
}

function listLocalCatalogBooks() {
  return getLocalBooks()
    .map((book) => normalizeBook(book))
    .sort(sortNewest);
}

function mergeBooksWithLocalCatalog(books) {
  const sourceBooks = Array.isArray(books) ? books : [];
  const sourceIds = new Set(sourceBooks.map((book) => book.id));
  const localFallbackBooks = listLocalCatalogBooks()
    .filter((book) => !sourceIds.has(book.id));

  return [...sourceBooks, ...localFallbackBooks].sort(sortNewest);
}

function mergeUsersWithLocalProfiles(users) {
  const sourceUsers = Array.isArray(users) ? users : [];
  const sourceIds = new Set(sourceUsers.map((user) => user.uid || user.id));
  const localFallbackUsers = getStoredLocalUsers()
    .filter((user) => !sourceIds.has(user.uid || user.id));

  return [...sourceUsers, ...localFallbackUsers];
}

function listCachedBooksByStatus(status) {
  return getLocalBooks()
    .map((book) => normalizeBook(book))
    .filter((book) => book.status === status && isPublicBook(book))
    .sort(sortNewest);
}

function cacheBooksLocally(books) {
  if (!Array.isArray(books) || !books.length) return;

  const cachedBooks = getLocalBooks();
  const incomingIds = new Set(books.map((book) => book.id));
  const mergedBooks = [
    ...books.map((book) => ({ ...book })),
    ...cachedBooks.filter((book) => !incomingIds.has(book.id))
  ];

  setLocalBooks(mergedBooks);
}

export function listCachedPublishedBooks() {
  return listCachedBooksByStatus("published");
}

export function listCachedUpcomingBooks() {
  return listCachedBooksByStatus("upcoming");
}

export function getCachedBook(bookId) {
  if (!bookId) return null;

  const book = getLocalBooks().find((item) => item.id === bookId);
  return book ? normalizeBook(book) : null;
}

function sampleBookPayload(book) {
  const payload = cleanBookPayload(book);
  validateBookPayload(payload);
  const interactionCounts = legacyInteractionCounts(book);

  return {
    ...payload,
    coverUrl: `assets/covers/${book.id}.svg?v=${sampleCoverVersion}`,
    viewCount: interactionCounts.viewCount,
    downloadCount: interactionCounts.downloadCount,
    trendScore: normalizedTrendScore(book.trendScore)
  };
}

function upsertLocalUser(session) {
  const users = getLocalUsers();
  const now = new Date().toISOString();
  const index = users.findIndex((user) => user.uid === session.uid || user.email === session.email);
  const existingUser = index >= 0 ? users[index] : null;
  const nextUser = normalizeManagedUser({
    ...existingUser,
    ...session,
    joinedAt: existingUser?.joinedAt || session.joinedAt || now,
    updatedAt: now
  }, session.uid);

  if (index >= 0) {
    users[index] = nextUser;
  } else {
    users.unshift(nextUser);
  }

  setLocalUsers(users);
  return nextUser;
}

function saveFirebaseUserProfile(firebase, session, options = {}) {
  if (!firebase || !session?.uid) return Promise.resolve();

  const { db, firestoreModule } = firebase;
  const now = firestoreModule.serverTimestamp();
  const payload = {
    name: session.name || session.email?.split("@")[0] || "Reader",
    email: session.email || "",
    photoURL: session.photoURL || "",
    photoPath: session.photoPath || "",
    role: "user",
    updatedAt: now
  };

  if (options.created) payload.createdAt = now;

  return firestoreModule.setDoc(
    firestoreModule.doc(db, firebaseCollections.users, session.uid),
    payload,
    { merge: true }
  );
}

function saveFirebasePublicProfile(firebase, session) {
  if (!firebase || !session?.uid) return Promise.resolve();

  const localProfile = upsertLocalPublicProfile(session);
  const { db, firestoreModule } = firebase;
  const profileRef = firestoreModule.doc(
    db,
    firebaseCollections.publicProfiles,
    session.uid
  );

  return firestoreModule.runTransaction(db, async (transaction) => {
    const profileDoc = await transaction.get(profileRef);
    const payload = {
      userId: session.uid,
      displayName: session.name || session.email?.split("@")[0] || "Reader",
      avatarURL: session.photoURL || "",
      joinedAt: localProfile?.joinedAt || timestampToIso(session.joinedAt) || "",
      updatedAt: firestoreModule.serverTimestamp()
    };

    if (!profileDoc.exists()) {
      payload.bio = localProfile?.bio || "";
      payload.isPublic = Boolean(localProfile?.isPublic);
      payload.showReadingHistory = Boolean(localProfile?.showReadingHistory);
    }

    transaction.set(profileRef, payload, { merge: true });
  });
}

function syncFirebasePublicProfileSilently(firebase, session) {
  saveFirebasePublicProfile(firebase, session).catch((error) => {
    console.warn("The public reader profile could not be synchronized.", error);
  });
}

async function loadFirebaseUserProfile(firebase, userId) {
  if (!firebase || !userId) return {};

  const { db, firestoreModule } = firebase;
  const profileDoc = await firestoreModule.getDoc(
    firestoreModule.doc(db, firebaseCollections.users, userId)
  );

  return profileDoc.exists() ? profileDoc.data() : {};
}

async function waitForFirebaseAuthUser(firebase) {
  if (firebase.auth.currentUser) return firebase.auth.currentUser;

  return new Promise((resolve) => {
    const unsubscribe = firebase.authModule.onAuthStateChanged(firebase.auth, (currentUser) => {
      unsubscribe();
      resolve(currentUser);
    });
  });
}

async function getFirebaseAuthUser(firebase) {
  return waitForFirebaseAuthUser(firebase);
}

async function syncSavedBooksForUser(userId, firebase) {
  if (!userId || !firebase) return getSavedIdsForUser(userId);

  const { db, firestoreModule } = firebase;
  const savedBooksRef = firestoreModule.collection(
    db,
    firebaseCollections.users,
    userId,
    "savedBooks"
  );
  const snapshot = await firestoreModule.getDocs(savedBooksRef);
  const cloudIds = snapshot.docs.map((savedDoc) => savedDoc.id);
  const mergedIds = [...new Set([...cloudIds, ...getSavedIdsForUser(userId)])];

  await Promise.all(mergedIds.map((bookId) => {
    return firestoreModule.setDoc(
      firestoreModule.doc(db, firebaseCollections.users, userId, "savedBooks", bookId),
      {
        bookId,
        savedAt: firestoreModule.serverTimestamp()
      },
      { merge: true }
    );
  }));

  replaceSavedIdsForUser(mergedIds, userId);
  return mergedIds;
}

function syncSavedBooksSilently(userId, firebase) {
  syncSavedBooksForUser(userId, firebase).catch((error) => {
    console.warn("Saved books could not sync to Firebase.", error);
  });
}

export async function listPublishedBooks() {
  if (!configured) {
    return getLocalBooks()
      .map((book) => normalizeBook(book))
      .filter((book) => book.status === "published" && isPublicBook(book))
      .sort(sortNewest);
  }

  try {
    const firebase = await getFirebaseForRead("Firebase book library");
    const { db, firestoreModule } = firebase;
    const booksRef = firestoreModule.collection(db, firebaseCollections.books);
    const booksQuery = firestoreModule.query(
      booksRef,
      firestoreModule.where("status", "==", "published"),
      firestoreModule.where("licenseChecked", "==", true),
      firestoreModule.where("licenseType", "in", allowedLicenseTypeValues)
    );
    const snapshot = await withTimeout(
      firestoreModule.getDocs(booksQuery),
      "Firestore published books"
    );
    const books = snapshot.docs
      .map((bookDoc) => normalizeBook(bookDoc.data(), bookDoc.id))
      .filter((book) => isPublicBook(book))
      .sort(sortNewest);

    cacheBooksLocally(books);
    return mergeBooksWithSamples(books, "published");
  } catch (error) {
    console.warn("Using demo books because Firestore published books could not load.", error);
    return listSampleBooksByStatus("published");
  }
}

export async function listUpcomingBooks() {
  if (!configured) {
    return getLocalBooks()
      .map((book) => normalizeBook(book))
      .filter((book) => book.status === "upcoming" && isPublicBook(book))
      .sort(sortNewest);
  }

  try {
    const firebase = await getFirebaseForRead("Firebase upcoming books");
    const { db, firestoreModule } = firebase;
    const booksRef = firestoreModule.collection(db, firebaseCollections.books);
    const booksQuery = firestoreModule.query(
      booksRef,
      firestoreModule.where("status", "==", "upcoming"),
      firestoreModule.where("licenseChecked", "==", true),
      firestoreModule.where("licenseType", "in", allowedLicenseTypeValues)
    );
    const snapshot = await withTimeout(
      firestoreModule.getDocs(booksQuery),
      "Firestore upcoming books"
    );
    const books = snapshot.docs
      .map((bookDoc) => normalizeBook(bookDoc.data(), bookDoc.id))
      .filter((book) => isPublicBook(book))
      .sort(sortNewest);

    cacheBooksLocally(books);
    return mergeBooksWithSamples(books, "upcoming");
  } catch (error) {
    console.warn("Using demo books because Firestore upcoming books could not load.", error);
    return listSampleBooksByStatus("upcoming");
  }
}

export async function listAllBooks() {
  if (!configured) return listLocalCatalogBooks();

  try {
    const firebase = await getFirebaseForRead("Firebase admin books");
    const { db, firestoreModule } = firebase;
    const snapshot = await withTimeout(
      firestoreModule.getDocs(
        firestoreModule.collection(db, firebaseCollections.books)
      ),
      "Firestore admin books"
    );

    const books = snapshot.docs
      .map((bookDoc) => normalizeBook(bookDoc.data(), bookDoc.id))
      .sort(sortNewest);

    cacheBooksLocally(books);
    return mergeBooksWithLocalCatalog(books);
  } catch (error) {
    console.warn("Using local admin books because Firestore admin books could not load.", error);
    return listLocalCatalogBooks();
  }
}

export async function seedDemoBooks() {
  const seedBooks = sampleBooks.map((book) => ({
    id: book.id,
    ...sampleBookPayload(book)
  }));

  if (!configured) {
    const books = getLocalBooks();
    const existingIds = new Set(books.map((book) => book.id));
    const now = new Date().toISOString();
    const newBooks = seedBooks
      .filter((book) => !existingIds.has(book.id))
      .map((book) => normalizeBook({
        ...book,
        createdAt: now,
        updatedAt: now
      }, book.id));

    if (newBooks.length) {
      setLocalBooks([...newBooks, ...books]);
    }

    return {
      created: newBooks.length,
      updated: 0,
      skipped: seedBooks.length - newBooks.length,
      total: seedBooks.length
    };
  }

  const firebase = await getFirebase();
  const { db, firestoreModule } = firebase;
  let created = 0;
  let updated = 0;

  for (const book of seedBooks) {
    const { id, ...bookData } = book;
    const bookRef = firestoreModule.doc(db, firebaseCollections.books, id);
    const bookDoc = await firestoreModule.getDoc(bookRef);
    const savedBook = {
      ...bookData,
      updatedAt: firestoreModule.serverTimestamp()
    };

    if (!bookDoc.exists()) {
      savedBook.createdAt = firestoreModule.serverTimestamp();
      created += 1;
    } else {
      const existingBook = bookDoc.data();
      if (Number.isFinite(Number(existingBook.viewCount))) {
        savedBook.viewCount = normalizedNonNegativeInteger(existingBook.viewCount);
      }
      if (Number.isFinite(Number(existingBook.downloadCount))) {
        savedBook.downloadCount = normalizedNonNegativeInteger(existingBook.downloadCount);
      }
      updated += 1;
    }

    await firestoreModule.setDoc(bookRef, savedBook, { merge: true });
  }

  return {
    created,
    updated,
    skipped: 0,
    total: seedBooks.length
  };
}

export async function getBook(bookId) {
  if (!bookId) return null;

  if (!configured) {
    const book = getLocalBooks().find((item) => item.id === bookId);
    return book ? normalizeBook(book) : null;
  }

  try {
    const firebase = await getFirebaseForRead("Firebase book details");
    const { db, firestoreModule } = firebase;
    const bookDoc = await withTimeout(
      firestoreModule.getDoc(
        firestoreModule.doc(db, firebaseCollections.books, bookId)
      ),
      "Firestore book details"
    );

    if (bookDoc.exists()) {
      const book = normalizeBook(bookDoc.data(), bookDoc.id);
      cacheBooksLocally([book]);
      return book;
    }
  } catch (error) {
    console.warn("Using demo book because Firestore book details could not load.", error);
  }

  const sampleBook = sampleBooks.find((item) => item.id === bookId);
  return sampleBook ? normalizeBook(sampleBook) : null;
}

function incrementLocalBookInteraction(bookId, interaction) {
  const books = getLocalBooks();
  const index = books.findIndex((book) => book.id === bookId);
  if (index === -1) return null;

  const currentBook = normalizeBook(books[index], bookId);
  if (currentBook.status !== "published" || !isPublicBook(currentBook)) {
    throw new Error("Only published public books can record reader interactions.");
  }

  const counterField = interaction === "view" ? "viewCount" : "downloadCount";
  const updatedBook = normalizeBook({
    ...currentBook,
    [counterField]: currentBook[counterField] + 1
  }, bookId);

  books[index] = updatedBook;
  setLocalBooks(books);
  return updatedBook;
}

export async function recordBookInteraction(bookId, interaction) {
  const normalizedBookId = String(bookId || "").trim();
  if (!normalizedBookId) throw new Error("Book ID is required.");
  if (!bookInteractionTypes.has(interaction)) {
    throw new Error("Book interaction must be view or download.");
  }

  // Keep the interface responsive and retain a best-effort count if the network is unavailable.
  const localBook = incrementLocalBookInteraction(normalizedBookId, interaction);
  if (!configured) {
    if (!localBook) throw new Error("Book not found.");
    return localBook;
  }

  try {
    const firebase = await getFirebase();
    const { db, firestoreModule } = firebase;
    const bookRef = firestoreModule.doc(db, firebaseCollections.books, normalizedBookId);
    const remoteBook = await firestoreModule.runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(bookRef);
      if (!snapshot.exists()) throw new Error("Book not found.");

      const bookData = snapshot.data();
      const normalized = normalizeBook(bookData, snapshot.id);
      if (normalized.status !== "published" || !isPublicBook(normalized)) {
        throw new Error("Only published public books can record reader interactions.");
      }

      // Firestore rules require exactly one counter to increase by one. Supplying both
      // counters also migrates legacy records that do not have explicit zero values yet.
      const currentCounts = legacyInteractionCounts(bookData);
      const currentViewCount = currentCounts.viewCount;
      const currentDownloadCount = currentCounts.downloadCount;
      const nextViewCount = currentViewCount + (interaction === "view" ? 1 : 0);
      const nextDownloadCount = currentDownloadCount + (interaction === "download" ? 1 : 0);

      transaction.update(bookRef, {
        viewCount: nextViewCount,
        downloadCount: nextDownloadCount
      });

      return normalizeBook({
        ...bookData,
        viewCount: nextViewCount,
        downloadCount: nextDownloadCount
      }, snapshot.id);
    });

    cacheBooksLocally([remoteBook]);
    return remoteBook;
  } catch (error) {
    console.warn("Book interaction could not sync to Firebase.", error);
    if (localBook) return localBook;
    throw error;
  }
}

export async function createBook(bookData, files = {}) {
  const payload = cleanBookPayload(bookData);
  validateBookPayload(payload, files);

  if (!configured) {
    const now = new Date().toISOString();
    const localBook = normalizeBook({
      ...payload,
      id: createLocalId(),
      viewCount: 0,
      downloadCount: 0,
      createdAt: now,
      updatedAt: now
    });
    setLocalBooks([localBook, ...getLocalBooks()]);
    return localBook;
  }

  const firebase = await getFirebase();
  const { db, firestoreModule } = firebase;
  const bookRef = firestoreModule.doc(firestoreModule.collection(db, firebaseCollections.books));
  const uploadedCoverUrl = await uploadBookFile(bookRef.id, files.coverFile, "cover");
  const uploadedResourceUrl = await uploadBookFile(bookRef.id, files.resourceFile, "resource");

  const savedBook = {
    ...payload,
    coverUrl: uploadedCoverUrl || payload.coverUrl,
    resourceUrl: uploadedResourceUrl || payload.resourceUrl,
    viewCount: 0,
    downloadCount: 0,
    trendScore: 0,
    createdAt: firestoreModule.serverTimestamp(),
    updatedAt: firestoreModule.serverTimestamp()
  };

  await firestoreModule.setDoc(bookRef, savedBook);
  return getBook(bookRef.id);
}

export async function updateBook(bookId, bookData, files = {}) {
  if (!bookId) throw new Error("Book ID is required.");

  const payload = cleanBookPayload(bookData);
  validateBookPayload(payload, files);

  if (!configured) {
    const books = getLocalBooks();
    const index = books.findIndex((book) => book.id === bookId);
    if (index === -1) throw new Error("Book not found.");

    const updatedBook = normalizeBook({
      ...books[index],
      ...payload,
      updatedAt: new Date().toISOString()
    }, bookId);

    books[index] = updatedBook;
    setLocalBooks(books);
    return updatedBook;
  }

  const firebase = await getFirebase();
  const { db, firestoreModule } = firebase;
  const uploadedCoverUrl = await uploadBookFile(bookId, files.coverFile, "cover");
  const uploadedResourceUrl = await uploadBookFile(bookId, files.resourceFile, "resource");

  const updatePayload = {
    ...payload,
    updatedAt: firestoreModule.serverTimestamp()
  };

  if (uploadedCoverUrl) updatePayload.coverUrl = uploadedCoverUrl;
  if (uploadedResourceUrl) updatePayload.resourceUrl = uploadedResourceUrl;

  await firestoreModule.updateDoc(
    firestoreModule.doc(db, firebaseCollections.books, bookId),
    updatePayload
  );

  return getBook(bookId);
}

export async function deleteBook(bookId) {
  if (!bookId) throw new Error("Book ID is required.");

  if (!configured) {
    setLocalBooks(getLocalBooks().filter((book) => book.id !== bookId));
    return;
  }

  const firebase = await getFirebase();
  const { db, firestoreModule } = firebase;
  await firestoreModule.deleteDoc(
    firestoreModule.doc(db, firebaseCollections.books, bookId)
  );
}

export async function listBookReviews(bookId) {
  const normalizedBookId = String(bookId || "").trim();
  if (!normalizedBookId) throw new Error("Book ID is required.");

  const cachedReviews = readLocalReviews()
    .filter((review) => review.bookId === normalizedBookId)
    .sort(sortReviewsNewest);
  if (!configured) return cachedReviews;

  try {
    const firebase = await getFirebaseForRead("Firebase book reviews");
    const { db, firestoreModule } = firebase;
    const reviewsRef = firestoreModule.collection(
      db,
      firebaseCollections.books,
      normalizedBookId,
      "reviews"
    );
    const snapshot = await withTimeout(
      firestoreModule.getDocs(reviewsRef),
      "Firestore book reviews"
    );
    const reviews = snapshot.docs
      .map((reviewDoc) => normalizeReview(reviewDoc.data(), reviewDoc.id, normalizedBookId))
      .filter((review) => review.rating >= 1 && review.rating <= 5 && review.comment.length >= 3)
      .sort(sortReviewsNewest);

    cacheBookReviews(normalizedBookId, reviews);
    return reviews;
  } catch (error) {
    console.warn("Using cached reviews because Firestore reviews could not load.", error);
    return cachedReviews;
  }
}

export async function saveBookReview(bookId, review) {
  const normalizedBookId = String(bookId || "").trim();
  if (!normalizedBookId) throw new Error("Book ID is required.");
  const payload = validateReviewInput(review);
  const currentUser = await getCurrentUser();
  if (!currentUser?.uid) throw new Error("Please sign in to leave a review.");

  const userName = String(currentUser.name || currentUser.email || "Reader").trim().slice(0, 80) || "Reader";
  const existingLocalReview = readLocalReviews().find((item) => {
    return item.bookId === normalizedBookId && item.userId === currentUser.uid;
  });
  const now = new Date().toISOString();

  if (!configured) {
    return upsertLocalReview({
      id: currentUser.uid,
      bookId: normalizedBookId,
      userId: currentUser.uid,
      userName,
      ...payload,
      createdAt: existingLocalReview?.createdAt || now,
      updatedAt: now
    });
  }

  const firebase = await getFirebase();
  const { db, firestoreModule } = firebase;
  const reviewRef = firestoreModule.doc(
    db,
    firebaseCollections.books,
    normalizedBookId,
    "reviews",
    currentUser.uid
  );

  await firestoreModule.runTransaction(db, async (transaction) => {
    const reviewDoc = await transaction.get(reviewRef);
    transaction.set(reviewRef, {
      bookId: normalizedBookId,
      userId: currentUser.uid,
      userName,
      ...payload,
      createdAt: reviewDoc.exists()
        ? reviewDoc.data().createdAt
        : firestoreModule.serverTimestamp(),
      updatedAt: firestoreModule.serverTimestamp()
    });
  });

  const savedDoc = await firestoreModule.getDoc(reviewRef);
  const savedReview = normalizeReview(savedDoc.data(), savedDoc.id, normalizedBookId);
  return upsertLocalReview(savedReview);
}

export async function deleteBookReview(bookId) {
  const normalizedBookId = String(bookId || "").trim();
  if (!normalizedBookId) throw new Error("Book ID is required.");
  const currentUser = await getCurrentUser();
  if (!currentUser?.uid) throw new Error("Please sign in to delete your review.");

  if (configured) {
    const firebase = await getFirebase();
    const { db, firestoreModule } = firebase;
    await firestoreModule.deleteDoc(
      firestoreModule.doc(
        db,
        firebaseCollections.books,
        normalizedBookId,
        "reviews",
        currentUser.uid
      )
    );
  }

  removeLocalReview(normalizedBookId, currentUser.uid);
}

export async function getPublicReaderProfile(userId) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) throw new Error("Reader ID is required.");

  let localProfile = readLocalPublicProfiles().find((profile) => profile.userId === normalizedUserId) || null;
  if (!localProfile) {
    const localUser = getLocalUsers().find((user) => user.uid === normalizedUserId);
    if (localUser) localProfile = upsertLocalPublicProfile(localUser);
  }
  if (!configured) return localProfile;

  try {
    const firebase = await getFirebaseForRead("Firebase public reader profile");
    const { db, firestoreModule } = firebase;
    const profileDoc = await withTimeout(
      firestoreModule.getDoc(
        firestoreModule.doc(db, firebaseCollections.publicProfiles, normalizedUserId)
      ),
      "Firestore public reader profile"
    );

    if (!profileDoc.exists()) {
      return readUserSession()?.uid === normalizedUserId ? localProfile : null;
    }
    return upsertLocalPublicProfile(normalizePublicProfile(profileDoc.data(), profileDoc.id));
  } catch (error) {
    console.warn("The public reader profile could not be loaded.", error);
    return readUserSession()?.uid === normalizedUserId ? localProfile : null;
  }
}

async function savePublicReadingHistoryRecords(firebase, userId, activities) {
  if (!firebase || !userId) return;
  const { db, firestoreModule } = firebase;
  const readableActivity = (Array.isArray(activities) ? activities : [])
    .map((activity) => normalizeLibraryActivity(activity, activity?.bookId))
    .filter((activity) => activity.bookId && activity.readCount > 0 && activity.lastReadAt);

  await Promise.all(readableActivity.map((activity) => {
    return firestoreModule.setDoc(
      firestoreModule.doc(
        db,
        firebaseCollections.publicProfiles,
        userId,
        "readingHistory",
        activity.bookId
      ),
      {
        bookId: activity.bookId,
        userId,
        readCount: activity.readCount,
        lastReadAt: new Date(activity.lastReadAt),
        updatedAt: firestoreModule.serverTimestamp()
      }
    );
  }));
}

async function clearFirebasePublicReadingHistory(firebase, userId) {
  if (!firebase || !userId) return;
  const { db, firestoreModule } = firebase;
  const historyRef = firestoreModule.collection(
    db,
    firebaseCollections.publicProfiles,
    userId,
    "readingHistory"
  );
  const snapshot = await firestoreModule.getDocs(historyRef);
  await Promise.all(snapshot.docs.map((historyDoc) => firestoreModule.deleteDoc(historyDoc.ref)));
}

export async function updatePublicProfileSettings(settings = {}) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.uid) throw new Error("Please sign in to update your public profile.");

  const bio = String(settings.bio || "").trim();
  if (bio.length > 300) throw new Error("Profile bios must be 300 characters or fewer.");

  const isPublic = Boolean(settings.isPublic);
  const nextProfile = upsertLocalPublicProfile({
    ...currentUser,
    userId: currentUser.uid,
    displayName: currentUser.name,
    avatarURL: currentUser.photoURL || "",
    bio,
    isPublic,
    showReadingHistory: isPublic && Boolean(settings.showReadingHistory),
    updatedAt: new Date().toISOString()
  });

  if (!configured) return nextProfile;

  const firebase = await getFirebase();
  const { db, firestoreModule } = firebase;
  const profileRef = firestoreModule.doc(
    db,
    firebaseCollections.publicProfiles,
    currentUser.uid
  );
  await firestoreModule.setDoc(profileRef, {
    userId: currentUser.uid,
    displayName: currentUser.name || "Reader",
    avatarURL: currentUser.photoURL || "",
    bio,
    isPublic,
    showReadingHistory: isPublic && Boolean(settings.showReadingHistory),
    joinedAt: nextProfile.joinedAt || timestampToIso(currentUser.joinedAt) || "",
    updatedAt: firestoreModule.serverTimestamp()
  }, { merge: true });

  if (nextProfile.showReadingHistory) {
    try {
      await savePublicReadingHistoryRecords(
        firebase,
        currentUser.uid,
        await listCurrentUserBookActivity()
      );
    } catch (error) {
      console.warn("Existing reading history could not be published.", error);
    }
  } else {
    try {
      await clearFirebasePublicReadingHistory(firebase, currentUser.uid);
    } catch (error) {
      console.warn("The old shared reading history could not be removed.", error);
    }
  }

  const savedDoc = await firestoreModule.getDoc(profileRef);
  return upsertLocalPublicProfile(normalizePublicProfile(savedDoc.data(), savedDoc.id));
}

export async function listPublicReadingHistory(userId) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) throw new Error("Reader ID is required.");

  const localHistory = getLocalLibraryActivity(normalizedUserId)
    .map((activity) => normalizePublicReadingHistory({ ...activity, userId: normalizedUserId }))
    .filter((activity) => activity.bookId && activity.readCount > 0 && activity.lastReadAt)
    .sort((a, b) => String(b.lastReadAt).localeCompare(String(a.lastReadAt)));
  if (!configured) return localHistory;

  try {
    const firebase = await getFirebaseForRead("Firebase public reading history");
    const { db, firestoreModule } = firebase;
    const historyRef = firestoreModule.collection(
      db,
      firebaseCollections.publicProfiles,
      normalizedUserId,
      "readingHistory"
    );
    const snapshot = await withTimeout(
      firestoreModule.getDocs(historyRef),
      "Firestore public reading history"
    );
    return snapshot.docs
      .map((historyDoc) => normalizePublicReadingHistory(historyDoc.data(), historyDoc.id))
      .filter((activity) => activity.bookId && activity.readCount > 0 && activity.lastReadAt)
      .sort((a, b) => String(b.lastReadAt).localeCompare(String(a.lastReadAt)));
  } catch (error) {
    console.warn("Public reading history could not be loaded.", error);
    return readUserSession()?.uid === normalizedUserId ? localHistory : [];
  }
}

export async function listProfileComments(profileId) {
  const normalizedProfileId = String(profileId || "").trim();
  if (!normalizedProfileId) throw new Error("Reader ID is required.");

  const localComments = readLocalProfileComments()
    .filter((comment) => comment.profileId === normalizedProfileId)
    .sort(sortProfileCommentsNewest);
  if (!configured) return localComments;

  try {
    const firebase = await getFirebaseForRead("Firebase profile comments");
    const { db, firestoreModule } = firebase;
    const commentsRef = firestoreModule.collection(
      db,
      firebaseCollections.publicProfiles,
      normalizedProfileId,
      "comments"
    );
    const snapshot = await withTimeout(
      firestoreModule.getDocs(commentsRef),
      "Firestore profile comments"
    );
    const comments = snapshot.docs
      .map((commentDoc) => normalizeProfileComment(commentDoc.data(), commentDoc.id, normalizedProfileId))
      .filter((comment) => comment.comment.length >= 3)
      .sort(sortProfileCommentsNewest);

    writeLocalProfileComments([
      ...comments,
      ...readLocalProfileComments().filter((comment) => comment.profileId !== normalizedProfileId)
    ]);
    return comments;
  } catch (error) {
    console.warn("Profile comments could not be loaded.", error);
    return localComments;
  }
}

export async function saveProfileComment(profileId, value) {
  const normalizedProfileId = String(profileId || "").trim();
  if (!normalizedProfileId) throw new Error("Reader ID is required.");
  const comment = validateProfileCommentInput(value);
  const currentUser = await getCurrentUser();
  if (!currentUser?.uid) throw new Error("Please sign in to leave a profile comment.");

  const targetProfile = await getPublicReaderProfile(normalizedProfileId);
  if (!targetProfile?.isPublic) throw new Error("This reader's public profile is not available.");

  const previousLocal = readLocalProfileComments().find((item) => {
    return item.profileId === normalizedProfileId && item.authorId === currentUser.uid;
  });
  const now = new Date().toISOString();

  if (!configured) {
    const savedComment = normalizeProfileComment({
      id: currentUser.uid,
      profileId: normalizedProfileId,
      authorId: currentUser.uid,
      authorName: currentUser.name || "Reader",
      authorPhotoURL: currentUser.photoURL || "",
      comment,
      createdAt: previousLocal?.createdAt || now,
      updatedAt: now
    }, currentUser.uid, normalizedProfileId);
    writeLocalProfileComments([
      savedComment,
      ...readLocalProfileComments().filter((item) => {
        return item.profileId !== normalizedProfileId || item.authorId !== currentUser.uid;
      })
    ]);
    return savedComment;
  }

  const firebase = await getFirebase();
  syncFirebasePublicProfileSilently(firebase, currentUser);
  const { db, firestoreModule } = firebase;
  const commentRef = firestoreModule.doc(
    db,
    firebaseCollections.publicProfiles,
    normalizedProfileId,
    "comments",
    currentUser.uid
  );

  await firestoreModule.runTransaction(db, async (transaction) => {
    const commentDoc = await transaction.get(commentRef);
    transaction.set(commentRef, {
      profileId: normalizedProfileId,
      authorId: currentUser.uid,
      authorName: currentUser.name || "Reader",
      authorPhotoURL: currentUser.photoURL || "",
      comment,
      createdAt: commentDoc.exists()
        ? commentDoc.data().createdAt
        : firestoreModule.serverTimestamp(),
      updatedAt: firestoreModule.serverTimestamp()
    });
  });

  const savedDoc = await firestoreModule.getDoc(commentRef);
  const savedComment = normalizeProfileComment(savedDoc.data(), savedDoc.id, normalizedProfileId);
  writeLocalProfileComments([
    savedComment,
    ...readLocalProfileComments().filter((item) => {
      return item.profileId !== normalizedProfileId || item.authorId !== currentUser.uid;
    })
  ]);
  return savedComment;
}

export async function deleteProfileComment(profileId, authorId) {
  const normalizedProfileId = String(profileId || "").trim();
  const normalizedAuthorId = String(authorId || "").trim();
  if (!normalizedProfileId || !normalizedAuthorId) throw new Error("Profile comment IDs are required.");

  const currentUser = await getCurrentUser();
  const currentAdmin = currentUser ? null : await getCurrentAdmin();
  const canDelete = currentAdmin
    || currentUser?.uid === normalizedAuthorId
    || currentUser?.uid === normalizedProfileId;
  if (!canDelete) throw new Error("You cannot delete this profile comment.");

  if (configured) {
    const firebase = await getFirebase();
    const { db, firestoreModule } = firebase;
    await firestoreModule.deleteDoc(
      firestoreModule.doc(
        db,
        firebaseCollections.publicProfiles,
        normalizedProfileId,
        "comments",
        normalizedAuthorId
      )
    );
  }

  writeLocalProfileComments(readLocalProfileComments().filter((comment) => {
    return comment.profileId !== normalizedProfileId || comment.authorId !== normalizedAuthorId;
  }));
}

export async function registerUser(name, email, password) {
  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();

  if (!cleanName || !cleanEmail || String(password || "").length < 6) {
    throw new Error("Please enter your name, email, and a password with at least 6 characters.");
  }

  if (!configured) {
    const session = demoUserSession(cleanEmail, cleanName);

    upsertLocalUser(session);
    clearCachedAdminSession();
    adoptGuestSavedBooksForUser(session.uid);
    storeUserSession(session);
    return session;
  }

  const firebase = await getFirebase();
  const { auth, authModule } = firebase;
  const credential = await authModule.createUserWithEmailAndPassword(auth, cleanEmail, password);
  const session = normalizeUser(credential.user, cleanName);

  clearCachedAdminSession();
  adoptGuestSavedBooksForUser(session.uid);
  storeUserSession(session);
  upsertLocalUser(session);
  authModule.updateProfile(credential.user, { displayName: cleanName }).catch((error) => {
    console.warn("Firebase Auth profile name could not be updated.", error);
  });
  saveFirebaseUserProfile(firebase, session, { created: true }).catch((error) => {
    console.warn("Firebase user profile document could not be saved.", error);
  });
  syncFirebasePublicProfileSilently(firebase, session);
  syncSavedBooksSilently(credential.user.uid, firebase);
  return session;
}

export async function loginUser(email, password) {
  const cleanEmail = String(email || "").trim().toLowerCase();

  if (!cleanEmail || String(password || "").length < 6) {
    throw new Error("Please enter a valid email and password.");
  }

  if (!configured) {
    const existingUser = getLocalUsers().find((user) => user.email === cleanEmail);
    const session = existingUser || demoUserSession(cleanEmail, cleanEmail === "reader@example.com" ? "Read_Master Reader" : "");

    upsertLocalUser(session);
    clearCachedAdminSession();
    adoptGuestSavedBooksForUser(session.uid);
    storeUserSession(session);
    return session;
  }

  const firebase = await getFirebase();
  const { auth, authModule } = firebase;
  const credential = await authModule.signInWithEmailAndPassword(auth, cleanEmail, password);

  let cloudProfile = null;
  try {
    cloudProfile = await withTimeout(
      loadFirebaseUserProfile(firebase, credential.user.uid),
      "Firebase user profile"
    );
  } catch (error) {
    console.warn("Firebase user profile could not be loaded during login.", error);
  }

  const session = normalizeUser(credential.user, cloudProfile || {});
  clearCachedAdminSession();
  adoptGuestSavedBooksForUser(session.uid);
  storeUserSession(session);
  upsertLocalUser(session);
  if (cloudProfile !== null) {
    saveFirebaseUserProfile(firebase, session).catch((error) => {
      console.warn("Firebase user profile document could not be saved.", error);
    });
  }
  syncFirebasePublicProfileSilently(firebase, session);
  syncSavedBooksSilently(credential.user.uid, firebase);
  return session;
}

export async function getCurrentUser() {
  if (!configured) {
    return readUserSession();
  }

  const firebase = await getFirebase();
  const { auth, authModule } = firebase;

  const user = await waitForFirebaseAuthUser(firebase);
  if (!user) {
    storeUserSession(null);
    return null;
  }

  const cachedAdmin = readAdminSession();
  if (cachedAdmin?.uid === user.uid) {
    storeUserSession(null);
    return null;
  }

  const cachedSession = readUserSession();
  const cacheMatchesUser = cachedSession?.uid === user.uid;
  let fallbackProfile = cacheMatchesUser ? cachedSession : {};
  let profileCanSync = true;

  if (!cacheMatchesUser || (user.photoURL && !fallbackProfile.photoPath)) {
    try {
      const cloudProfile = await withTimeout(
        loadFirebaseUserProfile(firebase, user.uid),
        "Firebase user profile"
      );
      fallbackProfile = {
        ...cloudProfile,
        ...(cacheMatchesUser ? cachedSession : {})
      };
      if (!fallbackProfile.photoPath && cloudProfile.photoPath) {
        fallbackProfile.photoPath = cloudProfile.photoPath;
      }
    } catch (error) {
      profileCanSync = false;
      console.warn("Firebase user profile could not be loaded.", error);
    }
  }

  const session = normalizeUser(user, fallbackProfile);
  adoptGuestSavedBooksForUser(session.uid);
  storeUserSession(session);
  upsertLocalUser(session);

  const profileChanged = !cachedSession
    || cachedSession.uid !== session.uid
    || cachedSession.name !== session.name
    || cachedSession.email !== session.email
    || cachedSession.photoURL !== session.photoURL
    || cachedSession.photoPath !== session.photoPath;

  if (profileChanged && profileCanSync) {
    saveFirebaseUserProfile(firebase, session).catch((error) => {
      console.warn("Firebase user profile document could not be synchronized.", error);
    });
  }
  syncFirebasePublicProfileSilently(firebase, session);

  return session;
}

export async function logoutUser() {
  if (!configured) {
    storeUserSession(null);
    return;
  }

  const firebase = await getFirebase();
  await firebase.authModule.signOut(firebase.auth);
  storeUserSession(null);
}

export async function updateUserProfile(profileData, photoFile = null) {
  const profile = typeof profileData === "string"
    ? { name: profileData }
    : profileData || {};
  const cleanName = String(profile.name || "").trim();
  if (!cleanName) throw new Error("Please enter a display name.");
  if (cleanName.length > 80) throw new Error("Display names must be 80 characters or fewer.");

  validateProfilePhoto(photoFile);
  const removePhoto = Boolean(profile.removePhoto);

  if (!configured) {
    const currentSession = readUserSession();
    if (!currentSession) throw new Error("Please sign in first.");

    const photoURL = photoFile
      ? await profilePhotoDataUrl(photoFile)
      : removePhoto
        ? ""
        : currentSession.photoURL || "";

    const updatedSession = {
      ...currentSession,
      name: cleanName,
      photoURL,
      photoPath: ""
    };

    upsertLocalUser(updatedSession);
    storeUserSession(updatedSession);
    return updatedSession;
  }

  const firebase = await getFirebase();
  const { auth, authModule } = firebase;
  const currentUser = auth.currentUser || await getFirebaseAuthUser(firebase);
  if (!currentUser) throw new Error("Please sign in first.");

  const cachedSession = readUserSession();
  let previousProfile = cachedSession?.uid === currentUser.uid ? cachedSession : {};
  if (currentUser.photoURL && !previousProfile.photoPath) {
    try {
      const cloudProfile = await loadFirebaseUserProfile(firebase, currentUser.uid);
      previousProfile = {
        ...cloudProfile,
        ...previousProfile,
        photoPath: previousProfile.photoPath || cloudProfile.photoPath || ""
      };
    } catch (error) {
      console.warn("The existing profile photo record could not be loaded.", error);
    }
  }
  const previousPhotoPath = previousProfile.photoPath || "";
  let nextPhotoURL = currentUser.photoURL || previousProfile.photoURL || "";
  let nextPhotoPath = previousPhotoPath;
  let uploadedPhoto = null;
  const previousAuthName = currentUser.displayName;
  const previousAuthPhotoURL = currentUser.photoURL;
  let authProfileUpdated = false;

  if (photoFile) {
    uploadedPhoto = await uploadProfilePhoto(firebase, currentUser.uid, photoFile);
    nextPhotoURL = uploadedPhoto.photoURL;
    nextPhotoPath = uploadedPhoto.photoPath;
  } else if (removePhoto) {
    nextPhotoURL = "";
    nextPhotoPath = "";
  }

  const updatedSession = {
    ...normalizeUser(currentUser, previousProfile),
    name: cleanName,
    photoURL: nextPhotoURL,
    photoPath: nextPhotoPath
  };

  try {
    await authModule.updateProfile(currentUser, {
      displayName: cleanName,
      photoURL: nextPhotoURL || null
    });
    authProfileUpdated = true;
    await saveFirebaseUserProfile(firebase, updatedSession);
  } catch (error) {
    let authProfileRolledBack = !authProfileUpdated;

    if (authProfileUpdated) {
      try {
        await authModule.updateProfile(currentUser, {
          displayName: previousAuthName || null,
          photoURL: previousAuthPhotoURL || null
        });
        authProfileRolledBack = true;
      } catch (rollbackError) {
        console.warn("Firebase Auth profile rollback failed.", rollbackError);
        storeUserSession(updatedSession);
        upsertLocalUser(updatedSession);
      }
    }

    if (uploadedPhoto?.photoPath && authProfileRolledBack) {
      deleteProfilePhoto(firebase, uploadedPhoto.photoPath).catch(() => {});
    }
    throw error;
  }

  storeUserSession(updatedSession);
  upsertLocalUser(updatedSession);
  syncFirebasePublicProfileSilently(firebase, updatedSession);

  if (previousPhotoPath && previousPhotoPath !== nextPhotoPath) {
    deleteProfilePhoto(firebase, previousPhotoPath).catch((error) => {
      console.warn("The previous profile photo could not be removed.", error);
    });
  }

  return updatedSession;
}

async function reauthenticatePasswordUser(firebase, currentPassword) {
  const password = String(currentPassword || "");
  if (!password) throw new Error("Please enter your current password.");

  const { auth, authModule } = firebase;
  const currentUser = auth.currentUser || await getFirebaseAuthUser(firebase);
  if (!currentUser?.email) throw new Error("Please sign in with your email and password first.");

  const usesPassword = currentUser.providerData?.some((provider) => provider.providerId === "password");
  if (currentUser.providerData?.length && !usesPassword) {
    throw new Error("This account does not use an email/password sign-in method.");
  }

  const credential = authModule.EmailAuthProvider.credential(currentUser.email, password);
  await authModule.reauthenticateWithCredential(currentUser, credential);
  return currentUser;
}

export async function requestUserEmailChange(email, currentPassword) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("Please enter a valid new email address.");
  if (!configured) throw new Error("Email changes require Firebase Authentication.");

  const firebase = await getFirebase();
  const currentUser = await reauthenticatePasswordUser(firebase, currentPassword);
  if (currentUser.email?.toLowerCase() === cleanEmail) {
    throw new Error("Please enter a different email address.");
  }

  const continueUrl = new URL("profile.html", window.location.href).href;
  await firebase.authModule.verifyBeforeUpdateEmail(currentUser, cleanEmail, {
    url: continueUrl
  });

  return { email: cleanEmail };
}

export async function changeUserPassword(currentPassword, newPassword) {
  const password = String(newPassword || "");
  if (password.length < 8) throw new Error("Your new password must contain at least 8 characters.");
  if (!configured) throw new Error("Password changes require Firebase Authentication.");

  const firebase = await getFirebase();
  const currentUser = await reauthenticatePasswordUser(firebase, currentPassword);
  await firebase.authModule.updatePassword(currentUser, password);
}

export async function updateAdminProfile(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Please enter a display name.");

  if (!configured) {
    throw new Error("Admin access requires Firebase Authentication.");
  }

  const firebase = await getFirebase();
  const { auth, authModule, db, firestoreModule } = firebase;
  const currentUser = auth.currentUser || await getFirebaseAuthUser(firebase);
  if (!currentUser) throw new Error("Please sign in as admin first.");

  const adminStatus = await getAdminAccessStatus(currentUser.uid);
  if (!adminStatus.allowed) throw new Error(adminStatus.reason);

  const updatedSession = {
    uid: currentUser.uid,
    email: currentUser.email || "",
    name: cleanName,
    photoURL: currentUser.photoURL || "",
    role: "admin",
    demo: false
  };

  storeAdminSession(updatedSession);
  authModule.updateProfile(currentUser, { displayName: cleanName }).catch((error) => {
    console.warn("Firebase Auth admin name could not be updated.", error);
  });
  firestoreModule.setDoc(
    firestoreModule.doc(db, firebaseCollections.admins, currentUser.uid),
    {
      active: true,
      email: currentUser.email || "",
      name: cleanName,
      role: "admin",
      updatedAt: firestoreModule.serverTimestamp()
    },
    { merge: true }
  ).catch((error) => {
    console.warn("Firebase admin profile document could not be updated.", error);
  });

  return updatedSession;
}

export async function syncCurrentUserBookActivity(bookId, type, localActivity = null) {
  const normalizedBookId = String(bookId || "").trim();
  if (!normalizedBookId) throw new Error("Book ID is required.");
  validateLibraryActivityType(type);
  if (!configured) return localActivity ? normalizeLibraryActivity(localActivity, normalizedBookId) : null;

  const firebase = await getFirebase();
  const currentUser = await getFirebaseAuthUser(firebase);
  if (!currentUser) return localActivity ? normalizeLibraryActivity(localActivity, normalizedBookId) : null;

  const { db, firestoreModule } = firebase;
  const activityRef = firestoreModule.doc(
    db,
    firebaseCollections.users,
    currentUser.uid,
    "libraryActivity",
    normalizedBookId
  );

  await firestoreModule.runTransaction(db, async (transaction) => {
    const activityDoc = await transaction.get(activityRef);
    const existing = activityDoc.exists() ? activityDoc.data() : {};
    const now = firestoreModule.serverTimestamp();
    const nextActivity = {
      bookId: normalizedBookId,
      userId: currentUser.uid,
      firstOpenedAt: existing.firstOpenedAt || null,
      lastOpenedAt: existing.lastOpenedAt || null,
      openCount: normalizedNonNegativeInteger(existing.openCount),
      lastReadAt: existing.lastReadAt || null,
      readCount: normalizedNonNegativeInteger(existing.readCount),
      lastDownloadedAt: existing.lastDownloadedAt || null,
      downloadCount: normalizedNonNegativeInteger(existing.downloadCount),
      updatedAt: now
    };

    if (type === "opened") {
      nextActivity.firstOpenedAt ||= now;
      nextActivity.lastOpenedAt = now;
      nextActivity.openCount += 1;
    } else if (type === "read") {
      nextActivity.lastReadAt = now;
      nextActivity.readCount += 1;
    } else {
      nextActivity.lastDownloadedAt = now;
      nextActivity.downloadCount += 1;
    }

    transaction.set(activityRef, nextActivity);
  });

  const syncedDoc = await firestoreModule.getDoc(activityRef);
  const syncedActivity = normalizeLibraryActivity(syncedDoc.data(), syncedDoc.id);
  mergeLocalLibraryActivity([syncedActivity], currentUser.uid);
  const publicProfile = type === "read"
    ? await getPublicReaderProfile(currentUser.uid)
    : null;
  if (type === "read" && publicProfile?.showReadingHistory) {
    await savePublicReadingHistoryRecords(firebase, currentUser.uid, [syncedActivity]).catch((error) => {
      console.warn("Public reading history could not be synchronized.", error);
    });
  }
  return syncedActivity;
}

export async function recordCurrentUserBookActivity(bookId, type) {
  const normalizedBookId = String(bookId || "").trim();
  if (!normalizedBookId) throw new Error("Book ID is required.");
  validateLibraryActivityType(type);

  const currentUser = await getCurrentUser();
  if (!currentUser?.uid) throw new Error("Please sign in to save library activity.");

  const localActivity = recordLocalBookActivity(normalizedBookId, type, currentUser.uid);
  try {
    return await syncCurrentUserBookActivity(normalizedBookId, type, localActivity) || localActivity;
  } catch (error) {
    console.warn("Library activity could not sync to Firebase.", error);
    return localActivity;
  }
}

export async function listCurrentUserBookActivity() {
  const currentUser = await getCurrentUser();
  if (!currentUser?.uid) return [];

  const localActivity = getLocalLibraryActivity(currentUser.uid);
  if (!configured) return localActivity;

  try {
    const firebase = await getFirebaseForRead("Firebase library activity");
    const { db, firestoreModule } = firebase;
    const activityRef = firestoreModule.collection(
      db,
      firebaseCollections.users,
      currentUser.uid,
      "libraryActivity"
    );
    const snapshot = await withTimeout(
      firestoreModule.getDocs(activityRef),
      "Firestore library activity"
    );
    const cloudActivity = snapshot.docs.map((activityDoc) => {
      return normalizeLibraryActivity(activityDoc.data(), activityDoc.id);
    });

    return mergeLocalLibraryActivity(cloudActivity, currentUser.uid);
  } catch (error) {
    console.warn("Using cached library activity because Firestore could not load.", error);
    return localActivity;
  }
}

export async function clearCurrentUserBookActivity(type = "") {
  if (type) validateLibraryActivityType(type);
  const currentUser = await getCurrentUser();
  if (!currentUser?.uid) return [];

  const localActivity = clearLocalLibraryActivity(type, currentUser.uid);
  if (!configured) return localActivity;

  try {
    const firebase = await getFirebase();
    const { db, firestoreModule } = firebase;
    const activityRef = firestoreModule.collection(
      db,
      firebaseCollections.users,
      currentUser.uid,
      "libraryActivity"
    );
    const snapshot = await firestoreModule.getDocs(activityRef);

    await Promise.all(snapshot.docs.map((activityDoc) => {
      if (!type) return firestoreModule.deleteDoc(activityDoc.ref);

      const existing = activityDoc.data();
      const nextActivity = {
        bookId: activityDoc.id,
        userId: currentUser.uid,
        firstOpenedAt: existing.firstOpenedAt || null,
        lastOpenedAt: existing.lastOpenedAt || null,
        openCount: normalizedNonNegativeInteger(existing.openCount),
        lastReadAt: existing.lastReadAt || null,
        readCount: normalizedNonNegativeInteger(existing.readCount),
        lastDownloadedAt: existing.lastDownloadedAt || null,
        downloadCount: normalizedNonNegativeInteger(existing.downloadCount),
        updatedAt: firestoreModule.serverTimestamp()
      };

      if (type === "opened") {
        nextActivity.firstOpenedAt = null;
        nextActivity.lastOpenedAt = null;
        nextActivity.openCount = 0;
      } else if (type === "read") {
        nextActivity.lastReadAt = null;
        nextActivity.readCount = 0;
      } else {
        nextActivity.lastDownloadedAt = null;
        nextActivity.downloadCount = 0;
      }

      const hasRemainingActivity = nextActivity.openCount > 0
        || nextActivity.readCount > 0
        || nextActivity.downloadCount > 0;
      return hasRemainingActivity
        ? firestoreModule.setDoc(activityDoc.ref, nextActivity)
        : firestoreModule.deleteDoc(activityDoc.ref);
    }));

    if (!type || type === "read") {
      await clearFirebasePublicReadingHistory(firebase, currentUser.uid);
    }
  } catch (error) {
    console.warn("Library activity could not clear from Firebase.", error);
  }

  return getLocalLibraryActivity(currentUser.uid);
}

export async function hydrateSavedBooksForCurrentUser() {
  if (!configured) return getSavedIdsForUser();

  const firebase = await getFirebase();
  const currentUser = await getFirebaseAuthUser(firebase);
  if (!currentUser) return getSavedIdsForUser();

  adoptGuestSavedBooksForUser(currentUser.uid);
  return syncSavedBooksForUser(currentUser.uid, firebase);
}

export async function setCurrentUserSavedBook(bookId, saved) {
  if (!bookId || !configured) return;

  const firebase = await getFirebase();
  const currentUser = await getFirebaseAuthUser(firebase);
  if (!currentUser) return;

  const { db, firestoreModule } = firebase;
  const savedBookRef = firestoreModule.doc(
    db,
    firebaseCollections.users,
    currentUser.uid,
    "savedBooks",
    bookId
  );

  if (saved) {
    await firestoreModule.setDoc(savedBookRef, {
      bookId,
      savedAt: firestoreModule.serverTimestamp()
    }, { merge: true });
    return;
  }

  await firestoreModule.deleteDoc(savedBookRef);
}

export async function clearCurrentUserSavedBooks() {
  if (!configured) return;

  const firebase = await getFirebase();
  const currentUser = await getFirebaseAuthUser(firebase);
  if (!currentUser) return;

  const { db, firestoreModule } = firebase;
  const savedBooksRef = firestoreModule.collection(
    db,
    firebaseCollections.users,
    currentUser.uid,
    "savedBooks"
  );
  const snapshot = await firestoreModule.getDocs(savedBooksRef);

  await Promise.all(snapshot.docs.map((savedDoc) => {
    return firestoreModule.deleteDoc(savedDoc.ref);
  }));
}

export function getCachedNotifications() {
  return readLocalNotifications()
    .filter((notification) => notification.active)
    .sort(sortNotificationsNewest);
}

export async function subscribeToPublicNotifications(onChange, onError = () => {}) {
  const notify = typeof onChange === "function" ? onChange : () => {};
  const reportError = typeof onError === "function" ? onError : () => {};
  notify(getCachedNotifications());

  if (!configured) return () => {};

  try {
    const firebase = await getFirebaseForRead("Firebase notifications");
    const { db, firestoreModule } = firebase;
    const notificationsQuery = firestoreModule.query(
      firestoreModule.collection(db, firebaseCollections.notifications),
      firestoreModule.where("active", "==", true)
    );

    return firestoreModule.onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const notifications = snapshot.docs
          .map((notificationDoc) => normalizeNotification(notificationDoc.data(), notificationDoc.id))
          .filter((notification) => notification.active)
          .sort(sortNotificationsNewest);
        writeLocalNotifications(notifications);
        notify(notifications);
      },
      (error) => {
        console.warn("Live notifications could not be loaded.", error);
        reportError(error);
      }
    );
  } catch (error) {
    console.warn("Notifications could not connect to Firebase.", error);
    reportError(error);
    return () => {};
  }
}

export async function listAllNotifications() {
  const localNotifications = readLocalNotifications().sort(sortNotificationsNewest);
  if (!configured) return localNotifications;

  try {
    const firebase = await getFirebaseForRead("Firebase admin notifications");
    const { db, firestoreModule } = firebase;
    const snapshot = await withTimeout(
      firestoreModule.getDocs(
        firestoreModule.collection(db, firebaseCollections.notifications)
      ),
      "Firestore admin notifications"
    );
    const notifications = snapshot.docs
      .map((notificationDoc) => normalizeNotification(notificationDoc.data(), notificationDoc.id))
      .sort(sortNotificationsNewest);
    writeLocalNotifications(notifications);
    return notifications;
  } catch (error) {
    console.warn("Admin notifications could not be loaded.", error);
    if (localNotifications.length) return localNotifications;
    throw error;
  }
}

export async function createNotification(notification) {
  const payload = validateNotificationInput(notification);
  const now = new Date().toISOString();

  if (!configured) {
    const savedNotification = normalizeNotification({
      ...payload,
      id: createLocalId("notification"),
      createdBy: "local-admin",
      createdByName: "Read_Master Admin",
      createdAt: now,
      updatedAt: now
    });
    writeLocalNotifications([savedNotification, ...readLocalNotifications()]);
    return savedNotification;
  }

  const admin = await getCurrentAdmin();
  if (!admin?.uid) throw new Error("Administrator access is required.");
  const firebase = await getFirebase();
  const { db, firestoreModule } = firebase;
  const notificationRef = firestoreModule.doc(
    firestoreModule.collection(db, firebaseCollections.notifications)
  );
  await firestoreModule.setDoc(notificationRef, {
    ...payload,
    createdBy: admin.uid,
    createdByName: String(admin.name || admin.email || "Administrator").slice(0, 80),
    createdAt: firestoreModule.serverTimestamp(),
    updatedAt: firestoreModule.serverTimestamp()
  });

  const savedDoc = await firestoreModule.getDoc(notificationRef);
  const savedNotification = normalizeNotification(savedDoc.data(), savedDoc.id);
  writeLocalNotifications([
    savedNotification,
    ...readLocalNotifications().filter((item) => item.id !== savedNotification.id)
  ]);
  return savedNotification;
}

export async function setNotificationActive(notificationId, active) {
  const normalizedId = String(notificationId || "").trim();
  if (!normalizedId) throw new Error("Notification ID is required.");

  if (!configured) {
    const notifications = readLocalNotifications();
    const index = notifications.findIndex((notification) => notification.id === normalizedId);
    if (index === -1) throw new Error("Notification not found.");
    notifications[index] = normalizeNotification({
      ...notifications[index],
      active: Boolean(active),
      updatedAt: new Date().toISOString()
    }, normalizedId);
    writeLocalNotifications(notifications);
    return notifications[index];
  }

  const admin = await getCurrentAdmin();
  if (!admin?.uid) throw new Error("Administrator access is required.");
  const firebase = await getFirebase();
  const { db, firestoreModule } = firebase;
  const notificationRef = firestoreModule.doc(
    db,
    firebaseCollections.notifications,
    normalizedId
  );
  await firestoreModule.updateDoc(notificationRef, {
    active: Boolean(active),
    updatedAt: firestoreModule.serverTimestamp()
  });

  const savedDoc = await firestoreModule.getDoc(notificationRef);
  const savedNotification = normalizeNotification(savedDoc.data(), savedDoc.id);
  writeLocalNotifications([
    savedNotification,
    ...readLocalNotifications().filter((item) => item.id !== normalizedId)
  ]);
  return savedNotification;
}

export async function deleteNotification(notificationId) {
  const normalizedId = String(notificationId || "").trim();
  if (!normalizedId) throw new Error("Notification ID is required.");

  if (configured) {
    const admin = await getCurrentAdmin();
    if (!admin?.uid) throw new Error("Administrator access is required.");
    const firebase = await getFirebase();
    const { db, firestoreModule } = firebase;
    await firestoreModule.deleteDoc(
      firestoreModule.doc(db, firebaseCollections.notifications, normalizedId)
    );
  }

  writeLocalNotifications(readLocalNotifications().filter((notification) => {
    return notification.id !== normalizedId;
  }));
}

function mergeLocalNotificationReads(reads, userId = "") {
  const store = readLocalNotificationReadStore();
  const scope = notificationReadScope(userId);
  const merged = {
    ...(store.scopes[scope] && typeof store.scopes[scope] === "object" ? store.scopes[scope] : {})
  };

  (Array.isArray(reads) ? reads : []).forEach((read) => {
    const notificationId = String(read?.notificationId || read?.id || "").trim();
    if (notificationId) merged[notificationId] = String(read?.version || "");
  });
  store.scopes[scope] = merged;
  writeLocalNotificationReadStore(store);
  return listLocalNotificationReads(userId);
}

export async function listCurrentUserNotificationReads() {
  const currentUser = await getCurrentUser();
  const localReads = listLocalNotificationReads(currentUser?.uid || "");
  if (!configured || !currentUser?.uid) return localReads;

  try {
    const firebase = await getFirebaseForRead("Firebase notification receipts");
    const { db, firestoreModule } = firebase;
    const receiptsRef = firestoreModule.collection(
      db,
      firebaseCollections.users,
      currentUser.uid,
      "notificationReads"
    );
    const snapshot = await withTimeout(
      firestoreModule.getDocs(receiptsRef),
      "Firestore notification receipts"
    );
    const cloudReads = snapshot.docs.map((receiptDoc) => ({
      notificationId: receiptDoc.id,
      version: String(receiptDoc.data().version || "")
    }));
    return mergeLocalNotificationReads(cloudReads, currentUser.uid);
  } catch (error) {
    console.warn("Notification receipts could not be loaded.", error);
    return localReads;
  }
}

export async function markCurrentUserNotificationsRead(notifications) {
  const normalizedNotifications = (Array.isArray(notifications) ? notifications : [])
    .map((notification) => normalizeNotification(notification, notification?.id))
    .filter((notification) => notification.id);
  const currentUser = await getCurrentUser();
  const localReads = markLocalNotificationsRead(normalizedNotifications, currentUser?.uid || "");
  if (!configured || !currentUser?.uid || !normalizedNotifications.length) return localReads;

  try {
    const firebase = await getFirebase();
    const { db, firestoreModule } = firebase;
    await Promise.all(normalizedNotifications.map((notification) => {
      return firestoreModule.setDoc(
        firestoreModule.doc(
          db,
          firebaseCollections.users,
          currentUser.uid,
          "notificationReads",
          notification.id
        ),
        {
          notificationId: notification.id,
          userId: currentUser.uid,
          version: notificationVersion(notification),
          readAt: firestoreModule.serverTimestamp()
        }
      );
    }));
  } catch (error) {
    console.warn("Notification receipts could not sync to Firebase.", error);
  }

  return localReads;
}

export async function listUsers() {
  if (!configured) return getLocalUsers();

  try {
    const firebase = await getFirebaseForRead("Firebase users");
    const { db, firestoreModule } = firebase;
    const snapshot = await withTimeout(
      firestoreModule.getDocs(
        firestoreModule.collection(db, firebaseCollections.users)
      ),
      "Firestore users"
    );

    const users = snapshot.docs.map((userDoc) => normalizeManagedUser(userDoc.data(), userDoc.id));
    return mergeUsersWithLocalProfiles(users);
  } catch (error) {
    console.warn("Using local users because Firestore users could not load.", error);
    return getLocalUsers();
  }
}

export async function deleteUser(userId) {
  if (!userId) throw new Error("User ID is required.");

  if (!configured) {
    const users = getLocalUsers().filter((user) => user.uid !== userId && user.id !== userId);
    setLocalUsers(users);

    const currentUser = readLocal(userSessionKey, null);
    if (currentUser?.uid === userId) {
      localStorage.removeItem(userSessionKey);
    }

    return;
  }

  const firebase = await getFirebase();
  const { db, firestoreModule } = firebase;
  await firestoreModule.deleteDoc(
    firestoreModule.doc(db, firebaseCollections.users, userId)
  );
}

export async function loginAdmin(email, password) {
  if (!configured) {
    throw new Error("Admin access requires Firebase Authentication.");
  }

  const firebase = await getFirebase();
  const { auth, authModule } = firebase;
  const credential = await authModule.signInWithEmailAndPassword(auth, email, password);
  let adminStatus;

  try {
    adminStatus = await getAdminAccessStatus(credential.user.uid);
  } catch (error) {
    clearCachedAdminSession();
    await authModule.signOut(auth).catch(() => {});
    throw error;
  }

  if (!adminStatus.allowed) {
    clearCachedAdminSession();
    await authModule.signOut(auth);
    throw new Error(adminStatus.reason);
  }

  const session = {
    uid: credential.user.uid,
    email: credential.user.email,
    name: adminStatus.data?.name || credential.user.displayName || "Library Admin",
    photoURL: credential.user.photoURL || "",
    role: "admin",
    demo: false
  };

  clearCachedUserSession();
  storeAdminSession(session);
  return session;
}

export async function getCurrentAdmin() {
  if (!configured) {
    storeAdminSession(null);
    return null;
  }

  const firebase = await getFirebase();
  const { auth, authModule } = firebase;

  const user = await waitForFirebaseAuthUser(firebase);

  if (!user) {
    storeAdminSession(null);
    return null;
  }

  let adminStatus;
  try {
    adminStatus = await withTimeout(
      getAdminAccessStatus(user.uid),
      "Firestore admin permission check",
      3200
    );
  } catch (error) {
    storeAdminSession(null);
    throw error;
  }
  if (!adminStatus.allowed) {
    storeAdminSession(null);
    return null;
  }

  const session = {
    uid: user.uid,
    email: user.email,
    name: adminStatus.data?.name || user.displayName || "Library Admin",
    photoURL: user.photoURL || "",
    role: "admin",
    demo: false
  };

  clearCachedUserSession();
  storeAdminSession(session);
  return session;
}

export async function logoutAdmin() {
  if (!configured) {
    storeAdminSession(null);
    return;
  }

  const firebase = await getFirebase();
  await firebase.authModule.signOut(firebase.auth);
  storeAdminSession(null);
}
