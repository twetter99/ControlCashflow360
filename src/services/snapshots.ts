import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  Timestamp,
  DocumentData,
  limit,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/config';
import { DailySnapshot } from '@/types';
import { getTotalLiquidity, getTotalLiquidityByCompany } from './accounts';
import { getTotalCreditAvailable } from './creditLines';

const COLLECTION_NAME = 'daily_snapshots';

/**
 * Convierte un documento de Firestore a DailySnapshot
 */
function documentToSnapshot(id: string, data: DocumentData): DailySnapshot {
  return {
    id,
    date: data.date,
    totalLiquidity: data.totalLiquidity,
    totalCreditAvailable: data.totalCreditAvailable,
    netPosition: data.netPosition,
    runway: data.runway,
    breakdown: data.breakdown,
    createdAt: data.createdAt?.toDate(),
  };
}

/**
 * Obtener snapshot por fecha
 */
export async function getSnapshotByDate(date: string): Promise<DailySnapshot | null> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, date);
  const snapshot = await getDoc(docRef);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  return documentToSnapshot(snapshot.id, snapshot.data());
}

/**
 * Obtener snapshots de un rango de fechas
 */
export async function getSnapshotsByDateRange(
  fromDate: string,
  toDate: string
): Promise<DailySnapshot[]> {
  const db = getDb();
  const q = query(
    collection(db, COLLECTION_NAME),
    where('date', '>=', fromDate),
    where('date', '<=', toDate),
    orderBy('date', 'asc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => documentToSnapshot(docSnap.id, docSnap.data()));
}

/**
 * Obtener los últimos N snapshots
 */
export async function getRecentSnapshots(count: number = 30): Promise<DailySnapshot[]> {
  const db = getDb();
  const q = query(
    collection(db, COLLECTION_NAME),
    orderBy('date', 'desc'),
    limit(count)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((docSnap) => documentToSnapshot(docSnap.id, docSnap.data()))
    .reverse(); // Para tenerlos en orden cronológico
}

/**
 * Crear snapshot del día actual
 */
export async function createDailySnapshot(userId: string, runway: number = 0): Promise<DailySnapshot> {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  const totalLiquidity = await getTotalLiquidity(userId);
  const totalCreditAvailable = await getTotalCreditAvailable(userId);
  const breakdown = await getTotalLiquidityByCompany(userId);
  
  const snapshotData: Omit<DailySnapshot, 'id'> = {
    date: today,
    totalLiquidity,
    totalCreditAvailable,
    netPosition: totalLiquidity - totalCreditAvailable, // Puede ser ajustado según lógica de negocio
    runway,
    breakdown,
    createdAt: new Date(),
  };
  
  const docRef = doc(db, COLLECTION_NAME, today);
  await setDoc(docRef, {
    ...snapshotData,
    createdAt: Timestamp.now(),
  });
  
  return {
    id: today,
    ...snapshotData,
  };
}

/**
 * Obtener el último snapshot disponible
 */
export async function getLatestSnapshot(): Promise<DailySnapshot | null> {
  const db = getDb();
  const q = query(
    collection(db, COLLECTION_NAME),
    orderBy('date', 'desc'),
    limit(1)
  );
  
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }
  
  const docSnap = snapshot.docs[0];
  return documentToSnapshot(docSnap.id, docSnap.data());
}

/**
 * Verificar si hay snapshot de hoy
 */
export async function hasTodaySnapshot(): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  const snapshot = await getSnapshotByDate(today);
  return snapshot !== null;
}

/**
 * Verificar si los datos son de ayer (para mostrar Morning Check)
 */
export async function isDataFromYesterday(): Promise<boolean> {
  const latestSnapshot = await getLatestSnapshot();
  
  if (!latestSnapshot) {
    return true; // No hay datos, mostrar Morning Check
  }
  
  const today = new Date().toISOString().split('T')[0];
  return latestSnapshot.date !== today;
}
