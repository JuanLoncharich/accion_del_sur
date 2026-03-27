import React from 'react';
import Sidebar from './Sidebar';
import { ToastContainer } from './Toast';
import { useToast } from '../hooks/useToast';

export const ToastContext = React.createContext(null);

export default function Layout({ children }) {
  const { toasts, addToast, removeToast } = useToast();

  return (
    <ToastContext.Provider value={addToast}>
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar />
        <main className="flex-1 overflow-auto lg:pl-0 pt-0">
          <div className="p-4 lg:p-8">
            {children}
          </div>
        </main>
        <ToastContainer toasts={toasts} removeToast={removeToast} />
      </div>
    </ToastContext.Provider>
  );
}
