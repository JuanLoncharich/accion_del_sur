require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { sequelize } = require('./src/models');
const { ensureSchema } = require('./src/config/ensureSchema');
const errorHandler = require('./src/middleware/errorHandler');

const authRoutes = require('./src/routes/auth');
const categoryRoutes = require('./src/routes/categories');
const donationRoutes = require('./src/routes/donations');
const itemRoutes = require('./src/routes/items');
const distributionRoutes = require('./src/routes/distributions');
const auditRoutes = require('./src/routes/audit');
const userRoutes = require('./src/routes/users');
const dashboardRoutes = require('./src/routes/dashboard');
const donationReceptionRoutes = require('./src/routes/donationReceptions');
const centerRoutes = require('./src/routes/centers');
const transferRoutes = require('./src/routes/transfers');
const llmRoutes = require('./src/routes/llm');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/distributions', distributionRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/donation-receptions', donationReceptionRoutes);
app.use('/api/centers', centerRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/llm', llmRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Error handler
app.use(errorHandler);

// Start
const start = async () => {
  try {
    await sequelize.authenticate();
    console.log('[DB] Conexión establecida correctamente.');
    await sequelize.sync({ alter: false });
    console.log('[DB] Modelos sincronizados.');
    await ensureSchema();
    console.log('[DB] Esquema validado.');
    app.listen(PORT, () => {
      console.log(`[Server] Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('[Server] Error al iniciar:', error);
    process.exit(1);
  }
};

start();
