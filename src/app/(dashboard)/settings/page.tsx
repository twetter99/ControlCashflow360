'use client';

import React, { useState } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { 
  Settings,
  User,
  Bell,
  Shield,
  Download,
  Upload,
  Database,
  RefreshCw,
  Check,
  X,
  AlertCircle
} from 'lucide-react';
import { auth } from '@/lib/firebase/config';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security' | 'data'>('profile');
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [fixingDates, setFixingDates] = useState(false);
  const [migratingThirdParties, setMigratingThirdParties] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    success: boolean;
    message: string;
    details?: {
      processed: number;
      recurrencesCreated: number;
      transactionsGenerated: number;
      totalTransactions?: number;
      orphanedFound?: number;
    };
  } | null>(null);
  const [fixDatesResult, setFixDatesResult] = useState<{
    success: boolean;
    message: string;
    details?: {
      recurrencesProcessed: number;
      transactionsDeleted: number;
      transactionsGenerated: number;
    };
  } | null>(null);
  const [thirdPartyMigrationResult, setThirdPartyMigrationResult] = useState<{
    success: boolean;
    message: string;
    details?: {
      thirdPartiesCreated: number;
      transactionsUpdated: number;
      uniqueNames: number;
    };
  } | null>(null);

  const tabs = [
    { id: 'profile', label: 'Perfil', icon: User },
    { id: 'notifications', label: 'Notificaciones', icon: Bell },
    { id: 'security', label: 'Seguridad', icon: Shield },
    { id: 'data', label: 'Datos', icon: Database },
  ];

  const handleSave = async () => {
    setSaving(true);
    // Simular guardado
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaving(false);
  };

  // Función para migrar recurrencias huérfanas
  const handleMigrateRecurrences = async () => {
    setMigrating(true);
    setMigrationResult(null);
    
    try {
      if (!auth?.currentUser) {
        throw new Error('No estás autenticado');
      }
      
      const token = await auth.currentUser.getIdToken();
      
      const response = await fetch('/api/transactions/migrate-recurrences', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        setMigrationResult({
          success: true,
          message: result.data.message || 'Migración completada',
          details: {
            processed: result.data.processed || 0,
            recurrencesCreated: result.data.recurrencesCreated || 0,
            transactionsGenerated: result.data.transactionsGenerated || 0,
            totalTransactions: result.data.debug?.totalTransactions || 0,
            orphanedFound: result.data.debug?.orphanedFound || 0,
          }
        });
      } else {
        throw new Error(result.error || 'Error en la migración');
      }
    } catch (error) {
      setMigrationResult({
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    } finally {
      setMigrating(false);
    }
  };

  // Función para corregir fechas de recurrencias
  const handleFixDates = async () => {
    setFixingDates(true);
    setFixDatesResult(null);
    
    try {
      if (!auth?.currentUser) {
        throw new Error('No estás autenticado');
      }
      
      const token = await auth.currentUser.getIdToken();
      
      const response = await fetch('/api/recurrences/fix-dates', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        setFixDatesResult({
          success: true,
          message: result.data.message || 'Fechas corregidas',
          details: {
            recurrencesProcessed: result.data.recurrencesProcessed || 0,
            transactionsDeleted: result.data.transactionsDeleted || 0,
            transactionsGenerated: result.data.transactionsGenerated || 0,
          }
        });
      } else {
        throw new Error(result.error || 'Error corrigiendo fechas');
      }
    } catch (error) {
      setFixDatesResult({
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    } finally {
      setFixingDates(false);
    }
  };

  // Función para migrar terceros
  const handleMigrateThirdParties = async () => {
    setMigratingThirdParties(true);
    setThirdPartyMigrationResult(null);
    
    try {
      if (!auth?.currentUser) {
        throw new Error('No estás autenticado');
      }
      
      const token = await auth.currentUser.getIdToken();
      
      const response = await fetch('/api/third-parties/migrate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        setThirdPartyMigrationResult({
          success: true,
          message: result.data.message || 'Migración completada',
          details: {
            thirdPartiesCreated: result.data.thirdPartiesCreated || 0,
            transactionsUpdated: result.data.transactionsUpdated || 0,
            uniqueNames: result.data.uniqueNames || 0,
          }
        });
      } else {
        throw new Error(result.error || 'Error migrando terceros');
      }
    } catch (error) {
      setThirdPartyMigrationResult({
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    } finally {
      setMigratingThirdParties(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-500 mt-1">
          Personaliza tu experiencia en WINFIN Tesorería
        </p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar de tabs */}
        <div className="w-56 shrink-0">
          <Card className="p-2">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors text-left ${
                      activeTab === tab.id
                        ? 'bg-primary-100 text-primary-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Icon size={20} />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </Card>
        </div>

        {/* Contenido */}
        <div className="flex-1 space-y-6">
          {activeTab === 'profile' && (
            <Card title="Información del Perfil" subtitle="Actualiza tu información personal">
              <form className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Nombre" defaultValue="Admin User" />
                  <Input label="Apellidos" defaultValue="Principal" />
                </div>
                <Input label="Email" type="email" defaultValue="admin@winfin.es" disabled />
                <Input label="Teléfono" type="tel" defaultValue="+34 600 123 456" />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                  <input
                    type="text"
                    value="Administrador"
                    disabled
                    className="w-full border rounded-lg px-4 py-3 bg-gray-50 text-gray-500"
                  />
                </div>
                <div className="pt-4 flex justify-end">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? <RefreshCw className="animate-spin mr-2" size={18} /> : <Check size={18} className="mr-2" />}
                    Guardar Cambios
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {activeTab === 'notifications' && (
            <Card title="Preferencias de Notificación" subtitle="Elige cómo quieres recibir las alertas">
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Notificaciones en la app</h4>
                  <div className="space-y-3">
                    {[
                      'Alertas de liquidez crítica',
                      'Alertas de runway bajo',
                      'Vencimientos próximos',
                      'Datos caducados',
                      'Resumen diario'
                    ].map((item) => (
                      <label key={item} className="flex items-center justify-between">
                        <span className="text-gray-700">{item}</span>
                        <input type="checkbox" defaultChecked className="w-5 h-5 text-primary-600 rounded" />
                      </label>
                    ))}
                  </div>
                </div>
                <hr />
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Notificaciones por email</h4>
                  <div className="space-y-3">
                    {[
                      { label: 'Alertas críticas', checked: true },
                      { label: 'Resumen diario (7:00 AM)', checked: true },
                      { label: 'Resumen semanal (Lunes)', checked: false },
                    ].map((item) => (
                      <label key={item.label} className="flex items-center justify-between">
                        <span className="text-gray-700">{item.label}</span>
                        <input type="checkbox" defaultChecked={item.checked} className="w-5 h-5 text-primary-600 rounded" />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="pt-4 flex justify-end">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? <RefreshCw className="animate-spin mr-2" size={18} /> : <Check size={18} className="mr-2" />}
                    Guardar Preferencias
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <Card title="Cambiar Contraseña">
                <form className="space-y-4">
                  <Input label="Contraseña actual" type="password" />
                  <Input label="Nueva contraseña" type="password" />
                  <Input label="Confirmar nueva contraseña" type="password" />
                  <div className="pt-4 flex justify-end">
                    <Button>Cambiar Contraseña</Button>
                  </div>
                </form>
              </Card>

              <Card title="Sesiones Activas">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">Este dispositivo</p>
                      <p className="text-sm text-gray-500">Windows • Chrome • Madrid, España</p>
                      <p className="text-xs text-green-600">Sesión actual</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">iPhone 14</p>
                      <p className="text-sm text-gray-500">iOS • Safari • Hace 2 días</p>
                    </div>
                    <Button variant="outline" size="sm">
                      <X size={16} className="mr-1" />
                      Cerrar
                    </Button>
                  </div>
                </div>
              </Card>

              <Card title="Autenticación de Dos Factores">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">2FA no configurado</p>
                    <p className="text-sm text-gray-500">Añade una capa extra de seguridad a tu cuenta</p>
                  </div>
                  <Button variant="outline">Configurar 2FA</Button>
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-6">
              {/* Nueva sección: Migrar Recurrencias */}
              <Card title="Migrar Transacciones Recurrentes" subtitle="Genera transacciones futuras para movimientos recurrentes existentes">
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Si tienes movimientos marcados como recurrentes (mensual, semanal, etc.) pero no se generaron 
                    las transacciones futuras automáticamente, usa esta herramienta para crearlas.
                  </p>
                  
                  {migrationResult && (
                    <div className={`p-4 rounded-lg ${migrationResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      <div className="flex items-start space-x-3">
                        {migrationResult.success ? (
                          <Check className="text-green-600 mt-0.5" size={20} />
                        ) : (
                          <AlertCircle className="text-red-600 mt-0.5" size={20} />
                        )}
                        <div>
                          <p className={`font-medium ${migrationResult.success ? 'text-green-800' : 'text-red-800'}`}>
                            {migrationResult.message}
                          </p>
                          {migrationResult.details && (
                            <ul className="mt-2 text-sm text-green-700 space-y-1">
                              <li>• Total transacciones encontradas: {migrationResult.details.totalTransactions}</li>
                              <li>• Transacciones recurrentes huérfanas: {migrationResult.details.orphanedFound}</li>
                              <li>• Transacciones procesadas: {migrationResult.details.processed}</li>
                              <li>• Recurrencias creadas: {migrationResult.details.recurrencesCreated}</li>
                              <li>• Transacciones futuras generadas: {migrationResult.details.transactionsGenerated}</li>
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <Button 
                    onClick={handleMigrateRecurrences} 
                    disabled={migrating}
                    variant="outline"
                  >
                    {migrating ? (
                      <>
                        <RefreshCw className="animate-spin mr-2" size={18} />
                        Migrando...
                      </>
                    ) : (
                      <>
                        <RefreshCw size={18} className="mr-2" />
                        Migrar Recurrencias
                      </>
                    )}
                  </Button>
                </div>
              </Card>

              {/* Nueva sección: Corregir Fechas */}
              <Card title="Corregir Fechas de Recurrencias" subtitle="Regenera las transacciones futuras con fechas corregidas (incluye febrero)">
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Si las transacciones generadas automáticamente tienen fechas incorrectas (ej: saltan de enero a marzo, 
                    omitiendo febrero), usa esta herramienta para eliminarlas y regenerarlas correctamente.
                  </p>
                  
                  {fixDatesResult && (
                    <div className={`p-4 rounded-lg ${fixDatesResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      <div className="flex items-start space-x-3">
                        {fixDatesResult.success ? (
                          <Check className="text-green-600 mt-0.5" size={20} />
                        ) : (
                          <AlertCircle className="text-red-600 mt-0.5" size={20} />
                        )}
                        <div>
                          <p className={`font-medium ${fixDatesResult.success ? 'text-green-800' : 'text-red-800'}`}>
                            {fixDatesResult.message}
                          </p>
                          {fixDatesResult.details && (
                            <ul className="mt-2 text-sm text-green-700 space-y-1">
                              <li>• Recurrencias procesadas: {fixDatesResult.details.recurrencesProcessed}</li>
                              <li>• Transacciones eliminadas: {fixDatesResult.details.transactionsDeleted}</li>
                              <li>• Transacciones regeneradas: {fixDatesResult.details.transactionsGenerated}</li>
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <Button 
                    onClick={handleFixDates} 
                    disabled={fixingDates}
                    variant="outline"
                  >
                    {fixingDates ? (
                      <>
                        <RefreshCw className="animate-spin mr-2" size={18} />
                        Corrigiendo...
                      </>
                    ) : (
                      <>
                        <RefreshCw size={18} className="mr-2" />
                        Corregir Fechas
                      </>
                    )}
                  </Button>
                </div>
              </Card>

              {/* Nueva sección: Migrar Terceros */}
              <Card title="Migrar Terceros" subtitle="Convierte los nombres de terceros en registros del maestro">
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Si tienes transacciones con nombres de terceros escritos manualmente, 
                    usa esta herramienta para crear automáticamente los registros en el maestro de terceros.
                  </p>
                  
                  {thirdPartyMigrationResult && (
                    <div className={`p-4 rounded-lg ${thirdPartyMigrationResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      <div className="flex items-start space-x-3">
                        {thirdPartyMigrationResult.success ? (
                          <Check className="text-green-600 mt-0.5" size={20} />
                        ) : (
                          <AlertCircle className="text-red-600 mt-0.5" size={20} />
                        )}
                        <div>
                          <p className={`font-medium ${thirdPartyMigrationResult.success ? 'text-green-800' : 'text-red-800'}`}>
                            {thirdPartyMigrationResult.message}
                          </p>
                          {thirdPartyMigrationResult.details && (
                            <ul className="mt-2 text-sm text-green-700 space-y-1">
                              <li>• Nombres únicos encontrados: {thirdPartyMigrationResult.details.uniqueNames}</li>
                              <li>• Terceros creados: {thirdPartyMigrationResult.details.thirdPartiesCreated}</li>
                              <li>• Transacciones actualizadas: {thirdPartyMigrationResult.details.transactionsUpdated}</li>
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <Button 
                    onClick={handleMigrateThirdParties} 
                    disabled={migratingThirdParties}
                    variant="outline"
                  >
                    {migratingThirdParties ? (
                      <>
                        <RefreshCw className="animate-spin mr-2" size={18} />
                        Migrando...
                      </>
                    ) : (
                      <>
                        <RefreshCw size={18} className="mr-2" />
                        Migrar Terceros
                      </>
                    )}
                  </Button>
                </div>
              </Card>

              <Card title="Exportar Datos">
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Descarga tus datos en formato Excel para análisis externo o backup.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <button className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-colors">
                      <Download size={20} className="text-primary-600" />
                      <span className="text-gray-700">Exportar Cuentas</span>
                    </button>
                    <button className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-colors">
                      <Download size={20} className="text-primary-600" />
                      <span className="text-gray-700">Exportar Movimientos</span>
                    </button>
                    <button className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-colors">
                      <Download size={20} className="text-primary-600" />
                      <span className="text-gray-700">Exportar Pólizas</span>
                    </button>
                    <button className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-colors">
                      <Download size={20} className="text-primary-600" />
                      <span className="text-gray-700">Exportar Todo</span>
                    </button>
                  </div>
                </div>
              </Card>

              <Card title="Importar Datos">
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Importa datos desde archivos Excel. Asegúrate de usar las plantillas correctas.
                  </p>
                  <div className="flex items-center justify-center p-8 border-2 border-dashed rounded-lg">
                    <div className="text-center">
                      <Upload size={48} className="mx-auto text-gray-400 mb-3" />
                      <p className="text-gray-700 font-medium">Arrastra un archivo aquí</p>
                      <p className="text-sm text-gray-500">o haz clic para seleccionar</p>
                      <Button variant="outline" size="sm" className="mt-3">
                        Seleccionar Archivo
                      </Button>
                    </div>
                  </div>
                  <div className="flex space-x-3">
                    <Button variant="outline" size="sm">
                      <Download size={16} className="mr-1" />
                      Descargar Plantilla Cuentas
                    </Button>
                    <Button variant="outline" size="sm">
                      <Download size={16} className="mr-1" />
                      Descargar Plantilla Movimientos
                    </Button>
                  </div>
                </div>
              </Card>

              <Card title="Eliminar Datos" className="border-red-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-red-600">Zona Peligrosa</p>
                    <p className="text-sm text-gray-500">
                      Eliminar todos los datos de tu cuenta. Esta acción es irreversible.
                    </p>
                  </div>
                  <Button variant="danger">
                    Eliminar Todos los Datos
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
