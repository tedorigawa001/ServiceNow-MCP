# BP-5 R-2 OL-03：共有予算strict JSON core・型付き失敗理由の合成検証

Date: 2026-10-20 / Status: 内部core/bridgeの合成検証。record/closure接続・運用許可なし。

## 1. 範囲

[再検証接続設計draft-0.3 §10](BEST_PRACTICE_BP5_R2_OL03_RECORD_PARSER_CLOSURE_DESIGN.md)の最初の段階。
[json/shared.rs](../native/r2-outer/src/json/shared.rs)、[共有予算bridge](../native/r2-outer/src/signature_boundary/positioned_read.rs)を追加する。OS・外部通信・record取得は行わない。
telemetry調査は保留、実機/PDI操作・API実接続・token発行・設定変更・本番policy/permit発行は対象外。

## 2. 実装

- genericなBudgetのcheckpoint/workと、型付きRejection<E>を使うstaged core。最初の理由をStateに保持し、serdeの文字列errorは固定文言にする。raw key/value/record/codeを戻り値・ログへ入れない。
- InvalidRecord、Limitの4分類（Configuration/Bytes/Depth/Container）、Budget(E)を区別する。Deadline/Cancelled/共有work Limit/既存FailureはBudget(E)のまま保持する。
- Value木構築時にduplicate decoded key・入力/深さ/container件数を検査。超過subtreeをdecodeする前にRejectSeedで拒否。UTF-8/文法/末尾、typed schemaの不適合はInvalidRecord。
- generic TのschemaはTのDeserialize定義で決まる。deny_unknown_fieldsがないTへcoreが自動的に未知field拒否を加えるわけではない。
- coreの上限は最大16MiB/深さ16/container100,000。低いprofileをLimitsで指定。workはinput chunk/node/key/string chunk/挿入/typed変換開始を計上する。
- SharedBudget::decode_jsonは元Instant/10秒/cancel/first failureに接続。json_workは全decode共有、暫定cap1,000,000。local Limitはbudget Limit、InvalidRecordはBindingへラッチするが戻り値の型付き理由は保持する。
- 旧decode/decode_bounded/decode_policyと公開JSON/exit codeは変更しない。新coreはlegacy wrapper/ledger/registry/closure/record revalidateへまだ接続しない。
- 受信bytes/payload予約・metadata/topology/EINTRの台帳は変更しない。CPU処理をI/O copyへ課金しない。Value/bufferは通常のRust所有権で解放するがallocator/RSS計測や上限証明は行わない。

## 3. 追加23テスト

| 群 | 確認したこと |
|---|---|
| core 16件 | scalar/array/object/Unicodeのlegacy一致、duplicate/escape同名/入れ子、UTF-8/文法/数値/末尾拒否、typed未知/欠落/型違い、秘密marker非出力 |
| local上限 | bytes等号/超過、depth16/policy8の境界、container超過をsubtree decode前に拒否、max_items=0の空container、上限設定自体の拒否 |
| generic共有予算 | 既存失敗優先、正常経路の全checkpointへDeadline/Cancelledを1回ずつ挿入、累積work/overflow、長いkey/stringのwork、型変換中の取消/期限とserde errorの区別 |
| legacy互換 | 旧wrapperはbytes超過/期限切れでも従来のInvalidRecordのまま |
| SharedBudget bridge 7件 | 元期限/取消、累積workと他台帳不変、1,000,000枠と再decode停止、local/構造不正のラッチ、既存HashMismatch優先、実行途中のfake clock期限/cancel |

core件数16＋bridge7＝23。JSON関連filterの実行は既存12件を含む35件。
すべて架空bytes・fake budget/clock/cancelであり、実parser全工程の性能・実record・OS停止の証拠ではない。

## 4. 検証と途中経過

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml json
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

- 初回cargo fmtはtests.rs追加前のmodule解決で停止。予定のテストファイルを追加後に再実行した。
- JSON関連33件成功後、SharedBudgetの実行途中Deadline/Cancelledを追加し35件成功。
- 理由保持の感度確認で、checkpoint errorを意図的にInvalidRecordへ丸めると、全checkpoint試験が失敗（InvalidRecordとBudget(Deadline)の差を検出）。復元後の全体検証は447件（5 suites）成功。一時変更は残していない。
- release build成功、Clippy指摘なし。cargo fmt/fixture rustfmt、3文書のlocal link/コードフェンス/行末空白、git diff --checkも成功。

## 5. 未対応・停止維持

serde内部の長いtoken unescape/UTF-8・map比較・typed from_value中には協調checkpointがない。前後で遅延結果を拒否するが、hard timeout・即時停止を保証しない。
Value木＋型の同時allocation、管理allocation64MiB/総128MiB候補、RSS、全container合計memoryは未検証。1,000,000 work capは停止中の内部経路用であり、運用承認/CPU時間保証ではない。
budget-aware ledger/registry/closure core、再検証pipeline、全件観測producer/同round鮮度、実reader/clock、lease/実OS source/API/permitは未接続。
APPROVED_REGISTRY=None、通常v2入口Unavailable、runtime gate92、DER/absence停止を維持する。

## 追補：work上限と実効件数（2026-10-20、レビュー）

file entry 1件あたり約26 work unitのため、暫定cap 1,000,000では1回のparseで約3.8万entry、indexを3回parseすると約1.2万entryが目安となる。
index形式上限100,000件には実効上届かない。本プロジェクトの本番閉包（約5,000〜6,000 entryの見積り）は3回parseで約40万unitの見込み。
詳細と受付時の扱いは[詳細設計§6.1](BEST_PRACTICE_BP5_R2_OL03_RECORD_PARSER_CLOSURE_DESIGN.md)を参照。見積りであり、本記録の試験件数・結果は変わらない。
