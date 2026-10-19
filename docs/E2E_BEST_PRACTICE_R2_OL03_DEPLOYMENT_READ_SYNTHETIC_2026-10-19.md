# BP-5 R-2 OL-03：directory FD基準の配備読取・metadata/hash照合の合成検証

Date: 2026-10-19 / Status: 読取部品を内部実装/合成検証。実行permitなし、runtime gate=92を維持。

## 1. 範囲

[closure詳細設計](BEST_PRACTICE_BP5_R2_OL03_CLOSURE_DESIGN.md)のsafe観測adapterを追加した。
`native/r2-outer/src/deployment.rs`の`inspect_deployment(root, binding, started)`はmacOS arm64専用の読取検査API。
戻り値は既存`CheckedIndex`の集計だけであり、実行許可・署名確認・record信頼の昇格ではない。
他OS/archは`Unsupported`。CLI/MCP登録、exec接続、worker/host起動、token発行は追加していない。
root/bindingは呼出し側入力。将来の起動adapterが独立検証済みrecordから導出する必要があり、本API単独では信頼済み配備の選定を証明しない。

## 2. 実装した検査

| 段階 | 内容 |
|---|---|
| root/祖先 | `/`からcomponent単位の`openat`。directory FDを保持し、symlink追従なし。root所有・他者書込/特殊bitなし・ACL propertyなしを要求。最後に保持FDと親からの再openを照合 |
| runtime | root/子directoryはroot所有0555、通常file0444、固定Node0555、file link count=1。rootと同じdevice、root FSは`MNT_LOCAL`が必要 |
| FD | `O_NOFOLLOW/O_CLOEXEC/O_NONBLOCK`とdirectoryへの`O_DIRECTORY`。特殊fileをmetadataで拒否してから読取。File/DIRのRAIIで失敗時も解放 |
| index | 16MiB超はmetadataで読取前拒否。最大16MiB＋1byteの検出用読取、前後identity・size・xattr名照合。strict parserでschema/binding/集合を検証してからpayloadを読む |
| payload | 64KiB bufferで実bytesをSHA-256。期待size＋1byte以内で過大を検出し、短読取/size不一致を拒否。indexを一度読んだ量も2GiB予算へ計上し、重複hash読取はしない |
| 集合 | 実directoryをFDから列挙し、宣言した直接の子と完全一致。未知/欠落/重複名を拒否。固定policyに従った観測一覧を既存の純粋照合へ渡す |
| identity | device/inode/type・UID/GID/mode/link count/size・mtime/ctime（ns含む）とxattr名を記録。読取前後と最終のroot FD基準再解決で比較 |
| ACL/xattr | 既存のDarwin ACL property照会を再利用（空/deny-onlyも拒否）。runtime/indexは同一FDで属性名を列挙し、空またはprovenanceだけを許可。値は読まず出力しない |
| 時間/件数 | 元の`Instant`を共有、ループ/読取/再照合で全体10秒を確認。100,000 entries＋index＋rootのbounded metadata。通常の全file FD保持はしない |

index自身は最初の読取でhashを検証し、後続は同じsize/metadata/identityの再解決で照合する。Node等のpayload本文は保持・出力しない。
xattr名は64KiB以内、単一名255bytes以内、列挙競合・不正応答は拒否。quarantine/ResourceFork/未知属性は許可しない。
system祖先のxattrへの適用は設計上未決定のため行わず、祖先のowner/mode/ACLを検査する。
activation/ledgerのxattr追加は今回行っていない。既存record readerへの変更はACL helperの内部可視性だけで、判定を緩めていない。

## 3. 合成試験と証拠の区別

自身の一時領域に架空のNode/JS/indexを作成する。fake Node bytesは実行しない。
本番入口のownerは0固定で、公開のowner overrideはない。正常系はprivateなscan部品をfixture UIDで試験する。
通常UIDの一時領域が本番入口で拒否されることも確認したが、root所有の実配備が受理された証拠ではない。

| 試験 | 証拠 |
|---|---|
| 正常hash/集合/件数 | 実FDで架空bytesを読取。4 entriesとindex込みsizeを照合 |
| leaf/中間symlink | 一時領域に作成し、追従せず拒否 |
| hardlink/FIFO | 一時領域で作成し、拒否。FIFOを内容読取して待たない |
| mode不適合 | 実fixtureのroot/子directory/Node/JS/indexを変更し、拒否 |
| owner/device/特殊bit | 合成metadataで不一致を拒否。chown・mount・権限追加を行わない |
| bytes/size/集合不一致 | 同じ長さの別bytes・増大・未知/欠落・nested extraを拒否 |
| open後の差替え | テスト専用hookでleaf・indexを同じbytesの別inodeに交換、子を開いた後にdirectoryを交換。いずれも停止 |
| hash途中/完了後 | 読取中の追記、全hash後の同長bytes変更、xattr追加を拒否 |
| xattr | 名前parserで空/provenanceを許可、quarantine/ResourceFork/未知/不正を拒否。実一時fileの未知属性も拒否 |
| 上限/失敗時停止 | 16MiB＋1のindexはmetadata段階で停止。不正bindingではpayload読取hookが0回。期限切れはpathを開く前に停止 |

hookは`cfg(test)`のthread-localだけで、通常ビルドには存在しない。発火したことを各差替え試験で確認し、未実行による偽の成功を防いだ。
fixtureのmode/xattr変更は一時ファイルだけ。cleanupはsymlinkを辿らず、作成した一時directoryを削除する。
provenance値の意味・自動付与・削除可否を検証した試験ではない。

## 4. 途中の失敗と対応

- 正常系の最初のテストは固定拒否stubで失敗し、FD読取実装後に成功（RED→GREEN）。
- Clippyで境界式と8引数の内部関数を検出。境界の意味を維持して比較式と引数構成を整理し、lint抑制は追加しなかった。
- mode不適合試験でsetuid bitがfixtureに保持されず、読取検査が正しい通常modeとして受理された。実測modeを確認し、特殊bitは合成metadata試験へ分離。製品条件は変更なし。
- xattr設定試験は読取専用fixtureへの付与でEACCES。自身のfile作成段階で属性を付与してから0555へ戻す手順に修正。製品のxattr許可集合は変更なし。
- `statfs.f_flags`と`MNT_LOCAL`の整数型差でコンパイル失敗。固定bit maskの型を合わせて解消。

## 5. 最終検証

| コマンド（全て`bdo`経由） | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 75件成功（既存56＋新規19、3 suites） |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 成功 |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs` | 成功 |

依存追加/Cargo.lock変更なし。TypeScript/MCPの実装は変更せず、TypeScript全体回帰は今回再実行していない。

## 6. 残余と未実施

検査で観測した後からexec/importまでの不変性は保証しない。更新lease・排他・稼働release保持は未実装で、再hashや最終metadata一致だけで代用しない。
ABAやroot/OS侵害の完全検出、特権によるctime改変への耐性、任意のFSへの適合は主張しない。
`MNT_LOCAL`/device検査は実装したが、network FSや子mountを実際に作る試験は行っていない。
不適合ACLの実付与・root所有正常配備・最大閉包のI/O性能/RSSは未検証。metadata syscall/読取は協調的deadlineであり、kernel/I/O hangの強制中断は別課題。
署名/entitlement、全reader group、recordへのbinding統合、exec直前の最終検証は未完了。実行permitは発行せず、runtime gateは92のまま。
PDI/実配備への操作、token発行、共有設定/アカウント/ACL変更、署名配備、Pushは行っていない。telemetry調査は保留。
