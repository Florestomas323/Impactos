// ═══ INTERRUPTOR DEL SISTEMA NUEVO ════════════════════════════════════════
// VITE_ACCESS_V2 se define en Vercel. En el proyecto de PRODUCCIÓN no existe,
// así que la app compila exactamente con el sistema de siempre.
// Solo el proyecto de PRUEBA lo enciende (y apunta a un Firebase de prueba).
const env: any = (import.meta as any).env || {};

export const ACCESS_V2: boolean = env.VITE_ACCESS_V2 === "1";

// Workspace de esta instalación de ImpactOS.
export const APP_ID: string = env.VITE_APP_ID || "impactos";

// Config de Firebase alternativa (JSON) para el proyecto de prueba.
// Si no está definida se usa la de siempre.
export function firebaseConfigOverride(): Record<string, string> | null {
  if (!env.VITE_FIREBASE_CONFIG) return null;
  try { return JSON.parse(env.VITE_FIREBASE_CONFIG); } catch { return null; }
}
