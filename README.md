<p align="center">
  <img src="frontend/public/assets/images/logo-accion-del-sur.png" alt="Acción del Sur" width="120">
</p>

# Acción del Sur

Sistema web para gestionar donaciones físicas en emergencias climáticas, con **trazabilidad
verificable en blockchain (Stellar/Soroban)**: cada donación, transferencia entre centros y envío
queda registrado on-chain, y cualquiera puede comprobar que el inventario declarado coincide con
la blockchain.

Iniciativa de [CGIC](https://cgic-argentina.org/). Presentado en EmprendeU.

> ¿No sos del equipo técnico? Empezá por el [resumen ejecutivo](docs/resumen-ejecutivo.md).

## Qué hace

- **Donaciones**: registro de donantes y donaciones; recepciones con QR, donde el donante sigue
  y verifica su donación desde un link público.
- **Inventario**: insumos por categoría y centro, con estados logísticos
  `Recibido → Preparado → Disponible`.
- **Transferencias** de insumos entre centros.
- **Envíos** a centros de recepción, con descuento de stock transaccional.
- **Panel de apoyo**: qué insumos faltan y qué centros reciben.
- **Trazabilidad**: línea de tiempo de cada insumo, con link a cada transacción en el explorador
  de Stellar y verificación en vivo del saldo on-chain.
- Dashboard, historial, exportación CSV, roles `VOLUNTARIO` y `ADMINISTRADOR`.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, Recharts |
| Backend | Node.js 20+, Express 5, Sequelize 6, MySQL 8, JWT |
| Blockchain | Stellar testnet, contratos Soroban en Rust (`soroban-sdk` 22) |

## Estructura

```
backend/      API Express (src/), scripts de Stellar y test E2E (scripts/)
frontend/     Aplicación React (y en public/landing/ el sitio institucional de CGIC, que se abre en /)
contracts/    Contratos Soroban: contrato_sft, contrato_entregas, contrato_centro
deploy/       systemd, Nginx y backup de la base
docs/         Documentación (ver abajo)
start.sh      Levanta backend + frontend en modo desarrollo (stop.sh los detiene)
```

## Arranque rápido (desarrollo)

Requisitos: Node.js 20+ y MySQL 8. Rust y Stellar CLI solo hacen falta para compilar los contratos.

```bash
# 1. Base de datos
mysql -u root -p -e "CREATE DATABASE accion_del_sur CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. Backend
cd backend
cp .env.example .env          # completar DB_PASSWORD y JWT_SECRET (openssl rand -hex 48)
npm install
npm run seed                  # datos de demostración

# 3. Frontend
cd ../frontend && npm install

# 4. Levantar
cd .. && ./start.sh           # backend :3012 + frontend :5000
```

Abrir http://localhost:5000 y entrar con `admin` / `admin123`. Hay un voluntario de prueba:
`maria.gomez@acciondelsur.org` / `volante123`. Cambiar estas contraseñas antes de cualquier uso real.

Sin más configuración, el sistema funciona completo **sin blockchain** (`STELLAR_ENABLED=false`).
Para activarla, ver [docs/blockchain.md](docs/blockchain.md#puesta-en-marcha); son tres comandos.

## Pruebas

```bash
cd contracts && cargo test                              # 13 tests de los contratos
cd backend && npm run test:e2e                          # flujo completo contra la API (39 verificaciones)
cd backend && npm run test:e2e -- --blockchain          # además exige anclaje on-chain
```

El test E2E necesita la API levantada (variable `E2E_API_URL`, por defecto `http://localhost:3012`)
y el seed de demostración.

## Documentación

| Documento | Para quién | Contenido |
|---|---|---|
| [Resumen ejecutivo](docs/resumen-ejecutivo.md) | Todos | Qué es, para quién, estado y próximos pasos |
| [Arquitectura](docs/arquitectura.md) | Desarrollo | Componentes, modelo de datos, API, decisiones |
| [Blockchain](docs/blockchain.md) | Desarrollo | Contratos, flujos on-chain, scripts, verificación |
| [Despliegue](docs/despliegue.md) | Operación | Servidor, servicios, Nginx, backups |
| [Estado y pendientes](docs/estado-y-pendientes.md) | Desarrollo | Deuda técnica, limitaciones, roadmap |
| [Historial](docs/historial/) | Referencia | Informes y planes de etapas anteriores |

## Equipo

[@JuanLoncharich](https://github.com/JuanLoncharich) ·
[@diegoforni](https://github.com/diegoforni) ·
[@JulianIgnFer24](https://github.com/JulianIgnFer24) ·
[@r-baggioII](https://github.com/r-baggioII)
