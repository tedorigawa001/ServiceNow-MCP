# WF-B：宣言長／actual分離・legacy source scriptの合成検証

Date: 2026-11-08 / 実装基準HEAD: `1827327` / [受入設計draft-0.3](BEST_PRACTICE_WFB_DECLARED_ACTUAL_SCRIPT_DESIGN.md)。

## 変更範囲と保持した境界

`tests/review/fixtures/shared-read-hash-kernel-fake.ts`だけでlegacy Bの宣言と合成sourceを分離した。新規の`read-hash-declared-actual.test.ts`、独立event oracle、`compiled-declared-actual.mjs`を加え、CHANGELOG・設計書・親2文書を更新した。互換factory、旧B／容量／C-start試験、src・設定・配布manifestは変更していない。

不変のFileはid／declaredBytes／digest／originを持ち、source recordはorigin／backing bytes／可視長／最大4event／短読取上限だけを持つ。producerの台帳keyもFileではなくprivate originとし、宣言長・期待digest・予算／時計／停止ownerを保持させない。kernelが宣言から要求・EOF位置・予約・hash prefixを決め、同handleの単発返却から早EOF／余剰・前後差を判定する。

早EOFと余剰byteを返却結果として強制するkernel分岐を除き、before後の可視長変化にした。open／read／metadata／closeのlegacy故障はprivate有限recipe・型付き結果へ移管した。hash・候補・縮小cap・時計故障は従来の独立責務を維持する。producerのcancel／時刻進行は停止signalを返すだけで、kernelが従来と同じ受理点に反映する。

固定`da_source_probe` selectorだけは独立producerの有限grid／拒否booleanを返す。通常Bの会計には合算せず、任意source／script・resource登録口、canonical証拠や本番費用へ昇格しない。旧49selectorのschema／結果は変えない。

## 独立対照

- 宣言3・before3からactual2へ短縮し、bytes2→EOF、read2／受信2／hash2／update1／after0／final0で停止する。初期actual2／4のbefore不一致は別caseとしてread0を確認する。
- 宣言3を読み終えたprobeでactual4へ伸長し、受信4／hash3／update1で停止する。空file正常はread1／update0／受理1、空before後の伸長は受信1／hash0で停止する。
- 同actual3に宣言2／4を与えても補正せず、beforeで不一致にする。abcの期待digestは固定のまま、abdの実bytesによる不一致も既存試験で維持する。
- EINTR前に可視長を相対−1にするscriptを一度だけ消費する。同offsetでの再試行でも再適用せず、read3／retry1／受信2／update1で停止する。event消費bitを外すと受信1になるため、この対照は再適用の変異を検出する。
- source正常動作のactual0〜4 × offset0〜4 × requested1〜3の75件を、利用可能位置を独立に列挙するoracleと比較する。別origin／handle・重複open／close・close後read、eventの未知項目／variant・負offset・範囲外／小数長・stamp・不正relative・5eventを拒否する。
- 不正bytes(0)／小数n／過大n／未知variantをEOFと区別する。失敗＋取消、不正n＋期限の結果でもprimaryとstopを別に保持し、受信の不確実性・未使用update解除・close1を保持する。
- `declared-actual-oracle.ts`はkernelの係数・LIMIT・source実装をimportせず、5つの意味traceの全prefixを列挙する。計数・進行位置・update予約保存則・cleanup予約保存則・末尾2guard・終端不変を照合する。

## RED／GREENとcompiled負の対照

最初の`da_shrink_two`試験は追加前の実装でbinding／read0になり失敗し、宣言／source分離後に成功した。`da_grow_probe`、EINTRと短縮、before差・空file・不正返却、producer probe、失敗停止signalも、対応する固定recipe／診断を実装する前の失敗を確認した。これらは未登録selectorを含む段階的REDであり、独立判定の感度は次の変異でも別途確認した。

compiled fixtureは現在のTSをメモリ内ESMへcompileし、Nodeのnative importで実行する。実行対象は合成bytesだけで、temporary source／artifactを書かず、実sourceのhash照合や実worker起動は行わない。8種の変異を1つずつ別moduleへcompileし、対応する独立条件が崩れることを確認する。

1. 宣言をactualへ補正する。
2. readのactual残量制限を外す。
3. EOFの境界を`>=`から`>`へ変える。
4. 宣言位置のprobeを省略する。
5. 余剰byteをhashへ通す。
6. scratchの返却prefixではなく全体をhashする。
7. after stamp比較を外す。
8. EINTR retryで可視長eventを再適用する。

## 検証結果

| 確認 | 結果 |
|---|---|
| 新規declared／actual試験 | 19件成功、失敗0 |
| 関連合成回帰 | 19ファイル、1,355件成功、失敗0（既存1,336＋新規19） |
| 旧49scenarioの変更前後比較 | 全完走49件＋各0〜12step後finish、計686件の完全な結果一致 |
| strict TypeScript | 変更kernel・oracle・新試験・互換試験が成功 |
| ESLint | 変更kernel・oracle・compiled fixture・新試験でエラー／警告0 |
| メモリ内compile＋Node実行 | export固定、75件grid、8変異すべて検出 |
| npm run build | 成功 |
| npm pack --dry-run --ignore-scripts | 一時cache・offlineで441ファイル、tests／docs／対象fixture混入0 |

旧49scenarioの比較は、基準HEADのkernelと変更後kernelを別々のメモリ内ESMとして読み、外へ返る全結果をdeep比較した。これは互換性確認であり独立oracleの代用ではない。旧試験の期待値は変更していない。既存の8file×1MiB／32file×256KiB、余剰byte・宣言上限拒否も同じ関連回帰へ通した。

関連対象はdeclared-actual／kernel-extraction／snapshot-read-start／capacity／B／A／source-map-supply／source-map-values／carrier-coverage／seed-bootstrap／bridge-work／value-admission／value-core-detailed／snapshot-value／raw-json-boundary／raw-json-syntax／store-recorder-persistence／store-recorder-binding／fixed-evidence-store。全repository回帰は未実施。

梱包確認の初回は、既存npm cache内の`_cacache/tmp`へのopenがEPERMとなった。npmはroot-owned cacheの一般診断を表示したが、そのディレクトリのstat上の所有者は現在userだったため、root所有が原因と断定しない。一時cacheをコマンド引数で指定しofflineの同dry-runを再実行すると成功した。恒久設定・所有権・権限は変更せず、一時cacheだけを後始末した。archive生成・公開・取得は行っていない。

## 維持する停止状態と残課題

Bのmodel・全既存cap・D_stop900／D_end1000・guard上界131,524を維持する。source内部にはguard／clock採取・retryを追加しない。既存の成功guard54／386／770と余剰guard380／764、interrupt_alwaysの33read／32retryも維持する。event／record／handle等のheap・native費用はUnknownであり、guard不変を全work／実E上界の証拠としない。

次工程はCの同canonical file／同snapshotのprivate供給表、非実行view・移譲claim、共有予算／stop／custody接続と追加費用の検証。row hash集約・接続全体上界・実E／Sは未確認。既存C-startはreadKernel／actualBudget=not_connected、open／read／hash／cleanup=0を維持する。

C実行入口・正式発行口閉鎖、全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。実期待値pin・実source照合・S発行・core接続・実接続・実通信・設定変更・Pushは行っていない。今回の変更は未コミット。

## コミット前の対象限定再検証

上記「未コミット」は記録作成時点の状態。今回の9ファイルだけをindexへ登録し、そのindexを新しい一時作業ツリーへ展開した。依存node_modulesへの参照だけを追加し、元の作業ツリーの未登録変更や既存distを取り込まず、同候補で再検証した。

- npm run build: 成功。
- 関連19ファイル: 1,355件成功、失敗0。期限・設定の緩和なし。
- メモリ内compile＋Node実行: 75件grid、8種変異検出、export固定のassert成功。
- 変更kernel／oracle／新試験／互換試験のstrict TypeScriptと、変更・追加4コードファイルのESLint: 成功。
- build後のoffline npm pack dry-run: 441ファイル、tests／docs／対象fixtureの混入0。一時cacheのみ使用し、恒久設定・権限は変更していない。
- 対象4文書のローカルリンク30件・末尾空白、indexの差分形式: 正常。

追記は検証結果だけで、検証済みの実装・試験は変更していない。C実行入口・正式発行口閉鎖、全体受付無効・Unknown・調査保留を維持し、実期待値pin・実source照合・S発行・core／実接続・実通信・設定変更・Pushは行っていない。
