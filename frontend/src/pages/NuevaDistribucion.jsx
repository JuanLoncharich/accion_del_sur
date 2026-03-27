import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { ToastContext } from '../components/Layout';
import {
  CircleCheckBig,
  Handshake,
  IdCard,
  LoaderCircle,
  Minus,
  Package,
  PackageX,
  PencilLine,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import { getCategoryIcon } from '../utils/icons';

export default function NuevaDistribucion() {
  const addToast = useContext(ToastContext);
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  const [items, setItems] = useState([]);
  const [centers, setCenters] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [receiverId, setReceiverId] = useState('');
  const [notes, setNotes] = useState('');
  const [centerId, setCenterId] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingItems, setFetchingItems] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/categories'),
      api.get('/centers', { params: { active: true } }),
    ]).then(([categoriesRes, centersRes]) => {
      setCategories(categoriesRes.data);
      setCenters(centersRes.data?.data || []);
    });
  }, []);

  useEffect(() => {
    setFetchingItems(true);
    const params = { limit: 50 };
    if (search) params.search = search;
    if (categoryFilter) params.category_id = categoryFilter;
    api.get('/items', { params })
      .then((r) => setItems(r.data.data.filter((i) => i.quantity > 0)))
      .finally(() => setFetchingItems(false));
  }, [search, categoryFilter]);

  const getCanvasContext = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1B2631';
    return ctx;
  };

  const getPointerPosition = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDrawing = (event) => {
    const ctx = getCanvasContext();
    if (!ctx) return;
    const pos = getPointerPosition(event);
    drawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (event) => {
    if (!drawingRef.current) return;
    const ctx = getCanvasContext();
    if (!ctx) return;
    const pos = getPointerPosition(event);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    drawingRef.current = false;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const isCanvasBlank = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return true;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] !== 0) return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!selectedItem) return addToast('Selecciona un item', 'error');
    if (!receiverId.trim()) return addToast('Ingresa el DNI del receptor', 'error');
    if (receiverId.trim().length < 6) return addToast('DNI invalido', 'error');
    if (quantity < 1 || quantity > selectedItem.quantity) {
      return addToast(`Cantidad invalida. Disponible: ${selectedItem.quantity}`, 'error');
    }
    if (!centerId) {
      return addToast('Seleccioná un centro de entrega', 'error');
    }
    if (isCanvasBlank()) {
      return addToast('Se requiere firma manuscrita del receptor', 'error');
    }

    setLoading(true);
    try {
      const prepare = await api.post('/distributions/prepare', {
        item_id: selectedItem.id,
        quantity,
        notes,
        center_id: Number(centerId),
      });

      const distributionId = prepare.data.id;

      await api.post(`/distributions/${distributionId}/identify-manual`, {
        receiver_identifier: receiverId.trim(),
        doc_type: 'DNI',
      });

      const signatureData = canvasRef.current.toDataURL('image/png');
      await api.post(`/distributions/${distributionId}/sign`, {
        signature_data: signatureData,
        signature_mime: 'image/png',
      });

      const finalize = await api.post(`/distributions/${distributionId}/finalize`);
      if (finalize.data?.status === 'pending_anchor') {
        addToast('Entrega en pending_anchor: ancla blockchain pendiente', 'error');
      } else {
        addToast('Distribucion registrada y anclada en blockchain', 'success');
      }

      navigate('/distribuciones');
    } catch (err) {
      addToast(err.response?.data?.error || 'Error al registrar la distribucion', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2"><Handshake size={24} /> Registrar Distribucion</h1>
        <p className="text-slate-500 text-sm mt-1">Flujo completo: preparacion, identificacion manual, firma y finalizacion</p>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-4">1. Seleccionar Item</h2>

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              placeholder="Buscar item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 text-sm"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border-2 border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 text-sm"
            >
              <option value="">Todas las categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {fetchingItems ? (
            <p className="text-center text-slate-400 py-6">Cargando items...</p>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <div className="flex justify-center mb-2"><PackageX size={32} /></div>
              <p>No hay items disponibles con stock</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { setSelectedItem(item); setQuantity(1); }}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                    selectedItem?.id === item.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {React.createElement(getCategoryIcon(item.category?.name), { size: 22, className: 'text-slate-500' })}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{item.name}</p>
                      <p className="text-xs text-slate-400">{item.category?.name}</p>
                    </div>
                    <span className="font-bold text-green-600 shrink-0">
                      {item.quantity} disponibles
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedItem && (
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
            <h2 className="font-bold text-slate-800">2. Datos del receptor y centro</h2>

            <div className="bg-blue-50 rounded-xl p-3 flex items-center gap-3">
              {React.createElement(getCategoryIcon(selectedItem.category?.name), { size: 22, className: 'text-slate-500' })}
              <div>
                <p className="font-semibold text-slate-800 text-sm">{selectedItem.name}</p>
                <p className="text-xs text-green-600 font-medium">Stock disponible: {selectedItem.quantity} unidades</p>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 text-sm font-semibold mb-2">
                <span className="inline-flex items-center gap-2"><Package size={16} /> Cantidad a entregar</span> <span className="text-red-500">*</span>
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
                  onChange={(e) => setQuantity(Math.min(selectedItem.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-3 text-center text-xl font-bold focus:outline-none focus:border-indigo-500"
                  min="1"
                  max={selectedItem.quantity}
                />
                <button
                  type="button"
                  onClick={() => setQuantity(Math.min(selectedItem.quantity, quantity + 1))}
                  className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xl flex items-center justify-center"
                ><Plus size={18} /></button>
              </div>
              {quantity > selectedItem.quantity && (
                <p className="text-red-500 text-sm mt-1 inline-flex items-center gap-1"><TriangleAlert size={14} /> No hay suficiente stock</p>
              )}
            </div>

            <div>
              <label className="block text-slate-700 text-sm font-semibold mb-2">
                <span className="inline-flex items-center gap-2"><IdCard size={16} /> DNI del receptor (manual)</span> <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={receiverId}
                onChange={(e) => setReceiverId(e.target.value)}
                placeholder="DNI"
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2">Centro de entrega <span className="text-red-500">*</span></label>
                <select
                  value={centerId}
                  onChange={(e) => setCenterId(e.target.value)}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
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
                <span className="inline-flex items-center gap-2"><PencilLine size={16} /> Observaciones (opcional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Alguna nota sobre esta entrega..."
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors h-20 resize-none"
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">3. Firma manuscrita del receptor</p>
              <canvas
                ref={canvasRef}
                width={700}
                height={180}
                className="w-full border-2 border-slate-200 rounded-xl touch-none"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              <div className="mt-2">
                <button
                  type="button"
                  onClick={clearSignature}
                  className="px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Limpiar firma
                </button>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading || quantity > selectedItem.quantity || !receiverId.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all text-lg shadow-lg"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2"><LoaderCircle size={18} className="animate-spin" /> Procesando flujo completo...</span>
              ) : (
                <span className="inline-flex items-center gap-2"><CircleCheckBig size={18} /> Confirmar Distribucion</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
