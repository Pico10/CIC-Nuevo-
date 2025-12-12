// JavaScript/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC53FSplPAH9DilXPurPbMl_5OHJvVeBbw",
  authDomain: "cic-db.firebaseapp.com",
  databaseURL: "https://cic-db-default-rtdb.firebaseio.com",
  projectId: "cic-db",
  storageBucket: "cic-db.firebasestorage.app",
  messagingSenderId: "200568123888",
  appId: "1:200568123888:web:348b446a1e5a60a5d7ad35",
  measurementId: "G-D17ZTJQX1E"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, db, storage };
