import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, deleteDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDw2sjsdlKj3FhJMhuj2CF38qj_1almLZg",
  authDomain: "krmu-induction-app-d3591.firebaseapp.com",
  projectId: "krmu-induction-app-d3591",
  storageBucket: "krmu-induction-app-d3591.firebasestorage.app",
  messagingSenderId: "939570467292",
  appId: "1:939570467292:web:9f04d2d01778aa7dfa3f19",
  measurementId: "G-E8C7MWHNL2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function cleanup() {
  const studentsRef = collection(db, "students");
  const snap = await getDocs(studentsRef);
  
  let deletedCount = 0;
  for (const studentDoc of snap.docs) {
    const data = studentDoc.data();
    const enrollment = data.enrollment_no || "";
    if (enrollment === "KRMU2401" || enrollment.startsWith("TEST")) {
      console.log(`Deleting test student: ${enrollment} (${studentDoc.id})`);
      await deleteDoc(doc(db, "students", studentDoc.id));
      deletedCount++;
    }
  }
  console.log(`Cleanup finished. Deleted ${deletedCount} test records.`);
}

cleanup().catch(console.error);
