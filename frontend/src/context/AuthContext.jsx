import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, clearToken, getToken, onSesionExpirada, setToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(Boolean(getToken()));

  const cerrarSesion = useCallback(() => {
    clearToken();
    setUsuario(null);
  }, []);

  useEffect(() => {
    onSesionExpirada(cerrarSesion);
    if (!getToken()) return;
    api('/auth/me')
      .then(setUsuario)
      .catch(cerrarSesion)
      .finally(() => setCargando(false));
  }, [cerrarSesion]);

  async function iniciarSesion(email, password) {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    setUsuario(data.usuario);
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);