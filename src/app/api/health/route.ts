import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin';

/**
 * GET /api/health
 * Endpoint de health check para verificar el estado del servidor
 * 
 * - Sin autenticación: devuelve solo status básico
 * - Con autenticación: devuelve detalles completos
 */
export async function GET(request: NextRequest) {
  const isDetailed = request.headers.get('Authorization')?.startsWith('Bearer ');
  
  // Respuesta básica (sin autenticación) - mínima información
  if (!isDetailed) {
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  }

  // Respuesta detallada (con autenticación)
  const checks = {
    server: true,
    firebaseAdmin: false,
    firestore: false,
    auth: false,
  };

  try {
    // Verificar Firebase Admin SDK
    const db = getAdminDb();
    checks.firebaseAdmin = !!db;

    // Verificar conexión a Firestore
    await db.collection('_healthcheck').doc('test').get();
    checks.firestore = true;
    
    // Verificar Auth Admin
    const auth = getAdminAuth();
    checks.auth = !!auth;

    return NextResponse.json({
      status: 'healthy',
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // En producción, no exponer detalles del error
    const isDev = process.env.NODE_ENV === 'development';
    
    return NextResponse.json({
      status: 'unhealthy',
      checks,
      timestamp: new Date().toISOString(),
      ...(isDev && { error: error instanceof Error ? error.message : 'Unknown error' }),
    }, { status: 503 });
  }
}
