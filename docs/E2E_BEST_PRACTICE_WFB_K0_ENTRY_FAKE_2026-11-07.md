# WF-B：K0／Eの有限内部契約・拒否診断の純粋fake検証

Date: 2026-11-07 / 基準HEAD: `3c53902` / 対象: 本作業の未コミット変更。

## 1 実装範囲

[seed bootstrap設計 §10](BEST_PRACTICE_WFB_SEED_BOOTSTRAP_DESIGN.md#10-k0e純粋fakeの実装境界)の純粋fakeだけを実装した。`seed-bootstrap-fake.ts`のprivate Assemblyがfake budgetの数値と一度取得の状態を持ち、閉じたfacadeから取得・生成・fake profile確認・拒否・終了・不変snapshotだけを提供する。モデルは`wfb-k0-entry-fake-1`。

fixture専用scheduleはE要求量5、prepare2（build／fake profile確認各1）、terminal3（診断／cleanup／退役各1）。5は新しい実E要求量でもX／Δの導出値でもない。旧有限bridge modelの102／57／239や398も変更していない。K0は成功／拒否とも抽象workへ加算せず、`k0Work=excluded`。全結果は`ready=false, runtimeCoverage=unknown, nativeCost=unknown, seed=not_acquired, coreInvocation=not_called`を保持する。

実plan／meter／profileの供給・private root／V／N・S credit・handoff・coreとの結合はない。fake AssemblyのJS objectはfactory時に生成され、`ownerBuilt`は論理状態だけなので、現実のallocationをE後へ移した証明にはならない。carrierのmodule初期化・実拒否出力費も計上／承認済みにしない。

旧v1・正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持。core接続・実接続・実通信・実機操作・証拠発行・本文保存・設定変更・Push・コミットは行っていない。

## 2 合成確認

- 有効baseからの等値取得でfake bridgeへ一度だけ5をdebitし、1不足ではdebitせず固定`raw_work`を返す。取得前のbootstrapUsageはunavailableで、0へ補完しない。fake budget側の観測済みprefixは別に残る。
- 二重取得・E前のbuild／profile／close、二重build／profileを拒否し、追加debit・refund・失敗後再開をしない。最初の失敗後、各操作を100回繰り返しても同じ固定失敗を返し、cleanup／credit退役は一度だけ。正常close後も新しい取得は拒否し、完了済み正常診断は書き換えない。
- fake owner構築後はcharged／executed／prepaidUnusedをdetached／freezeして返す。途中snapshotのprepaidUnusedはterminal用の未実施予約も含む。build直後の拒否はcharged5／executed4／未使用1、正常終端は5／5／0で、未使用を原budgetへ返さない。
- 固定`entry_build_failure`ではE commitと取得事実を保持し、owner未生成なので返却carrierのE使用量はunavailableのまま。fake外側budgetのtotal15・退役試行1を別に確認した。carrierの同値／参照共有はDATAに限り、別invocationのbudgetやidentityを共有しない。
- 固定`profile_rejected`はE取得後だけ到達し、先行`raw_limits`を保持。fake正常profileの通過も実profileのready判定ではなく、Sやcoreを始めない。
- 固定snapshot／cleanup／両方の故障は、先行`raw_work`と二軸の二次診断を同時保持。snapshot不能を0にせず、cleanup未確認を`simulated_released`へ補完しない。先行理由のない正常closeでこれらが起これば`raw_internal`として成功を拒否する。
- 別に書いた6状態の参照機械で、5操作の長さ4の全625列を比較。成功／拒否・取得数・owner状態・cleanup／退役数・first reason・budgetを各stepで照合した。参照機械はfixtureの状態実装をimportしない（試験は実行対象factoryだけを呼ぶ）。
- BigInt容量oracleはparser6値×bridge3値×境界 −1／等値／＋1の54組。MAX_SAFE付近、不正baseのsafe和overflow／used>cap、−0・unsafe・非数値・getterを持つobject／Proxyをcoerceせず拒否する対照も追加した。不正base／固定故障は実入力経路の到達証拠ではない。
- carrier／snapshot／facadeの不変性・秘密canary／stack非出力、既存raw/core/RC-B/費目modelから新fakeへのimportなし、実packageからの除外を確認した。

固定故障は有限な状態分岐であり、native allocation／OS cleanupや実snapshotの故障注入ではない。cleanup／credit retireの0／1はfakeの観測で、物理解放・GC・zero化を保証しない。後着呼出しの拒否やsnapshot生成そのものの実CPU費も、fixture5 unitで証明しない。

## 3 テスト先行と実行結果

最初に容量1不足の試験を追加し、成功stubに対して1件失敗するREDを確認した。K0 fake容量判定後に成功した。取得後build→profile→closeの試験も、未実装stubに対して3件中1件失敗するREDを確認してから実装した。二重取得は最初のclaim状態で拒否でき、拡張した状態列・固定故障試験を追加して23件成功となった。期限・製品capや既存APIを変更して成功させたものではない。

| 検証 | 結果 |
|---|---|
| `bdo npx vitest run`（seed-bootstrap、bridge-work、value-admission、value-core-detailed、snapshot-value、raw-json-boundary、raw-json-syntax、store-recorder-persistence、store-recorder-binding、fixed-evidence-storeの10ファイル） | **964件成功**：追加23＋既存941 |
| `bdo npm run build` | 成功 |
| `bdo npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/seed-bootstrap.test.ts` | 成功。build対象外の新fakeも型検査 |
| `bdo npx eslint tests/review/fixtures/seed-bootstrap-fake.ts tests/review/seed-bootstrap.test.ts` | 成功 |
| ローカルnpmの`pack --dry-run --ignore-scripts --json`、実行時だけ一時cache指定 | 441ファイル、tests／docs／新fakeの混入0。script実行・tgz生成なし |

梱包確認は`bdo node`からローカルnpmを起動しfile一覧だけを照合した。永続cache設定・所有者・権限は変更していない。全体テスト・実通信試験・再採取は行っていない。

## 4 レビュー修正（2026-11-07）

`b62218c`の個別レビューで、fakeの不具合はなかった。fakeは変更せず、次の試験の穴を塞いだ。上記の件数は修正前の値として残す。

§2の長さ4の全625列は、正常closeに4操作を使い切るので、close後の操作へ届いていなかった。参照機械の`done`分岐は実行されていなかった。同じく§2の「carrierの不変性」は、`inspect`の結果だけを検査したもので、carrierと結果オブジェクトを含んでいなかった。

一時プローブで、6シナリオ×長さ6の全15,625列（562,500ステップ）の不変条件を確認した。debit、cleanup、退役の回数、budget、使用量の和、entryの逆戻り、実行順、freeze、閉鎖フラグ、cleanup未確認の補完に違反はなかった。「失敗後に`ok`へ戻らない」だけ4件該当したが、いずれも正常close→後着拒否→closeの列で、完了済みの結果を返す設計どおりの動作である。プローブは残していない。

**テストの修正**

`tests/review/seed-bootstrap.test.ts`を変更した（23件→28件）。

- 参照機械を長さ5の全3,125列へ延ばし、`done`分岐を5回通ることを固定した。
- close後の`checkProfile`拒否と、後着拒否の結果の同一性を追加した。
- 結果オブジェクト、取得前後のcarrier、後着拒否のdeep freezeを検査した。
- `runtimeCoverage=unknown`、`used == cap`の`raw_work`、E前の`inspect`の診断、ownerなしのsnapshot故障、`Rejected`状態を固定した。

**ミューテーション**

`seed-bootstrap-fake.ts`への変異70件を、`tests/review/seed-bootstrap.test.ts`で実施した。修正前は53件、修正後は65件を検出した。

| 修正後も生存 | 件数 | 理由 |
|---|---:|---|
| 等価・冗長 | 5 | `typeof`は`isSafeInteger`が同じ入力を拒否する。`CLOSED`のfreezeは外に出ない。`first`の上書きは`finish`が1回だけなので起きない。終端ガード2件は`close`と`finish`で二重になっている |

| 修正後の実行 | 結果 |
|---|---|
| `tests/review/seed-bootstrap.test.ts` | 28件成功 |
| 全テスト | 302ファイル、14,991件成功、失敗0 |
| repo全体の`npm run lint` | エラー0、警告374 |
| `npm run build`、`node tests/review/package-http-classification.mjs` | 成功 |
| 記録と同じ型検査、`git diff --check` | 成功 |

全テストは文書の更新前に実行した。§3で未実施としていた全体テストは、この実行で補った。実通信試験と再採取は未実施のまま。

## 5 残るUnknown

本書はK0／Eのfake内部状態に関する部分検証で、SB01〜08全体の完了ではない。固定carrier自体を供給できないnative故障、K0を基底として認める信頼前提、実schedule・entry slot・X／Δ・新予約上界、元plan／meterへの実結合、実owner生成のallocation、Sのpending／handoff・root供給は未対応。実費coverage・正式cap・native反射／OOM／module初期化・実heap／CPU／GC／ゼロ化はUnknownのままである。

pure fakeを実claim台帳へ登録したり、公開snapshot／carrierから取得証拠を作る口は追加していない。実profileのready条件を緩めず、正式発行口閉鎖・全体受付無効・調査保留・core未接続を継続する。
