import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { authenticateRequest, withErrorHandling } from '@/lib/api-utils';

/**
 * POST: Migrar órdenes de pago existentes para añadir companyId y companyName
 * Obtiene el companyId de la primera transacción de cada orden
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    
    // Obtener todas las órdenes del usuario que no tengan companyId
    const ordersSnapshot = await db
      .collection('payment_orders')
      .where('userId', '==', userId)
      .get();
    
    const ordersToUpdate = ordersSnapshot.docs.filter(doc => !doc.data().companyId);
    
    if (ordersToUpdate.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No hay órdenes para migrar',
        updated: 0,
      });
    }

    // Obtener todas las empresas para buscar nombres
    const companiesSnapshot = await db.collection('companies').get();
    const companiesMap = new Map<string, string>();
    companiesSnapshot.docs.forEach(doc => {
      companiesMap.set(doc.id, doc.data().name);
    });

    // Obtener todas las transacciones del usuario
    const transactionsSnapshot = await db
      .collection('transactions')
      .where('userId', '==', userId)
      .get();
    
    const transactionsMap = new Map<string, { companyId: string }>();
    transactionsSnapshot.docs.forEach(doc => {
      transactionsMap.set(doc.id, { companyId: doc.data().companyId });
    });

    let updated = 0;
    const batch = db.batch();

    for (const orderDoc of ordersToUpdate) {
      const orderData = orderDoc.data();
      const items = orderData.items || [];
      
      // Buscar companyId de la primera transacción
      let companyId: string | null = null;
      let companyName: string | null = null;
      
      for (const item of items) {
        if (item.transactionId) {
          const tx = transactionsMap.get(item.transactionId);
          if (tx?.companyId) {
            companyId = tx.companyId;
            companyName = companiesMap.get(companyId) || null;
            break;
          }
        }
      }

      if (companyId) {
        batch.update(orderDoc.ref, {
          companyId,
          companyName,
          updatedAt: new Date(),
        });
        updated++;
      }
    }

    if (updated > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      message: `Migración completada: ${updated} órdenes actualizadas`,
      updated,
      total: ordersToUpdate.length,
    });
  });
}
