# CI失敗（trusted-config系テスト）の原因確認と修正（2026-10-22）

## 症状

`main` のGitHub Actions（Node 22.x／24.x、Coverage）が、2026-10-17の `5f01f3c` 以降のpushで毎回Test stepで失敗していた。最新の `e37b397`（run 39683005958）では3jobとも122ファイル中10ファイル・3,234テスト中142件が失敗した。対象は `tests/review/r2-*.test.ts` の8ファイル、`tests/servicenow/trusted-config-file.test.ts`、`tests/servicenow/instance-review-settings.test.ts`。いずれも `readTrustedConfigJson` が `config_untrusted` を返し、r2系は期待する理由の代わりに `manifest_untrusted` で止まっていた。macOSのローカルでは全件成功していた。

## 原因

`readTrustedConfigJson` は、設定ファイルの**全祖先ディレクトリ**について次を要求する（製品の意図した検査）。

- 所有者がrootまたは実行ユーザー
- group/otherに書込み権限がない（`mode & 0o022 == 0`）
- Linuxでは `getfacl` に権限を付与する拡張ACLがない

失敗した各テストは、Linuxでは一時ディレクトリを固定的に `process.cwd()`（CIのcheckout先）の下へ作っていた。checkoutの祖先の権限・ACLはテストではなくホストの性質であり、ここが条件を満たさないとテストが製品の拒否に当たる。

Linuxコンテナ（`node:22-bookworm`、`acl` 導入、非rootの `runner` uid 1001、checkoutを `/home/runner/work/ServiceNow-MCP/ServiceNow-MCP` に配置）で確認した。

| 祖先の状態 | 修正前 |
|---|---|
| すべて0755・拡張ACLなし | 全件成功 |
| `/home/runner/work` を0775（group書込み可） | CIと同じ `config_untrusted`／`manifest_untrusted` で失敗 |
| `/home/runner/work` に拡張ACL（`u:nobody:r-x`） | 同上で失敗 |

GitHubホストrunner上でどちらの要因が当たっているかは、runnerへ直接アクセスしていないため断定していない。いずれでも同じ症状になることを再現した。

## 修正（テストのみ）

- `tests/fixtures/trusted-temp-root.ts` に `trustedTempRoot()` を追加した。候補（Linuxは `cwd` → `$HOME` → `tmpdir`、macOSは `tmpdir` → `$HOME`）ごとに、製品と同じ規則（所有者・group/other書込み・拡張ACL。ACL判定は製品の `validateNoGrantingAcl` を使用）で**祖先全体**を検査し、最初に条件を満たす候補を返す。
- どの候補も満たさない場合は、該当パスと理由（例：`/home/runner: mode 775 is group/other-writable`）を含むエラーで止める。後段の不透明な「untrusted」失敗にしない。
- 失敗していた6箇所（r2系テストと共有fixture、trusted-config／instance-review-settingsテスト）の一時ディレクトリの基点をこのhelperに置き換えた。
- 製品の `readTrustedConfigJson` の検査は変更していない。条件を緩めていない。

## 検証

- Linuxコンテナ、修正後：
  - 拡張ACLあり：**122ファイル・3,234テストすべて成功**。
  - 0775：4回中3回は全件成功。1回だけ1件が失敗したが、同条件の再実行3回では再現しなかった。負荷に依存する既存の時間系テストの揺らぎと見られ、本修正とは無関係。
  - workspaceと `$HOME` の両方が不適合：`No trusted temp root for trusted-config tests: …` で明示的に停止した。
- macOS：`npm test` 122ファイル・3,234テストすべて成功。`type-check` 成功。lint error 0（既存の警告374件）。

## 追補：GitHub runner上の原因の特定と対処（2026-10-22）

1回目の修正（`c0704aa`）をpushしたCI（run 39685649822）は、helperの診断メッセージで失敗した。

```text
No trusted temp root for trusted-config tests: /home: extended ACL; /home: extended ACL; /tmp: mode 1777 is group/other-writable
```

GitHubホストrunnerでは **`/home` に拡張ACL** があり、checkout先（`cwd`）と `$HOME` の両方が祖先の条件を満たさない。`/tmp` も1777で使えない。既定の候補では解決できないことが確定した。

### 対処

- helperは、環境変数 `SN_MCP_TRUSTED_TEST_ROOT` があれば最初の候補として試す。設定されているだけでは信頼せず、他の候補と同じ規則で祖先全体を検査する。
- CI（Build & Testの両Node版とCoverage）のテスト直前に、次の手順を追加した。
  - `sudo install -d -m 0700 -o <runner> -g <runner> /srv/servicenow-mcp-trusted-tests` で、root所有の祖先（`/`、`/srv`）の下にrunner所有・0700のディレクトリを用意する。
  - `getfacl` で `/`、`/srv`、作成したディレクトリのACLをログに残す。
  - `$GITHUB_ENV` で上記の環境変数を渡す。
- 製品の検査とその条件は変更していない。

### 検証

Linuxコンテナで `/home` に拡張ACL（`u:nobody:r-x`）を付け、runnerと同じ条件にした。

- 環境変数なし：CIと同じ診断メッセージで停止した。
- CIの手順と同じコマンドを実行した後：`npm test`、`npm run test:coverage` とも **122ファイル・3,234テストすべて成功**。

GitHub Actions上の結果は、この修正をpushした後のCIで確認する。
