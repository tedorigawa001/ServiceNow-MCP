# BP-5 R-2 OL-03：固定collector model結合・入口guard1の合成検証

Date: 2026-10-21 / Scope: private Rust合成source。PDI/OS/実署名のE2Eではない。

## 1. 実装・停止状態

[詳細設計draft-0.4](BEST_PRACTICE_BP5_R2_OL03_ESTIMATE_BRIDGE_DESIGN.md)に従い、collector module独立の固定KERNEL_MODEL_ID/ENTRY_MODEL_IDを追加した。estimateの値消費method `consume_for_collector` がguard7を呼び、calculatorと固定collectorのmodel不一致を拒否する。呼出し元のexpected kernel ID/関数pointer/任意collector callbackは受けない。

ScanInputs側の `enter_collector` がBridgeReady→Enteredを最初のfallible処理前に消費し、1 workで同Inputs/scope/origin/started/r/modelを再照合する。外側collectは成功時だけ同moduleのprivate kernelを呼ぶ。入口停止はNotStarted(Failure)、kernelを呼んだ場合はCollected(既存Outcome)で区別し、既存の失敗理由とcleanup summaryを保持する。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持。OS接続・実機操作・トークン発行・設定変更・permit発行・Pushは行っていない。単一consume_and_collect・通常strict・運用source/承認quotaは未接続。

## 2. owner/model/budgetへの結合

- KERNEL_MODEL_IDはcollector側の固定literal `bp5-r2-collector-work-0.1`、ENTRY_MODEL_IDは `bp5-r2-collector-entry-0.1`。guard第6点でestimate modelと固定callee契約を照合し、入口でも保存した両IDを再確認する。
- BridgeReadyへ比較専用の元Inputs pointerを保存。参照解除/serde/ログ出力はせず、同内容でも別Inputsへのclaimコピーを拒否する。Inputsを移動してaddressが変わっても拒否する方針。ポインタ比較はOS/FD/ABA不変性の証明ではない。
- scope object・元origin/started一致、入口rの増減拒否を追加1 work内で行う。既存layout/Ready guardはkernel内に残る。失敗後の状態resetはない。
- scan中の合法EINTRは同共有rから消費し、scan後のProfile.require再実行で誤拒否しない。次roundは残rからfresh profile/estimateを作る。
- 先行sticky failureを優先するので、初回失敗後の2回目はBindingではなく元のFailureを返す場合がある。source呼出しは増えず、Enteredの再利用を許した意味ではない。

## 3. 費目・測定値

| 基本fixture | work / 操作数 |
|---|---:|
| 既存private kernelの7費目 | 52 / 49 / 46 / 1223 / 322 / 174 / 36 |
| S合計 | 1902 |
| O.dispatch入口 | 1 |
| 外側collect（入口＋S） | 1903 |
| profile / calculate / use | 61 / 20 / 7 |
| 準備＋入口＋kernel | 1991 |
| source操作数 / peak live | 876 / 5 |

外側collect1903と準備込み1991はInitial/BeforeM4/AfterM4で確認した。test observerは既存7 kernel bucketを維持し、入口1だけをUnassignedとして別に観測する（新しいproduction quota/Ownerを作ったものではない）。S.controlへ入口費を押し込まず、旧kernelの感度試験や上界式を変更しない。

旧直接collect試験の4呼出し箇所は `#[cfg(test)] kernel_for_test` へ移した。private kernelに対する従来の成功/拒否/全source失敗点/費目監査はこの明示的test-only入口を通す。新しい入口試験とは混同しない。test bypassは非test buildへ同梱されない。固定calleeはprivate kernelへの直接callで、モデル名だけが一致する任意実装へdispatchしない。

## 4. 新規14テスト

状態単体6テスト：1 workでの一度限り消費、Fresh/Attempted/Entered拒否、コピーclaim拒否と元claim保持、owner/model/start/r/origin/scope不一致8条件、work残0/1と既存失敗、課金直後/終端の取消・期限。状態はすべてEnteredへ不可逆に消費し、拒否時もBridgeReadyへ戻さない。

固定入口8テスト：

1. Freshからの直接collectを1 work・source操作0で拒否。
2. 3種roundの成功後、同Inputsの2回目を拒否してsource操作数を増やさない。準備1991/外側1903を照合。
3. quota未提供/不足、hash不一致、短読取、EINTR枯渇、FS取得不能、cleanup不明、source取消/期限の9条件。既存Outcome.summaryと元失敗を保持し、2回目も再scanしない。
4. 入口前work不足/取消/期限/先行失敗/r変更の5条件はNotStartedでsource操作0。cleanup完了票を捏造しない。
5. observer総和1903＝7 kernel bucket1902＋入口1を確認。
6. 合法EINTRを含む全3roundの同start/共有retry残7と、borrow解放後のAfterScan/FinalIndex・全handle解放を確認。
7. 入口の課金直後取消でもsourceを一度も呼ばない。
8. work残0はNotStarted、残1は入口だけ通過してkernel setupでLimit。どちらもsource操作0・返金なし。

テスト準備上、コピーclaim拒否後に元claimが保持されていることを検査する1ケースでは、test-onlyでbudget.failedを消して元Inputsを検査した。運用reset APIやretry経路を追加したものではない。

## 5. 開発中の失敗と修正

TDDの直接collect拒否tracerは、入口guard前には「未claimでもcollectorへ入る」ことで失敗し、実装後に成功した。追加状態テストのsetupでprivateな別テストmoduleを参照しE0603になったため、製品/test moduleの可視性を広げず、そのテスト内でsetupを独立させた。従来kernelの課金・shared deadline・resource制約を緩めていない。

## 6. 未対応・限界

estimateを消費するguardと固定collectは合成経路で連続して呼ぶが、単一bridgeによるsource所有権受渡し・kernel完了後の追加checkpoint/late success破棄・終了報告統合は未実装。既存kernel内の終端checkpoint/cleanupは維持している。通常strictのClosureSource経路は切り替えていない。

3roundの共有payload/start/retry確認と、operation/name/live/cleanup quotaのsession全体配賦・予約は別問題。quotaの運用producer・全体other上界・全体受付は未対応。固定model結合は実署名/OS sourceの信頼の証明ではない。独立の最大32 scalar演算監査・専用compile-fail試験・CPU/RSS/hard停止の保証も未実施。

## 7. 再現コマンド

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml use_state::tests
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml collector::tests::entry
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

結果：新規14テスト（状態6＋入口8）成功。全体734テスト成功（従来720＋14、5 suites、10.64秒）。clippy全targets警告禁止・release build・rustfmt check・diff check成功。今回更新した5文書の相対リンク先ファイル54件、code fence・末尾改行を確認した（節anchor内容の自動照合ではない）。npm全体・PDI・OS source・実署名試験は再実行していない。
