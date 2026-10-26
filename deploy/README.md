# deploy/

Archivos de despliegue. La guía completa está en [`docs/despliegue.md`](../docs/despliegue.md).

| Archivo | Uso |
|---|---|
| `systemd/user/accion-del-sur-backend.service` | Backend como servicio de usuario (opción A, sin sudo — la que corre hoy en la VM). |
| `systemd/user/accion-del-sur-frontend.service` | Frontend compilado servido con `vite preview` (opción A). |
| `systemd/accion-del-sur-backend.service` | Backend como servicio del sistema (opción B, con Nginx). |
| `nginx/accion-del-sur.conf` | Nginx: sirve `frontend/dist` y hace proxy de `/api` y `/uploads` (opción B). |
| `scripts/backup_db.sh` | Backup diario de MySQL con rotación de 7 días (cron). |
