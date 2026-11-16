# BG01：純粋診断抽出・旧wrapper併存の検証記録

Date: 2026-11-16。基準HEAD: `378d6c5`。設計：[B-03 draft-0.2 §10](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md#10-bg01限定実装併存検証2026-11-16)。

## 範囲と非対象

LM01の固定3purpose状態機械とLM02の43scenarioをpackage-excluded moduleへ抽出した。新state creatorは引数なし・fresh binding／ownerで、公開診断や既存sessionを採用しない。旧rootの4export・旧試験・旧friend取得は維持する。注入workflowは同じstateを使うが、resource／bridge処理の変更は生成元の置換1行だけである。

正式発行口／C実行入口／body起動閉鎖、全体受付無効、Unknown、通常経路未切替、VM／監視／telemetry調査保留、LOAD6／LOAD7とAP01〜06の未承認を維持。LM03のresource抽出、実class private bindingの回復、専用U/D build、friend撤去、実接続・実通信・設定変更・Pushは行わない。

## 初回失敗と切り分け

1. 新試験を先行し、新pure moduleが存在しないことによるsuite load失敗を確認した（0件実行、exit 1）。これは意図した抽出前のREDである。
2. 抽出後の初回2file実行は104件中97成功・7失敗。6scenarioと禁止能力条件内の再確認で、公開cleanup理由`window_ended`が試験の広い`/window/`に一致した。slot・理由・freeze等の実値比較は既に一致していた。`{"cleanup":{"reason":"window_ended"}}`への最小対照も、語の検索true・`"window":`field検索falseを示した。
3. 製品状態機械は変えず、oracleを秘密markerと参照field名の検査へ分けた。105件の最終実行は全成功。異なるprimary・ordinal数・acceptance・余剰参照fieldを与えた負の対照も失敗することを確認した。初回7失敗を期限・環境制約や製品退行として扱わない。

## 実施結果

以下のcommandはいずれも`bdo`経由。製品deadline・元5秒期限・既定並列度・旧比較60秒は変更していない。

| 検査 | 結果と限界 |
|---|---|
| `npm run type-check` | exit 0。新state型を含む本番入力の型検査 |
| 対象4 TS fileのESLint | exit 0。旧root・新state／pure fixture・新試験。リポジトリ全lintではない |
| `npm run build` | exit 0。現行tsconfigのままdist生成。専用U/D出力ではない |
| `npm test -- --project unit tests/review/native-diagnostic-pure.test.ts tests/review/native-status-diagnostic.test.ts` | 最終2file・105件成功、exit 0、2.75秒。新50件＋既存55件。全体並列回帰ではない |
| `node tests/review/fixtures/compiled-native-diagnostic-pure.mjs` | exit 0。固定distだけから43scenario・strict入力・foreign bindingの一度限り拒否・sealed copy不変、clock／native constructor禁止下で成功。import／能力漏出7変異を拒否 |
| `node tests/review/fixtures/compiled-native-status-diagnostic.mjs` | exit 0。旧4exportと従来固定8scenario等を維持。旧module評価時のfriend取得は残るが、reader／cancel等のnative操作は呼ばない純粋fixture |
| `node --check` | 新compiled fixtureと既存HTTP pack scriptはexit 0 |
| offline `npm pack --dry-run --ignore-scripts --offline --json`＋固定監査 | exit 0。441file、新2層のJS／宣言／map同梱0。436 runtime artifactの内容にも新2層の参照0。混入file／importの4負の対照を拒否。実tarball生成／展開ではない |

新pure入口は`node:util`と同stateだけ、stateはimportなし。source構文検査とcompiled JS構文検査でstatic import・reexport・dynamic import・clock／timer／native／transport能力を検査する。runtime friend取得口をthrowするmockの下でも新pure入口が実行できる。globalを試験後に復元し、live session／reader／native終端／workerを作らない。

## 元実装との照合

基準HEADとの読取専用の本文照合で以下を確認した。旧結果を新oracleの期待値へ採取・コピーしていない。

- 状態型・状態機械はexport指定・説明commentを除き機械的一致。
- pure runnerはfresh creatorを呼ぶ初期化2行以外、入力検査・43scenario・イベント順・返値本文が一致。
- `type NativeInput`から旧fault runnerまでのresource／bridge本文は、fresh creatorへ置換した1行以外一致。元本文のSHA-256は`f2874a63938d7306b0d187baeb4135afec17656f0470b8f8b61cf5bf66d697db`。
- 既存NDのsource試験2file・compiled fixture2file・`package.json`・`tsconfig.json`・`vitest.config.ts`の計7fileが基準HEADと同一。新旧wrapperのpure runner関数は同一実参照。
- HTTP pack scriptには新2層の非同梱監査名を追記しただけ。新childの登録・既存fixture実行順・build設定は変更しない。

## 未実施・残課題

全体回帰、HTTP pack script全体、旧ND resource／実session連続fixture、専用U/D/I/H artifactの実行は未実施。今回の純粋compiled直接実行は将来のB-03 child supervisorやその終了契約の検証ではなく、通常並列timeoutの解消証拠でもない。

次はBG02のoptional bridgeを新しい権限受付口なしで分離できる最小境界をレビューする。旧UN62のfault位置保証、台帳非共有、専用build・child上限／終了確認・有限記録、AP承認・旧入口撤去・公開判定は未解決のまま保持する。成功件数をPの正式binding・認証・cleanup保証へ加算しない。

## コミット前の対象限定再検証

同日、今回の12fileだけをstageし、index全体を別の空directoryへ展開して再確認した。既存dist／`.git`は持ち込まず、導入済み依存だけを参照した。build・型検査・対象4 TS fileのlintはexit 0、合成2file・105件成功（2.24秒）、新43scenarioと旧ND-01のcompiled fixtureはexit 0。offline梱包dry-runは441file・436 runtime artifact、新2層の混入0・4負の対照拒否で成功した。新compiled fixtureとHTTP pack scriptの構文検査もexit 0。元の期限・並列度を維持し、全体回帰・HTTP pack全体・実tarball展開を実施済みとはしない。この再検証後の追記は本節のみで、実装・試験入力は変更しない。Pushは行わない。
