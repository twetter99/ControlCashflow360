'use client';

import React, { useState, useEffect } from 'react';
import { Button, Input } from '@/components/ui';
import { X, AlertCircle, TrendingDown, Calculator, FileText } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface ExpectedIncomeAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (adjustment: number, reason: string) => Promise<void>;
  monthLabel: string;          // "Diciembre 2025"
  year: number;
  month: number;
  incomeGoal: number;          // Presupuesto original del mes
  realIncomes: number;         // Cobros reales registrados
  currentAdjustment: number;   // Ajuste actual (si existe)
  currentReason: string;       // Motivo actual del ajuste
}

const ExpectedIncomeAdjustmentModal: React.FC<ExpectedIncomeAdjustmentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  monthLabel,
  year,
  month,
  incomeGoal,
  realIncomes,
  currentAdjustment,
  currentReason,
}) => {
  const [adjustment, setAdjustment] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inicializar con valores actuales cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      // Mostrar el valor absoluto (sin signo) para facilitar entrada
      setAdjustment(currentAdjustment !== 0 ? Math.abs(currentAdjustment).toString() : '');
      setReason(currentReason || '');
      setError(null);
    }
  }, [isOpen, currentAdjustment, currentReason]);

  if (!isOpen) return null;

  // Cálculos para mostrar
  const adjustmentValue = parseFloat(adjustment) || 0;
  const baseExpected = Math.max(0, incomeGoal - realIncomes);
  const newExpected = Math.max(0, baseExpected - adjustmentValue);
  
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      
      // El ajuste se guarda como negativo (reduce los cobros esperados)
      const adjustmentToSave = adjustmentValue > 0 ? -adjustmentValue : 0;
      
      await onSave(adjustmentToSave, reason);
      onClose();
    } catch (err) {
      setError('Error al guardar el ajuste. Inténtalo de nuevo.');
      console.error('Error saving adjustment:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleClearAdjustment = async () => {
    try {
      setSaving(true);
      setError(null);
      await onSave(0, '');
      onClose();
    } catch (err) {
      setError('Error al eliminar el ajuste.');
      console.error('Error clearing adjustment:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
        />
        
        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg transform transition-all">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <TrendingDown className="text-amber-600" size={20} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Ajustar Cobros Esperados
                </h2>
                <p className="text-sm text-gray-500">{monthLabel}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 space-y-5">
            {/* Explicación */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-blue-600 mt-0.5 flex-shrink-0" size={18} />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">¿Por qué ajustar?</p>
                  <p>
                    Si has cobrado una factura de un mes anterior, puedes reducir los 
                    cobros esperados de ese mes para reflejar que ya no se va a cobrar esa cantidad.
                  </p>
                </div>
              </div>
            </div>

            {/* Cálculo actual */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Calculator size={16} />
                <span>Cálculo actual</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Presupuesto del mes:</span>
                  <span className="font-medium">{formatCurrency(incomeGoal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Cobros reales registrados:</span>
                  <span className="font-medium text-green-600">-{formatCurrency(realIncomes)}</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between">
                  <span className="text-gray-600">Cobros esperados (sin ajuste):</span>
                  <span className="font-semibold">{formatCurrency(baseExpected)}</span>
                </div>
                {currentAdjustment !== 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Ajuste actual:</span>
                    <span className="font-medium">{formatCurrency(currentAdjustment)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Input de ajuste */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cantidad a reducir de los cobros esperados
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={adjustment}
                    onChange={(e) => setAdjustment(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    max={baseExpected}
                    step="0.01"
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-lg"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">€</span>
                </div>
                {adjustmentValue > baseExpected && (
                  <p className="text-sm text-red-600 mt-1">
                    El ajuste no puede ser mayor que los cobros esperados ({formatCurrency(baseExpected)})
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FileText size={14} className="inline mr-1" />
                  Motivo del ajuste (opcional)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej: Factura #123 de cliente X cobrada en Enero"
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm resize-none"
                />
              </div>
            </div>

            {/* Preview del nuevo valor */}
            {adjustmentValue > 0 && adjustmentValue <= baseExpected && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-emerald-800 font-medium">Nuevo valor de cobros esperados:</span>
                  <span className="text-xl font-bold text-emerald-700">
                    {formatCurrency(newExpected)}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-5 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <div>
              {currentAdjustment !== 0 && (
                <button
                  onClick={handleClearAdjustment}
                  disabled={saving}
                  className="text-sm text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
                >
                  Eliminar ajuste
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || adjustmentValue > baseExpected || (adjustmentValue === 0 && !currentAdjustment)}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {saving ? 'Guardando...' : 'Guardar ajuste'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpectedIncomeAdjustmentModal;
