# XLSX巨大行番号・疎な行の回帰検証（2026-10-22）

## 対象と原因

`readXlsxSheet` → `parseExcelImportRows` → Excel Import Set取り込みの経路。
小さいZIP/XMLでも、`row.r` または `c.r` の行番号を巨大にできた。
既存の500行制限は「値のある行の個数」を検査するが、後段は2から最大行番号まで同期ループしていた。
安全整数を超える行番号では `rowNumber++` が進まなくなり、桁数の多いセル参照ではInfinityにもなり、イベントループを占有し続ける。

## 境界での修正

- `src/utils/xlsx.ts`：行番号を1〜1,048,576の安全整数に限定する。明示row属性、省略時の推定番号、セル参照の番号をそれぞれ検証する。自己終了タグ・空セルでも検証を省略しない。
- row属性は数字列だけを受け入れる。指数・16進・負数・小数・空文字列は拒否し、XML文字参照は既存の復号後に同じ検査を適用する。
- `src/tools/integration.ts`：最大行番号をループ上限にせず、値のある行のMapを数値順にソートして走査する。500データ行/50列の既存上限を維持し、空白のギャップは走査しない。
- ヘッダーは引き続き1行目。疎な行の順序・数式拒否時の実際の行番号・数式風文字列の無害化・日付等の既存変換は維持する。

行番号による処理増幅を除去する変更であり、ZIP/XMLの既存受信量・展開量上限は変更しない。
範囲外の行座標は切詰めず `VALIDATION_ERROR` で停止する。

## 回帰テスト

`tests/utils/xlsx.test.ts` と `tests/fixtures/xlsx-import-boundary.mjs`：

- 修正前RED：行番号100000000000000000000を持つ小さなworkbookが、拒否されず受理されたためテスト失敗。
- 巨大row属性、通常のrow内の巨大セル参照、安全整数超過、Infinityになる400桁、0、負数、小数、指数、16進、空文字列、数値文字参照経由を拒否。
- 上限行の後で推定した次のrow、空row、空セルの範囲外座標も拒否。
- 最終行1,048,576を含み、XML内の順序が逆でも取り込み結果は数値順。巨大dimensionメタデータはループ上限にならない。
- 大きな空白の後の数式を、実際の行番号付きで拒否。
- 500データ行は受理、501データ行は拒否。行位置と行個数を混同しない。
- 元の非進行ループにつながる2入力を子プロセスでpublic importerへ渡し、固定の検証エラーで終了することを確認。親側5秒の強制タイムアウトにより、将来ループが再発してもテスト本体を永久停止させない。
- `tests/tools/integration.test.ts` の既存の空白行後データ、数式・ヘッダー・日付・Import Set呼出し等も再実行。

## 実行と結果

```text
bdo npm run build
bdo npx vitest run tests/utils/xlsx.test.ts tests/tools/integration.test.ts
bdo npx eslint src/utils/xlsx.ts src/tools/integration.ts tests/utils/xlsx.test.ts
bdo git diff --check
```

build成功、対象2ファイル107テスト成功、ESLint error 0（既存any警告10件）、diffチェック成功。
別のread-onlyレビューで、今回の範囲に具体的な残存バイパス・互換性退行は見つからなかった。

`bdo npm test`：3,168成功・3失敗、122ファイル中121成功（子プロセス2テスト追加前の実行）。
失敗は前回と同じ `tests/review/worker-supervisor.test.ts` の3件で、固定fixtureの運用者設定期限（2026-10-20）と現在時刻の不整合。
前回の原因確認は [trend/HTTP検証記録](SECURITY_TREND_HTTP_REGRESSION_2026-10-22.md) を参照する。
当該reviewソース・fixtureには変更を加えておらず、全体greenとは扱わない。

追記（2026-10-22、レビュー）：上記3失敗は、後続の `5d66569`（`test(review): keep supervisor operator assertions relative to wall clock`）でテスト側のassertion期間を実行時刻基準へ変更して解消した。fixture本体と本番の期限検証は変更していない。本修正（`4cf6e8a`）を含むHEADで `bdo npm test` を再実行し、**122ファイル・3,173テストすべて成功**を確認した。対象2ファイル（xlsx/integration）も107テスト成功。

## 範囲外

ServiceNow/PDIへの操作、設定変更、外部通信は検証対象外。すべて合成workbook・ローカル処理で確認した。
既存の完了済みスキャン・指摘・証拠・履歴は変更しない。
