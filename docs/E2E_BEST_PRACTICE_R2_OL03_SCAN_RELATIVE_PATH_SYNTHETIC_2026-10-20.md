# OL-03 相対directory / file再照合：内部契約の合成検証

Date: 2026-10-20 / Scope: pure/synthetic subset。実機E2E・OS sourceの検証ではない。

## 1. 実装

`root_path/relative_path.rs`を追加した。RelativeBindingは同RootBinding、特定のcanonical ChildInput/親view、保持leaf resourceのorigin、相対全edgeの初期snapshotを固定する。一般の利用者が指定するpath/metadata/FD番号をconstructorで受け付ける実装ではない。初期snapshot/resourceの保護されたproducerは未実装で、テストだけで生成する。

source呼出し前にprefix集合・順序・Directory中間edge・entry/child参照同一性・初期snapshotの型/mode/size/device等を検査する。毎回 `/` から絶対祖先→root→相対祖先→leafまで探索し、前後に保持root/leafを観測する。DirectoryとFileのopenは区別する。

元SharedBudgetを使い、各成功handleをpost-guard前にowner化する。cleanup prechargeと一度限りDropを維持し、leaf/rootを含む初期snapshotを変更して受け入れる経路は設けない。比較完了はunitであり、実行permit/完全観測sealではない。

## 2. 合成テスト

7テスト関数（各関数内で複数ケースを反復）を追加した。

- directoryとfileの全絶対/相対edgeの操作順を検査。fileは16 source試行・6 temporary、directoryは14試行。peak owner2、全temporaryを一度だけ解放する。成功workはfile112/directory96。
- 全10観測点×11種の変化/Unknown（inode/device、内部前後差、xattr names、ACL、APFS/ownership/noexec等）で、最初の異常点から先のsourceを呼ばず停止。
- 全16取得点×Unavailable/Interrupted/WouldBlockで停止。元EINTR残8を減らすretryやfallbackはない。
- 全16取得点へ取消/10秒期限を注入。遅延成功handleも解放し、元理由を保持する。
- 残work0〜112の全prefixで元100万上限と解放を検査。112だけ成功、0〜111はLimit。
- 不正origin、root/leafのorigin共用、canonical entryコピー、祖先欠落/逆順、別leaf、初期device/size/mode/type/links/names/nanoseconds不正、使用済みbinding、別ChildInput/round/budgetの計18パターンはI/O前にBinding。
- 解放不明はUnavailableで成功にせず、先行Changedを上書きしない。

相対snapshotとのStat比較を一時的に外すと、差替えテストが「拒否を期待したが成功」で失敗した。比較を復旧して最終再実行した。最初のcargo check・対象7テスト・clippyは成功し、合成fail注入以外の初期不具合修正はなかった。

## 3. 最終検証

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

最終再実行結果：全Rustテスト **662 passed**（追加7、既存655）。clippy全targetsは警告なし、release build・cargo fmt check・diff checkも成功した。662はpackage内のテスト関数数であって、本件の独立評価ケース数やOS/APIの網羅率を示すものではない。

## 4. 費用・未対応

入口費V=`6+Q+2k+Σp_i`、再照合成功費=`V+9(h+k)+39`。Qは既存child guardの費用、p_iはcanonical参照の線形検索回数。file fixtureはh2/k3/V28、directoryはh2/k2/V21。実行時間・native syscall・RSSの上界を示す式ではない。h/k各64以下に対する262 source試行の固定capはローカルsubsetの有限性で、承認済みscan quotaではない。root単独経路の132 capは維持する。

初回walk receipt producer、scan_ops metadata/read/hashとresourceの実接続、全collector/seal、全work受付/3round配賦、OS source、更新lease/ABA防止、host cleanup票は未対応。BSD flags未収集とsystem祖先xattr制約も維持する。digestは再照合で計算しないため、metadata成功をfile内容の検証成功に置き換えない。

全体受付は無効、telemetryは保留。実機操作・OS/API接続・トークン発行・設定変更・本番policy投入・実行permit・Pushは行わない。
