# WF-B SG-A後：確認物の参照先形状・候補／採用済み保持slotの容量境界

Version: draft-0.1 / Date: 2026-11-15 / 読取り基準HEAD: `5568e8e`。

Status: **参照先形状と容量境界の詳細設計のみ。LOAD6／LOAD7の選択、JoinFactのfacet／別payload、追加slot・配置・共有方式・容量capは未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[確認物・正規slot対応draft-0.1](BEST_PRACTICE_WFB_SGA_EVIDENCE_CANONICAL_SLOT_MAPPING_DESIGN.md)と[frame／capture台帳draft-0.2](BEST_PRACTICE_WFB_SGA_FRAME_CAPTURE_EVIDENCE_SLOT_DESIGN.md)。[graph境界draft-0.1](BEST_PRACTICE_WFB_SGA_GRAPH_BOUNDARY_CANONICAL_PROTOCOL_SHAPE_DESIGN.md)、[全root field台帳draft-0.2](BEST_PRACTICE_WFB_SGA_ROOT_FIELD_REFERENT_LEDGER_DESIGN.md)、[L0容量規則draft-0.1](BEST_PRACTICE_WFB_SGA_INTERNAL_SLOT_LAYOUT_CAPACITY_COST_DESIGN.md)、[origin／epoch契約draft-0.1](BEST_PRACTICE_WFB_SGA_ORIGIN_EPOCH_BINDING_REVOCATION_DESIGN.md)、[phase保持draft-0.2](BEST_PRACTICE_WFB_SGA_PHASE_RETENTION_SLOT_DOMAIN_DESIGN.md)を維持する。既存LC／RG／F0へのfield追加・新しいruntime台帳・実供給は行わない。

## 1 容量を数える単位と今回の到達点

確認物自身の直接field、外からその確認物を保持するcell、確認物が指す参照先graph、producerの局所／部分生成物を分ける。全field列は下記の論理payload候補の閉じた列であり、現codeのprototype／内部slot／closure・実heap全体を照合済みという意味ではない。任意objectの列挙、getter／Proxy／iterator、heap dump、実参照採取は行わない。

kind／stateの各Tは閉じた1byte tag、Rはprivate実参照位置で幅ρはUnknownというL0候補記法を使う。`2+qρ`は確認物自身に列挙した2tagとq参照だけの形式部分和で、header・alignment・参照先・外部保持cellを含まない。論理fieldを持つ既存facetと別objectのどちらで実現するかは別問題である。

immutable確認物のstateはその事実範囲の固定値であり、採用／未確認／失効などの進行状態は元canonical owner・Duty側で扱う。候補を採用するために同じobjectのkind／stateを書き換えて別EVへ変換しない。不変のfieldからmutableなowner／claim／frameへ到達し得ることと、確認物そのものの事実が変わらないことも分ける。

## 2 確認物payloadの全直接fieldと型別部分和

全EVのscalar列は`kind:T,state:T`だけ。下記のR列は親F0のEV列をそのまま型付けした候補で、Context／epoch／frame等を欠くEVへ追加fieldを無断挿入しない。

| ID／kind | private参照の全field列 | q／形式部分和 | 表現・採用境界 |
|---|---|---|---|
| EC01 EV01 EnterFact | `issuer_ref:R,subject_ref:R,origin_ref:R,epoch_binding_ref:R,frame_ref:R,enter_slot_ref:R` | 6／`2+6ρ` | role進入の元確認物。LC08.enter_evidenceとFF01.enter_fact_refが同実体ならpayload一つ、cellは各位置分 |
| EC02 EV02 FinallyCandidate | `issuer_ref:R,subject_ref:R,origin_ref:R,epoch_binding_ref:R,frame_ref:R,exit_slot_ref:R` | 6／`2+6ρ` | finally候補の事実だけ。writer LC05.exit_candidateとF0側の参照を対応付ける。JoinFactへの変形なし |
| EC03 EV03 JoinFact | `issuer_ref:R,subject_ref:R,origin_ref:R,epoch_binding_ref:R,frame_ref:R,exit_candidate_ref:R,join_slot_ref:R` | 7／`2+7ρ` | 別payload案だけの候補幅。状態facet案ではこのobjectを生成済みと数えず、元caller／LC05.joinと保持費は残す |
| EC04 EV04 RoleRetireFact | `issuer_ref:R,subject_ref:R,origin_ref:R,epoch_binding_ref:R,frame_ref:R,enter_slot_ref:R,retire_slot_ref:R,join_slot_ref:R` | 8／`2+8ρ` | 同role・元enterと退出／返却を確認した事実。LC08.retire_evidenceとFF03.retire_fact_refは同対象でも別保持位置 |
| EC05 EV05 PacketReceipt | `issuer_ref:R,packet_ref:R,origin_ref:R,settle_slot_ref:R` | 4／`2+4ρ` | 同packetの元受理確認物。receiptの値snapshotや外部通知objectを直接このpayloadへ採用しない |
| EC06 EV06 RootCustodyFact | `issuer_ref:R,subject_ref:R,origin_ref:R,borrow_slot_ref:R,retire_slot_ref:R` | 5／`2+5ρ` | 同rootの引受範囲に結合。role退役物やpacket receiptとは別payloadのkind、同kind内の実同参照以外でdedupしない |
| EC07 EV07 OuterAdmission | `parent_ref:R,oslot_ref:R,origin_ref:R,construction_claim_ref:R` | 4／`2+4ρ` | 親側に由来する入場確認物。後発RG06への結合でcopy／第二発行しない。親／OSlot内部保持は別容量 |

この列に可変長events、extra、任意children、raw例外・stack、任意callbackを追加しない。隠れたbrand／private registry／closure環境や追加wrapperが実装上必要なら、その形状・容量・寿命・費用を別項にし、上のqに含むと推定しない。単にfield名が一致した外部値から確認物を作る入口はない。

## 3 各参照が到達する形状・境界

| ID／参照先分類 | 対応するEC field | 必要な形状・関係 | 容量境界・寿命 |
|---|---|---|---|
| EG01 private issuer | issuer_ref | 同固定owner／Context／subjectの発行元。自由登録・任意callbackなし | issuerの全内部field・closure／registryは未列挙でUnknown。root／role側との実共有と逆参照を記録し、1参照だから小objectとしない |
| EG02 固定subject | subject_ref | roleは同LC01 Anchor・固定roleのsubject、EV06は同root。kind別の元identityに結合 | AnchorのL0列・rootのR1全fieldと到達先を継承。role用subject wrapperが必要なら別payloadで未承認。label／indexだけで復元しない |
| EG03 origin | origin_ref | 元PR01の`kind,phase,issuer_ref,context_ref,subject_ref,epoch_ref`の形状入口と同site | 不変pin・可変失効ownerを区別。PR01だけで全内部容量完了ではない。共有条件不足はUnknown、旧対象の退出責務が残る間の保持を含む |
| EG04 epoch binding | epoch_binding_ref | 元PR02の`kind,state,context_ref,subject_ref,origin_ref,epoch_ref,claim_slot_ref`の形状入口 | bindingと不変pin、provider counter epochは別。LC04／LC08との同実参照・失効domainが確認できなければ共有を仮定しない |
| EG05 frame／capture | frame_ref | F0 FF01の全fieldと、capture_refからFF02、DutyからFF03への固定edge | 各形状の形式幅は13+16ρ／14+12ρ／14+14ρ。root／局所view／親graph・未確認captureを含む全保持量ではない |
| EG06 元finally候補 | exit_candidate_ref | EC02と同issuer／subject／origin／epoch／frameの元候補 | EC03の参照から元candidateの寿命が延びる可能性を残す。joinが確認されても元candidateの全aliasが消えたとはしない |
| EG07 canonical位置 | enter_slot_ref,exit_slot_ref,join_slot_ref,retire_slot_ref,settle_slot_ref,borrow_slot_ref,construction_claim_ref | 元LC／RG／OSlotの同container・固定field／subjectとのprivate対応。新しいslot検索APIではない | fieldへの設計上の参照は数値tagそのものではない。実装がcontainer参照＋固定位置で実現するか別handleを要するかは未選択。別handleのfield／容量を無料で補わない |
| EG08 packet／segment | packet_ref | 元PacketManifestの`state,schema_tag,profile_tag,context_ref,ordered_segment_refs[P],seal_slot_ref`。segmentは`slot,offset,used_length,anchor_ref,backing_ref,borrow_slot_ref` | 正規P＝13／14位置とpartial構築を分離。Context・backingへ到達するgraphで、wire receipt長では容量を包摂しない |
| EG09 親／外側slot | parent_ref,oslot_ref | 元親ownerとR1のOSlot全scalar／参照列。同constructionとCM00に結合 | root外でも保持境界に含む。既存親graph・未完成root／pending／frameの保持がUnknownなら追加保持量もUnknown |

EC01〜07に列挙した全参照fieldは上記EGへ対応させ、参照先不明を0byteとしない。EGは形状の固定境界と未導出残項の分類であり、任意の実objectを走査・深い検査で正規型へ昇格する手順ではない。

特にjoin_slot_refはLC05.joinというscalar値への「実object参照」が既に存在するという意味ではない。元状態のowner／位置と同事実を結合する論理fieldである。参照として受け渡すための別handleが必要なら、先行保持・private結合・全field・生成費を追加設計するまで接続しない。immutableな確認物から参照してもmutable ownerの更新権限を新設しない。

## 4 候補／正規採用／観測slotの容量対応

下表のCは生成途中／返却候補の保持、Aは正規採用、MはF0観測edgeを表す設計上の記号で、新field／新claimではない。producerの局所参照L、上位保持Uも別に数える。既存の一つのfieldにCとAのlabelが付く場合は実同位置を確認してから一cellとし、名前が似ているだけでは統合しない。

| ID／対象 | Cの保持元・不足 | Aの正規位置 | M／追加保持と容量条件 |
|---|---|---|---|
| EH01 EnterFact | 元進入確認producerの局所Lと先行保持。FF03に専用enter candidate fieldはない | LC08[j,role].enter_evidence | FF01.enter_fact_ref。専用Cが必要なら追加slot案・未承認。MをCに使う場合も段階・同実参照・失敗保持の確認なしに兼用しない |
| EH02 FinallyCandidate | 元finally frameと既存Exit／Dutyの候補位置 | writerはLC05[j].exit_candidate、非writerは同Duty.exit_candidate_refの対応案 | FF01／FF03.exit_candidate_ref。非writerでAとFF03が同位置なら一cellだが、FF01やproducer局所は別edge。writerのLC05を他roleへ使い回さない |
| EH03 JoinFact | 同caller復帰区間のL／Duty。別payloadを作る場合の専用Cは未成立 | writerはLC05.joinの状態facet。別payloadの正規参照採用先は未選択 | FF01／FF03.join_fact_refは別payload案の候補位置。scalarをA参照として数えない。facet案でも同caller／元candidateの保持は無料にならない |
| EH04 RoleRetireFact | 元退役producerのLと先行保持。retire_fact_refを候補／採用で兼用できる保証はない | LC08[j,role].retire_evidence | FF03.retire_fact_ref。C／A／Mが同実体を指しても各cell／寿命を残す。専用C追加は別承認 |
| EH05 PacketReceipt | 同固定受理ownerのL／元packet保持。RG03に専用receipt候補fieldはない | RG03.accepted_receipt_ref | F0の汎用pendingを暗黙のreceipt候補slotとしない。受信元object・採用用確認payload・packetの三者は同物と仮定しない |
| EH06 RootCustodyFact | 同引受継続のL／元root／上位U。RG12に専用custody候補fieldはない | RG12.custody_receipt_ref | Uと元ownerが同物を保持する間は両edgeを残す。RG12.unresolved_registry_refを全候補の第二保持表として使わない |
| EH07 OuterAdmission | 同親OSlot／元生成frameのL。OSlot.admission_origin_refはoriginで、確認物候補専用slotではない | 後発RG06.outer_admission_ref | root成立前のC保持元は別途同親の実経路が必要。OSlot.pending_ref一位置で他の候補も全て保持できたとしない |

一つの確認物について「専用C一cellとA一cellを別に先行確保する」配置を選ぶなら、その二cellだけの形式予約は2ρである。C／A／M各一cellを別に確保する案なら3ρだが、これらは条件付きのcell部分和で、実装済み配置でも全EVに必要十分な容量でもない。L／U／partial参照・状態field・追加containerは別である。同一の確認payloadがCとAに同時に残ってもpayloadは一つで、cell二つは消えない。

既存LC／RG／F0で列挙済みの参照cellを新規差分へ再加算しない。反対に、専用Cがないのに暗黙の空slot／小closureで保持費を補完しない。既存位置のどれを使うか、部分生成時に同時に何を保持するか、未確認時にLが確実に残るかが不明なら、必要保持容量はUnknown・生成接続は閉鎖とする。元frameが必ず全候補を捕捉できる保証も作らない。

## 5 共有／別payload・重複排除の条件

| ID／場合 | 同一性・表現条件 | 容量と寿命の規則 |
|---|---|---|
| ES01 同EVのC→A→M | 同private producer・同対象／同事実・同実参照を確認。copyなし | payload一つ、C／A／M／L／Uの現存edgeは各位置分。M追加で最後の保持時点が延びればその寿命を残す |
| ES02 同origin／issuer等の共有 | 元共有条件・失効domain・kind／subject対応と実同参照が必要 | 共有targetは一度。ただし各EV内の参照fieldとtarget側の元fieldは別cell。親が常時保持するか不明なら追加保持0とはしない |
| ES03 同値copy／別kind | 値・hash・label一致は同実体の根拠でない。EV02とEV03、EV04とEV06は別事実 | 実際にcopyがあるなら別payload・生成途中同時保持を計上。同一性不明はUnknownで、都合のよいdedupも別allocationの断定もしない |
| ES04 Join状態facet案 | LC05.joinと元callerの同事実をその場で確認。新JoinFact objectなしという案 | objectを新規生成しない候補であって確認費／frame保持0ではない。FF01／FF03.join_fact_refへscalarや架空objectを置かない |
| ES05 Join別payload案 | EC03とprivate元確定点、C／A／M経路を先に説明。必要なslot handle等も別形状へ | EC03の2+7ρに外部保持cell・追加handle・全参照先・失敗保持を加える。LC05に新参照fieldがあると仮定しない |

ES04／05は未選択の二案として別々に条件を書く。片方の小さい容量を採用済みとしたり、排他的な二案の全payload和を「合法最大」としたりしない。複数EVが同issuerを指すことは、EV自身まで一つのpayloadへ統合する根拠にならない。相互参照のcycleでは同nodeを無限加算しない一方、親graphへ到達するedgeや寿命延長を無料にしない。

## 6 寿命・失敗時保持・退役確認

| ID／段階 | 生存する対象・保持責務 | 解消条件・不足時 |
|---|---|---|
| EL01 先行位置準備 | 存在する空C／A／M位置・Duty・Failure／OSlot | 空cellの容量は残る。元事実や確認payloadは未生成。親未成立なら新生成へ入らない |
| EL02 producer途中 | L、生成済みfield／nested候補、元対象・Cの記録prefix | 返却前allocation・全capture不足はUnknown。第二candidateや緊急保持shellで救済しない |
| EL03 C捕捉・全検査前 | 元候補とL／C、subject／frame／元slot | 候補保持と事実確認を区別。格納成否不明でも元候補責務を消さない |
| EL04 A採用・M反映途中 | 同確認物を指すC／A／Mの実際のprefixと元L | 採用成功と全edge更新は別。M失敗でcanonical成功を戻さず停止し、候補copyを再生成しない |
| EL05 固定復帰・後続利用 | A／必要M、元candidateへのedge、まだ退出未確認のL／frame | 同caller退出・非漏出と各roleの元条件を確認してからC／局所責務を退役。finallyだけ・Promise settleだけでは不足 |
| EL06 失効・取消／late・上位U | 旧epochの元確認物・frame／borrowと未確認L／C／U | 新規通常利用は閉鎖。先行Duty／元予算の固定確認だけに合流。失効をpayload消滅・実解放成功にしない |
| EL07 保持位置退役・引受後 | 確認済み層以外のalias／親graph／上位保持・実allocator不足 | local clear、引受確認、最後のedge消滅、reclaim／OS返却を分離。未確認nodeを総保持量から差し引かない |

一つの確認物を残して退出／退役を示す場合、その確認物からframe／origin／slot ownerへ戻るedge自体が元graphを保持し得る。retire factがあることから元frame payloadも解放済みとは推論しない。確認物を最後にいつ手放せるかは、その利用先と上位引受の契約まで必要で、現時点で全EV共通の早期clear点を作らない。

最初の理由はRG14、root成立前は親OSlotへ保持し、二次不足は既存有限診断へ結合する。異owner／同値copyは正規採用を拒否するが、取得済み候補を不存在にはしない。全捕捉不能・OOM／強制終了では診断保存・回収成功を保証せずUnknownを残す。生成／採用一度限りを守り、新発行・claim reset・slot再貸与で保持不足を救済しない。

## 7 算定式・費目と次段への引継ぎ

設計上の一時点pで、確認できた一意の確認payload集合をE(p)、その外側の保持cellのうちL0／R1／F0に未算入と確認できた差分集合をΔH(p)とすれば、列挙部分だけの式は`Σ[e∈E(p)] (2+q(e)ρ) + |ΔH(p)|ρ`となる。EC自身のq参照と外部cellを混同せず、既出fieldの重複はowner・field・実位置の対応を確認してから除く。対応不明なら差分額もUnknownで、既出部分和へ自動加算・減算しない。

E(p)は実証済みheap集合ではなく、選択された表現・private生成／保持経路に基づく後続設計の変数である。Join別payload案とfacet案、正常と故障prefixは分ける。全rootの確認物数をEC7種各1個、4N、8Nのいずれかへ単純置換しない。112／120はLC08のenter／retire参照位置数であり、全確認物object数ではない。

追加の状態metadata／handle／container・header・実参照幅、EG01〜09の到達先・共有延長、L／partial生成物・closure／stack／native、取得／解放未確認を含む全容量はこの部分式の外に残る。F0一組41+42ρや出力予約13,400／14,309byte、scratch20,480 logical byteでこれらを包摂しない。phaseごとの一意nodeと全edgeの上界、到達可能な合法最大、実allocator保持量の算定は次段で、今回は数値総量／最大同時保持・実E要求量・方式選択を確定しない。

先行位置／生成OP00、固定供給確認OP01、同一性結合OP02、元進入／取得／演算OP03〜OP11、受付OP12、writer／post・encoding確認OP13、segment／通知／receipt OP14、既存境界記録OP15、guard／分類OP16／OP17、別失敗OP18、custody／退役OP19へ各occurrenceを対応付ける。共有payloadでも各検査・格納・退出／返却の費用は残す。主費目一つ・元支出prefixを維持し、元Q／R／tail・既存列挙取得62／70・5秒期限／既定並列度は変更しない。追加clock／pollや実保管操作は行わない。

## 8 独立検証の受入条件案（全て未実施）

| ID | 独立対照 | 必須条件 |
|---|---|---|
| EQ01 EC全field・型／q | 元EV01〜07から別表でfield列を作る | scalar各2、参照6／6／7／8／4／5／4を維持。未知extra／callbackなし |
| EQ02 全参照のEG対応 | EC各fieldとEGを別の固定対応表へ | 不明targetを0byte／有限純dataにしない。slot handle不足は未承認 |
| EQ03 C／A同参照・別cell | 同payloadと二保持位置の別期待値 | payload一つ・cell二つ。既出cell費を再加算せずL／Uを消さない |
| EQ04 C／A／M別copy・同値 | 実identityと値一致を別条件へ | copyなら別payload、不明はUnknown。kind違いを統合しない |
| EQ05 専用Cなし／汎用pending競合 | EH01〜07と失敗prefixの別表 | 空slotの捏造・小closure無料化・第二保持表なし、生成接続閉鎖 |
| EQ06 Join二案・scalar位置 | ES04／05を別条件で積上げ | facet案とEC03別payload案を混ぜず、追加handle／保持費を落とさない |
| EQ07 生成／採用／mirror故障 | EL02〜04ごとの元参照・更新prefixを別期待値へ | canonical reset・第二候補なし、未確認保持と先行診断 |
| EQ08 retire factから元frameへ到達 | 最後のedge／上位保持／実解放を別条件へ | retireやlocal clearだけで元graphを差し引かない |
| EQ09 親共有・cycle・追加保持 | 同実体unionと全保持edgeを別計算 | 無限加算も親0byte扱いもしない。親単独保持不明なら追加保持Unknown |
| EQ10 部分式・費目・閉鎖 | q／cell部分和と全容量・全実費を分離 | 2ρ／3ρや既存形式和から総cap成功を導かず、新clock／期限延長なし |

oracleは対象issuer／slot／identity／容量helperを再利用せず、EC全field・EG分類・EH保持位置・EL故障prefixの別表を使う計画。今回は検査器・fixture・合成試験を実装／実行せず、文書・リンク・表・型別部分和の静的整合だけを確認する。

## 9 未承認事項と今回の範囲

- [ ] EC01〜07の閉じた形状・EG参照先と実生成元／実配置の対応。
- [ ] EHの専用C不足・C／A／M同位置／別位置・元局所保持の例外安全性。
- [ ] Join状態facet／別payload・slot handle・共有／別copyと寿命の選択。
- [ ] 全参照先・部分生成物・実backing容量・phase別最大同時保持・費目coverageの有限化。
- [ ] LOAD6／LOAD7・配置／容量と実装・発行／消費・合成試験・実確認／保管の個別承認。

全て未承認。本MDと親2文書の参照更新のみ。元の5秒期限・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは行わない。

文書整合として対象3文書のローカルリンク22件・表21個の列数、EC01〜07／EG01〜09／EH01〜07／ES01〜05／EL01〜07／EQ01〜10の45行のID連番、ECの7型と親EV全fieldの一致、参照field数6／6／7／8／4／5／4・全参照fieldのEG対応、型別2+qρ・未承認チェック5項目、費目OP00〜19、末尾改行・差分空白を静的に確認した。7型の参照列総計40は列定義の検算であって同時object数／保持位置総数ではない。実source／実slotの存在・捕捉／共有／解放・全参照先容量・最大同時保持の実証ではなく、合成試験・製品試験・採取・実通信は実行していない。

## 10 後続のissuer／canonical位置参照と先行保持（2026-11-15）

[issuer／canonical位置参照の全field・到達境界と先行保持責務draft-0.1](BEST_PRACTICE_WFB_SGA_ISSUER_SLOT_REFERENCE_BOUNDARY_DESIGN.md)で、EG01／07の共通形状と、既存owner／container利用・別private payloadの案別追加分を分けた。元claim／停止／予算を二重化せず、専用保持先・slot selector・到達先graphの不足をUnknownに残す。方式・選択未承認、元5秒／既定並列度・各閉鎖条件・調査保留を維持し、実装・発行・消費・採取・再実行は行わない。
