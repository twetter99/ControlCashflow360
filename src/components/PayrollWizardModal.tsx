'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Input, CurrencyInput, IBANInput } from '@/components/ui';
import { workersApi, payrollApi, companiesApi } from '@/lib/api-client';
import { 
  Worker, 
  Company, 
  PayrollBatch, 
  PayrollLine,
  PayrollValidationError,
  PayrollType
} from '@/types';
import toast from 'react-hot-toast';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  Search,
  Copy,
  AlertCircle,
  Plus,
  Users,
  CreditCard,
  Calendar,
  Building2,
  FileText,
  Loader2,
  ClipboardList,
  CheckCircle,
  Edit2,
  Trash2,
} from 'lucide-react';
import { formatCurrency, formatIBAN } from '@/lib/utils';

interface PayrollWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (batch: PayrollBatch, totalAmount: number) => void;
  companyId?: string;
  existingBatchId?: string;
}

interface WorkerSelection {
  workerId: string;
  worker: Worker;
  selected: boolean;
  amount: number;
  hasError: boolean;
  errorMessage?: string;
}

type WizardStep = 'select-period' | 'select-workers' | 'review-amounts' | 'confirm';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function PayrollWizardModal({
  isOpen,
  onClose,
  onComplete,
  companyId: initialCompanyId,
  existingBatchId,
}: PayrollWizardModalProps) {
  // Estado del wizard
  const [step, setStep] = useState<WizardStep>('select-period');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Datos
  const [companies, setCompanies] = useState<Company[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workerSelections, setWorkerSelections] = useState<WorkerSelection[]>([]);
  const [batch, setBatch] = useState<PayrollBatch | null>(null);
  const [existingLines, setExistingLines] = useState<PayrollLine[]>([]);
  
  // Formulario paso 1
  const [selectedCompanyId, setSelectedCompanyId] = useState(initialCompanyId || '');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedPayrollType, setSelectedPayrollType] = useState<PayrollType>('MONTHLY');
  const [dueDate, setDueDate] = useState('');
  
  // Búsqueda y filtros
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal para añadir/editar trabajador
  const [showWorkerForm, setShowWorkerForm] = useState(false);
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [workerForm, setWorkerForm] = useState({
    displayName: '',
    identifier: '',
    iban: '',
    bankAlias: '',
    defaultAmount: 0,
  });
  const [isIBANValid, setIsIBANValid] = useState(true);

  // Cargar datos iniciales
  useEffect(() => {
    if (!isOpen) return;
    
    const loadInitialData = async () => {
      setLoading(true);
      try {
        const companiesData = await companiesApi.getAll();
        setCompanies(companiesData);
        
        if (initialCompanyId) {
          setSelectedCompanyId(initialCompanyId);
        }
        
        // Si hay un batch existente, cargarlo
        if (existingBatchId) {
          const batchData = await payrollApi.getById(existingBatchId);
          setBatch(batchData.batch);
          setExistingLines(batchData.lines);
          setSelectedCompanyId(batchData.batch.companyId);
          setSelectedYear(batchData.batch.year);
          setSelectedMonth(batchData.batch.month);
          // Saltar al paso de revisión si ya hay líneas
          if (batchData.lines.length > 0) {
            setStep('review-amounts');
          }
        }
      } catch (error) {
        console.error('Error cargando datos:', error);
        toast.error('Error al cargar datos');
      } finally {
        setLoading(false);
      }
    };
    
    loadInitialData();
  }, [isOpen, initialCompanyId, existingBatchId]);

  // Cargar trabajadores cuando se selecciona empresa
  useEffect(() => {
    if (!selectedCompanyId) {
      setWorkers([]);
      return;
    }
    
    const loadWorkers = async () => {
      try {
        const workersData = await workersApi.getActiveByCompany(selectedCompanyId);
        setWorkers(workersData);
        
        // Inicializar selecciones
        const selections: WorkerSelection[] = workersData.map(worker => {
          // Buscar si hay una línea existente para este trabajador
          const existingLine = existingLines.find(l => l.workerId === worker.id);
          
          // Para pagas extras, usar defaultExtraAmount si existe, si no defaultAmount
          const isExtra = selectedPayrollType !== 'MONTHLY';
          const defaultAmount = isExtra 
            ? (worker.defaultExtraAmount || worker.defaultAmount || 0)
            : (worker.defaultAmount || 0);
          
          return {
            workerId: worker.id,
            worker,
            selected: !!existingLine,
            amount: existingLine?.amount || defaultAmount,
            hasError: false,
          };
        });
        
        setWorkerSelections(selections);
      } catch (error) {
        console.error('Error cargando trabajadores:', error);
        toast.error('Error al cargar trabajadores');
      }
    };
    
    loadWorkers();
  }, [selectedCompanyId, existingLines, selectedPayrollType]);

  // Filtrar trabajadores por búsqueda
  const filteredSelections = workerSelections.filter(sel => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      sel.worker.displayName.toLowerCase().includes(term) ||
      (sel.worker.identifier || '').toLowerCase().includes(term) ||
      (sel.worker.alias || '').toLowerCase().includes(term)
    );
  });

  // Calcular totales
  const selectedWorkers = workerSelections.filter(s => s.selected);
  const totalAmount = selectedWorkers.reduce((sum, s) => sum + s.amount, 0);
  const workersWithErrors = selectedWorkers.filter(s => s.hasError);
  const workersWithoutIBAN = selectedWorkers.filter(s => !s.worker.iban || s.worker.iban.trim() === '');

  // Validar selección antes de avanzar
  const validateSelections = useCallback((): boolean => {
    let hasErrors = false;
    
    const updatedSelections = workerSelections.map(sel => {
      if (!sel.selected) return sel;
      
      let hasError = false;
      let errorMessage = '';
      
      if (!sel.worker.iban || sel.worker.iban.trim() === '') {
        hasError = true;
        errorMessage = 'Falta IBAN';
      } else if (!sel.amount || sel.amount <= 0) {
        hasError = true;
        errorMessage = 'Importe inválido';
      }
      
      if (hasError) hasErrors = true;
      
      return { ...sel, hasError, errorMessage };
    });
    
    setWorkerSelections(updatedSelections);
    return !hasErrors;
  }, [workerSelections]);

  // Handlers de navegación
  const handleNextStep = async () => {
    if (step === 'select-period') {
      if (!selectedCompanyId) {
        toast.error('Selecciona una empresa');
        return;
      }
      
      // Crear o recuperar el lote
      setSaving(true);
      try {
        const batchData = await payrollApi.create({
          companyId: selectedCompanyId,
          year: selectedYear,
          month: selectedMonth,
          payrollType: selectedPayrollType,
          dueDate: dueDate ? new Date(dueDate) : undefined,
        });
        
        setBatch(batchData);
        
        if (batchData.isExisting) {
          // Cargar líneas existentes
          const fullBatch = await payrollApi.getById(batchData.id);
          setExistingLines(fullBatch.lines);
          
          if (fullBatch.lines.length > 0) {
            toast.success('Lote existente recuperado');
          }
        }
        
        setStep('select-workers');
      } catch (error) {
        console.error('Error creando lote:', error);
        toast.error('Error al crear el lote');
      } finally {
        setSaving(false);
      }
    } else if (step === 'select-workers') {
      if (selectedWorkers.length === 0) {
        toast.error('Selecciona al menos un trabajador');
        return;
      }
      setStep('review-amounts');
    } else if (step === 'review-amounts') {
      if (!validateSelections()) {
        toast.error('Corrige los errores antes de continuar');
        return;
      }
      setStep('confirm');
    }
  };

  const handlePrevStep = () => {
    if (step === 'select-workers') setStep('select-period');
    else if (step === 'review-amounts') setStep('select-workers');
    else if (step === 'confirm') setStep('review-amounts');
  };

  // Copiar del mes anterior
  const handleCopyPrevious = async () => {
    if (!batch) return;
    
    setSaving(true);
    try {
      const result = await payrollApi.copyFromPrevious(batch.id);
      
      if (result.copiedWorkers === 0) {
        toast.error('No hay datos del mes anterior para copiar');
        return;
      }
      
      // Actualizar selecciones con los datos copiados
      const updatedSelections = workerSelections.map(sel => {
        const copiedLine = result.lines.find(l => l.workerId === sel.workerId);
        if (copiedLine) {
          return {
            ...sel,
            selected: true,
            amount: copiedLine.amount,
          };
        }
        return sel;
      });
      
      setWorkerSelections(updatedSelections);
      setExistingLines(result.lines);
      
      toast.success(`Copiados ${result.copiedWorkers} trabajadores del mes anterior`);
      if (result.skippedWorkers > 0) {
        toast(`${result.skippedWorkers} trabajadores omitidos (inactivos)`, { icon: 'ℹ️' });
      }
    } catch (error: unknown) {
      console.error('Error copiando:', error);
      const message = error instanceof Error ? error.message : 'Error al copiar del mes anterior';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // Seleccionar/deseleccionar trabajador
  const toggleWorkerSelection = (workerId: string) => {
    setWorkerSelections(prev => prev.map(sel => 
      sel.workerId === workerId ? { ...sel, selected: !sel.selected } : sel
    ));
  };

  // Actualizar importe de trabajador
  const updateWorkerAmount = (workerId: string, amount: number) => {
    setWorkerSelections(prev => prev.map(sel => 
      sel.workerId === workerId ? { ...sel, amount, hasError: false, errorMessage: '' } : sel
    ));
  };

  // Seleccionar todos
  const selectAll = () => {
    setWorkerSelections(prev => prev.map(sel => ({ ...sel, selected: true })));
  };

  // Deseleccionar todos
  const deselectAll = () => {
    setWorkerSelections(prev => prev.map(sel => ({ ...sel, selected: false })));
  };

  // Guardar lote (confirmar o como borrador)
  const handleSave = async (confirm: boolean, generatePaymentOrder: boolean = false) => {
    if (!batch) return;
    
    setSaving(true);
    try {
      // Primero, añadir las líneas al lote
      const linesToAdd = selectedWorkers.map(sel => ({
        workerId: sel.workerId,
        amount: sel.amount,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      }));
      
      // Si ya hay líneas existentes, eliminarlas primero (para reemplazar)
      // Esto se maneja en el backend
      
      await payrollApi.addLines(batch.id, linesToAdd);
      
      if (confirm) {
        // Validar y confirmar
        const confirmResult = await payrollApi.confirm(batch.id);
        toast.success(`Lote confirmado con ${confirmResult.workerCount} trabajadores`);
        
        if (generatePaymentOrder) {
          // Generar orden de pago
          const orderResult = await payrollApi.generatePaymentOrder(batch.id);
          toast.success(`Orden de pago ${orderResult.paymentOrderNumber} generada`);
        }
      } else {
        toast.success('Lote guardado como borrador');
      }
      
      onComplete(batch, totalAmount);
      onClose();
    } catch (error: unknown) {
      console.error('Error guardando:', error);
      const message = error instanceof Error ? error.message : 'Error al guardar';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // Añadir trabajador rápido
  const handleSaveWorker = async () => {
    if (!workerForm.displayName.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (!workerForm.iban.trim() || !isIBANValid) {
      toast.error('IBAN válido es obligatorio');
      return;
    }
    
    setSaving(true);
    try {
      if (editingWorkerId) {
        // Actualizar trabajador existente
        const updated = await workersApi.update(editingWorkerId, {
          displayName: workerForm.displayName.trim(),
          identifier: workerForm.identifier.trim() || undefined,
          iban: workerForm.iban,
          bankAlias: workerForm.bankAlias.trim() || undefined,
          defaultAmount: workerForm.defaultAmount || undefined,
        });
        
        // Actualizar en la lista local
        setWorkers(prev => prev.map(w => w.id === editingWorkerId ? updated : w));
        setWorkerSelections(prev => prev.map(sel => 
          sel.workerId === editingWorkerId 
            ? { ...sel, worker: updated, hasError: false, errorMessage: '' }
            : sel
        ));
        
        toast.success('Trabajador actualizado');
      } else {
        // Crear nuevo trabajador
        const created = await workersApi.create({
          companyId: selectedCompanyId,
          displayName: workerForm.displayName.trim(),
          identifier: workerForm.identifier.trim() || undefined,
          iban: workerForm.iban,
          bankAlias: workerForm.bankAlias.trim() || undefined,
          defaultAmount: workerForm.defaultAmount || undefined,
        });
        
        // Añadir a la lista y seleccionar
        setWorkers(prev => [...prev, created]);
        setWorkerSelections(prev => [...prev, {
          workerId: created.id,
          worker: created,
          selected: true,
          amount: created.defaultAmount || 0,
          hasError: false,
        }]);
        
        toast.success('Trabajador creado y seleccionado');
      }
      
      setShowWorkerForm(false);
      setEditingWorkerId(null);
      setWorkerForm({
        displayName: '',
        identifier: '',
        iban: '',
        bankAlias: '',
        defaultAmount: 0,
      });
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al guardar trabajador');
    } finally {
      setSaving(false);
    }
  };

  // Editar trabajador (para corregir IBAN)
  const handleEditWorker = (worker: Worker) => {
    setWorkerForm({
      displayName: worker.displayName,
      identifier: worker.identifier || '',
      iban: worker.iban || '',
      bankAlias: worker.bankAlias || '',
      defaultAmount: worker.defaultAmount || 0,
    });
    setEditingWorkerId(worker.id);
    setShowWorkerForm(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Gestionar Nóminas
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {step === 'select-period' && 'Paso 1: Selecciona empresa y período'}
                {step === 'select-workers' && 'Paso 2: Selecciona trabajadores'}
                {step === 'review-amounts' && 'Paso 3: Revisa importes'}
                {step === 'confirm' && 'Paso 4: Confirmar y guardar'}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>

          {/* Progress bar */}
          <div className="px-6 pt-4">
            <div className="flex items-center space-x-2">
              {['select-period', 'select-workers', 'review-amounts', 'confirm'].map((s, i) => (
                <React.Fragment key={s}>
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    step === s 
                      ? 'bg-primary-600 text-white'
                      : ['select-period', 'select-workers', 'review-amounts', 'confirm'].indexOf(step) > i
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}>
                    {['select-period', 'select-workers', 'review-amounts', 'confirm'].indexOf(step) > i 
                      ? <Check size={16} />
                      : i + 1
                    }
                  </div>
                  {i < 3 && (
                    <div className={`flex-1 h-1 ${
                      ['select-period', 'select-workers', 'review-amounts', 'confirm'].indexOf(step) > i
                        ? 'bg-green-500'
                        : 'bg-gray-200'
                    }`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 min-h-[400px]">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="animate-spin text-primary-600" size={32} />
              </div>
            ) : (
              <>
                {/* Paso 1: Seleccionar período */}
                {step === 'select-period' && (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Building2 size={16} className="inline mr-2" />
                        Empresa
                      </label>
                      <select
                        value={selectedCompanyId}
                        onChange={(e) => setSelectedCompanyId(e.target.value)}
                        className="w-full border rounded-lg px-4 py-3"
                        disabled={!!existingBatchId}
                      >
                        <option value="">Selecciona empresa</option>
                        {companies.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          <Calendar size={16} className="inline mr-2" />
                          Mes
                        </label>
                        <select
                          value={selectedMonth}
                          onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                          className="w-full border rounded-lg px-4 py-3"
                          disabled={!!existingBatchId}
                        >
                          {MONTH_NAMES.map((name, i) => (
                            <option key={i} value={i + 1}>{name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Año
                        </label>
                        <select
                          value={selectedYear}
                          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                          className="w-full border rounded-lg px-4 py-3"
                          disabled={!!existingBatchId}
                        >
                          {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Tipo de nómina */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tipo de Pago
                      </label>
                      <select
                        value={selectedPayrollType}
                        onChange={(e) => setSelectedPayrollType(e.target.value as PayrollType)}
                        className="w-full border rounded-lg px-4 py-3"
                        disabled={!!existingBatchId}
                      >
                        <option value="MONTHLY">Nómina Mensual</option>
                        <option value="EXTRA_SUMMER">Paga Extra Verano</option>
                        <option value="EXTRA_CHRISTMAS">Paga Extra Navidad</option>
                        <option value="BONUS">Bonus / Incentivo</option>
                        <option value="OTHER">Otro pago extraordinario</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Fecha de pago prevista (opcional)
                      </label>
                      <Input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-800">
                        <FileText size={16} className="inline mr-2" />
                        Se creará el lote: <strong>
                          {selectedPayrollType === 'MONTHLY' && `Nóminas ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`}
                          {selectedPayrollType === 'EXTRA_SUMMER' && `Paga Extra Verano ${selectedYear}`}
                          {selectedPayrollType === 'EXTRA_CHRISTMAS' && `Paga Extra Navidad ${selectedYear}`}
                          {selectedPayrollType === 'BONUS' && `Bonus ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`}
                          {selectedPayrollType === 'OTHER' && `Pago Extraordinario ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`}
                        </strong>
                      </p>
                      {selectedPayrollType !== 'MONTHLY' && (
                        <p className="text-xs text-blue-600 mt-1">
                          💡 Para pagas extras, se usará el importe de paga extra configurado en cada trabajador (si está disponible).
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Paso 2: Seleccionar trabajadores */}
                {step === 'select-workers' && (
                  <div className="space-y-4">
                    {/* Barra de acciones */}
                    <div className="flex items-center justify-between">
                      <div className="relative flex-1 max-w-xs">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Buscar trabajador..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={handleCopyPrevious}
                          disabled={saving}
                          className="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg flex items-center gap-1"
                        >
                          <Copy size={16} />
                          Copiar mes anterior
                        </button>
                        <button
                          onClick={() => setShowWorkerForm(true)}
                          className="px-3 py-2 text-sm font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-lg flex items-center gap-1"
                        >
                          <Plus size={16} />
                          Añadir trabajador
                        </button>
                      </div>
                    </div>

                    {/* Selección rápida */}
                    <div className="flex items-center space-x-4 text-sm">
                      <button onClick={selectAll} className="text-primary-600 hover:underline">
                        Seleccionar todos
                      </button>
                      <button onClick={deselectAll} className="text-gray-500 hover:underline">
                        Deseleccionar todos
                      </button>
                      <span className="text-gray-400">|</span>
                      <span className="text-gray-600">
                        {selectedWorkers.length} de {workers.length} seleccionados
                      </span>
                    </div>

                    {/* Lista de trabajadores */}
                    <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                      {filteredSelections.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                          <Users className="mx-auto mb-2" size={32} />
                          <p>No hay trabajadores para mostrar</p>
                          <button
                            onClick={() => setShowWorkerForm(true)}
                            className="mt-2 text-primary-600 hover:underline"
                          >
                            Añadir el primer trabajador
                          </button>
                        </div>
                      ) : (
                        filteredSelections.map(sel => (
                          <div
                            key={sel.workerId}
                            className={`flex items-center p-3 border-b last:border-0 hover:bg-gray-50 ${
                              sel.selected ? 'bg-primary-50' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={sel.selected}
                              onChange={() => toggleWorkerSelection(sel.workerId)}
                              className="w-4 h-4 rounded border-gray-300 text-primary-600 mr-3"
                            />
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{sel.worker.displayName}</p>
                              {sel.worker.identifier && (
                                <p className="text-xs text-gray-500">{sel.worker.identifier}</p>
                              )}
                            </div>
                            <div className="text-right">
                              {sel.worker.iban ? (
                                <p className="text-xs font-mono text-gray-500">
                                  {formatIBAN(sel.worker.iban).slice(-8)}
                                </p>
                              ) : (
                                <span className="text-xs text-amber-600 flex items-center gap-1">
                                  <AlertCircle size={12} />
                                  Sin IBAN
                                </span>
                              )}
                              {sel.worker.defaultAmount && (
                                <p className="text-sm text-gray-600">
                                  {formatCurrency(sel.worker.defaultAmount)}
                                </p>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Paso 3: Revisar importes */}
                {step === 'review-amounts' && (
                  <div className="space-y-4">
                    {workersWithoutIBAN.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <p className="text-sm text-amber-800 font-medium flex items-center gap-2">
                          <AlertCircle size={16} />
                          {workersWithoutIBAN.length} trabajador(es) sin IBAN - No podrás confirmar hasta corregirlo
                        </p>
                      </div>
                    )}

                    <div className="border rounded-lg max-h-[350px] overflow-y-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr className="text-left text-sm text-gray-500">
                            <th className="p-3 font-medium">Trabajador</th>
                            <th className="p-3 font-medium">IBAN</th>
                            <th className="p-3 font-medium text-right w-40">Importe</th>
                            <th className="p-3 w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedWorkers.map(sel => (
                            <tr 
                              key={sel.workerId} 
                              className={`border-b ${sel.hasError ? 'bg-red-50' : ''}`}
                            >
                              <td className="p-3">
                                <p className="font-medium text-gray-900">{sel.worker.displayName}</p>
                                {sel.hasError && (
                                  <p className="text-xs text-red-600">{sel.errorMessage}</p>
                                )}
                              </td>
                              <td className="p-3">
                                {sel.worker.iban ? (
                                  <span className="text-xs font-mono text-gray-600">
                                    {formatIBAN(sel.worker.iban)}
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleEditWorker(sel.worker)}
                                    className="text-xs text-amber-600 hover:underline flex items-center gap-1"
                                  >
                                    <AlertCircle size={12} />
                                    Añadir IBAN
                                  </button>
                                )}
                              </td>
                              <td className="p-3">
                                <CurrencyInput
                                  value={sel.amount}
                                  onChange={(value) => updateWorkerAmount(sel.workerId, value)}
                                  className="text-right"
                                />
                              </td>
                              <td className="p-3">
                                <button
                                  onClick={() => handleEditWorker(sel.worker)}
                                  className="p-1 text-gray-400 hover:text-primary-600"
                                  title="Editar trabajador"
                                >
                                  <Edit2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 font-medium">
                          <tr>
                            <td colSpan={2} className="p-3 text-right">
                              Total ({selectedWorkers.length} trabajadores):
                            </td>
                            <td className="p-3 text-right text-lg">
                              {formatCurrency(totalAmount)}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Paso 4: Confirmar */}
                {step === 'confirm' && (
                  <div className="space-y-6">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <CheckCircle className="text-green-600" size={32} />
                        <div>
                          <h3 className="font-bold text-green-800 text-lg">
                            Resumen del lote
                          </h3>
                          <p className="text-green-600">
                            Nóminas {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                          </p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Empresa</p>
                          <p className="font-medium">{companies.find(c => c.id === selectedCompanyId)?.name}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Trabajadores</p>
                          <p className="font-medium">{selectedWorkers.length}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Total a pagar</p>
                          <p className="font-bold text-xl text-green-700">{formatCurrency(totalAmount)}</p>
                        </div>
                        {dueDate && (
                          <div>
                            <p className="text-gray-600">Fecha prevista</p>
                            <p className="font-medium">{new Date(dueDate).toLocaleDateString('es-ES')}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="font-medium text-gray-700">¿Qué quieres hacer?</p>
                      
                      <button
                        onClick={() => handleSave(false)}
                        disabled={saving}
                        className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-gray-300 text-left transition-colors"
                      >
                        <p className="font-medium text-gray-900">Guardar como borrador</p>
                        <p className="text-sm text-gray-500">Podrás continuar editando más tarde</p>
                      </button>
                      
                      <button
                        onClick={() => handleSave(true, false)}
                        disabled={saving}
                        className="w-full p-4 border-2 border-primary-200 bg-primary-50 rounded-lg hover:border-primary-300 text-left transition-colors"
                      >
                        <p className="font-medium text-primary-900">Confirmar sin orden de pago</p>
                        <p className="text-sm text-primary-600">Confirma el lote pero no genera orden de pago</p>
                      </button>
                      
                      <button
                        onClick={() => handleSave(true, true)}
                        disabled={saving}
                        className="w-full p-4 border-2 border-green-300 bg-green-50 rounded-lg hover:border-green-400 text-left transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ClipboardList className="text-green-600" size={20} />
                          <div>
                            <p className="font-medium text-green-900">Confirmar y crear orden de pago</p>
                            <p className="text-sm text-green-600">Genera automáticamente la orden de pago para tesorería</p>
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer con navegación */}
          {step !== 'confirm' && (
            <div className="flex items-center justify-between p-6 border-t bg-gray-50">
              <Button
                variant="secondary"
                onClick={step === 'select-period' ? onClose : handlePrevStep}
                disabled={saving}
              >
                <ChevronLeft size={18} className="mr-1" />
                {step === 'select-period' ? 'Cancelar' : 'Anterior'}
              </Button>
              
              <Button
                onClick={handleNextStep}
                disabled={saving || (step === 'select-workers' && selectedWorkers.length === 0)}
              >
                {saving ? (
                  <>
                    <Loader2 size={18} className="mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    Siguiente
                    <ChevronRight size={18} className="ml-1" />
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Modal para añadir/editar trabajador */}
          {showWorkerForm && (
            <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="font-bold text-gray-900">
                    {editingWorkerId ? 'Editar Trabajador' : 'Nuevo Trabajador'}
                  </h3>
                  <button 
                    onClick={() => {
                      setShowWorkerForm(false);
                      setEditingWorkerId(null);
                      setWorkerForm({
                        displayName: '',
                        identifier: '',
                        iban: '',
                        bankAlias: '',
                        defaultAmount: 0,
                      });
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="p-4 space-y-4">
                  <Input
                    label="Nombre completo"
                    value={workerForm.displayName}
                    onChange={(e) => setWorkerForm(prev => ({ ...prev, displayName: e.target.value }))}
                    required
                  />
                  <Input
                    label="DNI/NIE (opcional)"
                    value={workerForm.identifier}
                    onChange={(e) => setWorkerForm(prev => ({ ...prev, identifier: e.target.value }))}
                  />
                  <IBANInput
                    label="IBAN"
                    value={workerForm.iban}
                    onChange={(value, isValid) => {
                      setWorkerForm(prev => ({ ...prev, iban: value }));
                      setIsIBANValid(isValid);
                    }}
                    required
                  />
                  <Input
                    label="Alias del banco (opcional)"
                    value={workerForm.bankAlias}
                    onChange={(e) => setWorkerForm(prev => ({ ...prev, bankAlias: e.target.value }))}
                  />
                  <CurrencyInput
                    label="Importe habitual (opcional)"
                    value={workerForm.defaultAmount}
                    onChange={(value) => setWorkerForm(prev => ({ ...prev, defaultAmount: value }))}
                  />
                </div>
                <div className="flex justify-end space-x-3 p-4 border-t">
                  <Button 
                    variant="secondary" 
                    onClick={() => {
                      setShowWorkerForm(false);
                      setEditingWorkerId(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={handleSaveWorker} disabled={saving}>
                    {saving ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
