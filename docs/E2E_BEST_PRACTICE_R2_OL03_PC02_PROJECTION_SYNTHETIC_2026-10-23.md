# BP-5 R-2 OL-03：PC-02保護必要量projection・cap比較の合成検証

Date: 2026-10-23 / Source baseline: `57ec28e` / Scope: 実ScanShapeProfileを保持する同ScanWorkEstimateからのscan必要量導出と合成cap比較。実PDI E2Eではない。

## 1. 範囲・変更した契約

[PolicyCaps詳細設計draft-0.3 §12](BEST_PRACTICE_BP5_R2_OL03_POLICY_CAPS_EVIDENCE_DESIGN.md)に対応する。

- [保護projection](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/projection.rs)
- [cap比較器](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/projection/caps.rs)
- [projection合成テスト](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/projection/tests.rs)
- [cap比較合成テスト](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/projection/caps/tests.rs)

既存profileの収集・15行のwork計算は追加実行せず、estimate内のprofileを借用してe/f/d/h/k/c/lを既存resource-0.2へ写す。生のShape/summary/数量からScanResourceRequirementsを発行するAPIはない。raw数量型の可視性はstrict内部に限定し、それ自体を保護された証拠に変換できる入口は作らない。

同estimate・inputs・receipt・context・Initial scope/token・元budget claim・started・retry snapshotとFresh状態へ結合する。非Initial・session開始済み・bridge generated/usedは拒否。estimateに一度限りのresource_projected、projectionに一度限りのcomparison_startedを置き、失敗前に不可逆消費する。元budgetのclaimを保持し、別budgetからの試行でも元/提示両方の停止と第一理由を保持する。dropで回復しない。

projectionはestimateへの借用を持つため、その存続中にestimateをmoveできない。借用終了後に**同じestimate**を既存consume_for_collectorへ一度渡せることを合成テストで確認した。通常strictの接続やcollector実行を有効にするものではない。compile-fail fixtureによる外側owner/Initial継続の検証はPC-04の残課題である。

## 2. 比較範囲・不明項の拒否

cap発行はcfg(test)の固定synthetic snapshotだけ。値は必要量からコピーせず、独立した有限上限を使う。projection/resource/kernel/xattrのmodel組合せ、合成artifact identity、同budget/Initial token/started、元10秒期限を超えるexpiry、固定coverageを照合する。本番の承認原票や配備artifactを検証したという意味ではない。

実導出・比較するのは35項目：sessionと3roundの5分類attempts/total/live-cleanup/names（32）、scan payload・共有retry・enum buffer bytes（3）。session/roundのtotalは分類別の和や3×roundで代用しない。共有retry/tailとxattr最後1回最大copyは既存resourceモデルの式をそのまま使用する。payloadはSharedBudgetのMAX_BYTES−used−reservedへchecked減算でも照合し、予約を横取りしない。

残る外側owner・管理allocation・bootstrap bytes/work/liveの5項目は未導出。ScanCapsComparedはborrow付きの**scan subsetだけの部分確認**であり、全体確認を要求するrequire_completeはUnavailableで元/提示budgetを停止する。未知項を0/無制限にしない。PC-01の模擬ResourceRequirementWitnessを実由来へ置換しておらず、PolicyCapsEvidence/Checked、ResourceInput/Quotas、準備Envelopeへ変換するAPIはない。既存PolicyCaps→Slots順序を変えない。

## 3. 合成テストと独立確認

| 対象 | 確認した内容 |
|---|---|
| 実統計由来 | 実際の厳密fixtureからprofile/estimateを1回生成。virtual index/空fileを含む固定fixtureを独立手計算と比較 |
| 量のoracle | base attempts=[63,14,6,657,136]、round total=885、3round total=2637、snapshots=73、xattr round=67048/three=70114、enum bytes=10965を確認 |
| 形状差 | 広い/深いdirectory、空file、65536境界越え、最大512MiB fileを含むfixtureで、別のentry集計からpayload/read量を照合 |
| 同一性 | 同値の別estimate、別receipt、fresh round/token、別budget、同originでも別claim、started改変、session/bridge開始済みを拒否 |
| model/retry | estimate/kernel/projection/cap/bundle改変、artifact違い、coverageの欠落/余分、retry変更を拒否 |
| cap境界 | 35項目を1つずつcap=必要量−1/同値/＋1で照合。u64::MAX capを無制限として受け付けない |
| 共有枠 | used/reservedで残payloadがなくなる場合、checked減算で引けない値を拒否。枠の補充やretryの追加なし |
| one-shot | projection drop後の再発行、比較結果drop後の再比較、未知model/取消後の再試行を拒否 |
| 中断 | projection18・比較45の全課金境界でLimit/Cancelled/Deadlineを個別確認し、再試行時のwork増加なし |
| 部分結果 | 全体確認はUnavailable。別budgetでその操作を行っても元claimの停止を保持 |
| 非実行 | payload/reservation/retry/metadata/topology会計不変、session/PolicyCaps発行を開始しない、固定opaque Debug・非Clone/Copy/serde |

## 4. 費目・検証経過

projectionは18 work（claim1＋既存profile guard5＋estimate guard1＋固定mapping1＋既存resource計算9＋publication1）。cap比較は45 work（claim1＋再結合guard7＋cap snapshot1＋mapping/残payload1＋比較35）。全体確認を求めて拒否する場合は追加1 work。新規heap allocationなし。estimateと部分結果に元claimのRc参照を各1個保持するが、保持量やborrow寿命を全体capで保証済みとはしない。旧15行・resource9行・profile収集を再計上して全体上界にしない。

初回Clippyでテスト内の明示dropがdrop_non_dropとして拒否された。借用ビューは独自解放を持たないため、スコープ終了で借用を閉じる形へ変更し、警告チェックを再実行した。実処理の警告抑制や上限緩和は行っていない。

cap比較のneed>limitだけを意図的に一時除去すると、35項目境界テストが「必要量−1のcapを受理した」と検出して失敗した。比較を復元し、最終全体テストを実行した。一時変更は最終差分へ残していない。

```text
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

Rust全体 **978 passed / 5 suites**（baseline 963＋新規15）。Clippy警告なし、release build・整形・差分チェック成功。

## 5. 残課題と停止状態

外側/A-B/recordを含む全体必要量、未導出5項目、本番cap/実clock、PC-01 Witnessへの由来接続、parts配賦、Initial bootstrap継続、全体work/resource受付は未対応。合成capやscan部分結果を全体確認へ昇格しない。

本番cap投入・全体受付・通常strict差替えは行わず、telemetryは保留。APPROVED_REGISTRY=None・通常v2 Unavailable・gate92・DER/absence停止を維持する。OS接続・実機操作・token発行・設定変更・permit発行は行っていない。
