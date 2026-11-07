# WF-B 合成固定供給・MapSupplySnapshot：private結合の合成記録

Date: 2026-11-07 / 設計基準HEAD: `5d7b410` / レビュー反映基準HEAD: `545f044` / [実装契約§9](BEST_PRACTICE_WFB_FIXED_DICTIONARY_SUPPLY_DESIGN.md#9-合成固定セットmapsupplysnapshotの実装境界)。

## 変更と境界

`tests/review/fixtures/source-map-supply-fake.ts`と`tests/review/source-map-supply.test.ts`を追加した。固定のsynthetic/* DATAから既存純粋検査を1回呼び、同成功返値value・files・rowsを非公開MapSupplySnapshotと同ownerへ結合する。実fileのpath／hash／byte長は使用・採取・pinしない。固定setは4 file・SC12行で、partial_reference 1行とunimplemented 11行、missingは計12件を保持する。

通常facadeはcheck／close／inspectのみ。外部DATAやsnapshotを受領せず、引数注入を内容読取前に拒否する。canned probeだけが第2合成セット・copy・混入版を内部生成し、正常系と同じprivate acceptを通す。別snapshot／同値wrapper／map copy／files・rows copy／別mapのfiles／混入版／元入力を拒否する。公開経路から外部snapshot混入へ到達できるという主張ではない。

失敗後の再開を拒否し、最初の診断・固定生成段階・論理退役回数を保持する。元入力を使うprobeの参照も失敗時に退役する。正常readonly checkの反復は可能で、one-shot claimは設けない。close後checkは拒否し、closeの反復で退役を増やさない。native OOM・freeze内部故障・物理解放／GC・ゼロ化は証明していない。

作業中に設計レビュー`545f044`を検出し、レビュー記述を保持した。DS02／DS08は試験専用の第2セット／copyによる内部対照と明記し、実hash照合を既定のnpm testへ追加しない方針、reviewSetId更新忘れはレビューで扱う制約も残した。既存code／設定は変更していない。

## RED／GREEN・初回失敗

1. 最初の正常供給試験はmodule未作成で失敗し、実装後1件成功。
2. 8つの混入試験はprobe factory未実装で8失敗／1成功。その後9件成功。
3. 未知scenarioがnormalへfallbackしない試験で1失敗／9成功を確認。未知名をDATA構築前にsupply_invalidで停止するようにして10件成功。
4. 固定生成故障3試験を追加し3失敗／10成功。DATA準備後・map拒否・snapshot生成後の固定境界を実装して13件成功。
5. 初回strict TypeScript検査では、凍結した0初期値のcountsが0 literal型になり、後続のnumber値を代入できないエラー1件が出た。Countsのreadonly number fieldを明示して解消した。制限やruntime設定は変更していない。

生成故障の注入は上記3境界だけで、各native primitiveの内部全prefixやfacade生成のOOMを網羅した試験ではない。probe用foreign snapshotはfinallyで論理退役する。mapChecksは供給mapの検査回数で、probe候補の追加純粋検査を含まない。予算・workモデルの計数としては使用しない。

## 最終検証

| 検証 | 結果 |
|---|---|
| source-map-supply新規合成試験 | 19件成功（32個の5操作列の独立状態oracleを含む） |
| 関連13ファイルの合成回帰 | 1,170件成功、失敗0 |
| npm run build | 成功 |
| 新規試験を入口とするstrict TypeScript検査 | 成功 |
| 新規試験・fixtureのESLint | エラー・警告なし |
| npm pack --dry-run --ignore-scripts | 441ファイル、tests／docs／新module・既存値core／K0/E fakeの混入0 |

関連対象はsource-map-supply／source-map-values／carrier-coverage／seed-bootstrap／bridge-work／value-admission／value-core-detailed／snapshot-value／raw-json-boundary／raw-json-syntax／store-recorder-persistence／store-recorder-binding／fixed-evidence-storeの`tests/review/*.test.ts`。今回全repository回帰は実施していない。梱包は一時cacheを使い、script起動・archive生成・公開・設定変更を行わないdry-runで確認した。

## レビュー修正（2026-11-07）

`a88c7e0`の個別レビューで、不正な結合を受理する不具合はなかった。一方、「同じmapであること」の検査を守るprobeがなかったので塞いだ。上記の件数は修正前の値として残す。

`map_copy`と`origin_input`は、どちらも`files`と`rows`も別物なので、先に`files`の比較で拒否されていた。そのため`map === this.#map`を消しても全件成功した。`origin_input`は元入力を保持する行を消しても、「mapが`undefined`」として拒否されるので成功していた。

**修正**

- fixtureに`map_wrapper`を追加した。`files`と`rows`は正規のまま、map objectだけを変えて渡す。追加した試験は、変更前のfixtureに対して2件失敗（未知のscenarioとして`supply_invalid`になる）するREDを確認してから追加した。
- `origin_input`でcheckの前に元入力を保持していること、正常な供給の生成段階が`ready`であることを試験に加えた（19件→22件）。
- 設計§9に`map_wrapper`を追記した。契約は変わらないので版は上げていない。

**ミューテーション**

`source-map-supply-fake.ts`への変異を実施した。修正前は55件中40件、修正後は56件中44件を検出した。追加した1件は`map_wrapper`の同一性を崩す変異である。

| 修正後も生存 | 件数 | 理由 |
|---|---:|---|
| 外から見えない | 6 | snapshot、`closed`、`counts`の凍結（いずれも外へ出ないか、結果へ展開される）。snapshotと一時snapshotの退役処理（参照は直後に手放される） |
| 到達しない | 4 | `this.#map !== undefined`と`!this.#snapshot`は、先に状態の判定で返る。2回目の`reject`は起きない。`checked`の段階は直後に上書きされ、その間に失敗する経路がない |
| 結果が同じ | 1 | mapの拒否を例外に変えても、同じ`supply_invalid`になる |
| 内容の差に依存しない | 1 | 第2セットを正規セットと同じ内容にしても拒否される。拒否は同一性で決まるためで、設計どおりである |

| 修正後の実行 | 結果 |
|---|---|
| `tests/review/source-map-supply.test.ts` | 22件成功 |
| 全テスト | 305ファイル、15,195件成功、失敗0 |
| repo全体の`npm run lint` | エラー0、警告374 |
| `npm run build`、`node tests/review/package-http-classification.mjs` | 成功 |
| 記録と同じ型検査、対象2ファイルのESLint | 成功 |

全テストは文書の更新前に実行した。上記で未実施としていた全体回帰は、この実行で補った。`npm pack`のファイル数は再確認していない。

## 未確認

realPins=not_supplied、authority=none、ready=false、hash=not_checked、mapping=shape_only、implementation／runtimeCoverage／nativeCost／実E／S要求量=unknown、coreInvocation=not_calledを維持する。供給成功は実期待値レビュー・採用・実hash一致・missing解消・実施点対応の証拠ではない。

実固定セット・実期待値pin・安全読取・実source hash照合・実施点／全費目の独立検証は未実装。既存carrierの5 gaps、正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。S発行・core接続・実接続・実通信・実機操作・設定変更・Pushは行っていない。今回の変更は未コミット。
