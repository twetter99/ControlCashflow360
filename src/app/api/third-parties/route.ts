import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
} from '@/lib/api-utils';
import { Timestamp } from 'firebase-admin/firestore';
import { ThirdParty, ThirdPartyType } from '@/types';

/**
 * Normaliza un nombre para comparación y búsqueda de duplicados
 * - Convierte a minúsculas
 * - Elimina tildes/acentos
 * - Elimina espacios extra
 * - Elimina caracteres especiales
 */
function normalizeNameForSearch(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Elimina acentos
    .replace(/[^a-z0-9\s]/g, '')     // Solo letras, números y espacios
    .replace(/\s+/g, ' ')            // Espacios múltiples → uno solo
    .trim();
}

/**
 * Calcula la similitud entre dos strings (algoritmo de Levenshtein simplificado)
 * Retorna un valor entre 0 y 1 (1 = idénticos)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeNameForSearch(str1);
  const s2 = normalizeNameForSearch(str2);
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  // Similitud por inclusión (si uno contiene al otro)
  if (s1.includes(s2) || s2.includes(s1)) {
    const minLen = Math.min(s1.length, s2.length);
    const maxLen = Math.max(s1.length, s2.length);
    return minLen / maxLen;
  }
  
  // Distancia de Levenshtein
  const matrix: number[][] = [];
  
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // Eliminación
        matrix[i][j - 1] + 1,      // Inserción
        matrix[i - 1][j - 1] + cost // Sustitución
      );
    }
  }
  
  const distance = matrix[s1.length][s2.length];
  const maxLen = Math.max(s1.length, s2.length);
  return 1 - distance / maxLen;
}

/**
 * Transforma documento de Firestore a ThirdParty
 */
function docToThirdParty(doc: FirebaseFirestore.DocumentSnapshot): ThirdParty {
  const data = doc.data()!;
  return {
    id: doc.id,
    userId: data.userId,
    type: data.type,
    displayName: data.displayName,
    normalizedName: data.normalizedName,
    cif: data.cif,
    email: data.email,
    phone: data.phone,
    isActive: data.isActive ?? true,
    lastUsedAt: data.lastUsedAt?.toDate?.() || undefined,
    avgPaymentDelay: data.avgPaymentDelay,
    totalVolume12m: data.totalVolume12m,
    notes: data.notes,
    createdAt: data.createdAt?.toDate?.() || undefined,
    updatedAt: data.updatedAt?.toDate?.() || undefined,
  };
}

/**
 * GET /api/third-parties
 * Obtiene todos los terceros del usuario o busca por texto
 * Query params:
 *   - search: texto a buscar
 *   - type: filtrar por tipo (CUSTOMER, SUPPLIER, CREDITOR, MIXED)
 *   - includeInactive: incluir inactivos (default: false)
 *   - checkDuplicates: nombre para verificar duplicados
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim();
    const type = searchParams.get('type') as ThirdPartyType | null;
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const checkDuplicates = searchParams.get('checkDuplicates')?.trim();

    // Si es verificación de duplicados
    if (checkDuplicates) {
      const normalizedSearch = normalizeNameForSearch(checkDuplicates);
      const snapshot = await db.collection('third_parties')
        .where('userId', '==', userId)
        .where('isActive', '==', true)
        .get();

      const similar = snapshot.docs
        .map(doc => {
          const data = doc.data();
          const similarity = calculateSimilarity(checkDuplicates, data.displayName);
          return {
            id: doc.id,
            displayName: data.displayName,
            type: data.type,
            cif: data.cif,
            similarity,
          };
        })
        .filter(tp => tp.similarity >= 0.8) // 80% o más de similitud
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5);

      return successResponse({ duplicates: similar });
    }

    // Construir query base
    let query: FirebaseFirestore.Query = db.collection('third_parties')
      .where('userId', '==', userId);

    if (!includeInactive) {
      query = query.where('isActive', '==', true);
    }

    if (type) {
      query = query.where('type', '==', type);
    }

    const snapshot = await query.orderBy('displayName', 'asc').get();

    let thirdParties = snapshot.docs.map(docToThirdParty);

    // Filtrar por búsqueda de texto (en memoria para evitar índices complejos)
    if (search) {
      const normalizedSearch = normalizeNameForSearch(search);
      thirdParties = thirdParties.filter(tp => 
        tp.normalizedName.includes(normalizedSearch) ||
        tp.displayName.toLowerCase().includes(search.toLowerCase()) ||
        (tp.cif && tp.cif.toLowerCase().includes(search.toLowerCase()))
      );
    }

    return successResponse(thirdParties);
  });
}

/**
 * POST /api/third-parties
 * Crea un nuevo tercero
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { type, displayName, cif, email, phone, notes } = body;

    // Validaciones
    if (!displayName || displayName.trim().length < 2) {
      return errorResponse('El nombre debe tener al menos 2 caracteres', 400);
    }

    if (!type || !['CUSTOMER', 'SUPPLIER', 'CREDITOR', 'MIXED'].includes(type)) {
      return errorResponse('Tipo de tercero inválido', 400);
    }

    const db = getAdminDb();
    const now = Timestamp.now();
    const normalizedName = normalizeNameForSearch(displayName);

    // Verificar duplicado exacto
    const existingSnapshot = await db.collection('third_parties')
      .where('userId', '==', userId)
      .where('normalizedName', '==', normalizedName)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      const existing = existingSnapshot.docs[0].data();
      return errorResponse(
        `Ya existe un tercero con nombre similar: "${existing.displayName}"`,
        409,
        'DUPLICATE_EXISTS'
      );
    }

    // Crear tercero
    const thirdPartyData = {
      userId,
      type,
      displayName: displayName.trim(),
      normalizedName,
      cif: cif?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      isActive: true,
      lastUsedAt: null,
      avgPaymentDelay: null,
      totalVolume12m: 0,
      notes: notes?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection('third_parties').add(thirdPartyData);

    const createdThirdParty: ThirdParty = {
      id: docRef.id,
      userId,
      type,
      displayName: displayName.trim(),
      normalizedName,
      cif: cif?.trim(),
      email: email?.trim(),
      phone: phone?.trim(),
      isActive: true,
      notes: notes?.trim(),
      createdAt: now.toDate(),
      updatedAt: now.toDate(),
    };

    return successResponse(createdThirdParty, 201);
  });
}
