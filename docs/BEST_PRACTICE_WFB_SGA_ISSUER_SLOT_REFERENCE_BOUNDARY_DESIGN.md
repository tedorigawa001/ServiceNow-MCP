# WF-B SG-A後：issuer／canonical位置参照の全field・到達境界と先行保持責務

Version: draft-0.1 / Date: 2026-11-15 / 読取り基準HEAD: `de2a264`。

Status: **共通形状と案別容量責務の詳細設計のみ。LOAD6／LOAD7の選択、issuer／slot参照の表現、JoinFact二案、追加field／配置・共有方式・容量capは未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[参照先形状・保持slot容量境界draft-0.1](BEST_PRACTICE_WFB_SGA_EVIDENCE_REFERENT_HOLD_CAPACITY_DESIGN.md)と[確認物の正規slot対応draft-0.1](BEST_PRACTICE_WFB_SGA_EVIDENCE_CANONICAL_SLOT_MAPPING_DESIGN.md)。[全root field台帳draft-0.2](BEST_PRACTICE_WFB_SGA_ROOT_FIELD_REFERENT_LEDGER_DESIGN.md)、[L0容量規則draft-0.1](BEST_PRACTICE_WFB_SGA_INTERNAL_SLOT_LAYOUT_CAPACITY_COST_DESIGN.md)、[canonical claim台帳draft-0.1](BEST_PRACTICE_WFB_SGA_CANONICAL_ISSUANCE_CLAIM_LEDGER_DESIGN.md)、[origin／epoch契約draft-0.1](BEST_PRACTICE_WFB_SGA_ORIGIN_EPOCH_BINDING_REVOCATION_DESIGN.md)、[frame／capture台帳draft-0.2](BEST_PRACTICE_WFB_SGA_FRAME_CAPTURE_EVIDENCE_SLOT_DESIGN.md)を維持する。対象はEG01／EG07の論理形状候補であり、現sourceの全内部field・closure・実配置を照合したものではない。

## 1 共通契約と表現方式を分離する

issuerは元ownerの固定private継続に結合する由来の参照で、呼び出せる汎用factory／登録APIではない。slot参照も元canonical位置との同一性を表すだけで、setter／consume関数ではない。外部object・数値ID・hash・JSON・診断summaryから両者を構築／再取得するlookup口を作らない。合成用と実runtimeのowner・登録・claim台帳は共有しない。

共通契約I0／K0は論理fieldの閉じた列で、既存ownerへ埋め込む案と別payload案の双方に必要な意味を示す。埋込み案では各fieldの既存位置／固定導出元との対応が必要で、全fieldを同名の新propertyとして既存R1へ追加する宣言ではない。別payload案では列挙した直接fieldを持つ候補となる。どちらの案も全参照先graphの有限化・source保証は未完了である。

元CM00〜12が唯一の対応するone-shot、停止・予算・失効は元ownerが唯一の判定元である。I0／K0に新しいclaim、残予算、alive／stoppedの独立cache、mutableなcanonical値copyを置かない。発行可能な資格は形状一致や不変fieldだけから生じず、元owner・元確定点と固定private経路の検査が別に必要である。

## 2 共通形状の全直接field

Tは閉じた1byte tag候補、Rはprivate実参照位置で幅ρはUnknownというL0記法。新たなpayloadとして実体化する場合だけ次の形式部分和を使い、既存facetと別objectを同時に新規計上しない。

| ID／形状 | 全scalar field | 全private参照field | 列挙部分・意味 |
|---|---|---|---|
| IF01 I0 IssuerBinding | `kind:T,layout_tag:T,scope_tag:T` | `owner_ref:R,context_ref:R,subject_ref:R,birth_origin_ref:R,epoch_binding_ref:R,stop_owner_ref:R,budget_owner_ref:R,canonical_owner_ref:R,duty_owner_ref:R,failure_owner_ref:R` | `3+10ρ`。scopeはroot／roleの固定binding候補。元ownerの停止・費用・claimを複製せず、それぞれの正規保持元へ結合 |
| IF02 K0 SlotBinding | `kind:T,layout_tag:T,slot_kind:T,subject_kind:T` | `container_ref:R,context_ref:R,subject_ref:R,origin_ref:R,epoch_binding_ref:R` | `4+5ρ`。subject_kindはconstruction／root／role。slot_kindは§4の固定意味へ限定し、任意文字列path／関数／可変index列なし |

I0のbirth_origin_refはissuer bindingの生成由来であり、各EV／CMの事実originそのものを全て一つへ統合する参照ではない。EVのoriginは元siteのまま、同ownerからの由来関係を別に検査する。単一issuerを使うという理由でCM01〜07やrole間のorigin／失効domainを共有済みにしない。

I0はEV01〜06のissuer参照を受け止める共通候補で、EV07へ新しいissuer_refを追加しない。EV07は元のparent_ref／oslot_refとCM00に結合する。I0 root生成に必要なContext等が未成立ならroot issuerも未成立で、親の先行保持へ残す。construction用の架空Context／issuerを作って循環を救済しない。

K0 constructionのcontext_refは新root成立前には非適用となり得るが、subject_kindと元親の固定契約で明示された枝だけを非適用にする。roleのContext／epoch bindingは必須。同様にroot／constructionのepoch適用は元domain契約に従い、不明な参照を空にして非適用へ変更しない。非適用でも存在する予約cellの幅は残す。

I0／K0のbinding fieldは確定した同対象から再bindせず、候補・部分結合・失効・採用成否は先行owner側で保持する。immutableなbindingからmutableなownerへ到達しても、その内部状態が凍結されたり、binding保有者に書込み資格が移ったりはしない。

## 3 issuer全参照の到達先・共有と残項

| ID／I0参照 | 固定の到達先・関係 | 到達境界・先行容量責務 |
|---|---|---|
| IR01 owner_ref | 同root／roleを所有する固定owner、rootは同TrialOwner系統 | 既存ownerの全graphと親へのedgeを残す。既存だから0byte・小objectとはしない |
| IR02 context_ref | 同R1 RG01 Context、source／pin／schema／profile・原起点の同実参照 | RG01の全fieldと各参照先を継承。readonly viewへの置換・copy済みとしない |
| IR03 subject_ref | rootは同root、roleは同Anchorと固定roleの元subject | Anchor／role wrapperが別実体なら別payload。record番号一致で同一性を復元しない |
| IR04 birth_origin_ref | 元OE02 root／OE04 roleの生成由来に結合するorigin | 既存PR01形状とissuer／Context／subject／epochへのedgeを残す。EV事実originとの同一視なし |
| IR05 epoch_binding_ref | 元domainのbindingと不変pin。root／roleごとの適用を元契約へ結合 | binding／pin・可変失効owner・provider counter epochを分け、同数値だけで共有しない |
| IR06 stop_owner_ref | 同Contextの正規停止系統とRG02／role元資格の固定関係 | 第二stop cacheなし。失効後の旧対象の固定退出責務は元Duty／Exitへ残す |
| IR07 budget_owner_ref | 同canonical予算・RG04予約／元deadlineへの正規owner | 残予算copy・期限再計算なし。予算graph・予約と実支出を別に保持し、追加生成費を無料にしない |
| IR08 canonical_owner_ref | rootは元CMの各groupへ到達する正規owner、roleは同LC08等の正規保持元 | rootの全CMが一つのgroupに収まるとはしない。directory経由なら元RG00／参照先の全容量を残す |
| IR09 duty_owner_ref | F0の同RootDuty／RoleDutyと、その先行保持元 | 追加Duty directoryが実在・接続している保証なし。全field・生成prefix・捕捉先不足はUnknown、隠れた固定slotを仮定しない |
| IR10 failure_owner_ref | 元RG14、root成立前は親OSlotの正規診断・保持境界 | 二次不足とfirstを分離。RG07／pending一位置で全候補を捕捉できるとはしない |

K0のcontext_ref／subject_ref／origin_ref／epoch_binding_refはそれぞれIR02／IR03／IR04の元origin形状／IR05と同じ到達分類を用いる。ただしK0.origin_refは当該slotの元siteに結合する参照で、I0.birth_origin_refと常に同実体ではない。container_refの全到達先は§4で分ける。各edgeと対象graphの寿命を省略しない。

同owner／Contextを複数fieldから指せる場合も、別payload案の10／5参照cellは各位置分残す。同実体payloadの重複だけを実同参照根拠で除く。親単独で同時点に保持していた量が不明なら、issuerが既存でも追加保持量0とは言えない。cycleは同nodeを無限加算せず、逆参照が元root／frameの寿命を延ばす可能性を残す。

## 4 canonical位置参照の固定selectorと未確定範囲

下記のselectorは設計上の閉じたkindで、実行時path文字列・任意property読取り／setterではない。containerはscalar値でなく、その元位置を所有する実体へ結合する。根拠のない位置対応は採用不可・Unknownのまま残す。

| ID／slot_kind候補 | 元EV field・subject | containerと対象位置の対応案 | 権限・容量の限界 |
|---|---|---|---|
| KS01 role_enter | EV01／04 enter_slot_ref、同role | 同LC08[j,role]のenter_claim／CM11。enter_evidence採用位置とは別field | claim消費とEnterFactの実確認を分ける。K0が第二consume口にならない |
| KS02 writer_finally | EV02 exit_slot_ref、writer | 同LC05[j].exit_candidate | 元finally候補だけ。root／post等へ同Exitを流用しない |
| KS03 other_finally | EV02 exit_slot_ref、非writerの同frame | 同F0 Duty.exit_candidate_refの候補対応 | 非writerの元private継続・正規対応は未照合。単にDuty fieldがあるだけで確定位置にしない |
| KS04 writer_join | EV03／04 join_slot_ref、writer | 同LC05[j].joinのscalar位置 | 参照先は元containerで、join tag自体はobjectでない。JoinFact二案の選択と別の軸 |
| KS05 other_join | EV03／04 join_slot_ref、非writer | 同Duty.join_stateと元callerの対応候補 | Duty状態は補助観測。正規根拠／元caller未照合の間はjoinのcanonical成功へ接続しない |
| KS06 role_retire | EV04 retire_slot_ref、同role | 同LC08[j,role].retire_claim／CM12 | 退役試行とretire_evidence確認を分ける。local_ref／上位保持・reclaim全成功を含めない |
| KS07 packet_settle | EV05 settle_slot_ref、同PrePacket系列 | 同RG03.settle_claim／CM04 | 元packet／notify・最初のsettle条件を別に確認。receiptの外部objectや値snapshotと同一視しない |
| KS08 root_borrow | EV06 borrow_slot_ref、同root | 同RG12のroot_borrow_stateが示す元対象との対応候補 | 引受先・借用範囲のprivate対応は別途必要。roleのLC08へ転用しない |
| KS09 root_retire_scope | EV06 retire_slot_ref、同root | 同RG12のlocal_retire等から、元引受範囲に対応する位置を確定する必要 | fieldは未選択。local_retireをroot全体／上位引受／reclaim／os_returnの証拠に拡張せず、根拠が足りなければUnknown |
| KS10 construction_entry | EV07 construction_claim_ref、同親construction | 同OSlot.claim／CM00。RG06.claimは後発projection | root成立前は親が保持。新rootのtagで親入場を再生成しない |

KS08／09はRG12の既出stateへの候補対応で、CM07.transfer_claimの移譲開始や上位引受の事実そのものを代用しない。特にKS09は対象fieldと範囲の確定が残るため、現在のK0形状を用意すれば受理できるという契約ではない。追加の引受scope descriptorが必要ならその全field・先行保持・容量を別に設計し、ここで隠れたhandleを足さない。

同じfield名retire_slot_refでもEV04とEV06は異なるsubject／kind。直接container案ではEV kind・固定field位置と元subjectからselectorを固定し、任意のkindやindexを外部指定させない。別handle案でもkindを書き換えて別slotへ転用しない。KSのlabel一致・scalar値一致・参照shape一致だけではprivate同一性確認にならない。

## 5 方式共通部分と案別追加分（全て未選択）

| ID／表現案 | 共通契約の実現条件 | 案別追加容量・保持責務 |
|---|---|---|
| VA01 I-E 既存owner内issuer facet | I0各fieldを元ownerの既出field／固定private経路へ対応。issuer_refはその元実体を指す案 | 新issuer objectを作らない案でも、未列挙の埋込みfield・参照cell・局所保持・owner graphは無料でない。対応できないI0項目があれば実行閉鎖 |
| VA02 I-S 別private issuer binding | I0を別の固定payloadとして同owner／subjectへ一度結合。全field以外のinstance callback／events／Mapなし | 列挙部分3+10ρと外側C／A保持cell、実header・参照先・生成途中物を追加算定。元canonical stateを複製しない |
| VA03 K-E 直接container＋固定selector | slot_refは同元containerを保持し、EV kind／固定field位置からselectorを静的に確定。K0の他項目は元ownerとの固定関係で確認 | 別slot handle objectを作らない案。EV内の元参照cell、元containerへの寿命延長・固定確認費は残す。新しいfield／closureを要するなら差分を計上 |
| VA04 K-H 別private slot handle | K0の4tag／5参照で同container・subject・元siteへ固定結合。外部construct／lookup不可 | 列挙部分4+5ρと外側C／A保持cell、生成費・部分生成・全参照先を追加算定。mutable state／consume関数は載せない |

I-E／I-SとK-E／K-Hは独立した二軸で、構造上は4通りの組合せを別々に検討する。いずれも採用済みではなく、排他的な各案を全て同時に足して合法最大としたり、小さい案を承認済みとして総額を出したりしない。JoinFactのfacet／別payloadという既存二案はさらに別の軸で、この4通りから自動選択されない。

共有moduleの固定code／prototypeとinstance payloadは分ける。固定private関数を用いるとしても、そのclosure環境・module registry・runtime内部の保持を0byteとしない。必要なprivate brand台帳やregistryが現れる実装案は、本I0／K0だけではcoverage不足であり、有限件数・全field・生成／退役点・容量を追加設計するまで接続しない。任意closureへowner一式を隠す第三の小容量案を作らない。

## 6 先行保持・生成順・容量owner

C＝候補、A＝正規採用、M＝観測、L＝producer局所、U＝上位保持という親の記号を維持する。次表の「先行」は必要条件で、現実装に専用slotが存在するという記録ではない。

| ID／境界 | 元保持元・必要条件 | 費用・容量と失敗時責務 |
|---|---|---|
| HP01 親OSlot／最小root前 | 親の既存停止・Failure・construction保持が成立していること | 未成立ならroot／issuer生成なし。親自身のOOM／記録成功を保証せず、再帰的な緊急shellを作らない。親owner、OP00／OP18／OP19 |
| HP02 共通binding準備 | 同Context／元subject・origin／epoch・正規停止／予算が確認可能で、候補保持先が先行 | binding fieldが未確定なら新issuer／handle生成なし。元ownerの準備／結合OP00〜02、未確認L／元slotを保持 |
| HP03 I-S生成途中 | 固定producerのLから、事前に説明したissuer用Cへ同実参照を捕捉 | 別issuerを作り直さず、返却前／格納前／格納未確認を分離。root用・role用の固定対象ごとのC／A不足はUnknown |
| HP04 K-H生成途中 | 元container／固定selectorとの同一性を確認し、handle用CからAへ同候補を採用 | scalarから別handleを復元しない。I-SのCとK-HのCを同時に要する枝は別保持位置が必要で、汎用pending一位置へ畳まない |
| HP05 I-E／K-E接続確認 | 新payloadなしでも既存owner／container・元field／固定callerの同実参照経路が必要 | 読取り／結合・L保持・元graph寿命延長を残す。埋込み差分未確認なら容量0とせず、別wrapperで救済しない |
| HP06 A採用・M反映・退出 | 元binding／確認物へ同参照を渡し、複数edgeの格納prefixを確認 | 採用と全edge更新はatomicとしない。M失敗で元AやCMを戻さず停止し、C／L退役を固定復帰条件まで保留 |
| HP07 停止／上位引受後 | 元Duty／Exit・旧origin／元予算の固定確認と、残るU／aliasの同責務 | 新しい通常処理・再発行・再貸与なし。最後の保持edgeと引受・reclaim／OS返却を分離。元ownerと確認済み上位owner、OP19 |

別payloadごとにC一cellとA一cellを追加で先行確保する案なら、その外側二cellの部分幅は2ρとなる。その条件下だけでI-Sの直接列＋二cellは`3+12ρ`、K-Hは`4+7ρ`。既存fieldと同位置なら別加算せず、M／L／U、部分生成、先行状態field、container／header、全到達先はなお別である。これは要求量の完全な上界や全rootの必要総量ではない。

同じI0を多くのEVが参照できることと、root当たりissuerが必ず1個で足りることは別。scope・subject・失効domainが違えば共有条件も違う。K0も同container／kind／subject／origin／epochの全関係が一致する同実体だけを共有候補にし、同containerを指すだけでKS01とKS06等を統合しない。固定対象ごとの準備数・C／Aの同時保持・空配置数はphase別算定へ残し、要求回数に比例するissuer／handle系列は作らない。

## 7 失敗・診断・残る容量責務

| ID／不足 | 固定拒否・保持 | 容量上の扱い |
|---|---|---|
| FL01 元Context／親／保持先未成立 | 新規生成・claim消費なし。元親の未確認責務、別仮ownerを生成しない | 既に生成済みprefix・元frame、捕捉不足はUnknown |
| FL02 別owner／subject／site／epoch | 別対象のcanonical slotを変更せず、自flowの候補・診断は保持 | 同値copyによる共有・0byte補完なし |
| FL03 issuer／handle生成・返却途中 | 同L／C・partial fieldを保持。第二candidate・追加動的台帳なし | 返却前allocation／closureの全捕捉は保証せず、部分和に収まると断定しない |
| FL04 canonical／観測の部分結合 | 元CMとAの状態を戻さず、複数fieldの不一致と元参照を残す | atomic格納・C早期clearを前提にcellを減らさない |
| FL05 selector根拠不足・KS09範囲不明 | handle形状があっても採用しない。元borrow／custodyの不足保持 | 隠れたscope descriptorやgetter追加で有限形状を装わない |
| FL06 停止・旧epochのlate復帰 | 通常資格を再開せず、元対象の先行固定継続だけへ合流 | 失効をpayload解放とせず、旧issuer／handleから元graphへのedgeを残す |
| FL07 local退役・上位引受／実解放未確認 | 確認した層だけ更新し、firstと未確認責務を保持 | 参照clear・退役fact・GC／native／OS返却を分離、未確認nodeを差し引かない |

firstは元RG14、root成立前は親OSlotへ保持し、二次不足は既存有限分類へ結合する。I0に独立failure logを作らず、raw例外・stack・可変長event列を保存しない。発行物が元owner／frameへ逆参照する限り、その参照による寿命延長を残す。全参照捕捉・診断永続化・process終端まで保証しない。

元位置準備OP00、供給確認OP01、binding OP02、元進入／取得／演算OP03〜OP11、受付OP12、writer／post・encoding OP13、通知／receipt・segment OP14、既存境界記録OP15、guard／分類OP16／OP17、別故障OP18、custody／退役OP19へ各occurrenceを対応付ける。新規生成・既存位置読取り・格納・同一性確認・保持は同軸で二重加算せず、必要な元費用を落とさない。元Q／R／tail・列挙取得62／70・原起点／全deadlineを維持し、追加clock／poll・期限延長・予算resetで救済しない。

## 8 次段の全容量・phase別保持への引継ぎ

同時点pの新しいissuer payload集合I(p)、slot handle集合K(p)、既出台帳に未算入と確認できた外側保持cell集合ΔH(p)について、I-S／K-Hの列挙部分は`Σ[i∈I(p)](3+10ρ) + Σ[k∈K(p)](4+5ρ) + |ΔH(p)|ρ`となる候補。I-E／K-Eの埋込み差分は元field対応を確認して別に算定する。部分式の対象を固定せず新旧fieldを自動加算・減算しない。

この式は全参照先・header・registry・局所frame・部分生成物・native等を含まない。I(p)／K(p)も実証済みobject集合ではない。KS10種類はselectorの設計候補数であってhandle個数・発行数・同時live数ではなく、4通りの表現組合せも四組を実生成する意味ではない。ρと到達先・保持数が未導出の間、数値総容量・最大同時保持はUnknownを維持する。

次段は、今回のIR／KS境界を根拠に、各固定対象のC／A／M／L／Uと生成／join／退役prefixをPH01〜11へ対応付けることである。正常／throw／取消・採用途中・join未確認・上位引受未確認を分け、保守包絡・到達可能な合法最大・実allocator保持量を混同しない。今回このphase算定・実E要求量・LOAD6／LOAD7選択は確定しない。

## 9 独立検証の受入条件案（全て未実施）

| ID | 独立対照 | 必須条件 |
|---|---|---|
| IV01 I0／K0全fieldと未知extra | 固定列から独立の期待形状を作る | 3tag／10参照、4tag／5参照を維持。関数・claim cache・任意registryを隠さない |
| IV02 I0全参照のIR対応 | 同fieldと到達先・scopeの別表 | birth originとEV事実originを分け、親graph／Duty不足を0にしない |
| IV03 KS10種と元EV／CM | 固定selectorとsubjectを別期待表へ | scalarをobject化せず、role退役／root custody／親入場を相互代用しない |
| IV04 直接container案／別handle案 | K-E／K-Hの生成物・edgeを別計算 | 別objectなしでも確認費と保持延長を残し、別案のfieldを無料にしない |
| IV05 埋込みissuer／別issuer案 | I-E／I-Sの元field／追加列を別計算 | 既存facetを再加算せず、未列挙埋込み差分・closure不足はUnknown |
| IV06 C／A二cell・partial生成 | 同payload一つとcell二つ・生成prefixを別対照 | 条件付き3+12ρ／4+7ρを総容量／同時個数へ昇格しない |
| IV07 四組合せとJoin二案 | 表現軸・Join表現軸を分離 | 未選択案を採用済みにせず、排他的案の総和を合法最大にしない |
| IV08 停止・混入・KS09未確定 | 元owner／元scope・旧対象固定継続を別条件へ | 再bind／再issuer／claim resetなし、先行診断保持 |
| IV09 採用／M反映・復帰故障 | 更新prefix・残るL／C／A／Uを別対照 | atomic／全captureを仮定せず、retire factで元graphを消さない |
| IV10 費目・部分式・全容量 | 同nodeと全edge、元OPと別失敗OPを別算定 | 二重計上・未計上を区別し、新clock／時間延長・実接続で補完しない |

oracleは対象issuer／handle／selector／identity／容量helperを再利用せず、IF・IR・KS・HPの独立固定表を使う計画。今回は検査器・fixture・合成試験を実装／実行せず、文書・表・リンク・field数・条件付き部分和だけを静的に確認する。

## 10 未承認事項と今回の範囲

- [ ] I0／K0の共通全field・IR到達先と元private生成／実fieldの対応。
- [ ] I-E／I-S、K-E／K-H、Join二案と必要な追加scope／registry等の有限化。
- [ ] KSの元container／固定selector・特に非writer／root退役範囲の確定。
- [ ] 先行C／A／M／L／U・部分生成・全容量・phase別最大同時保持／費目coverageの確認。
- [ ] LOAD6／LOAD7・配置／容量と実装・発行／消費・合成試験・実確認／保管の個別承認。

全て未承認。本MDと親2文書の参照更新のみ。元の5秒期限・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは行わない。

文書整合として対象3文書のローカルリンク23件・表20個の列数、IF01〜02／IR01〜10／KS01〜10／VA01〜04／HP01〜07／FL01〜07／IV01〜10の50行のID連番、I0の3tag／10参照とK0の4tag／5参照、I0全参照のIR対応・KSが参照するEVの7slot field、4組合せ・条件付き3+12ρ／4+7ρ、未承認チェック5項目、費目OP00〜19、末尾改行・差分空白を静的に確認した。初回のリンク検査ではinline code内の数式をリンクと誤認したため、検査側でcode区間を除外して再確認した。文書・定数の検算のみで、実issuer／slotの存在・同一性／同期失効・全捕捉・全容量・phase別最大同時保持・実費の実証ではない。合成試験・製品試験・採取・実通信は実行していない。

## 11 後続の固定対象・準備prefixとPH保持数（2026-11-16）

[固定対象別の準備数・生成prefixとPH保持数対応draft-0.1](BEST_PRACTICE_WFB_SGA_FIXED_TARGET_PREFIX_PHASE_HOLD_DESIGN.md)で、I0／K0の参照元ラベルと共有class、空準備位置・生成物・C／A／M／L／Uを分け、PH01〜11へ条件付きで対応させた。selector種数・参照数を実object数やactive数に置換せず、未照合経路・テンプレート外保持はUnknownを残す。方式・選択未承認、元5秒／既定並列度・各閉鎖条件・調査保留を維持し、実装・発行・消費・採取・再実行は行わない。
