# BP-2 — ローカル検索PoC・レビュー結果契約

Status: **ローカルPoC実装済み／製品MCP未統合（2026-10-17）**

[設計書](BEST_PRACTICE_REVIEW_DESIGN.md)と[BP-1台帳](BEST_PRACTICE_REGISTER_AUSTRALIA.md)の
27規則を対象とする。PDI接続、コードの自動取得、XML解析、静的解析による指摘生成、
AIレビュー、外部検索、埋め込み、Security Centerの再開は行っていない。

## 1. 実装物

| ファイル | 役割 |
|---|---|
| `src/review/catalog.ts` | 台帳27規則・公式資料5件の構造化要約。原文全文は含まない |
| `src/review/search.ts` | 規則ID表引きと、API名/登録キーワードによる候補検索 |
| `src/review/result-schema.ts` | 結果の型・JSON Schema生成元・項目間整合性バリデーター |
| [JSON Schema](../schemas/best-practice-review-result.schema.json) | Draft-07の構造契約。全オブジェクトで未知キーを拒否 |
| [入力例](../examples/bp2-review-result.json) | 架空ID・ハッシュを使った候補1件の例。実機検証記録ではない |
| `scripts/bp2-poc.ts` | ローカル実行用CLI。インスタンス設定・認証情報を読み込まない |
| `tests/review/` | 台帳との一致、検索の開発用評価、スキーマと意味的整合性のテスト |

資料は引き続き採用承認待ち。検索結果は常に `poc_only=true` と
`source_approval_pending` を返し、本番用承認済み知識ベースとして扱わない。
MCPのツール一覧・サーバー起動経路・既存SCAの本文非返却方針は変更していない。
未統合のPoCはローカルではビルドするが、npmのfiles設定で `dist/review/**` を除外する。
MCPツール化して配布する段階で、この除外と必要な配布物を改めて判断する。

## 2. 検索契約

入力:

```json
{
  "query": "current.update()",
  "asset_type": "business_rule",
  "release": "Australia",
  "limit": 5
}
```

- `asset_type` と `release` は必須。releaseは不明ならnull。
- 資産種別: `business_rule`, `client_script`, `script_include`,
  `scripted_rest_resource`, `server_script`。server_scriptは本PoCの結果契約ではsysauto_scriptを指す。
- `query` は任意、最大500文字。`rule_id` を明示して直接表引きも可能。
  両方指定した場合はrule_idを優先する。
- `limit` は整数1〜27、既定10。未知キーを拒否する。
- クエリ省略時は該当資産種別の規則一覧。未知のrule_idや一致なしは
  `no_candidate` と空のhitsを返し、「問題なし」とは解釈しない。

処理はNFKC/小文字正規化、資産種別・リリースによる絞り込み、固定語の照合。
API名の末尾違い（例: current.updateとcurrent.updateMultiple）を同一と扱わない。
API名・予約語の完全一致100点、キーワード一致10点、rule_id指定1000点で順位付けし、同点はID順。
`123TEXTQUERY321` は予約語として100点。addQueryとaddEncodedQueryのどちらでも照合する。
スコアは関連候補の順位だけで、違反確度や重大度ではない。

リリースはAustraliaだけがmatched。認識対象のBrazil/Zurich/Yokohama/Xanaduは
mismatchedとして候補を返さない。null・未認識名はunknownとして候補と警告を返す。
これは入力されたファミリーの比較であり、実機からリリースを取得したことは意味しない。
unknownの候補は参考用の根拠候補に限る。結果JSONに移す際は、unknownでもmismatchedでも
要求された全規則をそれぞれrelease_unknown/release_mismatchでスキップし、指摘は0件にする。
その場合のreview_statusはpartialまたはfailedで、completedは拒否する。
先頭件数だけを返した場合は `truncated=true` と `total_candidates` を付ける。

本文解析ではないため、検索語中のAPI名がコメントか実行コードかは判定しない。
自然文の自由な同義語検索でもなく、登録語がなければ取りこぼす。
BP-3でコードの振る舞いと適用条件を確認するまで、検索候補を指摘に変換しない。

## 3. 結果JSON契約

版は `bp-review-0.1`。**1資産・1フィールド・1つの版**を対象とする。
Update Set全体の集約結果はこの版では提供しない。

- `target` は `update_set_payload` / `current_record` の排他的な構造。
  payload版はUpdate Set ID・XML ID・payloadハッシュを必須とし、現行版ではこれらを拒否する。
- 資産はテーブル＋sys_idで特定する。名前からの先頭1件検索は利用しない。
  `target.sys_scope` は32桁sys_id、文字列 `global`、不明時のnullを許容する。
  スコープ名や大文字のGlobal、参照オブジェクトをそのまま渡す形式は許容しない。
- `code_return_mode` はPoCでは **noneのみ**。script/code等の本文キーを拒否する。
  excerpts/fullは今後の開示ポリシー・承認契約確定後に別途追加する。
- 根拠にはSource IDだけでなく、正式URL、資料名、該当節、Australia、確認日、
  台帳版、独自要約を必須とする。未保存の取得時刻・原文ハッシュ・snapshotはnull。
  根拠のreleaseとverified_onは構造では文字列/日付形式とし、意味的検証でSOURCESの
  値と照合する。再確認日の変更だけを理由にschema_versionを変える必要はない。
  カタログ・入力例・必要な版情報は再確認内容に合わせて更新する。
- JSONで返す本文以外の説明文にも機密情報を含めない運用が必要。
  スキーマだけで自由記述中の秘密情報をすべて検出できるとはしない。

| 項目 | 列挙値 |
|---|---|
| category | security / performance / maintainability / correctness |
| severity | critical / high / medium / low / info |
| confidence | high / medium / low |
| verification_status | candidate / evidence_matched / path_confirmed / runtime_confirmed |
| review_status | completed / partial / failed |

意味は設計書§6に従う。completedは宣言した対象範囲の処理完了であり、
資料の採用承認・安全性保証・実機で全件確認済みを意味しない。

### JSON Schemaと整合性検証の境界

**JSON Schemaファイルだけでは検証完了にならない。**
ファイルは型・列挙値・必須キー・上限等の構造を定義する。
受け入れる側では `reviewResultSchema.safeParse()` の項目間検証も必須にする。

項目間検証は、台帳のURL/資料名/節との一致、資産種別とテーブル、行範囲、
リリースの整合性、requested規則がevaluatedまたはskippedに一度だけ現れること、
findingsがevaluated規則に属すること、skippedありでcompletedを主張しないことを確認する。

検証段階を進める場合は、前段階から順に `verification_evidence` が必要。
各段階はstatic_analysis / path_analysis / pdi_testと対応し、同一code_hashと
確認日時・参照先を要求する。版が違う検証や段階の飛び越しは拒否する。
不一致・不明リリースではcandidateを含むすべての指摘を拒否し、全規則の理由付き
スキップを必須とする。適合するリリースが分かるまで評価済みには数えない。
ただし、参照先の実在や証拠内容の真実性まで自動検証するものではない。
形式が正しいだけで実行経路や実機確認が実施されたとは判断しない。

## 4. 実行例

リポジトリの依存関係導入済み環境で実行する。ネットワーク・PDI認証は不要。

```bash
bdo node --import tsx scripts/bp2-poc.ts --search '{"query":"current.update()","asset_type":"business_rule","release":"Australia","limit":1}'
bdo node --import tsx scripts/bp2-poc.ts --schema
bdo node --import tsx scripts/bp2-poc.ts --validate examples/bp2-review-result.json
bdo npm test -- tests/review
```

--schemaはJSONを標準出力へ返す。--validateは指定されたローカルJSONを読み、
構造・項目間整合性を検証する（上限2 MiB、拒否時exit 1）。内容をPDIや外部AIへ送信しない。
配布済みJSON Schemaと生成元がずれた場合はテストが失敗する。

## 5. 検証と残課題

開発用の期待値12件でTop-1の規則取得を確認。日本語、API名、英語語句を含む。
この期待値は実装時の手作業によるもので、独立したholdout評価ではない。
12/12を一般的な検索再現率やレビューの適合率・再現率とは呼ばない。

検索テストは台帳27規則と根拠節の一致、候補の境界・資産種類・リリース、
上限・未知入力・返却データ変更時の分離も確認する。
結果契約のテストは出典不一致、検証段階、ハッシュ、カバレッジ、本文キー拒否、
JSON Schema・例の同期等を確認する。

2026-10-17のBP-2初回実装時の実行結果（以下のレビュー指摘修正前）:

| 検証 | 結果 |
|---|---|
| `bdo npm test -- tests/review` | 2ファイル・30件成功 |
| `bdo npm test` | 67ファイル・1,854件成功、失敗なし |
| `bdo npm run build` | 成功 |
| 追加したsrc/review・tests/reviewのESLint | エラー・警告なし |
| CLIの単独TypeScriptチェック | 成功 |
| CLIでAustraliaのcurrent.update検索 | AU-BR-001と正式URL・該当節を返却 |
| CLIで同検索をZurich指定 | 候補0、release_mismatchを明示 |
| CLIで架空のJSON入力例を検証 | valid=true |
| ビルド後の生成スキーマと配布用JSONの比較 | 一致 |
| 関連3文書のローカルリンク | 切れなし |

TDDでは、取得API未実装、台帳未反映、リリース判定、表引き・名前境界、
結果契約未実装・項目間整合性・根拠メタデータについて、失敗から成功への遷移を確認した。
ここでの「取得API」はローカル検索関数の呼び出しであり、ServiceNow APIではない。

### レビュー指摘修正後の再検証（2026-10-17）

Globalスコープの受け入れ、リリース不一致・不明時の全件スキップ、台帳27行の
存在確認、AU-QRY-002の予約語の100点扱い、根拠メタデータのカタログ照合を追加した。
Globalの値は報告されたPDIの実値に基づく回帰テストであり、この再検証でPDIへの
アクセスや書き込みは行っていない。

| 検証 | 結果 |
|---|---|
| `bdo npm test -- tests/review` | 2ファイル・36件成功 |
| `bdo npm test` | 67ファイル・1,860件成功、失敗なし |
| `bdo npm run build` | 成功 |
| src/review・tests/reviewのESLint | エラー・警告なし |
| CLIの単独TypeScriptチェック | 成功 |
| CLIでGlobalを含む架空のJSON入力例を検証 | valid=true |
| JSON Schemaと生成元の同期 | テスト成功 |
| ビルド後の`npm pack --dry-run --ignore-scripts --json` | 全281ファイル、dist/reviewは0件、サーバーとCLIは含まれる |

未接続のPoCはローカルでビルドするが、npmには含めない方針とした。
変更前に含まれていたdist/reviewの12ファイルが除外されることをdry-runで確認した。
公開操作は実施していない。

次に必要な作業:

1. 規則の人による採用・例外レビュー、資料の保存/索引化方針の確認。
2. 独立評価セットと、取りこぼした表現・誤一致の評価。
   埋め込み追加はその結果を見て判断する。
3. BP-3で、版を固定した安全なXML抽出・解析、実行条件の補足、候補の検証を実装。
   検索だけで指摘生成を完了したとはしない。
4. 本文返却を有効にする場合の開示承認とマスキング、MCP統合は別途実装。
