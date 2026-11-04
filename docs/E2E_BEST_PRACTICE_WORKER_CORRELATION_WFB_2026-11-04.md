# WF-B：相関観測による通常並列timeout・H5a／H5b切り分け

Date: 2026-11-04 / 調査HEAD: `b5f9933edb250fc96682057d3d434638c2636311`。

Status: **限定反復を実施。自然timeoutは今回未再現で、根本原因・H5a／H5bの寄与率は未確定。**

[WF-A](E2E_BEST_PRACTICE_WORKER_PARENT_OBSERVATION_WFA_2026-11-04.md)の相関ログを利用した。[計画](BEST_PRACTICE_WORKER_READY_FINISH_DIAGNOSTIC_PLAN.md)のH5aはスイート自身の並列負荷、H5bは外部要因・マシン状態を指す。開始時はclean。製品／試験source・期限・設定ファイルは変更せず、実サービス通信・環境調整・他process停止・負荷stress・tool導入・commit・Pushを行わない。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。

## 1 今回得られたこと

- 通常並列3回、実行時maxWorkers=3比較3回は、**各288ファイル／13,790件成功・失敗0・skip0**。前後のtarget-selection単独2回も各68件成功。自然の5秒framework timeoutは0件。意図的timeoutを隔離する既存回帰は、その外側の期待どおり成功している。
- 各全体実行のtarget-selection／adapterの122caseでWF-A観測complete、終了後pending=0・未終了worker=0。`review_busy`は0。target-selectionの対応済みpost／replyは各137組で、相関の不整合・post_returnに対する未対応replyは今回の集計で0だった。matchedはstrict受理や正常終端の証明ではない。
- 大きく変動した区間は主に**factory返却後からready形message観測まで**。factory同期区間は中央値0ms、finishのpost_return→matched replyは中央値4〜17msで、今回finish固有の長時間停止はない。
- 各近接比較では通常並列のready中央値が比較群より大きいが、**同じ設定内の差も大きく、設定差だけに帰属できない**。通常並列の中央値は201→322→466ms、比較群も136→202→223msだった。
- 前後の単独実行でもready中央値76→155ms、case中央値89→180msへ変動した。スイート未実行区間のマシン全体busy率も変動した。H5b等の時間依存要因を無視できない一方、発生元や熱・memory状態は直接測っていない。スイート自身の熱履歴・cache／実行順等も残るため、外生要因だけに断定しない。

今回の成功は修正完了ではなく、「この条件・回数では再現しなかった」という結果である。

## 2 実験条件と観測範囲

- macOS arm64 / Node v24.18.0 / availableParallelism=10。通常unitは既存forksの既定枠9、real-hostは既存maxWorkers=3・後段group。unitの基準5,000ms・hook10,000ms、各file／caseの既存個別上限、全体60秒等の製品期限を一切変更しない。
- 同HEAD・同観測器で、**single-1 → N1 → B1 → B2 → N2 → N3 → B3 → single-2**の順。Nは通常並列、Bはrootの実行時maxWorkers=3指定だけの比較群。近接ペアをN1/B1、B2/N2、N3/B3とし、順序を一部反転した。各群3回で打ち切り、ランダム化・温度固定・同一負荷の保証はしない。各run間の待ち時間も一定ではない。
- 各runを直列に実施し、別のbuild／lint／梱包監査を重ねない。試験自身のbeforeAllビルド等は元のまま。既存localhost合成fixtureが待受可能な条件で実行し、ServiceNowへ接続しない。
- 一時runner `/private/tmp/sn-wfb-observer.mjs`はVitest reporterで全case結果・duration・WF-A metaを採取する。製品module／worker bootstrapはtransformしない。既存tests/setup.tsへのメモリ内importで、一時setupの数値計測だけを加え、repoへ書き戻さない。全8runで同じ計測を有効にしたため、計画の「観測あり／なし各3回」は今回実施していない。
- 一時setupはfake timer導入前に本物のhrtime／cpuUsageを保持する。test worker内のcase wall・process CPU・event loop histogram（resolution 10ms）・終端RSSを数値で記録する。CPUはprocess内のworker／V8等のthreadを含み得るため、wall超過を不正値とせず、単一処理のCPU費と断定しない。RSSはピークではない。同期caseのhistogram標本0は「遅延0」ではなく未測定。
- 親runnerでOS CPU時間差分・loadavg・free memoryを約1秒ごとに採取。最初の短い区間とphase境界を集計から除く。実行中はonTestRunStart〜End、前後はsuite初期化前／context.close後の各約3.1秒。前後の非実行区間もrunner・OS・他processの活動を含み、マシンidleとは呼ばない。run間の全空白時間を連続監視したものではない。
- OS busy率はマシン全体で、suiteのみのCPU量ではない。名前／引数やprocess別CPU、温度・周波数・swap／pressureの帰属は採取していない。free memoryだけを原因根拠にしない。
- reporterは最大20,000case・20,000相関event・600個のOS標本・1,000moduleで打切り、不成立を保持する。WF-Aは既存4096-event上限のまま。今回全runで打切り・scope観測不成立は0、全caseの追加load metaを確認した。生message・認証値・本文・例外本文は追加保存しない。
- 各run開始／終了のHEADと、観測器・setup・設定・lock・scope／journal／factory／supervisor／adapter／workerのhashは一致し、run間も同じ値だった。source・設定差による比較とはしていない。Vitestのcache・実行順やJIT／GC・時間帯の影響まで統制したわけではない。

## 3 全体結果と同設定内変動

開始時刻はUTC。時間はrunner開始〜前後採取・context.close完了までで、テスト本体だけの時間ではない。分位は昇順配列のfloor(n×q)番（0-based）で、偶数の中央値は上側を採る。

| 順 | mode | 開始UTC | 成功件数 | runner時間（秒） |
| --- | --- | --- | --- | --- |
| 1 | single-1 | 07:02:17.702 | 68 | 16.7 |
| 2 | normal-1 | 07:03:00.903 | 13,790 | 46.5 |
| 3 | bounded-1 | 07:04:16.513 | 13,790 | 61.4 |
| 4 | bounded-2 | 07:05:51.100 | 13,790 | 80.1 |
| 5 | normal-2 | 07:07:44.920 | 13,790 | 63.9 |
| 6 | normal-3 | 07:09:10.908 | 13,790 | 77.3 |
| 7 | bounded-3 | 07:11:17.672 | 13,790 | 91.9 |
| 8 | single-2 | 07:13:22.979 | 68 | 21.6 |

全runの失敗・skip・未処理エラー・自然5秒timeoutは0。同設定でも後半の全体時間が伸びている。並列数3を恒久的な高速化・解決策として適用していない。

### 3.0 過去の失敗回との全体時間の比較

今回の8runは、過去の失敗回の状態に届いていない。同じ日の全体実行を時刻順に並べると次のとおり（JST）。全体時間はJSONの開始〜最後のfile終了で、`full`と`full_checked`だけは別の基点からの目安である。

| 開始 | 実行 | 並列数 | 全体時間（秒） | 失敗 |
| --- | --- | --- | --- | --- |
| 10:23 | レビュー検査 | 3 | 42.0 | 0 |
| 10:34 | `servicenow-acb-vitest` | 通常 | 162.4 | 24 |
| 10:38 | `servicenow-acb-vitest-retry` | 通常 | 165.5 | 40 |
| 10:42 | `servicenow-acb-vitest-bounded` | 2 | 131.4 | 0 |
| 10:51 | `servicenow-acb-commit-vitest` | 2 | 218.0 | 0 |
| 10:58 | レビュー検査 | 3 | 166.0 | 0 |
| 11:40 | レビュー検査 | 3 | 147.9 | 0 |
| 11:55頃 | `servicenow-timeout-full` | 通常 | 119以上 | 15 |
| 12:00頃 | `servicenow-timeout-full_checked` | 通常 | 約53以下 | 0 |
| 13:01 | レビュー検査 | 3 | 44.8 | 0 |

- 10:34〜11:57の7回は、並列数を問わず全体時間が約2分以上だった。その前後は約1分以内である。今回のWF-Bの最長は91.9秒で、通常並列は77.3秒に留まる。
- この時間帯の通常並列は3回とも失敗し、並列数2／3は4回とも成功した。同じ日の時間帯の外では、記録のある通常並列に自然timeoutはない。
- 時間帯が設定によらず遅いことは時間依存要因（H5b等）を、その中で通常並列だけが失敗したことはスイート並列負荷の増幅（H5a）を示唆する。両者の組合せという解釈と整合するが、順序の統制はなく、回数も少ない。遅くなった原因は未採取で、他processとも発熱とも言えない。全体時間の長さは失敗の結果である可能性も残り、必要条件や十分条件とは扱わない。

レビュー検査3回はレビュー担当の一時領域の全体試験で、他の検査と同時には走らせていない。10:58〜11:40の間にはレビューの変異試験を順に実行していたため、この区間の負荷には当方の作業も含まれ得る。失敗した10:34／10:38と11:55頃の実行は、コミット時刻から見てこの区間の外である。SHA-256は10:23が`ae97dac89f16899c207a7c906de0af38be3554e9300cc07d3e0601e2170d07bc`、10:58が`2c13f82de9764da5f4ec7893283618ffe1d0405f4452d64914b4914e6f041ea6`、11:40が`4971357fbff13d82c9405ebcea58f221ad320593db011b2d7f976660a8f8171a`である。

### 3.1 WF-Aによるtarget-selectionの区間分離

各runは68case・79review呼出し・75factory返却／ready観測。analyzeは64要求、finishは73要求、合計137のpost_returnとmatched replyを相関させた。単位ms。request待ちはpost_return→最初のmatched reply、ready待ちはfactory_return→ready_observed、終了待ちはterminate_try→worker_exit。親側配送・受信待ち等も含み、strict受理・loader内部処理そのものではない。

| mode | case中央値／p95／最大 | ready中央値／p95／最大 | analyze中央値 | finish中央値 | 終了待ち中央値 |
| --- | --- | --- | --- | --- | --- |
| single-1 | 89／181／281 | 76／86／92 | 9 | 2 | 1 |
| normal-1 | 255／637／931 | 201／287／798 | 24 | 11 | 4 |
| bounded-1 | 161／296／536 | 136／202／244 | 15 | 4 | 1 |
| bounded-2 | 232／512／751 | 202／288／360 | 22 | 6 | 1 |
| normal-2 | 401／859／1,433 | 322／511／542 | 37 | 14 | 5 |
| normal-3 | 574／1,359／1,967 | 466／642／728 | 46 | 17 | 6 |
| bounded-3 | 260／679／847 | 223／282／317 | 25 | 8 | 1 |
| single-2 | 180／387／598 | 155／179／202 | 17 | 5 | 1 |

factory同期区間は全run中央値0ms・p95 1ms、最大でも11ms。今回のready区間拡大をfactory呼出し自体の同期停止とする証拠はない。finish replyの最大は通常並列N1/N2/N3で161／79／133ms、終了待ちの最大は42／35／94ms。これらから過去の5秒失敗回の内部状態へ遡って断定しない。

各全体runのWF-A scope数は122で、review_endの固定codeヒストグラムも同一だった。負の対照が意図するcancel／deadline等を含むため、code非noneを新規失敗と数えない。現在のworker終了・session解放後にreview_busyの連鎖が再現したわけではない。

### 3.2 H5aとH5bの比較

| mode | OS busy率の中央値：前／実行中／後（%） | targetのevent loop最大（ms） |
| --- | --- | --- |
| single-1 | 22.2／41.1／24.6 | 21.3 |
| normal-1 | 34.5／100.0／19.9 | 78.4 |
| bounded-1 | 22.5／68.9／30.4 | 21.1 |
| bounded-2 | 30.6／69.3／33.7 | 30.7 |
| normal-2 | 38.3／99.9／42.9 | 43.7 |
| normal-3 | 48.4／100.0／41.0 | 40.8 |
| bounded-3 | 46.2／79.7／44.4 | 34.2 |
| single-2 | 41.8／58.7／41.8 | 20.2 |

event loop値は標本のあるtarget caseごとの最大値の最大で、5秒停止の直接証拠ではない。

- **H5a**: 近接3ペアのready中央値の通常並列−比較群は65／120／243msで、方向は同じ。通常並列のマシン全体busy率も高く、スイート並列負荷の寄与を示唆する。ただし通常並列の同設定内幅265ms、比較群幅87msがあり、設定間の群中央値差120msより大きい変動もある。normal-1の201msはbounded-2／3の202／223msと重なる。寄与量・唯一原因は分離できない。
- **H5b等の時間依存要因**: 前後の非実行区間のbusy率が変わり、同じ単独実行のready中央値も76→155ms。設定差だけでは説明できない変動が存在する。ただし他process・発熱等を個別計測しておらず、cache／GC・suite実行履歴・実行順も残る。H5bを唯一原因や外生負荷の確定としない。
- **busy率との対応**: 実行前のbusy率とready中央値は、各設定内で同じ順に動いた。通常並列は34.5→38.3→48.4％と201→322→466ms、比較群は22.5→30.6→46.2％と136→202→223ms、単独は22.2→41.8％と76→155msである。ただし両者とも時間とともに増えており、時間経過や直前runの余熱と区別できない。H5bの確定材料ではなく、次に調べる点とする。
- **H1／H3**: ready区間と、同caseで複数review／workerを順に行う累積を切り分けて採取できた。今回の最大caseは約1.97秒で、過去の5秒超過まで届いていない。線形に外挿して再現条件としない。
- **H2／H4**: 今回finish固有の停止・終了後の残留は観測していない。範囲外のケースや過去の失敗へ一般化しない。

### 3.3 worker以外・stdio

同名の既存caseも比較した（ms）。pure oracleのevent loop標本は0であり、同期処理の遅延なしとは扱わない。

| mode | full-mixed-draft v0.2のwhole-asset／trace oracle | legacy parent全status |
| --- | --- | --- |
| normal-1 | 1,315 | 1,413 |
| bounded-1 | 340 | 110 |
| bounded-2 | 611 | 152 |
| normal-2 | 1,945 | 666 |
| normal-3 | 2,441 | 1,293 |
| bounded-3 | 620 | 244 |

workerに限らない変動もあるが、これだけで負荷源を特定しない。stdioは全6runで本体passed、moduleのspawn timeout=falseだった。module全体時間はN1/N2/N3が約12.4／16.7／24.6秒、B1/B2/B3が約4.5／8.8／10.8秒で変動した。ただし今回beforeAllビルドを個別採取していないため、その値をビルド時間と呼ばない。過去の60秒ETIMEDOUTは未解消として保持する。

## 4 残課題と停止判断

予定した各群3回と前後の単独対照で今回の反復を打ち切った。自然失敗回そのものの相関・負荷がない以上、原因確定／修正済みとはしない。初期探索のH5単一説明ではなく、H5a／H5b等の共存・同設定内変動を保持する。

次は自然に遅くなる時間帯で同じ固定観測を再利用する。見分ける目安として、通常並列の全体時間が2分を超えた回を詳しく調べる対象とする。これは§3.0に基づく目安で、失敗の予測や判定条件ではない。専用の測定だけでは遅い時間帯を外しやすいため、普段の全体実行にも固定観測を使える形にする案がある。遅い回に出会えたら、続けて並列数3も実行して同じ時間帯で比較する。その回で、失敗したcaseに対して、最後のfactory／ready／request／terminateと元review終端を対応付ける。そのうえで必要な場合だけ、専用port等のloader内部／strict受理区間の設計へ進む。意図的な高負荷注入・他process停止・冷却／power設定変更・監視tool導入は別承認なしに行わない。観測あり／なし比較と外部要因の独立統制も今回未実施。

WF-Aを通らない失敗のphaseはUnknown。今回の成功・completeな観測も、実workerのlate／不正replyやanalyze gate等の未実施対照、製品の全work上界、AC-Cのatomic commit・seal成功・正常終端を確認済みにするものではない。

## 5 レビュー修正（2026-11-04）

`85efa9a`のレビューで次を追加した。文書だけの修正で、artifact・ソース・試験・設定・期限は変更していない。§1〜§3の既存の観測値は変更していない。

- 過去の失敗回との全体時間の比較を§3.0へ追加した。レビューの初回報告は12:01以降の成功だけを示していたが、修正時に確認すると午前中に並列数2／3で成功した約2分以上の実行があった。そのため「遅さ＝失敗」ではなく、時間帯と並列数の両方を示す形に改めた。
- 実行前のbusy率とready中央値の対応を§3.2へ、遅い回を見分ける目安を§4へ追加した。
- 参照から版表記を外した。

修正前のrepo全体の確認は、lint（error 0・warning 374）、build、梱包分類監査（441ファイル）が成功した。全体試験は他の検査と同時に走らせず`--maxWorkers=3`で実行し、288ファイル／13,790件成功・失敗0だった。これも通常並列のtimeoutの再現や解消を示さない。

## 6 artifact・検証

一時runnerは`bdo node /private/tmp/sn-wfb-observer.mjs <mode>`、集計は`bdo node /private/tmp/sn-wfb-summary.mjs <mode>...`。下表modeだけを使用。前者のSHA-256は`feb2cb641583995bdef91288ba43183c0a664b429c1823e495aa89cf340a1c38`、一時setupは`efd4e6ffd1c6ab114c77a75e57ff2be293147c8389445542a58f84a001a88919`、集計scriptは`9066f63f07d4af2241cabf61514c4f09d2bb56d7bc59a1f139917565c457fe52`。各JSONのhashes／endHashesに固定source等のSHA-256も保持した。

全artifactは/private/tmp内でrepo／配布物へ含めない。hashはbytes識別で、署名や正式証拠の発行権限ではない。一時領域のため将来消える可能性がある。

| ファイル | SHA-256 |
| --- | --- |
| sn-wfb-single-1.json | `6daa8c2e6cb82bd54a3a714fcc0494060549e6ced44b764585181887f8145a4e` |
| sn-wfb-normal-1.json | `27cf8992923df7cd995b54641e8e7b6594726d4160fa1011da591f890aa14520` |
| sn-wfb-bounded-1.json | `039c7ea32fc3e35b21169d610122c7751be4ac3b66c115cb5f471d44ea989689` |
| sn-wfb-bounded-2.json | `6217f211ccefec836b3a9ac3a57badccd2dbad41e8d8807dcad9bbd583287a83` |
| sn-wfb-normal-2.json | `b88269e3a66971a9df9d7e8cba41820a1aa08b5b7fb09bd9a6379f3a6f309930` |
| sn-wfb-normal-3.json | `a66e69dcb2c1a4e03f10d59ac524d06654da9cf58a188e3a049f111a5fa7968d` |
| sn-wfb-bounded-3.json | `2d0e61f2103f43f41bb59824c0b07ed72f3e961b7ba179dbd623ba42ba80db32` |
| sn-wfb-single-2.json | `bff70f1461041e950a6e580b5c0f42e40ded3d45016e96a3a30134f3d1126325` |

各JSONの件数・全caseのload meta・HEAD／hash一致・scope complete／解放状態・review_busy 0を再検算した。今回のrepo変更は本記録と既存2文書の参照更新だけ。別のbuild／梱包検査は文書変更のため再実行せず、設定・source・期限を変更しない。

## 7 次回の再採取・保全境界（設計のみ）

[再採取・証拠保全手順draft-0.1](BEST_PRACTICE_WFB_RECAPTURE_EVIDENCE_PROCEDURE.md)に、開始gate・回数／停止条件・旧artifact保全・非上書き出力・終了確認を整理した。既存一時runnerは固定出力名を上書きし得て途中保存・所有process終了確認も十分ではないため、そのまま再実行しない。通常1回＋条件付き比較1回までのsession案とし、2分超は目安であって失敗条件／打切り期限ではない。保存先・保持／容量枠・外側時間枠・固定版等の承認／検証が済むまで再採取を開始しない。今回の追記で観測値・失敗履歴・Unknownを変更せず、実装・試験・保管操作を行っていない。
