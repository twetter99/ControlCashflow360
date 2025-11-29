import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from './config';

/**
 * Iniciar sesión con email y contraseña
 */
export async function signIn(email: string, password: string): Promise<User> {
  if (!auth) {
    throw new Error('Firebase Auth no está configurado. Por favor configura las variables de entorno.');
  }
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

/**
 * Iniciar sesión con Google
 */
export async function signInWithGoogle(): Promise<User> {
  if (!auth) {
    throw new Error('Firebase Auth no está configurado. Por favor configura las variables de entorno.');
  }
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

/**
 * Cerrar sesión
 */
export async function signOut(): Promise<void> {
  if (!auth) {
    throw new Error('Firebase Auth no está configurado.');
  }
  await firebaseSignOut(auth);
}

/**
 * Obtener el usuario actual
 */
export function getCurrentUser(): User | null {
  if (!auth) return null;
  return auth.currentUser;
}

/**
 * Suscribirse a cambios en el estado de autenticación
 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (!auth) {
    // Si auth no está configurado, llamar callback con null y retornar función vacía
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export type { User };
