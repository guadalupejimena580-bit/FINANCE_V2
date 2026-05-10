'use strict';

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const db       = require('../db');

const SALT_ROUNDS = 12;

// ─── Validadores simples ──────────────────────────────────────
function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarPassword(password) {
  return typeof password === 'string' && password.length >= 6;
}

// ─── POST /api/auth/register ─────────────────────────────────
router.post('/register', async (req, res) => {
  const { nombre, email, password } = req.body;

  // Validaciones
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio.' });
  }
  if (!email || !validarEmail(email.trim())) {
    return res.status(400).json({ error: 'Email inválido.' });
  }
  if (!validarPassword(password)) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  const emailNorm = email.trim().toLowerCase();

  try {
    // Verificar si ya existe
    const [existing] = await db.query(
      'SELECT id FROM usuarios WHERE email = ?',
      [emailNorm]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
    }

    // Hashear contraseña
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    // Insertar usuario
    const [result] = await db.query(
      `INSERT INTO usuarios (nombre, email, password_hash)
       VALUES (?, ?, ?)`,
      [nombre.trim(), emailNorm, password_hash]
    );

    // Generar JWT
    const token = jwt.sign(
      { id: result.insertId, email: emailNorm, nombre: nombre.trim() },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      message: 'Cuenta creada exitosamente.',
      token,
      usuario: {
        id    : result.insertId,
        nombre: nombre.trim(),
        email : emailNorm,
      },
    });
  } catch (err) {
    console.error('POST /auth/register:', err);
    res.status(500).json({ error: 'Error al registrar usuario.' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
  }

  const emailNorm = email.trim().toLowerCase();

  try {
    // Buscar usuario
    const [rows] = await db.query(
      'SELECT id, nombre, email, password_hash, activo FROM usuarios WHERE email = ?',
      [emailNorm]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    const usuario = rows[0];

    if (!usuario.activo) {
      return res.status(403).json({ error: 'Tu cuenta está desactivada.' });
    }

    // Comparar contraseña
    const match = await bcrypt.compare(password, usuario.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    // Generar JWT
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, nombre: usuario.nombre },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Inicio de sesión exitoso.',
      token,
      usuario: {
        id    : usuario.id,
        nombre: usuario.nombre,
        email : usuario.email,
      },
    });
  } catch (err) {
    console.error('POST /auth/login:', err);
    res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────
// Verifica el token y retorna datos del usuario
const authMiddleware = require('../middleware/auth');

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nombre, email, fecha_creacion FROM usuarios WHERE id = ? AND activo = 1',
      [req.usuario.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json({ usuario: rows[0] });
  } catch (err) {
    console.error('GET /auth/me:', err);
    res.status(500).json({ error: 'Error al obtener datos del usuario.' });
  }
});

module.exports = router;
