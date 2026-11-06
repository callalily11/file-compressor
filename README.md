# File Compressor

PDF・JPEG・PNG を**ブラウザ内だけ**で扱う、建築図面・資料向けのファイル圧縮 MVP です。ファイルをサーバーや外部 API に送信しません。

## 現在の機能

- 複数の PDF / JPEG / PNG をドラッグ＆ドロップで追加（1 ファイル 300MB まで）
- JPEG の品質（1〜100%、初期値100%）・DPI（初期値144dpi）を指定する Web Worker 圧縮
- JPEG / PNG のプレビュー、PDF のページ数表示、進捗、キャンセル、個別・ZIP ダウンロード
- 圧縮後の方が大きいときは自動的に元ファイルを保持
- Blob URL をダウンロード後・一覧クリア時に解放

## PDF と PNG の制約

PDF は PDF.js で読み取り・ページ数表示を行い、pdf-lib のオブジェクトストリーム化によって構造を整理します。これは埋め込み画像を再圧縮する本格最適化ではなく、削減効果はPDFによって異なります。文字・ベクター・ページサイズを保つため、ページの画像化はしません。署名・暗号化・フォーム付きPDFは元ファイルを保持します。

PNG も透明・色プロファイルを守るため、現版では非可逆な再エンコードをせず元ファイルを保持します。可逆 PNG エンコーダー（WASM）の導入は、Safari を含む対象ブラウザで透明画像・ICC プロファイル・メモリ使用量を検証してから行います。したがって、PNG / PDF の削減率は保証しません。

JPEG の再エンコードでは EXIF 情報・ICC プロファイルが保持されない場合があります。DPI は JPEG の印刷解像度情報として書き込み、画像のピクセル数は変えません。写真の向き・色は対象端末で確認してください。

## 開発

Node.js 20 以降を用意します。

```bash
npm ci
npm run dev
```

`http://localhost:5173` を開きます。公開用ビルドとユニットテストは次のとおりです。

```bash
npm run build
npm test
```

静的ホスティングへ `dist/` を配置できます。サーバー API、認証、データベースは必要ありません。

### GitHub Pages への公開

このリポジトリでは `main` への push 時に GitHub Actions が `dist/` を GitHub Pages へ公開します。最初の一度だけ GitHub の **Settings → Pages → Build and deployment → Source** で **GitHub Actions** を選んでください。公開URLは `https://callalily11.github.io/file-compressor/` です。

## 検証計画

リリース前に Chrome / Safari（macOS）と Safari（iPhone）で、5MB・30MB・100MB・300MB の JPEG、透過 PNG、建築図面 PDF、写真中心・文字中心の PDF、複数同時処理、キャンセル、出力再表示を確認します。PDF はページ数・文字・ページ寸法・視覚品質を原本と比較します。300MB のファイルは端末のメモリ状況によって失敗することがあります。

## 依存関係

- React / Vite: UI とバンドル
- `browser-image-compression`: JPEG の Worker 対応圧縮（MIT）
- `pdfjs-dist`: PDF 解析・ページ数取得（Apache-2.0）
- `pdf-lib`: 将来の安全な PDF 操作の検証用（MIT）
- `jszip`: まとめてダウンロード（MIT）

依存関係はロックファイルと `npm audit` を使って更新時に確認してください。
