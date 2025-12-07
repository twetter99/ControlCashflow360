'use client';

import React, { useState, useEffect } from 'react';
import { Button, Card, Input, ThirdPartyAutocomplete } from '@/components/ui';
import { useCompanyFilter } from '@/contexts/CompanyFilterContext';
import { useAuth } from '@/contexts/AuthContext';
import { transactionsApi, companiesApi, accountsApi } from '@/lib/api-client';
import { Transaction, Company, Account, TransactionStatus, TransactionType, RecurrenceFrequency, CertaintyLevel, PaymentMethod, getIncomeLayer } from '@/types';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Plus, 
  Filter,
  TrendingUp,
  TrendingDown,
  Check,
  X,
  Calendar,
  Search,
  Edit2,
  Trash2,
  Repeat,
  Target,
  FileText,
  FileCheck,
  RotateCcw
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface CompanyOption {
  id: string;
  name: string;
}

interface TransactionFormData {
  type: TransactionType;
  description: string;
  thirdPartyName: string;
  thirdPartyId?: string;
  category: string;
  amount: string;
  dueDate: string;
  companyId: string;
  notes: string;
  invoiceNumber: string;
  recurrence: RecurrenceFrequency;
  certainty: CertaintyLevel;
  // Campos opcionales para gastos
  supplierInvoiceNumber: string;
  supplierBankAccount: string;
  paymentMethod: PaymentMethod;
  chargeAccountId: string;
}

export default function TransactionsPage() {
  const { selectedCompanyId } = useCompanyFilter();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<TransactionStatus | 'ALL'>('ALL');
  const [filterType, setFilterType] = useState<TransactionType | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState<TransactionFormData>({
    type: 'EXPENSE',
    description: '',
    thirdPartyName: '',
    thirdPartyId: undefined,
    category: '',
    amount: '',
    dueDate: '',
    companyId: '',
    notes: '',
    invoiceNumber: '',
    recurrence: 'NONE',
    certainty: 'HIGH',
    supplierInvoiceNumber: '',
    supplierBankAccount: '',
    paymentMethod: 'TRANSFER',
    chargeAccountId: '',
  });

  // Cargar datos via API
  useEffect(() => {
    if (!user) return;
    
    const loadData = async () => {
      try {
        setLoading(true);
        const [transactionsData, companiesData, accountsData] = await Promise.all([
          transactionsApi.getAll(),
          companiesApi.getAll(),
          accountsApi.getAll()
        ]);
        setTransactions(transactionsData);
        setCompanies(companiesData.map((c: Company) => ({ id: c.id, name: c.name })));
        setAccounts(accountsData);
      } catch (error: unknown) {
        console.error('Error cargando datos:', error);
        toast.error('Error al cargar los movimientos');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [user]);

  // Filtrar transacciones
  let filteredTransactions = transactions;
  
  if (selectedCompanyId) {
    filteredTransactions = filteredTransactions.filter((tx) => tx.companyId === selectedCompanyId);
  }
  if (filterStatus !== 'ALL') {
    filteredTransactions = filteredTransactions.filter((tx) => tx.status === filterStatus);
  }
  if (filterType !== 'ALL') {
    filteredTransactions = filteredTransactions.filter((tx) => tx.type === filterType);
  }
  if (searchTerm) {
    filteredTransactions = filteredTransactions.filter(
      (tx) =>
        (tx.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tx.thirdPartyName || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  // Calcular totales
  const pendingExpenses = filteredTransactions
    .filter((tx) => tx.type === 'EXPENSE' && tx.status === 'PENDING')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const pendingIncomes = filteredTransactions
    .filter((tx) => tx.type === 'INCOME' && tx.status === 'PENDING')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const handleMarkAsPaid = async (transactionId: string) => {
    if (!user) return;
    try {
      const updated = await transactionsApi.markAsPaid(transactionId);
      setTransactions(prev => prev.map(tx => 
        tx.id === transactionId ? updated : tx
      ));
      toast.success('Movimiento marcado como pagado');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al marcar como pagado');
    }
  };

  const handleCancel = async (transactionId: string) => {
    if (!user) return;
    if (!confirm('¿Estás seguro de que deseas cancelar este movimiento?')) return;
    try {
      const updated = await transactionsApi.cancel(transactionId);
      setTransactions(prev => prev.map(tx => 
        tx.id === transactionId ? updated : tx
      ));
      toast.success('Movimiento cancelado');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cancelar el movimiento');
    }
  };

  const handleReactivate = async (transactionId: string) => {
    if (!user) return;
    if (!confirm('¿Reactivar este movimiento como pendiente?')) return;
    try {
      const updated = await transactionsApi.reactivate(transactionId);
      setTransactions(prev => prev.map(tx => 
        tx.id === transactionId ? updated : tx
      ));
      toast.success('Movimiento reactivado como pendiente');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al reactivar el movimiento');
    }
  };

  const handleEdit = (tx: Transaction) => {
    // Convertir dueDate a string ISO si viene como Date o string
    const dueDateStr = tx.dueDate instanceof Date 
      ? tx.dueDate.toISOString().split('T')[0]
      : new Date(tx.dueDate).toISOString().split('T')[0];
    
    setFormData({
      type: tx.type,
      description: tx.description || '',
      thirdPartyName: tx.thirdPartyName || '',
      thirdPartyId: tx.thirdPartyId,
      category: tx.category,
      amount: tx.amount.toString(),
      dueDate: dueDateStr,
      companyId: tx.companyId,
      notes: tx.notes || '',
      invoiceNumber: tx.invoiceNumber || '',
      recurrence: tx.recurrence || 'NONE',
      certainty: tx.certainty || 'HIGH',
      supplierInvoiceNumber: tx.supplierInvoiceNumber || '',
      supplierBankAccount: tx.supplierBankAccount || '',
      paymentMethod: tx.paymentMethod || 'TRANSFER',
      chargeAccountId: tx.chargeAccountId || '',
    });
    setEditingTransaction(tx.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      if (editingTransaction) {
        const updated = await transactionsApi.update(editingTransaction, {
          type: formData.type,
          description: formData.description,
          thirdPartyName: formData.thirdPartyName,
          thirdPartyId: formData.thirdPartyId,
          category: formData.category,
          amount: parseFloat(formData.amount),
          dueDate: new Date(formData.dueDate),
          companyId: formData.companyId,
          notes: formData.notes,
          invoiceNumber: formData.type === 'INCOME' ? formData.invoiceNumber : '',
          recurrence: formData.recurrence,
          certainty: formData.certainty,
          supplierInvoiceNumber: formData.type === 'EXPENSE' ? formData.supplierInvoiceNumber : '',
          supplierBankAccount: formData.type === 'EXPENSE' && formData.paymentMethod === 'TRANSFER' ? formData.supplierBankAccount : '',
          paymentMethod: formData.type === 'EXPENSE' ? formData.paymentMethod : undefined,
          chargeAccountId: formData.type === 'EXPENSE' ? formData.chargeAccountId : undefined,
        });
        setTransactions(prev => prev.map(tx => 
          tx.id === editingTransaction ? updated : tx
        ));
        toast.success('Movimiento actualizado correctamente');
      } else {
        const newTx = await transactionsApi.create({
          companyId: formData.companyId,
          type: formData.type,
          amount: parseFloat(formData.amount),
          status: 'PENDING',
          dueDate: new Date(formData.dueDate),
          category: formData.category,
          description: formData.description,
          thirdPartyName: formData.thirdPartyName,
          thirdPartyId: formData.thirdPartyId,
          notes: formData.notes,
          invoiceNumber: formData.type === 'INCOME' ? formData.invoiceNumber : '',
          recurrence: formData.recurrence,
          certainty: formData.certainty,
          supplierInvoiceNumber: formData.type === 'EXPENSE' ? formData.supplierInvoiceNumber : '',
          supplierBankAccount: formData.type === 'EXPENSE' && formData.paymentMethod === 'TRANSFER' ? formData.supplierBankAccount : '',
          paymentMethod: formData.type === 'EXPENSE' ? formData.paymentMethod : undefined,
          chargeAccountId: formData.type === 'EXPENSE' ? formData.chargeAccountId : undefined,
          createdBy: user.uid,
        });
        setTransactions(prev => [...prev, newTx]);
        toast.success('Movimiento creado correctamente');
      }
      
      setShowForm(false);
      setEditingTransaction(null);
      setFormData({
        type: 'EXPENSE',
        description: '',
        thirdPartyName: '',
        thirdPartyId: undefined,
        category: '',
        amount: '',
        dueDate: '',
        companyId: '',
        notes: '',
        invoiceNumber: '',
        recurrence: 'NONE',
        certainty: 'HIGH',
        supplierInvoiceNumber: '',
        supplierBankAccount: '',
        paymentMethod: 'TRANSFER',
        chargeAccountId: '',
      });
    } catch (error) {
      console.error('Error guardando movimiento:', error);
      toast.error('Error al guardar el movimiento');
    }
  };

  const getStatusBadge = (status: TransactionStatus) => {
    const styles = {
      PENDING: 'bg-amber-100 text-amber-800',
      PAID: 'bg-green-100 text-green-800',
      CANCELLED: 'bg-gray-100 text-gray-800',
    };
    const labels = {
      PENDING: 'Pendiente',
      PAID: 'Pagado',
      CANCELLED: 'Cancelado',
    };
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  // Badge de capa para ingresos
  const getIncomeLayerBadge = (tx: Transaction) => {
    if (tx.type !== 'INCOME') return null;
    
    const layer = getIncomeLayer(tx);
    
    switch (layer) {
      case 1:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-700 text-white" title="Facturado - Confirmado">
            <FileCheck size={12} className="mr-1" />
            Facturado
          </span>
        );
      case 2:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500 text-white" title="Contrato - Recurrente seguro">
            <Repeat size={12} className="mr-1" />
            Contrato
          </span>
        );
      case 3:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-400 text-white" title="Estimado - Previsión">
            <Target size={12} className="mr-1" />
            Estimado
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Movimientos</h1>
          <p className="text-gray-500 mt-1">
            Gestiona ingresos y gastos previstos
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={18} className="mr-2" />
          Nuevo Movimiento
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-green-100 rounded-lg mr-4">
              <TrendingUp className="text-green-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Cobros Pendientes</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(pendingIncomes)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-red-100 rounded-lg mr-4">
              <TrendingDown className="text-red-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pagos Pendientes</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(pendingExpenses)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-primary-100 rounded-lg mr-4">
              <Calendar className="text-primary-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Neto Proyectado</p>
              <p className={`text-2xl font-bold ${pendingIncomes - pendingExpenses >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(pendingIncomes - pendingExpenses)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-2">
            <Filter size={18} className="text-gray-400" />
            <span className="text-sm text-gray-500">Filtros:</span>
          </div>
          
          <div className="flex items-center space-x-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as TransactionStatus | 'ALL')}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="ALL">Todos los estados</option>
              <option value="PENDING">Pendientes</option>
              <option value="PAID">Pagados</option>
              <option value="CANCELLED">Cancelados</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as TransactionType | 'ALL')}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="ALL">Ingresos y Gastos</option>
              <option value="INCOME">Solo Ingresos</option>
              <option value="EXPENSE">Solo Gastos</option>
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por descripción o tercero..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Lista de transacciones */}
      <Card title={`Transacciones (${filteredTransactions.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3 font-medium">Descripción</th>
                <th className="pb-3 font-medium">Tipo</th>
                <th className="pb-3 font-medium">Categoría</th>
                <th className="pb-3 font-medium">Vencimiento</th>
                <th className="pb-3 font-medium text-right">Importe</th>
                <th className="pb-3 font-medium">Estado</th>
                <th className="pb-3 font-medium text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((tx) => (
                <tr key={tx.id} className="border-b last:border-0">
                  <td className="py-4">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{tx.description}</p>
                        <p className="text-sm text-gray-500">{tx.thirdPartyName}</p>
                        {tx.invoiceNumber && (
                          <p className="text-xs text-green-600 mt-0.5">
                            <FileText size={10} className="inline mr-1" />
                            {tx.invoiceNumber}
                          </p>
                        )}
                        {tx.supplierInvoiceNumber && (
                          <p className="text-xs text-red-600 mt-0.5">
                            <FileText size={10} className="inline mr-1" />
                            Fact: {tx.supplierInvoiceNumber}
                          </p>
                        )}
                        {tx.paymentMethod === 'DIRECT_DEBIT' && (
                          <p className="text-xs text-orange-600 mt-0.5" title="Recibo domiciliado">
                            🔄 Recibo domiciliado
                          </p>
                        )}
                        {tx.chargeAccountId && (
                          <p className="text-xs text-blue-600 mt-0.5" title="Cuenta de cargo">
                            🏦 {accounts.find(a => a.id === tx.chargeAccountId)?.alias || 'Cuenta asignada'}
                          </p>
                        )}
                        {tx.supplierBankAccount && tx.paymentMethod !== 'DIRECT_DEBIT' && (
                          <p className="text-xs text-gray-500 mt-0.5" title="IBAN del proveedor">
                            💸 {tx.supplierBankAccount}
                          </p>
                        )}
                      </div>
                      {getIncomeLayerBadge(tx)}
                    </div>
                  </td>
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
                  <td className="py-4">
                    <span className="text-sm text-gray-600">{tx.category}</span>
                  </td>
                  <td className="py-4">
                    <span className="text-sm text-gray-600">{formatDate(tx.dueDate)}</span>
                  </td>
                  <td className="py-4 text-right">
                    <span className={`font-semibold ${
                      tx.type === 'INCOME' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </span>
                  </td>
                  <td className="py-4">
                    {getStatusBadge(tx.status)}
                  </td>
                  <td className="py-4">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={() => handleEdit(tx)}
                        className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                        title="Editar"
                      >
                        <Edit2 size={16} />
                      </button>
                      {tx.status === 'PENDING' && (
                        <button
                          onClick={() => handleMarkAsPaid(tx.id)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Marcar como pagado"
                        >
                          <Check size={16} />
                        </button>
                      )}
                      {tx.status === 'PENDING' && (
                        <button
                          onClick={() => handleCancel(tx.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Cancelar"
                        >
                          <X size={16} />
                        </button>
                      )}
                      {(tx.status === 'PAID' || tx.status === 'CANCELLED') && (
                        <button
                          onClick={() => handleReactivate(tx.id)}
                          className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Reactivar como pendiente"
                        >
                          <RotateCcw size={16} />
                        </button>
                      )}
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
        <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-4 py-8">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
              <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">
                {editingTransaction ? 'Editar Movimiento' : 'Nuevo Movimiento'}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingTransaction(null);
                  setFormData({
                    type: 'EXPENSE',
                    description: '',
                    thirdPartyName: '',
                    thirdPartyId: undefined,
                    category: '',
                    amount: '',
                    dueDate: '',
                    companyId: '',
                    notes: '',
                    invoiceNumber: '',
                    recurrence: 'NONE',
                    certainty: 'HIGH',
                    supplierInvoiceNumber: '',
                    supplierBankAccount: '',
                    paymentMethod: 'TRANSFER',
                    chargeAccountId: '',
                  });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="type"
                      value="EXPENSE"
                      checked={formData.type === 'EXPENSE'}
                      onChange={() => setFormData({ ...formData, type: 'EXPENSE' })}
                      className="mr-2"
                    />
                    <span className="text-red-600 font-medium">Gasto</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="type"
                      value="INCOME"
                      checked={formData.type === 'INCOME'}
                      onChange={() => setFormData({ ...formData, type: 'INCOME' })}
                      className="mr-2"
                    />
                    <span className="text-green-600 font-medium">Ingreso</span>
                  </label>
                </div>
              </div>
              <Input
                label="Descripción"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Nóminas Diciembre 2024"
                required
              />
              <ThirdPartyAutocomplete
                value={formData.thirdPartyName}
                thirdPartyId={formData.thirdPartyId}
                onChange={(displayName, thirdPartyId) => 
                  setFormData({ ...formData, thirdPartyName: displayName, thirdPartyId })
                }
                placeholder="Nombre del cliente/proveedor"
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full border rounded-lg px-4 py-3"
                  required
                >
                  <option value="">Selecciona categoría</option>
                  <option value="Nóminas">Nóminas</option>
                  <option value="Seguros Sociales">Seguros Sociales</option>
                  <option value="Proveedores">Proveedores</option>
                  <option value="Alquiler">Alquiler</option>
                  <option value="Suministros">Suministros</option>
                  <option value="Impuestos">Impuestos</option>
                  <option value="Facturación Clientes">Facturación Clientes</option>
                  <option value="Otros">Otros</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Importe"
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  step="0.01"
                  placeholder="0.00"
                  required
                />
                <Input
                  label="Fecha Vencimiento"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
                <select
                  value={formData.companyId}
                  onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                  className="w-full border rounded-lg px-4 py-3"
                  required
                >
                  <option value="">Selecciona empresa</option>
                  {companies.map(company => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              </div>
              
              {/* Campo de factura - Solo para ingresos */}
              {formData.type === 'INCOME' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="text-green-600 mt-1 flex-shrink-0" size={20} />
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-green-800 mb-1">
                        Nº Factura (opcional)
                      </label>
                      <Input
                        value={formData.invoiceNumber}
                        onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                        placeholder="Ej: F-2024-001"
                      />
                      <p className="text-xs text-green-600 mt-1">
                        {formData.invoiceNumber 
                          ? '✓ Ingreso FACTURADO - Se contabilizará como confirmado'
                          : 'Sin nº de factura = Ingreso previsto/estimado'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Campos adicionales - Solo para gastos */}
              {formData.type === 'EXPENSE' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-medium text-red-800 flex items-center gap-2">
                    <FileText size={16} />
                    Datos del pago (opcionales)
                  </p>
                  
                  {/* Método de pago */}
                  <div>
                    <label className="block text-sm font-medium text-red-800 mb-2">Método de pago</label>
                    <div className="flex space-x-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="TRANSFER"
                          checked={formData.paymentMethod === 'TRANSFER'}
                          onChange={() => setFormData({ ...formData, paymentMethod: 'TRANSFER' })}
                          className="mr-2"
                        />
                        <span className="text-sm">💸 Transferencia</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="DIRECT_DEBIT"
                          checked={formData.paymentMethod === 'DIRECT_DEBIT'}
                          onChange={() => setFormData({ ...formData, paymentMethod: 'DIRECT_DEBIT', supplierBankAccount: '' })}
                          className="mr-2"
                        />
                        <span className="text-sm">🔄 Recibo domiciliado</span>
                      </label>
                    </div>
                  </div>

                  {/* Cuenta de cargo (nuestra) */}
                  <div>
                    <label className="block text-sm font-medium text-red-800 mb-1">
                      {formData.paymentMethod === 'DIRECT_DEBIT' 
                        ? 'Cuenta donde nos girarán el recibo' 
                        : 'Cuenta desde donde pagaremos (opcional)'}
                    </label>
                    <select
                      value={formData.chargeAccountId}
                      onChange={(e) => setFormData({ ...formData, chargeAccountId: e.target.value })}
                      className="w-full border rounded-lg px-4 py-3 text-sm"
                    >
                      <option value="">Selecciona cuenta</option>
                      {accounts
                        .filter(acc => !formData.companyId || acc.companyId === formData.companyId)
                        .map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.bankName} - {acc.accountNumber} ({acc.alias})
                          </option>
                        ))}
                    </select>
                  </div>

                  <Input
                    label="Nº Factura del proveedor"
                    value={formData.supplierInvoiceNumber}
                    onChange={(e) => setFormData({ ...formData, supplierInvoiceNumber: e.target.value })}
                    placeholder="Ej: FAC-2024-001234"
                  />
                  
                  {/* IBAN solo si es transferencia */}
                  {formData.paymentMethod === 'TRANSFER' && (
                    <Input
                      label="IBAN/Cuenta del proveedor"
                      value={formData.supplierBankAccount}
                      onChange={(e) => setFormData({ ...formData, supplierBankAccount: e.target.value })}
                      placeholder="Ej: ES91 2100 0418 4502 0005 1332"
                    />
                  )}
                  
                  <p className="text-xs text-red-600">
                    {formData.paymentMethod === 'DIRECT_DEBIT' 
                      ? '🔄 El proveedor girará un cargo automático a tu cuenta'
                      : '💸 Deberás realizar la transferencia manualmente'}
                  </p>
                </div>
              )}
              
              {/* Nuevos campos: Recurrencia y Certeza */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Repeat size={14} className="inline mr-1" />
                    Recurrencia
                  </label>
                  <select
                    value={formData.recurrence}
                    onChange={(e) => setFormData({ ...formData, recurrence: e.target.value as RecurrenceFrequency })}
                    className="w-full border rounded-lg px-4 py-3"
                  >
                    <option value="NONE">No recurrente</option>
                    <option value="WEEKLY">Semanal</option>
                    <option value="BIWEEKLY">Quincenal</option>
                    <option value="MONTHLY">Mensual</option>
                    <option value="QUARTERLY">Trimestral</option>
                    <option value="YEARLY">Anual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Target size={14} className="inline mr-1" />
                    Certeza
                  </label>
                  <select
                    value={formData.certainty}
                    onChange={(e) => setFormData({ ...formData, certainty: e.target.value as CertaintyLevel })}
                    className="w-full border rounded-lg px-4 py-3"
                  >
                    <option value="HIGH">🟢 Alta - Confirmado</option>
                    <option value="MEDIUM">🟡 Media - Probable</option>
                    <option value="LOW">🔴 Baja - Posible</option>
                  </select>
                </div>
              </div>

              <Input
                label="Notas"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Información adicional..."
              />
              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingTransaction(null);
                    setFormData({
                      type: 'EXPENSE',
                      description: '',
                      thirdPartyName: '',
                      thirdPartyId: undefined,
                      category: '',
                      amount: '',
                      dueDate: '',
                      companyId: '',
                      notes: '',
                      invoiceNumber: '',
                      recurrence: 'NONE',
                      certainty: 'HIGH',
                      supplierInvoiceNumber: '',
                      supplierBankAccount: '',
                      paymentMethod: 'TRANSFER',
                      chargeAccountId: '',
                    });
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingTransaction ? 'Guardar Cambios' : 'Crear Movimiento'}
                </Button>
              </div>
            </form>
          </div>
          </div>
        </div>
      )}
      <Toaster position="top-right" />
    </div>
  );
}
