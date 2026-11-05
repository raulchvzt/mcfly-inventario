// URL pública de la foto de un producto. "v" cambia cada vez que se sube una nueva
// y evita que el navegador muestre la anterior guardada en caché.
export const urlImagen = (productoId, v) => (v ? `/api/productos/${productoId}/imagen?v=${v}` : null);

// Recorta la foto al centro en cuadrado y la reduce a 256 x 256 (unos 20-40 KB)
export async function reducirImagen(archivo, lado = 256) {
  if (!archivo.type.startsWith('image/')) {
    throw new Error('Elige un archivo de imagen.');
  }
  if (archivo.size > 15 * 1024 * 1024) {
    throw new Error('La imagen es demasiado pesada (máximo 15 MB).');
  }

  let bmp;
  try {
    bmp = await createImageBitmap(archivo);
  } catch {
    throw new Error('No se pudo leer la imagen. Prueba con JPG, PNG o WebP.');
  }

  const corte = Math.min(bmp.width, bmp.height);
  const sx = (bmp.width - corte) / 2;
  const sy = (bmp.height - corte) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, lado, lado);
  ctx.drawImage(bmp, sx, sy, corte, corte, 0, 0, lado, lado);
  bmp.close?.();

  const blob = await new Promise((resolver) => canvas.toBlob(resolver, 'image/webp', 0.82));
  if (!blob || blob.size > 250 * 1024) {
    throw new Error('No se pudo preparar la imagen.');
  }
  return blob;
}