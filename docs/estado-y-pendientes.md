# Estado y pendientes

Estado al **2026-10-26**, al momento de la entrega.

## Qué está hecho y verificado

- Flujo completo: donación → inventario (estados) → transferencia → envío, y recepciones con QR
  con vista y verificación pública para el donante.
- Trazabilidad on-chain conectada en todas las operaciones (mint / transfer / burn / contrato por
  centro), con verificación de saldo on-chain contra stock. Ver [blockchain.md](blockchain.md).
- Contratos con control de acceso: solo la cuenta admin escribe y los anclajes no se pueden
  sobrescribir. 13 tests (`cd contracts && cargo test`).
- Test E2E contra la API real: `npm run test:e2e`, con y sin `--blockchain`. Pasa completo en testnet.
- Desplegado en la VM con servicios systemd de usuario: `http://10.147.19.102:5020`. Ver
  [despliegue.md](despliegue.md).

## Seguridad: incidentes del historial

El repositorio es público. Hasta octubre de 2026, el commit `7dd6cb88` (2026-03-27) incluía
`backend/.env` con la **clave secreta de Stellar**, el **`JWT_SECRET`** y la contraseña de MySQL
de entonces. También había `node_modules` y artefactos de Rust versionados.

Qué se hizo:

- Se **reescribió el historial** con `git filter-repo`, sacando `.env`, `node_modules`, `target/`,
  los `.wasm` y los volcados JSON de tablas. Los commits conservan autores y fechas.
- Se generó una **cuenta Stellar nueva** y se redesplegaron todos los contratos. La clave vieja
  solo controla los contratos viejos de testnet, que esta versión ya no usa.
- El despliegue nuevo usa un **`JWT_SECRET` nuevo**.

Qué queda pendiente (fuera de este repositorio):

- **Los despliegues anteriores de la VM** (`accion_del_sur` en `:3001`/`:5173`,
  `accion_del_sur_proyecto` en `:3012`/`:5000` y la copia `accion_del_sur_mvp`) **siguen usando
  el `JWT_SECRET` filtrado**: cualquiera que lo tenga puede fabricar un token de administrador
  para esos sistemas. Hay que apagarlos o cambiarles `JWT_SECRET` y reiniciarlos.
- GitHub puede seguir sirviendo los commits viejos por su SHA durante un tiempo (y en forks o
  clones existentes). Si importa, pedir a soporte de GitHub que purgue las referencias en caché.
- Las contraseñas de la base y de SMTP que se usaron en esa época también deberían rotarse.
- Quien tenga un clon anterior debe **volver a clonar**: el historial nuevo no es compatible.

## Limitaciones y deuda técnica

Ordenado por prioridad.

| # | Tema | Detalle | Esfuerzo |
|---|---|---|---|
| 1 | **HTTPS y dominio** | Hoy se accede por HTTP dentro de ZeroTier. Para uso real hace falta dominio, Nginx y Certbot ([despliegue.md](despliegue.md), opción B). | S |
| 2 | **Stock por centro** | Un insumo tiene un solo `current_center_id`; una transferencia parcial mueve "todo" el insumo en la base (on-chain queda bien). Modelar `stock_por_centro (insumo, centro, cantidad)` y adaptar donaciones, transferencias, envíos y `anclaje.js`. | M |
| 3 | **Migraciones** | El esquema se ajusta con `ensureSchema.js` al arrancar. Pasar a migraciones versionadas (Sequelize CLI o Umzug) antes de tener datos reales. | M |
| 4 | **CI** | No hay integración continua. Agregar un workflow de GitHub Actions con `cargo test`, el build del frontend y el E2E contra un MySQL de servicio. | S |
| 5 | **Tests unitarios del backend** | Solo hay E2E. Agregar tests de `Shipment.confirmarEnvio`, `anclaje.js` y `deleteGuard`. | M |
| 6 | **Fechas sin hora** | `donaciones.date` y `envios.date` son `DATE`: el orden dentro del día es aproximado. Agregar `created_at`. | S |
| 7 | **Custodia de la clave admin** | Una sola clave firma todo. Para mainnet: guardar la clave en un gestor de secretos y evaluar multisig. | M |
| 8 | **Verificación pública por insumo** | La trazabilidad por insumo requiere login. `/trazabilidad` muestra métricas agregadas. Exponer una vista pública por insumo (sin datos personales) sería el siguiente paso de transparencia. | S |
| 9 | **Eventos on-chain históricos** | El RPC retiene unos 7 días de eventos. Si se quiere reconstruir la historia solo desde la blockchain, hace falta un indexador. | M |
| 10 | **Tamaño del bundle** | El JS del frontend supera los 500 kB. Dividir por ruta con `React.lazy`. `BlockchainTrazabilidad.jsx` (≈1000 líneas) conviene partirlo en componentes. | S |
| 11 | **Identidad de centro fija** | Renombrar un centro no actualiza su contrato. Documentado; cambiarlo requeriría un contrato con datos editables por el admin. | S |

S: hasta ½ día · M: 1 a 3 días.

## Roadmap sugerido

1. **Piloto**: HTTPS y dominio (1), usuarios reales, CI (4). Probar con un centro.
2. **Robustez**: stock por centro (2), migraciones (3), tests (5), fechas (6).
3. **Mainnet**: custodia de clave (7), cuenta fondeada, `STELLAR_NETWORK=mainnet`,
   `npm run stellar:desplegar` y `stellar:sincronizar`.
4. **Transparencia pública**: verificación por insumo (8) e indexador (9).

## Operación

- Testnet se reinicia cada algunos meses: repetir `npm run stellar:cuenta -- --forzar`,
  `stellar:desplegar` y `stellar:sincronizar -- --reiniciar`.
- Si alguna operación quedó en `local` (la red no respondió), `npm run stellar:sincronizar` la
  repara. Con `-- --verificar` solo informa.
- El disco de la VM estaba al **99 %** el 2026-10-26: conviene liberar espacio y sacar los
  backups (`~/backups/accion_del_sur`) fuera de la máquina.
