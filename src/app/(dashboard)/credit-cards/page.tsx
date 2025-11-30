'use client';

import React, { useState, useEffect } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { useCompanyFilter } from '@/contexts/CompanyFilterContext';
import { useAuth } from '@/contexts/AuthContext';
import { creditCardsApi, companiesApi } from '@/lib/api-client';
import { CreditCard, Company } from '@/types';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  CreditCard as CreditCardIcon,
  Building2,
  AlertCircle,
  X,
  Calendar
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface CreditCardFormData {
  bankName: string;
  cardAlias: string;
  cardNumberLast4: string;
  cardHolder: string;
  companyId: string;
  creditLimit: string;
  currentBalance: string;
  cutoffDay: string;
  paymentDueDay: string;
}

interface CompanyOption {
  id: string;
  name: string;
}

export default function CreditCardsPage() {
  const { selectedCompanyId } = useCompanyFilter();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<CreditCardFormData>({
    bankName: '',
    cardAlias: '',
    cardNumberLast4: '',
    cardHolder: '',
    companyId: '',
    creditLimit: '0',
    currentBalance: '0',
    cutoffDay: '15',
    paymentDueDay: '5',
  });

  // Cargar datos via API
  useEffect(() => {
    if (!user) return;
    
    const loadData = async () => {
      try {
        setLoading(true);
        const [cardsData, companiesData] = await Promise.all([
          creditCardsApi.getAll({ includeInactive: 'true' }),
          companiesApi.getAll()
        ]);
        
        setCreditCards(cardsData);
        setCompanies(companiesData.map(c => ({ id: c.id, name: c.name })));
      } catch (error) {
        console.error('Error cargando datos:', error);
        toast.error('Error al cargar las tarjetas de crédito');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [user]);

  // Filtrar por empresa seleccionada
  const filteredCards = !selectedCompanyId
    ? creditCards
    : creditCards.filter(card => card.companyId === selectedCompanyId);

  // Estadísticas
  const totalCreditLimit = filteredCards
    .filter(c => c.status === 'ACTIVE')
    .reduce((sum, c) => sum + c.creditLimit, 0);
  
  const totalUsed = filteredCards
    .filter(c => c.status === 'ACTIVE')
    .reduce((sum, c) => sum + c.currentBalance, 0);
  
  const totalAvailable = totalCreditLimit - totalUsed;

  const getCompanyName = (companyId: string) => {
    const company = companies.find(c => c.id === companyId);
    return company?.name || 'Sin asignar';
  };

  const handleEdit = (card: CreditCard) => {
    setFormData({
      bankName: card.bankName,
      cardAlias: card.cardAlias,
      cardNumberLast4: card.cardNumberLast4,
      cardHolder: card.cardHolder,
      companyId: card.companyId,
      creditLimit: card.creditLimit.toString(),
      currentBalance: card.currentBalance.toString(),
      cutoffDay: card.cutoffDay.toString(),
      paymentDueDay: card.paymentDueDay.toString(),
    });
    setEditingCard(card.id);
    setShowForm(true);
  };

  const handleDelete = async (cardId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta tarjeta?')) return;
    
    try {
      await creditCardsApi.delete(cardId);
      setCreditCards(prev => prev.filter(c => c.id !== cardId));
      toast.success('Tarjeta eliminada correctamente');
    } catch (error) {
      console.error('Error eliminando tarjeta:', error);
      toast.error('Error al eliminar la tarjeta');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Validar últimos 4 dígitos
    if (!/^\d{4}$/.test(formData.cardNumberLast4)) {
      toast.error('Ingresa exactamente los últimos 4 dígitos de la tarjeta');
      return;
    }
    
    try {
      const cardData = {
        bankName: formData.bankName,
        cardAlias: formData.cardAlias,
        cardNumberLast4: formData.cardNumberLast4,
        cardHolder: formData.cardHolder,
        companyId: formData.companyId,
        creditLimit: parseFloat(formData.creditLimit) || 0,
        currentBalance: parseFloat(formData.currentBalance) || 0,
        cutoffDay: parseInt(formData.cutoffDay) || 15,
        paymentDueDay: parseInt(formData.paymentDueDay) || 5,
        status: 'ACTIVE' as const,
      };

      if (editingCard) {
        const updated = await creditCardsApi.update(editingCard, cardData);
        setCreditCards(prev => prev.map(c => c.id === editingCard ? updated : c));
        toast.success('Tarjeta actualizada correctamente');
      } else {
        const newCard = await creditCardsApi.create(cardData);
        setCreditCards(prev => [...prev, newCard]);
        toast.success('Tarjeta creada correctamente');
      }
      
      resetForm();
    } catch (error) {
      console.error('Error guardando tarjeta:', error);
      toast.error('Error al guardar la tarjeta');
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingCard(null);
    setFormData({
      bankName: '',
      cardAlias: '',
      cardNumberLast4: '',
      cardHolder: '',
      companyId: '',
      creditLimit: '0',
      currentBalance: '0',
      cutoffDay: '15',
      paymentDueDay: '5',
    });
  };

  const formatLastUpdateDate = (date: Date | string | undefined) => {
    if (!date) return 'Nunca';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('es-ES', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Verificar si los datos están desactualizados (más de 48 horas)
  const isStale = (date: Date | string | undefined) => {
    if (!date) return true;
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const hoursDiff = (new Date().getTime() - dateObj.getTime()) / (1000 * 60 * 60);
    return hoursDiff > 48;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tarjetas de Crédito</h1>
          <p className="text-gray-500 mt-1">
            Gestiona las tarjetas de crédito corporativas
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={18} className="mr-2" />
          Nueva Tarjeta
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 rounded-lg mr-4">
              <CreditCardIcon className="text-blue-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Tarjetas Activas</p>
              <p className="text-2xl font-bold text-gray-900">
                {filteredCards.filter(c => c.status === 'ACTIVE').length}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-purple-100 rounded-lg mr-4">
              <Building2 className="text-purple-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Límite Total</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalCreditLimit)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-red-100 rounded-lg mr-4">
              <AlertCircle className="text-red-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Saldo Dispuesto</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(totalUsed)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-green-100 rounded-lg mr-4">
              <CreditCardIcon className="text-green-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Disponible</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalAvailable)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Lista de tarjetas */}
      <Card title="Listado de Tarjetas">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3 font-medium">Tarjeta</th>
                <th className="pb-3 font-medium">Empresa</th>
                <th className="pb-3 font-medium">Titular</th>
                <th className="pb-3 font-medium text-right">Límite</th>
                <th className="pb-3 font-medium text-right pr-4">Dispuesto</th>
                <th className="pb-3 font-medium text-right pr-4">Disponible</th>
                <th className="pb-3 font-medium pl-4">Última Actualización</th>
                <th className="pb-3 font-medium text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredCards.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
                    No hay tarjetas de crédito registradas
                  </td>
                </tr>
              ) : (
                filteredCards.map((card) => (
                  <tr key={card.id} className="border-b last:border-0">
                    <td className="py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mr-3">
                          <CreditCardIcon className="text-white" size={18} />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{card.cardAlias}</p>
                          <p className="text-sm text-gray-500">{card.bankName} •••• {card.cardNumberLast4}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <span className="text-sm text-gray-600">{getCompanyName(card.companyId)}</span>
                    </td>
                    <td className="py-4">
                      <span className="text-sm text-gray-600">{card.cardHolder}</span>
                    </td>
                    <td className="py-4 text-right">
                      <span className="text-sm text-gray-900">{formatCurrency(card.creditLimit)}</span>
                    </td>
                    <td className="py-4 text-right pr-4">
                      <span className="font-semibold text-red-600">
                        {formatCurrency(card.currentBalance)}
                      </span>
                    </td>
                    <td className="py-4 text-right pr-4">
                      <span className="font-semibold text-green-600">
                        {formatCurrency(card.availableCredit)}
                      </span>
                    </td>
                    <td className="py-4 pl-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-600">
                          {formatLastUpdateDate(card.lastUpdateDate)}
                        </span>
                        {isStale(card.lastUpdateDate) && (
                          <span className="text-xs text-amber-600 flex items-center mt-1">
                            <AlertCircle size={12} className="mr-1" />
                            Dato antiguo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => handleEdit(card)}
                          className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(card.id)}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de formulario */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingCard ? 'Editar Tarjeta' : 'Nueva Tarjeta de Crédito'}
              </h2>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Banco *
                  </label>
                  <Input
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    placeholder="Ej: BBVA, Santander..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Alias de la Tarjeta *
                  </label>
                  <Input
                    value={formData.cardAlias}
                    onChange={(e) => setFormData({ ...formData, cardAlias: e.target.value })}
                    placeholder="Ej: Tarjeta Corporativa"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Últimos 4 dígitos *
                  </label>
                  <Input
                    value={formData.cardNumberLast4}
                    onChange={(e) => setFormData({ ...formData, cardNumberLast4: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    placeholder="1234"
                    maxLength={4}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Solo los últimos 4 dígitos por seguridad</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Titular *
                  </label>
                  <Input
                    value={formData.cardHolder}
                    onChange={(e) => setFormData({ ...formData, cardHolder: e.target.value })}
                    placeholder="Nombre del titular"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Empresa *
                </label>
                <select
                  value={formData.companyId}
                  onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                >
                  <option value="">Seleccionar empresa</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Límite de Crédito (€) *
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.creditLimit}
                    onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Saldo Dispuesto (€)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.currentBalance}
                    onChange={(e) => setFormData({ ...formData, currentBalance: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar size={14} className="inline mr-1" />
                    Día de Corte
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.cutoffDay}
                    onChange={(e) => setFormData({ ...formData, cutoffDay: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar size={14} className="inline mr-1" />
                    Día de Pago
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.paymentDueDay}
                    onChange={(e) => setFormData({ ...formData, paymentDueDay: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingCard ? 'Guardar Cambios' : 'Crear Tarjeta'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
