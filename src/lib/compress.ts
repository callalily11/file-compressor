import imageCompression from 'browser-image-compression'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { outputName } from './file'
import { setJpegDpi } from './jpeg'

GlobalWorkerOptions.workerSrc = pdfWorker

export class CancelledError extends Error { constructor() { super('処理を中止しました') } }
const checkCancelled = (cancelled: () => boolean) => { if (cancelled()) throw new CancelledError() }

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

export async function processPdf(file: File, cancelled: () => boolean, onProgress: (n: number) => void) {
  checkCancelled(cancelled)
  const pages = await inspectPdf(file)
  checkCancelled(cancelled); onProgress(100)
  return { file, pages, message: 'PDF の画像再圧縮はブラウザで安全に実装できないため、文字・ベクター・署名を守る初版では元ファイルを保持しました。' }
}
