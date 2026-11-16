# WF-B SG-A後：元field／生成siteとnode／edgeの案別対応・重複判定条件

Version: draft-0.1 / Date: 2026-11-16 / 読取り基準HEAD: `46ce9d2`。

Status: **既出設計field・生成境界と案別算定の対応設計のみ。LOAD6／LOAD7の選択、表現／Join二案・準備時期・配置・共有方式・容量capは未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[容量対象node／edge・残項台帳draft-0.1](BEST_PRACTICE_WFB_SGA_CAPACITY_NODE_EDGE_RESIDUAL_LEDGER_DESIGN.md)と[issuer／slot境界draft-0.1](BEST_PRACTICE_WFB_SGA_ISSUER_SLOT_REFERENCE_BOUNDARY_DESIGN.md)。[全root field台帳draft-0.2](BEST_PRACTICE_WFB_SGA_ROOT_FIELD_REFERENT_LEDGER_DESIGN.md)、[L0容量規則draft-0.1](BEST_PRACTICE_WFB_SGA_INTERNAL_SLOT_LAYOUT_CAPACITY_COST_DESIGN.md)、[canonical claim台帳draft-0.1](BEST_PRACTICE_WFB_SGA_CANONICAL_ISSUANCE_CLAIM_LEDGER_DESIGN.md)、[確認物・正規slot対応draft-0.1](BEST_PRACTICE_WFB_SGA_EVIDENCE_CANONICAL_SLOT_MAPPING_DESIGN.md)、[frame／capture台帳draft-0.2](BEST_PRACTICE_WFB_SGA_FRAME_CAPTURE_EVIDENCE_SLOT_DESIGN.md)、[graph境界draft-0.1](BEST_PRACTICE_WFB_SGA_GRAPH_BOUNDARY_CANONICAL_PROTOCOL_SHAPE_DESIGN.md)、[origin／epoch契約draft-0.1](BEST_PRACTICE_WFB_SGA_ORIGIN_EPOCH_BINDING_REVOCATION_DESIGN.md)を維持する。

## 1 「既存位置」と「同一」を定義する

本書の既存位置Eは、R1／L0／F0等の既出設計に列挙された位置を指す。現codeに実装済み・実際に存在すると確認したという意味ではない。追加位置Aは案を実現するために別途必要になるfield／cell／payloadの候補、未確定Uは元field・生成元・同位置対応が不足する箇所。これらのlabelは文書分類で、実state field／新しい登録APIではない。

同じ意味のevent、同じ保持cell、同じpayload、同じ共有先の四つを分ける。同CMのprojection二位置は同eventでも二fieldであり、二つの参照cellが同payloadを指しても一cellにはならない。slot名・値・hash・生成site名が同じだけでは、実同位置／実同参照の根拠にならない。

算定条件は同schema／配置版・profile・表現案・Join案・準備案・固定経路／時点に揃える。保持cellを比較するには同owner実体・元container・固定field位置を、payloadを比較するには元producerの同候補から採用／移譲された実参照関係を確認する必要がある。この関係は設計上の照合条件で、ラベルから実参照をlookup／復元する手段ではない。今回の対応は設計間の対応案であり、実sourceのfield・非割当て／非介在・全captureの照合は未実施である。

## 2 固定生成／確認siteの対応label

| ID／site | 元設計の生成・確認境界 | 対象と制約 |
|---|---|---|
| GS01 親入場・保持 | R1 RS01、CM00、親OSlot | root前の元親・停止／Failure／候補保持。新しいconstruction claimや緊急shellを追加しない |
| GS02 root直接構築 | R1 RS02〜04、L0 LS01 | RG00とRG01〜15の固定生成順候補。返却前／捕捉／同参照格納を分離 |
| GS03 record／固定参照準備 | R1 RS05〜06、L0 LS02〜03、OE03／04 | LC01〜09・RG08／09と元binding。group位置数をallocation数にしない |
| GS04 private binding準備 | OE02／04、issuer境界HP02〜05 | I0／K0共通関係、I-E／I-S・K-E／K-Hごとの元field／別payload。新しい元claimなし |
| GS05 確認物の元事実・採用 | EM01〜07、CE05／06、元fixed caller／退役継続 | EVの進入・finally候補・join・退役・受理／引受を別確認。CM消費だけで生成しない |
| GS06 値・観測・封印 | L0 LS04、CV各record、元Timing観測 | draft／sealed・値snapshot。新clock・再観測なし、mutable元値と不変snapshotを混同しない |
| GS07 取得／write／publish・packet | L0 LS05、元WX01〜08・固定packet構築 | 同backingの取得attempt→writer→join→post→昇格。別copy／concatの暗黙生成なし |
| GS08 停止・責務引受／退役 | R1 RS07、L0 LS06〜07、元HP／PX／PF終端 | 元C／A／M／L／Uとfirstを保持。local退役・引受・実解放は別 |

GSは実関数名・実runtime event数ではなく、既出設計の境界を引く静的label。GS04の準備とGS05の事実発行、GS05の採用とGS08の保持退役は別である。各GSの途中に必要な別allocation／callback／registryが判明したら未導出残項へ戻し、同siteだから一つに収まると推定しない。

## 3 元fieldからnode／edgeへの共通対応

| ID／元field・位置 | 元site・node／edge | E／A／Uと重複・保持の扱い |
|---|---|---|
| FM01 RG00.context等の15参照・RG09各固定参照配列 | GS02／03、NL01／NL02・NE01 | E。directory／registryのcellは元targetと別。LC／RG本体payloadをindexごとに再加算しない。配列container／実参照先はU |
| FM02 RG13／14／15とL0 Timing／Failure／Counts、RG08の13alias | GS02／03／06、NL01／NL08・NE01／08 | RG13〜15は既出同位置という設計対応でL0へ再加算しない。RG08は別のE参照cell、元観測payloadのcopyとしない。実共有の確認はなお必要 |
| FM03 OSlot.claim→RG06.claim、LC09.encode_claim→LC01.claim、LC08.writer.enter_claim→LC04.enter_claim | GS01／03／05、NL01／NL02／NL13・NE01／12 | E同士のMP01〜03 projection。同eventでも各tag位置を消さず、第二claimなし。同物payload／同一cellという意味ではない |
| FM04 RG02.active_frame_ref、RG11.inflight_frame_ref、LC05.frame_origin | GS02／05／07、NL01／NL02／NL03／NL07・NE07 | 全てEだがroot frame／writer frame／originは異なるkind。名前やorigin一致だけで同objectへ畳まない。F0との実対応はU |
| FM05 LC08.enter_evidence／retire_evidence、FF01.enter_fact_ref／FF03.retire_fact_ref | GS05、NL02／NL03／NL04・NE02／04 | E参照位置とEV01／04の別次元。正規slotとmirrorが同確認物ならpayload一つ・edge各位置分。専用C不足はA必要性／配置U |
| FM06 LC05.exit_candidate・join、FF01／FF03.exit_candidate_ref／join_fact_ref | GS05／07、NL02／NL03／NL04・NE02／04／07 | exit候補の同参照対応とjoin scalarを分離。Join facet案でEV03 object生成済みにしない。別payload案の正規参照採用先・C不足はU／追加候補 |
| FM07 RG03.accepted_receipt_ref、RG12.custody_receipt_ref、RG06.outer_admission_ref | GS01／05／08、NL01／NL04／NL13・NE04／12 | E三位置はEV05／06／07の別対象。packet受理・root引受・親入場を統合しない。元producer局所／Cの保持先は別確認 |
| FM08 I0全field、EV01〜06.issuer_ref | GS04／05、NL04／NL05・NE04／05 | I-Eでは既存ownerとの論理対応、I-Sでは新binding payload／cellがA候補。元owner／Contextが同物でもI-S内の参照cellは追加分。詳細はBR01〜10 |
| FM09 K0全field、EV各slot参照 | GS04／05、NL04／NL06・NE04／06 | K-Eでは元container保持、K-Hでは別handle payload／cellがA候補。scalarをobjectとして数えず、同containerでもselector違いは別対象。BR11〜15へ |
| FM10 LC09.canonical_value／sealed_value、RG13元観測と値snapshot | GS06、NL01／NL02／NL08・NE08 | E位置。draft／sealedが同実体ならpayload一つ・edge二位置、copyなら別payload。mutable Counts／Failureへのlive参照を不変snapshotとしない |
| FM11 LC02.backing→LC06.backing、SegmentDescriptor.backing_ref／借用 | GS07、NL02／NL09／NL10・NE09 | Eとprotocol facetの位置。workspace→encodedが同backingなら一allocation候補だが各保持cellは残る。segment自体は別metadata、wrapperのA／既存facet対応はU |
| FM12 LC03.view、offset／length／extentと元storage | GS07、NL02／NL10／NL18・NE10 | viewとbackingを同物と推定しない。同storage共有でもview payload／cell・実extent・poolは別。used lengthから差引き不可 |
| FM13 RG10.previous_ref／current_ref／provider_pending_ref、RG11.token_ref／wide_work_ref | GS06／07、NL11／NL12／NL16〜18・NE11 | E保持位置。2面・projection・raw戻り値・演算途中値を区別し、getter復帰後の元payload消失やcopyなしを仮定しない |
| FM14 OSlot.root_candidate_ref／pending_ref／active_frame_ref、RG06.pending_ref／pending_frame_ref | GS01／02／08、NL01／NL03／NL13／NL17・NE03／13 | E各位置。同候補採用でも親／root／局所の別edgeを残す。RG06未成立時にそのfieldを保持元へ期待しない |
| FM15 F0 Duty directory・constructor／root退出、scope／brand／closure | GS02／04／05／08、NL03／NL14〜16・NE07／14 | 全経路・必要追加field／参照先はU。空duty・private名で存在／有限性を保証せず、役割EVで代用しない |
| FM16 各producerの部分生成物・実header／container／allocator | 各GS、横断NL17／NL18・NE10／11／13／14 | 元payloadと重なる横断軸。返却前nested allocationや実extent不足を元nodeと対応させ、常に別nodeとして加算も、0扱いもしない |

FMは代表field群の対応表で、全実codeのfield列・実pointer／containerを確認した台帳ではない。Eは既出列挙の重複整理であり、実同位置の証明ではない。GSから実関数／捕捉先への対応、scalar更新の例外安全性・非介在・同期停止はUに残す。

## 4 I0／K0共通fieldの案別元位置対応

I0のkind／layout_tag／scope_tag、K0のkind／layout_tag／slot_kind／subject_kindは固定private境界のtag候補。layoutは元RG00／RG01の同版、scope／subject／selectorは元対象へ結合するが、同じtag値だから同じ物理cellとはしない。別payload案では各tagをIF列どおり数え、埋込み／固定導出案では元field／固定codeと追加cellの要否を確認するまで差分はUである。

| ID／binding参照field | 元field／生成siteの対応案 | 既存利用案と別payload案の差分 |
|---|---|---|
| BR01 I0.owner_ref | RG01.owner_refと同root／roleの固定owner、GS04 | I-Eは同owner参照経路。I-Sは元targetが同物でも新しい参照cell1位置 |
| BR02 I0.context_ref | RG00.context、LC01.contextから同RG01へ、GS02／03／04 | 同Context payloadの共有根拠と、I-S内の追加参照cellを分離 |
| BR03 I0.subject_ref | rootは同RG00系統、roleは同Anchor／固定role、GS03／04 | subject wrapperが必要なら別A候補。同indexからの復元なし、全経路Uなら接続閉鎖 |
| BR04 I0.birth_origin_ref | OE02／04の元binding由来、GS04 | EV事実originと別。同birth origin共有でも参照cellは位置ごとに残す |
| BR05 I0.epoch_binding_ref | roleはLC08.epoch、writerのLC04.epochとの元domain対応、rootは元domain、GS03／04 | 不変pinと可変失効元を分離。rootの経路不足をrole pinで補完しない |
| BR06 I0.stop_owner_ref | RG01.stop_refとRG02／role資格の正規系統、GS04／08 | stop_stateのcopyではない。I-Sに第二alive cacheを置かない |
| BR07 I0.budget_owner_ref | RG01.budget_owner_ref、RG04の元予約／deadline、GS04 | 参照targetの共有と別cellを区別。残時間／残予算copyや起点再計算なし |
| BR08 I0.canonical_owner_ref | rootのRG00→各CM group、roleの同LC08等、GS03／04 | 全CMを一groupへ畳まない。directoryに届くI-S参照は元graphの保持延長を含み得る |
| BR09 I0.duty_owner_ref | F0 RootDuty／RoleDutyと先行directory案、GS04 | 既存R1に隠れた直接fieldがあるとはしない。追加slot／payloadのA／必要性はU |
| BR10 I0.failure_owner_ref | 同RG14、root前は元OSlot診断系統、GS01／02／04 | root issuerが未成立なら仮issuerを作らない。独立failure log・firstの二重ownerなし |
| BR11 K0.container_ref | KS01〜10の元LC08／LC05／Duty／RG03／RG12／OSlot、GS04 | K-Eは元containerをEV側が保持。K-Hは同containerへの追加参照cellと別handle payload。KS09対象位置はU |
| BR12 K0.context_ref | 元container→Anchor／rootの同RG01、GS03／04 | roleは必須。constructionの非適用は元固定契約の枝だけで、不明を空へ丸めない |
| BR13 K0.subject_ref | 同Anchor／role、root又は親construction対象、GS01／03／04 | 同containerだけでsubject同一としない。必要な追加descriptorはU／A候補 |
| BR14 K0.origin_ref | 元KS siteとOE系統のorigin、GS04 | I0.birth_origin_refと常に同物ではない。別siteを同originへ再bindしない |
| BR15 K0.epoch_binding_ref | 元role／root／親の適用domain、GS04 | 適用不足はU。K-Hの参照を数値epochへ置換して同一性や消費資格を再生成しない |

BR01〜10はIF01の10参照、BR11〜15はIF02の5参照を全て対応付ける論理表である。I-E／K-Eではこれらが15個の追加fieldとして必ず存在するわけではない。元private経路の途中でclosure／wrapper／cacheが必要なら、その全field・先行保持・費目を追加設計するまでUとする。

## 5 四組合せ・Join案ごとの追加分

I-E＋K-E、I-E＋K-H、I-S＋K-E、I-S＋K-Hを別に扱い、Join facet／別payload、準備一括／段階の各軸とも分離する。全組合せを同時に生成したり、小さい案を承認済みとしたりしない。

I-Sを実体化する場合の直接列は3+10ρ、K-Hは4+5ρ。同物の元owner／containerを指してもこの新しい参照位置は追加分である。既出のC／A／M fieldに採用できるかはEH／HPの元位置対応で確認し、専用Cが必要なら別A候補として残す。C／A各一cellを別に追加する条件下だけでは3+12ρ／4+7ρとなるが、M／L／U・container／header・全参照先を含む値ではない。

I-E／K-Eでは別issuer／handle objectを作らない案でも、未列挙埋込みfield・固定導出のcode／closure、元containerへのedge・寿命延長は無料にならない。Join別payload案のEV03は2+7ρの直接列と保持slot・元frame／candidateへの参照先が必要で、LC05.join scalarを新object／参照fieldへ読み替えない。facet案でも元caller／Exitの保持と確認費は残る。

## 6 重複・共有・寿命延長の判定条件

| ID／比較対象 | 重複を除ける／分けるための条件 | 残す容量・未確認時 |
|---|---|---|
| DD01 同じ意味のevent | MP01〜03等は元CMの同event関係を確認する | event一つでも各fieldは残す。消費権限を二重化せず、同一cell／payloadと推定しない |
| DD02 同じ保持位置 | 同owner／container／配置版・同固定fieldで、同時点に同じ位置である根拠が必要 | 別labelの同位置二重計上だけを除く。時点やownerが違う、同時に別対象を保持する場合は統合しない |
| DD03 同payloadへの別参照 | 同producerの元candidateから同参照で採用／移譲、kind／subject／origin／epochの必要関係とcopyなしを確認 | payloadは一つ、各C／A／M／L／Uのedgeと責務は残す。根拠不足はUで、値やsite名一致からdedupしない |
| DD04 確認できた別payload | 別の固定生成物／copy／snapshotである元関係を確認。viewとstorage等は対象単位も分ける | 別payload・生成途中の同時保持を計上。同一性不明だけで実別allocationが確定したとはしない |
| DD05 既存targetの共有 | 同時点に同実体を複数owner／fieldが保持する根拠と、対象の不変／更新資格を確認 | target一つと全edgeを分ける。共有元ownerのinclusive量と子の帰属を同軸で足さない |
| DD06 共有と寿命延長 | 新edgeが既存targetの最後の必要保持時点を延ばすかを別に確認。両者は併存し得る | 新allocation0件でも追加保持0byteではない。親単独の同時点保持根拠がなければ差分はUnknown |
| DD07 部分生成／採用失敗 | 元GS／同候補・C／A／M更新prefixを確認してNL17を元nodeへ対応 | 同物の横断状態は二重加算しないが、別nested allocation・未確認Lは残す。第二生成物・resetで救済しない |
| DD08 cycle／退役後参照 | 同nodeへの戻りedge、retire fact→frame／issuer→root／親の実経路と最後の利用を確認 | 無限加算を避けつつ全edgeと寿命延長を残す。local clear・退役事実を物理解放にしない |

DDは設計上の判定条件で、今回同一／別と実判定した組ではない。未知を同一扱いして下げることも、未知の個数・extentを有限の別物群として確定することも避ける。案別に同一／別の条件を記載しても、その条件が未確認なら総容量・最大同時保持はUnknownのままである。

## 7 失敗時保持・費目と後続算定

元fieldの対応不足・異owner・同値copy・KS09未確定なら、形状が整っていても採用／発行へ進まない。既に取得した候補は元L／C／A・正規slotの責務へ残す。元canonical成功とM不整合を分離し、claim reset・第二object・別epoch／profile・緊急shellで修復しない。元firstはRG14、root前はOSlotへ保持し、raw例外・stack・可変長の未確認物リストは作らない。

停止後は旧対象・先行Duty／Exit・元予算の固定退出／保持継続だけへ合流する。親未成立時の記録成功、全capture・OOM時保存・実解放／process終端まで保証せずU／Unknownを残す。親graphやallocatorを「対応表の外」として無料にしない。

準備OP00、供給確認OP01、binding OP02、元進入／取得／演算OP03〜OP11、受付OP12、writer／post・encoding OP13、segment／通知／receipt OP14、既存境界記録OP15、guard／分類OP16／OP17、別故障OP18、custody／退役OP19へ元occurrenceを対応付ける。同node・同eventの共有で検査／格納／退出費を消さず、同じ主費目の二重加算も避ける。元Q／R／tail・原起点／全deadline・列挙取得62／70・5秒期限／既定並列度を維持する。

次段では、FM／BRで残るUと追加Aの必要性を元生成経路・保持位置へ具体化し、案別に一意payloadと全edgeをPH01〜11・故障prefixへ対応付ける必要がある。今回は実source照合、全容量計算・最大同時保持の数値化・実E要求量確定を行わない。実object探索・getter／Proxy／iterator・heap dump・GC・実source hash照合・採取で不足を補完する許可でもない。

## 8 独立検証の受入条件案（全て未実施）

| ID | 独立対照 | 必須条件 |
|---|---|---|
| MV01 元field／siteと分類 | R1／L0／F0／EC・GSとFMの別表 | Eを実装済みとせず、元field・元境界が不足する項目はU |
| MV02 MP01〜03と実位置 | 同event・元tag二位置を別に計数 | 第二claimもfield無料化もなし、event一つをpayload同一の証拠にしない |
| MV03 Timing／Failure／Counts・alias | L0とRG13〜15・RG08の別対応表 | 既出同位置を再加算せず、13alias cellを元payload copyにしない |
| MV04 I0／K0全参照元 | IFとBRの独立照合 | 10／5参照を漏らさず、I-S／K-Hの別cell・元graphを残す |
| MV05 四組合せ・Join二案 | 案別の追加payload／元位置を別計算 | 排他的案の合算・小さい案の承認済み化・scalarのobject化なし |
| MV06 同candidate・別C／A／M | 固定producerからの同参照／別copyを別期待値へ | payloadの重複だけを除き、複数edgeと局所／上位保持を残す |
| MV07 同値・同site・view／backing | identity条件と内容一致を別に作る | 値／hash／site一致だけのdedup・used lengthによるextent差引きなし |
| MV08 親共有・寿命延長・cycle | DD05／06／08の条件を別対照 | 新規0件でも追加保持0とせず、無限加算も避ける |
| MV09 部分生成・採用／M故障 | 元GS・NL17とPX／PFの別表 | reset・第二candidate・未知allocation数の有限化なし、firstと元責務保持 |
| MV10 部分式・費目・閉鎖 | 既出cell／追加cell／全参照先の別台帳 | 部分和から全cap／合法最大に昇格せず、期限延長・追加clock／実接続なし |

oracleは対象alias／identity／issuer／容量helperを流用せず、元field列・固定site・案別追加分・失敗prefixの独立表を使う計画。今回は検査器・fixture・合成試験を実装／実行せず、文書・リンク・表・既出field名と定数関係だけを静的に確認する。

## 9 未承認事項と今回の範囲

- [ ] GS／FMと元設計fieldの対応、実sourceの生成／格納／捕捉経路の照合。
- [ ] I-E／I-S・K-E／K-H・Join二案、埋込み差分・追加保持位置の必要性の確認。
- [ ] DDの実同位置／同参照・別copy／共有・寿命延長と例外安全性の根拠。
- [ ] U／A残項の全field／件数・参照先全容量・phase別最大同時保持／費目coverageの有限化。
- [ ] LOAD6／LOAD7・配置／共有／容量と実装・発行／消費・合成試験・実確認／保管の個別承認。

全て未承認。本MDと親2文書の参照更新のみ。元の5秒期限・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは行わない。

文書整合として対象3文書のローカルリンク27件・表16個の列数、GS01〜08／FM01〜16／BR01〜15／DD01〜08／MV01〜10の57行のID連番・参照範囲、BRと親IF01／02の10／5参照fieldの全列一致、元NL／NE・CM／RS／LS／KS／OE／EM／CEの参照範囲、四組合せ・既出部分式、未承認チェック5項目、費目OP00〜19、末尾改行・差分空白を静的に確認した。field名・境界labelの対応は設計間の検算であり、実source・実field／実payload同一性・共有／寿命延長・全容量／最大同時保持の実証ではない。合成試験・製品試験・採取・実通信は実行していない。
