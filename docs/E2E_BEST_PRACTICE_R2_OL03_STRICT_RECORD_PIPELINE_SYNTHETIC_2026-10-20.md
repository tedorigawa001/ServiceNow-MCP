# BP-5 R-2 OL-03：strict record/closure検証の再読pipeline接続

Date: 2026-10-20 / Status: 内部接続と合成sourceのみ。実reader/collector・API/permitなし。

## 1. 範囲

[接続設計draft-0.6 §13](BEST_PRACTICE_BP5_R2_OL03_RECORD_PARSER_CLOSURE_DESIGN.md)の固定verifierをrecord再読・最終照合へ接続した。
telemetry調査は保留。実機/PDI操作・API実接続・token発行・設定変更・本番policy投入・実署名・permit発行は行っていない。
旧490テストに新16テストを追加。架空JSONとmemory内sourceを使用し、実record/コード/資格情報は取得していない。

## 2. 実装と順序

- RecordSourceの意味投影と旧wrapperを`cfg(test)`に限定。新経路は固定strict verifierだけを使用し、legacy投影の呼出し数は常に0と検査する。
- 保持receipt/pinsのhash/lineage/全binding確認後、初回・M4前・M4後の3roundを固定順で行う。各roundは3record exact再読→clock→activation/ledger-0.2/registry/index全宣言検証→scan境界→全集合照合→3record再読→clock→strict再検証→clock。
- schemaの限定borrowed viewでroot/index/Node、hash/policy/size、release/generation/UID/GID/platform/registry/承認・期限を結合。rootのslash境界と既存strict relative path規則を使用する。公開schema/JSON/exit codeは変えない。
- 合成ClosureObservationはlineage/全RecordBinding/roundを保持し、古いroundや別session/root/世代を拒否。observed一覧は架空fixtureとして別に用意し、scan時に宣言をコピーして成功させる実装にはしない。
- 既存bridgeの型付き失敗をsticky有限Failureへ接続し、文字列matchingや失敗後retryを行わない。Limit/Deadline/Cancelled/Expired、集合・投影差Changed、構造/policy不適合Bindingを保持する。
- start/10秒・json_work100万・payload2GiB・A/B予約・metadata/name/topology/EINTR枠をresetしない。recordコピーを実bytes分課金し、pure解析をI/Oへ二重課金しない。source/target/pins解放後の最終checkpointを維持する。

## 3. 新16テスト

| 群 | 内容 |
|---|---|
| 正常3round | phase順序・6回record再読・work累積・payloadのexact accounting・全resourceの一度だけ解放・entitlement gate停止 |
| 集合差 | 各roundのmissing/duplicate/非Node hash改変でChanged、後続roundなし |
| 観測binding | 各roundで別lineage/世代/root/誤round拒否、M4前失敗時はM4へ進まない |
| scan結果の遅延 | 各roundで成功応答と同時のcancel/deadlineを破棄・解放 |
| source失敗 | 各roundのReadFailed/MetadataUnavailable/Limit/Expired/Cancelled/Deadlineを保持、retryなし |
| scan前後変更 | 全6再読のactivation/ledger/index差を拒否、legacy投影を呼ばない |
| strict JSON | 認証済み不正activation/ledger/index、registry不正、Launcher/Node role違い、ledger-0.1 fallback拒否 |
| 固定projection | ledgerのindex/Node path/hash、index Node sizeの差を拒否 |
| 共有work | 開始時不足・既存失敗優先、各scan後の枯渇、全累積末尾での枯渇を保持 |
| 再読と解放 | 全record source呼出し境界へReadFailedを個別注入し即停止、positive short read、namespace差替え拒否、全handle解放 |
| time/groups | admission460000ms等号をExpired、460001msから5秒経過しても450秒marginで成功（二重加算なし）、実効group欠落拒否 |
| 共有checkpoint | 全pipelineのcheckpointを約32分割して期限/取消を個別挿入し、最初の理由・解放を確認。全checkpoint総当たりではない（pure coreの既存総当たり試験と区別） |

## 4. 実行と途中経過

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml strict_cases
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

- 初回checkでheldの可変借用とclosure内target参照が競合。固定target参照を借用開始前に取り出して修正し、check成功。
- 最初のtest compileはRoundのDebug不足で停止。有限enumへDebugを追加し、新12件成功。追加境界試験込みで16件成功。
- Clippyは引数8個を拒否。closure source/contextを内部ClosureInspectionへまとめて7個にし、警告抑制を追加せず解消。
- 感度確認：round一致の条件だけを一時無効化すると誤round試験が誤成功を検知して失敗。全集合checker呼出しだけを一時無効化するとmissing/duplicate/非Node改変の試験が誤成功を検知して失敗。両方を復元した。
- 復元後、全体506件（5 suites）成功、release build成功、Clippy指摘なし。cargo fmt/fixture rustfmt、4文書のlocal link/コードフェンス/行末空白、git diff --checkも成功。

## 5. 残課題・停止境界

ClosureSourceには合成実装しかない。実filesystemの全directory names/file hash/identity/metadata/path、scanの真正な完了、初回protected receipt/context、同じ保持Nodeへの借用、OS単発操作の予算/FD/cleanup台帳・clock/leaseは未接続。sourceのscanを単一契約callへ数えたり、既存独立deployment scannerをそのまま呼んだりしない。
合成のsession/round一致は実filesystem鮮度/原子性/ABA防止の証明ではない。非interruptibleなserde/比較/解放、管理allocation/RSS/hard中断も未解決。

**workの重要な制約**：現経路はindexを1round3回（declare/check/declare）、全9回parseし、activation/ledger/registryは全6回検証する。§6.1の「3回parseで約60万unit」はこのpipelineの見積りではない。典型的なfile/path構成ならindexだけで5,000〜6,000件が約147万〜176万unitとなり得て、暫定100万capを超える。今回の小規模合成fixtureの成功から実閉包の成功を主張しない。capは緩めず、厳密な事前受付とimmutableな解析済み宣言の安全な再利用を別途設計・検証する必要がある。

APPROVED_REGISTRY=None、通常v2入口Unavailable、runtime gate92、DER/absence停止を維持する。成功は従来の固定Debugのpending RecordComparisonであり、permit/本番policy/運用入口へ昇格しない。
