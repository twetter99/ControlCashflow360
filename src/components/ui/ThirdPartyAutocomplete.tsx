'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ThirdParty, ThirdPartyType, ThirdPartySearchResult, CreateThirdPartyInput } from '@/types';
import { thirdPartiesApi } from '@/lib/api-client';
import { Plus, User, Building, AlertTriangle, X, Check, Loader2 } from 'lucide-react';

interface ThirdPartyAutocompleteProps {
  value: string;
  thirdPartyId?: string;
  onChange: (displayName: string, thirdPartyId?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const TYPE_LABELS: Record<ThirdPartyType, string> = {
  CUSTOMER: 'Cliente',
  SUPPLIER: 'Proveedor',
  CREDITOR: 'Acreedor',
  MIXED: 'Mixto',
};

const TYPE_ICONS: Record<ThirdPartyType, React.ReactNode> = {
  CUSTOMER: <User size={14} className="text-green-600" />,
  SUPPLIER: <Building size={14} className="text-blue-600" />,
  CREDITOR: <Building size={14} className="text-orange-600" />,
  MIXED: <User size={14} className="text-gray-600" />,
};

export default function ThirdPartyAutocomplete({
  value,
  thirdPartyId,
  onChange,
  placeholder = 'Nombre del cliente/proveedor',
  disabled = false,
  className = '',
}: ThirdPartyAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<ThirdParty[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<ThirdPartySearchResult[]>([]);
  const [createFormData, setCreateFormData] = useState<CreateThirdPartyInput>({
    type: 'SUPPLIER',
    displayName: '',
  });
  const [isCreating, setIsCreating] = useState(false);
  
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Sincronizar valor externo
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Búsqueda con debounce
  const searchThirdParties = useCallback(async (searchText: string) => {
    if (searchText.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const results = await thirdPartiesApi.search(searchText);
      setSuggestions(results.slice(0, 7)); // Máximo 7 resultados
    } catch (error) {
      console.error('Error buscando terceros:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Manejar cambio en input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue, undefined); // Limpiar thirdPartyId al escribir manualmente
    setIsOpen(true);

    // Debounce la búsqueda
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      searchThirdParties(newValue);
    }, 300);
  };

  // Seleccionar un tercero existente
  const handleSelect = (thirdParty: ThirdParty) => {
    setInputValue(thirdParty.displayName);
    onChange(thirdParty.displayName, thirdParty.id);
    setIsOpen(false);
    setSuggestions([]);
  };

  // Abrir modal para crear nuevo
  const handleOpenCreateModal = () => {
    setCreateFormData({
      type: 'SUPPLIER',
      displayName: inputValue.trim(),
    });
    setDuplicateWarning([]);
    setShowCreateModal(true);
    setIsOpen(false);
  };

  // Verificar duplicados antes de crear
  const checkDuplicatesBeforeCreate = async () => {
    if (createFormData.displayName.trim().length < 2) return;
    
    setIsLoading(true);
    try {
      const duplicates = await thirdPartiesApi.checkDuplicates(createFormData.displayName);
      if (duplicates.length > 0) {
        setDuplicateWarning(duplicates);
      } else {
        await createThirdParty();
      }
    } catch (error) {
      console.error('Error verificando duplicados:', error);
      await createThirdParty(); // Crear de todas formas si falla la verificación
    } finally {
      setIsLoading(false);
    }
  };

  // Crear nuevo tercero
  const createThirdParty = async () => {
    setIsCreating(true);
    try {
      const newThirdParty = await thirdPartiesApi.create(createFormData);
      setInputValue(newThirdParty.displayName);
      onChange(newThirdParty.displayName, newThirdParty.id);
      setShowCreateModal(false);
      setDuplicateWarning([]);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error creando tercero';
      alert(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  // Usar tercero existente desde el warning de duplicados
  const handleUseDuplicate = (duplicate: ThirdPartySearchResult) => {
    setInputValue(duplicate.displayName);
    onChange(duplicate.displayName, duplicate.id);
    setShowCreateModal(false);
    setDuplicateWarning([]);
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <label className="block text-sm font-medium text-gray-700 mb-1">Tercero</label>
      
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => inputValue.length >= 2 && setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full border rounded-lg px-4 py-3 pr-10 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" size={18} />
        )}
        {thirdPartyId && !isLoading && (
          <Check className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500" size={18} />
        )}
      </div>

      {/* Dropdown de sugerencias */}
      {isOpen && (suggestions.length > 0 || inputValue.trim().length >= 2) && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {suggestions.map((tp) => (
            <button
              key={tp.id}
              type="button"
              onClick={() => handleSelect(tp)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between border-b last:border-0"
            >
              <div className="flex items-center space-x-3">
                {TYPE_ICONS[tp.type]}
                <div>
                  <p className="font-medium text-gray-900">{tp.displayName}</p>
                  <p className="text-xs text-gray-500">{TYPE_LABELS[tp.type]}</p>
                </div>
              </div>
              {tp.cif && (
                <span className="text-xs text-gray-400">{tp.cif}</span>
              )}
            </button>
          ))}
          
          {/* Opción de crear nuevo */}
          {inputValue.trim().length >= 2 && (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="w-full px-4 py-3 text-left hover:bg-primary-50 flex items-center space-x-3 text-primary-600 border-t"
            >
              <Plus size={18} />
              <span>Crear nuevo: &quot;{inputValue.trim()}&quot;</span>
            </button>
          )}
        </div>
      )}

      {/* Modal de crear tercero */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Nuevo Tercero</h3>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setDuplicateWarning([]);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Warning de duplicados */}
              {duplicateWarning.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="text-yellow-600 mt-0.5" size={20} />
                    <div className="flex-1">
                      <p className="font-medium text-yellow-800">
                        Ya existen terceros similares:
                      </p>
                      <div className="mt-2 space-y-2">
                        {duplicateWarning.map((dup) => (
                          <div key={dup.id} className="flex items-center justify-between">
                            <span className="text-sm text-yellow-700">
                              {dup.displayName} ({Math.round((dup.similarity || 0) * 100)}% similar)
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUseDuplicate(dup)}
                              className="text-xs text-primary-600 hover:underline"
                            >
                              Usar este
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex space-x-2">
                        <button
                          type="button"
                          onClick={() => createThirdParty()}
                          disabled={isCreating}
                          className="text-sm px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
                        >
                          Crear nuevo igualmente
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Formulario */}
              {duplicateWarning.length === 0 && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre *
                    </label>
                    <input
                      type="text"
                      value={createFormData.displayName}
                      onChange={(e) => setCreateFormData({ ...createFormData, displayName: e.target.value })}
                      className="w-full border rounded-lg px-4 py-2"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tipo *
                    </label>
                    <select
                      value={createFormData.type}
                      onChange={(e) => setCreateFormData({ ...createFormData, type: e.target.value as ThirdPartyType })}
                      className="w-full border rounded-lg px-4 py-2"
                    >
                      <option value="SUPPLIER">Proveedor</option>
                      <option value="CUSTOMER">Cliente</option>
                      <option value="CREDITOR">Acreedor</option>
                      <option value="MIXED">Mixto</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      NIF/CIF (opcional)
                    </label>
                    <input
                      type="text"
                      value={createFormData.cif || ''}
                      onChange={(e) => setCreateFormData({ ...createFormData, cif: e.target.value })}
                      className="w-full border rounded-lg px-4 py-2"
                      placeholder="B12345678"
                    />
                  </div>

                  <div className="flex justify-end space-x-3 pt-4 border-t">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={checkDuplicatesBeforeCreate}
                      disabled={isCreating || createFormData.displayName.trim().length < 2}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center space-x-2"
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          <span>Guardando...</span>
                        </>
                      ) : (
                        <>
                          <Check size={16} />
                          <span>Guardar y usar</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
