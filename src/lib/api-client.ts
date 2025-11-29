import { auth } from '@/lib/firebase/config';
import {
  Company,
  Account,
  Transaction,
  CreditLine,
  CreateCompanyInput,
  UpdateCompanyInput,
  CreateAccountInput,
  UpdateAccountInput,
  CreateTransactionInput,
  UpdateTransactionInput,
  CreateCreditLineInput,
  UpdateCreditLineInput,
} from '@/types';

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
};
