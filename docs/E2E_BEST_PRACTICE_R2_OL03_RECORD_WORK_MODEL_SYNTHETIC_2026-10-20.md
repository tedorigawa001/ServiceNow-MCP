# BP-5 R-2 OL-03：record workモデルの合成検証

Date: 2026-10-20 / Scope: ローカル合成データのみ。PDI E2E・実配備計数・運用承認ではない。

## 1. 対象と変更

[全体設計draft-0.2 §10](BEST_PRACTICE_BP5_R2_OL03_TOTAL_WORK_ADMISSION_DESIGN.md#10-recordモデルの先行実装内部opt-in)のrecord-only経路を追加した。

- 固定モデル `bp5-r2-record-work-0.1`、同じvisitorでのJSON形状統計、checked算術による上界。
- 内部モデルのみgroups最大1,024。重複要素も課金し、超過はhash/decode前に停止。通常validate/activation経路の契約は維持。
- 固定kernel19（pure検証17＋呼出し側projection2）、収集可変費E、収集/計算固定12、追加binding/model guard1。
- profileはraw/入力objectのimmutable borrowへ結合し、非Clone/非serde・固定Debug。runtime authority・予約を持たない。
- 共有予算のopt-in bridgeで元start/origin/spent/first failureを維持し、I/O予約・metadata/topology台帳を変更しない。

通常strict pipelineは従来のprofileなし経路のまま。6回検証を省略せず、将来profile付きへ接続する場合も6回profile再構築する保守的な式を提供する。indexの通常JSON契約・workモデルを変更していない。

## 2. 合成試験

| 試験 | 確認内容 |
|---|---|
| 固定費・統計 | テスト専用の独立serde tree oracleとB/V/K/T/Qを比較。通常workからJ/H/g/pを除いた固定17とprojection2、収集E+12を厳密比較 |
| groups | 1・2・1,024の重複groupsを課金、1,025を1 workでLimit、空groupsをBinding。旧pure経路の互換性 |
| registry | policy2/32、entitlement辞書32要素、accepted shapeと実課金の一致 |
| raw境界 | Unicode escapeと末尾空白、三者それぞれ65,536 bytes、hash再結合 |
| visitor | 配列・空object/array・bool/null/整数/浮動小数・空文字。duplicate/trailing/不正JSON/typed変換失敗ではshapeを公開しない |
| text課金とevent | generic visitorの65,537文字ではtext2 unitに対し収集イベント1。recordの64KiB制限は維持 |
| borrow/model guard | 正しい入力に1 work、未知model・同bytes別allocation・別Pins・別Contextを拒否 |
| 全checkpoint | profile付き経路の全checkpoint位置でDeadline/Cancelledを注入し、型付き理由を保持。既存理由が先勝 |
| work cap | 必要量ちょうど成功・1不足・累積再実行・u64 spent overflowで停止。cap/startを作り直さない |
| 算術・6回 | add/mul overflow、raw長不正・形状合計overflow。6回でvalidate回数が6増加し、profile上界は実消費＋projection12 |
| hash-first | pin不一致と認証済み不正JSONを分けて拒否し、profileを返さない |
| 共有予算bridge | 同じorigin/start、2回でworkが倍増、I/O/metadata/topology台帳不変、cancel・期限・既存理由・groups/work上限をラッチ |

## 3. 実行結果

- recordモデル追加10テスト成功。
- profile共有予算bridge追加2テスト成功。
- 全体 `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml`：550成功（5 suites、7.52秒）。
- `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings`：問題なし。

上記は本変更の最初の全体実行。時間はローカル合成試験の実行値で、CPU/RSS/OS呼出しhard期限・実閉包の性能保証ではない。

### 感度検証と最終再実行

- 固定kernelを19→18へ一時変更すると、固定費テストが399対400で失敗した。元へ復旧した。
- 固定profile費を12→11へ一時変更すると、同テストが297対298で失敗した。元へ復旧した。いずれも意図した感度検証で、変更は残していない。
- text単位と収集イベント数の分離テストを1件追加した後、全体 **551成功（5 suites、6.95秒）**。今回の追加はmodel11件＋bridge2件の計13件。
- 最終Clippyも問題なし。release build、cargo fmtチェック、exec_probe fixtureのrustfmt、3文書のローカルリンク・fence・空白・固定費式、git diff --checkも成功した。変異の復旧とAPPROVED_REGISTRY=None／通常v2 Unavailable／gate92の維持を確認した。

## 4. 未対応・維持する停止境界

全体work予約・scan/other上界・index子phase受付、budget origin/session/roundとprofileの運用結合、保護されたcontext/registry producer、実reader/opener/collector・clock/lease・cleanup証明は未対応。borrow比較の成功をそれらの証拠にしない。

APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止、telemetry調査保留を維持。実機操作・API実接続・token発行・設定変更・本番policy投入・permit発行・Pushは行っていない。
