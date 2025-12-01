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

export type RecurrenceFrequency = 'NONE' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export type RecurrenceStatus = 'ACTIVE' | 'PAUSED' | 'ENDED';
export type CertaintyLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Recurrence {
  id: string;
  userId: string;
  companyId: string;
  accountId?: string;
  type: 'INCOME' | 'EXPENSE';
  name: string;                        // Nombre/descripción de la recurrencia
  baseAmount: number;                  // Importe base (antes era 'amount')
  category: string;
  thirdPartyId?: string;
  thirdPartyName?: string;
  certainty: CertaintyLevel;
  notes?: string;
  // Configuración de recurrencia
  frequency: RecurrenceFrequency;
  dayOfMonth?: number;                 // Para MONTHLY (1-31)
  dayOfWeek?: number;                  // Para WEEKLY (0=Dom, 1=Lun, etc.)
  startDate: admin.firestore.Timestamp;  // Fecha de inicio
  endDate?: admin.firestore.Timestamp | null;  // Fecha fin (null = indefinida)
  // Control de generación
  generateMonthsAhead: number;         // Meses a generar por adelantado (default: 6)
  lastGeneratedDate?: admin.firestore.Timestamp;  // Última fecha hasta la que se generaron instancias
  nextOccurrenceDate?: admin.firestore.Timestamp; // Próxima fecha a generar
  // Estado
  status: RecurrenceStatus;
  // Metadata
  createdBy: string;
  lastUpdatedBy?: string;
  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
  // Campos legacy (para compatibilidad)
  active?: boolean;                    // Deprecado, usar status
  amount?: number;                     // Deprecado, usar baseAmount
  description?: string;                // Deprecado, usar name
  nextOccurrence?: admin.firestore.Timestamp; // Deprecado, usar nextOccurrenceDate
}

// Funciones de utilidad
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

export { functions };
