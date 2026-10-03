# Cambios del cierre del MVP — Acción del Sur

**Fecha:** 2026-10-03 · **Rama:** `proyecto-acta` · **Plazo:** 2026-10-05
**Alcance aprobado:** bloques 0 a 4. No se implementó ningún otro ítem de `PLAN_CIERRE.md`.

Las cinco etapas (bloques 0 a 4) se completaron y verificaron contra la API real (`localhost:3012`, base `accion_del_sur_proyecto`). `../accion_del_sur` no se tocó: sigue en `fc9be717` con sus 8 cambios sin commitear, y su despliegue en `:5173`/`:3001` sigue activo. El entorno de desarrollo de este proyecto (`:5000`/`:3012`) sigue funcionando.

> **⚠ Pendiente del usuario: nada se publicó en GitHub.** El `git push` fue bloqueado por el control de permisos de la sesión. Todo está commiteado **localmente**. Para publicar:
>
> ```bash
> cd /home/shared/proyecto_cgic/accion_del_sur_proyecto
> git push -u origin proyecto-acta
> git push origin feat/envios feat/estados-inventario feat/borrados feat/infra
> git push origin acta-v0
> ```

## Historial (primer padre de `proyecto-acta`)

```
*   62d0a778  Merge feat/infra: bloque 4 — infraestructura mínima
|\  9d0ff748  feat(infra): despliegue mínimo con Nginx, systemd y backup diario
*   827d2b99  Merge feat/borrados: bloque 3 — borrados con dependencias
|\  27238ace  feat(borrados): bloquear borrados con dependencias (409 con detalle)
*   21a9dbe0  Merge feat/estados-inventario: bloque 2 — estados de inventario
|\  4bcfee02  feat(inventario): estados logísticos RECIBIDO/PREPARADO/DISPONIBLE
*   ee39d268  Merge feat/envios: bloque 1 — envíos (US-04)
|\  e14d192a  feat(envios): alta de envíos con descuento transaccional de stock (US-04)
*   e146d925  Estado del modelo del acta (tag acta-v0)
*   867332ad  Backup: estado completo del working tree  ← origin/backup/estado-2026-08-14
```

Cada bloque se desarrolló en su propia rama y se integró con `git merge --no-ff`. Este archivo se agrega en un commit final sobre `proyecto-acta`.

---

## Bloque 0 — Git

**Qué se hizo:**
- **Backups previos**, ambos con permisos 600 porque contienen `backend/.env`:
  - `../accion_del_sur_proyecto_2026-10-03.tgz`: código sin `node_modules`, 243 entradas.
  - `../accion_del_sur_proyecto_2026-10-03.sql`: `mysqldump --single-transaction`, 12 tablas.
- **`.gitignore`:** se agregaron `backend/uploads/*` (con excepción para `.gitkeep`), `.logs/` y `frontend/dist/`. `node_modules/` pasó a `node_modules`, porque `backend/node_modules` es un **symlink** al proyecto original y el patrón con barra final no lo excluía.
- **Inicialización:** `git init -b proyecto-acta` y `git reset` (mixed) sobre `origin/backup/estado-2026-08-14`. El working tree no se modificó.
- **Archivos que dejaron de versionarse** con `git rm --cached` (siguen en disco): `backend/uploads/*.png` (4) y `frontend/dist/index.html`.
- **Commit** `e146d925` y tag anotado `acta-v0` (locales).

**Verificación de secretos:**
- El diff commiteado no tiene secretos.
- En el árbol versionado solo aparecen los JWT hardcodeados de `test_*.sh`, `debug_transfer.sh` y `verificar_blockchain.sh`. Son del esquema anterior (`username`, `role: "admin"`), **vencieron el 2026-04-03** y ya estaban públicos en `origin` desde marzo.
- `backend/.env` está ignorado.

**No hecho:** `git push` (bloqueado; ver aviso arriba).

## Bloque 1 — Envíos (US-04)

**Backend:**
- **`/api/shipments`** (`routes/shipments.js`, `controllers/shipmentController.js`):

  | Endpoint | Comportamiento |
  |---|---|
  | `GET` | Filtros `status=confirmed\|pending`, `reception_center_id`, `from`, `to` y paginación. |
  | `GET /:id` | Detalle del envío. |
  | `POST` | Body `{ reception_center_id, date?, confirm?, details: [{ supply_id, quantity_sent }] }`. Valida con `express-validator`, agrupa líneas repetidas del mismo insumo y verifica existencia y stock aunque el envío quede pendiente. |
  | `POST /:id/confirm` | Confirma y descuenta stock. |
  | `DELETE /:id` | Solo envíos pendientes; un envío confirmado devuelve 409. |

- **`Shipment.confirmarEnvio`** (`models/Shipment.js`): una única transacción que:
  - bloquea la fila del envío con `FOR UPDATE`, lo que evita la doble confirmación;
  - bloquea los insumos ordenados por id, para evitar deadlocks;
  - si falta stock, responde **409 `{ error, supply_id, available, requested }`**;
  - si todo está bien, descuenta el stock.
- **`errorHandler`** incluye `err.payload` en la respuesta.
- **Dashboard:** "envíos recientes" solo muestra envíos confirmados.

**Frontend:**
- **`NuevoEnvio.jsx`** reemplaza a `NuevaDistribucion.jsx` (eliminado). Tiene destino, fecha, varias líneas de insumo con el stock visible, aviso de stock insuficiente por línea, la opción "Confirmar ahora", y un toast con el detalle del 409.
- **`Distribuciones.jsx`** pasó a ser el historial de envíos: filtros por estado, destino y fechas; detalle desplegable; botones Confirmar y Eliminar para los pendientes.
- **Rutas:** `/envios` y `/envios/nuevo`. `/distribuciones` y `/distribuciones/nueva` redirigen. Menú: "Nuevo envío" y "Envíos".
- **Dashboard:**
  - "Distribuciones" pasó a llamarse **"Envíos realizados"**.
  - Nueva tarjeta **"Destinos alcanzados"**.
  - "Categorías Activas" pasó a llamarse **"Categorías"**.
  - La lista se llama ahora "Últimos envíos confirmados".

**Verificaciones del plan 1.4.** Se hicieron contra la API real con insumos de prueba preexistentes (25 "Aceite de girasol TEST" y 26 "Buzo invierno TEST") y destino el centro 5:

| # | Prueba | Resultado |
|---|---|---|
| 1 | Envío confirmado con stock suficiente (25×2, 26×1) | ✅ HTTP 201, envío 8. Stock 25: 5 → 3; stock 26: 2 → 1 (descuento exacto). |
| 2 | Envío con una línea sin stock (25×1, 26×5) | ✅ HTTP 409 `{"supply_id":26,"available":1,"requested":5}`. Ningún stock cambió (25 = 3, 26 = 1). |
| 2b | Mismo insumo repetido en dos líneas (25×3 + 25×1, con stock 3) | ✅ HTTP 409, `requested: 4`: las líneas se suman. |
| 2c | Confirmar un pendiente cuando otro ya consumió el stock | ✅ 1.º HTTP 200; 2.º HTTP 409 `available: 0`. El stock quedó en 0, no negativo. |
| 3 | Doble confirmación: 2 requests **concurrentes** + 1 secuencial sobre el envío 9 | ✅ Concurrentes: uno HTTP 200 y otro HTTP 409. Secuencial: HTTP 409 "El envío ya fue confirmado". Stock 25: 3 → 2 (una sola vez). |
| 3c | Eliminar pendiente / eliminar confirmado | ✅ HTTP 200 / HTTP 409 "No se puede eliminar un envío confirmado…". |
| 4 | Dashboard | ✅ `totalDistributions` 3 → 6, `reachedDestinations` 3 → 4, `totalItemsInStock` 2562 → 2557 (−5 = unidades enviadas). Las recientes solo muestran confirmados. |
| — | Validación | ✅ `details: []` → HTTP 400; centro inexistente → HTTP 404. |
| — | Compilación | ✅ `vite build` sin errores; el servidor de desarrollo compila las 5 vistas cambiadas (HTTP 200). |

## Bloque 2 — Estados de inventario

**Backend:**
- **Columna nueva:** `insumos.status ENUM('RECIBIDO','PREPARADO','DISPONIBLE') NOT NULL DEFAULT 'RECIBIDO'`, agregada en `ensureSchema.js` con el mecanismo idempotente existente.
- **Backfill de una sola vez:** se ejecuta **solo al crear la columna** y pasa a `DISPONIBLE` los insumos con `available_quantity > 0`.
- **Donaciones:** un insumo nuevo se crea en `RECIBIDO`; una donación sobre un insumo existente no toca su estado.
- **`PATCH /api/items/:id/status`:** requiere autenticación y valida el estado con `isIn`. Se agregó el filtro `GET /api/items?status=`, también validado.
- **Envíos:** solo admiten insumos `DISPONIBLE`, tanto al crear como al confirmar. Si no, responden 409 `{ error, supply_id, status }`.

**Frontend:**
- **`Inventario.jsx`:** cada tarjeta tiene un selector de estado que reemplaza la insignia Pendiente/Minteado, y hay un filtro por estado. El contador "Minteados" pasó a ser "Disponibles".
- **`NuevoEnvio.jsx`:** solo deja elegir insumos `DISPONIBLE`.

**Verificaciones:**

| Prueba | Resultado |
|---|---|
| Backfill | ✅ 19 insumos con stock > 0 → `DISPONIBLE`; 1 con stock 0 → `RECIBIDO`. |
| Idempotencia (reinicio del backend tras cambiar el insumo 7 a `PREPARADO`) | ✅ La columna no se vuelve a crear y el insumo 7 sigue `PREPARADO`. |
| `PATCH` válido / estado inválido / id inexistente / sin token | ✅ HTTP 200 / HTTP 400 (lista los valores permitidos) / HTTP 404 / HTTP 401. |
| Donación que crea un insumo nuevo | ✅ Insumo 27 "Insumo prueba estados TEST" creado en `RECIBIDO`. |
| Donación a insumo existente en `PREPARADO` (insumo 7) | ✅ Sigue `PREPARADO`; stock 205 → 206. |
| Envío con insumo `PREPARADO` / `RECIBIDO` | ✅ HTTP 409 "… no está DISPONIBLE (estado actual: …)". |
| Pendiente creado con el insumo `DISPONIBLE` que luego pasa a `PREPARADO`, y después se confirma | ✅ HTTP 409; stock intacto. |
| Filtro `?status=` | ✅ RECIBIDO 1, PREPARADO 2, DISPONIBLE 18; valor inválido → HTTP 400. |
| Compilación | ✅ `vite build` OK. |

## Bloque 3 — Borrados con dependencias

**Backend:** `utils/deleteGuard.js` abre una transacción, bloquea la fila con `FOR UPDATE`, cuenta las dependencias y solo ejecuta `destroy()` si no hay ninguna. Si las hay, responde **409 `{ error, dependencies }`**, con un mensaje que dice qué bloquea el borrado y cuántos registros. Dependencias controladas:

| Entidad | Dependencias que bloquean |
|---|---|
| Usuario | Donaciones registradas, donantes registrados, centros a cargo, envíos registrados, transferencias. Borrar el propio usuario sigue respondiendo 400. |
| Categoría | Subcategorías, insumos. |
| Centro | Envíos, insumos ubicados en el centro, transferencias. |
| Insumo | Líneas de donación, detalles de envío, transferencias, detalles de recepción. |

**Frontend:**
- Usuarios, categorías y centros ya mostraban `error.response.data.error` como toast; ahora ese texto incluye el detalle del bloqueo.
- Los toasts de error duran 8 s (antes 4 s) y tienen ancho máximo, para que el detalle se lea.
- Inventario no tiene botón de borrar: el borrado de insumos solo existe por API.

**Verificaciones:**

| Prueba | Resultado |
|---|---|
| `DELETE /users/4` | ✅ HTTP 409 "tiene 4 donaciones registradas, 3 donantes registrados, 2 centros a cargo, 2 envíos registrados". |
| `DELETE /categories/3` / `DELETE /categories/8` | ✅ HTTP 409 "2 subcategorías, 1 insumos" / "6 insumos". |
| `DELETE /centers/3` | ✅ HTTP 409 "2 envíos, 20 insumos ubicados en el centro, 1 transferencias". |
| `DELETE /items/7` | ✅ HTTP 409 "2 líneas de donación, 1 detalles de envío, 1 transferencias, 1 detalles de recepción". |
| Propio usuario / centro inexistente | ✅ HTTP 400 / HTTP 404. |
| Borrado sin dependencias (usuario, categoría y centro creados para la prueba) | ✅ HTTP 200 en los tres. |
| Integridad tras los intentos bloqueados | ✅ 3 usuarios, 11 categorías, 4 centros, insumo 7 intacto. |
| Borrado exitoso de un **insumo** | ⚠ No verificado: la API no permite crear un insumo sin donación, así que todo insumo tiene al menos una línea de donación y su borrado siempre queda bloqueado (comportamiento esperado). |

## Bloque 4 — Infraestructura mínima (sin Docker)

**La máquina:**
- **Equipo:** VM de **Oracle Cloud**, región `sa-santiago-1`, shape `VM.Standard.A1.Flex` (ARM64), hostname `instance-20251104-1550`, con Ubuntu 24.04.4 LTS.
- **IPs:**
  - pública `136.248.240.73`, con NAT de OCI a la privada;
  - privada `10.0.0.195`;
  - ZeroTier `10.147.19.102`.
- **Puertos:** **80 ocupado solo en `127.0.0.1`** por el contenedor Docker `scl-dashboard`, de otro proyecto; 443 libre.
- **Software:** Nginx y Certbot no instalados.
- **Permisos:** el usuario no tiene sudo sin contraseña.
- **Disco raíz al 97 %**, con unos 5.9 GB libres.

**Qué se creó:**
- **`deploy/nginx/accion-del-sur.conf`:**
  - Sirve `/var/www/accion-del-sur`, una copia de `frontend/dist`, porque `www-data` no puede leer `/home/shared`, que tiene permisos 770.
  - Hace proxy de `/api/` y `/uploads/` a `127.0.0.1:3012`.
  - SPA con `try_files`, gzip, cache larga para `/assets/`, headers de seguridad y `client_max_body_size 6m`.
  - **Escucha en `10.0.0.195:80` y `10.147.19.102:80`**, no en `0.0.0.0:80`, por el conflicto con `scl-dashboard`.
- **`deploy/systemd/accion-del-sur-backend.service`:** `NODE_ENV=production`, `Restart=on-failure`, usuario `juanloncha`.
- **`deploy/scripts/backup_db.sh`:**
  - `mysqldump --single-transaction`, gzip -9 y verificación con `gzip -t`.
  - Credenciales por un archivo de opciones temporal: nunca aparecen en `ps`.
  - Permisos 600 y rotación de 7 días.
  - Línea de crontab documentada.
- **`deploy/README.md`:** datos de la VM, instalación paso a paso, apertura a Internet (OCI e iptables), HTTPS, actualización, rollback y problemas conocidos.
- **`backend/.env.example`:** reescrito con las variables que el código realmente lee y placeholders sin secretos.
- **`README.md`:** puertos reales (5000/3012 en desarrollo, 80 en producción), arranque con `start.sh`, seeder `demo.js`, variables y API actualizada.

**Verificaciones:**

| Prueba | Resultado |
|---|---|
| `vite build` | ✅ `dist/index.html` + CSS 59.7 KB + JS 864.7 KB (aviso no bloqueante de chunk > 500 KB). |
| Config de Nginx: `nginx -t` | ✅ "syntax is ok / test is successful". Se probó en un contenedor `nginx:1.27-alpine` efímero (`--rm`), solo para validar: el despliegue **no** usa Docker. |
| Build servido detrás de la config real (contenedor de prueba en `127.0.0.1:18080`; solo cambiaron la línea `listen` y nada más) | ✅ `/`, `/dashboard`, `/envios/nuevo` e `/inventario` → 200 con la SPA. JS → 200 gzip con `Cache-Control: public, immutable`. Asset inexistente → 404. `/api/health` → ok. Login → token. `/api/dashboard/summary`, `/api/shipments` → 200. `/uploads/*.png` → 200 `image/png`. Headers de seguridad presentes en `/`. Contenedor detenido y eliminado. |
| Unit de systemd: `systemd-analyze verify` | ✅ Sin advertencias sobre el unit (solo avisos de otros servicios ya instalados en la VM). |
| Backend con `NODE_ENV=production` (prueba en `:3013`) | ✅ health OK, login 200, 0 líneas de SQL en el log; proceso detenido. |
| `backup_db.sh` real | ✅ `accion_del_sur_proyecto_20261003-230708.sql.gz` (12 tablas, "Dump completed", permisos 600). Rotación: borró el archivo de prueba de 10 días, conservó el de 2 días y el de otra base. Ningún proceso mostró la contraseña. |

**Comandos que requieren sudo o cambian el entorno (no ejecutados, para el administrador):** están en `deploy/README.md`, en orden. En resumen:
1. `rm backend/node_modules && (cd backend && npm install --omit=dev)`: dependencias propias en lugar del symlink al proyecto original.
2. `sudo apt-get install -y nginx`, quitar `sites-enabled/default`, `rsync` de `dist` a `/var/www/accion-del-sur`, copiar y enlazar el sitio, `net.ipv4.ip_nonlocal_bind=1`, `nginx -t`, `systemctl enable --now nginx`.
3. `./stop.sh`, copiar el unit, `systemctl daemon-reload`, `systemctl enable --now accion-del-sur-backend`, ajustar `FRONTEND_URL=http://10.147.19.102`.
4. Agregar al crontab: `15 3 * * * /home/shared/proyecto_cgic/accion_del_sur_proyecto/deploy/scripts/backup_db.sh >> /home/juanloncha/backups/accion_del_sur/backup.log 2>&1`.
5. Opcional, para Internet: regla de ingreso en OCI + `iptables` + dominio y Certbot.

Hasta que se ejecuten, el sistema sigue en modo desarrollo en `:5000`/`:3012`.

---

## Datos de prueba que quedaron en la base

Las verificaciones se hicieron contra la base real. Quedaron estos registros, reconocibles por "TEST" o "prueba":
- **Envíos confirmados** 8, 9 y 10, al centro 5, con los insumos 25 y 26. Los envíos 11 y 12 fueron eliminados.
- **Stock:** el insumo 25 pasó de 5 a 2 y el 26 de 2 a 0.
- **Insumo 27** "Insumo prueba estados TEST" (3 unidades, `RECIBIDO`), donante `prueba.estados@test.local` y 2 donaciones. Una de ellas sumó +1 al insumo 7 (205 → 206).
- **Dashboard:** las donaciones pasaron de 14 a 16, los envíos realizados de 3 a 6 y los destinos alcanzados de 3 a 4.
- Los usuarios, la categoría y el centro creados para probar borrados ya fueron eliminados.

Para volver al estado previo, restaurar `../accion_del_sur_proyecto_2026-10-03.sql`. **Atención:** eso también descarta la columna `status`, que se vuelve a crear al reiniciar el backend.

## Qué quedó fuera (no aprobado o no alcanzado)

- **Ítems de `PLAN_CIERRE.md` fuera del alcance aprobado:**
  - `requireAdmin` y validación en `/api/centers`.
  - ABM completo de donantes.
  - Vista de centros para voluntarios y filtro por centro en `/centers/:id/inventory`.
  - Refresco automático del Dashboard.
  - CI/CD.
  - Tests automatizados.
  - Limpieza de código legacy: rutas 409 de distribuciones, atributos de categoría, `transferControllerBackup/Debug.js`, `_backups/`, scripts `test_*.sh`, `seeders/index.js` roto.
  - Ocultar los módulos blockchain, QR y LLM.
  - Corrección del acta (Firebase → MySQL).
- **Docker, HTTPS y Certbot:** no se implementaron. HTTPS requiere un dominio.
- **`git push`:** bloqueado por permisos de la sesión; comandos arriba.
- **Pasos con sudo y crontab:** documentados, no ejecutados.
- **Observados al pasar, no corregidos por estar fuera de alcance:**
  - la tarjeta de inventario muestra "Actualizado: Invalid Date", porque `insumos` no tiene `updated_at`;
  - el bundle JS pesa 864 KB, sin code splitting.

## Estado actualizado de las historias de usuario

| HU | Estado | Motivo |
|---|---|---|
| US-01 Dashboard | **Implementada** (con salvedad) | Envíos realizados y destinos alcanzados ya reflejan envíos reales y se muestran; se actualiza al cargar la pantalla, sin refresco automático. |
| US-02 Registrar donantes | **Parcial** | Alta y selección de donante (nombre, contacto, ciudad) dentro de la donación; sigue sin edición ni baja, ni campos separados de email y teléfono. |
| US-03 Gestionar inventario | **Implementada** (con salvedades) | Estados Recibido/Preparado/Disponible con selector y filtro, búsqueda, CSV y edición; el alta de insumos sigue siendo solo por donación. |
| US-04 Envíos que descuentan stock | **Implementada** | `/api/shipments` transaccional con bloqueo de filas, 409 por stock o estado, sin doble confirmación; UI de alta, historial, confirmación y baja de pendientes. |
| US-05 Login/logout | **Implementada** | JWT + bcrypt + rutas protegidas; el logout sigue siendo solo del lado del cliente. |
| US-06 Gestionar centros | **Parcial** (mejorada) | CRUD funcional y borrado protegido por dependencias; la API sigue sin exigir rol admin y el formulario no carga ubicación. |
| US-07 Ver centros | **Parcial** | Sin cambios: el listado solo está en la pantalla de administración y el inventario por centro devuelve todos los insumos. |
| US-08 Categorías jerárquicas | **Implementada** (mejorada) | Árbol padre/subcategorías solo para admin; borrar una categoría con subcategorías o insumos ahora se rechaza con 409 en lugar de borrar en cascada. |
