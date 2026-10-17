# BP-5：運用者設定ファイルとbinding CLI

Date: 2026-10-18 / Stage: operator-file-0.1。
設定ファイルの読込とオフライン補助CLIを実装。MCPレビュー本体は未登録で、実機操作や実設定の書換えは行わない。

## 1. bindingを計算する

CLI構文：`servicenow-mcp review binding --instance-id dev --url https://example.service-now.com`

リポジトリ内でビルド後に確認する場合：

```sh
bdo node bin/servicenow-mcp.cjs review binding --instance-id dev --url https://example.service-now.com
```

stdoutはcreateReviewInstanceBinding()で計算した64桁の小文字hexと改行だけ。
インスタンス接続・認証・設定読込/変更はしない。資格情報入りURLや不正なID/URLは拒否する。
接続先または設定IDを変えた場合は再計算し、導入/アップグレードの確認もやり直す。
このコマンドはリリースが正しいことを確認するコマンドではない。

## 2. ファイル内での指定

従来の接続/認証項目を維持し、対象インスタンスの中に設定を追加する。
`SN_INSTANCES_CONFIG`が指す手動形式の例（以下の山括弧は置換が必要）：

```json
{
  "default_instance": "dev",
  "instances": {
    "dev": {
      "instance_url": "https://example.service-now.com",
      "client_id": "<既存の接続設定>",
      "client_secret": "<既存の接続設定>",
      "review_release_config": {
        "instance_id": "dev",
        "assertion": {
          "family": "Australia",
          "instance_binding": "<CLIが出力した64桁hex>",
          "asserted_at": "<運用者が確認したUTC日時>",
          "expires_at": "<明示的な期限のUTC日時>"
        }
      }
    }
  }
}
```

ウィザード形式（~/.config/servicenow-mcp/instances.json）では、同じ構造を対象エントリの
`reviewReleaseConfig`として記載する。`instanceUrl`/`clientId`等の既存項目はそのまま。
手動/ウィザードの双方でsnake_case/camelCaseのキーを受け付けるが、同じエントリで両方を指定したら拒否する。
instance_idは必ずそのエントリのキー（例dev）と一致させる。別名へ移したまま古いbindingを使わない。
assertion省略なら実測経路のみを使う。設定なしは任意のリリースを自己申告してよいという意味ではない。

inlineの環境変数JSONには対応しない。環境変数で設定する場合もSN_INSTANCES_CONFIGからファイルを指定する。
設定ファイルを公開リポジトリへ入れない。CLI/ウィザードによるassertionの作成・日付自動延長は行わない。

## 3. 信頼検査

ファイル由来の接続でBP-5を利用する場合は、assertionの有無にかかわらず同じ検査を適用する。
不正なレビュー設定を削除して所有者/権限検査を迂回できないようにする。

- ファイルは実行ユーザー所有の通常ファイル、mode 0600。symlinkは拒否。
- 全親ディレクトリはrootまたは実行ユーザー所有、group/other書込不可。stickyな共有/tmpも許可しない。
- 親ディレクトリのsymlinkも拒否する。正規の絶対パスを使い、権限を自動修復しない。
- macOSは/bin/ls -bldenによるACL出力をまとめて確認する。deny-only ACLは許可、allow/不明な構造は保守的に拒否する。
- Linuxは/usr/bin/getfacl -c -n -pが必要。拡張ACLなしの基本3エントリだけを許可する。コマンド不在/失敗も拒否。
- ACLコマンドは固定絶対パス・shellなし・出力64KiB/1秒の上限付き。ACL出力をログや結果に返さない。
- Windows等、現在の実装でACLを検証できない環境ではファイル由来のBP-5設定を拒否する。binding CLIは利用可能。

本文はUTF-8 JSON・最大1MiBで読み、増大するファイルでも上限+1byteで停止する。
open時のO_NOFOLLOW、通常ファイル/所有者/modeのfstat検査、読込前後のinode/size/mtime/ctime比較、
パスと親ディレクトリの再照合を行う（親は最大64階層）。発見用の読込データだけを運用者証拠として信頼しない。
検証後の再読込データが最初のデータと食い違っても拒否する。

これはroot/同一UIDの攻撃者や、悪意ある同一プロセスに対するsandboxではない。
Nodeのパスベースの検査を完全なopenatスナップショットとは主張しない。OS/ファイルシステムと運用者は信頼境界内。
macOSの実ファイルと、両OSのACL出力の合成例を検証した。Linux実機のgetfaclやWindows ACLは未検証/未対応である。

## 4. 失敗・再読込

信頼検査に失敗しても、通常ツールの従来の接続発見は維持するが、BP-5用設定には拒否マーカーを保持する。
boundedレビュー開始時にconfig_invalidとなり、「assertionなしで実測だけ試す」経路へ黙って降格しない。
明示したファイルが欠落/壊れて別の設定/環境変数へ従来のフォールバックが発生しても、BP-5は同様に拒否する。
ログ/エラーには固定理由だけを出し、設定本文・JSONパーサー原文・資格情報は返さない。

通常の設定発見ではサイズ制限付きJSONだけを読み、BP-5の初回利用時に信頼検査を実行する。
一斉起動時の無駄なACL検査を避け、検査結果は読み込んだ設定単位で保持する。レビュー呼出しごとには再検査しない。
初回の信頼検査前に内容が変更されていた場合も、発見時の接続先と新しい設定を混ぜず拒否する。
検証後のファイル変更はメモリ上の設定を自動更新しない。運用者が内容/権限を変更したら再起動/明示的reloadで再検証する。
実行中のレビューは開始時に固定した設定を維持する。設定期限・binding・実測競合のゲートは各セッションで従来どおり評価する。
初回検査はセッションの時間予算に含め、戻った時点で期限超過ならHTTP取得を始めない。同期ファイルシステム呼出し自体を途中停止できるという保証ではない。

## 5. 検証と残課題

- trusted-config-file.test.ts：所有者、mode、親の書込権限、ファイル/親のsymlink、上限、不正JSON、ACLの安全側拒否。
- instance-review-settings.test.ts：手動/ウィザード設定→固定client→C方式フォールバック、拒否設定の保持、環境変数への降格防止、ID・キーの取り違え、修復後reload。
- review-binding.test.ts：実CLI入口からのhash出力と、資格情報入りURLの非露出拒否。通信・実設定読込は行わない。

権限を変えるテストは作成/削除する合成fixtureだけを対象にする。利用者の設定ファイルは書き換えない。
1件解析/集約は[アダプター記録](BEST_PRACTICE_BP5_ADAPTERS.md)のとおり後続で接続済み。
同期解析/集約workerは[worker記録](BEST_PRACTICE_BP5_WORKERS.md)のとおり後続で実装済み。
残課題はMCP登録/梱包、許可済み読み取りE2Eと品質/公開審査。

### 2026-10-18 検証記録

- 新規3ファイル・16テストを含む `npm test`：90ファイル、2,280テスト成功。
- `npm run build` / `npm run type-check`：成功。ビルド済みCLIでbinding生成も確認。
- 追加・関連7ファイルのESLint：警告/エラーなし。全体lint：エラー0、既存警告374。
- `git diff --check`：成功。既存の版付き契約・固定評価関連21ファイルはHEADと同一で、変更していない。
- macOS上で合成設定ファイルを使用。ServiceNowへの通信、実設定の変更、MCP登録は行っていない。

初回の全体テストでは、設定発見時に各親パスのACLコマンドを起動する実装が並列起動の負荷を増やし、12テストがタイムアウトした。
信頼検査をBP-5初回利用時に遅延し、macOSのACL検査をパス一覧ごとにまとめる構造へ変更した。
テストの制限時間は増やさず、上記の全体テスト成功を確認した。初回検査の所要時間がレビュー予算に含まれる回帰テストも追加した。
