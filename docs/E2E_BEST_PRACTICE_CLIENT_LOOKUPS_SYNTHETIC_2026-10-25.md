# AU-CL-002：Client Script照会確認候補の合成検証

Date: 2026-10-25 / Source baseline: `8fcf759`
Status: 限定実装・合成検証。人の採用承認・実PDI確認・独立品質評価は未実施。

## 1. 対象と境界

[設計書](BEST_PRACTICE_CLIENT_LOOKUPS.md)に従い、sys_script_client payloadのg_form.getReference／Client GlideRecord get・queryを受信側と構文で区別した。候補はperformance／info／low／candidateとし、照会頻度・必要列・既存データ・業務上の必要性・UI制約の確認を求める。不要・違反・性能劣化と断定せず、コードを実行・自動変更しない。

AU-SRC-002のAustralia本文を再読し、Minimize server lookups節を確認した。補足API文書のリリース未指定URLはBrazilへ切り替わり、Australia指定URLは取得不可だったため、APIの全引数・UI別仕様までAustraliaで照合済みとはしない。既存カタログの確認日・人の承認状態は維持する。

## 2. 追加検証

- getReferenceの同期形／callback形、GlideRecordのget／query、同じ行の別箇所を候補化。
- constructorだけ・addQuery／addEncodedQuery・next／getValue・GlideAjax／g_formの他APIを照会実行候補と区別。
- 単純alias、object／array、限定constメソッド名と、shadow・独自オブジェクト／クラス・未知受信側を区別。
- 動的method・条件付きconstructor・subset外overload・spread・不適切なliteral引数・抽出method呼出しは未解決。
- eval／with・method書換え・delete・動的property書込み・受信側のescapeは候補確定を保留。
- ガードや非同期callback、承認を主張するコメントは免除や不要判定に使わない。
- BR等の対象外拒否、過去profileのunsupported、100候補／共有AST上限・本文非露出を維持。
- worker経由の0.3対象選択、0.2省略互換、混在集約の旧ruleset保持、確認項目／制限の欠落拒否、未解決なのにanalysis_complete=trueとする改変拒否。
- MCPの明示9規則と旧既定3規則、配布JSON Schema同期、compiled worker／packaged MCPの合成smoke。

## 3. 実行と途中失敗

| 実行 | 結果 |
|---|---|
| 最初の正例・実装前 | 1失敗。AU-CL-002はunsupportedで評価済み規則が空になることを確認 |
| 初期実装後の同じ正例 | 1成功 |
| 新規規則＋UI Policy＋MCP入力 | 117成功 |
| 新規規則＋対象選択 | 110成功 |
| 語彙回帰を含む4ファイル・初回 | 144成功／1失敗。新しい確認項目追加後も語彙数期待が10に固定されていた |
| 語彙数を11に整合させた同4ファイル | 145成功。総数・重複・定義の検査は残し、固定評価セットは変更しない |
| ビルド | 成功 |
| 全体lint | exit 0、0 errors／374 warnings。警告を0件と主張しない |
| 標準設定の全体合成回帰 | 130ファイル・3,507件すべて成功、pending 0。うち新規規則58件、R2 19ファイルも成功 |
| 梱包試験 `npm run test:pack` | ビルド＋production-only install＋compiled worker／packaged MCPが成功。365ファイルを維持 |

全体回帰は`bdo npm test -- --reporter=json --outputFile=/private/tmp/servicenow-cl002-full-20261025.json`で実行、exit 0／success=true。JSONのstartTimeから最終file endTimeまで41.13秒。記録用reporter以外の設定・期限・worker予算・retryは変更しない。語彙数は追加した契約に整合させたもので、検出の失敗を成功として受け入れる変更ではない。

固定評価セットや過去の採点結果は変更せず、関連評価回帰も全体試験内で通過した。独立評価・実機E2Eではない。変更した実装・テスト15ファイルのESLintは指摘なし、`git diff --check`とローカルMD参照の存在確認も成功した。

## 4. 制約と維持事項

候補の実到達・通信回数・UI互換性・照会の必要性・実フィールド／実効ACLは未確認。スクリプト名だけでCatalog等へ適用を拡大しない。関数間／全動的変更の解析や、固定ケースを独立評価とする主張は行わない。

MCP上は明示指定の追加で、既定3規則・0.2／0.3封筒・100行・受信量・出力上限・全体60秒・認証／release gateは不変。CL-002要求時のrulesetだけbp3-0.10へ追加。配布スキーマは型付き正本から機械再生成し、同期回帰で確認する。

実機操作・実トークン発行・設定変更・Pushは行わない。VM／監視・telemetry保留、Unknown・全体受付無効、本番cap／完成parts／permit非発行を維持。既存の`.vscode/`・`CLAUDE.md`は対象外。

## 5. コミット前の対象限定検証

リリース後のHEAD `0929c6f`＋今回の選別26ファイルだけを`git checkout-index`で一時領域へ展開し、未追跡の`.vscode/`・`CLAUDE.md`を含めずに確認した。依存は既存node_modulesへの参照を再利用しており、この確認自体を新規インストール試験とはしない。

- 隔離した内容で`npm run build`成功。
- 同じ領域の標準設定で全体合成回帰：130ファイル・3,507件成功、失敗／pending 0。JSON計測区間46.56秒、期限／retry設定変更なし。収集された全テストが当該一時領域のパスであることも確認。
- 変更した実装・テスト15ファイルのESLint指摘なし。

この検証記録の追記以外に、検証後の実装・テスト変更は行わない。一時JSON・チェックアウトはコミット対象外。
