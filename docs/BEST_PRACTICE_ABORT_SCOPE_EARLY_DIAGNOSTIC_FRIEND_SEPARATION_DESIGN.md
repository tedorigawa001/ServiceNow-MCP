# AU-BR-006：constructor最初期の診断owner・fake friend分離

Version: br006-early-diagnostic-friend-separation-draft-0.14 / Date: 2026-11-01。
Status: **EF-01／02、EF-03Aに加え、EF-03B B-01／B-02-01〜03を限定実装し合成検証。開発同reader cleanup／source受理までを追加し、旧試験の置換・全case／release判断移行・ビルド設定変更・friend撤去は未実施。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実接続・実通信・実機操作・設定変更・Pushは行わない。**

基準：`134248b`、[ND設計§3・§13](BEST_PRACTICE_ABORT_SCOPE_NATIVE_STATUS_DIAGNOSTIC_DESIGN.md)、[ND-03検証§5・§6](E2E_BEST_PRACTICE_NATIVE_DIAGNOSTIC_ND03_2026-10-31.md)、[source受理設計](BEST_PRACTICE_ABORT_SCOPE_STATUS_SOURCE_ACCEPTANCE_DELTA_DESIGN.md)。以下の型名・配置は内部契約案で、公開API／JSONの追加や承認済み実装ではない。

## 1 目的と現在の差分

[EF-02前のsession](../src/servicenow/bounded-read.ts)はclass fieldでAbortController・`performance.now()`・日時を評価し、その後constructorで設定provider・canonical core・admission・登録owner・timer・外部abort listenerを生成していた。EF-02では最初のfieldに純粋shellを置き、それらを保護区間内へ移した（§13）。ND-03のnative診断owner自体は、引き続きdriver.beginで生成される。

また、`takeNativeStatusCompositionProbe`／`takeStatusAcceptanceProbe`のexportだけでなく、そのclosure・static private probe・driver型・static初期化が配布対象の同ファイルに残る。開発moduleが非同梱でも、このfriendはdeep importで取得し得る。one-shotは重複防止であり、取得者の真正性を証明しない。加えて、公開static `BoundedReadSession.prepareNewReviewComposition`は`synthetic_io`指定時にdata-onlyのfake byte列を受けるlane（`#prepareCompositionIO`、`fake_io:true`のsummary）を持ち、その依存`review-composition-fake-io`も`dist/servicenow`へ同梱される。callbackは受けず一度限りでもないが、配布classに残るfake分岐である。

目標は次の2点を同時に満たすこと。

1. **診断を持つことと実行権限を持つことを分離**し、最初の観測・resource生成前から固定容量の診断shellを保持する。
2. **本番生成継続とfake orchestrationを物理的に分離**し、任意fake driverを受けるfriend本体を配布物からなくす。

本番binding、認証・URL由来の証明、ReleasePermit発行、SA-03／fallback、選択payload／workerの採用は非対象。既存200 guardを維持し、本書の完了をgate解除条件に読み替えない。

draft-0.2のレビュー修正：撤去対象からSA-01の`synthetic_io` laneと同梱fake I/O moduleが漏れていた点を§1・§7.2・§7.3・EF-T09へ追加し、§6のrollback順を現行`#close()`と同じowner／core先行へ揃えた。

## 2 採用案と代替案

| 案 | 評価 |
|---|---|
| **固定の共通kernel＋本番／開発の別composition root** | 推奨。共通部分は本番に必要な状態遷移・診断・会計だけ。fake driver／probe／fault選択・テスト用捕捉は開発rootに置き、本番から参照しない |
| 公開exportやpackage exportsだけでfriendを隠す | 不採用。private probe・callback受付が配布JSに残る。取得者認証／native provenanceの代わりにならない |
| 環境変数・`fake_io`・test用secret・one-shot取得でruntime分岐 | 不採用。配布された動的な登録／切替口を残す。テストsecretを本番capabilityにしない |
| ビルド後の文字列置換でprivate methodを削る | 不採用。参照・宣言・source mapの取り残しや、検証したsourceとの不一致を招く |

共通kernelをdeep importできても、他の既存sessionのowner／writerを取得・登録・交換できない設計にする。必要な新規生成factoryは、その呼出しで新しく作った状態だけを所有し、既存sessionを引数として採用しない。単なるファイル移動では分離完了としない。

## 3 フィールド初期化・constructorの目標順序

基底classのfield初期化をconstructor本文より前の工程として扱う。本文先頭へowner生成を足すだけでは現行の`started`等に先行できない。

| 順序 | 工程 | 許可・不変条件 |
|---|---|---|
| E0 | private ConstructionShell生成 | 最初の評価を伴うinstance fieldとする。固定3purpose slot・first reasons・run identity・claim／resource状態を純粋確保。clock・日時・provider・AbortController・listener・I/O・caller callbackは0 |
| E1 | その他fieldの初期値 | literal／undefined／private参照だけ。`new AbortController()`、時計・日時・外部method呼出しは本文の保護区間へ移す |
| E2 | constructorのtry開始、入力pin／基本検査 | shellはpending。snapshotをplain dataから一度copyし、proxy／accessorを実行しない。providerは後の保護された工程で一度だけ評価する |
| E3 | 元起点の捕捉 | 単調clockと表示用日時を一度捕捉。不正値・throwはfirst reasonへ固定し停止。再試行で起点を取り直さない |
| E4 | 入力・release設定・認証方式の検査 | 設定providerのthrow／取消・再入もshellへ合流。資格情報は必要な専用slotだけで保持し、診断に入れない |
| E5 | canonical core・lease生成 | 同じ元起点と既存上限から生成。callbackによる早期停止はshellへ記録し、未代入fieldを使う通常stop／closeへ飛ばさない |
| E6 | core binding、一度限りの登録owner接続 | 同run／session／snapshot／core／leaseへの参照結合を確定。登録後に戻らない失敗でも同instanceへ再登録・再生成しない |
| E7 | admission・controller・停止経路の準備 | admission取得、controller生成を記録。解除slot／固定cancel callbackを準備してからtimer／listenerへ進む |
| E8 | timer／外部abort listener登録 | core binding済みかつ停止経路準備済みでのみ登録。登録前後の取消を検査。登録中callbackはfirst reasonを固定し、次工程を開始させない |
| E9 | constructor commit | 先行停止なし・必要resource揃いを確認して通常sessionへ移譲。shellと診断ownerを作り直さない |
| E10 | private source／transport binding | 同constructor key・同source／handleへ一度だけ結合。ready／ReleasePermitやnative発行許可とは別の段階 |

E5／E6とadmissionの順序は現実装から変わるため、busy／既存認証エラーの優先順位は移行前に表で固定する。E5以前の検査とE6の登録は不要なI/Oを行わず、admissionを取得しなかったrunを返却扱いにしない。

公開`new BoundedReadSession(snapshot, options)`の既存引数は維持する案とし、callerからshell／seed／binding／診断writerを受け取る引数は追加しない。固定の上位factoryがconstructor失敗を回収するが、既存sessionを渡してownerを取り出すhelperにはしない。

## 4 private型・一度限りbinding

- `ConstructionShell`：固定slot、run identity、先行理由、pending／ready／failed／closed、生成・core binding・source binding・移譲・sealのclaimを持つ。clock／budget未生成でも診断を保存できるが、dispatch／terminal／permitの権限は持たない。
- `CoreBinding`：同shell／session／pinned snapshot／canonical core／lease／登録ownerの正確な参照。claimをcallback／照合より前にstartedへ移し、成功・不一致・例外のいずれでもspent。bindingのためにleaseを別起点で作らない。
- `SourceBinding`：CoreBindingが成立した後だけ、同private key／source／transport handleへ一度結合。未生成sourceはpendingのまま。aliasのJSON一致・copy・同URL／token文字列だけでは成立しない。
- `CommittedConstruction`：生成物を通常sessionへ一度移譲した事実。resource tokenはmove相当で所有者を切り替え、constructor側と通常closeの双方が解除しない。
- `ConstructionFailureCopy`：固定stage／内部code／既存公開code、各取得・解除の状態、seal済み診断copy。権限を含めず、callerが既存sessionへ再提出できない。

coreとsourceのbindingは**別々のone-shot**であり、後から全部入りbindingへ差し替える方式にしない。停止・失敗は未消費claimも失効させ、再binding／再準備／shell再生成を拒否する。診断writerはprivate creatorだけが捕捉し、readonly observerやfriendへ返さない。

登録ownerやcanonical側の停止callbackは、生成途中ではshellの固定停止coordinatorへ入る。first reason→claim失効→取得済みresourceの解除要求の順とし、coreが存在する場合だけ同coreへ一度伝播する。相互通知の再入でfield未初期化参照・理由上書き・通知ループを起こさない。

## 5 生成失敗と診断回収

constructor本文の保護区間はE2〜E9全体を覆う。失敗時は通常`#close()`へ無条件に委譲せず、取得済みslotだけを扱う固定rollback sectionへ合流する。現在の`#close()`は全fieldが存在する前提であり、部分生成状態にはそのまま使わない。

| 失敗位置 | 診断と停止 | 後始末 |
|---|---|---|
| shell確保より前／shell確保自体 | 上位固定factoryで可能ならinternal_review_errorのみ。ownerありと偽らない | 外部操作開始0。回復不能なOOM／process abortまでの応答保証はしない |
| shellあり、clock／provider／入力検査失敗 | pendingのままfirst reasonとstageを固定しseal | 専用credential参照等、実際に保持したものだけ破棄 |
| core生成・登録・binding失敗 | 内部理由と公開写像を分離。登録claimを復元しない | 取得済みcore／ownerがある場合だけ一度停止。admission未取得なら返却0 |
| admission／controller生成失敗 | 先行理由を保持してfailedへ固定 | 取得済みのadmissionだけ返却し、controller等を一度解放 |
| timer／listener登録中のthrow・取消・再入 | 次工程を開始しない。first reasonをcloseで置換しない | 登録試行済みslotも扱い、外部callbackの残存を防ぐ。取得不明ならunconfirmed |
| commit後の停止／close | 通常sessionの固定closeへ移る | 移譲済みslotをconstructor側が二度返却しない |

失敗copyはmodule-privateなbrand／台帳に結合した失敗搬送物へ保持し、固定factoryだけが一度takeする案とする。既存callerには従来の固定codeを維持し、raw exception／cause／stack／credentialを付加しない。外部診断を保存するための登録APIや、失敗objectからwriterを回復するgetterを作らない。台帳はweak参照を基本とし、take／seal後にlive authorityを残さない。

直接`new`する既存callerと固定factoryの失敗copy配送をどう揃えるかは承認事項。未対応callerで詳細copyを回収できないことを、診断回収成功と報告しない。

## 6 resource所有・解除の固定表

resource台帳は可変長callback stackではなく、下表の固定slotと取得／移譲／解除状態を持つ。登録前にclaimと解除手段を準備し、取得が返った時点でhandleを保存する。

| slot | 取得記録 | 解除・移譲 |
|---|---|---|
| credential／snapshot参照 | pinして保持した時点 | 専用参照を解除。JS stringの物理消去を保証したとは記録しない |
| canonical core／登録owner | 各返却物を受領した時点 | 先行理由で一度停止。登録を戻して同instanceで再試行しない |
| admission | counterとprincipal keyの取得を一つの固定操作として記録 | 取得済みのときだけcounter／keyを一度返却。他runのkeyを消さない |
| controller／phase controller | 各生成を受領した時点 | callback先を失効してからabort。生成0なら解除0 |
| deadline／phase timer | scheduling開始とhandle受領を分離 | 同handleを一度clear。副作用後throwでhandle不明なら解除確認済みにしない |
| external abort listener | target／固定callback／登録試行を事前記録 | 登録throwでも同callbackのremoveを試みる。元からabortedのケースを前後検査 |
| source／transport継続 | private creatorで捕捉後 | 同creatorのrevokeを一度。terminal／draftのlive slotを失効 |

rollbackは、authority失効→owner／core close→listener除去→timer clear→controller abort→admission返却→credential参照解除→診断sealを基本の固定順とする。現行`#close()`（composition失効→登録owner close→core writer close→timer／listener解除→phase／controller abort→admission返却）と同じく、abortで起動するcallbackが生きたowner／coreへ停止を書けない順にする。部分生成では未取得slotを飛ばすだけで順序を入れ替えない。解除中のcallbackもfirst reasonを変更しない。個別解除の失敗で後続slotの解放を省略しない。

constructor段階にはreader／workerがまだ存在しない。後段の非同期cleanupを同期constructor rollbackに混ぜず、元run／cleanup floorへ結合した別のjoinを使う。新しい60秒のcleanup予算を作らない。解除不明・解除throwはteardown=unconfirmedとして残し、元のprimaryと別軸に保持する。

## 7 fake friendの配布物からの除去

### 7.1 目標のsource境界（配置名は案）

| 範囲 | 内容 | 禁止 |
|---|---|---|
| 本番共通kernel | construction shell、固定lifecycle、会計・失敗写像・native操作の通常部品 | fake flag／fixture identity台帳／任意driver受付／テスト用capture・lookup |
| 本番composition root | 既存公開classと固定生成・停止・解放継続 | fake probe／friendのexport、test側moduleへのimport・dynamic import |
| 開発composition root（例：tests/support/review） | 新規fake run、注入Response／clock、fault case、限定summary | 既存本番sessionの採用、共有fixture registry、資格情報の保存・通信 |

本番classのprivate fieldを覗くための新getter／installer／mutable factory引数は追加しない。開発rootは自分の新規状態だけを構築する。本番と開発のrun brand・claim・resource台帳を分離し、実装kernelの共有を既存runのauthority共有にしない。

### 7.2 撤去対象

`bounded-read.ts`から少なくとも次を撤去する方針。

- `takeNativeStatusCompositionProbe`、`nativeStatusProbe`保存slot、`#runNativeStatusProbe`とそのstatic登録。
- SA-02の`takeStatusAcceptanceProbe`、`statusProbe`、`#runStatusAcceptanceProbe`、fake driver／profile pinとstatic登録。
- `NativeStatusProbeScope`／fake driver・非実行probe summary等の試験専用型、および共通method中のfake専用分岐。
- SA-01の`prepareNewReviewComposition`の`synthetic_io` lane：overload・`#prepareCompositionIO`・`fake_io:true`のprepared summary、`pinCompositionFakeIO`／`CompositionFakeIO`と`review-composition-fake-io`の配布物。data-onlyでcallbackを受けないことは残置理由にしない。`synthetic_io`省略時の固定生成summary（CM-04-02互換）は通常経路の範囲として別に扱い、fake laneと一緒に残さない。

private source consumerのうち本番の固定bindingに必要な部分は、任意driverを受け取らない固定kernelへ残すか、③本番bindingの設計で置換する。名前を変えてfriendを残す、`undefined`初期値にして後から登録する、hidden symbol／secretで再開する方式は不可。

### 7.3 ビルド・梱包

通常の`src`→`dist`を配布用とし、開発rootのcompiled試験は別の専用出力先（例：.test-build）へ出す。出力先・tsconfigは案であり、今回は作成・変更しない。配布ビルドはtest rootを入力に含めず、JS／.d.ts／map／dynamic-import先を含む依存閉包にfake orchestrationを残さない。

`package.json.files`の除外だけでは、同梱`dist/servicenow/bounded-read.js`内のfriend本体や`synthetic_io` lane、`dist/servicenow/review-composition-fake-io.js`を除去できない。将来の梱包試験では、非同梱確認に加え、配布ファイルの禁止export／probe本体／任意driver受付／登録slotの不在を確認する。文字列検査は補助とし、module export・構文／依存関係の検査と実際の配布物からの負の対照を組み合わせる。

古いdist／test出力の混入を避け、空の検証先でbuild・packする。取り除いたfriendの後方互換shimは同梱しない。runtimeの通常機能に必要な依存ファイルまで除外して壊す方式も不可。

## 8 試験の意味を下げないための移行条件

現在のND-03は**実classそのもの**のprivate生成継続を検証した記録である。共通kernel＋別の開発classを試験しただけで、その保証を継承したと書いてはならない。

- ND-03の固定記録・caseは過去の版として維持する。移行後のkernel／開発assembly試験は版を分け、constructor／brandの同一性が異なることを明記する。
- 本番classの公開動作、既存固定200経路、停止・会計・梱包は本番artifactで回帰確認する。
- 実classの新native経路を試験するには、③の固定本番kernelを設計した上で、その通常I/O境界に注入Responseを渡す。任意fake driverを再び本番class内へ入れない。
- その経路が未接続なら「実class native連続保証は未確認」と残し、分離のために失ったcoverageを成功件数へ足し戻さない。本番bindingの完了・品質を主張する際の必須残項目にする。

保証範囲の変更と試験移行方法は実装前の承認事項。exact class試験を維持できない場合に、friend温存で隠さず設計レビューへ戻す。

## 9 費目・失敗分類・秘密

shellは固定3purpose slot・固定reason／resource／claim slotのみで、生ログ・例外本文・任意長履歴を保持しない。具体的な固定slot件数・確保量・更新回数は実装時に計数し、本設計の記載だけでRust work modelや全体受付へ算入しない。

診断生成・binding・rollback自体はdispatch C=0、body受信G/P=0、R予約の補充／返金0。同canonical coreの210試行・受信量・元60秒を維持する。設定期限は既存の元run起点とdeadline予約条件を継承する。

内部理由と既存公開codeの対応を固定し、任意stringをpublic stop経由で取り込まない。attempt floorの到達は最新ND-03どおり、元run残時間が正ならsession側はupstream_unavailable、canonical期限到達ならdeadline_exceededを保持する。native側のcleanup_deadline等とは別軸であり、解放の都合で書き換えない。

失敗copy／readonly projectionにはstage・固定code・取得／解放状態・固定件数だけを含める。token／snapshot内容／principal hash／URL／source・lease・writer参照／error causeは出さない。seal後にcopyからauthorityを復元しない。

## 10 合成受入条件（EF-01の限定確認は§12）

| ID | 条件 | 必須結果 |
|---|---|---|
| EF-T01 | field初期化を含む最初のclock／日時／controller生成 | 先にshell確保済み。shell生成で外部観測0 |
| EF-T02 | E2〜E9各工程のthrow／取消／再入 | first reason保持・後工程0・取得済みslotだけrollback・resume不可 |
| EF-T03 | 別shell／session／core／lease／snapshot、copy binding、二重bind | 自分のclaimを消費して拒否。外国owner不変、core／sourceを付替えない |
| EF-T04 | core未生成時／登録中／timer登録中の同期stop | 未初期化fieldへ触れず診断固定。相互通知一度、権限再生0 |
| EF-T05 | admission前失敗／取得後失敗／commit／二重close | 未取得返却0、取得済み返却1、他runのprincipal key不変 |
| EF-T06 | timer／listenerの部分登録、解除throw | 可能な解除を全slotで実施。unknownをcompleteにしない |
| EF-T07 | constructor throwでinstanceを返さない | 固定factoryが失敗copyを一度回収。raw error／秘密出力0 |
| EF-T08 | shell確保自体の失敗 | 外部操作0、可能な上位境界で固定code。詳細診断ありと偽らない |
| EF-T09 | 配布artifactのdeep import／export／JS・宣言・map検査 | 両fake friend・登録slot・probe・driver受付、`synthetic_io` lane・`review-composition-fake-io`・`fake_io` summaryが不存在 |
| EF-T10 | 開発rootを配布rootから参照する負の対照 | build／pack検査を失敗させる。単なる除外で参照切れを隠さない |
| EF-T11 | 旧0.2／0.3結果・固定200・通常MCP経路 | 契約・code・上限・認証固定を維持。新native／fallbackは有効化0 |
| EF-T12 | 開発claimを本番rootへ混入、sealed copyの再提出 | 既存sessionへ採用不可、formal issuance／permit／worker開始0 |
| EF-T13 | 移行後のtest buildとproduction build | 別assembly保証とexact class保証を区別し、失ったcoverageを記録 |

テスト期待値は工程イベント・native resource取得／解除回数・別runの状態・artifact内容から独立に作る。製品のcleanup=completeやone-shot flagだけを期待値の根拠にしない。

## 11 実装の分割と承認待ち

1. **EF-01**：純粋shell・固定resource状態・core／sourceの別one-shot claimを合成依存で実装。登録／runtime配布にはまだ接続しない。
2. **EF-02（限定実装済み、§13）**：field副作用を保護区間へ移し、部分生成rollbackと失敗copyの固定回収へ接続。busy／認証エラーの優先順位、元clock、API互換を合成依存で確認。
3. **EF-03（A・B-01・B-02-01〜03を限定実装）**：[共通kernel・本番／開発root分離詳細設計draft-0.11](BEST_PRACTICE_ABORT_SCOPE_KERNEL_ROOT_SEPARATION_EF03_DESIGN.md)。純粋construction kernel、独立生成root、値検査・開発lifecycle・同core会計／固定200 transcript・同reader cleanupを追加。旧試験を残し実classの状態／枠不変を合成確認。B-02の移行範囲・限定実装・旧case単位対応表は同設計の参照先へ分離し、実class保証と別assembly保証を区別する。全case／release判断移行・friend撤去・build設定変更は未実施。
4. **後続③**：固定本番bindingとexact class注入E2Eを設計・接続する。別承認まで正式発行口・fallback・実通信は閉鎖。

実装前に、E5〜E7のadmission／登録順、直接newの失敗診断配送、部分登録が不明な場合の終了写像、開発assemblyで変わる保証とexact class試験の回復方法を承認する必要がある。D1／D2のruntime採用・SA-03承認とは別であり、本書の合意だけでいずれのgateも開かない。

本設計の合意だけではruntime変更・実機操作を認めない。限定実装の実績は次節で分ける。

## 12 EF-01：純粋shell・合成resource状態・別one-shot binding

[開発専用module](../src/review/abort-scope-evidence-construction-shell.ts)にprivate型と純粋creatorを実装した。exportは固定case名runnerだけで、shell／writer／context／resource tokenを取得・供給する口はない。既存session／実coreの登録台帳を共有せず、module全体を非同梱とする。

- 固定purpose3個は常に未観測。resourceはsnapshot、core、登録owner、admission、controller2個、timer2個、abort listener、source／transportの10slot。純粋生成とbindingでclock・日時・controller・timer・fetch・listenerを起動しない。
- CoreBinding／SourceBindingは同合成creatorのimmutable参照だけに結合する。各claimは照合前に消費し、失敗・停止・二重開始後も戻さない。coreはsnapshot／core／登録ownerの合成取得が揃ってから、sourceはcore bindingと非実行commit後に結合する。
- attempt／受領／不明を分け、attempts・acquisitions・releasesは各0／1。timer／listenerの取得試行はcore binding後だけ。停止中に返った同resourceの合成handleは後始末用に記録できるが、初期化は再開しない。
- commitは合成resourceの所有者ラベルをshell→sessionへ一度移すだけで、実行permitや実classへの移譲証拠を発行しない。古いownerの解放申告を拒否しても、新ownerの必要な後始末を妨げない。解放状態の更新は同合成ownerだけが一度行う。
- 未取得resourceは返却0。unknownをconfirmedへ上げず、sealもrelease成功を捏造しない。未解決slotはunconfirmed、first reason／refusalは別保持、seal後の更新・二重sealはlate_ignoredとなる。公開copyは再帰freezeし全7permission=false。
- snapshot／core／登録owner／source継続の解放記録はbindingを即時inactiveにし、その後のcommit／source bindingを拒否する。解放済みcoreにhistorical boundが残ることを、live authorityとみなさない。

draft-0.4のレビュー修正：未開始・解放済み（owner=none）のslotの解放申告者をcommit有無にかかわらず旧ownerとしていたため、commit後は新ownerの未開始slot申告が外国owner扱いで停止し、旧ownerの申告がnot_neededとして通っていた。owner=noneのslotはcommit後は新ownerだけを正当な申告者とし、新ownerの再解放はinvalid_state（重複）として分類する。

resourceの取得／解放は**合成metadata**であり、OS操作・実resource handle・rollback callback・固定解放sectionの実行証明ではない。EF-01では移譲・sealの状態modelまでを確認し、実際のconstructor field順変更、停止相互通知、失敗copyの搬送・take、admission返却・credential破棄、実cleanupはEF-02以降に残す。実装の確保量・Rust work単位への導出も行っていない。

EF-01時点ではEF-T03の参照結合・二重利用、EF-T05／06の純粋状態、EF-T12のcopy非権限性だけを限定確認した。EF-T01の実class field順、EF-T02／04／07／08のcallback／constructor失敗は後続EF-02（§13）で合成確認を追加した。EF-T09／10のfriend本体撤去、EF-T13のassembly移行後runtime保証は未達。新moduleの非同梱確認を、既存friend撤去済みと取り違えない。

[合成テスト](../tests/review/construction-shell.test.ts)、[compiled fixture](../tests/review/fixtures/compiled-construction-shell.mjs)、[検証記録](E2E_BEST_PRACTICE_CONSTRUCTION_SHELL_EF01_2026-10-31.md)を参照。正式発行口閉鎖・Unknown・全体受付無効・調査保留は維持する。

## 13 EF-02：実constructorの保護区間・固定回収

runtimeの同一class内に純粋shellを置き、EF-01の開発moduleはimportしない。snapshot／optionsをdata-onlyで固定し、clock・設定provider・認証・busy検査・core・admission・登録owner・controller・timer・listener・commitを保護区間で行う。既存の設定→認証→busyの優先順位と元run clockを維持する。core生成後にadmissionを取り、登録ownerと同session／snapshot／core／leaseの参照を結合する。source結合は既存private生成継続内で別claimとして行う。

固定rollbackはsource継続失効→登録owner→core→listener→deadline timer→phase timer→phase controller→controller→admission→snapshotの順。disposedを先に立て、相互通知による再入・未初期化field参照を抑止する。取得未開始は操作0、取得済みは解放試行1。handleが返る前のthrowや解除throwはunconfirmedとし、残りのslotの解放を継続する。admissionはこのinstanceが取得した場合だけ返す。credential／provider／fetch参照を切り、借用元snapshotは変更しない。文字列のメモリ消去・強制GCは保証しない。

固定factory `BoundedReadSession.create`は常に新しい同classを生成し、constructorが作った固定例外に私有WeakMapで結合したsealed copyを一度取得・削除する。外部error・seed・shellを受けるtake口はない。成功時は新sessionを返すが、失敗時にはsession／writer／lease／snapshot／URL／例外本文を返さない。copyはconstruction-onlyでpurpose3個は常に未観測、historical bindingはlive authorityではない。shell確保・copy確保自体ができない場合、可能な境界で固定internal_review_errorとnullを返し、詳細診断の存在は主張しない。

直接`new`は既存の固定code例外を維持し、事前abort時も従来どおり停止済みinstanceを返す。factoryはその停止を検出してcloseし失敗copyへ変える。ND-03の固定入口だけをfactory回収へ接続し、constructor_diagnosticに保持した。通常MCP／R2等の直接new上位callerすべてへの詳細copy配送は未接続であり、正式JSON契約は変更しない。copy生成時の失敗でも、返却前の新sessionを固定解放する。

draft-0.6のレビュー修正：commit後のsession停止（外部取消・release時のHTTP失敗等）もshellのprimaryへstage=stopで書き込み、state=failedにしていたため、構築成功後のrun失敗が構築失敗と区別できなかった。shellへの理由記録は構築中と、constructor末尾で検出した事前abort（stage=commit）に限り、構築後の停止はsession／登録owner／nativeの各層だけに残す。登録ownerのclose理由は従来どおりsessionのstopCodeを優先する。close時の解除失敗はteardownの記録として引き続きshellへ残る。

本shellはconstructorとclose時点の固定10slotを記録するもので、全HTTP試行・phase timer世代の履歴やnative reader cleanupの証明を代替しない。同期解除APIの戻りを待つasync cleanup契約ではない。EF-03のfriend／synthetic_io撤去、assembly分離、artifact負の対照は未実施。既存friendが配布物に残る事実は変更しない。

[合成テスト](../tests/review/construction-transaction.test.ts)、[compiled fixture](../tests/review/fixtures/compiled-construction-transaction.mjs)、[検証記録](E2E_BEST_PRACTICE_CONSTRUCTION_TRANSACTION_EF02_2026-10-31.md)を参照。正式発行口閉鎖・全体受付無効・調査保留を維持する。
