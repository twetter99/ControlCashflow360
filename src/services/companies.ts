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
import { Company, CreateCompanyInput, UpdateCompanyInput } from '@/types';

const COLLECTION_NAME = 'companies';

/**
 * Convierte un documento de Firestore a Company
 */
function documentToCompany(id: string, data: DocumentData): Company {
  return {
    id,
    name: data.name,
    color: data.color,
    status: data.status,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
}

/**
 * Obtener todas las empresas
 */
export async function getCompanies(onlyActive = true): Promise<Company[]> {
  const db = getDb();
  const constraints: QueryConstraint[] = [];
  
  if (onlyActive) {
    constraints.push(where('status', '==', 'ACTIVE'));
  }
  constraints.push(orderBy('name'));

  const q = query(collection(db, COLLECTION_NAME), ...constraints);
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map((docSnap) => documentToCompany(docSnap.id, docSnap.data()));
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
export async function createCompany(data: CreateCompanyInput): Promise<Company> {
  const db = getDb();
  const docRef = await addDoc(collection(db, COLLECTION_NAME), {
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
 * Eliminar una empresa (soft delete)
 */
export async function deleteCompany(id: string): Promise<void> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, {
    status: 'INACTIVE',
    updatedAt: Timestamp.now(),
  });
}

/**
 * Eliminar una empresa permanentemente
 */
export async function hardDeleteCompany(id: string): Promise<void> {
  const db = getDb();
  const docRef = doc(db, COLLECTION_NAME, id);
  await deleteDoc(docRef);
}
