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

Create the admin user account.

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
email: admin@example.com
name: Admin
```

## 4. Enable Firestore

Create Firestore Database.

Use these collections:

- `admins`
- `books`
- `users`

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

## 6. Test

Test these flows:

- Public user can view published or upcoming books only after the admin legal check is confirmed.
- Public user cannot add, edit, or delete books.
- User can sign in or create an account.
- Admin can log in.
- Admin can add new released books after checking the legal source/license confirmation.
- Admin can edit and delete books.
