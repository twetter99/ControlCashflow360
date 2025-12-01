'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui';
import { useCompanyFilter } from '@/contexts/CompanyFilterContext';
import { useAuth } from '@/contexts/AuthContext';
import { accountsApi, creditLinesApi, transactionsApi, recurrencesApi } from '@/lib/api-client';
import { Account, CreditLine, Transaction, IncomeLayer } from '@/types';
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
  Check
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
  incomes: number;         // Cobros SOLO de este período
  expenses: number;        // Pagos SOLO de este período
  netFlow: number;         // Flujo neto de este período (incomes - expenses)
  cumulativeBalance: number; // Saldo acumulado (saldo inicial + todos los flujos hasta este bucket)
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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  // Objetivo mensual de ingresos (Sistema 3 Capas)
  const [monthlyIncomeGoal, setMonthlyIncomeGoal] = useState<number>(0);

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
        // Solo regenerar si han pasado más de 6 horas desde la última vez
        // (la Cloud Function corre diariamente, esto es un respaldo)
        try {
          const lastRegenKey = 'winfin_last_recurrence_regen';
          const lastRegen = localStorage.getItem(lastRegenKey);
          const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
          
          if (!lastRegen || parseInt(lastRegen) < sixHoursAgo) {
            await recurrencesApi.regenerate();
            localStorage.setItem(lastRegenKey, String(Date.now()));
            console.log('[Dashboard] Recurrencias regeneradas correctamente');
          }
        } catch (regenError) {
          // No bloquear si falla la regeneración, solo log
          console.warn('Regeneración de recurrencias falló (puede ser primera carga):', regenError);
        }
        
        // Luego cargar todos los datos
        const [accountsData, creditLinesData, transactionsData] = await Promise.all([
          accountsApi.getAll(),
          creditLinesApi.getAll(),
          transactionsApi.getAll()
        ]);
        setAccounts(accountsData);
        setCreditLines(creditLinesData);
        setTransactions(transactionsData);
      } catch (error) {
        console.error('Error cargando datos del dashboard:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [user]);

  // Cargar objetivo mensual de ingresos
  useEffect(() => {
    const loadGoal = async () => {
      try {
        if (!auth?.currentUser) return;
        const token = await auth.currentUser.getIdToken();
        const response = await fetch('/api/user-settings', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data?.monthlyIncomeGoal) {
            setMonthlyIncomeGoal(result.data.monthlyIncomeGoal);
          }
        }
      } catch (error) {
        console.error('Error cargando objetivo mensual:', error);
      }
    };
    loadGoal();
  }, [user]);

  // Filtrar por empresa si está seleccionada
  const filteredAccounts = selectedCompanyId 
    ? accounts.filter(a => a.companyId === selectedCompanyId)
    : accounts;
  
  const filteredCreditLines = selectedCompanyId
    ? creditLines.filter(cl => cl.companyId === selectedCompanyId)
    : creditLines;
  
  const filteredTransactions = selectedCompanyId
    ? transactions.filter(tx => tx.companyId === selectedCompanyId)
    : transactions;

  // ==========================================
  // CAPA 1: SITUACIÓN REAL (BANCOS)
  // ==========================================
  const totalBankBalance = filteredAccounts.reduce((sum, acc) => sum + acc.currentBalance, 0);
  const totalCreditAvailable = filteredCreditLines.reduce((sum, cl) => sum + cl.available, 0);
  const totalLiquidity = totalBankBalance + totalCreditAvailable;

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
   * Calcula los buckets de previsión con saldo acumulativo
   * El saldo de cada período arrastra el resultado del período anterior
   */
  const calculateForecastBuckets = (): ForecastBucket[] => {
    const filteredTxs = getFilteredByScenario(pendingTransactions);
    
    // Definición de los períodos (en días desde hoy)
    const periodDefinitions = [
      { label: 'Próximos 30 días', startDay: 0, endDay: 30 },
      { label: 'Días 31-60', startDay: 31, endDay: 60 },
      { label: 'Días 61-90', startDay: 61, endDay: 90 },
    ];
    
    let runningBalance = totalBankBalance; // Empezamos con el saldo actual en bancos
    
    return periodDefinitions.map(period => {
      // Calcular fechas del período
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() + period.startDay);
      
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + period.endDay);
      endDate.setHours(23, 59, 59, 999); // Fin del día
      
      // Generar rango de fechas legible (ej: "1 Dic - 31 Dic 2025")
      const dateRange = `${formatShortDate(startDate)} - ${formatShortDate(endDate)} ${endDate.getFullYear()}`;
      
      // Generar nombres de meses (ej: "Diciembre" o "Diciembre-Enero")
      const startMonth = getMonthName(startDate);
      const endMonth = getMonthName(endDate);
      const monthNames = startMonth === endMonth 
        ? startMonth 
        : `${startMonth}-${endMonth}`;
      
      // Filtrar transacciones SOLO de este período específico
      const txsInPeriod = filteredTxs.filter(tx => {
        const dueDate = new Date(tx.dueDate);
        return dueDate >= startDate && dueDate <= endDate;
      });
      
      // Calcular cobros y pagos del período
      const incomes = txsInPeriod
        .filter(tx => tx.type === 'INCOME')
        .reduce((sum, tx) => sum + tx.amount, 0);
      
      const expenses = txsInPeriod
        .filter(tx => tx.type === 'EXPENSE')
        .reduce((sum, tx) => sum + tx.amount, 0);
      
      const netFlow = incomes - expenses;
      
      // Acumular al saldo corriente (ARRASTRA del período anterior)
      runningBalance = runningBalance + netFlow;
      
      return {
        label: period.label,
        dateRange,
        monthNames,
        startDay: period.startDay,
        endDay: period.endDay,
        incomes,
        expenses,
        netFlow,
        cumulativeBalance: runningBalance,
      };
    });
  };

  // Calcular los 3 buckets de previsión
  const forecastBuckets = calculateForecastBuckets();
  const [bucket30d, bucket60d, bucket90d] = forecastBuckets;

  // Calcular runway (días que puedo sobrevivir con el saldo actual)
  const monthlyExpenses = pendingTransactions
    .filter(tx => tx.type === 'EXPENSE')
    .reduce((sum, tx) => sum + tx.amount, 0) / 3; // Promedio mensual
  
  const dailyBurn = monthlyExpenses / 30;
  const runway = dailyBurn > 0 ? Math.round(totalBankBalance / dailyBurn) : 999;

  // Próximos vencimientos (7 días)
  const upcomingTransactions = pendingTransactions
    .filter(tx => {
      const daysUntil = Math.ceil((new Date(tx.dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntil >= 0 && daysUntil <= 7;
    })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5);

  // Alertas
  const alerts: { id: string; type: string; message: string; severity: string }[] = [];
  
  if (bucket30d && bucket30d.cumulativeBalance < 0) {
    alerts.push({ id: '1', type: 'CRITICAL', message: 'Saldo proyectado negativo en 30 días', severity: 'HIGH' });
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <p className="text-blue-200 text-sm">Saldo en Bancos</p>
            <p className="text-3xl font-bold">{formatCurrency(totalBankBalance)}</p>
            <p className="text-blue-200 text-xs mt-1">{filteredAccounts.length} cuentas activas</p>
          </div>
          <div>
            <p className="text-blue-200 text-sm">Pólizas Disponibles</p>
            <p className="text-3xl font-bold">{formatCurrency(totalCreditAvailable)}</p>
            <p className="text-blue-200 text-xs mt-1">{filteredCreditLines.length} líneas de crédito</p>
          </div>
          <div>
            <p className="text-blue-200 text-sm">Liquidez Total</p>
            <p className="text-3xl font-bold">{formatCurrency(totalLiquidity)}</p>
            <p className="text-blue-200 text-xs mt-1">Bancos + Crédito disponible</p>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Proyección 30 días */}
          <Card className="border-l-4 border-l-blue-500">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{bucket30d?.monthNames || 'Próximos 30 días'}</h3>
                  <p className="text-xs text-gray-500">{bucket30d?.dateRange}</p>
                </div>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  bucket30d && getRiskLevel(bucket30d) === 'LOW' ? 'bg-green-100 text-green-800' :
                  bucket30d && getRiskLevel(bucket30d) === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  Riesgo {bucket30d && getRiskLevel(bucket30d) === 'LOW' ? 'Bajo' : 
                          bucket30d && getRiskLevel(bucket30d) === 'MEDIUM' ? 'Medio' : 'Alto'}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Cobros previstos</span>
                  <span className="font-semibold text-green-600">+{formatCurrency(bucket30d?.incomes || 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Pagos previstos</span>
                  <span className="font-semibold text-red-600">-{formatCurrency(bucket30d?.expenses || 0)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Flujo neto período</span>
                  <span className={`font-medium ${(bucket30d?.netFlow || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(bucket30d?.netFlow || 0) >= 0 ? '+' : ''}{formatCurrency(bucket30d?.netFlow || 0)}
                  </span>
                </div>
              </div>
              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700">Saldo acumulado</span>
                  <span className={`text-xl font-bold ${(bucket30d?.cumulativeBalance || 0) >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                    {formatCurrency(bucket30d?.cumulativeBalance || 0)}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Proyección 60 días (días 31-60) */}
          <Card className="border-l-4 border-l-purple-500">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{bucket60d?.monthNames || 'Días 31-60'}</h3>
                  <p className="text-xs text-gray-500">{bucket60d?.dateRange}</p>
                </div>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  bucket60d && getRiskLevel(bucket60d) === 'LOW' ? 'bg-green-100 text-green-800' :
                  bucket60d && getRiskLevel(bucket60d) === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  Riesgo {bucket60d && getRiskLevel(bucket60d) === 'LOW' ? 'Bajo' : 
                          bucket60d && getRiskLevel(bucket60d) === 'MEDIUM' ? 'Medio' : 'Alto'}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Cobros previstos</span>
                  <span className="font-semibold text-green-600">+{formatCurrency(bucket60d?.incomes || 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Pagos previstos</span>
                  <span className="font-semibold text-red-600">-{formatCurrency(bucket60d?.expenses || 0)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Flujo neto período</span>
                  <span className={`font-medium ${(bucket60d?.netFlow || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(bucket60d?.netFlow || 0) >= 0 ? '+' : ''}{formatCurrency(bucket60d?.netFlow || 0)}
                  </span>
                </div>
              </div>
              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700">Saldo acumulado</span>
                  <span className={`text-xl font-bold ${(bucket60d?.cumulativeBalance || 0) >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                    {formatCurrency(bucket60d?.cumulativeBalance || 0)}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Arrastra saldo de período anterior</p>
              </div>
            </div>
          </Card>

          {/* Proyección 90 días (días 61-90) */}
          <Card className="border-l-4 border-l-orange-500">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{bucket90d?.monthNames || 'Días 61-90'}</h3>
                  <p className="text-xs text-gray-500">{bucket90d?.dateRange}</p>
                </div>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  bucket90d && getRiskLevel(bucket90d) === 'LOW' ? 'bg-green-100 text-green-800' :
                  bucket90d && getRiskLevel(bucket90d) === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  Riesgo {bucket90d && getRiskLevel(bucket90d) === 'LOW' ? 'Bajo' : 
                          bucket90d && getRiskLevel(bucket90d) === 'MEDIUM' ? 'Medio' : 'Alto'}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Cobros previstos</span>
                  <span className="font-semibold text-green-600">+{formatCurrency(bucket90d?.incomes || 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Pagos previstos</span>
                  <span className="font-semibold text-red-600">-{formatCurrency(bucket90d?.expenses || 0)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Flujo neto período</span>
                  <span className={`font-medium ${(bucket90d?.netFlow || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(bucket90d?.netFlow || 0) >= 0 ? '+' : ''}{formatCurrency(bucket90d?.netFlow || 0)}
                  </span>
                </div>
              </div>
              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700">Saldo acumulado</span>
                  <span className={`text-xl font-bold ${(bucket90d?.cumulativeBalance || 0) >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                    {formatCurrency(bucket90d?.cumulativeBalance || 0)}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Arrastra saldo de período anterior</p>
              </div>
            </div>
          </Card>
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
              {monthlyIncomeGoal > 0 && (
                <div className="text-right">
                  <p className="text-sm text-gray-500">Objetivo mensual</p>
                  <p className="text-xl font-bold text-emerald-700">{formatCurrency(monthlyIncomeGoal)}</p>
                </div>
              )}
            </div>

            {/* Barra de progreso por capas */}
            {monthlyIncomeGoal > 0 && (
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Progreso: {formatCurrency(totalIncomes)} / {formatCurrency(monthlyIncomeGoal)}
                  </span>
                  <span className={`text-sm font-bold ${goalProgress >= 100 ? 'text-emerald-600' : goalProgress >= 75 ? 'text-green-600' : 'text-gray-600'}`}>
                    {Math.min(goalProgress, 100).toFixed(0)}%
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
                {goalProgress < 100 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Faltan {formatCurrency(monthlyIncomeGoal - totalIncomes)} para alcanzar el objetivo
                  </p>
                )}
                {goalProgress >= 100 && (
                  <p className="text-xs text-emerald-600 mt-1 flex items-center">
                    <Check size={14} className="mr-1" />
                    ¡Objetivo alcanzado! Superado en {formatCurrency(totalIncomes - monthlyIncomeGoal)}
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
              <Link href="/settings" className="ml-auto text-primary-600 hover:text-primary-700 font-medium">
                Configurar objetivo →
              </Link>
            </div>
          </div>
        );
      })()}

      {/* Próximos vencimientos */}
      <Card 
        title="Próximos vencimientos (7 días)" 
        subtitle="Movimientos pendientes de pago/cobro"
        action={
          <Link href="/transactions" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            Ver todos →
          </Link>
        }
      >
        {upcomingTransactions.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No hay vencimientos en los próximos 7 días</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">Concepto</th>
                  <th className="pb-3 font-medium">Tipo</th>
                  <th className="pb-3 font-medium">Certeza</th>
                  <th className="pb-3 font-medium">Vencimiento</th>
                  <th className="pb-3 font-medium text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {upcomingTransactions.map((tx) => (
                  <tr key={tx.id} className="border-b last:border-0">
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
    </div>
  );
}
