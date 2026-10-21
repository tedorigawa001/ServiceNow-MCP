# BP-5 R-2 OL-03：BeforeM4／AfterM4 固定kernel接続 合成検証

Date: 2026-10-22 / Baseline: `9d7183e` / Kind: 合成sourceでの内部接続検証

## 1. 範囲

[接続設計draft-0.6 §13](BEST_PRACTICE_BP5_R2_OL03_NORMAL_STRICT_CONNECTION_DESIGN.md)に従い、固定topology compareのBeforeM4位置と、実handoffからのAfterM4Round.finishをnon-testの実kernelへ接続した。通常strict.rsのorchestrator/旧ClosureSource全体は変更しない。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。OS接続、実機操作、token発行、設定変更、本番policy投入、permit発行は行わない。

## 2. 実装と所有権

- `topology_adapter::compare` は任意caller callbackを受け取らず、B成功・再照合後のBeforeM4Positionから元ownerのslotへ入り、実kernelを固定calleeとして呼ぶ。Quotasはtakeして一度だけ渡す。
- 実BeforeM4 ack・with_round末尾・owner完了guardがすべて成功した後だけM4取得へ戻る。実M4/比較終端成功前にhandoffを生成しない。
- `AfterM4Round::finish` は値消費。元slotを保持したまま入口とkernel完了後に元owner/root/台帳/budgetを照合し、最終checkpoint後だけ元ComparedM0M4を返す。
- 元ownerを最後まで照合するため、kernel本体をowner内部の `run_fixed_in_place` へ分離した。外側run_fixedは従来どおり値消費、内部再入もprecheck claimが拒否する。任意callbackや完了setterは追加しない。
- AfterM4の実CompletionFailureはそのままmoveして保持。入口/終端guard失敗はround=AfterM4・元理由でowner/sessionを停止する。ack後に過去のcleanup証拠を再構築しない。
- `O.after_finish=2 work/inspection`（入口1＋公開直前1）、時刻観測は入口4＋終端4。既存kernel/tail/ack費と別に記録し、全体受付の上界にはまだ接続しない。

## 3. 確認したケース

既存の `session_bridge/topology_adapter.rs` は、従来の停止stubを期待するテストを、実non-test入口を通す正常系へ変更した。M4失敗・origin差替え・M4遅延取消/期限切れ・別ownerのhandoff拒否も実compare経由へ移した。既存の故障注入用callback fixtureはcomponent境界の試験にだけ残す。

新規 `session_bridge/topology_adapter/fixed_connection.rs` に3テストを追加した。

| テスト | 確認内容 |
|---|---|
| `fixed_connection_records_scan_phase_order_and_keeps_real_comparison_gated` | 各scan最初のopenを合成ScanOps境界で観測。Initial=[]、BeforeM4=[M0,M1,M2,M3]、AfterM4=[M0,M1,M2,M3,M4]。同RecordSource再読cycle6、全handle/resource解放、実ack3件を確認。返る比較結果のentitlement gateはUnverifiedXmlのまま |
| `fixed_connection_retains_before_and_after_typed_diagnostics` | Before/After双方の操作失敗、digest不一致、Quotas未提供、Afterの解放未確認。操作失敗はConfirmed＋summary、不一致はHashMismatch＋DeclarationIncomplete、解放未確認はReleaseUnconfirmed。Quotas未提供はNotStarted＋操作数0のsummary。Before失敗ではM4/After未到達。停止後の再開・別理由への上書きを拒否 |
| `fixed_after_finish_entry_and_publication_guards_stop_the_original_owner` | 入口work不足・課金後取消、入口全4期限境界、finish直前の別budget origin、最後の課金不足/課金後取消・終端全4期限境界。入口失敗ではAfter scan未開始、ack後失敗ではcleanup票なし。元ownerはStoppedとなり再開不可 |

既存11テストと合わせてtopology adapter関連14件。既存の独立B bytes/EOF oracleと22操作の再照合故障検証も維持した。M4失敗系では実BeforeM4 ackまでを確認し、AfterM4 slotは未消費・ack未実施のまま停止する。同状態の別ownerにhandoffを渡すとBindingで停止する。

## 4. 初回失敗と変異検証

1. 実入口を通す正常系を先に作り、compareのQuotas引数とfinish未実装によるコンパイル失敗を確認した。
2. 初回接続ではFnMutからnon-Copy Quotasをmoveできずコンパイル失敗した。cloneを追加せずOption.takeによる一度限りの移動へ修正した。
3. 新しい合成ScanOps wrapperは当初RecordSource風のmethod名を使いコンパイル失敗した。既存ScanOpsのopen/acl_init/enumerate境界に合わせ、最初のopenだけを観測するよう訂正した。
4. Quotas未提供のsummaryをNoneと期待して初回失敗した。ResourcePolicy未提供とは異なり、実collectorでは開始前拒否の操作数0 summaryを保持するため、期待値をSome([0;5])へ訂正した。製品の診断保持は変更していない。
5. Clippyはテストの観測型の複雑さを検出したため、ScanStartsの型aliasへ整理した。
6. BeforeM4の実kernelを旧Unavailable停止へ置換した変異と、AfterM4 kernelをprecheckだけへ置換した変異は、実固定入口の正常系テストがそれぞれ失敗した。両変異を復元して全体検証を実施した。変異は保存していない。

## 5. 最終検証

```bash
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git diff --check
```

- Rust全体：**865 passed、0 failed、5 suites**（baseline862＋新規3）。
- topology adapter関連：14 passed（全体865件に含む）。
- Clippy（警告をエラー扱い）、release build、rustfmt、diff check：成功。
- 通常strict.rsとrecords_v2.rsに差分なし。

## 6. 限界と次工程

non-testの固定calleeを使用しても、試験sourceとpolicy/Quotasは合成のままであり、実OS/PDI・署名API・運用capの証拠ではない。比較結果はM4時点の内部証拠で、外側解放完了や実行permitを意味しない。

通常strict全体のorchestrator、外側clock/receipt検査からの接続、解放後の最終checkpoint・上位診断、全体work/resource受付と本番policy承認は残る。今回その経路・設定・gateは変更していない。
