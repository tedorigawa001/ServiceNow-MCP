# AU-QRY-001 BR限定：合成検証記録

Date: 2026-10-24 / Source baseline: `3cbde44` / 種別: ローカル合成・回帰検証。PDI E2Eではない。

## 1. 変更と境界

[設計・利用方法](BEST_PRACTICE_QUERY_LIKE_BR.md)のBR限定検出を追加した。既定3規則を変えず、QRY-001の明示指定、BR候補選択、workerの解析、1件/集約JSON、MCP入力列挙を接続する。既存のリリース証拠/認証/件数/受信量/全体60秒を変更しない。QRY要求時だけruleset bp3-0.5、旧規則のみは0.4を維持する。

実コード実行ではなくAST解析。fetch境界は合成レスポンス、workerと解析・集約は実経路。資格情報は合成値で、コード本文/canaryを出力しないことを検査した。実ServiceNow/PDI、実OAuth token発行、UI、実機設定へ接続していない。

## 2. テスト駆動の経過

1. 新規`query-like.test.ts`のBR正例は、未対応により指摘0件で失敗。受信側と3引数LIKEの判定追加後に成功。
2. addQuery上書き後を候補としてしまう反例の失敗を確認し、書換え/escape等を保守的に扱ってから候補を確定する処理を追加。recordのconstructor引渡し・constructor自身の引渡しも、それぞれ失敗→修正→関連再実行で確認。
3. `target-selection.test.ts`の明示QRY指定は入力拒否で失敗。schema/BR選択/versionsを接続した後、合成HTTP→worker→0.3 JSONの正例が成功。
4. 未解決受信側の集約は、旧finalizerがanalysis_complete=trueにしてstrict検証で失敗した。未解決時にfalseへ保つようfinalizer/契約を揃えた。

## 3. 回帰の観点

| 対象 | 確認する内容 |
|---|---|
| 受信側 | GlideRecord/Secureのnew、単純alias、BRラッパー、同名ローカルconstructor/object、引数/条件分岐/関数境界の未解決 |
| 改変/escape | method書換え、computed書換え、nested再代入、eval、spread、record/container/constructorの引渡し、property定義 |
| 構文 | 3引数＋第2引数の文字列LIKE、他arity、CONTAINS、encoded query、コメント/文字列、動的operator/method |
| 対象制限 | Client Scriptへ不適用、SI/REST/server scriptの同規則はunsupported。実装済み扱いにしない |
| 契約 | QRY要求と0.5の整合、旧規則だけの0.4、混在資産の適用規則、strict JSON Schema同期、未解決時partial/incomplete |
| 上限/非露出 | 101指摘の拒否、既存の取得/期限/取消/レスポンス上限、source/token canary非露出 |
| 互換性 | 旧payload/aggregate例、既定3規則、固定評価セット/採点器未変更 |
| 梱包 | 本番依存のみの直接workerおよびcompiled serverのMCP dispatchでQRY候補と非露出を確認 |

## 4. 初回失敗と切り分け

- 全並列の初回`bdo npm test`は123ファイル中8ファイル失敗、3,233成功/13失敗/26スキップ。1 suiteの初期コンパイルtimeoutを含む。今回有効化したQRY-001を未対応入力としていた旧テスト2件と、時間依存の失敗を分離した。
- 旧拒否テスト2件だけを、引き続き未対応のQRY-002を使う形へ更新した。固定評価データのラベル・期待値は変更していない。
- timing失敗はsoft-deadline、R2のapproval/run/loopback/entry、評価CLIに発生。並列数を2に制限して再確認し、製品deadline・テストtimeout・R2実装は緩めていない。初回を全体成功と報告しない。
- 途中の低並列再実行は3,274成功/1失敗。追加途中のconstructor引渡し反例を、修正前のmoduleを読み込んだworkerでも実行したため失敗した。完成状態の関連12ファイル319件は成功。以降はコードを固定して全体を再実行し、途中結果を最終全体成功として扱わない。
- 初回梱包は通常npm cacheへの書込みEPERMで停止。npmのエラーメッセージから所有権原因を確定せず、cacheのchown/削除や設定変更はしなかった。必要なcache利用を許可した再実行では361ファイルの本番依存のみの展開/直接worker/MCP smokeが成功した。後続の最終境界修正についても再検証結果を残す。

## 5. 最終検証結果

コード固定後の結果（途中の失敗を除去して集計した値ではなく、別の再実行）：

| 検証 | 結果 |
|---|---|
| `bdo npm test -- --maxWorkers=2` | 123ファイル・3,275件成功、失敗/スキップ0。237.91秒 |
| 最終の関連12ファイル（query/selection/adapter/schema/旧解析・評価等） | 319件成功。QRY専用は38件、MCP選択の新規3件を含む |
| `bdo npm run type-check` | 成功 |
| `bdo npm run test:pack`（必要cache利用許可の再実行） | 最終ビルド成功、361ファイル。本番依存のみの直接worker/MCPでQRY-001を確認 |
| 変更TSと梱包fixtureのESLint | issueなし |
| `bdo git diff --check`、新規2文書の相対リンク/空白検査 | 成功（相対リンク3件） |
| 固定評価データ/採点器の差分検査 | 差分なし。評価回帰は全体テストに含む |
| MA-02チェックリスト | I01〜I05回答済み、E/A/T20項目未チェックのまま |

並列数制限は検証実行時だけの指定で、製品設定や保存済みテスト設定の変更ではない。初回の並列timing失敗を解決済みの製品不具合として扱わず、最終の低並列全体成功と区別する。全件成功は独立した品質承認を意味しない。

## 6. 保持する未確認事項

合成テスト件数は独立品質/適合率/再現率の主張ではない。受信側の実行時型、全ての動的変更や関数間経路、フィールド型、queryの実機動作、Australia根拠の人による承認は未確認。型の推定が未解決なら制限を残し、0件を安全としない。

VM・監視環境の調査は保留、MA-02のUnknown・全体受付無効・telemetry保留は不変。本番cap/完成parts/permit・通常strict差替えへ進めない。PDI書込み/読取り実機操作、設定変更、鍵承認、担当者連絡、Pushは行わない。
