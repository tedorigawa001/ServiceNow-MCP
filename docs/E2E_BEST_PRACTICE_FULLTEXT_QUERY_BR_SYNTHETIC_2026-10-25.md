# AU-QRY-002：BR限定全文検索前提候補の合成検証

Date: 2026-10-25 / Source baseline: `6c6df56`。
合成データのみ。実PDI、索引設定照会、検索実行、索引作成は対象外。

## 1. 変更・根拠

[設計](BEST_PRACTICE_FULLTEXT_QUERY_BR.md)に従いBR限定の明示規則AU-QRY-002を追加。ローカルのGlideRecord/GlideRecordSecure由来の2引数addQueryと、1引数の固定addEncodedQueryを区別し、索引設定の確認候補を返す。通常の包含検索や検索値内の予約名は全文検索と扱わない。

台帳AU-SRC-005の元URLは今回取得不可。補足としてAustralia公式GlideRecord Scoped APIのaddQueryの予約名/索引前提とaddEncodedQueryの形式をAIが確認した。台帳のverified_onや人の承認状態は変更していない。詳細URL/該当箇所は設計書§1に記載。

API別の2コードと索引確認のintrinsic codeを追加し、語彙23項目。要求時だけbp3-0.15、最大14規則、既定3規則・他要求のrulesetは維持。1件/集約契約、4つのJSON Schema成果物、MCP対象選択・説明を更新。索引・一般encoded構文の妥当性・検索可否は未確認で、本文・検索値・テーブル名を返さない。

取得/受信量/60秒・AST/finding上限、worker中断、認証固定・リリースゲート、固定評価セットは維持。CHANGELOG、README、台帳・全体設計・MCP登録・確認項目カタログも更新した。

## 2. 回帰・失敗履歴

- 最初の正例は実装前に1失敗（候補0/期待1）、実装後に同じ正例が成功。
- 初回の拡張した新規回帰55件は52成功/3失敗。原因は台帳上適用対象のScript Include/REST/server scriptにもrule_asset_mismatchを期待したテスト側の誤り。既存QRY-001と同じく未実装資産はunsupportedであることを確認し、製品契約を変えず、候補0・理由付きスキップを検査する形に修正。
- 修正後の新規回帰と既存QRY-001の2ファイルは96成功/失敗0。新規側はGlideRecord/Secure・別名・限定定数・動的テーブル、encodedの条件境界/OR/NQ/EQ、通常field/value/orderingとの区別、独自API・shadow、動的query・関数間/escape/改変・call/spread/optional、不正constructor、未対応arity/encoded形式、他資産/歴史profile、line・上限を検査した。
- 関連6ファイルは198成功/失敗0（上記にworker・集約・ツール・語彙・schemaを追加）。最後に空OR接頭辞を未解決にする境界回帰も追加し、全体テストで再検証する。
- worker/集約では0.2/0.3両方のAPI別2候補、検索本文/token非露出、API区分の二重付与・索引未確認制限/必須確認項目の欠落の拒否、動的文字列のanalysis_complete=trueへの改ざん拒否を検査。QRY-001併用でも各規則1候補ずつを確認した。
- 初回の全体テストは135ファイル、3,781成功/2失敗/pending0、121.20秒。失敗はpayload-adapter/update-set-adapterがAU-QRY-002を未対応IDとして拒否する期待を残していたもの。入力スキーマへの今回の追加を確認し、検査目的を保ったまま明らかに未知のAU-NOT-A-RULEへfixtureを変更した。実行期限を緩めたり失敗をskipに変えたりしていない。初回JSONは`/private/tmp/servicenow-qry002-full-20261025.json`に保持する。

## 3. 検証結果

| 検証 | 結果 |
|---|---|
| TypeScript build | 成功 |
| 関連6ファイルのVitest | 198成功、失敗0 |
| 既存アダプター2ファイルの修正後再実行 | 62成功、失敗0 |
| 全体再実行 | 135ファイル、3,783成功、失敗0、pending0、114.37秒。新規規則の最終56ケースを含む |
| 変更した実装・テスト17ファイルのESLint | 問題なし |
| ローカルMarkdownリンク | 115参照の存在を確認 |
| 一時キャッシュでの`npm run test:pack` | 成功。369ファイル、production依存だけで配布worker・集約・MCP登録/dispatchのAPI別2候補と非露出を確認 |
| `git diff --check` | 問題なし |

全体再実行のJSONは`/private/tmp/servicenow-qry002-full-rerun-20261025.json`。初回を上書きしていない。R2等も含め既定の全体テストで成功し、製品/テストの期限・並列設定は変更していない。
梱包検証は全体テスト終了後に実施。当該プロセスだけ`npm_config_cache=/private/tmp/servicenow-cl007-npm-cache`を利用し、既存npm設定・キャッシュ権限は変更していない。

## 4. 未確認・非操作

合成回帰は独立人手評価や検出精度の証明ではない。対象テーブル・索引・検索設定/方式、クエリ全体の構文/有効性・認可・実行到達性、実際の検索結果、人の根拠採用承認は未確認。予約名3引数addQuery/第2引数付きaddEncodedQueryを利用不可と判定していない。固定部分集合を超える動的encoded解釈やAPIは未対応。

Unknown・全体受付無効、VM/監視/telemetry保留は維持。本番cap/完成parts/permit発行、実機操作、設定変更、Pushは行わない。`.vscode/`・`CLAUDE.md`は変更対象外。

## 5. コミット対象限定の再検証

基底`6c6df56`に今回のAU-QRY-002関連29ファイルだけをstageし、indexを`/private/tmp/servicenow-qry002-staged-MVOAhM/`へ展開した。無関係な`.vscode/`・`CLAUDE.md`が一時チェックアウトに存在しないことを確認。依存は既存node_modulesへのsymlinkで再利用し、全依存の新規導入による検証とは区別する。

- 一時チェックアウトでTypeScript build・変更17ファイルのESLintが成功。
- 同じチェックアウトで既定の全体合成テストが成功。135ファイル、3,783成功、失敗0、pending0、JSON開始〜最終ファイル終了48.42秒。製品/テストの期限や並列設定は変更していない。
- 結果JSONは`/private/tmp/servicenow-qry002-staged-20261025.json`。各テストパスが一時チェックアウト配下であることも確認した。
- 全体テスト後、同じ一時チェックアウトで梱包テストが成功（369ファイル）。配布物にproduction依存だけを導入し、worker・集約・MCP登録/dispatchのAPI別2候補と非露出を確認。当該プロセスだけ一時npmキャッシュを指定し、既存設定は変更していない。
- 実行後の変更は本記録への追記だけで、実装・テストは変更していない。stage対象と差分形式を最終確認してコミットする。
