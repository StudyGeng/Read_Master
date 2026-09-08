const allowedReturnPages = new Set([
  "index.html",
  "book-details.html",
  "reading-list.html",
  "profile.html"
]);

function defaultBaseUrl() {
  return globalThis.location?.href || "http://localhost/login.html";
}

export function isPdfResourceUrl(resourceUrl, baseUrl = defaultBaseUrl()) {
  const value = String(resourceUrl || "").trim();
  if (!value) return false;

  try {
    const pathname = decodeURIComponent(new URL(value, baseUrl).pathname).toLowerCase();
    return pathname.endsWith(".pdf") || pathname.includes(".pdf/");
  } catch {
    return value.split(/[?#]/)[0].toLowerCase().endsWith(".pdf");
  }
}

export function getBookAccess(book, user, baseUrl = defaultBaseUrl()) {
  const published = String(book?.status || "published").toLowerCase() === "published";
  const hasResource = Boolean(String(book?.resourceUrl || "").trim());
  const signedIn = Boolean(user?.uid);
  const pdfResource = hasResource && isPdfResourceUrl(book.resourceUrl, baseUrl);

  return {
    canPreview: published,
    canRead: published && hasResource && signedIn,
    canDownload: published && pdfResource && signedIn,
    hasResource,
    pdfResource,
    signedIn
  };
}

export function buildBookLoginUrl(bookId) {
  const returnTo = `book-details.html?id=${encodeURIComponent(String(bookId || ""))}`;
  return `login.html?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getSafeReturnPath(candidate, baseUrl = defaultBaseUrl(), fallback = "profile.html") {
  const value = String(candidate || "").trim();
  if (!value || value.startsWith("//")) return fallback;

  try {
    const base = new URL(baseUrl);
    const target = new URL(value, base);
    const baseDirectory = new URL(".", base);

    if (target.origin !== base.origin || !target.pathname.startsWith(baseDirectory.pathname)) {
      return fallback;
    }

    const relativePath = target.pathname.slice(baseDirectory.pathname.length);
    if (!allowedReturnPages.has(relativePath)) return fallback;

    return `${relativePath}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
