'use client';

import React, { useState, useEffect, useRef } from 'react';
import { validateIBAN, formatIBAN, cleanIBAN, type IBANValidationResult } from '@/lib/utils';
import { Check, X, AlertCircle, Globe } from 'lucide-react';

export interface IBANInputProps {
  value: string;
  onChange: (value: string, isValid: boolean) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** Lista de IBANs sugeridos (para autocompletado de proveedores recurrentes) */
  suggestions?: string[];
  /** Mostrar checkbox para IBAN internacional */
  showInternationalOption?: boolean;
  /** Callback cuando cambia la opción de internacional */
  onInternationalChange?: (isInternational: boolean) => void;
  /** Valor inicial de isInternational */
  isInternational?: boolean;
  /** Texto de ayuda bajo el input */
  helpText?: string;
}

/**
 * Componente de entrada de IBAN con validación en tiempo real
 * - Formato automático en bloques de 4
 * - Validación MOD-97
 * - Soporte para IBAN español e internacional
 * - Autocompletado de IBANs frecuentes
 */
export function IBANInput({
  value,
  onChange,
  label = 'IBAN',
  placeholder = 'ES00 0000 0000 0000 0000 0000',
  required = false,
  disabled = false,
  className = '',
  suggestions = [],
  showInternationalOption = true,
  onInternationalChange,
  isInternational: initialIsInternational = false,
  helpText,
}: IBANInputProps) {
  const [displayValue, setDisplayValue] = useState('');
  const [isInternational, setIsInternational] = useState(initialIsInternational);
  const [validation, setValidation] = useState<IBANValidationResult>({ isValid: true });
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filtrar sugerencias basadas en el input actual
  const filteredSuggestions = suggestions.filter(s => {
    if (!displayValue) return true;
    const cleanInput = cleanIBAN(displayValue);
    const cleanSuggestion = cleanIBAN(s);
    return cleanSuggestion.startsWith(cleanInput) && cleanSuggestion !== cleanInput;
  });

  // Actualizar display cuando cambia el valor externo
  useEffect(() => {
    if (value !== cleanIBAN(displayValue)) {
      setDisplayValue(formatIBAN(value));
    }
  }, [value]);

  // Cerrar sugerencias al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Validar cuando cambia el valor o la opción internacional
  useEffect(() => {
    const clean = cleanIBAN(displayValue);
    const result = validateIBAN(clean, isInternational);
    setValidation(result);
  }, [displayValue, isInternational]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value.toUpperCase();
    
    // Solo permitir caracteres válidos para IBAN
    const cleaned = input.replace(/[^A-Z0-9\s]/g, '');
    
    // Formatear automáticamente
    const cleanValue = cleanIBAN(cleaned);
    const formatted = formatIBAN(cleanValue);
    
    setDisplayValue(formatted);
    
    // Validar y notificar
    const result = validateIBAN(cleanValue, isInternational);
    onChange(cleanValue, result.isValid);
    
    // Mostrar sugerencias si hay texto
    setShowSuggestions(cleanValue.length > 0 && filteredSuggestions.length > 0);
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (filteredSuggestions.length > 0 && displayValue) {
      setShowSuggestions(true);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Pequeño delay para permitir clic en sugerencia
    setTimeout(() => setShowSuggestions(false), 150);
  };

  const handleSuggestionClick = (suggestion: string) => {
    const clean = cleanIBAN(suggestion);
    setDisplayValue(formatIBAN(clean));
    const result = validateIBAN(clean, isInternational);
    onChange(clean, result.isValid);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleInternationalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setIsInternational(newValue);
    onInternationalChange?.(newValue);
    
    // Re-validar con la nueva opción
    const clean = cleanIBAN(displayValue);
    const result = validateIBAN(clean, newValue);
    onChange(clean, result.isValid);
  };

  // Determinar estado visual
  const hasValue = displayValue.length > 0;
  const showValidation = hasValue && !isFocused;
  const isValid = validation.isValid;
  
  // Clases del input según estado
  const inputClasses = `
    w-full px-3 py-2 pr-10 border rounded-lg font-mono text-sm tracking-wider
    focus:ring-2 focus:ring-primary-500 focus:border-primary-500
    ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
    ${showValidation && isValid && hasValue ? 'border-green-500 bg-green-50' : ''}
    ${showValidation && !isValid ? 'border-red-500 bg-red-50' : ''}
    ${!showValidation ? 'border-gray-300' : ''}
  `.trim();

  return (
    <div className={className} ref={containerRef}>
      {/* Label y checkbox internacional */}
      <div className="flex items-center justify-between mb-1">
        {label && (
          <label className="block text-sm font-medium text-gray-700">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}
        {showInternationalOption && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer hover:text-gray-700">
            <input
              type="checkbox"
              checked={isInternational}
              onChange={handleInternationalChange}
              disabled={disabled}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-3.5 w-3.5"
            />
            <Globe size={12} />
            <span>Internacional</span>
          </label>
        )}
      </div>

      {/* Input con icono de validación */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={isInternational ? 'XX00 0000 0000 ...' : placeholder}
          required={required}
          disabled={disabled}
          autoComplete="off"
          className={inputClasses}
        />
        
        {/* Icono de validación */}
        {showValidation && hasValue && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {isValid ? (
              <Check size={18} className="text-green-600" />
            ) : (
              <X size={18} className="text-red-600" />
            )}
          </div>
        )}

        {/* Indicador de país detectado */}
        {validation.countryCode && hasValue && isValid && (
          <span className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
            {validation.countryCode}
          </span>
        )}

        {/* Lista de sugerencias */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            <div className="px-3 py-1.5 text-xs text-gray-500 bg-gray-50 border-b">
              IBANs utilizados anteriormente
            </div>
            {filteredSuggestions.slice(0, 5).map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full px-3 py-2 text-left text-sm font-mono hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
              >
                {formatIBAN(suggestion)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mensaje de error o ayuda */}
      {showValidation && !isValid && validation.error ? (
        <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
          <AlertCircle size={12} />
          {validation.error}
        </p>
      ) : helpText ? (
        <p className="mt-1 text-xs text-gray-500">{helpText}</p>
      ) : null}
    </div>
  );
}

export default IBANInput;
