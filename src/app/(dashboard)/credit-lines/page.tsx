'use client';

import React, { useState, useEffect } from 'react';
import { Button, Card, Input, CurrencyInput } from '@/components/ui';
import { useCompanyFilter } from '@/contexts/CompanyFilterContext';
import { useAuth } from '@/contexts/AuthContext';
import { creditLinesApi, companiesApi } from '@/lib/api-client';
import { CreditLine, CreditLineType, Company } from '@/types';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  CreditCard,
  AlertTriangle,
  Calendar,
  X
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface CompanyOption {
  id: string;
  name: string;
}

interface CreditLineFormData {
  bankName: string;
  alias: string;
  companyId: string;
  lineType: CreditLineType;
  creditLimit: number;
  currentDrawn: number;
  interestRate: string;
  expiryDate: string;
}

export default function CreditLinesPage() {
  const { selectedCompanyId } = useCompanyFilter();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [creditLines, setCreditLines] = useState<CreditLine[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<CreditLineFormData>({
    bankName: '',
    alias: '',
    companyId: '',
    lineType: 'CREDIT',
    creditLimit: 0,
    currentDrawn: 0,
    interestRate: '',
    expiryDate: '',
  });

  // Cargar datos via API
  useEffect(() => {
    if (!user) return;
    
    const loadData = async () => {
      try {
        setLoading(true);
        const [linesData, companiesData] = await Promise.all([
          creditLinesApi.getAll(),
          companiesApi.getAll()
        ]);
        setCreditLines(linesData);
        setCompanies(companiesData.map((c: Company) => ({ id: c.id, name: c.name })));
      } catch (error: unknown) {
        console.error('Error cargando datos:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        if (!errorMessage.includes('index') && !errorMessage.includes('permission')) {
          toast.error('Error al cargar las pólizas');
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [user]);

  // Filtrar por empresa
  const filteredLines = selectedCompanyId
    ? creditLines.filter((cl) => cl.companyId === selectedCompanyId)
    : creditLines;

  // Separar por tipo
  const creditPolizas = filteredLines.filter(cl => cl.lineType !== 'DISCOUNT');
  const discountPolizas = filteredLines.filter(cl => cl.lineType === 'DISCOUNT');

  // Calcular totales (solo pólizas de crédito para el resumen principal)
  const totalLimit = creditPolizas.reduce((sum, cl) => sum + cl.creditLimit, 0);
  const totalAvailable = creditPolizas.reduce((sum, cl) => sum + cl.available, 0);
  const totalDrawn = creditPolizas.reduce((sum, cl) => sum + cl.currentDrawn, 0);
  
  // Totales de descuento (informativo)
  const discountLimit = discountPolizas.reduce((sum, cl) => sum + cl.creditLimit, 0);
  const discountDrawn = discountPolizas.reduce((sum, cl) => sum + cl.currentDrawn, 0);

  // Función helper para asegurar que tenemos un objeto Date válido
  const toDate = (value: Date | string | undefined): Date => {
    if (!value) return new Date();
    if (value instanceof Date) return value;
    return new Date(value);
  };

  const isExpiringSoon = (date: Date | string) => {
    const dateObj = toDate(date);
    const daysUntilExpiry = Math.ceil((dateObj.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 90;
  };

  const isLowAvailable = (available: number, limit: number) => {
    return available / limit < 0.2;
  };

  const getUtilizationColor = (drawn: number, limit: number) => {
    const utilization = drawn / limit;
    if (utilization > 0.8) return 'bg-red-500';
    if (utilization > 0.5) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Obtener nombre de empresa
  const getCompanyName = (companyId: string) => {
    return companies.find(c => c.id === companyId)?.name || 'Sin empresa';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      const expiryDate = new Date(formData.expiryDate);
      const creditLimit = formData.creditLimit;
      const currentDrawn = formData.currentDrawn;
      const interestRate = parseFloat(formData.interestRate) || 0;
      
      // Validaciones básicas
      if (creditLimit <= 0) {
        toast.error('El límite de crédito debe ser mayor a 0');
        return;
      }
      
      if (!formData.companyId) {
        toast.error('Debe seleccionar una empresa');
        return;
      }
      
      if (!formData.bankName.trim()) {
        toast.error('El nombre del banco es requerido');
        return;
      }
      
      if (isNaN(expiryDate.getTime())) {
        toast.error('La fecha de vencimiento no es válida');
        return;
      }
      
      if (editingLine) {
        const updated = await creditLinesApi.update(editingLine, {
          bankName: formData.bankName.trim(),
          alias: formData.alias.trim(),
          companyId: formData.companyId,
          lineType: formData.lineType,
          creditLimit,
          currentDrawn,
          interestRate,
          expiryDate,
        });
        setCreditLines(prev => prev.map(cl => 
          cl.id === editingLine ? updated : cl
        ));
        toast.success('Póliza actualizada correctamente');
      } else {
        const newLine = await creditLinesApi.create({
          companyId: formData.companyId,
          bankName: formData.bankName.trim(),
          alias: formData.alias.trim(),
          lineType: formData.lineType,
          creditLimit,
          currentDrawn,
          available: creditLimit - currentDrawn,
          interestRate,
          expiryDate,
          status: 'ACTIVE',
        });
        setCreditLines(prev => [...prev, newLine]);
        toast.success('Póliza creada correctamente');
      }
      
      setShowForm(false);
      setEditingLine(null);
      setFormData({
        bankName: '',
        alias: '',
        companyId: '',
        lineType: 'CREDIT',
        creditLimit: 0,
        currentDrawn: 0,
        interestRate: '',
        expiryDate: '',
      });
    } catch (error) {
      console.error('Error guardando póliza:', error);
      toast.error('Error al guardar la póliza');
    }
  };

  const handleEdit = (line: CreditLine) => {
    setFormData({
      bankName: line.bankName,
      alias: line.alias || '',
      companyId: line.companyId,
      lineType: line.lineType || 'CREDIT',
      creditLimit: line.creditLimit,
      currentDrawn: line.currentDrawn,
      interestRate: line.interestRate.toString(),
      expiryDate: toDate(line.expiryDate).toISOString().split('T')[0],
    });
    setEditingLine(line.id);
    setShowForm(true);
  };

  const handleDelete = async (lineId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta póliza?')) return;
    
    try {
      await creditLinesApi.delete(lineId);
      setCreditLines(prev => prev.filter(cl => cl.id !== lineId));
      toast.success('Póliza eliminada correctamente');
    } catch (error) {
      console.error('Error eliminando póliza:', error);
      toast.error('Error al eliminar la póliza');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pólizas de Crédito</h1>
          <p className="text-gray-500 mt-1">
            Gestiona las líneas de crédito y pólizas bancarias
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={18} className="mr-2" />
          Nueva Póliza
        </Button>
      </div>

      {/* Resumen - Pólizas de Crédito */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Límite Crédito</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalLimit)}</p>
            <p className="text-xs text-gray-400 mt-1">{creditPolizas.length} pólizas</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Dispuesto</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totalDrawn)}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Disponible</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalAvailable)}</p>
            <p className="text-xs text-green-600 mt-1">Suma al dashboard</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">% Utilización</p>
            <p className="text-2xl font-bold text-gray-900">
              {totalLimit > 0 ? ((totalDrawn / totalLimit) * 100).toFixed(1) : 0}%
            </p>
          </div>
        </Card>
      </div>

      {/* Resumen - Pólizas de Descuento (si existen) */}
      {discountPolizas.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pólizas de Descuento</p>
              <p className="text-xs text-gray-400">{discountPolizas.length} pólizas • No suman a liquidez</p>
            </div>
            <div className="flex items-center gap-6 text-right">
              <div>
                <p className="text-xs text-gray-500">Límite</p>
                <p className="font-semibold text-gray-700">{formatCurrency(discountLimit)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Descontado</p>
                <p className="font-semibold text-gray-700">{formatCurrency(discountDrawn)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Disponible</p>
                <p className="font-semibold text-gray-500">{formatCurrency(discountLimit - discountDrawn)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lista de pólizas */}
      <Card title="Listado de Pólizas">
        <div className="space-y-4">
          {filteredLines.map((line) => {
            const utilizationPercent = (line.currentDrawn / line.creditLimit) * 100;
            
            return (
              <div
                key={line.id}
                className="border rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mr-4">
                      <CreditCard className="text-primary-600" size={24} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{line.bankName}</h3>
                      <p className="text-sm text-gray-500">{line.alias}</p>
                      <p className="text-xs text-gray-400 mt-1">{getCompanyName(line.companyId)}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {line.lineType === 'DISCOUNT' && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        Descuento
                      </span>
                    )}
                    {isExpiringSoon(line.expiryDate) && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        <Calendar size={12} className="mr-1" />
                        Vence {formatDate(line.expiryDate)}
                      </span>
                    )}
                    {isLowAvailable(line.available, line.creditLimit) && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <AlertTriangle size={12} className="mr-1" />
                        Disponible bajo
                      </span>
                    )}
                    <button
                      onClick={() => handleEdit(line)}
                      className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                      title="Editar"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(line.id)}
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
                    <span className="text-gray-500">Utilización: {utilizationPercent.toFixed(1)}%</span>
                    <span className="text-gray-500">
                      {formatCurrency(line.currentDrawn)} / {formatCurrency(line.creditLimit)}
                    </span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${getUtilizationColor(line.currentDrawn, line.creditLimit)}`}
                      style={{ width: `${utilizationPercent}%` }}
                    />
                  </div>
                </div>

                {/* Detalles */}
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Disponible</p>
                    <p className="font-semibold text-green-600">{formatCurrency(line.available)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Tipo de interés</p>
                    <p className="font-semibold text-gray-900">{line.interestRate}%</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Vencimiento</p>
                    <p className="font-semibold text-gray-900">{formatDate(line.expiryDate)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Modal de formulario */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">
                {editingLine ? 'Editar Póliza' : 'Nueva Póliza'}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingLine(null);
                  setFormData({
                    bankName: '',
                    alias: '',
                    companyId: '',
                    lineType: 'CREDIT',
                    creditLimit: 0,
                    currentDrawn: 0,
                    interestRate: '',
                    expiryDate: '',
                  });
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
                placeholder="Póliza Principal"
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Póliza</label>
                <select
                  value={formData.lineType}
                  onChange={(e) => setFormData({ ...formData, lineType: e.target.value as CreditLineType })}
                  className="w-full border rounded-lg px-4 py-3"
                  required
                >
                  <option value="CREDIT">Crédito (disponibilidad inmediata)</option>
                  <option value="DISCOUNT">Descuento (solo pagarés/efectos)</option>
                </select>
                {formData.lineType === 'DISCOUNT' && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ Las pólizas de descuento no suman al saldo disponible del dashboard
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <CurrencyInput
                  label="Límite de Crédito"
                  value={formData.creditLimit}
                  onChange={(value) => setFormData({ ...formData, creditLimit: value })}
                  placeholder="100.000,00"
                  required
                />
                <CurrencyInput
                  label="Dispuesto Actual"
                  value={formData.currentDrawn}
                  onChange={(value) => setFormData({ ...formData, currentDrawn: value })}
                  placeholder="0,00"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Tipo de Interés (%)"
                  type="number"
                  value={formData.interestRate}
                  onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                  step="0.01"
                  placeholder="4.5"
                />
                <Input
                  label="Fecha de Vencimiento"
                  type="date"
                  value={formData.expiryDate}
                  onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                  required
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingLine(null);
                    setFormData({
                      bankName: '',
                      alias: '',
                      companyId: '',
                      lineType: 'CREDIT',
                      creditLimit: 0,
                      currentDrawn: 0,
                      interestRate: '',
                      expiryDate: '',
                    });
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingLine ? 'Guardar Cambios' : 'Crear Póliza'}
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
