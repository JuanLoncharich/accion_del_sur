import React, { useEffect, useMemo, useState } from 'react';
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
import { History, Scale, LoaderCircle } from 'lucide-react';
import api from '../services/api';

const monthKey = (dateValue) => new Date(dateValue).toLocaleDateString('es-AR', { month: 'short' });

export default function HistorialTransacciones() {
  const [loading, setLoading] = useState(true);
  const [donations, setDonations] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [transfers, setTransfers] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [donationsRes, distributionsRes, transfersRes] = await Promise.all([
          api.get('/donations', { params: { limit: 200 } }),
          api.get('/distributions', { params: { limit: 200 } }),
          api.get('/transfers', { params: { limit: 200 } }),
        ]);

        setDonations(donationsRes.data?.data || []);
        setDistributions(distributionsRes.data?.data || []);
        setTransfers(transfersRes.data?.data || []);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const monthly = useMemo(() => {
    const months = {};

    donations.forEach((d) => {
      const key = monthKey(d.created_at);
      if (!months[key]) months[key] = { month: key, donated: 0, distributed: 0, transferred: 0 };
      months[key].donated += Number(d.quantity || 0);
    });

    distributions.forEach((d) => {
      const key = monthKey(d.created_at);
      if (!months[key]) months[key] = { month: key, donated: 0, distributed: 0, transferred: 0 };
      months[key].distributed += Number(d.quantity || 0);
    });

    transfers.forEach((t) => {
      const key = monthKey(t.created_at);
      if (!months[key]) months[key] = { month: key, donated: 0, distributed: 0, transferred: 0 };
      months[key].transferred += Number(t.quantity || 0);
    });

    return Object.values(months).map((entry) => ({
      ...entry,
      balance: entry.donated - entry.distributed,
    }));
  }, [donations, distributions, transfers]);

  const txRows = useMemo(() => {
    const donationRows = donations.map((d) => ({
      id: `D-${d.id}`,
      type: 'Donación',
      item: d.item?.name || '-',
      signed: `+${d.quantity}`,
      center: d.center?.name || d.center_name || '-',
      status: d.status || '-',
      timestamp: d.created_at,
    }));

    const distributionRows = distributions.map((d) => ({
      id: `DS-${d.id}`,
      type: 'Distribución',
      item: d.item?.name || '-',
      signed: `-${d.quantity}`,
      center: d.center_name || '-',
      status: d.status || '-',
      timestamp: d.created_at,
    }));

    const transferRows = transfers.map((t) => ({
      id: `TX-${t.id}`,
      type: 'Transferencia',
      item: t.item?.name || '-',
      signed: `${t.quantity}`,
      center: `${t.fromCenter?.name || '-'} -> ${t.toCenter?.name || '-'}`,
      status: t.status || '-',
      timestamp: t.created_at,
    }));

    return [...donationRows, ...distributionRows, ...transferRows]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [donations, distributions, transfers]);

  const totals = monthly.reduce(
    (acc, row) => {
      acc.donated += row.donated;
      acc.distributed += row.distributed;
      acc.transferred += row.transferred;
      return acc;
    },
    { donated: 0, distributed: 0, transferred: 0 }
  );

  if (loading) {
    return (
      <div className="py-16 flex items-center justify-center text-slate-500">
        <span className="inline-flex items-center gap-2"><LoaderCircle size={18} className="animate-spin" /> Cargando historial real...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2"><History size={24} /> Historial de Transacciones</h1>
        <p className="text-slate-500 text-sm mt-1">Datos reales de donaciones, distribuciones y transferencias entre centros.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Total Donado</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{totals.donated}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Total Distribuido</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{totals.distributed}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Total Transferido</p>
          <p className="text-2xl font-bold text-indigo-700 mt-1">{totals.transferred}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Balance Neto</p>
          <p className="text-2xl font-bold text-slate-700 mt-1 inline-flex items-center gap-2"><Scale size={20} /> {totals.donated - totals.distributed}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4">Movimiento mensual</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D5DBDB" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="donated" name="Donado" fill="#E34E26" radius={[6, 6, 0, 0]} />
              <Bar dataKey="distributed" name="Distribuido" fill="#2E4053" radius={[6, 6, 0, 0]} />
              <Bar dataKey="transferred" name="Transferido" fill="#0F766E" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4">Balance Neto por mes</h2>
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
        <h2 className="font-bold text-slate-800 mb-4">Registro histórico</h2>
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
                <td className={`py-2 pr-4 text-right font-semibold ${tx.type === 'Donación' ? 'text-emerald-700' : tx.type === 'Distribución' ? 'text-amber-700' : 'text-indigo-700'}`}>
                  {tx.signed}
                </td>
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
