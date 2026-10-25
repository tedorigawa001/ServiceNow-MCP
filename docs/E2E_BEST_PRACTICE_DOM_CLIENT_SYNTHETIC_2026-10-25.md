# AU-CL-007：Client Script DOM依存候補の合成検証

Date: 2026-10-25 / Scope: 合成データのみ。実PDI・ブラウザDOM実行は対象外。

## 1. 変更と維持した契約

[設計](BEST_PRACTICE_DOM_CLIENT.md)に従い、Client Script限定の明示規則AU-CL-007を追加。文書由来の検索とcreateElement由来の部分木内検索を区別し、標準UI/自作UIの所有元は未確認として保持する。独自の同名メソッドは除外し、不明な受信側は候補を捏造せず`dom_receiver_unresolved`とする。

最大12規則・要求時のみbp3-0.13。既定3規則と以前のruleset・固定評価セットは維持。0.2/0.3外枠、認証・リリースゲート・60秒・受信量/件数/解析上限、本文非露出は不変。typed follow-up語彙は19項目、CL007用の3項目を追加。候補を違反・承認済みへ昇格させない。

CHANGELOG Unreleased、README、台帳・全体設計・MCP登録・確認項目カタログと4つのJSON Schema成果物も更新した。

## 2. 新規回帰と失敗履歴

- 最初の文書検索の正例は実装前に1件失敗（候補0、期待1）。実装後、同じ正例が成功。
- `dom-client.test.ts`：43成功。document/window.document/body/documentElement、限定別名・定数method、単一検索の連鎖、作成部分木、同名メソッド・引数/var/let/catch/classによるshadow、不明受信側・再代入・後続のメソッド改変・escape・動的member・optional/spread/不正引数・コレクション・解析上限・他資産・履歴profileを検査。
- worker/集約経路：0.2/0.3双方のCL007到達と由来別follow-up、本文/selector/token非露出、区分二重付与・所有元未確認制限の欠落・必須follow-upの欠落を拒否。未解決をanalysis_complete=trueに改ざんした結果も拒否。
- 最初の関連4ファイル実行は137成功/1失敗。原因は確認項目数の固定期待値16が3項目追加に追随していないこと。期待を19に更新し、意味・適用先・重複検査は維持。カタログ/成果物の再実行は6成功/0失敗。

## 3. 実行した検証

| 検証 | 結果 |
|---|---|
| `npm run build` | 成功（TypeScript） |
| `npm test -- --reporter=json --outputFile=/private/tmp/servicenow-cl007-full-20261025.json` | 133ファイル、3,675成功、失敗0、pending0。JSON開始〜最終ファイル終了75.92秒 |
| 変更した実装・テスト15ファイルのESLint | 問題なし |
| `git diff --check` | 問題なし |
| 一時キャッシュでの`npm run test:pack` | 成功。369ファイル。production依存のみで、配布worker・集約・MCP登録/dispatchとCL007の由来別2候補・非露出を確認 |

上記の全体合成テストでは既存のR2テストを含め成功。製品/テストの期限は変更していない。非公開の実PDIや資格情報を使用していない。

梱包テストの初回は`npm pack`が既存npmキャッシュへの書込みでEPERMとなり、停止（梱包smoke未到達）。ログのroot-owned filesという説明だけから所有者を確定していない。既存キャッシュの所有者・権限・設定は変更せず、`npm_config_cache=/private/tmp/servicenow-cl007-npm-cache`を当該プロセスだけに渡して再実行し成功した。合成取得先のみで、実PDIへ通信していない。

## 4. 未確認と非操作

合成回帰は独立した人手評価・検出精度の証明ではない。実DOM/実UI、標準UI所有元、GlideForm等の代替可否、人の根拠承認は未確認。作成部分木も挿入・混入・実行・安全性を証明しない。

VM/監視/telemetry調査は保留、Unknown・全体受付無効を維持。本番cap・完成parts・permit発行、実機操作、トークン発行、設定変更、Pushは実施しない。`.vscode/`・`CLAUDE.md`は今回の変更対象外。

## 5. コミット対象だけの再検証

基底`164ecb8`に今回の27ファイルだけをstageし、indexを`/private/tmp/servicenow-cl007-staged-YKP4Ke/`へ展開した。未追跡の`.vscode/`・`CLAUDE.md`が一時チェックアウトに存在しないことを確認。依存は既存node_modulesへのsymlinkで再利用し、全依存の新規導入による検証とは区別する。

- 一時チェックアウトでTypeScript buildと変更15ファイルのESLintが成功。
- 同じ一時チェックアウトで梱包テスト成功（369ファイル）。配布物にはproduction依存だけを導入し、worker・集約・MCP登録/dispatch・CL007由来別候補と非露出を確認した。一時npmキャッシュを使用し、既存設定は変更していない。
- 最初の全体実行は133ファイル、3,674成功/1失敗/pending0、111.66秒。失敗は既存`CL-008 metadata absence or unsupported flow never becomes complete analysis`の5,000msタイムアウト。CL007の追加回帰は成功。build/ESLint/梱包との実行時間が重なっていたが、負荷を原因と確定していない。
- 失敗したCL008テストの単独再実行は1成功（名前指定の対象外62件は未実行）、1.61秒。コード・テスト/製品の期限は変更していない。全体も同じ既定条件で再実行し、初回結果を上書きせず別JSONへ保存する。
- 全体再実行は133ファイル・3,675成功/失敗0/pending0、115.15秒。`/private/tmp/servicenow-cl007-staged-rerun-20261025.json`の各テストパスが一時チェックアウト配下であることも確認した。初回JSONは`/private/tmp/servicenow-cl007-staged-20261025.json`に保持。単発タイムアウトの根本原因や再発しないことは確認済みにしない。
- 以上の実行後の変更はこの検証記録の追記だけで、実装・テストは変更していない。コミット直前にstage対象・差分形式を再確認する。
