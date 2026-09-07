import { getCachedAdmin, getCachedUser, getCurrentUser, getDataModeLabel, isFirebaseEnabled } from "./firebase-service.js";
import { $$ } from "./utils.js";

function markActiveNav() {
  const page = document.body.dataset.page;
  if (!page) return;

  const activePage = page === "profile" ? "login" : page;

  $$("[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === activePage);
  });
}

function renderConfigNotices() {
  const isConnected = isFirebaseEnabled();
  const text = isConnected
    ? getDataModeLabel()
    : `${getDataModeLabel()}. Add Firebase keys in public/js/firebase-config.js before real deployment.`;

  $$("[data-config-notice]").forEach((notice) => {
    notice.textContent = text;
    notice.hidden = isConnected;
  });
}

function updateAccountLinks(user) {
  const accountLinks = $$("[data-nav='login']");
  if (!accountLinks.length) return;

  accountLinks.forEach((link) => {
    link.textContent = user ? "Profile" : "Login/Signup";
    link.href = user ? "profile.html" : "login.html";
  });
}

async function renderAccountNav() {
  const cachedAdmin = getCachedAdmin();
  const cachedUser = getCachedUser();
  const cachedReader = cachedUser && cachedUser.uid !== cachedAdmin?.uid ? cachedUser : null;
  updateAccountLinks(cachedReader);

  try {
    const user = await getCurrentUser();
    updateAccountLinks(user);
  } catch (error) {
    console.warn("Account navigation session check skipped.", error);
    updateAccountLinks(cachedReader);
  }
}

markActiveNav();
renderConfigNotices();
renderAccountNav();
