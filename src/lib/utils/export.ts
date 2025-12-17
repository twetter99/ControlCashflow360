/**
 * Utilidades para exportar transacciones a Excel y PDF
 */

import { Transaction, Company, Account } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';

interface ExportOptions {
  transactions: Transaction[];
  companies: { id: string; name: string }[];
  accounts: Account[];
  filters: {
    horizon: string;
    company: string;
    account: string;
    thirdParty: string;
    status: string;
    type: string;
  };
}

// Mapeo de estados
const statusLabels: Record<string, string> = {
  PENDING: 'Pendiente',
  PAID: 'Pagado',
  CANCELLED: 'Cancelado',
  OVERDUE: 'Vencido',
};

// Mapeo de tipos
const typeLabels: Record<string, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
};

// Mapeo de horizontes
const horizonLabels: Record<string, string> = {
  '1M': 'Próximo mes',
  '3M': 'Próximos 3 meses',
  '6M': 'Próximos 6 meses',
  '12M': 'Próximos 12 meses',
  'ALL': 'Todos',
};

/**
 * Prepara los datos de transacciones para exportar
 */
function prepareExportData(options: ExportOptions) {
  const { transactions, companies, accounts } = options;
  
  const companyMap = new Map(companies.map(c => [c.id, c.name]));
  const accountMap = new Map(accounts.map(a => [a.id, a.bankName + ' - ' + a.accountNumber.slice(-4)]));
  
  return transactions.map(tx => ({
    'Fecha Vencimiento': formatDate(tx.dueDate),
    'Descripción': tx.description || '',
    'Tercero': tx.thirdPartyName || '',
    'Categoría': tx.category || '',
    'Tipo': typeLabels[tx.type] || tx.type,
    'Importe': tx.type === 'EXPENSE' ? -tx.amount : tx.amount,
    'Importe Formateado': formatCurrency(tx.type === 'EXPENSE' ? -tx.amount : tx.amount),
    'Estado': statusLabels[tx.status] || tx.status,
    'Empresa': companyMap.get(tx.companyId) || '',
    'Cuenta': tx.chargeAccountId ? (accountMap.get(tx.chargeAccountId) || '') : '',
    'Nº Factura': tx.invoiceNumber || '',
    'Notas': tx.notes || '',
  }));
}

/**
 * Genera descripción de los filtros aplicados
 */
function getFilterDescription(filters: ExportOptions['filters']): string {
  const parts: string[] = [];
  
  if (filters.horizon !== 'ALL') {
    parts.push(`Período: ${horizonLabels[filters.horizon] || filters.horizon}`);
  }
  if (filters.company !== 'ALL' && filters.company !== '') {
    parts.push(`Empresa: ${filters.company}`);
  }
  if (filters.account !== 'ALL' && filters.account !== '') {
    parts.push(`Banco: ${filters.account}`);
  }
  if (filters.thirdParty !== 'ALL' && filters.thirdParty !== '') {
    parts.push(`Tercero: ${filters.thirdParty}`);
  }
  if (filters.status !== 'ALL') {
    parts.push(`Estado: ${statusLabels[filters.status] || filters.status}`);
  }
  if (filters.type !== 'ALL') {
    parts.push(`Tipo: ${typeLabels[filters.type] || filters.type}`);
  }
  
  return parts.length > 0 ? parts.join(' | ') : 'Sin filtros aplicados';
}

/**
 * Exporta las transacciones a Excel (.xlsx)
 */
export async function exportToExcel(options: ExportOptions): Promise<void> {
  // Importar dinámicamente para reducir bundle inicial
  const XLSX = await import('xlsx');
  
  const data = prepareExportData(options);
  
  // Crear hoja de datos
  const worksheet = XLSX.utils.json_to_sheet(data.map(row => ({
    'Fecha Vencimiento': row['Fecha Vencimiento'],
    'Descripción': row['Descripción'],
    'Tercero': row['Tercero'],
    'Categoría': row['Categoría'],
    'Tipo': row['Tipo'],
    'Importe': row['Importe'],
    'Estado': row['Estado'],
    'Empresa': row['Empresa'],
    'Cuenta': row['Cuenta'],
    'Nº Factura': row['Nº Factura'],
    'Notas': row['Notas'],
  })));
  
  // Ajustar anchos de columna
  const colWidths = [
    { wch: 15 }, // Fecha
    { wch: 35 }, // Descripción
    { wch: 25 }, // Tercero
    { wch: 15 }, // Categoría
    { wch: 10 }, // Tipo
    { wch: 15 }, // Importe
    { wch: 12 }, // Estado
    { wch: 20 }, // Empresa
    { wch: 20 }, // Cuenta
    { wch: 15 }, // Nº Factura
    { wch: 30 }, // Notas
  ];
  worksheet['!cols'] = colWidths;
  
  // Crear libro
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Movimientos');
  
  // Agregar hoja de resumen
  const summaryData = [
    ['WINFIN Tesorería - Exportación de Movimientos'],
    [''],
    ['Fecha de exportación:', new Date().toLocaleString('es-ES')],
    ['Filtros aplicados:', getFilterDescription(options.filters)],
    ['Total de registros:', data.length.toString()],
    [''],
    ['Resumen:'],
    ['Total Ingresos:', formatCurrency(options.transactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + t.amount, 0))],
    ['Total Gastos:', formatCurrency(options.transactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amount, 0))],
    ['Neto:', formatCurrency(
      options.transactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + t.amount, 0) -
      options.transactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amount, 0)
    )],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 25 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');
  
  // Generar archivo y descargar
  const fileName = `movimientos_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

/**
 * Exporta las transacciones a PDF
 */
export async function exportToPDF(options: ExportOptions): Promise<void> {
  // Importar dinámicamente
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  
  const data = prepareExportData(options);
  
  // Crear documento A4 horizontal
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });
  
  // Título
  doc.setFontSize(18);
  doc.setTextColor(33, 37, 41);
  doc.text('WINFIN Tesorería - Movimientos', 14, 15);
  
  // Subtítulo con filtros
  doc.setFontSize(10);
  doc.setTextColor(108, 117, 125);
  doc.text(`Exportado: ${new Date().toLocaleString('es-ES')}`, 14, 22);
  doc.text(getFilterDescription(options.filters), 14, 27);
  
  // Calcular totales
  const totalIngresos = options.transactions
    .filter(t => t.type === 'INCOME' && t.status === 'PENDING')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalGastos = options.transactions
    .filter(t => t.type === 'EXPENSE' && t.status === 'PENDING')
    .reduce((sum, t) => sum + t.amount, 0);
  const neto = totalIngresos - totalGastos;
  
  // Resumen en cabecera
  doc.setFontSize(9);
  doc.setTextColor(40, 167, 69);
  doc.text(`Cobros Pendientes: ${formatCurrency(totalIngresos)}`, 200, 15);
  doc.setTextColor(220, 53, 69);
  doc.text(`Pagos Pendientes: ${formatCurrency(totalGastos)}`, 200, 20);
  doc.setTextColor(neto >= 0 ? 40 : 220, neto >= 0 ? 167 : 53, neto >= 0 ? 69 : 69);
  doc.text(`Neto: ${formatCurrency(neto)}`, 200, 25);
  
  // Tabla de datos
  const tableData = data.map(row => [
    row['Fecha Vencimiento'],
    row['Descripción'].substring(0, 30) + (row['Descripción'].length > 30 ? '...' : ''),
    row['Tercero'].substring(0, 20) + (row['Tercero'].length > 20 ? '...' : ''),
    row['Categoría'],
    row['Tipo'],
    row['Importe Formateado'],
    row['Estado'],
    row['Empresa'].substring(0, 15) + (row['Empresa'].length > 15 ? '...' : ''),
  ]);
  
  autoTable(doc, {
    startY: 32,
    head: [['Fecha', 'Descripción', 'Tercero', 'Categoría', 'Tipo', 'Importe', 'Estado', 'Empresa']],
    body: tableData,
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 22 },  // Fecha
      1: { cellWidth: 50 },  // Descripción
      2: { cellWidth: 35 },  // Tercero
      3: { cellWidth: 25 },  // Categoría
      4: { cellWidth: 18 },  // Tipo
      5: { cellWidth: 25, halign: 'right' },  // Importe
      6: { cellWidth: 20 },  // Estado
      7: { cellWidth: 30 },  // Empresa
    },
    didParseCell: (data) => {
      // Colorear importes según tipo
      if (data.column.index === 5 && data.section === 'body') {
        const value = data.cell.text[0] || '';
        if (value.startsWith('-')) {
          data.cell.styles.textColor = [220, 53, 69]; // Rojo para gastos
        } else {
          data.cell.styles.textColor = [40, 167, 69]; // Verde para ingresos
        }
      }
      // Colorear estados
      if (data.column.index === 6 && data.section === 'body') {
        const status = data.cell.text[0] || '';
        if (status === 'Pendiente') {
          data.cell.styles.textColor = [255, 193, 7];
        } else if (status === 'Pagado') {
          data.cell.styles.textColor = [40, 167, 69];
        } else if (status === 'Vencido') {
          data.cell.styles.textColor = [220, 53, 69];
        }
      }
    },
  });
  
  // Pie de página con número de registros
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(108, 117, 125);
    doc.text(
      `Página ${i} de ${pageCount} | Total: ${data.length} movimientos`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }
  
  // Descargar
  const fileName = `movimientos_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
