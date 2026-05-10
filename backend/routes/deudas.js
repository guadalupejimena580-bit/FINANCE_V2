'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const auth    = require('../middleware/auth');

router.use(auth);

// ─── GET /deudas ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, descripcion, acreedor, tipo,
              monto_total, monto_pagado,
              GREATEST(0, monto_total - monto_pagado) AS saldo_pendiente,
              CASE WHEN monto_total > 0
                   THEN ROUND((monto_pagado / monto_total) * 100, 1)
                   ELSE 0 END AS pct_pagado,
              tasa_interes, fecha_inicio, fecha_vencimiento, estado, notas, fecha_creacion
       FROM deudas
       WHERE usuario_id = ?
       ORDER BY FIELD(estado,'vencida','en_curso','pendiente','pagada'), fecha_vencimiento ASC`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /deudas:', err);
    res.status(500).json({ error: 'Error al obtener deudas' });
  }
});

// ─── POST /deudas ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { descripcion, acreedor = '', tipo = 'prestamo', monto_total, monto_pagado = 0,
    tasa_interes = 0, fecha_inicio = null, fecha_vencimiento = null, notas = '' } = req.body;

  if (!descripcion) return res.status(400).json({ error: 'descripcion es obligatoria' });
  const total = parseFloat(monto_total);
  if (!total || total <= 0) return res.status(400).json({ error: 'monto_total debe ser mayor a cero' });

  const pagado = Math.min(parseFloat(monto_pagado) || 0, total);
  const estado = pagado >= total ? 'pagada' : pagado > 0 ? 'en_curso' : 'pendiente';

  try {
    const [result] = await db.query(
      `INSERT INTO deudas (descripcion, acreedor, tipo, monto_total, monto_pagado,
        tasa_interes, fecha_inicio, fecha_vencimiento, estado, notas, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [descripcion.trim(), acreedor.trim(), tipo, total, pagado,
       parseFloat(tasa_interes) || 0, fecha_inicio || null, fecha_vencimiento || null,
       estado, notas.trim(), req.usuario.id]
    );
    const [rows] = await db.query('SELECT * FROM deudas WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /deudas:', err);
    res.status(500).json({ error: 'Error al crear deuda' });
  }
});

// ─── PUT /deudas/:id ──────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { descripcion, acreedor, tipo, monto_total, monto_pagado,
    tasa_interes, fecha_inicio, fecha_vencimiento, notas } = req.body;

  if (!descripcion) return res.status(400).json({ error: 'descripcion es obligatoria' });
  const total  = parseFloat(monto_total);
  const pagado = Math.min(parseFloat(monto_pagado) || 0, total);
  if (!total || total <= 0) return res.status(400).json({ error: 'monto_total inválido' });
  const estado = pagado >= total ? 'pagada' : pagado > 0 ? 'en_curso' : 'pendiente';

  try {
    const [check] = await db.query('SELECT id FROM deudas WHERE id = ? AND usuario_id = ?', [id, req.usuario.id]);
    if (!check.length) return res.status(404).json({ error: 'Deuda no encontrada' });

    await db.query(
      `UPDATE deudas SET descripcion=?, acreedor=?, tipo=?, monto_total=?, monto_pagado=?,
        tasa_interes=?, fecha_inicio=?, fecha_vencimiento=?, estado=?, notas=? WHERE id=? AND usuario_id=?`,
      [descripcion.trim(), acreedor || '', tipo || 'prestamo', total, pagado,
       parseFloat(tasa_interes) || 0, fecha_inicio || null, fecha_vencimiento || null,
       estado, notas || '', id, req.usuario.id]
    );
    const [rows] = await db.query('SELECT * FROM deudas WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /deudas/:id:', err);
    res.status(500).json({ error: 'Error al editar deuda' });
  }
});

// ─── DELETE /deudas/:id ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [check] = await db.query('SELECT id FROM deudas WHERE id = ? AND usuario_id = ?', [id, req.usuario.id]);
    if (!check.length) return res.status(404).json({ error: 'Deuda no encontrada' });
    await db.query('DELETE FROM deudas WHERE id = ? AND usuario_id = ?', [id, req.usuario.id]);
    res.json({ ok: true, message: 'Deuda eliminada' });
  } catch (err) {
    console.error('DELETE /deudas/:id:', err);
    res.status(500).json({ error: 'Error al eliminar deuda' });
  }
});

// ─── POST /deudas/:id/pago ────────────────────────────────────
router.post('/:id/pago', async (req, res) => {
  const { id } = req.params;
  const { monto, cuenta_id = null, notas = '' } = req.body;
  const mnt = parseFloat(monto);
  if (!mnt || mnt <= 0) return res.status(400).json({ error: 'monto debe ser mayor a cero' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [orig] = await conn.query('SELECT * FROM deudas WHERE id = ? AND usuario_id = ?', [id, req.usuario.id]);
    if (!orig.length) { await conn.rollback(); return res.status(404).json({ error: 'Deuda no encontrada' }); }

    const deuda = orig[0];
    if (deuda.estado === 'pagada') { await conn.rollback(); return res.status(400).json({ error: 'La deuda ya está completamente pagada' }); }

    const nuevoPagado = Math.min(parseFloat(deuda.monto_pagado) + mnt, parseFloat(deuda.monto_total));
    const nuevoEstado = nuevoPagado >= parseFloat(deuda.monto_total) ? 'pagada' : 'en_curso';

    await conn.query('UPDATE deudas SET monto_pagado = ?, estado = ? WHERE id = ?', [nuevoPagado, nuevoEstado, id]);

    const cid = cuenta_id ? parseInt(cuenta_id) : null;
    if (cid) {
      const [ck] = await conn.query('SELECT id FROM cuentas WHERE id = ? AND usuario_id = ? AND activo = 1', [cid, req.usuario.id]);
      if (!ck.length) { await conn.rollback(); return res.status(403).json({ error: 'Cuenta no autorizada' }); }
    }

    await conn.query(
      `INSERT INTO pagos_deuda (deuda_id, cuenta_id, monto, notas, usuario_id) VALUES (?, ?, ?, ?, ?)`,
      [id, cid || null, mnt, notas.trim(), req.usuario.id]
    );
    if (cid) {
      await conn.query('UPDATE cuentas SET saldo = saldo - ? WHERE id = ? AND activo = 1', [mnt, cid]);
    }
    await conn.commit();
    const [rows] = await conn.query('SELECT * FROM deudas WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    await conn.rollback();
    console.error('POST /deudas/:id/pago:', err);
    res.status(500).json({ error: 'Error al registrar pago' });
  } finally { conn.release(); }
});

module.exports = router;
