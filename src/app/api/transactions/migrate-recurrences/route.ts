import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
} from '@/lib/api-utils';
import { Timestamp } from 'firebase-admin/firestore';
import { generateTransactionsFromRecurrence } from '@/lib/recurrence-generator';
import { RecurrenceFrequency, RecurrenceStatus, Recurrence } from '@/types';

/**
 * Calcula la siguiente fecha de ocurrencia
 */
function calculateNextDate(currentDate: Date, frequency: string, dayOfMonth?: number): Date {
  const next = new Date(currentDate);
  
  switch (frequency) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;
    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      break;
    case 'BIWEEKLY':
      next.setDate(next.getDate() + 14);
      break;
    case 'MONTHLY': {
      // Evitar overflow: primero ir a día 1, luego sumar mes
      const currentMonth = next.getMonth();
      next.setDate(1);
      next.setMonth(currentMonth + 1);
      if (dayOfMonth) {
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(dayOfMonth, maxDay));
      }
      break;
    }
    case 'QUARTERLY': {
      const currentMonthQ = next.getMonth();
      next.setDate(1);
      next.setMonth(currentMonthQ + 3);
      if (dayOfMonth) {
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(dayOfMonth, maxDay));
      }
      break;
    }
    case 'YEARLY':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      // Fallback a mensual
      const defaultMonth = next.getMonth();
      next.setDate(1);
      next.setMonth(defaultMonth + 1);
  }
  
  return next;
}

/**
 * POST /api/transactions/migrate-recurrences
 * 
 * Migra transacciones existentes con recurrence != 'NONE' pero sin recurrenceId
 * Crea las entradas en la colección recurrences y genera transacciones futuras
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    const now = Timestamp.now();
    
    // Buscar TODAS las transacciones del usuario
    const allTransactionsSnapshot = await db.collection('transactions')
      .where('userId', '==', userId)
      .get();
    
    console.log(`[Migrate] Total de transacciones del usuario: ${allTransactionsSnapshot.size}`);
    
    // Filtrar las que tienen recurrence != 'NONE' y no tienen recurrenceId válido
    const orphanedRecurrences = allTransactionsSnapshot.docs.filter(doc => {
      const data = doc.data();
      const hasRecurrence = data.recurrence && data.recurrence !== 'NONE';
      const noRecurrenceId = !data.recurrenceId || data.recurrenceId === null;
      const notAlreadyInstance = !data.isRecurrenceInstance;
      
      console.log(`[Migrate] TX ${doc.id}: recurrence=${data.recurrence}, recurrenceId=${data.recurrenceId}, isInstance=${data.isRecurrenceInstance}`);
      
      return hasRecurrence && noRecurrenceId && notAlreadyInstance;
    });

    console.log(`[Migrate] Encontradas ${orphanedRecurrences.length} transacciones recurrentes huérfanas`);

    const results = {
      processed: 0,
      recurrencesCreated: 0,
      transactionsGenerated: 0,
      errors: [] as string[],
      debug: {
        totalTransactions: allTransactionsSnapshot.size,
        orphanedFound: orphanedRecurrences.length,
      }
    };

    for (const txDoc of orphanedRecurrences) {
      const txData = txDoc.data();
      const txId = txDoc.id;

      try {
        const dueDate = txData.dueDate?.toDate() || new Date();
        const dayOfMonth = dueDate.getDate();
        const dayOfWeek = dueDate.getDay();

        // Crear la recurrencia
        const recurrenceData = {
          userId,
          companyId: txData.companyId,
          accountId: txData.accountId || null,
          type: txData.type,
          name: txData.description || `${txData.category} - ${txData.type === 'INCOME' ? 'Ingreso' : 'Gasto'}`,
          baseAmount: txData.amount,
          category: txData.category || '',
          thirdPartyId: txData.thirdPartyId || null,
          thirdPartyName: txData.thirdPartyName || '',
          certainty: txData.certainty || 'HIGH',
          notes: txData.notes || '',
          frequency: txData.recurrence as RecurrenceFrequency,
          dayOfMonth: dayOfMonth,
          dayOfWeek: dayOfWeek,
          startDate: Timestamp.fromDate(dueDate),
          endDate: null,
          generateMonthsAhead: 6,
          lastGeneratedDate: Timestamp.fromDate(dueDate),
          nextOccurrenceDate: null,
          status: 'ACTIVE',
          createdBy: userId,
          lastUpdatedBy: userId,
          createdAt: now,
          updatedAt: now,
        };

        const recurrenceRef = await db.collection('recurrences').add(recurrenceData);
        const recurrenceId = recurrenceRef.id;
        results.recurrencesCreated++;

        // Actualizar la transacción original
        const instanceDate = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;
        await db.collection('transactions').doc(txId).update({
          recurrenceId: recurrenceId,
          isRecurrenceInstance: true,
          instanceDate: instanceDate,
          updatedAt: now,
        });

        // Generar transacciones futuras
        // Calcular la siguiente fecha de ocurrencia (después de la actual)
        const nextOccurrenceDate = calculateNextDate(dueDate, recurrenceData.frequency, recurrenceData.dayOfMonth);

        const recurrence: Recurrence = {
          id: recurrenceId,
          userId,
          companyId: recurrenceData.companyId,
          accountId: recurrenceData.accountId,
          type: recurrenceData.type,
          name: recurrenceData.name,
          baseAmount: recurrenceData.baseAmount,
          category: recurrenceData.category,
          thirdPartyId: recurrenceData.thirdPartyId,
          thirdPartyName: recurrenceData.thirdPartyName,
          certainty: recurrenceData.certainty,
          notes: recurrenceData.notes,
          frequency: recurrenceData.frequency,
          dayOfMonth: recurrenceData.dayOfMonth,
          dayOfWeek: recurrenceData.dayOfWeek,
          startDate: nextOccurrenceDate, // Empezar desde la SIGUIENTE fecha
          endDate: null,
          generateMonthsAhead: recurrenceData.generateMonthsAhead,
          lastGeneratedDate: undefined, // No establecer para que genere desde startDate
          status: 'ACTIVE' as RecurrenceStatus,
          createdBy: recurrenceData.createdBy,
        };

        const genResult = await generateTransactionsFromRecurrence(recurrence, userId, {
          fromDate: new Date(), // Desde hoy
          monthsAhead: 6,
          skipExisting: true,
        });

        results.transactionsGenerated += genResult.generatedCount;
        results.processed++;

        console.log(`[Migrate] Transacción ${txId} migrada → Recurrencia ${recurrenceId}, ${genResult.generatedCount} futuras generadas`);

      } catch (err) {
        const errorMsg = `Error migrando ${txId}: ${err}`;
        console.error(`[Migrate] ${errorMsg}`);
        results.errors.push(errorMsg);
      }
    }

    return successResponse({
      message: 'Migración completada',
      ...results,
    });
  });
}
