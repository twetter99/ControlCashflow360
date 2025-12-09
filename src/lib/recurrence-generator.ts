/**
 * Módulo para generación automática de ocurrencias de transacciones recurrentes
 */

import { Recurrence, RecurrenceFrequency, Transaction } from '@/types';
import { getAdminDb } from '@/lib/firebase/admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

/**
 * Calcula la próxima fecha de ocurrencia basada en la frecuencia
 */
export function calculateNextOccurrenceDate(
  currentDate: Date,
  frequency: RecurrenceFrequency,
  dayOfMonth?: number,
  dayOfWeek?: number
): Date {
  const next = new Date(currentDate);
  
  switch (frequency) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;
      
    case 'WEEKLY':
      // Avanzar al siguiente día de la semana especificado
      next.setDate(next.getDate() + 7);
      if (dayOfWeek !== undefined) {
        const currentDayOfWeek = next.getDay();
        const diff = (dayOfWeek - currentDayOfWeek + 7) % 7;
        if (diff > 0) {
          next.setDate(next.getDate() - 7 + diff);
        }
      }
      break;
      
    case 'BIWEEKLY':
      next.setDate(next.getDate() + 14);
      if (dayOfWeek !== undefined) {
        const currentDayOfWeek = next.getDay();
        const diff = (dayOfWeek - currentDayOfWeek + 7) % 7;
        if (diff > 0) {
          next.setDate(next.getDate() - 14 + diff);
        }
      }
      break;
      
    case 'MONTHLY':
      // IMPORTANTE: Primero poner día 1 para evitar overflow al cambiar de mes
      // Ej: Si estamos en 30/01 y sumamos 1 mes, JS hace 30/02 → 02/03 (overflow)
      // Solucion: Ir a día 1, sumar mes, luego ajustar al día correcto
      const currentMonth = next.getMonth();
      next.setDate(1); // Ir al día 1 primero
      next.setMonth(currentMonth + 1); // Ahora sumar el mes
      if (dayOfMonth) {
        // Ajustar para meses con menos días
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(dayOfMonth, maxDay));
      }
      break;
      
    case 'QUARTERLY':
      // Mismo fix que MONTHLY: evitar overflow
      const currentMonthQ = next.getMonth();
      next.setDate(1);
      next.setMonth(currentMonthQ + 3);
      if (dayOfMonth) {
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(dayOfMonth, maxDay));
      }
      break;
      
    case 'YEARLY':
      // Mismo fix: evitar overflow (ej: 29 feb en año no bisiesto)
      const currentMonthY = next.getMonth();
      const currentDayY = next.getDate();
      next.setDate(1);
      next.setFullYear(next.getFullYear() + 1);
      next.setMonth(currentMonthY); // Asegurar mismo mes
      if (dayOfMonth) {
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(dayOfMonth, maxDay));
      } else {
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(currentDayY, maxDay));
      }
      break;
      
    case 'NONE':
    default:
      // No debería llegar aquí para recurrencias
      break;
  }
  
  return next;
}

/**
 * Obtiene la primera fecha de ocurrencia basada en startDate y configuración
 */
export function getFirstOccurrenceDate(
  startDate: Date,
  frequency: RecurrenceFrequency,
  dayOfMonth?: number,
  dayOfWeek?: number
): Date {
  const first = new Date(startDate);
  
  if (frequency === 'WEEKLY' || frequency === 'BIWEEKLY') {
    // Ajustar al primer día de la semana correcto
    if (dayOfWeek !== undefined) {
      const currentDayOfWeek = first.getDay();
      const diff = (dayOfWeek - currentDayOfWeek + 7) % 7;
      first.setDate(first.getDate() + diff);
    }
  } else if (['MONTHLY', 'QUARTERLY', 'YEARLY'].includes(frequency)) {
    // Ajustar al día del mes
    if (dayOfMonth) {
      const maxDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      first.setDate(Math.min(dayOfMonth, maxDay));
      // Si el día ya pasó este mes, avanzar al siguiente período
      if (first < startDate) {
        return calculateNextOccurrenceDate(first, frequency, dayOfMonth, dayOfWeek);
      }
    }
  }
  
  return first;
}

/**
 * Genera las fechas de ocurrencia para una recurrencia
 */
export function generateOccurrenceDates(
  startDate: Date,
  endDate: Date | null | undefined,
  frequency: RecurrenceFrequency,
  dayOfMonth?: number,
  dayOfWeek?: number,
  maxDate?: Date
): Date[] {
  const dates: Date[] = [];
  const limitDate = maxDate || new Date(new Date().setMonth(new Date().getMonth() + 12));
  
  // Determinar fecha fin efectiva
  const effectiveEndDate = endDate && endDate < limitDate ? endDate : limitDate;
  
  let currentDate = getFirstOccurrenceDate(startDate, frequency, dayOfMonth, dayOfWeek);
  
  // Asegurar que la primera fecha no sea anterior a startDate
  if (currentDate < startDate) {
    currentDate = calculateNextOccurrenceDate(currentDate, frequency, dayOfMonth, dayOfWeek);
  }
  
  // Generar fechas hasta la fecha límite
  while (currentDate <= effectiveEndDate) {
    dates.push(new Date(currentDate));
    currentDate = calculateNextOccurrenceDate(currentDate, frequency, dayOfMonth, dayOfWeek);
    
    // Seguridad: máximo 100 ocurrencias
    if (dates.length >= 100) break;
  }
  
  return dates;
}

interface GenerateOccurrencesOptions {
  fromDate?: Date;
  monthsAhead?: number;
  skipExisting?: boolean;
}

interface GenerationResult {
  recurrenceId: string;
  generatedCount: number;
  transactionIds: string[];
  lastGeneratedDate: Date | null;
  skippedCount: number;
}

/**
 * Genera las transacciones para una recurrencia específica
 */
export async function generateTransactionsFromRecurrence(
  recurrence: Recurrence,
  userId: string,
  options: GenerateOccurrencesOptions = {}
): Promise<GenerationResult> {
  const db = getAdminDb();
  const {
    fromDate = new Date(),
    monthsAhead = recurrence.generateMonthsAhead || 6,
    skipExisting = true,
  } = options;
  
  const result: GenerationResult = {
    recurrenceId: recurrence.id,
    generatedCount: 0,
    transactionIds: [],
    lastGeneratedDate: null,
    skippedCount: 0,
  };
  
  // Calcular fecha límite de generación (siempre desde HOY + monthsAhead)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setMonth(maxDate.getMonth() + monthsAhead);
  
  // Obtener la fecha de inicio para generar
  // Siempre empezar desde la fecha original de la recurrencia para no perder ocurrencias
  // El sistema de skipExisting evitará duplicados
  const startFrom = new Date(recurrence.startDate);
  
  console.log(`[RecurrenceGenerator] Generando fechas desde ${startFrom.toISOString()} hasta ${maxDate.toISOString()}`);
  
  // Generar fechas de ocurrencia
  const dates = generateOccurrenceDates(
    startFrom,
    recurrence.endDate,
    recurrence.frequency,
    recurrence.dayOfMonth,
    recurrence.dayOfWeek,
    maxDate
  );
  
  console.log(`[RecurrenceGenerator] Fechas generadas: ${dates.map(d => d.toISOString().split('T')[0]).join(', ')}`);
  
  if (dates.length === 0) {
    return result;
  }
  
  // Si skipExisting, buscar transacciones ya generadas
  // Buscar por tercero + tipo + monto + fecha para detectar duplicados
  // aunque vengan de diferentes recurrencias o tengan diferentes nombres
  let existingDates = new Set<string>();
  if (skipExisting) {
    // Buscar por recurrenceId (las de esta misma recurrencia)
    const existingSnapshot = await db.collection('transactions')
      .where('recurrenceId', '==', recurrence.id)
      .where('userId', '==', userId)
      .get();
    
    existingSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const dueDate = data.dueDate?.toDate?.() || new Date(data.dueDate);
      const dateKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
      existingDates.add(dateKey);
    });
    
    // Buscar por thirdPartyId + tipo + monto (detecta duplicados de otras recurrencias)
    if (recurrence.thirdPartyId) {
      const existingByThirdPartySnapshot = await db.collection('transactions')
        .where('userId', '==', userId)
        .where('companyId', '==', recurrence.companyId)
        .where('thirdPartyId', '==', recurrence.thirdPartyId)
        .where('type', '==', recurrence.type)
        .where('amount', '==', recurrence.baseAmount)
        .get();
      
      existingByThirdPartySnapshot.docs.forEach(doc => {
        const data = doc.data();
        const dueDate = data.dueDate?.toDate?.() || new Date(data.dueDate);
        const dateKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
        existingDates.add(dateKey);
      });
    }
  }
  
  console.log(`[RecurrenceGenerator] Fechas existentes: ${Array.from(existingDates).join(', ')}`);
  
  // Preparar batch para inserción
  const batch = db.batch();
  const now = Timestamp.now();
  
  for (const date of dates) {
    // Usar zona horaria LOCAL para la comparación
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    // Saltar si ya existe
    if (existingDates.has(dateKey)) {
      result.skippedCount++;
      continue;
    }
    
    const transactionRef = db.collection('transactions').doc();
    const instanceDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    const transactionData = {
      userId,
      companyId: recurrence.companyId,
      accountId: recurrence.accountId || null,
      type: recurrence.type,
      amount: recurrence.baseAmount,
      status: 'PENDING',
      dueDate: Timestamp.fromDate(date),
      paidDate: null,
      category: recurrence.category || '',
      description: recurrence.name,
      thirdPartyId: recurrence.thirdPartyId || null,
      thirdPartyName: recurrence.thirdPartyName || '',
      notes: recurrence.notes || '',
      recurrence: recurrence.frequency,
      certainty: recurrence.certainty,
      recurrenceId: recurrence.id,
      isRecurrenceInstance: true,
      instanceDate,
      overriddenFromRecurrence: false,
      createdBy: userId,
      lastUpdatedBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    
    batch.set(transactionRef, transactionData);
    result.transactionIds.push(transactionRef.id);
    result.generatedCount++;
    
    // Actualizar última fecha generada
    if (!result.lastGeneratedDate || date > result.lastGeneratedDate) {
      result.lastGeneratedDate = date;
    }
  }
  
  // Ejecutar batch si hay transacciones a crear
  if (result.generatedCount > 0) {
    await batch.commit();
    
    // Actualizar la recurrencia con la última fecha generada
    await db.collection('recurrences').doc(recurrence.id).update({
      lastGeneratedDate: result.lastGeneratedDate ? Timestamp.fromDate(result.lastGeneratedDate) : null,
      nextOccurrenceDate: dates.length > 0 
        ? Timestamp.fromDate(calculateNextOccurrenceDate(
            dates[dates.length - 1],
            recurrence.frequency,
            recurrence.dayOfMonth,
            recurrence.dayOfWeek
          ))
        : null,
      updatedAt: now,
    });
  }
  
  return result;
}

/**
 * Regenera transacciones para todas las recurrencias activas de un usuario
 */
export async function regenerateAllUserRecurrences(
  userId: string,
  companyId?: string,
  options: GenerateOccurrencesOptions = {}
): Promise<GenerationResult[]> {
  const db = getAdminDb();
  
  // Buscar recurrencias activas
  let query = db.collection('recurrences')
    .where('userId', '==', userId)
    .where('status', '==', 'ACTIVE');
  
  const snapshot = await query.get();
  
  const results: GenerationResult[] = [];
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    // Filtrar por companyId si se especifica
    if (companyId && data.companyId !== companyId) {
      continue;
    }
    
    const recurrence: Recurrence = {
      id: doc.id,
      userId: data.userId,
      companyId: data.companyId,
      type: data.type,
      name: data.name,
      baseAmount: data.baseAmount,
      category: data.category || '',
      thirdPartyId: data.thirdPartyId,
      thirdPartyName: data.thirdPartyName || '',
      accountId: data.accountId,
      certainty: data.certainty || 'HIGH',
      notes: data.notes || '',
      frequency: data.frequency,
      dayOfMonth: data.dayOfMonth,
      dayOfWeek: data.dayOfWeek,
      startDate: data.startDate?.toDate?.() || new Date(data.startDate),
      endDate: data.endDate?.toDate?.() || null,
      generateMonthsAhead: data.generateMonthsAhead || 6,
      lastGeneratedDate: data.lastGeneratedDate?.toDate?.() || undefined,
      nextOccurrenceDate: data.nextOccurrenceDate?.toDate?.() || undefined,
      status: data.status,
      createdBy: data.createdBy,
      lastUpdatedBy: data.lastUpdatedBy,
      createdAt: data.createdAt?.toDate?.(),
      updatedAt: data.updatedAt?.toDate?.(),
    };
    
    const result = await generateTransactionsFromRecurrence(recurrence, userId, options);
    results.push(result);
  }
  
  return results;
}

/**
 * Elimina transacciones futuras pendientes de una recurrencia
 */
export async function deleteFutureOccurrences(
  recurrenceId: string,
  userId: string,
  fromDate: Date = new Date()
): Promise<number> {
  const db = getAdminDb();
  
  // Buscar transacciones pendientes futuras
  const snapshot = await db.collection('transactions')
    .where('recurrenceId', '==', recurrenceId)
    .where('userId', '==', userId)
    .where('status', '==', 'PENDING')
    .get();
  
  let deletedCount = 0;
  const batch = db.batch();
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const dueDate = data.dueDate?.toDate?.() || new Date(data.dueDate);
    
    // Solo eliminar si es futura y no fue modificada manualmente
    if (dueDate >= fromDate && !data.overriddenFromRecurrence) {
      batch.delete(doc.ref);
      deletedCount++;
    }
  }
  
  if (deletedCount > 0) {
    await batch.commit();
  }
  
  return deletedCount;
}
