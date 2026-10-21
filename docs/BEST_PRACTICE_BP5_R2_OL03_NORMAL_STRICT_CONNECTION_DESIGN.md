# BP-5 R-2 OL-03：通常strictの固定3箇所・同RecordSource・M4 owner接続詳細設計

Version: draft-0.1 / Date: 2026-10-21 / Baseline: `fd1de54` / Status: 設計案。新owner・handoff・通常strict接続は未実装。

## 1. 範囲と不変条件

[終了証拠設計draft-0.9](BEST_PRACTICE_BP5_R2_OL03_STRICT_COMPLETION_DESIGN.md)の後続として、実装済みの固定collector→typed tail→strict acknowledgementを通常strictの内部orchestratorへ接続する構造を具体化する。以下の型名・method名・追加費目は**提案**で、コンパイル済みAPIや実測値ではない。

全体受付は無効、telemetry調査は保留。APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absenceの停止を解除しない。実装・OS接続・実機操作・token発行・設定変更・本番policy投入・permit発行は本工程の対象外。

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

collector用sourceはRecordSourceとは別物で、同じScanOps型のinertな3slot（各Option）をownerが値で保持する。slotを最初のfallibleな利用処理前にtakeし、失敗時にも補充/clone/返却しない。生成/未使用dropでOS取得やI/Oを行うsourceはこのsubsetへ入れない。未使用slotは停止後に破棄し、skipしたroundを後から実行しない。

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

adapterとhandoffはこの安定ownerをborrowする。内部の一意tokenはopaque identityとしてのみ使い、ID文字列・再利用可能nonce・allocation addressを外部証拠にしない。すべての照合はborrowが有効な間に行う。holder/receiptを動かして同一性を判定するraw pointer保存やunsafe参照復元は使わない。

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

1. private owner／3slot／同source借用／外側停止・診断結果の内部契約を先に実装し、合成sourceで確認する。通常strictはまだ差し替えない。
2. 固定topology adapterとBeforeM4Position／AfterM4Handoffを合成検証し、B・recheck・M4の位置とowner結合を固定する。
3. 固定round kernelを実collector/typed ackへ接続し、旧経路との順序・費目・終了順序を照合する。通常v2の入口は停止したままにする。
4. 診断の上位引渡し、O費/全体work/resource上界、運用policy信頼元とcapの承認を別工程で確定する。OS source・受付・署名policy・permitはそれぞれの承認なしには接続しない。

Rustの具体的なlifetime/可視性と、topology callback中にowner/ledger/sourceを排他的に借用できることは未コンパイル。ownedな循環参照やRefCellによるsource借用回避で解決せず、安定borrowと固定helperの境界を小さくして検証する。新diagnosticの固定サイズ上限、model ID、各guardのunit/最悪経路費は実装前後のレビュー対象。これらが未確定である限り実運用の安全性・受付可能性を主張しない。
