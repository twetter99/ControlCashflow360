import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

admin.initializeApp();

export const db = admin.firestore();

// Tipos comunes
export interface Company {
  id: string;
  name: string;
  nif: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Account {
  id: string;
  companyId: string;
  bankName: string;
  accountName: string;
  balance: number;
  lastUpdated: admin.firestore.Timestamp;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface CreditLine {
  id: string;
  companyId: string;
  bankName: string;
  limit: number;
  drawn: number;
  expirationDate: admin.firestore.Timestamp;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Transaction {
  id: string;
  companyId: string;
  accountId: string;
  type: 'INCOME' | 'EXPENSE';
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  amount: number;
  dueDate: admin.firestore.Timestamp;
  category: string;
}

export interface AlertConfig {
  id: string;
  companyId: string | null; // null = todas las empresas
  type: string;
  threshold: number;
  enabled: boolean;
  notifyApp: boolean;
  notifyEmail: boolean;
}

export interface Alert {
  id: string;
  configId: string;
  companyId: string | null;
  type: string;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  read: boolean;
  createdAt: admin.firestore.Timestamp;
}

export interface DailySnapshot {
  id: string;
  date: admin.firestore.Timestamp;
  companyId: string | null;
  totalLiquidity: number;
  totalCreditAvailable: number;
  totalPendingIncomes: number;
  totalPendingExpenses: number;
  netPosition: number;
  runwayDays: number;
}

export interface Recurrence {
  id: string;
  companyId: string;
  accountId: string;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  category: string;
  description: string;
  dayOfMonth: number;
  nextOccurrence: admin.firestore.Timestamp;
  active: boolean;
}

// Funciones de utilidad
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

export { functions };
