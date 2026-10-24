# AU-CL-002：Client Scriptのサーバー照会確認候補

Version: cl-lookups-0.1 / Date: 2026-10-25
Status: 限定的な候補検出・合成検証。人による規則採用承認・実PDI検証・独立品質評価は未実施。

## 1. 公式根拠と判断の境界

[Australia台帳](BEST_PRACTICE_REGISTER_AUSTRALIA.md)のAU-CL-002、AU-SRC-002 / [Client-side scripting design and processing](https://www.servicenow.com/docs/r/australia/api-reference/scripts/client-script-best-practices.html) / **Minimize server lookups**（Note）を根拠とする。2026-10-25に本文・Australia表示・更新日2026-10-08を再読した。公式は、クライアント上の既存データの活用と、必要な情報に応じたscratchpad／非同期GlideAjaxの利用を説明し、GlideRecord／getReferenceによる照会の性能上の注意を記載している。

API名があるだけでは、不要な通信・実際の性能劣化・業務上の不適切さは証明できない。本実装は確認候補であり、照会を禁止・削除・自動置換しない。callbackあり／なしやisLoadingガード、承認を主張するコメントで、自動免除も違反確定もしない。

補足調査では公式[GlideForm API](https://www.servicenow.com/docs/r/api-reference/c_GlideFormAPI.html)と[Client GlideRecord API](https://www.servicenow.com/docs/r/api-reference/c_GlideRecordClientSideAPI.html)の検索索引にAustralia表示と関連メソッドがあったが、リリース未指定URLの本文取得はBrazilへ切り替わった。Australia指定API URLは取得できず、これらをAustraliaの引数・UI別仕様の完全照合済みとはしない。下記は本プロジェクトの保守的な構文subsetであり、有効なAPI全体の定義ではない。既存台帳のverified_onやcatalog版・人の承認状態は変更しない。

## 2. 対象と検出subset

対象はUpdate Set payload版の`sys_script_client.script`。BR、Script Include、Catalog Client Script、Portal widget、Workspace等の別資産へ一般化しない。UI種別・実効ACL・実レコード・通信内容は追加取得しない。

| 受信側／構文 | 扱い |
|---|---|
| 確定したg_form由来のgetReference | 1引数、またはfield＋callbackの2引数を候補化 |
| 同一関数内のnew GlideRecord由来のget | 1引数のレコード取得を候補化 |
| 同じ受信側のquery | 0引数、またはcallbackの1引数を候補化 |
| new GlideRecord、addQuery、addEncodedQuery、next、getValueのみ | 上記の照会実行呼出しとは分け、この規則の候補にしない。各APIのUI別有効性を保証する意味ではない |
| g_formのgetValue／setValue、GlideAjaxのgetXML | このsubsetの照会候補に含めない。安全性・最適性は証明しない |
| 同関数の単純alias、既存解析が追えるobject／array、限定constメソッド名 | 受信側を確定できる場合だけ候補 |
| 独自オブジェクト・独自クラスの同名API | プラットフォームの照会と誤認しない |
| 引数shadow・不明受信側・条件付き由来・関数をまたぐalias | 候補を確定せずclient_lookup_unresolved |
| 動的メソッド名、spread、引数数不一致、明らかに不適切なliteral引数、対象メソッドの取り出し呼出し | 未解決。queryの3引数等、subset外の正当な可能性を不正APIと断定しない |
| GlideRecordSecureや別constructor | GlideRecordと同一視しない。不明由来のquery/getなら未解決 |
| eval／with、対象名の書換え・delete、動的property書込み、受信側の外部callへの受渡し | 保守的にその資産の照会候補を保留し、未解決にする。独自オブジェクトの同名書換えでも保留する場合がある |

constructorは1引数。field／table／sys_idは明らかな空文字・非文字列literalを除外するが、動的式の型やcallbackの実体は検証しない。関数戻り値・引数伝播・prototypeの全変更・通信回数・実到達は解析しない。候補0件を安全／不要な照会なしと解釈しない。

## 3. 確認項目と出力

全候補をperformance／info／low／candidateとし、rule_intrinsicの`client_lookup_necessity_review`を付与する。追補profileは`bp-followups-cl002-0.1`。意味は照会頻度・必要列・既存データの可用性・業務上の必要性・UI制約・代替手段の適否の確認。文脈による例外識別成績ではない。

必須limitationsはclient_lookup_client_script_only／client_lookup_necessity_not_verified／client_lookup_ui_compatibility_not_verified／client_lookup_api_subset。呼出し分類はclient_lookup_get_reference／client_lookup_record_get／client_lookup_record_query。分類は資産単位、候補は箇所単位。field・table名・値・本文を結果へ返さない。

client_lookup_unresolvedがあれば、集約のanalysis_completeはfalse。strict検証でも確認項目・必須制限・呼出し分類の欠落や、未解決なのに完了を主張する改変結果を拒否する。確定できたsubsetの解析窓が完了しても、必要性・実効性の確認済みを意味しない。

## 4. 予算・互換性

既存AST走査・受信側解析へopt-in callbackを接続し、100,000 visit／深さ256を共有。escapeの確認・後段候補確定も課金する。別の無制限走査やコード実行は追加しない。資産100候補・取得100行・受信量・出力上限・全体60秒・worker中断・認証／リリースgateは不変。

MCPのrequested_rule_idsにAU-CL-002を明示指定する。選択可能な規則は最大9へ拡張するが、既定3規則は不変。CL-002要求時のみruleset bp3-0.10、過去要求のrulesetと固定評価セットは維持。混在集約のBRはその適用規則の旧rulesetを保持する。selection省略／bounded_allは0.2、review_targetsは0.3を維持し、既存Client Script候補prefixを再利用する。

```json
{"update_set_sys_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","requested_rule_ids":["AU-CL-002"],"selection_mode":"review_targets","max_records":20}
```

[合成検証記録](E2E_BEST_PRACTICE_CLIENT_LOOKUPS_SYNTHETIC_2026-10-25.md)を参照。VM／監視・telemetryは保留。Unknown・全体受付無効・本番cap／完成parts／permit非発行を維持し、実機操作・設定変更・Pushは行わない。
