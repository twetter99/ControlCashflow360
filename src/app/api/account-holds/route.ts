import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
  parseAndValidate,
} from '@/lib/api-utils';
import { AccountHold } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';
import { CreateAccountHoldSchema, UpdateAccountHoldSchema } from '@/lib/validations/schemas';

const COLLECTION = 'account_holds';

/**
 * GET /api/account-holds - Obtener retenciones del usuario
 * Query params:
 *   - accountId: filtrar por cuenta específica
 *   - status: filtrar por estado (ACTIVE, RELEASED, EXPIRED)
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const status = searchParams.get('status');

    // Query base por userId
    let queryRef = db.collection(COLLECTION).where('userId', '==', userId);
    
    if (accountId) {
      queryRef = queryRef.where('accountId', '==', accountId);
    }
    
    if (status) {
      queryRef = queryRef.where('status', '==', status);
    }

    const snapshot = await queryRef.get();

    const holds: AccountHold[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        companyId: data.companyId,
        accountId: data.accountId,
        concept: data.concept || '',
        amount: data.amount || 0,
        startDate: data.startDate?.toDate?.() || new Date(),
        endDate: data.endDate?.toDate?.() || null,
        type: data.type || 'OTHER',
        status: data.status || 'ACTIVE',
        reference: data.reference,
        notes: data.notes,
        createdBy: data.createdBy,
        lastUpdatedBy: data.lastUpdatedBy,
        releasedAt: data.releasedAt?.toDate?.(),
        releasedBy: data.releasedBy,
        createdAt: data.createdAt?.toDate?.() || new Date(),
        updatedAt: data.updatedAt?.toDate?.() || new Date(),
      } as AccountHold;
    });

    // Ordenar por fecha de inicio descendente
    holds.sort((a, b) => 
      new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );

    return successResponse(holds);
  });
}

/**
 * POST /api/account-holds - Crear nueva retención
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    // Validar con Zod
    const validation = await parseAndValidate(request, CreateAccountHoldSchema);
    if (!validation.success) return validation.error;
    const body = validation.data;

    const db = getAdminDb();

    // Verificar que la cuenta existe y pertenece al usuario
    const accountDoc = await db.collection('accounts').doc(body.accountId).get();
    if (!accountDoc.exists || accountDoc.data()?.userId !== userId) {
      return errorResponse('Cuenta no válida', 400, 'INVALID_ACCOUNT');
    }

    // Verificar que la empresa pertenece al usuario
    const companyDoc = await db.collection('companies').doc(body.companyId).get();
    if (!companyDoc.exists || companyDoc.data()?.userId !== userId) {
      return errorResponse('Empresa no válida', 400, 'INVALID_COMPANY');
    }

    const now = Timestamp.now();
    const holdData = {
      userId,
      companyId: body.companyId,
      accountId: body.accountId,
      concept: body.concept,
      amount: body.amount,
      startDate: Timestamp.fromDate(new Date(body.startDate)),
      endDate: body.endDate ? Timestamp.fromDate(new Date(body.endDate)) : null,
      type: body.type,
      status: 'ACTIVE',
      reference: body.reference || null,
      notes: body.notes || null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection(COLLECTION).add(holdData);

    const newHold: AccountHold = {
      id: docRef.id,
      userId,
      companyId: body.companyId,
      accountId: body.accountId,
      concept: body.concept,
      amount: body.amount,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      type: body.type,
      status: 'ACTIVE',
      reference: body.reference,
      notes: body.notes,
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return successResponse(newHold, 201);
  });
}
