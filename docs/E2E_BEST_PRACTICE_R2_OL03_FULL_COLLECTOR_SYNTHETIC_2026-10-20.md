# OL-03 scan_ops全件回収collector：合成検証

Date: 2026-10-20 / Scope: private合成sourceと明示quota。実OS/PDI E2Eではない。

## 1. 実装

`scan_ops/collector.rs`を追加し、ReadyのScanInputsへ結合した期待集合から、root/全directoryの列挙、cursor/全edgeの完全metadata、全fileの同resource read/EOF/hash、作業後の固定anchorからの全path再探索を実施する。初期snapshotと完了観測は別slotで管理し、全件完了と終端cleanup/guardの成功がなければClosureObservationを返さない。

runtime 0555とsystem祖先0555/0755は専用profileで分ける。legacy childrenは従来挙動を維持し、collectorだけが追加のcursor snapshot callbackを使う。fileの観測は実Stat＋実digestから作り、宣言のcloneを観測完了へ置き換えない。indexは同record pinのleaf/祖先にも結合する。成功後もAfterScan/FinalIndexは必要である。

通常ClosureSource呼出しは切り替えていない。現在のClosureRequestにはReadyのScanInputsがないため、型付きbridge・承認済みquota producerは後工程とする。集約Observationを返すlegacy path sourceをnative操作としてwrapせず、同じ再照合条件を単発scan_opsへ接続した。保護されたOS producerは依然存在しない。

## 2. 合成テスト（新規11関数）

- 通常4 entry＋virtual indexの全5 entryを実際のfake read/metadataで回収し、出力全集合を照合。Initial/BeforeM4/AfterM4ごとにAfterScan/FinalIndexへ接続。
- 1つのSharedBudgetで3roundを連続実行し、start/work/payload・EINTR残を共有。最初のreadで1回EINTRを注入し、全roundを通じ残7のまま、payloadは3×全file bytesになることを確認。
- 空file、65,537-byte fileのchunk/EOF位置、indexが`dist/index.json`にあるnested caseとvirtual entryのsorted mergeを確認。
- 未知名・重複・missingを拒否。未知名`evil`をopenしない。cursorの同resourceとして整合した別inodeもparent照合で拒否。
- file/絶対祖先の差替え、index pin metadata差を拒否。特にhash完了後のleaf再openでinodeを変え、完了済みdigestがあっても全結果を破棄する。
- digest不一致、短読取、EOF1、EINTR枯渇、FS Unknown、noexec、cleanup不明で停止し、部分観測を返さない。
- quotaなし、open/enum/read/metadata/cleanup/live各0、name allowance0、別round tokenで失敗時停止。別tokenはsourceを呼ばない。
- 正常fixtureの全876 source操作点へ取消と期限切れを注入。失敗点以降はcleanupしか呼ばれず、全成功handleが一度だけ解放される。
- 全非cleanup操作点へ取得失敗を注入。以後の通常I/Oがなく、一度だけの解放を確認。cleanup不明は別ケースで検証する。
- 残work0〜63と成功費直前/近傍のprefixで、100万cap・cleanupを確認。これは全1886 prefixの網羅ではない。
- system profileの正常0755を確認し、runtime入口の0755/anchor、systemのfile/cursor指定はBindingで拒否する。

再照合のStat比較を一時的に無効化すると、hash後leaf差替えのテストが「拒否を期待したが成功」で失敗した。比較を復旧して最終検証した。

## 3. 計数と初回実行で判明した点

fixtureのcollector部分は**1886 work / payload4590 bytes / source876操作（cleanup含む） / peak live owner5**。各roundで同じ値だった。実OS syscallや全モデルの上界ではなく、Node/Ready前処理・呼出し元AfterScan/FinalIndexは1886に含まれない。旧scan候補式1362や純粋比較器106/94の式を流用しない。

コミット分割時の再検証：期待子一覧の前処理を含めないよう、2回全entry走査＋virtual index挿入の列挙部分を分離・再構成した。切り出した前工程のcollectorは**1884 work**で、先行作業ツリーの1886と区別する。payload4590/source876/peak5と全677テストは維持する。後続最適化版1902との差はこのコミット基準では18 workである。以前の1886をこのコミットの実測値として引用しない。

初回cargo checkはowned path componentとborrow型の不一致、短いcursor borrowの寿命指定、closureの戻り参照寿命で失敗した。既存parser/Resource契約を照合し、owned Layout、readonly record射影、通常関数の寿命推論へ修正した。初回テストcompileでは共有合成fixtureのprivacyに失敗し、cfg(test)内だけをstrict配下へ共有した。既存fixtureの共有はtest限定であり、新しいLayout等の入口もprivate内部契約に限定する。公開OS入口は追加していない。

## 4. 最終検証

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

最終再実行結果：全Rustテスト **677 passed**（今回追加11、既存666）。clippy全targetsは警告なし、release build・cargo fmt check・diff checkも成功した。既存666には先行canonical最適化の4テストを含む。テスト関数数であり、独立評価ケース数や実OS/APIの網羅率ではない。

## 5. 未対応・停止維持

本番system ancestor policy/xattr/BSD flags、保護されたopener/root/context/record producer、OS backend、型付き通常ClosureSource bridge、work/operation/FD/memory/cleanup配賦と全体受付、更新lease/ABA・検査後変更防止、hard期限・host cleanup票は未対応。

expected child構築はdirectoryごとに2回全entryを走査し、完全metadataや追加walkの費用もある。大規模閉包が100万workに収まるとは主張せず、capや期限を緩めて通さない。新規依存・MCP登録・実機操作・トークン発行・設定変更・本番policy投入・permit発行・Pushは行わない。gate92/通常v2 Unavailable/DER・absence停止・telemetry保留を維持する。
