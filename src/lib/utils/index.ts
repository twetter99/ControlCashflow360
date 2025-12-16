import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina clases de Tailwind de forma inteligente
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatea un número como moneda (EUR) con formato español
 * Asegura separador de miles con punto y decimales con coma
 */
export function formatCurrency(amount: number): string {
  // Asegurar que es un número
  const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  
  // Formatear manualmente para garantizar formato español
  const formatted = Math.abs(num).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  // Añadir símbolo € al final (formato español)
  return `${formatted} €`;
}

/**
 * Formatea un número de forma compacta
 */
export function formatCompactCurrency(amount: number): string {
  if (Math.abs(amount) >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M €`;
  }
  if (Math.abs(amount) >= 1000) {
    return `${(amount / 1000).toFixed(1)}K €`;
  }
  return formatCurrency(amount);
}

/**
 * Formatea una fecha
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  } catch {
    return '-';
  }
}

/**
 * Formatea una fecha con hora
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '-';
  }
}

/**
 * Formatea una fecha relativa (hace X días/horas)
 */
export function formatRelativeDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return 'Ahora mismo';
    if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    
    return formatDate(d);
  } catch {
    return '-';
  }
}

/**
 * Obtiene el color de fondo según el nivel de riesgo
 */
export function getRiskLevelColor(level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'): string {
  const colors = {
    LOW: 'bg-green-100 text-green-800',
    MEDIUM: 'bg-yellow-100 text-yellow-800',
    HIGH: 'bg-orange-100 text-orange-800',
    CRITICAL: 'bg-red-100 text-red-800',
  };
  return colors[level];
}

/**
 * Obtiene el color de un indicador según el valor
 */
export function getIndicatorColor(value: number, thresholds: { warning: number; danger: number }): string {
  if (value <= thresholds.danger) return 'text-red-600';
  if (value <= thresholds.warning) return 'text-yellow-600';
  return 'text-green-600';
}

/**
 * Calcula la diferencia en porcentaje
 */
export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Genera un ID único
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Obtiene la fecha de hoy en formato YYYY-MM-DD
 */
export function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Obtiene la fecha de ayer en formato YYYY-MM-DD
 */
export function getYesterdayString(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

/**
 * Suma días a una fecha
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// ============================================
// IBAN Validation & Formatting
// ============================================

/**
 * Longitudes de IBAN por país (códigos ISO 3166-1 alpha-2)
 */
const IBAN_LENGTHS: Record<string, number> = {
  ES: 24, // España
  AD: 24, // Andorra
  AT: 20, // Austria
  BE: 16, // Bélgica
  CH: 21, // Suiza
  DE: 22, // Alemania
  FR: 27, // Francia
  GB: 22, // Reino Unido
  IT: 27, // Italia
  NL: 18, // Países Bajos
  PT: 25, // Portugal
  // Añadir más países según necesidad
};

/**
 * Resultado de validación de IBAN
 */
export interface IBANValidationResult {
  isValid: boolean;
  error?: string;
  countryCode?: string;
  formattedIBAN?: string;
}

/**
 * Formatea un IBAN en bloques de 4 caracteres
 */
export function formatIBAN(iban: string): string {
  if (!iban) return '';
  // Limpiar: quitar espacios y convertir a mayúsculas
  const clean = iban.replace(/\s/g, '').toUpperCase();
  // Formatear en bloques de 4
  return clean.match(/.{1,4}/g)?.join(' ') || clean;
}

/**
 * Limpia un IBAN (quita espacios, guiones y convierte a mayúsculas)
 */
export function cleanIBAN(iban: string): string {
  if (!iban) return '';
  return iban.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Valida un IBAN usando el algoritmo MOD-97 (ISO 7064)
 * @param iban - El IBAN a validar (con o sin espacios)
 * @param isInternational - Si true, acepta cualquier país; si false, solo España
 */
export function validateIBAN(iban: string, isInternational: boolean = false): IBANValidationResult {
  if (!iban || iban.trim() === '') {
    return { isValid: true }; // IBAN vacío es válido (es opcional)
  }

  // Limpiar el IBAN
  const clean = cleanIBAN(iban);

  // Verificar que solo contenga caracteres alfanuméricos
  if (!/^[A-Z0-9]+$/.test(clean)) {
    return { 
      isValid: false, 
      error: 'El IBAN solo puede contener letras y números' 
    };
  }

  // Verificar longitud mínima
  if (clean.length < 15) {
    return { 
      isValid: false, 
      error: 'El IBAN es demasiado corto' 
    };
  }

  // Extraer código de país
  const countryCode = clean.substring(0, 2);

  // Verificar que empiece con letras (código de país)
  if (!/^[A-Z]{2}/.test(clean)) {
    return { 
      isValid: false, 
      error: 'El IBAN debe empezar con el código de país (ej: ES)' 
    };
  }

  // Si no es internacional, solo aceptar España
  if (!isInternational && countryCode !== 'ES') {
    return { 
      isValid: false, 
      error: 'Solo se aceptan IBAN españoles. Marca "IBAN internacional" para otros países',
      countryCode 
    };
  }

  // Verificar longitud según país
  const expectedLength = IBAN_LENGTHS[countryCode];
  if (expectedLength) {
    if (clean.length !== expectedLength) {
      return { 
        isValid: false, 
        error: `El IBAN de ${countryCode} debe tener ${expectedLength} caracteres (tiene ${clean.length})`,
        countryCode 
      };
    }
  } else if (clean.length < 15 || clean.length > 34) {
    // Longitud genérica para países no listados
    return { 
      isValid: false, 
      error: 'Longitud de IBAN no válida',
      countryCode 
    };
  }

  // Verificar que después del código de país vengan 2 dígitos de control
  if (!/^[A-Z]{2}[0-9]{2}/.test(clean)) {
    return { 
      isValid: false, 
      error: 'Los dígitos de control del IBAN no son válidos',
      countryCode 
    };
  }

  // Algoritmo MOD-97 (ISO 7064)
  // 1. Mover los 4 primeros caracteres al final
  const rearranged = clean.substring(4) + clean.substring(0, 4);

  // 2. Convertir letras a números (A=10, B=11, ..., Z=35)
  let numericString = '';
  for (const char of rearranged) {
    if (char >= 'A' && char <= 'Z') {
      numericString += (char.charCodeAt(0) - 55).toString(); // A=10, B=11, etc.
    } else {
      numericString += char;
    }
  }

  // 3. Calcular módulo 97 (usando aritmética de precisión para números grandes)
  let remainder = 0;
  for (const digit of numericString) {
    remainder = (remainder * 10 + parseInt(digit, 10)) % 97;
  }

  // 4. Si el resto es 1, el IBAN es válido
  if (remainder !== 1) {
    return { 
      isValid: false, 
      error: 'El IBAN no es válido (dígitos de control incorrectos)',
      countryCode 
    };
  }

  return { 
    isValid: true, 
    countryCode,
    formattedIBAN: formatIBAN(clean)
  };
}

/**
 * Valida específicamente un IBAN español
 * Incluye validación adicional del CCC (Código Cuenta Cliente)
 */
export function validateSpanishIBAN(iban: string): IBANValidationResult {
  const baseValidation = validateIBAN(iban, false);
  
  if (!baseValidation.isValid) {
    return baseValidation;
  }

  if (!iban || iban.trim() === '') {
    return { isValid: true };
  }

  const clean = cleanIBAN(iban);
  
  // IBAN español: ES + 2 dígitos control + 4 entidad + 4 oficina + 2 DC + 10 cuenta
  // Validar estructura adicional (opcional, ya que MOD-97 cubre la mayoría)
  const entityCode = clean.substring(4, 8);
  const officeCode = clean.substring(8, 12);
  
  // Verificar que entidad y oficina sean numéricos
  if (!/^[0-9]{4}$/.test(entityCode) || !/^[0-9]{4}$/.test(officeCode)) {
    return { 
      isValid: false, 
      error: 'Código de entidad u oficina no válido',
      countryCode: 'ES'
    };
  }

  return { 
    isValid: true, 
    countryCode: 'ES',
    formattedIBAN: formatIBAN(clean)
  };
}
