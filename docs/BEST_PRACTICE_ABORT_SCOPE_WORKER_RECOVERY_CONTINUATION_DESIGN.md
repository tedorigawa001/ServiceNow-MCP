# SR-C後半の終了証拠とverifyと新世代readyの接続契約

Version: br006-worker-recovery-continuation-draft-0.1 / Date: 2026-11-02。
Status: **差分設計案。接続は未実装・人の承認未実施。合成issuerだけを次の実装対象とし、正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。**

基準HEADは`07e7631`。[soft回復claim設計](BEST_PRACTICE_ABORT_SCOPE_SOFT_RECOVERY_CLAIM_DESIGN.md)§6・7・14と[worker時刻設計](BEST_PRACTICE_ABORT_SCOPE_WORKER_TIME_BINDING_DESIGN.md)の差分として、旧世代終了後に同ownerのまま必要verifyと新世代readyへ進む内部境界を定める。既存の非実行consumerを回復権限へ昇格させず、通常WJ-C・runtime／実worker・実sourceを変更しない。

## 1 現行境界と変更する境界

| 現行根拠 | 現行の保証 | 接続に必要な差分 |
|---|---|---|
| [SR-C① issuer](../tests/support/review/synthetic-soft-recovery.ts) | 同ownerのclosureEvidenceを一度発行。未起動と終了確認済みを区別 | 未消費証拠をprivate継続へ移す入口を追加する |
| 同consumeWorkerClosure | 証拠を取り外し、authority:noneのdataを返してconsumedへ進む | 現行挙動を維持。返却値から再準備しない。新入口とは排他 |
| [SR-B値モデル](../tests/support/review/synthetic-phase-recovery.ts) | 選択集合／T_i／U、verifyのfake C/G/P、phase型の同世代維持／初回起動 | 値検査・verify会計の再利用を検討するが、worker型をphase型へ偽装して呼ばない |
| [既存adapter](../src/review/update-set-adapter.ts)のsoft分岐 | worker期限では旧close→未処理集合確定→必要verify→遅延CPU生成 | 固定順序を合成経路でも維持。既存productionは差し替えない |
| [WJ-B/C owner](../tests/support/review/synthetic-worker-time.ts) | 通常finishは未完了receiptを拒否。failでidentityを消す | 汎用fail後に別rootで再開しない。回復planの正式受付・E／集合比較はSR-Dへ残す |

本書の型・操作名は内部役割案であり、現在使えるAPIではない。非実行dataを読み返す既存試験と、証拠を保持して先へ移譲する新試験は別経路にする。

## 2 同ownerの証拠移譲

新しい準備入口案を`prepareWorkerRecovery(binding, closureEvidence, inputs)`とする。rootがworker_closedで、同rootの発行済み・未消費slotとhandleが一致する場合だけ受ける。最初のguard前に移譲claimを占有して元slotを取り外し、同じ証拠参照と封じた旧originをprivateなHeldClosureへ移す。検査／post-guardに失敗したら、元slotへ返さずhard停止する。

この**外部handleの移譲**と、verify後の**世代移行での証拠使用**を区別する。前者は所有権の一度の移動で、終了証拠の再発行ではない。HeldClosureは準備中・verify中に同owner内で保持し、後者の開始claimで一度使い切る。移譲1・世代移行claim1・fake起動0／1を別々に計数し、同じ終了確認を二度発行したと数えない。

検査対象は同run／session／source／key／origin／budget／release、元S／全L／O／U、旧supervisor／request／input、存在する旧worker／generation／jobまたはallocationとid。文字列id・日時・hashの一致だけでは通さない。copy handle・別owner・公開consumeWorkerClosure結果・inspect／cleanup診断・任意JSONからHeldClosureを作る口を設けない。既存consumeWorkerClosureを先に使えば準備不可で、移譲後に旧consumerへ戻すことも不可。

未起動はno_generation、startedはconfirmed termination＋complete cleanupの証拠を保持する。未確認・失敗・要求済みの旧終了からは準備へ進まず、未起動を終了済み世代と偽装しない。元seed／factsは毎guardで再照合し、失効したownerを再bindして復活させない。

## 3 準備入力と集合と時刻

合成準備入力は次のstrictな12列を案とする。raw factory・初回worker frame・任意の新世代id・権限boolは入力に含めない。

`source, budget, release, origin, window, verify, accounting, rows, completed, inputs, collection_status, consistency`

source／budget／release／originは元rootのpinned参照と同一。window・verify継続・input receiptは同構築のfake issuerが供給する非Proxyの参照とし、一度snapshotする。ここで実session／payloadの正式受領証拠ができるとは扱わない。

- rowsは重複なし最大100 ID。completedはその部分集合で、reviewed／rejected／result_omitted等のstate・reasonを保持する。reviewedのコード・findings本文をこのモデルへcopyしない。
- inputsはreceipt／update_xml_sys_id／retrieved_at／stateのstrictな4列。receiptとIDの重複・集合外を拒否する。処理中inputは旧facts.inputと同じreceiptが一度だけ存在し、未完了であることを要求する。存在しないjobや受領時刻を補わない。
- 未完了inputと未処理行はnot_processed／deadline_exceededへ一度確定する。処理中inputをcompleted／reviewed／result_omittedへ昇格させず、完了済みtargetへ二重追加しない。
- 受理済みT_iは未処理となっても保持し、O≤T_i≤U・元の受理順の単調性・最大T_i=Uを検査する。0 inputの値規則はO=Uだが、worker型は処理中inputを必要とするため0 inputからの回復準備は拒否する。
- S／全L／O／U・release contextは同rootのまま。新しいUTC採取、残時間からの全L再計算、Uの切下げ、metadata不完全からcollection completeへの昇格を禁止する。

入力の値検査・immutable copyはSR-Bと共通化できるが、元factsのkind／旧世代の扱いは共有しない。snapshot後のcaller側配列書換えはplanへ影響させず、元runのidentity／factsの変更はguardで停止する。現在のSR-Bの局所fake入力を実選択window／WJ-B receiptの証明へ昇格させない。

## 4 固定順序と一度限りの状態遷移

| 状態 | 許す処理 | 消費と失敗時停止 |
|---|---|---|
| worker_closed | 証拠と準備入力の一度の移譲 | 元証拠slotをguard前に取り外す。混入・再入・重複はhard停止 |
| recovery_prepared | 元guard後、必要verifyを開始 | HeldClosureを保持。analyze／payload取得／新T_i受理は禁止 |
| verifying | 親→metadataと既存retryのfakeイベント | pendingは1。継続対象エラーはunverified、hard失効は全能力を破棄 |
| verified | 世代移行claimを一度占有 | 元guardを通す。HeldClosureを一度使用し、起動前失敗でも返却しない |
| starting | 固定合成issuerの同新frameのreadyだけを受理 | 新起動1。旧ready／旧job応答・別frame・再起動を拒否 |
| ready_for_finish | privateな非実行回復planへ一度封印 | 新analyzeは許さない。実finish・WJ-Cとの接続はSR-D |
| failed／closed | 固定cleanup診断と終端データ破棄だけ | HTTP／ready／planの新発行と再準備を禁止 |

全操作は開始claim→元run pre-guard→固定処理→元run post-guard→公開の順とする。claimは失敗時も返さない。awaitを導入する将来の実境界では、戻った直後にも同guardを通し、保存したremainingだけで生存を決めない。phase枠切れと全体期限を区別し、全体取消・hard失効をsoftへ格下げしない。

## 5 必要verifyと単一のfake会計

worker期限型の元phaseはanalysisであり、callerの「consistency済み」boolではverifyを省略できない。同sourceのprivate継続があれば論理verifyを最大1回、なければGET=0として元のconsistencyを保持する。未実施をstableへ変更しない。

親→metadataの2 GET、upstream_unavailableだけ各最大1 retryで物理最大4試行。SR-Bの同じ意味規則を再利用する場合は共通の純粋なverify coreへ分け、worker factsをphase_deadlineへ書き換えてSR-Bのroot入口へ渡さない。旧SR-B試験を維持する。

| 費目 | 同じ予算での扱い |
|---|---|
| C | 元prefixを一度移譲。実施するfake attempt直前だけ1。上限210、未dispatch拒否0 |
| G | 同attemptの一意chunkを一度だけ課金。response4MiB・累積16MiB。上限超過chunkも課金してから停止 |
| P | prefix上限8MiBを保持。verifyでの追加0。payload再取得・再解析は禁止 |
| retry／予約 | 上記最大4試行は既存のfinal枠内。新しい予約・retry枠を足さず、fake待ちイベントだけを計数 |
| guard／slot／終了／ready | 移譲・使用・試行・成功を別イベントにする。具体的なwork／allocation上界は未導出 |

receive_budget_exceeded・取消・全体期限・元run失効・未知例外はhard停止し、新世代へ進めない。phase_deadline_exceeded（元run生存）／invalid_response／not_found_or_not_visible／authentication_failed／access_denied／upstream_unavailable／request_budget_exceeded／payload_budget_exceeded／candidate_filter_violationは、親設計§7の既存分類どおりunverifiedと固定errorを保持して継続する。invalid_responseはmetadata_unavailable、phase期限はdeadline_exceededへ写像し、raw例外を保持しない。changedはprovisionalとchanged_during_reviewを保持する。

fake accountingは元budget identityとprefixに結合した局所モデルであり、実canonical writer／ReleasePermit／最終再読予約へは接続しない。既存のsetPhaseReserveの再配賦を予算の再充填と扱わず、その実操作を新モデルから呼ばない。run停止後にも従来productionが部分集約を返す経路は初期範囲外のまま変更しない。

## 6 新世代readyとcleanupの所有権

世代移行claimはverify完了後だけ占有できる。claim占有後のpre-guard失敗では起動0、起動処理後のpost-guard失敗では試行1を残し、同じclaimを戻さない。新frameは同ownerの固定合成issuerだけが一度生成し、raw factory・inspect copyから作らない。readyイベントもそのissuerのprivate継続から同起動lease／frameへ結合する。任意のworker応答JSONをreadyの証拠へ変換しない。

- 旧no_generationなら初回0→1、旧世代があれば終了済み0→新1。旧世代との同時生存を許さない。
- 新supervisor／worker／generationは旧参照とは別に固定する。旧ready、旧／同数値idの遅延analyze応答を新frameへ採用しない。数値idを世代をまたぐ一意性の代替にしない。
- ready用leaseはguard前に一度取り外す。ready待ちの失敗・startup失敗・不正ready・全体期限・取消はhard停止し、別workerで再試行したり二回目のsoft回復へ入ったりしない。
- 新世代ではfinish専用routeだけを保持する。新analyze・input受理・旧allocationの再利用は0。readyをanalyze jobの完了と数えない。

新世代のcleanupは旧終了証拠やSR-Aの旧worker用snapshotとは別slotにする。起動claim時に新frameに結合した診断専用sinkを確保し、起動前ならnot_required、起動後は未開始／要求済み／確認済み／失敗／未確認を分ける。開始済みのfake終了・診断回収はhard停止後も先に発行したsinkだけで記録できるが、回復能力を復活させない。旧証拠のconfirmedで新世代の解放を代替しない。

ready後のprivate planは新frameとそのcleanup責務を同owner内で保持し、SR-Dの固定継続へ一度移譲するための境界とする。検査用にauthority:noneのsummaryを返す分岐と、private planを次へ渡す分岐は排他にする。summaryを次工程の入力にしない。未移譲の新frameや未確認cleanupをnormal closeで隠さない。合成のcleanup確認を実terminate・OS終了の証明へ使わない。

## 7 診断と失効と公開範囲

旧closureの事実、元soft、最初のhard、新世代cleanupを別slotにする。失敗時はHeldClosure・verify attempt・ready lease・planを同期失効し、固定scalar診断と元S／L／O／Uの終端データだけを保持する。固定discard／正常終端で参照とUTCを破棄する。cleanup診断sinkに限る停止後の記録は、run guardを飛ばして処理再開する仕組みではない。

inspectやsummaryへsource／token／コード本文／raw例外／worker参照／数値job idを出さない。追加の回復診断slotは、元point・種別・段階・集合件数・課金済みC/G/P・固定失敗理由・cleanup状態のscalarだけを示す。検査用summaryは集合とT_iを必要な範囲で保持できるが、authority:noneのdataに限り、実行能力のhandleを混ぜない。元ownerの終端UTC保持規則と既存の公開JSON／MCP定義・失敗codeは変更しない。

## 8 合成受入条件と段階分割

| 段階案 | 次に実装する範囲 | 必須の独立確認 |
|---|---|---|
| SC2-A | 同ownerの証拠移譲、HeldClosure、strict準備入力と不変集合 | 7発生点、処理中receiptの同一性、completed不変、T_i／U保持、二重移譲・公開data／別rootの拒否、全guard失効。verify／新世代は0 |
| SC2-B | 必要verifyとprefixを引継ぐfake会計 | 論理0／1・物理0〜4、C/G/Pの等号・超過、retryとchunkの二重計上拒否、旧終了前／verify中の起動0。継続エラーとhard失効を区別 |
| SC2-C | HeldClosureの一度の使用、新frame／ready、新cleanup診断slot | 旧世代終了後だけ起動1、未起動は初回1、旧応答・別frame・二重readyを拒否。全pre/post guard・起動後取消でもcleanup責務を保持 |
| SC2-D | 非実行planの封印と排他的な移譲境界 | 集合追加／欠落・state昇格・U切下げを拒否。summaryからの再準備0。SR-Dへの実接続なしでprivate所有権と固定解放を確認 |

期待費目のoracleは実装のhelperを呼ばず、有限のイベント列から計数する。証拠移譲1と使用1、verify物理最大4、新起動最大1、ready受理最大1、finish実行0を区別する。成功・拒否・中断・再入を含め、旧SR-A／B／C①とWJ-A／B／通常WJ-Cを残す。配布物へissuer／fixture／scope／path／宣言／mapを含めず、I/O／clock／worker依存と混入の負の対照も維持する。

ローカルHTTP／子processを要する既存試験は待受可能な条件で検証する。制限環境のEPERMを製品の退行やテスト成功へ読み替えず、到達待ちとrunner終端の合流を維持する。[最新の回帰記録](E2E_BEST_PRACTICE_WORKER_CLOSURE_SRC1_2026-11-02.md)§8の10,845件成功は設計追加前の検証で、SC2-A〜Dの実装済み保証には数えない。

## 9 承認待ちと今回の非対象

この案は、SC2-Aを最初の実装単位とし、未消費内部証拠の移譲と集合／時刻の検査までに限定する。新frame／readyイベントのprivate配置、新cleanup sinkとSR-Dの所有権移譲APIはSC2-C着手前に実コード配置と照合する。追加のlayout・work・allocation・実待機上限・全体費目上界はUnknownで、本番capや全体受付を導出しない。

人による本案の承認、実session／source／ReleasePermit・選択payload・worker jobの正式binding、runtime／実transport／実worker接続、WJ-CのE／全schema／結果公開、実cleanup・外側checkpoint、B-03 compiled保証は未実施。今回の作業はMD設計だけで、実装・環境操作・実機操作・実通信・トークン発行・設定変更・permit発行・Pushを行わない。
