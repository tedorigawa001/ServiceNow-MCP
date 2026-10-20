# BP-5 R-2 OL-03：immutable宣言のstrict pipeline接続・decode削減

Date: 2026-10-20 / Status: 合成sourceによる内部接続。work事前受付・実source/permitなし。

## 1. 範囲

[再利用設計draft-0.3 §10](BEST_PRACTICE_BP5_R2_OL03_ROUND_DECLARATION_WORK_DESIGN.md)の内部pipeline接続を実装した。元523件に3テストを追加する。
telemetry調査は保留。実機/PDI操作・API実接続・token発行・設定変更・本番policy投入・実署名/permit発行は行っていない。

## 2. 接続と維持する検査

- strict verifierをrecord三者/全projectionの検証とNode entry整合へ分離。record側はscan前後ともhash-first strict検証を実施し、schema/registry両role・root/path/hash/UID/GID/groups/platform/承認/期限を元bindingへ照合する。
- 各roundの前側exact再読/clock/record検証後に、同receipt/target/context/nonce/budget originへ結合したscopeを作り、indexを1回decodeする。scan後は同じtreeへraw hash/header・全宣言/親/全集合検査を実行する。
- scan後のrecord exact再読/metadata/path/clock・record strict検証の後に、raw再認証/全宣言/Node整合を改めて検査し、最新clockとscope終了guardを通す。別roundはfresh nonceで新しくdecodeし、前roundのtree/観測を使い回さない。
- observationへfresh nonceを結合し、既存lineage/全RecordBinding/enumとともに比較する。enum/内容が合っていても別nonce/前round nonceはChanged。実metadata/identityの真正なproducerを作ったものではない。
- 元10秒/start/cancel・暫定100万work・payload2GiB・A/B予約・metadata/name/topology/EINTR枠をresetしない。失敗理由を保持し、後続M4/roundを停止して全owned resource/pinsを解放する。旧sourceの合成projectionは呼ばない。

## 3. 新規3テストと既存再検証

| 試験 | 確認 |
|---|---|
| pipelineのdecode削減 | 全体index decode3回、scan時点の累積は1/2/3。record三者検証は全6回、scan時点は1/3/5。record再読6cycle、固定3scanを維持 |
| 観測nonce | 全roundで別nonce、M4前/後で前round nonceを返す。enumは正しいままChanged、decode/record検証数と停止位置、M4到達有無を確認 |
| 4,006 entry | 架空F=4,002/D=4、既存small fixtureへfiles配下4,000件を追加。旧9parse相当のindex-only手順は100万workでLimit、新pipelineは3decode/6record検証・471,312 workで成功 |

既存のscan前後3record差・path/metadata差・全source呼出し失敗、全roundのmissing/duplicate/非Node改変、late scan成功のcancel/deadline、共有work末尾枯渇、元期限/実効groups、sampled checkpointの期限/取消とRAII解放試験も再実行する。
大小fixtureともobservedは架空の比較入力。大規模比較は固定fake clockを使い、CPU実行時間/実filesystem/RSSのベンチマークにしない。

## 4. 実行記録

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml pipeline_decodes_index_once_per_round_without_caching_strict_record_checks
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml strict_cases
bdo proxy cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml larger_fixture_fits_shared_cap_where_legacy_nine_parse_index_sequence_does_not -- --nocapture
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

- 最初に3decodeの試験を追加し、現行9回で期待どおり失敗（left9/right3）することを確認。接続後は3decode/6record検証で成功した。
- nonce試験と大規模fixtureを追加し、strict_casesは19件成功。大規模fixtureの現在のwork課金値は471,312。
- 感度確認：scan後record strict検証を一時省略すると3回になり、6回維持の試験が失敗。observed nonce比較を一時無効化すると正しいenumの別nonceを誤受理し、拒否試験が失敗。両条件は復元した。
- 復元後、全体526件（5 suites）成功、release build成功、Clippy指摘なし。cargo fmt/fixture rustfmt、4文書のlocal link/コードフェンス/行末空白とgit diff --checkも成功。

## 5. 残課題・限界

work_model_id/shape統計・固定費128/R_max/W_scan/W_otherの証明、N+1のobserved早期guard、全残工程の受付/予約は未実装。現在の課金値を全CPU workの証明や受付certificateとみなさない。scope生成に伴うpin-memory hash等を含む全費目は引き続きモデル化/検証が必要。
work capを緩めたり、phaseごとにresetしたりしていない。大規模合成fixtureの成功から本プロジェクトの実閉包が通るとは主張しない。
実record/collector/context producer、OS metadata/path/clock/FD台帳、lease/原子性/ABA、hard中断/RSS、独立compile-fail検証は未対応。実運用入口への接続・公開permit化はしない。
APPROVED_REGISTRY=None、通常v2入口Unavailable、runtime gate92、DER/absence停止と既存public JSON/exit codeを維持する。
