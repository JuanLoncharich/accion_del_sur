import React, { useState, useEffect, useContext } from 'react';
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

const DynamicField = ({ attr, value, onChange }) => {
  const baseClass = "w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-blue-500 transition-colors placeholder-slate-400";

  if (attr.attribute_type === 'select') {
    return (
      <select
        value={value || ''}
        onChange={(e) => onChange(attr.attribute_name, e.target.value)}
        className={baseClass}
        required={attr.is_required}
      >
        <option value="">Seleccioná una opción...</option>
        {(attr.options || []).map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  if (attr.attribute_type === 'date') {
    return (
      <input
        type="date"
        value={value || ''}
        onChange={(e) => onChange(attr.attribute_name, e.target.value)}
        className={baseClass}
        required={attr.is_required}
      />
    );
  }

  if (attr.attribute_type === 'number') {
    return (
      <input
        type="number"
        value={value || ''}
        onChange={(e) => onChange(attr.attribute_name, e.target.value)}
        placeholder={`Ingresá ${attr.attribute_name.toLowerCase()}`}
        className={baseClass}
        required={attr.is_required}
        min="0"
        step="0.1"
      />
    );
  }

  return (
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(attr.attribute_name, e.target.value)}
      placeholder={`Ingresá ${attr.attribute_name.toLowerCase()}`}
      className={baseClass}
      required={attr.is_required}
    />
  );
};

const STEPS = ['Categoría', 'Atributos', 'Cantidad', 'Confirmar'];

export default function NuevaDonacion() {
  const addToast = useContext(ToastContext);
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState([]);
  const [centers, setCenters] = useState([]);
  const [donorReceptions, setDonorReceptions] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [attributes, setAttributes] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [selectedCenterId, setSelectedCenterId] = useState('');
  const [selectedDonorReceptionId, setSelectedDonorReceptionId] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [categoriesRes, centersRes, receptionsRes] = await Promise.all([
          api.get('/categories'),
          api.get('/centers'),
          api.get('/donation-receptions', { params: { limit: 200 } }),
        ]);

        setCategories(categoriesRes.data || []);
        setCenters((centersRes.data?.data || []).filter((center) => center.is_active));
        setDonorReceptions(
          (receptionsRes.data?.data || []).filter((reception) => reception.donor_email)
        );
      } catch {
        addToast('No se pudieron cargar categorías, centros o donantes', 'error');
      }
    };

    loadInitialData();
  }, []);

  const handleAttributeChange = (name, value) => {
    setAttributes((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const validateAttributes = () => {
    const newErrors = {};
    selectedCategory.attributes.forEach((attr) => {
      if (attr.is_required && !attributes[attr.attribute_name]) {
        newErrors[attr.attribute_name] = `${attr.attribute_name} es requerido`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && !validateAttributes()) return;
    setStep((s) => s + 1);
  };

  const handleSubmit = async () => {
    if (!selectedCenterId) {
      addToast('Seleccioná un centro receptor', 'error');
      return;
    }

    if (!donorEmail.trim()) {
      addToast('Ingresá el correo del donante', 'error');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('category_id', selectedCategory.id);
      formData.append('attributes', JSON.stringify(attributes));
      formData.append('quantity', quantity);
      formData.append('notes', notes);
      formData.append('center_id', selectedCenterId);
      formData.append('donation_reception_id', selectedDonorReceptionId);
      formData.append('donor_email', donorEmail.trim().toLowerCase());
      if (image) formData.append('image', image);

      await api.post('/donations', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      addToast('¡Donación registrada exitosamente!', 'success');
      navigate('/inventario');
    } catch (err) {
      addToast(err.response?.data?.error || 'Error al registrar la donación', 'error');
    } finally {
      setLoading(false);
    }
  };

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
        {/* Step 0: Category */}
        {step === 0 && (
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-4">¿Qué tipo de donación es?</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { setSelectedCategory(cat); setAttributes({}); setStep(1); }}
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
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Attributes */}
        {step === 1 && selectedCategory && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              {React.createElement(getCategoryIcon(selectedCategory.name), { size: 28, className: 'text-slate-600' })}
              <div>
                <h2 className="text-lg font-bold text-slate-800">Detalles de {selectedCategory.name}</h2>
                <p className="text-slate-500 text-sm">Completá los atributos del ítem</p>
              </div>
            </div>
            <div className="space-y-4">
              {(selectedCategory.attributes || []).sort((a, b) => a.display_order - b.display_order).map((attr) => (
                <div key={attr.id}>
                  <label className="block text-slate-700 text-sm font-semibold mb-2">
                    {attr.attribute_name}
                    {attr.is_required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <DynamicField
                    attr={attr}
                    value={attributes[attr.attribute_name]}
                    onChange={handleAttributeChange}
                  />
                  {errors[attr.attribute_name] && (
                    <p className="text-red-500 text-xs mt-1">{errors[attr.attribute_name]}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Quantity + Image */}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-6">Cantidad y observaciones</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2">
                  <span className="inline-flex items-center gap-2"><Package size={16} /> Cantidad de unidades</span> <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xl flex items-center justify-center"
                  ><Minus size={18} /></button>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-3 text-center text-xl font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                    min="1"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xl flex items-center justify-center"
                  ><Plus size={18} /></button>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2">
                  <span className="inline-flex items-center gap-2"><PencilLine size={16} /> Observaciones (opcional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Alguna nota especial sobre esta donación..."
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors placeholder-slate-400 h-24 resize-none"
                />
              </div>

              <div>
                <div>
                  <label className="block text-slate-700 text-sm font-semibold mb-2">Centro receptor</label>
                  <select
                    value={selectedCenterId}
                    onChange={(e) => setSelectedCenterId(e.target.value)}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-indigo-500"
                    required
                  >
                    <option value="">Seleccionar centro...</option>
                    {centers.map((center) => (
                      <option key={center.id} value={center.id}>{center.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2">
                  <span className="inline-flex items-center gap-2"><Image size={16} /> Foto del ítem (opcional)</span>
                </label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-indigo-300 transition-colors">
                  {imagePreview ? (
                    <div>
                      <img src={imagePreview} alt="Preview" className="max-h-32 mx-auto rounded-lg mb-2" />
                      <button
                        type="button"
                        onClick={() => { setImage(null); setImagePreview(null); }}
                        className="text-red-500 text-sm hover:underline"
                      >Quitar foto</button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <span className="flex justify-center mb-2"><Image size={28} className="text-slate-500" /></span>
                      <span className="text-slate-500 text-sm">Hacé clic para subir una foto</span>
                      <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && selectedCategory && (
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-6 inline-flex items-center gap-2"><ClipboardCheck size={20} /> Confirmar Donación</h2>
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 mb-6">
              <div className="flex justify-between">
                <span className="text-slate-500">Categoría:</span>
                <span className="font-semibold inline-flex items-center gap-2">
                  {React.createElement(getCategoryIcon(selectedCategory.name), { size: 16 })}
                  {selectedCategory.name}
                </span>
              </div>
              {Object.entries(attributes).map(([k, v]) => v && (
                <div key={k} className="flex justify-between">
                  <span className="text-slate-500">{k}:</span>
                  <span className="font-semibold">{v}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-200 pt-3">
                <span className="text-slate-500">Cantidad:</span>
                <span className="font-bold text-green-600 text-lg">+{quantity} unidades</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Centro receptor:</span>
                <span className="font-semibold">
                  {centers.find((center) => String(center.id) === String(selectedCenterId))?.name || 'No seleccionado'}
                </span>
              </div>
              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2">Vincular a donante (QR)</label>
                <select
                  value={selectedDonorReceptionId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedDonorReceptionId(value);
                    const found = donorReceptions.find((reception) => String(reception.id) === String(value));
                    if (found?.donor_email) setDonorEmail(found.donor_email);
                  }}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Seleccionar donante...</option>
                  {donorReceptions.map((reception) => (
                    <option key={reception.id} value={reception.id}>
                      {reception.donor_email} (Recepción #{reception.id})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2">Correo del donante</label>
                <input
                  type="email"
                  value={donorEmail}
                  onChange={(e) => setDonorEmail(e.target.value)}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:border-indigo-500"
                  placeholder="donante@correo.com"
                  required
                />
              </div>
              {notes && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Notas:</span>
                  <span className="font-medium text-right max-w-48">{notes}</span>
                </div>
              )}
              {imagePreview && (
                <div className="pt-2">
                  <img src={imagePreview} alt="Foto" className="max-h-24 rounded-lg" />
                </div>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold py-4 px-6 rounded-xl transition-all text-lg shadow-lg"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2"><LoaderCircle size={18} className="animate-spin" /> Guardando...</span>
              ) : (
                <span className="inline-flex items-center gap-2"><Save size={18} /> Confirmar y Guardar Donación</span>
              )}
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
          {step > 0 && step < 3 && (
            <button
              onClick={handleNext}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors shadow-md"
            >
              <span className="inline-flex items-center gap-2">{step === 2 ? 'Revisar' : 'Siguiente'} <ChevronRight size={16} /></span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
