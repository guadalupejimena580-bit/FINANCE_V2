# FINANCE v3.0 — Guía de Migración a Multiusuario

## ¿Qué cambió?

La aplicación evolucionó de single-user a **SaaS multiusuario** con autenticación JWT completa.

---

## PASO 1 — Instalar dependencias nuevas

En el servidor o localmente:

```bash
cd backend
npm install
```

Esto instala `bcrypt` y `jsonwebtoken` que son las nuevas dependencias.

---

## PASO 2 — Variables de entorno en Render

Agregá estas variables en **Render → Settings → Environment**:

| Variable | Valor |
|----------|-------|
| `JWT_SECRET` | Un string aleatorio de 64+ chars (ver abajo) |
| `JWT_EXPIRES_IN` | `7d` (opcional, default ya es 7d) |

**Cómo generar JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Las variables de DB (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`) **no cambian**.

---

## PASO 3 — Migrar la base de datos en Railway

Conectate a tu MySQL en Railway y ejecutá **en orden**:

### 3a. Si tenés datos existentes (migración):

```sql
-- 1. Crear tabla usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id              INT           NOT NULL AUTO_INCREMENT,
    nombre          VARCHAR(100)  NOT NULL,
    email           VARCHAR(255)  NOT NULL,
    password_hash   VARCHAR(255)  NOT NULL,
    activo          TINYINT(1)    NOT NULL DEFAULT 1,
    fecha_creacion  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Agregar columna usuario_id a todas las tablas
ALTER TABLE cuentas        ADD COLUMN IF NOT EXISTS usuario_id INT NULL AFTER activo;
ALTER TABLE gastos         ADD COLUMN IF NOT EXISTS usuario_id INT NULL AFTER notas;
ALTER TABLE deudas         ADD COLUMN IF NOT EXISTS usuario_id INT NULL AFTER notas;
ALTER TABLE pagos_deuda    ADD COLUMN IF NOT EXISTS usuario_id INT NULL AFTER notas;
ALTER TABLE recordatorios  ADD COLUMN IF NOT EXISTS usuario_id INT NULL AFTER activo;
ALTER TABLE movimientos    ADD COLUMN IF NOT EXISTS usuario_id INT NULL AFTER cuenta_destino_id;

-- 3. Agregar índices
ALTER TABLE cuentas        ADD INDEX IF NOT EXISTS idx_cuentas_usuario       (usuario_id);
ALTER TABLE gastos         ADD INDEX IF NOT EXISTS idx_gastos_usuario         (usuario_id);
ALTER TABLE deudas         ADD INDEX IF NOT EXISTS idx_deudas_usuario         (usuario_id);
ALTER TABLE pagos_deuda    ADD INDEX IF NOT EXISTS idx_pagos_usuario          (usuario_id);
ALTER TABLE recordatorios  ADD INDEX IF NOT EXISTS idx_recordatorios_usuario  (usuario_id);
ALTER TABLE movimientos    ADD INDEX IF NOT EXISTS idx_mov_usuario             (usuario_id);
```

> ⚠️ **Nota:** Los datos existentes quedarán con `usuario_id = NULL`. Son datos legacy y NO serán visibles para ningún usuario nuevo. Si querés asignarlos a un usuario específico, creá el usuario primero y luego `UPDATE tabla SET usuario_id = <id> WHERE usuario_id IS NULL`.

### 3b. Si es instalación limpia (sin datos previos):

Ejecutá directamente el archivo `database.sql` completo.

---

## PASO 4 — Subir el código a GitHub

Committeá y pusheá los cambios. Render hará el deploy automático.

```bash
git add -A
git commit -m "feat: autenticación JWT multiusuario"
git push origin main
```

---

## PASO 5 — Verificar en producción

1. Abrí la URL de tu app en Render
2. Deberías ver la **pantalla de login** (no el dashboard)
3. Registrá un usuario con /Crear cuenta/
4. Iniciá sesión y verificá que el dashboard funciona
5. Verificá en `/api/health` que responde `{"status":"ok","version":"3.0.0"}`

---

## Arquitectura nueva

```
backend/
├── server.js               ← Punto de entrada (actualizado)
├── db.js                   ← Pool MySQL (sin cambios)
├── package.json            ← +bcrypt, +jsonwebtoken
├── .env.example            ← Variables de entorno de referencia
│
├── auth/
│   └── authRoutes.js       ← POST /register, POST /login, GET /me
│
├── middleware/
│   └── auth.js             ← Verificación JWT, popula req.usuario
│
└── routes/
    ├── cuentas.js          ← Filtrado por usuario_id ✅
    ├── gastos.js           ← Filtrado por usuario_id ✅
    ├── deudas.js           ← Filtrado por usuario_id ✅
    ├── recordatorios.js    ← Filtrado por usuario_id ✅
    └── dashboard.js        ← Filtrado por usuario_id ✅

frontend/
└── index.html              ← Auth overlay + JWT en headers ✅
```

---

## Endpoints nuevos

| Método | Ruta | Auth requerida | Descripción |
|--------|------|:--------------:|-------------|
| POST | `/api/auth/register` | No | Registrar nuevo usuario |
| POST | `/api/auth/login` | No | Login, retorna JWT |
| GET | `/api/auth/me` | Sí | Verificar token y obtener datos |
| Todos los demás | `/api/*` | **Sí** | Requieren `Authorization: Bearer <token>` |

---

## Seguridad implementada

- ✅ Contraseñas hasheadas con **bcrypt** (12 rounds)
- ✅ Tokens **JWT** firmados con secreto en variable de entorno
- ✅ Expiración de token (7 días por defecto)
- ✅ Middleware de auth en todas las rutas privadas
- ✅ Aislamiento total de datos por usuario (WHERE usuario_id = ?)
- ✅ Verificación de ownership antes de UPDATE/DELETE
- ✅ Renovación automática de sesión al cargar la app
- ✅ Logout forzado si el token expira
