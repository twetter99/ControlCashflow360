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
            <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
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
