// Envía a manejarErrores cualquier error de una función async
module.exports = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);