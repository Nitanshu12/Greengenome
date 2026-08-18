import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "../api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading
  // useRef so the event listener always sees the latest user value
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    api.me()
      .then(d => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  // When any API call returns 401, redirect to login — but only if the user
  // was already logged in. A 401 before login (e.g. api.me() on first load)
  // is normal and should not redirect.
  useEffect(() => {
    const handle = () => {
      if (userRef.current) {
        setUser(null);
        window.location.href = "/login";
      }
    };
    window.addEventListener("auth:unauthorized", handle);
    return () => window.removeEventListener("auth:unauthorized", handle);
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

  // Single source of truth for role checks — every page used to recompute
  // its own `["admin","superadmin"].includes(user?.role)` locally; centralizing
  // it here is what makes it possible to have "admin, but not delete" as a
  // consistent rule instead of one that has to be re-applied by hand on every
  // page's delete button.
  const isSuperadmin = user?.role === "superadmin";
  const isAdmin = isSuperadmin || user?.role === "admin";
  const isRestrictedUser = user?.role === "user";
  const canDelete = isSuperadmin;

  return (
    <AuthCtx.Provider value={{ user, login, logout, isSuperadmin, isAdmin, isRestrictedUser, canDelete }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
