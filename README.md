# Read_Master E-book Library System

## Introduction

Read_Master is an online e-book library system that gives readers a simple place to discover, preview, and save free reading resources. It also provides administrators with tools to manage the library catalogue and keep book information organised.

The system is designed to make digital reading materials easier to access while ensuring that published resources have an appropriate licence or permission for distribution.

## Demo Data Disclaimer

All book records, catalogue details, users, statistics, and related content included in this project are sample data provided only to demonstrate how the system works. They should not be treated as a real production library catalogue.

Real books must not be uploaded, copied, or distributed unless they are in the public domain, covered by a suitable open licence, owned by the publisher, or shared with explicit permission from the copyright holder. Anyone deploying this project is responsible for verifying the source, copyright status, licence terms, and distribution rights of every resource before publishing it.

## System Objectives

- Provide convenient access to free digital books and learning resources.
- Help readers discover books through browsing, searching, and filtering.
- Allow registered readers to maintain favorites, reading activity, reviews, and a personal profile.
- Give administrators a central area for managing books and users.
- Promote responsible sharing by recording the licence status of each resource.

## User Roles

### Reader

Readers can:

- Browse the available and upcoming books.
- Search and filter the library catalogue.
- View book descriptions and resource information.
- Open or preview available reading materials.
- Create an account and manage their profile.
- Save and remove favorite books from their wishlist.
- Return to books they opened, read, or downloaded from My Library.
- Rate books and leave, edit, or delete one review per title.
- Choose whether to share a public reader profile and completed-book history, and comment on other public profiles.
- Check administrator updates from the notification bell and ask the on-page Library Assistant for catalog-based suggestions.

### Administrator

Administrators can:

- Sign in through the administrator portal.
- View a summary of library activity.
- Add new books and reading resources.
- Edit existing book information.
- Manage publication status and licence details.
- View registered user information.
- Publish, deactivate, and remove reader notifications.

## Main System Pages

- **Home:** Introduces the library and highlights popular and recently added resources.
- **Book Details:** Displays a book's description, author, category, licence, reading link, usage totals, and reader reviews.
- **Login:** Allows readers to register or sign in.
- **My Library (`reading-list.html`):** Combines favorite, opened, read, and downloaded books for the current reader.
- **Profile:** Updates private account settings and offers an opt-in public profile with a bio, completed-book history, read count, and visitor comments. Email and private library activity are never shown to visitors.
- **Admin Dashboard:** Provides catalogue statistics and management shortcuts.
- **Add/Edit Book:** Allows administrators to maintain catalogue records.

## Resource and Licence Policy

Books should only be published when they are in the public domain, released under a suitable open licence, owned by the institution, or shared with the author's permission. Administrators must confirm the source and licence information before adding a resource to the public catalogue.

Further guidance is available in `docs/legal-resources.md`.

> Access note: files placed inside `public/` are public static assets. Use protected Firebase Storage paths for any full book that must require sign-in; keep only preview material in `public/`.

## Running Locally and Hosting Online

For local development, start the project with:

```bash
npm start
```

The local website at `http://localhost:5500/` is available only while the development server is running. Closing the terminal, closing VS Code, or turning off the computer stops the local website.

To publish the website with Firebase Hosting, sign in and deploy from the project directory:

```bash
npx firebase-tools login
npx firebase-tools deploy --only hosting,firestore,storage --project read-master-library
```

After Firebase displays `Deploy complete!`, the website remains available at `https://read-master-library.web.app` even when VS Code is closed or the development computer is turned off. Run the deploy command again whenever local changes need to be published.

Book reviews and community features require the included Firestore and Storage rules to be deployed; a hosting-only deploy does not update permissions. The reviewed book must also exist as a real public document in Firestore. Sample books shown by the browser cache are not enough: sign in as an administrator and use **Load Demo Books**, or add/publish licensed books through the dashboard.

The Library Assistant is a local, catalog-based helper, not an external generative-AI service. It recommends public books and explains site features without sending chat content to a third-party model or requiring an API key.

## Administrator Security

The project does not publish a default administrator email or password. An administrator must have both:

1. An Email/Password account created in Firebase Authentication.
2. A Firestore document at `admins/{the-auth-user-uid}` with `active` set to Boolean `true`.

The admin pages verify both requirements with Firebase. A browser-cached value alone cannot grant administrator access. See `docs/firebase-setup.md` for the setup fields and deploy the included Firestore and Storage rules before using the public site.

## Usage Statistics

Popular books use the `viewCount` and `downloadCount` stored on each book. The browser updates exactly one counter by one for an allowed interaction; Firestore rules prevent those public requests from changing book metadata or setting arbitrary totals. Downloads also require an authenticated reader.

These client-written counters are useful for this small demonstration, but they are best-effort statistics rather than tamper-proof analytics. A determined visitor can repeat valid increments. A production deployment should move aggregation to a trusted backend such as Cloud Functions and add abuse controls such as App Check and rate limiting.

## Project Scope

Read_Master demonstrates the core functions of a digital library, including account access, catalogue management, popular and recently added books, reviews, favorites, reading history, My Library, opt-in community profiles, administrator notifications, a catalog assistant, and administrator controls. It can be extended in the future with features such as borrowing records, generative-AI recommendations, trusted server-side analytics, and additional reporting.
