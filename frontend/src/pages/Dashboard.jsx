import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import api from '../services/api';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Clock3,
  Handshake,
  Package,
  PieChart as PieChartIcon,
  Tags,
  TrendingUp,
} from 'lucide-react';

const COLORS = ['#4f46e5', '#0f766e', '#475569', '#7c3aed', '#0891b2', '#334155'];

const StatCard = ({ icon, label, value, color }) => (
  <div className={`bg-white rounded-2xl p-6 shadow-sm border-l-4 ${color}`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-slate-500 text-sm font-medium">{label}</p>
        <p className="text-3xl font-bold text-slate-800 mt-1">{value}</p>
      </div>
      <div className="text-slate-500">
        {icon}
      </div>
    </div>
  </div>
);

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard/summary')
      .then((res) => setData(res.data))
      .catch(() => setError('Error al cargar el dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-slate-500">
          <div className="flex justify-center mb-4"><Clock3 size={40} className="text-slate-400" /></div>
          <p className="text-lg">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-600">
        <div className="flex justify-center mb-2"><AlertTriangle size={32} /></div>
        <p>{error}</p>
      </div>
    );
  }

  const { summary, stockByCategory, weeklyDonations, recentDonations, recentDistributions } = data;

  const weeklyChartData = weeklyDonations.map((w) => ({
    semana: new Date(w.week_start).toLocaleDateString('es-AR', { month: 'short', day: 'numeric' }),
    donaciones: parseInt(w.count),
    cantidad: parseInt(w.total_quantity),
  }));

  const stockPieData = stockByCategory.map((s) => ({
    name: s.category,
    value: parseInt(s.total),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Resumen del sistema de donaciones</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={<Package size={34} />} label="Total Donaciones" value={summary.totalDonations} color="border-indigo-500" />
        <StatCard icon={<Boxes size={34} />} label="Ítems en Stock" value={summary.totalItemsInStock} color="border-teal-600" />
        <StatCard icon={<Handshake size={34} />} label="Distribuciones" value={summary.totalDistributions} color="border-slate-500" />
        <StatCard icon={<Tags size={34} />} label="Categorías Activas" value={summary.activeCategories} color="border-violet-500" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock por categoría */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4 inline-flex items-center gap-2"><BarChart3 size={18} /> Stock por Categoría</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stockByCategory.map(s => ({ name: s.category, total: parseInt(s.total) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="total" name="Unidades" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Donaciones semanales */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4 inline-flex items-center gap-2"><TrendingUp size={18} /> Donaciones (últimas 8 semanas)</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={weeklyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="donaciones" name="Lotes" stroke="#4f46e5" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="cantidad" name="Unidades" stroke="#0f766e" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pie chart */}
      {stockPieData.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4 inline-flex items-center gap-2"><PieChartIcon size={18} /> Distribución del Inventario</h2>
          <div className="flex flex-col md:flex-row items-center gap-6">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={stockPieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {stockPieData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 justify-center md:justify-start">
              {stockPieData.map((item, index) => (
                <div key={item.name} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-slate-600">{item.name}: <strong>{item.value}</strong></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent donations */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4 inline-flex items-center gap-2"><Package size={18} /> Últimas Donaciones</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 border-b border-slate-100">
                  <th className="text-left py-2 pr-4">Fecha</th>
                  <th className="text-left py-2 pr-4">Ítem</th>
                  <th className="text-right py-2">Cant.</th>
                </tr>
              </thead>
              <tbody>
                {recentDonations.length === 0 ? (
                  <tr><td colSpan={3} className="py-4 text-center text-slate-400">Sin donaciones aún</td></tr>
                ) : recentDonations.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">
                      {new Date(d.created_at).toLocaleDateString('es-AR')}
                    </td>
                    <td className="py-2 pr-4 text-slate-700 max-w-xs truncate">
                      <span className="text-xs text-slate-400 block">{d.category_name}</span>
                      {d.item_name}
                    </td>
                    <td className="py-2 text-right font-semibold text-green-600">+{d.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent distributions */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4 inline-flex items-center gap-2"><Handshake size={18} /> Últimas Distribuciones</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 border-b border-slate-100">
                  <th className="text-left py-2 pr-4">Fecha</th>
                  <th className="text-left py-2 pr-4">Ítem</th>
                  <th className="text-right py-2">Cant.</th>
                </tr>
              </thead>
              <tbody>
                {recentDistributions.length === 0 ? (
                  <tr><td colSpan={3} className="py-4 text-center text-slate-400">Sin distribuciones aún</td></tr>
                ) : recentDistributions.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">
                      {new Date(d.created_at).toLocaleDateString('es-AR')}
                    </td>
                    <td className="py-2 pr-4 text-slate-700 max-w-xs truncate">
                      <span className="text-xs text-slate-400 block">{d.category_name}</span>
                      {d.item_name}
                    </td>
                    <td className="py-2 text-right font-semibold text-orange-600">-{d.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
