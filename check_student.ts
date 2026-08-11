import { db } from './server/firebase-admin';

async function check() {
  const doc = await db.collection('students').doc('KRMU11111').get();
  if (!doc.exists) {
    console.log('KRMU11111 does not exist');
  } else {
    console.log('KRMU11111:', doc.data());
  }

  const doc2 = await db.collection('rooms').doc('D003').get();
  console.log('D003:', doc2.data());

  const doc3 = await db.collection('rooms').doc('D125').get();
  console.log('D125:', doc3.data());

  process.exit(0);
}

check();
