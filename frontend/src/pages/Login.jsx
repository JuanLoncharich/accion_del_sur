import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AlertTriangle, CircleCheckBig, LoaderCircle, LockKeyhole, ShieldCheck, User } from 'lucide-react';

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const result = await login(form.username, form.password);
    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-600 rounded-2xl mb-4 shadow-xl text-white">
            <ShieldCheck size={40} />
          </div>
          <h1 className="text-white text-3xl font-bold">Acción del Sur</h1>
          <p className="text-slate-300 mt-1">Sistema de Gestión de Donaciones</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-slate-800 text-xl font-bold mb-6 text-center">Iniciar Sesión</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
              <span className="inline-flex items-center gap-2">
                <AlertTriangle size={16} /> {error}
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-700 text-sm font-semibold mb-2">
                <span className="inline-flex items-center gap-2"><User size={16} /> Usuario</span>
              </label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="Ingresá tu usuario"
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-slate-700 text-sm font-semibold mb-2">
                <span className="inline-flex items-center gap-2"><LockKeyhole size={16} /> Contraseña</span>
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Ingresá tu contraseña"
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-3 px-6 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg text-lg mt-2"
            >
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2"><LoaderCircle size={18} className="animate-spin" /> Ingresando...</span>
              ) : (
                <span className="inline-flex items-center justify-center gap-2"><CircleCheckBig size={18} /> Ingresar</span>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-sm mt-6">
          Centro de Crisis — ONG Acción del Sur
        </p>
      </div>
    </div>
  );
}
