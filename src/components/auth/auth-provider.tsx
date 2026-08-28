"use client";

import * as React from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { authorizedAppRole } from "@/lib/auth-role";
import {
  DEFAULT_ROLE_PERMISSIONS,
  type AppRole,
  type PermissionKey,
  type PermissionMap,
} from "@/lib/permissions";

type ProfileRow = {
  id: string;
  email: string | null;
  role: AppRole;
};

type AuthContextValue = {
  initialized: boolean;
  authenticated: boolean;
  user: User | null;
  profile: ProfileRow | null;
  role: AppRole | null;
  permissions: PermissionMap;
  hasPermission: (key: PermissionKey) => boolean;
  refreshAuthState: () => Promise<void>;
};

const EMPTY_PERMS: PermissionMap = {
  "projects.view": false,
  "projects.create": false,
  "projects.update": false,
  "projects.delete": false,
  "workers.view": false,
  "workers.manage": false,
  "workers.delete": false,
  "timesheets.submit": false,
  "timesheets.approve": false,
  "finance.view": false,
  "finance.manage": false,
  "finance.pay": false,
  "settings.view": false,
  "settings.company_edit": false,
  "settings.permissions_manage": false,
};

const AuthContext = React.createContext<AuthContextValue>({
  initialized: false,
  authenticated: false,
  user: null,
  profile: null,
  role: null,
  permissions: EMPTY_PERMS,
  hasPermission: () => false,
  refreshAuthState: async () => {},
});

function coercePerms(input: unknown, role: AppRole): PermissionMap {
  const base = { ...DEFAULT_ROLE_PERMISSIONS[role] };
  if (!input || typeof input !== "object") return base;
  const rec = input as Record<string, unknown>;
  for (const key of Object.keys(base) as PermissionKey[]) {
    if (typeof rec[key] === "boolean") {
      base[key] = rec[key] as boolean;
    }
  }
  return base;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const [supabase, setSupabase] = React.useState<SupabaseClient | null>(null);

  const [initialized, setInitialized] = React.useState(false);
  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<ProfileRow | null>(null);
  const [role, setRole] = React.useState<AppRole | null>(null);
  const [permissions, setPermissions] = React.useState<PermissionMap>(EMPTY_PERMS);

  React.useEffect(() => {
    let active = true;
    if (!configured || !url || !anon) {
      setSupabase(null);
      return () => {
        active = false;
      };
    }

    void import("@/lib/supabase").then(({ createBrowserClient }) => {
      if (active) setSupabase(createBrowserClient(url, anon));
    });
    return () => {
      active = false;
    };
  }, [configured, url, anon]);

  const loadAuthState = React.useCallback(async () => {
    if (!supabase) {
      setInitialized(true);
      setUser(null);
      setProfile(null);
      setRole(null);
      setPermissions(EMPTY_PERMS);
      return;
    }
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();
    setUser(sessionUser);
    if (!sessionUser) {
      setProfile(null);
      setRole(null);
      setPermissions(EMPTY_PERMS);
      setInitialized(true);
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("id,email,role")
      .eq("id", sessionUser.id)
      .maybeSingle();

    const authoritativeRole = authorizedAppRole(sessionUser);
    const profileRow = (profileData ?? null) as ProfileRow | null;
    setProfile(profileRow);
    if (!authoritativeRole) {
      setRole(null);
      setPermissions(EMPTY_PERMS);
      setInitialized(true);
      return;
    }
    const currentRole: AppRole = authoritativeRole;
    setRole(currentRole);

    if (currentRole === "owner") {
      setPermissions(DEFAULT_ROLE_PERMISSIONS.owner);
      setInitialized(true);
      return;
    }
    const { data: permsData } = await supabase.rpc("get_my_permissions");
    setPermissions(coercePerms(permsData, currentRole));
    setInitialized(true);
  }, [supabase]);

  React.useEffect(() => {
    if (!supabase) {
      setInitialized(true);
      return;
    }
    void loadAuthState();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void loadAuthState();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [loadAuthState, supabase]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      initialized,
      authenticated: !!user,
      user,
      profile,
      role,
      permissions,
      hasPermission: (key: PermissionKey) => {
        if (role === "owner") return true;
        return Boolean(permissions[key]);
      },
      refreshAuthState: loadAuthState,
    }),
    [initialized, user, profile, role, permissions, loadAuthState]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return React.useContext(AuthContext);
}
