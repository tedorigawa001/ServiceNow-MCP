# BP-5 R-2 OL-03：scan work上界・bounded collector詳細設計

Version: draft-0.3 / Date: 2026-10-20 / Status: 純粋な計算器と単発操作境界を内部実装・合成検証。完全collector・係数16/18の実計数・OS backend・運用quota承認は未対応。

## 1. 目的・前提・非対象

[全体work受付設計](BEST_PRACTICE_BP5_R2_OL03_TOTAL_WORK_ADMISSION_DESIGN.md)のSを具体化する。[index子phase](BEST_PRACTICE_BP5_R2_OL03_ROUND_DECLARATION_WORK_DESIGN.md#14-index上界の子phase分解とscan直前境界)のReady直後から、新しい全closure観測を返すまでが対象である。3roundの各roundで必ず新しく取得し、宣言からobservedを合成しない。

本書はローカルソースに基づく設計であり、macOS SDKや公式APIの実証記録ではない。初稿はMDのみで、§11の計算器、§12の単発操作境界を先行実装した。完全collectorとOS backendは未接続。全体受付は無効、telemetry調査は保留。APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。

workはBudget::workの課金量であって、CPU/RSS/OS syscall実行時間の上界ではない。名前列挙・metadata・読取の単発境界を実装しても、blocked I/Oや検査後変更を協調checkpointだけで排除したことにはならない。保護されたroot/context、更新leaseと外側監督は別の未解決条件である。

## 2. 既存実装との差分

| 参照 | 現在の性質 | 本案の制約 |
|---|---|---|
| [strict.rs::ClosureSource](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict.rs) | 同budget・lineage/全RecordBinding/round/tokenを要求。実collectorは未接続 | この契約を残し、単発操作と有限台帳を追加する |
| [deployment.rs](../native/r2-outer/src/deployment.rs) | 別のread-only検査。独立の時刻検査、名前集合、File::read等を使用 | そのまま1回のscan操作として包まない。隠れた列挙/再試行/コピーを引き継がない |
| [positioned_read.rs](../native/r2-outer/src/signature_boundary/positioned_read.rs) | 64KiB単位、要求長未満はChanged、共有EINTR残8、元10秒/2GiB | scanも短読取補完なし。既存A/B予約を使わず、同じinspectionの残EINTRだけを消費する案 |
| [metadata/collector.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/collector.rs) | 単発MetadataOps。1観測はcleanup込み最大10操作、target用100回・name copy640KiB | 同じ制限を全entryへ適用できると仮定しない。scan用の明示台帳と承認が必要 |

既存の100/640KiBやtopology16,384は自動拡大しない。scan台帳は同SharedBudgetの追加の型付き区画案であり、別Budgetを作ってcap/startをresetするものではない。上限値・既存区画との配賦が未承認なら、scan開始前にUnavailableで停止する。

## 3. private契約とshape

候補IDは `bp5-r2-scan-work-0.1`。固定内部registryへbackend版・operation分類・係数・上限・cleanup方式を結合する。呼出し側の件数申告・実測平均・前scanの消費deltaから上界を作らない。未知モデル／旧版混在／未対応backendはUnavailable。

ScanPlanは非Clone/非serdeで、同じimmutable宣言、root/祖先の承認済みreceipt、同session/budget origin・全RecordBinding・scope token/roundへborrow結合する。root path文字列や利用者が開いた任意FDから作れない。現行の保護されたproducerは未接続である。

| 記号 | 定義・制限 |
|---|---|
| F / D / N | accepted宣言のfile/directory/総数。N<=100,000 |
| E / F' / T | index自身を含むentry数N+1／file数F+1／rootを含むdirectory数D+1 |
| P / K | 宣言全path＋index自身の親prefix総数／そのpath深さ総和E+P |
| h | 信頼anchorからruntime rootまでの絶対component数。既存root契約内の1〜64。system祖先にruntime mode0555を一律要求しない |
| L / C | 全F' fileの宣言size総和／Σceil(size_i/65536)。indexは同pinの実raw長。空fileはchunk0でもEOF検査が必要 |
| r | 同inspectionのEINTR残回数。元の8以下。file/round/roleごとに8を再発行しない |

size合計と上界算術はchecked u64相当。index16MiB、相対path4096 bytes/64 components等の既存契約を維持する。index自身は仮想的な期待entryとして追加するだけで、実fileを読まずに観測済みにしない。各fileの実size・mode・hashは実FDから検査する。

## 4. 固定algorithm案

1. 元checkpointとscope/bindingを照合し、宣言から期待child lookup・固定長seen flag・観測slotを構築する。entry当たり/全体のallocation上限を**割当前**に検査する。
2. rootを含むT directoryを1つずつ処理する。毎回信頼anchorから全root pathと相対pathを安全に解決し、各edgeのmetadataを検査する。保持中の途中directoryを新しいpath検証のanchorにしない。
3. directory FDに結合したcursorで名前を1件ずつ取得する。各entryは期待lookupと即時照合し、未知・重複・不正名なら子を開かず停止する。名前集合を無制限に作って後から比較しない。
4. directory列挙終了時にmissing childを検査し、同FDのmetadataを再検査する。cursor/leafを解放してから、信頼anchorから同じ全pathを再解決し、初回identity/metadataと照合する。
5. 全F' fileも個別に信頼anchorから解決する。実size/型/owner/mode等を宣言と照合してからhashする。EOF・同FDの後metadata検査後にleafを解放し、全pathを再解決して初回snapshotと照合する。
6. root/全directory/全fileの処理・完全性・同scope結合を確認し、全E個の実観測を返す。後続AfterScanがraw再認証・全宣言/親/全集合を別途検証する。collector内の成功でそれを省略しない。

祖先/leafのbeforeとafterで取得不能や差があれば停止する。baselineを新値へ上書きして受け入れない。device跨ぎ・owner/APFS/noexec等の方針は既存の承認済みmetadata policyに従い、未決ならUnavailable。非Nodeを除外したり、変更されにくいfileだけを調べたりしない。

### 4.1 余剰entryと名前列挙

- raw direntはcursor所有のbounded bufferから次回呼出し前にコピーし、length/NUL/UTF-8・component長255・slash/control/特殊名を検査する。可変長native recordの境界検証はbackendの必須条件。
- `.`と`..`は各directoryにつき最大1回だけ許し、出現をwork/試行数へ計上する。重複や不正frameは拒否。その他のdotfileは通常entryとして照合する。
- 正常時の非dot entryは全E件。未知・重複・index二重出現を見つけた**最初の1件**で拒否するため、失敗prefixを含むraw yield上界は `H=E+2T+1`。EOFはdirectory当たり1回、`Qenum=H+T` がnext試行上界。
- 未知名は照合用の最大255 bytesだけを扱い、open/metadata/hash/再帰・observed挿入の前に拒否する。余剰directory配下や巨大fileの中身は読まない。declared名前の大量重複もseen flagで最初の重複を拒否する。
- missingはdirectory EOF時に拒否する。OSが黙ってentryを省略しないことや列挙中変更の原子性まではseen flagで証明できない。cursor後metadata・全path再照合・更新leaseの前提を残す。

`H`はこの新collectorが実装する場合の拒否上界で、現行indexモデルのobserved上限100,001を変更しない。成功のobservedはE件、失敗時はobservedを返さない。旧index式をN+1へ小さくする実装は別途必要である。

### 4.2 単発enumerator backend

`next`は1回でEntry/End/有限Errorのいずれかを返し、内部のskip・retry・無制限buffering・sortを禁止する。raw frame解析、buffer refill/コピー・cursor生成/解放の操作を隠さない。列挙エラーをEndへ変換しない。

Rust read_dirやreaddirをそのまま単発syscallだとは扱わない。nativeのbuffering/errno/内部allocationを含む実装方式は未採択であり、公式仕様/SDK・ABIの確認と合成backendによる上界試験が必要。1 nextが単純な1 syscallであると証明できないbackendは、refill等の追加費目を定義するまでUnavailableとする。以下の式はその固定単発backend契約に対する候補値である。

## 5. read・短読取・EINTR

読取は同じ生存FDへの位置指定、最大64KiB、固定size内のchecked offsetだけとする。1 logical chunkにつき要求長を一度だけ要求する。

| 結果 | 処理 |
|---|---|
| n=requested | 成功bytesを元payload台帳へ課金し、hash/offsetへ反映 |
| 0<=n<requested | 読めたbytesは課金するが、Changedで停止。補完readはしない |
| n>requested | requestedまで保守的に課金しReadFailed。adapterのmemory安全性をこの検査だけで証明しない |
| EINTR | 試行を課金し、元共有残rを1減らして同offset/要求を再試行。残0ならReadFailed |
| WouldBlock/その他 | 課金済み試行としてReadFailed。sleep/backoff/reopen/fallbackなし |

成功bytesはpost-I/O guardの**前**に計上し、遅延成功も無料にしない。EINTRは「bytesを返さない有限Error」という単発source契約を要求する。曖昧なpartial-errorを返すbackendは非対応。

各file終端で1 byteのEOF probeを1回行う。0だけ成功、1はChangedで停止する。probeもEINTR/試行台帳へ含める。hash比較・size/post-metadata差は元の有限理由で停止し、旧FD/別pathで再試行しない。

```text
Qread_base = C + F'
Qread_scan <= Qread_base + r
Qread_three_scans <= 3×Qread_base + r_scan_total
r_scan_total + r_target_other <= 8
```

この式は短読取停止方針によって成立する。positive short readを補完する仕様へ変えるなら、このモデルID/式は使わず、最小進捗または試行上限を別に導出する。現行record再読のpositive short継続をscanへ持ち込まない。metadata/open/enumのInterruptedは再試行せず取得失敗とする。closeはEINTRでもretryしない。

## 6. 操作数・work上界候補

### 6.1 完全path再解決とmetadata数

毎回新しいanchor所有handleを1つ取得し、rootまでh edgeを解決する。全entry＋rootを各2回解決するため、全walk数はW=2(E+1)。相対edge総数は2K。

```text
Owalk = W×(h+1) + 2K       # anchor W + root edges W×h + relative edges 2K
O     = Owalk + T           # cursor用の独立openをdirectoryごとに1回
M     = Owalk + F' + 2T     # opened handleのsnapshot + file後 + directory後 + cursor結合
A_live    = O + 9M + Qenum + Qread
A_cleanup = O + M
A_total   = 2O + 10M + Qenum + Qread
```

Aは単発source境界の試行数であり、OS syscall数の実証値ではない。native helper内に追加処理があるなら別費目が必要である。

root再解決はroot itselfの2walkにも適用する。metadataは同FDに対するbefore/stat/FS/ACL/names/afterの完全観測を指す。cursor用FDの結合をstat1回で代用せず、本案では保守的に1完全観測へ数える。cursorがdirectory所有権を受け取る方式では二重closeしないよう操作表を変える必要があり、黙ってOを減らさない。

単発snapshotの候補は既存MetadataOpsと同じ、stat前・FS・ACL init/stat/query・names size/read/size再確認・stat後の通常9操作＋ACL free1。workはそれら10に加え、before/FS/ACLの正規化3、names copy/frame処理1、name token最大2、after/identity比較2で**18 work**とする案。namesは0/許可provenance1だけ、2件目で拒否するbounded parserを前提とする。snapshot内部に追加allocation/ABI/照会を隠す実装には使えない。係数18は未実装・未計数検証である。

### 6.2 所有表と式

| 費目 | work候補 | 説明 |
|---|---|---|
| 期待構築 | 4E | entry/path確認、parent分離・lookup挿入、nameコピー、size/chunk統計。割当前の課金も含む固定4 step案 |
| open/close | 2O | open dispatch1＋close用precharge1。open失敗でもprechargeを返却しない |
| metadata | 18M | 上記snapshot。ACL freeのprecharge込み、close費とは別 |
| 列挙 | 2Qenum + 3H + T | next dispatch/result分類2、yieldのframe/name/expected-seen照合3、directory EOF検査1 |
| missing | E | directory EOF時のexpected child確認。全directory合計でE |
| read | 2Qread + 2C + 2F' | 試行dispatch/result分類2、成功chunkのhash/進捗2、fileのEOF確認とdigest比較2 |
| observed | 4E | bounded slotの実metadata/hash結合、値構築・格納、最終出力走査。sortで隠れた可変費を増やさない |
| 固定制御 | 16 | 下記の有限step。余裕marginではない |

固定16は、入口origin/全binding2・shape算術2・index仮想期待entry3・resource事前確認3・出口origin/binding2・全体完了summary1・観測seal1・所有権台帳終端1・終端work guard1という**実装予定の課金点**へ対応させる。これをそのまま検証済み固定費と呼ばず、実装時に全成功/拒否prefixを計数する。省略・増設するなら候補式とモデルを更新する。

```text
U_scan_round(r) = 16 + 9E + 2O + 18M
                  + 2Qenum + 3H + T
                  + 2(C + F' + r) + 2C + 2F'

U_scan_three = 3×U_scan_round(0) + 2r_scan_total
```

E/P/hの係数計算、expected/observedのallocation計画を作る費用も別途計数し、上の構築/固定費で覆えることが未証明ならplan生成費を全体U_otherへ追加する。任意の「安全率」や平均測定で埋めない。算術overflow/上限超過はLimit、係数・方式不明はUnavailableでscan前に停止する。

最大拒否prefixには未知yield1、短読取/EOF probe/遅延成功・最後のopen失敗とcleanupを含む。未知entryを開かないこと、成功pathより長いretry/refill/再walkへ進まないことが上界の成立条件。将来のnative sourceがこれを満たさなければ受付不可である。

### 6.3 架空例（受付成功ではない）

F=2、D=2、P=3、h=2、C=3とすると、E=5、F'=3、T=3、K=8、W=12、Owalk=52、O=55、M=61、H=12、Qenum=15。
U_scan_round(0)=1,362、r=8を全てscanで使う1round上界は1,378、全3scanで共有8を使う場合は4,102となる。
ここにindex/record/otherは含まれず、payload L・FD・metadata等の別枠も未受付である。system祖先の実対応や本番閉包を測定した値ではない。

### 6.4 現行式で実閉包規模を受け付けられない見通しと判断事項（2026-10-20、レビュー）

§6.2の式へ実閉包規模の試算shapeを代入した机上計算である（実測・実閉包の計数ではない）。

| 試算shape | M | U_scan_round(0) | 3scan |
|---|---|---|---|
| F=4,500、D=1,000、P=22,000、h=5、C=6,000 | 127,529 | 2,671,628 | **8,014,884** |
| 楽観例：同F/D、P=0、h=1、C=F'=4,501 | 39,513 | 905,312 | 2,715,936 |

- 支配項は `18M` で、前者では2,295,522（約86%）。全entry＋rootを2回anchorから全path再解決し、各edgeで18 workの完全snapshotを取る方式に由来する。Owalk=121,026のうちroot祖先分 W×(h+1) が66,024、相対edge分2Kが55,002。
- 楽観例でもscan単独で元work上限100万を超え、index・record・otherを加える前に受付不能となる。§6.3の架空例が小さいことを実閉包の受付可能性と読まない。
- 係数・方式を変更せずに上限だけを増額すれば、10秒期限・metadata操作数（前者で10M=1,275,290/round）・CPU時間との関係も再評価が必要になる。

次のいずれかを人が判断するまでSの受付は無効とし、黙って係数や上限を変更しない。

1. **祖先edgeの軽量化**：中間edgeは同一性・型・owner/mode等の限定確認とし、ACL/xattr/FSを含む18 work完全snapshotはleaf・cursor結合に限る。安全性の根拠と係数を別途審査する。
2. **root祖先検証の集約**：root祖先h+1の検証をround内で集約する。ただし§4の「保持中の途中directoryを新しいpath検証のanchorにしない」と両立する方式（例：各walkは祖先identityの比較だけを行う等）を設計し、ABA/検査後変更の扱いを再審査する。
3. **上限の再承認**：scan専用のwork・metadata操作枠と10秒期限の見直しを人が承認する。未承認の増額は行わない。

いずれを選んでも、index（[§12の判断事項](BEST_PRACTICE_BP5_R2_OL03_ROUND_DECLARATION_WORK_DESIGN.md#12-現行上界で実閉包を受け付けられない見通しと判断事項2026-10-20レビュー)）・record・otherと合算した全体受付可否を改めて計算する。

## 7. 共有予算・独立台帳・割当前拒否

元SharedBudgetのorigin/start/10秒、work100万、payload2GiB、元retry残8を引き継ぐ。既存A/B予約やtarget metadata枠をscanが消費しない。各操作の直前・直後、yield/copy/hash/slot挿入・解放後にcheckpointを置く。全体受付が未実装の現状では、これらを満たす実collectorを起動しない。

| 台帳 | 受付・実行の必要条件 |
|---|---|
| work | index子phaseやRと混ぜずSとして所有。U_scan_threeと他費目を合算し、spent/予約の二重課金を禁止。新Budget/round resetなし |
| payload bytes | 各roundはL+F'（全probeを1 byteとする保守上界）、3roundで3(L+F')。実成功bytesを毎回計上し、record再読/A/B/EOFと元2GiB内で合算 |
| operation | O/M/Qenum/Qreadとcleanupの個別上限、総試行数を固定modelへ結合。topology16,384は既存契約call枠でありsyscall枠ではない。scan操作の分類・配賦は未承認 |
| scan metadata/name | M snapshot・10M単発操作、最大64KiB/name buffer、copy総量は3M×65536を保守上界とする。target用100回/640KiBと別区画が必要。値未設定ならUnavailable |
| names | raw yield H、1 name最大255 bytes。親を結合したpathは4096 bytes以下。native record/refill bufferも固定上限が必要 |
| FD | scanはstreaming current/next最大2増を目標とし、cursor処理と別walkを重ねない。実backendで追加FDがあれば式へ加える。既存live FD＋scan peak＋record等がrole scope132へ収まらなければopen前にLimit |
| allocation | child lookup/seen/観測slot・path総bytes・baseline・cursor/name64KiB・read64KiBの同時生存量をchecked計算する。allocator/node overheadを固定契約へ含める。RSS保証ではない。固定approved cap未設定ならUnavailable |

FD数を抑えるため、file/directoryのpost-metadataを取った後、leaf/cursorを解放してからfresh path walkを始める。entry全件分のFDは保持しない。baselineは共有祖先を重複保存せず、root祖先h+1とE対象の有限集合へ結合する。これでもABA/検査後変更は解決しない。

metadata bufferと名前の成長・errnoを「もう一度大きく確保して再取得」で回避しない。size query/read/reconfirmの差はChanged。許可xattrは既存方針のcom.apple.provenanceのみ、quarantine/resource fork/未知名・可視性不明は拒否する。値の取得を始めるなら別費目と審査が必要。

## 8. 解放費用と失敗時停止

scanでのcleanup回数上界は `O + M`（FD/cursorの終端O、ACL free M）。cursorがFD所有権を取得したら、そのFDを別途closeしない。単発sourceの成功handleはpost-operation guardの**前**にRAII ownerへ取り込み、遅延成功も漏らさない。

通常workはsticky failure後に成功しないため、cleanup時に通常workを呼べた場合だけ解放する設計は禁止する。本案ではacquire前にcleanup1 unitを同workへ**precharge**し、一度限りのcleanup tokenを作る。acquire失敗時もそのspentを返さない。これは全体work予約の先行実装ではなく、将来collector固有の課金方式案である。

- drop/取消/期限/途中失敗でも解放を一度だけ試み、tokenを消費する。失敗後も専用cleanup操作数を記録できる境界が必要。
- close/closedir失敗やEINTRに対してFD番号をretryしない。既に番号が再利用されている可能性を排除できないためである。
- free/closeの成功・不明を混同せず、cleanup不成立は外側hostへ伝える。元の検査失敗理由は上書きしない。Rust Dropだけではclose完了の証拠にならない。
- resource追加・次directory/次file/次scan/次roleは停止する。cursor/frame/path/name/hash/raw bytesを例外やログへ出さず、有限理由と件数だけを出す。

workをprechargeしてもOS非復帰は解決しない。解放処理のhard期限とhost強制停止・終了確認への接続は別途必要。未確認なら「cleanup完了」と報告しない。

## 9. 有限失敗理由と合成試験計画

既存sticky Deadline/Cancelled/Expired/Limitを保持し、後続のmetadata/構文エラーで上書きしない。未知model/未対応backend/未承認capはUnavailable、namespace/metadata/size/EOF/列挙集合差はChanged、hash差はHashMismatch、I/OはReadFailed、metadata取得不能はMetadataUnavailableへ接続する案とする。不正name等のpolicy不適合の詳細mappingは既存Failureと照合して実装時に固定する。raw errno文字列のmatchingはしない。

| 試験群 | 受入条件 |
|---|---|
| 完全性 | root/index/非Nodeを含む全E。missing/extra/duplicate/未知巨大file/余剰directoryを拒否し、未知名のopen回数0 |
| 列挙 | dot最大2、第三dot・不正UTF-8/NUL/frame・buffer境界・errorをEOF化しない。H/Qenumとrefillの計数 |
| read | 0/1 byte短読取、各chunk/空file/EOF、過大count、EINTR残0/8/9、他roleで消費済みretry、WouldBlock、遅延成功を確認 |
| path/metadata | open後差替え・path再解決差・各祖先/leaf/ACL/xattr/FS変更、取得不能、cursor結合差を拒否。baseline上書きなし |
| work式 | E/P/h/Cの全境界と各拒否prefixを操作種別ごとに独立計数。3scan合計のretry共有、解放precharge込みで上界以下 |
| 独立cap | bytes/ops/name/FD/allocationを等号・1不足・overflowで拒否。target予約流用・元cap拡大・round resetなし |
| 解放 | acquire成功直後の取消・失敗・unwind、各handle一度だけ解放。close失敗/不明・非復帰・FD再利用時にretryしない |
| 感度 | extra拒否・path後検査・retry減算・prechargeを外す、係数を1減らす変異で対応試験が失敗 |

本節の完全collector試験やnative呼出しは未実施。§11では計算器、§12では単発操作境界の部分試験を行った。評価用の合成sourceは実filesystem完全性・監査証拠・leaseの代替ではない。

## 10. 実装順・承認待ち

1. 純粋なScanShape/operation histogram・checked上界計算と固定model契約。係数16/18・配列/node overheadを独立計数する前提を明示する。
2. 単発enum/open/read/metadata/cleanupの合成sourceと、共有work/EINTR/各typed quotaの実装。全体受付はまだ接続しない。
3. expected照合・余剰拒否・短読取停止・resource ownerの内部collectorを合成で検証する。
4. native列挙ABI/SDK/hidden buffering・metadata取得・非復帰/closeの公式仕様照合と、保護されたroot/clock/leaseの設計を完了する。
5. scan用ops/name/allocation cap、既存16,384/100/640KiBとの配賦、FD132、100万workでの実shape受付可否を人が承認する（§6.4の見通しと判断事項を前提とする）。未承認のcap増額・並列化・retry追加は行わない。

これらが揃うまでSの運用受付は無効。係数表・架空例だけで全体受付やpermitを有効化しない。

## 11. 純粋な計算器の先行実装（collector未接続）

[scan_work.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_work.rs)と[合成検証記録](E2E_BEST_PRACTICE_R2_OL03_SCAN_WORK_CALCULATOR_SYNTHETIC_2026-10-20.md)を追加した。§9のcollector/OS試験ではなく、候補式の算術と共有予算失敗の検証である。native操作を実装・実行していない。

- 固定ID `bp5-r2-scan-work-0.1`。入力はF/D/P/h、index raw長、indexを含むfile総bytes Lとchunk総数Cの数量だけである。protectedなshape producer、accepted indexとの結合は未接続。N=0等の算術envelopeも扱うが、実際に有効なclosure宣言と認定しない。
- N<=100,000、P<=63(N+1)、h=1〜64、index=1〜16MiB、index<=L<=2GiBと、F×512MiBのdata容量を防御的に検査する。index chunk＋dataのceil下界と、positive file数・data bytes・per-file capからのchunk上界を検査する。集約値だけでは各fileの構造・正しいCを証明できず、将来のproducerは同宣言から実際のΣceilを収集する必要がある。
- 元budgetからretry残r（0〜8）を読み取り、式の `3×base + 2r`（work）、`3×primitive_base + r`（操作数）へ一度だけ加える。rを消費・補充しない。r>8は内部Retry limitとして拒否する。
- O/M/H/Qenum/read/cleanup/live/totalのoperation histogramと、費目別work・payload/name-copyの上界をchecked u64で計算する。大きい数量は計算できても受付可能とはしない。§6.4の2例は現行100万workの数量チェックで拒否される。
- **計算自体の実消費は12 work**。model1・構造1・byte/chunk1・retry1・walk/metadata1・enum1・operation histogram1・work費目1・round合計1・3round合計1・独立resource量1・終端1。元のcollector固定16に混ぜず、将来U_otherの計画作成費へ別計上する。これでcollectorの固定16/metadata18が実計数済みになったとは扱わない。
- 結果はprivate・非Clone/非serde・固定Debugで、budget originとretry snapshotを保持する。追加requireは1 workで、未知model/別budget/retry変化をそれぞれUnavailable/Binding/Changedへ接続する。receipt/root/scopeに結合したscan planや実行authorityは作れない。
  - 補足（2026-10-20、レビュー）：retry残は減る方向にしか変化しないため、古いsnapshotの上界はむしろ保守的である。それでも変化を拒否するのは安全側の選択だが、このChangedは**filesystem観測の変化ではなく共有予算状態のずれ**を表す。診断・監査ではnamespace/metadata差のChangedと同一視しない。将来理由を分ける（例：Binding寄せ）場合はモデル・試験を併せて更新する。
  - 補足（同）：この性質上、将来collectorへ接続する際は見積もりを**scan直前**に作る必要がある。前工程（record再読等）でEINTRを1回でも消費すると、それ以前に作った見積もりはrequireで拒否される。見積もりの早期作成・round間の使い回しは前提にしない。
- 任意のindex互換型quantity-only cap helperはrequire1＋比較1の計2 work。available<=100万、3scanのwork<=availableなら等号を許すが、spent/他予約を引かず、work/bytes/FDの予約も発行しない。spentがほぼ100万でも数量比較だけは成功し得るため、全体受付の代用は禁止する。
- 元start/origin/spent・I/O予約・metadata/topology/name台帳をresetしない。計算・guard・cap helperのBudget失敗はstickyな元理由を保持し、モデル不一致はUnavailable、Shape/Overflow/Retry/Capは内部で区別したLimitへ接続する。

13件の追加テストで、机上例と費目、テスト専用の予定操作schedule interpreter、量の境界/overflow、共有retry・台帳・期限/取消・first failureを照合した。interpreterはcollectorの実装でも、native syscall数・hidden buffer・解放保証の証明でもない。この計算器の段階では単発sourceも未対応だったが、後続§12で内部境界を先行実装した。bounded collector・scan専用運用quota・root/clock/lease・上限再承認は未対応。全体受付と運用gateは停止したままである。

## 12. 単発操作の内部契約・合成source（運用未接続）

[scan_ops.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops.rs)と[合成検証記録](E2E_BEST_PRACTICE_R2_OL03_SCAN_SINGLE_ATTEMPT_SYNTHETIC_2026-10-20.md)で§10の第2段階を先行実装した。privateな境界のみで、OS実装・運用呼出し・承認済みquota producerはない。quota未設定ならcallback/source前にUnavailableとする。合成quotaは承認済みscan planではなく、root/receipt/round結合を証明しない。

| 操作 | 1呼出しの契約・課金 |
|---|---|
| open / ACL init | 1試行のみ。dispatch1＋cleanup precharge1を取得前に課金し、操作枠・live枠・cleanup枠を検査/確保。成功handleをpost-guardより前に非Clone ownerへ取り込む。失敗時は予約だけ解除しspentは戻さない |
| enum | 1件/EOF/有限Errorのみ。dispatch1＋構造分類1。固定255-byte buffer、UTF-8/component境界を検査。ErrorをEOF化せず、Interruptedでも再試行しない |
| read / EOF probe | dispatch1＋結果分類1。64KiB/512MiBの絶対envelopeと既存payload予約を含む2GiBを検査。短読取補完なし。成功bytesはpost-guard前に課金。EOFは1-byte要求の0だけ成功 |
| EINTR | 1回のsource呼出しでInterruptedを返し、元共有retry残を1減らす。内部retry loopなし。呼出し側が同resource・offset・長さ・probe種別で明示的に次の1試行を行う。他操作への移行・未完了retryの放置を拒否 |
| metadata | stat/FS/ACL stat/query/name size/read各1試行、各dispatch1。ACL init/freeは別操作。型・ACL sentinel 0/1・size/copy境界を検査。nameコピーは独立台帳へ遅延成功も計上し、target metadata枠を流用しない |
| cleanup | ownerのDropが所有handleを一度だけ消費。取消/sticky stop後もprecharge済み枠で1試行し、再試行なし。Released/Unconfirmedを区別し、不明後は新規操作を停止。元失敗理由と別に不明件数を保持 |

同じSharedBudgetをborrowし、start/origin/work/payload/retryをresetしない。scopeのresourceは同source/同ledgerへの結合を検査し、別scopeからの混入を拒否する。scoped harnessのsetup/terminal guardは合計**2 work**で、dispatch/prechargeと別費目。collector固定16のどのstepへ含めるかは未確定であり、二重加算・無根拠な控除はしない。

通常の成功・失敗・取消・unwindではownerが解放する。忘却されたownerはlive/cleanup予約残として終端拒否するが、`mem::forget`された資源を回収できるとは主張しない。sourceはnon-panicking・隠れたretry/refillなしを満たす必要があり、合成試験はnative ABI/非復帰/cleanup hard期限を証明しない。不明件数の外側hostへの接続も未実装である。

15テストで各操作cap、live/name/work/payload枯渇、source前拒否、遅延成功、EINTR共有、短読取/EOF、列挙/metadata不正応答、cleanup不明、unwind/忘却・別scopeを検証した。完全snapshotの正規化/前後比較、宣言sizeへの読取結合、expected/seen/余剰entry拒否、path walk・実metadata policy・3round quota配賦は未実装。§6の16/18と全体式は依然候補で、全体受付・permitを有効化しない。
