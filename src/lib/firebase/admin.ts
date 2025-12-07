import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

let adminApp: App | null = null;
let adminDb: Firestore | null = null;
let adminAuth: Auth | null = null;

// Indicador del estado de inicialización
let initializationError: Error | null = null;
let initializationMethod: string = 'none';

/**
 * Lee el archivo de credenciales de servicio (solo en desarrollo local)
 * En producción (Vercel), se debe usar la variable de entorno FIREBASE_SERVICE_ACCOUNT_KEY
 */
function loadServiceAccountFile(): Record<string, unknown> | null {
  // En producción, NO intentar leer archivos - usar variables de entorno
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    console.log('[Firebase Admin] Entorno de producción detectado - saltando lectura de archivos locales');
    return null;
  }

  // Solo en desarrollo: intentar cargar el archivo
  try {
    // Importar fs y path dinámicamente solo en desarrollo
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    
    const possiblePaths = [
      path.join(process.cwd(), 'serviceAccountKey.json'),
      path.join(process.cwd(), '..', 'serviceAccountKey.json'),
    ];

    for (const filePath of possiblePaths) {
      try {
        if (fs.existsSync(filePath)) {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          console.log(`[Firebase Admin] Archivo encontrado en ${filePath}`);
          return JSON.parse(fileContent);
        }
      } catch (error) {
        console.log(`[Firebase Admin] Error leyendo ${filePath}:`, error);
      }
    }
  } catch (error) {
    console.log('[Firebase Admin] No se puede acceder al sistema de archivos:', error);
  }

  return null;
}

/**
 * Inicializa Firebase Admin SDK para uso en el servidor
 * 
 * IMPORTANTE PARA PRODUCCIÓN (Vercel):
 * Debes configurar la variable de entorno FIREBASE_SERVICE_ACCOUNT_KEY
 * con el contenido JSON completo de tu serviceAccountKey.json
 * 
 * Opciones de configuración (en orden de prioridad):
 * 1. Variable de entorno FIREBASE_SERVICE_ACCOUNT_KEY (JSON string) - REQUERIDO EN PRODUCCIÓN
 * 2. Archivo local serviceAccountKey.json (solo desarrollo)
 */
function initializeAdmin(): App {
  // Si ya hay una app inicializada, retornarla
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  console.log('[Firebase Admin] ========================================');
  console.log('[Firebase Admin] Iniciando configuración...');
  console.log(`[Firebase Admin] Entorno: ${isProduction ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
  console.log(`[Firebase Admin] Project ID: ${projectId || 'NO CONFIGURADO'}`);

  // Opción 1: Usar credenciales desde variable de entorno (JSON string)
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  
  if (serviceAccountJson) {
    try {
      // Verificar que el JSON tenga contenido válido
      if (serviceAccountJson.length < 100) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY parece estar truncado o incompleto');
      }
      
      const serviceAccount = JSON.parse(serviceAccountJson);
      
      // Validar campos requeridos
      if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY no tiene los campos requeridos (project_id, private_key, client_email)');
      }
      
      console.log(`[Firebase Admin] ✅ Inicializando con variable de entorno`);
      console.log(`[Firebase Admin] Service Account Project: ${serviceAccount.project_id}`);
      console.log(`[Firebase Admin] Client Email: ${serviceAccount.client_email}`);
      
      initializationMethod = 'environment_variable';
      
      return initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      console.error('[Firebase Admin] ❌ Error parseando FIREBASE_SERVICE_ACCOUNT_KEY:', errorMessage);
      initializationError = error instanceof Error ? error : new Error(errorMessage);
      
      if (isProduction) {
        // En producción, esto es un error crítico
        throw new Error(
          `Firebase Admin no pudo inicializarse en producción. ` +
          `Error: ${errorMessage}. ` +
          `Verifica que FIREBASE_SERVICE_ACCOUNT_KEY esté correctamente configurada en Vercel.`
        );
      }
    }
  } else if (isProduction) {
    console.error('[Firebase Admin] ❌ FIREBASE_SERVICE_ACCOUNT_KEY no está configurada');
    console.error('[Firebase Admin] En producción, esta variable es OBLIGATORIA');
    console.error('[Firebase Admin] Configúrala en Vercel con el contenido de serviceAccountKey.json');
    
    throw new Error(
      'Firebase Admin requiere FIREBASE_SERVICE_ACCOUNT_KEY en producción. ' +
      'Configura esta variable en Vercel con el JSON completo de tu Service Account.'
    );
  }

  // Opción 2: Usar archivo local serviceAccountKey.json (SOLO desarrollo)
  const serviceAccountFromFile = loadServiceAccountFile();
  if (serviceAccountFromFile) {
    console.log('[Firebase Admin] ✅ Inicializando con archivo serviceAccountKey.json');
    console.log(`[Firebase Admin] Service Account Project: ${serviceAccountFromFile.project_id}`);
    
    initializationMethod = 'local_file';
    
    return initializeApp({
      credential: cert(serviceAccountFromFile as Parameters<typeof cert>[0]),
      projectId: serviceAccountFromFile.project_id as string,
    });
  }

  // Si llegamos aquí en desarrollo sin credenciales, lanzar error
  console.error('[Firebase Admin] ❌ No se encontraron credenciales de servicio');
  throw new Error(
    'Firebase Admin no tiene credenciales configuradas. ' +
    'En desarrollo: coloca serviceAccountKey.json en la raíz del proyecto. ' +
    'En producción: configura FIREBASE_SERVICE_ACCOUNT_KEY en las variables de entorno.'
  );
}

/**
 * Obtiene la instancia de Firestore Admin
 * @throws Error si Firebase Admin no está configurado correctamente
 */
export function getAdminDb(): Firestore {
  if (!adminDb) {
    try {
      adminApp = initializeAdmin();
      adminDb = getFirestore(adminApp);
      console.log('[Firebase Admin] ✅ Firestore Admin inicializado correctamente');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      console.error('[Firebase Admin] ❌ Error inicializando Firestore Admin:', errorMessage);
      throw error;
    }
  }
  return adminDb;
}

/**
 * Obtiene la instancia de Auth Admin
 * @throws Error si Firebase Admin no está configurado correctamente
 */
export function getAdminAuth(): Auth {
  if (!adminAuth) {
    try {
      adminApp = initializeAdmin();
      adminAuth = getAuth(adminApp);
      console.log('[Firebase Admin] ✅ Auth Admin inicializado correctamente');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      console.error('[Firebase Admin] ❌ Error inicializando Auth Admin:', errorMessage);
      throw error;
    }
  }
  return adminAuth;
}

/**
 * Verifica un token de Firebase y retorna el usuario
 */
export async function verifyIdToken(token: string) {
  try {
    const auth = getAdminAuth();
    const decodedToken = await auth.verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Firebase Admin] ❌ Error verificando token:', errorMessage);
    
    // Dar más contexto sobre errores comunes
    if (errorMessage.includes('INVALID_CREDENTIAL') || errorMessage.includes('invalid-credential')) {
      console.error('[Firebase Admin] Las credenciales del Service Account parecen inválidas');
    }
    if (errorMessage.includes('project_id')) {
      console.error('[Firebase Admin] Posible mismatch de project_id entre Auth y Admin SDK');
    }
    
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
