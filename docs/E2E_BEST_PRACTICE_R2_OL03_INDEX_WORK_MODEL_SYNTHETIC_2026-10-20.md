# BP-5 R-2 OL-03：index work_model・shape・上界計算の合成検証

Date: 2026-10-20 / Status: index-only内部モデル。全工程の事前受付・予約・実source/permitなし。

## 1. 範囲

[設計draft-0.4 §11](BEST_PRACTICE_BP5_R2_OL03_ROUND_DECLARATION_WORK_DESIGN.md)とprivateな[work_model.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/work_model.rs)を追加した。元526件へ12合成テストを追加する。
telemetry調査は保留。実機/PDI操作・API実接続・token発行・設定変更・本番policy投入・実署名/permit発行は行っていない。

## 2. 型・課金と失敗

- 固定ID`bp5-r2-index-work-0.1`だけを認め、係数表/任意IDの設定口は設けない。未知/空/保存profileのID不一致をtyped ModelMismatch→Unavailableとして保持し、fallbackしない。
- strict検証済みの同round immutable indexからB/F/D/Pを収集し、index自身の親prefixも含める。非Clone/非serde・private fieldのprofileを元RoundDeclarationへ保持する。summary copyは比較用で、profile/予約/authorityを作る入力にはならない。
- B=1〜16MiB、N<=100000、P<=63(N+1)を防御的に検査する。checked add/mulはLimit(Overflow)、shape/数値capはLimit(Shape/Cap)を保持し、BudgetのDeadline/Cancelled/Limit/先行失敗を潰さない。
- 収集はN+P+3、計算は8、各reuseのmodel照合は1 unit。index kernelの固定実消費は32＋3＋8＋2＝45で、固定枠128の残り83を消費/予約/返却しない。
- J_index=C+20+26F+17D、上界はJ_index＋6C＋9N＋3P＋**100001**＋(N+P)＋128。N+1早期guardが未実装なので、上界だけN+1にしない。
- 3round上界はcheckedで3倍し、cap helperは量比較だけを行う。等号成功/1unit不足・指定量100万超はLimit。spent控除・phase受付・予約は行わない。summary/cap helper呼出しはそれぞれ追加3 unitで、通常index kernel上界とは別にW_otherへ計上する。
- raw hash/全宣言・全集合検査、record検証6回/index decode3回、前後再読、同receipt/round/budget結合、各既存台帳とgate停止を維持する。

## 3. 新12テスト

| 群 | 確認したこと |
|---|---|
| sealed summary | raw長・F/D/P・model/各費目/1round/3roundが一致。取得は追加3 unit、元startとI/O等の台帳は不変 |
| 固定費 | 実index kernelを実行し、実測workからJ/hash/entry/parent/observed/収集可変費を引くと45。128以下、global Mとの差・未使用固定枠をspendしない |
| 計算器 | 計算は8 unit。N+1ではなくglobal100001を使用。F4500/D1000の例はindexだけで100万を超える |
| shape制限 | B16MiB/N100000/P63(N+1)の等号と超過、B0を検査。算術用のtest-only shapeであり、100000件のpayload parse成功を主張しない |
| overflow/chunk | checked add/mul/sum、test-only極大counts、1/65535/65536/65537/16MiBのchunk境界 |
| cap | index-only上界等号、1unit不足、available=100万/100万超。予約は常に0 |
| model不一致 | 空/未知/次版ID・test-only profile ID破損をUnavailable、defaultへfallbackなし |
| 共有cap/先行理由 | 計算8 unitが残量8で成功し、次1unitはLimit。残量不足と既存HashMismatch/Cancelled/Deadlineを優先 |
| 期限/取消 | 計算各checkpoint、統計収集＋計算各checkpointへの個別挿入。最後のclock読取中のcancelで遅延成功が出た場合もcaller guardで破棄 |
| mixed/deep/escape | file3/directory65、最深64componentと深いindex自身、P2082。escaped key/空白padding・最大16MiBでJ/shape費/固定45が一致 |
| scope | 正しいmodelでも同enumの別nonce scopeからsummaryを得ようとするとBinding |

表の複数行は同じtest内のmatrixを含む。追加test関数は12件。
固定費試験はindex kernelに、record strict core外のprojection4 stepと前後Node検索を含めた課金点の照合。core visitor/serdeやOS内部の全CPU時間/RSSの上界ではない。

## 4. コマンドと経過

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml work_model
bdo proxy cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml larger_fixture_fits_shared_cap_where_legacy_nine_parse_index_sequence_does_not -- --nocapture
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

- 初期9件成功後、deep/escape/収集中断/scopeのmatrixを追加して12件成功。
- Clippyはmanual_is_multiple_ofと定数だけのassertionを指摘。剰余を標準APIへ、assertionを実測差分へ置き換え、警告抑制や検査の弱化なしで解消した。
- 固定枠を一時44にすると45を覆えず固定費試験が失敗。model不一致guardを一時無効化すると未知IDを誤受理し拒否試験が失敗。両条件は復元した。
- 復元後、全体538件（5 suites）成功、release build成功、Clippy指摘なし。cargo fmt/fixture rustfmt、4文書のlocal link/コードフェンス/行末空白・算術例とgit diff --checkも成功。
- 4,006 entry fixtureの現在の実消費は495,381 work。前段階の471,312との差24,069は3×(N4006＋P4004＋収集固定3＋計算8＋reuse照合2)。両値は固定fake clockによる現在の課金単位で、実配備/CPU時間のベンチマークではない。

## 5. 未対応・停止

accepted shapeの式はbootstrap前の未認証/不正JSONへ適用しない。不正入力には既存のraw byte/depth/container/work/期限/cancel停止を使う。
index-only cap helperの成功から全工程受付を作らない。record coreのR_max、scan/その他/モデル照合APIのW_other、未課金pin-memory hash等の全費目、管理allocation/FD/clock/lease、phase控除/残予約と実sourceは未対応。
課金workの式はhard CPU時間/RSS・原子性/ABA/OS適合の証明ではない。M_maxをN+1へ下げる変更やcore課金点/費目の変更ではmodel ID・式・計数試験を更新する必要がある。
APPROVED_REGISTRY=None、通常v2 Unavailable、runtime gate92、DER/absence停止を維持し、既存public JSON/exit codeを変えていない。
