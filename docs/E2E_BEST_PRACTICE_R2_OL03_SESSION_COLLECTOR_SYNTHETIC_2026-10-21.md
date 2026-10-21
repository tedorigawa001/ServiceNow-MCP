# BP-5 R-2 OL-03：session会計・固定collector接続の合成検証

Date: 2026-10-21 / Scope: offline synthetic only

## 1. 接続と停止状態

[3round台帳設計§19](BEST_PRACTICE_BP5_R2_OL03_THREE_ROUND_RESOURCE_LEDGER_DESIGN.md)に従い、consume_and_collect_session→固定collector→scan_opsへsession Connectionを接続した。§18.4の方式(b)を選択し、dispatch/cleanupのworkはscan_opsだけがprechargeする。sessionは同一イベントの累積/round候補の検査・反映だけを行う。別のraw owner・source操作・summary再加算は作らない。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、gate92/通常v2/DER/absenceの停止を維持。運用policy constructor、OS接続、実機操作、token発行、設定変更、permit発行は追加しない。

## 2. 接続用8テスト

| ケース | 検証 |
|---|---|
| fixed_collector_charges_one_session_attempt_per_trace_and_keeps_three_round_totals | 3round＋合法EINTR1。独立source trace・local summary・session/round会計が一致。累積2629試行、retry残7、peakはmax、全Ownerを一度だけ解放 |
| source_failure_cancel_deadline_and_unconfirmed_cleanup_keep_exact_prefix_accounting | hash/short/surplus/retry枯渇/FS/cleanup未確認/取消/期限/xattr変更の9ケース。拒否prefixの会計・元理由・cleanup summaryを保持 |
| session_caps_block_source_and_cleanup_still_uses_the_original_reservation | 分類/round/Cleanup/live/総数/Metadata/namesの7不足条件。先行Ownerは元の予約で解放、未dispatchを計数しない |
| all_source_failure_cleanup_cancel_and_deadline_points_keep_exact_session_counts | baseline876箇所×source失敗/cleanup未確認/取消/期限の3504実行。cleanup未確認は指定位置がcleanupの場合だけ注入。各prefixのtraceと会計が一致、全取得handleを一度解放 |
| every_early_work_prefix_leaves_both_ledgers_equal_and_cleans_owned_resources | bridge開始前の残work0〜159。片側commitや予約漏れなし。source未到達時の架空操作なし |
| legacy_entry_wrong_round_duplicate_connection_and_revoked_hook_are_rejected | session生成後の旧入口、別scope、同slot二重Connection、boundary終了後の保存Connectionを拒否。source呼出し0 |
| nonempty_xattr_copies_are_accounted_once_and_capacity_is_checked_before_copy | 全73snapshotでProvenance21byte。cap1533成功/1532拒否、実bytes1533/1512、local/session同値 |
| second_round_hits_cumulative_cap_without_refill_and_releases_its_existing_owners | 1roundのRead6後、2roundはround枠に余裕があってもsession残0で停止。2round目Read0、3round目の再開拒否、取得済Owner解放 |

3round成功は既存record phaseのafter_scan/finishを実行した後、**cfg(test)のacknowledgementだけ**でsessionを次slotへ進める。本番のstrict ack/完了setterは作っていない。sourceに渡すFakeはhandleを事前取得せず、OS接続を持たない。

## 3. 費目と所有

通常baseの独立traceは `[63,14,6,657,136]`、876試行。EINTR1を3roundで共有した累積は `[189,42,19,1971,408]`、2629試行。local summaryをsessionへ足さず、各dispatch/own/Acquisition Drop/Resource Dropの同じ起点から反映する。Resourceのraw.takeが唯一の実cleanup起点。session Connectionはrawを所有しない。

方式(b)では既存dispatch1/acquire時cleanup prepay1を再課金しない。接続契約 `bp5-r2-session-collector-entry-0.1` にscope.require1＋connection1を追加し、profile/計算/bridgeを含むfixture実費は1993 work。最初のEINTR roundは既存read guard/dispatch/分類の3 workを加え1996。session生成2・設定1・begin2・record/phase/ack費と管理allocationは別であり、これを全inspectionの上界とはしない。

session側の枠不足や中断がlocal precharge後に起きても、spent workだけが残り、両台帳の試行/予約は未commitのままsourceを呼ばない。cleanupはprepaidで停止後も継続する。snapshot bufferの確保前/NamesRead前のcapacity検査、応答後のbounded実bytes反映、retry/payloadの元SharedBudget共有を維持した。

## 4. 初回検証で判明した点

初回の追加試験はwork期待値と非空xattr fixtureの2件で失敗した。

- EINTRの既存費には宣言read guard1もあり、dispatch/分類だけの2ではなく3 work。従来kernelを直接動かす独立比較でも差3を確認した。
- 非空xattr応答を追加したfixtureでは、照合元のRecordSnapshot.namesがEmptyのままで、最初の比較がChangedになった。合成receiptのleaf/ancestorもProvenanceへ揃えた。製品の正規化/比較は緩めていない。
- 接続試作はsessionのstandalone prechargeも呼んでいたため、設計追記の方式(b)へ整理し、接続dispatchではsession側の追加work課金を廃止した。standalone内部会計の既存13テストの費用契約は維持する。

## 5. 最終検証

| 検証コマンド | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml session_bridge` | 新規8 passed、既存775 filtered |
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 変異復元後783 passed、5 suites、12.06秒 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 指摘なし |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `git diff --check` | 成功 |

接続dispatchをstandalone同様に追加課金する変異を一時適用し、固定collectorの実費テストがexit 101（実2873、期待1996）で失敗した。接続経路の追加課金を無効へ復元し、全783テストを再実行した。変異は残していない。文書検査は設計2文書/本記録の相対リンク先20件の存在・fence対応・改行/末尾空白を確認済み（節anchor内容は未自動照合）。

## 6. 未接続・制限

運用policy/承認producer、通常strictの全phaseとtyped cleanup/ack証拠、host終了報告、role外側owner/管理allocationを含む全体受付は未接続。固定費modelはwork blockの所有を表し、追加比較のCPU時間/RSSやOS syscall数を保証しない。Connectionの内部pointerは同時に生存するscopeのidentity比較のみで、dereference/出力/公開token化をしない。active cellは終了/unwindで失効するが、prepaid cleanupは失効後も続ける。
