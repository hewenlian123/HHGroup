export type AppRole = "owner" | "admin" | "assistant";

export type PermissionKey =
  | "projects.view"
  | "projects.create"
  | "projects.update"
  | "projects.delete"
  | "workers.view"
  | "workers.manage"
  | "workers.delete"
  | "timesheets.submit"
  | "timesheets.approve"
  | "finance.view"
  | "finance.manage"
  | "finance.pay"
  | "settings.view"
  | "settings.company_edit"
  | "settings.permissions_manage";

export type PermissionMap = Record<PermissionKey, boolean>;

export const PERMISSION_GROUPS: Array<{ title: string; keys: PermissionKey[] }> = [
  {
    title: "Projects",
    keys: ["projects.view", "projects.create", "projects.update", "projects.delete"],
  },
  { title: "Workers", keys: ["workers.view", "workers.manage", "workers.delete"] },
  { title: "Timesheets", keys: ["timesheets.submit", "timesheets.approve"] },
  { title: "Finance", keys: ["finance.view", "finance.manage", "finance.pay"] },
  {
    title: "Settings",
    keys: ["settings.view", "settings.company_edit", "settings.permissions_manage"],
  },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, PermissionMap> = {
  owner: {
    "projects.view": true,
    "projects.create": true,
    "projects.update": true,
    "projects.delete": true,
    "workers.view": true,
    "workers.manage": true,
    "workers.delete": true,
    "timesheets.submit": true,
    "timesheets.approve": true,
    "finance.view": true,
    "finance.manage": true,
    "finance.pay": true,
    "settings.view": true,
    "settings.company_edit": true,
    "settings.permissions_manage": true,
  },
  admin: {
    "projects.view": true,
    "projects.create": true,
    "projects.update": true,
    "projects.delete": false,
    "workers.view": true,
    "workers.manage": true,
    "workers.delete": false,
    "timesheets.submit": true,
    "timesheets.approve": true,
    "finance.view": false,
    "finance.manage": false,
    "finance.pay": false,
    "settings.view": true,
    "settings.company_edit": false,
    "settings.permissions_manage": false,
  },
  assistant: {
    "projects.view": true,
    "projects.create": true,
    "projects.update": true,
    "projects.delete": false,
    "workers.view": true,
    "workers.manage": true,
    "workers.delete": false,
    "timesheets.submit": true,
    "timesheets.approve": false,
    "finance.view": false,
    "finance.manage": false,
    "finance.pay": false,
    "settings.view": false,
    "settings.company_edit": false,
    "settings.permissions_manage": false,
  },
};

export const PUBLIC_AUTH_ROUTES = new Set(["/login", "/auth/callback"]);

export function requiredPermissionForPath(pathname: string): PermissionKey | null {
  if (pathname.startsWith("/financial")) return "finance.view";
  if (pathname.startsWith("/projects")) return "projects.view";
  if (pathname.startsWith("/workers")) return "workers.view";
  if (pathname.startsWith("/labor/workers")) return "workers.view";
  if (pathname.startsWith("/labor/subcontractors")) return "workers.view";
  if (pathname.startsWith("/labor/review")) return "timesheets.approve";
  if (pathname.startsWith("/labor")) return "timesheets.submit";
  if (pathname.startsWith("/settings/account")) return null;
  if (pathname.startsWith("/settings/company")) return "settings.company_edit";
  if (pathname.startsWith("/settings/permissions")) return "settings.permissions_manage";
  if (pathname.startsWith("/settings/users")) return "settings.permissions_manage";
  if (pathname.startsWith("/settings")) return "settings.view";
  return null;
}

export function isSettingsRestrictedPath(pathname: string): boolean {
  return pathname.startsWith("/settings/permissions") || pathname.startsWith("/settings/users");
}
