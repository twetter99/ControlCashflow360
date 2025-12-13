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

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/alerts/[id] - Obtener una configuración de alerta por ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const db = getAdminDb();
    
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return errorResponse('Configuración de alerta no encontrada', 404, 'NOT_FOUND');
    }

    const data = doc.data()!;
    
    // Verificar que pertenece al usuario
    if (data.userId !== userId) {
      return errorResponse('No autorizado', 403, 'FORBIDDEN');
    }

    const config: AlertConfig = {
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
    };

    return successResponse(config);
  });
}

/**
 * PUT /api/alerts/[id] - Actualizar configuración de alerta
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const body = await request.json();
    
    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return errorResponse('Configuración de alerta no encontrada', 404, 'NOT_FOUND');
    }

    const existingData = doc.data()!;
    
    // Verificar que pertenece al usuario
    if (existingData.userId !== userId) {
      return errorResponse('No autorizado', 403, 'FORBIDDEN');
    }

    // Validar tipo si se proporciona
    if (body.type) {
      const validTypes: AlertType[] = [
        'MIN_LIQUIDITY', 'CRITICAL_RUNWAY', 'CONCENTRATED_MATURITIES',
        'LOW_CREDIT_LINE', 'OVERDUE_COLLECTIONS', 'STALE_DATA', 'CREDIT_NEED'
      ];
      
      if (!validTypes.includes(body.type)) {
        return errorResponse('Tipo de alerta no válido', 400, 'INVALID_TYPE');
      }
    }

    // Si se especifica companyId, obtener el nombre de la empresa
    let companyName = existingData.companyName;
    if (body.companyId !== undefined) {
      if (body.companyId) {
        const companyDoc = await db.collection('companies').doc(body.companyId).get();
        if (!companyDoc.exists || companyDoc.data()?.userId !== userId) {
          return errorResponse('Empresa no válida', 400, 'INVALID_COMPANY');
        }
        companyName = companyDoc.data()?.name || 'Empresa desconocida';
      } else {
        companyName = 'Todas las empresas';
      }
    }

    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    if (body.type !== undefined) updateData.type = body.type;
    if (body.threshold !== undefined) updateData.threshold = Number(body.threshold);
    if (body.companyId !== undefined) {
      updateData.companyId = body.companyId || null;
      updateData.companyName = companyName;
    }
    if (body.enabled !== undefined) updateData.enabled = body.enabled;
    if (body.notifyInApp !== undefined) updateData.notifyInApp = body.notifyInApp;
    if (body.notifyByEmail !== undefined) updateData.notifyByEmail = body.notifyByEmail;

    await docRef.update(updateData);

    // Obtener documento actualizado
    const updatedDoc = await docRef.get();
    const updatedData = updatedDoc.data()!;

    const config: AlertConfig = {
      id: updatedDoc.id,
      userId: updatedData.userId,
      type: updatedData.type as AlertType,
      threshold: updatedData.threshold || 0,
      companyId: updatedData.companyId || undefined,
      companyName: updatedData.companyName || (updatedData.companyId ? undefined : 'Todas las empresas'),
      enabled: updatedData.enabled ?? true,
      notifyInApp: updatedData.notifyInApp ?? true,
      notifyByEmail: updatedData.notifyByEmail ?? false,
      createdAt: updatedData.createdAt?.toDate?.() || new Date(),
      updatedAt: updatedData.updatedAt?.toDate?.() || new Date(),
    };

    return successResponse(config);
  });
}

/**
 * DELETE /api/alerts/[id] - Eliminar configuración de alerta
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return errorResponse('Configuración de alerta no encontrada', 404, 'NOT_FOUND');
    }

    const data = doc.data()!;
    
    // Verificar que pertenece al usuario
    if (data.userId !== userId) {
      return errorResponse('No autorizado', 403, 'FORBIDDEN');
    }

    await docRef.delete();

    return successResponse({ deleted: true, id });
  });
}

/**
 * PATCH /api/alerts/[id] - Toggle enabled/disabled
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return errorResponse('Configuración de alerta no encontrada', 404, 'NOT_FOUND');
    }

    const data = doc.data()!;
    
    // Verificar que pertenece al usuario
    if (data.userId !== userId) {
      return errorResponse('No autorizado', 403, 'FORBIDDEN');
    }

    // Toggle enabled
    const newEnabled = !data.enabled;
    await docRef.update({
      enabled: newEnabled,
      updatedAt: Timestamp.now(),
    });

    // Obtener documento actualizado
    const updatedDoc = await docRef.get();
    const updatedData = updatedDoc.data()!;

    const config: AlertConfig = {
      id: updatedDoc.id,
      userId: updatedData.userId,
      type: updatedData.type as AlertType,
      threshold: updatedData.threshold || 0,
      companyId: updatedData.companyId || undefined,
      companyName: updatedData.companyName || (updatedData.companyId ? undefined : 'Todas las empresas'),
      enabled: updatedData.enabled ?? true,
      notifyInApp: updatedData.notifyInApp ?? true,
      notifyByEmail: updatedData.notifyByEmail ?? false,
      createdAt: updatedData.createdAt?.toDate?.() || new Date(),
      updatedAt: updatedData.updatedAt?.toDate?.() || new Date(),
    };

    return successResponse(config);
  });
}
