# WF-B SG-A：四軸終端・判定優先順・純粋fake故障対照

Date: 2026-11-14 / 基準HEAD: `51d763b` / 対象：[supervisor設計§10](BEST_PRACTICE_WFB_BODY_LIVE_SUPERVISOR_FAULT_DESIGN.md)。作業開始時点の比較器レビュー変更は未コミットだったが、作業中に同HEADへ保存された。比較器・既存判定関数・既存試験は編集せず保持した。

合成依存限定。通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実process対照・実接続・実通信・設定変更・Pushなし。本記録の作成時点では今回のコミットは未実施。

## 1 実装範囲と保証の境界

| 対象 | 内容 |
|---|---|
| body-live-supervisor.ts | 同run token・固定ABBA・全60秒期限、四軸状態、有限命令、失敗優先、stop／cleanup／report終端 |
| body-live-supervisor-protocol.ts | 最大64KiBの同bytesをUTF-8／既存2summaryへ検査し、strict field・件数・固定順・fingerprint比較へ供給 |
| body-live-supervisor.test.ts | 手書きwire／event oracle、fake clock／pipe／process event／group、感度対照のin-memory変異 |
| 文書 | CHANGELOG、親設計・supervisor設計、本記録 |

製品src／runtime・通常runner・opt-in比較器・fixture既存入口・package／lockfile／設定は変更しない。新kernelは将来のadapterへ接続する内部境界で、現在の実比較器が同kernelを使用済みではない。fakeの命令は値であり、spawn・signal・filesystem操作・実時間waitを実行しない。Vitest／型検査／ビルド等の検証tool起動と、故障注入対象の実process起動は区別する。

## 2 故障matrixへの対応

| ID | 純粋fakeで確認した範囲 | この結果では確認しないもの |
|---|---|---|
| SF01 | 固定ABBA・chunk分割・全summary・同観測・不在2回・直列起動gate | 実304moduleの再実行・性能 |
| SF02〜03 | 各64KiB−1／一致／＋1、UTF-8 byte計数、保持上界、producer変異後も同copy、超過後のdrain計数・安全整数飽和 | OS pipe実容量・物理allocation上界 |
| SF04〜07 | 未採取／EOF／stream error、空／欠落／不正schema・digest／件数・意味19行・隔離・case順の拒否、raw本文非出力 | 実childの出力必着・全raw JSON parser保証 |
| SF08 | listen命令がないと有限fake pipeが進まない負の対照、正規命令での進行・単byte分割 | 実stdio adapterのdrain接続 |
| SF09〜14 | exit／close別、group生存・Unknown／回数reset、spawn未生成と部分生成、TERM／KILL各1回・結果と不在確認の分離、fresh alive照会 | native signal・groupのOS保証 |
| SF15〜17 | 59,999／60,000／60,001、timer未発火の期限判定、旧期限の比較不能と併発異常の失敗優先 | 安定3run・実timeout時の清掃 |
| SF18〜20 | 起動前／実行中／summary後・report前の取消、時計throw／NaN／逆行、token混入・event重複・有限event／命令枠 | 取消通知・時計・OS event配送の必着 |
| SF21〜24 | ceiling、remove／report応答欠落、部分生成・削除／報告失敗、親喪失／group離脱を未確認として保持 | 親hard終了後の外側回収・離脱processの実検出 |
| SF25 | 未知checkpoint混入を現行2summary契約が拒否 | 版付き22checkpointの実装・受入（SG-P） |

SFごとの期待値はkernelの判定結果から作らず、試験内の固定wireとevent順・件数・期待分類で決める。pidを同数値へ再利用するfakeでも、別runのprivate tokenは混入できない。実観測・実証拠へ昇格させず、欠けるOS／cleanup保証はUnknownとして残す。

## 3 感度対照

同じkernel sourceをmemory内だけでemitし、同じinterfaceへ個別の変異を与える。元sourceを書き換えず、実processも起動しない。置換anchorが一意でない、構文／importが失敗する場合は対照失敗でありkillに数えない。

| 変異 | 独立の拒否観測 |
|---|---|
| stdout listen命令の削除 | 有限pipeへの購読命令が消える |
| 65,537byteを超過扱いしない | exact boundaryのtruncated不成立 |
| byte計数をdecode後の文字数へ変更 | 21,846個の€＝65,538byteを超過扱いできない |
| exitをcloseへ兼用 | close未観測の対照を失う |
| 不在1回を2回へ変更 | 2回目の独立照会前に確認扱いになる |
| 旧期限を異常検査より先に比較不能へ変更 | overflowとの併発が失敗でなくなる |
| 観測時刻の期限判定を削除（timerだけへ依存） | timerを送らない60,000ms closeを通す |
| 次runの先行失敗／進行中gateを削除 | 前run進行中にも開始できる |

## 4 RED・途中の失敗と訂正

| 段階 | 観測・原因・対応 |
|---|---|
| 最初のtracer | 未実装stubでnot_implementedのRED1件。その後、起動前取消のspawn 0・再開始拒否を確認 |
| report前取消 | 最初の取消は残るが、先に算出したpassedがreport後も残った（RED1件）。終端確定前の失敗再評価を接続 |
| remove／report応答欠落 | cleanupから出ると期限確認しないため待ちが残った（RED2件）。同cleanup期限で未応答を固定終端へ写す |
| stderrの遅いattach | 終端分類後のattachが未採取を後付けで正常化した（RED1件）。EOF後のattachと終端後の状態書込みを拒否 |
| 修正中の追加失敗 | 上記修正後、報告期限切れが追加診断となり、旧試験の単一reason期待1件が不一致。close未確認・retainedDutyの四軸期待へ改め、report未達を隠さない。未採取対照1件はsignal ack未入力で正しく待機しており、必要なackを明示して後付けattach拒否を分離 |
| cached alive | 停止前のalive cacheだけで1秒後のKILLを許した（RED1件）。1秒後以降に採取したalive照会を要求 |
| run間取消 | 完了済みrunへのevent拒否だけでは、次run開始前のroot取消も無視した（RED1件）。完了済みrun記録を不変に保ち、root側の取消が次の開始を拒否するよう分離 |
| 期限時の部分出力 | 行数だけで未完成を判定したため、1行の完成済み不正値を比較不能へ隠し、正規旧summary＋途中の2行目を不正へ分類した（RED2件）。先行完成値の固定比較とbounded構文prefix検査へ分離。途中の値受理ではなく未完了診断だけに使用 |
| 最初の梱包確認 | 監査側が不存在のdist/review/worker.jsを要求し失敗。既存梱包契約の正規パスdist/review/review-worker.jsを読取り確認して再監査。配布worker欠落とは分類しない |

期限・元assert・通常経路の設定を緩めていない。event枠は合法な単bytechunk分割を拒否しないよう、2stream分の上限byte＋control 128件として明示した。物理memory／work費の導出とは別である。

## 5 検証結果・並列timeoutの残課題

期限は各既存試験の元設定のまま。最終版の結果は下記表に記す。

最初の通常並列の関連9fileは883件成功・3件失敗（計886件）、59.74秒だった。失敗はいずれも既存の5,000ms期限で、probe-body-liveのreenter境界5,933ms、probe-body-seedのreenter境界7,975ms、body-live-loaderの最初のbase load8,362ms。SG-A以外のsourceは今回変更していないが、それだけで原因を環境と断定しない。終了後のload平均は約10.16／8.78／8.76、利用可能CPU数10だった。実行開始時負荷・同条件基準HEAD対照は未採取で、因果・退行の有無は未確定。

同じ9fileを期限不変・maxWorkers=1の診断対照では886件成功した。これは並列度を変えた別条件であり、通常並列の成功へ読み替えない。その後の多byte／copy／感度対照追加を含む最終結果は追記で区別する。通常並列の3件timeoutは未解消として保持する。

| 最終検証 | 結果 |
|---|---|
| SG-A・関連回帰 | 最終版9file／908件成功、maxWorkers=1、22.73秒。SG-Aは93件（動作・境界85＋感度8）。5秒等の元期限は不変 |
| 感度監査 | §3の8変異を各対応probeが検出。構文・import例外をkillへ数えず、source変更なし・in-memoryのみ |
| strict型検査 | 新kernel／protocol／testの3file、ES2022／NodeNext／strict／noEmit、exit 0 |
| lint | 上記3file、exit 0 |
| build | npm run build、exit 0。製品sourceの差替えなし |
| 梱包dry-run | offline・ignore-scripts、441file、正規review-workerあり、新fixture／tests混入0、archive生成なし。一時cacheをfinallyで除去 |
| 文書・scope | 親設計／詳細設計／本記録のリンク・表・SF01〜25連番・差分空白、変更対象7fileを確認。既存比較器・旧入口・src・設定変更なし |

実processの故障注入・compiled child起動・通常並列の再成功確認・全体回帰は実施していない。最初の通常並列結果を直列成功で置き換えず、基準HEAD同条件対照なしという制約も残す。

## 6 未実施・後続

既存比較器のevent採取と新kernelの接続、SG-Bの実process／stdio／group対照と外側observer、SG-Pのcheckpoint、安定3run・全体通常並列回帰・BL-C採用判定は未実施。新kernelのSG-A対照をもってBR09全完了・実cleanup確認・本番証拠発行としない。通常経路未切替・正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。

## 7 コミット前の再確認（2026-11-14）

SG-Aの変更対象7fileだけが作業treeの差分であることを確認した。期限不変・maxWorkers=1の関連9file／908件が21.41秒で成功し、strict型検査・lint・buildがexit 0。offline・ignore-scriptsの梱包dry-runは441file、正規review-workerあり、新fixture／tests混入0。文書3件のリンク12件・表16個・SF01〜25連番・差分空白を確認した。再検証後の変更は本節等の文書追記だけで、実装・試験は変更していない。通常並列の既存3件timeoutは未解消のまま、実process対照・実接続・実通信・設定変更・Pushは行わない。

## 8 レビュー修正（2026-11-14）

基準HEAD `a9d1e4c` のレビューで、一時変異26件中15件が入力から到達できるのに対照のないまま生存した。区分は[設計§11](BEST_PRACTICE_WFB_BODY_LIVE_SUPERVISOR_FAULT_DESIGN.md)に記録した。kernel／protocolは変更せず、試験に対照16件を追加した。各対照は対応する変異で失敗し（RED）、元の実装で成功する。

| 追加対照 | 件数 |
|---|---|
| pid 0／1の拒否（listen・signal命令0） | 2 |
| protocolの単一要素変更の拒否（mode・payloadEmits・loader・caseDigest形式／件数・executionのkey） | 6 |
| 3行目を含む出力を未完成としない | 1 |
| 期限後に初めて停止してもcleanup期限は63,000ms | 1 |
| Unknown照会でKILLしない、不在groupへsignalしない | 2 |
| 回収後のclock／escaped faultでcleanup未確認 | 2 |
| 命令32件の上限とevent_limit | 1 |
| exit／close不一致をevent_conflictとして記録 | 1 |

SG-Aの試験は109件（動作・境界101＋感度8）になった。生存の残り2件（不在確認の間隔、removing／reporting中のdata）は等価である。§5の並列timeoutは、レビュー時の関連9file・既定並列度・load平均約5では再現しなかった（908件成功）。修正後の検証値は、検証で得た値だけを本節の後に追記する。

| 修正後の検証 | 結果 |
|---|---|
| lint／build／梱包分類／差分空白、strict型検査（試験file） | 全てexit 0 |
| repository全体のvitest（maxWorkers=3） | 354file／18,769件成功・失敗0 |
| compiled全群＋declared-actual＋BL-A compiled | 全てexit 0 |
| 一時変異の再実行 | 生存15件を全てkill、残り2件は等価 |
| ABBA比較器（今回の変更対象外） | `inconclusive`／`control_deadline`／exit 2。開始時load平均約6.65で旧対照の1本目が期限に達した（SIGTERM 60,001ms、close 60,063ms、所有group終了確認済み、stderr 0・truncated false）。後続childは起動していない |

比較器・kernel・protocolのコードは今回変更しておらず、ABBAの比較不能は試験追加の回帰ではない。新経路との比較はこの実行では成立していない。
