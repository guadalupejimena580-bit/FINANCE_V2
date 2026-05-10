'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const auth    = require('../middleware/auth');

router.use(auth);

// ─── GET /gastos ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { cuenta_id, categoria, desde, hasta, limit = 200 } = req.query;
    let sql = `
      SELECT g.id, g.descripcion, g.categoria, g.cuenta_id,
             c.nombre AS cuenta_nombre, c.moneda AS cuenta_moneda,
             g.monto, g.fecha, g.notas, g.fecha_creacion
      FROM gastos g
      LEFT JOIN cuentas c ON c.id = g.cuenta_id
      WHERE g.usuario_id = ?`;
    const params = [req.usuario.id];

    if (cuenta_id) { sql += ' AND g.cuenta_id = ?';  params.push(cuenta_id); }
    if (categoria)  { sql += ' AND g.categoria = ?'; params.push(categoria); }
    if (desde)      { sql += ' AND g.fecha >= ?';    params.push(desde); }
    if (hasta)      { sql += ' AND g.fecha <= ?';    params.push(hasta); }

    sql += ' ORDER BY g.fecha DESC, g.fecha_creacion DESC LIMIT ?';
    params.push(parseInt(limit));

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('GET /gastos:', err);
    res.status(500).json({ error: 'Error al obtener gastos' });
  }
});

// ─── POST /gastos ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { descripcion, categoria = 'Otros', cuenta_id = null, monto, fecha, notas = '' } = req.body;
  if (!descripcion) return res.status(400).json({ error: 'descripcion es obligatoria' });
  const mnt = parseFloat(monto);
  if (!mnt || mnt <= 0) return res.status(400).json({ error: 'monto debe ser mayor a cero' });

  const fechaFinal = fecha || new Date().toISOString().split('T')[0];
  const cid = cuenta_id ? parseInt(cuenta_id) : null;

  // Verificar que la cuenta pertenece al usuario si se especificó
  if (cid) {
    const [ck] = await db.query('SELECT id FROM cuentas WHERE id = ? AND usuario_id = ? AND activo = 1', [cid, req.usuario.id]);
    if (!ck.length) return res.status(403).json({ error: 'Cuenta no autorizada' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO gastos (descripcion, categoria, cuenta_id, monto, fecha, notas, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [descripcion.trim(), categoria, cid, mnt, fechaFinal, notas.trim(), req.usuario.id]
    );
    if (cid) {
      await conn.query('UPDATE cuentas SET saldo = saldo - ? WHERE id = ? AND activo = 1', [mnt, cid]);
      await conn.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, descripcion, referencia_id, usuario_id)
         VALUES (?, 'gasto', ?, ?, ?, ?)`,
        [cid, mnt, descripcion.trim(), result.insertId, req.usuario.id]
      );
    }
    await conn.commit();
    const [rows] = await conn.query(
      `SELECT g.*, c.nombre AS cuenta_nombre, c.moneda AS cuenta_moneda
       FROM gastos g LEFT JOIN cuentas c ON c.id = g.cuenta_id WHERE g.id = ?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    await conn.rollback();
    console.error('POST /gastos:', err);
    res.status(500).json({ error: 'Error al crear gasto' });
  } finally { conn.release(); }
});

// ─── PUT /gastos/:id ──────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { descripcion, categoria, cuenta_id, monto, fecha, notas } = req.body;
  const mnt = parseFloat(monto);
  if (!descripcion) return res.status(400).json({ error: 'descripcion es obligatoria' });
  if (!mnt || mnt <= 0) return res.status(400).json({ error: 'monto debe ser mayor a cero' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [orig] = await conn.query('SELECT * FROM gastos WHERE id = ? AND usuario_id = ?', [id, req.usuario.id]);
    if (!orig.length) { await conn.rollback(); return res.status(404).json({ error: 'Gasto no encontrado' }); }

    const gastoOrig   = orig[0];
    const cuentaOrigId = gastoOrig.cuenta_id;
    const cuentaNuevaId = cuenta_id ? parseInt(cuenta_id) : null;

    if (cuentaOrigId)  await conn.query('UPDATE cuentas SET saldo = saldo + ? WHERE id = ? AND activo = 1', [parseFloat(gastoOrig.monto), cuentaOrigId]);
    if (cuentaNuevaId) await conn.query('UPDATE cuentas SET saldo = saldo - ? WHERE id = ? AND activo = 1', [mnt, cuentaNuevaId]);

    await conn.query(
      `UPDATE gastos SET descripcion=?, categoria=?, cuenta_id=?, monto=?, fecha=?, notas=? WHERE id=? AND usuario_id=?`,
      [descripcion.trim(), categoria || 'Otros', cuentaNuevaId, mnt, fecha || gastoOrig.fecha, notas || '', id, req.usuario.id]
    );
    await conn.commit();
    const [rows] = await conn.query(
      `SELECT g.*, c.nombre AS cuenta_nombre, c.moneda AS cuenta_moneda
       FROM gastos g LEFT JOIN cuentas c ON c.id = g.cuenta_id WHERE g.id = ?`, [id]
    );
    res.json(rows[0]);
  } catch (err) {
    await conn.rollback();
    console.error('PUT /gastos/:id:', err);
    res.status(500).json({ error: 'Error al editar gasto' });
  } finally { conn.release(); }
});

// ─── DELETE /gastos/:id ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [orig] = await conn.query('SELECT * FROM gastos WHERE id = ? AND usuario_id = ?', [id, req.usuario.id]);
    if (!orig.length) { await conn.rollback(); return res.status(404).json({ error: 'Gasto no encontrado' }); }
    const g = orig[0];
    if (g.cuenta_id) {
      await conn.query('UPDATE cuentas SET saldo = saldo + ? WHERE id = ? AND activo = 1', [parseFloat(g.monto), g.cuenta_id]);
    }
    await conn.query('DELETE FROM gastos WHERE id = ? AND usuario_id = ?', [id, req.usuario.id]);
    await conn.commit();
    res.json({ ok: true, message: 'Gasto eliminado, saldo revertido' });
  } catch (err) {
    await conn.rollback();
    console.error('DELETE /gastos/:id:', err);
    res.status(500).json({ error: 'Error al eliminar gasto' });
  } finally { conn.release(); }
});

// ─── GET /gastos/categorias ───────────────────────────────────
router.get('/categorias', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT categoria, COUNT(*) AS cantidad, SUM(monto) AS total, AVG(monto) AS promedio
       FROM gastos WHERE usuario_id = ?
       GROUP BY categoria ORDER BY total DESC`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /gastos/categorias:', err);
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

module.exports = router;
