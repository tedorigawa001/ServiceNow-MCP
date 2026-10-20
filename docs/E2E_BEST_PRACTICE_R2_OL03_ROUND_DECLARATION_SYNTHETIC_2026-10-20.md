# BP-5 R-2 OL-03：immutable round宣言・decode/意味検査分離の合成検証

Date: 2026-10-20 / Status: 先行部品のみ。既存pipelineのdecode回数削減・work事前受付は未接続。

## 1. 範囲

[再利用設計draft-0.2 §9](BEST_PRACTICE_BP5_R2_OL03_ROUND_DECLARATION_WORK_DESIGN.md)の先行実装。元506テストに新17件（pure7＋round10）を追加する。
telemetry調査は保留。実機/PDI操作・API実接続・token発行・設定変更・本番policy投入・実署名/permit発行は行っていない。

## 2. 実装

- pure coreのraw認証とdecodeを分離し、Index全体と元bytesのimmutable borrowを持つDecodedDeclarationを追加。再検査はraw hash/header・全宣言/親/全集合を同じ意味検査器で実行し、JSON decodeだけを省略する。
- 従来Declarationは同じ検査・work順序で新coreからentriesを得る。public check/declared・既存エラー型/JSON/exit codeは維持する。
- private with_roundがreceipt/target binding・pin hash/timeを検査してfresh nonceのscopeを作る。RoundDeclarationはそのscopeをborrowし、非Clone/非serde・固定Debug・immutable entriesのみ。scopeごとにdecode試行を一度に制限する。
- 再利用にはnonce・同receipt/target/context object・lineage・round・元budget originを要求する。identityはsealed borrowを補助する比較であり、利用者提供pointer/hashをtrustへ変換しない。
- budget originはSharedBudget生成時のprivate Rc識別子。消費work・開始時刻・各既存台帳をresetせず、別budgetでのdecode/recheckをBindingで停止する。bridgeは型付き理由を既存sticky Failureへ写像する。
- scope callbackの戻り型へborrowを逃がさないシグネチャを用いる。scopeをdrop後に元checkpointを通す。独立したcompile-fail fixtureは今回追加していない。

## 3. 合成試験17件

| 群 | 確認内容 |
|---|---|
| pure7 | decode後の全集合/宣言再検査でdecode counterが増えず旧countsと一致、固定Debug |
| hash/header | 再認証を観測なしでも要求し、release/generation/path等を再検査。JSONを再decodeしない |
| 意味検査 | 非Node/indexの欠落・重複・hash/size/extra、test-only tree破損によるpath不正を拒否。実APIにmutable getterはない |
| strict/上限 | 未認証不正JSONはdecode前にBinding、認証済み構文/UTF-8/末尾/重複不正を拒否、observed上限・累積work枯渇 |
| generic境界 | 宣言/全集合recheckの全checkpointにDeadline/Cancelledを個別挿入し型付き理由を保持 |
| round10 | 同receipt/nonce/budgetで成功しwork累積・他台帳不変、再decode試行拒否 |
| token | 同enum/同receiptでも新nonceを拒否し、BeforeM4/AfterM4の別roundも拒否 |
| receipt/target/context | 同bytes/全binding/lineageの別receipt、値が等しい別target/contextを拒否。test-onlyでnonceを共有した比較入力も作り、独立guardを検査 |
| budget/失敗 | 新budgetへの持越し、pin不正/Launcher/期限不足、集合差、cancel/deadline/100万work/既存失敗を保持して停止。再parseなし |

round試験のactivation/ledger bytesとcontextは一部が非JSONの合成pinである。with_round自体はraw receipt比較の部品であり、record三者strict verifierの代用ではない。実pipeline接続時には既存verifier・前後再読/clock/観測bindingを必須とする。
test-only thread-local index_decode_countはdecode呼出し数だけを数え、性能/RSSの実測や実配備の観測証拠にしない。

## 4. コマンド・感度確認

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml round_declaration
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml decoded_cases
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

- 先行round9＋pure7成功後、one-shot decode試験を追加しround10成功。
- nonce比較だけを一時無効化すると、同enum・同receiptの別tokenを誤受理し、拒否テストが失敗した。
- raw再認証を一時無効化した最初の感度確認では試験が成功してしまった。原因は「どの理由でも拒否」でよいassertionで、後段のindex観測Set不一致がraw認証欠落を隠していたため。観測なし＋hash不一致のBindingを要求する試験へ強化し、変更を戻す前に誤受理で失敗することを確認した。
- nonce比較とraw再認証を復元した後、全体523件（5 suites）成功、release build成功、Clippy指摘なし。cargo fmt/fixture rustfmt、4文書のlocal link/コードフェンス/行末空白、git diff --checkも成功。

## 5. 残課題・停止

既存strict pipelineは引き続きindex9回、activation/ledger/registry6回のまま。新型のpipeline接続、観測round tokenの接続、work_model_id/shape統計/費目上界/残予約は未実装。100万workで本番閉包が通るとは主張しない。
cross-round cache・全体cap増額・expectedからのobserved生成は行わない。実reader/collector/contextの真正性、OS metadata/path/clock/lease、hard中断/RSS/ABA・独立compile-fail検証は未対応。
APPROVED_REGISTRY=None、通常v2 Unavailable、runtime gate92、DER/absence停止を維持する。
