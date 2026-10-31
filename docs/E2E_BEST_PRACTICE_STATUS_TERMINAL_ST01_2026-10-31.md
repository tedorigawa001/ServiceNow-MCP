# AU-BR-006 ST-01：合成status-only終端の検証記録

Date: 2026-10-31 / Scope: ローカル合成依存のみ。実通信／実機E2Eではない。

## 1 実装と閉鎖

[詳細設計§10](BEST_PRACTICE_ABORT_SCOPE_STATUS_ONLY_TERMINAL_DESIGN.md)の開発専用ownerを実装した。合成bindingは固定tupleの代理にすぎず、実session／source／ReleasePermit／canonical leaseを登録・採用しない。Response／Streams／timer／fetchを呼ばず、7項目のcleanup事実を合成申告として検査する。

issue→finish→consumeは最大1回ずつ。コピー・別owner／binding／attemptの混入、再入、期限・逆行、停止後の再利用を拒否する。hard HTTPとcleanup失敗の両方を保持し、先行primaryを上書きしない。停止後にもcleanup診断は格納できるが、消費可能な終端は出さない。release403／404の合成terminalも診断copy用で、継続権限ではない。

## 2 実行結果

| 確認 | 結果 |
|---|---|
| `bdo npm run build` | 成功 |
| `bdo npx vitest run tests/review/status-terminal.test.ts tests/review/http-classification.test.ts tests/review/http-classification-legacy.test.ts tests/review/native-reader-adapter.test.ts tests/review/native-body-bootstrap.test.ts tests/review/native-ownership-contract.test.ts` | 6ファイル・3,213件成功 |
| `bdo node tests/review/package-http-classification.mjs` | 409ファイルのdry-run梱包確認成功。分類器／新owner／fixture非同梱、runtime JSの依存なし |
| compiled単独fixture | native global／timerを禁止した状態で合成発行・no_body・一度限り消費・全権限falseを確認 |

新規テストは53件。独立した手書きのcleanup期待表11行について、件数と名前の一意性を確認し、製品の理由判定helperを共有せずに照合した。ここでの独立は計算の非共有を意味し、人による独立ブラインド評価ではない。

## 3 確認した境界

- hard401／auth・parent403とcleanup rejectの二軸保持、local parent404、release403／404のno_body。
- 一度限りの生成／finish／consume、混入／コピー拒否、foreign ownerのclaimを変更しないこと。
- clock callbackによる再入・取消、消費時の期限切れ後に復活しないこと、等号での拒否。
- cancel／closed／releaseの複数失敗の優先理由と全事実の保持、取得済み事実のimmutable copy。
- read開始済みのstatus不適格とcleanup確認事実の分離、no_bodyを成功操作やEOFで偽装しないこと。
- accessor／proxy／追加key拒否、例外秘密の非保存、global native／timer呼出しなし。

## レビュー追記（2026-10-31）

- 確認：body読取が始まった報告（`read_started: true`）では、ST-01は`refusal: 'invalid_state'`だけを記録し、`primary`は`null`のまま、cleanupを`confirmed`として`finished`になる。試験で意図された挙動であり、ST-01は継続権限を発行しないため現段階の欠陥ではない。
- 残リスク：後続のnative／run接続でrun ownerが`primary`だけを停止判定に使うと、status-only終端の「read=0」違反を見落とす。
- 対応：コードは変更せず、[詳細設計](BEST_PRACTICE_ABORT_SCOPE_STATUS_ONLY_TERMINAL_DESIGN.md)をdraft-0.3とし、§10に接続時の停止条件を明記し、§8に受入条件ST-T17a（拒否slotの非nullでもrun停止または内部primary記録、cleanup事実は保持）を追加した（文書のみ）。§2の実行結果は変更しない。

## 4 未確認・未接続

cleanupの操作数・同reader・操作順・promise合流は今回の合成申告から証明しない。注入Response／Streams、実attempt／leaseのbinding、実会計、late delivery、native cleanupの強制期限、runtime consumer、公開終了codeは後続工程。全体合成テスト一式は今回再実行していない。

ST-T01〜ST-T20の全件達成や承認済みとは主張しない。ST-A01〜ST-A07／親A01〜A07は未承認で、正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実通信・実機操作・設定変更・本番cap投入は行っていない。
