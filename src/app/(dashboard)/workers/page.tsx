'use client';

import React, { useState, useEffect } from 'react';
import { Button, Card, Input, IBANInput, CurrencyInput } from '@/components/ui';
import { useCompanyFilter } from '@/contexts/CompanyFilterContext';
import { useAuth } from '@/contexts/AuthContext';
import { workersApi, companiesApi } from '@/lib/api-client';
import { Worker, Company, EntityStatus } from '@/types';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Plus, 
  Search,
  Edit2,
  Trash2,
  UserCheck,
  UserX,
  X,
  Users,
  Building2,
  CreditCard,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { formatCurrency, formatIBAN } from '@/lib/utils';

interface WorkerFormData {
  companyId: string;
  displayName: string;
  identifier: string;
  alias: string;
  iban: string;
  bankAlias: string;
  defaultAmount: number;
  defaultExtraAmount: number;
  numberOfPayments: number;
  extrasProrated: boolean;
  notes: string;
}

export default function WorkersPage() {
  const { selectedCompanyId } = useCompanyFilter();
  const { user } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingWorker, setEditingWorker] = useState<string | null>(null);
  const [filterCompanyId, setFilterCompanyId] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<EntityStatus | 'ALL'>('ACTIVE');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIBANValid, setIsIBANValid] = useState(true);
  
  const [formData, setFormData] = useState<WorkerFormData>({
    companyId: '',
    displayName: '',
    identifier: '',
    alias: '',
    iban: '',
    bankAlias: '',
    defaultAmount: 0,
    defaultExtraAmount: 0,
    numberOfPayments: 14,
    extrasProrated: false,
    notes: '',
  });

  // Cargar datos
  useEffect(() => {
    if (!user) return;
    
    const loadData = async () => {
      try {
        setLoading(true);
        const [workersData, companiesData] = await Promise.all([
          workersApi.getAll(),
          companiesApi.getAll()
        ]);
        setWorkers(workersData);
        setCompanies(companiesData);
      } catch (error: unknown) {
        console.error('Error cargando datos:', error);
        toast.error('Error al cargar los trabajadores');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [user]);

  // Filtrar trabajadores
  let filteredWorkers = workers;
  
  const effectiveCompanyFilter = filterCompanyId !== 'ALL' ? filterCompanyId : selectedCompanyId;
  
  if (effectiveCompanyFilter) {
    filteredWorkers = filteredWorkers.filter(w => w.companyId === effectiveCompanyFilter);
  }
  if (filterStatus !== 'ALL') {
    filteredWorkers = filteredWorkers.filter(w => w.status === filterStatus);
  }
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filteredWorkers = filteredWorkers.filter(
      w => 
        w.displayName.toLowerCase().includes(term) ||
        (w.identifier || '').toLowerCase().includes(term) ||
        (w.alias || '').toLowerCase().includes(term)
    );
  }

  // Estadísticas
  const activeCount = workers.filter(w => w.status === 'ACTIVE').length;
  const inactiveCount = workers.filter(w => w.status === 'INACTIVE').length;
  const withIBANCount = workers.filter(w => w.iban && w.iban.trim() !== '').length;
  const withoutIBANCount = workers.filter(w => !w.iban || w.iban.trim() === '').length;

  const getCompanyName = (companyId: string) => {
    const company = companies.find(c => c.id === companyId);
    return company?.name || 'Empresa desconocida';
  };

  const handleEdit = (worker: Worker) => {
    setFormData({
      companyId: worker.companyId,
      displayName: worker.displayName,
      identifier: worker.identifier || '',
      alias: worker.alias || '',
      iban: worker.iban || '',
      bankAlias: worker.bankAlias || '',
      defaultAmount: worker.defaultAmount || 0,
      defaultExtraAmount: worker.defaultExtraAmount || 0,
      numberOfPayments: worker.numberOfPayments || 14,
      extrasProrated: worker.extrasProrated || false,
      notes: worker.notes || '',
    });
    setEditingWorker(worker.id);
    setShowForm(true);
  };

  const handleDeactivate = async (worker: Worker) => {
    if (!confirm(`¿Desactivar a "${worker.displayName}"? No aparecerá en nuevos lotes de nóminas.`)) return;
    
    try {
      await workersApi.deactivate(worker.id);
      setWorkers(prev => prev.map(w => 
        w.id === worker.id ? { ...w, status: 'INACTIVE' as EntityStatus } : w
      ));
      toast.success('Trabajador desactivado');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al desactivar el trabajador');
    }
  };

  const handleReactivate = async (worker: Worker) => {
    try {
      await workersApi.reactivate(worker.id);
      setWorkers(prev => prev.map(w => 
        w.id === worker.id ? { ...w, status: 'ACTIVE' as EntityStatus } : w
      ));
      toast.success('Trabajador reactivado');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al reactivar el trabajador');
    }
  };

  const handleDelete = async (worker: Worker) => {
    if (!confirm(`¿ELIMINAR definitivamente a "${worker.displayName}"?\n\nSi tiene historial de pagos, se desactivará en lugar de eliminarse.`)) return;
    
    try {
      const result = await workersApi.delete(worker.id);
      if (result.message.includes('desactivado')) {
        setWorkers(prev => prev.map(w => 
          w.id === worker.id ? { ...w, status: 'INACTIVE' as EntityStatus } : w
        ));
        toast.success('Trabajador desactivado (tiene historial de pagos)');
      } else {
        setWorkers(prev => prev.filter(w => w.id !== worker.id));
        toast.success('Trabajador eliminado');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al eliminar el trabajador');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSubmitting) return;
    
    if (!formData.companyId) {
      toast.error('Selecciona una empresa');
      return;
    }
    if (!formData.displayName.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (!formData.iban.trim()) {
      toast.error('El IBAN es obligatorio');
      return;
    }
    if (!isIBANValid) {
      toast.error('El IBAN no es válido');
      return;
    }
    
    setIsSubmitting(true);
    try {
      if (editingWorker) {
        const updated = await workersApi.update(editingWorker, {
          displayName: formData.displayName.trim(),
          identifier: formData.identifier.trim() || undefined,
          alias: formData.alias.trim() || undefined,
          iban: formData.iban,
          bankAlias: formData.bankAlias.trim() || undefined,
          defaultAmount: formData.defaultAmount || undefined,
          defaultExtraAmount: formData.defaultExtraAmount || undefined,
          numberOfPayments: formData.numberOfPayments || 14,
          extrasProrated: formData.extrasProrated,
          notes: formData.notes.trim() || undefined,
        });
        setWorkers(prev => prev.map(w => w.id === editingWorker ? updated : w));
        toast.success('Trabajador actualizado');
      } else {
        const created = await workersApi.create({
          companyId: formData.companyId,
          displayName: formData.displayName.trim(),
          identifier: formData.identifier.trim() || undefined,
          alias: formData.alias.trim() || undefined,
          iban: formData.iban,
          bankAlias: formData.bankAlias.trim() || undefined,
          defaultAmount: formData.defaultAmount || undefined,
          defaultExtraAmount: formData.defaultExtraAmount || undefined,
          numberOfPayments: formData.numberOfPayments || 14,
          extrasProrated: formData.extrasProrated,
          notes: formData.notes.trim() || undefined,
        });
        setWorkers(prev => [...prev, created]);
        toast.success('Trabajador creado');
      }
      
      setShowForm(false);
      setEditingWorker(null);
      setFormData({
        companyId: '',
        displayName: '',
        identifier: '',
        alias: '',
        iban: '',
        bankAlias: '',
        defaultAmount: 0,
        defaultExtraAmount: 0,
        numberOfPayments: 14,
        extrasProrated: false,
        notes: '',
      });
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al guardar el trabajador');
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingWorker(null);
    setFormData({
      companyId: '',
      displayName: '',
      identifier: '',
      alias: '',
      iban: '',
      bankAlias: '',
      defaultAmount: 0,
      defaultExtraAmount: 0,
      numberOfPayments: 14,
      extrasProrated: false,
      notes: '',
    });
  };

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
          <h1 className="text-2xl font-bold text-gray-900">Trabajadores (Pagos)</h1>
          <p className="text-gray-500 mt-1">
            Gestiona los beneficiarios de nóminas y sus datos bancarios
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={18} className="mr-2" />
          Nuevo Trabajador
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-green-100 rounded-lg mr-4">
              <UserCheck className="text-green-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Activos</p>
              <p className="text-2xl font-bold text-green-600">{activeCount}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-gray-100 rounded-lg mr-4">
              <UserX className="text-gray-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Inactivos</p>
              <p className="text-2xl font-bold text-gray-600">{inactiveCount}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 rounded-lg mr-4">
              <CreditCard className="text-blue-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Con IBAN</p>
              <p className="text-2xl font-bold text-blue-600">{withIBANCount}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-amber-100 rounded-lg mr-4">
              <AlertCircle className="text-amber-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Sin IBAN</p>
              <p className="text-2xl font-bold text-amber-600">{withoutIBANCount}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-2">
            <Building2 size={18} className="text-gray-400" />
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

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as EntityStatus | 'ALL')}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="ALL">Todos los estados</option>
            <option value="ACTIVE">Solo activos</option>
            <option value="INACTIVE">Solo inactivos</option>
          </select>

          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, DNI o alias..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Lista de trabajadores */}
      <Card title={`Trabajadores (${filteredWorkers.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3 font-medium">Nombre</th>
                <th className="pb-3 font-medium">Empresa</th>
                <th className="pb-3 font-medium">IBAN</th>
                <th className="pb-3 font-medium text-right">Importe habitual</th>
                <th className="pb-3 font-medium">Estado</th>
                <th className="pb-3 font-medium text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    <Users className="mx-auto mb-2" size={32} />
                    <p>No hay trabajadores que mostrar</p>
                  </td>
                </tr>
              ) : (
                filteredWorkers.map((worker) => (
                  <tr key={worker.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-4">
                      <div>
                        <p className="font-medium text-gray-900">{worker.displayName}</p>
                        {worker.identifier && (
                          <p className="text-sm text-gray-500">{worker.identifier}</p>
                        )}
                        {worker.alias && (
                          <p className="text-xs text-gray-400">({worker.alias})</p>
                        )}
                      </div>
                    </td>
                    <td className="py-4">
                      <span className="text-sm text-gray-600">
                        {getCompanyName(worker.companyId)}
                      </span>
                    </td>
                    <td className="py-4">
                      {worker.iban ? (
                        <div>
                          <p className="font-mono text-sm text-gray-700">
                            {formatIBAN(worker.iban)}
                          </p>
                          {worker.bankAlias && (
                            <p className="text-xs text-gray-400">{worker.bankAlias}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-amber-600 text-sm flex items-center gap-1">
                          <AlertCircle size={14} />
                          Sin IBAN
                        </span>
                      )}
                    </td>
                    <td className="py-4 text-right">
                      {worker.defaultAmount ? (
                        <span className="font-medium text-gray-900">
                          {formatCurrency(worker.defaultAmount)}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-4">
                      {worker.status === 'ACTIVE' ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="py-4">
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          onClick={() => handleEdit(worker)}
                          className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        {worker.status === 'ACTIVE' ? (
                          <button
                            onClick={() => handleDeactivate(worker)}
                            className="p-2 text-gray-400 hover:text-amber-600 transition-colors"
                            title="Desactivar"
                          >
                            <UserX size={16} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(worker)}
                            className="p-2 text-gray-400 hover:text-green-600 transition-colors"
                            title="Reactivar"
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(worker)}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
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
                  {editingWorker ? 'Editar Trabajador' : 'Nuevo Trabajador'}
                </h2>
                <button onClick={closeForm} className="text-gray-400 hover:text-gray-600">
                  <X size={24} />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Empresa <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.companyId}
                    onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                    className="w-full border rounded-lg px-4 py-3"
                    required
                    disabled={!!editingWorker}
                  >
                    <option value="">Selecciona empresa</option>
                    {companies.map(company => (
                      <option key={company.id} value={company.id}>{company.name}</option>
                    ))}
                  </select>
                  {editingWorker && (
                    <p className="text-xs text-gray-500 mt-1">
                      La empresa no se puede cambiar. Crea un nuevo trabajador si es necesario.
                    </p>
                  )}
                </div>

                <Input
                  label="Nombre completo"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="Juan García López"
                  required
                />

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="DNI/NIE (opcional)"
                    value={formData.identifier}
                    onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
                    placeholder="12345678A"
                  />
                  <Input
                    label="Alias (opcional)"
                    value={formData.alias}
                    onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                    placeholder="Ej: Jefe de planta"
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-medium text-blue-800 flex items-center gap-2">
                    <CreditCard size={16} />
                    Datos bancarios para nómina
                  </p>
                  
                  <IBANInput
                    label="IBAN"
                    value={formData.iban}
                    onChange={(value, isValid) => {
                      setFormData({ ...formData, iban: value });
                      setIsIBANValid(isValid);
                    }}
                    helpText="Cuenta donde se abonará la nómina"
                    required
                  />
                  
                  <Input
                    label="Alias del banco (opcional)"
                    value={formData.bankAlias}
                    onChange={(e) => setFormData({ ...formData, bankAlias: e.target.value })}
                    placeholder="Ej: Santander nómina"
                  />
                </div>

                <div>
                  <CurrencyInput
                    label="Importe habitual de nómina (opcional)"
                    value={formData.defaultAmount}
                    onChange={(value) => setFormData({ ...formData, defaultAmount: value })}
                    placeholder="0,00"
                  />
                  <p className="text-xs text-gray-500 mt-1">Se usará como valor por defecto al crear nuevos lotes mensuales</p>
                </div>

                {/* Configuración de pagas extras */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-4">
                  <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
                    🎁 Configuración de Pagas Extras
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nº de pagas anuales
                      </label>
                      <select
                        value={formData.numberOfPayments}
                        onChange={(e) => setFormData({ ...formData, numberOfPayments: parseInt(e.target.value) })}
                        className="w-full border rounded-lg px-4 py-2 text-sm"
                      >
                        <option value={12}>12 pagas</option>
                        <option value={14}>14 pagas (2 extras)</option>
                        <option value={15}>15 pagas (3 extras)</option>
                      </select>
                    </div>
                    
                    <div>
                      <CurrencyInput
                        label="Importe paga extra"
                        value={formData.defaultExtraAmount}
                        onChange={(value) => setFormData({ ...formData, defaultExtraAmount: value })}
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="extrasProrated"
                      checked={formData.extrasProrated}
                      onChange={(e) => setFormData({ ...formData, extrasProrated: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor="extrasProrated" className="text-sm text-gray-700">
                      Extras prorrateadas (incluidas en la mensual)
                    </label>
                  </div>
                  
                  {formData.extrasProrated && (
                    <p className="text-xs text-amber-600">
                      💡 Si las extras están prorrateadas, no se generarán lotes de paga extra separados.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notas (opcional)
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full border rounded-lg px-4 py-3 text-sm"
                    rows={2}
                    placeholder="Notas internas..."
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <Button type="button" variant="secondary" onClick={closeForm}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Guardando...' : editingWorker ? 'Actualizar' : 'Crear'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
