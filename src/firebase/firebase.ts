// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAlYht0hGapEDOm4udhxugZNeAxudlHrjM",
  authDomain: "pte123-b795a.firebaseapp.com",
  projectId: "pte123-b795a",
  storageBucket: "pte123-b795a.firebasestorage.app",
  messagingSenderId: "478231416594",
  appId: "1:478231416594:web:696068a59a59099b286dcb",
  measurementId: "G-LRNY00N0S2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };