import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBgwZjNZPufUnIGh9Lg1ox6jblytBZBIjA",
  authDomain: "marketvision-stock-processor.firebaseapp.com",
  projectId: "marketvision-stock-processor",
  databaseURL: "https://marketvision-stock-processor-default-rtdb.firebaseio.com",
  storageBucket: "marketvision-stock-processor.firebasestorage.app",
  messagingSenderId: "848318856194",
  appId: "1:848318856194:web:14efaff379392fe6d7bb1b",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const rtdb = getDatabase(app);
