import { applicationDefault, initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

if (!getApps().length) {
  initializeApp({
    // Cloud Run resolves the attached runtime service identity through ADC.
    // No downloaded service-account key or private key environment variable is used.
    credential: applicationDefault(),
    projectId: firebaseConfig.projectId,
  });
}

export const adminAuth = getAuth();
