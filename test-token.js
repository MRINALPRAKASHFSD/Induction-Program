const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const clientEmailMatch = env.match(/FIREBASE_CLIENT_EMAIL="(.*)"/);
const privateKeyMatch = env.match(/FIREBASE_PRIVATE_KEY="(.*)"/);

const clientEmail = clientEmailMatch[1];
const privateKey = privateKeyMatch[1].replace(/\\n/g, '\n');

const now = Math.floor(Date.now() / 1000);
const customToken = jwt.sign(
  {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 3600,
    uid: "test-uid",
  },
  privateKey,
  { algorithm: 'RS256', noTimestamp: true }
);
console.log(customToken);
