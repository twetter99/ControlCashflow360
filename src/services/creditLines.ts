import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
  DocumentData,
  QueryConstraint,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/config';
import { CreditLine, CreateCreditLineInput, UpdateCreditLineInput } from '@/types';

const COLLECTION_NAME = 'credit_lines';

/**
 * Convierte un documento de Firestore a CreditLine
 */
function documentToCreditLine(id: string, data: DocumentData): CreditLine {
  return {
    id,
    companyId: data.companyId,
    bankName: data.bankName,
    alias: data.alias,
    creditLimit: data.creditLimit,
    currentDrawn: data.currentDrawn,
    available: data.available,
    interestRate: data.interestRate,
    expiryDate: data.expiryDate?.toDate(),
    autoDrawThreshold: data.autoDrawThreshold,
    status: data.status,
    lastUpdatedBy: data.lastUpdatedBy,
    lastUpdateDate: data.lastUpdateDate?.toDate(),
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
}

/**
 * Obtener todas las pólizas de crédito
 */
export async function getCreditLines(companyId?: string, onlyActive = true): Promise<CreditLine[]> {
  const db = getDb();
  const constraints: QueryConstraint[] = [];
  
  if (companyId) {
    constraints.push(where('companyId', '==', companyId));
  }
  if (onlyActive) {
    constraints.push(where('status', '==', 'ACTIVE'));
  }
  constraints.push(orderBy('bankName'));

  const q = query(collection(db, COLLECTION_NAME), ...constraints);
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map((docSnap) => documentToCreditLine(docSnap.id, docSnap.data()));
}

/**
 * Obtener una póliza por ID
 */
export async function getCreditLineById(id: string): Promise<CreditLine | null> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  const snapshot = await getDoc(docRef);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  return documentToCreditLine(snapshot.id, snapshot.data());
}

/**
 * Crear una nueva póliza
 */
export async function createCreditLine(data: CreateCreditLineInput): Promise<CreditLine> {
  const db = getDb();
  const docData = {
    ...data,
    available: data.creditLimit - data.currentDrawn,
    expiryDate: Timestamp.fromDate(data.expiryDate),
    lastUpdateDate: Timestamp.now(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, COLLECTION_NAME), docData);
  
  return {
    ...data,
    id: docRef.id,
    available: data.creditLimit - data.currentDrawn,
    lastUpdateDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Actualizar una póliza
 */
export async function updateCreditLine(id: string, data: UpdateCreditLineInput): Promise<void> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  
  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: Timestamp.now(),
  };
  
  // Recalcular disponible si se actualiza límite o dispuesto
  if (data.creditLimit !== undefined || data.currentDrawn !== undefined) {
    const current = await getCreditLineById(id);
    if (current) {
      const limit = data.creditLimit ?? current.creditLimit;
      const drawn = data.currentDrawn ?? current.currentDrawn;
      updateData.available = limit - drawn;
    }
  }
  
  if (data.expiryDate) {
    updateData.expiryDate = Timestamp.fromDate(data.expiryDate);
  }
  
  await updateDoc(docRef, updateData);
}

/**
 * Actualizar el dispuesto de una póliza
 */
export async function updateCreditLineDrawn(
  id: string,
  newDrawn: number,
  userId: string
): Promise<void> {
  const db = getDb();
  const creditLine = await getCreditLineById(id);
  if (!creditLine) {
    throw new Error(`Credit line ${id} not found`);
  }

  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, {
    currentDrawn: newDrawn,
    available: creditLine.creditLimit - newDrawn,
    lastUpdateDate: Timestamp.now(),
    lastUpdatedBy: userId,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Eliminar una póliza (soft delete)
 */
export async function deleteCreditLine(id: string): Promise<void> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, {
    status: 'INACTIVE',
    updatedAt: Timestamp.now(),
  });
}

/**
 * Obtener total de crédito disponible
 */
export async function getTotalCreditAvailable(companyId?: string): Promise<number> {
  const creditLines = await getCreditLines(companyId, true);
  return creditLines.reduce((sum, cl) => sum + cl.available, 0);
}

/**
 * Obtener total de crédito por empresa
 */
export async function getCreditAvailableByCompany(): Promise<Record<string, number>> {
  const creditLines = await getCreditLines(undefined, true);
  const totals: Record<string, number> = {};
  
  for (const cl of creditLines) {
    if (!totals[cl.companyId]) {
      totals[cl.companyId] = 0;
    }
    totals[cl.companyId] += cl.available;
  }
  
  return totals;
}

/**
 * Obtener pólizas que vencen pronto
 */
export async function getExpiringCreditLines(daysAhead = 90): Promise<CreditLine[]> {
  const creditLines = await getCreditLines(undefined, true);
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() + daysAhead);
  
  return creditLines.filter((cl) => cl.expiryDate <= thresholdDate);
}

/**
 * Obtener pólizas con disponible bajo (menos del 20%)
 */
export async function getLowAvailableCreditLines(): Promise<CreditLine[]> {
  const creditLines = await getCreditLines(undefined, true);
  return creditLines.filter((cl) => cl.available / cl.creditLimit < 0.2);
}
