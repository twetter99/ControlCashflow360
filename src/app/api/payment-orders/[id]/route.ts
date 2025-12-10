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

    return NextResponse.json({
      success: true,
      data: {
        id: doc.id,
        ...data,
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
      }
    }

    await db.collection('payment_orders').doc(id).update(updateData);

    // Devolver el documento actualizado
    const updatedDoc = await db.collection('payment_orders').doc(id).get();
    const updatedData = updatedDoc.data();

    return NextResponse.json({
      success: true,
      data: {
        id,
        ...updatedData,
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

    await db.collection('payment_orders').doc(id).update(updateData);

    // Obtener el documento actualizado
    const updatedDoc = await db.collection('payment_orders').doc(id).get();
    const updatedData = updatedDoc.data();

    return NextResponse.json({
      success: true,
      data: {
        id,
        ...updatedData,
        createdAt: updatedData?.createdAt?.toDate(),
        updatedAt: updatedData?.updatedAt?.toDate(),
        authorizedAt: updatedData?.authorizedAt?.toDate(),
        executedAt: updatedData?.executedAt?.toDate(),
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

    if (data?.status !== 'DRAFT' && data?.status !== 'CANCELLED') {
      return NextResponse.json(
        { success: false, error: 'Solo se pueden eliminar órdenes en borrador o canceladas' },
        { status: 400 }
      );
    }

    await db.collection('payment_orders').doc(id).delete();

    return NextResponse.json({ success: true });
  });
}
