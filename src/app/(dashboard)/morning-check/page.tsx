'use client';

import React, { useState, useEffect } from 'react';
import { Button, Card, CurrencyInput } from '@/components/ui';
import { useCompanyFilter } from '@/contexts/CompanyFilterContext';
import { useAuth } from '@/contexts/AuthContext';
import { accountsApi, creditLinesApi, creditCardsApi, companiesApi, accountHoldsApi } from '@/lib/api-client';
import { Account, CreditLine, CreditCard, Company, AccountHold, AccountHoldType } from '@/types';
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
  CreditCard as CreditCardIcon,
  Lock,
  Plus,
  X,
  Calendar,
  Edit2,
  Filter,
  Building2
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';

// Formatea IBAN en bloques de 4 caracteres para mejor legibilidad
const formatIbanDisplay = (iban: string): string => {
  if (!iban) return '';
  // Eliminar espacios existentes y formatear en bloques de 4
  const clean = iban.replace(/\s/g, '');
  return clean.match(/.{1,4}/g)?.join(' ') || clean;
};

interface BalanceUpdate {
  id: string;
  newBalance: string;
  previousBalance: number;
  difference: number;
  type: 'account' | 'creditLine' | 'creditCard';
}

// Mapeo de tipos de retención a español
const holdTypeLabels: Record<AccountHoldType, string> = {
  JUDICIAL: 'Embargo judicial',
  TAX: 'Retención fiscal',
  BANK_GUARANTEE: 'Aval bancario',
  PARTIAL: 'Retención parcial',
  FRAUD_BLOCK: 'Bloqueo por fraude',
  OTHER: 'Otros',
};

export default function MorningCheckPage() {
  const { selectedCompanyId } = useCompanyFilter();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditLines, setCreditLines] = useState<CreditLine[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [accountHolds, setAccountHolds] = useState<AccountHold[]>([]);
  const [loading, setLoading] = useState(true);
  const [balanceUpdates, setBalanceUpdates] = useState<Record<string, BalanceUpdate>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savedItems, setSavedItems] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'accounts' | 'creditLines' | 'creditCards'>('accounts');
  
  // Estado para modal de retenciones
  const [holdModalOpen, setHoldModalOpen] = useState(false);
  const [selectedAccountForHold, setSelectedAccountForHold] = useState<Account | null>(null);
  const [editingHoldId, setEditingHoldId] = useState<string | null>(null);
  const [holdForm, setHoldForm] = useState({
    concept: '',
    amount: 0,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    type: 'PARTIAL' as AccountHoldType,
    reference: '',
    notes: '',
  });
  const [isSavingHold, setIsSavingHold] = useState(false);

  // Filtros locales
  const [filterCompanyId, setFilterCompanyId] = useState<string>('');
  const [filterBankName, setFilterBankName] = useState<string>('');

  // Cargar datos via API
  useEffect(() => {
    if (!user) return;
    
    const loadData = async () => {
      try {
        setLoading(true);
        const [accountsData, creditLinesData, creditCardsData, companiesData, holdsData] = await Promise.all([
          accountsApi.getAll(),
          creditLinesApi.getAll(),
          creditCardsApi.getAll(),
          companiesApi.getAll(),
          accountHoldsApi.getAll(undefined, 'ACTIVE')
        ]);
        
        setAccounts(accountsData);
        setCreditLines(creditLinesData);
        setCreditCards(creditCardsData);
        setCompanies(companiesData);
        setAccountHolds(holdsData);
      } catch (error) {
        console.error('Error cargando datos:', error);
        toast.error('Error al cargar los datos');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [user]);

  // Obtener retenciones activas de una cuenta
  const getAccountHolds = (accountId: string): AccountHold[] => {
    return accountHolds.filter(h => h.accountId === accountId && h.status === 'ACTIVE');
  };

  // Calcular total retenido de una cuenta
  const getTotalHoldAmount = (accountId: string): number => {
    return getAccountHolds(accountId).reduce((sum, h) => sum + h.amount, 0);
  };

  // Calcular saldo disponible de una cuenta
  const getAvailableBalance = (account: Account): number => {
    const holdAmount = getTotalHoldAmount(account.id);
    return account.currentBalance - holdAmount;
  };

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

  // Filtrar por empresa seleccionada (global o local) y banco
  const effectiveCompanyId = filterCompanyId || selectedCompanyId;
  
  // Obtener lista única de bancos para el filtro
  const uniqueBanks = Array.from(new Set(accounts.map(acc => acc.bankName))).sort();
  
  const filteredAccounts = accounts
    .filter(acc => !effectiveCompanyId || acc.companyId === effectiveCompanyId)
    .filter(acc => !filterBankName || acc.bankName === filterBankName);
  
  const filteredCreditLines = creditLines
    .filter(cl => !effectiveCompanyId || cl.companyId === effectiveCompanyId)
    .filter(cl => !filterBankName || cl.bankName === filterBankName);
  
  const filteredCreditCards = creditCards
    .filter(cc => !effectiveCompanyId || cc.companyId === effectiveCompanyId)
    .filter(cc => !filterBankName || cc.bankName === filterBankName);

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
  
  // Calcular total de retenciones activas
  const totalHoldsAmount = filteredAccounts.reduce((sum, acc) => sum + getTotalHoldAmount(acc.id), 0);
  const totalAvailableBalance = totalNewAccountBalance - totalHoldsAmount;

  // Abrir modal para añadir retención
  const openHoldModal = (account: Account) => {
    setSelectedAccountForHold(account);
    setHoldForm({
      concept: '',
      amount: 0,
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      type: 'PARTIAL',
      reference: '',
      notes: '',
    });
    setEditingHoldId(null);
    setHoldModalOpen(true);
  };

  // Abrir modal para editar retención existente
  const handleEditHold = (hold: AccountHold) => {
    const account = accounts.find(a => a.id === hold.accountId);
    if (!account) return;
    
    setSelectedAccountForHold(account);
    setEditingHoldId(hold.id);
    setHoldForm({
      concept: hold.concept,
      amount: hold.amount,
      startDate: hold.startDate ? new Date(hold.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      endDate: hold.endDate ? new Date(hold.endDate).toISOString().split('T')[0] : '',
      type: hold.type,
      reference: hold.reference || '',
      notes: hold.notes || '',
    });
    setHoldModalOpen(true);
  };

  // Guardar retención (crear o actualizar)
  const handleSaveHold = async () => {
    if (!selectedAccountForHold) return;
    
    if (!holdForm.concept || holdForm.amount <= 0) {
      toast.error('Completa el concepto y el importe');
      return;
    }

    setIsSavingHold(true);
    try {
      if (editingHoldId) {
        // Actualizar retención existente
        const updatedHold = await accountHoldsApi.update(editingHoldId, {
          concept: holdForm.concept,
          amount: holdForm.amount,
          startDate: new Date(holdForm.startDate),
          endDate: holdForm.endDate ? new Date(holdForm.endDate) : null,
          type: holdForm.type,
          reference: holdForm.reference || undefined,
          notes: holdForm.notes || undefined,
        });
        
        setAccountHolds(prev => prev.map(h => h.id === editingHoldId ? updatedHold : h));
        toast.success('Retención actualizada correctamente');
      } else {
        // Crear nueva retención
        const newHold = await accountHoldsApi.create({
          accountId: selectedAccountForHold.id,
          companyId: selectedAccountForHold.companyId,
          concept: holdForm.concept,
          amount: holdForm.amount,
          startDate: new Date(holdForm.startDate),
          endDate: holdForm.endDate ? new Date(holdForm.endDate) : null,
          type: holdForm.type,
          reference: holdForm.reference || undefined,
          notes: holdForm.notes || undefined,
        });
        
        setAccountHolds(prev => [...prev, newHold]);
        toast.success('Retención registrada correctamente');
      }
      
      setHoldModalOpen(false);
      setEditingHoldId(null);
    } catch (error) {
      console.error('Error guardando retención:', error);
      toast.error('Error al guardar la retención');
    } finally {
      setIsSavingHold(false);
    }
  };

  // Liberar una retención
  const handleReleaseHold = async (holdId: string) => {
    try {
      await accountHoldsApi.release(holdId);
      setAccountHolds(prev => prev.filter(h => h.id !== holdId));
      toast.success('Retención liberada');
    } catch (error) {
      console.error('Error liberando retención:', error);
      toast.error('Error al liberar la retención');
    }
  };

  // Calcular días restantes de una retención
  const getDaysRemaining = (endDate: Date | null | undefined): string => {
    if (!endDate) return 'Indefinida';
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = end.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'Vencida';
    if (diffDays === 0) return 'Hoy';
    return `${diffDays} días`;
  };

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
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
        {totalHoldsAmount > 0 && (
          <Card>
            <div className="text-center">
              <p className="text-sm text-gray-500 flex items-center justify-center">
                <Lock size={12} className="mr-1" /> Retenciones
              </p>
              <p className="text-2xl font-bold text-amber-600 mt-1">
                -{formatCurrency(totalHoldsAmount)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Saldo disponible: {formatCurrency(totalAvailableBalance)}
              </p>
            </div>
          </Card>
        )}
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
              (totalAvailableBalance - totalCreditCardDebt) >= 0 ? 'text-gray-900' : 'text-red-600'
            }`}>
              {formatCurrency(totalAvailableBalance - totalCreditCardDebt)}
            </p>
            {totalHoldsAmount > 0 && (
              <p className="text-xs text-gray-400 mt-1">(Descontadas retenciones)</p>
            )}
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

      {/* Filtros locales */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 text-gray-600">
          <Filter size={16} />
          <span className="text-sm font-medium">Filtrar:</span>
        </div>
        
        {/* Filtro por empresa */}
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-gray-400" />
          <select
            value={filterCompanyId}
            onChange={(e) => setFilterCompanyId(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Todas las empresas</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
        
        {/* Filtro por banco */}
        <div className="flex items-center gap-2">
          <Wallet size={14} className="text-gray-400" />
          <select
            value={filterBankName}
            onChange={(e) => setFilterBankName(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Todos los bancos</option>
            {uniqueBanks.map((bank) => (
              <option key={bank} value={bank}>
                {bank}
              </option>
            ))}
          </select>
        </div>

        {/* Limpiar filtros */}
        {(filterCompanyId || filterBankName) && (
          <button
            onClick={() => {
              setFilterCompanyId('');
              setFilterBankName('');
            }}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
          >
            <X size={14} />
            Limpiar filtros
          </button>
        )}
        
        {/* Indicador de resultados */}
        <div className="ml-auto text-sm text-gray-500">
          {activeTab === 'accounts' && (
            <span>{filteredAccounts.length} cuenta{filteredAccounts.length !== 1 ? 's' : ''}</span>
          )}
          {activeTab === 'creditLines' && (
            <span>{filteredCreditLines.length} póliza{filteredCreditLines.length !== 1 ? 's' : ''}</span>
          )}
          {activeTab === 'creditCards' && (
            <span>{filteredCreditCards.length} tarjeta{filteredCreditCards.length !== 1 ? 's' : ''}</span>
          )}
        </div>
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
                    const holds = getAccountHolds(account.id);
                    const holdAmount = getTotalHoldAmount(account.id);
                    const availableBalance = getAvailableBalance(account);
                    
                    return (
                      <React.Fragment key={account.id}>
                        <tr className="border-b last:border-0">
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
                                <p className="text-xs text-gray-400 font-mono mt-0.5">{formatIbanDisplay(account.accountNumber)}</p>
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
                            {holdAmount > 0 && !update && (
                              <div className="text-amber-600 text-xs mt-1">
                                <Lock size={10} className="inline mr-1" />
                                Disponible: {formatCurrency(availableBalance)}
                              </div>
                            )}
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
                              {holdAmount > 0 && update && (
                                <div className="text-amber-600 text-xs mt-1 text-right">
                                  <Lock size={10} className="inline mr-1" />
                                  Disponible: {formatCurrency(parseFloat(update.newBalance) - holdAmount)}
                                </div>
                              )}
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
                            <div className="flex flex-col items-center gap-1">
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
                              <button
                                onClick={() => openHoldModal(account)}
                                className="text-xs text-gray-500 hover:text-amber-600 flex items-center"
                                title="Añadir retención"
                              >
                                <Lock size={12} className="mr-1" />
                                {holds.length > 0 ? `${holds.length} retención(es)` : '+ Retención'}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {/* Fila expandible con retenciones activas */}
                        {holds.length > 0 && (
                          <tr className="bg-amber-50">
                            <td colSpan={6} className="px-4 py-2">
                              <div className="flex flex-wrap gap-2">
                                {holds.map((hold) => (
                                  <div 
                                    key={hold.id}
                                    className="bg-white border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2 text-sm"
                                  >
                                    <Lock size={14} className="text-amber-600" />
                                    <span className="font-medium">{formatCurrency(hold.amount)}</span>
                                    <span className="text-gray-500">-</span>
                                    <span className="text-gray-600">{hold.concept}</span>
                                    <span className="text-gray-400">|</span>
                                    <span className="text-xs text-gray-500 flex items-center">
                                      <Calendar size={10} className="mr-1" />
                                      {getDaysRemaining(hold.endDate)}
                                    </span>
                                    <button
                                      onClick={() => handleEditHold(hold)}
                                      className="ml-2 text-gray-400 hover:text-blue-600"
                                      title="Editar retención"
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                    <button
                                      onClick={() => handleReleaseHold(hold.id)}
                                      className="text-gray-400 hover:text-green-600"
                                      title="Liberar retención"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
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

      {/* Modal para añadir/editar retención */}
      {holdModalOpen && selectedAccountForHold && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 pt-6 pb-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingHoldId ? 'Editar Retención' : 'Añadir Retención'}
              </h3>
              <button
                onClick={() => {
                  setHoldModalOpen(false);
                  setEditingHoldId(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Cuenta:</p>
                <p className="font-medium text-gray-900">
                  {selectedAccountForHold.bankName} - {selectedAccountForHold.alias}
                </p>
                <p className="text-sm text-gray-500">
                  Saldo actual: {formatCurrency(selectedAccountForHold.currentBalance)}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Concepto *
                </label>
                <input
                  type="text"
                  value={holdForm.concept}
                  onChange={(e) => setHoldForm(prev => ({ ...prev, concept: e.target.value }))}
                  placeholder="Ej: Parcial por motivos varios"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <CurrencyInput
                  label="Importe retenido *"
                  value={holdForm.amount}
                  onChange={(value) => setHoldForm(prev => ({ ...prev, amount: value }))}
                  placeholder="0,00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de retención
                </label>
                <select
                  value={holdForm.type}
                  onChange={(e) => setHoldForm(prev => ({ ...prev, type: e.target.value as AccountHoldType }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  {Object.entries(holdTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha inicio
                  </label>
                  <input
                    type="date"
                    value={holdForm.startDate}
                    onChange={(e) => setHoldForm(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha fin (opcional)
                  </label>
                  <input
                    type="date"
                    value={holdForm.endDate}
                    onChange={(e) => setHoldForm(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Referencia (opcional)
                </label>
                <input
                  type="text"
                  value={holdForm.reference}
                  onChange={(e) => setHoldForm(prev => ({ ...prev, reference: e.target.value }))}
                  placeholder="Nº referencia del banco"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas (opcional)
                </label>
                <textarea
                  value={holdForm.notes}
                  onChange={(e) => setHoldForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Notas adicionales..."
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setHoldModalOpen(false);
                    setEditingHoldId(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSaveHold}
                  isLoading={isSavingHold}
                >
                  <Lock size={16} className="mr-2" />
                  {editingHoldId ? 'Guardar Cambios' : 'Registrar Retención'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
