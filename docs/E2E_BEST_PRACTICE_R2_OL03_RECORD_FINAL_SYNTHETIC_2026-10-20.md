# BP-5 R-2 OL-03：record再読・最終照合の内部契約と合成source

Date: 2026-10-20 / Status: 合成検証のみ。実reader/parser/OS接続・lease・permitなし。

## 1. 範囲

[FD移譲設計draft-0.5 §15](BEST_PRACTICE_BP5_R2_OL03_SECURE_FD_TRANSFER_DESIGN.md)の内部契約を追加した。
固定activation/ledger/indexのbytes/hash/identity/祖先/path/意味投影/clockを比較する。
telemetry調査は保留。実機/PDI操作・API実接続・token発行・設定変更・本番policy/permit発行・Pushは行わない。

## 2. 実装と停止範囲

- RecordReceipt/RecordPinはprivateな比較用初回証拠。lineageと全RecordBinding、3件のkind順序/固定path・深さ/size/hashに結合。非Clone/非serialize、公開producerなし。
- activation/ledger各64KiB、index16MiBをsource開始前に検査。SHA-256は64KiB chunkで元checkpointを確認。初回pinsのallocation/実読取認証は後工程。
- record sourceは固定anchor/parent相対walk/同じleafの位置指定read/metadata/clock/意味投影再検証の単発境界。初回bytesへexact一致させ、別path・新世代・新期限へ追従しない。
- read前の全path、read後の同handle metadataと全path再walkを必須にする。一時resourceはcurrent/next最大2、次walk前に旧leafをdrop。record順次処理で既存target scopeと重複して132を超える構造にしない。
- 全Stat/ACL/FS/可視名の比較、activation root/0440/readerGID、ledger executionUID/0600、index root/0444を要求。system/recordのOS xattr/FS profileを運用承認したとはしない。
- positive short readは進捗分継続、0進捗/過大返却はReadFailed、byte差/extra EOFはChanged。全成功copyは元2GiBへ課金し、A/B予約を使わせない。buffer最大64KiB。
- B後topology→record再読→M4→record最終再読の順序を新しいreview_record_targetで必須化。旧TopologyComparisonの意味は維持し、完成値から新結果への変換口は追加しない。
- 元clock pair/開始Instantとのelapsed差、巻戻し、開始460秒超・再読前後450秒超を確認。10秒/cancelとsticky failure、契約境界16384回は全体で共有する。
- 最終成功は固定DebugのRecordComparisonだけ。source/target/pinsは返却前に解放。entitlement/native/runtime gateは停止したまま。

重要：fixtureのrecord bytesは架空の**非JSON文字列**で、revalidateは合成RecordBinding投影を返す。実schema/JSON/registry/全closure集合を再parseした証拠ではない。厳密parserを共有予算へ接続するadapterは未実装。

## 3. 追加17テスト

| 分類 | 内容 |
|---|---|
| 正常/順序/秘密非出力 | M4前・後に全3件再読/再投影。M0〜M4各1回。payloadはA/B分＋実record copy分。Debug固定・entitlement拒否・全resource解放 |
| 差替え | 2回の再読の各record leaf/全祖先で同bytes別inodeを拒否。読取中のnamespaceだけの変更もread後全walkで拒否 |
| bytes | 全3件×M4前後のbyte変更。後から得た値を採用せず、投影前に停止 |
| 意味投影 | generation/release/policy/registry/UID/期限/index bindingの全field分類で変更を拒否 |
| 初回結合 | 別lineage/世代、pin hash差、kind並替え、祖先数、空bytesを取得前に拒否 |
| 期限/clock | activation/ledgerの開始460秒境界、初回/M4前後のclock driftを拒否。固定期限を書き換えない。適合clock下で実行中に期限が切れたという試験ではない |
| 取得失敗matrix | 正常経路の全source境界で1回ずつ失敗させ、retry/後続処理なし・解放を確認 |
| short read/EOF | 3bytesずつのshort readは成功、早期EOF/extra EOF/過大返却は停止 |
| 上限 | 元2GiB/契約16384枠を維持。A/B予約が占有しているとrecord readはLimit。各record上限超はsource0回 |
| 不明/policy | 不正owner/mode/nlink、unknown可視名・危険directory mode・未許可名で停止 |
| 期限/cancel matrix | 全source境界でlate成功も含めて期限/cancelを挿入し停止。handle/target/読取予約を解放 |
| 既存失敗/unwind | 既存failureならsource/bytes0、walk中panicでもRAII解放。実OS closeや運用panic回復の証拠ではない |

## 4. 実行コマンドと途中経過

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

- 初回コンパイルで、再利用するtest-only Syntheticの関連Temporary型がprivate interfaceとなりE0446で停止。テスト親module内だけの可視性を揃え、製品APIは公開しない。
- 共通比較器の抽出後、Clippyのlet_and_returnを検出し、等価なmatch式の直接返却へ整理した。
- 初期12件→再walk/期限/cancel追加15件→サイズ/予約上限追加17件が成功。
- 投影比較を一時的に外す感度確認では世代変更テストが失敗（不正な成功値を検出）。比較を復元して全体を再実行し、一時変更が残らないことを確認した。
- 全体424件（5 suites）成功、release build成功、Clippy指摘なし。cargo fmt/fixture rustfmt、5文書のlocal link/コードフェンス/行末空白、git diff --checkも成功。

## 5. 残る境界

実installed reader/安全な初回allocation・共通予算への課金、OS flags/実FD/ACL/xattr/FS可視性、厳密record再parse・全closure集合producer、OS clock、更新lease、process全体FD/cleanup枠、hard timeoutは未接続。
合成sourceが正直に観測/投影する前提であり、偽造source・ABA・record間/検査後の変更を排除する証明ではない。原子的な検査や後続exec用の有効cacheとして使わない。
APPROVED_REGISTRY=None、通常v2入口Unavailable、runtime gate92、DER/absence停止、既存JSON/exit codeを維持する。
