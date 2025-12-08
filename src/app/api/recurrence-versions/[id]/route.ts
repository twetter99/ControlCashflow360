import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
} from '@/lib/api-utils';
import { RecurrenceVersion } from '@/types';

const COLLECTION = 'recurrence_versions';

/**
 * Mapea datos de Firestore a RecurrenceVersion
 */
function mapToRecurrenceVersion(id: string, data: FirebaseFirestore.DocumentData): RecurrenceVersion {
  return {
    id,
    userId: data.userId,
    recurrenceId: data.recurrenceId,
    amount: data.amount || 0,
    effectiveFrom: data.effectiveFrom?.toDate?.() || new Date(),
    effectiveTo: data.effectiveTo?.toDate?.() || null,
    changeReason: data.changeReason || undefined,
    versionNumber: data.versionNumber || 1,
    isActive: data.isActive ?? true,
    createdBy: data.createdBy || '',
    createdAt: data.createdAt?.toDate?.() || new Date(),
  };
}

/**
 * GET /api/recurrence-versions/[id] - Obtener una versión específica
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const db = getAdminDb();
    
    const doc = await db.collection(COLLECTION).doc(id).get();
    
    if (!doc.exists) {
      return errorResponse('Versión no encontrada', 404);
    }
    
    const data = doc.data();
    if (data?.userId !== userId) {
      return errorResponse('No autorizado', 403);
    }

    return successResponse(mapToRecurrenceVersion(doc.id, data));
  });
}

/**
 * DELETE /api/recurrence-versions/[id] - Eliminar una versión
 * Solo se puede eliminar la versión más reciente
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const db = getAdminDb();
    
    const doc = await db.collection(COLLECTION).doc(id).get();
    
    if (!doc.exists) {
      return errorResponse('Versión no encontrada', 404);
    }
    
    const data = doc.data();
    if (data?.userId !== userId) {
      return errorResponse('No autorizado', 403);
    }

    // Verificar que es la versión más reciente (activa)
    if (!data.isActive) {
      return errorResponse('Solo se puede eliminar la versión más reciente (activa)', 400);
    }

    const recurrenceId = data.recurrenceId;

    // Obtener la versión anterior para reactivarla (buscar por recurrenceId y filtrar en memoria)
    const allVersionsSnapshot = await db.collection(COLLECTION)
      .where('recurrenceId', '==', recurrenceId)
      .get();

    const previousVersion = allVersionsSnapshot.docs
      .filter(d => d.data().userId === userId && d.data().versionNumber === data.versionNumber - 1)[0];

    const batch = db.batch();

    // Eliminar la versión actual
    batch.delete(doc.ref);

    if (previousVersion) {
      // Reactivar la versión anterior
      batch.update(previousVersion.ref, {
        isActive: true,
        effectiveTo: null,
      });

      // Actualizar la recurrencia para que use la versión anterior
      const recurrenceRef = db.collection('recurrences').doc(recurrenceId);
      batch.update(recurrenceRef, {
        currentVersionId: previousVersion.id,
        baseAmount: previousVersion.data().amount,
      });
    }

    await batch.commit();

    return successResponse({ success: true });
  });
}
