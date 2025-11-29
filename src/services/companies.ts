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
import { Company, CreateCompanyInput, UpdateCompanyInput } from '@/types';

const COLLECTION_NAME = 'companies';

/**
 * Genera el siguiente código de empresa para un usuario (EM01, EM02, etc.)
 */
async function generateCompanyCode(userId: string): Promise<string> {
  const db = getDb();
  const q = query(
    collection(db, COLLECTION_NAME),
    where('userId', '==', userId)
  );
  const snapshot = await getDocs(q);
  
  // Obtener el número más alto actual
  let maxNumber = 0;
  snapshot.docs.forEach((docSnap) => {
    const code = docSnap.data().code || '';
    const match = code.match(/^EM(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNumber) maxNumber = num;
    }
  });
  
  // Generar siguiente código
  const nextNumber = maxNumber + 1;
  return `EM${nextNumber.toString().padStart(2, '0')}`;
}

/**
 * Convierte un documento de Firestore a Company
 */
function documentToCompany(id: string, data: DocumentData): Company {
  return {
    id,
    userId: data.userId || '',
    code: data.code || '',
    name: data.name,
    cif: data.cif || '',
    color: data.color,
    status: data.status,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
}

/**
 * Obtener todas las empresas del usuario
 */
export async function getCompanies(userId: string, onlyActive = true): Promise<Company[]> {
  const db = getDb();
  const constraints: QueryConstraint[] = [
    where('userId', '==', userId)
  ];
  
  if (onlyActive) {
    constraints.push(where('status', '==', 'ACTIVE'));
  }

  const q = query(collection(db, COLLECTION_NAME), ...constraints);
  const snapshot = await getDocs(q);
  
  const companies = snapshot.docs.map((docSnap) => documentToCompany(docSnap.id, docSnap.data()));
  // Ordenar en cliente
  return companies.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Obtener una empresa por ID
 */
export async function getCompanyById(id: string): Promise<Company | null> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  const snapshot = await getDoc(docRef);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  return documentToCompany(snapshot.id, snapshot.data());
}

/**
 * Crear una nueva empresa
 */
export async function createCompany(userId: string, data: CreateCompanyInput): Promise<Company> {
  const db = getDb();
  
  // Generar código automático
  const code = await generateCompanyCode(userId);
  
  const docRef = await addDoc(collection(db, COLLECTION_NAME), {
    ...data,
    userId,
    code,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  
  return {
    ...data,
    id: docRef.id,
    userId,
    code,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Actualizar una empresa
 */
export async function updateCompany(id: string, data: UpdateCompanyInput): Promise<void> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Eliminar una empresa permanentemente
 */
export async function deleteCompany(id: string): Promise<void> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  await deleteDoc(docRef);
}

/**
 * Desactivar una empresa (soft delete)
 */
export async function deactivateCompany(id: string): Promise<void> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, {
    status: 'INACTIVE',
    updatedAt: Timestamp.now(),
  });
}
