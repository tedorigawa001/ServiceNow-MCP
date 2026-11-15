# WF-B SG-A後：確認物の正規slot・生成元・確定境界

Version: draft-0.1 / Date: 2026-11-15 / 読取り基準HEAD: `2cdf22d`。

Status: **確認物対応の詳細設計のみ。LOAD6／LOAD7の選択・F0配置・追加object／slot・共有方式・容量capは未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[frame／capture台帳draft-0.2](BEST_PRACTICE_WFB_SGA_FRAME_CAPTURE_EVIDENCE_SLOT_DESIGN.md)と[canonical claim対応draft-0.1](BEST_PRACTICE_WFB_SGA_CANONICAL_ISSUANCE_CLAIM_LEDGER_DESIGN.md)。[全root field台帳draft-0.2](BEST_PRACTICE_WFB_SGA_ROOT_FIELD_REFERENT_LEDGER_DESIGN.md)、[L0配置draft-0.1](BEST_PRACTICE_WFB_SGA_INTERNAL_SLOT_LAYOUT_CAPACITY_COST_DESIGN.md)、[origin／epoch契約draft-0.1](BEST_PRACTICE_WFB_SGA_ORIGIN_EPOCH_BINDING_REVOCATION_DESIGN.md)、[graph境界draft-0.1](BEST_PRACTICE_WFB_SGA_GRAPH_BOUNDARY_CANONICAL_PROTOCOL_SHAPE_DESIGN.md)を維持する。全て将来のprivate接続に必要な対応案であり、現sourceへ接続済み・実証済みという記録ではない。

## 1 位置・確認・表現を分離する

EV01〜07の形状は親F0の候補を引き継ぎ、本書で新しい証拠kind・汎用issuer・独立claimを追加しない。以下の「正規slot」はcanonical状態／既出参照位置の意味で、実装済みobjectのアドレスや検索keyではない。確認の事実、参照を置く位置、参照先objectは別である。

| 区分 | 固定する意味 | ここから導かないこと |
|---|---|---|
| claim | CM00〜12の元one-shot位置。開始／終端試行を一度扱う | body進入・join・受理・退役の成功 |
| 正規状態facet | 同ownerの既出状態と、その状態を確定した固定継続の関係 | 同じfield列の新objectや参照の実在 |
| private確認物参照 | 既出の参照位置に同生成物を結合する候補 | 空slot・同値copy・診断からの発行 |
| F0観測／duty | 元frame・候補・不足・保持責務の追跡 | 第二のcanonical位置・消費権限・退役成功 |

同一性は同root／trial／source／schema／配置版／profileのContext、固定subject、kind、issuer、origin／epoch、frame／元claim／元packet等の該当実参照を通して確認する。必要な組は確認物ごとに§2へ限定する。EV05〜07の形状へepoch／frame fieldを無断追加せず、それらが必要なowner資格は既存Context／originのprivate経路で検査する。経路未確認なら受理不可・Unknownであり、外部labelから補完しない。

## 2 EV01〜07の生成元・正規採用先・確定点

| ID／対応するEV | 生成元・subject／必要な同一性 | 正規採用先とF0側の保持 | 確定点・失敗時の元責務 |
|---|---|---|---|
| EM01 EV01 EnterFact | 固定role本体の進入を確認するprivate継続。同Anchor／role／CM11／origin／epoch／frame・issuer | canonicalはLC08[j,role].enter_evidence。FF01.enter_fact_refは同確認物への観測edge候補で、別EnterFactを作らない。Dutyの準備状態は証拠でない | 同CM11消費後に実進入を固定境界から確認し、同参照採用を確認した場合だけenter確認。CE02 spent／CE04記録では不足。候補／格納未確認は元frameと先行位置へ残す |
| EM02 EV02 FinallyCandidate | 同frameのfinally区間の固定継続。同issuer／subject／origin／epoch／frameと元Exit | writerはLC05[j].exit_candidate。FF01／FF03.exit_candidate_refは同候補へのedge。非writerはF0の同Duty側候補位置への対応案であり、LC05を流用しない | finallyに到達し同候補を記録した事実だけ。return前なのでjoin／参照返却成功ではない。finally途中故障・未確認write／captureは元frame／Exitに保持 |
| EM03 EV03 JoinFact | 同frameを呼んだ固定callerの復帰継続。同元candidate／subject／origin／epoch／frame、後続利用なしの根拠 | writerの正規状態はLC05[j].join。FF01／FF03.join_fact_refは別objectが承認される場合だけ使う候補位置。非writerのDuty.join_stateは補助観測で、正規根拠となるcaller継続は未照合 | 同return／catch・in-flight合流と必要な非漏出条件を確認した境界。LC05.joinはscalarであり、参照格納先ではない。finally／Promise settle／tag単独では不足。追加objectなしで参照が存在するとはしない |
| EM04 EV04 RoleRetireFact | 同roleの固定退役継続。同元EnterFact／CM11／CM12／Anchor／role／origin／epoch、対象frameのjoinと返却確認 | canonicalはLC08[j,role].retire_evidence。FF03.retire_fact_refは同確認物へのedge候補。LC07の各退役状態は対象別の確認であり第二issuerにしない | 同CM12の一度の退役試行で、元enterと退出／参照返却を確認したときだけ採用。spentだけでは不足。未確認なら元role／Exit／上位borrow責務を保持し、再貸与しない |
| EM05 EV05 PacketReceipt | 同notify系列の固定受理継続。同issuer／PrePacket／origin／CM04、元notifyとContextの関係 | canonicalはRG03.accepted_receipt_ref。RG03.packet_ref／receipt_origin_refと結合。F0のpending／packet参照は受理権限ではない | 最初のsettleを同ownerが分類し、内容と既存nAck／h条件を満たす正規受理を確認した境界。throw／reject／取消／期限・時刻不足は受理成功なし。CM04と支出prefixを戻さず元packet責務を残す |
| EM06 EV06 RootCustodyFact | 同rootの固定上位引受継続。同issuer／subject root／origin／CM07、既存親・固定引受先／借用・退役対象 | canonicalはRG12.custody_receipt_ref。RG12.parent_ref／unresolved_registry_refとの同責務関係が必要。roleのretire_evidenceやpacket受理を流用しない | 同CM07の移譲試行とは別に上位引受を確認した境界。引受対象の範囲を明示し、receiptだけでlocal_ref／reclaim／OS_returnを一括成功にしない。未確認は元ownerと上位の未確認責務へ |
| EM07 EV07 OuterAdmission | 既に存在する親OSlotの固定private入場継続。同parent／OSlot／origin／CM00・同construction | 後発RG06.outer_admission_refへ元入場確認物を結合。RG06.claimはMP01 projectionで第二claimではない。root生成前は親OSlot／元生成frameが保持 | 親OSlot確認とCM00入場の元確定点を後発rootへ結合したことを確認。rootへの格納だけで過去の入場事実を作らない。親未成立／busy／失効なら未入場、途中失敗は親・元候補を保持 |

EM01／04の元確認物が他のF0参照位置へも必要なら、同実体への追加edgeとして対応を記録する。一つの採用と全edge格納は別で、複数fieldを同時更新できるとは仮定しない。元slot確認後にF0への反映が失敗しても元canonical結果を未試行へ戻さず、通常利用を停止して不足を保持する。F0 mirror単独からcanonical成功を再構成しない。

## 3 constructor／rootと4roleの適用範囲

| ID／対象 | 適用する確認境界 | 非適用・不足の扱い |
|---|---|---|
| EA01 constructor | EV07は同constructionの入場。EV02／03のfinally候補／復帰確認はConstructorDuty・親固定callerの別対象 | EV07はbody進入・constructor joinではない。LC08 role用EV01／04をCM00へ転用しない。constructor固有の確認参照・全形状は未承認 |
| EA02 root orchestration | CM01の元run開始、RootDutyの退出確認、EV05のpacket受理、EV06のroot custodyを各対象へ分離 | CM01 spentは実run進入確認でない。LC08用EnterFact／RoleRetireFactでroot全体を証明しない。子duty・予定配送・root復帰／終端の実確認経路は別に必要 |
| EA03 writer_frame | EV01・EV02・EV03・EV04。LC08とLC05、同Grant／in-flightに結合 | Grant失効はjoinでなく、writer退役はpost完了でない。WX08／CM10の前提を維持 |
| EA04 post_check | EV01・EV02・EV03・EV04を同post subjectへ。writer join／退役後に入る | writerのLC05.join／finally候補をpost自身の確認へ流用しない。post固定caller／Duty対応は未照合 |
| EA05 segment_build | encoded昇格後の同segment roleにEV01〜04。元segment／残した参照の引受を分離 | writer／postの復帰でsegment joinを代用しない。TERMの同roleは非適用で空配置費を残す |
| EA06 packet_custody | 同packetを読むroleごとのEV01〜04。EV05はpacket全体、EV06はroot保持責務として別 | 一つのcallbackが複数recordへ触れてもroleを統合しない。TERMの同roleは非適用。packet受理だけでborrow退役せず、read復帰と上位保持を分離 |

ここで非writerへEV02／03を対応させるのはF0のkind別duty案であり、そのprivate継続や追加確認objectが既にあるという宣言ではない。writerのLC05以外については元callerの確認点と保持先が対応するまでjoin成功へ接続しない。constructor／rootにもkind固有の入場／退出事実が必要だが、本書でEV01〜07を拡張・汎用化せず、不足をUnknownとして残す。

## 4 同位置facet／別payloadの分類と選択条件

| ID／区分 | 対応案・採用条件 | 容量・承認への引継ぎ |
|---|---|---|
| EP01 既出参照位置 | EV01／02 writer／04／05／06／07には既出LC／RG参照位置がある | 参照先の全field・実供給・実容量は別。同じ名前のfieldがあるだけでobject実在・発行済みとしない |
| EP02 同位置状態facet | EV03 writerのLC05.joinと同固定caller継続を根拠に、内部境界で直接関係を確認する案。第二claim／新JoinFact objectを置かない | これは候補で未選択。F0.join_fact_refにscalarを格納・確認object生成済みと扱わない。必要なframe／candidate保持と確認費は残る |
| EP03 別immutable確認payload | 境界を越えてJoinFact参照が必要な場合の案。親EV03の閉じたfield・private issuer／同対象・元確定点を追加payloadへ結合する | これも未選択。候補・採用・失敗保持先と生成費・全参照先容量を先に算定する。既存LC05にjoin_fact用参照fieldがあると見なさない |
| EP04 同実体への観測edge | F0.enter_fact_ref／exit_candidate_ref／join_fact_ref／retire_fact_ref等が同確認物を指す対応 | 別edge費と寿命延長を残す。source同実参照が未確認ならpayload dedup不可。同値copyやkind違いをaliasとしない |

EP02／03の選択条件は、固定callerの確認根拠をその場で同ownerが使い切れるか、後続ownerへ同確認事実の参照を持ち越す必要があるか、保持先・生成途中失敗・全edge更新・費用を有限に説明できるかである。便利さやscalar名一致だけで選ばない。いずれの案も現時点では未承認・未接続で、同位置facetから任意の外部consumer向け証拠を発行できることにはしない。

各EVのkind／stateは固定の事実範囲を識別する値であり、書換えでEV02をEV03へ、EV05をEV04／06へ変換しない。後段の事実を確認するにはその元対象・元確定点が必要である。新しい確認処理のためのclock／poll、汎用deep検査、hash／JSON／summaryからの昇格口は設けない。

## 5 一度の受理に向けた固定順序・失敗prefix

以下は将来の同期境界の設計順序で、実call／格納を行うものではない。正規CMの既出one-shotを再利用し、確認物ごとに別の新claimを導入しない。元消費の記録・事実の確認・採用は別の確定点である。

| ID／段階 | 固定確認・更新順序 | 失敗時に残すもの |
|---|---|---|
| ES01 元配置の準備 | Context／subject、canonical slot、元Duty／Exit／OSlot、診断／停止／予算と既存候補保持位置を先に確認 | 不足なら新生成・CM消費・bodyなし。空保持位置は確認物でない |
| ES02 origin／適用の照合 | 同issuer／kind／subject／元参照、通常操作か旧対象の固定退出／保持確認かを分ける | 異ownerのslot／claimを書き換えない。自flowの取得済み候補責務は保持 |
| ES03 元CM・元事実の確認 | 各EVに対応する既出CMの状態と、EMの実進入／finally／復帰／受理／引受等の事実を分離して確認 | 消費済みでも事実不足なら成功物なし。消費未確認をfreshへ戻さない |
| ES04 候補の元保持 | private producerが元frame／先行保持位置で候補を捕捉。facet案では新object生成を要求しない | 返却前／格納前／格納未確認を区別。同候補を第二生成物で救済しない |
| ES05 同参照・関係の全確認 | 元確定点と同対象、固定field・kind・slot対応・停止／予算の該当条件を確認 | 状態tagだけで受理せず、raw例外・stack・任意closureを確認物へ詰めない |
| ES06 正規位置への採用確認 | 参照型は元canonical参照への同物採用と確認。状態facet型は元状態と固定継続の関係確認。二者を混同しない | 部分更新／成否不明は未確認、後段へ進めない。元候補・元slotを戻さない |
| ES07 F0観測・dutyへの反映 | 同確認物／元事実をF0の適用位置へ反映し、同ownerで関係を確認 | 全edge更新はatomicでない。canonical成功後のmirror失敗を再発行で修復しない |
| ES08 固定復帰・保持継続 | 同callerへ復帰し、次段の独立条件へ。local_ref／上位引受／reclaim／OS返却を別確認 | 旧frame／未確認物は元責務へ。確認物受理だけで全capture消滅・root終端にしない |

F0のFF03はframe／capture candidate、exit candidate等を列挙しているが、あらゆるEVの未格納候補を同時に保持する専用slotが揃うという保証ではない。FF01.enter_fact_refや汎用pending一位置で全生成途中物を捕捉できるとも言わない。EVごとのproducer局所保持→正規slot→観測edgeの実経路が不足する場合は、元frame／元slotの保持責務と不足を残し、その生成へ接続しない。追加slot・closure・保持表を暗黙に作らない。

正常な重複要求を含め、再発行・第二採用・claim resetは認めない。同canonical事実の内部参照照合と、後続状態を再実行することは別である。確認後の読取り資格・寿命は元ownerの固定契約に限り、新しいone-shotや再貸与を作らない。

## 6 拒否・失効・保持ownerと費目

| ID／不足・故障 | 固定の扱い・最終責務 | 主費目 |
|---|---|---|
| ER01 親／Duty／候補保持先未成立 | body／生成へ入らない。親成立前の完全捕捉・記録成功は保証せず、既存親の未確認責務 | OP00／OP02、不足の別処理OP18 |
| ER02 別owner・kind・subject・frame／同値copy | 正規位置へ採用せず、別ownerのCMを消費しない。既に取得した自候補は元frameで保持 | 元検査OP02／OP12等、別故障OP18、保持OP19 |
| ER03 元CM消費後・事実未確認 | spent／消費未確認を保持。固定境界で分かるbody未開始と進入不明を分離 | 元OP、OP18／OP19。元canonical owner／Exit |
| ER04 候補生成・返却／採用・mirror格納途中 | 生成prefixと元参照を保持。全捕捉不能ならUnknown、第二candidate／動的診断列なし | 元生成／検査費とOP18／OP19。元producer／Duty／OSlot |
| ER05 finallyだけ・join不足・参照漏出 | EV02の範囲を超えて成功化せず、同frame／Exit／capture責務を維持 | writer等の元OP13／OP14、OP18／OP19 |
| ER06 notify失敗・後着／上位引受未確認 | EV05／06の元系列を戻さず、packet／root／借用の未確認責務を保持。新notify／transferなし | OP14／OP19、別故障OP18。SamplerOwner／CustodyOwner／親 |
| ER07 停止／epoch失効・late復帰 | 通常操作は閉鎖。同旧対象・先行Duty／Exit・元予算の固定退出／保持継続のみ。資格不明なら未確認保持 | 元確認費・OP18／OP19。元owner／固定caller |
| ER08 local退役後・実解放未確認 | 確認した層だけ更新。alias／上位保持／stack／allocatorの不足をUnknownに残す | OP19。元ownerと引受を確認した上位owner |

最初の理由はRG14、root成立前は親OSlotの正規診断に保持する。追加不足は既存有限分類へ結合する設計であり、元理由を上書き・raw例外保存しない。RG07のunconfirmed_holder_refや一つのpendingを全候補収納庫と見なさず、不足する保持は元frame／正規位置・未確認責務に残す。全参照捕捉・OOM時保存・process終端まで保証しない。

候補位置準備OP00、供給確認OP01、同一性結合OP02、元進入／取得・演算OP03〜OP11、受付OP12、writer／post確認・encoding OP13、通知／receipt・segment OP14、既存境界記録OP15、guard／分類OP16／OP17、別の固定失敗OP18、custody／退役OP19の元occurrenceへ対応する。確認と格納・元操作失敗と別失敗処理の費用を分離し、各操作の主費目は一つとする。元Q／R／tail・期限・既存列挙取得を変更せず、追加objectの生成／保持費を無料としない。全実装coverage・実費・実容量は未導出である。

## 7 容量・最大同時保持への引継ぎ（今回の次段）

正規role位置は4N＝56／60、適用4P+2＝54／58。enter／retireの既出参照位置は各4N、合わせ8N＝112／120、適用分の位置は2(4P+2)＝108／116である。非適用TERM後2roleにも空配置費は残る。これらはLC08の参照位置数で、全EVの発行数・object数・同時live数ではない。

LC05.joinはN個のscalar位置で、N個のJoinFact参照位置ではない。F0の候補／採用edge・既存LC05／LC08／RG参照・追加payloadの対応が確定してから、一意payloadと全edge位置を別に数える。EP02／03未選択のまま追加JoinFactを0個又はN個と断定しない。複数EVが同issuer／originを共有してもkind・subject・寿命の違いを消さない。

次段で必要なのは各EV／Duty／directoryの全参照先・局所保持・部分生成物・追加containerと親graphの容量、phaseごとの生成／join／退役prefixを含む多重度である。形式和41+42ρや正規slot一覧から総memory cap・実allocator保持・合法最大を導かない。local clearだけで未確認nodeを同時保持から差し引かない。本書では新しい容量値・実E要求量・方式選択を確定しない。

## 8 独立検証の受入条件案（全て未実施）

| ID | 独立対照 | 必須条件 |
|---|---|---|
| ET01 EV全7kind・同値copy／kind変換 | EM01〜07から別の期待表を作る | 同形状・tag書換え・JSONからprivate確認物へ昇格しない |
| ET02 CMだけspent・空Duty／Frame | 正規消費とEMの事実確定を別に作る | EnterFact／JoinFact／退役・receipt成功を生成しない |
| ET03 constructor／rootへrole確認物 | EA01〜06で対象を分ける | CM00／CM01・root終端をLC08用確認物で代用しない |
| ET04 finally／Promise settle／別frame復帰 | 元candidate／同caller／元frameの関係を別計算 | join／capture退役成功なし、元責務保持 |
| ET05 LC05.join scalarと別JoinFact | EP02／03を別の配置条件として対照 | scalarを参照として扱わず、追加payload／edge費を隠さない |
| ET06 各ES prefixでthrow・格納成否不明 | 元参照／canonical状態／mirrorを別台帳で期待化 | canonical reset・第二candidateなし、未確認保持 |
| ET07 role退役・packet受理・root custody | EM04／05／06と元CM12／04／07を分ける | 一つの確認物で他の対象を成功化しない |
| ET08 停止・旧epoch・後着／重複 | 通常開始と旧対象の固定確認を別条件へ | 新claim／notify／epoch・再採用なし、先行診断保持 |
| ET09 位置数・aliasと参照先容量 | 4N／4P+2・8N・2(4P+2)とpayload集合を分ける | 112／120・108／116を全object数／最大保持量としない |
| ET10 保持不足・費目二重／欠落 | 保持経路・元OPと別失敗OPを独立に照合 | 不足をUnknown・閉鎖に残し、追加clock／時間延長で救済しない |

oracleは対象issuer／join／adoption／費目helperを再利用せず、固定EV・正規slot・適用kind・ES失敗prefixの別表を用いる計画。今回は検査器・fixture・合成試験を実装／実行しない。文書・表・リンク・記載した定数だけを静的に確認する。

## 9 未承認事項と今回の範囲

- [ ] EM01〜07の元private継続・同一性・正規採用先と実sourceの対応。
- [ ] constructor／root・非writerの確認点／保持経路と、EV03 facet／別payloadの選択。
- [ ] 候補生成・canonical採用・F0観測反映の失敗prefixと先行保持位置の例外安全性。
- [ ] 追加slot／全参照先容量・費目coverage・phase別最大同時保持の有限化。
- [ ] LOAD6／LOAD7・配置／共有／容量と実装・合成試験・実確認／保管の個別承認。

全て未承認。本MDと親2文書の参照更新のみ。元の5秒期限・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは行わない。

文書整合として対象3文書のローカルリンク21件・表23個の列数、EM01〜07／EA01〜06／EP01〜04／ES01〜08／ER01〜08／ET01〜10の43行のID連番、EV01〜07と対応先の記載、enter_fact_ref表記、未承認チェック5項目、4N／4P+2とenter／retire参照位置数112／120・108／116、費目OP00〜19、末尾改行・差分空白を静的に確認した。これは文書と定数の検算のみで、実source同一性・issuer／slotの実在・同期更新・全参照捕捉・容量／最大同時保持の実証ではない。合成試験・製品試験・実通信は実行していない。

## 10 後続の参照先形状・保持slot容量境界（2026-11-15）

[確認物の参照先形状・候補／採用済み保持slotの容量境界draft-0.1](BEST_PRACTICE_WFB_SGA_EVIDENCE_REFERENT_HOLD_CAPACITY_DESIGN.md)で、EV自身の直接fieldと参照先graph、C／A／M・元局所／上位保持、同payloadと別cellを分けた。専用候補slot・slot handle不足とJoin二案は未承認、寿命延長・失敗prefix・実容量はUnknownを残す。選択未承認、元5秒／既定並列度・各閉鎖条件・調査保留を維持し、実装・発行・消費・採取・再実行は行わない。

## 11 後続のprivate issuer／位置参照の共通・案別境界（2026-11-15）

[issuer／canonical位置参照の全field・到達境界と先行保持責務draft-0.1](BEST_PRACTICE_WFB_SGA_ISSUER_SLOT_REFERENCE_BOUNDARY_DESIGN.md)で、EVの参照元とI0／K0共通field・元container／selector対応を整理した。非writerの確認点やroot退役範囲は未確定で、形状だけの受理・scalarからの証拠生成を認めない。方式・選択未承認、元5秒／既定並列度・各閉鎖条件・Unknown・調査保留を維持し、実装・発行・消費・採取・再実行は行わない。
