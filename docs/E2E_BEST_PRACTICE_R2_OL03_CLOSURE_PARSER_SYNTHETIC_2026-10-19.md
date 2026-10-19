# BP-5 R-2 OL-03：closure index parser・集合/binding照合の合成検証

Date: 2026-10-19 / Scope: オフライン合成データのみ / Status: parserと純粋照合を内部実装。実行許可なし。

## 1. 対象と実装境界

[closure詳細設計](BEST_PRACTICE_BP5_R2_OL03_CLOSURE_DESIGN.md)の先行可能部分を実装した。
`native/r2-outer/src/closure.rs`の公開`check(bytes, binding, observed, started)`は、メモリ上のindex bytes・期待binding・
呼出し側の観測一覧を比較し、件数と合計サイズのsummaryだけを返す。観測一覧はOSから取得したと保証される型ではない。
期待bindingも呼出し側の入力であり、独立した署名/承認の証明ではない。将来のアダプターでOL-02の検査済みrecordから導出する必要がある。
任意の観測やbindingを渡しても実行権限には変換できない。`CheckedIndex`は公開の集計データで、偽造不能な許可型ではない。

filesystem・network・process・Node・PDI・OAuthへの接続は追加していない。
既存`runtime_gate`は必ず92を返し、`CheckedIndex`を受け取る経路も設けていない。実行permitは発行しない。
telemetry調査は保留のまま。

## 2. 契約と上限

| 項目 | 実装した検査 |
|---|---|
| JSON | UTF-8/BOMなし、全階層重複キー・未知キー・末尾データ・不正数値・過剰な深さを拒否。file/directoryの許可キーを分離 |
| 入力量 | index bytes最大16MiB、深さ16、配列/オブジェクトの構築中にも100,000要素の上限。byte数を確認してからJSONを展開 |
| binding | schema固定、release/generation一致、generationは1〜2^53−1、index生bytes SHA-256一致、相対index/Node path |
| path | 限定ASCII、最大4096 bytes/component255/depth64。絶対path/traversal/空component/不正文字を拒否し、正規化で救済しない |
| index集合 | byte昇順、重複/case衝突、自己index列挙、親欠落/file配下の子を拒否。Nodeと固定compiled entryを必須化 |
| 観測集合 | index自身を一度だけ含め、順序によらずpath/kind/mode/size/hashを完全一致。未知・欠落・重複を拒否 |
| mode | directory0555、Node0555、他file0444。特殊bitや任意実行fileの追加は不可 |
| 容量 | entries最大100,000、観測はindex自身込み最大100,001。index自身のbytesも含めsize合計最大2GiB、加算はoverflow確認付き |
| 禁止file候補 | Node以外の`.node/.dylib/.so/.dll`末尾（ASCII case無視）を拒否。bytesの形式や動的ロードの安全の証明にはしない |
| 時間 | 元の`Instant`を受け、JSON visitor・照合中・終了時に共通10秒を確認。期限切れ/future startは停止 |

byte sliceと観測一覧は既にメモリ上にある入力。安全なfile読込や読取前の確保量制御を実装したとはしない。
容量合計は観測値の照合であり、実fileを2GiB読み取った試験ではない。自己indexの除外はentries/hash循環回避だけで、
容量計上・観測集合・index raw hash比較からは除外しない。
既存strict JSON readerを拡張して共有し、OL-02の64KiB上限を維持した。
入力byte数/要素数はboundedだが、最大RSSの実測や固定allocator上限は今回の保証に含めない。
deadlineは協調的確認であり、scheduler停止・allocator/OS hangを10秒で強制終了する機構ではない。
将来のadapterは`started`を再作成せず、OL-02開始からの予算を伝播しなければならない。

## 3. TDDと回帰試験

架空のrelease/bytes/hashだけを使用。PDIのコードや実配備indexは利用していない。

- 最初の正常入力は固定拒否stubで失敗し、parser/照合実装後に成功（RED→GREEN）。
- compiled entryを省き観測一覧も同じにしたケースは修正前に受理された。固定entry必須化後に拒否（RED→GREEN）。
- 自己indexの大小文字別名は修正前に受理された。index pathもcase衝突集合に含めた後に拒否（RED→GREEN）。
- indexだけでnative addonを承認するケースは修正前に受理された。固定禁止suffix検査後に拒否（RED→GREEN）。
- 16MiBちょうど/1byte超、100,000件ちょうど/100,001件、index込み2GiBちょうど/1byte超を検証。
- 最大4096-byte path・深さ64を受理し、超過/256-byte component・重複・親不整合を拒否。
- duplicate/unknownキー、不正UTF-8/BOM/末尾、float/指数/負数/overflow generation、深さ超過、hash/世代/release不一致を拒否。
- 観測の余分/欠落/重複、type/mode/size/hashの相違、index自身の欠落/重複/size不一致を拒否。
- visitor自身のdeadline/container上限も個別確認。既存record検査・exec/PTY・起動gate92も回帰実行。

## 4. 実行結果

| コマンド | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 56件成功（既存30＋追加26、3 suites）。33 unit＋23 integration |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 成功 |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs` | 成功 |

実行時は全て`bdo`を付けた。新しい依存関係/Cargo.lock変更なし。
TypeScript/MCPの実装・登録は変更しておらず、TypeScript全体テストは今回再実行していない。

## 5. 未実装・承認待ち

実FDのsafe open/read、全祖先・owner/ACL/link/device/identity・xattr検査、実hash読取、途中差替え検出は未実装。
activation/ledgerのxattr検査も追加していない。署名/entitlement・動的依存審査・group全reader・更新排他・直前再検証も未完了。
schema/集合が一致しても、記載fileが安全なJSか、Nodeがそれ以外を読まないかは証明しない。
次のsafe観測adapterは別承認で進める。OS metadataのfakeを実配備検証の証拠にしない。
実Nodeや署名済み配備の適合、OL-03全体の完了、実PDI開始条件を満たしたとは報告しない。
