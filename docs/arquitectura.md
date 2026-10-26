# Arquitectura

## Componentes

```
                        ┌───────────────────────────── servidor ─────────────────────────────┐
navegador ── HTTP ──►   │  frontend (React, build estático)                                  │
                        │      │  /api, /uploads (proxy: vite preview o Nginx)               │
                        │      ▼                                                             │
                        │  backend Express ──► MySQL 8                                       │
                        │      │                                                             │
                        └──────┼─────────────────────────────────────────────────────────────┘
                               │ Soroban RPC (HTTPS)
                               ▼
                        Stellar testnet: contrato_sft · contrato_entregas · N × contrato_centro
```

- **Frontend** (`frontend/`): SPA en React 19 + React Router. Habla solo con `/api` mediante
  axios (`src/services/api.js`, que agrega el JWT). Tailwind 4 para estilos, Recharts para
  gráficos, lucide-react para íconos.
- **Backend** (`backend/`): API REST en Express 5. Sequelize 6 sobre MySQL. Autenticación con JWT
  y contraseñas con bcrypt.
- **Blockchain** (`contracts/` y `backend/src/services/blockchain/`): ver
  [blockchain.md](blockchain.md). Es opcional: con `STELLAR_ENABLED=false` todo funciona igual,
  sin anclaje.

## Backend

```
backend/
├── server.js                 # Express: middlewares, rutas, arranque (sync + ensureSchema)
├── src/
│   ├── config/
│   │   ├── database.js       # conexión Sequelize
│   │   └── ensureSchema.js   # migraciones idempotentes (agrega columnas faltantes al arrancar)
│   ├── models/               # modelos y asociaciones (index.js)
│   ├── controllers/          # lógica de cada recurso
│   ├── routes/               # rutas y validaciones (express-validator)
│   ├── middleware/           # auth JWT + roles, errorHandler, rate limit de rutas públicas
│   ├── services/
│   │   ├── blockchain/       # stellarService, sftService, anclaje
│   │   └── emailService.js   # aviso al donante (SMTP, opcional)
│   ├── utils/                # cryptoEvidence (hashes de recepciones), deleteGuard
│   └── seeders/demo.js       # datos de demostración
└── scripts/
    ├── stellar/              # cuenta, despliegue y sincronización on-chain
    └── e2e/flujo-completo.js # test de punta a punta contra la API
```

**Esquema de la base:** no hay migraciones versionadas. Al arrancar, `sequelize.sync()` crea las
tablas que faltan y `ensureSchema.js` agrega columnas nuevas a tablas existentes, comprobando
primero en `information_schema`. Para agregar una columna: sumarla al modelo **y** a
`ensureSchema.js`.

**Errores:** los controladores lanzan errores con `status` y opcionalmente `payload`;
`errorHandler` los devuelve como JSON. Los conflictos de negocio son `409` con detalle (por
ejemplo, `{ error, supply_id, available, requested }` cuando no alcanza el stock).

**Borrados:** usuarios, categorías, centros e insumos con registros asociados no se borran: se
responde `409` indicando cuáles y cuántos (`utils/deleteGuard.js`).

## Modelo de datos

| Tabla | Modelo | Contenido |
|---|---|---|
| `usuarios` | `User` | email, hash de contraseña, rol `VOLUNTARIO` / `ADMINISTRADOR` |
| `donantes` | `Donor` | nombre, contacto, ciudad |
| `donaciones` | `Donation` | fecha, donante, estado, anclaje (`blockchain_status`, `blockchain_tx`) |
| `donaciones_insumos` | `DonationSupply` | qué insumos y cuántos trae cada donación |
| `categorias` | `Category` | jerárquicas (`parent_category_id`) |
| `insumos` | `Item` | nombre, categoría, `available_quantity`, `status` (`RECIBIDO`/`PREPARADO`/`DISPONIBLE`), `current_center_id`, `token_id` |
| `centros_recepcion` | `Center` | nombre, ubicación, estado operativo, `blockchain_contract_id` |
| `envios` / `detalles_envio` | `Shipment` / `ShipmentDetail` | envío a un centro y sus líneas; `confirmed`; anclaje por línea |
| `transfers` | `TokenTransfer` | movimiento de un insumo entre centros y su tx |
| `recepciones` / `recepciones_detalles` | `Reception` / `ReceptionDetail` | recepción con QR: token público, hashes de evidencia, recibido/aceptado/rechazado |

Reglas principales:

- Un insumo nuevo entra como `RECIBIDO`. **Solo los insumos `DISPONIBLE` se pueden enviar.**
- Confirmar un envío descuenta el stock en una única transacción: bloquea la fila del envío
  (evita confirmarlo dos veces) y los insumos en orden de id (evita deadlocks)
  (`models/Shipment.js`).
- Un envío confirmado no se puede borrar.

## API

Todas las rutas, salvo las marcadas como públicas, requieren `Authorization: Bearer <JWT>`.

| Recurso | Rutas |
|---|---|
| Auth | `POST /api/auth/login` (`username` o `email`), `GET /api/auth/me` |
| Dashboard | `GET /api/dashboard/summary` |
| Donaciones | `GET/POST /api/donations` |
| Donantes | `GET/POST /api/donors` |
| Insumos | `GET /api/items` (`search`, `category_id`, `status`), `GET/PUT/DELETE /api/items/:id`, `PATCH /api/items/:id/status`, `GET /api/items/:id/trazabilidad`, `GET /api/items/export/csv` |
| Envíos | `GET/POST /api/shipments`, `GET/DELETE /api/shipments/:id`, `POST /api/shipments/:id/confirm` |
| Transferencias | `GET/POST /api/transfers`, `GET /api/transfers/:id` |
| Recepciones QR | `GET/POST /api/donation-receptions`, `POST /api/donation-receptions/:id/finalize`; públicas: `GET /api/donation-receptions/public/:token` y `/verify` |
| Categorías | `GET/POST/PUT/DELETE /api/categories` (escritura: admin) |
| Centros | `GET/POST/PUT/DELETE /api/centers` (escritura: admin), `GET /api/centers/:id/inventory` |
| Usuarios | `GET/POST/PUT/DELETE /api/users` (admin) |
| Panel de apoyo | `GET /api/support-panel` |
| Historial | `GET /api/distributions`, `/stats` (vista de envíos confirmados) |
| Públicas | `GET /api/landing/summary`, `/centers-ranking`, `/recent-movements`, `GET /api/health` |

## Frontend

| Ruta | Página | Acceso |
|---|---|---|
| `/` | sitio institucional de CGIC, estático (`frontend/public/landing/`: index, proyectos, equipo, trayectoria) con acceso a `/login` | pública |
| `/trazabilidad` | `BlockchainTrazabilidad`: página pública con métricas y movimientos recientes | pública |
| `/confirmacion-donacion/:token` | `ConfirmacionDonacionQR`: el donante ve y verifica su recepción | pública |
| `/login` | `Login` | pública |
| `/dashboard`, `/panel-apoyo` | `Dashboard`, `PanelApoyo` | usuarios |
| `/donaciones/nueva`, `/donaciones/recepciones` | `NuevaDonacion`, `RecepcionesDonaciones` | usuarios |
| `/inventario` | `Inventario` + modal `TrazabilidadInsumo` | usuarios |
| `/transferencias` | `Transferencias` | usuarios |
| `/envios/nuevo`, `/envios` | `NuevoEnvio`, `Distribuciones` (historial de envíos) | usuarios |
| `/analytics/historial` | `HistorialTransacciones` | usuarios |
| `/admin/categorias`, `/admin/usuarios`, `/admin/centros` | administración | admin |

## Decisiones de diseño

- **La base de datos manda y la blockchain verifica.** Las operaciones no esperan ni dependen de la red
  para completarse; el anclaje se hace después y se puede reintentar. Un sistema de emergencias
  no puede quedar bloqueado porque el RPC de Stellar no responde. Ver
  [blockchain.md](blockchain.md#implementación-en-el-backend).
- **Sin Docker** en producción: la VM ya tenía MySQL y Node. Ver [despliegue.md](despliegue.md).
- **Sin migraciones versionadas**: `ensureSchema.js` alcanza para el ritmo actual de cambios. Si el
  proyecto crece, conviene pasar a migraciones de Sequelize (ver
  [estado-y-pendientes.md](estado-y-pendientes.md)).
