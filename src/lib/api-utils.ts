import { NextResponse } from 'next/server';
import { verifyIdToken, extractToken } from './firebase/admin';
import { z } from 'zod';

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  validationErrors?: string[];
};

/**
 * Respuesta de éxito estándar
 */
export function successResponse<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    { success: true, data },
    { status }
  );
}

/**
 * Respuesta de error estándar
 */
export function errorResponse(
  message: string,
  status = 400,
  code?: string
): NextResponse<ApiResponse> {
  return NextResponse.json(
    { success: false, error: message, code },
    { status }
  );
}

/**
 * Verifica la autenticación del usuario desde el request
 * Retorna el userId si está autenticado, o una respuesta de error
 */
export async function authenticateRequest(
  request: Request
): Promise<{ userId: string } | { error: NextResponse<ApiResponse> }> {
  const authHeader = request.headers.get('Authorization');
  const token = extractToken(authHeader);

  if (!token) {
    return {
      error: errorResponse('Token de autenticación requerido', 401, 'UNAUTHORIZED'),
    };
  }

  const decodedToken = await verifyIdToken(token);

  if (!decodedToken) {
    return {
      error: errorResponse('Token inválido o expirado', 401, 'INVALID_TOKEN'),
    };
  }

  return { userId: decodedToken.uid };
}

/**
 * Verifica que el usuario autenticado coincida con el userId del recurso
 */
export function verifyOwnership(
  resourceUserId: string,
  authenticatedUserId: string
): boolean {
  return resourceUserId === authenticatedUserId;
}

/**
 * Wrapper para manejar errores en los endpoints
 */
export async function withErrorHandling<T>(
  handler: () => Promise<NextResponse<ApiResponse<T>>>
): Promise<NextResponse<ApiResponse<T | undefined>>> {
  try {
    return await handler();
  } catch (error) {
    // Log detallado del error
    console.error('[API Error] ========================================');
    console.error('[API Error] Timestamp:', new Date().toISOString());
    console.error('[API Error] Message:', error instanceof Error ? error.message : 'Error desconocido');
    console.error('[API Error] Stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // Detectar errores específicos de Firebase
    const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor';
    
    if (errorMessage.includes('Firebase Admin') || errorMessage.includes('FIREBASE_SERVICE_ACCOUNT_KEY')) {
      console.error('[API Error] 🔥 Este es un error de configuración de Firebase Admin');
      console.error('[API Error] Verifica que FIREBASE_SERVICE_ACCOUNT_KEY esté configurada en Vercel');
    }
    
    if (errorMessage.includes('permission-denied') || errorMessage.includes('PERMISSION_DENIED')) {
      console.error('[API Error] 🔒 Error de permisos en Firestore - verifica las reglas de seguridad');
    }
    
    console.error('[API Error] ========================================');
    
    return errorResponse(errorMessage, 500, 'INTERNAL_ERROR') as NextResponse<ApiResponse<T | undefined>>;
  }
}

/**
 * Parsea el body de un request de forma segura
 */
export async function parseRequestBody<T>(request: Request): Promise<T | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * Valida datos con un schema Zod y retorna el resultado tipado o una respuesta de error
 */
export function validateWithSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: NextResponse<ApiResponse> } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.issues.map((err: z.ZodIssue) => {
    const path = err.path.length > 0 ? `${err.path.join('.')}: ` : '';
    return `${path}${err.message}`;
  });
  
  return {
    success: false,
    error: NextResponse.json(
      { 
        success: false, 
        error: 'Error de validación', 
        code: 'VALIDATION_ERROR',
        validationErrors: errors 
      },
      { status: 400 }
    ),
  };
}

/**
 * Parsea y valida el body de un request con un schema Zod
 */
export async function parseAndValidate<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; error: NextResponse<ApiResponse> }> {
  const body = await parseRequestBody<unknown>(request);
  
  if (body === null) {
    return {
      success: false,
      error: errorResponse('Cuerpo de la petición inválido o vacío', 400, 'INVALID_BODY'),
    };
  }
  
  return validateWithSchema(schema, body);
}
