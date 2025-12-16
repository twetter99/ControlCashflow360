'use client';

import React, { useState, useEffect } from 'react';
import { Button, Input, CurrencyInput, IBANInput } from '@/components/ui';
import { PaymentOrder, PaymentOrderItem } from '@/types';
import toast from 'react-hot-toast';
import { 
  X, 
  Save,
  FileText, 
  AlertTriangle,
  CheckCircle,
  User,
  Hash,
  Calendar,
  Edit3,
} from 'lucide-react';
import { formatCurrency, formatDate, formatIBAN } from '@/lib/utils';

interface PaymentOrderEditModalProps {
  isOpen: boolean;
  order: PaymentOrder | null;
  onClose: () => void;
  onSave: (orderId: string, updates: { items: PaymentOrderItem[]; notesForFinance?: string }) => Promise<void>;
}

interface EditableItem extends PaymentOrderItem {
  isEditing: boolean;
  newIban: string;
  newAmount: number;
  ibanValid: boolean;
}

export function PaymentOrderEditModal({
  isOpen,
  order,
  onClose,
  onSave,
}: PaymentOrderEditModalProps) {
  const [items, setItems] = useState<EditableItem[]>([]);
  const [notesForFinance, setNotesForFinance] = useState('');
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Inicializar cuando se abre el modal
  useEffect(() => {
    if (order && isOpen) {
      const editableItems: EditableItem[] = order.items.map(item => ({
        ...item,
        isEditing: false,
        newIban: item.supplierBankAccount,
        newAmount: item.amount,
        ibanValid: true,
      }));
      setItems(editableItems);
      setNotesForFinance(order.notesForFinance || '');
      setHasChanges(false);
    }
  }, [order, isOpen]);

  if (!isOpen || !order) return null;

  const canEdit = order.status === 'DRAFT' || order.status === 'AUTHORIZED';

  const handleEditItem = (index: number) => {
    if (!canEdit) return;
    setItems(prev => prev.map((item, i) => ({
      ...item,
      isEditing: i === index,
    })));
  };

  const handleCancelEdit = (index: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          isEditing: false,
          newIban: item.supplierBankAccount,
          newAmount: item.amount,
          ibanValid: true,
        };
      }
      return item;
    }));
  };

  const handleUpdateItem = (index: number) => {
    const item = items[index];
    
    if (!item.ibanValid) {
      toast.error('El IBAN no es válido');
      return;
    }
    
    if (item.newAmount <= 0) {
      toast.error('El importe debe ser mayor que 0');
      return;
    }

    setItems(prev => prev.map((it, i) => {
      if (i === index) {
        return {
          ...it,
          supplierBankAccount: it.newIban.toUpperCase().replace(/\s/g, ''),
          amount: it.newAmount,
          isEditing: false,
        };
      }
      return it;
    }));
    setHasChanges(true);
    toast.success('Línea actualizada');
  };

  const handleIbanChange = (index: number, value: string, isValid: boolean) => {
    setItems(prev => prev.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          newIban: value,
          ibanValid: isValid,
        };
      }
      return item;
    }));
  };

  const handleAmountChange = (index: number, value: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          newAmount: value,
        };
      }
      return item;
    }));
  };

  const handleSave = async () => {
    if (!hasChanges) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      // Preparar items para guardar (quitar campos de edición)
      const itemsToSave: PaymentOrderItem[] = items.map(item => ({
        transactionId: item.transactionId,
        description: item.description,
        thirdPartyName: item.thirdPartyName,
        supplierInvoiceNumber: item.supplierInvoiceNumber,
        supplierBankAccount: item.supplierBankAccount,
        amount: item.amount,
        dueDate: item.dueDate,
        chargeAccountId: item.chargeAccountId,
        notes: item.notes,
      }));

      await onSave(order.id, { items: itemsToSave, notesForFinance });
      onClose();
    } catch (error) {
      console.error('Error guardando:', error);
      toast.error('Error al guardar los cambios');
    } finally {
      setSaving(false);
    }
  };

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
  const originalTotal = order.totalAmount;
  const hasTotalChanged = Math.abs(totalAmount - originalTotal) > 0.01;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-primary-50 to-white">
          <div className="flex items-center gap-3">
            <Edit3 className="text-primary-600" size={24} />
            <div>
              <h3 className="text-lg font-bold text-gray-900">Editar Orden de Pago</h3>
              <p className="text-sm text-gray-600">{order.orderNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-auto p-6">
          {/* Aviso si no se puede editar */}
          {!canEdit && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-3">
              <AlertTriangle className="text-red-600" size={20} />
              <p className="text-red-700">
                Esta orden ya ha sido ejecutada y no se puede modificar.
              </p>
            </div>
          )}

          {/* Info general */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Calendar size={12} />
                Fecha
              </p>
              <p className="font-semibold">{formatDate(order.createdAt)}</p>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <User size={12} />
                Autorizado por
              </p>
              <p className="font-semibold">{order.authorizedByName}</p>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Hash size={12} />
                Operaciones
              </p>
              <p className="font-semibold">{items.length}</p>
            </div>
          </div>

          {/* Tabla de items editables */}
          <div className="mb-6">
            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <FileText size={18} />
              Líneas de Pago
              {canEdit && (
                <span className="text-xs text-blue-600 font-normal ml-2">
                  (Haz clic en una línea para editarla)
                </span>
              )}
            </h4>
            
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left p-3 font-semibold">Beneficiario</th>
                    <th className="text-left p-3 font-semibold">Concepto</th>
                    <th className="text-left p-3 font-semibold">IBAN Destino</th>
                    <th className="text-right p-3 font-semibold">Importe</th>
                    <th className="p-3 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr 
                      key={idx} 
                      className={`border-b ${item.isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'} ${canEdit && !item.isEditing ? 'cursor-pointer' : ''}`}
                      onClick={() => !item.isEditing && canEdit && handleEditItem(idx)}
                    >
                      {item.isEditing ? (
                        // Modo edición
                        <>
                          <td className="p-3">
                            <p className="font-medium">{item.thirdPartyName}</p>
                            {item.supplierInvoiceNumber && (
                              <p className="text-xs text-gray-500">Fact: {item.supplierInvoiceNumber}</p>
                            )}
                          </td>
                          <td className="p-3 text-gray-700">{item.description}</td>
                          <td className="p-3" onClick={e => e.stopPropagation()}>
                            <IBANInput
                              value={item.newIban}
                              onChange={(value, isValid) => handleIbanChange(idx, value, isValid)}
                              showInternationalOption={false}
                            />
                          </td>
                          <td className="p-3" onClick={e => e.stopPropagation()}>
                            <CurrencyInput
                              value={item.newAmount}
                              onChange={(value) => handleAmountChange(idx, value)}
                              className="w-32"
                            />
                          </td>
                          <td className="p-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleUpdateItem(idx)}
                                className="p-1.5 bg-green-100 text-green-700 hover:bg-green-200 rounded"
                                title="Guardar cambios"
                              >
                                <CheckCircle size={16} />
                              </button>
                              <button
                                onClick={() => handleCancelEdit(idx)}
                                className="p-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded"
                                title="Cancelar"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        // Modo visualización
                        <>
                          <td className="p-3">
                            <p className="font-medium">{item.thirdPartyName}</p>
                            {item.supplierInvoiceNumber && (
                              <p className="text-xs text-gray-500">Fact: {item.supplierInvoiceNumber}</p>
                            )}
                          </td>
                          <td className="p-3 text-gray-700">{item.description}</td>
                          <td className="p-3 font-mono text-xs">{formatIBAN(item.supplierBankAccount)}</td>
                          <td className="p-3 text-right font-semibold text-red-600">
                            {formatCurrency(item.amount)}
                          </td>
                          <td className="p-3">
                            {canEdit && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditItem(idx);
                                }}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                title="Editar"
                              >
                                <Edit3 size={16} />
                              </button>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-bold">
                    <td colSpan={3} className="p-3 text-right">TOTAL:</td>
                    <td className="p-3 text-right text-lg text-red-600">
                      {formatCurrency(totalAmount)}
                      {hasTotalChanged && (
                        <span className="block text-xs text-orange-600 font-normal">
                          (Original: {formatCurrency(originalTotal)})
                        </span>
                      )}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notas para financiero */}
          {canEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notas para Financiero
              </label>
              <textarea
                value={notesForFinance}
                onChange={(e) => {
                  setNotesForFinance(e.target.value);
                  setHasChanges(true);
                }}
                className="w-full border rounded-lg px-4 py-3 text-sm"
                rows={3}
                placeholder="Notas o instrucciones para el departamento financiero..."
              />
            </div>
          )}
        </div>

        {/* Footer con acciones */}
        <div className="border-t p-4 bg-gray-50 flex justify-between items-center">
          <div>
            {hasChanges && (
              <span className="text-sm text-orange-600 flex items-center gap-1">
                <AlertTriangle size={14} />
                Hay cambios sin guardar
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            {canEdit && (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>Guardando...</>
                ) : (
                  <>
                    <Save size={16} className="mr-2" />
                    Guardar Cambios
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
