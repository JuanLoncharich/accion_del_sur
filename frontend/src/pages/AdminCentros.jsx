import React, { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { ToastContext } from '../components/Layout';
import {
  Building2,
  Plus,
  Edit,
  Trash2,
  MapPin,
  CheckCircle2,
  XCircle,
  LoaderCircle,
  ChevronDown,
  ChevronUp,
  Shield,
  Link as LinkIcon,
} from 'lucide-react';

export default function AdminCentros() {
  const addToast = useContext(ToastContext);
  const [centers, setCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCenter, setEditingCenter] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    center_type: 'regional',
    latitude: '',
    longitude: '',
  });

  const fetchCenters = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/centers');
      setCenters(data.data || []);
    } catch (err) {
      addToast('Error al cargar centros', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCenters();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const isEdit = editingCenter !== null;

    try {
      if (isEdit) {
        await api.put(`/centers/${editingCenter.id}`, formData);
        addToast('Centro actualizado correctamente', 'success');
      } else {
        await api.post('/centers', formData);
        addToast('Centro creado correctamente', 'success');
      }
      setShowForm(false);
      setEditingCenter(null);
      setFormData({ name: '', center_type: 'regional', latitude: '', longitude: '' });
      fetchCenters();
    } catch (err) {
      addToast(err.response?.data?.error || 'Error al guardar centro', 'error');
    }
  };

  const handleEdit = (center) => {
    setEditingCenter(center);
    setFormData({
      name: center.name,
      center_type: center.center_type || 'regional',
      latitude: center.latitude,
      longitude: center.longitude,
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Estás seguro de eliminar este centro?')) return;

    try {
      await api.delete(`/centers/${id}`);
      addToast('Centro eliminado correctamente', 'success');
      fetchCenters();
    } catch (err) {
      addToast(err.response?.data?.error || 'Error al eliminar centro', 'error');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingCenter(null);
    setFormData({ name: '', center_type: 'regional', latitude: '', longitude: '' });
  };

  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData({
            ...formData,
            latitude: position.coords.latitude.toFixed(7),
            longitude: position.coords.longitude.toFixed(7),
          });
          addToast('Ubicación obtenida', 'success');
        },
        (error) => {
          addToast('No se pudo obtener la ubicación', 'error');
        }
      );
    } else {
      addToast('Geolocalización no soportada', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoaderCircle size={32} className="animate-spin text-blue-600" />
        <span className="ml-3 text-slate-600">Cargando centros...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2">
            <Building2 size={24} /> Gestión de Centros
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Administra los centros de distribución y sus contratos blockchain
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm flex items-center gap-2 shadow-md"
        >
          <Plus size={16} /> Nuevo Centro
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-800">
                {editingCenter ? 'Editar Centro' : 'Nuevo Centro'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2">
                  Nombre del Centro
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                  placeholder="Ej: Centro Norte Buenos Aires"
                />
              </div>

              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2">
                  Tipo de Centro
                </label>
                <select
                  value={formData.center_type}
                  onChange={(e) => setFormData({ ...formData, center_type: e.target.value })}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                >
                  <option value="acopio">Centro de Acopio</option>
                  <option value="regional">Centro Regional</option>
                  <option value="local">Centro Local</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 text-sm font-semibold mb-2">
                    Latitud
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                    placeholder="-34.6037"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 text-sm font-semibold mb-2">
                    Longitud
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                    placeholder="-58.3816"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={getLocation}
                className="w-full px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
              >
                <MapPin size={16} /> Usar mi ubicación actual
              </button>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={16} />
                  {editingCenter ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Centros List */}
      {centers.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <Building2 size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500">No hay centros registrados</p>
          <p className="text-sm text-slate-400 mt-1">Creá el primer centro para comenzar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {centers.map((center) => (
            <CenterCard
              key={center.id}
              center={center}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CenterCard({ center, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-indigo-600" />
            <div>
              <h3 className="font-bold text-slate-800">{center.name}</h3>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                center.is_active
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {center.is_active ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-slate-600">
            <MapPin size={14} />
            <span>{center.latitude}, {center.longitude}</span>
          </div>

          {center.blockchain_contract_id && (
            <div className="flex items-start gap-2 text-slate-600">
              <LinkIcon size={14} className="mt-0.5 shrink-0" />
              <span className="text-xs break-all font-mono">
                {center.blockchain_contract_id.substring(0, 20)}...
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-3 flex items-center justify-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          {expanded ? (
            <>
              <ChevronUp size={16} /> Ocultar detalles
            </>
          ) : (
            <>
              <ChevronDown size={16} /> Ver detalles blockchain
            </>
          )}
        </button>
      </div>

      {expanded && (
        <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 space-y-2">
          <div className="text-sm">
            <p className="text-slate-500 text-xs uppercase font-semibold mb-1">Contract ID</p>
            <p className="font-mono text-xs break-all">{center.blockchain_contract_id || 'No desplegado'}</p>
          </div>

          <div className="text-sm">
            <p className="text-slate-500 text-xs uppercase font-semibold mb-1">Deploy TX</p>
            <p className="font-mono text-xs break-all">{center.blockchain_deploy_tx || 'N/A'}</p>
          </div>

          <div className="text-sm">
            <p className="text-slate-500 text-xs uppercase font-semibold mb-1">Init TX</p>
            <p className="font-mono text-xs break-all">{center.blockchain_init_tx || 'N/A'}</p>
          </div>

          <div className="text-sm">
            <p className="text-slate-500 text-xs uppercase font-semibold mb-1">Geo Hash</p>
            <p className="font-mono text-xs break-all">{center.geo_hash || 'N/A'}</p>
          </div>

          {center.blockchain_contract_id && (
            <div className="flex items-center gap-1 text-green-600 text-sm">
              <Shield size={14} />
              <span className="font-medium">Centro configurado en blockchain</span>
            </div>
          )}
        </div>
      )}

      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex gap-2">
        <button
          onClick={() => onEdit(center)}
          className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-1"
        >
          <Edit size={14} /> Editar
        </button>
        <button
          onClick={() => onDelete(center.id)}
          className="flex-1 px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium text-sm flex items-center justify-center gap-1"
        >
          <Trash2 size={14} /> Eliminar
        </button>
      </div>
    </div>
  );
}
