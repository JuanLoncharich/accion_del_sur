import React, { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { ToastContext } from '../components/Layout';
import {
  BadgeCheck,
  BadgeX,
  Plus,
  Tags,
  Trash2,
} from 'lucide-react';
import { getCategoryIcon } from '../utils/icons';

const ATTR_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Fecha' },
  { value: 'select', label: 'Selección' },
];

export default function AdminCategorias() {
  const addToast = useContext(ToastContext);
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', description: '' });
  const [showNewAttr, setShowNewAttr] = useState(false);
  const [newAttr, setNewAttr] = useState({ attribute_name: '', attribute_type: 'text', is_required: false, options: '' });
  const [editingAttr, setEditingAttr] = useState(null);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/categories', { params: { active: 'false' } });
      setCategories(data);
    } catch {
      addToast('Error al cargar categorías', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCategories(); }, []);

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    try {
      await api.post('/categories', newCat);
      addToast('Categoría creada', 'success');
      setNewCat({ name: '', description: '' });
      setShowNewCat(false);
      fetchCategories();
    } catch (err) {
      addToast(err.response?.data?.error || 'Error al crear categoría', 'error');
    }
  };

  const handleToggleCategory = async (cat) => {
    try {
      if (cat.is_active) {
        await api.delete(`/categories/${cat.id}`);
        addToast('Categoría desactivada', 'success');
      } else {
        await api.put(`/categories/${cat.id}`, { is_active: true });
        addToast('Categoría activada', 'success');
      }
      fetchCategories();
    } catch {
      addToast('Error', 'error');
    }
  };

  const handleAddAttribute = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...newAttr,
        options: newAttr.attribute_type === 'select' && newAttr.options
          ? newAttr.options.split(',').map((o) => o.trim()).filter(Boolean)
          : null,
        display_order: (selected.attributes?.length || 0) + 1,
      };
      await api.post(`/categories/${selected.id}/attributes`, payload);
      addToast('Atributo agregado', 'success');
      setNewAttr({ attribute_name: '', attribute_type: 'text', is_required: false, options: '' });
      setShowNewAttr(false);
      const { data } = await api.get('/categories', { params: { active: 'false' } });
      setCategories(data);
      setSelected(data.find((c) => c.id === selected.id));
    } catch {
      addToast('Error al agregar atributo', 'error');
    }
  };

  const handleDeleteAttr = async (attrId) => {
    if (!confirm('¿Eliminar este atributo?')) return;
    try {
      await api.delete(`/categories/${selected.id}/attributes/${attrId}`);
      addToast('Atributo eliminado', 'success');
      const { data } = await api.get('/categories', { params: { active: 'false' } });
      setCategories(data);
      setSelected(data.find((c) => c.id === selected.id));
    } catch {
      addToast('Error al eliminar atributo', 'error');
    }
  };

  const handleReorderAttr = async (attr, direction) => {
    const attrs = [...(selected.attributes || [])].sort((a, b) => a.display_order - b.display_order);
    const idx = attrs.findIndex((a) => a.id === attr.id);
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === attrs.length - 1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const [currentOrder, swapOrder] = [attrs[idx].display_order, attrs[swapIdx].display_order];
    try {
      await Promise.all([
        api.put(`/categories/${selected.id}/attributes/${attrs[idx].id}`, { display_order: swapOrder }),
        api.put(`/categories/${selected.id}/attributes/${attrs[swapIdx].id}`, { display_order: currentOrder }),
      ]);
      const { data } = await api.get('/categories', { params: { active: 'false' } });
      setCategories(data);
      setSelected(data.find((c) => c.id === selected.id));
    } catch {
      addToast('Error al reordenar', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2"><Tags size={24} /> Gestión de Categorías</h1>
          <p className="text-slate-500 text-sm">Administrá las categorías y sus atributos</p>
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
            <input
              type="text"
              value={newCat.name}
              onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
              placeholder="Nombre de la categoría"
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
              required
            />
            <textarea
              value={newCat.description}
              onChange={(e) => setNewCat({ ...newCat, description: e.target.value })}
              placeholder="Descripción (opcional)"
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 h-20 resize-none"
            />
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category list */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h2 className="font-bold text-slate-700 text-sm uppercase mb-3 px-2">Categorías</h2>
          {loading ? (
            <p className="text-center text-slate-400 py-4">Cargando...</p>
          ) : (
            <div className="space-y-1">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2">
                  <button
                    onClick={() => setSelected(cat)}
                    className={`flex-1 text-left px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                      selected?.id === cat.id
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'hover:bg-slate-50 text-slate-700'
                    } ${!cat.is_active ? 'opacity-50' : ''}`}
                  >
                    <span className="mr-2 inline-flex align-middle">
                      {React.createElement(getCategoryIcon(cat.name), { size: 16 })}
                    </span>
                    {cat.name}
                    <span className="ml-2 text-xs text-slate-400">({cat.attributes?.length || 0} attrs)</span>
                  </button>
                  <button
                    onClick={() => handleToggleCategory(cat)}
                    className={`text-xs px-2 py-1 rounded-lg ${cat.is_active ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-green-100 text-green-600 hover:bg-green-200'}`}
                    title={cat.is_active ? 'Desactivar' : 'Activar'}
                  >
                    {cat.is_active ? <BadgeX size={14} /> : <BadgeCheck size={14} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Attributes */}
        {selected && (
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-800">
                <span className="inline-flex items-center gap-2">
                  {React.createElement(getCategoryIcon(selected.name), { size: 18 })}
                  {selected.name} — Atributos
                </span>
              </h2>
              <button
                onClick={() => setShowNewAttr(true)}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm inline-flex items-center gap-2"
              >
                <Plus size={14} /> Agregar
              </button>
            </div>

            {showNewAttr && (
              <form onSubmit={handleAddAttribute} className="bg-slate-50 rounded-xl p-4 mb-4 space-y-3">
                <input
                  type="text"
                  value={newAttr.attribute_name}
                  onChange={(e) => setNewAttr({ ...newAttr, attribute_name: e.target.value })}
                  placeholder="Nombre del atributo"
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
                <select
                  value={newAttr.attribute_type}
                  onChange={(e) => setNewAttr({ ...newAttr, attribute_type: e.target.value })}
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                >
                  {ATTR_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {newAttr.attribute_type === 'select' && (
                  <input
                    type="text"
                    value={newAttr.options}
                    onChange={(e) => setNewAttr({ ...newAttr, options: e.target.value })}
                    placeholder="Opciones separadas por coma (ej: Rojo, Verde, Azul)"
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                )}
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={newAttr.is_required}
                    onChange={(e) => setNewAttr({ ...newAttr, is_required: e.target.checked })}
                    className="w-4 h-4"
                  />
                  Campo obligatorio
                </label>
                <div className="flex gap-2">
                  <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold inline-flex items-center gap-2"><Plus size={14} /> Agregar</button>
                  <button type="button" onClick={() => setShowNewAttr(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold">Cancelar</button>
                </div>
              </form>
            )}

            {(selected.attributes || []).length === 0 ? (
              <p className="text-center text-slate-400 py-6">No hay atributos configurados</p>
            ) : (
              <div className="space-y-2">
                {[...(selected.attributes || [])].sort((a, b) => a.display_order - b.display_order).map((attr, idx, arr) => (
                  <div key={attr.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <div className="flex flex-col gap-1">
                      <button onClick={() => handleReorderAttr(attr, 'up')} disabled={idx === 0} className="text-xs disabled:opacity-30 hover:bg-slate-200 rounded px-1">▲</button>
                      <button onClick={() => handleReorderAttr(attr, 'down')} disabled={idx === arr.length - 1} className="text-xs disabled:opacity-30 hover:bg-slate-200 rounded px-1">▼</button>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-800 text-sm">{attr.attribute_name}</p>
                      <p className="text-xs text-slate-400">
                        Tipo: {ATTR_TYPES.find((t) => t.value === attr.attribute_type)?.label}
                        {attr.is_required && <span className="ml-2 text-red-500">● Requerido</span>}
                        {attr.options && <span className="ml-2">· {attr.options.length} opciones</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteAttr(attr.id)}
                      className="text-red-400 hover:text-red-600 text-sm px-2 py-1 rounded hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Preview */}
            {(selected.attributes || []).length > 0 && (
              <div className="mt-6 p-4 bg-indigo-50 rounded-xl">
                <p className="text-xs font-semibold text-indigo-700 uppercase mb-3">Vista previa del formulario</p>
                <div className="space-y-3">
                  {[...(selected.attributes || [])].sort((a, b) => a.display_order - b.display_order).map((attr) => (
                    <div key={attr.id}>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        {attr.attribute_name}
                        {attr.is_required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {attr.attribute_type === 'select' ? (
                        <select disabled className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white opacity-60">
                          <option>Seleccioná una opción...</option>
                          {(attr.options || []).map((o) => <option key={o}>{o}</option>)}
                        </select>
                      ) : attr.attribute_type === 'date' ? (
                        <input type="date" disabled className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white opacity-60" />
                      ) : attr.attribute_type === 'number' ? (
                        <input type="number" disabled placeholder={attr.attribute_name} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white opacity-60" />
                      ) : (
                        <input type="text" disabled placeholder={attr.attribute_name} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white opacity-60" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
