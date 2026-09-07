const htmlEntities = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
};

export function $(selector, parent = document) {
  return parent.querySelector(selector);
}

export function $$(selector, parent = document) {
  return [...parent.querySelectorAll(selector)];
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => htmlEntities[char]);
}

export function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function setMessage(element, text, type = "success") {
  if (!element) return;
  element.textContent = text;
  element.hidden = false;
  element.classList.remove("success", "error");
  element.classList.add(type);
}

export function clearMessage(element) {
  if (!element) return;
  element.textContent = "";
  element.hidden = true;
  element.classList.remove("success", "error");
}

export function formatDate(value) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(date);
}

export function initialsFromTitle(title) {
  const words = String(title || "Book").trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase() || "").join("") || "BK";
}

export function categoryTone(category) {
  const tones = {
    Technology: "linear-gradient(135deg, #123d2a, #477a7d)",
    Science: "linear-gradient(135deg, #236b49, #c99a3e)",
    Literature: "linear-gradient(135deg, #173125, #c46f55)",
    Business: "linear-gradient(135deg, #1b5238, #d7b95a)",
    Education: "linear-gradient(135deg, #4b9662, #fff8df)",
    Design: "linear-gradient(135deg, #477a7d, #cfe9d2)"
  };

  return tones[category] || "linear-gradient(135deg, #123d2a, #4b9662)";
}

