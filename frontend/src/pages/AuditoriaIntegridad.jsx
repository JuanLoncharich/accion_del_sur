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
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import { ShieldCheck, TriangleAlert } from 'lucide-react';
import { mockAuditChecks, mockDistributions } from '../utils/mockBlockchainData';

const scoreFromCheck = (check) => {
  const keys = [
    'recipient_commitment_matches',
    'signature_hash_matches',
    'receipt_hash_matches',
    'blockchain_hashes_match',
  ];
  const passed = keys.reduce((acc, key) => acc + (check[key] ? 1 : 0), 0);
  return Math.round((passed / keys.length) * 100);
};

export default function AuditoriaIntegridad() {
  const checksByType = useMemo(() => {
    const keys = [
      { key: 'recipient_commitment_matches', label: 'Commitment' },
      { key: 'signature_hash_matches', label: 'Firma' },
      { key: 'receipt_hash_matches', label: 'Receipt' },
      { key: 'blockchain_hashes_match', label: 'Blockchain' },
    ];

    return keys.map(({ key, label }) => {
      const pass = mockAuditChecks.filter((audit) => audit[key]).length;
      const fail = mockAuditChecks.length - pass;
      return { check: label, pass, fail };
    });
  }, []);

  const geoIntegrity = useMemo(() => {
    return mockDistributions
      .map((dist) => {
        const audit = mockAuditChecks.find((a) => a.distribution_id === dist.id);
        if (!audit || !dist.center_latitude || !dist.center_longitude) return null;
        return {
          center: dist.center_name,
          latitude: Number(dist.center_latitude),
          longitude: Number(dist.center_longitude),
          score: scoreFromCheck(audit),
          distribution_id: dist.id,
        };
      })
      .filter(Boolean);
  }, []);

  const detailedRows = useMemo(() => {
    return mockAuditChecks
      .map((audit) => {
        const dist = mockDistributions.find((d) => d.id === audit.distribution_id);
        const score = scoreFromCheck(audit);
        return {
          ...audit,
          center_name: dist?.center_name || 'Sin centro',
          status: dist?.status || 'unknown',
          score,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, []);

  const avgScore = Math.round(detailedRows.reduce((acc, row) => acc + row.score, 0) / detailedRows.length || 0);
  const risky = detailedRows.filter((row) => row.score < 75).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2"><ShieldCheck size={24} /> Auditoría e Integridad</h1>
        <p className="text-slate-500 text-sm mt-1">Visualización modular de verificaciones internas/públicas según el flujo de auditoría del backend.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Controles Auditados</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{detailedRows.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Score Promedio</p>
          <p className="text-2xl font-bold text-indigo-700 mt-1">{avgScore}%</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Casos Riesgo</p>
          <p className="text-2xl font-bold text-rose-700 mt-1 inline-flex items-center gap-2"><TriangleAlert size={20} /> {risky}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4">Resultado por Tipo de Verificación</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={checksByType}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D5DBDB" />
              <XAxis dataKey="check" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="pass" name="Pasa" stackId="a" fill="#2E4053" />
              <Bar dataKey="fail" name="Falla" stackId="a" fill="#E34E26" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4">Integridad por Centro (geo)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#D5DBDB" />
              <XAxis type="number" dataKey="longitude" name="Longitud" tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
              <YAxis type="number" dataKey="latitude" name="Latitud" tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
              <ZAxis type="number" dataKey="score" range={[80, 260]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(value, name) => [value, name === 'score' ? 'Score Integridad' : name]} />
              <Scatter data={geoIntegrity} fill="#E34E26" name="Centros" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm overflow-x-auto">
        <h2 className="font-bold text-slate-800 mb-4">Detalle de Auditorías</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 border-b border-slate-100">
              <th className="text-left py-2 pr-4">Distribución</th>
              <th className="text-left py-2 pr-4">Centro</th>
              <th className="text-left py-2 pr-4">Estado</th>
              <th className="text-left py-2 pr-4">Fecha</th>
              <th className="text-right py-2">Score</th>
            </tr>
          </thead>
          <tbody>
            {detailedRows.map((row) => (
              <tr key={row.distribution_id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="py-2 pr-4 text-slate-700">#{row.distribution_id}</td>
                <td className="py-2 pr-4 text-slate-600">{row.center_name}</td>
                <td className="py-2 pr-4">
                  <span className="px-2 py-1 rounded-full text-xs font-medium uppercase bg-slate-100 text-slate-700">{row.status}</span>
                </td>
                <td className="py-2 pr-4 text-slate-600">{new Date(row.timestamp).toLocaleString('es-AR')}</td>
                <td className={`py-2 text-right font-semibold ${row.score < 75 ? 'text-rose-700' : row.score < 100 ? 'text-amber-700' : 'text-emerald-700'}`}>{row.score}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
