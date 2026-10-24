# AU-CL-003：onLoadの取得入力・scratchpad適否確認候補

Version: cl-onload-timing-0.1 / Date: 2026-10-25
Status: 限定的な候補検出・合成検証。人の規則採用承認・実PDI確認・独立品質評価は未実施。

## 1. 根拠と判断の境界

[Australia台帳](BEST_PRACTICE_REGISTER_AUSTRALIA.md)のAU-CL-003、AU-SRC-002 / [Client-side scripting design and processing](https://www.servicenow.com/docs/r/australia/api-reference/scripts/client-script-best-practices.html) / **Minimize server lookups → Retrieve server data using g_scratchpad**を根拠とする。2026-10-25にAustralia本文・更新日2026-10-08を再読した。

公式は、フォーム要求時に必要情報を用意できる場合のscratchpadと、動的に必要になる場合の非同期取得を区別する。本実装は本文を実行せず、サーバー側のデータ可用性・鮮度・権限を追加照会しない。したがって**入力が定数でも、結果データが読込前に決まるとは証明できない**。また、フォーム値への依存も移行不可の証明ではない。両者を人が区別して確認できる候補を返し、一律のscratchpad移行推奨・データ追加・照会削除はしない。

規則と公式の意味は既存台帳を正本とし、今回の再読でverified_on・人の採用承認・原文hashを上書きしない。以下の分類は公式の検出アルゴリズムではなく、本プロジェクトの限定的な入力証拠分類。

## 2. 適用対象・入力分類

Update Set payload本体の`sys_script_client.script`と`type=onLoad`に限定する。関数名や一覧の表示用typeではイベントを推測せず、欠落・他イベントはmissing_contextでskipする。入口は単一のトップレベル`function onLoad()`、入口名の書換えなし・引数なし。代入形式・helper／callback内部・一般的な関数間伝播は未解決とする。

照会APIは既存の限定getReference／Client GlideRecord get・query、およびGlideAjax getXML／getXMLAnswer／getXMLWait。受信側・引数の構文subsetは[CL-002](BEST_PRACTICE_CLIENT_LOOKUPS.md)・[CL-008](BEST_PRACTICE_ONCHANGE_LOADING.md)を継承する。別UI・Catalog Client Script・UI Script・REST等へ適用を拡張しない。

| 内部分類 | 受け入れる証拠 | 確認候補の意味 |
|---|---|---|
| static | 同一関数内の限定文字列／真偽値定数、書込なしconst、固定constructor・モデル化した照会設定 | 必要情報を読込前に安全に用意できるか、鮮度と業務要件を確認。結果不変・移行可とはしない |
| runtime | フォーム参照、確定したg_form.getValue／getDisplayValue由来の値への依存 | 実行時入力と鮮度の要件を確認し、動的取得を維持する適否を検討。必須・移行不可とはしない |
| unknown | 値や設定経路が不明、条件付き処理、subset外API、解析できない式 | 移行判断の前提証拠が不足。定数／動的と決めつけない |

分類は候補ごとに持つ。`g_form.getReference`はfield名がliteralでも参照先のフォーム値に依存するためruntime。定数sys_idの`GlideRecord.get`はtable等も定数ならstatic。`GlideRecord.query`ではconstructor・直前までの限定addQuery、GlideAjaxではconstructor・addParamとsysparm_name設定の存在を合わせて確認する。sysparm_nameの存在はメソッドの有効性や実行成功の証明ではない。

unknownはruntimeより優先する。一部のフォーム依存が分かっても、別の入力・設定が不明なら全体の分類はunknownとして保持する。

同一関数内の受信側aliasは同じ内部状態を共有する。未知条件下の設定・spread・設定の不明入力があればstaticへ戻さない。照会後の再利用や、addEncodedQuery／setLimit等の未モデル化操作はunknownへ倒す。書込のある受信側／実行時入力aliasは確定しない。入れ子関数からの書込も既存の束縛情報で検査する。

var／letの値を一般的な定数として伝播せず、`var id='fixed'`も現在の限定定数評価ではunknownになる。フォーム値との文字列結合・関数戻り値・数値演算等も一般化しない。constの定数計算は既存subsetだけを使う。

eval／with・member書込み・API書換え・受信側のescape等がある場合、資産の証拠を保守的に未解決とする。未実行helper内の変更でも保留する場合がある。コードの実到達・結果の内容・サーバー実装・全動的変更を証明しない。

## 3. 確認項目とJSON契約

全候補をperformance／info／low／candidateとし、rule_intrinsicの`onload_data_timing_review`を付ける。意味は可用性・鮮度・業務上の必要性・クライアントへの公開範囲の確認。scratchpadへ機密列や不要なデータを追加する許可ではない。

さらに、候補ごとに次のcontext_specificを**ちょうど1件**付ける。

- static：`onload_static_inputs_review`
- runtime：`onload_runtime_inputs_review`
- unknown：`onload_unknown_inputs_review`

これにより同一資産に複数分類があっても、AIが候補ごとに扱いを区別できる。追補profileは`bp-followups-cl003-0.1`。分類はデータの実際の生成時刻や例外承認を意味しない。

必須制限はonload_client_script_only／onload_data_availability_not_verified／onload_data_exposure_not_verified／onload_input_analysis_subset、イベント証拠はonload_event_payload_onload。API分類はonload_lookup_glide_ajax／onload_lookup_client_record_or_reference、入力分類はonload_input_static／runtime／unknown。分類不能または未解決の経路があればanalysis_complete=false。

strict検証ではイベント証拠・公開範囲未確認・必須確認項目の欠落、複数の入力分類code、対応する制限の欠落、未解決なのに解析完了を主張する結果を拒否する。JSON検証だけで分類の真偽を証明するものではない。field／table／sys_id／メソッド値・コード本文は返さない。

## 4. 予算・互換性・残課題

既存scope解析へopt-inで接続し、constructor・設定値・候補確定・所有scope確認も同じ100,000 visit／深さ256へ課金する。別の無制限走査・コード実行・実機照会を追加しない。100候補・100取得行・受信量・出力上限・全体60秒・worker中断・認証／release gateは不変。

MCPの明示選択は最大11規則、既定3規則は維持。CL-003要求時だけruleset bp3-0.12。既存要求・各資産の旧ruleset、0.2／0.3封筒、固定評価セットを維持する。

```json
{"update_set_sys_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","requested_rule_ids":["AU-CL-003"],"selection_mode":"review_targets","max_records":20}
```

[合成検証記録](E2E_BEST_PRACTICE_ONLOAD_SCRATCHPAD_SYNTHETIC_2026-10-25.md)を参照。実フィールド／実効ACL、サーバー側Display BR、scratchpadの既存内容、必要列・鮮度・UI互換性の検証は残る。VM／監視・telemetry保留、Unknown・全体受付無効、本番cap／完成parts／permit非発行を維持し、実機操作・設定変更・Pushは行わない。
