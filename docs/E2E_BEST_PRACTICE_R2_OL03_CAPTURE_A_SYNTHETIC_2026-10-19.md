# BP-5 R-2 OL-03：preflight range・全体hash A採取・純粋parser接続の合成検証

Date: 2026-10-19 / Scope: private合成source接続のみ。OS pread/実保持FD・API呼出しなし。

## 1. 実装と非authority境界

[保持FD/parser接続設計draft-0.3](BEST_PRACTICE_BP5_R2_OL03_HELD_FD_PARSER_DESIGN.md)§13を実装した。
`physical_signature.rs`からheader長/range検査を分離し、従来parserとpreflightは同じMach-O検査を使う。
`positioned_read/capture.rs`で同じReadScope/sourceを借用し、32bytes→bounded header再読→range抽出→全file A hash/採取→EOF/照合→純粋parserの順で接続した。

- 先頭32bytes・header長・profile・ncmds/sizeofcmdsを確保前に検査。LC一意性・alignment・領域/EOF・required command・5MiB署名上限を共有検査する。
- 全体SHA-256へ渡す同じ64KiB以下のblockから、重なったheader/commands・signatureだけを採取。採取量は宣言長と一致させる。署名rangeを後から独立再読しない。
- 全体hashは入力期待hashと完全一致、初期32bytes/preflightとAのheaderも一致させる。不一致で期待値の上書き・range再計算・弱いretryはしない。
- shared 10秒/2GiB/読取回数/EINTR枠/予約を維持。実読取量は`32 + header全長 + N`（正常EOF0bytes）で、残予約を二重課金しない。
- parserへ開始Instant/cancel/clockをそのまま渡す。loop内も同じ期限で、期限後のparser結果を返さない。
- buffer確保はboundedなtry_reserve_exact。最大bytes bufferは7MiB＋64KiB＋96bytes（初期32bytesを含む）。allocator/RSS全体の上限証明ではない。
- HashMismatch/SourceMismatch/Parser(reason)も既存台帳へラッチし、後続read/新scopeを停止させる。公開exit code/JSONは変更しない。
- 成功値はprivateな`CapturedA(pending_revalidation_not_execution_authority)`。固定Debugだけでbytes/Team/identifier/hashを表示しない。所有bufferに対する自己参照Inventoryは作らない。

入力期待hash/Nはまだ呼出し側データで、root承認record由来ではない。同じsource objectの借用を同じ実FDの証拠とはしない。
**B再hash・metadata/祖先/path/record/lease照合は未実装**。Aのcursor通過後の変更を検出できない場合を、限界確認用の合成試験として残す。
DER/absence/XML意味統合は既存どおり必ず停止し、CapturedAを署名validityやpermitへ昇格させない。
通常v2入口Unavailable・本番registry未設定・runtime gate92を維持。telemetry調査は保留。
API実接続・実機/PDI操作・token発行・設定変更は行っていない。

## 2. 追加25テスト

| 群 | 確認内容 |
|---|---|
| 正常採取 | header/signatureが元bytesと完全一致、全体hash/実読取課金、署名だけの再読なし、pending固定Debug |
| 分割境界 | headerと署名が64KiB境界をまたぐ場合、multi-chunk署名、header1MiB＋32bytesちょうど、署名5MiBちょうど |
| preflight拒否 | ncmds4097/sizeofcmds超過/EOF外を初回32bytes後に拒否。別CPU/format/subtype/type/reserved、LC欠落/重複/未知required/不正rangeはA走査前に拒否 |
| 同一stream | 初期32bytesとpreflightの差、preflightとAの差（変更後hashが一致していても拒否）、採取range外の本文変更も全体hashで拒否 |
| hash/parser | 誤った期待hashを計算値へ更新しない。正しい全体hashでも不正SuperBlobをparser理由で拒否 |
| I/O | 初期header/preflight/Aの短読取、EOF追加1byte、EINTR後の同じoffset/sliceと実bytesのみの課金 |
| 共通予算 | 課金持越し/残予約解放、台帳容量不足・開始期限/取消でsource0回。失敗後のread/再capture/次scopeも停止 |
| 途中停止 | 大きいheader/preflight/A/EOFの各readで遅延成功を破棄。A中/EOF時の取消、parser loop内で元clockが10秒へ到達した場合も拒否 |
| 純粋helper | block/rangeの部分重なり/空交差・checked overflow、確保上限超過を拒否 |
| 停止と限界 | DER/absence/XMLは必ずgate失敗。cursor通過後の変更はAだけでは拒否できない場合もpendingのままで、再検証済みとは表示しない |

元の33件のparser試験と27件の読取境界試験も維持。既存248件＋追加25件＝273件（5 suites）。
fixtureは架空のCMS/XML/DER・identifier/Teamを持つbytesだけ。実署名/実行可能性の検証やコード実行には使わない。

## 3. 検証

```text
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

最初の追加23件と既存parser33件は成功。Clippyで合成sourceのnested ifを1件検出し、条件を維持してlet-chainへ整理した。
header上限・cursor通過後変更の2件を追加。最終結果は273件成功（5 suites）、release build成功、Clippy指摘なし。
cargo fmt・fixture rustfmt・diff検査、関連7文書のlocal link・code fence・行末空白検査も成功。依存/Cargo.lock変更なし。
TypeScript/MCP E2E・実OS I/O・Security適合は今回対象外。

## 4. 次工程

同じ保持FDのopener/ownerとmetadata、B走査/採取range再比較、祖先/path/record/lease再照合は未接続。
実deployment/nativeは新しい台帳をまだ使わず、全運用経路の予算を強制したと主張しない。
本結果からAだけで更新排他・ABA耐性・実署名validity・DER/absence・permitを証明しない。
