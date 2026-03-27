import React from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: TriangleAlert,
  info: Info,
};

const colors = {
  success: 'bg-emerald-600',
  error: 'bg-rose-600',
  warning: 'bg-amber-600',
  info: 'bg-indigo-600',
};

export const ToastContainer = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        (() => {
          const Icon = icons[toast.type] || Info;
          return (
        <div
          key={toast.id}
          className={`${colors[toast.type]} text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 min-w-64 animate-fade-in`}
        >
          <Icon size={18} className="shrink-0" />
          <span className="flex-1 text-sm font-medium">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="ml-2 opacity-75 hover:opacity-100 text-lg leading-none"
          >
            <X size={16} />
          </button>
        </div>
          );
        })()
      ))}
    </div>
  );
};
