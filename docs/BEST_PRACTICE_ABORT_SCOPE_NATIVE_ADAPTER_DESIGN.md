# AU-BR-006：RT-B03後のnative Response／reader adapter詳細設計

Version: br006-native-adapter-draft-0.2 / Date: 2026-10-29。
Status: **§13のNA-01内部契約だけを合成依存で実装・検証。native取得・操作・RT-B03 native証拠消費・実session接続は未実装。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。native操作・実通信・実機操作・設定変更・Pushの承認ではない**。

親：[接続差分draft-0.4 §12](BEST_PRACTICE_ABORT_SCOPE_REAL_TYPED_BINDING_DELTA_DESIGN.md#12-rt-b03typed-cleanup同bytes-candidate一度限りのackfake-io限定)、[session／transport／body境界](BEST_PRACTICE_ABORT_SCOPE_SESSION_TRANSPORT_BODY_BINDING_DESIGN.md)。
現行：[bootstrap](../src/servicenow/review-bootstrap-contract.ts)、[RT-B03 body lane](../src/servicenow/review-bootstrap-body.ts)、[実session](../src/servicenow/bounded-read.ts)、[実source](../src/review/bounded-source.ts)。
参考に限る：[非同梱closed supervisor](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts)、[注入native stream試験](../tests/review/closed-stream-adapter.test.ts)。これらのfixture registry・claim・counterはruntimeへ移さない。

## 1. 目的・実装境界

RT-B03のfake操作objectを、固定dispatcherから受け取ったnative Responseと**同じ一つのdefault reader**の観測へ結び付ける。第一段階は注入Response／メモリ内ReadableStream＋fake dispatcher／clockだけで検証し、global fetch・PDI・実OAuth・実workerを呼ばない。

§1〜12の型名・port名・状態は内部契約案で、NA-01として実装した限定名は§13に分ける。既存sessionを受け取る採用factory、公開MCP引数、typed mode設定、body／reader getterは追加しない。実BoundedReadSessionのconstructorは現状のまま依存を渡さず、実classのC/G/P更新点移行・固定sourceのprivate callerは後工程とする。

adapterの採用と正式証拠発行は別である。native観測が成功しても、BoundedBodyReceipt／SourceRunEvidence／選択window／payload receipt／worker job／sealを発行しない。AU-BR-006の公開規則登録・公開JSON・既存0.2／0.3の変更は非対象。

## 2. 読み取り根拠と設計判断の区別

2026-10-29に以下を読み取り照合した。公式仕様は操作の意味の根拠であり、本プロジェクトのpolicyを承認するものではない。

| ID | URL・該当箇所 | 確認した意味 |
|---|---|---|
| NA-SRC-001 | [WHATWG Streams §4.3.3](https://streams.spec.whatwg.org/#generic-reader-prototype)、[§4.4.3](https://streams.spec.whatwg.org/#default-reader-prototype) | readのEOFと失敗、readerのclosed／cancel／releaseLockの区別 |
| NA-SRC-002 | [Node.js 22 Web Streams：DefaultReader](https://nodejs.org/docs/latest-v22.x/api/webstreams.html#class-readablestreamdefaultreader)、[getReader](https://nodejs.org/docs/latest-v22.x/api/webstreams.html#readablestreamgetreaderoptions) | Nodeのdefault readerと各操作・PromiseのAPI表面 |
| NA-LOCAL-001 | [closed supervisor](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts)のnative操作capture／acquire、[既存試験](../tests/review/closed-stream-adapter.test.ts) | 固定intrinsic・foreign lock拒否の参考実装。RT-B03やruntimeで適合確認済みという意味ではない |

特にNA-SRC-001の§4.4.3は、pending readを残してreleaseLockすると、そのread PromiseがTypeErrorで拒否され、未読chunkはstream側へ残ることを定めている。**releaseによる決着を、release前からI/Oが終了していた証拠にしない**。本書ではこのためのpre-release記録を要求する。

WHATWGは取得時に2026-10-25更新と表示、Nodeページは22.23.4と表示。Living Standard／latest-v22.xは可変なので、実装検証時にはNode実版・参照日を別途記録する。パッケージの最低版22.12.0と開発環境の対応版の適合試験は未実施。本書作成時はnative操作・fixtureを実行していない。

Fetch StandardのBody mixin本文は今回取得timeoutのため未照合。ResponseのbodyUsed／body getterのintrinsic取得・brand判定・サブクラス拒否は以下のプロジェクト設計案とし、Fetchの全適合を主張しない。実装前に公式仕様または対象Nodeの公式実装との追加照合を残す。

## 3. 対応subsetと固定する操作

初期subsetは同Node realmの標準prototypeを持つnative Response／ReadableStreamとdefault reader。byte streamもdefault readerで扱い、BYOB・Node Stream変換・tee／clone・独自reader・任意thenableは使わない。Response／streamのsubclass・foreign realmは初期subset外として拒否する案とする。これは既存の非同梱fixtureがsubclassを許すこととは別の、未公開adapterの狭い受付方針である。

Proxyをnode:utilのisProxyで先に拒否し、その後でcaptured prototypeとの同一性とintrinsic getterのbrand検査を併用する。instanceof・constructor名・own propertyの形だけではnativeと認定しない。prototypeを偽造してもintrinsic検査を通らないことを試験する。genuineなforeign-realm Uint8Array chunkは既存RT-B03の内部slot検査を維持し、Response／streamのrealm制約とは混同しない。

| 対象 | 初期化時にcaptureする操作 | 採用後の使用規則 |
|---|---|---|
| Response | status／body／bodyUsedのprototype getter、標準prototype identity | Reflect.applyで同Responseへ適用。own getter／overrideは呼ばない。headers・URL・tokenを読み出さない |
| ReadableStream | locked getter、getReader、cancel、標準prototype identity | 同bodyだけを検査。getReaderはmodeなし一回。stream.cancelはreader未取得のcleanupだけ |
| DefaultReader | read／cancel／releaseLock、closed getter | 全操作を同readerへReflect.apply。closedは取得直後に一度captureし、拒否handlerも直ちに登録 |
| Promise | 信頼済みPromiseのthen等、native Promise検査 | 操作Promiseの決着を一度観測。getter／thenableの自己申告を完了証拠にしない |

stream／readerの操作は信頼済みnode:stream/webの初期化時captureを候補とする。Responseは対象Nodeの組込みglobalからcaptureし、必要なdescriptorが欠ける場合はdispatch前に固定internal_review_errorで停止する。capture後のown method差替えは無視する。起動前からの組込み改変・loader侵害・別realmのintrinsic真正性を証明する設計ではない。

## 4. 発行元・所有権と再利用拒否

### 4.1 唯一の受領元

固定dispatcherの同attemptの成功継続だけがprivate ResponseDeliveryを作る。run／constructor context、元lease／budget identity、purpose／ordinal、attempt token、元windowと中断signalへ参照で結合する。公開URL・header・外部sessionを引数で受け取らず、Response.urlを接続先の証拠にしない。実URL／認証snapshotの正式binding自体は後工程である。

ResponseDeliveryは一度だけ消費し、foreign attempt／同値copy／replay／期限後は拒否する。lookup-by-session・任意Responseのruntime登録exportは設けない。試験は新しい孤立contextの固定fake dispatcherからだけ入力し、fixtureに実sessionを登録しない。

### 4.2 runtime用の新しいprivate台帳

同runtime所有domain内にResponse／body streamの新規WeakMapを設ける。各entryはclaiming／owned／released／failedの由来と発行runを保持する。別run／別adapter instanceからも再採用を拒否できるscopeとし、状態はmoduleのprivate生成部からだけ参照する。公開reset・unregister・cleanedなら再利用可能という例外は置かない。

この台帳はnative resourceの重複所有防止専用で、sessionの既存transport claimやC/G/Pを二重実装しない。旧fixtureのWeakSet／登録関数／opaque handle／counterをimport・共有・再登録しない。runtimeとfixtureの台帳は独立し、同じ値を渡して相互採用できないことを梱包試験にする。

claimはcallbackやgetReader前にconsumingへ進め、途中失敗もtombstoneを残す。WeakMapから削除して再試行しない。foreign lockは取り上げず、そのreaderをcancel／releaseしない。二つのResponseが同じstreamを指す場合はstream台帳で拒否する。trusted dispatcherはclone／tee／再包装しない。異なるstream identityに複製済みの元データまで一般に同一と判別できるとは主張しない。

## 5. 採用手順と途中失敗

1. 同run／attempt／signal／windowとdelivery未使用をpre-checkし、claimを先に消費する。reentry中の採用を拒否する。
2. Proxy／prototype／Response brandを検査し、captured getterでstatus／bodyUsed／bodyだけを読む。不正status・bodyUsed・未対応prototypeは拒否。raw property getterやResponse.json／text／arrayBufferは使わない。
3. Response identityをclaimし、bodyがある場合はstream brand／locked／未使用を検査してstream identityをclaimする。stream=nullならreaderを作らない。
4. 同streamへcaptured getReaderを一回適用し、返却readerを直ちにprivate recordへ保持する。ここから後の失敗でも所有readerを失わない。
5. captured reader.closedを一度取得し、native Promise検査・成功／失敗handler登録を行う。同readerのread／cancel／release wrapperと元期限を凍結resourceへpinする。
6. post-checkで同binding・live・windowを再確認して、同RT-B03 instanceへだけprivate resourceを渡す。途中のstop／期限切れではcleanup-onlyへ進み、body受理を許可しない。

getReaderがthrowした場合は二回目を試さず、reader取得を確認できなければreader_owner_unknownとする。取得後にclosed capture等が失敗した場合は、既に保持したreaderのcancel／releaseを同元予算内で各一試行だけ行い、未確認を保持する。失敗理由にraw例外を保存・出力しない。

native body getterがnullを返す場合は「readerなし」をprivate pre-reader終端へ記録する案とする。cleanup=confirmed／kind=no_bodyは新しい**内部**区分として提案するが、200 bodyを成功にせずinvalid_response。現行RT-B03のkind列挙へ無断追加せず、NA-01で消費側契約まで対にする。一般404等の公開写像やC方式fallbackをこのadapterで拡張しない。

## 6. 同readerの状態とreleaseの証拠

private NativeReaderRecordが、同readerのpending read最大1・EOF・cancel未開始／pending／fulfilled／rejected・captured closedの決着・release未開始／試行済み／成功／失敗を保持する。read／cancel／releaseのclaimはnative操作を呼ぶ前に消費する。二重呼出しを固定拒否し、二つ目のreaderや第二releaseで修復しない。

readの「一回」はnative readを一度呼ぶ意味であり、chunkを複数読む通常の逐次readは許す。同時readは許さず、前回Promiseが決着してから次を開始する。cancelは各reader最大一回、releaseも最大一回。underlying sourceのpull／cancel callbackからの取消・再入をpre/post guardで扱う。

release直前に次を固定する：pending readの有無と決着原因、EOFの観測、cancel Promiseの決着、captured closedの決着、元時計とwindowの検査結果。このpre-release snapshotとrelease試行結果を同recordへ保持する。

| pre-release状態 | release後に起きたこと | 終端判断 |
|---|---|---|
| EOF・pendingなし・closed fulfilled・期限内 | release成功、最終期限内 | confirmed/eof。candidate可否はさらに同bytes／ackで判定 |
| cancel fulfilled・pendingなし・closed fulfilled・期限内 | release成功、最終期限内 | confirmed/cancelled。candidateなし |
| read／cancel／closedがpendingまたは拒否 | releaseがPromiseを拒否・決着させる／locked=false | unconfirmedのまま。新reader／retry／candidate不可 |
| 操作は決着済みだがrelease失敗／期限到達 | 後からrelease成功・closed fulfilled | 固定unconfirmedを修復しない |

releaseLockの成功やstream.locked=falseは、underlying sourceの終了証明ではない。releaseの副作用でread／closedが変化した場合もpre-release側の不足を補完しない。pendingのまま元cleanup期限へ達した場合、解放要求を一試行することと確認済み終端を発行することを分離する。

## 7. RT-B03への接続差分

現行BootstrapBodyResourceのread／cancel／closed／releaseという**構造だけ**を満たしてもnative由来とは認定しない。plain objectの完成形やcleanup booleanを提出する採用口は作らない。

native adapterが発行した凍結resourceをprivate WeakMapで同NativeReaderRecordへ結び、RT-B03の固定native継続からだけ一度限りのNativeAttemptEndEvidenceを消費する案とする。証拠は同run／budget lease／attempt／window／resource、pre-release snapshot、release結果へ結合する。引数のJSON・hash・通常のfactory返却値では作れない。

接続順序は次のとおりとし、候補発行後に診断だけ訂正する実装は不可。

```text
固定fake dispatcherのResponseDelivery
  → native ownerの一度限り採用 → 同readerの凍結resource
  → RT-B03が同bytesを課金・保持
  → native pre-release記録＋release結果
  → 同attempt終端証拠の一度限り消費／RT-B03観測との照合
  → finish（candidate）→ consume（decode/hash）→ async handoff → ack
```

現在のRT-B03はrelease後にもPromise状態を再観測するため、その結果だけでnative完了を認定せず、finishで上記のpre-release証拠と照合する接続変更が必要。native証拠が無い／foreign／使用済み／未確認ならcandidateを作らない。consumerに任意projectorや終端を自己申告するcallbackを公開しない。合成object用の既存モードは独立して残し、実resource発行元へ昇格させない。

adapterはbyte copy・C/G/P課金・JSON decode・hash・source projection・ackを再実装しない。native readが返すvalueをRT-B03へ一度渡し、そのprivate copyを受信採用点とする。constructor accountingは一つのままで、legacy statsから新counterを作らない。

## 8. 取消・期限・late Response

最大60秒・210試行・G16MiB／S4MiB・R=4を維持する。native ownerは元attemptのI/O cutoff／cleanup cutoffを借用し、独自のt0や延長timerを作らない。RT-B03の最大10秒内cleanup reserve・空16／非空4096上限も低減のみ。同期parse／hashの強制中断やOS実時間終了は証明しない。

同runの先行primaryを固定し、受理権限を同期失効してからabort／必要なreader.cancelを要求する。native ownerはabort要求を終了確認にしない。以後の観測はcleanup-onlyで、read／新用途／candidate／ackは不可。cleanup不成立をconfirmed／ordinary_closed／release unknownへ格下げして継続しない。

late Responseは、元dispatchのcleanup-only deliveryとして認識できる場合だけ扱う。Response／streamを未採用かつ他ownerにロックされていなければ、captured stream.cancelを一度best effortで要求する。**late cleanupのために新readerを作らず、存在しないreaderのreleaseを呼ばない**。既に当ownerのreaderを持つものはそのrecordに合流し、foreign lock／foreign claimには触らない。

現行fakeのdiscardLateが操作objectへcancel／releaseすることを、そのままnative Responseへ移植しない。native受領前／reader取得後の分岐を固定dispatcherとadapterで対にする。元期限後は新しい確認済み証拠を発行せず、遅い成功・解除・Promise fulfillmentで既存unconfirmedを修復しない。

## 9. 失敗分類・診断

| 事象 | 固定扱い |
|---|---|
| copied／foreign delivery・claim再利用 | evidence_binding_mismatch。要求先だけ停止、foreign owner不変 |
| Proxy／偽brand／subset外／bodyUsed／getReader失敗 | invalid_response。所有不明はreader_owner_unknown、foreign readerには操作しない |
| intrinsic不足・未知の取得失敗 | internal_review_error。dispatch前ならnot_started、所有後はcleanup軸も保持 |
| pending／拒否／release失敗／期限切れ | RT-B03の有限reasonを維持。primaryとcleanupを別に保持、candidate／retryなし |
| confirmed EOF＋ack済み429／5xx | 既存の同用途最大2試行だけ。read失敗／ack失効をstatus retryへ混ぜない |
| no_body／no_response | reader未作成の証拠。EOFやbody成功へ変換しない。statusの公開写像は既存方針とは別途照合 |

診断は固定state／reason、取得・read・cancel・release・証拠消費のbounded count、保持byte数だけ。reader／Response／stream／Promise／auth／URL／header／本文／raw例外を返さない。end evidenceの消費は一回、first primary・確定済みcleanupは後続close・late応答で上書きしない。

## 10. 費目所有・上界の対象

| 費目 | owner・上界 |
|---|---|
| dispatch C／最終R／auth／時計 | 既存run／bootstrap。一度だけ。adapterは更新しない |
| G／S／copy／decode／hash | RT-B03。adapterはread結果を渡すだけ。二重課金・返金なし |
| native identity台帳 | 新runtime private domain。Response／stream claimは同runのdispatch数以下、最大210以下。weak key、再利用で枠を補充しない |
| reader record | 同runのactive reader最大1。cleanup不明を残して次attemptへ進めない。late未採用Responseはreaderを取得しない |
| 操作・Promise観測 | closed capture1、cancel≤1、release≤1／reader。同時read≤1、通常のread回数は既存chunk／空read上限＋EOFで制約 |
| pre-release／end evidence | 各reader一組・一度だけ。証拠はbyte列／parsed JSONを保持しない |
| timer／listener解除 | 元bootstrap／sessionの所有。一つの解除をadapterでも重ねて行わない |

既存byte保持に加わるのはidentity／定数個の状態・Promise observer・pre-release証拠の制御費。native内部buffer・allocator・IPC・runtime全体のheap／work上界は未証明。取得途中・失敗時も費用を返金しない。上表は受付有効化や本番cap承認の根拠ではない。

## 11. native合成受入条件（NA-02以降は未実施）

すべて固定fake dispatcher、注入new Response／メモリ内ReadableStream、fake clock／schedulerで行う。global fetchは呼ばれると失敗するspyとし、PDI・実OAuth・OS待受・実workerを開始しない。native操作の失敗注入は孤立した信頼済み試験境界だけに置き、runtimeに任意操作の置換setterを公開しない。

| ID | 入力・境界 | 必須結果 |
|---|---|---|
| NA-A01 | 分割UTF-8・空chunk混在・EOF | 同readerだけ、独立G合計／digest一致、decode／ack各1、release1、timer0 |
| NA-A02 | own getter／getReader／read等の差替え | captured操作のみ。caller override呼出し0、同readerを維持 |
| NA-A03 | Proxy・偽prototype・plain object・subclass／foreign realm | subsetに沿って拒否。Proxy trap／caller methodで採用しない |
| NA-A04 | bodyUsed・prelocked／foreign reader | 新reader・cancel・release0。foreign ownerの状態不変 |
| NA-A05 | 同Response／同streamを別Response・別owner・別attemptで再提出 | 第二取得0、旧owner不変。release後も再claim不可 |
| NA-A06 | getReader失敗・closed取得途中失敗・採用中の取消／再入 | claim復元なし、取得済みreaderだけ一度cleanup、未確認を成功にしない |
| NA-A07 | pending readをcancel、read／closed決着、cancel自体はpending／拒否 | 元期限で停止、cancelの確認なしにconfirmedへ進めない |
| NA-A08 | pending readのままreleaseし、その副作用でread／closedが決着 | pre-release不足を保持、unconfirmed・candidate0・retry0 |
| NA-A09 | EOFだがclosed拒否／未決着、release失敗 | 固定reason、candidate／ack0。後の成功で修復なし |
| NA-A10 | cancel・release callback内のstop、I/O cutoff／attempt／phase／hard期限の等号 | 同期失効が先。元期限維持、終端とprimaryを混同しない |
| NA-A11 | 超過chunk・空17・非空4097・SharedArrayBuffer／非byte | 既存RT-B03の課金／拒否。copy／G二重追加なし |
| NA-A12 | foreign／copy／使用済みNativeAttemptEndEvidence | finish前で拒否、candidate0。外国証拠は消費しない |
| NA-A13 | consume後〜ackの取消／期限切れ・二重ack | 保持量0・追加dispatch0・成功値なし |
| NA-A14 | late native Response、既に他ownerがlock、reader取得後のlate処理 | 未取得readerを作らない。foreign操作0、cleanup二重要求0、元診断不変 |
| NA-A15 | null body・不正status・primitive・HTTP 401／403／404／429／5xx | narrow分類・no_body区分を固定。一般403をC方式fallbackへ流さず、cleanup後だけ限定retry |
| NA-A16 | default readerでのbyte stream、Node最低版／対応版 | 対応subsetの実測記録。BYOBへ暗黙切替しない、未確認版を合格扱いにしない |
| NA-A17 | fixture登録・runtime source採用の横断要求、npm梱包 | fixture台帳は非同梱・非共有、実session getter／切替口なし、正式発行0 |
| NA-A18 | 全既存合成試験・0.2／0.3／省略互換・秘密marker | 期限緩和なし、token／本文／raw例外非出力、legacy経路の退行なし |

oracleは試験側のunderlying sourceイベント・入力byte列・独立hashと、pin／取得／解放観測のイベントから計数する。製品counterを期待値へコピーしない。nativeな失敗経路を試験できない場合は未確認と記録し、fake操作の申告でnative試験の不足を埋めない。

## 12. 次工程・承認待ち・今回の文書確認

1. **NA-01：内部契約**。§13で合成identity限定のResponseDelivery／owner／専用台帳・pre-release／一度限りend evidenceを実装・検証。native操作や実sessionは採用しない。
2. **NA-02：native取得と操作固定**。注入Response／Streamsだけでbrand／ownership／同readerの取得・操作・途中cleanupを検証。fixture台帳をimportしない。
3. **NA-03：RT-B03接続**。finish前のnative end evidence照合、同bytes／ack、late Response分岐を対にして検証。正式gateは閉鎖したまま。
4. その後、実sessionのcanonical更新点と固定sourceのprivate callerを別設計・別工程で接続する。実通信の承認はさらに別とする。

承認待ち：標準prototype限定subsetと対象Node版、Response intrinsicsの公式実装照合、native no_body内部区分、private domainの生成配置・試験境界、取得失敗／再入時の正確な写像、失敗注入の配置、追加制御費・停止後未確認resourceの運用扱い。Unknownや本番capを合成結果で埋めない。

draft-0.1作成時はMDの詳細設計・親参照更新と読み取り照合のみで、ソース・テスト・依存設定やnative操作を変更・実行していない。当時は新規本書と親2文書の計3MDについて相対参照61件・行末空白なし・NA-A01〜18の18項目の重複なしを確認した（見出しanchorの自動検証ではない）。git diff --checkも成功。後続実装は§13・検証記録と区別する。

## 13. NA-01：合成identity限定の内部契約

[review-native-contract](../src/servicenow/review-native-contract.ts)、[合成試験](../tests/review/native-ownership-contract.test.ts)、[検証記録](E2E_BEST_PRACTICE_NATIVE_OWNERSHIP_CONTRACT_2026-10-29.md)を追加した。[梱包確認](../tests/review/package-native-contract.mjs)はstatic packと[純粋なcompiled fixture](../tests/review/fixtures/compiled-native-ownership-contract.mjs)だけを実行する。

### 13.1 domain・発行元・実物を受け付けない境界

現存するexportはcreateSyntheticNativeContractDomainだけ。新しいdomainごとにrun／signal／response／stream／readerの不透明identityを発行し、同domainのtokenだけを内部WeakMapで認識する。raw session・Response・stream・reader・fixture handleや、同値copyを登録する入口はない。runとsignalもdomain発行tokenが必須で、実session objectをrun欄へ渡しても採用できない。

runtime契約module内に新しいprivate Response／stream／reader claim台帳を設けたが、NA-01で保持するkeyは合成tokenのみ。native objectの登録生成部や本番のruntime domainはまだ存在しない。旧fixtureのregistry／claim／counterはimport・共有せず、domain間でもidentity・proofを相互採用できない。NA-02でnative生成部を設ける際も、本factoryのtokenをnativeの来歴として認定してはならない。

createOwnerは同run一度だけ。constructor時にrun／signal／元budget参照・deadlineと観測関数をpinする。生成claimはbudget関数capture前に消費し、capture失敗でも再生成しない。unknown run／signalはbudget getterを呼ぶ前に拒否する。元budgetは残時間の観測のみで、C/G/P・予約・実signalのabort状態を読取／更新しない。signalはidentity結合だけで、実AbortSignalのlistener接続は後工程である。

### 13.2 内部portと状態

| 内部operation | 固定契約 |
|---|---|
| issuer.attempt | purpose／ordinalとremaining-time座標の元I/O／cleanup floorからopaque attempt／windowを発行。最大210の制御上限、dispatch許可ではない |
| issuer.delivery | 同ownerのattempt／windowと同domainのresponse／stream identity。一attempt一発行、stream=nullはreaderなし |
| owner.claim | deliveryをcallback前に一度消費し、Response→stream順で専用台帳をclaim。失敗claimはtombstoneとして残し、他ownerのclaimは触らない |
| issuer.reader | 同resourceにreader identityを一回結合。同じreaderの別ownerへの再採用やstream=nullでのreader申告を拒否 |
| issuer.preRelease | strict観測のprivate copy・元cleanup windowの時点を固定。一resource一回、後から元objectを変更しても更新しない |
| issuer.end | 同resourceのpre-release proofを先に消費し、release結果・元時計で一度だけ終端を固定。release後の修復用観測は入力できない |
| issuer.endNoBody | readerを作らない別経路。confirmed/no_bodyをEOFと分け、RT-B03の現在の型や公開schemaにはまだ追加しない |
| owner.consume | 同attempt／window／resourceの終端proofを一度だけ消費。元cleanup floorを最後まで検査し、失効後は成功viewを返さない |
| owner.stop／close／status | 固定first primaryと直近cleanupを分離。statusはcallbackなしの既記録viewで、live権限ではない |

resourceはowned→reader→pre→ended→consumed、no_bodyはowned→ended→consumed。delivery／pre／endの使用済みclaimは失敗・closeでも戻さない。close後も既に所有したresourceのcleanup記録は可能だが、生成・採用・成功消費は復活しない。未確認終端は固定停止となり、次resource／再試行を許可しない。

生成・採用・証拠operationをbusy guardで囲み、budget／strict入力のcallback再入では二重生成しない。stop／closeはそのcallback中でも同期失効でき、statusは観測callbackを呼ばない。生成／採用／reader結合／消費のpost-checkにも同じfloorを使い、最後の観測で取消・期限到達した場合は成功handle／viewを返さない。foreign proofの失敗は要求先だけを止め、外国proofの使用済みflagを消費しない。

### 13.3 期限・終端・診断の限定

元budgetの残時間は有限・最大deadline以下・非増加、hard等号で拒否。deadline≤60000ms、attempt幅≤10000ms、cleanup reserve≤min(250ms, attempt幅/4)、通常phase reserve以上のcleanup floorを検査する。新時計・timer・deadline延長を作らない。内部attempt_deadline_exceededは本moduleの固定理由で、既存公開ReadFailureCode／MCP JSONのenumを拡張していない。

pre-releaseでpending read／cancel／closedの不足を固定し、後続release=succeededでもconfirmedへ修復しない。未確認・release失敗は停止し、既存cancelled／closed／観測不整合・期限のprimaryを上書きしない。終端が期限内に記録されていても、消費時の元windowが切れていれば失敗する。過去のcleanup事実は診断へ保持する。

返却viewは常にend_verified_only／synthetic=trueのcleanup、native_operations=unavailable、evidence_issuance=disabled、body_eligible=false。これは合成入力の整合性確認で、native終了証拠ではない。owner statusもtoken／budget／signal／reader／本文／raw例外を返さず、外部stopの未知文字列を固定invalid_inputにする。

### 13.4 費目・未接続

同ownerのattempt制御枠は最大210、delivery各1、同時resource各1、各resourceのpre／end各1。生成countはCではなく追加制御費で、HTTPをdispatchせずC/G/P/Rを更新しない。同じdomain内の別owner・close後にもidentityのclaimを削除しない。WeakMapの合成token上界は実native buffer／heap／workの証明ではなく、全体受付は無効のまま。

新moduleと宣言等4artifactはnpmへ同梱するが、実session／bootstrap／sourceから呼び出していない。fixture moduleは非同梱を維持。native採用・intrinsic capture・操作・RT-B03のfinish前のnative証拠照合・実session／source bindingは未実装で、NA-A01〜18全体の合格とはしない。今回はnative禁止を守るため、新規の純粋合成テスト・static pack／compiled確認だけを実行し、既存native Streams試験を含む全体再実行は保留する。
