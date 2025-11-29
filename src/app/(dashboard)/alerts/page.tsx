'use client';

import React, { useState } from 'react';
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
  X
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

// Tipos de alertas
const alertTypes = [
  { type: 'MIN_LIQUIDITY', label: 'Liquidez mínima', description: 'Avisa cuando la liquidez total baje de X€' },
  { type: 'CRITICAL_RUNWAY', label: 'Runway crítico', description: 'Alerta si el runway baja de X días' },
  { type: 'CONCENTRATED_MATURITIES', label: 'Vencimientos concentrados', description: 'Avisa si hay más de X€ de vencimientos en una semana' },
  { type: 'LOW_CREDIT_LINE', label: 'Póliza baja', description: 'Notifica cuando el disponible de póliza baje del 20%' },
  { type: 'OVERDUE_COLLECTIONS', label: 'Cobros atrasados', description: 'Avisa de facturas con más de X días de retraso' },
  { type: 'STALE_DATA', label: 'Dato caduco', description: 'Saldo lleva >48h sin actualizarse' },
  { type: 'CREDIT_NEED', label: 'Necesidad póliza', description: 'En X días necesitarás disponer Y€ de la póliza' },
];

// Configuraciones de ejemplo
const mockAlertConfigs = [
  { id: '1', type: 'MIN_LIQUIDITY', threshold: 50000, enabled: true, companyName: 'Todas las empresas' },
  { id: '2', type: 'CRITICAL_RUNWAY', threshold: 30, enabled: true, companyName: 'Todas las empresas' },
  { id: '3', type: 'STALE_DATA', threshold: 48, enabled: true, companyName: 'Todas las empresas' },
  { id: '4', type: 'LOW_CREDIT_LINE', threshold: 20, enabled: false, companyName: 'WINFIN Sistemas' },
];

// Alertas activas
const mockActiveAlerts = [
  { 
    id: '1', 
    type: 'STALE_DATA', 
    message: 'La cuenta BBK de WINFIN Instalaciones no se ha actualizado en 52 horas',
    severity: 'MEDIUM',
    createdAt: new Date('2024-11-29T08:00:00'),
  },
  { 
    id: '2', 
    type: 'CREDIT_NEED', 
    message: 'En 23 días necesitarás disponer 15.000€ de la póliza BBVA',
    severity: 'HIGH',
    createdAt: new Date('2024-11-29T07:30:00'),
  },
  { 
    id: '3', 
    type: 'CONCENTRATED_MATURITIES', 
    message: 'Semana del 2 al 8 de diciembre: 75.000€ en vencimientos',
    severity: 'MEDIUM',
    createdAt: new Date('2024-11-28T18:00:00'),
  },
];

export default function AlertsPage() {
  const [showForm, setShowForm] = useState(false);
  const [selectedType, setSelectedType] = useState('');

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
        <Button onClick={() => setShowForm(true)}>
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
        <div className="space-y-4">
          {mockAlertConfigs.map((config) => {
            const alertType = alertTypes.find((t) => t.type === config.type);
            
            return (
              <div
                key={config.id}
                className={`border rounded-lg p-4 ${config.enabled ? 'border-gray-200' : 'border-gray-100 bg-gray-50'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <button
                      className={`p-2 rounded-lg transition-colors ${
                        config.enabled 
                          ? 'bg-primary-100 text-primary-600' 
                          : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      {config.enabled ? <Bell size={20} /> : <BellOff size={20} />}
                    </button>
                    <div>
                      <p className={`font-medium ${config.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                        {alertType?.label}
                      </p>
                      <p className="text-sm text-gray-500">{alertType?.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Umbral</p>
                      <p className="font-semibold text-gray-900">
                        {config.type === 'MIN_LIQUIDITY' || config.type === 'CONCENTRATED_MATURITIES'
                          ? formatCurrency(config.threshold)
                          : config.type === 'LOW_CREDIT_LINE'
                          ? `${config.threshold}%`
                          : config.type === 'CRITICAL_RUNWAY' || config.type === 'OVERDUE_COLLECTIONS'
                          ? `${config.threshold} días`
                          : `${config.threshold}h`
                        }
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Empresa</p>
                      <p className="font-medium text-gray-700">{config.companyName}</p>
                    </div>
                    <button className="p-2 text-gray-400 hover:text-red-600 transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Tipos de alertas disponibles */}
      <Card title="Tipos de Alertas Disponibles">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {alertTypes.map((type) => (
            <div
              key={type.type}
              className="border rounded-lg p-4 hover:border-primary-300 hover:bg-primary-50 transition-colors cursor-pointer"
              onClick={() => {
                setSelectedType(type.type);
                setShowForm(true);
              }}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Nueva Configuración de Alerta</h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  setSelectedType('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <form className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Alerta</label>
                <select 
                  className="w-full border rounded-lg px-4 py-3"
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  required
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
                  required
                />
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
                <select className="w-full border rounded-lg px-4 py-3">
                  <option value="">Todas las empresas</option>
                  <option value="winfin_sistemas">WINFIN Sistemas</option>
                  <option value="winfin_instalaciones">WINFIN Instalaciones</option>
                </select>
              </div>
              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input type="checkbox" className="mr-2" defaultChecked />
                  <span className="text-sm text-gray-700">Notificar en la app</span>
                </label>
                <label className="flex items-center">
                  <input type="checkbox" className="mr-2" />
                  <span className="text-sm text-gray-700">Notificar por email</span>
                </label>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setSelectedType('');
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  Crear Alerta
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
