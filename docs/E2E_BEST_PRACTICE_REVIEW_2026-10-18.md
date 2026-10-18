# BP-5：PDI読み取り専用E2E（2026-10-18）

## 結論

`dev441827.service-now.com`（Australia）の既存Update Setに対し、登録済み
`review_update_set_best_practices`を既定20行・最大100行で呼び、**2件成功・1件スキップ・0失敗**。
最終実行の終了コード0、1ファイル/3件、8.43秒（各レビュー2.43秒/3.56秒）。
ベースソースは`eb7fb7a`、追加した読み取りE2Eと文書は未コミットの状態で検証した。

**確認できたのは登録ハンドラー→認証→リリース実測→metadata取得/分類→最終照合→worker集約→JSON返却である。**
対象のBR/Client Script更新は存在するが、選択する先頭100行の外にあった。このためpayload取得・XML/AST解析・
実コードに対する指摘/拒否・本文非返却の正例は今回の実機では未検証。スキップを成功数へ含めない。
指摘0は「問題なし」「全体レビュー済み」ではなく、今回の選択範囲で解析対象が無かった結果である。

## 対象・権限・安全境界

- 既存Update Set sys_id：`9055f6338c9503100a22deb6dd2b4ead`。名称は返却/記録しない。
- 認証は既存のウィザード設定からservice-accountを使用。資格情報・トークンを表示/保存しない。
- 権限付与・ACL変更・設定ファイル変更・レコード作成/更新/削除・BR実行・新規Update Set作成は行わない。
- WRITE_ENABLED/SCRIPTING_ENABLED/CMDB_WRITE_ENABLED/ATF_ENABLED/NOW_ASSIST_ENABLED、
  読み取りfixture/USEM fixtureフラグはすべてfalse。MCP_TOOL_PACKAGE=full。
- 通信ラッパーで、同じPDIへのsys_update_set/sys_update_xml/sys_cluster_stateのGETと
  OAuth認証の`POST /oauth_token.do`だけを許可する。その他のmethod/host/pathは送信前に拒否する。
- 本文・payload・資産名・生のAPI応答・例外stackは出力しない。要約は固定項目と件数だけを選んで記録する。
- 最終実行は実ユーザーの既存設定を読み取るが書き換えない。公開操作は検証範囲外。

## 結果

| 項目 | default20 | max100 |
|---|---:|---:|
| metadata_seen（上限検知用1行を含む） | 21 | 101 |
| selected | 20 | 100 |
| 対象外：asset_type_unsupported | 19 | 83 |
| 削除：deleted_asset | 1 | 17 |
| reviewed / findings | 0 / 0 | 0 / 0 |
| rejected / retrieval_failed | 0 / 0 | 0 / 0 |
| not_processed / result_omitted | 0 / 0 | 0 / 0 |
| metadata.truncated | true | true |
| analysis_complete | false | false |
| consistency | stable_observation | stable_observation |
| status / MCP isError | partial / false | partial / false |

metadata_seenはUpdate Setの総件数ではない。stable_observationは観測した親/一覧が終了時と一致したという意味で、
トランザクションsnapshotや不可視/上限外の資産の不変性を保証しない。

両方でリリース証拠はsource=sys_cluster_state.build_name、resolution_status=resolved、
family=Australia、release_match=matched。要求3規則にリリース由来の全体スキップは無い。
ただし解析資産0件なので「3規則を評価済み」と数えてはいけない。

共通limitations：

- source_approval_pending（規則/根拠の承認待ち）
- caller_acl_visible_only（既存service-accountに見える範囲）
- release_visible_nodes_only（リリースは可視ノードの実測のみ）
- metadata_truncated（最大100行でも後続あり）

errorsは空。拒否理由と未処理理由の件数は空であり、拒否動作を実機で踏んだという意味ではない。
対象外と削除はrejectedとは別の状態として上表の固定理由で確認した。

## 解析経路のスキップ理由

予備の本文なしmetadata照会では、対象prefixの可視レコード15件に対し、同じUpdate Setに
INSERT_OR_UPDATEの対象10件・DELETEの5件を確認した。自動選定のmetadata探索も最大100行に制限する。
実ツールの一覧は全資産種別をsys_id昇順で最大100行まで選ぶ契約なので、そこへ対象が入るとは限らない。

今回のスキップ名：
`exercises payload analysis only if the bounded selected slice contains eligible existing assets`

理由：`data outside bounded selection: no payload-eligible BR/Client Script in the first 100 metadata rows; payload analysis not exercised`

プラグイン不在や認証失敗として扱わず、**データは存在するが現在の取得上限/選択範囲外**と分類する。
上限を100より大きくしたり、対象だけを探すためにページを読み足したり、任意queryを追加したりはしていない。
別の小さい既存Update Set、または別途承認された取得設計/検証用データが必要となる。
小さいUpdate Setを作る/更新を移す等の書き込みを、この読み取り許可から推定して実施しない。

## 再現方法

```bash
bdo env RUN_E2E=true MCP_TOOL_PACKAGE=full \
  WRITE_ENABLED=false SCRIPTING_ENABLED=false CMDB_WRITE_ENABLED=false \
  ATF_ENABLED=false NOW_ASSIST_ENABLED=false \
  E2E_READ_FIXTURES=false USEM_E2E_FIXTURES=false \
  npx vitest run -c vitest.e2e.config.ts \
  tests/e2e/best-practice-review.e2e.test.ts --reporter=verbose
```

必要なら`BP5_E2E_UPDATE_SET_SYS_ID=<既存sys_id>`で同じ対象を指定する。未指定時は本文なしの
bounded metadata探索から既存候補を選ぶ。対象データが無ければ理由付きスキップであり、成功扱いにはしない。

各レビューのテストtimeoutは75秒だが、ツールの全体60秒/内部50・55秒を延長しない。
テストハンドラーを直接呼んで実PDI HTTPSへ到達する方式で、今回stdio/HTTPの外部待受transportは起動しない。

最終実行の通信内訳：OAuth POST 3、sys_update_xml GET 5（探索1＋初回/終了一覧4）、
sys_update_set GET 4、sys_cluster_state GET 2。合計14要求、ガード違反0。
payload詳細GETは0、レコード書き込み要求0。予備調査・先行試行も同じ読み取り境界だけで実施した。

## テスト整備・その他の検証

- 最初の試行はVitestのit.eachがcontextを第2引数へ渡さないため停止。PDI要求0。
  通常のitごとのcontextへ変更して修正した。
- 次の試行では有効なpartial JSONが2件返ったが、両方にreviewed>0を要求して失敗した。
  制限を緩めたり製品コードを変えたりせず、取得/分類の2ケースと、独立した解析ケースを分けた。
  後者は理由付きスキップとして残し、実機解析の成功へ付け替えていない。
- 最終ソースで対象E2Eは上記2成功/1スキップ。全体の既存PDI E2Eは再実行していない。
- `bdo npm test`：98ファイル、2,421件成功。通常テストから実機E2Eは除外したまま。
- `bdo npm run type-check`と新規E2EのESLint（エラー/警告0）：成功。
- 製品コード、1件/集約契約、固定評価セット、package/lockは変更なし。

残課題はpayload取得以後の読み取り実機E2E、実機の拒否/一部失敗・期限/容量の境界、per-user/運用者設定の経路、
他環境/最小権限、規則の人による承認と独立品質評価である。既存の合成試験と実機未到達の範囲を混同しない。
