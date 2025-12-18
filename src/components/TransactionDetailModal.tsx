'use client';

import React, { useState, useMemo } from 'react';
import { 
  X, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  FileText, 
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  Building2,
  Send,
  CheckCircle,
  ArrowUpDown,
  Calendar,
  Download,
  FileSpreadsheet
} from 'lucide-react';
import Link from 'next/link';
import { Transaction, Account } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';

interface TransactionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  type: 'INCOME' | 'EXPENSE';
  transactions: Transaction[];
  total: number;
  monthLabel: string;
  accounts?: Account[];
  onConfirmDirectDebit?: (transaction: Transaction) => void;
}

type SortField = 'date' | 'amount' | 'thirdParty' | 'category';
type SortDirection = 'asc' | 'desc';

interface WeekGroup {
  weekKey: string;
  weekLabel: string;
  dateRange: string;
  transactions: Transaction[];
  total: number;
}

export default function TransactionDetailModal({
  isOpen,
  onClose,
  title,
  type,
  transactions,
  total,
  monthLabel,
  accounts = [],
  onConfirmDirectDebit,
}: TransactionDetailModalProps) {
  // Estados para filtros y ordenación
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [methodFilter, setMethodFilter] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'table' | 'grouped'>('grouped');
  const [isExporting, setIsExporting] = useState(false);

  // Obtener categorías y métodos únicos para filtros
  const categories = useMemo(() => {
    const cats = new Set(transactions.map(tx => tx.category));
    return Array.from(cats).sort();
  }, [transactions]);

  const paymentMethods = useMemo(() => {
    if (type !== 'EXPENSE') return [];
    const methods = new Set(transactions.map(tx => tx.paymentMethod).filter(Boolean));
    return Array.from(methods);
  }, [transactions, type]);

  // Filtrar transacciones
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // Filtro de búsqueda
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesSearch = 
          tx.description?.toLowerCase().includes(search) ||
          tx.thirdPartyName?.toLowerCase().includes(search) ||
          tx.category?.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }
      // Filtro de categoría
      if (categoryFilter && tx.category !== categoryFilter) return false;
      // Filtro de método de pago
      if (methodFilter && tx.paymentMethod !== methodFilter) return false;
      
      return true;
    });
  }, [transactions, searchTerm, categoryFilter, methodFilter]);

  // Ordenar transacciones
  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'date':
          comparison = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          break;
        case 'amount':
          comparison = a.amount - b.amount;
          break;
        case 'thirdParty':
          comparison = (a.thirdPartyName || '').localeCompare(b.thirdPartyName || '');
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredTransactions, sortField, sortDirection]);

  // Agrupar por semana
  const weekGroups = useMemo((): WeekGroup[] => {
    const groups = new Map<string, WeekGroup>();
    
    sortedTransactions.forEach(tx => {
      const date = new Date(tx.dueDate);
      // Obtener el lunes de la semana
      const monday = new Date(date);
      const day = monday.getDay();
      const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
      monday.setDate(diff);
      monday.setHours(0, 0, 0, 0);
      
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      
      const weekKey = monday.toISOString().split('T')[0];
      
      if (!groups.has(weekKey)) {
        const weekNum = getWeekNumber(monday);
        groups.set(weekKey, {
          weekKey,
          weekLabel: `Semana ${weekNum}`,
          dateRange: `${formatShortDate(monday)} - ${formatShortDate(sunday)}`,
          transactions: [],
          total: 0,
        });
      }
      
      const group = groups.get(weekKey)!;
      group.transactions.push(tx);
      group.total += tx.amount;
    });
    
    return Array.from(groups.values()).sort((a, b) => 
      a.weekKey.localeCompare(b.weekKey)
    );
  }, [sortedTransactions]);

  // Inicializar semanas expandidas
  React.useEffect(() => {
    if (weekGroups.length > 0 && expandedWeeks.size === 0) {
      // Expandir primera semana por defecto
      setExpandedWeeks(new Set([weekGroups[0].weekKey]));
    }
  }, [weekGroups]);

  const toggleWeek = (weekKey: string) => {
    setExpandedWeeks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(weekKey)) {
        newSet.delete(weekKey);
      } else {
        newSet.add(weekKey);
      }
      return newSet;
    });
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getAccountName = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    return account?.alias || account?.bankName || '';
  };

  const filteredTotal = useMemo(() => {
    return filteredTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTransactions]);

  // Función para exportar a Excel
  const handleExportExcel = async () => {
    if (filteredTransactions.length === 0) return;
    
    setIsExporting(true);
    try {
      const XLSX = await import('xlsx');
      
      const data = filteredTransactions.map(tx => ({
        'Fecha': formatDate(tx.dueDate),
        'Concepto': tx.description || '',
        'Tercero': tx.thirdPartyName || '',
        'Categoría': tx.category || '',
        'Método': tx.paymentMethod === 'DIRECT_DEBIT' ? 'Domiciliación' : tx.paymentMethod === 'TRANSFER' ? 'Transferencia' : '',
        'Importe': type === 'EXPENSE' ? -tx.amount : tx.amount,
      }));
      
      // Agregar fila de total
      data.push({
        'Fecha': '',
        'Concepto': '',
        'Tercero': '',
        'Categoría': '',
        'Método': 'TOTAL:',
        'Importe': type === 'EXPENSE' ? -filteredTotal : filteredTotal,
      });
      
      const worksheet = XLSX.utils.json_to_sheet(data);
      worksheet['!cols'] = [
        { wch: 12 }, // Fecha
        { wch: 35 }, // Concepto
        { wch: 25 }, // Tercero
        { wch: 15 }, // Categoría
        { wch: 15 }, // Método
        { wch: 15 }, // Importe
      ];
      
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, title);
      
      const fileName = `${title.replace(/\s+/g, '_')}_${monthLabel.replace(/\s+/g, '_')}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('Error exportando a Excel:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Función para exportar a PDF
  const handleExportPDF = async () => {
    if (filteredTransactions.length === 0) return;
    
    setIsExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });
      
      // Título
      doc.setFontSize(16);
      doc.setTextColor(33, 37, 41);
      doc.text(`${title} - ${monthLabel}`, 14, 15);
      
      // Subtítulo
      doc.setFontSize(10);
      doc.setTextColor(108, 117, 125);
      doc.text(`Exportado: ${new Date().toLocaleString('es-ES')} | ${filteredTransactions.length} movimientos`, 14, 22);
      
      // Total
      doc.setFontSize(12);
      doc.setTextColor(type === 'INCOME' ? 40 : 220, type === 'INCOME' ? 167 : 53, type === 'INCOME' ? 69 : 69);
      doc.text(`Total: ${formatCurrency(filteredTotal)}`, 250, 15, { align: 'right' });
      
      // Tabla
      const tableData = filteredTransactions.map(tx => [
        formatDate(tx.dueDate),
        (tx.description || '').substring(0, 35) + ((tx.description || '').length > 35 ? '...' : ''),
        (tx.thirdPartyName || '').substring(0, 25) + ((tx.thirdPartyName || '').length > 25 ? '...' : ''),
        tx.category || '',
        tx.paymentMethod === 'DIRECT_DEBIT' ? 'Domiciliación' : tx.paymentMethod === 'TRANSFER' ? 'Transferencia' : '',
        formatCurrency(tx.amount),
      ]);
      
      autoTable(doc, {
        startY: 28,
        head: [['Fecha', 'Concepto', 'Tercero', 'Categoría', 'Método', 'Importe']],
        body: tableData,
        foot: [['', '', '', '', 'TOTAL:', formatCurrency(filteredTotal)]],
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: type === 'INCOME' ? [34, 197, 94] : [239, 68, 68], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [243, 244, 246], textColor: [31, 41, 55], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 60 },
          2: { cellWidth: 45 },
          3: { cellWidth: 30 },
          4: { cellWidth: 30 },
          5: { cellWidth: 30, halign: 'right' },
        },
      });
      
      const fileName = `${title.replace(/\s+/g, '_')}_${monthLabel.replace(/\s+/g, '_')}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('Error exportando a PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-gray-50 to-white">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                {type === 'INCOME' ? (
                  <TrendingUp className="text-green-600" size={24} />
                ) : (
                  <TrendingDown className="text-red-600" size={24} />
                )}
                {title}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {monthLabel} • {filteredTransactions.length} de {transactions.length} movimiento{transactions.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={24} className="text-gray-400" />
            </button>
          </div>

          {/* Barra de filtros */}
          <div className="p-4 border-b bg-gray-50 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Búsqueda */}
              <div className="relative flex-1 min-w-[200px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por concepto, tercero..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              {/* Filtro categoría */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm bg-white min-w-[150px]"
              >
                <option value="">Todas las categorías</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              {/* Filtro método de pago (solo para gastos) */}
              {type === 'EXPENSE' && paymentMethods.length > 0 && (
                <select
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm bg-white min-w-[150px]"
                >
                  <option value="">Todos los métodos</option>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="DIRECT_DEBIT">Domiciliación</option>
                </select>
              )}

              {/* Toggle vista */}
              <div className="flex items-center border rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('grouped')}
                  className={`px-3 py-2 text-sm ${viewMode === 'grouped' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  <Calendar size={16} />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-2 text-sm ${viewMode === 'table' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  <Filter size={16} />
                </button>
              </div>

              {/* Botones de exportación */}
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={handleExportExcel}
                  disabled={isExporting || filteredTransactions.length === 0}
                  className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg bg-white text-gray-600 hover:bg-green-50 hover:text-green-700 hover:border-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Descargar Excel"
                >
                  <FileSpreadsheet size={16} />
                  <span className="hidden sm:inline">Excel</span>
                </button>
                <button
                  onClick={handleExportPDF}
                  disabled={isExporting || filteredTransactions.length === 0}
                  className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg bg-white text-gray-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Descargar PDF"
                >
                  <Download size={16} />
                  <span className="hidden sm:inline">PDF</span>
                </button>
              </div>
            </div>

            {/* Chips de filtros activos */}
            {(searchTerm || categoryFilter || methodFilter) && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Filtros:</span>
                {searchTerm && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                    &quot;{searchTerm}&quot;
                    <button onClick={() => setSearchTerm('')} className="hover:text-blue-900">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {categoryFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
                    {categoryFilter}
                    <button onClick={() => setCategoryFilter('')} className="hover:text-purple-900">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {methodFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full">
                    {methodFilter === 'TRANSFER' ? 'Transferencia' : 'Domiciliación'}
                    <button onClick={() => setMethodFilter('')} className="hover:text-green-900">
                      <X size={12} />
                    </button>
                  </span>
                )}
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setCategoryFilter('');
                    setMethodFilter('');
                  }}
                  className="text-gray-500 hover:text-gray-700 underline ml-2"
                >
                  Limpiar todo
                </button>
              </div>
            )}
          </div>

          {/* Contenido */}
          <div className="max-h-[55vh] overflow-y-auto">
            {filteredTransactions.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Search size={48} className="mx-auto mb-4 text-gray-300" />
                <p>No se encontraron transacciones con los filtros aplicados</p>
              </div>
            ) : viewMode === 'grouped' ? (
              /* Vista agrupada por semana */
              <div className="divide-y">
                {weekGroups.map((group) => (
                  <div key={group.weekKey}>
                    {/* Cabecera de semana */}
                    <button
                      onClick={() => toggleWeek(group.weekKey)}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {expandedWeeks.has(group.weekKey) ? (
                          <ChevronDown size={20} className="text-gray-400" />
                        ) : (
                          <ChevronRight size={20} className="text-gray-400" />
                        )}
                        <div className="text-left">
                          <span className="font-semibold text-gray-900">{group.weekLabel}</span>
                          <span className="text-sm text-gray-500 ml-2">({group.dateRange})</span>
                        </div>
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                          {group.transactions.length} mov.
                        </span>
                      </div>
                      <span className={`font-bold ${type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                        {type === 'INCOME' ? '+' : '-'}{formatCurrency(group.total)}
                      </span>
                    </button>
                    
                    {/* Transacciones de la semana */}
                    {expandedWeeks.has(group.weekKey) && (
                      <div className="bg-white">
                        <table className="w-full">
                          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                            <tr>
                              <th className="px-4 py-2 text-left">Fecha</th>
                              <th className="px-4 py-2 text-left">Concepto</th>
                              <th className="px-4 py-2 text-left">Tercero</th>
                              <th className="px-4 py-2 text-left">Categoría</th>
                              {type === 'EXPENSE' && <th className="px-4 py-2 text-left">Método</th>}
                              <th className="px-4 py-2 text-right">Importe</th>
                              {type === 'EXPENSE' && onConfirmDirectDebit && <th className="px-4 py-2 text-center w-16"></th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {group.transactions.map((tx) => (
                              <tr key={tx.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-600">
                                  {formatDate(tx.dueDate)}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-900 truncate max-w-[200px]">
                                      {tx.description || '-'}
                                    </span>
                                    {tx.invoiceNumber && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                                        <FileText size={10} className="mr-0.5" />
                                        {tx.invoiceNumber}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600 truncate max-w-[150px]">
                                  {tx.thirdPartyName || '-'}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                                    {tx.category}
                                  </span>
                                </td>
                                {type === 'EXPENSE' && (
                                  <td className="px-4 py-3">
                                    {tx.paymentMethod && (
                                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs ${
                                        tx.paymentMethod === 'TRANSFER' 
                                          ? 'bg-blue-50 text-blue-700' 
                                          : 'bg-purple-50 text-purple-700'
                                      }`}>
                                        {tx.paymentMethod === 'TRANSFER' ? (
                                          <><Send size={10} className="mr-1" /> Transf.</>
                                        ) : (
                                          <>
                                            <Building2 size={10} className="mr-1" />
                                            Dom.
                                            {tx.chargeAccountId && (
                                              <span className="ml-1 font-medium">
                                                · {getAccountName(tx.chargeAccountId)}
                                              </span>
                                            )}
                                          </>
                                        )}
                                      </span>
                                    )}
                                  </td>
                                )}
                                <td className={`px-4 py-3 text-right font-semibold ${
                                  type === 'INCOME' ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.amount)}
                                </td>
                                {type === 'EXPENSE' && onConfirmDirectDebit && (
                                  <td className="px-4 py-3 text-center">
                                    {tx.paymentMethod === 'DIRECT_DEBIT' && tx.status === 'PENDING' && (
                                      <button
                                        onClick={() => onConfirmDirectDebit(tx)}
                                        className="p-1.5 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors"
                                        title="Confirmar cargo del recibo"
                                      >
                                        <CheckCircle size={18} />
                                      </button>
                                    )}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* Vista de tabla plana */
              <table className="w-full">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <button 
                        onClick={() => toggleSort('date')}
                        className="flex items-center gap-1 hover:text-gray-700"
                      >
                        Fecha
                        <ArrowUpDown size={12} className={sortField === 'date' ? 'text-primary-600' : ''} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left">Concepto</th>
                    <th className="px-4 py-3 text-left">
                      <button 
                        onClick={() => toggleSort('thirdParty')}
                        className="flex items-center gap-1 hover:text-gray-700"
                      >
                        Tercero
                        <ArrowUpDown size={12} className={sortField === 'thirdParty' ? 'text-primary-600' : ''} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left">
                      <button 
                        onClick={() => toggleSort('category')}
                        className="flex items-center gap-1 hover:text-gray-700"
                      >
                        Categoría
                        <ArrowUpDown size={12} className={sortField === 'category' ? 'text-primary-600' : ''} />
                      </button>
                    </th>
                    {type === 'EXPENSE' && <th className="px-4 py-3 text-left">Método</th>}
                    <th className="px-4 py-3 text-right">
                      <button 
                        onClick={() => toggleSort('amount')}
                        className="flex items-center gap-1 hover:text-gray-700 ml-auto"
                      >
                        Importe
                        <ArrowUpDown size={12} className={sortField === 'amount' ? 'text-primary-600' : ''} />
                      </button>
                    </th>
                    {type === 'EXPENSE' && onConfirmDirectDebit && <th className="px-4 py-3 text-center w-16"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(tx.dueDate)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 truncate max-w-[200px]">
                            {tx.description || '-'}
                          </span>
                          {tx.invoiceNumber && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                              <FileText size={10} className="mr-0.5" />
                              {tx.invoiceNumber}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 truncate max-w-[150px]">
                        {tx.thirdPartyName || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                          {tx.category}
                        </span>
                      </td>
                      {type === 'EXPENSE' && (
                        <td className="px-4 py-3">
                          {tx.paymentMethod && (
                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs ${
                              tx.paymentMethod === 'TRANSFER' 
                                ? 'bg-blue-50 text-blue-700' 
                                : 'bg-purple-50 text-purple-700'
                            }`}>
                              {tx.paymentMethod === 'TRANSFER' ? (
                                <><Send size={10} className="mr-1" /> Transf.</>
                              ) : (
                                <>
                                  <Building2 size={10} className="mr-1" />
                                  Dom.
                                  {tx.chargeAccountId && (
                                    <span className="ml-1 font-medium">
                                      · {getAccountName(tx.chargeAccountId)}
                                    </span>
                                  )}
                                </>
                              )}
                            </span>
                          )}
                        </td>
                      )}
                      <td className={`px-4 py-3 text-right font-semibold ${
                        type === 'INCOME' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </td>
                      {type === 'EXPENSE' && onConfirmDirectDebit && (
                        <td className="px-4 py-3 text-center">
                          {tx.paymentMethod === 'DIRECT_DEBIT' && tx.status === 'PENDING' && (
                            <button
                              onClick={() => onConfirmDirectDebit(tx)}
                              className="p-1.5 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors"
                              title="Confirmar cargo del recibo"
                            >
                              <CheckCircle size={18} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="border-t p-5 bg-gradient-to-r from-gray-50 to-white rounded-b-xl">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {filteredTransactions.length !== transactions.length && (
                  <span>Mostrando {filteredTransactions.length} de {transactions.length} • </span>
                )}
                <span className="font-medium text-gray-700">Total{filteredTransactions.length !== transactions.length ? ' filtrado' : ''}:</span>
              </div>
              <span className={`text-2xl font-bold ${
                type === 'INCOME' ? 'text-green-600' : 'text-red-600'
              }`}>
                {type === 'INCOME' ? '+' : '-'}{formatCurrency(filteredTotal)}
              </span>
            </div>
            <div className="mt-4 flex justify-end">
              <Link
                href={`/transactions?type=${type}`}
                className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                Ver todas las transacciones
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helpers
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
