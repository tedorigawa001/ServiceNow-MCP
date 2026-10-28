# AU-BR-006：閉鎖dispatcher・中断signal・Response受領の詳細設計

Version: br006-closed-dispatch-signal-draft-0.4 / Date: 2026-10-28。
Status: **§10〜§13のCD-01〜CD-04を合成実装。同attemptのResponse-reader接続にHTTP分類・cleanup後の限定retryを追加。正式body発行・実session bindingは未接続。正式発行口閉鎖・全体受付無効・Unknownを維持。実transportの採用承認ではない**。

親：[session／transport／body境界 §17・§18](BEST_PRACTICE_ABORT_SCOPE_SESSION_TRANSPORT_BODY_BINDING_DESIGN.md#18-draft-06注入native-web-streamsの合成接続)、[共通run owner](BEST_PRACTICE_ABORT_SCOPE_RUN_OWNER_BINDING_DESIGN.md)。
CD-04後の設計：[親private snapshot・初回／最終安定性draft-0.1](BEST_PRACTICE_ABORT_SCOPE_PARENT_STABILITY_DESIGN.md)。同bytes由来の5列、private所有・最終guard後の受理、比較差分と未検証の区別を具体化した文書のみで、安定性比較や正式発行を有効化しない。
参照：[用途別受領物](BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_RECEIPTS_DESIGN.md)、[固定source](BEST_PRACTICE_ABORT_SCOPE_FIXED_SOURCE_ISSUER_DESIGN.md)、[OAuth移譲](BEST_PRACTICE_ABORT_SCOPE_OAUTH_SOURCE_HANDOFF_DESIGN.md)。

## 1. 現状と今回の境界

[closed supervisor](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts)は同ReadStateのdispatch／window確定後に注入streamを取得し、同readerのread・cancel・closed・releaseLockとprivate bytesを監督する。[25件の試験](../tests/review/closed-stream-adapter.test.ts)は本文段階の合成検証である。

最新の`f940be2`では未接続AbortControllerを撤去した。現adapterのabortは要求回数の記録だけで、fetchや待機中のResponseを中断しない。[修正記録 §6](E2E_BEST_PRACTICE_CLOSED_STREAM_ADAPTER_2026-10-28.md#6-レビュー修正未接続abortcontrollerの削除2026-10-28)を参照。

[旧fixture adapter](../src/review/abort-scope-evidence-web-stream.ts)と[固定descriptor builder](../src/review/abort-scope-evidence-fixed-web-source.ts)にはResponse供給関数とAbortSignalの接続があるが、別のfixture machine／会計である。そのadapterを新coreへ登録したり、旧statsをcopyして同予算だと扱わない。再利用候補は固定要求の規則であり、旧台帳・authorityではない。

今回設計するのは、同coreのattempt開始からResponse待機・本文cleanupまでを一つの私有resourceとして扱う閉鎖composition。公開MCP入力・0.2／0.3結果・既定規則は変更しない。実認証・実source・ReleasePermit・選択payload／worker jobへの正式bindingは後工程。

## 2. 必須不変条件と信頼範囲

1. 同constructorのrun／ReadState／transport identity、fake auth snapshot identityとready世代を固定する。fake identityは参照で識別し、token文字列・JSON・同値sys_idで代用しない。
2. 用途は同ReadStateのprivate purpose／slotから取得する。callerがpurpose名・URL・method・headers・ordinal・認証identityを組み合わせて要求を作る入口は設けない。
3. 同attempt claim、固定descriptor、controller、Response待機、body、reader、cleanup診断を同resourceへ結合する。別予算・別timer起点を生成しない。
4. fake dispatcher依存はconstructorで一度固定する。既存実sessionの登録・transportモード切替・authority lookupを追加しない。fixture台帳と実session台帳は分離する。
5. Response／ReadableStreamには、要求や認証snapshotの真正な由来を証明する機能はない。`Response.url`、同一本文、同一digest、headerのnonceだけで正式証拠を発行しない。
6. fake dispatcherは信頼する試験依存であり、悪意ある任意callbackを隔離する境界ではない。内部handleの混入検査と、HTTP origin／認証先の実証明を混同しない。

## 3. 内部型・所有権・claim（提案）

型名は提案であり、現在のexportではない。全てpackage除外のfixture専用composition内へ閉じる。

| 型／所有者 | 発行元・結合 | 消費と責務 |
|---|---|---|
| FixtureRequestContext | constructorのprivate生成継続 | run／transport／budget／auth snapshot／ready世代／固定originを参照固定。実tokenやauth headerを持たない |
| BoundLogicalRequest | 同purpose台帳＋固定builder | purpose参照、slot、対象Update Set／table、phase、固定method／pathを固定。caller返却descriptorの再登録不可 |
| DispatchAttempt | 同ReadStateのdispatch成功継続 | 同request、attempt参照、ordinal、window、controller、pending状態を保持。await前にclaimとCを消費 |
| DispatchDelivery | 同attempt専用のprivate受領継続 | 同resourceとResponse参照の所有関係を保持。外部からhandle／raw Responseを登録して昇格できない |
| ResponseOwnership | composition内fixture専用台帳 | Responseとbodyの参照を一度だけclaim。別attempt／別factoryへの採用を拒否 |
| CleanupReport | 同resourceの固定終端section | dispatch待機、abort要求、read／cancel／closed／releaseを別軸で保持。正式body receiptではない |

auth contextはfixture専用の不透明handleを固定dependencyのprivate側へ渡す。表示用descriptorやstatusへコピーしない。ready変更・snapshot交換を認めず、検出した場合は自runだけを停止する。実認証snapshotのissuerや秘密保管を今回実装した扱いにしない。

## 4. 固定要求・URL生成

初期subsetは**ready済みfixtureの親GET**（parent_initial／parent_final）とする。OAuth POST・release・metadata・payload・tableの実行口を一度に開かない。後続用途でも同じ結合検査を必須とし、未対応用途はdispatch前に拒否する。

- originはconstructor内の架空HTTPS接続先として固定し、userinfo・fragment・任意port・caller入力originを認めない。実在PDIのURLは使わない。
- 本番[`bounded-source`](../src/review/bounded-source.ts)の`fetchParent`とTC-04の[run-stream](../src/review/abort-scope-evidence-run-stream.ts)に合わせ、単一record取得とする。固定pathは`/api/now/table/sys_update_set/<固定Update Set sys_id>`、fieldsは`sys_id,state,application,sys_updated_on,sys_mod_count`、display_value=false、exclude_reference_link=true。query／limit／offsetは付けない。
- 応答は`result`が単一objectで、既存body laneのparent用固定射影（単一record）と同じ形。本番の`parentSchema`が必須とする`state`／`application`を取得から落とさない。[旧fixture builder](../src/review/abort-scope-evidence-fixed-web-source.ts)の一覧照会形（`sys_id=…^ORDERBYsys_id`、limit=2、結果は配列）は本番と異なるため採用しない。
- URLは固定builderがURLSearchParamsで生成する。初回／最終は同じ対象・fieldsを使うが、purpose／phase／slotは別の参照として検査する。
- GET・redirect拒否の方針を固定する。依存へ渡す表示用の凍結descriptorはURLと用途を説明するだけで、authorityではない。ordinalは同台帳から導出する。
- Responseの3xxは追跡しない。再照会URL・Location・response.urlを次の要求先へ採用しない。per-user→service-account等の切替もない。

native Responseの注入ではurlが空でもよい。空でない場合は固定URLとの一致を補助的に検査し、不一致は拒否する。一致しても出所の証明にはならない。fake依存が別URL／auth contextを使ったかは、独立した試験ledgerの観測で検証する。

## 5. 同attemptの開始・受領順序

1. private purpose／context／live／phase／予約／windowの成立前提を検査する。不適合はC=0、dispatcher未呼出し。
2. controllerと固定requestを準備する。生成失敗は未dispatchとして停止する。固定guardを再確認し、attempt claim・Cを同期commitする。
3. commit直後、同attempt専用のprivate継続からdispatcherへ固定descriptor・同signalを一度渡す。commitと呼出しの間にawait／任意callbackを挟まない。同期throwもC=1。
4. dispatch Promiseの両settlementを直ちに観測し、同deadline schedulerでResponse待機を開始する。本文開始時に試行時計を再起動しない。
5. resolve時に同run／auth snapshot／ready世代／request／attempt／live／windowを再検査する。古いattemptのcallbackは現在のactive attemptを参照せず、自resourceだけに作用する。
6. pinned native Response getterでstatus／body等を読み、Proxy・偽receiver・既使用／foreign-owned Responseとstream・locked／bodyUsedを拒否する。caller override、clone、text／json／arrayBufferを使わない。対象Nodeでのnative getter挙動は合成試験で確認する。
7. Response／body claim後、同resourceのnative default readerを一度取得し、closedを捕捉して既存pumpへ進む。上記の最終検査から採用commitまでにawaitや任意getterを置かない。
8. EOF・cleanup確認・固定解析後にも同identityとwindowを確認する。返却は固定summary／診断のみで、正式receiptやbodyは発行しない。

同attemptのprivate受領継続に届いたという事実と、実ネットワークで正しい応答だったという事実は別。見たことのない他要求のResponseを悪意あるfake dispatcherが返した場合、native Responseだけでは識別できない。内部台帳で検出できるforeign handle／再利用は拒否し、それ以外の由来保証は信頼依存と独立oracleの範囲に限定する。

## 6. 中断・Response未到達・late応答

run取消・close・global停止・D_io到達では、採用権限を先に同期失効し、同controller.abortを一度だけ要求する。signal.reasonへtoken・URL・例外等を入れない。signalを受けたという観測はdispatcherの物理終了の証明ではない。

| 状態 | 固定処理 | 確認できない場合 |
|---|---|---|
| Response待機中 | signalをabortしdispatch Promiseのsettlementをcleanup予約内で待つ | Promise pendingはdispatch未終了としてcleanup未確認。架空のreader releaseでconfirmedにしない |
| 自ownerのbody採用後 | 同reader.cancelを一度要求し、read／closed／cancel／releaseを従来どおり別々に確認 | cancel pending／rejectやrelease失敗はcleanup未確認 |
| abort後にResponse到着 | 本文を採用・課金・解析しない。新規に由来／所有を確認できた自resourceだけbest-effortでbody.cancel | 外国lock／foreign claimを操作しない。既に返した未確認終端は修復しない |
| Responseなしでdispatcher reject | pendingが解消した事実とabort／診断を確認 | rejectの秘密Errorを表示しない。正常bodyとみなさない |
| EOF後のrun取消 | 採用を失効し結果を拒否 | 実行していないcancelをconfirmed/cancelledとして記録しない |

未到達cleanupのpending／late body用分岐を既存reader cleanupへ無理に写像しない。`not_started`（dispatcher未呼出し）、`in_progress`、`confirmed`（所有resourceの終了確認済み）、`unconfirmed`を維持し、dispatch pending／失敗と本文cleanup理由を内部で保持する。exactな追加診断語彙は実装前に既存strict schemaと合わせて確定する。

abort listenerからclose／cancelへ再入してもclaim・C・abort・cancel・releaseを二重実行しない。late cleanupは一度限り、他attemptを停止／解放せず、旧候補を復活させない。確認不能なrunでは後続retryを認めない。

## 7. 会計・時計・失敗分類

| 費目 | 唯一の所有者 | この接続で禁止するもの |
|---|---|---|
| C、purpose／attempt、final予約 | 同ReadState | dispatcher／adapterでの再加算、返金、新purposeによるretry回避 |
| G／S、P／E | 同private bytes採用／固定consume | Response.text等の別読取、adapterでの二重課金、late bytes採用 |
| run／phase／attempt期限 | 元t0と既存clock／absolute scheduler | Response待機と本文で別10秒、abort時の60秒再起動 |
| cleanup予約 | 最初の停止／EOF時に同attemptへ固定 | Promise継続の再開時刻から予約を延長 |
| resource／保持／work | 各固定所有部、後続受付設計 | HTTP受信byte制限でheap／CPUも証明したと扱うこと |

全体60秒、通常50秒・整合55秒、各attempt最大10秒、cleanup最大250msかつ残量の1/4以内、Q<=210と低減値を維持する。Response待機にも同D_ioが適用され、既存C/G/S/P/E/R/Tを引き継ぐ。

失敗は既存の固定codeへ写像し、秘密の例外本文・header・token・URLを返さない。

- 不正入力：`invalid_input`。known owner内の用途／URL／auth／attempt混入：`evidence_binding_mismatch`。外国ownerには作用しない。
- dispatch reject／同期throw：`upstream_unavailable`。不正Response：`invalid_response`。本番[`bounded-read`](../src/servicenow/bounded-read.ts)の`request()`はtimeoutに限らず`upstream_unavailable`（fetch reject・429・5xx）を1回retryする。CD-04ではResponse-reader経路の429／5xxだけをcleanup確認後の限定retryへ接続した（§13）。dispatch reject後のretryと本番の固定backoff移植は未接続のまま。それまでは成功・retry済みへfallbackしない。
- 局所timeout：`attempt_deadline_exceeded`を保持。cleanup確認済みで既存retry条件が成立した場合だけ同purposeの2回目へ進む。
- global取消／期限／累積上限は従来code。cleanup不成立は`cleanup_unconfirmed`を別軸に保持し、先行timeout／dispatch失敗を消さない。

HTTP status分類は同core内の固定分岐とし、counterや第二のstate machineを追加しない。初期の200＋bounded JSON subsetに続き、§13で429／5xx・401／403・redirect等を切り分けた。200以外の成功statusを成功本文へfallbackしない。CD-02の破棄専用経路は初期subsetのまま維持する。

## 8. 合成試験・独立oracle

native Response／Streamsはメモリ内で生成する。global fetch・実token・PDI・OS設定変更は不要。fake dispatcherの別ledgerで呼出し順・descriptor・signal参照・abort観測数を記録し、製品側statsを期待値計算の入力にしない。

| 項目 | 必須条件 |
|---|---|
| 固定要求 | 初回／最終の用途・URL・fields・ordinal、同auth handle／ready世代、同signal、Cと予約の独立計数 |
| 混入 | 別run／purpose／auth世代／attemptのhandle、複製descriptor、再利用Response／body、locked／Proxy／偽receiverを拒否 |
| 所有の限界 | 一致するresponse.urlを証拠へ昇格しない。未知Responseの実originを検査できたと主張しない |
| 待機の期限 | Response未到達でD_io取消、本文到着後も元deadline。cleanup等号でconfirmedにしない |
| 取消 | Response前／reader前／read pending／EOF後、同期再入、abort後resolve／reject、never-settleを別々に検証 |
| cleanup | dispatch pendingとcancel pendingを区別。late応答の自resourceだけ解放、foreign resource未操作、二重処理なし |
| retry | 確認済み局所timeout、CD-04のResponse-reader経路ではcleanup確認済み429／5xxだけ同purposeの2回目。dispatch rejectのretryは未接続。新controller／新Response、同run／auth／台帳、旧断片なし、C/G返金なし |
| bytes | private snapshotから一度課金・解析。非成功status／late本文を成功projectionに使わない |
| 失敗／非露出 | dispatcher throw／reject、getter不適合、clock／scheduler失敗、秘密sentinelのログ／結果非露出 |
| 閉鎖 | global fetch sentinel、正式発行拒否、package除外、実session台帳がfixture handleを認識しない |

## 9. 次の実装単位と未確認事項

1. request context／logical request／同attemptのdispatch claimと固定親GET builderをfake依存だけで実装。URL／auth／purpose混入・C=0/1境界を試験する。
2. 同signalとResponse待機を既存監督へ接続。read前の取消・never-settle・late応答とcleanup診断を試験する。
3. private Response／body採用から既存native reader監督へ一体接続。retry・会計・秘密非出力・既存42＋25件の互換を検証する。

draft-0.1設計作成時は全て未実装。§10のCD-01で1の限定subset、§11のCD-02で2のResponse待機・破棄cleanup、§12のCD-03で3のnative readerへの本文採用を合成接続した。既存stream-only入口の互換を保ち、新compositionから生stream採用口を外へ公開しない。実session／ReleasePermitへの採用、OAuth秘密のprivate引渡し、HTTP status全表、正式window／payload／worker binding、全体work・heap・本番cap、実host強制終了は別途確認が必要。

draft-0.1設計作成段階は文書のみで、実装は対象外だった。後続の限定実装は§10と区別する。正式発行口の開放・全体受付の有効化・本番policy承認は行わない。Unknown、VM／監視／telemetry調査保留を維持し、実transport・実機操作・設定変更・Pushは対象外のままとする。

## 10. CD-01：固定親GET・同期fake dispatcherの最初の接続

2026-10-28追加。[同module内factory](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts)と[21件の合成試験](../tests/review/closed-parent-dispatcher.test.ts)、[検証記録](E2E_BEST_PRACTICE_CLOSED_PARENT_DISPATCHER_2026-10-28.md)を参照。新compositionが同coreを一度生成し、fixture専用private request台帳から同ReadStateのparent_initial／parent_finalへ進む。

### 10.1 今回成立する結合

- constructorの固定Update Setから§4の単一record取得（`sys_update_set/<sys_id>`、fields 5列、query／limitなし）の架空HTTPS URLを生成し、caller URL／origin／purpose／auth上書きをstrict schemaで拒否する。URL生成はdispatch commitより前。
- request handleは凍結null-prototype objectとprivate WeakMapで識別する。表示用descriptor・auth handle・コピー・外国factoryのhandleは権限ではなく、C=0／dispatcher未呼出しで拒否する。外国factoryの台帳や停止状態には作用しない。
- auth contextはconstructor生成の不変fixture identity一つに固定し、初回／retry／最終で同じ参照を渡す。秘密を含まず、snapshot／readyの交換口もない。ただし実AuthSnapshotIdentity／ready世代の証明ではなく、独立した世代変更を扱う正式lifecycleへの接続は後工程。
- private acquire継続を同ReadStateのdispatch／window成立後だけ呼ぶ。Cはcoreが一度だけ増やし、fake dispatcher内の独立観測でもC=1を確認する。dispatcherの同期throwも返金しない。
- 同logical request内の2回目はcleanup確認済み局所timeoutだけ。URL／context／予算を変えず、新しいcontroller／signalとordinalを渡す。3回目・完了handleの再利用・finalの順序違反を拒否する。
- 同signalをfake dispatcherへ渡し、同attemptの中断でabortを一度通知する。返却不適合でも一次診断を確定した後にsignalを失効させる。abort listenerからcancelへ再入しても一次診断・Cを変えない。

### 10.2 採用しないもの

今回のdependencyは**同期でFakeClosedAttemptIoを返す試験専用関数**だけ。own data propertyのread／cancel／abort／releaseとnative Promiseのclosedをpinし、Proxy・accessorを呼ばない。Promiseを返すdispatcherやResponse／thenableは拒否し、Response本文を読まない。返されたnative Promiseや、不正I/Oの既知closed Promiseのrejectは直ちに観測して未処理例外を防ぐが、成功結果へ採用しない。

これは§5〜§6のResponse待機を実装したものではない。async dispatcher・Response待機・late Responseの物理解放・HTTP status／url検査は未接続。拒否したResponseの所有を主張せず、cleanupのnot_startedは「本文I/O未採用」を意味し、dispatcher未呼出しやHTTPの終了確認と読み替えない。

bodyの正常経路は既存fake pumpの固定合成projectionを使う。実Table APIの余剰列や配列形との互換性・sourceの意味検査を証明しない。実transport向けに本factoryの同期返却を汎用asyncへ緩めるのでなく、次段階で同resourceにdispatch pendingを追加し、単一監督へ接続する。

正式発行口閉鎖・Unknown・全体受付無効、VM／監視／telemetry保留を維持。実session登録、実token、global fetch、実transport、実機操作、設定変更、本番cap投入は追加しない。既存梱包除外prefixを維持する。

## 11. CD-02：同attemptのResponse待機・signal・破棄cleanup

2026-10-28追加。[実装](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts)、[32件の合成試験](../tests/review/closed-response-wait.test.ts)、[検証記録](E2E_BEST_PRACTICE_CLOSED_RESPONSE_WAIT_2026-10-28.md)を参照。§10の同期fake口を緩めず、別の閉鎖compositionでResponse待機だけを検証する。どちらも生成するcore／ReadStateは1個で、同時にactiveなbody操作とResponse待機は1つに制限する。

### 11.1 開始・時間・停止

`createInjectedClosedParentResponseWait`は同じ固定親GET builder・不変fixture auth context・private request台帳を使う。`initial`と`wait`だけを公開し、Response／body／readerを返さない。親最終観測はまだ成功証拠を持たないため公開しない。

同ReadStateのdispatch／window成立後だけdependencyへ同signalを渡す。coreはdispatch Promise pendingをresourceに保持し、元のD_ioで採用を失効してabortを一度通知する。cleanupはその瞬間から元のreserve内、元のD_attemptまで。Response待機に別の10秒や60秒を追加しない。

native PromiseだけをpinnedなPromise.prototype.thenで観測し、callerのthen／thenableを実行しない。同期Responseは同private受領継続へ直行する。同期throw／自発rejectはupstream_unavailable。timeout／取消による失効後のrejectは終了事実だけに使い、先行の局所timeoutを新しいglobal通信失敗へ上書きしない。

### 11.2 Response所有と本文不採用

Proxyを先に拒否し、native Response getterでstatus／body／bodyUsed／urlを捕捉する。callerのgetter overrideは読まない。fixture専用WeakSetでResponseとstreamを一度だけclaimし、既使用・foreign lock・既claimのbodyはcancel／unlockしない。Response.urlが空でない場合は固定URLとの一致を補助的に検査するが、同値URLを出所の証明へ昇格しない。

今回のsubsetはstatus=200かつbodyありだけ。その他status・null bodyはinvalid_responseで拒否し、所有確認できたbodyだけnative stream.cancelで破棄する。429／5xxの通信retry分類やreaderへの採用は未接続。bytesのread・text/json decode・G/P/E課金・body候補発行を行わず、`response_wait_completed=true, body_adopted=false`の固定合成summaryだけを返す。成功summaryはレビュー／親record検証の成功ではない。

### 11.3 cleanupと未開始bodyの終端

Response pendingはdispatch_pending、所有確認後のcancel pending／rejectはresponse_cancel_pending／response_cancel_rejected、foreign／不正で所有が不明なものはresponse_ownership_unknownとして保持する。confirmedは、dispatcherが決着し、必要な自owner body取消が完了した場合だけ。readerを取得していないのでEOF・closed・releaseLockの架空の事実を作らない。

Response到着時（または先行停止時）にcleanup deadlineを固定する。期限等号・未決着・時計／scheduler失敗はunconfirmed。遅れたPromise決着やlate bodyのbest-effort破棄で返却済みの診断を修復しない。late継続は古いresourceだけを参照し、新しいattemptや外国ownerを操作しない。

同ReadStateの`finishUnopened`はbody laneのstate=open・append試行数0を検査し、unavailable／retryableだけを一度終端化する。successや、ゼロbyte appendを含む読取後の適用を拒否する。body terminal／candidateを発行せず、cleanup.kind=nullで「readerなし」を維持する。この操作自体が物理cleanupを証明するものではなく、閉鎖coreの先行確認後にだけ呼ぶfixture内部操作であり、本番authorityとして採用しない。

局所timeoutでdispatchがabortに応答して決着し、cleanupが期限内に確認できた場合だけ同purposeの2回目を認める。新signal・ordinal、同URL／auth context／予算を維持し、3回目・二重wait・foreign／copy handleは拒否。未確認cleanupではglobal停止し、先行attempt_failureを残す。

### 11.4 継続範囲

CD-02時点ではCD-01の同期口と既存stream-only入口を互換維持し、Response→native reader→同bytes採用をCD-03へ残した。後続の合成接続は§12を参照。正式な実認証snapshot／ReleasePermit／選択window・payload／worker job、公開JSON、全体work／保持上界、本番capと実時間host終了は未接続／未承認。

正式発行口閉鎖・全体受付無効・Unknown、VM／監視／telemetry保留を維持する。global fetch・実transport・実機操作・token発行・設定変更・Pushは行わない。

## 12. CD-03：同Responseからnative reader・同bytes解析への接続

2026-10-28追加。[実装](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts)、[追加30件](../tests/review/closed-response-reader.test.ts)、[検証記録](E2E_BEST_PRACTICE_CLOSED_RESPONSE_READER_2026-10-28.md)を参照。新factory`createInjectedClosedParentResponseReader`は固定親GETのinitial／final／readだけを公開し、Response・stream・reader・body候補の登録／返却口を設けない。

### 12.1 一つのattemptのまま採用する

CD-02と同じprivate待機継続で、native Responseのstatus／URL／body所有・使用状態を検査する。status=200・bodyあり・live・D_ioより前だけ、同bodyのnative default readerとclosed Promiseを一度捕捉する。fixture専用のResponse／stream claimを共用し、別factory・再利用・外国lockを拒否する。

本文開始時にport.dispatchやattemptWindowを再実行せず、待機中に確定したattempt参照・元deadline／ioDeadline／reserve・同controllerを渡す。Response到着をEOF／cleanup開始と誤認せず、正常な本文読取には到着から250msの別制限を付けない。閉鎖core内の共通superviseBodyが既存pump・terminal・body.finish／consumeを使い、Cの再加算・Gの二重課金・別予算生成をしない。

同private copyから一度だけ課金・hash・固定解析を行う。固定要求の対象sys_idをprivate resourceへ渡し、親result.sys_idとの不一致はinvalid_responseで拒否する。対象はconstructorの検証済み値であり、callerによるexpected ID差替えや返却rowの再登録を認めない。既存の対象ID未指定の合成parser入口は互換維持する。

### 12.2 停止・cleanup・切替境界

本文中の取消／timeoutは同signalをabortし、同reader.cancel・pending read・捕捉済みclosed・releaseLockを監督する。EOFは確認済み正常終端だけ。cancel完了とreader解放を同一視せず、pending／reject・期限等号では候補を消費しない。cleanup確認済み局所timeoutだけ同purposeの2回目を許し、元のG・Cを残し、別Response／body／signalと同URL／auth contextを使う。

Response到着時に待機タイマーのdisposerが失敗する場合も、旧待機resourceのscheduler／clock／abort失敗・revoked・cleanupDeadlineを本文resourceへ引き継ぐ。primaryを保持し、未確認をconfirmedへ格上げしない。既にabortを通知した状態も引き継ぎ、同signalを二重通知しない。late Responseの不採用・自ownerだけのbest-effort破棄はCD-02のまま。

### 12.3 固定結果と未接続範囲

返却は件数・受信byte・digest等の既存固定合成summaryと診断だけ。本文・親sys_id・URL・auth context・reader・正式receiptは返さない。公開MCPの0.2／0.3契約やAU-BR-006の登録は変更しない。親最終readも同じtarget／URL／auth contextと所定slotで実行するが、初回と最終のstate／application／更新世代の安定性を認定するParentSnapshotや正式source証拠は発行しない。

対象sys_idを結合したこの経路では、本文を本番`bounded-source`の`parentSchema`と同じstrictな5列（sys_id／state／application／sys_updated_on／sys_mod_count）で解析し、固定GETが要求するfieldsの応答をそのまま受理する。sys_idだけ・余剰列・欠落列・不正な更新世代は`invalid_response`。対象ID未指定の既存合成parser入口はresult.sys_idの射影のまま互換維持する。表示値差・配列形・実Table APIの実応答との互換は未検証。HTTP分類は後続§13を参照。実auth snapshot／ReleasePermit／選択metadata・payload／worker job・上位正式JSON、全体work／保持上界・本番cap・OSの実時間終了は後工程。

CD-01・CD-02・stream-only入口の合成互換を維持し、既存package除外prefixから外さない。正式発行口閉鎖・Unknown・全体受付無効、VM／監視／telemetry保留を維持。実transport・実機操作・token発行・設定変更・Pushは行わない。

## 13. CD-04：HTTP失敗分類・cleanup確認後の同purpose retry

2026-10-28追加。[同coreの固定分類](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts)、[追加39件](../tests/review/closed-http-status.test.ts)、[検証記録](E2E_BEST_PRACTICE_CLOSED_HTTP_STATUS_2026-10-28.md)を参照。対象はCD-03のResponse-reader経路だけ。CD-02のwait/discard・CD-01の同期fake I/O・stream-onlyの振舞いは維持する。

### 13.1 固定分類表

| native HTTP status | 内部code | 固定classification | retry |
|---|---|---|---|
| 200 | 成功本文へ進む（body・所有・schemaは別検査） | 記録なし | 本文側の既存規則 |
| 429 | upstream_unavailable | rate_limited | cleanup確認後だけ、同purpose通算2試行以内 |
| 500〜599 | upstream_unavailable | server_error | 同上 |
| 401 | authentication_failed | unauthorized | run停止。再認証／別tokenへの切替なし |
| 403 | access_denied | forbidden | run停止。権限追加／別主体への切替なし |
| 300〜399 | invalid_response | redirect | run停止。Locationを読まず追跡しない |
| 200以外の2xx | invalid_response | unsupported_success | run停止。204/nullを成功parentへ変換しない |
| その他4xx | invalid_response | client_error | run停止。404の存在／不可視を断定しない |
| その他（Response.errorの0等） | invalid_response | invalid_status | run停止 |

認定にはnative Responseのgetter値だけを使い、callerのstatus・headers overrideを呼ばない。分類は外国lock／使用済み／再利用を拒否する所有権検査の後だけ行い、所有不明の応答は`evidence_binding_mismatch`としてstatusを記録しない。URL／live検査に失敗した応答やlate応答を、新しい認証／HTTP障害の証拠にしない。

### 13.2 終端とretryの条件

非200はreaderへ渡さず、自ownerと確認できたbodyをnative cancelで破棄する。HTTP失敗をまず固定分類し、401／403等はbody取消がpendingでも直ちにprimaryへ確定する。待ち続ける401 bodyを局所timeoutとしてretryさせない。HTTP transientは局所attempt_failureへ記録し、cleanupが確認できるまで新要求を開始しない。

cancel pending／reject・foreign lock／再利用等の所有不明・clock／scheduler失敗・期限等号はunconfirmed／global停止で、retryを認めない。cleanup確認済み429／5xxだけ、同ReadStateのfinishUnopenedをretryableで終端化する。null bodyのtransientも、dispatcher決着と必要resourceなしを確認できれば対象とする。EOF／reader release／本文候補の事実は作らない。

retryは自動再送ではなく、同じopaque request handleの2回目readを許可する方式。timeoutとHTTP transientを合わせて通算2試行で、新purposeや新factoryへ内部で逃がさない。C/G・元t0／phase期限・final予約枠を引き継ぎ、retryでも同URL／auth context・新Response／signal／ordinalを使う。final readも同slotの残枠だけを消費する。

Retry-After・Location・任意error bodyを読まず、待機時間やdeadlineを延長しない。新しいbackoff timerは追加しない。本番bounded-readの自動retry／固定250ms backoff・dispatch rejectの再試行まで同等化したとは扱わない。これらは将来の実transport接続前の別検証対象。

error bodyはread・decodeしないためG/Sへ未読量やContent-Lengthを見積り加算せず、既に計上した受信量・Cを返金／resetしない。これはfetch内部bufferや実ネットワークの全byteを監視できるという証明ではない。実transportの受信・保持上界は引き続き未証明。

### 13.3 診断と閉鎖条件

http_failureは最初、last_http_failureは直近のHTTP失敗を凍結し、status／classification／code／syntheticだけを保持する。retry後の403等でも先行429を消さない。attempt_failureは最初の局所失敗、primaryは最初のglobal停止、cleanupは別軸であり、HTTP履歴を新しいretry権限として再登録しない。publicなretryable=trueは出さず、実際の受付は同requestの状態・通算回数・primary・cleanup／予算で決める。

追加codeはpackage除外の閉鎖gate／ReadState内部語彙だけ。公開MCP入力・0.2／0.3結果・AU-BR-006登録・正式発行口を変更しない。秘密のerror本文・URL・header・token・raw exceptionは診断へ出さない。

正式発行口閉鎖・Unknown・全体受付無効、VM／監視／telemetry保留を維持。実auth snapshot／ReleasePermit／固定source・選択payload／worker job・上位JSONへの正式binding、本番cap／全体work・heap・OS終了保証は未接続／未承認。実transport・実機操作・token発行・設定変更・Pushは行わない。
