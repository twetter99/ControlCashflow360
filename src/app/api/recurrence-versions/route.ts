import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
} from '@/lib/api-utils';
import { RecurrenceVersion, CreateRecurrenceVersionInput } from '@/types';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

const COLLECTION = 'recurrence_versions';

/**
 * Mapea datos de Firestore a RecurrenceVersion
 */
function mapToRecurrenceVersion(id: string, data: FirebaseFirestore.DocumentData): RecurrenceVersion {
  return {
    id,
    userId: data.userId,
    recurrenceId: data.recurrenceId,
    amount: data.amount || 0,
    effectiveFrom: data.effectiveFrom?.toDate?.() || new Date(),
    effectiveTo: data.effectiveTo?.toDate?.() || null,
    changeReason: data.changeReason || undefined,
    versionNumber: data.versionNumber || 1,
    isActive: data.isActive ?? true,
    createdBy: data.createdBy || '',
    createdAt: data.createdAt?.toDate?.() || new Date(),
  };
}

/**
 * GET /api/recurrence-versions - Obtener versiones de una recurrencia
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    
    const { searchParams } = new URL(request.url);
    const recurrenceId = searchParams.get('recurrenceId');
    
    if (!recurrenceId) {
      return errorResponse('recurrenceId es requerido', 400);
    }

    // Usar solo recurrenceId para evitar índice compuesto
    const snapshot = await db.collection(COLLECTION)
      .where('recurrenceId', '==', recurrenceId)
      .get();

    // Filtrar por userId en memoria
    const versions: RecurrenceVersion[] = snapshot.docs
      .filter(doc => doc.data().userId === userId)
      .map((doc) => mapToRecurrenceVersion(doc.id, doc.data()));

    // Ordenar por versionNumber
    versions.sort((a, b) => a.versionNumber - b.versionNumber);

    return successResponse(versions);
  });
}

/**
 * POST /api/recurrence-versions - Crear nueva versión de recurrencia
 * Esto también actualiza las transacciones futuras
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json() as CreateRecurrenceVersionInput & { 
      updateFutureTransactions?: boolean;
    };

    const { recurrenceId, amount, effectiveFrom, changeReason, updateFutureTransactions = true } = body;

    if (!recurrenceId || amount === undefined || !effectiveFrom) {
      return errorResponse('recurrenceId, amount y effectiveFrom son requeridos', 400);
    }

    const db = getAdminDb();
    const now = new Date();
    const effectiveDate = new Date(effectiveFrom);

    // Verificar que la recurrencia existe y pertenece al usuario
    const recurrenceRef = db.collection('recurrences').doc(recurrenceId);
    const recurrenceDoc = await recurrenceRef.get();
    
    if (!recurrenceDoc.exists) {
      return errorResponse('Recurrencia no encontrada', 404);
    }
    
    const recurrenceData = recurrenceDoc.data();
    if (recurrenceData?.userId !== userId) {
      return errorResponse('No autorizado', 403);
    }

    // Obtener la última versión para calcular el número
    // Usamos solo recurrenceId para evitar necesitar índice compuesto
    const versionsSnapshot = await db.collection(COLLECTION)
      .where('recurrenceId', '==', recurrenceId)
      .get();

    // Filtrar por userId y encontrar la última versión en memoria
    const userVersions = versionsSnapshot.docs
      .filter(doc => doc.data().userId === userId)
      .sort((a, b) => (b.data().versionNumber || 0) - (a.data().versionNumber || 0));

    let lastVersionNumber = 0;
    let previousVersionId: string | null = null;

    if (userVersions.length > 0) {
      const lastVersion = userVersions[0];
      lastVersionNumber = lastVersion.data().versionNumber || 0;
      previousVersionId = lastVersion.id;

      // Marcar la versión anterior como no activa y establecer effectiveTo
      await lastVersion.ref.update({
        isActive: false,
        effectiveTo: Timestamp.fromDate(new Date(effectiveDate.getTime() - 1)), // Un día antes
      });
    }

    // Crear la nueva versión
    const newVersionData = {
      userId,
      recurrenceId,
      amount,
      effectiveFrom: Timestamp.fromDate(effectiveDate),
      effectiveTo: null,
      changeReason: changeReason || null,
      versionNumber: lastVersionNumber + 1,
      isActive: true,
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp(),
    };

    const newVersionRef = await db.collection(COLLECTION).add(newVersionData);

    // Actualizar la recurrencia con la nueva versión y baseAmount
    await recurrenceRef.update({
      currentVersionId: newVersionRef.id,
      baseAmount: amount,
      updatedAt: FieldValue.serverTimestamp(),
      lastUpdatedBy: userId,
    });

    // Si se solicita, actualizar las transacciones futuras pendientes
    if (updateFutureTransactions) {
      console.log(`[recurrence-versions] Buscando transacciones con recurrenceId: ${recurrenceId}`);
      console.log(`[recurrence-versions] Fecha efectiva: ${effectiveDate.toISOString()}`);
      
      // Usar solo recurrenceId para evitar índice compuesto
      const transactionsSnapshot = await db.collection('transactions')
        .where('recurrenceId', '==', recurrenceId)
        .get();

      console.log(`[recurrence-versions] Encontradas ${transactionsSnapshot.size} transacciones con ese recurrenceId`);

      const batch = db.batch();
      let updatedCount = 0;
      let skippedReasons: string[] = [];

      for (const doc of transactionsSnapshot.docs) {
        const txData = doc.data();
        const txDueDate = txData.dueDate?.toDate?.() || new Date();
        
        // Filtrar en memoria: userId, status PENDING, fecha >= effectiveFrom, no modificada manualmente
        if (txData.userId !== userId) {
          skippedReasons.push(`${doc.id}: userId diferente`);
          continue;
        }
        if (txData.status !== 'PENDING') {
          skippedReasons.push(`${doc.id}: status=${txData.status}`);
          continue;
        }
        if (txData.overriddenFromRecurrence) {
          skippedReasons.push(`${doc.id}: overriddenFromRecurrence`);
          continue;
        }
        
        // Solo actualizar transacciones cuya fecha >= effectiveFrom
        if (txDueDate < effectiveDate) {
          skippedReasons.push(`${doc.id}: fecha ${txDueDate.toISOString()} < ${effectiveDate.toISOString()}`);
          continue;
        }
        
        console.log(`[recurrence-versions] Actualizando tx ${doc.id}, fecha: ${txDueDate.toISOString()}`);
        
        batch.update(doc.ref, {
          amount,
          recurrenceVersionId: newVersionRef.id,
          updatedAt: FieldValue.serverTimestamp(),
          lastUpdatedBy: userId,
        });
        updatedCount++;
      }

      console.log(`[recurrence-versions] Razones de skip:`, skippedReasons);

      if (updatedCount > 0) {
        await batch.commit();
      }
      
      console.log(`[recurrence-versions] Actualizadas ${updatedCount} transacciones futuras`);
    }

    // Obtener el documento creado
    const createdDoc = await newVersionRef.get();
    const newVersion = mapToRecurrenceVersion(newVersionRef.id, {
      ...createdDoc.data(),
      createdAt: now,
    });

    return successResponse(newVersion, 201);
  });
}
