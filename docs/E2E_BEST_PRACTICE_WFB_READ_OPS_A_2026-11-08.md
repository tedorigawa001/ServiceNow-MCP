# WF-B (A)：共有上限・停止・単発ReadOps・結果slotの純粋fake検証

Date: 2026-11-08 / 実装基準HEAD: `dfc79ff` / [実装契約](BEST_PRACTICE_WFB_PRIVATE_READ_HASH_DESIGN.md)。

## 対象と閉鎖境界

新規`tests/review/fixtures/read-ops-fake.ts`と`tests/review/read-ops-fake.test.ts`。importなしの独立Session、固定FakeOps／FakeClock、内部resource・観測・有限read結果・file／row slotを実装した。実bytes／buffer／hash・固定source供給／MapSupplySnapshot・core・runtime・I/Oは使わない。CHANGELOG・親設計・供給設計の参照も更新した。

試験する受信量は模擬nの論理計数で、実bytesから測定した量ではない。file slotにhash_matchはなく、rowはnot_aggregated。hashConnection=not_connected、hashCalls=0、authority=none、ready=false、runtimeCoverage／nativeCost／実E／S要求量=unknownを固定する。既存carrierの5 gapsは変更しない。

## RED／GREEN・初回失敗

- 最初のopen／cleanup予約試験はmodule未作成で失敗し、実装後1件成功。単発observe／read、停止制御、固定scenario、共有quota、故障・結果slotの対照を追加するたび、未実装の入口／scenarioで失敗することを確認して実装した。
- 逆行を観測したclockを後から0へ戻すとcleanupTimingをwithinへ戻していた。専用試験のREDを確認し、clockの信頼失敗をstickyにしてunknownを保持した。同じ段階の共有受信／retry対照と合わせて3失敗／23成功から26成功へ進んだ。
- 最後のguard枠・部分slot生成の対照も、追加時に各1件REDを確認してから実装。最終35件成功。
- 初回型検査では、eof／interrupted／failedを1つのkind unionへまとめた結果bytesのnへ絞り込めない6件と、未実装factory importの1件を確認した。variantを明示的に分け、factoryの実装段階をそろえた。後に内部closureでprivate resourceのnarrowingが失われた2件は、同resourceをconstへ捕捉して解消した。型検査を再実行して成功。

上記は作業中の新規fake／型の失敗で、製品経路の退行や期限緩和ではない。実source接続はしていない。

## 独立対照と故障範囲

- 32 file・各262,144 byte、read160／observe64／open32／close32／cleanup予約32、受信8,388,608とguard578を独立の数値・BigInt対照で確認。
- 1 byte短読取65,536回の上限、初回interrupted＋retry32（read33）、file越しのread／retry／受信共有枠、要求長のdispatch前受付を確認。
- 正常8操作の全9部分prefixに対し、別記述したイベント表でopen／observe／read／close・受信量・guard／cleanup保存則を照合。本体のcounter／係数はimportしない。
- pre-cancel／期限到達の未dispatch0、同期throw1、取得なしと取得済み失敗、取得不明のopen throw、早いEOF・余剰byte・不正n、after stamp差、clock例外／逆行／不正値、取消／期限のread中観測、close失敗と後着期限、slot部分生成、終端後不変・秘密非出力を確認。

故障は固定scenarioの境界注入のみ。実native open／read／metadata／closeの故障、scratch所有やhash中断、実resource解放・GC・ゼロ化・heap／CPU上界は未検証。open取得不明ではcleanup予約を未使用返却せず、取得未確認／close_unconfirmedを保持するだけで、実資源の回収を証明しない。

## 最終検証

| 検証 | 結果 |
|---|---|
| read-ops-fake単独 | 35件成功 |
| 関連14ファイルの合成回帰 | 1,208件成功、失敗0 |
| npm run build | 成功 |
| 新規試験入口のstrict TypeScript検査 | 成功 |
| 新規試験／fixtureのESLint | エラー・警告なし |
| npm pack --dry-run --ignore-scripts | 441ファイル。tests／docs／新fake・既存値core／供給fakeの混入0 |

関連対象：read-ops-fake／source-map-supply／source-map-values／carrier-coverage／seed-bootstrap／bridge-work／value-admission／value-core-detailed／snapshot-value／raw-json-boundary／raw-json-syntax／store-recorder-persistence／store-recorder-binding／fixed-evidence-storeの`tests/review/*.test.ts`。全repository回帰は今回実施していない。梱包は一時cacheのdry-runで、script起動・archive生成・公開・設定変更は行っていない。

## 未実施

(B)の実scratch・同bytes hash／候補受理、(C)のsnapshot借用・行集約・連続private継続、実期待値pin・実source照合・S発行・core／実接続・実通信・実機操作・設定変更・Pushは未実施。実hash照合を既定テストへ追加していない。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。今回の変更は未コミット。
