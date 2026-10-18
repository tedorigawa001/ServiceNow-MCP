# BP-5：opt-in対象選択・0.3 JSONのPDI読み取り専用E2E

Date: 2026-10-18 / ベース実装：`77bdd67`。

## 1. 結論

`dev441827.service-now.com`（Australia）の既存Update Set
`9055f6338c9503100a22deb6dd2b4ead`を使い、**5成功・0スキップ・0失敗**。
最終実行は1ファイル・5件、20.96秒、終了コード0。
登録ハンドラー→認証→実測リリースゲート→固定候補選択→payload取得→XML/AST解析→worker集約→
0.3 JSON検証まで到達した。製品コードは変更せず、E2Eテストと文書を更新した。

省略時の0.2では従来どおり先頭100行に解析対象がなく、opt-inでは既定20行でも既存BR10件を解析できた。
[前回の2成功・1スキップ](E2E_BEST_PRACTICE_REVIEW_2026-10-18.md)は履歴として維持し、今回の結果へ上書きしない。
今回の5成功は2つの省略時呼出し、2つのopt-in呼出し、取得済み結果による解析到達確認1件の内訳で、
独立したUpdate Setを5件レビューした意味ではない。

## 2. 安全境界

- 既存ウィザード設定のdev / service-accountを使用。資格情報・トークン・設定の中身を表示しない。
- 期待hostを明示し、不一致なら通信前に停止。通信ガードは同一PDIの
  sys_update_set / sys_update_xml / sys_cluster_stateへのGETとOAuthのPOST /oauth_token.doだけを許可。
- WRITE_ENABLED / SCRIPTING_ENABLED / CMDB_WRITE_ENABLED / ATF_ENABLED / NOW_ASSIST_ENABLED、
  E2E_READ_FIXTURES / USEM_E2E_FIXTURESはfalse。MCP_TOOL_PACKAGE=full。
- レコード作成・更新・削除、ACL/ロール・設定変更、スクリプト実行、検証データ作成は行わない。
- コード本文・payload・資産名・原応答・資格情報は表示/保存しない。本文はプロセス内で解析し、
  出力は列挙値・固定フィールド・件数・応答量・所要時間だけの要約に限定する。
- 実機の破壊的操作や失敗注入は行わない。公開・Pushは検証対象外。

## 3. 結果

| 項目 | 省略・20 | 省略・100 | opt-in・20 | opt-in・100 |
|---|---:|---:|---:|---:|
| schema_version末尾 | 0.2 | 0.2 | 0.3 | 0.3 |
| metadata_seen | 21 | 101 | 10 | 10 |
| selected | 20 | 100 | 10 | 10 |
| not_applicable | 19 | 83 | 0 | 0 |
| skipped_deleted | 1 | 17 | 0 | 0 |
| reviewed | 0 | 0 | 10 | 10 |
| findings | 0 | 0 | 0 | 0 |
| rejected / retrieval_failed | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| not_processed / result_omitted | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| truncated | true | true | false | false |
| analysis_complete | false | false | true | true |
| 集約内duration_ms | 3,420 | 2,981 | 7,542 | 6,366 |
| escaped MCP応答バイト | 4,644 | 16,360 | 20,300 | 20,301 |

全ケースstatus=partial、MCP isError=false、consistency=stable_observation、errors=[]。
source=sys_cluster_state.build_name、resolution_status=resolved、family=Australia、release_match=matched。
同じ接続先binding・リリースで、集約/入れ子の由来・件数・予算等のランタイム契約検証に成功した。
max_recordsは20/100を維持し、lookaheadを含むmetadata_seenはそれぞれN+1以内。
各呼出しは全体60秒以内、MCP応答は256KiB以内。限界までの負荷試験ではない。

### 3.1. 実際に評価した規則・資産

opt-inの各呼出しでbusiness_rule=10、client_script=0。
入れ子のevaluated_rule_idsを集計すると、AU-BR-001が10資産、AU-BR-002が10資産。
入れ子の規則スキップは0、指摘は0。AU-CL-004は要求配列にあるが、対象Client Scriptが無いため
**今回このPDI E2Eで評価済みとは数えない**。当該Update Setの0.3解析10件は両呼出しで重複する。

0.2の0指摘は解析0件の結果、0.3の0指摘は今回の10資産・適用規則の候補検出結果であり、意味が異なる。
どちらも「安全」「全Update Setで問題なし」「脆弱性なし」「規則の品質承認済み」とは報告しない。

## 4. 0.3の制限と拒否理由

selection.mode=review_targets、filter_version=target-prefix-0.1、
requested_asset_types=[business_rule,client_script]、action_scope=insert_or_update_only、order=sys_id_asc。
excluded_countsのunsupported_assets / deleted_assets / other_actionsはすべてnull。
候補から除外した総件数を別照会で数えず、0へ置き換えていない。

coverage.analysis_scope=selected_candidate_window、candidate_inventory_complete=false、
update_set_inventory_complete=false。analysis_complete=trueは選択した10件の機械的な解析完了だけ。
truncated=falseでも、ACL前limit・粗い候補条件・可視性の制約により全対象取得の証明にはならない。
stable_observationも、観測した親・有限候補窓の一致だけで、トランザクションsnapshotではない。

opt-in共通limitations：

- source_approval_pending
- caller_acl_visible_only
- release_visible_nodes_only
- target_candidate_filter_only
- non_candidate_counts_not_collected
- acl_pre_limit_inventory_unknown
- whole_update_set_not_reviewed

省略時のlimitationsは従来の最初の3項目とmetadata_truncated。
reject/未処理/規則スキップの理由別件数は空であり、今回それらの拒否分岐を実機で踏んだという意味ではない。
0.2の対象外はasset_type_unsupported（19/83件）、削除はdeleted_asset（1/17件）で、rejectedとは区別した。

## 5. 再現と通信量

```bash
bdo env RUN_E2E=true MCP_TOOL_PACKAGE=full \
  WRITE_ENABLED=false SCRIPTING_ENABLED=false CMDB_WRITE_ENABLED=false \
  ATF_ENABLED=false NOW_ASSIST_ENABLED=false \
  E2E_READ_FIXTURES=false USEM_E2E_FIXTURES=false \
  BP5_E2E_EXPECTED_HOST=dev441827.service-now.com \
  BP5_E2E_UPDATE_SET_SYS_ID=9055f6338c9503100a22deb6dd2b4ead \
  npx vitest run -c vitest.e2e.config.ts \
  tests/e2e/best-practice-review.e2e.test.ts --reporter=verbose
```

既存IDを明示したため、今回のmetadata自動探索は0回。テストtimeout75秒は製品の全体60秒を変更しない。
外部待受stdio/HTTP transportではなく、handleCallTool→実PDI HTTPSを通す。

最終実行はOAuth POST 4、親GET 8、リリースGET 4、metadata GET 8、payload GET 20、合計44要求。
payload20回は同じBR10件をopt-inの2呼出しで読み取った内訳。送信ガード違反0、業務レコード書き込み0。
その前に同じ読み取り境界で5成功/0スキップの先行実行を1回行い、資産種別・評価規則・時間・応答量の
固定要約を追加して最終実行した。先行実行も44要求で、今回の実行合計88要求。本文の表示/保存はしていない。

## 6. 検証範囲と残課題

最新ソースでの確認：

- 対象E2E：5成功・0スキップ・0失敗（20.96秒）。
- `bdo npm run type-check`：成功。
- 対象E2EファイルのESLint（`--max-warnings 0`）：エラー/警告0。
- `bdo npm test`：99ファイル・2,456件成功。実機E2Eは通常テストから除外したまま。
- ローカル文書参照・JSON例の構文と`git diff --check`を確認。

実機のClient Script正例、候補指摘の正例、拒否/一部失敗、期限/容量超過、per-user、
運用者設定フォールバック、最小権限や他環境のE2Eは今回確認していない。
後続の[Client Script探索](E2E_BEST_PRACTICE_CLIENT_SCRIPT_2026-10-18.md)でも既存候補を発見できず、
AU-CL-004は0成功・1理由付きスキップ。BRの5成功へ加算しない。
規則の人による承認・独立した品質評価は引き続き未実施。全体E2Eは再実行していない。
製品コード・固定評価セット・依存・接続設定は変更しない。
