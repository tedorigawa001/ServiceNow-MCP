# WF-B SG-A後：固定対象別の準備数・生成prefixとPH01〜11の保持数対応

Version: draft-0.1 / Date: 2026-11-16 / 読取り基準HEAD: `f0bdb9e`。

Status: **条件付きの準備対象・prefix・保持数対応の詳細設計のみ。LOAD6／LOAD7の選択、I-E／I-S・K-E／K-H・Join二案、準備時期・配置・共有方式・容量capは未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[issuer／位置参照の境界draft-0.1](BEST_PRACTICE_WFB_SGA_ISSUER_SLOT_REFERENCE_BOUNDARY_DESIGN.md)と[phase保持・多重度draft-0.2](BEST_PRACTICE_WFB_SGA_PHASE_RETENTION_SLOT_DOMAIN_DESIGN.md)。[確認物・保持slot容量draft-0.1](BEST_PRACTICE_WFB_SGA_EVIDENCE_REFERENT_HOLD_CAPACITY_DESIGN.md)、[確認物・正規slot対応draft-0.1](BEST_PRACTICE_WFB_SGA_EVIDENCE_CANONICAL_SLOT_MAPPING_DESIGN.md)、[frame／capture台帳draft-0.2](BEST_PRACTICE_WFB_SGA_FRAME_CAPTURE_EVIDENCE_SLOT_DESIGN.md)、[canonical claim台帳draft-0.1](BEST_PRACTICE_WFB_SGA_CANONICAL_ISSUANCE_CLAIM_LEDGER_DESIGN.md)、[全root field台帳draft-0.2](BEST_PRACTICE_WFB_SGA_ROOT_FIELD_REFERENT_LEDGER_DESIGN.md)を維持する。以下のラベル・集合は静的設計用で、新runtime registryや実生成計画を実装するものではない。

## 1 単位・適用範囲：位置数からobject数を作らない

P＝13／14はPrePacket record数、N＝P+1＝14／15はTERM込み。固定role配置D＝4N＝56／60、適用role R＝4P+2＝54／58で、TERMのsegment／custodyは非適用のまま。固定順はH→S0〜S5→必要なL→I1〜I5→SUM→TERM、roleの列挙順はwriter／post／segment／custody。列挙順を実生成順・全並列実行順として強制しない。

Jは未選択のJoin表現を別算定する設計変数で、J=0は状態facet案、J=1はEV03の別payload案。Jの記載でどちらも選択しない。I-E／I-S、K-E／K-Hの二軸も維持し、各案別に計数する。排他的な案のpayloadを同時に加算して合法最大にしない。

対象テンプレートは、同適用roleにEV01／EV02／EV04とJ=1時のEV03、root系列にEV05／EV06、親系列にEV07を各一つの固定事実siteとして対応させる案。非writerの確認継続、KS08／09、専用C不足等は解決済みにしない。constructor／root自体のEV02／03相当の退出、追加scope descriptor・brand台帳・closure／native subframeはテンプレート外であり、未列挙残項をUnknownに残す。全確認物／全frame総数の上界とはしない。

## 2 固定対象別テンプレートと共有前の参照元ラベル

| ID／対象 | 固定準備対象・参照元ラベル | 対象数・成立条件 |
|---|---|---|
| TG01 role確認payload | 同record／roleのEV01・EV02・EV04と、J=1時のEV03 | 1role当たり3+J。事実未発生なら空準備位置とpayload未生成を分離 |
| TG02 root／親確認payload | rootのEV05受理、EV06引受、親のEV07入場 | 各系列1ラベル、計3。拒否／未確認で成功payloadを生成しない。EV07はroot外の親由来 |
| TG03 issuer参照元 | TG01の各EVのissuer_ref、rootのEV05／EV06のissuer_ref | role当たり3+J、root2。EV07にissuer_refはなく、constructor用I0を捏造しない |
| TG04 role slot参照元 | EV01 enter1、EV02 exit1、EV04 enter／retire／joinの3、J=1時のEV03 join1 | role当たり5+J。field occurrence数であってhandle個数でない |
| TG05 root／親slot参照元 | EV05 settle1、EV06 borrow／retire2、EV07 construction1 | 計4ラベル。KS09未確定はslot成立としない |
| TG06 同role内のslot対象対応 | enterの重複2箇所と、J=1時のjoin重複2箇所を同実体へ対応できる場合 | role当たりenter／exit／join／retireの4対象候補。subject・container・kind・origin／epochの同一性が必要 |
| TG07 先行metadata／保持位置 | C候補、A正規採用、M観測、L局所、U上位。F0のDuty・frame／capture候補位置は別 | slot一つとpayload一つを同数にしない。空位置・非適用位置・未確認格納の容量を残す |

適用role数Rに対する参照元ラベル数は、確認payload候補`B_E=(3+J)R+3`、issuer参照元`B_I=(3+J)R+2`、slot参照元`B_K=(5+J)R+4`。同role内の同一性対応が全て成立したときのslot対象候補は`T_K=4R+4`。重複差分は`B_K−T_K=(1+J)R`となる。root／親4ラベルの統合や、異role間の共有をこの式で許可しない。

| ID／候補の範囲 | J | B_E LOAD6／LOAD7 | B_I LOAD6／LOAD7 | B_K LOAD6／LOAD7 | T_K LOAD6／LOAD7 |
|---|---|---|---|---|---|
| NC01 適用role R | 0 | 165／177 | 164／176 | 274／294 | 220／236 |
| NC02 適用role R | 1 | 219／235 | 218／234 | 328／352 | 220／236 |
| NC03 配置role Dへ同じテンプレートを予約する場合 | 0 | 171／183 | 170／182 | 284／304 | 228／244 |
| NC04 配置role Dへ同じテンプレートを予約する場合 | 1 | 227／243 | 226／242 | 340／364 | 228／244 |

NC03／04は非適用TERM roleにもこの追加metadataを予約する案の位置数であり、I0／K0／EV payloadの生成・claim消費を要求しない。元LC08配置4Nは維持するが、追加テンプレート位置まで全て先行確保する方式は未選択。B_Eは全kind・全失敗物の数ではない。B_I／B_Kはissuer／handleの実object数ではなく、T_Kも実在が確認済みのslot数ではない。

I-Sの一意準備対象はTG03ラベルの共有条件を満たす同一性classへ、K-HはTG04／05の同container／kind／subject／origin／epochのclassへ対応する。各classの固定生成siteと先行C／Aを一度だけ説明する必要がある。一ラベル内でも追加の別issuer／handleが必要なsourceならテンプレート不足で、対応版を改訂するまで総数はUnknown。要求回数分のclassや再生成系列を増やさない。

## 3 準備時期・生成prefixの表現

先行一括準備と必要直前の段階準備は未選択の別案とする。どちらもその生成・元処理より前に停止／予算・Failure・候補保持先が必要で、直前準備だから追加時間や無償allocationを許すものではない。constructor／root／各role・root受理／上位引受のlaneを分け、一つの全体prefixで全生成順を表したことにしない。

| ID／prefixの軸 | 値・数える対象 | 失敗時の保持規則 |
|---|---|---|
| PX01 配置準備 | lane別の予約対象列と、確認できたmetadata生成済みprefix。非適用／未開始の位置も別状態 | 予約数は実allocation数でない。部分生成・格納未確認をprefix長だけで消さない |
| PX02 固定生成site | 各issuer／handle class・EVラベルの未試行／試行済み／成否未確認 | 元CMと準備試行を混同しない。失敗後freshへ戻さず、第二site・第二candidateなし |
| PX03 C捕捉 | 同candidate実参照をLからCへ記録したprefixと、最後の未確認格納位置 | 返却前／後・C格納前／後を分離。空Cから未生成／解放済みを推定しない |
| PX04 A採用 | 正規採用確認済みprefix・未確認の末尾と同元対象 | CとAが同物でも二edge、同位置なら対応根拠が必要。canonical成功を戻さない |
| PX05 M反映・復帰 | 個々の観測edgeの格納確認と、元callerの退出／非漏出確認 | 全M更新はatomicでない。M不足・join未確認のC／Lを早期退役しない |
| PX06 local退役／U保持 | 各保持edgeの退役確認と、上位引受／実解放の別状態 | 役割終了と最後のedge消滅、reclaim／OS返却を分離。unknownを0にしない |

各laneの確認済みprefixの外に未確認末尾がある場合、未生成suffix・非適用位置・未確認物を分ける。元sourceの生成順にholeがあり得るなら単一prefixへ丸めず、固定laneの不足／別段階状態として記録する設計が必要である。任意集合・無制限event列・動的registryで補完せず、ここで新しい実state fieldは追加しない。

確認できた生成物集合G、C／A／M／L／Uの各保持edge集合は別に扱う。同実体がCとAとMに現れてもG内payloadは一つだが、edgeは各位置分である。正規採用数以下だから局所生成物総数も同数、という推定はしない。producer内部・partial nested allocation・実stackの全捕捉はなおUnknownである。

## 4 PH01〜11への保持数対応の入口

w／x／s／kを、それぞれwriter／post／segment／custodyの**進入を確認した異なるrole対象の累積数**とする。active数・完了数・payload数ではない。`r=w+x+s+k≤R`、前段prefix未確認なら等号や0を補完しない。role準備metadataやI0／K0を一括先行生成する案では、body開始0でも準備数は0とは限らない。

| ID／phase対応 | 通常枝のrole開始累積の構造候補 | 保持集合・prefixへの対応 | 停止／失敗時に残すもの |
|---|---|---|---|
| PC01 PH01 FS00 先行構築 | w=x=s=k=0 | 親lane・root／role metadata配置prefix。I0／K0候補は準備方式とbinding成立位置に従う | 親／Context未成立なら新issuerなし。生成済みmetadata・元frame／C末尾は別保持 |
| PC02 PH02 FS01〜04 arm／取得 | w=x=s=k=0 | PH01の準備集合に観測値prefix・scratchを重ねる。payload未発生でも予約／空cellを残す | provider／clock例外時の局所・旧scratch・準備物を保持。新採取で救済しない |
| PC03 PH03 FS05〜07 入力封印 | w=x=s=k=0 | sealed値Pの成立状況と準備laneは別。issuer／handleの事前準備数を封印値数へ置換しない | identity不足・封印失敗なら未生成suffixと部分値を残し、仮のP個を補完しない |
| PC04 PH04 FS08 j番取得／write | w≤j、x≤j−1、s=k=0 | 同jのwriter laneと、それ以前に生成した確認物・issuer／handle・encoded prefixを保持 | 取得前／CM消費後body前／実進入不明を分ける。取得／進入未確認をw=jに丸めずj+1なし |
| PC05 PH05 WX04〜06 finally／join | w≤j、x≤j−1、s=k=0 | 同jのEV02候補・C／A／M更新prefix、J別のEV03関係、未退役L／frame | finallyだけでjoin・C退役成功にせず、前recordやroot／親への逆参照を保持 |
| PC06 PH06 WX07〜08 post／昇格 | w≤j、x≤j、s=k=0 | writer退出後のpost lane、元writer EVとpost EV、同backingを分離 | post未退役・M不整合なら次recordなし。退役確認物が元frameを指す保持は残り得る |
| PC07 PH07 FS09〜10 packet／receipt | w=x=P、0≤s≤P、0≤k≤P | 正常batch後のrole確認物とsegment／custodyの準備・生成prefix、EV05系列のC／A、同backing alias | root EV05は0／1の正規受理確認と未確認枝を分離。receiptだけでs／kの退役・U消失なし |
| PC08 PH08 FS11〜12 guard／call境界 | w=x=P、s≤P、k≤P | PH07の全保持と固定guard／分類の元state、未確定TERMを重ねる | 実callは閉鎖。元時刻・停止不足を新clockやissuer再bindで補完しない |
| PC09 PH09 FS13 TERM封印 | 正常はw=x=P、s≤P、k≤P | PrePacket側保持とTERM値封印、診断／元root frame。TERM role未開始 | 既存batch失敗枝ではw／xは失敗jまでのprefix、TERM encodeなし。sealed TERMとrole成功を混同しない |
| PC10 PH10 FS14 TERM encode | w≤N、x≤N、s≤P、k≤P | 正常枝のP record保持にTERM writer／post laneを追加。TERM read2roleは非適用 | TERM途中の部分候補・元PのU／aliasを保持。再encode・先行保持のresetなし |
| PC11 PH11 local退役／上位保持 | 既に確認した累積w／x／s／kを保存、新通常開始なし | EV06引受・EV07親由来、旧issuer／handle・確認物・元graphの残るedgeを対応 | local退役後もUや未確認L／Cを0にしない。root終端・process終端・OS返却は別 |

PC04〜06のjはPrePacket batchの1〜P。FS08未到達時のFS13早期診断batchは同じ元claim／予約を排他的に使い、この同じj別表へ適用する。通常batchと診断batchの二組を同時に準備済み／生成済みとして重複計上しない。ただし既に取得した失敗prefixは保持する。TERM j=Nのwriter／postはPC10として別に扱う。

writer／postの実行区間は既存の同trial最大1を維持するが、過去の確認payloadや元frameへのedgeが全て消えることは意味しない。segment／custodyは同record最大2roleが重なる候補で、全recordの同時active合法最大は未導出。累積s+k≤2Pをactive数として用いない。PC表は全phaseにおける実stack／native frame数の上界でもない。

## 5 累積事実・一意payload・edge数を結ぶ条件

| ID／式・対象 | 条件付きの関係 | 使用してはいけない推論 |
|---|---|---|
| HC01 role事実の元対象 | r_start=r、r_join／r_retireは同roleの実確認に基づき、それぞれr以下 | r開始からEV02／join／退役を自動生成しない。消費tagは事実でない |
| HC02 正規事実のラベル | e_enter≤r、e_finally≤r、e_join≤r_join、e_retire≤r_retire。各role・各kindは元一度限り | EV02とEV03を同物へ変形しない。e値は全一時object数でもlive数でもない |
| HC03 root／親事実 | 正規EV05／EV06／EV07の各対象ラベルは高々1。元条件不足なら未確認／未生成 | 高々1を必ず生成できる保証にせず、拒否／取消時に空成功物を置かない |
| HC04 EV payload案 | 正規採用済みpayloadの対象ラベルはe_enter+e_finally+J×e_join+e_retireと、root／親の正規事実分 | C／Lの未採用・部分生成物までこの和に収まるとはしない。J=0でもjoinの確認費・保持は残る |
| HC05 issuer／handle案 | I-S／K-Hは共有classごとの生成／採用prefixから一意集合I(p)／K(p)を作る設計。I-E／K-Eは元実体保持と埋込み差分へ | B_I／B_Kをそのまま実object数へ置換せず、未確認共有でdedupしない |
| HC06 外側保持cell | C／A各一cellを別予約する対象classがtならその二cellは2t位置。Mの固定m位置を追加するなら2t+m | L／U／partial・状態field・containerを省かない。既出cellは同位置根拠を確認してから差分から除く |

HC02の各eは異なるrole／kindについて正規事実を確認した累積ラベル数で、保持edgeを退役しても履歴の意味を消さない。HC04も正規採用ラベルの範囲であり、現時点pで実際に保持される一意payload集合とは別である。payloadがC／A／M／L／Uのどれかに残るか、未知のcaptureがあるかを別に確認する必要がある。

一括準備案の空C／A／Mは本文の事実発生前から容量を持ち得る。段階準備案でも、確認物が元issuer／handle／frameへ戻るedgeのため旧payloadが残り得る。後段に進んだから前段payloadを一括で除去できる、という共通の退役時点を設けない。

## 6 未確認保持・故障prefixと費目

| ID／境界 | 保持数・prefixの固定扱い | 元責務と費目 |
|---|---|---|
| PF01 先行metadata／親未成立 | 空準備位置・生成済みprefix・未確認末尾を分離、新root／issuerなし | 元親・元frame、OP00／OP18／OP19。緊急shellで有限数を満たさない |
| PF02 I0／K0生成・C格納途中 | 未試行suffixを増やさず、元L／C／partial候補を保持。全捕捉不足はUnknown | 固定producer・先行owner、元OP00〜02と別失敗OP18、保持OP19 |
| PF03 A採用／M反映不一致 | canonical成功と観測prefixを分け、Aのreset・第二candidateなし | 元canonical owner／Duty、受付OP12等、別故障OP18 |
| PF04 claim消費後・body前／進入不明 | spent／消費未確認、未開始と不明を分け、rへ推定加算しない | 元Exit／Dutyと同予算、元OP13／OP14等・OP18／OP19 |
| PF05 join／post未確認 | j+1を開始せず、旧C／L／frame・確認物逆参照を保持 | 固定caller／role owner。元確認OP13・退役OP19 |
| PF06 取消・失効／後着・上位U未確認 | 通常開始停止、元laneのlate復帰だけ固定継続へ。新lane／epoch／issuerなし | 元ownerと上位custody、OP14／OP18／OP19。残るnodeを差し引かない |
| PF07 早期診断・TERM途中失敗 | 元batchの失敗prefix・部分backingとsealed TERM等を別保持。二batch分やTERM再試行を追加しない | SamplerOwner／TrialOwner・親。元OP18／OP19、可能な元encodingだけOP13 |
| PF08 local退役・引受／実解放不明 | 履歴・一意payload・現存edge・実allocator不足を別に残す | 元／確認済み上位owner、OP19。retire factだけで物理量を0にしない |

準備OP00、供給確認OP01、binding OP02、元進入／取得／演算OP03〜OP11、受付OP12、writer／post・encoding OP13、segment／通知／receipt OP14、既存境界記録OP15、guard／分類OP16／OP17、別故障OP18、custody／退役OP19へ各occurrenceを結合する。prefixや計数を追加する実装費・保持費は無料にせず、既存Counts9件だけで全coverage済みとしない。firstは元RG14、root前は親OSlotへ残し、可変長log・raw例外／stackは作らない。

元Q／R／tail・原起点／全deadline・列挙取得62／70を維持する。準備時期の変更で元5秒／既定並列度を緩めず、新clock／poll・credit再利用・再生成で救済しない。全参照捕捉・OOM時保存・process終了まで保証しない。

## 7 全容量・最大同時保持へ渡す残項

固定対象テンプレートとprefixが説明できても、ρ・metadata／handle／container・header・全参照先・部分生成物・局所／closure／stack／nativeの容量は未導出である。I0の3+10ρ、K0の4+5ρ、EVの2+qρと外側cellの部分和を、PHの役割累積数へ機械的に掛けて全容量としない。元root／親graphを含む同一node unionと全edge対応、追加保持の寿命が必要である。

後続の最大同時保持は、profile・表現案・準備時期案と正常／各故障経路を固定したうえで、各時点pの一意payload集合と各保持edgeを計上する。各経路の部分最大を全て足して合法最大とせず、保守包絡・到達可能な合法最大・実allocator保持量を分ける。未知alias／未確認解放を差し引かず、現段階では数値総容量・最大同時保持・実E要求量はUnknownを維持する。

## 8 独立検証の受入条件案（全て未実施）

| ID | 独立対照 | 必須条件 |
|---|---|---|
| PT01 固定record／role・TERM非適用 | 別の固定列からD=4N、R=4P+2を検算 | 配置56／60と適用54／58を分離、非適用消費なし |
| PT02 J二案と参照元ラベル | EV全fieldの別表からB_E／B_I／B_Kを積上げ | EV07にissuerなし、J=0でもEV04のjoin参照を落とさない |
| PT03 slot対象共有 | roleのenter／exit／join／retireとroot／親4対象を別表へ | T_K=4R+4は対応成立時だけ。B_K−T_K=(1+J)Rをobject削減実証にしない |
| PT04 一括／段階準備とlane | body開始前の配置prefix・I／K準備を別対照 | w=x=s=k=0でも準備物0としない。lane全体を一prefixへ潰さない |
| PT05 PH01〜11とj境界 | 正常／失敗のrole開始累積を別に作る | w／xのj−1・j・P・N境界、TERM read非適用、次record停止を維持 |
| PT06 参照共有・C／A／M | 同payloadと各cell・L／Uを別計算 | payload一つと複数edgeを区別、空cellと未生成を混同しない |
| PT07 生成／採用／join失敗prefix | PX・PF各位置の期待保持を別表へ | reset・第二candidate・未確認suffixの成功化なし |
| PT08 FS08／FS13早期診断 | 同claim／予約の排他的branchを別対照 | 二batch分を重複せず、元失敗prefixも消さない |
| PT09 退役後の逆参照・上位保持 | 元fact→frame／issuer／handle→root等のedgeを別対照 | r履歴・live node・物理解放を分け、clearだけで減算しない |
| PT10 ラベル数・部分式・全容量 | NC数値・一意class・phase別集合を別算定 | 227／243等を全object数／合法最大にせず、新clock／期限延長なし |

oracleは対象のphase／prefix／共有／容量helperを再利用せず、固定role列・EV参照元・lane・故障prefixの独立表を使う計画。今回は検査器・fixture・合成試験を実装／実行せず、文書・表・リンクと記載した定数関係だけを静的に確認する。

## 9 未承認事項と今回の範囲

- [ ] TG対象テンプレート・共有classと元private生成site、テンプレート外残項の確認。
- [ ] 表現案／Join二案・一括／段階準備、C／A／M／L／Uの実位置と生成順の選択。
- [ ] PH01〜11・PX／PF失敗prefixと非writer／KS09の元確定点・保持責務の対応。
- [ ] 全参照先容量・空配置／部分生成・phase別最大同時保持・費目coverageの有限化。
- [ ] LOAD6／LOAD7・配置／容量と実装・発行／消費・合成試験・実確認／保管の個別承認。

全て未承認。本MDと親2文書の参照更新のみ。元の5秒期限・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは行わない。

文書整合として対象3文書のローカルリンク23件・表20個の列数、TG01〜07／NC01〜04／PX01〜06／PC01〜11／HC01〜06／PF01〜08／PT01〜10の52行のID連番、PCと親PH01〜11の対応、未承認チェック5項目、費目OP00〜19、末尾改行・差分空白を静的に確認した。別の固定record／role列と親EV全fieldから参照元ラベルを列挙し、NCの4行×2profileのB_E／B_I／B_K／T_Kと重複差分を検算した。初回の文書適用は親追記の照合行誤記で拒否されたため、変更未発生を確認後に正しい行で再適用した。文書・定数の検算のみで、実生成／共有・全捕捉・実保持数／全容量／最大同時保持・実費の実証ではない。合成試験・製品試験・採取・実通信は実行していない。

## 10 後続の容量対象・未導出残項の所有境界（2026-11-16）

[テンプレート内外の容量対象node／edge・未導出残項台帳draft-0.1](BEST_PRACTICE_WFB_SGA_CAPACITY_NODE_EDGE_RESIDUAL_LEDGER_DESIGN.md)で、TG／NC対象と元root・親・backing、退出／scope／registry等の不足を同じ算定境界へ対応付けた。部分生成／allocatorは横断軸とし、ラベル数を全payload数・全容量へ昇格せず、元保持責務とUnknownを残す。方式・選択未承認、元5秒／既定並列度・各閉鎖条件・調査保留を維持し、実装・発行・消費・採取・再実行は行わない。
