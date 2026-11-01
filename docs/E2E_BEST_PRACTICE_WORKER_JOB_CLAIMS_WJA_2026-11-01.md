# WJ-A：合成issuer限定のbinding・generation／input／job claim検証

Date: 2026-11-01 / 基準HEAD: `ff49afd`。
Status: **配布対象外の純粋fakeだけ。実worker／runtime・正式な供給元／claimには未接続。**

[詳細設計draft-0.4](BEST_PRACTICE_ABORT_SCOPE_WORKER_TIME_BINDING_DESIGN.md)§11と[上位接続契約draft-0.7](BEST_PRACTICE_ABORT_SCOPE_RELEASE_COMPARISON_TIME_BINDING_DESIGN.md)を参照。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持し、実通信・設定変更・Permit発行・Pushは行わない。

## 1 実装範囲・非実行性

[tests/supportのissuer](../tests/support/review/synthetic-worker-job.ts)はruntimeのsession／source／registration／worker-supervisorをimportしない。合成identityと固定S／全L／O・Update Set idをdescriptorでpinし、同issuer内だけのbinding handle／generation／input／pending jobを管理する。fakeのworker／supervisorは不透明な値で、生成・read／postMessage／terminate等は呼ばない。runtimeの生成claimや台帳を変更・共有していない。

issuerごとにbinding一度、ready・input消費・finish一度を確認する。inputはready前に登録可能で、同origin／targetを再発行しない。analyzeはready済みgeneration・未消費input・正のsafe integer idを結合し、同generation内のid再利用／wrapを拒否する。pendingはguard前に占有、consumeはguard前に取り外す。同時pendingは1で、合成応答contextのgeneration／worker／supervisor／id／kind／targetを照合する。kindは実wireのechoではなく、この合成issuer内の固定期待値。

generationは合成のclose開始・confirmClosedを分離し、前世代の未確認終了・閉じたworker identityの再利用を拒否する。source close後は新input／generation／ready／jobを拒否し、既存pending応答と解放だけを許す。正常root close後に誤操作されてもclosed・診断を変更しない。失敗／revokeは全保有値・identity・pendingを消し、先行固定code／phaseだけを保持する。外部copyやheap物理消去は保証しない。

同じseedから別issuerを作ること自体は可能であり、実runに唯一のissuerがある証拠ではない。空の凍結handleをcopyしても別issuerのslotは消費できない。返却summary／consume dataはauthority:none／全permission=falseで、解析結果・ReleasePermit・本物の終了証拠へ昇格できない。

## 2 固定枠・未導出範囲

局所的な試験枠はgeneration 2、input 100、input一度ずつのanalyze＋finish一度の最大101 job、pending 1。独立イベント列で100 input／100 analyze／1 finishとguard 610回を照合する。各counterはpost-guard後に公開handleを返せた生成数／consume成功数で、失敗試行の全費目ではない。この試験枠を本番cap・全体work上界・全既存経路の上界導出として扱わない。

入力UTCは既存値の固定O <= T_i <= S+LとISOミリ秒形式だけを検査し、新しい時計は採取しない。inputにT_iを保持するが、連続T_iの非減少・U更新、結果のreviewed_at／retrieved_at／E、soft回復claimは未実装。合成confirmClosedはOS終了を証明しない。WJ-01／03／04／09の一部の内部claim保証と、実worker・runtime保証を混同しない。

§7の2種類のsoft移行と、停止後の部分finishは既存仕様のまま。WJ-Aの失効後に再開できないことを理由に、既存productionの部分集約を拒否する変更はしていない。停止後のfinish専用claim・WJ-B／C／Dは別工程。

## 3 試験と初回失敗

[新規153件](../tests/review/synthetic-worker-job.test.ts)は、24guard境界×停止／捕捉再入／同期revoke、混入／copy、重複生成・消費、世代順序とid、正常／異常終端、固定UTC／上限、getter／Proxy拒否、固定診断・秘密非出力を確認する。workerメソッドのgetterを持つfakeでも呼出し0を確認し、時計／I/O／実worker操作を試験issuerへ追加していない。

| REDの段階 | 観測と修正 |
|---|---|
| 基本binding／ready | stubがfreshのままで1件失敗。active／starting／readyの状態を追加してGREEN。import不在の失敗を動作REDとは数えていない |
| binding・input origin | 二重binding、同originに別target／UTCを付け直す試験が各追加時に失敗。同reference・一度限りclaim／origin・target登録でGREEN |
| analyze／finish | stubの返却値とfinish消費が各追加時に失敗。同generation／input／kind／idのslot対応を追加してGREEN |
| 終了・失効 | generation close確認、revoke、source close／root closeの試験が各追加時に失敗。合成終了確認・全失効と閉鎖後の非再開を追加してGREEN |
| pending順序 | guard内でpending=falseを観測し、期待trueの1件が失敗。analyze／finishのslotをpre-guard前に占有し、応答はpre-guard前に消費する形へ変更してGREEN |
| accessor応答 | getterを持つ応答が拒否されず1件失敗。固定fieldのdescriptor-only projectionに変更し、getter実行0で拒否することを確認 |

上記は今回のstubからの段階的実装履歴で、従来製品で同じ欠陥が実際に発生していたという主張ではない。旧試験を削除・skip・期待緩和していない。実装時のbuild・型・lint・全体合成・梱包では追加の失敗を観測していない。

## 4 検証結果

| 検証 | 結果 |
|---|---|
| 新規合成 | 1ファイル／153件成功 |
| 関連回帰 | 新規＋TB-A／B・CT-A・OU／projection・native／typed cleanup、13ファイル／467件成功 |
| build | `npm run build`成功。新issuerはtests配下なのでruntime buildへは含まれない |
| standalone TypeScript | 新試験と参照helperをstrict／noUnusedLocals／noUnusedParametersで検査、エラー0 |
| ESLint | helper・新試験・変更梱包scriptを対象として成功 |
| 全体合成 | maxWorkers=3、236ファイル／10,332件成功、失敗0・pending 0、新規153件を含む。JSON内の開始〜最終試験終了は約43.2秒 |
| オフライン梱包 | 441ファイルで増加なし。新issuerのpath／export markerがdistのJS／宣言／mapにないこと、意図的な混入文字列が拒否される負の対照を確認 |
| 合成issuerの依存検査 | TypeScriptをメモリ内で変換してAST検査。importはnode:util／zodのみ、root／動的import／reexport／require・worker生成・I/O／timer・時計採取なし。新compiled assemblyの実行保証ではない |

全体実行は`npm test -- --maxWorkers=3 --reporter=json --outputFile=/tmp/servicenow-wja-tests-20261101.json`。別build／testと重ねず実行し、製品・試験の期限を変更していない。JSONは一時成果物で恒久結果を本書に記録する。既存worker回帰とWJ-Aの合成claim試験は別保証で、全体成功を新issuerが実workerへ接続された証拠にしない。補助package-workerの依存取得試験は実行していない。

更新9文書のローカル参照136件・版数参照26件、`git diff --check`と新規ファイルの末尾改行／空白検査が成功した。runtime source・公開契約・catalog・設定・依存packageは変更していない。

コミット前確認：候補13ファイルを含むindex全体を一時コピーへ展開し、既存node_modulesだけを参照してbuild・関連13ファイル467件・新規試験とhelperのstandalone TypeScript・対象ESLint・441ファイルのオフライン梱包を再確認し、すべて成功した。候補13ファイルのbytes一致と、無関係な`.vscode/`・`CLAUDE.md`がコピーに含まれないことも確認した。全体10,332件はこのコミット前確認では再実行せず、上表の実装時結果と区別する。確認後の追加変更は本段落だけで、実装・試験は変更していない。

## 5 レビュー修正（2026-11-01）

§3・§4の153件／10,332件・依存検査の結果は修正前の記録として残す。レビューで次の2点が判明した。

- 捕捉再入の24件はguard内でbindだけを呼んでいた。bindは状態で必ず拒否されるため、`active()`からbusy claimを外す変異でも153件が成功した。analyzeのguard内からinput／closeSource、consumeのguard内からanalyze／finishを再入させ、内側が`internal_review_error`で失敗し、外側も失敗して新claim・source close・job消費を公開しないことを4件追加した。同じ変異で追加4件だけが失敗し、復元後の`cmp`一致を確認した。
- 依存検査は名前による直接呼出しだけを拒否していた。issuer末尾へ`globalThis.setTimeout`・`queueMicrotask`・`Date.now`の値参照・`performance.now.call`を足してもPASSし、AST検査自体の負の対照もなかった。検査を関数化し、I/O／timer／時計／worker系globalへの参照（object key・非computedのmember名を除く）、`Date.now`の値参照、`Date`のcomputed参照・呼出し／生成を拒否する。10種の意図的混入（global timer、microtask、clock値参照、`Date['now']`、`new Date`、`new Worker`、動的import、reexport、使用されるfs import）がすべて`AssertionError`で拒否されることを毎回確認する。上記4変異をissuerファイルへ直接加えた場合も各々失敗し、復元後に一致を確認した。字句検査であり、間接的なglobal取得を網羅した証明ではない。

修正後の結果：

| 検証 | 結果 |
|---|---|
| 新規合成 | 1ファイル／157件成功 |
| ESLint | `npm run lint`（repo全体）exit 0、errors 0 |
| オフライン梱包 | 441ファイルで増加なし。混入文字列と依存検査の負の対照を含めPASS |
| 全体合成 | maxWorkers=3、236ファイル／10,336件成功、失敗0・pending 0。JSON内の開始〜最終試験終了は約115.1秒（他の処理と並行実行） |

詳細設計はdraft-0.4へ更新し、§11の件数・保証範囲と上位設計・本書からの版数リンクを直した。runtime source・issuerの実装・公開契約・設定は変更していない。

## 6 次工程と非主張

次はWJ-B：同input receiptのT_i受理とU保持、startup／送信失敗時の扱い、analyze応答の期待値・時刻比較を独立oracleで検証する。WJ-Cの2種類のsoft回復／finish E、WJ-Dの固定供給元接続、CT-C、B-03は未実装／未実施。

日時長cap、元LとJSON宣言deadline、全体work／allocation上界はUnknown。正式発行・全体受付・本番cap投入・実source差替え・friend撤去・実通信は有効化しない。TB-Bのfinally途中継続の観測不足も今回の合成cleanupで解消したとは数えない。
