# BP-5：opt-in候補選択の公式仕様照合と次版JSON契約案

Version: bp5-target-contract-draft-0.1 / Date: 2026-10-18。
Status: **案A・opt-in方式は採用方針。以下の契約は設計案、コード未実装、実機未検証**。
[対象選択設計](BEST_PRACTICE_BP5_TARGET_SELECTION_DESIGN.md)の具体化であり、実装完了記録ではない。
公式資料の閲覧とローカルMDの更新だけを実施。規則カード・人手品質の承認状態は変更しない。

## 1. 公式資料と確認範囲

確認日：2026-10-18。すべてServiceNow公式、本文にAustralia / Updated March 12, 2026と表示。
本文をAIが読んだ記録であり、人による再照合・PDIでの動作確認ではない。

| ID / 根拠URL | 該当箇所 | 今回確認した仕様 |
|---|---|---|
| SEL-SRC-001：[Table API](https://www.servicenow.com/docs/r/australia/api-reference/rest-apis/c_TableAPI.html) | Table - GET /now/table/{tableName} → Supported request parameters → Table 8、sysparm_query / limit / fields / no_count | 等値・STARTSWITH・AND・ORDERBY、返却列指定・件数制限・count抑止。limitはACL評価前。不正な条件は既定で無視され得る |
| SEL-SRC-002：[Operators available for filters and queries](https://www.servicenow.com/docs/access?context=r_OpAvailableFiltersQueries&ft%3Alocale=en-US&pubname=australia-platform-user-interface&version=australia) | Operators available for condition builders：Table 1、Operators available for string fields：Table 2 | `^`はAND、`^OR`はOR。`NOT LIKE`は文字列の「含まない」であり、正規表現の否定や前方不一致ではない |
| SEL-SRC-003：[Encoded query strings](https://www.servicenow.com/docs/access?context=c_EncodedQueryStrings&ft%3Alocale=en-US&pubname=australia-platform-user-interface&version=australia) | 本文の構築方法、Table 1：Referring to Boolean or string values | 表名・列・演算子を知って手動構築可能。ただしUIから生成・コピーする方法が推奨される |

SEL-SRC-002/003はTable API本文内のリンクから辿ってAustralia表示を確認した。
閲覧時の短縮先はそれぞれ`/docs/r/platform-user-interface/r_OpAvailableFiltersQueries.html`、
`/docs/r/platform-user-interface/c_EncodedQueryStrings.html`。再確認時は短縮URLの既定リリースに頼らず、
上記のrelease付きURLと本文のリリースを確認する。

**仕様からの設計判断**：固定条件による粗い候補抽出は構成可能。ただし、上記資料だけでは
Table APIでの名前の長さ・16進文字制約を含む正規表現検索を裏付けられないため採用しない。
「正規表現検索は不可能」とまでは断定しない。以下の固定条件は本プロジェクトの提案で、公式推奨クエリではない。

## 2. 固定フィルター：target-prefix-0.1

対象Table APIは`sys_update_xml`だけ。`S`は検証済みの32桁小文字16進Update Set ID。
下記はURL符号化前の`sysparm_query`。実装時はURLパラメーターとして一度だけ符号化する。

| 要求規則から導く種別 | 固定クエリ |
|---|---|
| BRのみ | `update_set=S^action=INSERT_OR_UPDATE^nameSTARTSWITHsys_script_^nameNOT LIKEsys_script_client_^nameNOT LIKEsys_script_include_^ORDERBYsys_id` |
| Client Scriptのみ | `update_set=S^action=INSERT_OR_UPDATE^nameSTARTSWITHsys_script_client_^ORDERBYsys_id` |
| BR＋Client Script | `update_set=S^action=INSERT_OR_UPDATE^nameSTARTSWITHsys_script_^nameNOT LIKEsys_script_include_^ORDERBYsys_id` |

Client Scriptの接頭辞は`sys_script_`の部分集合なので、両種別でもORや複数照会を使わない。
BRのみではClient Scriptを候補から除き、両種別では除かない。初期の既知対象外除外はScript Includeだけ。
`NOT LIKE`には`%`・`*`等を足さず、「含まない」という文書化された意味だけを使う。
正規のBR名の末尾は16進32桁なので、この固定除外文字列はその正規名には含まれない。
この最後の説明は名前形式に基づく設計上の推論であり、公式の命名保証の追加発見ではない。

要求規則・名前形式・action値の根拠は既存実装と[PDI記録](E2E_BEST_PRACTICE_REVIEW_2026-10-18.md)。
今回の公式資料は、`sys_update_xml.action`の選択肢や全資産の命名体系を証明するものではない。
未知の対象外接頭辞、壊れた対象名は混入し得る。混入も枠を消費し、補充しない。
対象外除外の追加・比較規則の変更はfilter_versionを上げる。

### 2.1. その他の固定パラメーター

- `sysparm_limit=N+1`、`sysparm_offset=0`。ページ追加・Link追従なし。
- fieldsは現行の`sys_id,update_set,name,type,action,sys_updated_on,sys_mod_count`だけ。
- `sysparm_display_value=false`、`sysparm_exclude_reference_link=true`。
- 新モードでは`sysparm_no_count=true`とし、X-Total-Countを契約や網羅性判定に使わない。
- 初回と最終照合の条件・パラメーターは同一。parentとrelease照会は従来の経路を維持。
- query、除外語、type表示値、リリース、fields等をMCP利用者から受け取らない。
  `javascript:`、`MATCH_RGX`、動的OR/NQ、domain迂回は使わない。

### 2.2. フィルターは認可境界ではない

SEL-SRC-001の不正条件無視の仕様に依存して処理を続けない。返却された**全N+1行**について
親ID、action、固定の包含/除外条件、必須列、ID重複、順序をローカルでも検証する。
1行でも条件違反なら一覧全体を採用しない。lookaheadも例外にしない。
列が欠けた場合は既存の必須列エラー扱い。本文取得は有効な一覧の先頭N行だけに限定し、
本文側でも所属・版・厳密な名前・XML識別を検証する。type表示値で代替しない。

初回の条件違反は`errors[{stage:"metadata",code:"candidate_filter_violation"}]`、
collection.status=failed、status=failed、assets=[]、全counts=0、consistency=unverified。
最終照合の条件違反は同コード・stage=consistency、収集済み結果をpartialで保持し、
consistency=unverified、analysis_complete=falseとする。条件を満たす一覧同士の差分は従来どおりchanged。
原クエリ・原応答・名前・コード本文をエラーへ展開しない。

返却行が全て条件を満たしても、サーバーが各条件を実行した証明にはならない。空応答や
脱落・漏れはローカル検証だけで識別できないため、完全性は保証しない。
インスタンス共通の`glide.invalid_query.returns_no_rows`を変更・必須化しない。

### 2.3. ACL適用順によるlookaheadの限界

limitがACL評価前なので、返却数がN以下でも「可視候補を全て取得した」とは証明できない。
0件でも後方に可視候補があり得る。追加ページや並べ替え再試行で補完せず、固定予算を守る。
従ってtruncated=falseは**追加行を観測しなかった**だけで、全件取得済みの意味ではない。
親・同じ候補窓の再照合成功も、この限界を取り除かない。

## 3. MCP入力と版の分岐

追加予定の入力は`selection_mode`だけ。型は文字列列挙`bounded_all | review_targets`、省略可。
省略またはbounded_allは現行入力を内部へ渡し、従来の選択・`bp-mcp-review-0.2`結果を保持する。
review_targetsだけ本書のフィルターと`bp-mcp-review-0.3`を使う。自動フォールバックはしない。
誤綴り・null・未知値・余計なキーはJSON Schemaとランタイムの双方で拒否する。
max_recordsとrequested_rule_ids等の既存制約は不変。省略時の結果まで0.3へ変えない。

**ツール説明・利用例での案内**：opt-inのままでは、AIクライアントが既定値で呼び、
対象外・削除が選択枠を先に消費する問題が残りやすい。そのため実装時に、ツール説明と
[利用例](BEST_PRACTICE_BP5_MCP_REGISTRATION.md)へ「BR/Client Scriptの規則を評価する場合は
`selection_mode: "review_targets"`を指定する」と明記する。省略時の既定値（bounded_all）は変えず、
既定値の切替は従来どおり別途承認・リリース通知の対象とする。案内文は網羅性・安全性を示唆しない。

0.3のJSON Schema予定ID：`urn:servicenow-mcp:best-practice-mcp-review-result:0.3`。
MCP応答側はschema_versionで判別する0.2/0.3のunionを明記する。固定評価セット・既存0.2検証器を改変しない。
外側の固定エラー（入力拒否・worker起動不能・hard deadline等）は既存の経路を維持する。
0.3は集約結果の版であり、入れ子の1件結果`bp-review-0.2`やruleset版を便乗して変更しない。

## 4. 0.3の構造差分（実装前の契約定義）

全objectは追加キー拒否。下表以外は[現行集約スキーマ](../src/review/aggregate-schema.ts)と
同じ型・上限・不変条件を継承する。全項目必須、nullを許す箇所だけ明示する。

| JSONパス | 型・列挙・固定値 |
|---|---|
| schema_version | `"bp-mcp-review-0.3"` |
| selection | 下記の厳格objectを新設 |
| selection.mode | `"review_targets"` |
| selection.filter_version | `"target-prefix-0.1"` |
| selection.requested_asset_types | business_rule / client_scriptの重複なし配列、1〜2件。BR→CLの正規順 |
| selection.action_scope | `"insert_or_update_only"` |
| selection.order | `"sys_id_asc"` |
| selection.excluded_counts | `{ "unsupported_assets": null, "deleted_assets": null, "other_actions": null }`固定。追加集計なし |
| collection.scope | 既存どおり`"caller_acl_visible"`。全可視行を列挙済みという意味ではない |
| collection.status | 既存not_started / complete / failed。completeは有限一覧の取得・検証完了だけ |
| collection.metadata_seen / selected | 0..101 / 0..100の整数。初回の採用済み一覧の返却行数 / 選択行数 |
| collection.truncated | boolean。採用済み一覧でmetadata_seen>Nのときだけtrue |
| coverage.analysis_scope | 新設、`"selected_candidate_window"`固定 |
| coverage.candidate_inventory_complete | 新設、false固定。ACL前limit、有限窓、粗い識別による未保証 |
| coverage.update_set_inventory_complete | 新設、false固定。全種別・全actionの調査ではない |
| coverage.analysis_complete | 既存boolean。選択行だけの機械的完了（§5）。指摘なし・安全・承認済みとは別 |
| errors[].code | 現行列挙にcandidate_filter_violationを追加。stageはmetadata / consistencyだけ |

actionの異なる行や対象外の除外件数は、0ではなく常に未収集のnull。nullはACL不可視件数を示す値でもない。
filter_versionは実装側の定数で、呼出し側による指定・上書き不可。
requested_asset_typesはrequested_rule_idsから導出し、余分な種別や順序違反を契約検証で拒否する。
リリース未照合でもselectionには**意図した**方針を記録できるが、取得したことは表さない。

### 4.1. 新モードの必須limitations

既存のsource_approval_pending、caller_acl_visible_only、リリース証拠由来の制限等に加え、
0.3では次の4トークンを常に要求する。自由記述へ曖昧に埋めず、検証器でも存在を確認する。

| トークン | 意味 |
|---|---|
| target_candidate_filter_only | 名前の厳密な識別・全対象発見を保証しない候補フィルター |
| non_candidate_counts_not_collected | 対象外・削除・他actionの総数を取得していない |
| acl_pre_limit_inventory_unknown | ACL前limitにより返却数から候補総数・網羅性を証明できない |
| whole_update_set_not_reviewed | 全資産・全規則をレビューしたものではない |

metadata_seen>Nなら既存metadata_truncatedも必須。JSONの4文字列と固定false値は
解析完了時にも削除しない。誤った「全件問題なし」というAI報告を抑止する。

## 5. 項目間検証・未処理・完了の意味

1. collection.complete時、metadata_seen<=N+1、selected=min(metadata_seen,N)、
   truncated=(metadata_seen>N)。selected=assets.length、ID一意、各stateのcounts一致を維持。
   metadata_seenは再試行・最終照合で累積しない。受信バイト・要求試行はそれらも加算する。
2. collection.not_started/failed時はmetadata_seen=selected=0、truncated=false、assets=[]、
   consistency=unverified。初回一覧の途中受信や拒否した行の件数を確定値として残さない。
3. releaseが非matchedなら現行の全規則release skip・一覧未取得・指摘0件の契約を継承する。
4. 正規の対象外混入はnot_applicable、壊れた対象名はrejected、どちらも選択枠を消費する。
   0.3でskipped_deletedは0固定。DELETEが一覧に返れば候補条件違反で、通常の削除スキップにしない。
5. 適用外種別の正規名が粗い条件を満たす場合はno_requested_rulesも許容する。
   `NOT LIKE`で除外したはずの名前等、固定条件自体に反するものとは区別する。
6. analysis_complete=trueには現行の全条件に加えselected>0を必須とする。
   0件はfalseとし、未取得の候補総数や安全性を主張しない。
   対象外のみで選択窓を処理し終えた場合は機械的完了を表せるが、reviewed=0と件数を併記する。
7. 候補切詰め、未処理、拒否、取得失敗、結果省略、照合未確認/変化、errorsがあればanalysis_complete=false。
   coverageの2つのinventory_complete=falseは、選択行の解析完了とは独立した概念である。
8. 50秒以降に未処理の**選択済みID**だけnot_processed/deadline_exceeded。
   窓外・除外済み・不可視のIDや件数を捏造しない。55秒照合打切り・全体60秒hard deadlineの扱いは不変。
9. 現在のPoCはstatus=completed不可。選択・解析が完了しても原則partial、初回収集失敗等はfailed。
   固定エラーしか返せないhard deadline/キャンセル/内部契約不正は集約結果の例外で、partialを保証しない。
10. 既存の入れ子由来・binding・証拠有効期限・実行時間・最大指摘数・UTF-8応答量検査は省略しない。

### 5.1. 意味を示すJSON抜粋（完全な応答例ではない）

```json
{
  "schema_version": "bp-mcp-review-0.3",
  "selection": {
    "mode": "review_targets",
    "filter_version": "target-prefix-0.1",
    "requested_asset_types": ["business_rule", "client_script"],
    "action_scope": "insert_or_update_only",
    "order": "sys_id_asc",
    "excluded_counts": {"unsupported_assets": null, "deleted_assets": null, "other_actions": null}
  },
  "collection": {"scope": "caller_acl_visible", "status": "complete", "metadata_seen": 0, "selected": 0, "truncated": false},
  "coverage": {
    "requested_rule_ids": ["AU-BR-001", "AU-BR-002", "AU-CL-004"],
    "skipped_rules": [],
    "analysis_scope": "selected_candidate_window",
    "candidate_inventory_complete": false,
    "update_set_inventory_complete": false,
    "analysis_complete": false
  }
}
```

この例から分かるのは「限定一覧で返却行を観測しなかった」ことだけ。必須limitations・証拠・
時刻・counts等を省略しているため、この抜粋自体をスキーマ検証用の成功fixtureに使わない。

## 6. 実現可能性の結論と残る確認

公式仕様上の構文は構成可能で、案Aのopt-in方式を具体化できる。
一方、今回の確認は実機での正しさ・性能・ACL・条件無視の有無を保証しない。
名前の正規表現をサーバーへ要求せず、未知接頭辞の混入とACL前limitを明示する方式とする。
100件・HTTP受信量・全体60秒・最終照合予約は変更しない。

次工程では本書をもとに合成テストと新旧契約検証を実装する。最低限、固定3クエリの文字列、
OR不使用、正規名を除外しないこと、0件/N/N+1、ACLによる短い応答、lookaheadの条件違反、
除外語混入、フィルター無視、初回/最終の失敗、50/55/60秒、返却量・再試行の共有予算を検証する。
固定評価セットは変更せず、MCP定義・dispatch・梱包の新旧経路を別に検証する。
合成テストでServiceNowの実際の演算子解釈やDB実行計画まで証明したことにはしない。
PDI読み取りE2Eは実装後に別途承認を得て行う。本書の作成では製品実装を行っていない。
実機の観測は次の§6.1のAI読み取り照会だけで、E2Eや契約実装の検証とは区別する。

### 6.1. AIによるPDI読み取り照会（参考、2026-10-18）

`dev441827`（Australia）の既存Update Set `9055f6338c9503100a22deb6dd2b4ead`（727件、in progress）へ、
既存のbounded取得経路（固定fields、`sysparm_limit=101`、`sysparm_no_count=true`）で§2の固定クエリを
そのまま送った。読み取りのみで、本文・名前・原応答は出力せず件数だけを記録した。
各行は親ID・action・§2の包含/除外条件をローカルでも検証した。

| 照会 | 返却行 | ローカル条件違反 | 厳密な対象名 | sys_id昇順 |
|---|---:|---:|---:|---|
| BRのみ | 10 | 0 | 10 | 〇 |
| Client Scriptのみ | 0 | 0 | 0 | 〇（同Update SetにClient Script更新なし） |
| BR＋Client Script | 10 | 0 | 10 | 〇 |
| 対照：列名を誤記（`nmeSTARTSWITHsys_script_`） | 101 | 100 | 1 | 〇 |

- 現行の全種別・sys_id昇順の窓では最初の対象が101行目（0始まりで100）で選択外だったが、
  固定候補条件では同じデータの10件すべてが先頭から返った。
- 対照では、誤記した条件が黙って無視され、HTTP成功のまま候補窓が更新行全体へ広がった
  （SEL-SRC-001の「不正な条件は既定で無視され得る」の実機での観測）。§2.2の全N+1行の
  ローカル検証と、違反時に一覧全体を不採用とする`candidate_filter_violation`は防御の重ね掛けではなく必須である。
- 1つのPDI・1つのUpdate Setの観測であり、他インスタンスのACL・性能・データ分布、
  未知の対象外接頭辞、ACL前limitによる短い応答の挙動を保証しない。人による再照合・承認ではない。
