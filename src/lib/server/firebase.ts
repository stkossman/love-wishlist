import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getServerEnv } from './env';

export function getDatabase() {
  const appName = 'wishlist-server';
  let app = getApps().find((candidate) => candidate.name === appName);
  if (!app) {
    const projectId = getServerEnv('FIREBASE_PROJECT_ID');
    const clientEmail = getServerEnv('FIREBASE_CLIENT_EMAIL');
    const privateKey = getServerEnv('FIREBASE_PRIVATE_KEY');
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
