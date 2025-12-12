'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { thirdPartiesApi, recurrencesApi, companiesApi } from '@/lib/api-client';
import { ThirdParty, ThirdPartyType, Recurrence, Company } from '@/types';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Users,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  X,
  User,
  Building2,
  Mail,
  Phone,
  FileText,
  RefreshCw,
  ChevronRight,
  Calendar,
  Repeat,
  TrendingUp,
  AlertTriangle,
  Check,
  MoreVertical,
  Download,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

const TYPE_CONFIG: Record<ThirdPartyType, { label: string; color: string }> = {
  CUSTOMER: { label: 'Cliente', color: 'bg-green-100 text-green-700' },
  SUPPLIER: { label: 'Proveedor', color: 'bg-blue-100 text-blue-700' },
  CREDITOR: { label: 'Acreedor', color: 'bg-purple-100 text-purple-700' },
  MIXED: { label: 'Mixto', color: 'bg-gray-100 text-gray-700' },
};

const FREQUENCY_LABELS: Record<string, string> = {
  NONE: 'Puntual',
  DAILY: 'Diario',
  WEEKLY: 'Semanal',
  BIWEEKLY: 'Quincenal',
  MONTHLY: 'Mensual',
  QUARTERLY: 'Trimestral',
  YEARLY: 'Anual',
};

interface ThirdPartyFormData {
  type: ThirdPartyType;
  displayName: string;
  cif: string;
  email: string;
  phone: string;
  notes: string;
}

const emptyFormData: ThirdPartyFormData = {
  type: 'SUPPLIER',
  displayName: '',
  cif: '',
  email: '',
  phone: '',
  notes: '',
};

export default function ThirdPartiesPage() {
  const { user } = useAuth();
  const [thirdParties, setThirdParties] = useState<ThirdParty[]>([]);
  const [recurrences, setRecurrences] = useState<Recurrence[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState<ThirdPartyType | 'ALL'>('ALL');
  const [showInactive, setShowInactive] = useState(false);
  
  // Modal crear/editar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ThirdPartyFormData>(emptyFormData);
  const [saving, setSaving] = useState(false);
  
  // Panel de detalle
  const [selectedThirdParty, setSelectedThirdParty] = useState<ThirdParty | null>(null);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tpData, recData, compData] = await Promise.all([
        thirdPartiesApi.getAll({ includeInactive: true }),
        recurrencesApi.getAll(),
        companiesApi.getAll()
      ]);
      setThirdParties(tpData);
      setRecurrences(recData);
      setCompanies(compData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error al cargar terceros');
    } finally {
      setLoading(false);
    }
  };

  // Filtrar terceros
  const filteredThirdParties = useMemo(() => {
    let result = thirdParties;
    
    // Filtro por estado
    if (!showInactive) {
      result = result.filter(tp => tp.isActive);
    }
    
    // Filtro por tipo
    if (filterType !== 'ALL') {
      result = result.filter(tp => tp.type === filterType);
    }
    
    // Filtro por búsqueda
    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      result = result.filter(tp => 
        tp.displayName.toLowerCase().includes(search) ||
        tp.cif?.toLowerCase().includes(search) ||
        tp.email?.toLowerCase().includes(search)
      );
    }
    
    // Ordenar por nombre
    return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [thirdParties, filterType, showInactive, searchText]);

  // Obtener recurrencias de un tercero
  const getRecurrencesForThirdParty = (thirdPartyId: string) => {
    return recurrences.filter(r => r.thirdPartyId === thirdPartyId);
  };

  // Contar recurrencias por tercero
  const getRecurrenceCount = (thirdPartyId: string) => {
    return recurrences.filter(r => r.thirdPartyId === thirdPartyId && r.status === 'ACTIVE').length;
  };

  // Abrir modal para crear
  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData(emptyFormData);
    setIsModalOpen(true);
  };

  // Abrir modal para editar
  const handleOpenEdit = (tp: ThirdParty) => {
    setEditingId(tp.id);
    setFormData({
      type: tp.type,
      displayName: tp.displayName,
      cif: tp.cif || '',
      email: tp.email || '',
      phone: tp.phone || '',
      notes: tp.notes || '',
    });
    setIsModalOpen(true);
  };

  // Guardar tercero
  const handleSave = async () => {
    if (!formData.displayName.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    
    try {
      setSaving(true);
      
      if (editingId) {
        // Actualizar
        const updated = await thirdPartiesApi.update(editingId, {
          type: formData.type,
          displayName: formData.displayName.trim(),
          cif: formData.cif.trim() || undefined,
          email: formData.email.trim() || undefined,
          phone: formData.phone.trim() || undefined,
          notes: formData.notes.trim() || undefined,
        });
        setThirdParties(prev => prev.map(tp => tp.id === editingId ? updated : tp));
        if (selectedThirdParty?.id === editingId) {
          setSelectedThirdParty(updated);
        }
        toast.success('Tercero actualizado');
      } else {
        // Crear
        const created = await thirdPartiesApi.create({
          type: formData.type,
          displayName: formData.displayName.trim(),
          cif: formData.cif.trim() || undefined,
          email: formData.email.trim() || undefined,
          phone: formData.phone.trim() || undefined,
          notes: formData.notes.trim() || undefined,
        });
        setThirdParties(prev => [...prev, created]);
        toast.success('Tercero creado');
      }
      
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // Eliminar/desactivar tercero
  const handleDelete = async (tp: ThirdParty) => {
    const recCount = getRecurrenceCount(tp.id);
    const message = recCount > 0
      ? `¿Desactivar "${tp.displayName}"?\n\nTiene ${recCount} recurrencia(s) activa(s) asociadas.`
      : `¿Eliminar "${tp.displayName}"?`;
    
    if (!confirm(message)) return;
    
    try {
      await thirdPartiesApi.delete(tp.id);
      setThirdParties(prev => prev.filter(t => t.id !== tp.id));
      if (selectedThirdParty?.id === tp.id) {
        setSelectedThirdParty(null);
      }
      toast.success('Tercero eliminado');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al eliminar');
    }
  };

  // Reactivar tercero
  const handleReactivate = async (tp: ThirdParty) => {
    try {
      const updated = await thirdPartiesApi.update(tp.id, { isActive: true });
      setThirdParties(prev => prev.map(t => t.id === tp.id ? updated : t));
      toast.success('Tercero reactivado');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al reactivar');
    }
  };

  // Formatear período de recurrencia
  const formatPeriod = (rec: Recurrence) => {
    const start = formatDate(rec.startDate);
    const end = rec.endDate ? formatDate(rec.endDate) : 'Indefinido';
    return `${start} → ${end}`;
  };

  // Obtener nombre de empresa
  const getCompanyName = (companyId: string) => {
    return companies.find(c => c.id === companyId)?.name || 'Sin empresa';
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="text-primary-600" />
            Terceros
          </h1>
          <p className="text-gray-500 mt-1">Gestión de clientes, proveedores y acreedores</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadData}>
            <RefreshCw size={16} className="mr-2" />
            Actualizar
          </Button>
          <Button onClick={handleOpenCreate}>
            <Plus size={16} className="mr-2" />
            Nuevo Tercero
          </Button>
        </div>
      </div>

      {/* Resumen por tipo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(['CUSTOMER', 'SUPPLIER', 'CREDITOR', 'MIXED'] as ThirdPartyType[]).map(type => {
          const config = TYPE_CONFIG[type];
          const count = thirdParties.filter(tp => tp.type === type && tp.isActive).length;
          return (
            <button
              key={type}
              onClick={() => setFilterType(filterType === type ? 'ALL' : type)}
              className={`p-4 rounded-xl border transition-all ${
                filterType === type 
                  ? 'ring-2 ring-primary-500 border-primary-500' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
                  {config.label}
                </span>
                <span className="text-2xl font-bold">{count}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Lista de terceros */}
      <Card>
        {/* Filtros */}
        <div className="flex items-center gap-4 p-4 border-b">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Buscar por nombre, CIF o email..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as ThirdPartyType | 'ALL')}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="ALL">Todos los tipos</option>
            <option value="CUSTOMER">Clientes</option>
            <option value="SUPPLIER">Proveedores</option>
            <option value="CREDITOR">Acreedores</option>
            <option value="MIXED">Mixto</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded"
            />
            Mostrar inactivos
          </label>
        </div>

        {/* Lista */}
        <div className="divide-y max-h-[calc(100vh-350px)] overflow-y-auto">
          {filteredThirdParties.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Users size={48} className="mx-auto text-gray-300 mb-4" />
              <p>No hay terceros</p>
              <Button variant="outline" onClick={handleOpenCreate} className="mt-4">
                <Plus size={16} className="mr-2" />
                Crear tercero
              </Button>
            </div>
          ) : (
            filteredThirdParties.map(tp => {
              const config = TYPE_CONFIG[tp.type];
              const recCount = getRecurrenceCount(tp.id);
              const isSelected = selectedThirdParty?.id === tp.id;
              const tpRecurrences = getRecurrencesForThirdParty(tp.id);
              
              return (
                <div key={tp.id}>
                  {/* Fila del tercero */}
                  <div 
                    onClick={() => setSelectedThirdParty(isSelected ? null : tp)}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected ? 'bg-primary-50 border-l-4 border-l-primary-500' : 'hover:bg-gray-50'
                    } ${!tp.isActive ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-gray-900 truncate">{tp.displayName}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
                            {config.label}
                          </span>
                          {!tp.isActive && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              Inactivo
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          {tp.cif && (
                            <span className="flex items-center gap-1">
                              <FileText size={14} />
                              {tp.cif}
                            </span>
                          )}
                          {tp.email && (
                            <span className="flex items-center gap-1">
                              <Mail size={14} />
                              {tp.email}
                            </span>
                          )}
                          {recCount > 0 && (
                            <span className="flex items-center gap-1 text-primary-600">
                              <Repeat size={14} />
                              {recCount} recurrencia{recCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenEdit(tp); }}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        {tp.isActive ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(tp); }}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleReactivate(tp); }}
                            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
                            title="Reactivar"
                          >
                            <Check size={16} />
                          </button>
                        )}
                        <div className={`ml-1 transition-transform ${isSelected ? 'rotate-90' : ''}`}>
                          <ChevronRight size={18} className="text-gray-400" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Panel expandible de detalle */}
                  {isSelected && (
                    <div className="bg-gray-50 border-t border-b border-gray-200 animate-in slide-in-from-top-2 duration-200">
                      {/* Información del tercero y acciones */}
                      <div className="p-4 border-b border-gray-200">
                        <div className="flex items-start justify-between">
                          <div className="flex flex-wrap gap-6">
                            {tp.cif && (
                              <div className="flex items-center gap-2 text-sm">
                                <FileText size={16} className="text-gray-400" />
                                <span className="text-gray-600">CIF/NIF:</span>
                                <span className="font-medium">{tp.cif}</span>
                              </div>
                            )}
                            {tp.email && (
                              <div className="flex items-center gap-2 text-sm">
                                <Mail size={16} className="text-gray-400" />
                                <span className="text-gray-600">Email:</span>
                                <a href={`mailto:${tp.email}`} className="font-medium text-primary-600 hover:underline">
                                  {tp.email}
                                </a>
                              </div>
                            )}
                            {tp.phone && (
                              <div className="flex items-center gap-2 text-sm">
                                <Phone size={16} className="text-gray-400" />
                                <span className="text-gray-600">Teléfono:</span>
                                <a href={`tel:${tp.phone}`} className="font-medium">
                                  {tp.phone}
                                </a>
                              </div>
                            )}
                            {tp.lastUsedAt && (
                              <div className="flex items-center gap-2 text-sm text-gray-500">
                                <Calendar size={16} className="text-gray-400" />
                                <span>Último uso: {formatDate(tp.lastUsedAt)}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleOpenEdit(tp)}>
                              <Edit2 size={14} className="mr-1" />
                              Editar
                            </Button>
                            {tp.isActive ? (
                              <Button size="sm" variant="outline" onClick={() => handleDelete(tp)}>
                                <Trash2 size={14} className="mr-1" />
                                Eliminar
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => handleReactivate(tp)}>
                                <Check size={14} className="mr-1" />
                                Reactivar
                              </Button>
                            )}
                          </div>
                        </div>
                        {tp.notes && (
                          <div className="mt-3 text-sm">
                            <span className="text-gray-600">Notas: </span>
                            <span className="text-gray-800">{tp.notes}</span>
                          </div>
                        )}
                      </div>

                      {/* Recurrencias en tabla horizontal */}
                      <div className="p-4">
                        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <Repeat size={16} className="text-primary-600" />
                          Gastos/Ingresos Recurrentes
                        </h4>
                        
                        {tpRecurrences.length === 0 ? (
                          <div className="text-center py-4 text-gray-500">
                            <p className="text-sm">No tiene recurrencias asociadas</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-100 text-gray-600">
                                  <th className="text-left px-3 py-2 font-medium rounded-tl-lg">Nombre</th>
                                  <th className="text-left px-3 py-2 font-medium">Empresa</th>
                                  <th className="text-right px-3 py-2 font-medium">Importe</th>
                                  <th className="text-center px-3 py-2 font-medium">Frecuencia</th>
                                  <th className="text-center px-3 py-2 font-medium">Período</th>
                                  <th className="text-center px-3 py-2 font-medium rounded-tr-lg">Estado</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {tpRecurrences.map(rec => {
                                  const isExpense = rec.type === 'EXPENSE';
                                  const statusColor = rec.status === 'ACTIVE' 
                                    ? 'bg-green-100 text-green-700' 
                                    : rec.status === 'PAUSED' 
                                      ? 'bg-yellow-100 text-yellow-700' 
                                      : 'bg-gray-100 text-gray-700';
                                  const statusLabel = rec.status === 'ACTIVE' ? 'Activa' : rec.status === 'PAUSED' ? 'Pausada' : 'Finalizada';
                                  
                                  return (
                                    <tr key={rec.id} className="hover:bg-white">
                                      <td className="px-3 py-2.5">
                                        <span className="font-medium text-gray-900">{rec.name}</span>
                                      </td>
                                      <td className="px-3 py-2.5 text-gray-600">
                                        {getCompanyName(rec.companyId)}
                                      </td>
                                      <td className={`px-3 py-2.5 text-right font-semibold ${isExpense ? 'text-red-600' : 'text-green-600'}`}>
                                        {isExpense ? '-' : '+'}{formatCurrency(rec.baseAmount)}
                                      </td>
                                      <td className="px-3 py-2.5 text-center text-gray-700">
                                        {FREQUENCY_LABELS[rec.frequency]}
                                        {rec.dayOfMonth && <span className="text-gray-500 text-xs ml-1">(día {rec.dayOfMonth})</span>}
                                      </td>
                                      <td className="px-3 py-2.5 text-center text-gray-500 text-xs">
                                        {formatPeriod(rec)}
                                      </td>
                                      <td className="px-3 py-2.5 text-center">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                                          {statusLabel}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        
        {/* Footer con conteo */}
        <div className="p-3 bg-gray-50 border-t text-sm text-gray-500 text-center">
          {filteredThirdParties.length} de {thirdParties.filter(tp => showInactive || tp.isActive).length} terceros
        </div>
      </Card>

      {/* Modal crear/editar */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">
                {editingId ? 'Editar Tercero' : 'Nuevo Tercero'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <div className="p-4 space-y-4">
              {/* Tipo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as ThirdPartyType })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="SUPPLIER">Proveedor</option>
                  <option value="CUSTOMER">Cliente</option>
                  <option value="CREDITOR">Acreedor</option>
                  <option value="MIXED">Mixto</option>
                </select>
              </div>

              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="Nombre o razón social"
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              {/* CIF */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CIF/NIF</label>
                <input
                  type="text"
                  value={formData.cif}
                  onChange={(e) => setFormData({ ...formData, cif: e.target.value.toUpperCase() })}
                  placeholder="B12345678"
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              {/* Email y Teléfono */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="contacto@empresa.com"
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+34 612 345 678"
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Información adicional..."
                  rows={3}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear tercero'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Toaster position="top-right" />
    </div>
  );
}
