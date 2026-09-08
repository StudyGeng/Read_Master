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

Storage is also used for reader profile photos. The included rule limits photos to the account owner, accepted image formats, and files smaller than 2 MB.

## 6. Deploy Hosting and Rules

From the project directory, run:

```bash
npx firebase-tools deploy --only hosting,firestore,storage --project read-master-library
```

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
