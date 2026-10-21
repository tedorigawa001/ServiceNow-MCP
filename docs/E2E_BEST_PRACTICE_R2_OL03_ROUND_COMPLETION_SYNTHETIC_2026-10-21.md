# BP-5 R-2 OL-03：型付きround完了証拠の合成検証

Date: 2026-10-21 / Baseline: `fa9e4c1` / Scope: offline synthetic only

## 1. 範囲

[終了証拠設計draft-0.4 §14](BEST_PRACTICE_BP5_R2_OL03_STRICT_COMPLETION_DESIGN.md)のround完了subsetを実装した。固定session collectorの実Outcome成功＋ClosedScanResourcesだけからRoundScanSuccessを発行し、元Active scopeとmoveで消費してPendingStrictRound（AwaitStrict）に結合する。元sessionの完了claimをfallible処理前に一度だけ消費する。private constructor、非Clone/非Copy/非serde、opaque Debugを維持する。

結合対象は同receipt object/lineage・target/context・scope object/token・登録済みslot token・元budget origin/claim/started・同resource book・接続/退役済みslot。cleanup確認をscan成功やstrict成功の代用にしない。失敗時は主理由・cleanup診断・数値summaryを保持する。

全体受付無効、telemetry保留、通常strict/OS/API接続なし。実機操作・token発行・設定変更・permit発行を行わない。production strict acknowledgementは未実装。3roundの試験だけがcfg(test) acknowledgementを用い、通常strictの成功成績を主張しない。

## 2. 新規9テスト

| ケース | 検査 |
|---|---|
| real_closed_scan_is_consumed_once_and_pending_drop_cannot_advance_round | 実固定adapter、実Closedの消費、完了claim重複拒否、未ack dropによる停止、固定work3 |
| completion_failure_preserves_closed_diagnostics_at_every_work_prefix | 残work0/1/2の各prefixでLimit、claim消費済み、Confirmed診断とsummaryを保持 |
| completion_rejects_late_stop_and_other_budget_identity | scan後の取消/期限切れ、別origin/claim/startedを拒否、元理由sticky |
| completion_requires_original_receipt_lineage_target_context_token_and_accounting | receipt/lineage/target/context/token/book、別Active round、退役/接続flagの計9種の破壊を拒否 |
| failed_or_unstarted_fixed_scan_never_produces_round_completion | hash/余剰entry/解放未確認/Quotasなし/最終操作取消/期限切れでも成功票なし、診断保持 |
| round_completion_evidence_cannot_be_cloned_copied_or_serialized | RoundScanSuccess/PendingStrictRoundのClone/Copy/Serialize/DeserializeOwned不実装を型検査 |
| every_post_charge_cancel_and_final_checkpoint_deadline_preserves_closed_evidence | 完了3課金の各直後の取消、全8checkpoint（最終checkpoint含む）の期限切れで成功を返さない |
| actual_closed_proofs_bind_each_round_slot_with_test_only_strict_acknowledgement | 同inspectionの3slotで実Closedを消費、InputsをdropしてAfterScan/finishへ移る所有順を確認。ackだけtest-only |
| forgetting_pending_evidence_does_not_acknowledge_or_unlock_the_next_round | forgetでもAwaitStrictを残し、次round beginで拒否。dropによる停止を迂回しても次round権限はない |

既存合成source/fixtureの再利用であり、新しい独立レビュー評価セットや実OS sourceの検証ではない。test-onlyの途中停止口は実固定producerの出力で止めるだけで、数値から証拠を作らない。identity破壊/ack補助もcfg(test)内だけに置く。

## 3. 費目

固定completion submodelは `bp5-r2-strict-round-completion-0.1`。producer/consumerの独立literalを比較する。O.round_complete=3 work（claim/model1、既存require1、Closed/session結合1）を追加し、8checkpointを通ってからだけAwaitStrictへ移る。既存collector-work/entry/session-entry0.2の式とresource数量は変えない。

- kernel1903、単一bridge1992、既存session1994は不変。
- 完了経路は1997、EINTR1の最初のroundは2000。3round完了の追加費は9。
- profile/計算後のfixtureでkernel1903＋guard7＋entry1＋require/connect2＋complete3＝1916を検査。
- source操作・payload/retry・予約/cleanupを再加算/返金せず、全体work受付はまだ有効化しない。

CompletionFailureは元理由と固定長cleanup/summaryをinlineで保持する。停止後のheap確保を避けるため、該当関数だけ理由付きresult_large_err allowを使う。可変長エラー文、秘密、path、pointer値を出力しない。全allocation/RSS/OS解放の証明ではない。

## 4. 実行履歴と最終検証

新規試験の最初のコンパイルで、非公開model定数の参照と存在しない可変work上限フィールドの参照（E0603/E0609）が失敗した。既存fixtureに合わせ固定model literalと固定100万workからの残量設定へ修正した。次に、1916 workを1908とした期待値と、startedを未来へずらしたためBindingより先にDeadlineになる期待値の2件が失敗。費目をguard7/entry1まで追跡して式を訂正し、startedは過去へずらして期限判定とidentity判定を分離した。製品capは変更していない。

初回clippyは固定長208byteのErrに対するresult_large_errと、test用pause関数の可視性が原因で失敗した。上記の理由付き局所allowと、test関数をcollector内部に狭める修正を行った。警告全体の抑止/公開API拡張はしていない。

receipt object比較guardだけを一時的に無効化する変異では、receipt/lineage等の拒否試験がexit101で失敗し、誤ってPendingを返すことを検知した。guard復元後に以下を再実行した。変異は残していない。

| コマンド/検査 | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 802 passed、5 suites、11.07秒（基準793＋新規9） |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 指摘なし |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `git diff --check` | 成功 |
| 文書検査 | 設計/親2文書/本記録の4文書・相対リンク32件、fence対応・末尾改行/空白を確認（節anchor内容は未自動照合） |

## 5. 未対応

strict acknowledgement、AfterScan後のObservation破棄stage、record/FinalIndex/最終clockのtyped tail接続、通常strictへの固定位置接続、運用policy/全体受付は未実装。Pendingは現subsetではObservationをdropまで保持する。将来ackはwith_round closure内の最後のfallible処理とし、その外側checkpointで失敗し得る原則を変えない。

今回の変更からscan成功やcleanup確認を実行権へ変換しない。telemetry調査は保留のまま。
