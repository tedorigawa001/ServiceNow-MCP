# CM-04-03 private parent／release ack 合成検証

Date: 2026-10-31。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実通信・実機操作・設定変更・Pushは実施しない。

## 実装

同じ新規固定入口の省略時CM-04-02互換を維持し、明示的なdata-only synthetic_ioだけを非同期継続へ接続した。固定200・2／3個のbyte列からin-memory native Response／Streamsを作り、既存のcleanup・JSON／hash・一度限りackを利用する。認証snapshot・登録済みlease・core C/G・ready世代・初期source identityは同一runのものだけを使う。

source constructorへのprivate生成keyと不変ESM friend検査、run-local opaque ack、parent→release順序を用い、実sourceの既存C方式release判定・private permit／owner bindingまで接続した。公開GET／readParent／resolveReleaseへの循環や、fixture台帳の共有はない。公開summaryを再提出して継続・再openする口もない。

成功はfake_io付きprepared_onlyの限定copyのみ。正式body／payload／worker／sealを発行せず、通常MCP／client／adapter／R-2の既存経路を切り替えない。非200とfinal予約移譲は未対応として維持する。

## RED／GREEN・開発中の失敗

- 初回tracerはsynthetic_io未対応のinvalid_inputで失敗。接続後、同じbyte長の独立合算でC=2／G一致／P=0と、実sourceのAustralia判定・閉鎖を確認した。
- Node StreamsとDOM BodyInitの宣言の差でTS2345が発生。型castで証拠を代用せず、同じglobal native constructorをpinし、既存adapterのruntime native brand検査も維持してbuildを再確認した。
- 非正規purpose列の試験は当初、同期throwを期待したのに非同期invalid_inputとなり、未処理rejectionも報告された。transcript自体の固定2／3行grammarを生成前に検査する形へ揃え、再試験では失敗・未処理rejectionなし。release観測のparameterized試験も配列をobjectで包み、複数node／sentinelの行全体を渡すよう訂正した。
- callbackを受け入れるtransportは作らず、差替え可能なstatic verifierも採用しない。既存sessionと推測key／raw値からconsumerを取得できない負の対照を追加した。

## 確認対象

同bytes課金・caller buffer変更、per-user／有効cache／合成OAuth、token不正、親target／schema／UTF8／JSON不正、unknown／mismatched／複数node競合／21件、C方式の空200 fallbackと設定競合、内部node情報の非出力、実owner binding省略の拒否、取消・hard deadline等号・低減C/G上限、再利用／foreign consumer拒否、timer／admission解放・秘密非出力。低位のack再利用／cleanup拒否試験は既存NA／RT-B03群を併走し、テストのための実consumer getterは追加しない。

## 最終結果

| 確認 | 結果 |
|---|---|
| build | `npm run build`成功 |
| 新規ack接続＋既存constructor／typed dispatch／bootstrap | 4ファイル・125件成功（新規37件を含む） |
| 全体合成 | `vitest run --maxWorkers=3`：194ファイル・5,876件成功、28.80秒。失敗・skip・未処理rejectionなし |
| 変更TS5ファイルのlint | エラー・警告0 |
| 全体lint（quiet） | エラー0。警告数はquiet実行のため再集計していない |
| compiled smoke | CM-01／02／03／04-01／04-02／04-03、NA-02／03すべて成功 |
| offline pack | 409ファイル。新しいfake adapterの4artifact同梱、fixture非同梱、pure coreのruntime importなし |
| 文書内ローカル参照 | 更新4文書の57参照、欠落なし |
| diff whitespace | 問題なし |

製品・試験の期限は緩めていない。確認に使用したのはdummy snapshotと合成byte列だけであり、PDIの資格情報・コード本文を取得／表示していない。最終確認後の変更はこの結果追記のみ。無関係な`.vscode/`・`CLAUDE.md`は変更していない。

### コミット対象だけの再検証

Git indexのCM-04-03関連12ファイル＋HEADから独立した一時copyを作り、依存だけ既存node_modulesを参照して再実行した。無関係な作業中ファイルはcopyに含めていない。

- build成功、全体lint（quiet）エラー0。
- 全体合成：194ファイル・5,876件成功、30.28秒。失敗・skip・未処理rejectionなし。期限の変更なし。
- canonical／legacy／typed／CM-04-03、NA-02／03のcompiled smokeすべて成功。
- offline pack：409ファイル、必要artifact同梱・fixture非同梱を確認。
- staged diffのwhitespace検査で問題なし。この再検証後の追記は本記録のみで、実装・テストは変更していない。

## 未確認・残課題

PDI実測、実URL／HTTP認証によるtransport binding、非200 terminal／403 fallback等の意味差、final予約枠の移譲・P更新port、選択window／payload／worker jobの正式bindingは未接続。合成成功を実運用可・独立人手評価済み・正式証拠発行可とは扱わない。
