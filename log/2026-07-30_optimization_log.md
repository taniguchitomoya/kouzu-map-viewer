# パフォーマンス改善ログ

> 実施日: 2026-07-30

---

## 背景

kouzufrommap の動作高速化を目的に、コードを静的解析して改善箇所を特定・実装した。  
変更対象ファイルは主に `public/js/app.js` と `public/js/slippy_map.js`。

---

## セッション 1: レンダリング・計算コストの削減

### #1 `Math.pow(2, zoom)` のループ内再計算を排除

**対象:** `slippy_map.js` の `drawDynamicPublicParcels`・`drawSlippyGsiTiles`・`updateDynamicPublicMaps`・`mousemove`・drag ハンドラ、`app.js` の `drawGsiTiles`

**問題:**  
ズーム変数 `zoom` は描画フレーム中は不変なのに、全点・全タイルのループ内で `Math.pow(2, zoom)` を毎回計算していた。  
`drawDynamicPublicParcels` だけで数千筆 × 数十点 = 数万回の冗長な指数計算が走っていた。

**対応:**  
ループに入る前に `const pow2zoom = Math.pow(2, zoom)` として定数化し、ループ内はその変数を参照するように変更。  
`drawSlippyGsiTiles` では外ループに出した `scaleF`・`sWidth`・`sHeight`・`tileScreenSize` も同様に定数化。

---

### #2 `drawDynamicPublicParcels` の全件スキャン改善（bbox カリング）

**対象:** `slippy_map.js` の `drawDynamicPublicParcels` ビューポートフィルタ

**問題:**  
ビューポート外の筆かどうかを `pts[0][0]`（先頭点 1 点）でのみ判定していた。  
密集エリアや大きな筆で誤通過が生じ、無駄な `beginPath`/描画処理が走っていた。

**対応:**  
タイルデータをロードする際に全点を走査して `bbox: { minLon, maxLon, minLat, maxLat }` を付与。  
描画時はこの bbox で厳密なビューポート交差判定を行い、bbox がない場合のみ先頭点フォールバックを使用。

---

### #3 `rebuildDynamicParcels` を差分更新に変更

**対象:** `slippy_map.js` の `updateDynamicPublicMaps` / `rebuildDynamicParcels`

**問題:**  
タイルが 1 枚でも増減するたびに配列を空にしてから全タイルを `push` で再結合していた。

**対応:**
- 新規タイルロード時は `push(...tileData)` で差分追加のみ実施
- タイル破棄時は `Set` で差分削除（`.filter()`）を実施
- `rebuildDynamicParcels()` は LOD 切替など明示的なリセット時のみ呼ぶように変更

---

### #4 `mousemove` のホバー PIP 探索に bbox フィルタを追加

**対象:** `slippy_map.js` の `mousemove` イベントハンドラ

**問題:**  
マウスが動くたびに全件逐次スキャンし、先頭点のみの粗フィルタしかなかった。  
密集エリアでは多数の筆が粗フィルタを通過してしまい、全点 PIP テストが走っていた。

**対応:**  
タイルロード時に付与した `bbox` を使ってマウス座標が bbox 外の筆をスキップ。bbox がない場合は先頭点フォールバック。

---

### #5 `onCityChange` の HTTP ディレクトリリスティング廃止

**対象:** `app.js` の `onCityChange` / `public/data/local_govs.json`

**問題:**  
市区町村を選択するたびに `./data/` の HTML ページ全体をフェッチし、`DOMParser` で `<a>` タグをスキャンして ZIP ファイル名を探索していた。

**対応:**  
`local_govs.json` の各 city エントリに `"zips": ["ファイル名.zip"]` フィールドを追加（27 市区町村）。  
`onCityChange` は `cityInfo.zips` を直接参照して URL を構築。フォールバックとして旧来の方式も残す。

---

### #6 `tileCache`（`app.js`）に LRU 上限を追加

**対象:** `app.js` の `tileCache`

**問題:**  
GSI タイル画像キャッシュにサイズ制限がなく、長時間利用で `Image` オブジェクトが無限に蓄積。

**対応:**  
`tileCachePut()` 関数を追加し、上限 150 件の LRU キャッシュとして管理。

---

### #7 `processMinJson` の `proj4` 変換器キャッシュ＋ループ統合

**対象:** `app.js` の `processMinJson`

**問題:**  
全域表示時に数万筆 × 数十点の各点で `proj4("EPSG:4326", "EPSG:3857", pt)` を呼び出し（文字列ルックアップが毎回発生）、かつ座標変換ループと bbox/centroid 計算ループが別々だった。

**対応:**  
`DOMContentLoaded` 後に `.forward` 変換関数をキャッシュ（`_wgs84ToWm`）し、  
座標変換・bbox・centroid の計算を 1 ループに統合して点あたりの走査を 2 回 → 1 回に削減。

---

### #8 `drawGrid` の Canvas API 呼び出し回数を削減

**対象:** `app.js` の `drawGrid`

**問題:**  
グリッド線 1 本ごとに `beginPath()` → `stroke()` を呼んでいた（100 本 = 200 回の Canvas API 呼び出し）。

**対応:**  
全線を 1 つの `beginPath()` にまとめ、最後に `stroke()` を 1 回だけ呼ぶよう変更。

---

### #9 zip.js の WebWorker を環境に応じて有効化

**対象:** `app.js` の zip.js 設定

**問題:**  
`useWebWorkers: false` でメインスレッドで ZIP 展開していたため、大きな ZIP 展開中に UI が固まっていた。

**対応:**  
`typeof Worker !== 'undefined'` で対応確認し、使える場合は `useWebWorkers: true` に切り替え。非対応環境では自動フォールバック。

---

## セッション 2: 外部リクエスト過剰の修正

### #10 逆ジオコーダー結果の座標キャッシュ

**対象:** `slippy_map.js` の `updateArbitrarySidebar`

**問題:**  
`updateArbitrarySidebar` が呼ばれるたびに `mreversegeocoder.gsi.go.jp` への外部 API リクエストが必ず発生。  
座標が変わっていなくても（ズーム操作など）毎回叩かれていた。

**対応:**  
`slippyMapState.rgCache = { lat, lon, muniCd, lv01Nm }` に前回フェッチ座標と結果を保存。  
現在座標と前回座標の差が `0.002°`（約 200m）未満なら API をスキップ。

---

### #11 `index_${muniCd}.json` の LRU マルチキャッシュ（5件）

**対象:** `slippy_map.js` の `updateArbitrarySidebar` / 新規 `indexCache` Map

**問題:**  
直前の 1 件 (`lastMuniCd`) のみキャッシュ。A 区 → B 区 → A 区 と移動すると A 区の index（最大 ~1MB）が再フェッチされていた。  
また `null`（データなし市区町村）のキャッシュがなく、通過するたびに 404 リクエストが走っていた。

**対応:**  
`indexCache` という `Map` で最大 5 件の LRU キャッシュを管理。  
`undefined`（未取得）と `null`（取得済みだがデータなし）を区別し、`null` もキャッシュヒットとして扱う。

---

### #12 `updateDynamicPublicMaps` にデバウンス追加

**対象:** `slippy_map.js` の `scheduleDynamicPublicMapsUpdate`（新規関数）

**問題:**  
`updateArbitrarySidebar` 末尾から `updateDynamicPublicMaps()` を直接呼び出し、`dynamicPublicLoading` フラグ 1 本のみが多重実行ガードだった。  
ロード完了直後に別タイルが必要になった場合、タイルフェッチが短時間に集中した。

**対応:**  
300ms デバウンスラッパー `scheduleDynamicPublicMapsUpdate()` を追加し、連続した呼び出しを最後の 1 回に集約。

---

### #13 筆クリック時の XML 展開リクエスト重複防止（in-flight Promise キャッシュ）

**対象:** `slippy_map.js` の `click` ハンドラ内 `publicXmlDocCache`

**問題:**  
fetch 完了前に同じ筆を連続クリックすると、`publicXmlDocCache.has()` が `false` のまま複数の `extractXmlFromUrl` が並行して走り、同一 ZIP を重複展開していた。

**対応:**  
fetch 開始時点で **Promise 自体を `publicXmlDocCache` に登録**。  
後続のクリックは `has()` が `true` になるためキャッシュ分岐に入り、Promise を待ち合わせる。  
fetch 完了後は XMLDocument でキャッシュを上書きし、以降のアクセスは DOM オブジェクトを直接返す。

---

## 変更ファイル一覧

| ファイル | 対応番号 |
|---|---|
| `public/js/slippy_map.js` | #1 #2 #3 #4 #10 #11 #12 #13 |
| `public/js/app.js` | #1 #5 #6 #7 #8 #9 |
| `public/data/local_govs.json` | #5（ZIP ファイル名フィールド追加） |
