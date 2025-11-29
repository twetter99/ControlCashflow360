'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui';
import { useCompanyFilter } from '@/contexts/CompanyFilterContext';
import { useAuth } from '@/contexts/AuthContext';
import { accountsApi, creditLinesApi, transactionsApi } from '@/lib/api-client';
import { Account, CreditLine, Transaction } from '@/types';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  Clock,
  ArrowRight,
  Building2,
  Target,
  BarChart3
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import Link from 'next/link';

type ScenarioType = 'CONSERVATIVE' | 'REALISTIC' | 'OPTIMISTIC';

interface ProjectionData {
  period: string;
  incomes: number;
  expenses: number;
  netFlow: number;
  balance: number;
}

export default function DashboardPage() {
  const { selectedCompanyId } = useCompanyFilter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [scenario, setScenario] = useState<ScenarioType>('REALISTIC');
  
  // Datos reales de Firebase
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditLines, setCreditLines] = useState<CreditLine[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Cargar datos via API
  useEffect(() => {
    if (!user) return;
    
    const loadData = async () => {
      try {
        setLoading(true);
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

  // Calcular proyecciones por periodo
  const calculateProjection = (daysAhead: number): ProjectionData => {
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + daysAhead);
    
    const txsInPeriod = getFilteredByScenario(pendingTransactions).filter(tx => {
      const dueDate = new Date(tx.dueDate);
      return dueDate >= today && dueDate <= endDate;
    });

    const incomes = txsInPeriod
      .filter(tx => tx.type === 'INCOME')
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const expenses = txsInPeriod
      .filter(tx => tx.type === 'EXPENSE')
      .reduce((sum, tx) => sum + tx.amount, 0);

    return {
      period: `${daysAhead} días`,
      incomes,
      expenses,
      netFlow: incomes - expenses,
      balance: totalBankBalance + incomes - expenses,
    };
  };

  const projection30d = calculateProjection(30);
  const projection60d = calculateProjection(60);
  const projection90d = calculateProjection(90);

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
  
  if (projection30d.balance < 0) {
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

  const getRiskLevel = (projection: ProjectionData) => {
    if (projection.balance < 0) return 'HIGH';
    if (projection.balance < totalBankBalance * 0.3) return 'MEDIUM';
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
                <h3 className="font-semibold text-gray-900">Próximos 30 días</h3>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  getRiskLevel(projection30d) === 'LOW' ? 'bg-green-100 text-green-800' :
                  getRiskLevel(projection30d) === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  Riesgo {getRiskLevel(projection30d) === 'LOW' ? 'Bajo' : 
                          getRiskLevel(projection30d) === 'MEDIUM' ? 'Medio' : 'Alto'}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Cobros previstos</span>
                  <span className="font-semibold text-green-600">+{formatCurrency(projection30d.incomes)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Pagos previstos</span>
                  <span className="font-semibold text-red-600">-{formatCurrency(projection30d.expenses)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Flujo neto</span>
                  <span className={`font-medium ${projection30d.netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {projection30d.netFlow >= 0 ? '+' : ''}{formatCurrency(projection30d.netFlow)}
                  </span>
                </div>
              </div>
              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700">Saldo estimado</span>
                  <span className={`text-xl font-bold ${projection30d.balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                    {formatCurrency(projection30d.balance)}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Proyección 60 días */}
          <Card className="border-l-4 border-l-purple-500">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Próximos 60 días</h3>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  getRiskLevel(projection60d) === 'LOW' ? 'bg-green-100 text-green-800' :
                  getRiskLevel(projection60d) === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  Riesgo {getRiskLevel(projection60d) === 'LOW' ? 'Bajo' : 
                          getRiskLevel(projection60d) === 'MEDIUM' ? 'Medio' : 'Alto'}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Cobros previstos</span>
                  <span className="font-semibold text-green-600">+{formatCurrency(projection60d.incomes)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Pagos previstos</span>
                  <span className="font-semibold text-red-600">-{formatCurrency(projection60d.expenses)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Flujo neto</span>
                  <span className={`font-medium ${projection60d.netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {projection60d.netFlow >= 0 ? '+' : ''}{formatCurrency(projection60d.netFlow)}
                  </span>
                </div>
              </div>
              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700">Saldo estimado</span>
                  <span className={`text-xl font-bold ${projection60d.balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                    {formatCurrency(projection60d.balance)}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Proyección 90 días */}
          <Card className="border-l-4 border-l-orange-500">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Próximos 90 días</h3>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  getRiskLevel(projection90d) === 'LOW' ? 'bg-green-100 text-green-800' :
                  getRiskLevel(projection90d) === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  Riesgo {getRiskLevel(projection90d) === 'LOW' ? 'Bajo' : 
                          getRiskLevel(projection90d) === 'MEDIUM' ? 'Medio' : 'Alto'}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Cobros previstos</span>
                  <span className="font-semibold text-green-600">+{formatCurrency(projection90d.incomes)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Pagos previstos</span>
                  <span className="font-semibold text-red-600">-{formatCurrency(projection90d.expenses)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Flujo neto</span>
                  <span className={`font-medium ${projection90d.netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {projection90d.netFlow >= 0 ? '+' : ''}{formatCurrency(projection90d.netFlow)}
                  </span>
                </div>
              </div>
              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700">Saldo estimado</span>
                  <span className={`text-xl font-bold ${projection90d.balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                    {formatCurrency(projection90d.balance)}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

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
