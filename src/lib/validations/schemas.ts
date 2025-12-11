import { z } from 'zod';
import { sanitizeText } from '../sanitize';

// ============================================
// Helper para sanitización en Zod
// ============================================

/**
 * Crea un schema de string sanitizado contra XSS
 */
const sanitizedString = (maxLength?: number) => 
  z.string()
    .transform(val => sanitizeText(val, maxLength))
    .pipe(z.string());

// ============================================
// Enums y valores permitidos
// ============================================

export const EntityStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const TransactionTypeSchema = z.enum(['INCOME', 'EXPENSE']);
export const TransactionStatusSchema = z.enum(['PENDING', 'PAID', 'CANCELLED']);
export const RecurrenceFrequencySchema = z.enum(['NONE', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']);
export const CertaintyLevelSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);
export const PaymentMethodSchema = z.enum(['TRANSFER', 'DIRECT_DEBIT']);

// ============================================
// COMPANY SCHEMAS
// ============================================

export const CreateCompanySchema = z.object({
  name: sanitizedString(100)
    .pipe(z.string().min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder 100 caracteres')),
  cif: sanitizedString(20)
    .pipe(z.string().max(20, 'El CIF no puede exceder 20 caracteres'))
    .optional()
    .default(''),
  color: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'El color debe ser un código hexadecimal válido (#RRGGBB)')
    .default('#3B82F6'),
  status: EntityStatusSchema.default('ACTIVE'),
});

export const UpdateCompanySchema = z.object({
  name: sanitizedString(100)
    .pipe(z.string().min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder 100 caracteres'))
    .optional(),
  cif: sanitizedString(20)
    .pipe(z.string().max(20, 'El CIF no puede exceder 20 caracteres'))
    .optional(),
  color: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'El color debe ser un código hexadecimal válido (#RRGGBB)')
    .optional(),
  status: EntityStatusSchema.optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Debe proporcionar al menos un campo para actualizar',
});

// ============================================
// ACCOUNT SCHEMAS
// ============================================

export const CreateAccountSchema = z.object({
  companyId: z.string()
    .min(1, 'El ID de empresa es requerido'),
  bankName: sanitizedString(100)
    .pipe(z.string().min(1, 'El nombre del banco es requerido').max(100, 'El nombre del banco no puede exceder 100 caracteres')),
  alias: sanitizedString(50)
    .pipe(z.string().max(50, 'El alias no puede exceder 50 caracteres'))
    .optional()
    .default(''),
  accountNumber: sanitizedString(50)
    .pipe(z.string().min(1, 'El número de cuenta es requerido').max(50, 'El número de cuenta no puede exceder 50 caracteres')),
  currentBalance: z.number()
    .finite('El balance debe ser un número válido'),
  lastUpdateAmount: z.number()
    .finite('El monto debe ser un número válido')
    .optional()
    .default(0),
  status: EntityStatusSchema.default('ACTIVE'),
});

export const UpdateAccountSchema = z.object({
  companyId: z.string().min(1).optional(),
  bankName: sanitizedString(100)
    .pipe(z.string().min(1, 'El nombre del banco es requerido').max(100))
    .optional(),
  alias: sanitizedString(50).pipe(z.string().max(50)).optional(),
  accountNumber: sanitizedString(50).pipe(z.string().max(50)).optional(),
  currentBalance: z.number().finite().optional(),
  lastUpdateAmount: z.number().finite().optional(),
  status: EntityStatusSchema.optional(),
  isPrimary: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Debe proporcionar al menos un campo para actualizar',
});

// Schema para actualización de balance
export const BalanceUpdateSchema = z.object({
  amount: z.number()
    .finite('El monto debe ser un número válido'),
  description: sanitizedString(200)
    .pipe(z.string().max(200, 'La descripción no puede exceder 200 caracteres'))
    .optional(),
});

// ============================================
// TRANSACTION SCHEMAS
// ============================================

export const CreateTransactionSchema = z.object({
  companyId: z.string()
    .min(1, 'El ID de empresa es requerido'),
  accountId: z.string()
    .min(1)
    .optional(),
  type: TransactionTypeSchema,
  amount: z.number()
    .positive('El monto debe ser mayor a 0')
    .finite('El monto debe ser un número válido'),
  status: TransactionStatusSchema.default('PENDING'),
  dueDate: z.union([
    z.date(),
    z.string().transform(val => new Date(val)),
  ]).refine(date => !isNaN(date.getTime()), {
    message: 'La fecha de vencimiento no es válida',
  }),
  paidDate: z.union([
    z.date(),
    z.string().transform(val => new Date(val)),
    z.null(),
  ]).optional().nullable(),
  category: sanitizedString(50)
    .pipe(z.string().max(50, 'La categoría no puede exceder 50 caracteres'))
    .optional()
    .default(''),
  description: sanitizedString(500)
    .pipe(z.string().max(500, 'La descripción no puede exceder 500 caracteres'))
    .optional()
    .default(''),
  thirdPartyId: z.string().optional(),
  thirdPartyName: sanitizedString(100)
    .pipe(z.string().max(100, 'El nombre del tercero no puede exceder 100 caracteres'))
    .optional()
    .default(''),
  notes: sanitizedString(1000)
    .pipe(z.string().max(1000, 'Las notas no pueden exceder 1000 caracteres'))
    .optional()
    .default(''),
  // Número de factura para ingresos (Capa 1 - Facturado)
  invoiceNumber: sanitizedString(50)
    .pipe(z.string().max(50, 'El número de factura no puede exceder 50 caracteres'))
    .optional()
    .default(''),
  // Campos para gastos de proveedores
  supplierInvoiceNumber: sanitizedString(50)
    .pipe(z.string().max(50, 'El número de factura del proveedor no puede exceder 50 caracteres'))
    .optional(),
  supplierBankAccount: sanitizedString(50)
    .pipe(z.string().max(50, 'La cuenta bancaria del proveedor no puede exceder 50 caracteres'))
    .optional(),
  paymentMethod: PaymentMethodSchema.optional(),
  chargeAccountId: z.string().optional(),
  // Campos de recurrencia
  recurrence: RecurrenceFrequencySchema.default('NONE'),
  certainty: CertaintyLevelSchema.default('HIGH'),
  recurrenceId: z.string().nullable().optional(),
  // Campos opcionales para fin de recurrencia
  recurrenceEndDate: z.union([
    z.date(),
    z.string().transform(val => val ? new Date(val) : null),
    z.null(),
  ]).optional().nullable(),
  recurrenceInstallments: z.number().int().min(1).max(120).optional().nullable(),
  // Nuevos campos para instancias de recurrencia
  isRecurrenceInstance: z.boolean().optional().default(false),
  instanceDate: z.string().optional(),
  overriddenFromRecurrence: z.boolean().optional().default(false),
  createdBy: z.string().optional(),
});

export const UpdateTransactionSchema = z.object({
  companyId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional().nullable(),
  type: TransactionTypeSchema.optional(),
  amount: z.number()
    .positive('El monto debe ser mayor a 0')
    .finite()
    .optional(),
  status: TransactionStatusSchema.optional(),
  dueDate: z.union([
    z.date(),
    z.string().transform(val => new Date(val)),
  ]).optional(),
  paidDate: z.union([
    z.date(),
    z.string().transform(val => new Date(val)),
    z.null(),
  ]).optional().nullable(),
  category: sanitizedString(50).pipe(z.string().max(50)).optional(),
  description: sanitizedString(500).pipe(z.string().max(500)).optional(),
  thirdPartyId: z.string().optional().nullable(),
  thirdPartyName: sanitizedString(100).pipe(z.string().max(100)).optional(),
  notes: sanitizedString(1000).pipe(z.string().max(1000)).optional(),
  invoiceNumber: sanitizedString(50).pipe(z.string().max(50)).optional(),
  recurrence: RecurrenceFrequencySchema.optional(),
  certainty: CertaintyLevelSchema.optional(),
  // Campos para gastos de proveedores
  supplierInvoiceNumber: sanitizedString(50).pipe(z.string().max(50)).optional(),
  supplierBankAccount: sanitizedString(50).pipe(z.string().max(50)).optional(),
  paymentMethod: PaymentMethodSchema.optional(),
  chargeAccountId: z.string().optional().nullable(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Debe proporcionar al menos un campo para actualizar',
});

// Schema para acciones especiales de transacción
export const TransactionActionSchema = z.object({
  action: z.enum(['markAsPaid', 'cancel', 'reactivate']),
  paidDate: z.string()
    .transform(val => new Date(val))
    .optional(),
  accountId: z.string().min(1).optional(),
});

// ============================================
// CREDIT LINE SCHEMAS
// ============================================

// Tipo de póliza
export const CreditLineTypeSchema = z.enum(['CREDIT', 'DISCOUNT']);

export const CreateCreditLineSchema = z.object({
  companyId: z.string()
    .min(1, 'El ID de empresa es requerido'),
  accountId: z.string().min(1).optional(),
  bankName: sanitizedString(100)
    .pipe(z.string().min(1, 'El nombre del banco es requerido').max(100, 'El nombre del banco no puede exceder 100 caracteres')),
  alias: sanitizedString(50)
    .pipe(z.string().max(50, 'El alias no puede exceder 50 caracteres'))
    .optional()
    .default(''),
  lineType: CreditLineTypeSchema.default('CREDIT'),
  creditLimit: z.number()
    .positive('El límite de crédito debe ser mayor a 0')
    .finite('El límite debe ser un número válido'),
  currentDrawn: z.number()
    .min(0, 'El dispuesto no puede ser negativo')
    .finite('El dispuesto debe ser un número válido')
    .default(0),
  available: z.number()
    .min(0, 'El disponible no puede ser negativo')
    .finite()
    .optional(), // Se calculará automáticamente
  interestRate: z.number()
    .min(0, 'La tasa de interés no puede ser negativa')
    .max(100, 'La tasa de interés no puede exceder 100%')
    .finite('La tasa debe ser un número válido'),
  expiryDate: z.union([
    z.date(),
    z.string().transform(val => new Date(val)),
  ]).refine(date => !isNaN(date.getTime()), {
    message: 'La fecha de vencimiento no es válida',
  }),
  autoDrawThreshold: z.number()
    .min(0)
    .finite()
    .optional(),
  status: EntityStatusSchema.default('ACTIVE'),
}).refine(data => {
  // Validar que currentDrawn no exceda creditLimit
  if (data.currentDrawn > data.creditLimit) {
    return false;
  }
  return true;
}, {
  message: 'El dispuesto no puede exceder el límite de crédito',
  path: ['currentDrawn'],
});

export const UpdateCreditLineSchema = z.object({
  companyId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional().nullable(),
  bankName: sanitizedString(100).pipe(z.string().min(1).max(100)).optional(),
  alias: sanitizedString(50).pipe(z.string().max(50)).optional(),
  lineType: CreditLineTypeSchema.optional(),
  creditLimit: z.number().positive().finite().optional(),
  currentDrawn: z.number().min(0).finite().optional(),
  interestRate: z.number().min(0).max(100).finite().optional(),
  expiryDate: z.union([
    z.date(),
    z.string().transform(val => new Date(val)),
  ]).optional(),
  autoDrawThreshold: z.number().min(0).finite().optional().nullable(),
  status: EntityStatusSchema.optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Debe proporcionar al menos un campo para actualizar',
});

// ============================================
// CREDIT CARD SCHEMAS (Tarjetas de Crédito)
// ============================================

export const CreateCreditCardSchema = z.object({
  companyId: z.string()
    .min(1, 'El ID de empresa es requerido'),
  bankName: sanitizedString(100)
    .pipe(z.string().min(1, 'El nombre del banco es requerido').max(100, 'El nombre del banco no puede exceder 100 caracteres')),
  cardAlias: sanitizedString(50)
    .pipe(z.string().min(1, 'El alias de la tarjeta es requerido').max(50, 'El alias no puede exceder 50 caracteres')),
  cardNumberLast4: z.string()
    .regex(/^\d{4}$/, 'Debe ser los últimos 4 dígitos de la tarjeta')
    .transform(val => val.trim()),
  cardHolder: sanitizedString(100)
    .pipe(z.string().min(1, 'El titular es requerido').max(100, 'El titular no puede exceder 100 caracteres')),
  creditLimit: z.number()
    .positive('El límite de crédito debe ser mayor a 0')
    .finite('El límite debe ser un número válido'),
  currentBalance: z.number()
    .min(0, 'El saldo dispuesto no puede ser negativo')
    .finite('El saldo debe ser un número válido')
    .default(0),
  cutoffDay: z.number()
    .int('El día de corte debe ser un número entero')
    .min(1, 'El día de corte debe ser entre 1 y 31')
    .max(31, 'El día de corte debe ser entre 1 y 31'),
  paymentDueDay: z.number()
    .int('El día de pago debe ser un número entero')
    .min(1, 'El día de pago debe ser entre 1 y 31')
    .max(31, 'El día de pago debe ser entre 1 y 31'),
  status: EntityStatusSchema.default('ACTIVE'),
}).refine(data => {
  // Validar que currentBalance no exceda creditLimit
  if (data.currentBalance > data.creditLimit) {
    return false;
  }
  return true;
}, {
  message: 'El saldo dispuesto no puede exceder el límite de crédito',
  path: ['currentBalance'],
});

export const UpdateCreditCardSchema = z.object({
  companyId: z.string().min(1).optional(),
  bankName: sanitizedString(100).pipe(z.string().min(1).max(100)).optional(),
  cardAlias: sanitizedString(50).pipe(z.string().min(1).max(50)).optional(),
  cardNumberLast4: z.string()
    .regex(/^\d{4}$/, 'Debe ser los últimos 4 dígitos de la tarjeta')
    .optional(),
  cardHolder: sanitizedString(100).pipe(z.string().min(1).max(100)).optional(),
  creditLimit: z.number().positive().finite().optional(),
  currentBalance: z.number().min(0).finite().optional(),
  cutoffDay: z.number().int().min(1).max(31).optional(),
  paymentDueDay: z.number().int().min(1).max(31).optional(),
  status: EntityStatusSchema.optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Debe proporcionar al menos un campo para actualizar',
});

// Schema para actualización de saldo de tarjeta
export const CreditCardBalanceUpdateSchema = z.object({
  currentBalance: z.number()
    .min(0, 'El saldo no puede ser negativo')
    .finite('El saldo debe ser un número válido'),
});

// ============================================
// LOAN SCHEMAS (Préstamos)
// ============================================

export const LoanStatusSchema = z.enum(['ACTIVE', 'PAID_OFF', 'DEFAULTED']);

export const CreateLoanSchema = z.object({
  companyId: z.string()
    .min(1, 'El ID de empresa es requerido'),
  bankName: sanitizedString(100)
    .pipe(z.string().min(1, 'El nombre del banco es requerido').max(100, 'El nombre del banco no puede exceder 100 caracteres')),
  alias: sanitizedString(100)
    .pipe(z.string().max(100, 'El alias no puede exceder 100 caracteres'))
    .optional()
    .default(''),
  originalPrincipal: z.number()
    .min(0, 'El capital original no puede ser negativo')
    .finite('El capital debe ser un número válido'),
  interestRate: z.number()
    .min(0, 'El tipo de interés no puede ser negativo')
    .max(100, 'El tipo de interés no puede exceder 100%')
    .finite('El tipo de interés debe ser un número válido'),
  monthlyPayment: z.number()
    .positive('La cuota mensual debe ser mayor a 0')
    .finite('La cuota debe ser un número válido'),
  paymentDay: z.number()
    .int('El día de pago debe ser un número entero')
    .min(1, 'El día de pago debe ser entre 1 y 31')
    .max(31, 'El día de pago debe ser entre 1 y 31'),
  chargeAccountId: z.string().optional(),
  remainingBalance: z.number()
    .min(0, 'El saldo pendiente no puede ser negativo')
    .finite('El saldo debe ser un número válido'),
  remainingInstallments: z.number()
    .int('El número de cuotas debe ser un número entero')
    .positive('El número de cuotas restantes debe ser mayor a 0')
    .max(600, 'El número de cuotas no puede exceder 600'),
  firstPendingDate: z.union([
    z.date(),
    z.string().transform(val => new Date(val)),
  ]).refine(date => !isNaN(date.getTime()), {
    message: 'La fecha de primera cuota pendiente no es válida',
  }),
  status: LoanStatusSchema.default('ACTIVE'),
  notes: sanitizedString(1000)
    .pipe(z.string().max(1000, 'Las notas no pueden exceder 1000 caracteres'))
    .optional()
    .default(''),
});

export const UpdateLoanSchema = z.object({
  companyId: z.string().min(1).optional(),
  bankName: sanitizedString(100).pipe(z.string().min(1).max(100)).optional(),
  alias: sanitizedString(100).pipe(z.string().max(100)).optional(),
  originalPrincipal: z.number().min(0).finite().optional(),
  interestRate: z.number().min(0).max(100).finite().optional(),
  monthlyPayment: z.number().positive().finite().optional(),
  paymentDay: z.number().int().min(1).max(31).optional(),
  chargeAccountId: z.string().optional().nullable(),
  remainingBalance: z.number().min(0).finite().optional(),
  remainingInstallments: z.number().int().positive().max(600).optional(),
  firstPendingDate: z.union([
    z.date(),
    z.string().transform(val => new Date(val)),
  ]).optional(),
  endDate: z.union([
    z.date(),
    z.string().transform(val => new Date(val)),
  ]).optional(),
  paidInstallments: z.number().int().min(0).optional(),
  status: LoanStatusSchema.optional(),
  notes: sanitizedString(1000).pipe(z.string().max(1000)).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Debe proporcionar al menos un campo para actualizar',
});

// ============================================
// RECURRENCE SCHEMAS (Transacciones Recurrentes)
// ============================================

export const RecurrenceStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'ENDED']);

export const CreateRecurrenceSchema = z.object({
  companyId: z.string()
    .min(1, 'El ID de empresa es requerido'),
  type: TransactionTypeSchema,
  name: sanitizedString(100)
    .pipe(z.string().min(1, 'El nombre es requerido').max(100, 'El nombre no puede exceder 100 caracteres')),
  baseAmount: z.number()
    .positive('El monto debe ser mayor a 0')
    .finite('El monto debe ser un número válido'),
  category: sanitizedString(50)
    .pipe(z.string().max(50, 'La categoría no puede exceder 50 caracteres'))
    .optional()
    .default(''),
  thirdPartyId: z.string().optional(),
  thirdPartyName: sanitizedString(100)
    .pipe(z.string().max(100, 'El nombre del tercero no puede exceder 100 caracteres'))
    .optional()
    .default(''),
  accountId: z.string().optional(),
  certainty: CertaintyLevelSchema.default('HIGH'),
  notes: sanitizedString(1000)
    .pipe(z.string().max(1000, 'Las notas no pueden exceder 1000 caracteres'))
    .optional()
    .default(''),
  // Configuración de frecuencia
  frequency: RecurrenceFrequencySchema.refine(val => val !== 'NONE', {
    message: 'La frecuencia no puede ser NONE para una recurrencia',
  }),
  dayOfMonth: z.number()
    .int('El día del mes debe ser un número entero')
    .min(1, 'El día del mes debe ser entre 1 y 31')
    .max(31, 'El día del mes debe ser entre 1 y 31')
    .optional(),
  dayOfWeek: z.number()
    .int('El día de la semana debe ser un número entero')
    .min(0, 'El día de la semana debe ser entre 0 (Domingo) y 6 (Sábado)')
    .max(6, 'El día de la semana debe ser entre 0 (Domingo) y 6 (Sábado)')
    .optional(),
  startDate: z.union([
    z.date(),
    z.string().transform(val => new Date(val)),
  ]).refine(date => !isNaN(date.getTime()), {
    message: 'La fecha de inicio no es válida',
  }),
  endDate: z.union([
    z.date(),
    z.string().transform(val => new Date(val)),
    z.null(),
  ]).optional().nullable(),
  generateMonthsAhead: z.number()
    .int('Debe ser un número entero')
    .min(1, 'Debe generar al menos 1 mes')
    .max(24, 'No se pueden generar más de 24 meses')
    .default(6),
  status: RecurrenceStatusSchema.default('ACTIVE'),
}).refine(data => {
  // Si es MONTHLY, debe tener dayOfMonth
  if (['MONTHLY', 'QUARTERLY', 'YEARLY'].includes(data.frequency) && !data.dayOfMonth) {
    return false;
  }
  return true;
}, {
  message: 'Para frecuencias mensuales/trimestrales/anuales, debe especificar el día del mes',
  path: ['dayOfMonth'],
}).refine(data => {
  // Si es WEEKLY o BIWEEKLY, debe tener dayOfWeek
  if (['WEEKLY', 'BIWEEKLY'].includes(data.frequency) && data.dayOfWeek === undefined) {
    return false;
  }
  return true;
}, {
  message: 'Para frecuencias semanales, debe especificar el día de la semana',
  path: ['dayOfWeek'],
}).refine(data => {
  // Si tiene endDate, debe ser posterior a startDate
  if (data.endDate) {
    const startDate = data.startDate instanceof Date ? data.startDate : new Date(data.startDate);
    const endDate = data.endDate instanceof Date ? data.endDate : new Date(data.endDate);
    return endDate > startDate;
  }
  return true;
}, {
  message: 'La fecha de fin debe ser posterior a la fecha de inicio',
  path: ['endDate'],
});

export const UpdateRecurrenceSchema = z.object({
  companyId: z.string().min(1).optional(),
  type: TransactionTypeSchema.optional(),
  name: sanitizedString(100)
    .pipe(z.string().min(1).max(100))
    .optional(),
  baseAmount: z.number().positive().finite().optional(),
  category: sanitizedString(50).pipe(z.string().max(50)).optional(),
  thirdPartyId: z.string().optional().nullable(),
  thirdPartyName: sanitizedString(100).pipe(z.string().max(100)).optional(),
  accountId: z.string().optional().nullable(),
  certainty: CertaintyLevelSchema.optional(),
  notes: sanitizedString(1000).pipe(z.string().max(1000)).optional(),
  frequency: RecurrenceFrequencySchema.optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional().nullable(),
  dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  startDate: z.union([
    z.date(),
    z.string().transform(val => new Date(val)),
  ]).optional(),
  endDate: z.union([
    z.date(),
    z.string().transform(val => new Date(val)),
    z.null(),
  ]).optional().nullable(),
  generateMonthsAhead: z.number().int().min(1).max(24).optional(),
  status: RecurrenceStatusSchema.optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Debe proporcionar al menos un campo para actualizar',
});

// Schema para regenerar ocurrencias de una recurrencia
export const RegenerateOccurrencesSchema = z.object({
  recurrenceId: z.string().min(1, 'El ID de recurrencia es requerido'),
  fromDate: z.union([
    z.date(),
    z.string().transform(val => new Date(val)),
  ]).optional(),
  monthsAhead: z.number().int().min(1).max(24).optional(),
});

// ============================================
// TIPOS INFERIDOS DE ZOD
// ============================================

export type CreateCompanyInput = z.infer<typeof CreateCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof UpdateCompanySchema>;
export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;
export type BalanceUpdateInput = z.infer<typeof BalanceUpdateSchema>;
export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof UpdateTransactionSchema>;
export type TransactionActionInput = z.infer<typeof TransactionActionSchema>;
export type CreateCreditLineInput = z.infer<typeof CreateCreditLineSchema>;
export type UpdateCreditLineInput = z.infer<typeof UpdateCreditLineSchema>;
export type CreateCreditCardInput = z.infer<typeof CreateCreditCardSchema>;
export type UpdateCreditCardInput = z.infer<typeof UpdateCreditCardSchema>;
export type CreditCardBalanceUpdateInput = z.infer<typeof CreditCardBalanceUpdateSchema>;
export type CreateRecurrenceInput = z.infer<typeof CreateRecurrenceSchema>;
export type UpdateRecurrenceInput = z.infer<typeof UpdateRecurrenceSchema>;
export type RegenerateOccurrencesInput = z.infer<typeof RegenerateOccurrencesSchema>;

// ============================================
// ACCOUNT HOLD (RETENCIONES) SCHEMAS
// ============================================

export const AccountHoldTypeSchema = z.enum([
  'JUDICIAL',
  'TAX',
  'BANK_GUARANTEE',
  'PARTIAL',
  'FRAUD_BLOCK',
  'OTHER'
]);

export const AccountHoldStatusSchema = z.enum(['ACTIVE', 'RELEASED', 'EXPIRED']);

export const CreateAccountHoldSchema = z.object({
  accountId: z.string()
    .min(1, 'El ID de cuenta es requerido'),
  companyId: z.string()
    .min(1, 'El ID de empresa es requerido'),
  concept: sanitizedString(200)
    .pipe(z.string().min(1, 'El concepto es requerido').max(200, 'El concepto no puede exceder 200 caracteres')),
  amount: z.number()
    .positive('El importe debe ser mayor que 0')
    .finite('El importe debe ser un número válido'),
  startDate: z.string()
    .min(1, 'La fecha de inicio es requerida'),
  endDate: z.string()
    .nullable()
    .optional(),
  type: AccountHoldTypeSchema,
  reference: sanitizedString(100)
    .pipe(z.string().max(100, 'La referencia no puede exceder 100 caracteres'))
    .optional(),
  notes: sanitizedString(500)
    .pipe(z.string().max(500, 'Las notas no pueden exceder 500 caracteres'))
    .optional(),
});

export const UpdateAccountHoldSchema = z.object({
  concept: sanitizedString(200)
    .pipe(z.string().min(1).max(200))
    .optional(),
  amount: z.number().positive().finite().optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  type: AccountHoldTypeSchema.optional(),
  status: AccountHoldStatusSchema.optional(),
  reference: sanitizedString(100).pipe(z.string().max(100)).optional(),
  notes: sanitizedString(500).pipe(z.string().max(500)).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Debe proporcionar al menos un campo para actualizar',
});

export type CreateAccountHoldInput = z.infer<typeof CreateAccountHoldSchema>;
export type UpdateAccountHoldInput = z.infer<typeof UpdateAccountHoldSchema>;

// ============================================
// UTILIDAD PARA VALIDAR Y FORMATEAR ERRORES
// ============================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

export function validateSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.issues.map((err: z.ZodIssue) => {
    const path = err.path.length > 0 ? `${err.path.join('.')}: ` : '';
    return `${path}${err.message}`;
  });
  
  return { success: false, errors };
}
