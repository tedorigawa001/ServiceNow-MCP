# AU-BR-006：内部スコープ証拠・純粋比較器の合成検証

Date: 2026-10-25 / Source baseline: `111c49d`。
合成データのみ。BR-006のMCP登録・実取得・ASTによる中止候補検出は未実施。

## 1. 実装範囲と未接続の境界

[設計書draft-0.2 §10](BEST_PRACTICE_ABORT_SCOPE_EVIDENCE_DESIGN.md)に従い、内部moduleにscope token、context/payload/初回/最終観測のopaque handleと構造検証factory、純粋比較器を追加した。

結果はsame_literal/same_reference/different_reference/unknownとcompared/insufficient/changed/rejected。全結果でpayload版と現行宣言テーブルの時点差・実テーブル/実行/中止成否未確認・観測非原子性・人の承認待ちを保持する。候補・違反・公開レビュー結果・permitは発行しない。

factoryは真の取得元や実効認証を証明するissuerではない。構造検証と同一contextへの結合だけで、認証owner・一度限りの消費/終了時失効・worker/transport接続・実時計の60秒中断は未実装。比較は同じ入力に対し繰り返せる。入力時刻の範囲を検査しても、実時間の停止を達成したとは扱わない。

既存取得先・認証・受信/試行/時間上限・公開JSON・明示14規則/既定3規則は変更していない。未接続moduleをdistからnpmに混入させないようfiles除外と梱包検査を追加した。CHANGELOGは開発用の内部部品として記載し、公開規則追加とはしていない。

## 2. 回帰と失敗履歴

- 実装前の最初の試験はmodule未存在でimport失敗。module実装後に同じ正規化試験1件が成功した。
- 拡張した最初の53件は50成功/3失敗。テスト補助関数の既定引数が明示undefinedをglobalへ置換していたことと、別table混入用の大文字名が先に形式検査で落ちていたことが原因。補助関数を未指定/undefinedを区別する形にし、形式が有効な別名でbinding拒否を試験した。比較器の拒否/unknown条件は緩めていない。
- 同53件の再実行は全成功。最初のESLintはテスト内の未使用分割代入2件で失敗し、必要な項目削除を明示する形へ修正した。
- 下げた期限・scope列欠落・MCP未登録/非I/Oを追加した最終新規56件は成功。

主な境界：

| 分類 | 確認内容 |
|---|---|
| Global/参照ID | global同士、同一ID、異なるID、混在Global/ID、空/null/undefined/不正形式・表示名/参照object |
| payload/現行 | source/target_versionの区別、対象ID/hash・collection/name、Global-table文脈、同値でも時点差を保持 |
| 内部結合 | 同値scalarでも別contextを拒否、handleコピー/偽造・別資産hashを拒否、raw入力変更で既存証拠が変わらない |
| 証拠不足/変化 | 0/1/2/超過行、scope/必須列欠落、明示取得不能、最終再読失敗、ID/scope/版の途中変更 |
| 時刻 | phase順序、開始/初回/最終/比較の不整合、60秒境界、より低い期限、同run共有cacheの初回観測が後続payloadより前の場合 |
| 上位停止/非露出 | 認証/ACL・取消・全体期限をunavailable理由へ降格しない。結果/handleにtable名/ID/追加scope/任意原文を出さない |
| 純粋性 | Date.now/fetch/setTimeoutを呼ばない、結果を凍結し、繰り返し比較でも一致。BR-006入力は引き続き拒否 |

## 3. 検証結果

| 検証 | 結果 |
|---|---|
| `npm run build` | 成功（TypeScript） |
| 新規Vitest | 56成功、失敗0 |
| `npm test -- --reporter=json --outputFile=/private/tmp/servicenow-br006-scope-core-full-20261025.json` | 136ファイル、3,839成功、失敗0、pending0。JSON開始〜最終ファイル終了75.99秒 |
| 実装・新規テスト・梱包テスト3ファイルのESLint | 問題なし |
| `npm run test:pack`（一時キャッシュ） | 成功。369ファイル、未接続module/型宣言/mapの非同梱と、既存配布worker・集約・MCP登録/dispatchを確認 |
| ローカル文書参照 | 54参照の存在を確認 |
| `git diff --check` | 問題なし |

全体テストでは既存R2等も含め成功。期限・並列設定は変更していない。梱包検証は全体テスト後に実施し、当該プロセスだけ`npm_config_cache=/private/tmp/servicenow-cl007-npm-cache`を使用した。既存npm設定・キャッシュ権限は変更していない。

## 4. 保留・未確認

合成試験は独立した人手評価、実認証・ACL、実テーブル観測や中止挙動の証明ではない。比較器はASTを解析しないため、before/current/setAbortAction(true)が存在する証拠やルール候補の生成は後工程。Shared budgetの追加会計・ストリーム下位上限・最終予約も未接続。

運用/実機の設定変更、実機操作・トークン発行、Push・コミットは本実装作業では行わない。Unknown・全体受付無効、本番cap/完成parts/permit非発行、VM/監視/telemetry保留を維持する。`.vscode/`・`CLAUDE.md`は変更対象外。

## 5. コミット対象限定の再検証

基底`111c49d`に今回の9ファイルだけをstageし、indexを`/private/tmp/servicenow-br006-scope-staged-eWG76m/`へ展開した。無関係な`.vscode/`・`CLAUDE.md`が一時チェックアウトに存在しないことを確認。依存は既存node_modulesへのsymlinkで再利用し、全依存の新規導入とは区別する。

- 一時チェックアウトでTypeScript build、変更した実装/テスト3ファイルのESLintが成功。
- 同じチェックアウトの既定全体合成テストは136ファイル、3,839成功、失敗0、pending0、JSON開始〜最終ファイル終了39.73秒。製品/テストの期限・並列設定は変更していない。
- 結果JSONは`/private/tmp/servicenow-br006-scope-staged-20261025.json`。各テストパスが一時チェックアウト配下であることも確認した。
- 全体テスト後、同じ一時チェックアウトで梱包テストが成功（369ファイル）。新module/型宣言/mapの非同梱と、production依存だけでの既存配布worker・集約・MCP登録/dispatchを確認。当該プロセスだけ一時npmキャッシュを指定し、既存設定は変更していない。
- 文書参照54件の存在も再確認した。実行後の変更は本記録への追記だけで、実装・テストは変更していない。stage対象・差分形式を最終確認してコミットする。
