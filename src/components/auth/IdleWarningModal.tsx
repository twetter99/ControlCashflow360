'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock, RefreshCw, LogOut } from 'lucide-react';

interface IdleWarningModalProps {
  /** Si mostrar el modal */
  isOpen: boolean;
  /** Segundos restantes */
  remainingSeconds: number;
  /** Callback para extender sesión */
  onExtend: () => void;
  /** Callback para cerrar sesión manualmente */
  onLogout: () => void;
}

/**
 * Modal de aviso de inactividad.
 * Aparece antes de cerrar sesión automáticamente.
 */
export function IdleWarningModal({
  isOpen,
  remainingSeconds,
  onExtend,
  onLogout,
}: IdleWarningModalProps) {
  const [isClosing, setIsClosing] = useState(false);

  // Formatear tiempo restante
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return `${secs} segundos`;
  };

  // Calcular color según urgencia
  const getUrgencyColor = (): string => {
    if (remainingSeconds <= 10) return 'text-red-600';
    if (remainingSeconds <= 30) return 'text-orange-500';
    return 'text-amber-500';
  };

  // Manejar cierre con animación
  const handleExtend = () => {
    setIsClosing(true);
    setTimeout(() => {
      onExtend();
      setIsClosing(false);
    }, 200);
  };

  if (!isOpen) return null;

  return (
    <div 
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-200 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Overlay oscuro con blur */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleExtend}
      />
      
      {/* Modal */}
      <div 
        className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden transform transition-all duration-200 ${
          isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        {/* Barra de progreso animada */}
        <div className="h-1 bg-gray-200 dark:bg-gray-700">
          <div 
            className="h-full bg-gradient-to-r from-amber-500 to-red-500 transition-all duration-1000 ease-linear"
            style={{ width: `${(remainingSeconds / 60) * 100}%` }}
          />
        </div>

        {/* Contenido */}
        <div className="p-6">
          {/* Icono y título */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Sesión a punto de expirar
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Por seguridad, tu sesión se cerrará por inactividad
              </p>
            </div>
          </div>

          {/* Contador */}
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 mb-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Clock className={`w-5 h-5 ${getUrgencyColor()}`} />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Tiempo restante
              </span>
            </div>
            <div className={`text-3xl font-bold ${getUrgencyColor()}`}>
              {formatTime(remainingSeconds)}
            </div>
          </div>

          {/* Mensaje informativo */}
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 text-center">
            Haz clic en <strong>Continuar</strong> para mantener tu sesión activa,
            o se cerrará automáticamente.
          </p>

          {/* Botones */}
          <div className="flex gap-3">
            <button
              onClick={onLogout}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
            <button
              onClick={handleExtend}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Continuar
            </button>
          </div>
        </div>

        {/* Nota de seguridad */}
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            🔒 Esta medida protege tu información financiera
          </p>
        </div>
      </div>
    </div>
  );
}
