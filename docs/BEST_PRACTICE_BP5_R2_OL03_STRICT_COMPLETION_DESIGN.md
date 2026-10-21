# BP-5 R-2 OL-03：型付きcleanup証拠・round完了・strict acknowledgement詳細設計

Version: draft-0.10 / Date: 2026-10-21 / Status: cleanupからtyped strict acknowledgementまで内部実装・合成検証。通常strict接続の詳細設計を追加、接続実装は未実施。

## 1. 範囲と根拠

基準は `db8d8d1`。repository内の `strict.rs`、`round_declaration/phases.rs`、`session.rs`、`session/resources.rs`、`scan_ops.rs`、`scan_ops/collector.rs`、`topology.rs` を読み、[3round台帳設計§19](BEST_PRACTICE_BP5_R2_OL03_THREE_ROUND_RESOURCE_LEDGER_DESIGN.md)と[estimate bridge設計](BEST_PRACTICE_BP5_R2_OL03_ESTIMATE_BRIDGE_DESIGN.md)に続く内部契約を定める。外部仕様/SDKの調査や実機確認ではない。型名・関数名は案であり、公開API/JSON契約ではない。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。初稿は設計のみで、§13にscan_ops終端の最初の内部実装を追記した。通常strict接続、OS接続、実機操作、token発行、設定変更、本番policy投入、permit発行は含めない。証拠はinspection内の診断に保持し、実行権へ変換しない。

## 2. 初稿時の現状と不足（後続実装は§13〜§19）

| 現状 | 接続前に必要なもの |
|---|---|
| session経路の固定collectorはOutcome/Summaryに加えtyped CleanupDispositionを保持（§13） | cleanupとscan成功を結合する固定adapterは未実装。数値から証拠を再構築しない |
| with_resourcesは排他的scopeとactive cellを持ち、終了時に失効する | 失効・local/session照合の完了と成功結果を結合して返す固定adapter |
| sessionにはActive/AwaitStrict/Finishedがある | cleanup済みscan成功からだけActive→AwaitStrictへ進める消費型API |
| cfg(test)だけがackを模擬して次roundへ進む | 通常strictの実際の後処理末尾が発行するone-shot acknowledgement |
| 通常strict_roundはClosureSource::scanを呼ぶ | 固定collector＋sessionを呼ぶ別の内部経路。旧Result-only traitでcleanup証拠を落とさない |
| compare_topologyのBeforeM4 callbackはB後・M4取得前に呼ばれる | 同位置を維持し、AfterM4はcompare_topology成功後に限定する |

現行Summaryはlive、pending_cleanup、unconfirmed、retry_pending、declared_pending等を含むが、reserved_liveやdeclared_abandoned、実行/終了nonceを直接表さない。Summaryの全0やOk(())だけを成功証拠として採用できない。既存783テストは前工程の成績であり、本設計のproducer/ackを検証した数ではない。

## 3. 分離する証拠と所有者

初稿の候補submodel名は `bp5-r2-strict-round-completion-0.1`。§14でround完了subsetの固定producer/consumerへ実装したが、運用registryへ登録した値ではなく、strict ackを実装した識別子でもない。

| 内部型案 | 発行できる場所 | 意味・禁止事項 |
|---|---|---|
| CollectionAttempt | 固定collector入口とscan_ops boundary setup | 同Inputs/round/session接続に結合した唯一の実行identity。単独では成功/cleanupを主張しない |
| ClosedScanResources | scan_opsの終端finalizerのみ | 実開始済みscanのOwner/予約/宣言/retry残が解消し、解放試行が確認済み。scan内容の正しさやbudget健全性とは別 |
| CleanupDisposition | 同finalizer/開始前adapter | NotStarted（終了証拠なし）、Confirmed(ClosedScanResources)、Incomplete(有限診断)を区別。失敗Outcomeにも移動して保持する |
| RoundScanSuccess | 固定session adapterのみ | 同AttemptのObservation成功＋ClosedScanResources＋bridge/境界終端checkpoint成功。cleanupだけ/Observationだけからは作れない |
| PendingStrictRound | sessionの消費型round-completeのみ | Active scopeとRoundScanSuccessを消費しAwaitStrictへ移した所有者。排他的session borrowを保持し、まだ次roundは開かない |
| StrictAcknowledgement | strict.rsの固定tail finalizerのみ | 同PendingStrictRoundについてAfterScan以降の必須処理が全て成功した証拠 |

全て非Clone/非Copy/非serde、private field/constructor、Debugは固定opaque labelとする。診断用の数値表示と証拠は別型にし、数値、bool、enum、JSON、SummaryからのFrom/Deserializeや復元口を設けない。CleanupDispositionは成功権を持たないため、Confirmedを保持した失敗報告をround-completeへ直接渡せない形にする。

producerの可視性は必要なstrict内部までに限定する。`unsafe`な参照復元、global map/ランダムな文字列ID、任意callbackによる「完了自己申告」を導入しない。

## 4. 共通bindingとone-shot

証拠は元session claim/origin/started、同receipt object/lineage、同target/context、同RoundScope object/token、固定slot、同Inputsの実行claim由来、同Connection/CollectionAttemptのprivate nonceへ結合する。既存hash/generation/path値の一致だけでは代替しない。

実行/終了nonceはproducer内で作る非公開identityとし、保持はborrow/Rc identityなどで表す。scope objectが生存する期間だけ比較し、addressのdereferenceや出力をしない。Connectionのactive=falseは「この境界が終了した」条件の一つだが、任意の失効ConnectionをClosedScanResourcesへ変換してはならない。

- round接続claimに加え、finalize/complete/ackの試行claimも元owner側へ残す。最初のfallible処理より前に不可逆に消費し、失敗・drop後も解除しない。
- 値のmoveだけでは、同ownerから証拠を2回発行することは防げない。producer側のone-shot状態と消費型を併用する。
- 同じ内容の別receipt、別budget/started、別scope/token、別Attempt、別phase/slotの証拠はBindingで拒否する。record内容の実変更は既存Changed等を保持する。
- 終了証拠ができたslotはsealed/retiredへ移し、standalone境界を含む追加dispatchを禁止する。seal後の数値変更を許したまま過去snapshotを承認に使わない。

## 5. scan終端とcleanupの証明

### 5.1 必須条件

固定scan_ops finalizerは、全stack Ownerとsource所有を既存順序で破棄した後、元local台帳と同slotのsession台帳を直接参照して次を検査する。汎用のcaller-provided Summary検査関数にはしない。

1. CollectionAttemptが実際のEntered→boundary setupに由来する。同Connectionのdispatchは終了し、再接続claimも消費済み。
2. local/session双方のlive、live予約、cleanup予約が0。unconfirmedが0。
3. localのpending retryなし、declared_pending=0、declared_abandoned=false。未完了宣言をdropして数だけ0にした状態を受理しない。
4. localの成功取得数とcleanup実試行数が一致する。現行の成功取得serialを利用するなら、その単調増加/上限とCleanup試行への対応を検証する。Open試行数＋全Metadata試行数から成功取得数を推定しない。
5. 方式(b)のauthoritative event由来のattempts/names/live/予約/peak/unconfirmedが同roundで整合する。session累積値はそのまま保持し、local Summaryを加算しない。
6. 当該roundのConnectionを失効させ、slotをsealedへ固定する。退役前のaliasが新dispatchできないことを確認してからClosedScanResourcesを公開する。

local Summaryに未公開の項目は内部finalizerで取得する設計とし、外部JSONへ追加する必要はない。実行identityに結合したfieldを必要に応じ追加するが、snapshot全0の手作りfixtureを本番producerの代用にしない。

ここで開始とはEnteredに加えて実boundary setupが成功したことを指し、最初のsource操作の有無とは分ける。現行DispatchOutcome::Collectedでもquota/初期guardでBoundary構築前に失敗する場合があるため、CollectedのenumだけでClosedScanResourcesを発行しない。その場合は元のCollected診断を保持したままCleanupDisposition::NotStarted（証拠なし）とする。実boundaryが開始し、取得数0のまま終了した場合は、その実行identity/退役に基づく確認は可能だが、main Resultが失敗ならRoundScanSuccessはない。

### 5.2 失敗結果にも解放状況を残す

hash/集合/metadata不一致や取消でscanが失敗しても、全取得resourceのcleanupが確認済みならCleanupDisposition::Confirmedを診断として保持してよい。ただしRoundScanSuccessは発行しない。解放未確認/予約残/forgotten OwnerならIncompleteを保持する。最初のFailureをcleanup由来の理由で上書きせず、cleanup不成立は別項目として残す。

cleanupは既存のprepayとraw.takeの起点を維持し、停止後も他Ownerの一度限りの解放を続ける。証拠の発行に失敗しても再close/retryや枠の返金はしない。取消済みbudgetに新しいworkを要求してcleanupを省略しない。停止中の診断用終了情報の構築は、既存prepaid/有限な終端処理の一部として別途計数する。

### 5.3 証明する範囲

ClosedScanResourcesはscan所有者だけの内部契約である。外側held target、record/topology source等のownerやOSプロセス全体の解放を証明しない。元SharedBudgetのpayload reservedにはA/Bやrecord等の予約があり得るため、global reserved=0を要求したりscan側から返却したりしない。sourceの単発/非panic/事前handleなし契約を前提とし、隠されたhandleやOS上のABA/解放の真実性まで証明したとはしない。

## 6. 固定session adapterとround完了

初稿時のwith_resourcesはResult<()>を返してactiveを退役させるだけで、成功producerはなかった。§14では固定collector用adapter内で、Outcomeをcapture→境界を退役→終了証拠を確定、という順序を実装した。任意FnOnceから成功tokenを返せる汎用口へ拡張しない。

```text
consume estimate / original Inputs claim
  -> connect once / enter fixed collector
  -> actual scan + S.seal
  -> Owner cleanup / source retirement / local terminal report
  -> Connection retirement + session terminal comparison
  -> bridge + boundary terminal checkpoint
  -> RoundScanSuccess OR failure-with-cleanup-disposition
```

RoundScanSuccessは上記の最後まで成功した場合のみ発行する。途中で作成した仮tokenをcheckpoint失敗後に戻さない。late cancel/deadlineなら成功Observationを捨て、cleanup診断を残して停止する。NotStartedではAttempt/cleanup成功票を捏造しない。

`complete_round(active_scope, success, &mut original_budget) -> PendingStrictRound` は両方を値で消費する案とする。開始時にcomplete claimを消費し、同binding/Attempt/closed slot/現在Active/元budgetの健全性を検査し、終端checkpoint成功後だけAwaitStrictへ移す。失敗はStopped、どちらも再返却しない。

PendingStrictRoundは元ledgerへの排他的borrowと同RoundScopeのborrow、owned Observation、終了証拠を保持する。active_scopeの単なるdropを正常完了に読み替えない。PendingStrictRoundの未ack dropは共有claimへ停止を伝え、次roundを拒否する。既存completed boolの任意setterは公開せず、消費型遷移の内部だけで所有移動を扱う。

Observationは内部tailがAfterScanを終えたら現行同様に破棄し、その後はAttempt/phaseのidentityと終了証拠だけを保持する。Vecをackまで余分に保管してallocation寿命を延ばさない。利用者向けtake/差替え口は設けず、内部の単調なstage遷移で所有を扱う。

## 7. strict tailとacknowledgementの発行位置

順序は現行strict_roundから変更しない。記録/clock検証をindexのimmutable宣言再利用で省略しない。

| 順序 | 必須処理 | 完了の由来 |
|---|---|---|
| scan前 | reread_bytes→clock_check(450000)→verify_records | 元RecordSource/同receipt/context、hash-first/前後path/metadata検査を維持 |
| scan | with_round→decode→prepare_scan/Node→bind_inputs→profile/calculate→固定session collector | 同roundのInputs/estimateを消費。profile/台帳を作り直さない |
| round scan終了 | typed cleanup確定→complete_round | Active→AwaitStrict。次roundはまだ開かない |
| tail 1 | IndexPhases::after_scan(同Observation) | observed bindingとAfterScanのindex再認証/全集合照合が成功 |
| tail 2 | reread_bytes→clock_check(450000)→verify_records | record/path/metadata/time・activation/ledger/registryの厳密検証が再成功 |
| tail 3 | IndexPhases::finish | FinalIndexの再認証/集合/Node照合が成功 |
| tail 4 | clock_check(450000)→元budget checkpoint | 最終clockと同じ共有期限/取消が成功 |
| ack | private strict tail finalizer→session consume | 同PendingStrictRound/実phase完了に結合したStrictAcknowledgementを一度発行・消費 |

IndexPhases::Finishedだけではtail 2/4を証明できない。ClockReadingの数値、callerの「実行済みbool」、任意callbackのOkからackを作らない。strict.rsの固定tail ownerが実際の関数を順に呼び、AfterScan/record再検証/FinalIndex/最終clockを通過した内部状態からのみ発行する。record readerやindex phase単独にsession全体のack発行権を与えない。

ackは同Attempt/phase owner identityと固定完了modelに結合する。PendingStrictRoundのborrowをackが持ってから両方をmoveする循環は作らず、照合用identity/既存安定borrowを保持したownedな非Clone証拠をprivate finalizerから直ちに消費させる。発行と消費の間にawait/利用者callbackを挟まない。消費時にも元budget checkpointを行い、その間の取消/期限切れではStoppedへ移す。

| ack対象 | 成功時のsession状態 | 意味 |
|---|---|---|
| Initial | Expect(BeforeM4) | BeforeM4の固定位置まで進める期待状態。自由なscan開始権ではない |
| BeforeM4 | Expect(AfterM4) | M4そのものは未実施。M4失敗なら次へ進まず停止 |
| AfterM4 | Finished | 当該tailの最終clock/checkpointまで完了。外側終了/permitは別 |

### 7.1 ackとwith_roundの終端checkpointの順序（2026-10-21、レビュー）

PendingStrictRoundは `with_round` が生成・所有する `RoundScope` をborrowするため、ackの発行と消費は `with_round` のclosure内で完了させる必要がある。一方 `with_round` はclosureの戻り後に `drop(scope); budget.checkpoint()?` を実行する。従って、sessionが `Expect(next)` や `Finished` へ進んだ**後**に、`with_round` の終端checkpointが取消/期限で失敗し得る。

- ackの消費はclosure内の**最後のfallible処理**とする。ack消費後にclosure内で新しいI/O・課金・検査を行わない。
- その後の `with_round` 終端checkpointが失敗した場合、sessionが `Expect(next)`/`Finished` であってもroundは失敗として返す。元budgetのfailureはstickyなので次roundの `begin` は拒否され、Finishedを理由に失敗を成功へ変換しない。
- Finishedのledgerはdrop時にclaimへ停止を書かないが、budget側の既存failureで外側bodyは停止する。ack成功とround/inspection成功を同一視しない。

## 8. 通常strictへの所有権・位置接続

session台帳はreview_strict_record_target全体のownerが一度だけ保持する。receipt/target/contextを借用したledgerが生きている間に、それらをmove/dropしない。各round helperの中でledgerを作る/早期dropする方式は採らない。元budget/started/retryを共有し、各roundに新budgetを作らない。

**session生成位置（2026-10-21、レビュー）**：`session::create` は `review_strict_record_target` 内で `validate_receipt` 成功後、最初の `strict_round(Initial)` より前に一度だけ呼び、`configure_resources` もその間で完了させる。各round helper内での生成・再生成はしない。生成後に外側 `clock_check(460000)` 等が失敗した場合、ledgerは `Expect(Initial)` のまま放棄されclaimへ停止が伝播する。これは意図した安全側の動作であり、同inspectionでの再生成・再試行経路を設けない。

Initialはvalidate_receiptと外側clock_check(460000)後の既存位置。BeforeM4はcompare_topologyがB走査後にtopology再照合を終えたmandatory callback内に固定する。このackが成功して初めてM4取得へ戻る。AfterM4はcompare_topologyがComparedM0M4を正常に返した後だけに固定する。単にround enumが順番どおりという理由でM4実施済みとみなさない。

通常経路では利用者指定Roundを受ける任意runnerではなく、このorchestratorの固定3箇所から呼ぶ。AfterM4開始は同inspectionの成功したM4比較owner/位置に結合する内部handoffを要求する。BeforeM4 ack後にM4/topologyが失敗した場合、その場でsessionをStoppedにし、Expect(AfterM4)を再開可能な状態として残さない。新しいM4比較を再実行する権利も発行しない。

ComparedM0M4は最終RecordComparisonにも必要なので、AfterM4用の位置結合で破棄しない。orchestratorが実比較結果を保持し、その生存borrowに結合した非公開の位置証拠をAfterM4へ渡す案とする。任意のenumからM4成功を再構築せず、比較結果の所有が終端まで残ることをコンパイル試験で確認する。

Rust所有権の順序は、plan/phase生成→Inputsのimmutable borrow→profile/estimate消費→owned Observation/cleanupへ移動→Inputsをdrop→phaseのmutable after_scan/finishとする。PendingStrictRoundはScanInputs/estimateの短いborrowを保持せず、安定したscope/receiptとowned Observationを持つ。これによりphaseの再検証を省略してborrow conflictを回避する設計にしない。具体的lifetime/Drop順序はcompile-fail試験で確認する。

既存ClosureSource::scan→Result<ClosureObservation>へ新Outcomeを押し込めない。固定ScanOps sourceを受けるstrict専用adapterを設け、成功/失敗双方でcleanup診断を移動する。旧traitは互換用の合成経路に限定し、session開始済みinspectionのfallbackに使わない。source/Quotasの可視性拡大が必要なら最小のstrict内部に限り、公開crate APIへ広げない。

**RecordSourceの同一性（2026-10-21、レビュー）**：typed record stage（`revalidate_records`）と最終clock stageが受ける `RecordSource` は呼出し側が渡す値で、traitに `ResourceOrigin` 相当のidentityがないため、scan前の再読に使ったsourceと**同一instanceであること**は検査していない。既存 `strict_round` も同じ形であり、内容面ではreceipt pinのbytes一致・walk照合・metadataで束縛されるため、別sourceへ差し替えても同内容を返さない限り `Changed` 等で停止する。通常strictの固定orchestratorへ接続する際は、scan前reread・各round tail・最終clockで同じ `source` を `&mut` 借用で順に使う所有構造により同一性を保証し、round helperへ別source/再生成factoryを渡す口を設けない。より強い束縛が必要なら、`RecordSource` にprivate originを追加してreceipt/session生成時に記録し、各stageで `Rc::ptr_eq` 照合する案を別途検討する（未実装）。

固定collectorはsourceを値で消費するため、新adapterには3round分のinert sourceを持つ非公開3slot ownerを置く案とする。固定位置で該当Optionをfallible処理前にtakeし、失敗でも補充/clone/再返却しない。生成・破棄時にhandle取得/外部効果を持たず、各sourceの操作だけが同じbudgetを使う。任意factory callbackからbounded性の分からないsourceを再生成する口は設けない。将来backendが事前resourceを持つならこの案をそのまま適用せず、取得/寿命/cleanup予約を別設計し、未承認の間は停止する。

外側の破棄順は、未完了Pending/ack/round scope→session ledger→借用元receipt/context/held等の順に制約する。ledgerはAfterM4 ackと外側bodyの最終checkpointまで生存し、Finished後もbodyが失敗すれば元Failureを保持する。既存のsource/topology_source/held/recordsの破棄とその後のcheckpointを省略しない。ledgerを先に正常dropしたことを外側cleanup成功の代用にしない。

## 9. 失敗・中断・Drop

| 条件 | 扱い |
|---|---|
| NotStarted/未提供policy/model不明 | 現行の有限理由を保持。cleanup成功票/complete/ackなし |
| hash/集合/metadata/record変更 | 元Failureを保持。cleanup診断は残すがRoundScanSuccess/ackはなし |
| cleanup未確認/live/予約残 | Incomplete。先行理由がなければUnavailable。数値0へのresetや再closeで救済しない |
| pending retry/未完了・放棄宣言 | 既存ReadFailed/Changedの区別を保持。cleanup済みだけで無視しない |
| 別identity/二重発行/二重消費/順序違反 | Binding。claim消費とStoppedを維持 |
| complete/tail/ack中の取消・期限・work不足 | 既存Cancelled/Deadline/Limitを保持し停止。spentを返金しない |
| Pending/未消費ackのdrop、unwind | 元claimへ最初の停止理由を伝える。新しいI/O/課金をDropで行わない |
| AfterM4 ack後の外側checkpoint/cleanup失敗 | 正常resultを返さず停止。Finishedを理由に既存Failureを消さない |

diagのConfirmedは「正常完了」の同義語ではない。逆にmain Failureが残っていてもcleanupの確認/未確認情報を捨てない。外側held/source全体のcleanup証拠やhost終了報告への接続は別課題であり、本設計のClosedScanResourcesを流用して全ownerの解放済み票を作らない。

## 10. 共有予算・費目

方式(b)を維持し、source試行/cleanupはscan_opsだけがwork prechargeする。cleanup/complete/ackでattempts/names/consumptionを再加算しない。retry減少後のrを元へ戻したり、既存payload予約を証拠発行へ転用したりしない。

新しいO費目は、実行identity確立、終了条件/両台帳比較とseal、complete claim/binding/state、tail進行/ack claim/binding/state、終端checkpoint周辺のpublicationへ分ける。既存I.AfterScan、R.record/clock、I.FinalIndexとsource cleanupはそれぞれ既存費目の所有を維持し、重複課金しない。比較は固定長の5分類/3slot以内とし、record/indexを証拠化のために再parseしない。

各新guardの正確なwork unit・終端診断用prepay・nonce/owner allocationは未計数で、0や既存1993へ吸収したことにしない。実装時に独立oracleで費目表/追加上界を更新し、completion modelの独立照合を追加する。全体I/R/O・管理allocation・運用capが未承認である限り、通常strictの合成接続に成功しても全体受付/permitは開けない。

## 11. 実装順と合成受入条件

1. scan_ops終端の型付きCleanupDisposition/ClosedScanResourcesを内部実装。既存diagnosticを保持し、ゼロSummaryからの偽造を拒否する。
2. 固定session adapterでConnection退役/slot sealとRoundScanSuccessを結合。late stopで成功を出さない。
3. complete_round/PendingStrictRoundを実装。Active→AwaitStrict、未ack drop停止までを合成確認。
4. strict tailのproducer/ack消費を実装し、実AfterScan→record→FinalIndex→clock順序と結合。
5. 通常strictの固定orchestratorに接続し、BeforeM4 callback/AfterM4位置、ledger寿命、従来failure伝播を確認。test ack bypassは新経路の合格根拠に用いない。

| 試験群 | 最低限の条件 |
|---|---|
| cleanup証拠 | 通常成功、hash失敗だがcleanup確認、未確認、遅延成功、予約/live残、forgotten Owner、retry/放棄宣言残、source未開始 |
| binding/one-shot | 別receipt/context/budget/start/scope/Attempt/Connection/phase、同内容別object、各producerの発行再試行、消費再試行、seal後dispatch |
| 型/寿命 | proofのClone/serde/raw constructor不可、scope/ledgerの二重borrow不可、短命Inputsを落としてphase可変遷移可能、Pending/ack drop停止 |
| tail failure | AfterScan、各recordの再読/path/metadata/hash、clock、verify_records、FinalIndex/Node、最終clock/ack各guardに失敗・取消・期限・work不足を注入 |
| M4位置 | Initial ack前のBeforeM4なし、B未完了時のcallbackなし、BeforeM4 ack失敗時M4取得なし、M4失敗時AfterM4なし、AfterM4 ack失敗時Finishedなし |
| 会計 | 全3roundのtrace/local/session同値、summary再加算なし、共有retry/payload維持、失敗prefix/cleanup後も新費目上界内 |
| 互換と停止 | 旧session未開始の合成契約を維持、session開始後の旧trait/collector迂回拒否、運用producerなし/全体受付無効を維持 |

以上は未実施の受入条件。既存の783 passedをこれらの検証結果へ転用しない。

## 12. 未確認・後続承認

- concrete lifetime、affine ownerのDrop実装、tail最終producerの可視性、既存Summary/Outcomeの互換移行は実装前レビューとコンパイル試験が必要。
- session failureを立てた後でも閉じたcleanup診断を保持できるprepaid範囲とallocation上界は未計数。診断生成不能ならUnknown/Incompleteとして安全側に倒し、成功票で代用しない。
- OS sourceの真実性・blocked I/O・hidden resource、更新lease/ABA/検査後差替え、role外側owner/hostの終了確認は本設計の証明外。
- 本番ResourcePolicy/信頼済みinspection contextは未承認。実装着手と合成検証、OS接続/実機検証、全体受付/permitの承認を分離する。

初稿文書検証の履歴：MDのみの設計更新として本書/親2文書の相対リンク先23件、fence対応、末尾改行/空白、diff checkを確認した（節anchor内容は未自動照合）。その時点ではRust実装・ビルド/テスト再実行・実機実行は行っていない。後続実装の検証は次節と別記録に分離する。

## 13. scan_ops終端の最初の実装subset（draft-0.3）

### 13.1 発行元と区別

`scan_ops/cleanup.rs` に非Clone/非Copy/非serdeのCleanupDisposition、ClosedScanResources、IncompleteCleanupを実装した。Outcomeへcleanupを追加し、固定collector/bridgeの成功・失敗・late stopでも移動して保持する。Summaryからの復元、boolによるconstructor、round成功/ackへの変換はない。Debugは固定labelで、pointer/path/数値や秘密を出力しない。

- NotStarted：実boundaryがまだ構築されていない。quotaなし・setup/prepay中の中断など。Collectedでもこの診断になり得る。
- Confirmed：実boundary由来のone-shot終端検査を通ったClosedScanResourcesを所有する。main ResultがErrでも発行でき、成功権ではない。
- Incomplete：local/sessionの残や不整合、解放未確認、pending retry/放棄宣言などで終了条件を証明できない。主Failureと数値診断を別々に保持する。

Incompleteの読取専用CleanupIssueは、Duplicate/Binding/OwnersRemaining/ReleaseUnconfirmed/PendingRetry/DeclarationIncomplete/AcquisitionMismatch/SessionMismatchの固定語彙とする。診断コードは証拠ではなくconstructorへ再入力できない。主Failureと異なる終了不成立理由も保持できる。

Ledgerへprivate lifecycleを追加し、開始時に元budget origin/claim/startedを固定する。元LedgerのRc identityが実行identityを兼ね、終了claimは同Ledgerに不可逆に残る。sourceの所有破棄後にだけ固定finalizerを呼ぶ。二重finalizeはBindingで拒否し、取得成功serialとCleanup実試行の不一致も拒否する。未開始/全0のSummaryを受けて証拠を作るAPIはない。

### 13.2 sealとsession照合

localのlive/live予約/cleanup予約/unconfirmed、pending retry、宣言残/abandonedを検査する。session接続時は、finalizerだけが構築するborrowed LocalTerminalをConnectionへ渡し、元budget binding、同slot/接続claim、local/roundの全会計一致と3round合算の保存則を固定3×5以内で照合する。ownedなTerminalCounts projectionは数値診断であり、RetiredConnection producerへ代わりに渡せない。

同Connectionのactiveをfalseにし、session slotのterminalizedを不可逆に消費する。local finalized/slot terminalizedの両guardが追加dispatchを拒否する。ClosedScanResourcesは元Ledger/budget由来と、session経路なら非CloneのRetiredConnectionも保持する。未開始の場合はConnectionを失効させるだけで閉鎖証拠を作らない。停止後のprepaid cleanupは引き続き許可する。

sessionなしの低水準合成境界のConfirmedはlocal-onlyである。session付きClosedと区別される内部bindingを持ち、将来RoundScanSuccessが要求するsession bindingを代替できない。今回はClosedを消費して次phaseへ進めるAPI自体を作っていない。

### 13.3 prepayとmodel改版

開始時に終端証拠用の固定1 workを追加prepayし、取消/期限/work失敗後の分類・両台帳照合・seal・opaque診断で新たなwork/I/Oを要求しない。従来の終端checkpoint/work1はそのまま残す。main errorがあってもcleanup診断を失わず、不成立理由を主Failureへ上書きしない。global payload reservedやretry残を0へ要求/返金しない。

collector-work、collector-entry、session-collector-entryを0.2へ改版。calculatorのcontrol上界を `37+4E+D`→`38+4E+D` とし、独立wide oracleも別に更新した。cleanup submodelは `bp5-r2-scan-cleanup-0.1` を独立literalで照合する。resource数量モデルの操作式/ID0.2は変えず、そのkernel bindingだけをwork-0.2へ更新した。

| fixture | 旧 | 新 |
|---|---:|---:|
| kernel実費S | 1902 | 1903 |
| 単一bridge（profile/計算込み） | 1991 | 1992 |
| session bridge | 1993 | 1994 |
| session bridge・EINTR1の最初のround | 1996 | 1997 |
| calculator上界（r=8） | 2041 | 2042 |
| calculator base / remaining3round | 2014 / 6069 | 2015 / 6072 |

これらは固定blockの費目で、CPU時間/RSS/allocatorの保証ではない。証拠が保持するRc/状態は固定長だが管理allocation全体の受付は未対応。旧1993や旧modelで新しい全inspectionを受付済みとはしない。

### 13.4 検証と残課題

新規10テストを追加し、既存のsource trace/3round会計試験にもtyped診断の検査を加えた。[cleanup証拠合成記録](E2E_BEST_PRACTICE_R2_OL03_CLEANUP_EVIDENCE_SYNTHETIC_2026-10-21.md)を参照。低水準の主HashMismatch＋cleanup確認と、実collectorでhash失敗に伴い宣言が放棄されIncompleteとなるケースを区別している。

このsubset時点ではRoundScanSuccess、PendingStrictRound、complete、strict acknowledgement、通常strictのsource供給/全体接続は未実装だった。round完了までの後続実装は§14、strict acknowledgement/通常strict接続は引き続き未実装。test専用ackを本番へ移していない。

## 14. ClosedScanResourcesを消費するround完了subset（draft-0.4）

### 14.1 唯一の固定producer

`scan_ops/collector/completion.rs` の `collect_and_complete` だけが、既存estimate/session固定collector→with_resources終端検査/checkpoint→RoundScanSuccess→消費型complete_scanを順に呼ぶ。任意callback、呼出し側のOutcome/Observation/数値からsuccessを構築する入口はない。RoundScanSuccessは同じ実OutcomeのObservation成功とowned ClosedScanResources・数値診断を保持する。NotStarted/Incompleteや主Failureがあるとsuccessを作らず、終了診断を保持したCompletionFailureにする。

`round_declaration/session/completion.rs` のcomplete_scanは元Active scopeとsuccessをmoveで消費する。元sessionのslot別complete_startedを最初のfallible処理より前に不可逆に消費し、同receipt object/lineage・target/context・scope object/token・登録済みslot token・元budget origin/claim/started・同resource book・接続/退役済みslotを照合する。local-onlyのClosedはsession退役証拠を持たず拒否する。次のcheckpointまで成功してからだけActive→AwaitStrictへ進む。失敗は元Failureをstickyに保ってStoppedへ移し、claimを戻さない。

RoundScanSuccess/PendingStrictRoundはprivate field、非Clone/非Copy/非serde、固定opaque Debug。Closedの所有は成功票を経てPendingへ一方向に移り、失敗時はCompletionFailureのConfirmed診断へ移動する。数値summaryからの復元/差替えや再利用可能permitにはしない。

### 14.2 所有と未ack停止

PendingStrictRoundは排他的RoundResourceScope、owned成功票/Closed/Observationを保持し、scope/receiptの寿命に制約される。Inputs/estimate/declarationはborrowし続けず、Inputsをdropしてからafter_scan/finishへ進めることを合成試験で確認した。Observationは借用参照だけを公開し、take/差替え口はない。このsubset時点ではPendingの寿命まで保持していた。AfterScan成功後に破棄する後続stageは§15で追加した。

Pendingの未ack dropは既存leaseのDropで共有claimとsessionを停止する。forgetしてもAwaitStrictのままで、次roundのbeginがBindingで拒否する。全体成功/strict成功/次round権限を主張しない。3round slotを通す試験だけはcfg(test) acknowledgementを明示して用い、production ack producerは追加しない。

### 14.3 費目・失敗診断

完了submodel `bp5-r2-strict-round-completion-0.1` をproducer/consumerそれぞれの固定literalで照合する。追加費用はO.round_completeの固定3 work（claim/model1、既存require1、Closed/session結合1）とする。最後のcheckpointは追加課金なしで必須。collectorのwork/entry/session-entry 0.2、kernel1903、既存session1994は変更せず、この完了経路は1997（最初のEINTR round2000）。profile/計算済みのfixture開始位置ならkernel1903＋guard7＋entry1＋require/connect2＋complete3＝1916となる。3round完了だけの追加費は9 workで、将来ack/tail費や全体受付を含まない。

新規の可変走査/I/O、試行/bytesの再加算、cleanup予約の返金、budget更新はない。固定長CompletionFailureは主理由とcleanup/summary診断をinlineで保持し、停止後のBox確保を導入しない。この理由で該当Result関数だけにresult_large_errの理由付きallowを付ける。これは失敗の無視や上限緩和ではない。

### 14.4 検証・残課題

[round完了合成記録](E2E_BEST_PRACTICE_R2_OL03_ROUND_COMPLETION_SYNTHETIC_2026-10-21.md)を参照。新規9テストで実Closedの消費、3round slot（test-only ack）、receipt/round/budget結合、重複claim、work不足、全8checkpointの期限切れ、全3課金後の取消、未ack drop/forget、主失敗とcleanup診断の保持を確認する。既存合成fixtureを再利用した内部契約試験であり、独立した人手評価や未使用コードセットの評価ではない。

このsubset時点で未対応だったAfterScan直後のObservation破棄stageは§15に続く。strict tailのtyped acknowledgement、通常strictへの固定位置/source供給接続、全体work/resource受付・運用policyは引き続き未実装/未承認。全体受付無効・telemetry保留を維持し、OS接続・実機操作・token発行・設定変更・permit発行は行わない。

## 15. AfterScan後のObservation破棄stage（draft-0.5）

### 15.1 固定の消費型遷移

PendingStrictRound::after_scanはPendingを値で消費する。元sessionのslot別after_scan_startedを最初のfallible処理より前に不可逆に消費し、AwaitStrict・元budget・同Closed/session bindingを再照合する。続いて固定のIndexPhases::after_scan_for_roundを呼び、同RoundScope objectと固定submodelを照合してから**実際の既存after_scan**（Observation identity、index再認証、全集合照合）を実行する。呼出し側のbool/既実行申告や任意callbackからstageを作らない。

phaseが同値でも別RoundScopeに属する場合、既にCompared/Finishedの場合、集合不一致、取消・期限・work不足は停止する。元scopeではprepare_scanのone-shot claimによりphase ownerは一つだけであり、別scopeのphaseを承認へ混入させない。phaseへの短いmutable borrowをAfterScanRoundに残さず、同phaseのfinishを後で呼べる。通常strictのrecord/FinalIndex/clock tailを実施した証拠ではない。

### 15.2 Observationの所有終了

RoundScanSuccessはprivateなOwnedObservationを所有する。AfterScan成功後に値を分解してOwnedObservationを明示dropし、その後の終端work/checkpointまで成功してからだけAfterScanRoundを返す。新stageのfieldは排他的leaseとScanTailData（Closed/数値summary）だけで、Observation/Vecやそのborrowを持たない。ScanTailData自身はAfterScan証拠ではなく、Observationを捨てるだけでstageを作れるconstructorもない。

全失敗経路でもObservationを破棄し、CompletionFailureには元理由・Confirmed cleanup診断・summaryだけを移動する。破棄後の取消/期限でもstageを返さない。test-onlyのdrop probeは実OwnedObservationのDropを計数し、stage生存中にも1回だけ破棄済みであることを検査する。これはallocator/RSSやOS解放の測定ではない。既存のRust field dropを早い位置へ移したもので、新しいpayload copyやallocationはない。

AfterScanRoundは非Clone/非Copy/非serde、private field/constructor、opaque Debug。未ack dropはleaseを通じて停止し、forgetでもAwaitStrictのままで次roundを拒否する。まだproduction ackはない。将来のstrict tailはこのstageからrecord再読/厳密検証→FinalIndex→最終clock/checkpointへ進む必要がある。

### 15.3 費目と検証

submodel `bp5-r2-round-after-scan-0.1` を固定stage呼出しとphase側の独立literalで照合する。追加O.after_scan_stageは固定3 work（claim/pending binding1、phase owner/model1、破棄後終端1）で、既存AfterScanの全課金をそのまま残す。従来のkernel/bridge/completion/phaseモデルの上界を改変/返金しない。実fixtureの旧after_scan費＋3を独立の旧経路と比較する。3round追加control費は9であり、全体work受付は無効のまま。implicit Rust dropのCPU/RSSやhard期限の保証とは区別する。

[AfterScan stage合成記録](E2E_BEST_PRACTICE_R2_OL03_AFTER_SCAN_STAGE_SYNTHETIC_2026-10-21.md)の新規6テストで、成功/拒否、全work不足prefix・全課金後取消、破棄後の取消/期限、別phase/重複/集合不一致、3round slot（ackのみcfg(test)）、未ack drop/forget、非Clone等を確認した。Observation破棄を無効化する変異を検知し、復元後に再検証する。

通常strict接続・typed strict acknowledgement・OS source・運用policy/全体受付は未対応。telemetry調査は保留。実機操作・token発行・設定変更・permit発行は行わない。

## 16. AfterScanRoundからrecord再読・厳密検証stageへ（draft-0.6）

### 16.1 固定の実処理と結合

`session/completion/records.rs` のAfterScanRound::revalidate_recordsはselfをmoveで消費し、成功時だけRecordsVerifiedRoundを返す。元sessionのslot別records_startedを最初のfallible処理前に消費する。AwaitStrict、元budget origin/claim/started、Closed/session binding、同RoundScope objectに属するIndexPhasesがComparedであることを照合する。別phaseやFinishedへの早すぎる遷移は、RecordSourceの最初の操作より前に拒否する。

固定helper revalidate_round_recordsは、scope内の元receipt/target/contextだけを取り出し、既存の `reread_bytes → clock_check(margin=450000) → verify_records` を順に呼ぶ。receipt/time/厳密意味を呼出し側が再申告する引数や任意callbackを設けない。再読は従来どおりclock、全3 recordの前後path/metadata/byte一致/EOF/再walkを検査し、actual bytesと共有操作枠を計上する。その後のactivation/ledger-0.2/registryのhash-first・strict JSON/意味/binding検査を省略しない。Registryは既存のimmutable context由来であり、新たにOSから再読したとは主張しない。

helperをstrict.rs内に追加したが、通常strict_round/review_strict_record_targetの呼出し/順序/旧Result-only経路は変更していない。RecordSource::revalidateは歴史的なtest-only projectionであり、新stageはそれを一度も呼ばない。

### 16.2 所有・失敗・費目

RecordsVerifiedRoundのfieldは元の排他的leaseとScanTailDataだけで、Observation/JSON tree/record byteコピーを保持しない。元scope/receipt/inspectionの生存borrowを維持し、private constructor、非Clone/非Copy/非serde、opaque Debugとする。Sourceは通常strictと同じくmutable borrowし、このsubsetでSource owner自体をdropしない。一時handleは再読処理内のRAIIで解放し、Sourceが生きたままmade=freedを試験する。実OSの解放の真実性まで証明しない。

失敗時は元Failureをstickyに保ってStoppedへ移し、Closed/数値summaryをCompletionFailureへ移動する。claimを戻さず、次roundを開けない。未ack dropで停止し、forgetでもAwaitStrictのままで次roundを拒否する。FinalIndex/最終clock/ackはまだ成功していない。

submodel `bp5-r2-round-records-0.1` をstage呼出しと固定helperの独立literalで照合する。追加O.record_stage=3 work（claim/owner/phase binding1、固定helper/model1、実検証後の終端1）。既存の再読/clock/strict JSONの全費用は維持する。独立の旧tail直呼び列との実費差3、source操作数同一を検査する。3roundの追加control費は9。kernel/既存phaseの式を改版/返金せず、全体work/resource受付は無効のままとする。

### 16.3 検証と次工程

[record stage合成記録](E2E_BEST_PRACTICE_R2_OL03_RECORD_STAGE_SYNTHETIC_2026-10-21.md)の新規8テストを参照。厳密JSONを満たす合成activation/ledger/registryを使用し、実collector/AfterScanから新stageへ到達する。全source操作境界の失敗/取消/期限、一時handle解放、byte/metadata/path/EOF/clock不整合、ピン済み不正JSON、registry不一致、重複claim/別budget/phase誤順序、workの代表境界と最終課金後取消、3round slot（ackのみcfg(test)）を確認する。厳密検証呼出しを省く変異を拒否試験が検知した。

このsubset後のRecordsVerifiedRound→FinalIndex/Node厳密再照合は§17へ続く。最終clock/checkpoint・strict acknowledgement、通常strict接続・運用policy/全体受付・OS接続は引き続き未対応、telemetryは保留。実機操作・token発行・設定変更・permit発行は含めない。

## 17. RecordsVerifiedRoundからFinalIndex/Node再照合stageへ（draft-0.7）

### 17.1 固定の消費型遷移

RecordsVerifiedRound::verify_final_indexはselfをmoveで消費し、元session/slotのfinal_index_startedを最初のfallible処理前に消費する。AwaitStrict、record/AfterScanの消費済みclaim、元budget origin/claim/started、Closed/session bindingを照合する。続いてIndexPhases::finish_for_roundで同RoundScope object・Compared state・固定submodelを確認し、実際の既存finishを呼ぶ。呼出し側のFinished enum/検証済みboolや数値からsuccessを復元しない。

finishの既存順序は維持する：Compared遷移guard→immutable宣言のrecheck（index bytes再認証/hash-first・意味/全集合検査・元receipt/target/context/round結合）→verify_node_entries（Node path/mode/size/digest）→checkpoint→Finished。decodeを再実行せず、同roundで一度だけ解析した宣言を再利用するが、再認証/厳密意味の実行を省略しない。これは既存宣言とTargetDeclarationの再照合であり、Node実ファイル/OSや署名を新たに検証する工程ではない。

最後に元budgetの終端work/checkpointを通った場合だけFinalIndexRoundを返す。phaseが既にFinished、別scopeのphase、重複claim、別budget/取消/期限/work不足は停止する。phaseがFinishedへ進んだ後の終端失敗でも型付き成功を返さず、sessionをStoppedにして元Failureを維持する。

### 17.2 所有と費目

FinalIndexRoundのprivate fieldは元の排他的leaseとScanTailDataだけで、Observation/JSON tree/record byteコピーを追加保持しない。非Clone/非Copy/非serde・opaque Debugとし、未ack dropは停止、forgetでもAwaitStrictのままで次roundを拒否する。まだ最終clock/production strict acknowledgement/全体成功の証拠ではない。

submodel `bp5-r2-round-final-index-0.1` をstage呼出しとphase側の独立literalで照合する。追加O.final_index_stage=3 work（claim/owner binding1、phase/model1、終端1）。既存phaseの全費用と上界/slackを変えない。fixtureの旧finish実費28と新stage31を、既存remaining_current−87 slack＋transition1から別に照合する。3roundの追加control費は9。operation/bytes/retry/予約やrecord validationを再加算/再発行しない。全体work/resource受付はまだ有効化しない。

通常strictのorchestrator/旧finish呼出しは変更せず、合成経路に固定adapterを追加しただけである。test-onlyのRemaining読取口と既存正常record fixtureの共有は検証補助であり、運用の可視性やpolicyを広げない。

### 17.3 検証・残課題

[FinalIndex stage合成記録](E2E_BEST_PRACTICE_R2_OL03_FINAL_INDEX_STAGE_SYNTHETIC_2026-10-21.md)の新規7テストで、実費/phase上界の照合、全work不足prefix・全課金後取消・全checkpoint期限、別Compared phase/既Finished/重複/別budget拒否、元診断・Observation破棄維持、3round（ackだけcfg(test)）を確認する。Node checkerの異常入力4種は同じ固定関数を直接検査するcomponent試験として区別する。immutable入力をunsafeに書き換えてstageへ混入させない。

このsubset後の最終clock/checkpointへの消費型遷移は§18へ続く。実strict tailのack producer/consumer、通常strict固定位置接続、運用policy/全体受付、OS sourceは引き続き未対応。telemetryは保留のまま。実機操作・token発行・設定変更・permit発行は含めない。

## 18. FinalIndexRoundから最終clock/checkpoint stageへ（draft-0.8）

### 18.1 固定の実検査

FinalIndexRound::verify_final_clockはselfをmoveで消費し、元session/slotのfinal_clock_startedを最初のfallible処理前に消費する。AwaitStrict、既存のFinalIndex/record/AfterScan claim、元budget origin/claim/started、Closed/session binding、同RoundScope objectのFinished phaseを照合する。別scopeが実際にFinishedでも代替できない。重複/binding失敗はclock sourceの操作前に拒否する。

固定helper check_final_round_clockは元scopeのreceiptから既存clock_check(source, receipt, budget, 450000)を呼ぶ。caller-suppliedなwall/monotonic値や検証済みbool、任意callbackを成功producerにしない。実source.clockを1試行し、pinned startとのwall/monotonic/elapsed整合性・record残存期限を既存順で確認する。ClockReadingはhelper内で破棄し、後続stageへ数値時刻を渡さない。

その後の共有budget終端work/checkpointまで成功したときだけFinalClockRoundを返す。late source成功・source failure・取消/期限・work不足は元理由をstickyに保持し、CompletionFailureへClosed/summary診断を移して停止する。通常strictの呼出し順序/旧clock_check本体は変更しない。

### 18.2 所有・費目・時間分類

FinalClockRoundのfieldは排他的leaseとScanTailDataだけで、Observation/JSON tree/record bytes/ClockReadingは保持しない。private constructor、非Clone/非Copy/非serde、opaque Debug。未ack dropは停止、forgetでもAwaitStrictのままで次roundを拒否する。production acknowledgementやFinished sessionをまだ発行しない。

submodel `bp5-r2-round-final-clock-0.1` をstage呼出しとhelperの独立literalで照合する。追加O.final_clock_stage=3 work（claim/owner/phase binding1、固定helper/model1、終端1）。旧最終clockと同じsource試行1を共有topology操作枠へ計上し、bytes/retry/scan会計を増やさない。3round追加controlは9、旧clock試行を重複加算しない。全体work/resource受付は無効のまま。

fixture成功経路はbudget.now読取11回で、10回はcheckpoint、1回（7番目）は既存clock_check内のelapsed直接読取。checkpointで10秒到達を捉えた場合はDeadline、elapsed直接読取だけで10秒ジャンプを観測すると既存のclock整合性判定によりExpiredが先に返る。この既存分類を変更せず両方を停止として検証する。実時間/OS clock/hard期限の保証へ読み替えない。

### 18.3 検証・次工程

[最終clock stage合成記録](E2E_BEST_PRACTICE_R2_OL03_FINAL_CLOCK_STAGE_SYNTHETIC_2026-10-21.md)の新規7テストを参照。固定source.clock試行、重複/別binding/別Finished phaseのsource前拒否、全work不足/課金後取消、全11時刻読取境界、clock skew/source error/late result、主理由/cleanup保持、3round（ackだけcfg(test)）を確認した。実clock呼出し省略の変異を拒否テストが検知した。

このsubsetの後続となる実tail由来のStrictAcknowledgement producer/consumerは§19へ続く。通常strict固定位置接続、運用policy/全体受付、OS sourceは未対応。telemetry保留、実機操作・token発行・設定変更・permit発行なし。

## 19. FinalClockRoundからstrict acknowledgementへ（draft-0.9）

### 19.1 発行・即時消費と結合

FinalClockRound::acknowledgeは値を消費し、元session slotのack_startedを最初のfallible処理前に不可逆に消費する。AwaitStrict、complete/after_scan/records/final_index/final_clockの全claim、元budget/origin/開始時刻、Closedの同attempt/session/receipt/round結合、同RoundScope objectに結合したFinished phaseを要求する。別phaseがFinishedでも拒否する。

固定producerはprivateなStrictAcknowledgement（元の排他的lease・ScanTailData・固定modelのみ）を作り、その場でprivate consumerへ値で渡す。発行と消費の間にawait・利用者callback・公開handoffはない。非Clone/非Copy/非serde、opaque Debugで、利用者のbool/時刻/数値summaryから作るconstructorは公開しない。producer/consumerは独立literal `bp5-r2-strict-ack-0.1` を照合する。直接callerがackを取得して後から再利用するAPIは設けない。

consumerも元budget/Closed/AwaitStrictを再照合し、最後のcheckpoint成功後だけInitial→Expect(BeforeM4)、BeforeM4→Expect(AfterM4)、AfterM4→Finishedとし、lease.completedを設定する。その後にfallibleな処理は挟まない。排他的leaseと非Clone消費に加え、元slot側のclaimで重複試行も拒否する。失敗時は元Failureをstickyに保ちStoppedとし、元Closed/summaryをCompletionFailureへ移す。Observationは既にAfterScanで破棄済みで、新しい保持・再構築は行わない。

### 19.2 費目・終端境界

O.strict_ack=3 work/round（claim/owner/phase1、固定producer1、consumer/終端1）。各workの前後checkpointに加えproducer/consumer末尾checkpointを実施し、成功fixtureの時刻読取は計8回。3roundの追加control費は9。既存kernel/phase上界は変えず、全体受付は無効のまま。操作/bytes/retry/resource予約・scan費は追加・再課金しない。これはwork課金モデルでありCPU時間・RSSの証明ではない。

ack消費はwith_round closure内の最後のfallible処理として使う。with_round自身の末尾checkpointは引き続き必要で、その失敗はExpect(next)/Finishedへ進んだ後でも成功へ変換しない（§7.1）。合成テストではInitial後とAfterM4後の取消/期限を注入し、元budgetのsticky failureで再開できないことを確認する。Finishedは外側body/cleanup成功でもM4実施証拠でもpermitでもない。

### 19.3 検証と未接続範囲

[strict acknowledgement合成記録](E2E_BEST_PRACTICE_R2_OL03_STRICT_ACK_SYNTHETIC_2026-10-21.md)を参照。新規6テストで実collector→AfterScan→record厳密検証→FinalIndex→最終clock→実typed ackの3slotを通し、test-only ack setterは使用しない。重複・別budget/origin/開始時刻・別Finished phase、全work不足prefix/全課金後取消/全8checkpoint期限、元理由とcleanup診断、外側checkpoint失敗を検証する。既存final_clockの3slotテストも実ackへ置換し、FinalClockRoundのtest-only acknowledgementを削除した。前段stageのcomponent試験だけに残るcfg(test) bypassは実経路の証拠ではない。

通常strict orchestratorへの固定位置/source供給・M4 ownerの接続、全体work/resource受付、運用policy、OS sourceは未実装/未承認。telemetry調査は保留。実機操作・token発行・設定変更・permit発行・Pushは本工程で行わない。

## 20. 通常strict接続の後続詳細設計（draft-0.10）

[固定3箇所・同RecordSource・M4 owner接続詳細設計draft-0.1](BEST_PRACTICE_BP5_R2_OL03_NORMAL_STRICT_CONNECTION_DESIGN.md)で、元sourceをinspection全体で排他的に借用するprivate owner、inert 3slot、B/topology recheck後の固定BeforeM4位置、同実比較結果を所有する非複製AfterM4 handoff、外側失敗時のsession明示停止と診断保持を具体化した。型名/費目/lifetimeは案で未コンパイル、合成受入条件も未実施。

既存ResourcePolicyの本番constructorがないことと、全体受付未承認を接続設計の停止条件として維持する。旧ClosureSourceやtest-only ackへのfallback、Round enumだけのAfterM4開始、M4失敗後の再開を認めない。接続用O費・上位診断契約・運用capは別途確定が必要で、通常strict/OS接続・実機操作・token発行・設定変更・permit発行は本更新に含めない。
