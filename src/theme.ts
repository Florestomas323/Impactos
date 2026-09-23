// ═══════════════════════════════════════════════════════════════
//  PALETA CENTRAL — ImpactOS (SaaS claro, estilo Royal Sales IA)
//  ---------------------------------------------------------------
//  El objeto RP se usa en ~130 estilos inline de App.tsx como color
//  de ACCIÓN/ACENTO (fondos de botones, pestañas activas, cabeceras
//  de tarjeta, degradados) siempre con texto blanco encima.
//  Al centralizar aquí los valores, todo el sistema adopta el azul
//  primario sin reescribir cada clase.
// ═══════════════════════════════════════════════════════════════
export const RP = {
  navy:    "#2563EB",   // AZUL primario (fondo de acción, texto blanco encima)
  navyDark:"#1D4ED8",   // azul primario oscuro (hover / botón secundario)
  blue:    "#1D4ED8",   // azul secundario para degradados y acentos
  accent:  "#2563EB",   // acento azul
  ink:     "#111827",   // texto principal oscuro
  silver:  "rgba(37,99,235,0.10)", // velo azul translúcido
  silver2: "#E5E7EB",   // borde claro fino
  pageBg:  "#F8FAFC",   // fondo de la app
  btn:     "#2563EB",   // botón principal AZUL
  btnText: "#FFFFFF",   // texto del botón principal
};
export const SERIF = "'Archivo','Inter',system-ui,sans-serif";
export const SANS  = "'Inter',system-ui,sans-serif";

// ─── MARCA ──────────────────────────────────────────────────────
// Violeta tomado del propio ícono de ImpactOS (tono 262°, #6410F8).
// purple: sobre fondos claros · purpleOnDark: mismo tono, más luminoso
// para que se lea bien sobre el menú oscuro.
export const BRAND = {
  purple: "#6410F8",
  purpleOnDark: "#A07CFF",
};
