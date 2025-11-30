import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
  parseAndValidate,
} from '@/lib/api-utils';
import { Account } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';
import { CreateAccountSchema } from '@/lib/validations/schemas';
import { logCreate } from '@/lib/audit-logger';

const COLLECTION = 'accounts';

/**
 * GET /api/accounts - Obtener todas las cuentas del usuario
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
    const includeInactive = searchParams.get('includeInactive') === 'true';

    // Query simple sin orderBy para evitar índices compuestos
    const snapshot = await db.collection(COLLECTION).where('userId', '==', userId).get();

    let accounts: Account[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
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
        createdAt: data.createdAt?.toDate?.() || new Date(),
        updatedAt: data.updatedAt?.toDate?.() || new Date(),
      } as Account;
    });

    // Filtrar por companyId si es necesario
    if (companyId) {
      accounts = accounts.filter(a => a.companyId === companyId);
    }

    // Filtrar por status si es necesario
    if (!includeInactive) {
      accounts = accounts.filter(a => a.status === 'ACTIVE');
    }

    // Ordenar en memoria por createdAt desc
    accounts.sort((a, b) => new Date(b.createdAt || new Date()).getTime() - new Date(a.createdAt || new Date()).getTime());

    return successResponse(accounts);
  });
}

/**
 * POST /api/accounts - Crear nueva cuenta
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    // Validar con Zod
    const validation = await parseAndValidate(request, CreateAccountSchema);
    if (!validation.success) return validation.error;
    const body = validation.data;

    const db = getAdminDb();

    // Verificar que la empresa pertenece al usuario
    const companyDoc = await db.collection('companies').doc(body.companyId).get();
    if (!companyDoc.exists || companyDoc.data()?.userId !== userId) {
      return errorResponse('Empresa no válida', 400, 'INVALID_COMPANY');
    }
    
    const now = Timestamp.now();
    const accountData = {
      companyId: body.companyId,
      bankName: body.bankName,
      alias: body.alias,
      accountNumber: body.accountNumber,
      currentBalance: body.currentBalance,
      lastUpdateAmount: body.lastUpdateAmount,
      lastUpdatedBy: userId,
      status: body.status,
      userId,
      createdAt: now,
      updatedAt: now,
      lastUpdateDate: now,
    };

    const docRef = await db.collection(COLLECTION).add(accountData);
    
    const newAccount: Account = {
      id: docRef.id,
      userId,
      companyId: accountData.companyId,
      bankName: accountData.bankName,
      alias: accountData.alias,
      accountNumber: accountData.accountNumber,
      currentBalance: accountData.currentBalance,
      lastUpdateAmount: accountData.lastUpdateAmount,
      lastUpdateDate: now.toDate(),
      lastUpdatedBy: accountData.lastUpdatedBy,
      status: accountData.status,
      createdAt: now.toDate(),
      updatedAt: now.toDate(),
    };

    // Registrar en auditoría
    await logCreate(userId, 'account', docRef.id, {
      bankName: newAccount.bankName,
      alias: newAccount.alias,
      currentBalance: newAccount.currentBalance,
      companyId: newAccount.companyId,
    }, { entityName: newAccount.alias || newAccount.bankName });

    return successResponse(newAccount, 201);
  });
}
