import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  withErrorHandling,
} from '@/lib/api-utils';
import { PayrollBatch, PayrollLine, PayrollBatchStatus, PayrollLineStatus, Worker } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET: Obtener un lote con todas sus líneas
export async function GET(request: NextRequest, context: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;
    const { id } = await context.params;

    const db = getAdminDb();
    const docRef = db.collection('payroll_batches').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Lote no encontrado' },
        { status: 404 }
      );
    }

    const data = doc.data()!;
    
    // Verificar que pertenece al usuario
    if (data.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 403 }
      );
    }

    const batch: PayrollBatch = {
      id: doc.id,
      ...data,
      dueDate: data.dueDate?.toDate(),
      confirmedAt: data.confirmedAt?.toDate(),
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate(),
    } as PayrollBatch;

    // Obtener líneas del lote
    const linesSnapshot = await db.collection('payroll_lines')
      .where('payrollBatchId', '==', id)
      .get();

    const lines: PayrollLine[] = linesSnapshot.docs.map(lineDoc => {
      const lineData = lineDoc.data();
      return {
        id: lineDoc.id,
        ...lineData,
        dueDate: lineData.dueDate?.toDate(),
        paidDate: lineData.paidDate?.toDate(),
        createdAt: lineData.createdAt?.toDate(),
        updatedAt: lineData.updatedAt?.toDate(),
      } as PayrollLine;
    }).sort((a, b) => a.workerName.localeCompare(b.workerName));

    // Calcular resumen
    const pendingLines = lines.filter(l => l.status === 'PENDING');
    const paidLines = lines.filter(l => l.status === 'PAID');

    return NextResponse.json({ 
      success: true, 
      data: {
        batch,
        lines,
        summary: {
          pendingCount: pendingLines.length,
          paidCount: paidLines.length,
          pendingAmount: pendingLines.reduce((sum, l) => sum + l.amount, 0),
          paidAmount: paidLines.reduce((sum, l) => sum + l.amount, 0),
        }
      }
    });
  });
}

// PUT: Actualizar lote (título, fecha, notas, estado)
export async function PUT(request: NextRequest, context: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;
    const { id } = await context.params;

    const db = getAdminDb();
    const docRef = db.collection('payroll_batches').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Lote no encontrado' },
        { status: 404 }
      );
    }

    const existingData = doc.data()!;
    
    // Verificar que pertenece al usuario
    if (existingData.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, dueDate, notes, status } = body;

    const updateData: Record<string, unknown> = {
      lastUpdatedBy: userId,
      updatedAt: new Date(),
    };

    if (title !== undefined) updateData.title = title;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'CONFIRMED' && !existingData.confirmedAt) {
        updateData.confirmedAt = new Date();
        updateData.confirmedBy = userId;
      }
    }

    await docRef.update(updateData);

    const updatedDoc = await docRef.get();
    const updatedData = updatedDoc.data()!;

    return NextResponse.json({ 
      success: true, 
      data: {
        id: updatedDoc.id,
        ...updatedData,
        dueDate: updatedData.dueDate?.toDate(),
        confirmedAt: updatedData.confirmedAt?.toDate(),
        createdAt: updatedData.createdAt?.toDate(),
        updatedAt: updatedData.updatedAt?.toDate(),
      }
    });
  });
}

// DELETE: Eliminar lote y todas sus líneas
export async function DELETE(request: NextRequest, context: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;
    const { id } = await context.params;

    const db = getAdminDb();
    const docRef = db.collection('payroll_batches').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Lote no encontrado' },
        { status: 404 }
      );
    }

    const data = doc.data()!;
    
    // Verificar que pertenece al usuario
    if (data.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 403 }
      );
    }

    // Solo permitir eliminar borradores
    if (data.status !== 'DRAFT') {
      return NextResponse.json(
        { success: false, error: 'Solo se pueden eliminar lotes en borrador' },
        { status: 400 }
      );
    }

    // Eliminar todas las líneas del lote
    const linesSnapshot = await db.collection('payroll_lines')
      .where('payrollBatchId', '==', id)
      .get();

    const batch = db.batch();
    linesSnapshot.docs.forEach(lineDoc => {
      batch.delete(lineDoc.ref);
    });
    batch.delete(docRef);
    
    await batch.commit();

    return NextResponse.json({ 
      success: true, 
      data: { 
        message: 'Lote eliminado',
        linesDeleted: linesSnapshot.size 
      } 
    });
  });
}

// POST con action en query: Acciones especiales
export async function POST(request: NextRequest, context: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;
    const { id } = await context.params;

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    const db = getAdminDb();
    const docRef = db.collection('payroll_batches').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Lote no encontrado' },
        { status: 404 }
      );
    }

    const batchData = doc.data()!;
    
    if (batchData.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 403 }
      );
    }

    switch (action) {
      case 'confirm': {
        // Confirmar lote - Validar primero
        const linesSnapshot = await db.collection('payroll_lines')
          .where('payrollBatchId', '==', id)
          .get();

        if (linesSnapshot.empty) {
          return NextResponse.json(
            { success: false, error: 'No hay líneas en el lote' },
            { status: 400 }
          );
        }

        // Verificar IBANs de trabajadores
        const workerIds = Array.from(new Set(linesSnapshot.docs.map(d => d.data().workerId)));
        const workersSnapshot = await db.collection('workers')
          .where('userId', '==', userId)
          .get();
        
        const workersMap = new Map(
          workersSnapshot.docs.map(d => [d.id, d.data() as Worker])
        );

        const errors: string[] = [];
        for (const workerId of workerIds) {
          const worker = workersMap.get(workerId);
          if (!worker) {
            errors.push(`Trabajador no encontrado: ${workerId}`);
          } else if (!worker.iban || worker.iban.trim() === '') {
            errors.push(`${worker.displayName}: falta IBAN`);
          }
        }

        if (errors.length > 0) {
          return NextResponse.json(
            { success: false, error: 'Errores de validación', validationErrors: errors },
            { status: 400 }
          );
        }

        // Confirmar
        await docRef.update({
          status: 'CONFIRMED' as PayrollBatchStatus,
          confirmedAt: new Date(),
          confirmedBy: userId,
          lastUpdatedBy: userId,
          updatedAt: new Date(),
        });

        return NextResponse.json({ 
          success: true, 
          data: { message: 'Lote confirmado', workerCount: workerIds.length }
        });
      }

      case 'add-lines': {
        // Añadir líneas al lote
        const body = await request.json();
        const { lines } = body;

        if (!lines || !Array.isArray(lines) || lines.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Se requiere array de líneas' },
            { status: 400 }
          );
        }

        // Obtener datos de trabajadores
        const workerIds = lines.map((l: { workerId: string }) => l.workerId);
        const workersSnapshot = await db.collection('workers')
          .where('userId', '==', userId)
          .get();
        
        const workersMap = new Map(
          workersSnapshot.docs.map(d => [d.id, { id: d.id, ...d.data() } as Worker])
        );

        const batch = db.batch();
        const createdLines: PayrollLine[] = [];
        const now = new Date();

        for (const line of lines) {
          const worker = workersMap.get(line.workerId);
          if (!worker) continue;

          const lineRef = db.collection('payroll_lines').doc();
          const lineData = {
            userId,
            payrollBatchId: id,
            companyId: batchData.companyId,
            workerId: line.workerId,
            workerName: worker.displayName,
            ibanSnapshot: worker.iban,
            bankAliasSnapshot: worker.bankAlias || null,
            amount: line.amount || worker.defaultAmount || 0,
            status: 'PENDING' as PayrollLineStatus,
            dueDate: line.dueDate ? new Date(line.dueDate) : (batchData.dueDate || null),
            notes: line.notes || '',
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
          };

          batch.set(lineRef, lineData);
          createdLines.push({
            id: lineRef.id,
            ...lineData,
          } as PayrollLine);
        }

        // Actualizar totales del lote
        const existingLinesSnapshot = await db.collection('payroll_lines')
          .where('payrollBatchId', '==', id)
          .get();

        const existingTotal = existingLinesSnapshot.docs.reduce(
          (sum, d) => sum + (d.data().amount || 0), 0
        );
        const newTotal = createdLines.reduce((sum, l) => sum + l.amount, 0);
        const existingCount = existingLinesSnapshot.size;

        batch.update(docRef, {
          totalAmount: existingTotal + newTotal,
          workerCount: existingCount + createdLines.length,
          lastUpdatedBy: userId,
          updatedAt: now,
        });

        await batch.commit();

        return NextResponse.json({ 
          success: true, 
          data: { 
            linesCreated: createdLines.length,
            lines: createdLines
          }
        }, { status: 201 });
      }

      case 'copy-previous': {
        // Copiar del mes anterior
        let prevYear = batchData.year;
        let prevMonth = batchData.month - 1;
        if (prevMonth === 0) {
          prevMonth = 12;
          prevYear--;
        }

        const prevBatchSnapshot = await db.collection('payroll_batches')
          .where('userId', '==', userId)
          .where('companyId', '==', batchData.companyId)
          .where('year', '==', prevYear)
          .where('month', '==', prevMonth)
          .get();

        if (prevBatchSnapshot.empty) {
          return NextResponse.json(
            { success: false, error: 'No hay lote del mes anterior' },
            { status: 404 }
          );
        }

        const prevBatch = prevBatchSnapshot.docs[0];
        const prevLinesSnapshot = await db.collection('payroll_lines')
          .where('payrollBatchId', '==', prevBatch.id)
          .get();

        if (prevLinesSnapshot.empty) {
          return NextResponse.json(
            { success: false, error: 'El lote del mes anterior no tiene líneas' },
            { status: 404 }
          );
        }

        // Obtener trabajadores activos actuales
        const workersSnapshot = await db.collection('workers')
          .where('userId', '==', userId)
          .where('companyId', '==', batchData.companyId)
          .where('status', '==', 'ACTIVE')
          .get();

        const activeWorkers = new Map(
          workersSnapshot.docs.map(d => [d.id, { id: d.id, ...d.data() } as Worker])
        );

        const batch = db.batch();
        const createdLines: PayrollLine[] = [];
        const now = new Date();
        let skipped = 0;

        for (const prevLineDoc of prevLinesSnapshot.docs) {
          const prevLine = prevLineDoc.data();
          const worker = activeWorkers.get(prevLine.workerId);
          
          if (!worker) {
            skipped++;
            continue;
          }

          const lineRef = db.collection('payroll_lines').doc();
          const lineData = {
            userId,
            payrollBatchId: id,
            companyId: batchData.companyId,
            workerId: prevLine.workerId,
            workerName: worker.displayName,
            ibanSnapshot: worker.iban, // IBAN actual, no el del mes anterior
            bankAliasSnapshot: worker.bankAlias || null,
            amount: prevLine.amount, // Mantener importe del mes anterior
            status: 'PENDING' as PayrollLineStatus,
            dueDate: batchData.dueDate || null,
            notes: '',
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
          };

          batch.set(lineRef, lineData);
          createdLines.push({
            id: lineRef.id,
            ...lineData,
          } as PayrollLine);
        }

        // Actualizar totales del lote
        const totalAmount = createdLines.reduce((sum, l) => sum + l.amount, 0);

        batch.update(docRef, {
          totalAmount,
          workerCount: createdLines.length,
          lastUpdatedBy: userId,
          updatedAt: now,
        });

        await batch.commit();

        return NextResponse.json({ 
          success: true, 
          data: { 
            copiedWorkers: createdLines.length,
            skippedWorkers: skipped,
            totalAmount,
            lines: createdLines
          }
        });
      }

      case 'generate-payment-order': {
        // Generar orden de pago desde el lote
        if (batchData.status === 'DRAFT') {
          return NextResponse.json(
            { success: false, error: 'El lote debe estar confirmado para generar orden de pago' },
            { status: 400 }
          );
        }

        // Obtener cuenta de cargo si se especifica
        const chargeAccountId = searchParams.get('chargeAccountId');
        let chargeAccountData: { name?: string; bankName?: string; iban?: string } | null = null;
        
        if (chargeAccountId) {
          const accountDoc = await db.collection('accounts').doc(chargeAccountId).get();
          if (accountDoc.exists) {
            const accData = accountDoc.data();
            chargeAccountData = {
              name: accData?.alias || accData?.name,
              bankName: accData?.bankName,
              iban: accData?.iban,
            };
          }
        }

        const linesSnapshot = await db.collection('payroll_lines')
          .where('payrollBatchId', '==', id)
          .where('status', '==', 'PENDING')
          .get();

        if (linesSnapshot.empty) {
          return NextResponse.json(
            { success: false, error: 'No hay líneas pendientes para generar orden' },
            { status: 400 }
          );
        }

        // Generar número de orden
        const year = new Date().getFullYear();
        const countSnapshot = await db.collection('payment_orders')
          .where('userId', '==', userId)
          .get();
        
        const ordersThisYear = countSnapshot.docs.filter(d => 
          d.data().orderNumber?.startsWith(`OP-${year}-`)
        ).length;
        
        const nextNumber = ordersThisYear + 1;
        const orderNumber = `OP-${year}-${nextNumber.toString().padStart(4, '0')}`;

        // Crear items de la orden
        const items = linesSnapshot.docs.map((lineDoc, index) => {
          const line = lineDoc.data();
          return {
            transactionId: '', // No hay transacción asociada directamente
            description: `Nómina - ${line.workerName}`,
            thirdPartyName: line.workerName,
            supplierBankAccount: line.ibanSnapshot,
            amount: line.amount,
            dueDate: line.dueDate || batchData.dueDate || new Date(),
            notes: `Lote: ${batchData.title}`,
          };
        });

        const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
        const now = new Date();

        // Obtener nombre del usuario
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const authorizedByName = userData?.displayName || userData?.email || 'Usuario';

        // Obtener nombre de la empresa
        let companyName: string | undefined;
        if (batchData.companyId) {
          const companyDoc = await db.collection('companies').doc(batchData.companyId).get();
          if (companyDoc.exists) {
            companyName = companyDoc.data()?.name;
          }
        }

        const orderData = {
          userId,
          orderNumber,
          title: `Nóminas - ${batchData.title}`,
          description: `Orden de pago generada desde ${batchData.title}`,
          companyId: batchData.companyId || null,
          companyName: companyName || null,
          // Cuenta de cargo seleccionada
          chargeAccountId: chargeAccountId || null,
          chargeAccountName: chargeAccountData?.name || null,
          chargeAccountBank: chargeAccountData?.bankName || null,
          chargeAccountIban: chargeAccountData?.iban || null,
          items,
          totalAmount,
          itemCount: items.length,
          status: 'AUTHORIZED',
          authorizedBy: userId,
          authorizedByName,
          authorizedAt: now,
          createdAt: now,
          updatedAt: now,
        };

        const orderRef = await db.collection('payment_orders').add(orderData);

        // Actualizar el lote con referencia a la orden
        await docRef.update({
          paymentOrderId: orderRef.id,
          paymentOrderNumber: orderNumber,
          lastUpdatedBy: userId,
          updatedAt: now,
        });

        // Actualizar las líneas con referencia a la orden
        const updateBatch = db.batch();
        linesSnapshot.docs.forEach((lineDoc, index) => {
          updateBatch.update(lineDoc.ref, {
            paymentOrderId: orderRef.id,
            paymentOrderItemIndex: index,
            updatedAt: now,
          });
        });
        await updateBatch.commit();

        return NextResponse.json({ 
          success: true, 
          data: { 
            paymentOrderId: orderRef.id,
            paymentOrderNumber: orderNumber,
            itemCount: items.length,
            totalAmount
          }
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Acción no válida: ${action}` },
          { status: 400 }
        );
    }
  });
}
