'use client';

import React, { useState, useCallback } from 'react';
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
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  Sparkles,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { auth } from '@/lib/firebase/config';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';

// Tipos para el generador de contraseñas
interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: string;
}

// Función para generar contraseña segura
function generateSecurePassword(options: PasswordOptions): string {
  const uppercaseChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercaseChars = 'abcdefghijklmnopqrstuvwxyz';
  const numberChars = '0123456789';
  const symbolChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  let chars = '';
  let password = '';
  
  // Construir conjunto de caracteres
  if (options.uppercase) chars += uppercaseChars;
  if (options.lowercase) chars += lowercaseChars;
  if (options.numbers) chars += numberChars;
  if (options.symbols) chars += symbolChars;
  
  if (chars.length === 0) chars = lowercaseChars + numberChars;
  
  // Generar usando crypto para mayor seguridad
  const randomValues = new Uint32Array(options.length);
  crypto.getRandomValues(randomValues);
  
  for (let i = 0; i < options.length; i++) {
    password += chars[randomValues[i] % chars.length];
  }
  
  // Asegurar que tenga al menos uno de cada tipo seleccionado
  let finalPassword = password.split('');
  let position = 0;
  
  if (options.uppercase && !/[A-Z]/.test(password)) {
    const idx = randomValues[position++ % randomValues.length] % uppercaseChars.length;
    finalPassword[position % options.length] = uppercaseChars[idx];
  }
  if (options.lowercase && !/[a-z]/.test(password)) {
    const idx = randomValues[position++ % randomValues.length] % lowercaseChars.length;
    finalPassword[position % options.length] = lowercaseChars[idx];
  }
  if (options.numbers && !/[0-9]/.test(password)) {
    const idx = randomValues[position++ % randomValues.length] % numberChars.length;
    finalPassword[position % options.length] = numberChars[idx];
  }
  if (options.symbols && !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
    const idx = randomValues[position++ % randomValues.length] % symbolChars.length;
    finalPassword[position % options.length] = symbolChars[idx];
  }
  
  return finalPassword.join('');
}

// Función para evaluar fortaleza de contraseña
function evaluatePasswordStrength(password: string): PasswordStrength {
  let score = 0;
  
  if (!password) return { score: 0, label: 'Muy débil', color: 'bg-gray-200' };
  
  // Longitud
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  
  // Complejidad
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  
  // Penalizar patrones comunes
  if (/(.)\1{2,}/.test(password)) score--; // Caracteres repetidos
  if (/^[a-zA-Z]+$/.test(password)) score--; // Solo letras
  if (/^[0-9]+$/.test(password)) score--; // Solo números
  
  score = Math.max(0, Math.min(4, score));
  
  const strengths: PasswordStrength[] = [
    { score: 0, label: 'Muy débil', color: 'bg-red-500' },
    { score: 1, label: 'Débil', color: 'bg-orange-500' },
    { score: 2, label: 'Regular', color: 'bg-yellow-500' },
    { score: 3, label: 'Fuerte', color: 'bg-lime-500' },
    { score: 4, label: 'Muy fuerte', color: 'bg-green-500' },
  ];
  
  return strengths[score];
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security' | 'data'>('profile');
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [fixingDates, setFixingDates] = useState(false);
  const [migratingThirdParties, setMigratingThirdParties] = useState(false);
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);
  
  // Estados para cambio de contraseña
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  
  // Opciones del generador
  const [passwordOptions, setPasswordOptions] = useState<PasswordOptions>({
    length: 16,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  });
  const [showGenerator, setShowGenerator] = useState(false);
  
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
  const [cleanupDuplicatesResult, setCleanupDuplicatesResult] = useState<{
    success: boolean;
    message: string;
    details?: {
      transactionsDeleted: number;
      recurrencesDeleted: number;
      totalTransactionsAnalyzed: number;
      totalRecurrencesAnalyzed: number;
    };
  } | null>(null);

  // Generar nueva contraseña
  const handleGeneratePassword = useCallback(() => {
    const generated = generateSecurePassword(passwordOptions);
    setNewPassword(generated);
    setConfirmPassword(generated);
    setShowNewPassword(true);
    setShowConfirmPassword(true);
  }, [passwordOptions]);

  // Copiar contraseña al portapapeles
  const handleCopyPassword = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(newPassword);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    } catch (err) {
      console.error('Error copiando contraseña:', err);
    }
  }, [newPassword]);

  // Cambiar contraseña
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);
    
    if (!currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Introduce tu contraseña actual' });
      return;
    }
    
    if (newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'La nueva contraseña debe tener al menos 8 caracteres' });
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Las contraseñas no coinciden' });
      return;
    }
    
    const strength = evaluatePasswordStrength(newPassword);
    if (strength.score < 2) {
      setPasswordMessage({ type: 'error', text: 'La contraseña es demasiado débil. Usa el generador o añade más complejidad.' });
      return;
    }
    
    setChangingPassword(true);
    
    try {
      const user = auth?.currentUser;
      if (!user || !user.email) {
        throw new Error('No hay usuario autenticado');
      }
      
      // Reautenticar al usuario
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Cambiar contraseña
      await updatePassword(user, newPassword);
      
      setPasswordMessage({ type: 'success', text: '¡Contraseña cambiada correctamente!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowGenerator(false);
    } catch (error: unknown) {
      console.error('Error cambiando contraseña:', error);
      const firebaseError = error as { code?: string };
      if (firebaseError.code === 'auth/wrong-password') {
        setPasswordMessage({ type: 'error', text: 'La contraseña actual es incorrecta' });
      } else if (firebaseError.code === 'auth/too-many-requests') {
        setPasswordMessage({ type: 'error', text: 'Demasiados intentos. Espera unos minutos.' });
      } else {
        setPasswordMessage({ type: 'error', text: 'Error al cambiar la contraseña. Inténtalo de nuevo.' });
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const passwordStrength = evaluatePasswordStrength(newPassword);

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

  // Función para limpiar transacciones y recurrencias duplicadas
  const handleCleanupDuplicates = async () => {
    setCleaningDuplicates(true);
    setCleanupDuplicatesResult(null);
    
    try {
      if (!auth?.currentUser) {
        throw new Error('No estás autenticado');
      }
      
      const token = await auth.currentUser.getIdToken();
      
      const response = await fetch('/api/transactions/cleanup-duplicates', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        setCleanupDuplicatesResult({
          success: true,
          message: result.data.message || 'Limpieza completada',
          details: {
            transactionsDeleted: result.data.transactionsDeleted || 0,
            recurrencesDeleted: result.data.recurrencesDeleted || 0,
            totalTransactionsAnalyzed: result.data.totalTransactionsAnalyzed || 0,
            totalRecurrencesAnalyzed: result.data.totalRecurrencesAnalyzed || 0,
          }
        });
      } else {
        throw new Error(result.error || 'Error limpiando duplicados');
      }
    } catch (error) {
      setCleanupDuplicatesResult({
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    } finally {
      setCleaningDuplicates(false);
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
            <>
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
            </>
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
                <form onSubmit={handleChangePassword} className="space-y-4">
                  {/* Mensaje de estado */}
                  {passwordMessage && (
                    <div className={`p-4 rounded-lg flex items-start gap-3 ${
                      passwordMessage.type === 'success' 
                        ? 'bg-green-50 border border-green-200' 
                        : 'bg-red-50 border border-red-200'
                    }`}>
                      {passwordMessage.type === 'success' ? (
                        <CheckCircle2 className="text-green-600 mt-0.5 flex-shrink-0" size={20} />
                      ) : (
                        <AlertCircle className="text-red-600 mt-0.5 flex-shrink-0" size={20} />
                      )}
                      <span className={passwordMessage.type === 'success' ? 'text-green-800' : 'text-red-800'}>
                        {passwordMessage.text}
                      </span>
                    </div>
                  )}

                  {/* Contraseña actual */}
                  <div className="relative">
                    <Input 
                      label="Contraseña actual" 
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-9 text-gray-400 hover:text-gray-600"
                    >
                      {showCurrentPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>

                  {/* Nueva contraseña con generador */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Nueva contraseña</label>
                      <button
                        type="button"
                        onClick={() => setShowGenerator(!showGenerator)}
                        className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                      >
                        <Sparkles size={16} />
                        {showGenerator ? 'Ocultar generador' : 'Generar contraseña segura'}
                      </button>
                    </div>

                    {/* Panel del generador */}
                    {showGenerator && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">Generador de Contraseñas</span>
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleGeneratePassword}
                            className="flex items-center gap-2"
                          >
                            <RefreshCw size={16} />
                            Generar
                          </Button>
                        </div>

                        {/* Longitud */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm text-gray-600">Longitud</label>
                            <span className="text-sm font-medium text-gray-900">{passwordOptions.length} caracteres</span>
                          </div>
                          <input
                            type="range"
                            min="8"
                            max="32"
                            value={passwordOptions.length}
                            onChange={(e) => setPasswordOptions({ ...passwordOptions, length: parseInt(e.target.value) })}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                          />
                          <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>8</span>
                            <span>16</span>
                            <span>24</span>
                            <span>32</span>
                          </div>
                        </div>

                        {/* Opciones */}
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { key: 'uppercase', label: 'Mayúsculas (A-Z)' },
                            { key: 'lowercase', label: 'Minúsculas (a-z)' },
                            { key: 'numbers', label: 'Números (0-9)' },
                            { key: 'symbols', label: 'Símbolos (!@#$)' },
                          ].map((option) => (
                            <label key={option.key} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={passwordOptions[option.key as keyof PasswordOptions] as boolean}
                                onChange={(e) => setPasswordOptions({ 
                                  ...passwordOptions, 
                                  [option.key]: e.target.checked 
                                })}
                                className="w-4 h-4 text-primary-600 rounded"
                              />
                              <span className="text-sm text-gray-600">{option.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Campo de nueva contraseña */}
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Introduce o genera una contraseña"
                        autoComplete="new-password"
                        className="w-full px-4 py-2.5 pr-20 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {newPassword && (
                          <button
                            type="button"
                            onClick={handleCopyPassword}
                            className="p-1 text-gray-400 hover:text-gray-600"
                            title="Copiar contraseña"
                          >
                            {copiedPassword ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    {/* Indicador de fortaleza */}
                    {newPassword && (
                      <div className="space-y-2">
                        <div className="flex gap-1">
                          {[0, 1, 2, 3, 4].map((i) => (
                            <div
                              key={i}
                              className={`h-1.5 flex-1 rounded-full transition-colors ${
                                i <= passwordStrength.score ? passwordStrength.color : 'bg-gray-200'
                              }`}
                            />
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">Fortaleza:</span>
                          <span className={`font-medium ${
                            passwordStrength.score >= 3 ? 'text-green-600' : 
                            passwordStrength.score >= 2 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {passwordStrength.label}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirmar contraseña */}
                  <div className="relative">
                    <Input 
                      label="Confirmar nueva contraseña" 
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-9 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                    {confirmPassword && newPassword && (
                      <div className="absolute right-10 top-9">
                        {confirmPassword === newPassword ? (
                          <Check size={20} className="text-green-500" />
                        ) : (
                          <X size={20} className="text-red-500" />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 flex justify-end">
                    <Button type="submit" disabled={changingPassword}>
                      {changingPassword ? (
                        <>
                          <RefreshCw className="animate-spin mr-2" size={18} />
                          Cambiando...
                        </>
                      ) : (
                        'Cambiar Contraseña'
                      )}
                    </Button>
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

              {/* Nueva sección: Limpiar Duplicados */}
              <Card title="Limpiar Duplicados" subtitle="Elimina transacciones y recurrencias duplicadas">
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Si tienes transacciones duplicadas (como nóminas que aparecen dos veces en el mismo mes), 
                    esta herramienta las detectará y eliminará, manteniendo solo la más antigua.
                  </p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-sm text-amber-800">
                      <strong>¿Qué detecta?</strong> Transacciones con la misma empresa, descripción, tipo, monto y fecha.
                      Por ejemplo: dos &quot;Nominas WS&quot; de -16.500€ el 30/03/2026, o dos &quot;Nominas WI&quot; de -17.000€.
                    </p>
                  </div>
                  
                  {cleanupDuplicatesResult && (
                    <div className={`p-4 rounded-lg ${cleanupDuplicatesResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      <div className="flex items-start space-x-3">
                        {cleanupDuplicatesResult.success ? (
                          <Check className="text-green-600 mt-0.5" size={20} />
                        ) : (
                          <AlertCircle className="text-red-600 mt-0.5" size={20} />
                        )}
                        <div>
                          <p className={`font-medium ${cleanupDuplicatesResult.success ? 'text-green-800' : 'text-red-800'}`}>
                            {cleanupDuplicatesResult.message}
                          </p>
                          {cleanupDuplicatesResult.details && (
                            <ul className="mt-2 text-sm text-green-700 space-y-1">
                              <li>• Transacciones analizadas: {cleanupDuplicatesResult.details.totalTransactionsAnalyzed}</li>
                              <li>• Transacciones duplicadas eliminadas: {cleanupDuplicatesResult.details.transactionsDeleted}</li>
                              <li>• Recurrencias analizadas: {cleanupDuplicatesResult.details.totalRecurrencesAnalyzed}</li>
                              <li>• Recurrencias duplicadas eliminadas: {cleanupDuplicatesResult.details.recurrencesDeleted}</li>
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <Button 
                    onClick={handleCleanupDuplicates} 
                    disabled={cleaningDuplicates}
                    variant="outline"
                    className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  >
                    {cleaningDuplicates ? (
                      <>
                        <RefreshCw className="animate-spin mr-2" size={18} />
                        Limpiando...
                      </>
                    ) : (
                      <>
                        <Trash2 size={18} className="mr-2" />
                        Limpiar Duplicados
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
