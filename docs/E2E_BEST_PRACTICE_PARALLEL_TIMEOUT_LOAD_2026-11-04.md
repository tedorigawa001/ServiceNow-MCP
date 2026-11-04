# 通常並列timeout：負荷・worker待ちの探索調査

Date: 2026-11-04 / 調査HEAD: `0df669a` / Status: **今回timeout再現なし。過去の失敗の根本原因は未確定。**

[診断計画](BEST_PRACTICE_WORKER_READY_FINISH_DIAGNOSTIC_PLAN.md)のH1〜H5を、既存JSON再読と現行HEADの合成試験で調べた。製品／試験ソース・期限・設定ファイルは変更していない。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持し、seal成功・実接続・実サービス通信・設定変更・Push・commitは行っていない。

## 1 結論と確度

1. **全体負荷による時間の増大（H5）を支持する材料が得られた。** 同HEAD・同観測器の通常並列と実行時maxWorkers=3の比較では、target-selectionの生成→ready形messageの中央値が386ms対182ms、case中央値が464ms対213msだった。workerを直接使わない重い検査も短くなり、OS CPU busy標本中央値は約98%対67%だった。ただし比較は各1回で、時間帯・他process・cache／GC等を分離し切っていない。この数値は通常並列のうち遅い回との比較である。同じ通常並列でもready待ち中央値は230〜419msと約1.8倍の差があり、速い回のfull-1と比べると230ms対182msで約1.3倍に留まる（§3の比較表）。並列数の効果とマシン状態の変動は、今回の結果では分離できていない。
2. **worker起動費と同case内の複数review累積（H1／H3）は有力な増幅要因。** 過去のBR-005はfinish開始約4.8秒でもready形message前に約3.7秒を使っていた。CL-008はcase内3個目のworkerでready未観測。finishで止まった事実だけでfinalize内部が主因とは言えない。
3. **5秒framework timeoutは今回再現しなかった。** 通常並列4回は全て13,773件成功・失敗0・skip0。並列数3比較1回も同件数成功。これらで過去の失敗履歴を取り消さない。
4. **新たな停止／admission漏れの証拠は得ていない。** 既存記録の失敗後pending=0／worker exitとadapter回帰は維持されるが、未観測の全経路へ一般化しない。

根本原因をCPUだけ・loaderの特定処理・特定ruleの退行と確定するには、自然失敗した回そのものの負荷・要求相関・内部区間が不足する。今回確認したのは負荷に伴う遅延の変動であり、timeoutの修正ではない。

## 2 条件・観測範囲

- macOS arm64、Node v24.18.0、availableParallelism=10。unitはforks、testTimeout=5,000ms、hookTimeout=10,000ms。real-hostは既存maxWorkers=3、testTimeout=30,000ms。各fileの既存個別上限も不変。
- インストール済みVitestの`resolveMaxWorkers`はproject／rootの明示値がない非watch実行でavailableParallelism−1を使うため、unitの既定枠は9。これは枠の導出であり、瞬間的なOS thread数・稼働数の観測ではない。試験内でさらにCPU worker／子processを生成する経路がある。
- 各実行を直列に行い、build／lint／梱包監査を重ねなかった。既存localhost合成fixtureは待受可能な条件で実行し、外部ServiceNowへ接続していない。
- baselineは`bdo npx vitest run --reporter=json --outputFile=/private/tmp/sn-parallel-baseline-N.json`。一時runnerは`bdo node /private/tmp/sn-timeout-load-observer.mjs <mode>`。`single-*`はtarget-selection単独、`full-bounded-*`だけ実行時maxWorkers=3、他のfullは通常並列。
- 一時runnerはVitest reporterでcase時間・結果・既存lifecycle・module情報を採取。親processで約1秒ごとにOS loadavg／CPU累積時間差分／free memoryを採取した。busy率は全coreの時間差分から算出し、初回の短い標本を集計から除いた。**マシン全体の値で、このsuiteだけの使用量ではない。**
- 後半は`tests/setup.ts`へのメモリ内transformで一時setupをimportし、test worker内でmonitorEventLoopDelay（resolution=10ms）・hrtime・process.cpuUsage・RSSの数値をmetaへ追加した。repoへ書き戻さず、製品protocol・signal・返値・guard・factoryを変更していない。eventごとのconsole出力もしない。
- process.cpuUsageはprocess単位でCPU worker threadを含み得る。wallを超える値も不正値とはしない。同期処理だけでevent loopへ戻らないcaseではhistogramの標本0になり得る。**標本0は遅延0ではなく未測定**。concurrent caseの個別費目確定にも使わない。
- URL・認証値・入力／結果本文・例外本文・他processの名前／引数を追加採取しない。reportは一時領域だけに保持する。
- 初版のsetupFiles指定はprojectに反映されず、single-1／full-1の追加load metaは0件だった。既存lifecycle／OS標本は有効だが、test worker内計測は不成立。後半はメモリ内importへ訂正し、single-2は68件、full-2／boundedは各13,773件のload metaを確認。旧版runnerは上書き済みで、JSON内の版hashだけが残る。
- 計画の交互各3回を完了したとは扱わない。今回は下表の限定探索。観測器の独立故障oracle、ready strict受理／要求別詳細イベント、専用portでのloader内部観測は未実装／未検証。

## 3 実行順・結果

全体時間の基点はbaselineではreport開始〜最後のmodule終了、一時runnerではrunner開始〜保存直前であり厳密に同じではない。単純な比率で観測器の費用を決めない。全回失敗／skip0、一時runnerの未処理エラーも0。

| 順序／artifact略称 | 対象・追加観測 | 成功件数 | 全体時間（約） |
| --- | --- | --- | --- |
| baseline-1 | 通常並列、標準JSON | 13,773 | 45.5秒 |
| single-1 | 単独、親reporter／OSのみ | 68 | 9.4秒 |
| full-1 | 通常並列、親reporter／OSのみ | 13,773 | 44.9秒 |
| single-2 | 単独、test worker内loadも有効 | 68 | 17.0秒 |
| full-2 | 通常並列、test worker内loadも有効 | 13,773 | 63.3秒 |
| full-bounded-1 | 実行時maxWorkers=3、同じload観測 | 13,773 | 64.6秒 |
| baseline-2 | 通常並列、標準JSONへ戻す | 13,773 | 62.3秒 |

同じHEADの通常並列でも全体時間に約40％の差があり、次のように速い回と遅い回に分かれた。

| 実行（実行順） | 並列数 | 全体時間 | ready待ち中央値 | OS busy中央値 |
| --- | --- | --- | --- | --- |
| baseline-1 | 通常 | 45.5秒 | 231ms | 未採取 |
| full-1 | 通常 | 44.9秒 | 230ms | 99.7% |
| full-2 | 通常 | 63.3秒 | 386ms | 98.3% |
| full-bounded-1 | 3 | 64.6秒 | 182ms | 67.2% |
| baseline-2 | 通常 | 62.3秒 | 419ms | 未採取 |

full-1はbusy 99.7％でも速く、full-2は98.3％で遅いため、busy率では速い回と遅い回を区別できない。この差の原因は未確定である。遅い2回に挟まれたboundedの回が速いことは並列数の効果を支持する材料だが、順序を入れ替えていないため確定しない。

baseline-2も約62秒であり、full-2の約63秒を全て観測器の負荷とは言えない。観測器のないbaseline-2でもready待ちが伸びているため、伸びは観測器だけによるものではない。逆に計測負荷も否定しない。並列数3はcase時間を縮めたが全体時間は短くなっておらず、恒久設定の変更や一般的な高速化として適用・推奨しない。

### 3.1 target-selection

ready待ちは既存metaのready_ms−created_msで、strict受理・loaderだけの時間ではない。各回68case、ready形message観測worker75個。親側配送・event loop待ち等も含み得る。

| artifact | case中央値／p95／最大（ms） | ready待ち中央値／p95／最大（ms） |
| --- | --- | --- |
| baseline-1 | 290／647／855 | 231／320／357 |
| single-1 | 114／223／281 | 96／118／132 |
| full-1 | 279／695／1,342 | 230／318／765 |
| single-2 | 154／371／486 | 133／162／198 |
| full-2 | 464／1,055／1,486 | 386／557／710 |
| full-bounded-1 | 213／730／784 | 182／326／477 |
| baseline-2 | 532／1,088／1,272 | 419／650／835 |

H1の区間が並列条件で伸びたが、tsx register・module import・OS schedulingへの帰属は未確定。full-2のtarget-selectionで標本があるcaseの最大event loop遅延は約44.5ms（caseごとの最大値のp95は約37.2ms）、single-2は約27.9ms、boundedは約31.1ms。これを過去の失敗回の5秒停止を説明する計測とは扱わない。

### 3.2 worker以外と全体負荷

同HEADのfull-2／bounded比較に、観測器の異なるfull-1を参考として加えた。期待値生成・oracle内容・期限は不変。

| case | full-2（ms） | maxWorkers=3（ms） | full-1（ms） |
| --- | --- | --- | --- |
| synthetic-full-mixed-draft、v0.2全asset／trace oracle | 2,159 | 725 | 846 |
| synthetic-parent-omission-owner、100決定／101拒否 | 1,047 | 206 | 754 |
| http-classification-legacy、parent全status | 832 | 144 | 927 |
| synthetic-pending-prefix-values、v0.2全配列oracle | 729 | 224 | 484 |

full-2のOS busy標本中央値98.3%、bounded67.2%。full-2のloadavgは開始約9.77／10.12／7.02、終了約31.94／16.89／9.80。loadavgには時間窓・他processの影響があり、core数との比だけで原因を確定しない。worker以外にも共通の遅延が見える点はH5を支持する。ただし`synthetic-full-mixed-draft`はfull-1では846msで、boundedとの差は約1.17倍に留まり、差の大きさは実行回により変わる。

free memory標本やvm_statの圧縮counterも取得できたが、freeの小ささだけでmemory pressure／swapを原因としない。swapusageは環境の権限制約で取得できなかった。過去失敗時のOS負荷は未保存で、現在値を過去へ当てはめない。

## 4 過去の失敗・残課題

[AC-B記録](E2E_BEST_PRACTICE_ATOMIC_STAGING_ACB_2026-11-04.md)の初回JSONと今回baseline-1の同名caseでは、parent分類5,085→798ms、100決定9,497→834ms、prefix配列11,082→653msだった。HEAD・時点が違う歴史比較であり、同HEAD比較と同じ証拠強度にはしない。5秒を大きく超えた同期caseの失敗報告durationも、そのまま製品処理時間と解釈しない。

- H1／H3: 起動区間の拡大・複数worker累積は観測できる。内部の処理／待ちはUnknown。
- H2: finish固有の長時間停止は今回再現しない。過去finish開始約4.8秒は開始前の費用も大きく、finalizeの退行と断定しない。
- H4: 記録の範囲では終了後の未完了reviewを残さない。未観測経路はUnknown。
- H5: 負荷・非worker case・起動待ちの変動から第一候補として優先する。ただし今回も高いbusy率で成功しており、timeoutを起こす十分条件は得られていない。計画に合わせ、スイート自身の並列負荷（H5a）と外部・マシン状態（H5b）を分ける。§3の速い回と遅い回の差はH5aでは説明できず、H5bはUnknownである。
- 遅延の大きさ: 今回の7回とも4秒以上のcaseは0件で、最大は`security.test.ts`の約3秒、target-selectionの最大は1,486msだった。過去の失敗回は`prefix`配列case 11,082ms（baseline-1では653ms、約17倍）、`full`のadapter最大は4,610ms（`full_checked`では376ms）である。今回の条件間の差は最大で約6倍で、失敗回の状態は再現していない。失敗回のdurationを処理時間とは解釈しないが、今回の負荷と同程度の負荷で過去の失敗を説明できるとは言えない。
- stdio: 今回の全体実行は本体も成功。新runnerのmodule情報でspawn timeoutなし。ただしbeforeAllビルドを個別採取しておらず、module全体時間をビルド時間にしない。過去の60秒ETIMEDOUTは未解消として残す。

次に必要なのは、自然失敗回そのもののboundedなreview／request相関と起動内部区間。WF-Aの恒久test-only観測・独立対照を先にレビューして追加する案、または一時観測を同条件で後日再実行する案がある。期限延長・skip・admission強制resetでは回避しない。意図的なマシン全体のCPU／memory stress、tool導入、profiling設定変更は行っていない。AC-C接続の未確認事項も解消扱いにしない。

## 5 レビュー修正（2026-11-04）

`b1699e9`のレビューで次を追加・訂正した。文書だけの修正で、artifact・ソース・試験・設定・期限は変更していない。記載済みの観測値は変更せず、§1の結論へ限定を加えた。

- 同じ設定の実行間の差を§3の比較表として追加し、§1の比較が遅い回とのものであることを明記した。
- H5をH5a／H5bへ分け、過去の失敗回との遅延の大きさの差を§4へ記録した。
- §3.1の未集計だったbaselineのready待ちを既存JSONから集計し、§3.2へfull-1を追加した。
- 参照から版表記を外した。

修正前のrepo全体の確認は、lint（error 0・warning 374）、build、梱包分類監査（441ファイル）が成功した。全体試験は他の検査と同時に走らせず`--maxWorkers=3`で実行し、287ファイル／13,773件成功・失敗0だった。これも通常並列のtimeoutの再現や解消を示さない。

## 6 artifact識別

後半runnerのSHA-256は`b347739955ef6f710b3072bf2fefdd26735566493d4fb58d80349c0dcbb080a4`、一時setupは`c5a587e8127b51ea73e52efd98855bcffa50640736f58affd4ff09549730a19e`。vitest.config.tsは`4acfd66a6d551cd3ac9363a04df1d2c41ae993392b63a45f323c0ab89a4fc0f5`、package-lock.jsonは`3c1840c0f0a2820a28870a90b08ff14943dca339e0eb1e5f3b57a4422d0ae014`。

以下は全て/private/tmp内。hashはbytes識別で、署名済み外部証拠や正式発行権限ではない。一時領域のため将来消える可能性がある。repo／配布物には含めない。

| ファイル | SHA-256 |
| --- | --- |
| sn-parallel-baseline-1.json | `b06a81953aeda42f474335adcefa96f3a1e54df36109c4e79dea8bc822826129` |
| sn-timeout-load-single-1.json | `e0b1a258c80bc6f276d2790471395dac23dd76078a8b8f0de7ebe86b9a35e23f` |
| sn-timeout-load-full-1.json | `3c0b9fad95b9b73b31fc05e4ce117847c386d93f4381d292c2d0d6a45da4344f` |
| sn-timeout-load-single-2.json | `106ddbb299c08fa321a1772aee6cd3706a3a7f050396e8d456742724e1627eba` |
| sn-timeout-load-full-2.json | `18d7350ef09c5c7a502ea7e1e95b90d6312c66b21e5dc9372c7f779693bfcebc` |
| sn-timeout-load-full-bounded-1.json | `93716c04711f6fc4a6ae11d491674319e95736ba61d47565dbfae2bb26f615c4` |
| sn-parallel-baseline-2.json | `4aacd77ac9df92acf403f365ede6a07926aaa22a316a40454db03e131d5013e8` |

今回のrepo変更は本記録と既存計画・記録の参照更新のみ。AC-Cのatomic commit／seal成功・正常終端へ進まず、正式発行口閉鎖・全体受付無効・Unknownを維持する。
