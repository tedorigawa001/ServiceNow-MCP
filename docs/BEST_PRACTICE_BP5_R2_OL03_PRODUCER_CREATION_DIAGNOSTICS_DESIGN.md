# BP-5 R-2 OL-03：保護producer生成入口・生成失敗の上位診断保持

Version: draft-0.7 / Date: 2026-10-23 / Source baseline: `52acb6c` / Status: §11まで内部実装/合成検証。Context/Records/HeldSourcesと独立ScanSlots片を実装、PolicyCaps未確認・準備入口未接続。全producer/8段階全体・運用受付は未実装/未承認

## 1. 範囲と停止状態

[保護bridge・診断保持設計](BEST_PRACTICE_BP5_R2_OL03_PROTECTED_BRIDGE_DIAGNOSTICS_DESIGN.md)§13の後続である。生成前の結果owner確保、部分入力の所有、producer/create拒否の固定診断、既存releaseへの線形移譲を一つのprivate入口として設計する。

全体受付無効・telemetry保留・APPROVED_REGISTRY=None・通常v2 Unavailable・gate92・DER/absence停止を維持する。実装済みsubsetは§10〜11に限定し、OS接続、実機操作、token発行、設定変更、本番policy投入、permit発行、通常strict.rsの差替えは対象外とする。既存の合成成功を本番供給元の証拠にしない。

§3〜9は初稿draft-0.1の全体案として残し、現在の型/実装範囲/費用/未対応点は§10〜11を優先する。全producerの8段階検査は実装済みとは扱わない。

## 2. 現状との差

| 現行ソース | 成立していること | 残る境界 |
|---|---|---|
| [protected_inputs.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs.rs) | create_typed2 work、利用guard10、移譲1、元budget/供給seal/3slotの結合。生成拒否も固定discard/checkpoint後に型付き保持 | constructorはcfg(test)のみ。sealは承認registry/context/OS取得/capの供給証拠ではない |
| [result_owner.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/result_owner.rs) | run_protectedに加え、run_creationが生成前slotを確保し部分入力/型付きcreate拒否をinline保持 | 本番producer/供給証拠検査は未対応。Envelope受領前の取得失敗は上流の責務 |
| 同ownerの低水準口 | begin_slot/retain_resultはprivate。test用begin/retain以外は固定callerだけが使う | 新入口のために汎用begin/retainや任意結果の格納口を再公開しない |
| ResourceInput/Quotas | 内部会計/固定collector接続が存在 | 本番の承認cap・保護された供給元は未対応。数値上界だけではpolicyを生成しない |

ownerを用意せずproducerを実行してから、FailureをInputRejectedへ包み直す順序は採らない。先行診断と実際の破棄観測を失うためである。

## 3. 入口と供給元の責務

新しい仮称`run_from_preparation(envelope, b)`をresult_owner内部の固定入口とする。呼出し側が結果ownerをinlineで確保し、そのownerを排他的に借用する。入口はopaqueな`PreparationEnvelope`を値消費する。任意callback、backend selector、raw ScanOps/Quotas/registry bytes、外部の成功/Outer結果は受け取らない。

Envelopeは同inspectionの上流所有者から一度移譲する、未封印の準備所有領域である。準備途中の欠落を表せるprivateなOption群を持つが、未検証の値をtrustedと扱わない。保護producer不在も固定のUnavailable入力としてowner確保後に拒否できる形にする。欠落入力をfixture/defaultで補充しない。

| 入力/証拠 | 将来の供給責務 | 入口で維持する条件 |
|---|---|---|
| registry/groups/context | 承認済みbuild registryと同起動の検証済みcontext所有者 | immutable外部領域を借用。同値コピー、env/argvの自己申告を認めない |
| RecordReceipt/target/binding | 同一の厳密record取得producer | 元lineage・generation/hash/role/path/size。同じproducerが作る外部binding保持領域だけを許す |
| held/topology/source | 同secure open/attach系列の固定producer | 元resource/open snapshot/originと同じsourceを所有。再openやfactory補充をしない |
| inert 3scan | 将来の固定backend producer | Initial/BeforeM4/AfterM4の3slot。準備ではopen/read/enumを開始しない |
| ResourceInput/Quotas | 承認model/capと独立resource必要量の照合producer | 同供給系列・session累積/round枠・cleanup予約を結合。未承認ならUnavailable |

Envelopeを発行する本番の信頼元はまだない。合成段階ではcfg(test) sourceのみで所有権/拒否を検証し、それをnon-test constructorへ移して実運用可能にしたとは扱わない。

本入口の診断保持範囲はEnvelopeの値受領以降である。受領以前のrecord取得・secure open等の失敗は、上流所有者が別途保持する必要がある。本書だけで全起動失敗を回収できるとはしない。

## 4. owner・claim・固定順序

仮称`PreparationOwner`は部分入力を一括所有するprivate領域で、初期化はinlineのmoveだけとする。失敗する検査/確保は結果slotを予約した後で行う。未完成の入力を成功bundleとして公開しない。

1. Envelopeを入口のPreparationOwnerへ値で移す。同budgetの`ProtectedBridgeClaim`へ仮称`preparation_started`を追加し、最初のfallible workより前に不可逆に消費する。別budgetのclaimも消費/停止対象にする。bridgeのgenerated/usedやsession.startedを先取り消費しない。
   - 停止の伝播：現行`SharedBudget::stop`がbridge claimへ失敗を記録する条件は`generated`だけで、準備段階（generated前）の停止はclaimに残らない。同budgetはsticky failedで止まるが、claimのRcを保持する側（PreparationOwner/seal照合・slot放棄処理）からは停止が見えない。このため記録条件を`preparation_started || generated`へ広げる。準備段階の個別拒否では、従来のreject同様にclaimへ`latch`も行い、先行理由を上書きしない。
   - 準備claimとowner確認の順序：準備claimはowner/slotのEmpty確認（手順2）より前に消費する。非Emptyのowner（二重開始）でもそのbudgetの準備claimは消費済みとなり、同budgetで新Envelopeを再準備できない。begin_slotは非Emptyを`b.stop(Binding)`で拒否するため、いずれの順序でもbudgetは停止する。claimを先に立てることで「ownerを差し替えて同budgetで再準備する」経路も閉じる、意図したfail-closedの順序とする。
2. 同じ結果ownerのEmpty→Awaitingを確定し、既存begin_slotの2 workでslotを確保する。非Emptyならproducerを呼ばず拒否する。初回begin失敗時も既存の先行診断を保持する。
3. 元inspection/準備claim/context保持領域の結合を検査する。別origin/started/session、二重生成、同値コピー/別供給系列を拒否する。
4. §5の固定producer段階を順に実施する。各段階はPreparationOwnerを借用し、所有resourceを局所Resultへ移して失敗時に暗黙dropしない。
5. すべて揃った場合だけ同系列のタグ/slotを封印してProtectedSupplyを一度発行する。成功公開前に元budgetのcheckpointを確認する。
6. 型付き拒否を返せるprivateなcreate coreへ値移譲し、既存2 work/生成claim検査を実行する。成功時はbundleのinto_releaseへ直接渡す。
7. 同じslotへInputRejectedまたは実Outer/成功をmoveし、制御用の軽量Failureを返す。格納前後に新work/clock/JSON/logを要求しない。

既存run_protectedを新入口の内側から呼ばない。beginを二度実行して自分のAwaiting状態を拒否するためである。必要なら「slot確保後の固定dispatch/retain」をprivate helperとして共有するが、外部からslot・結果・calleeを渡す口にはしない。生成済みbundle入口を維持する場合も、一方を選ぶ排他的経路とし同budgetで併用/再開しない。

同receipt/context/source/claim/startedを、準備→create→利用→release→retainまで継続する。停止後は新owner・新Envelope・新budgetで同inspectionをやり直さず、元claimと第一理由を保持する。

## 5. 拒否位置の型と意味

既存InputStageは利用guardの位置であり、producerの生成段階を偽装して詰め込まない。privateな仮称`InputLocation`を追加する案とする。型名は設計候補でありMCP JSON契約へ追加しない。

| 位置variant案 | 具体的な意味 |
|---|---|
| OwnerBegin | slot確保/model/予算の失敗。producer未開始 |
| Supply(InspectionEntry) | 同inspection・準備claimの入口結合 |
| Supply(Context) | 承認registry/検証済みcontext/groupsの由来・寿命 |
| Supply(ReceiptTarget) | receipt/target/外部bindingの同lineage/厳密binding |
| Supply(HeldSources) | held/open/topology/source系列 |
| Supply(PolicyCaps) | 承認model/capとResourceInput/Quotas供給 |
| Supply(Slots) | 固定3slotの供給系列/順序 |
| Supply(SealPublish) | タグ付け・封印・供給公開の直前 |
| Supply(PublicationCheckpoint) | producer終端の予算/取消/期限検査 |
| Create(ClaimModel) / Create(InspectionPublish) | 現行createの1点目/2点目。生成claim/modelとinspection/publication |
| Use(InputStage) | 既存7分類の利用guard位置 |
| TransferCommit | take直前のinspection/checkpoint |
| SlotAbandoned | 未提出slotの放棄。producerの拒否stageとは別 |

旧input_stage projectionは既存Useの値、OwnerBegin→ModelInputUnavailable、TransferCommit→InspectionBinding、放棄→SlotAbandonedを維持する案とする。新Supply/CreateはNoneとし、新location accessorで区別する。InputRejectedなのにinput_stageがNoneになり得るため、受け手/テストの移行を同時に行う。自由文字列stageや曖昧なModelInputUnavailableへの一括変換はしない。既存固定評価セットの入力/期待値は変更しない。

位置は原因を表さない。Unavailable（供給/承認/model欠落）、Binding（由来/claim不一致）、Limit、Deadline、Cancelled等のprimaryと対で読む。先行sticky failureがあれば最優先で保持し、位置を付け直して主理由を書き換えない。producer失敗にround/CompletionFailureを捏造しない。

## 6. 所有権・失敗時停止と解放

| 時点 | 所有者と解放責務 |
|---|---|
| 受領前 | 上流所有者。そこでの失敗は上流が診断保持/解放する |
| 準備中 | PreparationOwnerが全所有値を保持。helperは借用だけ。部分的に揃った入力も固定discard sectionへ集める |
| Supply発行後/create中 | Supply/createの固定coreが所有。create失敗でも呼出し側へresourceを返して再試行させない |
| bundle生成後/利用拒否 | 既存bundle discardが所有。利用claimと元budgetを停止して全入力を破棄 |
| into_releaseのtake後 | 固定releaseが所有。producer/callerは再drop/再closeしない |
| 結果格納後 | 上位ownerは診断/成功だけを所有し、source/resource/contextを保持しない |

準備/create失敗は、まず元primary・locationを固定長診断として捕捉し元budget/claimへ停止を通知する。次に、現在所有するscan3slot→resource/Quotas→RecordSource→TopologySource→held→TopologyReceipt→RecordReceiptの順で存在する値だけをtake/dropする。準備の進捗に関係なく同じfield順とし、途中で`?`による早期returnをしない。完了後に元budget.checkpointを一度観測し、第一理由を保ってslotへ格納する。

現行createのFailureを受け取った後にSequenceReturnedを付け足すだけの実装にはしない。create内部の検査coreを所有管理から分離し、型付きlocationを返す検査→同じ所有者による固定discard→checkpoint→InputRejected返却の順を保証する。検査順・2 work・generated claimの不可逆性は維持する。

begin失敗ではproducerを実行せず、入口が既に所有したEnvelopeだけを破棄する。初回ownerには同じ第一診断へ破棄/checkpoint観測を補う。二重開始の場合は新Envelopeの拒否で先行結果を置換せず（§4手順1のとおり、そのbudgetは停止し準備claimも消費済みで再準備できない）、初回結果は保持済み/消費済みのままとする。

外部のcontext/registry/groups/BoundTargetと参照先binding保持領域は借用であり、内部discardでは解放しない。上流が結果格納/入口returnまで生存させ、その後に解放する。自己参照struct・unsafeの寿命延長・別allocationへのcontext差替えで解消しない。

固定長診断のmove/retain、停止通知、失敗時discard/checkpointには新work/heap確保を要求しない。一方、解放回数/予約と保持memoryは独立resource費として計上する。未取得値はcloseしない。resource取得直後には必ず所有領域へ登録し、その間にfallible処理を挟まない。SlotAbandonedは通常の失敗をcatchする代替にしない。

SequenceReturnedは通常drop列から戻った観測に限る。OS close確認・cleanup完了・Closed/ack/permitではない。panic/abort/forget/killや戻らないDropの診断保持/解放は保証しない。診断にpath/raw bytes/token/registry/groups/FDを含めず、Debugは固定opaque表現とする。

## 7. 追加費目案と全体上界

新model候補を`bp5-r2-producer-entry-0.1`とする。次の8 workは**固定制御だけの候補**で、未実装・未計数である。

| 費目案 | 候補work | 所有する処理 |
|---|---:|---|
| O.supply_entry | 1 | 準備claim/inspection結合（claimを立てる操作自体はfallible work前） |
| O.supply_context | 1 | 検証済みcontextの供給証拠確認 |
| O.supply_receipt | 1 | receipt/targetの供給証拠確認 |
| O.supply_sources | 1 | held/source系列の供給証拠確認 |
| O.supply_policy | 1 | 承認policyの供給証拠確認 |
| O.supply_slots | 1 | 固定3slotの封印確認 |
| O.supply_publish | 1 | タグ/Option移動と供給封印の固定公開guard |
| O.supply_terminal | 1 | 公開前checkpoint guard |

上表の証拠確認はboundedなidentity照合の案に限る。registry parse、groups走査、chain_names/bindingの動的比較、policy上界計算/承認照合等の実処理は、既存R/I/S/Oへ課金済みなら参照し、それ以外は別の`U_supply_dynamic`へ導出する。これらを固定1へ隠さない。

既存の生成2＋owner2＋利用10＋移譲1＝15は維持し、owner2を前へ移すだけで二重課金しない。成功時の候補差分は固定release直呼びに対し`15 + 8 + U_supply_dynamic`であり、23を全体上界と主張しない。拒否prefix・create型付き検査・新location保持に課金点を増やす場合はモデルと上界を改版する。

準備claimは既存budget-owned ProtectedBridgeClaimのprivate状態拡張を第一案とし、追加Rcを既定で要求しない。新たなsupply stamp、外部bindingコピー/chain配列、context保持領域、3scan backend包装、結果locationのinlineサイズ、最大同時保持を独立allocation/bytes台帳へ列挙する。fixtureのallocation数を本番上界として採用しない。

全体計算は[全体work設計](BEST_PRACTICE_BP5_R2_OL03_TOTAL_WORK_ADMISSION_DESIGN.md)のR/I/S/Oと独立resourceへ統合する。既存coupling35＋K、configure1、record再読6cycle、index3decode/scan前後検証、3scanの課金を重複/省略しない。受付計算自身・失敗prefixも含めchecked算術で検証し、未知項は0にせず停止する。100万work・元10秒・payload2GiB等の既存上限は緩めない。全体受付hookは有効化しない。

## 8. 合成検証の受入条件（すべて未実施）

1. owner/slot確保より前にproducerのfallible操作がない。owner失敗/二重開始ではproducer呼出し0・scan開始0。
2. Supply各段階/Create2段階の拒否位置とprimaryを照合。各work不足/課金後取消/期限切れ/先行理由で停止し、成功公開しない。
3. 同receipt/context/source/claim/budget/startedと固定3slotを、準備→生成→移譲→実結果格納まで追跡。別系列の同値コピー/二重生成/失敗後再準備を拒否。準備段階（generated前）の停止がclaimへ記録され、claim保持側からも見えること、非Emptyのownerでの開始後に同budgetで再準備できないことを確認する。
4. 各部分所有状態で存在するresourceだけが一度破棄される。drop watchは記録専用とし、破棄後に順序/回数をassertする。
5. create失敗後も型付きlocation・元理由・解放/checkpoint観測をownerから取得できる。未開始round/summaryは捏造しない。
6. 二重開始で新入力を破棄しても先行結果は不変。slotの待機中放棄はSlotAbandonedで通常拒否と区別する。
7. 成功は既存into_release→実kernel→固定解放だけを通り、既存run_protectedの再呼出し/begin二重実行/旧ClosureSource fallbackをしない。
8. 失敗後の格納はallocation/work枯渇・表示不実行でも可能。型の非Clone/非Copy/非serde、固定Debug、全体サイズ上限を再検査する。
9. 固定8候補・動的費・既存15を独立oracleと実課金差分で照合。全体受付は無効のまま、未知cap/producerをUnavailableで拒否する。
10. 生成済みbundle経路・既存固定評価セット/通常strictの互換性を維持する。OS backendのfake成功やpermit発行を追加しない。

## 9. 実装順と承認待ち

1. InputLocation/型付きcreate拒否・部分入力の固定discard・ownerの生成前slot確保を、合成sourceだけで実装/検証する。
2. 準備claim・opaque Envelope/PreparationOwner・固定producer段階を接続する。本番信頼元不在の停止を維持する。
3. 費目/保持量を実計数し、全体work/resource所有表・同時最大数・拒否prefix上界を更新する。
4. 本番の供給証拠・cap承認・OS source/解放保証と通常strictの戻り値移行は別承認とする。

型名/新location projection、固定8候補の妥当性、元producerが保持する外部領域の構築方法、cap承認者/固定配布方式、OS明示解放の可否、上流取得失敗の診断所有先は未承認/未検証である。これらを暗黙の既定値で確定せず、実装時の合成結果・費目導出とともに再レビューする。

## 10. 生成前保持・型付きcreate・部分所有subset（draft-0.2）

以下の準備claim未対応・差分16・18種locationはdraft-0.2時点の記録である。現行の準備claim/差分17/19種locationは§11を参照する。

### 10.1 現在の固定経路

[result_owner.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/result_owner.rs)の`run_creation`は、private begin_slotで結果領域を確保してから、部分入力complete→create_typed→既存into_release→同slotのretain_resultを実行する。既存run_protectedを呼び直さず、任意callback/外部結果/別budgetを受け取らない。生成済みbundle入口と新生成入口は同じownerを再開始できない。

初回begin失敗では受領済み部分入力を固定discardし、元OwnerBeginのprimaryを保って破棄/checkpoint観測を補う。二重開始では新入力を破棄するが、保持済み/消費済みの先行結果を変更しない。producer/生成guardの途中でslotを放棄してSlotAbandonedへ潰す経路は使わない。

### 10.2 location・create拒否

InputRejectedはInputStage単独からInputLocationの所有へ移行した。OwnerBegin、Supply(Context/ReceiptTarget/HeldSources/PolicyCaps/Slots/SealPublish)、Create(ClaimModel/InspectionPublish)、Use(既存InputStage)、TransferCommit、SlotAbandonedを区別する。Supply(InspectionEntry/PublicationCheckpoint)は本subsetで未実装のためenumへ追加していない。

従来input_stageはUseの値を維持し、OwnerBegin→ModelInputUnavailable、TransferCommit→InspectionBinding、SlotAbandoned→SlotAbandonedへ射影する。Supply/CreateではNoneになる。新input_locationで位置を取得でき、Noneを「拒否なし」と解釈しない。outer_phase/roundは実Outerだけに存在する。位置とprimaryは独立で、期限/取消/先行Expired等をBindingへ書き換えない。

`create_typed`は生成claim/modelとinspection/publicationの各位置を捕捉し、元budget/claimを停止→supplyの固定field破棄→checkpoint観測の後にInputRejectedを返す。既存2 workと検査順を維持する。理由だけを返すcreateはcfg(test)の互換委譲口に限定し、本番側が型付き拒否を失う入口にはしない。既存begin/retain/require_useの低水準test口も非公開化を維持する。

### 10.3 部分入力・所有と費目

[preparation.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/preparation.rs)のPreparationEnvelopeがprivateなPartialPayloadを所有する。scan3個、policy、quota3個、source、topology source、held、topology、records、context借用をOptionで表し、存在する値だけを既存payloadと同じfield順で破棄する。helperへ所有値を渡して途中で局所dropさせず、全所有値を残したまま欠落位置を判定する。

今回のcompleteは固定数のOption完全性検査のみで、新`O.preparation_complete=1 work`をslot確保後に課金する。context→records→held/topology/source群→policy/quota群→scan群の順に欠落位置を選びUnavailableで拒否する。work/取消/期限失敗の位置はSupply(SealPublish)。全必須値の存在を確認後、callbackやmutationを挟まず供給payloadへmoveする。由来検査は既存create/利用guardへ引き継ぎ、存在確認を保護producerの承認証拠とは扱わない。

同成功fixtureで、生成済みbundle経路より1 work多く、固定release直呼びとの差は**16 work**（owner2＋complete1＋create2＋利用10＋移譲1）と確認した。既存15を二度足さない。§7の8 work候補やU_supply_dynamic・本番供給包装は未実装/未計数である。将来8段階へ接続するときは本complete1の存廃/費目所有を再確認し、8＋1を無条件に加算しない。

Envelopeの構築・欠落操作はcfg(test)だけにあり、non-testのconstructor/OS取得/本番policyは追加していない。準備claim、実producerの8段階、外部保持領域の本番構築、独立resource/全体work受付は次工程。Envelopeを入口へ渡さず放棄/forgetした場合の停止保証も今回追加しない。

### 10.4 合成検証と限界

[新規8テストの記録](E2E_BEST_PRACTICE_R2_OL03_CREATION_DIAGNOSTICS_SYNTHETIC_2026-10-23.md)を参照。13種の単独欠落と13段階の累積欠落、owner開始前/complete/create/利用/移譲までのwork不足・課金後取消・期限、二重owner/生成claim、別inspection、解放後取消/期限を確認した。18種locationのprojection・第一理由保持、固定Debug、非Clone/非Copy/非serde/サイズの既存回帰も維持した。

解放watchは観測専用で、通常dropが戻った後に順序/回数を検査する。SequenceReturnedはOS close確認/Closed/permitではない。通常strict差替え・OS接続・全体受付・運用cap承認・DER/absence停止の解除は行わない。

## 11. 準備claim・入口結合・生成前停止の伝播（draft-0.3）

### 11.1 最初のworkより前の不可逆消費

同budgetの既存ProtectedBridgeClaimへprivateなpreparation_startedを追加した。run_creationはEnvelopeのstart_preparationを**begin_slotのEmpty確認/最初のworkより前**に呼ぶ。元claimのfreshをreplaceで捕捉し、別budgetが提示された場合は提示側の準備flagも立てる。generated/used/session.startedはこの時点で変更しない。二重ownerでも準備開始は記録され、ownerを替えても同budgetで再準備できない。

非Clone/非Copy/非serdeのPreparationAttemptは、fresh・同供給seal・提示budgetのorigin/bridge claim/session claim/startedを保持し、completeが値で一度消費する。既存Rcのcloneだけで新規Rc allocation/FD/sourceは作らず、検査後に破棄する。tokenを公開/返却したり、数値summaryから作る口はない。

slot確保後の新O.supply_entry=1 workで、fresh、tokenとEnvelope/同budgetのidentity、preparation_started、未generated/未used、既存inspection照合・checkpointを確認する。別origin/claim/session/started、同値だが別budget、放棄した先行attempt、消費済み生成/利用をSupply(InspectionEntry)で拒否し、scan/createへ進めない。元/提示budgetとも停止し、既存固定discard/型付き診断保持を使う。

### 11.2 生成前からの停止理由保持

SharedBudget::stopは`preparation_started || generated`のときに、既存の優先順で選んだ第一理由をbridge claimへ記録する。prepared=false/generated=falseの従来budgetの扱いは変えない。生成前でもbudget内のfailedとshared claimが同じ停止を保持し、claimを持つ待機slotの通常dropはUnavailableではなく元理由を保存できる。

準備の個別拒否/discardも従来rejectのlatchを維持する。先行HashMismatch/Expired/Limit等を新しいBindingで上書きせず、同budgetの新owner/新Envelopeによる再試行は元理由で停止し、新work/scan/生成を開始しない。未格納slotの診断位置はSlotAbandonedであり、元理由の伝播から実解放や未提出のOuter frameを捏造しない。

### 11.3 費目と検証

準備flagの不可逆操作は新work前に行い、O.supply_entry1はidentity検査の所有費とする。slot2＋entry1＋complete1＋create2＋利用10＋移譲1＝**17 work**を固定release直呼びの成功差分として照合した。生成済みbundleの旧callerは15を維持する。設計§7の8候補のうちentryだけを実装し、complete1や残るproducer費と無条件に二重加算しない。

claimは同じRc allocation内の状態拡張で、サイズ上限64 bytesの回帰を維持する。attemptは96 bytes以下のinline型で、新しいheap allocationはない。ただし追加状態/一時Rc参照の保持量・ピークを全体管理resource費へ統合済みとはしない。

[新規4テストと拡張回帰の記録](E2E_BEST_PRACTICE_R2_OL03_PREPARATION_CLAIM_SYNTHETIC_2026-10-23.md)で、owner開始前の消費、先行attempt放棄、別budget、準備段階の停止伝播、fresh ownerでも再開不可を確認した。既存work/取消/期限の全境界を新entryへ合わせ、全19位置のprojection、固定field解放、元診断保持、成功差分を再検証した。

本番producer、残りのcontext/receipt/source/policy/slot等の供給証拠検査、承認cap、独立resource/全体R/I/S/O上界・受付、OS source/明示close保証は未対応。Envelope受領前/入口へ渡さないままの放棄、panic/forget/abort/killの回収保証も追加しない。全体受付無効・telemetry保留・既存停止gateを維持する。

### 11.4 固定callerの排他性と入口照合の役割

本番で`ProtectedStrictInputs`を作れるのは`create_typed`だけで、その呼出し元は`run_creation`に限られる。生成済みbundleを受ける`run_protected`には本番で渡せる値がないため、`#[cfg(test)]`へ限定した。これにより本番の固定callerは`run_creation`だけとなり、§4の「二つの経路を排他的にする」を型で保証する。`run_protected`は既存の合成回帰テストだけが使う。

`complete`入口の`PreparationAttempt`照合のうち、origin/claim/session/startedの一致は、`run_creation`が`start_preparation`と`complete`へ同じbudgetを渡すため現行構造では常に成立する。後から別の呼出し元を追加した場合の防御として残す。実質的な検査は、fresh（準備claimの一度限り）、同供給系列、claimのgenerated/used状態、`inspection(seal, b)`が担う。

## 12. 供給証拠検査の詳細設計と先行subset

[供給証拠設計draft-0.4 §13](BEST_PRACTICE_BP5_R2_OL03_SUPPLY_EVIDENCE_DESIGN.md)でScanSlotsEvidenceの独立合成fragmentを実装した。固定factoryが作る3sourceのInitial/BeforeM4/AfterM4順・同identity・model・source自身の未開始状態を検査する。返すScanSlotsCheckedはPolicyCaps未確認の検証片で、PolicyCaps→Slotsという全体順序やPreparedSupplyを代替しない。準備入口/通常strictへ未接続。[検証記録](E2E_BEST_PRACTICE_R2_OL03_SCAN_SLOTS_EVIDENCE_SYNTHETIC_2026-10-23.md)を参照。

[供給証拠設計draft-0.3 §12](BEST_PRACTICE_BP5_R2_OL03_SUPPLY_EVIDENCE_DESIGN.md)でHeldSourcesEvidenceを追加した。同じ保持resourceの新metadata、祖先/pathを前後2回照合した合成所有領域へ結び、ContextRecordsCheckedを一度消費する。発行1＋消費1 workは取得費と別に計数し、既存17差分・通常strictは維持する。準備入口/本番issuer/PolicyCaps/Slotsは未接続。[HeldSources検証記録](E2E_BEST_PRACTICE_R2_OL03_HELD_SOURCES_EVIDENCE_SYNTHETIC_2026-10-23.md)を参照。

[供給証拠検査draft-0.2](BEST_PRACTICE_BP5_R2_OL03_SUPPLY_EVIDENCE_DESIGN.md)に、発行元専用のContext/Records/HeldSources/PolicyCaps/ScanSlots証拠、payloadと外部保持領域への結合、証拠の一度限り消費、固定順検査・拒否分類・解放責務を整理した。既存sealや単なる型wrapper/Rcは検証済み供給元の代替にならず、本番issuer不在は停止する。

同設計§11でContext/Recordsだけの内部型・合成取得/検証issuer・一度限りの発行/消費を実装した。immutable所有領域へ結び、消費時の追加I/O/再parseはない。run_creation/PreparationEnvelopeへは未接続で、現行17 work差分を維持する。合成発行/消費4 workと別途取得費を区別し、本番context/安全取得/承認capの検証完了とは扱わない。[検証記録](E2E_BEST_PRACTICE_R2_OL03_CONTEXT_RECORDS_EVIDENCE_SYNTHETIC_2026-10-23.md)を参照。

本案は現行complete1を段階別検査/公開へ置換する候補で、固定部分の比較は17−1＋7＝23。発行/動的費を含めず、未計数の23を全体上界や承認capにしない。cap契約・必要数量profile供給と初回decodeの順序は未確定であり、循環した生成/scanや余分なdecodeで補わない。証拠型/検査器の実装・全体受付の有効化は行っていない。
