# AU-BR-006 新規runのprivate compositionとsource採用設計

Version: br006-private-composition-draft-0.9 / Date: 2026-10-31。
Status: CM-04-01／02に加え、CM-04-03の固定200・fake依存によるprivate ack受理／既存release判定を実装。実transport採用・実通信は未実施。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

CM-04は、新規runだけを対象に、同じ予算・認証snapshot・source・ReleasePermitを結ぶ。最初の実装は予算生成とaccounting供給の分離までとし、既存sessionの後付け切替やMCP設定による有効化は行わない。

基準：[canonical移行設計 §11](BEST_PRACTICE_ABORT_SCOPE_CANONICAL_SESSION_MIGRATION_DESIGN.md#11-cm-03-注入typed-dispatchと単一予算)、[native設計](BEST_PRACTICE_ABORT_SCOPE_NATIVE_ADAPTER_DESIGN.md)、[実session差分設計](BEST_PRACTICE_ABORT_SCOPE_REAL_TYPED_BINDING_DELTA_DESIGN.md)。
現行：[session](../src/servicenow/bounded-read.ts)、[source](../src/review/bounded-source.ts)、[clientのsnapshot生成](../src/servicenow/client.ts)、[lifecycle](../src/servicenow/review-evidence-lifecycle.ts)、[CM-03予算factory](../src/servicenow/review-canonical-bootstrap-budget.ts)。

## 1 現行の生成順と接続上の制約

現在のwithBoundedUpdateSetSourceはinputを検証し、client.createBoundedReadSessionで認証snapshotを固定したsessionを作り、session.run内でsourceを作る。session constructorは既に#budget／#runLease／#runOwnerを生成する。CM-03のcreateCanonicalBootstrapBudgetも新しいcoreを生成するため、このfactoryを既存sessionへ足してはならない。

source.readParentはsession.getを呼び、そのgetは認証準備を行う。typed bootstrapから同じreadParentを呼ぶ接続は、bootstrap→source→get→bootstrapという循環や、認証・親GETの重複を招く。typed bootstrapは通常source.get経路を再入させず、固定dispatcherの同body ackからsourceのprivate状態へ渡す必要がある。

実sessionの生成経路は次の3つで、生成順と所有が異なる。

| 経路 | 現行の生成順 | CM-04での扱い |
|---|---|---|
| [withBoundedUpdateSetSource](../src/review/bounded-source.ts) | client.createBoundedReadSession→session.run内でsource生成→work(source) | legacy固定。typed継続を取得しない |
| [review tool adapter](../src/review/update-set-adapter.ts) | client.createBoundedReadSession→setPhaseReserve(min(10000, deadline/6))→run外でsource生成→readParent→resolveRelease | 現行は legacy固定。将来の対象候補だが、phase reserveの正をsessionとbootstrapのどちらに置くかを決めるまで接続しない |
| [R-2 session](../src/review/r2-session.ts) | createBoundedReadSessionをoverrideし、new BoundedReadSessionへfetch／signal／per-user tokenを注入 | legacy固定。constructor直呼びでもtyped継続を取得しない |

session constructorは3経路で共通に実行されるため、constructor内の継続の存在だけでtyped laneを有効化しない。typed継続の取得はCM-04-02で定める固定composition経路だけに限り、上表の現行3経路はすべてlegacyのまま残す。CM-04の設計成功だけで選択先を変更しない。

adapter経路のsession phase reserveとbootstrapのphase cutoff（min(10000, deadline_ms/6)）は現在同値を別々に保持している。typed compositionでは一方だけを正とし、他方はその値の読取とする。二重のcutoffで等号境界がずれる構成を採らない。

## 2 同じcanonical coreからaccountingを供給する

予算の生成とbootstrap accountingの供給を分離する。canonical coreの生成部が、writer／readonly viewに加えて、新規constructor用accountingを一度だけ取得できる非公開の継続を所有する案とする。これは既存sessionを引数に取るregistryではなく、そのcoreを生成した側だけが保持するclosureである。

| 呼出し元 | 使うcoreと禁止事項 |
|---|---|
| 既存CM-03 fresh factory | 新coreを一つ生成し、その同coreのconstructor継続を一度使う。現行の合成試験互換を維持 |
| 将来のtyped session constructor | 自分で生成した#budgetの同継続を使う。CM-03 fresh factoryを呼んで第二coreを作らない |
| 通常legacy session | typed継続を取得せず既存writer.dispatchを使う。開始後のlane変更なし |
| readonly lease／stats／diagnostic | 更新継続・writer・取得claimを返さない。同値copyから権限を復元しない |
| bootstrapのlease／sample | typed sessionではsessionがrun ownerへ登録した`#runLease`だけを使う。継続はaccountingだけを返し、`core.view.lease`等の第二lease objectを返さない。ownerの`currentLease!==lease`検査を満たし、CM-02の内部理由保持（`#adopt`）を迂回しない |
| fixture／任意のraw session | 既存runの継続を取得・登録できない。freshな合成coreを実sessionの権限として採用しない |

取得前に同core・ゼロC/G/P・未取得を検査し、callback再入より先に取得状態を消費する。失敗・解放後の再取得を認めない。認証開始済みかどうかはcoreのゼロ会計だけで推測せず、既存transportConstructor.claimのreadyStarted／sourceClaim検査も維持する。

CはCM-03のdispatchAt、Gは同coreのchunk、Pは既存source境界を使う。legacy固定4枠とtyped予約4枠は同時に適用せず、新規runのlaneで一方式へ固定する。実final slotへの移譲・消費は別の接続条件であり、bootstrap reserveの成功から完了扱いにしない。

## 3 新規runだけの固定composition

固定compositionの起点はbounded-sourceの新規run生成経路、予算・credential・stopの根はBoundedReadSessionとする。実装時には、session constructorがtyped生成の内部継続を持ち、compositionのローカルscopeからsourceを一つだけ生成・結合する。

次の制約を満たすprivate constructor継続を採る。CM-04-02で確定した入口と寿命は§11を参照する。

- 開始済みsessionを受け取る汎用factory、lookup-by-session、session登録／mode setterを作らない。
- 生成前に同target・低減limits・認証snapshot・laneを固定し、認証／I/O後に別sourceへ付け替えない。
- 公開MCP引数、instances設定、既存BoundedReadOptionsへtypedフラグを追加しない。
- compositionが保持するwriter／transport handle／source更新継続をwork callbackや公開sourceへ返さない。
- sourceのmutable consumerを、exportされたstatic getterから任意のsession／source組に対して取得できる形にしない。
- テスト専用issuerやfixture台帳を配布runtimeの発行元にしない。公開される診断はcopyだけに限定する。

module-privateの生成継続をどう跨がせるかは実装上の必須確認点である。TypeScript privateだけ、型cast、呼出し側が申告したsynthetic=trueだけでは境界を満たしたとしない。private field／closureの同一性と、外部からmutable portを取り出せないことを回帰試験で示す。

## 4 認証とpermit前bootstrap

予定する順序は次のとおり。矢印は新しい正式receipt発行の許可ではない。

```text
固定snapshot・target・同core・laneを新規生成
  → 同run ownerのtransport claim
  → 同sourceの初期identityを一度結合
  → 認証readyを一度確定
  → 固定親GETのnative ack → private親snapshot受理
  → 固定release GETのnative ack → 既存C方式判定
  → matchedだけ同sourceの既存#permit／release snapshotを生成・結合
  → prepared_onlyの限定summary
```

per-user／有効cacheではtoken交換を追加せず、交換が必要なら同C/G・同t0に一度含める。tokenはsessionの認証consumerだけが保持し、source・worker・診断へ渡さない。ready世代は既存0→1を維持し、認証失敗・取消後に再生成しない。

親・release取得はpermit前に必要なので、まだ存在しない#permitを開始前提にしない。matched後のmetadata等には既存permit検査を維持する。bootstrapのraw JSONや外部から再提出されたdecisionを、sourceの#completeReleaseへ直接渡せる口にしない。

## 5 sourceのprivate受理と同一性

sourceの更新継続は、固定compositionで生成した同sourceだけに結合する。受理前提は同session／認証snapshot・ready世代・canonical lease・native owner・attempt／window・targetの一致と、同bytesからの一度限りackである。

| 受理対象 | 固定consumerと拒否条件 |
|---|---|
| 親snapshot | 既存固定5列を同ackからproject。target違い、欠落、二重初回、失効後受理を拒否 |
| release観測 | build_nameだけの既存bounded解釈。node内部情報は供給・保存しない |
| C方式設定 | sessionが固定したbinding／期限／競合ルールを再利用。利用者の呼出し時自己申告を採用しない |
| matched判定 | 既存source内部で#permitと不変snapshotを生成し、同sessionの既存verifierへ結ぶ |
| source公開method | typed bootstrapの受理済み親を再GETしない。通常GETへの再入・別認証・別予算を拒否 |
| 受理結果 | prepared_only／evidence_issuance=disabled。正式body receipt／選択payload／jobの権限を付けない |

mutable source consumerへraw値や構造一致のfake ackを渡しても受理できない設計が必要である。既存NA-03 ackは内部laneの消費結果であり、それだけで実session／sourceへの発行元bindingが完成したとは扱わない。CM-04-03で同runの非公開発行元とconsumerを対にして検証する。

## 6 HTTP差分とfinal権限を先に解決する

legacyとNA-03には、404の理由、terminal bodyを読むかどうか、no_body、release 403 fallback、transport失敗のretryに差が残る。この差を単一会計移行の一部として隠して変更しない。

最初のcomposition試験は固定200応答の親・releaseと、取消／期限／混入拒否に限定する。一般HTTP失敗やC方式fallbackの実source採用は、既存legacy契約との比較表と承認後に追加する。特にbodyなし403をinvalid_responseへ変えて、既存の運用者設定fallbackが使えなくなる問題を未確認のまま進めない。

bootstrapのprepared成功だけでwork(source)へ任意のmetadata／payload取得権限を返さない。最小実装の返却は限定summaryまでとする。final親・metadata各2の予約移譲／消費、普通cutoffからfinalへ残すbaseline、Pの更新点は後続条件であり、Rを解放して新しく4枠補充する方式は拒否する。

非200の次段階は[HTTP差分・状態遷移・合成受入条件draft-0.3](BEST_PRACTICE_ABORT_SCOPE_NON200_HTTP_DESIGN.md)を参照。purpose×status×body有無の純粋分類と独立oracleだけを開発専用moduleへ実装した。legacyの取消要求とtyped cleanup確認、release403／404／upstream枯渇の回復候補、attempt-local retryとrun停止の挙動変更は承認待ち・runtime未接続で、現行固定200 guardを緩めるものではない。

[同attemptのstatus-only終端・cancel-only cleanup詳細設計](BEST_PRACTICE_ABORT_SCOPE_STATUS_ONLY_TERMINAL_DESIGN.md)は、停止後のcleanup所有権と業務継続権限の分離・二軸診断・一度限りの消費を具体化した案。ST-01の合成issuer内部契約とST-02の注入Response／Streams cleanupだけを実装し、正式終端・runtime接続は未実装／未承認。正式発行口閉鎖・全体受付無効・調査保留を維持する。

[ST-03接続詳細設計draft-0.4](BEST_PRACTICE_ABORT_SCOPE_STATUS_TERMINAL_CONNECTION_DESIGN.md)は、同attemptのprivate終端・一度限り消費・失効後の診断保持を対にした案。ST-03A／Bの合成context／anchor／発行claim・診断保持・一度限りconsumerを実装し、native接続は未実装。実session／source／ReleasePermitのbindingではなく、正式発行口と通常経路は開かない。

## 7 停止と終了責務

first primaryと内部／公開理由の写像を保持し、ready・source・transport・未受理ackを同期失効してからabort／cancelへ進む。CM-03のC=0／1境界を維持し、停止した試行の費用は返金しない。

native ownerは同readerのcleanupだけを元floor内で確認する。sessionはtimer・listener・同時実行枠・credential参照を一度解放する。source consumer／予算adapterがこれらのresourceを重複返却しない。release／consumer途中で失敗しても部分runを再生成せず、既記録cleanupと最初の診断を分けて保持する。

## 8 合成依存の受入条件

| ID | 検証対象 | 必須結果 |
|---|---|---|
| PC-A01 | 同coreのconstructor accounting取得 | ゼロ状態・一度だけ。同leaseにC/G/Pが反映され、第二counterなし。ownerへ登録したleaseとbootstrapが観測するleaseが同一objectで、継続からleaseを取得できない |
| PC-A02 | legacy開始／ready後・二重取得・失敗後再取得、現行3生成経路 | 新たなtyped権限を発行せず、外国runを変更しない。withBoundedUpdateSetSource・review tool adapter・R-2 session（constructor直呼びを含む）ではtyped継続を取得できない |
| PC-A03 | public stats／remainingMsの差替え | private bindingと元clockは影響を受けない |
| PC-A04 | 認証→親→releaseの固定200 | 各GET一度、C/G oracle一致、ready世代1、同sourceのprivate状態だけ更新 |
| PC-A05 | bootstrapから通常source.getへの循環 | 再入・重複認証・親GETの二重実行なし |
| PC-A06 | 別snapshot／lease／source／target／ack／permit | 受理前に停止。copy／fixtureの完成形で代用不可 |
| PC-A07 | raw親JSON／fake release decisionの再提出 | private consumer／既存#permitへ昇格不可 |
| PC-A08 | 消費中の取消・hard／phase等号 | 同期失効が先。C/G費用保持、cleanupとfirst primaryを分離 |
| PC-A09 | unknown／mismatched／conflict | metadata dispatch0、正式発行0 |
| PC-A10 | bootstrap成功後のmetadata／payload要求 | 最小実装では未提供。preparedだけで権限を得ない |
| PC-A11 | R移譲前のfinal要求・重複解放 | 新枠補充なし。未接続条件を成功扱いにしない |
| PC-A12 | close連打・late応答・途中生成失敗 | admission／token／timer解放は一度、診断保持、run再開なし |
| PC-A13 | exported getter／mode設定／fixture横断 | mutable port・raw writer・既存sessionの切替口なし |
| PC-A14 | 全体合成・梱包・秘密marker | legacy互換、fixture非共有／非同梱、本文／token非出力 |

oracleはfake dispatcherの到達数、固定入力byte列の独立長／hash、固定sourceの受理イベントから作る。lease同一性はowner登録時とbootstrap観測時のobject参照比較、生成経路ごとのtyped継続取得可否は各経路の実生成順で直接試す。製品counterのcopyや単なる正常returnを、生成元・終了の証拠にしない。

## 9 次の実装範囲

1. **CM-04-01 同core accounting供給の分離**。CM-03 fresh factoryの互換を維持し、canonical生成部のconstructor継続から同coreのaccountingを一度供給する。純粋fake試験だけで、実sessionのnative選択は追加しない。
2. **CM-04-02 新規run compositionの内部接続**。module間の生成継続と更新port非公開をレビュー後、認証／I/O前の固定source結合をfake依存で実装する。既存公開entryはlegacyのまま。
3. **CM-04-03 private ack consumerと既存release判定**。固定200の親・releaseを同sourceへ一度受理し、prepared限定summaryまで確認する。HTTP差分・final移譲・payload／workerの採用は追加設計を要する。

CM-04-01は§10、CM-04-02は§11、CM-04-03は§12を参照。既存の実session I/O経路のlaneは変更しない。

## 10 CM-04-01 同core accounting供給

canonical生成rootだけが`construction.takeBootstrapAccounting()`を保持する。sessionや外部coreを引数に採用せず、同closureのC/G/Pとclockを使う。readonly view／leaseからはconstructionもwriterも取得できず、accounting取得は第二leaseを返さない。実sessionは従来どおりprivate budgetを保持し、新しい取得口を呼ばない。

取得claimは`unclaimed → consuming → claimed`、拒否時は`failed`。callback前にconsumingを記録し、二重取得・再入・失敗後再取得を拒否する。legacyのdispatch／dispatchAt／chunk／payloadは検査前にlegacy利用開始を固定するため、ゼロbyteやquota拒否でC/G/Pが0でも後付け取得はできない。stop／close・不正clock・外来引数も拒否する。低減C上限が4未満なら予約を発行しない。

予約は`unclaimed → reserving → reserved`、失敗は`failed`、cleanupは一度限りの`released`。releaseは会計を返金せずcoreを閉じる。既存CM-03 factoryは生成時にclockを読まず、reserve時に同coreの取得継続へ委譲する。factoryに第二counter／session registryは置かない。CM-03のC直前計上・G課金・4枠・上限は維持する。

取得後はlegacy writerのdispatch／dispatchAt／chunk／payloadが`invalid_state`で停止し、accounting.releaseはcore全体を閉じる。このため、同coreを共有する将来のtyped sessionでは、bootstrap releaseの時点でrun全体の会計更新が終わる。prepared後のmetadata・final検証・Pを計上するには、R移譲（§6）と同時に設計する新しい更新portが必要であり、legacy writerの再開やrelease後の再openで代用しない。CM-04-02はこの制約を前提に、bootstrap終了までの接続に限る。

CM-04-01の合成試験は同coreの観測一致、legacy利用後拒否、再入、期限・取消・失効、readonly権限非露出、fresh factory互換を対象とする。同段階で未接続だったready／source claim・登録lease・source private受理は、§12でfake依存だけを接続した。PC-A01〜A14全体を完了扱いにしない。

検証記録：[CM-04-01](E2E_BEST_PRACTICE_CONSTRUCTION_ACCOUNTING_2026-10-29.md)。

## 11 CM-04-02 新規runのpre-I/O composition

固定入口は`BoundedReadSession.prepareNewReviewComposition(snapshot, input, {signal?, limits?})`とする。MCP／設定への登録はしない。これは内部moduleの新規生成入口であり、任意の既存sessionを受け取るgetter／mode setterではない。session／source factory、work callback、dispatcher、release値は受け取らない。既存constructor・client・adapter・R-2の生成経路からは呼ばない。

1. 認証snapshotは、Object.prototype／null prototypeの非proxy objectから既知keyのdata propertyだけを一度copyし、oauthも同様に既知keyだけをcopyしてfreezeする。getter・proxy・独自prototype・未知keyは読まずに`invalid_input`で拒否する。constructorの検証・principal key・保存値は同じcopyだけを読み、呼出し元objectを再読しない。strictな既存source inputを検証する。optionsはsignal／低減limitsのdata propertyだけを一度pinする。不正signal・proxy／別realm／独自prototype・signalの操作差替えは生成前に拒否する。同一realmのnative AbortSignalだけをこの入口の対象とする。
2. 固定classから新しいsessionを作る。constructorが認証snapshot、canonical core、owner登録済み`#runLease`を生成する。fetchは固定拒否関数であり、デフォルトfetchへfallbackしない。
3. private `#prepareComposition`が一度限りのclaimを先に消費し、同sessionと検証済みinputで固定`BoundedUpdateSetSource`を一つ生成する。同ownerのtransport claim→`bindInitialSource`へ、同じsnapshot／登録済みlease／handleを渡す。
4. 初期source bindingは`unclaimed → consuming → claimed`。callback前にconsumingを固定し、再入・別identity・二重利用・ready後・失効後を拒否する。初期binding後の別sourceのReleasePermit bindingも拒否する。既存legacy ownerで初期bindingがない場合の振る舞いは維持する。
5. 同coreからaccountingを一度取得し、4枠を予約する。private leaseだけで停止／期限を検査し、公開stats／remainingMsの差替えを権限に使わない。phase reserveはsession側で一度決める。この段階はI/Oを開始しないので、hard timer以外のphase timerはarmしない。
6. accountingをreleaseして同coreを閉じ、sessionの固定private `#close`がowner・timer・外部abort listener・同時実行枠・credential参照を閉じる。公開closeの差替えを固定解放として採用しない。既存公開closeは同じprivate本体へ委譲する。成功時も解放後のfrozen限定summaryだけを返す。session／source／lease／handle／writer／accounting／permitは返さない。部分失敗も同じfinallyで閉じ、例外は固定BoundedReadErrorのcodeだけにする。

この段階の成功は`constructor_bound`であり、`prepared_only`／ReleasePermit発行／認証readyではない。C/G/P=0、ready世代0、正式発行disabled、dispatch unavailableのままである。初期bindingは対象identityだけで、release証拠の代用品にはならない。

CM-04-03の同じ固定入口のprivate継続は§12を参照。CM-04-02の公開summaryを再提出して再開する方式、accounting.release後の再open、外部のraw JSON／fake permitの採用は認めない。HTTP差分とfinal移譲は未接続。PC-A01〜A14全体の完了や実機検証済みとは主張しない。

検証記録：[CM-04-02](E2E_BEST_PRACTICE_PRIVATE_COMPOSITION_2026-10-30.md)。

## 12 CM-04-03 固定200 fake bytesからのprivate ack受理

同じ`prepareNewReviewComposition`の内部呼出しで、`synthetic_io: { responses: [...] }`を明示したときだけ非同期継続へ進む。省略時は従来の同期`constructor_bound`／解放を維持する。MCP引数・instances設定・通常BoundedReadOptionsへflagは追加しない。

### 12.1 fake依存の上限と非通信性

transcriptはdata propertyだけのplain／null-prototype objectと通常array、非共有Uint8Arrayから生成前にcopyする。proxy／getter／未知key／holeを拒否する。各行は`purpose`・`bytes`・任意`delay_ms`だけ。並びはparent→release、またはauthentication→parent→releaseの固定2／3行、1行4MiB以下、遅延0〜10,000ms。status・URL・Authorization・dispatcher／fetch callback・source／permit／ackを注入する欄はない。200以外は未対応として拒否する。transcriptの固定200に頼らず、session側のparent受理・release判定hookでもstatus 200以外を`invalid_response`で拒否し、bodyなし403が既存C方式fallbackや観測扱いへ流れないようにする。bootstrap contractはsession hookが投げた`BoundedReadError`の固定codeを保持し、停止しないphase cutoff等を`internal_review_error`へ潰さない。

固定fake adapterはcopy済みbyte列だけから新規のin-memory Response／Streamsを作り、既存NA-03 native cleanup→同bytes JSON／hash→一度限りackへ通す。ネットワーク関数を呼ばず、default fetchへfallbackしない。fake入力copy（最大12MiB）は合成依存準備であり、C/Gは実際にfake dispatch／readへ到達したときだけ同canonical coreへ計上する。caller bufferの後続変更を読むことはない。

### 12.2 private source consumerの供給と消費

sessionは新規scopeにECMAScript-privateな生成keyを作る。source constructorの内部継続は、module-private handlerが同sessionのprivate key・未消費・未失効を確認し、同sourceを一度claimしてからだけconsumerをcaptureする。検査口`claimPrivateCompositionSource`は不変のESM関数でbooleanだけを返し、staticプロパティの差替えやraw session登録から権限を作れない。key／consumerは外へ返さず、fixture台帳も共有しない。

固定bootstrapのparent callback／release resolverだけが、native同bytes ack後の値からrun-localなopaque ackを作る。同keyのconsumerはpurposeを照合し、WeakMapから消してから受理する。consumerはparent→release→done（失敗／終了時closed）の順序だけを認める。raw JSON・別key・形の同じtoken・公開summaryから再開する口はない。

parentは既存固定5列・target同一性を確認しprivate snapshotへcopyする。releaseは既存のbuild_name射影と`#observeRelease`／`#completeRelease`を使う。実source自身が既存private ReleasePermit／portを生成して同ownerへbindし、bootstrapはその既存bindingを再検証する。二度目のsource claimを発行しない。公開readParent／resolveRelease／session.getを呼び戻さないため、重複認証・二重GET・循環がない。

既存C方式の空200観測時fallback・設定期限／binding・実測競合・複数node・21件sentinelを維持する。403 fallbackを含む非200のHTTP意味差は採用しない。unknown／mismatched／conflict等は`release_not_admitted`で停止し、metadataは取得しない。

### 12.3 会計・停止・返却

| 費目 | この接続の所有点 |
|---|---|
| C | 同coreのdispatchAt。per-user／有効cacheは2、合成OAuth交換時は3。native dispatch直前に一度だけ計上 |
| G | 同coreのchunk。認証を含む同bytesを各一度課金、拒否分を返金しない |
| P | 未接続、0のまま |
| R | bootstrap開始時の4枠を一度予約し、終了時release。同coreを閉じ、補充・移譲・再openしない |
| clock／phase | 元t0・60秒を維持。sessionが一度決めたreserveをbootstrapへ渡し、native attempt／cleanupにも同leaseを使用 |

per-user／cache／exchangeは固定snapshotだけから選び、呼出し側のauth自己申告を受けない。合成OAuth tokenは実通信に使わず出力しない。readyは同ownerへ一度だけmarkする。

停止時はowner失効→private key／consumer失効→同contractのrevokeとabortへ進み、first primaryを上書きしない。native cleanup完了・post-guard後だけ親／releaseを受理する。finallyでconsumer・accounting・sessionのtimer／listener／同時実行枠・token参照を閉じ、fake byte copyも消去する。

成功は`fake_io: true`を含むfrozen `prepared_only`限定summaryで、release evidence／limitations・ready世代・C/G/Pのcopyだけを返す。これは合成観測でありPDI実測ではない。source／permit／lease／writer／accounting／token／本文／node内部情報は返さない。正式発行disabled・dispatch unavailableを維持し、metadata／payload／worker／sealの権限は付与しない。失敗は固定BoundedReadError codeのみ。

検証記録：[CM-04-03](E2E_BEST_PRACTICE_PRIVATE_ACK_2026-10-31.md)。実transport／非200差分／final枠移譲・P更新port／正式body・job bindingは後続の別設計・承認が必要。
