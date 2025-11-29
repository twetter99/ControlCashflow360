import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  errorResponse,
  withErrorHandling,
  parseAndValidate,
  verifyOwnership,
} from '@/lib/api-utils';
import { Company } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';
import { UpdateCompanySchema } from '@/lib/validations/schemas';
import { logUpdate, logDelete } from '@/lib/audit-logger';

const COLLECTION = 'companies';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/companies/[id] - Obtener empresa por ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return errorResponse('Empresa no encontrada', 404, 'NOT_FOUND');
    }

    const data = docSnap.data()!;
    
    // Verificar propiedad
    if (!verifyOwnership(data.userId, userId)) {
      return errorResponse('No tienes permiso para ver esta empresa', 403, 'FORBIDDEN');
    }

    const company: Company = {
      id: docSnap.id,
      userId: data.userId,
      code: data.code || '',
      name: data.name,
      cif: data.cif || '',
      color: data.color || '#3B82F6',
      status: data.status || 'ACTIVE',
      createdAt: data.createdAt?.toDate?.() || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || new Date(),
    };

    return successResponse(company);
  });
}

/**
 * PUT /api/companies/[id] - Actualizar empresa
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    // Validar con Zod
    const validation = await parseAndValidate(request, UpdateCompanySchema);
    if (!validation.success) return validation.error;
    const body = validation.data;

    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return errorResponse('Empresa no encontrada', 404, 'NOT_FOUND');
    }

    const existingData = docSnap.data()!;
    
    // Verificar propiedad
    if (!verifyOwnership(existingData.userId, userId)) {
      return errorResponse('No tienes permiso para editar esta empresa', 403, 'FORBIDDEN');
    }

    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    // Solo actualizar campos proporcionados
    if (body.name !== undefined) updateData.name = body.name;
    if (body.cif !== undefined) updateData.cif = body.cif;
    if (body.color !== undefined) updateData.color = body.color;
    if (body.status !== undefined) updateData.status = body.status;

    await docRef.update(updateData);

    // Obtener documento actualizado
    const updatedSnap = await docRef.get();
    const updatedData = updatedSnap.data()!;
    
    const company: Company = {
      id: updatedSnap.id,
      userId: updatedData.userId,
      code: updatedData.code || '',
      name: updatedData.name,
      cif: updatedData.cif || '',
      color: updatedData.color || '#3B82F6',
      status: updatedData.status || 'ACTIVE',
      createdAt: updatedData.createdAt?.toDate?.() || new Date(),
      updatedAt: updatedData.updatedAt?.toDate?.() || new Date(),
    };

    // Registrar en auditoría
    await logUpdate(userId, 'company', id, 
      { name: existingData.name, cif: existingData.cif, color: existingData.color, status: existingData.status },
      { name: company.name, cif: company.cif, color: company.color, status: company.status },
      { entityName: company.name }
    );

    return successResponse(company);
  });
}

/**
 * DELETE /api/companies/[id] - Eliminar empresa (hard delete)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { id } = await params;

    const db = getAdminDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return errorResponse('Empresa no encontrada', 404, 'NOT_FOUND');
    }

    const data = docSnap.data()!;
    
    // Verificar propiedad
    if (!verifyOwnership(data.userId, userId)) {
      return errorResponse('No tienes permiso para eliminar esta empresa', 403, 'FORBIDDEN');
    }

    // Verificar que no tenga cuentas asociadas
    const accountsSnap = await db
      .collection('accounts')
      .where('companyId', '==', id)
      .limit(1)
      .get();

    if (!accountsSnap.empty) {
      return errorResponse(
        'No se puede eliminar una empresa con cuentas asociadas',
        400,
        'HAS_DEPENDENCIES'
      );
    }

    // Hard delete
    await docRef.delete();

    // Registrar en auditoría
    await logDelete(userId, 'company', id, 
      { name: data.name, code: data.code, cif: data.cif },
      { entityName: data.name }
    );

    return successResponse({ deleted: true, id });
  });
}
