import {
  changeUserPassword,
  deleteProfileComment,
  getCachedUser,
  getCurrentAdmin,
  getCurrentUser,
  getPublicReaderProfile,
  hydrateSavedBooksForCurrentUser,
  isFirebaseEnabled,
  listCachedPublishedBooks,
  listCurrentUserBookActivity,
  listProfileComments,
  listPublicReadingHistory,
  listPublishedBooks,
  logoutAdmin,
  logoutUser,
  requestUserEmailChange,
  saveProfileComment,
  updateAdminProfile,
  updatePublicProfileSettings,
  updateUserProfile
} from "./firebase-service.js";
import { getSavedIds } from "./reading-store.js";
import {
  $,
  $$,
  categoryTone,
  clearMessage,
  escapeAttribute,
  escapeHtml,
  formatDate,
  getQueryParam,
  initialsFromTitle,
  setMessage
} from "./utils.js";

const profilePhotoMaxBytes = 2 * 1024 * 1024;
const profilePhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

let activeUser = null;
let activePublicProfile = null;
let viewedProfileId = "";
let profileComments = [];
let publicReadingHistory = [];
let publicBooks = [];
let selectedPhotoFile = null;
let removePhoto = false;
let previewObjectUrl = "";

function initialsFromName(name) {
  return String(name || "Reader")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || "")
    .join("") || "RM";
}

function friendlyProfileError(error) {
  const code = String(error?.code || "");
  if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) {
    return "Your current password is incorrect.";
  }
  if (code.includes("auth/email-already-in-use")) {
    return "That email address is already connected to another account.";
  }
  if (code.includes("auth/invalid-email")) return "Please enter a valid email address.";
  if (code.includes("auth/weak-password")) return "Please choose a stronger password.";
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
  if (previewObjectUrl && URL.revokeObjectURL) URL.revokeObjectURL(previewObjectUrl);
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

function syncPrivacyControls() {
  const publicInput = $("[data-profile-public-input]");
  const historyInput = $("[data-profile-history-input]");
  if (!publicInput || !historyInput) return;
  if (!publicInput.checked) historyInput.checked = false;
  historyInput.disabled = !publicInput.checked;
}

function renderSignedOutProfile() {
  const profile = $("#userProfile");
  if (!profile) return;
  activeUser = null;
  activePublicProfile = null;
  document.body.classList.remove("admin-profile-mode");
  $("[data-reader-community]")?.setAttribute("hidden", "");
  profile.innerHTML = `
    <div class="profile-avatar"><span>RM</span></div>
    <div class="profile-content">
      <p class="eyebrow">User profile</p>
      <h1>Please sign in</h1>
      <p class="profile-email">Create a reader account to keep your favorites and reading activity ready.</p>
      <div class="action-row">
        <a class="btn primary" href="login.html">Login/Signup</a>
        <a class="btn secondary" href="index.html">Back to home</a>
      </div>
    </div>
  `;
}

function renderUnavailableProfile() {
  const profile = $("#userProfile");
  if (!profile) return;
  document.body.classList.remove("admin-profile-mode");
  $("[data-reader-community]")?.setAttribute("hidden", "");
  profile.classList.add("profile-unavailable-card");
  profile.innerHTML = `
    <div class="profile-avatar"><span aria-hidden="true">?</span></div>
    <div class="profile-content">
      <p class="eyebrow">Reader profile</p>
      <h1>This profile is private</h1>
      <p class="profile-email">This reader has not shared a public profile, or the profile is no longer available.</p>
      <div class="action-row">
        <a class="btn primary" href="index.html#libraryShelf">Browse Library</a>
        ${activeUser ? "" : '<a class="btn secondary" href="login.html">Sign in</a>'}
      </div>
    </div>
  `;
}

function renderProfile(user, { publicView = false, publicProfile = activePublicProfile } = {}) {
  if (!user) return;
  if (!publicView) activeUser = user;
  const isAdmin = !publicView && user.role === "admin";
  const name = publicView
    ? user.displayName || user.name || "Reader"
    : user.name || user.email || "Reader";
  const photoURL = publicView
    ? user.avatarURL || user.photoURL || ""
    : user.photoURL || "";
  const sensitiveSettingsAvailable = !publicView && !isAdmin && isFirebaseEnabled() && !user.demo;
  const canShowReadStat = !isAdmin && (!publicView || Boolean(publicProfile?.showReadingHistory));

  document.body.classList.toggle("admin-profile-mode", isAdmin);
  setAvatar(
    $("[data-user-avatar-image]"),
    $("[data-user-initials]"),
    name,
    photoURL
  );
  const nameElement = $("[data-user-name]");
  if (nameElement) nameElement.textContent = name;
  const emailElement = $("[data-user-email]");
  if (emailElement) {
    emailElement.textContent = publicView ? "Public reader profile" : user.email || "No email address";
    emailElement.hidden = false;
  }
  const bioElement = $("[data-user-bio]");
  if (bioElement) {
    bioElement.textContent = publicProfile?.bio || "";
    bioElement.hidden = !publicProfile?.bio;
  }
  const roleElement = $("[data-user-role]");
  if (roleElement) roleElement.textContent = isAdmin ? "Admin" : "User";
  const kindElement = $("[data-profile-kind]");
  if (kindElement) kindElement.textContent = isAdmin ? "Admin profile" : publicView ? "Public reader" : "Reader profile";
  const headingElement = $("[data-profile-heading]");
  if (headingElement) {
    headingElement.textContent = isAdmin
      ? "Profile information"
      : publicView
        ? `${name}'s reading space`
        : "Your reading space";
  }

  const savedStat = $("[data-saved-stat]");
  if (savedStat) savedStat.hidden = isAdmin || publicView;
  const savedCountElement = $("[data-user-saved-count]");
  if (savedCountElement && !publicView) savedCountElement.textContent = String(getSavedIds().length);
  const readStat = $("[data-read-stat]");
  if (readStat) readStat.hidden = !canShowReadStat;
  const readCountElement = $("[data-user-read-count]");
  if (readCountElement) readCountElement.textContent = String(publicReadingHistory.length);

  const joinedAt = publicView ? publicProfile?.joinedAt : user.joinedAt;
  const memberStat = $("[data-member-stat]");
  if (memberStat) memberStat.hidden = isAdmin || !joinedAt;
  const joinedElement = $("[data-user-joined]");
  if (joinedElement) joinedElement.textContent = formatDate(joinedAt);

  $$("[data-profile-owner-only]").forEach((element) => {
    element.hidden = publicView;
  });
  $$("[data-reader-link], [data-reader-action]").forEach((element) => {
    element.hidden = isAdmin || (publicView && element.hasAttribute("data-profile-owner-only"));
  });
  $$("[data-admin-action]").forEach((element) => {
    element.hidden = !isAdmin;
  });
  $$("[data-reader-account-form]").forEach((element) => {
    element.hidden = !sensitiveSettingsAvailable;
  });
  $$("[data-reader-community-setting]").forEach((element) => {
    element.hidden = isAdmin || publicView;
  });
  const photoField = $("[data-reader-photo-field]");
  if (photoField) photoField.hidden = isAdmin || publicView;
  const securityNote = $("[data-demo-security-note]");
  if (securityNote) securityNote.hidden = isAdmin || publicView || sensitiveSettingsAvailable;

  const nameInput = $("[data-profile-name-input]");
  const emailInput = $("[data-profile-email-input]");
  const bioInput = $("[data-profile-bio-input]");
  const publicInput = $("[data-profile-public-input]");
  const historyInput = $("[data-profile-history-input]");
  if (nameInput) nameInput.value = name;
  if (emailInput) emailInput.value = publicView ? "" : user.email || "";
  if (bioInput) bioInput.value = publicProfile?.bio || "";
  if (publicInput) publicInput.checked = Boolean(publicProfile?.isPublic);
  if (historyInput) historyInput.checked = Boolean(publicProfile?.showReadingHistory);
  syncPrivacyControls();
  if (!publicView && !selectedPhotoFile && !removePhoto) renderEditorAvatar(user.photoURL || "");
}

function renderReadingHistory() {
  const grid = $("[data-public-reading-grid]");
  const empty = $("[data-public-reading-empty]");
  const total = $("[data-public-read-count]");
  const profileTotal = $("[data-user-read-count]");
  const canSeeHistory = Boolean(
    activePublicProfile?.showReadingHistory
    || activeUser?.uid === viewedProfileId
  );
  const history = canSeeHistory ? publicReadingHistory : [];
  if (total) total.textContent = `${history.length} ${history.length === 1 ? "book" : "books"} read`;
  if (profileTotal) profileTotal.textContent = String(history.length);
  if (!grid || !empty) return;
  if (!canSeeHistory) {
    grid.innerHTML = "";
    empty.textContent = "This reader keeps their reading history private.";
    empty.hidden = false;
    return;
  }
  if (!history.length) {
    grid.innerHTML = "";
    empty.textContent = "No finished books have been shared yet.";
    empty.hidden = false;
    return;
  }

  const booksById = new Map(publicBooks.map((book) => [book.id, book]));
  grid.innerHTML = history.map((activity) => {
    const book = booksById.get(activity.bookId);
    const title = book?.title || "Book no longer in the public catalog";
    const cover = book?.coverUrl
      ? `<img src="${escapeAttribute(book.coverUrl)}" alt="${escapeAttribute(title)} cover">`
      : `<span>${escapeHtml(initialsFromTitle(title))}</span>`;
    const meta = book
      ? `${escapeHtml(book.author || "Unknown author")} · Read ${formatDate(activity.lastReadAt)}`
      : `Read ${formatDate(activity.lastReadAt)}`;
    const titleMarkup = book
      ? `<a class="profile-read-link" href="book-details.html?id=${encodeURIComponent(book.id)}">${escapeHtml(title)}</a>`
      : escapeHtml(title);
    return `
      <article class="profile-read-book">
        <div class="profile-read-cover" style="--cover-bg: ${categoryTone(book?.category)}">${cover}</div>
        <div class="profile-read-body">
          <h3 class="profile-read-title">${titleMarkup}</h3>
          <p class="profile-read-meta">${meta}</p>
        </div>
      </article>
    `;
  }).join("");
  empty.hidden = true;
}

function canDeleteComment(comment) {
  return Boolean(
    activeUser?.role === "admin"
    || activeUser?.uid === viewedProfileId
    || activeUser?.uid === comment.authorId
  );
}

function renderProfileComments() {
  const list = $("[data-profile-comments-list]");
  const count = $("[data-profile-comment-count]");
  if (count) {
    count.textContent = profileComments.length
      ? `${profileComments.length} ${profileComments.length === 1 ? "comment" : "comments"}`
      : "No comments yet";
  }
  if (!list) return;
  if (!profileComments.length) {
    list.innerHTML = '<p class="empty-state">No comments yet. Be the first reader to leave a friendly note.</p>';
    return;
  }
  list.innerHTML = profileComments.map((comment) => {
    const authorName = comment.authorName || "Reader";
    const avatar = comment.authorPhotoURL
      ? `<img src="${escapeAttribute(comment.authorPhotoURL)}" alt="">`
      : `<span>${escapeHtml(initialsFromName(authorName))}</span>`;
    const deleteButton = canDeleteComment(comment)
      ? `<button class="profile-comment-delete" type="button" data-delete-profile-comment="${escapeAttribute(comment.authorId)}">Delete</button>`
      : "";
    return `
      <article class="profile-comment">
        <a class="profile-comment-avatar" href="profile.html?uid=${encodeURIComponent(comment.authorId)}" aria-label="View ${escapeAttribute(authorName)}'s profile">${avatar}</a>
        <div class="profile-comment-content">
          <div class="profile-comment-header">
            <a class="profile-comment-author" href="profile.html?uid=${encodeURIComponent(comment.authorId)}">${escapeHtml(authorName)}</a>
            <time class="profile-comment-date" datetime="${escapeAttribute(comment.updatedAt || comment.createdAt || "")}">${escapeHtml(formatDate(comment.updatedAt || comment.createdAt))}</time>
          </div>
          <p class="profile-comment-text">${escapeHtml(comment.comment)}</p>
          ${deleteButton}
        </div>
      </article>
    `;
  }).join("");
}

function renderCommentComposer() {
  const form = $("[data-profile-comment-form]");
  const authPrompt = $("[data-profile-comment-auth]");
  const textarea = form?.elements?.comment;
  const submit = $("[data-profile-comment-submit]");
  const reset = $("[data-profile-comment-cancel]");
  const publicTarget = Boolean(activePublicProfile?.isPublic);
  const isReader = Boolean(activeUser?.uid && activeUser.role !== "admin");
  const isOwner = activeUser?.uid === viewedProfileId;
  const ownComment = profileComments.find((comment) => comment.authorId === activeUser?.uid);
  if (authPrompt) authPrompt.hidden = Boolean(activeUser) || !publicTarget;
  if (form) form.hidden = !publicTarget || !isReader || isOwner;
  if (!form || form.hidden) return;
  if (textarea) textarea.value = ownComment?.comment || "";
  if (submit) submit.textContent = ownComment ? "Update Comment" : "Post Comment";
  if (reset) reset.hidden = !ownComment;
}

function renderCommunityNotice() {
  const notice = $("[data-profile-community-notice]");
  if (!notice) return;
  const isOwner = activeUser?.uid === viewedProfileId;
  if (isOwner && !activePublicProfile?.isPublic) {
    notice.textContent = "Your community profile is private. Use Edit Profile to let other readers visit and comment.";
    notice.hidden = false;
    return;
  }
  if (isOwner && !activePublicProfile?.showReadingHistory) {
    notice.textContent = "Your profile is public, but your read history is visible only to you until you enable sharing.";
    notice.hidden = false;
    return;
  }
  notice.hidden = true;
}

async function loadProfileCommunity(profile) {
  const community = $("[data-reader-community]");
  if (!community || !profile?.userId) return;
  activePublicProfile = profile;
  viewedProfileId = profile.userId;
  community.hidden = false;
  publicBooks = listCachedPublishedBooks();
  renderCommunityNotice();
  const ownProfile = activeUser?.uid === viewedProfileId;
  const [historyResult, commentsResult, booksResult] = await Promise.allSettled([
    ownProfile ? listCurrentUserBookActivity() : listPublicReadingHistory(viewedProfileId),
    listProfileComments(viewedProfileId),
    listPublishedBooks()
  ]);
  publicReadingHistory = historyResult.status === "fulfilled"
    ? historyResult.value.filter((activity) => activity.readCount > 0 && activity.lastReadAt)
    : [];
  profileComments = commentsResult.status === "fulfilled" ? commentsResult.value : [];
  if (booksResult.status === "fulfilled") publicBooks = booksResult.value;
  renderReadingHistory();
  renderProfileComments();
  renderCommentComposer();
  renderCommunityNotice();
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
  const commentForm = $("[data-profile-comment-form]");
  const profileMessage = $("#profileMessage");
  const emailMessage = $("#profileEmailMessage");
  const passwordMessage = $("#profilePasswordMessage");
  const commentMessage = $("[data-profile-comment-message]");

  editButton?.addEventListener("click", () => {
    [profileMessage, emailMessage, passwordMessage].forEach(clearMessage);
    resetPhotoEditor();
    setSettingsOpen(true);
    $("[data-profile-name-input]")?.focus();
  });
  cancelButton?.addEventListener("click", () => {
    [profileMessage, emailMessage, passwordMessage].forEach(clearMessage);
    resetPhotoEditor();
    renderProfile(activeUser, { publicProfile: activePublicProfile });
    setSettingsOpen(false);
    editButton?.focus();
  });
  $("[data-profile-public-input]")?.addEventListener("change", syncPrivacyControls);

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
      const isAdmin = activeUser?.role === "admin";
      const updatedUser = isAdmin
        ? await updateAdminProfile(formData.get("name"))
        : await updateUserProfile({
            name: formData.get("name"),
            removePhoto
          }, selectedPhotoFile);
      if (!isAdmin) {
        activePublicProfile = await updatePublicProfileSettings({
          bio: formData.get("bio"),
          isPublic: formData.get("isPublic") === "on",
          showReadingHistory: formData.get("showReadingHistory") === "on"
        });
        viewedProfileId = updatedUser.uid;
      }
      clearPreviewObjectUrl();
      selectedPhotoFile = null;
      removePhoto = false;
      renderProfile(updatedUser, { publicProfile: activePublicProfile });
      resetPhotoEditor();
      if (!isAdmin) await loadProfileCommunity(activePublicProfile);
      setMessage(profileMessage, "Profile updated.", "success");
    } catch (error) {
      setMessage(profileMessage, friendlyProfileError(error), "error");
    } finally {
      setFormBusy(profileForm, false);
      syncPrivacyControls();
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

  commentForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(commentMessage);
    const comment = String(new FormData(commentForm).get("comment") || "");
    try {
      setFormBusy(commentForm, true);
      await saveProfileComment(viewedProfileId, comment);
      profileComments = await listProfileComments(viewedProfileId);
      renderProfileComments();
      renderCommentComposer();
      setMessage(commentMessage, "Your comment was saved.", "success");
    } catch (error) {
      setMessage(commentMessage, friendlyProfileError(error), "error");
    } finally {
      setFormBusy(commentForm, false);
    }
  });

  $("[data-profile-comment-cancel]")?.addEventListener("click", () => {
    clearMessage(commentMessage);
    renderCommentComposer();
    commentForm?.elements?.comment?.focus();
  });

  $("[data-profile-comments-list]")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-profile-comment]");
    if (!button) return;
    clearMessage(commentMessage);
    button.disabled = true;
    try {
      await deleteProfileComment(viewedProfileId, button.dataset.deleteProfileComment);
      profileComments = profileComments.filter((comment) => {
        return comment.authorId !== button.dataset.deleteProfileComment;
      });
      renderProfileComments();
      renderCommentComposer();
    } catch (error) {
      button.disabled = false;
      setMessage(commentMessage, friendlyProfileError(error), "error");
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
  activeUser = user;
  viewedProfileId = user.uid;
  activePublicProfile = await getPublicReaderProfile(user.uid) || {
    userId: user.uid,
    displayName: user.name || "Reader",
    avatarURL: user.photoURL || "",
    bio: "",
    isPublic: false,
    showReadingHistory: false,
    joinedAt: user.joinedAt || ""
  };
  renderProfile(user, { publicProfile: activePublicProfile });
  await loadProfileCommunity(activePublicProfile);
  try {
    await hydrateSavedBooksForCurrentUser();
    renderProfile(user, { publicProfile: activePublicProfile });
  } catch (error) {
    console.warn("Saved books could not load from Firebase.", error);
  }
}

async function initProfile() {
  const requestedProfileId = String(getQueryParam("uid") || "").trim();
  const cachedUser = getCachedUser();
  bindProfileActions();
  if (!requestedProfileId && cachedUser) renderProfile(cachedUser);

  let viewer = null;
  try {
    viewer = await getCurrentAdmin();
  } catch (error) {
    console.warn("Admin profile check skipped.", error);
  }
  if (!viewer) {
    try {
      viewer = await getCurrentUser();
    } catch (error) {
      console.warn("User profile check skipped.", error);
    }
  }
  viewer ||= getCachedUser();
  activeUser = viewer;

  if (requestedProfileId) {
    if (viewer?.uid === requestedProfileId && viewer.role !== "admin") {
      await renderReaderWithSavedBooks(viewer);
      return;
    }
    const targetProfile = await getPublicReaderProfile(requestedProfileId);
    const canView = targetProfile?.isPublic || viewer?.role === "admin";
    if (!targetProfile || !canView) {
      renderUnavailableProfile();
      return;
    }
    activePublicProfile = targetProfile;
    viewedProfileId = targetProfile.userId;
    renderProfile(targetProfile, { publicView: true, publicProfile: targetProfile });
    await loadProfileCommunity(targetProfile);
    return;
  }

  if (viewer?.role === "admin") {
    $("[data-reader-community]")?.setAttribute("hidden", "");
    renderProfile(viewer);
    return;
  }
  if (viewer) {
    await renderReaderWithSavedBooks(viewer);
    return;
  }
  renderSignedOutProfile();
}

initProfile();
