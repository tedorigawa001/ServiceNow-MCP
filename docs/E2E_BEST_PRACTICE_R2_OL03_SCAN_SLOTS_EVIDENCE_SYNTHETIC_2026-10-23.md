# BP-5 R-2 OL-03：ScanSlotsEvidence合成検証

Date: 2026-10-23 / Source baseline: `52acb6c` / Scope: 固定3slotの内部型・合成issuer・発行前提・一度限り消費。実PDI E2Eではない。

## 1. 独立fragmentと停止境界

[供給証拠設計draft-0.4 §13](BEST_PRACTICE_BP5_R2_OL03_SUPPLY_EVIDENCE_DESIGN.md)のScanSlotsEvidence／ScanSlotInputs／ScanSlotsCheckedを実装した。**PolicyCapsは未確認**で、全体のPolicyCaps→Slots順序を入れ替える実装ではない。checkedは独立したslot検証片であり、PolicyCapsChecked・ValidatedSupplyParts・ProtectedSupply・実行permitへ変換できない。準備Envelope/通常strictには接続しない。

- [共通slot検査・消費](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/supply_evidence/slots.rs)
- [sealed backend状態境界・合成ScanOps](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/supply_evidence/slots/backend.rs)
- [固定合成factory・発行](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/supply_evidence/slots/synthetic.rs)
- [型付きheld binding](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/supply_evidence/held.rs)
- [合成回帰テスト](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/collector/tests/session_bridge/slots_evidence.rs)

## 2. 発行前提・消費契約

同HeldEvidenceInputsとHeldSourcesCheckedを値で受け取り、held専用moduleのSlotBindingを得る。同issuer/inspection/budget/session/started、未session開始・未generated/used、前段発行/消費、immutable held owner、leaf origin、record/topology lineage、source stamp、BoundTargetを結合する。copyしたpath/FD番号や単なるround番号は証拠にしない。

合成factoryは新規の3sourceを固定順Initial→BeforeM4→AfterM4で作る。source/backend/model/factoryをcallerから受け取る口はなく、開始状態境界はsealedである。唯一の実装はcfg(test)の合成backend。source自身の各ScanOpsメソッドは、失敗も含めて操作試行を記録する。後からwrapperのflagだけをfreshへ変えて受理する設計ではない。

取得検証・発行・消費の各phaseで3slotの存在、round順、取得時canonical identity、相互の非alias、固定の試験用model、source自身の未開始状態を確認する。固定modelは本番collector/backend承認の代替ではなく、本番impl/constructorはない。合成backendは成功handle/scan/cleanup証拠を返さない。

slots issued/usedを同budget claimへ置き、発行/消費試行はwork前に不可逆消費する。issuerのissued_hereと同SlotIdentityも必須。proofのdrop・失敗後の再発行、複製fixtureの二重消費、別budgetを拒否する。元理由はSupply(Slots)のInputRejectedへ保持する。release/checkpoint観測は独立片ではNotReachedで、OS解放や固定discard完了を捏造しない。

## 3. テスト結果

| 対象 | 確認内容 |
|---|---|
| 固定3slot | 3つの入替え組合せ、各slotのround改変・欠落・別identity・未知model・重複identityを取得/発行/消費時に拒否 |
| 非alias | 意図的にsourceとcanonical identityの両方を重複させたfixtureも拒否 |
| source未開始 | 各3sourceでopen、ACL init、enum、read、metadata、cleanupの操作試行後を全phaseで拒否。失敗した試行も開始済み |
| held結合 | 別Held token、開始済みsession、record/topology source stamp・lineage・leaf origin・未発行held issuerを拒否 |
| 一度限り | 二重発行、proofをdrop後の再発行、複製fixtureによる二重消費、未発行issuerを拒否 |
| budget | prepare/取得/発行/消費で同時刻の別budgetを拒否。取得/発行/消費各4 workの0〜4境界、各課金直後の取消、先行deadline・sticky理由保持を確認 |
| 非実行/解放 | 正常検証のbackend操作0、既存metadata/topology/payload counters不変。source値3個とheld resourceの解放、proof/checkedがresourceを延命しないことを確認 |
| move/型 | container移動後も受理。非Clone/非Copy/非serde・固定opaque Debug、proof≤32 bytes、bridge claim≤64 bytes |

既存collector traceは全ケースで未開始。slot状態/identityの改変口はcfg(test)だけであり、本番のmutable source getterや状態resetは追加していない。

## 4. 費目と検証過程

prepare1＋取得検証4＋発行4＋消費4＝**13 work**。各4は入口1＋固定slot guard3であり、独立成功fixtureの実消費と照合した。既存Context/Records4、HeldSources2、run_creation17へ単純加算して全体上界とはしない。cap承認と全体費目所有の統合は未対応。

新規Rc allocationはsource identity3、slot issuer identity1、test計数observer1。SlotBindingの既存identity/origin/lineage参照、source配列・held/source/receiptの所有量、途中状態/解放費を独立resource台帳から除外しない。proofはidentity参照だけでsourceを保持しない。

未実装module参照でredを確認してから縦断経路を追加した。実装途中の戻り値lifetimeの曖昧さはproof自身のlifetimeを明示し、戻り値に現れる合成backend型の可視性はopaque型だけを試験範囲へ広げた。field/constructorの可視性は広げていない。CandidateのDebugも生値をderiveせず固定opaqueで実装した。

未開始guardを一時除去すると、開始済みsourceの取得が成功して回帰テストが失敗した。guard復元後に再検証し、一時変更は最終ソースへ残していない。

```text
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

Rust全体 **951 passed / 5 suites**（baseline 943＋新規8）。Clippy警告なし、release build・整形チェック成功。通常strict本体・records_v2は未変更。

## 5. 残課題

PolicyCapsの承認主体・必要profile/初回decodeとの順序、本番backend/issuer、準備Envelope・上位診断の接続、全体work/resource上界・受付は未対応。全体受付無効・telemetry保留・APPROVED_REGISTRY=None・通常v2 Unavailable・gate92・DER/absence停止を維持する。OS接続・実機操作・token発行・設定変更・permit発行は本工程の対象外。
