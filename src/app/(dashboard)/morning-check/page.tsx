'use client';

import React, { useState, useEffect } from 'react';
import { Button, Card } from '@/components/ui';
import { useCompanyFilter } from '@/contexts/CompanyFilterContext';
import { useAuth } from '@/contexts/AuthContext';
import { accountsApi, creditLinesApi, creditCardsApi, companiesApi } from '@/lib/api-client';
import { Account, CreditLine, CreditCard, Company } from '@/types';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Save, 
  RefreshCw, 
  Check,
  AlertCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  CreditCard as CreditCardIcon
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';

interface BalanceUpdate {
  id: string;
  newBalance: string;
  previousBalance: number;
  difference: number;
  type: 'account' | 'creditLine' | 'creditCard';
}

export default function MorningCheckPage() {
  const { selectedCompanyId } = useCompanyFilter();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditLines, setCreditLines] = useState<CreditLine[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [balanceUpdates, setBalanceUpdates] = useState<Record<string, BalanceUpdate>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savedItems, setSavedItems] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'accounts' | 'creditLines' | 'creditCards'>('accounts');

  // Cargar datos via API
  useEffect(() => {
    if (!user) return;
    
    const loadData = async () => {
      try {
        setLoading(true);
        const [accountsData, creditLinesData, creditCardsData, companiesData] = await Promise.all([
          accountsApi.getAll(),
          creditLinesApi.getAll(),
          creditCardsApi.getAll(),
          companiesApi.getAll()
        ]);
        
        setAccounts(accountsData);
        setCreditLines(creditLinesData);
        setCreditCards(creditCardsData);
        setCompanies(companiesData);
      } catch (error) {
        console.error('Error cargando datos:', error);
        toast.error('Error al cargar los datos');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [user]);

  // Filtrar por empresa seleccionada
  const filteredAccounts = !selectedCompanyId
    ? accounts
    : accounts.filter(acc => acc.companyId === selectedCompanyId);
  
  const filteredCreditLines = !selectedCompanyId
    ? creditLines
    : creditLines.filter(cl => cl.companyId === selectedCompanyId);
  
  const filteredCreditCards = !selectedCompanyId
    ? creditCards
    : creditCards.filter(cc => cc.companyId === selectedCompanyId);

  // Helper para obtener nombre de empresa
  const getCompanyName = (companyId: string) => {
    const company = companies.find(c => c.id === companyId);
    return company?.name || 'Sin asignar';
  };

  // Calcular totales para cuentas bancarias
  const totalPreviousAccountBalance = filteredAccounts.reduce((sum, acc) => sum + acc.currentBalance, 0);
  const totalNewAccountBalance = filteredAccounts.reduce((sum, acc) => {
    const update = balanceUpdates[`account_${acc.id}`];
    return sum + (update ? parseFloat(update.newBalance) || acc.currentBalance : acc.currentBalance);
  }, 0);
  const accountDifference = totalNewAccountBalance - totalPreviousAccountBalance;

  // Calcular totales para tarjetas de crédito (deuda)
  const totalCreditCardDebt = filteredCreditCards.reduce((sum, cc) => {
    const update = balanceUpdates[`creditCard_${cc.id}`];
    return sum + (update ? parseFloat(update.newBalance) || cc.currentBalance : cc.currentBalance);
  }, 0);

  const handleBalanceChange = (
    id: string, 
    value: string, 
    previousBalance: number, 
    type: 'account' | 'creditLine' | 'creditCard'
  ) => {
    const key = `${type}_${id}`;
    const newBalanceNum = parseFloat(value) || 0;
    const difference = newBalanceNum - previousBalance;
    
    setBalanceUpdates((prev) => ({
      ...prev,
      [key]: {
        id,
        newBalance: value,
        previousBalance,
        difference,
        type,
      },
    }));
  };

  const handleSaveAll = async () => {
    if (Object.keys(balanceUpdates).length === 0) {
      toast.error('No hay cambios para guardar');
      return;
    }

    setIsSaving(true);
    
    try {
      const savePromises: Promise<unknown>[] = [];
      
      for (const [key, update] of Object.entries(balanceUpdates)) {
        const newBalance = parseFloat(update.newBalance);
        if (isNaN(newBalance)) continue;

        if (update.type === 'account') {
          savePromises.push(
            accountsApi.updateBalance(update.id, { currentBalance: newBalance })
          );
        } else if (update.type === 'creditLine') {
          savePromises.push(
            creditLinesApi.updateBalance(update.id, { currentDrawn: newBalance })
          );
        } else if (update.type === 'creditCard') {
          savePromises.push(
            creditCardsApi.updateBalance(update.id, { currentBalance: newBalance })
          );
        }
      }

      await Promise.all(savePromises);
      
      // Marcar todas como guardadas
      setSavedItems(new Set(Object.keys(balanceUpdates)));
      toast.success(`${Object.keys(balanceUpdates).length} saldos actualizados correctamente`);

      // Recargar datos
      const [accountsData, creditLinesData, creditCardsData] = await Promise.all([
        accountsApi.getAll(),
        creditLinesApi.getAll(),
        creditCardsApi.getAll()
      ]);
      
      setAccounts(accountsData);
      setCreditLines(creditLinesData);
      setCreditCards(creditCardsData);
      setBalanceUpdates({});
      setSavedItems(new Set());
    } catch (error) {
      console.error('Error guardando saldos:', error);
      toast.error('Error al guardar los saldos');
    } finally {
      setIsSaving(false);
    }
  };

  const isStale = (date: Date | string | undefined) => {
    if (!date) return true;
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const hoursDiff = (new Date().getTime() - dateObj.getTime()) / (1000 * 60 * 60);
    return hoursDiff > 48;
  };

  const formatLastUpdate = (date: Date | string | undefined) => {
    if (!date) return 'Nunca';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('es-ES', { 
      day: '2-digit', 
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Contar pendientes por tipo
  const pendingAccounts = Object.values(balanceUpdates).filter(u => u.type === 'account').length;
  const pendingCreditLines = Object.values(balanceUpdates).filter(u => u.type === 'creditLine').length;
  const pendingCreditCards = Object.values(balanceUpdates).filter(u => u.type === 'creditCard').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rutina Diaria</h1>
          <p className="text-gray-500 mt-1">
            Actualiza los saldos bancarios y de tarjetas en menos de 3 minutos
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">
            <Clock size={14} className="inline mr-1" />
            {formatDateTime(new Date())}
          </p>
        </div>
      </div>

      {/* Resumen Global */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Saldo en Cuentas</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(totalNewAccountBalance)}
            </p>
            {accountDifference !== 0 && (
              <p className={`text-sm flex items-center justify-center mt-1 ${
                accountDifference >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {accountDifference >= 0 ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />}
                {accountDifference >= 0 ? '+' : ''}{formatCurrency(accountDifference)}
              </p>
            )}
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Deuda en Tarjetas</p>
            <p className="text-2xl font-bold text-red-600 mt-1">
              -{formatCurrency(totalCreditCardDebt)}
            </p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Posición Neta</p>
            <p className={`text-2xl font-bold mt-1 ${
              (totalNewAccountBalance - totalCreditCardDebt) >= 0 ? 'text-gray-900' : 'text-red-600'
            }`}>
              {formatCurrency(totalNewAccountBalance - totalCreditCardDebt)}
            </p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Cambios Pendientes</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              {Object.keys(balanceUpdates).length}
            </p>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('accounts')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center ${
            activeTab === 'accounts'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Wallet size={16} className="mr-2" />
          Cuentas Bancarias
          {pendingAccounts > 0 && (
            <span className="ml-2 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
              {pendingAccounts}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('creditLines')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center ${
            activeTab === 'creditLines'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Receipt size={16} className="mr-2" />
          Pólizas de Crédito
          {pendingCreditLines > 0 && (
            <span className="ml-2 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
              {pendingCreditLines}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('creditCards')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center ${
            activeTab === 'creditCards'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <CreditCardIcon size={16} className="mr-2" />
          Tarjetas de Crédito
          {pendingCreditCards > 0 && (
            <span className="ml-2 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
              {pendingCreditCards}
            </span>
          )}
        </button>
      </div>

      {/* Tabla de Cuentas Bancarias */}
      {activeTab === 'accounts' && (
        <Card title="Actualización de Saldos Bancarios" subtitle="Introduce el saldo actual de cada cuenta">
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
                {filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No hay cuentas bancarias activas
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map((account) => {
                    const key = `account_${account.id}`;
                    const update = balanceUpdates[key];
                    const difference = update?.difference || 0;
                    const isSaved = savedItems.has(key);
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
                          <span className="text-sm text-gray-600">{getCompanyName(account.companyId)}</span>
                        </td>
                        <td className="py-4 text-right">
                          <span className="text-gray-900 font-medium">
                            {formatCurrency(account.currentBalance)}
                          </span>
                          {stale && (
                            <div className="flex items-center justify-end mt-1 text-amber-600">
                              <AlertCircle size={12} className="mr-1" />
                              <span className="text-xs">{formatLastUpdate(account.lastUpdateDate)}</span>
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
                              onChange={(e) => handleBalanceChange(account.id, e.target.value, account.currentBalance, 'account')}
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
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tabla de Pólizas de Crédito */}
      {activeTab === 'creditLines' && (
        <Card title="Actualización de Pólizas de Crédito" subtitle="Introduce el saldo dispuesto de cada póliza">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">Banco / Póliza</th>
                  <th className="pb-3 font-medium">Empresa</th>
                  <th className="pb-3 font-medium text-right">Límite</th>
                  <th className="pb-3 font-medium text-right">Dispuesto Anterior</th>
                  <th className="pb-3 font-medium text-center">Dispuesto Actual</th>
                  <th className="pb-3 font-medium text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredCreditLines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No hay pólizas de crédito activas
                    </td>
                  </tr>
                ) : (
                  filteredCreditLines.map((creditLine) => {
                    const key = `creditLine_${creditLine.id}`;
                    const update = balanceUpdates[key];
                    const isSaved = savedItems.has(key);
                    const stale = isStale(creditLine.lastUpdateDate);
                    
                    return (
                      <tr key={creditLine.id} className="border-b last:border-0">
                        <td className="py-4">
                          <div className="flex items-center">
                            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                              <Receipt className="text-purple-600" size={18} />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{creditLine.bankName}</p>
                              <p className="text-sm text-gray-500">{creditLine.alias}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4">
                          <span className="text-sm text-gray-600">{getCompanyName(creditLine.companyId)}</span>
                        </td>
                        <td className="py-4 text-right">
                          <span className="text-gray-900">{formatCurrency(creditLine.creditLimit)}</span>
                        </td>
                        <td className="py-4 text-right">
                          <span className="text-red-600 font-medium">
                            {formatCurrency(creditLine.currentDrawn)}
                          </span>
                          {stale && (
                            <div className="flex items-center justify-end mt-1 text-amber-600">
                              <AlertCircle size={12} className="mr-1" />
                              <span className="text-xs">{formatLastUpdate(creditLine.lastUpdateDate)}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-4">
                          <div className="max-w-[180px] mx-auto">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={creditLine.creditLimit}
                              placeholder={formatCurrency(creditLine.currentDrawn)}
                              value={update?.newBalance || ''}
                              onChange={(e) => handleBalanceChange(creditLine.id, e.target.value, creditLine.currentDrawn, 'creditLine')}
                              className="w-full px-4 py-3 text-right text-lg font-medium border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                              disabled={isSaved}
                            />
                          </div>
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
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tabla de Tarjetas de Crédito */}
      {activeTab === 'creditCards' && (
        <Card title="Actualización de Tarjetas de Crédito" subtitle="Introduce el saldo dispuesto (deuda) de cada tarjeta">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">Tarjeta</th>
                  <th className="pb-3 font-medium">Empresa</th>
                  <th className="pb-3 font-medium text-right">Límite</th>
                  <th className="pb-3 font-medium text-right">Dispuesto Anterior</th>
                  <th className="pb-3 font-medium text-center">Dispuesto Actual</th>
                  <th className="pb-3 font-medium text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredCreditCards.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No hay tarjetas de crédito activas
                    </td>
                  </tr>
                ) : (
                  filteredCreditCards.map((card) => {
                    const key = `creditCard_${card.id}`;
                    const update = balanceUpdates[key];
                    const isSaved = savedItems.has(key);
                    const stale = isStale(card.lastUpdateDate);
                    
                    return (
                      <tr key={card.id} className="border-b last:border-0">
                        <td className="py-4">
                          <div className="flex items-center">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mr-3">
                              <CreditCardIcon className="text-white" size={18} />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{card.cardAlias}</p>
                              <p className="text-sm text-gray-500">{card.bankName} •••• {card.cardNumberLast4}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4">
                          <span className="text-sm text-gray-600">{getCompanyName(card.companyId)}</span>
                        </td>
                        <td className="py-4 text-right">
                          <span className="text-gray-900">{formatCurrency(card.creditLimit)}</span>
                        </td>
                        <td className="py-4 text-right">
                          <span className="text-red-600 font-medium">
                            {formatCurrency(card.currentBalance)}
                          </span>
                          {stale && (
                            <div className="flex items-center justify-end mt-1 text-amber-600">
                              <AlertCircle size={12} className="mr-1" />
                              <span className="text-xs">{formatLastUpdate(card.lastUpdateDate)}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-4">
                          <div className="max-w-[180px] mx-auto">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={card.creditLimit}
                              placeholder={formatCurrency(card.currentBalance)}
                              value={update?.newBalance || ''}
                              onChange={(e) => handleBalanceChange(card.id, e.target.value, card.currentBalance, 'creditCard')}
                              className="w-full px-4 py-3 text-right text-lg font-medium border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                              disabled={isSaved}
                            />
                          </div>
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
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Botón de guardar global */}
      <div className="flex justify-end sticky bottom-4">
        <Button
          onClick={handleSaveAll}
          isLoading={isSaving}
          disabled={Object.keys(balanceUpdates).length === 0}
          size="lg"
          className="shadow-lg"
        >
          <Save size={18} className="mr-2" />
          Guardar Todos los Cambios ({Object.keys(balanceUpdates).length})
        </Button>
      </div>
    </div>
  );
}
