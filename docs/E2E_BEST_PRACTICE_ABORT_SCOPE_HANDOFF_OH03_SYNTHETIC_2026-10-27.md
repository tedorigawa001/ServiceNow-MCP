# OH-03：同transportの固定source private採用・初回／最終観測・会計継続

Date: 2026-10-27。対象：[移譲設計draft-0.4 §13](BEST_PRACTICE_ABORT_SCOPE_OAUTH_SOURCE_HANDOFF_DESIGN.md#13-oh-03同transportの固定source-private採用初回最終と予約解放)。

## 1. 実装範囲

- 固定sourceの既存prepare／initial／finalize／consumeObservationsを非exportの`fixedSourceOnTransport`へ分離。同moduleへOAuth run ownerを配置し、旧handoff moduleは互換re-exportとした。
- rootの`adoptSource(ticket)`は同runのticketだけを消費して、保持済みのadapter／固定dispatcher／pin済みUpdate Setをprivate coreへ渡す。外部から任意adapter／port／machine／URL／callbackを登録するexportはない。
- OH-02のprobeと全source採用は同じone-shot claimを共有する。二重採用、probe後の昇格、foreign／clone ticket、古いbootstrapによる再認証や停止を拒否する。
- 同会計ownerのC/G/P/E/R・retry・同じ絶対期限を継続。初回／最終観測、cache、局所不足時のfinal skip、未使用予約だけの解放を既存coreで共用する。
- source操作入口・await後・delivery前に同ownerのlive／readyを検査する。root取消／終了はprivate discardを同期呼出しし、基準値・table・未消費deliveryを破棄する。source由来の失敗もrootの一次診断へ保持する。

正式な証拠発行口は閉鎖。`seal:null`／`synthetic:true`／`evidence_issuance:disabled`を維持する。実session／実transport・PDI操作・設定変更・Pushは行っていない。Unknown・全体受付無効、VM／監視／telemetry保留を維持する。

## 2. 合成30ケース

`tests/review/abort-scope-evidence-oauth-fixed-source.test.ts`。

| 観点 | 確認した結果 |
|---|---|
| 正常1table | OAuth→親／metadata初回→table初回→親／metadata／table最終。C=7、R=4→6→0、P=0、同名cacheで追加試行なし |
| OAuth retry | 429／503後のconfirmed cleanup・同permit retry。C=8、失敗分もGへ保持。tableだけE、移譲差分0 |
| 局所初回不足 | 404／503枯渇／不正JSON／空resultをunverifiedへ。table final GETをせず親／metadata再読を継続し、R=0 |
| E上限 | 8table・E=262144に達した最後の503でretry開始なし。残1予約だけ解放しC=21・R=0、読取bytes／試行を返金しない |
| 版の変化 | 親／metadata／tableそれぞれのfinal変更でchanged・sealなし・delivery不可。最終予約は終端化 |
| 所有権／一意性 | probeとsourceの重複採用、foreign／clone ticket、再bootstrapを拒否。正当なsourceはstale操作では停止しない |
| 取消・失効 | root cancel／close／session失効後はcache／final／deliveryを拒否。進行中readのcancelは一度、adapter timer／scratchは終端で解放 |
| 診断 | 初回401／403は全体停止。cleanup不明を別軸で保持し、source binding失敗もroot／source closeで上書きしない |
| 元予算 | OAuth分を含むG上限をsourceへ継続。120ms低減枠の100ms normal／110ms final／120ms hard境界を作り直さない |
| 同adapter | OAuthで使ったResponseをsourceで再利用すると既存WeakSetで拒否し、cleanup不明から正常復帰しない |
| 非露出／閉鎖 | extra column／架空token／本文をsummary・deliveryへ出さず、sealなし。global fetch拒否spyは未呼出し。任意adapter採用関数は非export |

会計oracleは注入Response境界で試行数・body byte長を独立集計する。局所404のように本文を読まずcancelする場合は、native readerから実際に返ったchunkを観測してG/Eを計数する。供給しただけの本文を受信量に足さない。adapterや会計ownerのstatsを期待値へコピーしていない。

## 3. Red／Greenと切り分け

1. 最初に正常C=7／R=0の接続テストを追加し、未実装の`adoptSource`で失敗することを確認した。同moduleのprivate coreと採用経路を接続後、新規1件＋既存関連64件が成功した。
2. root取消でfinal deliveryを同期撤回する試験を先に追加。既存状態は`done`のままだったため失敗。private discardの一度限りの登録・root失敗との接続を追加し、2件成功を確認した。discardはMap／基準値を破棄するだけで、停止／cleanupの所有者を増やしていない。
3. 追加21ケース中404のbyte oracleだけが2byte多く失敗した。既存adapterのterminal status分岐がreaderを取得せずcancelすることを照合し、oracleをnative readerのchunk観測へ修正した。製品の会計やcleanup条件は変更していない。21件成功。
4. 30ケースへの拡張で、非露出regexが正常な`payload_bytes:0`の統計名まで拒否して1件失敗した。本文列の`"payload":`／`"script":`と架空秘密だけを検査する形へ訂正し、関連3ファイル94件が成功した。

## 4. 最終検証

- `bdo npm run build`：成功。
- 新規30ケース＋OH-02／既存固定source：3ファイル／94件成功。
- `bdo proxy node node_modules/vitest/vitest.mjs run --maxWorkers=3`：160ファイル／4,684件成功（25.98秒）。合成内のローカルHTTP試験のみ待受許可を使用。PDI E2Eは含まない。
- ESLint APIでsrc／tests全体：0 errors／既存374 warnings。変更3ソース・テストファイルの個別確認は0 errors／0 warnings。
- offline梱包試験：377ファイル、production-only install／worker解析・集約／MCP／fixture非同梱・境界smoke成功。既存`!dist/review/abort-scope-evidence*`を維持し、公開tool／schema・本番依存は変更していない。
- 更新4文書の相対Markdown参照27件に欠落なし。`bdo git -c core.fsmonitor=false diff --check`は空白エラーなし。

### 4.1 コミット対象だけの再検証（2026-10-27）

OH-03の8ファイルだけをstageし、indexの全tracked treeを新しい一時ディレクトリへ書き出した。未追跡の`.vscode/`／`CLAUDE.md`や他の作業ファイルは含めず、依存物だけ既存node_modulesを参照した。

- 隔離したtreeでbuild成功。
- 同treeで並列数3の全体合成テスト：160ファイル／4,684件成功（26.81秒）。ローカルHTTP試験の待受を許可し、PDI E2Eは実行していない。
- 同treeでESLint：0 errors／既存374 warnings。
- 同treeでoffline梱包検証：377ファイル、production-only install／worker解析・集約／MCP／fixture非同梱・境界smoke成功。
- 更新4文書の相対Markdown参照27件に欠落なし。stage済み差分の空白エラーなし。

再検証後は本記録への結果追記だけを行い、ソース・テスト・設定は変更していない。

## 5. 未接続・未確認

今回のOAuth→source経路のnormalized deliveryは既存worker用fixtureで使える型だが、この起点からworker／上位結果までを通す新規連続E2Eは未実施。既存worker試験の成功をこの起点のjob／payload由来の証明に代用しない。

実session／ReleasePermit／選択payload／worker job binding、本番token管理・認証／ACL、公開BR-006結果契約、本番cap・全体work／保持・終了保証・実機検証は未接続／未確認。正式な証拠発行口は引き続き閉鎖する。

terminalな全体停止後のR残を返金してR=0に見せる処理は追加していない。R=0は正常または局所不足をfinalizeで終端化した試験の確認結果であり、異常終了の成功証明ではない。session失効後はsource操作／statsのgateで失効状態を反映し、deliveryは渡さない。sessionのhard timer解放はcreatorのsession.close責務を維持し、物理ゼロ化やsocket消失は保証しない。
