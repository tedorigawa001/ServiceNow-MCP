# BP-5 R-2 OL-03 MA-02：固定module実確保モデル・保護必要量projection詳細設計

Version: draft-0.3 / Date: 2026-10-24 / Source baseline: `3927c4e` / Status: MA-02AとMA-02Bの同estimate部分projection/専用claimを合成実装。実layout・完全管理必要量・運用接続未対応、5項目Unknown

## 1. 範囲・参照した状態

[管理allocation複合契約draft-0.2](BEST_PRACTICE_BP5_R2_OL03_PC03_MANAGEMENT_BOOTSTRAP_CONTRACT.md)のMA-01は、入力された合成traceの4軸計算であり、実moduleの必要量・実確保量・cap承認を発行しない。MA-02では「実装上の確保箇所→固定recipe→同profile由来の数量→部分必要量」を設計する。既存計算器へraw traceを渡しただけでは保護された導出にならない。

基準`60f9268`にはMA-01のscratch初期化前のworst-case work残量事前検査が含まれる。既に消費した入口3 workを除いた上界を同じ元budgetへ照合するが、予約・layout認証・全体受付の証明ではない。今回はこの実装を変更しない。本書の新規型名/model/係数は案であり、現在のAPIの説明ではない。

§1〜§8の将来設計と§9〜§10のMA-02A/B実装を区別する。Unknown・全体受付無効・telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable/gate92、DER/absence停止を維持する。本番cap投入・完成parts発行・通常strict差替え・OS接続・実機操作・token発行・設定変更・permit発行を含めない。

## 2. 「実確保モデル」が証明する量と証明しない量

対象は固定build内の実moduleが発行し得る**allocation要求layoutの上界**と所有区間。実allocatorの使用量/RSS測定値ではない。4軸（試行数・累積要求bytes・peak live要求bytes・最大単発要求）を独立保持し、stack/static/inline/nested領域のcoverageを別に残す。

必要な証拠は次の3層で分離する。

| 層 | 内容 | 代替にならないもの |
|---|---|---|
| 実装recipe | 確保箇所・操作・成功/拒否prefix・grow/解放・寿命、対応source/build版 | ソース中の`Vec::new`等を数えただけの一覧 |
| layout証拠 | 各API要求layoutの有限上界、ABI/type/alignment、container容量戦略とnested coverage | `len × size_of`だけ、実行後capacity、同じRust version文字列だけ |
| 数量の由来 | 同immutable宣言/profile/estimateに既存検査で結合したn等 | raw summary、caller申告件数、MA-01の架空trace、別roundのprofile |

入力後に観測したcapacityやheap測定で、確保**前**の許可を出さない。将来の実強制が必要なら、layout/構造上限を確保前に検査できる固定adapterへ接続する別工程が必要である。モデルだけで現在の`Rc::new`のOOMを型付きLimitへ回収できるとはしない。

## 3. 固定moduleの棚卸しと初期coverage

テストfixture内のVec/Box/Rc確保は運用recipeへ混ぜない。最初の対象は小さな3費目に限定し、他を0/確認済みにしない。

| module/site | 実装上確認した処理 | MA-02の導出入力とモデル | 現時点の不足 |
|---|---|---|---|
| A-P/profile counts | [collect.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/collect.rs)：n検査→Vec::new→try_reserve_exact(n)→n個push、countsを返さない | 同profileのnormal entries n、u64要素、単一一時bufferというrecipe。n=0は確保なし | 要求capacity/layoutの上界とlibrary/build対応。`n×size_of<u64>`は要素payload計算で、実確保上界の証拠ではない |
| A-K/Draft logical keys | [slots.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session/resources/draft/slots.rs)：group1＋nonce3をRc::new、途中work失敗でprefix所有を破棄 | 固定4箇所。0〜4確保prefix、4個が重なる成功寿命、Rc cloneは新規blockなし | Rc要求layout/制御領域/alignmentの証拠、最後の参照寿命と実失敗/abandon契約 |
| A-F/map inline | [cap_map.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/projection/caps/allocation_view/cap_map.rs)：固定53 scalarを構造体内へ写す | map自体は新規heap blockを作らないrecipe。所有するDraftの固定領域へ一度帰属 | 親ownerの配置/移動とinline領域全体。heap部分0だけで管理量0とはしない |
| 他のA-F | budget/claim/session/結果owner、MA-02自身の状態/borrow | 初期coverage外 | 初期化前のcarry-in、Rc本体/参照・保持期間・解放 |
| A-J | record/index raw/JSON木・文字列/nested container | 初期coverage外 | 受理前の不正prefix、capacity/grow、解析内部一時領域 |
| 他のA-P/A-S/X-D | collector child/path/Observation、複数round、discard/終端診断 | 初期coverage外 | 全module・全寿命・全拒否/解放経路の上界 |

countsの必要量はprofile成功後にも導出できるが、そのcounts確保自体は既にB2で行われている。これは過去phaseのmodel上界の説明であり、実確保前受付や「使用量の返金」ではない。将来B2を保護するBootstrapCapsの事前強制を別に満たす。profileの成功形状から不正JSONや失敗したprofile buildの確保prefixを推定しない。

## 4. layout model registryの内部契約案

resource cap registryとは別の、固定buildに結合した`ModuleAllocationModel`群を想定する。初期model候補は`bp5-r2-module-allocation-0.1`、projectionは`bp5-r2-estimate-management-projection-0.1`。今回はID/registry/実値を追加しない。

descriptorに必要な項目：module/site識別・source/recipe版・対象toolchain/library/build/ABI・layout算術と有限域・aligned要求bytesの定義・nested/inline coverage・成功/失敗prefix・寿命/phase・最大要素数・対応するworkモデル版。descriptorを呼出し引数/env/任意ファイルから注入しない。同文字列IDだけでlibraryや実source変更を許さない。

固定registryを検査する専用issuerだけが`VerifiedModuleLayout`案を発行する。信頼済み配備/閉包/buildの由来を要求し、layoutが未立証ならUnavailable。現在そのissuerは存在せず、運用descriptorは未承認である。試験用のlayout fixtureは別のsynthetic型にし、実証拠と共通の昇格constructorを持たせない。

Vecへの対応は次のいずれかを、後続で証拠付き承認するまで未決とする。

1. 現行library/allocator境界の要求layout上界を実装ソースと容量規則から固定し、更新時にmodel再検証する。
2. 要求layoutが事前に決まる専用固定buffer/確保adapterへ将来変更する。ただし別途の実装許可・互換/失敗試験が必要で、今回の設計を根拠に置換しない。

実行後capacity検査だけでの代替、過剰確保を任意marginで吸収、Rc payloadを制御領域なしの0 byteへ換算する方式は採らない。対象ABIのlayoutが不明ならKnownへ進めない。

## 5. 保護projectionの型・借用・claim案

| 型案 | 発行元・所有 | authority境界 |
|---|---|---|
| ModuleAllocationProfile | 既存Initial profile buildと固定module recipeの狭い接続口。元inputs/scope/recipeへの実borrow | coverageと数量由来だけ。cap/実取得/全体管理量確認ではない |
| ManagementProjection | 同estimateへのborrowとprofile由来、module別4軸/Unknown、layout/recipe/費目版へのborrow | 部分必要量。完全管理証拠/DraftのVerified化/partsへ変換不可 |
| ManagementProjectionClaim | 元estimate/Initial系列に付く一度限りの独立claim案 | PC-02 resource_projectedやprofile_startedをreset/共用しない |

### 5.1 固定順序

1. 既存with_round(Initial)のhash-first/意味検査済み宣言から、既存profileを一度だけbuildしestimateへmoveする。追加decode・profile再build・新しいcount用N走査を作らない。
2. 元estimate側のmanagement専用claimを最初のfallible処理前に消費する。claim追加に伴う固定領域・停止伝播・Drop/forget・費用を同時に設計/検証し、今回コードへ先取りしない。
3. 既存[resource projection](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/projection.rs)と同様、profile.requireの同inputs/scope/origin/started/retry検査を再利用する。Initial/未開始状態、同元bridge owner・receipt/lineage/target/context、元deadline/共有枠を確認する。
4. 固定3費目のrecipe/coverageとlayout証拠を照合。同profileのnを専用module内で読み、checked算術で要求量を導出する。raw summaryのgetter→再入力の迂回口を設けない。
5. 一時scratchを持つなら公開前に解放し、元checkpoint後だけ部分projectionを返す。projectionは同estimate/実scopeとlayout ownerを借用し、scope外・別estimateへ持ち出せない。
6. 部分値のrequire/消費時も同じowner/claim/recipe/coverage/modelと現budget/状態を確認し、一度だけ消費する。失敗後の再発行/別budgetによる再準備を拒否する。

claimの正本は、値のmove/Dropで再発行できない元estimate/元budget系列に置く。値内部だけのboolやPhantomDataで元ownerへの結合を済ませない。元claimへ第一理由を伝播し、別budget提示では元と提示側の双方を停止する将来契約とする。MA-01のローカルAttempt（提示側だけを停止）は実証拠issuerの代わりに使わない。

既存resource projectionとmanagement projectionは同estimateを共有借用してよいが、どちらかを作るためにestimate/profileを複製・消費・再計算しない。必要な借用を閉じた後だけ元estimateを固定collectorへmoveする。receiptを値移動する現producerとのPC-04問題は未解決で、自己参照/unsafe/4回目decodeによる回避は禁止する。

### 5.2 部分coverageとUnknown

結果には固定siteごとの`Unmodeled`/`ModeledPartial`相当と、missing coverage集合をprivateに保持する案。statusをcallerが設定するAPIはない。layout証拠なしならそのsiteのbytes/peakをUnknownとし、allocation site数が既知であることと分ける。初期対象外のA-J等もUnknown。

部分projectionの発行は「実証拠へ昇格できない部分結果」を返すか、完全layoutを要求する入口でUnavailableを返すかを型で分ける。初期subsetでは前者だけを設計し、完全ManagementRequirement/CompleteRequirementEvidenceの成功型を追加しない。5項目Unknown・finalize拒否を維持する。

counts bufferとキーのpeakを足す前に、同一B2/B3系列で寿命が非重複であることを固定recipeが証明する必要がある。現在のcountsはprofileに格納されないが、親宣言/estimate/claim等のcarry-inは残る。3費目の非重複だけを理由に全体管理peakを小さくしない。後続2roundへInitialの宣言/木/profileを使い回さず、費目モデルの版だけを再利用する。

## 6. 収集・算術・検査費の所有

現行profileが既に保持するn等のscalarを使い、nを得るためだけの再走査を行わない。新しい統計が必要なら既存の課金済みpassにcounter更新を追加し、その更新分だけ追加課金する。既存passの費用を無料にしたり、同じpassをもう一度課金したりしない。

| 費目案 | 所有と課金単位 | 未対応/確認条件 |
|---|---|---|
| U_claim | 固定issuer。生成claim消費/停止伝播/公開claimを各固定rowとして数える | 状態数/固定費は実装と独立計数で固定する |
| U_guard | 既存profile.requireの5 workは呼出しごとにそのまま課金。新Initial/receipt/owner/model guardは別row | PC-02の18/45や旧40比較へ吸収しない |
| U_collect | 同passの新counter更新・固定receipt結合。新counterがなければ更新ループは追加しない | nだけの初期recipeに追加N passなし。新counter必要時はモデル改版 |
| U_layout | 検査するdescriptor record/field/式opcodeごとに課金し、検査数を有限上限へ結合 | digest比較1回で全layout検証を省略しない。検査証拠の再利用もclaim/owner guardが必要 |
| U_arithmetic | 固定3siteのchecked算術row・prefix/寿命集約・coverage照合 | MA-01の任意trace512上限を全module数の代用にしない |
| U_publish/use | 部分結果の公開checkpoint・一度限りrequire/消費 | 値を不変保持してもbinding/停止の再確認は必要 |
| U_discard | 部分値/一時領域/borrow/claimの破棄 | work失敗時も実resourceの解放を省略しない。実cleanup証拠は発行しない |

候補式は`U_MA02 = U_claim + U_guard + U_collect + U_layout + U_arithmetic + U_publish/use + U_discard`。layout可変費は`a×検査record数 + b×field数 + c×opcode数`のように実ループへ結ぶが、係数a/b/c・固定row数・上限の数値は今回認証しない。実装前に固定schema/容量/命令集合を選び、各成功/拒否prefixを独立計数してモデル版に固定する。未知係数を0にしない。

MA-01を合成oracleとして使う場合も、その計算器のrun費`133+4C+5E`は比較用の別実行費で、MA-02の係数の由来にしない。実projectionがMA-01 raw traceから証拠を再構築する経路は作らない。元work残量のread-only precheckを追加しても予約/中断/実強制の代替ではない。MA-02自身の固定stack・既存Rc clone・claim storageも別の管理coverageへ残し、無限に自己再帰して0へ落とさない。

## 7. 実装順と合成検証条件

1. **MA-02A：固定recipe/coverage内部型**。3費目の由来と未立証layoutを表し、模擬layoutから実証拠へ昇格しない純粋検査を合成試験。全体Unknownを維持する。
2. **MA-02B：同estimateへの部分projection**。**着手条件**：§4のVec方針（1：現行library/allocator境界の要求layout上界を実装ソースと容量規則から固定し更新時に再検証する／2：要求layoutが事前に決まる専用固定確保adapterへ変更する）のどちらを採るかを先にレビュー・承認する。未決のままMA-02Bへ進む場合、A-P/profile countsのsiteは`Unmodeled`（bytes/peakはUnknown）として扱い、暫定的に`n×size_of<u64>`を要求layoutとして使わない。A-K（Rc）も同様に制御領域を含むlayout証拠が承認されるまでUnknownのままとする。元claim・receipt/budget/profile結合と収集費を先に固定し、追加N走査/再parseなしを計数。layout未立証のsiteはUnknown、成功しても部分型だけ。
3. **後続：実layout証拠/確保前強制**。対象build/容量方針と前提issuerを承認し、固定moduleの失敗prefixを満たした範囲だけモデル化。全体coverage・PC-04/全体受付とは別工程。

独立テストに必要なもの：

- 非対称fixture n=0/1/境界/1超過とキー発行各prefix。literal/別アルゴリズムのoracleを使い、production layout/集約helperの再利用で期待値を作らない。
- 同nでも別receipt/estimate/profile/budget/started/scope/model/layout ownerを拒否する。profile成功前・後続round・開始済みsession/scan・元retry変更・二重発行/消費、Drop/forget後の再発行を拒否。
- payload bytesだけ既知でもlayout/capacity不明ならUnknown、inline heap0でも固定領域coverage不足なら未完了。偽のRc 0 byteモデル、nested欠落、旧版descriptor混在を拒否する。
- countsとキーの寿命非重複/親carry-in重複、最大拒否prefix、遅延成功/取消/期限/overflowを検査。観測した実deltaから上界を差し引かない。
- 新counter/descriptor/算術/guard/publication各境界を計数し、係数低下・追加N走査・未知項0埋め・同値owner交換の変異で試験が失敗する。
- borrow先をmove/scope外へ持出せないcompile-fail、非Clone/serde/固定opaque出力を確認。private名アクセスの失敗だけを寿命証明に数えない。
- 通常strict/OS/allocator実操作・production cap/parts/permitへ到達しないことを固定callerの不在と実行時counterで確認する。合成成功を実機性能/メモリ保証へ転用しない。

## 8. 未対応・承認待ち

実layoutの信頼元・toolchain/library/ABIの固定/更新規則、Vec容量方針（§4の1/2の選択。MA-02Bの着手条件、§7）/Rc内部layout、catch不能OOM、全module/不正入力prefix/nested/固定領域、B0〜B4/BXと3round全体、保護context/receipt producer・PC-04、claim格納/費用と停止伝播、layout schema/上限/係数、実cap/clock/失効・全体work/payload/resource強制は未対応である。

本書の調査はローカルソース/設計の読み取り照合。Rust標準libraryの非公開layoutを公式に保証された値として採用したものでも、実allocator/実機検証を実施したものでもない。5項目Unknown・全体受付無効を維持し、完成partsの発行条件を緩めない。

## 9. MA-02A実装：固定recipe/coverageの非実行整合検査

[recipes.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session/resources/management/recipes.rs)をMA-01配下のprivate moduleとして追加した。modelは`bp5-r2-module-recipe-review-0.1`で、§4の実layout model/projection IDとは異なる。固定3費目の内部descriptorを照合するだけであり、実source/build真正性・実layout/必要量を認証しない。sourceラベル一致を署名/閉包の証拠と呼ばない。

### 9.1 型と固定coverage

Recipeはsite/revision/source、Storage、Phase、Lifetime、allocation prefix、LayoutKnowledgeを保持する。StorageはCountsのnormal entries最大100000/u64、Keysのgroup1/nonce3、InlineMapのsession-round32/local21 scalar。prefixはCounts0〜1・Keys0〜4・Map0〜0。Countsの実nや必要bytesは入力せず、MA-02Bへ残す。

Catalogはimmutableな3descriptorのsliceを保持する。固定順Counts→Keys→InlineMap、各revision/source/storage/phase/lifetime/prefixを照合し、欠落/余剰/重複/入替え/不一致を拒否する。全recipe maskは0b111だけを受け付けるが、実layout maskは0、whole-management claimはfalse以外を拒否する。これはsource統計の既知範囲を誇張しないための入力整合検査で、maskが発行権ではない。

LayoutKnowledgeはUnmodeledだけでVerified/Real/Synthetic-success variantはない。結果`ModuleRecipeReview`はCatalogへの実borrow、Unmodeled3件と固定missing8件（CountsLayout/KeysLayout/InlineParent/ControlOwners/ParserNested/Collector/Discard/WholeLifetime）を保持する。inline mapのheap確保数が0でも親固定領域の未対応を消さない。`require_complete`は1 work後に必ずUnavailable、成功型Infallibleである。数値4軸・ManagementRequirement・CompleteRequirementEvidence・partsへの変換口はない。

結果は非Clone/Copy/serde、Debugは固定opaque。Catalog借用はimmutable入力を保持するが、receipt/budget/profileを証明するborrowではない。呼出しは再実行可能な純粋整合検査で、元budgetのwork以外の台帳/claimを開始しない。同Catalogを別budgetで検査できることを、MA-02Bの結合成功と扱わない。

### 9.2 有限費用・失敗

検査はmodel1・exact件数1・coverage claim1、各descriptor固定6 row×3、missing coverage1・publication1、計23 work。入口3の後、同budgetの残work20をread-only事前検査する。予約/枠付与は行わない。各rowには固定数の比較だけを含め、N依存の走査・追加decode/profile収集・heap確保・汎用parser/式opcodeを導入しない。

scratchは固定3descriptorと固定結果だけ。対象buildでdescriptor配列1024 bytes以下・結果128 bytes以下をテストするが、関数全体stack/RSSを保証するものではない。起点費3の後にwork不足ならdescriptorを走査せずLimitで停止する。元work/checkpointのDeadline/Cancelled・先行理由を保持する。

model/coverage不足・real/whole claimはUnavailable、descriptor identity/内容/順序違いはBinding。構造はexact3のみで、長さ不一致はUnavailable。実消費workは返さず、純粋検査の失敗も提示budgetへlatchする。未取得resourceを解放済みとする処理はない。

### 9.3 模擬layoutの隔離

`cfg(test)` module内だけにMockLayout/MockCheckと有限layout算術の試験関数を置く。架空payload/overhead/alignmentとcapacity/nested/ownerの模擬条件を検査し、Rc overhead0・未知coverage・overflow等を拒否するが、MockCheckはruntimeのRecipe/Catalog/LayoutKnowledge/結果へ変換できない。模擬成功後も実layout3件はUnmodeled、missing8件・完全性拒否は不変である。

模擬fixtureのbytes・ABI相当条件はRust Vec/Rcの実layout値ではない。模擬関数は本番buildに存在せず、実registry/issuerも作っていない。MA-02Aには保護projection・専用one-shot claim・実moduleの数量導出は含めず、§5〜§7のMA-02B以降で別途対応する。

[MA-02A合成検証記録](E2E_BEST_PRACTICE_R2_OL03_MA02A_RECIPE_SYNTHETIC_2026-10-24.md)を参照。固定catalogの整合性とUnknown維持を確認する試験で、layout/全体coverage/運用capの検証ではない。

## 10. MA-02B：同estimateの部分projection・budget-owned claim

[management_projection.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/management_projection.rs)に`ManagementProjection`を追加した。modelは`bp5-r2-estimate-management-projection-0.1`。同ScanWorkEstimateを実borrowしてそのprofile/scope/receipt系列を維持し、layout不明のまま既知の部分形状だけを返す。通常strict/運用producer/collector dispatchには接続していない。

### 10.1 専用claimと停止伝播

[management_claim.rs](../native/r2-outer/src/signature_boundary/positioned_read/management_claim.rs)の状態を元ProtectedBridgeClaim内へ置く。Fresh→Started→Issued→Consuming→Consumed、任意失敗でStopped(first_reason)。生成/消費は最初のfallible work前に試行を消費し、begin入口が許す組はFresh→StartedとIssued→Consumingだけ。Stoppedを一時的にも上書きせず、reset/retry口を作らない。

claimは値内部/estimateごとのboolではなく元budgetの正本に一つ。同budgetの別estimate・Drop/forget後・消費後も再生成できない。既存resource_projected、profile_started、session/bridge生成claimは共用/resetしない。resource projectionとの同時borrow・どちらを先に生成する順序も合成確認した。両borrowを閉じた後に元estimateをmoveできる。

SharedBudget::stopはmanagement claimが非Freshなら同claimにも第一理由を保存する。他evidence/session未開始でも外部Deadline/Cancelled/HashMismatch等が元ownerへ見える。失敗合流は既存resource projectionと共通のstop_ownerを使い、別budget提示時には元ownerと提示budget双方を停止する。元allocation側のStopped記録は共通の失敗latchとしてのみ使い、成功時にはallocation/parts/sessionを開始しない。

### 10.2 部分量とrecipeの保持

MA-02Aの固定recipe検査23 workを実施し、追加1 workで`RecipeFacts`を所有値へ写す。同関数内のCatalog borrowを自己参照として持ち出さない。factsにはUnmodeled3件とmissing8件を保持し、模擬layoutのcfg(test)型との変換はない。facts再照合は固定1 work（3+8件の固定比較）で、実layout/buildを認証しない。

同estimateのprofileからnormal entries nを読み、n<=100000の範囲でchecked `n×8`を**u64要素payload**として計算する。これはVecの要求capacity/allocator上界ではない。既知のキー確保site数4・inline scalar数53も保持するが、確保成功回数・Rc bytes・親owner/全体管理量には読み替えない。実4軸/ManagementRequirement/完全性証拠は返さず、全5項目Unknown・finalize拒否は不変。

再decode・profile再収集・N件走査・新しいheap確保はない。固定facts/shapeはinline保持で、元ownerの既存Rcを利用する。追加claimの固定領域と保持量は将来の全体管理coverageへ残す。対象buildで既存ProtectedBridgeClaimの64 bytes以下の境界試験も維持したが、RSS/全メモリ保証ではない。

### 10.3 binding・費目・消費

既存require_estimateの6 workを再利用する。内訳はprofile.require5（同inputs/scope/origin/started/retry）、calculator/kernel model・Initial/未開始・同bridge owner1。profile/ScanInputsの既存guardが同receipt/lineage/target/context/元round tokenへ結合する。さらに消費時は元estimateのptr同一性とmodel・専用claimのConsumingを確認し、同値の別estimateでは代替できない。

| 経路 | 実計数work |
|---|---:|
| 生成 | 35 = claim1＋既存guard6＋recipe facts24＋固定shape3＋publication1 |
| 消費 | 13 = claim1＋既存guard6＋estimate/model/state1＋facts1＋shape3＋publication1 |

消費はprojectionを値で受け取り、成功しても`()`だけを返す。部分検査の消費済みという意味で、証拠/parts/cleanup/permitではない。budget claimにより、テストで同じ値の偽wrapperを作っても二重消費を拒否する。shape/revision/元receipt/profile/budget不一致、model不明、retry変更、開始済み/後続round、期限/取消/先行停止は元のBinding/Unavailable/Changed/Deadline/Cancelled等で停止する。

新固定費35/13を旧18/45や全体上界へ単純加算して受付を承認しない。既存MA-02A検査のread-only残量precheckは維持するが、MA-02B全体のwork予約/独立resource受付は追加していない。途中失敗は元budgetへlatchし、実resource/cleanup証拠は所有/発行しない。

[MA-02B合成検証記録](E2E_BEST_PRACTICE_R2_OL03_MA02B_PROJECTION_SYNTHETIC_2026-10-24.md)を参照。実layout/完全coverage/承認cap・PC-04の安定owner/Initial継続・実producer接続は未対応。compile-failによる寿命境界の独立検証も未実施で、非Clone/serde試験や借用を閉じた後のmove成功と区別する。
