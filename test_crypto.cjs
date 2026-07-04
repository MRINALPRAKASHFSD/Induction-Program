require('dotenv').config();
const crypto = require('crypto');

try {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update("test");
  const signature = sign.sign(privateKey, 'base64');
  console.log("Success! Signature length:", signature.length);
} catch (e) {
  console.error("Crypto Error:", e.message);
}
