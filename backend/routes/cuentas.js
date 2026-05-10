'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const auth    = require('../middleware/auth');

router.use(auth);

// ─── GET /cuentas ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, nombre, tipo, moneda, saldo, saldo_inicial, descripcion, activo, fecha_creacion
       FROM cuentas
       WHERE activo = 1 AND usuario_id = ?
       ORDER BY tipo, nombre`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /cuentas:', err);
    res.status(500).json({ error: 'Error al obtener cuentas' });
  }
});

// ─── POST /cuentas ────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { nombre, tipo, moneda = 'PYG', saldo_inicial = 0, descripcion = '' } = req.body;
  if (!nombre || !tipo) return res.status(400).json({ error: 'nombre y tipo son obligatorios' });
  const tiposValidos = ['debito', 'credito', 'ahorro', 'efectivo'];
  if (!tiposValidos.includes(tipo)) return res.status(400).json({ error: 'Tipo de cuenta inválido' });

  try {
    const [result] = await db.query(
      `INSERT INTO cuentas (nombre, tipo, moneda, saldo, saldo_inicial, descripcion, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nombre.trim(), tipo, moneda, parseFloat(saldo_inicial), parseFloat(saldo_inicial), descripcion.trim(), req.usuario.id]
    );
    const [rows] = await db.query('SELECT * FROM cuentas WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /cuentas:', err);
    res.status(500).json({ error: 'Error al crear cuenta' });
  }
});

// ─── PUT /cuentas/:id ─────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, tipo, moneda, descripcion } = req.body;
  if (!nombre || !tipo) return res.status(400).json({ error: 'nombre y tipo son obligatorios' });

  try {
    const [check] = await db.query('SELECT id FROM cuentas WHERE id = ? AND usuario_id = ?', [id, req.usuario.id]);
    if (!check.length) return res.status(404).json({ error: 'Cuenta no encontrada' });

    await db.query(
      `UPDATE cuentas SET nombre = ?, tipo = ?, moneda = ?, descripcion = ? WHERE id = ? AND usuario_id = ?`,
      [nombre.trim(), tipo, moneda || 'PYG', descripcion || '', id, req.usuario.id]
    );
    const [rows] = await db.query('SELECT * FROM cuentas WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /cuentas/:id:', err);
    res.status(500).json({ error: 'Error al editar cuenta' });
  }
});

// ─── DELETE /cuentas/:id ──────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [check] = await db.query('SELECT id FROM cuentas WHERE id = ? AND usuario_id = ?', [id, req.usuario.id]);
    if (!check.length) return res.status(404).json({ error: 'Cuenta no encontrada' });
    await db.query('UPDATE cuentas SET activo = 0 WHERE id = ? AND usuario_id = ?', [id, req.usuario.id]);
    res.json({ ok: true, message: 'Cuenta eliminada' });
  } catch (err) {
    console.error('DELETE /cuentas/:id:', err);
    res.status(500).json({ error: 'Error al eliminar cuenta' });
  }
});

// ─── POST /cuentas/:id/deposito ───────────────────────────────
router.post('/:id/deposito', async (req, res) => {
  const { id } = req.params;
  const { monto, descripcion = 'Depósito' } = req.body;
  const mnt = parseFloat(monto);
  if (!mnt || mnt <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a cero' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [check] = await conn.query(
      'SELECT id FROM cuentas WHERE id = ? AND usuario_id = ? AND activo = 1', [id, req.usuario.id]
    );
    if (!check.length) { await conn.rollback(); return res.status(404).json({ error: 'Cuenta no encontrada' }); }
    await conn.query('UPDATE cuentas SET saldo = saldo + ? WHERE id = ? AND activo = 1', [mnt, id]);
    await conn.query(
      `INSERT INTO movimientos (cuenta_id, tipo, monto, descripcion, usuario_id) VALUES (?, 'deposito', ?, ?, ?)`,
      [id, mnt, descripcion, req.usuario.id]
    );
    await conn.commit();
    const [rows] = await conn.query('SELECT * FROM cuentas WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    await conn.rollback();
    console.error('POST /cuentas/:id/deposito:', err);
    res.status(500).json({ error: 'Error al registrar depósito' });
  } finally { conn.release(); }
});

// ─── POST /cuentas/:id/retiro ─────────────────────────────────
router.post('/:id/retiro', async (req, res) => {
  const { id } = req.params;
  const { monto, descripcion = 'Retiro' } = req.body;
  const mnt = parseFloat(monto);
  if (!mnt || mnt <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a cero' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [cuenta] = await conn.query(
      'SELECT saldo FROM cuentas WHERE id = ? AND usuario_id = ? AND activo = 1', [id, req.usuario.id]
    );
    if (!cuenta.length) { await conn.rollback(); return res.status(404).json({ error: 'Cuenta no encontrada' }); }
    await conn.query('UPDATE cuentas SET saldo = saldo - ? WHERE id = ?', [mnt, id]);
    await conn.query(
      `INSERT INTO movimientos (cuenta_id, tipo, monto, descripcion, usuario_id) VALUES (?, 'retiro', ?, ?, ?)`,
      [id, mnt, descripcion, req.usuario.id]
    );
    await conn.commit();
    const [rows] = await conn.query('SELECT * FROM cuentas WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    await conn.rollback();
    console.error('POST /cuentas/:id/retiro:', err);
    res.status(500).json({ error: 'Error al registrar retiro' });
  } finally { conn.release(); }
});

// ─── POST /cuentas/transferencia ──────────────────────────────
router.post('/transferencia', async (req, res) => {
  const { origen_id, destino_id, monto, descripcion = 'Transferencia' } = req.body;
  const mnt = parseFloat(monto);
  if (!origen_id || !destino_id || !mnt || mnt <= 0)
    return res.status(400).json({ error: 'origen_id, destino_id y monto son obligatorios' });
  if (String(origen_id) === String(destino_id))
    return res.status(400).json({ error: 'Las cuentas de origen y destino deben ser distintas' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [cuentasCheck] = await conn.query(
      'SELECT id FROM cuentas WHERE id IN (?, ?) AND usuario_id = ? AND activo = 1',
      [origen_id, destino_id, req.usuario.id]
    );
    if (cuentasCheck.length < 2) { await conn.rollback(); return res.status(404).json({ error: 'Una o ambas cuentas no encontradas' }); }

    await conn.query('UPDATE cuentas SET saldo = saldo - ? WHERE id = ? AND activo = 1', [mnt, origen_id]);
    await conn.query('UPDATE cuentas SET saldo = saldo + ? WHERE id = ? AND activo = 1', [mnt, destino_id]);

    const desc = descripcion || 'Transferencia';
    await conn.query(
      `INSERT INTO movimientos (cuenta_id, tipo, monto, descripcion, cuenta_destino_id, usuario_id) VALUES (?, 'transferencia_salida', ?, ?, ?, ?)`,
      [origen_id, mnt, desc, destino_id, req.usuario.id]
    );
    await conn.query(
      `INSERT INTO movimientos (cuenta_id, tipo, monto, descripcion, cuenta_destino_id, usuario_id) VALUES (?, 'transferencia_entrada', ?, ?, ?, ?)`,
      [destino_id, mnt, desc, origen_id, req.usuario.id]
    );
    await conn.commit();
    const [cuentas] = await conn.query('SELECT * FROM cuentas WHERE id IN (?, ?) AND activo = 1', [origen_id, destino_id]);
    res.json({ ok: true, cuentas });
  } catch (err) {
    await conn.rollback();
    console.error('POST /cuentas/transferencia:', err);
    res.status(500).json({ error: 'Error al realizar transferencia' });
  } finally { conn.release(); }
});

module.exports = router;
