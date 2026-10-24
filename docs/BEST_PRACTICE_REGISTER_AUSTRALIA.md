# Australia ベストプラクティス台帳 — BP-1

版: `au-register-0.1` / 確認日: **2026-10-17**

Status: **公式本文・Australia表示を照合した初版27項目／人による採用承認待ち**。
本番検索索引・違反検出器・レビューMCP・PDIテストは未実装・未実施。
規則表引き＋キーワード検索は[BP-2のローカルPoC](BEST_PRACTICE_BP2_POC.md)を参照。
設計契約は [BEST_PRACTICE_REVIEW_DESIGN.md](BEST_PRACTICE_REVIEW_DESIGN.md) を参照。

本書の未実装表記はBP-1作成時点の履歴。[AU-QRY-001のBR限定実装](BEST_PRACTICE_QUERY_LIKE_BR.md)を後続で追加した。台帳の適用対象全体への対応や、人による規則採用承認を意味しない。
[AU-BR-004の宣言候補・共有文脈の実装](BEST_PRACTICE_TOP_LEVEL_BINDINGS_BR.md)も後続で追加した。関数localを区別し、Global-table文脈でも共有意図や実際の衝突を確認済みにしない。

## 1. 確認方法と状態

公式Docsのリリース選択でAustraliaへ切り替え、**本文とRelease versionの両方**を
ブラウザで確認した。検索結果のAustralia表示だけでは採用していない。
固定版URLがWeb取得で失敗する場合も、ブラウザでは表示を確認できた。
リリース指定のないURLはBrazilへ切り替わる例があり、再確認時も表示版をチェックする。

以下の共通メタデータを全資料・規則に適用する。

| 項目 | 値・扱い |
|---|---|
| `publisher` / `source_type` | ServiceNow / official_product_documentation |
| `applicable_releases` | `["Australia"]`。他ファミリーへの適用は未確認 |
| `release_match` | Australiaを対象とするとき `matched`。実際のレビュー時にはインスタンスの値を別途取得 |
| `verified_on` / `verified_by` | `2026-10-17` / `agent`（公式本文と適用条件を照合） |
| `retrieved_at` | 正確な取得時刻は未保存のためnull。今回の確認日は上記。時刻を捏造しない |
| `published_at` | 各資料とも未確認のためnull。更新日と区別 |
| `source_review_status` | `candidate`。本文照合済みだが、設計で定める人による採用承認は未実施 |
| `reuse_status` | 独自要約・根拠リンクの台帳のみ作成。全文保存・定期収集・外部再配布の許諾は未確認 |
| `content_hash` / `snapshot_id` | 原文スナップショットを保存していないためnull。台帳版を原文ハッシュの代わりにしない |
| `evidence_excerpt` | 初版は原文転載なし。節名と独自要約で位置を示す |
| 検証状態 | 規則自体の文献照合であり、対象コードの `verification_status` を自動で設定するものではない |

BP-2以降の採用対象は人が承認する。原文の保存・索引化を行う場合は、その許諾確認と
取得時刻・許可された本文のハッシュ等を追加する。現段階で本番索引へ投入しない。

## 2. 根拠元台帳

各URLは閲覧時の最終URL。直接リンク＋節名/locatorで出典を特定する。
Source IDは既存のZurich/Yokohama資料とは別に割り当て、そちらの版を上書きしない。

| Source ID | 公式資料・根拠URL | 閲覧時のリリース表示 | 本文の更新日 |
|---|---|---|---|
| AU-SRC-001 | [Classic Business rules](https://www.servicenow.com/docs/r/australia/api-reference/business-rules-classic/c_BusinessRules.html) | Australia API Reference / Australia | 2026-03-12 |
| AU-SRC-002 | [Client-side scripting design and processing](https://www.servicenow.com/docs/r/australia/api-reference/scripts/client-script-best-practices.html) | Australia API Reference / Australia | 2026-10-08 |
| AU-SRC-003 | [Script includes](https://www.servicenow.com/docs/r/australia/api-reference/scripts/c_ScriptIncludes.html) | Australia API Reference / Australia | 2026-03-12 |
| AU-SRC-004 | [Scripted REST APIs good practices](https://www.servicenow.com/docs/r/australia/api-reference/rest-api-explorer/scripted-rest-good-practices.html) | Australia API Reference / Australia | 2026-03-12 |
| AU-SRC-005 | [Querying tables in script](https://www.servicenow.com/docs/r/australia/api-reference/scripts/c_UsingGlideRecordToQueryTables.html) | Australia API Reference / Australia | 2026-03-12 |

`release_verification_evidence` はこの表の表示版・確認方法・確認日、各規則の節を参照する。
原文ハッシュは未保存なので、後の無人更新や再現性確認に必要なスナップショットは別途整備する。

## 3. 規則台帳

「規則・適用条件」は公式本文に基づく独自要約。「検出候補・追加確認」は本プロジェクトの
検出器設計案であり、公式の検出アルゴリズムや重大度ではない。
下表のSource IDは§2の直接URLに対応し、節名は本文の見出しまたは表の行を示す。

### 3.1 Business Rule — 7項目

対象は `sys_script` のサーバー側BR。Global/Scopedの違いを設定とともに確認する。

| rule_id | 規則・適用条件・例外 | 根拠元／該当節 | 検出候補・追加確認 |
|---|---|---|---|
| AU-BR-001 | 現在レコードの再更新を避ける。特殊事情でのworkflow抑止併用は一律修正しない | AU-SRC-001 / How business rules work → Prevent recursive business rules | `current.update()`。到達可能性、BR連鎖、before/after、意図した副作用を確認 |
| AU-BR-002 | asyncの本文でpreviousや変更判定に依存しない。条件欄でのchanges系利用とは区別 | AU-SRC-001 / How business rules work → When business rules run（Note）、Global variables in business rules | `when=async`＋本文の`previous`/`changes*`。condition/filter_conditionを本文と混同しない |
| AU-BR-003 | async同士の更新順序を前提にしない | AU-SRC-001 / How business rules work → When business rules run（Async行） | 同一レコード更新と前後関係への依存を候補化。他BRと短時間の連続更新も確認 |
| AU-BR-004 | BRの変数を関数内に閉じ、他BRとの衝突を避ける | AU-SRC-001 / Global variables in business rules → Define variables | トップレベル変数。既存ラッパー・意図した共有を確認し、文字列検索だけで断定しない |
| AU-BR-005 | setAbortAction後もスクリプトと後続BRは続くことを考慮する | AU-SRC-001 / Example business rule scripts → Abort a database action in a before business-rule | 中止呼出し後の副作用。常にreturn追加とはせず、必要な後処理か確認 |
| AU-BR-006 | 別スコープからのsetAbortActionで中止できるとは扱わない | AU-SRC-001 / Example business rule scripts → Abort a database action in a before business-rule（Note） | BRと対象テーブルのsys_scopeを比較。スコープを取得できなければ未確認 |
| AU-BR-007 | displayでのフィールド変更を永続保存と誤認しない | AU-SRC-001 / Display business-rules | `when=display`＋currentへの代入。表示だけの意図なら問題なし。永続化要件を確認 |

### 3.2 Client Script — 8項目

対象はフォーム向けクライアント処理。Workspace/Portal/MobileでのAPI対応をこの資料だけで
保証せず、該当UIのAPI仕様を追加確認する。ブラウザに出すデータの権限も別途評価する。

| rule_id | 規則・適用条件・例外 | 根拠元／該当節 | 検出候補・追加確認 |
|---|---|---|---|
| AU-CL-001 | フォームだけの制御をリスト編集へ流用しない。onCellEditは区別 | AU-SRC-002 / Restrict list editing | フィールド制御。リスト編集、ACL/BR/Data Policy等を確認。不在をpayload未収録だけで断定しない |
| AU-CL-002 | 不要なサーバー照会を減らす | AU-SRC-002 / Minimize server lookups | `getReference`/クライアントGlideRecord。必要列、既存データ、照会頻度を確認 |
| AU-CL-003 | 読込前に決まる必要データはscratchpadによる受渡しを検討 | AU-SRC-002 / Minimize server lookups → Retrieve server data using g_scratchpad | onLoadでの照会。動的取得が必要なら例外。機密データをscratchpadへ追加しない |
| AU-CL-004 | 動的な照会は非同期GlideAjaxを優先 | AU-SRC-002 / Minimize server lookups → Retrieve server data using asynchronous GlideAjax | `getXMLWait`等。コールバック完了前に結果を使用していないかも確認 |
| AU-CL-005 | 参照フィールドのsetValueで既知の表示値を渡し、追加往復を避ける | AU-SRC-002 / Use the setValue() displayValue parameter for reference fields | 参照列への2引数setValue。表示値の可用性を確認し、その取得のためだけに照会を増やさない |
| AU-CL-006 | 単純な必須/表示/読取専用制御はUI Policyを検討 | AU-SRC-002 / Use UI policy instead of a client script | `setMandatory`/`setVisible`/`setReadOnly`。複雑な処理やUI制約があればスクリプトを一律禁止しない |
| AU-CL-007 | 標準DOMへの依存を減らす | AU-SRC-002 / Avoid DOM manipulation | DOM ID/CSS selector参照。自作UIのDOMと標準UI依存を分離し、代替GlideForm APIを確認 |
| AU-CL-008 | 読込時に不要なonChange処理はisLoading等で抑制 | AU-SRC-002 / Run only necessary scripts | onChangeでのサーバー照会とガード。読込時に動く必要がある処理は例外として記録 |

### 3.3 Script Include — 4項目

対象は `sys_script_include`。`Accessible from=All application scopes` と
`isPublic()` の匿名実行設定は別物として扱う。

| rule_id | 規則・適用条件・例外 | 根拠元／該当節 | 検出候補・追加確認 |
|---|---|---|---|
| AU-SI-001 | 非公開のGlideAjax enabled資産はACLで保護する | AU-SRC-003 / Glide AJAX enabled script includes → Security on Glide AJAX enabled script includes | client_callableと関連ACL、ロール・条件を照合。公開資産はAU-SI-002でも評価 |
| AU-SI-002 | 匿名公開で機密情報を返さない。個別isPublic設定の優先を考慮 | AU-SRC-003 / Privacy settings on Glide AJAX enabled script includes → Public privacy-setting、Change privacy on a single Glide AJAX enabled script include | `isPublic()`、返却経路、機密列、実効設定を確認。公開というだけでは脆弱性にしない |
| AU-SI-003 | DB照会するGlideAjax enabled資産ではGlideRecordSecureを優先（区分: 公式推奨。製品の必須条件ではない） | AU-SRC-003 / Security on Glide AJAX enabled script includes | `client_callable=true`＋GlideRecord。到達経路と既存認可を調べ、単独のAPI名だけで漏えいを断定しない。本文ではGlide AJAX有効化時のシステム推奨メッセージとして記載され、`glide.script.ccsi.customer_scoped.security_msgs_enabled` で表示を止められる。表示の有無を規則の適用条件にしない |
| AU-SI-004 | Nameとクラス/prototype/type、またはオンデマンド関数名を一致させる | AU-SRC-003 / Script include form（Name/Script行）、Use script includes | メタデータと定義を比較。外部呼出し用API NameとNameは混同しない |

### 3.4 Scripted REST API — 6項目

本文だけでなく `sys_ws_definition` / `sys_ws_operation`、関連ACL、呼出し先も必要。
ソース資産が未収録なら、別途許可された参照で補足するか未確認とする。

| rule_id | 規則・適用条件・例外 | 根拠元／該当節 | 検出候補・追加確認 |
|---|---|---|---|
| AU-REST-001 | GETで業務データを変更しない | AU-SRC-004 / Follow REST API conventions | GETハンドラーから書込APIへの経路。アクセスログ等の通常記録とは区別 |
| AU-REST-002 | 公開済み契約の破壊的変更は版を分ける | AU-SRC-004 / Use versioning to control changes to your API | 変更前後のスキーマ・利用者を比較。単一版だけでは違反判定できない |
| AU-REST-003 | 成否に対応するHTTPステータスと有用なエラーを返す | AU-SRC-004 / Return an informative HTTP status code、Return useful error information | エラー分岐とステータス。常に200で失敗を隠していないか、フレームワークの既定処理も確認 |
| AU-REST-004 | 認証だけでなくデータ認可を適用する | AU-SRC-004 / Enforce and test access controls | 認証/Endpoint ACL/GlideRecordSecure等。認証済みだけで全データ参照可能としない |
| AU-REST-005 | 書込系操作には読取より厳しい認可を設ける | AU-SRC-004 / Enforce and test access controls | メソッドごとのACLとスクリプト内認可を比較。単純にロール名の数だけで強弱を決めない |
| AU-REST-006 | 応答・本文・ヘッダー・認証の反復可能なテストを用意 | AU-SRC-004 / Build tests to verify functionality | テスト成果物を確認。Update Setにテストがないだけで未実施とは断定しない |

### 3.5 テーブル照会 — 2項目

仕様条件に基づくcorrectness規則。文字列の意味をAPIごとに区別する。

| rule_id | 規則・適用条件・例外 | 根拠元／該当節 | 検出候補・追加確認 |
|---|---|---|---|
| AU-QRY-001 | addQueryの文字列包含演算子はCONTAINSを使う | AU-SRC-005 / Available JavaScript operators（CONTAINS行） | `addQuery(field, 'LIKE', value)`のみ候補化。encoded queryの`LIKE`はこの規則で禁止しない |
| AU-QRY-002 | 全文検索の利用前提となる索引設定を確認 | AU-SRC-005 / Return records from a table that include a string（Note） | `addQuery('123TEXTQUERY321', …)` と encoded query（`addEncodedQuery('123TEXTQUERY321=…')` 等）の両方。対象テーブルの索引設定が見えなければ未確認。通常の包含検索とは別 |

## 4. 根拠と実装を結び付ける運用

- `source_sections` は上表のSource IDと節名をそのまま保持する。
  規則表引きは `rule_id → source_id + section` とし、資料タイトルだけを返さない。
- `detection_hint` は候補検出用で、コメント・文字列中のAPI名を実行と扱わない。
  AST/設定/関連資産の確認範囲はBP-2で契約化する。
- `required_context` は適用条件と追加確認欄の情報。
  収集できない場合は `limitations` に返し、規則の不適用や問題なしに変換しない。
- `verification_method` はまずコード・設定と原文の照合。
  必要に応じた経路確認と、承認済みの実機検証は別段階とする。
- `exceptions` は各行の例外を保持。例外のない規則と誤解させない。
- メトリクスは原則として複合指摘を重複計上しない。
  同じACL不足等が複数規則に当たる場合は関連rule_idを紐付けて扱う。
- この台帳の規則にseverityを固定しない。違反か推奨改善か、影響、成立条件から判定する。

## 5. BP-1の到達点・残作業

完了した調査: Australia表示と公式本文5件の確認、27規則への出典・節・条件の対応付け。

運用投入前の残作業:

1. 人による規則の採用・例外レビューと、利用条件/保存方式の確認。
2. 許可された資料保存を行う場合の時刻・原文ハッシュ・スナップショット記録。
3. BP-2で作成したローカル検索・結果スキーマの契約レビューと本採用判断。
   版照合と本文非返却の契約はPoCに含むが、実機取得・コードの違反検出は未実装。
4. 正例・反例・情報不足・リリース不一致を含む評価ケースの作成。

性能全般のループ内照会、入力注入、秘密情報ログ等の未収録規則は、別のAustralia版の
根拠を確認してから追加する。今回の27項目で全ベストプラクティスを網羅したとはしない。
PDIへの追加操作、Security Centerの保留解除、大量収集・外部埋め込み送信は行っていない。
