# BP-5 R-2 OL-03 MA-02：実layoutの根拠・build固定・更新方針

Version: draft-0.1 / Date: 2026-10-24 / Source baseline: `b23c3ef` / Status: 設計案、方式・実layout・production build未承認

## 1. 範囲と停止条件

[MA-02親設計](BEST_PRACTICE_BP5_R2_OL03_MA02_MODULE_PROJECTION_DESIGN.md) §4・§8の未決事項を具体化する。対象はallocation APIへ渡す要求layoutの有限上界であり、allocator内部の丸め・arena・断片化・RSS・物理メモリの保証ではない。既存の4軸（試行数・累積要求bytes・peak live要求bytes・最大単発要求）と、heap以外のcoverageを分離する。

本書の識別子・証拠項目・審査手順は提案で、parser・issuer・registry・確保adapterを追加しない。5項目Unknown、全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable/gate92、DER/absence停止を維持する。本番cap投入・完成parts発行・通常strict差替え・OS接続・実機操作・token発行・設定変更・permit発行を行わない。

## 2. 今回確認した事実と未確認事項

| 対象 | 読み取りで確認した内容 | 証明しないもの |
|---|---|---|
| ローカルcompiler | `rustc -vV`: 1.98.1、commit `48a229ceaefd4985c50990b14116b6d856af0985`、host `aarch64-apple-darwin`、LLVM 22.1.8 | バイナリ真正性、実buildのtarget/flags、標準libraryとの対応 |
| Cargo設定 | [Cargo.toml](../native/r2-outer/Cargo.toml)はedition 2024、rust-version 1.98.1。[TOOLCHAIN.md](../native/r2-outer/TOOLCHAIN.md)はmutableなstable名と厳密pinの違いを明記 | rust-versionは完全一致指定ではない。Cargo.lockもcompiler/sysrootを固定しない |
| 標準library source | 観測sysroot配下の通常のrust-srcディレクトリは存在しなかった。インストールはしていない | 他の場所にも存在しないという全探索結果ではない |
| 公開公式API資料 | 本文を取得した現行std資料は1.99.1表示で、ローカル1.98.1と異なる。1.98.1の版付きVec URLは取得できなかった | 現行API資料を1.98.1の実装証拠へ昇格しない |
| 固定commit source | §3の公式rust-lang/rust固定commitのVec/RawVec/Rcページを取得した | 当該ソースからローカルsysrootが生成されたこと、配布物の真正性、全呼出し経路の監査完了 |
| 対象module | countsは空Vecへtry_reserve_exact(n)後にn個push。keysはgroup1＋nonce3のRc生成。inline mapは固定scalarを保持 | Vec容量・Rc制御block・親owner全体の要求layoutの認証 |

これらは開発時の観測で、production tupleや承認済み値として登録しない。全bodyの実装経路・allocatorまでの照合は未完了で、実layoutはUnmodeledのままとする。

## 3. 根拠台帳：公開保証と実装依存を分離する

確認日はいずれも2026-10-24、確認者はAI。人による原文照合・方式承認は未実施。動的な公式URLは参照の入口であり、将来の証拠包では取得本文のhashと表示版も保持する。下記は要約であり、数値layoutの承認ではない。

| ID | 公式根拠URL・該当箇所 | 確認内容・適用限界 |
|---|---|---|
| LAY-SRC-01 | [Vec: Guarantees / try_reserve_exact](https://doc.rust-lang.org/std/vec/struct.Vec.html#method.try_reserve_exact) | 予約成功後の容量は必要数以上。投機的な過剰予約はしないが、allocatorから余分な領域が返り得る。一般のgrow戦略は固定保証ではない。現行1.99.1のAPI説明であり、capacity実測から上界を決めない |
| LAY-SRC-02 | [Rust Reference: Type layout / Rust representation](https://doc.rust-lang.org/reference/type-layout.html#the-rust-representation) | repr(Rust)の詳細配置は固定ABIではない。同じ型名・Rust版文字列だけで内部offset/sizeを引き継がない |
| LAY-SRC-03 | [Layout: description / array / extend / pad_to_align](https://doc.rust-lang.org/std/alloc/struct.Layout.html) | 要求sizeとalignment、checkedな構築・合成の意味を確認する入口。Layoutのsizeと、alignmentへ丸めたモデル値を区別する。今回実layout値は算出しない |
| LAY-SRC-04 | [Cargo: rust-version](https://doc.rust-lang.org/cargo/reference/rust-version.html)、[cargo build: --locked / --offline](https://doc.rust-lang.org/cargo/commands/cargo-build.html#manifest-options) | rust-versionは対応下限。lockedはlock解決の維持、offlineはネットワーク禁止であり、sysroot真正性・再現可能buildの保証ではない |
| LAY-SRC-05 | [GlobalAlloc: Safety / allocation最適化の注意](https://doc.rust-lang.org/std/alloc/trait.GlobalAlloc.html#safety) | 最適化で確保が除去され得る。観測回数を全入力の証明にしない。recipeの保守的要求上界と観測値を区別する |
| LAY-SRC-06 | [固定commit Vec](https://github.com/rust-lang/rust/blob/48a229ceaefd4985c50990b14116b6d856af0985/library/alloc/src/vec/mod.rs)、[RawVec](https://github.com/rust-lang/rust/blob/48a229ceaefd4985c50990b14116b6d856af0985/library/alloc/src/raw_vec/mod.rs) | RawVecのtry_reserve_exact→grow_exactにはcheckedなlen＋additionalとfinish_growへの経路がある。以降のlayout形成・Global/allocator境界・cfg分岐も含めた固定build照合が必要。これだけでn×8を確保上界にしない |
| LAY-SRC-07 | [固定commit Rc](https://github.com/rust-lang/rust/blob/48a229ceaefd4985c50990b14116b6d856af0985/library/alloc/src/rc.rs)、[Rc::new API](https://doc.rust-lang.org/std/rc/struct.Rc.html#method.new) | Rc内部構造/確保関数の後続審査入口。payloadがunitでも管理領域の要求は別である。内部layout数値・OOM回収・全解放経路は未承認 |

## 4. 固定対象の証拠包案

文字列model IDだけで許可しない。固定の信頼元が承認した証拠包のdigestへ、以下を結合する。任意env・利用者入力・編集可能な自己申告ファイルをissuerの信頼元にしない。スキーマ・署名方式・保管先の実装は別工程。

| 束縛対象 | 保持・照合する候補情報 | 変更時の扱い |
|---|---|---|
| 対象source/build | source commit/tree hash、dirty差分不許可、Cargo.toml/lock/vendor closureのdigest、対象siteとrecipe版、build手順版 | 同じcommitでも入力差分があれば別証拠。旧版の自動継承禁止 |
| compiler/toolchain | rustc/cargo/LLVMの完全版・commit、認証済み配布物のdigestと由来、実行binaryのdigest、host | `stable`という名前・表示版一致のみでは拒否。自動download/updateしない |
| 標準library | 対象targetのcore/alloc/std等の使用artifact集合のdigest、対応するsource commit/treeとdistribution対応証拠、配布済みstdかbuild-stdか | rustc commit一致だけで生成物対応を推定しない。source欠落/対応不明はUnavailable |
| target/ABI | 明示target triple、target仕様・data layout、pointer幅/endian、型size/alignmentのbuild時検査根拠、OS/SDK/deployment targetとlinker版 | hostとtargetを混同しない。別archやABIは別承認。repr(Rust)の配置を対象build外へ輸出しない |
| build recipe | profile、opt-level/LTO/codegen-units/panic、features/cfg/target-cpu、compiler/linker flags、build script/proc-macro入力と成果物、許可env | 非明示の既定値も固定build手順に解決して記録。未申告override/追加入力は拒否 |
| allocator境界 | 使用するGlobal/system/custom allocatorの経路、要求量を数える境界、cfg、zero/grow/dealloc契約 | allocator内の実消費は本モデル外。別境界へ途中で単位変更しない |
| 最終成果物 | launcher/build成果物hashと対応するmodel/recipe/coverage/work版のdigest、既存配備closureとの対応 | 署名検査だけ、ソースhashだけを全証拠の代わりにしない |

将来のbuild時size/alignment検査は、信頼済み対象buildを裏付ける補助証拠に限る。実行後capacity観測・任意のprobe結果をruntimeで受け入れない。cross buildは対象側ABI検証方法を別承認するまで未対応。今回はdigest収集・署名・設定pin・build変更を行わない。

### 4.1 固定する量の意味

siteごとに`要求size/alignment`、モデルが計上するbytesの変換式、試行/成功/解放の区別と寿命を保持する。例えばalignmentへ丸めるなら、そのchecked式と理由を明記し、要求sizeと同一値とは呼ばない。Rcの親/子・制御blockやnestedな確保をpayloadに隠さない。allocator呼出しが最適化で減っても上界は観測値で減額せず、除去により失敗時動作まで異なる場合は別審査とする。

## 5. Vec countsの2案比較（選択未承認）

対象はprofile countsのu64・n=0..100000・空bufferから一度予約しn個初期化するrecipeだけ。他のVec/JSON/collectorへ一般化しない。

| 比較軸 | A：現行Vec/容量規則を固定buildからモデル化 | B：専用の固定要求確保adapterへ将来変更 |
|---|---|---|
| 製品変更 | countsの実装を維持。実stdの呼出し経路/cfgを照合する | countsの確保・初期化・所有/解放経路を置換する別実装が必要 |
| 根拠 | 空Vec→予約→RawVec→allocator要求layout、pushが追加growしない条件を固定sourceで証明 | 確保前にcheckedな配列layoutを決め、固定要求を一度だけ出す契約と実装を証明 |
| 数量 | nとsize/alignmentを同profile・承認layoutへ結合。n=0の非確保、n>0の試行数/bytesを別扱い | 同じnへの結合が必要。固定要求でもallocator実消費/RSSは未知 |
| 失敗/解放 | reserve失敗、初期化途中のwork/取消/期限、Dropまでの全prefixを検査 | null/overflow、部分初期化、panic、取消、同layoutでの一度だけの解放を新たに検査 |
| 安全性負担 | 非公開std実装と配布artifact対応の継続審査が大きい | unsafeを要する場合は初期化/alias/provenance/Dropの独立審査が必要。safe wrapperでも内部責務は消えない |
| 更新負担 | compiler/std/allocator/cfg/recipe変更ごとに再検証 | adapter/型/ABI/build変更ごとに再検証。std依存を減らせてもbuild証拠は不要にならない |
| 確保前強制 | 現在profile後のprojectionではB2を保護できない。BootstrapCapsとの別接続が必要 | adapter入口で事前検査できる設計にできるが、承認capの供給・強制・cleanup接続は別工程 |

Aの候補式は、固定実装でcapacity要求C(n)と要求layout L(n)を証明した後にのみ使う。単純なn×8を先取りせず、要素payloadと要求layoutは別に照合する。容量がn以上返るというAPI保証だけでは上界の証明にならない。

Bは`Vec::with_capacity`や`Box`へ名前を替えるだけでは成立しない。事前layout・fallibleな要求・初期化範囲・grow禁止・解放・allocator境界まで閉じたrecipeが必要。固定最大配列へ変更する案もstack/static/親ownerのcoverageへ移るだけで、無償ではない。今回adapterのAPI・使用allocator・unsafe採用は決めない。

**提案する次工程**：まずAの固定source/配布artifact対応と全要求経路が有限に証明可能かを読み取り審査し、その結果とBの変更責務を比較して人が選ぶ。対応証拠を確保できない場合はAをKnownにせずBの詳細設計へ進む。A採用・B採用・実装許可のいずれも今回付与しない。

## 6. Rc・inlineの扱いとprojectionへの接続条件

Vec案の選択だけで固定3費目を完了にしない。Rcは対象buildの制御領域を含む要求layout・4生成siteのprefix・clone/最後の所有者までの寿命を別に証明する。unit payloadや`size_of<Rc<()>>()`をblock要求bytesに代用しない。既存Rc::newのcatch不能OOMを型付きLimitへ変換できたとも扱わない。

inline mapのheap0は維持できても、親owner/固定領域/移動・重なり・carry-inのcoverageを別に残す。B2 countsとB3 keysの非重複だけで全体peakを小さくしない。

後続の専用issuerは、承認済みbuild証拠・layout model・coverageが一致したsiteだけを部分モデルへ結合する案とする。実ManagementProjectionは今の同estimate借用・元claim・receipt/budget/profile結合を維持する。layout ownerの借用/一度限りの消費・停止伝播・検査費を追加設計し、raw nや任意descriptorを渡して証拠を再構成しない。現行MA-02AのUnmodeledのみの型や模擬layoutから直接昇格させない。

## 7. 更新・失効・再検証の手順案

1. §4のいずれかの入力・成果物・recipe・coverage・work版が変わった時点で旧証拠を新buildに適用しない。互換patch版という理由で免除しない。変更不明・証拠欠落・真正性不明もUnavailableへ停止する。
2. 新tupleの証拠包を旧版とは別に作り、source差分とstd→allocator境界、型/ABI、成功/拒否prefix、寿命/4軸、検査workの差分を審査する。
3. 独立oracleで0/1/境界/超過・overflow・旧新混在・別owner・取消/期限・各失敗prefixを検査する。計測ログは補助資料に限り、有限域全体の上界証明を置換しない。
4. 同estimateへの結合・寿命compile-fail・一度限りclaim・先行理由保持も再確認する。新しい証拠検査/算術/破棄の費用を独立計数し、旧35/13へ無償で含めない。
5. 人の承認後だけ、新tupleの部分layoutモデルを発行可能にする将来設計。稼働中の証拠を差し替えず、新旧modelのparts/ownerを混ぜない。失効管理の信頼元・clock・既存session停止との接続は未設計で、現段階ではruntime発行しない。
6. rollbackは旧source/toolchain/artifact/modelの対応一式を復元して再照合する。新binaryに旧modelだけを戻さない。失敗した検証や未確認事項を記録から消さない。

これらの承認でも運用cap・全体受付・完成parts・実行permitは得られない。対象外module/5項目全体のUnknown解除には、別のcoverage/全体work/resource/PC-04検証が必要である。

## 8. 承認待ち・次に限定する範囲

- A/Bの選択、対象target/ABI、toolchain/std配布物と固定sourceの真正な対応方法。
- 要求layoutの計数境界・alignment算術、Rc/inline/nested/carry-inの費目所有。
- 証拠包の固定registry/署名・有効性/失効・更新排他とbuild対応検査の責任者。
- 独立oracle・有限域の証明と実装source照合の担当、全prefix/cleanup/最適化差の検証条件。
- Bを選ぶ場合の確保API・unsafe必要性・OOM/初期化/解放責務と、別途の実装許可。

次は上記の選択に必要な証拠の取得可能性・審査項目を絞る段階である。部分必要量を実4軸/完全性証拠へ変える実装はまだ行わない。
