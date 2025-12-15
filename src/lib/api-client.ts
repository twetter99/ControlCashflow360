import { auth } from '@/lib/firebase/config';
import {
  Company,
  Account,
  Transaction,
  CreditLine,
  CreditCard,
  AccountHold,
  CreateCompanyInput,
  UpdateCompanyInput,
  CreateAccountInput,
  UpdateAccountInput,
  CreateTransactionInput,
  UpdateTransactionInput,
  CreateCreditLineInput,
  UpdateCreditLineInput,
  CreateAccountHoldInput,
  UpdateAccountHoldInput,
} from '@/types';
import {
  CreateCreditCardInput,
  UpdateCreditCardInput,
} from '@/lib/validations/schemas';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
};

/**
 * Obtiene el token de autenticación del usuario actual
 */
async function getAuthToken(): Promise<string> {
  if (!auth) {
    console.error('[API Client] ❌ Firebase Auth no inicializado');
    throw new Error('Firebase Auth no inicializado');
  }
  const user = auth.currentUser;
  if (!user) {
    console.warn('[API Client] Usuario no autenticado - redirigiendo a login');
    throw new Error('Usuario no autenticado');
  }
  return user.getIdToken();
}

/**
 * Realiza una petición a la API con autenticación
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();
  
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const result: ApiResponse<T> = await response.json();

  if (!result.success) {
    // Log detallado del error para debugging
    console.error('[API Client] ❌ Error en petición:', endpoint);
    console.error('[API Client] Status:', response.status);
    console.error('[API Client] Error:', result.error);
    console.error('[API Client] Code:', result.code);
    
    // Mensajes de ayuda para errores comunes
    if (response.status === 500 && result.error?.includes('Firebase')) {
      console.error('[API Client] 💡 Posible problema de configuración de Firebase en el servidor');
      console.error('[API Client] Verifica que FIREBASE_SERVICE_ACCOUNT_KEY esté configurada en Vercel');
    }
    if (result.code === 'UNAUTHORIZED' || result.code === 'INVALID_TOKEN') {
      console.error('[API Client] 💡 Problema de autenticación - intenta cerrar sesión y volver a entrar');
    }
    
    throw new Error(result.error || 'Error en la petición');
  }

  return result.data as T;
}

// ============================================
// COMPANIES API
// ============================================

export const companiesApi = {
  /**
   * Obtener todas las empresas del usuario
   */
  async getAll(includeInactive = false): Promise<Company[]> {
    const url = includeInactive
      ? '/api/companies?includeInactive=true'
      : '/api/companies';
    return apiRequest<Company[]>(url);
  },

  /**
   * Obtener empresa por ID
   */
  async getById(id: string): Promise<Company> {
    return apiRequest<Company>(`/api/companies/${id}`);
  },

  /**
   * Crear nueva empresa
   */
  async create(data: CreateCompanyInput): Promise<Company> {
    return apiRequest<Company>('/api/companies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Actualizar empresa
   */
  async update(id: string, data: UpdateCompanyInput): Promise<Company> {
    return apiRequest<Company>(`/api/companies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Eliminar empresa
   */
  async delete(id: string): Promise<{ deleted: boolean; id: string }> {
    return apiRequest<{ deleted: boolean; id: string }>(`/api/companies/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============================================
// ACCOUNTS API
// ============================================

export const accountsApi = {
  /**
   * Obtener todas las cuentas del usuario
   */
  async getAll(companyId?: string): Promise<Account[]> {
    const url = companyId 
      ? `/api/accounts?companyId=${companyId}`
      : '/api/accounts';
    return apiRequest<Account[]>(url);
  },

  /**
   * Obtener cuenta por ID
   */
  async getById(id: string): Promise<Account> {
    return apiRequest<Account>(`/api/accounts/${id}`);
  },

  /**
   * Crear nueva cuenta
   */
  async create(data: CreateAccountInput): Promise<Account> {
    return apiRequest<Account>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Actualizar cuenta
   */
  async update(id: string, data: UpdateAccountInput): Promise<Account> {
    return apiRequest<Account>(`/api/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Eliminar cuenta
   */
  async delete(id: string): Promise<{ deleted: boolean; id: string }> {
    return apiRequest<{ deleted: boolean; id: string }>(`/api/accounts/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Actualizar solo el saldo de la cuenta (para Rutina Diaria)
   */
  async updateBalance(id: string, data: { currentBalance: number }): Promise<Account> {
    return apiRequest<Account>(`/api/accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
};

// ============================================
// ACCOUNT HOLDS API (Retenciones)
// ============================================

export const accountHoldsApi = {
  /**
   * Obtener todas las retenciones del usuario
   */
  async getAll(accountId?: string, status?: string): Promise<AccountHold[]> {
    const params = new URLSearchParams();
    if (accountId) params.append('accountId', accountId);
    if (status) params.append('status', status);
    const queryString = params.toString();
    const url = queryString ? `/api/account-holds?${queryString}` : '/api/account-holds';
    return apiRequest<AccountHold[]>(url);
  },

  /**
   * Obtener retenciones activas de una cuenta
   */
  async getActiveByAccount(accountId: string): Promise<AccountHold[]> {
    return this.getAll(accountId, 'ACTIVE');
  },

  /**
   * Obtener retención por ID
   */
  async getById(id: string): Promise<AccountHold> {
    return apiRequest<AccountHold>(`/api/account-holds/${id}`);
  },

  /**
   * Crear nueva retención
   */
  async create(data: CreateAccountHoldInput): Promise<AccountHold> {
    return apiRequest<AccountHold>('/api/account-holds', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Actualizar retención
   */
  async update(id: string, data: UpdateAccountHoldInput): Promise<AccountHold> {
    return apiRequest<AccountHold>(`/api/account-holds/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Liberar retención (marcarla como liberada)
   */
  async release(id: string): Promise<{ released: boolean; id: string }> {
    return apiRequest<{ released: boolean; id: string }>(`/api/account-holds/${id}`, {
      method: 'PATCH',
    });
  },

  /**
   * Eliminar retención
   */
  async delete(id: string): Promise<{ deleted: boolean; id: string }> {
    return apiRequest<{ deleted: boolean; id: string }>(`/api/account-holds/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Calcular saldo disponible de una cuenta (saldo - retenciones activas)
   */
  async getAvailableBalance(accountId: string, currentBalance: number): Promise<{
    currentBalance: number;
    holdAmount: number;
    availableBalance: number;
    activeHoldsCount: number;
  }> {
    const activeHolds = await this.getActiveByAccount(accountId);
    const holdAmount = activeHolds.reduce((sum, hold) => sum + hold.amount, 0);
    return {
      currentBalance,
      holdAmount,
      availableBalance: currentBalance - holdAmount,
      activeHoldsCount: activeHolds.length,
    };
  },
};

// ============================================
// TRANSACTIONS API
// ============================================

interface TransactionFilters {
  accountId?: string;
  companyId?: string;
  type?: 'INCOME' | 'EXPENSE';
  status?: 'PENDING' | 'PAID' | 'CANCELLED';
  startDate?: string;
  endDate?: string;
}

export const transactionsApi = {
  /**
   * Obtener todas las transacciones del usuario
   */
  async getAll(filters?: TransactionFilters): Promise<Transaction[]> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
    }
    const queryString = params.toString();
    const url = queryString 
      ? `/api/transactions?${queryString}`
      : '/api/transactions';
    return apiRequest<Transaction[]>(url);
  },

  /**
   * Obtener transacción por ID
   */
  async getById(id: string): Promise<Transaction> {
    return apiRequest<Transaction>(`/api/transactions/${id}`);
  },

  /**
   * Crear nueva transacción
   */
  async create(data: CreateTransactionInput): Promise<Transaction> {
    return apiRequest<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Actualizar transacción
   */
  async update(id: string, data: UpdateTransactionInput): Promise<Transaction> {
    return apiRequest<Transaction>(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Eliminar transacción
   */
  async delete(id: string): Promise<{ deleted: boolean; id: string }> {
    return apiRequest<{ deleted: boolean; id: string }>(`/api/transactions/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Marcar transacción como pagada
   */
  async markAsPaid(id: string, paidDate?: Date, accountId?: string): Promise<Transaction> {
    return apiRequest<Transaction>(`/api/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ 
        action: 'markAsPaid', 
        paidDate: paidDate?.toISOString(),
        accountId 
      }),
    });
  },

  /**
   * Cancelar transacción
   */
  async cancel(id: string): Promise<Transaction> {
    return apiRequest<Transaction>(`/api/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'cancel' }),
    });
  },

  /**
   * Reactivar transacción (volver a PENDING)
   */
  async reactivate(id: string): Promise<Transaction> {
    return apiRequest<Transaction>(`/api/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'reactivate' }),
    });
  },

  /**
   * Confirmar cargo de domiciliación bancaria
   * Marca como pagada y descuenta del saldo de la cuenta especificada
   */
  async confirmDirectDebit(
    id: string, 
    accountId: string, 
    paidDate?: Date, 
    notes?: string
  ): Promise<Transaction> {
    return apiRequest<Transaction>(`/api/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ 
        action: 'confirmDirectDebit',
        accountId,
        paidDate: paidDate?.toISOString(),
        notes
      }),
    });
  },

  /**
   * Actualizar importe en cascada para transacciones similares
   * Útil para transacciones recurrentes que no tienen recurrenceId
   */
  async cascadeUpdate(data: {
    sourceTransactionId: string;
    newAmount: number;
    effectiveFromDate: Date;
    changeReason?: string;
  }): Promise<{ success: boolean; updatedCount: number; updatedIds: string[] }> {
    return apiRequest('/api/transactions/cascade-update', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        effectiveFromDate: data.effectiveFromDate.toISOString(),
      }),
    });
  },

  /**
   * Limpiar transacciones duplicadas
   */
  async cleanupDuplicates(): Promise<{
    message: string;
    transactionsDeleted: number;
    recurrencesDeleted: number;
    totalTransactionsAnalyzed: number;
    totalRecurrencesAnalyzed: number;
  }> {
    return apiRequest('/api/transactions/cleanup-duplicates', {
      method: 'POST',
    });
  },

  /**
   * Actualizar en lote todas las transacciones de una recurrencia
   */
  async bulkUpdateRecurrence(data: {
    recurrenceId: string;
    fields: {
      paymentMethod?: 'TRANSFER' | 'DIRECT_DEBIT';
      chargeAccountId?: string;
      supplierBankAccount?: string;
      supplierInvoiceNumber?: string;
    };
  }): Promise<{
    message: string;
    updated: number;
    recurrenceId: string;
    fieldsUpdated: string[];
  }> {
    return apiRequest('/api/migrations/bulk-update-recurrence', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ============================================
// CREDIT LINES API
// ============================================

interface CreditLineFilters {
  companyId?: string;
  accountId?: string;
}

export const creditLinesApi = {
  /**
   * Obtener todas las líneas de crédito del usuario
   */
  async getAll(filters?: CreditLineFilters): Promise<CreditLine[]> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
    }
    const queryString = params.toString();
    const url = queryString 
      ? `/api/credit-lines?${queryString}`
      : '/api/credit-lines';
    return apiRequest<CreditLine[]>(url);
  },

  /**
   * Obtener línea de crédito por ID
   */
  async getById(id: string): Promise<CreditLine> {
    return apiRequest<CreditLine>(`/api/credit-lines/${id}`);
  },

  /**
   * Crear nueva línea de crédito
   */
  async create(data: CreateCreditLineInput): Promise<CreditLine> {
    return apiRequest<CreditLine>('/api/credit-lines', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Actualizar línea de crédito
   */
  async update(id: string, data: UpdateCreditLineInput): Promise<CreditLine> {
    return apiRequest<CreditLine>(`/api/credit-lines/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Eliminar línea de crédito
   */
  async delete(id: string): Promise<{ deleted: boolean; id: string }> {
    return apiRequest<{ deleted: boolean; id: string }>(`/api/credit-lines/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Actualizar solo el saldo dispuesto (para Rutina Diaria)
   */
  async updateBalance(id: string, data: { currentDrawn: number }): Promise<CreditLine> {
    return apiRequest<CreditLine>(`/api/credit-lines/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
};

// ============================================
// CREDIT CARDS API (Tarjetas de Crédito)
// ============================================

interface CreditCardFilters {
  companyId?: string;
  includeInactive?: string;
}

export const creditCardsApi = {
  /**
   * Obtener todas las tarjetas de crédito del usuario
   */
  async getAll(filters?: CreditCardFilters): Promise<CreditCard[]> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
    }
    const queryString = params.toString();
    const url = queryString 
      ? `/api/credit-cards?${queryString}`
      : '/api/credit-cards';
    return apiRequest<CreditCard[]>(url);
  },

  /**
   * Obtener tarjeta de crédito por ID
   */
  async getById(id: string): Promise<CreditCard> {
    return apiRequest<CreditCard>(`/api/credit-cards/${id}`);
  },

  /**
   * Crear nueva tarjeta de crédito
   */
  async create(data: CreateCreditCardInput): Promise<CreditCard> {
    return apiRequest<CreditCard>('/api/credit-cards', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Actualizar tarjeta de crédito
   */
  async update(id: string, data: UpdateCreditCardInput): Promise<CreditCard> {
    return apiRequest<CreditCard>(`/api/credit-cards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Actualizar solo el saldo de la tarjeta (para Rutina Diaria)
   */
  async updateBalance(id: string, data: { currentBalance: number }): Promise<CreditCard> {
    return apiRequest<CreditCard>(`/api/credit-cards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /**
   * Eliminar tarjeta de crédito
   */
  async delete(id: string): Promise<{ deleted: boolean; id: string }> {
    return apiRequest<{ deleted: boolean; id: string }>(`/api/credit-cards/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============================================
// LOANS API (Préstamos)
// ============================================

import { Loan, CreateLoanInput, UpdateLoanInput } from '@/types';

interface LoanFilters {
  companyId?: string;
  status?: 'ACTIVE' | 'PAID_OFF' | 'DEFAULTED';
}

interface CreateLoanResponse {
  loan: Loan;
  transactionsCreated: number;
}

export const loansApi = {
  /**
   * Obtener todos los préstamos del usuario
   */
  async getAll(filters?: LoanFilters): Promise<Loan[]> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
    }
    const queryString = params.toString();
    const url = queryString 
      ? `/api/loans?${queryString}`
      : '/api/loans';
    return apiRequest<Loan[]>(url);
  },

  /**
   * Obtener préstamo por ID
   */
  async getById(id: string): Promise<Loan & { installmentsCount?: number }> {
    return apiRequest<Loan & { installmentsCount?: number }>(`/api/loans/${id}`);
  },

  /**
   * Crear nuevo préstamo (genera automáticamente las cuotas)
   */
  async create(data: CreateLoanInput): Promise<CreateLoanResponse> {
    return apiRequest<CreateLoanResponse>('/api/loans', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Actualizar préstamo
   */
  async update(id: string, data: UpdateLoanInput): Promise<Loan> {
    return apiRequest<Loan>(`/api/loans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Eliminar préstamo y sus cuotas pendientes
   */
  async delete(id: string): Promise<{ success: boolean; message: string; transactionsDeleted: number }> {
    return apiRequest<{ success: boolean; message: string; transactionsDeleted: number }>(`/api/loans/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Regenerar las cuotas pendientes de un préstamo
   */
  async regenerateInstallments(id: string): Promise<Loan> {
    return apiRequest<Loan>(`/api/loans/${id}`, {
      method: 'PATCH',
    });
  },
};

// ============================================
// RECURRENCES API (Transacciones Recurrentes)
// ============================================

import { 
  Recurrence,
  OccurrenceGenerationResult,
} from '@/types';
import {
  CreateRecurrenceInput,
  UpdateRecurrenceInput,
} from '@/lib/validations/schemas';

interface RecurrenceFilters {
  companyId?: string;
  status?: 'ACTIVE' | 'PAUSED' | 'ENDED';
  type?: 'INCOME' | 'EXPENSE';
}

interface RecurrenceCreateResponse {
  recurrence: Recurrence;
  generatedTransactions: number;
  transactionIds: string[];
}

interface RecurrenceUpdateResponse {
  recurrence: Recurrence;
  regenerated: boolean;
  deletedTransactions: number;
  generatedTransactions: number;
}

interface RecurrenceDeleteResponse {
  deleted: boolean;
  deletedTransactionsCount: number;
}

interface RegenerateSummary {
  recurrencesProcessed: number;
  totalGenerated: number;
  totalSkipped: number;
  details: Array<{
    recurrenceId: string;
    generated: number;
    skipped: number;
  }>;
}

export const recurrencesApi = {
  /**
   * Obtener todas las recurrencias del usuario
   */
  async getAll(filters?: RecurrenceFilters): Promise<Recurrence[]> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
    }
    const queryString = params.toString();
    const url = queryString 
      ? `/api/recurrences?${queryString}`
      : '/api/recurrences';
    return apiRequest<Recurrence[]>(url);
  },

  /**
   * Obtener recurrencia por ID
   */
  async getById(id: string): Promise<Recurrence> {
    return apiRequest<Recurrence>(`/api/recurrences/${id}`);
  },

  /**
   * Crear nueva recurrencia (genera transacciones automáticamente)
   */
  async create(data: CreateRecurrenceInput): Promise<RecurrenceCreateResponse> {
    return apiRequest<RecurrenceCreateResponse>('/api/recurrences', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Actualizar recurrencia (puede regenerar transacciones)
   */
  async update(id: string, data: UpdateRecurrenceInput): Promise<RecurrenceUpdateResponse> {
    return apiRequest<RecurrenceUpdateResponse>(`/api/recurrences/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Eliminar recurrencia
   * @param deleteTransactions - Si true, elimina transacciones asociadas. Si false, las desvincula.
   * @param deletePendingOnly - Si true (default), solo elimina transacciones pendientes.
   */
  async delete(
    id: string, 
    deleteTransactions = false,
    deletePendingOnly = true
  ): Promise<RecurrenceDeleteResponse> {
    const params = new URLSearchParams();
    params.append('deleteTransactions', String(deleteTransactions));
    params.append('deletePendingOnly', String(deletePendingOnly));
    
    return apiRequest<RecurrenceDeleteResponse>(
      `/api/recurrences/${id}?${params.toString()}`, 
      { method: 'DELETE' }
    );
  },

  /**
   * Regenerar transacciones para todas las recurrencias activas
   * Útil para llamar al cargar el dashboard
   */
  async regenerate(companyId?: string, monthsAhead?: number): Promise<RegenerateSummary> {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId);
    if (monthsAhead) params.append('monthsAhead', String(monthsAhead));
    
    const queryString = params.toString();
    const url = queryString 
      ? `/api/recurrences/regenerate?${queryString}`
      : '/api/recurrences/regenerate';
    
    return apiRequest<RegenerateSummary>(url, { method: 'POST' });
  },

  /**
   * Pausar una recurrencia (deja de generar nuevas transacciones)
   */
  async pause(id: string): Promise<RecurrenceUpdateResponse> {
    return this.update(id, { status: 'PAUSED' });
  },

  /**
   * Reactivar una recurrencia pausada
   */
  async resume(id: string): Promise<RecurrenceUpdateResponse> {
    return this.update(id, { status: 'ACTIVE' });
  },

  /**
   * Finalizar una recurrencia (status = ENDED)
   */
  async end(id: string): Promise<RecurrenceUpdateResponse> {
    return this.update(id, { status: 'ENDED' });
  },
};

// ============================================
// THIRD PARTIES API (Terceros)
// ============================================

import { 
  ThirdParty, 
  CreateThirdPartyInput, 
  UpdateThirdPartyInput,
  ThirdPartySearchResult,
  ThirdPartyType 
} from '@/types';

interface ThirdPartyFilters {
  search?: string;
  type?: ThirdPartyType;
  includeInactive?: boolean;
}

export const thirdPartiesApi = {
  /**
   * Obtener todos los terceros del usuario
   */
  async getAll(filters?: ThirdPartyFilters): Promise<ThirdParty[]> {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.type) params.append('type', filters.type);
    if (filters?.includeInactive) params.append('includeInactive', 'true');
    
    const queryString = params.toString();
    const url = queryString ? `/api/third-parties?${queryString}` : '/api/third-parties';
    return apiRequest<ThirdParty[]>(url);
  },

  /**
   * Buscar terceros por texto (para autocompletado)
   */
  async search(searchText: string): Promise<ThirdParty[]> {
    if (!searchText || searchText.trim().length < 2) return [];
    return this.getAll({ search: searchText.trim() });
  },

  /**
   * Verificar duplicados potenciales
   */
  async checkDuplicates(name: string): Promise<ThirdPartySearchResult[]> {
    if (!name || name.trim().length < 2) return [];
    const result = await apiRequest<{ duplicates: ThirdPartySearchResult[] }>(
      `/api/third-parties?checkDuplicates=${encodeURIComponent(name.trim())}`
    );
    return result.duplicates;
  },

  /**
   * Obtener tercero por ID
   */
  async getById(id: string): Promise<ThirdParty> {
    return apiRequest<ThirdParty>(`/api/third-parties/${id}`);
  },

  /**
   * Crear nuevo tercero
   */
  async create(data: CreateThirdPartyInput): Promise<ThirdParty> {
    return apiRequest<ThirdParty>('/api/third-parties', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Actualizar tercero
   */
  async update(id: string, data: UpdateThirdPartyInput): Promise<ThirdParty> {
    return apiRequest<ThirdParty>(`/api/third-parties/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Eliminar tercero (soft delete)
   */
  async delete(id: string): Promise<{ deleted: boolean; id: string }> {
    return apiRequest<{ deleted: boolean; id: string }>(`/api/third-parties/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Actualizar fecha de último uso (llamar al usar en una transacción)
   */
  async markAsUsed(id: string): Promise<ThirdParty> {
    return apiRequest<ThirdParty>(`/api/third-parties/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ lastUsedAt: new Date() }),
    });
  },
};

// ============================================
// RECURRENCE VERSIONS API
// ============================================

import { RecurrenceVersion, CreateRecurrenceVersionInput } from '@/types';

export const recurrenceVersionsApi = {
  /**
   * Obtener todas las versiones de una recurrencia
   */
  async getByRecurrence(recurrenceId: string): Promise<RecurrenceVersion[]> {
    return apiRequest<RecurrenceVersion[]>(`/api/recurrence-versions?recurrenceId=${recurrenceId}`);
  },

  /**
   * Obtener versión por ID
   */
  async getById(id: string): Promise<RecurrenceVersion> {
    return apiRequest<RecurrenceVersion>(`/api/recurrence-versions/${id}`);
  },

  /**
   * Crear nueva versión (y opcionalmente actualizar transacciones futuras)
   */
  async create(data: CreateRecurrenceVersionInput & { updateFutureTransactions?: boolean }): Promise<RecurrenceVersion> {
    return apiRequest<RecurrenceVersion>('/api/recurrence-versions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Eliminar la versión más reciente (revierte a la anterior)
   */
  async delete(id: string): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/api/recurrence-versions/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============================================
// Payment Orders API (Órdenes de Pago)
// ============================================

import { PaymentOrder, PaymentOrderStatus, PaymentOrderItem } from '@/types';

export interface CreatePaymentOrderInput {
  title: string;
  description?: string;
  defaultChargeAccountId?: string;
  items: Omit<PaymentOrderItem, 'transactionId'>[];
  transactionIds: string[];
  notesForFinance?: string;
}

export const paymentOrdersApi = {
  /**
   * Obtener todas las órdenes de pago
   */
  async getAll(status?: PaymentOrderStatus): Promise<PaymentOrder[]> {
    const params = status ? `?status=${status}` : '';
    return apiRequest<PaymentOrder[]>(`/api/payment-orders${params}`);
  },

  /**
   * Obtener una orden por ID
   */
  async getById(id: string): Promise<PaymentOrder> {
    return apiRequest<PaymentOrder>(`/api/payment-orders/${id}`);
  },

  /**
   * Crear nueva orden de pago
   */
  async create(data: CreatePaymentOrderInput): Promise<PaymentOrder> {
    return apiRequest<PaymentOrder>('/api/payment-orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Actualizar una orden (datos o estado)
   */
  async update(id: string, data: Partial<PaymentOrder>): Promise<PaymentOrder> {
    return apiRequest<PaymentOrder>(`/api/payment-orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Actualizar estado de una orden
   */
  async updateStatus(id: string, status: PaymentOrderStatus, executedByName?: string): Promise<PaymentOrder> {
    return apiRequest<PaymentOrder>(`/api/payment-orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, executedByName }),
    });
  },

  /**
   * Marcar una orden como ejecutada
   */
  async execute(id: string, executedByName?: string): Promise<PaymentOrder> {
    return apiRequest<PaymentOrder>(`/api/payment-orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'EXECUTED', executedByName }),
    });
  },

  /**
   * Eliminar una orden (solo si está en borrador)
   */
  async delete(id: string): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/api/payment-orders/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============================================
// ALERTS API
// ============================================

import { AlertConfig, AlertType, CreateAlertConfigInput, UpdateAlertConfigInput } from '@/types';

export const alertsApi = {
  /**
   * Obtener todas las configuraciones de alertas
   */
  async getAll(): Promise<AlertConfig[]> {
    return apiRequest<AlertConfig[]>('/api/alerts');
  },

  /**
   * Obtener una configuración por ID
   */
  async getById(id: string): Promise<AlertConfig> {
    return apiRequest<AlertConfig>(`/api/alerts/${id}`);
  },

  /**
   * Crear nueva configuración de alerta
   */
  async create(data: CreateAlertConfigInput): Promise<AlertConfig> {
    return apiRequest<AlertConfig>('/api/alerts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Actualizar configuración de alerta
   */
  async update(id: string, data: UpdateAlertConfigInput): Promise<AlertConfig> {
    return apiRequest<AlertConfig>(`/api/alerts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Toggle enabled/disabled
   */
  async toggle(id: string): Promise<AlertConfig> {
    return apiRequest<AlertConfig>(`/api/alerts/${id}`, {
      method: 'PATCH',
    });
  },

  /**
   * Eliminar configuración
   */
  async delete(id: string): Promise<{ deleted: boolean; id: string }> {
    return apiRequest<{ deleted: boolean; id: string }>(`/api/alerts/${id}`, {
      method: 'DELETE',
    });
  },
};
