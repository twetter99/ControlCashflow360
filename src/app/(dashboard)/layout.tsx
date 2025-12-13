'use client';

import React, { useState, useEffect } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { CompanyFilterProvider } from '@/contexts/CompanyFilterContext';
import { ProtectedRoute } from '@/components/auth';
import { Sidebar, Header } from '@/components/layout';

// Clave para localStorage (debe coincidir con Sidebar)
const SIDEBAR_COLLAPSED_KEY = 'winfin_sidebar_collapsed';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Cargar estado inicial de localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored !== null) {
        setSidebarCollapsed(stored === 'true');
      }
    }
  }, []);

  return (
    <AuthProvider>
      <ProtectedRoute>
        <CompanyFilterProvider>
          <div className="flex h-screen bg-gray-50">
            <Sidebar 
              isOpen={sidebarOpen} 
              onClose={() => setSidebarOpen(false)}
              collapsed={sidebarCollapsed}
              onCollapsedChange={setSidebarCollapsed}
            />
            <div 
              className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
                sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
              }`}
            >
              <Header onMenuClick={() => setSidebarOpen(true)} />
              <main className="flex-1 overflow-y-auto p-4 lg:p-6">
                {children}
              </main>
            </div>
          </div>
        </CompanyFilterProvider>
      </ProtectedRoute>
    </AuthProvider>
  );
}
