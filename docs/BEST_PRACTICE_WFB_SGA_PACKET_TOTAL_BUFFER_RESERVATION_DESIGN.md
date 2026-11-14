# WF-B SG-A後：packet総量の保守算定・部分bufferの予約境界

Version: draft-0.1 / Date: 2026-11-14 / 読取り基準HEAD: `fa169bf`。

Status: **文書・定数の算定と予約契約案のみ。LOAD6／LOAD7の選択・format・容量capは未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[variant別byte積上げdraft-0.2](BEST_PRACTICE_WFB_SGA_VARIANT_BYTE_BOUND_DESIGN.md)と[固定schedule設計draft-0.2](BEST_PRACTICE_WFB_SGA_FIXED_SCHEDULE_SLOT_ENCODING_DESIGN.md)。[strict field契約draft-0.3](BEST_PRACTICE_WFB_SGA_RECORD_FIELDS_ENCODING_DESIGN.md)のCounts上限超過をencoding前に拒否する条件を含め、完成line総量と部分bufferの受付条件を対にする。本書は実allocator・encoder・台帳・証拠issuer・保存経路を実装しない。

## 1 算定前提と適用できない場合

対象は同版のstrict値、固定record順・個数、ASCII限定JSON、recordごとのLF1byteである。共通Idの出現を省略・dedupせず、JSON配列wrapper・BOM・indent・外側metadataは追加しない。値域やformatが変われば同じ上界を流用しない。

Counts 175byteを含むSUM／TERMの上界は、各fieldがprofile別上限以下という受付に依存する。U64型に収まるだけで上限超過を通さない。拒否された値はclip・桁切詰め・別profileへの切替で救済せず、先行Failureと未encoding責務を保持する。必要な厳密値を作れなければ架空のrecordを出力しない。

記号U_indは独立field最大からの保守上界、U_relは一部関係制約を加えた上界。どちらも全recordが同時にその長さへ達する合法packetの存在を主張しない。合法最大M_C、実provider／clock・private bindingの裏付け、実行承認は別である。

## 2 packet総量の保守算定

親のLF込み上界をH=1,428、S=1,125、L=909、I=493、SUM=1,250、TERM=1,507byteとする。

- LOAD6 PrePacket：`1,428 + 6×1,125 + 5×493 + 1,250 = 11,893byte`。
- LOAD7 PrePacket：上記＋Lの909＝`12,802byte`。
- TERM込み：LOAD6 `11,893 + 1,507 = 13,400byte`、LOAD7 `12,802 + 1,507 = 14,309byte`。

| 項目 | LOAD6 | LOAD7 | 意味 |
|---|---|---|---|
| PrePacket line数／LF数 | 13 | 14 | TERMを含まない |
| PrePacket U_ind | 11,893byte | 12,802byte | 起動前の完成packetの保守上界 |
| TERM込みline数／LF数 | 14 | 15 | 各lineの末尾LFを一度だけ含む |
| TERM込みU_ind | 13,400byte | 14,309byte | 完成line集合の保守上界。送信／保存成功ではない |
| TERM込み、LFだけを除く検算値 | 13,386byte | 14,294byte | 実formatではLFを削除しない |

TERMは別の封印時点のrecordであり、PrePacket受理後のpacket bytesへ追記・再通知しない。「TERM込み」は長さの集計範囲であって、一度のpacket受理でTERMも受理されたという意味ではない。

### 2.1 一部制約を反映する参考上界

SUMのbusy／区間state関係で23byte、TERMのreceipt／h関係で25byte狭まるという親の算定だけを適用する。

| 範囲 | LOAD6 U_rel | LOAD7 U_rel | 未確定部分 |
|---|---|---|---|
| PrePacket | 11,870byte | 12,779byte | SUMの残る関係、各recordの同時成立等 |
| TERM込み | 13,352byte | 14,261byte | 上記＋nAck・時刻・attempt・診断・封印時点等 |

この参考値も合法最大ではない。予約境界の基準案には一段広いU_indを使い、U_relだけへ縮める実行切替は行わない。将来縮小する場合は必要な全制約の受付・source coverageを同じ版へ結合し、別レビューする。

### 2.2 旧32KiBとの比較の限界

`13,400 < 32,768`、`14,309 < 32,768`は候補formatの完成line長についての定数関係で、差は19,368／18,459byteとなる。これは旧32KiB capの承認・本番投入・実memory適合ではない。差分を入力draft・copy・別trial・再試行・未導出費へ自由に使う権限も生じない。

旧25,088／27,136byte等の配賦とはfield／formatの版が異なるため、実測のmemory削減率や処理時間の改善率を比較しない。実work・R内encoding・返却後100msとの両立はUnknownのまま残す。

## 3 部分buffer予約の対象と四つの量

| 量 | 定義候補 | この算定から保証しないもの |
|---|---|---|
| 完成line長 | 正規recordを全て出力したbyte数 | 途中失敗時のbuffer確保量・copy数 |
| 予約credit B[j] | record slot jに先取りする論理的な出力byte枠 | OS／allocatorが同じ量だけ確保すること |
| live backing容量 | 実際に保持する出力用allocationの容量 | view長だけでは不明。pool全体やhidden copyの除外不可 |
| confirmed prefix／未確認extent | 完了確認済みtoken末尾／途中writeの可能性のある範囲 | throw時にcursorだけから実書込量を断定しない |

候補は**recordごとの独立した予約を、workspaceから成功slotへ同じbackingのまま昇格する方式**とする。buffer取得機構・allocator・APIの採用は未承認。論理予約を立てたことを、実allocationの事前上界を証明したことにしない。

## 4 同owner・同slotの先行予約案

全recordのB[j]はそのkindのU_ind（LF込み）とし、LOAD6は14slot、LOAD7は15slotに事前対応付ける。予約表は同root／trial／plan／pin／profile／schema版と同record順へ結合する。外部から任意capやcallbackを登録する入口は作らず、このMDをpermit／claim発行の承認にも使わない。

| record予約 | B[j] | 件数 LOAD6／LOAD7 | 条件 |
|---|---|---|---|
| H | 1,428 | 1／1 | 共通identityとstrict入力が揃う |
| S | 1,125 | 6／6 | 固定S0〜S5。別slotへ流用しない |
| L | 909 | 0／1 | LOAD6には予約対象自体を置かない |
| I | 493 | 5／5 | 固定I1〜I5 |
| SUM | 1,250 | 1／1 | Counts上限・封印前prefixを確認 |
| TERM | 1,507 | 1／1 | PrePacketとは別の一度限りencoding |

全slotの予約和R_totalは13,400／14,309byte。これは出力用の**論理予約案**で、同量の物理bufferを今回用意したわけではない。未開始slotのcreditを、失敗したrecordのgrow・retry・TERM用の第二workspaceへ流用しない。

reserveとallocateを分離する。割当て／表構築が途中で失敗したら先行Failureへ保持し、新しい予約表や緩いprofileで再開しない。実bufferを取得する前に同owner・同slot・残予約・停止・一度限りclaimを検査し、claim消費後のbuffer取得失敗でも再試行へ戻さない。

## 5 writerへの受付・書込み前境界

| ID | 境界契約案 | 失敗時の固定処理 |
|---|---|---|
| BR01 | strict sealed入力、schema／Counts／同slot・同予約・同ownerを照合 | encoderを呼ばず、未encoding責務と先行理由を保持 |
| BR02 | B[j]とrecord claimを一度確保・消費してから、固定容量のbackingを取得 | allocation throw／部分生成でもclaimを復元しない |
| BR03 | writerが触れるregionとbacking容量の対応を確認。grow・poolの未計上領域・hidden copyを適合扱いしない | 未確認ならwrite開始不可。既に生じたallocation責務は消さない |
| BR04 | token byte数nを固定規則から先に求め、`0≤cursor≤B[j]`と`n≤B[j]−cursor`を確認してから、そのregionだけへ書く | 超過tokenは書かない。切詰め・部分的な救済JSON・再確保なし |
| BR05 | tokenのwrite完了を確認した時だけconfirmed cursorを進める。token途中throwは未確認extentとして扱う | confirmed cursorまでしか書いていないとは断定せず、同B[j]のbacking全体を保持 |
| BR06 | object終端・LFまで完了し、正規長・入力不変・writer退出／write権限退役を確認 | 不足／停止／post不一致なら成功slotへ公開せず失敗保持 |
| BR07 | 同backingをencoded slotへ一度昇格し、workspaceのwrite資格を失効 | copyや再encodingで昇格しない。成否不明は責務保持 |

tokenは固定key／記号・検査済みASCII値だけで、外部objectのtoJSON／iterator／任意copy callbackを実行するものではない。巨大な完成stringを作ってからbyte長を測る方式、境界を越えてからbufferを縮める方式、record全体の再serializeはこの予約契約に含めない。

BR04の減算形は加算overflowを隠さないための候補で、整数範囲・nの算定・実write regionは別に検証する必要がある。copyが途中で失敗してもB[j]外へwriteしないことは、将来の固定writerの実装coverageが必要な前提であり、式だけで実証したとはしない。

viewの長さがB[j]以下でも、共有poolのbackingがより大きければその実保持容量を0へ除外しない。事後に容量超過を見つけて拒否しても、既に大きなallocationが生じなかった証明にはならない。実allocatorの要求量／実容量／一時領域を事前に保証できるかはUnknownで、物理memory cap充足のgateは閉じたままである。

## 6 一度限りの状態遷移・部分失敗

状態案は`empty → reserved → attempting → writing → encoded`、失敗側は`attempting／writing → failed_held`。retireはwriter退出・同backingへの全borrow・上位custodyの解放条件が確認できた場合だけの別終端とする。状態遷移は値契約案であり、台帳やwriterは未実装である。

| 発生位置 | 保持する状態・責務 | 許可しないこと |
|---|---|---|
| buffer取得失敗 | claim消費済み、allocationの有無／部分生成を保持 | 同slot再確保、別slotのcredit流用 |
| write前の容量拒否 | 既存prefixとreserved容量・先行理由 | token一部だけ出力して正規lineとすること |
| token途中throw／取消 | failed_held、confirmed prefixと未確認extent、同backing全体 | cursorまでを完全保持量と断定、次record開始 |
| post／writer退出未確認 | 公開しないbacking・borrow／write責務 | buffer clear／reuseで停止成功を捏造 |
| encoded成功 | 同backingを同slotへ昇格。長さと容量を別記録 | workspaceとslotを別allocationとして二重生成 |
| 通知throw／ack欠落 | 完成PrePacketの元参照・未受理custody | 失敗した通知のためのconcat copy／再encoding |

停止は新しいwrite／encodingを禁止する。同時に、既に始まったwriteの即時中断を保証したとはせず、退出未確認なら元backingとborrowを保持する。失効後の遅い復帰が新しいslotを復活させないよう同owner／同attemptの資格を退役させる。具体機構と費用は未接続のままである。

FS08のrecord jで失敗したら、そのbatchを停止し、次workspace・上位通知を開始しない。FS13のzとTERM封印は既存設計どおり残すが、TERM encoding（FS14）・z_postは行わない。TERM予約が未使用でも、失敗bufferの保持中に第二workspaceを作る根拠にはしない。TERM自身の失敗も同様に保持し、予備の診断JSONを追加しない。

## 7 出力用容量の条件付き不変式

予約表をfuture／active／encoded／failed_held／retiredの排他的区分へ割り当て、creditの和をR_totalに保つ。retiredは解放確認済みの場合だけであり、not_startedや受理未確認を解放済みへ数え替えない。別ownerへ移っても支出・prefixを0へresetしない。

同時active workspaceは最大1、各実backing容量≤そのB[j]、一つの実backingをworkspace→slotへ同一参照で昇格し、未計上copyを作らないという**将来の実装前提が全て満たされるなら**、出力用live backing容量は`Σ_live capacity[j] ≤ Σ_live B[j] ≤ R_total`となる。aliasは同じallocationを二重計上せず、異なるcopyは別allocationとして数える。

成功prefix＋失敗recordの部分backingを持つ場合も、それぞれが異なるrecord予約へ属するため、失敗workspaceをR_totalへもう一度足さない。ただしこれは失敗backingをB[j]内に抑えられることと、成功昇格でcopyを作らないことに依存する。未確認の実bufferをこの式の前提へ勝手に適合させない。

PrePacketのwire長はlineの論理連結である。上位へのprivate供給を固定segment参照表で表す候補なら、必ずしも連結bufferを作る必要はない。しかし連結copy・transport送信用copy・受領側copyが実際に必要なら、その分の予約・寿命・費用を別途先取りする必要がある。上位に渡ったという理由だけで元bufferやcopyの保持を無視しない。

この式が対象にするのは出力用backingだけで、Control／Timing／Failure／Receipt、sealed入力、未encoding TERM、raw scratch、参照配列・metadata、encoder一時領域・JS string・GC・native overhead、pin／終了ownerの状態は含まない。**最大同時保持・総memory上界は未確定**である。

## 8 後続の検証・費目への接続条件

BR01〜07はOP12／13／18／19に、reserve・claim・buffer取得・固定token長の計数・write・post・昇格・保持・退役として対応付ける必要がある。R内encodingの実費、token数／write回数、割当て費・退出確認費を今回確定しない。追加clock／再guardを暗黙に挿入せず、必要なら元scheduleと回数候補を別版で見直す。

次の最大同時保持表は、phase・成功prefix長・失敗record j・notify／receipt状態ごとに、同一allocationのalias、別copy、sealed値・未確認borrow、使用長と容量を分けて作る必要がある。完成wire総量が32KiB未満でも、この表や実allocatorの根拠を省略できない。

合法最大M_Cは引き続き未確定。packet上界の和が有限であることを、その長さに達する合法な単一trialがある証明、実providerの成功、終了確認、正式な証拠発行へ昇格させない。

## 9 後続の独立fake／oracle受入案（全て未実施）

| ID | 対照・故障 | 必須条件 |
|---|---|---|
| PB01 | LOAD6／LOAD7のline集計 | PrePacket11,893／12,802、TERM込み13,400／14,309。LF重複なし |
| PB02 | 一部関係を反映した参考値 | 11,870／12,779、13,352／14,261。合法最大や採用capとしない |
| PB03 | Counts上限超過・別schema／profile混入 | encoding前拒否。型だけのU64・旧上界へfallbackしない |
| PB04 | 同record／別ownerの予約・claim再利用 | 同slotに一度だけ。別credit流用なし |
| PB05 | 空／満杯／ちょうど残容量／1byte超過のwrite | 超過tokenをwrite前に拒否。LFもB[j]へ含める |
| PB06 | 各token途中throw、buffer取得・post失敗 | confirmed prefixと未確認extentを分け、全backingと責務を保持 |
| PB07 | 同backing昇格と別copyによる偽装 | 同一allocationの継続だけを予約内とし、copy費を落とさない |
| PB08 | FS08の各jで失敗・TERM封印 | 次encoding／TERM encodingなし。未使用TERM creditで再開しない |
| PB09 | 取消・退出未確認・遅い復帰 | clear／reuseせず、旧writerが新slotへ書けない境界を確認 |
| PB10 | backingがviewより大きい・concat／受領copy | 物理容量・copyを無視してR_total保証としない |
| PB11 | 受理済みだが元borrow未解放 | wire受理・停止・custody・解放を別状態で保持 |
| PB12 | 旧32KiB内・U_relの余り・合法最大未証明 | 総memory／実費／実行許可へ昇格せずUnknownを維持 |

独立oracleは固定line数とrecord上界の別集計表、予約の排他的な状態表、token境界の整数関係から期待値を与える計画とし、対象encoder／台帳helperを再利用しない。今回の作業は定数式の検算のみで、record生成・台帳／writer実装・合成試験・負荷採取は行わない。

## 10 未承認事項と今回の範囲

- [ ] strict field版・Counts受付を含むpacket算定前提のレビュー。
- [ ] record別予約・一度限りclaim・固定writer／昇格方式の承認。
- [ ] 実backing容量・copy・部分失敗／退出確認の証拠と費目coverage。
- [ ] 最大同時保持・総memory／実work・時間上界の算定。
- [ ] LOAD6／LOAD7と容量profileの選択、実装・合成確認・実確認・保管の個別承認。

全て未承認。本MDと親2文書の参照更新だけを行い、選択・format・容量capを採用しない。元の5秒期限・既定並列度、各閉鎖条件・全体受付無効・Unknown・調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは今回行わない。

文書整合として対象3文書のローカルリンク12件・表22個の列数、BR01〜07／PB01〜12のID連番、未承認チェック5項目、PrePacket11,893／12,802・TERM込み13,400／14,309byteと参考U_rel、LF数、record別予約和・prefix不等式・残容量ちょうど／1byte超過の定数関係、末尾改行と差分空白を確認した。文書と定数の静的検算のみで、encoder／予約台帳／writer実装・合成試験・負荷採取・試験再実行・部分bufferの実上界や最大同時保持の実証ではない。
