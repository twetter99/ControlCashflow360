import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
} from '@/lib/api-utils';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * POST /api/migrations/bulk-update-recurrence
 * 
 * Actualiza en lote todas las transacciones de una recurrencia específica
 * con los campos proporcionados.
 * 
 * Body:
 * {
 *   recurrenceId: string,
 *   fields: {
 *     paymentMethod?: 'TRANSFER' | 'DIRECT_DEBIT',
 *     chargeAccountId?: string,
 *     supplierBankAccount?: string,
 *     supplierInvoiceNumber?: string
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { recurrenceId, fields } = body;

    if (!recurrenceId) {
      return errorResponse('recurrenceId es requerido', 400, 'MISSING_RECURRENCE_ID');
    }

    if (!fields || Object.keys(fields).length === 0) {
      return errorResponse('fields es requerido y debe contener al menos un campo', 400, 'MISSING_FIELDS');
    }

    const db = getAdminDb();
    
    // Verificar que la recurrencia pertenece al usuario
    const recurrenceDoc = await db.collection('recurrences').doc(recurrenceId).get();
    if (!recurrenceDoc.exists) {
      return errorResponse('Recurrencia no encontrada', 404, 'RECURRENCE_NOT_FOUND');
    }
    if (recurrenceDoc.data()?.userId !== userId) {
      return errorResponse('No tienes permisos para esta recurrencia', 403, 'FORBIDDEN');
    }

    // Obtener todas las transacciones de esta recurrencia
    const transactionsSnap = await db.collection('transactions')
      .where('recurrenceId', '==', recurrenceId)
      .where('userId', '==', userId)
      .get();

    if (transactionsSnap.empty) {
      return successResponse({ 
        message: 'No hay transacciones para actualizar',
        updated: 0 
      });
    }

    // Preparar los campos a actualizar
    const updateFields: { [key: string]: string | null } = {};
    const allowedFields = ['paymentMethod', 'chargeAccountId', 'supplierBankAccount', 'supplierInvoiceNumber'];
    
    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        updateFields[field] = fields[field];
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return errorResponse('No hay campos válidos para actualizar', 400, 'NO_VALID_FIELDS');
    }

    // Agregar timestamp de actualización
    updateFields.updatedAt = Timestamp.now() as unknown as string;

    // Actualizar en batch
    let batch = db.batch();
    let batchCount = 0;
    let updatedCount = 0;
    const MAX_BATCH = 400;

    for (const doc of transactionsSnap.docs) {
      batch.update(doc.ref, updateFields);
      batchCount++;
      updatedCount++;

      if (batchCount >= MAX_BATCH) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    // Commit final
    if (batchCount > 0) {
      await batch.commit();
    }

    // También actualizar la recurrencia padre con estos campos
    await db.collection('recurrences').doc(recurrenceId).update({
      ...updateFields,
      updatedAt: Timestamp.now(),
    });

    return successResponse({
      message: 'Transacciones actualizadas',
      updated: updatedCount,
      recurrenceId,
      fieldsUpdated: Object.keys(updateFields).filter(k => k !== 'updatedAt'),
    });
  });
}
