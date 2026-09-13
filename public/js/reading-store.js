const legacyStorageKey = "readmaster:reading-list";
const storageKey = "readmaster:reading-list:v2";
const userSessionStorageKey = "readmaster:demo-user-session";

function storage() {
  return globalThis.localStorage || null;
}

function normalizeSavedIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
}

function currentScopeId() {
  try {
    const session = JSON.parse(storage()?.getItem(userSessionStorageKey) || "null");
    const uid = String(session?.uid || "").trim();
    return uid ? `user:${uid}` : "guest";
  } catch {
    return "guest";
  }
}

function scopeIdForUser(userId = "") {
  const uid = String(userId || "").trim();
  return uid ? `user:${uid}` : currentScopeId();
}

function writeSavedStore(store) {
  storage()?.setItem(storageKey, JSON.stringify({
    version: 2,
    scopes: store.scopes || {}
  }));
}

function readSavedStore() {
  try {
    const savedStorage = storage();
    const parsed = JSON.parse(savedStorage?.getItem(storageKey) || "null");
    if (parsed?.scopes && typeof parsed.scopes === "object" && !Array.isArray(parsed.scopes)) {
      return { version: 2, scopes: parsed.scopes };
    }

    // Move the original unscoped list into whichever reader (or guest) currently owns it.
    const legacyIds = normalizeSavedIds(JSON.parse(savedStorage?.getItem(legacyStorageKey) || "[]"));
    const migratedStore = {
      version: 2,
      scopes: legacyIds.length ? { [currentScopeId()]: legacyIds } : {}
    };
    writeSavedStore(migratedStore);
    savedStorage?.removeItem(legacyStorageKey);
    return migratedStore;
  } catch {
    return { version: 2, scopes: {} };
  }
}

function writeSavedIds(ids, userId = "") {
  const scopeId = scopeIdForUser(userId);
  const store = readSavedStore();
  const normalizedIds = normalizeSavedIds(ids);

  if (normalizedIds.length) {
    store.scopes[scopeId] = normalizedIds;
  } else {
    delete store.scopes[scopeId];
  }

  writeSavedStore(store);
  return normalizedIds;
}

function syncSavedBookChange(bookId, saved) {
  import("./firebase-service.js")
    .then(({ setCurrentUserSavedBook }) => setCurrentUserSavedBook(bookId, saved))
    .catch((error) => {
      console.warn("Saved book could not sync to Firebase.", error);
    });
}

function syncSavedBookClear() {
  import("./firebase-service.js")
    .then(({ clearCurrentUserSavedBooks }) => clearCurrentUserSavedBooks())
    .catch((error) => {
      console.warn("Saved books could not clear from Firebase.", error);
    });
}

export function getSavedIdsForUser(userId = "") {
  const scopeId = scopeIdForUser(userId);
  return normalizeSavedIds(readSavedStore().scopes[scopeId]);
}

export function replaceSavedIdsForUser(ids, userId = "") {
  return writeSavedIds(ids, userId);
}

export function mergeSavedIdsForUser(ids, userId = "") {
  return writeSavedIds([...getSavedIdsForUser(userId), ...normalizeSavedIds(ids)], userId);
}

export function adoptGuestSavedBooksForUser(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return getSavedIdsForUser();

  const store = readSavedStore();
  const userScopeId = scopeIdForUser(uid);
  const mergedIds = normalizeSavedIds([
    ...(store.scopes[userScopeId] || []),
    ...(store.scopes.guest || [])
  ]);

  if (mergedIds.length) store.scopes[userScopeId] = mergedIds;
  else delete store.scopes[userScopeId];
  delete store.scopes.guest;
  writeSavedStore(store);
  return mergedIds;
}

export function getSavedIds() {
  return getSavedIdsForUser();
}

export function isBookSaved(bookId) {
  return getSavedIds().includes(String(bookId || "").trim());
}

export function toggleSavedBook(bookId) {
  const normalizedBookId = String(bookId || "").trim();
  if (!normalizedBookId) return false;

  const savedIds = getSavedIds();
  const nextIds = savedIds.includes(normalizedBookId)
    ? savedIds.filter((id) => id !== normalizedBookId)
    : [...savedIds, normalizedBookId];

  writeSavedIds(nextIds);
  const saved = nextIds.includes(normalizedBookId);
  syncSavedBookChange(normalizedBookId, saved);
  return saved;
}

export function clearSavedBooks() {
  writeSavedIds([]);
  syncSavedBookClear();
}
