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
import { CreateRecurrenceSchema } from '@/lib/validations/schemas';
import { logCreate } from '@/lib/audit-logger';
import { 
  generateTransactionsFromRecurrence,
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

/**
 * GET /api/recurrences - Obtener todas las recurrencias del usuario
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
    const type = searchParams.get('type');

    const snapshot = await db.collection(COLLECTION)
      .where('userId', '==', userId)
      .get();

    let recurrences: Recurrence[] = snapshot.docs.map((doc) => 
      mapToRecurrence(doc.id, doc.data())
    );

    // Filtrar en memoria
    if (companyId) {
      recurrences = recurrences.filter(r => r.companyId === companyId);
    }
    if (status) {
      recurrences = recurrences.filter(r => r.status === status);
    }
    if (type) {
      recurrences = recurrences.filter(r => r.type === type);
    }

    // Ordenar por nombre
    recurrences.sort((a, b) => a.name.localeCompare(b.name));

    return successResponse(recurrences);
  });
}

/**
 * POST /api/recurrences - Crear nueva recurrencia y generar transacciones
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    // Validar con Zod
    const validation = await parseAndValidate(request, CreateRecurrenceSchema);
    if (!validation.success) return validation.error;
    const body = validation.data;

    const db = getAdminDb();

    // Verificar que la empresa pertenece al usuario
    const companyDoc = await db.collection('companies').doc(body.companyId).get();
    if (!companyDoc.exists || companyDoc.data()?.userId !== userId) {
      return errorResponse('Empresa no válida', 400, 'INVALID_COMPANY');
    }

    // Verificar cuenta si se proporciona
    if (body.accountId) {
      const accountDoc = await db.collection('accounts').doc(body.accountId).get();
      if (!accountDoc.exists || accountDoc.data()?.userId !== userId) {
        return errorResponse('Cuenta no válida', 400, 'INVALID_ACCOUNT');
      }
    }
    
    const now = Timestamp.now();
    const startDate = body.startDate instanceof Date ? body.startDate : new Date(body.startDate);
    const endDate = body.endDate 
      ? (body.endDate instanceof Date ? body.endDate : new Date(body.endDate))
      : null;
    
    // Calcular primera fecha de ocurrencia
    const firstOccurrence = getFirstOccurrenceDate(
      startDate,
      body.frequency,
      body.dayOfMonth,
      body.dayOfWeek
    );
    
    const recurrenceData = {
      userId,
      companyId: body.companyId,
      type: body.type,
      name: body.name,
      baseAmount: body.baseAmount,
      category: body.category,
      thirdPartyId: body.thirdPartyId || null,
      thirdPartyName: body.thirdPartyName,
      accountId: body.accountId || null,
      certainty: body.certainty,
      notes: body.notes,
      frequency: body.frequency,
      dayOfMonth: body.dayOfMonth || null,
      dayOfWeek: body.dayOfWeek ?? null,
      startDate: Timestamp.fromDate(startDate),
      endDate: endDate ? Timestamp.fromDate(endDate) : null,
      generateMonthsAhead: body.generateMonthsAhead,
      lastGeneratedDate: null,
      nextOccurrenceDate: Timestamp.fromDate(firstOccurrence),
      status: body.status,
      createdBy: userId,
      lastUpdatedBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    // Crear la recurrencia
    const docRef = await db.collection(COLLECTION).add(recurrenceData);

    // Generar transacciones automáticamente
    const recurrence = mapToRecurrence(docRef.id, {
      ...recurrenceData,
      startDate: { toDate: () => startDate },
      endDate: endDate ? { toDate: () => endDate } : null,
      nextOccurrenceDate: { toDate: () => firstOccurrence },
      createdAt: { toDate: () => now.toDate() },
      updatedAt: { toDate: () => now.toDate() },
    });

    const generationResult = await generateTransactionsFromRecurrence(
      recurrence,
      userId,
      { monthsAhead: body.generateMonthsAhead }
    );

    // Registrar en auditoría
    await logCreate(userId, 'recurrence', docRef.id, {
      name: body.name,
      type: body.type,
      baseAmount: body.baseAmount,
      frequency: body.frequency,
      generatedTransactions: generationResult.generatedCount,
    }, { entityName: body.name });

    return successResponse({
      recurrence: mapToRecurrence(docRef.id, {
        ...recurrenceData,
        startDate: { toDate: () => startDate },
        endDate: endDate ? { toDate: () => endDate } : null,
        lastGeneratedDate: generationResult.lastGeneratedDate 
          ? { toDate: () => generationResult.lastGeneratedDate } 
          : null,
        nextOccurrenceDate: { toDate: () => firstOccurrence },
        createdAt: { toDate: () => now.toDate() },
        updatedAt: { toDate: () => now.toDate() },
      }),
      generatedTransactions: generationResult.generatedCount,
      transactionIds: generationResult.transactionIds,
    }, 201);
  });
}
