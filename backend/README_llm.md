# Integración LLM / chatLLM

Este archivo resume cómo el backend integra el módulo `chatLLM` con la API y el frontend, y qué hacer para dejarlo 100% operativo.

Estado actual (en este repo)
- Ruta: `POST /api/llm/query` definida en `src/routes/llm.js` (protegida por JWT).
- Controlador: `src/controllers/llmController.js` — ya implementado.
- Servicio: `src/services/llmChatService.js` — ahora replica el flujo de `chatLLM`:
   - detecta automáticamente modo `opencode run` o modo legacy `opencode -p`,
   - usa `OPENCODE_CONFIG=backend/chatLLM/opencode.json`,
   - normaliza `OPENAI_API_KEY` (por si viene entre comillas),
   - y cae a `mysql_readonly_query.sh` si no hay `opencode` y la consulta es SQL de solo-lectura.
- Frontend: `frontend/src/pages/ConsultaAsistente.jsx` — UI ya lista.

Pasos para activar completamente en un entorno nuevo
1. Variables de entorno
   - Configura en `backend/.env` o en el entorno:
     - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
     - Opcionalmente: `LLM_DB_HOST`, `LLM_DB_PORT`, `LLM_DB_USER`, `LLM_DB_PASSWORD`, `LLM_DB_NAME` (si prefieres credenciales específicas para el LLM)
   - Opcionalmente: `OPENCODE_BIN` (ruta absoluta al binario `opencode`, útil si el proceso backend corre con un PATH restringido)
     - `JWT_SECRET` debe estar definido
2. Usuario DB de solo lectura
   - Crea un usuario con permisos SELECT sobre la BDD `accion_del_sur` y exporta `LLM_DB_USER` y `LLM_DB_PASSWORD`.
3. OpenCode (opcional)
   - Instala el CLI `opencode` para obtener respuestas en lenguaje natural.
   - Si no está, el backend aceptará solo consultas SQL de solo lectura y ejecutará `mysql_readonly_query.sh`.
4. Rate limiting y auditoría
   - Recomiendo proteger `/api/llm/query` con `express-rate-limit` y/o registrar accesos en `audit_access_log` para auditoría.

Comandos útiles
```bash
# seed (crea admin/admin123 si hace falta)
cd backend
npm run seed

# arrancar backend
dotenv -e .env -- node server.js

# probar login y LLM
curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'
# usar token devuelto para llamar al asistente
curl -s -X POST http://localhost:3001/api/llm/query -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" -d '{"question":"SELECT COUNT(*) as total FROM users;"}'
```

Si quieres, puedo:
- Añadir `express-rate-limit` en `src/routes/llm.js` con políticas comentadas.
- Crear tests unitarios para `llmChatService.askMysqlAssistant` (mocks) y un test e2e que haga login y llame al endpoint.
- Ajustar los mensajes de error para exponer menos detalles técnicos en producción.
