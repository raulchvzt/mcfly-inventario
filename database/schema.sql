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
-- Proveedores
-- ------------------------------------------------------------
CREATE TABLE proveedores (
  id INT IDENTITY(1,1) PRIMARY KEY,
  nombre NVARCHAR(120) NOT NULL UNIQUE,
  telefono VARCHAR(30) NULL,
  contacto NVARCHAR(100) NULL,
  notas NVARCHAR(255) NULL,
  activo BIT NOT NULL DEFAULT 1,
  creado_en DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

-- ------------------------------------------------------------
-- Productos
-- ------------------------------------------------------------
CREATE TABLE productos (
  id INT IDENTITY(1,1) PRIMARY KEY,
  nombre NVARCHAR(120) NOT NULL,
  categoria NVARCHAR(50) NOT NULL,
  presentacion NVARCHAR(80) NOT NULL,
  unidad_medida VARCHAR(20) NOT NULL
    CONSTRAINT ck_productos_unidad CHECK (unidad_medida IN ('litro', 'mililitro', 'galon', 'pieza')),
  ultimo_costo DECIMAL(10,2) NOT NULL DEFAULT 0
    CONSTRAINT ck_productos_costo CHECK (ultimo_costo >= 0),
  activo BIT NOT NULL DEFAULT 1,
  creado_en DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT uq_productos_nombre_presentacion UNIQUE (nombre, presentacion)
);

-- ------------------------------------------------------------
-- Producto - Proveedor (relación muchos a muchos)
-- ------------------------------------------------------------
CREATE TABLE producto_proveedor (
  producto_id INT NOT NULL,
  proveedor_id INT NOT NULL,
  ultimo_precio DECIMAL(10,2) NULL
    CONSTRAINT ck_pp_precio CHECK (ultimo_precio IS NULL OR ultimo_precio >= 0),
  actualizado_en DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT pk_producto_proveedor PRIMARY KEY (producto_id, proveedor_id),
  CONSTRAINT fk_pp_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
  CONSTRAINT fk_pp_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
);
GO

-- ------------------------------------------------------------
-- Datos iniciales
-- ------------------------------------------------------------
INSERT INTO sucursales (nombre) VALUES ('McFly Centro'), ('McFly Villa');
GO