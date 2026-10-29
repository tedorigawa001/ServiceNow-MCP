# AU-BR-006 実session／ReleasePermit・単一transport・body受領境界の詳細設計

Version: br006-session-transport-body-binding-draft-0.6 / Date: 2026-10-28。
Status: **§14〜§17の閉鎖gate・同ReadState・試行監督へ、§18の注入native Web Streamsを合成接続。正式body receipt／証拠発行gateは閉鎖。実session・実transport接続・本番cap投入の承認ではない**。

親：[共通run owner](BEST_PRACTICE_ABORT_SCOPE_RUN_OWNER_BINDING_DESIGN.md)、[TC-01〜TC-04と現行境界](BEST_PRACTICE_ABORT_SCOPE_RUN_TRANSPORT_CLEANUP_DESIGN.md)、[用途別受領物](BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_RECEIPTS_DESIGN.md)。
§18後の設計：[固定dispatcher・中断signal・Response受領draft-0.4](BEST_PRACTICE_ABORT_SCOPE_CLOSED_DISPATCH_SIGNAL_DESIGN.md)。CD-03のreader接続に続き§13のCD-04でHTTP失敗分類・cleanup確認後の限定retryを合成接続。実auth snapshot／sourceへの正式結合は未接続であり正式発行口は開かない。
後続：[選択window／payload受領物](BEST_PRACTICE_ABORT_SCOPE_REAL_SESSION_RECEIPTS_DESIGN.md)、[worker接続契約](BEST_PRACTICE_ABORT_SCOPE_CONNECTION_CONTRACT_DESIGN.md)。
親観測の接続：[private snapshot・初回／最終安定性draft-0.4](BEST_PRACTICE_ABORT_SCOPE_PARENT_STABILITY_DESIGN.md)。§13でCD-03／04の同ReadState・private owner・停止・final slot・返却前ackをfake依存で接続。実transport・実sourceのverifyや正式受領物へは未接続。
CD接続後の差分：[実session／ReleasePermitとtyped取得の接続差分draft-0.4](BEST_PRACTICE_ABORT_SCOPE_REAL_TYPED_BINDING_DELTA_DESIGN.md)。§10〜11の内部継続・fake bootstrapに加え、§12で同fake resourceのtyped cleanup・同bytes candidate・一度限りackを接続。実class更新点の移行・native adapter・正式receiptは未接続。正式gateは閉鎖、全体受付は無効のまま。
次の設計案：[native adapter詳細設計draft-0.1](BEST_PRACTICE_ABORT_SCOPE_NATIVE_ADAPTER_DESIGN.md)。同readerのnative操作を固定し、fixtureとは別のruntime所有台帳・pre-release記録・一度限り終端証拠をRT-B03へ結ぶ。注入Response／Streamsの合成受入条件だけを定め、実装・実session採用・正式発行は行っていない。
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

typed laneの受付時に親／metadata final各2、R=4を同台帳で確保し、`C+R<=Q`を維持する。既存legacy固定4検査はlegacyだけに残し、typed側へ重ねない。Q<4は受付不能、Q=4等で通常余裕が無ければbootstrapもdispatch前に拒否する。R=4では`C+1+R<=Q`によりQ<=4は通常dispatchが1回もできず、固定workflowの完遂には通常3（exchangeは4）＋R=4でQ>=7（8）が要る。受付はするが何も実行できないQ帯を残すか、受付下限を固定workflowの必要量へ揃えるかは承認待ち（§12）。

- 通常／OAuth／初回は`C+1+R<=Q`を満たす時だけdispatch。
- 将来の新tableは`C+R+2(initial allowance)+2(final reservation)<=Q`で受付。初回余裕2はCの前払いではない。T／slotを同じcommitで確保する。
- finalは自分のslotだけで`C+=1; r_i-=1`。成功／retry不要／理由付き未実施skipで未使用r_iを一度だけ解放する。R解放はC/G/P/Eの返金でも通常phase再開の権限でもない。
- retryは同logical read／用途／phaseのordinal 2だけ。前試行cleanup confirmed、retry可能な固定結果、残期限・枠を検査し、同じclaim内で待つ。未確認cleanup／認証失敗／body受理後の意味拒否を新claimでやり直さない。

未知release・選択未成立等でfinal観測自体が存在しないslotは、not_collected等の固定未実施理由で後始末する。予約を戻した事実を安定観測やHTTP成功にしない。低減Q・全retry・100 payload・8 tableを全部完遂できるとは保証しない。

## 8. clock・phase・cleanup

t0とD_hardはsessionの単調時計で固定。wall-clock ISOは証跡表示用で、残時間の起点を作らない。既存のreserve=`min(10,000ms, deadline_ms/6)`を使い、通常cutoffはD_hard−reserve、整合cutoffはD_hard−reserve/2。60秒時50／55／60秒、低減時も延長しない。

試行期限は`D_attempt=min(now+requestTimeout, D_phase, D_hard)`。最大10秒を維持し、retry待ち・decode／source検査・発行／consumeまで同期限で確認する。cleanup内側予約250ms／残量1/4、empty read 1試行あたり合計16回は未承認候補のまま。本番policyに採用しない限り正式gateの成立条件にしない。

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

承認待ち：private配置／lane生成方式、typed laneの受付下限Q（§7.1）、用途capture／E/R・cleanup／empty-read policy、全体work・保持上界、未確認resourceの再受付／終了policy、公開結果への診断写像。正式gateが閉じている間はdeny-onlyを維持し、文書承認やテスト成功だけで実行権限が発生する仕組みにしない。

draft-0.1作成時はローカル文書編集だけを行った。後続のfake限定実装は§14を参照。実transport・実機操作・token発行・設定変更・本番cap投入を行わず、正式発行口閉鎖を維持する。

## 13. 文書確認（2026-10-28）

新規本書と関連4文書の計5MDを確認し、相対リンク72件の参照先欠落なし。全5MDの行末空白検査と`git diff --check`も問題なし。現行sourceのprepared binding、legacy固定4予約、phase reserve式、TC-04のfake境界と照合した文書検証であり、build／合成テスト／実接続の成功記録ではない。

## 14. draft-0.2：閉鎖gateの最初の合成実装

[内部型とprivate生成継続](../src/review/abort-scope-evidence-closed-body-gate.ts)と[36件の合成試験](../tests/review/closed-body-gate.test.ts)を追加した。§2〜§12の将来の実接続とは区別する。検証結果は[今回の記録](E2E_BEST_PRACTICE_CLOSED_BODY_GATE_2026-10-28.md)を参照。

- 1 harnessにつきfake sessionは最大1件。constructor→run→transportの継続は同moduleのprivate closureだけで生成し、callerからfactoryを受け取らず、継続自体も返さない。
- 不透明handleをprivate WeakMapへ登録し、snapshot／auth／budget／generationの同一参照に結合する。これは合成identityであり、実認証・ready世代・ReleasePermitの証明ではない。実session台帳・fixture登録口への接続はない。
- 各claimは`unclaimed→consuming→claimed`、途中停止なら`failed`。claimをclock callbackより先に消費し、再入／取消後にhandleを公開しない。使用済みclaimへの通常の重複要求は新要求だけ拒否し、既存の正常bindingを壊さない。既知ownerに別run／transportを混ぜる矛盾は受信ownerを停止し、外国ownerを変更しない。
- `checkBinding`はreadonlyなidentity検査だけ。`refuseBody`は常に拒否し、正常bindingでも`issuance_disabled`。会計更新port・用途permit・body candidate／receipt・window／payload／worker jobは存在しない。診断の`receipts_issued=0`はこの閉鎖modelの定数であり実会計の集計ではない。
- 最初のterminal primaryと、最初の非terminal要求拒否を別slotで保持する。raw Errorは固定codeへ正規化し、秘密・本文・identityを返さない。停止後のclaimは由来として残るが権限は失効し、close後の遅い要求も診断を変更しない。
- fake clockの単調性・非有限・例外・hard期限等号をcheckpointで拒否する。timer／watchdogはないため、無操作中の自動終了や実OS期限保証を意味しない。fake期限は最大60秒、低減のみ許可する。自sessionと確認できた後は、run／transportの混入照合より前に同checkpointを行い、期限後の混入もdeadline_exceededをprimaryにする（TC-01の`active()`・本番`check()`と同順）。外国sessionは自ownerが無いので拒否だけで停止しない。
- `cleanup.http/worker=not_started`はI/O未実施のmodel表示であり物理解放の証明ではない。診断は固定長slot・freeze済みのviewで、会計更新や再開の権限を持たない。

新moduleは既存の`!dist/review/abort-scope-evidence*`で梱包対象外。draft-0.2時点で会計は未接続。次の§15でfake ReadStateだけを接続した。実ReadState、承認cap、Q下限、ReleasePermit、正式body受領境界への接続は未実施。Unknown・全体受付無効、VM／監視／telemetry保留を維持する。

## 15. draft-0.3：同fake ReadStateの会計・用途／予約

[ReadState内部型](../src/review/abort-scope-evidence-closed-read-state.ts)を§14のprivate constructorから一度だけ生成する。[合成試験50件](../tests/review/closed-read-state.test.ts)、[検証記録](E2E_BEST_PRACTICE_CLOSED_READ_STATE_2026-10-28.md)を参照。実`BoundedReadSession`・既存TC-02〜04の台帳／adapterを登録・採用するものではない。

### 15.1 生成・binding・停止の唯一性

fake constructorのstrict設定`accounting`を明示した時だけ同sessionにReadStateを置く。省略時は従来のidentity-onlyで、会計portを取得できない。`claimAccounting(session, run, transport)`は同じprivate台帳と共通clock／停止検査に通し、一度だけportを返す。成功済みの重複claimは新要求だけ拒否する。外国sessionは§14と同じく自ownerが無いので拒否だけで停止せず、claimも消費しない。自sessionへのrun／transport混入・消費中再入・失敗はcommon primaryを保持して停止し、再生成しない。

ReadStateがC/G/P/Eと用途／attempt／slotを唯一保持する。Sはattempt内、Rは最大10個のslotの残数の合計、Tは最大8 table名の数であり、ownerへ別counterをcopyしない。portとgateの診断は同じ`stats()`の固定射影を読む。`budget_authority=fake_single_state`は合成会計の表示で、実予算leaseではない。

すべてのport操作は同ownerのbinding／busy guardと元のclockを通る。global stop／closeではcallbackやawaitより前にReadStateを同期revokeし、current／active／pending payloadを失効、未完slotをinvalidatedにしてRを解放する。C/G/P/Eは戻さない。retained portも再開できず、最初のprimary／非terminal refusalを別slotで保持する。

### 15.2 費目所有とfake event

| 費目 | model内の唯一の更新点 | 合成上限・扱い |
|---|---|---|
| C | `dispatch`の同期commit | Q<=210。fake callbackがthrow／取消でもcommit済みの1を保持 |
| G/S | 同attemptの連番`chunk` | scalar lengthだけ。G<=16MiB、S<=4MiB。超過chunkも一度加算後にglobal stop |
| P | 成功・fake cleanup confirmed後の`chargePayload` | scalar lengthだけ。単体2MiB／累計8MiB、低減可。単体超過はlocal、累計超過はglobal。受信Gへ再加算しない |
| E | table initial／finalの同じchunk commit | Gの内数。fake profileの16KiB／累計256KiBだけ。超過を保持し、そのattemptは後続chunkを採用せずcleanup待ち。以後のtable受付／final readを閉じる |
| R/T | 同ReadStateのslot追加・final dispatch・settle／skip | 親／metadata各2で初期R=4、最大8 tableに各2を追加 |

各scalar lengthは整数0〜2^32−1だけを受け付け、単一超過後の停止により加算値はsafe integer内に留まる。実bytes・token・本文は受け取らず、長さやcleanup結果の自己申告から正式な証拠を発行しない。payload受領済みmodelは一度だけchargeまたはdiscardするまで次用途／final移行を拒否する。

### 15.3 用途・予約・retry

- ordinary purposeはOAuth／parent initial／release／metadata initialを各一度、payloadを最大100回だけ生成。内部でordinalを管理し、同logical readのretryは2試行まで。外部ordinalや新purposeでretry上限を回避しない。
- ordinary dispatchは`C+1+R<=Q`、table受付は`C+R+4<=Q`を検査し、初回用2件はCの前払いをしない。受付時にtable final用2件だけを原子的に予約する。
- final phaseへは一方向。親→metadata→table受付順のslotに限り、自分のfinal dispatchで`C+=1、r_i-=1`。成功／retry不要終端で残りを一度解放する。初回成功なしのfinal readは拒否する。
- ordinary枠不足は新通常用途を閉じ、予約は残す。table枠／E不足はtable受付を閉じる。初回未実施／取得不能、または証拠枠閉鎖が既知のtableだけを理由付きでskipし、Cは0、残予約だけを解放する。理由は`not_collected / initial_unavailable / evidence_disabled`。成功した親／metadataを任意skipできない。
- retry可能というfake結果と同attemptのcleanup confirmedを受けた時だけ同purposeを再利用できる。cleanup unconfirmed・不正結果はglobal stop。予約返却でordinary phaseを再開しない。

Q=4〜6等の利用不能帯を本番で受付するかは§7.1の承認待ちを維持する。このmodelはQ>=4を合成入力として試し、R=4で通常dispatch不能ならC=0で拒否するだけで、本番Q方針を変更しない。E上限も承認済みcapへ昇格させない。

### 15.4 時間と未接続範囲

起点はfake constructorの同t0、hardは最大60秒の同期限。reserve=`min(10000, deadline_ms/6)`から通常／整合cutoff（60秒なら50／55秒）を固定し、会計claimやfinal移行で時計を再起動しない。無活動の通常用途はsoft cutoffで新dispatchを拒否しfinal枠を残す。進行中attemptがphase期限を越えた場合、この段階のmodelはglobal stopで閉じる（実streamを取り消してfinalへ継続する処理ではない）。整合cutoff・hard等号以降は成功handleを返さない。

fake cleanup後に保留中のpayloadがsoft cutoffへ達した場合は、P受領commit前に破棄し、localなphase拒否を保持する。C/Gは返金せず、pending handleがfinal移行を妨げないように失効させる。期限直前に既にcommitした費目は保持する。

draft-0.3のfake I/Oは同期の`dispatch()`通知だけ。長さモードの`cleanup=confirmed`は合成eventで、実HTTP／workerはnot_started。次の§16では別の明示bytesモードでbody候補／typed cleanup／一度限りconsumeを結合した。read／cancel／closed／releaseLockの実API観測、pending readの終了待ち、試行10秒／empty-read・cleanup予約の実監督は引き続き未接続。

実session／ReleasePermit／選択payload／worker jobの正式binding、bootstrap順序の実認証、cap承認、allocation／同期parse／全体work上界、全体受付、OS期限保証は未実施。正式body gateは常に閉鎖。新moduleも既存wildcardで梱包除外し、VM／監視／telemetryは保留。

## 16. draft-0.4：同attemptのprivate bytes候補とtyped cleanup

[body lane](../src/review/abort-scope-evidence-closed-body-candidate.ts)を同fake ReadStateへprivate接続した。[合成試験50件](../tests/review/closed-body-candidate.test.ts)、[検証記録](E2E_BEST_PRACTICE_CLOSED_BODY_CANDIDATE_2026-10-28.md)を参照。

### 16.1 生成・単一会計・所有権

`accounting.body_mode=bytes`だけがbody portを持つ。既定は`length`で既存の合成event契約を維持する。laneはconstructorで固定し、実sessionやTC-04 transportを採用しない。bytesモードでは公開scalar `chunk / settle / chargePayload / discardPayload`を拒否し、同ReadStateのprivate coreだけをbody laneから呼ぶ。C/G/S/P/E/R/Tとclockは追加台帳へcopyしない。

同dispatch commitで同attemptのbody所有部を作る。`append(attempt, sequence, bytes)`はprototype chainではなく内部slotの[[TypedArrayName]]で`Uint8Array`を検査し（prototypeを偽装した他のTypedArrayは課金前に拒否）、shared memory／Proxy／detached bufferを拒否する。species・iterator・callerのbuffer／byteLength getterを呼ばず、有界なprivate copyをclock callbackより前に採る。課金はそのcopyの長さ、解析／hashはそのcopyの連結から行う。受信済みchunkの書換えで後続本文を差し替えない。

既知の単体S超過chunkは保持せず、観測長を同G/S/Eへ一度課金して停止する。累計超過も返金しない。table下位枠超過は保持参照を破棄してcleanup待ちとし、その後の成功body候補にしない。保持中の非empty chunkは最大4096、超過chunkも受信課金後に`body_limit`でglobal stopする。空chunkは保持数を増やさないため、4096個保持中でも連番検査・0 byte課金を経て受理し、本文を破棄しない。これはfakeの制御費上限で、本番cap承認ではない。empty-readの実監督は未実装。

### 16.2 typed終端と候補

`finish(attempt, observation)`はstrictなprimitive観測だけを受け、`pending_read / cancel / closed / lock / eof`から固定のcleanup分類を作る。`confirmed`という結果値自体を入力しない。pending read、cancel pending／rejected、closed pending／rejected、lock未解放／不明、EOFもcancel完了も無い場合はunconfirmedとして固定理由を保持し、共通ownerを停止する。後の成功申告でも修復しない。

同attemptの不透明`ClosedBodyTerminal`と、それをprivate参照する`ClosedBodyCandidate`はfake realm限定。cleanup confirmed/eof＋成功outcome＋枠内受信だけが候補へ進む。cancelledはcleanup確認済みでも候補なし。ただし本番の試行timeout（local abort→`upstream_unavailable`→1回retry）と同様に`retryable`は維持し、`success`申告だけを`unavailable`へ落とす。retryable／unavailableは参照を破棄し、既存の同purpose retry／予約契約へ戻す。OAuth成功bodyは専用認証consumerが未接続なので一般候補を作らず停止する。

観測はfake依存の入力であり、実reader.closedやreleaseLockを実行・証明したものではない。rootの実HTTP／workerはnot_startedを維持し、fake cleanupは`accounting.body.cleanup`に分けて表示する。

### 16.3 固定consumeと一度限りの破棄

候補は最大1件。未消費候補がある間はordinary/table受付、final移行、次finalのopen／skipを拒否する。candidate／attempt／terminalは同値JSONやclone、別owner、別用途へ交換できない。

`consume(candidate)`はdecodeより前にclaimを`consuming`へ移す。fatal UTF-8→JSON.parse→用途ごとの固定strict schema→同private bytesのSHA-256を行い、元のclock／liveを再検査する。任意callbackへ本文を渡さない。返すのはfreeze済みrecords数・受信byte数・payload byte数・digest・synthetic／disabledの印だけ。

| fake consumer | 受理する合成JSON |
|---|---|
| parent initial／final | `result`が`sys_id`だけのrecord |
| metadata／table initial／final | `result`が`sys_id`だけのrecord配列、最大101件 |
| release | `result`が長さ1〜80の`build_name`だけのrecord配列、最大101件 |
| payload | `result.payload`文字列だけ |

上のschemaは合成の固定射影であり、ServiceNowの実record全体・所属・版・scope・release適合を証明しない。payloadは同JSONから得た文字列のUTF-8長だけを同Pへ一度課金し、Gを再課金しない。単体payload超過はlocal、累計超過はglobalという既存契約を維持する。

decode／schema失敗は固定`invalid_response`で停止し、raw Errorや本文を出さず、再consumeを許さない。成功／失敗／固定`discard`／同期revokeで保持参照を破棄する。取消・phase/hard期限前後のcheckpointに失敗すればsummaryを公開せず、期限後のP課金をしない。非payload候補もsoft cutoffでdecode前に破棄する。確認済みcleanup事実は解析失敗や取消でunconfirmedへ書き換えず、未決着のcleanupは後のfinishでconfirmedに戻さない。

連結bytesは最大S、保持chunkと連結bufferの重複を含む有界なbyte captureである。ただしJSON.parse／schema／文字列／hashのheap・同期時間の全体上界は未証明。参照破棄は物理zero化を意味しない。

### 16.4 残る閉鎖条件

`refuseBody`は引き続きdeny-only。候補／終端／summaryは正式receipt、AuthReadyGeneration、ReleasePermit、window／payload receipt、worker job、SourceRunEvidenceではなく、実台帳へ登録する口もない。draft-0.4では試行監督が未接続だったが、§17でfake依存の監督を追加した。実stream API、実認証／source binding、公開JSONへの写像、本番cap・全体work／保持上界の承認は引き続き未接続。全体受付無効、VM／監視／telemetry保留を維持する。

## 17. draft-0.5：fake試行期限・中断・終了確認

[専用fake supervisor](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts)がprivateに閉鎖gate／同ReadState／body laneを一度生成する。[追加42件](../tests/review/closed-attempt-supervisor.test.ts)、[検証記録](E2E_BEST_PRACTICE_CLOSED_ATTEMPT_SUPERVISOR_2026-10-28.md)を参照。既存session・transportを登録する口は設けず、attempt／candidate／生本文のhandleも返さない。返せるのは既存の固定summary、固定失敗code、readonly診断、同台帳が生成済みのpurpose／slotだけ。

### 17.1 単一policyとdispatch時の固定window

ReadStateの明示`attempt_policy`はbytesモード限定・既定無効。専用supervisorは最初からbytesモードとpolicyを設定して一度だけclaimし、既存の長さ／未監督bytes試験を変更しない。supervisorの設定入口はtop-level `policy`だけとし、`session.accounting.attempt_policy`との二重設定は拒否する。低減値を別defaultで上書きしない。

| 項目 | fake policy／導出 |
|---|---|
| timeout_ms | 1〜10000、既定10000 |
| cleanup_reserve_ms | 1〜250、既定250 |
| max_empty_reads | 1〜16、既定16。各attemptの総empty数で非emptyではresetしない |
| D_attempt | 同dispatch checkpointのnow＋timeoutと元のphase期限の小さい方。phase期限は既に元hard以内 |
| reserve | `min(cleanup_reserve_ms, (D_attempt - dispatch_now)/4)` |
| D_io | `D_attempt - reserve` |
| D_cleanup | 最初の取消／停止またはEOF観測時に`min(D_attempt, now + reserve)`で固定。継続taskが再開した時刻を起点にしない |

windowは同ReadStateの同attemptへprivateに格納し、候補にも同deadlineを結合する。guardは操作開始時のdeadlineを保持し、body参照を破棄した後の最終checkpointでも等号以降の成功を拒否する。全体のt0／60秒、通常50秒・整合55秒（低減時は同reserve式）を再起動しない。

### 17.2 fake依存とone-shot所有

依存は`clock.now / schedule(absoluteDeadline, wake)`と、fake `read / cancel / closed promise / abort / release`だけ。Web Streams・Response・fetch・実timer・OS I/Oを呼ばない。各methodとclosed通知は一度だけcaptureし、同resourceに固定する。bytes種別は最新body laneと同じnative内部slotで確認し、prototype／realmで誤分類しない。

closed promiseの両settlementをreadより先に観測し、同時にpending readは最大1。D_io、全体取消、global失敗では先に採用権限を失効し、abort／cancelを一度だけ要求する。read完了後も同clock／liveを検査し、失効後のbytesは課金・保存・decodeへ渡さない。C/G/P/Eは返金せず、retryでも同台帳・同時計を維持する。

cleanupはpending readの決着、cancel完了、closed通知、release結果を別に保持する。releaseはpending readなし・closed決着後に一度だけ行い、callback後の時計でも再検査する。cancel要求やPromise消去だけでconfirmedにしない。期限等号、pending／rejected、abort／release失敗、scheduler／clock不成立は固定理由でunconfirmed。

待機はversion通知と単一のscheduler登録を合流し、起床／終了時にdisposerを一度呼ぶ。schedulerのthrow・早すぎる発火・disposer失敗は停止する。遅れたcallbackは採用や新attemptを開始できない。disposer失敗時に物理的timer消失を保証したとは扱わない。

### 17.3 retry・診断・終了

I/O timeoutはまず局所`attempt_deadline_exceeded`として採用を止める。cleanup confirmed/cancelledかつ元の試行期限内なら、既存body laneへ`outcome=retryable`を渡し、同purposeの2回目だけを許す。上限2回を使い切っても新purposeで回避しない。table下位枠超過はcleanup確認後に取得不能として既存のfinal skipへ進める。

cleanup未確認はglobal `cleanup_unconfirmed`、外部取消・whole/phase期限・受信累計超過等は既存のglobal失敗で止める。最初の局所失敗を`attempt_failure`、global理由を共通ownerのprimaryへ別々に保持する。cleanupが未確認でも以前の局所timeoutを消さず、global理由を局所へ格下げしない。EOF後にrunを取り消しても、reader.cancelを呼んでいなければcleanup kindはeofのままで、runの取消と終了事実を混同しない。

supervisorのcleanupは本fake依存の最終観測。停止時のbody laneは保守的なowner_stopped診断を保持するため、supervisorの後続確認をbody候補の復活に使わない。late settlementでbest-effort releaseできても、既に返したunconfirmed終端をconfirmedへ修復せず、C/G・summaryを増やさない。停止済みrunの再呼び出しでも終端診断を消去しない。

closeは受付を閉じて先に取消し、active cleanupは同予約内で待つ。確認不能なら未確認のまま返し、pending Promiseの強制決着を保証しない。後の実host／非協力的I/O終了policyは未接続。

### 17.4 維持する閉鎖条件

§17はfake scheduler／Promise依存上の合成検証。次の§18でnative Web Streamsのread/cancel/reader.closed/releaseLockを注入接続した。実HTTP status、OAuth／fixed source／ReleasePermit、選択payload／worker jobの正式binding、公開JSONへの写像は未接続。同期JSON.parse／hashの途中を強制中断したり、event loopやOSが停止しても実時間60秒で必ず終了すると証明したものではない。

上限値は合成profileのまま本番capへ昇格させない。全体work／allocation／保持上界・低減Qの承認、正式発行、全体受付は有効化しない。新moduleも`!dist/review/abort-scope-evidence*`で梱包除外。VM／監視／telemetry保留、実transport・実機操作・設定変更なしを維持する。

## 18. draft-0.6：注入native Web Streamsの合成接続

[同moduleの固定adapter](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts)と[追加25件](../tests/review/closed-stream-adapter.test.ts)を接続した。[検証記録](E2E_BEST_PRACTICE_CLOSED_STREAM_ADAPTER_2026-10-28.md)を参照。in-memory ReadableStreamのnative APIを使うが、fetch／Response／ServiceNow接続は使わない。

### 18.1 private取得継続とstream所有

従来のfake Promise entryは維持し、共通coreだけをsame-module private関数へ分離する。注入streamの取得継続は外へ返さず、dispatchと同ReadStateのattempt windowが成立した後だけ実行する。soft cutoff拒否ならC=0・reader未取得。stream不適合や所有権不明はdispatch済みCを返金せず、自ownerだけを停止する。

fixture専用WeakSetでstreamの一度限りclaimを保持する。locked stream、既にclaimしたstreamはgetReader前に拒否し、外国readerをcancel／releaseしない。別factoryでも同moduleの消費済みstreamを再取得しない。これは実session台帳と分離したfixture所有権であり、HTTP本文の出所や認証を証明しない。

NodeではProxyでもnative locked getterを通ることを最小再現で確認したため、`node:util.types.isProxy`で先に拒否する。残りはnative APIのreceiver／lock検査を使い、callerのlocked getter・getReader overrideを呼ばない。prototype-forged objectや非streamも固定拒否する。Node runtime自体は信頼前提で、任意のJS objectから実HTTP originを認証する仕組みではない。

### 18.2 同readerの固定操作

取得するのはnative default readerだけ。read／cancel／releaseLockとclosed getterはmodule内で固定し、reader・raw bytesを外へ返さない。reader.closedは最初のread／cancel／releaseより前に一度捕捉し、元のPromiseの両settlementを監督する。release後のclosed getterを取り直さない。byte streamもdefault readerで扱い、BYOBの別所有経路は作らない。

native read結果を同supervisorの固定read eventへ写像し、そのまま同body laneでprivate copy・C/G/S/P/E・解析へ結合する。Gをadapterで再課金しない。接続先のfetch／signalが無いため、adapterの`abort`は要求回数の記録だけで何も中断しない。実際の中断はnative cancelだけが担う。native cancelは同readerに対して一度だけ行い、pending read／closed／cancel Promiseを別々に確認してから終端を判断する。

native cancelはreader.closedとpending readを決着させても、underlying sourceのcancel Promiseがpending／rejectedのことがある。これをconfirmedに格上げしない。errored streamではread・closed・cancelがいずれもrejectし得る。最初のprimaryは保持し、cleanup理由は既存の固定優先順（cancel_rejectedがclosed_rejectedより先）で選ぶ。

native releaseLockが成功した時だけadapterのactive_readersを減らす。reader解放とunderlying sourceの全終了は別の事実。cleanupが未確認でもreaderだけ解放できる場合があるため、active_readers=0を正常終端の証拠にしない。late callbackで既に返したunconfirmed結果や候補を修復しない。

### 18.3 合成検証と継続範囲

EOF成功、timeout→cancel確認済みretry、cancel pending／rejected、native reader error、lock／再利用、empty-read総数、byte stream、native内部slotによるchunk種別、入力chunk改変、payload会計、table局所失敗のfinal skip、underlying cancelからcloseへの再入、取消後のlate enqueueを検証した。

global fetchを拒否するsentinel下でも成功し、network経路がないことを確認する。上限・元の全体時計・cleanup予約・正式発行口閉鎖は§17のままで、adapterから別session／予算／timerを生成しない。

実認証snapshot／ReleasePermit／fixed source／選択payload／worker jobの正式binding、公開JSONへの写像、実transport／PDI E2E、本番cap／全体work・保持上界は未接続・未承認。これらを満たす前に正式receiptを発行せず、全体受付無効・VM／監視／telemetry保留を維持する。
