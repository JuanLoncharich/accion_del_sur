# Plan de cierre del MVP — Acción del Sur (modelo del acta)

Plan **sin implementar**. Cada ítem cita el archivo afectado. Los hechos de base están en `INFORME_TECNICO.md`.

**Escala de esfuerzo:**
- **S**: hasta ½ día.
- **M**: 1 a 2 días.
- **L**: 3 días o más.

**Orden recomendado:**
1. **Paso 0:** poner la carpeta bajo git (sección 4). Así cualquier cambio posterior es reversible.
2. Envíos (sección 1).
3. Limpieza (sección 2).
4. Brechas restantes (sección 3).

---

## 1. Corregir el alta de envíos (US-04) — esfuerzo **M**

### 1.1 Backend

**Nuevo `backend/src/routes/shipments.js` montado en `/api/shipments`** (`server.js`), con todas las rutas detrás de `authenticate`:

| Método y ruta | Comportamiento |
|---|---|
| `GET /api/shipments` | Lista con `destination` y `details → supply → category`. Reutilizar la consulta de `distributionController.list`. |
| `GET /api/shipments/:id` | Detalle; 404 si no existe. |
| `POST /api/shipments` | Body: `{ date?, reception_center_id, details: [{ supply_id, quantity_sent }], confirm?: boolean }`. |
| `POST /api/shipments/:id/confirm` | Confirma un envío pendiente y descuenta stock. |
| `DELETE /api/shipments/:id` | Solo si `confirmed = false`; de lo contrario, 409. |

**Validaciones (`express-validator` + controlador):**
- `reception_center_id` debe ser un entero que exista en `centros_recepcion`; si no, 404.
- `details` debe ser un arreglo con al menos un elemento.
- En cada detalle, `supply_id` debe ser un entero existente y `quantity_sent` un entero ≥ 1.
- Agrupar los detalles con el mismo `supply_id`, sumando cantidades, antes de validar el stock.

**Transacción única** en `POST` cuando `confirm = true`, y en `/confirm`:
1. `sequelize.transaction()`.
2. Si se confirma un envío existente: bloquear la fila del envío con `Shipment.findByPk(id, { lock: t.LOCK.UPDATE })` y verificar `confirmed = false`. Esto evita confirmar dos veces en paralelo. Hoy `confirmarEnvio` (`models/Shipment.js:13`) revisa `confirmed` **sin** bloqueo.
3. Para cada insumo: `Item.findByPk(supply_id, { lock: UPDATE })`. Si `available_quantity < cantidad`, se hace rollback y se responde **409** `{ error: 'Stock insuficiente', supply_id, disponible, solicitado }`.
4. Crear `Shipment` y `ShipmentDetail`, descontar con `item.actualizarStock(-cantidad, { transaction })` y marcar `confirmed = true`.
5. Hacer commit y responder 201 con el envío completo.

**Reutilizar `Shipment.prototype.confirmarEnvio`**, que hoy no se usa en ningún lugar, con dos ajustes:
- Bloquear el envío al inicio.
- Transformar el `Error('La cantidad disponible no puede ser negativa')` de `Item.actualizarStock` (`models/Item.js:24`) en un error con `status: 409`. Hoy terminaría en un 500 a través de `errorHandler`.

**Decisión pendiente del equipo:** ¿el envío debe exigir que el insumo esté en un centro origen (`insumos.current_center_id`) y moverlo? El acta solo habla de destino; se recomienda **no** exigirlo en el MVP.

**Compatibilidad:** `GET /api/distributions` y `/api/distributions/stats` se mantienen, delegando en la misma consulta, hasta migrar `HistorialTransacciones.jsx` y `Distribuciones.jsx`.

### 1.2 Frontend

- **Reemplazar `NuevaDistribucion.jsx`** (DNI + firma + 4 llamadas que devuelven 409) por `NuevoEnvio.jsx`:
  - selección de centro destino y fecha;
  - tabla de líneas insumo/cantidad que muestra el stock disponible;
  - checkbox "confirmar ahora";
  - manejo del 409 de stock insuficiente con un toast que indique el insumo.
- **Adaptar `Distribuciones.jsx`** (historial) a la forma `destination` + `details[]`. Quitar las referencias a `receiver_identifier` y DNI (líneas 48, 122, 131). Agregar el botón "Confirmar" para los envíos pendientes.
- **Menú** (`components/Sidebar.jsx:29-30`): renombrar "Distribuir" a "Nuevo envío" y "Historial Distribuciones" a "Envíos".
- **Rutas** (`App.jsx:48-49`): pasar a `/envios/nuevo` y `/envios`, y redirigir las rutas viejas.

### 1.3 Dashboard

- La métrica de envíos realizados ya cuenta `confirmed = true` (`dashboardController.js:9`), así que se actualizará sola en cuanto existan envíos reales.
- Ajustes de presentación (`Dashboard.jsx:89-92`):
  - Renombrar la tarjeta "Distribuciones" a **"Envíos realizados"**.
  - Agregar la tarjeta **"Destinos alcanzados"** con `summary.reachedDestinations`, que ya llega desde el backend.
  - Renombrar "Categorías Activas" a "Categorías", porque cuenta todas.
- `flatRecentDistributions` (`dashboardController.js:63-84`): filtrar `confirmed: true`, o mostrar el estado en la lista.

### 1.4 Verificación

Prueba manual y, en lo posible, test automatizado (ver 3.6):
1. Un envío con stock suficiente descuenta exactamente las cantidades enviadas.
2. Un envío con una línea sin stock responde 409 y **no** modifica ningún insumo (rollback completo).
3. Confirmar dos veces el mismo envío no descuenta dos veces.
4. El Dashboard refleja el nuevo envío confirmado y los destinos alcanzados.

---

## 2. Limpieza

| Elemento | Acción | Riesgo | Esfuerzo |
|---|---|---|---|
| `backend/src/controllers/transferControllerBackup.js`, `transferControllerDebug.js` | Borrar. Ninguna ruta ni archivo los importa (verificado con `grep`). | **Bajo** | S |
| `_backups/fase0-20260803-232153/` | Borrar, o mover fuera del repo. Ya está preservado en el commit `867332ad` (6 archivos). | **Bajo**, si antes se completó la sección 4 | S |
| Rutas 409 de distribuciones: `POST /distributions`, `/prepare`, `/:id/identify-manual`, `/:id/sign`, `/:id/finalize` (`routes/distributions.js`, `distributionController.js:43-47`) | Eliminar junto con `NuevaDistribucion.jsx` **una vez** que exista `/api/shipments`. | **Medio**: mantener `GET /distributions` y `/stats` hasta migrar `HistorialTransacciones.jsx:31`, `Distribuciones.jsx:21` y la tarjeta del Dashboard | S |
| Atributos de categoría: 4 rutas `/:id/attributes*` (`routes/categories.js`, `categoryController.js:28-32`) | Eliminar. Ningún archivo del frontend las llama (verificado). Quitar también `attributes: []` del `serialize`. | **Bajo** | S |
| Auditoría: `routes/audit.js` + `auditController.js` (stubs que siempre devuelven 404) | Eliminar las rutas y el `require` en `server.js`. Sin consumidores en el frontend. | **Bajo** | S |
| `frontend/src/pages/AuditoriaIntegridad.jsx` + `utils/mockBlockchainData.js` | Eliminar. La página no está enrutada y usa datos simulados. | **Bajo** | S |
| `backend/src/seeders/index.js` y el script `npm run seed` | Reescribir o eliminar. Referencia `CategoryAttribute`, `username` y `password_hash`, que ya no existen, por lo que **falla al ejecutarse**. El seeder vigente es `seeders/demo.js`; agregar `"seed:demo"` en `package.json`. | **Bajo** | S |
| Scripts bash de test (`test_*.sh`, `debug_transfer.sh`, `verificar_blockchain.sh`, `recargar_backend.sh`) | Eliminar o mover a `docs/legacy/`. Apuntan a :3001 (proyecto original) y contienen JWT hardcodeados, ya expirados. | **Bajo**. Quitar los tokens antes de publicar | S |
| `.md` de trabajo en la raíz (`hacer.md`, `juan.md`, `diego_cacheton.md`, `cacheton_test.md`, `explicacion.md`, `ERRORES_CORREGIDOS.md`, `FRONTEND_100_COMPLETO.md`, `RESUMEN_FINAL.md`, `SOLUCION_TRANSFERENCIAS_100.md`, `VERIFICACION_FRONTEND.md`, `reporte_*.json`) | Mover a `docs/historico/`. | **Bajo**, pero revisar si el informe final cita alguno | S |
| Menú y rutas fuera del acta: "Recepciones con QR", "Transferencias", "Historial Transacciones", "Asistente de Consultas" (`Sidebar.jsx:26-32`) y la ruta pública `/trazabilidad` (`App.jsx:39`) | **Ocultar** del menú, comentando las entradas o protegiéndolas con un flag `VITE_FEATURES_EXTRA`; **no borrar** el backend. | **Medio/alto si se borra**: transferencias y recepciones QR comparten modelos (`Item.current_center_id`, `token_id`) y columnas de la base. Borrar los modelos `TokenTransfer`/`Reception` no elimina sus tablas, y el asistente LLM consulta el esquema completo | S para ocultar; L para remover |
| Código y contratos blockchain (`services/blockchain/**`, columnas `token_id`, `attributes_hash`, `blockchain_contract_id`) | **No borrar** para el MVP. Desactivar con `STELLAR_ENABLED=false` en `.env` y documentarlo como "trabajo futuro". | **Alto si se borra**: hay `require` en `transferController.js:3` y `donationReceptionController.js:4-5`, y eliminar columnas requiere una migración de datos | S para desactivar |
| `frontend/dist/` | Excluir del repo o regenerar con `vite build`. Hoy no se sirve. | **Bajo** | S |

**Recomendación:** hacer la limpieza en un commit separado del de envíos, para poder revertirla de forma independiente.

---

## 3. Otras brechas acta ↔ código, por prioridad

Fuente: `AUDITORIA_ACTA_CODIGO.md`, ajustada a lo verificado en `INFORME_TECNICO.md`.

| Prio. | Brecha | Propuesta | Esfuerzo |
|---|---|---|---|
| **P1** | **Base de datos: el acta dice Firebase; el código usa MySQL + Sequelize desde el primer commit.** | Corregir el acta. Migrar a Firebase no es razonable para el cierre. | S (documento) |
| **P1** | **Permisos de centros:** cualquier usuario autenticado puede crear, editar y borrar centros (`routes/centers.js`), aunque la UI lo restringe a administradores. | Agregar `requireAdmin` a POST/PUT/DELETE y validar `name` y `location` con `express-validator`. | S |
| **P1** | **Borrados físicos con cascada:** borrar un usuario, una categoría o un centro elimina donaciones, insumos o envíos asociados. | Para el MVP: bloquear el borrado si hay dependencias (409 con explicación). Alternativa: borrado lógico con `is_active`, que ya existe en `insumos` y `centros_recepcion`. | M |
| **P1** | **Estados de inventario** Recibido / Preparado / Disponible: no existen. | Agregar `insumos.status ENUM('RECIBIDO','PREPARADO','DISPONIBLE') DEFAULT 'RECIBIDO'` en `ensureSchema.js`, un endpoint `PATCH /api/items/:id/status`, un selector y filtro en `Inventario.jsx`, y opcionalmente exigir `DISPONIBLE` para enviar. Reemplazar la columna Pendiente/Minteado. | M |
| **P2** | **ABM de donantes incompleto:** solo hay GET/POST, sin pantalla propia; email y teléfono comparten `contact`; no hay UNIQUE. | Agregar `PUT/DELETE /api/donors/:id` y una página `Donantes.jsx`. Separar `email` y `phone` (o validar el formato de `contact`). Normalizar (trim/lowercase) y crear un índice UNIQUE sobre el contacto normalizado. | M |
| **P2** | **Envíos:** solo existe el booleano `confirmed`; el acta pide ver, editar y eliminar. | Con la sección 1 se cubren ver, crear, confirmar y eliminar pendientes. La edición de envíos pendientes queda como opcional. Estados extra (en tránsito, entregado) solo si el acta los exige. | S–M |
| **P2** | **US-07:** el inventario por centro devuelve todos los insumos (`centerController.js:49`); los voluntarios no tienen vista de centros; no se muestran ubicación ni responsable. | Filtrar por `current_center_id`. Crear una vista de solo lectura `/centros` para todos los roles, con ubicación, estado y responsable (`include manager`). Agregar `location` al formulario de `AdminCentros.jsx`. Quitar el `is_active: true` forzado en `centerController.js:3`. | S–M |
| **P2** | **Dashboard "en tiempo real"**: se consulta una sola vez al cargar. | Agregar refresco cada 30–60 s con `setInterval`, o ajustar la redacción del acta a "actualizado al consultar". | S |
| **P2** | **Infraestructura:** sin Docker, Nginx, Certbot ni HTTPS; corre con el servidor de desarrollo de Vite. | `Dockerfile` para el backend; build de Vite servido por Nginx, que además hace de reverse proxy de `/api`; `docker-compose.yml` con mysql, backend y nginx; Certbot si hay dominio. Si no hay tiempo, documentar el despliegue real y corregir el acta. | L (S si solo se documenta) |
| **P2** | **CI/CD:** no existe. | GitHub Actions mínimo: `npm ci` + `vite build` + tests del backend en cada push o PR a `main`. | S–M |
| **P2** | **Tests automatizados:** no existen. | Jest + supertest contra una base de prueba. Cubrir primero login, alta de donación (suma stock) y envíos (sección 1.4). | M |
| **P3** | **Backups de base:** no existen. | Script `scripts/backup_db.sh` con `mysqldump --single-transaction`, rotación de 7 días y entrada en cron diaria. | S |
| **P3** | **Configuración desactualizada:** `.env.example` (puerto 3001, sin SOROBAN/LLM) y `README.md` (3001/5173). | Actualizar ambos con los puertos 3012/5000 y la lista real de variables (ver informe, sección 8). | S |
| **P3** | **Datos personales:** el flujo heredado de DNI y firma está en el código, pero no funciona (409). | Al eliminar `NuevaDistribucion.jsx` (sección 2) desaparece de la UI; ajustar la sección de datos personales del acta. | S |
| **P3** | **Insumos prioritarios / puntos de recepción públicos:** el acta los menciona y no se encontraron. | Panel estático simple en la landing, o quitarlos del acta. | S |
| **P3** | **Compatibilidad de navegadores** (Chrome, Firefox, Edge): no está verificada. | Prueba manual con checklist y capturas para el informe. | S |
| **P3** | **Seguridad menor:** JWT en `localStorage`, sin rate limit en `/login`, `NODE_ENV=development` registra todo el SQL. | Rate limit en el login; `NODE_ENV=production` en el despliegue; documentar el riesgo de `localStorage`. | S |

---

## 4. Poner esta carpeta bajo git y subirla a GitHub sin perder nada

**Hecho clave:** el contenido de esta carpeta ya está casi entero en GitHub. Coincide con el commit `867332ad` de la rama `origin/backup/estado-2026-08-14` del repo `git@github.com:JuanLoncharich/accion_del_sur.git`. Solo difieren `frontend/vite.config.js` (puertos), `start.sh` y `stop.sh`. Conviene **continuar esa historia** en lugar de crear un repo nuevo sin pasado.

> No tocar `../accion_del_sur`: tiene cambios sin commitear propios (`llmController.js`, `llmChatService.js`, `BlockchainTrazabilidad.jsx`, `ConsultaAsistente.jsx`, seeders nuevos) y es el que está desplegado en `:5173`.

```bash
cd /home/shared/proyecto_cgic/accion_del_sur_proyecto

# 1. Respaldo completo antes de nada (código + base)
tar --exclude=node_modules -czf ../accion_del_sur_proyecto_$(date +%F).tgz .
mysqldump --single-transaction -u root -p accion_del_sur_proyecto > ../accion_del_sur_proyecto_$(date +%F).sql

# 2. Revisar el .gitignore antes del primer add:
#    - agregar:  backend/uploads/  .logs/  frontend/dist/
#    - ojo: '*.txt' y '**/*.wasm' ya excluyen contrato_donaciones_latest.wasm
#      y backend/chatLLM/*.txt (está bien: son artefactos)
#    - considerar versionar package-lock.json (hoy ignorado) para builds reproducibles

# 3. Inicializar sobre la historia existente SIN tocar archivos del working tree
git init -b proyecto-acta
git remote add origin git@github.com:JuanLoncharich/accion_del_sur.git
git fetch origin
git reset origin/backup/estado-2026-08-14   # mixed: mueve HEAD/índice, NO toca archivos

# 4. Verificar: solo deberían aparecer vite.config.js, start.sh, stop.sh,
#    INFORME_TECNICO.md, PLAN_CIERRE.md y lo que cambie el .gitignore
git status
git diff --stat

# 5. Comprobar que no se suben secretos
git ls-files --others --exclude-standard | grep -E '\.env$|uploads|\.log$'   # debe salir vacío
grep -rnE 'eyJhbGci|sk-[A-Za-z0-9]{20,}|S[A-Z0-9]{55}' $(git ls-files --others --exclude-standard) || true

# 6. Commit y push a una rama NUEVA (no a main)
git add -A
git commit -m "Estado del modelo del acta: puertos 5000/3012, start/stop, informe técnico y plan de cierre"
git push -u origin proyecto-acta

# 7. Proteger y documentar
git tag -a acta-v0 -m "Punto de partida del cierre del MVP" && git push origin acta-v0
```

**Después:**
- Trabajar cada bloque (envíos, limpieza, brechas) en ramas `feat/...` con PR hacia `proyecto-acta`. Eso además evidencia el uso de PR que pide el acta.
- Decidir con el equipo si `proyecto-acta` reemplaza a `main`: merge, o renombrar `main` a `legacy-blockchain`. Hacerlo recién al final, mediante PR y sin `push --force`.
- Los scripts `test_*.sh` contienen JWT ya expirados y no críticos, pero conviene quitarlos (sección 2) antes del primer push.
- **Si GitHub rechaza el push por tamaño:** verificar con `git count-objects -vH` que no entren `node_modules` ni binarios.
