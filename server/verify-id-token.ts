import jwt from 'jsonwebtoken';

const FIREBASE_PUBLIC_KEYS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedKeys: Record<string, string> | null = null;
let cacheExpiresAt = 0;

async function getFirebasePublicKeys(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedKeys && now < cacheExpiresAt) {
    return cachedKeys;
  }

  const keysRes = await fetch(FIREBASE_PUBLIC_KEYS_URL);
  if (!keysRes.ok) {
    throw new Error('Failed to fetch Firebase public keys');
  }

  cachedKeys = (await keysRes.json()) as Record<string, string>;
  cacheExpiresAt = now + 60 * 60 * 1000;
  return cachedKeys;
}

export type VerifiedFirebaseToken = jwt.JwtPayload & {
  uid: string;
  role?: string;
};

/**
 * Verifies a Firebase ID token using Google's public signing keys.
 * Equivalent to admin.auth().verifyIdToken() — used because firebase-admin/auth
 * has known issues on Vercel's Node runtime (native binding crashes).
 */
export async function verifyFirebaseIdToken(token: string): Promise<VerifiedFirebaseToken> {
  const keys = await getFirebasePublicKeys();
  const decodedHeader = jwt.decode(token, { complete: true }) as
    | { header?: { kid?: string } }
    | null;
  const kid = decodedHeader?.header?.kid;

  if (!kid || !keys[kid]) {
    throw new Error('Invalid token signature');
  }

  const decodedToken = jwt.verify(token, keys[kid], { algorithms: ['RS256'] }) as jwt.JwtPayload;
  const uid = (decodedToken.user_id || decodedToken.sub || decodedToken.uid) as string | undefined;

  if (!uid) {
    throw new Error('Invalid token: missing uid');
  }

  return {
    ...decodedToken,
    uid,
    role: decodedToken.role as string | undefined,
  };
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice('Bearer '.length).trim() || null;
}
