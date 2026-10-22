# BP-5 R-2 OL-03：通常strictの外側orchestrator接続詳細設計

Version: draft-0.2 / Date: 2026-10-22 / Source baseline: 設計 `526f6d3`、固定位置 `cd5bd97` / Status: OuterStrictFailureと診断用結果合流器の内部subsetを実装・合成検証（§12）。外側orchestrator本体・解放section・通常strict差替えは未実装。

## 1. 範囲と停止条件

[固定位置接続設計§13](BEST_PRACTICE_BP5_R2_OL03_NORMAL_STRICT_CONNECTION_DESIGN.md)で実装したInitial kernel、BeforeM4固定compare、AfterM4Handoff/finishを、receipt検査から解放後の最終checkpointまでの単一orchestratorへつなぐための設計である。draft-0.1はMDのみで、draft-0.2では実装順①の診断型・結果合流器だけを追加した。既存 `review_strict_record_target` の差替えは行わない。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。本番policy投入・OS接続・実機操作・token発行・設定変更・permit発行は含めない。

次の内部検証は、合成の保護context/scan source/resource policyだけで実施する。本番ResourcePolicy/Quotasのconstructorがない点を回避しない。設定や数値summaryから自動承認しない。依存する保護済み入力を用意できない経路はUnavailableで停止する。

## 2. 現行ソースとの対応

| 対象 | 現状／接続上の注意 |
|---|---|
| [strict.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict.rs) | 入口でvalidate_receipt→clock_check(460000)、旧ClosureSourceによる3round、body末尾checkpoint、source等のdrop、解放後checkpointを行う。戻り値が裸のFailureで新しい診断を保持できない |
| [records.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records.rs) | receiptのpin/lineage/hash検査と同RecordSourceによるclock・再読。clock_checkはwall/単調時計/元budgetの経過を照合する |
| [connection_owner.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner.rs) | 元sourceの&mut借用・唯一session claim・3slot。Finishedからも明示停止でき、StrictInspectionFailureは実CompletionFailureを保持する。外側全体の完了型はない |
| [kernel.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/kernel.rs) | 元sourceの前後再読、実collector/tail/ack、with_round末尾、owner完了guardまで接続済み |
| [topology_adapter.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/topology_adapter.rs) | B/recheck→BeforeM4 kernel→M4→handoff→AfterM4 finishが固定位置でつながる。返るComparedM0M4は外側解放完了でも実行許可でもない |

現行の `budget.checkpoint()?; result` という末尾をstructured errorへ機械的にコピーすると、checkpointがErrのときに保持中の診断resultを捨ててしまう。解放後checkpointは必ず一度評価し、その結果と保持中のresultを明示的に合流する。

## 3. 内部境界と所有権

### 3.1 配置と入力案

最初の合成orchestratorは `scan_ops/orchestrator.rs` 相当のprivate moduleに置く。ScanOps/QuotasやResourcePolicyを親module向けに公開して入口を作る案は採らない。通常strictからの呼出し境界を後で移行する際は、保護された入力bundleを作る狭い固定bridgeを別途レビューする。旧ClosureSourceを新経路へ自動変換するfallbackは設けない。

入力は元HeldTargetScope、TopologyReceipt、RecordReceipt、RecordSource、TopologySource、InspectionContext、inertな固定3scan slot、承認済みの内部policy/round別Quotas、同じSharedBudgetの排他的借用。receipt/target/contextはinspection中に差し替えず、source factory・Round指定callback・caller申告の完了bool/時計値は受け取らない。

orchestratorはsource/held/records等を値で所有し、借用順を固定する。StrictSessionOwnerだけが元RecordSourceを&mutで継続借用し、各kernelやclockのためにsourceを作り直さない。安定したTopologyRunOwnerをlocalに置き、handoff消費まで保持する。ownerを含む自己参照structやunsafeによる参照延命、source全体のRefCell化は行わない。

### 3.2 確定前の結果

AfterM4.finishが返した実ComparedM0M4は、private localのpending resultとして保持する。外側終了前にRecordComparisonへ包む、cloneする、callerへ渡す、entitlement gateを解除する操作は行わない。外側失敗時はこの値を破棄する。

## 4. receipt検査と外側clock

順序は次のとおりとする。

1. 元budgetのcheckpointと固定入口/model/input結合を検査する。必要な保護入力がない場合は失敗で終了し、sourceを開始しない。
2. `validate_receipt(&records, held.bound, budget)` を**owner生成前**に実行する。lineage Rc identityとRecordBinding、pinのActivation/Ledger/Index順、サイズ・祖先数・hash、開始時の有効期間を既存関数で照合する。成功boolや前のround結果で置き換えない。
3. 同じRecordSourceで `clock_check(..., 460_000)` を実行する。source.clockの取得前後checkpoint、wall/monotonic/budget経過の整合、activation/ledgerの期限を既存関数のまま維持する。
4. 成功後だけ元sourceをStrictSessionOwnerへ貸し、元receipt/target/contextとinert 3slotを固定し、唯一sessionを生成する。policyは保護された内部供給口からのみ結合する。

460000はミリ秒の**record期限の必要残存余裕**で、実行時間の上限ではない。record_timeは `expires > wall_ms + margin` を要求する。各round側の450000も残存余裕であり、省略・460000への置換はしない。

SharedBudgetは現在、同じstarted/now/cancelled・inspection origin・session claimで10秒の期限を持つnative内部予算である。OAuth runner全体385秒やレビューMCP側60秒と混同せず、この接続のために期限を延長・再生成しない。caller指定時刻、別budgetの時計、初回readingの再利用を認めない。

receipt/外側clockが失敗した時点ではownerがまだ存在しない。budget.stopで先行理由を固定し、round=None、scan cleanup診断なしとして残る入力を解放する。台帳を後から生成して「停止済み」を装うことはしない。

## 5. 固定bodyの順序

| 段階 | 必須callee／成功条件 | 失敗時に開始しない処理 |
|---|---|---|
| Initial | owner.initial→run_fixed。実ack＋with_round末尾＋owner完了guard | topology比較全体 |
| topology owner | owner.topology_run。同held/receipt/context/budgetと実Initial ack | B/BeforeM4/M4 |
| compare | 固定adapter::compare。B/hash/EOF→recheck→BeforeM4実kernel→M4→比較終端 | 失敗時はhandoffとAfterM4 |
| handoff | 実AfterM4Handoff.enter。元ownerと一度限りの消費 | AfterM4 kernel |
| AfterM4 | AfterM4Round.finish。実kernel/ack/with_round末尾＋同ownerの完了guard | 外側成功結果の公開 |
| body終端 | 元ownerのFinished/実AfterM4 ack/3slot消費と元budgetを固定helperで照合し、body末尾checkpoint | 解放前の成功公開は禁止 |

body終端の固定helperは新設予定であり、現在はtest getterを使う案ではない。固定calleeの実完了から確認し、任意state setter・完了bool・数値summaryで代替しない。AfterM4.finishの成功は外側body/checkpoint/解放完了と別である。

record厳密再検証の前後計6cycleと、index decode1回/roundを維持する。外側のために追加scan/parse/再読を入れず、必要な再検証を「既にack済み」で省略もしない。body終端はbudget checkpointで、追加source.clockは設けない。最後のrecord clockは既存AfterM4のtyped stageが取得する。

## 6. 停止と解放の順序

### 6.1 owner生存中

bodyで失敗したら、scope内の未完了stage/lease/slot/position/handoffを終了させる。元StrictInspectionFailureを保持し、元ownerのstop_inspectionへ同じ先行理由を通知する。通知用に返るcompletion=Noneのframeで、保持中の実CompletionFailureを置き換えてはならない。失敗時の再scan・再比較・slot補充は行わない。

正常bodyの比較結果または失敗診断を、所有するlocalへmoveしてから次の順序で解放する。

1. 未完了stage/lease/slot/position/handoff（正常系では既に消費済み）。
2. TopologyRunOwner（handoffの借用終了後）。
3. StrictSessionOwner（全slot/台帳を含む）。これで元RecordSourceの&mut借用を終える。
4. 未移譲のinert scan入力/Quotas/policy holder（owner生成前の失敗も含む）。
5. 元RecordSource→TopologySource→HeldTargetScope。既存外側経路の順序を維持する。
6. TopologyReceipt、RecordReceipt、InspectionContext等。各値を借用するownerを先に解放する。contextが借りるregistry/groupsの元データは借用終了前に破棄しない。caller所有の元データの解放まで本関数の証拠に含めない。

途中のErrでcleanupを飛ばす `?` を外側解放sectionへ置かない。失敗resultを保持したまま、正常/失敗の両方で同じ解放sectionを通る構造にする。新しいI/O/再closeを追加せず、既存scan resourceの予約済みcleanupを打ち切らない。

### 6.2 解放の証明範囲

外側の診断用状態は仮称 `DropSequenceNotReached / DropSequenceReturned` とし、全通常dropが戻った事実だけを記録する。`cleanup: complete/confirmed` と呼ばない。scanのConfirmed/Incomplete/NotStartedは失敗attemptに由来する既存CompletionFailureの内容であり、外側のFD/OS解放確認とは別である。

generic source/heldのDropのbounded性、実close成功、panicしないことを型だけで証明したとはしない。合成sourceでDrop回数と順序を検証し、OS sourceへ進む前に明示的解放/確認の契約を別途設計する。blocking Dropをcheckpointで強制中断できるとは主張しない。

## 7. 解放後の最終checkpointと結果の合流

元SharedBudgetは借用入力なので解放後も残す。source.clockや新budgetを使わず、同じ `budget.checkpoint()` を必ず一度実行する。budget/claimのsticky failure、取消、元monotonic期限を既存優先順で評価する。最終checkpoint自体は新しいwork/I/Oを要求しない。

| 保持しているbody結果 | 解放後checkpoint | 最終結果 |
|---|---|---|
| pending Compared | Ok | この時点だけRecordComparison相当の内部結果へmove。permitではない |
| pending Compared | Err(e) | 比較結果を破棄し、PostReleaseCheckpoint起点の失敗。元budget.stop(e)を保持、round=None、completion=None |
| 失敗診断 | Err(e) | 元診断をそのまま返す。eは既存sticky理由の再観測であり、新しいcleanup票や別の原因に置換しない |
| 失敗診断 | Ok | 既存失敗を成功にしない。元理由をbudget.stopへ再通知し、同じ診断を返す。実装上の不整合として合成試験で検出する |

ownerが既にdrop済みならowner.stop_inspectionを呼べない。解放後だけの新しい失敗は、元budget.stopが保持する同じshared session claimへ記録する。破棄済みledgerのenumを更新したと偽らず、再生成もしない。元claim/budgetでinspectionが再開不能になることを確認する。

最終checkpointの観測状態は仮称 `NotReached / Passed / Stopped(primary)` とする。bodyが既に失敗していればcheckpointは先行理由で短絡するため、その後に別の取消/期限があったかを識別できない。追加clock読取やreasonの再計算で「二次原因」を作らない。

## 8. 上位への診断保持契約案

戻り値案はprivateな `Result<RecordComparison, OuterStrictFailure>`。OuterStrictFailureは固定サイズ・非Clone/非Copy/非serde・opaque Debugとし、次をinlineで保持する。

- `primary`：元budget/claimで確定したFailure。後のDrop放棄やcheckpointで上書きしない。
- `phase`：Entry、Receipt、OuterClock、OwnerCreate、Initial、TopologyPrepare、Compare、AfterHandoff、AfterRound、BodyCheckpoint、PostReleaseCheckpoint等の固定enum。新しい公開JSON列挙値ではない。
- `inner: Option<StrictInspectionFailure>`：owner/kernelが実際に返した値だけをmove。reason/round/実CompletionFailureを保持する。上位wrapperの都合でroundをAfterM4等に推測し直さない。
- 外側drop到達状態と最終checkpoint観測状態：§6〜§7の診断だけ。成功/cleanup証拠のconstructorには渡せない。

生成時にownerがない場合や、ack後の外側失敗はinner=Noneでよい。過去のClosed/summaryを集めて全体成功票を作らない。既存のCompletionFailureはownedな診断/会計identityを保持し、live scan handleの移譲口ではない。上位へ移すためにunsafeや参照延命をしない。

上位への引渡しは値のmoveを一度だけ行う。限定accessorはreason/phase/roundと診断のread-only参照までとし、source・コード本文・record bytes・path文字列・registry/groups・tokenをDebug/ログへ出さない。失敗後のJSON生成/ログ/heap確保が成功することを、停止や診断保存の前提にしない。固定サイズの上限は実装時のsize試験で確定する。

既存 `Result<RecordComparison, Failure>` への `map_err(reason)` を暗黙に追加しない。最初はprivate合成入口から呼出し側までOuterStrictFailureを保持する。将来上位が裸Failureだけを要求する場合は、structured診断を先に所有して保存できる別の内部契約を承認するまで接続を止める。MCP応答・host終了コードへの展開は本設計の対象外。

## 9. 共有予算・費目・panic

- 元budget/started/origin/claim/retry、累積bytes/work/resource枠を維持する。停止・診断move・既存cleanupの実行は、失敗後の新規work確保に依存させない。
- receipt/hash/clockの既存R費、3roundのscan/index/tail/ack費を維持する。現行owner/kernel/topology/finish追加30 workを外側費として再課金しない。
- 新しい固定入口・body完了確認のguardはO.outer_entry/O.outer_body_done候補として別計数する。unit/checkpoint数は未確定で、合成計数と独立oracleを揃えるまで全体上界へ確定値を足さない。解放後の最終checkpoint・先行失敗の保持には追加workを課さない。
- 全体受付は無効のまま。新費目・診断サイズ・解放費/最大保持数を承認済み上界へ吸収したと扱わない。
- 通常のpanic/unwindで成功を返さない。Dropが戻らない/二重panic/abort/killでは通常の終了診断やDropSequenceReturnedを保証できない。catch_unwindでpanic本文を公開したり同sessionを再開したりしない。専用host/外側監督による終了確認は別契約である。

## 10. 外側orchestrator全体の合成受入条件（全体は未実施、内部subsetは§12）

1. 正常系：receipt→外側clock→owner生成→Initial→B/recheck/BeforeM4→M4→AfterM4→body checkpoint→全解放→最終checkpoint→結果公開の独立イベント列。同source identity、record再読6cycle、index decode3を確認する。
2. receiptのlineage/binding/pin順序/bytes/hash/size不整合でowner/scan/外側source.clock未到達。clockの取得失敗・wall/monotonic不整合・期限・遅延成功/エラーでowner未生成。元Failureを保持する。
3. 各既存kernel/M4/handoffの失敗で後続段階を開始しない。元round/CompletionFailure/summary/Incomplete理由を上位まで同じowned値として保持し、停止通知でNoneへ置換しない。
4. AfterM4 ack後のbody checkpoint失敗でpending比較結果を破棄しownerをStoppedにする。既存scan cleanup票は再構築しない。
5. 最後のsource/held/records等のDropで時刻を進める/取消を立てる合成sourceを使い、解放後checkpointで遅延成功を拒否する。全Drop後に検査されたこと、budget/claimが元のまま停止することを確認する。
6. body失敗＋解放中の取消/期限でも主理由・inner診断を維持する。sticky短絡を未知の二次原因と記録しない。未開始/既に消費済みのcleanupを捏造しない。
7. owner生成前/後、未使用slotあり、M4前/後、Finished後の全終了経路で一度だけのDrop・借用終了順を検証する。genericな実OS close成功とは区別する。
8. 別receipt/context/budget、重複owner生成、別handoff、drop/forget、model/policy欠落を拒否し、source/slot/台帳の再生成と旧ClosureSource fallbackが0であることを確認する。
9. 新guardの全work不足prefix/課金後取消/checkpoint期限と診断inline sizeを計数する。budget枯渇後でも停止・診断move・既存cleanupが行えることを確認する。
10. receipt検査省略、外側clock省略、診断のreason-only変換、解放後checkpoint省略/解放前への移動、checkpointの `?` による診断破棄の各変異を検知する。
11. 通常strict.rsの旧経路、APPROVED_REGISTRY/受付/DER/absence/permitのgateが未変更であることを差分で確認する。成績を実OS/PDI/運用品質の証拠へ転用しない。

## 11. 実装順と未確認事項

1. OuterStrictFailure/phase/drop/checkpoint観測の内部型と、owned診断を失わない結果合流器を合成で先に検証する。
2. ownerの固定body完了helperと、receipt/外側clockから3slotまでのprivate合成orchestratorを接続する。公開trait拡張や通常strict差替えを同時に行わない。
3. 解放section・解放後checkpoint・上位への一度限りのmoveを接続し、成功/拒否/中断と変異を検証する。
4. 新O費/保持サイズ/resource上界を確定し、通常strict呼出し側のopaque入力bridgeと上位診断保存契約を別途レビューする。

未確認：上記lifetime/visibilityの実コンパイル、全分岐のowned値移動と診断サイズ、保護policy供給口、通常strict上位のstructured error所有先、generic Dropのbounded性/実OS解放確認、全体受付上界。未解決部分を自動承認で埋めず、停止を維持する。

## 12. 実装済み：OuterStrictFailure・診断用結果合流器（draft-0.2）

### 12.1 型と限定口

[outer_result.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/outer_result.rs)に、private fieldのOuterStrictFailureを追加した。非Clone/非Copy/非serde、固定opaque Debugで、元primary・OuterPhase・ownedなOption<StrictInspectionFailure>・DropObservation・PostReleaseCheckpointをinlineで保持する。サイズは合成テストで384 bytes以下を要求する。

plainは元budget.stopの先行理由を採用し、innerなしの失敗だけを作る。from_innerは元StrictInspectionFailureを丸ごと一度moveし、roundや実CompletionFailureを理由だけへ縮退させない。reason/phase/round/inner参照/解放観測/checkpoint観測のread-only accessorだけを設け、完了setterや任意Closed生成口は追加しない。OuterPhaseには解放section自体の未到達拒否用にReleaseも含む。

実装名DropObservationはNotReached/SequenceReturned、PostReleaseCheckpointはNotReached/Passed/Stopped(Failure)。どちらも診断用enumで、resource解放を型で証明するtokenではない。

### 12.2 結果合流

`merge_after_release<T>` は `Result<T, OuterStrictFailure>` と解放観測、元SharedBudgetを受け取る。bodyがErrでもcheckpointを一度評価し、その後に結果を明示合流する。`?` で元診断を捨てない。

- body Errでは元primary/phase/innerを保持し、観測だけを追記。checkpointがPassedでも元理由を再度stopしてErrのままとする。通常は先行failureによりStopped(primary)となり、二次原因は推測しない。
- body Ok＋checkpoint Stoppedではpending値を破棄し、PostReleaseCheckpoint起点・innerなしの失敗にする。
- body Ok＋checkpoint Passedでも、SequenceReturnedでなければRelease/Unavailableで拒否する。
- body Ok＋SequenceReturned＋checkpoint Passedだけが元Tをそのまま返す。RecordComparisonやpermitを新しく生成する機能ではない。

コンストラクタ・失敗移動・結果合流には新規work/I/O/heap確保を要求しない。work上限を使い切っても停止と保持を行う。既存30 workや全体上界に新費目を加える変更はない。opaque Debugを利用者がformatする際の確保まで不要と主張するものではない。

### 12.3 検証範囲と未接続範囲

[結果合流器合成記録](E2E_BEST_PRACTICE_R2_OL03_OUTER_RESULT_SYNTHETIC_2026-10-22.md)の新規6テストを参照。実kernelの全3roundから得たConfirmed/Incomplete/NotStartedとsummaryを、ownerの停止通知・source/record破棄後も保持する。成功/失敗×checkpoint成功/失敗、解放未到達、先行理由、work枯渇、遅延取消/期限、不整合なPassed、型/サイズ/Debug、診断破棄・checkpoint省略の変異を確認した。

これは診断用の単体部品で、外側orchestratorそのものではない。同じinspection budgetを渡すことと実解放後に呼ぶことは、今後の固定callerの責務であり、この部品はreceipt/budget identityの結合tokenや実解放証拠を発行・検証しない。診断enumや汎用Tからstrict/OS/実行成功を主張してはならない。上位の通常strict戻り値も未変更である。

残るのは§11の②以降：固定body完了helper、receipt/clockからのprivate orchestrator、固定解放sectionと実呼出し順の結合、上位へのstructured診断所有、新O費・保持/resource上界。§11の未確認事項のうち本型と合流器のコンパイル・実診断移動・サイズだけを今回確認し、外側全分岐やOS保証は未確認のままとする。全体受付無効・telemetry保留を維持する。
