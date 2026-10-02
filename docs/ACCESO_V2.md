# ImpactOS — Acceso v2 (usuarios, roles, permisos y asignación)

Documento único de referencia. Si algo aquí contradice otro archivo, manda este.

## Estado
| Entrega | Qué | Estado |
|---|---|---|
| 1 | Roles, `can()`, cupos, asignación con historial | ✅ aprobada |
| 2 | Motor por documento + migrador (dry-run real: 6,131 → 6,131, OK) | ✅ aprobada |
| 3 | Login v2, `/api/users`, store por documento, pantallas, `can()` en toda la app | 🧪 en prueba |
| 4 | Corte: `--run`, Rules en producción, borrar sistema viejo | ⏳ pendiente |

## Cómo convive con el sistema actual
Todo lo nuevo está detrás de `VITE_ACCESS_V2`.
- **Proyecto de Vercel de producción:** la variable NO existe → la app es la de siempre (login por lista, `crm_telemarketing`, permisos viejos).
- **Proyecto de Vercel de prueba** (mismo repo, mismo `main`): `VITE_ACCESS_V2=1` + Firebase de prueba con datos sintéticos.
- `/api/users` responde 503 salvo que el proyecto tenga `ACCESS_V2_API=1`.
- Todos los permisos de la app pasan por `src/auth/access.ts`. Con el interruptor apagado responde **igual** que el sistema viejo (probado: 9 roles × 18 pestañas).

## Roles y cupos (por app)
`super_admin` (global, no ocupa cupo) · `distribuidor` (máx. 2) · `supervisor` (máx. 2) ·
`telemarketing_ventas` / `telemarketing_cobranza` / `telemarketing_reclutamiento` (**6 en total**, en cualquier combinación).
Invitación pendiente ocupa cupo; `suspended` lo conserva; `inactive` lo libera.

## Qué ve cada rol
| Rol | Datos | Pestañas clave |
|---|---|---|
| Súper Admin | todo, todas las apps | todas |
| Distribuidor | toda su app | todas, incluidas Usuarios y Distribución de datos |
| Supervisor | toda su app | bases, Distribución de datos, equipo, estadísticas (no Usuarios, no Cobranza/Reclutamiento en menú) |
| TM Ventas | solo agregados/referidos/prospectos/**distribución** asignados | Agregados, Referidos, Prospección, Distribución, Llamadas, Agenda |
| TM Cobranza | **solo** cuentas de cobranza asignadas | Cobranza, Llamadas, Agenda |
| TM Reclutamiento | solo prospectos de reclutamiento asignados | Reclutamiento, Llamadas, Agenda |

## Modelo de datos
```
users/{uid}                        email, emailNormalized, nombre, role, appId, status, lastActiveAt
invitations/{correo}               role, appId, status: invited|accepted|revoked  (solo las crea el servidor)
workspaces/{appId}                 nombre, limits, counts (espejo para mostrar; la validación no lo lee)
workspaces/{appId}/records/{id}    UN documento por registro; campo section; campos de asignación
workspaces/{appId}/appts/{id}      agenda (createdByUid, assignedTo)
workspaces/{appId}/shared/{clave}  {payload} con el MISMO nombre de clave que usa la app
workspaces/{appId}/userData/{uid}  conteo de llamadas de cada persona
workspaces/{appId}/audit/{id}      bitácora del servidor
crm_telemarketing/*                sistema viejo: congelado, nunca se borra
```
- **Distribución ES Ventas. Cobranza es otra especialidad.** Una misma persona puede tener a la vez un responsable de Ventas (su registro de Distribución) y uno de Cobranza (su cuenta), sin conflicto: se asignan por separado.
- Cobranza: cada entrada de `clientesData` es `records/cob_<id>`. `linkedRecordId` apunta al cliente de Distribución **solo como identidad** (no implica mismo responsable, cola ni especialidad). La config va a `shared/cobranza`.
- Cobranza es **autosuficiente para llamar**: la migración (y el guardado v2 de cuentas nuevas) copia, sin sobrescribir, nombre/teléfono/cuenta/dirección/ciudad/cp del cliente enlazado (`contactoCopiadoDe` indica qué se copió). Nada comercial (ventas, notas, historial) viaja.
- Llamadas: el histórico viejo queda en `shared/callLog` (solo lectura); lo nuevo, en `userData/{uid}`. La app ve la suma.
- **No se migra:** `cuentasCustom`, `usuariosCustom`, `preguntasSeguridad` (sistema de acceso viejo) y `respaldos` (puede superar 1 MB; queda en `crm_telemarketing`). ⚠️ Pendiente tu aprobación sobre `respaldos`.

## Formatos históricos (dry-run real)
610 registros tienen `notas` como texto. Nada se normaliza: store, migrador y pantallas leen con `asList()` y guardan el valor tal cual.

## Seguridad
- **Cupos:** los valida `/api/users` (firebase-admin) recontando miembros reales en una transacción. Para el cliente, `invitations`, `counts` y `limits` son de solo lectura.
- **Roles y estados:** solo el servidor los cambia. Desde un teléfono nadie se sube el rol.
- **Alta de usuario:** solo aceptando SU invitación con SU Google, con el rol y la app de la invitación.
- **Desactivar:** el perfil se marca `inactive`, se cierran sus sesiones (`revokeRefreshTokens`), la app lo saca al instante y borra la copia local del teléfono.
- **Telemarketing:** consulta `assignedTo == su uid` por cada sección suya; las Rules rechazan cualquier otra consulta. No puede cambiar responsable, historial de asignación ni sección.
- **Asignar/reasignar:** transacción + `update()` de solo campos de asignación. Notas, mensajes, historial, llamadas, citas y seguimientos no viajan en la escritura.
- **Mover de app:** solo Súper Admin, con cupo en destino y sin registros asignados.

## Agenda v2 (solo ACCESS_V2)
- Lógica pura en `src/services/agendaV2.ts`; botones y paneles en `src/components/agenda/AgendaV2Extras.tsx`.
- La cita se confirma en la llamada: no hay estados "por confirmar/confirmada" ni asignación obligatoria (`assignedTo: null` es válido).
- Hora LOCAL del navegador (Texas) en fechas por defecto, Hoy / Próximas / Sin resultado y Centro de mando (`localDateTimeValue`, `fechaLocal`), nunca `toISOString()`.
- Quien agenda (`createdByUid/Name`) no es quien visita: el resultado lo registra el staff y queda `resultByUid/Name/At`. La TLK crea, edita datos, reprograma y cancela sus citas; no registra resultados (UI, store y Rules).
- Reprogramar (antes de la visita): misma cita + `reprogramHistory` (`reason: "before_visit"`). Reprogramada en visita: la original conserva fecha y resultado; se crea una cita nueva con el creador original, `reprogrammedFromApptId` y `createdFrom: "reprogramada_visita"`. Cuenta como Visita, no como Demo ni Venta.
- Cancelar (`status: "cancelada"`, `cancelledAt/ByUid/ByName`, `cancelReason`) en vez de borrar; el borrado físico queda solo para Súper Admin/Distribuidor. Las canceladas no cuentan en Centro de mando ni en "Sin resultado".
- Venta desde la Agenda: se localiza el registro por `sourceSection/sourceRecordId/sourceRefIndex`; el teléfono solo se usa en citas antiguas sin traza.
- Google Calendar dice "Agendada por"; Apple Calendar por archivo .ics; "Cómo llegar" con la dirección de la cita. Sin `TEAM_CONTACTS` en v2.
- **Seguridad r2 (firestore.rules `appts`):**
  - CREATE de telemarketing: `createdByUid == uid`, `assignedTo == null` (no existe asignación de vendedor; así nadie hace visible un cliente a otra TLK), tipo permitido por rol (`apptTypeAllowed` = `TIPOS_AGENDA_POR_ROL`: ventas cita/llamada · cobranza llamada · reclutamiento entrevista/llamada), `_type == tipo` y nace limpia (sin resultado, cancelación, `resultBy*`, monto, cartucho_meses, `reprogramHistory`, `createdFrom`, `reprogrammedFromApptId`, servicio*, `_sincronizado`, `_cliente*`). El staff no tiene estas limitaciones.
  - UPDATE de telemarketing por **allowlist** (`affectedKeys().hasOnly`): nombre, telefono, direccion, ciudad, cp, fecha, notas, reprogramHistory y los campos de cancelación. Cualquier otro campo (presente o futuro) queda fuera.
  - Cancelar: solo a `cancelada`, con `cancelledByUid == uid` y `cancelledAt`. Una cita cancelada es solo lectura para la TLK (no reactiva ni edita); el staff la gestiona.
  - Reprogramar: cambiar `fecha` exige agregar UNA entrada a `reprogramHistory` (se conservan las anteriores) con `changedByUid == uid`, `reason == "before_visit"` y `newDate == fecha`.
  - **Nombres (decisión):** `createdByName` y `cancelledByName` NO se validan contra `users/{uid}.nombre`: el servidor puede renombrar usuarios (`usersCore.rename`) y una sesión abierta conservaría el nombre anterior, lo que rechazaría citas legítimas. El **UID es la autoridad**; el nombre es de presentación y lo genera el store desde el usuario autenticado.
  - **r3 — cita con resultado = solo lectura para la TLK:** si `resultado` no está vacío (incluye legacy `venta`/`no_venta`), la TLK no edita, no cambia fecha, no reprograma ni cancela; puede verla, llamar, escribir por WhatsApp y abrir Maps. El staff la sigue gestionando. Mismo criterio en Rules (`tmActualizaOk`), store y UI (`accionesCitaV2`).
  - **r3 — registro de origen en CREATE de telemarketing (`tmSourceOk`):** sin `sourceRecordId`/`sourceSection`/`sourceRefIndex` = cita manual (permitida). Si vienen: el registro debe existir en el mismo workspace, con la misma sección, `assignedTo == uid` y sección de SU especialidad (`seccionDeRol` = `SECTIONS_FOR_ROLE`). Ruta real según `docIdFor`: Cobranza en `records/cob_<clave>` (la app usa la clave como id), el resto en `records/<id>`. Referidos: se valida el anfitrión; sin `sourceRefIndex` es la cita del anfitrión (permitida); si viene, es la POSICIÓN del referido (lista, o valores de un mapa legacy en orden, no la clave) y debe ser menor que el tamaño de `referidos`, que debe existir. El staff no tiene esta restricción.
  - El store (`storeCore.apptDoc`) aplica los mismos criterios para no intentar escrituras que Firestore rechazaría.
- `EntrevistaModal` en v2: sin invitados precargados ni lista de `TEAM_CONTACTS` (correos de la app legacy); se conserva "Otro correo". Legacy sin cambios.
- **Paleta oficial (r5, solo v2)** — fuente única `PALETA_TIPOS` en `src/services/agendaV2.ts`: Cita verde (#16a34a, Google colorId 10) · Servicio rojo (#dc2626, 11) · Entrevista morado (#7c3aed, 3) · Cocinada amarillo (#eab308; texto #a16207 por contraste, 5) · Recordatorio naranja (#ea580c, 6; "recordatorio" legacy = mismo naranja) · Personal azul (#2563eb, 9). Reset, seguimiento, pendiente, reprogramada_visita y cancelada NO son categorías. `App.tsx` deriva de ella `TYPE_OPTIONS`, `EVENT_CONFIG.colorId`, `TIPO_COLOR` (puntos y leyenda) y el borde lateral (`colorBordeCita`); legacy conserva sus colores. Una cancelada conserva su tipo, pero se ve gris (borde y punto), atenuada, con fecha tachada y las insignias "Tipo · Cancelada", en la lista y en el calendario.
- Duplicados: la misma advertencia (Volver / Guardar de todos modos) al agendar desde la Agenda y desde Llamadas → Cita agendada; primero por `sourceRecordId`/`sourceRefIndex`, teléfono solo en citas sin traza. La TLK solo compara contra las citas que puede leer (las suyas). Tras guardar desde Llamadas se ofrecen Google y Apple Calendar.

## Servicio v2 (solo ACCESS_V2)
- Lógica pura en `src/services/serviceV2.ts`; UNA tarjeta de acciones (`ServicioAccionesV2`) y la pestaña (`ServiciosV2`) en `src/components/servicio/ServicioV2.tsx`. La Agenda (tipo servicio) usa la misma tarjeta.
- Servicio = postventa, NO demostración. **Venta durante servicio** → `servicioResultado: "venta"`, `resultado: "venta_servicio"`: cuenta Venta + Volumen + Servicio realizado, nunca Demo (`contarVentasDemosV2`, usada por `contarVentasDemos` en v2). Servicios legacy con `demo_venta`/`venta` se leen igual: venta sin demo. Sin migración.
- Resultados reales: pendiente · realizado · venta · no_recibio · no_visito (no se colapsan a `no_realizado`; el legacy `no_realizado` se sigue mostrando como "No se realizó"). Cada resultado guarda `resultByUid/Name/At` y una entrada en `servicioHistorial` con `uid` y `nombre` (y `agente` por compatibilidad). Notas con `uid`, `nombre`, `fecha`, `texto`.
- **Reprogramar** (reemplaza a Reset en v2): misma cita, nueva fecha, `reprogramHistory` (la estructura de Agenda) y queda pendiente. **Cancelar**: `status: "cancelada"` + quién/cuándo/motivo; no se borra, queda en Todos/Cancelados, fuera de Pendientes, Hoy y métricas. Con resultado final el servicio queda cerrado (sin Reprogramar/Cancelar); el staff puede "Corregir resultado" (queda en el historial). Borrado físico: misma política administrativa (`canHardDelete`).
- Métricas por la fecha REAL del resultado (`serviceMetricDate` = `resultAt` en hora local, o `fecha` en legacy): servicios realizados (Control de actividad) y venta/volumen de servicio.
- Filtros: Hoy (activos) · Todos (incluye cancelados) · Pendientes · Hechos (realizado + venta) · No realizados (no recibió, no se visitó, legacy no_realizado) · Cancelados. Color del tipo: rojo (#dc2626); los estados tienen sus propios colores.
- Cliente: al crear un Servicio desde la Agenda se busca el cliente (Distribución primero; opción "Servicio manual") y se guarda `sourceRecordId/sourceSection/sourceRefIndex`. Cartuchos y filtros conserva el origen SOLO cuando se conoce (cliente de su sección o cita con traza); si no, no se inventa. Hora local en todos los servicios creados.
- Duplicados (`duplicateServiceCandidate`, aviso con Volver / Guardar de todos modos): mismo origen (+ índice de referido) o, sin origen, mismo teléfono; producto compatible; ±3 días (±7 para el mantenimiento automático). Una cita comercial nunca es duplicado de un servicio. El mantenimiento tras una venta (`createdFrom: "service_maintenance"`, `maintenanceFromApptId`) no se crea dos veces en silencio.
- **r1.1** · % de cierre = ventas originadas en DEMO ÷ demos (las ventas de servicio suman Ventas y Volumen, no el cierre). Persona de una venta de servicio = `resultByName` (legacy: `agente`; sin ninguno: nadie) en `contarVentasDemos`, semana del agente, racha e incentivos. Estadísticas "Por grupo" incluye citas/servicios del grupo por `sourceSection` (sin source → ningún grupo). La venta de servicio guarda `cartucho_meses` y aparece en Cartuchos y filtros desde su fecha real local. Corregir una venta quita monto y `cartucho_meses` y CANCELA (no borra) su mantenimiento automático; una venta nueva reemplaza al anterior sin duplicarlo.
- **Corregir resultado** (servicio con resultado final): aviso "Estás corrigiendo un resultado ya registrado" (+ métricas de venta/volumen si era venta); elegir el nuevo resultado NO guarda: se confirma con "Resultado actual / Nuevo resultado" → Confirmar corrección / Volver. El documento queda limpio (Venta → No recibió: `venta:false`, sin monto ni `cartucho_meses`) y `servicioHistorial` conserva la venta y agrega la corrección (`correction: true`, `previousResult`, `previousMonto`, `previousProducto`).
- Duplicado de servicio también al **agendar desde la tarjeta del cliente** (misma regla y aviso que Agenda y Cartuchos; ±3 días; una cita comercial no cuenta).
- Permisos: el Supervisor tiene `servicios.manage` (mismas acciones operativas que Distribuidor/Súper Admin en este módulo; nada más). Telemarketing no gestiona Servicio (UI y Rules, sin cambios en `firestore.rules`).

## Índices
Todas las consultas son de igualdad (`assignedTo`, `section`, `appId`, `status`): Firestore las resuelve con sus índices automáticos. `firestore.indexes.json` queda vacío a propósito.

## Pruebas
- Unitarias (52): roles, cupos, migrador, formatos, store, asignación, API, equivalencia con el sistema viejo.
- Rules (13 escenarios): **Actions → "Firestore Rules — pruebas en emulador"**. Usa el emulador oficial, sin credenciales ni proyecto real.

## Montar el entorno de prueba (una vez)
1. **Firebase de prueba:** console.firebase.google.com → Agregar proyecto → `impactos-test`. Build → Authentication → Google: habilitar. Build → Firestore → Crear base de datos.
2. **Rules en el proyecto de PRUEBA** (no en producción): Firestore → Reglas → pegar `firestore.rules` → Publicar.
3. **Config web:** Configuración del proyecto → Tus apps → Web (`</>`) → copiar el objeto `firebaseConfig` como JSON en una línea.
4. **Cuenta de servicio de prueba:** Configuración → Cuentas de servicio → Generar clave privada.
5. **GitHub Secret nuevo:** `FIREBASE_SERVICE_ACCOUNT_TEST` = ese JSON (distinto al de producción).
6. **Segundo proyecto en Vercel:** Add New → Project → mismo repo `Florestomas323/Impactos`, nombre `impactos-v2-test`. Environment Variables (todas):
   - `VITE_ACCESS_V2` = `1`
   - `VITE_FIREBASE_CONFIG` = el JSON del paso 3
   - `ACCESS_V2_API` = `1`
   - `FIREBASE_SERVICE_ACCOUNT` = el JSON del paso 4
7. **Dominio autorizado:** Firebase de prueba → Authentication → Configuración → Dominios autorizados → agregar la URL `*.vercel.app` del paso 6.
8. Abre la app de prueba y entra con Google una vez (verás "Cuenta sin acceso": es normal).
9. Actions → **"Prueba — sembrar datos sintéticos"** → tu correo. Crea tu Súper Admin de prueba y ~125 registros inventados.
10. Recarga la app de prueba: entras como Súper Admin.

El proyecto de Vercel de producción **no se toca**: sin esas variables sigue igual.

## Checklist de pruebas manuales (en la app de prueba)
- [ ] Súper Admin entra y ve todo
- [ ] Invitar 1 distribuidor, 1 supervisor y 6 telemarketing; el 7.º es rechazado con mensaje claro
- [ ] Cada invitado entra con su Google y llega con su rol
- [ ] Correo no invitado ve "Cuenta sin acceso"
- [ ] Desactivar a alguien con la app abierta: sale al instante
- [ ] TM Ventas ve solo sus registros; no ve Cobranza ni Reclutamiento
- [ ] TM Cobranza ve solo sus cuentas de Cobranza (con nombre y teléfono), nunca Distribución
- [ ] TM Ventas ve su Distribución asignada, nunca Cobranza
- [ ] TM Reclutamiento ve solo sus prospectos
- [ ] Asignar 30 "ya contactados, sin venta, +30 días" a una TM
- [ ] Reasignar esos registros a otra TM: notas, historial y seguimientos intactos
- [ ] Intentar asignar un registro ya asignado sin "Reasignar": no se duplica
- [ ] Retirar datos: quedan sin asignar y conservan todo
- [ ] Un registro con notas en texto se abre, se edita y sigue en texto
- [ ] Carga de trabajo muestra asignados / pendientes / trabajados / citas / ventas

## Entrega 4 (corte) — resumen
Súper Admin real a mano → Rules en producción → `migrate.mjs --run` → variables v2 en el proyecto de producción → borrar `accounts.ts`, `legacyPermissions.ts`, la rama legacy de `access.ts` y `useSharedState`. Vuelta atrás: republicar Rules viejas y quitar las variables.
