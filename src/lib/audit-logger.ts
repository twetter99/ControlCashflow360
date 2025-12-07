/**
 * Sistema de Auditoría para WINFIN
 * Registra todas las operaciones importantes en Firestore
 */

import { getAdminDb } from './firebase/admin';
import { FieldValue, QueryDocumentSnapshot, DocumentData } from 'firebase-admin/firestore';

// Tipos de eventos de auditoría
export type AuditAction = 
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'APPROVE'
  | 'REJECT'
  | 'EXECUTE'
  | 'CANCEL'
  | 'REACTIVATE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'EXPORT'
  | 'IMPORT';

export type AuditEntity = 
  | 'company'
  | 'account'
  | 'transaction'
  | 'credit_line'
  | 'credit_card'
  | 'loan'
  | 'recurrence'
  | 'user'
  | 'settings'
  | 'report';

export interface AuditLogEntry {
  id?: string;
  userId: string;
  userEmail?: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityName?: string;
  details?: Record<string, unknown>;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  success: boolean;
  errorMessage?: string;
}

export interface AuditLogOptions {
  userId: string;
  userEmail?: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityName?: string;
  details?: Record<string, unknown>;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
  errorMessage?: string;
}

/**
 * Registra un evento de auditoría en Firestore
 */
export async function logAuditEvent(options: AuditLogOptions): Promise<string | null> {
  try {
    const auditEntry: Omit<AuditLogEntry, 'id'> = {
      userId: options.userId,
      userEmail: options.userEmail,
      action: options.action,
      entity: options.entity,
      entityId: options.entityId,
      entityName: options.entityName,
      details: options.details,
      previousValues: sanitizeForFirestore(options.previousValues),
      newValues: sanitizeForFirestore(options.newValues),
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      timestamp: new Date(),
      success: options.success ?? true,
      errorMessage: options.errorMessage,
    };

    // Eliminar campos undefined para evitar errores de Firestore
    const cleanEntry = Object.fromEntries(
      Object.entries(auditEntry).filter(([, value]) => value !== undefined)
    );

    const db = getAdminDb();
    const docRef = await db.collection('audit_logs').add({
      ...cleanEntry,
      createdAt: FieldValue.serverTimestamp(),
    });

    return docRef.id;
  } catch (error) {
    // No lanzar error para no interrumpir operaciones principales
    console.error('Error al registrar evento de auditoría:', error);
    return null;
  }
}

/**
 * Sanitiza objetos para Firestore (elimina undefined y convierte Dates)
 */
function sanitizeForFirestore(obj: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    
    if (value instanceof Date) {
      sanitized[key] = value.toISOString();
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeForFirestore(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Helper para crear log de creación
 */
export async function logCreate(
  userId: string,
  entity: AuditEntity,
  entityId: string,
  data: Record<string, unknown>,
  options?: Partial<AuditLogOptions>
): Promise<string | null> {
  return logAuditEvent({
    userId,
    action: 'CREATE',
    entity,
    entityId,
    newValues: data,
    ...options,
  });
}

/**
 * Helper para crear log de actualización
 */
export async function logUpdate(
  userId: string,
  entity: AuditEntity,
  entityId: string,
  previousValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
  options?: Partial<AuditLogOptions>
): Promise<string | null> {
  return logAuditEvent({
    userId,
    action: 'UPDATE',
    entity,
    entityId,
    previousValues,
    newValues,
    ...options,
  });
}

/**
 * Helper para crear log de eliminación
 */
export async function logDelete(
  userId: string,
  entity: AuditEntity,
  entityId: string,
  previousValues?: Record<string, unknown>,
  options?: Partial<AuditLogOptions>
): Promise<string | null> {
  return logAuditEvent({
    userId,
    action: 'DELETE',
    entity,
    entityId,
    previousValues,
    ...options,
  });
}

/**
 * Helper para crear log de acción en transacción
 */
export async function logTransactionAction(
  userId: string,
  action: 'APPROVE' | 'REJECT' | 'EXECUTE' | 'CANCEL' | 'REACTIVATE',
  transactionId: string,
  details?: Record<string, unknown>,
  options?: Partial<AuditLogOptions>
): Promise<string | null> {
  return logAuditEvent({
    userId,
    action,
    entity: 'transaction',
    entityId: transactionId,
    details,
    ...options,
  });
}

/**
 * Obtener logs de auditoría con filtros
 */
export interface AuditQueryOptions {
  userId?: string;
  entity?: AuditEntity;
  entityId?: string;
  action?: AuditAction;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export async function getAuditLogs(
  filterUserId: string, // Usuario que realiza la consulta (para seguridad)
  options: AuditQueryOptions = {}
): Promise<AuditLogEntry[]> {
  try {
    const db = getAdminDb();
    let query = db.collection('audit_logs')
      .where('userId', '==', filterUserId) // Solo puede ver sus propios logs
      .orderBy('timestamp', 'desc');

    if (options.entity) {
      query = query.where('entity', '==', options.entity);
    }

    if (options.action) {
      query = query.where('action', '==', options.action);
    }

    if (options.entityId) {
      query = query.where('entityId', '==', options.entityId);
    }

    if (options.startDate) {
      query = query.where('timestamp', '>=', options.startDate);
    }

    if (options.endDate) {
      query = query.where('timestamp', '<=', options.endDate);
    }

    const limit = options.limit || 100;
    query = query.limit(limit);

    const snapshot = await query.get();
    
    return snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate() || new Date(),
    })) as AuditLogEntry[];
  } catch (error) {
    console.error('Error al obtener logs de auditoría:', error);
    return [];
  }
}

/**
 * Obtener historial de cambios de una entidad específica
 */
export async function getEntityHistory(
  userId: string,
  entity: AuditEntity,
  entityId: string,
  limit: number = 50
): Promise<AuditLogEntry[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection('audit_logs')
      .where('userId', '==', userId)
      .where('entity', '==', entity)
      .where('entityId', '==', entityId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate() || new Date(),
    })) as AuditLogEntry[];
  } catch (error) {
    console.error('Error al obtener historial de entidad:', error);
    return [];
  }
}

/**
 * Generar resumen de actividad del usuario
 */
export async function getUserActivitySummary(
  userId: string,
  days: number = 30
): Promise<{
  totalActions: number;
  actionsByType: Record<AuditAction, number>;
  actionsByEntity: Record<AuditEntity, number>;
  recentActions: AuditLogEntry[];
}> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const db = getAdminDb();
    const snapshot = await db.collection('audit_logs')
      .where('userId', '==', userId)
      .where('timestamp', '>=', startDate)
      .orderBy('timestamp', 'desc')
      .limit(1000)
      .get();

    const logs = snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate() || new Date(),
    })) as AuditLogEntry[];

    const actionsByType: Record<string, number> = {};
    const actionsByEntity: Record<string, number> = {};

    for (const log of logs) {
      actionsByType[log.action] = (actionsByType[log.action] || 0) + 1;
      actionsByEntity[log.entity] = (actionsByEntity[log.entity] || 0) + 1;
    }

    return {
      totalActions: logs.length,
      actionsByType: actionsByType as Record<AuditAction, number>,
      actionsByEntity: actionsByEntity as Record<AuditEntity, number>,
      recentActions: logs.slice(0, 10),
    };
  } catch (error) {
    console.error('Error al obtener resumen de actividad:', error);
    return {
      totalActions: 0,
      actionsByType: {} as Record<AuditAction, number>,
      actionsByEntity: {} as Record<AuditEntity, number>,
      recentActions: [],
    };
  }
}
