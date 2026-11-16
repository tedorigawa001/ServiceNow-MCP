# BG02 無bridge注入workflowの共有境界設計

Version: native-diagnostic-bg02-boundary-draft-0.4 / Date: 2026-11-16。
Status: VK01／02（§9）と旧rootの空Link／duty／JoinCell準備（§10）だけ限定実装・合成検証。resource／制御継続の実接続と新LM03は未実装。設計基準HEADは`a6dbe01`、VK限定実装基準は`02ed9f7`、空準備の基準は`02aac7c`。対象は[B-03設計](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)BG02で、[BG01](E2E_BEST_PRACTICE_NATIVE_DIAGNOSTIC_PURE_BG01_2026-11-16.md)の純粋state／43scenario抽出を前提にする。

共有したのはcleanupの理由優先順とnative事実の値判定だけである。bridgeを含むworkflow全体の移動、任意policyの注入、旧workflowの複製は採用しない。resource／制御境界の未解決条件を満たすまで新LM03入口を実装しない。

旧入口・旧試験・期待値・friend取得を維持する。通常経路未切替、正式発行口／C実行入口／body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留、LOAD6／LOAD7選択とAP01〜06未承認を維持する。実transport／worker接続・build設定変更・friend撤去・負荷採取・実process対照・実接続・実通信・実機操作・設定変更・公開・Pushは今回の範囲外。

## 1 現在の権限と生成元

[旧ND root](../src/review/abort-scope-evidence-native-diagnostic.ts)の非export関数`constructInjectedNativeDiagnosticWorkflow`は、無bridgeのND-02と実class／fake I/OのND-03を同じ実装で処理する。exportされるND-02 constructorは`raw`だけを渡し、ND-03のprivate driverだけが追加の`NativeStatusProbeScope`を渡す。fault引数も固定fixture以外から受けない。

[実class側](../src/servicenow/bounded-read.ts)は`#probeStatusAcceptance`内で同source／snapshot／lease／core、ready世代、attempt、active floorを所有する。scopeの`check`は同bindingを照合し、`accept`はnative実行中・未受理を確認してから同source consumerへ一度だけ渡す。旧NDが作る公開診断copyは、このscopeや実classのterminalの代用品ではない。

| ID | 現行のbridge呼出し位置 | 保持すべき順序と所有権 |
|---|---|---|
| BS01 | `stop`内の`bridge.stop` | upperへの先行理由記録と自tokenの同期失効が先。`notifying`で相互stopの再入を抑え、finallyで通知中状態だけを戻す |
| BS02 | `guard`内の`bridge.check` | 同bridge bindingの検査を先に行い、その後に自ownerのrevoked／primary／current／cleanup eligibilityを確認する。issue／consumeの複数箇所から同じguardを呼ぶ |
| BS03 | `consume`のpost内の`bridge.accept` | 自consume claimを先に消費し、anchor／record／cleanup／reader実参照、pre／postと元floorを確認した後だけ呼ぶ。復帰後もsample→guardを行ってから自accepted・consumedを確定する |
| BS04 | `execute`の取得直前の`bridge.check` | descriptorのstrict検査→attempt生成→phase取得→元floorのsample→bridge照合→Response観測の順。後段のcheckへまとめない |

bridge呼出しは上記4か所で、`check`は2か所、`accept`と`stop`は各1か所。BS02の動的呼出し回数を2回と解釈してはならない。bridgeが失敗すれば実class側は自身の先行理由・同期失効・close責務を維持し、native側も自tokenを破棄する。元windowのfloor到達は、実classではrun残時間が正なら`upstream_unavailable`へ写像し、全run期限到達だけを`deadline_exceeded`にする現行差を保存する。

## 2 共通化方式の選択

| ID | 方式 | 判定 |
|---|---|---|
| OP01 | 現行private constructorを別moduleへ移し、optional bridge／consumer／policy引数をexport | 不採用。旧rootだけの権限を一般の注入入口で受け付ける形になる。型非公開・`internal` comment・非同梱だけでは閉鎖にならない |
| OP02 | 無bridge版をcopyし、旧bridge版もそのまま残す | 不採用。sample／cleanup／issue／consume／sealの二重実装が生じる。新旧結果一致の試験だけで二重実装を正当化しない |
| OP03 | 既存ST cleanupへNDのowner／claimを接続 | 不採用。別の状態機械・brand・台帳であり、似たfacts形状でも待機・診断・発行順の同等性は成立しない |
| OP04 | 値だけの最小kernelを共有し、権限処理と制御frameは旧rootに残す | VK01／02のみ限定実装。BG01のfresh ownerを再利用し、旧workflowは1実装のまま。LM03全体の分離完了とは扱わない |

既存budget／scheduler callbackへbridge処理を隠す、global installer／登録口／lookupを作る、外部から渡された成功診断をbridge成功へ昇格する方法も不可。source文字列を複製・変換して別実装を作る方式や、新しいbuild前処理も今回の代替にしない。

## 3 先行する値kernelの境界

配置は[value kernel](../src/review/abort-scope-evidence-native-diagnostic-facts.ts)。moduleはstateからの型参照以外に依存せず、runtimeのsession・native prototype・Promise・clock・timer・reader・台帳を持たない。受け取る値はrootが自分のrecordから取得した原始値と固定facts／計数だけで、任意入力の正当性や生成元を証明する関数ではない。

| ID | 抽出候補 | 値判定とrootに残す検査 |
|---|---|---|
| VK01 | cleanupの理由優先順 | no-bodyは待機issueをそのまま返す。bodyはreader所有／closed捕捉不明→cancel未完了→cancel拒否→closed未完了／拒否→release失敗→待機issueの順。現行条件式を維持する |
| VK02 | confirmed cleanupの必要事実 | disposition／reason／wait_issue、kind、read=0、body時の所有／closed捕捉・cancel／closed fulfilled・release succeeded、固定操作数、no-body時の全操作0を判定する |
| VK03 | root側のeligibility | cleanupの存在・同binding／current／anchor、reader参照の解放済み確認、403／404、revoked／primary、claimとprivate台帳照合は旧rootに残す。VK02=trueだけでissue／acceptしない |

VK01の理由選択とsnapshot組立てを一つにしない。`before`に捕捉するcancel／closed事実はreleaseLock前、release結果は後である。releaseLock後にclosedを再読した値を使わない。VK02への入力化でnative getterやbudgetを新たに呼ばず、既存の固定計数と自recordだけを参照する。外部accessorを安全化する汎用normalizerや新しい診断writerを追加しない。

新helperの真偽値・理由は非権限の値であり、旧rootは自分の同一性検査を省略しない。失敗時に元recordやcleanupWorkを消す、新しいclaimを回復する、同値copyを同一物として扱う変更はしない。

## 4 Resourceと制御frameを残す理由

| ID | 現行で結び付いている処理 | 分離前に固定すべき条件 |
|---|---|---|
| CF01 | `clean`開始時のphase・writer pending・sample・cancel | pendingはbudget／scheduler／native callbackより前。結果だけを後で通知する方式は、同期callbackから観測するphase／診断を変えるため同等ではない |
| CF02 | `cleanupWork`と`runWork`のjoin公開点 | 現行はPromise executorでenqueueした後に代入され、通常のnative callbackより前に保持される。enqueue呼出し前の先行公開とは区別し、将来のprivate JoinCellとdispatch失敗責務を固定する |
| CF03 | `sample`の`last`／`sampling` | cleanup→issue→pre→postを跨いで同じ単調非増加履歴を使う。独立resource ownerとworkflow ownerが別々に残時間を保持しない |
| CF04 | `guard`とbridge受理の同期群 | BS02／03の位置、復帰後sample／guard、再入時の先行理由を保つ。外側wrapperがexecute前後だけをcheckする方式は不可 |
| CF05 | finallyのcleanup・自token退役・upper seal | HTTP／cleanup理由を保持しつつ自laneのteardownを区別する。実classのclose・予約返却は旧driverと実class側に残し、native側のconfirmedで代替しない |

[CF01〜05詳細設計draft-0.2](BEST_PRACTICE_NATIVE_DIAGNOSTIC_CF_CONTROL_RESOURCE_DESIGN.md)で、旧root内部の同owner Link／duty、元floor・join公開点、固定継続と失敗prefixの保持を具体化した。空の先行保持だけを§10で実装し、active JoinCellとdispatchは追加契約案のまま、現行のqueue保証へ遡及しない。moduleを跨ぐprivate受渡し、外側custodyと新LM03は未確定のまま、resource owner／phase acknowledgement／policy／stop／accept口を新たにexportしない。

## 5 Intrinsicとrealmの所有

| ID | realm | 現状と分離条件 |
|---|---|---|
| RL01 | 旧ND root | 現在は旧ND-02とND-03が同moduleの`injectedResponses`／`injectedStreams`を共有する。この2旧入口間の再利用拒否を保持し、片方だけ新realmへ切り替えない |
| RL02 | 将来の新LM03 unit root | 自module realmのprivate台帳を持つ。ownerごとのWeakSet初期化は禁止。同unit root内では複数owner間も再利用を拒否。旧realm・P・STへの台帳登録やclaim共有はしない |
| RL03 | 既存ST／開発assembly／本番runtime | 現行brand・台帳・停止／予算ownerを維持する。新unitのterminal・cleanup copy・summaryを受け取る採用口は追加しない |

共有候補は固定関数とreadonly値だけ。捕捉済みintrinsicを共有する場合もlive resourceの台帳とは分ける。旧rootのResponse／Stream／Reader、Promise／then／race／all／queueの捕捉順を保ち、owner生成時の再捕捉や実行中のinstance method再参照をしない。rootごとの捕捉へ変更する案は、元のmodule評価順・故障注入順を別途固定してから判断する。

fresh ESM URLだけで依存moduleのrealmが別になると推定しない。新旧の同一性はmoduleの固定生成元で検査する。realmを跨ぐ公開summary／tokenの不受理と、同realm内のResponse／stream再利用拒否を別に検証し、台帳非共有から全realm横断のnative物理object拒否が証明できたとはしない。

## 6 合成受入条件

受入条件は以下とし、今回の実施範囲は§9で区別する。独立oracleは旧runnerのactual出力から作らず、固定入力・故障位置・操作順と元floorから期待値を定める。[UN62台帳](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-un-01)と親設計FA01〜24は残す。

| ID | 対照 | 受入条件 |
|---|---|---|
| AT01 | VK01の理由競合 | 所有不明＋cancel拒否、cancel未完了＋closed拒否、closed拒否＋release失敗、release失敗＋期限、no-body＋待機issueを独立表で検査。区別可能な4つの隣接優先順交換を拒否する。cancel未完了／拒否は同じfieldの排他的条件なので、その1交換は等価として別計上する |
| AT02 | VK02のbody／no-body | body正常とno-body全操作0の正対照。各modeに必要なkind／facts／操作数／readを変更し拒否。既存no-body判定が使わないreader_owned／closed_capturedは新たに条件にしない。VK02=trueでも別binding／record／cleanup copyを旧rootのprivate検査が拒否する |
| AT03 | 旧入口の併存 | 旧ND純粋・ND-02・ND-03・compiled fixtureを削除／skipしない。旧4export・strict raw／descriptor・5faultを維持。新unitの成功を実class保証へ足さない |
| AT04 | 同readerと捕捉順 | module評価前のprototype故障注入と評価後の置換を分ける。同readerでreader→closed→cancel→release、read0、元floor、部分取得失敗の責務を保持 |
| AT05 | 旧realmの再利用 | ND-02内だけでなく、旧ND-02→ND-03と逆順の同Response（body有無）も対照にする。今回4caseを追加したが、新LM03や本番の正式bindingを検証したことにはしない |
| AT06 | 無bridgeのimport境界 | 将来の新LM03が旧root／bounded-read／bridge型・friendへ到達しない。static・reexport・dynamic・型・宣言／mapの混入を負の対照にする |
| AT07 | 制御frameの取消・期限・再入 | issue／pre／post、native取得途中、pending cleanupで元位置の故障を保持。stopは同期失効し、cleanupは元floorまで同join。late settleでseal済みcopyを昇格しない |
| AT08 | 閉鎖と費目 | fake budgetの元deadlineとwindowを変えず、新しいC/G/P/R会計・dispatch・読取を足さない。permissionsは固定7項目false、正式発行・fallback・body ack・Permitを生成しない |

VK01／02抽出の受入はAT01／02と旧source／compiled回帰を中心とする。AT04〜07のresource移行条件を値試験だけで通過したことにはしない。専用build、compiled child上限・外側時間枠・終了／stdio確認は親設計BG04の別gateであり、元5秒・既定並列度、旧比較child60秒、製品全体60秒を混同・延長しない。

## 7 次の実装範囲と残すgate

VK01／02の値kernelと旧rootへの接続は§9で限定実装した。VK03・bridge・intrinsic捕捉・realm・claim・queue／join・診断の組立ては旧rootに保持する。BG01のstate／pure runner、既存ST、実class、package設定は変更していない。

その後にCF01〜05のprivate制御継続とresource所有を再レビューし、新しい権限口なし・workflow二重実装なしで新LM03を構成できることを確定する。確定できない場合は値抽出までで停止し、bridge受付口や状態機械copyを黙って追加しない。BG02完了、UN62移行完了、friend撤去可、公開可とは判定しない。

## 8 draft 0.1の静的確認

基準の旧ND root、実classのscope生成／受理／close、ND-02・ND-03のsource試験と旧compiled ND-02、既存ST cleanupを読み、bridgeの4呼出し位置・共有される旧realm・join／sampleの保持点を対応付けた。構文解析でBS01〜04の呼出しを照合し、3文書のローカルリンク61件・表16個、新規27行IDの重複／欠落0、差分空白を確認した。source・試験・build／package設定・CHANGELOGの差分は0。製品moduleのimport、試験再実行・build・pack・native操作は行っていない。BG01の105件成功を今回の新規実行結果として再掲しない。

## 9 VK01とVK02の限定実装

`nativeCleanupReason`はreleaseLock前の`before`と後のrelease結果・既存wait issueから理由だけを返す。`nativeCleanupFactsEligible`はreadonly cleanup／固定5操作数から真偽値だけを返す。runtime exportはこの2関数だけで、stateへの型importはcompiled JSから消える。外部raw入力のvalidator・issuer・登録口ではない。

旧rootは元の理由確定点からVK01を呼び、snapshotとwriter更新を従来どおり自分で行う。`eligible`ではcleanup／facts存在・reader退役・403／404・同bindingを自分で確認してからVK02を呼ぶ。この局所照合で読むのは自recordの固定dataだけで、native getter・budget callbackを追加しない。`guard`のcurrent／revoked／primaryとBS01〜04、consumeのprivate実参照照合は不変である。

[独立oracle](../tests/review/fixtures/native-diagnostic-facts-oracle.mjs)は理由5,760通り・eligibility752通り、区別可能な優先順交換4件とeligibility変異3件を拒否し、排他的cancel条件の交換1件を等価として分類する。no-bodyの所有フラグ非検査と、型が固定falseであるread_started／read_pendingへの新しいruntime検査を加えない現行境界も維持する。

[値試験](../tests/review/native-diagnostic-facts.test.ts)・[旧root連続試験](../tests/review/native-diagnostic-facts-workflow.test.ts)を追加し、既存197件を変更せず、計211件が成功した。旧2入口間のResponse再利用4caseと、値判定に通るcopyがprivate provenanceの代わりにならない4caseを含む。[compiled値検査](../tests/review/fixtures/compiled-native-diagnostic-facts.mjs)と旧ND-01／02／03・BG01の固定fixtureも成功。初回試験側の失敗・負の対照・梱包dry-runと未実施範囲は[検証記録](E2E_BEST_PRACTICE_NATIVE_FACTS_VK01_VK02_2026-11-16.md)へ分離する。

CF01〜05、新LM03、専用artifactとcompiled実行／終了契約、friend撤去・AP承認は残る。値kernelの完成をBG02全体の完了や本番の正式binding保証へ昇格しない。

## 10 旧root内の空制御準備

[CF詳細§12](BEST_PRACTICE_NATIVE_DIAGNOSTIC_CF_CONTROL_RESOURCE_DESIGN.md#12-空の内部保持と同owner検査の限定実装)のRootControlLink／RunLink／ResourceDutyとrun／cleanupの空JoinCellを、旧creator内だけに追加した。holderへの先行保持、canonical実参照との照合とshallow freezeを確認し、既存execute closureで寿命を保持する。実window／attempt／record／reader、Promise／resolver・dispatchとは結合せず、既存runWork／cleanupWorkは不変である。

sourceと固定dist prefixの27拒否・9変異・6部分生成prefix、semantic型拒否6件、旧試験併存の222件とcompiled計6本を確認した。scratch fixtureの保持は製品の部分生成失敗回収の証拠ではない。配布非同梱・新権限口なしと未実施範囲は[検証記録](E2E_BEST_PRACTICE_NATIVE_CONTROL_PREPARATION_2026-11-16.md)へ分離する。CF実制御、LM03・専用artifact・friend撤去のgateは開かない。
