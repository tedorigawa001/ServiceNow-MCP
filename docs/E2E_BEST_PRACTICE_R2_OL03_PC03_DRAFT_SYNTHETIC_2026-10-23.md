# BP-5 R-2 OL-03：PC-03 allocation view・非実行Draftの合成検証

Date: 2026-10-23 / Source baseline: `ff71bc5` / Scope: view・Draft・budget側one-shot state・Unknown finalize拒否。実PDI E2Eではない。

## 1. 実装範囲

[PC-03詳細設計draft-0.2 §11](BEST_PRACTICE_BP5_R2_OL03_PC03_PARTS_ALLOCATION_DESIGN.md)の最初のsubsetだけを実装した。

- [allocation view](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/projection/caps/allocation_view.rs)
- [非実行Draft](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session/resources/draft.rs)
- [budget側claim/state](../native/r2-outer/src/signature_boundary/positioned_read/allocation_claim.rs)
- [合成テスト](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/projection/caps/tests/draft.rs)

ScanCapsComparedを値で消費し、比較した実cap snapshot/Initial scope・estimate/projection claim fieldへの借用、元bridge/session claim・started/retry/payloadを保持するviewを得る。raw35項目をコピーして証拠へ再入力する口や汎用factoryはない。viewもDraftも非Clone/非Copy/非serdeで、Debugは固定opaque。

Draftの正本stateは元budgetに一つ。Fresh→DraftClaimed→DraftReady、finalize試行時にFinalizeClaimed、失敗/abandon時にStoppedとなる。最初のfallible処理より先に試行を消費する。完成parts/transfer状態は未追加。viewの値だけのboolによるone-shotではない。

## 2. Unknownと非実行境界

5項目（外側owner、管理allocation、bootstrap bytes/work/live）はUnknownだけを持つ固定型/配列で保持し、Verifiedや値入力/setterは用意しない。finalizeは`Result<Infallible, Failure>`を返し、5項目の検査後Unavailableで必ず停止する。成功値を生成する分岐そのものがない。

ResourcePolicy/ResourceInput/Quotas、PolicyAllocationParts、完全性証拠、論理slotキー/実source結合、供給/permitへの昇格は実装していない。元PC-01の模擬WitnessやPC-02の部分比較を全体確認済みへ読み替えない。capの唯一の発行元は引き続きcfg(test)の合成snapshotで、本番capを投入していない。

## 3. 検証内容

| 対象 | 合成で確認したこと |
|---|---|
| 同由来 | 同scopeを通じてreceipt/target/context/token、実cap/estimate/projectionの借用を継続。別receipt・同値でもfresh roundの持込みを拒否 |
| one-shot | 複製view fixtureからの二重Draft、drop後、意図的forget後の再生成を拒否。private test fixture以外に複製口なし |
| 別budget | view発行/Draft作成/finalizeで同時刻の別budgetを拒否し、元/提示両方を停止 |
| 時間/共有枠 | 各stageでretry変更、残payload不足、session開始済み・bridge generated/usedを拒否 |
| 中断/上限 | view4・Draft5・finalize9の全work境界でLimit、課金直後のCancelled/Deadlineを確認し、再試行時の追加workなし |
| stop伝播 | 他evidence/preparation flagなしでDraftClaimed/DraftReady/FinalizeClaimedを止め、claimが同じ第一理由とStoppedを保持することを直接確認 |
| 先行理由 | DraftReady後の外部Deadline/Cancelled/HashMismatchがclaimから見える。finalize/DropがUnavailableへ置換しない |
| Unknown | 5件のまま保持されfinalizeはUnavailable。quota/session/PolicyCaps発行/bridge generationへ到達しない |
| 非実行/保持 | payload/reservation/retry/metadata/topology会計不変。source/FD/実quota予約は所有せず、Dropはcleanup完了証拠を生成しない |
| 型契約 | move-only/非serde/opaque Debug、bridge claim≤64 bytes。borrowを同with_round内で閉じる |

forget fixtureは再発行を防げるかを見るため、非実行Draftの少数のRc参照を意図的にリークするテストである。OS資源の解放確認ではなく、実source/FDをリークさせる試験でもない。外側producerのlifetime/compile-fail接続はPC-04の残課題。

## 4. 費目・感度確認・結果

viewは4 work（入口1＋固定guard3）、Draft作成は5（入口1＋view guard3＋publication1）、finalize拒否は9（入口1＋view guard3＋Unknown5）。正常Draft生成からUnknown拒否までは18 work。先行PC-02 projection18/比較45は再実行せず、各旧固定費も回帰テストで維持した。

新規heap allocationなし。比較結果に実cap/scope/claim-fieldの借用と元session Rcを、Draftに元owner Rcを保持する。Rc/borrow/固定配列の保持量を全体capで承認済みとは扱わず、全体work/resource上界へ単純加算しない。

配賦状態をSharedBudget::stopのclaim記録条件から意図的に一時除去すると、`each_started_allocation_state_latches_budget_stops_without_other_bridge_flags`がclaim.failure=Noneを検出して失敗した。条件を復元し、最終全体テストを実行した。一時変更は最終差分へ残していない。

```text
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

Rust全体 **987 passed / 5 suites**（baseline 978＋新規9）。Clippy警告なし、release build・整形・差分チェック成功。

## 5. 残課題と停止状態

論理slotキー/非実行のcap配賦写像と独立oracle、未導出5項目の全体必要量/完全性issuer、実cap/clock、完成parts/証拠発行と固定移譲、PC-04の安定外側owner/Initial継続、全体work/resource受付は未対応。

本番cap投入・全体受付・通常strict差替え・OS接続・実機操作・token発行・設定変更・permit発行を行っていない。telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。

## 追補：Stopped状態の非上書き（2026-10-23）

Draft作成・finalizeの試行開始は、`allocation.replace`の代わりに`ProtectedBridgeClaim::begin_allocation`を使う。直前状態が`Stopped(e)`ならDraftClaimed/FinalizeClaimedへ一時的に書き換えず、そのまま拒否する（従来もBinding拒否後に`stop_allocation`が`Stopped(e)`へ戻していたため最終状態は同じ）。Fresh/DraftReadyからの不可逆な試行消費は変更なし、work数（view4・Draft5・finalize9）も不変。新規1テスト`begin_allocation_never_overwrites_a_stopped_state`を追加し、Rust全体988 passed。
