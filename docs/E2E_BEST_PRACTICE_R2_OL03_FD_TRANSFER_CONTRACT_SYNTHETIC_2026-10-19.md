# BP-5 R-2 OL-03：record binding・保持FD移譲内部契約の合成検証

Date: 2026-10-19 / Scope: 比較用recordデータ・Rust所有resourceのmove/解放。実OS/PDI E2Eではない。

## 1. 範囲と未接続部分

[移譲設計draft-0.2](BEST_PRACTICE_BP5_R2_OL03_SECURE_FD_TRANSFER_DESIGN.md)§12の内部契約を追加した。
telemetry調査は保留。実record reader/secure opener・macOS実sourceへのFile移譲・実機操作・API実接続・トークン発行・設定変更・permit発行・Pushは行っていない。
APPROVED_REGISTRY=None、通常v2入口Unavailable、runtime gate92、DER/absence停止を維持する。

このテストはroot承認recordを認証しない。RecordBindingのhash/role/世代等は比較用の合成値で、raw record bytes/祖先/署名から導出した証拠ではない。
resourceはFDでなく、Box tokenと生成/Drop台帳を持つ非Clone型。source carrierもgeneric所有型だけで、MetadataOps/実SystemApiは呼ばない。

## 2. 実装

- [transfer.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer.rs)：private RecordBinding/TargetDeclaration、借用BoundTarget、OpenedTargetの所有消費、HeldTargetScope、固定diagnostic。
- [tests.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/tests.rs)：resourceのBox address/生成/Drop数、callback回数、fake clock/cancelとrecord/receipt変異。
- 共通内部FailureにBinding/Unavailable/Expiredを追加。公開JSON/exit code・旧契約・容量/回数/retry制約は変更しない。

open前にNodeのhash/size出所/role/policy/pathとrecord構造/期限を確認する。移譲前はreceiptの全field・opaque Rc origin・祖先componentsを照合し、初期leaf Observationを既存normalizeで検査する。
成功時は同じresourceをsource carrierへmoveし、借用bindingと祖先をscope内保持。resource/FDを戻り値に含めず、drop後のcheckpointまで成功を返さない。
成功Debugは`MovedTarget(pending_m0_topology_records_not_execution_authority)`だけ。execution_gateは必ずUnavailable。

## 3. 新規18テスト

| 試験群 | 確認 |
|---|---|
| move/寿命 | leaf Box address保持、clone/reopenなし、callback中の早期Dropなし、leaf→祖先の解放、固定Debug/gate停止 |
| record混在 | 比較用21fieldを個別変異しBinding。別origin Rcは値が同じでも拒否 |
| target混在 | role/path/relative/hash2種/size出所・値/mode/policy/roleを変異し、source使用前に拒否 |
| pre-open | hash差/別root/traversal/policy/mode/ObservedBounded/size範囲/index自身、record世代/UID/GID/registry/path不正はopen0回 |
| Launcher | hashが一致しObservedBoundedを指定してもUnavailable、open0回 |
| bounded path | 空/dot/dotdot/空component/NUL/backslash/過深/長大componentは修復せず拒否。正当なabsolute root内spaceは維持 |
| ancestor shape | 欠落/順序差/別component、receipt資源数＋leaf/一時枠が132超なら使用前停止 |
| initial leaf | device/size/policy/不明ACL/FS/名前/前後Stat差を拒否。OS取得ではなく合成値の検査 |
| 失敗/解放 | 部分openで作った分だけ1回Drop、移譲後failureのsticky latch、次open拒否 |
| 時間/取消 | open/bodyの成功/失敗が遅延/cancelした場合は破棄、開始時はopen0回、resource Drop中の取消も成功にしない |
| unwind | callback panicでもleaf/祖先が1回Drop。panic後の運用再開や秘密非出力の証明とはしない |
| record時刻 | 受付460秒/最終450秒のstrict境界、期限不足/未来承認/overflow、合成期限を宣言値のまま保持 |

上記はtest関数18件の内部matrixであり、実FD/record/OSケース数ではない。Drop一致は実close成功の証拠ではない。
初回17件成功後、record時刻境界の1件を追加した。コンパイル/test/Clippyの失敗は検出しなかった。

## 4. 最終検証

| コマンド/検査 | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml metadata::transfer` | 18 passed、362 filtered out |
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 380 passed（5 suites） |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 指摘なし |
| cargo fmt check / exec_probe.rs rustfmt check | 成功 |
| 変更MD local link/code fence/行末空白、git diff check | 成功 |

shellはbdoを前置。依存/Cargo.lock・TS/MCP登録は変更しておらず、TS/MCP/PDIテストは再実行しない。

## 5. 残る境界

実RecordEvidence/InspectionSession producer、root由来hash/metadata/clock pairの認証、実openerのFD予約とFile moveは未接続。
祖先component対応は形の比較だけで、祖先snapshot/namespace再walk/lease/record再読は実装していない。M0/open snapshot結合やM4前finalizerも未実装。
record終了wallは元Instantからの導出値で、実wall再取得/巻戻し照合ではない。比較用contextをtrusted record evidenceとして外部から投入する入口は作らない。
generic resourceからmacOS MetadataOpsへ接続するbackendも、追加topology予算も未実装。実source起動・API/CD結合・DER/absence/permitの停止を解除しない。
