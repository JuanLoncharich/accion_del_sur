# Despliegue

El sistema corre en una sola máquina Linux, sin Docker: MySQL 8, el backend Node (v20 o superior)
y el frontend compilado. Hay dos formas de publicarlo:

| | Opción A — servicios de usuario | Opción B — Nginx + systemd del sistema |
|---|---|---|
| Requiere sudo | Solo para activar *linger* (una vez) | Sí |
| Frontend | `vite preview` en `:5020` | Nginx en `:80` sirviendo `frontend/dist` |
| Backend | servicio de usuario en `:3020` | servicio del sistema en `127.0.0.1:3020` |
| Recomendada para | Pruebas, red interna | Uso real (con dominio y HTTPS) |

En los ejemplos, `<repo>` es la ruta donde se clonó el repositorio y `<host>` la IP o el dominio
del servidor.

## Preparación (ambas opciones)

```bash
git clone https://github.com/JuanLoncharich/accion_del_sur.git
cd accion_del_sur

# Base de datos
mysql -u root -p -e "CREATE DATABASE accion_del_sur CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Backend
cd backend
cp .env.example .env            # completar DB_*, JWT_SECRET (openssl rand -hex 48), PORT, FRONTEND_URL, SMTP_*
chmod 600 .env
npm ci --omit=dev
npm run seed                    # opcional: datos de demostración (cambiar contraseñas después)

# Frontend
cd ../frontend
npm ci
npm run build                   # genera frontend/dist/
```

Las tablas y columnas se crean solas al arrancar el backend (`sequelize.sync()` +
`backend/src/config/ensureSchema.js`).

### Activar la blockchain (opcional)

Detalle en [blockchain.md](blockchain.md). Los WASM se compilan en cualquier máquina con Rust
(no hace falta Rust en el servidor; se copian a `contracts/target/wasm32v1-none/release/`):

```bash
cd contracts && stellar contract build          # o: cargo build --target wasm32v1-none --release
cd ../backend
npm run stellar:cuenta                           # cuenta admin nueva en testnet → backend/.env
npm run stellar:desplegar                        # contratos → backend/.env (STELLAR_ENABLED=true)
npm run stellar:sincronizar                      # contratos de centros + stock existente
```

Reiniciar el backend después de cambiar `backend/.env`.

## Opción A — servicios systemd de usuario

Requiere que el usuario tenga *linger* activado, para que los servicios sigan corriendo sin
sesión abierta (`sudo loginctl enable-linger $USER`; comprobar con
`loginctl show-user $USER | grep Linger` → `Linger=yes`).

```bash
mkdir -p ~/.config/systemd/user
cp deploy/systemd/user/*.service ~/.config/systemd/user/
# Editar WorkingDirectory en ambos archivos con la ruta real de <repo>
systemctl --user daemon-reload
systemctl --user enable --now accion-del-sur-backend accion-del-sur-frontend
```

El backend toma el puerto de `PORT` en `backend/.env`: ponerlo en `3020` (o cambiar `API_URL` en
el servicio del frontend para que coincida).

Verificar y operar:

```bash
systemctl --user status accion-del-sur-backend accion-del-sur-frontend
journalctl --user -u accion-del-sur-backend -n 50 --no-pager
curl -s http://localhost:3020/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5020/api/health   # proxy del frontend
```

**Firewall:** hay que permitir el puerto del frontend (`5020`). El del backend no hace falta: el
frontend le reenvía `/api` internamente. Con `ufw`: `sudo ufw allow 5020/tcp`. Con `iptables`:

```bash
sudo iptables -I INPUT -p tcp --dport 5020 -j ACCEPT
sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save   # que sobreviva reinicios
```

`FRONTEND_URL` en `backend/.env` debe ser la URL con la que se accede al frontend
(`http://<host>:5020`): se usa para CORS y para los links de los QR de recepción.

Actualizar una versión:

```bash
git pull
(cd backend && npm ci --omit=dev)
(cd frontend && npm ci && npm run build)
systemctl --user restart accion-del-sur-backend accion-del-sur-frontend
```

## Opción B — Nginx + systemd del sistema

### Contenido de `deploy/`

| Archivo | Destino | Qué hace |
|---|---|---|
| `nginx/accion-del-sur.conf` | `/etc/nginx/sites-available/accion-del-sur` | Sirve `frontend/dist` y hace de proxy de `/api` y `/uploads` a `127.0.0.1:3020`. |
| `systemd/accion-del-sur-backend.service` | `/etc/systemd/system/` | Backend con `NODE_ENV=production`, reinicio automático. |
| `scripts/backup_db.sh` | se ejecuta desde el repo | `mysqldump --single-transaction` + gzip + rotación de 7 días. |

### Requisitos previos

- Usuario con `sudo`.
- `backend/.env` completo (ver `backend/.env.example`), con `PORT=3020`.
- Pasos de «Preparación» hechos.

### 1. Nginx

```bash
sudo apt-get update
sudo apt-get install -y nginx

# Quitar el sitio por defecto
sudo rm -f /etc/nginx/sites-enabled/default

# Copiar el build a un directorio legible por www-data
sudo mkdir -p /var/www/accion-del-sur
sudo rsync -a --delete frontend/dist/ /var/www/accion-del-sur/

# Instalar el sitio (revisar server_name en el archivo)
sudo cp deploy/nginx/accion-del-sur.conf /etc/nginx/sites-available/accion-del-sur
sudo ln -sf /etc/nginx/sites-available/accion-del-sur /etc/nginx/sites-enabled/accion-del-sur

sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

### 2. Backend como servicio del sistema

Editar `deploy/systemd/accion-del-sur-backend.service`: `User`, `Group` y `WorkingDirectory`
(`<repo>/backend`). Si el backend corría como servicio de usuario (opción A) o con `start.sh`,
detenerlo antes.

```bash
systemctl --user disable --now accion-del-sur-backend accion-del-sur-frontend 2>/dev/null; ./stop.sh

sudo cp deploy/systemd/accion-del-sur-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now accion-del-sur-backend
systemctl status accion-del-sur-backend --no-pager
journalctl -u accion-del-sur-backend -n 30 --no-pager
```

En `backend/.env`, `FRONTEND_URL=http://<host>` (o `https://<dominio>`), y reiniciar el servicio.

### 3. Verificación

```bash
curl -s http://<host>/api/health                                  # {"status":"ok",...}
curl -s -o /dev/null -w '%{http_code}\n' http://<host>/           # 200
curl -s -o /dev/null -w '%{http_code}\n' http://<host>/envios     # 200 (SPA)
```

Si desde otra máquina no responde pero `curl` desde el propio servidor sí, el firewall está
rechazando el puerto 80 (ver el firewall en la opción A, con el puerto 80 y 443).

### 4. HTTPS (necesario para uso real)

Sin HTTPS las contraseñas viajan en texto plano. Con un dominio apuntando al servidor:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <dominio>
```

Después, `FRONTEND_URL=https://<dominio>` en `backend/.env` y reiniciar el backend.

### 5. Backup diario de la base

Probar una vez a mano:

```bash
deploy/scripts/backup_db.sh
ls -l ~/backups/accion_del_sur/
```

Agregar al crontab del usuario (`crontab -e`), todos los días a las 03:15:

```cron
15 3 * * * <repo>/deploy/scripts/backup_db.sh >> $HOME/backups/accion_del_sur/backup.log 2>&1
```

El destino se cambia con `BACKUP_DIR`. Conviene copiar los backups fuera del servidor.

Restaurar un backup:

```bash
gunzip -c ~/backups/accion_del_sur/accion_del_sur_AAAAMMDD-HHMMSS.sql.gz | mysql -u root -p accion_del_sur
```

### Actualizar una versión ya desplegada

```bash
cd <repo>
git pull
(cd backend && npm ci --omit=dev)
(cd frontend && npm ci && npm run build)
sudo rsync -a --delete frontend/dist/ /var/www/accion-del-sur/
sudo systemctl restart accion-del-sur-backend
```

### Problemas conocidos

| Síntoma | Causa | Solución |
|---|---|---|
| `bind() to 0.0.0.0:80 failed (98: Address already in use)` | Otro servicio usa el puerto 80, o sigue el sitio `default` | `sudo ss -ltnp 'sport = :80'`; quitar `sites-enabled/default` o escuchar en una IP concreta (`listen <IP>:80;`). |
| 502 Bad Gateway en `/api` | El backend no está corriendo o no está en `:3020` | `systemctl status accion-del-sur-backend` / `journalctl -u accion-del-sur-backend`; revisar `PORT`. |
| 413 al subir imagen | Imagen de más de 6 MB | El backend acepta hasta 5 MB (multer). |
| Los links de los QR apuntan a otro lado | `FRONTEND_URL` mal configurada | Corregirla en `backend/.env` y reiniciar. |
