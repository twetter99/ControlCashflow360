import { NextRequest } from 'next/server';
import {
  authenticateRequest,
  successResponse,
  withErrorHandling,
} from '@/lib/api-utils';
import { 
  getAuditLogs, 
  getEntityHistory, 
  getUserActivitySummary,
  AuditEntity,
  AuditAction 
} from '@/lib/audit-logger';

/**
 * GET /api/audit-logs - Obtener logs de auditoría del usuario
 * 
 * Query params:
 * - entity: Filtrar por tipo de entidad (company, account, transaction, credit_line)
 * - entityId: Filtrar por ID de entidad específica
 * - action: Filtrar por acción (CREATE, UPDATE, DELETE, etc.)
 * - startDate: Fecha de inicio (ISO string)
 * - endDate: Fecha de fin (ISO string)
 * - limit: Número máximo de resultados (default: 100)
 * - summary: Si es 'true', devuelve resumen de actividad
 * - days: Días para el resumen (default: 30)
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const authResult = await authenticateRequest(request);
    if ('error' in authResult) return authResult.error;
    const { userId } = authResult;

    const { searchParams } = new URL(request.url);
    
    // Si se solicita resumen de actividad
    const summaryParam = searchParams.get('summary');
    if (summaryParam === 'true') {
      const days = parseInt(searchParams.get('days') || '30', 10);
      const summary = await getUserActivitySummary(userId, days);
      return successResponse(summary);
    }
    
    // Si se solicita historial de una entidad específica
    const entityId = searchParams.get('entityId');
    const entity = searchParams.get('entity') as AuditEntity | null;
    
    if (entityId && entity) {
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const history = await getEntityHistory(userId, entity, entityId, limit);
      return successResponse(history);
    }
    
    // Consulta general de logs
    const action = searchParams.get('action') as AuditAction | null;
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    
    const logs = await getAuditLogs(userId, {
      entity: entity || undefined,
      action: action || undefined,
      startDate: startDateStr ? new Date(startDateStr) : undefined,
      endDate: endDateStr ? new Date(endDateStr) : undefined,
      limit,
    });

    return successResponse(logs);
  });
}
