# FB-03 同上位custody・固定discard・停止／予算供給点の合成検証

Date: 2026-11-03 / Base HEAD: `39b44f0`。
Status: **合成依存限定。同capsuleの上位移譲・元owner固定discard・停止／fake予算prefix・費目継続を確認。不足証拠はUnknown、正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持する。**

[接続設計§12](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FAILURE_BINDING_DESIGN.md)、[実装](../tests/support/review/synthetic-recovery-kernel.ts)、[合成試験](../tests/review/synthetic-failure-custody-run.test.ts)参照。実source／workerの終了や実canonical予算・全work上界を確認するE2Eではない。

## 1 成立した接続

- 新fresh DATA entryは旧FB-01／FB-02を昇格させず、同private coreから別constructionを作る。先行owner／同上位slotと同tokenのresource slot、fake供給ownerを入力検査より先に確保する。外部owner／receiver／budget／capsuleの登録口はない。
- 同kernelと固定cleanup操作objectを一つのcapsuleへ格納する。固定seal→commitのpost guard後、report・capsule・holder・serial・receiptを同期確定する。診断コピーだけを受理証拠にせず、同token／budget identityと空上位slotを検査する。確定区間にcallback／awaitはない。
- 元ownerの最終discardは同report／capsule／serialへ結合した一度限りreceiptを要求する。foreign／copy／report／余分引数を拒否し、失敗後にclaimを戻さない。commit前の拒否はlocal、commit後のdiscard拒否はupperに責務を残す。
- commit直後・discard前から元の操作関数を拒否する。借り置きしたcleanup関数も現在のslotを検査し、上位sinkを消費しない。元facadeは操作objectを直接lookupせず、同slot経由でのみ呼ぶ。final discard後の元inspectはkernel／supplyを返さない。JS heapの物理消去は保証しない。
- 上位は同kernelの唯一のsink consumerを使い、RoleBindingのfact受理先だけを同upperへ切り替える。公開ticketを返せなかったframeも同capsuleで処理する。sealed reportは同じimmutable objectのまま、遅着cleanupはupper.currentへ反映する。source cleanup／新worker exit／transport全件の不足をconfirmedへ変えない。
- 同private fake budgetをseedとresource slotへ結び、元C/G/P・開始UTC・全deadlineを一度pinする。無観測の初期失敗はnullのまま。残時間からdeadlineを作り直さず、wall clock／timer／自動retryを追加しない。guard viewはimmutableな限定診断であり、budget identityや操作権限を渡さない。
- seal／commit／discard／cleanupのpre・postを同供給ownerへ接続した。停止観測は保持し、先行hardを置換しない。例外・未知返値・握り潰した再入で止め、post失敗でも受理済みfactを戻さない。pre失敗でsink未開始なら、元の同capsuleを後続の明示cleanup-only呼出しで処理できる。

28件の試験に、通常の失敗→移譲→discard→上位cleanup、commit直後のsole owner、各checkpointのthrow／再入、未公開sink、receipt混入、上位受理前拒否、固定依存、未知予算、初回cleanup停止と先行hard後の期限観測、飽和・秘密非出力を含めた。実resource操作ではない。

## 2 費目の独立oracle

`fb03-fake-events-v1`は合成イベント数であり、実work unitや全体受付capではない。1行のretained入力から旧終了／cleanupを受理し、新世代をstartして停止、移譲、discard、上位cleanupする固定経路の期待値を、実装の計算器を使わず定数で与えた。

| 費目 | 期待件数 |
| --- | ---: |
| shell／budget_pin | 1／1 |
| entry／rejected_entry | 10／0 |
| healthy_checkpoint | 24 |
| role_reservation／role_fact | 3／6 |
| clear_checkpoint／notice | 1／1 |
| cleanup_request／terminal_receipt | 2／2 |
| cleanup_checkpoint | 8 |
| seal／commit／discard | 1／1／1 |
| 総計 | 62 |

C/G/P=10／20／30、開始UTC=2026-10-17T04:59:00.000Z、全deadline=60000を上位cleanupまで維持した。deadline_exceededを返すcleanup guardでも元のcancelledをfirst hardとして保持する。費目の所有点・除外範囲は設計§12.2に記載した。

台帳は固定15counter、総計4096まで。追加分はsaturated=trueとし、未計数分をUnknownに残す。3,000回の旧facade拒否で飽和させても、上位の一度限りcleanupと責務保持は成立した。飽和を本番cap承認／正常受付に使用しない。JSON検査・割当て等を含む全work／heapは未導出である。

## 3 RED／切り分け・変異対照

1. 最初の連続経路はfactory未実装で1件失敗。接続後に旧FB-02／custodyと合わせ161件成功した。費目の試験を追加すると、上位cleanupのpre／post未接続で1件失敗した。同供給ownerへ接続し、62件の独立oracleと一致させた。
2. cleanup guardが初回hard前に`code=access_denied`付き例外をthrowする試験は、internal_review_errorでなくaccess_deniedとなり失敗した。guard例外が境界を越えて外側のcode分類器へ直接届いていたことを確認し、guard境界で固定internal_review_errorへ正規化した。raw code／messageは記録しない。同試験を再実行して成功した。既存の先行hardがある場合は引き続き置換しない。
3. capsuleの同期移動だけを無効にした変異では、同reportだけが上位にある不整合を最終discardが拒否し、連続試験が失敗した（対象1件、他26件未実行）。移動処理を復元した。
4. link consumerを常にlocalへ固定する変異では、移譲後の上位cleanupが失敗し、同連続試験が検出した（対象1件、他26件未実行）。同holderへの切替を復元した。変異は残していない。

元facadeの操作lookupを現在のresource slotへ限定し、診断readは操作objectを直接参照しない形へ整理した。内部resource slotの任意改変・OOM等を注入する入口は作っておらず、その種の内部故障保証には数えない。

## 4 最終検証

全て`bdo`経由、下記の終了コード0を確認した。

| 検証 | 結果 |
| --- | --- |
| `npm test -- --project unit tests/review/synthetic-*.test.ts`（shell展開） | 37 files・3,191 tests成功。新28件と旧supply／FB-01／FB-02／custody／kernel／accepted／seal等の合成回帰 |
| helper2件・新旧試験5件のstrict `tsc --noEmit`（noUnusedLocals／noUnusedParameters、ES2022／ESNext／bundler／skipLibCheck） | 成功 |
| kernel・新試験・梱包監査scriptのESLint | 成功 |
| `npm run build` | 成功 |
| `node tests/review/package-http-classification.mjs` | 441 files。新entry／scope／fake model／resource slot marker非同梱、固定importとseeded runtime／I/O／clock／worker／漏出の負の対照、既存compiled合成試験成功 |
| `npm_config_offline=true node tests/review/package-worker.mjs`（既存cacheアクセス許可） | 441 files。production-only install・既存ローカルworker解析／集約・MCP fake dispatch・fixture境界成功 |

repository全体の試験・PDI E2Eは実行していない。梱包smoke内の既存ローカル合成worker／sourceを、FB-03の実originや実cleanup保証へ昇格しない。ネットワーク取得・設定／所有権変更は行っていない。

## 5 境界と残課題

同上位への移譲は責務保存であり、source cleanup・新世代の独立終了・transport全件inventoryの欠けを解決しない。利用可能なcleanupを処理した後も、upper capsuleを自動で外さない。実session／canonical予算／OS停止／cleanup deadline・全work／heap・外側executor終了はUnknownのままである。

OB-02の同pins／accepted／plan採用と移譲先sealは未実装。正式発行口閉鎖・全体受付無効・調査保留を維持し、accepted採用・実接続・実通信・実機操作・token／Permit／候補発行・設定変更・Pushは行っていない。元60秒・210試行・C/G/P／retryの上限は変更していない。

## 6 レビュー修正（2026-11-03）

§4の新28件は修正前の記録として残す。§4はrepository全体の試験を実行していなかったため、レビュー時にrepo全体のlint（error 0・warning 374）、build、梱包分類監査、全体合成272ファイル／13,370件成功・失敗0を確認した。

- 試験：cleanup経路で`cleanup_guard`が未知の値を返した場合の拒否。`cleanupCheckpoint`内の`accounting.observe(stop)`が`cancelled`／`deadline_exceeded`／`undefined`以外を投げることが、cleanup経路（`cleanup()`）で未知の値を拒否する唯一の防御だった（seal／commit／discard側はcustodyの`reject('shape')`が別に拒否する）。判定を外すと、discard後の`upper.cleanupOwned('confirmed')`が未知の戻り値を無視して完了し、`cleanup: confirmed`として記録された。実装は正しく、現行コードは先行hard（`cancelled`）で拒否する。cleanupのpre／post各checkpointで未知値を返し、先行hardのまま失敗し`observed_stop`を汚さないこと、preではcleanup factを記録しないことを検査する2件を追加した。

この変異は追加した2件だけを失敗させた。commit／discardのresource slot照合（private slotは常に整合）、holderとcapsuleの判定（相互に重複）、hard前transfer（custodyのseal状態判定が先に拒否）、final discardのbusy判定（custody自身のbusy判定が先に拒否）、budget pin（内部で一度だけ呼出し）は等価変異として扱う。依存key契約の変異はFB-02の試験が検出する。helperは変更せず、新規試験は30件。修正後も全体合成272ファイル／13,372件成功・失敗0。

## 7 コミット対象だけの再検証

FB-03関連8ファイルだけをindexへ選び、HEAD＋indexの全ファイルを一時フォルダへ取り出して再検証した。依存は既存node_modulesを参照し、作業ツリーの未選択ファイルには依存していない。

同コピーでbuild、合成37ファイル／3,191件、対象strict型検査とESLint、梱包監査441 files、既存cacheを使うオフライン梱包smoke441 filesが全て成功した。cacheアクセス許可を用いたが、実通信・設定変更・Pushは行っていない。実行後の追記は本節だけで、検証済みコード・試験・梱包scriptは変更していない。
