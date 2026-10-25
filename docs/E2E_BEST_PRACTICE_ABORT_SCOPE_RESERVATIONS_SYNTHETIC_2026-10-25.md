# AU-BR-006 純粋予約台帳・費目型・独立oracleの合成検証

Date: 2026-10-25。対象は[bounded設計§10](BEST_PRACTICE_ABORT_SCOPE_BOUNDED_BUDGET_DESIGN.md#10-純粋台帳の限定実装)。実HTTP/worker/PDIのE2Eではない。

## 実装範囲

- 台帳ごとのprivate read/table/slot/attempt handleとC/R/Tの会計。親/metadata各2、table各2の予約を分離する。
- Q<=210・C+4<=Q、T<=8、table受付のC+R+4、通常試行のC+R+1を検査する。拒否した受付ではT/R/Cを変えない。通常不足はfinal予約を残す。
- 初回readの占有・最大2試行・一度限りのsettle、固定final順序/用途結合、未使用予約の解放、初回不足による未実施skipを扱う。
- 不正操作/取消/期限等の合成通知でterminal停止し、first reasonと消費済みCを保持する。予約は失効させ、再開しない。
- test-only oracleは製品の型/関数をimportしない。合成dispatch/admit/release/final/stopイベントを独立集計する。

## 実行結果

| 検証 | 結果 |
|---|---|
| 予約台帳・channel・比較接続・phase・owner・純粋比較器の関連6ファイル | 265 tests成功（新台帳76、既存関連189） |
| `bdo npm run build` | 成功 |
| 新規source/テスト/oracle fixtureへの`bdo npx eslint` | 問題なし |
| `npm pack --dry-run --json --ignore-scripts`の一覧検査（一時cacheを当該processだけに指定） | 369 files、`dist/review/abort-scope-evidence*`は0件 |
| `bdo npx vitest run`（全体、phase終了時のread終端化修正後） | 141 files / 4048 tests成功 |
| `npm run test:pack`（一時cacheを当該processだけに指定） | 本番依存だけのinstall＋worker smoke成功、369 files |

実行：`bdo npx vitest run tests/review/abort-scope-evidence-reservations.test.ts tests/review/abort-scope-evidence-channel.test.ts tests/review/abort-scope-evidence-comparison-owner.test.ts tests/review/abort-scope-evidence-phases.test.ts tests/review/abort-scope-evidence-owner.test.ts tests/review/abort-scope-evidence.test.ts`。

32本の正常traceで各イベントprefixのC/R/T/phase・slot残数/試行数をoracleと照合し、拒否/取消/二重完了/通常枠不足の5経路でも独立会計を確認した。C=202の新table受付等号とC=203の1不足、C=206/R=4からfinal4試行、8table・C=190/R=20からfinal20試行を確認した。いずれも全試行上限210を増やしていない。

別台帳/clone/別table/旧booleanでの流用、親/metadata順序逆転、3回目のfinal、二重settle、初回完了前の通常read割込み、available初回の不正skip、失効後のlate settleを拒否した。未実施finalはattempts=0、予約解放はCに数えない。通常readのretry待ち・table初回のretry待ち・開始前readのまま通常phaseを終えても、final予約と非停止状態を保持してfinalへ進めることをoracleと照合し、試行中の未settle試行ではfinal遷移を拒否することも確認した。費目/統計snapshotの凍結とhandle非露出も確認した。

fetch/実時計/timer/console.logを禁止した合成操作列も成功。原資格情報・コード・ネットワーク応答は入力していない。

## 制限・次工程

合成callerが初期C/上限/通信結果/stop通知を与えるため、実session/source/HTTP結果の真正性や60秒の実中断を証明しない。台帳のstartは合成dispatch相当であり実fetchを起動しない。C/R/Tだけを検証し、S/G/E byte課金・stream/EOF・body cancel・実解放・実worker・上位結果ownerは未接続。

通常logical readの同じendpointへの再作成禁止等、実sourceの用途/選択metadata契約は将来の接続側で保持する必要がある。新台帳を同じ実sessionに何度も生成できないclaimも未接続。初回unavailableは合成結果であり、実404/ACL/版の検査はまだない。

既存transport・公開JSON・明示14/既定3規則・固定評価セットに変更なし。VM/監視/telemetry保留・Unknown・全体受付無効を維持し、本番cap投入・実transport/worker接続・実機操作・トークン発行・設定変更・実行permit発行は行っていない。
