# Database Structure

The app uses Firebase Firestore collections.

## admins

Admin documents use the Firebase Auth user UID as the document ID.

```text
admins/{uid}
```

Fields:

- `active`: boolean
- `email`: string
- `name`: string

Only users with `active = true` should be allowed to manage books.

## books

```text
books/{bookId}
```

Fields:

- `title`: string
- `author`: string
- `category`: string
- `format`: string
- `language`: string
- `releaseDate`: string in `YYYY-MM-DD` format
- `licenseType`: string
- `licenseChecked`: boolean
- `sourceName`: string
- `resourceUrl`: string
- `coverUrl`: string
- `status`: `published`, `upcoming`, or `draft`
- `description`: string
- `createdAt`: server timestamp
- `updatedAt`: server timestamp

Public users should only read books where `status` is `published` or `upcoming` and `licenseChecked` is `true`.

## users

```text
users/{uid}
```

Fields:

- `name`: string
- `email`: string
- `role`: `user`
- `createdAt`: server timestamp
- `updatedAt`: server timestamp

Users can read and update only their own profile document.

## savedBooks

```text
users/{uid}/savedBooks/{bookId}
```

Fields:

- `bookId`: string
- `savedAt`: server timestamp

Saved books belong to one authenticated user.
