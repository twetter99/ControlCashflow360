'use client';

import React, { useState } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { useCompanyFilter } from '@/contexts/CompanyFilterContext';
import { 
  Save, 
  RefreshCw, 
  Check,
  AlertCircle,
  Clock,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';

// Datos de ejemplo - en producción vendrían de Firestore
const mockAccounts = [
  {
    id: 'acc_1',
    companyId: 'winfin_sistemas',
    companyName: 'WINFIN Sistemas',
    bankName: 'BBVA',
    alias: 'Cuenta Corriente Principal',
    currentBalance: 45000,
    lastUpdateDate: new Date('2024-11-28T08:30:00'),
    lastUpdatedBy: 'admin',
  },
  {
    id: 'acc_2',
    companyId: 'winfin_sistemas',
    companyName: 'WINFIN Sistemas',
    bankName: 'Santander',
    alias: 'Cuenta Operativa',
    currentBalance: 28500,
    lastUpdateDate: new Date('2024-11-28T08:30:00'),
    lastUpdatedBy: 'admin',
  },
  {
    id: 'acc_3',
    companyId: 'winfin_instalaciones',
    companyName: 'WINFIN Instalaciones',
    bankName: 'CaixaBank',
    alias: 'Cuenta Principal',
    currentBalance: 62000,
    lastUpdateDate: new Date('2024-11-27T09:15:00'),
    lastUpdatedBy: 'admin',
  },
  {
    id: 'acc_4',
    companyId: 'winfin_instalaciones',
    companyName: 'WINFIN Instalaciones',
    bankName: 'BBK',
    alias: 'Cuenta Secundaria',
    currentBalance: 15200,
    lastUpdateDate: new Date('2024-11-27T09:15:00'),
    lastUpdatedBy: 'admin',
  },
];

// Facturas pendientes para conciliación express
const mockPendingTransactions = [
  { id: 'tx_1', description: 'Vodafone - Factura Noviembre', amount: 189.50, type: 'EXPENSE' },
  { id: 'tx_2', description: 'Iberdrola - Suministro', amount: 345.20, type: 'EXPENSE' },
  { id: 'tx_3', description: 'Cliente ABC - Factura #1234', amount: 2500.00, type: 'INCOME' },
];

interface BalanceUpdate {
  accountId: string;
  newBalance: string;
  difference: number;
}

export default function MorningCheckPage() {
  const { selectedCompanyId } = useCompanyFilter();
  const [balanceUpdates, setBalanceUpdates] = useState<Record<string, BalanceUpdate>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<Set<string>>(new Set());
  const [showConciliation, setShowConciliation] = useState(false);
  const [selectedDifference, setSelectedDifference] = useState<{ accountId: string; difference: number } | null>(null);

  // Filtrar cuentas por empresa si hay filtro activo
  const filteredAccounts = selectedCompanyId
    ? mockAccounts.filter((acc) => acc.companyId === selectedCompanyId)
    : mockAccounts;

  // Calcular totales
  const totalPreviousBalance = filteredAccounts.reduce((sum, acc) => sum + acc.currentBalance, 0);
  const totalNewBalance = filteredAccounts.reduce((sum, acc) => {
    const update = balanceUpdates[acc.id];
    return sum + (update ? parseFloat(update.newBalance) || acc.currentBalance : acc.currentBalance);
  }, 0);
  const totalDifference = totalNewBalance - totalPreviousBalance;

  const handleBalanceChange = (accountId: string, value: string, previousBalance: number) => {
    const newBalanceNum = parseFloat(value) || 0;
    const difference = newBalanceNum - previousBalance;
    
    setBalanceUpdates((prev) => ({
      ...prev,
      [accountId]: {
        accountId,
        newBalance: value,
        difference,
      },
    }));
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    
    // Simular guardado
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    // Marcar todas como guardadas
    const savedIds = new Set(Object.keys(balanceUpdates));
    setSavedAccounts(savedIds);
    setIsSaving(false);
    
    // Mostrar conciliación si hay diferencias
    const hasDifferences = Object.values(balanceUpdates).some((u) => Math.abs(u.difference) > 0.01);
    if (hasDifferences) {
      setShowConciliation(true);
    }
  };

  const handleConciliationMatch = (transactionId: string) => {
    // Aquí se marcaría la transacción como pagada
    console.log('Conciliación:', transactionId);
    setShowConciliation(false);
    setSelectedDifference(null);
  };

  const isStale = (date: Date) => {
    const hoursDiff = (new Date().getTime() - date.getTime()) / (1000 * 60 * 60);
    return hoursDiff > 48;
  };

  const getMatchingTransactions = (difference: number) => {
    const tolerance = 0.01;
    return mockPendingTransactions.filter((tx) => {
      const txAmount = tx.type === 'EXPENSE' ? -tx.amount : tx.amount;
      return Math.abs(txAmount - difference) < tolerance;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rutina Diaria</h1>
          <p className="text-gray-500 mt-1">
            Actualiza los saldos bancarios en menos de 3 minutos
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">
            <Clock size={14} className="inline mr-1" />
            {formatDateTime(new Date())}
          </p>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Saldo Anterior</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(totalPreviousBalance)}
            </p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Saldo Actual</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(totalNewBalance)}
            </p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Variación</p>
            <p className={`text-2xl font-bold mt-1 flex items-center justify-center ${
              totalDifference >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {totalDifference >= 0 ? <TrendingUp size={24} className="mr-2" /> : <TrendingDown size={24} className="mr-2" />}
              {totalDifference >= 0 ? '+' : ''}{formatCurrency(totalDifference)}
            </p>
          </div>
        </Card>
      </div>

      {/* Grid de cuentas */}
      <Card title="Actualización de Saldos" subtitle="Introduce el saldo actual de cada cuenta">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3 font-medium">Banco / Cuenta</th>
                <th className="pb-3 font-medium">Empresa</th>
                <th className="pb-3 font-medium text-right">Saldo Anterior</th>
                <th className="pb-3 font-medium text-center">Saldo Actual</th>
                <th className="pb-3 font-medium text-right">Diferencia</th>
                <th className="pb-3 font-medium text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account) => {
                const update = balanceUpdates[account.id];
                const difference = update?.difference || 0;
                const isSaved = savedAccounts.has(account.id);
                const stale = isStale(account.lastUpdateDate);
                
                return (
                  <tr key={account.id} className="border-b last:border-0">
                    <td className="py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mr-3">
                          <span className="font-bold text-gray-500 text-sm">
                            {account.bankName.substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{account.bankName}</p>
                          <p className="text-sm text-gray-500">{account.alias}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <span className="text-sm text-gray-600">{account.companyName}</span>
                    </td>
                    <td className="py-4 text-right">
                      <span className="text-gray-900 font-medium">
                        {formatCurrency(account.currentBalance)}
                      </span>
                      {stale && (
                        <div className="flex items-center justify-end mt-1 text-amber-600">
                          <AlertCircle size={12} className="mr-1" />
                          <span className="text-xs">Dato antiguo</span>
                        </div>
                      )}
                    </td>
                    <td className="py-4">
                      <div className="max-w-[180px] mx-auto">
                        <input
                          type="number"
                          step="0.01"
                          placeholder={formatCurrency(account.currentBalance)}
                          value={update?.newBalance || ''}
                          onChange={(e) => handleBalanceChange(account.id, e.target.value, account.currentBalance)}
                          className="w-full px-4 py-3 text-right text-lg font-medium border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          disabled={isSaved}
                        />
                      </div>
                    </td>
                    <td className="py-4 text-right">
                      {update && (
                        <span className={`font-semibold ${
                          difference > 0 ? 'text-green-600' : difference < 0 ? 'text-red-600' : 'text-gray-400'
                        }`}>
                          {difference > 0 ? '+' : ''}{formatCurrency(difference)}
                        </span>
                      )}
                    </td>
                    <td className="py-4 text-center">
                      {isSaved ? (
                        <span className="inline-flex items-center text-green-600">
                          <Check size={16} className="mr-1" />
                          Guardado
                        </span>
                      ) : update ? (
                        <span className="inline-flex items-center text-amber-600">
                          <RefreshCw size={16} className="mr-1" />
                          Pendiente
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end">
          <Button
            onClick={handleSaveAll}
            isLoading={isSaving}
            disabled={Object.keys(balanceUpdates).length === 0}
            size="lg"
          >
            <Save size={18} className="mr-2" />
            Guardar y Calcular
          </Button>
        </div>
      </Card>

      {/* Conciliación Express */}
      {showConciliation && (
        <Card title="Conciliación Express" subtitle="¿Coinciden estas diferencias con pagos pendientes?">
          <div className="space-y-4">
            {Object.values(balanceUpdates)
              .filter((u) => Math.abs(u.difference) > 0.01)
              .map((update) => {
                const account = mockAccounts.find((a) => a.id === update.accountId);
                const matchingTxs = getMatchingTransactions(update.difference);
                
                return (
                  <div key={update.accountId} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-medium text-gray-900">{account?.bankName} - {account?.alias}</p>
                        <p className={`text-lg font-bold ${
                          update.difference >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          Diferencia: {update.difference >= 0 ? '+' : ''}{formatCurrency(update.difference)}
                        </p>
                      </div>
                    </div>
                    
                    {matchingTxs.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-sm text-gray-500">Posibles coincidencias:</p>
                        {matchingTxs.map((tx) => (
                          <div
                            key={tx.id}
                            className="flex items-center justify-between bg-gray-50 p-3 rounded-lg"
                          >
                            <div>
                              <p className="font-medium text-gray-900">{tx.description}</p>
                              <p className={`text-sm ${tx.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                                {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.amount)}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleConciliationMatch(tx.id)}
                            >
                              <Check size={14} className="mr-1" />
                              Sí, es este
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">
                        No se encontraron transacciones pendientes que coincidan con este importe.
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </Card>
      )}
    </div>
  );
}
