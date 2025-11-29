'use client';

import React from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { CompanyFilterProvider } from '@/contexts/CompanyFilterContext';
import { ProtectedRoute } from '@/components/auth';
import { Sidebar, Header } from '@/components/layout';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <CompanyFilterProvider>
          <div className="flex h-screen bg-gray-50">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <Header />
              <main className="flex-1 overflow-y-auto p-6">
                {children}
              </main>
            </div>
          </div>
        </CompanyFilterProvider>
      </ProtectedRoute>
    </AuthProvider>
  );
}
