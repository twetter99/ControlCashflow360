/**
 * Rate Limiter para API Routes
 * Implementación en memoria con sliding window
 */

interface RateLimitEntry {
  count: number;
  firstRequest: number;
  lastRequest: number;
}

export interface RateLimitConfig {
  windowMs: number;      // Ventana de tiempo en ms
  maxRequests: number;   // Máximo de requests por ventana
}

// Configuraciones por tipo de endpoint
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  // Endpoints de autenticación - más restrictivos
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutos
    maxRequests: 10,          // 10 intentos
  },
  // Endpoints de API normales
  api: {
    windowMs: 60 * 1000,      // 1 minuto
    maxRequests: 100,         // 100 requests
  },
  // Endpoints de escritura (POST, PUT, DELETE)
  write: {
    windowMs: 60 * 1000,      // 1 minuto
    maxRequests: 30,          // 30 requests
  },
  // Endpoint de health - más permisivo
  health: {
    windowMs: 60 * 1000,      // 1 minuto
    maxRequests: 60,          // 60 requests
  },
};

// Store en memoria (en producción usar Redis)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Limpiar entradas expiradas cada 5 minutos
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupExpiredEntries(maxAge: number = 30 * 60 * 1000) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  
  lastCleanup = now;
  const entries = Array.from(rateLimitStore.entries());
  for (const [key, entry] of entries) {
    if (now - entry.lastRequest > maxAge) {
      rateLimitStore.delete(key);
    }
  }
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Verifica si una IP/usuario ha excedido el rate limit
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.api
): RateLimitResult {
  cleanupExpiredEntries();
  
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);
  
  // Primera request de este identificador
  if (!entry) {
    rateLimitStore.set(identifier, {
      count: 1,
      firstRequest: now,
      lastRequest: now,
    });
    return {
      success: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    };
  }
  
  // Verificar si la ventana ha expirado
  const windowExpired = now - entry.firstRequest > config.windowMs;
  
  if (windowExpired) {
    // Reiniciar contador
    rateLimitStore.set(identifier, {
      count: 1,
      firstRequest: now,
      lastRequest: now,
    });
    return {
      success: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    };
  }
  
  // Incrementar contador
  entry.count++;
  entry.lastRequest = now;
  
  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetAt = entry.firstRequest + config.windowMs;
  
  if (entry.count > config.maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetAt,
      retryAfter: Math.ceil((resetAt - now) / 1000),
    };
  }
  
  return {
    success: true,
    remaining,
    resetAt,
  };
}

/**
 * Obtiene el identificador para rate limiting
 * Usa IP + User ID si está disponible
 */
export function getRateLimitIdentifier(
  ip: string | null,
  userId?: string,
  endpoint?: string
): string {
  const parts = [
    ip || 'unknown',
    userId || 'anonymous',
    endpoint || 'default',
  ];
  return parts.join(':');
}

/**
 * Headers de rate limit para la respuesta
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
  };
  
  if (!result.success && result.retryAfter) {
    headers['Retry-After'] = result.retryAfter.toString();
  }
  
  return headers;
}
