# R2テスト：段階到達待ちとrunner終端の合流・finally後始末

Date: 2026-10-24 / Source baseline: `c95cc89`
Status: テスト専用の改善・合成検証。過去の自然失敗3件の原因確定や製品不具合修正を主張しない。

## 1. 対象と維持条件

[前回の切り分け](E2E_BEST_PRACTICE_R2_CALLBACK_TIMEOUT_INVESTIGATION_2026-10-24.md)で確認した、runnerが終わってもexchange到達通知だけを待ち続ける経路を改善する。対象はnon-cooperative exchange／identity／payloadの3テストと、新しい合成対照。

製品385秒／cleanup 3秒、監督preflight 5秒、各既存テスト・fixture・Vitest設定の期限は変更しない。現在のreal-hostプロジェクト既定は30秒で、この3テストはその既定を使用する。前回記録の「10秒」は過去失敗時の記録であり、現行3テストの明示timeout値ではない。今回新しい待合せ用timerやretryは追加しない。

製品ソース・設定・待受ポート・OS接続は変更しない。実機操作・実トークン発行・設定変更・Pushは行わない。VM／監視・telemetry調査保留、Unknown・全体受付無効を維持する。

## 2. テスト専用の待合せと所有権

`tests/review/fixtures/r2-stage-scope.ts`の`withR2Stage`は、次の3つを合流する。

1. 期待する段階への到達通知。
2. runnerの終端（rejectも直ちに観測する）。
3. Vitestのtest-context signal（timeout／実行取消）。`each`の値引数へcontextは追加されないため、既存beforeEachで取得する。

段階へ到達した場合だけ従来の取消・機密破棄のassertionを実行する。先に終端へ達した場合は`R2_STAGE_NOT_REACHED:<固定理由>`を投げ、callback_unavailableを成功やskipに置き換えない。理由は許可語彙、completed、other、runner_rejected、test_cancelledに限定し、生の例外・token・URL・本文を使わない。cleanupはcomplete／incomplete／unconfirmedを区別する。

到達待ち・本文assertionをtry/finallyで囲み、finallyでrootをabortし、runnerの終端Promiseをawaitしてからscope signal購読を外す。assertionが投げた場合も取消・終了待ちを実行し、元のassertionを保持する。製品runnerの取消／cleanup期限に従い、helperが別の延長枠を作ることはない。

これはテストの後始末であり、任意の非協力Promiseを強制終了するOS監督器ではない。Vitestの外側timeoutを無効にするものでもない。runnerがrejectした場合はcleanup確認不能を明示し、確認済みとしない。

## 3. 合成対照

- runner終端先行：到達Promiseが未解決でも固定理由で失敗し、段階後の本文を呼ばない。
- finally：本文assertion失敗後にroot取消が起き、遅延したcleanupを解決するまでhelperが返らず、元のassertionを保持する。
- test scope：待合せ中／開始前の取消でrootへ伝播し、購読が残らない。生の取消reasonは露出しない。単体対照ではAbortControllerでsignalを発火し、実際のVitest timeoutを延長・意図的に発生させてはいない。
- 例外／未知code：固定語彙へ正規化。cleanup未確認と不成立も区別する。
- 実runner＋制御したポート占有：exchange未到達をcallback_unavailableで失敗させ、fetch・段階後の本文は0回。cleanup完了、root購読と観測HTTP待受0件を確認し、占有者は維持する。
- 実runner＋exchange到達直後のassertion失敗：finallyによる取消、request signal取消、runner cleanup完了、root購読・観測HTTP待受0件を確認する。

ここで「実runner」はローカルの製品runnerを疑似HTTPS境界で動かす意味であり、PDI通信ではない。制御用net.Serverはテスト自身が所有し、finallyで閉じる。観測HTTP待受0件は外部のポート非占有を証明しない。

## 4. 実行記録と初回失敗

1. RED対照：従来の`await reached`だけの待合せで新規終端先行テストを実行し、runner終了後もhelperが未解決になるassertion失敗を確認（1失敗）。対照ではassertion前に到達通知を解放し、長いtimeout待ちはしていない。
2. 合流実装後：最初の終端先行テストは成功。helper単体6ケースも成功。
3. 初回接続実行：4失敗／1成功／109 filter対象外、未捕捉EADDRINUSE 1件。3件は`each`の第2引数contextがundefinedで、helperへ入る前にTypeError。起動済みrunnerの後始末へ進まず、後続の占有用Serverもbindできず30秒timeoutとなった。製品の期限を延長せず、context signalをbeforeEachから取得し、追加した占有対照のbindエラーもrejectとして観測するよう修正した。
4. 修正後の同一選択実行：5成功／109 filter対象外、2.90秒。自動retryは使っていない。

5. 最終関連回帰：`r2-stage-scope.test.ts`（7件）、`r2-loopback.test.ts`（114件）、`r2-supervisor.test.ts`（44件）を`--maxWorkers=1`で実行し、**165件成功、49.98秒**。retryなし。これは3ファイル合計の実行時間で、個別の製品・テスト期限の延長ではない。
6. `npm run build`成功、変更したテスト3ファイルのESLint指摘なし、`git diff --check`成功。製品`src/review`・Vitest設定・既存host fixtureに差分なし。
7. コミット前に同じ3ファイルを`--maxWorkers=1`で再確認：165件成功、56.12秒。ビルド・変更テスト3ファイルのESLintも再度成功。期限変更・自動retryなし。

全リポジトリ回帰・全体MCP E2E・PDI E2Eは今回の対象外。

## 5. 残る限界

後続の[2026-10-25全体合成回帰](E2E_SYNTHETIC_FULL_REGRESSION_2026-10-25.md)では129ファイル・3,444件が成功し、R2の19ファイル・625件も全件成功した。中断して結果未回収の実行とは区別して記録する。

過去3件が実際にポート占有や到達待ちだけで失敗したかは未確定。自然発生する負荷や子host内部のbind原因の証明は今回行っていない。前回の失敗履歴は保持し、今回のテスト改善と分離する。
