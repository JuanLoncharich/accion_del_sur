import React, { useState, useEffect, useMemo, useContext } from 'react';
import api from '../services/api';
import { ToastContext } from '../components/Layout';
import { BadgeCheck, ChevronRight, Plus, Tags, Trash2 } from 'lucide-react';
import { getCategoryIcon } from '../utils/icons';

const buildTree = (flat) => {
  const nodes = (flat || []).map((c) => ({ ...c, children: [] }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots = [];
  nodes.forEach((n) => {
    if (n.parent_category_id && byId.has(n.parent_category_id)) byId.get(n.parent_category_id).children.push(n);
    else roots.push(n);
  });
  const sortRec = (arr) => {
    arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
};

const TreeRow = ({ node, depth, onDelete }) => (
  <div>
    <div
      className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-slate-50"
      style={{ paddingLeft: `${12 + depth * 20}px` }}
    >
      <span className="inline-flex align-middle text-slate-500">
        {React.createElement(getCategoryIcon(node.name), { size: 16 })}
      </span>
      <span className="flex-1 text-sm font-medium text-slate-700">{node.name}</span>
      {(node.children || []).length > 0 && (
        <span className="text-xs text-slate-400">{node.children.length} subtipos</span>
      )}
      <button
        onClick={() => onDelete(node)}
        className="text-red-400 hover:text-red-600 text-sm px-2 py-1 rounded hover:bg-red-50"
        title="Eliminar"
      >
        <Trash2 size={14} />
      </button>
    </div>
    {(node.children || []).map((child) => (
      <TreeRow key={child.id} node={child} depth={depth + 1} onDelete={onDelete} />
    ))}
  </div>
);

export default function AdminCategorias() {
  const addToast = useContext(ToastContext);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', parent_category_id: '' });

  const tree = useMemo(() => buildTree(categories), [categories]);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/categories');
      setCategories(data || []);
    } catch {
      addToast('Error al cargar categorías', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCategories(); }, []);

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCat.name.trim()) return;
    try {
      await api.post('/categories', {
        name: newCat.name.trim(),
        parent_category_id: newCat.parent_category_id || null,
      });
      addToast('Categoría creada', 'success');
      setNewCat({ name: '', parent_category_id: '' });
      setShowNewCat(false);
      fetchCategories();
    } catch (err) {
      addToast(err.response?.data?.error || 'Error al crear categoría', 'error');
    }
  };

  const handleDelete = async (cat) => {
    if (!confirm(`¿Eliminar la categoría "${cat.name}"?${(cat.children || []).length ? ' También se eliminarán sus subtipos.' : ''}`)) return;
    try {
      await api.delete(`/categories/${cat.id}`);
      addToast('Categoría eliminada', 'success');
      fetchCategories();
    } catch (err) {
      addToast(err.response?.data?.error || 'Error al eliminar', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2"><Tags size={24} /> Gestión de Categorías</h1>
          <p className="text-slate-500 text-sm">Administrá la jerarquía de categorías y subtipos</p>
        </div>
        <button
          onClick={() => setShowNewCat(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm shadow-md inline-flex items-center gap-2"
        >
          <Plus size={16} /> Nueva Categoría
        </button>
      </div>

      {/* New category form */}
      {showNewCat && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border-2 border-indigo-200">
          <h2 className="font-bold text-slate-800 mb-4">Nueva Categoría</h2>
          <form onSubmit={handleCreateCategory} className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre</label>
              <input
                type="text"
                value={newCat.name}
                onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                placeholder="Ej: Calzado, Abrigo, Bebidas..."
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Categoría padre (opcional)</label>
              <select
                value={newCat.parent_category_id}
                onChange={(e) => setNewCat({ ...newCat, parent_category_id: e.target.value })}
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
              >
                <option value="">— Ninguna (categoría raíz) —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1 inline-flex items-center gap-1">
                <ChevronRight size={12} /> Si elegís un padre, esta será un subtipo (ej: Ropa › Abrigo).
              </p>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold inline-flex items-center gap-2">
                <BadgeCheck size={16} /> Crear
              </button>
              <button type="button" onClick={() => setShowNewCat(false)} className="px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-semibold">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tree */}
      <div className="bg-white rounded-2xl shadow-sm p-4">
        <h2 className="font-bold text-slate-700 text-sm uppercase mb-3 px-2">Jerarquía</h2>
        {loading ? (
          <p className="text-center text-slate-400 py-4">Cargando...</p>
        ) : tree.length === 0 ? (
          <p className="text-center text-slate-400 py-4">No hay categorías</p>
        ) : (
          <div className="space-y-0.5">
            {tree.map((node) => (
              <TreeRow key={node.id} node={node} depth={0} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
