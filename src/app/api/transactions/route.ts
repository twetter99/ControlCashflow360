import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
  parseAndValidate,
} from '@/lib/api-utils';
import { Transaction, RecurrenceFrequency, Recurrence, RecurrenceStatus } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';
import { CreateTransactionSchema } from '@/lib/validations/schemas';
import { logCreate } from '@/lib/audit-logger';
import { generateTransactionsFromRecurrence, calculateNextOccurrenceDate } from '@/lib/recurrence-generator';

const COLLECTION = 'transactions';

/**
 * Mapea datos de Firestore a Transaction
 */
function mapToTransaction(id: string, data: FirebaseFirestore.DocumentData): Transaction {
  return {
    id,
    userId: data.userId,
    companyId: data.companyId,
    accountId: data.accountId || undefined,
    type: data.type,
    amount: data.amount || 0,
    status: data.status || 'PENDING',
    dueDate: data.dueDate?.toDate?.() || new Date(),
    paidDate: data.paidDate?.toDate?.() || null,
    category: data.category || '',
    description: data.description || '',
    thirdPartyId: data.thirdPartyId || undefined,
    thirdPartyName: data.thirdPartyName || '',
    notes: data.notes || '',
    invoiceNumber: data.invoiceNumber || '',
    recurrence: data.recurrence || 'NONE',
    certainty: data.certainty || 'HIGH',
    recurrenceId: data.recurrenceId || null,
    // Campos de instancia de recurrencia
    isRecurrenceInstance: data.isRecurrenceInstance || false,
    instanceDate: data.instanceDate || undefined,
    overriddenFromRecurrence: data.overriddenFromRecurrence || false,
    createdBy: data.createdBy || '',
    lastUpdatedBy: data.lastUpdatedBy || '',
    createdAt: data.createdAt?.toDate?.() || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(),
  };
}

/**
 * GET /api/transactions - Obtener todas las transacciones del usuario
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    
    // Filtros opcionales
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const companyId = searchParams.get('companyId');
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Query simple sin orderBy para evitar índices compuestos
    const snapshot = await db.collection(COLLECTION).where('userId', '==', userId).get();

    let transactions: Transaction[] = snapshot.docs.map((doc) => 
      mapToTransaction(doc.id, doc.data())
    );

    // Filtrar en memoria
    if (accountId) {
      transactions = transactions.filter(t => t.accountId === accountId);
    }
    if (companyId) {
      transactions = transactions.filter(t => t.companyId === companyId);
    }
    if (type) {
      transactions = transactions.filter(t => t.type === type);
    }
    if (status) {
      transactions = transactions.filter(t => t.status === status);
    }
    if (startDate) {
      const start = new Date(startDate);
      transactions = transactions.filter(t => new Date(t.dueDate) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      transactions = transactions.filter(t => new Date(t.dueDate) <= end);
    }

    // Ordenar en memoria por dueDate desc
    transactions.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

    return successResponse(transactions);
  });
}

/**
 * POST /api/transactions - Crear nueva transacción
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    // Validar con Zod
    const validation = await parseAndValidate(request, CreateTransactionSchema);
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
    const dueDate = body.dueDate instanceof Date ? body.dueDate : new Date(body.dueDate);
    const paidDate = body.paidDate ? (body.paidDate instanceof Date ? body.paidDate : new Date(body.paidDate)) : null;
    
    // Normalizar la fecha para la verificación de duplicados (solo YYYY-MM-DD)
    const dueDateStart = new Date(dueDate);
    dueDateStart.setHours(0, 0, 0, 0);
    const dueDateEnd = new Date(dueDate);
    dueDateEnd.setHours(23, 59, 59, 999);
    
    // Verificar duplicados: misma empresa, tipo, monto, descripción y fecha
    // Esto previene doble-clics, múltiples pestañas, etc.
    // Usamos consulta simple sin índice compuesto y filtramos en memoria
    const recentTransactions = await db.collection(COLLECTION)
      .where('userId', '==', userId)
      .get();
    
    // Filtrar en memoria para encontrar duplicados exactos
    const exactDuplicate = recentTransactions.docs.find(doc => {
      const data = doc.data();
      const docDueDate = data.dueDate?.toDate?.() || new Date(0);
      return data.companyId === body.companyId &&
             data.type === body.type &&
             data.amount === body.amount &&
             data.description === body.description &&
             docDueDate >= dueDateStart &&
             docDueDate <= dueDateEnd;
    });
    
    if (exactDuplicate) {
      console.log(`[Transactions API] Detectado duplicado, devolviendo transacción existente: ${exactDuplicate.id}`);
      return successResponse(mapToTransaction(exactDuplicate.id, exactDuplicate.data()));
    }
    
    // Determinar si es una transacción recurrente (no NONE y no es ya una instancia)
    const isNewRecurrence = body.recurrence && 
                            body.recurrence !== 'NONE' && 
                            !body.isRecurrenceInstance && 
                            !body.recurrenceId;
    
    let recurrenceId: string | null = body.recurrenceId || null;
    let generatedTransactions: string[] = [];

    // Si es recurrente, primero crear la recurrencia
    if (isNewRecurrence) {
      // Extraer el día del mes de la fecha de vencimiento
      const dayOfMonth = dueDate.getDate();
      const dayOfWeek = dueDate.getDay();

      // Calcular fecha de fin si se especificó
      let calculatedEndDate: Date | null = null;
      
      if (body.recurrenceEndDate) {
        // Fecha de fin explícita
        calculatedEndDate = body.recurrenceEndDate instanceof Date 
          ? body.recurrenceEndDate 
          : new Date(body.recurrenceEndDate);
      } else if (body.recurrenceInstallments && body.recurrenceInstallments > 0) {
        // Calcular fecha basada en número de cuotas
        calculatedEndDate = new Date(dueDate);
        const installments = body.recurrenceInstallments;
        
        switch (body.recurrence) {
          case 'DAILY':
            calculatedEndDate.setDate(calculatedEndDate.getDate() + (installments - 1));
            break;
          case 'WEEKLY':
            calculatedEndDate.setDate(calculatedEndDate.getDate() + (installments - 1) * 7);
            break;
          case 'BIWEEKLY':
            calculatedEndDate.setDate(calculatedEndDate.getDate() + (installments - 1) * 14);
            break;
          case 'MONTHLY':
            calculatedEndDate.setMonth(calculatedEndDate.getMonth() + (installments - 1));
            break;
          case 'QUARTERLY':
            calculatedEndDate.setMonth(calculatedEndDate.getMonth() + (installments - 1) * 3);
            break;
          case 'YEARLY':
            calculatedEndDate.setFullYear(calculatedEndDate.getFullYear() + (installments - 1));
            break;
        }
      }

      const recurrenceData = {
        userId,
        companyId: body.companyId,
        accountId: body.accountId || null,
        type: body.type,
        name: body.description || `${body.category} - ${body.type === 'INCOME' ? 'Ingreso' : 'Gasto'}`,
        baseAmount: body.amount,
        category: body.category,
        thirdPartyId: body.thirdPartyId || null,
        thirdPartyName: body.thirdPartyName || '',
        certainty: body.certainty || 'HIGH',
        notes: body.notes || '',
        frequency: body.recurrence as RecurrenceFrequency,
        dayOfMonth: dayOfMonth,
        dayOfWeek: dayOfWeek,
        startDate: Timestamp.fromDate(dueDate),
        endDate: calculatedEndDate ? Timestamp.fromDate(calculatedEndDate) : null,
        generateMonthsAhead: 6,
        lastGeneratedDate: null,
        nextOccurrenceDate: null,
        status: 'ACTIVE',
        createdBy: userId,
        lastUpdatedBy: userId,
        createdAt: now,
        updatedAt: now,
      };

      const recurrenceRef = await db.collection('recurrences').add(recurrenceData);
      recurrenceId = recurrenceRef.id;

      console.log(`[Transactions API] Creada recurrencia ${recurrenceId} para transacción recurrente${calculatedEndDate ? ` (fin: ${calculatedEndDate.toISOString().split('T')[0]})` : ' (indefinida)'}`);
    }

    // Crear la transacción principal
    const instanceDate = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;
    
    const transactionData = {
      companyId: body.companyId,
      accountId: body.accountId || null,
      type: body.type,
      amount: body.amount,
      status: body.status,
      dueDate: Timestamp.fromDate(dueDate),
      paidDate: paidDate ? Timestamp.fromDate(paidDate) : null,
      category: body.category,
      description: body.description,
      thirdPartyId: body.thirdPartyId || null,
      thirdPartyName: body.thirdPartyName,
      notes: body.notes,
      invoiceNumber: body.invoiceNumber || '',
      recurrence: body.recurrence,
      certainty: body.certainty,
      recurrenceId: recurrenceId,
      // Si es recurrente, marcarla como instancia
      isRecurrenceInstance: isNewRecurrence ? true : (body.isRecurrenceInstance || false),
      instanceDate: isNewRecurrence ? instanceDate : (body.instanceDate || null),
      overriddenFromRecurrence: body.overriddenFromRecurrence || false,
      createdBy: userId,
      lastUpdatedBy: userId,
      userId,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection(COLLECTION).add(transactionData);

    // Si es recurrente, generar las transacciones futuras
    if (isNewRecurrence && recurrenceId) {
      try {
        // Primero actualizar la recurrencia con la fecha de la primera transacción
        // para evitar que regenerate duplique esta transacción
        await db.collection('recurrences').doc(recurrenceId).update({
          lastGeneratedDate: Timestamp.fromDate(dueDate),
          nextOccurrenceDate: Timestamp.fromDate(
            calculateNextOccurrenceDate(dueDate, body.recurrence as RecurrenceFrequency, dueDate.getDate(), dueDate.getDay())
          ),
        });

        // Obtener la recurrencia recién creada
        const recurrenceDoc = await db.collection('recurrences').doc(recurrenceId).get();
        const recurrenceData = recurrenceDoc.data()!;
        
        // Calcular la siguiente fecha después de la transacción principal
        const nextStartDate = calculateNextOccurrenceDate(
          dueDate,
          recurrenceData.frequency,
          recurrenceData.dayOfMonth,
          recurrenceData.dayOfWeek
        );
        
        const recurrence: Recurrence = {
          id: recurrenceId,
          userId,
          companyId: recurrenceData.companyId,
          accountId: recurrenceData.accountId,
          type: recurrenceData.type,
          name: recurrenceData.name,
          baseAmount: recurrenceData.baseAmount,
          category: recurrenceData.category,
          thirdPartyId: recurrenceData.thirdPartyId,
          thirdPartyName: recurrenceData.thirdPartyName,
          certainty: recurrenceData.certainty,
          notes: recurrenceData.notes,
          frequency: recurrenceData.frequency,
          dayOfMonth: recurrenceData.dayOfMonth,
          dayOfWeek: recurrenceData.dayOfWeek,
          startDate: nextStartDate, // Empezar desde la SIGUIENTE fecha
          endDate: recurrenceData.endDate?.toDate() || null,
          generateMonthsAhead: recurrenceData.generateMonthsAhead,
          lastGeneratedDate: dueDate, // La primera transacción ya fue generada
          status: 'ACTIVE' as RecurrenceStatus,
          createdBy: recurrenceData.createdBy,
        };

        // Generar transacciones futuras (la primera ya la creamos arriba)
        console.log(`[Transactions API] Generando transacciones futuras:`, {
          recurrenceId,
          startDate: nextStartDate.toISOString(),
          dueDate: dueDate.toISOString(),
          frequency: recurrence.frequency,
          dayOfMonth: recurrence.dayOfMonth,
        });
        
        const result = await generateTransactionsFromRecurrence(recurrence, userId, {
          fromDate: new Date(), // Desde hoy
          monthsAhead: 6,
          skipExisting: true,
        });

        generatedTransactions = result.transactionIds;
        console.log(`[Transactions API] Generadas ${result.generatedCount} transacciones futuras, saltadas ${result.skippedCount}, para recurrencia ${recurrenceId}`);

      } catch (genError) {
        console.error(`[Transactions API] Error generando transacciones futuras:`, genError);
        // No fallar la creación principal, solo logear el error
      }
    }

    // Si está pagada y tiene cuenta, actualizar balance
    if (transactionData.status === 'PAID' && transactionData.accountId) {
      const balanceChange = body.type === 'INCOME' ? body.amount : -body.amount;
      const accountDoc = await db.collection('accounts').doc(transactionData.accountId).get();
      const accountData = accountDoc.data()!;
      await db.collection('accounts').doc(transactionData.accountId).update({
        currentBalance: (accountData.currentBalance || 0) + balanceChange,
        lastUpdateAmount: balanceChange,
        lastUpdateDate: now,
        lastUpdatedBy: userId,
        updatedAt: now,
      });
    }

    // Registrar en auditoría
    await logCreate(userId, 'transaction', docRef.id, {
      type: body.type,
      amount: body.amount,
      status: body.status,
      description: body.description,
      category: body.category,
      thirdPartyName: body.thirdPartyName,
      isRecurrent: isNewRecurrence,
      recurrenceId: recurrenceId,
      futureTransactionsGenerated: generatedTransactions.length,
    }, { entityName: body.description || `${body.type} - ${body.amount}` });

    const response = mapToTransaction(docRef.id, {
      ...transactionData,
      dueDate: { toDate: () => dueDate },
      paidDate: paidDate ? { toDate: () => paidDate } : null,
      createdAt: { toDate: () => now.toDate() },
      updatedAt: { toDate: () => now.toDate() },
    });

    // Añadir info extra sobre recurrencia si aplica
    return successResponse({
      ...response,
      _recurrenceCreated: isNewRecurrence,
      _recurrenceId: recurrenceId,
      _futureTransactionsGenerated: generatedTransactions.length,
    }, 201);
  });
}
