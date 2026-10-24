# AU-BR-004：BRのトップレベル変数候補と共有文脈

Version: br-bindings-0.1 / Date: 2026-10-24 / Source baseline: `16d58f1`
Status: BR限定の候補検出・合成検証。人による採用承認・実機確認は未実施。

## 1. 根拠と適用

[Australia台帳](BEST_PRACTICE_REGISTER_AUSTRALIA.md)のAU-BR-004を実装した。根拠はAU-SRC-001の[Classic Business rules](https://www.servicenow.com/docs/r/australia/api-reference/business-rules-classic/c_BusinessRules.html)、Global variables in business rules → Define variables。関数内へ閉じる推奨と変数衝突の懸念に基づく。今回、公式検索索引のAustralia表示/本文で、Global business rules節およびtableとapplication scopeのglobalの区別もAIが再照合した。原文の人による採用承認を更新したものではない。

レビュー対象はUpdate Setに保存されたsys_scriptのscript。実際の別BRとの名前重複・実行順・値の上書き・業務影響を確認した結果ではない。候補の検出と、意図的な共有が承認済みかの判断を分ける。自動ラップ・自動修正・スクリプト実行はしない。

## 2. 宣言とスコープの契約

既存AST解析のprepare/walkに任意のBR-004用callbackを接続し、同じ100,000 visit/深さ256の解析予算内で処理する。別の無制限走査や実行エンジンは追加しない。

| 構造 | 扱い |
|---|---|
| script直下のvar/let/const | 変数宣言候補。let/constの実行環境間の寿命/衝突は確認済みにしない |
| script直下にあるif/block/for/switch等の中のvar | 関数内ではないvar宣言として候補にする。分岐の実行有無は未確認 |
| block/for/switch内のlet/const | block-localとして対象外 |
| FunctionDeclaration/Expression/Arrow内の変数・引数 | 関数localとして対象外。IIFE・executeRule・旧onBefore等の関数本体も同じ |
| classのmethod/static block内の変数 | 関数/静的block内として対象外 |
| varに代入されたfunction expression | 外側var自体は候補、関数本体の変数は除外 |
| destructuring・複数宣言 | VariableDeclaratorの宣言箇所ごとに1候補。名前数や実際の衝突件数ではない |
| コメント/文字列/正規表現 | 宣言として扱わない |
| トップレベルfunction/classの宣言名、宣言のない代入、this等へのexport | 今回の「変数宣言」検出の対象外。安全と確認したものではなくbr_declared_variables_onlyで範囲を明示 |
| eval/with | 動的scopeの可能性をbr_dynamic_scope_unresolvedとして残し、指摘0件でも解析完了にしない。全ての間接eval等を検出する保証はない |

1宣言の行位置は返すが、変数名・初期値・コード本文は返さない。非アクティブ資産でも候補を消さず、既存inactive_asset制限を維持する。構文解析の対応と、対象インスタンスでのJS機能の実行可否は別である。

## 3. 意図的共有との区別

XML本体のcollectionを同じpayloadから取得し、table名形式（小文字識別子、最大80文字）の場合だけ文脈分類に使う。補助recordのcollectionを代用せず、現行レコードへのfallbackや追加照会もしない。collectionという内部field値の実PDI再確認は今回は行っていない。

| payloadの文脈 | 出力制限 | 意味 |
|---|---|---|
| collection=global | br_global_table_shared_context | 共有があり得るGlobal-table BRの構造。共有意図の承認・安全な共有の証明ではない |
| その他のtable名形式 | br_non_global_table_context | 通常tableを指す文脈。tableの存在/ACL/実際の衝突を照会したものではない |
| 欠落/空/不正形式 | br_table_context_unknown | 共有文脈を判断できない。候補を保持し、analysis_complete=false |

**sys_scope=globalだけではGlobal-table BRと判定しない。** 名前prefix、コメントの「意図的/承認済み」、global tableという構造のいずれも自動除外条件にしない。共有の利用側・互換性・既存の承認はコードだけでは分からないので人が確認する。今回、実行時利用者の自己申告や抑制pragmaを追加していない。

全候補に型付きrequired_follow_up `shared_binding_intent_review`を付ける。kindはrule_intrinsicで、共有の例外を見分けたという性能評価にはしない。意味は共有意図、他BRとの衝突、関数内へ閉じる可否と利用側互換性の確認である。既存の3規則用follow-up評価profile bp-followups-0.4は維持し、BR-004追補をbp-followups-br004-0.1として区別する。固定評価データ・採点器・過去レポートを書き換えない。

## 4. MCP・契約・互換性

```json
{
  "update_set_sys_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "requested_rule_ids": ["AU-BR-004"],
  "selection_mode": "review_targets",
  "max_records": 20
}
```

- 既定はAU-BR-001/002とAU-CL-004の3件のまま。明示指定へBR-004を加え最大5件。QRY-001のBR限定対応も維持する。
- BR-004を要求する1件/集約のrulesetはbp3-0.6。QRYだけなら0.5、旧規則だけなら0.4。混在するClient Scriptの入れ子は適用規則に応じ0.4を維持する。
- selection_mode省略/bounded_allは0.2、review_targetsは0.3の既存集約形式。BR-004はBR候補にだけ対応付け、filter式/版、件数・受信量・全体60秒、worker中断、認証/リリースgateを変えない。
- severity=info、confidence=low、verification_status=candidate、code_return_mode=none。追加したfieldはcollectionの内部取得だけで、本文/変数名/table値をJSONへ追加しない。
- BR-004候補には宣言限定・衝突未確認・3種類から1つのtable文脈を要求し、共有確認項目の欠落をstrict検証で拒否する。
- metadata不明または動的scope未解決はpartial/incomplete。Global-tableというだけで不完全とはしないが、解析窓の完了は意図/承認/全Update Setの適合を意味しない。
- legacy/scoped/contextualの歴史的profileでは同規則は従来どおりunsupported。既定の旧規則およびQRY結果は変更しない。旧JSON例を有効に保ち、追加rule/enum/rulesetを含むschema生成物を同期する。

## 5. 検証・残課題

[合成検証記録](E2E_BEST_PRACTICE_TOP_LEVEL_BINDINGS_BR_SYNTHETIC_2026-10-24.md)を参照。関数/ブロックscope、Global-table/通常table/不明、コメントの非承認扱い、MCP→worker→strict JSON、finding上限と非露出を確認する。実際の他BRとの衝突・意図・実行時共有・PDI E2E・独立品質評価は未確認。

VM・監視環境の調査は保留。MA-02のUnknown・全体受付無効・telemetry保留、完成parts/permit非発行は変更しない。実機操作・設定変更・Pushへ進めない。
