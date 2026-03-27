import React, { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { ToastContext } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import {
  CheckCircle2,
  Clock3,
  Crown,
  Pencil,
  Plus,
  Shield,
  Trash2,
  UserCog,
  Wrench,
} from 'lucide-react';

export default function AdminUsuarios() {
  const addToast = useContext(ToastContext);
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'logistica' });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/users');
      setUsers(data);
    } catch {
      addToast('Error al cargar usuarios', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleOpenCreate = () => {
    setEditingUser(null);
    setForm({ username: '', email: '', password: '', role: 'logistica' });
    setShowForm(true);
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setForm({ username: user.username, email: user.email, password: '', role: user.role });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form };
      if (editingUser && !payload.password) delete payload.password;

      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, payload);
        addToast('Usuario actualizado', 'success');
      } else {
        await api.post('/users', payload);
        addToast('Usuario creado', 'success');
      }

      setShowForm(false);
      fetchUsers();
    } catch (err) {
      addToast(err.response?.data?.error || 'Error al guardar usuario', 'error');
    }
  };

  const handleDelete = async (user) => {
    if (!confirm(`¿Eliminar el usuario "${user.username}"?`)) return;
    try {
      await api.delete(`/users/${user.id}`);
      addToast('Usuario eliminado', 'success');
      fetchUsers();
    } catch (err) {
      addToast(err.response?.data?.error || 'Error al eliminar', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2"><UserCog size={24} /> Gestión de Usuarios</h1>
          <p className="text-slate-500 text-sm">{users.length} usuarios registrados</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm shadow-md inline-flex items-center gap-2"
        >
          <Plus size={16} /> Nuevo Usuario
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="font-bold text-slate-800 text-lg mb-4">
              <span className="inline-flex items-center gap-2">
                {editingUser ? <Pencil size={18} /> : <Plus size={18} />}
                {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
              </span>
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Usuario</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Contraseña {editingUser && <span className="text-slate-400 font-normal">(dejar en blanco para no cambiar)</span>}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                  required={!editingUser}
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Rol</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                >
                  <option value="logistica">Logística</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl inline-flex items-center justify-center gap-2">
                  <CheckCircle2 size={18} /> {editingUser ? 'Actualizar' : 'Crear Usuario'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users list */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400">
            <div className="flex justify-center mb-2"><Clock3 size={32} /></div>
            <p>Cargando...</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Usuario</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Email</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Rol</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden lg:table-cell">Creado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                        {user.username[0].toUpperCase()}
                      </div>
                      <span className="font-semibold text-slate-800">{user.username}</span>
                      {user.id === currentUser.id && (
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Vos</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-600 hidden md:table-cell">{user.email}</td>
                  <td className="px-4 py-4 text-center">
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                      user.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <span className="inline-flex items-center gap-1">
                        {user.role === 'admin' ? <Crown size={13} /> : <Wrench size={13} />}
                        {user.role === 'admin' ? 'Admin' : 'Logística'}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-400 hidden lg:table-cell">
                    {new Date(user.created_at).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => handleOpenEdit(user)}
                        className="text-blue-500 hover:text-blue-700 text-sm px-3 py-1.5 rounded-lg hover:bg-blue-50 font-medium"
                      >
                        <span className="inline-flex items-center gap-1"><Pencil size={13} /> Editar</span>
                      </button>
                      {user.id !== currentUser.id && (
                        <button
                          onClick={() => handleDelete(user)}
                          className="text-red-500 hover:text-red-700 text-sm px-3 py-1.5 rounded-lg hover:bg-red-50 font-medium"
                        >
                          <span className="inline-flex items-center gap-1"><Trash2 size={13} /></span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
