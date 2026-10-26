import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { ToastContext } from '../components/Layout';
import { ClipboardList, Clock3, ExternalLink, Link2, PackageX, Plus, CheckCircle2, Trash2 } from 'lucide-react';
import { getCategoryIcon } from '../utils/icons';

const STATUS = {
  true: { label: 'Confirmado', color: 'bg-emerald-100 text-emerald-700' },
  false: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700' },
};

// Estado del anclaje en blockchain (burn SFT al confirmar).
const CHAIN = {
  anchored: { label: 'En blockchain', color: 'bg-indigo-100 text-indigo-700' },
  local: { label: 'Solo en base', color: 'bg-slate-100 text-slate-600' },
};
const txUrl = (tx) => `https://stellar.expert/explorer/${import.meta.env.VITE_STELLAR_NETWORK || 'testnet'}/tx/${tx}`;

const formatDate = (value) => new Date(`${value}T00:00:00`).toLocaleDateString('es-AR');

export default function Distribuciones() {
  const addToast = useContext(ToastContext);
  const [shipments, setShipments] = useState([]);
  const [centers, setCenters] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [filters, setFilters] = useState({ status: '', reception_center_id: '', from: '', to: '', page: 1 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 20, ...filters };
      Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
      const { data } = await api.get('/shipments', { params });
      setShipments(data.data);
      setTotal(data.total);
    } catch {
      addToast('Error al cargar envíos', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { api.get('/centers').then((r) => setCenters(r.data?.data || [])); }, []);

  const runAction = async (shipment, action) => {
    if (action === 'delete' && !confirm('¿Eliminar este envío pendiente?')) return;
    setBusyId(shipment.id);
    try {
      if (action === 'confirm') {
        await api.post(`/shipments/${shipment.id}/confirm`);
        addToast('Envío confirmado y stock descontado', 'success');
      } else {
        await api.delete(`/shipments/${shipment.id}`);
        addToast('Envío eliminado', 'success');
      }
      fetchData();
    } catch (error) {
      const data = error.response?.data || {};
      const detail = data.available !== undefined ? ` (disponible ${data.available}, solicitado ${data.requested})` : '';
      addToast(`${data.error || 'No se pudo completar la acción'}${detail}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = Math.ceil(total / 20);
  const selectClass = 'border-2 border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 text-sm';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2"><ClipboardList size={24} /> Envíos</h1>
          <p className="text-slate-500 text-sm">{total} envíos registrados</p>
        </div>
        <Link
          to="/envios/nuevo"
          className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold"
        >
          <Plus size={16} /> Nuevo envío
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
          className={selectClass}
        >
          <option value="">Todos los estados</option>
          <option value="confirmed">Confirmados</option>
          <option value="pending">Pendientes</option>
        </select>
        <select
          value={filters.reception_center_id}
          onChange={(e) => setFilters({ ...filters, reception_center_id: e.target.value, page: 1 })}
          className={selectClass}
        >
          <option value="">Todos los destinos</option>
          {centers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 1 })}
          className={selectClass}
          placeholder="Desde"
        />
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 1 })}
          className={selectClass}
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
        ) : shipments.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <div className="flex justify-center mb-3"><PackageX size={36} /></div>
            <p className="text-lg">No hay envíos</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Destino</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Unidades</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => {
                  const details = s.details || [];
                  const units = details.reduce((acc, d) => acc + Number(d.quantity_sent || 0), 0);
                  const status = STATUS[s.confirmed];
                  return (
                    <React.Fragment key={s.id}>
                      <tr
                        className="border-b border-slate-100 hover:bg-orange-50 cursor-pointer"
                        onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                      >
                        <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">{formatDate(s.date)}</td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-800 text-sm">{s.destination?.name || '—'}</p>
                          <p className="text-xs text-slate-400">{details.length} insumo{details.length === 1 ? '' : 's'}</p>
                        </td>
                        <td className="px-4 py-4 text-center font-bold text-orange-600">-{units}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex px-2 py-1 rounded-lg text-xs font-medium ${status.color}`}>{status.label}</span>
                          {CHAIN[s.blockchain_status] && (
                            <span className={`ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${CHAIN[s.blockchain_status].color}`}>
                              <Link2 size={12} /> {CHAIN[s.blockchain_status].label}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {!s.confirmed && (
                            <div className="inline-flex gap-2">
                              <button
                                disabled={busyId === s.id}
                                onClick={() => runAction(s, 'confirm')}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold disabled:opacity-50"
                              >
                                <CheckCircle2 size={14} /> Confirmar
                              </button>
                              <button
                                disabled={busyId === s.id}
                                onClick={() => runAction(s, 'delete')}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold disabled:opacity-50"
                              >
                                <Trash2 size={14} /> Eliminar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {expandedId === s.id && (
                        <tr className="bg-orange-50">
                          <td colSpan={5} className="px-6 py-4">
                            <div className="space-y-2 text-sm">
                              {details.map((d) => (
                                <div key={d.id} className="flex items-center justify-between gap-3">
                                  <span className="inline-flex items-center gap-2">
                                    {React.createElement(getCategoryIcon(d.supply?.category?.name), { size: 16, className: 'text-slate-500' })}
                                    <span className="font-medium text-slate-800">{d.supply?.name}</span>
                                    <span className="text-xs text-slate-400">{d.supply?.category?.name}</span>
                                  </span>
                                  <span className="inline-flex items-center gap-3">
                                    {d.blockchain_tx && (
                                      <a href={txUrl(d.blockchain_tx)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
                                        <ExternalLink size={12} /> tx
                                      </a>
                                    )}
                                    <span className="font-semibold text-orange-600">{d.quantity_sent}</span>
                                  </span>
                                </div>
                              ))}
                              <p className="text-xs text-slate-500 pt-2">
                                Registrado por {s.registeredBy?.email || '—'}
                                {s.destination?.location ? ` · ${s.destination.location}` : ''}
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
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
