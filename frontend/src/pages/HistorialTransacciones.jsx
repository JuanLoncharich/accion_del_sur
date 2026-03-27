import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import { History, Scale } from 'lucide-react';
import { mockDonations, mockDistributions } from '../utils/mockBlockchainData';

const monthKey = (dateValue) => new Date(dateValue).toLocaleDateString('es-AR', { month: 'short' });

export default function HistorialTransacciones() {
  const monthly = useMemo(() => {
    const months = {};

    mockDonations.forEach((d) => {
      const key = monthKey(d.created_at);
      if (!months[key]) months[key] = { month: key, donated: 0, distributed: 0 };
      months[key].donated += Number(d.quantity);
    });

    mockDistributions.forEach((d) => {
      const key = monthKey(d.created_at);
      if (!months[key]) months[key] = { month: key, donated: 0, distributed: 0 };
      months[key].distributed += Number(d.quantity);
    });

    return Object.values(months).map((entry) => ({
      ...entry,
      balance: entry.donated - entry.distributed,
    }));
  }, []);

  const txRows = useMemo(() => {
    const donationsRows = mockDonations.map((d) => ({
      id: `D-${d.id}`,
      type: 'Donación',
      item: d.item_name,
      quantity: d.quantity,
      signed: `+${d.quantity}`,
      center: d.center_name,
      status: d.status,
      timestamp: d.created_at,
    }));

    const distributionRows = mockDistributions.map((d) => ({
      id: `T-${d.id}`,
      type: 'Distribución',
      item: d.item_name,
      quantity: d.quantity,
      signed: `-${d.quantity}`,
      center: d.center_name,
      status: d.status,
      timestamp: d.created_at,
    }));

    return [...donationsRows, ...distributionRows].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, []);

  const totals = monthly.reduce(
    (acc, row) => {
      acc.donated += row.donated;
      acc.distributed += row.distributed;
      return acc;
    },
    { donated: 0, distributed: 0 }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2"><History size={24} /> Historial de Transacciones</h1>
        <p className="text-slate-500 text-sm mt-1">Análisis temporal de movimientos (donaciones y distribuciones) usando datos frontend mock.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Total Donado</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{totals.donated}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Total Distribuido</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{totals.distributed}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Balance Neto</p>
          <p className="text-2xl font-bold text-indigo-700 mt-1 inline-flex items-center gap-2"><Scale size={20} /> {totals.donated - totals.distributed}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4">Donado vs Distribuido (Mensual)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D5DBDB" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="donated" name="Donado" fill="#E34E26" radius={[6, 6, 0, 0]} />
              <Bar dataKey="distributed" name="Distribuido" fill="#2E4053" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4">Balance Neto por Mes</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D5DBDB" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="balance" stroke="#1B2631" fill="#D5DBDB" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm overflow-x-auto">
        <h2 className="font-bold text-slate-800 mb-4">Registro Histórico</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 border-b border-slate-100">
              <th className="text-left py-2 pr-4">ID</th>
              <th className="text-left py-2 pr-4">Tipo</th>
              <th className="text-left py-2 pr-4">Ítem</th>
              <th className="text-left py-2 pr-4">Centro</th>
              <th className="text-right py-2 pr-4">Cantidad</th>
              <th className="text-left py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {txRows.map((tx) => (
              <tr key={tx.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="py-2 pr-4 text-slate-600">{tx.id}</td>
                <td className="py-2 pr-4 text-slate-700">{tx.type}</td>
                <td className="py-2 pr-4 text-slate-700">{tx.item}</td>
                <td className="py-2 pr-4 text-slate-600">{tx.center}</td>
                <td className={`py-2 pr-4 text-right font-semibold ${tx.type === 'Donación' ? 'text-emerald-700' : 'text-amber-700'}`}>{tx.signed}</td>
                <td className="py-2">
                  <span className="px-2 py-1 rounded-full text-xs font-medium uppercase bg-slate-100 text-slate-700">{tx.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
