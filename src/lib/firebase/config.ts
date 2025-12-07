import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// Configuración de Firebase usando variables de entorno
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Verificar si estamos en entorno de build sin Firebase configurado
const isFirebaseConfigured = 
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== 'your-api-key-here' &&
  firebaseConfig.projectId;

// Logging de configuración (solo en cliente y desarrollo)
if (typeof window !== 'undefined') {
  const isProduction = process.env.NODE_ENV === 'production';
  console.log('[Firebase Client] ========================================');
  console.log('[Firebase Client] Entorno:', isProduction ? 'PRODUCCIÓN' : 'DESARROLLO');
  console.log('[Firebase Client] Project ID:', firebaseConfig.projectId || 'NO CONFIGURADO');
  console.log('[Firebase Client] Auth Domain:', firebaseConfig.authDomain || 'NO CONFIGURADO');
  console.log('[Firebase Client] Configurado:', isFirebaseConfigured ? '✅ SÍ' : '❌ NO');
  console.log('[Firebase Client] ========================================');
}

// Inicializar Firebase solo si está configurado y no está ya inicializado
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app);
  
  if (typeof window !== 'undefined') {
    console.log('[Firebase Client] ✅ Firebase inicializado correctamente');
  }
} else if (typeof window !== 'undefined') {
  console.error('[Firebase Client] ❌ Firebase NO está configurado');
  console.error('[Firebase Client] Verifica las variables de entorno NEXT_PUBLIC_FIREBASE_*');
}

/**
 * Helper function to get Firestore instance
 * Throws error if not configured
 */
export function getDb(): Firestore {
  if (!db) {
    throw new Error('Firebase Firestore no está configurado. Por favor configura las variables de entorno.');
  }
  return db;
}

/**
 * Helper function to check if Firebase is configured
 */
export function isConfigured(): boolean {
  return !!db;
}

// Exportar instancias de servicios (pueden ser null si Firebase no está configurado)
export { auth, db };
export default app;
