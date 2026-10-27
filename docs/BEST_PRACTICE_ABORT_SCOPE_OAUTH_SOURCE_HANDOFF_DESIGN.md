# AU-BR-006 OAuth後の同transport→固定source移譲 詳細設計

Version: br006-oauth-source-handoff-draft-0.3 / Date: 2026-10-27。
Status: **OH-01の独立合成モデルに続き、OH-02の固定dispatcher・既存fixture adapterの所有者切替を実装。固定source全体の採用はOH-03へ残し、実sessionは未接続。正式発行口閉鎖、全体受付無効・Unknown、VM／監視／telemetry保留を維持**。

親：[transport／OAuth bootstrap](BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_RECEIPTS_DESIGN.md#17-未認証fixtureのoauth-bootstrapと固定失敗分類)、[固定source](BEST_PRACTICE_ABORT_SCOPE_FIXED_SOURCE_ISSUER_DESIGN.md#13-固定sourceとweb-streams受領物の結合fixture限定)。

## 1. 目的・今回の境界

同じfixture sessionでOAuth bootstrapを終え、同じtransport・state machine・会計owner・開始時計を固定sourceへ一度だけ移譲する。次の実装もまず非同梱のfixture限定とし、実BoundedReadSessionのmodeや台帳へ接続しない。実HTTP／credential／token保持／header送信、ReleasePermit・選択payload receipt・worker jobの正式結合は別工程。

成功summaryの`auth_ready`やstatsを受け取り、新session／machineを生成する方式は採らない。移譲によってsourceの親／release／selection／planが成立したとは扱わず、正式receipt・seal・公開findingも発行しない。

## 2. ソース照合で確認した不足

| 現行箇所 | 実装済み | 移譲に不足するもの |
|---|---|---|
| `abort-scope-evidence-oauth-bootstrap.ts` | privateなapi／machineを保持し、OAuthだけの固定POSTを注入先へ渡す | 成功時はsummaryだけ。GET用途を同じ供給関数へ渡すと拒否する。close／cancelは直接machineを停止する |
| `abort-scope-evidence-fixed-web-source.ts` | 固定GET生成・初回／最終・投影・delivery | factoryが新しくWeb Streams transportを生成する。既存transportを認識して採用するprivate入口がない |
| `abort-scope-evidence-fixture-lifecycle.ts` | bootstrapとprepared経路で共有するtransportClaimed、認証identity／ready世代、実session拒否 | transportの唯一性だけで、移譲claim・lease所有者・同destinationの結合を表していない |
| `abort-scope-evidence-web-stream.ts` | reader／timer／scratch／Response再利用検査を一つのclosureで所有 | callbackを後から差し替える入口はない。二つ目のadapterではこれらの台帳を共有できない |
| `abort-scope-evidence-transport-budget.ts` | 同portへ一度bindし、認証後も低水準machineを継続できる | parent／release／selection／planのready値はfixture定数。これを移譲の取得証拠として使えない |
| `FixtureAccountingSession` | C/G/P/E/R・retry・hard timer・auth完了を同stateで保持 | 新しいclaimで作り直せず、移譲専用の所有権遷移が必要 |

既存prepared ownerは親ready／matched前提を持つ。OAuth直後、親取得前にそのownerをfake factsで生成して移譲の前提にする循環は避ける。新しい「認証済みtransport lease」はprepared evidence ownerとは別の型・権限にする。

## 3. 採用案：単一run owner・固定dispatcher・lease移動

### 3.1 固定するもの

新しい内部run ownerは、最初のclaimより前にUpdate Set ID・固定source policy・注入I/O参照・同sessionを一度だけpinする。最初の実装は既存all-metadata最大100件のfixture subsetを維持し、review_targetsや任意filterを追加しない。固定destination handleを内部生成し、名前／IDの一致だけで他destinationと交換できないようにする。

同じWeb Streams adapterを一回だけ生成する。内部dispatcherは初めから次の固定分岐を持ち、後からcallbackを差し替えない。

- bootstrap所有中：OAuth用途のPOST `/oauth_token.do`だけ。credential／form本文はない合成descriptor。
- source所有中：pinしたUpdate Setの親／metadataと、既存fixtureの検証済みtable名による固定GETだけ。
- 移譲中・失敗・失効後：新しいdispatchなし。

descriptor生成も固定内部関数に限定する。移譲時にURL／query／fields／authMode／注入関数を受け取り直す汎用constructorは設けない。I/O注入関数はfixtureのTCBであり、この構造で実接続先・認証を証明したとはしない。

### 3.2 二つ目のfactoryを作らない

固定sourceの内部処理を「transport生成を伴う既存入口」と「既知の移譲capabilityを消費するprivate入口」に分ける案とする。後者は任意の`{machine, stats, run}` objectを受け取らず、同run ownerの私有台帳で認識したhandleだけを採用する。既存の独立fixture入口は維持できるが、同sessionでの混用は拒否する。

移譲は再bind／再登録／再認証ではない。`claimPreparedTransportBudget`、`claimFixtureBootstrapTransport`、`claimTransportBudget`を再度呼ばず、C/G等のコピーから新portを作らない。Response／stream再利用検査のWeakSet、permit台帳、hash／cleanup状態、native reader管理も同じinstanceを保つ。

## 4. 内部型と発行元（名称案）

すべて非同梱module内の凍結opaque handle＋private WeakMapで認識する。brand／JSON／一致hash／statsだけで発行できるfactoryは作らない。

| 型 | 発行者・結合 | 消費・寿命 |
|---|---|---|
| `FixtureAuthenticatedRunOwner` | 固定の複合入口。session参照、AuthSnapshotIdentity、固定dispatcher／destination、同adapter／budget identity | 同session一つ。root取消・終了で失効 |
| `FixedSourceDestination` | run ownerがOAuth前に内部生成。Update Set／source policy／生成世代をpin | 変更不可。一つのsourceへの採用だけ |
| `AuthenticatedTransportHandoff` | 同ownerのOAuth成功section。session／ready世代／adapter／destinationとhandoff generation | summaryから生成不可。source adoptionが一度だけ消費 |
| `FixedSourceTransportLease` | 固定sourceのprivate採用section。消費済みticketと同owner／adapterへ結合 | sourceだけが通常／最終用途を開始。closeで失効 |

session側にもhandoff状態を置く。ticket内のusedだけでは、別ticketを再生成して再採用する経路を防げない。transportClaimedは移譲後もtrueのまま、ready世代も作り直さない。既存fixture registryと本番registryの相互登録・互換castは禁止する。

offerはauthenticationReady callbackの中では実行しない。OAuthの`api.run`がfinallyでbusy／scratch／試行timerを解放した後、同run ownerの固定継続からだけ行う。ready生成とadapterの解放完了を同じ事実にしない。

## 5. 状態遷移と所有権

| run状態 | 操作できる主体 | 許可する次操作 |
|---|---|---|
| bootstrap_owned | root＋bootstrap facade | 固定OAuthの初回／cleanup済みretryのみ |
| auth_ready | rootのみ | 同世代の移譲ticketを一度だけoffer |
| offered | rootのみ | pin済みdestinationへのadoptを一度だけ開始 |
| adopting | 固定採用sectionのみ | capability検査・source構築・同期commit。新I/Oなし |
| source_owned | root＋source lease | 既存sourceのprepare／initial／finalize／delivery |
| failed／revoked／closed | rootの後始末だけ | 新dispatch／offer／adopt／再claimなし |

leaseのauthorityを`bootstrap → adopting → source`へ移す。古いbootstrap facadeのbootstrap／phase固有close操作は、source_owned後はinvalid_stateとして拒否し、新sourceを停止・再認証しない。古いfacadeに任意GETの機能も残さない。

run全体を止める権限は、creatorが保持する別のroot controlに残す。root cancel／close、session revocation、hard deadlineは全状態でsourceも失効させる。source.closeは自分のleaseを閉じ、同runの固定後始末へ進む。どのfacadeが何を閉じるかを曖昧にせず、既存bootstrap.closeの直接machine.stop実装をそのまま移譲後へ持ち越さない。

消費済みticket／古いfacadeによる移譲の再実行は拒否し、既に移ったleaseを操作しない。現在のoffered ticketを使った採用検査が失敗した場合は、そのrunを停止し再offerしない。この二つを分け、staleなphase操作に新ownerを停止する権限を与えない。

## 6. offer・adoptの検査順

### 6.1 offer

1. 同run／sessionの唯一のbootstrap claimが消費済みであり、service-account fixtureであることを確認。
2. 同machineのOAuth permitがdone、認証応答検査・cleanup confirmed・終端checkpointが成功し、同sessionのready generationが実際に生成済みであることを確認。auth_readyという返却scalarは使わない。
3. primaryなし、cleanup_unconfirmed=false、active I/Oなし、pending bodyなし、試行timerなし、保持scratchなしを確認。未完了fetch／read／cancelやretry待ちを移さない。
4. normal phaseで、OAuth以外の用途票・GETが未開始、parent／metadata／tableの状態が未使用であることを確認。低水準fixture machineで先にGETした物を後付け採用しない。
5. 同sessionのhandoff claimを確保する。既にoffer／adopt／失敗があれば再生成しない。
6. 同時計でactive／normal-phase残時間を再検査して、固定destination専用ticketを内部登録。token本文・header・refresh tokenを保持しない。

### 6.2 adopt

未知／clone／別realmのhandleは、他runを特定・停止せずbinding拒否する。既知の同owner・offered ticketを特定した後は、session側claimとticketをawaitより前にconsumingへ進める。後続の検査失敗でもofferedへ戻さない。

続いて、同session参照／AuthSnapshotIdentity／ready generation／adapter／budget／destination参照・Update Set／policy／世代を検査する。sourceの新規stateであること、元transport claimが引き続き唯一であること、normal phaseとidle／cleanup条件も再検査する。

sourceのprivate stateを構築し、最後のclock・取消・ready検査後、lease所有者とhandoff状態をsource_ownedへ**同期commit**する。最終検査からcommitまでawait・caller callback・任意getterを挟まない。構築／検査に失敗したticketはfailedに固定し、部分sourceを捨て、rootが元adapterを一度だけ閉じる。

adopt自体ではGETを開始しない。commit後、source.prepareが通常の用途票／clock／認証検査を経て親→metadataを読む。handoffでparent_ready／release matched／selection／planを立てない。現行bindのfixture定数は実取得証拠ではなく、ReleasePermitやworker planの代用にもならない。

## 7. 会計・時間・解放

| 費目／資源 | 移譲時の不変条件 |
|---|---|
| C/G/P/E/R、retry／slot | 同stateを維持し、移譲の増減はすべて0。返金・再初期化なし |
| 開始時計・hard timer・phase cutoff | 同session由来を維持。handoff開始から60秒などの新しい枠を作らない |
| OAuth permit／履歴 | doneのまま保持。初回／retryの費用と固定失敗snapshotを捨てない |
| sourceの用途票／table枠 | adoption時には未使用。親／metadataの予約R=4を重複確保しない |
| reader／cancel／scratch／試行timer | idle・解放確認済みが必要。cleanup未確認の資源を正常leaseへ移さない |
| run timer・診断・root signal | root／sessionが所有し続け、古いfacadeが解除・置換しない |

移譲には有限個のidentity／状態検査、session claim、root／ticket／lease／destination各1個を上限とする論理record、固定回数のclock checkpointが追加される。HTTPやpayloadの費用へ混ぜない。これは実allocatorの確保数／容量を証明する上界ではない。実装時は検査点・参照保持数・callback登録／解除の費目を列挙し、control work／保持の上界を別途計数する。本設計だけで全体work上界を確認済みにしない。

正常1tableの独立oracleは、OAuth初回1＋source親／metadata初回2＋table初回1＋親／metadata／table最終3＝C=7。OAuthを1回retryすればC=8。GはOAuth失敗bodyを含む全採用chunkの合計、Eはtable応答だけ、payloadを読まないsubsetではP=0。Rは最初4、table受付で6、final各slotの消費・未使用分解放を経て0になる。handoffの前後でC/G/P/E/Rが同一であることを別に確認する。

## 8. 失敗・競合と固定分類

| 事象 | 拒否／停止の扱い |
|---|---|
| OAuth未完了／shape不正／寿命不足／認証拒否 | ticketなし。既存authentication_failedと詳細理由を維持 |
| 401等のprimary／上流枯渇／受信・試行上限 | 元のcode／履歴を保持。handoffのinvalid_stateやclosedで上書きしない |
| active I/O／pending body／retry待ち／cleanup未確認 | offer不可。現在のrootで後始末し、新adapterで救済しない |
| 同owner ticketのsession／ready／destination不一致 | ticketを消費済みfailedへ固定し、そのrunをevidence_binding_mismatchで停止 |
| 未知／clone／別run ticket、消費済みticket再送 | 固定binding／invalid_state拒否。外国runや新leaseへの停止権限を与えない |
| normal phase残時間なし | source未作成のままphase_deadline_exceeded。再認証や新時計で救済しない |
| hard deadline／取消が先行 | 同codeを保持し、ready／offer／adopt／GETを再開しない |
| auth成功直後・構築中・commit直前のrevocation | 同期的なlive／generation再検査で失効検出。部分sourceを破棄し、新GETなし |
| commit後のroot取消／session.close | source leaseと未消費deliveryを失効し、既存transportのcleanupへ合流 |
| callback／構築の分類不能な例外 | internal_review_errorのみ。message／stack／token／本文を出さない |

primary・last_failure・cleanup dispositionは同run ownerの固定snapshotとして保持する。last_failure.retryableは過去の試行の記録で、移譲後の再試行権限ではない。late Responseのbest-effort cleanupでticketやleaseを復活させない。参照解除は物理ゼロ化／socket消失の保証ではない。

## 9. 必須合成試験・独立oracle

1. OAuth初回成功→offer→adopt→sourceの初回／最終→観測delivery→fixture worker／上位partialまで。同一adapter／dispatcher／session／ready／budgetの参照identityを内部fixtureで検査。
2. OAuth503→cleanup→retry成功でも同一のC/Gを保持し、handoffで差分0、全体C=8・R=0を独立イベント計数と照合。
3. OAuth前のadopt、未ready、per-user／実session、clone／別session／別destination／旧ready世代を拒否。修正値の再投入でも失敗claimを再開しない。
4. 二重offer、二つ目のticket生成、並行adopt、消費済みticket再送を拒否。stale bootstrap操作が移譲後のGET・認証・停止を行わないことも確認。
5. 一方、root controlは移譲後も取消でき、source／未消費deliveryを即失効させる。close／cancel／session失効／hard timerの競合でcleanup要求は一度だけ。
6. auth成功後offer前、adopting中、commit直前、commit直後の取消／期限をfake clock・同期hookで再現。失効が先ならGETなし、commitが先でも次dispatchの検査で停止。
7. active fetch/read、pending cancel、unconfirmed cleanup、pending body、OAuth retry待ち、事前GET済みmachineからのofferを拒否。late決着でも正常leaseを発行しない。
8. 50秒のnormal cutoff・55秒の整合cutoff・60秒のhard境界と低減値で、handoff後も元の絶対期限が使われることを確認。handoffが実phase bindingを代替したとはしない。
9. root dispatcherの参照・固定method/path/query/fieldsを比較し、adoptで新注入関数／別Update Set／任意URLを受け取らないことを確認。
10. counters／statsのコピー、新baseline、新transport factory／claimの呼出しをspyで検出して拒否。成功移譲はdispatch／chunk／payload課金が0回。
11. source採用失敗後の再bootstrap／再offer／別destinationへの再adoptと、新sessionを同runとして継ぎ足す迂回を拒否。
12. 架空token／refresh_token／error_description／payload／例外messageを戻り値・診断・ログへ出さず、非同梱・既存0.2／0.3・per-user単独source経路を維持。

## 10. 実装の分割案と未承認事項

- **OH-01**：session側handoff状態、root／destination／ticket／lease内部型と合成issuer。単一claim・identity・一度限り・失敗後拒否だけを検証。正式発行なし。
- **OH-02**：固定dispatcherと既存Web Streams adapterのprivate所有者切替。任意adapter登録やcallback差替えを禁止し、old facade／root取消の役割を検証。
- **OH-03**：同transportを消費する固定source private入口へ接続。初回／最終・予約解放・fixture workerまでの会計oracle／終了検証を追加。

名称／private API配置、追加管理allocationとcontrol費用、root制御facadeの具体的な公開範囲は実装前レビュー事項。本設計のlease権限分割はfixture内の限定方針で、本番のcredential／token管理・issuer承認ではない。実session／ReleasePermit／選択payload／worker jobの正式結合、公開BR-006契約、cap・全体work上界・本番終了policy・実機検証は未解決のまま。

## 11. OH-01の限定実装と未接続範囲

`abort-scope-evidence-handoff-model.ts`の`createSyntheticOAuthHandoffIssuer`は、factoryごとに分離した私有WeakMapを持つ純粋な合成モデル。session／root／destination／ticket／leaseを同realmから発行する。ここでのsession側claimは**合成Session record内**のrunClaimed／transportClaimed／handoffであり、既存`FixtureAccountingSession`や本番のlifecycleへ追加したclaimではない。実session objectやscalar copyは認識しない。OH-02以降の接続を確認済みと扱わない。

createRunは既知sessionの生成claimを構成検査より先に消費し、失敗後の修正・別Update Setでの再生成を拒否する。認証modeはservice-accountだけ。Update Setをpinしたdestinationを内部生成し、model内のauth／adapter／budget／dispatcherのidentityを保持する。各identityは単なる合成opaque値で、実取得・実会計・注入I/Oを証明しない。

completeOAuthの入力は合成outcomeとcleanupだけで、tokenやResponseを受けない。成功時の合成ready生成と、settleBootstrapが表すadapter-finally完了を分ける。offerは同model ready世代、identity、normal phase、idle・body／timer／scratchなし・OAuth以外未使用を要求する。ただしこれらの状態は合成issuerが与えるfixtureで、実OAuth summaryから本番ticketを発行する機構ではない。

offer／adoptは各最大2回の同時計観測と固定数のidentity検査を行う。adoptは既知の同root ticketをconsumingにしてからdestination／readyを確認し、失敗後は再offerしない。最終clock callbackが再入でcancelやidentity差替えを起こしても、その後のlive／binding再検査でleaseを発行しない。通常phaseは元deadlineの5/6、hard期限は元deadlineの等号で拒否する。本modelにはtimer／中断処理や実時間保証はない。

消費済みticket・stale bootstrap操作はinvalid_stateを返すだけで、成功済みsource leaseを止めない。root cancel／close／session revokeはleaseを失効させ、最初のprimaryを維持する。failed ticket再送は元のprimaryを返し、closed後のcancelでもclosed状態を維持する。未知のrevocation文字列はinternal_review_errorへ固定し、messageや秘密を保存・返却しない。

敵対的fixture用のsimulateIdentityChangeはmodel recordだけを変更する。既存認証identityを読むgetter・本番登録口・任意adapter登録口・実token／権限変更の機能ではない。model内でも失効後の変更は拒否する。新moduleは既存`!dist/review/abort-scope-evidence*`の非同梱対象。

合成41ケースで一意性・混入・失敗後再利用・stale操作／root取消・期限／clock再入を確認する。dispatch／chunk／payload／transport生成の呼出し口は存在せず、HTTPカウンタのコピーや再初期化も実装していない。したがって§7のC=7/8・G/E/R等の独立会計oracleや、実OAuth→固定source→workerの連続試験は**OH-03へ残る**。保持／allocator／control workの実上界は確認していない。

検証：[OH-01内部型・session claimの合成記録](E2E_BEST_PRACTICE_ABORT_SCOPE_HANDOFF_OH01_SYNTHETIC_2026-10-26.md)。OH-02は次節の独立fixture compositionとして接続し、この合成leaseを既存sourceへcastしない。

## 12. OH-02：固定dispatcherと既存adapterの所有者切替（fixture限定）

`createFixtureOAuthSourceTransport`は、同fixture sessionを`claimFixtureHandoffLifecycle`で一度claimしてから、固定Update Set IDと注入関数をpinし、`createFixtureOAuthWebStreamTransport`を一度だけ生成する。実session・per-user・既ready・transport claim済みは受け付けない。構成不正はfixture sessionを失効させ、修正後の再生成も拒否する。OH-01の合成Session／ticketを受け取る口はなく、既存fixture registryのAuthSnapshotIdentity／snapshot参照へ直接結合する。

dispatcherの参照・注入関数・Update Set IDは同closureに固定する。bootstrap_ownedでは合成POST `/oauth_token.do`だけ、source_ownedでは共通の`fixtureFixedGetRequest`が認める親／metadata／tableの固定GETだけを生成する。auth_ready／offered／adopting／failed／closedで新dispatchしない。任意request／URL／fields／adapter／I/Oをadoptへ渡す口はない。GETの固定条件は既存sourceと共通化し、payload／release_rowsや不正table名を拒否する。

認証成功のscalar summaryではなく、同budgetのOAuth settlementで実際に生成されたfixture ready参照をpinする。state machineの`handoffCheckpoint`は同時計・normal cutoff・auth ready・OAuth done・唯一の用途票・active attempt／pending bodyなしを検査する。adapter側はそのclock callbackの後にbusy／current resource／timer／sticky cleanup状態を再検査する。OAuth `api.run`のfinallyが返る前にofferしない。fixture registryのlive／AuthSnapshotIdentity／snapshot／ready参照をoffer・adopt・source操作でも再確認する。

rootのofferは同closureのopaque ticketを一度発行する。adoptは既知ticketを先に消費し、adopting→idle検査→ready再照合→同期source_owned commitへ進む。foreign／clone／既消費ticketや古いbootstrap facadeのrun／close／cancelは、新sourceを停止しない。root cancel／closeとsession失効は同machineの停止へ合流し、移譲後も次GETを拒否し、進行中I/Oのcleanupを一度だけ要求する。primaryとcleanup不明は別軸で保持し、終端でauth-readyへ戻らない。

OH-02の採用laneは**固定親GETの一度限りの`probeParent`だけ**を持つ。既存`consumeSourceBody`で必要列へ投影して即破棄し、返すのは固定outcome／synthetic／evidence disabledのみ。raw body・rows・receipt・machine・permit・ready identityは返さない。これは所有者切替後のdispatchを検証する限定probeであり、固定sourceのprepare／table初回／最終／deliveryの採用入口ではない。probe済みadapterを後から固定sourceへ登録する迂回口も作らない。全体のprivate採用・親／metadata／table最終・予約R=0・workerはOH-03へ残す。

| 費目／保持 | OH-02での所有者・検証範囲 |
|---|---|
| C/G/P/E/R、retry、開始時計 | 既存fixture sessionの一つのport。offer／adoptはdispatch／chunk／payload課金なし、予約差分0 |
| adapter／Response・stream WeakSet／reader／scratch／timer | 一つの既存adapter。移譲前後のResponse／stream再利用拒否を同台帳で検証 |
| 管理record | sessionのhandoffClaimed、lifecycle closureとpin済み参照、run状態、ticket最大1、source lane最大1。無制限Mapやcallback差替えなし |
| 追加検査 | offer／adoptごとにlive checkpoint 1、machine handoff checkpoint 1、ready参照再照合1。各checkpoint内部のbudget確認も維持 |
| 保留 | 実allocatorの確保数／容量、control全体work上界、ready／ReleasePermit／worker jobの本番由来は証明していない |

親probeだけではR=4を最終解放しない。これはOH-03の全体C=7/8・R=0 oracleの代替ではない。実credential／tokenは保持・header利用せず、Response供給関数はfixture TCBであって実通信の認証証拠ではない。正式な証拠発行口は閉鎖、全体受付無効・Unknown・VM／監視／telemetry保留を維持する。

検証：[OH-02固定dispatcher・所有者切替の合成記録](E2E_BEST_PRACTICE_ABORT_SCOPE_HANDOFF_OH02_SYNTHETIC_2026-10-27.md)。
