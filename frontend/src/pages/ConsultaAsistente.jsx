import React, { useState } from 'react';
import { Bot, Send, LoaderCircle, AlertTriangle, Sparkles } from 'lucide-react';
import api from '../services/api';

export default function ConsultaAsistente() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [mode, setMode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submitQuestion = async () => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/llm/query', { question: trimmed });
      setAnswer(data?.answer || 'Sin respuesta.');
      setMode(data?.mode || 'desconocido');
    } catch (e) {
      setError(e?.response?.data?.error || 'No se pudo procesar la consulta.');
      setAnswer('');
      setMode('');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      submitQuestion();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 inline-flex items-center gap-2">
          <Bot size={24} /> Asistente de Consultas
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Escribe tu consulta en lenguaje natural y el backend ejecutará el flujo de `chatLLM`.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
        <label htmlFor="assistant-question" className="text-sm font-semibold text-slate-700 block">
          Consulta
        </label>
        <textarea
          id="assistant-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={5}
          maxLength={2000}
          placeholder="Ejemplo: ¿Cuántas donaciones se registraron este mes y cuáles fueron las 5 más recientes?"
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="button"
            onClick={submitQuestion}
            disabled={loading || !question.trim()}
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-medium disabled:opacity-60 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
          >
            {loading ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
            {loading ? 'Consultando...' : 'Enviar consulta'}
          </button>
          <span className="text-xs text-slate-500">Tip: usa Ctrl/Cmd + Enter para enviar.</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm inline-flex items-start gap-2">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {answer && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-slate-800 inline-flex items-center gap-2">
              <Sparkles size={18} /> Respuesta
            </h2>
            <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">modo: {mode}</span>
          </div>
          <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  );
}
