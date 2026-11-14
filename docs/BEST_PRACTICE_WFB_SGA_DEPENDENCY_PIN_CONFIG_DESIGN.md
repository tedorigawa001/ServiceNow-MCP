# WF-B SG-A後：依存pin方式・実効設定の確認境界

Version: draft-0.2 / Date: 2026-11-14 / 読取り基準HEAD: `f127741`。対照対象H0／H1は[対照計画§3](BEST_PRACTICE_WFB_SGA_PARALLEL_TIMEOUT_CONTROL_PLAN.md)のまま変更しない。 レビュー修正基準HEAD: `67d3a87`。

draft-0.1のレビュー修正：記述の誤りはなかった。§6のC1（`createVitest`→`resolveConfig`）は、設定だけを評価する別起動に限らず、通常の`vitest run`がそのまま通る経路でもある。対照計画の主対照P9／P8と、これまでの全体検証もこの経路を通るため、その副作用の扱いを主対照の起動承認の範囲として§6に明記した。条件・gate・禁止事項は変えていない。

Status: **詳細設計のみ。pinの採取・検証器実装・設定の起動評価・試験再実行は未実施。** 通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[通常並列対照計画§4・9](BEST_PRACTICE_WFB_SGA_PARALLEL_TIMEOUT_CONTROL_PLAN.md)と[supervisor設計](BEST_PRACTICE_WFB_BODY_LIVE_SUPERVISOR_FAULT_DESIGN.md)。本書は依存と設定の本人性を比較する方法を定めるもので、実施前gate全体の完了・供給元の真正性承認・正式証拠発行ではない。

## 1 三つの層と今回の静的根拠

| 層 | 今回読取りで分かること | それだけでは分からないこと |
|---|---|---|
| 宣言 | package.jsonのNodeは`>=22.12.0`、Vitest／TypeScript等はrange指定。lockfileはv3で、Vitest 5.0.3／TypeScript 5.9.3等のversion・resolved・integrityを保持 | 実際に起動するNode、展開済み依存の内容・実解決先・変更の有無 |
| 静的設定 | vitest.config.tsのunitではworker数・testTimeoutを明示していない。real-hostにはmaxWorkers=3・30,000msがある | CLI／環境／継承／default適用後のunit設定・実際のpool・worker数 |
| 実行時 | 将来の同一runner／workerから得る実効設定・適用先test・実解決記録 | 今回は起動していないため全て未採取。過去の成功時間やCPU数で補完しない |

PT1〜3のtest sourceとtests/setup.tsの静的読取りでは、対象testのtimeout／worker数を上書きする記述は見つからなかった。setupにはtest用ServiceNow URLを設定するbeforeAllがあり、今回実行していない。静的検索は全実行経路での非変更証明ではない。

ローカルnode_modulesのVitestコードも**テキストとしてだけ**読んだ。`dist/chunks/index.DpLw24bj.js`にはbrowserでない場合の`resolved.testTimeout ??= ... 5e3`、fileParallelism=false時にmaxWorkersを1へ写す処理、設定解決からAPI tokenを供給する処理がある。`dist/chunks/cli-api.C4x4GGip.js`のcreateVitestはresolveConfig後に開始処理へ進む。これらのchunk名・内容の実体pinは未実施で、公式配布artifactとの一致も確認していない。API利用可否・設定取得の正規hookは後続の読み取り確認が必要である。

## 2 固定単位・比較の範囲

固定単位を、①Node／起動chain、②依存code image、③HEADごとのsource image、④trial固有の可変状態、⑤同runnerの設定観測に分ける。①②はH0／H1で同じ内容を使い、③は指定HEADの差を保持し、④はtrialごとに独立、⑤はそのtrialへ結合する。

- version文字列、PATH上の名前、lockfile、package metadataだけの一致を「実体pin済み」としない。
- 内容hashの一致は同じbytesの比較証拠であり、署名・供給元の信頼・安全性の承認ではない。供給元の真正性調査やtrust rootの承認を再開しない。
- 既存installationから比較用imageを用意する案を優先し、npm ci／install、Nodeの取得・更新、archive取得／展開、package lifecycle scriptを暗黙の準備に含めない。必要なら別承認へ戻す。
- pin／copy／設定観測は実施前gateを満たす将来作業である。本書に期待hashの実値・承認済み供給artifactを捏造して埋めない。

## 3 Node実体と起動chainのpin

将来の起動前確認では、実行に使うNodeの絶対path、symlink列、最終realpath、file種別、byte長、内容SHA-256を保持し、実起動processが報告する実行binary・Node版・platform／architecture・runtime version群と同じtrialへ結合する。path・mtime・inode・versionのいずれか一つで内容同一性を代替しない。

| 対象 | 固定方法 | 拒否・未確認条件 |
|---|---|---|
| Node binary | 事前レビューした同一binaryを全trialで使用。起動前／終了後に同じ実体を照合 | 同版でもbytes／architecture差、link先差、読み取り途中の変更、終了後の不一致 |
| 起動wrapper | 既存のbdo／proxy使用有無、npm／npx等のchain、実ファイル・argv・working directoryを固定 | wrapperを迂回して別起動にする、alias／PATHだけから同一と推定する |
| preload／解決条件 | Node options・loader／preload・module解決条件・許可された環境入力の有無と供給元を確認 | 未把握のimport／require hook、外部code注入、秘密を含む未知値。勝手に除去して実行しない |
| native／OS要因 | 関連するnative addon・外部libraryがあれば依存image／環境記録に含める | Node本体hashだけでOS・ABI・動的library全部を固定済みとしない。未確認はUnknown |

Nodeのversion表示や設定dumpを得るためだけの起動も、今回行わない。将来も同じ既存起動chainから採る。npxによる不足packageの自動取得や、shellの別Nodeへのfallbackを許可しない。既存pathが不適合でも、設定変更して通すのではなく停止する。

## 4 依存code imageの供給・内容固定

提案する供給は「レビューした同じ既存依存imageから、trial専用の独立copyを供給する」。共有の可変node_modulesを4trialへそのまま渡す方法は、内容・cache・token等の状態混入を除けないため、それだけでは適合としない。copyの作成方法・保管場所・書込み責務は未承認であり、今回作成しない。

### 4.1 内容manifest

manifestは依存rootからの相対path、種別、byte長、内容SHA-256を固定順で記録する。JS／JSON／wasm／native addon・実行時resource・nested package・package.json／exports／binを含む。実行されるhelperを「補助file」として除外しない。

固定順はpathのUTF-8 byte順、区切りは`/`に正規化する。fileの内容はraw bytesとし、改行・大文字小文字・JSON keyの書換え等で同じhashへ寄せない。時刻情報を内容hashに混ぜず、実行可否に関係するfile属性は別fieldとして比較する。symlinkはlink自身の参照先記述と、解決された供給先の結合を保持する。

symlink／実pathの脱出先は、宣言済みのtrial source root・依存root・Node供給root等の許可範囲だけ。許可root外のglobal module・別worktree・前trial・home内codeへの依存は停止対象である。外部rootを見つけて自動承認／再帰走査しない。pathの相対化で脱出を隠さず、別trialの絶対prefix差と内容差を分ける。

件数・総読取byte・file当たり上限・scan時間・再確認費は実装前に有限値を確定する。現時点では値と費用上界が未導出なのでUnknownであり、無制限walk／hashを許可したgateにはしない。

### 4.2 lockfile・展開物・可変状態

| 証拠 | 役割と限界 |
|---|---|
| package／lockfileの内容pin | 宣言・解決予定の固定。lockのintegrityは展開後directoryの各file hashではない |
| 依存imageの内容manifest | 比較に使う実code／resourceの同一性。installationのversion表示だけでは代替不可 |
| package位置とversion対応 | root／nested packageの違い、optional／platform依存の有無を明記。H0／H1で差があれば不適合 |
| cache／report／token等の可変状態 | code manifestへ混ぜず、既知の生成先・初期状態・所有trialを別記録。未知fileを後付けで除外しない |
| scan開始／終了・runner開始前／終了後の確認 | 内容変化・供給先変更を検知。不一致trialは採用せず、最初の状態と責務を保持 |

同一versionの異なる展開物、symlink先の交換、copyの欠落、native resource差を拒否する。raceを排除できない供給は、前後hash一致だけで保護された不変snapshotとは主張しない。書込みの排他／変更禁止の運用契約は別途必要である。

hash scan自体がfilesystem／page cacheや負荷へ影響し得る。同じscheduleで両HEADへ適用し、pin費を記録する。OS page cacheをcoldと称したり、cache flush・OS設定変更を加えたりしない。codeのimport／emit／試験warmupはpin作業に含めない。pin scanの時間と開始前負荷採取の区間も別記録し、時間を対照から隠さない。

## 5 実解決先の確認境界

実解決記録は「どのimporterから、どのspecifierを、どのmodule方式／conditionsで解決し、どの供給fileに到達したか」を固定する。単一directoryからVitestやTypeScriptの名前だけをresolveした結果を、全worker・全importの実解決証拠にはしない。

最低限、起動wrapper→runner entry、runner／config loader→設定とplugin、worker→test／setup、test／fixture→TypeScript・Vitest・transitive helperを区別する。aliases・exports・nested package・symlink・transform経路も同imageの範囲へ結合する。builtinはNode実体に結合し、filesystem moduleと混同しない。

静的な候補の列挙、将来のruntime resolverの観測、実際にloadしたfileの観測は別fieldである。後二者を安全に供給できる正規観測点は未確定。観測のために新しいloader hook・別resolver・global monkey patchを入れる案は、未変更主対照ではなく別の観測artifactとしてレビューする。候補解決が正しくても、実loadの照合が欠ければUnknownのままとする。

必要な実解決先がmanifest外、同名packageの別内容、HEAD間で異なるmodule条件、読み取り不能、動的解決の未観測なら適合を認定しない。未知importをネットワーク取得や外部code許可で補完しない。

## 6 設定確認は三段階に分離する

| 境界 | 取得するもの | 実行／副作用の扱い |
|---|---|---|
| C0：静的読取り | 元設定file／package script／setup／CLI予定・環境入力の宣言、source pin | 設定をimport／評価しない。今回の確認はここまで |
| C1：同runnerでの設定解決 | 正規merge・project継承・default適用後のunit設定、値の由来、解決元のpin | 設定・plugin等のcodeが動く境界。実装・起動評価の別承認と終了ownerが必要 |
| C2：worker／testへの適用 | 実poolとworker identity、PT1〜3の収集fullName・個別override・適用timeout、変更の有無 | 同じtrialへ相関。root設定dumpだけでworker適用を確認済みにしない |

ローカル配布コードのcreateVitest／resolveConfigを呼ぶ行為はC0の読取りではない。設定解決はViteのplugin処理やAPI token供給経路を含み、存在しないtoken fileを生成・書込みする分岐もある。現在の環境でその分岐を通るか、既存tokenがあるかは確認していない。token fileを探索・読取り・hash化せず、値を設定dumpへ載せない。

「設定だけ取得」のために別のrunnerを先に起動する、通常configのcopyへoverrideを書き足す、API／cache等を勝手に無効化する方法は、同一条件の確認として扱わない。副作用が必要／不明なら、実行前に範囲と承認を確定し、元の比較条件と両立しなければ停止する。正式発行口や製品のtoken／permitを利用しない。

C1の副作用は「設定だけの評価」に固有ではない。通常の`vitest run`も同じ`createVitest`→`resolveConfig`→開始処理を通るため、対照計画の主対照P9／P8（未変更HEADを既存の起動経路で実行するもの）も、これまでの全体検証（maxWorkers=3）も、この設定解決とplugin処理・API token供給経路を通っている。したがって次を区別する。

- **主対照の起動に含まれるC1**：未変更の起動経路が元々持つ副作用であり、主対照の実行承認の範囲として扱う。その副作用を避けるために設定・起動経路を変えると元条件ではなくなるので、変えない。
- **別途承認が要るもの**：主対照とは別に起動する設定だけの評価、C1／C2の値を取り出すための観測の追加（hook・dump・別runner）。

token fileを生成・書込みする分岐が通常の`vitest run`で実際に通るかは確認していない。token fileの探索・読取り・hash化は引き続き行わず、通るかどうかを主対照の起動前に確かめる方法も、token値に触れない形で別途定める。過去の全体検証がこの分岐を通ったかどうかも未確認であり、副作用がなかったとは主張しない。

正規観測点で必要値を取り出せない場合、独立した推測値・手書き設定の写し・過去runのdumpで埋めない。C1／C2の供給機構と通知失敗時の保持責務は、次の詳細化・fake検証対象として残す。

## 7 元の5秒期限を確認する方法

1. **宣言のまま保持**：対象3test・unit設定・setup・起動argvにtimeout変更を加えない。`--testTimeout=5000`を足して結果だけ同値にする方法も採らず、「未指定→元default」を保持する。
2. **解決値を確認**：同trialのunit／Node環境で解決後testTimeoutが5,000msであることと、その由来を取得する。real-hostの30,000ms、browser側default、hookTimeoutを取り違えない。
3. **適用先を確認**：PT1〜3のfullName、test個別option、worker側runtime設定、setup等による変更の有無を照合する。必要な適用値／通知が欠ければ5秒維持を実証したとはしない。
4. **時間と設定を区別**：5,000msの設定確認は、同期処理を5秒で必ず中断できるOS保証ではない。timeoutの実観測時刻・test return・runner終端は別に採取する。元timerを置換・resetしない。

5秒はtest一件全体に対する元の期限で、PT1／PT2の内部反復へ新しく5秒ずつ与えない。準備をtest外へ移す、test分割、新await／yield、factory／module共有による短縮を加えない。PT3のfake内部60秒や、compiled旧対照の実60秒は適用根拠に使わない。

## 8 既定並列度を確認する方法

worker数は次の三つを別々に記録する。

| 値 | 確認方法・比較条件 |
|---|---|
| 宣言値 | unitのmaxWorkers／fileParallelism等の指定有無、CLI／環境入力を保持。未指定は`unset`として記録し、CPU数や3で埋めない |
| 解決値／上限 | 同runner・同projectのdefault適用後の値とpool設定、sequence／seed・isolate・maxConcurrency等を取得。自動値が未具体化ならその段階も区別 |
| 実割当 | 同trialのworker作成／退出・test割当から、worker identity集合・peak・開始順を取得。poolがthreadならPIDだけで同一workerとしない |

H0／H1は**同じP9同士、または同じP8同士**で比較する。P8はfile数が一つ少ないので、P9と同じ実割当数になると仮定しない。実効CPUの見え方・自動worker上限がHEAD間で変われば、不一致をoverrideで直さず比較不適合とする。

禁止する補正は、`--maxWorkers=1/3`、`--no-file-parallelism`、pool／isolate／sequenceの切替、CPU affinity・優先度変更。real-hostの3workerや、全体回帰のmaxWorkers=3成功をunitの既定値へ流用しない。実割当の供給が欠ける場合も「未指定なので同じ」とはしない。

## 9 同trialへ結合する非実行pin記録案

記録案は認証／実行権限のない値に限る。実体の期待値を外部入力で差し替え可能な登録口や、診断summaryから正規証拠へ昇格する入口を作らない。

| 区分 | 必須の結合・値 |
|---|---|
| identity | 計画版、trial ID、H0／H1のfull commit、P9／P8とcase manifest、観測artifact有無 |
| toolchain | Node実体の供給元identity・内容、wrapper chain、runtimeの実行実体照合、platform／architecture |
| dependencies | lock／image manifest identity、実解決記録の供給元、許可root、native／optional差、前後の変更検査 |
| configuration | 元config・setup・argvのpin、環境入力方針、project、C0／C1／C2の到達段階と未確認項目 |
| deadlines／parallelism | 対象ごとの5,000msと由来、宣言／解決／実割当、hook等の別値、変更有無 |
| terminal | pin照合の成否・不足理由、採取失敗・race・通知未達、所有者と未解放責務、確認時刻のclock domain |

環境は許可keyと安全な比較方法を事前固定する。環境全量・秘密の平文・秘密値のhashをdumpしない。未知のpreload等を勝手にunsetして通さず、その入力方針が決まるまで未確認とする。保管先・閲覧・保持期間や各記録の上限は実施前に確定し、今回採取・保管操作を行わない。

## 10 拒否・失敗時停止と後続gate

静的なpin候補確定→供給image／起動chainの確認→承認済みrunnerでC1→workerへC2供給→同trialの終了後再確認、の順を提案する。これはまだ起動可能なscheduleではない。開始時負荷採取、終了owner、外側時間枠、保管、設定評価の副作用の許容範囲が未確定なら、C1へ進めない。

pin不一致・供給元混入・解決漏れ・設定値差・未採取は、原因や欠けた境界を固定して比較不適合／Unknownとして保持する。自動再解決・install・cache共有・設定補完で成功へ復帰しない。起動後に判明した場合は、後続trialを開始せず、承認済みの停止／cleanup ownerへ責務を渡す。そのownerとの実接続・SG-Bは本書で承認しない。

後続の純粋fake受入案は、同版異内容、symlink脱出、nested package混入、scan途中変更、importer違い、pin前の実行要求、未知環境注入、同値overrideによる由来差、real-hostの期限混入、実割当未採取、別trialの設定dump、通知throw／解放未確認を個別に拒否すること。現段階ではfixture・検証器・試験を作成しておらず、成功件数はない。

## 11 未確認事項・今回の変更範囲

既存Node／依存artifactの実内容pin・信頼承認、scanの有限上限と費用、変更排他、C1／C2の正規供給hookと副作用の抑制／承認、実割当観測、終了owner／外側枠・保管条件は未確認。OS／ABI全体の再現性・任意負荷での期限内成功はUnknownのまま。これらを宣言だけで充足済みにしない。

本MDと親2文書の参照だけを更新する。実行binaryのhash採取・依存tree scan・対象依存のmodule import／resolver実行・config評価・tokenの読取り／発行・copy作成・導入・build・試験再実行・実process対照・設定変更・実接続／実通信・Pushは行わない。今回の確認はsource／宣言の静的読取りと文書整合だけで、正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。

文書整合として3文書のローカルリンク11件・表20個の列数・末尾改行・差分空白と変更対象MD3件を確認した。package／lockfileの宣言値との一致も静的に確認したが、展開物・Node・実解決先のpinやC1／C2の起動評価ではない。作成時点でコミット・Pushは未実施。

## 12 後続の終了owner・時間枠設計（2026-11-14）

[終了確認・外側時間枠・cleanup予約の詳細設計draft-0.1](BEST_PRACTICE_WFB_SGA_TERMINATION_OUTER_BUDGET_DESIGN.md)で、C1を含む主対照起動より前に保持するowner、部分生成・worker／stdioの終端と未確認責務、候補の外側枠を具体化した。pin／post-pinの費用は未導出のまま、候補予約に収まると実証したものではない。§6の主対照内C1と別起動評価の承認区分を維持し、今回は実装・pin採取・設定評価・再実行を行わない。

## 13 後続のprovider／clock確認契約（2026-11-14）

[provider／clock確認契約・操作一覧と費目所有draft-0.1](BEST_PRACTICE_WFB_SGA_PROVIDER_CLOCK_COST_OWNERSHIP_DESIGN.md)で、固定供給元・実体／実load／scope・clock品質の確認境界と、pin費・取得費・境界観測費・失敗保持のownerを整理した。source／型定義の静的整合を実providerの証拠に昇格せず、C0／C1／C2とtoken非読取り・別承認の境界を変更しない。選択未承認・Unknown・各閉鎖条件・調査保留を維持し、実体pin・getter・設定評価・採取・再実行は未実施のままとする。
