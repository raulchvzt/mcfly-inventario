-- ============================================================
-- McFly Inventario - Esquema de base de datos (SQL Server)
-- ============================================================

CREATE DATABASE mcfly_inventario;
GO

USE mcfly_inventario;
GO

-- ------------------------------------------------------------
-- Sucursales
-- ------------------------------------------------------------
CREATE TABLE sucursales (
  id INT IDENTITY(1,1) PRIMARY KEY,
  nombre NVARCHAR(100) NOT NULL UNIQUE,
  activa BIT NOT NULL DEFAULT 1,
  creada_en DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

-- ------------------------------------------------------------
-- Usuarios
-- ------------------------------------------------------------
CREATE TABLE usuarios (
  id INT IDENTITY(1,1) PRIMARY KEY,
  nombre NVARCHAR(100) NOT NULL,
  email NVARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(20) NOT NULL
    CONSTRAINT ck_usuarios_rol CHECK (rol IN ('dueno', 'encargado', 'empleado')),
  sucursal_id INT NULL,
  activo BIT NOT NULL DEFAULT 1,
  creado_en DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT fk_usuarios_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id)
);

-- ------------------------------------------------------------
-- Datos iniciales
-- ------------------------------------------------------------
INSERT INTO sucursales (nombre) VALUES ('McFly Centro'), ('McFly Villa');
GO