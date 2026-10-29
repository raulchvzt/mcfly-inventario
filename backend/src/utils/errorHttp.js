// Error de negocio con código HTTP (409 stock insuficiente, 403, etc.)
class ErrorHttp extends Error {
  constructor(status, mensaje, extra = {}) {
    super(mensaje);
    this.status = status;
    this.extra = extra;
  }
}

module.exports = ErrorHttp;