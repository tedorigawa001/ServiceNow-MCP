# BP-5 R-2 OL-03：PC-03論理slotキー・非実行cap写像の合成検証

Date: 2026-10-23 / Source baseline: `e230a7e` / Scope: 論理slotとsession/round/local案の固定写像。実PDI E2Eではない。

## 1. 実装範囲と非実行境界

[PC-03詳細設計draft-0.3 §12](BEST_PRACTICE_BP5_R2_OL03_PC03_PARTS_ALLOCATION_DESIGN.md)に対応する。

- [cap固定写像](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/projection/caps/allocation_view/cap_map.rs)
- [論理slotキー](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session/resources/draft/slots.rs)
- [Draft接続](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session/resources/draft.rs)
- [独立oracle・拒否/中断テスト](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/projection/caps/tests/slot_mapping.rs)

Draft modelを0.2へ更新。比較元の実cap snapshotへの借用を保持する非実行DraftCapMapを追加し、32 scalarのsession/round capを写した後、各roundからattempts5/live/namesのlocal案21 scalarを写す。計53 scalar。必要量をcapへ昇格せず、raw配列/診断snapshotからのruntime constructorを作らない。cap発行元は引き続きcfg(test)のsyntheticだけである。

group identity1個と固有nonce3個で非aliasなキーを生成し、固定順Initial/BeforeM4/AfterM4・ordinal0/1/2・model・canonical nonce・groupを確認する。LogicalSlotRefは該当キーとgroup fieldの実参照を借用し、別slot/groupやcopyした値で代替できない。borrow前のDraft移動を許し、borrow後の保持はRust lifetimeに従う。実source originや実round tokenを発行するものではない。

未導出5項目はUnknownのまま。finalizeは`Result<Infallible, Failure>`で成功値を作れず、Unavailableを返す。ResourcePolicy/ResourceInput/Quotas、完成parts、実source/token結合、session configure、通常strict/全体受付/permitへの入口は追加していない。Stoppedを上書きしないbegin_allocationも維持する。

## 2. 独立oracle

原票fixtureは35項目すべてを明示し、sessionと各roundを非対称にした。totalはattemptsの和と無関係な別値、local live/namesはtotalと明確に違う値とした。oracleはproductionのindex計算・flatten helper・dimensions・resource計算器を呼ばず、期待するsession/3round/3localの配列をliteralで指定した。

例えばInitialのround capをattempts=[201001,202002,203003,204004,205005]、total=220006、live=2007、names=280008とし、local案に2007/280008が入り、220006が混ざらないことを確認した。BeforeM4/AfterM4は別の値を使い、round0を全slotへ複製する誤りも検出できる。これは**写像契約**のoracleであって、実capの承認・必要量モデルの性能/全体coverageの証明ではない。

liveをtotalからcopyする誤りを意図的に一時導入すると、oracleがlocal案の相違（220006対2007等）を検出して失敗した。正しいcopyへ復元後に全体を再検証した。一時変更は最終差分に残していない。

## 3. 拒否・one-shot・中断の検証

| 対象 | 確認した内容 |
|---|---|
| 53値 | session8/round24/local21の各値を個別に改変し、同immutable capとの再照合でBinding。未知map modelはUnavailable |
| cap同一性 | 同じ値・同じscope/budgetの別capオブジェクトへviewを差し替えたprivate fixtureも拒否 |
| 固定slot | 各キーのordinal/Round/group/nonce/model、3種の入替え、canonical anchorも同時改変したaliasを拒否 |
| キー参照 | 正常な3slotのキー借用/照合成功、InitialキーをAfterM4として使うとBinding |
| 別group | 同receipt・同cap値の別budgetで生成したgroupへキーを持ち込むと拒否し、提示先と元キーownerの両方を停止 |
| 中断 | Draft作成62/finalize66の全work境界でLimit/Cancelled/Deadline。キー借用/照合各62の全境界も同様に確認 |
| 旧契約 | 元receipt/budget/Initial scope・retry/残payload/未開始、二重作成・drop/forget後の再生成拒否、先行理由保持を再実行 |
| 型/非実行 | map/キーは非Clone/Copy/serde、固定opaque Debug。5項目Unknownでfinalize拒否、session/PolicyCaps発行は開始しない |

キー参照のforeign拒否は型/nonceの数値一致ではなくcanonicalオブジェクト参照で判断する。外部入力からキーを再構築するAPIはない。cfg(test)のsnapshot/改変口は診断/感度試験専用で、runtimeに含めない。

## 4. 費目・保持量

view4は不変。Draft作成は62 work（claim1＋view guard3＋写像53＋group/key発行4＋publication1）。map再照合57、DraftReady確認＋全キー照合61、キー借用/参照照合は各62。finalize拒否は66（claim/model1＋map再照合57＋キー3＋Unknown5）。view→Draft→拒否の132 workを実計数した。旧作成5/finalize9の記録は[第1subset記録](E2E_BEST_PRACTICE_R2_OL03_PC03_DRAFT_SYNTHETIC_2026-10-23.md)として残し、現行テストの境界を更新した。

mapは固定長stack値とcap借用だけを保持する。キーはgroup/nonceに計4個のRc allocationを追加し、canonical anchorとキーがその参照を共有する。未導出の管理allocation/live/全体work上界を確認済みにせず、132を既存見積もりへ単純加算して受付しない。allocator OOMの型付き回収/RSS上界の保証は対象外。

新規キーの作成途中のwork/取消失敗もローカル所有でdropする。既存forget fixtureは非実行identityを意図的にリークして再発行防止を試すもので、OS/FD解放証拠を主張しない。完成partsの部分移譲や実cleanupは未実装。

## 5. 最終検証と残課題

```text
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

Rust全体 **996 passed / 5 suites**（baseline 988＋新規8）。Clippy警告なし、release build・整形・差分チェック成功。

実source/fresh tokenへの結合、残5項目/全体必要量の完全性issuer、本番cap/実clock、完成parts発行・証拠消費/固定移譲、PC-04の安定した外側owner/Initial継続、全体work/resource受付は未対応。未知項はUnknownのまま、本番cap・完成parts・全体受付・通常strict・OS接続・実機操作・token発行・設定変更・permit発行を有効化していない。telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。
