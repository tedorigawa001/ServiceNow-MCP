# OL-03 期待子一覧のscan単位前処理：合成検証

Date: 2026-10-20 / private合成経路。OS接続・実機操作・permit発行なし。

## 1. 変更

`scan_ops/collector/expected_groups.rs`で同じLayoutのcanonical entry参照を借用し、親bucket・count/prefix・stable scatterをscanごとに一度作る。親検索は通常宣言上のbinary search、virtual indexだけ別途名前順へ挿入する。毎directoryの2回全entry走査とslot配列割当を除去した。collectorのmetadata・hash・path再照合・cleanup・AfterScan/FinalIndexは省略しない。

各配列は既存vector上限と割当失敗guardを使う。共有work・期限・取消・sticky失敗を維持し、source操作より先に前処理を完了する。新しい予算・quota・model ID・実行権限は作らない。

## 2. 新規回帰テスト4件

- root/nested/空directory、prefix境界、virtual indexの先頭/中間/末尾挿入をslow oracleへ照合。全slotが一度だけ現れ、canonical参照とbasename順を保持する。
- E=5,501/T=1,001の形状で前処理100,000 work未満、各directory一覧取得を厳密に1 workと検査。通常のO(E·T)走査が復活すればこの検査を満たさない。
- 空入力・末尾非File・通常宣言の逆順・親欠落/非directory・virtual重複・上限超過・file/out-of-range parent slotを拒否。
- 小fixtureの前処理の全work prefixで上限停止・返金なし・sticky理由を検査。ちょうど必要量は成功、取消/期限切れは失敗。

感度確認として一覧取得に一時的に1 workを追加すると、大規模テストが取得2,002／期待1,001で失敗（exit 101）した。変更を撤去して再実行した。これは意図的なred試験であり製品差分へ残さない。

## 3. 計測結果

5,501 entry（directory1,000/file4,501、root込みT=1,001）：前処理77,890 work、一覧取得1,001 work。旧2回全entry走査相当は11,013,002。射影E+T=6,502を含む新しい準備部分は85,393 work（既存child/seen以降の費用は含まない）。大規模ケースはshapeの純粋テストであり、JSON受付・実sourceの5,501件完走の証明ではない。

既存5 entry fixtureの3round各回：1,902 work、source876操作（cleanup込み）、payload4,590 bytes、peak owner5。旧1,886から16増えた。I/Oや検査を省いて改善したものではなく、小入力の固定費増を明示する。

コミット分割時には最適化前の列挙部分を分離・再構成し、前工程だけのsnapshotで1,884 workを再計測した（[前工程記録](E2E_BEST_PRACTICE_R2_OL03_FULL_COLLECTOR_SYNTHETIC_2026-10-20.md)）。そのコミット基準の増分は18である。上段の16は先行作業ツリー1886との比較であり、異なる基準を混ぜない。

## 4. 検証コマンド

- `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml`：681 passed（新規4件含む）。
- `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings`
- `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml`
- `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check`

上記clippy（warnings拒否）・release build・fmtと`git diff --check`は成功。

## 5. 残課題

full metadata・walk/rewalk・snapshot・再検証を含む全体workモデル/受付と承認quota producerは未対応。通常strict ClosureSourceへのbridge・OS backendも未接続。全体受付無効、本番policy未投入、DER/absence停止、telemetry保留を維持する。トークン発行・設定変更・Pushは実施していない。
