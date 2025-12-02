'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { MonthlyBudget } from '@/types';
import { auth } from '@/lib/firebase/config';
import { formatCurrency } from '@/lib/utils';
import {
  Target,
  Calendar,
  TrendingUp,
  Save,
  Copy,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  FileText,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Año mínimo: Diciembre 2025
const MIN_YEAR = 2025;
const MIN_MONTH = 12; // Diciembre

/**
 * Parser robusto para importes en formato español/europeo e inglés
 * Maneja:
 * - "41187,49" → 41187.49 (coma decimal español)
 * - "41.187,49" → 41187.49 (miles con punto, decimal con coma)
 * - "41187.49" → 41187.49 (punto decimal inglés)
 * - "4.118.749" → 4118749 (solo miles con punto)
 * - "€ 41.187,49" → 41187.49 (con símbolo)
 */
function parseCurrencyInput(value: string): number {
  if (!value || typeof value !== 'string') return 0;
  
  // Limpiar espacios, símbolo € y otros caracteres no numéricos excepto . , -
  let cleaned = value.replace(/[€\s]/g, '').trim();
  
  // Si está vacío después de limpiar, retornar 0
  if (!cleaned) return 0;
  
  // Detectar el formato basado en la posición de puntos y comas
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  
  if (hasComma && hasDot) {
    // Formato mixto: determinar cuál es el decimal (el último separador)
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    
    if (lastComma > lastDot) {
      // Formato europeo: 41.187,49 → la coma es decimal
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato inglés: 41,187.49 → el punto es decimal
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    // Solo coma: asumir formato español (coma = decimal)
    // Ej: "41187,49" → 41187.49
    cleaned = cleaned.replace(',', '.');
  } else if (hasDot && !hasComma) {
    // Solo punto: determinar si es decimal o separador de miles
    const parts = cleaned.split('.');
    if (parts.length === 2 && parts[1].length <= 2) {
      // Un solo punto con 1-2 decimales: es decimal (ej: "41187.49")
      // No hacer nada, ya está en formato correcto
    } else {
      // Múltiples puntos o patrón de miles: quitar puntos (ej: "4.118.749")
      cleaned = cleaned.replace(/\./g, '');
    }
  }
  
  // Parsear el número limpio
  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : Math.abs(result); // Solo positivos para presupuestos
}

interface BudgetFormData {
  [key: string]: number; // key = "month-1" a "month-12"
}

export default function BudgetPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [budgets, setBudgets] = useState<MonthlyBudget[]>([]);
  const [formData, setFormData] = useState<BudgetFormData>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Cargar presupuestos del año seleccionado
  const loadBudgets = useCallback(async () => {
    try {
      setLoading(true);
      if (!auth?.currentUser) return;
      
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`/api/budgets?year=${selectedYear}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setBudgets(result.data || []);
          
          // Inicializar form data
          const newFormData: BudgetFormData = {};
          for (let m = 1; m <= 12; m++) {
            const budget = result.data?.find((b: MonthlyBudget) => b.month === m);
            newFormData[`month-${m}`] = budget?.incomeGoal || 0;
          }
          setFormData(newFormData);
          setHasChanges(false);
        }
      }
    } catch (error) {
      console.error('Error cargando presupuestos:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    if (user) {
      loadBudgets();
    }
  }, [user, loadBudgets]);

  // Verificar si un mes está habilitado (desde Diciembre 2025 en adelante)
  const isMonthEnabled = (month: number): boolean => {
    if (selectedYear > MIN_YEAR) return true;
    if (selectedYear === MIN_YEAR && month >= MIN_MONTH) return true;
    return false;
  };

  // Manejar cambio en input - usa parser robusto para formato español
  const handleInputChange = (month: number, value: string) => {
    const numValue = parseCurrencyInput(value);
    setFormData(prev => ({
      ...prev,
      [`month-${month}`]: numValue
    }));
    setHasChanges(true);
  };

  // Guardar todos los presupuestos del año
  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    
    try {
      if (!auth?.currentUser) throw new Error('No autenticado');
      
      const token = await auth.currentUser.getIdToken();
      
      // Preparar array de presupuestos a guardar
      const budgetsToSave = [];
      for (let m = 1; m <= 12; m++) {
        if (isMonthEnabled(m)) {
          budgetsToSave.push({
            year: selectedYear,
            month: m,
            incomeGoal: formData[`month-${m}`] || 0,
          });
        }
      }
      
      const response = await fetch('/api/budgets', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ budgets: budgetsToSave })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setMessage({ type: 'success', text: `¡${result.data.updated} presupuestos guardados correctamente!` });
        setHasChanges(false);
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Error guardando presupuestos'
      });
    } finally {
      setSaving(false);
    }
  };

  // Copiar presupuestos del año anterior
  const handleCopyFromPreviousYear = async () => {
    try {
      if (!auth?.currentUser) return;
      
      const prevYear = selectedYear - 1;
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`/api/budgets?year=${prevYear}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data?.length > 0) {
          const newFormData = { ...formData };
          result.data.forEach((budget: MonthlyBudget) => {
            if (isMonthEnabled(budget.month)) {
              newFormData[`month-${budget.month}`] = budget.incomeGoal;
            }
          });
          setFormData(newFormData);
          setHasChanges(true);
          setMessage({ type: 'success', text: `Copiados ${result.data.length} presupuestos de ${prevYear}` });
          setTimeout(() => setMessage(null), 3000);
        } else {
          setMessage({ type: 'error', text: `No hay presupuestos en ${prevYear} para copiar` });
          setTimeout(() => setMessage(null), 3000);
        }
      }
    } catch (error) {
      console.error('Error copiando presupuestos:', error);
    }
  };

  // Aplicar mismo valor a todos los meses
  const handleApplyToAll = (value: number) => {
    const newFormData: BudgetFormData = {};
    for (let m = 1; m <= 12; m++) {
      if (isMonthEnabled(m)) {
        newFormData[`month-${m}`] = value;
      } else {
        newFormData[`month-${m}`] = formData[`month-${m}`] || 0;
      }
    }
    setFormData(newFormData);
    setHasChanges(true);
  };

  // Calcular totales
  const totalAnnual = Object.entries(formData)
    .filter(([key]) => {
      const month = parseInt(key.split('-')[1]);
      return isMonthEnabled(month);
    })
    .reduce((sum, [, value]) => sum + (value || 0), 0);
  
  const avgMonthly = totalAnnual / 12;

  // Navegación entre años
  const canGoPrev = selectedYear > MIN_YEAR;
  const canGoNext = true; // Siempre puede ir al futuro

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Target className="text-primary-600" size={28} />
            Presupuesto de Ingresos
          </h1>
          <p className="text-gray-500 mt-1">
            Define tus objetivos mensuales de ingresos para cada año
          </p>
        </div>
      </div>

      {/* Mensaje de estado */}
      {message && (
        <div className={`p-4 rounded-lg flex items-start gap-3 ${
          message.type === 'success' 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-red-50 border border-red-200'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle2 className="text-green-600 mt-0.5 flex-shrink-0" size={20} />
          ) : (
            <AlertCircle className="text-red-600 mt-0.5 flex-shrink-0" size={20} />
          )}
          <span className={message.type === 'success' ? 'text-green-800' : 'text-red-800'}>
            {message.text}
          </span>
        </div>
      )}

      {/* Selector de año y acciones */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-4">
          {/* Navegación de año */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => canGoPrev && setSelectedYear(y => y - 1)}
              disabled={!canGoPrev}
              className={`p-2 rounded-lg transition-colors ${
                canGoPrev 
                  ? 'hover:bg-gray-100 text-gray-700' 
                  : 'text-gray-300 cursor-not-allowed'
              }`}
            >
              <ChevronLeft size={24} />
            </button>
            
            <div className="flex items-center gap-2">
              <Calendar className="text-primary-600" size={24} />
              <span className="text-2xl font-bold text-gray-900">{selectedYear}</span>
            </div>
            
            <button
              onClick={() => setSelectedYear(y => y + 1)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-700 transition-colors"
            >
              <ChevronRight size={24} />
            </button>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-3">
            {selectedYear > MIN_YEAR && (
              <Button
                variant="secondary"
                onClick={handleCopyFromPreviousYear}
              >
                <Copy size={18} className="mr-2" />
                Copiar de {selectedYear - 1}
              </Button>
            )}
            
            <Button
              onClick={handleSave}
              disabled={saving || !hasChanges}
            >
              {saving ? (
                <RefreshCw className="animate-spin mr-2" size={18} />
              ) : (
                <Save size={18} className="mr-2" />
              )}
              Guardar Cambios
            </Button>
          </div>
        </div>
      </Card>

      {/* Resumen anual */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-primary-50 to-blue-50 border-primary-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary-100 rounded-lg">
              <TrendingUp className="text-primary-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600">Objetivo Anual</p>
              <p className="text-2xl font-bold text-primary-700">{formatCurrency(totalAnnual)}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <Calendar className="text-green-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600">Media Mensual</p>
              <p className="text-2xl font-bold text-green-700">{formatCurrency(avgMonthly)}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 rounded-lg">
              <Sparkles className="text-amber-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600">Aplicar a todos</p>
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Valor"
                  className="w-24 px-2 py-1 text-sm border rounded"
                  id="apply-all-value"
                />
                <button
                  onClick={() => {
                    const input = document.getElementById('apply-all-value') as HTMLInputElement;
                    const value = parseCurrencyInput(input.value);
                    if (value > 0) handleApplyToAll(value);
                  }}
                  className="px-3 py-1 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Grid de meses */}
      <Card title="Objetivos Mensuales" subtitle="Define el objetivo de ingresos para cada mes">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MONTH_NAMES.map((monthName, index) => {
            const month = index + 1;
            const enabled = isMonthEnabled(month);
            const value = formData[`month-${month}`] || 0;
            const budget = budgets.find(b => b.month === month);
            
            return (
              <div
                key={month}
                className={`p-4 rounded-lg border-2 transition-all ${
                  enabled
                    ? 'border-gray-200 hover:border-primary-300 bg-white'
                    : 'border-gray-100 bg-gray-50 opacity-50'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`font-semibold ${enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                    {monthName}
                  </span>
                  {budget && enabled && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      Guardado
                    </span>
                  )}
                </div>
                
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={enabled ? (value > 0 ? value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '') : ''}
                    onChange={(e) => handleInputChange(month, e.target.value)}
                    disabled={!enabled}
                    placeholder={enabled ? '0,00' : 'No disponible'}
                    className={`w-full px-3 py-2 pr-8 border rounded-lg text-right font-medium transition-colors ${
                      enabled
                        ? 'border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200'
                        : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  />
                  <span className={`absolute right-3 top-1/2 -translate-y-1/2 ${
                    enabled ? 'text-gray-500' : 'text-gray-300'
                  }`}>
                    €
                  </span>
                </div>
                
                {!enabled && (
                  <p className="text-xs text-gray-400 mt-2">
                    Los presupuestos empiezan en Dic 2025
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Leyenda del sistema de 3 capas */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="p-3 bg-emerald-100 rounded-lg flex-shrink-0">
            <FileText className="text-emerald-600" size={24} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Sistema de 3 Capas de Ingresos</h3>
            <p className="text-sm text-gray-600 mb-3">
              Los objetivos definidos aquí se usarán en el Dashboard para medir tu progreso mensual:
            </p>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-600"></span>
                <span><strong>Capa 1 (Facturado):</strong> Ingresos con factura</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-400"></span>
                <span><strong>Capa 2 (Contratos):</strong> Recurrentes de alta certeza</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-gray-400"></span>
                <span><strong>Capa 3 (Por cerrar):</strong> Estimados</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
