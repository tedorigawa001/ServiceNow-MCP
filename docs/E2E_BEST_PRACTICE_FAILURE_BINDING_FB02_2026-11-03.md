# FB-02 同初期topology・kernel RoleBinding／cleanup sinkの合成検証

Date: 2026-11-03 / Base HEAD: `a5d4cf4`。
Status: **合成依存限定。private初期topology・出生時RoleBinding・clear前照合・既存sink接続まで確認。不足証拠はUnknown、正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持する。**

[設計§11](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FAILURE_BINDING_DESIGN.md)、[実装](../tests/support/review/synthetic-recovery-kernel.ts)、[試験](../tests/review/synthetic-failure-bound-kernel.test.ts)参照。実session／source／OS workerのorigin・終了／解放を確認するE2Eではない。

## 1 対象と成立した条件

- 旧entryを昇格せず、新fresh DATA entryを同private supply／FailureOwner coreから構成した。先行ownerと同tokenのbridgeだけで同OwnedMixedSupplyを取り出し、同active receipt・選択順・時刻・最小completed値・会計を回復準備へ結ぶ。元reviewed本文・accepted値をkernelへ採用せず、固定discardとfinallyで供給元の保持を外す。
- 同constructionの固定creatorがsource・初期workerの参照をfresh生成する。source／old role予約を生成より先に行い、kernel constructorで同source identityを対応付ける。旧未起動のabsenceには、private creatorが旧workerを作らず閉鎖した前提と同lease／contextの検査を要求する。callerのworker_stateだけを証拠にしない。
- 新generationのclaim占有前に同roleを予約し、frame／cleanup identity／sinkを出生時に結ぶ。metadata確保だけではcreating、startの固定生成点でcreatedとする。公開ticketを返す前のpost guard停止でも、private保持sinkとkernelの最小cleanup contextを残す。固定cleanupOwnedで一度だけ後処理でき、healthy routeは戻らない。
- kernelのfailはclear前に保持中のsource・旧frame・新frame／sinkを出生時bindingと照合する。照合checkpointは1回、通知も同ownerへ1回。外側拒否のnoticeとは分け、clear後catchだけではprotectedを作れない。first hardを固定し、後続失敗・cleanupで置換しない。
- 旧settleの終了／cleanupは、成功closure evidenceの発行を待たず、同lease／context検査後に個別factsとして保護する。終了だけ成功・cleanupだけ成功も失わない。sourceの閉鎖だけでcleanupをconfirmedにせず、新frameのcleanupだけでworker exitを発行しない。
- 新cleanupは元kernelが唯一のconsumer。同sink・frame・開始serialに関するvalidStartと開始状態の検査から、許された診断factだけを参照破棄前に派生する。foreign／copy／summary、beginなし、再消費、不正status、未起動not_requiredをconfirmedへ昇格しない。
- transport全件の集約issuerはないためUnknownを維持する。source cleanup・新workerの独立終了・実originも不足したまま。実予算・停止／deadline供給の保証へは昇格しない。上位slotは未受理で、上位移譲／最終discardは公開しない。

初期point7種、旧終了／cleanupの独立表9行、claim／start／issue／accept各2guard、未公開sink、source／old settle post guard、混入・取消・再入・二重操作・秘密非出力を新54件で確認した。guardからstopを同期呼出しする場合も未公開sinkと先行診断を保持する。固定fakeのno-verify continuationを使う範囲だけであり、実runの必要verifyを省略できるとはしない。C/G/Pの10／20／30は7初期pointとも変わらないことを確認した。

## 2 RED／初回失敗と変異対照

1. 最初の初期topology試験は未実装factoryで1件失敗。接続後に成功した。続く旧closure、未公開sink、source closeの試験も先に追加し、それぞれ未実装methodで失敗してから接続した。旧終了／cleanupを受理するために元成功条件を緩めていない。
2. 試験拡充の初回は、再入試験のcallbackを閉じる括弧が1つ不足し、Vitestが0 testsのparse error、tscが同箇所のTS1128で停止した。該当試験の構文だけを訂正し、53件・型・静的検査を再実行して成功した。製品・試験の期限は変更していない。
3. clear前checkpoint呼出しだけを無効にした変異では、初期source／old frame試験が通知0・current=null・protected=falseで失敗した（対象1件、他52件未実行）。同呼出しを復元した。
4. 未公開sinkがある場合のclear保持条件だけを除いた変異では、claim post guard停止後のcleanupOwnedが失敗した（対象1件、他52件未実行）。公開ticketを返せなかった生成責務を旧clearが落とすことを検出した。保持条件を復元し、変異を残さず全回帰を再実行した。

新entry専用linkがない旧kernelのclear・guard・sink条件は変更しない。旧APIを通す試験は維持した。binding_faultやOOM等の、外部注入口を持たない内部故障を任意注入する保証は今回に含めない。

## 3 最終検証

全て`bdo`経由。以下の終了コード0を確認した。

| 検証 | 結果 |
| --- | --- |
| `npm test -- --project unit tests/review/synthetic-*.test.ts`（shell展開） | 36 files・3,163 tests成功。新54件と旧FB-01／custody／kernel／accepted／seal等の合成回帰 |
| kernelと新旧試験4件のstrict `tsc --noEmit`（noUnusedLocals／noUnusedParameters、ES2022／ESNext／bundler／skipLibCheck） | 成功 |
| kernel・新試験・梱包監査scriptのESLint | 成功 |
| `npm run build` | 成功 |
| `node tests/review/package-http-classification.mjs` | 441 files。新factory／scope／private link marker非同梱、固定import、seeded runtime／I/O／clock／worker／漏出の負の対照と既存compiled合成試験成功 |
| `npm_config_offline=true node tests/review/package-worker.mjs`（既存cacheアクセス許可） | 441 files。production-only install・既存ローカルworker解析／集約・MCP fake dispatch・fixture境界成功 |

repository全体の試験・PDI E2Eは実行していない。梱包smokeは既存のローカル合成fixtureで、FB-02の実resource originや実通信の保証には数えない。ネットワークからの依存取得、設定／所有権変更は行っていない。

## 4 残課題・非成立条件

FB-03の同上位custodyへの未解決責務移譲・固定最終discard、停止／予算供給点と費目の連続検証は未実装。sourceと旧settleには新しいhard後実行口を作らず、未解決の最小frame対応を保持する。cleanup_pending=falseは消費可能sinkが残らない意味だけで、責務が解決したという証拠ではない。

実transport全件inventory、source cleanup、新世代の独立worker exit、実session／canonical予算・全work／heap／中断粒度・外側executor終了はUnknownのまま。固定role／通知／checkpoint数を全体work上界としない。元C/G/P・retry・210試行・全60秒の上限は変えていない。

正式発行口閉鎖・全体受付無効・調査保留を維持する。accepted採用・移譲先seal・実接続・実通信・実機操作・token／Permit／候補発行・設定変更・Pushは行っていない。

## 5 コミット対象だけの再検証

FB-02関連8ファイルだけをindexへ選び、HEAD＋indexの全ファイルを一時フォルダへ取り出して再検証した。依存は既存node_modulesを参照し、作業ツリーの未選択ファイルには依存していない。

同コピーでbuild、合成36ファイル／3,163件、対象strict型検査とESLint、梱包監査441 files、既存cacheを使うオフライン梱包smoke441 filesが全て成功した。cacheアクセス許可を用いたが、実通信・設定変更・Pushは行っていない。実行後の追記は本節だけで、検証済みコード・試験・梱包scriptは変更していない。
