# BP-5 R-2 OL-03：record再読・厳密検証stage合成検証

Date: 2026-10-21 / Baseline: `1a4ce16` / Scope: offline synthetic only

## 1. 範囲

[終了証拠設計draft-0.6 §16](BEST_PRACTICE_BP5_R2_OL03_STRICT_COMPLETION_DESIGN.md)に従い、AfterScanRoundをmoveで消費して固定の `reread_bytes → clock_check(450000) → verify_records` を実行し、最後の共有budget guard成功後だけRecordsVerifiedRoundを返す。通常strict_roundへは接続しない。strict.rsへの差分は別の固定helper追加だけで、通常orchestratorの呼出し/順序は変更しない。

元session/slotのrecords_startedをfallible処理前に消費し、AwaitStrict・元budget origin/claim/started・Closed/session binding・同scopeのCompared phaseを要求する。別phase/Finishedはsource操作前に拒否する。receipt/target/contextは元scopeからだけ取得し、caller-suppliedなprojection/検証済みboolを入力にしない。

新stageはlease/ScanTailDataだけを保持する。Observationは前stageでdrop済み、JSON tree/record byteコピーをstageへ持ち越さない。失敗時は元理由とConfirmed cleanup/summaryを保持し、再開を拒否する。Source ownerはborrowのまま保持し、一時handleの解放とSource owner全体の破棄は区別する。

全体受付無効、telemetry保留。通常strict/OS/API接続・実機操作・token発行・設定変更・permit発行なし。FinalIndex以降のtyped tail/production acknowledgementは未実装。

## 2. 新規8テスト

| ケース | 検査 |
|---|---|
| actual_reread_and_strict_validation_issue_payload_free_record_stage | 実collector→AfterScan→再読/厳密JSONからstageを発行。旧tail直呼び列との実費差3、source試行数同一。未ack drop/forget後に次round拒否 |
| pinned_malformed_json_and_registry_mismatch_cannot_become_verified | byte/hashピンが合う不正activation JSON、context registry不一致を実verify_recordsで拒否。再読だけでは成功しない |
| record_stage_claim_and_budget_binding_are_one_shot | 重複claim、別origin/claim/started、Finished phase/別scopeのphaseをsource操作0で拒否 |
| record_reread_rejects_changed_bytes_metadata_namespace_clock_and_eof | byte差替え、metadata取得不明、再walkでのnamespace差替え、clock skew、zero/余剰EOF/過大read報告を拒否。正当な短読取は完走 |
| all_source_failure_and_late_stop_boundaries_release_temporaries_and_keep_reason | 実測した全source操作境界にReadFailed/取消/期限切れを各々注入。全一時handleのmade=freed、元理由保持、semantic検査前停止 |
| record_stage_work_prefixes_preserve_cleanup_and_stop_before_publication | 残work0/1/2/中間/末尾2境界と最終課金までの代表取消境界。stageを返さずcleanup/summary診断を保持 |
| record_stage_is_not_clone_copy_or_serializable | RecordsVerifiedRoundのClone/Copy/Serialize/DeserializeOwned不実装を型検査 |
| all_three_round_slots_use_actual_record_validation_before_test_only_ack | 同inspection/budgetで3slotの実厳密検証を各1回実施。一時handleをSource生存中に解放、ackだけcfg(test)で模擬 |

既存JSON fixtureを再利用し、collectorのindex/node/pathとactivation/ledger/registryのhash・bindingを整合させた。正常合成fixtureは実strict parserを通る。ピン済み不正JSONは再読のbytes比較だけを通り、意味検査では落ちるよう意図して作った。実際のRecordSource::revalidate projectionの呼出し回数は常に0である。

test-onlyのRecordFake支援・identity/claim破壊・ack補助だけをcfg(test) subtreeへ追加した。既存Fakeのfail/metadata/path/short-read等の挙動を再利用し、新しいOS sourceは作っていない。Observationのdrop probeも前工程同様に1回のままである。独立人手評価や実OSの解放/RSS測定の成績ではない。

別scopeのphaseはtest-onlyのObservationで実AfterScanを通してComparedへ進め、状態名だけでは拒否できない条件でscope object照合を検査する。これは新stageの成功票を合成する口ではない。

## 3. 費目・互換性

submodel `bp5-r2-round-records-0.1` をstageとhelperの独立literalで照合する。新controlはO.record_stage=3 work（claim/owner/phase binding1、固定helper/model1、終端1）。再読/clock/byte計上/strict JSON/意味/binding検査の既存費は省略しない。旧tail直呼び列と比較して実費+3、source操作同数を検査した。3round追加controlは9。

元SharedBudgetのwork/期限/取消・topology操作枠・payload bytesを共有する。scan/session操作数量へrecord側の数値を二重加算せず、retry/予約を再発行/返金しない。新stageにもObservation/可変長payloadを追加しない。固定長CompletionFailureの局所result_large_err allowは既存の理由を維持する。全体work/resource受付やCPU/RSS/hard期限の承認ではない。

## 4. 実行履歴と最終検証

初回コンパイルは新しい子moduleからtest-only ack_fixtureへの相対参照が1階層ずれてE0425になった。既存session/testsへの参照と照合し、test helperのパスのみ修正した。その後の新規7テストは成功し、3round試験を加えた新規8テスト/全体816テストへ進めた。製品cap/既存検査を緩める変更はない。

固定helperのverify_records呼出しだけを一時的に省く変異では、ピン済み不正JSONの拒否試験がexit101で失敗し、誤ったRecordsVerifiedRound発行を検知した。呼出しを復元後、別phase/Finishedの入口拒否と旧tail費比較も含めて以下を再実行した。変異は残していない。

| コマンド/検査 | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 最終状態で816 passed、5 suites、10.52秒（基準808＋新規8） |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功、警告なし |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 指摘なし |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `git diff --check` | 成功 |
| 文書検査 | 設計/親2文書/本記録の4文書・相対リンク38件、fence対応・末尾改行/空白を確認（節anchor内容は未自動照合） |

## 5. 次工程と未承認事項

RecordsVerifiedRoundからFinalIndex/Node厳密再照合への型付き遷移、その後の最終clock/checkpointとproduction strict acknowledgementが残る。通常strictの固定位置/source供給接続、全体work/resource受付、運用policy、OS sourceは未対応。新stageだけでstrict成功・実行可能と判断しない。telemetry調査は保留のまま。
