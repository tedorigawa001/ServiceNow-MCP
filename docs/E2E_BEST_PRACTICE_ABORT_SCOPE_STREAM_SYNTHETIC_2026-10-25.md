# AU-BR-006 合成stream：受信上限・課金・中断の検証

Date: 2026-10-25。対象は[bounded設計§11](BEST_PRACTICE_ABORT_SCOPE_BOUNDED_BUDGET_DESIGN.md#11-合成streamへの限定接続)。実transport/worker/PDIのE2Eではない。

## 範囲

- 合成response/readerと内部予約台帳を接続し、C/RとS/G/Eを区別する。実fetchは呼ばない。
- 1応答の証拠16KiB以下・証拠累計256KiB以下を下位capとして、通常応答/全体受信の既存上限と合わせて検査する。合成fixtureでのみ低減可能、上方変更不可。
- 超過chunkも数えて保持前に停止。失敗body/retry分を返金せず、retryは同logical read/slotで最大1回。terminal認証statusはbodyを開かない。
- E枠閉鎖後は新しい証拠GETを行わず、親/metadataの枠は維持。未実施finalはslotだけ終端化し、安定観測にはしない。
- 取消/台帳不正時に待機を中断し、late bodyを受理せず、cancel要求/cleanup未確認と一次診断を保持する。

## 検証結果

| 検証 | 結果 |
|---|---|
| stream・予約・channel・比較接続・phase・owner・比較器の関連7ファイル | 297 tests成功（stream32、既存関連265） |
| `bdo npm run build` | 成功 |
| 変更source2/streamテスト/oracleへのlint | 問題なし |
| `npm pack --dry-run --json --ignore-scripts`の一覧確認（一時cacheは当該process限定） | 369 files、`dist/review/abort-scope-evidence*`は0件 |

実行コマンドは`bdo npx vitest run tests/review/abort-scope-evidence-stream.test.ts tests/review/abort-scope-evidence-reservations.test.ts tests/review/abort-scope-evidence-channel.test.ts tests/review/abort-scope-evidence-comparison-owner.test.ts tests/review/abort-scope-evidence-phases.test.ts tests/review/abort-scope-evidence-owner.test.ts tests/review/abort-scope-evidence.test.ts`。

独立oracleは製品をimportせず、fixture側イベントからC/G/E/Sとcancel回数を再構築する。16KiB等号/1超過、低減累計E等号/超過、同chunkのG/E同時超過、最初の超過chunk後にそれ以上readしないこと、G等号EOF、retry/body途中失敗、分割1/2/7/128bytesを照合する。

401/403/404/400のbody未読、JSON不正の非retry、429/500/503の最大1retry、2回失敗、E残0でのretry拒否、取消前のbyte保持とlate byteの非課金、late response cancel、cancel成功/reject/無応答、台帳不正からstall readへの即時停止を試験する。実fetch/clock/timer/loggerを禁止した合成読取も対象。

初回lintは、検証本体のない仮テスト行の未使用引数1件で失敗した。原因を確認してその行を削除し、実際にassertするテストだけで再実行する。製品上限・テスト期限は緩めていない。

## 制限

合成fixtureがresponse/status/読取結果/stop通知を供給する。実認証session/source/URL/ACLとの結合、固定GET、実Worker、実60秒/50/55秒の期限、retryの実待ち時間、body意味検査/観測receipt/上位JSONは未接続。acceptedはJSON bodyの受理に限り、cleanup未確認は値と統計に残る。実resourceの終了成功ではない。

Content-Lengthや圧縮headerは合成入口に設けていない。readerで返るbyteのみを測り、実fetch内部buffer・未読の回線量を測定したとはしない。独立oracleも取消後の未受理byteは合計に含めない。cleanupのmicrotask観測は保守的にunconfirmedとなり得て、実OSの解放期限/証拠とは異なる。

全体合成テスト/依存インストールを含む梱包完全検証は未実施。公開0.2/0.3・明示14/既定3規則・固定評価セット・実bounded transportは変更していない。VM/監視/telemetry保留・Unknown・全体受付無効を維持し、実機操作・トークン発行・設定変更・本番cap/実行permit発行は行っていない。
