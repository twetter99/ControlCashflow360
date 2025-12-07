'use client';

import React, { useState, useEffect } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { useCompanyFilter } from '@/contexts/CompanyFilterContext';
import { useAuth } from '@/contexts/AuthContext';
import { loansApi, companiesApi, accountsApi } from '@/lib/api-client';
import { Loan, Company, Account, LoanStatus } from '@/types';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Landmark,
  AlertTriangle,
  Calendar,
  X,
  RefreshCw,
  CheckCircle,
  Clock,
  XCircle
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface CompanyOption {
  id: string;
  name: string;
}

interface AccountOption {
  id: string;
  name: string;
  companyId: string;
}

interface LoanFormData {
  bankName: string;
  alias: string;
  companyId: string;
  originalPrincipal: string;
  interestRate: string;
  monthlyPayment: string;
  paymentDay: string;
  chargeAccountId: string;
  remainingBalance: string;
  remainingInstallments: string;
  firstPendingDate: string;
  notes: string;
}

const initialFormData: LoanFormData = {
  bankName: '',
  alias: '',
  companyId: '',
  originalPrincipal: '',
  interestRate: '',
  monthlyPayment: '',
  paymentDay: '1',
  chargeAccountId: '',
  remainingBalance: '',
  remainingInstallments: '',
  firstPendingDate: '',
  notes: '',
};

export default function LoansPage() {
  const { selectedCompanyId } = useCompanyFilter();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingLoan, setEditingLoan] = useState<string | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [formData, setFormData] = useState<LoanFormData>(initialFormData);

  // Cargar datos via API
  useEffect(() => {
    if (!user) return;
    
    const loadData = async () => {
      try {
        setLoading(true);
        const [loansData, companiesData, accountsData] = await Promise.all([
          loansApi.getAll(),
          companiesApi.getAll(),
          accountsApi.getAll()
        ]);
        setLoans(loansData);
        setCompanies(companiesData.map((c: Company) => ({ id: c.id, name: c.name })));
        setAccounts(accountsData.map((a: Account) => ({ 
          id: a.id, 
          name: `${a.bankName} - ${a.alias}`,
          companyId: a.companyId 
        })));
      } catch (error: unknown) {
        console.error('Error cargando datos:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        if (!errorMessage.includes('index') && !errorMessage.includes('permission')) {
          toast.error('Error al cargar los préstamos');
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [user]);

  // Filtrar por empresa
  const filteredLoans = selectedCompanyId
    ? loans.filter((loan) => loan.companyId === selectedCompanyId)
    : loans;

  // Filtrar cuentas por empresa seleccionada en el formulario
  const filteredAccounts = formData.companyId
    ? accounts.filter(a => a.companyId === formData.companyId)
    : accounts;

  // Calcular totales
  const activeLoans = filteredLoans.filter(l => l.status === 'ACTIVE');
  const totalOriginalPrincipal = activeLoans.reduce((sum, l) => sum + l.originalPrincipal, 0);
  const totalRemainingBalance = activeLoans.reduce((sum, l) => sum + l.remainingBalance, 0);
  const totalMonthlyPayments = activeLoans.reduce((sum, l) => sum + l.monthlyPayment, 0);

  const getStatusColor = (status: LoanStatus) => {
    switch (status) {
      case 'ACTIVE': return 'bg-blue-100 text-blue-800';
      case 'PAID_OFF': return 'bg-green-100 text-green-800';
      case 'DEFAULTED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: LoanStatus) => {
    switch (status) {
      case 'ACTIVE': return <Clock size={12} className="mr-1" />;
      case 'PAID_OFF': return <CheckCircle size={12} className="mr-1" />;
      case 'DEFAULTED': return <XCircle size={12} className="mr-1" />;
      default: return null;
    }
  };

  const getStatusLabel = (status: LoanStatus) => {
    switch (status) {
      case 'ACTIVE': return 'Activo';
      case 'PAID_OFF': return 'Liquidado';
      case 'DEFAULTED': return 'Impagado';
      default: return status;
    }
  };

  const getProgressColor = (paidInstallments: number, totalInstallments: number) => {
    const progress = paidInstallments / totalInstallments;
    if (progress >= 0.75) return 'bg-green-500';
    if (progress >= 0.5) return 'bg-blue-500';
    if (progress >= 0.25) return 'bg-yellow-500';
    return 'bg-gray-400';
  };

  const isEndingSoon = (endDate: Date) => {
    const daysUntilEnd = Math.ceil((endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilEnd <= 90 && daysUntilEnd > 0;
  };

  // Obtener nombre de empresa
  const getCompanyName = (companyId: string) => {
    return companies.find(c => c.id === companyId)?.name || 'Sin empresa';
  };

  // Obtener nombre de cuenta
  const getAccountName = (accountId?: string) => {
    if (!accountId) return 'Sin asignar';
    return accounts.find(a => a.id === accountId)?.name || 'Cuenta no encontrada';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      const firstPendingDate = new Date(formData.firstPendingDate);
      
      if (editingLoan) {
        const updated = await loansApi.update(editingLoan, {
          bankName: formData.bankName,
          alias: formData.alias || undefined,
          companyId: formData.companyId,
          originalPrincipal: parseFloat(formData.originalPrincipal) || 0,
          interestRate: parseFloat(formData.interestRate),
          monthlyPayment: parseFloat(formData.monthlyPayment),
          paymentDay: parseInt(formData.paymentDay),
          chargeAccountId: formData.chargeAccountId || undefined,
          remainingBalance: parseFloat(formData.remainingBalance),
          remainingInstallments: parseInt(formData.remainingInstallments),
          firstPendingDate,
          notes: formData.notes || undefined,
        });
        setLoans(prev => prev.map(l => l.id === editingLoan ? updated : l));
        toast.success('Préstamo actualizado correctamente');
      } else {
        const response = await loansApi.create({
          companyId: formData.companyId,
          bankName: formData.bankName,
          alias: formData.alias || undefined,
          originalPrincipal: parseFloat(formData.originalPrincipal) || 0,
          interestRate: parseFloat(formData.interestRate),
          monthlyPayment: parseFloat(formData.monthlyPayment),
          paymentDay: parseInt(formData.paymentDay),
          chargeAccountId: formData.chargeAccountId || undefined,
          remainingBalance: parseFloat(formData.remainingBalance),
          remainingInstallments: parseInt(formData.remainingInstallments),
          firstPendingDate,
          notes: formData.notes || undefined,
        });
        setLoans(prev => [...prev, response.loan]);
        toast.success(`Préstamo creado correctamente. Se han generado ${response.transactionsCreated} cuotas.`);
      }
      
      setShowForm(false);
      setEditingLoan(null);
      setFormData(initialFormData);
    } catch (error) {
      console.error('Error guardando préstamo:', error);
      toast.error('Error al guardar el préstamo');
    }
  };

  const handleEdit = (loan: Loan) => {
    setFormData({
      bankName: loan.bankName,
      alias: loan.alias || '',
      companyId: loan.companyId,
      originalPrincipal: loan.originalPrincipal.toString(),
      interestRate: loan.interestRate.toString(),
      monthlyPayment: loan.monthlyPayment.toString(),
      paymentDay: loan.paymentDay.toString(),
      chargeAccountId: loan.chargeAccountId || '',
      remainingBalance: loan.remainingBalance.toString(),
      remainingInstallments: loan.remainingInstallments.toString(),
      firstPendingDate: loan.firstPendingDate instanceof Date 
        ? loan.firstPendingDate.toISOString().split('T')[0]
        : new Date(loan.firstPendingDate).toISOString().split('T')[0],
      notes: loan.notes || '',
    });
    setEditingLoan(loan.id);
    setShowForm(true);
  };

  const handleDelete = async (loanId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este préstamo? También se eliminarán todas las cuotas pendientes asociadas.')) return;
    
    try {
      const result = await loansApi.delete(loanId);
      setLoans(prev => prev.filter(l => l.id !== loanId));
      toast.success(`Préstamo eliminado. Se eliminaron ${result.transactionsDeleted} cuotas asociadas.`);
    } catch (error) {
      console.error('Error eliminando préstamo:', error);
      toast.error('Error al eliminar el préstamo');
    }
  };

  const handleRegenerateInstallments = async (loanId: string) => {
    if (!confirm('¿Regenerar las cuotas pendientes de este préstamo? Las cuotas ya pagadas se mantendrán.')) return;
    
    try {
      setRegenerating(loanId);
      const updated = await loansApi.regenerateInstallments(loanId);
      setLoans(prev => prev.map(l => l.id === loanId ? updated : l));
      toast.success('Cuotas regeneradas correctamente');
    } catch (error) {
      console.error('Error regenerando cuotas:', error);
      toast.error('Error al regenerar las cuotas');
    } finally {
      setRegenerating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Préstamos</h1>
          <p className="text-gray-500 mt-1">
            Gestiona préstamos bancarios y sus cuotas de amortización
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={18} className="mr-2" />
          Nuevo Préstamo
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Préstamos Activos</p>
            <p className="text-2xl font-bold text-gray-900">{activeLoans.length}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Capital Original</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalOriginalPrincipal)}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Saldo Pendiente</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totalRemainingBalance)}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Cuota Mensual Total</p>
            <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalMonthlyPayments)}</p>
          </div>
        </Card>
      </div>

      {/* Lista de préstamos */}
      <Card title="Listado de Préstamos">
        {filteredLoans.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Landmark size={48} className="mx-auto mb-4 opacity-50" />
            <p>No hay préstamos registrados</p>
            <p className="text-sm mt-2">Haz clic en &quot;Nuevo Préstamo&quot; para añadir uno</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredLoans.map((loan) => {
              const currentRemaining = loan.remainingInstallments - loan.paidInstallments;
              const progressPercent = (loan.paidInstallments / loan.remainingInstallments) * 100;
              
              return (
                <div
                  key={loan.id}
                  className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mr-4">
                        <Landmark className="text-primary-600" size={24} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{loan.bankName}</h3>
                        {loan.alias && <p className="text-sm text-gray-500">{loan.alias}</p>}
                        <p className="text-xs text-gray-400 mt-1">{getCompanyName(loan.companyId)}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(loan.status)}`}>
                        {getStatusIcon(loan.status)}
                        {getStatusLabel(loan.status)}
                      </span>
                      {loan.status === 'ACTIVE' && isEndingSoon(loan.endDate instanceof Date ? loan.endDate : new Date(loan.endDate)) && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          <Calendar size={12} className="mr-1" />
                          Vence pronto
                        </span>
                      )}
                      {loan.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleRegenerateInstallments(loan.id)}
                          disabled={regenerating === loan.id}
                          className="p-2 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                          title="Regenerar cuotas"
                        >
                          <RefreshCw size={16} className={regenerating === loan.id ? 'animate-spin' : ''} />
                        </button>
                      )}
                      <button
                        onClick={() => handleEdit(loan)}
                        className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                        title="Editar"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(loan.id)}
                        className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500">
                        Cuotas pagadas: {loan.paidInstallments} / {loan.remainingInstallments} ({progressPercent.toFixed(0)}%)
                      </span>
                      <span className="text-gray-500">
                        Quedan {currentRemaining} cuotas
                      </span>
                    </div>
                    <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getProgressColor(loan.paidInstallments, loan.remainingInstallments)}`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Detalles */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Capital Original</p>
                      <p className="font-semibold text-gray-900">{loan.originalPrincipal > 0 ? formatCurrency(loan.originalPrincipal) : '-'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Saldo Pendiente</p>
                      <p className="font-semibold text-red-600">{formatCurrency(loan.remainingBalance)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Cuota Mensual</p>
                      <p className="font-semibold text-amber-600">{formatCurrency(loan.monthlyPayment)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Día de Pago</p>
                      <p className="font-semibold text-gray-900">Día {loan.paymentDay}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Interés Anual</p>
                      <p className="font-semibold text-gray-900">{loan.interestRate}%</p>
                    </div>
                  </div>

                  {/* Segunda fila de detalles */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mt-3 pt-3 border-t">
                    <div>
                      <p className="text-gray-500">Primera Cuota Pendiente</p>
                      <p className="font-semibold text-gray-900">
                        {formatDate(loan.firstPendingDate instanceof Date ? loan.firstPendingDate : new Date(loan.firstPendingDate))}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Fecha Fin</p>
                      <p className="font-semibold text-gray-900">
                        {formatDate(loan.endDate instanceof Date ? loan.endDate : new Date(loan.endDate))}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Cuenta de Cargo</p>
                      <p className="font-semibold text-gray-900">{getAccountName(loan.chargeAccountId)}</p>
                    </div>
                  </div>

                  {loan.notes && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-gray-500">Notas: {loan.notes}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Modal de formulario */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
          <div className="min-h-full flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingLoan ? 'Editar Préstamo' : 'Nuevo Préstamo'}
                </h2>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setEditingLoan(null);
                    setFormData(initialFormData);
                  }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Banco / Entidad"
                  value={formData.bankName}
                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                  placeholder="BBVA, Santander, CaixaBank..."
                  required
                />
                <Input
                  label="Alias / Descripción"
                  value={formData.alias}
                  onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                  placeholder="Préstamo Maquinaria"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Empresa *</label>
                <select
                  value={formData.companyId}
                  onChange={(e) => setFormData({ ...formData, companyId: e.target.value, chargeAccountId: '' })}
                  className="w-full border rounded-lg px-4 py-3"
                  required
                >
                  <option value="">Selecciona una empresa</option>
                  {companies.map(company => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              </div>

              {/* Sección: Datos del préstamo (informativos) */}
              <div className="border-t pt-4 mt-2">
                <h3 className="text-sm font-semibold text-gray-600 mb-3">Datos del préstamo</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Capital Original (informativo)"
                    type="number"
                    value={formData.originalPrincipal}
                    onChange={(e) => setFormData({ ...formData, originalPrincipal: e.target.value })}
                    step="0.01"
                    min="0"
                    placeholder="60000.00"
                  />
                  <Input
                    label="Interés Anual (%)"
                    type="number"
                    value={formData.interestRate}
                    onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                    step="0.01"
                    min="0"
                    placeholder="4.5"
                    required
                  />
                </div>
              </div>

              {/* Sección: Situación actual (operativo) */}
              <div className="border-t pt-4 mt-2">
                <h3 className="text-sm font-semibold text-gray-600 mb-3">Situación actual del préstamo</h3>
                <div className="grid grid-cols-3 gap-4">
                  <Input
                    label="Saldo Pendiente Actual *"
                    type="number"
                    value={formData.remainingBalance}
                    onChange={(e) => setFormData({ ...formData, remainingBalance: e.target.value })}
                    step="0.01"
                    min="0"
                    placeholder="38500.00"
                    required
                  />
                  <Input
                    label="Cuota Mensual *"
                    type="number"
                    value={formData.monthlyPayment}
                    onChange={(e) => setFormData({ ...formData, monthlyPayment: e.target.value })}
                    step="0.01"
                    min="0"
                    placeholder="1100.00"
                    required
                  />
                  <Input
                    label="Cuotas Restantes *"
                    type="number"
                    value={formData.remainingInstallments}
                    onChange={(e) => setFormData({ ...formData, remainingInstallments: e.target.value })}
                    step="1"
                    min="1"
                    placeholder="35"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Fecha Primera Cuota Pendiente *"
                  type="date"
                  value={formData.firstPendingDate}
                  onChange={(e) => setFormData({ ...formData, firstPendingDate: e.target.value })}
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Día de Pago *</label>
                  <select
                    value={formData.paymentDay}
                    onChange={(e) => setFormData({ ...formData, paymentDay: e.target.value })}
                    className="w-full border rounded-lg px-4 py-3"
                    required
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                      <option key={day} value={day}>Día {day}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta de Cargo</label>
                <select
                  value={formData.chargeAccountId}
                  onChange={(e) => setFormData({ ...formData, chargeAccountId: e.target.value })}
                  className="w-full border rounded-lg px-4 py-3"
                  disabled={!formData.companyId}
                >
                  <option value="">Selecciona una cuenta (opcional)</option>
                  {filteredAccounts.map(account => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
                {!formData.companyId && (
                  <p className="text-xs text-gray-500 mt-1">Selecciona una empresa primero</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border rounded-lg px-4 py-3"
                  rows={2}
                  placeholder="Notas adicionales sobre el préstamo..."
                />
              </div>

              {!editingLoan && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>Nota:</strong> Al crear el préstamo, se generarán automáticamente las cuotas mensuales 
                    como transacciones de tipo GASTO en la categoría &quot;Préstamo&quot;.
                  </p>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingLoan(null);
                    setFormData(initialFormData);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingLoan ? 'Guardar Cambios' : 'Crear Préstamo'}
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
