'use client';

import React, { useState, useEffect } from 'react';
import { Button, Card, Input, ThirdPartyAutocomplete, CurrencyInput } from '@/components/ui';
import { useCompanyFilter } from '@/contexts/CompanyFilterContext';
import { useAuth } from '@/contexts/AuthContext';
import { transactionsApi, companiesApi, accountsApi, recurrenceVersionsApi } from '@/lib/api-client';
import { Transaction, Company, Account, TransactionStatus, TransactionType, RecurrenceFrequency, CertaintyLevel, PaymentMethod, getIncomeLayer, RecurrenceUpdateScope } from '@/types';
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
  RotateCcw,
  AlertCircle,
  Copy
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
  amount: number;
  dueDate: string;
  companyId: string;
  notes: string;
  invoiceNumber: string;
  recurrence: RecurrenceFrequency;
  certainty: CertaintyLevel;
  // Campos opcionales para recurrencias con fecha fin
  recurrenceEndDate: string;
  recurrenceInstallments: number | '';
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
  const [filterHorizon, setFilterHorizon] = useState<string>('6M'); // 1M, 3M, 6M, 12M, ALL
  const [filterCompanyId, setFilterCompanyId] = useState<string>('ALL');
  const [filterAccountId, setFilterAccountId] = useState<string>('ALL');
  const [filterThirdPartyId, setFilterThirdPartyId] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estado para modal de opciones de edición de recurrencia
  const [showRecurrenceOptions, setShowRecurrenceOptions] = useState(false);
  const [pendingEditTransaction, setPendingEditTransaction] = useState<Transaction | null>(null);
  const [recurrenceUpdateScope, setRecurrenceUpdateScope] = useState<RecurrenceUpdateScope>('THIS_ONLY');
  const [versionChangeReason, setVersionChangeReason] = useState('');
  
  // Estado para selección múltiple
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  
  const [formData, setFormData] = useState<TransactionFormData>({
    type: 'EXPENSE',
    description: '',
    thirdPartyName: '',
    thirdPartyId: undefined,
    category: '',
    amount: 0,
    dueDate: '',
    companyId: '',
    notes: '',
    invoiceNumber: '',
    recurrence: 'NONE',
    certainty: 'HIGH',
    recurrenceEndDate: '',
    recurrenceInstallments: '',
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

  // Calcular fecha límite del horizonte
  const getHorizonDate = (horizon: string): Date | null => {
    if (horizon === 'ALL') return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    switch (horizon) {
      case '1M': now.setMonth(now.getMonth() + 1); break;
      case '3M': now.setMonth(now.getMonth() + 3); break;
      case '6M': now.setMonth(now.getMonth() + 6); break;
      case '12M': now.setMonth(now.getMonth() + 12); break;
      case '24M': now.setMonth(now.getMonth() + 24); break;
    }
    return now;
  };

  // Calcular empresa efectiva (filtro local o global)
  const effectiveCompanyFilter = filterCompanyId !== 'ALL' ? filterCompanyId : selectedCompanyId;

  // Filtrar bancos según empresa seleccionada
  const filteredAccounts = React.useMemo(() => {
    if (effectiveCompanyFilter) {
      return accounts.filter(a => a.companyId === effectiveCompanyFilter);
    }
    return accounts;
  }, [accounts, effectiveCompanyFilter]);

  // Resetear banco si ya no está en la lista filtrada
  React.useEffect(() => {
    if (filterAccountId !== 'ALL') {
      const stillValid = filteredAccounts.some(a => a.id === filterAccountId);
      if (!stillValid) {
        setFilterAccountId('ALL');
      }
    }
  }, [filteredAccounts, filterAccountId]);

  // Obtener lista única de terceros filtrada por tipo (ingreso/gasto) y empresa
  const uniqueThirdParties = React.useMemo(() => {
    const map = new Map<string, string>();
    transactions.forEach(tx => {
      if (tx.thirdPartyId && tx.thirdPartyName) {
        // Filtrar por tipo si está seleccionado
        if (filterType !== 'ALL' && tx.type !== filterType) return;
        // Filtrar por empresa si está seleccionada
        if (effectiveCompanyFilter && tx.companyId !== effectiveCompanyFilter) return;
        map.set(tx.thirdPartyId, tx.thirdPartyName);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [transactions, filterType, effectiveCompanyFilter]);

  // Resetear tercero si ya no está en la lista filtrada
  React.useEffect(() => {
    if (filterThirdPartyId !== 'ALL') {
      const stillValid = uniqueThirdParties.some(([id]) => id === filterThirdPartyId);
      if (!stillValid) {
        setFilterThirdPartyId('ALL');
      }
    }
  }, [uniqueThirdParties, filterThirdPartyId]);

  // Filtrar transacciones
  let filteredTransactions = transactions;
  
  // Filtro de empresa
  if (effectiveCompanyFilter) {
    filteredTransactions = filteredTransactions.filter((tx) => tx.companyId === effectiveCompanyFilter);
  }
  // Filtro por cuenta/banco
  if (filterAccountId !== 'ALL') {
    filteredTransactions = filteredTransactions.filter((tx) => tx.chargeAccountId === filterAccountId);
  }
  // Filtro por tercero
  if (filterThirdPartyId !== 'ALL') {
    filteredTransactions = filteredTransactions.filter((tx) => tx.thirdPartyId === filterThirdPartyId);
  }
  if (filterStatus !== 'ALL') {
    filteredTransactions = filteredTransactions.filter((tx) => tx.status === filterStatus);
  }
  if (filterType !== 'ALL') {
    filteredTransactions = filteredTransactions.filter((tx) => tx.type === filterType);
  }
  // Filtrar por horizonte de fechas
  const horizonDate = getHorizonDate(filterHorizon);
  if (horizonDate) {
    filteredTransactions = filteredTransactions.filter((tx) => {
      const txDate = tx.dueDate ? new Date(tx.dueDate) : null;
      return txDate && txDate <= horizonDate;
    });
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

  const handlePermanentDelete = async (transactionId: string, txDescription: string) => {
    if (!user) return;
    if (!confirm(`¿ELIMINAR DEFINITIVAMENTE "${txDescription}"?\n\nEsta acción NO se puede deshacer.`)) return;
    // Doble confirmación para evitar eliminaciones accidentales
    if (!confirm('¿Estás COMPLETAMENTE seguro? El movimiento se eliminará permanentemente.')) return;
    try {
      await transactionsApi.delete(transactionId);
      setTransactions(prev => prev.filter(tx => tx.id !== transactionId));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(transactionId);
        return next;
      });
      toast.success('Movimiento eliminado definitivamente');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al eliminar el movimiento');
    }
  };

  // Funciones de selección múltiple
  const handleSelectAll = () => {
    if (selectedIds.size === filteredTransactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTransactions.map(tx => tx.id)));
    }
  };

  const handleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (!user || selectedIds.size === 0) return;
    
    const count = selectedIds.size;
    if (!confirm(`¿ELIMINAR DEFINITIVAMENTE ${count} movimiento${count > 1 ? 's' : ''}?\n\nEsta acción NO se puede deshacer.`)) return;
    if (!confirm(`Confirma: Vas a eliminar ${count} movimiento${count > 1 ? 's' : ''} permanentemente.`)) return;
    
    setIsDeleting(true);
    let deleted = 0;
    let errors = 0;
    
    const idsToDelete = Array.from(selectedIds);
    
    try {
      for (const id of idsToDelete) {
        try {
          await transactionsApi.delete(id);
          deleted++;
        } catch {
          errors++;
        }
      }
      
      setTransactions(prev => prev.filter(tx => !selectedIds.has(tx.id)));
      setSelectedIds(new Set());
      
      if (errors > 0) {
        toast.success(`${deleted} eliminados, ${errors} con error`);
      } else {
        toast.success(`${deleted} movimiento${deleted > 1 ? 's' : ''} eliminado${deleted > 1 ? 's' : ''} definitivamente`);
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al eliminar los movimientos');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelSelected = async () => {
    if (!user || selectedIds.size === 0) return;
    
    const pendingSelected = filteredTransactions.filter(
      tx => selectedIds.has(tx.id) && tx.status === 'PENDING'
    );
    
    if (pendingSelected.length === 0) {
      toast.error('No hay movimientos pendientes seleccionados para cancelar');
      return;
    }
    
    if (!confirm(`¿Cancelar ${pendingSelected.length} movimiento${pendingSelected.length > 1 ? 's' : ''} pendiente${pendingSelected.length > 1 ? 's' : ''}?`)) return;
    
    setIsDeleting(true);
    let cancelled = 0;
    
    try {
      for (const tx of pendingSelected) {
        try {
          const updated = await transactionsApi.cancel(tx.id);
          setTransactions(prev => prev.map(t => t.id === tx.id ? updated : t));
          cancelled++;
        } catch {
          // continuar con el siguiente
        }
      }
      
      setSelectedIds(new Set());
      toast.success(`${cancelled} movimiento${cancelled > 1 ? 's' : ''} cancelado${cancelled > 1 ? 's' : ''}`);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cancelar los movimientos');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEdit = (tx: Transaction) => {
    // Determinar si es recurrente de alguna forma
    const hasRecurrenceId = tx.recurrenceId && tx.isRecurrenceInstance;
    const isManualRecurrence = !tx.recurrenceId && tx.recurrence && tx.recurrence !== 'NONE';
    const isRecurrent = hasRecurrenceId || isManualRecurrence;
    
    // Si es una transacción recurrente y está pendiente, mostrar opciones
    if (isRecurrent && tx.status === 'PENDING') {
      setPendingEditTransaction(tx);
      setRecurrenceUpdateScope('THIS_ONLY');
      setVersionChangeReason('');
      setShowRecurrenceOptions(true);
      return;
    }
    
    // Si no es recurrente o ya está pagada/cancelada, editar directamente
    proceedWithEdit(tx);
  };

  // Función para duplicar un movimiento
  const handleDuplicate = (tx: Transaction) => {
    // Calcular nueva fecha: si es del pasado, usar hoy; si es futura, mantener
    const originalDate = new Date(tx.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Si la fecha original es pasada, usar el mismo día del próximo mes
    let newDate: Date;
    if (originalDate < today) {
      newDate = new Date(today);
      newDate.setMonth(newDate.getMonth() + 1);
      // Mantener el mismo día del mes si es posible
      const originalDay = originalDate.getDate();
      const maxDay = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate();
      newDate.setDate(Math.min(originalDay, maxDay));
    } else {
      // Si es futura, mantener la misma fecha
      newDate = new Date(originalDate);
    }
    
    const newDateStr = newDate.toISOString().split('T')[0];
    
    // Pre-rellenar el formulario con los datos del movimiento original
    setFormData({
      type: tx.type,
      description: tx.description || '',
      thirdPartyName: tx.thirdPartyName || '',
      thirdPartyId: tx.thirdPartyId,
      category: tx.category,
      amount: tx.amount,
      dueDate: newDateStr,
      companyId: tx.companyId,
      notes: tx.notes || '',
      invoiceNumber: '', // No copiar número de factura (será diferente)
      recurrence: 'NONE', // No duplicar la recurrencia
      certainty: tx.certainty || 'HIGH',
      recurrenceEndDate: '',
      recurrenceInstallments: '',
      supplierInvoiceNumber: '', // No copiar (será diferente)
      supplierBankAccount: tx.supplierBankAccount || '',
      paymentMethod: tx.paymentMethod || 'TRANSFER',
      chargeAccountId: tx.chargeAccountId || '',
    });
    
    // Abrir formulario como nuevo (no edición)
    setEditingTransaction(null);
    setIsDuplicating(true);
    setShowForm(true);
    
    toast.success('Datos copiados. Modifica lo necesario y guarda.');
  };

  // Función para proceder con la edición después de elegir scope
  const proceedWithEdit = (tx: Transaction) => {
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
      amount: tx.amount,
      dueDate: dueDateStr,
      companyId: tx.companyId,
      notes: tx.notes || '',
      invoiceNumber: tx.invoiceNumber || '',
      recurrence: tx.recurrence || 'NONE',
      certainty: tx.certainty || 'HIGH',
      recurrenceEndDate: '',
      recurrenceInstallments: '',
      supplierInvoiceNumber: tx.supplierInvoiceNumber || '',
      supplierBankAccount: tx.supplierBankAccount || '',
      paymentMethod: tx.paymentMethod || 'TRANSFER',
      chargeAccountId: tx.chargeAccountId || '',
    });
    setEditingTransaction(tx.id);
    setShowRecurrenceOptions(false);
    setPendingEditTransaction(null);
    setShowForm(true);
  };

  // Confirmar opción de edición de recurrencia
  const confirmRecurrenceEditOption = () => {
    if (!pendingEditTransaction) return;
    proceedWithEdit(pendingEditTransaction);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      if (editingTransaction) {
        // Buscar la transacción original para ver si es recurrente
        const originalTx = transactions.find(t => t.id === editingTransaction);
        
        // Determinar si es una actualización en cascada y cambió el importe
        const wantsCascade = recurrenceUpdateScope === 'THIS_AND_FUTURE' && 
          originalTx && originalTx.amount !== formData.amount;

        if (wantsCascade) {
          // Usar cascade-update para actualizar transacciones similares
          // Esto funciona tanto para transacciones con recurrenceId como sin él
          try {
            const result = await transactionsApi.cascadeUpdate({
              sourceTransactionId: editingTransaction,
              newAmount: formData.amount,
              effectiveFromDate: new Date(formData.dueDate),
              changeReason: versionChangeReason || 'Actualización de importe',
            });
            
            const updatedTransactions = await transactionsApi.getAll();
            setTransactions(updatedTransactions);
            toast.success(`Importe actualizado en ${result.updatedCount} transacciones`);
          } catch (error) {
            console.error('Error en cascade update:', error);
            toast.error('Error al actualizar las transacciones futuras');
            return;
          }
        } else {
          // Actualización normal (solo esta transacción)
          const updateData: Parameters<typeof transactionsApi.update>[1] = {
            type: formData.type,
            description: formData.description,
            thirdPartyName: formData.thirdPartyName,
            thirdPartyId: formData.thirdPartyId,
            category: formData.category,
            amount: formData.amount,
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
          };
          
          // Si es solo esta transacción y es recurrente, marcar como modificada manualmente
          if (originalTx?.recurrenceId && recurrenceUpdateScope === 'THIS_ONLY') {
            updateData.overriddenFromRecurrence = true;
          }
          
          const updated = await transactionsApi.update(editingTransaction, updateData);
          setTransactions(prev => prev.map(tx => 
            tx.id === editingTransaction ? updated : tx
          ));
          toast.success('Movimiento actualizado correctamente');
        }
      } else {
        const newTx = await transactionsApi.create({
          companyId: formData.companyId,
          type: formData.type,
          amount: formData.amount,
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
      setIsDuplicating(false);
      setRecurrenceUpdateScope('THIS_ONLY');
      setVersionChangeReason('');
      setFormData({
        type: 'EXPENSE',
        description: '',
        thirdPartyName: '',
        thirdPartyId: undefined,
        category: '',
        amount: 0,
        dueDate: '',
        companyId: '',
        notes: '',
        invoiceNumber: '',
        recurrence: 'NONE',
        certainty: 'HIGH',
        recurrenceEndDate: '',
        recurrenceInstallments: '',
        supplierInvoiceNumber: '',
        supplierBankAccount: '',
        paymentMethod: 'TRANSFER',
        chargeAccountId: '',
      });
    } catch (error) {
      console.error('Error guardando movimiento:', error);
      toast.error('Error al guardar el movimiento');
    } finally {
      setIsSubmitting(false);
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
            <Calendar size={16} className="text-gray-400" />
            <select
              value={filterHorizon}
              onChange={(e) => setFilterHorizon(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="1M">Próximo mes</option>
              <option value="3M">Próximos 3 meses</option>
              <option value="6M">Próximos 6 meses</option>
              <option value="12M">Próximo año</option>
              <option value="24M">Próximos 2 años</option>
              <option value="ALL">Todo el futuro</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={filterCompanyId}
              onChange={(e) => setFilterCompanyId(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="ALL">Todas las empresas</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={filterAccountId}
              onChange={(e) => setFilterAccountId(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="ALL">Todos los bancos</option>
              {filteredAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.bankName} - {a.alias}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={filterThirdPartyId}
              onChange={(e) => setFilterThirdPartyId(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="ALL">Todos los terceros</option>
              {uniqueThirdParties.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
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
        {/* Barra de acciones en grupo */}
        {selectedIds.size > 0 && (
          <div className="mb-4 p-3 bg-primary-50 border border-primary-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-primary-700 font-medium">
                {selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-primary-600 hover:text-primary-800 underline"
              >
                Deseleccionar todo
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancelSelected}
                disabled={isDeleting}
                className="px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <X size={14} />
                Cancelar seleccionados
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <Trash2 size={14} />
                {isDeleting ? 'Eliminando...' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3 font-medium w-10">
                  <input
                    type="checkbox"
                    checked={filteredTransactions.length > 0 && selectedIds.size === filteredTransactions.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                    title="Seleccionar todos"
                  />
                </th>
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
                <tr 
                  key={tx.id} 
                  className={`border-b last:border-0 transition-colors ${
                    selectedIds.has(tx.id) ? 'bg-primary-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="py-4 pl-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(tx.id)}
                      onChange={() => handleSelectOne(tx.id)}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                    />
                  </td>
                  <td className="py-4">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{tx.description}</p>
                        <p className="text-sm text-gray-500">{tx.thirdPartyName}</p>
                        {/* Indicador de recurrencia */}
                        {tx.recurrenceId && tx.isRecurrenceInstance && (
                          <p className={`text-xs mt-0.5 flex items-center gap-1 ${
                            tx.overriddenFromRecurrence ? 'text-amber-600' : 'text-purple-600'
                          }`}>
                            <Repeat size={10} />
                            {tx.overriddenFromRecurrence ? 'Modificada' : 'Recurrente'}
                          </p>
                        )}
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
                      <button
                        onClick={() => handleDuplicate(tx)}
                        className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                        title="Duplicar movimiento"
                      >
                        <Copy size={16} />
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
                      {tx.status === 'CANCELLED' && (
                        <button
                          onClick={() => handlePermanentDelete(tx.id, tx.description || tx.thirdPartyName || 'Sin descripción')}
                          className="p-2 text-red-700 hover:bg-red-100 rounded-lg transition-colors"
                          title="Eliminar definitivamente"
                        >
                          <Trash2 size={16} />
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
                {editingTransaction ? 'Editar Movimiento' : isDuplicating ? 'Duplicar Movimiento' : 'Nuevo Movimiento'}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingTransaction(null);
                  setIsDuplicating(false);
                  setFormData({
                    type: 'EXPENSE',
                    description: '',
                    thirdPartyName: '',
                    thirdPartyId: undefined,
                    category: '',
                    amount: 0,
                    dueDate: '',
                    companyId: '',
                    notes: '',
                    invoiceNumber: '',
                    recurrence: 'NONE',
                    certainty: 'HIGH',
                    recurrenceEndDate: '',
                    recurrenceInstallments: '',
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
                <CurrencyInput
                  label="Importe"
                  value={formData.amount}
                  onChange={(value) => setFormData({ ...formData, amount: value })}
                  placeholder="0,00"
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
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      recurrence: e.target.value as RecurrenceFrequency,
                      // Limpiar campos de fin de recurrencia si se cambia a NONE
                      ...(e.target.value === 'NONE' ? { recurrenceEndDate: '', recurrenceInstallments: '' } : {})
                    })}
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

              {/* Opciones de fin de recurrencia - solo visible cuando hay recurrencia */}
              {formData.recurrence !== 'NONE' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                  <p className="text-sm text-blue-700 font-medium">
                    📅 Duración de la recurrencia (opcional)
                  </p>
                  <p className="text-xs text-blue-600">
                    Dejar vacío para recurrencia indefinida
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Fecha fin
                      </label>
                      <input
                        type="date"
                        value={formData.recurrenceEndDate}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          recurrenceEndDate: e.target.value,
                          recurrenceInstallments: '' // Limpiar cuotas si se pone fecha
                        })}
                        min={formData.dueDate || undefined}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        disabled={!!formData.recurrenceInstallments}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Nº de cuotas
                      </label>
                      <input
                        type="number"
                        value={formData.recurrenceInstallments}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          recurrenceInstallments: e.target.value ? parseInt(e.target.value) : '',
                          recurrenceEndDate: '' // Limpiar fecha si se ponen cuotas
                        })}
                        min={1}
                        max={120}
                        placeholder="Ej: 6"
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        disabled={!!formData.recurrenceEndDate}
                      />
                    </div>
                  </div>
                  {formData.recurrenceInstallments && formData.dueDate && (
                    <p className="text-xs text-blue-600">
                      ℹ️ Se generarán {formData.recurrenceInstallments} {formData.type === 'INCOME' ? 'cobros' : 'pagos'}
                    </p>
                  )}
                </div>
              )}

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
                    setIsDuplicating(false);
                    setFormData({
                      type: 'EXPENSE',
                      description: '',
                      thirdPartyName: '',
                      thirdPartyId: undefined,
                      category: '',
                      amount: 0,
                      dueDate: '',
                      companyId: '',
                      notes: '',
                      invoiceNumber: '',
                      recurrence: 'NONE',
                      certainty: 'HIGH',
                      recurrenceEndDate: '',
                      recurrenceInstallments: '',
                      supplierInvoiceNumber: '',
                      supplierBankAccount: '',
                      paymentMethod: 'TRANSFER',
                      chargeAccountId: '',
                    });
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Guardando...' : (editingTransaction ? 'Guardar Cambios' : 'Crear Movimiento')}
                </Button>
              </div>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Modal de opciones de edición de recurrencia */}
      {showRecurrenceOptions && pendingEditTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <AlertCircle className="text-amber-500" size={24} />
                <h2 className="text-lg font-semibold text-gray-900">Editar Transacción Recurrente</h2>
              </div>
              <button
                onClick={() => {
                  setShowRecurrenceOptions(false);
                  setPendingEditTransaction(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-600">
                Esta transacción es parte de una serie recurrente. ¿Cómo deseas aplicar los cambios?
              </p>
              
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="recurrenceScope"
                    value="THIS_ONLY"
                    checked={recurrenceUpdateScope === 'THIS_ONLY'}
                    onChange={() => setRecurrenceUpdateScope('THIS_ONLY')}
                    className="mt-1"
                  />
                  <div>
                    <span className="font-medium text-gray-900">Solo esta transacción</span>
                    <p className="text-sm text-gray-500">
                      Los cambios solo afectarán a este movimiento específico
                    </p>
                  </div>
                </label>
                
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="recurrenceScope"
                    value="THIS_AND_FUTURE"
                    checked={recurrenceUpdateScope === 'THIS_AND_FUTURE'}
                    onChange={() => setRecurrenceUpdateScope('THIS_AND_FUTURE')}
                    className="mt-1"
                  />
                  <div>
                    <span className="font-medium text-gray-900">Esta y todas las futuras</span>
                    <p className="text-sm text-gray-500">
                      Crea una nueva versión del contrato/recurrencia a partir de esta fecha
                    </p>
                  </div>
                </label>
              </div>
              
              {recurrenceUpdateScope === 'THIS_AND_FUTURE' && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Motivo del cambio (opcional)
                  </label>
                  <input
                    type="text"
                    value={versionChangeReason}
                    onChange={(e) => setVersionChangeReason(e.target.value)}
                    placeholder="Ej: Actualización IPC, Ampliación contrato..."
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
              <Button
                variant="outline"
                onClick={() => {
                  setShowRecurrenceOptions(false);
                  setPendingEditTransaction(null);
                }}
              >
                Cancelar
              </Button>
              <Button onClick={confirmRecurrenceEditOption}>
                Continuar
              </Button>
            </div>
          </div>
        </div>
      )}

      <Toaster position="top-right" />
    </div>
  );
}
