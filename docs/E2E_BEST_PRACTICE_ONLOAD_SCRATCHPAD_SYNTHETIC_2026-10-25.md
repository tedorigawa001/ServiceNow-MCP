# AU-CL-003：onLoad入力タイミング・scratchpad適否の合成検証

Date: 2026-10-25 / Source baseline: `ab9d5d3`
Status: 限定的な入力証拠分類・合成検証。人の規則採用承認・実PDI確認・独立品質評価は未実施。

[設計書](BEST_PRACTICE_ONLOAD_SCRATCHPAD.md)に従い、onLoadの既知照会を定数入力／実行時入力依存／情報不足の3種類に分けた。定数入力から結果の事前可用性を断定せず、全候補に鮮度・業務意図・データ公開範囲の確認を要求する。動的取得の候補を一律scratchpad移行推奨へ変換しない。

## 1. 合成確認

- payloadのonLoadイベント・canonical入口・受信側を確認し、他イベント・別資産を区別。
- g_formの参照取得、Client GlideRecordのconstructor／addQuery／get／query、GlideAjaxのconstructor／addParam／getXML系の入力状態を分離。
- 同一資産内でも候補ごとのstatic／runtime／unknownコードを保持し、field／table名・値を出力しない。
- 独自同名API、条件設定だけ、コメント・文字列を照会候補にしない。
- unknownの値・設定・式・条件付き処理、request再利用、API変更・escape・helper／callback内部を保守的に扱う。
- worker経由で分類codeの重複・イベント証拠や公開範囲制限の欠落を拒否。unknown入力やイベント不足からanalysis_complete=trueへの改変を拒否。
- CL-002との混在、0.2省略互換、0.3対象選択、明示11規則・旧既定3規則、共有AST／候補上限を確認。
- compiled worker／packaged MCP経路と配布JSON Schema同期も検証する。

## 2. 実行・途中失敗

| 実行 | 結果 |
|---|---|
| 最初の正例・実装前 | 1失敗。未対応規則で候補0件 |
| 初期実装後の同じ正例 | 1成功 |
| 新規規則 | 50成功 |
| 初回ビルド・契約接続途中 | 失敗。新規IDをBP-5 enumへ追加する前の型エラーTS2345。enum・ruleset・strict結果契約を接続後に再確認 |
| 契約接続後のビルド | 成功 |
| 新規規則＋対象選択＋語彙＋MCP入力＋既存onChange | 210成功 |
| 変更した実装・テスト15ファイルのESLint | 指摘なし |
| 全体合成回帰 | 132ファイル・3,630件成功、失敗／pending 0。JSON計測区間70.22秒 |
| 梱包試験 | production-only install＋compiled worker／packaged MCPのCL-003 smoke成功。369ファイル |

全体回帰は`bdo npm test -- --reporter=json --outputFile=/private/tmp/servicenow-cl003-full-20261025.json`でexit 0／success=true。suite全体の計測区間と、個別reviewの60秒上限は別物。記録用reporter以外の既存設定・期限・retryは変更しない。`npm run test:pack`も成功した。

途中失敗を隠さず、配布JSON Schemaは型付き正本から機械再生成した。固定評価セット・過去成績は変更せず、評価の既存回帰も全体試験内で成功した。`git diff --check`とローカルMDリンク先の存在も確認した。実機E2E・Rust/nativeの全試験・独立評価の実施を意味しない。

## 3. 未確認・維持事項

この分類は入力証拠だけであり、実際のデータ可用性・鮮度・アクセス制御・scratchpad公開可否・UI動作・コード実到達を証明しない。確認項目の付与は例外承認や独立した精度評価ではない。固定評価セット・過去成績は変更しない。

実機操作・実トークン発行・運用設定変更・Pushは行わない。VM／監視・telemetry保留、Unknown・全体受付無効、本番cap／完成parts／permit非発行を維持。`.vscode/`・`CLAUDE.md`は対象外。

## 4. コミット前の対象限定検証

HEAD `ab9d5d3`＋選別した関連26ファイルだけを`git checkout-index`で一時領域へ展開し、未追跡の`.vscode/`・`CLAUDE.md`を含めずに確認した。既存node_modulesへの参照を再利用し、この検証自体を新規インストール試験とはしない。

- 当該領域で`npm run build`成功。
- 標準設定の全体合成回帰：132ファイル・3,630件成功、失敗／pending 0。JSON計測区間52.48秒。全testResultsのファイルが当該一時領域のパスであることも確認した。期限・retry設定は変更していない。
- 変更した実装・テスト15ファイルのESLint指摘なし。

検証後の変更は本記録の追記のみで、実装・テストは変更しない。一時JSON・チェックアウトはコミット対象外。
