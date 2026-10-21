# BP-5 R-2 OL-03：現行完全collectorの費目・work上界再設計

Version: draft-0.8 / Date: 2026-10-21 / Status: test-only計数・oracleとprivate sealed profile収集/純粋計算器を合成検証。Inputs利用状態/bridge/入口guardは別紙で設計のみ。運用接続・全体受付は未対応。

## 1. 範囲と停止状態

[scan詳細設計§21/22](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#22-scan単位の期待子一覧前処理)の現行collectorを対象とする。[全体受付設計](BEST_PRACTICE_BP5_R2_OL03_TOTAL_WORK_ADMISSION_DESIGN.md)のSを置き換えるための設計であり、旧数量計算器の検証済み範囲を広げるものではない。

基準ソースは `8884845`。`scan_ops/collector.rs`、`collector/expected_groups.rs`、`child_set.rs`、`declared_read.rs`、`normalized_metadata.rs`、`scan_ops.rs`、`scan_inputs.rs`、`round_declaration.rs`、`closure/shared.rs`、`closure.rs`を照合した。外部仕様・OSの性能を調査した文書ではない。

全体受付は無効、telemetry調査は保留。APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。実装・OS接続・実機操作・トークン発行・設定変更・本番policy投入・permit発行は本工程の対象外。コミット・Pushも本設計作成には含めない。

本書の数値は共有 `Budget::work` の課金上界**候補**であり、CPU時間・RSS・syscall数・hard期限の保証ではない。静的に数えた式を合成検証済みとは記さない。未知費用は0にしない。

## 2. 計数境界

Sの核は、Readyに結合済みのScanInputsを受けて `collect()` に入り、with_boundaryの終端guardまでを通過する範囲とする。次は核の外である。

- receipt/context生成、record再読・厳密検証、index decode/意味検査、Node照合、prepare_scan。
- ScanInputsの構築（`bind_inputs`）、本書のshape/profile収集・上界算術・受付guard。
- 呼出し元のAfterScan/FinalIndex、targetのA/B取得・物理parser・metadata/topology。

これらは消える費用ではなく、I/R/Oへ別計上する。実測1,902 workはcollector核の小fixtureの値であり、上記や全3roundを含まない。

## 3. 費目所有表

| 所有者 | 対象・課金点 | 含めないもの／注意 |
|---|---|---|
| S.control | with_boundary開始/終端、layout guard、配列guard・slot初期化/完了、directory観測射影、最後の保持root snapshot/比較 | sourceの真実性・OS syscall時間を証明しない |
| S.groups | 親bucket、親binary search、count/prefix、stable scatter、virtual index挿入 | 全entryをdirectoryごとに走査する旧式は使わない |
| S.route | root/entryのStep配列・prefix作成・directory検索、index pin結合 | 実walkとは別費用。再walkは作成済みStepを使う |
| S.walk | 各acquire、完全snapshot→record、元snapshot比較、walk開始 | 絶対祖先を毎回固定anchorから探索。rootへ短絡しない |
| S.enumeration | 子一覧参照/射影、expected/seen初期化、cursor/child open・snapshot、enum/検索/missing、parent事後照合 | file本文読取はS.file。cursor・ACL ownerのcleanupは取得時prechargeを一度だけ数える |
| S.file | bind、初回record比較、data read/hash、EOF/post-snapshot/digest、実観測射影 | walkで取得したfile snapshotとbind snapshotは別に存在。両方数える |
| S.seal | `complete()` のguardと**追加の**index再認証・全集合照合 | AfterScanの代替ではなく、追加decodeも行わない |
| I | prepare_scan/AfterScan/FinalIndexの既存index子phase、Node照合 | S.sealをIの既存枠で「済んだ」と扱わない |
| R | 前後計6回のrecord strict検証・record projection | Sのsnapshot→RecordSnapshot射影とは別物 |
| O | profile収集、計算器/受付、bind_inputs、bridge、phase制御、target/その他work | 未計数の係数・独立resourceが残る間は全体受付不可 |

下位 `begin(acquire=true)` の2 workには取得とcleanup事前課金が含まれる。Drop自体にはworkを追加せず、回数を再びworkへ足さない。ただしcleanupのoperation quota・未解放/解放不明の証拠は別に必要である。checkpointだけのclean/check/guardは、その呼出しがworkを課金しない限り0 workであり「処理時間0」ではない。

### 3.1 seal費の重複と既存indexモデル

現行は、collector.completeのrecheck(Some)、AfterScanのrecheck(Some)、FinalIndexのrecheck(None)を毎round実行する。最初の1回は旧ClosureSourceの観測producerにはなかった追加処理であり、既存index子phaseの固定余裕へ黙って吸収しない。

本案は**S.sealに最初の1回全体を所属させる**。AfterScan/FinalIndexをIへ残し、3 decode・6 record検証・3 scanと前後の厳密再検証を維持する。将来Iへ移管するなら、明示的に所有表・submodel・感度試験を同時改訂する。両者が同じpure helperを呼ぶことは、同じ実行分を共有していることを意味しない。

## 4. 必要なshape統計

通常宣言はpath昇順、virtual indexは同じrecord pinから追加したFileとする。以下は同一の受理済みimmutable宣言とReadyから導出し、呼出し元の申告値は採用しない。

| 記号 | 定義・単位 |
|---|---|
| N / E | 通常宣言数／virtual index込み総数。E=N+1、E≤100,001 |
| D / F / T | directory数／index込みfile数／root込み列挙directory数。E=D+F、T=D+1≤E |
| h | runtime rootの絶対component数。1〜64。anchor `/` 自体はcomponent数へ含めない |
| k_i / K / P | entry iの相対component数／Σk_i／Σ(k_i−1)=K−E。各k_iは1〜64 |
| k_v | virtual indexの相対component数。K/Pへも含む |
| c_d / c_v / c_max | 親dの直接子数／index親の直接子数／最大子数。Σc_d=E、c_v≥1 |
| b_i / L / C | 各file宣言size／Σb_i／Σceil(b_i/65536)。空fileのchunk数は0だがEOFは1回 |
| b_v / C_v | indexの元raw byte長／ceil(b_v/65536)。file読取とseal内hashは別の課金 |
| r | scan開始時の同じSharedBudgetのEINTR残。0〜8。session開始時の8へ戻さない |

既存shapeのfiles/directories/parents/root_depth/bytes/chunksだけでは、親別lookupとvirtual index移動を十分に説明できない。c_dの配列または同等に検証されたhistogram、k_v、最大file sizeの検査を追加する案とする。B/V/Mの実行時実測値を将来上界として使わない。

定義 `ell(n)=ceil(log2(n+1))`（n=0は0）をintegerのbit長で計算し、浮動小数点は使わない。`J=Σ_d c_d×ell(c_d)` は成功するchild検索の上界とする。親不一致等の失敗用には別途ell(c_max)を確保する。

### 4.1 統計の取得・結合

- groups前処理・profileの双方が子配列を別々に作る設計を既定にしない。初回Readyで導出し、実行側と同じ親解決・virtual indexを扱う方式を後工程で選ぶ。信頼された宣言へのborrow/receipt/round/token/budget origin結合を必須とする。
- profile公開は全検査・checked算術後のみ。取得中の取消/期限/上限失敗ではprofileを返さない。古いroundや同bytesの別宣言へ再利用しない。
- 初回統計の実施費と将来roundの収集費をOへ数える。初回費をSにも重複計上しない。収集・算術の正確な係数は未実装のため未確定であり、0や固定の架空値を置かない。
- fileはscanの512MiB制約、indexは16MiB制約へ適合すること。closure側のper-file 2GiB受付と同一ではない。Lの3倍だけでなく他の成功read・既存予約も元2GiB内に収める必要がある。

## 5. 1roundの候補上界

以下は受理済み宣言に結合したcollect核へ適用する**保守的な設計式**。§11でtest-only oracleによる有限の合成照合を行ったが、運用用のsealed shape計算器と全体/独立resource受付は未実装であり、受付には使わない。将来の運用計算器はchecked u64、減算も定義域を確認する。未知modelはUnavailable、overflow・数量不適合はLimitで停止させる設計とする。

### 5.1 groups・route

```text
U_groups = 8 + 4E + 4T + min(P, E−c_0)×ell(N) + ell(c_v) + c_v
U_route  = (h+2) + E×(h+3) + K + k_v + P×ell(N)
```

補足（2026-10-20、レビュー）：draft-0.1のgroupsは `P×ell(N)` だった。Pは1 entryあたり最大63まで親prefixを数えるため、1 entry 1探索のgroupsには過大である（実閉包規模の試算でP×ell(N)=286,000、min式では最大でもE×ell(N)=71,513）。routeは各entryの中間prefixごとに `directory()` を検索するため、`P×ell(N)` が正しい上界でありそのまま維持する。c_0は§4の統計（root bucketのc_d）から取り、呼出し元の申告値を使わない。

groupsの成功実費は既存§22の `8+4E+4T+B+V+M`。groupsは各entryにつき親directoryの二分探索を高々1回行うだけなので、Bは「親を持つentry数×ell(N)」で覆える。c_0をruntime root直下の子数（virtual indexを含む）とすると親を持つentry数はE−c_0であり、各entryはPへ1以上寄与するためP以下でもある。よってB≤min(P, E−c_0)×ell(N)、V≤ell(c_v)、M≤c_vで上から覆う。割当guard6回、配列の初期化/scatter、virtual indexの移動前課金を含む。

routeはrootの1回と各entryの1回だけStepを作成する。h+1個の絶対snapshot、prefix構築、相対edge、directory検索、virtual indexのpin比較を含める。walk/rewalkのたびにrouteを再作成したと仮定して二重計上しない。逆に現行の実walk回数を減らさない。

### 5.2 全walkと完全snapshot

```text
W = 2E + 3
A = (2E+3)×(h+1) + 2K
U_walk = W + 23A
```

Wはentryごとのwalk/rewalk各1回、rootの初回walk・列挙後rewalk・最終rewalkの計3回。Aは全walkで実際に通るanchorを含むedge数である。walk開始1、各edgeでacquire2＋record snapshot上界20＋比較1を数える。現行snapshot正規化18＋record射影1=19に対して20を上界枠とし、CPU/ABI費用を20で保証する意味ではない。中間parentのcleanupはacquire2内のprechargeに含む。

### 5.3 directory列挙・visitor

```text
U_enum = 32E + 58T + J
```

既存の課金点の分解は、名前yield Z個（dotだけを別に数え0≤Z≤2T）、成功lookup実費J_actualに対して、snapshot→recordを上界20で置いた場合 `31E+51T+3Z+J_actual` 以下を候補とする。その導出を独立テストで確認するまで、さらにentry/directoryごとの1 unit枠を残した上式を使う案である。未分類費をこの枠へ押し込む運用は禁止。

内訳は期待子一覧参照・ExpectedChild射影、sorted検査・seen初期化、cursor取得/完全snapshot/parent比較、enumの単発dispatch/構造分類、dot判定、各binary比較・seen更新、matched child取得/visitorの初期snapshot格納、EOF分類/missing、parent事後snapshot/比較である。全E childを最初にsnapshotへ格納する費用は、後のwalk/bind snapshotと別に数える。

### 5.4 file read/hash/観測

```text
U_file = 56F + 5C
```

現行のbind22、初回record/比較2、EOF成功/post-snapshot/finalize/比較24、観測射影5からは `53F+5C` を読み取れる。上界snapshotの差をbind/EOFへ各1加え、fileごとにもう1枠を残した56を候補とする。data read1回の5にはdeclared guard1＋transfer dispatch/分類2＋hash update1＋位置更新1が含まれる。Interruptedはhash/位置を進めず3 work/試行なので§5.6へ分離する。空fileもbind/EOF/hash/観測を省略しない。

### 5.5 control・追加seal

```text
U_control = 37 + 4E + D
U_seal    = 11 + 2C_v + 4E + P
```

controlはscope開始/終端、layout guard、3配列guardとE slot初期化、entry開始/完了・directory観測、output vector/全slot取出しに加え、最後の保持rootのsnapshot/比較を所有する。draft-0.1/0.2の16には最後の処理が抜けており、基本fixtureで実費52に対して上界38となった。最後のrecord上界20＋比較1を明示的に追加し、`37=16+21` と訂正した。これは製品のwork増加やcap増額ではない。

計数上、最後のroot record/比較は20、その他のcontrolは `10+4E+D`（fixture32）で、合計 `30+4E+D`（fixture52）。候補 `37+4E+D` には元の固定余裕6とrecordの余裕1を残す。旧collector固定16を認証済み係数として流用しない。

sealはcomplete guard3、declaration.ensure_scope1、index model guard1、pure recheckの `6+2C_v+4E+P` を合計する候補。pure recheckにはindex hash/header、通常entry検査、全親prefix、観測map生成、virtual index照合、通常entryとの全集合比較を含む。O(E)の追加decodeはなくても、このhash/意味検査/集合照合は存在する。

### 5.6 拒否prefixとEINTR用の枠

```text
U_tail(r) = 16 + ell(c_max) + 3×(r+1)
U_S      = U_groups + U_route + U_walk + U_enum
         + U_file + U_control + U_seal + U_tail(r)
```

名前変化で成功集合外の1件を列挙して拒否する経路は、enum dispatch/構造分類2＋Name分類1＋最大lookup ell(c_max)＋duplicate判定最大1までを別枠で覆う。余剰・重複・不正名はその時点で停止するため、無制限に余剰名を処理しない。dotも各directoryで2種類まで、それ以後は拒否する。

readは成功予定のC+Fを基底へ置き、成功へ至るInterruptedの追加r回を3rで覆う。さらに枯渇後のInterrupted・terminal read異常等の最後の1試行を3で保守的に追加する。16の固定枠は余剰分類・拒否終端の有限処理用で、cleanup操作数や失敗時の解放をこのworkで代替しない。

ただし「失敗は必ず成功のprefix」という一般仮定だけで承認しない。snapshot取得異常・malformed応答・成功後のcleanup不明・terminal guard失敗も含め、§8の全失敗分類ごとに上界を検査する。未知形のsource応答や将来追加処理でこの分解が崩れればmodelを不成立とし、枠を黙って増やさない。

## 6. 3roundと全体式への位置付け

同一宣言・同一index/shapeを前後で厳密に再確認できる条件で、r0を最初のscanでの共有EINTR残とすると、候補は次のように分離する。

```text
U_S_base = U_S - 3×(r+1)
U_scan_all <= 3×U_S_base + 3r0 + 3
U_total = U_index_existing + U_record_existing
        + U_scan_all + U_other
```

成功へ至るInterruptedはsession全体で最大r0回。枯渇/その他terminal異常の追加1試行は失敗時に全工程が止まるので全体で1回とする設計。3×r0のretryを各roundへ新たに与えない。各scanの同じ核と安全枠は3回分数え、期待子一覧もround間cacheしない。

`U_other`にはprofile/計算/bridge/ScanInputs構築等の未確定費が残る。record profileの通常経路への接続やtarget側費用も未完了なので、この全体式は**数値として完成していない**。現行の独立計算器IDを改名/置換せず、新scan submodel候補は実装時に別版として定義する。古いscan-work-0.1をこの式の認証として使わない。

初回scan直前の事前受付へ将来接続するときは、実施済みの固定phase上界だけを予定から除外し、実消費spentを保持する。`3round上界−実測spent` で残予定を作らない。work予約・operation/name/FD/memory/cleanupの3round台帳は別工程である。

## 7. 現行計測との関係

現行小fixtureはE=5/F=3/D=2/T=3/h=2/K=8/P=3/k_v=1/C=3/C_v=1、子数3/1/1。1roundの実測1,902 work、source876操作、payload4,590 bytes、peak owner5は既存合成記録で確認済み。本書の式はこの一点へのフィッティングではなく、各処理群の静的な分解からの保守案である。

期待子準備5,501 entryの85,393 workはgroups/一覧参照/射影の部分費にすぎない。さらにwalk/rewalk・全snapshot・seal等を加える必要がある。通常閉包5,000〜6,000件が100万workに収まると主張しない。超える場合は上限を緩めず停止し、測定後に別途最適化案を検討する。

### 7.1 実閉包規模の机上試算（2026-10-20、レビュー）

§5の候補式（groupsは上記min式）へ、既存試算と同じ規模のshapeを代入した。実測・実閉包の計数ではなく、shapeの一部は仮定値である。

前提：E=5,501（N=5,500）、F=4,501（index込み）、D=1,000（T=1,001）、P=22,000（K=27,501）、h=5、C=6,000、C_v=256（index16MiBの上限）、k_v=3、c_v=10、c_max=50〜500、J≤E×ell(c_max)、r=0。groupsのmin項は c_0 未確定のため保守的に E×ell(N)=71,513 で上から置いた。

| 費目 | 1round |
|---|---|
| U_walk | **2,794,741**（約72%） |
| U_route | 357,519 |
| U_file | 282,056 |
| U_enum | 267,096〜283,599 |
| U_groups | ≤97,543（旧P×ell(N)式では312,030） |
| U_seal | 44,527 |
| U_control | 23,041 |
| U_tail(0) | 25〜28 |
| **U_S** | **約387万〜388万** |

- 3round（§6の `3×U_S_base+3r0+3`、r0=0）は**約1,160万〜1,165万 work**で、元work上限100万の約12倍。U_walk単独でも1roundで上限の約2.8倍となり、index・record・otherを加える前に受付不能である。
- 支配項はU_walkの各edge `acquire2＋snapshot上界20＋比較1＝23` と、A=(2E+3)(h+1)+2Kのうち絶対祖先分 (2E+3)(h+1)=66,030 と相対edge分 2K=55,002 である。scan詳細設計[§6.4](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#64-現行式で実閉包規模を受け付けられない見通しと判断事項2026-10-20レビュー)の判断事項（祖先edgeの軽量化、root祖先検証のround内集約、上限の再承認）は本collectorにもそのまま当てはまる。
- groups式の引締めは上界を約21万下げるが、結論（受付不能）は変わらない。いずれの判断も人が行うまで、係数・上限・期限を黙って変更せず、全体受付は無効のまま維持する。

draft-0.3では最終root照合漏れの修正によりcontrolを21増やした。上の合計レンジと受付不能という結論は変わらない。groupsのmin式とレビューで追加された規模試算を維持する。

## 8. 検証受入条件（今回の実施範囲は§11/検証記録）

| 群 | 必須条件 |
|---|---|
| 費目計数 | 各work呼出しに所有者を1つ付け、実費の総和がcollector核のdeltaへ一致。sealとAfterScanを別計数 |
| primitive | snapshot/record、walk、route、enum、file、control/sealの単独計数。work枠をCPU命令/OS操作数へ読み替えない |
| shape | 最小/空file/empty directory、深さ1/64、wide/deep、nested index、index先頭/中間/末尾、N上限、最大file/chunk、c_max偏在 |
| 算術 | u64の各加算/乗算、E=N+1、K−E、ell(0)/境界2の冪、同model・別model・shape変更・同bytes別receipt/round/budgetを検査 |
| source拒否 | 未知/重複/missing名、3番目/重複dot、不正UTF-8/size、cursor/親/leaf差替え、metadata variant不正、ACL/FS/xattr不適合、短読取/EOF1/digest不一致で追加I/O停止 |
| retry | dataとEOF双方のEINTR残0/1/8、9回目拒否、同resource/offset/lengthの再試行。取消・期限・sticky失敗時に次のroundへ進まない |
| prefix | work残を0から成功費付近まで全prefixへ注入。取得前後・hash後・seal中・終端の失敗。source呼出し各点の取消/期限/取得失敗、cleanup不明も対象 |
| bound照合 | success/各拒否の実費≤当該bound。spent返金なし、未知費目0なし。小fixture値一致だけを証明としない |
| 感度 | 各費目を除外、sealをIと二重控除、lookupを定数へ変更、retryをroundごとに再付与する変異を対応試験で検出。任意の余裕係数を1下げれば必ず失敗すると誤要求しない |
| resource | work試験と独立してoperation/cleanup/name/payload/peak FD/管理allocationを計数。失敗後もprepaid cleanup、一度だけ解放、未完了は成功禁止 |

成功/失敗prefixの全範囲試験は小さなshapeで行い、大きなshapeは境界/構成を変えて検査する。巨大テストの回数や時間を無制限に増やして上界を証明したとしない。既存固定セット/旧model契約を変更しない。

## 9. 次の実装単位と承認待ち

1. **費目別の合成計数と式の独立検証**：まず現行核へ対応する計数試験を整備し、§5の係数・prefixを確認する。新しい係数を受付へ先に接続しない。
2. **shape/profileと純粋計算器**：収集方式と費用、sealed binding、integer算術・model不一致・failure保持を具体化する。既存index/record profileを勝手に拡張しない。
3. **3round resource台帳**：with_boundaryは現在scanごとにLedgerを新規生成し、合成quotaを各回指定する。共有work/payload/EINTRの成功試験は、operation/name累積枠や運用quotaの承認ではない。
4. **I/R/Oの全体合算と予約**：未計数費を解消し、初回Readyでの実施済みphase控除と独立resource受付を設計・検証する。ここまで全体受付は無効。
5. **型付き通常strict bridge**：ClosureRequestは現状ScanInputs/Readyを持たない。型・寿命・cleanup summaryの伝播を設計し、合成経路で前後厳密照合を維持する。OS/backend接続とpermit発行はさらに別承認。

本書の係数の独立検証、費目所有の承認、profile収集方式、submodel ID、運用quota/ancestor policy、blocked I/Oのhard停止、更新lease/ABAと全検査後差替え防止、hostへのcleanup票は未確定。これらを省いた「受付済み」「本番ready」は出さない。

## 10. draft-0.1/0.2作成時の文書確認（履歴）

追加設計書と親2文書の相対リンク58件について参照先ファイルの存在、code fenceの対応、末尾改行と`git diff --check`を確認した。sourceコードの変更はないため、Rustビルド・テストは再実行していない。

§7のshapeを候補式へ代入する算術確認では、groups54/route47/walk1278/enumeration342/file183/control38/seal36/tail21（r=0）の計**1999 work**だった（draft-0.1式）。draft-0.2のgroups min式ではc_0=3・min(P=3, E−c_0=2)=2によりgroups51、計**1996 work**となり、引き続き実測1902以上である。既存実測1902を上回るが、これは算術上の一点照合だけで、係数の独立計数・拒否prefix・大規模shapeの証明ではない。既存1902の実測を今回再実行したとも主張しない。§8の合成検証は未実施のままである。

## 11. 費目別合成計数と独立oracle（draft-0.3）

[検証記録](E2E_BEST_PRACTICE_R2_OL03_COLLECTOR_WORK_ACCOUNTING_SYNTHETIC_2026-10-20.md)。`cfg(test)`限定で、元Budget::workが実際に加算したunitを現在の所有者へ記録する。課金後guardで取り消されたunitも保持し、課金前のLimit/取消は加算しない。nested ownerはRAIIでerror時にも復元し、collector外のprepare/AfterScan/FinalIndexを記録しない。非testビルドにはobserver state/注入hookを含めず、製品課金と停止処理は変更しない。

基本fixtureはcontrol52/groups49/route46/walk1223/enumeration322/file174/seal36、計1902、未割当0。実費総和を元budget deltaと照合する。候補式はgroups min式を維持してcontrol訂正後 **2017 work**（r=0）。総和1996が1902を覆っていても、費目ごとの38<52を見落とすため、費目と総和の両方を検査する。

算術oracleはcollectorのgroups/route/旧scan_work計算器を呼ばず、fixtureのentryから別途BTreeMapで親別子数とdepth/chunkを導く。これは算術経路の独立性であり、別作問者・人手ブラインド評価や数学的全入力証明ではない。oracle準備は試験setupであり、課金済みprofile収集の実装ではない。

10種類のshape×3roundで実費と費目別上界、全876 source点の取消/期限、各非cleanup点の失敗/各cleanup点の解放不明、全1902の不足work prefix、課金直後の選択14点の取消/期限を確認した。data/EOF双方のretry0/1/8/9、3roundで共通EINTR8の枯渇も検査した。成功shapeの相対depth64とwidth128までを扱うが、最大N/最大file/全ABI応答の網羅は未実施である。

work合計の監査と運用受付は別であり、3round operation/name台帳・運用quota producer・全体other上界・hard停止・OS/通常strict bridgeは依然未対応。§9の順序を維持し、次はsealed shape/profileと計算器・その収集/算術費の設計から進める。

## 12. sealed shape/profileの後続詳細設計と収集subset

[sealed profile・純粋計算器draft-0.3](BEST_PRACTICE_BP5_R2_OL03_SEALED_SCAN_PROFILE_DESIGN.md)に、count-only一時集計→scalar-only出力、receipt/Inputs/round/token/budget結合、one-shot消費、統計収集 `11+2N+5E+K+B+M+D` と15-row算術（require込み20 work）を整理した。収集とrequire（基本61/5 work）に加え、profile消費型計算器20 work・estimateも内部実装/合成検証済み。利用bridgeは未実装であり、§11のkernel実費や上界へ既に含まれる費用ではない。S.groupsの検査とその費用を控除せず、O.profile/O.calculate/O.useとして別に扱う。[収集合成記録](E2E_BEST_PRACTICE_R2_OL03_SEALED_SCAN_PROFILE_SYNTHETIC_2026-10-21.md)・[計算器記録](E2E_BEST_PRACTICE_R2_OL03_SCAN_CALCULATOR_SYNTHETIC_2026-10-21.md)を参照。全体受付は無効のまま。

後続の[estimate bridge設計draft-0.2](BEST_PRACTICE_BP5_R2_OL03_ESTIMATE_BRIDGE_DESIGN.md)で、ScanInputs側の単調な利用状態、O.use7、直接/二重collectを拒否する入口O.dispatch1と固定kernelの境界を具体化した。Sのlayout/groups/seal/終端費は控除せず、AfterScan/FinalIndexはIへ残す。basicの将来目標はS＋use＋dispatch=1910、profile＋calculate＋use＋dispatch＋S=1991。旧1909/1990はdispatchを除く値で、いずれもbridgeを実装/計数した結果ではない。既存kernel実費/係数とは別に入口費を加算し、3round resource受付・全体予約は無効のまま維持する。
