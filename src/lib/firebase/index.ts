export { auth, db, getDb, isConfigured } from './config';
export {
  signIn,
  signInWithGoogle,
  signOut,
  getCurrentUser,
  onAuthChange,
} from './auth';
export type { User } from './auth';
