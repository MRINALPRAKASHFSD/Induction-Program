const crypto = require('crypto');

function generateSignedUrl(bucketName, filePath, privateKey, clientEmail, disposition) {
  const expiresUnixSec = Math.floor(Date.now() / 1000) + 15 * 60;
  
  let canonicalizedResource = `/${bucketName}/${filePath}`;
  if (disposition) {
    canonicalizedResource += `?response-content-disposition=${disposition}`;
  }

  const stringToSign = `GET\n\n\n${expiresUnixSec}\n${canonicalizedResource}`;
  
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(stringToSign);
  const signature = sign.sign(privateKey, 'base64');
  
  const queryParams = new URLSearchParams();
  queryParams.append('GoogleAccessId', clientEmail);
  queryParams.append('Expires', expiresUnixSec.toString());
  queryParams.append('Signature', signature);
  if (disposition) {
    queryParams.append('response-content-disposition', disposition);
  }
  
  return `https://storage.googleapis.com/${bucketName}/${filePath}?${queryParams.toString()}`;
}

const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/^'|'$/g, '').replace(/\\n/g, '\n');
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const bucket = process.env.FIREBASE_STORAGE_BUCKET || 'krmu-induction-app-d3591.firebasestorage.app';

const url = generateSignedUrl(bucket, 'documents/test.pdf', privateKey, clientEmail, 'attachment; filename="test.pdf"');
console.log(url);
