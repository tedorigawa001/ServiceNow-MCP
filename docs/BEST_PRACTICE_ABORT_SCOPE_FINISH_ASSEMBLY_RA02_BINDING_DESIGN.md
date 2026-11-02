# RA-02③ 同handoff・route結合の接続差分設計

Version: br006-finish-assembly-binding-draft-0.10 / Date: 2026-11-02。
Status: **RB-A〜Dの結合・RA-02④-Aの発行・RA-03-A／Bの受理／固定discardまで合成限定実装。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

基準HEAD: `d263282`。[RD-A](BEST_PRACTICE_ABORT_SCOPE_FINISH_CONTEXT_RDA_DESIGN.md)§2〜5・10と[RA-02①②検証記録](E2E_BEST_PRACTICE_FINISH_ASSEMBLY_RA02_2026-11-02.md)に対する接続差分。実装・実接続・実通信・設定変更・実Permit投入の承認ではない。

## 1 現行コードから確定した不足

| 現行 | 接続時に不足する保証 |
|---|---|
| 新finish assemblyは独立したownerとreceiptをbind時に生成する | 既存SC2-D側のowner／seed／receiptとは別物。同じID・日時でも同一性を証明できない |
| SC2-DのtransferredPlanは旧issuerのclosure内、外にはopaque handoffだけ | finish側がsummaryやinspectからplanを復元してはならない。外部handoffを二つのownerへ登録する方式も不可 |
| acceptWorkerGenerationReadyはevent／leaseを一度消費する | ready受理の元identityを後続のprivate route用に保持していない。ready_events=1だけでは代替不可 |
| generationCleanupContext.startedはstartWorkerGenerationでtrueになる | これは**worker起動済み**の意味で、cleanup開始済みを表す値ではない。cleanup未開始の証拠へ読み替えない |
| recordWorkerGenerationCleanupは診断sinkの終端を記録する | cleanup要求の前に単調な開始claimを立てる独立境界とserialはない |
| finish側のRA-01検査用route／plan placeholderは破棄済み | 再生成してlive routeとして登録・復活させない |
| SourceLifecycleSlotがない | sourceが今openであるか、close開始後かをpinや公開counterから推定できない |

したがって、`attach(existingIssuer, binding, handoff)`、任意のgetter callbackでplanを読むfriend、raw receiptの後付け登録は採らない。先に同ownerの生成元を一つにする必要がある。

## 2 生成元と共通kernelの境界

採用する設計は、**tests配下のprivate共通recovery kernelを抽出し、legacy入口と新finish-capable入口がそれぞれ新しいrootを生成する方式**。実装配置・関数名は次工程で確定する。既存rootを新モードへ切り替えるAPIやglobal registryは作らない。

- 旧`createSyntheticSoftRecoveryIssuer(seed, facts, check)`の引数・戻りAPI・claim順序・summary／discard・診断を維持する。legacyのrootではfinish補助slotを生成せず、新しい発行口も見せない。
- 新しい合成finish-recovery入口は、新規rootの構築継続でのみpin・receipt ledgerとrecovery状態を一緒に作る。owner identity／busy／hard／check／timeを各一つにし、旧issuerを外からwrapして二重のguardを作らない。
- 現行RA-02①②のdata-only factory／bind／prepareと試験は維持する。既にbind済みのdata-only assemblyを新rootへ移行させない。共通化できるbounded pin処理はprivate kernelとして抽出するが、callerへpinやissuer setterを返さない。
- 新入口の構築データは合成descriptorのみ。元receipt、run／source／window／release参照、active input、元worker refsを内部で一度生成し、recovery seed／factsとfinish ledgerの両方が同じ参照を使う。既存の外部owner／receipt／frameを受け取らない。
- active inputは同ledgerの一件に結び、not_processedとして保持する。最新receiptとは限らない既存SC2-Aの許容を維持する。Uは全retained inputから確認し、activeのT_iで置き換えない。
- immutable reviewed fixture pinは合成構築の前提であり、実WJ-Bのanalyze受理証拠ではない。元analyzeのcapture hookや実結果の由来は引き続きUnknown。新入口の合成保証を実sessionへ昇格しない。

private kernelをruntime／srcへ移さず、実classや実sessionの登録台帳を共有しない。new rootの構築失敗は返却前に参照を破棄し、固定診断だけを残す。private kernelのexportが必要な場合も、既存ownerを引数で受ける再登録口にはしない。

## 3 同handoffとの一度限りの結合

新root内の固定継続で、SC2-Dの同transferredPlan・handoff slotとfinish補助slotを読む。raw header／結果／plan、caller callback、summaryを受け取らない。引数にbinding／handoffを使う場合も、同closureが発行して未消費のidentityに完全一致することを必須にする。

`unused → checking → bound`の結合claimは最初の外部guardより前に消費する。失敗はfailedで終端化し、slot・claimを戻さない。成功してもhandoffの受取slot自体は保持し、RA-03の原子的受理まで二重消費しない。RA-02④のissue開始claimとRA-03のaccept／route利用claimは別に残す。

検査順は次の固定順序とする。

1. 同ownerのbusy／hard・元guardを確認し、binding／handoff identity・未消費状態を確認。
2. 同planのowner／seed／time、source／budget／release／origin／window identityを、同構築のpinと比較。
3. selectedの順序・全outcome state／reason・receipt別ID／T_i／state・期待context・reviewed／omitted起源を照合。欠損をheaderやsummaryで補完しない。
4. 同verify後のcollection／consistencyと必要limitations／errorsを固定継続で合流。pin済みheader基礎値を応答で置換せず、必要制限を消さない。limitations上限超過は拒否。errors打切りは既存規則を維持し、元の型付き事実はprivateに保持。
5. §4の同source open・同新frame ready・cleanup未開始を検査。
6. 同guardと同live状態をpost側で再検査し、その後だけprivateな結合済み状態を確定。inspectへは固定状態と件数だけを出す。

RA-01の返却projectionは通常containerをcopyしており、元frame identityを持つhandle graphの代替ではない。比較用graphは同kernelの元private参照から組み立て、projection値やsummaryから再構成しない。ローカルのshape・文字量・node枠は維持し、比較で二入力を扱う場合もRA-01の共通枠をリセットしない。

## 4 live routeのprivate状態

| slot | 発行・更新元 | 無効化 |
|---|---|---|
| SourceLifecycleSlot | 同root構築のfake open。元source identityに固定 | close開始を依存呼出しより前にclosingへ更新。closed／failedからopenへ戻さない |
| ReadyOriginSlot | 同lease／eventのaccept後、post-guard受理継続で保持するprivate identityと新frame | cleanup開始・hard・closeで利用不可。公開ready handleやcounterのcopyから作らない |
| NewCleanupLifecycle | 同新frame／診断sinkに固定。cleanup_started=false、serial=0 | cleanup要求開始claimでtrue／1へ単調更新。worker起動のstartedとは別変数。診断confirmedでも0へ戻さない |
| BoundFinishRouteSlot | 同plan／handoff、上記source／ready／cleanup originsへのprivate参照 | いずれか失効で結合を無効化。古いsnapshotで再受理しない |

cleanup要求の開始境界は、終了recordだけでなく要求処理そのものの前に必要。診断sinkは発行済みならhard後も結果回収に使えるが、live routeや正常cleanup能力へ昇格しない。旧世代のcleanup confirmedで新frameの責務を免除しない。

RA-02③はroute利用claimを消費せず、証拠handleも返さない。結合後にcleanup／source closeが始まれば結合状態を失効させる。RA-02④でissueする時とRA-03でacceptする時にも同live条件を再検査し、今回の結合成功を将来までの生存証明にしない。

## 5 停止・解放・互換性

最初のhard code／stageを保持し、pin／handoff／bound route等の実行に転用できるprivate参照を失効させる。元soft・verify・旧cleanup・新cleanup・source終端は診断軸を分ける。取得済み診断sinkは固定回収責務へ残し、参照破棄だけを正常cleanupと呼ばない。

legacyのsummary／固定discardは維持する。summaryを選んだplan、消費済みhandoff、cleanup済みframeを新routeへ戻さない。新rootの結合後にsummary／discardとの競合を検出した場合も、片方だけが消費できる同台帳で停止する。通常closeは未消費handoff／cleanup責務を隠さない。

新analyze／input／HTTP／finish／E採取は0。S／全L／O／T_i／UとC/G/P・retry prefixを変更・再課金しない。生成・pin・照合・guard・失効・破棄の局所workは別費目で計数し、既存の会計値が不変という理由で追加workを0としない。exact layout／allocation・全体work上界・本番capはUnknownのまま。

## 6 実装順と受入条件

| 分割案 | 次に確認する範囲 |
|---|---|
| RB-A（生成境界実装済み） | 共通kernelの生成境界抽出。旧API／全旧試験とRA-02①②を維持し、新入口はまだpin／handoff／routeを受理しない。各rootのowner／guard／claim独立、後付け登録なし |
| RB-B（合成供給・既存準備まで実装） | 新しい固定入口構築で同receipt／source／window／releaseとpinを供給。元active receipt・selected／T_i／U・元state、異なる構築の混入を拒否。verify／新世代／route／handoffは未接続 |
| RB-C（合成限定実装済み） | ready受理origin、source lifecycle、cleanup開始serialを同rootへ追加。worker起動とcleanup開始、guard再入・取消・失効を区別。handoff／finish能力なし |
| RB-D（合成限定実装済み） | 同handoffの一度限り結合。pre/post照合と競合・失敗後再利用拒否。証拠発行は引き続き0。§11参照 |

必須の負の対照：別root／copy binding／copy handoff／summary／RA-01 value／RA-02①②の準備binding、同値だが別receipt・source・frame、selected追加／欠落／順序変更、T_i／U書換え、reviewed起源欠損、verify由来の制限削除を拒否する。他rootは不変であることを確認する。

ready_events=1でもcleanup開始済み、source closing／closed／failed、発行済み診断sink消費後なら拒否する。worker起動済み・cleanup未開始の正常例を対照に置き、二種類のstartedを混同する変異を検出する。依存が再入例外をcatchしてもpost-guardでhardが勝ち、失敗後にslotを復元できないことを確認する。

配布物では新kernel／入口／brand／scope／宣言／mapの非同梱と、runtime root・I/O／clock／worker依存の負の対照を継続する。共通kernel試験と既存class／実session保証を混同しない。全体合成回帰・build・strict型検査・lint・梱包確認を各分割で行う。

## 7 承認・未確認事項

draft-0.1の生成境界案は§8〜11のRB-A〜Dを実装した。後続RA-02④-A／RA-03-A／Bの合成issue／accept／discardは別設計§9〜11参照。実verify接続・finish処理と費目別上界は未対応。既存APIsを緩める可変modeや任意hookを追加しない。

RA-02④-Aの発行とRA-03-A／Bの受理／固定discardは後続工程で合成実装した。RD-B以降のE／finish／候補・正常cleanup能力は未実装の別工程。正式発行口閉鎖・全体受付無効・調査保留を維持する。

RB-D後の[発行・RA-03受理接続差分draft-0.6](BEST_PRACTICE_ABORT_SCOPE_FINISH_ISSUE_ACCEPT_DESIGN.md)で、同kernelの発行・受理・固定discardと同期失効を合成限定実装した。受理後の終端専用slotは、両方の固定完了受領情報とともにRA-03-Bで一度だけ消費し、未解放をnormal closeで隠さない。§8〜11の発行0という記述はRB-A〜D段階の履歴であり、結合だけで発行しない条件は維持する。

## 8 RB-A実装範囲

基準HEADは`3787799`。`tests/support/review/synthetic-recovery-kernel.ts`へ旧issuer本体を機械移動した。旧本体と比較して先頭comment・factory名以外は同一で、`synthetic-soft-recovery.ts`は同じ引数／default／戻りAPI・型exportを保つ薄いlegacy入口とした。旧試験は変更しない。RA-02①②のdata-only assemblyも変更せず、既にbind済みのrootを新モードへ移行する口は追加しない。

新規`createSyntheticFinishRecoveryRoot`は、strictな`kind=synthetic_finish_recovery_root_v1, time, point`の3項目だけを受ける閉鎖facade。timeは24文字ms精度のS／O／Uと1〜60000の全L、pointは既存worker_deadlineの固定7variant。worker_state、supervisor／worker／generation／request／active input等はpointから内部生成し、caller owner／seed／facts／receipt／frameを受けない。O＝Uを含む既存UTC条件は共通kernelで維持する。

facadeは新しいkernelを一つだけ生成し、binding／guard／busy／hard／claimの別台帳を持たない。bind・observeは内部の固定seed／factsを渡すだけで、余分な引数を拒否する。出力binding／observation／recoveryは新入口専用の静的brandに分けるが、元kernelが発行した同一objectを使い、二つ目のruntime handleを作らない。混入拒否は元kernel内のidentity検査で行う。

公開する操作はbind／observe／claimRecovery／consumeRecovery／revoke／close／inspectだけ。consumeは既存のauthority:none消費結果であり、finishや新世代を開始しない。旧kernelの残りの操作やcore・seed・factsを返さない。失敗／close後はfacadeの構築materialも参照を外し、固定診断だけを残す。guardは各操作で元kernelのpre／postだけが動き、inspectはguardを実行しない。

新入口のinspectは元state・claim開始・固定診断・permissionsとroute_bound=false／evidence_issues=0に限定し、元kernelのtime／identityを返さない。RB-Aの小さなdescriptor pinは、RA-02①②のheader／receipt ledgerとの接続ではない。active inputとselected／T_i／U・期待contextを同構築で供給する本体はRB-B、live routeはRB-C、handoff結合はRB-Dへ残す。

[RB-A検証記録](E2E_BEST_PRACTICE_FINISH_RECOVERY_ROOT_RBA_2026-11-02.md)参照。局所の構築／inspect／破棄にもwork・allocationは必要であり、会計更新なしを費用0の証明にしない。全体work／layout／allocationはUnknown、実session／実worker保証・本番capや全体受付には昇格しない。

## 9 RB-B実装範囲・同pin供給

基準HEADは`e0c19a2`。既存legacy kernel／RB-A入口は変更しない。新しい固定入口`createSyntheticPinnedRecoveryRoot`をtests配下へ分け、既に存在するRB-A／data-only assemblyを切り替えたり登録したりしない。data-only assemblyから純粋なbounded pin生成だけを`synthetic-finish-pins.ts`へ抽出し、元APIと状態機械・post-guard commitを維持する。

新入口のdescriptorはstrictな6項目：`kind=synthetic_pinned_recovery_root_v1, point, active_input_sys_id, accounting, consistency, finish`。finishは既存RA-02のstrict seed。timeを別途申告させず同pinのS／全L／O／Uを使う。pointは既存7variant、accountingは同C/G/P prefixの合成値（C≤210、G≤16777216、P≤8388608）、consistencyはstable_observation／changed／unverified。後から変更するsetterはない。

共通pin生成は新しいrun／session／source／key／origin／budget／release／windowとreceiptを内部で一度作る。RA-01値検査用owner／plan／routeのscaffoldingは検査だけに使い、live証拠にはしない。data-only assemblyのbindingや既存rootを引数で受け取らず、構築データだけから生成する。

| 供給先 | 同構築で固定するもの |
|---|---|
| recovery seed | pinのrun／session／source／key／origin／budget／releaseを同参照で使用。S／全L／O／Uも同値 |
| facts.input | active_input_sys_idが指す同ledgerの未完了receipt。completed／不存在は拒否し、新receiptを作らない |
| SC2-A input context | source／budget／release／origin／windowは同pin参照。verifyはこの段階では明示null |
| rows／completed／inputs | 同selected順、元outcome state／reason、全receipt／ID／T_i／stateを使用。SC2-Aへはcompleted／retainedへ固定写像し、reviewed期待context・omission起源は元private pinに残す |
| accounting／collection／consistency | 構築時のprefixと同header collection.status、同構築consistencyを使用。ここで再課金・新観測・verify結果の捏造をしない |

固定supplierはsource／budget／release／originのseedとpinの参照一致、window、selected配列、active receipt、全inputのreceipt／ID／T_i／stateを構築時に検査する。既存SC2-Aも元seedとsource等・active receipt・selected・時刻を再検査する。**SC2-A自体はwindowを元pinと比較するAPIではない**ので、その部分は同immutable構築と固定supplierの明示照合で保証する。外からwindowを渡して登録できるようにする解決策は採らない。

公開操作はbind／observe／claimRecovery、`prepareWorkerRecovery(binding, recovery, closureEvent)`、固定discard、revoke／close／inspectだけ。prepareでは同recovery claimを既存kernelのbeginWorkerClosureで一度消費し、厳密なtermination／cleanupだけのfake eventを内部factsに結ぶ。起動済み旧世代は両方confirmed／completeが必要、未起動はnot_required／not_requiredだけ。既存の合成closure証拠は内部で一時使用し、外へは返さない。その後、同immutable inputを既存prepareWorkerRecoveryへ供給する。元kernelの3操作のpre／postを使い、別のbusy／hard／guard ownerを作らない。

返すのは同kernelの非実行preparation handleに新入口専用の静的brandを付けたものだけ。FinishContextEvidenceではない。binding／recovery／preparationの混入・copy・重複を元kernelで拒否し、prepareの余分な引数によるsource／window／release／receipt／callbackの差込みも拒否する。raw例外・失敗後のmaterialは破棄し、最初のhard code／stageと旧closureの未確認診断を保持する。

未処理inputが複数でも、activeは同ledgerの一件だけに結ぶ。activeが最新でなくてもUは全inputの最大のまま。受理済みreviewed pinは同期待contextを保持し、omitted起源の有無も元ledgerから変えない。元analyzeのpost-guardやfull結果の由来を証明したとはしない。

preparationがheldのまま正常closeすることは禁止。成功後は同handleの固定discardを一度行ってからdata-only closeへ進む。これは元source正常close／新frame cleanup能力の発行ではない。失敗時に参照を落とすことも、未確認の旧termination／cleanupを成功へ変えない。

inspectは元の固定診断・pin件数・準備件数／prefix／stateだけで、ID／UTC／receipt／期待context／release値やpinを返さない。route_bound=false、evidence_issues=0を維持。guard取消・期限切れ・再入・生成失敗後には同rootを再bind／再準備できない。

費目：descriptor読取、共有pinのbounded copy／RA-01検査、fixed supplierの最大100行照合、SC2-Aの再検査、元kernelのguard、inspect／失効／discardは各々work／allocationを要する。C/G/Pは構築prefixを継承するだけで新規計上しないが、それをwork費用0とは呼ばない。全体work／layout／allocation・本番capはUnknown。RB-Bの成功は本試行の実取得・実解析成績ではない。

[RB-B検証記録](E2E_BEST_PRACTICE_PINNED_RECOVERY_ROOT_RBB_2026-11-02.md)を参照。RB-B段階で残した新世代ready・合成source lifecycle・cleanup開始serialは次節のRB-Cで実装した。verify後のheader／limitations／errors合流、handoff／route結合、finish証拠発行は引き続き未接続。

## 10 RB-C：同rootの合成lifecycle

基準HEADは`c7d5961`。共通kernelの内部構築関数を使い、legacy／RB-Aには従来面だけを返す固定factory、pinned rootにはlifecycleを持つ新規構築factoryを用意した。tracked設定はprivateな構築時定数であり、既存rootやownerを渡す切替API・可変modeではない。旧factoryの操作面とinspect型（lifecycle欄／source_lifecycle phaseを含めない）は維持する。

source slotは同seed.sourceと新しいprivate lifecycle identityを持ち、同kernelのbinding／busy／hard／guardで保護する。状態はopen→closing→closed、または失敗時failedで、openへ戻す操作はない。beginSourceCloseのclaimでclosing／close_startedを**最初の外部guardより前**に固定し、ready originを落とす。settleSourceCloseはclosedだけを正常受理し、failed／不正値はhard停止する。観測されたfake終端はsource_completionに別保存し、後続cleanup失敗やpost-guard取消でsourceがfailedになっても診断を失わない。source_completionは生存・正常close能力ではない。単なるroot.closeで参照を破棄した場合はcompletion=noneのまま。

新しい合成generationのclaim時に、同frame／cleanup sinkと別private cleanup identityを作る。callerにはcleanup sinkをworker起動より先に渡す。worker起動は既存generationCleanupContext.started／worker_startedだけを更新し、cleanup_started=false・serial=0を維持する。実workerや新HTTPは起動しない。

ready eventは同leaseの固定継続内で内部生成・受理する。**受理post-guardの後**にだけ、同owner／新frame／元lease・event／source lifecycle identity／cleanup identityを保持するprivate ReadyOriginを作る。ready_eventsという履歴数値から復元しない。checkRecoveryReadyは同ready handleとprivate origin・source open・cleanup未開始を再検査してvoidを返すだけで、証拠・route利用claimは発行しない。

| 操作 | 同root内の固定責務 |
|---|---|
| claimRecoveryGeneration | 同preparationのverifyなし継続を既存kernelで確定し、新frameのstart／cleanupを一度発行。既存guardを使い、会計prefixを増やさない |
| startRecoveryGeneration | 同startだけを一度消費。worker_startedとcleanup_startedを分離。post失敗時も事前配布sinkで診断回収可能 |
| acceptRecoveryReady | 同leaseのissue→acceptを固定接続。外部event／frame／originは登録せず、post前にoriginを見せない |
| beginRecoveryCleanup | 同未消費sink／frameの開始claimを一度消費しserial=1、ready originを即失効。元runがhardでも許す**cleanup-only境界**で、健康なrun guardは呼ばない |
| recordRecoveryCleanup | 開始claim済みの同sinkだけを一度終端化。開始前confirmed、混入、重複、未確認を正常扱いしない。hard後の確認は診断だけ |
| discardRecoveryGeneration | cleanup確認後の同start／readyに対する固定discard。cleanup開始後のready handleは生存証拠ではなく、残る場合もdiscard専用 |
| begin／settleSourceClose | 同bindingで単調に閉鎖。closing以降は新generation／readyなどを拒否し、固定discard／cleanup／closeだけを残す |

cleanup_startedは開始claimの消費事実であり、要求処理完了やcleanup確認の意味ではない。serialは0→1の一度限りで巻き戻さない。busy中の再入ではclaimを消費して失効したうえでhard停止し、readyを後からcommitしない。診断statusがnot_startedのままでも、消費済みserialを0へ戻さない。

recordが先行した場合はsinkを終端化してunconfirmed・hard停止し、後からbegin／confirmedを足して救済しない。hard後は発行済みsinkのbegin／recordだけを固定回収に使える。source／readyは復活せず、先行hard code／stageを保持する。旧世代のcleanup結果と新frameのcleanupは別slotのまま。

public inspectはsource状態／completion・開始flag・serial・ready_origin有無／ready_usableと既存診断だけ。identity／frame／元event／lease／source値を出さない。ready_usableは合成診断であり、公開JSONやFinishContextEvidenceへ昇格する口はない。route_bound=false／evidence_issues=0を維持する。

各通常操作は同kernelのpre／post guardを共有し、source閉鎖・cleanup開始・hardで同期失効する。例外はhard後も必要なcleanup-only claim／診断終端だけで、認証・新処理・正常実行を許す例外ではない。全体60秒を延長せず、S／L／O／T_i／U・会計prefix・retryを再計算しない。fixtureのcheckで取消／期限切れを合成するだけで、実経過時間やOS終了は保証しない。

費目は定数個のlifecycle／origin参照生成、通常guard、開始claim、診断・失効・破棄。これらのwork／allocationは未導出で、会計不変を費用0とはしない。全体work／layout／allocation・本番capはUnknown。旧class／実sessionの生存を証明したものではない。

[RB-C検証記録](E2E_BEST_PRACTICE_RECOVERY_LIFECYCLE_RBC_2026-11-02.md)参照。後続RB-Dの結合は§11。issue／accept・finish／E・正常source／cleanup能力は引き続き未実装。

draft-0.4のレビュー修正（RB-C）：通常closeは、source closeを開始してsettleしていない状態（closing）でも成功し、`clear()`がsourceを一律`closed`にしていた。未確定のsource closeが正常closeに見えるため、source closing中の通常closeを拒否する（試験helperの実装修正）。source closeを一度も開始しない通常closeは`closed`の表示を維持し、`source_close_started=false`・`source_completion=none`で区別する。

## 11 RB-Dの合成限定実装

同constructorで生成したimmutable pinをkernelへ渡し、元planとそのprivate receiver slotのhandoff、同owner／source／frame／ready origin／cleanup identityを固定照合する。利用側がraw header・結果・置換pin・別routeを登録する口は作らない。`bindRecoveryPlan`はpre guard前に開始claimを消費し、workとpost guardの後だけboundを公開する。再入・競合・二重開始・混入・失敗後再利用はhard停止し、最初の診断を保持する。

純粋な値projectionは由来の証拠ではない。seedの7参照、S／L／O／U、元receipt／集合／T_i／completed、verify事実と会計prefixを比較し、RA-01の共有bounded projectionで一度検査する。元frameはprojectionのコピーに置き換えず保持する。limitationsは固定合流後100件を超えれば拒否し、errorsは既存100件上限・切詰めmarkerを維持する。現在の公開合成準備経路はverify=nullであり、実verifyや観測UTC採取は接続しない。

source close開始・新cleanup開始は即座にbound参照を失効させる。診断の`route_bound`は合成private結合の状態だけで、permissionsは全てfalse、evidence_issues=0を維持する。handoffの発行／受理claimは未実装。固定discardだけが元receiverを消費でき、同sourceのclose完了と新cleanup確認の両方を要求する。正常finish能力は発行しない。hard後のcleanup診断は回復権限を復元しない。

収集・比較は100件以内の固定集合と一度の共有projectionに限定するが、追加guard・参照保持・合流・破棄のwork／allocation上界は未導出。C/G/P prefixの不変を費用0とはしない。Unknown・全体受付無効を維持する。legacy factoryとlifecycle専用factoryには新API／診断型を公開しない。

[RB-D検証記録](E2E_BEST_PRACTICE_RECOVERY_PLAN_BINDING_RBD_2026-11-02.md)参照。
