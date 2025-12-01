import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  withErrorHandling,
} from '@/lib/api-utils';
import { Timestamp } from 'firebase-admin/firestore';
import { generateTransactionsFromRecurrence } from '@/lib/recurrence-generator';
import { Recurrence } from '@/types';

/**
 * POST /api/recurrences/fix-dates
 * 
 * Limpia transacciones generadas con fechas incorrectas y regenera con las fechas correctas
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    const now = Timestamp.now();
    
    const results = {
      recurrencesProcessed: 0,
      transactionsDeleted: 0,
      transactionsGenerated: 0,
      details: [] as { recurrenceId: string; name: string; deleted: number; generated: number; dates: string[] }[],
    };

    // 1. Obtener todas las recurrencias activas del usuario
    const recurrencesSnapshot = await db.collection('recurrences')
      .where('userId', '==', userId)
      .where('status', '==', 'ACTIVE')
      .get();

    console.log(`[FixDates] Encontradas ${recurrencesSnapshot.size} recurrencias activas`);

    for (const recDoc of recurrencesSnapshot.docs) {
      const recData = recDoc.data();
      const recurrenceId = recDoc.id;
      
      // 2. Eliminar todas las transacciones generadas automáticamente para esta recurrencia
      // (excepto la transacción original que tiene isRecurrenceInstance = true pero es la primera)
      const txSnapshot = await db.collection('transactions')
        .where('recurrenceId', '==', recurrenceId)
        .where('userId', '==', userId)
        .where('isRecurrenceInstance', '==', true)
        .get();

      // Identificar la transacción original (la que tiene la fecha startDate de la recurrencia)
      const startDate = recData.startDate?.toDate?.() || new Date(recData.startDate);
      const startDateKey = startDate.toISOString().split('T')[0];
      
      let deletedCount = 0;
      const batch = db.batch();
      
      for (const txDoc of txSnapshot.docs) {
        const txData = txDoc.data();
        const txDate = txData.dueDate?.toDate?.() || new Date(txData.dueDate);
        const txDateKey = txDate.toISOString().split('T')[0];
        
        // Mantener la transacción original, eliminar las generadas
        // La original tiene la misma fecha que startDate O fue creada manualmente primero
        if (txDateKey !== startDateKey) {
          batch.delete(txDoc.ref);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        await batch.commit();
      }
      results.transactionsDeleted += deletedCount;

      // 3. Resetear lastGeneratedDate de la recurrencia para regenerar
      await db.collection('recurrences').doc(recurrenceId).update({
        lastGeneratedDate: null,
        nextOccurrenceDate: null,
        updatedAt: now,
      });

      // 4. Regenerar transacciones con las fechas corregidas
      const recurrence: Recurrence = {
        id: recurrenceId,
        userId,
        companyId: recData.companyId,
        accountId: recData.accountId,
        type: recData.type,
        name: recData.name,
        baseAmount: recData.baseAmount,
        category: recData.category,
        thirdPartyId: recData.thirdPartyId,
        thirdPartyName: recData.thirdPartyName,
        certainty: recData.certainty,
        notes: recData.notes,
        frequency: recData.frequency,
        dayOfMonth: recData.dayOfMonth,
        dayOfWeek: recData.dayOfWeek,
        startDate: startDate, // Usar la fecha original
        endDate: recData.endDate?.toDate?.() || null,
        generateMonthsAhead: recData.generateMonthsAhead || 6,
        lastGeneratedDate: startDate, // Ya existe la transacción original
        status: recData.status,
        createdBy: recData.createdBy,
      };

      const genResult = await generateTransactionsFromRecurrence(recurrence, userId, {
        fromDate: new Date(),
        monthsAhead: 6,
        skipExisting: true, // No duplicar la original
      });

      results.transactionsGenerated += genResult.generatedCount;
      results.recurrencesProcessed++;

      // Obtener las fechas generadas para el debug (sin orderBy para evitar índice compuesto)
      const newTxSnapshot = await db.collection('transactions')
        .where('recurrenceId', '==', recurrenceId)
        .get();

      const generatedDates = newTxSnapshot.docs
        .map(doc => {
          const date = doc.data().dueDate?.toDate?.() || new Date(doc.data().dueDate);
          return date.toISOString().split('T')[0];
        })
        .sort(); // Ordenar en memoria

      results.details.push({
        recurrenceId,
        name: recData.name,
        deleted: deletedCount,
        generated: genResult.generatedCount,
        dates: generatedDates,
      });

      console.log(`[FixDates] ${recData.name}: eliminadas ${deletedCount}, generadas ${genResult.generatedCount}`);
    }

    return successResponse({
      message: 'Fechas corregidas correctamente',
      ...results,
    });
  });
}
