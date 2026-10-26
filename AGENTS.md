# AGENTS.md — guía para trabajar en este repositorio

Instrucciones para agentes de código (Claude Code, Codex, Cursor, etc.) y para cualquier persona
que haga cambios. Leer esto antes de tocar el código. El contexto general está en
[README.md](README.md); el detalle, en [docs/](docs/).

## Qué es

Sistema de gestión de donaciones para emergencias (CGIC). Monorepo:

| Carpeta | Qué hay | Lenguaje |
|---|---|---|
| `backend/` | API REST Express 5 + Sequelize 6 + MySQL 8 | Node.js (CommonJS) |
| `frontend/` | SPA React 19 + Vite + Tailwind 4 | JSX (ES modules) |
| `contracts/` | Contratos Soroban (workspace Cargo): `contrato_sft`, `contrato_entregas`, `contrato_centro` | Rust |
| `deploy/` | systemd, Nginx, backup | — |

Idioma: **español rioplatense** en la interfaz, mensajes de error de la API, comentarios,
documentación y mensajes de commit. Los identificadores del código mezclan inglés (modelos,
campos: `available_quantity`, `Shipment`) y español (servicios de dominio: `anclaje.js`,
`mintearIngreso`). Seguir el estilo del archivo que se edita.

## Comandos

```bash
# Backend (desde backend/)
npm install
npm run dev                      # API con recarga (puerto: PORT de backend/.env, 3012 por defecto)
npm run seed                     # datos demo; no hace nada si ya hay donaciones
node src/seeders/demo.js --force # BORRA donaciones, insumos, centros, envíos… y vuelve a sembrar
npm run test:e2e                 # E2E contra la API levantada (E2E_API_URL, default http://localhost:3012)
npm run test:e2e -- --blockchain # además exige anclaje on-chain
npm run stellar:cuenta | stellar:desplegar | stellar:sincronizar   # ver docs/blockchain.md

# Frontend (desde frontend/)
npm install
npm run dev                      # Vite :5000, proxy de /api y /uploads a API_URL (default http://localhost:3012)
npm run build                    # genera frontend/dist

# Contratos (desde contracts/)
cargo test                       # 13 tests
stellar contract build           # o: cargo build --target wasm32v1-none --release

# Todo junto (desde la raíz)
./start.sh / ./stop.sh           # BACKEND_PORT y FRONTEND_PORT configurables
```

No hay linter ni tests unitarios de backend/frontend todavía. La verificación es:
`cargo test` (si tocaste contratos), `npm run build` en frontend (si tocaste frontend) y
`npm run test:e2e` contra una API levantada con el seed demo (si tocaste backend).

## Reglas que no se pueden romper

1. **Invariante de trazabilidad.** El saldo SFT on-chain de un centro para un insumo es igual a
   `insumos.available_quantity` cuando `insumos.current_center_id` es ese centro. **Todo código
   que cambie stock o ubicación de un insumo tiene que anclar el cambio** con
   `backend/src/services/blockchain/anclaje.js`:
   - sube stock → `anclaje.mintearIngreso(...)`
   - baja stock → `anclaje.quemarSalida(...)`
   - cambia de centro → `sftService.transferBetweenCenters(...)` (ver `transferController.js`)
   - centro nuevo → `anclaje.desplegarCentro(center)`

   Nunca modificar `available_quantity` o `current_center_id` sin esto. Si hay dudas,
   `npm run stellar:sincronizar -- --verificar` muestra diferencias.
2. **Primero la base, después la blockchain.** La operación se confirma en MySQL dentro de una
   transacción; el anclaje va **después del commit** y nunca hace fallar el request (las funciones
   de `anclaje.js` no lanzan: devuelven `{ status: 'anchored' | 'local' | 'disabled', txId }`).
   Guardar ese estado y la tx en el registro correspondiente.
3. **Toda columna nueva va en el modelo y en `backend/src/config/ensureSchema.js`.** No hay
   migraciones: `sequelize.sync()` solo crea tablas nuevas; `ensureSchema` agrega columnas a las
   existentes al arrancar (`addColumnIfMissing`). Sin esto, la columna no aparece en bases ya creadas.
4. **El sistema tiene que funcionar con `STELLAR_ENABLED=false`.** Nada de blockchain puede ser
   requisito para operar.
5. **Secretos solo en `backend/.env`** (ignorado por git). El repo es público. Nunca commitear
   claves, tokens, contraseñas ni volcados de la base. `backend/.env.example` documenta cada
   variable: si agregás una, agregala ahí.
6. **Stock con bloqueo.** Toda operación que descuente stock bloquea las filas
   (`lock: transaction.LOCK.UPDATE`, en orden de id) y valida dentro de la transacción. Usar
   `Shipment.lockAndCheckStock` / `Item.prototype.actualizarStock` como referencia.
7. **Contratos:** solo el admin escribe (`require_auth`). No agregar funciones de escritura sin
   control de acceso. Un cambio de contrato requiere redesplegar (`stellar:desplegar`) y
   `stellar:sincronizar -- --reiniciar`: los contratos viejos no se actualizan.

## Convenciones del backend

- Estructura por recurso: `routes/<recurso>.js` (rutas + validación con `express-validator`) →
  `controllers/<recurso>Controller.js` (lógica) → `models/` (Sequelize). Montar la ruta en
  `server.js`.
- Auth: `authenticate` en toda ruta no pública; `requireAdmin` para escritura de administración
  (`middleware/auth.js`). `req.user = { id, email, role }`. Roles: `VOLUNTARIO`, `ADMINISTRADOR`.
- Errores: lanzar `Object.assign(new Error(msg), { status, payload })` o devolver
  `res.status(4xx).json({ error })`. `errorHandler` responde `{ error, ...payload }`. Conflictos de
  negocio → `409` con detalle útil. Validación → `400 { error: 'Datos inválidos', details }`.
- Borrados con dependencias: `utils/deleteGuard.js` (`destroyIfUnused`) → `409` con conteos.
- Modelos: tablas en español (`insumos`, `envios`), campos en inglés, `timestamps: false` en casi
  todos. Asociaciones y alias en `models/index.js` (usar los alias: `currentCenter`, `category`,
  `destination`, `details`, `supply`…).
- Listados: la forma de respuesta no es uniforme (ver [docs/api.md](docs/api.md#formas-de-respuesta)).
  Para recursos nuevos usar `{ total, page, data }` con `?page=&limit=`.

## Convenciones del frontend

- Llamadas a la API solo con `src/services/api.js` (axios con `baseURL: '/api'`, agrega el JWT y
  redirige a `/login` ante un 401).
- Sesión: `useAuth()` de `src/context/AuthContext.jsx` (`user`, `login`, `logout`); token y usuario
  en `localStorage`.
- Notificaciones: `const addToast = useContext(ToastContext)` (de `components/Layout.jsx`).
- Rutas en `src/App.jsx` con `PrivateRoute` (`adminOnly` para admin). Menú en
  `components/Sidebar.jsx` (`NAV_ITEMS`, `ADMIN_ITEMS`).
- Estilos: clases de Tailwind en línea (paleta slate + naranja/esmeralda/ámbar ya usada). Íconos:
  `lucide-react`; para categorías, `utils/icons.jsx`.
- Fechas `YYYY-MM-DD` (columnas `DATE`): construir con `new Date(\`${v}T00:00:00\`)` para no
  correrlas un día por zona horaria.
- La landing pública (`src/pages/Landing.jsx`, ruta `/`) usa su propia paleta con colores
  explícitos (constante `C`) y la fuente Archivo: no usar las clases `slate-*` ahí, porque
  `src/index.css` las redefine para el sistema interno. Sus datos vienen de `/api/landing/*`
  (públicos: nunca exponer datos de donantes ni usuarios). Imágenes en `public/assets/proyecto/`.

## Recetas

Pasos completos (agregar endpoint, columna, pantalla, función de contrato; probar; desplegar)
en [docs/desarrollo.md](docs/desarrollo.md).

## Dónde está cada cosa

| Necesito… | Archivo |
|---|---|
| Rutas y ejemplos de la API | [docs/api.md](docs/api.md) |
| Modelo de datos, pantallas, decisiones | [docs/arquitectura.md](docs/arquitectura.md) |
| Contratos y flujo on-chain | [docs/blockchain.md](docs/blockchain.md) |
| Servidor, servicios, firewall | [docs/despliegue.md](docs/despliegue.md) |
| Qué falta y limitaciones conocidas | [docs/estado-y-pendientes.md](docs/estado-y-pendientes.md) |
| Confirmación de envío con bloqueo | `backend/src/models/Shipment.js` |
| Anclaje on-chain de cada operación | `backend/src/services/blockchain/anclaje.js` |
| Hashes de evidencia de recepciones | `backend/src/utils/cryptoEvidence.js` |
| Columnas agregadas al arrancar | `backend/src/config/ensureSchema.js` |

`docs/historial/` describe versiones anteriores: **no** es la referencia del código actual.

## Trampas conocidas

- **No correr `npm run test:e2e` contra la base del despliegue de la VM**: crea centros, insumos y
  movimientos "[E2E]" reales (y anclados en la blockchain) que aparecen en la landing pública.
  Usarlo contra una base de desarrollo.
- `npm run seed` no hace nada si ya hay donaciones. `--force` borra envíos, donaciones, insumos,
  categorías, centros y donantes (nunca usuarios); no borra explícitamente transferencias ni
  recepciones (dependen de cómo estén las FK en esa base) ni toca los saldos on-chain. Con
  blockchain activa, correr `npm run stellar:sincronizar -- --reiniciar` después.
- `stellarService` y `sftService` leen el `.env` **al cargarse**: cambiar `.env` requiere reiniciar
  el backend.
- Una transferencia mueve `current_center_id` del insumo completo aunque se transfiera una parte
  (limitación documentada en `docs/estado-y-pendientes.md`, ítem 2).
- Soroban testnet tarda ~5 s por transacción: un request que ancla N operaciones tarda ~5·N s.
- El RPC de Soroban retiene eventos ~7 días: no construir funcionalidades que dependan de
  eventos viejos; usar los hashes guardados en la base.
