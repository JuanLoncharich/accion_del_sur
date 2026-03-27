import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  BarChart3,
  ClipboardList,
  Gift,
  Heart,
  History,
  Handshake,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Tags,
  Users,
  X,
  Boxes,
  QrCode,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/donaciones/nueva', label: 'Registrar Donación', icon: Gift },
  { to: '/donaciones/recepciones', label: 'Recepciones con QR', icon: QrCode },
  { to: '/inventario', label: 'Inventario', icon: Boxes },
  { to: '/distribuciones/nueva', label: 'Distribuir', icon: Handshake },
  { to: '/distribuciones', label: 'Historial Distribuciones', icon: ClipboardList },
  { to: '/blockchain/trazabilidad', label: 'Trazabilidad Blockchain', icon: ShieldCheck },
  { to: '/analytics/historial', label: 'Historial Transacciones', icon: History },
  { to: '/auditoria/integridad', label: 'Auditoría e Integridad', icon: BarChart3 },
];

const ADMIN_ITEMS = [
  { to: '/admin/categorias', label: 'Categorías', icon: Tags },
  { to: '/admin/usuarios', label: 'Usuarios', icon: Users },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 ${
      isActive
        ? 'bg-indigo-600 text-white shadow-md'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
            <Heart size={20} />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">Acción del Sur</h1>
            <p className="text-slate-400 text-xs">Gestión de Donaciones</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="text-slate-500 text-xs uppercase font-semibold px-4 mb-2">Principal</p>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={linkClass}
            onClick={() => setMobileOpen(false)}
          >
            <item.icon size={18} className="shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}

        {user?.role === 'admin' && (
          <>
            <p className="text-slate-500 text-xs uppercase font-semibold px-4 mt-4 mb-2">
              Administración
            </p>
            {ADMIN_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={linkClass}
                onClick={() => setMobileOpen(false)}
              >
                <item.icon size={18} className="shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* User info + logout */}
      <div className="px-3 py-4 border-t border-slate-800">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{user?.username}</p>
            <p className="text-slate-400 text-xs capitalize">{user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-red-400 transition-colors"
            title="Cerrar sesión"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden bg-slate-900 text-white p-2 rounded-lg shadow-md"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-slate-900 h-screen sticky top-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 w-64 bg-slate-900 h-screen transition-transform duration-300 lg:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent />
      </aside>
    </>
  );
}
