# Firebase Setup

## 1. Create Firebase Project

Create a Firebase project and add a web app.

Copy the web app config into:

```text
public/js/firebase-config.js
```

Replace the placeholder values:

```js
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

## 2. Enable Authentication

Enable email/password sign-in in Firebase Authentication.

Create the admin user account with a private email and password. Do not add that password to this repository or any public HTML/JavaScript file.

## 3. Create Admin Permission Document

After creating the admin account, copy the Firebase Auth UID.

Create this document in Firestore:

```text
Collection: admins
Document ID: admin_user_uid
```

Fields:

```text
active: true
email: your-admin@email.com
name: Admin
```

## 4. Enable Firestore

Create Firestore Database.

Use these collections:

- `admins`
- `books`
- `users`
- `publicProfiles` (created automatically for readers; private by default)
- `notifications` (created through the administrator dashboard)

Deploy or copy the rules from:

```text
firebase/firestore.rules
```

## 5. Enable Storage

Enable Firebase Storage if admins will upload covers or PDF files.

Deploy or copy the rules from:

```text
firebase/storage.rules
```

Storage is also used for reader profile photos. The included rules limit uploads to the account owner, accepted image formats, and files smaller than 2 MB. A photo becomes readable by other visitors only when its reader opts in to a public profile.

## 6. Deploy Hosting and Rules

From the project directory, run:

```bash
npx firebase-tools deploy --only hosting,firestore,storage --project read-master-library
```

A hosting-only deployment will not repair a `Missing or insufficient permissions` error for reviews or community features. Publish the Firestore and Storage rules too. Reviews additionally require the book's parent document to exist in Firestore with a checked licence and public status; locally displayed sample books do not count. In the admin dashboard, use **Load Demo Books** for sample records or add real, properly licensed books.

## 7. Test

Test these flows:

- Public user can view published or upcoming books only after the admin legal check is confirmed.
- Public user cannot add, edit, or delete books.
- User can sign in or create an account.
- User can update their display name and profile photo.
- User can request a verified email change and change their password after entering their current password.
- Admin can log in.
- Admin can add new released books after checking the legal source/license confirmation.
- Admin can edit and delete books.
- A signed-in reader can post, edit, and delete their review on a real published Firestore book.
- A reader can opt in to a public profile and optionally share completed-book history; visitors cannot see their email or private activity.
- A second signed-in reader can leave and update one comment on a public profile.
- Admin-published notifications appear in the reader bell, and read status is private to each reader.
