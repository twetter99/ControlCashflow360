'use client';

import React, { useState, useEffect } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { useCompanyFilter } from '@/contexts/CompanyFilterContext';
import { useAuth } from '@/contexts/AuthContext';
import { accountsApi, companiesApi } from '@/lib/api-client';
import { Account, Company } from '@/types';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Wallet,
  Building2,
  AlertCircle,
  X
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';

// Formatea IBAN en bloques de 4 caracteres para mejor legibilidad
const formatIbanDisplay = (iban: string): string => {
  if (!iban) return '';
  // Eliminar espacios existentes y formatear en bloques de 4
  const clean = iban.replace(/\s/g, '');
  return clean.match(/.{1,4}/g)?.join(' ') || clean;
};

interface AccountFormData {
  bankName: string;
  alias: string;
  accountNumber: string;
  companyId: string;
  currentBalance: string;
}

interface CompanyOption {
  id: string;
  name: string;
}

export default function AccountsPage() {
  const { selectedCompanyId } = useCompanyFilter();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<AccountFormData>({
    bankName: '',
    alias: '',
    accountNumber: '',
    companyId: '',
    currentBalance: '0',
  });

  // Cargar datos via API
  useEffect(() => {
    if (!user) return;
    
    const loadData = async () => {
      try {
        setLoading(true);
        const [accountsData, companiesData] = await Promise.all([
          accountsApi.getAll(),
          companiesApi.getAll()
        ]);
        setAccounts(accountsData);
        setCompanies(companiesData.map((c: Company) => ({ id: c.id, name: c.name })));
      } catch (error: unknown) {
        console.error('Error cargando datos:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        if (!errorMessage.includes('index') && !errorMessage.includes('permission')) {
          toast.error('Error al cargar las cuentas');
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [user]);

  // Filtrar por empresa
  const filteredAccounts = selectedCompanyId
    ? accounts.filter((acc) => acc.companyId === selectedCompanyId)
    : accounts;

  // Calcular totales
  const totalBalance = filteredAccounts.reduce((sum, acc) => sum + acc.currentBalance, 0);

  // Obtener nombre de empresa
  const getCompanyName = (companyId: string) => {
    return companies.find(c => c.id === companyId)?.name || 'Sin empresa';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      if (editingAccount) {
        // Actualizar cuenta existente
        const updated = await accountsApi.update(editingAccount, {
          bankName: formData.bankName,
          alias: formData.alias,
          accountNumber: formData.accountNumber,
          companyId: formData.companyId,
          currentBalance: parseFloat(formData.currentBalance),
        });
        setAccounts(prev => prev.map(acc => 
          acc.id === editingAccount ? updated : acc
        ));
        toast.success('Cuenta actualizada correctamente');
      } else {
        // Crear nueva cuenta
        const newAccount = await accountsApi.create({
          companyId: formData.companyId,
          bankName: formData.bankName,
          alias: formData.alias,
          accountNumber: formData.accountNumber,
          currentBalance: parseFloat(formData.currentBalance),
          lastUpdateAmount: 0,
          lastUpdatedBy: user.uid,
          status: 'ACTIVE',
        });
        setAccounts(prev => [...prev, newAccount]);
        toast.success('Cuenta creada correctamente');
      }
      
      setShowForm(false);
      setEditingAccount(null);
      setFormData({
        bankName: '',
        alias: '',
        accountNumber: '',
        companyId: '',
        currentBalance: '0',
      });
    } catch (error) {
      console.error('Error guardando cuenta:', error);
      toast.error('Error al guardar la cuenta');
    }
  };

  const handleEdit = (account: Account) => {
    setFormData({
      bankName: account.bankName,
      alias: account.alias || '',
      accountNumber: account.accountNumber,
      companyId: account.companyId,
      currentBalance: account.currentBalance.toString(),
    });
    setEditingAccount(account.id);
    setShowForm(true);
  };

  const handleDelete = async (accountId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta cuenta?')) return;
    
    try {
      await accountsApi.delete(accountId);
      setAccounts(prev => prev.filter(acc => acc.id !== accountId));
      toast.success('Cuenta eliminada correctamente');
    } catch (error) {
      console.error('Error eliminando cuenta:', error);
      toast.error('Error al eliminar la cuenta');
    }
  };

  const isStale = (date: Date | string | undefined) => {
    if (!date) return false;
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const hoursDiff = (new Date().getTime() - dateObj.getTime()) / (1000 * 60 * 60);
    return hoursDiff > 48;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cuentas Bancarias</h1>
          <p className="text-gray-500 mt-1">
            Gestiona las cuentas bancarias de las empresas
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={18} className="mr-2" />
          Nueva Cuenta
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-primary-100 rounded-lg mr-4">
              <Wallet className="text-primary-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Cuentas</p>
              <p className="text-2xl font-bold text-gray-900">{filteredAccounts.length}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-green-100 rounded-lg mr-4">
              <Building2 className="text-green-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Saldo Total</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalBalance)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-amber-100 rounded-lg mr-4">
              <AlertCircle className="text-amber-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Datos Antiguos</p>
              <p className="text-2xl font-bold text-gray-900">
                {filteredAccounts.filter((acc) => isStale(acc.lastUpdateDate)).length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Lista de cuentas */}
      <Card title="Listado de Cuentas">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3 font-medium">Banco / Alias</th>
                <th className="pb-3 font-medium">Empresa</th>
                <th className="pb-3 font-medium">Número de Cuenta</th>
                <th className="pb-3 font-medium text-right pr-6">Saldo</th>
                <th className="pb-3 font-medium pl-6">Última Actualización</th>
                <th className="pb-3 font-medium text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account) => (
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
                        <p className="text-sm text-gray-500">{account.alias || 'Sin alias'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4">
                    <span className="text-sm text-gray-600">{getCompanyName(account.companyId)}</span>
                  </td>
                  <td className="py-4">
                    <span className="text-sm text-gray-600 font-mono">{formatIbanDisplay(account.accountNumber)}</span>
                  </td>
                  <td className="py-4 text-right pr-6">
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(account.currentBalance)}
                    </span>
                  </td>
                  <td className="py-4 pl-6">
                    <div className="flex flex-col">
                      <span className="text-sm text-gray-600">
                        {formatDateTime(account.lastUpdateDate)}
                      </span>
                      {isStale(account.lastUpdateDate) && (
                        <span className="text-xs text-amber-600 flex items-center mt-1">
                          <AlertCircle size={12} className="mr-1" />
                          Dato antiguo
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-4">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={() => handleEdit(account)}
                        className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                        title="Editar"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(account.id)}
                        className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de formulario */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">
                {editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta'}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingAccount(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <Input
                label="Banco"
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                placeholder="BBVA, Santander, CaixaBank..."
                required
              />
              <Input
                label="Alias"
                value={formData.alias}
                onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                placeholder="Cuenta Corriente Principal"
                required
              />
              <Input
                label="Número de Cuenta (IBAN)"
                value={formData.accountNumber}
                onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                placeholder="ES12 1234 5678 90XX XXXX"
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
                <select
                  value={formData.companyId}
                  onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                  className="w-full border rounded-lg px-4 py-3"
                  required
                >
                  <option value="">Selecciona una empresa</option>
                  {companies.map(company => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              </div>
              <Input
                label="Saldo Inicial"
                type="number"
                step="0.01"
                value={formData.currentBalance}
                onChange={(e) => setFormData({ ...formData, currentBalance: e.target.value })}
                placeholder="0.00"
              />
              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingAccount(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingAccount ? 'Guardar Cambios' : 'Crear Cuenta'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      <Toaster position="top-right" />
    </div>
  );
}
