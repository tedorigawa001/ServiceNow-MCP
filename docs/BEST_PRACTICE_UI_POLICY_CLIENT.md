# AU-CL-006：Client ScriptのUI Policy検討候補

Version: cl-ui-policy-0.1 / Date: 2026-10-24 / Source baseline: `06a0044`
Status: 限定的な候補検出・合成検証。規則の人手承認・実PDI検証は未実施。

## 1. 根拠と判断の境界

[Australia台帳](BEST_PRACTICE_REGISTER_AUSTRALIA.md)のAU-CL-006、AU-SRC-002 / [Client-side scripting design and processing](https://www.servicenow.com/docs/r/australia/api-reference/scripts/client-script-best-practices.html) / Use UI policy instead of a client scriptを、既存台帳の根拠として使用する。可能な場合にUI Policyを検討するという推奨であり、Client Scriptの一律禁止ではない。

対象API/引数は、今回検索取得したAustralia表示の公式[GlideForm (g_form) - Client](https://www.servicenow.com/docs/r/api-reference/c_GlideFormAPI.html) / setMandatory、setVisible、setDisplay、setReadOnlyを補足とする。同資料は各APIで可能な場合のUI Policy利用を推奨し、setVisibleの表示差などUI別条件も記載する。本実装は全UIでの実行可否を検証するものではない。

設計/処理の該当節は公式検索結果でも確認したが別localeの結果を含むため、Australia台帳の新しい確認日・人による採用承認へ昇格させない。台帳の根拠URL・既存verified_on・原文hashは変更しない。

対象はUpdate Set payload版の`sys_script_client.script`のみ。Catalog Client Script、UI Policy、Portal widget、Workspace等の別資産を同じ実装で対応済みにしない。

## 2. 検出の内部契約

既存の字句scope・限定alias・const評価へ任意callbackを接続し、同じ100,000 visit/深さ256のAST予算を共有する。独立した無制限走査・スクリプト実行・UI実行は追加しない。後段の候補確定にも予算を課金する。

| 構文・文脈 | 扱い |
|---|---|
| 確定したg_form由来のsetMandatory | 必須/任意の制御候補 |
| setVisible / setDisplay | 表示制御候補。両者の表示上の効果を同じと保証しない |
| setReadOnly | 読取専用/編集可の制御候補 |
| true/false | どちらも候補。解除なら自動免除することはしない |
| 同関数の局所alias・既存解析で追えるobject/array | g_form由来を確定できる範囲で候補 |
| 同名の独自オブジェクト・別GlideRecord | g_formと誤認しない |
| 引数/変数宣言によるg_formのshadow、不明受信側・条件付きの由来 | ui_policy_control_unresolvedとして残す。名前だけで候補を断定しない |
| 動的field/真偽値式・関数呼出しの戻り値 | 2引数の制御構文なら候補を保持し、ui_policy_dynamic_argumentsを付ける。型・値・複雑さの妥当性は未確認 |
| 引数数違い・spread・明らかに不適切なリテラル型・空field | 未解決。数値/nullのfield、文字列/nullの真偽値を有効なAPI呼出しと確定しない |
| 動的メソッド名 | 既存の限定定数評価で対象名を解決できれば評価。g_form上で解決不能なら未解決 |
| eval/with・対象メソッドの書換え/delete・検出した一括変更 | 保守的に未解決。その資産で集めた候補を確定せず保留する |
| コメント・文字列・正規表現・他のAPI | 対象4制御の呼出しと誤認しない |

メソッドを変数に取り出した呼出し、一般的な関数間解析、すべてのprototype/動的変更は対象外。制御名の書換えは局所の別オブジェクトであっても保守的に未解決とする場合がある。コードの実到達・分岐の実行・UIにおける実効状態は証明しない。

## 3. 複雑な処理・UI制約の扱い

全候補はmaintainability / info / low / candidate。rule_intrinsicの`ui_policy_suitability_review`を付け、表現可能性、複雑な処理、Client Script/UI Policyとの実行順、対象UI/API制約、既存制御との競合・業務上の必要性を人に確認する。追補profileは`bp-followups-cl006-0.1`。例外の識別成績ではない。

単純そうな構文でもUI Policyへ移行可能とは断定しない。条件式・onSubmit・複雑な呼出し・「承認済み」というコメントも、自動的な違反/免除の根拠にしない。UI種別・イベント・UI Policy・実フィールド定義は今回追加取得せず、ui_policy_suitability_not_verified / ui_policy_ui_compatibility_not_verifiedを全件に残す。

自動移行・Client Script削除・制御削除・新しいUI Policy作成は行わない。フィールド名・値・メソッドのコード本文は返さない。候補は呼出し箇所ごと、分類limitationsは資産単位（ui_policy_mandatory_control / ui_policy_visibility_control / ui_policy_readonly_control）。既存100候補上限を維持する。

## 4. MCP契約・互換性

```json
{
  "update_set_sys_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "requested_rule_ids": ["AU-CL-006"],
  "selection_mode": "review_targets",
  "max_records": 20
}
```

明示指定は最大8規則へ拡張、既定3規則は不変。CL-006を要求する結果はruleset bp3-0.9、過去の要求は0.4～0.8を維持する。混在集約のBRはその適用規則に応じた旧版を維持する。

Client Scriptの既存prefix/filterを再利用し、selection省略/bounded_allの0.2、review_targetsの0.3、filter版・100件・受信量・全体60秒・worker中断・認証/リリースgateを変えない。

strict結果検証はCL-006候補に、必須確認項目・限定対象/推奨適否/UI未確認/API subsetの4制限・少なくとも1つの制御分類を要求する。未解決があればanalysis_complete=false。動的な引数の候補だけでは、構文窓の完了を妨げないが、型・UI互換性や移行可能性の確認済みを意味しない。歴史的profileはunsupportedのまま。固定評価セット・採点器・過去成績は変更しない。

## 5. 検証・保留

[合成検証記録](E2E_BEST_PRACTICE_UI_POLICY_CLIENT_SYNTHETIC_2026-10-24.md)を参照。実フィールド・実効制御・UI Policyへの移行・実PDI E2E・独立品質評価は未確認。

VM/監視・telemetryは保留。MA-02 Unknown・全体受付無効、本番cap/完成parts/permit非発行を維持。実機操作・設定変更・Pushへ進めない。
