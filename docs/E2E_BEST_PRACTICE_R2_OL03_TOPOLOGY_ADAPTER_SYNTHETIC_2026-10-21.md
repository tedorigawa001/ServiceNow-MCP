# BP-5 R-2 OL-03：固定topology adapter・BeforeM4Position／AfterM4Handoff合成検証

Date: 2026-10-21 / Baseline: `bd9301b` / Scope: 内部subset、合成sourceのみ

## 1. 対象・停止範囲

[接続設計draft-0.3 §11](BEST_PRACTICE_BP5_R2_OL03_NORMAL_STRICT_CONNECTION_DESIGN.md)に従い、唯一のTopologyRunOwner、固定compare wrapper、BeforeM4Position、AfterM4Handoff、比較結果を保持するAfterM4Roundを追加した。通常strict差替え・OS source接続・実機操作・token発行・設定変更・本番policy投入・permit発行は行わない。全体受付は無効、telemetryは保留。

non-testの固定wrapperには任意callback入力がなく、通常kernel未接続のためBeforeM4でUnavailable停止する。有効Initial状態を合成で用意してこのwrapperを直接試験し、M4を取得しないことを確認した。通常entryでの成功を主張しない。

成功側はcfg(test)の接続口で既存の実collector/record検証/FinalIndex/clock/typed ackを通す。AfterM4Roundから比較結果を取り出す口もtest-onlyの固定kernel成功後だけ。test callbackのOkやRound enumだけを本番成功に変換する経路はない。

## 2. 結合と失敗

- owner.topology_started、root.compare_started／before_started／completion_consumedはfallible処理前に不可逆消費。実Initial ackをrequireしてからrootを生成する。
- 安定rootは元receipt/target/context・budget origin/claim/started・held leaf origin・TopologyReceiptへ結合する。元RecordSourceの所有構造は変更しない。
- BeforeM4Positionのconstructorは、既存compare_topologyのB成功とM4直前recheck成功後の固定callback内だけ。実BeforeM4 ackとwith_round末尾まで成功し、終端checkpoint後にbefore_succeededを確定する。
- 実M4比較が成功した場合だけ、その戻り値のComparedM0M4を所有するhandoffを発行する。model `bp5-r2-m4-handoff-0.1` は独立producer/consumer literalで照合。
- enterは同root/session/receipt/context/budgetと実BeforeM4 ackを再照合し、一度だけAfterM4 slotへ移す。別ownerも同じ進行状態・実ackを持つ条件で拒否を試験する。
- AfterM4Roundは比較結果を所有し続け、publicな取り出し/Clone/serdeを持たない。通常kernel/全体結果への接続はまだない。
- compare/enterの失敗は先行Failureと実BeforeM4 cleanup/summaryを保持してownerをStoppedにする。M4失敗でもBeforeM4 ackを取り消して再開させない。
- root/handoffの放棄Dropはshared claimを停止し、budget/ownerの次の検査を拒否する。mutable borrowを持たないrootがその場でledger enumを書き換えたとは主張しない。AfterM4RoundのDropはslot Dropでも台帳を停止する。

## 3. 新規11テスト

| テスト | 確認範囲 |
|---|---|
| real_b_recheck_before_m4_and_after_handoff_order_is_fixed | Initial→実B→recheck→BeforeM4実ack→M4→handoff→AfterM4実ack。同RecordSourceの再読cycle6。比較結果のentitlement gateはUnverifiedXmlのまま |
| production_adapter_stops_without_unimplemented_kernel | 固定non-test wrapperがBeforeM4でUnavailable、M4試行なし |
| b_and_every_topology_recheck_failure_prevent_before_or_m4 | B最初のread失敗、B payload hash不一致、2回のrecheck全22操作の各失敗でBeforeM4 body/M4を開始しない |
| topology_owner_requires_initial_ack_and_all_prepare_budget_guards | Initial未実行拒否、root生成の残work 0/1、全2課金後取消、全6checkpoint期限 |
| m4_error_origin_swap_and_late_results_stop_after_before_ack | 実BeforeM4 ack後のM4 metadata失敗・origin差替え・遅延取消/期限。AfterM4 slot未消費、失敗直後にownerがStopped |
| owner_receipt_held_and_budget_identity_are_not_interchangeable | 別held、別ancestry receipt、別budget origin、同状態の別ownerへのhandoff消費を拒否。元と相手のbudget双方が停止 |
| one_shot_claims_false_success_and_actual_before_failure_are_rejected | before/consume claimの重複、実BeforeM4 collector失敗とcleanup診断、偽Ok、再比較、重複root生成の拒否 |
| dropped_position_owner_and_pending_stages_do_not_authorize_after | root/handoff/AfterM4RoundのDropで再開不可。解放確認済みの全体成功には変換しない |
| shared_work_cancellation_and_deadline_stop_before_comparison_io | 比較入口のwork枯渇・取消・期限でBeforeM4/M4なし |
| late_compare_publication_and_every_handoff_guard_fail_closed | 実M4後の最終work取消、handoff＋slot takeの全work不足prefix、全4課金後取消・全12checkpoint期限、未知model拒否 |
| position_handoff_and_owner_types_are_not_clone_copy_or_serializable | 4型のClone/Copy/Serialize/DeserializeOwned非実装をコンパイル時検査 |

順序oracleはadapterのboolとは別のsource計数を用いる。固定thin Mach-O fixtureではBeforeM4 body直前にcopy済みbytesが80＋2×file size、EOF成功が2回、topology source試行が22回、metadata履歴がM0/M1/M2/M3だけであることを確認する。M4履歴はbody後にだけ追加される。80や22はこのfixtureの値であり、一般の配備ファイル/全体work上界の定数ではない。

fixtureは架空の厳密JSONと合成Mach-Oを使用し、既存Good fixtureのbytesは変えずSignatureNode variantを追加した。topology sourceの故障・遅延・origin差替えhookはtest-only。各試験で一時resourceの取得/Drop一致、live=0、payload/metadata予約解放を確認する。これは実OSのclose結果の証明ではない。

再比較/偽成功のforget試験はinertなslotまたは比較証拠を意図的に忘却するため、memory/cleanup成功を主張しない。one-shot claim、実ack要件、必須handoffにより後続を許可しないことを確認する。

## 4. 費目と初回の問題

新しい固定coupling費はroot生成2、compare入口/発行2、BeforeM4位置/実ack後guard2、handoff消費2の計8 work。既存slot take2/round、R/I/collector/typed ack費とは別。生成差分2、BeforeM4 body直前の差分4、body後の差分2、handoff enter差分4を合成計数する。全体受付や運用capには未使用。

初回test compileでprivate collector calleeへの到達とclosureのhigher-ranked borrow推論が失敗した。production calleeを広げずcfg(test)の薄いdelegateを追加し、slot型を明示して解消。clippyの大型Err指摘は216 bytesの診断を失敗後にheapへ移さない既存方針に合わせて局所allowとした。

最初のB破損fixtureはheader byteを変えたため、既存のrange比較が先にSourceMismatchを返した。hash不一致の試験はpayload byteへ変更し、既存の分類を変えずHashMismatchを検証した。B read失敗hookはoffset=0に限定し、A EOFをB readとして扱わないようにした。

## 5. 変異検証

1. BeforeM4の呼出しをB/recheckより前へ追加する一時変異で、順序oracleが未到達であることを検知して失敗（exit 101）。固定位置へ復元した。
2. handoff enterのroot/owner/budget照合を省く一時変異で、同状態の別ownerへAfterM4Roundが返ることを検知し `unwrap_err()` が失敗（exit 101）。照合を復元した。

どちらも恒久コードへ残さず、復元後に全テストを実行。既存の実compare_topology/compare_metadataをコピー/置換せず、通常strict本体も変更していない。独立した人手評価や実PDI E2Eの成績ではない。

## 6. 復元後の確認

- `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml`：858 passed、5 suites（基準847＋新規11）。
- `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings`：指摘なし。
- `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml`：成功。
- `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check`、`git diff --check`：成功。
- 更新4文書・相対リンク48件のリンク先、コードフェンス・末尾改行・行末空白を確認。

## 7. 未対応

固定production round kernel、BeforeM4/AfterM4の本番成功接続、通常strictの3固定位置の差替え、上位診断契約、全体work/resource受付・運用cap、OS sourceは別工程。handoffはM4時点の実比較証拠であり、その後のOS/path不変性・外側cleanup・実行permitを証明しない。通常entry/全体受付は停止、telemetryは保留を維持する。
