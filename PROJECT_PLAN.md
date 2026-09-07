# Read_Master E-book Library System Build Plan

## 1. Project Idea

This project is a free e-book library web application. Users can use the platform to browse and read free book resources without needing to buy physical books.

The platform should only share legal free resources, such as public domain books, open-license books, school-provided materials, or resources that the system owner has permission to publish.

## 2. Main Goal

Build a responsive and user-friendly web app where users can:

- View free e-book resources.
- Search and filter books easily.
- Open or read digital book resources.
- Save useful books to a reading list.
- Preview a local user profile before Firebase account sync is connected.
- Use the system comfortably on phone, tablet, laptop, and desktop.

## 3. Target Users

- Students who cannot or do not want to buy physical books.
- Teachers who want to share learning resources.
- Readers who prefer digital books.
- Libraries or schools that want a simple free-resource platform.

## 4. System Scope

### Public User

Public users can access the platform without payment.

Features:

- Browse books.
- Search books.
- Filter books by category or format.
- View book details.
- Open free resource links.
- Save books locally or inside their account later.
- Sign in or create a user account when saved books need to sync across devices.

### Admin User

Admin users manage the library content.

Features:

- Add new books.
- Edit book information.
- Delete unavailable or invalid resources.
- Check book license or source before publishing.
- Confirm the legal source/license checkbox before saving book records.

## 5. Main Pages

### Home / Library Page

Purpose: Show the main e-book catalog.

Content:

- Search bar.
- Category filters.
- Book cards.
- Book title, author, category, format, and short description.
- Button to view details or open resource.

### Book Details Page

Purpose: Show full information about one book.

Content:

- Book cover.
- Title.
- Author.
- Description.
- Category.
- Format, for example PDF or EPUB.
- License or source information.
- Read or open button.

### Reading List Page

Purpose: Let users keep books they want to read later.

Content:

- Saved books.
- Remove from reading list button.
- Continue reading button.

### User Profile Page

Purpose: Show the logged-in user's local profile first, then later connect it to Firebase user data.

Content:

- User name.
- User email.
- Role.
- Login mode.
- Saved book count.

### Admin Dashboard

Purpose: Let admin manage books.

Content:

- Admin profile summary.
- Book status charts.
- Added-book month chart.
- User account table.
- Book list table.
- Add book form.
- Edit and delete actions.
- User profile delete actions.
- Book status.

## 6. Recommended Features For First Version

The first version should be simple and working before adding advanced features.

Must-have features:

- Responsive layout.
- Green eye-friendly theme.
- Book catalog.
- Search.
- Category filter.
- Book details.
- Read or open resource button.

Nice-to-have features:

- User login.
- User sign up.
- Reading progress.
- Bookmarks.
- Ratings.
- Download tracking.
- Admin approval system.

## 7. Suggested Technology Stack

### Chosen Stack For This Project

This project will use normal frontend files with Firebase services. React is not required for the first version.

- Frontend: HTML, CSS, JavaScript.
- Database: Firebase Firestore.
- Authentication: Firebase Auth for admin login.
- Storage: Firebase Storage if uploading book covers or PDF files.
- Hosting: Firebase Hosting or normal web hosting.

Reasons for this choice:

- Easier to understand and build for the first version.
- No need to set up a React project.
- Firebase can handle login, database, storage, and hosting.
- Good enough for public users browsing books and admin users adding new releases.
- Can be upgraded to React later if the system becomes bigger.

### Simple Prototype

Use this if the first goal is to quickly show the idea.

- HTML.
- CSS.
- JavaScript.
- Browser local storage for saved books.

### Full Web App

Use this if the goal later becomes a larger system with many pages, complex user features, or a bigger admin dashboard.

- Frontend: React or Vue.
- Backend: Node.js with Express, Laravel, Django, or ASP.NET.
- Database: MySQL, PostgreSQL, or Firebase Firestore.
- File storage: cloud storage for PDFs and book covers.
- Authentication: email and password login.

## 8. Project File Structure

The project should be arranged before coding starts so the public user side, admin side, Firebase files, styles, scripts, and assets stay organized.

Recommended structure:

```text
E-book-libary-system/
|-- PROJECT_PLAN.md
|-- README.md
|-- index.html
|-- book-details.html
|-- profile.html
|-- reading-list.html
|-- admin/
|   |-- login.html
|   |-- dashboard.html
|   |-- add-book.html
|   |-- edit-book.html
|-- assets/
|   |-- images/
|   |-- covers/
|   |-- icons/
|-- css/
|   |-- style.css
|   |-- responsive.css
|   |-- admin.css
|-- js/
|   |-- firebase-config.js
|   |-- main.js
|   |-- books.js
|   |-- book-details.js
|   |-- user-profile.js
|   |-- reading-list.js
|   |-- admin-auth.js
|   |-- admin-books.js
|-- firebase/
|   |-- firestore.rules
|   |-- storage.rules
|-- docs/
|   |-- database-structure.md
|   |-- firebase-setup.md
|   |-- legal-resources.md
```

### File Purpose

- `index.html`: public home and main library page.
- `book-details.html`: page for showing full book information.
- `profile.html`: local user profile preview after user login.
- `reading-list.html`: page for saved books.
- `login.html`: user login and sign up page.
- `admin/login.html`: admin login page using Firebase Auth.
- `admin/dashboard.html`: admin overview page.
- `admin/add-book.html`: form for admin to add new released books.
- `admin/edit-book.html`: form for admin to update existing book data.
- `assets/images`: general images used by the website.
- `assets/covers`: book cover images.
- `assets/icons`: website icons or logo files.
- `css/style.css`: main public website design.
- `css/responsive.css`: responsive rules for mobile, tablet, and desktop.
- `css/admin.css`: admin page design.
- `js/firebase-config.js`: Firebase project configuration.
- `js/main.js`: common public website logic.
- `js/books.js`: load books from Firestore, search, and filter.
- `js/book-details.js`: load one selected book.
- `js/user-profile.js`: show user profile and saved book count.
- `js/reading-list.js`: saved book logic.
- `js/admin-auth.js`: admin login, logout, and auth checking.
- `js/admin-books.js`: admin add, edit, delete, and manage book logic.
- `firebase/firestore.rules`: Firestore database security rules.
- `firebase/storage.rules`: Firebase Storage security rules.
- `docs/database-structure.md`: detailed database field notes.
- `docs/firebase-setup.md`: Firebase setup steps.
- `docs/legal-resources.md`: checklist for allowed free resources and source/license review.

For the first coding phase, only the needed files should be created. Empty future files should not be added unless they are needed.

## 9. Database Tables

### books

- `id`
- `title`
- `author`
- `description`
- `category_id`
- `format`
- `cover_image`
- `resource_url`
- `license_type`
- `license_checked`
- `status`
- `created_at`
- `updated_at`

### categories

- `id`
- `name`
- `description`

### users

- `id`
- `name`
- `email`
- `password`
- `role`
- `created_at`
- `updated_at`

### saved_books

- `id`
- `user_id`
- `book_id`
- `saved_at`

## 10. UI / UX Direction

Theme:

- Main color: deep green.
- Supporting colors: soft mint, white, light gray, and warm cream.
- Avoid bright neon green because it can hurt the eyes.
- Use dark text for readability.

Layout:

- Clean header with logo and navigation.
- Search and filters should be easy to find.
- Book cards should be simple and clear.
- Buttons should be large enough for mobile users.
- Forms should have clear labels.
- Avoid too many decorations so the app feels calm.

## 11. Responsive Design Plan

Desktop:

- Header navigation in one row.
- Filters on the left side.
- Book cards in 3 or 4 columns.

Tablet:

- Filters can move above the book list.
- Book cards in 2 columns.

Mobile:

- Navigation stacks or wraps.
- Search and filters appear above books.
- Book cards display in 1 column.
- Buttons use full width when needed.

## 12. Accessibility Plan

- Use readable font sizes.
- Use enough color contrast.
- Add labels for every input.
- Make buttons keyboard accessible.
- Use clear page headings.
- Do not depend on color only to show status.
- Keep layout stable so content does not overlap.

## 13. Legal And Content Rules

The system should not upload or share copyrighted books without permission.

Allowed resources:

- Public domain books.
- Open educational resources.
- Creative Commons books.
- School-owned materials.
- Author-approved materials.

Admin should review every submitted resource before it becomes public.
Admin must confirm the legal source/license checkbox before saving or publishing any resource.

## 14. Build Phases

### Phase 1: Planning

- Confirm project features.
- Confirm pages.
- Confirm theme.
- Confirm whether to build static prototype or full web app.

### Phase 2: Frontend Prototype

- Build responsive layout.
- Build home/library page.
- Build book cards.
- Build book detail view.

### Phase 3: Backend

- Create database.
- Create book API.
- Create category API.
- Create admin API.

### Phase 4: Admin System

- Add login.
- Add admin dashboard.
- Add edit/delete book workflow.

### Phase 5: Testing

- Test on mobile, tablet, and desktop.
- Test search and filters.
- Test forms.
- Test broken links.
- Test accessibility basics.

### Phase 6: Deployment

- Choose hosting.
- Upload frontend.
- Deploy backend.
- Connect database.
- Test final live website.

## 15. Suggested First Implementation

Start with a static responsive prototype first. This is faster and easier to review.

After the design and flow are okay, upgrade it into a full web app with backend, database, login, and admin dashboard.

## 16. Questions To Confirm Before Coding

- Should the first version be static HTML/CSS/JavaScript or a full backend system?
- Do users need login in the first version?
- Will books be opened from external links or uploaded into this system?
- What categories should the library have?
- What name should the web app use?
