# BP-5 R-2 OL-03：PolicyCapsEvidence合成検証

Date: 2026-10-23 / Source baseline: `40ea16f` / Scope: PC-01の内部型・固定合成issuer・一度限り消費。実PDI E2Eではない。

## 1. 範囲と停止境界

[詳細設計draft-0.2 §11](BEST_PRACTICE_BP5_R2_OL03_POLICY_CAPS_EVIDENCE_DESIGN.md)の合成subsetを実装した。

- [内部型・共通検査・消費](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/supply_evidence/policy.rs)
- [cfg(test)固定issuer](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/supply_evidence/policy/synthetic.rs)
- [合成テスト](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/collector/tests/session_bridge/policy_evidence.rs)

ApprovedCaps/ModelBundle/ResourceRequirementWitnessはprivate fieldの内部型。合成issuerは固定原票・模擬profile系列を生成し、cap/model/summary/clock/factoryを外から受け取らない。数値・digest・roleは合成用であり、**本番capを承認したものではない**。実profileの導出器や実resourceモデルの出力をWitnessへ変換する実装はまだない。

PolicyInputsは同HeldEvidenceInputsと消費済み前段のHeldSourcesCheckedを保持し、既存bindingで同issuer/receipt/context/leaf/source/topology/inspection/started/未sessionを検査する。Context→Records→HeldSourcesの実検証を既存合成fixtureで通してからPolicy段階へ入る。Policy発行/消費前にSlots issued/usedが立っていればBinding。既存独立Slots片を改変せず、PolicyCapsCheckedをSlots/ProtectedSupply/準備Envelope/permitへ渡すAPIは作っていない。

## 2. 検査と費目

| 対象 | 合成契約 |
|---|---|
| 承認原票 | 固定authority owner、revision/digest、適用role/build/係数identity、有限capとcoverage |
| モデル | 固定12要素のsnapshotと2つの32byte identity。未知/旧版混在はUnavailable、build/係数/role違いはBinding |
| 必要量 | 同合成authority/profile owner、同held系列。raw summaryからのconstructorなし |
| 項目 | 4×8（session/各roundのattempts5/total/live-cleanup/names）＋独立8項目。各項目を別々に比較し、未知項を0で埋めない |
| 期限 | valid_from≤now、expires>元started+10秒。合成monotonic clockの境界試験であって実clock証明ではない |
| 一度限り | 元budget claim上のissued/usedをfallible処理前に不可逆消費。別budgetと元claim双方の停止・第一理由保持 |
| 診断 | Supply(PolicyCaps)のInputRejected。Unavailable/Binding/Expired/Limit/先行Deadline・Cancelled・HashMismatchを保持 |

prepare1＋issue44＋consume44＝**89 work**を正常fixtureの実計数で確認した。各44は入口1＋binding1＋固定model1＋approval/期限1＋40比較。40次元は実システムの必要量/coverageを導出済みという主張ではなく、今後の保護projectionが満たす比較契約の合成試験である。比較器は加算・切詰め・飽和値を使わない。合成有限capの外にあるu64::MAXも拒否する。

合成authority/profile/issuer identityのRc allocationは3個。held/source/receiptはPolicyInputsが所有し、proof/checkedはidentityだけを保持する。正常/拒否/取消後にinputsをdropすると既存resourceのmade/droppedが一致することを確認した。OS closeの実確認や固定discard完了票には昇格しない。既存17や全体上界へ89を単純加算しない。

## 3. 合成テスト

- 40項目それぞれでcapの−1/同値/＋1とu64上端を検査。発行後に不足させた40ケースもconsumeで拒否。
- 12modelの各要素、cap/witness model、build、係数、role、revision、digest、authority/profile owner、欠落coverage/bootstrapを発行/消費時に拒否。
- 期限切れ・未発効・元deadlineと同値のexpiryを拒否。元started/予算の補充なし。
- 同値の別held token、held/source/lineage改変、session開始済み、Slots先行、未発行issuerを拒否。
- 二重発行、proof drop後の再発行、複製fixtureでの二重消費、prepare/issue/consumeで同時刻別budget混入を拒否。双方の停止と元第一理由を確認。
- 89個すべてのwork境界でLimit、各課金直後でCancelledを確認。取消flagを戻してもsticky停止し、追加I/O・scan・resource漏れなし。
- prepare/issue/consume前のDeadline・Cancelled・先行HashMismatchを保持。正常時のmetadata/topology/payload/reservation/retry counters不変、collector trace空。
- 非Clone/非Copy/非serde、固定opaque Debug、proof≤32byte、bridge claim≤64byte。checked存続中でもheld資源を延命しない。

必要量>capの比較だけを意図的に一時除去し、`policy_evidence_all_forty_dimensions_are_independent_and_exact`が「拒否予定のケースでproofを受理」して失敗することを確認した。比較を復元後、全体テストを再実行した。一時変更は最終差分に残していない。

## 4. 検証結果

```text
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

Rust全体 **963 passed / 5 suites**（baseline 951＋新規12）。Clippy警告なし、release build・整形・差分チェック成功。合成の比較条件一時除去は意図した感度確認であり、最終全体実行は復元後のソースで成功した。

## 5. 残課題

実承認原票/配備registry・実clock・BootstrapScope・保護profile projection/実必要量・全dimensionの網羅性・PolicyAllocationParts/ResourceInput/Quotas発行・PolicyCaps→Slots統合・P0〜P6の安定借用/Initial継続・全体work/resource受付は未対応。合成cap/模擬Witnessだけでそれらを確認済みにしない。

全体受付無効・telemetry保留・APPROVED_REGISTRY=None・通常v2 Unavailable・gate92・DER/absence停止を維持する。本番cap投入・通常strict差替え・OS接続・実機操作・token発行・設定変更・permit発行は行っていない。
