/**
 * Cloud Functions para WINFIN Tesorería
 * 
 * 1. calculateRunway - Calcula días de runway cuando cambian saldos
 * 2. projectCashflow - Genera proyección de flujo de caja
 * 3. checkAlerts - Evalúa configuraciones de alertas
 * 4. checkStaleData - Verifica datos sin actualizar (scheduled)
 * 5. generateRecurrences - Genera movimientos recurrentes (scheduled)
 * 6. createDailySnapshot - Crea snapshot diario (scheduled 23:59)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { db, Account, CreditLine, Transaction, AlertConfig, formatCurrency } from './config';

// ============================
// 1. CALCULATE RUNWAY
// ============================
/**
 * Trigger: Cuando se actualiza el saldo de una cuenta o se modifica un movimiento
 * Calcula el runway en días basado en:
 * - Liquidez actual (saldos + crédito disponible)
 * - Promedio de salidas de los últimos 90 días
 */
export const calculateRunway = functions.firestore
  .document('accounts/{accountId}')
  .onUpdate(async (change, context) => {
    const after = change.after.data() as Account;
    const companyId = after.companyId;

    try {
      // Obtener todas las cuentas de la empresa
      const accountsSnap = await db.collection('accounts')
        .where('companyId', '==', companyId)
        .where('status', '==', 'ACTIVE')
        .get();

      let totalLiquidity = 0;
      accountsSnap.forEach(doc => {
        totalLiquidity += (doc.data() as Account).balance;
      });

      // Obtener pólizas de crédito
      const creditLinesSnap = await db.collection('creditLines')
        .where('companyId', '==', companyId)
        .where('status', '==', 'ACTIVE')
        .get();

      let totalCreditAvailable = 0;
      creditLinesSnap.forEach(doc => {
        const line = doc.data() as CreditLine;
        totalCreditAvailable += (line.limit - line.drawn);
      });

      // Calcular promedio de gastos de los últimos 90 días
      const ninetyDaysAgo = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      );

      const expensesSnap = await db.collection('transactions')
        .where('companyId', '==', companyId)
        .where('type', '==', 'EXPENSE')
        .where('status', '==', 'COMPLETED')
        .where('dueDate', '>=', ninetyDaysAgo)
        .get();

      let totalExpenses = 0;
      expensesSnap.forEach(doc => {
        totalExpenses += (doc.data() as Transaction).amount;
      });

      const avgDailyExpense = totalExpenses / 90;
      
      // Calcular runway
      const totalAvailable = totalLiquidity + totalCreditAvailable;
      const runwayDays = avgDailyExpense > 0 
        ? Math.floor(totalAvailable / avgDailyExpense)
        : 999; // Sin gastos = runway infinito

      // Actualizar en la empresa
      await db.collection('companies').doc(companyId).update({
        calculatedRunway: runwayDays,
        totalLiquidity,
        totalCreditAvailable,
        lastCalculated: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Runway calculado para ${companyId}: ${runwayDays} días`);

      // Verificar alertas de runway crítico
      await checkRunwayAlert(companyId, runwayDays);

    } catch (error) {
      console.error('Error calculando runway:', error);
    }
  });

async function checkRunwayAlert(companyId: string, runwayDays: number): Promise<void> {
  const alertsSnap = await db.collection('alertConfigs')
    .where('type', '==', 'CRITICAL_RUNWAY')
    .where('enabled', '==', true)
    .get();

  for (const doc of alertsSnap.docs) {
    const config = doc.data() as AlertConfig;
    
    // Verificar si aplica a esta empresa o a todas
    if (config.companyId && config.companyId !== companyId) continue;

    if (runwayDays < config.threshold) {
      await db.collection('alerts').add({
        configId: doc.id,
        companyId,
        type: 'CRITICAL_RUNWAY',
        message: `Runway crítico: Solo quedan ${runwayDays} días de operación`,
        severity: runwayDays < 15 ? 'CRITICAL' : 'HIGH',
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
}

// ============================
// 2. PROJECT CASHFLOW
// ============================
/**
 * HTTP callable function para generar proyección de flujo de caja
 * Genera proyección diaria para los próximos 120 días
 */
export const projectCashflow = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { companyId, days = 120 } = data;

  try {
    // Obtener liquidez actual
    const accountsSnap = await db.collection('accounts')
      .where('companyId', '==', companyId)
      .where('status', '==', 'ACTIVE')
      .get();

    let currentBalance = 0;
    accountsSnap.forEach(doc => {
      currentBalance += (doc.data() as Account).balance;
    });

    // Obtener movimientos pendientes
    const today = admin.firestore.Timestamp.now();
    const endDate = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    );

    const transactionsSnap = await db.collection('transactions')
      .where('companyId', '==', companyId)
      .where('status', '==', 'PENDING')
      .where('dueDate', '>=', today)
      .where('dueDate', '<=', endDate)
      .orderBy('dueDate')
      .get();

    // Agrupar por día
    const projection: { [date: string]: { incomes: number; expenses: number; balance: number } } = {};
    let runningBalance = currentBalance;

    // Inicializar todos los días
    for (let i = 0; i <= days; i++) {
      const date = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      projection[dateKey] = {
        incomes: 0,
        expenses: 0,
        balance: runningBalance
      };
    }

    // Agregar movimientos
    transactionsSnap.forEach(doc => {
      const tx = doc.data() as Transaction;
      const dateKey = tx.dueDate.toDate().toISOString().split('T')[0];
      
      if (projection[dateKey]) {
        if (tx.type === 'INCOME') {
          projection[dateKey].incomes += tx.amount;
        } else {
          projection[dateKey].expenses += tx.amount;
        }
      }
    });

    // Calcular balance acumulado
    const dates = Object.keys(projection).sort();
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const dayData = projection[date];
      
      if (i === 0) {
        dayData.balance = currentBalance + dayData.incomes - dayData.expenses;
      } else {
        const prevBalance = projection[dates[i - 1]].balance;
        dayData.balance = prevBalance + dayData.incomes - dayData.expenses;
      }
    }

    // Calcular métricas de resumen
    const projectionArray = dates.map(date => ({
      date,
      ...projection[date]
    }));

    const minBalance = Math.min(...projectionArray.map(d => d.balance));
    const minBalanceDate = projectionArray.find(d => d.balance === minBalance)?.date;

    return {
      success: true,
      projection: projectionArray,
      summary: {
        currentBalance,
        minBalance,
        minBalanceDate,
        totalProjectedIncomes: projectionArray.reduce((sum, d) => sum + d.incomes, 0),
        totalProjectedExpenses: projectionArray.reduce((sum, d) => sum + d.expenses, 0),
      }
    };

  } catch (error) {
    console.error('Error proyectando cashflow:', error);
    throw new functions.https.HttpsError('internal', 'Error al generar proyección');
  }
});

// ============================
// 3. CHECK ALERTS
// ============================
/**
 * Trigger: Cuando se crea o modifica una configuración de alerta
 * Evalúa todas las condiciones de alerta configuradas
 */
export const checkAlerts = functions.firestore
  .document('alertConfigs/{configId}')
  .onWrite(async (change, context) => {
    const config = change.after.exists 
      ? change.after.data() as AlertConfig 
      : null;

    if (!config || !config.enabled) return;

    try {
      await evaluateAlertConfig(context.params.configId, config);
    } catch (error) {
      console.error('Error evaluando alerta:', error);
    }
  });

async function evaluateAlertConfig(configId: string, config: AlertConfig): Promise<void> {
  const companyFilter = config.companyId 
    ? [config.companyId] 
    : (await db.collection('companies').where('status', '==', 'ACTIVE').get()).docs.map(d => d.id);

  for (const companyId of companyFilter) {
    let shouldAlert = false;
    let message = '';
    let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM';

    switch (config.type) {
      case 'MIN_LIQUIDITY': {
        const accountsSnap = await db.collection('accounts')
          .where('companyId', '==', companyId)
          .where('status', '==', 'ACTIVE')
          .get();

        let totalLiquidity = 0;
        accountsSnap.forEach(doc => {
          totalLiquidity += (doc.data() as Account).balance;
        });

        if (totalLiquidity < config.threshold) {
          shouldAlert = true;
          message = `Liquidez por debajo del umbral: ${formatCurrency(totalLiquidity)} < ${formatCurrency(config.threshold)}`;
          severity = totalLiquidity < config.threshold * 0.5 ? 'CRITICAL' : 'HIGH';
        }
        break;
      }

      case 'LOW_CREDIT_LINE': {
        const creditLinesSnap = await db.collection('creditLines')
          .where('companyId', '==', companyId)
          .where('status', '==', 'ACTIVE')
          .get();

        for (const doc of creditLinesSnap.docs) {
          const line = doc.data() as CreditLine;
          const available = line.limit - line.drawn;
          const percentAvailable = (available / line.limit) * 100;

          if (percentAvailable < config.threshold) {
            shouldAlert = true;
            message = `Póliza ${line.bankName} con solo ${percentAvailable.toFixed(1)}% disponible`;
            severity = percentAvailable < 10 ? 'HIGH' : 'MEDIUM';
          }
        }
        break;
      }

      case 'CONCENTRATED_MATURITIES': {
        // Verificar vencimientos en la próxima semana
        const nextWeek = admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        );

        const expensesSnap = await db.collection('transactions')
          .where('companyId', '==', companyId)
          .where('type', '==', 'EXPENSE')
          .where('status', '==', 'PENDING')
          .where('dueDate', '<=', nextWeek)
          .get();

        let totalExpenses = 0;
        expensesSnap.forEach(doc => {
          totalExpenses += (doc.data() as Transaction).amount;
        });

        if (totalExpenses > config.threshold) {
          shouldAlert = true;
          message = `${formatCurrency(totalExpenses)} en vencimientos la próxima semana`;
          severity = totalExpenses > config.threshold * 1.5 ? 'HIGH' : 'MEDIUM';
        }
        break;
      }
    }

    if (shouldAlert) {
      // Verificar que no exista una alerta similar reciente (últimas 24h)
      const recentAlertSnap = await db.collection('alerts')
        .where('configId', '==', configId)
        .where('companyId', '==', companyId)
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(
          new Date(Date.now() - 24 * 60 * 60 * 1000)
        ))
        .limit(1)
        .get();

      if (recentAlertSnap.empty) {
        await db.collection('alerts').add({
          configId,
          companyId,
          type: config.type,
          message,
          severity,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }
}

// ============================
// 4. CHECK STALE DATA
// ============================
/**
 * Scheduled: Cada 6 horas
 * Verifica cuentas que no se han actualizado en más de 48 horas
 */
export const checkStaleData = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    const fortyEightHoursAgo = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 48 * 60 * 60 * 1000)
    );

    try {
      // Obtener configuraciones de alertas de datos caducados
      const staleConfigsSnap = await db.collection('alertConfigs')
        .where('type', '==', 'STALE_DATA')
        .where('enabled', '==', true)
        .get();

      if (staleConfigsSnap.empty) return null;

      // Buscar cuentas sin actualizar
      const staleAccountsSnap = await db.collection('accounts')
        .where('status', '==', 'ACTIVE')
        .where('lastUpdated', '<', fortyEightHoursAgo)
        .get();

      for (const accountDoc of staleAccountsSnap.docs) {
        const account = accountDoc.data() as Account;
        const lastUpdate = account.lastUpdated.toDate();
        const hoursAgo = Math.floor((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60));

        // Crear alerta si no existe una reciente
        const recentAlertSnap = await db.collection('alerts')
          .where('type', '==', 'STALE_DATA')
          .where('companyId', '==', account.companyId)
          .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(
            new Date(Date.now() - 24 * 60 * 60 * 1000)
          ))
          .limit(1)
          .get();

        if (recentAlertSnap.empty) {
          await db.collection('alerts').add({
            configId: staleConfigsSnap.docs[0].id,
            companyId: account.companyId,
            type: 'STALE_DATA',
            message: `La cuenta ${account.accountName} de ${account.bankName} no se ha actualizado en ${hoursAgo} horas`,
            severity: hoursAgo > 72 ? 'HIGH' : 'MEDIUM',
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      console.log(`Verificados ${staleAccountsSnap.size} cuentas con datos caducados`);
      return null;

    } catch (error) {
      console.error('Error verificando datos caducados:', error);
      return null;
    }
  });

// ============================
// 5. GENERATE RECURRENCES
// ============================

/**
 * Calcula la próxima fecha de ocurrencia basada en la frecuencia
 * IMPORTANTE: Usa técnica de "día 1 primero" para evitar overflow de fechas
 * Ej: Si estamos en 31/01 y sumamos 1 mes, JS hace 31/02 → 03/03 (overflow)
 * Solución: Ir a día 1, sumar mes, luego ajustar al día correcto
 */
function calculateNextOccurrenceDate(
  currentDate: Date,
  frequency: string,
  dayOfMonth?: number,
  dayOfWeek?: number
): Date {
  const next = new Date(currentDate);
  const originalDay = dayOfMonth || currentDate.getDate();
  
  switch (frequency) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;
    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      break;
    case 'BIWEEKLY':
      next.setDate(next.getDate() + 14);
      break;
    case 'MONTHLY': {
      // Evitar overflow: ir al día 1 primero, sumar mes, luego ajustar día
      const currentMonth = next.getMonth();
      next.setDate(1);
      next.setMonth(currentMonth + 1);
      const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(originalDay, maxDay));
      break;
    }
    case 'QUARTERLY': {
      // Evitar overflow: ir al día 1 primero, sumar 3 meses, luego ajustar día
      const currentMonth = next.getMonth();
      next.setDate(1);
      next.setMonth(currentMonth + 3);
      const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(originalDay, maxDay));
      break;
    }
    case 'YEARLY': {
      // Evitar overflow: ir al día 1 primero, sumar año, luego ajustar día
      const currentMonth = next.getMonth();
      next.setDate(1);
      next.setFullYear(next.getFullYear() + 1);
      next.setMonth(currentMonth);
      const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(originalDay, maxDay));
      break;
    }
    default:
      break;
  }
  
  return next;
}

/**
 * Genera fechas de ocurrencia desde una fecha inicial hasta una fecha límite
 */
function generateOccurrenceDates(
  startDate: Date,
  endDate: Date | null,
  frequency: string,
  dayOfMonth?: number,
  dayOfWeek?: number,
  maxDate?: Date
): Date[] {
  const dates: Date[] = [];
  const limitDate = maxDate || new Date(new Date().setMonth(new Date().getMonth() + 12));
  
  // Determinar fecha fin efectiva
  const effectiveEndDate = endDate && endDate < limitDate ? endDate : limitDate;
  
  let currentDate = new Date(startDate);
  
  // Ajustar al día del mes correcto para frecuencias mensuales+
  if (['MONTHLY', 'QUARTERLY', 'YEARLY'].includes(frequency) && dayOfMonth) {
    const maxDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    currentDate.setDate(Math.min(dayOfMonth, maxDay));
  }
  
  // Generar fechas hasta la fecha límite
  while (currentDate <= effectiveEndDate) {
    // Solo agregar fechas futuras o de hoy
    if (currentDate >= new Date(new Date().setHours(0, 0, 0, 0))) {
      dates.push(new Date(currentDate));
    }
    currentDate = calculateNextOccurrenceDate(currentDate, frequency, dayOfMonth, dayOfWeek);
    
    // Seguridad: máximo 100 ocurrencias
    if (dates.length >= 100) break;
  }
  
  return dates;
}

/**
 * Scheduled: Diariamente a las 6:00 AM
 * Genera movimientos futuros a partir de recurrencias activas
 * 
 * NUEVA LÓGICA:
 * - Procesa TODAS las recurrencias activas, no solo las del día actual
 * - Genera transacciones para los próximos N meses (configurable, default 6)
 * - Respeta endDate (null = indefinido, con fecha = se detiene ahí)
 * - Evita duplicados verificando transacciones existentes por fecha
 * - Soporta cancelación: status PAUSED/ENDED no genera más transacciones
 */
export const generateRecurrences = functions.pubsub
  .schedule('0 6 * * *')
  .timeZone('Europe/Madrid')
  .onRun(async (context) => {
    const today = new Date();
    const now = admin.firestore.Timestamp.now();

    console.log(`[generateRecurrences] Iniciando generación - ${today.toISOString()}`);

    try {
      // Obtener TODAS las recurrencias activas (nuevo campo 'status' o legacy 'active')
      // Primero intentamos con el nuevo esquema
      let recurrencesSnap = await db.collection('recurrences')
        .where('status', '==', 'ACTIVE')
        .get();
      
      // Si no hay resultados, intentar con el esquema legacy
      if (recurrencesSnap.empty) {
        recurrencesSnap = await db.collection('recurrences')
          .where('active', '==', true)
          .get();
      }

      console.log(`[generateRecurrences] Encontradas ${recurrencesSnap.size} recurrencias activas`);

      let totalCreated = 0;
      let totalSkipped = 0;
      const errors: string[] = [];

      for (const doc of recurrencesSnap.docs) {
        const data = doc.data();
        const recurrenceId = doc.id;
        
        try {
          // Extraer datos con soporte para campos legacy y nuevos
          const recurrence = {
            id: recurrenceId,
            userId: data.userId || data.createdBy,
            companyId: data.companyId,
            accountId: data.accountId || null,
            type: data.type,
            name: data.name || data.description || 'Recurrencia',
            baseAmount: data.baseAmount || data.amount || 0,
            category: data.category || '',
            thirdPartyId: data.thirdPartyId || null,
            thirdPartyName: data.thirdPartyName || '',
            certainty: data.certainty || 'HIGH',
            notes: data.notes || '',
            frequency: data.frequency || 'MONTHLY',
            dayOfMonth: data.dayOfMonth,
            dayOfWeek: data.dayOfWeek,
            startDate: data.startDate?.toDate?.() || new Date(data.startDate),
            endDate: data.endDate?.toDate?.() || null,
            generateMonthsAhead: data.generateMonthsAhead || 6,
            lastGeneratedDate: data.lastGeneratedDate?.toDate?.() || null,
          };

          // Verificar si la recurrencia ha terminado (endDate en el pasado)
          if (recurrence.endDate && recurrence.endDate < today) {
            console.log(`[generateRecurrences] Recurrencia ${recurrenceId} terminada (endDate: ${recurrence.endDate})`);
            // Marcar como ENDED si no lo está ya
            if (data.status !== 'ENDED') {
              await doc.ref.update({ 
                status: 'ENDED', 
                updatedAt: now 
              });
            }
            continue;
          }

          // Calcular fecha límite de generación
          // Si la recurrencia tiene endDate, generar TODAS las cuotas hasta esa fecha
          // Si no tiene endDate (indefinida), usar ventana deslizante de monthsAhead
          let maxDate: Date;
          if (recurrence.endDate) {
            // Recurrencia con fecha fin conocida: generar TODAS las cuotas
            maxDate = new Date(recurrence.endDate);
            console.log(`[generateRecurrences] Recurrencia ${recurrenceId}: endDate definido, generando hasta ${maxDate.toISOString()}`);
          } else {
            // Recurrencia indefinida: ventana deslizante de 6 meses
            maxDate = new Date(today);
            maxDate.setMonth(maxDate.getMonth() + recurrence.generateMonthsAhead);
          }

          // Siempre empezar desde startDate - el sistema de skipExisting evita duplicados
          // Esto garantiza que no se pierdan ocurrencias intermedias
          const generateFrom = recurrence.startDate;

          // Generar fechas de ocurrencia
          const dates = generateOccurrenceDates(
            generateFrom,
            recurrence.endDate,
            recurrence.frequency,
            recurrence.dayOfMonth,
            recurrence.dayOfWeek,
            maxDate
          );

          if (dates.length === 0) {
            console.log(`[generateRecurrences] Recurrencia ${recurrenceId}: sin fechas pendientes`);
            continue;
          }

          // Obtener transacciones ya existentes para esta recurrencia
          const existingSnap = await db.collection('transactions')
            .where('recurrenceId', '==', recurrenceId)
            .get();
          
          const existingDates = new Set<string>();
          existingSnap.docs.forEach(txDoc => {
            const txData = txDoc.data();
            const dueDate = txData.dueDate?.toDate?.() || new Date(txData.dueDate);
            const dateKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
            existingDates.add(dateKey);
          });
          
          // Buscar por thirdPartyId + tipo + monto (detecta duplicados de otras recurrencias)
          if (recurrence.thirdPartyId) {
            const existingByThirdPartySnap = await db.collection('transactions')
              .where('userId', '==', recurrence.userId)
              .where('companyId', '==', recurrence.companyId)
              .where('thirdPartyId', '==', recurrence.thirdPartyId)
              .where('type', '==', recurrence.type)
              .where('amount', '==', recurrence.baseAmount)
              .get();
            
            existingByThirdPartySnap.docs.forEach(txDoc => {
              const txData = txDoc.data();
              const dueDate = txData.dueDate?.toDate?.() || new Date(txData.dueDate);
              const dateKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
              existingDates.add(dateKey);
            });
          } else {
            // Si no hay thirdPartyId (ej: nóminas), buscar por descripción + companyId + type + amount
            // Esto previene duplicados cuando hay múltiples recurrencias con el mismo concepto
            const existingByDescriptionSnap = await db.collection('transactions')
              .where('userId', '==', recurrence.userId)
              .where('companyId', '==', recurrence.companyId)
              .where('description', '==', recurrence.name)
              .where('type', '==', recurrence.type)
              .where('amount', '==', recurrence.baseAmount)
              .get();
            
            existingByDescriptionSnap.docs.forEach(txDoc => {
              const txData = txDoc.data();
              const dueDate = txData.dueDate?.toDate?.() || new Date(txData.dueDate);
              const dateKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
              existingDates.add(dateKey);
            });
          }

          // Crear transacciones que no existan
          const batch = db.batch();
          let batchCount = 0;
          let lastGeneratedDate: Date | null = null;

          for (const date of dates) {
            // Usar zona horaria local para la comparación
            const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            
            // Saltar si ya existe
            if (existingDates.has(dateKey)) {
              totalSkipped++;
              continue;
            }

            const transactionRef = db.collection('transactions').doc();
            const instanceDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            batch.set(transactionRef, {
              userId: recurrence.userId,
              companyId: recurrence.companyId,
              accountId: recurrence.accountId,
              type: recurrence.type,
              amount: recurrence.baseAmount,
              status: 'PENDING',
              dueDate: admin.firestore.Timestamp.fromDate(date),
              paidDate: null,
              category: recurrence.category,
              description: recurrence.name,
              thirdPartyId: recurrence.thirdPartyId,
              thirdPartyName: recurrence.thirdPartyName,
              notes: recurrence.notes,
              recurrence: recurrence.frequency,
              certainty: recurrence.certainty,
              recurrenceId: recurrenceId,
              isRecurrenceInstance: true,
              instanceDate,
              overriddenFromRecurrence: false,
              createdBy: recurrence.userId,
              lastUpdatedBy: recurrence.userId,
              createdAt: now,
              updatedAt: now,
            });

            batchCount++;
            totalCreated++;
            
            if (!lastGeneratedDate || date > lastGeneratedDate) {
              lastGeneratedDate = date;
            }

            // Firestore batch limit es 500
            if (batchCount >= 450) {
              await batch.commit();
              console.log(`[generateRecurrences] Batch intermedio committed para recurrencia ${recurrenceId}`);
            }
          }

          // Commit final del batch
          if (batchCount > 0) {
            await batch.commit();
            
            // Actualizar la recurrencia con la última fecha generada
            const nextOccurrence = dates.length > 0 
              ? calculateNextOccurrenceDate(
                  dates[dates.length - 1],
                  recurrence.frequency,
                  recurrence.dayOfMonth,
                  recurrence.dayOfWeek
                )
              : null;

            await doc.ref.update({
              lastGeneratedDate: lastGeneratedDate 
                ? admin.firestore.Timestamp.fromDate(lastGeneratedDate) 
                : null,
              nextOccurrenceDate: nextOccurrence 
                ? admin.firestore.Timestamp.fromDate(nextOccurrence) 
                : null,
              updatedAt: now,
            });

            console.log(`[generateRecurrences] Recurrencia ${recurrenceId}: ${batchCount} transacciones creadas`);
          }

        } catch (recError) {
          const errorMsg = `Error procesando recurrencia ${recurrenceId}: ${recError}`;
          console.error(`[generateRecurrences] ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      console.log(`[generateRecurrences] Resumen: ${totalCreated} creadas, ${totalSkipped} omitidas, ${errors.length} errores`);
      
      if (errors.length > 0) {
        console.error(`[generateRecurrences] Errores: ${errors.join('; ')}`);
      }

      return null;

    } catch (error) {
      console.error('[generateRecurrences] Error fatal:', error);
      return null;
    }
  });

// ============================
// 6. CREATE DAILY SNAPSHOT
// ============================
/**
 * Scheduled: Diariamente a las 23:59
 * Crea un snapshot de la posición de tesorería de cada empresa
 */
export const createDailySnapshot = functions.pubsub
  .schedule('59 23 * * *')
  .timeZone('Europe/Madrid')
  .onRun(async (context) => {
    try {
      // Obtener todas las empresas activas
      const companiesSnap = await db.collection('companies')
        .where('status', '==', 'ACTIVE')
        .get();

      for (const companyDoc of companiesSnap.docs) {
        const companyId = companyDoc.id;

        // Calcular métricas
        const accountsSnap = await db.collection('accounts')
          .where('companyId', '==', companyId)
          .where('status', '==', 'ACTIVE')
          .get();

        let totalLiquidity = 0;
        accountsSnap.forEach(doc => {
          totalLiquidity += (doc.data() as Account).balance;
        });

        // Crédito disponible
        const creditLinesSnap = await db.collection('creditLines')
          .where('companyId', '==', companyId)
          .where('status', '==', 'ACTIVE')
          .get();

        let totalCreditAvailable = 0;
        creditLinesSnap.forEach(doc => {
          const line = doc.data() as CreditLine;
          totalCreditAvailable += (line.limit - line.drawn);
        });

        // Movimientos pendientes
        const pendingIncomesSnap = await db.collection('transactions')
          .where('companyId', '==', companyId)
          .where('type', '==', 'INCOME')
          .where('status', '==', 'PENDING')
          .get();

        let totalPendingIncomes = 0;
        pendingIncomesSnap.forEach(doc => {
          totalPendingIncomes += (doc.data() as Transaction).amount;
        });

        const pendingExpensesSnap = await db.collection('transactions')
          .where('companyId', '==', companyId)
          .where('type', '==', 'EXPENSE')
          .where('status', '==', 'PENDING')
          .get();

        let totalPendingExpenses = 0;
        pendingExpensesSnap.forEach(doc => {
          totalPendingExpenses += (doc.data() as Transaction).amount;
        });

        // Calcular posición neta y runway
        const netPosition = totalLiquidity + totalCreditAvailable + totalPendingIncomes - totalPendingExpenses;
        
        // Runway basado en promedio de gastos de 90 días
        const ninetyDaysAgo = admin.firestore.Timestamp.fromDate(
          new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        );
        
        const historicExpensesSnap = await db.collection('transactions')
          .where('companyId', '==', companyId)
          .where('type', '==', 'EXPENSE')
          .where('status', '==', 'COMPLETED')
          .where('dueDate', '>=', ninetyDaysAgo)
          .get();

        let totalHistoricExpenses = 0;
        historicExpensesSnap.forEach(doc => {
          totalHistoricExpenses += (doc.data() as Transaction).amount;
        });

        const avgDailyExpense = totalHistoricExpenses / 90;
        const runwayDays = avgDailyExpense > 0 
          ? Math.floor((totalLiquidity + totalCreditAvailable) / avgDailyExpense)
          : 999;

        // Crear snapshot
        await db.collection('dailySnapshots').add({
          date: admin.firestore.Timestamp.now(),
          companyId,
          totalLiquidity,
          totalCreditAvailable,
          totalPendingIncomes,
          totalPendingExpenses,
          netPosition,
          runwayDays,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Crear snapshot global (todas las empresas)
      const globalAccountsSnap = await db.collection('accounts')
        .where('status', '==', 'ACTIVE')
        .get();

      let globalLiquidity = 0;
      globalAccountsSnap.forEach(doc => {
        globalLiquidity += (doc.data() as Account).balance;
      });

      const globalCreditSnap = await db.collection('creditLines')
        .where('status', '==', 'ACTIVE')
        .get();

      let globalCredit = 0;
      globalCreditSnap.forEach(doc => {
        const line = doc.data() as CreditLine;
        globalCredit += (line.limit - line.drawn);
      });

      await db.collection('dailySnapshots').add({
        date: admin.firestore.Timestamp.now(),
        companyId: null, // null = global
        totalLiquidity: globalLiquidity,
        totalCreditAvailable: globalCredit,
        totalPendingIncomes: 0,
        totalPendingExpenses: 0,
        netPosition: globalLiquidity + globalCredit,
        runwayDays: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Snapshot diario creado para ${companiesSnap.size} empresas`);
      return null;

    } catch (error) {
      console.error('Error creando snapshot diario:', error);
      return null;
    }
  });
