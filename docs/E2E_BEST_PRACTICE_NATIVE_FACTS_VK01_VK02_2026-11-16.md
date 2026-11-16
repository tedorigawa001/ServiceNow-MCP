# VK01とVK02の値kernelと旧root接続の検証記録

Date: 2026-11-16。基準HEAD: `02ed9f7`。設計：[BG02 draft-0.2](BEST_PRACTICE_NATIVE_DIAGNOSTIC_BG02_BOUNDARY_DESIGN.md)。

## 実装範囲

[値kernel](../src/review/abort-scope-evidence-native-diagnostic-facts.ts)へcleanup理由優先順とfacts eligibilityだけを抽出し、[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)から呼ぶ。値関数は非権限で、同owner／binding／current／anchor／record／cleanup／readerの私有照合、claim、bridge、frame、queue／join、cleanup実操作、snapshot／sealは旧rootに残る。

VK01は元と同じ理由確定点で、releaseLock前のcancel／closed事実と後のrelease結果を使う。VK02のno-body判定は所有／closed捕捉フラグを新たに要求しない。read_started／read_pendingは元型の固定falseを維持し、型外入力への新しいstrict validatorを追加しない。rootの局所照合は自recordの固定dataだけを読み、native getter・budget・schedulerの追加呼出しはない。

正式発行口／新LM03／C実行入口／body起動閉鎖、全体受付無効、Unknown、通常経路未切替、調査保留と各未承認事項を維持する。旧実class／sourceは既存fake I/O回帰としてのみ使い、新たな実接続・実transport／worker・実通信・設定変更・Pushは行わない。

## 試験の先行失敗と切り分け

| 段階 | 観測と対応 |
|---|---|
| VK01のRED | 値kernel未作成でsuite load失敗、0件実行・exit 1。理由関数を作成すると先行1件が成功 |
| VK02のRED | 関数未実装で`nativeCleanupFactsEligible is not a function`、2件中1失敗。実装後は2件成功 |
| 独立oracle初回 | 旧root接続前、3file・96件中95成功／1失敗。隣接するcancel未完了／拒否の交換にも例外を要求した試験が不適切だった。両者は同じfieldの排他的値であり、5,760入力全体の隣接交換差分数は`864, 0, 108, 162, 42`。差0の1交換を等価として別計上し、実装を変えず96件成功 |
| 能力遮断条件の初回 | 6file・211件中210成功／1失敗。Vitestの変換namespaceは宣言順、実Node ESMは辞書順で2exportを列挙した。集合としてのsurfaceが同一であることを確認し、source側試験だけsort比較へ変更。compiled側は実Nodeの2exportも確認する |

この2つの試験側不備は製品の退行・環境timeoutとして扱わず、期限や並列度は変えていない。旧試験・旧期待値を直して成功させたわけではない。

## 独立oracleと負の対照

[oracle](../tests/review/fixtures/native-diagnostic-facts-oracle.mjs)は旧runnerのactualを採取せず、順序付きobligation表と必要facts／操作数のtupleから期待値を作る。

- 理由はbody有無・所有2値・捕捉2値・cancel5値・closed4値・release4値・issue9値の5,760通り。
- eligibilityはfacts640通りと、mode別のcleanup variant・理由／issue・操作数の負数／0／1／2／小数／NaN／Infinity等を合わせた752通り。
- 区別できる隣接優先順交換4件、常時true／常時false／body反転の3件を拒否。cancelの等価交換1件は拒否成功へ加算しない。
- compiled JSの`reader_owner_unknown`を`cancel_pending`へ変える実際の変異を、元anchorが1か所であることを確認した上でfresh ESM URLから実行し、oracleが拒否する。入力は固定dist JSのみでTS／source fallbackはない。
- [構文audit](../tests/review/fixtures/native-diagnostic-facts-audit.mjs)はruntime import／reexport／dynamic import、clock／native／registry／Promise／timerを検査し、9つの混入負対照を拒否。sourceでは唯一のimportがstateへの型importであることも確認する。

## 接続回帰と実行結果

commandはすべて`bdo`経由。元の5秒期限・既定並列度、旧比較child60秒、製品全体60秒は変更しない。

| 検査 | 結果 |
|---|---|
| `npm run type-check` | exit 0 |
| `npm run build` | exit 0。既存tsconfigのまま。専用U/D buildではない |
| 変更4 TS fileのESLint | exit 0。リポジトリ全lintではない |
| source回帰6file | 211件成功・exit 0。既存197件＋新規14件。値試験6件、旧root連続試験8件を追加 |
| 新compiled値fixture | exit 0。5,760＋752入力、7拒否／1等価対照、実JS変異、9依存／能力負対照を確認 |
| 既存compiled 4fixture | BG01 pure、旧ND-01、ND-02、ND-03すべてexit 0。既存fixture本文・期待値は変更しない |
| `.mjs`構文検査 | 新oracle／audit／compiledと既存HTTP pack scriptの計4fileがexit 0 |
| offline梱包dry-run＋監査 | exit 0。441file・436 runtime artifactを確認。新kernelのJS／宣言／map計4artifactの同梱0、runtime参照0。4suffix混入＋参照混入の5負対照を拒否 |

[値試験](../tests/review/native-diagnostic-facts.test.ts)はclock／native constructor／transportを使えない条件でもkernelをimportして全値を確認する。[旧root連続試験](../tests/review/native-diagnostic-facts-workflow.test.ts)は旧ND-02→ND-03と逆順、body有無の計4caseで同Response再利用を拒否し、fetch呼出し0とstream解放を確認する。別の4caseでは、copyしたfactsがVK02を通ってもcopy_terminal／foreign_terminal／copy_cleanup／foreign_anchorのprivate消費が拒否され、consumed=0のままになることを確認する。

HTTP pack scriptには新kernelの非同梱監査名だけを追記した。新child実行や通常routeへの登録は追加していない。梱包確認はignore-scripts／offlineのdry-runであり、実tarball生成／展開ではない。

## 基準との照合と残課題

構文位置で新import、`clean`内の理由式、`eligible`関数だけを除いて比較すると、旧root本文は基準HEADと一致する。bridgeの4呼出し、stop・issue／consume claim、native操作・prototype捕捉、元sample履歴、finallyとjoinは不変。実class・state／pure fixture・既存ST・既存source試験4file・既存compiled2file・package／tsconfig／Vitest設定の計13fileも基準と同一である。

全体回帰・HTTP pack script全体・専用U/D/I/H artifactは未実施。今回のcompiled直接実行は将来のchild supervisorや終了／stdio契約の検証ではない。CF01〜05のprivate制御継続・resource所有、新LM03、旧UN62のcompiled移行、friend撤去・AP承認と公開判断は残す。値抽出の成功を正式bindingやcleanup責務の全面確認へ昇格しない。

## コミット前の対象限定再検証

同日、今回の13fileだけをstageし、index全体を別の空directoryへ展開した。既存dist／`.git`は持ち込まず、導入済み依存だけを参照した。build・型検査・対象4 TS fileのlintはexit 0、関連6file・211件が成功（932ms）。新値fixtureとBG01／旧ND-01／02／03のcompiled計5本、変更`.mjs`4fileの構文検査もexit 0だった。offline梱包dry-runは441file・436 runtime artifact、新kernelの4artifact同梱0・参照0、5負の対照拒否で成功した。元の期限・並列度と各閉鎖条件を維持する。再検証後の追記は本節だけで、検証した実装・試験入力を変更しない。全体回帰・実tarball展開は未実施のまま、Pushは行わない。
