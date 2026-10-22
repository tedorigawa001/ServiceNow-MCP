# BP-5 R-2 OL-03：固定body完了helper・private body接続 合成検証

Date: 2026-10-22 / Baseline: `39f643e` / Kind: 合成sourceによる内部検証。通常strict全体・実OS/PDIの検証ではない。

## 1. 範囲

[外側orchestrator設計draft-0.3 §13](BEST_PRACTICE_BP5_R2_OL03_OUTER_STRICT_ORCHESTRATOR_DESIGN.md)に従い、ownerの固定body完了helperと、receipt検査・外側clockから固定3位置までのprivate bodyを実装した。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。通常strict.rs全体の差替え、OS接続・実機操作・token発行・設定変更・本番policy投入・permit発行は行わない。

## 2. 変更内容

- `connection_owner/body.rs`：private Inputs、borrowedなbody::run、opaque PendingBody。元source/held等はcallerから借用し、通常のcomparison getterやRecordComparison変換は提供しない。
- `topology_adapter.rs`：元owner/root/実AfterM4 ack/3slot消費を照合するone-shot complete_body。body_done_startedはfallible処理前に消費し、終端checkpoint後だけ成功する。
- `session.rs` / `session/resources.rs`：ResourcePolicyを一度だけ移すopaque ResourceInputと狭いconfigure_input。本番constructorは追加せず、合成input生成はcfg(test)のみ。既存test configureは同じbridgeを使い、元の検査/課金を維持する。
- `collector/tests/session_bridge/body_orchestrator.rs`：合成source・時計・fault注入による新規7テスト。

入口で元budgetの未使用session claimとpolicy/全3Quotasの存在を確認し、validate_receipt→同RecordSourceのclock_check(460000)→唯一owner/configure→Initial→固定compare/BeforeM4/M4→handoff/AfterM4→body完了の順に実行する。任意callback/test ack/旧ClosureSource fallbackは使わない。

失敗段階はOuterPhaseへ記録し、実StrictInspectionFailureを丸ごとOuterStrictFailureへmoveする。owner停止通知の戻り値で元CompletionFailureを消さない。body末尾失敗はactive roundなし・新cleanup票なしで、元owner/session/rootを停止する。

## 3. 新規7テスト

| テスト | 確認内容 |
|---|---|
| `private_body_rejects_missing_resource_input_before_receipt_clock_or_owner` | policy欠落はEntry/Unavailable、source clock/record操作0・scan操作0・owner/session claim未開始。release/checkpoint観測はNotReached |
| `private_body_connects_receipt_clock_and_all_fixed_positions_without_releasing_outer_inputs` | 正常3scan開始時のmetadata履歴がInitial=[]、BeforeM4=[M0,M1,M2,M3]、AfterM4=[M0,M1,M2,M3,M4]。同RecordSourceの再読6cycle、temporary handle/scan resource解放を確認。PendingBodyのDebugは固定文言、entitlement gateはUnverifiedXmlのまま |
| `private_body_receipt_and_outer_clock_errors_prevent_owner_and_scan` | pin bytesのhash不整合、外側clock取得失敗/clock skew/遅延取消/期限、Quotas欠落・入口work不足でowner/scan未開始。owner生成/configureのwork不足prefix1〜5でもscan0、理由/段階を保持 |
| `private_body_retains_real_scan_diagnostics_and_m4_failure_stops_after_round` | 全3位置×操作失敗/hash不一致/解放未確認の9ケースで実cleanup診断・summary・roundを保持し、後続scanを始めない。M4取得失敗はCompare/MetadataUnavailable、BeforeM4までのscan2・再読4cycleで停止 |
| `private_body_final_owner_guard_checks_every_work_and_deadline_boundary` | 入口の課金後取消と全3時計境界、body末尾2課金の不足/課金後取消・全6時計境界を確認。末尾では再読6cycle後でもBodyCheckpoint失敗、round/cleanup票を再構築しない |
| `fixed_body_helper_rejects_early_duplicate_and_foreign_budget_completion` | 実3位置完了後のhelper追加費2 workを確認。早期呼出し、二重消費、別budget originでBinding、owner/sessionがStopped、同budget再開不可。試験口は実helperへのcfg(test)委譲のみ |
| `pending_body_and_resource_input_cannot_be_cloned_or_serialized` | PendingBodyとResourceInputが非Clone/非Copy/非serdeであることをコンパイル時に確認 |

index decodeは既存固定kernel内の1箇所/roundを維持する構造であり、新しい独立計数器によるdecode回数の測定は行っていない。全検証で元SharedBudget/共有retryを使い、source factoryを追加していない。

## 4. TDD・初回失敗・変異

1. policy未提供時の未到達テストを先に追加し、body module未実装のコンパイル失敗を確認した。
2. 接続後、正常系を追加し、receipt/外側clock/各scan/M4/予算境界へテストを拡張した。
3. helperの直接検証はprivate visibilityで初回コンパイル失敗した。本番の可視範囲は広げずcfg(test)の委譲口を追加した。続くcompileではowner/rootの共通lifetimeが必要と分かり、同じ'sを明示して借用結合を保った。unsafeやRefCellによる回避は行っていない。
4. receipt検査省略の一時変異ではReceiptの失敗がInitialまで遅れ、未到達テストが検出した。外側clock省略でもOuterClockがInitialへ遅れ、同テストが検出した。
5. body完了helper省略の一時変異は末尾guardの予算境界テストが検出した。すべて復元して全体検証を行い、変異は保存していない。

## 5. 費目

- O.outer_entry：1 work、正常時のclock観測3。
- O.outer_body_done：2 work、正常時のclock観測6。
- 追加control費は3 work、既存coupling30と合わせて33。既存resource configureの1 workやR/I/scan/tail/ack費と区別する。
- receipt/hash/外側clockは既存関数のまま。新しいscan/再読cycleや予算/retryは生成しない。

これは内部計数であり、全体受付用の確定上界・運用cap承認ではない。全体受付は無効のまま。

## 6. 最終検証

```bash
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git diff --check
```

- Rust全体：**878 passed、0 failed、5 suites**（baseline871＋新規7）。
- Clippy（警告をエラー扱い）、release build、rustfmt、diff check：成功。
- 通常strict.rsとrecords_v2.rsに差分なし。

## 7. 未接続範囲

今回のbodyは外側source/topology_source/held/recordsを借用し、それらを解放しない。テスト内の手動dropや追加checkpointは合成検証用であり、本番の固定解放section・解放後の最終checkpointを接続した証拠ではない。

PendingBodyは元比較結果・budget origin/session claim/startedを保持するが、実解放後のidentity付き消費とmerge_after_release接続は未実装。成功も失敗も解放済み・最終strict結果・実行permitには変換しない。外側所有/解放、上位診断保存、新しい全体work/resource上界、保護policy供給とOS解放保証は次工程である。
