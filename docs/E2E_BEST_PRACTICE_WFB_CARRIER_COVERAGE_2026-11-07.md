# WF-B carrier／coverage strict値契約：合成検証記録

Date: 2026-11-07 / 実装基準HEAD: `54619ef` / 対象: [詳細契約§11](BEST_PRACTICE_WFB_SCHEDULE_CARRIER_SEED_HANDOFF_DESIGN.md#11-合成専用strict値契約とcoverage内部表現)。

## 変更範囲

- `tests/review/fixtures/carrier-coverage-core.ts`：独立したstrict DATA検査。返却可能20 carrier variant、12行固定coverage表、discriminated内部型、切離し／freezeと固定失敗返値。
- `tests/review/carrier-coverage.test.ts`：63合成case。carrier全20値・取得事実の取り違え・C2／C3拒否、12行Unknown保持、synthetic対応記録、表現上限、順序／余分field／欠落／proxy／getter／symbol／sparse配列・秘密非出力を検査。
- CHANGELOG・詳細設計・親2文書の参照を更新。既存K0／E fakeと実供給は変更しない。

開始時の設計はdraft-0.1だったが、作業中に`54619ef`のレビュー修正を検出した。最新版を読み直し、24値案から20返却値へ変更、C6追加、C2／C3拒否、credit用語、source内容SHA-256表現へ合わせた。この既存変更を巻き戻していない。

## RED／GREENと結果

1. carrierの最初の試験は新module未作成で失敗。その後、切離し値検査を実装して1件成功。
2. coverageの最初の試験は未実装functionで失敗（56成功／1失敗）。実装後57件成功。
3. 初期案の境界試験追加で75件成功。最新版契約への試験変更時は旧実装との差で24件失敗／39件成功となり、実装を合わせて63件成功。これは作業途中の契約変更によるREDで、旧製品経路の退行ではない。
4. 最終の関連回帰：下記11ファイル、**1,032件成功、0失敗**。全repository回帰ではない。

実行対象：carrier-coverage／seed-bootstrap／bridge-work／value-admission／value-core-detailed／snapshot-value／raw-json-boundary／raw-json-syntax／store-recorder-persistence／store-recorder-binding／fixed-evidence-store（すべて`tests/review/*.test.ts`）。期限・製品設定を変更していない。

追加検証：`npm run build`成功、対象試験とfixtureのstrict TypeScript検査成功、対象2ファイルESLint成功。`npm pack --dry-run --ignore-scripts`は441ファイル、tests／docs／新moduleおよび既存fakeの混入0。キャッシュは一時directoryを使い、設定変更・archive生成・公開はしていない。

## 保証と未確認

検査成功は未信頼の値適合だけ。revision文字列とsymbolから実source対応・発行元・実装coverageは証明しない。実source内容hashの再計算照合、全SC行の実施点・費目対応と独立イベントoracle、実E／S要求量、schedule／carrier pool供給、K0基底費・native反射／OOM／module初期化／実heap・CPU・GCはUnknown／未対応。64 slot・1,000,000反復・128文字は内部表現の有限上限であり、本番capの承認ではない。

S発行・pending／handoff・core接続・実供給・実接続・実通信・実機操作・設定変更・Pushは実施していない。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。今回の変更は未コミット。
