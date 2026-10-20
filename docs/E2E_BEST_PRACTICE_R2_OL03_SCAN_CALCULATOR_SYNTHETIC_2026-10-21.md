# BP-5 R-2 OL-03：profile消費型15-row純粋計算器の合成検証

Date: 2026-10-21 / Scope: private Rust internal subset。PDI/OS/実署名のE2Eではない。

## 1. 変更と停止状態

[sealed profile詳細設計draft-0.3](BEST_PRACTICE_BP5_R2_OL03_SEALED_SCAN_PROFILE_DESIGN.md)の固定15行を `scan_inputs/profile/calculator.rs` と `calculator/arithmetic.rs` に実装。入力は値で消費するScanShapeProfileのみ。成功時のScanWorkEstimateがprofileを所有し、失敗時は途中値を返さずdropする。scalarやmodelのsetter、Clone/Copy/serde、profile取り出し・summary復元はない。

運用の呼出し元は追加していない。全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持。OS接続・実機操作・トークン発行・設定変更・permit発行・Pushは実施していない。既存collector・厳密再検証・固定評価セットは変更しない。

## 2. 課金・binding・算術

既存Profile.requireの5 work＋固定15行×1 work＝**20 work**。既存workの前後guardに加え、各行の算術後にも元budgetのcheckpointを行う。row15では同Inputs/scope/origin/started/retry残を直接再照合する。virtual indexのbyte/chunk関係はrow1へ配置し、row15へ全検査を集中させない。可変長走査・再parse・allocation・I/Oは計算器内に置かない。8費目の和は固定8項のchecked addである。

係数表はcalculator固定ID `bp5-r2-collector-work-0.1` と同じkernel model IDに結合する。これは純粋係数表の版で、実collector/OSの登録・計測・署名成功を証明しない。profile IDは `bp5-r2-scan-profile-0.1`。旧/未知modelはUnavailable、identity違いはBinding、retry増減はChanged、checked overflow/underflowはLimit。先行sticky理由を優先し、workやclaimを返却しない。

| 基本fixture、r=8 | 結果 |
|---|---:|
| groups / route / walk / enumeration | 51 / 47 / 1278 / 342 |
| file / control / seal / tail | 183 / 59 / 36 / 45 |
| U_S / U_base | 2041 / 2014 |
| Initialの同shape残scan予測 | 6069 |
| U_profile | 62 |
| 計算費（require込み） | 20 |

r=0ならU_S=2017・Initial予測6045。予測は共有retry残の `n*U_base+3r+3` で、各roundへr=8を再付与しない。profile収集費や計算費をkernel候補へ隠して含めない。

## 3. 新規11テスト

- 基本tracer：20 work・全費目・合計・base・予測・profile所有を確認。
- 7形状×3round×retry残0〜8＝189条件を独立u128 oracleと照合。runtimeのchecked helperを期待値に流用しない。resource used/reserved/retry/start不変も確認。
- checked add/mul/sub、ellの0/2冪前後/u64::MAX、全費目式・固定和・予測・profile収集上界でoverflow/underflowを拒否。現実のsealed scalar上限からはoverflowに到達しないため、極端値はtest-only private helperで検査。
- さらにprivate field破損を注入し、row4/7/8のoverflow、row2のunderflow、row1/15の不整合が該当行までの費用で止まり、元budgetへ理由を保持することを確認。運用constructorは追加しない。
- 別budget/start、retry増減、旧/未知model、別Inputs/scope/token/round/同bytesの別receiptを拒否。既存sticky failureがある場合は未知modelより優先し、新workを課金しない。
- work残0〜19は全拒否、20は成功。20箇所それぞれの課金直後に取消・期限を注入（40条件）。加えて全15算術行の終端checkpointで期限切れを注入し、部分estimate非返却を確認。
- 5,000 root file追加の合成shapeでは、U_Sが100万を超えても純粋な数量として保持する。payloadやretry等を予約/更新せず、estimateをdropしてもprofile claimを戻さない。
- estimateのClone/Copy/Serialize/Deserialize禁止を型推論guardで確認。Debugは固定labelでpath/hash/identity/raw bytesを出さない。

TDD初回tracerはstubのUnavailableで失敗し、実装後に成功。実装中のrow15 closureはbudgetの可変/不変借用が競合しE0502になったため、同じ課金1・検査・checkpointを直接記述して解消した。work費を増やしたり、binding検査を省略したりしていない。

## 4. 限界・後工程

費用はworkブロックの課金でありCPU/RSS/allocator時間を保証しない。固定行内の最大32 scalar演算の独立監査、所有権移動/Ready遷移の専用compile-fail試験、運用summary、estimate消費型bridge/use7、3round resource配賦・全体other上界・全体受付は未対応。estimate成功は実行permitではない。

取消/期限は合成clock/observerで注入し、real-time schedulingやOS sourceの挙動を検証したものではない。通常strictやSecurity API backendとの実接続もない。

## 5. 再現コマンド

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml profile::calculator
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

結果：計算器11テスト成功。全体709テスト成功（従来698＋11、5 suites、10.89秒）。clippy全targets警告禁止・release build・rustfmt check・diff check成功。今回更新した5文書の相対リンク77件、code fenceと末尾改行も確認した。npm全体・実PDI・実署名の試験は再実行していない。
