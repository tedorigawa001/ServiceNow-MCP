# 文脈別required_follow_upの実装・固定v0.2再評価

Date: 2026-10-17。ローカルPoC、MCP未統合。PDI操作・コード実行・外部送信なし。

**解釈の訂正（カタログ0.3）:** 本書の18/18は確認項目の要求充足であり、例外文脈の識別率ではない。
改善12件はAU-BR-001の文脈依存項目4件と、AU-BR-002/CL-004の規則固有項目8件。
後者2規則は通常問題の候補にも項目を付けており、問題と例外の付け分けは行っていない。
固定ケース・集計値・JSONは履歴として維持し、[分離評価](BEST_PRACTICE_FOLLOW_UP_POLICY_EVALUATION.md)を別に記録する。

## 1. カタログレビューと採用範囲

[共通カタログ](BEST_PRACTICE_FOLLOW_UP_CATALOG.md)の6コードについて、意味・付与条件・
規則対応・「証明しないこと」を、既存の台帳と出力/採点契約に照合した。
新たな公式資料の再調査ではなく、登録済み根拠とローカル仕様の整合性レビューである。

| 規則 | 台帳の根拠節 | レビュー結論 |
|---|---|---|
| AU-BR-001 | AU-SRC-001 / How business rules work → Prevent recursive business rules | workflow抑止は自動除外・承認の証拠ではない。受信側と同一関数内の先行という構文条件に限定し、効果未確認を併記 |
| AU-BR-002 | AU-SRC-001 / When business rules run（Note）、Global variables in business rules | 本文の依存と条件欄を区別。async_always/旧asyncの保存値対応を使用。ガードや例外処理は自動正当化しない |
| AU-CL-004 | AU-SRC-002 / Minimize server lookups → Retrieve server data using asynchronous GlideAjax | 同期候補にUI制約・非同期代替の確認を求める。未解決の同名受信側をGlideAjaxと断定しない |

根拠URL・適用条件の正本は[Australia台帳](BEST_PRACTICE_REGISTER_AUSTRALIA.md)。
規則・根拠資料の採用承認、人による採点、本番品質承認を済ませたとは扱わない。

## 2. 実装と境界

現行rulesetをbp3-0.3、確認項目カタログをbp-followups-0.2とする。
候補検出時に型付き文脈を渡し、カタログの生成関数で汎用3コードと該当規則のコードを返す。
結果契約はbp-review-0.1のままで、旧自由記述結果・旧rulesetの互換性を保つ。
生成側は既知・該当規則のコードだけを返すが、過去の全結果を列挙型で制限する変更はしない。

- workflow: current由来の受信側に対する1引数setWorkflow(false)が、同じ関数内の更新候補より
  ソース上で先行したときだけ付与。真偽値falseのリテラル以外は対象外。
  関数IDと最初の該当呼び出し終端位置だけを保持し、本文の追加コピー・別AST走査はしない。
  同一経路・実行順・更新時の効果は判定せず、workflow_suppression_relation_not_verifiedを併記する。
  相反する分岐、途中の再有効化も「抑止が有効」の証明でなく関連し得る確認対象として残す。
- async: 非同期文脈で検出したprevious/changes系の各候補へ付与。条件欄・未知when・ローカル同名
  オブジェクト・文字列/コメントには付けない。防御的処理を評価済みとはしない。
- Ajax: 実際のgetXMLWait候補へ付与。既知ローカル受信側は既存判定で除外し、未解決なら
  synchronous_ajax_receiver_unresolvedも併記する。

制限は結果全体に重複なく記録する。inactive_assetも従来どおり併存し、候補を抑制しない。
関数間の別名・引数/戻り値・動的メソッド名・到達可能性・workflow状態の実行解析は追加しない。
setWorkflowという語だけ、別関数、後置の抑止、動的falseの評価などからは関連を推測しない。
これらは実装の限界であり、確認項目の有無から安全性や例外承認を推測しない。
100,000訪問・深さ256・候補100件の制限を維持し、結果はcandidate/low/info、本文非返却。

## 3. 固定条件と保存先

- 固定72ケースと採点条件は変更しない。ケースSHA-256は
  `9edbe42d8546f898640c55f86c219ed71d1159a540aa06870090a7f327d988df`。
- [初回結果](evaluation/bp4-v2-baseline.json)と[前回scoped結果](evaluation/bp4-v2-scoped.json)は不変。
- [今回の結果](evaluation/bp4-v2-followups.json)を別保存。dataset_hashも一致する。
- CLI既定は今回の出力、--scopedは前回の汎用項目のみの出力プロファイル、--legacyは初回経路。
  --scopedは現行の抽出/候補検出を共有して固定結果を再現するもので、過去の実装全体の凍結ではない。
- 採点器の計算・期待値は変更しない。CLIの今回のメタデータにカタログ版を追加し、
  履歴書式のno_engine_tuningをengine_updated_after_dataset_reviewへ置き換える。
  生の採点器は履歴互換書式を維持する。今回を未使用holdout・未調整の評価とは主張しない。

## 4. 改善・退行の内訳（前回scopedとの比較）

| 区分 | ケース | 結果 |
|---|---|---|
| workflow確認項目不足 | F01/F02/F03/F06 | 4件改善 |
| async確認項目不足 | F07/F08/F09/F12 | 4件改善 |
| 同期Ajax確認項目不足 | F13/F14/F15/F18 | 4件改善 |
| inactiveのみが必須だった例 | F04/F05/F10/F11/F16/F17 | 契約充足を維持。async/Ajaxでは固有項目も併存 |
| 通常正例の追加確認 | P07/P08/P09/P11/P13/P14/P15/P16 | candidate→candidate_with_followup。契約上は引き続き適合 |
| 範囲外の関数間解析 | P03/P06/P10/P12 | FN4件のまま |
| 範囲外の動的呼び出し | P17/P18 | FN2件のまま |
| 負例・情報不足 | C系18件・I系18件 | 誤候補0、適切な保留18/18を維持 |

IDはすべてV2-接頭辞。契約改善12件・契約退行0件。
全72ケースで候補件数・評価範囲・ハッシュ・出典・検証状態は前回と同じ。
分類の完全一致は改善12件と正例8件の追加確認による不一致が相殺し、36/54→40/54。
追加確認付きの正例を契約違反と数えないという、既存の採点方針を維持する。
単に「退行なし」と一般化せず、分類変更と残る6件の見逃しを分けて示す。

| 指標 | 前回→今回 | 今回の点推定 | 参考95% Wilson区間 |
|---|---|---:|---|
| 候補適合率 | 30/30→30/30 | 100% | 88.6〜100% |
| 候補再現率 | 30/36→30/36 | 83.3% | 68.1〜92.1% |
| 確認項目充足 | 6/18→18/18 | 100% | 82.4〜100% |
| 契約充足 | 36/54→48/54 | 88.9% | 77.8〜94.8% |
| 3分類の完全一致 | 36/54→40/54 | 74.1% | 61.1〜83.9% |

invalid_outputs=0、confirmed_findings=0、contract_suite_passed=false、品質承認approved=false。
開発用の関連した合成ケースの参考値であり、独立母集団での性能保証ではない。

## 5. 回帰検証

新規context-follow-up.test.tsは、実データ相当の架空XML封筒で32件を検証する。
workflow・async・Ajaxの順に失敗する再現テストを追加し、実装後の成功を確認した。
同名API・無関係な抑止・受信側再代入・関数境界・分岐・再有効化・後置抑止・旧BR入口・
条件欄・非アクティブ・型付きコードの適用・本文非返却を確認する。
新規再評価テスト4件で別JSONとの一致・12件改善/契約退行0・分類変更・検出不変を確認する。
旧スコープ再評価テストは前回出力プロファイルを明示し、過去の検証を残す。
採点器のテスト専用oracleは、検出器の新しい確認項目を引き継がず自身の出力を明示する。

再現コマンド:

```bash
bdo npm test -- tests/review
bdo node --import tsx scripts/bp4-evaluate-v2.ts
bdo node --import tsx scripts/bp4-evaluate-v2.ts --strict
bdo node --import tsx scripts/bp4-evaluate-v2.ts --scoped
bdo node --import tsx scripts/bp4-evaluate-v2.ts --legacy
```

--strictは契約未達を示すexit 2。品質承認ではない。
未使用ケース・人の採点、残る範囲外解析の設計、MCP統合判断は今後の課題。

検証結果（2026-10-17）:

| 検証 | 結果 |
|---|---|
| `bdo npm test -- tests/review` | 12ファイル・234件成功 |
| `bdo npm test` | 77ファイル・2,058件成功 |
| `bdo npm run build` | 成功 |
| 対象ESLint・v0.2 CLIの単独strict型チェック | 成功 |
| 現行CLIと今回の保存JSON | 完全一致。--strictはexit 2 |
| --scoped / --legacy | それぞれ既存の保存結果と完全一致 |
| 配布JSON Schemaと生成元 | 同期テスト成功。旧rulesetも受理 |
| 固定ケース・採点器・既存3結果JSONのgit差分 | なし |
| `bdo git -c core.fsmonitor=false diff --check` | 問題なし |

TDDで文脈3種類の未出力をそれぞれ失敗として再現し、修正後に成功を確認した。
完了前検証ではテストの終了コード・件数・ビルド・Lintを確認した。

後続の[新規36ケースによる追加評価](BEST_PRACTICE_NEW_FOLLOW_UP_EVALUATION.md)では、
本書の固定v0.2結果・ケース・検出器を変更せず、確認項目の誤付与・不足を別に記録した。
