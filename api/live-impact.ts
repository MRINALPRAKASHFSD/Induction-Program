import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Handle newline characters in private key string securely
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (e) {
    console.error("Firebase Admin Initialization Error:", e);
  }
}

export default async function handler(req: any, res: any) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!admin.apps.length) {
    return res.status(500).json({ 
      error: 'Firebase Admin not initialized. Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set.' 
    });
  }

  try {
    const db = admin.firestore();
    
    // Run all aggregation queries in parallel
    const [students, attendance, clubs] = await Promise.all([
      db.collection('students').count().get(),
      db.collection('attendance').count().get(),
      db.collection('club_registrations').count().get()
    ]);

    // Cache the response on Vercel's CDN for 15 seconds to prevent database quota exhaustion
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

    return res.status(200).json({
      students: students.data().count,
      attendance: attendance.data().count,
      clubs: clubs.data().count
    });
  } catch (error: any) {
    console.error("Failed to fetch live impact counts:", error);
    return res.status(500).json({ error: error.message });
  }
}
