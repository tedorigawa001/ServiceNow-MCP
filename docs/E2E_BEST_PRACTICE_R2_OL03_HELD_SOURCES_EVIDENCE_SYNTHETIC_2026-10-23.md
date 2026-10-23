# BP-5 R-2 OL-03：HeldSourcesEvidence合成検証

Date: 2026-10-23 / Source baseline: `6dae716` / Scope: 内部型・合成issuer・発行前提・一度限り消費。実PDI E2Eではない。

## 1. 実装範囲

[供給証拠設計draft-0.3 §12](BEST_PRACTICE_BP5_R2_OL03_SUPPLY_EVIDENCE_DESIGN.md)のHeldSourcesEvidence/HeldSourcesCheckedを実装した。前段Context/Recordsと同inspection/budget/issuerを要求し、取得済みの同じsource/resourceをimmutable所有領域へ封じる。本番issuer・外部設定・raw FD/pathによる構築口はなく、取得/発行と不正fixture生成はcfg(test)だけである。

- [held内部型・合成取得/発行・消費](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/supply_evidence/held.rs)
- [合成テスト](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/collector/tests/session_bridge/held_evidence.rs)
- [合成topology/MetadataOps fixture](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/tests.rs)

合成openerのattach済み保持scopeに対し、同BoundTarget・leaf originを照合し、既存recheck→同resourceの新metadata取得/normalize→origin再照合→recheck→checkpointを実行する。recheckは祖先origin/snapshot、固定anchorから全edge、leaf namespace、record lineage/binding/targetを検証する。metadataはACL・xattr・FS・statとopen snapshotの完全一致を確認する。

Phase::M0は既存metadata collectorへ渡すタグとして使うだけで、A/B走査・ComparedM0M4・round完了・Closed・ackを作らない。payload読取は0。ReadScopeの一時予約とACL cleanup予約は、成功・失敗・取消時に返却する。

## 2. 発行・消費と所有権

SharedBudgetの既存bridge claimへheld issued/usedを追加し、workより先に一度限りの試行を記録する。発行元HeldIdentityのissued_hereも照合する。証拠だけのdropで発行を回復できず、意図的に複製したtest fixtureの二重消費も拒否する。

消費にはContextRecordsCheckedを値で必須とし、同前段issuer・所有領域・leaf/open origin・record/topology lineage・record/topology source stamp・BoundTargetを固定数照合する。追加I/O/再parseはなく、containerをmoveしても同一性を維持する。別budget/issuer/source/lineageや未発行状態はBinding、元のDeadline/Cancelled等はそのままSupply(HeldSources)へ保持する。

source/resourceはHeldEvidenceInputsの所有であり、proof/checkedはidentity参照だけを持つ。record source→topology source→held→topology receipt→record receiptのfield順を固定した。proofが生存していても所有領域のdrop後にresourceを残さない。拒否票のrelease/checkpoint観測は独立subsetではNotReachedで、上位ownerの固定discardやOS close確認の証拠ではない。

## 3. 合成テスト結果

| 項目 | 確認内容 |
|---|---|
| 正常経路 | Context→Records→HeldSources。新metadataと前後path再照合を通して発行・消費し、消費時のI/O counters不変 |
| 取得前提 | 未完了records、別budget、別lineage/generation/target、open origin、open snapshot、祖先snapshot/個数の不一致を拒否 |
| leaf metadata | inode差、FS noexec、ACL present/不正sentinel/取得失敗、未許可xattr、names read失敗、after stat失敗、ACL stat差を拒否 |
| 単発操作 | fixtureの祖先数Kから`2×(3K+2)`を求め、各topology操作の取得失敗・取消・期限切れを個別に検証。失敗後の後段操作なし |
| cleanup | 各拒否/中断でtemporary made==dropped、live=0、leaf payload読取0、A/B予約0、metadata cleanup予約0。取消直後のACL handleも一度だけfree |
| 発行/消費 | 各1 work。残work0/1で拒否、2で成功。各guard前の取消/期限切れと課金直後の取消を確認。停止後の新workなし |
| 混入/再利用 | record/topology source stamp、record/topology lineage、leaf origin、未発行issuer、別前段token、別budgetを拒否。二重発行/消費拒否 |
| 非露出/型 | 非Clone/非Copy/非serde、opaque Debug。proof≤64 bytes、bridge claim≤64 bytes。resource/path/record/秘密をDebugへ出さない |
| 非接続 | collector trace未開始。既存通常strict、固定評価セット、既存17 work差分、停止gateは未変更 |

fixtureのmetadata fault/ACL計数は既存test-only sourceへ追加し、既定値0では以前の挙動を維持した。本番source/OS APIには接続していない。

## 4. red/green・検証過程

最初にHeldSources用module未実装によるredを確認し、縦断テストを通した。metadata fault用fixture fieldの未実装でもredを確認してから合成sourceを拡張した。

取消用closureがbudgetを借用して発行処理と競合したテスト実装は、startedのscalarコピーだけを捕捉するよう修正した。topology操作数の試験では、別fixture由来の28固定を使っていたため、対象fixtureでは存在しない操作位置のfaultが発火せず失敗した。対象Kから独立に算出する方式へ訂正し、製品の上限・停止条件は緩めていない。

二重消費fresh guardを一時除去すると、複製fixtureが成功し回帰テストが失敗することを確認した。guardを復元して再検証した。一時変更は最終ソースに残していない。

検証コマンド：

```text
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

Rust全体 **943 passed / 5 suites**（baseline 933＋新規10）。Clippy警告なし、release build・整形検査成功。通常strict本体・records_v2の差分なし。

## 5. 費目と未対応

発行1＋消費1＝2 workは固定guardだけで、取得dispatch1と動的取得費は別である。2回のrecheckに含まれる可変長binding/path照合、metadata単発操作・cleanup等を2/3で代表させず、全体work/resource上界へは未統合とする。既存metadata/topology/予約上限・100万work・10秒の共有予算を維持した。新規allocationはHeldIdentity/topology source stampのRc各1個で、既存identity/origin/lineageのRc参照・所有source/ancestor/receipt量も独立resource費に残す。

本番opener/issuer、準備Envelopeへの接続、PolicyCaps/ScanSlots、取得前失敗/固定discard診断の上位接続、全体受付・cap承認は未対応。全体受付無効・telemetry保留・APPROVED_REGISTRY=None・通常v2 Unavailable・gate92・DER/absence停止を維持する。OS接続・実機操作・token発行・設定変更・permit発行は本工程の対象外。
