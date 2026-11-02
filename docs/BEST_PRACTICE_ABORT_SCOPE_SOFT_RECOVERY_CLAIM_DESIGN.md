# WJ-C残工程：soft回復claim・世代移行の詳細設計

Version: br006-soft-recovery-claim-draft-0.15 / Date: 2026-11-02。
Status: **SR-A（§12）、SR-B（§13）、SR-C①（§14）とSC2-Aの証拠移譲・strict準備入力、SC2-Bの必要verify・同prefix fake会計、SC2-Cの合成新世代ready・別cleanup診断、SC2-Dの非実行plan境界を独立合成issuerで限定実装。実回復route・実生成元／cleanup接続・SR-Dは未実装。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。**

基準HEAD: `2804af5`。[親設計](BEST_PRACTICE_ABORT_SCOPE_WORKER_TIME_BINDING_DESIGN.md)§7・13の差分。WJ-Cの通常finish限定実装を変更せず、次の合成実装範囲を定める。実worker／runtime接続、実通信・実機操作、設定変更、本番cap／Permit投入・Pushの承認ではない。

## 1 現行根拠と適用範囲

| 根拠 | 現行挙動 | 設計に必要な区別 |
|---|---|---|
| [adapter](../src/review/update-set-adapter.ts)のsoft分岐 | BoundedReadErrorのphase_deadline_exceeded、またはanalysis段階のReviewWorkerErrorのdeadline_exceededを扱う。progress・元remaining・取消を検査する | コード文字列だけで回復を認めない。元の型・phase・生成元・run状態の証拠を必要とする |
| 同adapterのcpu／finish | workerは遅延生成。phase期限ではcpuを閉じず、worker期限ではclose後にcpu参照を外す | phase期限時にworkerが未起動ならfinish用の初回起動。既存workerがある場合は同世代維持。両者を交換と混同しない |
| [監督](../src/review/worker-supervisor.ts)のrequest／exchange | ready待ちにも元phase remainingのtimerを使う。request失敗時はcloseをawaitする | analysis呼出し中のready期限もadapterのsoft分岐に入り得る。未送信analyzeのjob id／pendingを捏造しない |
| 同監督のclose | terminate Promiseを一度保持し、成功後に固定listener／stream処理を行う | エラーを受けた事実だけでは終了確認にならない。成功した同世代の固定close継続だけを証拠発行元にする |
| [合成job issuer](../tests/support/review/synthetic-worker-job.ts)／[時刻owner](../tests/support/review/synthetic-worker-time.ts) | fail／revokeでidentity・pendingを消す。未消費inputやpendingがあれば通常finishを拒否する | 失敗済みownerの復活では実装できない。hard停止とは別のsoft遷移・input終端化が必要 |

対象は元runが健全な間の**通常処理から一度だけのsoft打切り→finish**。Oを持つ既存合成範囲を維持する。Oなし・release不一致／不明、hard停止後の部分finishは新ownerの対象外とし、既存productionの挙動は変えない。

本書§3の型名・状態名は全体の内部役割案で、実在するruntime APIではない。SR-Aの局所型／handleは§12へ分ける。実装は配布対象外の独立合成issuerのみとし、fixtureのbrand／登録台帳をruntimeへ共有しない。inspect値・外部JSON・任意例外・callerのboolから実証拠を作る口は設けない。

## 2 不変条件

1. 同run／session／source／key／origin／canonical budget、pin済みrelease context、S／全L／Oを継承する。新しいroot・予算・開始時刻を作らない。Uは最後の受理済みT_iのまま下げない。
2. 回復開始claimはrunごとに一度。soft後は新analyze・payload取得・T_i受理を禁止し、既存のconsistency処理と一度のfinish、固定cleanupだけを許す。
3. hard失敗／取消／全体期限／run失効／source正常解放後から回復を開始しない。soft観測はhard診断ではなく、回復権限でもない。
4. 同時pendingは1、旧workerと新workerを重ねない。finishはrunごとに最大1。finish／readyの失敗から再び回復claimを発行しない。
5. 解析に至らなかったinputも同target／T_iを保持し、U・対象集合から消さない。再解析・時刻の再採取・omittedへの偽装をしない。
6. 既存の全体60秒・実効L、C/G/P・予約／retry、JSONのdeadline=60000・設定期限検査は元ownerのまま。soft後に予算を再充填しない。新しいUTC時計を足さない。

## 3 証拠の役割・発行元・所有権

すべて非公開opaque handleとowner内slotの対応で識別する。同じid／日時／hashだけでは通さない。参照は親processに留め、workerへ送るwireは既存data-only契約のまま。

| 内部役割案 | 固定発行元・発行前提 | binding・消費／解放 |
|---|---|---|
| SoftObservation | phase期限は同ReadStateの期限確定継続、worker期限は同監督のanalysis呼出し中の期限判定継続（timer終端に限らず§6.0の全発生点） | 同run／budget、元phase、観測serial。worker側は§6.0の発生点の種類とgeneration・worker／監督（未起動ならその事実）を区別する。例外classのinstanceofだけでは代替しない |
| RecoveryStartClaim | 同時刻ownerがSoftObservationを受け、未使用のrun側recovery slotを先に占有した固定継続 | 同owner／run／budgetと観測handle。ready待ちなら同inputと未送信状態、送信後なら同analyze jobに結合。一度消費して返却不能 |
| RunHealthWitness | 元canonical ownerの固定guard継続 | 元予算identity・生存状態・全体remaining>0・取消なしを確認。保存した数値remainingだけを再利用しない。各非同期境界後にも元guardで確認する |
| TimedOutInputRecord | 同input／job ownerの固定soft終端化継続 | 同target・T_i・元期待contextを保持。issued inputまたはpending analyzeを一度terminalへ進め、遅延応答は拒否。ready段階では存在しないjobを作らない |
| GenerationClosedEvidence | 同監督の同世代close成功後の固定継続 | 同run／監督／worker／generation、close試行identity、terminate成功と固定後始末完了。別世代・未知／失敗／caller申告を拒否。新世代許可へ一度消費する |
| FinishRouteClaim | 観測kindに対応する固定回復継続 | phase型は既存世代維持／未起動から初回起動、worker型は旧世代終了後の新世代、というrouteを固定。任意factoryへ渡さない |
| RecoveryFinishPlan | 同routeと同集合ownerの固定継続 | 元S／全L／O／U・release・選択集合、完了済みstate・未処理理由を封じる。同finishへ一度移譲。通常finish用のraw manifest受付だけで未完了inputを迂回しない |

Rootのclaimは型の値移動だけでなくowner側状態でも消費を記録する。binding検査・guard・注入依存の呼出しより前に消費し、失敗時に戻さない。hard失敗は未消費観測・route・plan・候補を同期失効する。hard停止後は固定cleanupと終端データ破棄だけで、新しい能力を発行しない。

実source／監督へprivate発行継続を置く位置、canonical guardとの正確な接続、read期限通知の発行元は実接続前のレビュー事項。合成issuerでの発行をその証明へ流用しない。

## 4 共通の検査順と状態

| 状態 | 進める処理 | 禁止／失敗 |
|---|---|---|
| active | 元処理または回復開始slotの一度消費 | 既にfinish発行済み、source解放済み、hard停止済みなら拒否 |
| recovery_claimed | pre-guard→同観測／phase／input／世代の照合→post-guard | 再入・混入・二重開始でhard停止。activeへ戻さない |
| quiescing | 必要な旧input／job終端化とworker終了確認 | 新job／新workerと並行させない。遅延ready／解析応答を採用しない |
| route_ready | 元run guard、固定consistency継続、集合封印 | hard失効後は進めない。source再登録や新payload取得は不可 |
| finish_only | 同routeでready済みworkerへ一度finish | analyze再開、2回目の回復、2回目のfinishは禁止 |
| candidate | WJ-CのE／集合照合後、固定終端だけ | cleanup未確認／取消／期限では候補を破棄 |
| failed／closed | 固定cleanup・診断回収／データ破棄だけ | 復活・再prepare・新世代／HTTP／finishは禁止 |

claim占有後は、元run pre-guard→生成元・identity／kind／phaseの検査→対応する終端処理→元run post-guardの順とする。worker終了待ち／ready待ち／verifyなどをawaitするたびに、同継続へ戻った後のguardと証拠照合を行う。post-guardが失敗すれば、値の境界が正しくても候補やrouteを公開しない。

phase予算を消費済みであることと、run全体が失効したことを分ける。phase期限の再検査を回復用guardへ無条件に持ち込んで自己拒否せず、逆に全体期限／取消を無視する「skip guard」も作らない。既存のsetPhaseReserve（consistency時の配賦／finish前の0化）は同canonical ownerの既存操作として扱い、S／L・総容量のリセットではないことを試験する。

## 5 phase期限型：既存世代維持／未起動の初回起動

1. 同ReadStateでphase_deadline_exceededが確定し、元progress／選択windowがあり、元runが生存して全体remaining>0・取消なしであることを確認する。phaseはmetadata／payload／consistencyを区別して保持する。
2. worker／世代／analyze pendingの状態を固定する。phase型の通常順序ではCPU pendingはない。pendingがあれば、worker期限型へ勝手に読み替えず内部矛盾として停止する。
3. ready済みworkerがあれば**同worker・同generation**を使う。まだworkerがなければ、finish用の初回起動routeだけを予約する。旧世代の終了証拠は要求せず、未起動を終了済みと偽装しない。starting／closing／failed等の中間状態をready扱いしない。
4. 未処理集合の確定と§7のconsistency継続を行う。finish前に元runを再確認し、未起動routeではこの時点で初めてworkerを起動しreadyを待つ。その後、同routeで一度だけfinishへ進む。既存のverify→遅延CPU起動の順序を変えず、不要なHTTP／worker並行区間を作らない。初回workerの起動／ready失敗はhard停止とし、別workerでの再試行はしない。

phase型の「世代を増やさない」は、**既にある世代を交換しない**という意味である。workerなしなら世代数0→1の初回起動が必要で、既存親設計の「常に同世代」という表記をこの区別で訂正する。

## 6 worker期限型：発生点を区別して旧世代を閉じる

### 6.0 期限観測の発生点

現監督は同じ`ReviewWorkerError(deadline_exceeded)`をtimer以外からも投げ、adapterのsoft分岐はそれらを区別せず受け付ける（[監督](../src/review/worker-supervisor.ts)のrequest／exchange）。phase予約がある限り、いずれも到達可能な経路として扱う。

| 発生点 | worker／id／送信の状態 | 必要な証拠と後続 |
|---|---|---|
| requestの冒頭`check()` | 最初のanalyzeならworker未起動・世代なし・id未消費。既存workerがあれば同世代・未送信 | 未起動なら「起動していない」ことを固定監督が記録した事実を終了証拠の代わりにする（close呼出しの即時resolveを終了証拠と数えない）。既存workerならそのclose成功が必要。同inputは未送信 |
| ready待ちのtimer | 起動済み・未ready・analyze id未消費 | §6.2 |
| ready応答処理内の`check()` | 応答到着後に期限切れとして破棄。未ready扱い・analyze id未消費 | §6.2と同じ。到着したready応答をready済みとして採用しない |
| exchangeの送信直前`check()` | ready済み・analyze idは`++sequence`で消費済み・未送信 | 同idのjobを送信済みとして扱わず、遅延応答も存在しない前提で同inputを未送信のまま終端化。消費済みidの再利用はしない。旧workerのclose成功が必要 |
| analyze応答待ちのtimer | 送信済み・応答なし | §6.1 |
| analyze応答処理内の`check()` | 送信済み・応答到着後に破棄 | §6.1と同じ。破棄した応答を候補へ採用しない |

発生点の種類はSoftObservationを発行する監督継続が固定し、例外本文・stage文字列・callerから推定しない。種類が判定できない場合はhard停止とし、softへ救済しない。

### 6.1 analyze送信後

同監督が同generationのanalyze応答期限を確定した場合だけ、同jobを応答受付不可のterminalへ一度進める。未完了inputのtarget／T_iをTimedOutInputRecordへ残し、pending listener／timer等の固定終了処理を監督が所有する。WJ-B/Cの汎用fail／revokeを実行してidentityを消した後に、新rootで再開する設計にはしない。

同旧workerのterminate成功と固定後始末完了からGenerationClosedEvidenceを得るまで新workerを起動しない。終了後の元run guardを通し、§7の集合確定／必要verifyを先に行う。その後の元run guardで生存を再確認し、保持した同終了証拠とrouteを一度消費して新generationを作り、同新workerのready後にfinishだけを許す。既存の旧終了→verify→新CPU起動の順序を維持する。verify中の失効では終了証拠も失効し、旧generation・同数値idの遅延応答は候補へ戻さない。

### 6.2 最初のanalyze呼出し中のready期限

現adapterはstage=analysisの間に最初のcpu.analyzeを呼び、監督はその内部でreadyを待つ。したがってready timerのdeadline_exceededも既存soft分岐へ到達し得る。これをworker_unavailableへ一律変更したり、存在しないanalyze jobへ結合したりしない。

観測には「analysis呼出し中・ready待ち・analyze未送信」を固定する。同inputのT_i／Uは受理済みのまま残し、未送信inputを一度未処理へ確定する。起動済み旧workerの終了確認後にだけ新世代へ進む。analyze idは存在しないままとし、readyが消費する既存sequenceをanalyze idへ転用しない。worker生成失敗・module／ready不正・通常のworker_unavailableは、この期限観測とは別のhard失敗のまま。

### 6.3 終了確認の境界

closeを要求しただけ、workerのerror／exit通知を見ただけ、terminate Promiseが存在するだけでは証拠を発行しない。close Promiseがreject／未settled、固定後始末がthrow、途中で取消／全体期限が発生した場合は新世代へ進まない。既存close Promiseの再awaitを新たなterminate試行として数えない。

最初の合成試験では未開始・要求済み・成功・失敗・未確認を別イベントで表す。fake confirmClosedはこのモデル上の前提にすぎず、実OSの終了保証ではない。実監督への証拠発行接続と失敗時の外側強制終了は別工程で設計する。

## 7 対象集合・保持Uとconsistency

受理済みreviewed／rejected／result_omittedは同target／T_i・state／reasonのまま継承する。softで完了しなかったinputと、同選択windowで未処理の行は、既存adapter同様にnot_processed／deadline_exceededへ一度確定する。T_iが未採取の行には日時を作らず、採取済みinputのT_i／Uは失わない。metadataが不完全ならcollection失敗・未完了の制限を保持し、未取得行やUpdate Set全体の完全性を捏造しない。

通常finishの「未完了inputがあれば拒否」を単に削除しない。RecoveryFinishPlanにより同inputの終端化と集合への一度限りの組込みが成立した場合だけ、回復用の固定受付を通す。raw manifest・callerのnot_processed申告から未完了inputを消せないようにする。集合は元source／選択windowへのbindingを必要とし、その正式供給口は未接続のまま。

consistency段階に入る前のsoftで既存verify継続があれば、同source／ReleasePermit・同予算のverifyを**論理呼出しとして一度だけ**行う。実sourceのverifyは親→metadataの2 GETで、各GETのupstream_unavailableだけを最大1 retryするため、物理試行は最大4となる。旧記述の「GET最大1」は論理呼出しとの混同だった。既にconsistency段階でsoftになった場合は繰り返さない。verify継続が存在しない場合もGETを追加しない。verify未実施を成功扱いせず、changed／unverified・provisional_resultsと既存errorを保持する。GET・chunk・予約／retryは元HTTP ownerに課金し、回復claim側では二重計上しない。

soft後verifyの失敗は、既存adapter（[adapter](../src/review/update-set-adapter.ts)のsoft分岐内のverify catch）の分類を変えない。

| verify失敗 | 既存adapterの挙動 | 回復ownerでの扱い |
|---|---|---|
| phase_deadline_exceeded（元run生存）・invalid_response・not_found_or_not_visible・authentication_failed・access_denied・upstream_unavailable・request_budget_exceeded・payload_budget_exceeded・candidate_filter_violation | consistency=unverified、既存errorを記録してfinish | hard停止ではない。同routeのfinish_onlyへ進む。元run guard（取消・全体期限・失効）は従来通り先に確認する |
| receive_budget_exceeded | sessionを停止したうえで、同じsoft分岐内でunverifiedとしてfinish | 元runが失効しているため回復ownerのfinish_onlyへは進めない。既存のfinishは**初期対象外**として変更せず、新時刻契約で検証済みとは数えない |
| cancelled・全体期限（remaining<=0） | failで停止 | hard停止。全claim／route／planを同期失効 |
| BoundedReadError以外・上記以外のcode | internal_review_errorで停止 | hard停止 |

これは親設計§7の別分岐（run停止後に部分／失敗集約をfinishする経路）とは別のsoft内経路である。どちらも既存経路を新ownerのguardで包んで破壊せず、将来の接続方針は別レビューとし、現在のproductionは変更しない。

## 8 診断・失敗・解放責務

| slot | 保持する事実 | 方針 |
|---|---|---|
| soft observation | 種類・元phase・ready／送信後、既存deadline理由 | hard停止slotと分離し、回復中も消さない。raw例外・source・秘密・stackは持たない |
| hard stop | 最初の固定cancelled／deadline_exceeded／worker_unavailable／internal_review_error等の既存分類 | 一度だけ格納。soft理由で先行hardを上書きしない。混入・重複・状態矛盾はinternal_review_error |
| cleanup | 同旧／新世代の要求・成功／失敗／未確認 | hard理由と別に保持。先行理由がcancelledでも終了未確認を隠さず、結果公開・再起動を拒否 |
| terminal data | 元S／L／O／Uと固定phase診断 | hard停止後は能力を残さない。固定discardでUTC値を消す。正常終端では参照・時刻を破棄 |

soft観測後にhard停止が確定したら全claim／plan／終了候補を同期失効する。先行したsoft理由は診断事実として保持するが、「最初の失敗だから」という理由でhard停止を無視しない。cleanup失敗からsoft成功へ戻さず、後続のEが正常でも解放失敗を帳消しにしない。公開failure codeやJSONの追加はしない。複数のhard失敗があるときは先行固定理由を保持しつつ、cleanup未確認の事実は別slotへ残す。

job・listener・timer・worker／stdioは監督owner、HTTP・認証・予約は元session／transport owner、input／時刻／集合は時刻ownerが解放する。失敗後も固定cleanup sectionを通す責務を保ち、最後のrollbackで数が0になったことだけを全section実行の証明にしない。cleanup中の取消でも開始済み解放の終了待ち／固定診断回収を省略しない。実待機の時間上限・外側監督との結合は未確定で、今回新しい実timeoutを導入しない。

## 9 費目所有・上界の未確定部分

| 費目 | 所有者 | 本書での制約 |
|---|---|---|
| 観測・claim・guard／失効 | 回復owner | runにつき開始1、route1、finish1。失敗試行も将来oracleで数える |
| input終端化・集合封印 | 同時刻／集合owner | 最大100 targetの既存局所枠。T_i／Uを再採取しない。payload／findingsを再copyしない |
| 世代生成・ready／id・終了 | 同監督 | phase既存世代は交換0、未起動は初回1。worker期限型は旧終了後の新世代1だけ。readyはjobと別 |
| consistency GET・受信／retry・予約返却 | 元source／transport／session | 論理verify最大1。親→metadataの2 GET、各最大1 retryで物理最大4試行。追加の論理verifyなし。元C/G/P・全体期限を共有 |
| E採取・全schema・finalize omission | 同finish worker | 既存の一度採取／一度finishを維持。親は同E／集合を検査するだけ |
| 固定終端・解放後checkpoint | 外側owner（後工程） | worker→session→元取消／期限の対応を別途設計。合成closeから実証拠を発行しない |

上記の回数はモデル案で、運用cap・受付可否の証拠ではない。追加slot／snapshotの実layout、work・allocation、全経路のretry／cleanup費用はUnknown。全体受付を有効化せず、既存60000msやテスト期限を緩めない。

## 10 合成受入条件（SR-Aの部分確認は§12、全体は未実施）

| ID | 独立に確認する条件 |
|---|---|
| SR-01 | 同run／budget／source／input／世代へのbinding。copy・別issuer・文字列だけのsoft観測を拒否し他runは不変 |
| SR-02 | claimは最初のguard前に一度消費。二重生成・消費・捕捉再入・失敗後の再prepareを拒否 |
| SR-03 | phase型：既存worker同一性を維持。workerなしは初回起動だけ。starting／pending／closingを誤受理しない |
| SR-04 | worker型：旧job終端化→旧終了成功→新世代ready→finishの順序。旧／新worker重複0、古い同id応答は拒否 |
| SR-05 | §6.0の全発生点：未起動／ready待ち／ready応答破棄／id消費済み未送信／送信後／応答破棄を区別。同input／T_iを保持し、未発行analyze idやjobを作らない。未起動を終了済みと偽装せず、worker_unavailable／不正readyと混同しない |
| SR-06 | terminate未確認／reject／後始末throw・取消／全体期限では新世代・候補を発行しない |
| SR-07 | 全境界のpre/post guardとawait後の失効。phase期限と全体期限を区別し、S／全L／O／Uは固定 |
| SR-08 | 未完了inputは同targetのnot_processedへ一度確定。U保持、元完了state維持、集合追加／欠落・reviewed昇格を拒否 |
| SR-09 | verify要否を元stage／継続へ結合。論理verify最大1、親→metadataの2 GET・各最大1 retryで物理最大4試行、consistency段階からの論理再試行0・C/G/P二重課金0を別イベントoracleで確認。§7の続行対象のverify失敗ごとにunverified継続を確認。実finish接続はSR-D |
| SR-10 | verify中のreceive_budget_exceededによるrun失効・取消・全体期限でfinish_onlyへ進まないこと、対象外の既存finish・停止後finishの回帰を維持 |
| SR-11 | finish／ready／送信失敗で再回復しない。finishは1回、候補は1回消費。終了未確認とhard診断を別slotに保持 |
| SR-12 | 固定cleanup section各区間の観測、失敗後の継続と診断回収。rollback結果だけで代替しない |
| SR-13 | 0 input／空200、100 target、各中断位置と全成功／拒否経路を独立oracleで計数。full schema／compiled／実classの保証は別集計 |

最初の実装では純粋fake issuer・fake clock／予算観測・fake closeイベントだけを用い、実workerを生成しない。旧WJ-A／B／通常WJ-C試験を残す。配布物にissuer／fixtureがないことと、runtime・I/O・clockへの漏れを負の対照で確認する。

## 11 推奨実装分割・承認／レビュー待ち

1. **SR-A（合成限定実装）**：内部discriminant・同ownerの観測／回復slotとone-shot検査、soft／hard／cleanup診断分離を独立合成issuerだけで実装した。§12参照。route／世代移行や実cleanup証拠は発行しない。
2. **SR-B（合成限定実装）**：phase型の同世代維持／未起動分岐、未処理集合・必要verifyのfakeイベント会計を非実行planへ接続した（§13）。実finish権限ではない。
3. **SR-C（①とSC2-A／B／C／Dのみ合成限定実装）**：worker型の7発生点、旧世代終了／世代なし証拠とone-shot消費を接続した（§14）。[後半の接続契約draft-0.9](BEST_PRACTICE_ABORT_SCOPE_WORKER_RECOVERY_CONTINUATION_DESIGN.md)§10〜13で、未消費証拠のprivate移譲・HeldClosure・strict準備入力と集合／時刻検査、必要verify・同prefixのfake会計、合成新世代ready・別cleanup診断・非実行plan封印／移譲を限定実装した。実finish・実回復routeは未接続。正式bindingに関する人の承認は未実施。
4. **SR-D**：通常WJ-CのE／固定集合・候補消費へ接続し、全guardと独立oracleを確認する。実session／監督・外側cleanup接続は行わない。[接続設計draft-0.1](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_SRD_DESIGN.md)で初期対象をSC2-Dのworker期限型private handoffに限定し、不足証拠・同新世代・集合／T_i／UとE・候補の一度消費・cleanup責務を具体化した。phase型private移譲、実finish／runtimeは対象外。MD設計のみで未実装の状態を維持する。

SR-D以降の実装は別の依頼後に行う。実生成継続のclass／module配置、private終了証拠の実発行条件、停止後finishとの接続互換性、実cleanup上限・外側checkpoint／診断写像、実選択windowと集合証拠、全費目上界はレビュー待ちで、人の承認済みとはしない。draft-0.1／0.2はコード照合とMD設計のみ。SR-A／B／C①は§12〜14、SC2-A／B／C／Dは後半の接続契約§10〜13へ分離し、実通信・環境設定操作を実施したことにはしない。

draft-0.1のレビュー修正：worker期限型の観測をtimer終端と「送信後／ready待ち」だけに限っていたが、現監督はrequest冒頭（worker未起動のこともある）・ready／応答処理内・送信直前（id消費済み未送信）の`check()`からも同じdeadline_exceededを投げ、adapterはそれらをsoftとして受け付ける。未起動の場合に旧worker終了証拠を要求すると既存soft partialが回復不能になるため、§6.0に発生点の表を追加し、§3・SR-05を合わせた。またsoft後verifyの失敗分類が未記載で、既存adapterが続行してfinishする失敗をhard停止と誤実装し得たため、§7に既存分類との対応表を追加し、SR-09／10を合わせた。

## 12 SR-A：独立合成issuerの内部契約・診断分離

[合成issuer](../tests/support/review/synthetic-soft-recovery.ts)をtests/supportに追加した。importsはnode:util／zodだけで、WJ-A／B／Cのowner・runtime class・登録／claim台帳を共有しない。実source・canonical budget・監督の正式発行継続へは未接続である。

### 12.1 型・値境界と同owner binding

SyntheticRecoverySeedはrun／session／source／key／origin／budget／releaseの7つのopaque参照とS／全L／O／Uの計11項目を、own data descriptorで構築時にpinする。S<=O<=U<=S+L、ISOミリ秒UTC、1<=L<=60000を確認し、全pre/post guardでも同値・同参照を再検査する。releaseは**fake contextのidentityだけ**で、内容や実ReleasePermitの有効性を検査したとはしない。新しいUTC時計や本物のremainingを読む口はなく、元run guardは注入したfake checkで表す。

SyntheticSoftFactsはphase型（metadata／payload／consistency、workerなし／ready）とworker型の7発生点を区別する。request_checkは未起動／既存を分け、ready timer／reply、送信直前check、analyze timer／replyを別pointにする。未起動にはworker／generationを置かず、ready中はanalyze idを置かない。送信直前は消費済みidとallocation identityだけを持ち、送信済みjobと混同しない。送信後だけjob identity／idを要求する。全variantは追加field・矛盾するworker_state・不正id・getter／Proxyを拒否する。

constructorに渡す期待topology自体がfake fixtureである。observeの値は同owner bindingの固定期待値・同input／request／監督／worker／世代／allocation／jobへ照合し、外部形状の一致を実sourceの証明にしない。root値は最大11項目、factsは最大11項目、局所読取は最大16 own propertyに制限するが、これを任意JS objectの反射コストを含むメモリ／work上界の証明とはしない。

### 12.2 一度限りのslot・失効

owner binding／observation／recovery／cleanup診断には別の内部brandを置き、実体は空の凍結handleとして同issuer内のslotへ対応させる。runtimeのbrand・台帳へは共有しない。公開fixture境界では不正なobjectも拒否試験できるが、同owner内pointer以外では消費できない。

observeは発行claimを最初のguard前に占有し、最後のpost-guard後だけ観測をpublishする。claimRecoveryは同観測をguard前に取り外し、回復開始bitを一度消費する。consumeRecoveryも同回復slotをguard前に取り外し、全guard後だけauthority:noneの限定dataを返す。コピー／別owner／二重操作・捕捉再入・identity変更・取消／期限はhard停止し、失敗後に再生成しない。

ここでのconsumedは**SR-Aの非実行結果を消費しただけ**で、§4のquiescing／route_ready／finish_onlyへの遷移ではない。新世代、HTTP、analyze、finish、対象集合の封印、未完了inputの終端化、回復権限を発行しない。SR-Bの別の非実行plan分岐は§13へ分離し、実producerとの接続は引き続き未実施とする。

### 12.3 soft／hard／cleanupの分離

- soft slotは受理済みkind／phase／point／worker_stateだけを保持し、hard停止後も残す。元identity・source・例外本文は含めない。
- hard slotは最初の固定code／phaseを保持し、後続cleanupで上書きしない。SR-A初期の直接codeはcancelled／deadline_exceeded／worker_unavailable／internal_review_error。SR-Bではfake run失効のreceive_budget_exceeded／authentication_failed／access_denied／request_budget_exceeded／payload_budget_exceededも固定保持する。未知理由は内部エラーへ固定する。verifyの継続分類は§13へ分離し、現在のadapterを変更しない。
- cleanupLeaseは元ownerが生存する間に一度だけ発行する**診断専用sink**。失敗後に新sinkを作れず、既に発行したsinkだけはhard停止後もrecordCleanupで一度sealできる。これはrun guardを呼ばず、失効したrunを正常化しない。capabilityは診断記録だけで、worker／HTTP操作や回復を許可しない。
- cleanupはSR-Aでは一つのimmutableなsnapshotであり、実closeの要求→settle処理ではない。workerなしはnot_requiredだけ、workerありはnot_started／requested／confirmed／failed／unconfirmedを区別する。confirmed以外の未完了／失敗はhard停止を要求し、無効なsnapshotはunconfirmedへ固定する。未確認を記録した後、遅れてconfirmedへ上書きしない。先行cancelledと後続cleanup failedは両方保持する。

recordCleanupのstatusはfixtureが渡す合成イベントで、GenerationClosedEvidenceへ昇格する口ではない。closeの実発行元・終了確認・新世代許可はSR-Cの未実装範囲である。normal closeはclaim／identity／UTCを破棄するが、未sealのcleanup sinkがあれば拒否して事実回収を残す。hard停止ではroot能力を失効し、S／L／O／Uのdataだけを固定discardまで保持する。外部copyやheapの物理消去は保証しない。

### 12.4 試験・非実装範囲

[124件の試験](../tests/review/synthetic-soft-recovery.test.ts)でSR-01／02、SR-05のvariant値・identity（seed／factsのidentity参照が文字列・Proxyなら拒否）、発行済みcleanup sinkへの捕捉再入の停止、SR-07の同期guard、SR-11の診断分離の一部を確認した。最後のpost-guard内の期待世代差替え、S=O=U／O=U／U=S+Lの値境界、fake health checkの理由文字列だけからsoftへ昇格しないことも確認する。実ReadStateの期限通知・await・terminate・終了待ち・元sessionの失効連携は確認していない。

独立oracleは、全9 topology（phase payloadのworker有／無＋worker7発生点）の各一度のbind／cleanup lease／observe／claim／consume／close、計12 guardを確認する。phase3種は別にworker有／無を検査する。回数は局所fakeモデルのイベント数で、actual work／cap・全体受付の根拠ではない。旧WJ-A 157／WJ-B 66／通常WJ-C 82件を維持し、初回RED・最終検証は[SR-A検証記録](E2E_BEST_PRACTICE_SOFT_RECOVERY_SRA_2026-11-02.md)へ分離する。

issuer・試験は配布物に含めず、dist JS／宣言／mapの関数／path混入とruntime／I/O／timer／clock／worker依存を負の対照付きで検査する。これは字句・依存先の局所検査であり、間接global取得等の網羅的証明ではない。専用compiled／B-03・実class保証へ流用しない。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。

draft-0.3のレビュー修正：seed／factsのidentity参照をobject・非Proxyに限る検査（`refs()`）と、`recordCleanup`の再入拒否（busy判定）は、各判定を外す変異でも119件が通っていた。前者を外すと文字列のidentityが`===`の値一致でcopyでも通り、§3の「同じid／日時／hashだけでは通さない」が成り立たない。後者を外すとobserveのguard内から発行済みsinkへconfirmedを記録でき、observeも成功する。seed／facts×文字列／Proxyの4件と再入1件の試験を追加し、§12.4の件数・保証範囲と親設計・検証記録からの版数リンクを更新した。

## 13 SR-B：phase分岐・集合保持・fake verify会計

実装は[独立issuer](../tests/support/review/synthetic-soft-recovery.ts)と[private値モデル](../tests/support/review/synthetic-phase-recovery.ts)、[合成試験](../tests/review/synthetic-phase-recovery.test.ts)のみ。SR-Aの`consumeRecovery`で返した公開データから昇格せず、未消費の同owner recovery handleを`preparePhase`が先に占有する。worker期限型は拒否する。各操作のpre/post guard・busy検査と固定hard理由を継続し、失敗時はphase handle／attempt／ready claimを破棄する。既存SR-Aの124試験は維持する。

### 13.1 同一性・集合・時刻

prepareのstrictな13列はsource／budget／release／origin／window／verify／accounting／rows／completed／inputs／collection_status／consistency／initial_worker。同source・budget・release・originはpinned参照と一致し、window／verify／receiptは非Proxy参照だけを受ける。これは合成issuerの入力であり、実window／payload受領物の供給証拠ではない。

選択IDは重複なし最大100件。完了結果は選択集合の部分集合として保持し、未完了行は`not_processed: deadline_exceeded`へ確定する。受理済みinputのT_iは完了／未処理を問わず保持し、O≤T_i≤U・単調順と最大T_i=保持U（0 inputならO=U）を要求する。入力receipt／IDの重複、集合外、reviewed／result_omittedのinput欠落は拒否する。metadata段階のsoftではcollection_status／run_statusをfailedとする。開始S・全deadline L・O・Uは再採取／再計算しない。

**一般化と未保証の差**：phase期限はsessionの読取り中に確定し、実adapterではその時点でanalyzeが動いていないため、未完了（retained）のinputは0件のはずである。本合成モデルはWJ-Bの合成ownerがanalyze前に複数のinput receiptを受理できることに合わせて一般化しており、retained inputを受理してnot_processedへ確定する。この「phase型では未完了input 0件」という実adapterの順序は**未保証**であり、SR-Bの合成成功をその証明に数えない。

### 13.2 必要verifyと費目所有

- 元phaseがconsistencyならverifyを繰り返さず、継続なしもGET=0。初期consistencyを勝手にstableへ変更しない。
- 必要なら親→metadataの固定順。各GETのupstream_unavailableのみ最大1 retryで、論理verifyは1、物理attemptは最大4。retry待ちはfakeイベントでありtimer／sleepを開始しない。
- 合成prefix C/G/Pはprepareで一度copyする。C上限210、G累積16MiB、response上限4MiB、P prefix上限8MiBを維持し、attemptだけC、同attemptの一意chunkだけGへ課金する。上限を越えたchunkもGへ計上してから停止する。verifyのP追加は0。C枠切れはdispatchせずunverified、G枠切れはhard停止。
- §7の継続対象エラーはunverifiedと固定errorを保持し、phase_deadlineはdeadline_exceeded、invalid_responseはmetadata_unavailableへ写像する。changedはprovisionalとchanged_during_reviewを保持する。取消・全体期限・receive予算失効・未知理由はhard停止し、worker選択へ進まない。

この会計は**同fake budget identityに結合した局所snapshot／イベント計数**である。実canonical budget writer・予約台帳・実GETには接続しておらず、実sessionでの会計継続保証に数えない。従来の210試行・final4枠を増やす変更でもない。

### 13.3 worker選択・消費・失効

verify完了後だけ`phaseWorker`へ進む。既存readyは同supervisor／worker／generationを維持し、起動0・ready再受理0。未起動では合成の予約済み初回frameをsnapshotし、fake起動イベント1の後、同frameのready claimを一度受理する。別frame・二重ready・ready失敗は停止し、代替起動しない。取得中・retry待ち・ready待ちを正常closeで完了扱いしない。

`consumePhase`はplan handleをpre-guard前に占有し、post-guard後だけ`authority=none`のimmutableな非実行summaryを一度返す。inspectはUTC／identity／payloadを含まないscalar診断のみ。失効時には試行済みC/G/Pと先行soft／hard診断を残し、実行用参照を破棄する。正常closeで終端UTCも破棄する。SR-A cleanup snapshotは従来の診断であり、ここでfake起動したframeの実終了証拠にはならない。

SR-Bは121件、SR-Aとの合計245件で局所検査する。BoundedReadError相当以外のverify結果・非booleanのchange flagのhard停止、worker期限型からのphase plan拒否、受理済みinputのないreviewed／result_omittedの拒否、window／verify／receiptの文字列・Proxy参照の拒否、ready世代維持時の初回起動frameの拒否、想定外のready失敗理由の内部エラー固定も個別に確認する。初回起動経路の20 guardすべての取消位置に対してC/G/Pと停止を独立oracleで比較し、混入・一度限り・上限・継続エラー・close／再入も確認する。実finish／E比較・WJ-Cへの接続、worker期限型の世代交換（SR-C）、実cleanup連結（SR-D）、B-03 compiled保証は未実施。配布物にはissuer／値モデル／試験を含めず、混入とruntime／I/O／clock依存の負の対照を追加する。詳細は[SR-B検証記録](E2E_BEST_PRACTICE_PHASE_RECOVERY_SRB_2026-11-02.md)。人の承認済みとはしない。

draft-0.5のレビュー修正：SR-Bの次の判定は、各判定を外す変異でも236件が通っていた。verify結果の`kind`／`type`照合（外すと非bounded失敗がunverified継続になり、§7の「BoundedReadError以外はhard停止」に反する）、success結果のchange flagのboolean検査、`preparePhase`のworker期限型拒否（§13の明記事項）、受理済みinputのないreviewed／result_omittedの拒否（§13.1の明記事項）、window／verify／receiptのopaque参照検査、ready世代維持時の`initial_worker=null`要求、ready失敗理由の限定。9件の試験を追加し、§13の件数・保証範囲と親設計・検証記録からの版数リンクを更新した。

## 14 SR-C①：旧世代終了・世代なし内部証拠の合成契約

実装は既存の[独立合成issuer](../tests/support/review/synthetic-soft-recovery.ts)内だけ。[専用試験](../tests/review/synthetic-worker-closure.test.ts)は116件で、未起動のno_generation証拠でも同contextでない確認（supervisor／request／input／point）を拒否し、終了settle eventの余分な列を拒否することを個別に確認する。実監督／worker／runtime台帳には接続せず、§6のGenerationClosedEvidenceの**合成内部契約**を局所handleで表す。実OS終了・実cleanup証明ではない。

### 14.1 発行元・状態・一度限り

`beginWorkerClosure(binding, recovery)`は同ownerの未消費recovery slotを最初のguard前に占有し、worker期限型に限って`worker_closing`へ進む。phase型・公開のconsumeRecovery結果・別ownerを拒否する。固定fake終了要求を記録した後のpost-guardが通ったときだけ、別brandのWorkerClosureLeaseを発行する。同rootのrun／session／source／budget／releaseと元S／L／O／U、観測元のsupervisor／request／input／旧worker／generation／jobまたはallocationは各guardで再照合する。

| 観測元 | 終了要求数 | input／idの終端区別 | 必要な合成証拠 |
|---|---:|---|---|
| request_check_unstarted | 0 | unsent／absent | 同contextの世代なし。閉じた世代と偽装しない |
| request_check_existing | 1 | unsent／absent | 同旧世代の終了＋固定cleanup完了 |
| ready_timer／ready_reply_check | 1 | unsent／absent | 同starting世代の終了＋固定cleanup完了。破棄したreadyを採用しない |
| send_check | 1 | unsent／allocated_unsent | 同旧世代の終了＋固定cleanup完了。割当済みidを送信済みjobと数えない |
| analyze_timer／analyze_reply_check | 1 | sent_terminal／sent_terminal | 同旧世代の終了＋固定cleanup完了。旧job／応答を受付不可として記録 |

上表の終了要求数・job終端化はfakeイベント／状態であり、実terminateやWJ-Bのjob台帳を更新しない。readyが消費したsequenceをanalyze idに置き換えない。数値idだけが同じでも別generation／jobのcontextでは受理しない。

### 14.2 終了確認と証拠消費

- 未起動だけは`confirmWorkerUnstarted`で、同lease・同contextからno_generation証拠を発行する。started世代での利用を拒否し、未起動をsettleWorkerClosureでconfirmedにすることも拒否する。
- startedだけは`settleWorkerClosure`でstrictな3列（context／termination／cleanup）を受ける。同leaseをpre-guard前に取り外し、同contextのtermination=confirmedかつcleanup=completeのときだけ、post-guard後に別brandのWorkerClosureEvidenceを発行する。
- rejected／unconfirmed、cleanup failed／unconfirmed、未知statusは固定診断に保持してhard停止する。未知statusはunconfirmedへ固定する。要求済み・exit通知だけ・Promiseの存在や未settled・raw例外・不正eventは証明にならない。不正contextからconfirmed診断を作らない。
- `consumeWorkerClosure`は証拠をpre-guard前に一度取り外し、最終post-guard後にauthority:noneのimmutable dataだけを返す。no_generation／closed_generationとpoint、input／id終端区別を保持し、新generation／finish／GETを許可しない。

状態はclaimed→worker_closing→worker_closed→consumed。失敗・取消・元全体期限では全lease／証拠を同期失効し、失敗後の再準備／再消費を拒否する。lease未settled／証拠未消費をnormal closeで隠さない。成功後のnormal closeで元UTCも破棄する。

### 14.3 診断・会計・保証の限界

worker_closure診断は要求数・termination／cleanup・input／id終端区別とpending有無だけのimmutable scalar。source・token・コード本文・worker参照・数値idは出力しない。先行soft／hardとSR-Aの診断専用cleanup sinkは別に保持する。sinkのconfirmedやinspectのcopyから証拠へ昇格せず、先行cancelledを後続cleanup失敗で上書きしない。

7発生点×begin／確認／消費の各pre/post guard（6点）の取消を独立oracleで検査し、終了要求0／1、失効後のlease／証拠0、新世代0を確認する。未起動・ready待ち・割当済み未送信・送信済みを分け、混入・二重開始／消費・再入・Proxy／getter・不完全終了を拒否する。実worker method・timer・clock・通信は呼ばない。追加するのは局所の合成イベントだけで、実C/G/P・retry／予約・work capへ費目を追加／再配賦した保証ではない。

実際の終了要求→Promise settle→固定cleanupの継続、遅延OS通知、外側強制終了は未接続。証拠移譲と未処理集合／時刻の準備検査はSC2-A、必要verify・同prefixのfake会計はSC2-Bに限定する。新世代ready・別cleanup診断はSC2-C、非実行plan境界はSC2-Dの合成接続に限定し、WJ-C finish／E・候補消費はSR-Dに残す。B-03 compiled保証・全体費目上界・実発行元は未完了。配布物へのscope／関数／path混入を負の対照で拒否する。[SR-C①検証記録](E2E_BEST_PRACTICE_WORKER_CLOSURE_SRC1_2026-11-02.md)・[SC2-B検証記録](E2E_BEST_PRACTICE_WORKER_RECOVERY_SC2B_2026-11-02.md)・[SC2-C検証記録](E2E_BEST_PRACTICE_WORKER_RECOVERY_SC2C_2026-11-02.md)・[SC2-D検証記録](E2E_BEST_PRACTICE_WORKER_RECOVERY_SC2D_2026-11-02.md)参照。正式発行口閉鎖・Unknown・全体受付無効・調査保留を維持し、人の承認済みとはしない。

draft-0.7のレビュー修正：`confirmWorkerUnstarted`の同context照合と、`settleWorkerClosure`のevent 3列のstrict検査は、各判定を外す変異でも111件が通っていた。前者を外すと別input／request／supervisorのcontextからno_generation証拠が発行され、§14.2の「同lease・同contextから」に反する。後者を外すと余分な列を含むeventから証拠が発行される。5件の試験を追加し、§14の件数と親設計・検証記録からの版数リンクを更新した。

draft-0.9の変更：§11のSR-Cの項に、後半の接続契約（未消費証拠のprivate移譲・集合／時刻・verify会計・新世代ready／cleanup、最初の実装単位SC2-A）への案内を追加した。設計の案内のみで、SR-A／B／C①の実装・試験・保証範囲は変更していない。

draft-0.11の変更：§13.1に、phase型の準備入力が実adapterの順序（未完了input 0件）より広い一般化であり、その順序が未保証であることを明記した。実装・試験は変更していない。
