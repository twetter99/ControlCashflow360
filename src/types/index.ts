// ============================================
// WINFIN Tesorería - Tipos TypeScript
// Basado en el esquema Firestore del documento
// ============================================

// ============================================
// Tipos base y enums
// ============================================

export type UserRole = 'ADMIN' | 'TREASURY_MANAGER' | 'COMPANY_MANAGER' | 'VIEWER';

export type EntityStatus = 'ACTIVE' | 'INACTIVE';

export type TransactionType = 'INCOME' | 'EXPENSE';

export type TransactionStatus = 'PENDING' | 'PAID' | 'CANCELLED';

export type RecurrenceFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export type ThirdPartyType = 'CUSTOMER' | 'SUPPLIER';

export type AlertType = 
  | 'MIN_LIQUIDITY' 
  | 'CRITICAL_RUNWAY' 
  | 'CONCENTRATED_MATURITIES' 
  | 'LOW_CREDIT_LINE' 
  | 'OVERDUE_COLLECTIONS' 
  | 'STALE_DATA'
  | 'CREDIT_NEED';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// ============================================
// Colección: companies
// ============================================

export interface Company {
  id: string;
  name: string;
  color: string;
  status: EntityStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// Colección: accounts (Cuentas Bancarias)
// ============================================

export interface Account {
  id: string;
  companyId: string;
  bankName: string;
  alias: string;
  accountNumber: string;
  currentBalance: number;
  lastUpdateAmount: number;
  lastUpdateDate: Date;
  lastUpdatedBy: string;
  status: EntityStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// Colección: credit_lines (Pólizas de Crédito)
// ============================================

export interface CreditLine {
  id: string;
  companyId: string;
  bankName: string;
  alias?: string;
  creditLimit: number;
  currentDrawn: number;
  available: number;
  interestRate: number;
  expiryDate: Date;
  autoDrawThreshold?: number;
  status: EntityStatus;
  lastUpdatedBy?: string;
  lastUpdateDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// Colección: transactions (Movimientos)
// ============================================

export interface Transaction {
  id: string;
  companyId: string;
  accountId?: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  dueDate: Date;
  paidDate?: Date | null;
  category: string;
  description?: string;
  thirdPartyId?: string;
  thirdPartyName?: string;
  notes?: string;
  recurrenceId?: string | null;
  createdBy: string;
  lastUpdatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// Colección: recurrences (Recurrentes)
// ============================================

export interface Recurrence {
  id: string;
  companyId: string;
  type: TransactionType;
  name: string;
  baseAmount: number;
  frequency: RecurrenceFrequency;
  dayOfMonth?: number;
  dayOfWeek?: number;
  category: string;
  thirdPartyId?: string;
  isVariable: boolean;
  generateAhead: number; // Meses a generar por adelantado
  status: EntityStatus;
  nextGenerationDate?: Date;
  createdBy?: string;
  lastUpdatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// Colección: third_parties (Terceros)
// ============================================

export interface ThirdParty {
  id: string;
  companyId?: string; // Opcional, puede ser compartido entre empresas
  type: ThirdPartyType;
  name: string;
  cif?: string;
  email?: string;
  phone?: string;
  avgPaymentDelay: number; // Días de retraso promedio
  paymentTerms?: string;
  totalVolume12m: number; // Volumen últimos 12 meses
  riskAlert: boolean;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// Colección: daily_snapshots (Histórico)
// ============================================

export interface DailySnapshot {
  id: string;
  date: string; // Formato: YYYY-MM-DD
  totalLiquidity: number;
  totalCreditAvailable: number;
  netPosition: number;
  runway: number; // Días de runway
  breakdown: Record<string, number>; // Por empresa: { companyId: saldo }
  createdAt?: Date;
}

// ============================================
// Colección: scenarios (Escenarios What-If)
// ============================================

export interface ScenarioModification {
  transactionId?: string;
  newDueDate?: Date;
  newAmount?: number;
  // Para transacciones ficticias
  type?: TransactionType;
  amount?: number;
  dueDate?: Date;
  description?: string;
}

export interface ScenarioProjectedImpact {
  minBalance: number;
  maxBalance: number;
  creditNeeded: number;
  riskLevel: RiskLevel;
  daysInNegative: number;
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  baseDate: Date;
  companyId?: string; // Opcional, si es para una empresa específica
  modifications: ScenarioModification[];
  projectedImpact: ScenarioProjectedImpact;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// Colección: alert_configs (Configuración de Alertas)
// ============================================

export interface AlertConfig {
  id: string;
  userId: string;
  companyId?: string; // Opcional, si es para empresa específica
  type: AlertType;
  threshold: number;
  enabled: boolean;
  notifyEmail: boolean;
  notifyInApp: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// Colección: alerts (Alertas Generadas)
// ============================================

export interface Alert {
  id: string;
  configId: string;
  type: AlertType;
  companyId?: string;
  message: string;
  severity: RiskLevel;
  value: number; // Valor que disparó la alerta
  threshold: number;
  isRead: boolean;
  createdAt: Date;
}

// ============================================
// Colección: users (Usuarios extendidos)
// ============================================

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  companyIds: string[]; // Empresas a las que tiene acceso
  preferences?: {
    defaultCompanyId?: string;
    theme?: 'light' | 'dark';
  };
  lastLogin?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// Tipos para proyecciones y cálculos
// ============================================

export interface CashflowProjection {
  date: Date;
  openingBalance: number;
  incomes: number;
  expenses: number;
  closingBalance: number;
  creditAvailable: number;
  netPosition: number;
  transactions: Transaction[];
}

export interface DashboardSummary {
  today: {
    totalLiquidity: number;
    totalCreditAvailable: number;
    netPosition: number;
  };
  projection30d: {
    expectedIncomes: number;
    expectedExpenses: number;
    projectedBalance: number;
    riskLevel: RiskLevel;
  };
  projection60d: {
    expectedIncomes: number;
    expectedExpenses: number;
    projectedBalance: number;
    riskLevel: RiskLevel;
  };
  projection90d: {
    expectedIncomes: number;
    expectedExpenses: number;
    projectedBalance: number;
    riskLevel: RiskLevel;
  };
  runway: number;
  alerts: Alert[];
}

// ============================================
// Tipos para formularios y UI
// ============================================

export type CreateAccountInput = Omit<Account, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateAccountInput = Partial<Omit<Account, 'id' | 'createdAt'>>;

export type CreateTransactionInput = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateTransactionInput = Partial<Omit<Transaction, 'id' | 'createdAt'>>;

export type CreateCompanyInput = Omit<Company, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateCompanyInput = Partial<Omit<Company, 'id' | 'createdAt'>>;

export type CreateCreditLineInput = Omit<CreditLine, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateCreditLineInput = Partial<Omit<CreditLine, 'id' | 'createdAt'>>;

// ============================================
// Tipos para balance update (Morning Check)
// ============================================

export interface BalanceUpdate {
  accountId: string;
  newBalance: number;
  previousBalance: number;
  difference: number;
}

export interface MorningCheckSubmission {
  updates: BalanceUpdate[];
  timestamp: Date;
  userId: string;
}

// ============================================
// Categorías predefinidas
// ============================================

export const EXPENSE_CATEGORIES = [
  'Nóminas',
  'Seguros Sociales',
  'Alquiler',
  'Suministros',
  'Proveedores',
  'Impuestos',
  'Seguros',
  'Viajes',
  'Material',
  'Servicios Externos',
  'Mantenimiento',
  'Otros',
] as const;

export const INCOME_CATEGORIES = [
  'Facturación Clientes',
  'Subvenciones',
  'Intereses',
  'Otros Ingresos',
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];
export type IncomeCategory = typeof INCOME_CATEGORIES[number];
