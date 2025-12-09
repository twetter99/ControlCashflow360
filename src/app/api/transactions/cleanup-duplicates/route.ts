import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  withErrorHandling,
} from '@/lib/api-utils';

interface DuplicateItem {
  id: string;
  createdAt: Date;
}

/**
 * POST /api/transactions/cleanup-duplicates
 * 
 * Elimina transacciones duplicadas basándose en:
 * - Misma descripción
 * - Mismo tipo
 * - Mismo monto
 * - Misma fecha (YYYY-MM-DD)
 * - Misma empresa
 * 
 * Mantiene la transacción más antigua (primera creada)
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();

    // Obtener todas las transacciones del usuario
    const snapshot = await db.collection('transactions')
      .where('userId', '==', userId)
      .get();

    // Agrupar por clave única: companyId + type + amount + description + date
    const groups: Record<string, DuplicateItem[]> = {};

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const dueDate = data.dueDate?.toDate?.() || new Date(data.dueDate);
      const dateKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
      
      // Clave única para identificar duplicados
      const key = `${data.companyId}|${data.type}|${data.amount}|${data.description}|${dateKey}`;
      
      if (!groups[key]) {
        groups[key] = [];
      }
      
      groups[key].push({
        id: doc.id,
        createdAt: data.createdAt?.toDate?.() || new Date(0),
      });
    });

    // Identificar duplicados y eliminar los más nuevos
    const toDelete: string[] = [];
    
    for (const key of Object.keys(groups)) {
      const items = groups[key];
      if (items.length > 1) {
        // Ordenar por fecha de creación (más antiguo primero)
        items.sort((a: DuplicateItem, b: DuplicateItem) => a.createdAt.getTime() - b.createdAt.getTime());
        
        // Mantener el primero, eliminar el resto
        for (let i = 1; i < items.length; i++) {
          toDelete.push(items[i].id);
        }
        
        console.log(`[Cleanup] Duplicados encontrados para "${key}": ${items.length} items, eliminando ${items.length - 1}`);
      }
    }

    // Eliminar en batches de 500 (límite de Firestore)
    let deletedCount = 0;
    const batchSize = 500;
    
    for (let i = 0; i < toDelete.length; i += batchSize) {
      const batch = db.batch();
      const chunk = toDelete.slice(i, i + batchSize);
      
      chunk.forEach(id => {
        batch.delete(db.collection('transactions').doc(id));
      });
      
      await batch.commit();
      deletedCount += chunk.length;
    }

    // También limpiar recurrencias duplicadas
    const recurrencesSnapshot = await db.collection('recurrences')
      .where('userId', '==', userId)
      .get();

    const recurrenceGroups: Record<string, DuplicateItem[]> = {};

    recurrencesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      // Clave única: companyId + name + type + frequency
      const key = `${data.companyId}|${data.name}|${data.type}|${data.frequency}`;
      
      if (!recurrenceGroups[key]) {
        recurrenceGroups[key] = [];
      }
      
      recurrenceGroups[key].push({
        id: doc.id,
        createdAt: data.createdAt?.toDate?.() || new Date(0),
      });
    });

    const recurrencesToDelete: string[] = [];
    
    for (const key of Object.keys(recurrenceGroups)) {
      const items = recurrenceGroups[key];
      if (items.length > 1) {
        items.sort((a: DuplicateItem, b: DuplicateItem) => a.createdAt.getTime() - b.createdAt.getTime());
        
        for (let i = 1; i < items.length; i++) {
          recurrencesToDelete.push(items[i].id);
        }
        
        console.log(`[Cleanup] Recurrencias duplicadas para "${key}": ${items.length} items, eliminando ${items.length - 1}`);
      }
    }

    let deletedRecurrences = 0;
    for (let i = 0; i < recurrencesToDelete.length; i += batchSize) {
      const batch = db.batch();
      const chunk = recurrencesToDelete.slice(i, i + batchSize);
      
      chunk.forEach(id => {
        batch.delete(db.collection('recurrences').doc(id));
      });
      
      await batch.commit();
      deletedRecurrences += chunk.length;
    }

    return successResponse({
      message: 'Limpieza completada',
      transactionsDeleted: deletedCount,
      recurrencesDeleted: deletedRecurrences,
      totalTransactionsAnalyzed: snapshot.docs.length,
      totalRecurrencesAnalyzed: recurrencesSnapshot.docs.length,
    });
  });
}
