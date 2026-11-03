import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Panel from './pages/Panel';
import Consumo from './pages/Consumo';

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
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
          
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}