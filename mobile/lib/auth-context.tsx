import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { saveTokens, clearTokens, getAccessToken } from "./token-storage";
import { loginApi, type LoginResponse } from "./api";

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  tenantId: string;
  role: string;
};

type AuthContextType = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from stored token on app start
  useEffect(() => {
    async function restore() {
      try {
        const token = await getAccessToken();
        if (!token) return;

        const payload = parseJwtPayload(token);
        if (!payload) return;

        // Check if token is expired
        const exp = payload.exp as number | undefined;
        if (exp && exp * 1000 < Date.now()) {
          // Token expired — we could try to refresh here,
          // but for now just clear and let user log in again
          await clearTokens();
          return;
        }

        setUser({
          id: payload.userId as string,
          email: payload.email as string,
          name: (payload.name as string) ?? null,
          tenantId: payload.tenantId as string,
          role: payload.role as string,
        });
      } catch {
        await clearTokens();
      } finally {
        setIsLoading(false);
      }
    }
    restore();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data: LoginResponse = await loginApi(email, password);
    await saveTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
