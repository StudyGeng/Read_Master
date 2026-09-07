const storageKey = "readmaster:reading-list";

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

function readSavedIds() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function writeSavedIds(ids) {
  localStorage.setItem(storageKey, JSON.stringify([...new Set(ids)]));
}

export function getSavedIds() {
  return readSavedIds();
}

export function isBookSaved(bookId) {
  return readSavedIds().includes(bookId);
}

export function toggleSavedBook(bookId) {
  const savedIds = readSavedIds();
  const nextIds = savedIds.includes(bookId)
    ? savedIds.filter((id) => id !== bookId)
    : [...savedIds, bookId];

  writeSavedIds(nextIds);
  const saved = nextIds.includes(bookId);
  syncSavedBookChange(bookId, saved);
  return saved;
}

export function clearSavedBooks() {
  writeSavedIds([]);
  syncSavedBookClear();
}
