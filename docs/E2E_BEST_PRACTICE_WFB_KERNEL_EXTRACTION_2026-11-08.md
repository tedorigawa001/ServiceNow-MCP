# WF-B：読取・hash kernelの機械的抽出と互換factoryの合成検証

Date: 2026-11-08 / 抽出基準HEAD: `f6018b5` / [共通kernel・private供給境界の設計](BEST_PRACTICE_WFB_PRIVATE_KERNEL_SUPPLY_DESIGN.md)。

## 対象と変更範囲

従来の`tests/review/fixtures/read-hash-fake.ts`の全実装を`shared-read-hash-kernel-fake.ts`へ移動した。旧pathはコメントとcreateReadHashFakeのre-exportだけの2行とした。新規`tests/review/read-hash-kernel-extraction.test.ts`を追加し、CHANGELOG・供給境界設計・親読取設計を更新した。

移動前のgit管理本文と移動後の本文を文字列比較し、先頭コメントを除く全内容の一致を確認した。これは機械的コード移動の確認であり、機能としての実source hash採取／照合ではない。class名、固定source／digest、scenario、constructor、read／metadataの固定故障分岐、hash、状態／計数／guard、結果model、factory bodyは変更していない。

旧B試験、容量試験、C-startの実装／試験には差分がないことを確認した。src／dist／設定・配布manifestも変更していない。旧Supplyの共通化やC rootの移動は今回含めない。

## 保持した保証と追加対照

- 旧pathと新moduleが同じfactory関数参照をexportし、moduleの公開名はcreateReadHashFakeだけ。facadeも従来のstep／run／finish／inspect／cancel／advanceToを維持する。
- private Assembly内のsource・scratch・hash・resource／candidate・budgetは外へ出さない。kernel constructor・ReadOps登録口・arbitrary supply／callback・adopt helperを追加していない。
- Bのmodel、正常3fileの受信8／hash済8／受理3／guard54、短読取・retry共有・hash部分故障・実digest不一致・close異常・終端後不変を維持した。両pathの出力比較は互換性確認で、独立hash oracleの代わりではない。
- 既存のabc／空file／hello、独立SHA-256 oracle、8file×1MiB／32file×256KiB、余剰byte・宣言上限拒否の試験を、期待値を一切変えずに移動後のbodyへ通した。
- C-startはreadKernel／actualBudget=not_connected、open／read／hash／cleanup=0のまま。Cのfacade・prepared診断・終端summary・Cを示す未知selectorを、Bの供給として渡す試みはbinding／open0で拒否する。
- 新moduleでもcaller Proxy／callback・余分引数はhook非実行で拒否する。正式発行口閉鎖・全体受付無効・Unknownと秘密非出力の既存契約を維持する。

§6のexpectedBytesを基準とした残量／EOF判定への変更は行っていない。現行Bの宣言長はactual bytes.lengthと同じで、早EOF／余剰byte／before長差／after変更は既存のscenario分岐のままである。この段階の試験成功を、独立したactual source判定やstrict canonical fileへの接続の証拠にしない。

## 検証結果

| 確認 | 結果 |
|---|---|
| 抽出前の既存B・容量・C-start | 3ファイル、106件成功 |
| 抽出後の同3ファイル＋新互換試験 | 4ファイル、111件成功（既存106＋新規5）、失敗0 |
| 関連合成回帰 | 18ファイル、1,336件成功、失敗0 |
| 機械移動の本文比較 | 先頭コメント以外は抽出前と完全一致 |
| 既存B／容量試験、C-start実装／試験の差分 | なし |
| npm run build | 成功 |
| 抽出module／互換入口／関連試験のstrict TypeScript | 成功 |
| 新規／変更3ファイルのESLint | エラー・警告なし |
| 一時CommonJS compile＋Node実行 | export／関数参照互換、8MiB成功、C未接続・採用拒否の固定assert成功 |
| npm pack --dry-run --ignore-scripts | 441ファイル、tests／docs／shared kernel・互換fixture・C-start fakeの混入0 |

関連対象はread-hash-kernel-extraction／snapshot-read-start／read-hash-capacity／read-hash-fake／read-ops-fake／source-map-supply／source-map-values／carrier-coverage／seed-bootstrap／bridge-work／value-admission／value-core-detailed／snapshot-value／raw-json-boundary／raw-json-syntax／store-recorder-persistence／store-recorder-binding／fixed-evidence-storeの各`tests/review/*.test.ts`。全repository回帰は今回未実施。期限・設定を緩めていない。梱包はdry-runだけでarchive生成・公開・依存導入・実worker起動を行っていない。

今回の試験実行では失敗を観測していない。移動前と移動後を確認した機械的抽出であり、RED／GREENや新たな変異試験を実施したという記録ではない。

## 残課題と停止状態

新moduleは将来の共通化先としてBのbodyを保持するだけで、generic kernel APIやC実行入口はない。legacy／strict adapterの分離、同canonical file参照と期待値／payload binding表・private view／移譲claim、actual sourceに基づくEOF判断は未実装。C-startからのshared budget／stop／custody連結・追加guard上界、同snapshot→kernelの連続合成試験も後続に残す。

Bのguard上界131,524・全既存capは変更していない。接続全体の上界・実E／S・全heap／native費・実期限内完了はUnknown。row集約・旧Supply採用・runtimeへの組込み・S発行の保証へ昇格しない。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持し、実期待値pin・実source照合・S発行・core接続・実接続・実通信・設定変更・Pushは行っていない。今回の変更は未コミット。

## コミット前の対象限定再検証

上記「未コミット」は記録作成時点の状態。今回の7ファイルだけをindexへ登録し、そのindexを新しい一時作業ツリーへ展開した。依存node_modulesへの参照だけを加え、元の未登録変更・既存distを取り込まず、同候補で再検証した。

- npm run build: 成功。
- 関連18ファイル: 1,336件成功、失敗0。
- 抽出module／互換入口／関連試験のstrict TypeScriptと新規／変更3ファイルのESLint: 成功。
- build後のnpm pack --dry-run --ignore-scripts: 441ファイル、tests／docs／共通kernel・互換fixture・C-start fakeの混入0。
- indexに登録した共通kernel本文は、先頭コメントを除き抽出基準HEADの旧本文と同一。

追記は検証結果だけで、検証済みの実装・試験は変更していない。Cの実行入口・正式発行口は閉鎖のまま、全体受付無効・Unknown・調査保留を維持する。実期待値pin・実source照合・S発行・core／実接続・実通信・設定変更・Pushは行っていない。
