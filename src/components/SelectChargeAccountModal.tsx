'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui';
import { Account } from '@/types';
import { formatCurrency, formatIBAN } from '@/lib/utils';
import { 
  X, 
  Building2, 
  CreditCard,
  AlertTriangle,
  CheckCircle,
  Loader2
} from 'lucide-react';

interface SelectChargeAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (accountId: string) => void;
  accounts: Account[];
  totalAmount: number;
  title?: string;
  isLoading?: boolean;
}

export function SelectChargeAccountModal({
  isOpen,
  onClose,
  onConfirm,
  accounts,
  totalAmount,
  title = 'Seleccionar cuenta de cargo',
  isLoading = false,
}: SelectChargeAccountModalProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!selectedAccountId) return;
    onConfirm(selectedAccountId);
  };

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  const hasInsufficientBalance = selectedAccount && selectedAccount.currentBalance < totalAmount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <CreditCard size={20} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{title}</h2>
                <p className="text-sm text-white/80">
                  Selecciona desde qué cuenta se realizará el pago
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Total a pagar */}
        <div className="p-4 bg-gray-50 border-b">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Total a pagar:</span>
            <span className="text-2xl font-bold text-red-600">
              {formatCurrency(totalAmount)}
            </span>
          </div>
        </div>

        {/* Lista de cuentas */}
        <div className="p-4 max-h-[400px] overflow-y-auto">
          {accounts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Building2 size={48} className="mx-auto text-gray-300 mb-3" />
              <p>No hay cuentas bancarias disponibles</p>
              <p className="text-sm">para esta empresa</p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map(account => {
                const isSelected = selectedAccountId === account.id;
                const hasSufficientBalance = account.currentBalance >= totalAmount;
                
                return (
                  <button
                    key={account.id}
                    onClick={() => setSelectedAccountId(account.id)}
                    className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">
                            {account.bankName}
                          </span>
                          {account.alias && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                              {account.alias}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 font-mono">
                          {formatIBAN(account.accountNumber)}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-sm text-gray-600">Saldo:</span>
                          <span className={`font-semibold ${
                            hasSufficientBalance ? 'text-green-600' : 'text-orange-600'
                          }`}>
                            {formatCurrency(account.currentBalance)}
                          </span>
                          {hasSufficientBalance ? (
                            <CheckCircle size={16} className="text-green-500" />
                          ) : (
                            <AlertTriangle size={16} className="text-orange-500" />
                          )}
                        </div>
                        {!hasSufficientBalance && (
                          <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                            <AlertTriangle size={12} />
                            Saldo insuficiente (faltan {formatCurrency(totalAmount - account.currentBalance)})
                          </p>
                        )}
                      </div>
                      
                      {/* Radio indicator */}
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        isSelected
                          ? 'border-primary-500 bg-primary-500'
                          : 'border-gray-300'
                      }`}>
                        {isSelected && (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Warning si saldo insuficiente */}
        {hasInsufficientBalance && (
          <div className="px-4 pb-2">
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-2">
              <AlertTriangle size={18} className="text-orange-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-orange-700">
                <p className="font-medium">Saldo insuficiente</p>
                <p>La cuenta seleccionada no tiene saldo suficiente. Puedes continuar, pero asegúrate de tener fondos antes de ejecutar el pago.</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedAccountId || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Generando...
              </>
            ) : (
              'Generar Orden de Pago'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
