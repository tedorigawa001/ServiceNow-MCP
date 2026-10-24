# R2：callback_unavailable / タイムアウトの切り分け

Date: 2026-10-24 / Source baseline: `2c55ed2`
Status: 合成切り分け。自然失敗は今回未再現、過去3件の原因確定/修正完了ではない。

## 1. 範囲と変更しない条件

[CL-006検証記録](E2E_BEST_PRACTICE_UI_POLICY_CLIENT_SYNTHETIC_2026-10-24.md)に残したR2の3件を対象にした。

- non-cooperative exchange I/Oの取消テスト：過去の失敗記録は上限10秒。現行はreal-hostプロジェクト既定30秒であり、後続の改善でも変更していない。
- bearerを反映した結果の非露出テスト：callback_unavailableで期待段階に未到達。
- normal host cleanupテスト：callback_unavailableでready未到達。

製品の385秒/cleanup 3秒、監督preflight 5秒、既存テスト5秒/10秒、normal host合成fixtureの4秒/cleanup 500ms等は変更しない。製品ソース・host fixture・待受ポート・設定は変更せず、テスト専用の観測と対照を追加した。VM/監視環境の調査は保留。

## 2. 観測方法と秘密非出力

`r2-listen-diagnostics.ts`は同一テストプロセスのHTTP listen（固定127.0.0.1:18765）を観測する。元のlistenへ同じthis/引数を渡し、動作や期限を差し替えない。テスト終了時にspy/追加イベント購読を解除する。

記録は相対単調時刻、listen/listening/error/close、stage_entered/root_abort/runner_result、host_spawn/exit、cleanup確認の真偽に限定する。OSエラーはEADDRINUSE/EPERM/EACCES/EINVAL/ABORT_ERRとotherへ正規化する。runner codeも固定許可語彙以外はotherとする。最大128イベント、超過は件数だけ記録する。

HTTP内容・URL・OAuth state/code/verifier/token・利用者ID・本文・manifest path・生の例外message/stackは記録しない。失敗時だけ固定形式で出力し、成功時のsnapshotはテストmetaへ格納する。任意のcode文字列の非露出とイベント上限を合成テストで確認した。

親プロセスの観測だけで子hostのOSエラーや外部プロセスの占有者は分からない。listen数0も、外部/別プロセスのポートが空いている証明ではない。負荷計測や実機監視環境を導入したものではない。

## 3. callback_unavailableの条件

ソースではR2LoopbackListener.startのlisten失敗/起動中停止が固定のcallback_unavailableへ集約される。したがって、過去の固定コードだけでOSエラーを特定できない。

今回の対照は、本テストが所有するnet.Serverで固定ポートを一時的に占有した後、通常のrunnerを起動した。

1. HTTPのlisten_attemptに続くlisten_error=EADDRINUSEを観測。
2. runnerはcallback_unavailable、cleanup=complete、tokenMayHaveBeenIssued=false。
3. onReady/疑似fetchは呼ばれず、占有していたServerは維持される。fallbackや占有者の停止はない。
4. finallyで本テストのServerだけを閉じる。

同じ占有条件でnormal子hostを起動すると、readyに到達せず、review_failed / callback_unavailable、cleanup=complete、process_termination=confirmed、token_issuance=not_attemptedを返した。子のOSエラーそのものは親observerからは観測していないが、占有条件で元と同じ表面結果を再現した。

EPERM等の権限制約や過去の占有者は今回確認していない。特に、**この対照を過去3件のEADDRINUSE確定とは扱わない**。

## 4. タイムアウトは段階を分ける

| 状態 | 今回の確認 | 解釈 |
|---|---|---|
| exchangeへ到達した非協力I/O | stage_entered → root_abort → runner_result(cancelled)、cleanup完了。元テストは通過 | 今回は取消処理の10秒停止を再現していない |
| bindで失敗しexchange未到達 | runner_result(callback_unavailable)が先に終わり、fetchは0回・到達通知Promiseは未解決 | 元テストの`await began`だけを待つ構造ではテスト上限に達し得る |
| childがpreflight準備を返さない | 既存の合成clock境界テストで5秒時のpreflight_timeoutを確認する | callback_unavailableやexchange取消とは別段階。実負荷による遅延の再現ではない |

到達通知とrunner終了をraceする新規対照で、ポート占有時に後者が先に終了し、到達通知が未解決であることを確認した。意図的に10秒待って失敗させたり、元の10秒を延長したのではない。過去の10秒失敗時のrunner終端は記録されていないため、上記経路がその時の原因だったかは未確定。

元の非協力I/Oテストの待ち方や取消の所有権は今回修正していない。到達前にテストが止まるとローカルrootのabortへ進まない構造であることはソース上の注意点として残る。製品の取消不具合と決めつけず、次の対策候補を分けて扱う。

## 5. 実行記録

| 実行 | 結果 |
|---|---|
| 製品/テスト変更前：元3件だけ | 3成功 / 106理由付き対象外（filter）、1.24秒 |
| observer追加後：既存R2全件 | 109成功、20.70秒 |
| 元3件＋制御対照/観測検査の選択実行 | 7成功 / 105対象外（filter）、3.75秒 |
| 対照追加・段階順序確認後：R2全件 | 112成功、20.21秒 |
| `r2-supervisor.test.ts`（既存のpreflight期限境界を含む） | 44成功、0.92秒 |
| `npm run build` | 成功 |
| 変更したテスト2ファイルのESLint | 指摘なし |
| コミット前再確認：R2 loopback＋supervisor、`--maxWorkers=1` | 156成功、22.85秒。ビルド・変更テストのESLint・diff checkも成功 |

filterによる対象外はデータ不足のskipではなく、実行対象を限定したもの。テスト失敗時の自動retryは使っていない。今回の自然再現率や製品の修正効果を主張する試行数ではない。全体MCP E2E/全リポジトリ回帰/PDI検証は今回の対象外。

製品コード（`src/review`）・Vitest設定・既存host fixtureに差分はない。上記の監督テストは合成clock等による境界検証であり、過去の実負荷によるタイムアウト原因の確定ではない。

## 6. 結論と次の候補（未実装）

以下は本切り分け時点の候補。後続の[段階到達待ち・finally後始末の改善](E2E_BEST_PRACTICE_R2_STAGE_WAIT_CLEANUP_2026-10-24.md)で、テスト専用helperへの接続と合成対照を実施した。過去の自然失敗原因が確定したという意味ではない。

- callback_unavailableを出す**再現可能な条件の1つ**は固定ポート占有。元3件の自然失敗は今回再現せず、過去の実原因は未確定のまま。
- 10秒タイムアウトは「exchange取消が遅い」と即断できない。到達前のrunner終端と、到達後の取消を別々に観測する必要がある。
- 次のテスト改善候補は、到達待ちとrunner終端の合流、テストscopeの取消連携、finallyでのroot取消/終了待ち。期待した段階へ未到達なら段階を明示して失敗し、callback_unavailableを期待成功へ変えない。
- 子hostのbind原因を自然失敗時にも特定するには、秘密を含まない子プロセス専用の観測経路を別途設計する必要がある。今回は製品IPC/receiptへ診断fieldを追加していない。

いずれも今回の通過を根拠に「未解消3件を修正済み」へ変更しない。VM/監視・telemetry保留、MA-02 Unknown・全体受付無効、本番cap/完成parts/permit非発行を維持。実機操作・トークン発行・設定変更・Pushは行っていない。
