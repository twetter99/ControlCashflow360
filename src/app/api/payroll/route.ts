import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  withErrorHandling,
} from '@/lib/api-utils';
import { PayrollBatch, PayrollBatchStatus } from '@/types';

// GET: Obtener todos los lotes de nóminas del usuario
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const status = searchParams.get('status') as PayrollBatchStatus | null;

    let query = db.collection('payroll_batches').where('userId', '==', userId);
    
    if (companyId) {
      query = query.where('companyId', '==', companyId);
    }
    if (year) {
      query = query.where('year', '==', parseInt(year));
    }
    if (month) {
      query = query.where('month', '==', parseInt(month));
    }
    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.get();
    
    const batches: PayrollBatch[] = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        dueDate: data.dueDate?.toDate(),
        confirmedAt: data.confirmedAt?.toDate(),
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      } as PayrollBatch;
    });

    // Ordenar por año/mes descendente
    batches.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    return NextResponse.json({ success: true, data: batches });
  });
}

// POST: Crear nuevo lote de nóminas
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const db = getAdminDb();
    const body = await request.json();
    const { 
      companyId, 
      year, 
      month, 
      title,
      dueDate,
      notes 
    } = body;

    if (!companyId || !year || !month) {
      return NextResponse.json(
        { success: false, error: 'Empresa, año y mes son requeridos' },
        { status: 400 }
      );
    }

    // Verificar si ya existe un lote para ese mes/año/empresa
    const existingBatch = await db.collection('payroll_batches')
      .where('userId', '==', userId)
      .where('companyId', '==', companyId)
      .where('year', '==', year)
      .where('month', '==', month)
      .get();

    if (!existingBatch.empty) {
      // Devolver el lote existente en lugar de error
      const existingDoc = existingBatch.docs[0];
      const existingData = existingDoc.data();
      return NextResponse.json({ 
        success: true, 
        data: { 
          id: existingDoc.id, 
          ...existingData,
          dueDate: existingData.dueDate?.toDate(),
          confirmedAt: existingData.confirmedAt?.toDate(),
          createdAt: existingData.createdAt?.toDate(),
          updatedAt: existingData.updatedAt?.toDate(),
          isExisting: true 
        } 
      });
    }

    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    
    const batchTitle = title || `Nóminas ${monthNames[month - 1]} ${year}`;

    const now = new Date();
    const batchData = {
      userId,
      companyId,
      year,
      month,
      title: batchTitle,
      totalAmount: 0,
      workerCount: 0,
      status: 'DRAFT' as PayrollBatchStatus,
      dueDate: dueDate ? new Date(dueDate) : null,
      notes: notes || '',
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection('payroll_batches').add(batchData);

    return NextResponse.json({ 
      success: true, 
      data: { 
        id: docRef.id, 
        ...batchData,
        isExisting: false
      } 
    }, { status: 201 });
  });
}
