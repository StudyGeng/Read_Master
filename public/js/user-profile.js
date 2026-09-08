import {
  changeUserPassword,
  getCachedUser,
  getCurrentAdmin,
  getCurrentUser,
  hydrateSavedBooksForCurrentUser,
  isFirebaseEnabled,
  logoutAdmin,
  logoutUser,
  requestUserEmailChange,
  updateAdminProfile,
  updateUserProfile
} from "./firebase-service.js";
import { getSavedIds } from "./reading-store.js";
import { $, $$, clearMessage, formatDate, setMessage } from "./utils.js";

const profilePhotoMaxBytes = 2 * 1024 * 1024;
const profilePhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

let activeUser = null;
let selectedPhotoFile = null;
let removePhoto = false;
let previewObjectUrl = "";

function initialsFromName(name) {
  const words = String(name || "Reader").trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase() || "").join("") || "RM";
}

function friendlyProfileError(error) {
  const code = String(error?.code || "");

  if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) {
    return "Your current password is incorrect.";
  }
  if (code.includes("auth/email-already-in-use")) {
    return "That email address is already connected to another account.";
  }
  if (code.includes("auth/invalid-email")) {
    return "Please enter a valid email address.";
  }
  if (code.includes("auth/weak-password")) {
    return "Please choose a stronger password.";
  }
  if (code.includes("auth/too-many-requests")) {
    return "Too many attempts were made. Please wait a moment and try again.";
  }
  if (code.includes("auth/requires-recent-login")) {
    return "For security, sign out, sign in again, and retry this change.";
  }
  if (code.includes("storage/unauthorized") || code.includes("permission-denied")) {
    return "Firebase blocked this change. Publish the latest Firestore and Storage rules, then try again.";
  }

  return error?.message || "The profile could not be updated.";
}

function setAvatar(image, initials, name, photoURL) {
  if (!image || !initials) return;

  const fallback = () => {
    image.hidden = true;
    image.removeAttribute("src");
    initials.hidden = false;
    initials.textContent = initialsFromName(name);
  };

  if (!photoURL) {
    fallback();
    return;
  }

  initials.textContent = initialsFromName(name);
  initials.hidden = true;
  image.alt = `Profile photo for ${name}`;
  image.hidden = false;
  image.onerror = fallback;
  image.src = photoURL;
}

function clearPreviewObjectUrl() {
  if (previewObjectUrl && URL.revokeObjectURL) {
    URL.revokeObjectURL(previewObjectUrl);
  }
  previewObjectUrl = "";
}

function renderEditorAvatar(photoURL = activeUser?.photoURL || "") {
  setAvatar(
    $("[data-profile-avatar-image]"),
    $("[data-profile-avatar-initials]"),
    activeUser?.name || "Reader",
    photoURL
  );
}

function resetPhotoEditor() {
  clearPreviewObjectUrl();
  selectedPhotoFile = null;
  removePhoto = false;

  const photoInput = $("[data-profile-photo-input]");
  if (photoInput) photoInput.value = "";

  const removeButton = $("[data-remove-profile-photo]");
  if (removeButton) removeButton.disabled = !activeUser?.photoURL;

  renderEditorAvatar();
}

function setSettingsOpen(open) {
  const settings = $("[data-profile-settings]");
  const editButton = $("[data-edit-profile]");
  if (settings) settings.hidden = !open;
  if (editButton) editButton.setAttribute("aria-expanded", String(open));
}

function renderSignedOutProfile() {
  const profile = $("#userProfile");
  if (!profile) return;

  activeUser = null;
  document.body.classList.remove("admin-profile-mode");
  profile.innerHTML = `
    <div class="profile-avatar"><span>RM</span></div>
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
  const sensitiveSettingsAvailable = !isAdmin && isFirebaseEnabled() && !user.demo;

  document.body.classList.toggle("admin-profile-mode", isAdmin);
  setAvatar(
    $("[data-user-avatar-image]"),
    $("[data-user-initials]"),
    name,
    user.photoURL || ""
  );
  $("[data-user-name]").textContent = name;
  $("[data-user-email]").textContent = user.email || "No email address";
  $("[data-user-role]").textContent = isAdmin ? "Admin" : "User";
  $("[data-profile-kind]").textContent = isAdmin ? "Admin profile" : "Reader profile";
  $("[data-profile-heading]").textContent = isAdmin ? "Profile information" : "Your reading space";

  const savedStat = $("[data-saved-stat]");
  if (savedStat) savedStat.hidden = isAdmin;

  const savedCountElement = $("[data-user-saved-count]");
  if (savedCountElement) savedCountElement.textContent = String(getSavedIds().length);

  const memberStat = $("[data-member-stat]");
  if (memberStat) memberStat.hidden = isAdmin || !user.joinedAt;

  const joinedElement = $("[data-user-joined]");
  if (joinedElement) joinedElement.textContent = formatDate(user.joinedAt);

  $$("[data-reader-link], [data-reader-action]").forEach((element) => {
    element.hidden = isAdmin;
  });
  $$("[data-admin-action]").forEach((element) => {
    element.hidden = !isAdmin;
  });
  $$("[data-reader-account-form]").forEach((element) => {
    element.hidden = !sensitiveSettingsAvailable;
  });

  const photoField = $("[data-reader-photo-field]");
  if (photoField) photoField.hidden = isAdmin;

  const securityNote = $("[data-demo-security-note]");
  if (securityNote) securityNote.hidden = isAdmin || sensitiveSettingsAvailable;

  const nameInput = $("[data-profile-name-input]");
  const emailInput = $("[data-profile-email-input]");
  if (nameInput) nameInput.value = name;
  if (emailInput) emailInput.value = user.email || "";

  if (!selectedPhotoFile && !removePhoto) renderEditorAvatar(user.photoURL || "");
}

function setFormBusy(form, busy) {
  if (!form) return;
  [...form.elements].forEach((element) => {
    element.disabled = busy;
  });
}

function bindProfileActions() {
  const editButton = $("[data-edit-profile]");
  const settings = $("[data-profile-settings]");
  const cancelButton = $("[data-cancel-edit]");
  const profileForm = $("[data-profile-edit-form]");
  const emailForm = $("[data-email-change-form]");
  const passwordForm = $("[data-password-change-form]");
  const profileMessage = $("#profileMessage");
  const emailMessage = $("#profileEmailMessage");
  const passwordMessage = $("#profilePasswordMessage");

  editButton?.addEventListener("click", () => {
    [profileMessage, emailMessage, passwordMessage].forEach(clearMessage);
    resetPhotoEditor();
    setSettingsOpen(true);
    $("[data-profile-name-input]")?.focus();
  });

  cancelButton?.addEventListener("click", () => {
    [profileMessage, emailMessage, passwordMessage].forEach(clearMessage);
    resetPhotoEditor();
    renderProfile(activeUser);
    setSettingsOpen(false);
    editButton?.focus();
  });

  $("[data-profile-photo-input]")?.addEventListener("change", (event) => {
    clearMessage(profileMessage);
    const file = event.currentTarget.files?.[0] || null;
    if (!file) return;

    if (!profilePhotoTypes.has(file.type)) {
      resetPhotoEditor();
      setMessage(profileMessage, "Choose a JPG, PNG, or WebP image.", "error");
      return;
    }
    if (file.size > profilePhotoMaxBytes) {
      resetPhotoEditor();
      setMessage(profileMessage, "Choose an image smaller than 2 MB.", "error");
      return;
    }

    clearPreviewObjectUrl();
    selectedPhotoFile = file;
    removePhoto = false;
    previewObjectUrl = URL.createObjectURL(file);
    renderEditorAvatar(previewObjectUrl);

    const removeButton = $("[data-remove-profile-photo]");
    if (removeButton) removeButton.disabled = false;
  });

  $("[data-remove-profile-photo]")?.addEventListener("click", () => {
    clearMessage(profileMessage);
    clearPreviewObjectUrl();
    selectedPhotoFile = null;
    removePhoto = true;

    const photoInput = $("[data-profile-photo-input]");
    if (photoInput) photoInput.value = "";
    renderEditorAvatar("");
  });

  profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(profileMessage);
    const formData = new FormData(profileForm);

    try {
      setFormBusy(profileForm, true);
      const updatedUser = activeUser?.role === "admin"
        ? await updateAdminProfile(formData.get("name"))
        : await updateUserProfile({
            name: formData.get("name"),
            removePhoto
          }, selectedPhotoFile);

      clearPreviewObjectUrl();
      selectedPhotoFile = null;
      removePhoto = false;
      renderProfile(updatedUser);
      resetPhotoEditor();
      setMessage(profileMessage, "Profile updated.", "success");
    } catch (error) {
      setMessage(profileMessage, friendlyProfileError(error), "error");
    } finally {
      setFormBusy(profileForm, false);
    }
  });

  emailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(emailMessage);
    const formData = new FormData(emailForm);

    try {
      setFormBusy(emailForm, true);
      const result = await requestUserEmailChange(
        formData.get("email"),
        formData.get("currentPassword")
      );
      emailForm.elements.currentPassword.value = "";
      setMessage(emailMessage, `Verification sent to ${result.email}. Your profile email changes after you confirm the link.`, "success");
    } catch (error) {
      setMessage(emailMessage, friendlyProfileError(error), "error");
    } finally {
      setFormBusy(emailForm, false);
    }
  });

  passwordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(passwordMessage);
    const formData = new FormData(passwordForm);
    const currentPassword = String(formData.get("currentPassword") || "");
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (newPassword !== confirmPassword) {
      setMessage(passwordMessage, "The new passwords do not match.", "error");
      return;
    }
    if (newPassword === currentPassword) {
      setMessage(passwordMessage, "Choose a password different from your current password.", "error");
      return;
    }

    try {
      setFormBusy(passwordForm, true);
      await changeUserPassword(currentPassword, newPassword);
      passwordForm.reset();
      setMessage(passwordMessage, "Password updated successfully.", "success");
    } catch (error) {
      setMessage(passwordMessage, friendlyProfileError(error), "error");
    } finally {
      setFormBusy(passwordForm, false);
    }
  });

  $("[data-user-logout]")?.addEventListener("click", async (event) => {
    const logoutButton = event.currentTarget;
    logoutButton.disabled = true;
    try {
      if (activeUser?.role === "admin") {
        await logoutAdmin();
        window.location.href = "admin/login.html";
        return;
      }

      await logoutUser();
      window.location.href = "login.html";
    } catch (error) {
      logoutButton.disabled = false;
      console.warn("Logout failed.", error);
    }
  });

  if (settings) settings.hidden = true;
}

async function renderReaderWithSavedBooks(user) {
  renderProfile(user);
  try {
    await hydrateSavedBooksForCurrentUser();
    renderProfile(user);
  } catch (error) {
    console.warn("Saved books could not load from Firebase.", error);
  }
}

async function initProfile() {
  const cachedUser = getCachedUser();
  bindProfileActions();
  if (cachedUser) renderProfile(cachedUser);

  try {
    const admin = await getCurrentAdmin();
    if (admin) {
      renderProfile(admin);
      return;
    }
  } catch (error) {
    console.warn("Admin profile check skipped.", error);
  }

  try {
    const user = await getCurrentUser();
    if (user) {
      await renderReaderWithSavedBooks(user);
      return;
    }
  } catch (error) {
    console.warn("User profile check skipped.", error);
  }

  const fallbackUser = getCachedUser();
  if (fallbackUser) {
    await renderReaderWithSavedBooks(fallbackUser);
    return;
  }

  renderSignedOutProfile();
}

initProfile();
