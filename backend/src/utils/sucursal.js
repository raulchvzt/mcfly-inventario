const ErrorHttp = require('./errorHttp');

// Decide en qué sucursal se opera según el rol (RN5)
function resolverSucursal(usuario, solicitada, { obligatoriaParaDueno = true } = {}) {
  if (usuario.rol === 'dueno') {
    if (solicitada == null && obligatoriaParaDueno) {
      throw new ErrorHttp(400, 'Indica la sucursal (sucursalId)');
    }
    return solicitada ?? null;
  }

  if (usuario.sucursalId == null) {
    throw new ErrorHttp(403, 'Tu usuario no tiene una sucursal asignada');
  }
  if (solicitada != null && solicitada !== usuario.sucursalId) {
    throw new ErrorHttp(403, 'Solo puedes operar en tu sucursal');
  }
  return usuario.sucursalId;
}

module.exports = { resolverSucursal };