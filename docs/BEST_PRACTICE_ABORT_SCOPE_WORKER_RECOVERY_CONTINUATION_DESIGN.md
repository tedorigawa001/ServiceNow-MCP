# SR-C後半の終了証拠とverifyと新世代readyの接続契約

Version: br006-worker-recovery-continuation-draft-0.10 / Date: 2026-11-02。
Status: **SC2-Aの証拠移譲・準備入力（§10）、SC2-Bの必要verify・fake会計（§11）、SC2-Cの終了証拠使用・合成新世代ready・別cleanup診断（§12）、SC2-Dの非実行plan封印・移譲境界（§13）を独立合成issuerで限定実装。正式binding・SR-Dは未実装で、人による正式bindingの承認未実施。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。**

基準HEADは`07e7631`。[soft回復claim設計](BEST_PRACTICE_ABORT_SCOPE_SOFT_RECOVERY_CLAIM_DESIGN.md)§6・7・14と[worker時刻設計](BEST_PRACTICE_ABORT_SCOPE_WORKER_TIME_BINDING_DESIGN.md)の差分として、旧世代終了後に同ownerのまま必要verifyと新世代readyへ進む内部境界を定める。既存の非実行consumerを回復権限へ昇格させず、通常WJ-C・runtime／実worker・実sourceを変更しない。

## 1 現行境界と変更する境界

| 現行根拠 | 現行の保証 | 接続に必要な差分 |
|---|---|---|
| [SR-C① issuer](../tests/support/review/synthetic-soft-recovery.ts) | 同ownerのclosureEvidenceを一度発行。未起動と終了確認済みを区別 | 未消費証拠をprivate継続へ移す入口を追加する |
| 同consumeWorkerClosure | 証拠を取り外し、authority:noneのdataを返してconsumedへ進む | 現行挙動を維持。返却値から再準備しない。新入口とは排他 |
| [SR-B値モデル](../tests/support/review/synthetic-phase-recovery.ts) | 選択集合／T_i／U、verifyのfake C/G/P、phase型の同世代維持／初回起動 | 値検査・verify会計の再利用を検討するが、worker型をphase型へ偽装して呼ばない |
| [既存adapter](../src/review/update-set-adapter.ts)のsoft分岐 | worker期限では旧close→未処理集合確定→必要verify→遅延CPU生成 | 固定順序を合成経路でも維持。既存productionは差し替えない |
| [WJ-B/C owner](../tests/support/review/synthetic-worker-time.ts) | 通常finishは未完了receiptを拒否。failでidentityを消す | 汎用fail後に別rootで再開しない。回復planの正式受付・E／集合比較はSR-Dへ残す |

本書の型・操作名は内部役割案で、SC2-Aの実在する合成APIだけを§10へ分離する。非実行dataを読み返す既存試験と、証拠を保持して先へ移譲する新試験は別経路にする。runtime APIとしては公開しない。

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
- **一般化と未保証の差**：実adapter（`update-set-adapter.ts`の解析ループ）は行ごとにT_iを採取して直ちに`await cpu().analyze`するため、worker期限の時点で未完了inputは処理中の1件だけで、そのT_iはUに等しい。本合成契約はWJ-Bの合成ownerがanalyze前に複数のinput receiptを受理できることに合わせて一般化しており、処理中以外の未完了inputや、処理中inputのT_iがUより小さい組合せも受理する。この「未完了は処理中の1件だけ・そのT_i=U」という実adapterの逐次順序は**未保証**であり、SC2-A〜Dの合成成功をその順序の証明に数えない。実供給元との接続時に別途検査を設計する。
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
| SC2-A（合成限定実装） | 同ownerの証拠移譲、HeldClosure、strict準備入力と不変集合 | 7発生点、処理中receiptの同一性、completed不変、T_i／U保持、二重移譲・公開data／別rootの拒否、全guard失効。verify／新世代は0。§10参照 |
| SC2-B（合成限定実装） | 必要verifyとprefixを引継ぐfake会計（§11） | 論理0／1・物理0〜4、C/G/Pの等号・超過、retryとchunkの二重計上拒否、旧終了前／verify中の起動0。継続エラーとhard失効を区別 |
| SC2-C（合成限定実装） | HeldClosureの一度の使用、新frame／ready、新cleanup診断slot（§12） | 旧世代終了後だけ起動1、未起動は初回1、旧応答・別frame・二重readyを拒否。全pre/post guard・起動後取消でもcleanup責務を保持 |
| SC2-D（合成限定実装） | 非実行planの封印と排他的な移譲境界（§13） | 集合追加／欠落・state昇格・U切下げを拒否。summaryからの再準備0。SR-Dへの実接続なしでprivate所有権と固定解放を確認 |

期待費目のoracleは実装のhelperを呼ばず、有限のイベント列から計数する。証拠移譲1と使用1、verify物理最大4、新起動最大1、ready受理最大1、finish実行0を区別する。成功・拒否・中断・再入を含め、旧SR-A／B／C①とWJ-A／B／通常WJ-Cを残す。配布物へissuer／fixture／scope／path／宣言／mapを含めず、I/O／clock／worker依存と混入の負の対照も維持する。

ローカルHTTP／子processを要する既存試験は待受可能な条件で検証する。制限環境のEPERMを製品の退行やテスト成功へ読み替えず、到達待ちとrunner終端の合流を維持する。[最新の回帰記録](E2E_BEST_PRACTICE_WORKER_CLOSURE_SRC1_2026-11-02.md)§8の10,845件成功は設計追加前の検証で、SC2-A〜Dの実装済み保証には数えない。

## 9 承認待ちと今回の非対象

最初の実装単位SC2-Aは未消費内部証拠の移譲と集合／時刻の検査に限定し、SC2-Bのfake verify、SC2-Cの新frame／readyイベント・新cleanup sinkを§11〜12へ分離した。SC2-Dの非実行plan境界は§13へ分離する。SR-Dの実finish／所有権移譲APIは未対応で別途設計・検証する。追加のlayout・work・allocation・実待機上限・全体費目上界はUnknownで、本番capや全体受付を導出しない。

人による本案の承認、実session／source／ReleasePermit・選択payload・worker jobの正式binding、runtime／実transport／実worker接続、WJ-CのE／全schema／結果公開、実cleanup・外側checkpoint、B-03 compiled保証は未実施。draft-0.1はMD設計のみ。draft-0.2のSC2-A限定実装は次節へ分離し、環境操作・実機操作・実通信・トークン発行・設定変更・permit発行・Pushの承認や実施とはしない。

## 10 SC2-Aの限定実装

基準HEADは`95121c2`。[既存合成issuer](../tests/support/review/synthetic-soft-recovery.ts)と[新しい純粋入力検査](../tests/support/review/synthetic-worker-recovery-input.ts)だけを接続した。HeldClosureはrootのprivate変数に、同じ発行済み証拠参照・pinnedな旧origin・検査済み入力を保持する。外部へ返すのは別brandのWorkerRecoveryPreparationだけで、証拠・入力・実行操作を外へ出さない。

prepareWorkerRecoveryは最初のguard前にpreparation開始claimを占有し、旧証拠slotを取り外す。strict入力検査で失敗した場合も証拠を返さない。HeldClosureの作成後、post-guardを通って初めてhandleを発行しworker_preparedへ進む。claim_startedは準備開始の事実、transfersはHeldClosure作成済み0／1を示す。post-guard失敗ではtransfers=1の診断を残すが、HeldClosure／handleは失効し、generation_usesは0のまま。

12列・各配列最大100件・32桁IDのstrict検査、完了集合の部分集合／重複、receiptの同一性、元O≤T_i≤U・単調順・最大T_i=Uを検査する。処理中receiptは旧facts.inputと同じ参照が一度だけ存在してretainedでなければならず、0 inputはO=Uでも拒否する。未処理はnot_processed／deadline_exceededへ確定し、reviewed／result_omittedには受理済みinputを要求する。collection／consistencyとC/G/P prefixをsnapshotし、課金・時計採取・verify呼出しは行わない。

rootの追加診断は集合件数・保持input件数・collection／consistency・C/G/P・claim／移譲／保持状態のscalarだけで、inputのID／UTC／receiptを公開しない。pure helperはpinned seed／factsを前提に値を検査して返すもので、証拠発行口ではない。直接の値検査試験を正式window／payload／WJ-B receipt保証に数えない。SR-Bのコードをworker型へ偽装して呼ばず、既存SR-B契約は変更していない。

SC2-Aの終了用にdiscardWorkerRecoveryPreparationを追加した。同handleを一度占有し、HeldClosureとhandleをpre-guard前に取り外して参照を破棄する。これは世代移行での証拠使用ではない。元ownerのS／L／O／Uは従来どおりnormal closeまたはterminal discardまで保持する。HeldClosure／handleが残るnormal closeはhard停止とし、握りつぶさない。取消・期限・混入・再入の失敗でも参照を同期破棄し、先行soft／hard・旧cleanup診断とscalar会計を保持する。

[合成試験](../tests/review/synthetic-worker-recovery-preparation.test.ts)117件（SC2-A初回。draft-0.3で追加したstatus検査を含む現行120件）。7発生点×prepare／固定discardの4 guardの取消を別の位置式で計数し、成功時の4 guard、移譲0／1、世代使用・verify・新世代がすべて0であることを確認する。元consumerとの排他・公開dataの拒否・他owner不変、入力混入／上限／時刻／不正getter、純粋な集合とreasonの保持を確認した。SC2-A自体はverify／起動／plan消費を追加しない。SC2-Bのverify接続は§11へ分離し、summaryの公開やSR-D接続は行わない。

配布物の関数／scope／path混入とI/O／clock／runtime依存を、負の対照付きの梱包監査へ追加する。実装・検証履歴は[SC2-A検証記録](E2E_BEST_PRACTICE_WORKER_RECOVERY_SC2A_2026-11-02.md)参照。実C/G/P writer・予約台帳・実cleanup・work／allocation上界はUnknown。正式発行口閉鎖・全体受付無効・調査保留を維持する。

draft-0.3の変更：§3に、準備入力が実adapterの逐次順序（未完了inputは処理中の1件だけ・そのT_i=U）より広い一般化であること、その順序が未保証であることを明記した。レビューで、処理中以外の未完了inputと非最新の処理中receiptが受理されることを確認したが、WJ-Bの合成ownerに合わせた一般化として維持する判断とした。collection_status／consistencyの不正値拒否の試験も追加した（§10の件数は検証記録参照）。

## 11 SC2-Bの限定実装

基準HEADは`e47bdf8`。同じissuerの`beginWorkerVerify(binding, preparation)`が、SC2-Aの同owner・同handle・保持中HeldClosureを要求し、最初のguard前に一度限りの開始claimを占有する。同じstrict入力snapshotのprefixとprivate verify継続の有無を、[worker専用の純粋ledger](../tests/support/review/synthetic-worker-recovery-verify.ts)へ渡す。元run／session／source／origin／budget／releaseと旧worker factsは毎pre/post guardで従来どおり再照合する。HeldClosureを世代使用せず、旧consumerへの戻し・新frame生成・finishを追加しない。

private verify継続がnullなら論理0・物理0でverifiedとなり、元consistencyをそのまま保持する。継続ありではparent→metadataを固定し、upstream_unavailableだけ各1回のretry待ちイベントを受ける。`workerVerifyAttempt`は元prefixのCが210未満のときだけ1を加え、opaque attemptを発行する。C枠なしならGET=0でunverified／request_budget_exceededを保持する。既存SR-Bと同じC→Gの検査順とし、C枠があってGが既に16MiBならCを増やさずhard停止する。retryは待ちイベントのみでC/G/Pを増やさず、再dispatch時だけCを加える。論理verifyは1、物理は最大4で、実final予約・実待機・予算の補充は行わない。

`workerVerifyChunk`は同pending attemptと一意な非Proxy chunk参照を要求し、safe integerのbyte数だけGへ課金する。同attemptの二重chunkは課金前に拒否する。response4MiB／累積16MiBを超すchunkも先に全量を加え、その値を保持してhard停止する。Pは元8MiB上限のsnapshotから一切増やさない。chunk参照は同attempt内のイベントidentityであり、body bytesや実readerから発行された証拠ではない。

`workerVerifyOutcome`はpending attemptをpre-guard前に取り外し、同じprivate receiptを一度だけsettleする。successはstrictなkind／changed、failureはstrictなkind／type／codeのみ。getter・Proxy・余分な列・非bounded・未知codeを拒否し、raw例外を診断へ残さない。継続対象の9codeと写像は§5のまま。全体取消・deadline_exceeded・受信上限・元run失効はhard停止する。changedはchanged_during_reviewとprovisional、unverifiedはconsistency_unverifiedを保持する。各attempt／chunk／retry／outcomeに同じpre/post guardを置く。post-guard失敗でも実施済みfake課金は消さない。

診断はworker_preparation.verifyに、必要性・論理回数・物理回数・retry数・stage・consistency・固定error／limitations・累積C/G/Pを示す。準備時のcollection／consistencyは元snapshotのまま、verify後のconsistencyはこの子診断で区別する。失敗時はattempt／chunk台帳／HeldClosure／handleを同期破棄し、固定scalar会計・先行soft・最初のhard・旧cleanup診断を保持する。正常discardもledgerを破棄して会計を保持するが、pending／settling／retry_wait中のdiscardは拒否する。保持中HeldClosureをnormal closeで隠すことも拒否する。

[合成試験](../tests/review/synthetic-worker-recovery-verify.test.ts)は実装helperを使わない有限イベント式から期待C/G/P・retryを求める。retryなし成功・最大4試行・枠途中消尽・等号／超過・混入／二重イベント・18箇所のguard取消を確認し、旧SR-BとSC2-Aの試験も維持する。SR-Bのrootやphase factsをworker factsへ偽装して再利用せず、既存phase modelは変更しない。重複するverify意味規則の追随は両系列の試験で確認する。梱包監査に関数／module混入とI/O／時計／worker依存の負の対照を追加した。[SC2-B検証記録](E2E_BEST_PRACTICE_WORKER_RECOVERY_SC2B_2026-11-02.md)参照。 レビュー修正で、非booleanのchange flagのhard停止と、文字列／Proxyのchunk identityの拒否を個別に確認する試験を追加した（89件）。

SC2-B自体は世代使用／新ready／新cleanupを追加しない。SC2-Cの合成接続は§12へ分離する。SC2-Dの合成plan封印は§13へ分離する。実canonical writer・final予約・実transport／worker・実選択順序・B-03 compiled保証は未対応。追加work／allocation・全体上界はUnknownで、全体受付を有効化しない。正式発行口閉鎖・調査保留を維持する。

draft-0.4のレビュー修正：SC2-B ledgerのsuccess結果のchange flagのboolean検査と、chunk identityのobject・非Proxy検査は、各判定を外す変異でも86件が通っていた。前者を外すと`changed:'no'`のような値がchangedとして扱われ、後者を外すとProxyのchunk identityで課金できる（文字列は`WeakSet`の型エラーで偶然止まるだけ）。3件の試験を追加し、§11の件数と親設計・soft回復claim設計・検証記録からの版数リンクを更新した。

## 12 SC2-Cの限定実装

基準HEADは`1d74bff`。同じ配布対象外issuer内で次の3段階に分けた。runtime moduleや実worker factoryを作らず、実会計・S／全L／O／U・集合／inputを追加取得・更新しない。

1. `claimWorkerGeneration(binding, preparation)`：同owner・未使用HeldClosureとverifyのverified状態を要求する。最初のguard前に元handle／HeldClosureを取り外し、一度限りの使用claimを占有する。generation_uses=1はこの占有で、起動成功ではない。workで元入力をprivateに移し、固定issuerが新supervisor／worker／generationを別々の新しいopaque参照として作る。別brandのstartと診断専用cleanupを返す。
2. `startWorkerGeneration(binding, start)`：startをpre-guard前に取り外す。新frameとcleanup contextの同一性を検査し、workで合成起動を1回計数、cleanupをnot_requiredからnot_startedへ変える。post-guard後に同frame用ready leaseを返す。起動前失敗はstarts=0、起動後失敗はstarts=1を保持する。
3. `issueWorkerGenerationReady`→`acceptWorkerGenerationReady`：同lease／frameのprivate継続が一度だけ発行したopaque eventを要求する。acceptはleaseとeventをpre-guard前に取り外す。別owner・旧証拠・copy・任意ready JSON・同数値idのanalyze応答を拒否する。post-guard後だけready_events=1となり、固定discard用の内部ready handleを返す。実workerのready観測やanalyze完了の証明ではない。

claim／startを分け、合成起動より先にcleanup sinkを渡す。claimのpost-guardまでに失敗した未公開ticketは、未起動なのでframe／sinkを破棄しnot_required診断だけ保持する。公開済みticketの後の取消・startup／ready失敗では実行用start／lease／event／入力を同期失効するが、同新frameの診断contextと事前発行sinkだけを保持する。`failWorkerGeneration`は同pending leaseを取り外し、worker_unavailable／cancelled／deadline_exceeded、または未知理由の固定拒否で停止する。別世代への再試行はない。

`recordWorkerGenerationCleanup(sink, status)`はrun guard／bindingを要求しない診断専用の一度限りsnapshotで、hard停止後も同sinkだけで報告できる。起動前はnot_requiredだけ、起動後はconfirmedだけが解放確認済み。not_started／requested／failed／unconfirmedは区別するが未確認のためhard停止し、不正値はunconfirmedに固定する。先行hardを上書きしない。旧closureのcomplete／旧cleanup sinkのconfirmedを流用しない。実terminate要求・OS終了・実resource解放の証拠ではない。

frame／入力やcleanup責務が残るnormal closeは拒否する。固定終了用の`discardWorkerGeneration`は同ready handle（起動前の中止は元start）を一度消費し（startは`startWorkerGeneration`の開始claimで同時に無効化し、起動後のframeを元startで破棄させない。readyへ至らない起動後frameはstartup／ready失敗またはhard停止で失効させ、cleanupは発行済みsinkで回収する）、cleanupがconfirmed／not_requiredかつsink消費済みの場合だけprivate入力／frameを破棄してconsumedへ進む。未確認cleanupをdiscardで隠せず、失敗後の遅延cleanup報告でも実行・discard能力は復活しない。元UTCは正常close／terminal discardまで保持する。

追加診断new_generationはclaim_started・starts・ready_events・cleanup状態／sink pendingというscalarのみ。frame・token・receipt・id・コード・raw例外を出さない。元soft・最初のhard・旧／新cleanupを分離し、C/G/Pを引き継ぐ。実待機時間・追加work／layout／allocation・全体上界はUnknownのまま。

[合成試験](../tests/review/synthetic-worker-recovery-generation.test.ts)128件（初回125件＋レビュー修正3件）で、7発生点、verify未完了、混入／二重使用、7×8位置のguard取消、旧／新cleanup分離、失敗後の診断回収と固定discardを確認する。期待するclaim／start／ready数はguard位置から独立に求める。梱包検査は全関数・brand文字列の漏出をseeded負の対照で拒否し、既存I/O／時計／worker参照監査も維持する。[SC2-C検証記録](E2E_BEST_PRACTICE_WORKER_RECOVERY_SC2C_2026-11-02.md)参照。

SC2-C自体はplanを作らない。非実行planの封印／移譲はSC2-D（§13）、実finish／E・候補消費はSR-Dへ残す。ready handleは実行可能planではなく、実session／source／ReleasePermit／worker jobへの正式binding、実worker／runtime接続・実通信、B-03 compiled保証は追加しない。正式発行口閉鎖・Unknown・全体受付無効・調査保留を維持する。

draft-0.6のレビュー修正：SC2-Cでは、(1) startup／ready失敗理由の限定、(2) 新frame用cleanup sinkへの再入拒否（busy判定）が、各判定を外す変異でも125件通っていた。(1)を外すと`access_denied`等がSR-Bで拡張したhard理由としてそのまま残り、(2)を外すとstartのguard内からsinkを記録でき、startも成功する。また、起動後も元startで固定discardでき、ready未受理のstarted frameがconsumedへ進んでいた。§12の「起動前の中止は元start」に合わせ、start開始claimでdiscard用のstart参照も無効化した（試験helperの実装修正）。3件の試験を追加し、§12の件数と親設計・soft回復claim設計・検証記録からの版数リンクを更新した。

## 13 SC2-Dの限定実装

基準HEADは`e0615e4`。同じ配布対象外issuer内で、SC2-Cの受理済み新世代readyからのみ封印する。追加で選択集合・input・日時・frameをraw入力させず、SC2-Aでstrict検査して凍結した同じ入力snapshotと、SC2-Bの同verify snapshotを使う。実finish／E／公開JSONの完成や実worker応答の証明ではない。

`sealWorkerRecoveryPlan(binding, ready)`は最初のguard前にseal開始claimを占有して元ready handleを取り外す。generation_ready・同handle・新frame／private入力・元S／全L／O／U・verified状態を要求する。workで同owner binding／pinned seed／新frame／入力／元time／verifyをprivateなSealedRecoveryPlanに凍結し、元generationのframe／入力slotを空にする。post-guard後だけ別brandのplan handleを発行する。sealsは内部作成数0／1であり、post-guard失敗でも作成済み1を保持してhandleと参照は失効させる。

封印後は次の分岐を排他にする。どちらも同plan slotとhandleをpre-guard前に取り外し、同owner／seed／元time、新世代starts=1／ready_events=1、pending cleanup contextの同frame（cleanup済みならconfirmed）を検査する。copy／JSON／inspect／summaryや別ownerからslotを生成・補充する口はない。

- `summarizeWorkerRecoveryPlan`はauthority:noneの凍結dataだけを返す。assetsは元選択順と完了state／reasonを保持し、未処理はnot_processed／deadline_exceededのまま。inputsはreceiptを除いたID／T_i／stateだけ、timeは元S／全L／O／U、会計・collection・consistency・固定errors／limitationsを保持する。元collection failedをcompleteへ、未実施verifyをstableへ昇格しない。summary発行数はpost-guard後だけ1となる。summaryからの再準備・seal・transferを許さない。
- `transferWorkerRecoveryPlan`は同じprivate planを同owner内の受取slotへ値移譲し、別brandのhandoffだけをpost-guard後に返す。transfersは内部移動数0／1で、post-guard失敗でも移動済み1を保持するが受取slot／handoffは失効する。受取側は`discardTransferredWorkerRecoveryPlan`による同handoffの一度限り消費と固定破棄だけで、実finishや任意callbackを実行しない。

summaryはframe・owner・seed・receipt・ReleasePermit・cleanup sinkを出さない。summaryへの変換後にも、元ownerの新世代cleanup診断slotは残る。受取slotも同じ新frameとcleanup責務へ結合し、cleanup未確認のdiscardは拒否する。旧cleanupで代替できず、late confirmedが失効済みplan／handoffを復活させることもない。未消費のsealed／transferred planやpending cleanupが残るnormal closeを拒否する。固定破棄と元のcleanup完了後だけ正常closeでUTCを破棄する。

全境界は元runのpre/post guard・同期失効を維持する。失敗はworker_plan段階の固定理由とし、sealed／transferred plan・handleを同期破棄しつつ、先行soft・最初のhard・新旧cleanup・C/G/P・元終端UTCを保持する。追加のworker_plan診断は件数・seal／transfer／summary数・slotのpending・finish_calls=0のみ。実行用identityやinput時刻をinspectへ追加しない。

[合成試験](../tests/review/synthetic-worker-recovery-plan.test.ts)78件で、1／3／100件の選択順、T_i／U、callerの集合追加／欠落／state変更／U切下げが凍結planへ入らないこと、summary編集・copy／別owner・branch replay・二重seal・二重消費の拒否を確認する。値の再入力を拒否する構造なので、今回新しく任意JSONのplan validatorを作るものではない。summary／transfer各6位置のguard取消は独立の位置式からseal／移動／発行数を求める。新cleanup・UTC・会計を保持し、旧試験を維持する。梱包監査に関数・brand・scope漏出の負の対照を追加した。[SC2-D検証記録](E2E_BEST_PRACTICE_WORKER_RECOVERY_SC2D_2026-11-02.md)参照。

このhandoffは同合成owner内の受取slotであり、SR-Dの実finishへ接続した証拠ではない。実session／ReleasePermit／payload／worker job binding、実finish／runtime、実cleanup・外側checkpoint、B-03 compiled保証・全費目上界は未対応。work／layout／allocationはUnknownで、本番capを導出しない。正式発行口閉鎖・全体受付無効・調査保留を維持する。次工程の[SR-D接続設計draft-0.8](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_SRD_DESIGN.md)で、不足するheader／reviewed期待context・同新frameのfinish専用台帳・E／集合比較・候補終端をMDに分離した。設計のみで、現handoffのfinish実行権限は増やしていない。
