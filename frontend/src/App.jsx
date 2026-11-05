import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Panel from './pages/Panel';
import Consumo from './pages/Consumo';
import Historial from './pages/Historial';
import Inventario from './pages/Inventario';
import Compras from './pages/Compras';
import Transferencias from './pages/Transferencias';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Panel />} />
              <Route path="/consumo" element={<Consumo />} />
              <Route element={<ProtectedRoute roles={['dueno', 'encargado']} />}>
                <Route path="/inventario" element={<Inventario />} />
                <Route path="/compras" element={<Compras />} />
                <Route path="/transferencias" element={<Transferencias />} />
                <Route path="/movimientos" element={<Historial />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}