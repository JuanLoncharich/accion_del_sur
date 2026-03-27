import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { ToastContext } from '../components/Layout';
import {
  ArrowRightLeft,
  Package,
  Building2,
  MapPin,
  CheckCircle2,
  LoaderCircle,
  Search,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  Shield,
  XCircle,
  Clock,
} from 'lucide-react';
import { getCategoryIcon } from '../utils/icons';

export default function Transferencias() {
  const addToast = useContext(ToastContext);
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [centers, setCenters] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedTransferId, setExpandedTransferId] = useState(null);

  const [formData, setFormData] = useState({
    from_center_id: '',
    to_center_id: '',
    quantity: 1,
    reason: '',
  });

  useEffect(() => {
    fetchCenters();
    fetchItems();
    fetchTransfers();
  }, []);

  const fetchItems = async () => {
    try {
      const { data } = await api.get('/items', { params: { limit: 100 } });
      setItems(data.data || []);
    } catch (err) {
      addToast('Error al cargar items', 'error');
    }
  };

  const fetchCenters = async () => {
    try {
      const { data } = await api.get('/centers');
      setCenters((data.data || []).filter((c) => c.is_active));
    } catch (err) {
      addToast('Error al cargar centros', 'error');
    }
  };

  const fetchTransfers = async () => {
    try {
      const { data } = await api.get('/transfers', { params: { limit: 20 } });
      setTransfers(data.data || []);
    } catch (err) {
      addToast('Error al cargar transferencias', 'error');
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();

    if (!selectedItem) {
      addToast('Seleccioná un item para transferir', 'error');
      return;
    }

    if (formData.from_center_id === formData.to_center_id) {
      addToast('El origen y destino no pueden ser iguales', 'error');
      return;
    }

    if (formData.quantity > selectedItem.quantity) {
      addToast(`Stock insuficiente. Disponible: ${selectedItem.quantity}`, 'error');
      return;
    }

    setLoading(true);
    try {
      await api.post('/transfers', {
        item_id: selectedItem.id,
        from_center_id: parseInt(formData.from_center_id),
        to_center_id: parseInt(formData.to_center_id),
        quantity: formData.quantity,
        reason: formData.reason,
      });

      addToast('Transferencia realizada correctamente', 'success');
      setShowTransferForm(false);
      setSelectedItem(null);
      setFormData({ from_center_id: '', to_center_id: '', quantity: 1, reason: '' });
      fetchItems();
      fetchTransfers();
    } catch (err) {
      addToast(err.response?.data?.error || 'Error al realizar transferencia', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openTransferForm = (item) => {
    setSelectedItem(item);
    setFormData({
      ...formData,
      from_center_id: item.current_center_id || '',
      quantity: Math.min(1, item.quantity),
    });
    setShowTransferForm(true);
  };

  const closeTransferForm = () => {
    setShowTransferForm(false);
    setSelectedItem(null);
    setFormData({ from_center_id: '', to_center_id: '', quantity: 1, reason: '' });
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { color: 'bg-amber-100 text-amber-700', icon: Clock, label: 'Pendiente' },
      anchored: { color: 'bg-green-100 text-green-700', icon: CheckCircle2, label: 'Anclado' },
      failed: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Fallido' },
    };
    const badge = badges[status] || badges.pending;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${badge.color}`}>
        {React.createElement(badge.icon, { size: 12 })} {badge.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2">
            <ArrowRightLeft size={24} /> Transferencias entre Centros
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Mové items entre centros de distribución con trazabilidad blockchain
          </p>
        </div>
      </div>

      {/* Transfer Form Modal */}
      {showTransferForm && selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-start gap-3">
                {React.createElement(getCategoryIcon(selectedItem.category?.name), { size: 28, className: 'text-indigo-600' })}
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Transferir Item</h2>
                  <p className="text-sm text-slate-500">{selectedItem.name}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Stock actual: <span className="font-bold text-green-600">{selectedItem.quantity}</span>
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleTransfer} className="p-6 space-y-4">
              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2">
                  Centro de Origen
                </label>
                <select
                  required
                  value={formData.from_center_id}
                  onChange={(e) => setFormData({ ...formData, from_center_id: e.target.value })}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Seleccionar origen...</option>
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.id === selectedItem.current_center_id ? '(Actual)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2">
                  Centro de Destino
                </label>
                <select
                  required
                  value={formData.to_center_id}
                  onChange={(e) => setFormData({ ...formData, to_center_id: e.target.value })}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Seleccionar destino...</option>
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2">
                  Cantidad a Transferir
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, quantity: Math.max(1, formData.quantity - 1) })}
                    className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xl flex items-center justify-center"
                  >
                    <Minus size={18} />
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={selectedItem.quantity}
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                    className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-3 text-center text-xl font-bold focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, quantity: Math.min(selectedItem.quantity, formData.quantity + 1) })}
                    className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xl flex items-center justify-center"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Máximo disponible: {selectedItem.quantity}
                </p>
              </div>

              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2">
                  Motivo (opcional)
                </label>
                <input
                  type="text"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                  placeholder="Ej: Reabastecimiento de stock"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeTransferForm}
                  className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <>
                      <ArrowRightLeft size={16} /> Transferir
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Items Available for Transfer */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Items Disponibles</h2>
        {items.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Package size={32} className="mx-auto mb-2" />
            <p>No hay items disponibles</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.filter((i) => i.quantity > 0).map((item) => (
              <div
                key={item.id}
                className="border-2 border-slate-200 rounded-xl p-4 hover:border-indigo-300 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {React.createElement(getCategoryIcon(item.category?.name), { size: 20, className: 'text-indigo-600' })}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.category?.name}</p>
                    <p className="text-sm font-bold text-green-600 mt-1">Stock: {item.quantity}</p>
                    {item.current_center_id && (
                      <p className="text-xs text-slate-400 mt-1">
                        Centro actual: {centers.find((c) => c.id === item.current_center_id)?.name || 'N/A'}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => openTransferForm(item)}
                  className="w-full mt-3 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-1"
                >
                  <ArrowRightLeft size={14} /> Transferir
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Transfers */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Historial de Transferencias</h2>
        {transfers.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <ArrowRightLeft size={32} className="mx-auto mb-2" />
            <p>No hay transferencias registradas</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transfers.map((transfer) => (
              <div key={transfer.id} className="border border-slate-200 rounded-xl overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedTransferId(expandedTransferId === transfer.id ? null : transfer.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {React.createElement(getCategoryIcon(transfer.item?.category?.name), { size: 20, className: 'text-indigo-600' })}
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{transfer.item?.name}</p>
                        <p className="text-xs text-slate-500">
                          {transfer.fromCenter?.name} → {transfer.toCenter?.name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-700">{transfer.quantity} un.</span>
                      {getStatusBadge(transfer.status)}
                      {expandedTransferId === transfer.id ? (
                        <ChevronUp size={16} className="text-slate-400" />
                      ) : (
                        <ChevronDown size={16} className="text-slate-400" />
                      )}
                    </div>
                  </div>
                </div>

                {expandedTransferId === transfer.id && (
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-slate-500 text-xs uppercase font-semibold">Origen</p>
                        <p className="font-medium">{transfer.fromCenter?.name}</p>
                        {transfer.fromCenter?.blockchain_contract_id && (
                          <p className="text-xs font-mono text-slate-400 truncate">
                            {transfer.fromCenter.blockchain_contract_id}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs uppercase font-semibold">Destino</p>
                        <p className="font-medium">{transfer.toCenter?.name}</p>
                        {transfer.toCenter?.blockchain_contract_id && (
                          <p className="text-xs font-mono text-slate-400 truncate">
                            {transfer.toCenter.blockchain_contract_id}
                          </p>
                        )}
                      </div>
                    </div>

                    {transfer.reason && (
                      <div>
                        <p className="text-slate-500 text-xs uppercase font-semibold">Motivo</p>
                        <p className="text-slate-700">{transfer.reason}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-slate-500 text-xs uppercase font-semibold">Egreso TX</p>
                        {transfer.egreso_blockchain_tx ? (
                          <p className="font-mono text-xs text-green-600 break-all">
                            {transfer.egreso_blockchain_tx.substring(0, 16)}...
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400">Pendiente</p>
                        )}
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs uppercase font-semibold">Ingreso TX</p>
                        {transfer.ingreso_blockchain_tx ? (
                          <p className="font-mono text-xs text-green-600 break-all">
                            {transfer.ingreso_blockchain_tx.substring(0, 16)}...
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400">Pendiente</p>
                        )}
                      </div>
                    </div>

                    {(transfer.egreso_blockchain_hash || transfer.ingreso_blockchain_hash) && (
                      <div className="flex items-center gap-1 text-green-600 text-xs">
                        <Shield size={12} />
                        <span className="font-medium">Anclado en blockchain</span>
                      </div>
                    )}

                    <p className="text-xs text-slate-400">
                      {new Date(transfer.created_at).toLocaleString('es-AR')}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
