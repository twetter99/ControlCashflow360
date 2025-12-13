import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
} from '@/lib/api-utils';
import { AlertConfig, AlertType } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';

const COLLECTION = 'alert_configs';

/**
 * GET /api/alerts - Obtener todas las configuraciones de alertas del usuario
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    
    const snapshot = await db.collection(COLLECTION).where('userId', '==', userId).get();

    const configs: AlertConfig[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        type: data.type as AlertType,
        threshold: data.threshold || 0,
        companyId: data.companyId || undefined,
        companyName: data.companyName || (data.companyId ? undefined : 'Todas las empresas'),
        enabled: data.enabled ?? true,
        notifyInApp: data.notifyInApp ?? true,
        notifyByEmail: data.notifyByEmail ?? data.notifyEmail ?? false,
        createdAt: data.createdAt?.toDate?.() || new Date(),
        updatedAt: data.updatedAt?.toDate?.() || new Date(),
      } as AlertConfig;
    });

    // Ordenar por tipo
    configs.sort((a, b) => a.type.localeCompare(b.type));

    return successResponse(configs);
  });
}

/**
 * POST /api/alerts - Crear nueva configuración de alerta
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    
    // Validación básica
    if (!body.type || body.threshold === undefined) {
      return errorResponse('Tipo y umbral son requeridos', 400, 'VALIDATION_ERROR');
    }

    const validTypes: AlertType[] = [
      'MIN_LIQUIDITY', 'CRITICAL_RUNWAY', 'CONCENTRATED_MATURITIES',
      'LOW_CREDIT_LINE', 'OVERDUE_COLLECTIONS', 'STALE_DATA', 'CREDIT_NEED'
    ];
    
    if (!validTypes.includes(body.type)) {
      return errorResponse('Tipo de alerta no válido', 400, 'INVALID_TYPE');
    }

    const db = getAdminDb();
    
    // Si se especifica companyId, obtener el nombre de la empresa
    let companyName = 'Todas las empresas';
    if (body.companyId) {
      const companyDoc = await db.collection('companies').doc(body.companyId).get();
      if (!companyDoc.exists || companyDoc.data()?.userId !== userId) {
        return errorResponse('Empresa no válida', 400, 'INVALID_COMPANY');
      }
      companyName = companyDoc.data()?.name || 'Empresa desconocida';
    }
    
    const now = Timestamp.now();
    const configData = {
      userId,
      type: body.type,
      threshold: Number(body.threshold),
      companyId: body.companyId || null,
      companyName,
      enabled: body.enabled ?? true,
      notifyInApp: body.notifyInApp ?? true,
      notifyByEmail: body.notifyByEmail ?? false,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection(COLLECTION).add(configData);

    const newConfig: AlertConfig = {
      id: docRef.id,
      userId,
      type: body.type,
      threshold: Number(body.threshold),
      companyId: body.companyId || undefined,
      companyName,
      enabled: body.enabled ?? true,
      notifyInApp: body.notifyInApp ?? true,
      notifyByEmail: body.notifyByEmail ?? false,
      createdAt: now.toDate(),
      updatedAt: now.toDate(),
    };

    return successResponse(newConfig, 201);
  });
}
