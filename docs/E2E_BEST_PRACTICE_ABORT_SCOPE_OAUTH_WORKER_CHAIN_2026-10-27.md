# OAuth→固定source→worker→fixture上位結果：連続合成E2E

Date: 2026-10-27。対象：[移譲設計draft-0.5 §14](BEST_PRACTICE_ABORT_SCOPE_OAUTH_SOURCE_HANDOFF_DESIGN.md#14-oauth起点のworker上位結果までの連続合成e2e)、[worker接続設計§11.1](BEST_PRACTICE_ABORT_SCOPE_CONNECTION_CONTRACT_DESIGN.md#111-oauth起点の連続検証test-only-owner)。

## 1. 範囲

今回の追加はtests内の外側owner・17ケース・子process fixtureと文書だけ。`src`、本番dispatcher／schema、依存設定は変更していない。

`createOAuthScopeRun`は同fixture sessionでOAuth bootstrap→offer／adoptSource→prepare→native worker.prepare→計画のcollectionへinitial→finalize→consumeObservations→worker.observe初回／最終→compare→finishを呼ぶ。Response／payload／instance_bindingは架空値、Web Streamsとworker thread／IPC／strict上位resultは既存実装を通す。source／worker classをmockした成功summaryではない。

正式な証拠発行口は閉鎖。Unknown・全体受付無効、VM／監視／telemetry保留を維持する。実transport・PDI操作・token発行・設定変更・Pushは行っていない。

## 2. 時計・取消・入力の責務

- 通常試験はsession constructorの最初のperformance.now値をsystem-clock spyで捕捉し、workerのremainingMsをその元時刻から計算する。callback観測値は非増加で、OAuthを25ms遅延させてもworkerに新しい60秒枠を与えない。
- 子processの出力試験ではconstructor直前の時刻を使い、workerへ保守的に少ない残時間を渡す。完全同一の開始観測値を証明する試験とは区別する。
- 外側ownerの一つのAbortControllerがtransport root.cancel／session.closeとworker.signalを停止させる。これはtest-only接続であり、本番の共通停止ownerを追加したものではない。
- sourceの初回／最終は同sessionの経過時計。fixtureのstarted／retrieved／comparedは1970-01-01を0とするISO表現で、実wall-clockではない。
- metadataの対象ID／name／版はworker入力と整合させるが、payload本文は試験が直接供給する。P=0はpayloadをHTTP取得・課金していないことを示し、正式なpayload receiptとの結合証明ではない。

## 3. 17ケースと結果

`tests/review/abort-scope-evidence-oauth-worker-e2e.test.ts`。

| 経路 | 結果／会計 |
|---|---|
| 通常 | OAuth＋source初回3＋最終3でC=7。独立に集計したbody bytesとG、table bytesとEが一致、R=0・P=0。worker finish前後で会計値不変 |
| OAuth retry（429／503、2件） | cleanup済みの同permit retryでC=8。失敗bodyを含むGを保持し、worker／上位resultまで予算を作り直さない |
| 取消済みで開始 | POST／workerなし、C=0、owner/cancelled・cleanup=not_started |
| OAuth待機中取消 | source／workerへ進まずC=1・G=0。abortに応答する架空I/Oを終端化し、例外の秘密を返さない |
| table read中取消 | C=4で停止、final GETなし。reader cancelは1回。worker terminate confirmed、threadId=-1、行はnot_completed・比較なし・候補数0 |
| worker ready待機中取消 | C=3、table GETなし。無応答の実native workerをterminateし、上位はcancelled／cleanup confirmed |
| compare後取消 | provisionalな比較をnot_completedへ撤回し、comparison=null・候補数0。C=7／R=0は保持 |
| final changed／初回404（2件） | sourceがchanged／unverifiedならcallerがfinal/evidence_missingへ。比較へ昇格せず、workerを終了。初回404はtable finalなしで予約解放 |
| 初回table 401／403（2件） | C=4・finalなし。initial/authentication_failedまたはaccess_deniedとworker終了確認を上位へ保持 |
| OAuth拒否 | workerなし。owner/authentication_failedだけを返し、未読の架空本文をGへ数えない |
| worker起動失敗 | C=3・table GETなし。固定worker_unavailable／cleanup not_started、factoryの例外本文なし |
| 元時計の継続 | 遅延OAuthの経過時間をworker残時間へ反映し、finishまで非増加。新しい起点を作らない |
| 子Node出力 | env={}でsource TS＋native workerを実行。stdoutはstrictなfixture上位JSONだけ、stderrは空。会計・worker終了・非露出を子と親で確認 |
| 観測点未到達 | runnerが先に認証失敗で終われば、その固定理由で観測待ちを終了。無期限にreadyだけを待たない |

正常resultは`br006-fixture-result-0.1`／fixture_input／synthetic／partial／analysis_complete=false／code_return_mode=none／evidence disabled。scope差の1候補はcomparison_onlyであり、正式findingや中止失敗の実証ではない。schemaを再検証し、従来の未接続limitationsを維持する。

## 4. 非出力・終了確認

架空token／refresh／extra columnのcanaryと、payload中の`console.log` canaryを使う。worker stdout／stderrはcaptureし、空であることを検査する。レビュー対象コードは解析するだけで実行しない。上位JSONに本文／CDATA／API表現／run nonce／worker generation／payload hash／code hashが無いことも確認する。子processのstdout／stderrを親が捕捉し、strict schemaとcanary非出力を再検証する。実資格情報は入力にも使っていない。

取消試験の待受点はrunner終端とraceし、5秒の試験用観測上限を持つ。finallyで取消・pending runner待ち・closeを実行する。workerが起動した取消試験ではterminate確認とthreadId=-1、未起動ではnot_startedを分ける。reader cleanup・worker終了確認は別の診断軸であり、OS資源の物理消失や未決着I/O全般の上界を証明しない。

## 5. 検証履歴

TDDの小さな接続単位に沿って、正常1件→retry／取消まで8件→失敗伝播・時計・子processまで16件→観測点未到達の17件へ追加した。各段階は成功し、この作業では製品不具合による失敗やruntime修正はなかった。17件単独の最終実行は1.47秒。

- `bdo npm run build`：成功。
- `bdo proxy node node_modules/vitest/vitest.mjs run --maxWorkers=3`：161ファイル／4,701件成功（26.79秒）。合成内のローカルHTTP試験の待受を許可した。PDI E2Eは含まない。
- ESLint APIでsrc／tests全体：0 errors／既存374 warnings。新規3試験ファイルの個別確認：0 errors／0 warnings。
- offline梱包検証：377ファイル、production-only install／worker解析・集約／MCP／fixture非同梱・境界smoke成功。公開packageの内容・依存設定を変更していない。
- 更新5文書の相対Markdown参照40件に欠落なし。`bdo git -c core.fsmonitor=false diff --check`は空白エラーなし。

### 5.1 コミット対象だけの再検証（2026-10-27）

今回の9ファイルだけをstageし、indexの全tracked treeを新しい一時ディレクトリへ書き出した。未追跡の`.vscode/`／`CLAUDE.md`や他の作業ファイルは含めず、依存物だけ既存node_modulesを参照した。

- 隔離したtreeでbuild成功。
- 同treeで並列数3の全体合成テスト：161ファイル／4,701件成功（27.38秒）。合成内のローカルHTTP試験の待受を許可し、PDI E2Eは実行していない。
- 同treeでESLint：0 errors／既存374 warnings。
- 同treeでoffline梱包検証：377ファイル、production-only install／worker解析・集約／MCP／fixture非同梱・境界smoke成功。
- 更新5文書の相対Markdown参照40件に欠落なし。stage済み差分の空白エラーなし。

再検証後は本記録への結果追記だけを行い、試験コード・fixture・本番ソース・設定は変更していない。

## 6. 残課題・禁止する昇格

実sessionのAuthSnapshotIdentity／ReleasePermit／選択metadata・payload receipt／worker jobの正式binding、本番の共通停止／予算owner、公開MCP BR-006結果契約・語彙／coverage、全体work／保持上界・cap承認・終了policy・実機検証は残る。

`source_receipt_binding_not_connected`／`public_review_integration_not_enabled`は取り除かない。今回のtest-only ownerや正規化データを本番issuer／正式seal／実行permitへ昇格しない。取消・source不足・cleanup未確認時にcomparison_onlyを成功findingへ救済しない。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry保留を維持する。
