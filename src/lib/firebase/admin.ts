import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import * as fs from 'fs';
import * as path from 'path';

let adminApp: App | null = null;
let adminDb: Firestore | null = null;
let adminAuth: Auth | null = null;

/**
 * Lee el archivo de credenciales de servicio
 */
function loadServiceAccountFile(): Record<string, unknown> | null {
  // Intentar múltiples rutas posibles
  const possiblePaths = [
    path.join(process.cwd(), 'serviceAccountKey.json'),
    path.join(process.cwd(), '..', 'serviceAccountKey.json'),
    path.resolve(__dirname, '../../../../serviceAccountKey.json'),
    path.resolve(__dirname, '../../../serviceAccountKey.json'),
  ];

  for (const filePath of possiblePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        console.log(`Firebase Admin: Archivo encontrado en ${filePath}`);
        return JSON.parse(fileContent);
      }
    } catch (error) {
      console.log(`Firebase Admin: Error leyendo ${filePath}:`, error);
    }
  }

  console.log('Firebase Admin: No se encontró serviceAccountKey.json en las rutas:', possiblePaths);
  return null;
}

/**
 * Inicializa Firebase Admin SDK para uso en el servidor
 * Opciones de configuración (en orden de prioridad):
 * 1. Variable de entorno FIREBASE_SERVICE_ACCOUNT_KEY (JSON string)
 * 2. Archivo local en la raíz del proyecto: serviceAccountKey.json
 * 3. Application Default Credentials (para GCP)
 */
function initializeAdmin(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  // Opción 1: Usar credenciales desde variable de entorno (JSON string)
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  
  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      console.log('Firebase Admin: Inicializando con variable de entorno');
      return initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    } catch (error) {
      console.error('Error parsing FIREBASE_SERVICE_ACCOUNT_KEY:', error);
    }
  }

  // Opción 2: Usar archivo local serviceAccountKey.json
  const serviceAccountFromFile = loadServiceAccountFile();
  if (serviceAccountFromFile) {
    console.log('Firebase Admin: Inicializando con archivo serviceAccountKey.json');
    return initializeApp({
      credential: cert(serviceAccountFromFile as Parameters<typeof cert>[0]),
      projectId: serviceAccountFromFile.project_id as string,
    });
  }

  // Opción 3: Usar Application Default Credentials (para desarrollo local o GCP)
  console.log('Firebase Admin: Usando Application Default Credentials');
  return initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

/**
 * Obtiene la instancia de Firestore Admin
 */
export function getAdminDb(): Firestore {
  if (!adminDb) {
    adminApp = initializeAdmin();
    adminDb = getFirestore(adminApp);
  }
  return adminDb;
}

/**
 * Obtiene la instancia de Auth Admin
 */
export function getAdminAuth(): Auth {
  if (!adminAuth) {
    adminApp = initializeAdmin();
    adminAuth = getAuth(adminApp);
  }
  return adminAuth;
}

/**
 * Verifica un token de Firebase y retorna el usuario
 */
export async function verifyIdToken(token: string) {
  const auth = getAdminAuth();
  try {
    const decodedToken = await auth.verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying token:', error);
    return null;
  }
}

/**
 * Extrae el token del header Authorization
 */
export function extractToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}
