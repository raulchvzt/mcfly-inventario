const router = require('express').Router();
const { z } = require('zod');
const { sql, getPool } = require('../config/db');
const { autenticar, permitirRoles } = require('../middleware/auth');
const { validar } = require('../middleware/validar');
const asyncHandler = require('../middleware/asyncHandler');

const id = z.coerce.number().int().positive();
const prodSchema = z.object({ id });
const prodProvSchema = z.object({ id, proveedorId: id });
const prodSucSchema = z.object({ id, sucursalId: id });

const precioSchema = z.object({
  ultimoPrecio: z.number().min(0).max(99999999.99).nullable().default(null),
});
const minimoSchema = z.object({
  stockMinimo: z.number().min(0).max(99999999.99),
});

async function existe(pool, consulta, valor) {
  const r = await pool.request().input('v', sql.Int, valor).query(consulta);
  return r.recordset.length > 0;
}
const productoExiste = (pool, v) => existe(pool, 'SELECT id FROM productos WHERE id = @v', v);
const proveedorExiste = (pool, v) => existe(pool, 'SELECT id FROM proveedores WHERE id = @v', v);
const sucursalExiste = (pool, v) => existe(pool, 'SELECT id FROM sucursales WHERE id = @v', v);

// ---------- Proveedores de un producto ----------

router.get(
  '/:id/proveedores',
  autenticar,
  permitirRoles('dueno', 'encargado'),
  validar({ params: prodSchema }),
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const { id: productoId } = req.datos.params;

    if (!(await productoExiste(pool, productoId))) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const result = await pool
      .request()
      .input('id', sql.Int, productoId)
      .query(
        `SELECT v.id, v.nombre, v.activo,
                pp.ultimo_precio AS ultimoPrecio, pp.actualizado_en AS actualizadoEn
         FROM producto_proveedor pp
         JOIN proveedores v ON v.id = pp.proveedor_id
         WHERE pp.producto_id = @id
         ORDER BY v.nombre`
      );
    res.json(result.recordset);
  })
);

// Vincular o actualizar el precio (solo dueño)
router.put(
  '/:id/proveedores/:proveedorId',
  autenticar,
  permitirRoles('dueno'),
  validar({ params: prodProvSchema, body: precioSchema }),
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const { id: productoId, proveedorId } = req.datos.params;
    const { ultimoPrecio } = req.datos.body;

    if (!(await productoExiste(pool, productoId))) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    if (!(await proveedorExiste(pool, proveedorId))) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    await pool
      .request()
      .input('p', sql.Int, productoId)
      .input('v', sql.Int, proveedorId)
      .input('precio', sql.Decimal(10, 2), ultimoPrecio)
      .query(
        `UPDATE producto_proveedor
         SET ultimo_precio = @precio, actualizado_en = SYSDATETIME()
         WHERE producto_id = @p AND proveedor_id = @v;
         IF @@ROWCOUNT = 0
           INSERT INTO producto_proveedor (producto_id, proveedor_id, ultimo_precio)
           VALUES (@p, @v, @precio);`
      );

    res.json({ productoId, proveedorId, ultimoPrecio });
  })
);

// Quitar el vínculo (solo dueño)
router.delete(
  '/:id/proveedores/:proveedorId',
  autenticar,
  permitirRoles('dueno'),
  validar({ params: prodProvSchema }),
  asyncHandler(async (req, res) => {
    const { id: productoId, proveedorId } = req.datos.params;
    const result = await (await getPool())
      .request()
      .input('p', sql.Int, productoId)
      .input('v', sql.Int, proveedorId)
      .query('DELETE FROM producto_proveedor WHERE producto_id = @p AND proveedor_id = @v');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Ese proveedor no está vinculado al producto' });
    }
    res.status(204).end();
  })
);

// ---------- Stock mínimo por sucursal ----------

router.get(
  '/:id/stock-minimo',
  autenticar,
  permitirRoles('dueno', 'encargado'),
  validar({ params: prodSchema }),
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const { id: productoId } = req.datos.params;

    if (!(await productoExiste(pool, productoId))) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const request = pool.request().input('id', sql.Int, productoId);
    let filtro = '';
    if (req.usuario.rol === 'encargado') {
      filtro = 'AND s.id = @sucursal'; // el encargado solo ve su sucursal
      request.input('sucursal', sql.Int, req.usuario.sucursalId);
    }

    const result = await request.query(
      `SELECT s.id AS sucursalId, s.nombre AS sucursal,
              ISNULL(ps.stock_minimo, 0) AS stockMinimo
       FROM sucursales s
       LEFT JOIN producto_sucursal ps ON ps.sucursal_id = s.id AND ps.producto_id = @id
       WHERE s.activa = 1 ${filtro}
       ORDER BY s.nombre`
    );
    res.json(result.recordset);
  })
);

// Definir el mínimo (solo dueño)
router.put(
  '/:id/stock-minimo/:sucursalId',
  autenticar,
  permitirRoles('dueno'),
  validar({ params: prodSucSchema, body: minimoSchema }),
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const { id: productoId, sucursalId } = req.datos.params;
    const { stockMinimo } = req.datos.body;

    if (!(await productoExiste(pool, productoId))) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    if (!(await sucursalExiste(pool, sucursalId))) {
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }

    await pool
      .request()
      .input('p', sql.Int, productoId)
      .input('s', sql.Int, sucursalId)
      .input('minimo', sql.Decimal(10, 2), stockMinimo)
      .query(
        `UPDATE producto_sucursal SET stock_minimo = @minimo
         WHERE producto_id = @p AND sucursal_id = @s;
         IF @@ROWCOUNT = 0
           INSERT INTO producto_sucursal (producto_id, sucursal_id, stock_minimo)
           VALUES (@p, @s, @minimo);`
      );

    res.json({ productoId, sucursalId, stockMinimo });
  })
);

module.exports = router;