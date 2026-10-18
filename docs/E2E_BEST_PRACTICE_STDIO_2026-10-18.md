# BP-5：実stdio通信のMCP E2E

Date: 2026-10-18 / macOS、Node v24.18.0。製品実装・固定評価セット・依存・接続設定は変更しない。

## 1. 範囲と結果

SDKのStdioClientTransportで**本番ビルドのdist/server.jsを別Nodeプロセスとして直接起動**し、
stdin/stdout上のMCP initialize、tools/list、tools/call、notifications/cancelledを通した。
InMemoryTransportやhandleCallToolの直接呼び出しではない。
サーバー、dispatch、bounded取得、XML/AST解析、集約、既定の本番workerは実物を使う。

ServiceNowのHTTP境界だけはテスト専用preloadで合成応答へ置換する。これは実stdio E2Eであって、
PDIネットワーク・実ACL・実資格情報の検証ではない。PDIへの接続・書き込みは行わない。
前回の[PDI Client Script正例](E2E_BEST_PRACTICE_CLIENT_FIXTURE_2026-10-18.md)とは独立した検証。

| 確認項目 | 結果 |
|---|---|
| 起動・initialize・list | 接続成功、対象ツール1件、readOnlyHint=true |
| 省略時call | 0.2契約検証成功、reviewed=1、findings=1、code_return_mode=none |
| review_targets call | 0.3契約検証成功、reviewed=1、findings=1、code_return_mode=none |
| キャンセル送信 | SDKのAbortSignalからnotifications/cancelledがstdioへ送信された |
| サーバー側中断 | payload応答待ち開始後にキャンセルし、HTTP境界でsignalのAbortを観測 |
| クライアント側 | キャンセルしたcallはreject。正常結果の受領として扱わない |
| 回復 | 同じサーバープロセスで次のレビューが成功し、reviewed=1・findings=1 |
| 不正入力 | payload追加キーをinvalid_inputで拒否、入力値を返さない |
| 上流403 | 合成エラー本文を返さず、access_deniedの固定エラーを返す |
| 非露出 | 受信MCPメッセージとstderrに本文・トークン・入力・上流エラーの専用マーカー、元XML/CDATAが無い |
| 通信・終了 | MCPプロトコルエラー0。close後に子PIDの消滅を確認し、一時HOMEを削除 |

Vitestでは、同じstdioセッション上でこれらを順に確かめる**1シナリオ・1テスト**として数える。
独立した検出性能の標本数ではない。正常レビューも根拠承認待ちのPoCであり、違反確定を意味しない。

## 2. 安全境界

- cwd/HOME/USERPROFILEは専用の一時ディレクトリ。実利用者の.envやウィザード設定を使用しない。
- 子プロセスには合成接続先・合成per-userトークン・platform_developerを明示。
  WRITE_ENABLED=false、SCRIPTING_ENABLED=false。HTTPトランスポートは起動しない。
- preloadはfetchを実ネットワークへ委譲しない。固定合成ホスト・3テーブルのGETだけを受け付け、
  その他の取得先・メソッドは拒否する。外部API、PDI、OAuthへの通信は行わない。
- preloadはテスト専用。製品側にテスト用引数・環境変数によるHTTP差替え機能を追加しない。
  解析worker本体も差し替えない。梱包対象は従来どおりdist/bin等だけで、testsは含めない。
- 子のstderrと受信メッセージは検査のためメモリ内に保持するが出力/保存しない。
  失敗時も段階・固定コード・数値だけを表示し、原応答・コード・資格情報を例外へ含めない。
- 公式規則説明に含まれるAPI名と、検査対象のコード本文を区別する。
  API名そのものを禁止する検査ではなく、専用の本文マーカーとXML表現等を検査する。

## 3. テストと実行

- `tests/review/stdio-review.test.ts`：ビルド後、SDKの実stdioで上記シナリオを実行。
- `tests/review/fixtures/stdio-review-boundary.mjs`：外部HTTP境界だけの合成応答。

```bash
bdo npm test -- tests/review/stdio-review.test.ts
```

通常のnpm testにも含まれる。beforeAllでTypeScriptをビルドし、古いdistでの成功を避ける。
個別実行は1成功、全体2.05秒。通常テスト全体は101ファイル・2,464件成功（10.28秒）。
type-check成功、追加2ファイルのESLintはエラー/警告0。
`bdo npm run test:pack`も成功（361ファイル）。testsの非同梱、本番依存のみの隔離導入、
workerの解析/集約とMCP dispatchを再確認した。この梱包試験自体はstdio試験ではない。
最初はsandboxのnpmキャッシュ書込制限で停止し、必要な権限で同じコマンドを再実行して成功した。
キャッシュ所有権・PDI設定を変更せず、npm公開もしていない。文書リンクとdiff --checkも確認した。

## 4. 開発中の失敗と検証限界

TDDで段階的に確認した：起動用preloadなしで失敗→list成功、GET応答なしでcall失敗→実解析成功、
中断用応答なしでキャンセル検査失敗→通知/Abort/回復成功、403応答なしで固定エラー検査失敗→成功。
call検証中は規則説明中のAPI名まで本文とみなして失敗した。段階・件数のみで原因を切り分け、
本文マーカー/XMLの検査へ修正した。製品の非露出契約は緩めていない。

本試験のキャンセル点はpayload応答待ちである。stdio越しのCPU解析中・受信ストリーム途中・
同時実行競合の網羅ではない。worker強制中断と内部期限は既存の合成試験と併せて判断する。
キャンセル後のレビュー成功は枠の再利用の観測であり、全OS/全中断点の資源解放を保証しない。
非露出は今回の合成ケースと観測したチャネルに限定し、全ログ経路の形式的証明ではない。

残課題：HTTP実通信、PDIの最小権限/per-user/C方式、他OS・Node最低対応版、運用・規則承認、
独立した人手品質評価。公開校正ケースや本試験を非公開本試行48件へ転用しない。
