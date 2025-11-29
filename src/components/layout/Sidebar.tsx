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
  Bell,
  Settings,
  Building2,
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
  { href: '/credit-lines', label: 'Pólizas', icon: <CreditCard size={20} /> },
  { href: '/alerts', label: 'Alertas', icon: <Bell size={20} /> },
  { href: '/companies', label: 'Empresas', icon: <Building2 size={20} /> },
  { href: '/settings', label: 'Configuración', icon: <Settings size={20} /> },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 h-screen flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-gray-200">
        <Link href="/" className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">W</span>
          </div>
          <span className="text-xl font-bold text-gray-900">WINFIN</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
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
  );
}
