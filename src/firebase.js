import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, setLogLevel } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "dummy",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "dummy",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "dummy",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "dummy",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "dummy",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "dummy"
};

console.log("Initializing Firebase with Project:", firebaseConfig.projectId);

// Enable Firestore logging to help diagnose the 1-minute delay
setLogLevel('debug');

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use robust connection settings for restrictive networks
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false, // Prevents hangs in some browser/proxy setups
});

console.log("Firestore initialized with Long Polling and No Streams.");
