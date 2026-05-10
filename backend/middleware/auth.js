'use strict';

const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticación JWT.
 * Agrega req.usuario = { id, email, nombre } si el token es válido.
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso no autorizado. Token requerido.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded; // { id, email, nombre, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado. Por favor iniciá sesión nuevamente.' });
    }
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

module.exports = authMiddleware;
