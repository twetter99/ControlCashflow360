import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  withErrorHandling,
} from '@/lib/api-utils';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/migrations/sync-transaction-fields
 * 
 * Migración para sincronizar campos faltantes en transacciones.
 * Busca transacciones que tienen recurrenceId y copia los campos de gasto
 * desde la recurrencia padre o desde la primera transacción del grupo.
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    
    // Obtener todas las transacciones del usuario
    const transactionsSnap = await db.collection('transactions')
      .where('userId', '==', userId)
      .get();

    if (transactionsSnap.empty) {
      return successResponse({ 
        message: 'No hay transacciones para migrar',
        updated: 0 
      });
    }

    // Agrupar por recurrenceId para encontrar la transacción "fuente"
    const byRecurrence: Map<string, FirebaseFirestore.QueryDocumentSnapshot[]> = new Map();
    const standalone: FirebaseFirestore.QueryDocumentSnapshot[] = [];

    transactionsSnap.docs.forEach(doc => {
      const data = doc.data();
      const recurrenceId = data.recurrenceId;
      
      if (recurrenceId) {
        if (!byRecurrence.has(recurrenceId)) {
          byRecurrence.set(recurrenceId, []);
        }
        byRecurrence.get(recurrenceId)!.push(doc);
      } else {
        standalone.push(doc);
      }
    });

    let updatedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];
    let batch = db.batch();
    let batchCount = 0;
    const MAX_BATCH = 400;

    // Para cada grupo de recurrencia, encontrar la transacción con más datos
    // y propagar esos datos a las demás
    const recurrenceEntries = Array.from(byRecurrence.entries());
    
    for (let i = 0; i < recurrenceEntries.length; i++) {
      const [recurrenceId, transactions] = recurrenceEntries[i];
      
      try {
        // Ordenar por fecha para tener la primera transacción
        transactions.sort((a: FirebaseFirestore.QueryDocumentSnapshot, b: FirebaseFirestore.QueryDocumentSnapshot) => {
          const dateA = a.data().dueDate?.toDate?.() || new Date(0);
          const dateB = b.data().dueDate?.toDate?.() || new Date(0);
          return dateA.getTime() - dateB.getTime();
        });

        // Encontrar la transacción "fuente" (la que tiene los campos de gasto definidos)
        let sourceData: FirebaseFirestore.DocumentData | null = null;
        
        for (const doc of transactions) {
          const data = doc.data();
          // Si tiene paymentMethod o chargeAccountId, es una buena fuente
          if (data.paymentMethod || data.chargeAccountId || data.supplierBankAccount) {
            sourceData = data;
            break;
          }
        }

        // Si no encontramos fuente en las transacciones, intentar desde la recurrencia
        if (!sourceData) {
          const recurrenceDoc = await db.collection('recurrences').doc(recurrenceId).get();
          if (recurrenceDoc.exists) {
            const recData = recurrenceDoc.data()!;
            // Las recurrencias pueden tener campos similares
            if (recData.paymentMethod || recData.chargeAccountId || recData.accountId) {
              sourceData = {
                paymentMethod: recData.paymentMethod,
                chargeAccountId: recData.chargeAccountId || recData.accountId,
                supplierBankAccount: recData.supplierBankAccount,
                supplierInvoiceNumber: recData.supplierInvoiceNumber,
              };
            }
          }
        }

        // Si tenemos datos fuente, propagar a todas las transacciones del grupo
        if (sourceData) {
          const updateFields: { [key: string]: string | FieldValue } = {};
          
          if (sourceData.paymentMethod) {
            updateFields.paymentMethod = sourceData.paymentMethod;
          }
          if (sourceData.chargeAccountId) {
            updateFields.chargeAccountId = sourceData.chargeAccountId;
          }
          if (sourceData.supplierBankAccount) {
            updateFields.supplierBankAccount = sourceData.supplierBankAccount;
          }
          if (sourceData.supplierInvoiceNumber) {
            updateFields.supplierInvoiceNumber = sourceData.supplierInvoiceNumber;
          }

          if (Object.keys(updateFields).length > 0) {
            for (const doc of transactions) {
              const data = doc.data();
              // Solo actualizar si le faltan campos
              if (!data.paymentMethod && !data.chargeAccountId) {
                batch.update(doc.ref, updateFields);
                batchCount++;
                updatedCount++;

                // Commit intermedio si el batch está lleno
                if (batchCount >= MAX_BATCH) {
                  await batch.commit();
                  batch = db.batch();
                  batchCount = 0;
                }
              } else {
                skippedCount++;
              }
            }
          } else {
            skippedCount += transactions.length;
          }
        } else {
          skippedCount += transactions.length;
        }
      } catch (error) {
        errors.push(`Error en recurrencia ${recurrenceId}: ${error}`);
      }
    }

    // Commit final
    if (batchCount > 0) {
      await batch.commit();
    }

    return successResponse({
      message: 'Migración completada',
      updated: updatedCount,
      skipped: skippedCount,
      recurrenceGroups: byRecurrence.size,
      standaloneTransactions: standalone.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  });
}
