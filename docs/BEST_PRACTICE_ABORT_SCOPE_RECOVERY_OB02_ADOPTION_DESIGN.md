# OB-02 同pins保持・identity統一とprivate採用／移譲claim

Version: br006-recovery-ob02-adoption-draft-0.6 / Date: 2026-11-03。
Status: **NB-01／02とNB-03の一度限りtake・固定abort・破棄証拠／同上位custody連結まで合成実装。内容比較・移譲先seal成功・正常終端は未接続。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

初版の基準HEAD: `8126d10`。[OD-B設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_ODB_TRANSFER_DESIGN.md)§2〜7・10と[FB接続設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FAILURE_BINDING_DESIGN.md)§12からの差分。FB-03の失敗責務保存を維持したまま、正常系で同pins・元内容を保持し、同private kernelのaccepted／planと一度だけ結ぶ。現行の合成実装範囲は§10〜12に示し、移譲先seal成功を実装済みとは扱わない。

## 1 現状と接続上の相違

| 現在の境界 | 確認した実装 | 本設計で必要な差分 |
| --- | --- | --- |
| [OB-01供給core](../tests/support/review/synthetic-recovery-kernel.ts) | 一つのpins・元列・行／input対応を準備し、同handleのdiscardで破棄する | 新正常系だけにprivateな所有権moveを設け、prepare成功をeager discardしない |
| [FB-02／03生成](../tests/support/review/synthetic-recovery-kernel.ts) | 元supplyをdiscardし、別のfresh seed／window、finish pinsなしのkernelを生成する | 同pins由来のcontextを全経路へ渡し、正常内容を同ownerが保持する |
| [pins生成](../tests/support/review/synthetic-finish-pins.ts) | run／session／source／key／origin／budget／release／windowを一度生成する | この同生成呼出しを新正常系identityの唯一の起点とする |
| [plan投影](../tests/support/review/synthetic-finish-plan-binding.ts) | window以外の7 refs（run／session／source／key／origin／budget／release）・時刻・input receipt／state・行数の一致を要求する。plan viewのseedはwindowを持たず、windowは比較しない | IDや値一致で後から異なるseed／pinsを接着しない |
| 既存accepted／seal | accepted受理でplan／handoff等の元live slotを消費し、accepted内のbound snapshotへ移す | 同snapshotとCompletedMixedContentを同じprivate移譲claimに結ぶ |

新しい閉鎖合成constructionを用意し、旧FB-01／02／03、OD-A、NR-C、pins公開factoryの契約は維持する。既存root／prepared／accepted／plan／pins／budgetを引数に採用するfactory、登録台帳、upgrade、body getterは追加しない。共有するのはprivate生成継続と既存pure検査であり、独立した成功handleを二つ作って連結する方式ではない。

## 2 identityの唯一の発行元

### 2.1 pins起点の生成方針

新正常系は既存`createSyntheticFinishPins`を同private生成継続から一度だけ呼び、その返却値の`seed.run_context`をidentityの唯一の起点とする。別seedをopaque refsで再生成しない。既存pins APIにcaller identityを渡す引数や公開bind関数を増やさない。

1. DATAを見る前にconstruction token、FailureOwner／上位slot、resource slot、正常内容slot、各生成claim、未結合の予算shellを確保する。
2. OB-01と同じstrict DATA・局所上限・行対応を検査し、pins生成claimを先に占有する。同呼出しから返ったpins参照だけをprivate generation slotへ保持する。
3. 全行の生成／消費とprepare post guardが成立した場合だけ、同token・生成serial=1・同pins参照に結合したPinsBirthReceiptを内部発行する。途中停止ならpins／元内容を破棄し、生成claimを戻さない。
4. §3の正常所有権moveが成功する同期commitで、同BirthReceiptを消費し、NormalPinBindingと予算bindingを確定する。その前にsource／workerを生成しない。

BirthReceiptは周囲の固定生成ownerが発行するもので、pinsの型適合／凍結／summaryだけから作れない。別呼出しのpins、RA投影のplaceholder owner／plan／frame／routeは採用しない。receiptはexportせず、任意の純粋検査結果を発行証拠へ昇格する口も作らない。

### 2.2 同じrefsと時刻の供給

kernel seedのrun／session／source／key／origin／budget／releaseは同pins contextの各参照をそのまま使う。回復inputのsource／origin／budget／release／windowも同context由来とし、windowを別生成しない。active inputは同pins receipt列から選び、対応するprivate行のinputと同じ参照であることを確認する。

S／O／U・各T_i・全deadlineは同pins値を維持する。seed用recordの生成は許すが、そのopaque refsをコピー・再発行しない。source参照はこの段階では合成context metadataに過ぎず、source lifecycle identity・worker frame・ready originは後の固定creator／kernelの実際の合成生成点から別途結ぶ。pins投影の仮routeをlive証拠へ使わない。

### 2.3 先行予算shellとの結合

新正常系だけは`unbound → bound`のprivate予算binding型を使う。先行shellはidentityを別生成せず、同BirthReceiptから得たpins.budgetへ一度結ぶ。これは外部budgetの後付け登録ではなく、同constructor内の唯一の発行結果の消費である。

unboundではidentity／C/G/P prefix／時刻は未結合として保持し、ゼロ予算やabsenceの証拠にしない。boundでは同token・pins generation・同budget参照・binding serial=1と元C/G/P／開始UTC／全deadlineを固定し、失敗後もunboundへ戻さない。source生成、正常採用、失敗capsuleのcommit／最終discardは、同ownerが保持するこのbinding状態とserialを照合する。未結合のまま失敗した場合も、同ownerの未結合証拠を使ってUnknownの責務を保存する。

既存FB-03の先行固定identityや`fb03-fake-events-v1`は変更・再解釈しない。新正常系のbinding／費目modelは別契約とし、旧62イベントoracleを流用しない。実canonical予算leaseの供給や本番cap承認ではない。

## 3 正常系の所有権と一度限りmove

旧standalone prepared値の消費口は引き続きdiscardだけとする。新正常系は、同moduleのprivate供給coreに限定したmoveを使い、外部のprepared handleを受け取らない。

moveは同token・自分のprepare handle／BirthReceipt・元slot・全行完了を照合し、専用move claimを占有して元held／prepared／bridgeを取外す。PendingNormalSupplyへ一時所有を移し、pre／post guardと元値再検査を通す。成功commitでNormalOwnedSupply、NormalPinBinding、予算bindingを同時に確定し、一時slotを外す。失敗時に元slotへ戻さず、全一時payloadをfinallyで破棄する。commit区間にcaller callback／awaitは置かない。

同一owner内のread-only参照共有は許すが、内容の利用権限は一つの状態で選択する。kernelのpins参照を独立した内容ownerとして扱わない。pinsの二重生成や元DATAの再parseで失った参照を再構成しない。

| 状態 | 内容／acceptedの利用権限 | 終端時の扱い |
| --- | --- | --- |
| prepared_supply | 元供給slot。新正常系用handleはprivate | moveまたは固定破棄を一度だけ行う |
| normal_owned | NormalOwnedSupplyが元本文・行表・pins・原順序prefixを所有。kernelは同pinsを参照 | 失効で全payload参照を外す |
| adoption_ready | 内容はnormal slot、acceptedは同kernel slotが唯一の所有元。採用ticketは非所有の結合記録 | どちらかの失効でticketも無効 |
| pending_transfer | 同claimが両元slotを同時に取り外し、一つのpendingへ所有を移す | 復元せず、同保護scopeでcommitまたは破棄 |
| dest_sealed（OB-03） | 一つのdest slotだけが内容・expectationを利用可能 | source close／cleanup／hardで同期失効 |
| terminal_only／hard_draining | payload利用権限なし。最小終端証拠またはFailureOwnerの責務だけ | 正常discardと失敗custodyを混同しない |

元reviewed本文、親省略の元reviewed、非reviewed、retained末尾を同じ列で保持する。parent omittedの元accepted-outcome／receiptは維持し、元worker omittedはnullのまま。元reviewed=0と、出力reviewed件数だけが0の状態を混同しない。既存1〜100行・active retained input必須・0.3制約・局所capを維持する。

## 4 private型・発行前提

名称は案。§10〜12でNB-01内部型とCompletedMixedContent／BoundAdoption／PendingBoundTransfer／PayloadClearedReceiptを実装した。移譲先の正常seal／終了証拠は未実装のままとする。

| 型案 | 同生成元へ結ぶもの | 消費規則 |
| --- | --- | --- |
| PinsBirthReceipt | token、生成claim／serial、返却pins参照 | 正常moveが一度消費。summaryから発行不可 |
| NormalPinBinding | 同pins／context、行origin、予算binding状態、停止owner | normal constructionだけが確定。外部へ返さない |
| NormalOwnedSupply | 元列／元reviewed本文、行表、同pins、原prefix／親trace | 内容owner selectorに従う。破棄後の再準備不可 |
| CompletedMixedContent | 同行表の全生成／消費完了、7種partition、同receipt対応、同prefix | 固定controllerの最終post guard後だけ発行 |
| BoundAdoption | 上記binding／完了serial、元accepted slot／serial、同plan／handoff・live route snapshot | 非所有の結合ticket。一度準備し、移譲または失効で消費 |
| PendingBoundTransfer | 移動済みacceptedと内容、同origin、元route snapshot | 一つのtransfer claimが所有。外へ返さず復元しない |
| PayloadClearedReceipt | 同token／所有世代・失効serialと全既知payload slotの論理破棄完了 | 失敗capsule移譲前のprivate照合に使用。物理消去証拠ではない |

CompletedMixedContentは、OB-01の同private行表と生成／消費stateを検査して発行する。OD-Aの公開CompletedMixedPrefixや完了件数から作らず、別OD-A factoryでrow／receiptを再生成して接着しない。既存pure分類／prefix検査を共有しても、発行claimは正常constructionだけが持つ。

## 5 同kernelのaccepted／planへのprivate採用

NormalOwnedSupply／CompletedMixedContentが揃った後、同pinsをfinish pinsとしてprivate kernel生成へ渡す。別rootの公開finish kernelを作って後から登録しない。同正常系が生成したseed／input／source lifecycle／frameを使い、旧世代終了→必要なverify→新世代ready→plan／handoff→context発行→accepted受理の既存順序を維持する。

初期実装範囲は既存FBの固定no-verify合成profileまでとする案。verify不要はその限定profileの前提であり、callerのbool／任意pointerでは指定しない。実runで必要なverifyの代替証拠にはせず、未対応profileを勝手にnullへ変換しない。

採用claimは同ownerで一度占有し、次をpre／postで照合する。

- 同construction token、pins参照、normal binding、同row／input／元accepted-outcomeの参照と全selectedの一意完全対応。
- 同seed contextの7refs＋window、S／O／U／T_i／全deadline、同budget binding serialと停止owner。
- 同private kernelの実際のaccepted slot、acceptCount=1／routeSpent=true、同plan objectと元handoff。
- 同frame／worker／generation／supervisor、同ready origin・元lease／event、同open source lifecycle。
- 同cleanup identity／sink、未開始・未確定・serial=0。既存のready／source／cleanup検査を迂回しない。
- 全mixed行が同controllerで完了し、未消費slot・別prefix・別移譲が残らないこと。

accepted受理後は元のtransferredPlan／handoffHandle／finishBoundが消費済みなので、acceptedが保持するbound snapshotを照合する。消費済みhandoffを再bindしたり、routeSpentをunusedへ戻したりしない。

BoundAdoptionはbodyの新しい所有者や二つ目のaccepted handleではない。内容とacceptedは移譲claimまで各自の元slotに一つずつ残り、ticketはそのslot／世代を結ぶだけ。採用成功をfull本文比較・prefix意味一致・sealed expectation・finish job・候補発行へ昇格しない。

## 6 一つの移譲claimとOB-03への境界

新正常系の固定seal操作案を`sealBoundMixedExpectation()`とし、同owner内のprivate採用ticketから元accepted／contentを選ぶ。外部accepted・manifest・pins・plan・binding・移譲先ownerを指定する引数は作らず、余分な引数は拒否する。旧factoryのbinding／accepted handleを受けるAPIは変更しない。新入口を既存handleの登録口にはしない。

1. busy／first hard／状態を検査し、transfer claimを占有する。失敗・余分な引数・再入でもclaimを戻さない。
2. 同acceptedとCompletedMixedContentを両元slotから同時に取り外す。BoundAdoptionも消費し、一つのPendingBoundTransferへ移す。段階的なpublic successは返さない。
3. pre guard後、同pins・元行・acceptedのbound snapshot・元plan／handoff・live routeを再検査する。workのshape／binding不一致は一時結果に留める。
4. post guardで停止・失効serial・再入を検査し、その後にwork不一致を固定失敗へ確定する。postのcancelled／deadline_exceededの優先順位を維持する。
5. OB-03でのみ、一つのdest slotへexpectation＋内容＋同originを同期commitし、pendingを外す。失敗時は両元／pending／一時値を破棄し、未公開destと移譲成功0を維持する。

OB-02だけの実装段階では、claim／takeと固定破棄までを非実行試験で確認し、保護scope外へpendingを出さない。dest未実装のままseal成功票や利用可能handleを返さない。既存`sealRecoveryFinishExpectation`を先に成功させ、後から別content transferを足す方式は禁止する。必要な共通化は同moduleの固定private seal継続に限定し、汎用content callbackを追加しない。

## 7 失効・失敗・診断保持

source close／cleanup開始はnormal／adoption／pending／destの利用権限を同期失効させる。元本文・行表・prefix／trace・pinsのpayload側参照を全て外す。正常acceptedTerminationの最小source／frame／sink等は別管理し、同source closed＋同cleanup confirmed後だけ既存の正常固定discardへ進める。dest失効でacceptedやtransfer claimを復活させない。

hard時の順序は、first hard確定→新規claim閉鎖→出生時RoleBinding／cleanup-onlyの保護→normal／pending／destとkernelのpayload参照破棄→busy解除→固定失敗callerとする。既存kernel clearだけでは外側NormalOwnedSupplyを消せないため、同保護区間の固定正常owner失効処理を必須にする。caller callbackによる破棄に委ねない。通知の不成立でもfinallyで全既知payload slotを外し、一時movingも残さない。

PayloadClearedReceiptは論理slotを外した後だけ発行し、失敗capsuleの移譲前に同token／世代・失効serialを照合する。FailureOwner／upperへ本文・pins・accepted projection・prefixを退避しない。最小cleanup capsuleがnormal payloadを閉じ込めたまま渡らないことも確認する。論理破棄を確認できなければ診断faultを保持し、受理・元owner最終discardを成功にせず、localの未解決責務を残す。OOMやJS heap物理消去は保証しない。

失敗後はFB-03と同じ一つのcustody holderにcleanup-onlyを限定する。commit前はlocal、同上位受理後はupperだけが操作し、元ownerの最終discardは同receiptを要求する。source cleanup・新worker exit・transport全件の不足はUnknownのまま。hard後に通常source close／accepted正常discardを通したり、解放confirmedへ補完したりしない。

上位診断は固定stage／reason、最初のcode、生成・採用・移譲・破棄件数、payload_pendingの有無と役割別終端だけ。raw例外・本文・行ID・prefix／trace・内部handleは出さない。詳細stageを既存prepare／transfer／cleanup／internalへ明示写像し、取消・期限を保持し、未知値／例外は内部エラーに固定する。guardが内側拒否を握り潰しても共通poison／失効serialで外側を止める。

## 8 prefix・費目・未確定事項

normal ownerは原順序の親prefixと同pins header、同plan.verify／投影を別々に保持する。RAのsort済みheaderから原順序を復元しない。OB-02の採用は同origin／所有権の確認に限定し、prefix変換関係を未確認のままseal成功へ進めない。

OB-03前に[OD-B設計§4](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_ODB_TRANSFER_DESIGN.md)の固定soft／verify delta、first-occurrence dedup／sort、100／103境界・errors99／100の写像を独立表へ固定する。現在の局所cap超過は既存どおり拒否し、追加切捨て・救済dedup・上限拡張をしない。

| 費目 | 所有者／寿命 |
| --- | --- |
| 原DATA・元列・pins一度生成・BirthReceipt | 固定供給owner。moveまたは失敗まで |
| 正常move・identity／予算binding | 正常construction。claim時の元slot取外しとcommit／finally |
| 元本文・行表・prefix／親trace | normal／pending／destの唯一の利用owner。失効時に全aliasを論理破棄 |
| plan再投影・採用検査・snapshot | 同private kernel／採用区間。重複copyを無料化しない |
| transfer claim・pending・dest予約／再照合 | 固定移譲owner。公開前の一時重複も別計上 |
| payload破棄・最小終端・上位custody | 固定終了owner。payloadを上位へ移さず未解決を保持 |

総保持量・投影copyピーク・work／heap上界・中断粒度の数値は未導出。新しい総量capや本番layoutを承認済みとしない。元210試行・C/G/P・retry・全60秒は維持し、再取得／再finish／再parseでidentityの欠落を救済しない。将来の費目modelは正常系追加分を別IDと独立oracleで検証し、FB-03の既存modelは不変とする。

## 9 実装分割案と受入条件

| 分割案 | 最初の範囲 | まだ開かないもの |
| --- | --- | --- |
| NB-01 | 正常supply move・PinsBirthReceipt・同pins由来identity／未結合予算shellの内部契約 | accepted・transfer・dest |
| NB-02 | 同pins kernel継続・CompletedMixedContent・private BoundAdoption | 内容比較・dest seal |
| NB-03 | 一度限りtake・PendingBoundTransfer・固定破棄／失敗診断と同custodyへの接続 | seal成功・finish job・候補 |
| OB-03前工程 | prefix／固定delta・費目とcopy寿命の詳細化 | 全体受付・本番cap |

合成受入では、pins生成1回・同refs／receipt／元accepted-outcome、二重move／adoption／transfer・旧handle／copy／summary／余分fieldの拒否、停止後の再利用不可を確認する。privateなorigin比較の負の対照を実authorityへ昇格せず、試験のために公開登録口やruntime共有friendを作らない。

mixed各種・親省略・元omitted・全retained・真の元reviewedゼロ、0.2／0.3、上限境界を独立表へ照合する。各pre／work／postの取消・期限・throw・swallowed再入、source／cleanup失効でpayload参照0・dest成功0・先行診断保持を確認する。失敗capsuleに本文が残らず、上位受理／元discard前後でcleanup ownerが一つであることを連続検証する。

旧factory／試験・非同梱marker・固定import・runtime／I/O／clock／worker／秘密漏出の負の対照を維持する。正常sealの成功・正常terminal-only discardの全連続保証はOB-03で別途検証する。

draft-0.2のレビュー修正：§1のplan投影行は「上記refs」をwindowまで含む全8 refsの一致と読めたが、[plan投影](../tests/support/review/synthetic-finish-plan-binding.ts)はseedからwindowを除いた7 refs・時刻・input receipt／state・行数だけを比較する。windowは§5の採用検査で別に照合する必要があるため、記述を実装どおりに訂正した。設計判断・型案・分割案は変更しない。

draft-0.1／0.2はMDのみ。次節のNB-01追加後も、実接続・実通信・実機操作・token／Permit／候補発行・設定変更・Pushは行わない。

## 10 NB-01の実装と残る境界

[合成normal root](../tests/support/review/synthetic-recovery-kernel.ts)に`createSyntheticNormalOwnedSupply`を追加した。constructorはFailureOwner／上位slot・claim・未結合予算slotをDATA検査前に確保する。旧OB-01 coreのprivate生成継続だけがprepare post guard後に同token・serial=1・同pins／元所有物のPinsBirthReceiptを発行し、公開prepared handleは新rootから返さない。

`prepare()`→`move()`は引数なし。move claimは一度占有し、同private channelから元held／prepared／bridgeとbirthを取り外して局所pendingへ移す。既存の行／input／元accepted-outcome検査と、同contextの8 refs・active receipt・S/O/U／全deadlineを確認し、post guard後の同期commitで正常所有物・NormalPinBinding・同budget参照／serialを一緒に保持する。再生成seed／windowや外部pins登録口は設けない。上位planがwindowを検査済みとは扱わない。

取消・期限・throw・unknown guard・swallowed再入・重複／余分引数はclaimを復元せず、局所pendingをfinallyで外す。source close／cleanup開始・固定discardも元supplyと正常payloadの参照を同期破棄する。成功済み予算bindingは解除せず、元C/G/P・開始UTC・全deadlineと最初の固定診断を保持する。未結合ならaccounting／時刻はnullのままで、0やabsenceに補完しない。FailureOwnerの4roleはUnknownのまま、本文・pinsをcapsuleへ渡さない。

NB-01 rootのdiscardはresourceを生成しないpayload破棄だけであり、source解放・worker exit・accepted正常終端の証拠ではない。kernel生成とprivate採用は後続§11のNB-02、FailureOwnerの上位移譲／最終discard・PayloadClearedReceiptは§12のNB-03で追加した。費目model／全work・heap上界と実予算leaseは未導出。旧FB-03の固定identity・62イベントoracle・公開APIは不変。

[NB-01検証記録](E2E_BEST_PRACTICE_NORMAL_SUPPLY_NB01_2026-11-03.md)に、RED/GREEN・混合／0.3／100行・停止と一度限り消費・旧合成回帰・オフライン梱包を記録する。TDDは同rootの動作を検査し、runtime内部を公開するfriendや試験用登録口を追加しない。

## 11 NB-02 同pins kernel・完了内容・private採用

`createSyntheticNormalAdoptionRoot`を別fresh合成入口として追加した。既存NB-01は同private coreのbase facadeだけを返し、追加操作を持たない。新rootも外部root／pins／owner／accepted／planを登録・採用するfactoryではない。

`prepare()`→`move()`後の`startKernel()`は一度だけ。既存の全行対応検査を再実行し、同token／owned／pinsのCompletedMixedContentはcontent post guard後だけ確定する。同contextの7 refsをseedへ、windowを回復準備入力へ直接供給し、active inputも元receiptを使う。別seed／window・行receipt・pinsを再生成しない。source／旧世代／新世代の合成生成点とclear前保護は既存FailureKernelLinkへ結ぶ。

旧終了→必要verify（この範囲は固定no-verify合成profileのみ）→同新世代readyの既存順序を通す。start／ready／cleanupは同kernelのopaque値だけを消費する。`adopt()`は引数なしの一度限りclaimで、内部のplan／handoff→同pinsのbinding→合成context発行→accepted受理を行う。既存の非実行plan封印は内部準備段階として使用するが、finish expectation／移譲先sealの成功は0であり、その入口を公開しない。

privateなNormalAcceptedChannelは同kernel constructorだけが作り、実際のaccepted slot・消費済みroute・同plan／handoff・live source／frame／ready／cleanup未開始serial=0を検査する。plan純粋投影が比較しないwindowも、実準備入力contextと同pinsの参照一致で別途確認する。post guard後に同viewを再確認し、同CompletedMixedContentとBoundAdoptionを保持する。ticketは非所有のslot結合であり、本文／acceptedの第二所有者、再利用handle、summaryからの昇格口ではない。

source close／同cleanup開始は正常内容・completion／adoptionとkernel内のpins／expectation側参照を同期失効させる。ready／元slotは復元しない。kernel生成後の公開normal discardは拒否し、解放証拠にしない。hardは既存linkのclear前保護・固定通知と結び、本文を渡さず最初の診断・結合済み予算・未解決cleanup責務を残す。失敗時の上位移譲／fake cleanup、PendingBoundTransfer／PayloadClearedReceiptは後続§12で追加したが、正常終端と実cleanupは未接続。

新操作はguard付き合成依存のみで、実verify・worker・transport／clock・認証sessionを接続しない。追加投影／検査／保持費目・copyピークの全上界はUnknownであり、全体受付や本番capを有効化しない。[NB-02検証記録](E2E_BEST_PRACTICE_NORMAL_ADOPTION_NB02_2026-11-03.md)で旧API回帰・混入・重複・失効・負の対照を確認する。

draft-0.5のレビュー修正：NB-02初版のroot `fail()`は、kernel生成後に`kernel.revoke`を先に呼んでからcustodyへroot段階のhardを記録していた。revoke経由のkernel失敗通知が`revoke`→`internal`の写像で先にslotを占有するため、root自身が検出した停止・不一致（closureのkernel checkpoint、adoption pre等）が全てstage=`internal`となり、§7が求める`prepare`／`transfer`／`cleanup`への明示写像が失われていた。rootの失敗はrevoke前に同rootのstageでslotを占有するよう修正した。kernelやsupplyが自ら検出した失敗は従来どおり先に各自のphase由来のstageで占有し、通知は1回のまま。他の契約・型・分割案は変更しない。

## 12 NB-03 一度限りtake・固定abort・失敗custody

`createSyntheticNormalTransferRoot`を別fresh合成入口として追加。旧NB-01／02の公開操作は増やさない。新`abortBoundTransfer()`は引数なしの非実行試験口であり、将来の`sealBoundMixedExpectation()`を開くものではない。専用claimを一度占有し、同kernelのprivate takeで実accepted slotを外し、同完了内容・採用ticket・bindingと一つのPendingBoundTransferへ同期移動する。最初の外部guard前に両元slot・採用ticketの利用権限を除く。kernelは空のtake markerとcleanup-only終端を残し、acceptedを二重所有しない。

pre／work／postで同token・pins／元行・receipt・plan／handoff・元route／window・budget参照と同live source／frame／ready／cleanup serial=0を照合する。post停止は引数／binding不一致より優先。成功しても移譲先がないため固定`state`拒否でabortし、pending／元payloadを外してfirst hardを保持する。成功handle・本文・段階的なseal成功票は返さず、正常元slotへ復元しない。

失敗後の固定callerが、正常／pending／binding／completion／adoption／準備slotとkernel payload slotが空で、保護scopeが終了したことを検査する。同token・失効serial・元budget参照とbinding serial（未結合は0）に結ぶPayloadClearedReceiptをprivate発行し、失敗report確定・custody移譲・元owner最終discardで再検査する。これは既知slotの論理破棄証拠であり、JS heap物理消去やguard外部の保持物の証明ではない。

NB-03だけに生成前のcleanup capsule slotを確保する。capsuleは同kernel／FailureKernelLinkの固定new-generation cleanupだけを操作でき、元rootや本文・pins・planのAPIを持たない。同resources selectorを既存custody coreへ渡し、`transferFailure()`の一度限りclaimから、immutable診断と同capsuleを上位へ同期移動する。ここで封印するのは失敗reportであり、内容の移譲先sealではない。移譲直後からlocal cleanup／stopは上位の状態やreceiptを変更できず、matching receiptによる元metadataの`finalDiscard()`を一度だけ許す。不正引数でも最終claimを戻さない。

上位の遅いcleanupは同sinkを一度だけ消費し、sealed reportは不変、late currentの事実だけを更新する。新worker終了・source cleanup・transport終端の不足を補完せず、未起動／未公開allocationでもUnknownを保持する。cleanup pre/postの取消／期限観測は最初のhardを上書きせず後始末を許すが、throw・unknown返値・swallowed再入は固定拒否とし、受理前後のcustody holderを変えない。正常終端・正常discardをhard後のcleanupの代わりに使わない。

追加費目はprivate take／同元slot確認、行再検査、post再照合、payload-clear検査／receipt、report／capsule移譲、final discard・cleanup guardである。全work／heap／copyピーク・実cleanup期限・費用modelはUnknown、旧FB-03の62イベントoracleを流用しない。元C/G/P／開始UTC／全deadlineは固定し、全体受付は有効化しない。[NB-03検証記録](E2E_BEST_PRACTICE_NORMAL_TRANSFER_NB03_2026-11-03.md)を参照。
