# BP-5 R-2 OL-03：同一round内のimmutable index宣言再利用・work事前受付

Version: draft-0.8 / Date: 2026-10-20 / Status: index上界・子phase接続とrecord opt-inモデルを内部実装し合成検証。全工程の事前受付・予約・運用承認は未実施。

## 1. 目的・現状・非対象

[接続設計§13](BEST_PRACTICE_BP5_R2_OL03_RECORD_PARSER_CLOSURE_DESIGN.md)の共有予算strict pipelineを前提とする。
初期pipelineは初回/M4前/M4後の各roundでdeclare→check→declareがそれぞれindexをparseし、計9回だった。§10の接続後は**indexのJSON decode/typed変換だけを1round1回、全3回へ削減**した。activation/ledger/registryはscan前後の計6回検証する。
scan前後の厳密なrecord/時刻/binding検証、全closure観測、宣言の意味検査・全集合比較は維持する。index側の課金work上界は§11で先行実装し、全工程のwork受付・R/scan等の上界は引き続き設計案である。

draft-0.1はMDだけだった。後続§9で先行部品を実装し、§10で内部pipelineへ接続した。telemetry調査は保留。実機/PDI操作、API実接続、token発行、設定変更、本番policy投入、実署名、permit発行は行わない。APPROVED_REGISTRY=None、通常v2入口Unavailable、gate92、DER/absence停止を維持する。
既存public check/declared、公開JSON/exit code、固定予算上限を変える提案ではない。実collector・保護された初回receipt/context・leaseの未接続も解消しない。

## 2. ソースに基づく分離点

| 現在の部品 | 残す検査 | 分離する処理 |
|---|---|---|
| [closure/shared.rs](../native/r2-outer/src/closure/shared.rs) | raw hash-first、strict JSON、header、全宣言検査 | parse済みIndexを保持するprivateなround専用型。現Declarationはentriesだけなのでそのまま流用しない |
| [closure.rs::check_entries](../native/r2-outer/src/closure.rs) | path/mode/hash/順序/case/親/必要entry、index自身と全集合比較、各step | parse済みのimmutable treeを借りる意味検査。初版はexpected/actual mapのcacheまで行わない |
| [strict.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict.rs) | scan前後のrecord strict検証・projection・clock・Node整合、固定3round | record検証とindex decodeを分け、scan後は同round宣言へ再結合する |
| [json/shared.rs](../native/r2-outer/src/json/shared.rs) | duplicate/unknown/trailing/UTF-8/depth/container、共有work/期限/取消 | 初回decode時のwork計測とshape統計。未認証raw bytesから統計を信用しない |
| [SharedBudget](../native/r2-outer/src/signature_boundary/positioned_read.rs) | 元start/10秒、sticky failure、暫定100万work、既存I/O等の別台帳 | 消費済みworkと残工程の予約を区別する内部台帳案。新startやcap拡大はしない |

これはリポジトリ内の現実装を照合した設計で、新しい外部仕様の調査記録ではない。

## 3. 再利用型と不変条件（全体設計案、先行実装は§9）

`RoundDeclaration<'session, 'round>`は次を所有/借用するprivate型とする。

- 検証済みIndex全体（header/entriesを含む）。全entryへのimmutable borrowだけを公開し、mutable getter/内部可変性/Clone/serde/public constructorを設けない。
- 元RecordReceiptの**同じimmutable index bytesへのborrow**、raw digest/byte長、全RecordBinding、registry/contextとBoundTargetの固定projection。
- session lineageと、pipelineがそのroundの開始時にだけ作る非Cloneのround token。Initial/BeforeM4/AfterM4のenum値だけでは同一性を認めない。
- work_model_idと検証済みshape統計。観測や実行authorityではなく、予算計算のための比較データに限る。

再利用は同じtoken・同じreceipt・同じ全binding/target/contextで、そのroundの固定順序にいる間だけ許可する。digest/byte長だけの一致、別Vecの同bytes、同path/世代だけの一致は不十分。
borrowとprivate producerにより元bytesの差替えを構造上できなくする。raw pointerの一致を信頼証拠の代わりにしない。差替えや結合不足を検出したらChanged/Bindingで停止し、新しい宣言へ自動parseし直すfallbackは設けない。

round終了/失敗/取消で宣言・一時map・観測を破棄する。次roundは元pinsに対して新しいtokenでhash-first decodeする。cross-round、別role、別呼出し、process/global cacheへの持越しは禁止。
予算の集計用shape/costだけは元immutable receiptへ結合してsession内で保持できるが、宣言tree/観測完了値の再利用権にはしない。
固定Debugはpending/not_execution_authorityとし、コード・path・hash・raw bytes・tokenを出力しない。

## 4. 固定順序と再検証の維持

| 順序 | 必須処理 | decode再利用との関係 |
|---|---|---|
| 1 | 3recordの全path/metadata/bytes exact再読、元clock pair/期限確認 | scan前の既存処理を省略しない |
| 2 | activation/ledger-0.2/registryのhash-first strict検証と全projection/Node整合 | 現在と同様に毎回実行。前roundの成功を使わない |
| 3 | index raw hash-first→strict decode→header/全宣言検査→round型生成 | このroundで唯一のJSON decode |
| 4 | 検証済み宣言に基づく**新しい**全closure scan | 宣言からobservedを生成しない。source各操作は元予算へ課金 |
| 5 | observationのsession/round/binding照合→index再認証→全宣言再検査→全集合比較 | 同じtreeをborrow。raw digestは再計算し、check_entries相当は省略しない |
| 6 | 3recordの全path/metadata/bytes exact再読と最新clock | scan中のrecord差替え・namespace変更を拒否 |
| 7 | activation/ledger/registryを改めてstrict検証し全projection/timeを確認 | 現在と同じ元開始wallと現在wallを用い、二重加算しない |
| 8 | 宣言token/receipt/contextの再結合→index再認証→header/全宣言・Node整合再検査→最新clock | 同じimmutable bytes/treeなのでdecodeだけ省略。意味検査やraw hashを省略しない |
| 9 | round宣言/観測/一時mapを解放→元checkpoint→次の固定phase | 失敗ならM4/次roundへ進まない |

index再認証は、直前の再読が一致した元immutable bytesに対して、同じpin digest・raw長・borrow・tokenを確認し、64KiB chunkのhashを同じbudgetで再計算する。decode済みtreeはそのbytesからしか生成されない。
scan後に新しく取得したbytesを「同じhashだから」と別のtreeへ付け替えない。元receiptとのexact比較を先に要求する。
新しい全集合scanは引き続き3回で、scan後にcache済みobservedを再利用したり、Nodeだけへ縮小したりしない。

全entry/親prefix/集合要素、hash chunk、再結合の前後でcheckpoint/workを行い、前後guardのみで巨大処理を無課金にしない。parseを減らしてもhard timeout/RSS・原子性/ABA・leaseを証明したことにはならない。

## 5. workモデルの変数と導出

以下は**課金単位のモデル**でありCPU時間の上界ではない。§11のindex部分だけを内部実装・合成検証し、全工程の運用受付には使わない。

| 記号 | 定義 |
|---|---|
| B / C | pin済みindexのraw byte長 / ceil(B / 65536) |
| F / D / N | index内file数 / directory数 / F+D。index自身はNに含めない |
| P | 全N pathとindex自身について、実際に親確認するprefix数の総和。平均深さで代用しない |
| M_max | 現行model-0.1は100,001（既存global上限）。将来のN+1早期guardは未実装 |
| J_index | 1回のaccepted index JSON decodeに課金されるwork |
| R_max | 同じpin bytes・固定registry・同じgroups/contextで1回のrecord三者検証が使うworkの上界 |
| W_scan / W_other | 全3scanのCPU work上界 / admission・target A/B・metadata/topology・cleanup等でwork計上する残工程の上界 |

### 5.1 accepted indexのdecode分

現在のstrict JSON coreとIndex/Entryのaccepted shapeから、短い固定key、fileの4文字列＋数値、directoryの3文字列について次を導く。
pathは最大4096 bytes、releaseは128 bytes等の既存制約下で、各decoded key/stringのtext課金は1 unitとなる。

```text
JSON nodes                  = 5 + 6F + 4D
object keys                 = 4 + 5F + 3D
string values               = 2 + 4F + 3D
container insertions        = object keys + N
input chunks + typed guard  = C + 1
J_index                     = C + 20 + 26F + 17D
```

keyごとの課金はKeySeed＋textの2、object挿入は別の1として数える。この式はaccepted schemaの**decodeのみ**で、raw hash/意味検査/Node検索・観測/registry等を含まない。
raw内の空白/escapeはB/Cへ反映する。未知field/巨大文字列/不正JSONはこのshape式の前提外なので、初期解析前の予約にこの式を当てはめない。常に既存byte/depth/container/work capで途中停止できることが必要。

### 5.2 同round再利用後のindex側上界案

初版は安全性を優先し、decodeだけを削減する。宣言検査を3回行い、全expected map/親検査も各回やり直す。Node検索もscan前後で全Nを走査する保守的な計画とする。

```text
宣言のみの意味検査 1回        = 2N + P + 2
全集合の意味検査 1回          = 3N + P + M_max + 3
scan前後のNode検索             = 2N
3回のraw hashのchunk課金       = 6C
shape収集の実消費              = N + P + 3
上界計算の実消費               = 8
model照合の実消費（再利用2回）  = 2
U_index_round                 = J_index + 6C + 9N + 3P + M_max + (N + P) + 128
M_max                         = 100001
```

固定枠128はraw hash開始/終了・header/結合・projection・最終step等を覆う上界で、実消費ではない。現行の課金点は既存index経路32＋shape固定3＋計算8＋再利用時model照合2＝**45 unit/round**。残り83は上界と実消費の差で、課金/予約/返却しない。shapeの可変費N+Pは128とは別に加える。
現行の100,001件guardを維持してM_max=100,001を計算する。N+1の早期拒否を実装していないのに、上界だけN+1に小さくしない。将来このguardを追加してmodelを変える際は、新しいwork_model_idと互換性/費目検証が必要。
collector自体の余剰検出/各operation課金や受信allocationは別途必要で、巨大Vecを返してからlenだけ確認すれば運用安全という意味ではない。

全3roundのindex枠は3×U_index_round。record側は6×R_maxを別途加える。R_maxは固定raw/contextとwork_model_idに結合した各ループ/stepの上界を導出し、初回の実課金deltaも照合する。平均時間や少数ベンチマークの最大値だけを上界としない。理由付き早期停止のprefixも上界を超えないことを確認する。

### 5.3 数値例（index分だけ、成功保証ではない）

架空のF=4,500、D=1,000、N=5,500、B=1,048,576、C=16、P=22,000、M_max=100,001なら、J_index=134,036、shape可変費=27,500、その他可変費=215,597、固定枠=128。U_index_round=377,261、3round=1,131,783 unitとなる。
この例はindex-only cap検査で既に100万を超える。draft-0.1の765,783はN+1上限を前提にし、収集費をまだ含まなかった数値で、現行modelには使わない。R/scan/その他を含む全体受付も未対応。
本プロジェクトの実閉包を測定した値ではない。深いpath、多数directory、rawの長い空白で変わり、5,000〜6,000件でも受付可能とは主張しない。

## 6. 段階的受付と共有予約

「parseする前にparse済みshapeがある」という循環を避け、次の2段階に分ける。

1. **bootstrap（scan/target解析前）**：元budgetのままpin長/hash/byte/depth等を確認し、初回roundのrecord strict検証とindexの唯一のdecode/全宣言検査を実施する。統計・上界計算の各要素走査もwork課金する。不正入力や枯渇はこの段階で停止する。ここで既に行った解析は無料でも別capでもない。
2. **scan開始受付**：accepted shapeと固定raw/contextから、全残round・scan前後record検証・scan/target/cleanupを含む残予定量をchecked算術で計算する。初回の実施済みpre-parseはそのまま初回RoundDeclarationとして使い、受付のためにさらにdecodeし直さない。未知のproducer/工程で上界を出せなければUnavailable、算術overflow/量超過はLimit。

```text
W_total_model = 3×U_index_round + 6×R_max + W_scan + W_other
W_remaining  = 未実施phaseごとの上界の和（実施済みphaseを二重加算しない）
受付条件      = W_used + W_reserved_existing + W_remaining <= 1,000,000
```

全体modelから単純に現在のW_usedを引かない。W_usedには別工程・途中失敗prefix・統計計算も含まれ得るため、privateな固定phase台帳で完了した費目だけを除外し、その他消費はW_used側へ残す。
受付処理/phase台帳検査自体のworkもW_otherへ含め、予約決定の最後にもう一度残量と元checkpointを確認する。

予約は非Clone/非serializeの内部RemainingWorkPlanに元budget/session/modelを結合する案とする。各work(n)は残予約をn減らし消費済みをn増やす。総和は増えず、事前予約を実消費へ**二重課金しない**。予約外消費や予定量超過はLimitで即停止する。
解放できるのは未使用予約だけで、消費済みworkを返却/リセットしない。roundごとに100万を作り直さず、追加role/scan/retryにも残予約を流用しない。失敗時の理由優先とcleanupは維持する。

workだけで受付成功にしない。元10秒/現在の残期限、実I/O2GiB（全再読/scan/A/B/EOF込み）、topology16384、metadata/name/EINTR、FD/管理allocation/解放予定量の各独立上界も必要で、別枠間の振替は禁止。
協調workが収まってもOS/serde/BTree/解放のhard実行時間やRSSは保証できない。未接続のcollectorがW_scanや実operation上界を出せない限り、実運用受付は有効化しない。

## 7. 失敗・解放と合成検証計画

型付きDeadline/Cancelled/Limit/ExpiredをBindingへ畳まず、元sticky failureを保持する。raw hash/構造不適合は既存の有限理由、binding/round/集合変更はChanged/Bindingとして固定し、文字列matchingを用いない。
再利用不能時の自動reparse・cache更新・部分集合成功・次round継続は行わない。全borrow/観測/map/予約を解放し、終了時checkpointを通す。leaseやpermitを発行しない。

| 合成試験群 | 必須確認 |
|---|---|
| parse回数 | 正常3roundでindex decodeが3回、record/registry検証が6回。raw hash/全宣言検査・scan/前後再読は維持 |
| binding/寿命 | 別receipt、同bytes別allocation、同digest別context、別round token/別session/role、round後利用の拒否。公開constructor/serde/Cloneなし |
| strict再検証 | unknown/duplicate/trailing/UTF-8、scan後record/namespace/metadata差、最新clock/期限・groups/policy/Node整合の検査が減らない |
| 全集合 | 非Node/indexのmissing/extra/duplicate/type/mode/hash差、parent/case/order、observed N+1境界・超過を拒否 |
| work式 | F/D混在、全path深さ/最大深さ、escaped JSON/空白/byte chunk境界、record/registry構成・groups境界。計測した全workが式以下、費目漏れなし |
| 予約 | 等号/1unit不足、checked add/mul overflow、bootstrapで枯渇、受付計算自体の費用、実施済み費目の二重加算/誤控除、予約外消費、解放でspentが戻らない |
| 失敗時停止 | 新しい全checkpoint/各phaseで期限/取消/既存理由、scan遅延成功、途中エラー、release後の最終guard。M4/次round/次roleへ進まない |
| 感度・互換 | 同round/byte結合や全集合比較、work予約の条件を1つずつ外すと該当試験が失敗。旧public decode-first契約・固定評価/既存506テストの意味を維持 |

## 8. 実装順と承認待ち

1. decode/意味検査のprivate分離と同round型・borrow/token結合を先行。既存のentry/parent/集合検査は共通coreのまま、公開関数の契約を変えない。
2. 1round内のdecode3→1と固定3roundへ接続し、scan前後のstrict検証が減らないことを合成検証する（§10で内部接続済み）。
3. work_model_id、shape統計、R_max/K_round/scan/その他の費目表を固定し、計数試験で上界を確認する。モデル不一致はUnavailableとし、capを黙って増やさない（§11でindex部分のみ実装）。
4. bootstrap後の残予約/単一消費台帳と受付停止を接続する。実sourceや実運用への接続は別途承認する。

round型の先行borrow/token実装は§9、index model/shape/固定費は§11に記録する。R_maxとcollector全操作のW_scan/W_other、管理allocation/FD/clock/leaseの上界・運用承認は未完了。本書の式や架空例だけでgateを解除しない。
draft-0.1の検査はMD/算術だけであり、§9の合成検証や実機検証と混同しない。

## 9. 同round型・decode/意味検査分離の先行実装

[先行実装の合成検証記録](E2E_BEST_PRACTICE_R2_OL03_ROUND_DECLARATION_SYNTHETIC_2026-10-20.md)を追加した。draft-0.2での範囲は§8の第1段階であり、その時点ではstrict pipelineの9→3 decode接続やwork予約を変更しなかった。後続の内部接続は§10へ別に記録する。

- `closure::shared::DecodedDeclaration`が元immutable bytesをborrowし、Index全体をprivateに保持する。raw認証→strict decode→header/全宣言検査で生成する。`recheck`はraw hash/headerを再検査し、同じcheck_entriesで全宣言/親/全集合を再検査するが、JSONをdecodeし直さない。元public経路や従来Declaration/checkの戻り値・課金順序は維持する。
- privateな`with_round`が元receipt/targetのbinding・pins/timeを確認し、fresh nonceのRoundScopeを作る。scopeのborrowを保持する`RoundDeclaration<'s,'r>`は非Clone/非serdeで、immutable entriesだけを公開する。callbackの任意戻り型Tへscope borrowを逃がさないシグネチャとし、roundのenum値だけで再利用を認めない。
- 再利用時にnonce、同じreceipt/target/context object、lineage、round、元SharedBudgetのprivate originを要求する。別allocationの同bytes/同binding・同enumの新nonce・新budgetで拒否する。object addressはsealed borrow/nonce結合の補助であり、利用者が指定するpointer/hashを承認証拠にしない。
- decode試行はscopeごとに一度だけ。scope内のCellは試行開始を消費するためだけに用い、宣言tree/bytesへ内部可変性を持たせない。失敗後も再試行/fallbackしない。decode/再利用の有限失敗を元budgetへラッチし、scopeをdropした後も最終checkpointを通す。
- pure DecodedDeclaration自体にはsession/roundのauthorityがない。将来pipelineへ接続する際はround wrapperと既存のrecord strict verifier/前後再読/clock/観測bindingを必須にする。今回のwith_roundはreceipt/pinsの比較部品で、activation/ledger/registry schemaの再検証を代行しない。
- private budget origin以外にstart/capやpayload/予約/topology等の台帳を変更しない。test-only thread-local counterで同scopeの再検査時にdecodeが増えないことを確認するが、cacheの運用性能やRSSの測定値にはしない。

work_model_id/shape統計・固定費128の証明・残予約、scope後の利用に関する独立compile-fail fixture、実sourceの真正性/leaseは未対応。scope lifetime制約とnested別roundの拒否を区別して記録する。APPROVED_REGISTRY=None・通常v2 Unavailable・gate92・DER/absenceの停止を維持する。

## 10. immutable宣言のstrict pipeline接続

[pipeline再利用の合成検証記録](E2E_BEST_PRACTICE_R2_OL03_ROUND_REUSE_PIPELINE_SYNTHETIC_2026-10-20.md)に、追加3件と既存停止/解放試験の再実行を記録する。

- strict verifierをrecord三者/全projection検証とNode entry整合へ分離した。各roundは前側exact再読/clock/record strict検証→with_round/decode→Node整合→scan→raw再認証/全宣言/全集合再検査→後側exact再読/clock/record strict検証→raw再認証/全宣言/Node再検査→最新clockの順。
- index decodeはroundごとに1回で全3回。record三者strict検証は6回、前後再読は6cycle、closure scanは3回を維持する。宣言やrecordの成功を別roundへ持ち越さない。
- request/observationへscopeのfresh nonceを内部結合し、lineage・全RecordBinding・roundのenumに加えてnonce一致を要求する。前roundのnonceや別nonceを、正しいenum/同じ内容で返されてもChangedで停止する。これは合成sourceとの契約で、実OS観測の真正性の証明ではない。
- 元budget origin/start・cap・first failure、I/O/予約/metadata/topology等をresetしない。scope終了時と全resource/pins解放後のguardを維持する。with_round内のreceipt検証も元budgetへcheckpointするが、全work費目/固定費の証明はまだ完了していない。
- 4,006 entryの架空fixtureでは新pipelineの現在の課金値471,312 workで成功し、旧9parse相当のindex-only手順は100万capでLimitとなった。固定fake clockでworkだけを比較した合成値であり、実閉包の受付可否/CPU時間/RSSの証明ではない。

§10の接続段階ではshape/model/費目上界も未実装だった。後続§11でindex部分を実装し、M_max=N+1早期guard、R_max/W_scan/W_other・全残工程の事前予約は未対応のまま残す。再利用接続の成功を事前受付や運用gate解除へ読み替えない。

## 11. index work_model_id・shape・上界の先行実装

[index modelの合成検証記録](E2E_BEST_PRACTICE_R2_OL03_INDEX_WORK_MODEL_SYNTHETIC_2026-10-20.md)とprivateな[work_model.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/work_model.rs)を追加した。

- 固定IDは`bp5-r2-index-work-0.1`のみ。係数表やIDを利用者設定から受け取らない。sealed profileのIDと期待IDを照合し、不一致/未知/空IDはtyped ModelMismatchから既存Unavailableへ接続する。default/旧モデルへfallbackしない。
- strict decode/全宣言検証が成功した同roundのimmutable treeから、B/F/D/Pを収集する。index自身のparent prefixもPへ含める。収集は元budgetでN+P+3、計算は8 unitを消費し、全roundでresetしない。未認証raw bytesへaccepted-shape式を適用しない。
- Bは1〜16MiB、Nは100,000以下、Pは63×(N+1)以下を防御的に確認する。checked add/mulでoverflowをtyped Limit(Overflow)とし、Shape/Cap超過のLimitと区別する。統計・上界は非Clone/非serdeのprofileに格納し、元RoundDeclarationのborrow/token/budget結合下で保持する。
- 各reuseでもmodel照合を行う。scope付きwork_summaryは比較用counts/unitsのcopyで、再度profileを作る入力/予約/authorityには使えない。summary取得とindex-only cap helperはそれぞれ追加3 unitを消費し、通常kernel上界の外のW_otherへ計上する。
- index-only cap helperは3round上界と指定availableの比較だけを行い、等号を許し1 unit不足/100万を超えるavailable指定をLimitで拒否する。現在のspent/残工程を引かず、予約を発行しない。このhelperの成功も全工程受付ではない。
- index kernel（decode/収集/計算、意味検査/Node検索、scope/model guard、record検証外のprojection4 step）の課金点を列挙し、実測した固定45が128以下であることを、F/D混在・depth64・16MiB・escape/chunk境界の合成値と照合した。checkpointだけの処理・OS/serde/文字列/BTree内部CPU・pin-memory hash等の全CPUを45で覆うという意味ではない。

N+1 guard・全R/scan/その他工程の上界/モデル整合、phase別の実施済み費目控除・残予約は未接続。profile構築費を含めてもindex decode3回/record検証6回/前後再読・元時間/cancel/first failure・運用gateを維持する。費目やcore課金点を変えたら、ID/式/計数試験を同時に更新し、未知modelを運用承認へ昇格しない。

## 12. 現行上界で実閉包を受け付けられない見通しと判断事項（2026-10-20、レビュー）

§11の上界式（observedに全体上限100,001を使用）では、§5.3の例（F=4,500、D=1,000、P=22,000、C=16）のindex分だけで
1round 377,261、3round **1,131,783 unit**となり、暫定cap 1,000,000を超える（検証記録の計算器試験とも一致）。
最大の要因はround毎の固定observed上限100,001で、3roundで約30万unitを占める。

§5.2のN+1早期拒否を実装した場合、同じ例はレビュー時の計算で1round 282,761、3round **848,283 unit**へ下がる見込み。
それでも残り約15万unitへ6回のrecord三者検証・3回の全closure scan・target A/B・metadata/topology・cleanup等を収める必要があり、
現実的な構成では不足する可能性が高い。いずれも架空shapeの計算値で、本プロジェクトの実閉包の測定ではない。

capを黙って広げない方針は維持する。このまま次工程へ進むと実受付は常にLimitとなる見通しのため、先に次を人が判断する。

1. **N+1早期拒否の実装**（必須に近い）：collector返却前のbounded余剰検出と、actual map挿入前の拒否。実装時はmodel ID・式・計数試験を更新する。
2. **保守的な意味検査の削減**：scan前後の全N Node検索、宣言のみ再検査など、安全性を落とさずに減らせる費目の再設計。各削減は感度試験で検出性を確認する。
3. **暫定cap 1,000,000の再承認**：実閉包のshape実測と全費目上界を根拠に、cap値自体を承認し直す。根拠なしの増額や一律marginは採らない。

判断と実装が済むまで、全工程の事前受付・予約は有効化せず、実運用経路はLimit/Unavailableで停止したままとする。

## 13. record・scanを含む全体work受付の詳細化

[全体work上界・事前受付設計draft-0.1](BEST_PRACTICE_BP5_R2_OL03_TOTAL_WORK_ADMISSION_DESIGN.md)へ、record JSON/意味検査の上界導出案、collector/otherの費目契約、子phase単位の実施済み控除、単一work予約と独立resource受付を分離して記載した。未確定費目を0にせず、record固定費・collector・index子phaseの計数検証と保護されたproducerが揃うまで受付を無効にする。MDだけの設計で、実装・上限変更・permit発行は行わない。

後続の[全体設計draft-0.2 §10](BEST_PRACTICE_BP5_R2_OL03_TOTAL_WORK_ADMISSION_DESIGN.md#10-recordモデルの先行実装内部opt-in)でrecordのopt-inモデルを先行実装した。JSON統計・groups最大1,024・固定kernel19・収集/計算固定12・追加guard1を合成計数した。通常strict pipeline/全体予約へは未接続で、indexモデル・元共有予算・運用停止は維持する。

## 14. index上界の子phase分解とscan直前境界

[phases.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/phases.rs)をsynthetic strict pipelineへ接続した。[合成検証記録](E2E_BEST_PRACTICE_R2_OL03_INDEX_CHILD_PHASE_SYNTHETIC_2026-10-20.md)を参照する。これはindex-onlyの費目分解で、全体受付・work予約・実collector接続ではない。

固定の子phase IDは `bp5-r2-index-phase-work-0.1`。元 `bp5-r2-index-work-0.1` のID・全体式・固定枠128・observed上限100,001は変更しない。N=F+D、C=ceil(B/65536)、P/Jは既存定義のまま、次の3枠へ分ける。

| 子phase | 上界 | 完了条件 |
|---|---|---|
| PreScan | J + 2C + 4N + 2P + 20 | with_round・hash-first decode・全宣言検査・shape/上界計算・実際のNode全件照合が成功 |
| AfterScan | 2C + 3N + P + 100001 + 11 | 同lineage/RecordBinding/round/tokenの観測に対しraw再認証・全宣言/親/全集合再検証が成功 |
| FinalIndex | 2C + 3N + P + 97 | 後側record strict検証の後、raw再認証・全宣言/親/Node照合が成功 |

3枠の和は厳密に既存U_index_round（J+6C+10N+4P+100001+128）へ一致する。初回scan直前は**2×U_index_round + AfterScan + FinalIndex**がindex残予定量で、PreScanだけを除外する。BeforeM4では将来1round、AfterM4では将来0roundとして、scopeの固定roundから決める。利用者が完了phaseやround数を指定しない。

現行実装の成功kernel固定費はPreScan20・AfterScan11・FinalIndex10、合計41である。旧§11の45は互換テストで加えていたrecord projection4を含む合成kernelの値だった。recordモデルがprojection2×2回を担当するため、子phaseではそれを再課金しない。旧固定128は縮めず、余り87をFinalIndexの未使用上界枠へ置く。87をspent・予約・返却へ変換しない。AfterScanの100001と実observed件数との差も同様に、上界と実消費の差である。

phase制御の新費用は元kernel枠の外へ別計上する。prepare時のscope/model照合2＋partition算術4＝6、AfterScan遷移1、FinalIndex遷移1で**8 work/round、3roundで24**。任意のremaining snapshotはscope/model照合2＋算術/終端2＝**4 work/呼出し**。全体設計のU_otherへ含める必要があり、今回予約を発行しない。完了済み費目を除外するときもこれらの実消費や他phaseのworkはspentに残す。

RoundDeclarationから一度だけ非Clone/非serdeのprivate planを作り、Ready→Compared→Finishedの一方向に進める。Readyは実Node照合後だけ発行する。二重prepare、逆順finish、二重compare/finishはBindingで停止。観測差はChanged、未知モデルはUnavailable、算術/予算上限はLimitへ接続し、元sticky failureを維持する。snapshotは単なる比較用scalarであり、受付/予約/完了証拠として入力し直す口はない。

同じreceipt/target/context/nonce/budget originとscope borrowを要求する。別budget・別round scopeでは拒否する。後側record再読・strict検証、3 decode・6 record検証・3新規scan、最新clock、解放後guardは維持する。FinalIndexだけを直接呼んでもrecord検証を済ませたことにはならず、private pipelineの固定順序を必須にする。

scan直前にはReady planが存在し、remainingを算出できるが、全体受付hookの有効化・record/scan/otherとの合算・予約は未対応。合成sourceの観測は実OSの完全性を証明しない。協調checkpointより後に発生した取消は検知保証の外で、hard停止・更新lease・実sourceの真正性は引き続き未確認である。
