const { z } = require('zod');

const idPositivo = z.coerce.number().int().positive();

const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Fecha inválida');

module.exports = { idPositivo, fechaSchema };