import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { authenticateRequest, withErrorHandling } from '@/lib/api-utils';

/**
 * POST: Migrar órdenes de pago existentes para añadir companyId y companyName
 * Obtiene el companyId de:
 * 1. La primera transacción de cada orden (para órdenes normales)
 * 2. El lote de nóminas asociado (para órdenes de nóminas)
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
        data: {
          message: 'No hay órdenes para migrar',
          updated: 0,
        },
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

    // Obtener todos los lotes de nóminas del usuario (para órdenes de payroll)
    const payrollBatchesSnapshot = await db
      .collection('payroll_batches')
      .where('userId', '==', userId)
      .get();
    
    // Mapear paymentOrderId -> companyId desde los lotes
    const payrollOrdersMap = new Map<string, string>();
    payrollBatchesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.paymentOrderId && data.companyId) {
        payrollOrdersMap.set(data.paymentOrderId, data.companyId);
      }
    });

    let updated = 0;
    const batch = db.batch();

    for (const orderDoc of ordersToUpdate) {
      const orderData = orderDoc.data();
      const items = orderData.items || [];
      
      let companyId: string | null = null;
      let companyName: string | null = null;
      
      // 1. Primero intentar obtener de transacciones
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

      // 2. Si no encontró, intentar desde lotes de nóminas
      if (!companyId) {
        const payrollCompanyId = payrollOrdersMap.get(orderDoc.id);
        if (payrollCompanyId) {
          companyId = payrollCompanyId;
          companyName = companiesMap.get(companyId) || null;
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
      data: {
        message: `Migración completada: ${updated} órdenes actualizadas`,
        updated,
        total: ordersToUpdate.length,
      },
    });
  });
}
