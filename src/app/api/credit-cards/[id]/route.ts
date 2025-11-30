import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
  parseAndValidate,
} from '@/lib/api-utils';
import { CreditCard } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';
import { UpdateCreditCardSchema, CreditCardBalanceUpdateSchema } from '@/lib/validations/schemas';
import { logUpdate, logDelete } from '@/lib/audit-logger';

const COLLECTION = 'credit_cards';

/**
 * Mapea datos de Firestore a CreditCard
 */
function mapToCreditCard(id: string, data: FirebaseFirestore.DocumentData): CreditCard {
  const creditLimit = data.creditLimit || 0;
  const currentBalance = data.currentBalance || 0;
  
  return {
    id,
    userId: data.userId,
    companyId: data.companyId,
    bankName: data.bankName || '',
    cardAlias: data.cardAlias || '',
    cardNumberLast4: data.cardNumberLast4 || '****',
    cardHolder: data.cardHolder || '',
    creditLimit,
    currentBalance,
    availableCredit: creditLimit - currentBalance,
    cutoffDay: data.cutoffDay || 1,
    paymentDueDay: data.paymentDueDay || 15,
    status: data.status || 'ACTIVE',
    lastUpdatedBy: data.lastUpdatedBy || '',
    lastUpdateDate: data.lastUpdateDate?.toDate?.() || undefined,
    createdAt: data.createdAt?.toDate?.() || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(),
  };
}

/**
 * GET /api/credit-cards/[id] - Obtener tarjeta por ID
 */
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
    const doc = await db.collection(COLLECTION).doc(id).get();

    if (!doc.exists) {
      return errorResponse('Tarjeta no encontrada', 404, 'NOT_FOUND');
    }

    const data = doc.data()!;
    
    // Verificar que pertenece al usuario
    if (data.userId !== userId) {
      return errorResponse('No autorizado', 403, 'FORBIDDEN');
    }

    return successResponse(mapToCreditCard(doc.id, data));
  });
}

/**
 * PUT /api/credit-cards/[id] - Actualizar tarjeta
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    // Validar con Zod (incluye sanitización XSS)
    const validation = await parseAndValidate(request, UpdateCreditCardSchema);
    if (!validation.success) return validation.error;
    const body = validation.data;

    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return errorResponse('Tarjeta no encontrada', 404, 'NOT_FOUND');
    }

    const currentData = doc.data()!;
    
    // Verificar que pertenece al usuario
    if (currentData.userId !== userId) {
      return errorResponse('No autorizado', 403, 'FORBIDDEN');
    }

    // Si cambia companyId, verificar que la nueva empresa pertenece al usuario
    if (body.companyId && body.companyId !== currentData.companyId) {
      const companyDoc = await db.collection('companies').doc(body.companyId).get();
      if (!companyDoc.exists || companyDoc.data()?.userId !== userId) {
        return errorResponse('Empresa no válida', 400, 'INVALID_COMPANY');
      }
    }

    const now = Timestamp.now();
    
    // Calcular availableCredit si cambia creditLimit o currentBalance
    const newCreditLimit = body.creditLimit ?? currentData.creditLimit;
    const newCurrentBalance = body.currentBalance ?? currentData.currentBalance;
    
    // Validar que el saldo no exceda el límite
    if (newCurrentBalance > newCreditLimit) {
      return errorResponse('El saldo dispuesto no puede exceder el límite de crédito', 400, 'BALANCE_EXCEEDS_LIMIT');
    }

    const updateData: Record<string, unknown> = {
      ...body,
      availableCredit: newCreditLimit - newCurrentBalance,
      lastUpdatedBy: userId,
      lastUpdateDate: now,
      updatedAt: now,
    };

    // Guardar valores anteriores para auditoría
    const previousValues: Record<string, unknown> = {};
    Object.keys(body).forEach(key => {
      if (currentData[key] !== undefined) {
        previousValues[key] = currentData[key];
      }
    });

    await docRef.update(updateData);

    // Log de auditoría
    await logUpdate(userId, 'credit_card', id, body, previousValues);

    // Obtener documento actualizado
    const updatedDoc = await docRef.get();
    return successResponse(mapToCreditCard(updatedDoc.id, updatedDoc.data()!));
  });
}

/**
 * PATCH /api/credit-cards/[id] - Actualizar saldo de tarjeta (uso en Rutina Diaria)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    // Validar con Zod
    const validation = await parseAndValidate(request, CreditCardBalanceUpdateSchema);
    if (!validation.success) return validation.error;
    const { currentBalance } = validation.data;

    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return errorResponse('Tarjeta no encontrada', 404, 'NOT_FOUND');
    }

    const currentData = doc.data()!;
    
    // Verificar que pertenece al usuario
    if (currentData.userId !== userId) {
      return errorResponse('No autorizado', 403, 'FORBIDDEN');
    }

    // Validar que el nuevo saldo no exceda el límite
    if (currentBalance > currentData.creditLimit) {
      return errorResponse('El saldo dispuesto no puede exceder el límite de crédito', 400, 'BALANCE_EXCEEDS_LIMIT');
    }

    const now = Timestamp.now();
    const previousBalance = currentData.currentBalance;
    const availableCredit = currentData.creditLimit - currentBalance;

    await docRef.update({
      currentBalance,
      availableCredit,
      lastUpdatedBy: userId,
      lastUpdateDate: now,
      updatedAt: now,
    });

    // Log de auditoría
    await logUpdate(userId, 'credit_card', id, 
      { currentBalance, availableCredit },
      { currentBalance: previousBalance, availableCredit: currentData.availableCredit }
    );

    // Obtener documento actualizado
    const updatedDoc = await docRef.get();
    return successResponse(mapToCreditCard(updatedDoc.id, updatedDoc.data()!));
  });
}

/**
 * DELETE /api/credit-cards/[id] - Eliminar tarjeta
 */
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
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return errorResponse('Tarjeta no encontrada', 404, 'NOT_FOUND');
    }

    const data = doc.data()!;
    
    // Verificar que pertenece al usuario
    if (data.userId !== userId) {
      return errorResponse('No autorizado', 403, 'FORBIDDEN');
    }

    // Log de auditoría antes de eliminar
    await logDelete(userId, 'credit_card', id, {
      bankName: data.bankName,
      cardAlias: data.cardAlias,
      cardNumberLast4: data.cardNumberLast4,
      companyId: data.companyId,
    });

    await docRef.delete();

    return successResponse({ deleted: true, id });
  });
}
