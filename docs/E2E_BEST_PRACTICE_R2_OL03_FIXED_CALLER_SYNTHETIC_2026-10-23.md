# BP-5 R-2 OL-03：保護入力の固定値移譲・上位結果callerの合成検証

Date: 2026-10-23 / Baseline: `8da8db2` / Scope: privateな合成接続のみ

## 1. 実装と停止境界

[対設計draft-0.4 §13](BEST_PRACTICE_BP5_R2_OL03_PROTECTED_BRIDGE_DIAGNOSTICS_DESIGN.md)に従い、`ProtectedStrictInputs::into_release(self, b)`と`StrictResultOwner::run_protected(inputs, b)`を接続した。元bundleを値消費し、既存利用guard10・移譲前inspection/checkpoint1の成功後だけpayloadを一度takeして既存固定releaseへ渡す。空shellのDropで放棄停止を誤通知せず、全payloadの解放責務をreleaseへ移す。

固定callerは同一budgetでbegin→移譲→実結果retainを行い、任意の結果/別budget/callback/calleeを受け取らない。移譲前拒否は元InputStageとprimaryを保持するInputRejected、移譲後は実OuterStrictFailure全体をmove保持する。制御用の軽量Failureを返しても、owner内の実診断は理由だけに縮退しない。

初回begin失敗でも、未移譲入力を破棄してから同じ第一診断へ解放/checkpoint観測を追記する。二重開始では新入力だけを破棄し、先行保持済み/消費済み結果を置換しない。返却後のretain/take、停止通知・破棄観測に追加work/heap確保を要求しない。

生成producerはcfg(test)のまま。通常strict.rs/records_v2.rsの経路、全体受付、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止は変更しない。telemetry保留、OS接続・実機操作・token発行・設定変更・permit発行は行わない。

## 2. 新規5テスト

| テスト | 確認内容 |
|---|---|
| `fixed_caller_transfers_the_original_bundle_and_retains_real_success` | 同じ元resource/source/context/3slotを固定releaseへ移譲して実成功を一度だけtake。全resource解放後もUnverifiedXml gateを維持。同じfixtureの直呼びとのwork差が生成込み15 |
| `fixed_caller_guard_rejections_release_all_inputs_before_retaining_input_diagnostics` | context/lineage/receipt/topology/held origin/source/policy/scan slot/Quota混入・欠落、scan入替、利用済みbundle、別budgetを拒否。全7分類のstage、元理由、固定field解放順、scan未開始を照合 |
| `fixed_caller_outer_failures_keep_actual_round_summary_and_stop_later_stages` | 外側clock・M4失敗と全3round×source失敗/hash不一致/cleanup未確認を実kernelへ注入。実phase/round、attempts全5区分、解放/checkpoint観測、後続round未開始を照合 |
| `fixed_caller_checks_each_budget_boundary_and_rejects_post_release_late_results` | 残work0〜13、課金後取消1〜14について正確なInputStage/OuterPhase境界を確認。開始前期限切れ/先行HashMismatch、解放時に到来する取消/期限切れは成功を返さず実OuterのPostReleaseCheckpointへ保存 |
| `fixed_caller_duplicate_start_drops_new_inputs_without_replacing_the_first_diagnostic` | 別の先行budgetで保持したReceiptBinding/HashMismatchを、新しいbundleによる二重開始で置換しない。消費済みownerも再開せず、いずれも新入力を全破棄してscan未開始 |

解放watchはscan3個→source→topology source→held解放済み→topology→recordsの観測を記録し、破棄完了後にassertする。scan入替fixtureは元objectのラベルが2/1/0になるが、配列field順での破棄を維持する。解放観測はSequenceReturnedであって、OSのclose成功や中断可能なDropの証明ではない。

実Outerのmove保持・有限projection/秘密非出力・inlineサイズ上限・非Clone/非Copy/非serdeは既存の上位owner回帰テストも維持する。今回のcallerにはログ出力や外部JSON生成を追加していない。

## 3. 費目

O.bridge_create2（caller外）＋O.result_owner2＋O.bridge_use10＋新O.bridge_transfer1＝15 work。callerのrelease前だけでは13。既存固定releaseを同じfixtureで直呼びした実費との差分が15になることを独立に確認する。coupling35＋K、configure1、R/I/S/typed tailを含めず、利用guardを再課金しない。

供給包装・claim用管理allocation・本番cap/全体work/resource上界は未確定のまま。15 workの計数から運用受付成功を主張しない。

## 4. 初回失敗・変異検証

- 最初のtracerは未実装run_protectedでコンパイル失敗した。固定移譲とcallerを追加して通過した。
- beginのResultSlotがownerを借用するmatch内で、失敗時にownerを再代入しようとしてE0506になった。成功枝はretain後に即returnし、失敗枝のmatch一時値/借用が終了してから初回拒否診断を補う構造に変更した。unsafeや診断の理由だけへの変換は使っていない。
- 拡張fixtureはscan入替時にも元objectラベル0/1/2の破棄順を期待して失敗した。Drop watch内のassertが巻戻し中にも発火し、初回はSIGABRTになった。watchを観測専用へ変更し、配列順に対応する2/1/0の期待値を破棄後に検査した。製品側の破棄順/停止policyは緩めていない。
- Clippyのresult_large_errには、実Outerを停止後もinline保持する理由を付け、into_releaseだけへ限定allowを追加した。Box化や全体警告抑制はしていない。
- 利用claimのfresh判定を常にtrueへ変える変異で、利用済みbundleの拒否テストが失敗した（終了101）。元実装へ復元し、全検証を再実行した。

## 5. 最終検証

| コマンド/確認 | 結果 |
|---|---|
| `bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 907 passed / 5 suites、失敗0（baseline902＋新規5） |
| `bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 成功、指摘なし |
| `bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `bdo git -c core.fsmonitor=false diff --check` | 成功 |
| 更新5文書のローカル参照先 | 存在確認 |
| 通常strict.rs / records_v2.rsの差分 | なし |

## 6. 未接続・限界

本番context/registry/source/policy/Quotaを供給する保護producer、create失敗の上位ownerへの捕捉、通常strictの戻り値移行、全体R/I/S/O・独立resource上界/受付、運用cap承認、OS source/明示解放保証は未対応。低水準begin/retain単体は結果のbudget由来を検査せず、固定callerの線形経路で結合する。

失敗後の入力破棄/診断格納はRustの通常return/dropを前提とする。panic/abort/forget/killや戻らないDropの回収/解放は保証せず、SequenceReturnedからClosed/ack/permitを作らない。全体受付無効・telemetry保留と既存停止gateを維持する。
