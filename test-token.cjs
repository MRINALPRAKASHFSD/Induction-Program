const admin = require('firebase-admin');
const fs = require('fs');
require('dotenv').config();

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

admin.auth().createCustomToken('test-uid').then(token => {
    console.log("Admin SDK generated token:", token);
}).catch(console.error);
