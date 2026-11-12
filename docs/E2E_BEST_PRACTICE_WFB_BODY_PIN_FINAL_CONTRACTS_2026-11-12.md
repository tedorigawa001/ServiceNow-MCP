# WF-B：(C-a)狭い型・先行scalar・診断seal・単一cacheの閉鎖契約

Date: 2026-11-12 / Version: draft-0.2 / 基準HEAD: `8e3f043140ba3f824c507ebd9ad57d782aa89570`。

対象は[C詳細設計§15](BEST_PRACTICE_WFB_BODY_PIN_FINAL_RETURN_CACHE_DESIGN.md)だけ。実装開始時のworktreeはクリーン。旧A/Bのレビュー・等価判断・compiled対照を保持する。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持し、実接続・実通信・実機操作・設定変更・Pushは行わない。draft-0.1の実装時にはコミットせず、その後のユーザー指示に基づく対象限定の再検証を末尾へ追記する。

## 実装と非接続境界

createProbeBodyPinFinalContractsFakeはpackage除外の合成契約shell。同CanonicalGateDraftRootへconstructor固定mode・10先行scalar・狭い有限型を追加し、既存#failure／#closed／#fixedを使う。新owner・source・pin・利用claimを作らず、旧prepare／close／fail／replyやcalleeへは接続しない。factoryのcheck／seal／materialize／publish／closeは原始codeだけ、inspectは凍結plainの有限診断だけを返す。terminal cacheや参照登録口を公開しない。

sealは同rootに一度だけ記録。開始前closeのfirst noneも確定値であり、後発入力はdeliveryFirstへ分離する。先行input_rejectedを上書きしない。materializeはseal前にnot_ready、開始claimを先に消費し、最大1回の生成／freeze後にG_C（#fixed=candidate→private_cached）だけを記録する。生成／freeze失敗はfailed_empty、保持後失敗はfailed_cached。再生成・cache交換・clear・cleanup補完なし。終端cacheのstrict10項目は全閉鎖値・ok=falseである。

publishはpublication_not_connectedだけ。publicEntryBusy=false／rootEntryExit=not_observedを変更せず、replayable writerも0。private_cachedや同値copyから実公開資格を作らない。672組のphase正例／負例は値の関係検査であり、実入口の復帰証拠ではない。保持後throwは合成scriptによる所有保持の対照で、実outer finallyや実closeを接続した試験ではない。

最終点／completionはnone、最終marker writerは0。最終post・accepted返却・PC08・C-03・構築ready・body起動は未接続。C-bの全generic writer／reader・外側frame境界を集約する前に、この合成shellを実sourceへ差し替えない。

## RED／GREENと初回結果

最初のtracer1件はfactory未実装のTypeErrorでRED。閉鎖factory・先行field・seal／単一materializer・公開固定拒否を追加してGREEN。その後、開始前close／先行input／3種生成故障／再入／入力hook 0／凍結有限projectionと、原始5操作の25組prefixを独立event oracleで追加し、34件成功。期限・期待値を緩めていない。

初回compiledはcache破棄変異とfactory固定flag監査の追加前にexit 0。その2対照を追加した最終版も、新旧31本の実行でexit 0を確認した。これを全CのFRT条件の達成へ算入しない。旧export期待値の2箇所へ新しい開発factory名だけを追記し、runtime／旧facade exportは不変。

## compiled保証

| 対象 | 独立確認 |
|---|---|
| cache実参照 | scratchでだけ既存#fixedを観測し、strict10項目・freeze・plain prototype、同rootの再操作で同参照、別rootの同値objectは別参照を確認 |
| 6故障対照 | seal guard除去、attempt guard除去、seal前受付除去、delivery初回guard除去、保持後catchでのcache破棄、freeze自体のthrow。診断・cache参照・失敗phaseの意味的差を確認 |
| finite oracle | 7phase候補×retained×attempted×sealed×busy×3exit×frameの672組。余分なfield・不正boolean・foreign exitも拒否。実装checker／builderを期待値へimportしない |
| AST固定 | G_Cのfreeze直後の2代入、C用#fixed writer1、先行10scalar、公開methodのliteral拒否、公開／退出／final点／completion／replayable writer0、旧構築flag全false、legacy routing呼出し0 |
| semantic compile-fail | 不正cache相関3行・最終点／completion／delivery／disposition4行・private field3行・公開projection／返値からの資格復元2行、計12行を拒否 |

## 実装時点の検証結果

| 検証 | 結果 |
|---|---|
| 新合成 | 34件成功、失敗0 |
| 関連合成回帰 | 41ファイル3,026件成功、失敗0（新34件を含む） |
| 新compiled | exit 0。672組・型拒否12行・6故障対照・AST境界を確認 |
| 新旧compiled31本 | 全31本exit 0、失敗／timeout 0。各processの外側60,000ms上限は維持 |
| strict TypeScript | composition・body試験・composition試験の明示対象でexit 0 |
| build | exit 0 |
| lint | 変更したfixture／compiled2件／試験2件の5ファイルでexit 0 |
| 梱包dry-run | exit 0。441files、src／tests／新fixture混入0、dist/review/review-worker.jsあり。ignore-scripts／offline、実archive生成／導入なし |
| 文書／差分 | 文書4件・ローカル参照38件に欠落0、30表の列数整合。行末空白なし、diff --check成功。変更10ファイルだけ、index空、HEAD不変 |

全体Vitest／実package-worker試験・実worker／transport・実source照合・トークン／permit発行は実行していない。関連3,026件の成功を全体回帰の完了とは呼ばない。

実行範囲：関連合成はprobe-*.test.tsとcomposition／start／value／read-hash／source-map／pending／canonical／journal／writer／admission／retirementの既存群。strictはcomposition fixture・probe-body-*.test.ts・composition試験へ明示適用した。buildはnpm run build、梱包はnpm pack --dry-run --json --ignore-scripts --offlineで、各検証の実コマンドはbdo経由。compiledはcompiled-probe-body-pin-final-contracts.mjsと既存30本を固定リストで実行し、各processへ60,000msの外側上限を適用した。

## 費目・未解消事項

固定modeと10scalarは同classの先行fieldなので、旧modeのrootにも初期化される。旧分岐・返答・期待値・期限は変更しない。終端生成／freezeは最大1回、inspectの非終端診断object・固定facade／closures・有限checkerは別費目。新clock・deadline・cap・無制限履歴・retryはない。実layout・allocation／GC／OOM・全体work・停止後解消予約・診断／配送必着はUnknown。

次段階はC-bのfresh C入口・全早期失敗／cache reader集約・実外側入場／復帰境界を固定拒否のまま接続すること。C-cの最終post→literal accepted→元callerの未接続停止はその後に一体接続する。旧A/Bの等価節は元範囲の履歴であり、C-b／C-cの保証へ自動転用しない。

## コミット対象だけの隔離再検証（2026-11-12）

同じ基準HEADを一時ディレクトリへ書き出し、今回の10ファイルだけを反映した。既存node_modulesだけを参照し、依存の導入・設定変更は行わない。worktreeと隔離コピーの10ファイルのSHA-256一致を確認し、その他の未コミット内容を持ち込まず、隔離コピー上で再実行した。

build・strict TypeScript・変更5ファイルのlintはexit 0。関連合成は41ファイル3,026件成功、失敗0。梱包dry-runは441files、src／tests／fixture混入0、workerあり、実archive生成／導入なし。新旧compiled31本はすべてexit 0、失敗／timeout 0。各processの外側60,000ms上限は変更していない。

この追記は検証記録だけで、実装・テスト・manifest／lockfile・設定を追加変更していない。最終post・accepted返却・PC08・C-03・body・実公開は未接続のまま。検証後はこの記録だけを隔離コピーへ同期し、対象全byteの一致・文書整合・差分・indexの対象を確認してから保存する。Pushは行わない。
