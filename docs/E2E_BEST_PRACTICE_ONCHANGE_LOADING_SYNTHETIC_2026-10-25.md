# AU-CL-008：onChange読込時ガード・照会候補の合成検証

Date: 2026-10-25 / Source baseline: `e396f4d`
Status: 限定的な構文候補検出・合成検証。人の採用承認・実PDI検証・独立品質評価は未実施。

[設計書](BEST_PRACTICE_ONCHANGE_LOADING.md)に従い、payloadのtype=onChange、canonicalな入口・第4引数の束縛、照会APIの受信側、限定的なガード／処理順を分離した。読込時に必要な処理を違反・return不足と断定しない。AU-SRC-002のAustralia本文・Run only necessary scripts節を再読し、空のisLoadingブロックによる読込時実行の例も自動免除しない確認候補として扱う。

## 1. 合成ケース

- 早期return、否定分岐、strict boolean比較、OR／AND、条件式、単純alias、名前の異なる第4引数をサイトごとに評価。
- 照会後のガード・空ブロック・ログだけ・isTemplate／newValue条件を、読込時の除外と誤認しない。
- g_form／Client GlideRecord／GlideAjaxの実行APIとconstructor／条件設定／走査・独自同名APIを区別。
- 不明受信側・引数違い・method抽出／変更・escape・loop／try／switch・入口不明・入れ子関数を未解決とする。
- payloadイベント欠落／他イベントのmissing_context、非Client Script拒否、過去profile unsupported、本文非露出、共有AST／finding上限を確認。
- worker経由で0.3のevent証拠・確認項目の欠落拒否、未解決時にanalysis_completeを改変する結果の拒否を確認。
- 0.2封筒でCL-002とCL-008を混在させ、ガード後の照会にも必要性確認（CL-002）は残るが、読込時候補（CL-008）は作らないことを確認。
- MCP入力・配布JSON Schema同期・compiled worker／packaged MCP経路も検証する。

## 2. 実行・途中で発見した問題

| 実行 | 結果 |
|---|---|
| 最初の正例・実装前 | 1失敗。AU-CL-008がunsupportedで評価済み規則が空 |
| 初期実装後の同じ正例 | 1成功 |
| 初期ガード／metadata／API群 | 28成功 |
| 新規規則＋CL-002＋XML既存回帰 | 180成功 |
| 入れ子関数がloading aliasを書き換える新規境界 | 1失敗／66 filter対象外。誤ってguardedとして候補0件になることを再現 |
| 別名書込検査を修正後、新規規則全件 | 67成功 |
| 新規規則＋対象選択＋語彙＋MCP入力 | 157成功 |
| ビルド | 成功 |
| 全体合成回帰 | 131ファイル・3,577件成功、失敗／pending 0。JSON計測区間42.02秒 |
| 梱包試験 | production-only install＋compiled worker／packaged MCPの新規規則smoke成功。369ファイル |
| 変更した実装・テスト17ファイルのESLint | 指摘なし |

別名の失敗原因は、既存の限定追跡が入れ子関数から外側のaliasへ値を伝播しないため、aliasの由来が古い読込フラグのまま残ったこと。既存の束縛単位の書込情報を使い、明示書込があるaliasはガード証拠に採用せず、未解決へ倒す。一般的な関数間解析を追加したのではない。ガードへの誤昇格を拒否する同じケースを回帰に残した。

全体回帰は`bdo npm test -- --reporter=json --outputFile=/private/tmp/servicenow-cl008-full-20261025.json`で実行しexit 0／success=true。記録用reporter以外の既存設定・期限・retryは変更しない。梱包は`npm run test:pack`で確認し、新しいonchange-flow moduleを含む本番依存だけの配布経路でも動作した。

途中失敗を隠さず、期限・期待を緩めない。固定評価セットや過去の採点結果は変更せず、全体回帰内で既存評価テストも成功。`git diff --check`とローカルMDリンク先の存在も確認した。実機E2E・Rust/nativeの全試験・独立評価を行ったという意味ではない。

## 3. 範囲外・維持事項

実到達・全制御フロー・全動的変更・関数間伝播・UI互換性・読込時処理の業務上の必要性は未確認。候補なし／解析窓の完了を安全性や例外承認へ昇格させない。本文・資格情報・field名を記録・出力しない。

VM／監視・telemetryは保留。Unknown・全体受付無効、本番cap／完成parts／permit非発行を維持。実機操作・実トークン発行・設定変更・Pushは行わない。既存の`.vscode/`・`CLAUDE.md`は対象外。

## 4. コミット前の対象限定検証

HEAD `9f0db39`＋選別した関連28ファイルだけを`git checkout-index`で一時領域へ展開し、未追跡の`.vscode/`・`CLAUDE.md`を含めず検証した。既存node_modulesへの参照を再利用し、この確認自体を新規インストール試験とはしない。

- 当該領域で`npm run build`成功。
- 標準設定の全体合成回帰：131ファイル・3,577件成功、失敗／pending 0。JSON計測区間47.63秒。全testResultsのファイルが当該一時領域を指すことも確認した。期限・retry設定は変更していない。
- 変更した実装・テスト17ファイルのESLint指摘なし。

検証後の変更は本記録の追記のみで、実装・テストは変更しない。一時JSON・チェックアウトはコミット対象外。
