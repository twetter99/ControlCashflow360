import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
  parseAndValidate,
} from '@/lib/api-utils';
import { Recurrence } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';
import { UpdateRecurrenceSchema } from '@/lib/validations/schemas';
import { logUpdate, logDelete } from '@/lib/audit-logger';
import { 
  generateTransactionsFromRecurrence,
  deleteFutureOccurrences,
  getFirstOccurrenceDate,
} from '@/lib/recurrence-generator';

const COLLECTION = 'recurrences';

/**
 * Mapea datos de Firestore a Recurrence
 */
function mapToRecurrence(id: string, data: FirebaseFirestore.DocumentData): Recurrence {
  return {
    id,
    userId: data.userId,
    companyId: data.companyId,
    type: data.type,
    name: data.name,
    baseAmount: data.baseAmount || 0,
    category: data.category || '',
    thirdPartyId: data.thirdPartyId || undefined,
    thirdPartyName: data.thirdPartyName || '',
    accountId: data.accountId || undefined,
    certainty: data.certainty || 'HIGH',
    notes: data.notes || '',
    frequency: data.frequency,
    dayOfMonth: data.dayOfMonth,
    dayOfWeek: data.dayOfWeek,
    startDate: data.startDate?.toDate?.() || new Date(),
    endDate: data.endDate?.toDate?.() || null,
    generateMonthsAhead: data.generateMonthsAhead || 6,
    lastGeneratedDate: data.lastGeneratedDate?.toDate?.() || undefined,
    nextOccurrenceDate: data.nextOccurrenceDate?.toDate?.() || undefined,
    status: data.status || 'ACTIVE',
    createdBy: data.createdBy || '',
    lastUpdatedBy: data.lastUpdatedBy || '',
    createdAt: data.createdAt?.toDate?.() || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(),
  };
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/recurrences/[id] - Obtener una recurrencia específica
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const db = getAdminDb();
    
    const doc = await db.collection(COLLECTION).doc(id).get();
    
    if (!doc.exists) {
      return errorResponse('Recurrencia no encontrada', 404, 'NOT_FOUND');
    }
    
    const data = doc.data()!;
    if (data.userId !== userId) {
      return errorResponse('No tienes permisos para ver esta recurrencia', 403, 'FORBIDDEN');
    }

    return successResponse(mapToRecurrence(doc.id, data));
  });
}

/**
 * PUT /api/recurrences/[id] - Actualizar recurrencia
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    
    // Validar con Zod
    const validation = await parseAndValidate(request, UpdateRecurrenceSchema);
    if (!validation.success) return validation.error;
    const body = validation.data;

    const db = getAdminDb();
    
    // Verificar que existe y pertenece al usuario
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return errorResponse('Recurrencia no encontrada', 404, 'NOT_FOUND');
    }
    
    const existingData = doc.data()!;
    if (existingData.userId !== userId) {
      return errorResponse('No tienes permisos para editar esta recurrencia', 403, 'FORBIDDEN');
    }

    // Verificar empresa si se cambia
    if (body.companyId && body.companyId !== existingData.companyId) {
      const companyDoc = await db.collection('companies').doc(body.companyId).get();
      if (!companyDoc.exists || companyDoc.data()?.userId !== userId) {
        return errorResponse('Empresa no válida', 400, 'INVALID_COMPANY');
      }
    }

    // Verificar cuenta si se proporciona
    if (body.accountId) {
      const accountDoc = await db.collection('accounts').doc(body.accountId).get();
      if (!accountDoc.exists || accountDoc.data()?.userId !== userId) {
        return errorResponse('Cuenta no válida', 400, 'INVALID_ACCOUNT');
      }
    }
    
    const now = Timestamp.now();
    
    // Construir objeto de actualización
    const updateData: Record<string, unknown> = {
      lastUpdatedBy: userId,
      updatedAt: now,
    };
    
    // Copiar campos validados
    const fieldsToUpdate = [
      'companyId', 'type', 'name', 'baseAmount', 'category',
      'thirdPartyId', 'thirdPartyName', 'accountId', 'certainty', 'notes',
      'frequency', 'dayOfMonth', 'dayOfWeek', 'generateMonthsAhead', 'status',
    ];
    
    for (const field of fieldsToUpdate) {
      if (body[field as keyof typeof body] !== undefined) {
        updateData[field] = body[field as keyof typeof body];
      }
    }
    
    // Manejar fechas
    if (body.startDate) {
      updateData.startDate = Timestamp.fromDate(
        body.startDate instanceof Date ? body.startDate : new Date(body.startDate)
      );
    }
    if (body.endDate !== undefined) {
      updateData.endDate = body.endDate 
        ? Timestamp.fromDate(body.endDate instanceof Date ? body.endDate : new Date(body.endDate))
        : null;
    }

    // Detectar si hay cambios que requieren regenerar transacciones
    const regenerateFields = ['frequency', 'dayOfMonth', 'dayOfWeek', 'startDate', 'baseAmount', 'generateMonthsAhead'];
    const needsRegeneration = regenerateFields.some(field => 
      body[field as keyof typeof body] !== undefined && 
      body[field as keyof typeof body] !== existingData[field]
    );

    // Si el status cambia a ENDED o PAUSED, eliminar transacciones futuras pendientes
    let deletedCount = 0;
    if (body.status && ['ENDED', 'PAUSED'].includes(body.status) && existingData.status === 'ACTIVE') {
      deletedCount = await deleteFutureOccurrences(id, userId);
    }

    // Actualizar documento
    await docRef.update(updateData);
    
    // Regenerar transacciones si es necesario y está activa
    let generationResult = null;
    const finalStatus = body.status || existingData.status;
    if (needsRegeneration && finalStatus === 'ACTIVE') {
      // Eliminar transacciones futuras pendientes primero
      await deleteFutureOccurrences(id, userId);
      
      // Obtener datos actualizados
      const updatedDoc = await docRef.get();
      const updatedRecurrence = mapToRecurrence(id, updatedDoc.data()!);
      
      // Regenerar
      generationResult = await generateTransactionsFromRecurrence(updatedRecurrence, userId);
    }

    // Registrar en auditoría
    await logUpdate(userId, 'recurrence', id, 
      { /* valores anteriores no disponibles */ }, 
      {
        ...body,
        regenerated: needsRegeneration,
        deletedTransactions: deletedCount,
        generatedTransactions: generationResult?.generatedCount || 0,
      }, 
      { entityName: existingData.name }
    );
    
    // Obtener datos actualizados
    const finalDoc = await docRef.get();

    return successResponse({
      recurrence: mapToRecurrence(id, finalDoc.data()!),
      regenerated: needsRegeneration,
      deletedTransactions: deletedCount,
      generatedTransactions: generationResult?.generatedCount || 0,
    });
  });
}

/**
 * DELETE /api/recurrences/[id] - Eliminar recurrencia
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;
    const db = getAdminDb();
    
    // Verificar que existe y pertenece al usuario
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return errorResponse('Recurrencia no encontrada', 404, 'NOT_FOUND');
    }
    
    const data = doc.data()!;
    if (data.userId !== userId) {
      return errorResponse('No tienes permisos para eliminar esta recurrencia', 403, 'FORBIDDEN');
    }

    // Obtener parámetro para decidir qué hacer con transacciones
    const { searchParams } = new URL(request.url);
    const deleteTransactions = searchParams.get('deleteTransactions') === 'true';
    const deletePendingOnly = searchParams.get('deletePendingOnly') !== 'false'; // Por defecto solo pending

    let deletedTransactionsCount = 0;

    if (deleteTransactions) {
      // Eliminar transacciones asociadas
      const transactionsQuery = db.collection('transactions')
        .where('recurrenceId', '==', id)
        .where('userId', '==', userId);
      
      const transactionsSnapshot = await transactionsQuery.get();
      const batch = db.batch();
      
      for (const txDoc of transactionsSnapshot.docs) {
        const txData = txDoc.data();
        // Si deletePendingOnly, solo eliminar las pendientes
        if (!deletePendingOnly || txData.status === 'PENDING') {
          batch.delete(txDoc.ref);
          deletedTransactionsCount++;
        }
      }
      
      if (deletedTransactionsCount > 0) {
        await batch.commit();
      }
    } else {
      // Si no eliminamos, desvinculamos las transacciones
      const transactionsQuery = db.collection('transactions')
        .where('recurrenceId', '==', id)
        .where('userId', '==', userId);
      
      const transactionsSnapshot = await transactionsQuery.get();
      const batch = db.batch();
      
      for (const txDoc of transactionsSnapshot.docs) {
        batch.update(txDoc.ref, { 
          recurrenceId: null,
          isRecurrenceInstance: false,
        });
      }
      
      if (!transactionsSnapshot.empty) {
        await batch.commit();
      }
    }

    // Eliminar la recurrencia
    await docRef.delete();

    // Registrar en auditoría
    await logDelete(userId, 'recurrence', id, {
      name: data.name,
      deletedTransactions: deletedTransactionsCount,
    }, { entityName: data.name });

    return successResponse({
      deleted: true,
      deletedTransactionsCount,
    });
  });
}
