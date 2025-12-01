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

export type RecurrenceFrequency = 'NONE' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export type CertaintyLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type ThirdPartyType = 'CUSTOMER' | 'SUPPLIER' | 'CREDITOR' | 'MIXED';

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
  userId: string;
  code: string; // Código amigable: EM01, EM02, etc.
  name: string;
  cif: string;
  color: string;
  status: EntityStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// Colección: user_settings (Configuración del Usuario)
// ============================================

export interface UserSettings {
  id: string;
  userId: string;
  // Objetivo de ingresos mensual (global, para Capa 3)
  monthlyIncomeTarget?: number;
  // Preferencias de visualización
  dashboardPreferences?: {
    showIncomeLayersChart?: boolean;
    defaultForecastMonths?: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// Colección: accounts (Cuentas Bancarias)
// ============================================

export interface Account {
  id: string;
  userId: string;
  companyId: string;
  bankName: string;
  alias: string;
  accountNumber: string;
  currentBalance: number;
  lastUpdateAmount: number;
  lastUpdateDate: Date;
  lastUpdatedBy: string;
  status: EntityStatus;
  isPrimary?: boolean; // Cuenta principal/favorita
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// Colección: credit_lines (Pólizas de Crédito)
// ============================================

export interface CreditLine {
  id: string;
  userId: string;
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
// Colección: credit_cards (Tarjetas de Crédito)
// ============================================

export interface CreditCard {
  id: string;
  userId: string;
  companyId: string;
  bankName: string;
  cardAlias: string;
  cardNumberLast4: string; // Solo últimos 4 dígitos por seguridad
  cardHolder: string;
  creditLimit: number;
  currentBalance: number; // Saldo dispuesto (deuda)
  availableCredit: number; // Crédito disponible
  cutoffDay: number; // Día de corte (1-31)
  paymentDueDay: number; // Día de pago (1-31)
  status: EntityStatus;
  lastUpdatedBy?: string;
  lastUpdateDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// Colección: transactions (Movimientos)
// ============================================

// Capa de ingreso para clasificación visual
export type IncomeLayer = 1 | 2 | 3;
// 1 = Facturado (tiene invoiceNumber)
// 2 = Contrato/Recurrente seguro (recurrencia + certeza HIGH, sin factura)
// 3 = Estimado (sin factura, sin recurrencia alta)

export interface Transaction {
  id: string;
  userId: string;
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
  // Campo para ingresos facturados (Capa 1)
  invoiceNumber?: string;
  // Campos para recurrencias
  recurrence: RecurrenceFrequency;
  certainty: CertaintyLevel;
  recurrenceId?: string | null;       // ID de la recurrencia padre (si aplica)
  isRecurrenceInstance?: boolean;      // true si fue generada desde una recurrencia
  instanceDate?: string;               // Fecha única de la instancia (YYYY-MM para agrupar)
  overriddenFromRecurrence?: boolean;  // true si el usuario modificó esta instancia
  createdBy: string;
  lastUpdatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Función helper para determinar la capa de un ingreso
export function getIncomeLayer(transaction: Transaction): IncomeLayer {
  if (transaction.type !== 'INCOME') return 3; // Solo aplica a ingresos
  
  // Capa 1: Tiene número de factura = Confirmado/Facturado
  if (transaction.invoiceNumber && transaction.invoiceNumber.trim() !== '') {
    return 1;
  }
  
  // Capa 2: Es recurrente con certeza alta = Contrato seguro
  if (transaction.recurrence !== 'NONE' && transaction.certainty === 'HIGH') {
    return 2;
  }
  
  // Capa 3: Todo lo demás = Estimado
  return 3;
}

// ============================================
// Colección: recurrences (Plantillas Recurrentes)
// ============================================

export type RecurrenceStatus = 'ACTIVE' | 'PAUSED' | 'ENDED';

export interface Recurrence {
  id: string;
  userId: string;
  companyId: string;
  // Datos de la transacción plantilla
  type: TransactionType;
  name: string;                        // Nombre/descripción de la recurrencia
  baseAmount: number;                  // Importe base
  category: string;
  thirdPartyId?: string;
  thirdPartyName?: string;
  accountId?: string;                  // Cuenta por defecto
  certainty: CertaintyLevel;
  notes?: string;
  // Configuración de recurrencia
  frequency: RecurrenceFrequency;
  dayOfMonth?: number;                 // Para MONTHLY (1-31)
  dayOfWeek?: number;                  // Para WEEKLY (0=Dom, 1=Lun, etc.)
  startDate: Date;                     // Fecha de inicio
  endDate?: Date | null;               // Fecha fin (null = indefinida)
  // Control de generación
  generateMonthsAhead: number;         // Meses a generar por adelantado (default: 6)
  lastGeneratedDate?: Date;            // Última fecha hasta la que se generaron instancias
  nextOccurrenceDate?: Date;           // Próxima fecha a generar
  // Estado
  status: RecurrenceStatus;
  // Metadata
  createdBy: string;
  lastUpdatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// Tipos auxiliares para generación de ocurrencias
// ============================================

export interface OccurrenceGenerationResult {
  recurrenceId: string;
  generatedCount: number;
  transactionIds: string[];
  lastGeneratedDate: Date;
}

// ============================================
// Colección: third_parties (Terceros)
// ============================================

export interface ThirdParty {
  id: string;
  userId: string;                    // Dueño del registro (terceros por usuario)
  type: ThirdPartyType;
  displayName: string;               // Nombre para mostrar
  normalizedName: string;            // Minúsculas, sin tildes, para búsqueda/duplicados
  cif?: string;                      // NIF/CIF opcional
  email?: string;
  phone?: string;
  isActive: boolean;                 // Default true
  lastUsedAt?: Date;                 // Última vez usado en una transacción
  avgPaymentDelay?: number;          // Días de retraso promedio (opcional)
  totalVolume12m?: number;           // Volumen últimos 12 meses (opcional)
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Input para crear tercero
export interface CreateThirdPartyInput {
  type: ThirdPartyType;
  displayName: string;
  cif?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

// Input para actualizar tercero
export interface UpdateThirdPartyInput {
  type?: ThirdPartyType;
  displayName?: string;
  cif?: string;
  email?: string;
  phone?: string;
  isActive?: boolean;
  notes?: string;
}

// Resultado de búsqueda de terceros
export interface ThirdPartySearchResult {
  id: string;
  displayName: string;
  type: ThirdPartyType;
  cif?: string;
  similarity?: number; // Para detección de duplicados
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

export type CreateAccountInput = Omit<Account, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'lastUpdateDate'>;
export type UpdateAccountInput = Partial<Omit<Account, 'id' | 'userId' | 'createdAt'>>;

export type CreateTransactionInput = Omit<Transaction, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;
export type UpdateTransactionInput = Partial<Omit<Transaction, 'id' | 'userId' | 'createdAt'>>;

export type CreateCompanyInput = Omit<Company, 'id' | 'userId' | 'code' | 'createdAt' | 'updatedAt'>;
export type UpdateCompanyInput = Partial<Omit<Company, 'id' | 'userId' | 'code' | 'createdAt'>>;

export type CreateCreditLineInput = Omit<CreditLine, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;
export type UpdateCreditLineInput = Partial<Omit<CreditLine, 'id' | 'userId' | 'createdAt'>>;

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
