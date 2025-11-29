'use client';

import React from 'react';
import { StatCard, Card } from '@/components/ui';
import { useCompanyFilter } from '@/contexts/CompanyFilterContext';
import { 
  Wallet, 
  CreditCard, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  Clock,
  ArrowRight
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

// Datos de ejemplo - en producción vendrían de Firestore
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

const mockData = {
  today: {
    totalLiquidity: 185000,
    totalCreditAvailable: 150000,
    netPosition: 135000,
  },
  projection30d: {
    expectedIncomes: 95000,
    expectedExpenses: 78000,
    projectedBalance: 202000,
    riskLevel: 'LOW' as RiskLevel,
  },
  projection60d: {
    expectedIncomes: 180000,
    expectedExpenses: 165000,
    projectedBalance: 200000,
    riskLevel: 'MEDIUM' as RiskLevel,
  },
  projection90d: {
    expectedIncomes: 270000,
    expectedExpenses: 255000,
    projectedBalance: 195000,
    riskLevel: 'MEDIUM' as RiskLevel,
  },
  runway: 67,
  alerts: [
    { id: '1', type: 'STALE_DATA', message: 'Cuenta BBK sin actualizar hace 2 días', severity: 'MEDIUM' },
    { id: '2', type: 'MIN_LIQUIDITY', message: 'Proyección bajo mínimo en 45 días', severity: 'HIGH' },
  ],
  recentTransactions: [
    { id: '1', type: 'EXPENSE', description: 'Nóminas Noviembre', amount: 45000, dueDate: '2024-11-28' },
    { id: '2', type: 'INCOME', description: 'Factura Cliente ABC', amount: 12500, dueDate: '2024-12-05' },
    { id: '3', type: 'EXPENSE', description: 'Seguros Sociales', amount: 15000, dueDate: '2024-12-02' },
  ],
};

export default function DashboardPage() {
  const { selectedCompanyId } = useCompanyFilter();

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'LOW': return 'success';
      case 'MEDIUM': return 'warning';
      case 'HIGH': return 'danger';
      default: return 'default';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard de Tesorería</h1>
          <p className="text-gray-500 mt-1">
            Vista consolidada del estado financiero
            {selectedCompanyId && ' • Filtrado por empresa'}
          </p>
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

      {/* Alertas activas */}
      {mockData.alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start">
            <AlertTriangle className="text-amber-500 mr-3 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800">Alertas activas ({mockData.alerts.length})</h3>
              <ul className="mt-2 space-y-1">
                {mockData.alerts.map((alert) => (
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

      {/* Métricas principales - Día 0 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Liquidez Total"
          value={formatCurrency(mockData.today.totalLiquidity)}
          subtitle="Saldo en cuentas bancarias"
          icon={<Wallet size={24} />}
          variant="default"
        />
        <StatCard
          title="Crédito Disponible"
          value={formatCurrency(mockData.today.totalCreditAvailable)}
          subtitle="Pólizas de crédito"
          icon={<CreditCard size={24} />}
          variant="default"
        />
        <StatCard
          title="Posición Neta"
          value={formatCurrency(mockData.today.netPosition)}
          subtitle="Liquidez - Compromisos"
          icon={<TrendingUp size={24} />}
          variant="success"
        />
        <StatCard
          title="Runway"
          value={`${mockData.runway} días`}
          subtitle="Cobertura con liquidez actual"
          icon={<Clock size={24} />}
          variant={mockData.runway > 60 ? 'success' : mockData.runway > 30 ? 'warning' : 'danger'}
        />
      </div>

      {/* Proyecciones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Proyección 30 días" subtitle="Próximo mes">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Ingresos esperados</span>
              <span className="font-semibold text-green-600">
                +{formatCurrency(mockData.projection30d.expectedIncomes)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Gastos previstos</span>
              <span className="font-semibold text-red-600">
                -{formatCurrency(mockData.projection30d.expectedExpenses)}
              </span>
            </div>
            <div className="border-t pt-4">
              <div className="flex justify-between items-center">
                <span className="font-medium">Saldo proyectado</span>
                <span className="text-xl font-bold">
                  {formatCurrency(mockData.projection30d.projectedBalance)}
                </span>
              </div>
            </div>
            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              mockData.projection30d.riskLevel === 'LOW' ? 'bg-green-100 text-green-800' :
              mockData.projection30d.riskLevel === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              Riesgo {mockData.projection30d.riskLevel === 'LOW' ? 'Bajo' : 
                      mockData.projection30d.riskLevel === 'MEDIUM' ? 'Medio' : 'Alto'}
            </div>
          </div>
        </Card>

        <Card title="Proyección 60 días" subtitle="Próximos 2 meses">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Ingresos esperados</span>
              <span className="font-semibold text-green-600">
                +{formatCurrency(mockData.projection60d.expectedIncomes)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Gastos previstos</span>
              <span className="font-semibold text-red-600">
                -{formatCurrency(mockData.projection60d.expectedExpenses)}
              </span>
            </div>
            <div className="border-t pt-4">
              <div className="flex justify-between items-center">
                <span className="font-medium">Saldo proyectado</span>
                <span className="text-xl font-bold">
                  {formatCurrency(mockData.projection60d.projectedBalance)}
                </span>
              </div>
            </div>
            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              mockData.projection60d.riskLevel === 'LOW' ? 'bg-green-100 text-green-800' :
              mockData.projection60d.riskLevel === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              Riesgo {mockData.projection60d.riskLevel === 'LOW' ? 'Bajo' : 
                      mockData.projection60d.riskLevel === 'MEDIUM' ? 'Medio' : 'Alto'}
            </div>
          </div>
        </Card>

        <Card title="Proyección 90-120 días" subtitle="Visión estratégica">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Ingresos esperados</span>
              <span className="font-semibold text-green-600">
                +{formatCurrency(mockData.projection90d.expectedIncomes)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Gastos previstos</span>
              <span className="font-semibold text-red-600">
                -{formatCurrency(mockData.projection90d.expectedExpenses)}
              </span>
            </div>
            <div className="border-t pt-4">
              <div className="flex justify-between items-center">
                <span className="font-medium">Saldo proyectado</span>
                <span className="text-xl font-bold">
                  {formatCurrency(mockData.projection90d.projectedBalance)}
                </span>
              </div>
            </div>
            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              mockData.projection90d.riskLevel === 'LOW' ? 'bg-green-100 text-green-800' :
              mockData.projection90d.riskLevel === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              Riesgo {mockData.projection90d.riskLevel === 'LOW' ? 'Bajo' : 
                      mockData.projection90d.riskLevel === 'MEDIUM' ? 'Medio' : 'Alto'}
            </div>
          </div>
        </Card>
      </div>

      {/* Próximos vencimientos */}
      <Card 
        title="Próximos vencimientos" 
        subtitle="Transacciones pendientes"
        action={
          <Link href="/transactions" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            Ver todas →
          </Link>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3 font-medium">Concepto</th>
                <th className="pb-3 font-medium">Tipo</th>
                <th className="pb-3 font-medium">Vencimiento</th>
                <th className="pb-3 font-medium text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {mockData.recentTransactions.map((tx) => (
                <tr key={tx.id} className="border-b last:border-0">
                  <td className="py-4 font-medium text-gray-900">{tx.description}</td>
                  <td className="py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      tx.type === 'INCOME' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {tx.type === 'INCOME' ? (
                        <>
                          <TrendingUp size={12} className="mr-1" />
                          Ingreso
                        </>
                      ) : (
                        <>
                          <TrendingDown size={12} className="mr-1" />
                          Gasto
                        </>
                      )}
                    </span>
                  </td>
                  <td className="py-4 text-gray-500">{tx.dueDate}</td>
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
      </Card>
    </div>
  );
}
