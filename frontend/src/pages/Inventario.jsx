import React, { useState, useEffect, useContext, useCallback } from 'react';
import api from '../services/api';
import { ToastContext } from '../components/Layout';
import { Boxes, CheckCircle2, Clock3, Download, PackageX, XCircle } from 'lucide-react';
import { getCategoryIcon } from '../utils/icons';

const TOKEN_STATUS = {
  pending: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', icon: Clock3 },
  minted: { label: 'Minteado', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  failed: { label: 'Error', color: 'bg-rose-100 text-rose-700', icon: XCircle },
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

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Buscar por nombre..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
          className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 text-sm"
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
      </div>

      {/* Table */}
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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Ítem</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Categoría</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Stock</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden lg:table-cell">Blockchain</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden xl:table-cell">Última actualización</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <React.Fragment key={item.id}>
                    <tr
                      className="border-b border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {React.createElement(getCategoryIcon(item.category?.name), { size: 22, className: 'text-slate-500' })}
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{item.name}</p>
                            {item.attributes && (
                              <p className="text-xs text-slate-400 mt-0.5">
                                {Object.entries(item.attributes).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).slice(0,2).join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <span className="text-sm text-slate-600">{item.category?.name}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-block font-bold text-lg ${item.quantity === 0 ? 'text-red-500' : item.quantity < 5 ? 'text-orange-500' : 'text-green-600'}`}>
                          {item.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center hidden lg:table-cell">
                        {item.token_status && TOKEN_STATUS[item.token_status] ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${TOKEN_STATUS[item.token_status].color}`}>
                            {React.createElement(TOKEN_STATUS[item.token_status].icon, { size: 14 })} {TOKEN_STATUS[item.token_status].label}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 hidden xl:table-cell">
                        <span className="text-sm text-slate-400">
                          {new Date(item.updated_at).toLocaleDateString('es-AR')}
                        </span>
                      </td>
                    </tr>
                    {expandedId === item.id && (
                      <tr className="bg-blue-50">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                            <div>
                              <p className="text-slate-500 text-xs uppercase font-semibold mb-1">Categoría</p>
                              <p className="font-medium">{item.category?.name}</p>
                            </div>
                            {item.attributes && Object.entries(item.attributes).map(([k, v]) => v && (
                              <div key={k}>
                                <p className="text-slate-500 text-xs uppercase font-semibold mb-1">{k}</p>
                                <p className="font-medium">{v}</p>
                              </div>
                            ))}
                            <div>
                              <p className="text-slate-500 text-xs uppercase font-semibold mb-1">Stock actual</p>
                              <p className="font-bold text-green-600 text-lg">{item.quantity} unidades</p>
                            </div>
                            {item.image_url && (
                              <div className="col-span-full">
                                <p className="text-slate-500 text-xs uppercase font-semibold mb-1">Foto</p>
                                <img src={item.image_url} alt={item.name} className="max-h-32 rounded-xl" />
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
