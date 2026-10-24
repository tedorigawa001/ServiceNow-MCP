# BP-5 R-2 OL-03 MA-02 A案：Vec固定source・標準library配布artifact対応調査

Version: draft-0.1 / Date: 2026-10-24 / Source baseline: `a717fb8` / Status: 読み取り調査、条件付きsource導出のみ。artifact真正性・本番対応・方式承認は未完了

## 1. 結論と範囲

[実layout根拠・更新方針](BEST_PRACTICE_BP5_R2_OL03_MA02_LAYOUT_EVIDENCE_DESIGN.md)のA案を調査した。固定commitのVec/RawVec/alloc本文と、既存rust-docsのソース表示を復号した本文は3件ともバイト一致した。ローカル配布manifestの対象版・URL・hashも、公式の版付きmanifestの対応キーと一致した。

ただし、rust-docsの一致はrust-stdバイナリの生成元証明ではない。公式アーカイブとインストール済みartifactの内容照合・署名/信頼元審査・対象buildへの結合が不足している。**A案の条件付き要求layoutはsource上で導出できるが、ローカルartifact/本番buildで証明済みとはしない。** 実装のUnmodeled・5項目Unknownは変更しない。

全体受付無効・telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable/gate92、DER/absence停止を維持する。実装・本番cap投入・完成parts発行・通常strict差替え・OS接続・実機操作・token発行・設定変更・permit発行は行わない。toolchainの追加/更新、archiveの保存/展開、build/probeの実行も行っていない。

## 2. 調査方法と信頼の境界

確認者はAI、人による原文再照合・承認は未実施。既存ファイルの読取/hash、rustcの版表示、公式HTTPSの固定URL取得だけを使用した。以下の`$SYSROOT`は、今回観測した`stable-aarch64-apple-darwin`のtoolchain rootを表す略記であり、固定した信頼済みパスではない。

- compiler表示：1.98.1 / commit `48a229ceaefd4985c50990b14116b6d856af0985` / host aarch64-apple-darwin / LLVM 22.1.8。
- `lib/rustlib/multirust-config.toml`ではrustc/rust-std/rust-docs等を登録。rust-srcは登録されておらず、通常のrust-srcディレクトリもなかった。
- 一方、`share/doc/rust/html/src/alloc/`にソース表示が存在。`version_info.html`は1.98.1と同commitを表示していた。rust-srcとrust-docsは別componentである（[rustup公式 Components](https://rust-lang.github.io/rustup/concepts/components.html)のrust-std/rust-docs/rust-src項）。
- local HTMLのcode blockからtag/表示用行番号を除去し、標準HTML実体を復号した。固定commit raw本文は各2MB以下・接続10秒/読取15秒でメモリ内取得し、SHA-256とバイト列を比較した。ソース本文をrepoへコピーしていない。
- これは読み取り時の観測で、secure opener/保持FD/metadata再照合を使った製品証拠ではない。途中差替え耐性・現在のtoolchainの真正性を認証しない。

最初のsandbox内HTTPSはDNS解決で失敗し、許可された読み取り取得で再実行した。初回比較ではUTF-8/バイナリ文字列のencoding差により、同hashでも2件のString比較がfalseになった。両辺をバイナリ化した再比較では3件ともtrue。比較失敗を証拠の一致に読み替えず、この補正と再実行を記録する。

## 3. 固定sourceの対応証拠

公式rust-lang/rustのcommitを固定する。リンクの行番号は直接取得した本文とローカル復号本文で一致したもの。Webの抽出表示は空行を省略する場合があるため、その表示行数をsource行番号として使わない。

| source（公式URL） | bytes / lines | raw本文とlocal復号本文に共通のSHA-256 | byte一致 |
|---|---|---|---|
| [vec/mod.rs](https://github.com/rust-lang/rust/blob/48a229ceaefd4985c50990b14116b6d856af0985/library/alloc/src/vec/mod.rs) | 168574 / 4564 | `09171c3c4c767a5c0716a85786f7670e5e149f75325fc1b27f5dbce14f16711f` | true |
| [raw_vec/mod.rs](https://github.com/rust-lang/rust/blob/48a229ceaefd4985c50990b14116b6d856af0985/library/alloc/src/raw_vec/mod.rs) | 35551 / 906 | `a262b9e494236a00270be0dd0c57be5259d62bc1e538c56506f7f0ce8debccc0` | true |
| [alloc.rs](https://github.com/rust-lang/rust/blob/48a229ceaefd4985c50990b14116b6d856af0985/library/alloc/src/alloc.rs) | 22366 / 578 | `699c02fe7844cd9490905545e503fec56552be2a34d50a79242852739483889b` | true |

この一致が結ぶのは「HTTPS取得した固定source本文↔ローカルdocsの表示本文」だけ。docs HTML全体・配布archive・rlib/rmetaのhashと同じものではない。次の呼出し経路はこの本文の静的照合であり、任意のRust版のAPI保証ではない。

### 3.1 countsから要求境界まで

対象は[profile/collect.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/collect.rs)の`counts`のみ。n<=100000等の入口検査後、空のVec<u64>へ一度try_reserve_exact(n)、n回pushする。返却するのは形状/scalarで、countsの所有権は持ち出さない。

| 段階 | 固定sourceの該当位置 | 読み取れること |
|---|---|---|
| 空Vec | Vec::new L461–463、RawVecInner::new_in L573–576 | len/capが0の未確保状態 |
| 予約伝播 | Vec::try_reserve_exact L1578–1580、RawVec wrapper L378–385 | lenとadditional、Tのlayoutを内部へ渡す |
| grow判定 | RawVecInner::try_reserve_exact L720–737、needs_to_grow L767–769 | n=0ではgrow不要。n>0ではgrow_exactへ |
| capacity要求 | grow_exact L786–805 | checkedなlen＋additional、ここでは0＋n。投機的growの式を通らない |
| layout要求 | finish_grow L544–568、layout_array L900–906 | 要素layoutの反復でnew_layoutを作る。空bufferなのでgrowでなくallocateの分岐 |
| 保存/追加 | set_ptr_and_cap L773–779、Vec::push/push_mut L1001–1047 | 保存capacityはn。各push前lenはn未満なので、このn回では追加growしない |
| runtime要求 | Global::allocate L448–450、alloc_impl_runtime L205–214、alloc L95–102 | 非zero要求はallocへ渡し、size/alignmentを__rust_allocへ伝える。ここを要求量の境界とする |
| 終端 | Vec Drop L4293–4306、RawVec Drop L423–426、deallocate L876–880、current_memory L634–647 | 通常Dropで要素とbufferを処理し、保存capacity/要素layoutから解放layoutを作る |

本調査の境界は`__rust_alloc`へ渡す要求size/alignmentまで。default/custom allocatorの内部、malloc等の丸め・OS確保・compilerが選ぶ最終allocator shim・実行binaryの全cfgまでは確認していない。u64初期化/Drop自身にnested heap確保はないが、work/checkpoint等の周辺処理の管理量をこのsiteへ含めて証明したわけではない。

### 3.2 source条件付きの上界

前提：上記sourceが対象buildに使用され、runtimeのGlobal経路、非ZSTのu64、同じ空Vecに予約1回＋最大n回pushのみ、対象型layoutとcheckedな反復layoutの意味が維持されていること。

- n=0：このbufferの要求試行0、要求bytes0。
- 1<=n<=100000：要求試行は高々1。要求layoutは要素u64の配列layoutで、sizeは8n bytes、alignmentは対象buildの`align_of::<u64>()`。今回alignmentの数値を固定/認証しない。
- したがって、このsite単独の累積要求・peak live要求・最大単発要求は各8n以下、最大800000 bytesという**条件付き上界**になる。allocator失敗でも試行の要求量は数え、成功して保持した量/実物理量と混同しない。nを検査する前/後の拒否は到達prefixに応じ0または高々1である。
- reserve後のwork/期限/取消/検査失敗でも、通常のResultによる巻き戻りではVecのDropに帰属する。abort/強制停止/allocator異常時に解放済み証拠が出るとはしない。

8nが既存MA-02Bの要素payload式と数値上同じでも根拠は別である。現行部分projectionのprivate値からlayout証拠を作らず、layout算術のcore実装・target ABI・build/artifact対応と専用issuerの別審査を必要とする。最適化で要求が除去されても、実測値から上界を減額しない。周辺owner・Rc・inline親・他module・3round全体の上界は未証明。

## 4. 配布metadataの対応と限界

公式の[版付きmanifest](https://static.rust-lang.org/dist/2026-09-03/channel-rust-1.98.1.toml)と[同checksum](https://static.rust-lang.org/dist/2026-09-03/channel-rust-1.98.1.toml.sha256)をHTTPSでメモリ内取得した。manifestは898637 bytes、SHA-256は`a7c8774a5fd8441c997d94c029776cbc5eb111e9d72ab5d256fa69866644347e`で、checksum本文と一致。

ローカル`lib/rustlib/multirust-channel-manifest.toml`はSHA-256 `e44f4ea0a633aa3e497e4dd161424419fbd7bdc203606ef840634fdd22dab9bf`。**manifest全体・section本文はバイト一致しない。** rustup保存時の形式/追加項目を含む全差分の原因は未調査で、改ざんとも意味全体の一致とも判定しない。

限定したキー比較では、date=2026-09-03、pkg.rust-stdのversion、同target/ rustc target/ rust-docs targetのavailable・url・hash・xz_url・xz_hashがそれぞれ一致した。rustc/std版表示は1.98.1と同commit。これは対象配布情報の整合確認で、manifest全体の正規化一致ではない。

rust-std/aarch64-apple-darwinの一致値：

| 配布候補 | manifestのSHA-256（ローカル/公式キー一致） |
|---|---|
| [tar.gz](https://static.rust-lang.org/dist/2026-09-03/rust-std-1.98.1-aarch64-apple-darwin.tar.gz) | `840484e8f9c2a8ed024b706262a1257bb07d9617670a1fc90020536282950690` |
| [tar.xz](https://static.rust-lang.org/dist/2026-09-03/rust-std-1.98.1-aarch64-apple-darwin.tar.xz) | `2de831ef563ce772519a4d18ba2659f0f7428d497ef66dad24b5a35e8f8cd177` |

archive自体は取得しておらず、この表はarchiveの実hash照合結果ではない。HTTPSでmanifestとchecksumが一致しても、独立した署名・承認済みtrust rootの検証ではない。

### 4.1 インストール済みartifactの観測fingerprint

`lib/rustlib/manifest-rust-std-aarch64-apple-darwin`は相対file一覧で、ファイルごとの期待hashを含まない。同manifestのSHA-256は`9686ab9799f1eaa7e526c5b32f800696632dfaef604daf733b417d4df76177bf`。listed artifactの代表として以下をread-only hash化した。

| `$SYSROOT/lib/rustlib/aarch64-apple-darwin/lib/`配下 | bytes | 観測SHA-256（承認値ではない） |
|---|---|---|
| liballoc-3daa19367295a846.rlib | 805880 | `6f4509e01156444621aed1b68b5ff48c95e5607c694a2f41f0253caccbb450d3` |
| liballoc-3daa19367295a846.rmeta | 7499644 | `8c36b7f501cb55078181697917daf4cad47663ee0509e75a3ac9fdbb34d65f77` |
| libcore-4a1205c3dacb37e1.rlib | 2568512 | `66fcb84e1d046f173000db089827bb03eea75609b632b6fe8f877302596852c9` |
| libcore-4a1205c3dacb37e1.rmeta | 64170497 | `8f8068fd0c96959596351cc2528cac5414347150e123db33421cd1afe047706a` |
| libstd-3f21d70fba8f3088.rlib | 9765560 | `52a9e34583f133cfd144e046de74d9447840fb15a01773cbe47aff2bdbc78c36` |
| libstd-3f21d70fba8f3088.rmeta | 8361014 | `75f2db5ad4d3ff74fc261e1d2e26faebbaa63b0adb01b1ce57185119f987026f` |

これらは既存fileの指紋にすぎず、archive内memberや署名済み期待値とは未照合。全sysroot/compiler/linker/artifact閉包も網羅していない。Vecはgenericコードを含むためliballoc.rlib単体の一致だけで最終要求経路を証明せず、rmeta・monomorphizationに使用するcompiler/flagsと最終binaryの対応が必要。

`$HOME/.rustup/downloads`は今回の一覧では空だった。元archiveをローカルから比較できず、署名検証・build attestation・再現buildは実施していない。新規download保存/展開やrust-src追加は本作業に含めない。

## 5. 証明段階と不足する証拠

| 段階 | 判定 | 不足・次の確認 |
|---|---|---|
| 固定sourceの要求経路 | 条件付きで導出可能 | targetの型layout/core算術実装・全cfg前提の審査。source数値をruntimeへ投入しない |
| source↔rust-docs表示 | 3本文でbyte一致 | docs配布物の信頼・取得履歴は未認証 |
| 公式配布metadata↔local metadata | 対象キー一致 | 全manifest差分の説明、独立した真正性検証 |
| 公式archive↔installed rlib/rmeta | 未確認 | 認証済みarchiveとmembers、改変/欠落/余剰、compiler/std配布対応を安全な手順で照合 |
| installed toolchain↔対象build | 未確認 | 明示target・features/cfg・flags・allocator shim・SDK/linker・入力/成果物digest、信頼済みbuild由来 |
| 実layout証拠↔保護projection | 未実装/未承認 | 専用issuer・同estimate/layout owner・更新失効・課金/停止・独立検証 |
| 全管理必要量・事前強制 | 未証明 | B2前bootstrap、Rc/inline/nested/全phase/拒否prefix、PC-04、cap/全体work/resource |

最優先は、archive/manifestの真正性をどのtrust rootで承認し、installed membersとの対応をどう確認するかの手順設計である。今回の自己観測hashをそのまま期待値registryに登録しない。A案はまだ採用承認しないが、source経路だけを理由に不可能とも結論しない。配布/build対応を証明できなければUnmodeledを維持し、B案の詳細設計と比較する。

## 6. 文書検証と非実施事項

新規調査記録と親2文書のみ更新する。相対リンク/末尾空白・git diff checkで文書整合を確認し、runtimeのbuild/testは実施しない。合成試験・実機E2E・allocator計測・ABI probeの成功記録として扱わない。全停止条件は§1のとおりである。
