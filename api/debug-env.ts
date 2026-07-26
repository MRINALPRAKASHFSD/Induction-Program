export default function handler(req: any, res: any) {
  res.status(200).json({
    firebase_project_id: process.env.FIREBASE_PROJECT_ID,
    vite_firebase_project_id: process.env.VITE_FIREBASE_PROJECT_ID,
  });
}
