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
import { CreditLine } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';
import { UpdateCreditLineSchema } from '@/lib/validations/schemas';
import { logUpdate, logDelete } from '@/lib/audit-logger';

const COLLECTION = 'creditLines';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Mapea datos de Firestore a CreditLine
 */
function mapToCreditLine(id: string, data: FirebaseFirestore.DocumentData): CreditLine {
  return {
    id,
    userId: data.userId,
    companyId: data.companyId,
    bankName: data.bankName || '',
    alias: data.alias || '',
    creditLimit: data.creditLimit || 0,
    currentDrawn: data.currentDrawn || 0,
    available: data.available || data.creditLimit - (data.currentDrawn || 0),
    interestRate: data.interestRate || 0,
    expiryDate: data.expiryDate?.toDate?.() || new Date(),
    autoDrawThreshold: data.autoDrawThreshold || undefined,
    status: data.status || 'ACTIVE',
    lastUpdatedBy: data.lastUpdatedBy || '',
    lastUpdateDate: data.lastUpdateDate?.toDate?.() || undefined,
    createdAt: data.createdAt?.toDate?.() || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(),
  };
}

/**
 * GET /api/credit-lines/[id] - Obtener línea de crédito por ID
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
      return errorResponse('Línea de crédito no encontrada', 404, 'NOT_FOUND');
    }

    const data = docSnap.data()!;
    
    if (!verifyOwnership(data.userId, userId)) {
      return errorResponse('No tienes permiso para ver esta línea de crédito', 403, 'FORBIDDEN');
    }

    return successResponse(mapToCreditLine(docSnap.id, data));
  });
}

/**
 * PUT /api/credit-lines/[id] - Actualizar línea de crédito
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    // Validar con Zod
    const validation = await parseAndValidate(request, UpdateCreditLineSchema);
    if (!validation.success) return validation.error;
    const body = validation.data;

    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return errorResponse('Línea de crédito no encontrada', 404, 'NOT_FOUND');
    }

    const existingData = docSnap.data()!;
    
    if (!verifyOwnership(existingData.userId, userId)) {
      return errorResponse('No tienes permiso para editar esta línea de crédito', 403, 'FORBIDDEN');
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
      lastUpdateDate: now,
    };

    // Solo actualizar campos proporcionados
    if (body.companyId !== undefined) updateData.companyId = body.companyId;
    if (body.bankName !== undefined) updateData.bankName = body.bankName;
    if (body.alias !== undefined) updateData.alias = body.alias;
    if (body.creditLimit !== undefined) updateData.creditLimit = body.creditLimit;
    if (body.currentDrawn !== undefined) updateData.currentDrawn = body.currentDrawn;
    if (body.interestRate !== undefined) updateData.interestRate = body.interestRate;
    if (body.expiryDate !== undefined) {
      const expiryDate = body.expiryDate instanceof Date ? body.expiryDate : new Date(body.expiryDate);
      updateData.expiryDate = Timestamp.fromDate(expiryDate);
    }
    if (body.autoDrawThreshold !== undefined) updateData.autoDrawThreshold = body.autoDrawThreshold;
    if (body.status !== undefined) updateData.status = body.status;

    // Recalcular available si cambia creditLimit o currentDrawn
    const newLimit = body.creditLimit ?? existingData.creditLimit;
    const newDrawn = body.currentDrawn ?? existingData.currentDrawn;
    updateData.available = newLimit - newDrawn;

    await docRef.update(updateData);

    const updatedSnap = await docRef.get();
    const updatedData = updatedSnap.data()!;

    // Registrar en auditoría
    await logUpdate(userId, 'credit_line', id,
      { bankName: existingData.bankName, alias: existingData.alias, creditLimit: existingData.creditLimit, currentDrawn: existingData.currentDrawn, status: existingData.status },
      { bankName: updatedData.bankName, alias: updatedData.alias, creditLimit: updatedData.creditLimit, currentDrawn: updatedData.currentDrawn, status: updatedData.status },
      { entityName: updatedData.alias || updatedData.bankName }
    );

    return successResponse(mapToCreditLine(updatedSnap.id, updatedData));
  });
}

/**
 * DELETE /api/credit-lines/[id] - Eliminar línea de crédito (hard delete)
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
      return errorResponse('Línea de crédito no encontrada', 404, 'NOT_FOUND');
    }

    const data = docSnap.data()!;
    
    if (!verifyOwnership(data.userId, userId)) {
      return errorResponse('No tienes permiso para eliminar esta línea de crédito', 403, 'FORBIDDEN');
    }

    await docRef.delete();

    // Registrar en auditoría
    await logDelete(userId, 'credit_line', id,
      { bankName: data.bankName, alias: data.alias, creditLimit: data.creditLimit, currentDrawn: data.currentDrawn },
      { entityName: data.alias || data.bankName }
    );

    return successResponse({ deleted: true, id });
  });
}

/**
 * PATCH /api/credit-lines/[id] - Actualización rápida de saldo dispuesto (Rutina Diaria)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    const body = await request.json();
    const { currentDrawn } = body;

    if (typeof currentDrawn !== 'number') {
      return errorResponse('El saldo dispuesto debe ser un número', 400, 'INVALID_BALANCE');
    }

    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return errorResponse('Línea de crédito no encontrada', 404, 'NOT_FOUND');
    }

    const existingData = docSnap.data()!;
    
    if (!verifyOwnership(existingData.userId, userId)) {
      return errorResponse('No tienes permiso para editar esta línea de crédito', 403, 'FORBIDDEN');
    }

    const creditLimit = existingData.creditLimit || 0;
    
    if (currentDrawn > creditLimit) {
      return errorResponse('El saldo dispuesto no puede superar el límite de crédito', 400, 'EXCEEDS_LIMIT');
    }

    const now = Timestamp.now();
    const previousDrawn = existingData.currentDrawn || 0;
    const available = creditLimit - currentDrawn;
    
    await docRef.update({
      currentDrawn,
      available,
      lastUpdateDate: now,
      lastUpdatedBy: userId,
      updatedAt: now,
    });

    const updatedSnap = await docRef.get();
    const updatedData = updatedSnap.data()!;

    // Registrar en auditoría
    await logUpdate(userId, 'credit_line', id,
      { currentDrawn: previousDrawn },
      { currentDrawn },
      { entityName: updatedData.alias || updatedData.bankName }
    );

    return successResponse(mapToCreditLine(updatedSnap.id, updatedData));
  });
}
