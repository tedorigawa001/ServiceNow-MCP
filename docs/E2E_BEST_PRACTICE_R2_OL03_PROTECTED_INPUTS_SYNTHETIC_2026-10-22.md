# BP-5 R-2 OL-03：保護入力内部型・budget側生成/利用claimの合成検証

Date: 2026-10-22 / Baseline: `0495d39` / Scope: private内部型とidentity/claim subsetのみ

## 1. 実装と停止境界

[対設計draft-0.2 §11](BEST_PRACTICE_BP5_R2_OL03_PROTECTED_BRIDGE_DIAGNOSTICS_DESIGN.md)に従い、ProtectedSupply/ProtectedStrictInputs、元context/boundを借用するprivate seal、固定field順で所有するpayload、budget側のProtectedBridgeClaimを追加した。通常strict.rs、records_v2.rs、固定releaseの呼出し経路は変更しない。

ProtectedSupplyのproducerはcfg(test)だけで、本番constructorはない。createはbudget側のgeneratedを不可逆に消費し、require_useはusedを一度だけ消費する。session claimを開始しない。結果は内部identity検査のOk/Errだけで、payload getter・移譲・dispatch・Closed/RecordComparison/permit生成口は存在しない。

SharedBudgetのstop/checkpointは元failed/session理由を優先してbridge失敗も伝播する。誤った別budgetへ渡した場合は元claimと提示budgetの両方を停止する。通常dropは未移譲の放棄であり、検査済みでもUnavailableをラッチする（先行理由を維持）。forgetではdrop/解放を保証せず、budgetの生成claimが残ることだけを確認する。

§5の完全な値消費bridge・解放後checkpoint・InputRejected/上位結果ownerは未実装。このsubsetのrequire_use失敗後は、呼出し側がdropするまで所有payloadが残る。sourceの供給stampは封入後の混入防止であって、実OS identityやpolicy実内容/model承認の証拠ではない。

## 2. 新規9テスト

| テスト | 合成確認 |
|---|---|
| `protected_bundle_is_single_generation_and_does_not_start_a_scan_session` | create2＋use10 work、利用2回目の拒否、session未開始、I/O予約/bytes/retry/metadata/topology枠不変 |
| `dropping_a_checked_or_unchecked_bundle_stops_its_original_budget` | 検査前/後の放棄で元checkpointがUnavailable、所有resource解放 |
| `protected_identity_rejects_context_receipt_open_source_policy_and_slot_mixups` | 同値別context、receipt/topology lineage/binding/target、held origin、source系列、policy、scan/Quotas各slot混入/交換/欠落を拒否 |
| `protected_identity_rejects_foreign_inspection_and_unknown_models` | 別budgetでの生成/利用、origin/session/started差替え、未知bridge IDを拒否し、失敗後の再利用も元理由で拒否 |
| `protected_generation_and_use_stop_at_every_budget_boundary_without_restarting` | 生成2点/利用10点の全work不足prefix、全12課金位置の取消、元10秒期限で停止 |
| `duplicate_supply_generation_poisoning_is_budget_owned_even_before_first_bundle_use` | 同budgetへ独立供給2組を用意。二重生成で最初の未使用bundleも停止。最初のmodel失敗後も再生成で元Unavailableを維持 |
| `forgetting_bundle_does_not_restore_its_budget_generation_claim` | 意図的なforget後もgeneratedが残る。解放は確認しない（合成resourceのleakを意図的に残す） |
| `inert_payload_is_released_in_fixed_order_without_any_io_trait_calls` | I/O traitを実装しない合成sourceで生成/検査。scan3slot→record source→topology source→held全解放済み→topology receipt→record receiptを観測。opaque Debugを確認 |
| `protected_input_types_are_move_only_opaque_and_not_serializable` | supply/bundleが非Clone/非Copy/非serde。claim本体64 bytes以下を確認 |

全identity拒否経路でscan/source操作を開始せず、通常dropでheldのmade/dropped一致を確認する。forget試験だけは明示的な例外であり、cleanup成績へ混ぜない。実レコード/資格情報/コード本文は使わない。

## 3. 初回失敗・変異確認

- 最初のtracer testは未実装moduleのimportでコンパイル失敗し、内部型/claimを追加して通過した。
- startedを未来へ1nsずらしたidentity試験は、照合前の既存checkpointがDeadlineを返し、期待Bindingと不一致になった。元budgetの時計は後退を拒否するためで、製品の判定順は変えていない。期限内の別started（過去1ns）へテスト条件を直し、Bindingを独立確認した。
- createのfresh拒否を省く変異で、二重生成試験が失敗した（終了101）。
- usedの不可逆消費をgetだけにする変異で、利用2回目拒否の試験が失敗した（終了101）。
- 両変異を復元し、以下は最終ソースで再実行した。失敗した実行は成功件数へ含めない。

## 4. 費目

生成O.bridge_create=2、利用O.bridge_use=10、計12 workを固定テストで確認。全不足prefixと課金後取消も検査した。生成・利用の失敗通知/通常dropのラッチに新しいworkは不要で、元spentを返さない。既存coupling35＋K、resource configure1、R/I/S/typed tail費はこの12に含まれない。

budget初期化で追加Rc allocation1個（ProtectedBridgeClaim）を作る。newのwork課金は増やさないが、管理allocation/CPU/RSSの全体上界へ0として吸収しない。Rc cloneはidentity共有であり、source/resourceの複製ではない。fixtureのstamp/包装費も本番の承認済み費目ではない。全体受付・運用capは未承認のまま。

## 5. 最終検証

| コマンド/確認 | 結果 |
|---|---|
| `bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 893 passed / 5 suites、失敗0（baseline884＋新規9） |
| `bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 成功、指摘なし |
| `bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `bdo git -c core.fsmonitor=false diff --check` | 成功 |
| 通常strict.rs / records_v2.rsの差分 | なし |

## 6. 未接続・未確認

InputRejected/Outerを保持する上位結果owner、固定releaseへの値移譲、保護されたcontext/registry/record/source/policy/Quotas producer、policy実内容/model照合の接続、通常strict差替え、全体work/resource上界・管理allocation・受付は別工程である。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。OS接続・実機操作・token発行・設定変更・permit発行は実施しない。generic Dropのbounded性/実OS close成功/秘密のメモリ消去を、この合成検証から主張しない。
