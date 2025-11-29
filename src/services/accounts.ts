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
  writeBatch,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/config';
import { Account, CreateAccountInput, UpdateAccountInput, BalanceUpdate } from '@/types';

const COLLECTION_NAME = 'accounts';

/**
 * Convierte un documento de Firestore a Account
 */
function documentToAccount(id: string, data: DocumentData): Account {
  return {
    id,
    companyId: data.companyId,
    bankName: data.bankName,
    alias: data.alias,
    accountNumber: data.accountNumber,
    currentBalance: data.currentBalance,
    lastUpdateAmount: data.lastUpdateAmount,
    lastUpdateDate: data.lastUpdateDate?.toDate(),
    lastUpdatedBy: data.lastUpdatedBy,
    status: data.status,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
}

/**
 * Obtener todas las cuentas
 */
export async function getAccounts(companyId?: string, onlyActive = true): Promise<Account[]> {
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
  
  return snapshot.docs.map((docSnap) => documentToAccount(docSnap.id, docSnap.data()));
}

/**
 * Obtener una cuenta por ID
 */
export async function getAccountById(id: string): Promise<Account | null> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  const snapshot = await getDoc(docRef);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  return documentToAccount(snapshot.id, snapshot.data());
}

/**
 * Crear una nueva cuenta
 */
export async function createAccount(data: CreateAccountInput): Promise<Account> {
  const db = getDb();
  const docRef = await addDoc(collection(db, COLLECTION_NAME), {
    ...data,
    lastUpdateDate: Timestamp.now(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  
  return {
    ...data,
    id: docRef.id,
    lastUpdateDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Actualizar una cuenta
 */
export async function updateAccount(id: string, data: UpdateAccountInput): Promise<void> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Actualizar el saldo de una cuenta (usado en Morning Check)
 */
export async function updateAccountBalance(
  id: string,
  newBalance: number,
  userId: string
): Promise<void> {
  const db = getDb();
  const account = await getAccountById(id);
  if (!account) {
    throw new Error(`Account ${id} not found`);
  }

  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, {
    lastUpdateAmount: account.currentBalance,
    currentBalance: newBalance,
    lastUpdateDate: Timestamp.now(),
    lastUpdatedBy: userId,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Actualizar múltiples saldos en batch (Morning Check)
 */
export async function updateMultipleBalances(
  updates: BalanceUpdate[],
  userId: string
): Promise<void> {
  const db = getDb();
  const batch = writeBatch(db);
  const now = Timestamp.now();

  for (const update of updates) {
    const docRef = doc(db, COLLECTION_NAME, update.accountId);
    batch.update(docRef, {
      lastUpdateAmount: update.previousBalance,
      currentBalance: update.newBalance,
      lastUpdateDate: now,
      lastUpdatedBy: userId,
      updatedAt: now,
    });
  }

  await batch.commit();
}

/**
 * Eliminar una cuenta (soft delete)
 */
export async function deleteAccount(id: string): Promise<void> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, {
    status: 'INACTIVE',
    updatedAt: Timestamp.now(),
  });
}

/**
 * Obtener total de liquidez por empresa
 */
export async function getTotalLiquidityByCompany(): Promise<Record<string, number>> {
  const accounts = await getAccounts(undefined, true);
  const totals: Record<string, number> = {};
  
  for (const account of accounts) {
    if (!totals[account.companyId]) {
      totals[account.companyId] = 0;
    }
    totals[account.companyId] += account.currentBalance;
  }
  
  return totals;
}

/**
 * Obtener total de liquidez consolidada
 */
export async function getTotalLiquidity(companyId?: string): Promise<number> {
  const accounts = await getAccounts(companyId, true);
  return accounts.reduce((sum, acc) => sum + acc.currentBalance, 0);
}

/**
 * Verificar si hay datos caducos (>48h sin actualizar)
 */
export async function getStaleAccounts(hoursThreshold = 48): Promise<Account[]> {
  const accounts = await getAccounts(undefined, true);
  const thresholdDate = new Date();
  thresholdDate.setHours(thresholdDate.getHours() - hoursThreshold);
  
  return accounts.filter((account) => account.lastUpdateDate < thresholdDate);
}
