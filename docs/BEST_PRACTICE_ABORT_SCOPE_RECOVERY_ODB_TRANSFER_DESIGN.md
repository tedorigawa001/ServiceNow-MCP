# OD-B 同生成元の供給と一度限りの内容移譲

Version: br006-recovery-odb-transfer-draft-0.10 / Date: 2026-11-03。
Status: **OB-01とFB-01〜03の同construction・合成kernel／sink・上位custody移譲、NB-01の同pins正常保持／予算bindingまで実装。実resource・canonical予算／全work保証・accepted採用・移譲先sealは未接続。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

基準HEAD: `1eb3c74`。[OM-D設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_MIXED_CONTENT_OMD_DESIGN.md)§4・7・10〜11と[OD-A検証記録](E2E_BEST_PRACTICE_OMD_SLOTS_ODA_2026-11-03.md)からの差分。同じ生成元で作ったmixed内容とaccepted／planを、一つのprivate操作で移譲先へ確定する。OD-Aの公開handleを既存rootへ後付け登録する方式は採らない。本文照合・finish job・候補発行はOD-Bの対象外。

## 1 既存保証と追加する境界

| 接続点 | 現在の実装 | OD-Bの差分 |
| --- | --- | --- |
| [OD-A](../tests/support/review/synthetic-omd-slots.ts) | 新row／receipt、7種のslot、prefix開始・生成・消費claim。完了後も元DATAをprivate保持し、出口はdiscard／失効だけ | 新しいbound construction内で同pinsへ結ぶ。standalone APIへtransfer／getterを追加しない |
| [pins生成](../tests/support/review/synthetic-finish-pins.ts) | DATAをstrict投影し、一度の呼出しでinput receipt・元accepted outcomeを新規生成する | 新constructionの一つの元列からpinsとmixedの参照対応を生成。別呼出しのpinsをID一致で結ばない |
| [finish kernel](../tests/support/review/synthetic-recovery-kernel.ts) | 同owner／plan／source／ready／cleanup serial=0からacceptedを受理し、live acceptedを一度sealへ移す | 新経路のprivate mixed内容も同じclaim・pre/post guard・commitで移す |
| [NR-C root](../tests/support/review/synthetic-pinned-recovery-root.ts) | 既存mixed sealは親省略を拒否。core seal成立後に別supplierを順に移す | 既存の拒否・旧seal APIは維持。新経路では二つの独立した成功handleを後で連結しない |
| [plan投影](../tests/support/review/synthetic-finish-plan-binding.ts) | 固定soft／verify deltaを追加し、RA値投影でlimitations等をsortする | 元の順序付きprefixと固定deltaを別に保持し、同plan投影との関係を検査する |

OD-AのCompletedMixedPrefixは既存pins由来の証明ではない。新factoryは合成DATAだけを受け取り、同じconstruction内で全参照を生成する。既にあるOD-A／OM-C／NR-C／runtimeのowner・receipt・summary・acceptedを入力するfactory、登録台帳、upgrade関数は作らない。

## 2 一つの供給元と固定生成順序

### 2.1 新constructorのDATA契約案

新kindを`synthetic_omd_bound_root_v1`とする。top-levelは`kind`、`recovery`、`finish`、`mixed`の4項目だけ。schema／上限は旧契約を再利用し、未知field・accessor・Proxy・疎配列・unsafe number・余分な引数を拒否する。

| 区分 | 固定項目と用途 |
| --- | --- |
| recovery | point、active_input_sys_id、accounting、consistency。既存point・C≤210／G≤16MiB／P≤8MiBとconsistency値を維持 |
| finish | time、header、selected、inputs。timeは既存S／全deadline／O／U。headerは親処理前のbase。入力ごとのsys_id・T_i・state・expected_contextは既存値契約で検査 |
| mixed | model_id、initial_prefix、rows。rowsはOD-Aと同じproducer／元outcome列。schema_versionはheaderだけから採り、二重の版指定を作らない |

`finish.outcomes`、各inputの外部accepted／receipt object、run／source／budget／window identity、keep／omit bool、delta配列は受け付けない。元reviewedの有無と親処理後のoutcomeは同じmixed列から固定導出する。新DATA契約を旧`createSyntheticFinishPins`の既存公開契約に追加せず、新construction内で所有した値へ変換する。

inputsの各要素は`update_xml_sys_id`、`retrieved_at`、`state`、`expected_context`の4項目を全て必要とし、expected_contextのnull可否は行種別と元値契約で決める。「optional input」はfield省略ではなく、その行にinput要素自体が存在するかを指す。metadataは要素なし、analysisは同completed要素あり、retrievalで要素がある場合はcompletedかつexpected_context=null、retainedは同not_processed要素ありとする。選択にないinput・重複inputを拒否する。

入力state／T_i／expected_contextはmixedの元値と照合する。reviewedなら同sys_id・result.reviewed_at／target.retrieved_at＝T_i・更新時刻・release／binding・rule集合と必須limitationsを検査する。analysis rejected／元worker omittedにも同completed inputとcontextを要求する。metadata行には架空inputを追加しない。retrieval行のinputは既存NR-Cの制約、retained行は同not_processed input・deadline_exceededを維持する。

初期subsetは既存recovery kernelと同様、選択1〜100件、少なくとも一つの元inputと有効なactive not_processed inputを必要とする。retainedは連続末尾。全件正常完了・空集合を便宜的に回復planへ変換しない。0.3の削除行拒否も変えない。

### 2.2 private供給の順序

1. 新constructionの診断ownerと固定discard責務を先に確保する。DATAをboundedにコピー・検査し、OM-Aで元列・親keep／omitと順序付きprefixをpinする。
2. 同一のprivate行台帳から、row／receipt／元reviewed outcome参照を一度だけ生成する。親省略でも元reviewed参照を残し、元worker omittedならその参照はnullとする。metadata行にはinput receiptを捏造しない。OD-Aの一般行receiptとanalysis input receiptは別役割なので、両者を対応表で保持する。
3. 同台帳の参照を使う新mixed controllerとfinish pinsを生成する。純粋値検査によるDATA copyは許すが、opaque参照をコピー・再生成して置換しない。pins生成を二度呼び、sys_idで後から同一視する実装は禁止する。RA値投影のplaceholder owner／plan／frame／routeは現在と同様に捨て、実際の合成ready受理証拠へ流用しない。
4. mixed開始・全行のgenerate／consumeを固定順に完了する。同receipt／元値との対応を検査した完了状態になるまで、bind／recovery／accepted生成の新入口は使えない。途中失敗は供給全体を破棄する。
5. 同pinsから既存recovery継続を通り、旧世代終了・必要verify・合成新世代ready・plan／handoff・context発行／accepted受理へ進む。ready originやcleanup serialを新たに作って既存検査を迂回しない。

共有するのは固定pure値／phase検査とprivate生成継続であり、旧rootのauthorityを新rootへ借りるのではない。新factoryは既存kernelと同moduleのprivate生成経路から構成する案とし、必要な抽出は旧factoryの公開面を変えない内部作業に限定する。外部callbackへpins／元本文／live ownerを渡す共通化は不可。

合成producer DATAから得た内部対応だけを保証する。実metadata／payload／worker wire origin、実auth／ReleasePermit／budget leaseの証明へ昇格しない。

full本文を含むmixed列を旧pinsの小さい一括コピー枠へ押し込まない。top-level・header／time／inputは既存局所枠、各元assetはOM-Aの個別bounded投影を使い、全列の有限保持を別費目にする。必要な枠や対応表を確保できなければ停止し、既存capを黙って増やさない。

## 3 private型と参照対応

以下はOD-B全体の内部型案。OB-01で実装した供給型・別brandと準備claimは§11へ分離し、移譲やsealの型は未実装とする。

| 内部型案 | 保持内容 | 発行・消費の制約 |
| --- | --- | --- |
| OwnedMixedSupply | 同construction token、ordered元列、行台帳、pins、開始prefix | fresh constructorだけが生成。一度の準備claimを持ち、失敗後の再準備不可 |
| BoundRowOrigin | row、一般行receipt、必要なinput receipt／元accepted outcome、元値、producer | 全selectedの一意完全対応。外部に参照表を返さない |
| CompletedMixedContent | 同供給元・全行消費済み・7種の分類・元reviewed DATA・親決定trace・順序付きprefix | standalone完了prefixからは作れない。同private controllerの完了時だけ生成 |
| PendingBoundTransfer | 上記内容＋元live accepted／bound plan／handoff／ready／source／cleanupのsnapshot | claim直後に両元slotを取外す。移譲中だけ保持し、失敗時に全payloadを固定破棄 |
| SealedMixedExpectation | 局所expectationと同内容manifest・同accepted origin・元plan／handoff・route snapshot | post guard後に一つのdest slotへcommit。公開handleは空でbody getterなし |
| TransferFailureObligation | 内容を含まない生成済みresource区分、未解決解放状態、最初のhardとcleanup診断 | live routeへ戻せない。終了未確認をconfirmedへ変換しない |

行対応はIDだけでなく同じprivate `BoundRowOrigin`からの参照で検査する。親省略はその行の元accepted outcomeとinput receiptを`reviewed_origin`に結ぶ。元omittedは`reviewed_origin=null`を維持する。出力reviewed=0でも親省略があれば元capture数は0でなく、empty-reviewed proofを出さない。元reviewedを一度も持たない場合だけ、同planの全partitionを検査した非実行ゼロ状態を保持する。

## 4 順序付きprefixと固定delta

開始prefixは新fixtureのDATA pinに限定する。base headerのlimitations／errorsとinitial_prefixの関係を、元の順序・重複を含めて検査する。別々の任意配列を独立した真実として採用しない。OM-Aの親処理後prefixを新constructionのbase headerへ固定反映してから、同pinsとplanを結ぶ。

既存plan投影のsoft／verify処理は、base limitationsにsoft_deadline_reached、deadline_exceeded、verify limitationsを順に加えてfirst-occurrenceでdedupし、errorsへanalysis/deadline_exceededとverify／changed由来のエラーを上限100で加える。切詰め発生時のerror_details_truncatedも同固定継続が決める。このdeltaをcaller配列で受け取らず、同plan.verifyと同baseから一度導出する。

RA投影がsortしたheaderは局所構造用に留める。新継続はsort前の親prefixとdelta適用後の順序付き値をprivate保持し、**既存の明示dedup／sortと同じ変換を適用した値**が同plan projectionと一致することを検査する。sort済み値から元の順序を復元しない。OD-C／OM-Bに渡す原順序の値と、その変換関係を保持する。

OM-Aが許す最大103 limitationsや重複初期limitationsは、既存RA baseのunique・≤100にそのまま入らないことがある。OD-B初期subsetでは、その入力を局所契約に対してunsupported／limitとして停止する。RAを通すための追加dedup・切捨て・cap拡張は行わない。既存plan投影が定める後段dedupは変更せず、初期入力の救済とは区別する。

## 5 一度限りの移譲

新固定操作案を`sealBoundMixedExpectation()`とする。[OB-02接続差分](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OB02_ADOPTION_DESIGN.md)のprivate採用ticketから同ownerのaccepted／contentを選び、binding／plan／handoffもprivateに保持する。callerが外部accepted／manifest／移譲先ownerを指定する引数は作らない。旧factoryのhandleを受けるAPIは変更しない。

| 段階 | 固定処理 |
| --- | --- |
| 入口 | 同ownerのbusy／first hard／状態を確認し、移譲claimを占有。余分な引数・binding不一致は固定失敗にし、再利用を許さない |
| 取外し | 同live acceptedとCompletedMixedContentを元slotから同時に取外し、PendingBoundTransferへ移す。後で元slotへ戻さない |
| pre guard | 共通のfake stop検査と元binding・plan・route・cleanup未開始を検査 |
| work | 元pins／receipt表を再検査し、局所expectationと順序付きprefix関係を作る。内容・分類・集合を全行照合 |
| post guard | 停止・失効・再入を再確認し、全identityと元slotが未再生成であることを確認 |
| commit | 一つのdest slotに局所expectation＋内容＋同accepted originを確定。移譲回数1、元pending 0、publicには空handleだけ |
| failure | dest未公開のまま両元・pending・一時値を破棄。claim／ready／routeSpentを戻さず、先行hardと解放未解決状態を残す |

新経路は現在の公開`core.sealRecoveryFinishExpectation`を先に完了し、後から別ownerのcontent transfer成功を足す方式にしない。private seal kernelへ固定のmixed modeを追加するか、同module内の固定継続へ分離し、上の一つのtransaction境界でcommitする。汎用のaccept-content callback／公開register関数を追加しない。

work中のshape／binding不一致は一時結果として持ち、既存sealと同様にpost guardのcancelled／deadlineを先に確定する。再入を内側で握り潰されてもfirst hard／stop serialを再確認する。commit後の外部通知やasync処理は追加せず、途中handleを先に公開しない。

## 6 preとpostで一致させる項目

- 同construction token、run／session／source／key／origin／budget／release／windowのprivate参照。
- binding＝同owner、元acceptedが同private slotから発行済み、acceptCount=1、routeSpent=true。消費済みrouteをunusedへ戻さない。
- 同plan objectと元handoff、同frame objectとsupervisor／worker／generation、同ready origin・元lease／event。
- sourceが同open source／lifecycle identityでclose未開始。cleanupは同frame／identity／sink、未開始・未確定・serial=0。
- 元accepted projection、再投影、混合内容の選択版／対象集合・順序・元input receipt・元accepted outcome・T_i／S／O／U／全deadline。
- 全selectedのpartitionが一意で、parent omittedと元worker omittedが入れ替わらない。元reviewed本文と親決定の対応を保持し、出力stateと元capture数を混同しない。
- mixed開始・各行生成／消費が完了し、未消費行・wire／slot・他の移譲・新規prefixが残っていない。standalone summaryからの再構成は不可。

一つでも供給できない場合は停止する。未知のoriginや未完了stateを、schema適合・ID一致・凍結済みobjectだけで代用しない。

accepted受理時に元のtransferredPlan／handoffHandle／finishBoundは既にlive slotから外れている。そのためsealは元acceptedが保持するprivate bound snapshotと同plan／handoffを照合し、消費済みの公開handoffを再bindしたり、旧`checkBoundRecoveryPlan`のbound状態へ戻したりしない。

## 7 失効と解放責務

### 7.1 正常系のterminal-only保持

source close／cleanup開始・固定discardは、元mixed／pending／destの内容を同期失効させる。既存kernelの`acceptedTermination`は内容利用とは別に保持し、同sourceのclosed証拠と同cleanupのconfirmed証拠が成立した後だけ、既存の固定accepted discardで一度消費する。destが失効してもacceptedを再利用・再sealしない。

新rootの`close`はdest／pending／未消費責務が残る間は成功させない。正常discardの途中にhardが入れば、次の失敗経路へ移り、通常完了の票を出さない。

### 7.2 hard失敗時の区別

現kernelの`fail→clear`はlive acceptedだけでなくacceptedTerminationとsource identity等も破棄する。一方、発行済み新世代cleanup sinkは条件を満たせばhard後も開始・記録できる。**hard後に通常のsource close／accepted discardが実行できるとは扱わない。**

新constructionはresource生成時から内容を持たない解放責務を追跡する。hard時にはpayload・pins・expectation・route権限を外し、生成済みresourceの未解決状態と発行済みcleanup診断だけを残す。worker cleanupのconfirmedだけでsourceの解放やaccepted正常discardまでconfirmedにしない。source終了の証拠が得られない場合はunconfirmed／pendingのまま保持し、成功close・正常完了へ変換しない。

初期OD-Bでは新たな失敗用source-close証拠発行口を作らず、この区別と診断保持を検証する。[失敗owner寿命・最終discard契約](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FAILURE_OWNER_LIFETIME_DESIGN.md)では、同生成元の上位ownerが診断と未解決cleanup custodyを一度受理したことを、元ownerの最終discard条件とした。受理のないsummaryコピーでは責務を捨てられず、上位へ移した未解決はrelease=unconfirmedのまま残す。実resourceの強制解放・終了確認の接続は別工程で、未確定を「全解放完了」の試験期待値にしない。JS heapの物理消去は保証しない。

## 8 診断と費目所有

上位ownerはprepare／transfer／invalidate／discardの固定stage、最初のhard、sourceとworker／cleanupの別状態、生成・消費・移譲件数だけを公開する。ID・T_i／UTC・body／prefix・trace・hash・内部handle・raw例外は返さない。後続cleanup診断は更新できるが先行hardを置換しない。

| 費目 | 所有者 |
| --- | --- |
| strict DATAコピー・OM-A投影・同pins一度生成 | construction owner。元本文総量と一時schema copyを別計上 |
| 行／input対応表・元reviewed保持・prefix／固定delta | mixed owner。最大100行、入力上限と元本文保持量を混同しない |
| plan再投影・局所expectation・全行照合・identity検査 | 同private seal transaction。重複projectionを無料化しない |
| 元slot取外し・pending／dest確保・commit／失敗破棄 | transfer owner。権限は移すが内部参照の一時重複分も費目化 |
| 正常terminal-only／失敗obligation・late cleanup | 固定終了owner。本文を保持せず、未解決を成功扱いしない |

共通fake stopは生成／移譲の全保護区間へ渡し、終了時に同期失効させる。これを実canonical budget leaseの供給と同一視しない。元C/G/P・retry・210試行・60秒は増やさず、総work／memory・schema中断粒度・copyピークはUnknownを維持する。費用を算出できないことを省略変換・再取得・再finishで救済しない。

## 9 合成受入条件

1. 同一constructionの7種混合・親省略後のkeep・元omitted前後のprefix、retained末尾、0.2／0.3を確認する。元reviewedなし・真の全retainedと、親省略を持つ列を区別する。現OM-Aでは最初のreviewedは上限内でkeepされるため、親省略だけで全reviewedが消えた派生宣言は不正入力として拒否し、empty-reviewed proofへ変換しない。
2. 同DATAを二度生成した別rootのrow／receipt／accepted／plan／handoff、同ID別参照、コピー／summary、standalone OD-A完了prefixを全て拒否。拒否された側以外のownerは不変とする。
3. 元reviewedのinput／T_i／context・parent reviewed_origin・元omittedのnull、metadataにinputなし等を一項目ずつ壊し、constructorまたは移譲で止める。pinsを二度生成する回帰を負の対照にする。
4. 全行未消費・二重begin／移譲・競合・余分な引数を拒否し、失敗後の再準備／再移譲不可を確認する。元pendingとdestが同時に利用可能な瞬間を作らない。
5. 各pre／work／postの取消・期限・例外・swallowed再入、source close／cleanup開始を注入し、両側のpayload pending 0・移譲成功0・先行診断保持を確認する。post stopはbinding不一致に優先する。
6. 正常移譲後のsource closed＋同cleanup confirmedだけがaccepted固定discardを通り、片側未確認・別sink・serial違い・二重記録は拒否する。hard後はworker cleanup確認とsource未確認を併記し、通常close成功にしない。
7. 初期重複warning・親処理後101〜103件・errors99／100・固定soft／verify deltaと元配列順を独立表へ照合する。局所上限超過を切捨て・追加dedupで救済しない。
8. 旧OD-A／OM-C／NR-C／seal／accepted discardのAPIと試験を維持し、新factoryが旧rootやruntimeを採用できないことを確認する。packageではtests／新factoryを非同梱とし、I/O／clock／worker起動・秘密漏出の負の対照を用意する。

以上はOD-B全体の試験計画。OB-01の実行済み範囲は§11と検証記録へ分離し、OD-B全体の成功や解放完了とは扱わない。

## 10 実装順と開始前に固定する点

| 分割案 | 範囲 | 開かないもの |
| --- | --- | --- |
| OB-01 | §11の新DATA契約・OwnedMixedSupply・同pins／行対応・準備claimを合成実装済み。旧入口不変 | accepted採用・移譲先seal |
| OB-02 | 同private kernelのaccepted／planとCompletedMixedContentを一つの移譲claimへ結合し、失敗obligationを先に確保 | 内容比較・finish job・候補 |
| OB-03 | pre/post・一つのdest commit、同期失効、正常terminal-only discardとhard時の診断保持を連続fake検証 | OD-C比較・OM-B／RD-C・全体受付・runtime |

OB-01では上記strict入力・行別input存在条件を型と試験に固定した。固定role・上位受理・custody／commit receipt・最終discardの独立合成実装後、[FailureOwner接続差分](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FAILURE_BINDING_DESIGN.md)のFB-01〜03で、先行生成・失敗通知・kernel生成点／cleanup対応・未解決責務の保存を確認してからOB-02へ進む。OB-03前には順序付きprefixと既存sort／dedupの固定写像・projection／対応表の費用と中断点を具体化する。数値上界の未導出はUnknownに残し、型・独立表・失敗試験なしで完了flagだけを追加しない。

FB-01の先行FailureOwner／上位slot・OB-01一度限り通知とpayload失効は合成実装済み（[記録](E2E_BEST_PRACTICE_FAILURE_BINDING_FB01_2026-11-03.md)）。FB-01 entryはkernelを生成せず、role証拠・上位受理・実予算はUnknown／未接続のまま。FB-02〜03とOB-02以降の開始条件を省略しない。

FB-02は別fresh entryで同private初期topology・kernel生成点／clear前保護・既存cleanup sinkを合成接続した（[接続差分§11](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FAILURE_BINDING_DESIGN.md)、[記録](E2E_BEST_PRACTICE_FAILURE_BINDING_FB02_2026-11-03.md)）。不足するtransport全件・新世代終了・source cleanup・実予算の証拠はUnknownのまま。FB-03の上位custody移譲と未解決責務の保存を確認してからOB-02へ進む。

FB-03の上記連続保証は[接続差分§12](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FAILURE_BINDING_DESIGN.md)の閉鎖合成範囲で確認した（[記録](E2E_BEST_PRACTICE_FAILURE_BINDING_FB03_2026-11-03.md)）。同capsuleの上位移譲と元owner固定discard、fake予算identity／prefix・停止checkpoint・費目の継続を検証しただけで、実解放や全体work受付ではない。次のOB-02の同pins／accepted／plan採用は未実装であり、今回有効化しない。

[OB-02採用接続差分](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OB02_ADOPTION_DESIGN.md)で、正常系の同pins保持・一度限りmove、pins由来identityを起点にした新正常系予算shellの結合、同private accepted／planとの採用と移譲claimを具体化した。既存FB-03のidentity方式やpins APIは変更しない。正常内容を失敗capsuleへ残さない論理破棄receiptと上位診断の境界を定め、NB-01〜03を実装分割案とした。設計のみであり、dest sealはOB-03・全体workはUnknownのまま。

draft-0.1は設計MDだけ。続くOB-01の実装範囲を以下に限定し、実Permit／候補発行・実接続・実通信・実機操作・設定変更・Pushは行わない。

## 11 OB-01の実装範囲

後続の[OB-02接続差分§10](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OB02_ADOPTION_DESIGN.md)でNB-01の同pins正常保持・private生成receipt・一度限りmove／予算bindingを追加した。旧OB-01／FB-03のAPI・identity／会計modelは変更せず、新入口はpackage除外の合成限定。accepted採用・dest seal・正常resource終端は未接続である。

[既存kernel module](../tests/support/review/synthetic-recovery-kernel.ts)にfresh factory `createSyntheticOwnedMixedSupply`を追加した。旧factoryの関数本体と返却surfaceは変更していない。新factoryは`createRecoveryKernel`を呼ばず、accepted／plan／ready／sealの生成・採用口を持たない。[新合成試験](../tests/review/synthetic-owned-mixed-supply.test.ts)と[OB-01検証記録](E2E_BEST_PRACTICE_OWNED_MIXED_SUPPLY_OB01_2026-11-03.md)参照。

### 11.1 DATA pinと準備

診断shellとconstruction tokenを先に生成し、§2の4区分DATAをboundedコピー・OM-A投影へ渡す。schema_versionはheader由来だけ。top-levelは固定4 keys、recoveryとfinishの小さいheader・time・input群はそれぞれ10,000 nodes・262,144 character units・深さ8・array100・object30 keys、本文列は既存OM-Aの個別asset上限で扱う。これらを単一のwork予算と呼ばない。caller値をfreezeせず、準備前の後書換えやguard差替えを採用しない。

不正DATAは固定失敗を持つ非実行shellとなり、prepareで停止する。不正な依存形状・Proxy guardはfactory時に拒否する。外部outcomes／receipt／accepted／deltaや旧ownerを登録しない。

prepareは入口でclaimを占有し、prepare_pre→全行のrow_pre／row_post→prepare_postを通る。親処理後のstateと元reviewedの有無を同modelから導出し、`createSyntheticFinishPins`を一度だけ呼ぶ。raw本文はpinsへ渡さず、reviewedは構造用state／sys_idに分離する。元reviewedを持つinputだけに内部DATA markerを作り、親省略でも同元accepted-outcome pinを残す。元worker omittedはnullのままとする。

行台帳の一般row receiptとpinsのinput receiptは別参照として保持する。metadataにはinputなし、analysisにはcompleted＋context必須、retrievalのoptional inputはcompleted＋context=null、retainedには同not_processed inputを要求する。active input・時刻単調性・末尾U・releaseとheaderの整合は既存pinsのstrict検査を維持する。

各行の固定生成／消費と元値対応をprivateに完了し、同construction token・同pins outcome／input・元accepted参照・非reviewed全field・元reviewed contextをprepare_postの前後で検査する。生成済み途中行やpinsを返さず、全成立後だけ別brandの空PreparedOwnedMixedSupplyを返す。準備回数・pins生成回数は各最大1で、旧OD-A完了prefixからは発行できない。

### 11.2 終端と未対応

現時点のprepared値の唯一の消費口は、同handleの固定discardPrepared。コピー・foreign・二重消費・余分な引数を拒否し、source close／cleanup開始・hard・discardでheld元列／pins／handleを同期失効する。cleanup操作は内容の失効だけであり、resource解放confirmedや実source終端証拠を発行しない。最初のreasonと累積scalar件数を残し、失敗後の再準備は不可とする。

guardはfake停止境界だけ。準備のguard数は成功時2N+2、discardは2で、全work／heapの上界ではない。元列投影・pinsコピー／RA検査・行対応表・二度の全行検査・固定破棄を追加費目とし、同canonical予算／実会計・中断粒度はUnknown。recoveryのaccounting・point・consistencyは検査したDATAとしてprivateに保持するだけで更新しない。

梱包監査の既存kernel固定importに、pureなpins生成・OM-Aモデルの2依存を明示追加し、新factory／brand markerも漏出拒否へ加えた。seeded I/O／時計／worker／runtime漏出の負の対照は維持する。runtimeソース、旧OD-A／NR-Cと実sessionの台帳は変更していない。

OB-02のaccepted採用・一つの移譲claim、OB-03のdest seal／terminal-only接続、固定soft／verify delta・OD-C比較・実originは未成立。preparedの成功をこれらの成立へ昇格しない。

失敗時の先行条件として、[寿命設計§9](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FAILURE_OWNER_LIFETIME_DESIGN.md)の独立した合成FailureOwner／上位owner・4roleのcustody・一度限りcommit receipt／最終discardを実装した。未解決責務を上位へ移せたこととresource解放を区別し、immutable reportとlate current診断を分ける。OB-01／kernelの失敗経路接続はFB-01〜03の閉鎖合成範囲で成立済み。正常系accepted採用と移譲先sealは引き続き未対応で、新接続差分をその実装完了とは扱わない。
