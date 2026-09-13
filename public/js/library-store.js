const activityStorageKey = "readmaster:library-activity:v1";
const userSessionStorageKey = "readmaster:demo-user-session";
const activityTypes = new Set(["opened", "read", "downloaded"]);

function storage() {
  return globalThis.localStorage || null;
}

function safeIsoTimestamp(value) {
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

function safeCount(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function laterTimestamp(...values) {
  return values
    .map(safeIsoTimestamp)
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

function earlierTimestamp(...values) {
  return values
    .map(safeIsoTimestamp)
    .filter(Boolean)
    .sort()
    .at(0) || "";
}

function normalizeActivity(data = {}, fallbackBookId = "") {
  const bookId = String(data.bookId || fallbackBookId || "").trim();
  const lastOpenedAt = safeIsoTimestamp(data.lastOpenedAt || data.openedAt);
  const lastReadAt = safeIsoTimestamp(data.lastReadAt || data.readAt);
  const lastDownloadedAt = safeIsoTimestamp(data.lastDownloadedAt || data.downloadedAt);

  return {
    bookId,
    firstOpenedAt: safeIsoTimestamp(data.firstOpenedAt || lastOpenedAt),
    lastOpenedAt,
    openedAt: lastOpenedAt,
    openCount: safeCount(data.openCount ?? data.openedCount),
    lastReadAt,
    readAt: lastReadAt,
    readCount: safeCount(data.readCount),
    lastDownloadedAt,
    downloadedAt: lastDownloadedAt,
    downloadCount: safeCount(data.downloadCount ?? data.downloadedCount),
    updatedAt: safeIsoTimestamp(data.updatedAt)
      || laterTimestamp(lastOpenedAt, lastReadAt, lastDownloadedAt)
  };
}

function readActivityStore() {
  try {
    const parsed = JSON.parse(storage()?.getItem(activityStorageKey) || "{}");
    const scopes = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed.scopes
      : null;
    return {
      version: 1,
      scopes: scopes && typeof scopes === "object" && !Array.isArray(scopes) ? scopes : {}
    };
  } catch {
    return { version: 1, scopes: {} };
  }
}

function writeActivityStore(store) {
  storage()?.setItem(activityStorageKey, JSON.stringify({
    version: 1,
    scopes: store.scopes || {}
  }));
}

export function getLibraryScopeId() {
  try {
    const session = JSON.parse(storage()?.getItem(userSessionStorageKey) || "null");
    const uid = String(session?.uid || "").trim();
    return uid ? `user:${uid}` : "guest";
  } catch {
    return "guest";
  }
}

function scopeIdForUser(userId) {
  const uid = String(userId || "").trim();
  return uid ? `user:${uid}` : getLibraryScopeId();
}

export function getLocalLibraryActivity(userId = "") {
  const scopeId = scopeIdForUser(userId);
  const scope = readActivityStore().scopes[scopeId];
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) return [];

  return Object.entries(scope)
    .map(([bookId, activity]) => normalizeActivity(activity, bookId))
    .filter((activity) => activity.bookId)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export function getLibraryActivity() {
  return getLocalLibraryActivity();
}

export function getBookActivity(bookId) {
  const normalizedBookId = String(bookId || "").trim();
  if (!normalizedBookId) return null;
  return getLibraryActivity().find((activity) => activity.bookId === normalizedBookId) || null;
}

function writeScopeActivity(activities, userId = "") {
  const scopeId = scopeIdForUser(userId);
  const store = readActivityStore();
  const nextScope = {};

  activities.forEach((activity) => {
    const normalized = normalizeActivity(activity);
    if (normalized.bookId) nextScope[normalized.bookId] = normalized;
  });

  if (Object.keys(nextScope).length) {
    store.scopes[scopeId] = nextScope;
  } else {
    delete store.scopes[scopeId];
  }
  writeActivityStore(store);
  return getLocalLibraryActivity(userId);
}

function mergeActivity(current, incoming) {
  const bookId = String(incoming?.bookId || current?.bookId || "").trim();
  const merged = {
    bookId,
    firstOpenedAt: earlierTimestamp(current?.firstOpenedAt, incoming?.firstOpenedAt),
    lastOpenedAt: laterTimestamp(current?.lastOpenedAt, current?.openedAt, incoming?.lastOpenedAt, incoming?.openedAt),
    openCount: Math.max(safeCount(current?.openCount), safeCount(incoming?.openCount)),
    lastReadAt: laterTimestamp(current?.lastReadAt, current?.readAt, incoming?.lastReadAt, incoming?.readAt),
    readCount: Math.max(safeCount(current?.readCount), safeCount(incoming?.readCount)),
    lastDownloadedAt: laterTimestamp(
      current?.lastDownloadedAt,
      current?.downloadedAt,
      incoming?.lastDownloadedAt,
      incoming?.downloadedAt
    ),
    downloadCount: Math.max(safeCount(current?.downloadCount), safeCount(incoming?.downloadCount)),
    updatedAt: laterTimestamp(current?.updatedAt, incoming?.updatedAt)
  };

  if (!merged.firstOpenedAt && merged.lastOpenedAt) merged.firstOpenedAt = merged.lastOpenedAt;
  return normalizeActivity(merged);
}

export function mergeLocalLibraryActivity(activities, userId = "") {
  const byBookId = new Map(getLocalLibraryActivity(userId).map((activity) => [activity.bookId, activity]));

  (Array.isArray(activities) ? activities : []).forEach((activity) => {
    const normalized = normalizeActivity(activity);
    if (!normalized.bookId) return;
    byBookId.set(normalized.bookId, mergeActivity(byBookId.get(normalized.bookId), normalized));
  });

  return writeScopeActivity([...byBookId.values()], userId);
}

export function recordLocalBookActivity(bookId, type, userId = "") {
  const normalizedBookId = String(bookId || "").trim();
  if (!normalizedBookId) throw new Error("Book ID is required.");
  if (!activityTypes.has(type)) throw new Error("Activity type must be opened, read, or downloaded.");

  const now = new Date().toISOString();
  const activities = getLocalLibraryActivity(userId);
  const existing = activities.find((activity) => activity.bookId === normalizedBookId);
  const next = normalizeActivity(existing || { bookId: normalizedBookId });

  if (type === "opened") {
    next.firstOpenedAt ||= now;
    next.lastOpenedAt = now;
    next.openedAt = now;
    next.openCount += 1;
  } else if (type === "read") {
    next.lastReadAt = now;
    next.readAt = now;
    next.readCount += 1;
  } else {
    next.lastDownloadedAt = now;
    next.downloadedAt = now;
    next.downloadCount += 1;
  }
  next.updatedAt = now;

  writeScopeActivity([
    next,
    ...activities.filter((activity) => activity.bookId !== normalizedBookId)
  ], userId);
  return normalizeActivity(next);
}

function clearedActivity(activity, type) {
  const next = { ...activity, updatedAt: new Date().toISOString() };

  if (type === "opened") {
    next.firstOpenedAt = "";
    next.lastOpenedAt = "";
    next.openedAt = "";
    next.openCount = 0;
  } else if (type === "read") {
    next.lastReadAt = "";
    next.readAt = "";
    next.readCount = 0;
  } else if (type === "downloaded") {
    next.lastDownloadedAt = "";
    next.downloadedAt = "";
    next.downloadCount = 0;
  }

  return normalizeActivity(next);
}

function hasActivity(activity) {
  return activity.openCount > 0 || activity.readCount > 0 || activity.downloadCount > 0;
}

export function clearLocalLibraryActivity(type = "", userId = "") {
  if (type && !activityTypes.has(type)) {
    throw new Error("Activity type must be opened, read, or downloaded.");
  }

  if (!type) return writeScopeActivity([], userId);

  const remaining = getLocalLibraryActivity(userId)
    .map((activity) => clearedActivity(activity, type))
    .filter(hasActivity);
  return writeScopeActivity(remaining, userId);
}

export function recordBookActivity(bookId, type) {
  const activity = recordLocalBookActivity(bookId, type);
  const scopeId = getLibraryScopeId();

  if (scopeId !== "guest") {
    import("./firebase-service.js")
      .then(({ syncCurrentUserBookActivity }) => syncCurrentUserBookActivity(bookId, type, activity))
      .catch((error) => console.warn("Reading activity could not sync to Firebase.", error));
  }

  return activity;
}

export async function hydrateLibraryActivityForCurrentUser() {
  if (getLibraryScopeId() === "guest") return getLibraryActivity();

  try {
    const { listCurrentUserBookActivity } = await import("./firebase-service.js");
    await listCurrentUserBookActivity();
  } catch (error) {
    console.warn("Reading activity could not load from Firebase.", error);
  }
  return getLibraryActivity();
}

export function clearLibraryActivity(type = "") {
  const scopeId = getLibraryScopeId();
  clearLocalLibraryActivity(type);

  if (scopeId === "guest") return Promise.resolve(getLibraryActivity());

  return import("./firebase-service.js")
    .then(({ clearCurrentUserBookActivity }) => clearCurrentUserBookActivity(type))
    .catch((error) => {
      console.warn("Reading activity could not clear from Firebase.", error);
      return getLibraryActivity();
    });
}
