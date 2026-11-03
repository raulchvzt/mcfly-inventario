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
  imagen VARBINARY(MAX) NULL,
  imagen_tipo VARCHAR(20) NULL,
  imagen_version INT NOT NULL DEFAULT 0,
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
-- Transferencias (encabezado)
-- ------------------------------------------------------------
CREATE TABLE transferencias (
  id INT IDENTITY(1,1) PRIMARY KEY,
  sucursal_origen_id INT NOT NULL,
  sucursal_destino_id INT NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CONSTRAINT ck_transf_estado CHECK (estado IN ('pendiente', 'confirmada')),
  creada_por INT NOT NULL,
  creada_en DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  confirmada_por INT NULL,
  confirmada_en DATETIME2 NULL,
  notas NVARCHAR(255) NULL,
  CONSTRAINT fk_transf_origen FOREIGN KEY (sucursal_origen_id) REFERENCES sucursales(id),
  CONSTRAINT fk_transf_destino FOREIGN KEY (sucursal_destino_id) REFERENCES sucursales(id),
  CONSTRAINT fk_transf_creada_por FOREIGN KEY (creada_por) REFERENCES usuarios(id),
  CONSTRAINT fk_transf_confirmada_por FOREIGN KEY (confirmada_por) REFERENCES usuarios(id),
  CONSTRAINT ck_transf_sucursales CHECK (sucursal_origen_id <> sucursal_destino_id),
  CONSTRAINT ck_transf_confirmacion CHECK (
    (estado = 'pendiente' AND confirmada_por IS NULL AND confirmada_en IS NULL)
    OR
    (estado = 'confirmada' AND confirmada_por IS NOT NULL AND confirmada_en IS NOT NULL)
  )
);

-- ------------------------------------------------------------
-- Detalle de transferencias (una línea por producto)
-- ------------------------------------------------------------
CREATE TABLE transferencia_detalle (
  id INT IDENTITY(1,1) PRIMARY KEY,
  transferencia_id INT NOT NULL,
  producto_id INT NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL
    CONSTRAINT ck_td_cantidad CHECK (cantidad > 0),
  CONSTRAINT uq_td_transf_producto UNIQUE (transferencia_id, producto_id),
  CONSTRAINT fk_td_transferencia FOREIGN KEY (transferencia_id) REFERENCES transferencias(id),
  CONSTRAINT fk_td_producto FOREIGN KEY (producto_id) REFERENCES productos(id)
);
GO

-- ------------------------------------------------------------
-- Movimientos (libro de inventario: solo se agregan filas)
-- ------------------------------------------------------------
CREATE TABLE movimientos (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  producto_id INT NOT NULL,
  sucursal_id INT NOT NULL,
  tipo VARCHAR(25) NOT NULL
    CONSTRAINT ck_mov_tipo CHECK (tipo IN
      ('entrada', 'consumo', 'merma', 'transferencia_salida', 'transferencia_entrada', 'ajuste')),
  cantidad DECIMAL(10,2) NOT NULL,
  costo_unitario DECIMAL(10,2) NULL
    CONSTRAINT ck_mov_costo CHECK (costo_unitario IS NULL OR costo_unitario >= 0),
  usuario_id INT NOT NULL,
  fecha DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  motivo NVARCHAR(255) NULL,
  compra_detalle_id INT NULL,
  transferencia_id INT NULL,
  CONSTRAINT fk_mov_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
  CONSTRAINT fk_mov_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id),
  CONSTRAINT fk_mov_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_mov_compra_detalle FOREIGN KEY (compra_detalle_id) REFERENCES compra_detalle(id),
  CONSTRAINT fk_mov_transferencia FOREIGN KEY (transferencia_id) REFERENCES transferencias(id),
  -- El signo de la cantidad debe corresponder al tipo
  CONSTRAINT ck_mov_signo CHECK (
    (tipo IN ('entrada', 'transferencia_entrada') AND cantidad > 0)
    OR (tipo IN ('consumo', 'merma', 'transferencia_salida') AND cantidad < 0)
    OR (tipo = 'ajuste' AND cantidad <> 0)
  ),
  -- RN3: merma y ajuste exigen motivo
  CONSTRAINT ck_mov_motivo CHECK (
    tipo NOT IN ('merma', 'ajuste')
    OR (motivo IS NOT NULL AND LEN(LTRIM(RTRIM(motivo))) > 0)
  ),
  -- Cada tipo se vincula con su origen
  CONSTRAINT ck_mov_origen CHECK (
    (tipo = 'entrada' AND compra_detalle_id IS NOT NULL AND transferencia_id IS NULL)
    OR (tipo IN ('transferencia_entrada', 'transferencia_salida')
        AND transferencia_id IS NOT NULL AND compra_detalle_id IS NULL)
    OR (tipo IN ('consumo', 'merma', 'ajuste')
        AND compra_detalle_id IS NULL AND transferencia_id IS NULL)
  )
);

CREATE INDEX ix_mov_stock ON movimientos (sucursal_id, producto_id) INCLUDE (cantidad);
CREATE INDEX ix_mov_fecha ON movimientos (fecha);
GO

-- RN1: los movimientos no se editan ni se borran
CREATE TRIGGER trg_movimientos_inmutables
ON movimientos
INSTEAD OF UPDATE, DELETE
AS
BEGIN
  THROW 50001, 'Los movimientos no se pueden editar ni borrar. Registra un ajuste.', 1;
END;
GO

-- Stock actual por producto y sucursal
CREATE VIEW v_stock AS
SELECT producto_id, sucursal_id, SUM(cantidad) AS stock
FROM movimientos
GROUP BY producto_id, sucursal_id;
GO

-- ------------------------------------------------------------
-- Datos iniciales
-- ------------------------------------------------------------
INSERT INTO sucursales (nombre) VALUES ('McFly Centro'), ('McFly Villa');
GO