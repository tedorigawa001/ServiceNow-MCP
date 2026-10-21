# BP-5 R-2 OL-03：通常strictの固定3箇所・同RecordSource・M4 owner接続詳細設計

Version: draft-0.4 / Date: 2026-10-21 / Design baseline: `fd1de54` / Implementation baselines: owner `2905075`、topology `bd9301b` / Status: ownerと固定topology adapter・位置handoffの内部subsetを実装。通常kernel接続・通常strict差替えは未実施。

## 1. 範囲と不変条件

[終了証拠設計](BEST_PRACTICE_BP5_R2_OL03_STRICT_COMPLETION_DESIGN.md)の後続として、実装済みの固定collector→typed tail→strict acknowledgementを通常strictの内部orchestratorへ接続する構造を具体化する。§2〜§9はdraft-0.1での接続案であり、実装済みsubsetと計数は§10〜§11で区別する。通常kernel/orchestrator・接続用全費目は未実装/未確定。

全体受付は無効、telemetry調査は保留。APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absenceの停止を解除しない。実装済み範囲は§10〜§11の内部subsetのみで、通常strict差替え・OS接続・実機操作・token発行・設定変更・本番policy投入・permit発行は本工程の対象外。

接続後も次を必須とする。

- 同inspectionでsession台帳・予算・RecordSource・receipt/contextを生成し直さない。
- Initial／BeforeM4／AfterM4は固定位置だけから呼ぶ。Round enumだけで位置やM4成功を証明しない。
- 同roundの型付きtailと実ackを使う。旧ClosureSourceやtest-only ackへfallbackしない。
- BeforeM4 ackとM4成功を区別し、比較が失敗したらAfterM4を開始しない。
- 全体受付・運用capが未承認なら、合成接続の成功を理由に実運用へ進めない。

## 2. 確認した現行経路と不足

| 現行実装 | 読み取れる契約／不足 |
|---|---|
| [strict.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict.rs) のreview_strict_record_target | 元sourceを1つ保持し固定3箇所へ&mutで渡す。まだ旧ClosureSourceを使い、session ledger/実collector/typed ackには未接続 |
| 同strict_round | scan前のrecord再読・clock・厳密検証、with_round、AfterScan後のObservation破棄、record再検証、FinalIndex、最終clockを実行する |
| [topology.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology.rs) のcompare_topology | 開始時のrecheck、A/B比較、M4取得直前のrecheck→必須before_m4 callback→M4取得。callbackの戻り値だけではstrict由来を型で示さない |
| [metadata.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata.rs) のcompare_metadata | recheck_b成功後にM4、最後のcheckpoint/phase完了後だけComparedM0M4を返す。同型単独にはrecord/session ownerの結合がない |
| [records.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records.rs) のRecordSource | identity APIはない。時計を含む実操作は同&mut sourceを順に借用している。source projectionはstrictで呼ばない |
| [typed ack](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session/completion/records/acknowledgement.rs) | FinalClockRoundから同scope/Finished phase/Closed/budgetを照合してExpect(next)/Finishedへ進む。M4を実施した証拠ではない |
| [resource台帳](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session/resources.rs) | 累積/同時数/cleanup予約は実装済み。ResourcePolicyに本番constructorはなく、数量モデルからの自動承認はできない |

基準の836テストは前工程の合成成績であり、本書の通常接続・新handoffの検証成績ではない。外部仕様や実OSの振る舞いは新たに調査していない。

## 3. inspection ownerとRecordSourceの所有

提案するprivate `StrictSessionOwner` は、元の `&mut S: RecordSource` をinspection全体で1回だけ借用し、同receipt/target/contextのborrow、元budgetのorigin/claim/started、唯一のsession ledger、3slot source owner、接続進行状態を保持する。budgetは各呼出しで同じ値をreborrowし、元identityを毎回照合する。新しいSharedBudgetやretryを作らない。

生成位置はreview_strict_record_target相当の内部bodyで、validate_receipt成功後、外側clock_check(460000)とInitialより前。一度生成したsessionは失敗後に再生成しない。source自体の所有は外側に残し、ownerは最後までその同じ値を借用する。ownerのmethodは任意source引数、mutable source getter、source setter、factoryを受けず、全clock/record再読/typed tailへ自分のsourceをreborrowする。sourceをmove交換/再初期化する内部処理も設けない。

保証するのは**同じRecordSource値を連続して使用する所有構造**であり、RecordSource実装内部の物理FD同一性を新たに証明するものではない。操作の正当性は既存のpinned bytes/hash/metadata/path/time照合を維持する。traitへsource-originを追加する強化は別設計であり、今回の案に実装済みの検査として混ぜない。

collector用sourceはRecordSourceとは別物で、inertな3slot（各Option）をownerが値で保持する。実装済みの保持subsetはgeneric Cで、ScanOpsを呼ばないため不要なtrait boundや実操作境界の可視性拡大は行わない。将来の固定collector接続側が同一C: ScanOpsを要求する。slotを最初のfallibleな利用処理前にtakeし、失敗時にも補充/clone/返却しない。生成/未使用dropでOS取得やI/Oを行うsourceはこのsubsetへ入れない。未使用slotは停止後に破棄し、skipしたroundを後から実行しない。

### 3.1 未承認policyを開けない

session.configure_resourcesに渡す運用policy、collectorのQuotas、全体work/resource受付は別の承認事項。未提供/不明modelの場合は既存Unavailable等で止め、数量上界から既定capや本番constructorを作らない。最初の接続実装はcfg(test)の合成policy/sourceだけで検証可能にし、通常v2や公開entryは引き続き停止させる。型名に通常接続を含めても、運用入口の有効化を意味しない。

## 4. 固定3箇所と1roundの順序

新ownerにはprivateな固定method（仮称run_initial／run_before_m4／run_after_m4）だけを置き、呼出し側がRoundを自由選択するrun(round)は公開しない。共通kernelが内部でRoundを使う場合も、固定methodとhandoffからしか到達させない。

| 固定位置 | 必須前提 | 成功後の状態と次の処理 |
|---|---|---|
| Initial | validate_receipt、唯一の台帳構成、元sourceの外側clock(460000)成功 | round全体（with_round末尾を含む）成功後だけtopology比較を開始 |
| BeforeM4 | 同比較ownerのB成功、M4直前topology recheck成功、その固定callback位置 | 実ackとwith_round末尾成功後だけM4取得へ戻る。まだM4完了ではない |
| AfterM4 | 同比較ownerのM4/終端checkpoint成功と、非複製handoffの消費 | 実ack後も外側checkpoint・owner解放・最終checkpointが必要 |

各固定methodのkernelは次の順序を変えない。

1. slot/位置claimを不可逆に消費し、元session/receipt/context/budgetを照合。
2. 元RecordSourceでreread_bytes→clock_check(450000)→verify_records。再読内部のclockも省略しない。
3. with_round→decode1回→prepare_scan/Node→bind_inputs→profile→calculate。同roundの宣言再利用と共有予算を維持。
4. ledger.begin→固定session collector→typed cleanup→complete_scan。lease/Inputsのborrow制約に合わせて順序を実装し、scanはprecheck前に開始しない。
5. PendingStrictRound.after_scan（実index再認証/集合照合）→Observation破棄。
6. 同じsourceでrevalidate_records→verify_final_index→verify_final_clock→acknowledge。
7. ackをclosure内の最後のfallible処理とし、closure復帰後のwith_round末尾checkpointの結果を必ず伝播。

scan前の再読を前roundのackやimmutable indexで省略しない。正常系のrecord厳密検証/再読cycleは各round前後の計6回、index decodeは計3回を維持する。clockの正確な試行数は再読内部の試行も独立計数し、今回の設計で削減しない。

## 5. M4 ownerと非複製handoff

### 5.1 固定topology adapter

既存compare_topologyのA/B/M0〜M4処理を複製しない。strict専用のprivate adapter（仮称compare_topology_for_strict）で、lower-levelの必須callbackへ**固定のstrict owner methodだけ**を接続する。外側callerからFnMut/任意finalizerを受けない。旧topology-only/旧ClosureSourceの比較結果から新handoffへ変換する口も設けない。

固定外側orchestratorはadapter呼出しより前に、同held targetのresource origin、同TopologyReceipt/RecordReceipt/target/contextへの安定borrow、元budget/session identityに結合するprivate `TopologyRunOwner` を一度生成する。これはadapterのlocalから返す値ではなく、AfterM4消費まで生存する外側localとして保持する。StrictSessionOwnerのmutable borrowをこのowner内へ保存せず、同session claim/originを結合用identityとして保持する。heldのresource originもRc identityの共有で保持し、held内fieldのborrowを残したままheldをmutably借用する構造にはしない。

adapterとhandoffはこの安定ownerをborrowする。実装subsetでは元session/inspection identityとowner側の唯一生成claimを使い、追加のID文字列・再利用可能nonce・allocation addressを外部証拠にしない。すべての照合はborrowが有効な間に行う。holder/receiptを動かして同一性を判定するraw pointer保存やunsafe参照復元は使わない。

ownerにはcompare_started／before_started／before_succeeded／completion_consumedの単調な利用状態を持たせる。安定ownerを共有borrowするposition/handoffと両立させるため、利用状態だけをprivateなCellで扱う案とし、RecordSourceやledger全体をRefCellへ入れない。各attempt claimはfallible処理前に消費し、失敗/forgetで戻さない。これらのprivate boolだけを入力にhandoffを作る関数は公開しない。

### 5.2 BeforeM4Position

privateな非Clone/非Copy/非serdeの `BeforeM4Position` は、compare_topology内部の既存p==M4分岐に渡す**固定callback内だけ**で生成する。このcallbackはB再走査と同held/path recheckの成功後にしか呼ばれないという現行制御フローに依存するため、その順序を合成テストで固定する。型名だけでB実施を証明できるとは主張しない。

positionは同TopologyRunOwner・inspection/session・receipt/target/context・元budget identityのborrowを持ち、run_before_m4へ値で渡して即時消費する。別owner/二重callback/順序違いではBindingで止める。callbackが返す成功は、typed ackだけでなくwith_round末尾まで成功した場合に限定する。成功後だけbefore_succeededを確定し、現行コードどおりM4 metadata取得へ戻る。callbackの失敗時はM4 sourceの取得を試さない。

### 5.3 AfterM4Handoff

compare_topologyがComparedM0M4を正常に返し、元budget checkpointとbefore_succeeded照合が成功したときだけ、adapterがprivate `AfterM4Handoff` を発行する。handoffは**その実呼出しから返ったComparedM0M4を所有**し、同TopologyRunOwner identity/receipt/target/context/budgetへ結合する。別のComparedM0M4やTopologyComparison/RecordComparisonから作るconstructorは設けない。

run_after_m4はhandoffを値で消費し、owner側のcompletion_consumed claimを先に消費する。元sessionがBeforeM4のack後であること、before_succeeded、同owner/held origin/receipt/context/budgetを再照合してからAfterM4のscan前処理を始める。caller指定のRound::AfterM4やFinished ledgerだけでは代用しない。型は非Clone/非Copy/非serde・opaque Debug、公開の取り出し/getterを持たず、ComparedM0M4はAfterM4全体が成功して初めて内部resultへ移す。

このhandoffは、既存ComparedM0M4に不足する**実topology比較の呼出しとstrict sessionの位置結合**を追加する案であり、既存の物理resource/record/署名の再検証を代替しない。一般の比較型をClone可能にする変更は行わない。

### 5.4 BeforeM4 ack後に比較が失敗した場合

M4 metadata取得失敗・不一致・source origin差替え・比較末尾checkpoint失敗・handoff直前の取消/期限では、BeforeM4 ack済みでもhandoffを作らない。固定adapterのErrを受ける外側ownerが同sessionの停止口を必ず呼び、Expect(AfterM4)を再開可能な状態として残さない。比較は再試行せず、元source slotを作り直さない。handoffをdrop/forgetしても次のphaseはその同じ値の消費なしには始められない。

## 6. 失敗伝播・診断・終了順序

既存ledger.failはsession内部privateなので、接続実装ではstrict内部だけに見える狭い `stop_inspection` 相当を設ける。元claim/budgetの先行理由を優先し、Expect/Active/AwaitStrict/Finishedのいずれでもinspection側の異常を停止として保持する。状態の任意setter、claim reset、正常終了setterは公開しない。

| 失敗箇所 | 必須の停止と診断 |
|---|---|
| owner/slot/handoff/model/budget不一致 | 最初のBinding/Unavailable等を保持。sourceを開始せずclaimを消費済みにする |
| scan前record/clock/JSON検証 | roundを開始しない。scan slotを補充せずsession停止。新cleanup成功票は作らない |
| collector/cleanup/typed tail/ack | 実CompletionFailureをmoveし、Confirmed/Incomplete/NotStartedと元summaryを保持。main Failureを上書きしない |
| ack後のwith_round末尾 | Expect(next)/Finishedでも外側結果を失敗にする。ledgerの明示停止と元budgetのsticky理由を保持 |
| Initial後のtopology/B/BeforeM4/M4 | 原因を保持してsession停止。後続round/再比較/未使用slotの実行なし |
| AfterM4/handoff消費/外側終了 | 成功のComparedM0M4を破棄。RecordComparison/permitへ変換しない |

新adapter内部は仮称 `StrictInspectionFailure { reason, round, completion: Option<CompletionFailure> }` の固定サイズ診断を使う案とする。CompletionFailureは実際にその失敗attemptで得た場合だけSomeへmoveする。先にack成功して証拠が消費済みの後でtopology/外側checkpointが失敗した場合は、新しいClosedを数値から再構築せずNoneとする。過去roundのcleanupを現在の失敗attemptや全inspectionのcleanup証明へ転用しない。

既存Result<RecordComparison, Failure>はstructured診断を返せないため、単純なmap_err(reason)で新証拠を早期に捨てる接続はしない。まずprivateな合成orchestrator結果型で診断の保持/移動を検証し、上位の限定summaryへ接続する際の契約を別途レビューする。公開crate/MCP応答は今回拡張しない。

終了順序は未完了stage/lease/position/handoff→TopologyRunOwnerとStrictSessionOwner（台帳・slot）→借用元のsource/topology_source/held→records/contextのborrow元。両ownerは互いのmutable borrowを保持せず、identity共有だけなので双方を借用元より前に破棄できる。正常結果へ移すCompared値は保持しても、失敗時は破棄する。registry bytes/groupsを借用しているcontextより先に借用元を破棄しない。現行source/topology_source/held/recordsのdropと最後のcheckpointを省略しない。

Dropで新I/O/課金/再close/再scanを行わない。既存の通常Dropだけで外側OS resourceの解放確認が得られるとは主張しない。scanのClosed証拠と外側ownerの終了証拠は別契約である。panic/unwindでは既存lease/ledgerの放棄停止を維持し、panic本文を通常診断へ出力せず、検証用にcatchしても同sessionを再開しない。

## 7. 共有予算・費目と受付停止

| 費目owner | 維持／追加の扱い |
|---|---|
| record/clock/strict意味検査 | 既存R費を維持。同sourceを借用するための理由で再計上/省略しない |
| index decode/phase・profile/calculator・collector | 既存モデル/上界/同round再利用、guard7/entry1を維持 |
| session会計・cleanup・typed complete/tail/ack | 既存費を維持。ackは3 work/round。resource試行/予約/cleanupをadapterで二重課金しない |
| 新owner/slot/位置handoff/停止guard | 新しいO費目として独立計数。元の上界へ無根拠に吸収しない |
| topology recheck/A/B/M0〜M4 | 既存費と共有retry/bytes/操作枠を維持。handoff発行のための再scan/再metadata取得は追加しない |

O.connection_create／O.slot_take／O.before_m4_position／O.after_m4_handoff／O.outer_stopを候補の費目名とする。正確なunit・checkpoint数・identity allocation費・診断保持サイズは未計数。receipt/round/budget結合とone-shot guardを合成計数し、成功・拒否・中断それぞれを独立oracleと照合するまで、全体work上界へ確定値として足さない。新固定submodelのproducer/consumer bindingも実装時に定義・レビューする。

3roundで同じSharedBudget・開始時刻・retry・累積resource台帳を使い、slot毎に残量を元へ戻さない。受付未承認の状態で不足を避けるために上限を広げたり、合成policyを運用値に転用したりしない。

**BeforeM4が同時資源の最悪位置（2026-10-21、レビュー）**：BeforeM4 roundは `compare_topology` → `compare_metadata` の途中、`budget.begin(&mut held.source.leaf, bytes)` でtarget leafを保持し、A/B比較の予約/消費とheld祖先・topology sourceを抱えたまま固定callback内で実行される（`1fec974` の固定adapterでこの構造がコード上確定した）。従ってこの位置では、外側held owner＋target leaf＋A/B由来のpayload予約/使用＋scan自身のlive owner（最大5）とpayloadが**同時に**存在する。3roundのうち同時保持数とpayload残量が最も厳しくなるのはBeforeM4であり、台帳設計§6の `outer_held_owners + scan_live_owned + scan_live_reserved` のrole上限と、既存予約を押し退けないpayload検査は、この位置を最悪ケースとして受付・cap承認時に検査する。Initial/AfterM4の値で代用しない。

## 8. 合成受入条件（未実施）

1. 実collector/typed tail/ackの3roundを、上記固定3箇所から通す。scan時のmetadata履歴はInitial=[]、BeforeM4=[M0,M1,M2,M3]、AfterM4=[M0,M1,M2,M3,M4]。B EOF/hash照合とtopology recheckがBeforeM4開始より前であることも独立イベント列で確認する。
2. 1つのRecordSource fixture instance IDだけで全record/clockを実行し、再読cycle6・厳密検証6・index decode3を確認。factory/差替え引数・source projectionへアクセスしない。別sourceを入力できる公開口がないことをコードレビューする。
3. 別inspection/receipt/context/budget/TopologyRunOwner、別比較結果、旧topology-only結果、RoundだけのAfterM4を拒否。比較型の任意constructorやClone/serdeがないことをコンパイル時に確認する。
4. BeforeM4 callbackの0回/二重呼出し、B前/M4後の位置違い、重複handoff発行/消費、drop/forgetとslot再利用を拒否。故障注入はcfg(test)だけに限定し、unsafeな偽造をしない。
5. Initial/BeforeM4の全失敗で後続M4/AfterM4呼出し0を確認。BeforeM4 ack後のM4取得・metadata変更・compare末尾・handoff末尾の失敗でもAfterM4は0、sessionはStoppedとする。
6. AfterM4 ack後のwith_round末尾・外側body/解放後checkpoint失敗を成功へ変換しない。既存Cancelled/Deadline/Expired/Limit等の分類・先行Failure・cleanup診断を維持する。
7. 各新guardのwork不足prefix・全課金後取消・全checkpoint期限、source遅延成功/エラーを確認。失敗後の再生成/slot補充/旧ClosureSource fallbackが0であることを検査する。
8. 数量モデルとの計数、共有retry、同時最大数/cleanup予約の返却、未使用slotの破棄を確認。source/lease/ObservationのDrop回数、外側解放の証明範囲も区別する。
9. BeforeM4をB前へ移す、M4前にhandoffを発行する、record sourceを再生成する、with_round末尾を無視する変異を検知し、復元後に全合成テストを実行する。
10. 未提供policy・運用入口の停止を確認し、全体受付/APPROVED_REGISTRY/DER/absence/permitのgateが開いていないことを差分で確認する。

## 9. 実装順・承認待ち事項

1. private owner／3slot／同source借用／外側停止・診断結果の内部契約を先に実装し、合成sourceで確認する（subsetは§10）。通常strictはまだ差し替えない。
2. 固定topology adapterとBeforeM4Position／AfterM4Handoffを合成検証し、B・recheck・M4の位置とowner結合を固定する（内部subsetは§11）。通常kernelはまだ接続しない。
3. 固定round kernelを実collector/typed ackへ接続し、旧経路との順序・費目・終了順序を照合する。通常v2の入口は停止したままにする。
4. 診断の上位引渡し、O費/全体work/resource上界、運用policy信頼元とcapの承認を別工程で確定する。OS source・受付・署名policy・permitはそれぞれの承認なしには接続しない。

topology callback中に `&mut StrictSessionOwner`（session台帳と元RecordSourceを含む）を排他的に借用する構造は、固定adapterの `compare_core` で**コンパイルと合成試験を確認済み**（`1fec974`、§11）。通常kernelの本番接続は未実施である。ownedな循環参照やRefCellによるsource借用回避で解決せず、安定borrowと固定helperの境界を小さくして検証する。実装subsetのlifetime/診断/model/費目は§10に記録し、残る位置handoff/最悪経路費は実装前後のレビュー対象。全体が未確定である限り実運用の安全性・受付可能性を主張しない。

## 10. 実装済みのowner内部契約subset（draft-0.2）

### 10.1 境界と状態

[connection_owner.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner.rs)にprivate fieldのStrictSessionOwner／RoundSlot／StrictInspectionFailureを追加した。非Clone/非Copy/非serde・opaque Debug、sourceは元の&mut Sを全寿命でborrowし、public source getter/setter/factoryを持たない。slotsは固定長[Option<C>;3]で追加heap配列やsourceのcloneはしない。inertな生成/DropはC実装側の前提であり、generic Cの任意Dropのbounded性を型だけで証明したとはしない。

createは既存session::createの唯一claimを先に消費し、owner model `bp5-r2-strict-owner-0.1` と元budget bindingを照合する。本番ResourcePolicy/Quotasは生成しない。validate_receiptと外側clock(460000)を実施済みとする固定caller接続はまだなく、constructor成功をその証拠とみなさない。

production-facingな内部取得口はinitialだけ。非公開takeは対象slotをfallible処理前にtakeし、Expected→Takenとして排他的RoundSlotを返す。順序違い・空slot・別budget/modelでは停止し、消費済みslotを補充しない。RoundSlot.precheck_recordsはone-shot claimを先に消費し、自分のownerが保持する同sourceだけでreread_bytes→clock_check(450000)→verify_recordsを実行して終端checkpoint後に成功とする。source引数/実行済みbool/新しいreceiptを受け取らない。

BeforeM4/AfterM4のproduction methodや正常kernel接続・進行setterは未提供。cfg(test)のtake/runだけが既存の実collector/typed tail/ackへfixtureを接続し、同ledgerの実ack claimと期待状態を照合してから次slotへ進む。test callbackのOkだけでは進めない。この試験口は位置/M4成功の証明ではなく、通常strictに登録しない。

### 10.2 外側停止と診断

sessionにstrict内部だけのrequire_inspection／stop_inspection／abandon_inspectionを追加した。正常状態setterは設けず、外側停止はFinishedからもStoppedへ移し、元budget/claimの先行Failureを保持する。停止に新I/O/heap allocation/workを要求せず、work枠を使い切っていても止める。owner/slotのdropは未完了時に放棄停止を行う。forgetしてもownerがTakenのままなので次takeを拒否する。

外側で原因が分かる場合はownerまたはslotのstop_inspectionを**drop前に**呼ぶ。単なる放棄dropはUnavailableであり、未記録の実エラー理由を復元できない。StrictInspectionFailureはreason、pending/active round（Finished時はNone）、実CompletionFailureのOptionをinlineに保持する。roundは最後の成功roundや実scan開始を自動証明する値ではない。

実CompletionFailureはprivateな失敗移動口でのみ診断へmoveし、元Closed/summaryを保持する。外側失敗で新cleanup票を作らず、既にackで消費した過去roundの証拠を再構築しない。component試験は同ledgerの実失敗から移動しているが、通常kernelの固定producer/外側診断引渡しは未接続。診断は成功や実行permitへ変換する証拠ではない。

### 10.3 実費と検証範囲

| 費目 | 実装subsetの追加費 |
|---|---|
| O.connection_create | 2 work。既存session_create 2とは別なのでconstructor計4。成功時checkpointの時刻読取は計10 |
| O.slot_take | 2 work、時刻読取6。先行takeを戻さない |
| O.owner_record_guard | 2 work。実再読/clock/意味検査のR費を維持し、その基準経路との差分として照合 |
| 外側停止/放棄 | 追加work 0。resource試行/bytes/retryの返金・追加操作なし |

このsubsetだけならcreate追加2＋3round×(take2＋record guard2)＝14 workを既存費に加える。ただし通常接続/M4位置/handoff/全体終了費を含む確定上界ではなく、全体受付は無効のまま。source実試行は既存R/scan_ops側が課金し、ownerが二重計上しない。

[owner契約合成記録](E2E_BEST_PRACTICE_R2_OL03_OWNER_CONTRACT_SYNTHETIC_2026-10-21.md)の新規11テストで、3slot/同sourceの実ack接続、6再読cycle、重複生成・順序/identity違い、生成の全10checkpoint/4課金後取消・work不足、slotの全6checkpoint/2課金後取消、recordの二重precheck/取得失敗/遅延取消・期限、末尾課金後取消、drop/forget、Finishedからの外側停止、実cleanup診断の保持、policy未提供の停止、型制約を確認する。診断のinline sizeはテストで256 bytes以下を要求する。

通常strict.rsのorchestrator本体は差し替えていない。このsubsetの後続となる固定M4位置/owner handoffは§11へ続く。残るkernel接続、上位診断契約・新O費の全体上界、OS source・運用policy・全体受付・permitは引き続き未対応/未承認、telemetryは保留。

## 11. 固定topology adapter・位置handoff内部subset（draft-0.3）

### 11.1 発行位置とowner結合

[topology_adapter.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/topology_adapter.rs)を追加した。owner.topology_runは唯一のtopology_started claimをfallible処理前に消費し、実Initial ack/期待状態、同receipt/target/context/budget・held origin・TopologyReceiptのbindingを要求する。返すTopologyRunOwnerは外側localに保持し、adapter内localへの参照を返さない。元RecordSourceやledgerのmutable borrowをrootへ移さない。

固定compare wrapperは任意caller callbackや既存ComparedM0M4を受け取らない。private coreが既存compare_topologyをそのまま呼び、B成功→M4直前recheck成功の必須callback内だけでBeforeM4Positionを生成する。owner.before_positionが位置claimを先に消費し、同root/session/予算・Initial ackを照合してBeforeM4 slotをtakeする。body成功後も実BeforeM4 ackとwith_round末尾成功を照合し、checkpoint後にbefore_succeededを確定する。

実M4取得・origin照合・比較終端が成功して初めて、private constructorがその実ComparedM0M4を所有するAfterM4Handoffを発行する。handoff model `bp5-r2-m4-handoff-0.1` はproducer/consumerの独立literalで照合。consumerは元root/receipt/context/session/budgetとBeforeM4 ackを再照合し、completion_consumed claimを先に消費してからAfterM4 slotへ移る。別ownerが同じ進行状態・実ackを持っていても拒否する。

enterの戻り値はAfterM4Roundであり、比較結果を直接取り出せない。元root borrow、排他的slot、owned Comparedを保持し、次の実kernel/ack接続を待つ。4型とも非Clone/非Copy/非serde、private fieldとopaque Debug。旧TopologyComparison/RecordComparison、数値summary、成功boolから作る口はない。

### 11.2 本番停止と合成成功の区別

通常kernel未接続のため、non-testの固定compare wrapperは実BeforeM4位置を消費した時点でUnavailableを返して停止し、M4を取得しない。成功したと偽装するstubや旧ClosureSource fallbackは設けない。BeforeM4のproduction成功口、AfterM4Roundから全体結果へ進む口、通常strict.rsの差替えはまだない。

cfg(test)だけのfixture wrapperが、同じprivate coreの位置取得から既存の実collector/record/FinalIndex/clock/typed ackへ接続する。テスト用固定kernelはcallback Okだけを成功にせず、同ledgerの実ackとwith_round末尾までを確認する。AfterM4Roundの比較結果を取り出すtest-only口も同じ固定kernel完了後に限定する。collectorへの薄いbridgeはcfg(test)のみで、既存production calleeの可視範囲は広げない。

### 11.3 停止・費目・限界

比較/位置/消費のErrでは元Failureをstickyに保ち、ownerを明示的にStoppedへ移し、実BeforeM4 failureのcleanup/summaryがあればmoveして保持する。M4失敗でBeforeM4 ackを取り消して再開可能にすることはない。

TopologyRunOwner/未消費handoffのDropは、ledgerをmutable borrowせず元shared claimへ放棄停止を記録する。その瞬間にownerのenumを書き換えるのではなく、元budget/ownerの次の検査を即時に拒否し、ownerの明示停止/Dropで台帳状態も停止する。AfterM4RoundのDropはさらに未完了slotのDropを通じて台帳を停止する。forgetではDrop成功を主張せず、compare/consumptionのone-shot claimと必須handoffにより再開を拒否する。

新費目はO.topology_owner=2、O.topology_compare=2、O.before_position=2、O.after_handoff=2で、成功subsetの追加は計8 work。既存slot take各2、record/scan/typed tail/ack費と区別する。合成計数はowner生成差分2、BeforeM4 body直前まで4（compare入口1＋位置1＋既存take2）、body後〜比較結果発行まで2、handoff enter差分4（新2＋既存take2）を確認する。位置handoffのための再scan/再parse/metadata再取得は追加しない。全体受付上界/運用capを確定した値ではない。

M4結果はその比較時点までの証拠であり、以後のOS/path不変性や外側cleanup完了を保証しない。元held originのチェックは既存compare_topologyの取得前後で維持し、handoff enter自体ではM4を再取得しない。通常orchestratorの固定所有/呼出し順と、実OS sourceの保証は別途必要。

[topology adapter合成記録](E2E_BEST_PRACTICE_R2_OL03_TOPOLOGY_ADAPTER_SYNTHETIC_2026-10-21.md)の新規11テストを参照。独立したB bytes/EOF計数、全22 topology操作の故障、M4 failure/late result、同状態の別owner、全prepare/handoff予算境界、誤成功/重複/drop/forget、型制約と変異検証を含む。通常kernel接続・OS source・運用policy・全体受付・permitは未対応/未承認、telemetryは保留。
