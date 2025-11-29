'use client';

import React, { useState, useEffect } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { useCompanyFilter } from '@/contexts/CompanyFilterContext';
import { useAuth } from '@/contexts/AuthContext';
import { creditLinesApi, companiesApi } from '@/lib/api-client';
import { CreditLine, Company } from '@/types';
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
  creditLimit: string;
  currentDrawn: string;
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
    creditLimit: '',
    currentDrawn: '0',
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

  // Calcular totales
  const totalLimit = filteredLines.reduce((sum, cl) => sum + cl.creditLimit, 0);
  const totalAvailable = filteredLines.reduce((sum, cl) => sum + cl.available, 0);
  const totalDrawn = filteredLines.reduce((sum, cl) => sum + cl.currentDrawn, 0);

  const isExpiringSoon = (date: Date) => {
    const daysUntilExpiry = Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
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
      const creditLimit = parseFloat(formData.creditLimit);
      const currentDrawn = parseFloat(formData.currentDrawn || '0');
      
      if (editingLine) {
        const updated = await creditLinesApi.update(editingLine, {
          bankName: formData.bankName,
          alias: formData.alias,
          companyId: formData.companyId,
          creditLimit,
          currentDrawn,
          interestRate: parseFloat(formData.interestRate),
          expiryDate,
        });
        setCreditLines(prev => prev.map(cl => 
          cl.id === editingLine ? updated : cl
        ));
        toast.success('Póliza actualizada correctamente');
      } else {
        const newLine = await creditLinesApi.create({
          companyId: formData.companyId,
          bankName: formData.bankName,
          alias: formData.alias,
          creditLimit,
          currentDrawn,
          available: creditLimit - currentDrawn,
          interestRate: parseFloat(formData.interestRate),
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
        creditLimit: '',
        currentDrawn: '0',
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
      creditLimit: line.creditLimit.toString(),
      currentDrawn: line.currentDrawn.toString(),
      interestRate: line.interestRate.toString(),
      expiryDate: line.expiryDate.toISOString().split('T')[0],
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

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Límite Total</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalLimit)}</p>
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
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">% Utilización</p>
            <p className="text-2xl font-bold text-gray-900">
              {((totalDrawn / totalLimit) * 100).toFixed(1)}%
            </p>
          </div>
        </Card>
      </div>

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
                    creditLimit: '',
                    currentDrawn: '0',
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
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Límite de Crédito"
                  type="number"
                  value={formData.creditLimit}
                  onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                  step="0.01"
                  placeholder="100000.00"
                  required
                />
                <Input
                  label="Dispuesto Actual"
                  type="number"
                  value={formData.currentDrawn}
                  onChange={(e) => setFormData({ ...formData, currentDrawn: e.target.value })}
                  step="0.01"
                  placeholder="0.00"
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
                      creditLimit: '',
                      currentDrawn: '0',
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
