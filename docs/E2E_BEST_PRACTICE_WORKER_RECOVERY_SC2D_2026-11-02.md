# SC2-D 非実行plan封印・一度限り移譲の検証

Date: 2026-11-02。基準HEAD: `e0615e4`。
Status: 合成依存限定。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

## 1 実装範囲

[接続契約draft-0.8](BEST_PRACTICE_ABORT_SCOPE_WORKER_RECOVERY_CONTINUATION_DESIGN.md)§13に従い、配布対象外issuerの同じ新世代readyから非実行planを封印する境界を追加した。srcや実finish／runtimeは変更していない。

- 元readyを最初のguard前に取り外す。seal claimは一度限り。同owner binding／pinned seed／同新frame／凍結済み入力／元S・全L・O・U／verify snapshotをprivate planに保持し、元のframe・入力slotを空にする。
- 集合・T_i・U・frameをraw入力させない。SC2-Aの受理済みimmutable snapshotをそのまま引き継ぎ、callerの後からの集合追加／欠落／state昇格／U切下げを採用しない。
- plan handleから、同owner内のprivate受取slotへ移譲する分岐と、authority:noneの凍結summaryを返す分岐を排他にする。元slotはpre-guard前に取り外し、失敗時にも戻さない。
- summaryはassets・receiptなしのinput時刻／state・元time・会計・collection／consistency・固定limitations／errorsのみ。summaryやcopy／JSONからplanやhandoffを再生成しない。
- 受取slotは同handoffの一度限り固定discardだけで、実finishや任意callbackを実行しない。新世代cleanup確認前の破棄・保持planを隠すnormal closeを拒否する。
- 失敗時は全plan handle／private slotを同期失効する。先行soft・最初のhard・新旧cleanup・課金済みC/G/P・元終端UTCは保持し、事前発行したcleanup sinkだけで診断を回収できる。

## 2 RED／GREEN・初回失敗

TDDで3経路を順に接続した。

| 試験 | RED | GREEN |
|---|---|---|
| 同新frameの封印 | sealWorkerRecoveryPlan未実装 | 1件成功 |
| authority:none summary | summarizeWorkerRecoveryPlan未実装 | 2件成功 |
| private移譲→cleanup確認→受取破棄 | transferWorkerRecoveryPlan未実装 | 3件成功 |

初回strict型検査では、summaryのerrors配列が最初のanalysis／deadline_exceededだけのliteral型へ推論され、consistency errorの追加で2件の型エラーになった。原因を確認し、許すstageとstring codeのreadonly要素型を配列へ明示して、同じ検査でエラー0を確認した。型検査のstrict条件や既存期限は緩和していない。

開始時点にはSC2-Cレビュー修正3件を含む`e0615e4`が存在したため、その128件を維持した。前回SC2-C初回125件との差はこの既存3件で、SC2-Dが旧試験を変更したものではない。

## 3 合成試験と独立検証

[SC2-D試験](../tests/review/synthetic-worker-recovery-plan.test.ts)は**78件**。

| 観点 | 確認内容 |
|---|---|
| 集合・時刻 | 1／3／100件の選択順、reviewed／rejectedの完了state・reason、未処理state、receiptなしT_iと元Uの保持 |
| 凍結 | callerの後からの集合追加／欠落・state昇格・U切下げ・会計書換えを採用しない。summaryの配列・要素・time・会計・errors／limitationsも凍結 |
| 二つの分岐 | summaryとprivate移譲は排他。二重seal／二重移譲／二重受取消費、元ready／準備handleへの戻りを拒否 |
| summary再利用 | authorityやassets・Uを編集したcopyでもseal／transfer／受取消費を拒否。frame／receipt／source／cleanup等の実行用参照を出さない |
| 同一性 | 別binding／新世代ready／plan／handoff、copy、summaryの混入を拒否し、別ownerは不変 |
| verify・collection | no verifyの元consistency、success／changed／bounded失敗と固定errorsを保持。collection failedをcompleteへ昇格しない |
| pre/post guard | summary／transferの各6位置、計12回の取消を独立位置式で確認。内部sealは位置2以降だけ1、移動は位置4以降だけ1、summary発行は位置5以降だけ1。失敗時slotはすべて空でfinish0 |
| 停止・cleanup | guard再入、元7identityと元4時刻／deadlineの変更、hard失効で停止。新cleanup診断は維持するがlate confirmedでplanは復活しない |
| 固定破棄 | cleanup未確認の受取discard、保持planを隠すnormal closeを拒否。確認後に一度だけ破棄してclose可能 |

期待する集合・時刻・各計数は実装helperを使わず、fixtureの固定ID／時刻と有限のguard位置から計算した。任意JSONのplan validatorを追加して検査したものではない。外部のplan値を受け取らず、既にstrict検査済みのprivate値だけを使う構造の確認である。

関連10ファイルの**1,081件成功**。SC2-A120・SC2-B89・SC2-C128・SC2-D78・SR-A124・SR-B121・SR-C①116・WJ-A157・WJ-B66・WJ-C82。

## 4 ビルド・全体回帰・梱包

すべてbdo経由で実行。既存ローカル待受試験のため待受可能な条件で全体合成試験を行い、PDI／外部サービスへの接続試験は含めていない。

- `bdo npm run build`：成功。
- rootと追加試験の単独strict tsc（noUnusedLocals／noUnusedParameters、ES2022／NodeNext）：成功。
- 対象TSと梱包監査のeslint：成功。
- 関連10ファイル、maxWorkers=2：1,081件成功。
- 全体、maxWorkers=3・verbose／JSON reporter・silent：**245ファイル11,260件成功、失敗0・保留0、約51.30秒**。外側観測打切り150秒には未到達。製品60秒・既存test deadlineは変更していない。
- offline梱包監査：**441ファイルと既存compiled回帰が成功**。SC2-Dの関数・brand・scope・path非同梱、seeded漏出の負の対照、既存I/O／clock／runtime／worker参照監査を確認。SC2-Dのcompiled保証／B-03完了には数えない。

一時JSON：`/private/tmp/servicenow-sc2d-full-20261102.json`。
SHA-256: `dde27b97393693b91e30ca254ac771c46d02d6ece70a6277e1795f9a027ebad2`。
関連試験：`/private/tmp/servicenow-sc2d-related-20261102.json`。一時artifactの永続保持は保証しない。実コード本文・資格情報・raw例外は表示せず、集計だけ確認した。

## 5 レビュー確認（2026-11-02）

§4のESLintは対象TSと梱包監査だけに対する結果で、修正前の記録として残す。レビュー時にrepo全体の`npm run lint`を実行し、exit 0を確認した。同時に`npm run build`成功、offline梱包441ファイル成功、全体合成（maxWorkers=3）245ファイル／11,260件成功・失敗0・pending 0を確認し、§4の全体JSONのSHA-256も一致した。

レビューで実装の8判定を外す変異を確認した。新cleanup確認前の受取discard拒否、封印／移譲済みplanを隠すnormal closeの拒否、summaryのverify error保持、collection failedのrun_status保持の4判定は、外すと既存試験が失敗した。seal claimの一度限り（`planStarted`）、sealでのverify完了確認、`checkPlan`のowner／seed／time照合、`checkPlan`の起動数・ready数・cleanup frame照合の4判定は、外しても既存試験が通るが、それぞれready handleのslot先行取外し、claim時のverify完了要求とclaim後のverify停止、hard停止時のact入口での拒否、ready受理後に変わらない内部整合性によって同じく拒否される等価変異として扱い、追加試験の対象にしていない。実装・試験は変更していない。

## 6 残課題・非対象

今回のhandoffは同合成owner内の受取slotであり、SR-Dの実finishへ移譲した証拠ではない。実finish／E／結果schema・候補消費、実session／ReleasePermit／payload／worker jobへの正式binding、実worker／runtime、実cleanup・外側checkpoint、B-03 compiled保証は未対応。SC2-Aの一般化したinput契約も変更しない。

追加work／layout／allocation・全費目上界はUnknownで、本番cap・全体受付は有効化しない。正式発行口閉鎖・調査保留を維持する。実通信・トークン発行・設定変更・Pushは行っていない。
