import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

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

async function createSuperAdmin(email: string, password: string) {
  try {
    let userRecord;
    try {
      // Check if user already exists
      userRecord = await auth.getUserByEmail(email);
      console.log(`User ${email} already exists. Updating password...`);
      userRecord = await auth.updateUser(userRecord.uid, { password });
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        // Create the user
        console.log(`Creating new user ${email}...`);
        userRecord = await auth.createUser({
          email,
          password,
        });
      } else {
        throw e;
      }
    }

    // Set Custom Claims
    await auth.setCustomUserClaims(userRecord.uid, { role: 'super_admin' });
    console.log(`✅ Successfully created/updated ${email} and assigned super_admin role!`);
    console.log(`🔑 You can now log in with the password you provided.`);

  } catch (error) {
    console.error('Error:', error);
  }
}

const emailArg = process.argv[2];
const passwordArg = process.argv[3];

if (!emailArg || !passwordArg) {
  console.log('Usage: npx tsx scratch/create-admin.ts <email> <password>');
  process.exit(1);
}

createSuperAdmin(emailArg, passwordArg);
