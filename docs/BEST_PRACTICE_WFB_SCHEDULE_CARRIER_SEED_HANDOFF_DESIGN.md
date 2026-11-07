# WF-B：固定schedule／carrierの実装coverageとS pending／handoffの所有境界

実装追記（2026-11-07）: [固定source辞書・SourceMapDraftのstrict値検査](BEST_PRACTICE_WFB_FIXED_SOURCE_COVERAGE_DESIGN.md#9-strict内部型純粋検査の実装境界)を別moduleへ実装。複数file・未実装行・不正参照を合成検査するだけで、実source hash・実施点対応・5 gapsの解消・実E／S要求量・発行には接続しない。

設計追記（2026-11-07）: [固定source対応表・内容hash照合・未実装行の詳細契約](BEST_PRACTICE_WFB_FIXED_SOURCE_COVERAGE_DESIGN.md)でSC01〜12の既存参照とmissing point、別対応記録、複数fileの全件照合と独立検証条件を具体化した。設計のみで、現行値契約・5 gaps・Unknownと実接続状態は変更していない。

Version: draft-0.5 / Date: 2026-11-07 / 照合基準HEAD: `a2f568e` / レビュー修正の基準HEAD: `3c0e7a4` / 値契約実装基準HEAD: `54619ef` / 値契約レビュー修正の基準HEAD: `c092694` / source対応設計レビュー修正の基準HEAD: `82ac0cb`。

draft-0.4のレビュー修正: 内容hashの置き場所を、行ごとから[source対応設計](BEST_PRACTICE_WFB_FIXED_SOURCE_COVERAGE_DESIGN.md)の固定ファイル辞書へ改めた（§3、§8、§11）。1行が複数ファイルにまたがると、1行1個のhashでは照合できないためである。現行の`sourceRevision`は形式だけを検査する値とし、照合に使わない。値契約と実装は変わらない。

draft-0.3のレビュー修正: 全行で`gaps`の5項目すべてを必須にした。未確認の範囲を少なく見せる行を受理していたためである。synthetic行の`paths`は1件以上必須、`slots`は空でも可と明記した。行から対象ソースを特定できない点を次工程の要件として記録した（§11）。

draft-0.3: §11のcarrier／coverage値契約だけを合成依存で実装した。以下の「詳細設計のみ」「実装を行わない」はdraft-0.2時点の設計範囲を指す。実schedule／pool供給・coverage証拠・S pending／handoffは引き続き未実装。[検証記録](E2E_BEST_PRACTICE_WFB_CARRIER_COVERAGE_2026-11-07.md)。

draft-0.1のレビュー修正: creditの保持slotの寿命を1回の呼出しまでとし、返却時に未確認を最終診断へ確定するようにした（§4〜§7）。返却できるcarrierを5状態20 variantへ改め、E取得済み・S未取得の未確認をC6として追加した。証拠の保管を指す語と区別するため`RunCustodySlot`とcustody cellを`RunCreditSlot`とcredit cellへ改名した。source revisionの照合方法とSH04の検証経路を定めた。設計のみで、実装状態は変わらない。

Status: **§11のstrict値契約だけを合成依存で実装。実schedule／carrier供給・coverage証拠・S pending／handoffは未実装。** 親は[seed bootstrap契約](BEST_PRACTICE_WFB_SEED_BOOTSTRAP_DESIGN.md)と[RC-C供給／予約設計](BEST_PRACTICE_WFB_RCC_PRIVATE_SUPPLY_BUDGET_DESIGN.md)。K0／Eのfakeにない実施点と、E要求量の導出に必要なS移譲の失敗経路を対にして固定する。

作業中・既存の変更を保持する。旧v1・正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持し、実装・core接続・実接続・実通信・実機操作・証拠発行・設定変更・Pushは行わない。本書の型名・生成点・commit primitiveは提案で、呼出し可能なAPIではない。

## 1 現状・非目標

現行`seed-bootstrap-fake.ts`はprivate Assembly内の数値budget・一度取得・論理owner状態を試験する。`E_REQ=5`とprepare2／terminal3はfixture専用で、実scheduleではない。`CLOSED`、共有`carriers`、`buildEntry`、`checkProfile`、`finish`、`stopped`の存在だけで、実生成順・allocation・返却費・cleanupのcoverageを証明したとは扱わない。

旧bridge費目modelの102／57／239、guard／gate移管27、`S_seed_candidate=75`はそれぞれ旧recipe・分解例のまま。新しいentry slot・carrier供給・S移譲を398に無料で追加しない。実E要求量・追加X／Δ・実S上界はUnknownである。

今回定めるのは、固定値の供給・診断DATA・privateなcredit責務の境界である。実署名・鍵・外部承認サービス・台帳ファイル・実source／rootの取得を追加しない。coverageの記録を署名済み証拠や実行permitと呼ばない。

## 2 固定schedule：最小anchorとE後のbodyを分ける

| 対象 | 供給元・読取可能時点 | 拒否・未確認時 |
|---|---|---|
| `EntryScheduleAnchor` | 固定内部producerが持つbootstrap版・固定E要求量・対応するbody参照。K0は同private anchorの最小scalarだけを読む | caller申告・public summary・fake定数を採用しない。実producerと要求量の根拠が未確認なら入口は閉鎖 |
| `EntryScheduleBody` | 同anchorに結合した固定body。E取得後、E_prepareで有限検査する | model・版・step／経路coverage不成立は`raw_limits`。seed取得を始めない |
| `SeedScheduleBody` | 同constructionのEntryScheduleBodyが選ぶ単一の固定S上界・対応model。E後に検査する | 別版・同値copy・動的selector・旧75へのfallbackを拒否 |
| `CoverageManifest` | 固定source revision・実施点・費目／経路・試験根拠の対応記録。供給producerとbodyの組へ結合する | 全行対応の記録がない間はUnknown。digest／件数だけで検証済みにしない |

K0は成功／拒否とも抽象workへ計上しない基底境界を維持する。K0で全body・全coverage表を走査して、検査費を未取得Eへ後着計上しない。最小anchorの準備・読取と、body／carrierのmodule初期化・native費も未検証であり、無料とはしない。

E後の検査対象は固定field順のmodel／revision、有限step集合・経路集合、E_prepare／E_terminalとSの上界、対応するcoverageの版・状態とする。具体的なfield数・実slot数・係数は実施点の棚卸しで確定する。未確定を空配列・0・`complete`で補完せず、19項目の既存planへmodelや新capを追加しない。

公開の`registerSchedule`、任意body／coefficientの注入口、`fromSummary`、trusted-plan発行口は設けない。新しいpure helperが数値を計算しても、その返値自体はprivateな供給証拠ではない。実profileをreadyにする条件と、synthetic profileで内部契約だけを検査する条件を区別する。

## 3 実装coverage台帳の粒度と必須行

各行は少なくとも`source revision / symbol・実施点 / phase / producer / 費用所有 / 最大反復・slot集合 / 正常・拒否・部分prefix / 診断可能性 / 独立検証経路 / 未対応点`を持つ。source変更時はsymbolだけが同名でも再照合し、旧試験の件数を新行の証拠へ移さない。台帳は設計・検証の対応表であり、それだけでruntime identityを発行しない。

`source revision`はコミットハッシュにしない。台帳は自分を含むコミットのハッシュを持てないためである。対象sourceの内容ハッシュは、[source対応設計](BEST_PRACTICE_WFB_FIXED_SOURCE_COVERAGE_DESIGN.md)の固定ファイル辞書だけが持つ。各行は辞書のfile IDを参照し、試験がsourceから計算して辞書の値と照合する。1行が複数ファイルにまたがる場合も、行に1個のhashを持たせない。実行時には照合せず、一致しても発行権限や実行permitにならない。

| ID | 対応させる実施点・処理 | 費用所有 | 現在の根拠／不足 |
|---|---|---|---|
| SC01 | 元plan strict確立・元meter生成・配賦和 | 既存plan境界。取得前native費は別のUnknown | 既存parserはあるが新経路のbootstrap coverageではない |
| SC02 | anchor供給・K0容量比較／entry commit・拒否 | K0基底境界（抽象work外） | fakeの数値判定だけ。実producer／primitiveは未確認 |
| SC03 | E owner／診断slot・E_terminalの確保 | E_prepare。失敗unwindはE_terminal | fakeのownerBuiltは論理flag。実生成点・partial aliasは未対応 |
| SC04 | body読取・model／coverage照合 | E_prepare | fakeのcheckProfileは実bodyを読まない。実field・検査群を棚卸しする必要あり |
| SC05 | carrier poolの構築・freeze・供給・取出し | 構築／初期化は基底供給側のUnknown、E後の取出し／診断はE | fakeには共有carrierがある。実供給失敗・native費は未対応 |
| SC06 | S残量確認・未取得draft準備・S debit制御 | E_prepare | 未実装。S未取得時の費用をSへ付け替えない |
| SC07 | S debit後のPendingとcredit登録 | 登録・移譲制御はE、S本体の前払いはS | 同meter・同entry・同recordの結合は未実装 |
| SC08 | 移譲先owner・固定slotの部分生成 | commit済みS | 旧19 slotとの一致は未確認。新slot／初期化stepを別に数える |
| SC09 | transfer準備・同一性照合・単一commit | E_prepare／E_terminalへ排他的に割当て | 新しいwrapper・参照・claimの生成点と失敗prefixが未対応 |
| SC10 | E側alias退役・S側partial cleanup・未解決credit保持 | EとSの各担当だけ。二重課金なし | fake cleanupは実解放／Sの退役を証明しない |
| SC11 | first reason・観測prefix・不明計数・二次診断・返却準備 | E_terminal。S側対象のcleanupはS | fakeで部分確認。carrier供給不能・snapshot生成費は未対応 |
| SC12 | 正常handoff後のentry終端と上位run slotの継続所有 | entry退役はE、移譲先の責務はS以降 | owner不在／二重所有の負対照と全alias追跡が未実装 |

reflection・copy・freeze・wrapper・状態stepを旧modelへ無料で追加しない。1 checkへまとめるpredicate群は固定で列挙し、実装とoracleが違う粒度で数えない。キャリアの参照共有・同じmodel名・同じ金額はcoverage成立や所有権の証拠にはならない。

SC01〜12の全正常／拒否／部分生成経路を実施点と照合するまで、実E要求量は計算できた扱いにしない。非到達native故障や未確認の初期化費は別欄に残す。Unknownの行がある状態を、全fixture成功だけでcompleteへ昇格させない。

## 4 固定carrierの値契約と非authority境界

carrierは固定理由と取得事実・責務状態を示す不変DATAに限り、plan／meter／record／owner参照やinvocation identityを持たない。共有しても前callのcounter・first reasonを上書きしない。診断の表示値から`SeedGrantPending`を復元・採用する入口は禁止する。

将来の最小pool案は、4固定理由（raw_limits／raw_work／raw_overflow／raw_internal）×返却できる5状態（C0、C1、C4、C5、C6）＝20 variantの有限集合とする。bootstrap段の拒否だけに使うのでstageはplan段に固定し、値に持たない。C2とC3は呼出し途中の内部状態で、返却しない。これは新しいcarrierを実装・供給したという記録ではない。

| carrier状態 | E取得事実 | S取得事実 | 診断上の責務 | 返却 |
|---|---|---|---|---|
| C0 | 未取得 | 未取得 | なし | 可 |
| C1 | 取得済み | 未取得 | Sなし | 可 |
| C2 | 取得済み | 取得済み | entry pending | 不可（内部状態） |
| C3 | 取得済み | 取得済み | target側へcommit済み | 不可（内部状態） |
| C4 | 取得済み | 取得済み | logical credit退役済み | 可 |
| C5 | 取得済み | 取得済み | cleanup／責務終了が未確認 | 可 |
| C6 | 取得済み | 未取得 | entry側のcleanupが未確認 | 可 |

E未取得・S取得済みのvariantは認めない。poolは例外・自由文・key／offset・stackを含めず、coreはnot_called、readyはfalse、実coverage／native費はunknownを維持する。使用量を出せないcarrierはunavailableとし、0補完しない。C4も物理解放・GC・ゼロ化を意味しない。C5とC6は失敗責務を消すための表示ではなく、未確認のまま呼出しを終えて参照を手放した事実の記録である。呼出しの後に責務を持つ者はなく、解決済みとも呼ばない。

E取得前のpool準備・供給・拒否返却はK0側の基底coverageと対にして検査し、未取得Eへ付け替えない。E取得後の詳細snapshot／pool選択・entry拒否診断はE_terminalが所有する。pool自体を供給できない故障について、別carrierを無限に生成する回復はしない。固定出力の成立性が確認できなければ入口を開かず、上位予算owner方式などの別案は未承認のままとする。

## 5 privateな生成物とbinding

以下は内部型名の提案で、公開constructor／getter／receipt化をしない。

| 内部対象 | 生成時点・内容 | 権限と寿命 |
|---|---|---|
| EntryBootstrapOwner | E取得後。同invocation・元plan／meter・診断slot・entry credit | Eと未移譲Sの責務を保持。root／V／Nの証拠は持たない |
| RunCreditSlot | Eで準備する同constructionの上位private slot。最初はEmpty | 1回の呼出しの間だけ、entry終了後もtarget／未解決責務を保持する。呼出しの終了で寿命が終わる。global registryやruntime共有ではない |
| SeedDebitDraft | S取得前にEで準備する固定額・版・同plan／meterのDATA | 未取得。credit／owner生成許可はない。失敗でEが破棄 |
| SeedRecord | S debit commitに対応する同じprivate record | 同額の別record・公開projectionとは区別。active creditを参照してだけ利用できる |
| SeedGrantPending | S commit後。recordとentry・RunCreditSlotの同一性を結ぶ | handoff commitまでentryが唯一の利用責任者 |
| RecipientCandidate | Sで部分生成する移譲先owner・固定slot | staged状態ではSを独立利用できず、root／core開始も不可 |
| PreparedTransfer | 全binding・候補初期化・必要cleanup枠を確認した後にEで準備 | 同じexpected entry状態から一度commitするためだけの非公開材料 |

plan／meter／entry／record／credit cellの参照同一性と状態を組で確認する。structural equality・digest・金額・model文字列一致だけで混入を許さない。Sの所有者を切り替えるためのcaller callback、任意recipient、旧fake台帳の登録口、public summaryからのadoptは作らない。

fakeの既存factoryは数値budgetを新しく作る独立assemblyであり、実plan／meterを受領する供給元ではない。将来の合成issuerも別brand／別台帳に限定し、synthetic coverageの通過で実producerを有効にしない。

## 6 S debit・pending・handoffの状態と線形化点

privateなcredit cellを単一のauthorityとし、状態を`Empty → EntryPending → TargetActive → Retired`に限定する。EntryPending／TargetActiveの失敗では`Unconfirmed`へ進む場合を別に持ち、責任者と参照を同じRunCreditSlotに保持する。Emptyへ戻して同じSを再取得したり、TargetActiveからEntryPendingへ戻すABA型の再利用を認めない。cellは1回の呼出しの内部だけにあり、返却の準備で固定unwindを行って`Retired`か`Unconfirmed`へ確定する。`EntryPending`／`TargetActive`のまま返却しない。Sを取得しなかった呼出しではcellは`Empty`のまま終わる。

### 6.1 S commit前後

1. E取得後に、診断・RunCreditSlot・SeedDebitDraft・entry側pending格納場所を準備する。この準備費はE。draftの存在からS取得済みとは言わない。
2. 実schedule／coverageと同E／plan／meter、S残量、entry未終端、未取得claimを固定検査する。未導出profileや不足ならS debitせずEで拒否する。
3. 同meterへのS debitとEntryPendingの有効化を、外部から中間状態を観測できない固定commit境界で行う。commit前に必要なrecord／slotは全て準備し、この境界へallocation・freeze・callback・await・任意property setterを入れない。
4. このcommit境界は未実装である。複数のprivate storeを使う場合、途中に失敗し得る操作がないことと中間faultの扱いを証明する必要がある。証明できない場合は同一のauthoritative状態／journal等へ設計を戻し、「課金だけ済み、所有者なし」を正常化しない。
5. commit後はEntryPendingがSを所有する。entryはSを使ってRecipientCandidateを生成するが、candidateが生きていてもSのauthorityを二つにしない。S取得事実と全claimは失敗後も返却・再発行しない。

### 6.2 handoff commit

1. targetの固定slot初期化・必要なcleanup責務と、上位RunCreditSlotに継続保持するtarget参照を、非公開staged状態で準備する。E_terminalも残す。これらが途中ならhandoffしない。
2. PreparedTransferは同じentry／plan／meter／SeedRecord／credit cell、expected EntryPending、同target、未消費の状態だけに結ぶ。正しい金額でも別constructionを拒否する。
3. 失敗し得る型／identity検査・返却metadata生成・freezeはcommit前に終える。handoffの線形化点は、private credit cellのcurrentをpreparedなEntryPendingからpreparedなTargetActiveへ切り替える**一度の参照更新**とする。
4. active状態を唯一のauthorityにする。entry・target両方に同recordのaliasがあっても、commit前はentryだけ、commit後はtargetだけが利用できる。二つの独立boolを「順に書く」ことで所有者不在／二重所有の時間を作らない。
5. 一度切り替わったcellは元のexpected状態に戻らず、同PreparedTransferの再commitは拒否する。publicに返せるsummaryや共有carrierは、このcellを参照・変更できない。
6. commit後のentry参照退役が失敗しても、Sを取り戻したりtargetをentry cleanupで破壊しない。RunCreditSlotがTargetActiveを保持し、entry側の二次診断／E責務だけを別に終える。entryのローカル変数が消えることをtarget責務の終了とみなさない。

S debit commitとhandoff commitは別の線形化点で、同じ操作ではない。いずれも未実装・未検証であり、通常JSが同期に見えることだけをatomic性の証拠にしない。原子的境界内の故障を表現できない試験なら、その保証範囲を明記する。

## 7 失敗時の所有者・診断・破棄費

| 失敗位置 | Sの責任者 | 診断とcleanupの所有 |
|---|---|---|
| E／profile不成立、S commit前 | Sなし | first reasonとE取得事実を保持。draft／entry aliasはE_terminalで破棄 |
| S commit後・candidate生成前 | EntryPending | S未使用分は課金済みで退役、Eの診断／aliasとは別計上 |
| candidate部分生成 | EntryPending | candidate内slotのcleanupはS。entryが持つcandidate参照と診断はE。費目を二重計上しない |
| PreparedTransfer生成・検査失敗 | EntryPending | targetをstagedのまま固定破棄。transfer／entry aliasはE、target自身はS |
| handoff commit前の拒否 | EntryPending | 移譲0。S取得事実を消さず、同entryの固定unwindへ |
| handoff commit後のentry終端失敗 | TargetActive | Sとtargetは上位private slotが保持。entryのalias／E診断だけを処理し、Sをrefund／再取得しない |
| targetまたはentry側のcleanup未確認 | RunCreditSlotのUnconfirmed。Sなしならcellは`Empty`のまま | 呼出しの終了まで未完了対象をprivateに保持し、返却時にC5（Sなしの場合はC6）へ確定する。固定診断の成功だけで解決済みとしない |

Unconfirmedは、呼出しの間は外側のprivate slotが未解決の対象・責任を維持する状態である。呼出しの終了時には再試行せず、参照を手放して未確認のまま診断へ確定する。対象はJSの参照だけで、外部資源を持たない前提である。外部資源を持つ責務や呼出し後の保持が必要になれば、実行時台帳や上位移譲を別の明示契約で設計する。有限費用内で任意回数のcleanup再試行を始めない。

first reasonは後着のsnapshot／cleanup／entry終端異常で上書きしない。K0／E／Sのnot_acquired、観測済みdebit、使用量unavailable、logical retire、cleanup未確認を別軸にする。後着の不足で先行拒否を`raw_work`へ置換せず、coreは未呼出しのままとする。診断slotへroot・本文・raw例外やprivate owner参照を出さない。

## 8 E要求量・X／Δへの入力とready条件

この所有境界を使い、`E_req = E_prepare_upper + max(E_terminal_paths)`を実施点ごとに導出する。prepareの候補にはschedule/body検査、carrier選択、draft／credit slot準備、S取得制御、transfer準備を含める。terminalにはS未取得、entry／candidate各部分生成、handoff前拒否、commit後のentry参照退役失敗・診断不能の全prefixを含める。target自身のS所有費をEへもう一度加算しない。

追加entry slot・wrapper・pool供給・transferの費用はXと費目所有へ、target初期化／cleanupと旧S recipeとの差分はΔへ対応付ける。5、27、75、398からの逆算で実係数を決めない。実E要求量とS上界は、全slot集合・最大反復・全終端経路の独立計数が完了するまでUnknownとする。

ready条件は、SC01〜12の必要行がファイル辞書経由のsource照合／step／所有者／経路と対応し、K0・anchor・carrierの基底供給条件、E／Sの上界、privateなdebit／handoffの原子境界と失敗時責務、旧API／package負対照が確認できることである。単なるmanifestのcompleteラベルや総額一致でreadyにしない。現時点では条件を満たしておらず、実供給・core接続は閉鎖したままである。

## 9 将来の合成受入条件

以下は未実施の受入条件であり、既存fake試験の成功を流用しない。

- SH01：anchor/body/carrierの供給点・版・費目を独立に照合。取得前の未知処理をE／未取得Sで払わず、K0を実費0としない。基底native費の未確認は別欄へ残す。
- SH02：poolの全20 variantをstrict値として検査し、返却できないC2／C3、禁止のE未取得/S取得済み・raw field・mutable aliasを拒否。共有carrierからrecordやidentityを復元できないことを確認する。供給不能は専用assemblyで、native成功扱いしない。
- SH03：SC01〜12の実施イベントと別oracleを比較し、費目欠落・二重課金・check粒度変更・再walkの変異を検出。X／Δ・実上界がUnknownならreadyにならない。
- SH04：S容量の等値／1不足・overflow、draft生成拒否、S debit直前／直後の失敗を区別。同meterのdebitとpendingが対応し、課金済み・所有者なしの終端を出さない。検証経路：等値／1不足は合成issuer。overflowは`used ≤ cap`と先比較のもとで実入力から届かないので、純粋計算だけで確認する。
- SH05：candidateの各部分生成とPreparedTransferの各途中故障を検査。EとSの各alias／slot cleanupを一度だけ行い、先行診断・取得事実と未使用前払いを保持する。
- SH06：同entry／plan／meter／record／cell／targetだけを一度handoff。同値copy・別invocation・二重commit・再入・旧fake台帳混入を拒否し、commit前後にauthorityが一つだけであることを確認する。
- SH07：handoff後のentry snapshot／cleanup異常でSを巻き戻さない。呼出しの間は上位slotがTargetActiveまたはUnconfirmedの責務を保持し、診断carrierだけで未解決対象を捨てない。返却時にC5／C6へ確定し、未確認を解決済みにしない。
- SH08：root／V／N／frame証拠はまだ生成しない。core呼出し・実I/O・正式発行は0。旧K0/E fakeの5 unit・102／57／239 model・既存parser/core APIと配布境界を維持する。

検証経路は、schedule／carrier値はstrict値対照と独立算術、ownership・commitは合成issuerのprivate結合試験、部分生成／snapshot／cleanup／供給不能は固定scenario専用assemblyとする。共有prototypeの破壊や任意fault callbackを実入口へ追加する手段は使わない。各primitive内部まで故障注入できたか、境界前後だけかを記録する。

## 10 段階分割・今回の確認範囲

次はcarrierのstrict値契約とcoverage台帳の内部表現を、既存K0／E fakeや実供給と分離して検査する範囲が候補となる。その後にsource対応から実E要求量を導出し、Sのpending／handoffは合成issuerだけで段階実装する。新cap・上位予算owner・runtime供給の採用は本書で承認しない。

`a2f568e`のsourceと設計を読み取り照合し、今回はMDの参照先・空白だけを確認する。source／test変更、ビルド・新合成試験・計算器実行・実通信は行わない。anchorの信頼、poolの実供給費、K0基底、実E／S上界、private実装coverage・native反射／module初期化／OOM／実heap・CPU・GC／ゼロ化はUnknownである。正式発行口閉鎖・全体受付無効・調査保留を維持する。

## 11 合成専用strict値契約とcoverage内部表現

`tests/review/fixtures/carrier-coverage-core.ts`はnode:utilのproxy判定だけをimportする独立module。既存K0／E fake・実供給・budget・core・issuerへ依存せず、入力DATAを検査して切離し／freezeする。返値は常に`authority=none, ready=false, runtimeCoverage=unknown`。成功は値の適合だけで、取得・所有・source真正性・実施点対応・費用coverageの証拠ではない。

carrierの固定field順は`model, variant, reason, entry, seed, credit, usage, ready, runtimeCoverage, nativeCost, coreInvocation`。modelは`wfb-carrier-values-1`。variantはC0／C1／C4／C5／C6、reasonは§4の4種類、全20値を許す。entry／seedはnot_acquiredまたはacquired、creditは順にnone／none／logically_retired／unconfirmed／entry_unconfirmed。各variantの取得事実は§4と完全一致させる。C2／C3とE未取得・S取得済みは拒否する。usageはunavailableのみ、残りはfalse／unknown／unknown／not_calledに固定。C5／C6は未確認の最終診断で、呼出し後の責務保持や解放確認を証明しない。pool・選択器・発行口は作らない。

coverage外形の固定field順は`model, rows, ready, runtimeCoverage, nativeCost, entryRequirement, seedRequirement`。modelは`wfb-coverage-values-1`、rowsはSC01〜SC12をこの順で各1行、残りはfalseと4個のunknown。行は次の順で全fieldを要求する。

`id, status, sourceRevision, symbol, phase, producer, costOwner, maxRepetitions, slots, paths, diagnostic, verification, gaps`

- status=unknownではsourceRevision／symbol／maxRepetitionsはnull、phase／producer／costOwner／diagnosticはunknown、verificationはnone、slots／pathsは空。未導出量を0にしない。
- status=synthetic_onlyは対応記録用。sourceRevisionは対象source内容のSHA-256表現（64桁小文字hex）で、コミットIDではない。この値検査は実sourceとのhash照合を行わない。symbolは英字またはunderscore開始のASCII識別列（英数字・underscore・dot・colon、最大128文字）、反復は1〜1,000,000のsafe整数。これは表現上限で運用capや導出済み上界ではない。`paths`は1件以上必須とする。`slots`は空でもよい。slotを使わない処理の行があり得るためである。
- phaseはbefore_entry／entry_prepare／entry_terminal／seed／handoff、producerはplan／anchor／entry／carrier／seed／recipient／credit、costOwnerはbase_unknown／k0_excluded／entry_prepare／entry_terminal／seed／split_unknown。synthetic行のdiagnostic／verificationはsynthetic_onlyのみ。
- slotsはslot00〜slot63の最大64個、pathsはnormal／refused／partial、gapsはruntime_coverage／native_cost／source_mapping／ownership／cost_bound。各配列は記載した固定順の重複なし部分集合。全行でgapsの5項目すべてを必須とする。Unknown行は全fieldが未定で、synthetic行もsource対応・所有・費用上界を証明しないので、現時点ではどの項目も解消していない。解消を検証できる行が出た時点で緩める。未知点の自由文・raw例外は保持しない。

syntheticラベルやrevision文字列をprivate manifestへ昇格しない。SCごとのproducer／費用所有の実source照合、同producer／body結合、固定sourceから内容hashを再計算する独立試験、全経路の独立計数・実E／S導出は次工程である。本実装が生成するのは未信頼の対応DATAだけで、coverage証拠は発行しない。

現在の行には対象sourceのファイルを示すfieldがなく、symbolは`/`と`-`を受理しないので、行の情報だけでは内容hashの再計算対象を決められない。行とsourceファイルの対応は、[source対応設計](BEST_PRACTICE_WFB_FIXED_SOURCE_COVERAGE_DESIGN.md)の別の対応記録で持つ。本値契約の`sourceRevision`は64桁の形式を検査するだけの値で、辞書のhashとの照合には使わない。両者が食い違っても、どちらも検証済みにはならない。

objectはplain／null prototypeの固定順own enumerable DATAのみ。余分／欠落／symbol／accessor／独自prototypeを拒否。配列は標準prototypeのdense own DATAのみ、入力proxyはtrap前に拒否する。反射のnative費・OOM・module初期化は未計量で、有限件数は実CPU／heap／work予算の証明ではない。失敗返値は固定invalid_valueだけを持ち、入力・例外・key・offsetは出力しない。返値からS・record・identityを復元する入口はない。
