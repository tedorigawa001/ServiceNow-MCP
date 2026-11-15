# WF-B SG-A後：canonical発行位置・同一性・多重度と一度限り消費の対応台帳

Version: draft-0.1 / Date: 2026-11-15 / 読取り基準HEAD: `85d543a`。

Status: **対応台帳・状態遷移の詳細設計のみ。LOAD6／LOAD7・canonical位置対応案・内部配置・storage／writer方式・容量capは未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[graph境界・canonical値／protocol形状draft-0.1](BEST_PRACTICE_WFB_SGA_GRAPH_BOUNDARY_CANONICAL_PROTOCOL_SHAPE_DESIGN.md)と[全root field・参照先台帳draft-0.2](BEST_PRACTICE_WFB_SGA_ROOT_FIELD_REFERENT_LEDGER_DESIGN.md)。[L0配置・費目所有draft-0.1](BEST_PRACTICE_WFB_SGA_INTERNAL_SLOT_LAYOUT_CAPACITY_COST_DESIGN.md)のfield列・幅を変更せず、[同backing・writer退出設計draft-0.2](BEST_PRACTICE_WFB_SGA_BACKING_OWNERSHIP_WRITER_EXIT_DESIGN.md)と[固定schedule draft-0.3](BEST_PRACTICE_WFB_SGA_FIXED_SCHEDULE_SLOT_ENCODING_DESIGN.md)の前提を保つ。以下は将来のprivate接続に必要な設計案で、現codeにこの対応があると照合したものではない。

## 1 正規位置・発行・消費・事実の区別

canonical位置は一つの意味上のone-shotを所有する正規state位置であり、同名fieldの個数や参照先object数とは異なる。同じeventを表す観測用fieldがあっても、そこへ別の未消費bitを書いて新しい権限を作らない。本書の位置IDは静的な設計labelで、実runtimeの検索key／登録API／公開tokenではない。

| 区分 | 意味 | 代用できないもの |
|---|---|---|
| 先行位置準備 | 空位置・停止・診断・責務を処理前に保持 | 正式issuerの結合・発行済み・開始許可 |
| private発行／binding | 固定生成元が同owner／subject／origin／epoch・正規位置へ結合する候補 | 値の生成・同値copy・summaryによる昇格 |
| claim消費 | 正規位置を一度だけ未試行→消費済みへ進める | 実body開始・write完了・退出・受理・解放成功 |
| 事実の確定 | 同frame／同attemptの固定観測・復帰継続で確認する | claim消費だけ、finallyだけ、callback settleだけ |
| projection | 同canonical eventの観測用tag／参照 | 独立した開始／再発行／消費口 |

同一性の検査単位は、同root／trial／source／schema／配置版／profile、固定subject位置、意味上のclaim kind、private issuer、origin、epoch、同attemptの組である。labelや数値epochが等しくても同一とはしない。違うkindは同じ位置へ束ねず、同じkind・subjectの別copyを新規資格へしない。

発行元は同ownerの固定private継続だけとし、任意object・外部診断・hash・JSON・fixture登録からcanonical位置／issuer／claimを作らない。合成依存と実runtimeの登録・owner・claim台帳は分離を維持する。正式発行口は閉鎖のままで、以下の発行・消費は全て未実施である。

## 2 canonical claim対応案

N=14／15、P=N−1=13／14、固定4roleはwriter_frame／post_check／segment_build／packet_custody。role位置は4N=56／60、TERMの後2roleは非適用で、適用位置は4P+2=54／58。個数は設計上の位置候補であり、実allocation数・並列active数・実発行数の測定ではない。

| ID／意味 | canonical state位置・生成元／subject | 消費点・固定条件 | 配置数・主費目 |
|---|---|---|---|
| CM00 construction入場 | 親OSlot.claim。既存親のprivate入場継続／同construction | 親OSlot確認後、最小directory生成前。未成立／busy／失効なら新rootへ未入場 | 親側1。OP00／OP02、失敗OP18、保持／退役OP19 |
| CM01 run開始 | RG02.run_claim。TrialOwner／同rootの一回のrun | construction／binding・停止・要件／承認の前提確認後、runへ入る前。現在は閉鎖 | root 1。OP02 |
| CM02 PrePacket封印 | RG02.packet_seal_claim。SamplerOwner／固定P record集合 | 必要な値・各record seal確認後、PrePacketを不変入力にする境界。欠けたrecordをpacket sealで救済しない | root 1。OP12 |
| CM03 notify開始 | RG02.notify_claim。固定通知継続／同PrePacket | nN・停止／予約・packet前提確認後、最初の通知call前。同期throwでも再通知なし | root 1。OP14。nN clockはOP15 |
| CM04 最初のsettle | RG03.settle_claim。固定通知owner／同notify系列 | 同ownerに属する正常／拒否／throw／取消／期限の最初の終端を扱う前。無関係な外部objectに別rootのclaimを消費させない | root 1。OP14。nAckは最初のsettleで一度だけOP15 |
| CM05 最終guard | RG04.guard_claim。TrialOwner／同原起点・予算・pin／frame | 最終guard試行前。同deadlineを使用し、失敗後の再guard・起点変更なし | root 1。OP16、g clockはOP15 |
| CM06 run close | RG02.close_claim。TrialOwner／同run終端処理 | 固定close処理へ一度合流する前。新しい通常操作は閉じ、未確認責務を保持 | root 1。終端OP19、別の失敗処理OP18 |
| CM07 root custody移譲 | RG12.transfer_claim。固定上位ownerへの移譲継続／同root保持責務 | 引受処理開始前。移譲の試行と引受確認を分離し、receiptだけで元責務を解除しない | root 1。OP19 |
| CM08 record seal | LC09[j].seal_claim。正規値producer／同record slot | 同値・同seal時点の入力検査後、当該recordのseal境界前。TERMもこの一位置 | N。OP12、TERM合流の主処理はOP18／OP19 |
| CM09 record encode／取得attempt | LC09[j].encode_claim。固定encoding継続／同Anchor・B[j] | strict sealed値・停止・予算と直前recordの昇格／writer・post退役を確認後、encoder／出力backing取得の最初の副作用前。FS08と早期診断batchは同位置で排他 | N。OP13、受付OP12 |
| CM10 同backing昇格 | LC06[j].claim。固定publish継続／同backing・正規長 | writer joinとpost退役・不変入力の確認後、encoded採用の試行前。消費しても公開成功とは限らない | N。OP13 |
| CM11 role enter | LC08[j,role].enter_claim。固定role owner／同Anchor・role・origin／epoch | そのroleの全前提確認後、権限を与えて固定本体へ入る前。writerの同義fieldは§3に従う | 4N配置、4P+2適用。writer／postはOP13、segment／custodyはOP14 |
| CM12 role退役 | LC08[j,role].retire_claim。固定復帰／退役継続／同enter実体 | 当該roleの退役確認処理の開始前。enter未確認や別originを返却済みにせず、退役試行と確認完了を分離 | 4N配置、4P+2適用。OP19、元のjoin／post確認はOP13等 |

CM02とCM08、CM03とCM04、CM06とCM12、CM07とpacket受理は別の意味である。一つのclaim消費で後続claim・受理・退役まで成功したことにしない。CM04は同ownerが固定通知系列の終端を分類する位置で、任意の受信objectがstateを直接更新する入口ではない。

CM12を消費した後の確認不足は同じ退役試行の未確認として保持し、再貸与・再退役claimの発行で救済しない。同originの遅い復帰を既存Exit／診断へ合流することと、新しい退役処理を再開することを分ける。停止後の通常操作再開を許さず、固定の失敗／退出／保持継続だけが元の責務を扱う。

## 3 同義fieldのprojection対応：第二の消費口を置かない

| ID | 既出field・位置 | 本対応案の正規位置と意味 | 配置・失敗時の扱い |
|---|---|---|---|
| MP01 Construction | RG06.claim、RG06.outer_admission_ref | CM00の親OSlot.claimの消費済み入場を同rootへ結合するprojection。RG06.claim自身に第二の入場権限を持たせない | rootに1つの既出tag位置を残す。RG06生成前にclaimが消費済みでも未消費へ戻さず、OSlot／元frameが保持 |
| MP02 Anchor attempt | LC01[j].claim、LC01[j].attempt | CM09の同record encode／取得attemptのprojection。allocation失敗後もAnchor側から別attemptを生成しない | N個の既出tag位置を残す。LC09.encode_claimが唯一の消費位置。別Anchor／同値sealed値は拒否 |
| MP03 Grant enter | LC04[j].enter_claim、LC04[j].origin／epoch | CM11のLC08[j,writer_frame].enter_claimのprojection。Grantはwrite範囲／失効資格を持つが、第二のwriter開始権限ではない | N個の既出tag位置を残す。roleのcanonical消費を確認できなければbodyへ入らず、staleな未試行mirrorから再入しない |

MP01は最小shellより前に既存親が入場を所有するため、MP02はrecord encodeと最初の取得を一つのattemptにするため、MP03は全role共通のenter位置・enter証拠をLC08へ集約するための候補である。意味の異なる親入場／run開始・record seal／encode・notify／settleを共有する案ではない。

L0／R1のscalar field列・幅は本MDでは変更しない。projectionは通常の呼出し元が自由に書けるcacheではなく、同private ownerの固定継続だけがcanonical結果を反映する位置とする。判定・消費は常に正規位置を参照し、projectionだけを権限判定へ使わない。実装で同一cell alias・追加private参照・別wrapperが必要なら、同位置対応・追加field／参照先容量を別版で算定する。

projectionの更新が中断・失敗した場合、正規claimは既に消費済み／消費未確認であり、元に戻さない。不整合を単に書き直して通常処理を再開せず、先行理由・canonical位置・元projection・未開始／途中frameの責務を保持して停止する。二つのfieldを同時にatomic更新できると仮定しない。

## 4 writer enterの固定順序・消費確定点

| ID | 同期の論理境界案 | 観測・所有・失敗時 |
|---|---|---|
| CE01 | 同root／Anchor／Grant／role・B[j]・origin／epoch・停止と、先行LC05／LC08／Failure・frame責務保持位置の準備を確認。直前recordのWX08昇格とwriter／post退役確認も必須 | 拒否ならwriter本体未開始。別owner／roleの正規位置を変更しない。同flowの失敗責務は保持 |
| CE02 | LC08[j,writer_frame].enter_claimの未試行を確認し、同固定ownerが一度だけ消費済みへ更新 | ここがclaim消費の論理確定点。実write・実frame進入・enter証拠の成功ではない。格納未確認ならbodyへ進まず停止 |
| CE03 | 同canonical eventの結果をLC04.enter_claimへprojectionし、同origin／epoch・同Anchor対応を確認 | 第二のcompare-and-consumeなし。失敗ならspent／未確認を維持、別Grantで再開しない |
| CE04 | 先行LC05とLC08へ同enterの候補・frame責務を記録し、固定writer継続へ渡す | 記録前／途中の失敗ではbody未開始と確認できるかを分離。確認不能なら未確認、元slot／frame保持 |
| CE05 | 固定本体への同frame進入を確認できた位置だけenter事実へ合流 | claim消費を実進入の代用にしない。LC08.enter_evidenceは同enter実体への固定確認物で、消費tagから合成しない |
| CE06 | 正常／throw／取消後、Grant失効・finally候補→固定caller join→post→各role退役へ接続 | finally候補だけでjoin・active=0・次record許可としない。CM12・CM10は別の正規位置 |

CE02の原子的・例外安全な更新機構や非介在はsource保証が必要で、今回は単一threadだから安全、awaitがないから無失敗とは主張しない。更新機構・ownerの直列化が不明なら消費確定／body進入を認めず、閉鎖を維持する。追加clock／poll・lock API・実CASを選択／起動しない。

途中停止の枝は、消費前、正規消費後projection前、projection後frame記録前、記録後body前、body進入後で分ける。正規claimがspentでもbody未開始の枝があり、未消費tagが残っていても停止済みownerの再利用資格にはならない。body未開始と固定境界から確証できなければ、その不足をUnknownとして元Exit／OSlot／frameへ残す。重複要求は第二frame・新しいenter証拠を作らない。

## 5 origin・epoch・frame・証拠／receiptの同一性対応

| ID | 正規位置・確認物の対応 | 発行／確定点・多重度の入口 |
|---|---|---|
| IB01 claim origin | CMの意味kind・同subject・同private issuerへ結合する固定origin位置 | 消費前にpin。複数fieldから参照されても内容labelでinternしない。claim以外の観測originまで同一としない |
| IB02 record attempt | LC01.attemptとPR02.claim_slot_refは同CM09へ結合 | recordあたり高々1の正規attempt位置。LC09の消費失敗／取得throw後もfreshへ戻さない |
| IB03 writer origin／epoch | LC08[writer_frame].origin／epoch、LC04.origin／epochは同enter domain／同private pinへ結合 | 同じ数値epochだけでは不足。roleを変えただけで旧Grantを復活させない。epoch方式・共有粒度は未承認 |
| IB04 実writer frame | RG11.inflight_frame_refが保持する固定frameと、LC05.frame_origin／LC08.writer originが示す同enter実体の対応 | frame objectとorigin tokenを同じobjectと断定しない。RG02のroot frame・RG06／OSlotのconstructor frameは別kindとして保持し、同名だから1個へ畳まない |
| IB05 enter事実／finally候補／join | LC08.enter_evidenceは同role enter、LC05.exit_candidateは同frameのfinally候補、LC05.joinは固定caller合流の状態 | 三者は別段階。candidate copy・callback settleでjoinへ昇格しない。追加join証拠objectが必要なら別field／容量へ |
| IB06 role退役証拠 | LC08[j,role].retire_evidenceとPR07.borrow_slot_ref／retire_slot_refは同CM11／CM12・同originへ結合 | 適用roleの先行位置ごとに一度の正規結果。元enterがなければ返却済みを生成しない |
| IB07 packet受理 | RG03.accepted_receipt_refとPR06.settle_slot_refは同CM04・同PrePacketへ結合 | 正規内容とnAck／h成立条件を満たしたときだけ受理確定。CM04消費済みでも拒否／未確認の枝では受理証拠なし |
| IB08 root custody | RG12.custody_receipt_refは同CM07・同root・固定引受先へ結合 | packet受理や各role退役とは別。移譲試行だけでは元責務を解除しない |
| IB09 outer admission | RG06.outer_admission_ref／PR08は親OSlotの同CM00・同constructionへ結合 | 親未成立・busy・失効なら新root未入場。診断summaryや後発RG06.claimから入場確認物を作らない |

各claim／origin／frame／確認物の参照先全field・実object個数は、この位置対応だけでは完了しない。LC04とLC08にあるepoch参照位置は計5N=70／75だが、同数のepoch objectが存在する証明でも、rootあたり1個へ共有できる証明でもない。root・record・role間のepoch失効domainと実供給元は後続で有限化する。counter方式なら有限上限・overflow拒否が必要で、wrap／resetによる再利用は認めない。

Originの静的発生位置・claim stateの正規位置・返される確認物の位置・それらを指すedge位置を別に列挙する。全参照fieldをそれぞれ独立したissuerや新しいobject生成点として数えず、逆に同issuerを参照するという理由だけで全origin／frameの容量を一つにまとめない。合成成功と実runtimeの同一性証拠は相互昇格しない。

## 6 多重度の構造検算：state位置と実objectを混同しない

| 対象 | 位置数の式 | LOAD6／LOAD7・限界 |
|---|---|---|
| root canonical claim | CM01〜07の7位置 | 7／7。CM00は親側で別計上 |
| record canonical claim | seal・encode／取得・publishの3N | 42／45。projectionを再加算しない |
| role canonical claim配置 | enter／retire各4N＝8N | 112／120。TERM非適用位置も配置費は残る |
| root内canonical配置計 | 7+3N+8N＝7+11N | 161／172。実発行数・heap object数・全claim総容量ではない |
| root内適用canonical位置 | 7+3N+2(4P+2) | 157／168。非適用4位置を消費済み／解放済みにしない |
| root内projection位置 | RG06.claim 1＋LC01.claim N＋LC04.enter_claim N | 29／31。既出fieldを消さず、独立した権限を与えない |
| root内claim名fieldの計 | canonical＋projection＝13N+8 | 190／203。L0／R1の位置の意味付けで、同数の別payload生成ではない |
| 親側construction claim | CM00の1位置 | 1／1。root内161／172や190／203に既に含まれているとしない |

親側のCM00を含むcanonical配置は162／173位置となる候補。その他の既存親owner内部・real worker／runtime・provider／queueのclaimを全て列挙した数ではない。配置数を使用数・実object数・最大同時保持量に変換しない。非適用roleのenter／retire位置は空のまま、消費イベントを捏造しない。

physical cell aliasや複数fieldを一つのobjectへ埋め込む実装を採れば、source対応と追加参照／container費を別に計算する。L0の列挙部分やR1直接fieldの既存容量をこの表から自動減算しない。未知のorigin・epoch・frame・確認物・局所captureはUnknownのままである。

## 7 失敗・再入・失効と費目所有

| 境界 | 固定の扱い | 主費目・保持owner |
|---|---|---|
| 正規位置を同一性確認できない／別owner・kind・subject | その別ownerのclaimを変更しない。自flowの拒否・不足は保持し、外部診断から補完しない | 元検査OP02／OP12等、別の失敗処理OP18。元TrialOwner／親owner |
| 自ownerの消費前拒否・停止 | 未消費という観測を残しても、停止後に新しい通常処理を開始しない | 元OPとOP18、未生成／保持物は元slot／OSlot |
| 消費格納がthrow／成否未確認 | spentともfreshとも推定せず、消費未確認・元値・subject／frame責務を保持。retry・再issuerなし | 元OP、固定失敗OP18、保持／退役OP19 |
| canonical消費済み・projection不整合 | spentを維持し、第二の消費・body開始・別wrapper生成で救済しない | 元OP、元canonical／projection／frameを同ownerが保持 |
| body開始後のthrow／取消・late復帰 | Grant失効と退出を分離し、同旧attemptのExit／診断へだけ合流 | 元OP13等、固定失敗OP18、join／退役の元OPとOP19 |
| receipt／custodyが未確認 | 初回settle／transfer claimを戻さず、元payload・借用・上位責務を保持 | OP14／OP19。費用・支出prefixをresetしない |

準備OP00、固定供給確認OP01、binding／開始OP02、arm OP03、予定入場OP04、取得／投影／演算OP05〜OP11、受付OP12、encoding OP13、通知／receipt OP14、追加clock／境界記録OP15、guard／試行分類OP16／OP17、固定失敗OP18、custody／退役OP19を維持する。一つの実occurrenceに主費目は一つ。canonical消費とprojection更新は別の更新workになり得るが、二つの開始支出へはしない。

本対応でallocation／encodingの会計prefixを消さず、CM09の消費・出力予約への支出・実allocation成否を別状態で扱う。元claim消費と配賦の同期的結合・失敗prefix・更新費はsource coverageが必要であり、位置数だけで二重計上防止を実証したとはしない。追加clock・pollはなく、元5秒・既定並列度、列挙取得62／70を変更しない。係数・実費・全参照先容量はUnknownである。

## 8 独立検証の受入条件案（全て未実施）

| ID | 独立対照 | 必須条件 |
|---|---|---|
| CI01 | 全CM行・同義field・別義claim | 正規位置一つ。notify／settle、record／packet seal等は別意味を維持 |
| CI02 | OSlot消費後にRG06未生成／生成失敗 | 第二入場なし。親／pending／元frame責務を保持、後発claimで救済しない |
| CI03 | LC09 encode消費後のAnchor不整合・取得throw | LC01から別attemptなし。FS08と早期診断batchも同claimで排他 |
| CI04 | CE01〜06の各故障位置・再入 | canonical consumed後は再消費なし。body未開始／進入／未確認を分離 |
| CI05 | LC04未試行projectionだけ残る・別role／epoch混入 | 消費状態はLC08正規位置で判定し、Grant／停止／範囲／同一性等の全前提も検査。不整合なら停止し、別ownerのclaimを消費しない |
| CI06 | 同phase・同値origin・別frameのfinally候補／Ack | join／退役へ昇格せず、元の未確認責務を保持 |
| CI07 | settle消費済みだがnAck不正／receipt拒否、custody未確認 | 受理・h・引受成功を捏造しない。late応答で第二系列を作らない |
| CI08 | canonical／projection／非適用／親側位置の算定 | 161／172、29／31、157／168、親1を区別。field費・object数へ誤変換しない |
| CI09 | epoch wrap／停止後再bind・summaryから再発行 | 正規issuer／同slot以外は拒否。失効・消費履歴をresetしない |
| CI10 | 消費と支出を二重計上・更新費脱落・新clock | 各更新workと一度の開始支出を分離し、費目・期限・閉鎖条件を維持 |

oracleは対象のclaim／identity／projection helperを流用せず、CMとMPの別対応表・固定故障prefix・実参照の期待関係を使う計画。今回はMDリンク・表・定数式だけを静的に確認し、issuer・台帳・合成テスト・source照合・実claim消費は実装／実行しない。

## 9 未承認事項と今回の範囲

- [ ] canonical位置CM00〜12とprojection MP01〜03の意味・所有・非介在のレビュー。
- [ ] 正規消費・projection・frame進入・退出／受理確定の失敗prefixのレビュー。
- [ ] origin／epoch／frame／確認物のsource対応・参照先全形状・実容量の有限化。
- [ ] 全更新work・開始支出・退役の費目、phase別同時保持と実費の確認。
- [ ] LOAD6／LOAD7・対応案／配置／方式／容量と、実装／合成試験／実確認／保管の個別承認。

全て未承認。本MDと親2文書の参照更新だけを行う。元の5秒期限・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは行わない。

文書整合として対象3文書のローカルリンク18件・表26個の列数、CM00〜12／MP01〜03／CE01〜06／IB01〜09／CI01〜10のID連番、未承認チェック5項目、CMの正規位置名、canonical／projection／適用位置／親側位置とepoch参照位置の定数関係、費目OP00〜19の記載、末尾改行・差分空白を確認した。文書と定数の静的検算のみで、実装・source同位置対応・発行／claim消費・合成試験・負荷採取・試験再実行・実object個数／参照先容量／最大同時保持／実費の実証ではない。

## 10 後続のorigin／epoch生成・失効・共有（2026-11-15）

[origin／epoch生成元・結合・失効範囲と共有条件draft-0.1](BEST_PRACTICE_WFB_SGA_ORIGIN_EPOCH_BINDING_REVOCATION_DESIGN.md)で、由来の親と失効の親、通常開始と旧対象の退出／固定terminal、binding位置と不変pin共有を分けた。CM／MPの正規位置を変更せず、D／S方式・source保証・実容量は未承認／Unknownのまま残す。元5秒／既定並列度・各閉鎖条件・調査保留を維持し、実装・発行・消費・採取・再実行は行わない。

## 11 後続のframe全field・capture／確認物境界（2026-11-15）

[frame／capture台帳・確認物slot対応draft-0.1](BEST_PRACTICE_WFB_SGA_FRAME_CAPTURE_EVIDENCE_SLOT_DESIGN.md)で、非証拠の先行保持と、enter事実／finally候補／join／退役／上位受理の正規位置を分離した。CM消費をbody進入・退出成功にせず、追加DutyやJoinFactが必要な場合のfield／容量／費目を残す。配置・選択未承認、各閉鎖条件・元5秒／既定並列度・Unknown・調査保留を維持し、実装・発行・消費・採取・再実行は行わない。

## 12 後続の確認物ごとの正規採用・失敗prefix（2026-11-15）

[確認物の正規slot・生成元・確定境界draft-0.1](BEST_PRACTICE_WFB_SGA_EVIDENCE_CANONICAL_SLOT_MAPPING_DESIGN.md)で、CM消費・実事実・canonical採用・F0反映を分離し、各EVの同一性と保持責務を具体化した。新しいclaimを追加せず、role退役・packet受理・root custody・親入場を相互代用しない。追加payload／配置・選択未承認、元5秒／既定並列度・各閉鎖条件・Unknown・調査保留を維持し、実装・発行・消費・採取・再実行は行わない。
