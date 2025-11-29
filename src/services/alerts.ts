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
import { AlertConfig, Alert, AlertType } from '@/types';

const CONFIGS_COLLECTION = 'alert_configs';
const ALERTS_COLLECTION = 'alerts';

/**
 * Convierte un documento de Firestore a AlertConfig
 */
function documentToAlertConfig(id: string, data: DocumentData): AlertConfig {
  return {
    id,
    userId: data.userId,
    companyId: data.companyId,
    type: data.type,
    threshold: data.threshold,
    enabled: data.enabled,
    notifyEmail: data.notifyEmail,
    notifyInApp: data.notifyInApp,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
}

/**
 * Convierte un documento de Firestore a Alert
 */
function documentToAlert(id: string, data: DocumentData): Alert {
  return {
    id,
    configId: data.configId,
    type: data.type,
    companyId: data.companyId,
    message: data.message,
    severity: data.severity,
    value: data.value,
    threshold: data.threshold,
    isRead: data.isRead,
    createdAt: data.createdAt?.toDate(),
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
  data: Omit<AlertConfig, 'id' | 'createdAt' | 'updatedAt'>
): Promise<AlertConfig> {
  const db = getDb();
  const docRef = await addDoc(collection(db, CONFIGS_COLLECTION), {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  
  return {
    ...data,
    id: docRef.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Actualizar configuración de alerta
 */
export async function updateAlertConfig(
  id: string,
  data: Partial<Omit<AlertConfig, 'id' | 'createdAt'>>
): Promise<void> {
  const db = getDb();
  const docRef = doc(db, CONFIGS_COLLECTION, id);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
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
