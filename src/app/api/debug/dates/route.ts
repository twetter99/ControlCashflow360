import { NextRequest, NextResponse } from 'next/server';
import { calculateNextOccurrenceDate, getFirstOccurrenceDate, generateOccurrenceDates } from '@/lib/recurrence-generator';

/**
 * GET /api/debug/dates - Debug de cálculo de fechas de recurrencia
 */
export async function GET(request: NextRequest) {
  const today = new Date(); // 1 dic 2025
  const startDate = new Date('2025-12-30'); // Fecha original de la transacción
  const nextAfterOriginal = new Date('2026-01-30'); // Lo que se pasó como startDate en migración
  const dayOfMonth = 30;
  const frequency = 'MONTHLY' as const;

  // Simular lo que hace el generador
  const dates: string[] = [];
  
  // Caso 1: Empezando desde la fecha original (30/12/2025)
  const datesFromOriginal = generateOccurrenceDates(
    startDate,
    null,
    frequency,
    dayOfMonth,
    undefined,
    new Date('2026-07-01') // 6 meses
  );
  
  // Caso 2: Empezando desde nextOccurrence (30/01/2026) - lo que hace la migración actual
  const datesFromNext = generateOccurrenceDates(
    nextAfterOriginal,
    null,
    frequency,
    dayOfMonth,
    undefined,
    new Date('2026-07-01')
  );
  
  // Calcular días desde hoy para cada fecha
  const formatWithDays = (date: Date) => ({
    date: date.toISOString().split('T')[0],
    daysFromNow: Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
  });

  return NextResponse.json({
    today: today.toISOString().split('T')[0],
    startDate: startDate.toISOString().split('T')[0],
    nextAfterOriginal: nextAfterOriginal.toISOString().split('T')[0],
    dayOfMonth,
    frequency,
    
    // Caso 1: Desde fecha original
    datesFromOriginal: datesFromOriginal.map(formatWithDays),
    
    // Caso 2: Desde next occurrence (actual en migración)
    datesFromNext: datesFromNext.map(formatWithDays),
    
    // Períodos del dashboard
    periods: {
      '0-30': '1 dic - 31 dic',
      '31-60': '1 ene - 30 ene',
      '61-90': '31 ene - 1 mar',
    }
  });
}
