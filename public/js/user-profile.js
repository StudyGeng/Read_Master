import {
  getCachedAdmin,
  getCachedUser,
  getCurrentAdmin,
  getCurrentUser,
  hydrateSavedBooksForCurrentUser,
  logoutAdmin,
  logoutUser,
  updateAdminProfile,
  updateUserProfile
} from "./firebase-service.js";
import { getSavedIds } from "./reading-store.js";
import { $, $$, clearMessage, setMessage } from "./utils.js";

let activeUser = null;

function initialsFromName(name) {
  const words = String(name || "Reader").trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase() || "").join("") || "RM";
}

function renderSignedOutProfile() {
  const profile = $("#userProfile");
  if (!profile) return;

  activeUser = null;
  document.body.classList.remove("admin-profile-mode");
  profile.innerHTML = `
    <div class="profile-avatar">RM</div>
    <div class="profile-content">
      <p class="eyebrow">User profile</p>
      <h1>Please sign in</h1>
      <p class="profile-email">Create a reader account to keep your saved books ready.</p>
      <div class="action-row">
        <a class="btn primary" href="login.html">Login/Signup</a>
        <a class="btn secondary" href="index.html">Back to home</a>
      </div>
    </div>
  `;
}

function renderProfile(user) {
  if (!user) return;
  activeUser = user;

  const name = user.name || user.email || "Reader";
  const isAdmin = user.role === "admin";
  const savedCount = getSavedIds().length;

  document.body.classList.toggle("admin-profile-mode", isAdmin);
  $("[data-user-initials]").textContent = initialsFromName(name);
  $("[data-user-name]").textContent = name;
  $("[data-user-email]").textContent = user.email || "reader@example.com";
  $("[data-user-role]").textContent = isAdmin ? "Admin" : "User";
  $("[data-profile-kind]").textContent = isAdmin ? "Admin profile" : "Reader profile";
  $("[data-profile-heading]").textContent = isAdmin ? "Profile information" : "Your reading space";

  const savedStat = $("[data-saved-stat]");
  if (savedStat) savedStat.hidden = isAdmin;

  const savedCountElement = $("[data-user-saved-count]");
  if (savedCountElement) savedCountElement.textContent = String(savedCount);

  $$("[data-reader-link], [data-reader-action]").forEach((element) => {
    element.hidden = isAdmin;
  });

  $$("[data-admin-action]").forEach((element) => {
    element.hidden = !isAdmin;
  });

  const nameInput = $("[data-profile-name-input]");
  const emailInput = $("[data-profile-email-input]");
  if (nameInput) nameInput.value = name;
  if (emailInput) emailInput.value = user.email || "";
}

function bindProfileActions() {
  const editButton = $("[data-edit-profile]");
  const editForm = $("[data-profile-edit-form]");
  const cancelButton = $("[data-cancel-edit]");
  const message = $("#profileMessage");

  editButton?.addEventListener("click", () => {
    clearMessage(message);
    if (editForm) editForm.hidden = false;
    $("[data-profile-name-input]")?.focus();
  });

  cancelButton?.addEventListener("click", () => {
    clearMessage(message);
    if (editForm) editForm.hidden = true;
    renderProfile(activeUser);
  });

  editForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(message);

    const submitButton = editForm.querySelector("button[type='submit']");
    const formData = new FormData(editForm);

    try {
      submitButton.disabled = true;
      const updatedUser = activeUser?.role === "admin"
        ? await updateAdminProfile(formData.get("name"))
        : await updateUserProfile(formData.get("name"));
      renderProfile(updatedUser);
      setMessage(message, "Profile updated.", "success");
    } catch (error) {
      setMessage(message, error.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  });

  $("[data-user-logout]")?.addEventListener("click", async () => {
    if (activeUser?.role === "admin") {
      await logoutAdmin();
      window.location.href = "admin/login.html";
      return;
    }

    await logoutUser();
    window.location.href = "login.html";
  });
}

async function initProfile() {
  const cachedUser = getCachedUser();
  const cachedAdmin = getCachedAdmin();
  const cachedSession = cachedUser || cachedAdmin;
  bindProfileActions();

  if (cachedSession) renderProfile(cachedSession);

  let user = null;
  try {
    user = await getCurrentUser();
  } catch (error) {
    console.warn("User profile check skipped.", error);
  }

  if (user) {
    renderProfile(user);
    hydrateSavedBooksForCurrentUser()
      .then(() => renderProfile(user))
      .catch((error) => {
        console.warn("Saved books could not load from Firebase.", error);
      });
    return;
  }

  let admin = null;
  try {
    admin = await getCurrentAdmin();
  } catch (error) {
    console.warn("Admin profile check skipped.", error);
  }

  if (admin) {
    renderProfile(admin);
    return;
  }

  const fallbackSession = getCachedUser() || getCachedAdmin();
  if (!fallbackSession) {
    renderSignedOutProfile();
    return;
  }

  renderProfile(fallbackSession);
  if (fallbackSession.role === "admin") return;

  hydrateSavedBooksForCurrentUser()
    .then(() => renderProfile(fallbackSession))
    .catch((error) => {
      console.warn("Saved books could not load from Firebase.", error);
    });
}

initProfile();
