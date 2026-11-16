# WF-B SG-A後：graph境界とcanonical値／protocol参照先の形状契約

Version: draft-0.1 / Date: 2026-11-15 / 読取り基準HEAD: `752220c`。

Status: **graph・形状・保持責務の詳細設計のみ。LOAD6／LOAD7の選択・内部配置・storage／writer方式・容量capは未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[全root field・参照先台帳draft-0.2](BEST_PRACTICE_WFB_SGA_ROOT_FIELD_REFERENT_LEDGER_DESIGN.md)と[内部slotの配置・容量算定draft-0.1](BEST_PRACTICE_WFB_SGA_INTERNAL_SLOT_LAYOUT_CAPACITY_COST_DESIGN.md)。[strict値／encoding draft-0.3](BEST_PRACTICE_WFB_SGA_RECORD_FIELDS_ENCODING_DESIGN.md)、[同backing所有・退出／退役draft-0.2](BEST_PRACTICE_WFB_SGA_BACKING_OWNERSHIP_WRITER_EXIT_DESIGN.md)、[phase保持draft-0.2](BEST_PRACTICE_WFB_SGA_PHASE_RETENTION_SLOT_DOMAIN_DESIGN.md)、[固定schedule draft-0.3](BEST_PRACTICE_WFB_SGA_FIXED_SCHEDULE_SLOT_ENCODING_DESIGN.md)を維持する。R1のroot直接fieldやwire keyを追加せず、RF04／05を中心に参照先の形状入口を具体化する。

## 1 graphと算定境界：payload・参照位置・追加保持を分離

本書のgraphは、固定sourceで宣言された参照関係を表す設計上のgraphであり、実heapの探索手順ではない。`Object.keys`等による任意objectの列挙、getter／Proxy／iterator実行、heap dump、GC、実参照の採取を許可しない。以下のnode／edgeを新しいruntime registry・診断eventとして実装／保存するものでもない。

nodeは同じ実体のpayload、edgeは特定owner／field／frameの参照保持位置とする。同じnodeへの複数edgeはpayloadを一度だけ数えるが、edgeのcell費とowner別の未退役責務は各位置分残す。同値の内容・Id・hash・serialized summaryだけでは同nodeと判定しない。実参照同一性の根拠がなければ未確認であり、都合のよいdedupも、物理的な別allocationという断定もしない。

| 軸 | 区分 | 算定・拒否規則 |
|---|---|---|
| 生成元 | 同trial新規／既存の共有対象／生成元未確認 | 新規allocationと既存参照を分離。未確認を新規0件・既存0byteへ補完しない |
| 保持原因 | local所有／借用／上位custody／固定共有／寿命延長の可能性／未確認 | 生成元とは別軸。同じ既存objectに借用と寿命延長が併存してもpayloadを二度足さない |
| 保持範囲 | root直接cell／値参照先／protocol参照先／親・外側slot／一時値／runtime内部 | 境界を横切るedgeを明記。親だから無料、外側だから対象外とはしない |
| 確認階層 | field保持／借用退役／元参照clear／custody引受／backing reclaim／OS返却 | 確認した階層だけ更新。local clearやreceiptだけで物理解放としない |

同trialの直接管理量、到達する一意payload集合、他trial／親と共有するpayload、既存対象の保持期間延長は別に報告する設計とする。「このtrialがなければ親だけで保持していた量」を差し引くには、同時点の親単独の保持根拠が必要である。反事実のbaselineが不明なら追加保持量もUnknownであり、既存objectの新規allocationが0件という理由で追加保持0byteとはしない。

共有を含む総量は同じ実体を一度だけ数える一方、trialごとの責務欄には各edgeを残す。複数trialの帰属値を単純に足してprocess全体memoryとしない。先行Failure・OSlot・元frameも同graphに含め、rootが未完成でも保持対象が消えたとは扱わない。

## 2 境界edge・同一性と所有

| ID | 境界・同一性の条件 | 共有／追加保持・不足時の責務 |
|---|---|---|
| GB01 root→LC／RGのcanonical位置 | 同owner／trial／source／schema／配置版／profile、同固定slotへのprivate実参照 | R1のindex・alias edgeは別cell、既出nodeは一度。7N管理群・4N role・N値cell＝12N record群を区別 |
| GB02 LC09→canonical／sealed値 | 同record slot・同生成元・同seal epochの値。label一致だけで代用しない | draft／sealedの同実体aliasと別snapshotを区別。別copy・元draftが残れば別保持 |
| GB03 packet／segment→encoded backing | 固定順P record、同Anchor／同backing／使用長、writer／post退役済み | 同backingを再allocationとして数えず、segment位置とcustody edgeは残す。copyは別計上 |
| GB04 protocol→issuer／Context／subject | 同private issuer・同root／subject／origin／epoch／既存claim位置への結合 | issuerが親graphを保持するならその到達範囲を残す。opaqueという名前だけで小さなnodeとはしない |
| GB05 root／protocol→既存親・固定共有対象 | RF01／02の正規owner・同原起点・同版／失効状態 | 同targetへのaliasを共有に分類。pin／共有の実根拠不足なら閉じた容量上界なし |
| GB06 root／元frame→上位custody | 同packet／同対象・固定引受先・引受確認物の同一性 | 移譲しても元費用・保持prefixをresetしない。引受未確認は元ownerが責務を残す |
| GB07 OSlot／pending／frame→部分生成候補 | 固定stage・生成元・同候補実参照・格納前後を区別 | capture未確認なら保持成功としない。未知の候補を第二保持表／無制限dumpへ逃がさない |

GB04／05のような境界で算定の走査を止めても、その先のpayloadを0としたことにはならない。固定境界仕様の参照・rootからの保持edge・上位ownerの責務・未導出容量を記録する。親の全graphを参照する実装を、小さなreadonly viewへ置き換え済みと仮定しない。置換・copy・新規wrapperが必要なら、別の設計・費用・保持・承認に戻す。

同一性は同trialの固定canonical位置とprivate生成元で確認する案とし、任意入力からnodeをinternする登録口は作らない。図表のnode名や内容hashは算定labelであって発行権限ではない。合成issuer／台帳と実runtime用を共有せず、診断・summary・値検査成功から正式なclaim／証拠へ昇格しない。

## 3 canonical値の形状入口：dataとbindingを分ける

LC09のcanonical／sealed参照先は、値dataの形状と、同owner／slotを保証するprivate bindingを別に扱う。以下のdataは固定内部producer由来の有限scalar・固定key／配列だけを候補とする。任意objectを後から深く検査すれば安全にこの形状へ昇格できるという契約ではない。

| ID／値kind | 共通8 keyに加えるexact field列 | sealed集合での個数 LOAD6／LOAD7・主費目 |
|---|---|---|
| CV01 H | `source,head,workload,provider,clock,metric,scope,budget_ref,requirements_ref,evidence,arm,schedule` | 1／1。生成・projectionはOP02／OP03／OP12の各occurrence、encodingはOP13 |
| CV02 S[k] | `index,scheduled,entered,begin,end,utc,cpu_count,cpu_check,lights` | 6／6。OP04〜OP08、sealed受付OP12、encoding OP13 |
| CV03 L | `entered,begin,end,utc,lights` | 0／1。OP11／OP12、encoding OP13。LOAD6には値recordなし |
| CV04 I[k] | `index,left,right,busy` | 5／5。OP09、受付OP12、encoding OP13 |
| CV05 SUM | `entered,interval_states,busy,scope,eligibility,counts_at_seal,first,diag` | 1／1。OP10／OP12。未来のreceipt・最終費用なし |
| CV06 TERM | `receipt,n_notify,n_ack,h,guard,call_entry,sealed_at,attempt,timing,counts_at_seal,first,diag,custody` | 1／1。結果合流OP18／OP19、z等のclock OP15、encoding可能な分岐だけOP13 |

共通keyは`v,kind,slot,trial,plan,pin,packet,profile`で既存strict設計の順序・意味を維持する。v／kind／slot／profileは閉じた値、Idは1〜64 ASCII、Headは40 lower hex、Mono／整数／UTC／F64表現も既存候補のまま。dataのlabelをprivate参照へ復元するlookupは行わない。上表の上位key個数はH20・S17・L13・I12・SUM16・TERM21で、nested field数・node数・内部byte数とは異なる。

上表のsealed集合は必要なstrict値を生成・封印できた分岐の構造候補であり、全失敗分岐でN個を用意できる保証ではない。identity・必須値が不足する早期失敗では未生成／部分値を保持し、架空のId・仮の値・空recordで個数を満たさない。

| 入れ子・leaf | 閉じた形状・関係 | 共有・保持の注意 |
|---|---|---|
| V<T> | okは`state,value`、非okは`state,reason`。理由・状態は既存strict集合 | 非okにraw値・例外を隠して保持しない。wire対象Vにnot_applicableを追加しない |
| ClockInfo／Evidence／Schedule／Scope | strict設計のexact key・固定値・variant。scope label一致だけで確認済みにしない | 値snapshotは実provider／clock／承認objectそのものを子fieldへ持たない |
| Lights | `n,load,free,total`、loadがokなら固定3要素、free／totalともokならfree≤total | raw CPU配列・provider戻り値・model・関数への参照を値dataへ入れない |
| Pair／interval_states | `u,t`、U64候補、t>0・u≤t、SUMの区間stateは固定5要素 | 128／256-bit演算途中値は別RF08。欠測bridge・単純percent平均なし |
| CountsAtSeal／FirstFailure／DiagFlags | 9計数のprofile上限、既存first variant、固定12 Bool | liveなRG14／15の可変objectをそのままaliasして封印値としない |
| Receipt／h／Custodyの値snapshot | 既存strict variantとh→n_ackの値参照規則、Custody固定4key | private receipt／借用退役Ackを値snapshotに埋め込まない。受理と退役・実解放は別 |

sealed集合ではLightsは6／7位置、SUMとTERMのCountsAtSeal・FirstFailure・DiagFlagsはそれぞれ2位置となる。ただし旧draft・部分snapshot・別copyも残ればその分を別に数え、この個数を全live object数にしない。scalar値が同じでも、SUMのas-of-sealとTERMのas-of-zは異なるsnapshotである。

値dataは関数・任意callback・root／owner／frame／claimへの隠れ参照・可変長children／Mapを持たない候補とする。bindingはLC／RG／protocol側に残す。実objectのprototype・内部slot・closure・文字列backingまでこの制約が実現できているかはsource／runtime確認が必要で、`readonly`宣言やshallow freezeだけで有限純data graphと確証しない。

封印後の事実は変更しない。immutableな元観測factへのaliasで表せる場合でも、同factの不変性・到達先・同参照の根拠が必要。mutableなTiming wrapperやCounts／Failureを参照したまま「後から変わらない」と推定せず、snapshot／copyが必要ならその生成途中・元値・新値の同時保持を費用へ加える。TERM封印後のz_post・encoding成否はroot診断側へ残し、TERMへ追記しない。

## 4 packet／segmentの参照先形状

| 設計上のfacet | 必須の論理field／edge | 多重度・所有・寿命 |
|---|---|---|
| PacketManifest | `state, schema_tag, profile_tag, context_ref, ordered_segment_refs[P], seal_slot_ref` | 同PrePacketに最大1の正規位置。OP14で固定参照表を準備、packet sealは既存RG02.packet_seal_claim。別の封印許可を増やさない |
| SegmentDescriptor | `slot, offset, used_length, anchor_ref, backing_ref, borrow_slot_ref` | 固定順P位置。同LC02のbacking、同roleへのborrow。offset／lengthだけで全extentを縮めたとしない |
| TerminalBinding | `state, context_ref, term_cell_ref, publish_slot_ref` | TERM用最大1の正規位置。PrePacketへTERM segmentを追加しない。seal権限はTERMの既存LC09だけ |

facetは既存保持位置から見た形状の設計名であり、新しいobjectを必ず生成するという決定ではない。実装で別wrapper／配列を作るなら新payload・container参照・header・生成費・失敗prefixを別に数える。同じ位置に重なるfieldは同位置対応が確認されたときだけ重複を除く。

ordered_segment_refsはH→S0〜S5→必要なL→I1〜I5→SUMのP=13／14位置。実行時sort／dedup・任意追加segment・暗黙の全packet concat bufferを許す契約ではない。partial segment構築時の元参照と上位custodyは重なり得る。writer／post未退役のrecordからsegmentを作らず、notify後もreceiptだけでsegment／borrowを退役しない。

PacketManifestはContextとbackingへ到達するため純data snapshotとは別のprotocol側graphである。metadataが凍結されてもraw mutable backingの公開許可にはならない。保護された固定read継続の非漏出・実容量・費用は未実装／未確認のままである。

## 5 protocol参照先の形状入口と一度限りの権限

以下もprivate生成元から見た必須facetの候補で、issuer・claim・証拠の発行や登録口を実装しない。各stateのauthorityは元のLC／RG／OSlot側にあり、値fieldを書き換えるだけで資格を得られない。facetが同じ実体上に重なる場合はその対応を示し、別objectなら別容量とする。

| ID／facet | 論理field・private結合の必須項目 | 多重度・保持／費目owner |
|---|---|---|
| PR01 Origin | `kind, phase, issuer_ref, context_ref, subject_ref, epoch_ref` | 固定の発生slotへpin。全originを1個とも、参照fieldごとに別objectとも仮定しない。位置準備OP00、結合OP02、元観測／更新OP03〜OP19の該当occurrence。issuer／TrialOwnerが責務 |
| PR02 Attempt／EpochBinding | `kind, state, context_ref, subject_ref, origin_ref, epoch_ref, claim_slot_ref` | record attemptは既存Anchorで高々N位置。epochの共有粒度・個数は未確定、wrap／別subject再bindなし。準備／結合OP00／OP02、使用は元処理owner |
| PR03 OneShotClaim | `kind, state, issuer_ref, subject_ref, origin_ref, canonical_slot_ref` | canonical claim位置一つに一度限り。要求回数分のclaim objectを追加しない。使用／失敗後は未試行へ戻さず、各元OPに課金 |
| PR04 Frame／Capture | `kind, phase, state, owner_ref, subject_ref, origin_ref, grant_ref, pending_ref, exit_candidate_ref` | 固定frameへの同参照。既存canonical slotからのedgeだけで局所stack／closure全体をcoveredとしない。writer／postは同trialで1区間、source／constructor等のframeを同じ1個へ畳まない。元処理owner、終端OP18／OP19 |
| PR05 TypedTerminalEvidence | `kind, state, issuer_ref, subject_ref, origin_ref, frame_ref, epoch_ref, terminal_slot_ref` | 同attempt／roleの先行終端位置へ結合。finally候補・caller join・post退役は異なる段階、同値copyから生成不可。OP13等の元確認、退役OP19、固定caller／元owner |
| PR06 PacketReceipt | `kind, state, issuer_ref, packet_ref, origin_ref, settle_slot_ref` | 同packetの最初のsettle位置1。再通知・後着で新receipt系列を生成しない。OP14、CustodyOwner、受理未確認はSamplerOwner |
| PR07 Custody／RetireConfirmation | `kind, state, issuer_ref, subject_ref, origin_ref, borrow_slot_ref, retire_slot_ref` | 同Anchor／role／originの一度限り退役位置。packet受理を代用にしない。OP19、CustodyOwner／終了owner、未確認は元owner |
| PR08 OuterAdmission | `kind, state, parent_ref, oslot_ref, origin_ref, construction_claim_ref` | 同親OSlot・同constructionの一度限り入場。親が未成立／busy／失効なら入場なし。OP00／OP02、親owner。失敗保持OP18、退役OP19 |

これらは必須の形状入口であり、protocol参照先の全内部field・実容量・source保証の完了ではない。追加のcapture先やmutable台帳へのedgeが必要なら、固定field・個数・生成点・責務を同版へ追記するまで容量をUnknownとする。任意closure／callbackをこのfacetの中へ入れて有限形状と呼ばない。

claimとframeの同義／別義は次の対応を必須とする。まだ同位置対応をsourceで確認していない組を、容量dedupや二重発行の許可へ使わない。

| 対応 | 正規位置・区別 | 未確認時 |
|---|---|---|
| notify開始とreceipt settle | RG02.notify_claimとRG03.settle_claimは別の意味 | 各一度。二つのnotify権限／二つのsettleを作らない |
| record sealとpacket seal | LC09の各record sealとRG02.packet_seal_claimは異なる単位 | TERM sealの第二ownerは設けない。上位封印で未封印recordを救済しない |
| Grant enterとwriter role enter | LC04.enter_claimとLC08.writer_frameのenterは同じ開始eventへの結合が必要 | 共同のcanonical開始位置／同event対応を別途固定。二つの独立開始権限や失敗後の再入にしない |
| frame／originとExit | LC05・LC08・R1.active_frame等は同じ対象なら実参照で対応 | frame名・phase・label一致だけでjoin／退役へ昇格しない |
| state値と発行権限 | readonly fact・診断とissuer台帳／claimは別 | copy・summary・strict値検査から正式証拠を再生成しない |

## 6 多重度・寿命と上位保持

| 保持対象 | 数えられる構造候補 | 寿命・未確認時の扱い |
|---|---|---|
| LC09のcanonical／sealed edge | N cell×2参照＝28／30直接位置。同じbodyなら一つのnode | 指された頂点数の上限であって、部分生成／元frame／nested allocationの総数ではない。旧draftを早期に捨てたと仮定しない |
| sealed record集合 | H1・S6・L0／1・I5・SUM1・TERM1＝N | PrePacket PとTERMを分離。FS08／早期診断batch失敗ではsealed TERMがあってもencodingなし |
| packet／segment | Manifest最大1、segment P=13／14正規位置、TERM binding最大1 | 正常受理後でも上位保持中はlive。別wrapper／copy・未完成prefixは別項 |
| role・確認物 | 4N=56／60配置、適用54／58。各roleのenter／retire一度限り | 確認物位置と参照先object数は別。writer／post未退役なら次recordへ進まない |
| origin／epoch／claim参照先 | 固定canonical発行位置と別参照位置の対応台帳が必要 | 個数は未導出。Unknownを0／rootあたり1とせず、重複要求に比例するevent列を作らない |
| 親／OSlot／元frame | 既存親の先行位置と生成prefix | 親未成立なら新rootへ入らず、全捕捉・診断永続化・process終了保証を捏造しない |

寿命は、生成候補→元slot保持→公開前封印→借用／上位引受→各role退出→参照退役→reclaim確認を分ける。同一性検査でcanonical位置から外れたobjectでも、既に取得／保持した物は不存在にしない。失敗時の部分生成物、lateな復帰、sealed TERM、sourceが捕捉する親ownerは先行責務として保持する。

ここでの有限個数は正規位置・正規に採用できる対象の構造候補であり、外部から到着する候補object・callback・provider内部のallocation総数の制限ではない。不正／後着の候補の一時保持や配送queue・runtime側の費用が不明なら別のUnknownとして残す。内部で新しいreceipt系列を作らないことだけで外部配送の上界を証明しない。

同時保持はphaseごとの一意node集合と全edge位置で求める計画とし、物理解放未確認のnodeをlocal clearで差し引かない。逆に、永続している全nodeの累積数を「同時に成立する合法最大」とも呼ばない。保守包絡・到達可能な合法最大・実allocator保持量は別のUnknownを含む。

## 7 費目所有・固定操作との接続

| 対象 | 主費目・責任owner | 計上境界・残項 |
|---|---|---|
| 参照位置・形状版・先行slot／OSlot・部分生成 | OP00、TrialOwner／既存親owner | node生成とedge位置の初期化は別occurrence。外側位置・局所frame・containerの費用も0にしない |
| 固定共有対象・identity・protocol binding | 供給確認OP01、結合／claim OP02、PinOwner／TrialOwner／固定issuer | 共有根拠・同版・同ownerの検査費。新規実体pin・hash照合を今回実施しない |
| 時刻fact・sample値の生成／snapshot | arm OP03、入場OP04、取得OP05／OP06／OP07／OP11、値検査／差分／集計OP08／OP09／OP10、受付OP12 | aliasは追加clockではない。snapshot copy・変換・元値保持費は元処理へ含め、9計数だけで全workとしない |
| record sealing・encoding・writer終端／post | 受付OP12、encoding／固定確認OP13、SamplerOwner／固定caller | LC／RGの同位置を重複生成せず、追加wrapper・確認物があるなら別payloadと生成費を明記 |
| packet参照表・borrow付与・通知／receipt | OP14、CustodyOwner、未受理はSamplerOwner | segment準備・受信側処理・queue・失敗を含む。concat／暗黙copyを無料としない |
| clock境界・guard／call分類 | 追加clock／境界記録OP15、guard OP16、試行分類OP17、TrialOwner | g／iのclockとguard／分類は別occurrence。新clock／poll／残期限再計算なし。実callは未接続 |
| 失敗・未確認保持・custody／参照退役 | 別の固定失敗処理OP18、退役／引受OP19、元owner／親終了owner、全体TrialOwner | 元操作が失敗した支出は元OPに残す。親のinclusive費と子の内訳を同軸で二重加算せず、移譲で費用をresetしない |

各node／edgeの主な生成・更新・退役occurrenceに主費目一つを対応付ける。byte保持とwork／時間は別軸であり、共有nodeが一つでも各検査・結合・参照保持の費用が消えるわけではない。LOAD6のS5後はR、LOAD7のL前集計はQ、L後検査／encoding／通知はRを維持し、終端費を後から外側cleanupの余りへ移さない。

R1のdirect field・protocol facetを追加実装したと仮定せず、source coverage・ref幅ρ・全field／nested値のbyte量・origin等の実個数・一時値／closureの全捕捉は未導出とする。既存出力13,400／14,309byteやscratch20,480 logical byteを加えて総memory cap充足とはしない。列挙取得62／70・元5秒期限・既定並列度を変えない。

## 8 独立検証の受入条件案（全て未実施）

| ID | 独立対照 | 必須条件 |
|---|---|---|
| GP01 | 同値copy・同実体alias・別版／root／source | 私有同一性を分離。payloadの重複加算とcell費の脱落を拒否 |
| GP02 | 既存親・shared定数・循環・寿命延長 | 既存だから0、境界で止めたから0としない。未知baselineから追加保持0を導かない |
| GP03 | 全6kind・固定入れ子・未知key／raw object混入 | exact shapeと元生成境界を維持。純dataへroot／frame／callbackを隠して渡さない |
| GP04 | SUM／TERMのCounts・first・diagをlive rootへalias | 封印後変更を拒否し、必要snapshotと旧値・途中値を別保持／別費用へ |
| GP05 | draft／sealed同体・別copy・partial snapshot | 28／30直接edge位置と全allocationを混同しない。未知の局所保持を除外しない |
| GP06 | packet順序変更・TERM segment混入・concat copy | 固定P位置、同Anchor／backing、TERM別境界。copyがあれば別計上 |
| GP07 | protocol facet copy・Grant／roleの二重enter・後着receipt | 同canonical claimへ一度だけ結合。state／summaryから権限を作らない |
| GP08 | finallyだけ／receiptだけ／local clearだけ | join・borrow退役・custody引受・reclaimの誤昇格なし |
| GP09 | 親未成立・capture未確認・失敗後の別wrapper生成 | 元OSlot／frame責務を保持、第二保持表や診断成功の捏造なし |
| GP10 | 主費目重複・追加clock・論理幅のみで総memory成功 | 元費用・所有・scheduleを維持。未導出の容量／実費はUnknown・gate閉鎖 |

独立oracleは対象のgraph／identity／claim helperを流用せず、固定edge表・kind別key列・snapshot時点・claim対応・失敗prefixから期待関係を作る計画。今回は実装・合成試験・実graph探索は行わず、MDリンク・表・定数式だけを静的に確認する。

## 9 未承認事項と今回の範囲

- [ ] graph境界・同実体／共有／追加保持とbaseline不足の扱いのレビュー。
- [ ] canonical値・packet／segment・snapshotの閉じた形状／寿命のレビュー。
- [ ] protocol facet・canonical claim対応・個数／捕捉先／失効条件の有限化。
- [ ] phase別同時保持・全参照先容量・source coverage・費目／時間配賦の確認。
- [ ] LOAD6／LOAD7・配置／方式／容量と、実装／合成試験／実確認／保管の個別承認。

全て未承認。本MDと親2文書の参照更新だけを行う。元の5秒期限・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは行わない。

文書整合として対象3文書のローカルリンク18件・表26個の列数、GB01〜07／CV01〜06／PR01〜08／GP01〜10のID連番、未承認チェック5項目、6kindのexact追加keyと親strict設計の一致、上位key個数・record／role／直接edge位置・既存予約和の定数関係、費目OP00〜19の記載、末尾改行・差分空白を確認した。文書と定数の静的検算のみで、実装・合成試験・負荷採取・試験再実行・実graph同一性／参照先容量／最大同時保持／実費／退出・解放の実証ではない。

## 10 後続のcanonical位置・同義projectionと一度限り消費（2026-11-15）

[canonical発行位置・同一性・多重度／消費対応台帳draft-0.1](BEST_PRACTICE_WFB_SGA_CANONICAL_ISSUANCE_CLAIM_LEDGER_DESIGN.md)で、親construction・record encode／取得・writer enterの正規位置と、同義fieldのprojectionを具体化した。claim消費・frame進入・finally／join・受理／退役を分離し、配置数を実object数や容量へ昇格しない。対応案・選択未承認、元5秒／既定並列度・各閉鎖条件・Unknown・調査保留を維持し、実装・発行・消費・採取・再実行は行わない。

## 11 後続のorigin site・epoch domainと共有保持（2026-11-15）

[origin／epoch生成元・結合・失効範囲と共有条件draft-0.1](BEST_PRACTICE_WFB_SGA_ORIGIN_EPOCH_BINDING_REVOCATION_DESIGN.md)で、同一性・role lifecycleのorigin・不変pinと可変失効state・上位保持の境界を具体化した。site／domain／参照位置を実object数へ昇格せず、source・partial保持・実費をUnknownに残す。方式・選択未承認、各閉鎖条件・元5秒／既定並列度・調査保留を維持し、実装・発行・消費・採取・再実行は行わない。

## 12 後続の全容量対象と到達境界の残項（2026-11-16）

[テンプレート内外の容量対象node／edge・未導出残項台帳draft-0.1](BEST_PRACTICE_WFB_SGA_CAPACITY_NODE_EDGE_RESIDUAL_LEDGER_DESIGN.md)で、既出field／一意payload・各保持edgeと、元producer／上位ownerへ残る不足を分類した。親graphやopaque参照先を0にせず、横断残項と既出payloadの二重加算を分離する。全graphの閉包・実容量／解放は未実証で、選択未承認、元5秒／既定並列度・各閉鎖条件・Unknown・調査保留を維持し、実装・発行・消費・採取・再実行は行わない。
