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
- `viewCount`: non-negative integer
- `downloadCount`: non-negative integer
- `trendScore`: legacy numeric seed value used only when migrating or breaking popularity ties
- `createdAt`: server timestamp
- `updatedAt`: server timestamp

Public users should only read books where `status` is `published` or `upcoming` and `licenseChecked` is `true`.

The client preserves `createdAt` and `updatedAt` as full ISO timestamps after reading them. Recently added books sort by `createdAt`, with `releaseDate` used only for legacy records that do not have a creation timestamp.

For published public books, Firestore rules permit a counter-only update that increments exactly one usage total by one. Anonymous visitors may increment views; downloads require Firebase Authentication. No metadata can be changed through that rule. Because increments originate in the browser, the totals are useful best-effort popularity signals but are not tamper-proof. Production analytics should aggregate trusted interaction events in a backend such as Cloud Functions and add App Check or equivalent abuse controls.

## reviews

Each reader can keep one review per book because the review document ID is their Firebase Auth UID.

```text
books/{bookId}/reviews/{uid}
```

Fields:

- `bookId`: parent book ID
- `userId`: review owner's Firebase Auth UID
- `userName`: display name, 1-80 characters
- `rating`: integer from 1 to 5
- `comment`: trimmed text from 3 to 1000 characters
- `createdAt`: server timestamp
- `updatedAt`: server timestamp

Anyone may read reviews only while the parent book is public. An authenticated reader can create, update, and delete only the document whose ID matches their UID. Administrators may remove reviews for moderation.

The parent `books/{bookId}` document must really exist in Firestore and satisfy the public-book rules. A book displayed from the local sample cache alone cannot accept a Firebase review. The nested review rule must be deployed separately from the parent book rule.

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

Saved books belong to one authenticated user. The browser cache uses a separate scope for each reader UID plus a guest scope, so favorites do not leak between accounts on a shared device. Existing unscoped browser favorites are migrated once and are adopted by the next reader who signs in.

## libraryActivity

Reading history and My Library state use one document per user and book.

```text
users/{uid}/libraryActivity/{bookId}
```

Fields:

- `bookId`: book ID
- `userId`: owning Firebase Auth UID
- `firstOpenedAt`: first open timestamp, or `null`
- `lastOpenedAt`: latest open timestamp, or `null`
- `openCount`: non-negative integer
- `lastReadAt`: latest full-read timestamp, or `null`
- `readCount`: non-negative integer
- `lastDownloadedAt`: latest download timestamp, or `null`
- `downloadCount`: non-negative integer
- `updatedAt`: server timestamp

Only the owning authenticated user can read, create, update, clear, or delete these documents. The browser keeps a separate local cache for every reader UID and a separate guest scope. Local activity exposes the timestamp aliases `openedAt`, `readAt`, and `downloadedAt` for display code while Firestore stores the canonical `last...At` fields above.

My Library combines these activity documents with `savedBooks`; it does not duplicate favorite records into a third collection.

## publicProfiles

Public reader identity is stored separately from the private `users/{uid}` account document:

```text
publicProfiles/{uid}
```

Fields: `userId`, `displayName`, `avatarURL`, `bio`, `isPublic`, `showReadingHistory`, `joinedAt`, and `updatedAt`. New profiles are private by default. Readers can opt in to public access and separately opt in to sharing completed-book history. No email, password information, favorites, opened-book log, or download log is copied into this document. Other readers may open the profile only when `isPublic` is true.

### Shared completed-book history

```text
publicProfiles/{uid}/readingHistory/{bookId}
```

Fields: `bookId`, `userId`, `readCount`, `lastReadAt`, and `updatedAt`. Public reads require both `isPublic` and `showReadingHistory`. Only the owner may write these documents. This is a reader-declared activity record rather than verified proof of finishing a book; a production service needing audited completion counts should derive them on a trusted backend.

### Profile comments

```text
publicProfiles/{profileUid}/comments/{authorUid}
```

Fields: `profileId`, `authorId`, `authorName`, `authorPhotoURL`, `comment`, `createdAt`, and `updatedAt`. A signed-in reader can keep one editable comment per public profile. The author, profile owner, or active admin can remove it. Comments on a private profile are not publicly readable or writable.

## notifications

```text
notifications/{notificationId}
```

Fields: `title`, `message`, `kind` (`announcement`, `new-book`, or `maintenance`), optional internal `linkUrl`, `active`, `createdBy`, `createdByName`, `createdAt`, and `updatedAt`. Active notifications are public; only an active administrator can create, change, or delete them.

Per-reader read receipts are private:

```text
users/{uid}/notificationReads/{notificationId}
```

Fields: `notificationId`, `userId`, `version`, and `readAt`. Only the owner may read or write them. Guests use browser-local read status, and signed-in readers keep their own receipt scope.
