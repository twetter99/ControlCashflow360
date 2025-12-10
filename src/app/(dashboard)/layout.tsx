'use client';

import React, { useState } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { CompanyFilterProvider } from '@/contexts/CompanyFilterContext';
import { ProtectedRoute } from '@/components/auth';
import { Sidebar, Header } from '@/components/layout';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AuthProvider>
      <ProtectedRoute>
        <CompanyFilterProvider>
          <div className="flex h-screen bg-gray-50">
            <Sidebar 
              isOpen={sidebarOpen} 
              onClose={() => setSidebarOpen(false)} 
            />
            {/* Spacer para desktop - mantiene el espacio del sidebar */}
            <div className="hidden lg:block w-64 flex-shrink-0" />
            <div className="flex-1 flex flex-col overflow-hidden">
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
