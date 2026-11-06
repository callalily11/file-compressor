import imageCompression from 'browser-image-compression'
import { PDFDocument } from 'pdf-lib'
import PDFName from 'pdf-lib/es/core/objects/PDFName'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { outputName } from './file'
import { setJpegDpi } from './jpeg'
import { hasPdfSignatureMarker } from './pdf'
import { createQpdfImageStreams } from '@lipoe/browser-qpdf'
import { canDecode, toImageBitmap } from '@lipoe/browser-qpdf/codecs'

GlobalWorkerOptions.workerSrc = pdfWorker

export class CancelledError extends Error { constructor() { super('処理を中止しました') } }
const checkCancelled = (cancelled: () => boolean) => { if (cancelled()) throw new CancelledError() }
type MutablePdfImage = { contents: Uint8Array; dict: { entries: () => [unknown, unknown][]; set: (key: PDFName, value: PDFName) => void; delete: (key: PDFName) => boolean } }
const dictionaryEntry = (image: MutablePdfImage, name: string) => image.dict.entries().find(([key]) => String(key) === `/${name}`)?.[1]
const isRgbPdfImage = (image: MutablePdfImage) => String(dictionaryEntry(image, 'Subtype')) === '/Image' && String(dictionaryEntry(image, 'ColorSpace')) === '/DeviceRGB' && !dictionaryEntry(image, 'SMask') && !dictionaryEntry(image, 'DecodeParms') && Number((dictionaryEntry(image, 'BitsPerComponent') as { asNumber?: () => number } | undefined)?.asNumber?.()) === 8
const isEligiblePdfImage = (image: MutablePdfImage) => isRgbPdfImage(image) && String(dictionaryEntry(image, 'Filter')).includes('/DCTDecode')
const isFlateRgbPdfImage = (image: MutablePdfImage) => isRgbPdfImage(image) && String(dictionaryEntry(image, 'Filter')) === '/FlateDecode'
const dimension = (image: MutablePdfImage, name: string) => Number((dictionaryEntry(image, name) as { asNumber?: () => number } | undefined)?.asNumber?.())

async function encodeRgbPdfImage(image: MutablePdfImage, quality: number) {
  const compressed = image.contents
  const buffer = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer
  const decompressed = new Uint8Array(await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())
  const width = dimension(image, 'Width'); const height = dimension(image, 'Height')
  if (!width || !height || decompressed.byteLength !== width * height * 3) return undefined
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d'); if (!context) return undefined
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let source = 0, target = 0; source < decompressed.length; source += 3, target += 4) { rgba[target] = decompressed[source]; rgba[target + 1] = decompressed[source + 1]; rgba[target + 2] = decompressed[source + 2]; rgba[target + 3] = 255 }
  context.putImageData(new ImageData(rgba, width, height), 0, 0)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', Math.max(1, Math.min(100, quality)) / 100))
  return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined
}

async function recompressEmbeddedPdfImages(document: PDFDocument, quality: number, cancelled: () => boolean, onProgress: (n: number) => void) {
  const context = document.context as unknown as { indirectObjects: Map<unknown, unknown> }
  const images = Array.from(context.indirectObjects.values()).filter((value): value is MutablePdfImage => {
    const image = value as Partial<MutablePdfImage>
    return image.contents instanceof Uint8Array && typeof image.dict?.entries === 'function' && (isEligiblePdfImage(image as MutablePdfImage) || isFlateRgbPdfImage(image as MutablePdfImage))
  })
  let changed = 0
  for (let index = 0; index < images.length; index += 1) {
    checkCancelled(cancelled)
    const image = images[index]
    const source = image.contents
    const isFlate = isFlateRgbPdfImage(image)
    const candidate = isFlate
      ? await encodeRgbPdfImage(image, quality)
      : new Uint8Array(await (await imageCompression(new File([source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer], 'embedded-image.jpg', { type: 'image/jpeg' }), { maxSizeMB: Math.max(0.01, source.byteLength / 1024 / 1024), initialQuality: Math.max(1, Math.min(100, quality)) / 100, useWebWorker: true, fileType: 'image/jpeg' })).arrayBuffer())
    if (candidate && candidate.byteLength < source.byteLength) {
      image.contents = candidate
      if (isFlate) { image.dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode')); image.dict.delete(PDFName.of('DecodeParms')) }
      changed += 1
    }
    onProgress(15 + Math.round(((index + 1) / Math.max(images.length, 1)) * 65))
  }
  return { changed, total: images.length }
}

async function optimizePdfImagesWithQpdf(source: Uint8Array, quality: number, cancelled: () => boolean, onProgress: (n: number) => void) {
  if (source.byteLength > 256 * 1024 * 1024) return { bytes: undefined, changed: 0, total: 0, reason: 'PDF画像最適化は256MBまで対応しています。' }
  const qpdf = await createQpdfImageStreams({ locateFile: name => name.endsWith('.wasm') ? `${import.meta.env.BASE_URL}qpdf-image-stream.wasm` : name })
  const loaded = qpdf.loadPdf(source)
  if (!loaded.ok) return { bytes: undefined, changed: 0, total: 0, reason: 'PDFを安全に読み取れませんでした。' }
  const pdf = loaded.value
  try {
    const listed = pdf.getImages({ recursive: true })
    if (!listed.ok) return { bytes: undefined, changed: 0, total: 0, reason: 'PDF内画像を取得できませんでした。' }
    const candidates = listed.value.filter(info => !info.masks.isStencilMask && info.masks.softMaskOf.length === 0 && canDecode(info).ok)
    let changed = 0
    for (let index = 0; index < candidates.length; index += 1) {
      checkCancelled(cancelled)
      const info = candidates[index]
      const read = pdf.readImage(info.objId, info.generation)
      if (!read.ok) continue
      const bitmapResult = await toImageBitmap(read.value, info)
      if (!bitmapResult.ok) continue
      const bitmap = bitmapResult.value
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
      const context = canvas.getContext('2d'); if (!context) { bitmap.close(); continue }
      context.drawImage(bitmap, 0, 0); bitmap.close()
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', Math.max(1, Math.min(100, quality)) / 100))
      if (!blob || blob.size >= info.streamLength) continue
      const replaced = pdf.replaceImageStream(info.objId, info.generation, new Uint8Array(await blob.arrayBuffer()), { width: canvas.width, height: canvas.height, bitsPerComponent: 8, colorSpace: 'DeviceRGB', filter: 'DCTDecode' })
      if (replaced.ok) changed += 1
      onProgress(15 + Math.round(((index + 1) / Math.max(candidates.length, 1)) * 65))
    }
    const output = pdf.writePdf()
    return output.ok ? { bytes: output.value, changed, total: candidates.length, reason: undefined } : { bytes: undefined, changed, total: candidates.length, reason: 'PDFを書き出せませんでした。' }
  } finally { pdf.close() }
}

export async function inspectPdf(file: File) {
  const bytes = await file.arrayBuffer()
  const pdf = await getDocument({ data: bytes }).promise
  const pages = pdf.numPages
  await pdf.cleanup()
  return pages
}

export async function compressImage(file: File, quality: number, dpi: number, cancelled: () => boolean, onProgress: (n: number) => void) {
  checkCancelled(cancelled)
  if (file.type === 'image/png') {
    // Canvas re-encoding can lose color-profile metadata. Preserve the original until
    // a verified lossless PNG encoder is introduced.
    onProgress(100)
    return { file, message: 'PNG は透明・色情報を保護するため、今回は元ファイルを保持しました。' }
  }
  const clampedQuality = Math.max(1, Math.min(100, quality)) / 100
  const compressed = await imageCompression(file, {
    maxSizeMB: Math.max(0.1, file.size / 1024 / 1024),
    initialQuality: clampedQuality,
    useWebWorker: true,
    fileType: 'image/jpeg',
    onProgress,
  })
  checkCancelled(cancelled)
  const bytes = setJpegDpi(new Uint8Array(await compressed.arrayBuffer()), dpi)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const result = new File([buffer], outputName(file.name), { type: 'image/jpeg', lastModified: Date.now() })
  return result.size < file.size ? { file: result } : { file, message: '圧縮後の容量が増えるため、元ファイルを保持しました。' }
}

export async function processPdf(file: File, quality: number, cancelled: () => boolean, onProgress: (n: number) => void) {
  checkCancelled(cancelled)
  const pages = await inspectPdf(file)
  const source = new Uint8Array(await file.arrayBuffer())
  checkCancelled(cancelled)
  if (hasPdfSignatureMarker(source)) return { file, pages, message: '署名付きPDFのため、署名を保護して元ファイルを保持しました。' }
  try {
    const qpdfResult = await optimizePdfImagesWithQpdf(source, quality, cancelled, onProgress)
    const document = await PDFDocument.load(qpdfResult.bytes ?? source, { updateMetadata: false })
    if (document.getForm().getFields().length > 0) return { file, pages, message: 'フォーム付きPDFのため、入力内容を保護して元ファイルを保持しました。' }
    const imageResult = qpdfResult.bytes ? { changed: qpdfResult.changed, total: qpdfResult.total } : await recompressEmbeddedPdfImages(document, quality, cancelled, onProgress)
    checkCancelled(cancelled); onProgress(85)
    const optimized = qpdfResult.bytes ?? await document.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false, objectsPerTick: 50 })
    checkCancelled(cancelled)
    const buffer = optimized.buffer.slice(optimized.byteOffset, optimized.byteOffset + optimized.byteLength) as ArrayBuffer
    const result = new File([buffer], outputName(file.name), { type: 'application/pdf', lastModified: Date.now() })
    const verified = await getDocument({ data: await result.arrayBuffer() }).promise
    const valid = verified.numPages === pages
    await verified.cleanup()
    onProgress(100)
    if (!valid) return { file, pages, message: '軽量化後のPDFを検証できないため、元ファイルを保持しました。' }
    return result.size < file.size
      ? { file: result, pages, message: `PDF内のJPEG画像 ${imageResult.changed}/${imageResult.total} 件を再圧縮し、構造を整理しました。文字・ベクター・ページは画像化していません。` }
      : { file, pages, message: imageResult.total === 0 ? '再圧縮できるJPEG画像が見つからず、軽量化の効果がなかったため元ファイルを保持しました。' : '軽量化後の容量が増えたため、元ファイルを保持しました。' }
  } catch {
    return { file, pages, message: '暗号化または安全に再保存できないPDFのため、元ファイルを保持しました。' }
  }
}
