# 非200 HTTP 純粋分類契約・独立oracle検証

Date: 2026-10-31。開発専用の純粋分類のみ。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実通信・実機操作・設定変更・Pushは行わない。

## 範囲

purpose×status×body_presentのstrictな3項目から、legacy HTTP分岐と承認前提案の候補を返す。観測元はunverified_input、kindはclassification_only。200もschema／ack候補にすぎず、7種類のpermissionsは全入力でfalse。承認番号は関連設計の参照であって承認済みの印ではない。

runtime・MCP・session／bootstrap／native／source・fake transcriptは接続しない。既存の開発専用梱包除外を使い、package.json／依存は変更していない。

## RED／GREENと契約の具体化

1. release403のtracer追加時はmodule未実装でRED。実装後GREENを確認した。
2. 200＋bodyを「受理でない候補」とする試験でRED→GREENを確認した。
3. 独立oracleのrelease503＋no_bodyを選択実行しRED、その後全3,000組でGREENを確認した。この選択RED時の他ケースskipはテスト名による選択であり、最終の全件照合とは区別する。
4. 契約具体化時、body不在のlegacy body処理はcancelしたと記述せずnoneとした。auth／parentの404はlocal候補であり、分類器がrun primaryを固定するとは記述しない。

## 独立性と限界

oracleは製品のenum・helper・判定結果をimportせず、dense table＋範囲／手書き行の上書きで期待値を作る。製品側の条件分岐とロジックを共有しない。全3,000 tupleの総数・重複・6層各500件も検査し、表の欠落で無比較成功にならないようにした。

同じAIによる実装と表であり、独立した人による採点や未使用ブラインド評価ではない。一致率を実HTTP・cleanup／retry実行の正当性やセキュリティ事故防止効果として主張しない。NH-01〜NH-20の操作／終端受入試験とA01〜A07の承認は完了していない。

## 検証

- 新規単体：3,000 tuple＋47件のtracer／入力拒否／不変性・表coverage確認、計3,047件成功。
- 不正入力にはgetter／proxy／revoked proxy／独自prototype、欠落・symbol・未知key、数値／boolのcoercion、approval／enabledの注入を含む。入力・例外文字列をechoしない。
- compiled単独試験はfetch／Response／Streams／setTimeoutを禁止し、3,000組を実行する。
- 梱包試験はclassifierのJS／map／型宣言・fixture／oracleが非同梱であることと、pack内runtime JSがclassifierを参照しないことを確認する。

### 最終結果

| 確認 | 結果 |
|---|---|
| build | `npm run build`成功 |
| 新規分類試験 | 3,047件成功。3,000 tuple全照合はskipなし |
| 全体合成 | `vitest run --maxWorkers=3`：196ファイル・8,925件成功、29.61秒。失敗・skipなし |
| 新規TS3ファイルのlint | エラー・警告0 |
| 全体lint（quiet） | エラー0。警告数は再集計していない |
| compiled純粋分類 | 3,000組成功。fetch／Response／Streams／timerを禁止して実行 |
| 梱包境界 | 409ファイル。classifierの4artifact・fixture／oracleは非同梱、pack内runtime JSの依存なし |
| 既存compiled／梱包 | CM-01／02／03／04-01／04-02／04-03、NA-02／03すべて成功 |
| 文書参照・ID | 更新5文書のローカル参照74件、NH行20・承認行7の重複なし。fence／行末空白も確認 |
| diff whitespace | 問題なし |

runtime挙動を変えるソース・既存試験・package設定・固定評価セットは変更していない。今回追加したclassifierは開発専用の新規moduleのみで、承認・証拠・実行権限を発行しない。製品・試験の期限は緩めていない。最終確認後の変更は本記録の結果追記のみ。`.vscode/`・`CLAUDE.md`は変更していない。

### コミット対象だけの再検証

Git indexの今回分11ファイル＋HEADから独立copyを作り、既存node_modulesだけを参照して再実行した。無関係な作業中ファイルはcopyに含めていない。

- build成功、全体lint（quiet）エラー0。
- 全体合成：196ファイル・8,925件成功、30.95秒。失敗・skipなし。期限は変更していない。
- compiled純粋分類3,000組成功。classifier／oracle／fixtureの非同梱とruntime未接続を確認。offline packは409ファイル。
- 既存CM-01／02／03／04-01／04-02／04-03、NA-02／03のcompiled／梱包確認も成功。
- 文書ローカル参照74件、NH行20・承認行7、Markdownとstaged diffのwhitespace確認で問題なし。
- この再検証後の追記は本記録だけで、実装・試験・承認状態は変更していない。

## 次段階

型付きstatus-only終端／cancel-only cleanupは未実装。retryの局所状態、共有budget・clock、source fallback、final予約移譲、実transport／正式発行も未接続。本分類結果やそのcopyを証拠・承認・permitとして受理する口は追加しない。
