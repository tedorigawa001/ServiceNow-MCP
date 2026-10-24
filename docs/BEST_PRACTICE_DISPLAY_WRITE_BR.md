# AU-BR-007：display BRのcurrent書込み候補

Version: br-display-write-0.1 / Date: 2026-10-24 / Source baseline: `eb82e55`
Status: 明示指定の限定候補検出・合成検証。規則の人手承認・実PDI検証は未実施。

## 1. 根拠と意味

[Australia台帳](BEST_PRACTICE_REGISTER_AUSTRALIA.md)のAU-BR-007、AU-SRC-001 / [Classic Business rules](https://www.servicenow.com/docs/r/australia/api-reference/business-rules-classic/c_BusinessRules.html) / Display business-rulesを、既存台帳に登録された根拠として使う（人による採用承認は引き続き未実施）。表示時のフィールド変更を永続保存と誤認しないための確認であり、表示目的の変更を禁止する規則ではない。

今回、公式検索結果でAustralia表示・節の存在を再確認したが、英語ページの直接取得は404で失敗した。表示変更についての本文は別localeの公式検索結果でも確認できたが、その表示版をAustraliaの再検証証拠に昇格させない。台帳の日付・原文hash・人の承認状態は変更しない。

setterの限定構文の補足は、Australia表示の公式[GlideElement - Global](https://www.servicenow.com/docs/r/api-reference/server-api-reference/c_GlideElementAPI.html) / setValue(Object value)、setDisplayValue(Object displayValue)の検索取得本文を参照した。API文書の要約であり、実PDIでのフィールド型・実行可否の確認ではない。

対象はUpdate Set payload版のsys_script、**保存値when=before_displayだけ**。UI表示名`display`を保存値として代用しない。before/after/async/async_always/display/欠落は`missing_context`でスキップする。既存のBR-002用の保存値正規化や歴史的profileは変更しない。

## 2. 受信側と書込みの境界

既存の字句scope・限定alias・const評価に任意callbackを接続する。同じ100,000 visit/深さ256のAST予算を共有し、独立した無制限走査・コード実行は追加しない。

| 構文/受信側 | 扱い |
|---|---|
| current.field = value、複合代入 | current確定・静的キーなら候補。メタデータ上の実フィールドかは未確認 |
| current.field++/--、delete current.field | current上のプロパティ変更候補。GlideElementの実行時挙動・永続化は未確認 |
| current.setValue(field, value) | current確定、2引数、限定定数評価で識別子形式のfield名なら候補 |
| current.field.setValue(value)/setDisplayValue(value) | current field由来と確定した受信側、1引数・spreadなしなら候補 |
| 同関数内のcurrent/field alias、既存解析で追える局所コンテナ | 上記の確定した由来を維持できる範囲で候補 |
| previous・別GlideRecord/Secure・独自オブジェクト・scratchpad | currentへの書込みと誤認しない。scratchpad名がcurrentのaliasへ再束縛された場合は由来を優先 |
| 読取り、getValue、update/setWorkflowだけの呼出し | この規則のフィールド書込み候補ではない。updateを安全と確認するものでもない |
| 不明受信側・動的field名・nested/dot-walkの書込み・不正/不明setter引数 | `display_write_unresolved`。候補や問題なしへ強制変換しない |
| eval/with・検出したsetterプロパティの書換え | 保守的に未解決。メソッドや束縛を確定しない |
| destructuring代入・反復のmember代入先・current/fieldを渡す一部一括変更ヘルパー | 未対応の書込みとして未解決。Object.assign/defineProperty等であり全mutator網羅ではない |

ブロックや関数の本文は既存の静的解析に従い、到達・呼出し・分岐実行を証明しない。BR-005の限定順序解析をこの規則へ流用したものではない。条件・return後のコードを一般的に実行不能と証明する解析も追加していない。

各書込み箇所につき1候補、同一行の別箇所も区別する。分類は資産単位のlimitations（display_direct_assignment / display_update_expression / display_delete_property / display_field_setter）で返す。書込み値・変数名・フィールド名・コード本文は返さない。

## 3. 意図の確認と制限

全候補はinfo/low/candidate。rule_intrinsicの`display_persistence_intent_review`を付け、表示目的か、永続保存要件があるか、明示保存/他BRとの関係を人に確認する。追補profileは`bp-followups-br007-0.1`。表示目的の変更も候補を保持するが、違反・業務影響・保存漏れを確定しない。自動update追加・変更削除はしない。

共通制限はdisplay_before_display_only / display_field_metadata_not_verified / display_persistence_not_verified。sys_dictionaryや他BRは追加照会せず、getter/setterの暗黙動作、全setter/Reflect等のmutator、関数間の変更伝播、実行時の保存を網羅しない。0候補も安全・適合の証明ではない。

## 4. MCPと互換性

```json
{
  "update_set_sys_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "requested_rule_ids": ["AU-BR-007"],
  "selection_mode": "review_targets",
  "max_records": 20
}
```

明示指定は最大7規則、既定3規則は維持。BR-007を要求した結果だけruleset bp3-0.8とし、従来要求の0.4～0.7を維持する。selection省略/bounded_allの0.2、review_targetsの0.3、filter・100件・受信量・全体60秒・worker中断・認証/リリースgateは不変。

strict結果検証は、BR-007候補に必須確認項目・上記3制限・少なくとも1つの書込み分類を要求する。未解決なら集約のanalysis_complete=falseを強制する。歴史的profileは同規則unsupportedのまま。固定評価セット・採点器・過去成績は変更しない。

## 5. 検証と保留

[合成検証記録](E2E_BEST_PRACTICE_DISPLAY_WRITE_BR_SYNTHETIC_2026-10-24.md)を参照。実フィールド型・表示結果・永続化・実PDI E2E・独立品質評価は未確認。

VM/監視・telemetryは保留。MA-02 Unknown・全体受付無効、本番cap/完成parts/permit非発行を維持。実機操作・設定変更・Pushは行わない。
