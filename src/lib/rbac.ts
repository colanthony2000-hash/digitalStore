export type UserRole =
  | 'customer'
  | 'ops_monitor'
  | 'support'
  | 'finance'
  | 'admin'
  | 'super_admin';

export type AdminPermission =
  | 'view_overview'
  | 'view_customers'
  | 'manage_customers_support'
  | 'manage_support_cases'
  | 'view_orders'
  | 'manage_orders'
  | 'reassign_orders'
  | 'manage_catalog'
  | 'manage_settings'
  | 'view_infra'
  | 'run_safe_ops'
  | 'view_reports'
  | 'export_reports'
  | 'manage_roles';

export const ADMIN_CONSOLE_ROLES: UserRole[] = [
  'super_admin',
  'admin',
  'support',
  'finance',
  'ops_monitor',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  customer: 'Customer',
  ops_monitor: 'Read-only Operations Monitor',
  support: 'Customer Support',
  finance: 'Finance & Transactions',
  admin: 'Administrator',
  super_admin: 'Super Administrator',
};

export const ROLE_PERMISSIONS: Record<UserRole, AdminPermission[]> = {
  customer: [],
  ops_monitor: ['view_overview', 'view_infra', 'run_safe_ops', 'view_reports'],
  support: [
    'view_overview',
    'view_customers',
    'manage_customers_support',
    'manage_support_cases',
    'view_orders',
    'view_reports',
  ],
  finance: [
    'view_overview',
    'view_customers',
    'view_orders',
    'manage_orders',
    'view_reports',
    'export_reports',
  ],
  admin: [
    'view_overview',
    'view_customers',
    'manage_customers_support',
    'manage_support_cases',
    'view_orders',
    'manage_orders',
    'reassign_orders',
    'manage_catalog',
    'manage_settings',
    'view_infra',
    'run_safe_ops',
    'view_reports',
    'export_reports',
  ],
  super_admin: [
    'view_overview',
    'view_customers',
    'manage_customers_support',
    'manage_support_cases',
    'view_orders',
    'manage_orders',
    'reassign_orders',
    'manage_catalog',
    'manage_settings',
    'view_infra',
    'run_safe_ops',
    'view_reports',
    'export_reports',
    'manage_roles',
  ],
};

export function isAdminConsoleRole(role?: string | null): boolean {
  if (!role) return false;
  return ADMIN_CONSOLE_ROLES.includes(role as UserRole);
}

export function getPermissionsForRole(role?: string | null): AdminPermission[] {
  if (!role || !(role in ROLE_PERMISSIONS)) return [];
  return ROLE_PERMISSIONS[role as UserRole];
}

export function hasPermission(
  role: string | null | undefined,
  permission: AdminPermission
): boolean {
  return getPermissionsForRole(role).includes(permission);
}
