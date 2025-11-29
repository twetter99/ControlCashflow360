import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { 
  checkRateLimit, 
  getRateLimitIdentifier, 
  getRateLimitHeaders,
  RATE_LIMIT_CONFIGS 
} from '@/lib/rate-limit';

/**
 * Rutas públicas que no requieren autenticación
 */
const PUBLIC_PATHS = [
  '/login',
  '/api/health',
  '/_next',
  '/favicon.ico',
  '/manifest.json',
];

/**
 * Rutas de API que requieren rate limiting especial
 */
const AUTH_PATHS = [
  '/api/auth',
];

/**
 * Métodos de escritura que tienen rate limit más restrictivo
 */
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Obtiene la IP real del cliente
 */
function getClientIP(request: NextRequest): string {
  // Vercel/Cloudflare
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  // Cloudflare específico
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  // Real IP header
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  return 'unknown';
}

/**
 * Verifica si una ruta es pública
 */
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(path => pathname.startsWith(path));
}

/**
 * Verifica si es una ruta de autenticación
 */
function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some(path => pathname.startsWith(path));
}

/**
 * Middleware principal de Next.js
 * Maneja rate limiting y logging de seguridad
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;
  const ip = getClientIP(request);
  
  // Skip para archivos estáticos de Next.js
  if (pathname.startsWith('/_next/static') || pathname.startsWith('/_next/image')) {
    return NextResponse.next();
  }
  
  // ============================================
  // RATE LIMITING
  // ============================================
  
  // Solo aplicar rate limiting a rutas de API
  if (pathname.startsWith('/api')) {
    // Determinar configuración de rate limit
    let rateLimitConfig = RATE_LIMIT_CONFIGS.api;
    
    if (isAuthPath(pathname)) {
      rateLimitConfig = RATE_LIMIT_CONFIGS.auth;
    } else if (pathname === '/api/health') {
      rateLimitConfig = RATE_LIMIT_CONFIGS.health;
    } else if (WRITE_METHODS.includes(method)) {
      rateLimitConfig = RATE_LIMIT_CONFIGS.write;
    }
    
    // Crear identificador único para rate limiting
    const identifier = getRateLimitIdentifier(ip, undefined, pathname);
    
    // Verificar rate limit
    const rateLimitResult = checkRateLimit(identifier, rateLimitConfig);
    
    // Si excede el límite, devolver 429
    if (!rateLimitResult.success) {
      console.warn(`[RATE_LIMIT] Exceeded for IP: ${ip}, Path: ${pathname}`);
      
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: 'Demasiadas solicitudes. Por favor, espera antes de intentar de nuevo.',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: rateLimitResult.retryAfter,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...getRateLimitHeaders(rateLimitResult),
          },
        }
      );
    }
    
    // Agregar headers de rate limit a la respuesta
    const response = NextResponse.next();
    const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
    Object.entries(rateLimitHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    
    return response;
  }
  
  // ============================================
  // LOGGING DE SEGURIDAD (solo para debugging)
  // ============================================
  
  // Log de accesos sospechosos (desactivado en producción)
  if (process.env.NODE_ENV === 'development') {
    // Detectar intentos de path traversal
    if (pathname.includes('..') || pathname.includes('%2e%2e')) {
      console.warn(`[SECURITY] Path traversal attempt from ${ip}: ${pathname}`);
    }
    
    // Detectar URLs muy largas (posible ataque)
    if (pathname.length > 500) {
      console.warn(`[SECURITY] Unusually long path from ${ip}: ${pathname.length} chars`);
    }
  }
  
  return NextResponse.next();
}

/**
 * Configuración del matcher - qué rutas procesa el middleware
 */
export const config = {
  matcher: [
    // Incluir todas las rutas de API
    '/api/:path*',
    // Incluir páginas del dashboard
    '/(dashboard)/:path*',
    // Excluir archivos estáticos
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
