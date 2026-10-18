# BP-5 R-2：固定GET本人確認・メモリ内token引渡しの合成検証

Date: 2026-10-18 / Status: 内部PoCの合成検証。実PDI・実OAuth・実ACLの検証ではない。

## 1. 範囲

[設計案](BEST_PRACTICE_BP5_R2_IDENTITY_TOKEN_DESIGN.md)のうち、交換後に信頼済み内部呼出し元から
渡されるtokenの保持、固定GET、許可発行、同一プロセスMCP、終了処理を実装した。
OAuth認可/交換、実token発行、callback接続、登録/ロール/ACL/設定変更は行っていない。
telemetry調査・maint担当者への連絡は保留を維持する。

- `src/review/r2-session.ts`：固定GETと不透明permit、1セッション1レビュー、固定対象、寿命・Abort・close。
- `src/review/r2-mcp-bridge.ts`：SDKのInMemoryTransport上にレビューtoolだけを提示し、既存の
  `executeBestPracticeToolCall`→bounded取得→XML/AST解析→集約workerへ接続する。
  汎用server.ts/HTTP/stdioの認証や公開tool引数は変更しない。CLI/サーバー起動からは未接続。
- `src/servicenow/bounded-read.ts`：close時に隔離snapshotのper-user/access token参照も破棄。
  元の利用者設定は変更しない。worker終了前に同時実行枠を早期解放しない。
- `src/tools/best-practice.ts`：内部contextから既存の信頼済みworkerFactoryを渡せるようにした。
  実workerを停止不能な状態に置くOS境界の合成試験用で、tool引数からは指定できない。

ServiceNowのHTTP境界はすべて合成fetch。実SDK・既存tool executor・実workerを使うが、
プロセス全体の汎用dispatch/パッケージ別tool権限の検証や、実stdio/HTTPのper-user供給試験とは数えない。

## 2. 確認した動作

| 観点 | 合成試験で確認したこと |
|---|---|
| 固定GET | 固定origin、sys_user、定数の現在ユーザーquery、sys_idのみ、limit=2、Bearer、redirect拒否、cookieなし |
| 受理条件 | 1件の期待ID一致だけを受理。0/複数、別ID、表示値オブジェクト、余分なfield、不正JSON、重複/エスケープ重複キーを拒否 |
| 上流失敗 | 401/403/404/302/429/500で安全側停止。エラー本文を返さず、自動再試行なし |
| 上限/中断 | 本文の受信上限、非協調fetchの時間切れ・遅延応答cancel、body待ち中close、外部Abortを確認 |
| 停止理由 | キャンセルと上流例外が競合しても先に確定したcancel理由を保持 |
| permit | 未確認・他セッション・複製permit、別Update Set、instance追加、token追加入力をBP-5取得前に拒否 |
| 寿命 | 期限は認可交換開始相当の単調時計から計算。レビュー開始時に残り60秒ちょうどなら拒否。未使用permitの期限切れも確認 |
| MCPとC方式 | 実SDK list/callで既存0.3契約に到達。非管理者を模したrelease 403＋運用者設定でasserted/partial、BR解析1件/候補1件 |
| 本文・秘密非露出 | 正常結果にコード本文/秘密マーカーなし。不正入力・上流失敗のMCP応答および主プロセスstdout/stderrに秘密マーカーなし。sessionのJSON/inspectも秘密非露出 |
| 1回限り | 成功/失敗後はtoken参照を破棄し、permitを再利用しても追加取得しない。並行reviewはreview_busy |
| SDK cancel/切断 | 実MCP callのcancelでpayload I/OをAbort。SDK切断で未使用の確認済みsessionもclose |
| CPU終了 | 非協調analyze/finish workerをcloseで終了し、threadId=-1・message購読解除を確認。workerへのtoken/本人ID非伝達も確認 |
| 資源 | 終了後に同じ資格情報キーの取得枠を再取得可能。閉じたsnapshotにtoken文字列なし。期限切れ後のタイマー/外部Abort購読解除、冪等closeを確認 |

件数は回帰テスト数であり、独立したセキュリティ評価標本数や最小権限の実証ではない。
固定評価セットのケース・期待値は変更していない。

## 3. 実行と結果

```bash
bdo npm test -- tests/review/r2-session.test.ts tests/review/r2-mcp.test.ts
bdo npm run type-check
bdo npx --no-install eslint src/review/r2-session.ts src/review/r2-mcp-bridge.ts tests/review/r2-session.test.ts tests/review/r2-mcp.test.ts src/servicenow/bounded-read.ts src/tools/best-practice.ts
bdo npm test
bdo npm run test:pack
```

- 新規合成：2ファイル・40テスト成功。
- TypeScript型検査・変更対象のESLint成功。
- 全体回帰：104ファイル・2,546テスト成功（実機E2Eは対象外）。
- 梱包：本番依存のみのインストール＋既定workerの解析/集約成功。公開はしていない。
  当初は369 files（R-2のdist 8ファイルを含む）だったが、未登録のPoCをnpmへ含めない方針により
  `package.json`へ`!dist/review/r2-*`を追加し、梱包試験でも非同梱を検査した。除外後は361 files。
  同梱の製品モジュールからR-2ファイルへの参照はない。
- ビルド済みR-2 bridgeのimportも成功（リポジトリのdistでの確認。npm配布物には含まれない）。
  import時のネットワーク接続・token交換なし。

初回梱包試験はsandbox内からnpmキャッシュへ書けずEPERMで停止した。所有者/権限の変更はせず、
実行権限を得て同じ梱包試験を再実行した。npmが表示した一般的なroot所有の説明だけを実原因と断定しない。
初期テストではモジュール/未実装methodの失敗を確認し、次に実装した。
追加のAbort競合テストで理由が置き換わる失敗を検出し、停止理由の優先を修正して再検証した。

## 4. 秘密の所有と終了処理の限界

sessionのtokenはプライベート状態で、共有client/registry/env/ファイルへ書かない。
確認成功で発行するpermitは空の凍結オブジェクトで、同一性を内部検証する。
専用clientのbounded snapshotだけにtokenを渡し、worker終了後のcloseで参照を除去する。
call終了、cancel、期限、SDK切断、transport errorは終了経路へ集約し、HTTP原例外は結果に含めない。
closeはpending処理の終了を最大2秒待ち、超過は固定review_failedとして失敗させる。

JS文字列の完全消去、呼出し元/HTTP実装が保持する参照の消去、OSメモリ/ダンプからの除去は保証しない。
今回のライブラリはprocess.exitやSIGINT/SIGTERMハンドラーを登録しない。実行runner側が終了signalを
Abort/closeへ接続する工程と、G0のcallback/code/verifier管理との接続は未実装。
サーバー上のtoken失効・同意取消はしておらず、ローカル破棄を失効成功とは報告しない。

## 5. 未確認・次工程

1. R-2利用者での固定現在ユーザーqueryの評価とsys_user自己参照ACL。合成JSON一致は実本人性の証明ではない。
2. Public Client/S256/loopback、実交換応答のtoken_type・scope省略条件、本人同意とtoken寿命の承認。
3. R-2利用者・ロール・新設ACLの作成/復旧、C方式の信頼済みファイル/専用binding配置。いずれも未実施。
4. 実PDIアダプター/runnerからの安全な供給、OS終了処理。既存CLI/環境変数への代替は行わない。
5. 実stdio/HTTPへ同じ秘密を安全に渡す経路は未設計/未実装。同一プロセスMCPの結果を流用しない。

固定GETの仕様/実挙動の承認が得られなければ実機では停止する。実装があることを実行許可としない。
