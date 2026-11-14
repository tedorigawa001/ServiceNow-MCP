# WF-B SG-A後：phase別保持・多重度と内部slotの最小値域

Version: draft-0.2 / Date: 2026-11-14 / 読取り基準HEAD: `1c21435` / レビュー修正基準HEAD: `28dec7e`。

draft-0.1のレビュー修正：数値の誤りはなかった。§6の費目入口にOP03（arm clock a）・OP04（S0〜S5予定slotの入場確認）・OP15（追加clock・境界記録・診断更新）がなく、§4のTiming／Control phase／Failure更新と追加clock14／15回の費目が対応付けられていなかった。また「receipt・上位custody」行がOP16／17（guard／call入口の分類）を当て、上位custodyの解放確認（OP19）とずれていた。Timing・phase・Failure更新の行を加え、receipt行をOP14、guard／call行をOP16／17、上位custody・固定退役をOP19へ分けた。選択状態・数値・保持表は変えていない。

Status: **対応表と内部値域の詳細設計のみ。LOAD6／LOAD7の選択・storage／writer方式・容量capは未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[同backing所有・writer退出／borrow退役draft-0.2](BEST_PRACTICE_WFB_SGA_BACKING_OWNERSHIP_WRITER_EXIT_DESIGN.md)と[固定schedule・slot設計draft-0.3](BEST_PRACTICE_WFB_SGA_FIXED_SCHEDULE_SLOT_ENCODING_DESIGN.md)。[出力予約draft-0.2](BEST_PRACTICE_WFB_SGA_PACKET_TOTAL_BUFFER_RESERVATION_DESIGN.md)と[strict field契約draft-0.3](BEST_PRACTICE_WFB_SGA_RECORD_FIELDS_ENCODING_DESIGN.md)の数値・wire形状を変更せず、保持の単位と内部slotの値域を対応付ける。型名は設計名であり、台帳・buffer・writerを生成するものではない。

## 1 単位・適用条件

PをPrePacketのrecord数（LOAD6=13、LOAD7=14）、N=P+1をTERM込みrecord数（14／15）とする。順序はH→S0〜S5→L（LOAD7だけ）→I1〜I5→SUM→TERM。jはこの順序の1始まりencoding位置で、record別B[j]は既存のLF込み予約を使う。profileは設計上の二候補であり、この記述で選択しない。

| 数える単位 | 同一性・多重度 | 数え落としてはいけないもの |
|---|---|---|
| 出力backing payload | 同じ実allocationはworkspace／encoded／segment／上位aliasがあっても1個 | 別copy・pool全体・extent未確認を同じ1個へ畳まない |
| 参照保持位置 | 同じbackingでもHolder・workspace・segment・custody等の各位置を別に記載 | aliasのpayload重複を除いても、参照cell／管理費は0ではない |
| record値／draft／sealed | 固定N個のcanonical record cell。draft→sealedは同cellの状態変化候補 | 旧draft参照が残れば別保持位置。snapshotがcopyなら別payloadとして要算定 |
| 管理slot／role | 先行の空位置とactive位置を分離 | not_created／未開始／非適用でも、存在するcellの容量は0としない |
| CPU scratch | raw counter用の前／現在2面、各256×5の候補 | logical payload20,480byteとJS／nativeの実capacity・返却は別 |
| stack／一時値／不明保持 | 固定継続中の局所参照・token・部分生成物・未知alias | 未算定はUnknown。完成wire長や予約残量へ吸収しない |

以下の出力個数は、同recordにallocation高々1、capacity適合、grow／hidden copyなし、再試行・credit再利用なしの**条件付き包絡**。取得前予約だけならbacking個数は0だが、metadata cellは存在し得る。取得途中throwは「実allocationなし」と断定せずunknown取得結果を同Holderの責務として残す。

同trialのwriter／post_check区間は全recordを通じ最大1。record jの開始には、直前にencodingを試みたrecordのWX08昇格とwriter／post退役確認が必要であり、join未確認・post未退役なら次recordを開始しない。この条件を緩めてphase間の重なりを増やさない。

## 2 phase × 保持対象 × 多重度 × slot対応

入力値・scratchの早期解放は未保証なので、下表では生成済み部分を退役確認まで保守的に保持する。空cell、値未生成、参照消失、物理解放を同じ「0」にしない。j−1等は個数の上界であり、各record長が同時に最大となる合法実行の証明ではない。

| phase／固定境界 | 保持対象・多重度 | 対応する内部slot／最小状態 | 停止・失敗時に残す責務 |
|---|---|---|---|
| PH01 先行構築 FS00 | root各群1組、record位置N、role位置4Nを準備する候補。部分生成は生成済みprefixだけ | Control／Failure、各cellのnot_created／created。容量予約とallocationは別 | identity未成立でも先行Failureと部分生成位置を保持。仮IDでrecordを作らない |
| PH02 arm〜取得 FS01〜04 | H・最大6 S・最大5 Iの値prefix、scratch最大2面。出力backingは未取得 | Timing、RecordCell、ScratchSlot。各sample index0〜5／interval1〜5 | 欠測を0にせず、未開始suffixを分離。raw6面へ拡大しない |
| PH03 集計・L・入力封印 FS05〜07 | PrePacket値P個、TERM位置1個は未封印。生成済みscratch／metadata保持。backing0 | Seal状態、SUM、LOAD7だけL。draft参照aliasは別位置 | 入力不足ならstrict封印不可。未封印値からencodingしない |
| PH04 batchのj番を取得／write FS08、または排他的なFS13早期診断 | encoded prefix最大j−1個＋同jのworkspace高々1個。取得前なら後者0、取得不明ならUnknown | Anchor／Holder／Capacity／Grant／Exit。confirmed cursor0〜B[j] | prefix＋部分backing全体＋in-flight不足を保持。j+1取得なし |
| PH05 finally候補〜caller join WX04〜06 | PH04と同backing個数。finally候補は新bufferではない | Exitのcandidate／joined／unconfirmed、同origin参照 | candidateだけでactive=0／退出済みにしない。次recordを拒否 |
| PH06 post／同backing昇格 WX07〜08 | prefix j−1＋同backing1、昇格後も合計高々j。入力値・管理位置も保持 | post_check→retired、Publish一度限り。同一allocationを2個にしない | post失敗／退役未確認なら非公開保持。copyによる救済なし |
| PH07 packet構築〜通知／receipt FS09〜10 | PrePacket backing P個、segment／custody参照は同backingへのalias。TERM backing0 | role別固定位置、PacketRef／Receipt、上位custody位置 | receiptだけで借用退役・元参照解放にしない。copy発生なら別計上が必要 |
| PH08 guard／call境界 FS11〜12 | PH07のbacking・未退役alias、未確定TERMとroot時刻／診断 | Timing g／i、attempt分類、停止状態 | 実callは未接続のまま。時刻／試行未確認を0へ補完しない |
| PH09 z・TERM封印 FS13 | 正常はPrePacket backing P個＋sealed TERM値1、TERM backingはまだ0 | TERM RecordCell、z、固定Failure。未来の成否なし | batch j失敗ならprefix j−1＋部分jを保持し、TERMはsealed値だけ。TERM encode／z_postなし |
| PH10 TERM encode FS14 | PH09正常分岐のP個＋TERM workspace高々1＝最大N個。writer／postは同trialで1区間 | TERMのHolder／Grant／Exit／Publish。packet用2roleは非適用 | TERM途中失敗でもP＋部分TERMを保持。再encode・TERM自己追記なし |
| PH11 local退役／上位custody保持 | aliasが減っても同backingは上位に残り得る。累積取得高々Nの履歴を維持 | Retirement／custody／borrow別状態、固定保持先 | local clearをGC／native／OS解放にしない。未確認physical量を差し引かない |

PH04／05のjが取得失敗で実参照なしの場合も、未確認の取得結果／frame責務を別slotに残す。早期失敗が共通identity不足なら完全なP recordの診断batchを作れるとは限らず、生成できた値prefix・未試行slot・Failureを保持する。早期診断batchはFS08と同じclaim／予約を排他的に使い、追加のP個を確保しない。

## 3 配置scopeと構造上の位置数

| scope | 最小の論理群／位置 | LOAD6／LOAD7 | 物理量と混同しない条件 |
|---|---|---|---|
| root | Control、Timing、Failure、Receipt、予約／進行の各群を1組 | 各1組 | 複数fieldを1objectに配置できるかは未決定。群数≠allocation数 |
| record値 | N個のcanonical cell、各cellに生成／封印状態と値参照 | 14／15位置 | LOAD6のL非適用記述を追加wire recordへしない。固定共通実装で空L位置を置くなら別途metadataへ計上 |
| record管理 | Anchor、Holder、Capacity、Grant、Exit、Publish、Retirementの7群×N | 98／105群位置 | 埋込み・参照・共有immutable定数の配置はUnknown。98／105個のheap objectとは主張しない |
| role | writer_frame、post_check、segment_build、packet_custodyの4位置×N | 56／60位置 | TERMの後2roleも配置する候補では非適用位置として残る。空slot容量0としない |
| 適用するrole | PrePacketの4P＋TERM writer／postの2 | 54／58位置 | 適用位置の総数であって同時active数ではない。非適用2位置を存在しない扱いにしない |
| writer／post | 全recordの排他的区間 | 同trial全体で最大1区間 | finally未合流・post未退役を隠して次区間を開始しない |
| read role | encoded recordのsegment_build／packet_custody | 同recordで最大2role | 全recordの同時active合法最大・実source非漏出は未検証。固定slot数だけで未知alias不存在とはしない |
| output backing | 各record高々1、workspace→encodedは同参照 | 累積最大14／15個 | retire後のcredit再利用なし。metadata／一時copy／実allocator chargeを含まない |
| raw scratch | CPU counter2面、各256×5×8候補 | 20,480 logical byte | 2面以外の集計途中値・JS数値object・provider配列は別。実capacity Unknown |

record管理7群にBorrowSlotsを重ねて数えず、BorrowSlotsの内訳をrole4位置とする。WriterFrameとExitSlotは同群の設計上の責務で、別の実allocation数はまだ決めない。scratchや封印値が元provider objectへの参照を含むなら、投影後にそのobjectが消えたと仮定せずsource coverage／保持算定の不足へ戻す。

## 4 内部slotの最小値域対応

「最小」は成立／未開始／未確認／拒否を表すために必要な**論理的な区別**であり、最小bit数や実装型の採用ではない。状態名は内部の案でwire enumへ自動追加しない。確認不能を正常値へ丸めず、不正な外部値そのものを無制限に保管しない。

| slot／field群 | 最小値域・参照の候補 | 更新資格・phase対応 | 拒否／未確認の保持 |
|---|---|---|---|
| Control identity／origin | 同root／trial／plan／pin／schema／選択済みprofile候補へのprivate参照。各参照は未生成／保持／未確認を区別 | 先行固定生成元のみ。PH01以降の安定照合 | label一致・同値copyで復元不可。identity不足を仮値で満たさない |
| Control phase／claim | 固定FS00〜14と局所WX01〜08の到達位置、not_started／active／stopped／terminal未確認。一度限りclaimは未試行／消費済み | 同ownerの固定遷移だけ。失敗後に未試行へ戻さない | terminal値だけで全退出・root全体終了を証明しない |
| index／record kind | j=1〜N、S index0〜5、I index1〜5、固定kind6種。境界位置は0〜Nも区別 | 正規registryのみ。slot・kind・profileを対で照合 | 範囲外は固定invalid分類。sort／dedup／別slotへ再bindなし |
| Timing | 各位置に未開始／値候補／欠落／不正等のvariant＋同clock domainへのprivate参照。wire値域は既存Mono／UTC候補だけ | a・各既存観測点に一度記録。予定時刻はaから固定算出 | 例外時の再clockなし。既存値との逆行・domain不足を保持 |
| Failure | 最初のreason／FS／OPの固定slot＋有限な二次flag。wire写像は既存FirstFailure／12 DiagFlagsへ限定 | PH01で先行保持、後続でfirstを上書きしない | raw例外／stack／無制限event列なし。内部不足をwire成功へ昇格しない |
| Counts／進行prefix | 既存9件のprofile上限内整数、各処理の未開始／試行済み／成否未確認、batchの固定prefix位置 | 実到達分だけ加算、SUM／TERM封印前snapshot | 上限超過をclipせずencoding前拒否。未計上費を0としない |
| 観測／集計値 | C／Nは別々の1〜256、loadは固定3要素の非負有限F64候補、memoryはU53候補。区間／summaryのPairはU64のu／t、t>0かつu≤t | PH02〜03。各値に既存variant、同scope／epoch・対応区間参照を付ける | free≤total等の局所関係と全5区間の整合が必要。欠測を0へせず、Pairだけで元counterの妥当性を証明しない |
| RecordCell／seal | 未生成／draft／sealed／生成未確認＋同canonical値参照。seal claimは一度限り | PH02〜03、PH09。封印後の不変入力 | draftとsealedの別copyがあれば別保持。後発Failureを封印値へ追記しない |
| Capacity request | 固定B[j]：H1428／S1125／L909／I493／SUM1250／TERM1507 | PH01予約、PH04／10取得前照合 | 可変cap・profile切替・再予約で救済しない |
| Capacity observed | request／view offset／view length／backing extent／storage根拠を別fieldへ。範囲内の確認値、超過／不正／未確認のtagを分離 | 同Holderの固定確認。writer条件はoffset0、length=extent=B[j]、固定排他 | 超過tagは「B[j]にclipした値」ではない。実extent不明・超過のallocationにはR_total適合を主張せず元参照／責務保持 |
| Holder／custody | 同backing実参照の未取得／保持／取得未確認、local／上位確認済み／移譲未確認 | PH04〜11。同Anchorと同参照を照合 | 元参照を失ってunknownをnoneへ変えない。移譲は物理解放ではない |
| cursor／used length | 確認済みcursorは0〜B[j]、成功used lengthはLF込み1〜B[j]。write状態は未開始／完了確認／in-flight未確認 | token完了時だけcursor更新、PH04〜06 | cursor以降の未確認writeを消さない。範囲内writeの前提自体が不足ならextent Unknown、予約内と断定しない |
| Grant／epoch | 未発行／active／revoked／spent、同attempt・writer origin・固定epoch参照 | PH04〜06／10。一度限りで新規tokenを制御 | epochは外部整数で更新しない。opaque pinなら算術不要。counter方式を採る場合の有限上限・overflow拒否は未確定、wrap／reset不可 |
| Exit／borrow role | 未開始／active／exit候補／joined／retired／unconfirmed、roleにより非適用を区別。同origin・enter・epoch参照 | writer finally→caller join→post→retireの固定順 | candidateからjoinedを推測せず、不正遷移でも元責務を保持。role別に意味のない状態遷移を許可しない |
| Publish／Receipt | 昇格未試行／済み／未確認、同backing・PacketRef。通知は未送信／pending／受理／拒否／未確認 | PH06〜10、notify／settleは各一度。受理とborrow退役は別 | receipt copy・別packet・後着で再settle不可。TERMへ将来receiptを後付けしない |
| Retirement／reclaim | local責務退役、参照clear、custody確認、backing reclaim、OS返却を別状態へ | PH11、確認した階層だけ更新 | 未確認階層はUnknown。local退役によるcredit再利用・実memory差引きなし |
| ScratchSlot | 前／現在の2位置、CPU数1〜256の検査値または不足状態、各5bucketの非負安全整数0〜2^53−1候補と同scope／epoch | PH02の固定供給・検査・差分。位置再利用と出力credit再利用は別 | CPU集合・精度・counter範囲不足を補完しない。provider所有配列の実保持は別途確認 |

Capacityの「超過」等のtagはraw観測値の安全な診断表現案であり、任意getterを実行して値を取り出す許可ではない。特にoversize検出後の不適合allocationまで既存byte包絡へ収まると説明しない。診断にexact超過値が必要なら、その有限表現・取得費・保持容量を別レビューする。

Timingは既存の採取位置に対応付ける。Sのbegin／end／UTCが18位置、LOAD7のLで3位置増え、追加clock候補14／15位置を合わせて実観測結果の位置は32／36。予定S時刻6位置を別に持つ場合は合計38／42の論理位置となる。hはnAckへのalias、S.enteredはnS、SUM.enteredはnA、TERMの既存時刻fieldも元観測への参照であり、新clockではない。これを全内部field数・物理slot配置の確定には使わない。

既存Counts上限（9 key順）はLOAD6が`6,24,26,6,7680,6400,14,1,14`、LOAD7が`6,28,29,7,7680,6400,15,1,15`のまま。内部guard／borrow／容量検査の費用までこの9計数だけでcoveredとしない。内部phase／slot tagのbit幅、参照幅、object header、配列capacity、enum実表現は全てUnknownである。

集計途中値は[CPU counter・整数集計の既存契約§3](BEST_PRACTICE_WFB_SGA_START_LOAD_CAPTURE_DESIGN.md)を維持する。5区間の和をU64に置くには同集合・累積epochとtelescopingの根拠が必要で、不足する実装では128-bit集計候補、pair間比較には有限256-bit以内の中間値候補を別途要する。Pairのwire長だけで演算途中値の保持量を包摂しない。その物理表現・slot数・実費は後続算定のUnknownに残す。

## 5 byte算定へ渡す式と未解決範囲

条件付きの出力payload包絡は、PH04〜06のjで`Σ(i<j) B[i] + B[j]`、PH07〜09正常でPrePacket予約和11,893／12,802byte、PH10以後でTERM込み13,400／14,309byte。取得前なら現在B[j]の実payloadは未生成だが、取得未確認・不適合容量をこの式に無条件で当てはめない。同backing昇格でB[j]を二度足さず、参照位置・管理slotは別項に残す。

最大同時保持の後続算定は、phaseごとの「出力backingの一意集合」「値／scratchの一意集合」「root・record・roleの管理位置」「別copy／stack／一時値」「取得／解放未確認」を分ける。同じ実体が二つの集合名で現れる場合はidentity照合してpayloadを一度だけ計上し、保持位置の管理費は残す。各項のbyte値が未導出なら総和はUnknownであり、記号を置いただけで有限memory cap充足とはしない。

出力予約和とscratchの20,480 logical byteを単純に足して総memory上界としない。予約と実payload、wire値と内部値、論理cellとheap allocationは別である。全てのrecord／flagが同時最大となる合法phaseの存在も未証明。ここでは構造的な保守包絡と合法最大を分離し、実backing／allocator／GC／OS返却と未確認保持を残す。

## 6 操作・費目coverageへの入口

| 対象 | 対応する費目 | 次に必要な固定coverage |
|---|---|---|
| root／record／4roleの先行cell・部分生成 | OP00〜02 | 実生成順・prefix・空slotのcapacity・参照保持先。生成を無料にしない |
| 値projection・scratch・差分・封印 | OP05〜12 | 同値のalias／copy、token／演算途中値、provider配列の寿命 |
| capacity・Grant・enter／finally／join／post／昇格 | OP12／13 | 同期復帰・非漏出、前record退役から次enterまでの固定条件 |
| Timing（a・nS・nA・nL・nN・nAck・g・i・z・z_post）・予定slot入場・Control phase・Failure／診断更新 | OP03／04／15 | arm一度・予定slot6位置・追加clock14／15回（OP03の1回＋OP15の13／14回）の固定記録先と境界更新費。clock throwも1試行として保持し、再clockしない |
| receipt | OP14 | 同packetの通知一度、受理とborrow退役の別責務、段階別保持 |
| guard／call入口の分類（PH08） | OP16／17 | 最終pin／停止／鮮度／T予約guardと試行分類の保持。実callは未接続のまま、試行・時刻未確認を0へ補完しない |
| failure／TERM／上位custody・固定退役 | OP18／19、該当encodingはOP13 | 初回理由・部分backing・sealed TERM・未確認custody／取得／解放の保持と費目。receiptだけで解放確認にしない |

この対応表はsource coverageの完成ではない。新guardのためのclock／pollを足さず、既存列挙取得62／70候補・期限・並列度を維持する。必要な操作が増える場合は別版でschedule／費用／保持を再算定し、未承認の実行へ進まない。

## 7 独立検証の受入条件案（全て未実施）

| ID | 固定対照 | 必須の期待関係 |
|---|---|---|
| RM01 | 全phase／両profileを独立の保持表で照合 | N=P+1、同backing昇格で個数不変、alias位置は別管理 |
| RM02 | 各jの取得前／throw／write失敗／join不足／post未退役 | prefix＋現slot責務を保持、次record取得／writeなし |
| RM03 | FS08と早期診断batch、identity不足 | 同予約・claimは排他的。生成不能slotに仮値なし、失敗後TERM encoding／z_postなし |
| RM04 | 空cell・TERM非適用role・partial construction | 4N=56／60の配置候補と4P+2=54／58の適用位置を区別。空cell byte0と推測しない |
| RM05 | 同値copy／別view／別record・上位copy | 同allocationと別allocationを分離。未知aliasなら閉じた上界を拒否 |
| RM06 | offset／extent超過・未確認・pool | invalid／unknownと実参照を保持、R_total適合・writer開始なし |
| RM07 | counter超過・cursor途中throw・epoch wrap案 | clip／reset／再貸与なし。確認済みprefixと未確認extentを分離 |
| RM08 | finallyだけ／receiptだけ／local clearだけ | joined／borrow退役／物理解放への誤昇格を拒否 |
| RM09 | Timing alias・予定6位置・時計例外 | 再採取なし。32／36観測結果＋6予定位置とgetter列挙62／70を混同しない |
| RM10 | 未知のmetadata費・allocator charge・解放時期 | structural個数やlogical payloadだけで最大実保持・合法最大・実費を成功扱いしない |

独立oracleは対象のphase／計数helperを使い回さず、固定record列と各失敗位置の期待保持集合・role状態・時刻alias表を別に持つ計画。今回これらのfixture・検査器は実装／実行しない。静的な文書リンク・表の列数・定数式の確認だけを行う。

## 8 未承認事項と今回の範囲

- [ ] phase別の保持集合・別copy／alias分類とsource coverageのレビュー。
- [ ] 内部slot最小値域、epoch方式、物理配置／capacity・安全な拒否表現のレビュー。
- [ ] 最大同時保持と合法最大、未確認取得／解放・allocator費の算定。
- [ ] 空slot／部分生成／writer退出／custodyを含む費目coverageの確認。
- [ ] LOAD6／LOAD7・方式／容量・実装／合成試験／実確認／保管の個別承認。

全て未承認。本MDと親2文書の参照更新だけを行い、実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは行わない。元の5秒期限・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。

文書整合として対象3文書のローカルリンク16件・表20個の列数、PH01〜11／RM01〜10のID連番、未承認チェック5項目、record／role／時刻位置・予約和・scratchの定数式、末尾改行と差分空白を確認した。文書と定数の静的検算のみで、実装・合成試験・負荷採取・試験再実行・実capacity／最大同時保持／費用の実証ではない。
