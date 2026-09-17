export const CUENTA_ROOT = "florestomas323@gmail.com";
export const CUENTA_ROOT_DATOS = { nombre:"Tomas", rol:"Distribuidor" };

// 🌱 SEMILLA — se copia a Firebase UNA SOLA VEZ (la primera vez que se abre la
// app con la lista de cuentas vacía). Después de esa migración este arreglo ya
// no se usa jamás: la fuente de verdad pasa a ser Firebase.
export const SEMILLA_CUENTAS = [
  { email:"florestomas323@gmail.com",         nombre:"Tomas",           rol:"Distribuidor" },
  { email:"paredesangiemar@gmail.com",        nombre:"Angie",           rol:"Distribuidor" },
  { email:"yelitzaurdaneta1978@gmail.com",    nombre:"Yelitza",         rol:"Telemarketing" },
  { email:"milateamtlmk@gmail.com",           nombre:"Mila",            rol:"Supervisora telemarketing" },
  { email:"jovannadelgadobella.19@gmail.com", nombre:"Jovanna Delgado", rol:"Cobranza" },
  { email:"jeanmoreno2404@gmail.com",         nombre:"Jean Moreno",     rol:"Cobranza" },
  { email:"lisbethvillasmil3@gmail.com",      nombre:"Lisbeth",         rol:"Telemarketing" },
];
// Mapa dinámico de cuentas (correo→{nombre,rol}) que vive en Firebase.
// Se llena en runtime desde state.cuentasCustom para no tener que redesplegar.
export let CUENTAS_DINAMICAS = {};
export function setCuentasDinamicas(arr){
  const m={};
  (arr||[]).forEach(u=>{ const e=(u.email||"").trim().toLowerCase(); if(e) m[e]={ nombre:u.nombre||e, rol:u.rol||"Telemarketing" }; });
  CUENTAS_DINAMICAS=m;
}
// Todas las cuentas autorizadas = fijas (código) + dinámicas (Firebase).
export function todasLasCuentas(){ return { [CUENTA_ROOT]: CUENTA_ROOT_DATOS, ...CUENTAS_DINAMICAS }; }
export function cuentaAutorizada(email){
  const e=(email||"").trim().toLowerCase();
  // Firebase manda. La llave maestra entra siempre, pase lo que pase.
  return e===CUENTA_ROOT || !!CUENTAS_DINAMICAS[e];
}
export function cuentaDeEmail(email){
  const e=(email||"").trim().toLowerCase();
  // Firebase manda; si la llave maestra no está en Firebase, se usa su rol fijo.
  if(CUENTAS_DINAMICAS[e]) return CUENTAS_DINAMICAS[e];
  if(e===CUENTA_ROOT)      return CUENTA_ROOT_DATOS;
  return { nombre: e || "Usuario", rol: "Telemarketing" };
}

// Lista efectiva de usuarios = fijos (nunca se borran) + dinámicos (Firebase).
// Mantiene compatibilidad: los usuarios actuales siempre funcionan.

