export const MAX_BYTES = 300 * 1024 * 1024
export const isSupported = (file: File) => ['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || /\.(pdf|jpe?g|png)$/i.test(file.name)
export const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`
export const outputName = (name: string) => name.replace(/(\.[^.]+)$/, '_compressed$1')
export const reduction = (from: number, to: number) => `${Math.max(0, ((1 - to / from) * 100)).toFixed(1)}%`
