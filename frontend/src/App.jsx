import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NuevaDonacion from './pages/NuevaDonacion';
import Inventario from './pages/Inventario';
import NuevoEnvio from './pages/NuevoEnvio';
import Distribuciones from './pages/Distribuciones';
import AdminCategorias from './pages/AdminCategorias';
import AdminUsuarios from './pages/AdminUsuarios';
import AdminCentros from './pages/AdminCentros';
import Transferencias from './pages/Transferencias';
import RecepcionesDonaciones from './pages/RecepcionesDonaciones';
import ConfirmacionDonacionQR from './pages/ConfirmacionDonacionQR';
import Landing from './pages/Landing';
import HistorialTransacciones from './pages/HistorialTransacciones';
import PanelApoyo from './pages/PanelApoyo';

const PrivateRoute = ({ children, adminOnly = false }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'ADMINISTRADOR') return <Navigate to="/dashboard" replace />;
  return <Layout>{children}</Layout>;
};

const PublicRoute = ({ children }) => {
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/trazabilidad" element={<Navigate to="/#transparencia" replace />} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/confirmacion-donacion/:token" element={<ConfirmacionDonacionQR />} />

      <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/panel-apoyo" element={<PrivateRoute><PanelApoyo /></PrivateRoute>} />
      <Route path="/donaciones/nueva" element={<PrivateRoute><NuevaDonacion /></PrivateRoute>} />
      <Route path="/donaciones/recepciones" element={<PrivateRoute><RecepcionesDonaciones /></PrivateRoute>} />
      <Route path="/inventario" element={<PrivateRoute><Inventario /></PrivateRoute>} />
      <Route path="/transferencias" element={<PrivateRoute><Transferencias /></PrivateRoute>} />
      <Route path="/envios/nuevo" element={<PrivateRoute><NuevoEnvio /></PrivateRoute>} />
      <Route path="/envios" element={<PrivateRoute><Distribuciones /></PrivateRoute>} />
      {/* Rutas anteriores: redirigen a los envíos */}
      <Route path="/distribuciones/nueva" element={<Navigate to="/envios/nuevo" replace />} />
      <Route path="/distribuciones" element={<Navigate to="/envios" replace />} />
      <Route path="/analytics/historial" element={<PrivateRoute><HistorialTransacciones /></PrivateRoute>} />

      <Route path="/admin/categorias" element={<PrivateRoute adminOnly><AdminCategorias /></PrivateRoute>} />
      <Route path="/admin/usuarios" element={<PrivateRoute adminOnly><AdminUsuarios /></PrivateRoute>} />
      <Route path="/admin/centros" element={<PrivateRoute adminOnly><AdminCentros /></PrivateRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
