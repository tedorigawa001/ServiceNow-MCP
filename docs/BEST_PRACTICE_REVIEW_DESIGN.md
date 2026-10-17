# ServiceNow ベストプラクティス収集・RAGレビュー設計

Status: **BP-1〜3 PoC・BP-4初回合成評価済み（品質目標未達）／製品MCP未統合（2026-10-17）**

本書はソースレビュー品質を高めるための収集・検索・報告方針を記録する。
全文知識ベース、収集ジョブ、意味検索、レビュー用MCPツールはまだ実装していない。
規則表引き＋キーワード検索と結果契約のローカルPoCは実装済み。
[BP-2の範囲・契約・実行方法](BEST_PRACTICE_BP2_POC.md)を参照。
[BP-3の安全抽出・先行3規則・未確認事項](BEST_PRACTICE_BP3_POC.md)も参照。
[BP-4の評価プロトコル・独立性の制約・初回結果](BEST_PRACTICE_BP4_EVALUATION.md)も参照。
[BP-4 v0.2の3分類契約・集計器・72ケース評価](BEST_PRACTICE_BP4_V2.md)も参照。
[限定的なスコープ/受信側/別名追跡の実装と固定v0.2再評価](BEST_PRACTICE_SCOPE_REEVALUATION.md)では
FP8→0、FN10→6、改善12件・退行0件。関数間/動的呼び出し・追跡確認不足は範囲外のまま。
[確認項目の型付き共通語彙・付与条件（提案版）](BEST_PRACTICE_FOLLOW_UP_CATALOG.md)を先にレビューし、
具体的確認項目の出力は文脈検出と結び付けて実装する。結果契約0.1の自由記述は互換性を維持する。
既存のSecurity Center対応は保留のままであり、本計画によって再開しない。

BP-1の公式本文調査は初版を作成済み。
[Australiaベストプラクティス台帳](BEST_PRACTICE_REGISTER_AUSTRALIA.md)に
公式資料5件・27規則の根拠URL、該当節、適用条件、例外と残作業を記録した。
人による採用承認と索引化・保存方式の確認は未完了。

## 1. 目的と対象

ServiceNow公式のベストプラクティスを検索し、対象コードと設定に適用できるかを
確認したうえで、**根拠付きのレビュー結果をJSONで返し、AIが報告する**。

初期対象はUpdate Setに含まれるBusiness Rule、Client Script、Script Include、
Scripted REST APIなどのカスタム資産。コードだけでなく、実行タイミング、条件、
公開範囲、スコープ、ACL等のメタデータも必要に応じて確認する。
このMCP自身のTypeScriptレビューとは対象・実行環境を区別する。

既存のUpdate Set SCAはOSS依存関係・既知脆弱性を扱う。
本機能はセキュリティ・性能・保守性のベストプラクティスレビューとして分離する。
RAGは根拠の検索手段であり、静的解析、実行経路の確認、必要な実機検証を置き換えない。

## 2. 収集対象と根拠元の優先順位

1. ServiceNow公式の製品ドキュメント・API Reference。
2. ServiceNow公式DeveloperサイトのTechnical Best Practices・開発ガイド。
3. 公式Developerブログ。公開時期と対象バージョンの制約を明示する。
4. Community・第三者記事は補助資料候補。初期版の判定根拠には採用せず、
   後から採用する場合も著者と公式資料との差、未検証事項を明示する。

同一ドメイン上でも、公式製品仕様、公式ブログ、ユーザー投稿を同じ信頼区分にしない。
検索結果の要約やページ上のAI生成要約だけを、規則の根拠にはしない。

### 最初に確認した根拠元

以下は2026-10-17に本文を参照した初期資料。
全規則の抽出・登録や、全リリースへの適用確認を完了したという意味ではない。

| Source ID | 根拠元・直接リンク | 該当する節・観点 | リリース／制約 |
|---|---|---|---|
| SN-SRC-001 | [Technical Best Practices — ServiceNow Developers](https://developer.servicenow.com/print_page.do?category=now-platform&identifier=business_rules_technical_best_practices&module=guide&release=zurich) | Scripting Technical Best Practices、Client Scripting Technical Best Practices、Business Rules Technical Best Practices | ページ指定はZurich。資産種別ごとに該当節と適用条件を確認して採用 |
| SN-SRC-002 | [Scripted REST APIs good practices — ServiceNow Docs](https://www.servicenow.com/docs/r/yokohama/api-reference/rest-api-explorer/scripted-rest-good-practices.html?contentId=sSsmmNsXcCLQObofusMplA) | Security and Access Control、Enforce and test access controls、Follow REST API conventions | ページ指定はYokohama。他ファミリーへの適用は別途確認 |
| SN-SRC-003 | [GlideRecord vs GlideRecordSecure — ServiceNow Developer Blog](https://developer.servicenow.com/blog.do?p=/post/gliderecord-vs-gliderecordsecure/) | ACLを考慮したデータアクセスの違い | 特定ファミリーの適用範囲は未確認。公式ブログとして扱い、現行API仕様と照合 |

### Australia適用範囲の追加確認（BP-1の必須作業）

ユーザーのPDI実測報告では対象ファミリーは **Australia**。
現状のSN-SRC-001はZurich、SN-SRC-002はYokohamaのため `mismatched`、
SN-SRC-003は適用リリース未確認のため `unknown` になる。
資料が存在するだけでは、このPDIで確認済みの違反を報告する根拠にはできない。

BP-1で、採用する規則ごとにAustralia版の同じ節または同等の公式仕様を照合し、
`applicable_releases` と `release_verification_evidence`（URL・節・本文に表示された
リリース・取得日・内容ハッシュ）を記録する。他リリースの資料IDをAustraliaに
上書きせず、版ごとのSource ID/スナップショットを追加して規則から参照する。

初回の追加調査では、検索結果ではAustraliaと表示されても本文はBrazil表示または
取得失敗となった。その後BP-1で公式Docsのリリース選択からAustraliaへ移動し、
固定版URL・リリース表示・本文をブラウザで確認した。対応は次のとおり。

| 元資料の観点 | Australia本文の照合先（台帳Source ID） | 確認範囲 |
|---|---|---|
| SN-SRC-001のBR/Client Script観点 | AU-SRC-001 / AU-SRC-002 | 台帳のBR・Client Script規則に対応する節。Zurichガイド全体の適用認定ではない |
| SN-SRC-002のREST観点 | AU-SRC-004 | 同名のAustralia版でREST規則に対応する節 |
| SN-SRC-003のアクセス制御観点 | AU-SRC-003 | Australia版Script includesのGlideAjaxセキュリティ節等。ブログ全体の適用認定ではない |
| 追加したクエリ仕様 | AU-SRC-005 | Australia版の該当演算子・全文検索の前提条件 |

直接URL・節・更新日・確認状態は台帳を参照。DeveloperガイドのAustralia版自体は
今回も根拠に使用せず、確認できた公式製品文書の該当節を規則ごとに結び付けた。

URLのreleaseパラメータや検索結果の表示だけでファミリーを認定しない。
少なくともBP-3で評価する規則群についてAustralia適用確認を終えることを開始条件とする。
一部規則だけ先行する場合は対象規則を宣言し、残りの未確認規則を対象範囲から黙って除外しない。

### 収集時の必須メタデータ

**ベストプラクティスごとに、どの資料のどの箇所を根拠としたかを必ず記録する。**
資料一覧だけを置き、個々の規則・指摘との対応を省略する運用にはしない。

| フィールド | 記録内容 |
|---|---|
| `source_id` | 根拠元を追跡する固定ID |
| `title`, `publisher`, `source_type` | 資料名、発行元、製品文書／開発ガイド／ブログ等の区分 |
| `url`, `resolved_url` | 直接URL、リダイレクト後のURL。検索結果ページは根拠URLにしない |
| `section`, `locator` | 見出し、アンカー等の該当箇所。本文断片との対応も保存 |
| `release`, `scope`, `asset_types`, `execution_context` | 対象ファミリー、Global/Scoped、資産種別、サーバー/クライアント/UI等 |
| `published_at`, `updated_at`, `retrieved_at` | 資料の公開・更新日時と収集日時。資料側の不明値はnull、推測で補完しない |
| `summary`, `evidence_excerpt` | 独自要約と、許諾範囲内の短い原文抜粋。両者を混同しない |
| `content_hash`, `snapshot_id` | 許可された保存内容のハッシュと版ID。本文の同一性確認用で、内容の正しさを保証しない |
| `reuse_status` | 収集・保存・再利用の許諾確認状況と制約 |
| `source_review_status`, `verified_at` | `candidate`（未承認）／`approved`（人による確認済み）／`retired`（失効）と最終確認日時。結果全体の `review_status` とは区別 |

翻訳や独自解釈にはその旨を記録し、公式原文の主張として提示しない。
根拠の確認ができない資料は、本番レビュー用の索引に採用しない。

## 3. 規則カタログ

初期は20〜30項目を手動選定し、機械的な全サイト収集からは始めない。

| 分類 | 初期の収集・規則化候補 |
|---|---|
| Business Rule | current.updateによる再帰の可能性、実行条件、before/after/asyncの使い分け |
| Client Script | 同期処理、不要なサーバー照会、UI別の対応状況、クライアントだけに依存した制御 |
| Script Include / REST | 公開範囲、認証・認可、ACLを考慮したデータアクセス、入力検証 |
| クエリ・性能 | ループ内照会、対象範囲の広い検索、不要な取得、実行負荷 |
| 共通 | ハードコード、機密情報のログ出力、例外処理、保守性 |

上記は候補であり、すべての項目を今回の3資料で裏付けたという意味ではない。
採用する各規則には `rule_id`, `source_ids`, `source_sections`, `applicability`,
`exceptions`, `required_context`, `detection_hint`, `verification_method` を持たせる。
根拠不足・適用条件不明の候補は未承認として扱う。

公式の推奨事項、製品の必須条件、プロジェクト固有ルールは別区分にする。
指摘の重大度は実際の影響から評価し、単なる推奨違反を自動で脆弱性としない。
例えばGlideRecordの使用だけで問題と断定せず、公開された呼び出し経路、
呼び出し元の権限、既存のアクセスチェック、返却データまで調べる。

## 4. 収集・更新フロー

1. URL許可リストと収集対象の節を選定し、利用条件・自動アクセス・保存・再利用の許諾を確認。
   robots.txtへの従属だけで再利用が許可されたとは判断しない。
2. 公開・許可された範囲だけ取得。認証・アクセス制限を迂回せず、レートと容量を制限する。
   リダイレクト先も検証し、任意ホスト・内部ネットワークへのアクセスを許可しない。
3. 広告・ナビゲーション等を除き、見出しとコード例・例外条件が分離しない単位で抽出。
4. 根拠メタデータを付け、重複・変更・廃止を検知。確認済み資料だけ索引化。
5. 規則の意味が変わる更新は人が確認し、知識ベースの版を更新する。

著作権・利用条件に適合する保存方式を選ぶ。全文ミラーや長文転載を既定にしない。
定期収集の頻度・保存期間・運用先は別途決定し、本計画だけでは自動実行を設定しない。
削除・失効した資料や古い規則は識別し、レビューの根拠として黙って使い続けない。

## 5. RAG検索とレビュー

### 5.1 コード取得とレビューする版

コード取得そのものは既存の経路の延長で設計する。
`get_business_rule` は `sys_script`、`get_script_include` は `sys_script_include` の
レコードを返し、参照が許可されていれば `script` 本文も取得できる
（`src/tools/script.ts`）。これらの既存ツールには `requireScripting()` のガードがある。
Update Set版は `sys_update_xml.payload` のXMLから対象フィールドを取り出せる
（`src/tools/updateset.ts`）。既存のガードやACLは取得経路を追加しても迂回しない。

レビュー開始時に `target_version` を固定する。

| 値 | 対象と扱い |
|---|---|
| `update_set_payload`（既定） | 選択した `sys_update_xml` レコードのpayloadをレビュー。Update Set内で捕捉された版であり、現在の資産とは限らない |
| `current_record`（明示指定） | 資産テーブルとsys_idで特定した、取得時点のインスタンス上の現行レコードをレビュー |

`update_set_id`, `update_xml_sys_id`, `asset_table`, `asset_sys_id`, `sys_scope`,
`target_version`, `retrieved_at`, `payload_hash`（payloadの場合）, `code_hash`,
取得したレコードの更新時刻を記録する。保存済みpayloadが不変とは仮定せず、
実際に取得した版をハッシュで固定する。名前だけで対象を決めない。
`sys_scope` の正規化値は32桁sys_idまたは `global`、不明ならnullとする。
削除操作・不正XML・未対応フィールド・容量上限は理由付きで報告する。

#### XML抽出・復号方式（設計決定）

**DTDと外部実体を無効化したXMLパーサーを採用する。**
DOCTYPE・DTD・実体宣言を拒否し、ネットワーク/ファイル参照、XInclude、
外部スキーマ取得を有効にしない。BP-3ではsaxesのイベントパーサーを採用し、
DTDイベント・名前空間・処理命令を拒否する。外部リゾルバーや実体追加は実装しない。
入力バイト数、深さ、要素数、抽出テキスト量も上限を設け、違反時は抽出を中止する。

既存 `extractUpdateXmlText`（`src/tools/updateset.ts`）は正規表現抽出であり、
XML構造の検証や実体参照の復号を行わないため、**レビュー用には流用しない**。
既存SCAの振る舞いは今回の文書更新では変更しない。

レビュー側では対象レコード・許可フィールドの構造を確認してテキストを抽出する。
本体レコードは表名と同じタグをちょうど1件必須とする。補助レコードは
sys_translated_text（action=delete_multiple）とsys_es_latest_scriptだけ読み飛ばす。
本体の構造化フィールドはfilter_conditionのみ入れ子を許可して読み飛ばし、
script内の要素や未知の兄弟レコードは拒否する。読み飛ばす配下にもXML妥当性・
名前空間拒否・深さ/要素数/テキスト量の制限を適用し、コードや識別子を採用しない。
通常テキストのXML標準5実体と有効な数値文字参照はXMLパーサーが一度だけ復号する。
CDATA内は文字どおりに扱い、抽出後に再度HTML/XML復号しない。
例えば通常テキストの `&amp;&amp;` は `&&`、CDATA内の `&amp;` はそのままとする。
未定義実体、不正な文字参照、不正なXML、対象フィールドの重複・曖昧な構造は理由付きで拒否する。
API名照合・解析・`code_hash` は復号後の同一コードを使い、元payloadのハッシュとは区別する。
先頭末尾の空白をtrimせず、改行の扱いを固定する。行番号は解析対象の復号後コードに対して付け、
XMLの改行正規化・改行を表す数値文字参照も考慮し、必要なら元位置との対応を保持する。

受入テストにはCDATA/通常テキストの等価コード、混在テキスト、5実体、10進/16進文字参照、
二重復号防止、CRLF/数値改行、DOCTYPE/外部実体/実体展開、深いXML、重複フィールドを含める。

現在の設定・ACL・依存先を補足取得する場合は、payload版のコードとは別時点の情報として
出所を付ける。両方を取得して差異を検出した場合は `version_drift` を記録し、混ぜて
一つの版として扱わない。現行版だけの実機確認を、異なるpayload版の確認結果に流用しない。

### 5.2 コード本文をAIへ返す範囲

既存SCAが本文を返さない方針は維持する。SCA出力を拡張して全文を返すのではなく、
レビュー用の契約で `code_return_mode` を明示する。

- `none`（既定）: 本文・抜粋は返さず、位置・ハッシュ・解析結果のみ。AIによる本文を
  必要とする判断は未実施とし、できない解析まで実施済みとしない。
- `excerpts`: 承認された範囲で、件数・行数・バイト数を制限した関連箇所だけを返す。
- `full`: 対象資産・フィールドを限定し、本文返却を明示的に承認した場合のみ。

本文取得権限と、MCP結果として接続先AIに開示してよい権限・方針は分ける。
`excerpts` / `full` は指定だけで承認扱いにせず、導入側の許可ポリシーにも照合する。
認証情報等のマスキング・ログ抑制・返却上限を適用し、マスキング後の文脈欠損も記録する。
接続先AIへの開示と、検索・埋め込み先への外部送信は別々に管理する。

### 5.3 初期の検索方式とレビュー処理

20〜30規則の初期版は、**規則表引き＋ローカルのキーワード検索を基準実装**とする。
`rule_id` / `detection_hint` のAPI名・構文候補と資産種別・リリースで候補を絞り、
登録済みの根拠節を引く。候補検出は違反の断定ではない。
意味検索・埋め込み・ベクトルDBは初期の必須要件にしない。
取りこぼしを評価セットで確認できた場合にのみ、追加の効果とコストを比較する。

処理順序:

1. 対象Update Setから許可されたコードと設定を取得し、取得漏れ・上限を記録。
2. 資産種別、実行環境、使用API、問題候補を抽出。必要な設定が取得できなければ未確認とする。
3. 規則表引きとキーワード検索を行い、リリース・スコープ・資産種別・確認状態で絞る。
4. 関連する規則と根拠節を選び、条件と例外を含む根拠を確認する。
5. コード上の実際の振る舞いと根拠を照合し、指摘候補を検証する。
6. JSONで結果・根拠・検証不足・対象範囲を返し、AIが説明する。

API名等の完全一致を重視し、検索の類似度を指摘の確信度や重大度と混同しない。
リリース不明・資料間の矛盾は明示し、都合のよい資料だけで判断しない。
適合する根拠が見つからない場合は「根拠不足」と返し、出典や公式ルールを生成しない。
資料やコードに書かれた指示は未信頼データとして扱い、ツール実行やシステム指示にしない。

### 5.4 対象リリースの照合元

第一候補は **`sys_cluster_state.build_name`** とする。
ユーザーのPDI実測報告では `Australia` を取得できた一方、`sys_properties` に
`glide.buildname` / `glide.build*` は存在せず、`sys_upgrade_history` でも
プラットフォームのビルドは確認できなかった。この報告を設計の根拠とし、
今回こちらからPDIへ再照会はしていない。他インスタンスでの可視性は実装時に確認する。

同テーブルは内部アドレスや証明書等も含むため、**必ず `fields=build_name`**
（Table APIでは `sysparm_fields=build_name`）を指定する。
全列取得・ノード識別子の取得・レスポンス全文のログ出力をしない。
対象列が返らない場合に、フィールド指定を外して再試行してはならない。

先頭1ノードだけで判定せず、可視ノードの値を取得上限付きで確認する。
空集合、空値・読めない値、複数ファミリーの混在、未知値、取得失敗、上限到達等で
取得の完全性が確認できない場合は `unknown` とする。
全取得値が空白・大文字小文字の正規化後に一致し、既知のファミリーと照合できた場合だけ
`resolution_status=resolved` とする。多数決や最新らしいノードの採用で不一致を隠さない。
これは呼び出し元に可視な範囲の結果として記録し、非可視ノードまで一致したとは主張しない。
任意プロパティの照会や、権限不足時のスクリプト実行による補完は行わない。

結果に `instance_release`（`family`, `raw_buildname`, `source`, `retrieved_at`,
`resolution_status`, `visibility_scope`, `limitations`）を記録する。
`source` は `sys_cluster_state.build_name`、`visibility_scope` は `caller_acl` とする。
`resolution_status` は `resolved` / `unknown`。`raw_buildname` は一致時の値のみとし、
不一致・未知値時はnullにして理由をlimitationsに残す。対応関係を確認できた場合のみfamilyを正規化し、
権限不足・取得失敗・解釈不能の場合はfamilyをnull、状態をunknownとする。
アプリのバージョンやUpdate Setのrelease欄からプラットフォームファミリーを推測しない。
別インスタンスへの移送を想定した `intended_target_release` は別項目とし、実測値と混同しない。

資料との一致は `matched` / `mismatched` / `unknown` で記録する。
不一致・資料側の指定なし・インスタンス側の不明は `limitations` に出す。
他リリースでも適用できると確認した規則だけ、確認範囲を台帳に記録して使用する。
リリース依存の適用条件が解決していなければ、確認済みの違反として報告しない。
BP-2の結果契約ではより保守的に、不一致・不明のいずれも評価済み規則と指摘を0件にし、
要求された全規則をrelease_mismatch/release_unknownでスキップする。
completedは認めない。不明時に検索が返す資料候補は評価結果とは別扱いとする。

## 6. 結果JSONの契約方針

各指摘に少なくとも次を含める。

- `rule_id`, `category`, `severity`, `confidence`, `verification_status`
- `asset_type`, `asset_id`, `field`, `line_start`, `line_end` とコード上の根拠位置
- `issue`, `impact`, `applicability`, `recommendation`, `required_follow_up`
- `sources`: 根拠URL、資料名、節、対象リリース、取得日時、資料版、短い根拠要約

位置はコードの該当フィールドに対する行番号とし、Update Set XML全体の行番号とは区別する。
ACLを取得できない、対象が一部しか読めない、検索に失敗した等の制約は
`coverage`, `limitations`, `review_status` に返す。スキップや取得失敗を問題なしとしない。
根拠確認済みと実機で挙動確認済みは異なる検証状態にする。

### 列挙値（BP-3開始前にJSON Schemaと評価セットへ固定）

| 項目 | 値と意味 |
|---|---|
| `category` | `security` / `performance` / `maintainability` / `correctness` |
| `severity` | `critical`: 影響・成立条件が裏付けられた最重大級、`high`: 重大なセキュリティ・業務影響、`medium`: 限定的だが実質的な影響、`low`: 軽微な影響、`info`: 改善提案・情報。公式推奨違反だけでcritical/highにしない |
| `confidence` | `high`: 主張に必要な条件と根拠を確認、`medium`: 有力だが一部条件が未確認、`low`: 候補・推測の段階。検索類似度や実機確認の有無とは別軸 |
| `verification_status` | `candidate`: 候補のみ、`evidence_matched`: 根拠節とコード・適用条件を照合済み、`path_confirmed`: 呼び出し元・認可・データ到達先等の関連実行経路を確認済み、`runtime_confirmed`: 対象版・環境に対応する実機で指摘の挙動を確認済み |
| `review_status`（結果全体） | `completed`: 宣言した対象・規則・解析モードをすべて処理、`partial`: 一部スキップ・権限不足・取得/検索失敗等あり、`failed`: 有効なレビュー結果を作れなかった |

`verification_status` は上記順の確認段階とし、必要な前段階を満たした場合だけ進める。
各段階の根拠・確認者/手段・対象版・日時を `verification_evidence` に保存する。
実行経路や実機の確認を要しない規則でも、未実施の段階まで自動で昇格させない。
`runtime_confirmed` は本機能が自動実行する意味ではなく、別途承認した検証結果を指す。
`completed` は安全性の保証や全指摘の実機確認済みを意味しない。
本文非返却等の選択モードを明示し、取得失敗をそのモードの制限として隠さない。

結果全体に `knowledge_base_version`, `ruleset_version`, `reviewed_at`,
対象の版・ハッシュ、検索条件を付け、同じ根拠集合でレビューを再現できるようにする。
引用URL・節が実在し、指摘の主張を支えるかも確認する。

## 7. 機密性・運用上の制限

- PDIなしで資料の選定・索引設計を進められる。PDIからの資産取得は既存ACLを尊重する。
- 初期方針は、コード・認証情報・業務データを外部検索や埋め込みサービスへ自動送信しない。
  クエリ語、ログ、コード断片も対象とし、外部利用時は送信範囲と保存条件を別途承認する。
- 外部の資料検索に出す語は一般的なAPI名・資産種類等に限定し、顧客識別情報を含めない。
- 収集・索引作成の権限と、レビュー実行の権限を分ける。文書のアクセス範囲を検索でも維持する。
- レビューは読み取り専用。自動修正、スクリプト実行、PDIの設定変更は別機能・別承認とする。

## 8. 段階的な進め方と品質確認

1. **BP-1: 根拠台帳** — 公式資料の許諾と適用条件を確認し、根拠付き規則20〜30項目を選定。
   BP-3対象の規則はAustralia版の該当節を本文で照合し、適用範囲と根拠を追加する。
2. **BP-2: 検索・契約PoC** — 規則表引き＋キーワード検索を比較基準とし、API名・自然文・
   例外条件・リリース違いで評価。取りこぼしを確認してから意味検索の追加を判断する。
   §5の版・返却ポリシー・リリース照合、§6の列挙値をJSON Schemaと評価セットに固定する。
3. **BP-3: レビューPoC** — BP-2の契約確定と、対象規則のAustralia適用確認後に開始。
   少数のBR・Client Script等について根拠付きJSONを作成。全規則が不一致/不明の状態では開始しない。
4. **BP-4: 品質評価** — 問題あり／問題なし／例外／情報不足の評価セットで検証。
5. **BP-5: MCP統合** — スキーマ、取得上限、権限、失敗時の扱い、利用例を整備してツール化。

検索の正解根拠取得率、指摘の適合率・再現率、誤検知、引用の正しさ、適用条件の一致を
別々に評価する。既知の正解を人が付けた評価セットを用い、改善に使わない検証用ケースも残す。
根拠なし、古い資料、矛盾する資料、悪意のある文書、取得失敗でも誤って断定しないことを確認する。
合格基準はPoC開始前に決定する。現時点で品質向上の数値や事故防止効果は未測定。

適合率・再現率の評価では、どの `verification_status` / `confidence` 以上を
指摘として数えるかを事前に固定する。候補と確認済みを混ぜず、未評価の正解ケースも
記録して対象範囲の低下を隠さない。リリース不明・版の差異・同名別スコープも評価に含める。

## 9. 関連する既存コードの別課題（今回の修正対象外）

`get_script_include` の名前指定は `api_name=X^ORname=X` を `limit: 1` で取得し、
同名資産が別スコープにある場合も先頭1件を返す（`src/tools/script.ts`）。
本レビュー機能では、この名前検索を資産特定に使わず、資産テーブル＋sys_id、
または特定の `sys_update_xml` レコードとpayload内の識別子を使用する。
識別できない場合は失敗・スキップとし、名前検索へ黙ってフォールバックしない。
既存ツール側のスコープ指定・重複検出は別課題として追跡し、本書更新ではコードを変更しない。

BP-2のローカル契約・検索PoCは実装済み（上記の検証記録を参照）。
BP-3では安全なpayload抽出とAU-BR-001/002・AU-CL-004の構文候補検証まで実装済み。
他規則はunsupported、適用メタデータ不足はmissing_contextで記録する。
指摘はすべてcandidateであり、束縛・実行経路・業務上の例外・実機での違反確認は未実施。
BP-4では別作成の合成48ケースで初回評価を実施した。候補適合率33.3%、再現率50%で
初回目標未達。ただし正しく候補保持すべき例外をFPに数える採点契約では、適合率80%は
構造的に到達できない。v0.1のケース・結果は保存するが、品質承認のゲートには使わない。
v0.2ではcandidate/clear/candidate_with_followupと情報不足の別軸保留を実装し、
新規合成72ケースで評価済み。候補適合率26/34、再現率26/36、追跡確認充足6/18、
情報不足の適切な保留18/18。件数とWilson区間を併記し、リリース品質は未評価とする。
人による採点、未使用ケースを維持した改修後の再評価は未完了。
作問者は実装を参照済みで、完全なブラインド評価・人の採点承認ではない。
次の着手候補は台帳の採用・保存方針、束縛/別名追跡の改善、例外文脈の扱いと未使用ケースでの再評価。
品質承認とMCP統合は未実施。
本書・台帳の作成は大量収集・RAG実装・外部送信・定期実行の開始を意味しない。
