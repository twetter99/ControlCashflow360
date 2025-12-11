'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui';
import { useCompanyFilter } from '@/contexts/CompanyFilterContext';
import { useAuth } from '@/contexts/AuthContext';
import { accountsApi, creditLinesApi, transactionsApi, recurrencesApi, accountHoldsApi, creditCardsApi, companiesApi } from '@/lib/api-client';
import { Account, CreditLine, Transaction, IncomeLayer, AccountHold, CreditCard, Company } from '@/types';
import { PaymentOrderModal } from '@/components/PaymentOrderModal';
import toast, { Toaster } from 'react-hot-toast';
import { CreditCard as CreditCardIcon } from 'lucide-react';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  Clock,
  ArrowRight,
  Building2,
  Target,
  BarChart3,
  FileText,
  RefreshCw,
  Check,
  X,
  ExternalLink,
  Lock,
  ClipboardList,
  Send
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import Link from 'next/link';
import { auth } from '@/lib/firebase/config';

type ScenarioType = 'CONSERVATIVE' | 'REALISTIC' | 'OPTIMISTIC';

/**
 * Bucket de previsión con saldo acumulativo
 * Cada bucket representa un período específico (ej: días 0-30, 31-60, 61-90)
 * El saldoAcumulado arrastra el resultado de los buckets anteriores
 */
interface ForecastBucket {
  label: string;           // "Próximos 30 días", "Días 31-60", etc.
  dateRange: string;       // "1 Dic - 31 Dic 2025" - Rango de fechas real
  monthNames: string;      // "Diciembre" o "Diciembre-Enero" si cruza meses
  startDay: number;        // Día inicial del período (0, 31, 61)
  endDay: number;          // Día final del período (30, 60, 90)
  incomes: number;         // Cobros REALES de transacciones en este período
  estimatedIncomes: number; // Cobros ESPERADOS (pendientes de cobrar)
  effectiveIncomes: number; // Cobros efectivos (real si hay, si no estimado)
  expenses: number;        // Pagos SOLO de este período
  netFlow: number;         // Flujo neto de este período (effectiveIncomes - expenses)
  cumulativeBalance: number; // Saldo acumulado (saldo inicial + todos los flujos hasta este bucket)
  incomeTransactions: Transaction[];  // Transacciones de cobros del período
  expenseTransactions: Transaction[]; // Transacciones de pagos del período
}

// Tipo para el modal de detalle
interface TransactionDetailModal {
  isOpen: boolean;
  title: string;
  type: 'INCOME' | 'EXPENSE';
  transactions: Transaction[];
  total: number;
  monthLabel: string;
}

/*
 * EJEMPLO DE CÁLCULO ACUMULATIVO:
 * 
 * Supongamos:
 *   - Saldo inicial en bancos: 10.000€
 *   - Mes 1 (0-30): +5.000 cobros, -8.000 pagos → flujo -3.000€
 *   - Mes 2 (31-60): +2.000 cobros, -1.000 pagos → flujo +1.000€
 *   - Mes 3 (61-90): +4.000 cobros, -2.000 pagos → flujo +2.000€
 * 
 * Resultado:
 *   | Período | Cobros | Pagos | Flujo  | Saldo Acumulado |
 *   |---------|--------|-------|--------|-----------------|
 *   | 0-30    | 5.000  | 8.000 | -3.000 | 7.000€          | (10.000 - 3.000)
 *   | 31-60   | 2.000  | 1.000 | +1.000 | 8.000€          | (7.000 + 1.000)
 *   | 61-90   | 4.000  | 2.000 | +2.000 | 10.000€         | (8.000 + 2.000)
 * 
 * El saldo negativo del primer período SE ARRASTRA al siguiente.
 */

export default function DashboardPage() {
  const { selectedCompanyId } = useCompanyFilter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [scenario, setScenario] = useState<ScenarioType>('REALISTIC');
  
  // Datos reales de Firebase
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditLines, setCreditLines] = useState<CreditLine[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accountHolds, setAccountHolds] = useState<AccountHold[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  
  // Objetivo mensual de ingresos (Sistema 3 Capas)
  const [monthlyIncomeGoal, setMonthlyIncomeGoal] = useState<number>(0);
  
  // Todos los presupuestos mensuales (para previsiones)
  const [allBudgets, setAllBudgets] = useState<{ year: number; month: number; incomeGoal: number }[]>([]);
  
  // Período seleccionado para próximos vencimientos
  const [upcomingDaysFilter, setUpcomingDaysFilter] = useState<7 | 15 | 21 | 30>(7);
  
  // Selección de pagos para órdenes de pago desde dashboard
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<Set<string>>(new Set());
  const [showPaymentOrderModal, setShowPaymentOrderModal] = useState(false);
  
  // Modal de detalle de transacciones
  const [detailModal, setDetailModal] = useState<TransactionDetailModal>({
    isOpen: false,
    title: '',
    type: 'INCOME',
    transactions: [],
    total: 0,
    monthLabel: ''
  });

  /**
   * Determina la capa del ingreso basada en la lógica del Sistema de 3 Capas:
   * - Capa 1 (Facturado): Tiene número de factura
   * - Capa 2 (Contratos): Recurrencia != NONE y certeza HIGH
   * - Capa 3 (Por cerrar): Todo lo demás
   */
  const getIncomeLayer = (tx: Transaction): IncomeLayer => {
    if (tx.type !== 'INCOME') return 3;
    if (tx.invoiceNumber) return 1; // Facturado
    if (tx.recurrence !== 'NONE' && tx.certainty === 'HIGH') return 2; // Contrato recurrente
    return 3; // Estimado / Por cerrar
  };

  // Cargar datos via API
  useEffect(() => {
    if (!user) return;
    
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Primero regenerar recurrencias para asegurar transacciones futuras
        // Regenerar cada hora para mantener ventana deslizante de 6 meses
        // (la Cloud Function corre diariamente a las 6 AM, esto es un respaldo)
        try {
          const lastRegenKey = 'winfin_last_recurrence_regen';
          const lastRegen = localStorage.getItem(lastRegenKey);
          const oneHourAgo = Date.now() - (1 * 60 * 60 * 1000);
          
          if (!lastRegen || parseInt(lastRegen) < oneHourAgo) {
            // Regenerar con 6 meses de ventana desde hoy
            await recurrencesApi.regenerate(undefined, 6);
            localStorage.setItem(lastRegenKey, String(Date.now()));
            console.log('[Dashboard] Recurrencias regeneradas correctamente (ventana 6 meses)');
          }
        } catch (regenError) {
          // No bloquear si falla la regeneración, solo log
          console.warn('Regeneración de recurrencias falló (puede ser primera carga):', regenError);
        }
        
        // Luego cargar todos los datos
        const [accountsData, creditLinesData, creditCardsData, transactionsData, holdsData, companiesData] = await Promise.all([
          accountsApi.getAll(),
          creditLinesApi.getAll(),
          creditCardsApi.getAll(),
          transactionsApi.getAll(),
          accountHoldsApi.getAll(undefined, 'ACTIVE'),
          companiesApi.getAll()
        ]);
        setAccounts(accountsData);
        setCreditLines(creditLinesData);
        setCreditCards(creditCardsData);
        setTransactions(transactionsData);
        setAccountHolds(holdsData);
        setCompanies(companiesData);
      } catch (error) {
        console.error('Error cargando datos del dashboard:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [user]);

  // Cargar presupuestos mensuales desde la API
  useEffect(() => {
    const loadBudgets = async () => {
      try {
        if (!auth?.currentUser) return;
        
        const currentMonth = new Date().getMonth() + 1; // 1-12
        const currentYear = new Date().getFullYear();
        const nextYear = currentYear + 1;
        
        const token = await auth.currentUser.getIdToken();
        
        // Cargar budgets del año actual y siguiente (para previsiones a 90 días)
        const [responseCurrentYear, responseNextYear] = await Promise.all([
          fetch(`/api/budgets?year=${currentYear}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`/api/budgets?year=${nextYear}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);
        
        const budgets: { year: number; month: number; incomeGoal: number }[] = [];
        
        if (responseCurrentYear.ok) {
          const result = await responseCurrentYear.json();
          if (result.success && result.data) {
            budgets.push(...result.data.map((b: { year: number; month: number; incomeGoal: number }) => ({
              year: b.year,
              month: b.month,
              incomeGoal: b.incomeGoal || 0
            })));
          }
        }
        
        if (responseNextYear.ok) {
          const result = await responseNextYear.json();
          if (result.success && result.data) {
            budgets.push(...result.data.map((b: { year: number; month: number; incomeGoal: number }) => ({
              year: b.year,
              month: b.month,
              incomeGoal: b.incomeGoal || 0
            })));
          }
        }
        
        setAllBudgets(budgets);
        
        // Establecer objetivo del mes actual
        const currentBudget = budgets.find(b => b.month === currentMonth && b.year === currentYear);
        if (currentBudget?.incomeGoal) {
          setMonthlyIncomeGoal(currentBudget.incomeGoal);
        }
      } catch (error) {
        console.error('Error cargando presupuestos:', error);
      }
    };
    loadBudgets();
  }, [user]);

  // Filtrar por empresa si está seleccionada
  const filteredAccounts = selectedCompanyId 
    ? accounts.filter(a => a.companyId === selectedCompanyId)
    : accounts;
  
  const filteredCreditLines = selectedCompanyId
    ? creditLines.filter(cl => cl.companyId === selectedCompanyId)
    : creditLines;
  
  // Solo pólizas de CRÉDITO suman a la liquidez (no las de DESCUENTO)
  const creditLinesForLiquidity = filteredCreditLines.filter(cl => cl.lineType !== 'DISCOUNT');
  
  const filteredTransactions = selectedCompanyId
    ? transactions.filter(tx => tx.companyId === selectedCompanyId)
    : transactions;
  
  // Filtrar tarjetas de crédito
  const filteredCreditCards = selectedCompanyId
    ? creditCards.filter(cc => cc.companyId === selectedCompanyId && cc.status === 'ACTIVE')
    : creditCards.filter(cc => cc.status === 'ACTIVE');

  // ==========================================
  // CAPA 1: SITUACIÓN REAL (BANCOS)
  // ==========================================
  const totalBankBalance = filteredAccounts.reduce((sum, acc) => sum + acc.currentBalance, 0);
  const totalCreditAvailable = creditLinesForLiquidity.reduce((sum, cl) => sum + cl.available, 0);
  
  // Tarjetas de crédito
  const totalCardDebt = filteredCreditCards.reduce((sum, cc) => sum + (cc.currentBalance || 0), 0);
  const totalCardAvailable = filteredCreditCards.reduce((sum, cc) => sum + (cc.availableCredit || 0), 0);
  const totalCardLimit = filteredCreditCards.reduce((sum, cc) => sum + (cc.creditLimit || 0), 0);
  
  // Calcular retenciones activas
  const filteredHolds = selectedCompanyId
    ? accountHolds.filter(h => h.companyId === selectedCompanyId && h.status === 'ACTIVE')
    : accountHolds.filter(h => h.status === 'ACTIVE');
  const totalHoldsAmount = filteredHolds.reduce((sum, h) => sum + h.amount, 0);
  const totalAvailableBalance = totalBankBalance - totalHoldsAmount;
  
  // Liquidez total (bancos + pólizas + disponible tarjetas)
  const totalLiquidity = totalAvailableBalance + totalCreditAvailable + totalCardAvailable;
  
  // Liquidez de emergencia (solo pólizas + tarjetas disponibles)
  const emergencyLiquidity = totalCreditAvailable + totalCardAvailable;

  // ==========================================
  // CAPA 2: PREVISIONES (MOVIMIENTOS)
  // ==========================================
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalizar a inicio del día
  const pendingTransactions = filteredTransactions.filter(tx => tx.status === 'PENDING');

  // Filtrar por certeza según escenario
  const getFilteredByScenario = (txs: Transaction[]) => {
    switch (scenario) {
      case 'CONSERVATIVE':
        // Solo certeza Alta para ingresos, todos los gastos
        return txs.filter(tx => (tx.certainty === 'HIGH' || !tx.certainty) || tx.type === 'EXPENSE');
      case 'REALISTIC':
        // Alta + Media para ingresos, todos los gastos
        return txs.filter(tx => (tx.certainty === 'HIGH' || tx.certainty === 'MEDIUM' || !tx.certainty) || tx.type === 'EXPENSE');
      case 'OPTIMISTIC':
        // Todas
        return txs;
      default:
        return txs;
    }
  };

  /**
   * Formatea el nombre del mes en español
   */
  const getMonthName = (date: Date): string => {
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return months[date.getMonth()];
  };

  /**
   * Formatea una fecha corta (día Mes)
   */
  const formatShortDate = (date: Date): string => {
    return `${date.getDate()} ${getMonthName(date).substring(0, 3)}`;
  };

  /**
   * Calcula los buckets de previsión MENSUALES con saldo acumulativo
   * Cada bucket representa UN MES COMPLETO (no rangos de 30 días)
   * El saldoAcumulado arrastra el resultado de los meses anteriores
   */
  const calculateForecastBuckets = (): ForecastBucket[] => {
    const filteredTxs = getFilteredByScenario(pendingTransactions);
    
    // Generar los próximos 4 meses naturales a partir de hoy
    const generateMonthlyPeriods = () => {
      const periods: { year: number; month: number; label: string; startDate: Date; endDate: Date; dateRange: string }[] = [];
      const currentDate = new Date(today);
      
      for (let i = 0; i < 4; i++) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth(); // 0-11
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // Para el primer mes, empezar desde hoy; para los demás, desde el día 1
        const startDate = i === 0 
          ? new Date(today) 
          : new Date(year, month, 1);
        startDate.setHours(0, 0, 0, 0);
        
        const endDate = new Date(year, month, daysInMonth, 23, 59, 59, 999);
        
        const monthName = getMonthName(startDate);
        const dateRange = `${startDate.getDate()} ${monthName.substring(0, 3)} - ${endDate.getDate()} ${monthName.substring(0, 3)} ${year}`;
        
        periods.push({
          year,
          month: month + 1, // 1-12 para buscar presupuesto
          label: monthName,
          startDate,
          endDate,
          dateRange
        });
        
        // Avanzar al siguiente mes
        currentDate.setMonth(currentDate.getMonth() + 1);
        currentDate.setDate(1);
      }
      
      return periods;
    };
    
    const monthlyPeriods = generateMonthlyPeriods();
    
    /**
     * Obtiene el presupuesto mensual completo para un mes específico
     * NO prorratea - siempre devuelve el objetivo mensual íntegro
     */
    const getMonthlyBudget = (year: number, month: number): number => {
      const budget = allBudgets.find(b => b.year === year && b.month === month);
      return budget?.incomeGoal || 0;
    };
    
    // Empezamos con el saldo disponible (descontando retenciones) para previsiones más realistas
    let runningBalance = totalAvailableBalance;
    
    return monthlyPeriods.map((period, index) => {
      // Filtrar transacciones SOLO de este mes específico
      const txsInPeriod = filteredTxs.filter(tx => {
        const dueDate = new Date(tx.dueDate);
        return dueDate >= period.startDate && dueDate <= period.endDate;
      });
      
      // Separar transacciones por tipo
      const incomeTransactions = txsInPeriod.filter(tx => tx.type === 'INCOME');
      const expenseTransactions = txsInPeriod.filter(tx => tx.type === 'EXPENSE');
      
      // Calcular cobros REALES (transacciones INCOME del período)
      const incomes = incomeTransactions.reduce((sum, tx) => sum + tx.amount, 0);
      
      // Obtener el presupuesto mensual COMPLETO (objetivo del mes)
      const monthlyBudget = getMonthlyBudget(period.year, period.month);
      
      // Cobros ESPERADOS = Presupuesto - Reales (mínimo 0, nunca negativo)
      // A medida que se añaden transacciones reales, el estimado va bajando
      const estimatedIncomes = Math.max(0, monthlyBudget - incomes);
      
      // Cobros efectivos para el cálculo del flujo = Reales + Estimados pendientes
      // Esto equivale al presupuesto si no hay reales, o a los reales si superan el presupuesto
      const effectiveIncomes = incomes + estimatedIncomes;
      
      // Calcular gastos
      const expenses = expenseTransactions.reduce((sum, tx) => sum + tx.amount, 0);
      
      // Flujo neto usa los ingresos efectivos
      const netFlow = effectiveIncomes - expenses;
      
      // Acumular al saldo corriente (ARRASTRA del período anterior)
      runningBalance = runningBalance + netFlow;
      
      return {
        label: period.label,
        dateRange: period.dateRange,
        monthNames: period.label,
        startDay: index * 30, // Aproximación para compatibilidad
        endDay: (index + 1) * 30,
        incomes,
        estimatedIncomes,
        effectiveIncomes,
        expenses,
        netFlow,
        cumulativeBalance: runningBalance,
        incomeTransactions,
        expenseTransactions,
      };
    });
  };

  // Calcular los buckets de previsión mensuales (4 meses)
  const forecastBuckets = calculateForecastBuckets();

  // Calcular runway (días que puedo sobrevivir con el saldo actual)
  // Usamos el saldo disponible (descontando retenciones) para un cálculo más realista
  const monthlyExpenses = pendingTransactions
    .filter(tx => tx.type === 'EXPENSE')
    .reduce((sum, tx) => sum + tx.amount, 0) / 3; // Promedio mensual
  
  const dailyBurn = monthlyExpenses / 30;
  const runway = dailyBurn > 0 ? Math.round(totalAvailableBalance / dailyBurn) : 999;

  // Función para filtrar transacciones por días
  const getTransactionsInDays = (days: number) => {
    return pendingTransactions.filter(tx => {
      const daysUntil = Math.ceil((new Date(tx.dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntil >= 0 && daysUntil <= days;
    });
  };

  // Estadísticas por período para los tabs
  const upcomingStats = {
    7: (() => {
      const txs = getTransactionsInDays(7);
      return {
        count: txs.length,
        total: txs.reduce((sum, tx) => sum + (tx.type === 'EXPENSE' ? -tx.amount : tx.amount), 0),
        expenses: txs.filter(tx => tx.type === 'EXPENSE').reduce((sum, tx) => sum + tx.amount, 0),
        incomes: txs.filter(tx => tx.type === 'INCOME').reduce((sum, tx) => sum + tx.amount, 0),
      };
    })(),
    15: (() => {
      const txs = getTransactionsInDays(15);
      return {
        count: txs.length,
        total: txs.reduce((sum, tx) => sum + (tx.type === 'EXPENSE' ? -tx.amount : tx.amount), 0),
        expenses: txs.filter(tx => tx.type === 'EXPENSE').reduce((sum, tx) => sum + tx.amount, 0),
        incomes: txs.filter(tx => tx.type === 'INCOME').reduce((sum, tx) => sum + tx.amount, 0),
      };
    })(),
    21: (() => {
      const txs = getTransactionsInDays(21);
      return {
        count: txs.length,
        total: txs.reduce((sum, tx) => sum + (tx.type === 'EXPENSE' ? -tx.amount : tx.amount), 0),
        expenses: txs.filter(tx => tx.type === 'EXPENSE').reduce((sum, tx) => sum + tx.amount, 0),
        incomes: txs.filter(tx => tx.type === 'INCOME').reduce((sum, tx) => sum + tx.amount, 0),
      };
    })(),
    30: (() => {
      const txs = getTransactionsInDays(30);
      return {
        count: txs.length,
        total: txs.reduce((sum, tx) => sum + (tx.type === 'EXPENSE' ? -tx.amount : tx.amount), 0),
        expenses: txs.filter(tx => tx.type === 'EXPENSE').reduce((sum, tx) => sum + tx.amount, 0),
        incomes: txs.filter(tx => tx.type === 'INCOME').reduce((sum, tx) => sum + tx.amount, 0),
      };
    })(),
  };

  // Próximos vencimientos (filtrado dinámico)
  const upcomingTransactions = getTransactionsInDays(upcomingDaysFilter)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  // Pagos elegibles para orden de pago (gastos por transferencia pendientes)
  const eligiblePayments = upcomingTransactions.filter(tx => 
    tx.type === 'EXPENSE' && 
    tx.status === 'PENDING' &&
    tx.paymentMethod === 'TRANSFER'
  );

  // Verificar si una transacción es elegible para orden de pago
  const isEligibleForPaymentOrder = (tx: Transaction): boolean => {
    return tx.type === 'EXPENSE' && 
           tx.status === 'PENDING' &&
           tx.paymentMethod === 'TRANSFER';
  };

  // Toggle selección individual
  const togglePaymentSelection = (txId: string) => {
    setSelectedPaymentIds(prev => {
      const next = new Set(prev);
      if (next.has(txId)) {
        next.delete(txId);
      } else {
        next.add(txId);
      }
      return next;
    });
  };

  // Seleccionar/deseleccionar todos los elegibles
  const toggleAllPayments = () => {
    if (selectedPaymentIds.size === eligiblePayments.length) {
      setSelectedPaymentIds(new Set());
    } else {
      setSelectedPaymentIds(new Set(eligiblePayments.map(tx => tx.id)));
    }
  };

  // Calcular total seleccionado
  const selectedPaymentsTotal = upcomingTransactions
    .filter(tx => selectedPaymentIds.has(tx.id))
    .reduce((sum, tx) => sum + tx.amount, 0);

  // Alertas
  const alerts: { id: string; type: string; message: string; severity: string }[] = [];
  
  const firstBucket = forecastBuckets[0];
  if (firstBucket && firstBucket.cumulativeBalance < 0) {
    alerts.push({ id: '1', type: 'CRITICAL', message: `Saldo proyectado negativo en ${firstBucket.label}`, severity: 'HIGH' });
  }
  if (runway < 30) {
    alerts.push({ id: '2', type: 'RUNWAY', message: `Runway crítico: ${runway} días`, severity: 'HIGH' });
  }
  if (filteredAccounts.some(acc => {
    const hoursDiff = (today.getTime() - new Date(acc.lastUpdateDate).getTime()) / (1000 * 60 * 60);
    return hoursDiff > 48;
  })) {
    alerts.push({ id: '3', type: 'STALE', message: 'Hay cuentas sin actualizar hace más de 48h', severity: 'MEDIUM' });
  }

  const getRiskLevel = (bucket: ForecastBucket) => {
    if (bucket.cumulativeBalance < 0) return 'HIGH';
    if (bucket.cumulativeBalance < totalBankBalance * 0.3) return 'MEDIUM';
    return 'LOW';
  };

  // Colores para las tarjetas de cada mes
  const cardColors = [
    'border-l-blue-500',
    'border-l-purple-500',
    'border-l-orange-500',
    'border-l-teal-500',
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard de Tesorería</h1>
          <p className="text-gray-500 mt-1">
            Vista consolidada del estado financiero
            {selectedCompanyId && ' • Filtrado por empresa'}
          </p>
        </div>
        <div className="flex items-center space-x-3 flex-wrap gap-2">
          {/* Selector de escenario */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setScenario('CONSERVATIVE')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                scenario === 'CONSERVATIVE' 
                  ? 'bg-white shadow text-gray-900' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Conservador
            </button>
            <button
              onClick={() => setScenario('REALISTIC')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                scenario === 'REALISTIC' 
                  ? 'bg-white shadow text-gray-900' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Realista
            </button>
            <button
              onClick={() => setScenario('OPTIMISTIC')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                scenario === 'OPTIMISTIC' 
                  ? 'bg-white shadow text-gray-900' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Optimista
            </button>
          </div>
          <Link
            href="/morning-check"
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Clock size={18} className="mr-2" />
            Rutina Diaria
            <ArrowRight size={18} className="ml-2" />
          </Link>
        </div>
      </div>

      {/* Alertas activas */}
      {alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start">
            <AlertTriangle className="text-amber-500 mr-3 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800">Alertas activas ({alerts.length})</h3>
              <ul className="mt-2 space-y-1">
                {alerts.map((alert) => (
                  <li key={alert.id} className="text-sm text-amber-700">
                    • {alert.message}
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/alerts" className="text-sm text-amber-700 hover:text-amber-800 font-medium">
              Ver todas →
            </Link>
          </div>
        </div>
      )}

      {/* ==========================================
          CAPA 1: SITUACIÓN REAL
          ========================================== */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-xl p-6 text-white">
        <div className="flex items-center mb-4">
          <Building2 size={24} className="mr-2" />
          <h2 className="text-lg font-semibold">Situación Actual (Real)</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div>
            <p className="text-blue-200 text-sm">Saldo en Bancos</p>
            <p className="text-3xl font-bold">{formatCurrency(totalBankBalance)}</p>
            <p className="text-blue-200 text-xs mt-1">{filteredAccounts.length} cuentas activas</p>
          </div>
          {totalHoldsAmount > 0 && (
            <div>
              <p className="text-amber-300 text-sm flex items-center">
                <Lock size={12} className="mr-1" /> Retenciones
              </p>
              <p className="text-2xl font-bold text-amber-300">-{formatCurrency(totalHoldsAmount)}</p>
              <p className="text-amber-200 text-xs mt-1">
                Disponible: {formatCurrency(totalAvailableBalance)}
              </p>
            </div>
          )}
          <div>
            <p className="text-blue-200 text-sm">Pólizas Disponibles</p>
            <p className="text-3xl font-bold">{formatCurrency(totalCreditAvailable)}</p>
            <p className="text-blue-200 text-xs mt-1">
              {creditLinesForLiquidity.length} pólizas de crédito
              {filteredCreditLines.length > creditLinesForLiquidity.length && (
                <span className="text-blue-300"> (+{filteredCreditLines.length - creditLinesForLiquidity.length} descuento)</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-blue-200 text-sm">Liquidez Total</p>
            <p className="text-3xl font-bold">{formatCurrency(totalLiquidity)}</p>
            <p className="text-blue-200 text-xs mt-1">
              {filteredCreditCards.length > 0 
                ? 'Bancos + Pólizas + Tarjetas' 
                : totalHoldsAmount > 0 ? 'Disponible + Crédito' : 'Bancos + Crédito'}
            </p>
          </div>
          <div>
            <p className="text-blue-200 text-sm">Runway</p>
            <p className={`text-3xl font-bold ${runway < 30 ? 'text-red-300' : runway < 60 ? 'text-yellow-300' : ''}`}>
              {runway > 900 ? '∞' : `${runway} días`}
            </p>
            <p className="text-blue-200 text-xs mt-1">Cobertura con saldo actual</p>
          </div>
        </div>
      </div>

      {/* ==========================================
          TARJETAS DE CRÉDITO (Sección compacta)
          ========================================== */}
      {filteredCreditCards.length > 0 && (
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <CreditCardIcon size={20} className="mr-2" />
              <h2 className="text-base font-semibold">Tarjetas de Crédito</h2>
            </div>
            <Link 
              href="/credit-cards"
              className="text-xs text-purple-200 hover:text-white flex items-center gap-1"
            >
              Gestionar <ExternalLink size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-purple-200 text-xs">Tarjetas Activas</p>
              <p className="text-xl font-bold">{filteredCreditCards.length}</p>
              <p className="text-purple-300 text-xs">
                Límite: {formatCurrency(totalCardLimit)}
              </p>
            </div>
            <div>
              <p className="text-red-300 text-xs">💳 Deuda Tarjetas</p>
              <p className="text-xl font-bold text-red-300">{formatCurrency(totalCardDebt)}</p>
              <p className="text-red-200 text-xs">Pago pendiente</p>
            </div>
            <div>
              <p className="text-green-300 text-xs">Disponible Tarjetas</p>
              <p className="text-xl font-bold text-green-300">{formatCurrency(totalCardAvailable)}</p>
              <p className="text-green-200 text-xs">Crédito disponible</p>
            </div>
            <div>
              <p className="text-purple-200 text-xs">Liquidez Emergencia</p>
              <p className="text-xl font-bold">{formatCurrency(emergencyLiquidity)}</p>
              <p className="text-purple-300 text-xs">Pólizas + Tarjetas</p>
            </div>
          </div>
          {/* Indicador compacto de uso */}
          {totalCardLimit > 0 && (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-purple-200 text-xs">Uso:</span>
              <div className="flex-1 bg-purple-900 rounded-full h-1.5">
                <div 
                  className={`h-1.5 rounded-full transition-all ${
                    (totalCardDebt / totalCardLimit) > 0.8 ? 'bg-red-400' :
                    (totalCardDebt / totalCardLimit) > 0.5 ? 'bg-yellow-400' : 'bg-green-400'
                  }`}
                  style={{ width: `${Math.min((totalCardDebt / totalCardLimit) * 100, 100)}%` }}
                />
              </div>
              <span className={`text-xs font-medium ${
                (totalCardDebt / totalCardLimit) > 0.8 ? 'text-red-300' :
                (totalCardDebt / totalCardLimit) > 0.5 ? 'text-yellow-300' : 'text-green-300'
              }`}>
                {((totalCardDebt / totalCardLimit) * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* ==========================================
          CAPA 2: PREVISIONES
          ========================================== */}
      <div className="bg-gray-50 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center">
            <BarChart3 size={24} className="mr-2 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">Previsiones ({
              scenario === 'CONSERVATIVE' ? 'Escenario Conservador' :
              scenario === 'REALISTIC' ? 'Escenario Realista' : 'Escenario Optimista'
            })</h2>
          </div>
          <div className="flex items-center text-sm text-gray-500">
            <Target size={14} className="mr-1" />
            {scenario === 'CONSERVATIVE' && 'Solo ingresos con certeza Alta'}
            {scenario === 'REALISTIC' && 'Ingresos con certeza Alta y Media'}
            {scenario === 'OPTIMISTIC' && 'Todos los ingresos previstos'}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {forecastBuckets.map((bucket, index) => (
            <Card key={index} className={`border-l-4 ${cardColors[index] || 'border-l-gray-500'}`}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{bucket.monthNames}</h3>
                    <p className="text-xs text-gray-500">{bucket.dateRange}</p>
                  </div>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    getRiskLevel(bucket) === 'LOW' ? 'bg-green-100 text-green-800' :
                    getRiskLevel(bucket) === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    Riesgo {getRiskLevel(bucket) === 'LOW' ? 'Bajo' : 
                            getRiskLevel(bucket) === 'MEDIUM' ? 'Medio' : 'Alto'}
                  </span>
                </div>
                <div className="space-y-2">
                  {/* Cobros Esperados (pendientes de cobrar) */}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Cobros esperados</span>
                    <span className={`font-medium ${bucket.estimatedIncomes > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                      +{formatCurrency(bucket.estimatedIncomes)}
                    </span>
                  </div>
                  {/* Cobros Reales (transacciones) - Clicable */}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Cobros reales</span>
                    {bucket.incomes > 0 ? (
                      <button
                        onClick={() => setDetailModal({
                          isOpen: true,
                          title: 'Cobros Reales',
                          type: 'INCOME',
                          transactions: bucket.incomeTransactions,
                          total: bucket.incomes,
                          monthLabel: bucket.monthNames
                        })}
                        className="font-semibold text-green-600 hover:text-green-700 hover:underline flex items-center gap-1 transition-colors"
                      >
                        +{formatCurrency(bucket.incomes)}
                        <ExternalLink size={12} />
                      </button>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </div>
                  {/* Pagos Previstos - Clicable */}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Pagos previstos</span>
                    {bucket.expenses > 0 ? (
                      <button
                        onClick={() => setDetailModal({
                          isOpen: true,
                          title: 'Pagos Previstos',
                          type: 'EXPENSE',
                          transactions: bucket.expenseTransactions,
                          total: bucket.expenses,
                          monthLabel: bucket.monthNames
                        })}
                        className="font-semibold text-red-600 hover:text-red-700 hover:underline flex items-center gap-1 transition-colors"
                      >
                        -{formatCurrency(bucket.expenses)}
                        <ExternalLink size={12} />
                      </button>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-sm border-t pt-2">
                    <span className="text-gray-600 font-medium">Flujo neto período</span>
                    <span className={`font-bold ${bucket.netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {bucket.netFlow >= 0 ? '+' : ''}{formatCurrency(bucket.netFlow)}
                    </span>
                  </div>
                </div>
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-700">Saldo acumulado</span>
                    <span className={`text-xl font-bold ${bucket.cumulativeBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(bucket.cumulativeBalance)}
                    </span>
                  </div>
                  {index === 0 && bucket.incomes === 0 && bucket.estimatedIncomes > 0 && (
                    <p className="text-xs text-amber-600 mt-1">Usando estimado (sin transacciones reales)</p>
                  )}
                  {index > 0 && (
                    <p className="text-xs text-gray-400 mt-1">Arrastra saldo de período anterior</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* ==========================================
          SISTEMA DE 3 CAPAS DE INGRESOS
          ========================================== */}
      {(() => {
        // Calcular ingresos por capa del mes actual
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        const monthlyIncomes = filteredTransactions.filter(tx => {
          const txDate = new Date(tx.dueDate);
          return tx.type === 'INCOME' && 
                 txDate.getMonth() === currentMonth && 
                 txDate.getFullYear() === currentYear;
        });
        
        // Separar por capas
        const layer1 = monthlyIncomes.filter(tx => getIncomeLayer(tx) === 1);
        const layer2 = monthlyIncomes.filter(tx => getIncomeLayer(tx) === 2);
        const layer3 = monthlyIncomes.filter(tx => getIncomeLayer(tx) === 3);
        
        const layer1Total = layer1.reduce((sum, tx) => sum + tx.amount, 0);
        const layer2Total = layer2.reduce((sum, tx) => sum + tx.amount, 0);
        const layer3Total = layer3.reduce((sum, tx) => sum + tx.amount, 0);
        const totalIncomes = layer1Total + layer2Total + layer3Total;
        
        // Calcular progreso hacia el objetivo
        const goalProgress = monthlyIncomeGoal > 0 ? (totalIncomes / monthlyIncomeGoal) * 100 : 0;
        const layer1Progress = monthlyIncomeGoal > 0 ? (layer1Total / monthlyIncomeGoal) * 100 : 0;
        const layer2Progress = monthlyIncomeGoal > 0 ? (layer2Total / monthlyIncomeGoal) * 100 : 0;
        const layer3Progress = monthlyIncomeGoal > 0 ? (layer3Total / monthlyIncomeGoal) * 100 : 0;
        
        // Diferencia entre estimado y real
        const difference = totalIncomes - monthlyIncomeGoal;
        const hasBudget = monthlyIncomeGoal > 0;
        const hasRealIncomes = totalIncomes > 0;
        
        // Nombres de meses
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                           'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        
        return (
          <div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl p-6 border border-green-200">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div className="flex items-center">
                <Target size={24} className="mr-2 text-emerald-700" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Sistema de 3 Capas - Ingresos</h2>
                  <p className="text-sm text-gray-500">{monthNames[currentMonth]} {currentYear}</p>
                </div>
              </div>
              
              {/* Vista híbrida: Estimado | Real | Diferencia */}
              <div className="flex items-center gap-4 flex-wrap">
                {hasBudget && (
                  <div className="text-center px-4 py-2 bg-white/60 rounded-lg border border-emerald-200">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Estimado</p>
                    <p className="text-lg font-bold text-emerald-700">{formatCurrency(monthlyIncomeGoal)}</p>
                  </div>
                )}
                <div className="text-center px-4 py-2 bg-white/60 rounded-lg border border-blue-200">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Real</p>
                  <p className={`text-lg font-bold ${hasRealIncomes ? 'text-blue-700' : 'text-gray-400'}`}>
                    {hasRealIncomes ? formatCurrency(totalIncomes) : '—'}
                  </p>
                </div>
                {hasBudget && (
                  <div className="text-center px-4 py-2 bg-white/60 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Diferencia</p>
                    <p className={`text-lg font-bold ${
                      difference >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {difference >= 0 ? '+' : ''}{formatCurrency(difference)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Barra de progreso por capas */}
            {hasBudget && (
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {hasRealIncomes 
                      ? `Conseguido: ${formatCurrency(totalIncomes)} de ${formatCurrency(monthlyIncomeGoal)} estimado`
                      : `Sin ingresos reales registrados aún`
                    }
                  </span>
                  <span className={`text-sm font-bold ${goalProgress >= 100 ? 'text-emerald-600' : goalProgress >= 75 ? 'text-green-600' : 'text-gray-600'}`}>
                    {hasRealIncomes ? `${Math.min(goalProgress, 100).toFixed(0)}%` : '0%'}
                  </span>
                </div>
                <div className="h-4 bg-gray-200 rounded-full overflow-hidden flex">
                  {/* Capa 1 - Verde oscuro (Facturado) */}
                  <div 
                    className="h-full bg-emerald-600 transition-all duration-500"
                    style={{ width: `${Math.min(layer1Progress, 100)}%` }}
                    title={`Capa 1 (Facturado): ${formatCurrency(layer1Total)}`}
                  />
                  {/* Capa 2 - Verde medio (Contratos) */}
                  <div 
                    className="h-full bg-green-400 transition-all duration-500"
                    style={{ width: `${Math.min(layer2Progress, 100 - layer1Progress)}%` }}
                    title={`Capa 2 (Contratos): ${formatCurrency(layer2Total)}`}
                  />
                  {/* Capa 3 - Gris (Por cerrar) */}
                  <div 
                    className="h-full bg-gray-400 transition-all duration-500"
                    style={{ width: `${Math.min(layer3Progress, 100 - layer1Progress - layer2Progress)}%` }}
                    title={`Capa 3 (Por cerrar): ${formatCurrency(layer3Total)}`}
                  />
                </div>
                {!hasRealIncomes && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center">
                    <AlertTriangle size={12} className="mr-1" />
                    Añade transacciones de ingreso para ver el progreso real
                  </p>
                )}
                {hasRealIncomes && goalProgress < 100 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Faltan {formatCurrency(monthlyIncomeGoal - totalIncomes)} para alcanzar el estimado
                  </p>
                )}
                {hasRealIncomes && goalProgress >= 100 && (
                  <p className="text-xs text-emerald-600 mt-1 flex items-center">
                    <Check size={14} className="mr-1" />
                    ¡Estimado superado en {formatCurrency(totalIncomes - monthlyIncomeGoal)}!
                  </p>
                )}
              </div>
            )}

            {/* Cards de cada capa */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Capa 1: Facturado */}
              <div className="bg-white rounded-lg p-4 border-l-4 border-l-emerald-600 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center">
                    <FileText size={18} className="text-emerald-600 mr-2" />
                    <span className="font-medium text-gray-900">Capa 1: Facturado</span>
                  </div>
                  <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full">
                    {layer1.length} ingresos
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(layer1Total)}</p>
                <p className="text-xs text-gray-500 mt-1">Ingresos con factura emitida</p>
                {monthlyIncomeGoal > 0 && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-600 transition-all duration-500"
                        style={{ width: `${Math.min((layer1Total / monthlyIncomeGoal) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-emerald-600 mt-1">{((layer1Total / monthlyIncomeGoal) * 100).toFixed(0)}% del objetivo</p>
                  </div>
                )}
              </div>

              {/* Capa 2: Contratos */}
              <div className="bg-white rounded-lg p-4 border-l-4 border-l-green-400 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center">
                    <RefreshCw size={18} className="text-green-500 mr-2" />
                    <span className="font-medium text-gray-900">Capa 2: Contratos</span>
                  </div>
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                    {layer2.length} ingresos
                  </span>
                </div>
                <p className="text-2xl font-bold text-green-500">{formatCurrency(layer2Total)}</p>
                <p className="text-xs text-gray-500 mt-1">Recurrentes de alta certeza</p>
                {monthlyIncomeGoal > 0 && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-green-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-400 transition-all duration-500"
                        style={{ width: `${Math.min((layer2Total / monthlyIncomeGoal) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-green-600 mt-1">{((layer2Total / monthlyIncomeGoal) * 100).toFixed(0)}% del objetivo</p>
                  </div>
                )}
              </div>

              {/* Capa 3: Por cerrar */}
              <div className="bg-white rounded-lg p-4 border-l-4 border-l-gray-400 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center">
                    <Target size={18} className="text-gray-500 mr-2" />
                    <span className="font-medium text-gray-900">Capa 3: Por cerrar</span>
                  </div>
                  <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full">
                    {layer3.length} ingresos
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-500">{formatCurrency(layer3Total)}</p>
                <p className="text-xs text-gray-500 mt-1">Estimados por confirmar</p>
                {monthlyIncomeGoal > 0 && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gray-400 transition-all duration-500"
                        style={{ width: `${Math.min((layer3Total / monthlyIncomeGoal) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{((layer3Total / monthlyIncomeGoal) * 100).toFixed(0)}% del objetivo</p>
                  </div>
                )}
              </div>
            </div>

            {/* Leyenda */}
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-emerald-600"></span>
                <span>Facturado (nº factura)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-green-400"></span>
                <span>Contratos (recurrente + alta certeza)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-gray-400"></span>
                <span>Por cerrar (resto)</span>
              </div>
              <Link href="/budget" className="ml-auto text-primary-600 hover:text-primary-700 font-medium">
                Gestionar presupuesto →
              </Link>
            </div>
          </div>
        );
      })()}

      {/* Próximos vencimientos */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              {([7, 15, 21, 30] as const).map((days) => (
                <button
                  key={days}
                  onClick={() => setUpcomingDaysFilter(days)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    upcomingDaysFilter === days
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {days}d ({upcomingStats[days].count})
                </button>
              ))}
            </div>
            <Link href="/transactions" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              Ver todos →
            </Link>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-green-600 font-medium">
              Cobros: +{formatCurrency(upcomingStats[upcomingDaysFilter].incomes)}
            </span>
            <span className="text-red-600 font-medium">
              Pagos: -{formatCurrency(upcomingStats[upcomingDaysFilter].expenses)}
            </span>
            <span className={`font-semibold ${upcomingStats[upcomingDaysFilter].total >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              Neto: {formatCurrency(upcomingStats[upcomingDaysFilter].total)}
            </span>
          </div>
        </div>
        <div className="p-6">
        {/* Barra de acciones cuando hay selecciones */}
        {selectedPaymentIds.size > 0 && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-blue-700 font-medium">
                {selectedPaymentIds.size} pago{selectedPaymentIds.size > 1 ? 's' : ''} seleccionado{selectedPaymentIds.size > 1 ? 's' : ''}
              </span>
              <span className="text-blue-600 font-semibold">
                Total: {formatCurrency(selectedPaymentsTotal)}
              </span>
              <button
                onClick={() => setSelectedPaymentIds(new Set())}
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Deseleccionar todo
              </button>
            </div>
            <button
              onClick={() => setShowPaymentOrderModal(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <ClipboardList size={16} />
              Generar Orden de Pago
            </button>
          </div>
        )}

        {upcomingTransactions.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No hay vencimientos en los próximos {upcomingDaysFilter} días</p>
        ) : (
          <div className="overflow-x-auto">
            {/* Info de pagos elegibles */}
            {eligiblePayments.length > 0 && selectedPaymentIds.size === 0 && (
              <div className="mb-3 text-sm text-gray-500 flex items-center gap-2">
                <Send size={14} className="text-blue-500" />
                <span>{eligiblePayments.length} pago{eligiblePayments.length > 1 ? 's' : ''} por transferencia disponible{eligiblePayments.length > 1 ? 's' : ''} para orden de pago</span>
              </div>
            )}
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  {eligiblePayments.length > 0 && (
                    <th className="pb-3 pr-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedPaymentIds.size === eligiblePayments.length && eligiblePayments.length > 0}
                        onChange={toggleAllPayments}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        title="Seleccionar todos los pagos por transferencia"
                      />
                    </th>
                  )}
                  <th className="pb-3 font-medium">Concepto</th>
                  <th className="pb-3 font-medium">Tipo</th>
                  <th className="pb-3 font-medium">Certeza</th>
                  <th className="pb-3 font-medium">Vencimiento</th>
                  <th className="pb-3 font-medium text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {upcomingTransactions.map((tx) => {
                  const isEligible = isEligibleForPaymentOrder(tx);
                  const isSelected = selectedPaymentIds.has(tx.id);
                  
                  return (
                    <tr 
                      key={tx.id} 
                      className={`border-b last:border-0 ${isSelected ? 'bg-blue-50' : ''} ${isEligible ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
                      onClick={isEligible ? () => togglePaymentSelection(tx.id) : undefined}
                    >
                      {eligiblePayments.length > 0 && (
                        <td className="py-4 pr-3" onClick={(e) => e.stopPropagation()}>
                          {isEligible ? (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => togglePaymentSelection(tx.id)}
                              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                          ) : (
                            <span className="w-4 h-4 inline-block" title={
                              tx.type === 'INCOME' ? 'Los cobros no requieren orden de pago' :
                              tx.paymentMethod === 'DIRECT_DEBIT' ? 'Pago domiciliado (automático)' :
                              'No elegible para orden de pago'
                            }></span>
                          )}
                        </td>
                      )}
                      <td className="py-4">
                        <p className="font-medium text-gray-900">{tx.description || tx.category}</p>
                        {tx.thirdPartyName && (
                          <p className="text-sm text-gray-500">{tx.thirdPartyName}</p>
                        )}
                      </td>
                      <td className="py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          tx.type === 'INCOME' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {tx.type === 'INCOME' ? (
                            <>
                              <TrendingUp size={12} className="mr-1" />
                              Cobro
                            </>
                          ) : (
                            <>
                              <TrendingDown size={12} className="mr-1" />
                              Pago
                            </>
                          )}
                        </span>
                        {tx.type === 'EXPENSE' && tx.paymentMethod && (
                          <span className={`ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs ${
                            tx.paymentMethod === 'TRANSFER' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {tx.paymentMethod === 'TRANSFER' ? (
                              <><Send size={10} className="mr-0.5" /> Transf.</>
                            ) : (
                              '🔄 Dom.'
                            )}
                          </span>
                        )}
                      </td>
                      <td className="py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          (tx.certainty === 'HIGH' || !tx.certainty) ? 'bg-green-100 text-green-800' :
                          tx.certainty === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {(tx.certainty === 'HIGH' || !tx.certainty) ? '🟢 Alta' :
                           tx.certainty === 'MEDIUM' ? '🟡 Media' : '🔴 Baja'}
                        </span>
                      </td>
                      <td className="py-4 text-gray-500">
                        {formatDate(tx.dueDate)}
                      </td>
                      <td className={`py-4 text-right font-semibold ${
                        tx.type === 'INCOME' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>

      {/* Resumen por tipo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Gastos pendientes por categoría">
          {(() => {
            const expensesByCategory = pendingTransactions
              .filter(tx => tx.type === 'EXPENSE')
              .reduce((acc, tx) => {
                acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
                return acc;
              }, {} as Record<string, number>);
            
            const sorted = Object.entries(expensesByCategory)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 5);

            if (sorted.length === 0) {
              return <p className="text-gray-500 text-center py-4">No hay gastos pendientes</p>;
            }

            return (
              <div className="space-y-3">
                {sorted.map(([category, amount]) => (
                  <div key={category} className="flex justify-between items-center">
                    <span className="text-gray-700">{category}</span>
                    <span className="font-semibold text-red-600">-{formatCurrency(amount)}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </Card>

        <Card title="Ingresos pendientes por categoría">
          {(() => {
            const incomesByCategory = pendingTransactions
              .filter(tx => tx.type === 'INCOME')
              .reduce((acc, tx) => {
                acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
                return acc;
              }, {} as Record<string, number>);
            
            const sorted = Object.entries(incomesByCategory)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 5);

            if (sorted.length === 0) {
              return <p className="text-gray-500 text-center py-4">No hay ingresos pendientes</p>;
            }

            return (
              <div className="space-y-3">
                {sorted.map(([category, amount]) => (
                  <div key={category} className="flex justify-between items-center">
                    <span className="text-gray-700">{category}</span>
                    <span className="font-semibold text-green-600">+{formatCurrency(amount)}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </Card>
      </div>

      {/* Modal de detalle de transacciones */}
      {detailModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-4 py-8">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">
              {/* Header del modal */}
              <div className="flex items-center justify-between p-6 border-b">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    {detailModal.type === 'INCOME' ? (
                      <TrendingUp className="text-green-600" size={24} />
                    ) : (
                      <TrendingDown className="text-red-600" size={24} />
                    )}
                    {detailModal.title}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {detailModal.monthLabel} • {detailModal.transactions.length} movimiento{detailModal.transactions.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  onClick={() => setDetailModal({ ...detailModal, isOpen: false })}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Contenido del modal */}
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {detailModal.transactions.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No hay transacciones</p>
                ) : (
                  <div className="space-y-3">
                    {detailModal.transactions
                      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                      .map((tx) => (
                        <div 
                          key={tx.id} 
                          className={`flex items-center justify-between p-4 rounded-lg border ${
                            detailModal.type === 'INCOME' 
                              ? 'bg-green-50 border-green-200' 
                              : 'bg-red-50 border-red-200'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900 truncate">{tx.description}</p>
                              {tx.invoiceNumber && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                  <FileText size={10} className="mr-1" />
                                  {tx.invoiceNumber}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <Clock size={12} />
                                {formatDate(tx.dueDate)}
                              </span>
                              {tx.thirdPartyName && (
                                <span className="truncate">• {tx.thirdPartyName}</span>
                              )}
                              <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">
                                {tx.category}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4 flex-shrink-0">
                            <span className={`text-lg font-bold ${
                              detailModal.type === 'INCOME' ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {detailModal.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.amount)}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Footer del modal con total */}
              <div className="border-t p-6 bg-gray-50 rounded-b-xl">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">Total</span>
                  <span className={`text-2xl font-bold ${
                    detailModal.type === 'INCOME' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {detailModal.type === 'INCOME' ? '+' : '-'}{formatCurrency(detailModal.total)}
                  </span>
                </div>
                <div className="mt-4 flex justify-end">
                  <Link
                    href={`/transactions?type=${detailModal.type}`}
                    className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                  >
                    Ver todas las transacciones
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Orden de Pago */}
      <PaymentOrderModal
        isOpen={showPaymentOrderModal}
        onClose={() => setShowPaymentOrderModal(false)}
        transactions={transactions}
        accounts={accounts}
        companies={companies}
        onOrderCreated={(order) => {
          toast.success(`Orden ${order.orderNumber} generada correctamente`);
          setSelectedPaymentIds(new Set());
        }}
      />

      <Toaster position="top-right" />
    </div>
  );
}
