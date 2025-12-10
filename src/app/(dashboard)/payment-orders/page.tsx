'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { paymentOrdersApi } from '@/lib/api-client';
import { PaymentOrder, PaymentOrderStatus } from '@/types';
import toast, { Toaster } from 'react-hot-toast';
import { 
  FileText, 
  Printer, 
  CheckCircle,
  XCircle,
  Eye,
  Calendar,
  Hash,
  User,
  MessageSquare,
  Filter,
  RefreshCw,
  X
} from 'lucide-react';
import { formatCurrency, formatDate, formatIBAN } from '@/lib/utils';

const STATUS_CONFIG: Record<PaymentOrderStatus, { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT: { label: 'Borrador', color: 'bg-gray-100 text-gray-700', icon: <FileText size={14} /> },
  AUTHORIZED: { label: 'Autorizada', color: 'bg-blue-100 text-blue-700', icon: <CheckCircle size={14} /> },
  EXECUTED: { label: 'Ejecutada', color: 'bg-green-100 text-green-700', icon: <CheckCircle size={14} /> },
  CANCELLED: { label: 'Cancelada', color: 'bg-red-100 text-red-700', icon: <XCircle size={14} /> },
};

export default function PaymentOrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<PaymentOrderStatus | 'ALL'>('ALL');
  const [viewingOrder, setViewingOrder] = useState<PaymentOrder | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    loadOrders();
  }, [user]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await paymentOrdersApi.getAll();
      setOrders(data);
    } catch (error) {
      console.error('Error cargando órdenes:', error);
      toast.error('Error al cargar las órdenes de pago');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsExecuted = async (order: PaymentOrder) => {
    if (!confirm(`¿Marcar la orden ${order.orderNumber} como ejecutada?`)) return;
    try {
      const updated = await paymentOrdersApi.execute(order.id);
      setOrders(prev => prev.map(o => o.id === order.id ? updated : o));
      toast.success('Orden marcada como ejecutada');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al actualizar la orden');
    }
  };

  const handleCancel = async (order: PaymentOrder) => {
    if (!confirm(`¿Cancelar la orden ${order.orderNumber}?`)) return;
    try {
      const updated = await paymentOrdersApi.update(order.id, { status: 'CANCELLED' });
      setOrders(prev => prev.map(o => o.id === order.id ? updated : o));
      toast.success('Orden cancelada');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cancelar la orden');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Filtrar órdenes
  const filteredOrders = filterStatus === 'ALL' 
    ? orders 
    : orders.filter(o => o.status === filterStatus);

  // Ordenar por fecha descendente
  const sortedOrders = [...filteredOrders].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Órdenes de Pago</h1>
          <p className="text-gray-500 mt-1">Historial y gestión de órdenes emitidas para Financiero</p>
        </div>
        <Button variant="outline" onClick={loadOrders}>
          <RefreshCw size={16} className="mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {(['DRAFT', 'AUTHORIZED', 'EXECUTED', 'CANCELLED'] as PaymentOrderStatus[]).map(status => {
          const config = STATUS_CONFIG[status];
          const count = orders.filter(o => o.status === status).length;
          const total = orders.filter(o => o.status === status).reduce((sum, o) => sum + o.totalAmount, 0);
          return (
            <button
              key={status}
              onClick={() => setFilterStatus(filterStatus === status ? 'ALL' : status)}
              className={`p-4 rounded-xl border transition-all ${
                filterStatus === status 
                  ? 'ring-2 ring-primary-500 border-primary-500' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${config.color}`}>
                  {config.icon}
                  {config.label}
                </span>
                <span className="text-2xl font-bold">{count}</span>
              </div>
              <p className="text-sm text-gray-500">{formatCurrency(total)}</p>
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <Card>
        <div className="flex items-center gap-4 p-4 border-b">
          <Filter size={18} className="text-gray-400" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as PaymentOrderStatus | 'ALL')}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="ALL">Todos los estados</option>
            <option value="DRAFT">Borrador</option>
            <option value="AUTHORIZED">Autorizada</option>
            <option value="EXECUTED">Ejecutada</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
          {filterStatus !== 'ALL' && (
            <button
              onClick={() => setFilterStatus('ALL')}
              className="text-sm text-primary-600 hover:text-primary-800"
            >
              Limpiar filtro
            </button>
          )}
        </div>

        {/* Lista de órdenes */}
        <div className="divide-y">
          {sortedOrders.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <FileText size={48} className="mx-auto text-gray-300 mb-4" />
              <p>No hay órdenes de pago</p>
            </div>
          ) : (
            sortedOrders.map(order => {
              const statusConfig = STATUS_CONFIG[order.status];
              return (
                <div 
                  key={order.id}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono font-semibold text-primary-600">
                          {order.orderNumber}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${statusConfig.color}`}>
                          {statusConfig.icon}
                          {statusConfig.label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{order.title}</p>
                      {order.description && (
                        <p className="text-xs text-gray-500 mt-1">{order.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {formatDate(order.createdAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <User size={12} />
                          {order.authorizedByName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Hash size={12} />
                          {order.itemCount} operaciones
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-red-600">{formatCurrency(order.totalAmount)}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => setViewingOrder(order)}
                          className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Ver detalle"
                        >
                          <Eye size={18} />
                        </button>
                        {order.status === 'AUTHORIZED' && (
                          <button
                            onClick={() => handleMarkAsExecuted(order)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Marcar como ejecutada"
                          >
                            <CheckCircle size={18} />
                          </button>
                        )}
                        {order.status === 'DRAFT' && (
                          <button
                            onClick={() => handleCancel(order)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Cancelar orden"
                          >
                            <X size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Modal de detalle de orden */}
      {viewingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <FileText className="text-primary-600" size={24} />
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{viewingOrder.orderNumber}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${STATUS_CONFIG[viewingOrder.status].color}`}>
                      {STATUS_CONFIG[viewingOrder.status].icon}
                      {STATUS_CONFIG[viewingOrder.status].label}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handlePrint}>
                  <Printer size={16} className="mr-2" />
                  Imprimir
                </Button>
                <button onClick={() => setViewingOrder(null)} className="p-2 hover:bg-gray-200 rounded-lg">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Documento imprimible */}
            <div className="flex-1 overflow-auto p-6" ref={printRef}>
              <div className="max-w-3xl mx-auto" id="payment-order-document">
                {/* Cabecera del documento */}
                <div className="border-b-2 border-gray-800 pb-4 mb-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h1 className="text-2xl font-bold text-gray-900">ORDEN DE PAGO</h1>
                      <p className="text-lg font-semibold text-primary-600 mt-1">{viewingOrder.orderNumber}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-gray-500">Fecha de emisión</p>
                      <p className="font-semibold">{formatDate(viewingOrder.createdAt)}</p>
                    </div>
                  </div>
                </div>

                {/* Info general */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Autorizado por</p>
                    <p className="font-semibold text-gray-900">{viewingOrder.authorizedByName}</p>
                    <p className="text-sm text-gray-600">{formatDate(viewingOrder.authorizedAt || viewingOrder.createdAt)}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Resumen</p>
                    <p className="font-semibold text-gray-900">{viewingOrder.itemCount} operaciones</p>
                    <p className="text-xl font-bold text-red-600">{formatCurrency(viewingOrder.totalAmount)}</p>
                  </div>
                </div>

                {/* Notas para financiero */}
                {viewingOrder.notesForFinance && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                    <p className="text-xs text-yellow-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                      <MessageSquare size={12} />
                      Notas para Financiero
                    </p>
                    <p className="text-gray-800">{viewingOrder.notesForFinance}</p>
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
                      {viewingOrder.items.map((item, idx) => (
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
                        <td className="p-2 text-right text-lg text-red-600">{formatCurrency(viewingOrder.totalAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Pie con firmas */}
                <div className="border-t-2 border-gray-300 pt-6 mt-8 print:mt-4">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="text-center">
                      <div className="border-b border-gray-400 h-16 mb-2"></div>
                      <p className="text-sm text-gray-600">Autorizado por</p>
                      <p className="font-semibold">{viewingOrder.authorizedByName}</p>
                    </div>
                    <div className="text-center">
                      <div className="border-b border-gray-400 h-16 mb-2"></div>
                      <p className="text-sm text-gray-600">Ejecutado por (Financiero)</p>
                      <p className="font-semibold text-gray-400">
                        {viewingOrder.executedByName || 'Pendiente'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Pie de documento */}
                <div className="mt-8 pt-4 border-t text-xs text-gray-400 text-center">
                  <p>Documento generado automáticamente por WinFin Tesorería</p>
                  <p>{viewingOrder.orderNumber} | {formatDate(viewingOrder.createdAt)}</p>
                </div>
              </div>
            </div>

            {/* Acciones */}
            <div className="border-t p-4 bg-gray-50 flex justify-between">
              <div>
                {viewingOrder.status === 'AUTHORIZED' && (
                  <Button onClick={() => handleMarkAsExecuted(viewingOrder)}>
                    <CheckCircle size={16} className="mr-2" />
                    Marcar como ejecutada
                  </Button>
                )}
              </div>
              <Button variant="outline" onClick={() => setViewingOrder(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

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

      <Toaster position="top-right" />
    </div>
  );
}
