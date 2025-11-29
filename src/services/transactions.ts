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
  limit,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/config';
import { Transaction, CreateTransactionInput, UpdateTransactionInput, TransactionStatus } from '@/types';

const COLLECTION_NAME = 'transactions';

/**
 * Convierte un documento de Firestore a Transaction
 */
function documentToTransaction(id: string, data: DocumentData): Transaction {
  return {
    id,
    userId: data.userId || '',
    companyId: data.companyId,
    accountId: data.accountId,
    type: data.type,
    amount: data.amount,
    status: data.status,
    dueDate: data.dueDate?.toDate(),
    paidDate: data.paidDate?.toDate() || null,
    category: data.category,
    description: data.description,
    thirdPartyId: data.thirdPartyId,
    thirdPartyName: data.thirdPartyName,
    notes: data.notes,
    recurrence: data.recurrence || 'NONE',
    certainty: data.certainty || 'HIGH',
    recurrenceId: data.recurrenceId,
    createdBy: data.createdBy,
    lastUpdatedBy: data.lastUpdatedBy,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
}

/**
 * Obtener transacciones con filtros
 */
export async function getTransactions(options: {
  userId: string;
  companyId?: string;
  status?: TransactionStatus;
  type?: 'INCOME' | 'EXPENSE';
  fromDate?: Date;
  toDate?: Date;
  limitCount?: number;
}): Promise<Transaction[]> {
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
  if (options.type) {
    constraints.push(where('type', '==', options.type));
  }
  
  if (options.limitCount) {
    constraints.push(limit(options.limitCount));
  }

  const q = query(collection(db, COLLECTION_NAME), ...constraints);
  const snapshot = await getDocs(q);
  
  let transactions = snapshot.docs.map((docSnap) => documentToTransaction(docSnap.id, docSnap.data()));
  
  // Filtrar por fecha en cliente si es necesario
  if (options.fromDate) {
    transactions = transactions.filter(tx => tx.dueDate >= options.fromDate!);
  }
  if (options.toDate) {
    transactions = transactions.filter(tx => tx.dueDate <= options.toDate!);
  }
  
  // Ordenar por fecha en cliente
  return transactions.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
}

/**
 * Obtener transacciones pendientes
 */
export async function getPendingTransactions(userId: string, companyId?: string): Promise<Transaction[]> {
  return getTransactions({ userId, companyId, status: 'PENDING' });
}

/**
 * Obtener transacciones pendientes por rango de fechas
 */
export async function getPendingTransactionsByDateRange(
  userId: string,
  fromDate: Date,
  toDate: Date,
  companyId?: string
): Promise<Transaction[]> {
  return getTransactions({
    userId,
    companyId,
    status: 'PENDING',
    fromDate,
    toDate,
  });
}

/**
 * Obtener una transacción por ID
 */
export async function getTransactionById(id: string): Promise<Transaction | null> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  const snapshot = await getDoc(docRef);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  return documentToTransaction(snapshot.id, snapshot.data());
}

/**
 * Crear una nueva transacción
 */
export async function createTransaction(userId: string, data: CreateTransactionInput): Promise<Transaction> {
  const db = getDb();
  const docData = {
    ...data,
    userId,
    dueDate: Timestamp.fromDate(data.dueDate),
    paidDate: data.paidDate ? Timestamp.fromDate(data.paidDate) : null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, COLLECTION_NAME), docData);
  
  return {
    ...data,
    id: docRef.id,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Actualizar una transacción
 */
export async function updateTransaction(id: string, data: UpdateTransactionInput): Promise<void> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  
  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: Timestamp.now(),
  };
  
  if (data.dueDate) {
    updateData.dueDate = Timestamp.fromDate(data.dueDate);
  }
  if (data.paidDate) {
    updateData.paidDate = Timestamp.fromDate(data.paidDate);
  }
  
  await updateDoc(docRef, updateData);
}

/**
 * Marcar transacción como pagada
 */
export async function markTransactionAsPaid(
  id: string,
  paidDate: Date = new Date(),
  userId: string
): Promise<void> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, {
    status: 'PAID',
    paidDate: Timestamp.fromDate(paidDate),
    lastUpdatedBy: userId,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Cancelar transacción
 */
export async function cancelTransaction(id: string, modifiedByUserId: string): Promise<void> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, {
    status: 'CANCELLED',
    lastUpdatedBy: modifiedByUserId,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Buscar transacciones por importe (para conciliación express)
 */
export async function findTransactionsByAmount(
  userId: string,
  amount: number,
  tolerance: number = 0.01,
  companyId?: string
): Promise<Transaction[]> {
  const pending = await getPendingTransactions(userId, companyId);
  const minAmount = amount - tolerance;
  const maxAmount = amount + tolerance;
  
  return pending.filter(
    (tx) => tx.amount >= minAmount && tx.amount <= maxAmount
  );
}

/**
 * Obtener total de ingresos pendientes
 */
export async function getTotalPendingIncomes(userId: string, companyId?: string, toDate?: Date): Promise<number> {
  const transactions = await getTransactions({
    userId,
    companyId,
    status: 'PENDING',
    type: 'INCOME',
    toDate,
  });
  return transactions.reduce((sum, tx) => sum + tx.amount, 0);
}

/**
 * Obtener total de gastos pendientes
 */
export async function getTotalPendingExpenses(userId: string, companyId?: string, toDate?: Date): Promise<number> {
  const transactions = await getTransactions({
    userId,
    companyId,
    status: 'PENDING',
    type: 'EXPENSE',
    toDate,
  });
  return transactions.reduce((sum, tx) => sum + tx.amount, 0);
}

/**
 * Obtener transacciones atrasadas (vencidas pero no pagadas)
 */
export async function getOverdueTransactions(userId: string, companyId?: string): Promise<Transaction[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const pending = await getPendingTransactions(userId, companyId);
  return pending.filter((tx) => tx.dueDate < today);
}
