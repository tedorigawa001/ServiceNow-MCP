# BP-3: Update Set版の安全なXML抽出・構文候補検証PoC

Status: ローカルPoC／製品MCP未統合。PDIへの接続・変更なし。

本書の初回検証はbp3-0.1の記録。現在の既定は[限定的スコープ解析bp3-0.2](BEST_PRACTICE_SCOPE_REEVALUATION.md)。
旧解析は明示的legacy経路で残し、既存の抽出・PDI検証結果を新解析の実機確認には流用しない。

## 1. 範囲と合格基準

BP-2の[結果契約](BEST_PRACTICE_BP2_POC.md)を利用し、本文を返さずに
Update Setのpayload版を固定する。少数規則を先行し、他規則は黙って除外せず
`unsupported`で記録する。これは自動の違反確定や、実機での挙動確認ではない。

この段階の合格基準は、以下の固定した合成ケースをすべて満たし、全体回帰テスト・
ビルド・対象Lintが成功すること。独立評価による適合率・再現率はBP-4で別途測定する。

- CDATAと通常テキストの等価コードが同じcode_hashを持つ。
- 標準実体・数値参照を一度だけ復号し、コード位置は復号後の行番号になる。
- DTD・外部実体・不正XML・重複や曖昧な構造・上限超過は失敗する。
- コメント・文字列・正規表現リテラル内のAPI名を呼び出しと誤認しない。
- 適用メタデータ不足・未対応規則・不一致/不明リリースを明示する。
- 出力・エラーに本文を含めず、スクリプトを実行せず、外部参照もしない。

## 2. 入力と版の固定

`reviewUpdateSetPayload()`に、認可された経路で取得済みの1件の`sys_update_xml`を渡す。
このPoC自身は認証設定・ServiceNowクライアント・ネットワークを使わない。
取得時の既存ガード・ACLを省略するための経路として使わない。

必須メタデータはupdate_set_id、update_xml_sys_id、name、payload、取得日時、
レコード更新日時（不明ならnull）、instance_release、requested_rule_ids。
リリース情報は入力側が提供した証拠であり、PoCが実測したとは主張しない。
`release_evidence_caller_supplied`を常に記録し、矛盾したリリース情報は拒否する。

`record_update@table`、その直下の1件のレコード要素、sys_idを照合し、
`name=table_sys_id`との一致も必須とする。名前検索・先頭1件取得は行わない。
入力のUpdate Set所属情報そのものは外部取得経路の責任であり、この関数だけでは
特定インスタンスでの所属やACLを証明できない。

対応テーブルはsys_script、sys_script_client、sys_script_include、sys_ws_operation、
sysauto_script。今回抽出するコードフィールドはscriptのみ。許可する操作は
INSERT_OR_UPDATEで、DELETEや他の操作、script不在は理由付き拒否とする。
sys_scopeは32桁sys_id、global、未設定ならnullに正規化する。

payloadのUTF-8バイト列からpayload_hash、抽出コードからcode_hashをSHA-256で計算する。
現在の資産を追加取得・混合しない。取得時刻・レビュー時刻は入力のretrieved_atを使い、
記録時点のオフライン解析として扱う。payloadの不変性や現行版との一致は仮定しない。

## 3. XMLの安全性と上限

正規表現の既存SCA抽出器は流用せず、`saxes@5.0.1`のイベントパーサーを使用する。
DTDイベント・処理命令を即時拒否し、ENTITIESの追加や外部リゾルバーは実装しない。
名前空間付き要素/属性とxmlns宣言も拒否するため、XIncludeは使用できない。
外部スキーマの取得機能も有効にしない。XML宣言は1.0のみ許可する。

| 制約 | 上限 |
|---|---|
| payload | 2 MiB（UTF-8） |
| 深さ | 8。通常フィールドはroot→record→fieldの3階層。filter_conditionと許可補助レコードの下だけ入れ子を許可 |
| 要素数 | 2,048 |
| 全テキスト | 1 MiB（UTF-8） |
| script | 256 KiB（UTF-8） |
| AST走査 | 100,000ノード |
| 指摘候補 | 100件。超過は打ち切り成功でなく拒否 |
| ローカルCLI入力JSON | 3 MiB。通常ファイル・UTF-8のみ |

全入力上限はパーサーの属性・コメント等のバッファにも総量として作用する。
パースは4,096文字単位で行う。外部参照の試行・スクリプト実行は行わない。
表名と同じ本体レコードをちょうど1件必須とする。同じ封筒内の補助レコードは
`sys_translated_text`（actionが厳密に`delete_multiple`）と`sys_es_latest_script`のみ許可し、
順序にかかわらず中身を読み飛ばす。後者のactionは評価・実行しない。
未知の兄弟レコード・本体の重複・不在は拒否する。

本体フィールドは通常、単純テキスト/CDATAのみ。構造化フィールドの許可リストは
現在`filter_condition`だけで、その配下を読み飛ばす。scriptなど他フィールドでの
入れ子は引き続き拒否する。本体の全フィールド名の重複を拒否する。
読み飛ばす配下もXML妥当性、名前空間/処理命令拒否、深さ・要素数・テキスト量の
上限を検査する。そこにあるscript/sys_id/when等を本体のコード・識別子・設定には使わない。
未知の平坦なフィールドは解析・返却せず、構造と全体上限の検査のみ行う。

通常テキストはXML標準の5実体と有効な数値文字参照をパーサーが一度復号する。
CDATA内は文字どおりで、抽出後の再復号・trimをしない。
XML 1.0のCRLF/CRはLFになるが、数値参照`&#13;`はCRとして残る。
行番号はAcornの復号後コード上のJavaScript行番号で、XML全体の行番号ではない。
元XML位置への逆対応は未実装であり、コードのハッシュとフィールド位置を基準にする。

## 4. 構文候補の検証

`acorn@8.18.0`でECMAScript 2022のscriptとして解析する。実行・eval・動的importはしない。
ServiceNow固有の非標準構文や非対応構文は`javascript_parse_failed`で拒否し、
文字列検索だけの結果に黙ってフォールバックしない。

| 規則 | 今回確認する構文・設定 | 未確認事項 |
|---|---|---|
| AU-BR-001 | current.update()の呼び出し。空白や文字列リテラルのブラケット記法も対応 | currentの束縛、到達可能性、BR連鎖、setWorkflow等の例外、業務上の必要性 |
| AU-BR-002 | payloadのwhen=asyncで、本文のpreviousへのメンバーアクセスまたはchanges/changesTo/changesFrom呼び出し | previousの別名・単独受け渡し、動的プロパティ、呼出し元の束縛・実行経路 |
| AU-CL-004 | Client Script本文でgetXMLWaitの呼び出し | 受信側がGlideAjaxであること、UI制約・代替非同期処理の妥当性 |

whenはpayloadからのみ取得する。condition/filter_conditionを本文と混同しない。
AU-BR-002のwhenが不足・未知ならmissing_context。before/after/displayはこのasync候補に
該当しない。active=falseでも静的な候補は残し、inactive_assetを付ける。

上記は初期bp3-0.1の記録。現行経路は[BR互換修正](BEST_PRACTICE_BR_COMPATIBILITY.md)により
`async_always`と旧`async`をasync、`before_display`をdisplayとして扱う。
保存値`display`は現行経路では未知としてmissing_contextにする。旧エンジンは履歴再現専用。

APIを別名に代入した間接呼び出し・変数でのブラケット指定は追跡しない。
影響・脆弱性・実行パスの確認は未実施。すべてcandidate / low / infoで、
verification_evidenceは空。候補がないことを安全性の保証にしない。
根拠資料もcandidateのままであり、source_approval_pendingを外さない。

requested規則はすべてevaluatedまたはskippedに一度だけ記録する。
evaluatedは今回の構文候補検出の処理完了で、規則全体の適用検証完了ではない。
completedもこの宣言した候補検出範囲の完了のみを意味する。
不一致・不明リリースは全規則をrelease_mismatch/release_unknownでスキップし、指摘0件。
不正入力・抽出/構文解析失敗は`status=rejected`と固定のreasonだけを返し、
targetを捏造したレビューJSONを作らない。

## 5. 実行方法と返却ポリシー

```bash
bdo node --import tsx scripts/bp3-poc.ts --review examples/bp3-review-input.json
bdo npm test -- tests/review
```

[入力例](../examples/bp3-review-input.json)はすべて架空のID・コード・時刻。
PDIの取得証拠や実機検証結果ではない。
成功時は`{poc_only:true,status:"reviewed",result:...}`、拒否時は
`{poc_only:true,status:"rejected",reason:...}`。CLIの拒否はexit 1。
resultはBP-2構造契約と項目間検証を通し、ruleset_versionはbp3-0.1を使う。
BP-2のbp2-0.1結果は引き続き受け入れる。

本文は内部の抽出→AST解析にだけ使い、JSON出力・エラー・ログには含めない。
抜粋/full、AIへの送信、埋め込み・外部検索は未実装。
CLIも入力例もnpmパッケージには含めず、dist/review除外方針も維持する。
既存Update Set SCA・製品MCP・PDI設定には変更を加えない。

## 6. 検証記録（2026-10-17、初回実装）

| 検証 | 結果 |
|---|---|
| `bdo npm test -- tests/review` | 3ファイル・77件成功 |
| `bdo npm test` | 68ファイル・1,901件成功、失敗なし |
| `bdo npm run build` | 成功 |
| src/review・tests/reviewのESLint | エラー・警告なし |
| BP-3 CLIの単独TypeScriptチェック | 成功 |
| CLI合成入力例→結果契約検証 | 成功。2候補と1件のunsupportedを記録 |
| 不正/サイズ超過/不正UTF-8のCLI入力 | exit 1、入力内容とパスを非返却 |
| 配布JSON Schemaと生成元の同期 | テスト成功、BP-2例も互換性維持 |
| `npm ls acorn saxes` | 既存の間接依存を固定版の直接開発依存として認識 |
| ビルド後のnpm pack dry-run | 281ファイル、dist/reviewおよびbp3ファイルは0件 |
| `git diff --check` | 問題なし |

合成テストであるため、実PDIのpayload形式全体への互換性や違反確認済み件数を
示す結果ではない。ネットワーク照会・PDI操作・npm公開は実施していない。
検証コードには、コード文字列中のthrowやファイル書き込みが実行されないケースも含めた。

### 実データ構造への互換修正

ユーザーによる読み取り専用のPDI調査では、更新10件がnested_field、削除4件が
deleted_assetとなった。更新のfilter_conditionに計43個のitem、全10件に
sys_translated_text、5件にsys_es_latest_scriptが存在したとの報告を受けた。
こちらでは実コードを取得・コピーせず、同じ構造を持つ架空payloadで再現した。

filter_conditionの回帰ケースがnested_field、補助レコードの回帰ケースが
ambiguous_recordで失敗することをそれぞれ確認してから修正した。
本体以外のコード・設定の混入防止、補助レコードの前後順序、不許可の兄弟/action、
本体の重複/不在、scriptの入れ子、読み飛ばす箇所のXML/資源制限も検証対象とする。
互換修正後のPDI実データ再検証は以下のとおり実施済み。

| 互換修正後の検証 | 結果 |
|---|---|
| `bdo npm test -- tests/review` | 3ファイル・92件成功 |
| `bdo npm test` | 68ファイル・1,916件成功、失敗なし |
| `bdo npm run build` | 成功 |
| src/review・tests/reviewのESLint | エラー・警告なし |
| `git diff --check` | 問題なし |

### PDI実データの読み取り専用再検証（2026-10-17）

設定済み開発PDIで、sys_update_xmlの名前がsys_script_で始まるメタデータを
上限付きで取得し、sys_scriptと32桁sys_idに厳密一致するBRのみを対象にした。
メタデータ15件中BRは14件。列挙は上限未到達で完了し、14件すべてのpayloadを
取得できた。payloadは修正せずに抽出器へ渡し、成功したコードだけをAcornで解析した。

| 項目 | 結果 |
|---|---|
| BRの取得 | 14件、取得失敗0件 |
| 抽出成功 | 10件 |
| 想定した拒否 | deleted_asset: 4件 |
| 予期しない拒否 | 0件（nested_field / ambiguous_recordとも0件） |
| Acorn解析成功 | 抽出成功10件すべて |
| Acorn解析失敗 | 0件 |
| 抽出したwhenの内訳 | after: 10件 |

既存のServiceNowクライアントと設定を使用し、API側のACLを維持した。
通信ラッパーで対象PDIのsys_update_xmlへのGETとoauth_token.doへの認証POSTのみを
許可し、リダイレクトは拒否した。実際の通信はTable API GET 15回と認証POST 1回。
レコードへのPOST/PATCH/PUT/DELETE、スクリプト実行、設定や権限フラグの変更はない。
コード・payload・認証情報・レコード識別子は出力/保存せず、集計結果だけを記録した。

この結果は今回可視な14件の抽出互換性と構文解析の確認であり、コードの安全性、
候補の違反確定、実行経路・挙動の検証や全テーブルへの互換性を保証しない。

## 7. 残課題

- 根拠台帳の人による採用承認。自動で承認済みにはしない。
- 変数束縛・受信型・実行経路・例外条件を踏まえた候補検証と段階昇格。
- [BP-4初回評価](BEST_PRACTICE_BP4_EVALUATION.md)は合成48ケースで実施済み・品質目標未達。
  独立性の制約を残し、人による採点と改修後の未使用ケースでの再評価は未完了。
- 他規則・他コードフィールド・実際の取得済みpayloadによる互換性確認。
- sys_cluster_stateの最小列取得、ACL/取得上限・失敗を維持したBP-5のMCP統合。
- current_recordの明示モードとversion_drift、本文開示の別途承認契約。

今回のPoCは上記の安全抽出と3規則の構文候補検証まで。
PDI E2E、違反の実機確認、規則全体の検証を完了したとはしない。
