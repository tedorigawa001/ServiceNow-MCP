# BP-5：既存Client Script Update Set探索とAU-CL-004 E2E未到達

Date: 2026-10-18 / ベース実装：`158eca0`。

## 1. 結論

`dev441827.service-now.com`（Australia）の既存データを読み取り専用で探索したが、
対象Client Script更新を含むUpdate Set候補は0件だった。
**AU-CL-004の実機E2Eは0成功・1スキップ・0失敗で、payload取得・解析・0.3 JSON確認には未到達**。
最終実行は1ファイル・1テスト、3.36秒、終了コード0。終了コード0やVitestのファイル成功表示を
AU-CL-004の評価成功へ読み替えない。

[BRの対象選択E2E](E2E_BEST_PRACTICE_TARGET_SELECTION_2026-10-18.md)のBR10件解析と、
Client Scriptの未確認は別の状態である。今回も現行資産への代替、Update Set作成・更新登録は行わない。

## 2. 探索条件と観測結果

探索対象はsys_update_xmlのmetadataだけ。要求fieldsは
`sys_id,update_set,name,action,type`、各照会limit=101、offset=0、no_count=true。
表示値・reference linkは要求しない。各照会の先頭100行までを候補選定へ使い、101行目は上限確認のみ。
候補には厳密な`sys_script_client_<小文字hex32桁>`名、INSERT_OR_UPDATE、有効な親sys_idを必要とする。

| 照会 | 固定query（URL符号化前） | 返却行 | 候補行 |
|---|---|---:|---:|
| 更新候補 | `action=INSERT_OR_UPDATE^nameSTARTSWITHsys_script_client_^ORDERBYDESCsys_updated_on^ORDERBYsys_id` | 0 | 0 |
| 削除等を含む補助照会 | `nameSTARTSWITHsys_script_client_^ORDERBYDESCsys_updated_on^ORDERBYsys_id` | 0 | 0 |
| 表示種別の補助照会 | `type=Client Script^action=INSERT_OR_UPDATE^ORDERBYDESCsys_updated_on^ORDERBYsys_id` | 0 | 0 |

2つ目でも0件なので、今回見える範囲では「更新がなく削除だけ存在した」という観測も無い。
3つ目のtypeは探索のヒントだけで、識別の証明や正規名を満たさない資産へのレビュー許可には使わない。
表示種別はローカライズ等の制約があり、この照会だけで不存在を判断しない。

探索は最大3照会・各101行、全体15秒・1要求5秒の独立したbounded sessionで実施する。
受信量・試行数は同じsessionの予算へ加算する。MCP製品の選択枠を広げたり、候補が出るまで
ページを追加したりする機能ではない。最大3照会で打ち切り、今回は合計0行だった。

Table APIのlimitはACL前に適用されるため、空応答からインスタンス全体の不存在は証明できない。
不可視レコード・特殊な命名・表示種別差等は残る。認証失敗・プラグイン不足・テーブル不存在とは断定しない。
現在のClient Scriptテーブルにコードが存在しても、Update Set payloadの実機検証の代わりにはならない。

## 3. 安全境界と通信

- 既存のdev / service-account設定を使用し、期待hostをdev441827.service-now.comへ固定する。
- 同一PDIへのsys_update_set / sys_update_xml / sys_cluster_stateのGETとOAuth POSTだけを許可する。
  その他のhost/method/pathは送信前に拒否する。
- 書き込み・scripting・CMDB/ATF/Now Assist・fixture関連のフラグはすべてfalse。
- レコード作成/更新/削除、設定変更、権限変更、スクリプト実行、検証データ作成は行わない。
- コード本文・payload・資産名・資格情報・原応答・例外stackは表示/保存しない。
  出力は探索件数・理由・固定識別子・HTTP統計の要約だけ。

最終実行：OAuth POST 1、sys_update_xml metadata GET 3、合計4要求。
受信1,019バイト（認証応答を含む）、payloadバイト0、通信ガード違反0、業務レコード書き込み0。
最初は更新候補の1照会だけを試し、0件で1スキップ（2.21秒、認証込み2要求・受信993バイト）。
その後、上記補助照会を加えて最終実行した。両実行の合計6要求で、payload GETは0。

## 4. E2Eの整備とスキップ理由

`tests/e2e/best-practice-client-script.e2e.test.ts`を追加した。
既存候補がある場合は親ID単位の候補数で選び、次を実ハンドラーへ渡す。

```json
{
  "update_set_sys_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "selection_mode": "review_targets",
  "requested_rule_ids": ["AU-CL-004"],
  "max_records": 100
}
```

上記IDは引数形式の合成例であり、今回発見したIDではない。
実際には候補が0件だったため、このMCP呼出しは行われていない。
候補が得られた場合は0.3のランタイム契約、Client Scriptのevaluated_rule_idsにAU-CL-004があること、
時間・件数・MCP応答量・制限を確認し、本文なしの固定項目だけを記録する。

スキップ理由：

`data missing in bounded discovery: no visible Client Script INSERT_OR_UPDATE linked to an existing Update Set; no records created`

分類は**既存検証データをbounded探索で発見できない**。候補0件を空の成功結果で代用しない。
実際の受信・認証・構文エラーはスキップへ変換せず、固定の失敗として扱う。

## 5. 再現

```bash
bdo env RUN_E2E=true MCP_TOOL_PACKAGE=full \
  WRITE_ENABLED=false SCRIPTING_ENABLED=false CMDB_WRITE_ENABLED=false \
  ATF_ENABLED=false NOW_ASSIST_ENABLED=false \
  E2E_READ_FIXTURES=false USEM_E2E_FIXTURES=false \
  BP5_E2E_EXPECTED_HOST=dev441827.service-now.com \
  npx vitest run -c vitest.e2e.config.ts \
  tests/e2e/best-practice-client-script.e2e.test.ts --reporter=verbose
```

既存対象のIDが別途分かった場合は`BP5_CLIENT_E2E_UPDATE_SET_SYS_ID=<既存sys_id>`を指定して
探索を省き、同じ読み取りE2Eを実行できる。IDの指定は新規データ作成の許可ではない。
未存在/不可視・解析失敗・AU-CL-004未評価なら、そのまま成功にしない。

## 6. ローカル確認と残課題

ローカル確認：

- `bdo npm run type-check`：成功。
- 対象E2EファイルのESLint（`--max-warnings 0`）：エラー/警告0。
- `bdo npm test`：99ファイル・2,456件成功。実機E2Eは通常テストから除外したまま。
- 文書リンク・JSON例構文・`git diff --check`：成功。

製品実装、固定評価セット、依存、設定は変更していない。全体実機E2Eは再実行していない。
AU-CL-004の実機解析・指摘正例・拒否分岐・UI制約の検証は未完了のまま残す。
次に必要なのは、読み取り可能なClient Script更新を含む**既存**Update Setの特定である。
新規データ作成を行う場合は、今回の読み取り許可とは別に明示的な承認が必要。

後続で承認を得た[fixture作成試行](E2E_BEST_PRACTICE_CLIENT_FIXTURE_2026-10-18.md)は、名前の保存値検査と
version削除権限で停止した。その後、履歴を削除対象外とする承認を得て再実行し、
非アクティブ合成Client ScriptでAU-CL-004の候補1件を0.3 JSONで確認した（1成功）。
Client Script・Update Set・Customer Updateは削除済み、履歴は保持する。
本記録の既存データ探索1スキップは維持し、後続fixtureの成功とは混ぜない。
