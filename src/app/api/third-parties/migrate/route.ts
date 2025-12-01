import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  withErrorHandling,
} from '@/lib/api-utils';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * Normaliza un nombre para comparación
 */
function normalizeNameForSearch(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * POST /api/third-parties/migrate
 * 
 * Migra los thirdPartyName de transacciones existentes a la colección third_parties
 * - Obtiene todos los nombres únicos de terceros
 * - Crea terceros automáticamente con tipo MIXED
 * - Actualiza las transacciones con el thirdPartyId correspondiente
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    const now = Timestamp.now();
    
    const results = {
      thirdPartiesCreated: 0,
      transactionsUpdated: 0,
      skippedExisting: 0,
      uniqueNames: 0,
      errors: [] as string[],
    };

    // 1. Obtener todas las transacciones del usuario con thirdPartyName pero sin thirdPartyId
    const transactionsSnapshot = await db.collection('transactions')
      .where('userId', '==', userId)
      .get();

    // Agrupar por nombre de tercero único
    const nameToTransactions = new Map<string, { normalizedName: string; transactionIds: string[] }>();
    
    for (const doc of transactionsSnapshot.docs) {
      const data = doc.data();
      const thirdPartyName = data.thirdPartyName?.trim();
      
      // Saltar si no hay nombre o ya tiene thirdPartyId
      if (!thirdPartyName || data.thirdPartyId) {
        if (data.thirdPartyId) results.skippedExisting++;
        continue;
      }
      
      const normalizedName = normalizeNameForSearch(thirdPartyName);
      if (!normalizedName) continue;
      
      if (!nameToTransactions.has(thirdPartyName)) {
        nameToTransactions.set(thirdPartyName, {
          normalizedName,
          transactionIds: [],
        });
      }
      nameToTransactions.get(thirdPartyName)!.transactionIds.push(doc.id);
    }

    results.uniqueNames = nameToTransactions.size;

    // 2. Obtener terceros existentes para evitar duplicados
    const existingThirdPartiesSnapshot = await db.collection('third_parties')
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .get();

    const existingByNormalizedName = new Map<string, string>();
    for (const doc of existingThirdPartiesSnapshot.docs) {
      const data = doc.data();
      existingByNormalizedName.set(data.normalizedName, doc.id);
    }

    // 3. Crear terceros y actualizar transacciones
    const entries = Array.from(nameToTransactions.entries());
    for (const [displayName, { normalizedName, transactionIds }] of entries) {
      try {
        let thirdPartyId: string;

        // Verificar si ya existe
        if (existingByNormalizedName.has(normalizedName)) {
          thirdPartyId = existingByNormalizedName.get(normalizedName)!;
        } else {
          // Crear nuevo tercero
          const thirdPartyData = {
            userId,
            type: 'MIXED', // Por defecto, el usuario puede ajustar después
            displayName,
            normalizedName,
            cif: null,
            email: null,
            phone: null,
            isActive: true,
            lastUsedAt: now,
            avgPaymentDelay: null,
            totalVolume12m: 0,
            notes: 'Creado automáticamente en migración',
            createdAt: now,
            updatedAt: now,
          };

          const docRef = await db.collection('third_parties').add(thirdPartyData);
          thirdPartyId = docRef.id;
          existingByNormalizedName.set(normalizedName, thirdPartyId);
          results.thirdPartiesCreated++;
        }

        // Actualizar transacciones con el thirdPartyId
        const batch = db.batch();
        for (const txId of transactionIds) {
          batch.update(db.collection('transactions').doc(txId), {
            thirdPartyId,
            updatedAt: now,
          });
        }
        await batch.commit();
        results.transactionsUpdated += transactionIds.length;

      } catch (error) {
        results.errors.push(`Error con "${displayName}": ${error}`);
      }
    }

    return successResponse({
      message: 'Migración completada',
      ...results,
    });
  });
}
