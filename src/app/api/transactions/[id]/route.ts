import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
  parseAndValidate,
  verifyOwnership,
} from '@/lib/api-utils';
import { Transaction } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';
import { UpdateTransactionSchema, TransactionActionSchema } from '@/lib/validations/schemas';
import { logUpdate, logDelete, logTransactionAction } from '@/lib/audit-logger';

const COLLECTION = 'transactions';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Mapea datos de Firestore a Transaction
 */
function mapToTransaction(id: string, data: FirebaseFirestore.DocumentData): Transaction {
  return {
    id,
    userId: data.userId,
    companyId: data.companyId,
    accountId: data.accountId || undefined,
    type: data.type,
    amount: data.amount || 0,
    status: data.status || 'PENDING',
    dueDate: data.dueDate?.toDate?.() || new Date(),
    paidDate: data.paidDate?.toDate?.() || null,
    category: data.category || '',
    description: data.description || '',
    thirdPartyId: data.thirdPartyId || undefined,
    thirdPartyName: data.thirdPartyName || '',
    notes: data.notes || '',
    recurrence: data.recurrence || 'NONE',
    certainty: data.certainty || 'HIGH',
    recurrenceId: data.recurrenceId || null,
    createdBy: data.createdBy || '',
    lastUpdatedBy: data.lastUpdatedBy || '',
    createdAt: data.createdAt?.toDate?.() || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(),
  };
}

/**
 * GET /api/transactions/[id] - Obtener transacción por ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return errorResponse('Transacción no encontrada', 404, 'NOT_FOUND');
    }

    const data = docSnap.data()!;
    
    if (!verifyOwnership(data.userId, userId)) {
      return errorResponse('No tienes permiso para ver esta transacción', 403, 'FORBIDDEN');
    }

    return successResponse(mapToTransaction(docSnap.id, data));
  });
}

/**
 * PUT /api/transactions/[id] - Actualizar transacción
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    // Validar con Zod
    const validation = await parseAndValidate(request, UpdateTransactionSchema);
    if (!validation.success) return validation.error;
    const body = validation.data;

    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return errorResponse('Transacción no encontrada', 404, 'NOT_FOUND');
    }

    const existingData = docSnap.data()!;
    
    if (!verifyOwnership(existingData.userId, userId)) {
      return errorResponse('No tienes permiso para editar esta transacción', 403, 'FORBIDDEN');
    }

    // Si cambia la cuenta, verificar que pertenece al usuario
    if (body.accountId && body.accountId !== existingData.accountId) {
      const accountDoc = await db.collection('accounts').doc(body.accountId).get();
      if (!accountDoc.exists || accountDoc.data()?.userId !== userId) {
        return errorResponse('Cuenta no válida', 400, 'INVALID_ACCOUNT');
      }
    }

    // Si cambia la empresa, verificar que pertenece al usuario
    if (body.companyId && body.companyId !== existingData.companyId) {
      const companyDoc = await db.collection('companies').doc(body.companyId).get();
      if (!companyDoc.exists || companyDoc.data()?.userId !== userId) {
        return errorResponse('Empresa no válida', 400, 'INVALID_COMPANY');
      }
    }

    const now = Timestamp.now();
    const updateData: Record<string, unknown> = {
      updatedAt: now,
      lastUpdatedBy: userId,
    };

    // Solo actualizar campos proporcionados
    if (body.accountId !== undefined) updateData.accountId = body.accountId;
    if (body.companyId !== undefined) updateData.companyId = body.companyId;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.amount !== undefined) updateData.amount = body.amount;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.dueDate !== undefined) {
      const dueDate = body.dueDate instanceof Date ? body.dueDate : new Date(body.dueDate);
      updateData.dueDate = Timestamp.fromDate(dueDate);
    }
    if (body.paidDate !== undefined) {
      if (body.paidDate) {
        const paidDate = body.paidDate instanceof Date ? body.paidDate : new Date(body.paidDate);
        updateData.paidDate = Timestamp.fromDate(paidDate);
      } else {
        updateData.paidDate = null;
      }
    }
    if (body.status !== undefined) updateData.status = body.status;
    if (body.thirdPartyId !== undefined) updateData.thirdPartyId = body.thirdPartyId;
    if (body.thirdPartyName !== undefined) updateData.thirdPartyName = body.thirdPartyName;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.recurrence !== undefined) updateData.recurrence = body.recurrence;
    if (body.certainty !== undefined) updateData.certainty = body.certainty;

    // Manejar cambios de balance si cambia el status
    const oldStatus = existingData.status;
    const newStatus = body.status;
    const accountId = body.accountId || existingData.accountId;
    
    if (accountId && oldStatus !== newStatus) {
      const accountDoc = await db.collection('accounts').doc(accountId).get();
      if (accountDoc.exists) {
        const accountData = accountDoc.data()!;
        
        const transactionType = body.type || existingData.type;
        const transactionAmount = body.amount !== undefined ? body.amount : existingData.amount;
        
        let balanceChange = 0;
        
        // Si pasa de PENDING a PAID, aplicar cambio
        if (oldStatus === 'PENDING' && newStatus === 'PAID') {
          balanceChange = transactionType === 'INCOME' ? transactionAmount : -transactionAmount;
        }
        // Si pasa de PAID a PENDING/CANCELLED, revertir
        else if (oldStatus === 'PAID' && (newStatus === 'PENDING' || newStatus === 'CANCELLED')) {
          balanceChange = transactionType === 'INCOME' ? -transactionAmount : transactionAmount;
        }
        
        if (balanceChange !== 0) {
          await db.collection('accounts').doc(accountId).update({
            currentBalance: (accountData.currentBalance || 0) + balanceChange,
            lastUpdateAmount: balanceChange,
            lastUpdateDate: now,
            lastUpdatedBy: userId,
            updatedAt: now,
          });
        }
      }
    }

    await docRef.update(updateData);

    const updatedSnap = await docRef.get();
    return successResponse(mapToTransaction(updatedSnap.id, updatedSnap.data()!));
  });
}

/**
 * DELETE /api/transactions/[id] - Eliminar transacción (hard delete)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return errorResponse('Transacción no encontrada', 404, 'NOT_FOUND');
    }

    const data = docSnap.data()!;
    
    if (!verifyOwnership(data.userId, userId)) {
      return errorResponse('No tienes permiso para eliminar esta transacción', 403, 'FORBIDDEN');
    }

    // Si la transacción estaba PAID, revertir el balance
    if (data.status === 'PAID' && data.accountId) {
      const accountDoc = await db.collection('accounts').doc(data.accountId).get();
      if (accountDoc.exists) {
        const accountData = accountDoc.data()!;
        const balanceRevert = data.type === 'INCOME' ? -data.amount : data.amount;
        await db.collection('accounts').doc(data.accountId).update({
          currentBalance: (accountData.currentBalance || 0) + balanceRevert,
          lastUpdateAmount: balanceRevert,
          lastUpdateDate: Timestamp.now(),
          lastUpdatedBy: userId,
          updatedAt: Timestamp.now(),
        });
      }
    }

    await docRef.delete();

    // Registrar en auditoría
    await logDelete(userId, 'transaction', id,
      { type: data.type, amount: data.amount, status: data.status, description: data.description },
      { entityName: data.description || `${data.type} - ${data.amount}` }
    );

    return successResponse({ deleted: true, id });
  });
}

/**
 * PATCH /api/transactions/[id] - Acciones especiales (marcar pagada, cancelar)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    // Validar con Zod
    const validation = await parseAndValidate(request, TransactionActionSchema);
    if (!validation.success) return validation.error;
    const body = validation.data;

    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return errorResponse('Transacción no encontrada', 404, 'NOT_FOUND');
    }

    const existingData = docSnap.data()!;
    
    if (!verifyOwnership(existingData.userId, userId)) {
      return errorResponse('No tienes permiso para modificar esta transacción', 403, 'FORBIDDEN');
    }

    const now = Timestamp.now();
    const updateData: Record<string, unknown> = {
      updatedAt: now,
      lastUpdatedBy: userId,
    };

    if (body.action === 'markAsPaid') {
      if (existingData.status === 'PAID') {
        return errorResponse('La transacción ya está pagada', 400, 'ALREADY_PAID');
      }

      updateData.status = 'PAID';
      updateData.paidDate = body.paidDate 
        ? Timestamp.fromDate(body.paidDate) 
        : now;

      // Actualizar balance de la cuenta
      const accountId = body.accountId || existingData.accountId;
      if (accountId) {
        const accountDoc = await db.collection('accounts').doc(accountId).get();
        if (accountDoc.exists && accountDoc.data()?.userId === userId) {
          const accountData = accountDoc.data()!;
          const balanceChange = existingData.type === 'INCOME' 
            ? existingData.amount 
            : -existingData.amount;
          
          await db.collection('accounts').doc(accountId).update({
            currentBalance: (accountData.currentBalance || 0) + balanceChange,
            lastUpdateAmount: balanceChange,
            lastUpdateDate: now,
            lastUpdatedBy: userId,
            updatedAt: now,
          });

          // Si se especificó nueva cuenta, actualizar la transacción
          if (body.accountId) {
            updateData.accountId = body.accountId;
          }
        }
      }

      // Registrar acción en auditoría
      await logTransactionAction(userId, 'EXECUTE', id, {
        action: 'markAsPaid',
        amount: existingData.amount,
        accountId: body.accountId || existingData.accountId,
      }, { entityName: existingData.description || `Pago - ${existingData.amount}` });
    } else if (body.action === 'cancel') {
      if (existingData.status === 'CANCELLED') {
        return errorResponse('La transacción ya está cancelada', 400, 'ALREADY_CANCELLED');
      }

      // Si estaba PAID, revertir balance
      if (existingData.status === 'PAID' && existingData.accountId) {
        const accountDoc = await db.collection('accounts').doc(existingData.accountId).get();
        if (accountDoc.exists) {
          const accountData = accountDoc.data()!;
          const balanceRevert = existingData.type === 'INCOME' 
            ? -existingData.amount 
            : existingData.amount;
          
          await db.collection('accounts').doc(existingData.accountId).update({
            currentBalance: (accountData.currentBalance || 0) + balanceRevert,
            lastUpdateAmount: balanceRevert,
            lastUpdateDate: now,
            lastUpdatedBy: userId,
            updatedAt: now,
          });
        }
      }

      updateData.status = 'CANCELLED';

      // Registrar acción en auditoría
      await logTransactionAction(userId, 'CANCEL', id, {
        action: 'cancel',
        amount: existingData.amount,
        previousStatus: existingData.status,
      }, { entityName: existingData.description || `Cancelación - ${existingData.amount}` });
    } else {
      return errorResponse('Acción no válida', 400, 'INVALID_ACTION');
    }

    await docRef.update(updateData);

    const updatedSnap = await docRef.get();
    return successResponse(mapToTransaction(updatedSnap.id, updatedSnap.data()!));
  });
}
