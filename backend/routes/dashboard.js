'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const auth    = require('../middleware/auth');

router.use(auth);

// ─── GET /dashboard ───────────────────────────────────────────
router.get('/', async (req, res) => {
  const uid = req.usuario.id;
  try {
    const [[balance]] = await db.query(
      `SELECT COALESCE(SUM(saldo), 0) AS total_activos FROM cuentas WHERE activo = 1 AND usuario_id = ?`,
      [uid]
    );
    const [[gastos]] = await db.query(
      `SELECT
        COALESCE(SUM(monto), 0) AS total_gastos,
        COALESCE(SUM(CASE WHEN YEAR(fecha)=YEAR(CURDATE()) AND MONTH(fecha)=MONTH(CURDATE())
                     THEN monto ELSE 0 END), 0) AS gastos_mes
       FROM gastos WHERE usuario_id = ?`,
      [uid]
    );
    const [[deudas]] = await db.query(
      `SELECT COALESCE(SUM(GREATEST(0, monto_total - monto_pagado)), 0) AS total_deudas
       FROM deudas WHERE estado != 'pagada' AND usuario_id = ?`,
      [uid]
    );
    const [cuentas] = await db.query(
      `SELECT id, nombre, tipo, moneda, saldo FROM cuentas WHERE activo = 1 AND usuario_id = ? ORDER BY tipo, nombre`,
      [uid]
    );
    const [recordatorios] = await db.query(
      `SELECT id, nombre, categoria, dia_mes, monto_estimado, urgencia,
              CASE
                WHEN dia_mes >= DAY(CURDATE()) THEN dia_mes - DAY(CURDATE())
                ELSE (DAY(LAST_DAY(CURDATE())) - DAY(CURDATE())) + dia_mes
              END AS dias_para_pago
       FROM recordatorios WHERE activo = 1 AND usuario_id = ?
       ORDER BY CASE WHEN dia_mes >= DAY(CURDATE()) THEN dia_mes - DAY(CURDATE()) ELSE 99 + dia_mes END
       LIMIT 5`,
      [uid]
    );
    const [movimientos] = await db.query(
      `SELECT g.id, g.descripcion, g.categoria, g.monto, g.fecha, c.nombre AS cuenta_nombre
       FROM gastos g
       LEFT JOIN cuentas c ON c.id = g.cuenta_id
       WHERE g.usuario_id = ?
       ORDER BY g.fecha DESC, g.fecha_creacion DESC
       LIMIT 8`,
      [uid]
    );
    const [catGastos] = await db.query(
      `SELECT categoria, SUM(monto) AS total, COUNT(*) AS cantidad
       FROM gastos WHERE usuario_id = ?
       GROUP BY categoria ORDER BY total DESC`,
      [uid]
    );

    res.json({
      stats: {
        total_activos        : parseFloat(balance.total_activos)  || 0,
        total_gastos         : parseFloat(gastos.total_gastos)    || 0,
        gastos_mes           : parseFloat(gastos.gastos_mes)      || 0,
        total_deudas         : parseFloat(deudas.total_deudas)    || 0,
        patrimonio_neto      : (parseFloat(balance.total_activos) || 0) - (parseFloat(deudas.total_deudas) || 0),
        total_recordatorios  : recordatorios.length,
      },
      cuentas,
      recordatorios,
      movimientos,
      catGastos,
    });
  } catch (err) {
    console.error('GET /dashboard:', err);
    res.status(500).json({ error: 'Error al obtener datos del dashboard' });
  }
});

// ─── GET /dashboard/resumen ───────────────────────────────────
router.get('/resumen', async (req, res) => {
  const uid = req.usuario.id;
  try {
    const [[totales]] = await db.query(
      `SELECT
        (SELECT COALESCE(SUM(saldo),0) FROM cuentas WHERE activo=1 AND usuario_id=?)        AS activos,
        (SELECT COALESCE(SUM(GREATEST(0,monto_total-monto_pagado)),0)
         FROM deudas WHERE estado!='pagada' AND usuario_id=?)                                AS deudas,
        (SELECT COALESCE(SUM(monto),0) FROM gastos WHERE usuario_id=?)                      AS gastos_total,
        (SELECT COALESCE(SUM(monto),0) FROM gastos
         WHERE YEAR(fecha)=YEAR(CURDATE()) AND MONTH(fecha)=MONTH(CURDATE()) AND usuario_id=?) AS gastos_mes`,
      [uid, uid, uid, uid]
    );
    const [cuentas] = await db.query(
      'SELECT id, nombre, tipo, moneda, saldo FROM cuentas WHERE activo=1 AND usuario_id=? ORDER BY saldo DESC',
      [uid]
    );
    const [catGastos] = await db.query(
      `SELECT categoria, SUM(monto) AS total, COUNT(*) AS cantidad, ROUND(AVG(monto),0) AS promedio
       FROM gastos WHERE usuario_id=? GROUP BY categoria ORDER BY total DESC`,
      [uid]
    );
    const [porMes] = await db.query(
      `SELECT DATE_FORMAT(fecha,'%Y-%m') AS periodo, SUM(monto) AS total, COUNT(*) AS cantidad
       FROM gastos WHERE usuario_id=?
       GROUP BY periodo ORDER BY periodo DESC LIMIT 12`,
      [uid]
    );

    res.json({
      totales: {
        activos     : parseFloat(totales.activos)      || 0,
        deudas      : parseFloat(totales.deudas)       || 0,
        gastos_total: parseFloat(totales.gastos_total) || 0,
        gastos_mes  : parseFloat(totales.gastos_mes)   || 0,
        patrimonio  : (parseFloat(totales.activos)||0) - (parseFloat(totales.deudas)||0),
      },
      cuentas,
      catGastos,
      porMes,
    });
  } catch (err) {
    console.error('GET /dashboard/resumen:', err);
    res.status(500).json({ error: 'Error al obtener resumen' });
  }
});

module.exports = router;
