import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  Timestamp,
  DocumentData,
  QueryConstraint,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/config';
import { 
  AccountHold, 
  CreateAccountHoldInput, 
  UpdateAccountHoldInput,
  AccountHoldStatus 
} from '@/types';

const COLLECTION_NAME = 'account_holds';

/**
 * Convierte un documento de Firestore a AccountHold
 */
function documentToAccountHold(id: string, data: DocumentData): AccountHold {
  return {
    id,
    userId: data.userId || '',
    companyId: data.companyId,
    accountId: data.accountId,
    concept: data.concept || '',
    amount: data.amount || 0,
    startDate: data.startDate?.toDate() || new Date(),
    endDate: data.endDate?.toDate() || null,
    type: data.type || 'OTHER',
    status: data.status || 'ACTIVE',
    reference: data.reference,
    notes: data.notes,
    createdBy: data.createdBy,
    lastUpdatedBy: data.lastUpdatedBy,
    releasedAt: data.releasedAt?.toDate(),
    releasedBy: data.releasedBy,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
}

/**
 * Obtener retenciones de una cuenta específica
 */
export async function getAccountHolds(
  userId: string, 
  accountId?: string,
  status?: AccountHoldStatus
): Promise<AccountHold[]> {
  const db = getDb();
  const constraints: QueryConstraint[] = [
    where('userId', '==', userId)
  ];
  
  if (accountId) {
    constraints.push(where('accountId', '==', accountId));
  }
  
  if (status) {
    constraints.push(where('status', '==', status));
  }

  const q = query(collection(db, COLLECTION_NAME), ...constraints);
  const snapshot = await getDocs(q);
  
  const holds = snapshot.docs.map((docSnap) => 
    documentToAccountHold(docSnap.id, docSnap.data())
  );
  
  // Ordenar por fecha de inicio descendente
  return holds.sort((a, b) => 
    new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );
}

/**
 * Obtener retenciones activas de una cuenta
 */
export async function getActiveHolds(userId: string, accountId: string): Promise<AccountHold[]> {
  return getAccountHolds(userId, accountId, 'ACTIVE');
}

/**
 * Calcular el total retenido de una cuenta
 */
export async function getTotalHoldAmount(userId: string, accountId: string): Promise<number> {
  const activeHolds = await getActiveHolds(userId, accountId);
  return activeHolds.reduce((sum, hold) => sum + hold.amount, 0);
}

/**
 * Obtener una retención por ID
 */
export async function getAccountHoldById(id: string): Promise<AccountHold | null> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  const snapshot = await getDoc(docRef);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  return documentToAccountHold(snapshot.id, snapshot.data());
}

/**
 * Crear una nueva retención
 */
export async function createAccountHold(
  userId: string, 
  data: CreateAccountHoldInput
): Promise<AccountHold> {
  const db = getDb();
  
  const docData = {
    userId,
    companyId: data.companyId,
    accountId: data.accountId,
    concept: data.concept,
    amount: data.amount,
    startDate: Timestamp.fromDate(new Date(data.startDate)),
    endDate: data.endDate ? Timestamp.fromDate(new Date(data.endDate)) : null,
    type: data.type,
    status: 'ACTIVE' as AccountHoldStatus,
    reference: data.reference || null,
    notes: data.notes || null,
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
    startDate: new Date(data.startDate),
    endDate: data.endDate ? new Date(data.endDate) : undefined,
    createdBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Actualizar una retención existente
 */
export async function updateAccountHold(
  id: string,
  userId: string,
  data: UpdateAccountHoldInput
): Promise<void> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  
  const updateData: Record<string, unknown> = {
    lastUpdatedBy: userId,
    updatedAt: Timestamp.now(),
  };
  
  if (data.concept !== undefined) updateData.concept = data.concept;
  if (data.amount !== undefined) updateData.amount = data.amount;
  if (data.startDate !== undefined) {
    updateData.startDate = Timestamp.fromDate(new Date(data.startDate));
  }
  if (data.endDate !== undefined) {
    updateData.endDate = data.endDate ? Timestamp.fromDate(new Date(data.endDate)) : null;
  }
  if (data.type !== undefined) updateData.type = data.type;
  if (data.reference !== undefined) updateData.reference = data.reference;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.status !== undefined) {
    updateData.status = data.status;
    if (data.status === 'RELEASED') {
      updateData.releasedAt = Timestamp.now();
      updateData.releasedBy = userId;
    }
  }
  
  await updateDoc(docRef, updateData);
}

/**
 * Liberar una retención (marcarla como liberada)
 */
export async function releaseAccountHold(id: string, userId: string): Promise<void> {
  await updateAccountHold(id, userId, { status: 'RELEASED' });
}

/**
 * Verificar y actualizar retenciones expiradas
 * Llamar periódicamente o al cargar las retenciones
 */
export async function checkExpiredHolds(userId: string): Promise<number> {
  const db = getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Obtener retenciones activas con fecha de fin pasada
  const activeHolds = await getAccountHolds(userId, undefined, 'ACTIVE');
  
  let expiredCount = 0;
  
  for (const hold of activeHolds) {
    if (hold.endDate && new Date(hold.endDate) < today) {
      await updateAccountHold(hold.id, userId, { status: 'EXPIRED' });
      expiredCount++;
    }
  }
  
  return expiredCount;
}
