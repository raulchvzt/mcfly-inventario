function noEncontrado(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

// eslint-disable-next-line no-unused-vars
function manejarErrores(err, req, res, next) {
  // Errores de SQL Server
  if (err.number === 2627 || err.number === 2601) {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
  }
  if (err.number === 547) {
    return res.status(409).json({
      error: 'La operación viola una regla de integridad de la base de datos',
    });
  }
  // JSON mal formado en el cuerpo de la petición
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' });
  }

  console.error(err);
  res.status(500).json({ error: 'Error del servidor' });
}

module.exports = { noEncontrado, manejarErrores };