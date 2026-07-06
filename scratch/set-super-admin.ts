import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

// Initialize Firebase Admin (use your existing admin config pattern)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const auth = getAuth();

async function setSuperAdmin(email: string) {
  try {
    const user = await auth.getUserByEmail(email);
    await auth.setCustomUserClaims(user.uid, { role: 'super_admin' });
    console.log(`Successfully assigned super_admin role to ${email}`);
    console.log('IMPORTANT: The user must log out and log back in for the new role to take effect.');
  } catch (error) {
    console.error('Error assigning role:', error);
  }
}

// Pass email as a command-line argument
const emailArg = process.argv[2];
if (!emailArg) {
  console.log('Usage: npx tsx scratch/set-super-admin.ts <your-email>');
  process.exit(1);
}

setSuperAdmin(emailArg);
