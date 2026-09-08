export const firebaseConfig = {
  apiKey: "AIzaSyAy4Fjq8ItkqcFmGFcbUZjyPQkeMdt0L0U",
  authDomain: "read-master-library.firebaseapp.com",
  projectId: "read-master-library",
  storageBucket: "read-master-library.firebasestorage.app",
  messagingSenderId: "214384409424",
  appId: "1:214384409424:web:d3bd893af1d411b81b8a55",
  measurementId: "G-3XBPRLF3WZ"
};

export const firebaseCollections = {
  admins: "admins",
  books: "books",
  users: "users"
};

export function hasFirebaseConfig() {
  return Object.values(firebaseConfig).every((value) => {
    return typeof value === "string" && value.trim() && !value.startsWith("YOUR_");
  });
}
