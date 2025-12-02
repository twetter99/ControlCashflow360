import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { authenticateRequest, successResponse, errorResponse } from '@/lib/api-utils';
import { MonthlyBudget } from '@/types';

// Colección de presupuestos mensuales
const COLLECTION = 'monthly_budgets';

/**
 * GET /api/budgets
 * Obtiene todos los presupuestos mensuales del usuario
 * Query params opcionales: year (para filtrar por año)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;
    
    const { searchParams } = new URL(request.url);
    const yearFilter = searchParams.get('year');
    
    const db = getAdminDb();

    // Query simple sin orderBy compuesto (evita necesitar índice)
    const snapshot = await db
      .collection(COLLECTION)
      .where('userId', '==', userId)
      .get();
    
    let budgets: MonthlyBudget[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate(),
    })) as MonthlyBudget[];

    // Filtrar por año si se especifica
    if (yearFilter) {
      const year = parseInt(yearFilter);
      budgets = budgets.filter(b => b.year === year);
    }

    // Ordenar en memoria: por año desc, luego por mes asc
    budgets.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return a.month - b.month;
    });

    return successResponse(budgets);
  } catch (error) {
    console.error('Error fetching budgets:', error);
    return errorResponse('Error al obtener presupuestos', 500);
  }
}

/**
 * POST /api/budgets
 * Crea o actualiza un presupuesto mensual (upsert por año/mes)
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;
    
    const body = await request.json();
    const { year, month, incomeGoal, notes } = body;
    
    const db = getAdminDb();

    // Validaciones
    if (!year || !month || incomeGoal === undefined) {
      return NextResponse.json(
        { success: false, error: 'year, month e incomeGoal son requeridos' },
        { status: 400 }
      );
    }

    if (month < 1 || month > 12) {
      return NextResponse.json(
        { success: false, error: 'month debe estar entre 1 y 12' },
        { status: 400 }
      );
    }

    if (incomeGoal < 0) {
      return NextResponse.json(
        { success: false, error: 'incomeGoal no puede ser negativo' },
        { status: 400 }
      );
    }

    // Buscar si ya existe un presupuesto para ese año/mes
    const existing = await db
      .collection(COLLECTION)
      .where('userId', '==', userId)
      .where('year', '==', year)
      .where('month', '==', month)
      .limit(1)
      .get();

    const now = new Date();
    
    if (!existing.empty) {
      // Actualizar existente
      const docRef = existing.docs[0].ref;
      await docRef.update({
        incomeGoal,
        notes: notes || '',
        updatedAt: now,
      });
      
      return successResponse({
        id: docRef.id,
        userId,
        year,
        month,
        incomeGoal,
        notes: notes || '',
        updatedAt: now,
      });
    } else {
      // Crear nuevo
      const budgetData = {
        userId,
        year,
        month,
        incomeGoal,
        notes: notes || '',
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await db.collection(COLLECTION).add(budgetData);
      
      return successResponse({
        id: docRef.id,
        ...budgetData,
      });
    }
  } catch (error) {
    console.error('Error creating/updating budget:', error);
    return errorResponse('Error al guardar presupuesto', 500);
  }
}

/**
 * PUT /api/budgets
 * Actualización masiva de presupuestos (para copiar de año anterior, etc.)
 */
export async function PUT(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;
    
    const body = await request.json();
    const { budgets } = body as { budgets: Array<{ year: number; month: number; incomeGoal: number; notes?: string }> };
    
    const db = getAdminDb();

    if (!Array.isArray(budgets) || budgets.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Se requiere un array de budgets' },
        { status: 400 }
      );
    }

    const now = new Date();
    const results: MonthlyBudget[] = [];

    for (const budget of budgets) {
      const { year, month, incomeGoal, notes } = budget;

      // Buscar existente
      const existing = await db
        .collection(COLLECTION)
        .where('userId', '==', userId)
        .where('year', '==', year)
        .where('month', '==', month)
        .limit(1)
        .get();

      if (!existing.empty) {
        // Actualizar
        const docRef = existing.docs[0].ref;
        await docRef.update({
          incomeGoal,
          notes: notes || '',
          updatedAt: now,
        });
        results.push({
          id: docRef.id,
          userId,
          year,
          month,
          incomeGoal,
          notes,
          updatedAt: now,
        });
      } else {
        // Crear
        const budgetData = {
          userId,
          year,
          month,
          incomeGoal,
          notes: notes || '',
          createdAt: now,
          updatedAt: now,
        };
        const docRef = await db.collection(COLLECTION).add(budgetData);
        results.push({
          id: docRef.id,
          ...budgetData,
        });
      }
    }

    return successResponse({ updated: results.length, budgets: results });
  } catch (error) {
    console.error('Error bulk updating budgets:', error);
    return errorResponse('Error al actualizar presupuestos', 500);
  }
}
