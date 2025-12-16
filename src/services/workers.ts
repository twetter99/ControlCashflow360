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
  Timestamp,
  DocumentData,
  QueryConstraint,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/config';
import { Worker, CreateWorkerInput, UpdateWorkerInput, EntityStatus } from '@/types';

const COLLECTION_NAME = 'workers';

/**
 * Convierte un documento de Firestore a Worker
 */
function documentToWorker(id: string, data: DocumentData): Worker {
  return {
    id,
    userId: data.userId || '',
    companyId: data.companyId,
    displayName: data.displayName,
    identifier: data.identifier,
    alias: data.alias,
    iban: data.iban,
    bankAlias: data.bankAlias,
    status: data.status || 'ACTIVE',
    defaultAmount: data.defaultAmount,
    notes: data.notes,
    createdBy: data.createdBy,
    lastUpdatedBy: data.lastUpdatedBy,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
}

/**
 * Obtener trabajadores con filtros
 */
export async function getWorkers(options: {
  userId: string;
  companyId?: string;
  status?: EntityStatus;
}): Promise<Worker[]> {
  const db = getDb();
  const constraints: QueryConstraint[] = [
    where('userId', '==', options.userId)
  ];
  
  if (options.companyId) {
    constraints.push(where('companyId', '==', options.companyId));
  }
  if (options.status) {
    constraints.push(where('status', '==', options.status));
  }

  const q = query(collection(db, COLLECTION_NAME), ...constraints);
  const snapshot = await getDocs(q);
  
  const workers = snapshot.docs.map((docSnap) => documentToWorker(docSnap.id, docSnap.data()));
  
  // Ordenar por nombre
  return workers.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Obtener trabajadores activos de una empresa
 */
export async function getActiveWorkers(userId: string, companyId: string): Promise<Worker[]> {
  return getWorkers({ userId, companyId, status: 'ACTIVE' });
}

/**
 * Obtener un trabajador por ID
 */
export async function getWorkerById(id: string): Promise<Worker | null> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  const snapshot = await getDoc(docRef);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  return documentToWorker(snapshot.id, snapshot.data());
}

/**
 * Crear un nuevo trabajador
 */
export async function createWorker(userId: string, data: CreateWorkerInput): Promise<Worker> {
  const db = getDb();
  const docData = {
    ...data,
    userId,
    status: 'ACTIVE' as EntityStatus,
    iban: data.iban.toUpperCase().replace(/\s/g, ''), // Normalizar IBAN
    createdBy: userId,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, COLLECTION_NAME), docData);
  
  return {
    ...data,
    id: docRef.id,
    userId,
    status: 'ACTIVE',
    iban: docData.iban,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Actualizar un trabajador
 */
export async function updateWorker(id: string, data: UpdateWorkerInput, userId: string): Promise<void> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  
  const updateData: Record<string, unknown> = {
    ...data,
    lastUpdatedBy: userId,
    updatedAt: Timestamp.now(),
  };
  
  // Normalizar IBAN si se actualiza
  if (data.iban) {
    updateData.iban = data.iban.toUpperCase().replace(/\s/g, '');
  }
  
  await updateDoc(docRef, updateData);
}

/**
 * Desactivar un trabajador (soft delete)
 */
export async function deactivateWorker(id: string, userId: string): Promise<void> {
  await updateWorker(id, { status: 'INACTIVE' }, userId);
}

/**
 * Reactivar un trabajador
 */
export async function reactivateWorker(id: string, userId: string): Promise<void> {
  await updateWorker(id, { status: 'ACTIVE' }, userId);
}

/**
 * Eliminar un trabajador definitivamente
 * (solo si no tiene historial de pagos)
 */
export async function deleteWorker(id: string): Promise<void> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  await deleteDoc(docRef);
}

/**
 * Verificar si hay trabajadores sin IBAN válido
 */
export function validateWorkersIBAN(workers: Worker[]): { workerId: string; workerName: string }[] {
  return workers
    .filter(w => !w.iban || w.iban.trim() === '')
    .map(w => ({ workerId: w.id, workerName: w.displayName }));
}
