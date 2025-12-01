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
import { Account } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';
import { UpdateAccountSchema } from '@/lib/validations/schemas';
import { logUpdate, logDelete } from '@/lib/audit-logger';

const COLLECTION = 'accounts';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Mapea datos de Firestore a Account
 */
function mapToAccount(id: string, data: FirebaseFirestore.DocumentData): Account {
  return {
    id,
    userId: data.userId,
    companyId: data.companyId,
    bankName: data.bankName || '',
    alias: data.alias || '',
    accountNumber: data.accountNumber || '',
    currentBalance: data.currentBalance || 0,
    lastUpdateAmount: data.lastUpdateAmount || 0,
    lastUpdateDate: data.lastUpdateDate?.toDate?.() || new Date(),
    lastUpdatedBy: data.lastUpdatedBy || '',
    status: data.status || 'ACTIVE',
    isPrimary: data.isPrimary || false,
    createdAt: data.createdAt?.toDate?.() || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(),
  };
}

/**
 * GET /api/accounts/[id] - Obtener cuenta por ID
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
      return errorResponse('Cuenta no encontrada', 404, 'NOT_FOUND');
    }

    const data = docSnap.data()!;
    
    if (!verifyOwnership(data.userId, userId)) {
      return errorResponse('No tienes permiso para ver esta cuenta', 403, 'FORBIDDEN');
    }

    return successResponse(mapToAccount(docSnap.id, data));
  });
}

/**
 * PUT /api/accounts/[id] - Actualizar cuenta
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    // Validar con Zod
    const validation = await parseAndValidate(request, UpdateAccountSchema);
    if (!validation.success) return validation.error;
    const body = validation.data;

    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return errorResponse('Cuenta no encontrada', 404, 'NOT_FOUND');
    }

    const existingData = docSnap.data()!;
    
    if (!verifyOwnership(existingData.userId, userId)) {
      return errorResponse('No tienes permiso para editar esta cuenta', 403, 'FORBIDDEN');
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
    if (body.companyId !== undefined) updateData.companyId = body.companyId;
    if (body.bankName !== undefined) updateData.bankName = body.bankName;
    if (body.alias !== undefined) updateData.alias = body.alias;
    if (body.accountNumber !== undefined) updateData.accountNumber = body.accountNumber;
    if (body.currentBalance !== undefined) {
      updateData.currentBalance = body.currentBalance;
      updateData.lastUpdateAmount = body.currentBalance - (existingData.currentBalance || 0);
      updateData.lastUpdateDate = now;
    }
    if (body.status !== undefined) updateData.status = body.status;
    if (body.isPrimary !== undefined) updateData.isPrimary = body.isPrimary;

    await docRef.update(updateData);

    const updatedSnap = await docRef.get();
    const updatedData = updatedSnap.data()!;

    // Registrar en auditoría
    await logUpdate(userId, 'account', id,
      { bankName: existingData.bankName, alias: existingData.alias, currentBalance: existingData.currentBalance, status: existingData.status },
      { bankName: updatedData.bankName, alias: updatedData.alias, currentBalance: updatedData.currentBalance, status: updatedData.status },
      { entityName: updatedData.alias || updatedData.bankName }
    );

    return successResponse(mapToAccount(updatedSnap.id, updatedData));
  });
}

/**
 * DELETE /api/accounts/[id] - Eliminar cuenta (hard delete)
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
      return errorResponse('Cuenta no encontrada', 404, 'NOT_FOUND');
    }

    const data = docSnap.data()!;
    
    if (!verifyOwnership(data.userId, userId)) {
      return errorResponse('No tienes permiso para eliminar esta cuenta', 403, 'FORBIDDEN');
    }

    // Verificar que no tenga transacciones asociadas
    const transactionsSnap = await db
      .collection('transactions')
      .where('accountId', '==', id)
      .limit(1)
      .get();

    if (!transactionsSnap.empty) {
      return errorResponse(
        'No se puede eliminar una cuenta con transacciones asociadas',
        400,
        'HAS_DEPENDENCIES'
      );
    }

    await docRef.delete();

    // Registrar en auditoría
    await logDelete(userId, 'account', id,
      { bankName: data.bankName, alias: data.alias, accountNumber: data.accountNumber, currentBalance: data.currentBalance },
      { entityName: data.alias || data.bankName }
    );

    return successResponse({ deleted: true, id });
  });
}

/**
 * PATCH /api/accounts/[id] - Actualización rápida de saldo (Rutina Diaria)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    const body = await request.json();
    const { currentBalance } = body;

    if (typeof currentBalance !== 'number') {
      return errorResponse('El saldo debe ser un número', 400, 'INVALID_BALANCE');
    }

    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return errorResponse('Cuenta no encontrada', 404, 'NOT_FOUND');
    }

    const existingData = docSnap.data()!;
    
    if (!verifyOwnership(existingData.userId, userId)) {
      return errorResponse('No tienes permiso para editar esta cuenta', 403, 'FORBIDDEN');
    }

    const now = Timestamp.now();
    const previousBalance = existingData.currentBalance || 0;
    
    await docRef.update({
      currentBalance,
      lastUpdateAmount: currentBalance - previousBalance,
      lastUpdateDate: now,
      lastUpdatedBy: userId,
      updatedAt: now,
    });

    const updatedSnap = await docRef.get();
    const updatedData = updatedSnap.data()!;

    // Registrar en auditoría
    await logUpdate(userId, 'account', id,
      { currentBalance: previousBalance },
      { currentBalance },
      { entityName: updatedData.alias || updatedData.bankName }
    );

    return successResponse(mapToAccount(updatedSnap.id, updatedData));
  });
}
