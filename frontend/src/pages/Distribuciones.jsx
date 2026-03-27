import React, { useState, useEffect, useContext, useCallback } from 'react';
import api from '../services/api';
import { ToastContext } from '../components/Layout';
import { ClipboardList, Clock3, IdCard, PackageX } from 'lucide-react';
import { getCategoryIcon } from '../utils/icons';

export default function Distribuciones() {
  const addToast = useContext(ToastContext);
  const [distributions, setDistributions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [filters, setFilters] = useState({ category_id: '', receiver: '', from: '', to: '', page: 1 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 20, ...filters };
      Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
      const { data } = await api.get('/distributions', { params });
      setDistributions(data.data);
      setTotal(data.total);
    } catch {
      addToast('Error al cargar distribuciones', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { api.get('/categories').then((r) => setCategories(r.data)); }, []);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2"><ClipboardList size={24} /> Historial de Distribuciones</h1>
        <p className="text-slate-500 text-sm">{total} distribuciones registradas</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <input
          type="text"
          placeholder="Receptor..."
          value={filters.receiver}
          onChange={(e) => setFilters({ ...filters, receiver: e.target.value, page: 1 })}
          className="border-2 border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 text-sm"
        />
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
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 1 })}
          className="border-2 border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 text-sm"
          placeholder="Desde"
        />
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 1 })}
          className="border-2 border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 text-sm"
          placeholder="Hasta"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400">
            <div className="flex justify-center mb-2"><Clock3 size={32} /></div>
            <p>Cargando...</p>
          </div>
        ) : distributions.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <div className="flex justify-center mb-3"><PackageX size={36} /></div>
            <p className="text-lg">No hay distribuciones</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Ítem</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Cantidad</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Receptor</th>
                </tr>
              </thead>
              <tbody>
                {distributions.map((d) => (
                  <React.Fragment key={d.id}>
                    <tr
                      className="border-b border-slate-100 hover:bg-orange-50 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
                    >
                      <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">
                        {new Date(d.created_at).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          {React.createElement(getCategoryIcon(d.item?.category?.name), { size: 20, className: 'text-slate-500' })}
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{d.item?.name}</p>
                            <p className="text-xs text-slate-400">{d.item?.category?.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center font-bold text-orange-600">-{d.quantity}</td>
                      <td className="px-4 py-4 hidden md:table-cell text-sm text-slate-600 max-w-xs truncate">
                        <span className="inline-flex items-center gap-1"><IdCard size={14} /> {d.receiver_identifier}</span>
                      </td>
                    </tr>
                    {expandedId === d.id && (
                      <tr className="bg-orange-50">
                        <td colSpan={4} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                            <div>
                              <p className="text-slate-500 text-xs uppercase font-semibold mb-1">Receptor</p>
                              <p className="font-medium">{d.receiver_identifier}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-xs uppercase font-semibold mb-1">Registrado por</p>
                              <p className="font-medium">{d.registeredBy?.username}</p>
                            </div>
                            {d.notes && (
                              <div className="col-span-full">
                                <p className="text-slate-500 text-xs uppercase font-semibold mb-1">Observaciones</p>
                                <p className="font-medium">{d.notes}</p>
                              </div>
                            )}
                            {d.blockchain_hash && (
                              <div className="col-span-full">
                                <p className="text-slate-500 text-xs uppercase font-semibold mb-1">Hash Blockchain</p>
                                <p className="font-mono text-xs text-slate-600 break-all">{d.blockchain_hash}</p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
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
