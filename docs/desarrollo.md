# Guía de desarrollo

Cómo hacer cambios de punta a punta. Las reglas que no se pueden romper están en
[AGENTS.md](../AGENTS.md#reglas-que-no-se-pueden-romper); conviene leerlas antes.

## Entorno local

Requisitos: Node.js ≥ 20, MySQL 8. Para contratos: Rust (`rustup`), target `wasm32v1-none` y,
opcional, [Stellar CLI](https://developers.stellar.org/docs/tools/cli).

```bash
git clone git@github.com:JuanLoncharich/accion_del_sur.git && cd accion_del_sur

mysql -u root -p -e "CREATE DATABASE accion_del_sur CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

cd backend && cp .env.example .env     # DB_PASSWORD y JWT_SECRET como mínimo
npm install && npm run seed
cd ../frontend && npm install
cd .. && ./start.sh                     # backend :3012, frontend :5000
```

Usuario demo: `admin` / `admin123`. Sin configurar Stellar, todo funciona con la blockchain
apagada (`STELLAR_ENABLED=false`); para desarrollar algo que la toque, ver
[«Blockchain en desarrollo»](#blockchain-en-desarrollo).

Si MySQL no está instalado, alcanza con Docker:

```bash
docker run -d --name accion-mysql -e MYSQL_ROOT_PASSWORD=dev -e MYSQL_DATABASE=accion_del_sur -p 3306:3306 mysql:8
```

## Flujo de trabajo

1. Rama desde `main`: `git switch -c feat/<tema>`.
2. Cambios + verificación (ver [«Antes de commitear»](#antes-de-commitear)).
3. Commits en español, en imperativo, explicando el porqué: `Envíos: impedir confirmar sin stock`.
4. PR contra `main`. Al mergear, desplegar ([«Desplegar»](#desplegar)).

## Recetas

### Agregar un campo a una tabla existente

Ejemplo: `insumos.expiration_date`.

1. Modelo (`backend/src/models/Item.js`):
   ```js
   expiration_date: { type: DataTypes.DATEONLY, allowNull: true },
   ```
2. Migración idempotente (`backend/src/config/ensureSchema.js`, dentro de `runMigrations`):
   ```js
   await addColumnIfMissing('insumos', 'expiration_date', '`expiration_date` DATE NULL');
   ```
   Si la columna es `NOT NULL`, darle `DEFAULT` y, si hace falta, un backfill con `UPDATE` debajo.
3. Exponerlo: validación en la ruta (`express-validator`), lectura en el controlador
   (`req.body.expiration_date`) y, si se muestra, en la página del frontend.
4. Reiniciar el backend: la columna se crea sola (`[DB] Columna añadida: insumos.expiration_date`).

### Agregar una tabla nueva

1. `backend/src/models/<Modelo>.js` con `sequelize.define('NombreEnEspañol', {...}, { tableName: 'tabla_en_español', timestamps: false })`.
2. Registrarlo y declarar asociaciones en `backend/src/models/index.js`, y exportarlo.
3. `sequelize.sync()` la crea al arrancar. Columnas que se agreguen **después** → receta anterior.

### Agregar un endpoint

Ejemplo: `GET /api/centers/:id/resumen` (admin).

1. Controlador (`backend/src/controllers/centerController.js`):
   ```js
   exports.resumen = async (req, res, next) => {
     try {
       const center = await Center.findByPk(req.params.id);
       if (!center) return res.status(404).json({ error: 'Centro no encontrado' });
       const insumos = await Item.count({ where: { current_center_id: center.id } });
       return res.json({ id: center.id, name: center.name, insumos });
     } catch (error) { return next(error); }
   };
   ```
2. Ruta (`backend/src/routes/centers.js`), con validación si recibe datos:
   ```js
   router.get('/:id/resumen', authenticate, requireAdmin, [param('id').isInt({ min: 1 })], centerController.resumen);
   ```
   Recurso nuevo → archivo nuevo en `routes/` y `app.use('/api/<recurso>', ...)` en `server.js`.
3. Si devuelve listas: `{ total, page, data }` con `?page=&limit=`.
4. Documentarlo en [docs/api.md](api.md) y, si es un flujo importante, agregar verificaciones a
   `backend/scripts/e2e/flujo-completo.js`.

### Agregar una operación que cambia stock o ubicación

Es el caso delicado (invariante on-chain). Patrón, tomado de `donationController.create` y
`shipmentController`:

```js
const t = await sequelize.transaction();
try {
  const item = await Item.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });   // bloquear
  // validar reglas de negocio dentro de la transacción (stock, estado, centro)
  await item.actualizarStock(-cantidad, { transaction: t });                      // nunca < 0
  // crear el registro de la operación (con columnas blockchain_status / blockchain_tx)
  await t.commit();
} catch (e) { if (!t.finished) await t.rollback(); throw e; }

// después del commit: anclar y guardar el resultado (no lanza)
const anclado = await Item.findByPk(id, { include: [{ model: Category, as: 'category' }, { model: Center, as: 'currentCenter' }] });
const r = await anclaje.quemarSalida({ item: anclado, center: anclado.currentCenter, cantidad, referencia: `mi-operacion:${registro.id}`, operatorId: req.user.id });
await registro.update({ blockchain_status: r.status, blockchain_tx: r.txId });
```

Agregarla también a la línea de tiempo de `itemController.trazabilidad` para que aparezca en
**Ver trazabilidad**, y a `scripts/stellar/sincronizar.js` si cambia la ubicación de forma nueva.
Verificar con `npm run test:e2e -- --blockchain` y `npm run stellar:sincronizar -- --verificar`.

### Agregar una pantalla

1. `frontend/src/pages/MiPagina.jsx`: datos con `api` (`src/services/api.js`), avisos con
   `ToastContext`, estilos Tailwind como en las páginas vecinas (por ejemplo `PanelApoyo.jsx`, que es corta).
2. Ruta en `frontend/src/App.jsx`: `<Route path="/mi-pagina" element={<PrivateRoute><MiPagina /></PrivateRoute>} />`
   (`adminOnly` si corresponde).
3. Entrada de menú en `frontend/src/components/Sidebar.jsx` (`NAV_ITEMS` o `ADMIN_ITEMS`, ícono de `lucide-react`).
4. `npm run build` en `frontend/` para confirmar que compila.

### Cambiar la landing

`frontend/src/pages/Landing.jsx` (ruta `/`). Los textos y listas (pasos, funciones, equipo) están
en constantes al principio del archivo. Usa colores explícitos (constante `C`), no las clases
`slate-*` (redefinidas en `src/index.css`). Las imágenes van en `public/assets/proyecto/`, en
WebP y de menos de 400 kB. Los datos en vivo vienen de `GET /api/landing/summary` y
`/recent-movements` (`backend/src/controllers/landingController.js`): todo lo que se agregue ahí
es público, así que nunca datos de donantes ni de usuarios.

### Cambiar un contrato

1. Editar `contracts/<contrato>/src/lib.rs` y sus tests (`#[cfg(test)]` al final del archivo).
   Toda función que escriba debe exigir la firma del admin (`admin.require_auth()`).
2. `cd contracts && cargo test`.
3. Si cambian funciones o argumentos que usa el backend, actualizar `sftService.js` /
   `stellarService.js` (los `ScVal` tienen que coincidir con los tipos de Rust; los structs se
   codifican como mapas con claves en orden alfabético — ver `_metadataToScVal`).
4. Compilar y redesplegar: los contratos de Soroban no se actualizan en el lugar.
   ```bash
   stellar contract build
   cd ../backend && npm run stellar:desplegar && npm run stellar:sincronizar -- --reiniciar
   ```
   Reiniciar el backend. Los registros viejos conservan sus tx (siguen visibles en el explorador),
   pero los saldos pasan a los contratos nuevos.

## Blockchain en desarrollo

Cada desarrollador puede tener su propia cuenta y contratos en testnet (gratis):

```bash
cd contracts && stellar contract build
cd ../backend && npm run stellar:cuenta && npm run stellar:desplegar && npm run stellar:sincronizar
```

Cada operación tarda ~5 s en confirmarse. Para trabajar rápido en algo que no toca la cadena,
`STELLAR_ENABLED=false` en `backend/.env`. Diagnóstico:

```bash
npm run stellar:sincronizar -- --verificar   # diferencias entre la cadena y la base
journalctl --user -u accion-del-sur-backend | grep -E '\[Anclaje\]|\[Stellar\]|\[SFT\]'   # en la VM
```

## Antes de commitear

| Tocaste | Verificar |
|---|---|
| `contracts/` | `cargo test` |
| `frontend/` | `npm run build` sin errores; revisar la pantalla en el navegador |
| `backend/` | API levantada con el seed demo y `npm run test:e2e` (y `-- --blockchain` si tocaste stock o anclaje) |
| cualquier cosa | que no haya secretos en el diff (`git diff --staged`), que `.env.example` y `docs/` reflejen el cambio |

## Desplegar

En la VM actual (opción A de [despliegue.md](despliegue.md)):

```bash
ssh juanloncha@10.147.19.102
cd /home/shared/proyecto_cgic/accion_del_sur_final
git pull --ff-only
(cd backend && npm ci --omit=dev)
(cd frontend && npm ci && npm run build)
systemctl --user restart accion-del-sur-backend accion-del-sur-frontend
curl -s http://localhost:3020/api/health
```

Si cambiaron contratos, compilar los WASM en una máquina con Rust (el disco de la VM está casi
lleno), copiarlos a `contracts/target/wasm32v1-none/release/` en la VM y correr los scripts de
la receta de contratos.
