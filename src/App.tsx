import { useRef, useState } from 'react'
import JSZip from 'jszip'
import { compressImage, CancelledError, inspectPdf, processPdf } from './lib/compress'
import { formatBytes, isSupported, MAX_BYTES, reduction } from './lib/file'
import type { Item } from './types'

const download = (file: File) => { const url = URL.createObjectURL(file); const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 0) }

export function App() {
  const [items, setItems] = useState<Item[]>([])
  const [jpegQuality, setJpegQuality] = useState(100)
  const [dpi, setDpi] = useState(144)
  const [dragging, setDragging] = useState(false)
  const cancelled = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const update = (id: string, change: Partial<Item>) => setItems(current => current.map(item => item.id === id ? { ...item, ...change } : item))

  const addFiles = async (files: FileList | File[]) => {
    const next: Item[] = []
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID()
      if (!isSupported(file)) next.push({ id, file, status: 'error', progress: 0, message: 'PDF・JPEG・PNG のみ対応しています。' })
      else if (file.size > MAX_BYTES) next.push({ id, file, status: 'error', progress: 0, message: '300MB を超えるファイルは処理できません。' })
      else {
        const item: Item = { id, file, status: 'ready', progress: 0, previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined }
        next.push(item)
        if (file.type === 'application/pdf') inspectPdf(file).then(pages => update(id, { pages })).catch(() => update(id, { status: 'error', message: 'PDF を解析できません。暗号化または破損している可能性があります。' }))
      }
    }
    setItems(current => [...current, ...next])
  }
  const start = async () => {
    cancelled.current = false
    for (const item of items.filter(x => x.status === 'ready')) {
      update(item.id, { status: 'processing', progress: 1, message: undefined })
      try {
        const result = item.file.type === 'application/pdf'
          ? await processPdf(item.file, () => cancelled.current, n => update(item.id, { progress: n }))
          : await compressImage(item.file, jpegQuality, dpi, () => cancelled.current, n => update(item.id, { progress: n }))
        if (cancelled.current) throw new CancelledError()
        const pages = 'pages' in result && typeof result.pages === 'number' ? result.pages : item.pages
        update(item.id, { status: 'done', progress: 100, output: result.file, outputUrl: result.file.type.startsWith('image/') ? URL.createObjectURL(result.file) : undefined, message: result.message, pages })
      } catch (error) { update(item.id, { status: error instanceof CancelledError ? 'cancelled' : 'error', message: error instanceof Error ? error.message : '処理に失敗しました。' }) }
      if (cancelled.current) break
    }
  }
  const zip = async () => { const completed = items.filter(x => x.output); const archive = new JSZip(); completed.forEach(x => archive.file(x.output!.name, x.output!)); download(new File([await archive.generateAsync({ type: 'blob' })], 'compressed-files.zip', { type: 'application/zip' })) }
  const clear = () => { items.forEach(x => { if (x.previewUrl) URL.revokeObjectURL(x.previewUrl); if (x.outputUrl) URL.revokeObjectURL(x.outputUrl) }); setItems([]) }
  const completed = items.filter(x => x.output).length
  return <main>
    <header><div><p className="eyebrow">LOCAL FILE TOOLS</p><h1>File Compressor</h1><p className="subtitle">ファイルはこのブラウザ内でのみ処理され、外部サーバーへ送信されません。</p></div><span className="privacy">ローカル処理</span></header>
    <section className="controls"><div><label>JPEG 圧縮設定</label><div className="number-fields"><label>画質 <input type="number" min="1" max="100" value={jpegQuality} onChange={e => setJpegQuality(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} /><span>%</span></label><label>DPI <input type="number" min="1" max="65535" value={dpi} onChange={e => setDpi(Math.max(1, Math.min(65535, Number(e.target.value) || 1)))} /><span>dpi</span></label></div><p className="setting-note">DPI は JPEG の印刷解像度情報です。画像のピクセル数は変更しません。</p></div><div className="actions"><button className="primary" disabled={!items.some(x => x.status === 'ready')} onClick={start}>圧縮を開始</button><button disabled={!items.some(x => x.status === 'processing')} onClick={() => { cancelled.current = true }}>処理を中止</button></div></section>
    <section className={'dropzone ' + (dragging ? 'dragging' : '')} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files) }} onClick={() => input.current?.click()}><input ref={input} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={e => e.target.files && void addFiles(e.target.files)} /><div className="drop-icon">↓</div><h2>ファイルをドロップ</h2><p>またはクリックして選択　PDF / JPEG / PNG　最大300MB</p></section>
    {items.length > 0 && <section className="files"><div className="file-head"><h2>ファイル</h2><div>{completed > 1 && <button onClick={() => void zip()}>ZIP をダウンロード</button>}<button onClick={clear}>すべて削除</button></div></div>{items.map(item => <article className="file" key={item.id}><div className="thumb">{item.previewUrl ? <img src={item.previewUrl} alt="" /> : <span>PDF</span>}</div><div className="file-info"><div className="name-line"><strong>{item.file.name}</strong><span className={'status ' + item.status}>{item.status === 'ready' ? '準備完了' : item.status === 'processing' ? '処理中' : item.status === 'done' ? '完了' : item.status === 'cancelled' ? '中止' : 'エラー'}</span></div><p>{formatBytes(item.file.size)} {item.pages ? `・ ${item.pages} ページ` : ''}{item.output && <> <span>→</span> {formatBytes(item.output.size)} <b>{reduction(item.file.size, item.output.size)} 削減</b></>}</p>{item.status === 'processing' && <div className="progress"><i style={{ width: `${item.progress}%` }} /></div>}{item.message && <p className="message">{item.message}</p>}</div>{item.output && <button className="download" onClick={() => download(item.output!)}>ダウンロード</button>}</article>)}</section>}
    <section className="notes"><h2>PDF について</h2><p>文字・ベクター・ページ構造を守るため、初版では PDF を解析してページ数を表示し、安全に最適化できない PDF は元のファイルを保持します。署名・暗号化・フォーム付き PDF は圧縮対象外です。</p></section>
  </main>
}
