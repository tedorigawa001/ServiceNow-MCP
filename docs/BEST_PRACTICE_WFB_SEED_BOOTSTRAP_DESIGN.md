# WF-B：初期seed予約bootstrap・取得前費用と拒否診断の詳細契約

Version: draft-0.3 / Date: 2026-11-07 / 照合基準HEAD: `8dfc49d` / レビュー修正の基準HEAD: `f33623c` / K0／E fake実装基準HEAD: `3c53902`。

draft-0.3: K0／Eの有限内部契約・拒否状態を純粋fakeで実装した（§10）。E取得前後・二重取得・失敗後停止、先行理由とsnapshot／cleanup二軸、全625個の4操作列を合成照合した。[検証記録](E2E_BEST_PRACTICE_WFB_K0_ENTRY_FAKE_2026-11-07.md)。fakeの5 unit scheduleは実要求量・X／Δや実creditへ昇格させず、K0の実費・実profile・private供給はUnknown／未接続のまま。

draft-0.1のレビュー修正: K0を抽象workへ計上しないことを明記した（§2.1）。75の記号を、RP-Cの`S_candidate(V)`と区別して改名した（§3）。受入条件へ検証経路を付けた（§7）。設計のみで、実装状態は変わらない。

Status: **K0／Eの有限状態を純粋fakeだけで実装。実entry owner・受付primitive・新費用profile・private供給は未実装。** 親は[RC-C供給／費用・予約設計](BEST_PRACTICE_WFB_RCC_PRIVATE_SUPPLY_BUDGET_DESIGN.md)と[RP-C接続設計](BEST_PRACTICE_WFB_RPC_PRIVATE_VALUE_BRIDGE_DESIGN.md)。既存の有限model 102／57／239を実予約へ昇格させず、seedを取得する前に何が実施され、誰がその費用と拒否診断を持つかを定める。

作業中・既存の変更は保持する。旧v1・正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持し、core接続・実接続・実通信・実機操作・証拠発行・設定変更・Pushを行わない。

## 1 現行コードと解消すべき循環

- `raw-json-boundary.ts`は`readLimits`で19項目をreflection・copy／freezeした後にmeterを作り、plan64とwork配賦和を計上する。設定検査・meter作成以前の処理を、64 unitで事前受付済みとは呼べない。
- `Meter.spend`は不足時に課金を増やさず拒否する。失敗する課金操作自体の実行費／拒否wrapperを、取得できなかった予約で払ったとは扱えない。
- 有限modelのseed102はguard13・allocate22・seed_gate14・後続gate28・diagnostic10・clear15の費目和で、実行順ではない。guardとseed_gateを取得前に行うなら、その費用所有はseedでは成立しない。allocateは取得後へ移せるが、移すだけではguard／gate／拒否診断の問題は解決しない。
- `inspectBridgeReservation`は純粋な容量projectionで、実meterも初期creditも更新しない。呼び出して返った`ok=true`や102という値を、取得済みcreditとみなさない。

本設計は費用所有を、**最小の受付primitive K0 → entry bootstrap枠 E → seed枠 S → 後続credit**の一方向に限定する。K0の基底境界まで実証したと主張しない。K0自体を無条件に無料とする方式や、別の未取得予約へ同じ費用を再帰的に移す方式は採用しない。

## 2 採用案とtrust／coverageの境界

### 2.1 K0：最小の予算受付primitive

K0は、既にprivateに確立した同plan／同meterに対する固定の容量判定とentry課金commitだけを行う、抽象計量の基底候補である。callerのobject・profile・callbackを受ける公開primitiveは作らない。

| 許す処理 | 制約 |
|---|---|
| 元meterのcap／累積課金と、固定entry要求量の読取 | 同じprivate生成元のscalarだけ。未知objectのreflection、getter、文字列decode、全recipe列挙なし |
| 既存不変条件・残量との比較 | 非負safe整数・cap内の累積値と、固定要求量の整合を確認。可変長loop・動的profile選択なし |
| 残量差・成功時の加算 | `E_req ≤ cap−used`を先に確認し、成立した場合だけ加算する。先行費用を後から押し込まない |
| 成功commit | 同meterの累積課金とentry debit状態を同期に一度更新する。call間の非同期処理・callback・seed生成を挟まない |
| 不足時の拒否 | debit更新・新entry owner生成・seed生成なし。固定の拒否状態を外側へ戻す |

K0の処理は、成功でも拒否でも抽象workへ計上しない。`B_total`にも`E_req`にも含めない。拒否時は予算を取れないので、成功時だけEへ入れると同じ処理の扱いが結果で分かれるためである。

K0は新しい計測単位の基底であって、実CPU・native反射・allocationを0費用とする宣言ではない。既存Meterにこの契約が実装済みとも扱わない。K0の固定処理範囲・失敗経路・同meter結合を独立に監査し、抽象モデルの開始境界として受け入れる条件を確定する必要がある。

特に**entry debitが拒否された呼出しにも受付処理の費用はある**。課金commitが0であっても、実行費0／全処理が予算内とはしない。K0・元plan確立・最小拒否出力まで含めた完全なwall-time／heap上界はUnknown。この境界が未確認の間は、runtime-readyな入口を作らず、core接続も許可しない。

すべての拒否処理まで既存capで前払いする別の要件を置くなら、上位の既取得予算ownerが必要になる。それは新しい信頼前提・費目設計であり、本書だけで別予算やcapを増設する承認とはしない。

### 2.2 E：seedと独立したentry bootstrap枠

EはK0が受理した後にだけ有効となる、同じ`max_parse_work`内の専用枠である。第二の無制限budgetではなく、value枠・未取得seed・後続admit／tailから借りない。Eを知るためにbridge全recipe計算器を毎回呼ばず、固定のbootstrap要求量と供給元を検証対象にする。

Eの要求量を選ぶための最小情報は、bridge profile自身ではなく独立の固定bootstrap scheduleに属させる。E取得後に初めて、統合profileの版・coverage・ready状態、seed要求量を検査する。この分離により「profileを検査する費用を、その検査前のprofileが認めたseedから払う」という循環を作らない。bootstrap scheduleも未実装・未検証であり、その信頼性を本設計で承認しない。

同一cap内の累積値は`used = P_existing + B_total`、`B_total = E_charged + S_charged + admit_charged + tail_charged`とする。Eはbridge費の一部で、既存のbridge累積値へ含めた後に別枠として再加算しない。`P_existing+B_total ≤ max_parse_work`と元のparse/value配賦和を維持し、19項目planへ新capを追加しない。

`E_req = E_prepare + max(E_terminal_paths)`を候補式とし、E_terminalはprofile拒否、seed不足、部分owner生成失敗、handoff失敗、正常handoff後のentry参照退役を含む。各途中prefix＋失敗後処理を数え、bootstrap診断用の最後の枠を通常生成処理へ転用しない。係数はUnknownのままで、仮値0を入れてreadyにしない。

### 2.3 S：取得後のbridge owner生成・終了費

seed creditは、Eから費用を受けた検査／予約処理を通り、同meterへseed debitがcommitされた時点でだけ存在する。`InvocationOwner`、19 slot、後続claimはこの後に生成する。成功DATAの数値一致やpublic予約projectionを取得証拠として採用しない。

## 3 取得前／取得後の費目所有と102からの移管

| 処理・資源 | 費用の所有 | 拒否・未完了時 |
|---|---|---|
| 19項目planのstrict確立、元meterの生成 | 現行plan境界。native／取得前のcoverageは別のUnknown | 旧固定理由を維持。新bridgeやseedを生成しない |
| K0の固定読取・容量判定・commit／拒否 | 独立した基底受付境界 | 未取得Eやseedへ後着課金しない。未観測費を0にしない |
| 固定profileの供給・版／coverage検査 | E_prepare | 不成立ならE_terminalで拒否。seedなし |
| seed容量検査・seed debitの制御 | E_prepare | 不足でもEの診断枠は残る。seed課金0、seed実行費0とは言わない |
| entry診断slot・grant pending／handoffの管理 | E_prepare／E_terminalの排他的step | 同entryが失敗診断と未移譲責務を保持する |
| 19 slot／bridge ownerの生成 | commit済みS | 部分生成でもSのcleanupを一度実行し、Eが未解決creditを保持する |
| 後続admit／tail gate | S内の既存所有を原則維持 | 取得できなかった後続creditへ制御費を付け替えない |
| entry自身の一時参照退役 | E_terminal | seed_clearと別のaliasだけを外す。未使用Eのrefundなし |
| AST／bytes | 元parser／byte ownerの既存前払い | entry／seedに同じ退役費を再計上しない |

既存recipeの`seed_guard13`と`seed_gate14`は、取得前に置く処理としてEへ移す候補とする。`seed_allocate22`はS取得後、後続gate28・seed診断10・clear15はS所有のままとする。単純移管なら`S_seed_candidate = 102−13−14 = 75`、移管分は27である。

これは**所有の分解例であって、新しい実seed上界の承認ではない**。entry slot・bootstrap診断・handoff／部分生成処理・固定profile供給の追加費Xと、Sの実施点差分Δは未導出。候補全体は`(27+X) + (75+Δ) + 57 + 239 = 398+X+Δ`となり、398のまま収まるとはしない。entryの予約方式が変わる場合はこの分解も再検証する。

旧model `wfb-bridge-finite-work-1`・102／57／239・純粋API・既存goldenは変更しない。将来この移管を実装する場合は新しいmodel／profile版を用い、27をEとSへ二重課金したり、旧102から27だけ差し引いた75を確定値として採用しない。旧recipeの費目所属列を実行順へそのまま使わない。

## 4 固定状態遷移・一度取得・private供給

状態案は`BaseUnestablished → BaseEstablished → EntryDebited → EntryBuilding → ProfileChecked → SeedDebited → OwnerBuilding → HandoffPending → HandedOff`。任意の未移譲状態から拒否終端へだけ進み、同invocationで再取得・再準備しない。

1. 旧境界と同じ19項目・固定順でplanをpinし、元meterと配賦和を確立する。callerのlimitsを後から読み直さず、古い入口のplan64やwork対照を無断で変更しない。
2. K0の基底条件と固定bootstrap scheduleが検証済みでなければ、新経路は閉じる。成立している場合だけK0がE debitを一度commitする。この時点ではbridge owner、root、bytes copyはまだない。
3. Eを所有する`EntryBootstrapOwner`を生成し、E_terminalを確保したまま統合profileを固定検査する。数値recipeの成功や`runtimeCoverage=unknown`をreadyへ読み替えない。現行profileはこの段階で停止対象のままである。
4. Eで賄う固定処理としてseedの残量を確認し、同meterへseed debitをcommitする。成功直後のSはまずentry側の`SeedGrantPending`が所有し、まだbridgeへ移譲しない。
5. Sを使ってbridge ownerを生成する。部分生成したslot・aliasは同entryの固定unwindが識別できるように保持し、Sで賄う破棄とE自身の参照破棄を分離する。
6. 一度限りのprivate handoffで、同plan／meter・bootstrap invocation identity・seed creditを同じbridge ownerへ結ぶ。成功commitまでentryがSの所有者で、成功後はbridgeだけがSを所有する。handoff途中の失敗で所有者不在にしない。
7. entryは自分のaliasとE creditを退役させる。Eの残りをS・admit・tailへ移さず、未使用前払いとして保持する。その後の同parserからのroot借用は別の固定stageで行う。

K0の最小commit以外にもentry／seed commit、handoff commitを別々の線形化点として扱う。いずれもawait・caller callback・任意consumer・外部通知を挟まない。receiptの値が同じだけでは結合を認めず、元ownerのprivate参照・状態で検査する。

この段階のprivate証拠は**plan／meter／creditの出所だけ**を表す。root・完了V・N・frame成功を含む証拠はまだ存在しない。未取得のroot／V／Nはabsenceとして扱い、nullや0を成功値へ補完しない。`FramedRootBorrow`は後に同parserのframe後・finally前でだけ生成し、public inspect結果や再parseから作らない。

## 5 拒否診断・部分生成と解放責務

### 5.1 E取得前の最小拒否

E未取得時には、新しい可変診断ownerやfreeze済みwrapperを作る費用をEへ付け替えられない。新経路の候補は、最小の固定拒否carrierを事前に用意し、固定理由だけを返せる形とする。carrierは不変・secretなし・invocation identityなしで、証拠や再利用権限にはならない。共有可変診断slotや前回の計数を使い回さない。

固定carrierの準備・module初期化・返却に要する費用もUnknownであり、無料としない。その供給／寿命とK0までのcoverageを独立検査するまでは、新入口をruntimeへ開かない。OOM時にも必ずcarrierを取得／返却できるとは保証しない。carrierを使う設計が成立しなければ、上位予算owner方式など別案の設計・承認へ戻す。

E前の出力はplan段の固定理由、`entry=not_acquired, seed=not_acquired, core=not_called, bootstrapUsage=unavailable`を基本とする。元plan理由／配賦overflow／work不足が先行していれば保持する。詳細計数を返す費用・器が未確立なら公開totalを0へ補完せず、取得不能／未公開を明記する。元meterに観測済みprefixがあることと、それを安全に出力できることは別であり、後者を未確認のまま保証しない。旧RP-A／RP-Bの返却型・既存計数APIをこのcarrierへ置換しない。

### 5.2 E取得後の固定診断

E_terminalはE取得時に前払いし、profile／seed／部分owner／handoff拒否のどの枝でも残す。first reason、entry／seedの取得状態、観測できた課金prefix、未使用前払い、二次診断を固定項目だけで保持する。raw値・key／offset・stack・本文／root参照は入れない。診断snapshot失敗を先行理由へ上書きせず、再builderで無制限に回復しない。

E commit直後からentry ownerの生成完了までは、元の外側フレームが同meterとdebit済み状態を保持する。EntryBuildingの途中で失敗した場合もE取得を取り消さず、部分entry参照をE_terminalで退役させる。診断owner自体を生成できなければ、最小carrierの別variantで`entry=acquired, seed=not_acquired, bootstrapUsage=unavailable`と固定`raw_internal`を保持する案とする。E未取得のcarrierへ戻して取得事実を消さない。このvariantの供給／退役coverageも受入前提であり、成立しないnative故障まで出力保証しない。

| 拒否点 | 固定理由候補（plan段） | 責務 |
|---|---|---|
| 元plan／既存配賦の拒否 | 元の`raw_limits / raw_overflow / raw_work` | 新E／Sなし。先行理由を変えない |
| K0／bootstrap scheduleの不成立・未検証 | `raw_limits` | carrierの最小拒否。readyに補完しない |
| E容量不足 | `raw_work` | E／Sなし。bootstrap使用量は取得不能で、費用0とはしない |
| E commit後のentry部分生成失敗 | `raw_internal` | E取得は保持、Sなし。外側が部分entryの責務を終える |
| E後のprofile版・coverage不成立 | `raw_limits` | Eで診断・退役。Sなし |
| seed要求量のchecked算術overflow | `raw_overflow` | E取得済み、S未取得。後段開始0 |
| seed容量不足 | `raw_work` | E取得済み、S未取得。EをSへ返却しない |
| S commit後の部分owner／handoffの予期しない失敗 | `raw_internal` | Sのpartial cleanupを一度行い、entryが未移譲責務を保持する |
| 先行拒否後の診断／参照退役異常 | 先行理由を維持、二次診断は別 | 成功値・取得済み風のcreditを返さない |

entryがSを保持したまま失敗した場合、未使用Sは課金済みとして退役し、owner生成が途中ならSのcleanup枠を使う。entry自身の追加aliasはE_terminalで外す。同じslot・creditを両方のcleanupへ割り当てない。未確認の退役責務が残る場合はその状態を保持し、診断だけで解放確認済みとはしない。ここでの退役は参照責務の終了であり、物理メモリ消去・GC・OS解放確認ではない。

## 6 private供給／実装coverageとの対照表

| 境界 | 必要な実装証拠 | 現在の状態 |
|---|---|---|
| K0 | privateなcap／used、固定要求量、拒否時副作用なし、commit一度、固定carrier供給 | §10のfake状態だけ確認。実primitiveはUnknown |
| E確立 | E取得前にbridge ownerを作らない。terminal枠を他用途へ流さない | §10の論理状態だけ確認。実生成／費用coverageは未実装 |
| profile供給 | 毎callの経路列挙を14 unitへ含めない。固定値の生成元・版・coverageが独立に確認できる | 数値recipeだけ実装済み。実供給はUnknown |
| 費目移管 | guard13／seed_gate14と追加X／Δを各実施点・経路へ一度だけ割当て | 27／75は分解例。新上界は未導出 |
| Sとhandoff | 同entry／plan／meter、pending期間の所有者、重複・混入・失敗後再利用の拒否 | 未実装 |
| root供給 | frame後・同finally前、元V／N／rootとのprivate結合 | 本bootstrapからは未発行・未接続 |
| 寿命・診断 | E前／E後・S前／S後の全prefixと部分生成、carrier／診断不能の区別 | E前後のfake拒否・固定故障だけ確認。S／handoff・native故障は未試験 |

sourceの実施点へ対応付ける前に、19 slot／28 stepが新entryを含む全coverageだとはしない。entry slot・carrier・scheduleの追加は、旧ABIに無理に押し込まず別の有限集合として数える。新modelは算術oracle、実施イベントの独立計数、拒否／handoff各prefixの故障試験が必要である。既存oracle同士の係数一致だけでK0・E・Sを承認しない。

## 7 将来の合成受入条件

以下は接続全体の受入条件。今回は§10のK0／E純粋fakeだけを部分確認し、各項全体の完了とはみなさない。各項に検証経路を記す。純粋fakeと試験専用assemblyの結果を、実入力から到達した証拠として記録しない。

- SB01：元plan・meter確立前／K0拒否／E取得前後を区別。Eなしで新owner／root／seedを生成しない。固定carrierの供給失敗も成功扱いしない。検証経路：plan入力と純粋fake。carrierの供給失敗は試験専用assembly。
- SB02：K0の固定容量判定・commitで、等値／1不足・overflow・不正内部状態を別oracleと照合。拒否でmeter更新なし、成功は一度。K0の実行費が0という期待値は置かない。検証経路：等値／1不足は純粋fake。overflowと不正内部状態は`used ≤ cap`と先比較のもとで実入力から届かないので、fakeだけで確認する。
- SB03：E_prepareと全E_terminal経路を独立計数。profileを読む前にEが取得済み、診断費不足による後着課金・未取得Sからの借入れ・value枠借入れ0。検証経路：純粋fakeと独立計数。
- SB04：guard／gate移管の二重課金・欠落を検出。旧102／398対照を残し、新modelのX／Δが未導出ならreadyにならない。検証経路：純粋計算と旧model対照。
- SB05：S不足、ownerの各部分生成失敗、handoff前後の混入・再入・二重取得を確認。同pending期間に所有者不在・二重所有なし。検証経路：S不足はplan入力。部分生成とhandoffの失敗は試験専用assembly。
- SB06：E前は最小固定理由と取得不能、E後は観測prefix・未使用前払いを保持。未取得とobserved zeroを混同しない。snapshot／cleanup故障でfirst reasonを上書きしない。検証経路：E前はplan入力。snapshot／cleanup故障は試験専用assembly。
- SB07：同plan／meterと同bootstrap identityだけを移譲。root／V／Nはまだ発行しない。公開summary、同値copy、旧fixture台帳、別invocationからの混入を拒否する。検証経路：private供給の実装後の結合試験。
- SB08：旧v1・RP-A／RP-B・RC-A／RC-B・有限費目modelのAPI／課金／配布境界を維持。新core呼出し・実I/O・正式発行は0。native故障やGC確認を合成数値から主張しない。検証経路：既存試験と配布境界の検査。

## 8 段階分割・未確認／承認待ち

K0／Eの有限内部契約と拒否状態は§10の純粋fakeで検査した。次は実施点に対応する固定schedule／carrier・entry slot／終端経路のcoverageと新係数を導出し、Sのprivate pending／handoffは別段階にする。実profileがUnknownでも検査できる内部契約と、未検証profileでは実供給を開始しないgateを区別する。

K0を抽象計量の基底として受け入れる条件、固定carrierの成立性／供給費、entryのslot数・schedule係数、X／Δと新予約上界、元meterへの実結合、native reflection・module初期化／OOM・実heap／CPU／GC／ゼロ化はUnknown。上位の既取得予算ownerや新capが必要になった場合の採用は未承認である。

本書は論理上の費用依存を一方向にし、未取得seedで取得前処理を賄わない契約を定めたものに限る。基底費用を無料と証明したり、完全な拒否経路上界を検証済みにしたものではない。これらが未確認な間、正式発行口閉鎖・全体受付無効・Unknown・調査保留・core未接続を維持する。

## 9 今回の照合範囲

draft-0.1作成時は`8dfc49d`のsource、有限model・親設計・検証記録を読み取り照合し、MDの参照先と空白だけを確認した。当時の実装・ビルド・新合成試験・計算器実行・実通信・保管操作の記録ではない。今回のfake検証は別記録とし、既存941件成功を本bootstrap SB01〜08全体の成功へ流用しない。

## 10 K0／E純粋fakeの実装境界

配置は`tests/review/fixtures/seed-bootstrap-fake.ts`。外部import・実台帳・reader／clock・runtimeとの共有はない。private classと閉じたfacadeで同assemblyのfake数値budgetと取得claimを所有し、callerのcap／parser課金／bridge課金をprimitive整数として検査する。object・数値文字列をcoerceせず、privateな同状態でだけ一度debitする。budget snapshotやcarrierの同値性を生成元の証拠にしない。

APIは`createSeedBootstrapFake(cap, parser, bridge)`と、固定の故障名だけを選ぶ`createFixedBootstrapFake(scenario)`。facadeには`acquireEntry / buildEntry / checkProfile / reject / close / inspect`だけを置く。schema・profile・実meter・任意callback・rootを注入する引数や、summaryから採用する入口はない。Assembly自体はfactory呼出し時にJS objectとして作るため、`ownerBuilt=false`は**論理状態**であって実allocationがE前にない証明ではない。

modelは`wfb-k0-entry-fake-1`、scheduleは`fixture-5-unit-1`。要求量5は試験専用で、prepare2（buildとfake profile確認各1）／terminal3（診断・cleanup・credit退役各1）に分ける。E取得ではfake bridge課金を一度5増やし、利用時は重複課金・refundしない。K0処理は成功／拒否とも抽象workに入れず`k0Work=excluded`とする。これは実K0のCPU費0を意味せず、全結果の`nativeCost/runtimeCoverage=unknown, ready=false, seed=not_acquired, coreInvocation=not_called`を固定する。

有効なbaseでは等値を許可し、1不足は`raw_work`でdebitなし。base確立時の不正整数・cap超過は`raw_limits`、safe和overflowは`raw_overflow`。後二者の不正内部状態は実入力経路ではなくfakeだけの対照である。E後は`EntryDebited → EntryBuilding → EntryBuilt → FakeProfileChecked → Retired`の順を守り、順序違い・二重取得／生成／確認は固定拒否へ進む。fake profileの成功は実profileのready判定ではなく、Sを発行する操作もない。

最初の拒否は終端診断へ保持し、その後の操作は同じ固定結果を返して再開しない。正常close後の再取得等は別の操作拒否`raw_limits`とし、完了済み正常診断を後から書き換えない。closeは同じ終端DATAを再表示するだけでcleanupを再実行しない。取得・build・profile・cleanup・credit退役の各観測は0／1、prepare使用は最大2、terminal使用は最大3で、繰返し呼出しで増殖しない。

E前の失敗は不変の共有carrierを使い、利用量はunavailableとする。carrierはprivate identityも前callのcounterも持たず、共有されてもbudgetを混ぜない。E commit後に固定build故障があれば`entry=acquired`を維持し、owner未生成のため利用量はunavailableのまま。別のfake budget観測で残るdebitと、carrierに出せないE使用量を区別し、取得不能を0へ補完しない。

owner構築後はcharged／executed／prepaidUnusedをfreezeしたsnapshotとして返す。prepaidUnusedはそのsnapshot時点の未実施前払いで、途中状態ではterminal用の予約も含む。終端時の未使用分は再利用・返却しない。first reasonを固定した後にsnapshot／cleanup異常を別軸へ保持し、cleanup未確認を成功へ補完しない。

固定故障は`entry_build_failure, profile_rejected, snapshot_failure, cleanup_failure, snapshot_cleanup_failure`の5種だけで、状態上の故障を再現する。native allocation／実snapshot／OS cleanupを故障注入したものではない。`simulated_released`もfakeの状態値に限り、物理解放確認にならない。carrier自体を供給できない故障、実module初期化費、X／Δ・本番E要求量・実credit／実plan結合・root供給は未対応である。

別の6状態の参照機械で5操作の長さ4の全625列を比較し、取得・順序違反・終端後再開／debitの有無と先行診断を照合した。BigInt容量対照はparser6値×bridge3値×境界3値の54組。固定故障と100回の後着呼出し、immutable／秘密非出力・package負対照も確認した。これらのfake成功はSB01〜08の実接続・native受入完了ではない。
