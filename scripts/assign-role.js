import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * scripts/assign-role.js
 * 
 * Utility script to assign a role custom claim to a user.
 * Usage:
 *   node scripts/assign-role.js <uid> <role>
 * Example:
 *   node scripts/assign-role.js user123 super_admin
 */

const uid = process.argv[2];
const role = process.argv[3];

if (!uid || !role) {
  console.error('Usage: node scripts/assign-role.js <uid> <role>');
  process.exit(1);
}

const VALID_ROLES = ['super_admin', 'coordinator', 'scanner', 'volunteer', 'user'];

if (!VALID_ROLES.includes(role)) {
  console.error(`Invalid role: ${role}. Valid roles are: ${VALID_ROLES.join(', ')}`);
  process.exit(1);
}

if (!process.env.FIREBASE_PROJECT_ID) {
  console.error('Missing FIREBASE_PROJECT_ID environment variable.');
  process.exit(1);
}

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const auth = getAuth();

async function assignRole() {
  console.log(`Assigning role '${role}' to user '${uid}'...`);
  
  try {
    const user = await auth.getUser(uid);
    const currentClaims = user.customClaims || {};
    
    await auth.setCustomUserClaims(uid, {
      ...currentClaims,
      role: role
    });
    
    console.log(`Successfully assigned role '${role}' to user '${user.email}' (${uid}).`);
  } catch (error) {
    console.error('Error assigning role:', error);
    process.exit(1);
  }
}

assignRole().catch(console.error);
