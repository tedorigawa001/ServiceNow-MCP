# BP-5：workerのnpm同梱と隔離梱包テスト

Version: bp5-packaging-0.1 / Date: 2026-10-18。
MCP登録・実機操作・公開処理は対象外。規則承認・独立人手評価・製品公開の承認とは別の機能検証である。

## 1. 梱包境界

`package.json`の`!dist/review/**`を`!dist/review/evaluation*`と`!dist/review/search*`へ変更する。
固定入口`dist/review/review-worker.js`、supervisor、XML/AST解析器、規則/根拠カタログ、
1件/集約契約、集約処理、内部アダプターをビルド済みJavaScriptとして同梱する。
通常のtsc出力の宣言・ソースマップも含む。既存のbin/distの梱包方式は維持する。

評価用ハーネス`evaluation*`と、実行時に参照されないBP-2検索PoCの`search*`は宣言/マップも除外する。src、tests、合成ケース、
開発専用`dev-worker-bootstrap.mjs`は同梱しない。tsxソース実行用の入口を本番へコピーしない。
ビルド済みworkerは固定の隣接`.js`だけを使い、ソース/tsxへのフォールバックはしない。
梱包すること自体はMCPのツール公開・登録を意味しない。

## 2. 本番依存

| 依存 | 用途 | 扱い |
|---|---|---|
| acorn 8.18.0 | AST解析 | devDependenciesからdependenciesへ移動 |
| saxes 5.0.1 | 外部実体を展開しないXML抽出/検査 | 同上 |
| xmlchars | saxesの推移依存 | lockのdev-only指定を解除 |
| zod | 1件/集約の契約検証 | 既存の本番依存を維持 |
| node:worker_threads等 | worker/ハッシュ等 | Node標準機能 |
| tsx / TypeScript / Vitest | 開発実行・ビルド・テスト | 開発依存のまま。本番workerには不要 |

依存バージョン、resolved URL、integrityの更新は行わず、package-lockを依存区分に合わせて同期する。
依存そのものをtarballへvendorする方式ではない。利用時はnpmが本番依存とその推移依存を導入する。
すべての利用者にacorn/saxes/xmlcharsが追加導入され、パッケージ容量も増える。
MCPツールはまだ登録しないため既存ツールの動作は変わらない。次回公開向けにCHANGELOGのUnreleasedへ記録する。

## 3. 再現手順と検証範囲

```bash
bdo npm run test:pack
```

ビルド後、`tests/review/package-worker.mjs`を独立したNodeプロセスで実行する。
Vitestの2,368件とは別の梱包結合テストである。`prepublishOnly`でもビルド・単体テストの後に
同じ梱包検証を実行する。検証内の`npm pack --ignore-scripts`はlifecycleを起動せず、再帰しない。

1. 実際に`npm pack --json --ignore-scripts`で一時tarballを作成する。
2. worker入口と必要なローカル実行モジュールの存在、src/tests/bootstrap/評価ハーネス/検索PoCの非同梱を検査する。
3. リポジトリ外のOS一時領域へtarballを展開し、そのpackage.jsonの本番依存を検査する。
4. 再現性のためリポジトリのlockだけをテスト用に添え、`npm ci --omit=dev --ignore-scripts
   --prefer-offline --no-audit --no-fund`で依存を導入する。lock自体を製品tarballに追加する変更ではない。
5. 合成HTTP用の既存smoke fixtureをテスト時だけ配置し、空の環境変数・loader指定なしのNodeで実行する。
   tarball内のアダプターから標準workerを起動し、XML/AST解析・候補1件・集約・整合状態を検証する。
6. 隔離領域にtsx/TypeScript/Vitestが無いことを検査し、finallyでtarball/展開先/node_modulesを削除する。

親リポジトリのnode_modulesへのリンクやNODE_PATHは使わない。ServiceNowの通信は合成fetchだけである。
依存導入のため、キャッシュが不足すればnpm registryへのアクセスが必要となる。完全オフライン試験や
新規解決される全バージョンの互換保証ではなく、現在のlockに固定した本番依存との結合確認である。
個別依存のinstallスクリプトは実行しない。公開/ログイン操作やMCPサーバー起動も行わない。

## 4. 2026-10-18 検証記録

- 修正前のtarballで`packed worker entry missing`の失敗を確認した。
- 最初はsandboxのnpmキャッシュ書込制限、次にオフライン導入のキャッシュ不足で停止した。
  権限・所有者や依存バージョンは変更せず、通常のnpmキャッシュ利用と不足分のregistry取得で検証した。
- 修正後の`bdo npm run test:pack`：357ファイルのtarballで本番依存のみの導入・解析・集約が成功。
- `bdo npm test`：95ファイル、2,368件成功。固定評価セット・結果JSON契約は変更なし。
- 梱包テストのESLint：エラー/警告0。`test:pack`に含むTypeScriptビルド成功。
- 検証環境：macOS/Node v24.18.0。Node 22.12、Windows/Linuxの梱包・起動は未検証。

### 検索PoCの除外・利用者影響の追記

- 実行時のimport経路に検索PoCが無いことを確認し、`search*`の非同梱テストを追加した。
  変更前に`search PoC must remain development-only`で失敗し、除外指定後に成功した。
- `bdo npm run test:pack`：353ファイル（357から検索PoCのJS/宣言/マップ計4ファイルを除外）。
  本番依存のみの隔離導入、標準workerの解析/集約も成功。
- `bdo npm test`：95ファイル、2,368件成功。対象ESLintはエラー/警告0。
- 本番依存追加・容量増加・未登録で既存ツール動作不変という利用者影響をCHANGELOGへ追記した。
- 内部期限で取得を早期停止して`partial`を返す処理は未対応。今回もhard deadlineの動作は変更していない。

残課題：MCP登録/dispatch/文書、許可済み読み取りE2E、権限/上限の承認、独立評価と品質/公開審査。
上記は梱包段階の検証記録。後続の[内部期限対応](BEST_PRACTICE_BP5_SOFT_DEADLINE.md)でsoft cutoffを実装し、
hard deadline時の固定エラー方針は維持する。
