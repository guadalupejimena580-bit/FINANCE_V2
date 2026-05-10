-- ============================================================
--  FINANCE v3.0 — Schema MySQL 8.0 (Multiusuario con JWT)
--  Compatible con Railway MySQL — sin IF NOT EXISTS en ALTER
--
--  INSTRUCCIONES:
--  1. Ejecutar completo si es instalación nueva (base vacía).
--  2. Si ya tenés datos, ejecutar igualmente — los CREATE TABLE
--     usan IF NOT EXISTS y los ALTER están protegidos por
--     procedimientos que verifican INFORMATION_SCHEMA primero.
--  3. NO elimina ni trunca ninguna tabla existente.
-- ============================================================

-- ── Seleccionar base de datos ─────────────────────────────────
CREATE DATABASE IF NOT EXISTS finance_db
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE finance_db;

SET FOREIGN_KEY_CHECKS = 0;

-- ══════════════════════════════════════════════════════════════
--  TABLA: usuarios  (nueva en v3.0)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS usuarios (
    id              INT           NOT NULL AUTO_INCREMENT,
    nombre          VARCHAR(100)  NOT NULL,
    email           VARCHAR(255)  NOT NULL,
    password_hash   VARCHAR(255)  NOT NULL,
    activo          TINYINT(1)    NOT NULL DEFAULT 1,
    fecha_creacion  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_usuarios_email (email),
    INDEX idx_usuarios_email  (email),
    INDEX idx_usuarios_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ══════════════════════════════════════════════════════════════
--  TABLAS BASE — se crean solo si no existen (instalación nueva)
--  En bases existentes estos CREATE son ignorados por IF NOT EXISTS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cuentas (
    id                  INT           NOT NULL AUTO_INCREMENT,
    nombre              VARCHAR(100)  NOT NULL,
    tipo                ENUM('debito','credito','ahorro','efectivo') NOT NULL,
    moneda              VARCHAR(10)   NOT NULL DEFAULT 'PYG',
    saldo               DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    saldo_inicial       DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    descripcion         VARCHAR(255)      NULL DEFAULT '',
    activo              TINYINT(1)    NOT NULL DEFAULT 1,
    usuario_id          INT               NULL,
    fecha_creacion      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_cuentas_tipo    (tipo),
    INDEX idx_cuentas_activo  (activo),
    INDEX idx_cuentas_usuario (usuario_id),
    CONSTRAINT fk_cuentas_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gastos (
    id              INT           NOT NULL AUTO_INCREMENT,
    descripcion     VARCHAR(255)  NOT NULL,
    categoria       VARCHAR(100)  NOT NULL DEFAULT 'Otros',
    cuenta_id       INT               NULL,
    monto           DECIMAL(18,2) NOT NULL,
    fecha           DATE          NOT NULL DEFAULT (CURRENT_DATE),
    notas           TEXT              NULL,
    usuario_id      INT               NULL,
    fecha_creacion  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_gastos_cuenta
        FOREIGN KEY (cuenta_id)  REFERENCES cuentas(id)  ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_gastos_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT chk_gastos_monto CHECK (monto > 0),
    INDEX idx_gastos_cuenta    (cuenta_id),
    INDEX idx_gastos_categoria (categoria),
    INDEX idx_gastos_fecha     (fecha),
    INDEX idx_gastos_usuario   (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deudas (
    id                  INT           NOT NULL AUTO_INCREMENT,
    descripcion         VARCHAR(255)  NOT NULL,
    acreedor            VARCHAR(100)      NULL DEFAULT '',
    tipo                ENUM('prestamo','tarjeta','cuotas','personal') NOT NULL DEFAULT 'prestamo',
    monto_total         DECIMAL(18,2) NOT NULL,
    monto_pagado        DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    tasa_interes        DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
    fecha_inicio        DATE              NULL,
    fecha_vencimiento   DATE              NULL,
    estado              ENUM('pendiente','en_curso','pagada','vencida') NOT NULL DEFAULT 'pendiente',
    notas               TEXT              NULL,
    usuario_id          INT               NULL,
    fecha_creacion      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_deudas_usuario  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT chk_deudas_total   CHECK (monto_total  > 0),
    CONSTRAINT chk_deudas_pagado  CHECK (monto_pagado >= 0),
    INDEX idx_deudas_estado       (estado),
    INDEX idx_deudas_vencimiento  (fecha_vencimiento),
    INDEX idx_deudas_usuario      (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pagos_deuda (
    id             INT           NOT NULL AUTO_INCREMENT,
    deuda_id       INT           NOT NULL,
    cuenta_id      INT               NULL,
    monto          DECIMAL(18,2) NOT NULL,
    fecha          DATE          NOT NULL DEFAULT (CURRENT_DATE),
    notas          VARCHAR(255)      NULL DEFAULT '',
    usuario_id     INT               NULL,
    fecha_creacion DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_pagos_deuda   FOREIGN KEY (deuda_id)   REFERENCES deudas(id)    ON DELETE CASCADE,
    CONSTRAINT fk_pagos_cuenta  FOREIGN KEY (cuenta_id)  REFERENCES cuentas(id)   ON DELETE SET NULL,
    CONSTRAINT fk_pagos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)  ON DELETE CASCADE,
    CONSTRAINT chk_pagos_monto  CHECK (monto > 0),
    INDEX idx_pagos_deuda   (deuda_id),
    INDEX idx_pagos_cuenta  (cuenta_id),
    INDEX idx_pagos_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recordatorios (
    id                  INT           NOT NULL AUTO_INCREMENT,
    nombre              VARCHAR(100)  NOT NULL,
    categoria           VARCHAR(100)  NOT NULL DEFAULT 'Servicios',
    dia_mes             TINYINT       NOT NULL,
    monto_estimado      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    urgencia            ENUM('ok','soon','urgent') NOT NULL DEFAULT 'ok',
    notas               VARCHAR(255)      NULL DEFAULT '',
    activo              TINYINT(1)    NOT NULL DEFAULT 1,
    usuario_id          INT               NULL,
    fecha_creacion      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_recordatorios_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT chk_recordatorios_dia CHECK (dia_mes BETWEEN 1 AND 31),
    INDEX idx_recordatorios_dia     (dia_mes),
    INDEX idx_recordatorios_activo  (activo),
    INDEX idx_recordatorios_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS movimientos (
    id                 INT           NOT NULL AUTO_INCREMENT,
    cuenta_id          INT           NOT NULL,
    tipo               ENUM('deposito','retiro','gasto','transferencia_salida','transferencia_entrada') NOT NULL,
    monto              DECIMAL(18,2) NOT NULL,
    descripcion        VARCHAR(255)      NULL,
    referencia_id      INT               NULL COMMENT 'ID del gasto o pago relacionado',
    cuenta_destino_id  INT               NULL COMMENT 'Para transferencias',
    usuario_id         INT               NULL,
    fecha_creacion     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_mov_cuenta  FOREIGN KEY (cuenta_id)  REFERENCES cuentas(id)  ON DELETE CASCADE,
    CONSTRAINT fk_mov_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_mov_cuenta  (cuenta_id),
    INDEX idx_mov_tipo    (tipo),
    INDEX idx_mov_fecha   (fecha_creacion),
    INDEX idx_mov_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ══════════════════════════════════════════════════════════════
--  MIGRACIÓN SEGURA — Agregar usuario_id a tablas existentes
--
--  Usa procedimientos almacenados que consultan INFORMATION_SCHEMA
--  antes de cada ALTER TABLE. Si la columna/índice/FK ya existe,
--  simplemente no hace nada. Completamente seguro para re-ejecutar.
-- ══════════════════════════════════════════════════════════════

DROP PROCEDURE IF EXISTS _add_usuario_id_column;
DROP PROCEDURE IF EXISTS _add_usuario_id_index;
DROP PROCEDURE IF EXISTS _add_usuario_id_fk;

DELIMITER $$

-- ── Procedimiento: agrega columna usuario_id si no existe ─────
CREATE PROCEDURE _add_usuario_id_column(IN tbl VARCHAR(64), IN after_col VARCHAR(64))
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = tbl
          AND COLUMN_NAME  = 'usuario_id'
    ) THEN
        SET @sql = CONCAT(
            'ALTER TABLE `', tbl, '` ADD COLUMN usuario_id INT NULL AFTER `', after_col, '`'
        );
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

-- ── Procedimiento: agrega índice usuario_id si no existe ──────
CREATE PROCEDURE _add_usuario_id_index(IN tbl VARCHAR(64), IN idx_name VARCHAR(64))
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = tbl
          AND INDEX_NAME   = idx_name
    ) THEN
        SET @sql = CONCAT(
            'ALTER TABLE `', tbl, '` ADD INDEX `', idx_name, '` (usuario_id)'
        );
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

-- ── Procedimiento: agrega FK usuario_id si no existe ─────────
CREATE PROCEDURE _add_usuario_id_fk(IN tbl VARCHAR(64), IN fk_name VARCHAR(64))
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA    = DATABASE()
          AND TABLE_NAME      = tbl
          AND CONSTRAINT_NAME = fk_name
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    ) THEN
        SET @sql = CONCAT(
            'ALTER TABLE `', tbl, '` ADD CONSTRAINT `', fk_name,
            '` FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE'
        );
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

DELIMITER ;

-- ── Ejecutar migraciones de columnas ─────────────────────────
-- El segundo parámetro es la columna DESPUÉS de la cual se inserta usuario_id

CALL _add_usuario_id_column('cuentas',       'activo');
CALL _add_usuario_id_column('gastos',        'notas');
CALL _add_usuario_id_column('deudas',        'notas');
CALL _add_usuario_id_column('pagos_deuda',   'notas');
CALL _add_usuario_id_column('recordatorios', 'activo');
CALL _add_usuario_id_column('movimientos',   'cuenta_destino_id');

-- ── Ejecutar migraciones de índices ──────────────────────────

CALL _add_usuario_id_index('cuentas',       'idx_cuentas_usuario');
CALL _add_usuario_id_index('gastos',        'idx_gastos_usuario');
CALL _add_usuario_id_index('deudas',        'idx_deudas_usuario');
CALL _add_usuario_id_index('pagos_deuda',   'idx_pagos_usuario');
CALL _add_usuario_id_index('recordatorios', 'idx_recordatorios_usuario');
CALL _add_usuario_id_index('movimientos',   'idx_mov_usuario');

-- ── Ejecutar migraciones de foreign keys ─────────────────────

CALL _add_usuario_id_fk('cuentas',       'fk_cuentas_usuario');
CALL _add_usuario_id_fk('gastos',        'fk_gastos_usuario');
CALL _add_usuario_id_fk('deudas',        'fk_deudas_usuario');
CALL _add_usuario_id_fk('pagos_deuda',   'fk_pagos_usuario');
CALL _add_usuario_id_fk('recordatorios', 'fk_recordatorios_usuario');
CALL _add_usuario_id_fk('movimientos',   'fk_mov_usuario');

-- ── Limpiar procedimientos temporales ────────────────────────
DROP PROCEDURE IF EXISTS _add_usuario_id_column;
DROP PROCEDURE IF EXISTS _add_usuario_id_index;
DROP PROCEDURE IF EXISTS _add_usuario_id_fk;

-- ══════════════════════════════════════════════════════════════
--  VISTAS (CREATE OR REPLACE es seguro en todas las versiones)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_balance_general AS
SELECT
    COALESCE((SELECT SUM(saldo) FROM cuentas WHERE activo = 1), 0) AS total_activos,
    COALESCE((SELECT SUM(GREATEST(0, monto_total - monto_pagado))
              FROM deudas WHERE estado != 'pagada'), 0)            AS total_deudas,
    COALESCE((SELECT SUM(monto) FROM gastos), 0)                   AS total_gastos,
    COALESCE((SELECT SUM(monto) FROM gastos
              WHERE YEAR(fecha)  = YEAR(CURDATE())
                AND MONTH(fecha) = MONTH(CURDATE())), 0)           AS gastos_mes,
    COALESCE((SELECT SUM(saldo) FROM cuentas WHERE activo = 1), 0) -
    COALESCE((SELECT SUM(GREATEST(0, monto_total - monto_pagado))
              FROM deudas WHERE estado != 'pagada'), 0)            AS patrimonio_neto;

CREATE OR REPLACE VIEW v_gastos_categoria AS
SELECT
    categoria,
    COUNT(*)            AS cantidad,
    SUM(monto)          AS total,
    ROUND(AVG(monto),0) AS promedio,
    MIN(fecha)          AS primera_fecha,
    MAX(fecha)          AS ultima_fecha
FROM gastos
GROUP BY categoria
ORDER BY total DESC;

CREATE OR REPLACE VIEW v_deudas_pendientes AS
SELECT
    id, descripcion, acreedor, tipo,
    monto_total, monto_pagado,
    GREATEST(0, monto_total - monto_pagado)           AS saldo_pendiente,
    CASE WHEN monto_total > 0
         THEN ROUND((monto_pagado / monto_total) * 100, 1)
         ELSE 0 END                                   AS pct_pagado,
    fecha_vencimiento,
    DATEDIFF(fecha_vencimiento, CURDATE())            AS dias_al_vencimiento,
    estado
FROM deudas
WHERE estado NOT IN ('pagada')
ORDER BY FIELD(estado, 'vencida', 'en_curso', 'pendiente'), fecha_vencimiento ASC;

CREATE OR REPLACE VIEW v_recordatorios_mes AS
SELECT
    id, nombre, categoria, dia_mes, monto_estimado, urgencia, notas,
    CASE
        WHEN dia_mes < DAY(CURDATE())       THEN 'pasado'
        WHEN dia_mes = DAY(CURDATE())       THEN 'hoy'
        WHEN dia_mes <= DAY(CURDATE()) + 3  THEN 'proximo'
        ELSE 'futuro'
    END AS estado_dia,
    CASE
        WHEN dia_mes >= DAY(CURDATE())
            THEN dia_mes - DAY(CURDATE())
        ELSE (DAY(LAST_DAY(CURDATE())) - DAY(CURDATE())) + dia_mes
    END AS dias_para_pago
FROM recordatorios
WHERE activo = 1
ORDER BY dia_mes ASC;

-- ══════════════════════════════════════════════════════════════
--  FIN — Schema FINANCE v3.0 aplicado correctamente
-- ══════════════════════════════════════════════════════════════
