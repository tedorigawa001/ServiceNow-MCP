# BP-5 R-2 OL-03：Context／Records供給証拠の合成検証

Date: 2026-10-23 / Source baseline: `8bf52cb` / Scope: 内部型・合成issuer・発行前提・一度限り消費。実PDI E2Eではない。

## 1. 変更範囲

[供給証拠設計draft-0.2 §11](BEST_PRACTICE_BP5_R2_OL03_SUPPLY_EVIDENCE_DESIGN.md)に従い、ContextEvidence／RecordsEvidenceとContextChecked／ContextRecordsCheckedを実装した。fieldは専用moduleだけが生成し、取得・発行factoryはcfg(test)限定。callerがapproved=trueを渡すconstructorや本番issuerはない。

合成取得は固定registry bytes・groups `[80]`・uid501/gid80を使う。所有するreceipt/sourceに対して既存のreceipt照合、bounded再読、clock、hash-first activation/ledger/registryの厳密検証、Initial index decode/Node照合を実行する。検証済みimmutable所有領域を外へ返し、proofの消費時には再parse・I/O・whole-bindingコピーを追加しない。

これは合成sourceの検証結果であり、本番の承認registry、OS実効groups、安全なOS取得、署名検証、現在のファイル不変性の証明ではない。証拠はProtectedSupplyやpermitへ変換できず、PreparationEnvelope/run_creation/通常strictへ未接続。

主な実装・テスト：

- [内部共通型](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/supply_evidence.rs)
- [Context発行・消費](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/supply_evidence/context.rs)
- [Records発行・消費](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/supply_evidence/records.rs)
- [合成取得issuer](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/supply_evidence/synthetic.rs)
- [合成回帰テスト](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/collector/tests/session_bridge/supply_evidence.rs)

## 2. 検証した契約

| 対象 | 確認内容 |
|---|---|
| 発行前提 | 合成承認registryとの不一致、groups空/重複/別値、registry/groups上限超過を拒否 |
| Records取得 | 別lineage、pin hash不一致、pin hashを合わせた不正JSON、取得失敗、zero read、EOF余剰を元理由・Supply位置で拒否。正の短読取は既存上限内で完了可能 |
| 線形発行 | Context→Records、各発行は同budgetで一度だけ。proofをdropしても再発行不可。別の合成取得ownerを作り直してもbudget claimで拒否 |
| 線形消費 | ContextCheckedを必須としてRecordsを消費。test専用で複製した不正fixtureの再消費もbudget claimで拒否 |
| 結合 | 同時刻の別budgetを発行/消費4境界で拒否。source stamp・receipt lineage・immutable ownerの差替えを拒否 |
| move | 所有containerをmoveしても同source/receiptのidentityを維持。move前アドレスに依存しない |
| 停止 | 発行/消費4境界それぞれのwork不足・取消・期限切れを確認。先行Expired等をBindingへ置換せず保持 |
| 非露出 | 非Clone/非Copy/非serdeの型契約とopaque Debug。出力にraw registry/record/groups/path/ポインタ値を含めない |
| 解放 | 取得中の失敗/取消/期限切れと成功後dropでsourceを一度破棄。temporary made==freed、source→receipt順をdrop watchで確認。proof/checkedはresourceを延命しない |
| 非接続 | 合成collector traceは未開始。通常strict・固定評価セット・run_creationの既存17 workは変更しない |

拒否はInputRejectedへ位置と第一理由を保持する。独立subsetの時点ではrelease/checkpoint観測はNotReachedであり、上位ownerによる固定discardが実施済みという票は作らない。

## 3. 費目・保持量

合成発行Context1＋Records1、消費Context1＋Records1＝**4 work**。取得済み位置から残work0〜4を与える試験で、各拒否位置と成功境界を独立に確認した。消費前後のRecordSource countersは同一で、追加取得/再parseはない。

取得側にはcontext dispatch/上限1、bounded registry比較1、groupsごと1、record dispatch1と、既存record/index/hash/I/Oの課金がある。4はその費用を含まず、全体上界ではない。通常経路17へ4を単純加算した上界も主張しない。初回index parseは合成取得factoryだけにあり、通常経路の3decodeを増やしていない。

新規Rc allocationはowner identity/source stampの各1個。既存budget claimへbool4個を追加し、claimのinlineサイズ64 bytes以下を確認した。ContextEvidenceは32 bytes以下、RecordsEvidenceは64 bytes以下。proofはidentity参照だけを保持し、source/receiptはEvidenceInputsが単独所有する。外部context・receipt/source量・Rc保持費をresource全体上界から除外しない。

## 4. テスト過程と結果

- 最初は未実装moduleの参照でredを確認し、取得→発行→順序付き消費の縦断ケースを実装した。
- 初回Clippyの未使用re-exportは、testだけが使う型のimport範囲を修正して解消した。テストwrapperの同名Kind衝突はRecordKindの明示aliasで解消した。
- 取得fault試験で「正の短読取も失敗」とした期待値が誤っていた。既存bounded再読は正しく完了するため、成功の対照ケースへ訂正した。製品の読取上限/動作は緩和していない。
- Contextの二重消費guardを一時除去すると、重複fixtureの消費が成功し回帰テストが失敗した。Recordsの同guard除去でも失敗を確認した。両guardを復元後に再検証した。

検証コマンド（すべてoffline/locked）：

```text
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

Rust全体：**932 passed / 5 suites**（既存919＋新規13）。Clippy警告なし、release build成功。固定評価セットおよび通常strict本体は変更していない。

## 5. 未対応・停止状態

本番issuer、HeldSources/PolicyCaps/ScanSlots証拠、準備Envelopeへの証拠接続、取得前失敗を上位ownerへ保持する接続、cap承認・profile供給順序・全体work/resource上界は未対応。全体受付は無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。

OS接続・実機操作・token発行・設定変更・permit発行・Pushは行っていない。panic/abort/forget/killや戻らないDropの回収保証は追加していない。
