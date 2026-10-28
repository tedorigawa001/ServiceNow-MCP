# AU-BR-006 閉鎖gate：内部型・private生成継続の合成検証

Date: 2026-10-28 / Scope: development-only、fake依存限定。

## 1. 変更範囲

[詳細設計draft-0.2 §14](BEST_PRACTICE_ABORT_SCOPE_SESSION_TRANSPORT_BODY_BINDING_DESIGN.md#14-draft-02閉鎖gateの最初の合成実装)に沿って[閉鎖gate](../src/review/abort-scope-evidence-closed-body-gate.ts)と[合成試験](../tests/review/closed-body-gate.test.ts)を追加した。実session台帳、認証、ReleasePermit、ReadState、C/G/S/P/E/R、実transport、worker、公開JSON／MCPを変更していない。

constructor→run→transportのprivate継続はfake realm内だけで生成する。transport handleはidentity-onlyで、会計／I/O権限はない。正式body要求は常に拒否し、発行数は0。承認風の設定やdiagnosticのコピーを書き換えても発行できない。

## 2. 合成試験の観測

- 最初のtracerはmodule未実装で失敗（RED）、実装後に1件成功（GREEN）。その後36件へ拡張し再実行した。
- constructor／run／transportの一度限りのclaim、通常の重複要求の拒否と既存bindingの維持、消費中の再入では停止。
- 別realm・clone・scalar handleの拒否。既知ownerへの混入では受信側だけ停止し、外国ownerは不変。
- clock callback内の取消時にはhandleを公開しない。hard期限の直前・等号・超過、低減期限、逆行・非有限・例外・加算不能を拒否し、後の正常時刻でも再開しない。
- legacy identityからtyped transportを取得できず、再constructによるlane切替も不可。
- first primaryとfirst refusalを別slotで保持。close後の遅い要求は診断不変。固定codeだけを返し、秘密を含むErrorを露出しない。
- frozen不透明handleからprivate継続・登録／採用・I/O・会計・body発行口を取得できない。

## 3. 実行結果

| 確認 | 結果 |
|---|---|
| `vitest run tests/review/closed-body-gate.test.ts` | 1 file、36 tests成功 |
| `npm run build` | 成功 |
| 新module・試験のESLint | 成功 |
| `vitest run --maxWorkers=3` | 169 files、5,048 tests成功、32.95秒 |
| `tests/review/package-worker.mjs`（offline cache） | production-only install・解析・集約成功、377 files |

新moduleは既存の`!dist/review/abort-scope-evidence*`除外に含まれ、梱包数は増えていない。全体試験のローカル合成通信とpacked worker smokeは実行したが、PDI・外部サービスへの通信ではない。

## 4. 未実装・制限

このmodelのsnapshot／auth／budget／generationはfake identityで、本人確認や実release証拠を示さない。期限確認は同期checkpointだけで、timerによる自動停止や実OS期限保証はない。cleanupのnot_startedはI/O未実施の表示で、物理解放の証明ではない。実session constructorへの接続、単一会計・用途／予約・body候補／cleanupの消費は次工程。

cap／Q下限・全体work上界の承認を行っていない。正式発行口閉鎖、Unknown・全体受付無効、VM／監視／telemetry保留を維持。実transport・実機操作・token発行・設定変更・本番cap投入は行っていない。
