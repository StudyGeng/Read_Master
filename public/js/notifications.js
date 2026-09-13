import {
  getCachedNotifications,
  listCurrentUserNotificationReads,
  markCurrentUserNotificationsRead,
  subscribeToPublicNotifications
} from "./firebase-service.js";

const notificationPanelId = "readMasterNotificationPanel";
const notificationHeadingId = "readMasterNotificationHeading";
const maximumVisibleNotifications = 30;
const knownNotificationKinds = new Set(["announcement", "new-book", "maintenance"]);

function createElement(tagName, className = "", text = "") {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function createBellIcon() {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(svgNamespace, "svg");
  icon.classList.add("notification-bell-icon");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");

  const bell = document.createElementNS(svgNamespace, "path");
  bell.setAttribute("d", "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9");
  bell.setAttribute("fill", "none");
  bell.setAttribute("stroke", "currentColor");
  bell.setAttribute("stroke-linecap", "round");
  bell.setAttribute("stroke-linejoin", "round");
  bell.setAttribute("stroke-width", "2");

  const clapper = document.createElementNS(svgNamespace, "path");
  clapper.setAttribute("d", "M10 21h4");
  clapper.setAttribute("fill", "none");
  clapper.setAttribute("stroke", "currentColor");
  clapper.setAttribute("stroke-linecap", "round");
  clapper.setAttribute("stroke-width", "2");

  icon.append(bell, clapper);
  return icon;
}

function notificationId(notification) {
  return String(notification?.id || notification?.notificationId || "").trim();
}

function dateFromValue(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value.seconds === "number") {
    const date = new Date((value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1e6));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function notificationDate(notification) {
  return dateFromValue(
    notification?.updatedAt
    || notification?.publishedAt
    || notification?.createdAt
  );
}

function normalizeNotifications(value) {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(value?.notifications)
      ? value.notifications
      : [];
  const uniqueNotifications = new Map();

  source.forEach((notification) => {
    const id = notificationId(notification);
    if (!id || notification?.active === false) return;
    uniqueNotifications.set(id, notification);
  });

  return [...uniqueNotifications.values()]
    .sort((first, second) => {
      const firstTime = notificationDate(first)?.getTime() || 0;
      const secondTime = notificationDate(second)?.getTime() || 0;
      return secondTime - firstTime || notificationId(first).localeCompare(notificationId(second));
    })
    .slice(0, maximumVisibleNotifications);
}

function notificationReadVersions(value) {
  let source = [];

  if (value instanceof Map) return new Map(value);
  if (value instanceof Set) source = [...value];
  else if (Array.isArray(value)) source = value;
  else if (Array.isArray(value?.readIds)) source = value.readIds;
  else if (Array.isArray(value?.reads)) source = value.reads;

  return new Map(source.map((read) => {
    if (typeof read === "string") return [read.trim(), ""];
    return [
      String(read?.notificationId || read?.id || "").trim(),
      String(read?.version || "")
    ];
  }).filter(([id]) => id));
}

function notificationVersion(notification) {
  return notificationDate(notification)?.toISOString()
    || String(notification?.updatedAt || notification?.createdAt || "");
}

function notificationKind(notification) {
  const kind = String(notification?.kind || notification?.type || "announcement")
    .trim()
    .toLowerCase();
  return knownNotificationKinds.has(kind) ? kind : "announcement";
}

function notificationKindLabel(kind) {
  if (kind === "new-book") return "New book";
  if (kind === "maintenance") return "Service update";
  return "Admin update";
}

function safeInternalUrl(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue || typeof window === "undefined" || !window.location) return "";

  try {
    const url = new URL(rawValue, window.location.href);
    const safeProtocol = url.protocol === "http:" || url.protocol === "https:";
    const sameOrigin = url.origin === window.location.origin;
    if (!safeProtocol || !sameOrigin || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

function notificationLink(notification) {
  return safeInternalUrl(
    notification?.linkUrl
    || notification?.targetUrl
    || notification?.url
    || notification?.href
  );
}

function formatNotificationDate(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function callUnsubscribe(unsubscribe) {
  if (typeof unsubscribe !== "function") return;
  try {
    const result = unsubscribe();
    result?.catch?.((error) => {
      console.warn("Notification subscription could not close cleanly.", error);
    });
  } catch (error) {
    console.warn("Notification subscription could not close cleanly.", error);
  }
}

export function initNotifications() {
  if (typeof document === "undefined" || typeof window === "undefined") return () => {};
  if (document.body?.classList.contains("admin-page")) return () => {};

  const navigation = document.querySelector(".site-nav");
  if (!navigation || document.querySelector("[data-notification-center]")) return () => {};

  const center = createElement("div", "notification-center");
  center.dataset.notificationCenter = "";

  const bellButton = createElement("button", "notification-bell");
  bellButton.type = "button";
  bellButton.dataset.notificationBell = "";
  bellButton.setAttribute("aria-label", "Notifications");
  bellButton.setAttribute("aria-haspopup", "dialog");
  bellButton.setAttribute("aria-expanded", "false");
  bellButton.setAttribute("aria-controls", notificationPanelId);

  const badge = createElement("span", "notification-badge");
  badge.dataset.notificationBadge = "";
  badge.setAttribute("aria-hidden", "true");
  badge.hidden = true;
  bellButton.append(createBellIcon(), badge);

  const panel = createElement("section", "notification-panel");
  panel.id = notificationPanelId;
  panel.dataset.notificationPanel = "";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", notificationHeadingId);
  panel.tabIndex = -1;
  panel.hidden = true;

  const panelHeader = createElement("div", "notification-panel-header");
  const headingGroup = createElement("div", "notification-heading-group");
  const eyebrow = createElement("p", "notification-eyebrow", "Library updates");
  const heading = createElement("h2", "notification-heading", "Notifications");
  heading.id = notificationHeadingId;
  headingGroup.append(eyebrow, heading);

  const closeButton = createElement("button", "notification-close", "\u00d7");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close notifications");
  panelHeader.append(headingGroup, closeButton);

  const toolbar = createElement("div", "notification-toolbar");
  const countText = createElement("p", "notification-count", "Checking for updates…");
  countText.dataset.notificationCount = "";
  const markAllButton = createElement("button", "notification-mark-all", "Mark all read");
  markAllButton.type = "button";
  markAllButton.dataset.notificationMarkAll = "";
  markAllButton.disabled = true;
  toolbar.append(countText, markAllButton);

  const feedback = createElement("p", "notification-feedback");
  feedback.dataset.notificationFeedback = "";
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  feedback.hidden = true;

  const list = createElement("div", "notification-list");
  list.dataset.notificationList = "";
  list.setAttribute("aria-live", "polite");
  list.setAttribute("aria-busy", "true");

  panel.append(panelHeader, toolbar, feedback, list);
  center.append(bellButton, panel);
  navigation.append(center);

  let notifications = [];
  let readVersions = new Map();
  let notificationsReady = false;
  let readsReady = false;
  let markingAll = false;
  let destroyed = false;
  let liveUpdateReceived = false;
  let unsubscribe = null;
  let returnFocus = null;
  const markingIds = new Set();

  function notificationWasRead(notification) {
    const id = notificationId(notification);
    if (!id || !readVersions.has(id)) return false;
    const savedVersion = readVersions.get(id);
    return !savedVersion || savedVersion === notificationVersion(notification);
  }

  function setFeedback(message = "", isError = false) {
    feedback.textContent = message;
    feedback.classList.toggle("error", Boolean(isError));
    feedback.hidden = !message;
  }

  function unreadNotifications() {
    if (!readsReady) return [];
    return notifications.filter((notification) => !notificationWasRead(notification));
  }

  function updateBell(unreadCount) {
    const hasUnread = unreadCount > 0;
    center.classList.toggle("has-unread", hasUnread);
    bellButton.classList.toggle("has-unread", hasUnread);
    bellButton.classList.toggle("notification-bell--ringing", hasUnread);
    bellButton.setAttribute(
      "aria-label",
      hasUnread
        ? `Notifications, ${unreadCount} unread`
        : "Notifications, no unread updates"
    );
    badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    badge.hidden = !hasUnread;
  }

  async function markNotificationsRead(items, successMessage = "") {
    const unreadItems = items.filter((notification) => {
      const id = notificationId(notification);
      return id && !notificationWasRead(notification) && !markingIds.has(id);
    });
    if (!unreadItems.length) return;

    unreadItems.forEach((notification) => markingIds.add(notificationId(notification)));
    render();

    try {
      await markCurrentUserNotificationsRead(unreadItems);
      unreadItems.forEach((notification) => {
        readVersions.set(notificationId(notification), notificationVersion(notification));
      });
      if (successMessage) setFeedback(successMessage);
    } catch (error) {
      console.warn("Notifications could not be marked as read.", error);
      setFeedback("Could not save your notification status. Please try again.", true);
    } finally {
      unreadItems.forEach((notification) => markingIds.delete(notificationId(notification)));
      render();
    }
  }

  function createNotificationItem(notification) {
    const id = notificationId(notification);
    const isUnread = readsReady && !notificationWasRead(notification);
    const item = createElement("article", "notification-item");
    item.dataset.notificationId = id;
    item.classList.toggle("is-unread", isUnread);

    const meta = createElement("div", "notification-item-meta");
    const kind = notificationKind(notification);
    const kindBadge = createElement(
      "span",
      `notification-kind notification-kind--${kind}`,
      notificationKindLabel(kind)
    );
    meta.append(kindBadge);

    const date = notificationDate(notification);
    if (date) {
      const time = createElement("time", "notification-time", formatNotificationDate(date));
      time.dateTime = date.toISOString();
      meta.append(time);
    }

    const title = String(notification?.title || "Library update").trim() || "Library update";
    const itemHeading = createElement("h3", "notification-item-title", title);
    const message = createElement(
      "p",
      "notification-item-message",
      String(notification?.message || notification?.body || "").trim()
    );
    item.append(meta, itemHeading);
    if (message.textContent) item.append(message);

    const actions = createElement("div", "notification-item-actions");
    const linkUrl = notificationLink(notification);
    if (linkUrl) {
      const link = createElement("a", "notification-link", "View update");
      link.href = linkUrl;
      link.setAttribute("aria-label", `View update: ${title}`);
      link.addEventListener("click", () => {
        if (isUnread) void markNotificationsRead([notification]);
      });
      actions.append(link);
    }

    if (isUnread) {
      const markButton = createElement(
        "button",
        "notification-read-button",
        markingIds.has(id) ? "Saving…" : "Mark read"
      );
      markButton.type = "button";
      markButton.disabled = markingIds.has(id);
      markButton.setAttribute("aria-label", `Mark ${title} as read`);
      markButton.addEventListener("click", () => {
        setFeedback();
        void markNotificationsRead([notification], "Notification marked as read.");
      });
      actions.append(markButton);
    }

    if (actions.childElementCount) item.append(actions);
    return item;
  }

  function render() {
    if (destroyed) return;
    const unread = unreadNotifications();
    updateBell(unread.length);

    if (!notificationsReady) countText.textContent = "Checking for updates…";
    else if (!notifications.length) countText.textContent = "No current updates";
    else if (!readsReady) countText.textContent = `${notifications.length} update${notifications.length === 1 ? "" : "s"}`;
    else countText.textContent = unread.length
      ? `${unread.length} unread update${unread.length === 1 ? "" : "s"}`
      : "You are all caught up";

    markAllButton.disabled = markingAll || !readsReady || unread.length === 0;
    markAllButton.textContent = markingAll ? "Saving…" : "Mark all read";
    list.setAttribute("aria-busy", String(!notificationsReady));
    list.replaceChildren();

    if (!notificationsReady) {
      list.append(createElement("p", "notification-empty", "Loading library updates…"));
      return;
    }

    if (!notifications.length) {
      list.append(createElement("p", "notification-empty", "There are no library updates right now."));
      return;
    }

    notifications.forEach((notification) => {
      list.append(createNotificationItem(notification));
    });
  }

  function acceptNotifications(value, isLiveUpdate = false) {
    if (destroyed) return;
    if (!isLiveUpdate && liveUpdateReceived) return;
    if (isLiveUpdate) liveUpdateReceived = true;
    notifications = normalizeNotifications(value);
    notificationsReady = true;
    setFeedback();
    render();
  }

  function openPanel() {
    if (!panel.hidden) return;
    returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : bellButton;
    panel.hidden = false;
    center.classList.add("is-open");
    bellButton.setAttribute("aria-expanded", "true");

    const moveFocus = () => {
      if (!destroyed && !panel.hidden) closeButton.focus();
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(moveFocus);
    else window.setTimeout(moveFocus, 0);
  }

  function closePanel(restoreFocus = true) {
    if (panel.hidden) return;
    panel.hidden = true;
    center.classList.remove("is-open");
    bellButton.setAttribute("aria-expanded", "false");
    const focusTarget = returnFocus;
    returnFocus = null;
    if (restoreFocus && focusTarget?.isConnected) focusTarget.focus();
  }

  function handleBellClick() {
    setFeedback();
    if (panel.hidden) openPanel();
    else closePanel();
  }

  function handleOutsidePointer(event) {
    if (!panel.hidden && !center.contains(event.target)) closePanel(false);
  }

  function handleDocumentKeydown(event) {
    if (event.key !== "Escape" || panel.hidden) return;
    event.preventDefault();
    closePanel(true);
  }

  async function handleMarkAll() {
    const unread = unreadNotifications();
    if (!unread.length || markingAll) return;

    markingAll = true;
    setFeedback();
    render();
    await markNotificationsRead(unread, "All notifications marked as read.");
    markingAll = false;
    render();
  }

  function cleanup() {
    if (destroyed) return;
    destroyed = true;
    callUnsubscribe(unsubscribe);
    unsubscribe = null;
    document.removeEventListener("pointerdown", handleOutsidePointer);
    document.removeEventListener("keydown", handleDocumentKeydown);
    window.removeEventListener("pagehide", cleanup);
    bellButton.removeEventListener("click", handleBellClick);
    closeButton.removeEventListener("click", handleCloseClick);
    markAllButton.removeEventListener("click", handleMarkAll);
    center.remove();
  }

  function handleCloseClick() {
    closePanel(true);
  }

  bellButton.addEventListener("click", handleBellClick);
  closeButton.addEventListener("click", handleCloseClick);
  markAllButton.addEventListener("click", handleMarkAll);
  document.addEventListener("pointerdown", handleOutsidePointer);
  document.addEventListener("keydown", handleDocumentKeydown);
  window.addEventListener("pagehide", cleanup, { once: true });

  render();

  try {
    const cachedNotifications = getCachedNotifications();
    if (cachedNotifications?.then) {
      Promise.resolve(cachedNotifications)
        .then((value) => acceptNotifications(value))
        .catch((error) => {
          console.warn("Cached notifications could not load.", error);
          notificationsReady = true;
          render();
        });
    } else {
      acceptNotifications(cachedNotifications);
    }
  } catch (error) {
    console.warn("Cached notifications could not load.", error);
    notificationsReady = true;
    render();
  }

  Promise.resolve(listCurrentUserNotificationReads())
    .then((reads) => {
      if (destroyed) return;
      readVersions = new Map([...readVersions, ...notificationReadVersions(reads)]);
      readsReady = true;
      render();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Notification read status could not load.", error);
      readsReady = true;
      setFeedback("Your saved notification status is temporarily unavailable.", true);
      render();
    });

  try {
    Promise.resolve(subscribeToPublicNotifications(
      (value) => acceptNotifications(value, true),
      (error) => {
        if (destroyed) return;
        console.warn("Live notifications could not update.", error);
        setFeedback("Live updates are temporarily unavailable. Showing saved updates.", true);
      }
    ))
      .then((stopSubscription) => {
        if (destroyed) {
          callUnsubscribe(stopSubscription);
          return;
        }
        unsubscribe = stopSubscription;
      })
      .catch((error) => {
        if (destroyed) return;
        console.warn("Live notifications could not start.", error);
        setFeedback("Live updates are temporarily unavailable. Showing saved updates.", true);
      });
  } catch (error) {
    console.warn("Live notifications could not start.", error);
    setFeedback("Live updates are temporarily unavailable. Showing saved updates.", true);
  }

  return cleanup;
}
