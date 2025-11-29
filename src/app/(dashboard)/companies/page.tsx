'use client';

import React, { useState, useEffect } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { companiesApi, accountsApi, creditLinesApi } from '@/lib/api-client';
import { Company } from '@/types';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Building2,
  Plus,
  Edit,
  Trash2,
  Users,
  Wallet,
  TrendingUp,
  CheckCircle,
  XCircle,
  X
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface CompanyWithStats extends Company {
  accountsCount: number;
  totalBalance: number;
  creditLinesCount: number;
}

interface CompanyFormData {
  name: string;
  cif: string;
  color: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export default function CompaniesPage() {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyWithStats | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [companies, setCompanies] = useState<CompanyWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<CompanyFormData>({
    name: '',
    cif: '',
    color: '#3B82F6',
    status: 'ACTIVE',
  });

  // Cargar datos via API
  useEffect(() => {
    if (!user) return;
    
    const loadData = async () => {
      try {
        setLoading(true);
        const [companiesData, accountsData, creditLinesData] = await Promise.all([
          companiesApi.getAll(true), // incluir inactivas
          accountsApi.getAll(),
          creditLinesApi.getAll()
        ]);
        
        // Calcular estadísticas para cada empresa
        const companiesWithStats: CompanyWithStats[] = companiesData.map(company => {
          const companyAccounts = accountsData.filter(a => a.companyId === company.id);
          const companyLines = creditLinesData.filter(cl => cl.companyId === company.id);
          
          return {
            ...company,
            accountsCount: companyAccounts.length,
            totalBalance: companyAccounts.reduce((sum, a) => sum + a.currentBalance, 0),
            creditLinesCount: companyLines.length,
          };
        });
        
        setCompanies(companiesWithStats);
      } catch (error: unknown) {
        console.error('Error cargando datos:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        if (!errorMessage.includes('index') && !errorMessage.includes('permission')) {
          toast.error('Error al cargar las empresas');
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [user]);

  const handleEdit = (company: CompanyWithStats) => {
    setFormData({
      name: company.name,
      cif: company.cif || '',
      color: company.color,
      status: company.status,
    });
    setEditingCompany(company);
    setShowForm(true);
  };

  const handleDelete = async (companyId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta empresa?')) return;
    
    try {
      await companiesApi.delete(companyId);
      setCompanies(prev => prev.filter(c => c.id !== companyId));
      toast.success('Empresa eliminada correctamente');
    } catch (error) {
      console.error('Error eliminando empresa:', error);
      toast.error('Error al eliminar la empresa');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      if (editingCompany) {
        await companiesApi.update(editingCompany.id, {
          name: formData.name,
          cif: formData.cif,
          color: formData.color,
          status: formData.status,
        });
        setCompanies(prev => prev.map(c => 
          c.id === editingCompany.id 
            ? { ...c, name: formData.name, cif: formData.cif, color: formData.color, status: formData.status }
            : c
        ));
        toast.success('Empresa actualizada correctamente');
      } else {
        const newCompany = await companiesApi.create({
          name: formData.name,
          cif: formData.cif,
          color: formData.color,
          status: formData.status,
        });
        setCompanies(prev => [...prev, { ...newCompany, accountsCount: 0, totalBalance: 0, creditLinesCount: 0 }]);
        toast.success('Empresa creada correctamente');
      }
      
      setShowForm(false);
      setEditingCompany(null);
      setFormData({ name: '', cif: '', color: '#3B82F6', status: 'ACTIVE' });
    } catch (error) {
      console.error('Error guardando empresa:', error);
      toast.error('Error al guardar la empresa');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Empresas</h1>
          <p className="text-gray-500 mt-1">
            Gestiona las empresas del grupo
          </p>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline" onClick={() => setShowUserModal(true)}>
            <Users size={18} className="mr-2" />
            Usuarios
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus size={18} className="mr-2" />
            Nueva Empresa
          </Button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center p-4">
          <Building2 className="mx-auto mb-2 text-primary-600" size={32} />
          <p className="text-2xl font-bold text-gray-900">{companies.length}</p>
          <p className="text-sm text-gray-500">Empresas</p>
        </Card>
        <Card className="text-center p-4">
          <Wallet className="mx-auto mb-2 text-green-600" size={32} />
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(companies.reduce((sum: number, c: CompanyWithStats) => sum + c.totalBalance, 0))}
          </p>
          <p className="text-sm text-gray-500">Saldo total</p>
        </Card>
        <Card className="text-center p-4">
          <TrendingUp className="mx-auto mb-2 text-blue-600" size={32} />
          <p className="text-2xl font-bold text-gray-900">
            {companies.reduce((sum: number, c: CompanyWithStats) => sum + c.accountsCount, 0)}
          </p>
          <p className="text-sm text-gray-500">Cuentas</p>
        </Card>
      </div>

      {/* Lista de empresas */}
      <Card title="Todas las Empresas">
        <div className="space-y-4">
          {companies.map((company) => (
            <div
              key={company.id}
              className={`border-l-4 border rounded-lg p-5 transition-colors ${
                company.status === 'ACTIVE' 
                  ? 'border-gray-200 hover:border-primary-300' 
                  : 'border-gray-100 bg-gray-50 opacity-75'
              }`}
              style={{ borderLeftColor: company.status === 'ACTIVE' ? company.color : '#9ca3af' }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div 
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: company.color + '30' }}
                  >
                    <Building2 
                      style={{ color: company.color }} 
                      size={24} 
                    />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span 
                        className="text-xs font-mono px-2 py-0.5 rounded font-semibold"
                        style={{ backgroundColor: company.color + '20', color: company.color }}
                      >
                        {company.code}
                      </span>
                      <h3 className="text-lg font-semibold text-gray-900">{company.name}</h3>
                      {company.status === 'ACTIVE' ? (
                        <span className="flex items-center text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                          <CheckCircle size={12} className="mr-1" /> Activa
                        </span>
                      ) : (
                        <span className="flex items-center text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                          <XCircle size={12} className="mr-1" /> Inactiva
                        </span>
                      )}
                    </div>
                    {company.cif && (
                      <p className="text-sm text-gray-500 mt-1">CIF: {company.cif}</p>
                    )}
                    <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
                      <span className="flex items-center">
                        <Wallet size={14} className="mr-1" />
                        {formatCurrency(company.totalBalance)}
                      </span>
                      <span>{company.accountsCount} cuentas</span>
                      <span>{company.creditLinesCount} pólizas</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleEdit(company)}
                    className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(company.id)}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Modal de formulario empresa */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">
                {editingCompany ? 'Editar Empresa' : 'Nueva Empresa'}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingCompany(null);
                  setFormData({ name: '', cif: '', color: '#3B82F6', status: 'ACTIVE' });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Código de empresa - solo lectura */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Código de Empresa
                </label>
                <input
                  type="text"
                  value={editingCompany?.code || '(Se generará automáticamente: EM01, EM02...)'}
                  readOnly
                  disabled
                  className="w-full border rounded-lg px-4 py-3 bg-gray-100 text-gray-600 font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">
                  El código se asigna automáticamente al crear la empresa
                </p>
              </div>
              <Input
                label="Nombre de la empresa"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <Input
                label="CIF"
                value={formData.cif}
                onChange={(e) => setFormData({ ...formData, cif: e.target.value })}
                placeholder="Ej: B12345678"
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-full h-10 border rounded-lg cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select 
                  className="w-full border rounded-lg px-4 py-3"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}
                >
                  <option value="ACTIVE">Activa</option>
                  <option value="INACTIVE">Inactiva</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingCompany(null);
                    setFormData({ name: '', cif: '', color: '#3B82F6', status: 'ACTIVE' });
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingCompany ? 'Guardar Cambios' : 'Crear Empresa'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      <Toaster position="top-right" />
    </div>
  );
}
