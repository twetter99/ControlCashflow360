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
import { CreateCreditCardSchema } from '@/lib/validations/schemas';
import { logCreate } from '@/lib/audit-logger';

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
 * GET /api/credit-cards - Obtener todas las tarjetas de crédito del usuario
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

    let creditCards: CreditCard[] = snapshot.docs.map((doc) => 
      mapToCreditCard(doc.id, doc.data())
    );

    // Filtrar por companyId si es necesario
    if (companyId) {
      creditCards = creditCards.filter(cc => cc.companyId === companyId);
    }

    // Filtrar por status si es necesario
    if (!includeInactive) {
      creditCards = creditCards.filter(cc => cc.status === 'ACTIVE');
    }

    // Ordenar en memoria por createdAt desc
    creditCards.sort((a, b) => new Date(b.createdAt || new Date()).getTime() - new Date(a.createdAt || new Date()).getTime());

    return successResponse(creditCards);
  });
}

/**
 * POST /api/credit-cards - Crear nueva tarjeta de crédito
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    // Validar con Zod (incluye sanitización XSS)
    const validation = await parseAndValidate(request, CreateCreditCardSchema);
    if (!validation.success) return validation.error;
    const body = validation.data;

    const db = getAdminDb();

    // Verificar que la empresa pertenece al usuario
    const companyDoc = await db.collection('companies').doc(body.companyId).get();
    if (!companyDoc.exists || companyDoc.data()?.userId !== userId) {
      return errorResponse('Empresa no válida', 400, 'INVALID_COMPANY');
    }

    const now = Timestamp.now();
    
    // Calcular crédito disponible
    const availableCredit = body.creditLimit - body.currentBalance;

    const creditCardData = {
      userId,
      companyId: body.companyId,
      bankName: body.bankName,
      cardAlias: body.cardAlias,
      cardNumberLast4: body.cardNumberLast4,
      cardHolder: body.cardHolder,
      creditLimit: body.creditLimit,
      currentBalance: body.currentBalance,
      availableCredit,
      cutoffDay: body.cutoffDay,
      paymentDueDay: body.paymentDueDay,
      status: body.status,
      lastUpdatedBy: userId,
      lastUpdateDate: now,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection(COLLECTION).add(creditCardData);

    // Log de auditoría
    await logCreate(userId, 'credit_card', docRef.id, {
      bankName: body.bankName,
      cardAlias: body.cardAlias,
      cardNumberLast4: body.cardNumberLast4,
      companyId: body.companyId,
    });

    const newCreditCard: CreditCard = {
      id: docRef.id,
      ...creditCardData,
      lastUpdateDate: now.toDate(),
      createdAt: now.toDate(),
      updatedAt: now.toDate(),
    };

    return successResponse(newCreditCard, 201);
  });
}
