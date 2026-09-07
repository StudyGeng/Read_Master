import { bindAdminShell, guardAdminPage } from "./admin-auth.js";
import {
  createBook,
  deleteBook,
  deleteUser,
  getBook,
  isFirebaseEnabled,
  listAllBooks,
  listUsers,
  seedDemoBooks,
  updateBook
} from "./firebase-service.js";
import {
  $,
  escapeAttribute,
  escapeHtml,
  formatDate,
  getQueryParam,
  setMessage
} from "./utils.js";

const page = document.body.dataset.adminPage;
let adminBooks = [];
let adminUsers = [];
let activeBookId = "";

function bookMatchesSearch(book, searchTerm) {
  const text = [book.title, book.author, book.category, book.status].join(" ").toLowerCase();
  return text.includes(searchTerm.trim().toLowerCase());
}

function renderStats(books) {
  const totalBooks = $("[data-total-books]");
  const publishedBooks = $("[data-published-books]");
  const upcomingBooks = $("[data-upcoming-books]");

  if (totalBooks) totalBooks.textContent = books.length;
  if (publishedBooks) publishedBooks.textContent = books.filter((book) => book.status === "published").length;
  if (upcomingBooks) upcomingBooks.textContent = books.filter((book) => book.status === "upcoming").length;
}

function userMatchesSearch(user, searchTerm) {
  const text = [user.name, user.email, user.role].join(" ").toLowerCase();
  return text.includes(searchTerm.trim().toLowerCase());
}

function renderStatusChart(books) {
  const statusChart = $("#statusChart");
  if (!statusChart) return;

  const rows = [
    { label: "Published", value: books.filter((book) => book.status === "published").length },
    { label: "Upcoming", value: books.filter((book) => book.status === "upcoming").length },
    { label: "Draft", value: books.filter((book) => book.status === "draft").length }
  ];
  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  statusChart.innerHTML = rows.map((row) => {
    const width = row.value ? Math.max((row.value / maxValue) * 100, 8) : 0;
    return `
      <div class="chart-row">
        <span>${escapeHtml(row.label)}</span>
        <div class="chart-track" aria-hidden="true">
          <span class="chart-fill" style="--chart-width: ${width}%"></span>
        </div>
        <strong>${row.value}</strong>
      </div>
    `;
  }).join("");
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(year, month - 1, 1));
}

function bookActivityDate(book) {
  const rawDate = book.createdAt || book.releaseDate;
  const date = rawDate ? new Date(rawDate) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function renderAddedMonthChart(books) {
  const addedMonthChart = $("#addedMonthChart");
  if (!addedMonthChart) return;

  const currentMonth = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - (5 - index), 1);
    return monthKey(date);
  });

  const counts = months.map((key) => {
    return books.filter((book) => {
      const date = bookActivityDate(book);
      return date && monthKey(date) === key;
    }).length;
  });
  const maxValue = Math.max(...counts, 1);

  addedMonthChart.innerHTML = months.map((key, index) => {
    const count = counts[index];
    const height = count ? Math.max((count / maxValue) * 100, 8) : 0;

    return `
      <div class="month-column">
        <div class="month-bar-shell" aria-hidden="true">
          <span class="month-bar" style="--chart-height: ${height}%"></span>
        </div>
        <strong>${count}</strong>
        <span>${escapeHtml(monthLabel(key))}</span>
      </div>
    `;
  }).join("");
}

function renderDashboardCharts(books) {
  renderStatusChart(books);
  renderAddedMonthChart(books);
}

function renderBookRows(books) {
  const tableBody = $("#adminBooksTableBody");
  if (!tableBody) return;

  if (!books.length) {
    tableBody.innerHTML = `<tr><td colspan="7">No books found.</td></tr>`;
    return;
  }

  tableBody.innerHTML = books.map((book) => `
    <tr>
      <td>${escapeHtml(book.title)}</td>
      <td>${escapeHtml(book.author)}</td>
      <td>${escapeHtml(book.category)}</td>
      <td><span class="status-pill ${escapeAttribute(book.status)}">${escapeHtml(book.status)}</span></td>
      <td><span class="status-pill ${book.licenseChecked ? "" : "pending"}">${book.licenseChecked ? "Checked" : "Review"}</span></td>
      <td>${escapeHtml(formatDate(book.releaseDate))}</td>
      <td>
        <div class="table-actions">
          <a class="table-action" href="edit-book.html?id=${encodeURIComponent(book.id)}">Edit</a>
          <button class="table-action danger" type="button" data-delete-book="${escapeAttribute(book.id)}">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderUserRows(users) {
  const tableBody = $("#adminUsersTableBody");
  if (!tableBody) return;

  if (!users.length) {
    const emptyMessage = isFirebaseEnabled()
      ? "No Firestore user profiles found yet. User accounts appear here after they register or sign in."
      : "No demo users found.";
    tableBody.innerHTML = `<tr><td colspan="5">${escapeHtml(emptyMessage)}</td></tr>`;
    return;
  }

  tableBody.innerHTML = users.map((user) => `
    <tr>
      <td>${escapeHtml(user.name)}</td>
      <td>${escapeHtml(user.email)}</td>
      <td><span class="status-pill">${user.demo ? "Demo " : ""}${escapeHtml(user.role || "user")}</span></td>
      <td>${escapeHtml(formatDate(user.joinedAt))}</td>
      <td>
        <div class="table-actions">
          <button class="table-action danger" type="button" data-delete-user="${escapeAttribute(user.uid)}">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function refreshDashboard() {
  const dashboardMessage = $("#dashboardMessage");
  const errors = [];

  const captureData = async (loader, label) => {
    try {
      return await loader();
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
      return [];
    }
  };

  const [books, users] = await Promise.all([
    captureData(listAllBooks, "Books"),
    captureData(listUsers, "Users")
  ]);

  adminBooks = books;
  adminUsers = users;
  renderStats(books);
  renderDashboardCharts(books);
  renderUserRows(users);
  renderBookRows(books);

  if (errors.length) {
    setMessage(dashboardMessage, errors.join(" "), "error");
  }
}

function bindDashboardEvents() {
  const adminBookSearch = $("#adminBookSearch");
  const adminUserSearch = $("#adminUserSearch");
  const tableBody = $("#adminBooksTableBody");
  const usersTableBody = $("#adminUsersTableBody");
  const dashboardMessage = $("#dashboardMessage");
  const seedBooksButton = $("[data-seed-books]");

  adminBookSearch?.addEventListener("input", (event) => {
    const filteredBooks = adminBooks.filter((book) => bookMatchesSearch(book, event.target.value));
    renderBookRows(filteredBooks);
  });

  adminUserSearch?.addEventListener("input", (event) => {
    const filteredUsers = adminUsers.filter((user) => userMatchesSearch(user, event.target.value));
    renderUserRows(filteredUsers);
  });

  tableBody?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-book]");
    if (!button) return;

    const book = adminBooks.find((item) => item.id === button.dataset.deleteBook);
    const confirmed = window.confirm(`Delete "${book?.title || "this book"}"?`);
    if (!confirmed) return;

    try {
      await deleteBook(button.dataset.deleteBook);
      setMessage(dashboardMessage, "Book deleted.", "success");
      await refreshDashboard();
    } catch (error) {
      setMessage(dashboardMessage, error.message, "error");
    }
  });

  usersTableBody?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-user]");
    if (!button) return;

    const user = adminUsers.find((item) => item.uid === button.dataset.deleteUser);
    const confirmed = window.confirm(`Delete "${user?.name || "this user"}" profile?`);
    if (!confirmed) return;

    try {
      await deleteUser(button.dataset.deleteUser);
      setMessage(dashboardMessage, "User profile deleted.", "success");
      await refreshDashboard();
    } catch (error) {
      setMessage(dashboardMessage, error.message, "error");
    }
  });

  seedBooksButton?.addEventListener("click", async () => {
    const originalText = seedBooksButton.textContent;

    try {
      seedBooksButton.disabled = true;
      seedBooksButton.textContent = "Loading Books...";

      const result = await seedDemoBooks();
      setMessage(
        dashboardMessage,
        `Demo books ready. Added ${result.created}, refreshed ${result.updated}, skipped ${result.skipped}.`,
        "success"
      );
      await refreshDashboard();
    } catch (error) {
      setMessage(
        dashboardMessage,
        `${error.message} If Firebase is connected, make sure this login UID exists in the admins collection with active = true.`,
        "error"
      );
    } finally {
      seedBooksButton.disabled = false;
      seedBooksButton.textContent = originalText;
    }
  });
}

function getBookPayload(form) {
  const formData = new FormData(form);
  return {
    title: formData.get("title"),
    author: formData.get("author"),
    category: formData.get("category"),
    format: formData.get("format"),
    language: formData.get("language"),
    releaseDate: formData.get("releaseDate"),
    licenseType: formData.get("licenseType"),
    licenseChecked: formData.get("licenseChecked") === "on",
    sourceName: formData.get("sourceName"),
    resourceUrl: formData.get("resourceUrl"),
    coverUrl: formData.get("coverUrl"),
    status: formData.get("status"),
    description: formData.get("description")
  };
}

function getBookFiles(form) {
  return {
    coverFile: form.elements.coverFile?.files?.[0] || null,
    resourceFile: form.elements.resourceFile?.files?.[0] || null
  };
}

function fillBookForm(form, book) {
  Object.entries(book).forEach(([key, value]) => {
    if (!form.elements[key]) return;
    if (form.elements[key].type === "checkbox") {
      form.elements[key].checked = Boolean(value);
      return;
    }

    form.elements[key].value = value || "";
  });
}

async function initBookForm() {
  const form = $("[data-book-form]");
  const formMessage = $("#bookFormMessage");
  if (!form) return;

  const isEditPage = page === "edit-book";
  activeBookId = isEditPage ? getQueryParam("id") : "";

  if (isEditPage) {
    if (!activeBookId) {
      setMessage(formMessage, "Missing book ID.", "error");
      form.querySelector("button[type='submit']").disabled = true;
      return;
    }

    const book = await getBook(activeBookId);
    if (!book) {
      setMessage(formMessage, "Book not found.", "error");
      form.querySelector("button[type='submit']").disabled = true;
      return;
    }

    fillBookForm(form, book);
  }

  if (!isFirebaseEnabled()) {
    setMessage(formMessage, "Demo mode stores book data locally. File uploads need Firebase Storage.", "success");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector("button[type='submit']");
    const payload = getBookPayload(form);
    const files = getBookFiles(form);

    try {
      submitButton.disabled = true;

      if (isEditPage) {
        await updateBook(activeBookId, payload, files);
        setMessage(formMessage, "Book updated.", "success");
      } else {
        await createBook(payload, files);
        form.reset();
        form.elements.language.value = "English";
        setMessage(formMessage, "Book saved.", "success");
      }
    } catch (error) {
      setMessage(formMessage, error.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  });

  const deleteCurrentButton = $("[data-delete-current]");
  deleteCurrentButton?.addEventListener("click", async () => {
    const confirmed = window.confirm("Delete this book?");
    if (!confirmed) return;

    try {
      await deleteBook(activeBookId);
      window.location.href = "dashboard.html";
    } catch (error) {
      setMessage(formMessage, error.message, "error");
    }
  });
}

async function initAdminPage() {
  if (!page) return;

  const session = await guardAdminPage();
  if (!session) return;

  bindAdminShell(session);

  if (page === "dashboard") {
    bindDashboardEvents();
    await refreshDashboard();
  }

  if (page === "add-book" || page === "edit-book") {
    await initBookForm();
  }
}

initAdminPage();
