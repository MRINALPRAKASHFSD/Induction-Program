import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (e) {
    console.error("Firebase Admin Initialization Error:", e);
  }
}

// In-memory fallback cache for transient Firestore failures across warm invocations
let lastKnownStats: any = null;
let lastKnownTime: string = "";

export default async function handler(req: any, res: any) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!getApps().length) {
    return res.status(500).json({ 
      error: 'Firebase Admin not initialized. Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set.',
      serviceStatus: 'failed'
    });
  }

  const isFresh = req.query?.fresh === 'true';

  if (isFresh) {
    // Admin Dashboard: Bypass CDN cache, ensure fresh data
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else {
    // Homepage: Cache on CDN for 15 seconds, serve stale while revalidating
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
  }

  try {
    const db = getFirestore();
    
    // Perform all independent reads in parallel to optimize latency
    const [
      studentsSnap, 
      attendanceSnap, 
      clubsJoinedSnap, 
      eventsSnap, 
      datasetsSnap, 
      activeDatasetsDocs, 
      announcementsSnap, 
      locationsSnap, 
      communitiesSnap
    ] = await Promise.all([
      db.collection('students').count().get(),
      db.collection('attendance_logs').count().get(),
      db.collection('club_registrations').count().get(),
      db.collection('events').where('is_active', '==', true).count().get(),
      db.collection('event_datasets').where('status', 'in', ['ACTIVE', 'READY']).count().get(),
      db.collection('event_datasets').where('status', 'in', ['ACTIVE', 'READY']).get(), // Need docs to find active dataset IDs
      db.collection('announcements').where('status', '==', 'active').count().get(),
      db.collection('departments').count().get(),
      db.collection('clubs').count().get()
    ]);

    let participants = 0;
    const activeDatasetIds = activeDatasetsDocs.docs.map(doc => doc.id);
    
    if (activeDatasetIds.length > 0) {
      for (let i = 0; i < activeDatasetIds.length; i += 10) {
        const batch = activeDatasetIds.slice(i, i + 10);
        const partsCountSnap = await db.collection('event_participants')
          .where('dataset_id', 'in', batch)
          .count()
          .get();
        participants += partsCountSnap.data().count;
      }
    }

    const stats = {
      students: studentsSnap.data().count,
      attendance: attendanceSnap.data().count,
      clubRegistrations: clubsJoinedSnap.data().count,
      liveEvents: eventsSnap.data().count,
      datasets: datasetsSnap.data().count,
      participants: participants,
      announcements: announcementsSnap.data().count,
      campusLocations: locationsSnap.data().count,
      communities: communitiesSnap.data().count
    };

    const generatedAt = new Date().toISOString();
    
    // Update the fallback cache
    lastKnownStats = stats;
    lastKnownTime = generatedAt;

    return res.status(200).json({
      stats,
      generatedAt,
      cacheAge: 0,
      version: "1.0",
      serviceStatus: "healthy",
      stale: false
    });
  } catch (error: any) {
    console.error("Failed to fetch live impact counts:", error);
    
    // Fallback to stale data if available
    if (lastKnownStats) {
      return res.status(200).json({
        stats: lastKnownStats,
        generatedAt: lastKnownTime,
        cacheAge: Math.floor((Date.now() - new Date(lastKnownTime).getTime()) / 1000),
        version: "1.0",
        serviceStatus: "degraded",
        stale: true
      });
    }

    return res.status(500).json({ 
      error: error.message,
      serviceStatus: 'failed'
    });
  }
}
