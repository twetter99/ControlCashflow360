'use client';

import React, { useState, useEffect } from 'react';
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
  Users,
  ChevronLeft,
  ChevronRight,
  Pin,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Clave para localStorage
const SIDEBAR_COLLAPSED_KEY = 'winfin_sidebar_collapsed';

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
  { href: '/third-parties', label: 'Terceros', icon: <Users size={20} /> },
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
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function Sidebar({ isOpen = true, onClose, collapsed: controlledCollapsed, onCollapsedChange }: SidebarProps) {
  const pathname = usePathname();
  
  // Estado interno para colapsado (si no se controla externamente)
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  
  // Estado para hover temporal
  const [isHovering, setIsHovering] = useState(false);
  
  // Determinar si está expandido visualmente (por hover o porque no está colapsado)
  const isExpanded = !collapsed || isHovering;

  // Cargar preferencia de localStorage al montar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored !== null) {
        const value = stored === 'true';
        if (onCollapsedChange) {
          onCollapsedChange(value);
        } else {
          setInternalCollapsed(value);
        }
      }
    }
  }, [onCollapsedChange]);

  // Toggle colapsado
  const toggleCollapsed = () => {
    const newValue = !collapsed;
    if (onCollapsedChange) {
      onCollapsedChange(newValue);
    } else {
      setInternalCollapsed(newValue);
    }
    // Guardar en localStorage
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(newValue));
    // Si colapsamos, quitar el hover
    if (newValue) {
      setIsHovering(false);
    }
  };

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
        onMouseEnter={() => collapsed && setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        className={cn(
          "bg-white border-r border-gray-200 h-screen flex flex-col",
          "fixed inset-y-0 left-0 z-50",
          "transition-all duration-300 ease-in-out",
          // Ancho según estado
          isExpanded ? "w-64" : "w-16",
          // En móvil: oculto por defecto, visible cuando isOpen
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          // Sombra cuando está expandido por hover
          collapsed && isHovering && "shadow-xl"
        )}
      >
        {/* Logo y botón cerrar/colapsar */}
        <div className="h-16 flex items-center justify-between px-3 border-b border-gray-200">
          <Link 
            href="/" 
            className={cn(
              "flex items-center transition-all duration-300",
              isExpanded ? "space-x-2" : "justify-center w-full"
            )} 
            onClick={handleLinkClick}
          >
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-lg">W</span>
            </div>
            {isExpanded && (
              <span className="text-xl font-bold text-gray-900 whitespace-nowrap overflow-hidden">
                WINFIN
              </span>
            )}
          </Link>
          
          {/* Botón cerrar solo visible en móvil cuando está expandido */}
          {onClose && isExpanded && (
            <button
              onClick={onClose}
              className="lg:hidden p-2 -mr-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              aria-label="Cerrar menú"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleLinkClick}
                title={!isExpanded ? item.label : undefined}
                className={cn(
                  'flex items-center rounded-lg text-sm font-medium transition-all duration-200',
                  isExpanded ? 'px-3 py-2.5' : 'px-0 py-2.5 justify-center',
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  // Tooltip nativo cuando está colapsado
                  !isExpanded && 'relative group'
                )}
              >
                <span className={cn(
                  "flex-shrink-0",
                  isActive ? 'text-primary-600' : 'text-gray-400'
                )}>
                  {item.icon}
                </span>
                {isExpanded && (
                  <span className="ml-3 whitespace-nowrap overflow-hidden">
                    {item.label}
                  </span>
                )}
                {/* Tooltip personalizado cuando está colapsado */}
                {!isExpanded && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded 
                                  opacity-0 invisible group-hover:opacity-100 group-hover:visible 
                                  transition-all duration-200 whitespace-nowrap z-50 pointer-events-none">
                    {item.label}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer con botón de colapsar */}
        <div className="p-2 border-t border-gray-200">
          {/* Botón toggle colapsar - solo visible en desktop */}
          <button
            onClick={toggleCollapsed}
            className={cn(
              "hidden lg:flex w-full items-center rounded-lg py-2 text-sm font-medium",
              "text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors",
              isExpanded ? "px-3 justify-between" : "justify-center"
            )}
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {isExpanded && (
              <span className="text-xs text-gray-400">
                {collapsed && isHovering ? (
                  <span className="flex items-center gap-1">
                    <Pin size={12} /> Fijar
                  </span>
                ) : (
                  'Colapsar'
                )}
              </span>
            )}
            {collapsed ? (
              <ChevronRight size={18} />
            ) : (
              <ChevronLeft size={18} />
            )}
          </button>
          
          {/* Versión */}
          {isExpanded && (
            <div className="text-xs text-gray-400 text-center mt-2">
              WINFIN v1.0
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
