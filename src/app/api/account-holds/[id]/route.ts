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
import { UpdateAccountHoldSchema } from '@/lib/validations/schemas';

const COLLECTION = 'account_holds';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/account-holds/[id] - Obtener una retención específica
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const db = getAdminDb();

    const docRef = await db.collection(COLLECTION).doc(id).get();

    if (!docRef.exists) {
      return errorResponse('Retención no encontrada', 404, 'NOT_FOUND');
    }

    const data = docRef.data()!;
    
    if (data.userId !== userId) {
      return errorResponse('No autorizado', 403, 'FORBIDDEN');
    }

    const hold: AccountHold = {
      id: docRef.id,
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
    };

    return successResponse(hold);
  });
}

/**
 * PUT /api/account-holds/[id] - Actualizar una retención
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    
    // Validar con Zod
    const validation = await parseAndValidate(request, UpdateAccountHoldSchema);
    if (!validation.success) return validation.error;
    const body = validation.data;

    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return errorResponse('Retención no encontrada', 404, 'NOT_FOUND');
    }

    const existingData = doc.data()!;
    
    if (existingData.userId !== userId) {
      return errorResponse('No autorizado', 403, 'FORBIDDEN');
    }

    // Construir objeto de actualización
    const updateData: Record<string, unknown> = {
      lastUpdatedBy: userId,
      updatedAt: Timestamp.now(),
    };

    if (body.concept !== undefined) updateData.concept = body.concept;
    if (body.amount !== undefined) updateData.amount = body.amount;
    if (body.startDate !== undefined) {
      updateData.startDate = Timestamp.fromDate(new Date(body.startDate));
    }
    if (body.endDate !== undefined) {
      updateData.endDate = body.endDate ? Timestamp.fromDate(new Date(body.endDate)) : null;
    }
    if (body.type !== undefined) updateData.type = body.type;
    if (body.reference !== undefined) updateData.reference = body.reference;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.status !== undefined) {
      updateData.status = body.status;
      if (body.status === 'RELEASED') {
        updateData.releasedAt = Timestamp.now();
        updateData.releasedBy = userId;
      }
    }

    await docRef.update(updateData);

    // Obtener documento actualizado
    const updatedDoc = await docRef.get();
    const data = updatedDoc.data()!;

    const hold: AccountHold = {
      id: updatedDoc.id,
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
    };

    return successResponse(hold);
  });
}

/**
 * DELETE /api/account-holds/[id] - Eliminar una retención
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return errorResponse('Retención no encontrada', 404, 'NOT_FOUND');
    }

    const data = doc.data()!;
    
    if (data.userId !== userId) {
      return errorResponse('No autorizado', 403, 'FORBIDDEN');
    }

    await docRef.delete();

    return successResponse({ deleted: true, id });
  });
}

/**
 * PATCH /api/account-holds/[id] - Liberar una retención rápidamente
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return errorResponse('Retención no encontrada', 404, 'NOT_FOUND');
    }

    const data = doc.data()!;
    
    if (data.userId !== userId) {
      return errorResponse('No autorizado', 403, 'FORBIDDEN');
    }

    // Liberar la retención
    await docRef.update({
      status: 'RELEASED',
      releasedAt: Timestamp.now(),
      releasedBy: userId,
      lastUpdatedBy: userId,
      updatedAt: Timestamp.now(),
    });

    return successResponse({ released: true, id });
  });
}
