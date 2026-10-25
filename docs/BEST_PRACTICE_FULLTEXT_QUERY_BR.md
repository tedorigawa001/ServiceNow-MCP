# AU-QRY-002：BR限定の全文検索前提確認候補

Version: qry002-fulltext-0.1 / Date: 2026-10-25。

## 1. 根拠と確認状態

台帳AU-SRC-005の[Querying tables in script](https://www.servicenow.com/docs/r/australia/api-reference/scripts/c_UsingGlideRecordToQueryTables.html)、Return records from a table that include a string（Note）を根拠とする。今回このURLの本文は取得できず、台帳の過去の確認状態/verified_onは変更しない。

補足として[Australia公式 GlideRecord - Scoped](https://www.servicenow.com/docs/r/australia/api-reference/server-api-reference/c_GlideRecordScopedAPI.html)の **addQuery(String name, Object value)** のname説明をAIが2026-10-25に読み取った。予約名`123TEXTQUERY321`と対象テーブルの索引・検索設定の前提を確認した。同ページの **addEncodedQuery(String query, Boolean enforceFieldACL)** のAPI形式も照合した。これで台帳原文の再取得・人による採用承認が完了したとは扱わない。

以下は本プロジェクトの限定検出方針。索引欠如・検索失敗・違反を判定する機能ではない。

## 2. 対象と受信側

BR (`sys_script`) の保存payload本文のみ。ローカルで未shadowのGlideRecord/GlideRecordSecureをnewした受信側と、同関数の限定別名/局所コンテナを追跡する。constructorは1明示引数とし、不正なリテラル・spreadを拒否。動的テーブル名でも索引対象は特定できたことにしない。

独自クラス/同名メソッドは候補化しない。currentや引数で渡されたrecord、関数間別名等の受信側を推測しない。再代入、メソッド書換え、record/メソッドのescape、eval/with等は未解決。既存QRY-001の解析を共用しつつ、QRY-002要求時だけaddEncodedQuery/メソッド抽出等の追加制約を有効にする。

台帳上の他server資産はoffline解析でunsupported、Client Scriptはrule_asset_mismatch。MCP取得対象はBRのまま、Script Include/REST等へ拡張しない。

## 3. APIごとの限定subset

| 形 | 扱い |
|---|---|
| 2引数addQuery、第1引数が限定定数評価で予約名と完全一致 | 全文検索設定の確認候補。検索値は動的でも実行しない |
| 2/3引数addQuery、判明した通常field名 | QRY-002候補にしない。通常のLIKE/CONTAINS等を全文検索と混同しない |
| 予約名の3引数addQuery | 今回は未対応。使用不可とは断定せず未解決 |
| 1引数addEncodedQuery、固定文字列の条件境界で予約名=非空値 | encoded query由来の確認候補 |
| field/encoded文字列が動的、その他のarity/optional/spread | 未解決。3引数版や第2引数付きencoded APIを不正と認定しない |

固定文字列は既存の限定定数評価（文字列リテラル・結合・同関数の書込なしconst等、最大1,024文字）で取得する。var/letの値推論、関数の戻り値や一般の定数実行はしない。

encoded queryは実行も一般文法解析もしない。`^`で区切った条件境界、2条件目以降のOR/NQ接頭辞、末尾EQだけを限定して認識する。空条件・空の接頭辞、`^^`・backslash・改行/NUL・javascript:、空の全文検索値や予約名への未対応operatorは未解決。URI decode、escape解決、動的評価は行わない。値の中の予約名、別field名、ORDERBY、TEXTINDEXGROUPは候補化しない。

他の条件の妥当性やテーブル存在、query()への到達性/実行、実際の検索方式は証明しない。一般構文を検証したことにしないため、encoded-query構文未確認の制限を常に保持する。未知名の書換え等により無関係な処理でも未解決となる保守的な誤拒否があり得る。

## 4. 結果・予算

全候補はcorrectness/info/low/candidate。`fulltext_index_configuration_review`と、`fulltext_add_query_review`または`fulltext_encoded_query_review`をちょうど1つ付ける。profileはbp-followups-qry002-0.1。対応するAPI制限、BR/subset限定、索引設定・encoded構文の未確認をstrict契約で要求する。未解決ならanalysis_complete=false。限定subsetの解析完了は索引・適合性・安全性の確認完了ではない。

明示opt-in、最大14規則、QRY-002要求時のみbp3-0.15。既定3規則、他の要求のruleset、0.2/0.3外枠、固定評価セットは維持。QRY-001の3引数LIKE候補は別規則で、encoded LIKEを禁止しない。

既存の取得100件+lookahead、受信量/payload、候補100件、AST 100,000 visits/depth256、全体60秒・worker中断・認証固定・リリースゲートを維持。条件走査も同じAST予算を使用する。コード・クエリ本文・検索値・テーブル名・資格情報は出力せず、索引設定への追加照会や書込みは行わない。

[合成検証記録](E2E_BEST_PRACTICE_FULLTEXT_QUERY_BR_SYNTHETIC_2026-10-25.md)を参照。実PDI・人手承認・独立品質評価は未実施。Unknown・全体受付無効、VM/監視/telemetryの保留を維持する。
