import React, { useState, useEffect, useContext, useCallback } from 'react';
import api from '../services/api';
import { ToastContext } from '../components/Layout';
import { Boxes, CheckCircle2, Clock3, Download, ExternalLink, PackageX, Search, XCircle } from 'lucide-react';
import { getCategoryIcon } from '../utils/icons';

const TOKEN_STATUS = {
  pending: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', icon: Clock3 },
  minted: { label: 'Minteado', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  failed: { label: 'Error', color: 'bg-rose-100 text-rose-700', icon: XCircle },
};

const stellarExplorerBase = `https://stellar.expert/explorer/${(import.meta.env.VITE_STELLAR_NETWORK || 'testnet').toLowerCase()}`;

const buildTxUrl = (txId) => {
  if (!txId) return null;
  return `${stellarExplorerBase}/tx/${txId}`;
};

const buildShort = (value, head = 10, tail = 8) => {
  if (!value) return '';
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

export default function Inventario() {
  const addToast = useContext(ToastContext);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [filters, setFilters] = useState({ category_id: '', search: '', page: 1 });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 20, ...filters };
      if (!params.category_id) delete params.category_id;
      if (!params.search) delete params.search;
      const { data } = await api.get('/items', { params });
      setItems(data.data);
      setTotal(data.total);
    } catch {
      addToast('Error al cargar el inventario', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { api.get('/categories').then((r) => setCategories(r.data)); }, []);

  const handleExport = async () => {
    try {
      const response = await api.get('/items/export/csv', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'inventario.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      addToast('Error al exportar', 'error');
    }
  };

  const totalPages = Math.ceil(total / 20);
  const lowStockCount = items.filter((item) => item.quantity > 0 && item.quantity < 5).length;
  const mintedCount = items.filter((item) => item.token_status === 'minted').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2"><Boxes size={24} /> Inventario</h1>
          <p className="text-slate-500 text-sm">{total} ítems en total</p>
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm flex items-center gap-2 shadow-md"
        >
          <Download size={16} /> Exportar CSV
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
          <p className="text-xs uppercase tracking-wide text-slate-500">Items visibles</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{items.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
          <p className="text-xs uppercase tracking-wide text-slate-500">Stock bajo (&lt; 5)</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{lowStockCount}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
          <p className="text-xs uppercase tracking-wide text-slate-500">Minteados</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{mintedCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
            className="w-full border-2 border-slate-200 rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:border-indigo-500 text-sm"
          />
        </div>
        <select
          value={filters.category_id}
          onChange={(e) => setFilters({ ...filters, category_id: e.target.value, page: 1 })}
          className="border-2 border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 text-sm"
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400">
            <div className="flex justify-center mb-2"><Clock3 size={32} /></div>
            <p>Cargando inventario...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <div className="flex justify-center mb-3"><PackageX size={36} /></div>
            <p className="text-lg">No hay ítems en el inventario</p>
            <p className="text-sm mt-1">Registrá la primera donación</p>
          </div>
        ) : (
          <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((item) => {
              const statusMeta = TOKEN_STATUS[item.token_status] || TOKEN_STATUS.pending;
              const txUrl = buildTxUrl(item.blockchain_tx_id);
              const attributes = item.attributes
                ? Object.entries(item.attributes).filter(([, value]) => value)
                : [];

              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 shadow-sm overflow-hidden"
                >
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                          {React.createElement(getCategoryIcon(item.category?.name), { size: 20, className: 'text-slate-600' })}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 text-sm leading-snug break-words">{item.name}</p>
                          <p className="text-xs text-slate-500 mt-1">{item.category?.name || 'Sin categoría'}</p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${statusMeta.color}`}>
                        {React.createElement(statusMeta.icon, { size: 12 })} {statusMeta.label}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Stock</p>
                        <p className={`font-bold text-lg ${item.quantity === 0 ? 'text-rose-600' : item.quantity < 5 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {item.quantity}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Actualizado</p>
                        <p className="font-medium text-slate-700 text-sm mt-1">
                          {new Date(item.updated_at).toLocaleDateString('es-AR')}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Blockchain</p>
                      {txUrl ? (
                        <a
                          href={txUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-indigo-700 hover:text-indigo-900 font-medium"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={14} /> Ver transacción ({buildShort(item.blockchain_tx_id)})
                        </a>
                      ) : (
                        <p className="text-xs text-slate-500">Sin transacción visible todavía</p>
                      )}
                    </div>
                  </div>

                  {expandedId === item.id && (
                    <div className="px-4 pb-4 border-t border-slate-200 bg-white/70">
                      <div className="pt-3 grid grid-cols-1 gap-2 text-sm">
                        {attributes.length > 0 ? attributes.map(([key, value]) => (
                          <div key={`${item.id}-${key}`} className="flex justify-between gap-3 border-b border-slate-100 pb-1">
                            <span className="text-slate-500">{key}</span>
                            <span className="font-medium text-slate-700 text-right">{String(value)}</span>
                          </div>
                        )) : (
                          <p className="text-slate-500">Sin atributos adicionales.</p>
                        )}

                        {item.blockchain_hash && (
                          <div className="pt-1">
                            <p className="text-xs text-slate-500 uppercase tracking-wide">Token ID / Hash</p>
                            <p className="text-xs text-slate-700 break-all">{item.blockchain_hash}</p>
                          </div>
                        )}

                        {item.image_url && (
                          <div className="pt-2">
                            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Foto</p>
                            <img src={item.image_url} alt={item.name} className="max-h-36 rounded-xl border border-slate-200" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={filters.page === 1}
            onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
            className="px-4 py-2 bg-white rounded-xl shadow-sm border border-slate-200 disabled:opacity-40 hover:bg-slate-50 text-sm font-medium"
          >
            ← Anterior
          </button>
          <span className="text-sm text-slate-600 px-3">
            Página {filters.page} de {totalPages}
          </span>
          <button
            disabled={filters.page === totalPages}
            onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
            className="px-4 py-2 bg-white rounded-xl shadow-sm border border-slate-200 disabled:opacity-40 hover:bg-slate-50 text-sm font-medium"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
