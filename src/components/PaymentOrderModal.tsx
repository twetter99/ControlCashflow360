'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui';
import { Transaction, Account, Company, PaymentOrder, PaymentOrderItem, AccountHold } from '@/types';
import { paymentOrdersApi } from '@/lib/api-client';
import { formatCurrency, formatDate, formatIBAN } from '@/lib/utils';
import { 
  X, 
  FileText, 
  Printer, 
  Download,
  CheckCircle,
  AlertCircle,
  Building2,
  CreditCard,
  Calendar,
  Hash,
  User,
  MessageSquare,
  AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';

interface PaymentOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  accounts: Account[];
  companies: Company[];
  accountHolds?: AccountHold[];
  onOrderCreated?: (order: PaymentOrder) => void;
}

export function PaymentOrderModal({
  isOpen,
  onClose,
  transactions,
  accounts,
  companies,
  accountHolds = [],
  onOrderCreated,
}: PaymentOrderModalProps) {
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [notesForFinance, setNotesForFinance] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<PaymentOrder | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  
  // Estado para la cuenta seleccionada de cada transacción
  const [accountSelections, setAccountSelections] = useState<Record<string, string>>({});

  // Filtrar solo gastos pendientes que NO son domiciliados
  const eligibleTransactions = transactions.filter(tx => 
    tx.type === 'EXPENSE' && 
    tx.status === 'PENDING' &&
    tx.paymentMethod !== 'DIRECT_DEBIT'
  );

  // Calcular retenciones activas por cuenta
  const getAccountHoldsTotal = (accountId: string): number => {
    return accountHolds
      .filter(h => h.accountId === accountId && h.status === 'ACTIVE')
      .reduce((sum, h) => sum + h.amount, 0);
  };

  // Calcular saldo disponible de una cuenta (saldo - retenciones)
  const getAvailableBalance = (account: Account): number => {
    const holdsTotal = getAccountHoldsTotal(account.id);
    return account.currentBalance - holdsTotal;
  };

  // Obtener cuentas disponibles para una transacción (misma empresa)
  const getAccountsForTransaction = (tx: Transaction): Account[] => {
    return accounts.filter(acc => acc.companyId === tx.companyId);
  };

  // Obtener la cuenta seleccionada para una transacción
  const getSelectedAccountId = (txId: string, tx: Transaction): string => {
    // Primero la selección manual, luego la que tenía la transacción
    return accountSelections[txId] || tx.chargeAccountId || '';
  };

  // Inicializar selección con todas las transacciones elegibles y sus cuentas
  useEffect(() => {
    if (isOpen && eligibleTransactions.length > 0) {
      setSelectedTxIds(new Set(eligibleTransactions.map(tx => tx.id)));
      // Inicializar accountSelections con las cuentas que ya tenían las transacciones
      const initialSelections: Record<string, string> = {};
      eligibleTransactions.forEach(tx => {
        if (tx.chargeAccountId) {
          initialSelections[tx.id] = tx.chargeAccountId;
        }
      });
      setAccountSelections(initialSelections);
    }
  }, [isOpen, eligibleTransactions.length]);

  // Reset al cerrar
  useEffect(() => {
    if (!isOpen) {
      setSelectedTxIds(new Set());
      setAccountSelections({});
      setNotesForFinance('');
      setCreatedOrder(null);
    }
  }, [isOpen]);

  const toggleTransaction = (txId: string) => {
    setSelectedTxIds(prev => {
      const next = new Set(prev);
      if (next.has(txId)) {
        next.delete(txId);
      } else {
        next.add(txId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedTxIds.size === eligibleTransactions.length) {
      setSelectedTxIds(new Set());
    } else {
      setSelectedTxIds(new Set(eligibleTransactions.map(tx => tx.id)));
    }
  };

  const selectedTransactions = eligibleTransactions.filter(tx => selectedTxIds.has(tx.id));
  const totalAmount = selectedTransactions.reduce((sum, tx) => sum + tx.amount, 0);

  // Agrupar por cuenta de cargo (usando selecciones actuales)
  const groupedByAccount = selectedTransactions.reduce((acc, tx) => {
    const accountId = getSelectedAccountId(tx.id, tx) || 'sin-cuenta';
    if (!acc[accountId]) {
      acc[accountId] = [];
    }
    acc[accountId].push(tx);
    return acc;
  }, {} as Record<string, Transaction[]>);

  // Verificar si hay pagos sin cuenta asignada
  const paymentsWithoutAccount = selectedTransactions.filter(tx => !getSelectedAccountId(tx.id, tx));

  // Verificar pagos con saldo insuficiente
  const paymentsWithInsufficientBalance = selectedTransactions.filter(tx => {
    const accountId = getSelectedAccountId(tx.id, tx);
    if (!accountId) return false;
    const account = accounts.find(a => a.id === accountId);
    if (!account) return false;
    const available = getAvailableBalance(account);
    return available < tx.amount;
  });

  const getAccountInfo = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return { name: 'Sin cuenta asignada', iban: '', bankName: '', companyName: '' };
    const company = companies.find(c => c.id === account.companyId);
    return {
      name: `${account.bankName} - ${account.alias}`,
      iban: account.accountNumber,
      bankName: account.bankName,
      companyName: company?.name || '',
      balance: account.currentBalance,
    };
  };

  const handleCreateOrder = async () => {
    if (selectedTransactions.length === 0) {
      toast.error('Selecciona al menos un pago');
      return;
    }

    // Validar que todos tengan IBAN del proveedor
    const withoutIban = selectedTransactions.filter(tx => !tx.supplierBankAccount);
    if (withoutIban.length > 0) {
      toast.error(`${withoutIban.length} pago(s) no tienen IBAN del proveedor`);
      return;
    }

    setIsCreating(true);
    try {
      const now = new Date();
      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      
      const items: PaymentOrderItem[] = selectedTransactions.map(tx => ({
        transactionId: tx.id,
        description: tx.description || '',
        thirdPartyName: tx.thirdPartyName || '',
        supplierInvoiceNumber: tx.supplierInvoiceNumber || '',
        supplierBankAccount: tx.supplierBankAccount || '',
        amount: tx.amount,
        dueDate: tx.dueDate,
        chargeAccountId: getSelectedAccountId(tx.id, tx),
        notes: '',
      }));

      const order = await paymentOrdersApi.create({
        title: `Orden de Pago - ${monthNames[now.getMonth()]} ${now.getFullYear()}`,
        description: `${selectedTransactions.length} pagos por transferencia`,
        defaultChargeAccountId: undefined,
        items,
        transactionIds: selectedTransactions.map(tx => tx.id),
        notesForFinance,
      });

      setCreatedOrder(order);
      toast.success('Orden de pago creada correctamente');
      onOrderCreated?.(order);
    } catch (error) {
      console.error('Error creando orden:', error);
      toast.error('Error al crear la orden de pago');
    } finally {
      setIsCreating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  // Vista de orden creada (documento para imprimir/descargar)
  if (createdOrder) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-green-50">
            <div className="flex items-center gap-3">
              <CheckCircle className="text-green-600" size={24} />
              <div>
                <h3 className="text-lg font-bold text-gray-900">Orden de Pago Generada</h3>
                <p className="text-sm text-gray-600">{createdOrder.orderNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handlePrint}>
                <Printer size={16} className="mr-2" />
                Imprimir
              </Button>
              <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg">
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Documento imprimible */}
          <div className="flex-1 overflow-auto p-6 print:p-0" ref={printRef}>
            <div className="max-w-3xl mx-auto bg-white print:shadow-none" id="payment-order-document">
              {/* Cabecera del documento */}
              <div className="border-b-2 border-gray-800 pb-4 mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">ORDEN DE PAGO</h1>
                    <p className="text-lg font-semibold text-primary-600 mt-1">{createdOrder.orderNumber}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-gray-500">Fecha de emisión</p>
                    <p className="font-semibold">{formatDate(createdOrder.createdAt)}</p>
                  </div>
                </div>
              </div>

              {/* Info general */}
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Autorizado por</p>
                  <p className="font-semibold text-gray-900">{createdOrder.authorizedByName}</p>
                  <p className="text-sm text-gray-600">{formatDate(createdOrder.authorizedAt || createdOrder.createdAt)}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Resumen</p>
                  <p className="font-semibold text-gray-900">{createdOrder.itemCount} operaciones</p>
                  <p className="text-xl font-bold text-red-600">{formatCurrency(createdOrder.totalAmount)}</p>
                </div>
              </div>

              {/* Notas para financiero */}
              {createdOrder.notesForFinance && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <p className="text-xs text-yellow-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                    <MessageSquare size={12} />
                    Notas para Financiero
                  </p>
                  <p className="text-gray-800">{createdOrder.notesForFinance}</p>
                </div>
              )}

              {/* Detalle de pagos */}
              <div className="mb-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText size={18} />
                  Detalle de Pagos
                </h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="text-left p-2 font-semibold">Beneficiario</th>
                      <th className="text-left p-2 font-semibold">Concepto</th>
                      <th className="text-left p-2 font-semibold">IBAN Destino</th>
                      <th className="text-left p-2 font-semibold">Vto.</th>
                      <th className="text-right p-2 font-semibold">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {createdOrder.items.map((item, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2">
                          <p className="font-medium">{item.thirdPartyName}</p>
                          {item.supplierInvoiceNumber && (
                            <p className="text-xs text-gray-500">Fact: {item.supplierInvoiceNumber}</p>
                          )}
                        </td>
                        <td className="p-2 text-gray-700">{item.description}</td>
                        <td className="p-2 font-mono text-xs">{formatIBAN(item.supplierBankAccount)}</td>
                        <td className="p-2">{formatDate(item.dueDate)}</td>
                        <td className="p-2 text-right font-semibold text-red-600">{formatCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 font-bold">
                      <td colSpan={4} className="p-2 text-right">TOTAL A PAGAR:</td>
                      <td className="p-2 text-right text-lg text-red-600">{formatCurrency(createdOrder.totalAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Pie con firmas */}
              <div className="border-t-2 border-gray-300 pt-6 mt-8">
                <div className="grid grid-cols-2 gap-8">
                  <div className="text-center">
                    <div className="border-b border-gray-400 h-16 mb-2"></div>
                    <p className="text-sm text-gray-600">Autorizado por</p>
                    <p className="font-semibold">{createdOrder.authorizedByName}</p>
                  </div>
                  <div className="text-center">
                    <div className="border-b border-gray-400 h-16 mb-2"></div>
                    <p className="text-sm text-gray-600">Ejecutado por (Financiero)</p>
                    <p className="font-semibold text-gray-400">Pendiente</p>
                  </div>
                </div>
              </div>

              {/* Pie de documento */}
              <div className="mt-8 pt-4 border-t text-xs text-gray-400 text-center">
                <p>Documento generado automáticamente por WinFin Tesorería</p>
                <p>{createdOrder.orderNumber} | {formatDate(createdOrder.createdAt)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Vista de selección de pagos
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <FileText size={20} className="text-primary-600" />
              Generar Orden de Pago
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Selecciona los pagos a incluir en la orden para Financiero
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-auto p-4">
          {eligibleTransactions.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No hay pagos por transferencia pendientes</p>
              <p className="text-sm text-gray-400 mt-1">Solo se pueden incluir gastos pendientes con método de pago "Transferencia"</p>
            </div>
          ) : (
            <>
              {/* Avisos de validación */}
              {(paymentsWithoutAccount.length > 0 || paymentsWithInsufficientBalance.length > 0) && (
                <div className="mb-4 space-y-2">
                  {paymentsWithoutAccount.length > 0 && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                      <AlertTriangle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-red-800">
                          {paymentsWithoutAccount.length} pago(s) sin cuenta de cargo asignada
                        </p>
                        <p className="text-xs text-red-600 mt-1">
                          Selecciona una cuenta de cargo para cada pago antes de continuar
                        </p>
                      </div>
                    </div>
                  )}
                  {paymentsWithInsufficientBalance.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                      <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">
                          {paymentsWithInsufficientBalance.length} pago(s) con saldo insuficiente
                        </p>
                        <p className="text-xs text-amber-600 mt-1">
                          Las cuentas seleccionadas no tienen saldo disponible suficiente (considerando retenciones)
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tabla de pagos */}
              <div className="border rounded-lg overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-3 text-left">
                        <input
                          type="checkbox"
                          checked={selectedTxIds.size === eligibleTransactions.length}
                          onChange={toggleAll}
                          className="rounded border-gray-300"
                        />
                      </th>
                      <th className="p-3 text-left font-medium">Beneficiario / Concepto</th>
                      <th className="p-3 text-left font-medium">IBAN Destino</th>
                      <th className="p-3 text-left font-medium">Cuenta Cargo</th>
                      <th className="p-3 text-left font-medium">Vto.</th>
                      <th className="p-3 text-right font-medium">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligibleTransactions.map(tx => {
                      const isSelected = selectedTxIds.has(tx.id);
                      const hasIban = !!tx.supplierBankAccount;
                      const availableAccounts = getAccountsForTransaction(tx);
                      const selectedAccountId = accountSelections[tx.id] || '';
                      const selectedAccount = accounts.find(a => a.id === selectedAccountId);
                      const availableBalance = selectedAccount ? getAvailableBalance(selectedAccount) : 0;
                      const hasInsufficientBalance = selectedAccount && availableBalance < tx.amount;
                      
                      return (
                        <tr 
                          key={tx.id} 
                          className={`border-t ${isSelected ? 'bg-primary-50' : ''} ${!hasIban ? 'bg-red-50' : ''}`}
                        >
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleTransaction(tx.id)}
                              className="rounded border-gray-300"
                            />
                          </td>
                          <td className="p-3">
                            <p className="font-medium">{tx.thirdPartyName}</p>
                            <p className="text-gray-500 text-xs">{tx.description}</p>
                            {tx.supplierInvoiceNumber && (
                              <p className="text-xs text-gray-400">Fact: {tx.supplierInvoiceNumber}</p>
                            )}
                          </td>
                          <td className="p-3">
                            {hasIban ? (
                              <span className="font-mono text-xs">{formatIBAN(tx.supplierBankAccount || '')}</span>
                            ) : (
                              <span className="text-red-600 text-xs flex items-center gap-1">
                                <AlertCircle size={12} />
                                Sin IBAN
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="space-y-1">
                              <select
                                value={selectedAccountId}
                                onChange={(e) => setAccountSelections(prev => ({
                                  ...prev,
                                  [tx.id]: e.target.value
                                }))}
                                className={`w-full text-xs border rounded px-2 py-1.5 ${
                                  !selectedAccountId ? 'border-red-300 bg-red-50' : 
                                  hasInsufficientBalance ? 'border-amber-300 bg-amber-50' : 'border-gray-300'
                                }`}
                              >
                                <option value="">Seleccionar cuenta...</option>
                                {availableAccounts.map(acc => {
                                  const accBalance = getAvailableBalance(acc);
                                  return (
                                    <option key={acc.id} value={acc.id}>
                                      {acc.bankName} - {acc.alias} | Disp: {formatCurrency(accBalance)}
                                    </option>
                                  );
                                })}
                              </select>
                              {hasInsufficientBalance && (
                                <p className="text-xs text-amber-600 flex items-center gap-1">
                                  <AlertTriangle size={10} />
                                  Saldo insuficiente (Disp: {formatCurrency(availableBalance)})
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-xs">{formatDate(tx.dueDate)}</td>
                          <td className="p-3 text-right font-semibold text-red-600">
                            {formatCurrency(tx.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Notas para financiero */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                  <MessageSquare size={14} />
                  Notas para Financiero (opcional)
                </label>
                <textarea
                  value={notesForFinance}
                  onChange={(e) => setNotesForFinance(e.target.value)}
                  placeholder="Instrucciones especiales, urgencia, etc."
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  rows={2}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer con resumen y acciones */}
        {eligibleTransactions.length > 0 && (
          <div className="border-t p-4 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-sm text-gray-500">Pagos seleccionados</p>
                  <p className="text-xl font-bold">{selectedTxIds.size} de {eligibleTransactions.length}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total a pagar</p>
                  <p className="text-xl font-bold text-red-600">{formatCurrency(totalAmount)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCreateOrder}
                  disabled={isCreating || selectedTxIds.size === 0}
                >
                  {isCreating ? 'Generando...' : 'Generar Orden de Pago'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Estilos para impresión */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #payment-order-document,
          #payment-order-document * {
            visibility: visible;
          }
          #payment-order-document {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20mm;
          }
        }
      `}</style>
    </div>
  );
}

export default PaymentOrderModal;
