'use client';

import React, { useState, useEffect, useRef } from 'react';

export interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  showCurrency?: boolean;
  allowNegative?: boolean;
}

/**
 * Componente de entrada de importes con formato español
 * Acepta: 1234,56 o 1.234,56 o 1234.56
 * Internamente trabaja con números para cálculos
 */
export function CurrencyInput({
  value,
  onChange,
  label,
  placeholder = '0,00',
  required = false,
  disabled = false,
  className = '',
  showCurrency = true,
  allowNegative = false,
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Formatear número a formato español para mostrar
  const formatToSpanish = (num: number): string => {
    if (isNaN(num) || num === 0) return '';
    return num.toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Parsear entrada del usuario a número
  const parseInput = (input: string): number => {
    if (!input || input.trim() === '') return 0;
    
    // Limpiar el input
    let cleaned = input.trim();
    
    // Determinar si usa formato español (coma como decimal) o inglés (punto como decimal)
    const hasComma = cleaned.includes(',');
    const hasDot = cleaned.includes('.');
    
    if (hasComma && hasDot) {
      // Tiene ambos: asumimos formato español (punto = miles, coma = decimal)
      // 1.234,56 -> 1234.56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (hasComma && !hasDot) {
      // Solo coma: es el separador decimal español
      // 1234,56 -> 1234.56
      cleaned = cleaned.replace(',', '.');
    }
    // Si solo tiene punto, asumimos que es decimal (formato inglés o español sin miles)
    
    // Remover cualquier carácter no numérico excepto punto y signo negativo
    cleaned = cleaned.replace(/[^\d.\-]/g, '');
    
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  // Actualizar display cuando cambia el valor externo
  useEffect(() => {
    if (!isFocused) {
      const numValue = typeof value === 'number' ? value : 0;
      if (numValue !== 0) {
        setDisplayValue(formatToSpanish(numValue));
      } else {
        setDisplayValue('');
      }
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    
    // Permitir solo caracteres válidos para entrada
    const validChars = allowNegative ? /^[\d.,\-\s]*$/ : /^[\d.,\s]*$/;
    if (!validChars.test(input)) return;
    
    setDisplayValue(input);
    
    // Convertir a número y notificar al padre
    const numValue = parseInput(input);
    onChange(numValue);
  };

  const handleFocus = () => {
    setIsFocused(true);
    // Seleccionar todo al enfocar para fácil edición
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Formatear al perder el foco
    const numValue = parseInput(displayValue);
    if (numValue !== 0) {
      setDisplayValue(formatToSpanish(numValue));
    } else {
      setDisplayValue('');
    }
    onChange(numValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Permitir navegación y edición
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Home', 'End'];
    if (allowedKeys.includes(e.key)) return;
    
    // Permitir Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    if (e.ctrlKey || e.metaKey) return;
    
    // Permitir números
    if (/^\d$/.test(e.key)) return;
    
    // Permitir coma y punto (separadores decimales)
    if (e.key === ',' || e.key === '.') return;
    
    // Permitir signo negativo al inicio si está permitido
    if (allowNegative && e.key === '-' && inputRef.current?.selectionStart === 0) return;
    
    // Bloquear todo lo demás
    e.preventDefault();
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-right ${
            showCurrency ? 'pr-8' : ''
          } ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
        />
        {showCurrency && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            €
          </span>
        )}
      </div>
    </div>
  );
}

export default CurrencyInput;
