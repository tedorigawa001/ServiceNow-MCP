# AU-BR-006 ST-03B：一度限りconsumer・発行後失効の合成検証

Date: 2026-10-31 / Scope: 閉鎖された合成依存。ST-02のnative record／実session／実通信の連続E2Eではない。

## 1 実装

[接続設計§11](BEST_PRACTICE_ABORT_SCOPE_STATUS_TERMINAL_CONNECTION_DESIGN.md)に従い、ST-03Aと同private constructorへ一度限りconsumerを追加した。外部exportはscenario名だけのfixtureのまま。consumer／token／context／record／registry／外部callbackの提出・取得口は増やさない。

自registryと期待context／anchor／record／local世代／budget／clock／windowの照合後、消費claimをcallback前にstartedへ変更し、live draftを外す。pre／post-guardと元clock観測直後の再検査を通過したときだけ、consume件数を1増やしimmutableな合成結果を確定する。finallyでclaimをspentにし、失敗・再入・取消・期限切れ後にも戻さない。

発行identityの履歴はprivate WeakMapに残るが、それだけではliveな権限にならない。失効・claim・適格性・元clockを毎回照合する。成功結果も全7権限=falseの過去の事実だけで、後から停止／二重消費しても再実行可能にならない。

## 2 実行結果

| 確認 | 結果 |
|---|---|
| `bdo npm run build` | 成功 |
| `bdo npx vitest run tests/review/status-consumer.test.ts tests/review/status-context.test.ts` | 2ファイル・131件成功（追加consumer60件＋既存context71件） |
| `bdo npm test` | 全体合成201ファイル・9,153件成功 |
| `bdo npx eslint src/review/abort-scope-evidence-status-context.ts tests/review/status-context.test.ts tests/review/status-consumer.test.ts` | 指摘なし |
| `bdo node tests/review/package-http-classification.mjs` | 409ファイルdry-run成功。開発専用module／fixture非同梱、packaged runtimeの依存なし |
| compiled単独fixture | native／network／timerを禁止したimport・合成発行／消費・二重消費／取消／post期限・foreign拒否を確認 |

## 3 確認した境界

- 製品のscenario一覧／guard helperをimportしない42ケースの期待表を照合し、件数と名前の一意性を確認した。これはロジック非共有の合成評価であり、人手の独立ブラインド成績ではない。
- release403／404、no_bodyの成功。no_bodyをEOF／body ackに変えず、成功結果をJSON等で再入力しても採用しない。
- 発行後・消費開始前のcancel／close、pre／post-guard内の再入・cancel／close・throw・期限越え。消費claimは先に消費され、後から時刻／callbackを戻しても再開しない。
- 元floorの直前50,001・等号50,000・期限後49,999、pre観測59,000→post59,500の逆行、非有限値を拒否。record／発行時から同じlast値を継続する。
- foreign token／context／anchor／record／世代／budget／clock／window、token copy／診断を拒否し、foreign ownerのclaimと診断は変えない。lookup失敗後に自tokenを再提出しても失効が残る。
- 二重消費・再発行・成功後stopではfirst_terminal=consumedと成功履歴を保持し、phaseだけがfailed／revokedへ変わる。HTTP／cleanupの確定事実、first primary／refusal／stageは上書きしない。
- hard／local／未確認／read開始違反から消費へ進めない。既存ST-03Aの発行までの固定事例を維持し、consumer_implementedと未開始consume claimの期待だけを更新した。

## 4 初回失敗の切り分け

最初の追加40ケースを含む2ファイル129件は成功。その後、foreign lookup失敗後の自token再試行とpost-guard失敗後の再試行を追加したところ、131件中130件成功・1件失敗となった。

失敗は`consume_post_retry_after_failure`。fixtureはpost側の2回目のclockへ到達していたが、例外発生条件が末尾`_throw`だけを見ていたため、この固定ケース名では例外を出さず、通常消費後の二重消費になっていた。対象1件の再実行でも同じ結果を確認した。

同ケースでも2回目に例外を出すようfixtureの分岐1箇所を修正し、131件成功、その後の全体201ファイル・9,153件成功を確認した。consumerのguard・claim・期限やテストtimeoutは緩和していない。

## レビュー修正（2026-10-31）

- 指摘：lookup失敗はclaim前に起きるため、ownerは`revoked`になる一方、診断の`claims.consume`は`available`のまま残った。正規tokenで再試行してもpre-guardで拒否されるため成功は不可能だが、診断が停止状態と食い違っていた。
- 修正：lookup失敗時に未使用の`consume` claimを`spent`へ進める（消費中の再入では`started`のまま触らない）。foreign ownerのclaimは変更しない。成功経路・guard順序は変更しない。
- 試験：独立期待表のclaim期待を「全scenarioで`spent`」へ更新し、`consume_foreign_then_retry`の`consume_attempts`を1→0へ変更（正規token再試行がclaim前に拒否されるため）。lookup失敗後の再試行がclaimを開始しないことを確認する1件を追加（ST-03B試験61件）。修正前実装ではlookup失敗系の17件が失敗する。
- 再検証：tsc・変更対象ESLint・全体201 files／9,154 tests PASS、build後の梱包確認PASS（409 files）、`git diff --check` PASS。§2の実行結果は修正前の記録として残す。

## 5 未接続・閉鎖

recordは固定presetの合成事実。注入Response→同reader cleanup→private record→発行→消費の連続接続はST-03Cに残る。実session／認証snapshot／source／ReleasePermit／canonical予算へのbinding、C/G更新、retry／fallback、runtime採用・公開終了codeの写像は未実装。

全体合成試験の成功を実通信や正式証拠発行の確認へ読み替えない。STC-T01〜T20全体の達成・STC-A01〜A05／親のruntime承認も主張しない。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持し、実session接続・実通信・実機操作・設定変更は行っていない。
