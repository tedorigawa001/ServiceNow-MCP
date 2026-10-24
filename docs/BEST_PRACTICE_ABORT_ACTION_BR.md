# AU-BR-005：before BRの中止後処理候補

Version: br-abort-0.1 / Date: 2026-10-24 / Source baseline: `41e04d6`
Status: 明示指定の候補検出・合成検証。人による規則採用承認・実PDI検証は未実施。

## 1. 根拠と判断の境界

[Australia台帳](BEST_PRACTICE_REGISTER_AUSTRALIA.md)のAU-BR-005、AU-SRC-001 / [Classic Business rules](https://www.servicenow.com/docs/r/australia/api-reference/business-rules-classic/c_BusinessRules.html) / Example business rule scripts → Abort a database action in a before business-ruleを根拠とする。今回も公式検索索引のAustralia表示・該当本文をAIが照合した。setAbortAction後も当該スクリプトと後続BRが継続するという説明であり、後処理の禁止やreturn追加の義務ではない。人による承認状態・原文hash・台帳の検証日は変更しない。

対象はUpdate Set payload版の`sys_script.script`、保存値`when=before`だけ。after/async/async_always/before_display・不明値は`missing_context`でスキップする。条件欄・filter_condition・Abort actionチェックボックスは本文の呼出しの代用にしない。

## 2. 受信側と順序の限定モデル

既存の字句scope・限定的alias/const解析から呼出し箇所の受信側と引数を取り、内部のbounded flow解析に渡す。同じ100,000 visit/深さ256の予算を共有し、flow解析の走査・状態コピー・合流・候補照合にも課金する。独立した無制限の予算は追加しない。

| 入力・経路 | 扱い |
|---|---|
| 確定したcurrent由来の`setAbortAction(true)` | 後続処理の起点。直接参照と既存解析で追える同関数aliasを対象 |
| 同名の独自オブジェクト・別GlideRecord | currentの中止起点としない |
| 受信側不明・true/falseを決められない引数 | `abort_flow_unresolved`。起点を確定しない |
| 単独のfalse指定 | 中止起点としない。先行起点後のfalse指定は再設定の効果を認定せず未解決にする |
| 関数・ブロック内の逐次処理 | 起点より前の処理を後続と誤認しない |
| if/条件式 | 両側を別状態で評価して合流。同一ifの排他的な枝を混ぜない。真偽値リテラルは選択枝だけ |
| logical expression | 短絡枝と実行枝を分離。真偽値リテラルの短絡を区別 |
| return/throw | 値の式を先に評価し、その経路を終了。終了後の文は候補にしない |
| 関数定義 | 外側の起点を本体へ伝播しない。本体を独立に静的解析し、呼ばれた/到達したとは断定しない |
| ループ・switch・try/catch/finally・with・class・await/yield・optional chain等 | setAbortAction呼出しを含む/起点後に現れた場合は保守的に未解決にし、その境界を越えて順序を推定しない |
| eval/with・検出できたsetAbortActionプロパティの書換え | 保守的に未解決。メソッドの実体を確定しない |

条件同士の相関、関数間伝播、一般的な定数実行、すべての動的書換えは扱わない。未知関数がthrowする可能性もあり、構文上の後続候補は実到達の証明ではない。

## 3. 副作用・必要な後処理の扱い

- 起点後の明示的Call/Newを`abort_following_call_effect_unverified`とする。メッセージ表示・ログ・必要な解放処理も含み、呼出しに副作用があるとは確定しない。
- プロパティへの直接の代入・増減・deleteを`abort_following_property_write`とする。メモリ上の変更か永続化か、対象の業務上の意味は未確認。
- 呼出しを伴わないローカル変数初期化や式の評価だけでは候補を出さない。暗黙のgetter/setter、識別子への代入、destructuringによる書込み等を網羅する副作用解析ではない。
- 1つの中止呼出し箇所につき1候補。後続処理が複数あっても重複せず、同じ行の別呼出しは別候補。既存の100候補上限を維持する。
- 全候補にrule_intrinsicの`post_abort_processing_review`を付け、必要性・副作用・後続BRとの関係を人に確認する。追補profileは`bp-followups-br005-0.1`。既存の固定3規則用profileと評価セットは変更しない。

候補はinfo/low/candidate、コード本文・変数名・引数・後続処理本文は返さない。自動修正・return挿入・スクリプト実行・後続BR照会はしない。後続BRを停止できるという説明もしない。

## 4. MCP契約・互換性

```json
{
  "update_set_sys_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "requested_rule_ids": ["AU-BR-005"],
  "selection_mode": "review_targets",
  "max_records": 20
}
```

明示要求の最大を6規則へ拡張。既定3規則は不変。BR-005を要求する結果のrulesetは`bp3-0.7`、従来の要求は0.4/0.5/0.6を維持する。selection省略/bounded_allは0.2、review_targetsは0.3。候補filter・100件・受信量・全体60秒・worker中断・認証/リリースgateは変更しない。

strict結果検証ではBR-005候補に限定解析の3制限・少なくとも1つの後続処理分類・必須確認項目を要求する。未解決のflowを含む集約は`analysis_complete=false`にする。スキップや0候補を安全と解釈しない。旧profileではBR-005はunsupportedのまま。

## 5. 検証と保留事項

[合成検証記録](E2E_BEST_PRACTICE_ABORT_ACTION_BR_SYNTHETIC_2026-10-24.md)を参照。実際の中止効果、後処理の必要性、他BR・スコープ権限との関係、実PDI E2E・独立品質評価は未確認。

VM/監視とtelemetry調査は保留。MA-02のUnknown・全体受付無効、本番cap/完成parts/permit非発行を維持。実機操作・設定変更・Pushへ進めない。
