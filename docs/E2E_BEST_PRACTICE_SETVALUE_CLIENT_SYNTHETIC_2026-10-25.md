# AU-CL-005：2引数setValue候補の合成検証

Date: 2026-10-25 / Source baseline: `39530ff`。
合成データのみ。実PDI、ブラウザ実行、辞書照会、実通信計測は対象外。

## 1. 変更

[設計](BEST_PRACTICE_SETVALUE_CLIENT.md)に基づきClient Script限定の明示規則AU-CL-005を追加した。g_form由来の2引数setValueを確認候補とし、独自の同名メソッド・明示3引数呼出しを区別する。通常文字列列やクリア操作も、追加の型証拠がない構文候補として人の確認に回す。参照型・表示値・追加通信・違反は断定しない。

要求時bp3-0.14、最大13規則、既定3規則は不変。1件/集約契約、4つのJSON Schema成果物、MCP説明と対象選択を接続。rule_intrinsicなreference_display_value_reviewを追加し、語彙は20項目。未解決のanalysis_complete=trueへの昇格を拒否する。

取得件数/受信量、全体60秒、AST/finding上限、worker中断、認証固定・リリースゲート、本文非露出と固定評価セットは維持。CHANGELOG・README・台帳・全体設計・MCP登録・確認項目カタログを更新した。

## 2. 回帰テスト

- 最初の正例は未実装時に1失敗（候補0、期待1）。同じ正例は実装後に成功した。
- 新規setvalue-client.test.tsは47成功。g_form/別名/局所コンテナ/限定定数method、動的field、通常文字列列・空文字/nullの値、3引数/undefined表示値、独自オブジェクト/クラス/字句shadow、unknown受信側、混合・再代入・後続改変・escape・call/spread/optional/new/分割代入/eval、不正引数、line位置、他資産/歴史profile、finding/AST上限を確認。
- worker/集約回帰は0.2/0.3双方で候補1件、3引数と独自メソッドの除外、本文/field/値/token非露出を確認。必須follow-up、型未確認/表示値未確認制限の欠落、未解決なのにanalysis_complete=trueという改ざんを拒否。
- 新規回帰・対象選択・確認項目カタログ・ツール・schema成果物の関連5ファイルは146成功/失敗0。

## 3. 検証記録

| 検証 | 結果 |
|---|---|
| `npm run build` | 成功（TypeScript） |
| 関連5ファイルのVitest | 146成功、失敗0 |
| `npm test -- --reporter=json --outputFile=/private/tmp/servicenow-cl005-full-20261025.json` | 134ファイル、3,724成功、失敗0、pending0。JSON開始〜最終ファイル終了91.27秒 |
| 変更した実装・テスト15ファイルのESLint | 問題なし |
| 一時キャッシュでの`npm run test:pack` | 成功。369ファイル、production依存のみでworker・集約・MCP登録/dispatch・CL005候補と非露出を確認 |
| ローカルMarkdownリンク | 110参照の存在を確認 |
| `git diff --check` | 問題なし |

全体テストは既存のR2/CL008も含め成功した。期限・並列設定は変更していない。梱包検証は全体テストの終了後に実施し、当該プロセスのみ`npm_config_cache=/private/tmp/servicenow-cl007-npm-cache`を利用した。npm設定・既存キャッシュの権限は変更していない。今回の実行で意図したRED以外の失敗はなかった。

## 4. 未確認・非操作

候補数は検出精度や独立評価の成績ではない。参照型・継承・表示値の正しさ/可用性・キャッシュ・実通信・UI対応、人による根拠採用承認は未確認。3引数を使うコードの品質を承認していない。表示値取得だけの照会追加、自動置換・書込みは行わない。

VM/監視/telemetryは保留、Unknown・全体受付無効を維持。本番cap/完成parts/permit発行、実機操作、設定変更、Pushは実施しない。無関係な`.vscode/`・`CLAUDE.md`は変更対象外。

## 5. コミット対象限定の再検証

基底`39530ff`にAU-CL-005関連27ファイルだけをstageし、indexを`/private/tmp/servicenow-cl005-staged-lwuNe5/`へ展開した。無関係な`.vscode/`・`CLAUDE.md`が一時チェックアウトに存在しないことを確認。依存は既存node_modulesへのsymlinkを再利用し、全依存の新規導入による検証とは区別する。

- 一時チェックアウトでTypeScript build、変更15ファイルのESLintが成功。
- 同じチェックアウトで既定の全体合成テストを実施。134ファイル・3,724成功、失敗0、pending0、JSON開始〜最終ファイル終了99.48秒。製品/テストの期限や並列設定は変更していない。
- 結果JSONは`/private/tmp/servicenow-cl005-staged-20261025.json`。各テストパスが一時チェックアウト配下であることも確認した。
- 全体テスト後、同じ一時チェックアウトで梱包テスト成功（369ファイル）。配布物にproduction依存だけを導入し、worker・集約・MCP登録/dispatch・CL005候補/非露出を確認した。当該プロセスだけ一時npmキャッシュを指定し、既存設定は変更していない。
- 実行後の変更は本記録への追記だけで、実装・テストは変更していない。stage対象と差分形式を最終確認してコミットする。
