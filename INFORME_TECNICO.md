# Informe técnico — Acción del Sur (versión "modelo del acta")

**Carpeta analizada:** `/home/shared/proyecto_cgic/accion_del_sur_proyecto`
**Repositorio de referencia:** `../accion_del_sur` (`git@github.com:JuanLoncharich/accion_del_sur.git`)
**Fecha de relevamiento:** 2026-10-03

## Método

- Lectura estática del código fuente de esta carpeta.
- Volcado del esquema real de MySQL con `SHOW CREATE TABLE`, de solo lectura, sobre la base `accion_del_sur_proyecto`.
- Llamadas de solo lectura a la API en ejecución (`localhost:3012`).
- Lectura del `git log` de `../accion_del_sur`.

No se modificó código ni datos.

> **Aviso sobre `AUDITORIA_ACTA_CODIGO.md`:** varias afirmaciones de esa auditoría ya no coinciden con el código actual. Este informe las corrige donde corresponde:
> - Hoy **sí** existen `GET/POST /api/donors`.
> - El formulario de donación **sí** captura nombre, contacto y ciudad.
> - Las series semanales y recientes del Dashboard **ya se calculan**.
> - Vite apunta a `3012`, no a `3002`.

> **Hallazgo de procedencia:** el contenido de esta carpeta es idéntico al commit `867332ad` de `../accion_del_sur`, ubicado en la rama `backup/estado-2026-08-14` (2026-08-14 03:04 UTC, ya publicada en `origin`). Solo hay tres excepciones:
> - `frontend/vite.config.js`: puertos 5000/3012 en lugar de 5173/3002.
> - `start.sh` y `stop.sh`: nuevos.
>
> La comparación excluyó `node_modules`, `.env`, `.logs` y `uploads`.

---

## 1. Modelo de datos (MySQL)

Fuente: esquema real de la base `accion_del_sur_proyecto` y modelos en `backend/src/models/*.js`. Las relaciones se definen en `backend/src/models/index.js`.

Las tablas se crean con `sequelize.sync({ alter: false })` (`backend/server.js:64`). Luego `backend/src/config/ensureSchema.js` agrega columnas faltantes con `ALTER TABLE` idempotentes. No hay migraciones versionadas.

| Tabla (modelo) | Columnas | PK | FK | UNIQUE |
|---|---|---|---|---|
| `usuarios` (`User`/`Usuario`) | id, email VARCHAR(255), password VARCHAR(255), role ENUM('VOLUNTARIO','ADMINISTRADOR') | id | — | `email` |
| `donantes` (`Donor`/`Donante`) | id, name VARCHAR(150), contact VARCHAR(255), city VARCHAR(120), registered_by | id | registered_by → usuarios.id (CASCADE) | **ninguna** |
| `donaciones` (`Donation`/`Donacion`) | id, date DATE, donor_id, registered_by, status VARCHAR(40) DEFAULT 'confirmada' | id | donor_id → donantes.id (CASCADE); registered_by → usuarios.id (CASCADE) | — |
| `donaciones_insumos` (`DonationSupply`) | donation_id, supply_id, quantity INT DEFAULT 1 | (donation_id, supply_id) | donation_id → donaciones.id (CASCADE); supply_id → insumos.id (CASCADE) | (donation_id, supply_id), redundante con la PK |
| `categorias` (`Category`/`Categoria`) | id, name VARCHAR(100), parent_category_id | id | parent_category_id → categorias.id (SET NULL) | — |
| `insumos` (`Item`/`Insumo`) | id, name VARCHAR(200), available_quantity INT DEFAULT 0, category_id, current_center_id, is_active, token_id, attributes_hash | id | category_id → categorias.id (CASCADE). **`current_center_id` no tiene FK en la base**, aunque Sequelize declara la asociación. | — |
| `centros_recepcion` (`Center`/`CentroRecepcion`) | id, name VARCHAR(120), location VARCHAR(255), operational_status VARCHAR(100), managed_by, is_active, blockchain_contract_id | id | managed_by → usuarios.id (CASCADE) | — |
| `envios` (`Shipment`/`Envio`) | id, date DATE, reception_center_id, registered_by, confirmed TINYINT(1) DEFAULT 0 | id | reception_center_id → centros_recepcion.id (CASCADE); registered_by → usuarios.id (CASCADE) | — |
| `detalles_envio` (`ShipmentDetail`/`DetalleEnvio`) | id, shipment_id, supply_id, quantity_sent INT | id | shipment_id → envios.id (CASCADE); supply_id → insumos.id (CASCADE) | — |
| `transfers` (`TokenTransfer`) | id, item_id, from_center_id, to_center_id, quantity, reason, status, transferred_by, token_id, egreso/ingreso_blockchain_hash/tx, created_at | id | item_id → insumos; from/to_center_id → centros_recepcion; transferred_by → usuarios (todas CASCADE) | — |
| `recepciones` (`Reception`) | id, token, donor_email, donor_email_hash, salt, reception_center_id, status, anchor_hash, signature_hash, rejection_reason, operator_id, blockchain_hash, blockchain_tx, created_at, updated_at | id | reception_center_id → centros_recepcion (SET NULL); operator_id → usuarios (SET NULL) | `token` |
| `recepciones_detalles` (`ReceptionDetail`) | id, reception_id, item_id, quantity_received/accepted/rejected, rejection_reason_item | id | reception_id → recepciones (CASCADE); item_id → insumos (CASCADE) | — |

**Validaciones a nivel de modelo, no de base de datos:**
- `insumos.available_quantity` ≥ 0 (`Item.js:8`).
- `quantity` ≥ 1 en `DonationSupply.js:7`, `ShipmentDetail.js:8` y `TokenTransfer.js:12`.
- Email válido en `User.js:10`.

**Efectos de los `ON DELETE CASCADE` a tener en cuenta:**
- Borrar un **usuario** elimina en cascada los centros que gestiona, sus donantes, sus donaciones, sus envíos y sus transferencias.
- Borrar una **categoría** elimina sus insumos y, por cascada, los vínculos donación-insumo y los detalles de envío de esos insumos.
- Borrar un **centro** elimina sus envíos.
- Los endpoints de borrado de usuarios, categorías, centros e insumos ejecutan un `destroy()` real, no un borrado lógico:
  - `userController.js:42`
  - `categoryController.js:25`
  - `centerController.js:42`
  - `itemController.js:47`

**¿Hay control de duplicados de email o teléfono del donante?** Solo parcial, y a nivel de aplicación:
- `donorController.js:17-20` y `donationController.js:18-26` usan `Donor.findOrCreate({ where: { contact } })`. Si ya existe un donante con el mismo texto exacto en `contact`, se reutiliza. Si no existe, se crea.
- **No** hay índice UNIQUE sobre `donantes.contact`. Dos requests simultáneos podrían crear duplicados.
- No se normaliza el valor: mayúsculas, espacios o formatos de teléfono distintos cuentan como donantes distintos.
- Email y teléfono **no** son campos separados: ambos van en `contact`.
- Si el donante ya existe, se descartan los `name` y `city` nuevos, sin actualizar el registro.
- En la base actual no hay contactos duplicados (consulta `GROUP BY contact HAVING COUNT(*)>1` → 0 filas).

## 2. Nomenclatura: "Destino" vs. "CentroRecepcion"/Center

- **"Destino" no existe como entidad ni como tabla.** Se encontró solo como nombre de asociación: `Shipment.belongsTo(Center, { foreignKey: 'reception_center_id', as: 'destination' })` (`models/index.js:39`).
- El modelo se llama `Center` en el código y se define en Sequelize como `'CentroRecepcion'` (`models/Center.js:4`). La tabla es `centros_recepcion`.
- `models/index.js` exporta ambos alias, `Center` y `CentroRecepcion`. Igual ocurre con `Shipment/Envio`, `Item/Insumo`, `Donor/Donante`, etc.
- **Un envío apunta a un centro de recepción:** `envios.reception_center_id` → `centros_recepcion.id`.
- En la UI se usa "Centros" (`AdminCentros.jsx`, menú "Centros"). En el código heredado de distribuciones aparecen `center_id`/`center_name`.

## 3. Estados de inventario implementados

- **Estados logísticos (Recibido / Preparado / Disponible): no encontrado.** `Item` no tiene campo de estado logístico (`models/Item.js`).
- Lo que existe:
  - `insumos.available_quantity`: cantidad numérica; "disponible" está implícito si es mayor que 0.
  - `insumos.is_active` (booleano): el listado de inventario siempre lo informa como `true` o el valor guardado (`itemController.js:7`). No hay endpoint que lo cambie, porque el "delete" borra físicamente.
  - `token_status` (`pending` / `minted`): **estado de blockchain, no logístico**. Se deriva en `itemController.js:8` de si `token_id` es nulo y se muestra como "Pendiente" o "Minteado" en `frontend/src/pages/Inventario.jsx:8-9`. En la base actual, 0 de 20 insumos tienen `token_id`.
- **Estados de otras entidades**, no del insumo:
  - `donaciones.status` (siempre `'confirmada'`, `donationController.js:42`).
  - `envios.confirmed` (booleano).
  - `recepciones.status` (`processing`/…).
  - `transfers.status` (`pending`/`anchored`/`local`).

## 4. Historia (git log de `../accion_del_sur`)

El repositorio tiene **21 commits** en total, considerando todas las ramas.

| Hecho | Respuesta | Evidencia |
|---|---|---|
| Primer commit | **2026-03-27 00:58:36 UTC**, `7dd6cb88` "Big commit" (JuanLoncharich) | `git log --all --reverse` |
| Introducción de MySQL | **Desde el primer commit.** `7dd6cb88` ya incluye `mysql2` en `backend/package.json` y `dialect: 'mysql'`. Toda la historia del 27/03 es de un solo día, así que el desarrollo previo a esa fecha **no está en git** (no encontrado). | `git log -S'mysql2'`, `git log -S"dialect: 'mysql'"` |
| ¿Se usó Firebase alguna vez? | **No.** Las únicas apariciones de "firebase"/"firestore" en la historia están dentro de `frontend/node_modules/@reduxjs/toolkit/src/query/tests/queryFn.test.tsx`, un archivo de pruebas de una dependencia de terceros. Ese `node_modules` se versionó por error en `7dd6cb88` y se eliminó en `b4a243a5`. Fuera de eso, solo aparece en `AUDITORIA_ACTA_CODIGO.md` (commit `867332ad`), donde se menciona como requisito del acta. | `git grep -i firebase $(git rev-list --all)` |
| Inicio del refactor al modelo del acta | **No hay commits intermedios.** El modelo nuevo (`Donor`, `Shipment`, `ShipmentDetail`, `DonationSupply`, `Reception`) aparece por primera vez en `867332ad`, del **2026-08-14 03:04 UTC**: "Backup: estado completo del working tree (seeder demo, modelos Donor/Shipment, landing, controladores, frontend)". Ese commit está en la rama `backup/estado-2026-08-14` (+2187/−3906 líneas, 64 archivos). Los archivos de `_backups/fase0-20260803-232153/` sugieren que el trabajo comenzó alrededor del **2026-08-03**, pero eso surge del nombre de carpeta, no de git. | `git log -- backend/src/models/Shipment.js` |

**Ramas:**
- `main` y `proyecto` apuntan al mismo commit, `fc9be717` "Finishing" (2026-03-27 19:34).
- `backup/estado-2026-08-14` → `867332ad`.
- `origin/copilot/estimate-price-blockchain-donations` → `fa4ff0e5` (2026-03-28).

**Commits por autor (rama `main`):** JuanLoncharich (mayoría), JulianIgnFer24 ("Implementacion de chat LLM") y diegoforni ("Add donation reception feature…").

## 5. Framework backend, librerías y validaciones

**Backend** (`backend/package.json`):
- Node.js + **Express 5** (`express ^5.2.1`).
- ORM **Sequelize 6** + driver `mysql2`.
- `jsonwebtoken`, `bcryptjs`, `express-validator 7`, `multer 2` (subida de imágenes), `cors`, `dotenv`, `nodemailer`.
- `@stellar/stellar-sdk 14` (blockchain).

**Frontend** (`frontend/package.json`):
- React 19, Vite 8, React Router 7, Tailwind CSS 4.
- Axios, Recharts 3, lucide-react, `qrcode`.

**Validaciones del lado del servidor:**
- `express-validator` en rutas:
  - `auth.js`: login (`username` o `email` + `password`); `register` (email válido, contraseña de 6 o más caracteres, rol válido).
  - `users.js`: POST con las mismas reglas.
  - `donations.js`: `category_id` entero, `quantity` ≥ 1, `center_id`, lat/long, `donor_email` opcionales.
  - `donors.js`: `name` y `contact` no vacíos.
  - `donationReceptions.js`: `donor_email`, `details[]`.
  - `distributions.js`: reglas presentes pero inútiles, porque el handler devuelve 409.
- Controles manuales en controladores:
  - `donationController.js:8-10`: cantidad entera ≥ 1 y existencia de la categoría.
  - `transferController.js:48-71`: origen ≠ destino, cantidad, existencia, ubicación y stock suficiente.
- Validaciones de Sequelize: `min` en cantidades, `isEmail` en usuario, `allowNull: false`.
- Middleware `errorHandler.js`: traduce `SequelizeValidationError` a 400 y `SequelizeUniqueConstraintError` a 409.
- Rate limit en memoria (60 req/min por IP) solo en las rutas públicas de recepciones (`middleware/publicRateLimit.js`).
- **Sin validación** en:
  - `centers` (POST/PUT): no exige `name`; si falta, falla la restricción NOT NULL de la base y responde 500.
  - `categories` (POST/PUT): no valida el nombre ni evita ciclos en `parent_category_id`.
  - `items` (PUT).
  - `users` (PUT).
- Detalle de `donors`: `donorController.js:16` repite el control de `name` y `contact`, pero no llama a `validationResult`, así que las reglas de la ruta no cortan el request.

**Validaciones del lado del cliente:**
- Atributos HTML `required` (por ejemplo, nombre del centro en `AdminCentros.jsx:138`).
- Controles con toasts en `NuevaDonacion.jsx:115-129`, por ejemplo: "Ingresá el contacto del nuevo donante".
- No se usa ninguna librería de formularios ni de esquemas.

## 6. Autenticación

- **Mecanismo:** JWT sin estado, no sesiones.
  - `authController.js:6-10` firma `{ id, email, role }` con `JWT_SECRET`; la expiración se toma de `JWT_EXPIRES_IN` (por defecto `7d`).
  - El cliente lo guarda en `localStorage` (`frontend/src/context/AuthContext.jsx:17-18`).
  - El cliente lo envía como `Authorization: Bearer …` (`frontend/src/services/api.js:7-11`).
  - El middleware `authenticate` verifica el token y vuelve a leer el usuario de la base (`middleware/auth.js:4-14`).
- **Login:** acepta `email` o `username`. El valor literal `admin` se traduce a `admin@acciondelsur.org` (`authController.js:18`). No existe columna `username`.
- **Logout:** solo del lado del cliente; borra el token y el usuario de `localStorage` (`AuthContext.jsx:28-32`). No hay revocación en el servidor. Un 401 de la API fuerza el logout (`api.js:16-20`).
- **Hash de contraseñas:** `bcryptjs` con 10 rondas, mediante hooks `beforeCreate` y `beforeUpdate` (`models/User.js:19-24`, `30`).
- **Roles:** `VOLUNTARIO` (por defecto) y `ADMINISTRADOR` (ENUM en `usuarios.role`).
- **Permisos en el backend:**
  - `requireAdmin` protege `/api/users/*`, `/api/auth/register` y la escritura de `/api/categories` (POST/PUT/DELETE).
  - Todo lo demás solo requiere estar autenticado. **En particular, crear, editar y eliminar centros no exige rol administrador** (`routes/centers.js`). Verificado: un voluntario obtiene 200 en `GET /api/centers` y 403 en `GET /api/users`.
- **Permisos en el frontend:** `PrivateRoute adminOnly` en `/admin/categorias`, `/admin/usuarios` y `/admin/centros` (`App.jsx:22-27`, `53-55`). El menú de administración se muestra solo a `ADMINISTRADOR` (`Sidebar.jsx:89`).
- **No encontrado:** recuperación de contraseña, refresh tokens, bloqueo por intentos fallidos, rate limit en `/login`.

## 7. Dashboard

**Librería de gráficos:** Recharts (`frontend/src/pages/Dashboard.jsx:5`).

**Datos:** se obtienen de `GET /api/dashboard/summary` una sola vez al montar la pantalla (`Dashboard.jsx:40-41`). No hay refresco periódico ni actualización en vivo (push).

**Cálculo** (`backend/src/controllers/dashboardController.js`):

| Métrica / visual | Cómo se calcula | Se muestra en UI |
|---|---|---|
| Total Donaciones | `Donation.count()` (línea 5) | Sí, tarjeta |
| Ítems en Stock | `SUM(insumos.available_quantity)` (línea 7) | Sí, tarjeta |
| Distribuciones (= envíos realizados) | `Shipment.count({ where: { confirmed: true } })` (línea 9) | Sí, tarjeta "Distribuciones" |
| Categorías Activas | `Category.count()` (línea 93): cuenta **todas** las categorías, porque no existe campo de actividad | Sí, tarjeta |
| Destinos alcanzados | Centros distintos con al menos un envío confirmado (líneas 10-16) | **No.** Se calcula y se devuelve como `reachedDestinations`, pero ninguna tarjeta lo muestra |
| Stock por categoría | Suma de `available_quantity` agrupada por nombre de categoría (líneas 99-103) | Sí, `BarChart` y `PieChart` "Distribución del Inventario" |
| Donaciones últimas 8 semanas | SQL agrupado por lunes de cada semana: número de donaciones y suma de `donaciones_insumos.quantity`; rellena con ceros (líneas 22-40, 105-115) | Sí, `LineChart` |
| Donaciones recientes | Últimas 5 donaciones; muestra solo el **primer** insumo de cada una (líneas 42-61) | Sí, lista |
| Distribuciones recientes | Últimos 5 envíos aplanados por detalle; incluye envíos **no confirmados** (líneas 63-84) | Sí, lista |

**Valores actuales** (verificados vía API): 14 donaciones, 2562 unidades en stock, 3 envíos confirmados, 11 categorías, 3 destinos alcanzados. Los envíos provienen exclusivamente del seeder `backend/src/seeders/demo.js:204-247`.

**Métricas afectadas por el 409 de envíos.** Todo flujo de envío en la API devuelve 409 (`distributionController.js:3`, `43-47`), no existe `/api/shipments` (verificado: 404) y `Shipment.prototype.confirmarEnvio` (`models/Shipment.js:12-30`) no se invoca en ningún lugar. Por eso, estas métricas **no pueden cambiar desde la aplicación**:
- "Distribuciones" (envíos confirmados).
- "Destinos alcanzados" (además, no se muestra).
- "Distribuciones recientes".
- "Ítems en Stock" y "Stock por categoría": solo suben, porque las donaciones suman stock pero ningún envío lo descuenta. La única salida de stock disponible es editar manualmente la cantidad del insumo.

**Landing pública** (`landingController.js`):
- `beneficiariesReached` se calcula igual que "destinos alcanzados".
- `deliveredVolume` en realidad es el stock disponible, no lo entregado.
- `recentMovements` y `categoryBreakdown` devuelven arreglos vacíos fijos.

## 8. Infraestructura real

**Cómo se ejecuta hoy:**
- `start.sh` lanza con `setsid` dos procesos en modo desarrollo: `node server.js` (backend, :3012) y `npm run dev`, es decir, el servidor de desarrollo de Vite (frontend, :5000). Escribe los logs en `.logs/backend.log` y `.logs/frontend.log`. Omite cualquier puerto que ya esté ocupado.
- `stop.sh` mata el PID que escucha en cada puerto.
- No hay supervisor (systemd, pm2): si la máquina se reinicia, los procesos no vuelven a levantarse.

**Puertos:**
- Backend: `PORT=3012` en `backend/.env`. El valor por defecto en el código es `3001` (`server.js:26`).
- Frontend: `5000` (`frontend/vite.config.js:9`), con `host: true`, accesible por la red, incluida la IP ZeroTier `10.147.19.102`.
- Vite actúa como proxy de `/api` y `/uploads` hacia `http://localhost:3012` (`vite.config.js:10-19`).
- El proyecto original `../accion_del_sur` corre en paralelo en 5173/3001.
- `README.md` todavía documenta 3001/5173.

**Build y archivos estáticos:**
- No se usa `vite build` en el arranque.
- Existe un `frontend/dist/index.html`, pero ningún servidor lo sirve.
- El backend sirve `/uploads` como estático (`server.js:39`).

**Docker / Nginx / Certbot / SSL:** **no encontrado.** No existen `Dockerfile`, `docker-compose.yml`/`compose.yml`, configuración de Nginx ni scripts de Certbot. No hay HTTPS: todo es HTTP plano.

**Base de datos:** MySQL local (`DB_HOST=localhost:3306`). Esquema creado por `sequelize.sync` y `ensureSchema.js`.

**Variables de entorno** (`backend/.env`, cargado con `dotenv`):
- DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD.
- JWT_SECRET, JWT_EXPIRES_IN.
- PORT, NODE_ENV, FRONTEND_URL (CORS).
- STELLAR_ENABLED, STELLAR_NETWORK, STELLAR_PUBLIC_KEY, STELLAR_SECRET_KEY, SOROBAN_CONTRACT_ID, SOROBAN_CONTRACT_DONACIONES, SOROBAN_CONTRACT_ENTREGAS, CENTRO_WASM_HASH, SOROBAN_CONTRACT_SFT, SFT_WASM_HASH.
- UPLOADS_PATH.
- OPENAI_API_KEY, LLM_MODEL, LLM_BASE_URL.
- SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM.

**Manejo de secretos:**
- Los secretos reales (JWT, clave secreta Stellar, OpenAI, SMTP, contraseña de DB) están en texto plano en `backend/.env`. Ese archivo está excluido por `.gitignore` (`.env`, `.env.*`, `!.env.example`).
- `backend/.env.example` está desactualizado: puerto 3001, base `accion_del_sur`, sin las variables SOROBAN/LLM.
- No hay gestor de secretos.
- **Hay JWT de prueba hardcodeados** en `test_final.sh:5`, `debug_transfer.sh:5`, `test_completo_sistema.sh:6`, `test_transferencias_100.sh:5` y `verificar_blockchain.sh:9`. Pertenecen al esquema anterior (`username`, `role: "admin"`) y ya expiraron alrededor del 2026-04-03.
- `NODE_ENV=development` hace que Sequelize registre todas las consultas SQL en el log (`config/database.js:11`).

## 9. CI/CD

**No encontrado.** No existe `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile` ni configuración equivalente, ni en esta carpeta ni en `../accion_del_sur`. El despliegue es manual, con `start.sh`/`stop.sh`.

## 10. Backups

- **Backup de base de datos: no encontrado.** No hay scripts con `mysqldump` ni tareas cron del proyecto. El crontab del usuario no contiene tareas relacionadas con Acción del Sur, y `/etc/cron.d` no tiene entradas del proyecto.
- `_backups/fase0-20260803-232153/` contiene solo copias manuales de 6 archivos de código (`Center.js`, `Donation.js`, `DonationSupply.js`, `Item.js`, `ensureSchema.js`, `index.js`) del modelo anterior. No es un backup de datos.
- La rama git `backup/estado-2026-08-14` es un respaldo del código, no de la base.

## 11. Tests

- **Tests automatizados (unitarios o de integración): no encontrado.** No hay archivos `*.test.*`/`*.spec.*`, carpetas `__tests__` ni configuración de Jest o Vitest. Ningún `package.json` define un script `test`.
- Existen scripts bash manuales de "smoke test" con `curl`:
  - `test_completo_sistema.sh`
  - `test_final.sh`
  - `test_transferencias_100.sh`
  - `verificar_blockchain.sh`
  - `debug_transfer.sh`
- Esos scripts:
  - apuntan a `localhost:3001`, que es el backend del **proyecto original**, no a este;
  - usan JWT hardcodeados del esquema anterior, ya expirados;
  - prueban endpoints de centros, donaciones, transferencias, ítems y distribuciones del modelo anterior.
- En consecuencia, **no prueban esta versión.**
- `reporte_test_sft.md` y los `reporte_poblacion_*.json` son reportes de ejecuciones pasadas sobre el modelo anterior.
- Los contratos Rust (`contrato_donaciones`, `contrato_sft`) incluyen carpetas `test_snapshots/` de Soroban, pero eso corresponde al contrato, no a la aplicación.

## 12. Estado de las historias de usuario

| HU | Estado | Motivo (una línea) |
|---|---|---|
| US-01 Dashboard | **Parcial** | Métricas reales calculadas al cargar, con 3 gráficos Recharts; "destinos alcanzados" no se muestra, no hay actualización en vivo y los envíos solo existen por seeder. |
| US-02 Registrar donantes | **Parcial** | Alta de donante (nombre, contacto, ciudad) dentro de "Registrar Donación", más `GET/POST /api/donors`; no hay edición ni baja, ni pantalla propia, y email y teléfono comparten el campo `contact`. |
| US-03 Gestionar inventario | **Parcial** | Listado, búsqueda, filtro, edición, borrado y exportación CSV; el alta solo ocurre vía donación y no hay estados logísticos. |
| US-04 Envíos que descuentan stock | **Faltante** | Modelo y método `confirmarEnvio` transaccional existen, pero no hay endpoint; los flujos de la UI reciben 409. |
| US-05 Login/logout | **Implementada** | JWT + bcrypt + `PrivateRoute`; el logout es solo del lado del cliente, sin revocación. |
| US-06 Gestionar centros de recepción | **Parcial** | CRUD funcional, pero el formulario solo carga nombre y tipo, no permite editar `location`, el backend no exige admin ni valida, y la baja es física con cascada. |
| US-07 Ver centros de recepción | **Parcial** | Listado solo en `/admin/centros` (solo admin); no muestra ubicación ni responsable; `/centers/:id/inventory` devuelve todos los insumos, no los del centro. |
| US-08 Categorías jerárquicas (admin) | **Implementada (con salvedades)** | `parent_category_id` con FK, árbol en `AdminCategorias.jsx`, alta con padre y baja (solo admin); no hay edición en la UI (aunque el `PUT` existe) ni control de ciclos, y borrar una categoría borra sus insumos en cascada. |

## 13. Criterios de aceptación (según lo que el código hace hoy)

### US-06 — Gestionar centros de recepción

1. **Dado** un usuario autenticado en `/admin/centros`, **cuando** completa "Nombre" y "Tipo" y guarda, **entonces**:
   - se ejecuta `POST /api/centers`;
   - se crea un registro en `centros_recepcion` con `location = 'Sin especificar'`, `operational_status` = tipo elegido (`acopio`/`regional`/`local`) y `managed_by` = id del usuario que lo creó;
   - el centro aparece en el listado (`AdminCentros.jsx:53`, `centerController.js:15-25`).
2. **Dado** un centro existente, **cuando** el usuario lo edita y guarda, **entonces** `PUT /api/centers/:id` actualiza solo los campos enviados (`name`, `location`, `operational_status`/`center_type`) y conserva los demás (`centerController.js:26-37`).
3. **Dado** un centro existente, **cuando** el usuario confirma "¿Estás seguro de eliminar este centro?", **entonces**:
   - `DELETE /api/centers/:id` lo borra físicamente y responde `{ message: 'Centro eliminado' }`;
   - si el centro no existe, la API responde 404 "Centro no encontrado" (`centerController.js:38-44`).

### US-07 — Ver centros de recepción

1. **Dado** un usuario autenticado (cualquier rol), **cuando** consulta `GET /api/centers`, **entonces** recibe `{ data: [...] }` con todos los centros ordenados por nombre ascendente. Cada centro incluye `center_type` (= `operational_status`) e `is_active: true` (`centerController.js:3-8`).
2. **Dado** un usuario con rol `ADMINISTRADOR`, **cuando** navega a `/admin/centros`, **entonces**:
   - ve una tarjeta por centro con su nombre, la insignia "Activo" y un desplegable "Ver detalles blockchain" (Contract ID o "No desplegado");
   - un `VOLUNTARIO` que intenta abrir esa ruta es redirigido a `/dashboard` (`App.jsx:25`, `55`).
3. **Dado** un id de centro inexistente, **cuando** se consulta `GET /api/centers/:id`, **entonces** la API responde 404 con "Centro no encontrado" (`centerController.js:9-14`).

## 14. Código blockchain / Stellar en esta carpeta

**Qué hay:**
- **Contratos Soroban en Rust**, en `backend/src/services/blockchain/`: `contrato_centro`, `contrato_donaciones`, `contrato_entregas` y `contrato_sft` (token semifungible: un `token_id = SHA256(item_id)` por insumo, con *mint*, *transfer* entre centros y *burn*).
- Un `.wasm` precompilado: `scripts/contrato_donaciones_latest.wasm`.
- **Scripts:**
  - `generar-cuenta.js`: crea y fondea una cuenta testnet.
  - `deploy-contrato.sh`/`.js` y `deploy-sft.js`: despliegue.
- **Servicios Node:**
  - `stellarService.js`: cliente Soroban/Horizon; anclaje de recepciones, egreso e ingreso entre centros. Se activa con `STELLAR_ENABLED=true`.
  - `sftService.js`: mint, transfer, burn y consultas de balance del contrato SFT. Se activa si además existe `SOROBAN_CONTRACT_SFT`.
- `backend/.env` tiene `STELLAR_ENABLED=true` y apunta a contratos en **testnet**.

**Quién lo usa:**
- `transferController.js:73`, `96-119`: transferencias entre centros. Llama a `sftService.transferBetweenCenters` **después** de confirmar en MySQL, con "degradación graceful". Se omite si los centros no tienen `blockchain_contract_id`, y **ninguno de los 4 centros lo tiene** (consulta a la base).
- `donationReceptionController.js` (recepciones con QR): calcula hashes de evidencia (`utils/cryptoEvidence.js`), mintea SFT y ancla la recepción con `stellarService.anchorDonationReception`. La tabla `recepciones` tiene 0 filas.
- `transferControllerBackup.js` y `transferControllerDebug.js`: llaman a `stellarService.registrarEgresoCentro/IngresoCentro`, pero **no están montados en ninguna ruta**.
- Frontend:
  - `BlockchainTrazabilidad.jsx`: ruta pública `/trazabilidad`. Consume `/api/landing/*`, no la blockchain directamente.
  - `Inventario.jsx`: estado Pendiente/Minteado.
  - `AdminCentros.jsx`: detalles de contrato.
  - `AuditoriaIntegridad.jsx`: usa `utils/mockBlockchainData.js` y **no está enrutado** en `App.jsx`.

**¿Lo usan los flujos del modelo del acta?** **No.**
- El alta de donaciones (`donationController.create`) no invoca ningún servicio blockchain.
- El alta de donantes, el inventario, las categorías y el Dashboard tampoco.
- Los envíos (`Shipment`) no tienen relación con blockchain.
- Solo lo usan los dos flujos heredados que quedaron fuera del acta: transferencias entre centros y recepciones con QR. En la práctica no producen transacciones, porque no hay centros con contrato desplegado ni recepciones registradas.
- Las columnas `insumos.token_id`/`attributes_hash` y `centros_recepcion.blockchain_contract_id` siguen en el esquema.
