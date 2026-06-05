import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBNgxxP7pT8HkB0T9tBqttPDfK9x6qmCYU",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "krmu-induction-d4786.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "krmu-induction-d4786",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "krmu-induction-d4786.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1028446405662",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1028446405662:web:28477df5e0855fba499a0f",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-MF64BDDG94"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
