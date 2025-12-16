import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  authenticateRequest,
  withErrorHandling,
} from '@/lib/api-utils';
import { Worker } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET: Obtener un trabajador por ID
export async function GET(request: NextRequest, context: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;
    const { id } = await context.params;

    const db = getAdminDb();
    const docRef = db.collection('workers').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Trabajador no encontrado' },
        { status: 404 }
      );
    }

    const data = doc.data()!;
    
    // Verificar que pertenece al usuario
    if (data.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 403 }
      );
    }

    const worker: Worker = {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate(),
    } as Worker;

    return NextResponse.json({ success: true, data: worker });
  });
}

// PUT: Actualizar trabajador
export async function PUT(request: NextRequest, context: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;
    const { id } = await context.params;

    const db = getAdminDb();
    const docRef = db.collection('workers').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Trabajador no encontrado' },
        { status: 404 }
      );
    }

    const existingData = doc.data()!;
    
    // Verificar que pertenece al usuario
    if (existingData.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { 
      displayName, 
      identifier, 
      alias, 
      iban, 
      bankAlias, 
      defaultAmount,
      defaultExtraAmount,
      numberOfPayments,
      extrasProrated,
      status,
      notes 
    } = body;

    const updateData: Record<string, unknown> = {
      lastUpdatedBy: userId,
      updatedAt: new Date(),
    };

    if (displayName !== undefined) updateData.displayName = displayName.trim();
    if (identifier !== undefined) updateData.identifier = identifier?.trim() || null;
    if (alias !== undefined) updateData.alias = alias?.trim() || null;
    if (iban !== undefined) updateData.iban = iban.toUpperCase().replace(/\s/g, '');
    if (bankAlias !== undefined) updateData.bankAlias = bankAlias?.trim() || null;
    if (defaultAmount !== undefined) updateData.defaultAmount = defaultAmount;
    if (defaultExtraAmount !== undefined) updateData.defaultExtraAmount = defaultExtraAmount;
    if (numberOfPayments !== undefined) updateData.numberOfPayments = numberOfPayments;
    if (extrasProrated !== undefined) updateData.extrasProrated = extrasProrated;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    await docRef.update(updateData);

    const updatedDoc = await docRef.get();
    const updatedData = updatedDoc.data()!;

    const worker: Worker = {
      id: updatedDoc.id,
      ...updatedData,
      createdAt: updatedData.createdAt?.toDate(),
      updatedAt: updatedData.updatedAt?.toDate(),
    } as Worker;

    return NextResponse.json({ success: true, data: worker });
  });
}

// DELETE: Eliminar trabajador (soft delete - cambiar a INACTIVE)
export async function DELETE(request: NextRequest, context: RouteParams) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;
    const { id } = await context.params;

    const db = getAdminDb();
    const docRef = db.collection('workers').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: 'Trabajador no encontrado' },
        { status: 404 }
      );
    }

    const data = doc.data()!;
    
    // Verificar que pertenece al usuario
    if (data.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 403 }
      );
    }

    // Verificar si tiene líneas de nómina asociadas
    const payrollLines = await db.collection('payroll_lines')
      .where('workerId', '==', id)
      .limit(1)
      .get();

    if (!payrollLines.empty) {
      // Si tiene historial, hacer soft delete
      await docRef.update({
        status: 'INACTIVE',
        lastUpdatedBy: userId,
        updatedAt: new Date(),
      });
      return NextResponse.json({ 
        success: true, 
        data: { message: 'Trabajador desactivado (tiene historial de pagos)' } 
      });
    }

    // Si no tiene historial, eliminar completamente
    await docRef.delete();

    return NextResponse.json({ 
      success: true, 
      data: { message: 'Trabajador eliminado' } 
    });
  });
}
