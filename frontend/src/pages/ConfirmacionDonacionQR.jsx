import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Mail,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from 'lucide-react';

const STATUS = {
  processing: { label: 'Procesando', color: 'bg-amber-100 text-amber-700', icon: Clock3 },
  completed: { label: 'Completada', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  partially_rejected: { label: 'Parcialmente rechazada', color: 'bg-orange-100 text-orange-700', icon: TriangleAlert },
  rejected: { label: 'Rechazada', color: 'bg-rose-100 text-rose-700', icon: XCircle },
  failed_anchor: { label: 'Error de anclaje', color: 'bg-slate-200 text-slate-700', icon: TriangleAlert },
};

export default function ConfirmacionDonacionQR() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  const metadata = useMemo(() => {
    if (!data) return STATUS.processing;
    return STATUS[data.status] || STATUS.processing;
  }, [data]);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/donation-receptions/public/${token}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'No se pudo cargar la confirmación');
      }

      const payload = await response.json();
      setData(payload);
      setError('');
    } catch (err) {
      setError(err.message || 'No se pudo cargar la confirmación');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data) return undefined;

    const id = setInterval(() => {
      load();
    }, 15000);

    return () => clearInterval(id);
  }, [data, load]);

  const handleVerify = async () => {
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const response = await fetch(`/api/donation-receptions/public/${token}/verify`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || payload.message || 'No se pudo verificar');
      setVerifyResult(payload);
    } catch (err) {
      setVerifyResult({ verified: false, message: err.message || 'No se pudo verificar' });
    } finally {
      setVerifyLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white shadow-sm rounded-2xl p-8 text-center">
          <LoaderCircle className="animate-spin mx-auto text-indigo-600" size={28} />
          <p className="text-slate-600 mt-3">Cargando confirmación...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white shadow-sm rounded-2xl p-8 max-w-lg w-full">
          <h1 className="text-xl font-bold text-slate-800">Confirmación de donación</h1>
          <p className="text-rose-600 mt-3">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50 px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="bg-white rounded-2xl shadow-sm p-6">
          <h1 className="text-2xl font-bold text-slate-800">Confirmación de donación</h1>
          <p className="text-slate-500 text-sm mt-1">Seguimiento público de recepción por QR</p>

          <div className="mt-4">
            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold ${metadata.color}`}>
              {React.createElement(metadata.icon, { size: 16 })}
              {metadata.label}
            </span>
          </div>
        </header>

        <section className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="font-semibold text-slate-800 mb-2">Email del donador</h2>
          <div className="flex items-center gap-2 text-slate-700 text-sm">
            <Mail size={15} />
            <span>{data.donor_email}</span>
            <span className="ml-2 text-xs px-2 py-1 rounded-md bg-amber-100 text-amber-700">Privado</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">{data.privacy_notice}</p>
        </section>

        <section className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="font-semibold text-slate-800 mb-3">Estado de lo aceptado y minteado</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Unidades aceptadas</p>
              <p className="text-2xl font-bold text-emerald-700">{data.accepted_tracking?.accepted_total || 0}</p>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-indigo-700">Unidades minteadas</p>
              <p className="text-2xl font-bold text-indigo-700">{data.accepted_tracking?.minted_total || 0}</p>
            </div>
          </div>

          {Array.isArray(data.accepted_tracking?.donations) && data.accepted_tracking.donations.length > 0 ? (
            <div className="space-y-2">
              {data.accepted_tracking.donations.slice(0, 8).map((donation) => (
                <div key={donation.donation_id} className="rounded-lg border border-slate-100 px-3 py-2">
                  <p className="text-sm font-medium text-slate-800">{donation.item_name}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {donation.center_name || 'Centro no definido'} · {donation.quantity} un. · {donation.minted ? 'minteada' : 'pendiente de mint'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">Todavía no se cargaron donaciones aceptadas asociadas a tu correo.</p>
          )}
        </section>

        {data.status === 'processing' ? (
          <section className="bg-white rounded-2xl shadow-sm p-6">
            <p className="text-slate-700">Tu donación está en procesamiento por el equipo encargado. Esta pantalla se actualiza automáticamente.</p>
          </section>
        ) : (
          <>
            <section className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="font-semibold text-slate-800 mb-3">Detalle de ítems</h2>
              <div className="space-y-3">
                {data.items.map((item) => (
                  <div key={`${item.item_id}-${item.item_name}`} className="border border-slate-100 rounded-xl p-3">
                    <p className="font-medium text-slate-800">{item.item_name}</p>
                    <div className="text-sm text-slate-600 mt-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <span>Recibido: {item.quantity_received}</span>
                      <span>Aceptado: {item.quantity_accepted}</span>
                      <span>Rechazado: {item.quantity_rejected}</span>
                    </div>
                    {item.rejection_reason_item && (
                      <p className="text-sm text-rose-700 mt-2">Motivo de rechazo (ítem): {item.rejection_reason_item}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {data.rejection_reason && (
              <section className="bg-white rounded-2xl shadow-sm p-6 border border-rose-100">
                <h2 className="font-semibold text-rose-700 mb-1">Motivo de rechazo</h2>
                <p className="text-slate-700 text-sm">{data.rejection_reason}</p>
              </section>
            )}

            <section className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="font-semibold text-slate-800 mb-3">Verificación en blockchain</h2>
              <p className="text-sm text-slate-600 mb-4">Validá que el hash anclado coincide con el detalle final de esta recepción.</p>
              <button
                onClick={handleVerify}
                disabled={verifyLoading || !data.blockchain?.available}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:bg-slate-300"
              >
                {verifyLoading ? 'Verificando...' : 'Verificar en blockchain'}
              </button>

              {!data.blockchain?.available && (
                <p className="text-xs text-slate-500 mt-2">Anclaje no disponible todavía.</p>
              )}

              {verifyResult && (
                <div className={`mt-4 rounded-xl p-3 text-sm ${verifyResult.verified ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  <p className="font-semibold inline-flex items-center gap-2">
                    <ShieldCheck size={14} />
                    {verifyResult.verified ? 'Verificación exitosa' : 'No verificado'}
                  </p>
                  <p className="mt-1">{verifyResult.message}</p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
