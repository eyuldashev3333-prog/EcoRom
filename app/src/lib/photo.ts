// Фото с телефона → JPEG до 1280 px (≈150–300 КБ): бесплатное хранилище ограничено, оригиналы по 5 МБ не нужны.
export async function compressPhoto(file: File, maxSide = 1280, quality = 0.72): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * k)
  canvas.height = Math.round(bmp.height * k)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Foto o‘qilmadi'))), 'image/jpeg', quality))
}
