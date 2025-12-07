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
import { Loan } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';
import { UpdateLoanSchema } from '@/lib/validations/schemas';
import { logUpdate, logDelete } from '@/lib/audit-logger';

const COLLECTION = 'loans';
const TRANSACTIONS_COLLECTION = 'transactions';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Mapea datos de Firestore a Loan
 */
function mapToLoan(id: string, data: FirebaseFirestore.DocumentData): Loan {
  return {
    id,
    userId: data.userId,
    companyId: data.companyId,
    bankName: data.bankName || '',
    alias: data.alias || '',
    originalPrincipal: data.originalPrincipal || 0,
    interestRate: data.interestRate || 0,
    monthlyPayment: data.monthlyPayment || 0,
    paymentDay: data.paymentDay || 1,
    chargeAccountId: data.chargeAccountId || undefined,
    remainingBalance: data.remainingBalance || 0,
    remainingInstallments: data.remainingInstallments || 0,
    firstPendingDate: data.firstPendingDate?.toDate?.() || new Date(),
    endDate: data.endDate?.toDate?.() || new Date(),
    paidInstallments: data.paidInstallments || 0,
    status: data.status || 'ACTIVE',
    notes: data.notes || '',
    createdBy: data.createdBy || '',
    lastUpdatedBy: data.lastUpdatedBy || '',
    createdAt: data.createdAt?.toDate?.() || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(),
  };
}

/**
 * GET /api/loans/[id] - Obtener préstamo por ID
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
      return errorResponse('Préstamo no encontrado', 404, 'NOT_FOUND');
    }

    const data = docSnap.data()!;
    
    if (!verifyOwnership(data.userId, userId)) {
      return errorResponse('No tienes permiso para ver este préstamo', 403, 'FORBIDDEN');
    }

    // También obtener las transacciones asociadas para info adicional
    const txSnapshot = await db.collection(TRANSACTIONS_COLLECTION)
      .where('userId', '==', userId)
      .where('loanId', '==', id)
      .get();

    const paidInstallments = txSnapshot.docs.filter(doc => doc.data().status === 'PAID').length;

    return successResponse({
      ...mapToLoan(docSnap.id, data),
      paidInstallments,
      installmentsCount: txSnapshot.docs.length,
    });
  });
}

/**
 * PUT /api/loans/[id] - Actualizar préstamo
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    // Validar con Zod
    const validation = await parseAndValidate(request, UpdateLoanSchema);
    if (!validation.success) return validation.error;
    const body = validation.data;

    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return errorResponse('Préstamo no encontrado', 404, 'NOT_FOUND');
    }

    const existingData = docSnap.data()!;
    
    if (!verifyOwnership(existingData.userId, userId)) {
      return errorResponse('No tienes permiso para editar este préstamo', 403, 'FORBIDDEN');
    }

    // Si cambia la empresa, verificar que pertenece al usuario
    if (body.companyId && body.companyId !== existingData.companyId) {
      const companyDoc = await db.collection('companies').doc(body.companyId).get();
      if (!companyDoc.exists || companyDoc.data()?.userId !== userId) {
        return errorResponse('Empresa no válida', 400, 'INVALID_COMPANY');
      }
    }

    // Si cambia la cuenta, verificar que pertenece al usuario
    if (body.chargeAccountId && body.chargeAccountId !== existingData.chargeAccountId) {
      const accountDoc = await db.collection('accounts').doc(body.chargeAccountId).get();
      if (!accountDoc.exists || accountDoc.data()?.userId !== userId) {
        return errorResponse('Cuenta bancaria no válida', 400, 'INVALID_ACCOUNT');
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
    if (body.originalPrincipal !== undefined) updateData.originalPrincipal = body.originalPrincipal;
    if (body.interestRate !== undefined) updateData.interestRate = body.interestRate;
    if (body.monthlyPayment !== undefined) updateData.monthlyPayment = body.monthlyPayment;
    if (body.paymentDay !== undefined) updateData.paymentDay = body.paymentDay;
    if (body.chargeAccountId !== undefined) updateData.chargeAccountId = body.chargeAccountId;
    if (body.remainingBalance !== undefined) updateData.remainingBalance = body.remainingBalance;
    if (body.remainingInstallments !== undefined) updateData.remainingInstallments = body.remainingInstallments;
    if (body.firstPendingDate !== undefined) {
      const firstPendingDate = body.firstPendingDate instanceof Date ? body.firstPendingDate : new Date(body.firstPendingDate);
      updateData.firstPendingDate = Timestamp.fromDate(firstPendingDate);
    }
    if (body.endDate !== undefined) {
      const endDate = body.endDate instanceof Date ? body.endDate : new Date(body.endDate);
      updateData.endDate = Timestamp.fromDate(endDate);
    }
    if (body.paidInstallments !== undefined) updateData.paidInstallments = body.paidInstallments;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.notes !== undefined) updateData.notes = body.notes;

    await docRef.update(updateData);

    const updatedSnap = await docRef.get();
    const updatedData = updatedSnap.data()!;

    // Registrar en auditoría
    await logUpdate(userId, 'loan', id,
      { bankName: existingData.bankName, alias: existingData.alias, status: existingData.status },
      { bankName: updatedData.bankName, alias: updatedData.alias, status: updatedData.status },
      { entityName: updatedData.alias || updatedData.bankName }
    );

    return successResponse(mapToLoan(updatedSnap.id, updatedData));
  });
}

/**
 * DELETE /api/loans/[id] - Eliminar préstamo y sus cuotas
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
      return errorResponse('Préstamo no encontrado', 404, 'NOT_FOUND');
    }

    const data = docSnap.data()!;
    
    if (!verifyOwnership(data.userId, userId)) {
      return errorResponse('No tienes permiso para eliminar este préstamo', 403, 'FORBIDDEN');
    }

    // Verificar si hay cuotas pagadas
    const txSnapshot = await db.collection(TRANSACTIONS_COLLECTION)
      .where('userId', '==', userId)
      .where('loanId', '==', id)
      .get();

    const paidInstallments = txSnapshot.docs.filter(doc => doc.data().status === 'PAID');
    
    if (paidInstallments.length > 0) {
      return errorResponse(
        `No se puede eliminar el préstamo porque tiene ${paidInstallments.length} cuotas pagadas. Puedes marcarlo como cancelado en su lugar.`,
        400,
        'HAS_PAID_INSTALLMENTS'
      );
    }

    // Eliminar todas las transacciones pendientes asociadas
    const batch = db.batch();
    
    for (const txDoc of txSnapshot.docs) {
      batch.delete(txDoc.ref);
    }
    
    // Eliminar el préstamo
    batch.delete(docRef);
    
    await batch.commit();

    // Registrar en auditoría
    await logDelete(userId, 'loan', id, {
      bankName: data.bankName,
      alias: data.alias,
      originalPrincipal: data.originalPrincipal,
      remainingBalance: data.remainingBalance,
      transactionsDeleted: txSnapshot.docs.length,
    }, { entityName: data.alias || data.bankName });

    return successResponse({ 
      success: true, 
      message: 'Préstamo eliminado correctamente',
      transactionsDeleted: txSnapshot.docs.length,
    });
  });
}
