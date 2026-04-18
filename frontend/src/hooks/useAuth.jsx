import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    api.me()
      .then(d => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  const login = async (username, password) => {
    const d = await api.login({ username, password });
    setUser(d.user);
    return d.user;
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
