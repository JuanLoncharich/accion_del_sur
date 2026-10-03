import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { ToastContext } from '../components/Layout';
import { Truck, Plus, Trash2, Clock3 } from 'lucide-react';

const today = () => new Date().toISOString().slice(0, 10);
const emptyLine = () => ({ supply_id: '', quantity_sent: '' });

export default function NuevoEnvio() {
  const addToast = useContext(ToastContext);
  const navigate = useNavigate();
  const [centers, setCenters] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ reception_center_id: '', date: today(), confirm: true });
  const [lines, setLines] = useState([emptyLine()]);

  useEffect(() => {
    Promise.all([api.get('/centers'), api.get('/items', { params: { limit: 500 } })])
      .then(([centersRes, itemsRes]) => {
        setCenters(centersRes.data?.data || []);
        setItems(itemsRes.data?.data || []);
      })
      .catch(() => addToast('Error al cargar centros e insumos', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const itemsById = useMemo(() => new Map(items.map((i) => [String(i.id), i])), [items]);

  // Cantidad pedida por insumo sumando todas las líneas (el backend agrega igual).
  const requestedBySupply = useMemo(() => {
    const totals = new Map();
    for (const l of lines) {
      if (!l.supply_id) continue;
      totals.set(l.supply_id, (totals.get(l.supply_id) || 0) + (Number(l.quantity_sent) || 0));
    }
    return totals;
  }, [lines]);

  const updateLine = (index, field, value) => {
    setLines(lines.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  };

  const lineError = (line) => {
    if (!line.supply_id) return null;
    const item = itemsById.get(line.supply_id);
    if (!item) return null;
    const requested = requestedBySupply.get(line.supply_id) || 0;
    return requested > item.available_quantity
      ? `Stock insuficiente: disponible ${item.available_quantity}, solicitado ${requested}`
      : null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.reception_center_id) { addToast('Seleccioná el centro de destino', 'error'); return; }
    const details = lines
      .filter((l) => l.supply_id)
      .map((l) => ({ supply_id: Number(l.supply_id), quantity_sent: Number(l.quantity_sent) }));
    if (!details.length) { addToast('Agregá al menos un insumo', 'error'); return; }
    if (details.some((d) => !Number.isInteger(d.quantity_sent) || d.quantity_sent < 1)) {
      addToast('Todas las cantidades deben ser enteros mayores a 0', 'error'); return;
    }
    if (lines.some(lineError)) { addToast('Hay líneas con stock insuficiente', 'error'); return; }

    setSubmitting(true);
    try {
      await api.post('/shipments', {
        reception_center_id: Number(form.reception_center_id),
        date: form.date,
        confirm: form.confirm,
        details,
      });
      addToast(form.confirm ? 'Envío registrado y stock descontado' : 'Envío registrado como pendiente', 'success');
      navigate('/envios');
    } catch (error) {
      const data = error.response?.data || {};
      const supply = data.supply_id ? itemsById.get(String(data.supply_id)) : null;
      const detail = data.available !== undefined
        ? ` (${supply?.name || `insumo ${data.supply_id}`}: disponible ${data.available}, solicitado ${data.requested})`
        : '';
      addToast(`${data.error || 'Error al registrar el envío'}${detail}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-400">
        <div className="flex justify-center mb-2"><Clock3 size={32} /></div>
        <p>Cargando...</p>
      </div>
    );
  }

  const inputClass = 'w-full border-2 border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 text-sm';

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2"><Truck size={24} /> Nuevo envío</h1>
        <p className="text-slate-500 text-sm">Registrá un envío a un centro de recepción. Al confirmarlo se descuenta el stock. Solo se pueden enviar insumos en estado Disponible.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-700 text-sm font-semibold mb-2">Centro de destino *</label>
            <select
              required
              value={form.reception_center_id}
              onChange={(e) => setForm({ ...form, reception_center_id: e.target.value })}
              className={inputClass}
            >
              <option value="">Seleccioná un centro</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.location ? ` — ${c.location}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-slate-700 text-sm font-semibold mb-2">Fecha *</label>
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
          <h2 className="font-bold text-slate-800">Insumos a enviar</h2>
          {lines.map((line, index) => {
            const item = itemsById.get(line.supply_id);
            const error = lineError(line);
            return (
              <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                <div className="sm:col-span-7">
                  <select
                    value={line.supply_id}
                    onChange={(e) => updateLine(index, 'supply_id', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Seleccioná un insumo</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id} disabled={i.available_quantity < 1 || i.status !== 'DISPONIBLE'}>
                        {i.name} ({i.category?.name || 'Sin categoría'}) — stock {i.available_quantity}
                        {i.status !== 'DISPONIBLE' ? ` · ${(i.status || '').toLowerCase()}` : ''}
                      </option>
                    ))}
                  </select>
                  {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
                </div>
                <div className="sm:col-span-3">
                  <input
                    type="number"
                    min="1"
                    max={item?.available_quantity}
                    placeholder="Cantidad"
                    value={line.quantity_sent}
                    onChange={(e) => updateLine(index, 'quantity_sent', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    disabled={lines.length === 1}
                    onClick={() => setLines(lines.filter((_, i) => i !== index))}
                    className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-600 text-sm"
                  >
                    <Trash2 size={16} /> Quitar
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setLines([...lines, emptyLine()])}
            className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-medium"
          >
            <Plus size={16} /> Agregar insumo
          </button>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.checked })}
              className="w-4 h-4"
            />
            Confirmar ahora (descuenta el stock inmediatamente)
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold rounded-xl"
          >
            {submitting ? 'Registrando...' : 'Registrar envío'}
          </button>
        </div>
      </form>
    </div>
  );
}
