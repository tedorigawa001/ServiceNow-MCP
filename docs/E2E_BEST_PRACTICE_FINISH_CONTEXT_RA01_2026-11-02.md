# RA-01 finish context値層の合成検証

Date: 2026-11-02 / Status: 合成依存限定・証拠発行なし。

対象：[RD-A draft-0.2](BEST_PRACTICE_ABORT_SCOPE_FINISH_CONTEXT_RDA_DESIGN.md)§9。`tests/support/review/synthetic-finish-context-values.ts`と専用試験、梱包負の対照だけを追加した。runtime source・MCP・設定は変更していない。

## 実装・保証範囲

- 発行関数のない証拠brandと、readonly・非実行projection brandを分離。0.2／0.3のstrict key・variantと集合／時刻／期待contextを検査する。
- 同一snapshotの全recordでnode／文字費を共有し、比較では両入力も同予算を共有。元参照の混入を拒否し、opaque参照内部のgetterやtoJSONは呼ばない。
- 独立oracleで文字費262143の受付／262146の拒否と、文字費上限未満でnode上限を超すfixtureを確認。重複した非opaque参照も出現ごとに課金する。
- 不足・余剰項目、不正variant、重複ID／receipt、T_i逆行、U切下げ、期待context不足、別owner／frame等の混入、Proxy／getter／symbol／循環／疎配列を拒否する。
- 返却値は証拠・発行claim・生存証明ではない。発行元／元active receipt／受理済み解析結果／source open／readyとcleanup状態の真正性はRA-02／03までUnknown。E／finish／正常close能力は後工程。

## 検証結果

| 確認 | 結果 |
|---|---|
| RA-01専用合成試験 | 186件成功 |
| 関連11ファイル | 1,267件成功、失敗・保留0 |
| 全体合成回帰（maxWorkers=3） | 246ファイル、11,446件成功、失敗・保留0 |
| `npm run build` | 成功 |
| 対象TSのstrict／noUnused型検査 | 成功 |
| 対象3ファイルのESLint | 成功 |
| `node tests/review/package-http-classification.mjs` | 成功、441配布ファイル。RA-01 path／関数／scope／brandの非同梱と、I/O／clock／worker混入の負の対照を確認 |

全体試験はローカル待受を許す実行条件で行った。実ServiceNow通信は行っていない。製品・個別試験の期限は緩めていない。全体回帰には150秒の外側観測停止を設けたが発動せず成功した。

## 初回失敗・試験修正

1. 未実装module、T_i > Uの受付、未実装比較関数をREDで確認してから実装した。
2. Vitestの表引数を誤って配列分解し、意図したfieldではなく文字単位のkeyを変更していた。strict型検査で検出し、引数を修正、8件の正常field書換え対照を追加して再実行した。初回の見かけ上の成功を最終根拠にしない。
3. node超過fixtureが文字費も超えていたため、短い一意文字列に変更。独立oracleでnode超過だけを隔離した。
4. prototype／疎配列／余剰array keyの3件は当初limit分類だった。shape分類へ分離して再検証した。公開失敗codeは変えない。
5. readonly projectionへの型付けでprivate brand欠落を検出。value-only Symbolを明示し、証拠brandは発行しない構造にした。最終型検査は成功。

## 残課題・非実施

RA-02のprivate補助slot／合成issuerとRA-03の一度限り受理・guard・失効は未実装。通常containerの凍結はopaque参照内部の不変性を証明しない。ownKeys列挙の確保や全体work／allocation上界も未証明で、局所boundsを全体受付の根拠にしない。

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持。証拠発行・実接続・実通信・実機操作・設定変更・本番cap／Permit投入・Pushは行っていない。
