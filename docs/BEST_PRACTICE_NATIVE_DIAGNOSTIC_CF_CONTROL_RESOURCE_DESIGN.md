# BG02 CF01〜05 制御継続とresource所有の詳細設計

Version: native-diagnostic-cf-control-resource-draft-0.3 / Date: 2026-11-16。
Status: 旧root内部のLink／duty／空JoinCellの先行保持・同owner検査だけ限定実装（§12）。設計基準HEADは`4189d33`、今回の実装基準は`02aac7c`。[共有境界設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_BG02_BOUNDARY_DESIGN.md)CF01〜05を具体化する。[VK01／02](E2E_BEST_PRACTICE_NATIVE_FACTS_VK01_VK02_2026-11-16.md)以外の実制御・resource結合・先行join dispatchは未接続である。

先行案は、制御継続とresource責務の結合を**旧root内部で明示する**ことに限る。bridge・権限処理・同一性検査を外へ渡す共通constructorやinstallerは作らない。新LM03へのmodule搬出は別gateとし、本書でBG02全体の分離可能性やfriend撤去を確定したことにはしない。

旧入口・試験・期待値・元期限を維持する。正式発行口／新LM03／C実行入口／body起動閉鎖、全体受付無効、Unknown、通常経路未切替、VM／監視／telemetry調査保留、LOAD6／LOAD7とAP01〜06の未承認を維持する。§12の合成依存での限定実装・検証以外は進めず、build／runner設定変更・実接続・実通信・実機操作・公開・コミット・Pushは行わない。

## 1 現行の境界と変更案の区別

[旧ND root](../src/review/abort-scope-evidence-native-diagnostic.ts)のprivate creatorが、診断owner、唯一のsample履歴、自record、terminal台帳、run／cleanupのjoinを所有する。旧ND-02とND-03は同moduleのResponse／stream再利用台帳を使う。[実class](../src/servicenow/bounded-read.ts)が渡すbridge scopeは、旧NDのローカルbindingとは別のidentityで、同session／source／lease／coreの検査・受理・停止を実class側で行う。両bindingの構造一致や値一致を要求する設計ではない。

| 対象 | 現行の事実 | 今回具体化する契約案 |
|---|---|---|
| CF01 | `clean`のqueued callback内でphase→writer pending→sample→cancelの順 | 同ownerのRunLinkとrecordを確認した固定継続だけがこの同期群へ入る。通知用の外部callbackへ置き換えない |
| CF02 | Promise executor内でenqueueを呼び、そのPromiseを`runWork`／`cleanupWork`へ代入 | 通常のnative queueではcallback前に代入されるが、enqueue呼出し前の保持ではない。将来はprivate JoinCellの先行公開点とdispatch失敗責務を分ける |
| CF03 | `last`／`sampling`はcreator内の1組で全phaseが共用 | resource側に第二の時計・残時間・起点を持たせない。元windowと同sample ownerへの参照だけを使う |
| CF04 | 取得直前、guard、consume post、stopの4か所だけがbridgeを呼ぶ | bridgeは旧rootのlexical closureに残す。helperの値・join結果・public診断からcheck／accept成功を復元しない |
| CF05 | finallyで同cleanupへjoinし、自token退役→upper teardown→seal | 実操作の未確認、native duty、自token退役、実classのclose／予約解放を別軸で保持する |

CF02の先行JoinCellは現状の単なる配置変更ではなく、queue登録時の例外・同期callback等を扱う変更案である。既存動作の同等性と新故障条件を分けてレビューし、未検証の安全性を現行codeへ遡及しない。

## 2 private型と唯一のowner

以下は実制御まで含む内部型案で、§12の空型とは区別する。exportや公開引数を追加せず、生成は同じ`constructInjectedNativeDiagnosticWorkflow`の中で完結させる。structural copyや外部診断を型assertionしても資格にならない。

| 内部型案 | 固定fieldと生成元 | 検査と禁止 |
|---|---|---|
| `RootControlLink` | creator固有origin、BG01の同binding、同upper owner、同writerへのprivate参照 | 同一のLink実参照を保持する。bridge・session・source・consumerを引数で採用しない。copyを正規Linkとして扱わない |
| `RunLink` | 同RootControlLink、実行を一度だけ始めた履歴、同run JoinCell、未結合または同window／attempt／record | descriptor確認前はrecordなしのまま。生成順を飛ばしてrecordだけ差し替えない。再executeは元の拒否と先行理由を保持する |
| `ResourceDuty` | 同RunLink、同anchor／record、readerIdentity、cleanup JoinCell、保持区分 | 返されたreader参照と所有確認を分ける。`owned=false`でも返された参照や取得失敗の未確認責務を捨てない |
| `JoinCell<T>` | 同Link、唯一のprivate Promise、private resolver、一度限りdispatch／entry／settle履歴 | callerや別ownerへresolver・Promise差替え口を出さない。成功／失敗は制御の結果で、resource解放証拠ではない |
| `RetainedDuty` | 同recordと既に捕捉した参照・facts・進行位置、未確認種別 | `ResourceDuty`の同じslotの保持状態であり、第二のrecordやclaim台帳ではない。public snapshotをauthorityへ戻さない |

`phase`、`primary`、`revoked`、`last`／`sampling`、issue／consume claim、`current`は引き続き1組だけにする。Linkへ状態を写して二つの状態機械にしない。upper ownerのwriterと実操作は旧rootだけが呼び、VK01／02は理由／真偽値を返すだけである。

origin・Linkはcreatorの新規生成に限定する。別ownerのLink、同値window、コピーしたanchor／record／cleanup、別readerを混ぜた場合は、自claimだけを消費または固定拒否し、foreign側の台帳を検索・失効・返却しない。新しいownerの生成で、失敗したownerのclaimを再利用しない。

## 3 固定生成順と同参照の結合

1. BG01のfresh binding／upper ownerを生成・bindし、既存の固定writerを得る。同creatorのRootControlLinkと、未取得責務を表す空のRunLink／duty保持slotを用意する。外部のclock・scheduler・native操作より先である。
2. 既存のraw依存のstrict検査を行う。失敗時は既存理由を記録し、空slotをnative観測済み／cleanup確認済みにしない。先行slotの生成自体が失敗する場合もnative取得へ進めない。現行ND creatorに、その新しい部分生成失敗を必ず回収できる保護区間があるとは扱わず、同upperの固定failure copyと回収先の確定を実行接続前のgateにする。
3. 初回executeの開始履歴を消費し、同run JoinCellを保持する。descriptorの4fieldを検査し、同window→同attemptを一度だけ結合する。既存再executeの`request_rejected`、元workへの合流と先行理由を維持する。
4. 取得前のsample・bridge checkを元順序で行う。Response／stream・headerを確認し、同anchorを持つrecordを`current`へ保持してからgetReaderへ進む。Response観測失敗とreader取得開始後の失敗を混同しない。
5. getReaderが返した参照を`reader`と`readerIdentity`へ直ちに保持し、その後にprototype／所有・closed捕捉を確認する。`readerIdentity`はrelease試行後も残す。closed Promiseのobserverとcancel／release進行も同recordに属する。
6. 同cleanup JoinCellへ入る前後、issue／consumeのprivate照合、finallyで、元Link→window→attempt→anchor→recordの実参照を確認する。native getterやbudgetを照合用に再実行せず、既に保持した参照だけを使う。

slotへ同参照を保持することと、取得・所有・cleanupを確認したことは別である。部分生成物が残った場合は「最後に保持できた位置」と未確認責務を同slotに残し、後段のready・accepted・解放済みを補って生成しない。新しいprivate検査の挿入位置は将来の試験で固定し、既存の外部callback観測順を変える場合は単なる型抽出と呼ばない。

## 4 元floorと唯一のsample履歴

`D`は既存のdeadline_ms、`O`はwindow_origin_ms、`F`はcleanup_floor_msとする。いずれも元descriptor／同budget由来であり、cleanup開始時点から新しい10秒や60秒を作らない。

| 項目 | 固定条件 |
|---|---|
| 元windowの受付 | purpose=`release`、ordinal=1、4fieldのみ、O／Fは有限number。既存Dは正整数で60,000ms以下、O≤D、F≥min(10,000,D/6)、0＜O−F≤10,000を維持 |
| 同一性 | RunLink・anchor・ResourceDutyが同じwindow実参照を指す。同値copyや別ownerのFを採用しない |
| sample | cleanup／wait／issue／pre／postの全てが同じreadBudget・`last`・`sampling`を使う。有効値は0≤n≤Dかつ前回以下。初回取得ではn≤Oも確認 |
| 等号 | n≤Fは元floor到達として停止する。issue／pre／postで例外なく適用し、取消後やclose時にfloorを更新しない |
| 不正観測 | throw、Promise返却、不正shape、非有限、増加、sample再入は既存の固定理由へ。最後の有効last・既取得factsを保持し、例外本文や未知値を出力しない |
| 上位との差 | native側のfloor停止とrun全期限を分ける。旧bridgeではrun残時間が正のfloor停止をupstream_unavailableへ写像し、全run期限到達はdeadline_exceeded。native cleanup理由は別に保持 |

waitは元sample後の`last−F`だけをschedulerへ渡し、同closed observerと同cancel observerの合流を待つ。stop／closeは新規の発行・受理を同期失効するが、それだけでこのread-only待機を即打切りにしない。sample失敗や元floor到達で待機を終える場合も、既取得readerへの固定release試行と未確認記録を省略しない。

## 5 先行joinと一度限りのdispatch

現行の`runWork = new P(resolve => enqueue(...))`と`r.cleanupWork = new P(resolve => enqueue(...))`はexecutorが同期実行される。従って、native queueのcallbackより前には代入されるが、enqueueの呼出しより前にslotが公開されるわけではない。「queue呼出し前にjoin済み」という上位の説明は、この区別へ訂正する。

将来のJoinCellは、内部Promiseをprivate resolverの代入だけで作る→同owner slotへ保持する→一度限りdispatch履歴を消費する→既存のqueueへ登録する、の順にする。resolver・queue・継続をcallerから渡す仕組みではない。通常の成功時はqueueを増やさず、同じqueued bodyだけを実行する。

| 境界 | 契約案 |
|---|---|
| dispatch前の再入 | 先行slotには同Promiseが存在する。別work／第二cleanup／第二timerを生成せず、同ownerの拒否または既存workへのjoinを選ぶ |
| queued entry | 同Link・同cell・未開始・未失効を確認し、entry履歴を一度だけ消費する。queue登録から正常復帰する前の同期callbackは、想定した非同期queue契約の違反としてbodyを起動しない |
| enqueue throw | 先行cellと失敗理由を保持し、発行／受理を失効する。「登録失敗だからcallbackは来ない」と推定せず、後着callbackが来ても再実行しない。取得済みresourceがあればdutyは未確認のまま |
| settle | 同cellのresolverだけが一度settleできる。制御失敗の固定結果を返すことと、native cleanupがconfirmedであることを別にする。任意thenableや別Promiseへの差替えは拒否 |
| cleanup合流 | `clean(r)`の再呼出し・finally・stop後のcloseは同recordのcleanup workを使う。read-only合流のためにsample履歴・floor・cancel／release試行を再生成しない |
| 公開Promiseの差 | 同Promiseとはprivate runWork／cleanupWorkのこと。async closeが返すwrapper Promiseや、重複executeの拒否copyのPromiseまで参照同一とは要求しない。下位work・操作数・終端を照合する |

JoinCellの内部結果は非権限である。public返値のshape、4export、固定7permissions=false、既存の診断理由を勝手に増減しない。新しいqueue故障の公開写像・未確認保持は実装前レビューで固定し、既存fixtureの期待値変更を暗黙に含めない。

## 6 cleanupと受理の固定継続

CF01のcleanupは、同owner／record照合→phase=cleanup→upper writer pending→元sample→必要なcancel1回→同closed／cancelのwait→release前facts捕捉→release試行1回→元post sample→VK01理由確定→同recordへのimmutable cleanup保持→upper writer更新、の順を維持する。cleanup JoinCellの保持はこのcallbackより前で、後から結果通知だけを行う別callbackへ分割しない。

CF04のissue／consumeは旧rootに残し、次の同期群を保存する。

- issueは自issue claim／guard確認→claim消費・phase→元sample／guard→自token生成・自台帳保持。外部診断やVK02=trueだけからtokenを生成しない。
- consumeは自consume claimを先に消費→自live slotを外す→自台帳だけを取得・削除→token／anchor／record／cleanup／readerIdentity実参照を確認する。foreign台帳へ触れない。
- preはguard→sample→guard→writer consuming、postはsample→guard。bridgeがある旧laneだけが続いてacceptし、復帰後もsample→guardを行う。それからwriter accepted・consumedを確定する。
- stopは先行理由を保持→自tokenの同期失効→必要な旧bridge stop通知。`notifying`のfinallyが解除するのは通知中状態だけで、revoked／claim／先行理由は復元しない。

bridgeは従来の4call siteだけで呼び、RunLink／JoinCellを渡す相手へ任意check／accept／stop callbackを追加しない。正常cleanup後でもstop・close・guard失敗・混入があれば受理しない。消費拒否後に同tokenや同claimを再試行しない。

## 7 失敗prefixと保持責務

| 失敗位置 | 同ownerが保持するもの | 許されない処理 |
|---|---|---|
| raw／descriptor拒否、取得前stop | 先行理由、開始履歴、空またはwindow／attemptまでのLink、元join | native未観測をno_body／cleanup confirmedへ昇格しない |
| Response getter／header確認失敗 | 実際の観測prefixと既知のResponse参照、reader取得未開始の区別 | bodyやreaderが存在しないと推定して解放済みにしない。観測用にgetterを再読しない |
| stream確認後・getReader失敗 | 同record／stream、取得開始と返却有無、reader_owner_unknownの責務 | hidden readerの探索・再getReader・外部のreader登録で補わない |
| reader返却後のprototype／closed捕捉失敗 | 返されたreaderIdentity、owned／capturedを別にしたfacts、同cleanup join | 所有未確認を成功にせず、instance methodへfallbackしない。既存の固定native cleanup試行だけを同参照へ行う |
| cancel／closedのpending・拒否 | 元observer／同reader／元F、release前factsとVK01の優先理由 | stopで成功扱いにせず、別timer／別reader／別floorで再開しない |
| releaseLock throw | readerIdentityと失敗facts、解放未確認責務 | `reader=undefined`を物理解放の証拠にしない。実際は解放できた可能性があっても成功へ補正しない |
| scheduler／disposer異常 | 元wait・disposerの実取得有無と一度試行、既取得facts、先行理由 | 新しいwait／schedulerで再試行しない。同期境界のPromise返却を関数や成功値として採用しない |
| enqueue／内部task／join失敗 | 先行cell、最後に保持したrecordと進行位置、未確認種別 | Promiseのsettleだけでcleanup完了とせず、部分生成物を消して空ownerに戻さない |
| issue／pre／post／bridge失敗 | 自claim消費履歴、HTTP／cleanup事実、失効済み自tokenの状態 | confirmed cleanupを取り消して理由を混ぜず、acceptedを後から補完しない |
| late settle／seal後callback | 元のsealed copy、private dutyの後着観測の区別 | 未確認snapshotをconfirmedへ書き換えたり、再発行・二重release・再sealしない |

先行理由はrun側・upper拒否・HTTP・native cleanup・self-token退役を別軸にする。新内部slotはpublic snapshotへのlive portではない。診断用copyを作れない部分失敗でも、未確認責務のslotを先に空にしない。

既存observerがprivateなcancel／closed状態を後着更新することと、sealed public copyの不変は区別する。その更新を新しい受理資格・cleanup確認copy・再試行の根拠にしない。新内部拒否のうち同参照不一致はevidence_binding_mismatch、重複／再入はinvalid_state、queue／task異常はinternal_review_errorを候補とし、既存の先行理由とstage別写像を維持する。新故障の固定写像とfailure copy回収先を確定する前に実行へ接続しない。

## 8 終端と退役条件

CF05の通常finallyは同cleanupへjoin→upper releasing→自token／claimの失効・退役→upperのself-teardown確定→upper seal・phase closedである。upperのteardown confirmedは自laneのtoken／claim整理だけで、reader cleanup、実classのclose、予約返却の証明ではない。ND-03のdriver close／parent bytes disposeと実class側の予約解放は、従来の別責務として残す。

close前にexecuteがなければ、既存どおり停止・sealだけを行い、未開始teardownや未取得resourceへconfirmed creditを付けない。runがあればそのrun workへ合流する。停止後に発行資格を復元せず、既取得resourceの固定cleanupのためのread-only継続だけを残す。

同owner内部のslotを空にできるのは、そのfieldのproducer／callbackが退出済みで、同joinが終端し、所有の退役が確認できた場合だけとする。readerが不明、release失敗、cancel／closed後着待ち、join未確認なら、ResourceDutyを同slotのRetainedDutyとして保持し、通常利用から切り離しても責務を消さない。診断終端・Promise settle・slotのnull化は解放証拠でない。

保持はowner／recordごとの固定slotで行い、run1・record1・cleanup1・scheduler待機1を超える再試行列や可変traceを追加しない。既存のobserver・元reader参照をaliasとして保持し、readerをcloneしたり新しい台帳へ再登録したりしない。固定参照数はnative内部bufferや依存callbackの到達先容量の上界ではなく、その容量・全解放はUnknownのままである。

public ownerへの全参照消失やGCは契約上の解放確認に数えない。外側ownerへの未解決責務の移譲・最終discardは、新たな受付口を本設計で作らず別gateに残す。明示的なprivate custodyと同ownerの回収receiptを設計・確認するまでは、root終端だけで未確認dutyを全破棄できたとはしない。

## 9 将来の合成受入条件

以下は固定fake依存・注入Response／Streamsで行う実制御の将来試験の契約である。§12ではCT01／12の空参照境界とCT04の部分生成prefixだけを限定検証し、dispatch・resource結合・製品failure copyの検証へ数えない。旧UN62／既存caseを残し、新しい失敗caseは追加分として記録する。

| ID | 条件 | 独立oracleの確認点 |
|---|---|---|
| CT01 | 別owner／copy Link、window／attempt／record／reader混入 | 自由な外部入力を増設せず、固定private故障scriptで拒否。foreign ownerの理由・claim・台帳不変 |
| CT02 | pending書込前後のbudget／native再入 | pendingが先、同duty保持、第二取得・第二cleanupなし。後から同じ診断を作る実装を正対照にしない |
| CT03 | execute／cleanの同joinへ複数経路から合流 | 内部cellは一つ、cancel／release各1以下、timer／disposerの重複0。public wrapper Promiseの参照一致では代替しない |
| CT04 | JoinCellの部分生成・enqueue throw／同期callback／後着callback | 先行cellと最後のprefixを保持。body／発行の不正開始0、再dispatch0、unknownをconfirmedへしない |
| CT05 | cleanup→issue→pre→postの等号・逆行・時計throw | 同last・元Fを継続。第二時計／残時間からのF再計算を入れた変異は失敗 |
| CT06 | stop／close中にcancel／closedがF内で完了 | cleanup confirmedと非発行を両立。同run／cleanupへ合流してnative操作は一度 |
| CT07 | F到達後のlate settle、既にF到達したcleanup入口 | 固定release試行と未確認を保持。既seal copy不変、新10秒・新60秒・受理0 |
| CT08 | getReader／closed取得途中・release throw | 戻った参照と所有／捕捉確認を分離。同reader／元factsを保持し、hidden資源を成功と推定しない |
| CT09 | issue／pre／post／bridge accept復帰で取消・close・混入 | 元位置のpre／postが全て有効。cleanup事実と先行HTTP理由を保持し、claim再利用0 |
| CT10 | timer／observer／taskの異常と失敗後再入 | 同cell／dutyの保持、先行理由、不正な次workの拒否。後続回収試行を黙って省略しない |
| CT11 | 未execute close・重複close・sealed callback | 元の公開shape・理由を維持。未取得枠／resourceの解放計上0、sealed履歴不変 |
| CT12 | dependency／export／copy診断の負の対照 | 新policy／bridge／session採用口なし。root4export、7permissions=false、配布非同梱・通常経路不変を別検査 |

正常／失敗の操作順・元floor・同参照・返却prefixから期待値を作り、旧runner出力をoracleへコピーしない。受付条件を満たす通常async queueと、故障用の同期／throw queueを分ける。後者への新しい挙動は既存保証の移行完了ではなく、追加契約としてsource／compiledを別記録する。元5秒・既定並列度、旧比較child60秒、製品全体60秒を変更しない。

## 10 実装への引渡しと停止条件

旧root内のLink／duty／空JoinCell保持と同owner検査だけを§12で限定実装した。旧4export・public返値・bridge4call site・既存native操作を維持する。その後の先行join dispatch、固定cleanup／guard／終端への接続は、既存caseとCT01〜12の差分を対にして別承認の実装で進める。生成途中の失敗copyと公開写像は、先行診断を壊さない固定契約ができるまで実行へ接続しない。

moduleを跨ぐprivate継続の受渡し、未解決dutyの外側custody、新LM03、専用build・compiled childの有限終了／stdio契約、friend撤去は残る。共通化のためにoptional bridgeや汎用phase acknowledgementをexportする、旧workflowを複製する、台帳を共有する変更は不採用のままである。

[部分生成回収・JoinCell生成公開の差分詳細設計draft-0.1](BEST_PRACTICE_NATIVE_DIAGNOSTIC_CONSTRUCTION_JOIN_DELTA_DESIGN.md)に、先行回収anchor／失敗facade、保護区間、failure copy不能時の拒否、同workの公開確定点とclose責務を対にして整理した。空seedは保持し、active用の段階検査を別にする。旧root外側のclose失敗でもdisposeを省略しない条件を含むが、保護区間・Promise生成・dispatch・driver変更はいずれも未実装である。

## 11 draft 0.1の静的照合

対象は旧ND rootのcreator／sample／wait／clean／guard／consume／execute／close、実classのscope生成／失効／予約解放、既存source試験とVK記録。記述を「現行の事実」「内部契約案」「将来の合成条件」に分けた。構文解析でqueue登録をexecutor内に持つjoin代入2か所とbridge呼出し4か所、sampleの等号／非増加、元delay、release前factsと後の理由確定、closeの同work合流を照合した。3文書のローカルリンク46件・表19個、CT01〜12の重複／欠落0、末尾改行・差分空白を確認した。source・試験・CHANGELOG・build／package設定の差分は0。製品moduleのimport・試験再実行・build・pack・native操作は行っておらず、以前の211件成功を今回の新規結果には数えない。

## 12 空の内部保持と同owner検査の限定実装

旧creatorで既存upper／writerを得た直後、依存rawの検査より前に6fieldの`controlPreparation`を作る。origin→RootControlLink→run用EmptyJoinCell→RunLink→cleanup用EmptyJoinCell→ResourceDutyの固定順で、各実参照を先にholderへ保持し、それからshallow freezeする。追加はholder 1個とreadonly object 6個で、upper／writerの子へdeep freezeしない。

| 内部型 | 今回固定する範囲 |
|---|---|
| RootControlLink | creator固有origin・同binding・同upper・同writerを保持。外部から採用しない |
| RunLink | 同rootとrun用空cellだけを結合。window／attempt／recordはnull、startClaimedはliteral falseで、旧startedの複製や新live claimではない |
| ResourceDuty | 同root／runとcleanup用空cellだけを結合。anchor／recordはnull、readerIdentityはundefined、retentionはempty |
| EmptyJoinCell&lt;K&gt; | run／cleanupの別kind、work／resolverはnull、dispatchStarted／entered／settledはfalse。§5のactive JoinCellとは別であり、Promiseを作らない |

`sameControlOwner`は引数5参照を生成時のcanonical constと先に比較し、次にholderの6参照を同constへ照合する。copy・foreign・Proxyはpropertyを読む前に拒否する。正規参照だけについてfreeze・全field・結合の一致を検査し、holder自体をcanonical identityの代わりにしない。constructorと既存execute入口の2か所で、失敗を既存のevidence_binding_mismatch／bindingへ写す。execute closureが同pins／holderを保持し、新しいpublic観測口を作らない。

旧runWork／cleanupWork・bridge・元sample・cleanup・claim・finallyは変更せず、新metadataは旧workflowの実行中も空のままである。旧4export・constructorの受付field・5faultを維持し、同window／attempt／record／readerへの実結合、先行Promise／resolverとdispatch、RetainedDuty、外側custodyは未実装とする。

[新試験](../tests/review/native-control-preparation.test.ts)はsourceから閉じたprefixだけを取り出す試験用fixtureで、同owner正対照と27拒否、hook 0、9変異拒否、6部分生成prefix、semantic型拒否6件を確認する。部分生成のcatchは試験側だけにあり、製品の生成失敗copy／回収の保証ではない。[compiled検査](../tests/review/fixtures/compiled-native-control-preparation.mjs)は固定dist JSの同prefixと宣言非公開を検査し、製品側へfriendやexportを追加しない。旧試験併存の計222件・compiled計6本、梱包範囲と初回の試験側失敗は[検証記録](E2E_BEST_PRACTICE_NATIVE_CONTROL_PREPARATION_2026-11-16.md)に記載する。
