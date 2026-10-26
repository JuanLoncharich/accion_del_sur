# API

Base: `/api`. En desarrollo, `http://localhost:3012/api` (o a través del proxy de Vite en
`:5000`). Todos los cuerpos son JSON. Los ejemplos de respuesta son reales (capturados del
despliegue de la VM, recortados).

El flujo completo, con todas las llamadas encadenadas, está ejecutable en
[`backend/scripts/e2e/flujo-completo.js`](../backend/scripts/e2e/flujo-completo.js): es la
referencia más confiable de cómo se usa cada endpoint.

## Autenticación

```http
POST /api/auth/login
{ "username": "admin", "password": "admin123" }      // o { "email": "...", "password": "..." }
```

```json
{ "token": "eyJhbGciOi…", "user": { "id": 1, "email": "admin@acciondelsur.org", "role": "ADMINISTRADOR" } }
```

`username: "admin"` es un alias de `admin@acciondelsur.org`. El resto de las rutas (salvo las
públicas) requieren `Authorization: Bearer <token>`. El token dura `JWT_EXPIRES_IN` (7 días).

| Respuesta | Cuándo |
|---|---|
| `401 { error }` | sin token, token inválido/vencido, credenciales incorrectas |
| `403 { error }` | la ruta requiere `ADMINISTRADOR` |

`GET /api/auth/me` → `{ id, email, role }`. `POST /api/auth/register` (admin) →
`{ email, password (≥6), role? }`.

## Errores

```json
{ "error": "Mensaje para mostrar al usuario", "...": "campos extra según el caso" }
```

| Código | Uso | Ejemplo |
|---|---|---|
| 400 | validación | `{ "error": "Datos inválidos", "details": [ { "path": "quantity", "msg": "…" } ] }` |
| 404 | no existe | `{ "error": "Insumo no encontrado" }` |
| 409 | regla de negocio | `{ "error": "Stock insuficiente para \"Frazadas\"", "supply_id": 19, "available": 15, "requested": 100 }` |
| 409 | borrado con dependencias | `{ "error": "No se puede eliminar el centro: tiene 2 envíos…", "dependencies": { "envíos": 2 } }` |

## Formas de respuesta

No son uniformes (deuda heredada; para recursos nuevos usar la primera):

| Forma | Endpoints |
|---|---|
| `{ total, page, data: [...] }` con `?page=&limit=` (máx. 500) | donations, items, shipments, transfers, donation-receptions, distributions |
| `{ data: [...] }` | donors, centers |
| `[...]` (array directo) | categories, users |

## Insumos (`/api/items`)

`GET /api/items?search=&category_id=&status=RECIBIDO|PREPARADO|DISPONIBLE&page=&limit=`

```json
{ "total": 21, "page": 1, "data": [ {
  "id": 19, "name": "Frazadas", "available_quantity": 12, "quantity": 12,
  "category_id": 8, "category": { "id": 8, "name": "Abrigo", "parent_category_id": 2 },
  "current_center_id": 6, "currentCenter": { "id": 6, "name": "Centro Sur" }, "center": "Centro Sur",
  "status": "DISPONIBLE", "is_active": true,
  "token_id": "1b8d0103e3a8…", "token_status": "minted", "attributes_hash": null, "attributes": null
} ] }
```

| Ruta | Body | Notas |
|---|---|---|
| `GET /:id` | — | mismo objeto que en el listado |
| `PATCH /:id/status` | `{ "status": "DISPONIBLE" }` | |
| `PUT /:id` | `{ name?, category_id?, available_quantity? }` | ajustar stock es solo para admin y se ancla on-chain (mint/burn de la diferencia) |
| `DELETE /:id` | — | 409 si tiene donaciones, envíos, transferencias o recepciones |
| `GET /export/csv` | — | `text/csv` |
| `GET /stock-by-category` | — | |
| `GET /:id/trazabilidad` | — | ver abajo |

`GET /api/items/:id/trazabilidad`:

```json
{
  "item": { "id": 21, "name": "Frazadas", "category": "Abrigo", "stock": 12 },
  "token_id": "e85f440b865d…",
  "centro": { "id": 10, "name": "Centro Sur", "contrato": "CALZ6OTN7J5E…" },
  "contrato_sft": "CCKAGSZAB5L6…", "red": "testnet",
  "verificacion": { "disponible": true, "saldo_onchain": 12, "stock_base": 12, "coincide": true },
  "eventos": [
    { "tipo": "donacion", "fecha": "2026-10-26", "cantidad": 10, "detalle": "Donación #15", "blockchain_status": "anchored", "tx": "f21e9730…" },
    { "tipo": "transferencia", "fecha": "2026-10-26T20:51:43.000Z", "cantidad": 15, "detalle": "Centro Norte → Centro Sur", "blockchain_status": "anchored", "tx": "775b5e3c…" },
    { "tipo": "envio", "fecha": "2026-10-26", "cantidad": -4, "detalle": "Envío #10 a Centro Sur", "blockchain_status": "anchored", "tx": "629dff9c…" }
  ]
}
```

`tipo`: `donacion | recepcion | transferencia | envio`. `verificacion.disponible = false` trae
`motivo` (blockchain apagada, centro sin contrato o error de RPC).

## Donaciones (`/api/donations`)

```http
POST /api/donations
{
  "category_id": 8, "quantity": 10, "name": "Frazadas", "center_id": 5,
  "donor_email": "ana@example.org", "donor_name": "Ana", "city": "Mendoza", "date": "2026-10-26"
}
```

Solo `category_id` y `quantity` son obligatorios. El insumo se identifica por `(category_id, name)`:
si existe suma stock, si no lo crea como `RECIBIDO`. El donante se busca o crea por
`donor_email` (sin email → "Donante anónimo"). `center_id` ubica el insumo en ese centro.

```json
{ "id": 15, "date": "2026-10-26", "quantity": 10,
  "blockchain": { "status": "anchored", "tx": "f21e9730…" },
  "item": { "id": 21, "name": "Frazadas", "quantity": 10, "...": "…" },
  "donor": { "id": 9, "name": "Ana", "contact": "ana@example.org", "city": "Mendoza" } }
```

`GET /api/donations?from=&to=&page=&limit=` devuelve cada donación con `donor`, `supplies`,
`blockchain_status`, `blockchain_tx` y campos aplanados para el frontend (`item_name`,
`category_name`, `quantity`, `center_name`).

## Envíos (`/api/shipments`)

```http
POST /api/shipments
{ "reception_center_id": 10, "date": "2026-10-26", "confirm": true,
  "details": [ { "supply_id": 21, "quantity_sent": 4 } ] }
```

- Solo insumos `DISPONIBLE` y con stock suficiente (409 con detalle si no). Se valida aunque quede
  pendiente.
- `confirm: true` descuenta stock en la misma transacción y ancla (burn por línea). Sin `confirm`,
  queda pendiente.

```json
{ "id": 14, "date": "2026-10-26", "reception_center_id": 10, "confirmed": true, "blockchain_status": "anchored",
  "destination": { "id": 10, "name": "Centro Sur", "location": "San Rafael" },
  "registeredBy": { "id": 1, "email": "admin@acciondelsur.org" },
  "details": [ { "id": 18, "supply_id": 21, "quantity_sent": 4, "blockchain_tx": "629dff9c…",
                 "supply": { "id": 21, "name": "Frazadas", "available_quantity": 8, "category": { "...": "…" } } } ] }
```

| Ruta | Notas |
|---|---|
| `GET /?status=confirmed\|pending&reception_center_id=&from=&to=` | |
| `GET /:id` | |
| `POST /:id/confirm` | 409 si ya estaba confirmado o falta stock |
| `DELETE /:id` | solo pendientes (409 si está confirmado) |

## Transferencias (`/api/transfers`)

```http
POST /api/transfers
{ "item_id": 21, "from_center_id": 9, "to_center_id": 10, "quantity": 15, "reason": "Redistribución" }
```

El insumo tiene que estar en el centro origen y tener stock suficiente (409 si no). Respuesta:
la transferencia con `item`, `fromCenter`, `toCenter`, `status` (`anchored | local | pending`) y
`egreso_blockchain_tx`.

## Recepciones con QR (`/api/donation-receptions`)

1. `POST /` `{ "donor_email": "ana@example.org", "reception_center_id": 10 }` →
   `{ id, status: "processing", public_token_qr, qr_url }`. El `qr_url` es lo que se le da al donante.
2. `POST /:id/finalize`
   ```json
   { "details": [ { "item_id": 21, "quantity_received": 4, "quantity_accepted": 3,
                    "quantity_rejected": 1, "rejection_reason_item": "Dañado" } ],
     "rejection_reason": null }
   ```
   → `{ id, status: "completed" | "partially_rejected" | "rejected", anchor_hash, blockchain_tx }`.
   Suma lo aceptado al stock, lo mintea y ancla el hash del detalle.
3. Públicas (sin token, con rate limit):
   - `GET /public/:token` → estado, ítems recibidos/aceptados/rechazados, `accepted_tracking`.
   - `GET /public/:token/verify` → `{ verified: true, message }` si el detalle coincide con lo anclado.

`GET /` lista las recepciones (`id, donor_email, status, created_at, public_token_qr`).

## Centros (`/api/centers`)

`GET /` → `{ data: [ { id, name, location, operational_status, managed_by, is_active,
blockchain_contract_id, blockchain_deploy_tx, center_type } ] }`.

`POST /` (admin) `{ "name": "Centro Norte", "location": "Mendoza", "operational_status": "Operativo" }`
→ el centro + `blockchain: { status, tx }` (se despliega su contrato; tarda unos segundos).
`PUT /:id`, `DELETE /:id` (admin; 409 si tiene envíos, insumos o transferencias).
`GET /:id/inventory` → `{ center_id, center_name, items }` (insumos ubicados en el centro).

## Otros

| Ruta | Respuesta |
|---|---|
| `GET /api/categories` | `[ { id, name, parent_category_id, attributes, is_active } ]`. Escritura (admin): `POST/PUT/DELETE` con `{ name, parent_category_id? }` |
| `GET /api/donors` / `POST` | `{ data: [ { id, name, contact, city } ] }` / `{ name, contact, city? }` |
| `GET /api/users` (admin) | `[ { id, email, role } ]`. `POST { email, password, role? }`, `PUT /:id`, `DELETE /:id` |
| `GET /api/dashboard/summary` | `{ summary: { totalDonations, totalItemsInStock, totalDistributions, activeCategories, reachedDestinations }, stockByCategory, weeklyDonations, recentDonations, recentDistributions }` |
| `GET /api/support-panel` | `{ threshold, prioritySupplies: [ { category, parent, available, critical } ], receptionPoints: [ { name, location, operational_status, accepting } ] }` |
| `GET /api/distributions` | envíos (confirmados y pendientes, con `status` confirmada o pendiente) en el formato del Historial; solo lectura |
| `GET /api/landing/summary` | pública: `{ summary: { totalDonations, activeCenters, unitsInStock, unitsShipped, destinationsReached, anchoredOperations }, blockchain: { enabled, network, sftContract } }` |
| `GET /api/landing/recent-movements?limit=` | pública: últimas operaciones ancladas `[ { tipo: ingreso\|transferencia\|envio, fecha, cantidad, insumo, categoria, lugar, tx } ]`, sin datos personales |
| `GET /api/health` | `{ status: "ok", timestamp }` |
