import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  DocumentData,
  QueryConstraint,
  writeBatch,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/config';
import {
  PayrollBatch,
  PayrollLine,
  PayrollBatchStatus,
  PayrollLineStatus,
  CreatePayrollBatchInput,
  CreatePayrollLineInput,
  UpdatePayrollLineInput,
  PayrollBatchSummary,
  PayrollValidationResult,
  PayrollValidationError,
  PayrollCopyResult,
  Worker,
} from '@/types';

const BATCHES_COLLECTION = 'payroll_batches';
const LINES_COLLECTION = 'payroll_lines';

// ============================================
// Funciones de conversión
// ============================================

function documentToBatch(id: string, data: DocumentData): PayrollBatch {
  return {
    id,
    userId: data.userId || '',
    companyId: data.companyId,
    year: data.year,
    month: data.month,
    title: data.title,
    payrollType: data.payrollType || 'MONTHLY',
    totalAmount: data.totalAmount || 0,
    workerCount: data.workerCount || 0,
    status: data.status || 'DRAFT',
    dueDate: data.dueDate?.toDate(),
    confirmedAt: data.confirmedAt?.toDate(),
    parentTransactionId: data.parentTransactionId,
    paymentOrderId: data.paymentOrderId,
    paymentOrderNumber: data.paymentOrderNumber,
    notes: data.notes,
    createdBy: data.createdBy,
    confirmedBy: data.confirmedBy,
    lastUpdatedBy: data.lastUpdatedBy,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
}

function documentToLine(id: string, data: DocumentData): PayrollLine {
  return {
    id,
    userId: data.userId || '',
    payrollBatchId: data.payrollBatchId,
    companyId: data.companyId,
    workerId: data.workerId,
    workerName: data.workerName,
    ibanSnapshot: data.ibanSnapshot,
    bankAliasSnapshot: data.bankAliasSnapshot,
    amount: data.amount || 0,
    status: data.status || 'PENDING',
    dueDate: data.dueDate?.toDate(),
    paidDate: data.paidDate?.toDate(),
    paymentOrderId: data.paymentOrderId,
    paymentOrderItemIndex: data.paymentOrderItemIndex,
    notes: data.notes,
    createdBy: data.createdBy,
    lastUpdatedBy: data.lastUpdatedBy,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
}

// ============================================
// Funciones de Lotes (Batches)
// ============================================

/**
 * Obtener lotes de nóminas con filtros
 */
export async function getPayrollBatches(options: {
  userId: string;
  companyId?: string;
  year?: number;
  month?: number;
  status?: PayrollBatchStatus;
}): Promise<PayrollBatch[]> {
  const db = getDb();
  const constraints: QueryConstraint[] = [
    where('userId', '==', options.userId)
  ];
  
  if (options.companyId) {
    constraints.push(where('companyId', '==', options.companyId));
  }
  if (options.year) {
    constraints.push(where('year', '==', options.year));
  }
  if (options.month) {
    constraints.push(where('month', '==', options.month));
  }
  if (options.status) {
    constraints.push(where('status', '==', options.status));
  }

  const q = query(collection(db, BATCHES_COLLECTION), ...constraints);
  const snapshot = await getDocs(q);
  
  const batches = snapshot.docs.map((docSnap) => documentToBatch(docSnap.id, docSnap.data()));
  
  // Ordenar por año/mes descendente
  return batches.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
}

/**
 * Obtener un lote por ID
 */
export async function getPayrollBatchById(id: string): Promise<PayrollBatch | null> {
  const db = getDb();
  const docRef = doc(db, BATCHES_COLLECTION, id);
  const snapshot = await getDoc(docRef);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  return documentToBatch(snapshot.id, snapshot.data());
}

/**
 * Obtener lote de un mes/año específico para una empresa
 */
export async function getPayrollBatchByPeriod(
  userId: string,
  companyId: string,
  year: number,
  month: number
): Promise<PayrollBatch | null> {
  const batches = await getPayrollBatches({ userId, companyId, year, month });
  return batches.length > 0 ? batches[0] : null;
}

/**
 * Crear un nuevo lote de nóminas
 */
export async function createPayrollBatch(userId: string, data: CreatePayrollBatchInput): Promise<PayrollBatch> {
  const db = getDb();
  
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  
  const payrollType = data.payrollType || 'MONTHLY';
  
  // Generar título según el tipo
  let title = data.title;
  if (!title) {
    switch (payrollType) {
      case 'MONTHLY':
        title = `Nóminas ${monthNames[data.month - 1]} ${data.year}`;
        break;
      case 'EXTRA_SUMMER':
        title = `Paga Extra Verano ${data.year}`;
        break;
      case 'EXTRA_CHRISTMAS':
        title = `Paga Extra Navidad ${data.year}`;
        break;
      case 'BONUS':
        title = `Bonus ${monthNames[data.month - 1]} ${data.year}`;
        break;
      default:
        title = `Pago Extraordinario ${monthNames[data.month - 1]} ${data.year}`;
    }
  }
  
  const docData = {
    userId,
    companyId: data.companyId,
    year: data.year,
    month: data.month,
    payrollType,
    title,
    totalAmount: 0,
    workerCount: 0,
    status: 'DRAFT' as PayrollBatchStatus,
    dueDate: data.dueDate ? Timestamp.fromDate(data.dueDate) : null,
    notes: data.notes || '',
    createdBy: userId,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, BATCHES_COLLECTION), docData);
  
  return {
    id: docRef.id,
    userId,
    companyId: data.companyId,
    year: data.year,
    month: data.month,
    payrollType,
    title,
    totalAmount: 0,
    workerCount: 0,
    status: 'DRAFT',
    dueDate: data.dueDate,
    notes: data.notes,
    createdBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Actualizar totales del lote
 */
export async function updateBatchTotals(batchId: string, userId: string): Promise<void> {
  const db = getDb();
  const lines = await getPayrollLines({ userId, payrollBatchId: batchId });
  
  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);
  const workerCount = lines.length;
  
  const docRef = doc(db, BATCHES_COLLECTION, batchId);
  await updateDoc(docRef, {
    totalAmount,
    workerCount,
    lastUpdatedBy: userId,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Actualizar estado del lote basado en líneas
 */
export async function updateBatchStatus(batchId: string, userId: string): Promise<PayrollBatchStatus> {
  const db = getDb();
  const lines = await getPayrollLines({ userId, payrollBatchId: batchId });
  
  if (lines.length === 0) {
    return 'DRAFT';
  }
  
  const paidCount = lines.filter(l => l.status === 'PAID').length;
  const cancelledCount = lines.filter(l => l.status === 'CANCELLED').length;
  const pendingCount = lines.filter(l => l.status === 'PENDING').length;
  
  let newStatus: PayrollBatchStatus;
  
  if (paidCount === 0 && cancelledCount === lines.length) {
    newStatus = 'CANCELLED';
  } else if (paidCount + cancelledCount === lines.length) {
    newStatus = 'COMPLETED';
  } else if (paidCount > 0) {
    newStatus = 'PARTIALLY_PAID';
  } else {
    newStatus = 'CONFIRMED'; // O 'DRAFT' si no estaba confirmado
  }
  
  const docRef = doc(db, BATCHES_COLLECTION, batchId);
  await updateDoc(docRef, {
    status: newStatus,
    lastUpdatedBy: userId,
    updatedAt: Timestamp.now(),
  });
  
  return newStatus;
}

// ============================================
// Funciones de Líneas
// ============================================

/**
 * Obtener líneas de nómina con filtros
 */
export async function getPayrollLines(options: {
  userId: string;
  payrollBatchId?: string;
  companyId?: string;
  workerId?: string;
  status?: PayrollLineStatus;
}): Promise<PayrollLine[]> {
  const db = getDb();
  const constraints: QueryConstraint[] = [
    where('userId', '==', options.userId)
  ];
  
  if (options.payrollBatchId) {
    constraints.push(where('payrollBatchId', '==', options.payrollBatchId));
  }
  if (options.companyId) {
    constraints.push(where('companyId', '==', options.companyId));
  }
  if (options.workerId) {
    constraints.push(where('workerId', '==', options.workerId));
  }
  if (options.status) {
    constraints.push(where('status', '==', options.status));
  }

  const q = query(collection(db, LINES_COLLECTION), ...constraints);
  const snapshot = await getDocs(q);
  
  const lines = snapshot.docs.map((docSnap) => documentToLine(docSnap.id, docSnap.data()));
  
  // Ordenar por nombre de trabajador
  return lines.sort((a, b) => a.workerName.localeCompare(b.workerName));
}

/**
 * Crear línea de nómina
 */
export async function createPayrollLine(
  userId: string,
  data: CreatePayrollLineInput,
  worker: Worker,
  companyId: string
): Promise<PayrollLine> {
  const db = getDb();
  
  const docData = {
    userId,
    payrollBatchId: data.payrollBatchId,
    companyId,
    workerId: data.workerId,
    workerName: worker.displayName,
    ibanSnapshot: worker.iban, // Snapshot del IBAN actual
    bankAliasSnapshot: worker.bankAlias,
    amount: data.amount,
    status: 'PENDING' as PayrollLineStatus,
    dueDate: data.dueDate ? Timestamp.fromDate(data.dueDate) : null,
    notes: data.notes || '',
    createdBy: userId,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, LINES_COLLECTION), docData);
  
  return {
    id: docRef.id,
    userId,
    payrollBatchId: data.payrollBatchId,
    companyId,
    workerId: data.workerId,
    workerName: worker.displayName,
    ibanSnapshot: worker.iban,
    bankAliasSnapshot: worker.bankAlias,
    amount: data.amount,
    status: 'PENDING',
    dueDate: data.dueDate,
    notes: data.notes,
    createdBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Crear múltiples líneas de nómina en batch
 */
export async function createPayrollLinesBatch(
  userId: string,
  batchId: string,
  companyId: string,
  entries: Array<{ worker: Worker; amount: number; dueDate?: Date }>
): Promise<PayrollLine[]> {
  const db = getDb();
  const batch = writeBatch(db);
  const lines: PayrollLine[] = [];
  const now = Timestamp.now();
  
  for (const entry of entries) {
    const docRef = doc(collection(db, LINES_COLLECTION));
    const lineData = {
      userId,
      payrollBatchId: batchId,
      companyId,
      workerId: entry.worker.id,
      workerName: entry.worker.displayName,
      ibanSnapshot: entry.worker.iban,
      bankAliasSnapshot: entry.worker.bankAlias,
      amount: entry.amount,
      status: 'PENDING' as PayrollLineStatus,
      dueDate: entry.dueDate ? Timestamp.fromDate(entry.dueDate) : null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    
    batch.set(docRef, lineData);
    
    lines.push({
      id: docRef.id,
      userId,
      payrollBatchId: batchId,
      companyId,
      workerId: entry.worker.id,
      workerName: entry.worker.displayName,
      ibanSnapshot: entry.worker.iban,
      bankAliasSnapshot: entry.worker.bankAlias,
      amount: entry.amount,
      status: 'PENDING',
      dueDate: entry.dueDate,
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  
  await batch.commit();
  return lines;
}

/**
 * Actualizar línea de nómina
 */
export async function updatePayrollLine(
  id: string,
  data: UpdatePayrollLineInput,
  userId: string
): Promise<void> {
  const db = getDb();
  const docRef = doc(db, LINES_COLLECTION, id);
  
  const updateData: Record<string, unknown> = {
    ...data,
    lastUpdatedBy: userId,
    updatedAt: Timestamp.now(),
  };
  
  if (data.dueDate) {
    updateData.dueDate = Timestamp.fromDate(data.dueDate);
  }
  if (data.paidDate) {
    updateData.paidDate = Timestamp.fromDate(data.paidDate);
  }
  
  await updateDoc(docRef, updateData);
}

/**
 * Marcar línea como pagada
 */
export async function markLineAsPaid(
  lineId: string,
  paidDate: Date,
  userId: string
): Promise<void> {
  await updatePayrollLine(lineId, {
    status: 'PAID',
    paidDate,
  }, userId);
}

/**
 * Eliminar línea de nómina
 */
export async function deletePayrollLine(id: string): Promise<void> {
  const db = getDb();
  const docRef = doc(db, LINES_COLLECTION, id);
  await deleteDoc(docRef);
}

/**
 * Eliminar todas las líneas de un lote
 */
export async function deleteAllLinesInBatch(
  userId: string,
  batchId: string
): Promise<number> {
  const db = getDb();
  const lines = await getPayrollLines({ userId, payrollBatchId: batchId });
  
  const batch = writeBatch(db);
  for (const line of lines) {
    const docRef = doc(db, LINES_COLLECTION, line.id);
    batch.delete(docRef);
  }
  
  await batch.commit();
  return lines.length;
}

// ============================================
// Funciones de Resumen y Validación
// ============================================

/**
 * Obtener resumen completo de un lote
 */
export async function getPayrollBatchSummary(
  batchId: string,
  userId: string
): Promise<PayrollBatchSummary | null> {
  const batch = await getPayrollBatchById(batchId);
  if (!batch) return null;
  
  const lines = await getPayrollLines({ userId, payrollBatchId: batchId });
  
  const pendingLines = lines.filter(l => l.status === 'PENDING');
  const paidLines = lines.filter(l => l.status === 'PAID');
  
  return {
    batch,
    lines,
    pendingCount: pendingLines.length,
    paidCount: paidLines.length,
    pendingAmount: pendingLines.reduce((sum, l) => sum + l.amount, 0),
    paidAmount: paidLines.reduce((sum, l) => sum + l.amount, 0),
  };
}

/**
 * Validar lote antes de confirmar
 */
export async function validatePayrollBatch(
  batchId: string,
  userId: string,
  workers: Worker[]
): Promise<PayrollValidationResult> {
  const lines = await getPayrollLines({ userId, payrollBatchId: batchId });
  const errors: PayrollValidationError[] = [];
  
  const workerMap = new Map(workers.map(w => [w.id, w]));
  const seenWorkers = new Set<string>();
  
  for (const line of lines) {
    const worker = workerMap.get(line.workerId);
    
    // Verificar duplicados
    if (seenWorkers.has(line.workerId)) {
      errors.push({
        workerId: line.workerId,
        workerName: line.workerName,
        errorType: 'DUPLICATE_WORKER',
        message: `Trabajador "${line.workerName}" aparece más de una vez en el lote`,
      });
    }
    seenWorkers.add(line.workerId);
    
    // Verificar que el trabajador existe y está activo
    if (!worker) {
      errors.push({
        workerId: line.workerId,
        workerName: line.workerName,
        errorType: 'INACTIVE_WORKER',
        message: `Trabajador "${line.workerName}" no encontrado en el maestro`,
      });
      continue;
    }
    
    if (worker.status !== 'ACTIVE') {
      errors.push({
        workerId: line.workerId,
        workerName: line.workerName,
        errorType: 'INACTIVE_WORKER',
        message: `Trabajador "${line.workerName}" está inactivo`,
      });
    }
    
    // Verificar IBAN
    if (!worker.iban || worker.iban.trim() === '') {
      errors.push({
        workerId: line.workerId,
        workerName: line.workerName,
        errorType: 'MISSING_IBAN',
        message: `Trabajador "${line.workerName}" no tiene IBAN registrado`,
      });
    }
    
    // Verificar importe
    if (!line.amount || line.amount <= 0) {
      errors.push({
        workerId: line.workerId,
        workerName: line.workerName,
        errorType: 'INVALID_AMOUNT',
        message: `Importe inválido para "${line.workerName}"`,
      });
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Copiar datos del mes anterior
 */
export async function copyFromPreviousMonth(
  userId: string,
  companyId: string,
  targetYear: number,
  targetMonth: number,
  workers: Worker[]
): Promise<PayrollCopyResult | null> {
  // Calcular mes anterior
  let prevYear = targetYear;
  let prevMonth = targetMonth - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear--;
  }
  
  // Buscar lote del mes anterior
  const prevBatch = await getPayrollBatchByPeriod(userId, companyId, prevYear, prevMonth);
  if (!prevBatch) {
    return null;
  }
  
  // Obtener líneas del mes anterior
  const prevLines = await getPayrollLines({ userId, payrollBatchId: prevBatch.id });
  if (prevLines.length === 0) {
    return null;
  }
  
  // Crear mapa de trabajadores activos
  const activeWorkers = new Map(
    workers.filter(w => w.status === 'ACTIVE').map(w => [w.id, w])
  );
  
  let copiedWorkers = 0;
  let skippedWorkers = 0;
  let totalAmount = 0;
  
  const result: Array<{ worker: Worker; amount: number }> = [];
  
  for (const prevLine of prevLines) {
    const worker = activeWorkers.get(prevLine.workerId);
    if (worker) {
      result.push({
        worker,
        amount: prevLine.amount,
      });
      copiedWorkers++;
      totalAmount += prevLine.amount;
    } else {
      skippedWorkers++;
    }
  }
  
  return {
    copiedWorkers,
    skippedWorkers,
    totalAmount,
  };
}

/**
 * Obtener último importe usado por trabajador
 */
export async function getLastAmountForWorker(
  userId: string,
  workerId: string
): Promise<number | null> {
  const db = getDb();
  const constraints: QueryConstraint[] = [
    where('userId', '==', userId),
    where('workerId', '==', workerId),
  ];

  const q = query(collection(db, LINES_COLLECTION), ...constraints);
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) return null;
  
  // Encontrar el más reciente
  const lines = snapshot.docs
    .map((docSnap) => documentToLine(docSnap.id, docSnap.data()))
    .sort((a, b) => {
      const dateA = a.createdAt?.getTime() || 0;
      const dateB = b.createdAt?.getTime() || 0;
      return dateB - dateA;
    });
  
  return lines[0]?.amount || null;
}

// ============================================
// Funciones de Confirmación e Integración
// ============================================

/**
 * Confirmar lote de nóminas
 */
export async function confirmPayrollBatch(
  batchId: string,
  userId: string
): Promise<void> {
  const db = getDb();
  const docRef = doc(db, BATCHES_COLLECTION, batchId);
  
  await updateDoc(docRef, {
    status: 'CONFIRMED' as PayrollBatchStatus,
    confirmedAt: Timestamp.now(),
    confirmedBy: userId,
    lastUpdatedBy: userId,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Cancelar lote de nóminas
 */
export async function cancelPayrollBatch(
  batchId: string,
  userId: string
): Promise<void> {
  const db = getDb();
  const docRef = doc(db, BATCHES_COLLECTION, batchId);
  
  await updateDoc(docRef, {
    status: 'CANCELLED' as PayrollBatchStatus,
    lastUpdatedBy: userId,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Vincular lote con transacción padre
 */
export async function linkBatchToTransaction(
  batchId: string,
  transactionId: string,
  userId: string
): Promise<void> {
  const db = getDb();
  const docRef = doc(db, BATCHES_COLLECTION, batchId);
  
  await updateDoc(docRef, {
    parentTransactionId: transactionId,
    lastUpdatedBy: userId,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Vincular lote con orden de pago
 */
export async function linkBatchToPaymentOrder(
  batchId: string,
  paymentOrderId: string,
  paymentOrderNumber: string,
  userId: string
): Promise<void> {
  const db = getDb();
  const docRef = doc(db, BATCHES_COLLECTION, batchId);
  
  await updateDoc(docRef, {
    paymentOrderId,
    paymentOrderNumber,
    lastUpdatedBy: userId,
    updatedAt: Timestamp.now(),
  });
}
