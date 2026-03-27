import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NuevaDonacion from './pages/NuevaDonacion';
import Inventario from './pages/Inventario';
import NuevaDistribucion from './pages/NuevaDistribucion';
import Distribuciones from './pages/Distribuciones';
import AdminCategorias from './pages/AdminCategorias';
import AdminUsuarios from './pages/AdminUsuarios';
import AdminCentros from './pages/AdminCentros';
import Transferencias from './pages/Transferencias';
import RecepcionesDonaciones from './pages/RecepcionesDonaciones';
import ConfirmacionDonacionQR from './pages/ConfirmacionDonacionQR';
import BlockchainTrazabilidad from './pages/BlockchainTrazabilidad';
import HistorialTransacciones from './pages/HistorialTransacciones';
import AuditoriaIntegridad from './pages/AuditoriaIntegridad';
import ConsultaAsistente from './pages/ConsultaAsistente';

const PrivateRoute = ({ children, adminOnly = false }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
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
      <Route path="/" element={<BlockchainTrazabilidad />} />
      <Route path="/trazabilidad" element={<BlockchainTrazabilidad />} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/confirmacion-donacion/:token" element={<ConfirmacionDonacionQR />} />

      <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/donaciones/nueva" element={<PrivateRoute><NuevaDonacion /></PrivateRoute>} />
      <Route path="/donaciones/recepciones" element={<PrivateRoute><RecepcionesDonaciones /></PrivateRoute>} />
      <Route path="/inventario" element={<PrivateRoute><Inventario /></PrivateRoute>} />
      <Route path="/transferencias" element={<PrivateRoute><Transferencias /></PrivateRoute>} />
      <Route path="/distribuciones/nueva" element={<PrivateRoute><NuevaDistribucion /></PrivateRoute>} />
      <Route path="/distribuciones" element={<PrivateRoute><Distribuciones /></PrivateRoute>} />
      <Route path="/analytics/historial" element={<PrivateRoute><HistorialTransacciones /></PrivateRoute>} />
      <Route path="/auditoria/integridad" element={<PrivateRoute><AuditoriaIntegridad /></PrivateRoute>} />
  <Route path="/consultas-asistente" element={<PrivateRoute><ConsultaAsistente /></PrivateRoute>} />

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
