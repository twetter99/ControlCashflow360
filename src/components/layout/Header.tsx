'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter } from '@/contexts/CompanyFilterContext';
import { Bell, ChevronDown, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui';

interface Company {
  id: string;
  name: string;
}

// Datos de ejemplo - en producción vendrían de Firestore
const mockCompanies: Company[] = [
  { id: 'winfin_sistemas', name: 'WINFIN Sistemas' },
  { id: 'winfin_instalaciones', name: 'WINFIN Instalaciones' },
  { id: 'winfin_servicios', name: 'WINFIN Servicios' },
];

export function Header() {
  const { user, userProfile, logout } = useAuth();
  const { selectedCompanyId, setSelectedCompanyId } = useCompanyFilter();
  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const [showCompanyMenu, setShowCompanyMenu] = React.useState(false);

  const selectedCompany = selectedCompanyId
    ? mockCompanies.find((c) => c.id === selectedCompanyId)
    : null;

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* Company Selector */}
      <div className="relative">
        <button
          onClick={() => setShowCompanyMenu(!showCompanyMenu)}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          <span className="text-sm font-medium text-gray-700">
            {selectedCompany ? selectedCompany.name : 'Todas las empresas'}
          </span>
          <ChevronDown size={16} className="text-gray-400" />
        </button>

        {showCompanyMenu && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
            <div className="py-1">
              <button
                onClick={() => {
                  setSelectedCompanyId(null);
                  setShowCompanyMenu(false);
                }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                  !selectedCompanyId ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                }`}
              >
                Todas las empresas
              </button>
              {mockCompanies.map((company) => (
                <button
                  key={company.id}
                  onClick={() => {
                    setSelectedCompanyId(company.id);
                    setShowCompanyMenu(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                    selectedCompanyId === company.id
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-700'
                  }`}
                >
                  {company.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Side */}
      <div className="flex items-center space-x-4">
        {/* Notifications */}
        <button className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors">
          <Bell size={20} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
              <User size={16} className="text-primary-600" />
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-gray-900">
                {userProfile?.displayName || user?.email || 'Usuario'}
              </p>
              <p className="text-xs text-gray-500">
                {userProfile?.role === 'ADMIN' ? 'Administrador' : 
                 userProfile?.role === 'TREASURY_MANAGER' ? 'Gestor Tesorería' :
                 userProfile?.role === 'COMPANY_MANAGER' ? 'Gestor Empresa' : 'Consulta'}
              </p>
            </div>
            <ChevronDown size={16} className="text-gray-400" />
          </button>

          {showUserMenu && (
            <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
              <div className="py-1">
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                >
                  <LogOut size={16} />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
