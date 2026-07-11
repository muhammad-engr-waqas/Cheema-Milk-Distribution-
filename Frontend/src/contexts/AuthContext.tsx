import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Role } from '../types';
import { authApi, setToken, removeToken, isOnline } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, role: Role) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('dairy_user');
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      // Normalize stale roles from old localStorage
      if (parsed?.role === 'Driver' || parsed?.role === 'Lab Technician') {
        parsed.role = 'MilkTester';
        localStorage.setItem('dairy_user', JSON.stringify(parsed));
      }
      return parsed;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  // FIX: Pehle yahan par refresh ke 300ms baad 'dairy-user-login' event dobara
  // fire hota tha taake VehicleContext, AdvanceContext, etc. sync kar sakein.
  // Lekin har data-context (Vehicle, Advance, Account, Dispatch, Lab, User,
  // MilkTransaction) apne mount effect mein khud hi `if (isOnline())
  // syncFromBackend()` chalata hai — is liye ye event sirf ek FALTU DOOSRI
  // wave of identical GET requests bhej raha tha (asal wave mount ke waqt,
  // aur ye nakli wapas wahi cheez 300ms baad). Isi wajah se Network tab mein
  // har endpoint do-dafa dikhta tha aur backend pe faltu load parta tha.
  // Ab hata diya — mount-time sync hi kaafi hai jab token/user already maujood ho.

  /**
   * Login function
   * Online → backend se verify karo + JWT token lo
   * Offline → localStorage ke users se verify karo (fallback)
   */
  const login = async (username: string, password: string, role: Role) => {
    setLoading(true);

    try {
      if (isOnline()) {
        const result = await authApi.login(username, password) as any;
        const backendUser = result.data.user;
        const token = result.data.token;

        const appUser: User = {
          id: backendUser._id,
          name: backendUser.fullName,
          fullName: backendUser.fullName,
          username: backendUser.username,
          role: backendUser.role as Role,
          preferences: backendUser.preferences,
        };

        // ✅ Role mismatch check: frontend selected role aur backend actual role match karna chahiye
        if (backendUser.role !== role) {
          throw new Error(`Incorrect role selected. This account belongs to the "${backendUser.role === 'MilkTester' ? 'Milk Tester' : backendUser.role}" role.`);
        }

        setUser(appUser);
        setToken(token);
        localStorage.setItem('dairy_user', JSON.stringify(appUser));
        window.dispatchEvent(new CustomEvent('dairy-user-login'));

      } else {
        const isAdminOffline =
          username.toLowerCase() === 'admin' &&
          password === 'password' &&
          role === 'Admin';

        if (!isAdminOffline) {
          throw new Error('Internet connection required to login. Please connect and try again.');
        }

        const offlineUser: User = {
          id: 'offline_admin',
          name: 'System Admin',
          fullName: 'System Admin',
          username: 'admin',
          role: 'Admin',
        };

        setUser(offlineUser);
        localStorage.setItem('dairy_user', JSON.stringify(offlineUser));
        window.dispatchEvent(new CustomEvent('dairy-user-login'));
      }
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isHandlingUnauthorized = false;
    let unauthorizedCount = 0;
    let windowTimer: ReturnType<typeof setTimeout> | null = null;

    const doLogout = () => {
      if (isHandlingUnauthorized) return;
      isHandlingUnauthorized = true;
      unauthorizedCount = 0;
      if (windowTimer) clearTimeout(windowTimer);
      logout();
      setTimeout(() => { isHandlingUnauthorized = false; }, 2000);
    };

    const handleUnauthorized = (e: Event) => {
      if (isHandlingUnauthorized) return;

      const message: string = (e as CustomEvent)?.detail?.message || '';
      const lower = message.toLowerCase();

      // FIX: "No token provided" ka matlab session invalid hona nahi — iska
      // matlab ye request bina Authorization header ke chali gayi (client-side
      // race/glitch, ya user already logged out hai). Isay logout-counter mein
      // shamil karna hi asal bug tha: page load pe ~9 contexts ek saath sync
      // karte hain, aur agar teen alag unrelated requests mein se kisi ek mein
      // bhi ye harmless message aa jaye, poora app false-positive logout ho
      // jata — jiske baad HAR request "No token provided" dene lagti (token
      // hi remove ho chuka hota), aur Network tab isi error se bhar jata.
      // Ab is case ko bilkul ignore karo — na count karo, na logout.
      if (lower.includes('no token provided')) {
        console.warn('[Auth] Ignoring "No token provided" 401 — not counted toward logout (likely a client-side race, not an invalid session).');
        return;
      }

      // Genuinely invalid/expired/deactivated session — ye backend ne token
      // ko explicitly verify karke reject kiya hai, is liye ek hi occurrence
      // kaafi bharosemand hai, 3 baar wait karne ki zaroorat nahi.
      if (lower.includes('expired') || lower.includes('invalid token') || lower.includes('no longer exists') || lower.includes('deactivated')) {
        console.warn(`[Auth] Session invalid (${message}) — logging out.`);
        doLogout();
        return;
      }

      // Koi aur/unclassified 401 — purana conservative "3 hits in 4s" wala
      // dhanda hi chalao (cold-start / transient network glitch se bachne ke liye).
      unauthorizedCount++;
      console.warn(`[Auth] 401 received (${unauthorizedCount} in window): ${message}`);

      if (windowTimer) clearTimeout(windowTimer);
      windowTimer = setTimeout(() => { unauthorizedCount = 0; }, 4000);

      if (unauthorizedCount < 3) return;
      doLogout();
    };
    window.addEventListener('dairy-unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('dairy-unauthorized', handleUnauthorized);
      if (windowTimer) clearTimeout(windowTimer);
    };
  }, []);

  const logout = () => {
    // Backend ko inform karo (fire and forget — error pe bhi local logout karo)
    if (isOnline()) {
      authApi.logout().catch(() => {
        // Ignore karo — logout locally ho jayega
      });
    }

    // Current user ka saara cache clear karo — routes, collections, sab
    const savedUser = localStorage.getItem('dairy_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        const uid = parsedUser?.id;
        if (uid) {
          // Route collection cache (user-specific)
          localStorage.removeItem(`cheema_route_collections_${uid}`);
          // Route cache (agar koi ho)
          localStorage.removeItem(`cheema_routes_driver_${uid}`);
        }
      } catch {}
    }

    // Purana generic cache bhi clear karo (legacy)
    localStorage.removeItem('cheema_route_collections');
    // Dashboard cache clear karo taake next login pe fresh data aaye
    localStorage.removeItem('dairy_dashboard_data');

    setUser(null);
    removeToken();
    localStorage.removeItem('dairy_user');
    window.dispatchEvent(new CustomEvent('dairy-reset'));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
