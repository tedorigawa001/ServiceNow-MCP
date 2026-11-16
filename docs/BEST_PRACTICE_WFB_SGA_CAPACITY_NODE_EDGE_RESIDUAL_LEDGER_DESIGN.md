# WF-B SG-A後：テンプレート内外の容量対象node／edge・未導出残項の所有境界

Version: draft-0.1 / Date: 2026-11-16 / 読取り基準HEAD: `40522fc`。

Status: **容量対象・所有境界の文書台帳のみ。LOAD6／LOAD7の選択、表現／Join二案・準備時期・配置・共有方式・容量capは未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[固定対象・準備prefix／PH保持数draft-0.1](BEST_PRACTICE_WFB_SGA_FIXED_TARGET_PREFIX_PHASE_HOLD_DESIGN.md)と[graph境界draft-0.1](BEST_PRACTICE_WFB_SGA_GRAPH_BOUNDARY_CANONICAL_PROTOCOL_SHAPE_DESIGN.md)。[issuer／slot境界draft-0.1](BEST_PRACTICE_WFB_SGA_ISSUER_SLOT_REFERENCE_BOUNDARY_DESIGN.md)、[確認物・保持容量draft-0.1](BEST_PRACTICE_WFB_SGA_EVIDENCE_REFERENT_HOLD_CAPACITY_DESIGN.md)、[frame／capture台帳draft-0.2](BEST_PRACTICE_WFB_SGA_FRAME_CAPTURE_EVIDENCE_SLOT_DESIGN.md)、[全root field台帳draft-0.2](BEST_PRACTICE_WFB_SGA_ROOT_FIELD_REFERENT_LEDGER_DESIGN.md)、[L0容量規則draft-0.1](BEST_PRACTICE_WFB_SGA_INTERNAL_SLOT_LAYOUT_CAPACITY_COST_DESIGN.md)、[phase保持draft-0.2](BEST_PRACTICE_WFB_SGA_PHASE_RETENTION_SLOT_DOMAIN_DESIGN.md)を維持する。

## 1 対象と記載単位

本書は参照先全容量を算定する前に、どの対象を含め、どこから先が未導出で、誰が責務を持つかを揃える入口である。実heapの全nodeを列挙済みとするものではない。nodeは同実体のpayload、edgeは特定owner／field／frameの保持位置。label・数値ID・hash・JSONの一致をnode同一性の根拠にせず、逆に同一性不明だけで別allocationとも断定しない。

各項目には、固定label、元設計／field、テンプレート内外、表現／準備案、生成／部分生成位置、保持元、到達先、同一性根拠、寿命／退役条件、列挙部分式、未導出残項、容量責務owner、元費目を対応付ける。これは文書の記載項目で、新しいruntime object／登録API／観測field／wire keyではない。形状列挙済み、条件付き部分式、同一性未確認、capture未確認、実extent未確認、解放未確認は別軸で、単一の「容量確認済み」flagへ潰さない。

対象テンプレートTはTG／NCのrole EV01／02／04・J別EV03、root EV05／06、親EV07と、それらのissuer／slot参照元を指す。T内という分類は、実payload生成や容量が完了したという意味ではない。T外の既存管理・値・backing・親、未列挙のconstructor／root退出・追加scope／registryも算定対象から除外しない。表現案を選ぶまで別payloadの有無が変わる行は案別の条件として扱う。

## 2 容量対象node分類台帳

| ID／対象分類 | 元設計・テンプレートとの関係 | 列挙部分・未導出範囲 | 容量責務owner・元費目 |
|---|---|---|---|
| NL01 root直接管理・固定registry | R1 RG00〜15、T外の先行土台 | 全直接field列と既出Timing／Failure／Countsを維持。group／配列container・全参照先／実配置は未導出。RG13〜15をL0へ再加算しない | TrialOwner、OP00／02と各更新OP03〜19 |
| NL02 record管理・値cell／role位置 | L0 LC01〜09、7N管理＋4N role＋N値cell。Tの固定対象を保持 | 列挙部分63+45ρ／recordは条件付き。12Nを実object数にしない。非適用TERM read roleの空位置も残す | 元record／role owner、OP00／02／12／13／19 |
| NL03 F0 Duty／frame／capture・directory | F0 FF01〜03と追加Duty directory案。Tの保持土台 | 一組41+42ρ等は直接列の部分式。実frame・局所capture・追加directoryの元経路／容量はUnknown | 固定caller／TrialOwner・親、OP00／02／13／14／18／19 |
| NL04 EV確認payload | T内EC01〜07。J=0のEV03は状態facet案 | ECの2+qρと全fieldは既出。元slot／観測edge・C／L未採用・実headerは別。constructor／root固有退出を含めない | 各private producer・正規owner、元確認OP02／12〜14／19、失敗OP18 |
| NL05 issuer binding | T内issuer参照元に対応するI0。I-E／I-Sで別算定 | I-Sは3+10ρの列挙部分、I-Eは元field対応と埋込み差分が必要。全owner／closure／brandを含むとはしない | 固定issuer owner、OP00〜02／18／19 |
| NL06 canonical位置handle | T内slot参照元に対応するK0。K-E／K-Hで別算定 | K-Hは4+5ρの列挙部分。KS種数・B_K・T_Kをhandle個数にしない。元container・scope不足は別 | 元canonical owner、OP00〜02／12〜14／19 |
| NL07 origin／epoch／claimのbinding参照先 | T外の元PR／OE／CM系統、NL04〜06が到達 | site／domain／field位置と実payloadを分離。claim stateは元NL01／02にある場合再計上しない。追加binding／pin／wrapper容量はUnknown | 元origin／domain／claim owner、OP00／02と各元操作 |
| NL08 canonical値・draft／sealed・時刻snapshot | T外CV／strict値、LC09／RG13等から到達 | wire長と内部値容量は別。元draft・copy・文字列／配列・leaf・不変観測aliasの容量と寿命が残る | SamplerOwner／TrialOwner、OP05〜13／18／19 |
| NL09 packet／segment／TERM binding | T外のPacketManifest・SegmentDescriptor・TerminalBinding | 正規P参照表とpartial構築を分離。Context／Anchor／backingへ到達。暗黙concat buffer／別wrapperを無料にしない | SamplerOwner／CustodyOwner、OP12〜14／19 |
| NL10 backing／view／storage | T外のLC02／03／06・segment／custodyの元実体 | 同backing昇格は一つだがview cell・実extent／pool・copyは別。予約13,400／14,309byteは適合条件付きで、全memory上界ではない | Holder／元取得owner・上位custody、OP12／13／19 |
| NL11 scratch・provider戻り値 | T外RG10の2面・raw／projection／一時戻り値 | 20,480 logical byteだけでprovider配列・JS表現・元戻り値の保持を包摂しない。scope未確認／partialは残す | SamplerOwner、OP05〜11／18／19 |
| NL12 token／演算・encoding途中値 | T外RG11・元frameの局所値 | 128／256-bit候補幅と同時位置数・string／token／関数環境は別。全一時値・実表現の容量はUnknown | 固定演算／encoding owner、OP08〜13／18／19 |
| NL13 親owner／OSlot・固定上位保持 | T外だがEV07・I0等から到達。root前から存在し得る | OSlot全fieldと親graph・元候補／frameを含む保持境界。親単独保持の根拠なしに追加保持0としない | 親owner／確認済みCustodyOwner、OP00／02／18／19 |
| NL14 constructor／root固有退出・追加frame | T外不足。F0のkindと実固定caller／退出確認 | role EVのTGラベル数に未算入。必要な確認物・元frame・捕捉先・先行slot数は未確定。role用証拠で代用しない | 親／固定caller／TrialOwner、OP00／02／18／19と元処理 |
| NL15 追加subject／scope descriptor | T外不足。KS08／09・非writer subject等の未確定経路 | 必要性自体が条件付き。存在しないならsource根拠、必要なら閉じた全field・先行保持・寿命・容量の追加設計が必要 | 元binding／引受owner、OP00／02／12／19 |
| NL16 private brand／registry・closure／code環境 | T外不足。I0／K0・固定producerの実現残項 | 任意Map・closureで有限shapeを装わない。固定code／prototypeとinstance環境を分け、件数・field・共有／退役点が未導出ならUnknown | 元module／construction ownerとTrialOwner、生成OP00／02、元操作・退役OP19 |
| NL17 部分生成／未採用・成否不明の横断状態 | NL01〜16のどれにも重なる生成prefix・C／L | 新しい別node群を一律加算する分類ではない。元対象と同物か別nested allocationか、返却前後・全capture不足を残す | 元producer・先行保持owner、元操作／OP18／19 |
| NL18 実配置・allocator／native等の横断残項 | NL01〜17のheader・alignment・container capacity・pool・runtime保持 | payloadに既に含む費用を再加算しない一方、論理幅から実費0としない。取得extent・物理解放不足はUnknown | 元取得／保持ownerと固定上位、元操作／OP19。runtime由来不明も元責務へ |

NLは分類数18でありnode個数ではない。NL17／18は横断軸で、同一payloadをNL04とNL17に二重のnodeとして数えない。NL07のclaimやNL16のregistry等も既出NL01／02上のfieldなのか、別referentなのかを対応確認してから区別する。別物が必要な場合はその分を残し、未確認共有で減算しない。

## 3 保持edge・境界台帳

| ID／保持経路 | node分類の対応 | 元保持位置・境界と未導出責務 |
|---|---|---|
| NE01 root→record／固定index | NL01→NL02 | RG00／RG09のcanonical参照とaliasを各cell分残す。参照先の既出fieldを再生成扱いしない |
| NE02 C／A／M→確認物・issuer／handle | NL01／NL02／NL03→NL04／NL05／NL06 | 各EH／HPの専用C不足・同位置／別位置・格納prefixを明示。汎用pending一位置で全候補を保持できたとしない |
| NE03 L／U→候補・元payload | NL03／NL13→NL04／NL05／NL06、横断NL17 | 元producer局所／上位引受の保持はC／A採用と別。局所参照が必ず捕捉できるとは保証しない |
| NE04 EV→元frame／origin／slot／packet等 | NL04→NL01／NL02／NL03／NL06／NL07／NL09／NL13 | EC01〜07の全参照に対応。retire factが元frameを保持する逆参照を残す。kind違い・同値copyで統合しない |
| NE05 I0→owner・Context・Duty等 | NL05→NL01／NL02／NL03／NL07／NL13 | IR01〜10の全経路。birth originとEV事実originを分離、元ownerの全graphへ到達し得る |
| NE06 K0→container・subject・元site | NL06→NL01／NL02／NL03／NL07／NL13 | K0の5参照とKS01〜10。scalarをobject化せず、KS09範囲未確定を既成handleで補わない |
| NE07 frame／capture→保持対象 | NL03／NL14→NL01／NL02／NL07／NL10／NL12／NL13 | FF02の宣言captureと実stack／局所viewを分離。metadataが同じでも実frame進入／join・非漏出の確認は別 |
| NE08 値cell→draft／sealed・leaf | NL01／NL02→NL08、NL08内部 | mutable Counts／Failure等のlive aliasを不変snapshotとしない。copy／旧draft・共通leafの実共有を確認する必要 |
| NE09 packet→segment→backing | NL09→NL01／NL02／NL10 | 同backing payloadとsegment／custodyの各edgeを分離。partial参照表と上位保持が重なる範囲を残す |
| NE10 view／backing→実storage | NL10と横断NL18 | viewのused lengthだけで元extentを縮小しない。pool／別copy／native retain、取得／返却未確認を別に残す |
| NE11 scratch／演算→元戻り値・一時環境 | NL03／NL11／NL12→NL11／NL12／NL16、横断NL17／NL18 | projection後もraw配列・token／wide一時値・局所／nativeが残る可能性。2面だけで全経路coveredとしない |
| NE12 protocol→既存親／固定上位 | NL01／NL04／NL05／NL06／NL07→NL13 | 親だから算定外とせず、共有／追加保持／寿命延長を分離。root側と親側を同軸で二重加算しない |
| NE13 constructor／pending→部分生成物 | NL13／NL14→NL01〜NL16、横断NL17 | 同stage・同元candidate・返却前後を対応。未知候補を別保持表へ逃がさず、全捕捉不能ならUnknown |
| NE14 scope／brand・closure→元graph | NL15／NL16→NL01〜NL14、横断NL17／NL18 | 固定全field・捕捉先・生成／退役点が必要。opaqueやprivateという名称で小容量とせず、無制限registryなし |

NEは経路分類14であって参照cell総数ではない。同じNE内でもowner・field・frame・固定occurrenceが違えばedgeを区別する。同物のpayloadは実同参照を確認して一度数えるが、各edge位置・異ownerの未退役責務は消さない。所有権移譲は元edgeが必ず即時消滅する操作ではなく、引受未確認なら両側の責務を残す。

NL01〜18とNE01〜14で境界分類を揃えることは、全実graphの閉包・source coverage完了ではない。例えばIR経路を親ownerで止めた場合も、その先の容量はUnknownとして親責務へ残し、0byteや対象外にしない。親全体を小さなviewへ置換済みとしない。置換／copy／wrapperが必要なら別の未承認差分になる。

## 4 未導出残項・責任の引継ぎ

| ID／残項 | 関連node／edge | 次に必要な根拠・責務owner | 不足時の固定扱い |
|---|---|---|---|
| UR01 直接列と実配置の対応 | NL01〜NL07、NE01／02／04〜06 | 元field・埋込み／別payload・参照幅／container、各construction owner | 形式部分和だけで全容量成功にしない。案別の差分・重複は未確定 |
| UR02 同一node／同位置edgeの対応 | NL01〜NL16、NE01〜14 | 同owner／subject／origin／epoch・実同参照と元field、元private生成owner | 値一致でdedupせず、実別allocationとも断定しない。対応不明分はUnknown |
| UR03 C／L／Mの先行捕捉と寿命 | NL03〜NL06／NL13／NL17、NE02／03／13 | 専用slot、元caller・部分格納・退出／非漏出、固定caller／親 | 既存空位置を捏造せず、生成／採用接続を閉じる。旧参照・先行診断を保持 |
| UR04 constructor／root退出・追加scope | NL14／NL15、NE07／13／14 | 固有の全field・元確定点・必要class／位置数、親／元引受owner | role用EVやKS種数から不足を埋めない。追加対象の発行・claim消費なし |
| UR05 brand／registry／closureの有限化 | NL16、NE14 | 全保持field・件数／capacity・固定codeとinstanceの共有、元module／construction owner | 任意登録口・grow・event列を導入しない。未列挙内部容量はUnknown |
| UR06 親・上位との共有／追加保持 | NL13と各到達先、NE12 | 同時点の親単独保持・root追加edge・最後の利用条件、親／CustodyOwner | 既存object新規0件を追加保持0byteにしない。固定引受未確認を減算しない |
| UR07 一時値・部分生成／raw戻り値 | NL08〜NL12／NL17、NE08〜11／13 | nested allocation・元draft／新copy・局所変数の同時位置、元producer | 正規採用数やNCラベル数で全生成物数を制限したことにしない |
| UR08 実extent／allocator・解放 | NL10／NL18、NE10／11／14 | request／view／extent／pool／header・実返却の区別、元取得／保持owner | 超過／不明allocationを予約内にclipせず、local clear・GC／OS返却を同一視しない |
| UR09 経路別の同時保持・費目coverage | 全NL／NE、PX／PF・PH01〜11 | 表現／準備案・正常／故障prefixの一意集合と全edge、TrialOwner／各元owner | 排他的案や各部分最大の総和を合法最大にしない。元時間／予算を緩めない |

未導出残項は自由に使える残予算や新しい受理reasonではなく、容量判断を保留する根拠である。元操作の実行owner、field保持owner、最終責務ownerを分けて記載し、親／TrialOwnerのinclusive量と子の内訳を同じ軸で二重加算しない。由来が確定できないruntime保持も「ownerなし・無料」にせず、観測不能／未確認として元の取得・保持責務へ残す。

## 5 境界の扱いと失敗時の所有

形状と件数が説明できる範囲を固定して算定を進めても、未導出の先を切り捨てない。台帳上で既出field／同一実体と確認できた部分だけ重複を除き、同一性未確認・追加保持・生成途中・実allocatorの残項を併記する。この台帳は実objectの探索・getter／Proxy／iterator・heap dump・GC観測・実source hash照合を許可するものではない。

root／最小shell生成前は既存親OSlotの停止・Failure・候補保持が前提で、親未成立なら新root／issuerへ入らない。生成返却前／格納途中・A採用／M反映失敗では元candidate・同L／C／Aのprefixを保ち、第二object／緊急shell・別profile・新epochで救済しない。全捕捉不能・OOM／強制終了では保存／回収完了を保証せずUnknownを残す。

firstは元RG14、root前は親OSlotの正規診断へ保持し、二次不足は既存有限分類へ結合する。raw例外・stack・無制限の未確認物リストを新設しない。停止後は元Duty／Exit・旧対象・元予算の固定退出／保持確認だけへ合流し、新しい通常利用・発行・claim resetはしない。retire factが元frame／rootへ戻るedgeを持つ限り、その寿命延長を残す。

固定対応の確認順は、NL分類→元field／生成site→NE保持境界→同一性／重複の根拠→部分式とUR残項→各owner／費目、とする案。現時点では実nodeの全fieldや実共有を確認したわけではなく、次段のprivate対応／算定に必要な入口である。URが残る間、総容量・cap充足・最大同時保持を成功扱いしない。

## 6 費目・phase別全容量への引継ぎ

準備OP00、供給確認OP01、binding OP02、元進入／取得／演算OP03〜OP11、受付OP12、writer／post・encoding OP13、segment／通知／receipt OP14、既存境界記録OP15、guard／分類OP16／OP17、別故障OP18、custody／退役OP19へ各occurrenceの主費目を一つ対応付ける。nodeの共有で検査／格納／退出確認費を消さず、元操作失敗と後続の別失敗処理も分ける。未計上費を既存Counts9件やcleanup余りへ吸収しない。

列挙部分63+45ρ／record、F0一組41+42ρ、I0の3+10ρ、K0の4+5ρ、EVの2+qρ、scratch20,480 logical byte・出力予約13,400／14,309byteはいずれも元条件を維持する。異なる部分式の全てを単純加算して全memoryとせず、どのNL／NEが既出で、どこが追加・横断URなのかを先に対応付ける。実参照幅ρや全到達先／実配置が不明なまま数値総量を出さない。

次段は本台帳を元に、各表現／準備案の固定対象へ一意payloadと保持edgeを対応付け、PH01〜11・正常／PF故障prefixで同時に残る集合を積み上げること。テンプレート外NL14〜18を含む残項を併記し、保守包絡・到達可能な合法最大・実allocator保持量を別に扱う。今回はその対応の実証・全容量計算・最大同時保持の数値化・実E要求量確定は行わない。

元Q／R／tail・原起点／全deadline・列挙取得62／70、5秒期限・既定並列度を維持する。新clock／poll、取得やcreditの再利用、実採取・実保管操作・実接続で未導出分を補完しない。

## 7 独立検証の受入条件案（全て未実施）

| ID | 独立対照 | 必須条件 |
|---|---|---|
| LV01 T内／外の対象 | TG／EC／IR／KSとNLの別対応表 | EV／issuer／handleだけを全容量とせず、親・退出・registry・一時値を残す |
| LV02 既出部分の重複 | R1／L0／F0のfield所有位置を別表へ | RG13〜15、LC、同backing等を別名で二重計上しない |
| LV03 横断NL17／18 | 元nodeと部分生成／実配置の別軸を対照 | 分類行数をnode数にせず、partialやheaderを常に別nodeとして加算しない |
| LV04 C／A／MとL／U | 同payload・複数保持cell・元callerを別計算 | 同物payloadは一つでも各edgeと寿命延長を残す。未確認共有でdedupしない |
| LV05 EV／I0／K0全参照 | EC／IF／IRとNE04〜06を独立に対応 | scalarをobject化せず、privateという名前で親graphを0にしない |
| LV06 constructor／root退出・scope不足 | NL14／15と元CM／EVの対象を別対照 | role証拠・KS09候補で不足を埋めず、追加issuer／claimを作らない |
| LV07 親共有・cycle | 同node unionと全edge・追加保持を別計算 | 無限加算と親無料扱いを避け、親単独保持不明はUnknown |
| LV08 生成／格納・採用故障 | NL17・UR03／07・元PX／PFの別表 | 正規採用数で全allocationを制限せず、元参照・first・未確認末尾を保持 |
| LV09 予約／実extent・退役 | NL10／18・UR08の別関係を対照 | request／used lengthで実capacityをclipせず、clearとreclaim／OS返却を分離 |
| LV10 案別・経路別の全容量 | 全NL／NE・URと費目の別台帳 | 未導出項0・部分式の総cap昇格・排他的最大の合算・期限延長なし |

oracleは対象のregistry／alias／容量／費目helperを再利用せず、元field・node分類・edge境界・失敗prefixの独立表を用いる計画。今回は検査器・fixture・合成試験を実装／実行せず、文書・表・リンクと既出部分式の記載だけを静的に確認する。

## 8 未承認事項と今回の範囲

- [ ] NL分類のT内外・既出field対応と、未列挙対象の必要性／所有境界のレビュー。
- [ ] NE全経路・実同一性／同位置・C／A／M／L／Uの保持先と寿命の確認。
- [ ] UR01〜09の生成／部分生成・全field／件数・実配置／解放根拠の有限化。
- [ ] 案別・phase／故障prefix別の全容量・最大同時保持・費目coverageの確認。
- [ ] LOAD6／LOAD7・配置／共有／容量と実装・発行／消費・合成試験・実確認／保管の個別承認。

全て未承認。本MDと親2文書の参照更新のみ。元の5秒期限・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは行わない。

文書整合として対象3文書のローカルリンク25件・表21個の列数、NL01〜18／NE01〜14／UR01〜09／LV01〜10の51行のID連番・参照範囲、全NL分類のNE欄への対応、NL17／18の横断分類、未承認チェック5項目、既出部分式・費目OP00〜19、末尾改行・差分空白を静的に確認した。分類数18／14はnode／edge実数ではなく、台帳の網羅性チェックも実graphの閉包・source coverageの実証ではない。実同一性／実保持・全容量・最大同時保持・回収／終了保証は未確認で、合成試験・製品試験・採取・実通信は実行していない。

## 9 後続の元field／生成site・案別重複判定（2026-11-16）

[元field／生成siteとnode／edgeの案別対応・重複判定draft-0.1](BEST_PRACTICE_WFB_SGA_FIELD_SITE_VARIANT_IDENTITY_MAPPING_DESIGN.md)で、既出位置・追加候補・未確定と、同event／同cell／同payload／共有先を分離した。元fieldからNL／NEへの対応と、共有・寿命延長・部分生成の判定条件を整理し、実同一性／実配置はUnknownに残す。方式・選択未承認、元5秒／既定並列度・各閉鎖条件・調査保留を維持し、実装・発行・消費・採取・再実行は行わない。
