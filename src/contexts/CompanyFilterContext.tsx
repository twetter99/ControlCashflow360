'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface CompanyFilterContextType {
  selectedCompanyId: string | null; // null = todas las empresas
  setSelectedCompanyId: (companyId: string | null) => void;
}

const CompanyFilterContext = createContext<CompanyFilterContextType | undefined>(undefined);

export function CompanyFilterProvider({ children }: { children: ReactNode }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  return (
    <CompanyFilterContext.Provider value={{ selectedCompanyId, setSelectedCompanyId }}>
      {children}
    </CompanyFilterContext.Provider>
  );
}

export function useCompanyFilter() {
  const context = useContext(CompanyFilterContext);
  
  if (context === undefined) {
    throw new Error('useCompanyFilter must be used within a CompanyFilterProvider');
  }
  
  return context;
}
