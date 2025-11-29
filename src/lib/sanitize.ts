/**
 * Utilidades de sanitización para prevenir XSS
 * Implementación ligera sin dependencias externas
 */

/**
 * Caracteres HTML que deben ser escapados
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Patrones peligrosos que indican intento de XSS
 */
const DANGEROUS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,  // Script tags
  /javascript:/gi,                          // JavaScript protocol
  /on\w+\s*=/gi,                            // Event handlers (onclick, onerror, etc.)
  /data:/gi,                                // Data URLs
  /vbscript:/gi,                            // VBScript protocol
  /expression\s*\(/gi,                      // CSS expressions
  /url\s*\(/gi,                             // CSS url()
  /<iframe[\s\S]*?>/gi,                     // iframes
  /<object[\s\S]*?>/gi,                     // objects
  /<embed[\s\S]*?>/gi,                      // embeds
  /<link[\s\S]*?>/gi,                       // links
  /<style[\s\S]*?>[\s\S]*?<\/style>/gi,    // style tags
];

/**
 * Escapa caracteres HTML peligrosos
 */
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"'`=\/]/g, char => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Elimina patrones peligrosos de XSS
 */
export function removeDangerousPatterns(str: string): string {
  let result = str;
  for (const pattern of DANGEROUS_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result;
}

/**
 * Sanitiza una cadena eliminando contenido peligroso
 * - Elimina tags de script y similares
 * - Elimina event handlers
 * - Escapa caracteres HTML si se especifica
 * 
 * @param str - Cadena a sanitizar
 * @param options - Opciones de sanitización
 */
export function sanitizeString(
  str: string,
  options: {
    escapeHtml?: boolean;      // Escapar caracteres HTML
    removeHtml?: boolean;      // Eliminar todos los tags HTML
    maxLength?: number;        // Longitud máxima
    trim?: boolean;            // Eliminar espacios al inicio/fin
  } = {}
): string {
  const {
    escapeHtml: shouldEscape = false,
    removeHtml = true,
    maxLength,
    trim = true,
  } = options;

  let result = str;

  // 1. Trim
  if (trim) {
    result = result.trim();
  }

  // 2. Eliminar patrones peligrosos
  result = removeDangerousPatterns(result);

  // 3. Eliminar todos los tags HTML si se especifica
  if (removeHtml) {
    result = result.replace(/<[^>]*>/g, '');
  }

  // 4. Escapar HTML si se especifica
  if (shouldEscape) {
    result = escapeHtml(result);
  }

  // 5. Limitar longitud
  if (maxLength && result.length > maxLength) {
    result = result.substring(0, maxLength);
  }

  // 6. Eliminar caracteres de control (excepto newlines y tabs)
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return result;
}

/**
 * Sanitiza un string para uso seguro en texto plano
 * Elimina HTML y scripts pero mantiene el texto
 */
export function sanitizeText(str: string, maxLength?: number): string {
  return sanitizeString(str, {
    removeHtml: true,
    escapeHtml: false,
    maxLength,
    trim: true,
  });
}

/**
 * Sanitiza un string que será renderizado como HTML
 * Escapa todos los caracteres peligrosos
 */
export function sanitizeForHtml(str: string, maxLength?: number): string {
  return sanitizeString(str, {
    removeHtml: true,
    escapeHtml: true,
    maxLength,
    trim: true,
  });
}

/**
 * Verifica si un string contiene patrones peligrosos
 */
export function containsDangerousContent(str: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(str));
}

/**
 * Sanitiza un objeto recursivamente
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  options: Parameters<typeof sanitizeString>[1] = {}
): T {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeString(value, options);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeObject(value as Record<string, unknown>, options);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => 
        typeof item === 'string' 
          ? sanitizeString(item, options)
          : item !== null && typeof item === 'object'
            ? sanitizeObject(item as Record<string, unknown>, options)
            : item
      );
    } else {
      result[key] = value;
    }
  }
  
  return result as T;
}
