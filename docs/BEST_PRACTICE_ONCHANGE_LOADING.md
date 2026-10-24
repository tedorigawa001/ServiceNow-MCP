# AU-CL-008：onChangeの読込時照会・ガード確認候補

Version: cl-onchange-loading-0.1 / Date: 2026-10-25
Status: 限定的な構文候補検出・合成検証。人による規則採用承認・実PDI確認・独立品質評価は未実施。

## 1. 根拠と判断の境界

[Australia台帳](BEST_PRACTICE_REGISTER_AUSTRALIA.md)のAU-CL-008、AU-SRC-002 / [Client-side scripting design and processing](https://www.servicenow.com/docs/r/australia/api-reference/scripts/client-script-best-practices.html) / **Run only necessary scripts**を根拠とする。2026-10-25にAustralia本文・更新日2026-10-08を再読した。

同節はonChangeでの読込時の照会、isLoadingでの早期return、isTemplate・newValue条件の目的を区別し、読込時に実行すべき処理も扱う。本実装は「ガードが無いから違反」とはしない。`if (isLoading) {}`のような明示的な読込時実行の形も、意図の確認候補として保持し、自動免除／違反確定しない。原文の全文・コードを転載せず、既存catalogのverified_on・人の採用承認状態は変更しない。

## 2. 適用対象と入口

- Update Set payload版の`sys_script_client.script`、同じ本体レコードの`type=onChange`だけに適用する。metadata一覧の表示用typeや関数名だけでイベントを推測しない。
- type欠落・他イベント・未知値はmissing_contextで規則をskip。取得経路を増やして現行レコードへフォールバックしない。
- 単一のトップレベル関数宣言`onChange`を入口とする。代入形式・複数宣言・入口名の書換え等は未解決。一般的な関数間解析は行わない。
- 第4引数のIdentifierをプラットフォームの読込フラグとして扱う。名前を変更した引数も位置で区別し、同名の別変数を誤認しない。第4引数の欠落・複雑なpattern・書換えは未解決。
- 同一関数内の単純な初期化aliasは既存の受信側由来追跡を使う。別名への明示書込があれば、入れ子関数からの書込も含めガードの証拠に使わない。引数／戻り値経由の伝播は扱わない。

## 3. 照会サイトとガードのsubset

照会サイトは、[CL-002の既存subset](BEST_PRACTICE_CLIENT_LOOKUPS.md)（確定したg_form.getReference／Client GlideRecord get・query）と、確定したGlideAjaxのgetXML／getXMLAnswer（callback 1引数）、getXMLWait（0引数）。GlideAjax constructorは1引数の限定形。動的値・callbackの実型やUI別API有効性は保証しない。

constructor／addParam／addQuery／next／getValueだけを照会実行と数えず、コメント・文字列・独自オブジェクトの同名APIを区別する。未知の受信側・動的method・spread・抽出method呼出しは未解決。eval／with・method書換え・受信側の外部callへのescape等は候補確定を保留する。

ガード解析は、読込時／通常変更時の2つの可能性を有限maskとして伝播する。JavaScriptは実行せず、式の値・通信結果・業務上の正しさは証明しない。

| 構文・文脈 | 扱い |
|---|---|
| `if (isLoading) return;`の後 | 対応する第4引数の束縛を確認できれば、後続サイトの読込時を構文上除外 |
| `if (!isLoading) lookup()`、`!isLoading && lookup()`、`isLoading || lookup()` | 照会サイトごとに除外を評価 |
| boolean literal、`!`、`===`／`!==`、`&&`／`||`、if／条件式 | 限定的に条件を解析。不明値は両方の可能性を保持 |
| `if (isLoading || otherCondition) return;` | 読込時のreturnは認識可能。他条件の必要性は未確認 |
| `if (isLoading && otherCondition) return;` | 読込時でも継続する可能性を残す |
| 照会の後だけにガード／空のisLoadingブロック／ログだけ | 先行照会や後続サイトを除外した扱いにしない |
| isTemplate、newValue、oldValueの条件だけ | isLoadingと同義にしない。業務意図と追加条件の適否は人が確認 |
| 同じスクリプトの別の照会 | 1箇所のガードをスクリプト全体へ適用しない |
| loop／try／switch／await／optional chain等 | 読込時が残る箇所のガードは未解決。既に読込時を除外した直線prefixは保持するが、一般的な到達性を証明しない |
| helper／callback／入れ子関数内の照会 | 入り口からの実行条件を関数間で推測せず未解決 |

照会の無いコードへreturn不足の指摘は作らない。直接return後等の、このsubsetで到達しないサイトも候補にしない。ただし候補0件を全実行経路の安全性と解釈しない。

## 4. 出力・未解決・予算

読込時を除外できないサイトをperformance／info／low／candidateとし、rule_intrinsicの`onchange_loading_intent_review`を付ける。確認内容は読込時の照会の必要性・isLoading等のガード・処理順・業務意図。読込時に必要な処理を一律違反とせず、return追加・照会削除・処理移動を自動実施しない。追補profileはbp-followups-cl008-0.1。例外の識別や人の承認を意味しない。

共通制限はonchange_client_script_only／onchange_loading_intent_not_verified／onchange_guard_subset／onchange_ui_compatibility_not_verified。payloadイベント証拠はonchange_event_payload_onchange。サイトの分類はonchange_lookup_glide_ajax／onchange_lookup_client_record_or_reference。状態はonchange_lookup_loading_possible／onchange_lookup_loading_excluded／onchange_loading_flow_unresolvedとして資産単位で残す。除外箇所そのもののfindingは作らない。

未解決がある場合はanalysis_complete=false。イベント証拠・必須確認項目・制限の欠落、未解決なのに完了を主張する改変結果はstrict契約で拒否する。正常に判定した有限窓の完了も、UI互換性・実行済み・業務意図の確認済みを意味しない。field名・table名・引数値・コード本文は返さない。

ガード解析・照会集合の所有範囲確認・条件mask計算も既存100,000 visit／深さ256へ課金する。別の無制限走査は追加せず、100候補・100取得行・受信量・出力上限・全体60秒・worker中断・認証／release gateを維持する。

## 5. MCP互換性と検証

AU-CL-008は明示指定。選択可能な規則は最大10に拡張するが、既定3規則は不変。CL-008を要求した場合だけruleset bp3-0.11。旧要求・混在するBR等の各資産はその従来版を保持する。selection省略／bounded_allは0.2、review_targetsは0.3。既存のClient Script prefixを再利用し、event名を自由queryとして受け付けない。固定評価セット・過去成績は変更しない。

```json
{"update_set_sys_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","requested_rule_ids":["AU-CL-008"],"selection_mode":"review_targets","max_records":20}
```

[合成検証記録](E2E_BEST_PRACTICE_ONCHANGE_LOADING_SYNTHETIC_2026-10-25.md)を参照。VM／監視・telemetry保留、Unknown・全体受付無効、本番cap／完成parts／permit非発行を維持。実機操作・設定変更・Pushは行わない。
