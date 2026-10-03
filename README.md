# Acción del Sur — Sistema de Gestión de Donaciones

Sistema web interno para gestionar el ciclo de donaciones de la organización: registro de donantes y donaciones → inventario con estados logísticos → envíos a centros de recepción.

## Stack tecnológico

- **Backend:** Node.js 22 + Express 5 + Sequelize 6 + MySQL 8
- **Frontend:** React 19 + Vite 8 + Tailwind CSS 4 + Recharts
- **Auth:** JWT + bcrypt, roles `VOLUNTARIO` y `ADMINISTRADOR`
- **Producción:** Nginx + systemd + backup diario con cron (sin Docker) — ver [`deploy/README.md`](deploy/README.md)

## Puertos

| Entorno | Frontend | Backend (API) |
|---|---|---|
| Desarrollo (`start.sh`) | Vite en `:5000` (proxy de `/api` y `/uploads` a `:3012`) | `:3012` |
| Producción (`deploy/`) | Nginx en `:80` (IPs `10.0.0.195` y `10.147.19.102`) | `127.0.0.1:3012` (systemd) |

## Puesta en marcha (desarrollo)

### Prerrequisitos

- Node.js ≥ 18 (probado con 22)
- MySQL 8 corriendo localmente

### 1. Base de datos

```sql
CREATE DATABASE accion_del_sur_proyecto CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Las tablas se crean al iniciar el backend (`sequelize.sync` + `src/config/ensureSchema.js`, que agrega columnas faltantes de forma idempotente).

### 2. Backend

```bash
cd backend
cp .env.example .env        # completar DB_PASSWORD, JWT_SECRET, SMTP_* (ver comentarios del archivo)
npm install
node src/seeders/demo.js    # datos de demostración (usuarios, donantes, categorías, insumos, centros, envíos)
```

### 3. Frontend

```bash
cd frontend
npm install
```

### 4. Levantar y detener

```bash
./start.sh                  # backend :3012 + frontend :5000 (logs en .logs/)
./stop.sh
```

Abrir http://localhost:5000 (o `http://<IP de la máquina>:5000`).

## Credenciales de demostración (seeder `demo.js`)

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` (= `admin@acciondelsur.org`) | `admin123` | Administrador |
| `maria.gomez@acciondelsur.org` | `volante123` | Voluntario |

Cambiarlas antes de cualquier uso real.

## Variables de entorno

Todas están documentadas en [`backend/.env.example`](backend/.env.example):

| Grupo | Variables | Obligatorias |
|---|---|---|
| Base de datos | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Sí |
| Autenticación | `JWT_SECRET`, `JWT_EXPIRES_IN` | Sí (`JWT_SECRET`) |
| Servidor | `PORT`, `NODE_ENV`, `FRONTEND_URL` | Sí |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Solo para notificar donantes |
| Blockchain (opcional) | `STELLAR_ENABLED`, `STELLAR_NETWORK`, `STELLAR_SECRET_KEY`, `SOROBAN_CONTRACT_*`, `CENTRO_WASM_HASH` | No |
| Asistente LLM (opcional) | `OPENAI_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` | No |

`backend/.env` nunca se versiona.

## Funcionalidades

### Todos los usuarios autenticados
- Dashboard: total de donaciones, ítems en stock, envíos realizados, destinos alcanzados, categorías y gráficos (stock por categoría, donaciones de las últimas 8 semanas).
- Registrar donaciones, eligiendo o creando el donante (nombre, contacto, ciudad).
- Inventario: búsqueda, filtros por categoría y por estado (`Recibido` / `Preparado` / `Disponible`), cambio de estado, exportación CSV.
- Envíos: alta con varios insumos hacia un centro de recepción; al confirmar se descuenta el stock en una transacción. Solo se envían insumos `Disponible`.

### Solo administradores
- Categorías jerárquicas (categoría padre / subcategorías).
- Usuarios.
- Centros de recepción.

Los borrados de usuarios, categorías, centros e insumos se rechazan (409) si tienen registros asociados, indicando cuáles y cuántos.

## API principal

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login (`username` o `email` + `password`) → JWT |
| GET | `/api/auth/me` | Usuario actual |
| GET | `/api/dashboard/summary` | Métricas del dashboard |
| GET/POST | `/api/donations` | Donaciones |
| GET/POST | `/api/donors` | Donantes |
| GET | `/api/items` | Inventario (`?search=`, `?category_id=`, `?status=`) |
| GET/PUT/DELETE | `/api/items/:id` | Insumo |
| PATCH | `/api/items/:id/status` | Cambiar estado (`RECIBIDO`, `PREPARADO`, `DISPONIBLE`) |
| GET | `/api/items/export/csv` | Exportar CSV |
| GET/POST | `/api/shipments` | Envíos (`POST { reception_center_id, date?, confirm?, details: [{ supply_id, quantity_sent }] }`) |
| GET/DELETE | `/api/shipments/:id` | Envío (solo se eliminan pendientes) |
| POST | `/api/shipments/:id/confirm` | Confirmar envío y descontar stock |
| GET/POST/PUT/DELETE | `/api/categories` | Categorías (escritura: admin) |
| GET/POST/PUT/DELETE | `/api/centers` | Centros de recepción |
| GET/POST/PUT/DELETE | `/api/users` | Usuarios (admin) |
| GET | `/api/health` | Estado del servidor |

## Estructura del proyecto

```
accion_del_sur_proyecto/
├── backend/
│   ├── server.js
│   ├── src/
│   │   ├── config/        # conexión a MySQL y ensureSchema (migraciones idempotentes)
│   │   ├── controllers/   # lógica de negocio
│   │   ├── middleware/    # auth JWT, errores, rate limit público
│   │   ├── models/        # modelos Sequelize
│   │   ├── routes/        # rutas Express
│   │   ├── seeders/       # demo.js
│   │   ├── services/      # email, LLM, blockchain (opcional)
│   │   └── utils/
│   └── uploads/           # imágenes subidas (no versionadas)
├── frontend/src/          # React: pages, components, context, services
├── deploy/                # Nginx, systemd, backup — ver deploy/README.md
├── start.sh / stop.sh     # entorno de desarrollo
├── INFORME_TECNICO.md     # relevamiento técnico
├── PLAN_CIERRE.md         # plan de cierre del MVP
└── CAMBIOS_CIERRE.md      # cambios realizados en el cierre
```

## Módulos fuera del alcance del acta

El código conserva módulos heredados que no forman parte del MVP: blockchain Stellar/Soroban (se desactiva con `STELLAR_ENABLED=false`), transferencias entre centros, recepciones con QR y asistente de consultas LLM. No son necesarios para el flujo donación → inventario → envío.
