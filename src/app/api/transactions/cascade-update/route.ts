import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
} from '@/lib/api-utils';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/transactions/cascade-update
 * Actualiza el importe de transacciones similares en cascada
 * 
 * Funciona para transacciones que no tienen recurrenceId pero comparten:
 * - thirdPartyName o thirdPartyId
 * - description
 * - type (INCOME/EXPENSE)
 * - companyId
 * - recurrence != 'NONE'
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { 
      sourceTransactionId,  // ID de la transacción de referencia
      newAmount,            // Nuevo importe
      effectiveFromDate,    // Fecha desde la cual aplicar
      changeReason,         // Motivo del cambio (opcional)
    } = body;

    if (!sourceTransactionId || newAmount === undefined || !effectiveFromDate) {
      return errorResponse('sourceTransactionId, newAmount y effectiveFromDate son requeridos', 400);
    }

    const db = getAdminDb();
    const effectiveDate = new Date(effectiveFromDate);

    // Obtener la transacción fuente
    const sourceDoc = await db.collection('transactions').doc(sourceTransactionId).get();
    
    if (!sourceDoc.exists) {
      return errorResponse('Transacción no encontrada', 404);
    }
    
    const sourceData = sourceDoc.data();
    if (sourceData?.userId !== userId) {
      return errorResponse('No autorizado', 403);
    }

    // Características para identificar transacciones similares
    const matchCriteria = {
      companyId: sourceData.companyId,
      type: sourceData.type,
      thirdPartyName: sourceData.thirdPartyName?.trim().toLowerCase() || '',
      thirdPartyId: sourceData.thirdPartyId || null,
      description: sourceData.description?.trim().toLowerCase() || '',
    };

    console.log('[cascade-update] Criterios de búsqueda:', matchCriteria);
    console.log('[cascade-update] Fecha efectiva:', effectiveDate.toISOString());

    // Buscar transacciones del usuario (query simple para evitar índices)
    const transactionsSnapshot = await db.collection('transactions')
      .where('userId', '==', userId)
      .get();

    console.log('[cascade-update] Total transacciones usuario:', transactionsSnapshot.size);

    const batch = db.batch();
    let updatedCount = 0;
    const updatedIds: string[] = [];
    let debugInfo: string[] = [];

    for (const doc of transactionsSnapshot.docs) {
      const txData = doc.data();
      
      // SIEMPRE incluir la transacción original
      if (doc.id === sourceTransactionId) {
        batch.update(doc.ref, {
          amount: newAmount,
          updatedAt: FieldValue.serverTimestamp(),
          lastUpdatedBy: userId,
          cascadeUpdateReason: changeReason || 'Actualización de importe',
          cascadeUpdateDate: FieldValue.serverTimestamp(),
        });
        updatedCount++;
        updatedIds.push(doc.id);
        debugInfo.push(`${doc.id}: ORIGINAL - actualizando`);
        continue;
      }
      
      // Filtrar en memoria por todas las características
      
      // Mismo companyId
      if (txData.companyId !== matchCriteria.companyId) continue;
      
      // Mismo tipo
      if (txData.type !== matchCriteria.type) continue;
      
      // Solo transacciones PENDING
      if (txData.status !== 'PENDING') {
        debugInfo.push(`${doc.id}: status=${txData.status} (no PENDING)`);
        continue;
      }
      
      // Mismo tercero (por nombre o ID, comparación case-insensitive)
      const txThirdPartyName = (txData.thirdPartyName || '').trim().toLowerCase();
      const sameThirdParty = 
        (txThirdPartyName === matchCriteria.thirdPartyName) ||
        (matchCriteria.thirdPartyId && txData.thirdPartyId === matchCriteria.thirdPartyId);
      if (!sameThirdParty) {
        debugInfo.push(`${doc.id}: tercero diferente "${txThirdPartyName}" vs "${matchCriteria.thirdPartyName}"`);
        continue;
      }
      
      // Misma descripción (case-insensitive)
      const txDescription = (txData.description || '').trim().toLowerCase();
      if (txDescription !== matchCriteria.description) {
        debugInfo.push(`${doc.id}: descripción diferente "${txDescription}" vs "${matchCriteria.description}"`);
        continue;
      }
      
      // Es recurrente
      if (!txData.recurrence || txData.recurrence === 'NONE') {
        debugInfo.push(`${doc.id}: no es recurrente (${txData.recurrence})`);
        continue;
      }
      
      // No fue modificada manualmente
      if (txData.overriddenFromRecurrence) {
        debugInfo.push(`${doc.id}: fue modificada manualmente`);
        continue;
      }
      
      // Fecha >= effectiveFromDate
      const txDueDate = txData.dueDate?.toDate?.() || (txData.dueDate ? new Date(txData.dueDate) : new Date());
      // Comparar solo por fecha (sin hora) para evitar problemas de timezone
      const txDateOnly = new Date(txDueDate.getFullYear(), txDueDate.getMonth(), txDueDate.getDate());
      const effectiveDateOnly = new Date(effectiveDate.getFullYear(), effectiveDate.getMonth(), effectiveDate.getDate());
      
      if (txDateOnly < effectiveDateOnly) {
        debugInfo.push(`${doc.id}: fecha ${txDateOnly.toISOString().slice(0,10)} < ${effectiveDateOnly.toISOString().slice(0,10)}`);
        continue;
      }
      
      debugInfo.push(`${doc.id}: MATCH - actualizando`);
      
      // Actualizar la transacción
      batch.update(doc.ref, {
        amount: newAmount,
        updatedAt: FieldValue.serverTimestamp(),
        lastUpdatedBy: userId,
        // Marcar que fue parte de una actualización en cascada
        cascadeUpdateReason: changeReason || 'Actualización de importe en cascada',
        cascadeUpdateDate: FieldValue.serverTimestamp(),
      });
      updatedCount++;
      updatedIds.push(doc.id);
    }

    console.log('[cascade-update] Debug info:', debugInfo);

    if (updatedCount > 0) {
      await batch.commit();
    }

    console.log(`[cascade-update] Actualizadas ${updatedCount} transacciones:`, updatedIds);

    return successResponse({
      success: true,
      updatedCount,
      updatedIds,
    });
  });
}
