# WF-B (B)：最大8MiB成功走査・上限境界の合成検証

Date: 2026-11-08 / 実装基準HEAD: `92523f2` / [固定操作・容量契約](BEST_PRACTICE_WFB_SCRATCH_CANDIDATE_DESIGN.md) / [親設計](BEST_PRACTICE_WFB_PRIVATE_READ_HASH_DESIGN.md)。

## 対象と変更範囲

既存`tests/review/fixtures/read-hash-fake.ts`へ固定容量scenarioを追加し、`tests/review/read-hash-capacity.test.ts`と`tests/review/fixtures/read-hash-capacity-oracle.ts`を新設した。既存(A)・(B)の通常／故障経路、cap・期限・guard上界は変更しない。CHANGELOG・scratch差分設計・親設計・前回検証記録の後続参照を更新した。

sourceは固定の0x61反復配列だけで、実file読取・実source hash・実期待値pin・snapshot供給は使わない。1file内のbytesを従来の同scratchへ写し、従来のNode SHA-256／digest比較・close・private受理を通す。大容量だけ比較を省略する成功口や、任意file／buffer／oracle注入は作っていない。

## 独立oracle

容量oracleはNode crypto／本体moduleをimportしない、別実装のSHA-256 compression／padding／反復byte生成である。入力は1byte値と0〜1MiBの長さに限定し、範囲外を拒否する。空列・単一a・100万aの固定既知vectorで確認したうえで、1MiB／256KiBの合成期待digestを独立に再構成した。本体にはその静的期待値だけを置き、actual digestから生成しない。

- 1MiBのa: `9bc1b2a288b26af7257a36277ae3816a7d4f16e89c1e7e77d0a5c48bad62b360`
- 256KiBのa: `dd3dde87623d9a6b354c68c943d189c89c63652d945e7bbdf0986cae91a49521`

計数oracleはLIMIT／操作係数／counterを本体からimportせず、open・前観測・init・payload反復・EOF・後観測・final・close・受理・終端の意味イベントを別に列挙する。byte総量はBigIntの積、guardは独立の固定数値とも照合した。cryptographic実装全体や全入力に対する正しさの証明ではない。

## 境界結果

| 合成scenario | 受信／hash済bytes | read／update | 受理／close | guard | 結果 |
|---|---|---|---|---|---|
| 8file×1MiB | 8,388,608／8,388,608 | 136／128 | 8／8 | 386 | 全slot hash_match／closed_confirmed |
| 32file×256KiB | 8,388,608／8,388,608 | 160／128 | 32／32 | 770 | 全slot hash_match／closed_confirmed |
| 8file、最終EOFに余剰1byte | 8,388,609／8,388,608 | 136／128 | 7／8 | 380 | 最終slot content_mismatch、前7slot確定を保持 |
| 32file、最終EOFに余剰1byte | 8,388,609／8,388,608 | 160／128 | 31／32 | 764 | 最終slot content_mismatch、前31slot確定を保持 |
| 宣言総量8MiB+1 | 0／0 | 0／0 | 0／0 | 2（finishのみ） | constructorでsource_limit、cleanup予約0 |
| 1file=1MiB+1 | 0／0 | 0／0 | 0／0 | 2（finishのみ） | constructorでsource_limit、cleanup予約0 |
| 33file | 0／0 | 0／0 | 0／0 | 2（finishのみ） | constructorでsource_limit、cleanup予約0 |

成功2shapeはopen／observe／init／final／candidate／cleanupの全計数も独立oracleと一致した。正常hash update完了128回、予約累計128・未使用解除0・終端予約0。成功file数とcanonical ID順を確認し、全scope／candidate／issued／recordは終端で退役した。終端後の操作・取消・時計変更は既存結果／計数を変更しない。

余剰byteは受信枠の上限ちょうどまで課金するがhash対象へ加えず、最終fileのafter／final／候補発行をskipし、closeは1回試す。最初の余剰で停止するので、2byte目まで受けて受信capを超える経路はなく、そのような試験を行ったとは扱わない。上限超過宣言は全部open前に停止し、繰返しstepでも課金しない。既存固定profileの32file／1MiB／8MiB／受信8MiB+1／chunk64KiB／read65,536／retry32／guard131,524／stop900／end1000もliteralで照合した。

## 実行・環境記録

最初の補助実行`npx tsx -e`は、tsx自身がローカルIPC pipeをlistenする起動段階でEPERMとなった。oracleの計算前であり、製品／試験対象のhash失敗ではない。再試行・権限昇格・待受許可・設定変更はせず、TypeScriptを一時出力へCommonJS compileし、待受を使わないNode実行へ切り替えた。そこで空列・100万aのassertと容量digest生成が成功した。この補助起動以外で試験失敗は観測していない。

| 検証 | 結果 |
|---|---|
| 新規capacity＋B＋A | 3ファイル、118件成功（新規11／B55／A52）、失敗0 |
| 関連合成回帰 | 16ファイル、1,291件成功、失敗0 |
| npm run build | 成功 |
| 関連fixture／testのstrict TypeScript | 成功 |
| 変更fixture・新規oracle／testのESLint | エラー・警告なし |
| 一時CommonJS compile＋Node実行 | 独立vector・8file／32fileの8MiB成功・最終余剰byte停止のassert成功 |
| npm pack --dry-run --ignore-scripts | 441ファイル、tests／docs／A・B・容量oracle／supply fakeの混入0 |

関連対象はread-hash-capacity／read-hash-fake／read-ops-fake／source-map-supply／source-map-values／carrier-coverage／seed-bootstrap／bridge-work／value-admission／value-core-detailed／snapshot-value／raw-json-boundary／raw-json-syntax／store-recorder-persistence／store-recorder-binding／fixed-evidence-storeの各`tests/review/*.test.ts`。全repository回帰は今回未実施。時間枠・既存設定を緩めていない。梱包確認はdry-runのみでarchive生成・公開・依存再導入を行っていない。

## 残課題・停止条件

この結果は64KiB chunkの2shapeと固定境界の保証で、全短読取分割・全source内容・実clock期限内完了の保証ではない。共有fixture配列はmockの読取元で、受信chunk履歴ではない。scratch以外のfixture配列／hash内部heap、GC・非保持性・実native費・全heap／CPU上界はUnknownを維持する。

同MapSupplySnapshot／SourceMapDraftへのprivate借用・同一性結合、読取中closeによる同期停止と借用退役、行hashと辞書全体hashの集約は引き続き未実装。snapshotConnection／rowAggregation=not_connected、全12row=not_aggregated、mapping／implementation・5 gaps・実E／S要求量を確認済みにしない。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。実期待値pin・実source照合・S発行・core接続・実接続・実通信・設定変更・Pushは行っていない。今回の変更は未コミット。

## コミット前の対象限定再検証

上記「未コミット」は作成時点の記述。今回の8ファイルだけをindexへ登録し、そのindexを新しい一時作業ツリーへ展開した。依存node_modulesへの参照だけを加え、元の未登録変更・既存distを取り込まず、同候補で再検証した。

- npm run build: 成功。
- 関連16ファイル: 1,291件成功、失敗0。
- 関連fixture／testのstrict TypeScript、変更3ファイルのESLint: 成功。
- build後のnpm pack --dry-run --ignore-scripts: 441ファイル、tests／docs／容量oracle・関連fakeの混入0。

この追記は検証結果だけで、検証済みの実装・試験コードは変更していない。全repository回帰は今回未実施。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持し、実期待値pin・実source照合・S発行・core／実接続・実通信・設定変更・Pushは行っていない。
