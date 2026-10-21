# BP-5 R-2 OL-03：session状態・唯一生成claim・round bindingの合成検証

Date: 2026-10-21 / Scope: private Rust内部状態・合成receipt/scope。PDI/OS/実署名のE2Eではない。

## 1. 実装範囲と停止状態

[3round resource台帳設計draft-0.5 §16](BEST_PRACTICE_BP5_R2_OL03_THREE_ROUND_RESOURCE_LEDGER_DESIGN.md)に従い、`round_declaration/session.rs` にScanSessionLedger/RoundResourceScopeを追加した。state model=`bp5-r2-scan-session-state-0.1`、resource-0.2/collector-work-0.1と固定ID照合する。型は非Clone/非serde・opaque Debugで、source/実handle・運用cap・policy・permitを返さない。

SharedBudgetがprivateなclaim storageを所有し、生成を一度だけ消費する。台帳のdropでclaimが失われない。sessionは同receipt/target/contextへのborrow、lineage/origin/claim Rc identity、元startedへ結合する。Active leaseは排他的借用であり、同RoundScope object/tokenだけに結合する。使用tokenは固定3slotで再利用を拒否する。

全体受付無効・telemetry保留・APPROVED_REGISTRY=None・通常v2 Unavailable・gate92・DER/absence停止を維持する。既存collector/通常strictはsession未接続であり、今回の型を通らない既存の合成collector経路を禁止したものではない。

## 2. claim・失敗時停止

生成のstarted claimは最初のfallible work前に消費し、重複/未知model/予算不足/取消/期限/先行失敗でも解除しない。beginも期待状態を最初に消費し、全guard成功でのみActiveへ進める。失敗後の再開・別sessionへの置換・新予算への付替えを認めない。

budget::stopがclaim開始後の元理由をcellにも保持する。未完了ledger/leaseのDropはcellへUnavailableまたは既存理由を保存するだけで、I/O/新workを行わない。mutable budgetを持たないDrop直後はbudget.failedがNoneでも、次のcheckpoint/workで停止がラッチされる。既存HashMismatchの後に別理由をstopしてもHashMismatchを保持する。

このclaimは同じinspection budget内での唯一性であり、保護された実context/receipt/budget生成や別inspectionの運用承認を証明しない。budget生成時に固定のclaim storageを追加した分を含め、管理allocation/otherの全体審査は未完了である。

## 3. 新規10テスト

| 試験 | 内容 |
|---|---|
| 合成正方向と固定費 | Initial/BeforeM4/AfterM4のbeginとrequire、opaque Debug、work/payload/予約/retry/start不変（追加work以外） |
| 重複生成 | 2個目はBinding、既存sessionもstickyで再開不可。drop後もclaimは残る |
| ledger放棄 | 未使用ledgerのdrop後、元budget guardでUnavailable。再生成不可 |
| 生成失敗6条件 | work残0/1、未知model、取消、期限、先行HashMismatch。claim消費・同理由保持・再試行でwork増加なし |
| round/状態7条件 | BeforeM4/AfterM4先行、Active/AwaitStrict/Finished、既消費slot、Stoppedからのbegin拒否 |
| receipt等4条件 | 同内容でも別receipt/target/context object、RoundScopeの別budget originを拒否 |
| Active binding5条件 | copied scope、新token、originのみコピーした別claimの新budget、別start、旧modelを拒否 |
| token再利用 | 前roundのtokenを次slotへ持ち込んでもBinding。次slotのtokenを保存せず停止 |
| scope放棄/明示停止 | 未完了leaseをdrop、または先行HashMismatch後にChangedをstop。後続roundを呼ばず元理由を保持 |
| guard中断 | create/begin各2課金点・require1課金点の取消/期限（10条件）。spent prefixを保持しclaim/stateを復活させない |

正方向テストのscan完了・strict acknowledgementは、privateなtest fixtureがstateを進めるだけである。実resourceのcleanup・AfterScan・record再読・FinalIndex・M4を検証したものではない。Active/AwaitStrict/Finished/Stoppedの一部拒否もprivate fixtureで状態をseedして試験する。通常の並行leaseはmutable borrowで表現上拒否するが、専用compile-failテストは今回追加していない。

本番buildにscan成功通知/strict acknowledgement/完了setterはなく、生成したscopeを未完了のままdropすれば安全側に停止する。新sessionだけで3roundを完遂できる運用経路は開いていない。

## 4. 費目・可視性

- O.session_create=2 work、O.session_begin=2、O.session_require=1。すべて元SharedBudget、固定scalar/最大3token照合のみ。
- 最初の重複生成は1 workでBinding、既にstickyなら新workなし。未完了drop・明示stopは新しい課金を要求しない。
- 前工程の数量算術9 workやcollector S1902/bridge1910/準備1991へ新費目を含めない。session全体の完成した上界やcap受付として扱わない。
- resource model module/IDの可視性だけをstrict内部まで調整し、数量のfieldやconstructorを外へ公開しない。session APIはround_declaration内に限定、MCP登録や公開JSONなし。

生成guardのfresh判定を一時的に無条件trueへ変更すると、重複生成テストが失敗した。元のbudget-owned replace(true)を復元して再検証した。

## 5. 再現コマンド・結果

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml session::tests
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

最終結果：全体762テスト成功（従来752＋新規10、5 suites、10.71秒）。session::testsの新規10テスト、release build、Clippy全targets警告禁止、rustfmt check、diff check成功。更新5文書の相対リンク先67件、fence対応・末尾改行・末尾空白を確認した（節anchor内容の自動照合ではない）。npm全体・PDI・OS source・実署名の試験は再実行していない。

## 6. 未対応

round/session累積attempts/xattr会計・cleanup/live予約・実resource owner結合、protected shape/profile producer、strict完了通知と終了証拠、通常collector/strictへの必須入力化、I/R/O合算/全体受付・運用cap承認は未対応。stateの正常順序と実際のM4/strict完了を同一視しない。

OS接続・実機操作・token発行・設定変更・permit発行は行っていない。telemetry調査は再開していない。
