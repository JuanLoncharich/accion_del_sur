# Acción del Sur — Sistema de Gestión de Donaciones

Sistema web completo para la gestión del ciclo de donaciones de un centro de crisis: entrada de donaciones → inventario → distribución a receptores.

## Stack Tecnológico

- **Backend:** Node.js + Express.js + Sequelize + MySQL
- **Frontend:** React + Vite + Tailwind CSS v4 + Recharts
- **Auth:** JWT + bcrypt

## Instalación y Ejecución

### Prerrequisitos

- Node.js >= 18
- MySQL corriendo localmente

### 1. Configurar la base de datos

Crear la base de datos en MySQL:

```sql
CREATE DATABASE accion_del_sur CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Backend

```bash
cd backend

# Copiar y editar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de MySQL

# Instalar dependencias
npm install

# Crear tablas y cargar datos iniciales
npm run seed

# Iniciar servidor (puerto 3001)
npm start
```

El seeder crea:
- Usuario admin: `admin` / `admin123`
- 6 categorías con atributos predefinidos

### 3. Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo (puerto 5173)
npm run dev
```

Abrir [http://localhost:5173](http://localhost:5173)

## Credenciales por defecto

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| admin | admin123 | Administrador |

## Funcionalidades

### Todos los usuarios
- Dashboard con gráficos y estadísticas
- Registrar donaciones (formulario guiado paso a paso)
- Ver y filtrar el inventario
- Registrar distribuciones a receptores
- Ver historial de distribuciones

### Solo administradores
- Gestión de categorías y atributos (ABM completo)
- Gestión de usuarios (ABM completo)

## Estructura del Proyecto

```
accion-del-sur/
├── backend/
│   ├── src/
│   │   ├── config/          # Configuración de DB
│   │   ├── controllers/     # Lógica de negocio
│   │   ├── middleware/       # Auth JWT, errores
│   │   ├── models/          # Modelos Sequelize
│   │   ├── routes/          # Rutas Express
│   │   ├── seeders/         # Datos iniciales
│   │   └── services/
│   │       └── blockchain/  # Stub Stellar (preparado)
│   ├── uploads/             # Fotos de ítems
│   ├── .env
│   └── server.js
└── frontend/
    └── src/
        ├── components/      # Layout, Sidebar, Toast
        ├── context/         # AuthContext
        ├── hooks/           # useToast
        ├── pages/           # Todas las vistas
        └── services/        # Cliente API (axios)
```

## Módulo Blockchain (Preparado)

El servicio `backend/src/services/blockchain/stellarService.js` está preparado para la integración futura con Stellar SDK y smart contracts en Rust/Soroban. Actualmente funciona como stub (graceful degradation).

Para activarlo: cambiar `this.isEnabled = true` en el constructor e implementar los métodos con el Stellar SDK.

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Usuario actual |
| GET | /api/dashboard/summary | Datos del dashboard |
| GET/POST | /api/donations | Donaciones |
| GET | /api/donations/stats | Estadísticas |
| GET/PUT/DELETE | /api/items/:id | Ítems del inventario |
| GET | /api/items/export/csv | Exportar CSV |
| GET/POST | /api/distributions | Distribuciones |
| GET/POST/PUT/DELETE | /api/categories | Categorías |
| GET/POST/PUT/DELETE | /api/categories/:id/attributes | Atributos |
| GET/POST/PUT/DELETE | /api/users | Usuarios (admin) |
