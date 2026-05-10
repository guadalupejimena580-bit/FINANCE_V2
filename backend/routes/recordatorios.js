'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const auth    = require('../middleware/auth');

router.use(auth);

// ─── GET /recordatorios ───────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, nombre, categoria, dia_mes, monto_estimado, urgencia, notas, activo,
              CASE
                WHEN dia_mes < DAY(CURDATE()) THEN 'pasado'
                WHEN dia_mes = DAY(CURDATE()) THEN 'hoy'
                WHEN dia_mes <= DAY(CURDATE()) + 3 THEN 'proximo'
                ELSE 'futuro'
              END AS estado_dia,
              CASE
                WHEN dia_mes >= DAY(CURDATE())
                  THEN dia_mes - DAY(CURDATE())
                ELSE (DAY(LAST_DAY(CURDATE())) - DAY(CURDATE())) + dia_mes
              END AS dias_para_pago
       FROM recordatorios
       WHERE activo = 1 AND usuario_id = ?
       ORDER BY dia_mes ASC`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /recordatorios:', err);
    res.status(500).json({ error: 'Error al obtener recordatorios' });
  }
});

// ─── POST /recordatorios ──────────────────────────────────────
router.post('/', async (req, res) => {
  const { nombre, categoria = 'Servicios', dia_mes, monto_estimado = 0, urgencia = 'ok', notas = '' } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es obligatorio' });
  const dia = parseInt(dia_mes);
  if (!dia || dia < 1 || dia > 31) return res.status(400).json({ error: 'dia_mes debe ser entre 1 y 31' });

  try {
    const [result] = await db.query(
      `INSERT INTO recordatorios (nombre, categoria, dia_mes, monto_estimado, urgencia, notas, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nombre.trim(), categoria, dia, parseFloat(monto_estimado) || 0, urgencia, notas.trim(), req.usuario.id]
    );
    const [rows] = await db.query('SELECT * FROM recordatorios WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /recordatorios:', err);
    res.status(500).json({ error: 'Error al crear recordatorio' });
  }
});

// ─── PUT /recordatorios/:id ───────────────────────────────────
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, categoria, dia_mes, monto_estimado, urgencia, notas } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es obligatorio' });
  const dia = parseInt(dia_mes);
  if (!dia || dia < 1 || dia > 31) return res.status(400).json({ error: 'dia_mes debe ser entre 1 y 31' });

  try {
    const [check] = await db.query('SELECT id FROM recordatorios WHERE id = ? AND usuario_id = ?', [id, req.usuario.id]);
    if (!check.length) return res.status(404).json({ error: 'Recordatorio no encontrado' });

    await db.query(
      `UPDATE recordatorios SET nombre=?, categoria=?, dia_mes=?, monto_estimado=?, urgencia=?, notas=?
       WHERE id=? AND usuario_id=?`,
      [nombre.trim(), categoria || 'Servicios', dia, parseFloat(monto_estimado) || 0,
       urgencia || 'ok', notas || '', id, req.usuario.id]
    );
    const [rows] = await db.query('SELECT * FROM recordatorios WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /recordatorios/:id:', err);
    res.status(500).json({ error: 'Error al editar recordatorio' });
  }
});

// ─── DELETE /recordatorios/:id ────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [check] = await db.query('SELECT id FROM recordatorios WHERE id = ? AND usuario_id = ?', [id, req.usuario.id]);
    if (!check.length) return res.status(404).json({ error: 'Recordatorio no encontrado' });
    await db.query('UPDATE recordatorios SET activo = 0 WHERE id = ? AND usuario_id = ?', [id, req.usuario.id]);
    res.json({ ok: true, message: 'Recordatorio eliminado' });
  } catch (err) {
    console.error('DELETE /recordatorios/:id:', err);
    res.status(500).json({ error: 'Error al eliminar recordatorio' });
  }
});

module.exports = router;
