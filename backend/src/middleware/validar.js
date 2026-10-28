// Valida params, query y body con esquemas de zod.
// Los datos limpios quedan en req.datos.{params, query, body}
function validar(esquemas) {
  return (req, res, next) => {
    const datos = {};
    const detalles = [];

    for (const fuente of ['params', 'query', 'body']) {
      if (!esquemas[fuente]) continue;
      const resultado = esquemas[fuente].safeParse(req[fuente] ?? {});
      if (resultado.success) {
        datos[fuente] = resultado.data;
      } else {
        for (const issue of resultado.error.issues) {
          detalles.push({ campo: issue.path.join('.'), mensaje: issue.message });
        }
      }
    }

    if (detalles.length > 0) {
      return res.status(400).json({ error: 'Datos inválidos', detalles });
    }

    req.datos = datos;
    next();
  };
}

module.exports = { validar };