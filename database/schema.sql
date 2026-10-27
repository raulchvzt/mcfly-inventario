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
-- Producto - Sucursal (stock mínimo por sucursal)
-- ------------------------------------------------------------
CREATE TABLE producto_sucursal (
  producto_id INT NOT NULL,
  sucursal_id INT NOT NULL,
  stock_minimo DECIMAL(10,2) NOT NULL DEFAULT 0
    CONSTRAINT ck_ps_minimo CHECK (stock_minimo >= 0),
  CONSTRAINT pk_producto_sucursal PRIMARY KEY (producto_id, sucursal_id),
  CONSTRAINT fk_ps_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
  CONSTRAINT fk_ps_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id)
);


-- ------------------------------------------------------------
-- Compras (encabezado)
-- ------------------------------------------------------------
CREATE TABLE compras (
  id INT IDENTITY(1,1) PRIMARY KEY,
  proveedor_id INT NOT NULL,
  sucursal_id INT NOT NULL,
  usuario_id INT NOT NULL,
  fecha DATE NOT NULL DEFAULT CAST(SYSDATETIME() AS DATE),
  forma_pago VARCHAR(20) NOT NULL
    CONSTRAINT ck_compras_pago CHECK (forma_pago IN ('contado', 'credito', 'caja_chica')),
  numero_ticket NVARCHAR(50) NULL,
  notas NVARCHAR(255) NULL,
  creada_en DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT fk_compras_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
  CONSTRAINT fk_compras_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id),
  CONSTRAINT fk_compras_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- ------------------------------------------------------------
-- Detalle de compras (una línea por producto)
-- ------------------------------------------------------------
CREATE TABLE compra_detalle (
  id INT IDENTITY(1,1) PRIMARY KEY,
  compra_id INT NOT NULL,
  producto_id INT NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL
    CONSTRAINT ck_cd_cantidad CHECK (cantidad > 0),
  costo_unitario DECIMAL(10,2) NOT NULL
    CONSTRAINT ck_cd_costo CHECK (costo_unitario >= 0),
  CONSTRAINT uq_cd_compra_producto UNIQUE (compra_id, producto_id),
  CONSTRAINT fk_cd_compra FOREIGN KEY (compra_id) REFERENCES compras(id),
  CONSTRAINT fk_cd_producto FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- ------------------------------------------------------------
-- Datos iniciales
-- ------------------------------------------------------------
INSERT INTO sucursales (nombre) VALUES ('McFly Centro'), ('McFly Villa');
GO