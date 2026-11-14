# WF-B SG-A後：通常並列3件timeoutの基準HEAD対照計画

Version: draft-0.3 / Date: 2026-11-14 / 読取り基準HEAD: `3149f1f`。レビュー修正基準HEAD: `7a25f48`（draft-0.1）／`67d3a87`（依存pin設計の参照追加後）。

draft-0.1のレビュー修正：記述の誤りはなかった。レビューで実行・照合した事実として、§3の件数の見込み（P9のH1で924件、P8で815件）が実測と一致したこと、§2の部分一致の注意が実際に別caseへ当たること、計画の条件を満たさない参考時間を§10に記録した。計画の条件・閾値・判定・gateは変えていない。

Status: **計画のみ。実装・試験再実行・採取・実process対照は未実施。** 元の各test 5,000ms・既定並列度を維持する。通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持し、実接続・実通信・設定変更・Pushを行わない。

根拠は[SG-A検証記録§5・8](E2E_BEST_PRACTICE_WFB_SUPERVISOR_SGA_2026-11-14.md)。親は[supervisor設計§7・10〜11](BEST_PRACTICE_WFB_BODY_LIVE_SUPERVISOR_FAULT_DESIGN.md)。これは実比較器への接続・SG-B・BL-Cの正式受入とは別の切分け計画であり、それらの実施承認ではない。

## 1 現在の証拠と未確定事項

| 記録 | 結果・解釈の上限 |
|---|---|
| SG-A作業中の関連9file・通常並列 | 883成功・3失敗、計886件、59.74秒。3件はtestの5,000ms timeout。開始時負荷・同条件基準HEAD対照なし |
| 同実行の終了後負荷 | load平均10.16／8.78／8.76、利用可能CPU 10。**開始時負荷ではなく、原因証明でもない** |
| 直列の診断対照 | 期限不変・maxWorkers=1で成功。その後の最終版908件も成功。通常並列の成功へ読み替えない |
| レビュー時の関連9file・既定並列 | load平均約5で908件成功、3件は未再現。開始前5秒の連続観測・当初失敗との負荷適合は未確認 |
| レビュー後の全体回帰 | maxWorkers=3、354file／18,769件成功。別の並列条件・集合であり、当初の3件の原因を確定しない |
| 別系統のABBA旧対照 | 旧childの60秒到達でcontrol_deadline／exit 2、終了確認済み。新childは起動せず比較不能。3件のtest timeoutとは別 |

残課題の表現は「当初3件は失敗、後続条件では未再現、原因・再現条件未確定」とする。解消済み・環境起因・製品退行のいずれにも現時点では確定しない。元失敗は未コミット途中版（当時のSG-Aは71件相当）を含むため、保存済み最終HEADをその失敗artifactと同一と扱わない。

## 2 対象3件・5秒の開始点

fullNameはdescribe＋展開済みtest名を固定し、部分一致検索だけで別caseを代用しない。実際に「reenter」の部分一致はPT1／PT2のほか、probe-body-bundleの`BC12/13 … every reenter point`にも当たる。

| ID | ファイル／fullName | 元の観測・最初に区分する位置 |
|---|---|---|
| PT1 | `tests/review/probe-body-live.test.ts`：`B03 BC06..11 Initial live construction without bind or execution > keeps earlier ownership and diagnostics at every reenter boundary` | 5,933ms。BC06〜11のcheckpoint反復全体、factory／prepare／inspect・assert／finite検査を区分 |
| PT2 | `tests/review/probe-body-seed.test.ts`：`B03 body seed: prior shell/carriers and BC01..05 only > handles every construction boundary with fixed reenter` | 7,975ms。BS／BCのpoint反復全体、factory／prepare／inspect・assert／fixed検査を区分 |
| PT3 | `tests/review/body-live-loader.test.ts`：`BL-B synthetic-only sequential ESM load session > binds the first TS input to base and reserves a unique URL before publishing a namespace` | 8,362ms。load session生成と初回loadの前後を分ける。実I/Oではなく注入write／namespaceの試験 |

5秒は各testの元のVitest期限であり、PT1／PT2の内部反復ごとの期限ではない。test分割、反復ごとのdeadline更新、expect削除、重い準備をtest外へ移す変更はしない。同期反復がevent loopを占有すると、timeout通知や終了観測が5秒より後に届き得る。上表の総時間だけから「5,000ms時点でどの反復だったか」は分からない。

PT3のfake `ops.now() = 0` と内部60,000msはloaderの合成guard用であり、実時間のtest 5,000msを置き換えない。PT1／PT2も実通信・実workerを使用する対照に変更しない。

## 3 基準HEADと作業量を混同しない二つの対照

| 名前 | 固定commit | 役割 |
|---|---|---|
| H0 | `a9d1e4caf033d675532e99e956724ce91199c47b` | 保存済みSG-A初回版。SG-A試験93件を含む。**当初の途中版失敗の完全再現用artifactではない** |
| H1 | `3149f1fd516b563024d22d12b1114bed8ddf4f54` | 本計画の対象版。レビュー追加後のSG-A試験109件 |
| Hpre | `51d763bc2f4648975eac11fa6196b0e32cb58250` | SG-A追加前の履歴参照。SG-A試験が存在しないので9file主対照の基準には使わない |

今回の静的差分確認ではH0／H1間で、対象3file・下記共通8file、`snapshot-read-composition-fake.ts`・`body-live-esm-loader.ts`、`tests/setup.ts`、`vitest.config.ts`、package／lockfileは不変だった。H1の差分はSG-A試験16件とCHANGELOG／文書で、kernel／protocolは不変。これは実行結果や負荷影響の不存在を実証するものではない。

### 3.1 P9：通常の関連9fileを維持する主対照

固定順の入力file manifestを次とする。実際のworker配分・開始順はrunnerの結果として別採取し、この列挙順を実行順とは仮定しない。

1. `tests/review/body-live-supervisor.test.ts`
2. `tests/review/body-live-compare-verdict.test.ts`
3. `tests/review/body-live-loader.test.ts`
4. `tests/review/body-live-migration.test.ts`
5. `tests/review/probe-body-live.test.ts`
6. `tests/review/probe-body-seed.test.ts`
7. `tests/review/probe-body-bundle.test.ts`
8. `tests/review/probe-body-bind-fields.test.ts`
9. `tests/review/probe-body-pin-returned-closed.test.ts`

H0は記録上908件、H1は同集合なら追加16件分の924件が見込まれるが、H1の924件を今回実行した値にはしない。将来の収集結果でcase manifestを照合し、差が説明できないときは比較不適合とする。同じ9fileでも93件と109件のSG-A workload差があるため、P9は**各HEADの通常workload同士の対照**であり、同一仕事量の速度比較ではない。H1の試験をH0へ上書きする、H1の16件をskipする等の補正はしない。

### 3.2 P8：同一仕事量で照合する補助対照

P9から1のSG-A試験だけを外した共通8fileを、H0／H1の未変更sourceのまま使う。件数は現行記録の差分から815件を想定し、将来の収集結果を別確認する。設定・既定並列度はP9と同じに保つが、file数8／9という同時負荷の差を明記する。

P8で両HEADが同じ結果なら、共通経路のsource差による退行仮説を弱める材料になる。ただしP9の負荷再現・通常並列受入・SG-Aを含む保証の代わりにはしない。P9に差が出た場合の原因切分け用で、最初からfile数を減らして通常並列の合格を得る用途にはしない。

## 4 固定する実行条件・変えてはいけない条件

- Nodeの実行binary・版・CPU architecture、Vitest／TypeScriptの実解決版、依存内容、環境変数の許可keyと値、起動wrapper／working directoryを両HEADで揃える。秘密値は保存せず、必要なpinができなければ比較不能とする。版番号だけで依存内容が同一とはしない。
- 元の `vitest.config.ts` を使用し、unit projectのworker数は**未指定の既定動作を維持**する。`--maxWorkers=1/3`、`--no-file-parallelism`、pool／isolate／sequence変更、timeout上書き、fake timer化を主対照に入れない。
- 設定中のreal-host projectのmaxWorkers=3・30秒は対象3件の条件ではない。P9／P8の対象はunit projectであり、全体回帰の3worker成功をその既定並列条件へ読み替えない。
- CLIだけでなく解決後のworker数、fileParallelism、pool、isolate、sequence／seed、testTimeout、hookTimeout、setup・project名を採取する。既定の実効worker数がHEAD間で違えば不適合。CPU数からworker数を推測して埋めない。
- 各trialは独立のrunner・worker・一時領域とする。前trialのimport状態・emit artifact・dist・永続cacheを採用しない。同じ新規状態を用意するためのセットアップも記録する。事前warmup・事前emitで準備費を隠さない。
- H0／H1は追跡sourceが各commitと一致する隔離copyを使う将来案とする。現在の作業treeをcheckout／resetして切り替えず、他の作業変更を混ぜない。保存・copy作成・依存導入は今回行わず、実行時に依存導入や設定変更が必要ならそこで停止して別承認を求める。

起動形は「同じ既存runnerへP9の9file（またはP8の8file）を明示、期限／並列度のoverrideなし」。通常経路やpackage scriptを切り替えるためのcommand例ではなく、本計画に実行用scriptは追加しない。

## 5 開始時負荷の対照・有限の採取順

将来の採取は各trialの起動前5秒から同じ1秒間隔で行い、起動直前snapshotを必須とする。起動直前snapshotは最後のsampleで、spawnまでの間隔は1,000ms未満に限る（[終了確認・外側時間枠設計§4.3](BEST_PRACTICE_WFB_SGA_TERMINATION_OUTER_BUDGET_DESIGN.md)）。開始後だけ、または終了後のloadを開始時の代用にしない。現在はloadも採り直していない。

| 項目 | 同じ位置で記録する値 | 限界・拒否条件 |
|---|---|---|
| identity | trial ID、H0／H1、P9／P8、source／manifest pin、Node／依存／runner設定 | 欠けるpinを既知として補完しない |
| 起動前 | UTCと単調時刻、load 1／5／15分、利用可能CPU数、同じ5秒区間のCPU busy、free memory | free memoryをmemory pressureと同一視しない。取得不可はUnknown |
| 実行中 | 同じ1秒間隔、親／今回所有workerのCPU・sampled RSS、test開始／完了時刻・worker ID | 全OS processや他アプリ名・command lineを収集しない。sampling欠落を0扱いしない |
| 終了時 | 最終sample、case別結果／時間、exit／stdio close／worker終端、採取上限 | 末尾が欠ければ未採取として残す。timeout caseだけを選んで保存しない |

負荷適合のdraft基準は、隣接するH0／H1で利用可能CPU数・実効worker数が一致し、起動直前のload1／CPU数の差≤0.10、load5／CPU数の差≤0.15、起動前5秒CPU busy平均差≤10 percentage pointsとする。これは比較条件の事前ルール案であり、製品のcap・性能SLO・任意負荷での保証ではない。取得不可なら適合を認定しない。基準を変更する場合は結果を見る前に計画を更新し、観測後の閾値緩和をしない。

将来の主対照はH0→H1→H1→H0の**固定4trial**、直列に実行する。各trial内部の並列度は変えない。前trialの終了確認後だけ次へ進む。負荷不適合・未採取・中断も4trialの記録に残し、都合のよい成功だけを集める追加再試行はしない。P8を行う場合も別枠の同じ4trialで、P9の失敗／非適合を抹消しない。追加runは別の判断・承認とする。

この順序は本計画のHEAD対照であり、compiled旧／新loaderのABBAではない。外部アプリ停止、OS優先度・CPU affinity・電源設定変更、負荷生成、他processのkillで条件を作らない。自然な開始条件が揃わなければ比較不適合のまま報告する。

## 6 最初の遅延位置・観測の段階分離

**主対照P9／P8は未変更HEADの実行を優先**する。現行のtest結果だけで分かるのはtest全体の時間・失敗名であり、内部の最初の遅延位置は未確認。以下の細分観測は、別途承認が必要な試験専用の観測実装案で、今回追加していない。観測を導入したartifactを元HEADそのものと称さない。

| 対象 | 固定する局所区間・進行identity | 残す最小情報 |
|---|---|---|
| PT1 | test entry→73checkpoint反復（静的列挙数）→test return。各pointのBC番号／boundary、factory、prepare、inspect／assert、finiteの前後 | 順序index、現在区間、最後の完了区間、区間別累積時間／最大時間、5秒到達を初めて観測した位置 |
| PT2 | test entry→92point反復（BS15×4＋BC00の2＋BC01〜05の5×6）→test return。各pointの固定名、factory、prepare、inspect／assert、fixedの前後 | PT1と同じ。元のpoint順と全expectを保持 |
| PT3 | test entry、load session生成前／後、初回load前／await復帰、観測assert、重複拒否の前／後、test return | constructorでの同期source解析／emitを含む区間と、初回loadを混同しない。内部を細分できない場合は広い区間のままUnknown |
| 共通 | runner起動、file import／collection、worker割当、test開始、test終了、runner終了 | startup／import待ちとtestの5秒内を区別。file名だけの総時間から内部遅延を推定しない |

時刻は親の単調時計とworkerの時計を別domainで記録し、差分だけを同domain内で計算する。UTCで相関しても、別processのmonotonic値を直接減算しない。test entryの観測時刻は参考であり、実際の5秒期限のownerは元Vitestのまま。観測hookがdeadlineを再設定しない。

「最初の遅延位置」は、入口と出口の両方が採れた区間、または入口のみで退出未確認の区間として表現する。5秒を跨いだ位置と、最も時間を使った区間は別fieldにする。5秒時点にtimer通知が来なかったことを「遅延なし」とせず、同期処理終了後に得た位置はその採取時刻を明記する。

局所保持は対象ごとの固定進行slot・有限な区間集計に限定し、無制限なpoint別stdoutを出さない。source本文・raw例外・owner参照・payload／認証情報は保持しない。workerが戻らず最終観測を得られなければ、最後の内部位置はUnknownのままで、親からheapを検査しない。出力上限・固定schema・外側採取／終了枠は観測実装前に別途確定する。

観測付き対照はH0／H1に同じ観測変更・位置を適用した別artifactとしてpinし、未変更主対照と結果を分ける。新しいawait／yield、pointのskip、factory／moduleの共有、assertの移動で時間を短くしない。観測費の非影響は未証明のため、観測付きだけの成功・失敗で退行や解消を断定しない。製品telemetryの有効化ではなく、telemetry調査保留は維持する。

## 7 終了確認を揃える

各trialで、test結果と、runner／workerの終了・stdio終端を分離する。次trialへ渡せるのは下表が揃った場合だけで、code 0や「Tests passed」だけでは不足する。

| 軸 | 必須の確認 | 未確認の扱い |
|---|---|---|
| test | PT1〜3のfullName・5秒期限・各結果、全manifestの完了／欠落、元assert維持 | test未到達・runner中断・test timeout・assert失敗を分ける |
| process | 今回所有runnerのexit code／signal／時刻とstdio close、所有worker poolの終端 | 親exitとworker終了を同一視しない。別trialのeventを流用しない |
| 出力 | stdout／stderrの接続・採取量・EOF／error・truncated、report受理 | 未採取を空出力0byteや成功へしない |
| custody | 所有一時領域・worker／groupの責務、必要な終了照会とその時刻 | 終端未確認なら後続起動・一時root削除をしない。回収不能を上位へ保持 |

実際に確認できる所有範囲だけを記録し、runner外の全OS process不在を主張しない。終了照会の手段・外側の有限観測／cleanup枠・取消時責務は、将来の実行前に承認済み契約へ固定する必要がある。現時点では未確定・未承認の部分があり、実行開始のgateを満たしたとはしない。SG-Aのfake結果をOS確認の代わりにしない。

testの5秒が過ぎたことを理由に、5秒ごとにrunnerを再起動したりdeadlineを再設定したりしない。外側枠はtest期限の延長ではなく、残る試験／report／cleanupを有限に観測する別費目。**compiled旧対照の60秒をこのrunnerの外側枠へ流用しない。** 未承認の強制終了・signal故障注入・専用child起動は行わず、それらが必要ならSG-B等の別承認へ戻す。

## 8 判定・停止条件

| 結果 | 言えること | 言えないこと／次の扱い |
|---|---|---|
| 負荷適合のH0／H1で両方未再現 | その条件では3件が再現しなかった | 当初の原因・恒久解消は未確定。失敗履歴を消さない |
| 両方で同区間がtimeout | 共通経路／負荷との関連を疑う材料 | 環境原因の確定ではない。未変更区間の費用・実行順の証拠を検討 |
| H1のみtimeout | 当該条件で差がある | P9にはSG-A workload差がある。直ちにkernel退行とせずP8等の対照へ分ける |
| P8は両方通過、P9で差 | workload／並列競合の仮説が残る | 並列度を下げて通常合格としない。因果は細分観測後に判断 |
| 開始負荷不適合／実効worker数差／pin欠落 | 同条件比較は成立しない | 成功もtimeoutも保存し、対象側だけの退行・基準側だけの不安定と断定しない |
| 終端／出力未確認 | 監視・cleanupの証拠が不足 | test結果と別の未確認失敗として保持、次trialを開始しない |
| 60秒旧対照だけtimeout | compiled ABBAが比較不能 | 本計画のPT1〜3の失敗件数へ加算しない。新経路失敗とも数えない |

終了後に閾値・対象case・worker数を選び直して成功集合を作らない。期限を維持してもtest分割・準備移動で意味を変える案は本計画の範囲外。修正が必要になった場合は、証拠を先に整理して別の実装判断を求める。

## 9 実施前gate・今回の範囲

実行には、H0／H1のcopy・依存pin、実効設定採取、開始時負荷採取、所有runnerの出力・終端確認と外側枠、保管先・保持範囲を先に確定し、試験再実行の承認を得る。細分観測を行う場合は観測専用artifactの実装承認も別に必要。今回はそれらを導入・起動せず、採取／保管・process操作の権限を新設しない。

変更は本MDと親設計・SG-A検証記録への参照だけ。コード・fixture・CHANGELOG・package／lockfile／設定・通常入口は変更しない。build・試験・compiled比較器・梱包・実process対照は実行せず、今回の確認は文書と静的差分だけ。通常経路未切替・正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。

文書整合確認では3文書のローカルリンク9件・表20個の列数、P9の9file一意性と共通8file、固定3HEAD、静的反復数73／92、末尾改行・差分空白を確認した。変更対象はMD3件だけであり、対照実行・原因確定・timeout解消の確認ではない。本計画の作成時点でコミット・Pushは未実施。

### 9.1 主対照の起動に含まれる設定解決（2026-11-14追記）

主対照P9／P8の起動そのものも、Vitestの`createVitest`→`resolveConfig`（設定・plugin処理、API token供給経路）を通る。この副作用は未変更の起動経路が元々持つものであり、§9の「試験再実行の承認」の範囲に含めて扱う。設定だけを評価する別起動や観測の追加は、[依存pin設計§6](BEST_PRACTICE_WFB_SGA_DEPENDENCY_PIN_CONFIG_DESIGN.md)のとおり別の承認とする。token生成分岐が通常の実行で通るかは未確認のまま残す。

## 10 draft-0.1のレビューで得た事実（2026-11-14）

レビューでは、固定3HEADの40桁hash、H0／H1間の静的差分（実差分はCHANGELOG・文書2件・SG-A試験の4fileだけ）、`vitest.config.ts`のunit／real-host設定、PT1〜3のfullName、静的反復数73（6群×7＋fixedCounts計31）と92（60＋2＋30）、文書のリンク9件・表20個を照合し、いずれも本書の記述と一致した。

H1の未変更sourceでP9の9fileを既定の並列度で1回実行すると、924件全て成功し、SG-A試験は109件、残り8fileは815件だった。§3.1／3.2の件数の見込みは実測と一致した。ただしこの1回は、開始前5秒の採取、実効worker数の採取、H0との4trial交互実行、所有runnerの終端確認を行っておらず、§4〜7の条件を満たす対照ではない。

| ID | レビュー時の1回（load平均約4.0〜4.5） | 当初の失敗（終了後load平均約10） |
|---|---|---|
| PT1 | 372ms・成功 | 5,933ms・timeout |
| PT2 | 357ms・成功 | 7,975ms・timeout |
| PT3 | 950ms・成功 | 8,362ms・timeout |

当初の失敗はレビュー時の約9〜22倍で、load平均の比（約2.5倍）だけでは説明しにくい。ただし両者の負荷はそれぞれ開始前／終了後の別の時点の値で、条件も揃っていないため、この比から原因を推定しない。この表は§6の細分観測の要否を検討する材料にとどめ、§8の判定には使わない。当初3件は「失敗、後続条件では未再現、原因・再現条件未確定」のままとする。

## 11 実施前gate：依存pin・実効設定の確認境界（2026-11-14）

[依存pin方式・実効設定確認の詳細設計draft-0.1](BEST_PRACTICE_WFB_SGA_DEPENDENCY_PIN_CONFIG_DESIGN.md)に、Node／wrapper実体、依存code imageと実解決先、宣言・設定解決・worker適用の境界、元の5秒／既定並列度の確認方法を整理した。設定解決を読み取り専用と仮定せず、副作用と承認を分離する。H0／H1・元条件は変更せず、pin採取・設定評価・実装・再実行を今回承認したものではない。

## 12 実施前gate：終了確認・外側時間枠（2026-11-14）

[終了確認・外側時間枠・cleanup予約の詳細設計draft-0.1](BEST_PRACTICE_WFB_SGA_TERMINATION_OUTER_BUDGET_DESIGN.md)に、runner／worker／stdioの独立終端、先行custody・未確認保持、起点と候補の時間配賦を整理した。候補値は未承認で、元の5秒・既定並列度を変更しない。test失敗と監視失敗の次trial条件を分離し、late確認で成功へ戻さない。今回の文書は起動・強制終了・再実行・SG-Bの承認ではない。

## 13 実施前gate：開始時負荷採取（2026-11-14）

[開始時負荷採取・CPU busy・有限保持の詳細設計draft-0.1](BEST_PRACTICE_WFB_SGA_START_LOAD_CAPTURE_DESIGN.md)に、7frameの代替候補、累積5bucket差分の重み付きbusy、取得候補・上限・欠測・停止と上位保持を整理した。本計画の現行6点／S5 snapshot案とは別profileで、選択・統一は未完了。値は未承認候補で、OS負荷は今回採っていない。5秒test期限・既定並列度・負荷適合条件は変更せず、実行中／終端負荷の取得や試験再実行も未接続・未承認のまま残す。
