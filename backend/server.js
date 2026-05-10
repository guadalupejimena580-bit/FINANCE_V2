'use strict';

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const path       = require('path');

// Rutas
const authRouter          = require('./auth/authRoutes');
const cuentasRouter       = require('./routes/cuentas');
const gastosRouter        = require('./routes/gastos');
const deudasRouter        = require('./routes/deudas');
const recordatoriosRouter = require('./routes/recordatorios');
const dashboardRouter     = require('./routes/dashboard');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir el frontend estático desde /frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ── Rutas API públicas ─────────────────────────────────────────
app.use('/api/auth', authRouter);

// ── Rutas API protegidas ───────────────────────────────────────
app.use('/api/cuentas',       cuentasRouter);
app.use('/api/gastos',        gastosRouter);
app.use('/api/deudas',        deudasRouter);
app.use('/api/recordatorios', recordatoriosRouter);
app.use('/api/dashboard',     dashboardRouter);

// ── Health check ───────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status : 'ok',
    app    : 'FINANCE API',
    version: '3.0.0',
    time   : new Date().toISOString(),
  });
});

// ── Fallback SPA ───────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ── Manejador global de errores ────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error no capturado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ── Iniciar servidor ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 FINANCE API v3.0 (multiusuario) en http://localhost:${PORT}`);
  console.log(`📂 Frontend en     http://localhost:${PORT}/`);
  console.log(`🔑 Auth en         http://localhost:${PORT}/api/auth`);
  console.log(`🔍 Health check en http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
