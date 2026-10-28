# AU-BR-006：閉鎖dispatcher・中断signal・Response受領の詳細設計

Version: br006-closed-dispatch-signal-draft-0.1 / Date: 2026-10-28。
Status: **設計のみ。fake dispatcher・注入Response／Streamsでの後続合成検証案。正式発行口閉鎖・全体受付無効・Unknownを維持。実transportの採用承認ではない**。

親：[session／transport／body境界 §17・§18](BEST_PRACTICE_ABORT_SCOPE_SESSION_TRANSPORT_BODY_BINDING_DESIGN.md#18-draft-06注入native-web-streamsの合成接続)、[共通run owner](BEST_PRACTICE_ABORT_SCOPE_RUN_OWNER_BINDING_DESIGN.md)。
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
- dispatch reject／同期throw：`upstream_unavailable`。不正Response：`invalid_response`。本番[`bounded-read`](../src/servicenow/bounded-read.ts)の`request()`はtimeoutに限らず`upstream_unavailable`（fetch reject・429・5xx）を1回retryする。dispatch reject後のretryは429／5xxと同じく未確定とし、受理前に追加試験で確定する。それまでは成功・retry済みへfallbackしない。3xx等のHTTP分類は旧fixtureの規則を参照するが、新coreへ移す前に互換表と試験を確定する。
- 局所timeout：`attempt_deadline_exceeded`を保持。cleanup確認済みで既存retry条件が成立した場合だけ同purposeの2回目へ進む。
- global取消／期限／累積上限は従来code。cleanup不成立は`cleanup_unconfirmed`を別軸に保持し、先行timeout／dispatch失敗を消さない。

HTTP status分類の移植は新しいcounterや第二のstate machineを作らず、同core内の固定分岐にする。初期成功試験は200＋bounded JSONに限定し、429／5xx・null body・204の意味とretryは受理前に追加試験で確定する。未確定statusを成功へfallbackしない。

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
| retry | 現時点で受理するのは確認済み局所timeoutの同purpose 2回目だけ（dispatch reject／429／5xxのretryは§7の未確定事項）。新controller／新Response、同run／auth／台帳、旧断片なし、C/G返金なし |
| bytes | private snapshotから一度課金・解析。非成功status／late本文を成功projectionに使わない |
| 失敗／非露出 | dispatcher throw／reject、getter不適合、clock／scheduler失敗、秘密sentinelのログ／結果非露出 |
| 閉鎖 | global fetch sentinel、正式発行拒否、package除外、実session台帳がfixture handleを認識しない |

## 9. 次の実装単位と未確認事項

1. request context／logical request／同attemptのdispatch claimと固定親GET builderをfake依存だけで実装。URL／auth／purpose混入・C=0/1境界を試験する。
2. 同signalとResponse待機を既存監督へ接続。read前の取消・never-settle・late応答とcleanup診断を試験する。
3. private Response／body採用から既存native reader監督へ一体接続。retry・会計・秘密非出力・既存42＋25件の互換を検証する。

いずれも今回未実装。既存stream-only入口の互換を保ち、新compositionから生stream採用口を外へ公開しない。実session／ReleasePermitへの採用、OAuth秘密のprivate引渡し、HTTP status全表、正式window／payload／worker binding、全体work・heap・本番cap、実host強制終了は別途確認が必要。

文書を作成しただけで、正式発行口の開放・全体受付の有効化・本番policy承認は行わない。Unknown、VM／監視／telemetry調査保留を維持する。実装・実transport・実機操作・設定変更・Pushは対象外。
