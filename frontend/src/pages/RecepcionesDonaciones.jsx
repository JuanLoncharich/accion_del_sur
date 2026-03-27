import React, { useContext, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  CheckCircle2,
  Clock3,
  Link2,
  LoaderCircle,
  Mail,
  QrCode,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import api from '../services/api';
import { ToastContext } from '../components/Layout';

const STATUS = {
  processing: { label: 'Procesando', color: 'bg-amber-100 text-amber-700', icon: Clock3 },
  completed: { label: 'Completada', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  partially_rejected: { label: 'Parcialmente rechazada', color: 'bg-orange-100 text-orange-700', icon: TriangleAlert },
  rejected: { label: 'Rechazada', color: 'bg-rose-100 text-rose-700', icon: XCircle },
  failed_anchor: { label: 'Error de anclaje', color: 'bg-slate-200 text-slate-700', icon: ShieldCheck },
};

const emptyDetail = {
  item_id: '',
  quantity_received: 1,
  quantity_accepted: 1,
  quantity_rejected: 0,
  rejection_reason_item: '',
};

export default function RecepcionesDonaciones() {
  const addToast = useContext(ToastContext);
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdReception, setCreatedReception] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const [items, setItems] = useState([]);
  const [receptions, setReceptions] = useState([]);
  const [loadingReceptions, setLoadingReceptions] = useState(false);

  const [selectedReception, setSelectedReception] = useState(null);
  const [details, setDetails] = useState([{ ...emptyDetail }]);
  const [rejectionReason, setRejectionReason] = useState('');
  const [finalizing, setFinalizing] = useState(false);

  const availableItems = useMemo(() => items.filter((item) => item.is_active), [items]);

  const loadReceptions = async () => {
    setLoadingReceptions(true);
    try {
      const { data } = await api.get('/donation-receptions', {
        params: { limit: 50 },
      });
      setReceptions(data.data || []);
    } catch {
      addToast('No se pudo cargar el listado de recepciones', 'error');
    } finally {
      setLoadingReceptions(false);
    }
  };

  const loadItems = async () => {
    try {
      const { data } = await api.get('/items', { params: { limit: 200 } });
      setItems(data.data || []);
    } catch {
      addToast('No se pudo cargar el catálogo de ítems', 'error');
    }
  };

  useEffect(() => {
    loadItems();
    loadReceptions();
  }, []);

  useEffect(() => {
    if (!createdReception?.qr_url) {
      setQrDataUrl('');
      return;
    }

    QRCode.toDataURL(createdReception.qr_url, {
      margin: 1,
      width: 240,
      errorCorrectionLevel: 'M',
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [createdReception]);

  const handleCreate = async () => {
    if (!email.trim()) {
      addToast('Ingresá el email del donador', 'error');
      return;
    }

    setCreating(true);
    try {
      const { data } = await api.post('/donation-receptions', {
        donor_email: email.trim(),
      });
      setCreatedReception(data);
      setEmail('');
      addToast('Recepción creada en estado Procesando', 'success');
      await loadReceptions();
    } catch (error) {
      addToast(error.response?.data?.error || 'No se pudo crear la recepción', 'error');
    } finally {
      setCreating(false);
    }
  };

  const openFinalize = (reception) => {
    setSelectedReception(reception);
    setDetails([{ ...emptyDetail }]);
    setRejectionReason('');
  };

  const patchDetail = (index, field, value) => {
    setDetails((prev) => prev.map((detail, i) => {
      if (i !== index) return detail;
      const next = { ...detail, [field]: value };

      if (field === 'quantity_received' || field === 'quantity_accepted') {
        const received = Number(next.quantity_received || 0);
        let accepted = Number(next.quantity_accepted || 0);
        if (accepted > received) accepted = received;
        if (accepted < 0) accepted = 0;
        next.quantity_accepted = accepted;
        next.quantity_rejected = Math.max(0, received - accepted);
      }

      return next;
    }));
  };

  const addDetail = () => setDetails((prev) => [...prev, { ...emptyDetail }]);
  const removeDetail = (index) => setDetails((prev) => prev.filter((_, i) => i !== index));

  const handleFinalize = async () => {
    if (!selectedReception) return;

    setFinalizing(true);
    try {
      await api.post(`/donation-receptions/${selectedReception.id}/finalize`, {
        details: details.map((detail) => ({
          item_id: Number(detail.item_id),
          quantity_received: Number(detail.quantity_received),
          quantity_accepted: Number(detail.quantity_accepted),
          quantity_rejected: Number(detail.quantity_rejected),
          rejection_reason_item: detail.rejection_reason_item || null,
        })),
        rejection_reason: rejectionReason || null,
      });

      addToast('Recepción finalizada correctamente', 'success');
      setSelectedReception(null);
      await loadReceptions();
    } catch (error) {
      addToast(error.response?.data?.error || 'No se pudo finalizar la recepción', 'error');
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2"><QrCode size={24} /> Recepciones de Donación con QR</h1>
        <p className="text-slate-500 text-sm mt-1">Creá la recepción inicial con email y completá el detalle final con aceptación/rechazo.</p>
      </div>

      <section className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="font-bold text-slate-800">1. Recepción inicial</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            placeholder="donador@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold disabled:bg-indigo-400"
          >
            {creating ? <span className="inline-flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" /> Creando...</span> : 'Generar QR'}
          </button>
        </div>

        {createdReception && (
          <div className="border border-indigo-100 bg-indigo-50 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-slate-700">Recepción #{createdReception.id}</p>
              <p className="text-slate-600"><span className="font-medium">Estado:</span> Procesando</p>
              <p className="text-slate-600 break-all"><span className="font-medium">URL:</span> {createdReception.qr_url}</p>
              <a
                href={createdReception.qr_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-indigo-700 hover:text-indigo-900 font-medium"
              >
                <Link2 size={15} /> Abrir confirmación pública
              </a>
            </div>
            <div className="flex items-center justify-center">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR de confirmación" className="w-48 h-48 rounded-lg border border-indigo-100 bg-white p-2" />
              ) : (
                <p className="text-slate-500 text-sm">No se pudo renderizar el QR</p>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">2. Recepciones y cierre</h2>
          {loadingReceptions && <span className="text-sm text-slate-400">Cargando...</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs uppercase text-slate-500">ID</th>
                <th className="px-4 py-3 text-left text-xs uppercase text-slate-500">Email</th>
                <th className="px-4 py-3 text-left text-xs uppercase text-slate-500">Estado</th>
                <th className="px-4 py-3 text-left text-xs uppercase text-slate-500">Creación</th>
                <th className="px-4 py-3 text-right text-xs uppercase text-slate-500">Acción</th>
              </tr>
            </thead>
            <tbody>
              {receptions.map((reception) => {
                const metadata = STATUS[reception.status] || STATUS.processing;
                return (
                  <tr key={reception.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 text-sm font-medium">#{reception.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 inline-flex items-center gap-2"><Mail size={14} /> {reception.donor_email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${metadata.color}`}>
                        {React.createElement(metadata.icon, { size: 13 })}
                        {metadata.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{new Date(reception.created_at).toLocaleString('es-AR')}</td>
                    <td className="px-4 py-3 text-right">
                      {reception.status === 'processing' ? (
                        <button
                          onClick={() => openFinalize(reception)}
                          className="px-3 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                        >
                          Finalizar
                        </button>
                      ) : (
                        <a
                          href={`/confirmacion-donacion/${reception.public_token_qr}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-indigo-700 hover:text-indigo-900 font-medium"
                        >
                          Ver pública
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
              {receptions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">No hay recepciones cargadas</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedReception && (
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-indigo-100 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-800">Finalizar recepción #{selectedReception.id}</h2>
            <button
              onClick={() => setSelectedReception(null)}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Cerrar
            </button>
          </div>

          {details.map((detail, index) => (
            <div key={index} className="rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  value={detail.item_id}
                  onChange={(e) => patchDetail(index, 'item_id', e.target.value)}
                  className="border-2 border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Seleccionar ítem</option>
                  {availableItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={detail.quantity_received}
                  onChange={(e) => patchDetail(index, 'quantity_received', Number(e.target.value || 1))}
                  className="border-2 border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                  placeholder="Cantidad recibida"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="number"
                  min="0"
                  value={detail.quantity_accepted}
                  onChange={(e) => patchDetail(index, 'quantity_accepted', Number(e.target.value || 0))}
                  className="border-2 border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                  placeholder="Cantidad aceptada"
                />
                <input
                  type="number"
                  value={detail.quantity_rejected}
                  readOnly
                  className="border-2 border-slate-100 bg-slate-50 rounded-xl px-3 py-2 text-slate-600"
                  placeholder="Cantidad rechazada"
                />
              </div>

              {Number(detail.quantity_rejected) > 0 && (
                <input
                  type="text"
                  value={detail.rejection_reason_item}
                  onChange={(e) => patchDetail(index, 'rejection_reason_item', e.target.value)}
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                  placeholder="Razón de rechazo por ítem (opcional si se completa razón global)"
                />
              )}

              <div className="text-right">
                {details.length > 1 && (
                  <button
                    onClick={() => removeDetail(index)}
                    className="text-sm text-rose-600 hover:text-rose-800"
                  >
                    Eliminar línea
                  </button>
                )}
              </div>
            </div>
          ))}

          <div>
            <button
              onClick={addDetail}
              className="px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Agregar ítem
            </button>
          </div>

          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 h-24 resize-none focus:outline-none focus:border-indigo-500"
            placeholder="Razón global de rechazo (obligatoria si hay rechazo y no se detalló por ítem)"
          />

          <button
            onClick={handleFinalize}
            disabled={finalizing}
            className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold disabled:bg-emerald-400"
          >
            {finalizing ? <span className="inline-flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" /> Finalizando...</span> : 'Confirmar cierre'}
          </button>
        </section>
      )}
    </div>
  );
}
