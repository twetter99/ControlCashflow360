import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
} from '@/lib/api-utils';
import { Timestamp } from 'firebase-admin/firestore';
import { UserSettings } from '@/types';

const COLLECTION = 'user_settings';

/**
 * GET /api/user-settings - Obtener configuración del usuario
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    
    // Buscar configuración existente
    const snapshot = await db.collection(COLLECTION)
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      // Devolver configuración por defecto
      const defaultSettings: Partial<UserSettings> = {
        userId,
        monthlyIncomeTarget: 0,
        dashboardPreferences: {
          showIncomeLayersChart: true,
          defaultForecastMonths: 6,
        },
      };
      return successResponse(defaultSettings);
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    
    const settings: UserSettings = {
      id: doc.id,
      userId: data.userId,
      monthlyIncomeTarget: data.monthlyIncomeTarget ?? 0,
      dashboardPreferences: data.dashboardPreferences ?? {
        showIncomeLayersChart: true,
        defaultForecastMonths: 6,
      },
      createdAt: data.createdAt?.toDate?.() || undefined,
      updatedAt: data.updatedAt?.toDate?.() || undefined,
    };

    return successResponse(settings);
  });
}

/**
 * PUT /api/user-settings - Actualizar configuración del usuario
 */
export async function PUT(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const db = getAdminDb();
    const now = Timestamp.now();

    // Buscar configuración existente
    const snapshot = await db.collection(COLLECTION)
      .where('userId', '==', userId)
      .limit(1)
      .get();

    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    // Actualizar campos proporcionados
    if (body.monthlyIncomeTarget !== undefined) {
      const target = Number(body.monthlyIncomeTarget);
      if (isNaN(target) || target < 0) {
        return errorResponse('El objetivo mensual debe ser un número positivo', 400);
      }
      updateData.monthlyIncomeTarget = target;
    }

    if (body.dashboardPreferences !== undefined) {
      updateData.dashboardPreferences = body.dashboardPreferences;
    }

    let docId: string;

    if (snapshot.empty) {
      // Crear nueva configuración
      const newSettings = {
        userId,
        monthlyIncomeTarget: updateData.monthlyIncomeTarget ?? 0,
        dashboardPreferences: updateData.dashboardPreferences ?? {
          showIncomeLayersChart: true,
          defaultForecastMonths: 6,
        },
        createdAt: now,
        updatedAt: now,
      };
      
      const docRef = await db.collection(COLLECTION).add(newSettings);
      docId = docRef.id;
    } else {
      // Actualizar existente
      docId = snapshot.docs[0].id;
      await db.collection(COLLECTION).doc(docId).update(updateData);
    }

    // Devolver configuración actualizada
    const updatedDoc = await db.collection(COLLECTION).doc(docId).get();
    const data = updatedDoc.data()!;
    
    const settings: UserSettings = {
      id: docId,
      userId: data.userId,
      monthlyIncomeTarget: data.monthlyIncomeTarget ?? 0,
      dashboardPreferences: data.dashboardPreferences ?? {},
      createdAt: data.createdAt?.toDate?.() || undefined,
      updatedAt: data.updatedAt?.toDate?.() || undefined,
    };

    return successResponse(settings);
  });
}
