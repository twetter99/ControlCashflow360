import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
  parseAndValidate,
} from '@/lib/api-utils';
import { CreditLine } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';
import { CreateCreditLineSchema } from '@/lib/validations/schemas';
import { logCreate } from '@/lib/audit-logger';

const COLLECTION = 'creditLines';

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
 * GET /api/credit-lines - Obtener todas las líneas de crédito del usuario
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

    let query = db.collection(COLLECTION).where('userId', '==', userId);

    if (companyId) {
      query = query.where('companyId', '==', companyId);
    }
    
    if (!includeInactive) {
      query = query.where('status', '==', 'ACTIVE');
    }

    const snapshot = await query.orderBy('createdAt', 'desc').get();

    const creditLines: CreditLine[] = snapshot.docs.map((doc) => 
      mapToCreditLine(doc.id, doc.data())
    );

    return successResponse(creditLines);
  });
}

/**
 * POST /api/credit-lines - Crear nueva línea de crédito
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    // Validar con Zod
    const validation = await parseAndValidate(request, CreateCreditLineSchema);
    if (!validation.success) return validation.error;
    const body = validation.data;

    const db = getAdminDb();

    // Verificar que la empresa pertenece al usuario
    const companyDoc = await db.collection('companies').doc(body.companyId).get();
    if (!companyDoc.exists || companyDoc.data()?.userId !== userId) {
      return errorResponse('Empresa no válida', 400, 'INVALID_COMPANY');
    }
    
    const now = Timestamp.now();
    const expiryDate = body.expiryDate instanceof Date ? body.expiryDate : new Date(body.expiryDate);
    const available = body.creditLimit - body.currentDrawn;
    
    const creditLineData = {
      companyId: body.companyId,
      bankName: body.bankName,
      alias: body.alias,
      creditLimit: body.creditLimit,
      currentDrawn: body.currentDrawn,
      available,
      interestRate: body.interestRate,
      expiryDate: Timestamp.fromDate(expiryDate),
      autoDrawThreshold: body.autoDrawThreshold || null,
      status: body.status,
      lastUpdatedBy: userId,
      lastUpdateDate: now,
      userId,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection(COLLECTION).add(creditLineData);

    // Registrar en auditoría
    await logCreate(userId, 'credit_line', docRef.id, {
      bankName: body.bankName,
      alias: body.alias,
      creditLimit: body.creditLimit,
      currentDrawn: body.currentDrawn,
      interestRate: body.interestRate,
    }, { entityName: body.alias || body.bankName });

    return successResponse(mapToCreditLine(docRef.id, {
      ...creditLineData,
      expiryDate: { toDate: () => expiryDate },
      lastUpdateDate: { toDate: () => now.toDate() },
      createdAt: { toDate: () => now.toDate() },
      updatedAt: { toDate: () => now.toDate() },
    }), 201);
  });
}
