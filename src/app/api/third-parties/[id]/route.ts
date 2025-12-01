import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
} from '@/lib/api-utils';
import { Timestamp } from 'firebase-admin/firestore';
import { ThirdParty } from '@/types';

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
 * GET /api/third-parties/[id]
 * Obtiene un tercero por ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    const doc = await db.collection('third_parties').doc(params.id).get();

    if (!doc.exists) {
      return errorResponse('Tercero no encontrado', 404);
    }

    const data = doc.data()!;
    if (data.userId !== userId) {
      return errorResponse('No tienes permiso para ver este tercero', 403);
    }

    return successResponse(docToThirdParty(doc));
  });
}

/**
 * PUT /api/third-parties/[id]
 * Actualiza un tercero
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    const docRef = db.collection('third_parties').doc(params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return errorResponse('Tercero no encontrado', 404);
    }

    const existingData = doc.data()!;
    if (existingData.userId !== userId) {
      return errorResponse('No tienes permiso para modificar este tercero', 403);
    }

    const body = await request.json();
    const { type, displayName, cif, email, phone, isActive, notes } = body;

    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    if (type !== undefined) {
      if (!['CUSTOMER', 'SUPPLIER', 'CREDITOR', 'MIXED'].includes(type)) {
        return errorResponse('Tipo de tercero inválido', 400);
      }
      updateData.type = type;
    }

    if (displayName !== undefined) {
      if (displayName.trim().length < 2) {
        return errorResponse('El nombre debe tener al menos 2 caracteres', 400);
      }
      updateData.displayName = displayName.trim();
      updateData.normalizedName = normalizeNameForSearch(displayName);

      // Verificar duplicado si cambia el nombre
      if (displayName.trim() !== existingData.displayName) {
        const existingSnapshot = await db.collection('third_parties')
          .where('userId', '==', userId)
          .where('normalizedName', '==', updateData.normalizedName)
          .where('isActive', '==', true)
          .limit(1)
          .get();

        const duplicateDoc = existingSnapshot.docs.find(d => d.id !== params.id);
        if (duplicateDoc) {
          return errorResponse(
            `Ya existe un tercero con nombre similar: "${duplicateDoc.data().displayName}"`,
            409,
            'DUPLICATE_EXISTS'
          );
        }
      }
    }

    if (cif !== undefined) updateData.cif = cif?.trim() || null;
    if (email !== undefined) updateData.email = email?.trim() || null;
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;

    await docRef.update(updateData);

    const updatedDoc = await docRef.get();
    return successResponse(docToThirdParty(updatedDoc));
  });
}

/**
 * DELETE /api/third-parties/[id]
 * Desactiva un tercero (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    const docRef = db.collection('third_parties').doc(params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return errorResponse('Tercero no encontrado', 404);
    }

    const data = doc.data()!;
    if (data.userId !== userId) {
      return errorResponse('No tienes permiso para eliminar este tercero', 403);
    }

    // Soft delete: marcar como inactivo
    await docRef.update({
      isActive: false,
      updatedAt: Timestamp.now(),
    });

    return successResponse({ deleted: true, id: params.id });
  });
}
