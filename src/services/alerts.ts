import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  DocumentData,
  QueryConstraint,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/config';
import { AlertConfig, Alert, AlertType, CreateAlertConfigInput, UpdateAlertConfigInput } from '@/types';

const CONFIGS_COLLECTION = 'alert_configs';
const ALERTS_COLLECTION = 'alerts';

/**
 * Convierte un documento de Firestore a AlertConfig
 */
function documentToAlertConfig(id: string, data: DocumentData): AlertConfig {
  return {
    id,
    userId: data.userId || '',
    type: data.type as AlertType,
    threshold: data.threshold || 0,
    companyId: data.companyId || undefined,
    companyName: data.companyName || (data.companyId ? undefined : 'Todas las empresas'),
    enabled: data.enabled ?? true,
    notifyInApp: data.notifyInApp ?? true,
    notifyByEmail: data.notifyByEmail ?? data.notifyEmail ?? false,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  };
}

/**
 * Convierte un documento de Firestore a Alert
 */
function documentToAlert(id: string, data: DocumentData): Alert {
  return {
    id,
    userId: data.userId || '',
    alertConfigId: data.alertConfigId || data.configId || '',
    type: data.type as AlertType,
    message: data.message || '',
    severity: data.severity || 'MEDIUM',
    companyId: data.companyId || undefined,
    companyName: data.companyName || undefined,
    isRead: data.isRead ?? false,
    isDismissed: data.isDismissed ?? false,
    createdAt: data.createdAt?.toDate() || new Date(),
    readAt: data.readAt?.toDate() || undefined,
    dismissedAt: data.dismissedAt?.toDate() || undefined,
  };
}

// ============================================
// Alert Configs CRUD
// ============================================

/**
 * Obtener configuraciones de alerta del usuario
 */
export async function getAlertConfigs(userId: string, companyId?: string): Promise<AlertConfig[]> {
  const db = getDb();
  const constraints: QueryConstraint[] = [where('userId', '==', userId)];
  
  if (companyId) {
    constraints.push(where('companyId', '==', companyId));
  }
  
  constraints.push(orderBy('type'));
  
  const q = query(collection(db, CONFIGS_COLLECTION), ...constraints);
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map((docSnap) => documentToAlertConfig(docSnap.id, docSnap.data()));
}

/**
 * Obtener una configuración de alerta por ID
 */
export async function getAlertConfigById(id: string): Promise<AlertConfig | null> {
  const db = getDb();
  const docRef = doc(db, CONFIGS_COLLECTION, id);
  const snapshot = await getDoc(docRef);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  return documentToAlertConfig(snapshot.id, snapshot.data());
}

/**
 * Crear configuración de alerta
 */
export async function createAlertConfig(
  userId: string,
  input: CreateAlertConfigInput,
  companyName?: string
): Promise<AlertConfig> {
  const db = getDb();
  const now = Timestamp.now();
  
  const docData = {
    userId,
    type: input.type,
    threshold: input.threshold,
    companyId: input.companyId || null,
    companyName: input.companyId ? companyName : 'Todas las empresas',
    enabled: input.enabled ?? true,
    notifyInApp: input.notifyInApp ?? true,
    notifyByEmail: input.notifyByEmail ?? false,
    createdAt: now,
    updatedAt: now,
  };
  
  const docRef = await addDoc(collection(db, CONFIGS_COLLECTION), docData);
  
  return {
    id: docRef.id,
    userId,
    type: input.type,
    threshold: input.threshold,
    companyId: input.companyId || undefined,
    companyName: input.companyId ? companyName : 'Todas las empresas',
    enabled: input.enabled ?? true,
    notifyInApp: input.notifyInApp ?? true,
    notifyByEmail: input.notifyByEmail ?? false,
    createdAt: now.toDate(),
    updatedAt: now.toDate(),
  };
}

/**
 * Actualizar configuración de alerta
 */
export async function updateAlertConfig(
  id: string,
  input: UpdateAlertConfigInput,
  companyName?: string
): Promise<AlertConfig> {
  const db = getDb();
  const docRef = doc(db, CONFIGS_COLLECTION, id);
  
  const existing = await getDoc(docRef);
  if (!existing.exists()) {
    throw new Error('Configuración de alerta no encontrada');
  }
  
  const updateData: Record<string, unknown> = {
    updatedAt: Timestamp.now(),
  };
  
  if (input.type !== undefined) updateData.type = input.type;
  if (input.threshold !== undefined) updateData.threshold = input.threshold;
  if (input.companyId !== undefined) {
    updateData.companyId = input.companyId || null;
    updateData.companyName = input.companyId ? companyName : 'Todas las empresas';
  }
  if (input.enabled !== undefined) updateData.enabled = input.enabled;
  if (input.notifyInApp !== undefined) updateData.notifyInApp = input.notifyInApp;
  if (input.notifyByEmail !== undefined) updateData.notifyByEmail = input.notifyByEmail;
  
  await updateDoc(docRef, updateData);
  
  // Obtener y retornar la configuración actualizada
  const updated = await getAlertConfigById(id);
  if (!updated) {
    throw new Error('Error al obtener configuración actualizada');
  }
  
  return updated;
}

/**
 * Eliminar configuración de alerta
 */
export async function deleteAlertConfig(id: string): Promise<void> {
  const db = getDb();
  const docRef = doc(db, CONFIGS_COLLECTION, id);
  await deleteDoc(docRef);
}

/**
 * Habilitar/deshabilitar configuración de alerta
 */
export async function toggleAlertConfig(id: string, enabled: boolean): Promise<void> {
  const db = getDb();
  const docRef = doc(db, CONFIGS_COLLECTION, id);
  await updateDoc(docRef, {
    enabled,
    updatedAt: Timestamp.now(),
  });
}

// ============================================
// Alerts CRUD
// ============================================

/**
 * Obtener alertas no leídas
 */
export async function getUnreadAlerts(companyId?: string): Promise<Alert[]> {
  const db = getDb();
  const constraints: QueryConstraint[] = [where('isRead', '==', false)];
  
  if (companyId) {
    constraints.push(where('companyId', '==', companyId));
  }
  
  constraints.push(orderBy('createdAt', 'desc'));
  
  const q = query(collection(db, ALERTS_COLLECTION), ...constraints);
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map((docSnap) => documentToAlert(docSnap.id, docSnap.data()));
}

/**
 * Obtener alertas recientes
 */
export async function getRecentAlerts(companyId?: string, days: number = 7): Promise<Alert[]> {
  const db = getDb();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  
  const constraints: QueryConstraint[] = [
    where('createdAt', '>=', Timestamp.fromDate(fromDate)),
  ];
  
  if (companyId) {
    constraints.push(where('companyId', '==', companyId));
  }
  
  constraints.push(orderBy('createdAt', 'desc'));
  
  const q = query(collection(db, ALERTS_COLLECTION), ...constraints);
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map((docSnap) => documentToAlert(docSnap.id, docSnap.data()));
}

/**
 * Crear alerta
 */
export async function createAlert(
  data: Omit<Alert, 'id' | 'createdAt'>
): Promise<Alert> {
  const db = getDb();
  const docRef = await addDoc(collection(db, ALERTS_COLLECTION), {
    ...data,
    createdAt: Timestamp.now(),
  });
  
  return {
    ...data,
    id: docRef.id,
    createdAt: new Date(),
  };
}

/**
 * Marcar alerta como leída
 */
export async function markAlertAsRead(id: string): Promise<void> {
  const db = getDb();
  const docRef = doc(db, ALERTS_COLLECTION, id);
  await updateDoc(docRef, {
    isRead: true,
  });
}

/**
 * Marcar todas las alertas como leídas
 */
export async function markAllAlertsAsRead(companyId?: string): Promise<void> {
  const unread = await getUnreadAlerts(companyId);
  
  for (const alert of unread) {
    await markAlertAsRead(alert.id);
  }
}

/**
 * Obtener descripción de tipo de alerta
 */
export function getAlertTypeDescription(type: AlertType): string {
  const descriptions: Record<AlertType, string> = {
    MIN_LIQUIDITY: 'Liquidez mínima',
    CRITICAL_RUNWAY: 'Runway crítico',
    CONCENTRATED_MATURITIES: 'Vencimientos concentrados',
    LOW_CREDIT_LINE: 'Póliza baja',
    OVERDUE_COLLECTIONS: 'Cobros atrasados',
    STALE_DATA: 'Dato caduco',
    CREDIT_NEED: 'Necesidad de póliza',
  };
  
  return descriptions[type] || type;
}
