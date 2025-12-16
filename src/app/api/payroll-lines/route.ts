import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  withErrorHandling,
} from '@/lib/api-utils';
import { PayrollLine, PayrollLineStatus } from '@/types';

// GET: Obtener líneas de nómina (con filtros)
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    const { searchParams } = new URL(request.url);
    const payrollBatchId = searchParams.get('payrollBatchId');
    const workerId = searchParams.get('workerId');
    const status = searchParams.get('status') as PayrollLineStatus | null;

    let query = db.collection('payroll_lines').where('userId', '==', userId);
    
    if (payrollBatchId) {
      query = query.where('payrollBatchId', '==', payrollBatchId);
    }
    if (workerId) {
      query = query.where('workerId', '==', workerId);
    }
    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.get();
    
    const lines: PayrollLine[] = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        dueDate: data.dueDate?.toDate(),
        paidDate: data.paidDate?.toDate(),
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      } as PayrollLine;
    });

    // Ordenar por nombre
    lines.sort((a, b) => a.workerName.localeCompare(b.workerName));

    return NextResponse.json({ success: true, data: lines });
  });
}

// PUT: Actualizar línea de nómina
export async function PUT(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    const body = await request.json();
    const { lineId, amount, status, dueDate, paidDate, notes } = body;

    if (!lineId) {
      return NextResponse.json(
        { success: false, error: 'lineId es requerido' },
        { status: 400 }
      );
    }

    const docRef = db.collection('payroll_lines').doc(lineId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Línea no encontrada' },
        { status: 404 }
      );
    }

    const existingData = doc.data()!;
    
    if (existingData.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = {
      lastUpdatedBy: userId,
      updatedAt: new Date(),
    };

    if (amount !== undefined) updateData.amount = amount;
    if (status !== undefined) updateData.status = status;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (paidDate !== undefined) updateData.paidDate = paidDate ? new Date(paidDate) : null;
    if (notes !== undefined) updateData.notes = notes;

    await docRef.update(updateData);

    // Actualizar totales del lote
    const batchRef = db.collection('payroll_batches').doc(existingData.payrollBatchId);
    const linesSnapshot = await db.collection('payroll_lines')
      .where('payrollBatchId', '==', existingData.payrollBatchId)
      .get();

    const totalAmount = linesSnapshot.docs.reduce((sum, d) => {
      const lineData = d.data();
      // Si es la línea que estamos actualizando, usar el nuevo importe
      if (d.id === lineId && amount !== undefined) {
        return sum + amount;
      }
      return sum + (lineData.amount || 0);
    }, 0);

    await batchRef.update({
      totalAmount,
      lastUpdatedBy: userId,
      updatedAt: new Date(),
    });

    const updatedDoc = await docRef.get();
    const updatedData = updatedDoc.data()!;

    return NextResponse.json({ 
      success: true, 
      data: {
        id: updatedDoc.id,
        ...updatedData,
        dueDate: updatedData.dueDate?.toDate(),
        paidDate: updatedData.paidDate?.toDate(),
        createdAt: updatedData.createdAt?.toDate(),
        updatedAt: updatedData.updatedAt?.toDate(),
      }
    });
  });
}

// DELETE: Eliminar línea de nómina
export async function DELETE(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    const { searchParams } = new URL(request.url);
    const lineId = searchParams.get('lineId');

    if (!lineId) {
      return NextResponse.json(
        { success: false, error: 'lineId es requerido' },
        { status: 400 }
      );
    }

    const docRef = db.collection('payroll_lines').doc(lineId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Línea no encontrada' },
        { status: 404 }
      );
    }

    const data = doc.data()!;
    
    if (data.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 403 }
      );
    }

    const batchId = data.payrollBatchId;

    // Verificar que el lote está en borrador
    const batchDoc = await db.collection('payroll_batches').doc(batchId).get();
    if (batchDoc.exists && batchDoc.data()?.status !== 'DRAFT') {
      return NextResponse.json(
        { success: false, error: 'No se pueden eliminar líneas de un lote confirmado' },
        { status: 400 }
      );
    }

    await docRef.delete();

    // Actualizar totales del lote
    const linesSnapshot = await db.collection('payroll_lines')
      .where('payrollBatchId', '==', batchId)
      .get();

    const totalAmount = linesSnapshot.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
    const workerCount = linesSnapshot.size;

    await db.collection('payroll_batches').doc(batchId).update({
      totalAmount,
      workerCount,
      lastUpdatedBy: userId,
      updatedAt: new Date(),
    });

    return NextResponse.json({ 
      success: true, 
      data: { message: 'Línea eliminada' } 
    });
  });
}
