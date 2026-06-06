import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDw2sjsdlKj3FhJMhuj2CF38qj_1almLZg",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "krmu-induction-app-d3591.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "krmu-induction-app-d3591",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "krmu-induction-app-d3591.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "939570467292",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:939570467292:web:9f04d2d01778aa7dfa3f19",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-E8C7MWHNL2"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
