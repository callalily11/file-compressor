export type Status = 'ready' | 'processing' | 'done' | 'error' | 'cancelled'
export type Item = {
  id: string; file: File; status: Status; progress: number; message?: string
  previewUrl?: string; pages?: number; output?: File; outputUrl?: string
}
