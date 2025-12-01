import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';

/**
 * GET /api/debug/transactions - Ver todas las transacciones con sus fechas
 */
export async function GET(request: NextRequest) {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection('transactions').get();
    
    const today = new Date();
    
    const transactions = snapshot.docs.map(doc => {
      const data = doc.data();
      const dueDate = data.dueDate?.toDate?.() || null;
      const daysDiff = dueDate ? Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
      
      return {
        id: doc.id,
        description: data.description,
        amount: data.amount,
        type: data.type,
        status: data.status,
        dueDate: dueDate?.toISOString(),
        daysDiff,
        period: daysDiff !== null ? (
          daysDiff <= 30 ? '0-30' :
          daysDiff <= 60 ? '31-60' :
          daysDiff <= 90 ? '61-90' : '>90'
        ) : 'unknown',
        recurrence: data.recurrence,
        recurrenceId: data.recurrenceId,
        isRecurrenceInstance: data.isRecurrenceInstance,
        companyId: data.companyId,
        userId: data.userId,
      };
    });

    // Ordenar por fecha
    transactions.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

    return NextResponse.json({
      today: today.toISOString(),
      count: transactions.length,
      transactions,
      summary: {
        '0-30': transactions.filter(t => t.period === '0-30').length,
        '31-60': transactions.filter(t => t.period === '31-60').length,
        '61-90': transactions.filter(t => t.period === '61-90').length,
        '>90': transactions.filter(t => t.period === '>90').length,
      }
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
