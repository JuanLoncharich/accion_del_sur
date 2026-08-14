import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { ToastContext } from '../components/Layout';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Image,
  LoaderCircle,
  Minus,
  Package,
  PencilLine,
  Plus,
  Save,
} from 'lucide-react';
import { getCategoryIcon } from '../utils/icons';

const STEPS = ['Categoría', 'Cantidad', 'Confirmar'];

// Construye un árbol (N niveles) a partir de la lista plana que devuelve /categories.
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

export default function NuevaDonacion() {
  const addToast = useContext(ToastContext);
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState([]);
  const [centers, setCenters] = useState([]);
  const [donors, setDonors] = useState([]);
  const [categoryPath, setCategoryPath] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [selectedCenterId, setSelectedCenterId] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [donorMode, setDonorMode] = useState('existing'); // 'existing' | 'new'
  const [selectedDonorId, setSelectedDonorId] = useState('');
  const [newDonor, setNewDonor] = useState({ name: '', contact: '', city: '' });
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);

  const categoryTree = useMemo(() => buildTree(categories), [categories]);
  const currentLevel = categoryPath.length === 0 ? categoryTree : (categoryPath[categoryPath.length - 1].children || []);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [categoriesRes, centersRes, donorsRes] = await Promise.all([
          api.get('/categories'),
          api.get('/centers'),
          api.get('/donors', { params: { limit: 200 } }),
        ]);
        setCategories(categoriesRes.data || []);
        setCenters((centersRes.data?.data || []).filter((c) => c.is_active));
        setDonors(donorsRes.data?.data || []);
      } catch {
        addToast('No se pudieron cargar categorías, centros o donantes', 'error');
      }
    };
    loadInitialData();
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const pickCategory = (node) => {
    if ((node.children || []).length > 0) {
      setCategoryPath([...categoryPath, node]);
    } else {
      setSelectedCategory(node);
      setStep(1);
    }
  };

  const validateStep1 = () => {
    if (!itemName.trim()) {
      addToast('Ingresá el nombre/descripción del ítem', 'error');
      return false;
    }
    if (!selectedCenterId) {
      addToast('Seleccioná un centro receptor', 'error');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!selectedCategory) { addToast('Seleccioná una categoría', 'error'); return; }
    if (!selectedCenterId) { addToast('Seleccioná un centro receptor', 'error'); return; }

    let donorContact = null;
    let donorName = null;
    let donorCity = null;
    if (!anonymous) {
      if (donorMode === 'existing') {
        const d = donors.find((x) => String(x.id) === String(selectedDonorId));
        if (!d) { addToast('Seleccioná un donante o marcá "Donación anónima"', 'error'); return; }
        donorContact = d.contact;
        donorName = d.name;
        donorCity = d.city;
      } else {
        if (!newDonor.contact.trim()) { addToast('Ingresá el contacto del nuevo donante', 'error'); return; }
        donorContact = newDonor.contact.trim();
        donorName = newDonor.name.trim() || newDonor.contact.trim();
        donorCity = newDonor.city.trim() || 'Sin especificar';
      }
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('category_id', selectedCategory.id);
      formData.append('name', itemName.trim());
      formData.append('quantity', quantity);
      formData.append('notes', notes);
      formData.append('center_id', selectedCenterId);
      if (donorContact) {
        formData.append('contact', donorContact);
        formData.append('donor_name', donorName);
        formData.append('city', donorCity);
      }
      if (image) formData.append('image', image);

      await api.post('/donations', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      addToast('¡Donación registrada exitosamente!', 'success');
      navigate('/inventario');
    } catch (err) {
      addToast(err.response?.data?.error || 'Error al registrar la donación', 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectedCenter = centers.find((c) => String(c.id) === String(selectedCenterId));

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2"><Package size={24} /> Registrar Donación</h1>
        <p className="text-slate-500 text-sm mt-1">Seguí los pasos para registrar una nueva donación</p>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-6">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex flex-col items-center gap-1 ${i <= step ? 'text-blue-600' : 'text-slate-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                  i < step ? 'bg-indigo-600 border-indigo-600 text-white' :
                  i === step ? 'border-indigo-600 text-indigo-600 bg-indigo-50' :
                  'border-slate-300 text-slate-400'
                }`}>
                  {i < step ? <Check size={14} /> : i + 1}
                </div>
                <span className="text-xs font-medium hidden sm:block">{s}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${i < step ? 'bg-indigo-600' : 'bg-slate-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6">
        {/* Step 0: Categoría (cascada) */}
        {step === 0 && (
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-1">¿Qué tipo de donación es?</h2>
            <p className="text-slate-500 text-sm mb-4">Elegí la categoría y luego el subtipo hasta llegar al detalle.</p>

            {/* Breadcrumb */}
            {categoryPath.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 mb-4 text-sm">
                <button onClick={() => setCategoryPath([])} className="text-indigo-600 hover:underline">Categorías</button>
                {categoryPath.map((node, idx) => (
                  <React.Fragment key={node.id}>
                    <ChevronRight size={14} className="text-slate-400" />
                    <button
                      onClick={() => setCategoryPath(categoryPath.slice(0, idx + 1))}
                      className="text-indigo-600 hover:underline"
                    >
                      {node.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {currentLevel.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => pickCategory(cat)}
                  className={`p-4 rounded-xl border-2 text-center transition-all hover:shadow-md ${
                    selectedCategory?.id === cat.id
                      ? 'border-indigo-500 bg-indigo-50 shadow-md'
                      : 'border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <span className="flex justify-center mb-2">
                    {React.createElement(getCategoryIcon(cat.name), { size: 30, className: 'text-slate-600' })}
                  </span>
                  <span className="text-sm font-semibold text-slate-700">{cat.name}</span>
                  {(cat.children || []).length > 0 && (
                    <span className="block text-xs text-slate-400 mt-1">{cat.children.length} subtipos</span>
                  )}
                </button>
              ))}
            </div>

            {selectedCategory && (
              <div className="mt-4 text-sm text-slate-600 bg-indigo-50 rounded-xl px-4 py-2 inline-flex items-center gap-2">
                <CheckCircle2 size={16} className="text-indigo-600" />
                Seleccionada: <strong>{[...categoryPath.map((p) => p.name), selectedCategory.name].join(' › ')}</strong>
              </div>
            )}
          </div>
        )}

        {/* Step 1: Cantidad + ítem + centro + foto */}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-6">Detalles y cantidad</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2">
                  <span className="inline-flex items-center gap-2"><PencilLine size={16} /> Ítem / descripción</span> <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="Ej: Arroz largo fino 1kg"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2">
                  <span className="inline-flex items-center gap-2"><Package size={16} /> Cantidad de unidades</span> <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xl flex items-center justify-center"><Minus size={18} /></button>
                  <input type="number" value={quantity} onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-3 text-center text-xl font-bold text-slate-800 focus:outline-none focus:border-indigo-500" min="1" />
                  <button type="button" onClick={() => setQuantity(quantity + 1)} className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xl flex items-center justify-center"><Plus size={18} /></button>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2"><span className="inline-flex items-center gap-2"><PencilLine size={16} /> Observaciones (opcional)</span></label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Alguna nota especial sobre esta donación..." className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-indigo-500 h-24 resize-none" />
              </div>

              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2">Centro receptor</label>
                <select value={selectedCenterId} onChange={(e) => setSelectedCenterId(e.target.value)} className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-indigo-500" required>
                  <option value="">Seleccionar centro...</option>
                  {centers.map((center) => (<option key={center.id} value={center.id}>{center.name}</option>))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2"><span className="inline-flex items-center gap-2"><Image size={16} /> Foto del ítem (opcional)</span></label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-indigo-300 transition-colors">
                  {imagePreview ? (
                    <div>
                      <img src={imagePreview} alt="Preview" className="max-h-32 mx-auto rounded-lg mb-2" />
                      <button type="button" onClick={() => { setImage(null); setImagePreview(null); }} className="text-red-500 text-sm hover:underline">Quitar foto</button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <span className="flex justify-center mb-2"><Image size={28} className="text-slate-500" /></span>
                      <span className="text-slate-500 text-sm">Hacé clic para tomar o subir una foto</span>
                      <input type="file" accept="image/*" capture="environment" onChange={handleImageChange} className="hidden" />
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Confirmar */}
        {step === 2 && selectedCategory && (
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-6 inline-flex items-center gap-2"><ClipboardCheck size={20} /> Confirmar Donación</h2>
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 mb-6">
              <div className="flex justify-between">
                <span className="text-slate-500">Categoría:</span>
                <span className="font-semibold inline-flex items-center gap-2">
                  {React.createElement(getCategoryIcon(selectedCategory.name), { size: 16 })}
                  {[...categoryPath.map((p) => p.name), selectedCategory.name].join(' › ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ítem:</span>
                <span className="font-semibold">{itemName}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-3">
                <span className="text-slate-500">Cantidad:</span>
                <span className="font-bold text-green-600 text-lg">+{quantity} unidades</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Centro receptor:</span>
                <span className="font-semibold">{selectedCenter?.name || 'No seleccionado'}</span>
              </div>
              {notes && (<div className="flex justify-between"><span className="text-slate-500">Notas:</span><span className="font-medium text-right max-w-48">{notes}</span></div>)}
              {imagePreview && (<div className="pt-2"><img src={imagePreview} alt="Foto" className="max-h-24 rounded-lg" /></div>)}
            </div>

            {/* Donante */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 mb-6">
              <label className="flex items-center gap-2 text-slate-700 text-sm font-semibold cursor-pointer">
                <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                Donación anónima / sin donante
              </label>
              {!anonymous && (
                <div className="space-y-3">
                  <select
                    value={donorMode === 'new' ? 'new' : selectedDonorId}
                    onChange={(e) => {
                      if (e.target.value === 'new') { setDonorMode('new'); }
                      else { setDonorMode('existing'); setSelectedDonorId(e.target.value); }
                    }}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Seleccionar donante existente...</option>
                    {donors.map((d) => (<option key={d.id} value={d.id}>{d.name} — {d.contact}</option>))}
                    <option value="new">+ Donante nuevo</option>
                  </select>

                  {donorMode === 'new' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input type="text" value={newDonor.name} onChange={(e) => setNewDonor({ ...newDonor, name: e.target.value })} placeholder="Nombre" className="border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500" />
                      <input type="text" value={newDonor.contact} onChange={(e) => setNewDonor({ ...newDonor, contact: e.target.value })} placeholder="Contacto (email/tel) *" className="border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500" />
                      <input type="text" value={newDonor.city} onChange={(e) => setNewDonor({ ...newDonor, city: e.target.value })} placeholder="Ciudad" className="border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500" />
                    </div>
                  )}
                </div>
              )}
            </div>

            <button onClick={handleSubmit} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold py-4 px-6 rounded-xl transition-all text-lg shadow-lg">
              {loading ? (<span className="inline-flex items-center gap-2"><LoaderCircle size={18} className="animate-spin" /> Guardando...</span>) : (<span className="inline-flex items-center gap-2"><Save size={18} /> Confirmar y Guardar Donación</span>)}
            </button>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between mt-6 pt-6 border-t border-slate-100">
          <button
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="px-6 py-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-semibold rounded-xl transition-colors"
          >
            <span className="inline-flex items-center gap-2"><ChevronLeft size={16} /> Anterior</span>
          </button>
          {step === 1 && (
            <button
              onClick={() => validateStep1() && setStep(2)}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors shadow-md"
            >
              <span className="inline-flex items-center gap-2">Revisar <ChevronRight size={16} /></span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
