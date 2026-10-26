import React, { useEffect, useState } from 'react';
import {
  ArrowRightLeft, CheckCircle2, ExternalLink, Gift, LoaderCircle, QrCode, ShieldAlert, ShieldCheck, Truck, X,
} from 'lucide-react';
import api from '../services/api';

const TIPOS = {
  donacion: { label: 'Donación', icon: Gift, color: 'text-emerald-600 bg-emerald-50' },
  recepcion: { label: 'Recepción', icon: QrCode, color: 'text-sky-600 bg-sky-50' },
  transferencia: { label: 'Transferencia', icon: ArrowRightLeft, color: 'text-violet-600 bg-violet-50' },
  envio: { label: 'Envío', icon: Truck, color: 'text-amber-600 bg-amber-50' },
};

const ESTADOS = {
  anchored: { label: 'En blockchain', color: 'bg-emerald-100 text-emerald-700' },
  local: { label: 'Solo en base', color: 'bg-amber-100 text-amber-700' },
  pending: { label: 'Pendiente', color: 'bg-slate-100 text-slate-600' },
  disabled: { label: 'Blockchain apagada', color: 'bg-slate-100 text-slate-500' },
};

const explorer = (red, tipo, id) => `https://stellar.expert/explorer/${red || 'testnet'}/${tipo}/${id}`;
// Las fechas sin hora (YYYY-MM-DD) se muestran tal cual, sin corrimiento por zona horaria.
const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v)).toLocaleDateString('es-AR');
const corto = (v) => (v && v.length > 18 ? `${v.slice(0, 8)}…${v.slice(-6)}` : v);

// Modal con la línea de tiempo de un insumo y la verificación de su saldo on-chain.
export default function TrazabilidadInsumo({ itemId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/items/${itemId}/trazabilidad`)
      .then((r) => setData(r.data))
      .catch(() => setError('No se pudo cargar la trazabilidad'));
  }, [itemId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Trazabilidad</h2>
            {data && <p className="text-sm text-slate-500">{data.item.name} · {data.item.category}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Cerrar"><X size={20} /></button>
        </div>

        {error && <p className="p-6 text-center text-red-600">{error}</p>}
        {!data && !error && (
          <p className="flex items-center justify-center gap-2 p-10 text-slate-500"><LoaderCircle size={18} className="animate-spin" /> Consultando...</p>
        )}

        {data && (
          <div className="space-y-5 p-5">
            <Verificacion data={data} />

            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Movimientos</h3>
              {data.eventos.length === 0 ? (
                <p className="text-sm text-slate-400">Sin movimientos registrados.</p>
              ) : (
                <ol className="space-y-3">
                  {data.eventos.map((e, i) => {
                    const tipo = TIPOS[e.tipo];
                    const estado = ESTADOS[e.blockchain_status];
                    return (
                      <li key={`${e.tipo}-${i}`} className="flex gap-3">
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tipo.color}`}>
                          {React.createElement(tipo.icon, { size: 16 })}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-700">{tipo.label}</span>
                            <span className={`text-sm font-semibold ${e.cantidad < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {e.cantidad > 0 ? '+' : ''}{e.cantidad}
                            </span>
                            {estado && <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${estado.color}`}>{estado.label}</span>}
                          </div>
                          <p className="text-sm text-slate-500">{e.detalle} · {fecha(e.fecha)}</p>
                          {e.tx && (
                            <a href={explorer(data.red, 'tx', e.tx)} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
                              <ExternalLink size={12} /> Transacción {corto(e.tx)}
                            </a>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            {(data.contrato_sft || data.centro?.contrato) && (
              <section className="space-y-1 border-t border-slate-100 pt-4 text-xs text-slate-500">
                {data.contrato_sft && (
                  <p>Contrato SFT: <a className="text-indigo-600" href={explorer(data.red, 'contract', data.contrato_sft)} target="_blank" rel="noreferrer">{corto(data.contrato_sft)}</a></p>
                )}
                {data.centro?.contrato && (
                  <p>Contrato de {data.centro.name}: <a className="text-indigo-600" href={explorer(data.red, 'contract', data.centro.contrato)} target="_blank" rel="noreferrer">{corto(data.centro.contrato)}</a></p>
                )}
                <p className="break-all">Token ID: {data.token_id}</p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Verificacion({ data }) {
  const v = data.verificacion;
  if (!v.disponible) {
    return <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{v.motivo}</div>;
  }
  return v.coincide ? (
    <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
      <ShieldCheck size={20} className="shrink-0" />
      <p>
        <b>Verificado en blockchain.</b> El saldo on-chain de {data.centro.name} ({v.saldo_onchain}) coincide con el stock registrado.
        <CheckCircle2 size={14} className="ml-1 inline" />
      </p>
    </div>
  ) : (
    <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
      <ShieldAlert size={20} className="shrink-0" />
      <p>
        <b>Diferencia con la blockchain.</b> Saldo on-chain: {v.saldo_onchain} · stock en la base: {v.stock_base}.
        Alguna operación quedó solo en la base; se reconcilia con <code>npm run stellar:sincronizar</code>.
      </p>
    </div>
  );
}
