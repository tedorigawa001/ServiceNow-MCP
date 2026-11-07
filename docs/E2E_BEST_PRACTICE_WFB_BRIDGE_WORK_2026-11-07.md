# WF-B：有限bridge step／slot・unit係数と予約上界の合成検証

Date: 2026-11-07 / 基準HEAD: `8dff929` / 対象: 本作業の未コミット変更。

## 1 実装範囲と非実行境界

[RC-C設計 §11](BEST_PRACTICE_WFB_RCC_PRIVATE_SUPPLY_BUDGET_DESIGN.md#11-有限stepslotunit係数と純粋予約計算)の有限recipe計算器を`tests/review/fixtures/bridge-work-core.ts`へ追加した。固定modelは`wfb-bridge-finite-work-1`。19 logical slot・8操作種別（各1 abstract unit）・28 step・29経路を固定し、callerによる係数／path／callbackの供給は許可しない。

`calculateBridgeWorkBounds()`は固定経路のunit和とphase別最大値を返す。`inspectBridgeReservation(phase, counters)`はstrictな3 counterに対して容量の等値／不足・既課金和overflowを計算するだけで、元counterを変更しない。結果はfreezeした非実行DATAであり、`ready=false, runtimeCoverage=unknown, coreInvocation=not_called`を維持する。実creditの生成・一度claim・flow実行・core起動は実装していない。純粋関数の再呼出しを利用権限の再発行とはみなさない。

既存raw parser／値core／RC-B・実session・runtime／package設定は変更しない。旧v1・正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持した。core接続・実接続・実通信・実機操作・証拠発行・本文保存・設定変更・Push・コミットは行っていない。

## 2 数値と独立oracle

| 有限recipeの費目 | 上界／対照 |
|---|---|
| seed（3 gate制御費の所有を含む） | 102 |
| admit | 57 |
| tailの正常処理列 | 219 |
| tailの最も遅い返却準備失敗列 | 239 |
| 前払い総上界 | 102＋57＋239＝398 |
| 正常モデルの実施／未使用前払い | 378／20。課金398から未使用20を返却しない |
| parser拒否に対応するseed列 | 実施74／未使用28。admit・tailは未取得のまま |

これらはmodel内の費目であり、実CPU命令数・heap byte・実bridgeの実測値ではない。phaseごとの列は費目所属を表し、seed／admitのclearをcore前に実行する動作を生成しない。

独立oracleは`bridge-work-oracle.ts`で、計算器・係数表・totalをimportせず、固定field／slot／guard対象に対応するread/check/write等のイベントを別手続きで生成した。全28 stepの8内訳とtotal、全29経路のphase／total、各primitive位置での中断prefix上界を比較した。後半post・返却準備を実行した後の失敗処理20も含めた最大239が、正常219より大きいことを確認した。step途中の停止は当該step全費を含む保守列以内である。

19 slotのclearはseed15・admit1・tail3で重複なく全slotを覆う。元parserのnodeCleanup／byte cleanup・既存core5費目をこのrecipeへ加えず、work配賦和は元parser所有、admissionの新算術は3回と固定した。

BigInt oracleは3 phaseそれぞれで、parser課金5値×bridge課金3値×境界offset −1／0／＋1の45組を比較した。MAX_SAFE付近、P+B overflow、既課金だけでcap超過も検査した。入力のgetter／Proxy／hook・余分field／順序／prototype／symbol、0 cap・−0・unsafe／非数値を拒否し、入力coercion・秘密canary／stack出力を行わないことを確認した。

係数±1・遅い失敗列を落とした219予約・239の1不足はoracleと不整合になる対照を追加した。これは純粋値／診断の変異対照で、実bridge sourceを変更して実行したmutation testやnative故障注入ではない。

## 3 テスト先行と実行結果

最初に19 slotと102／57／239／398を要求する1試験を追加し、stubの非対応で1件失敗するREDを確認した。固定recipe計算の実装後に成功した。次に予約等値の試験を追加し、2試験中1件失敗するREDを確認してからstrict容量検査を実装した。独立oracleと境界対照の拡張後は11件成功した。製品の期限・cap・既存model／課金点を緩めて成功させたものではない。

| 検証 | 結果 |
|---|---|
| `bdo npx vitest run`（bridge-work、value-admission、value-core-detailed、snapshot-value、raw-json-boundary、raw-json-syntax、store-recorder-persistence、store-recorder-binding、fixed-evidence-storeの9ファイル） | 941件成功：追加11＋既存930 |
| `bdo npm run build` | 成功 |
| `bdo npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/bridge-work.test.ts` | 成功。新fixture／oracleも含めて型検査 |
| `bdo npx eslint tests/review/fixtures/bridge-work-core.ts tests/review/fixtures/bridge-work-oracle.ts tests/review/bridge-work.test.ts` | 成功 |
| ローカルnpmの`pack --dry-run --ignore-scripts --json`、実行時だけ一時cache指定 | 441ファイル。tests／docs／bridge-work fixtureの混入0。script実行・tgz生成なし |

梱包確認は`bdo node`からローカルnpmを起動してfile一覧だけを照合した。永続cache設定・所有者・権限は変更していない。境界試験では計算器のruntime importが`node:util.types`だけであること、oracleが計算器をimportしないこと、既存raw/core/RC-Bが新modelをimportしないことを確認した。全体テスト・実通信試験・再採取は今回行っていない。

## 4 残るUnknown／未対応

数値係数は有限recipeの定義・計算として固定しただけである。未接続の実bridgeの全処理が19 slot／28 stepで覆われる証拠、coreの全unmetered処理との完全対応、初期seed予約を取得する前のbootstrap費、実profile定数の供給費はUnknown。計算器自身の経路列挙／allocation費を、将来の実行時gate14 unitへ無料で含めない。

次の段階では元plan／meter／rootのprivate実装との対応を確認し、実creditの一度取得・利用／未使用退役と、失敗後の診断／全alias破棄を観測する必要がある。元parserの既存cleanup前払いとの重複やseed未取得の処理を見落とさない。profileはreadyへ昇格させず、pure出力からcore接続の許可を作らない。実heap・ABI・CPU時間・native allocation／OOM・GC／ゼロ化、運用cap、正式発行／本文保存は未確認／未承認のままである。
