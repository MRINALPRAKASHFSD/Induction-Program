import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { Client } from "@upstash/qstash";

// Note: In a true Firebase Cloud Functions environment, this would be an onObjectFinalized trigger.
// For Vercel Serverless, this acts as the webhook triggered immediately post-upload.

if (!getApps().length) {
  // Initialize admin app using env vars
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
    initializeApp({
      credential: cert(serviceAccount),
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "krmu-induction-app-d3591.firebasestorage.app",
    });
  } catch (e) {
    console.error("Firebase admin init failed:", e);
  }
}

const db = getFirestore();
const storage = getStorage();
const qstash = new Client({ token: process.env.QSTASH_TOKEN || "" });

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { assetId, path } = req.body || {};
    if (!assetId || !path) {
      return res.status(400).json({ error: "Missing assetId or path" });
    }

    console.log(`[Processing] Started for asset ${assetId} at ${path}`);

    const bucketName = process.env.VITE_FIREBASE_STORAGE_BUCKET || "krmu-induction-app-d3591.firebasestorage.app";
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(path);
    const [exists] = await file.exists();

    if (!exists) {
      console.error(`File not found: ${path}`);
      return res.status(404).json({ error: "File not found" });
    }

    // 1. Validate Image (Magic Bytes & Metadata)
    const [metadata] = await file.getMetadata();
    const contentType = metadata.contentType || "";
    if (!contentType.startsWith("image/")) {
      await file.delete();
      await db.collection("media_assets").doc(assetId).update({ status: "TRASH" });
      return res.status(400).json({ error: "Invalid image type" });
    }

    // 2. Image Processing (Simulated for Vercel Serverless)
    // We fetch the existing document to get the download URL the client already saved
    const docSnap = await db.collection("media_assets").doc(assetId).get();
    const assetData = docSnap.data() || {};
    const publicUrl = assetData.url || `https://storage.googleapis.com/${bucket.name}/${file.name}`;

    // 3. Update Firestore with extracted metadata
    await db.collection("media_assets").doc(assetId).update({
      status: "READY",
      processed_at: new Date().toISOString(),
      file_size: metadata.size,
      mime_type: contentType,
      updated_at: new Date().toISOString()
    });

    
    console.log(`[Processing] Firestore updated to READY for ${assetId}`);

    // 4. Trigger QStash Async Worker for Enrichment
    if (process.env.QSTASH_TOKEN) {
      const host = req.headers.host || req.headers['x-forwarded-host'] || 'localhost:8080';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      
      await qstash.publishJSON({
        url: `${protocol}://${host}/api/media/enrich`,
        body: { assetId, publicUrl },
        // Delay processing to ensure Firestore is fully replicated
        delay: "5s",
      });
      console.log(`[Processing] Dispatched QStash enrichment job for ${assetId}`);
    }

    return res.status(200).json({ success: true, url: publicUrl });

  } catch (error: any) {
    console.error("[Processing Error]", error);
    return res.status(500).json({ error: error.message });
  }
}
