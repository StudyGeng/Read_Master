import { getCachedAdmin, getCurrentAdmin, isFirebaseEnabled, loginAdmin, logoutAdmin } from "./firebase-service.js";
import { $, $$, clearMessage, setMessage } from "./utils.js";

function friendlyAdminError(error) {
  const code = error?.code || "";

  if (code.includes("auth/invalid-credential") || code.includes("auth/user-not-found") || code.includes("auth/wrong-password")) {
    return "Firebase rejected this email/password. If the admin user already exists, reset its password in Firebase Authentication or sign in with the exact password you created there.";
  }

  if (code.includes("auth/invalid-email")) {
    return "Please enter a valid admin email address.";
  }

  if (code.includes("auth/operation-not-allowed")) {
    return "Email/password login is not enabled in Firebase Authentication.";
  }

  if (code.includes("auth/configuration-not-found")) {
    return "Firebase Authentication is not set up yet. Open Firebase Authentication and enable Email/Password.";
  }

  if (code.includes("auth/unauthorized-domain")) {
    return "This local domain is not allowed in Firebase Auth. Add localhost and 127.0.0.1 in Authentication settings, then try again.";
  }

  if (code.includes("permission-denied")) {
    return "Firestore blocked the admin check. Publish the Firestore rules and add your admin UID to the admins collection.";
  }

  if (
    code.includes("unavailable")
    || String(error?.message || "").toLowerCase().includes("client is offline")
    || String(error?.message || "").toLowerCase().includes("failed to get document")
  ) {
    return "The admin account signed in, but Firestore could not check the admin permission. Create/enable Firestore, add this UID in admins, allow localhost/127.0.0.1 in Firebase Auth, then refresh.";
  }

  return error?.message || "Admin login failed. Please try again.";
}

export async function guardAdminPage() {
  const cachedSession = getCachedAdmin();
  if (cachedSession) {
    getCurrentAdmin()
      .then((verifiedSession) => {
        if (!verifiedSession) {
          window.location.href = "login.html";
        }
      })
      .catch((error) => {
        console.warn("Admin permission recheck is slow.", error);
      });

    return cachedSession;
  }

  const session = await getCurrentAdmin();

  if (!session) {
    window.location.href = "login.html";
    return null;
  }

  return session;
}

export function bindAdminShell(session) {
  $$("[data-admin-email]").forEach((element) => {
    element.textContent = session.email || "admin";
  });

  $$("[data-admin-name]").forEach((element) => {
    element.textContent = session.name || "Read_Master Admin";
  });

  $$("[data-admin-role]").forEach((element) => {
    element.textContent = session.role || "admin";
  });

  $$("[data-admin-mode]").forEach((element) => {
    element.textContent = session.demo ? "Local demo" : "Firebase";
  });

  $$("[data-logout]").forEach((button) => {
    button.addEventListener("click", async () => {
      await logoutAdmin();
      window.location.href = "login.html";
    });
  });
}

async function initLoginPage() {
  const loginForm = $("#adminLoginForm");
  if (!loginForm) return;

  const loginMessage = $("#loginMessage");
  const demoNote = $("[data-admin-demo-note]");
  const liveNote = $("[data-live-admin-note]");

  if (isFirebaseEnabled()) {
    if (demoNote) demoNote.hidden = true;
    if (liveNote) liveNote.hidden = false;
  } else {
    if (demoNote) demoNote.hidden = false;
    if (liveNote) liveNote.hidden = true;
    loginForm.elements.email.value = loginForm.elements.email.value || "admin@example.com";
    loginForm.elements.password.value = loginForm.elements.password.value || "admin123";
  }

  const cachedSession = getCachedAdmin();
  if (cachedSession) {
    window.location.href = "dashboard.html";
    return;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(loginMessage);

    const formData = new FormData(loginForm);
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");
    const submitButton = loginForm.querySelector("button[type='submit']");

    try {
      submitButton.disabled = true;
      await loginAdmin(email, password);
      window.location.href = "dashboard.html";
    } catch (error) {
      setMessage(loginMessage, friendlyAdminError(error), "error");
    } finally {
      submitButton.disabled = false;
    }
  });

  getCurrentAdmin()
    .then((currentSession) => {
      if (currentSession) {
        window.location.href = "dashboard.html";
      }
    })
    .catch((error) => {
      console.warn("Admin session check skipped.", error);
      setMessage(loginMessage, friendlyAdminError(error), "error");
    });
}

initLoginPage();
