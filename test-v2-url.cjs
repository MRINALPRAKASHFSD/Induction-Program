const crypto = require('crypto');

function generateV2SignedUrl(bucket, filePath, method, expiresUnixSec, clientEmail, privateKey, contentType) {
  const canonicalizedResource = `/${bucket}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
  const stringToSign = `${method}\n\n${contentType}\n${expiresUnixSec}\n${canonicalizedResource}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(stringToSign);
  const signature = sign.sign(privateKey, 'base64');
  const queryParams = new URLSearchParams({
    GoogleAccessId: clientEmail,
    Expires: expiresUnixSec.toString(),
    Signature: signature,
  });
  return `https://storage.googleapis.com${canonicalizedResource}?${queryParams.toString()}`;
}

console.log("Testing V2 signature generator...");
