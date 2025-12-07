import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
  parseAndValidate,
} from '@/lib/api-utils';
import { Loan } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';
import { CreateLoanSchema } from '@/lib/validations/schemas';
import { logCreate } from '@/lib/audit-logger';
import { generateLoanInstallments, calculateEndDate } from '@/lib/loan-generator';

const COLLECTION = 'loans';
const TRANSACTIONS_COLLECTION = 'transactions';

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
 * GET /api/loans - Obtener todos los préstamos del usuario
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    
    // Filtros opcionales
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const status = searchParams.get('status');

    // Query simple sin orderBy para evitar índices compuestos
    const snapshot = await db.collection(COLLECTION).where('userId', '==', userId).get();

    let loans: Loan[] = snapshot.docs.map((doc) => 
      mapToLoan(doc.id, doc.data())
    );

    // Filtrar por companyId si es necesario
    if (companyId) {
      loans = loans.filter(l => l.companyId === companyId);
    }

    // Filtrar por status si es necesario
    if (status) {
      loans = loans.filter(l => l.status === status);
    }

    // Ordenar en memoria por createdAt desc
    loans.sort((a, b) => new Date(b.createdAt || new Date()).getTime() - new Date(a.createdAt || new Date()).getTime());

    return successResponse(loans);
  });
}

/**
 * POST /api/loans - Crear nuevo préstamo y generar cuotas
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    // Validar con Zod
    const validation = await parseAndValidate(request, CreateLoanSchema);
    if (!validation.success) return validation.error;
    const body = validation.data;

    const db = getAdminDb();

    // Verificar que la empresa pertenece al usuario
    const companyDoc = await db.collection('companies').doc(body.companyId).get();
    if (!companyDoc.exists || companyDoc.data()?.userId !== userId) {
      return errorResponse('Empresa no válida', 400, 'INVALID_COMPANY');
    }

    // Verificar cuenta de cargo si se proporciona
    if (body.chargeAccountId) {
      const accountDoc = await db.collection('accounts').doc(body.chargeAccountId).get();
      if (!accountDoc.exists || accountDoc.data()?.userId !== userId) {
        return errorResponse('Cuenta bancaria no válida', 400, 'INVALID_ACCOUNT');
      }
    }
    
    const now = Timestamp.now();
    const firstPendingDate = body.firstPendingDate instanceof Date ? body.firstPendingDate : new Date(body.firstPendingDate);
    
    // Calcular fecha de vencimiento final
    const endDate = calculateEndDate(firstPendingDate, body.remainingInstallments, body.paymentDay);
    
    const loanData = {
      companyId: body.companyId,
      bankName: body.bankName,
      alias: body.alias || '',
      originalPrincipal: body.originalPrincipal || 0,
      interestRate: body.interestRate,
      monthlyPayment: body.monthlyPayment,
      paymentDay: body.paymentDay,
      chargeAccountId: body.chargeAccountId || undefined,
      remainingBalance: body.remainingBalance,
      remainingInstallments: body.remainingInstallments,
      firstPendingDate: Timestamp.fromDate(firstPendingDate),
      endDate: Timestamp.fromDate(endDate),
      paidInstallments: 0,
      status: body.status,
      notes: body.notes || '',
      createdBy: userId,
      lastUpdatedBy: userId,
      userId,
      createdAt: now,
      updatedAt: now,
    };

    // Crear el préstamo
    const docRef = await db.collection(COLLECTION).add(loanData);
    const loanId = docRef.id;

    // Generar las cuotas como transacciones
    const loan: Loan = {
      id: loanId,
      ...loanData,
      firstPendingDate,
      endDate,
      createdAt: now.toDate(),
      updatedAt: now.toDate(),
    };

    const installments = generateLoanInstallments(loan, userId);
    
    // Crear las transacciones en batch
    const batch = db.batch();
    const transactionIds: string[] = [];
    
    for (const installment of installments) {
      const txRef = db.collection(TRANSACTIONS_COLLECTION).doc();
      transactionIds.push(txRef.id);
      
      batch.set(txRef, {
        ...installment,
        dueDate: Timestamp.fromDate(installment.dueDate as Date),
        userId,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    }
    
    await batch.commit();

    // Registrar en auditoría
    await logCreate(userId, 'loan', loanId, {
      bankName: body.bankName,
      alias: body.alias,
      originalPrincipal: body.originalPrincipal,
      remainingBalance: body.remainingBalance,
      monthlyPayment: body.monthlyPayment,
      remainingInstallments: body.remainingInstallments,
      transactionsGenerated: installments.length,
    }, { entityName: body.alias || body.bankName });

    return successResponse({
      loan: mapToLoan(loanId, {
        ...loanData,
        firstPendingDate: { toDate: () => firstPendingDate },
        endDate: { toDate: () => endDate },
        createdAt: { toDate: () => now.toDate() },
        updatedAt: { toDate: () => now.toDate() },
      }),
      transactionsCreated: transactionIds.length,
    }, 201);
  });
}
