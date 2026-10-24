# AU-QRY-001：BR限定の3引数addQuery候補検出

Version: query-like-br-0.1 / Date: 2026-10-24 / Status: 実装・合成検証。実機・人による規則承認は未実施。

## 1. 適用範囲と根拠

[Australia台帳](BEST_PRACTICE_REGISTER_AUSTRALIA.md)のAU-QRY-001を、Update Set payloadのBusiness Rule（sys_script）だけに追加した。根拠はAU-SRC-005の[Querying tables in script](https://www.servicenow.com/docs/r/australia/api-reference/scripts/c_UsingGlideRecordToQueryTables.html)のAvailable JavaScript operators（CONTAINS行）。公式本文の採用承認は引き続き未実施で、実機で演算子の動作を確認したという意味ではない。

候補は、ローカルでplatformのGlideRecord/GlideRecordSecureをnewした受信側の、ちょうど3引数のaddQueryで、第2引数が文字列リテラル`'LIKE'`の場合。候補の推奨はCONTAINSの検討であり、自動置換/実行はしない。encoded queryのLIKEはこの規則で禁止しない。台帳にあるScript Include/REST/server scriptへの一般化は今回行わない。

## 2. MCP利用と互換性

既存ツール`review_update_set_best_practices`で明示指定する。

```json
{
  "update_set_sys_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "requested_rule_ids": ["AU-QRY-001"],
  "selection_mode": "review_targets",
  "max_records": 20
}
```

- 既定の規則はAU-BR-001/002、AU-CL-004の3件のまま。明示指定の列挙へQRY-001を追加し、最大4件を許可する。
- review_targetsではQRY-001をBR候補に対応付ける。Script Includeを追加取得せず、固定filterの版/式と範囲制限を維持する。省略/bounded_allは従来の全種別bounded窓の0.2、review_targetsは0.3のまま。
- QRY-001を要求した集約のrulesetはbp3-0.5。入れ子のBRもQRY-001要求時は0.5。混在するClient Script等でQRY-001が適用されず旧規則だけを要求する入れ子は0.4を維持し、要求規則との整合を検証する。
- QRY-001なしの現行0.4および歴史的legacy/scoped/contextual profileを変更しない。固定評価セット・期待値・採点器は変更しない。
- JSON Schemaは追加rule ID/配列上限/許容rulesetを拡張し生成物も同期する。既存の旧出力は有効のまま。旧schemaを固定するconsumerが新規則の結果を検証する場合は更新が必要で、今回schemaの破壊的な必須field追加はしない。

100件・受信量・payload・100指摘/256KiB・全体60秒の上限、認証固定、リリースgate、worker中断、本文非露出を維持する。追加network要求、現行レコードへのfallback、UI/スクリプト実行は追加しない。

## 3. 受信側と構文の扱い

字句スコープと既存の限定的な由来追跡を利用するが、QRY判定は明示指定したcurrent profileのBRにだけ有効化する。

| 入力 | 扱い |
|---|---|
| ローカルnew GlideRecord/GlideRecordSecureと単純な同一関数内alias | 受信側の由来が単独で確定する場合に候補化 |
| ローカルの同名constructor/独自objectのaddQuery | platform由来と扱わず候補化しない |
| 引数・関数戻り値・関数境界のalias・current/previous | 今回はGlideRecord受信側と確定しない。3引数LIKE形ならquery_like_unresolved |
| 条件分岐でplatform/不明の由来が混在 | 確定受信側としない。query_like_unresolved |
| addQueryの2引数/1引数/4引数 | この規則の3引数形ではないので候補化しない |
| addEncodedQuery、コメント、文字列、正規表現内のLIKE | 候補化しない |
| 第2引数がCONTAINS等の別リテラル | LIKE規則の候補にしない |
| 動的演算子・constによる演算子・spreadで実引数数が不明 | operator/arity未解決。query_like_unresolved。演算子の定数評価は今回追加しない |
| computed method名 | 既存の限定定数評価でaddQueryと確定したものだけ判定。不明なrecord methodは制限を返す |

constructor/受信側の再代入、addQueryやcomputed propertyの書換え、eval/with、spread/tagged template、property定義/assign等、recordをcall引数として外へ渡す形は保守的に扱う。候補を遅延して、スクリプト内でこうした干渉/escapeを認めた場合は該当する確定候補を出さず未解決制限にする。aliasをobject内に格納して引き渡す形も対象。名前単位/スクリプト全体の保守的判定があり、無関係な操作でも誤って未解決にする可能性を残す。

経路解析・一般的な関数間解析・動的prototype全般・全てのescape/自己変更を証明するエンジンではない。未解決のcall/applyや完全な動的dispatch等の網羅性は保証しない。コードが実際に実行されること、受信側の実行時型、フィールド型、queryの業務的妥当性を確認済みにしない。

## 4. 結果と失敗時

- 公式根拠URL/節、行位置、rule ID、共通required_follow_upを返す。candidate/low/info、code_return_mode=noneを維持する。
- query_like_br_only / query_like_literal_operator_onlyを制限として明示する。query_like_unresolvedがある1件結果はpartial、MCP集約はanalysis_complete=false。評価した限定範囲と未解決を両方残し、指摘0件を安全としない。
- QRY-001を要求していない旧解析はこの新しい受信側追跡/制限の影響を受けない。BR以外の同規則はofflineでunsupportedまたはasset mismatch、MCPでは未対応資産として扱い、QRYを他資産へ実行しない。
- 不正JS/XML、解析work/depth、finding上限の失敗は既存の固定理由で拒否する。未加工の例外やコードを返さない。

## 5. 検証と未確認

[今回の合成検証記録](E2E_BEST_PRACTICE_QUERY_LIKE_BR_SYNTHETIC_2026-10-24.md)を参照。合成HTTP/実worker経由の0.3集約、旧/新規則混在、未解決時の不完全判定、受信側/引数/encoded queryの回帰を確認する。実PDI E2E、公式資料の人による採用承認、独立した検出品質評価は今回未実施。

VM・監視環境の調査は保留し、この機能の追加から再開しない。MA-02のUnknown、全体受付無効、telemetry保留、完成parts/permit非発行も変更しない。実機操作・設定変更・Pushは行わない。
