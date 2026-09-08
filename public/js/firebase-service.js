import { firebaseCollections, firebaseConfig, hasFirebaseConfig } from "./firebase-config.js";
import { sampleBooks } from "./sample-data.js";

const firebaseSdkVersion = "10.12.5";
const booksKey = "readmaster:books";
const usersKey = "readmaster:users";
const readingListKey = "readmaster:reading-list";
const sampleDataVersionKey = "readmaster:sample-data-version";
const sampleDataVersion = "8";
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
    firebasePromise = Promise.all([
      import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-auth.js`)
    ]).then(([appModule, firestoreModule, authModule]) => {
      const app = appModule.getApps().length
        ? appModule.getApp()
        : appModule.initializeApp(firebaseConfig);

      return {
        app,
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

  writeLocal(userSessionKey, {
    ...session,
    cachedAt: new Date().toISOString()
  });
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

function readLocalSavedBookIds() {
  const savedIds = readLocal(readingListKey, []);
  return Array.isArray(savedIds) ? savedIds.filter(Boolean) : [];
}

function writeLocalSavedBookIds(savedIds) {
  writeLocal(readingListKey, [...new Set(savedIds.filter(Boolean))]);
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

function normalizeBook(data, id = data.id) {
  const normalizedId = id || data.id;
  const generatedCoverUrl = sampleBookIds.has(normalizedId)
    ? `assets/covers/${normalizedId}.svg?v=${sampleCoverVersion}`
    : "";
  const rawCoverUrl = data.coverUrl || data.cover_image || "";
  const coverUrl = generatedCoverUrl && (!rawCoverUrl || rawCoverUrl.startsWith(`assets/covers/${normalizedId}.svg`))
    ? generatedCoverUrl
    : rawCoverUrl;

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
    trendScore: Number(data.trendScore ?? data.trend_score ?? 0),
    description: data.description || "",
    createdAt: timestampToDateInput(data.createdAt || data.created_at),
    updatedAt: timestampToDateInput(data.updatedAt || data.updated_at)
  };
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
    const seededBooks = sampleBooks.map((book) => ({ ...book }));
    writeLocal(booksKey, seededBooks);
    localStorage.setItem(sampleDataVersionKey, sampleDataVersion);
    return seededBooks;
  }

  if (!Array.isArray(storedBooks)) return [];

  const storedVersion = localStorage.getItem(sampleDataVersionKey);
  if (storedVersion !== sampleDataVersion) {
    const sampleBookById = new Map(sampleBooks.map((book) => [book.id, book]));
    const storedIds = new Set(storedBooks.map((book) => book.id));
    const newSampleBooks = sampleBooks.filter((book) => !storedIds.has(book.id));
    const refreshedBooks = storedBooks.map((book) => {
      const sampleBook = sampleBookById.get(book.id);
      if (!sampleBook) return book;

      return {
        ...sampleBook,
        ...book,
        licenseChecked: book.licenseChecked ?? sampleBook.licenseChecked
      };
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
  return String(b.releaseDate || "").localeCompare(String(a.releaseDate || ""));
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

  return {
    ...payload,
    coverUrl: `assets/covers/${book.id}.svg?v=${sampleCoverVersion}`,
    trendScore: Number(book.trendScore || 0)
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
  if (!userId || !firebase) return readLocalSavedBookIds();

  const { db, firestoreModule } = firebase;
  const savedBooksRef = firestoreModule.collection(
    db,
    firebaseCollections.users,
    userId,
    "savedBooks"
  );
  const snapshot = await firestoreModule.getDocs(savedBooksRef);
  const cloudIds = snapshot.docs.map((savedDoc) => savedDoc.id);
  const mergedIds = [...new Set([...cloudIds, ...readLocalSavedBookIds()])];

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

  writeLocalSavedBookIds(mergedIds);
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

export async function createBook(bookData, files = {}) {
  const payload = cleanBookPayload(bookData);
  validateBookPayload(payload, files);

  if (!configured) {
    const now = new Date().toISOString();
    const localBook = normalizeBook({
      ...payload,
      id: createLocalId(),
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
    createdAt: firestoreModule.serverTimestamp(),
    updatedAt: firestoreModule.serverTimestamp()
  };

  await firestoreModule.setDoc(bookRef, savedBook);
  return normalizeBook(savedBook, bookRef.id);
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
    storeUserSession(session);
    return session;
  }

  const firebase = await getFirebase();
  const { auth, authModule } = firebase;
  const credential = await authModule.createUserWithEmailAndPassword(auth, cleanEmail, password);
  const session = normalizeUser(credential.user, cleanName);

  clearCachedAdminSession();
  storeUserSession(session);
  upsertLocalUser(session);
  authModule.updateProfile(credential.user, { displayName: cleanName }).catch((error) => {
    console.warn("Firebase Auth profile name could not be updated.", error);
  });
  saveFirebaseUserProfile(firebase, session, { created: true }).catch((error) => {
    console.warn("Firebase user profile document could not be saved.", error);
  });
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
  storeUserSession(session);
  upsertLocalUser(session);
  if (cloudProfile !== null) {
    saveFirebaseUserProfile(firebase, session).catch((error) => {
      console.warn("Firebase user profile document could not be saved.", error);
    });
  }
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

export async function hydrateSavedBooksForCurrentUser() {
  if (!configured) return readLocalSavedBookIds();

  const firebase = await getFirebase();
  const currentUser = await getFirebaseAuthUser(firebase);
  if (!currentUser) return readLocalSavedBookIds();

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
