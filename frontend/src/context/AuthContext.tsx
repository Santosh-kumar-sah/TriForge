"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export interface User {
  id: string;
  name: string;
  email: string;
  token: string;
  role: string;
  joinedAt: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authModalOpen: boolean;
  authMode: "login" | "register";
  redirectAfterAuth: string | null;
  authHeaders: Record<string, string>;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
  login: (email: string, password?: string) => Promise<boolean>;
  register: (name: string, email: string, password?: string) => Promise<boolean>;
  logout: () => void;
  openAuthModal: (mode?: "login" | "register", redirectUrl?: string) => void;
  closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "triforge_user_session_v1";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [redirectAfterAuth, setRedirectAfterAuth] = useState<string | null>(null);
  const router = useRouter();

  // Load session from localStorage on initial client mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.email) {
          setUser(parsed);
        }
      }
    } catch (e) {
      console.error("Failed to parse user session", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const authHeaders: Record<string, string> = {
    "X-User-Email": user?.email ? user.email.trim().toLowerCase() : "",
    "X-User-Id": user?.id || "",
    "Authorization": `Bearer ${user?.token || ""}`
  };

  const fetchWithAuth = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(options.headers || {});
    if (user?.email) {
      headers.set("X-User-Email", user.email.trim().toLowerCase());
    }
    if (user?.id) {
      headers.set("X-User-Id", user.id);
    }
    if (user?.token) {
      headers.set("Authorization", `Bearer ${user.token}`);
    }

    return fetch(url, {
      ...options,
      headers
    });
  };

  const login = async (email: string, password?: string): Promise<boolean> => {
    const cleanEmail = email.trim().toLowerCase();
    const username = cleanEmail.split("@")[0] || "Developer";
    const formattedName = username.charAt(0).toUpperCase() + username.slice(1);
    
    // Deterministic user id per email
    let hash = 0;
    for (let i = 0; i < cleanEmail.length; i++) {
      hash = (hash << 5) - hash + cleanEmail.charCodeAt(i);
      hash |= 0;
    }
    const safeHash = Math.abs(hash).toString(36);

    const newUser: User = {
      id: "usr_" + safeHash,
      name: formattedName,
      email: cleanEmail,
      token: "tf_jwt_" + safeHash + "_" + Math.random().toString(36).substring(2, 8),
      role: "AI Systems Engineer",
      joinedAt: new Date().toISOString()
    };

    setUser(newUser);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
    } catch (e) {}

    return true;
  };

  const register = async (name: string, email: string, password?: string): Promise<boolean> => {
    const cleanEmail = email.trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < cleanEmail.length; i++) {
      hash = (hash << 5) - hash + cleanEmail.charCodeAt(i);
      hash |= 0;
    }
    const safeHash = Math.abs(hash).toString(36);

    const newUser: User = {
      id: "usr_" + safeHash,
      name: name || "Developer",
      email: cleanEmail,
      token: "tf_jwt_" + safeHash + "_" + Math.random().toString(36).substring(2, 8),
      role: "Cluster Administrator",
      joinedAt: new Date().toISOString()
    };

    setUser(newUser);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
    } catch (e) {}

    return true;
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    router.push("/");
  };

  const openAuthModal = (mode: "login" | "register" = "login", redirectUrl?: string) => {
    setAuthMode(mode);
    if (redirectUrl) setRedirectAfterAuth(redirectUrl);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
    setRedirectAfterAuth(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        authModalOpen,
        authMode,
        redirectAfterAuth,
        authHeaders,
        fetchWithAuth,
        login,
        register,
        logout,
        openAuthModal,
        closeAuthModal
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
