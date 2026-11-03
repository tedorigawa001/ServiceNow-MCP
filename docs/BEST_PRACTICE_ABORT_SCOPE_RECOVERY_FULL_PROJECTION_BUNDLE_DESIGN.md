# D3前工程：full accepted projection一度限り受領・完成bundle結合

Version: br006-recovery-full-projection-bundle-draft-0.2 / Date: 2026-11-04。
設計初稿の基準HEAD: `dca4270`。Status: **FP-1のみ合成内実装済み、FP-2／FP-3は設計段階。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。seal成功・実接続・実通信・設定変更・Pushは行わない。**

実装追記（2026-11-04）：FP-1のfull受領内部型・固定継続・同期失効／全破棄だけを合成依存限定で実装した。[FP-1検証記録](E2E_BEST_PRACTICE_FULL_PROJECTION_RECEIPT_FP1_2026-11-04.md)を参照。FP-2／FP-3・完成bundle・seal成功は未実装、正式発行口閉鎖・全体受付無効・Unknown・調査保留は継続する。

draft-0.1のレビュー修正：FP-1の実装追記後も版が初稿のままだったため本版へ上げた。full受領modeでheader consumerを完了させない判定は、compiled fixtureのheader→full等の故障経路がfull側の消費数だけを見ていたため、外しても全試験が通過していた。各故障経路でheader側の完了消費数0も確認するよう補強した。kernelの挙動は変更していない。

[OB-03設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OB03_DESTINATION_CONTENT_DESIGN.md)§5〜7・11と[private header供給](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_ACCEPTED_HEADER_SUPPLY_DESIGN.md)の差分。[D2検証記録](E2E_BEST_PRACTICE_DESTINATION_PREPARATION_D2_2026-11-03.md)のcompiled再照合・clear漏れ負の対照を維持し、未公開準備slotを完成bundleやsealと取り違えない。

## 1 現行不足と採る境界

現行takeはaccept post-guardで受理した同projectionをprivate slotへ捕捉し、元accepted slotを消す。`consumeHeader`は同利用状態を先行消費してslotを外してから、同taken／projectionReceiptを検査し、header参照だけを渡す。D2の未公開destは同ownerとContentCheckedだけで、full投影の受領物・小型expectation・完成bundleはない。

**将来のfresh合成継続で、同take・同receiptの一つの消費をfull projection受領へ固定する。** 旧header-only経路は維持する。callerが用途・mode・headerかfullかを指定する引数、別sourceの登録口、汎用callbackや公開getterを追加しない。

header-onlyで消費した後の二度目の取得、claimの再arm、元accepted／handoff／routeの復元、summary・pins seed・別時点の投影からの再発行は禁止する。固定abort済みD2 rootのowner／ContentCheckedを次のrootへ移す方式も採らない。

## 2 同take・同claimの供給契約

名称・型は案であり未実装。新しい独立したfull用claimを追加してheaderと二重取得できるようにせず、既存projection slotの消費権を一つに保つ。

| 境界 | 固定する内容 |
| --- | --- |
| construction | header-onlyかfull-bundle準備かをprivate constructor継続で固定。既存DATA／guard契約から指定できない |
| take | 既存take claimを先行消費。同owner／accepted／pins／plan／window／live routeを検査し、同acceptedのprojection objectを同marker・projectionReceiptへ捕捉して元slotを外す |
| 一つの受領消費 | header-only／fullで共有する利用状態を先行消費し、元slotを外してから検査。誤経路・混入・再入・失効・失敗でもspentのまま |
| full受領物 | 同taken object／marker／projectionReceipt・元accepted handle・同projection object／snapshotを束ねた非export record。headerはこのsnapshotからだけ借用 |
| 利用 | 同pendingの固定保護scopeだけが使用。別のheader consumerを呼ばず、同snapshotをPD入力・投影比較・expectation生成へ供給 |

名称案`ReceivedAcceptedProjection`は同kernelの固定消費継続だけが発行する。raw snapshotを受け取るfactoryや外部receipt登録は作らない。利用可能ownerはkernel slotから同pendingへ移り、元slotは復元しない。

snapshot内のDATAは既存の検査・所有済みreadonly値を使用し、opaqueなowner／plan／frame／receipt等は**元参照**を維持する。全graphのstructuredClone／JSON化、live controllerのdeep freeze、新しい同値objectへの置換はしない。freezeや構造一致だけを発行元の根拠にしない。

## 3 受領物の検査と寿命

受領時・work後・post／利用直前で以下を分けて検査する。

- 発行元：同construction／private kernel、元taken object自体とmarker／projectionReceipt、acceptCount=1・routeSpent=true・transferred状態。full snapshotのplanが同takenのplanであること。
- static binding：同pins・plan／handoff・window、run／session／source／key／origin／budget／release、frame／ready origin・lease／event・cleanup identity／sink、元input／accepted outcomeの参照対応。
- dynamic binding：source open／close未開始、同cleanup未開始・未確定・serial=0、同rootのfirst hard／busy／再入poison、同budget identity・binding serial／失効serial。時刻S／O／T_i／Uと開始時点の全deadlineを変更しない。

動的失効を防ぐためsnapshotを「永続的に有効な証拠」とは扱わない。受領物は未受領→同pending保持→bundleへの一度限り所有移動、または失効／固定破棄となる。移動後の旧受領slotは利用不可で、summaryや元receiptから再取得できない。

破棄時はfull projection／snapshot／header参照と、一時比較結果・生成途中expectationをclear／payloadPending／isClearedへ含める。source／cleanupの最小終端責務はpayloadと分離し、snapshotに含まれるlive graphを上位cleanup capsuleへ閉じ込めない。

## 4 完成bundleの構成と未完成段階

既存D2のUnpublishedDestinationはowner＋checkだけである。これを名前やboolだけで完成へ昇格させず、段階ごとに必要物を固定する。

| 内部型案 | 必須保持物／成立段階 |
| --- | --- |
| BundlePartsDraft | work内の同pending／dest owner、ReceivedAcceptedProjection、D1 full draftと元row対応、Content候補・prefix候補、局所expectation候補。post前なので受理済みContentChecked／関係値を持つと偽らない |
| UnpublishedCompleteBundle | post再確認後だけ生成。同owner／pending・受領物、小型expectation＋全manifest／元本文、private ContentCheckedと同prefix関係値、全binding／serialを束ねる。まだ利用可能destではない |
| PreCommitBundle | 上の全構成と利用claimを固定検査済みの同owner内状態。実commit未実装の段階では固定破棄だけ可能。公開handle／getterや成功票を返さない |

bundleが必要とする具体的な構成を以下に固定する。

1. 同construction token・DestinationOwner identity／marker、元pending／taken／accepted origin・plan／handoffと同receiptへのprivate結合。
2. 同受領projectionとsnapshotの参照。header・selected／inputs／outcomes・run context／routeを、別の取得物から継ぎ足さない。
3. 同snapshotから作る小型expectation。bindingのaccepted_originは同takenの元handleを使い、owner／plan・frame・context・timeも同snapshot／pendingへ照合する。
4. D1の全mixed manifest／original_rowsと、同OwnedMixedSupplyのmodel／trace・row／一般row receipt・input receipt／元accepted outcomeの対応。D1のcopyを元originの代用品にしない。
5. 同ContentCheckedと同prefix関係値。いずれも同pending・model・header・budget／失効serial由来であり、値helperのmatchesやstandalone draftで置換しない。
6. 同budget identity／binding serial、失効serial、同source／cleanupと最小terminal責務への結合。後で関係者を探索・再登録する方式にしない。

小型expectationとfull本文は別保持物のまま一体にする。full本文を小型の262,144文字課金等の枠へ詰め込んだり、既存枠を広げたりしない。完成bundleも合成内の局所状態に限定し、既存content_evidenceのunknown／unverifiedを実wire証明へ書き換えない。

## 5 固定比較とprefix laneの対応

同planの再投影は同受領projectionとの再比較にだけ使い、originalの新規発行にはしない。[既存投影比較](../tests/support/review/synthetic-finish-context-values.ts)のopaque identity対応と値検査を維持し、placeholder routeや別参照を値一致で救済しない。再投影／再parseの費用も別計数する。

小型expectationは[既存値契約](../tests/support/review/synthetic-recovery-finish-values.ts)へ同snapshotを固定供給する。全metadataと時刻／集合／元receiptの既存検査を省略せず、prefix一致だけでfull header適合としない。full bodyの比較はD1＋同pendingのprivate ContentCheckedの責務であり、小型expectationの構造保証で代用しない。

| lane | bundleでの用途 |
| --- | --- |
| P0 | 元親prefix。元列・traceの起点として保持 |
| Pp | 親処理後の原順序prefix。D1 manifest.prefixのまま保持 |
| pins base | Ppを既存規則で変換したbase。PD関係検査用 |
| ordered final prefix | 同planの固定soft／verify delta適用後。後続OD-Cへ渡す原順序の期待値 |
| accepted canonical header | 同受領projectionのheaderと小型expectationに使用。ordered finalとの対応は同PD関係値で証明 |

D1のPpをcanonical headerやdelta後prefixで上書きしない。errors先頭100件・重複・切詰め警告、100／103・0.2／0.3の境界は既存契約を維持し、追加sort／dedup・切捨てでbundle不一致を救済しない。

## 6 生成・結合・消費の順序

1. fresh constructionで同dest owner・失敗slot・claim／保持slotを先に確保し、同takeで元accepted／内容をpendingへ移す。take／受領消費／準備claimは別責務だが、受領消費はheader／fullを共有する一つだけ。
2. pre guard後、同pendingを検査してfull受領物を一度得る。workで同snapshot由来の投影再比較・expectationと、同model由来のD1／PD候補を作り、BundlePartsDraftを非公開で保持する。
3. shape／limit／不一致は暫定保持し、post guardの取消・期限・先行hardを優先する。post通過後、受領物・同pending／owner・source／cleanup・budget／serialと全partsの対応を再確認する。
4. post後だけContentCheckedとprefix関係値を受理し、同ownerの固定継続が完成bundleへ結ぶ。新しいopaque証拠やbundleの確保／freezeに失敗してもまだ未公開のため、全破棄・成功0へ進む。
5. 全構成の確保後、必要な利用直前checkpointは**将来のcommit sectionへ入る前**に完了する。同じ停止／予算owner・全deadlineへ委譲し、時計や期限を再生成しない。checkpointの再入・失効・throwを固定処理する。
6. 同bundleの利用claimをroot側で一度消費し、同owner／bundle object／proof marker／binding・serialを固定検査する。現段階の実装計画は固定破棄／abortまでであり、commit可能状態や成功handleを公開しない。

既存PD-B(C) consumerは関係値を破棄する。新継続はその消費点を同bundleへの一度限り結合／固定消費へconstructor内で固定するのであり、旧consumer後にもう一度関係値を作らない。D2のContentCheckedも旧rootから借りず、同fresh取引で作る。

atomic commit自体は別工程・別指示待ち。将来の最終sectionでは解析・確保・freeze・callback／guard・I/Oを行わず、同payload責務を一つのdestへ移して、元pending利用権限を外し、dest利用可能状態を最後の線形化点とする。完成bundle生成やPreCommitBundle検査の成功だけでこのsectionを有効化しない。

## 7 失効・破棄と診断

pre／work／post／利用直前の停止、binding不一致・二重消費、source close／cleanup開始、hard／再入は、受領物・work parts・expectation・ContentChecked・prefix関係値・完成bundleと全一時参照を同期失効させる。slotを外してから検査するconsumerは失敗でもclaimを戻さない。

同rootのclear／kernelのpayloadPending／上位移譲前のisClearedに新slotを全て含める。保護scopeが終了し、payload参照がない場合だけ既存の本文破棄証拠へ進む。完成bundleがlocal変数・closure・未公開destに残る場合も「破棄済み」としない。物理消去やプロセス停止時の保証とは区別する。

上位custodyへ移すものはcleanup-only責務と固定診断だけで、full snapshot／manifest／pins／expectationを退避しない。first hard・cleanup診断・Unknownを維持し、header取得失敗を空projection、未完成bundleを空manifest、部分解放をconfirmedへ変換しない。

失敗理由は既存の取消／期限／内部エラーと固定stage分類へ写像し、raw例外・本文・ID・内部handleを出さない。staticなwork不適合はpostまで暫定に留め、post／利用直前の停止を失わない。将来commit後にhardが起きた場合もdestを失効し、元ownerへのrollback・再takeで救済しない。

## 8 費目と未導出事項

受領物自体がreadonly参照のmoveでも、opaque検査・identity照合・保持参照管理を無料としない。full投影の再検査、expectation copy、D1 full draftと元本文、PD各lane、未公開完成bundleの同時保持、post／利用直前検査・claim／clearを同private取引の追加費目として分ける。

元C/G/P・retry・210試行・全60秒と既存各asset／小型構造の枠は維持する。全work／heap・copyピーク・3round配賦・中断粒度・必要予約額はUnknownであり、参照移動の成功や局所usageを全体受付に使わない。full projectionは元reviewed全本文ではないため、両者の費目を混同しない。

## 9 検証条件と次の分割案

- 同accepted投影object・同taken／receipt／headerから一度だけ受領する。header-only後のfull要求、full後のheader要求、失敗後の再受領、別root／copy／summary・旧D2 ownerの採用を拒否する。
- 版・target・release／coverage・run context・時刻／全deadline・selected／inputs／outcomes・opaque identityを一つずつ変え、prefixだけ一致してもbundleが成立しないことを確認する。
- expectationだけ／full manifestだけ／ContentCheckedまたはprefix関係値欠落、別pending／owner／budget／serialのpartsを拒否。Pp・ordered final・canonicalの取り違えを負の対照にする。
- post前受理0、post停止・二重開始・swallowed再入で全破棄。利用直前checkpoint停止でも未公開のまま成功0を維持する。
- compiled graphの一時copyだけにfaultを注入し、受領後失効・proof差替え・serial違い・再消費・各slotのclear漏れが拒否されることを確認する。runtime friend／getterは追加しない。
- 旧header／D2固定abort・compiled試験を維持し、新経路の保証と分離する。配布除外・固定依存・秘密非出力とguard外assertionを確認する。

実装分割は、(FP-1、合成内実装済み) 同claimのfull受領内部型／固定継続と失効・破棄、(FP-2、未実装) 同snapshotのexpectationとBundlePartsDraft・全構成照合、(FP-3、未実装) post受理・未公開完成bundle／一度限り固定消費とcompiled保証。**全段階を合成依存・固定abortに限定し、実commit／seal成功は別の詳細検証・明示指示待ち**とする。初稿作成時は設計のみで、今回の実装／試験の範囲と結果は上記検証記録に分離する。
