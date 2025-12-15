'use client';

import React, { useState, useEffect } from 'react';
import { X, Building2, Calendar, CreditCard, FileText, AlertCircle, Check } from 'lucide-react';
import { Transaction, Account } from '@/types';
import { Button } from '@/components/ui';

interface ConfirmDirectDebitModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  accounts: Account[];
  onConfirm: (transactionId: string, accountId: string, paidDate: Date, notes?: string) => Promise<void>;
}

export default function ConfirmDirectDebitModal({
  isOpen,
  onClose,
  transaction,
  accounts,
  onConfirm,
}: ConfirmDirectDebitModalProps) {
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtrar cuentas por la empresa de la transacción
  const companyAccounts = accounts.filter(
    acc => acc.companyId === transaction?.companyId
  );

  // Resetear estado cuando cambia la transacción
  useEffect(() => {
    if (transaction) {
      // Pre-seleccionar la cuenta de cargo si existe
      setSelectedAccountId(transaction.chargeAccountId || '');
      // Por defecto, la fecha de vencimiento o hoy
      const defaultDate = transaction.dueDate 
        ? new Date(transaction.dueDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      setPaidDate(defaultDate);
      setNotes('');
      setError(null);
    }
  }, [transaction]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!transaction) return;
    
    if (!selectedAccountId) {
      setError('Debe seleccionar una cuenta');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onConfirm(
        transaction.id,
        selectedAccountId,
        new Date(paidDate),
        notes.trim() || undefined
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar el cargo');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  if (!isOpen || !transaction) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-purple-50 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Building2 className="text-purple-600" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Confirmar Cargo</h2>
              <p className="text-sm text-gray-500">Recibo domiciliado</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-purple-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Información de la transacción */}
        <div className="p-4 bg-gray-50 border-b">
          <div className="space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium text-gray-900">{transaction.description || transaction.category}</p>
                {transaction.thirdPartyName && (
                  <p className="text-sm text-gray-500">{transaction.thirdPartyName}</p>
                )}
              </div>
              <span className="text-lg font-bold text-red-600">
                -{formatCurrency(transaction.amount)}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Calendar size={14} />
                Vence: {formatDate(transaction.dueDate)}
              </span>
            </div>
          </div>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Selector de cuenta */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <CreditCard size={14} className="inline mr-1" />
              Cuenta donde se cargó el recibo *
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              required
            >
              <option value="">Selecciona la cuenta</option>
              {companyAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.bankName} - {acc.alias || acc.accountNumber} ({formatCurrency(acc.currentBalance)})
                </option>
              ))}
            </select>
            {companyAccounts.length === 0 && (
              <p className="text-xs text-orange-600 mt-1">
                No hay cuentas asociadas a esta empresa
              </p>
            )}
          </div>

          {/* Fecha de cargo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar size={14} className="inline mr-1" />
              Fecha de cargo
            </label>
            <input
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              required
            />
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FileText size={14} className="inline mr-1" />
              Notas / Comentarios (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Referencia bancaria, observaciones..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
              rows={2}
              maxLength={500}
            />
            <p className="text-xs text-gray-400 mt-1">{notes.length}/500 caracteres</p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg">
              <AlertCircle size={16} />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !selectedAccountId}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Confirmando...
                </>
              ) : (
                <>
                  <Check size={16} className="mr-2" />
                  Confirmar Cargo
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
