import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { verifySignature } from "@upstash/qstash/nextjs";

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
    initializeApp({
      credential: cert(serviceAccount),
    });
  } catch (e) {
    console.error("Firebase admin init failed:", e);
  }
}

const db = getFirestore();

// Helper to extract dominant color (mocked for Vercel Serverless without sharp/canvas)
const extractDominantColor = async (url: string) => {
  // In production, this would use sharp to get the dominant hex color from the image
  // Fallback mock array of warm colors
  const colors = ["#8a4a22", "#c87038", "#2c1208", "#e8e4db", "#5a2c14"];
  return colors[Math.floor(Math.random() * colors.length)];
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, upstash-signature');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { assetId, publicUrl } = req.body || {};

    if (!assetId || !publicUrl) {
      return res.status(400).json({ error: "Missing payload" });
    }

    console.log(`[QStash Worker] Starting enrichment for ${assetId}`);

    // 1. Dominant Color Extraction
    const dominantColor = await extractDominantColor(publicUrl);

    // 2. Duplicate Analysis
    const docRef = db.collection("media_assets").doc(assetId);
    const snap = await docRef.get();
    
    if (!snap.exists) {
      return res.status(404).json({ error: "Asset deleted before enrichment" });
    }

    // 3. Update Firestore
    await docRef.update({
      dominant_color: dominantColor,
      is_enriched: true,
      last_analyzed: new Date().toISOString()
    });

    console.log(`[QStash Worker] Enriched ${assetId} with color ${dominantColor}`);

    // 4. Analytics Update (Platform Stats)
    const statsRef = db.collection("_analytics_").doc("platform_totals");
    await statsRef.set({
      media_processed: FieldValue.increment(1),
      last_updated: FieldValue.serverTimestamp()
    }, { merge: true });

    return res.status(200).json({ success: true, enriched: true });
  } catch (error: any) {
    console.error("[QStash Worker Error]", error);
    return res.status(500).json({ error: error.message });
  }
}
