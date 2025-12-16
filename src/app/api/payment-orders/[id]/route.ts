import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  withErrorHandling,
  verifyOwnership,
} from '@/lib/api-utils';
import { PaymentOrderStatus } from '@/types';

// GET: Obtener una orden de pago específica
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
    const doc = await db.collection('payment_orders').doc(id).get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Orden de pago no encontrada' },
        { status: 404 }
      );
    }

    const data = doc.data();
    if (!verifyOwnership(data?.userId, userId)) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 403 }
      );
    }

    // Procesar items para convertir fechas
    const processedItems = (data?.items || []).map((item: Record<string, unknown>) => ({
      ...item,
      dueDate: item.dueDate && typeof item.dueDate === 'object' && 'toDate' in item.dueDate 
        ? (item.dueDate as { toDate: () => Date }).toDate() 
        : item.dueDate,
    }));

    return NextResponse.json({
      success: true,
      data: {
        id: doc.id,
        ...data,
        items: processedItems,
        createdAt: data?.createdAt?.toDate(),
        updatedAt: data?.updatedAt?.toDate(),
        authorizedAt: data?.authorizedAt?.toDate(),
        executedAt: data?.executedAt?.toDate(),
      },
    });
  });
}

// PATCH: Actualizar estado de la orden (marcar como ejecutada, cancelar, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const body = await request.json();
    const { status, executedByName } = body;

    const db = getAdminDb();
    const doc = await db.collection('payment_orders').doc(id).get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Orden de pago no encontrada' },
        { status: 404 }
      );
    }

    const data = doc.data();
    if (!verifyOwnership(data?.userId, userId)) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (status) {
      updateData.status = status as PaymentOrderStatus;
      
      if (status === 'EXECUTED') {
        updateData.executedBy = userId;
        updateData.executedByName = executedByName || 'Usuario';
        updateData.executedAt = new Date();
        
        // Marcar todas las transacciones de esta orden como COMPLETED
        const items = data?.items || [];
        if (items.length > 0) {
          const batch = db.batch();
          for (const item of items) {
            if (item.transactionId) {
              const txRef = db.collection('transactions').doc(item.transactionId);
              batch.update(txRef, {
                status: 'COMPLETED',
                paidDate: new Date(),
                updatedAt: new Date(),
              });
            }
          }
          await batch.commit();
        }
      }
      
      // Si se cancela la orden, limpiar las referencias de las transacciones
      if (status === 'CANCELLED') {
        const items = data?.items || [];
        if (items.length > 0) {
          const batch = db.batch();
          for (const item of items) {
            if (item.transactionId) {
              const txRef = db.collection('transactions').doc(item.transactionId);
              batch.update(txRef, {
                paymentOrderId: null,
                paymentOrderNumber: null,
                updatedAt: new Date(),
              });
            }
          }
          await batch.commit();
        }
      }
    }

    await db.collection('payment_orders').doc(id).update(updateData);

    // Devolver el documento actualizado
    const updatedDoc = await db.collection('payment_orders').doc(id).get();
    const updatedData = updatedDoc.data();

    // Procesar items para convertir fechas
    const processedItems = (updatedData?.items || []).map((item: Record<string, unknown>) => ({
      ...item,
      dueDate: item.dueDate && typeof item.dueDate === 'object' && 'toDate' in item.dueDate 
        ? (item.dueDate as { toDate: () => Date }).toDate() 
        : item.dueDate,
    }));

    return NextResponse.json({
      success: true,
      data: {
        id,
        ...updatedData,
        items: processedItems,
        createdAt: updatedData?.createdAt?.toDate(),
        updatedAt: updatedData?.updatedAt?.toDate(),
        authorizedAt: updatedData?.authorizedAt?.toDate(),
        executedAt: updatedData?.executedAt?.toDate(),
      },
    });
  });
}

// PUT: Actualizar datos completos de la orden
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const body = await request.json();

    const db = getAdminDb();
    const doc = await db.collection('payment_orders').doc(id).get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Orden de pago no encontrada' },
        { status: 404 }
      );
    }

    const data = doc.data();
    if (!verifyOwnership(data?.userId, userId)) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 403 }
      );
    }

    // Solo permitir edición si la orden no está ejecutada
    if (data?.status === 'EXECUTED') {
      return NextResponse.json(
        { success: false, error: 'No se pueden modificar órdenes ya ejecutadas' },
        { status: 400 }
      );
    }

    // Construir objeto de actualización solo con campos permitidos
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // Campos actualizables
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.status !== undefined) {
      updateData.status = body.status as PaymentOrderStatus;
      
      if (body.status === 'EXECUTED') {
        updateData.executedBy = userId;
        updateData.executedByName = body.executedByName || 'Usuario';
        updateData.executedAt = new Date();
      }
    }
    if (body.notesForFinance !== undefined) updateData.notesForFinance = body.notesForFinance;
    if (body.defaultChargeAccountId !== undefined) updateData.defaultChargeAccountId = body.defaultChargeAccountId;

    // Actualizar items si se proporcionan
    if (body.items !== undefined && Array.isArray(body.items)) {
      const updatedItems = body.items;
      updateData.items = updatedItems;
      
      // Recalcular totales
      const totalAmount = updatedItems.reduce((sum: number, item: { amount: number }) => sum + (item.amount || 0), 0);
      updateData.totalAmount = totalAmount;
      updateData.itemCount = updatedItems.length;

      // Actualizar también las transacciones correspondientes
      const batch = db.batch();
      for (const item of updatedItems) {
        if (item.transactionId) {
          const txRef = db.collection('transactions').doc(item.transactionId);
          batch.update(txRef, {
            supplierBankAccount: item.supplierBankAccount,
            amount: item.amount,
            updatedAt: new Date(),
          });
        }
      }
      await batch.commit();
    }

    await db.collection('payment_orders').doc(id).update(updateData);

    // Obtener el documento actualizado
    const updatedDoc = await db.collection('payment_orders').doc(id).get();
    const updatedData = updatedDoc.data();

    // Procesar items para convertir fechas
    const processedItems = (updatedData?.items || []).map((item: Record<string, unknown>) => ({
      ...item,
      dueDate: item.dueDate && typeof item.dueDate === 'object' && 'toDate' in item.dueDate 
        ? (item.dueDate as { toDate: () => Date }).toDate() 
        : item.dueDate,
    }));

    return NextResponse.json({
      success: true,
      data: {
        id,
        userId: updatedData?.userId,
        orderNumber: updatedData?.orderNumber,
        title: updatedData?.title,
        description: updatedData?.description,
        defaultChargeAccountId: updatedData?.defaultChargeAccountId,
        items: processedItems,
        totalAmount: updatedData?.totalAmount,
        itemCount: updatedData?.itemCount,
        status: updatedData?.status,
        authorizedBy: updatedData?.authorizedBy,
        authorizedByName: updatedData?.authorizedByName,
        authorizedAt: updatedData?.authorizedAt?.toDate(),
        executedBy: updatedData?.executedBy,
        executedByName: updatedData?.executedByName,
        executedAt: updatedData?.executedAt?.toDate(),
        notesForFinance: updatedData?.notesForFinance,
        createdAt: updatedData?.createdAt?.toDate(),
        updatedAt: updatedData?.updatedAt?.toDate(),
      },
    });
  });
}

// DELETE: Eliminar una orden de pago (solo si está en borrador)
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
    const doc = await db.collection('payment_orders').doc(id).get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Orden de pago no encontrada' },
        { status: 404 }
      );
    }

    const data = doc.data();
    if (!verifyOwnership(data?.userId, userId)) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 403 }
      );
    }

    if (data?.status === 'EXECUTED') {
      return NextResponse.json(
        { success: false, error: 'No se pueden eliminar órdenes ya ejecutadas' },
        { status: 400 }
      );
    }

    // Limpiar las referencias de las transacciones antes de eliminar
    const items = data?.items || [];
    if (items.length > 0) {
      const batch = db.batch();
      for (const item of items) {
        if (item.transactionId) {
          const txRef = db.collection('transactions').doc(item.transactionId);
          batch.update(txRef, {
            paymentOrderId: null,
            paymentOrderNumber: null,
            updatedAt: new Date(),
          });
        }
      }
      await batch.commit();
    }

    await db.collection('payment_orders').doc(id).delete();

    return NextResponse.json({ success: true });
  });
}
