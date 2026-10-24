# AU-BR-007：before_display限定のcurrent書込み合成検証

Date: 2026-10-24 / Source baseline: `eb82e55`
Status: 合成検証。人の規則採用承認・独立品質評価・実PDI確認は未実施。

## 1. 変更範囲

[詳細設計](BEST_PRACTICE_DISPLAY_WRITE_BR.md)に従い、payload保存値before_displayのBRを対象にcurrent由来の限定的な書込み候補を追加した。既存のscope/alias/const解析と同じAST予算を使う。候補はinfo/low/candidate、表示目的か永続保存要件があるかを`display_persistence_intent_review`で人に確認する。表示変更を違反と断定し、自動update追加・変更削除をする機能ではない。

既定3規則、0.2/0.3の選択方式、件数・受信量・全体60秒、worker中断・認証/リリースgateは維持。BR-007の明示要求はruleset bp3-0.8、過去の要求は元のrulesetを維持する。MCPの指定上限は7規則、コード・値・フィールド名を出力へ追加しない。

## 2. テスト駆動の確認

1. 最初のcurrent代入テストはunsupportedで失敗。保存値gateと既存受信側解析へのcallback接続で成功。
2. setter検出の取りこぼしを失敗で確認し、current.setValueの2引数、current fieldのsetValue/setDisplayValueの1引数を追加。
3. 増減/deleteの取りこぼしを確認し、直接代入・増減・deleteを分類した。
4. scratchpad/別レコードを不明なcurrentと混同する境界を確認し、既知の非current由来を除外。
5. setter置換後に誤候補を出す境界を確認し、eval/withや検出できたsetter書換えを保守的に未解決とした。
6. 反復のmember代入先と一部bulk mutation helperを完了扱いにする失敗を確認し、未対応として不完全性を保持。

## 3. 回帰範囲

- 新規32ケース：直接/複合代入、増減・delete、setter/読取り、受信側alias・局所コンテナ、currentのshadow、previous/scratchpad/別GlideRecord、動的field・dot-walk・spread・eval・destructuring、不正/欠落when、historical profile、100 finding/共有AST上限。
- worker集約2ケース：before_display選択・bp3-0.8・本文/資格情報canary非露出、必須確認項目欠落の拒否、未解決の集約をanalysis_completeへ昇格した改変結果の拒否。
- 旧3規則・QRY-001・BR-004・BR-005、固定評価セット、JSON例・生成schemaの互換性。
- 本番依存のみのtarballで既定・追加各規則のコンパイル済みworker/MCP経路を呼び出す梱包検証。

## 4. 最終検証

| 確認 | 結果 |
|---|---|
| `bdo npm run type-check` | 成功 |
| 変更した実装・テスト・梱包fixtureのESLint | 成功、指摘なし |
| `bdo npm run test:pack` | build成功、本番依存のみでworker/MCP経路成功、365ファイル |
| 旧互換検査更新後の関連2ファイル | 67テスト成功 |
| `bdo npm test -- --maxWorkers=1`（ローカル待受を許可、最終再実行） | 126ファイル・3,390テストすべて成功、172.92秒 |
| 新規文書の相対参照、`git diff --check` | 成功 |

固定セット・採点器・過去成績は変更せず、合成ケースの通過数を独立した精度の証明に使わない。新規の実行時モジュールや依存追加はなく、tarballファイル数は365のまま。

初回全体回帰は126ファイル中125成功、3,390テスト中3,389成功、1失敗（178.59秒）。残っていたbr-compatibility.test.tsの「BR-007は未実装」という期待が原因だった。before_displayをasync扱いしない検査を維持し、update呼出しだけはBR-007のフィールド書込みとしないことと、直接代入の候補化を確認する期待へ更新した。新規テストのhistorical profileでのunsupported検査は維持し、固定評価セットや採点基準は変更しなかった。

## 5. 制約・維持事項

before_displayという保存値は既存のPDI調査記録を前提にし、今回は実機で再確認していない。フィールド型・存在・表示結果・永続化・後続保存や他BR・条件/到達可能性・全setter/暗黙getter・一般的な変更伝播は未確認/対象外。分類limitationsは資産単位で、後続処理のコード詳細やfield名を返すものではない。0候補/解析窓完了は安全や適合を意味しない。

根拠の直接取得404と公式検索経由で確認できた範囲は詳細設計§1に記録し、別localeやAPI資料をAustralia根拠の新しい承認へ昇格していない。

VM/監視・telemetryは保留、MA-02 Unknown・全体受付無効、本番cap/完成parts/permit非発行を維持。実機操作・トークン発行・設定変更・Pushは行っていない。
