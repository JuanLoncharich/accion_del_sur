import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { ToastContext } from '../components/Layout';
import {
  CircleCheckBig,
  Handshake,
  IdCard,
  LoaderCircle,
  Minus,
  Package,
  PackageX,
  PencilLine,
  Plus,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { getCategoryIcon } from '../utils/icons';

export default function NuevaDistribucion() {
  const addToast = useContext(ToastContext);
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [receiverId, setReceiverId] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingItems, setFetchingItems] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data));
  }, []);

  useEffect(() => {
    setFetchingItems(true);
    const params = { limit: 50 };
    if (search) params.search = search;
    if (categoryFilter) params.category_id = categoryFilter;
    api.get('/items', { params })
      .then((r) => setItems(r.data.data.filter((i) => i.quantity > 0)))
      .finally(() => setFetchingItems(false));
  }, [search, categoryFilter]);

  const handleSubmit = async () => {
    if (!selectedItem) return addToast('Seleccioná un ítem', 'error');
    if (!receiverId.trim()) return addToast('Ingresá el identificador del receptor', 'error');
    if (quantity < 1 || quantity > selectedItem.quantity) {
      return addToast(`Cantidad inválida. Disponible: ${selectedItem.quantity}`, 'error');
    }

    setLoading(true);
    try {
      await api.post('/distributions', {
        item_id: selectedItem.id,
        quantity,
        receiver_identifier: receiverId,
        notes,
      });
      addToast('¡Distribución registrada exitosamente!', 'success');
      navigate('/distribuciones');
    } catch (err) {
      addToast(err.response?.data?.error || 'Error al registrar la distribución', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2"><Handshake size={24} /> Registrar Distribución</h1>
        <p className="text-slate-500 text-sm mt-1">Seleccioná el ítem a entregar y completá los datos del receptor</p>
      </div>

      <div className="space-y-6">
        {/* Step 0: Select item */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-4">1. Seleccionar Ítem</h2>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              placeholder="Buscar ítem..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 text-sm"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border-2 border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 text-sm"
            >
              <option value="">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {fetchingItems ? (
            <p className="text-center text-slate-400 py-6">Cargando ítems...</p>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <div className="flex justify-center mb-2"><PackageX size={32} /></div>
              <p>No hay ítems disponibles con stock</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { setSelectedItem(item); setQuantity(1); }}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                    selectedItem?.id === item.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {React.createElement(getCategoryIcon(item.category?.name), { size: 22, className: 'text-slate-500' })}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{item.name}</p>
                      <p className="text-xs text-slate-400">{item.category?.name}</p>
                    </div>
                    <span className="font-bold text-green-600 shrink-0">
                      {item.quantity} disponibles
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Step 1: Quantity + recipient */}
        {selectedItem && (
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
            <h2 className="font-bold text-slate-800">2. Cantidad y Receptor</h2>

            <div className="bg-blue-50 rounded-xl p-3 flex items-center gap-3">
              {React.createElement(getCategoryIcon(selectedItem.category?.name), { size: 22, className: 'text-slate-500' })}
              <div>
                <p className="font-semibold text-slate-800 text-sm">{selectedItem.name}</p>
                <p className="text-xs text-green-600 font-medium">Stock disponible: {selectedItem.quantity} unidades</p>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 text-sm font-semibold mb-2">
                <span className="inline-flex items-center gap-2"><Package size={16} /> Cantidad a entregar</span> <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xl flex items-center justify-center"
                ><Minus size={18} /></button>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.min(selectedItem.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-3 text-center text-xl font-bold focus:outline-none focus:border-indigo-500"
                  min="1"
                  max={selectedItem.quantity}
                />
                <button
                  type="button"
                  onClick={() => setQuantity(Math.min(selectedItem.quantity, quantity + 1))}
                  className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xl flex items-center justify-center"
                ><Plus size={18} /></button>
              </div>
              {quantity > selectedItem.quantity && (
                <p className="text-red-500 text-sm mt-1 inline-flex items-center gap-1"><TriangleAlert size={14} /> No hay suficiente stock</p>
              )}
            </div>

            <div>
              <label className="block text-slate-700 text-sm font-semibold mb-2">
                <span className="inline-flex items-center gap-2"><IdCard size={16} /> Identificador del receptor</span> <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={receiverId}
                onChange={(e) => setReceiverId(e.target.value)}
                placeholder="DNI, nombre, código u otro identificador único"
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <p className="text-xs text-slate-400 mt-1">
                Este identificador se guardará de forma segura (hasheado) para proteger la privacidad
              </p>
            </div>

            <div>
              <label className="block text-slate-700 text-sm font-semibold mb-2">
                <span className="inline-flex items-center gap-2"><PencilLine size={16} /> Observaciones (opcional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Alguna nota sobre esta entrega..."
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors h-20 resize-none"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading || quantity > selectedItem.quantity || !receiverId.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all text-lg shadow-lg"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2"><LoaderCircle size={18} className="animate-spin" /> Registrando...</span>
              ) : (
                <span className="inline-flex items-center gap-2"><CircleCheckBig size={18} /> Confirmar Distribución</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
