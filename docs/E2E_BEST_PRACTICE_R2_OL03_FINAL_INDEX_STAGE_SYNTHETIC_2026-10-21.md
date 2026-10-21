# BP-5 R-2 OL-03：FinalIndex／Node再照合stage合成検証

Date: 2026-10-21 / Baseline: `4ff8832` / Scope: offline synthetic only

## 1. 範囲

[終了証拠設計draft-0.7 §17](BEST_PRACTICE_BP5_R2_OL03_STRICT_COMPLETION_DESIGN.md)に従い、RecordsVerifiedRoundを消費して実IndexPhases::finishを呼び、index再認証/厳密意味/Node宣言再照合と終端guardの成功後だけFinalIndexRoundを発行する。元session/slotのfinal_index_startedをfallible処理前に消費し、AwaitStrict・record/AfterScan claim・元budget/Closed binding・同scopeのCompared phase・固定submodelを要求する。

新stageは元の排他的leaseとScanTailDataだけを保持する。Observationは前工程で破棄済み、JSON tree/record bytesをstageへ追加しない。private constructor、非Clone/非Copy/非serde、opaque Debugを維持する。失敗は元FailureとConfirmed cleanup/summaryを保持して停止し、claimを戻さない。未ack drop/forgetで次roundを開けない。

通常strictの呼出し順序/旧finish処理は変えず、合成経路用固定adapterだけを追加する。全体受付無効・telemetry保留・運用policyなし。通常strict/OS接続・実機操作・token発行・設定変更・permit発行なし。新しい実ファイル/署名の検査ではなく、既存immutable index宣言とTargetDeclarationの再照合である。

## 2. 新規7テスト

| ケース | 検査 |
|---|---|
| actual_final_index_and_node_checks_issue_only_payload_free_typed_stage | 実collector→AfterScan→record再検証から実finishへ到達。既存phase上界から独立に実費28/新stage31を照合。Finishedを確認し、未ack drop/forget後に次round拒否 |
| final_index_claim_phase_and_budget_binding_are_one_shot | 重複claim、既Finished、別scopeの実Compared phase、別budget origin/claim/startedを拒否 |
| all_final_index_work_shortage_and_post_charge_cancel_prefixes_stop | 全不足work prefixと各課金直後の取消で型付き成功を返さず、元理由/cleanup/summaryを保持 |
| every_checkpoint_deadline_including_after_phase_finish_refuses_publication | 全clock/checkpoint境界の期限切れと開始前取消/期限を拒否。phaseがFinishedになった後も終端失敗なら新stageなし |
| same_fixed_node_checker_rejects_missing_wrong_digest_size_and_mode | 同じverify_node_entriesへNode欠落/digest/size/mode不一致を直接与えるcomponent試験。immutable入力をunsafeに書き換えてstageへ入れる試験ではない |
| final_index_stage_is_not_clone_copy_or_serializable | FinalIndexRoundのClone/Copy/Serialize/DeserializeOwned不実装を型検査 |
| three_slots_recheck_final_index_node_without_a_production_ack | 同inspection/budgetの3slotで実FinalIndex/Node再照合。index decodeは合計3回のまま、ackだけcfg(test)で模擬 |

全stage試験は前工程の正常record fixtureを再利用し、実record strict parserを通る。別scopeのphaseはtest-only Observationで実AfterScanを成功させてComparedへ進め、状態名だけでは正当化できない条件を作る。

新stage中はscan/RecordSourceの操作数、record validation回数が増えず、Observationのdrop回数は1のまま。immutable index treeの再decodeは増やさず、実recheckを実行する。別phaseを用意する拒否fixture自身のdecode1回だけは区別する。Remaining読取口/claim破壊/ack補助はcfg(test)に限定する。

## 3. 費目

固定submodel `bp5-r2-round-final-index-0.1` をstageとphaseの独立literalで照合する。追加O.final_index_stage=3 work（claim/owner binding1、同phase/model1、終端1）。既存finishのtransition/recheck/Node/checkpointはそのまま実行し、従来の上界/slackを緩めない。

独立照合式は `remaining_current − unspent slack87 + existing transition1`。fixtureの旧finishは28、新stageは31。旧経路の直呼び費との差3も確認し、3round追加controlは9。Node再照合を省略する変異では4 entry分が消え、24対期待28として検知した。

operation/bytes/retry/予約を再発行/返金/二重加算しない。全体work/resource受付は無効であり、この固定費はCPU/RSSやOS上の真実性の保証ではない。

## 4. 実行履歴・最終検証

最初の途中検証は宣言済みtest moduleのファイル未作成によりfmt/compileが停止（E0583）。本体追加後はRemainingのprivate field参照2箇所がE0616になり、製品fieldを公開せずcfg(test)の読取専用getterへ変更した。新規7テストは成功した。初回全体823件も成功したが、clippyはtest clockのcollapsible_ifを1件指摘した。既存書式と同じlet-chainへ変更し、挙動/製品cap/警告抑止を変えていない。

既存finishのNode検査呼出しだけを一時的に省く変異では、独立費用照合試験がexit101で失敗した。実呼出しを復元し、最終状態で以下を再実行した。変異は残していない。

| コマンド/検査 | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 最終状態で823 passed、5 suites、13.93秒（基準816＋新規7） |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功、警告なし |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 指摘なし |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `git diff --check` | 成功 |
| 文書検査 | 設計/親2文書/本記録の4文書・相対リンク41件、fence対応・末尾改行/空白を確認（節anchor内容は未自動照合） |

## 5. 未対応

FinalIndexRoundから最終clock/checkpointへの消費型遷移とproduction strict acknowledgement、その後の通常strict固定位置接続が残る。運用policy/全体受付、OS source/実機、token/設定変更、permit発行は今回の証明対象外。FinalIndexRoundやIndexPhases::Finishedだけでstrict成功・実行可能と判断しない。
