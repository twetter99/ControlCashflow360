import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  withErrorHandling,
} from '@/lib/api-utils';
import { Worker, EntityStatus } from '@/types';

// GET: Obtener todos los trabajadores del usuario
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const status = searchParams.get('status') as EntityStatus | null;

    let query = db.collection('workers').where('userId', '==', userId);
    
    if (companyId) {
      query = query.where('companyId', '==', companyId);
    }
    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.get();
    
    const workers: Worker[] = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      } as Worker;
    });

    // Ordenar por nombre
    workers.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return NextResponse.json({ success: true, data: workers });
  });
}

// POST: Crear nuevo trabajador
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    const body = await request.json();
    const { 
      companyId, 
      displayName, 
      identifier, 
      alias, 
      iban, 
      bankAlias, 
      defaultAmount,
      defaultExtraAmount,
      numberOfPayments,
      extrasProrated,
      notes 
    } = body;

    if (!companyId || !displayName) {
      return NextResponse.json(
        { success: false, error: 'Empresa y nombre son requeridos' },
        { status: 400 }
      );
    }

    if (!iban || iban.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'IBAN es requerido' },
        { status: 400 }
      );
    }

    const now = new Date();
    const workerData = {
      userId,
      companyId,
      displayName: displayName.trim(),
      identifier: identifier?.trim() || null,
      alias: alias?.trim() || null,
      iban: iban.toUpperCase().replace(/\s/g, ''), // Normalizar IBAN
      bankAlias: bankAlias?.trim() || null,
      defaultAmount: defaultAmount || null,
      defaultExtraAmount: defaultExtraAmount || null,
      numberOfPayments: numberOfPayments || 14,
      extrasProrated: extrasProrated || false,
      status: 'ACTIVE' as EntityStatus,
      notes: notes || '',
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection('workers').add(workerData);

    return NextResponse.json({ 
      success: true, 
      data: { 
        id: docRef.id, 
        ...workerData 
      } 
    }, { status: 201 });
  });
}
