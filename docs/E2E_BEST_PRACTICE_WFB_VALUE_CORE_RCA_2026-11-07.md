# WF-B RC-A：shared値engine・失敗計数・旧API互換の合成検証

Date: 2026-11-07 / 基準HEAD: `5b03dfc` / 実行対象: 本作業の未コミット変更。

## 1 範囲

[RP-C差分設計 §11](BEST_PRACTICE_WFB_RPC_PRIVATE_VALUE_BRIDGE_DESIGN.md#11-rc-a実装境界)のRC-Aだけを実装した。`snapshot-value-core.ts`の単一private engineをdetailed入口とlegacy入口が共有する。入力の厳密検査・既存課金順／上限／上界式は維持し、legacyは同engine結果から旧成功／失敗形へprojectionする。raw parserは変更せずcoreに接続していない。

純粋kernel `value-core-accounting.ts`に型・計数器・診断ownerを分離した。usageはprivate、初回8 unitより前にownerへmeterを設置する。失敗時の完了課金をfreezeしたdetached snapshotとして残し、limits bootstrap拒否のunavailableと初回課金拒否のobserved zeroを区別する。拒否された課金を加えず、snapshot失敗でも先行理由を保持する。取得不能な成功は値を返さず固定拒否にする。

旧v1・正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持。証拠発行・本文保存・実接続・実通信・実機操作・設定変更・Push・コミットは行っていない。npmの一時cacheは梱包dry-runだけに使用し、設定／権限を変更していない。

## 2 試験境界と独立対照

- 実engineのchild_startedを手計算の順序付き課金列と照合。work cap 1〜73とstructural cap 1〜30で、拒否直前までの5内訳とtotalを全比較した。等値74は成功し、goldenはstructural=31、relation=8、arithmetic=17、number_formatting=6、copies=12、total=74。
- 10 variantの詳細／legacy成功値・work一致、旧APIのfield形、最終byte cap拒否時の全計数、schema／relation／limit、失敗時本文非出力、getter非実行、snapshot不変性を確認した。既存値coreの256試験は変更後も維持した。
- bytes／通常値から届かないoverflow・内部例外・snapshot取得不能は、固定scenarioだけを持つ別の`value-core-accounting-assembly.ts`で共有ownerを検査した。加算／乗算overflow直前の算術1 unit、unavailable、最初のfailureを後続failure／successで上書きしないこと、二重install拒否を確認した。共有prototypeは改変せず、実engineに任意meter／AST consumer／callbackを注入しない。
- 5理由から将来のvalue段ラベルへのfreeze済み固定対応表を全件照合した。rawへの写像処理は未接続。model混在・bridge post拒否等を検証済みとみなさない。
- build／packageのtests除外、実coreから故障assemblyへのimportなし、raw境界からcore／accountingへのimportなしを負対照で確認した。

## 3 実行結果と初回失敗

初回の拡張試験は2ファイルで**372成功／1失敗**。秘密非出力の正規表現がmodel名`wfb-value-core-work-1`中の`value`も誤検知した。実出力は固定schema理由と計数のみで、getterの実行数は0。秘密／stackの文字列検査と`value` field不在の検査を分離して試験を訂正し、engine／課金／拒否条件は変えなかった。

| 検証 | 結果 |
|---|---|
| `bdo npx vitest run tests/review/value-core-detailed.test.ts tests/review/snapshot-value.test.ts tests/review/raw-json-boundary.test.ts tests/review/raw-json-syntax.test.ts tests/review/store-recorder-persistence.test.ts tests/review/store-recorder-binding.test.ts tests/review/fixed-evidence-store.test.ts` | 最終7ファイル・894件成功。追加118件、既存値core256件とraw／Store系520件 |
| `bdo npm run build` | 成功 |
| `bdo npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/value-core-detailed.test.ts tests/review/fixtures/value-core-accounting-assembly.ts tests/review/snapshot-value.test.ts` | 成功。production build対象外のfixture／試験も型検査 |
| `bdo npx eslint`（変更したTypeScript 5ファイル） | 成功 |
| `npm pack --dry-run --ignore-scripts --json`の梱包内容検査 | 初回は既存npm cacheのopenがEPERMで失敗。実行時引数で新しい一時cacheを指定して再実行し成功。441ファイル、tests／docs／新core fixtureの混入0。script実行なし、tgz生成なし |

梱包確認は`bdo node`からローカルnpmを起動し、JSONのfile一覧だけを検査した。既存cacheの所有者が実際にrootであるかは確認しておらず、npmのエラーメッセージだけで原因を断定しない。chownや永続設定変更は行っていない。全体テスト／実通信試験／再採取は今回実施していない。

## 4 レビュー修正（2026-11-07）

`0e1229b`の個別レビューで、実装の不具合はなかった。engineと課金は変更せず、次の試験の穴を塞いだ。上記の件数は修正前の値として残す。

旧core（`5b03dfc`）へ計数の観測を1行足した一時コピーと、変異入力・上限を変えて比較した。比較した一時プローブは残していない。

| 対象 | 件数 | 差分 |
|---|---:|---:|
| 旧APIの結果（キー順を含む） | 30,000 | 0 |
| 失敗途中を含む計数（全variantと変異入力） | 30,000 | 0 |
| freezeの状態 | 30,000 | 0 |
| `calculateSnapshotBounds` | 5,000 | 0 |

**テストの修正**

`tests/review/value-core-detailed.test.ts`へ10件を追加した（118件→128件）。

- bounds計算器の空shapeを手計算の45 unit（structural 21、relation 8、arithmetic 16）で固定し、work 7／44、structural 7／20の拒否を追加した。engineから分離した最初の8 unitが無防備だった。
- 詳細の成功結果、旧APIの成功／失敗結果、bounds失敗、unavailable計数のfreezeを検査した。
- 既存の不変性の試験は別の実行を走らせるだけだったので、同じ計数器でsnapshot後に課金する対照を追加した。
- 終端確定後の`install`拒否と、確定した結果が変わらないことを追加した。

**ミューテーション**

accounting kernelとcoreへの変異53件を、coreを読み込む2試験ファイルで実施した。修正前は38件、修正後は47件を検出した。修正前に生存した試験の穴9件はすべて検出するようになった。

| 修正後も生存 | 件数 | 理由 |
|---|---:|---|
| 到達不能の防御 | 3 | `spend`の整数／負値／−0の検査。engineは正の安全な整数だけを渡す |
| 等価・観測不能 | 3 | `mul`の0ガードは0除算がInfinityになり結果が同じ。終端確定後の`#cost`クリア2件は、終端のガードがあるので結果に現れない |

| 修正後の実行 | 結果 |
|---|---|
| `tests/review/value-core-detailed.test.ts` | 128件成功 |
| 全テスト | 299ファイル、14,926件成功、失敗0 |
| repo全体の`npm run lint` | エラー0、警告374 |
| `npm run build`、`node tests/review/package-http-classification.mjs` | 成功 |
| 記録と同じ型検査、`git diff --check` | 成功 |

全テストは文書の更新前に実行した。上記の§3で未実施としていた全体テストは、この実行で補った。実通信試験と再採取は未実施のまま。

## 5 未対応・残るUnknown

RC-Bの同V／planからの2V・structural受付、RC-Cのraw finally前の固定借用・claim・pre/post・費目合流は未実装。旧値coreの抽象workモデルは維持したが、追加owner／結果wrapper／snapshotの実処理費を無料と証明したものではなく、統合bridge profileは未導出。実heap・CPU時間・OOM／native故障・GC完了／ゼロ化はUnknown。encoder・private aggregate／capture／custody・本文保存・正式発行・運用cap承認にも進んでいない。
