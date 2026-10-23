# BP-5 R-2 OL-03 MA-01：管理allocation合成イベント計算の検証記録

Date: 2026-10-24 / Source baseline: `ee77897` / Scope: 合成・offlineのみ、実allocator/OS/E2E未実施

## 1. 対象と非実行境界

[複合契約draft-0.2 §7](BEST_PRACTICE_BP5_R2_OL03_PC03_MANAGEMENT_BOOTSTRAP_CONTRACT.md)のMA-01を、[private management module](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session/resources/management.rs)と[合成テスト](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session/resources/management/tests.rs)で確認する。実source/allocator hook・cap registry・保護必要量issuer・通常strict callerへ接続していない。

4軸は入力された合成イベントの要求量で、実RSS/FD/heap layout/cleanup完了の証明ではない。全5項目Unknown・finalize発行不能・本番capなし・全体受付無効・telemetry保留を維持する。実機操作/token発行/設定変更/permit/Pushなし。

## 2. 実装したsubsetと費用

- model `bp5-r2-management-trace-0.1`、512イベント/64非再利用ID。単発16 MiB・累積256 MiB・live128 MiB・alignment最大4096は合成domain上限で、運用承認値ではない。
- 固定`[Slot;64]` stack scratch。range確認後にID直接index、heap確保/探索sort/可変scratchなし。scratch型4096 bytes以下をテストするが、関数全体stack上界は主張しない。
- Reserveでattempts/cumulative/max/live予約を計上、Commitは所有へ移動、FailNoBlockはliveだけ返す。growは旧新重複と双方向linkを維持。Move/Borrow/CloneRefは確保を増やさない。ReleaseUnconfirmedはUnavailableで停止しliveを減らさない。
- S0はcarry-out結果だけを返す成功handoff終端、BXはpending解決と解放後に限り閉鎖済み合成結果を返す。pending/未解放/順序逆行/再開を拒否する。
- workは入口3＋scratch初期化64＋carry各4＋event各3〜5＋final64＋終端2。上界`133+4C+5E`、最大2949。初期化64はまとめてprechargeする単一呼出しで、命令単位の中断ではない。
- 元budget origin/startedへローカルAttemptを結合し、最初のfallible処理前にusedを消費する。production claimは追加せず、失敗第一理由を元budgetに保持する。別budget提示では提示側停止、元へ再提示すればusedで拒否。将来の実証拠の双方停止とは区別する。

## 3. 独立literal oracle

productionのwork上界helper・集約helper・係数/offsetをoracleの期待値に使っていない。次の手計数値をliteralとして比較した。単位は合成要求bytes。

| trace | attempts | cumulative | peak | maximum | carry-in / carry-out |
|---|---:|---:|---:|---:|---|
| 8確保→13へgrow、旧新順次解放 | 2 | 21 | 21 | 13 | 0 / 0 |
| 8を解放後13を確保 | 2 | 21 | 13 | 13 | 0 / 0 |
| 8 carry-in→13 grow失敗→参照/移動→解放 | 1 | 13 | 21 | 13 | 8 / 0 |
| 13の確保失敗 | 1 | 13 | 13 | 13 | 0 / 0 |
| 8 carry-in＋13確保してS0へ | 1 | 13 | 21 | 13 | 8 / 21（2 blocks） |
| 空→BX閉鎖 | 0 | 0 | 0 | 0 | 0 / 0 |

上限テストも独立literal（128 MiB=134217728、256 MiB=268435456等）を使用。同時量と累積量を別に判定し、確保失敗の試行/要求量を返さないことを確認した。

感度確認：productionのpeak更新を意図的に`max(live)`から`max(single_request)`へ変更し、最初のoracleがpeak13対期待21で失敗（exit101）した。変異を復元し、同oracleを再実行して成功した。これは計画した変異試験で、未解決の製品不具合ではない。

## 4. 拒否・中断・秘密非出力

- ID0/65/255、退役ID再利用、carry重複、unknown/pending block参照、二重解放、0/過大要求、alignment不正、grow同ID/不増/異class/異alignment、pending中旧block解放/二重growを拒否。
- 513イベント/65carryをscratch/走査前に3 workで拒否。512イベント/64ID・単発/alignment/live/cumulative等号、各1超過、checked算術overflow/underflowを確認。
- B phaseのskip/逆行、BXからの新規確保/再開、S0後イベント、誤end、pending・残存ownerを閉鎖済みにする試行を拒否。BXへの遅延Commitも所有化して解放を要求。
- grow閉鎖162、carry-out160、確保失敗144 workの各位置についてLimit/Cancelled/Deadlineを注入し、再run拒否・第一理由・spent非返却を確認。初期化precharge内は同じguardで拒否する複数unit境界である。
- 元I/O used/reserved/retry・metadata/topology台帳は変えず、session/policy/bridge/Draft allocation claimを開始しない。入力不一致や外部sticky failureは先行理由を保持する。
- 結果/Attemptは非Clone/Copy/serde、Debugは固定opaque。外へtrace値/path/pointer/資格情報を表示する口を追加しない。テスト内部のassert差分は架空bytesだけ。

## 5. 検証コマンドと結果

| 検査 | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml management::tests` | 12件成功（既存996件はfilter）。合成assert内の複数ケース/境界注入を含む |
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 最終1008件成功、5 suites。基準996＋新規12 test functions |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 最終指摘なし |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |

実行時は全commandにプロジェクト指定の`bdo`を付けた。初回clippyはテスト内の未使用`cell::Cell` importで失敗した。利用がimport箇所だけであることを確認し、そのimportだけ除去した後にclippy・全体テスト・build・整形を再実行した。計算仕様や停止条件は緩めていない。

更新4文書の相対リンク29件/末尾空白とgit diffチェックも通過した。文書のみの追記で数値oracleや実機を追加実行したとは扱わない。意図的なpeak変異のexit101と初回clippy失敗は、最終成功結果とは分けて保持する。

## 6. 未対応

実allocatorのlayout/capacity/ABI、Rc::new OOMの型付き回収、固定領域・nested/parse一時量・全phase coverage、保護profile/receiptからの実projection、全5項目・BootstrapCaps/全体work/payload受付・実cap承認・完成parts/通常strict/OS接続は未対応。raw合成trace/この結果をCompleteRequirementEvidenceへ変換する入口はない。

同budgetから別の合成Attemptを作ることは許されるが、実resource/authorityを発行せず元budgetのworkを消費する。Drop/forgetで実資源の解放を証明しない。scratch/入力slice/Attempt自身の保持量は将来の独立費目であり、合成4軸を全管理量と呼ばない。

## 追補：最悪work上界の事前確認（2026-10-24）

[契約§7.4](BEST_PRACTICE_BP5_R2_OL03_PC03_MANAGEMENT_BOOTSTRAP_CONTRACT.md)のとおり、scratch初期化前に残りworkが`upper − 3`以上かを確認するようにした。新規1テスト`worst_case_work_is_checked_before_scratch_and_iteration`で、Advance(BX)1件（上界138・実消費136）について残り137ではLimitかつ消費は入口3だけ、残り138では成功・消費136を確認した。事前確認を無効化する一時変異で同テストが失敗することを確認し、復元した。既存の全work境界試験は変更なしで成功。Rust全体1009 passed。
