import { getCachedUser, getCurrentUser, isFirebaseEnabled, loginUser, logoutUser, registerUser } from "./firebase-service.js";
import { $, $$, clearMessage, escapeHtml, setMessage } from "./utils.js";

function friendlyAuthError(error) {
  const code = error?.code || "";

  if (code.includes("auth/email-already-in-use")) {
    return "This email already has an account. Please sign in instead.";
  }

  if (code.includes("auth/invalid-email")) {
    return "Please enter a valid email address.";
  }

  if (code.includes("auth/operation-not-allowed")) {
    return "Email/password signup is not enabled in Firebase Authentication.";
  }

  if (code.includes("auth/configuration-not-found")) {
    return "Firebase Authentication is not set up yet. In Firebase Console, open Authentication, click Get started, then enable Email/Password.";
  }

  if (code.includes("auth/weak-password")) {
    return "Password must be at least 6 characters.";
  }

  if (code.includes("auth/invalid-credential") || code.includes("auth/user-not-found") || code.includes("auth/wrong-password")) {
    return "Email or password is incorrect.";
  }

  if (code.includes("permission-denied")) {
    return "Firestore blocked this request. Publish the project Firestore rules first.";
  }

  return error?.message || "Something went wrong. Please try again.";
}

function setupLoginMode() {
  const demoNote = $("[data-demo-note]");
  const loginForm = $("#userLoginForm");

  if (isFirebaseEnabled()) {
    if (demoNote) demoNote.hidden = true;
    return;
  }

  if (demoNote) demoNote.hidden = false;

  if (loginForm) {
    loginForm.elements.email.value = loginForm.elements.email.value || "reader@example.com";
    loginForm.elements.password.value = loginForm.elements.password.value || "reader123";
  }
}

function setActiveForm(mode) {
  $$("[data-auth-tab]").forEach((tab) => {
    const isActive = tab.dataset.authTab === mode;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  $$("[data-auth-form]").forEach((form) => {
    form.hidden = form.dataset.authForm !== mode;
  });
}

function renderSessionStatus(session) {
  const status = $("#userSessionStatus");

  if (!status || !session) return;

  status.innerHTML = `
    <span>Signed in as</span>
    <strong>${escapeHtml(session.name || session.email)}</strong>
    <a class="btn primary" href="profile.html">Open Profile</a>
    <button class="btn secondary" type="button" data-user-logout>Logout</button>
  `;

  const logoutButton = $("[data-user-logout]", status);
  logoutButton?.addEventListener("click", async () => {
    await logoutUser();
    window.location.reload();
  });
}

async function renderUserSession() {
  const cachedUser = getCachedUser();
  if (cachedUser) renderSessionStatus(cachedUser);

  const session = await getCurrentUser();
  if (session) renderSessionStatus(session);
}

function bindTabs() {
  $$("[data-auth-tab]").forEach((tab) => {
    tab.addEventListener("click", () => setActiveForm(tab.dataset.authTab));
  });
}

function bindLoginForm() {
  const form = $("#userLoginForm");
  if (!form) return;

  const message = $("#userLoginMessage");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(message);

    const formData = new FormData(form);
    const submitButton = form.querySelector("button[type='submit']");

    try {
      submitButton.disabled = true;
      await loginUser(formData.get("email"), formData.get("password"));
      setMessage(message, "Signed in. Opening your profile...", "success");
      window.location.href = "profile.html";
    } catch (error) {
      setMessage(message, friendlyAuthError(error), "error");
    } finally {
      submitButton.disabled = false;
    }
  });
}

function bindRegisterForm() {
  const form = $("#userRegisterForm");
  if (!form) return;

  const message = $("#userRegisterMessage");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(message);

    const formData = new FormData(form);
    const email = formData.get("email");
    const password = formData.get("password");
    const submitButton = form.querySelector("button[type='submit']");

    try {
      submitButton.disabled = true;
      await registerUser(
        formData.get("name"),
        email,
        password
      );
      setMessage(message, "Account created. Opening your profile...", "success");
      window.location.href = "profile.html";
    } catch (error) {
      if ((error?.code || "").includes("auth/email-already-in-use")) {
        try {
          await loginUser(email, password);
          setMessage(message, "Account already exists. Opening your profile...", "success");
          window.location.href = "profile.html";
          return;
        } catch {
          setMessage(message, "This email already has an account. Please sign in instead.", "error");
          return;
        }
      }

      setMessage(message, friendlyAuthError(error), "error");
    } finally {
      submitButton.disabled = false;
    }
  });
}

setupLoginMode();
bindTabs();
bindLoginForm();
bindRegisterForm();
renderUserSession();
