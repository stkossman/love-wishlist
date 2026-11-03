import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export function getDatabase() {
  const appName = 'wishlist-server';
  let app = getApps().find((candidate) => candidate.name === appName);
  if (!app) {
    const projectId = process.env.FIREBASE_PROJECT_ID ?? import.meta.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL ?? import.meta.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY ?? import.meta.env.FIREBASE_PRIVATE_KEY;
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Missing server Firebase configuration');
    }
    app = initializeApp(
      {
        credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }),
      },
      appName
    );
  }
  return getFirestore(app);
}
