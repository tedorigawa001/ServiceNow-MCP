# BP-5 R-2 OL-03：ScanInputs利用状態・利用guard7の合成検証

Date: 2026-10-21 / Scope: private Rust guard単体。collector dispatch/実PDI/OS/実署名のE2Eではない。

## 1. 実装範囲・停止状態

[詳細設計draft-0.3](BEST_PRACTICE_BP5_R2_OL03_ESTIMATE_BRIDGE_DESIGN.md)の最初のsubsetとして `scan_inputs/use_state.rs` と `profile/calculator/use_guard.rs` を追加した。ScanInputsにprivate `scan_started: Cell<State>` を置き、profile_startedとは別にFreshから始める。既存Inputs構築費は変更しない。既存のprivate copy fixture 3箇所へFresh初期化を追加しただけで、運用constructorを増やしていない。

guardの呼出しは合成テストのみでcalculator内部までの可視性。source/quotas/任意callbackを受けず、collectorを呼ばない。Result<()>だけを返し、estimate/profile/token/permit/Observationを返さない。全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。

OS接続・実機操作・トークン発行・設定変更・permit発行・Pushは実施していない。既存collector/strict・固定評価セットは変更しない。

## 2. 状態・binding・費目

estimateを値で消費し、そのprofileの**元Inputsだけ**を最初のfallible処理前にFresh→Attemptedへ移す。渡された別Inputsには書き込まない。既存失敗・取消・未知modelでもFreshへ戻さない。既にAttempted/BridgeReady/Enteredなら、その状態を降格/上書きせず拒否する。

既存Profile.require5＋estimate固定model検査1＋one-shot/final binding1＝**7 work**を元budgetへ加算する。同Inputs/receipt/target/context/scope/token/round/origin/startedを確認し、入口rの増減はChangedとして拒否する。model混在はUnavailable、identity/state不適合はBinding。先行sticky理由を優先する。

最終checkpointをすべて通過した後にだけ、元started/rのsnapshotを持つBridgeReadyへ進める。公開後のfallible処理やrollbackは置かない。stateのDebugは固定labelで時刻/identityを出さない。payload/reservation/retry/start/metadata/topologyのカウンタは変更せず、quotaやwork受付も行わない。

O.use7は計算器のrequire込み20とは別実行。基本fixtureの部分実費はprofile61＋calculate20＋guard7＝88（Inputs構築/collector/I/Rは別）。既存S実費1902・将来dispatch1と合わせる1991は統合未検証で、今回実測した額ではない。

## 3. 新規11テスト

| 試験 | 確認内容 |
|---|---|
| tracer | Freshのままprofile/calculateを終え、guard成功で7 work・BridgeReady snapshot一致 |
| 3round×retry0〜8（27条件） | 元resourceカウンタ不変、7 work、既存Ready phase不変、opaque Debug |
| model 5条件 | profile/calculator/kernel未知、旧scan-work混在を拒否。profileは第4点、estimate modelは第6点まで |
| 既利用状態3条件 | Attempted/BridgeReady/Enteredを第7点で拒否、状態を降格しない |
| binding 11条件 | 別origin/start、retry増減、別Inputs/scope/token/round/同内容の別receipt/target/contextを拒否。別InputsはFreshのまま |
| work残0〜7 | 0〜6はLimit・Attempted、7で成功。返金/部分Readyなし |
| 7課金点×取消/期限（14条件） | 該当pointで停止、Attemptedのまま、元理由保持/資源カウンタ不変 |
| 第5/6/7点の終端取消/期限（6条件） | work直後のguardを抜けても、その後の明示checkpointで止まりReadyを公開しない |
| 先行理由/事前取消6条件 | 未知modelより元理由優先、追加workなしでもAttemptedを消費 |
| 成功後の迂回2条件 | profile再構築/Inputs再bindを拒否。BridgeReady/profile_startedを戻さない |
| 大規模shape | U_S>100万でもguard単体は7 workのまま。受付/予約/Entered/scan結果へ変換しない |

TDDのtracerはstubのUnavailableで失敗し、実装後に成功した。取消/期限は既存test-only work observerと合成clockで注入し、運用経路へtest hookを追加していない。

## 4. 未接続・未検証

第6点は現時点でestimate内部の固定model契約まで。KERNEL_IDはcalculator IDのaliasで、実collectorの固定callee結合・対応判定を検証したものではない。その結合と外側collector入口のO.dispatch1/Entered遷移を追加するまで、BridgeReadyは実scan許可として使わない。

直接collectの拒否・二重collectのruntime拒否、既存直接collect試験の移行、sourceの受渡し/cleanup summary保持、合法EINTR後のscan完了、3roundのresource受付、通常strict bridgeは未対応。従来collectorが既にguard経由になったとは主張しない。Enteredは将来用variantで、非testコードに状態遷移はない。

source引数/呼出しが存在しないのでguard単体にI/Oはないが、実sourceの無副作用性やcleanup完了を試験した意味ではない。最大32 scalar演算の独立監査、所有権/phase遷移の専用compile-fail試験、OS/RSS/CPU時間の保証は未実施。

## 5. 再現コマンド

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml calculator::use_guard
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

結果：新規guard11テスト成功。全体720テスト成功（従来709＋11、5 suites、10.68秒）。clippy全targets警告禁止・release build・rustfmt check・diff check成功。今回更新した5文書の相対リンク先ファイル51件、code fence・末尾改行も確認した（節anchor内容の自動検証ではない）。npm全体・実PDI・OS source・実署名試験は再実行していない。
