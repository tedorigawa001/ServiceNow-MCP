# WF-B (C)：同snapshot読取接続の所有・停止契約の差分設計

差分設計追記（2026-11-08）: [同canonical fileの供給表・非実行viewと移譲責務](BEST_PRACTICE_WFB_CANONICAL_SUPPLY_VIEW_DESIGN.md)で、同prepared／borrowに結合する全file表・viewの準備claim、非実行移譲claimの消費点、pending／holder・close時の破棄と診断保持を具体化した。開始claimと下位claimを分け、非実行の退役をresource cleanup確認にしない。設計のみでCのkernel／実budget接続は未実装のまま。

詳細設計追記（2026-11-08）: [共通読取kernelへのprivate供給境界](BEST_PRACTICE_WFB_PRIVATE_KERNEL_SUPPLY_DESIGN.md)で、同canonical fileと同snapshotの期待値・独立した合成bytes表、共通化module境界・一度限り移譲・失敗時の所有と停止を具体化した。設計のみで、共通kernel抽出・供給・読取接続は進めていない。

Version: draft-0.4 / Date: 2026-11-08 / 読み取り照合基準HEAD: `e662a21` / レビュー修正の基準HEAD: `a4fd836`・`aa6477e` / 開始準備実装基準HEAD: `9b7ddb9`。

draft-0.3のレビュー修正: 供給生成失敗では読取側をunusedのまま保ち、close時のreadStop／readFirst=supply_closedは同constructionが開始claimを発行した後だけ記録すると§10に明記した。生成失敗後や開始claim前の誤用後のcloseは停止診断を追加しない。実装（合成fake）と試験もこれに合わせ、終端後prepare・close由来のrejected・失敗後readonly checkの対照を追加した。[検証記録](E2E_BEST_PRACTICE_WFB_SNAPSHOT_READ_START_2026-11-08.md)。

draft-0.3: §10の先行診断owner・private borrow・identity・一度限りの開始claimを新合成rootで実装した。[検証記録](E2E_BEST_PRACTICE_WFB_SNAPSHOT_READ_START_2026-11-08.md)。既存Supply／(B)のkernelへの接続、実読取・cleanupは進めていない。

draft-0.1のレビュー修正: 読取側`stopReason=supply_closed`を、現行Supplyがclose後のcheckに返す同名の非記録戻り値と別物だと明記した（§4／§6）。cleanup custodyの固定1slotを開始順序の先行確保対象に加え、確保失敗をopen0の固定拒否としてSL03へ含めた（§3／§5／§8）。§6のcleanup行で、試行全体の`cleanupReason`（`none`／`close_unconfirmed`）とfile slotの`cleanup`（`closed_confirmed`等）を分けた。設計のみで、実装状態は変わらない。

Status: **§10の新合成root内の開始準備・identity結合だけを実装。同snapshotから読取kernelへの接続は未実装。** 親は[private読取・hash設計](BEST_PRACTICE_WFB_PRIVATE_READ_HASH_DESIGN.md)と[固定辞書供給設計](BEST_PRACTICE_WFB_FIXED_DICTIONARY_SUPPLY_DESIGN.md)。既存[(B)の候補確定・容量契約](BEST_PRACTICE_WFB_SCRATCH_CANDIDATE_DESIGN.md)を維持する。[最大8MiBの合成検証](E2E_BEST_PRACTICE_WFB_READ_HASH_CAPACITY_2026-11-08.md)は独立assemblyの保証であり、同snapshot接続済みの証拠にはしない。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。draft-0.1／0.2はMDのみ、draft-0.3の実装は§10の準備fakeだけ。実期待値pin・実source照合・S発行・core接続・実接続・実通信・設定変更・Pushは行わない。§10以外は設計契約であり、既存APIや実行権限を追加したものではない。

## 1 現行との差分・非目標

現行の`source-map-supply-fake.ts`では、非公開SupplyがMapSupplySnapshotと検査済みmapを所有し、facadeはcheck／close／inspectだけを返す。checkはprivate結合を調べるだけで読取を行わず、close／rejectはsnapshotを即時retireする。一方、`read-hash-fake.ts`の(B)は独自のfile配列・owner・予算を持ち、snapshotConnection／rowAggregationはnot_connectedである。

接続後は、同じconstructionの検査済みmapからprivate読取借用を作り、同じ読取・hash kernelへ渡す。供給を迂回する第2読取実装で試験を代替しない。kernel共有のmodule境界・機械的移動は実装時に別途確認し、publicなsnapshot／map getter、任意reader／supplier／callback、summaryからの再採用口を増やさない。

既存供給fixtureの`'a'.repeat(64)`／10byteという模擬期待値を成功証拠へ転用しない。接続用には、実sourceとは無関係な合成bytes・静的期待値・strict mapが整合する固定セットを別に用意する。既存セット・旧試験は保持する。セットID、file／row集合と独立digestの対応を検証するまで「供給接続成功」にしない。

行hash／辞書全体hashの集約、実source供給・OS resource・実時計・実費モデルは本差分の実装範囲に含めない。接続時点でも全rowはnot_aggregated、mappingはshape_only、implementation・missing・5 gaps・実E／SはUnknownのままとする。

## 2 同一性・所有者と借用

| 内部対象案 | 所有・結合 | 退役と禁止事項 |
|---|---|---|
| SupplyReadLifecycle | 同Supply construction、同snapshot、固定読取利用状態、停止latch、先行診断と結果保持slot | sourceの停止と読取の停止を統括。snapshotの再生成・budget resetで復旧しない |
| SnapshotReadBorrow | 同snapshot／reviewSetId／検査済みmap／files／rows、同lifecycleと読取session origin | private継続内だけで借用。copy／別版・元の未検査DATAをcanonicalとして使わない |
| ReadSessionOwner | 借用、結果slot、固定ops／clock／cancel、同一の共有budgetと開始期限 | 1constructionで最初の読取開始試行だけ。終了後の別session作り直しは今回認めない |
| FileReadScope／candidate | 同borrow／session／canonical file参照／ordinal／resource、候補のprivate発行元 | ID・path・digestが等しくても参照混入を拒否。候補はclose／post前に受理しない |
| SupplyReadResultOwner | 供給・lifecycle・read・cleanupの固定診断、file計数／結果、終端状態 | 借用退役後も非実行結果を保持。本文・snapshot／resource参照を公開しない |

検査済みmapそのものと、その同files／rows、および`files[ordinal]`の同要素を使用する。値coreのcopy／freezeをもう一度呼んで同値の別mapを作る経路は、値検査として合法でも「同snapshotのcanonical参照」としては不適合である。borrowを使う各固定入口・候補受理直前で、このtupleと同budget／sessionの組を検査する。

停止latchとidentityは別物である。closeで通常利用権が失効しても、cleanupに必要な旧borrow／scopeの同一性は破壊しない。cleanup専用経路だけが旧参照を保持でき、新しいread／observe／final／候補受理に流用できない。通常入口では停止を先に分類し、正規のcloseを「別snapshot混入」と誤分類しない。

borrowの退役とSupply所有snapshotの退役も分ける。正常な読取終端では読取借用だけを退役し、Supplyが開いている限り既存のreadonly check用snapshotは保持できる。ただし読取利用状態は消費済みで、第2読取を許さない。close／供給失敗がある場合は、active借用の退役後にSupply側のsnapshotも退役する。

## 3 開始受付・重複開始拒否

状態は供給側`open → closing → retired`と、読取側`unused → starting → active → unwinding → terminal`を別々に持つ。生成失敗はstartingからunwinding／terminalへ進む。正常読取でもterminalからunusedへ戻さない。close前に一度も読まない場合はunusedのまま供給側がretiredとなり、後続開始を拒否する。

固定開始順序は次とする。

1. 同constructionの上位診断／結果保持slotと、§5の非公開cleanup custody固定1slotを、借用・resource取得より先に準備する。いずれかが作れなければ読取を始めず（open0）、既存の供給側失敗診断へ固定拒否を残す。resource取得後にcustodyを追加確保しない。OOM時の必着保証はUnknown。
2. 供給がopenで、既存の供給失敗がなく、読取利用状態がunusedであることを確認する。同じ同期区間でstartingへ遷移し、生成の再入・第2開始を禁止する。
3. 同snapshotのprivate継続から検査済みtupleを借用し、参照・合成セット・shapeを検査する。借用・生成失敗でもunusedへ戻さない。
4. 同sessionのbudget／期限・固定依存・scratch・結果slotを準備し、最後のbinding／停止guard後にactiveへ進める。active受理前のopenは0。
5. activeから既存kernelの固定順読取を開始する。fileごとにbudget／期限を再生成しない。

readonly checkの反復許可は維持するが、read開始権を発行する操作にはしない。read利用状態はreadonly DATAのone-shot化やK0/Eのcredit claimではなく、同constructionの読取開始試行の排他・再利用拒否である。将来の再検証は新しい明示契約を要し、今回の自動retryや別session fallbackに含めない。

starting／active／unwinding中の第2開始は、open・hash・budget生成0で拒否する。同時にlifecycleへ最初の`duplicate_start`を固定し、元sessionも通常利用を停止してunwindするfail-closed方針とする。最初の読取診断がなければbinding違反を保持し、既存のhash故障等は上書きしない。繰返し要求で診断listやcounterを無制限に増やさない。terminal後の第2開始は固定`read_already_used`を返すだけで、確定済み結果を変更しない。

## 4 読取中closeの同期停止

close要求の同期区間は、同lifecycleのcloseRequested latchを一度だけ立て、供給状態をclosing、新規通常利用を禁止することで終える。ここにclock・外部通知・任意callback・await・snapshot消去を置かない。close戻り値は「要求固定済み」であって「cleanup完了」ではない。反復closeは同じ要求を示し、close回数や返却枠を増やさない。

| closeを観測した位置 | 次に許す処理 | 受理・退役 |
|---|---|---|
| read開始前、active借用なし | 読取開始を拒否。resource処理なし | Supply snapshotを即時論理退役できる |
| starting、まだopenなし | 準備済みの固定参照を破棄し、生成拒否を保持 | 借用があれば退役後にSupply snapshot退役。open0 |
| 通常操作pre前／操作間 | 次のopen／read／observe／final／受理を開始しない | 既存scopeの固定cleanupへ進む |
| read→受信計上→hash update受理区間内 | 妥当な返却payloadは同scratchで1回課金・updateしてからpostで停止を観測 | 途中へclock／cancel／close callbackを挿入しない。候補は未受理 |
| digest比較後、candidate／recordは暫定 | 予約済みcloseと固定discardのみ | 既にclose確認済みなら再closeしない。candidate／recordを受理しない |
| 一部file受理後 | 確定済みfile観測を保持し、残fileへ進まない | session停止と未開始／incompleteを保持 |
| 全file受理後、最終終端前 | file hash_matchを保持し、終端を停止として確定 | 後着停止を内容不一致へ書き換えない |
| 終端後 | 読取処理なし。Supply自身の未退役参照だけを退役できる | 既存読取結果／診断は不変 |

「同期停止」はcloseが戻る前に停止要求を固定する意味で、実行中の同期hashやnative処理を強制中断する保証ではない。単一JS実行文脈でcloseが実際に呼べる位置と、固定合成scriptで停止latchを変える位置を試験で区別する。任意の外部hookを受理区間へ導入しない。

停止理由は正規closeを取消へ丸めず、lifecycleの`close_requested`と、読取の固定`stopReason=supply_closed`（新規内部理由案）を保持する。現行Supplyの理由型にも同名の`supply_closed`があるが、これはclose後のcheck／acceptが返す戻り値で、Supplyの先行理由へは記録されない。読取側の停止理由はreadStopにだけ記録する別の値であり、両者を同一の診断として照合・集計しない。未完了中は先行primaryがなければ同理由を記録し、全file受理後は内容primaryを変えず終端をstoppedにする。これは現行(B)のreason unionへの実装済み追加ではなく、接続時に型・model・試験を更新すべき差分である。

## 5 cleanup後の借用退役と終了責務

固定順序は「通常利用停止 → 進行中の受理区間を終える → 同scopeのcloseを予約内で最大1回試す → 暫定candidate／record／hash参照をdiscard → 診断／計数とcleanup責務の保持を固定 → 最終checkpoint → 結果の一度限り確定 → 読取borrow退役 → close／供給失敗時はSupply snapshot退役」とする。結果確定後の退役はcallback／allocationを伴わない固定参照消去と状態置換だけに限定する。

cleanup未確認はこの順序から消さない。未取得はno_resourceでclose0、取得済みはclose1、未確認はclose_unconfirmedを保持する。停止／時計異常で予約closeをskipせず、自動close retryも行わない。未使用予約を返せるのは明示的な未取得だけで、未確認を未取得扱いしない。

合成resourceで未解決の責務を残す場合、先行確保した固定1slotの非公開cleanup custodyへ同tokenと診断を移し、通常borrowとは切り離す。このslotは再読取／再受理・第2closeの権限を持たず、外へresourceを返さない。最終construction discardで論理退役できるが、それを解放確認と呼ばない。borrowを消す前に責務保持が成立しなければ退役完了を報告せず、終端診断を未確認にする。

このcustodyは実FD／OS handleの外側回収・隔離設計ではない。実resourceの未解決責務を、JS参照消去だけで処理できるとはしない。実adapter採用時の寿命と回収は別設計までUnknown。最終checkpoint失敗でも、保持済みの先行理由・受信量・hash済prefix・file観測・cleanup未確認を捨てない。

正常読取の終端結果は不変の非実行診断のみ。close／失効後のcheck・開始・候補受理が、同値copyや結果summaryからborrowを再生成することを禁止する。供給ownerのretire回数と読取borrowのretire回数を別々に計数し、それぞれ最大1を確認する。countは物理ゼロ化・GC・native解放の証明ではない。

## 6 診断保持・固定理由の対応

| 保持slot案 | 先行理由・更新方針 |
|---|---|
| supplyFirst | 既存supply_invalid／binding_mismatch等を最初の1件として保持。read故障やclose要求で上書きしない |
| lifecycleFirst | read_prepare_unavailable／binding_mismatch／duplicate_start等の最初の拒否。closeRequestedは別latch |
| readFirst／readStop | (B)の先行primary／後着制御停止を維持。正規供給closeにはsupply_closedを追加する案 |
| cleanupReason／cleanupTiming／file slotのcleanup | 試行全体の`cleanupReason`（`none`／`close_unconfirmed`）、期限内確認、file slotごとの`cleanup`（`no_resource`／`closed_confirmed`／`close_unconfirmed`等）を分離。close要求固定やborrow退役をslotの`closed_confirmed`へ昇格しない |
| terminalDisposition／retirement | 観測済み／停止／責務未確認と、borrow／snapshot退役を分離して保持 |

供給binding不一致が読取開始前ならopen0、供給側の先行理由を上位結果へ保持する。active中の供給不適合なら通常利用を停止し、read側のbinding診断とcleanupを残してから退役する。hash_unavailable後にcloseが来れば、readFirst=hash_unavailable、readStop=supply_closed、cleanupは実際の確認状態を別々に残す。先に取消があればreadStopの最初の取消を保ち、closeRequestedも別に観測できるようにする。

結果に出せるのは固定ID・有限状態・計数・固定理由だけ。source本文・path全文・認証情報・raw例外・borrow／snapshot／resource参照は出さない。全hash一致でもready=false／authority=noneを維持する。終端後の要求は固定拒否を返せるが、保存済み終端への診断追記や再封印はしない。

## 7 費目所有・追加上界の受付条件

借用・固定結果owner／custody準備・identity検査・開始claim・停止latch・退役は供給接続側、read／hash／受信／retry／resource close予約は同ReadSessionOwnerが所有する。共有budgetは参照を結合するだけでcopy／再生成しない。close要求の反復は新しいI/O・cleanup予約・creditを発行しない。生成前費用・確保失敗を未取得Eへ後着課金しない。

131,524は(B)読取単独のguard上界である。接続版では開始受付、各固定binding点、失効／close観測、終端・退役前checkpointを有限操作表へ追加し、`G_connected ≤ G_B + G_start + G_binding + G_terminal`として独立計数する。行集約はさらに別費目であり、この式に実装済みとして含めない。既存deadlineを残時間から作り直したり、追加guardを収めるために延長したりしない。

既存readonly checkの任意回反復を、読取内部の有限scheduleへ持ち込まない。接続内部で呼ぶ検査点は固定表で数え、外側readonly APIの費用とは区別する。追加検査数・guardと結果準備／退役の有限上界が確定するまでは、接続実装の受付条件未充足。全heap／native費・実E／SはUnknownを維持する。

## 8 独立合成受入条件（未実施）

| ID | 対照と必須判定 |
|---|---|
| SL01 | 同snapshot／map／files／rows／canonical fileと、別snapshot・同値copy・元DATA・版混入を対照。開始前混入はopen0、受理直前混入は候補未受理 |
| SL02 | readonly check反復とread開始を分離。starting／active／unwindingの第2開始は新規budget／open0、元runは停止。terminal後の再開始は固定拒否で既存結果不変 |
| SL03 | owner／cleanup custody slot／borrow／結果slot／scratch準備の各失敗prefix。custody確保失敗はresource取得前のopen0固定拒否。開始権をunusedへ戻さず、部分参照・診断を保持して退役し、未開始open0 |
| SL04 | closeを開始前・準備中・payload前・read中の合成停止点・digest後・close確認後・post直前に配置。停止固定と解放完了を区別し、通常操作再開なし |
| SL05 | read中のcloseでも返却payloadを同scratchで1回課金・updateし、区間内hook／guard0。次read／final／受理は0。hash故障＋closeの二軸保持 |
| SL06 | 部分file確定後／全file確定後／終端後のclose。確定済みhash_match保持、未完了と後着停止を区別。終端後の結果追記・二重退役なし |
| SL07 | no_resource／close成功／throw／未確認／時計異常と反復close。予約保存則、close最大1、借用保持中のsnapshot早期退役なし、custodyの未確認保持 |
| SL08 | supply・lifecycle・read・cleanupの複数故障を異なる順で配置。固定理由の先行保持、秘密非出力、結果ownerを先行確保できない場合はI/O0 |
| SL09 | 本体と別記述した寿命イベントoracleで、停止latch→cleanup→結果確定→borrow退役→snapshot退役の順を照合。各費目とguard上界も独立計数 |
| SL10 | (B)の既知vector・8MiB成功／境界試験と接続試験が同じ読取kernelを通ることを確認。旧供給・(A)試験を保持し、梱包・実source／runtime／S／core非接続の負の対照 |

private参照の混入やread内停止は固定内部scenarioに限定し、通常入口から任意の参照・callbackを入れられるとは主張しない。実nativeの途中停止や並列呼出しの保証は試験対象外。

## 9 次の段階

最初の実装候補は、先行診断／結果保持、private borrow／identity tuple、排他的な開始利用状態と同期close latch、cleanup後の借用退役までを合成依存限定で実装すること。共通kernelの共有範囲・整合した合成セット・追加guard表をその範囲に合わせて確定する。

行のfileId＋testsの和集合、未参照fileも含む辞書全体hash、混在非成功の判定順・集約費は後続設計に残す。今回のMDはこれらの実装・接続・試験完了記録ではなく、SL01〜10も未実施である。

## 10 開始準備だけの新合成root（部分実装）

`tests/review/fixtures/snapshot-read-start-fake.ts`を追加した。既存Supply class／MapSupplySnapshot・(A)・(B)は変更しない。既存のstrict SourceMapDraft純粋値検査だけを再利用し、実行coreには接続しない。新合成rootは固定4file／12rowのstrict mapを検査し、自身が所有する非公開SnapshotとBorrowを生成する。旧Supplyから借用した保証や、(B)の読取kernelとの共通化保証ではない。

先行DiagnosticOwner → 結果保持slot → 空のcleanup custody 1slot → 合成source／strict検査／snapshot、の順で準備する。いずれかの生成故障ではsupplyFirst=supply_invalidを固定し、開始・openを拒否する。owner自体の固定故障ではscalar fallback診断を残すが、実OOM時の返却必着は保証しない。

facadeはcheck／begin／prepare／close／finish／inspectのみ。factoryは引数0個か固定scenario文字列1個、begin／prepareは引数0個だけを受ける。外部map・borrow・budget・reader・callbackを取り込む入口はない。beginはunusedからstartingへ同期的に1回遷移する。prepareは同owner／snapshot／setId／map／files／rows／先頭canonical fileとordinal0／session origin／budget originをprivate tupleで検査し、非実行preparedへ進める。

preparedは§3のactive読取とは別で、scratch・実budget・read／hash kernel・resourceは作らない。budget originは同一性検査用のopaque tokenで、cap／期限・credit・E／S・実budget leaseではない。4file全件のscope生成や候補受理時bindingは後続。全12rowはunimplemented／missingを保持し、行集約はしない。固定abcの合成期待値は使うが、bytes取得・hash照合を実行した証拠にはしない。

starting／preparedの再beginとpreparedの再prepareはduplicate_startで拒否し、元準備もunwindingへ停止する。生成失敗・混入後は先行理由で拒否し、同owner内のorigin／borrowを再生成しない。finish後の開始／準備はread_already_usedという非記録戻り値だけを返し、既存終端を変更しない。prepare前のfinishも固定discardとして読取利用を終了するが、開始claimや読取成功は発行しない。

混入は固定内部scenarioのみで、別owner／snapshot、同値map wrapper／再decode、files／rows／file copy、元の未検査input、setId／ordinal／session／budget差とborrow copyを検査する。元inputは当該対照だけで実際の検査前DATAを保持し、finishで退役する。borrow copy等の負対照用control objectは発行済みborrowに数えず、borrowRetirementsは同constructionで発行したborrow 1つの論理退役を数える。対照用copyも参照を残さない。

本段階のcloseはresourceのない準備状態だけを扱う。closeRequestedを固定し、借用済みならsnapshotを保持してunwindingへ進める。readStop／readFirst=supply_closedの記録とunwindingへの遷移は、同constructionが開始claimを発行済みで終端前の場合に限る。供給生成失敗は読取側をunusedのまま保ち、生成失敗後・開始claim前の誤用後のcloseは停止診断を追加しない。finishで非実行終端を固定後、borrow／session／budget参照を退役し、close要求時はSupply側snapshotも退役する。正常discardではreadonly供給用snapshotを保持できるがread開始claimは戻さない。終端後の供給closeはsnapshotだけを退役し、終端診断を変更しない。

終端のpreparationCountsは開始準備の試行・発行計数だけを保持し、固定参照消去後のretirement計数はinspect側のowner診断へ分ける。これにより退役後の結果再生成・再封印を行わない。cleanupDisposition=not_started、open／read／hash／cleanup呼出し0を維持し、空custodyの存在をcleanup確認や責務移譲済みの証拠にしない。

診断slotはsupplyFirst／lifecycleFirst／readFirst／readStopを分離し、最初の理由だけを保持する。現行Supplyのclose後checkの非記録supply_closedは変えず、新rootのclose中準備に記録するreadStop=supply_closedと区別する。正規生成のsource検査・snapshot・開始claim・session／budget origin・発行borrow・identity検査・準備recordは各最大1、cleanup custodyも固定1slot。負対照用の再decode／copy生成はその正規counterに含めず、実work費の計測済みとは扱わない。故障後の同じ操作反復では計数やlistを増やさない。readonly checkは外側の非I/O操作で、新規claimやoriginを発行しない。

snapshotConnection=identity_only、legacySupply=unchanged、readKernel／actualBudget／rowAggregation=not_connected。実clock guardは呼ばず、(B)の131,524や接続全体のguard上界を検証済みにしない。追加guard表・共通kernel・実budget／scratchへのprivate接続、read中close／hash後停止、非空custodyへの責務移譲、行集約は未実装である。

SL01〜03の開始準備部分、resourceなしのclose／退役・診断保持を合成対照で確認する。SL04〜10全体の完了保証ではない。試験・厳密型検査・梱包の範囲と未確認事項は[開始準備の検証記録](E2E_BEST_PRACTICE_WFB_SNAPSHOT_READ_START_2026-11-08.md)へ分けて記録する。
