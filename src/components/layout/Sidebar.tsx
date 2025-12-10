'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Sunrise,
  Wallet,
  ArrowUpDown,
  CreditCard,
  Receipt,
  Landmark,
  Bell,
  Settings,
  Building2,
  Target,
  X,
  ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { href: '/morning-check', label: 'Rutina Diaria', icon: <Sunrise size={20} /> },
  { href: '/accounts', label: 'Cuentas', icon: <Wallet size={20} /> },
  { href: '/transactions', label: 'Movimientos', icon: <ArrowUpDown size={20} /> },
  { href: '/payment-orders', label: 'Órdenes de Pago', icon: <ClipboardList size={20} /> },
  { href: '/credit-lines', label: 'Pólizas', icon: <Receipt size={20} /> },
  { href: '/credit-cards', label: 'Tarjetas', icon: <CreditCard size={20} /> },
  { href: '/loans', label: 'Préstamos', icon: <Landmark size={20} /> },
  { href: '/budget', label: 'Presupuesto', icon: <Target size={20} /> },
  { href: '/alerts', label: 'Alertas', icon: <Bell size={20} /> },
  { href: '/companies', label: 'Empresas', icon: <Building2 size={20} /> },
  { href: '/settings', label: 'Configuración', icon: <Settings size={20} /> },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const pathname = usePathname();

  // En móvil, cerrar el sidebar al hacer clic en un enlace
  const handleLinkClick = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {/* Overlay oscuro para móvil */}
      {isOpen && onClose && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "w-64 bg-white border-r border-gray-200 h-screen flex flex-col",
          // Siempre fixed para que el margin-left funcione en el contenido
          "fixed inset-y-0 left-0 z-50",
          "transform transition-transform duration-300 ease-in-out",
          // En móvil: oculto por defecto, visible cuando isOpen
          // En desktop (lg): siempre visible
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
      {/* Logo y botón cerrar en móvil */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200">
        <Link href="/" className="flex items-center space-x-2" onClick={handleLinkClick}>
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">W</span>
          </div>
          <span className="text-xl font-bold text-gray-900">WINFIN</span>
        </Link>
        {/* Botón cerrar solo visible en móvil */}
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-2 -mr-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleLinkClick}
              className={cn(
                'flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <span className={cn(isActive ? 'text-primary-600' : 'text-gray-400')}>
                {item.icon}
              </span>
              <span className="ml-3">{item.label}</span>
            </Link>
          );
        })}
      </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <div className="text-xs text-gray-500 text-center">
            WINFIN Tesorería v1.0
          </div>
        </div>
      </aside>
    </>
  );
}
