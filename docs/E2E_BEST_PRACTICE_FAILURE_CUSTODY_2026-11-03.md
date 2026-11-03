# 固定4roleの失敗ownerとcustodyの合成検証

Date: 2026-11-03 / Base HEAD: `19cc1e4`。
Status: **独立した合成owner・診断・custody・commit receipt／最終discardまで確認。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

[寿命設計§9](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FAILURE_OWNER_LIFETIME_DESIGN.md)、[実装](../tests/support/review/synthetic-failure-custody.ts)、[試験](../tests/review/synthetic-failure-custody.test.ts)参照。既存OB-01／kernel・実resource／cleanupを接続する試験ではない。

## 1 確認範囲

- fresh factoryが同construction内のissuer／local／upper、source・transport_group・old_generation・new_generationの4roleと一つのcustody holderを生成する。旧owner・session・resource・任意上位ownerの登録口はない。
- 同roleの生成claim・未生成証拠・生成結果・終了／cleanup証拠を分離する。証拠は同token／private frame／ticketに結合した別brandの空handleで、一度だけ受理する。空map・未設定handleやcallerのnot_required文字列からabsenceを推論しない。
- 生成済みroleは生成結果・終了・要求済みcleanup confirmedの全てが必要。未生成は同issuerの証拠が必要。元生成結果が遅着するcreatingは、終了／cleanupが先に観測されても解決済みにしない。
- first hardを固定し、後続のprotocol fault・cleanup失敗・表示失敗・停止観測で置換しない。hard後は新規生成を拒否するが、発行済みcleanupの要求・証拠記録は可能とする。
- sealでimmutableな非実行reportを作り、同upperの空slot・同custodyへのcommitを一度だけ行う。snapshot／summary／ack bool・foreign／copyを受理証拠へ昇格しない。
- commit前はlocal、commit後はupperが唯一のcleanup所有者。未解決を残したまま元ownerをdiscardするには同commit receiptが必要で、upper不在／拒否時は元の責務を保持してdiscardを拒否する。
- source-ownerのdiscard後も、遅着した同証拠はupperで受理できる。公開済みreportは不変のまま、upperのcurrent診断だけを更新する。旧localの拒否で上位用の未消費証拠を奪わない。
- fault件数100の飽和後もprivate poison flagでswallowed再入を検出する。seal／commit／discardの両checkpointのthrow・再入で、commit前後の責務所有先が一意のまま残る。

4role×9状態の独立表36件を、固定の期待release／unresolved件数へ照合した。unknown、creating、生成結果待ちの終了／cleanup先行、createdだけ、cleanupだけ、終了だけ、両確認、cleanup未確認、証明済みabsenceを区別した。成功する場合もoutcome=failedであり、レビュー成功や候補にはならない。

## 2 REDと初回失敗

1. 連続経路の最初の試験を先に追加し、module未実装のためsuite読込が失敗した（0 tests）。assembly追加後に1件成功。
2. source closedを受けたが要求済みcleanupが未確認のケースを追加すると、2件中1件が失敗した。初期のresolved判定がsourceのcleanupを例外扱いしてrelease=confirmedにしていたためである。生成済みの全roleで終了とcleanup両方のconfirmedを必要とする保守的なsubsetへ訂正し、同試験を成功させた。既存kernelや実sourceの完了条件は変更していない。
3. 初回の対象ESLintは、試験中の不要な`c.local.finalDiscard;`式を1 errorとして報告した。不要式を除去し、再実行で成功した。製品の期限・上限は変更していない。

report／proof／receiptの確保はcommitのpost checkpoint前に済ませ、custody切替区間は同期代入だけにした。確認のためのログ・raw例外・本文出力口は追加していない。

## 3 再実行結果

全て`bdo`経由で実行し、下記の終了コード0を確認した。

| 検証 | 結果 |
| --- | --- |
| `npm test -- --project unit tests/review/synthetic-failure-custody.test.ts` | 1 file・105 tests成功 |
| `npm test -- --project unit tests/review/synthetic-*.test.ts` | 34 files・3,079 tests成功。旧OB-01／OD-A・accepted／seal／discard等も維持 |
| 対象2ファイルのstrict `tsc --noEmit`（ES2022／ESNext／bundler／skipLibCheck） | 成功。OB-01 preparedとcommit receiptの別brandも型検査 |
| `npx eslint tests/support/review/synthetic-failure-custody.ts tests/review/synthetic-failure-custody.test.ts` | 成功 |
| `npm run build` | 成功 |
| `node tests/review/package-http-classification.mjs` | 441 files。新helperの固定node:util依存・marker非同梱とseeded runtime／I/O／clock／worker／漏出負の対照、既存compiled合成試験成功 |
| `npm_config_offline=true node tests/review/package-worker.mjs` | 441 files。既存cacheでproduction-only install・合成worker解析／集約・MCP fake dispatch・fixture境界成功 |

repository全体のテストとPDI E2Eは今回実行していない。梱包smokeのworker／sourceは既存ローカル合成fixtureであり、新ownerの実resource origin保証には数えない。実通信・設定変更は行っていない。

## 4 レビュー修正（2026-11-03）

§3の105件は修正前の記録として残す。§3は全体回帰を実行していなかったため、レビュー時にrepo全体のlint（error 0・warning 374）、build、梱包分類監査、全体合成269ファイル／13,261件成功・失敗0を確認した。

- 試験：commit後・finalDiscard前の`local`によるcleanup操作の拒否。`custody.holder!==side`判定が唯一の防御だが未検証だった。判定を外すと、commit後もholder=upperのまま`local.requestCleanup`が受理され、localとupperの双方がcleanup権限を持った。既存試験はdiscard後だけを見ており、discard済み判定が先に止めていた。実装は正しく、現行コードは`state`で拒否する。commit後・discard前に`local.requestCleanup`と`local.observe`が`state`で拒否され、holderがupperのまま、同じ未消費factをupperが消費できることを検査する1件を追加した。

この変異は追加した試験だけを失敗させた。次は等価変異として扱う：hard時のcreation closeと新規生成拒否、issued重複flagとtermination／created／absence状態判定、seal／commit／discard claimとstate／handle判定、commitの上位slot・discard proof判定（いずれも相互に重複する一度限りflag）、証拠のtoken・role・frame（一rootに一token、各roleに一frame）、ticket・absence種別（ticket有無が異なり必ず一方が拒否）、absenceのever_started／creation_closed、discard後localとcommit前upperのowner判定（holder判定が先に停止）。helperは変更せず、新規試験は106件。修正後も全体合成269ファイル／13,262件成功・失敗0。

## 5 境界と残課題

新ownerは本文・pins・accepted／planを最初から受け付けない。したがって既存OB-01の実payload失効やresource生成点へのowner確保を代行したとはしない。upperのcleanup custodyも合成ticket／factの一意な所有であり、実reader・worker・sessionの操作権限ではない。

guardのcancelled／deadline_exceededは停止観測へ残すだけで、cleanup-onlyの報告・移譲・discardをhealthy guardで止めない。timer・wait・retryは作らない。一方、同canonical予算／全deadlineの実binding、全attempt inventory、実cleanupと外側executorの有限終了は未結合／Unknownである。

元ownerのdiscard後にも未解決責務がupperへ残るケースは、release=unconfirmedのまま報告する。upperの後続current診断がconfirmedになっても、過去のsealed reportを成功へ書換えない。失敗した一度限りclaimは復活させず、commit拒否時はlocal、commit後のdiscard拒否時はupperに責務を残す。

台帳は4role・最大4ticket／12未消費証拠・report／receipt各固定slot、fault件数は100で飽和する。固定slot数やcheckpoint数を全work／heap上界とは扱わず、JS heapの物理消去も保証しない。accepted採用・移譲先seal・実接続・token／Permit／候補発行・Pushは実施していない。
