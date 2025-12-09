/**
 * Generador de cuotas de préstamos
 * 
 * Este módulo contiene funciones para:
 * - Calcular el número de cuotas restantes
 * - Generar transacciones de pago para cada cuota pendiente
 * - Calcular fechas de vencimiento de cada cuota
 */

import { Loan, CreateTransactionInput } from '@/types';

/**
 * Calcula la fecha de la cuota N dado el día de pago y la fecha de primera cuota pendiente
 * IMPORTANTE: Usa técnica de "día 1 primero" para evitar overflow de fechas
 * Ej: new Date(2025, 1, 31) haría febrero 31 → marzo 3 (overflow)
 * Solución: Crear fecha con día 1, luego ajustar al día correcto
 */
export function calculateInstallmentDate(
  firstPendingDate: Date, 
  installmentNumber: number, 
  paymentDay: number
): Date {
  const start = new Date(firstPendingDate);
  // installmentNumber 1 = primera cuota (firstPendingDate), 2 = siguiente mes, etc.
  const targetMonth = start.getMonth() + (installmentNumber - 1);
  const targetYear = start.getFullYear() + Math.floor(targetMonth / 12);
  const adjustedMonth = targetMonth % 12;
  
  // Crear la fecha con día 1 para evitar overflow
  const targetDate = new Date(targetYear, adjustedMonth, 1);
  
  // Obtener el último día del mes objetivo
  const lastDayOfMonth = new Date(targetYear, adjustedMonth + 1, 0).getDate();
  
  // Ajustar al día de pago o al último día del mes si es menor
  targetDate.setDate(Math.min(paymentDay, lastDayOfMonth));
  
  return targetDate;
}

/**
 * Calcula la fecha de vencimiento final del préstamo
 */
export function calculateEndDate(
  firstPendingDate: Date,
  remainingInstallments: number,
  paymentDay: number
): Date {
  return calculateInstallmentDate(firstPendingDate, remainingInstallments, paymentDay);
}

/**
 * Genera las transacciones de cuotas para un préstamo
 * 
 * @param loan - Datos del préstamo
 * @param userId - ID del usuario
 * @returns Array de transacciones a crear (sin ID, se asignará en la base de datos)
 */
export function generateLoanInstallments(
  loan: Loan,
  userId: string
): Omit<CreateTransactionInput, 'createdBy'>[] {
  const installments: Omit<CreateTransactionInput, 'createdBy'>[] = [];
  
  const firstPendingDate = new Date(loan.firstPendingDate);
  
  for (let i = 1; i <= loan.remainingInstallments; i++) {
    const dueDate = calculateInstallmentDate(firstPendingDate, i, loan.paymentDay);
    
    const installment: Omit<CreateTransactionInput, 'createdBy'> = {
      companyId: loan.companyId,
      type: 'EXPENSE',
      amount: loan.monthlyPayment,
      status: 'PENDING',
      dueDate: dueDate,
      category: 'Préstamo',
      description: `Cuota ${i}/${loan.remainingInstallments} - ${loan.alias || loan.bankName}`,
      thirdPartyName: loan.bankName,
      notes: loan.originalPrincipal > 0 
        ? `Préstamo: ${loan.alias || loan.bankName}. Capital original: ${loan.originalPrincipal}€, Interés: ${loan.interestRate}%`
        : `Préstamo: ${loan.alias || loan.bankName}. Interés: ${loan.interestRate}%`,
      paymentMethod: 'DIRECT_DEBIT',
      chargeAccountId: loan.chargeAccountId,
      loanId: loan.id,
      loanInstallmentNumber: i,
      recurrence: 'NONE',
      certainty: 'HIGH',
    };
    
    installments.push(installment);
  }
  
  return installments;
}

/**
 * Calcula el saldo pendiente de un préstamo basado en las cuotas pagadas
 */
export function calculateUpdatedBalance(
  remainingBalance: number,
  monthlyPayment: number,
  paidInstallments: number
): number {
  return Math.max(0, remainingBalance - (monthlyPayment * paidInstallments));
}

/**
 * Calcula la cuota mensual aproximada usando fórmula de amortización francesa
 * 
 * @param principal - Capital inicial
 * @param annualInterestRate - Tipo de interés anual (en porcentaje, ej: 5 para 5%)
 * @param totalMonths - Número total de cuotas mensuales
 * @returns Cuota mensual calculada
 */
export function calculateMonthlyPayment(
  principal: number,
  annualInterestRate: number,
  totalMonths: number
): number {
  // Si el interés es 0, simplemente dividimos el capital
  if (annualInterestRate === 0) {
    return principal / totalMonths;
  }
  
  // Fórmula de amortización francesa
  const monthlyRate = annualInterestRate / 100 / 12;
  const numerator = principal * monthlyRate * Math.pow(1 + monthlyRate, totalMonths);
  const denominator = Math.pow(1 + monthlyRate, totalMonths) - 1;
  
  return Math.round((numerator / denominator) * 100) / 100; // Redondear a 2 decimales
}

/**
 * Genera un resumen del préstamo para mostrar en UI
 */
export function getLoanSummary(loan: Loan): {
  totalRemainingAmount: number;
  currentRemainingInstallments: number;
  nextPaymentDate: Date | null;
  progressPercentage: number;
} {
  const totalRemainingAmount = loan.monthlyPayment * (loan.remainingInstallments - loan.paidInstallments);
  const currentRemainingInstallments = loan.remainingInstallments - loan.paidInstallments;
  const progressPercentage = Math.round((loan.paidInstallments / loan.remainingInstallments) * 100);
  
  // Calcular próxima fecha de pago
  let nextPaymentDate: Date | null = null;
  if (currentRemainingInstallments > 0) {
    nextPaymentDate = calculateInstallmentDate(
      loan.firstPendingDate,
      loan.paidInstallments + 1,
      loan.paymentDay
    );
  }
  
  return {
    totalRemainingAmount,
    currentRemainingInstallments,
    nextPaymentDate,
    progressPercentage,
  };
}
