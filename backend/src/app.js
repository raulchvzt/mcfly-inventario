const express = require('express');
const cors = require('cors');
const { getPool } = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const proveedoresRoutes = require('./routes/proveedores.routes');
const productosRoutes = require('./routes/productos.routes');
const { noEncontrado, manejarErrores } = require('./middleware/errores');
const usuariosRoutes = require('./routes/usuarios.routes');
const productoRelacionesRoutes = require('./routes/productoRelaciones.routes');
const movimientosRoutes = require('./routes/movimientos.routes');
const stockRoutes = require('./routes/stock.routes');
const comprasRoutes = require('./routes/compras.routes');


const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT COUNT(*) AS sucursales FROM sucursales');
    res.json({ ok: true, sucursales: result.recordset[0].sucursales });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'No se pudo conectar a la base de datos' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/proveedores', proveedoresRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/producto-relaciones', productoRelacionesRoutes);
app.use('/api/movimientos', movimientosRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/compras', comprasRoutes);

// Siempre al final
app.use(noEncontrado);
app.use(manejarErrores);

module.exports = app;