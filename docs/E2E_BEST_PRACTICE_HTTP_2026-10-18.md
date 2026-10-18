# BP-5：実HTTP通信のMCP E2E

Date: 2026-10-18 / macOS、Node v24.18.0。製品ランタイム・依存・固定評価セット・PDI設定は変更しない。

## 1. 検証経路

本番ビルドのdist/server.jsを別Nodeプロセスで起動し、MCP_TRANSPORT=httpで
127.0.0.1の一時ポートに待受。SDKのStreamableHTTPClientTransportから実際のHTTP POST/GET/SSE/DELETEを使う。
MCPサーバー/HTTP認証/セッション管理/dispatch/取得/解析/集約/workerは実物。
ServiceNowのfetchだけをテスト専用preloadで合成する。ハンドラー直接呼出しやInMemoryTransportではない。

**PDI接続・書き込みは行わない**。外部HTTP境界は固定合成ホストの指定3テーブルGET以外を拒否し、
実ネットワークへ委譲しない。実PDIのACLや資格情報を確認したものではない。
[stdio E2E](E2E_BEST_PRACTICE_STDIO_2026-10-18.md)と[PDI合成Client Scriptの解析正例](E2E_BEST_PRACTICE_CLIENT_FIXTURE_2026-10-18.md)とは別の検証。

## 2. 結果

1シナリオ・1テスト成功。以下は同じHTTPセッション上の確認項目であり、独立した品質評価標本ではない。

| 確認項目 | 結果 |
|---|---|
| 初期認証 | トークンなし/誤りのinitialize POSTは401、WWW-Authenticate=Bearer。セッション数0 |
| 正しい認証 | 明示BearerでSDK initialize成功、セッションID発行 |
| list | 対象ツール1件、readOnlyHint=true |
| call（省略） | 0.2契約検証成功、reviewed=1、findings=1、code_return_mode=none |
| call（review_targets） | 0.3契約検証成功、reviewed=1、findings=1、code_return_mode=none |
| セッションIDだけの利用 | 有効IDがあってもPOST/GET/DELETEすべてでトークンなし/誤りは401（6要求）。後続の正当なcallは継続可能 |
| キャンセル | payload応答待ちの開始後にSDK Abort。notifications/cancelledの送信とHTTP 202受理、上流signalのAbortを確認 |
| クライアントの中断結果 | 対象callはreject。成功した解析として扱わない |
| 回復 | 同じセッションで次のレビューが成功、reviewed=1・findings=1 |
| 入力拒否 | payload追加キーはinvalid_inputの固定JSONで拒否し、入力値を返さない |
| 上流403 | 合成エラー本文は露出せず、access_deniedを返す |
| セッション終了 | 認証付きDELETEで終了し、healthのsessions=0 |
| 非露出 | 生HTTP JSON/SSE応答、受信MCPメッセージ、子stdout/stderrに専用本文/トークン/入力/上流エラーマーカー、元XML/CDATAなし |
| 後処理 | SDK接続終了、子プロセスSIGTERM後のexit code=0、一時HOME削除 |

正常レビューも根拠未承認のPoCであり、候補の検出であって違反確定や安全性の保証ではない。

### SDKのセッション終了通知

最初は全onerrorを通信失敗として数え、終了後の1通知で失敗した。段階のみを出力して切り分け、
SDKのSSE処理が明示DELETEによる切断後もGETストリームの再接続を試みることをローカル実装で確認した。
本試験は再接続maxRetries=0のため、`Maximum reconnection attempts (0) exceeded.`が通知される。
**明示終了を開始した後、かつこの完全一致メッセージだけ**を別集計（0〜1件）する。
終了前またはそれ以外のエラーは失敗のまま。healthのセッション0と子の正常終了も必須とし、
単にエラーを無視して成功にしない。製品やSDKの終了処理は変更していない。

## 3. 安全境界と実行方法

- cwd/HOME/USERPROFILEは一時ディレクトリ。実利用者の.env/instances.jsonを使わない。
- 子には必要な合成設定だけを渡す。HTTP Bearerは試行ごとのUUID付き合成値で、
  ServiceNow用の合成per-userトークンとは別。WRITE_ENABLED/SCRIPTING_ENABLED=false。
- 親のSDK用fetchは指定したloopbackの/mcp以外を拒否。子の合成上流は実ネットワークへ接続しない。
- 生応答・診断はメモリ内で検査し、ファイル保存・コンソール出力しない。
  失敗時は固定の検証段階だけを表示する。API名の規則説明と検査対象本文は区別する。
- 空きポートの取得後に子を起動するため、予約解除と起動の間の競合を完全には排除しない。
  起動失敗はテスト失敗。未知のプロセスを停止せず、今回spawnした子だけを終了する。
- サンドボックスでlistenが禁止される環境では、loopback待受の許可が必要。
  初回はlisten EPERMで停止し、許可後に同じコマンドを実行した。

```bash
bdo npm run test:review:http
```

先に本番ビルドし、vitest.transport.config.tsでtests/transportだけを実行する。
通常npm testからは除外し、ネットワーク待受を必要としない回帰試験と分離した。
PDI向けtests/e2e設定やRUN_E2Eは使わず、通常テストの成功数へこの1件を加算しない。

追加ファイル：tests/transport/http-review.test.ts、tests/review/fixtures/http-review-boundary.mjs、
vitest.transport.config.ts。上流合成は既存のstdio-review-boundary.mjsを再利用する。
npmスクリプトと通常テストの除外設定だけを更新し、製品にテスト用入口は追加しない。

最終確認：

- `bdo npm run test:review:http`：1ファイル・1テスト成功、0スキップ、全体808ms（ビルド時間を除く）。
- `bdo npm test`：101ファイル・2,464件成功、10.08秒。HTTP専用の1件は含めない。
- `bdo npm run type-check`：成功。
- 追加テスト/fixture 2ファイルのESLint（--max-warnings 0）：エラー/警告0。
  ルートVitest設定は既存ESLint設定の対象外なので、lint成功の対象に含めない。
- 文書3ファイルのローカルMarkdown参照31件、欠落0。git diff --check成功。

TDDの最初の起動テストはpreload未作成で失敗し、合成境界を接続して認証検査が成功した。
その後にlist/call/キャンセル等を段階的に追加。既存製品の正常経路は変更不要だった。
セッション終了通知の切り分け失敗は上記に残し、単なる「通信エラー0」へ言い換えない。

## 4. 検証限界・残課題

- loopbackの平文HTTP。TLS、リバースプロキシ、ブラウザーCORS/Origin、外部ホスト公開は未検証。
- MCP_HTTP_AUTH_TOKENを設定したサーバーでのmissing/wrong/validを確認。
  サーバー側のトークン未設定、他の認証方式、最小権限/per-user/C方式の実PDI試験は別工程。
- キャンセル点はpayload応答待ち。CPU解析中・ストリーム受信中・セッション失効・同時実行の網羅ではない。
- 非露出は今回の合成データと観測チャネルに限定。全ログ/監視経路の形式的証明ではない。
- 規則カード承認、独立した人手品質評価、他OS/最低対応Node版、運用・公開承認は引き続き別課題。
