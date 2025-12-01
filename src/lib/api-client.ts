import { auth } from '@/lib/firebase/config';
import {
  Company,
  Account,
  Transaction,
  CreditLine,
  CreditCard,
  CreateCompanyInput,
  UpdateCompanyInput,
  CreateAccountInput,
  UpdateAccountInput,
  CreateTransactionInput,
  UpdateTransactionInput,
  CreateCreditLineInput,
  UpdateCreditLineInput,
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
    throw new Error('Firebase Auth no inicializado');
  }
  const user = auth.currentUser;
  if (!user) {
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
