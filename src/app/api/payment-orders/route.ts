import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  withErrorHandling,
} from '@/lib/api-utils';
import { PaymentOrder, PaymentOrderStatus, PaymentOrderItem } from '@/types';

// GET: Obtener todas las órdenes de pago del usuario
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as PaymentOrderStatus | null;

    const snapshot = await db
      .collection('payment_orders')
      .where('userId', '==', userId)
      .get();
    
    let orders: PaymentOrder[] = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
        authorizedAt: data.authorizedAt?.toDate(),
        executedAt: data.executedAt?.toDate(),
        items: (data.items || []).map((item: PaymentOrderItem & { dueDate?: { toDate?: () => Date } }) => ({
          ...item,
          dueDate: item.dueDate && typeof item.dueDate === 'object' && 'toDate' in item.dueDate && item.dueDate.toDate
            ? item.dueDate.toDate() 
            : item.dueDate,
        })),
      } as PaymentOrder;
    });

    // Filtrar por estado si se especifica
    if (status) {
      orders = orders.filter(o => o.status === status);
    }

    // Ordenar por fecha descendente
    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ success: true, data: orders });
  });
}

// POST: Crear nueva orden de pago
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    const body = await request.json();
    const { 
      title, 
      description, 
      defaultChargeAccountId, 
      items, 
      transactionIds,
      notesForFinance,
      companyId,
    } = body;

    if (!title || !items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Título y al menos un item son requeridos' },
        { status: 400 }
      );
    }

    // Generar número de orden secuencial
    const year = new Date().getFullYear();
    const countSnapshot = await db
      .collection('payment_orders')
      .where('userId', '==', userId)
      .get();
    
    // Contar órdenes del año actual
    const ordersThisYear = countSnapshot.docs.filter(doc => 
      doc.data().orderNumber?.startsWith(`OP-${year}-`)
    ).length;
    
    const nextNumber = ordersThisYear + 1;
    const orderNumber = `OP-${year}-${nextNumber.toString().padStart(4, '0')}`;

    // Calcular totales
    const totalAmount = items.reduce((sum: number, item: PaymentOrderItem) => sum + item.amount, 0);
    const itemCount = items.length;

    // Obtener nombre del usuario
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const authorizedByName = userData?.displayName || userData?.email || 'Usuario';

    // Obtener nombre de la empresa si se proporciona companyId
    let companyName: string | undefined;
    if (companyId) {
      const companyDoc = await db.collection('companies').doc(companyId).get();
      if (companyDoc.exists) {
        companyName = companyDoc.data()?.name;
      }
    }

    const now = new Date();
    const orderData = {
      userId,
      orderNumber,
      title,
      description: description || '',
      defaultChargeAccountId: defaultChargeAccountId || null,
      companyId: companyId || null,
      companyName: companyName || null,
      items: items.map((item: PaymentOrderItem, index: number) => ({
        transactionId: transactionIds?.[index] || '',
        description: item.description,
        thirdPartyName: item.thirdPartyName,
        supplierInvoiceNumber: item.supplierInvoiceNumber || '',
        supplierBankAccount: item.supplierBankAccount,
        amount: item.amount,
        dueDate: item.dueDate,
        chargeAccountId: item.chargeAccountId || null,
        notes: item.notes || '',
      })),
      totalAmount,
      itemCount,
      status: 'AUTHORIZED' as PaymentOrderStatus, // Se crea ya autorizada
      authorizedBy: userId,
      authorizedByName,
      authorizedAt: now,
      notesForFinance: notesForFinance || '',
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection('payment_orders').add(orderData);

    // Actualizar las transacciones con referencia a esta orden
    // Usamos tanto transactionIds del body como los transactionId de cada item
    const txIdsToUpdate = transactionIds && transactionIds.length > 0 
      ? transactionIds 
      : items.map((item: PaymentOrderItem) => item.transactionId).filter(Boolean);
    
    console.log('Actualizando transacciones con orden:', orderNumber, 'IDs:', txIdsToUpdate);
    
    if (txIdsToUpdate && txIdsToUpdate.length > 0) {
      const batch = db.batch();
      for (const txId of txIdsToUpdate) {
        if (txId) {
          const txRef = db.collection('transactions').doc(txId);
          batch.update(txRef, {
            paymentOrderId: docRef.id,
            paymentOrderNumber: orderNumber,
            updatedAt: now,
          });
        }
      }
      await batch.commit();
      console.log('Batch commit completado para', txIdsToUpdate.length, 'transacciones');
    }

    return NextResponse.json({
      success: true,
      data: {
        id: docRef.id,
        ...orderData,
      },
    });
  });
}
