import { NextRequest } from 'next/server';
import {
  authenticateRequest,
  successResponse,
  withErrorHandling,
} from '@/lib/api-utils';
import { regenerateAllUserRecurrences } from '@/lib/recurrence-generator';

/**
 * POST /api/recurrences/regenerate - Regenerar transacciones para todas las recurrencias activas
 * 
 * Útil para:
 * - Llamar al cargar el dashboard
 * - Asegurar que existen transacciones para los próximos meses
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    // Parámetros opcionales
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId') || undefined;
    const monthsAhead = searchParams.get('monthsAhead') 
      ? parseInt(searchParams.get('monthsAhead')!, 10) 
      : undefined;

    const results = await regenerateAllUserRecurrences(userId, companyId, {
      monthsAhead,
      skipExisting: true,
    });

    // Calcular totales
    const summary = {
      recurrencesProcessed: results.length,
      totalGenerated: results.reduce((sum, r) => sum + r.generatedCount, 0),
      totalSkipped: results.reduce((sum, r) => sum + r.skippedCount, 0),
      details: results.map(r => ({
        recurrenceId: r.recurrenceId,
        generated: r.generatedCount,
        skipped: r.skippedCount,
      })),
    };

    return successResponse(summary);
  });
}
