# AU-BR-006 実session／ReleasePermit・単一transport・body受領境界の詳細設計

Version: br006-session-transport-body-binding-draft-0.1 / Date: 2026-10-28。
Status: **設計のみ。正式body receipt／証拠発行gateは閉鎖。実装・実transport接続・本番cap投入の承認ではない**。

親：[共通run owner](BEST_PRACTICE_ABORT_SCOPE_RUN_OWNER_BINDING_DESIGN.md)、[TC-01〜TC-04と現行境界](BEST_PRACTICE_ABORT_SCOPE_RUN_TRANSPORT_CLEANUP_DESIGN.md)、[用途別受領物](BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_RECEIPTS_DESIGN.md)。
後続：[選択window／payload受領物](BEST_PRACTICE_ABORT_SCOPE_REAL_SESSION_RECEIPTS_DESIGN.md)、[worker接続契約](BEST_PRACTICE_ABORT_SCOPE_CONNECTION_CONTRACT_DESIGN.md)。
本書はTC-04後の①実session／ReleasePermit bindingと②単一会計・正式body受領境界を対で具体化する。①②の後続設計として本書を優先し、既存文書の実装履歴や検証済み範囲を書き換えない。型名・port名・状態はすべて提案で、現在存在するexportとは限らない。

## 1. 現在あるものと、まだ無いもの

| 現行箇所 | 確認できるもの | 本書で設計する未接続部分 |
|---|---|---|
| [bounded-read](../src/servicenow/bounded-read.ts) | private認証snapshot／run owner／readonly lease、元のC/G/P・時計・認証・stop／close、legacy固定4試行予約 | 同じ状態を使う唯一のtyped transport authority、用途別claim、確認済みbody境界 |
| [実lifecycle](../src/servicenow/review-evidence-lifecycle.ts) | 同sessionの登録一度限り、ready世代、同期revoke、readonly予算、prepared source claim | transportの一度限りの利用claim・更新port、pending bodyの失効／正式発行 |
| [実source](../src/review/bounded-source.ts) | 同sourceの#permit／独立不変release snapshotのprepared binding、既存metadata／payload版照合 | 同じtyped受信からのbody→選択window／payload receipt接続 |
| [TC-04](../src/review/abort-scope-evidence-run-stream.ts) | fake sessionのbootstrap→release→metadata／再読、同じprivate bytesの課金／解析、typed cleanup | 実sessionの会計・認証主体・ReleasePermitとの正式bindingではない |
| 旧fixture台帳・worker | 独立した合成claim／IPC／解析・比較 | 本番のissuer／source receipt／worker jobへの由来を証明しない |

実sessionとReleasePermitのprepared bindingを再発明しない。そこに**同constructor由来のtransport／budget identityと受領の制御フロー**を追加する。plain JSON・同じsys_id／hash・正常return・既存statsの再登録で隙間を埋めない。

公開MCP引数・0.2／0.3結果・明示14／既定3規則・selection_mode省略互換は変更しない。AU-BR-006登録・実機検証・設定変更は非対象。Unknown・全体受付無効、VM／監視／telemetry保留を維持する。

## 2. 採る構成と生成元

将来の固定adapterが新しいsessionを生成する際、session constructorのprivate継続だけがrun owner、単一ReadState、transport所有部を結合する。既にlegacy GETを始めたsessionを採用・切替しない。公開のmode引数・任意session／fetch／observerを登録するfactoryは設けない。

- ReadStateは同じsessionのC/G/P、絶対期限、停止理由を唯一所有する。既存fieldから別counterへcopyして並行更新せず、移行時もlegacy／typed双方が同じ状態を参照する設計にする。
- laneは最初の認証／HTTP要求より前に固定。legacyでは従来動作を維持し、typed laneでは旧get／final:booleanへの迂回を拒否する。laneを後から変えるsetterや認証後の再登録はない。
- 正式生成口は未実装／閉鎖。最初の実装検証もfake I/Oだけを使う内部試験とし、fixture／TC-04の台帳・permit・projectionを実sessionへ登録しない。
- 現在のregisterReviewEvidenceSessionやreadonly leaseの構造一致は更新権限ではない。同sessionを知っているだけのコードや任意のlease実装にauthorityを渡さない。更新portはprivate fieldから固定所有部へだけ渡し、lookup-by-sessionや返却getterを追加しない。

## 3. 所有権・内部型

| 提案型／所有者 | 唯一の生成元・結合 | 権限と解放責務 |
|---|---|---|
| PendingRunDiagnostic | 固定adapter最外側、session生成前 | 生成拒否も固定stage／codeで保持。存在しないresourceのcleanupをconfirmedにしない |
| SessionReadState | session constructor | 実counter／t0／有効上限／phase／停止を唯一所有。同時実行枠はsession.closeだけが返却 |
| RunBinding | 既存private run ownerの生成継続 | session、孤立snapshot、auth identity、budget identity、laneを参照固定。秘密を返さない |
| TransportUseClaim | 同ReadState内 | 未使用から一度だけconsume。別transportへの差替え・復元禁止 |
| AccountingPort | TransportUseClaimの固定成功継続 | dispatch／chunk／予約終端の固定操作だけ。任意setter・counter減算・deadline更新なし |
| BootstrapReadPermit | 同runの認証／初回親／releaseの固定caller | 同source初期identity・用途・phaseに限定。matchedを要求せず、metadata以降へ使えない |
| PreparedSourceBinding | 既存source #permit発行部＋source claim | 同source、auth ready世代、親snapshot、#permit、不変release snapshot、同transportへ固定 |
| MatchedReadPermit | 上記bindingの固定継続 | metadata、final親／一覧など所定用途だけ。payload／tableには後続の選択／plan証拠も必須 |
| LogicalRead／AttemptClaim | transportの同用途台帳 | 1論理read内の最大2試行。await前に試行をconsumeし、同一reader／controller／受信bufferを所有 |
| AttemptSettlementReport | 同attemptの単一cleanup section | API上の終了事実だけ。成功bodyやsourceの正しさを認定しない |
| PrivateBodyCandidate | 同attemptのEOF／bounded受信完了部 | transport内部の仮置き。外部登録・汎用getter・worker送信不可 |
| BoundedBodyReceipt | 将来の固定body issuer | matched後の同受信bytes・用途・cleanup・有効性を結合。指定source消費部へ一度だけ移譲 |

handleは非公開台帳／ECMAScript private領域の参照で識別する。TypeScript brand、instanceof、nonce、JSON、hash、時刻、同値tokenだけでは受理しない。raw値を登録するconstructor・合成handleとの互換cast・test用の本番台帳操作口を作らない。

## 4. claimと生成順序

claimは役割を分ける。既存のrun登録／source claimを同じ意味で二重に作らず、不足するtransport・用途・body発行／消費状態だけを同じ所有関係へ追加する。

| claim | 消費点 | 失敗後 |
|---|---|---|
| run利用 | 同sessionのprivate run継続を固定callerへ結ぶ前 | consuming→claimed／failed。別owner／認証世代で再取得不可 |
| transport利用 | 認証前、I/O依存を呼ぶ前 | 消費済みをsession lifetimeで保持。二つ目の更新portを発行しない |
| source binding | 同sourceのmatched #permit成立後 | 既存sourceClaimのconsuming→claimed／failedを拡張し、別permitで救済しない |
| logical read／attempt | 所定用途を開始する前／fetch直前 | 同logical readの許可retry以外は再GET不可。失敗Cを戻さない |
| body発行／consume | 同attemptの終端commit／指定source消費開始前 | 二重発行・再consume不可。decode／意味検査が失敗しても未使用へ戻さない |

生成順は固定する。

1. 最外側診断slot→入力／admission→session生成。部分生成失敗は既存sessionの責務だけで解放する。
2. constructor内でRunBinding・単一ReadState・lane・TransportUseClaimを固定。初回OAuthより前に停止先と予約を確保する。
3. 同じ認証snapshot／readyPromiseでper-userまたはservice-accountを準備。cache／交換／retryのC/Gと時計を引き継ぐ。再認証や別tokenへ交換しない。
4. BootstrapReadPermitで初回親→release観測を実行。同じsource初期identity・Update Setを使う。
5. release unknown／mismatchedならmetadata前で終了。matchedだけ同sourceの既存#permit・private release snapshotをprepared bindingへ結合する。
6. 同transport／budget／ready世代を再検査してprepared_onlyへcommit。この時点は正式なSourceRunEvidence・選択window・jobではない。
7. 将来のbody発行条件とgateがすべて成立した固定metadata取得だけからbody receiptを作り、後続のwindow検証部へ渡す。現在はgate閉鎖なのでこの発行へ進まない。

await後と最終commit直前は同owner・live・予定stageを再確認する。最後の検査とcommitの間にawait／任意callback／利用者入力のgetterを挟まない。重複生成要求は健全な既存ownerを交換せず拒否し、既知owner内のbinding矛盾はそのownerを停止する。外国runの台帳を探索・消費・停止しない。

## 5. bootstrapと正式bodyの区別（循環回避）

ReleasePermitが存在する前のOAuth・親・releaseに、matched permitや選択windowを要求しない。一方、その取得成功を後付けで正式body receiptへ登録しない。

- OAuth本文は同認証部だけが一度消費するAuthBodyCandidate。cleanupと応答検証後に同ready世代へ進むが、一般body receipt・source／workerへのtoken配送はない。
- 初回親／releaseは同bootstrap readのprivate受領候補と固定projectionからParentSnapshotRef／release根拠を得る。これはissuerが所有する内部事実で、caller返却recordからの再登録ではない。
- matched後は、これらの**発行元identity**をprepared bindingへ引き継ぐ。過去bodyにmatched権限を遡及発行しない。
- 正式metadata bodyはprepared bindingを前提にできるが、まだ存在しないSelectionWindowReceiptを前提にしない。window発行はそのbodyを消費したsource意味検査の後工程。
- payloadはSelectedAssetReceipt、tableは同worker job／planの正式bindingが必要。これらが未接続なので本設計では発行経路を開かない。

AuthReadyGenerationは同snapshotの認証準備完了を表すだけで、安定した本人sys_id／R-2本人確認の証拠ではない。per-user→service-account fallback、credential-keyを本人identityへ昇格すること、fixtureのauth_ready booleanによる世代発行は禁止する。

## 6. ReleasePermitと正式binding

既存BoundedUpdateSetSourceのprivate verifierが同session／source／#permitを確認し、内部の不変release snapshotを供給する境界を維持する。返却decisionを再提出させず、公開decisionとmutable参照を共有しない。

必須identityはrun／session／transport／budget、auth snapshot／ready世代、source初期identity／source世代、#permitそのもの、release snapshot、親snapshot、lane／phase。metadata開始・body発行／consume・将来のpayload／worker移譲・finalの各境界で再照合する。

C方式は既存のbinding／設定期限／実測との競合判定に従う。asserted／未実測／陳腐化のlimitationsを保持し、設定値をresolved・table ACL・scope一致へ強めない。`expires_at > started_at + deadline_ms`を維持し、途中で設定を再読・延長しない。ReleasePermit自体も本番cap・body issuerの承認ではない。

## 7. 単一予算と費目所有

| 費目 | 唯一の更新点 | 境界・停止 |
|---|---|---|
| C | 同transportのdispatch commit | Q<=210と低減値。OAuth／親／release／metadata／payload／table／final／retryを共有。同期throwも1、未dispatchは0 |
| G／S | 同read completionの採用commit | G<=16MiB、通常S<=4MiB。超過chunkも加算後に拒否。Sだけ試行ごとにreset、Gは返金なし |
| P | sourceがpayload文字列を受領した固定境界 | 単体2MiB／累計8MiB。版／schema拒否分も課金。hash／receipt／IPCでは再課金しない |
| E | 同table chunkの下位内数 | Gへ二重加算しない。16KiB／累計256KiBは未承認候補、未承認ならtable受付・発行不可 |
| R／T | 同sessionの用途別slot台帳 | 初期R=4、table受付・skip・final消費を原子的に管理。旧固定4との二重積みなし |
| capture／IPC／work | 各resource所有部の別費目 | HTTP受信の再課金で代用しない。保持上界／全体work受付は別途検証、現在は無効 |

dispatchはactive／identity／phase／枠を検査し、attempt claimとCを同期commitして直後にfetchする。間にawait・任意callbackを置かない。HTTP redirectは従来どおりerrorとし、別接続先・tokenで予算を作り直さない。

正常採用chunkは、boundedなprivate copyを用い、同じbytesから課金・後続decodeを行う。時計callback等に外部chunkを書き換えられても、課金後に別本文を採用しない。cap超過が既知のchunkは必要な受信課金を保持して停止し、成功bodyへ保存しない。停止が採用commitより前ならlate chunkとして不採用、commit後なら費用を保持する。未読量・Content-Length・fetch内部bufferを実受信計数へ見積り加算しない。

TC-04の16KiB（OAuth／親／release）・1MiB（metadata）captureはfake profileであり、本番の承認済みcapではない。正式境界では有効な既存上限と承認済み用途profileの小さい方を使い、profileが未承認ならgateを閉じる。bodyサイズ制限でfetch内部allocationや同期JSON処理の最悪時間まで保証したとは扱わない。

### 7.1 予約とretry

typed laneの受付時に親／metadata final各2、R=4を同台帳で確保し、`C+R<=Q`を維持する。既存legacy固定4検査はlegacyだけに残し、typed側へ重ねない。Q<4は受付不能、Q=4等で通常余裕が無ければbootstrapもdispatch前に拒否する。

- 通常／OAuth／初回は`C+1+R<=Q`を満たす時だけdispatch。
- 将来の新tableは`C+R+2(initial allowance)+2(final reservation)<=Q`で受付。初回余裕2はCの前払いではない。T／slotを同じcommitで確保する。
- finalは自分のslotだけで`C+=1; r_i-=1`。成功／retry不要／理由付き未実施skipで未使用r_iを一度だけ解放する。R解放はC/G/P/Eの返金でも通常phase再開の権限でもない。
- retryは同logical read／用途／phaseのordinal 2だけ。前試行cleanup confirmed、retry可能な固定結果、残期限・枠を検査し、同じclaim内で待つ。未確認cleanup／認証失敗／body受理後の意味拒否を新claimでやり直さない。

未知release・選択未成立等でfinal観測自体が存在しないslotは、not_collected等の固定未実施理由で後始末する。予約を戻した事実を安定観測やHTTP成功にしない。低減Q・全retry・100 payload・8 tableを全部完遂できるとは保証しない。

## 8. clock・phase・cleanup

t0とD_hardはsessionの単調時計で固定。wall-clock ISOは証跡表示用で、残時間の起点を作らない。既存のreserve=`min(10,000ms, deadline_ms/6)`を使い、通常cutoffはD_hard−reserve、整合cutoffはD_hard−reserve/2。60秒時50／55／60秒、低減時も延長しない。

試行期限は`D_attempt=min(now+requestTimeout, D_phase, D_hard)`。最大10秒を維持し、retry待ち・decode／source検査・発行／consumeまで同期限で確認する。cleanup内側予約250ms／残量1/4、empty read合計16回は未承認候補のまま。本番policyに採用しない限り正式gateの成立条件にしない。

通常cutoffは新payload／prepare／通常用途を失効させ、finalへ一方向に進める範囲を残す。全体stopとは別に扱う。整合cutoff後はfinal／compareを未確認とし、残りは集約・終了確認だけに使う。phase controller交換で期限を延長せず、旧世代のlate応答を新世代へ移さない。

cleanupはcaptured reader.closed、pending read決着、必要なcancel完了、releaseLock成功を別に観測する。cancel要求・abort・Map消去・slot返却を終了確認の代用にしない。期限の等号以降に正常receiptをcommitしない。期限内に終了確認した事実を後で診断へ記録できても、失効後の新body／receipt発行は許可しない。

## 9. 正式body受領境界

### 9.1 発行条件

BoundedBodyReceiptは**bytesの由来・有界な受信・終端を示す内部証拠**であり、JSON/schema／asset所属／版／scope適合の証明ではない。将来の固定issuerは、次をすべて同じ同期commitで満たす場合だけ発行する。

1. 同constructorのrun／transport／ReadStateと唯一のclaim。laneはtypedで、正式gateと必要policyの承認条件が成立している。
2. 同sourceのprepared binding、実ready世代、matched #permit／不変release snapshot。所定の用途・logical read・phase・attempt・final slot（該当時）が一致する。
3. 所有bodyが存在し、成功HTTPの全readがEOFまで枠内。受信した同じprivate bytesを保持し、G/S/Eの採用記録と一致する。
4. 同attemptのcleanupがconfirmed/eof。cancelled／no_response／no_bodyはcleanup確認済みでもbody receiptへ進めない。
5. source消費先が固定され、pending body最大1、未発行、live・同世代・期限内である。全await後と最終commitで再検査し、失敗後は発行claimを戻さない。

metadata初回はprepared bindingから発行条件を検査できるが、SourceRunEvidenceのactive化は後続window検証まで認めない。payload／table用途は選択／job証拠が無い限りpermit自体を作らない。現在は正式gate閉鎖のため、上記条件を満たしたとする合成結果から本番receiptを発行しない。

### 9.2 private保持・一度限りの消費

receipt台帳はrun/session/source/transport/budget、auth／ready、release、用途／phase／read／attempt／slotのprivate参照、内部受領時刻、byte範囲、同bytes所有権とterminal reportを結合する。列挙可能property、serialize、本文getter、workerへのhandle転送はない。hashや同値IDだけで別receiptを同じと認識しない。

指定source consumerはlive／identityを検査し、**decode／意味検査より前に**消費claimを取得する。同じbytesを一度だけdecode／解析し、親・metadata・payloadそれぞれの固定射影と意味検査へ渡す。失敗時も再consume／再GETで救済せず、本文参照を破棄する。source schemaをまだ満たさないbody receiptから選択windowやpayload receiptを作らない。

readonlyな診断・binding照合と本文消費を分ける。retained bodyがある間は新logical GETを開始せず、成功consumeまたは固定discardを一度だけ要求する。空bytesからJSONが成立しない場合もsource拒否であり、transportのcleanup事実を捏造しない。

OAuth用候補は一般consumerへ出さない。エラーstatusは固定HttpOutcomeReportへ送りbody receiptを作らない。release-local fallbackは同sourceの固定release callerだけが、cleanup確認後の取得不能分類から既存C方式判定へ進む。通常401／403やG/P超過・取消・hard期限・cleanup未確認をlocal Unknownへ格下げしない。

## 10. 同期失効・終了・診断

全体停止の線形化点は次の順とする。

1. 最初のprimary stage/codeを共通owner・sessionへ固定。生成前拒否も外側slotで保持する。
2. 同期sectionでrunの新操作、source binding、用途／attempt受付、pending body発行・消費、将来のpayload移譲／job受付を失効。await・任意observer callbackを呼ばない。
3. その後HTTP abort／固定worker停止要求を一度だけ行う。認証やHTTP内部の失敗も同じownerへ戻し、兄弟処理を止める。
4. 元の時計の観測専用viewでHTTP／workerを別軸で終了確認。viewは新GET／receipt／jobの権限を持たない。
5. 本文／cache／binding参照、listener／timerを各所有部が解放。session.closeだけが同時実行枠を一度返却する。
6. 解放後も取消・期限・primaryを再検査して固定診断を合流。未確認を後の成功でconfirmedへ戻さない。

既に一度限りで消費したreceiptの由来を別runへ移さない。停止時に発行済みhandleは失効し、late OAuth成功・body・IPCから再生成しない。close済み正常runへの遅い拒否要求は閉鎖診断を変更せず固定拒否する。

HTTP／worker cleanupはnot_started／confirmed／unconfirmed、進行中だけ内部in_progressを使う。primaryとは別slotに固定理由を保持する。worker未接続ならnot_started、HTTPの確認をworkerへ流用しない。未確認resourceを抱えるprocessの再受付／外側強制終了policyは未承認で、単なる枠返却で安全と扱わない。

token／client secret／password／principalKey／内部identity／本文／raw Errorのmessage・stackを結果・例外・診断・receipt viewへ出さない。参照破棄はJS文字列の物理zero化、OS buffer消失、非協力的処理の終了時間の証明ではない。

## 11. 固定失敗分類と継続範囲

新しい内部型・codeは提案で、既存公開JSONへ追加済みではない。接続境界で固定列挙に正規化し、任意reasonを通さない。

| 条件 | 停止／保持 |
|---|---|
| session生成前の入力／設定／admission不成立 | 生成前拒否。部分資源だけ解放、C=0、未開始cleanup |
| unknown／mismatched release | metadata前で既存未評価の扱い。matched申告・別permitで救済せず、予約は理由付き未実施終端 |
| foreign／clone／phase／read混入 | 受信側ownerのbinding拒否。外国runは不変、既知owner内の矛盾は全体停止 |
| 同じclaimの二重開始／consume | 新要求拒否、固定invalid_state等。最初の診断と消費済み状態を保持 |
| 通常試行枠不足／soft cutoff | 新通常用途を止め、許されるfinalとpartialへ。新sessionやR流用で継続しない |
| table下位枠／table不可視等 | 後続契約の固定未評価。cleanup確認が必要、全体停止をここへ偽装しない |
| 401／通常403、G/P累計超過、取消／hard期限 | 既存の全体停止。先行理由を優先、正常body／retryなし |
| read／decode／projection／版拒否 | 受領段階を区別し、local継続は既存source契約で許す場合だけ。receiptなし、開始claimは消費済み |
| cleanup未確認 | 先行primary＋該当軸unconfirmed。primaryが無ければ固定内部失敗、正常発行・次attemptは禁止 |
| clock逆行／非有限／例外・期限後commit | 固定拒否。古いlastや新起点で発行を救済しない |

## 12. 実装前の検証条件・費用・承認待ち

| 合成試験群 | 必須oracle／拒否条件 |
|---|---|
| 生成・台帳分離 | constructorの唯一生成、二重claim、失敗後再生成、同値tokenでも別session、fixture登録／fake permitからの昇格拒否 |
| bootstrap循環 | 認証前はbootstrap用途だけ、parent-ready前release禁止、matched前metadata禁止、tokenの一般body化なし |
| identity | source／permit／ready／budget／phase／slot混入、返却decisionのnested改変、正しい既存owner不変、失効直前commit |
| bytes／consume | 独立chunk列とC/G/S/Eの一致、cap等号／超過、元chunk改変、decode失敗後再consume、late未採用と返金なし |
| retry／予約 | C+R<=Q、Q<4／低減値、最大2試行、final slot流用拒否、skipのC=0、解放で通常再開しない |
| 時間 | 50/55/60秒と低減reserve、試行／cleanup／解析後commitの等号、soft／hard分離、元の期限不変 |
| 終了・秘密 | pending fetch/read、cancel reject、closed未確認、release失敗、worker未開始／未確認、late成功で診断不変、本文・資格情報非露出 |
| 互換 | legacy GET／固定4予約・0.2／0.3・全selection mode・既存規則不変、梱包後もfixture→実session操作口なし |

oracleは製品の課金関数を再利用せず、dispatch／採用chunk／payload受領／slot終端／cleanup決着のイベント列から独立計数する。identity検査、claim、buffer copy／decode、JSON node、保持、IPC、timer／listenerの制御work・allocationを別費目として数え、全体work上界が未証明のまま受付を有効化しない。

次の実装は別承認後、(a) 閉鎖gateの内部型・private生成継続／claim・診断、(b) 同ReadStateの会計・用途／予約接続、(c) fake I/Oでのbody候補・cleanup・一度限りのconsume、の順に小さく分ける。正式receipt発行を先に実装して後からbindingを埋めない。選択window／payload receipt／実worker jobと上位正式結果はさらに後工程。

承認待ち：private配置／lane生成方式、用途capture／E/R・cleanup／empty-read policy、全体work・保持上界、未確認resourceの再受付／終了policy、公開結果への診断写像。正式gateが閉じている間はdeny-onlyを維持し、文書承認やテスト成功だけで実行権限が発生する仕組みにしない。

本書作成はローカル文書編集だけ。実装・ソース／テスト変更・build／合成試験・実transport・実機操作・token発行・設定変更・本番cap投入を行わず、正式発行口閉鎖を維持する。

## 13. 文書確認（2026-10-28）

新規本書と関連4文書の計5MDを確認し、相対リンク72件の参照先欠落なし。全5MDの行末空白検査と`git diff --check`も問題なし。現行sourceのprepared binding、legacy固定4予約、phase reserve式、TC-04のfake境界と照合した文書検証であり、build／合成テスト／実接続の成功記録ではない。
