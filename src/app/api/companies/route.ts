import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  successResponse,
  withErrorHandling,
  parseAndValidate,
} from '@/lib/api-utils';
import { Company } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';
import { CreateCompanySchema } from '@/lib/validations/schemas';
import { logCreate } from '@/lib/audit-logger';

const COLLECTION = 'companies';

/**
 * Genera el siguiente código de empresa para el usuario
 * Formato: EM01, EM02, etc.
 */
async function generateCompanyCode(userId: string): Promise<string> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .get();

  // Obtener el número más alto actual
  let maxNumber = 0;
  snapshot.docs.forEach((docSnap) => {
    const code = docSnap.data().code || '';
    const match = code.match(/^EM(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNumber) maxNumber = num;
    }
  });

  const nextNumber = maxNumber + 1;
  return `EM${nextNumber.toString().padStart(2, '0')}`;
}

/**
 * GET /api/companies - Obtener todas las empresas del usuario
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    
    // Verificar parámetro para incluir inactivas
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    let query = db.collection(COLLECTION).where('userId', '==', userId);
    
    if (!includeInactive) {
      query = query.where('status', '==', 'ACTIVE');
    }

    const snapshot = await query.orderBy('createdAt', 'desc').get();

    const companies: Company[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        code: data.code || '',
        name: data.name,
        cif: data.cif || '',
        color: data.color || '#3B82F6',
        status: data.status || 'ACTIVE',
        createdAt: data.createdAt?.toDate?.() || new Date(),
        updatedAt: data.updatedAt?.toDate?.() || new Date(),
      } as Company;
    });

    return successResponse(companies);
  });
}

/**
 * POST /api/companies - Crear nueva empresa
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    // Validar con Zod
    const validation = await parseAndValidate(request, CreateCompanySchema);
    if (!validation.success) return validation.error;
    const body = validation.data;

    const db = getAdminDb();
    const code = await generateCompanyCode(userId);
    
    const now = Timestamp.now();
    const companyData = {
      name: body.name,
      cif: body.cif,
      color: body.color,
      code,
      userId,
      status: body.status,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection(COLLECTION).add(companyData);
    
    const newCompany: Company = {
      id: docRef.id,
      userId,
      code,
      name: companyData.name,
      cif: companyData.cif,
      color: companyData.color,
      status: companyData.status,
      createdAt: now.toDate(),
      updatedAt: now.toDate(),
    };

    // Registrar en auditoría
    await logCreate(userId, 'company', docRef.id, {
      name: newCompany.name,
      code: newCompany.code,
      cif: newCompany.cif,
    }, { entityName: newCompany.name });

    return successResponse(newCompany, 201);
  });
}
