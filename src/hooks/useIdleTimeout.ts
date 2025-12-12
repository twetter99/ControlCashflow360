'use client';

import { useEffect, useCallback, useRef, useState } from 'react';

// Clave para guardar última actividad en localStorage
const LAST_ACTIVITY_KEY = 'winfin_last_activity';
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos en milisegundos

/**
 * Guarda el timestamp de última actividad en localStorage
 */
export function saveLastActivity(): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
  }
}

/**
 * Obtiene el timestamp de última actividad desde localStorage
 */
export function getLastActivity(): number | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(LAST_ACTIVITY_KEY);
  return stored ? parseInt(stored, 10) : null;
}

/**
 * Limpia el registro de última actividad
 */
export function clearLastActivity(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  }
}

/**
 * Verifica si la sesión ha expirado basándose en la última actividad guardada
 * @returns true si la sesión expiró (más de 15 minutos de inactividad)
 */
export function isSessionExpired(): boolean {
  const lastActivity = getLastActivity();
  if (!lastActivity) return false; // No hay registro, es una sesión nueva
  
  const elapsed = Date.now() - lastActivity;
  return elapsed > SESSION_TIMEOUT_MS;
}

export interface IdleTimeoutConfig {
  /** Tiempo de inactividad antes de mostrar aviso (en minutos). Default: 10 */
  idleTime?: number;
  /** Tiempo del aviso antes de cerrar sesión (en segundos). Default: 60 */
  warningTime?: number;
  /** Callback cuando se cierra sesión por inactividad */
  onTimeout: () => void;
  /** Callback cuando empieza el countdown de aviso */
  onWarning?: () => void;
  /** Si está habilitado el timeout */
  enabled?: boolean;
}

export interface IdleTimeoutState {
  /** Si se está mostrando el modal de aviso */
  showWarning: boolean;
  /** Segundos restantes antes del cierre */
  remainingSeconds: number;
  /** Resetear el timer de inactividad */
  resetTimer: () => void;
  /** Extender la sesión (cerrar aviso y reiniciar) */
  extendSession: () => void;
}

/**
 * Hook para detectar inactividad del usuario y cerrar sesión automáticamente.
 * Similar al comportamiento de apps bancarias.
 * 
 * Detecta: movimiento de mouse, clicks, teclas, scroll, touch
 */
export function useIdleTimeout({
  idleTime = 10, // 10 minutos por defecto
  warningTime = 60, // 60 segundos de aviso
  onTimeout,
  onWarning,
  enabled = true,
}: IdleTimeoutConfig): IdleTimeoutState {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(warningTime);
  
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Inicializar con localStorage si existe, sino con Date.now()
  const lastActivityRef = useRef<number>(getLastActivity() || Date.now());

  // Limpiar todos los timers
  const clearAllTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  // Iniciar el countdown de cierre
  const startWarningCountdown = useCallback(() => {
    setShowWarning(true);
    setRemainingSeconds(warningTime);
    onWarning?.();

    countdownTimerRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearAllTimers();
          setShowWarning(false);
          onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [warningTime, onWarning, onTimeout, clearAllTimers]);

  // Reiniciar el timer de inactividad
  const resetTimer = useCallback(() => {
    if (!enabled) return;
    
    lastActivityRef.current = Date.now();
    // Guardar en localStorage para persistir entre recargas/cierres
    saveLastActivity();
    
    clearAllTimers();
    setShowWarning(false);
    setRemainingSeconds(warningTime);

    // Nuevo timer de inactividad
    idleTimerRef.current = setTimeout(() => {
      startWarningCountdown();
    }, idleTime * 60 * 1000);
  }, [enabled, idleTime, warningTime, clearAllTimers, startWarningCountdown]);

  // Extender sesión (desde el modal de aviso)
  const extendSession = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  // Eventos a detectar para actividad
  useEffect(() => {
    if (!enabled) {
      clearAllTimers();
      return;
    }

    const events = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
      'wheel',
    ];

    // Throttle para no resetear en cada pixel de movimiento
    let throttleTimer: NodeJS.Timeout | null = null;
    const throttledReset = () => {
      if (throttleTimer) return;
      
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        // Solo resetear si NO estamos en modo warning
        if (!showWarning) {
          resetTimer();
        }
      }, 1000); // Throttle de 1 segundo
    };

    // Agregar listeners
    events.forEach((event) => {
      document.addEventListener(event, throttledReset, { passive: true });
    });

    // Iniciar timer inicial
    resetTimer();

    // Cleanup
    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, throttledReset);
      });
      if (throttleTimer) clearTimeout(throttleTimer);
      clearAllTimers();
    };
  }, [enabled, resetTimer, showWarning, clearAllTimers]);

  // Detectar cuando la pestaña está oculta/visible (incluye despertar de suspensión)
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Usar localStorage como fuente de verdad (sobrevive a suspensión)
        const storedActivity = getLastActivity();
        const lastActivity = storedActivity || lastActivityRef.current;
        const elapsed = Date.now() - lastActivity;
        const idleMs = idleTime * 60 * 1000;
        const totalTimeoutMs = idleMs + (warningTime * 1000);
        
        console.log(`[IdleTimeout] Visibility change - elapsed: ${Math.round(elapsed/1000)}s, timeout: ${Math.round(totalTimeoutMs/1000)}s`);
        
        if (elapsed >= totalTimeoutMs) {
          // Ya pasó el tiempo total (idle + warning), cerrar sesión inmediatamente
          console.log('[IdleTimeout] Sesión expirada por inactividad prolongada');
          clearAllTimers();
          setShowWarning(false);
          onTimeout();
        } else if (elapsed >= idleMs) {
          // Pasó el tiempo idle pero no el warning, mostrar aviso con tiempo restante
          const remainingWarning = Math.ceil((totalTimeoutMs - elapsed) / 1000);
          console.log(`[IdleTimeout] Mostrando warning - ${remainingWarning}s restantes`);
          setShowWarning(true);
          setRemainingSeconds(remainingWarning);
          
          // Limpiar timer anterior si existe
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
          }
          
          countdownTimerRef.current = setInterval(() => {
            setRemainingSeconds((prev) => {
              if (prev <= 1) {
                clearAllTimers();
                setShowWarning(false);
                onTimeout();
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        } else {
          // Todavía hay tiempo, reiniciar timer
          resetTimer();
        }
      }
    };

    // También verificar al volver de suspensión usando un intervalo de heartbeat
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let lastHeartbeat = Date.now();
    
    const checkHeartbeat = () => {
      const now = Date.now();
      const gap = now - lastHeartbeat;
      
      // Si pasaron más de 5 segundos entre heartbeats, probablemente hubo suspensión
      if (gap > 5000) {
        console.log(`[IdleTimeout] Detectado gap de ${Math.round(gap/1000)}s - posible suspensión`);
        handleVisibilityChange();
      }
      lastHeartbeat = now;
    };
    
    heartbeatInterval = setInterval(checkHeartbeat, 2000);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    };
  }, [enabled, idleTime, warningTime, onTimeout, resetTimer, clearAllTimers]);

  return {
    showWarning,
    remainingSeconds,
    resetTimer,
    extendSession,
  };
}
