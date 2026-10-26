import React, { useEffect, useState } from 'react';
import { AlertTriangle, LifeBuoy, LoaderCircle, MapPin, PackageSearch } from 'lucide-react';
import api from '../services/api';

// Panel de apoyo (sólo lectura): insumos prioritarios y puntos de recepción activos,
// calculados a partir del inventario y los centros registrados.
export default function PanelApoyo() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/support-panel').then((r) => setData(r.data)).catch(() => setError('No se pudo cargar el panel de apoyo'));
  }, []);

  if (error) return <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-600">{error}</div>;
  if (!data) {
    return <div className="flex items-center justify-center py-12 text-slate-500 gap-2"><LoaderCircle size={20} className="animate-spin" /> Cargando panel...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2"><LifeBuoy size={24} /> Panel de apoyo</h1>
        <p className="text-slate-500 text-sm mt-1">Qué se necesita y dónde acercar donaciones. Actualizado {new Date(data.generatedAt).toLocaleString('es-AR')}.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-slate-800 inline-flex items-center gap-2"><PackageSearch size={18} /> Insumos prioritarios</h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">Categorías con menor stock disponible para enviar. Se marcan como críticas por debajo de {data.threshold} unidades.</p>
          {data.prioritySupplies.length === 0 ? (
            <p className="text-slate-400 text-sm">No hay categorías cargadas.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.prioritySupplies.map((p) => (
                <li key={p.category_id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold text-slate-700">{p.category}</p>
                    {p.parent && <p className="text-xs text-slate-400">{p.parent}</p>}
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${p.critical ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                    {p.critical && <AlertTriangle size={12} />} {p.available} disponibles
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-slate-800 inline-flex items-center gap-2"><MapPin size={18} /> Puntos de recepción activos</h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">Centros habilitados y su estado operativo actual.</p>
          {data.receptionPoints.length === 0 ? (
            <p className="text-slate-400 text-sm">No hay centros activos.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.receptionPoints.map((c) => (
                <li key={c.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-slate-700">{c.name}</p>
                    <span className={`shrink-0 px-2 py-1 rounded-lg text-xs font-semibold ${c.accepting ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {c.operational_status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{c.location}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
