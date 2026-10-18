# BP-5：非アクティブClient Script E2E・バージョン履歴保持

Date: 2026-10-18 / ベース：`005f5c8`。製品コード・固定評価セット・依存は変更していない。

## 1. 現在の結論

ユーザー承認により、**バージョン履歴は保持し、削除対象は今回作成したClient Script・Update Set・
Customer Updateだけ**とする契約に変更した。修正後のPDI E2Eは**1成功・0スキップ・0失敗**。
AU-CL-004を1件評価し、候補1件・必須確認項目・inactive_assetを0.3 JSONで確認した。
今回のClient Script・Update Set各1件とCustomer Update 2件は削除後GET 0件。
今回の履歴2件と初回の履歴2件は意図して保持する。履歴のDELETE要求は今回0件。
結果のpartialはPoC・対象候補ウィンドウ限定等の制限を示し、取得失敗ではない。詳細は§7。

### 初回試行の経緯（失敗記録を維持）

専用Update Setと非アクティブClient Scriptを1件ずつ作成したが、fixtureの保存値確認で停止し、
**AU-CL-004のMCPレビューには未到達**。今回のfixture E2Eは1失敗であり、実機評価成功へ数えない。
元のClient Script、検証用Update Set、今回のCustomer Updateは削除済みで、後続GETで各0件を確認した。
一方、**今回生成されたsys_update_version 2件が残存**し、通常DELETEはHTTP 403で拒否される。
完全クリーンアップ未完了のため新規作成・再試行を停止した。ACL・ロール変更や別権限への代替はしていない。

この記録は[既存Client Script探索での1スキップ](E2E_BEST_PRACTICE_CLIENT_SCRIPT_2026-10-18.md)の後続。
前回の既存データ不足と、今回のfixture安全検査・クリーンアップ失敗を区別する。

## 2. 作成・安全境界

- 対象：dev441827.service-now.com。既存のdev / service-account接続。
- ユーザーから今回の検証データ作成・削除の承認を得て実施した。
- 個別のBP5_CLIENT_WRITE_FIXTURES=true、WRITE_ENABLED=true、SCRIPTING_ENABLED=trueを必須にし、
  このfixtureテスト1ファイルだけを選択して実行した。他の書き込みE2Eは実行しない。
- Update Setはin progress、is_default=false。現在のUpdate Set・ユーザー設定は切り替えていない。
- Client Scriptはincident用onLoad、active=false、Globalとして作成。同期Ajax検出用の合成コードを格納したが、
  アクティブ化・フォーム表示・GlideAjaxの実行・Script Include作成はしていない。
- sys_update_xml.payloadは手作業で生成・書換えしない。ネイティブに生成された今回のCustomer Updateの
  update_set参照だけを専用セットへ移す予定だったが、初回はそのPATCHより前に停止した。
- 原応答・コード本文・資格情報は出力しない。作成ID・固定理由・bool・件数だけを表示する。
- HTTPガードは同一PDIの限定テーブルだけを許可。POSTは専用マーカー・非活性・非defaultを確認し、
  PATCH/DELETEは追跡した今回分のIDだけ。現在セット・ACL等への書き込みは拒否する。

## 3. 作成したIDと削除結果

| テーブル | sys_id | 最後の観測 |
|---|---|---|
| sys_update_set | `808ee97c8300971880355160ceaad3e6` | 削除済み、GET 0件 |
| sys_script_client | `548e2d7c8300971880355160ceaad311` | 削除済み、GET 0件 |
| sys_update_xml | `d88e2d7c8300971880355160ceaad34e` | 削除済み、GET 0件 |
| sys_update_version | `548e2d7c8300971880355160ceaad34f` | **残存、state=previous、DELETE 403** |
| sys_update_version | `b08e2d7c8300971880355160ceaad3e8` | **残存、state=current、DELETE 403** |

残存2件のnameは、削除した今回のClient Script IDに対応することを照合した。
既存資産の履歴・他のUpdate Set・無関係なIDは削除しない。
バージョン本文をプロセス内で読み、active=false / scope=global / 名前長40だけを固定要約で確認した。
本文・実際の名前は表示しない。これはAU-CL-004の解析ではなく、停止原因・安全性の確認である。

## 4. 停止原因とローカル修正

初回の検証マーカーは47文字。保存された履歴内の名前は40文字で、元のマーカーと不一致だった。
active=falseとscope=globalは履歴から確認できた。したがって非活性検査と同じ条件式に含めた
名前の一致検査が成立せず、native snapshotの関連付け・MCP呼出しより前に停止した。
初回の固定エラー名は非活性不一致も含む汎用名で、さらにcleanup失敗が元の失敗を覆っていた。

初回停止後、以下をローカル修正した。その後の実機再作成は§7を参照。

- マーカーを38文字に短縮（UUIDは省略しない）。40文字で保存される合成HTTP境界を追加し、
  失敗を再現してから短縮後の成功を確認した。
- active/name/scopeの保存値検査を別の固定エラーに分離。本文なしのbool診断を追加した。
- cleanupの前に固定の失敗理由を記録し、元の失敗を失わないようにした。
- 当初はsys_update_versionの削除可否の確認ゲートを置いたが、保持方針の承認後に
  BP5_VERSION_HISTORY_POLICY=retainへ置換した。履歴の削除権限は要求しない。

## 5. 実機試行の内訳

1. fixture作成・検証・cleanup：1失敗、13.23秒。元データ3種は削除されたがversion削除が拒否された。
   26要求。sys_update_xmlへのPATCH、MCPレビュー呼出しは0回。
2. 今回のversion 2 IDだけを照合して通常DELETEを再確認：1失敗、3.55秒。
   両方HTTP 403 / INSUFFICIENT_PRIVILEGES。7要求。再度の新規作成は行わない。
3. 読み取り専用の残存確認：1成功、3.43秒。元データ0件・version 2件を確認。6要求。
4. 名前長と保存値の読み取り診断：1成功、4.51秒。40文字・active=false・globalを確認。6要求。

合計45要求。3/4は**残存状態の確認成功**であり、fixtureレビューや完全cleanupの成功ではない。
初回の通信ガード違反0。コード本文の表示0。version削除の403後は追加の書き込みをしていない。

## 6. テストと保持契約

追加したテスト：

- `tests/e2e/bp5-client-fixture.ts`：所有IDの追跡、native capture確認、限定PATCH、cleanup、残存検証。
- `tests/e2e/best-practice-client-fixture.e2e.test.ts`：作成→AU-CL-004の0.3評価→finally cleanup。
  作成前に保持方針の明示を要求。履歴は削除リスト・削除後0件検査から除外し、保持IDを別に返す。
- `tests/e2e/best-practice-client-recovery.e2e.test.ts`：初回固定IDに限る読み取り専用検査。
  BP5_FIXTURE_RECOVERY=inspectだけを受け付け、履歴のpayloadも取得しない。削除モードは廃止。
- `tests/review/client-fixture.test.ts`：合成HTTPで所有物cleanup、曖昧なPOST回収、native capture無し、
  未所有ID/アクティブ化拒否、他者の子レコードによるcascade削除拒否、40文字境界、保持方針ゲートを検証。
  履歴のPOST/PATCH/DELETEは通信前に拒否し、曖昧なPOSTからの回復時も履歴を保持する。

ローカル確認：

- fixture合成テスト：7件成功。保持契約変更は旧ゲートでの7失敗を確認後、修正して7成功。
- `bdo npm test`：100ファイル・2,463件成功（実機E2Eは含めない）。
- `bdo npm run type-check`：成功。
- 追加4ファイルのESLint（`--max-warnings 0`）：エラー/警告0。
- 文書リンク・`git diff --check`を確認。

これらのローカル成功と、§7の実機成功は別に記録する。独立した品質評価ではない。

## 7. 保持方針承認後のPDI再実行

2026-10-18 JST、dev441827、既存dev service-accountで実施。
WRITE_ENABLED/SCRIPTING_ENABLED/BP5_CLIENT_WRITE_FIXTURES=true、
BP5_VERSION_HISTORY_POLICY=retain、BP5_E2E_EXPECTED_HOSTを固定。他の書き込みE2Eは実行しない。

| 項目 | 観測結果 |
|---|---|
| fixture E2E | 1成功、13.791秒（Vitest全体14.25秒） |
| MCP引数 | review_targets、AU-CL-004、max_records=20 |
| JSON | bp-mcp-review-0.3、partial、release_match=matched、code_return_mode=none |
| 取得/解析 | metadata_seen=1、selected=1、reviewed=1、findings=1 |
| 拒否/失敗/未処理 | rejected=0、retrieval_failed=0、not_processed=0、errors=[] |
| 完了範囲 | analysis_complete=true（selected_candidate_window内のみ）、両inventory_complete=false |
| 整合性 | stable_observation |
| 時間/出力量 | MCP処理2,301ms、応答5,185bytes |
| 確認項目 | source_approval / binding_and_reachability / exceptions_and_business_intent / synchronous_ajax_review |
| 制限 | inactive_asset、根拠承認待ち、実行経路未確認、関数間解析なし、限定的定数評価、ACL可視範囲、全Update Set未評価等 |

作成・後処理したID：

| テーブル | sys_id | 結果 |
|---|---|---|
| sys_update_set | `0e01f9b48340971880355160ceaad341` | 削除後GET 0件 |
| sys_script_client | `4601f9b48340971880355160ceaad384` | active=false / scope=global確認、削除後GET 0件 |
| sys_update_xml | `8601f9b48340971880355160ceaad387` | ネイティブ更新、専用セットへ参照移動、削除後GET 0件 |
| sys_update_xml | `eb013db48340971880355160ceaad3cb` | 元資産の削除に伴うネイティブ生成分も削除後GET 0件 |
| sys_update_version | `0201f9b48340971880355160ceaad388` | 保持（削除対象外） |
| sys_update_version | `a7013db48340971880355160ceaad3cc` | 保持（削除対象外） |

HTTP計32要求：OAuth POST 1、GET 24、fixture POST 2、Customer Update参照PATCH 1、
DELETE 4（Client Script 1、Customer Update 2、Update Set 1）。履歴DELETE 0、ガード違反0。
現在のUpdate Set切替0、手製payload 0、コード本文表示0。検査対象スクリプトは実行していない。

初回分の読み取り専用監査も1成功・2.757秒（全体2.91秒）。OAuth 1＋メタデータGET 5の6要求で、
初回の履歴2件が残り、初回の元データ3種が0件であることを再確認した。payload取得・DELETEは0。

履歴DELETEの再試行、ACL/ロール変更、保護機能の無効化、管理者への自動切替は行わない。
「全データ削除済み」とは報告しない。履歴には検証用コードが残るため、運用上の履歴保管・アクセス制御に従う。
これは非アクティブ合成資産のMCP解析正例であり、実行時のUI制約、全拒否分岐、人による規則承認、
独立した検出品質を検証したものではない。既存データ探索の理由付きスキップも成功へ付け替えない。
