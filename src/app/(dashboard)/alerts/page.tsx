'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { 
  Bell,
  BellOff,
  Plus,
  Trash2,
  AlertTriangle,
  TrendingDown,
  Clock,
  CreditCard,
  Calendar,
  X,
  Loader2,
  Edit2,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { companiesApi } from '@/lib/api-client';
import { Company, AlertConfig, AlertType } from '@/types';

// Tipos de alertas
const alertTypes = [
  { type: 'MIN_LIQUIDITY' as AlertType, label: 'Liquidez mínima', description: 'Avisa cuando la liquidez total baje de X€' },
  { type: 'CRITICAL_RUNWAY' as AlertType, label: 'Runway crítico', description: 'Alerta si el runway baja de X días' },
  { type: 'CONCENTRATED_MATURITIES' as AlertType, label: 'Vencimientos concentrados', description: 'Avisa si hay más de X€ de vencimientos en una semana' },
  { type: 'LOW_CREDIT_LINE' as AlertType, label: 'Póliza baja', description: 'Notifica cuando el disponible de póliza baje del 20%' },
  { type: 'OVERDUE_COLLECTIONS' as AlertType, label: 'Cobros atrasados', description: 'Avisa de facturas con más de X días de retraso' },
  { type: 'STALE_DATA' as AlertType, label: 'Dato caduco', description: 'Saldo lleva >48h sin actualizarse' },
  { type: 'CREDIT_NEED' as AlertType, label: 'Necesidad póliza', description: 'En X días necesitarás disponer Y€ de la póliza' },
];

// Alertas activas (mock por ahora - se conectará después)
const mockActiveAlerts = [
  { 
    id: '1', 
    type: 'STALE_DATA' as AlertType, 
    message: 'La cuenta BBK de WINFIN Instalaciones no se ha actualizado en 52 horas',
    severity: 'MEDIUM',
    createdAt: new Date('2024-11-29T08:00:00'),
  },
  { 
    id: '2', 
    type: 'CREDIT_NEED' as AlertType, 
    message: 'En 23 días necesitarás disponer 15.000€ de la póliza BBVA',
    severity: 'HIGH',
    createdAt: new Date('2024-11-29T07:30:00'),
  },
  { 
    id: '3', 
    type: 'CONCENTRATED_MATURITIES' as AlertType, 
    message: 'Semana del 2 al 8 de diciembre: 75.000€ en vencimientos',
    severity: 'MEDIUM',
    createdAt: new Date('2024-11-28T18:00:00'),
  },
];

export default function AlertsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AlertConfig | null>(null);
  const [selectedType, setSelectedType] = useState<AlertType | ''>('');
  const [threshold, setThreshold] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [notifyInApp, setNotifyInApp] = useState(true);
  const [notifyByEmail, setNotifyByEmail] = useState(false);
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [alertConfigs, setAlertConfigs] = useState<AlertConfig[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Cargar empresas y configuraciones al montar
  const loadData = useCallback(async () => {
    try {
      const [companiesData, configsResponse] = await Promise.all([
        companiesApi.getAll(),
        fetch('/api/alerts').then(res => res.json()),
      ]);
      setCompanies(companiesData);
      if (configsResponse && !configsResponse.error) {
        setAlertConfigs(configsResponse);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setLoadingCompanies(false);
      setLoadingConfigs(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset form
  const resetForm = () => {
    setSelectedType('');
    setThreshold('');
    setSelectedCompanyId('');
    setNotifyInApp(true);
    setNotifyByEmail(false);
    setEditingConfig(null);
  };

  // Abrir formulario para crear
  const openCreateForm = (type?: AlertType) => {
    resetForm();
    if (type) setSelectedType(type);
    setShowForm(true);
  };

  // Abrir formulario para editar
  const openEditForm = (config: AlertConfig) => {
    setEditingConfig(config);
    setSelectedType(config.type);
    setThreshold(String(config.threshold));
    setSelectedCompanyId(config.companyId || '');
    setNotifyInApp(config.notifyInApp);
    setNotifyByEmail(config.notifyByEmail);
    setShowForm(true);
  };

  // Cerrar formulario
  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  // Guardar configuración (crear o actualizar)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || !threshold) return;

    setSaving(true);
    try {
      const body = {
        type: selectedType,
        threshold: Number(threshold),
        companyId: selectedCompanyId || null,
        notifyInApp,
        notifyByEmail,
      };

      const url = editingConfig ? `/api/alerts/${editingConfig.id}` : '/api/alerts';
      const method = editingConfig ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        await loadData(); // Recargar lista
        closeForm();
      } else {
        const error = await response.json();
        alert(error.error || 'Error al guardar');
      }
    } catch (error) {
      console.error('Error guardando:', error);
      alert('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  // Eliminar configuración
  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta configuración de alerta?')) return;

    setDeleting(id);
    try {
      const response = await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
      if (response.ok) {
        await loadData();
      } else {
        alert('Error al eliminar');
      }
    } catch (error) {
      console.error('Error eliminando:', error);
    } finally {
      setDeleting(null);
    }
  };

  // Toggle enabled/disabled
  const handleToggleEnabled = async (id: string) => {
    try {
      const response = await fetch(`/api/alerts/${id}`, { method: 'PATCH' });
      if (response.ok) {
        await loadData();
      }
    } catch (error) {
      console.error('Error toggling:', error);
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'MIN_LIQUIDITY': return <TrendingDown className="text-red-500" size={20} />;
      case 'CRITICAL_RUNWAY': return <Clock className="text-amber-500" size={20} />;
      case 'LOW_CREDIT_LINE': return <CreditCard className="text-amber-500" size={20} />;
      case 'STALE_DATA': return <Clock className="text-gray-500" size={20} />;
      case 'CONCENTRATED_MATURITIES': return <Calendar className="text-amber-500" size={20} />;
      default: return <AlertTriangle className="text-amber-500" size={20} />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'HIGH': return 'border-l-red-500 bg-red-50';
      case 'MEDIUM': return 'border-l-amber-500 bg-amber-50';
      case 'LOW': return 'border-l-green-500 bg-green-50';
      default: return 'border-l-gray-500 bg-gray-50';
    }
  };

  const getThresholdLabel = (type: string) => {
    switch (type) {
      case 'MIN_LIQUIDITY': return 'Umbral (€)';
      case 'CRITICAL_RUNWAY': return 'Umbral (días)';
      case 'CONCENTRATED_MATURITIES': return 'Umbral (€)';
      case 'LOW_CREDIT_LINE': return 'Umbral (%)';
      case 'OVERDUE_COLLECTIONS': return 'Días de retraso';
      case 'STALE_DATA': return 'Horas sin actualizar';
      case 'CREDIT_NEED': return 'Días de antelación';
      default: return 'Umbral';
    }
  };

  const formatThreshold = (config: AlertConfig) => {
    switch (config.type) {
      case 'MIN_LIQUIDITY':
      case 'CONCENTRATED_MATURITIES':
        return formatCurrency(config.threshold);
      case 'LOW_CREDIT_LINE':
        return `${config.threshold}%`;
      case 'CRITICAL_RUNWAY':
      case 'OVERDUE_COLLECTIONS':
      case 'CREDIT_NEED':
        return `${config.threshold} días`;
      case 'STALE_DATA':
        return `${config.threshold}h`;
      default:
        return String(config.threshold);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sistema de Alertas</h1>
          <p className="text-gray-500 mt-1">
            Configura alertas proactivas para tu tesorería
          </p>
        </div>
        <Button onClick={() => openCreateForm()}>
          <Plus size={18} className="mr-2" />
          Nueva Alerta
        </Button>
      </div>

      {/* Alertas activas */}
      <Card title="Alertas Activas" subtitle={`${mockActiveAlerts.length} alertas sin leer`}>
        <div className="space-y-3">
          {mockActiveAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`border-l-4 rounded-lg p-4 ${getSeverityColor(alert.severity)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  {getAlertIcon(alert.type)}
                  <div>
                    <p className="font-medium text-gray-900">{alert.message}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {alert.createdAt.toLocaleString('es-ES')}
                    </p>
                  </div>
                </div>
                <button className="text-gray-400 hover:text-gray-600">
                  <X size={18} />
                </button>
              </div>
            </div>
          ))}
          
          {mockActiveAlerts.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Bell size={48} className="mx-auto mb-4 text-gray-300" />
              <p>No hay alertas activas</p>
            </div>
          )}
        </div>
      </Card>

      {/* Configuración de alertas */}
      <Card title="Configuración de Alertas" subtitle="Define qué situaciones quieres monitorizar">
        {loadingConfigs ? (
          <div className="text-center py-8">
            <Loader2 className="animate-spin mx-auto text-gray-400" size={32} />
            <p className="text-gray-500 mt-2">Cargando configuraciones...</p>
          </div>
        ) : alertConfigs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Bell size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No hay alertas configuradas</p>
            <Button className="mt-4" onClick={() => openCreateForm()}>
              <Plus size={18} className="mr-2" />
              Crear primera alerta
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {alertConfigs.map((config) => {
              const alertType = alertTypes.find((t) => t.type === config.type);
              
              return (
                <div
                  key={config.id}
                  className={`border rounded-lg p-4 ${config.enabled ? 'border-gray-200' : 'border-gray-100 bg-gray-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <button
                        onClick={() => handleToggleEnabled(config.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          config.enabled 
                            ? 'bg-primary-100 text-primary-600 hover:bg-primary-200' 
                            : 'bg-gray-200 text-gray-400 hover:bg-gray-300'
                        }`}
                        title={config.enabled ? 'Desactivar alerta' : 'Activar alerta'}
                      >
                        {config.enabled ? <Bell size={20} /> : <BellOff size={20} />}
                      </button>
                      <div>
                        <p className={`font-medium ${config.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                          {alertType?.label || config.type}
                        </p>
                        <p className="text-sm text-gray-500">{alertType?.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Umbral</p>
                        <p className="font-semibold text-gray-900">
                          {formatThreshold(config)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">Empresa</p>
                        <p className="font-medium text-gray-700">{config.companyName || 'Todas'}</p>
                      </div>
                      <button 
                        onClick={() => openEditForm(config)}
                        className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                        title="Editar"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(config.id)}
                        disabled={deleting === config.id}
                        className="p-2 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                        title="Eliminar"
                      >
                        {deleting === config.id ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <Trash2 size={18} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Tipos de alertas disponibles */}
      <Card title="Tipos de Alertas Disponibles">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {alertTypes.map((type) => (
            <div
              key={type.type}
              className="border rounded-lg p-4 hover:border-primary-300 hover:bg-primary-50 transition-colors cursor-pointer"
              onClick={() => openCreateForm(type.type)}
            >
              <div className="flex items-start space-x-3">
                {getAlertIcon(type.type)}
                <div>
                  <p className="font-medium text-gray-900">{type.label}</p>
                  <p className="text-sm text-gray-500">{type.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Modal de formulario */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">
                {editingConfig ? 'Editar Configuración de Alerta' : 'Nueva Configuración de Alerta'}
              </h2>
              <button
                onClick={closeForm}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <form className="p-6 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Alerta</label>
                <select 
                  className="w-full border rounded-lg px-4 py-3"
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as AlertType)}
                  required
                  disabled={!!editingConfig}
                >
                  <option value="">Selecciona un tipo</option>
                  {alertTypes.map((type) => (
                    <option key={type.type} value={type.type}>{type.label}</option>
                  ))}
                </select>
              </div>
              {selectedType && (
                <Input
                  label={getThresholdLabel(selectedType)}
                  type="number"
                  placeholder="Introduce el valor"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  required
                />
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
                <select 
                  className="w-full border rounded-lg px-4 py-3" 
                  disabled={loadingCompanies}
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                >
                  <option value="">Todas las empresas</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input 
                    type="checkbox" 
                    className="mr-2" 
                    checked={notifyInApp}
                    onChange={(e) => setNotifyInApp(e.target.checked)}
                  />
                  <span className="text-sm text-gray-700">Notificar en la app</span>
                </label>
                <label className="flex items-center">
                  <input 
                    type="checkbox" 
                    className="mr-2"
                    checked={notifyByEmail}
                    onChange={(e) => setNotifyByEmail(e.target.checked)}
                  />
                  <span className="text-sm text-gray-700">Notificar por email</span>
                </label>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeForm}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving || !selectedType || !threshold}>
                  {saving ? (
                    <>
                      <Loader2 size={18} className="mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : editingConfig ? (
                    'Guardar cambios'
                  ) : (
                    'Crear Alerta'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
