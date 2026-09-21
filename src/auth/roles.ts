// ═══ ROLES OFICIALES DE IMPACTOS ═══════════════════════════════════════════
// Única fuente de verdad de roles, estados y límites por app/workspace.
// Ningún otro archivo debe comparar textos de rol "a mano".

export const ROLES = [
  "super_admin",
  "distribuidor",
  "supervisor",
  "telemarketing_ventas",
  "telemarketing_cobranza",
  "telemarketing_reclutamiento",
] as const;
export type Role = (typeof ROLES)[number];

export const TELEMARKETING_ROLES: Role[] = [
  "telemarketing_ventas",
  "telemarketing_cobranza",
  "telemarketing_reclutamiento",
];
// Roles que ven TODA su app (no solo lo asignado).
export const STAFF_ROLES: Role[] = ["distribuidor", "supervisor"];

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Súper Admin",
  distribuidor: "Distribuidor",
  supervisor: "Supervisor",
  telemarketing_ventas: "Telemarketing",
  telemarketing_cobranza: "Telemarketing",
  telemarketing_reclutamiento: "Telemarketing",
};
export const ROLE_SPECIALTY: Record<Role, string> = {
  super_admin: "Global",
  distribuidor: "—",
  supervisor: "—",
  telemarketing_ventas: "Ventas",
  telemarketing_cobranza: "Cobranza",
  telemarketing_reclutamiento: "Reclutamiento",
};

export const USER_STATUSES = ["invited", "active", "inactive", "suspended"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
// Estados que OCUPAN un puesto del límite (inactive lo libera).
export const SEAT_STATUSES: UserStatus[] = ["invited", "active", "suspended"];

export type AssignmentType = "ventas" | "cobranza" | "reclutamiento";

// Límites por app. Viven también en workspaces/{appId}.limits para que el
// Súper Admin los cambie SIN tocar código ni reglas.
// Los 6 puestos de telemarketing son un CUPO ÚNICO: se reparten libremente
// entre ventas, cobranza y reclutamiento. No hay máximo por especialidad.
export type Limits = {
  distribuidor: number;
  supervisor: number;
  telemarketing_total: number;
};
export const DEFAULT_LIMITS: Limits = {
  distribuidor: 2,
  supervisor: 2,
  telemarketing_total: 6,
};

export const isRole = (r: unknown): r is Role => ROLES.includes(r as Role);
export const isTelemarketing = (r: unknown) => TELEMARKETING_ROLES.includes(r as Role);
export const isStaff = (r: unknown) => STAFF_ROLES.includes(r as Role);

// Tipo de dato que trabaja cada telemarketing.
export function assignmentTypeOf(role: unknown): AssignmentType | null {
  if (role === "telemarketing_ventas") return "ventas";
  if (role === "telemarketing_cobranza") return "cobranza";
  if (role === "telemarketing_reclutamiento") return "reclutamiento";
  return null;
}
export function roleForAssignmentType(t: AssignmentType): Role {
  return ("telemarketing_" + t) as Role;
}

export const normalizeEmail = (e: unknown) => String(e || "").trim().toLowerCase();
