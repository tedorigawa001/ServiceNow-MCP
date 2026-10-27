# OH-02：固定dispatcher・既存Web Streams adapterの所有者切替 合成検証

Date: 2026-10-27。対象：[移譲設計draft-0.3 §12](BEST_PRACTICE_ABORT_SCOPE_OAUTH_SOURCE_HANDOFF_DESIGN.md#12-oh-02固定dispatcherと既存adapterの所有者切替fixture限定)。

## 1. 範囲と閉鎖状態

`abort-scope-evidence-oauth-handoff.ts`で、同じfixture session／Web Streams adapter／固定dispatcherをbootstrap_ownedからsource_ownedへ移す。注入した架空Responseだけを読み、global fetch・credential送信・実OAuth交換はない。OH-01の独立合成leaseをcastせず、fixture lifecycleから認識した同sessionの生成claim・AuthSnapshotIdentity／snapshot／ready参照を使う。

正式な証拠発行口は閉鎖。Unknown・全体受付無効、VM／監視／telemetry保留を維持。実session／ReleasePermit／payload receipt／worker job、本番token保持・header利用、公開BR-006契約・実transport／PDIへの接続は追加していない。設定変更・Pushも行っていない。

## 2. 接続と所有者

- 新compositionはfixture session側の`handoffClaimed`を一度確保する。構成不正後はsessionを失効させ、修正再生成を拒否。実session・per-user・既ready・二重transportは拒否する。
- 固定dispatcherは最初からOAuthの固定POST／source側の固定GET分岐を持ち、同じ注入関数を使う。adoptで関数・URL・query・fields・Update Set・adapterを受け取り直さない。
- OAuthは既存state machine／adapterで実read・EOF・decode・cleanupを観測する。pinReadyは同予算が生成したfixture ready参照を使い、返却scalarを証拠にしない。finally後のidle・timer・scratch・body・cleanup・normal cutoffをoffer／adoptで再検査する。
- 同closureのopaque ticketをadoptが先に消費し、検査成功後に同期commit。古いbootstrap run／close／cancelや消費済み・clone・foreign ticketは新sourceを停止しない。root／session取消は移譲後も同machineを停止する。
- adapterを一回だけ生成し、C/G/P/E/R／retry／開始時計・Response／stream WeakSetを維持する。offer／adoptのdispatch／chunk／payload課金・予約変化は0。
- source laneは固定親GETのone-shot probeだけ。必要列投影後に破棄し、outcome／synthetic／evidence disabledだけを返す。row／本文／body receipt／machine／permitは返さない。

## 3. 合成36ケース

`tests/review/abort-scope-evidence-oauth-handoff.test.ts`。

| 観点 | 確認内容 |
|---|---|
| 単一生成・会計 | adapter factory 1回、二つ目のtransport／bootstrap拒否、offer／adoptの会計差分0、POST→GETの要求数・受信bytesを独立に集計 |
| 固定dispatcher | POST descriptorと共通builderによる親GETを完全比較。payload／release_rows／OAuthのGET化、不正table名を拒否 |
| 同adapterの継続 | 同一Responseと、異なるResponse wrapperが示す同一streamの移譲後再利用を拒否し、cleanup不明をstickyに保持 |
| ready／finally | OAuth pending／callback内／未消費bodyではhandoff不可。adapter-finally後のみcheckpoint成功 |
| stale操作・混入 | bootstrap再実行／close／cancel、duplicate／foreign／clone ticketを拒否し、正当なsource laneは継続可能 |
| root authority | 移譲後のroot cancel／close／session失効で次GETなし。read pending時も同じ停止理由を保持してcancelを一度要求し、timer／scratchを解放 |
| 失敗・再開拒否 | OAuth 400／401／403／503枯渇、不正構成の修正再投入、実／per-user sessionを拒否。先行primaryを後のcloseで上書きしない |
| retry | 429／503後のcleanup済みretryで同じC/G/Rを保持。過去のlast_failureを残し、第三試行なし |
| 期限・競合 | 元の100ms／60sのnormal／hard境界を維持。採用中のclock再入cancel／closeでcommitしない |
| 秘密・閉鎖 | 架空token／refresh／例外文がsummary／diagnosticに出ない。source close後の再bootstrap不可、global fetch未呼出し |

reader解放後のnative Response constructorはdisturbed streamを拒否するため、stream再利用試験は敵対的なResponse body overrideでadapterまで同じstream参照を届ける。実HTTP応答の再構築を保証する試験ではない。

## 4. 検証履歴

1. 初回31ケースは29成功／2失敗。1件は`expect(...).ok`の括弧位置の誤り。もう1件は再利用streamをnative Response constructorが先に拒否し、adapterへ届いていなかった。最小確認でもTypeErrorを確認し、試験をbody overrideへ変更した。実装のWeakSet拒否は弱めていない。
2. 初回buildは、新規lifecycle closureが捕捉するWeakMap lookupの型絞り込みで5件のTS18048。存在検査後の参照を別constへ固定し、bindingの意味を変えずに修正した。
3. 追加したcleanup未確認試験は、既定10秒の試行期限に対してfake clockを1秒しか進めずtimeout。既存の試行期限を確認し、fixtureだけを低減した`requestTimeoutMs=1000`に合わせた。製品の既定値・テストtimeoutの延長・skipは行っていない。
4. 新規35ケースと既存OAuth／fixed-source／Web Streamsの関連4ファイル：139件成功。最後にglobal fetch拒否spyとsource close試験を加え、新規36ケースにした。
5. `bdo npm run build`：成功。
6. `bdo proxy node node_modules/vitest/vitest.mjs run --maxWorkers=3`：159ファイル／4,654件成功（33.13秒）。合成内のローカルHTTP試験には待受許可を使用。PDI E2Eや実transport検証は含まない。
7. ESLint APIでsrc／tests全体：0 errors／既存374 warnings。変更6ファイルの個別確認は0 errors／0 warnings。
8. offline梱包試験は一時cacheの`zod-to-json-schema@3.25.2`不足でENOTCACHED。公式npm registryから一時cacheへの不足分取得を許可して再実行し、production-only install／worker解析・集約／MCP／fixture境界smokeが377ファイルで成功。リポジトリの依存設定は変更していない。新規moduleも既存`!dist/review/abort-scope-evidence*`の非同梱assertに含まれる。
9. 更新4文書の相対Markdown参照26件に欠落なし。`bdo git -c core.fsmonitor=false diff --check`は空白エラーなし。

### 4.1 コミット対象だけの再検証（2026-10-27）

OH-02の11ファイルだけをstageし、indexの全tracked treeを新しい一時ディレクトリへ書き出した。未追跡の`.vscode/`／`CLAUDE.md`や他の作業ファイルは含めず、依存物だけ既存node_modulesを参照した。

- 隔離したtreeでbuild成功。
- 同treeで並列数3の全体合成テスト：159ファイル／4,654件成功（30.13秒）。ローカルHTTP試験の待受を許可し、PDI E2Eは実行していない。
- 同treeでESLint：0 errors／既存374 warnings。
- 同treeでoffline梱包検証：377ファイル、production-only install／worker解析・集約／MCP／fixture境界smoke成功。

上記結果の追記だけを同じ検証記録へ行い、ソース・テスト・設定は再検証後に変更していない。

## 5. 残課題

OH-03で同transportを既存固定sourceのprivate採用入口へ接続し、prepare／table初回／最終／delivery／worker・上位結果を検証する。OH-02の親probeはその代替ではなく、R=4の予約をfinalで0へ解放するところまでは行わない。probe済みadapterを後付け登録する口は作っていない。

`stats().timers`はadapterの試行待機timerだけを数える。fixture session自身のhard timerはcreatorが最後にsession.closeで解除する既存責務を維持し、試験もafterEachで閉じる。root停止だけで親sessionのtimer消失や、未決着Promise・socketの物理消失まで証明したものではない。

全体C=7／retry時8・G/Eの全chunk一致・R=0の独立oracle、正式なsession／ReleasePermit／選択payload／worker jobの由来、実wall-clock、全体work／保持上界、本番cap・終了policy・実機検証は未確認。OH-02の成功を公開レビュー結果の確定や本番permit発行へ昇格させない。
