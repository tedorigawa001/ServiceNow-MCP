# WF-B SG-A後：frame／capture台帳と確認物・正規slot対応

Version: draft-0.2 / Date: 2026-11-15 / 読取り基準HEAD: `a171926` / レビュー修正基準HEAD: `17eb896`。

draft-0.1のレビュー修正：数値・field数の誤りはなかった。§3のFF01の参照列が`entry_fact_ref`で、§5の「enter_fact」や既存の`canonical_enter_ref`・`enter_state`・`enter_slot_ref`・EV01 EnterFact・LC08.enter_evidenceの`enter`表記と一致せず、名前で対応をたどれなかった。field数・形式部分和`41+42ρ`は変えず、FF01を`enter_fact_ref`へ統一した。

Status: **非実行frame／capture配置案F0と確認物入口の詳細設計のみ。LOAD6／LOAD7の選択・追加payload／配置・共有方式・容量capは未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[origin／epoch生成・失効／共有draft-0.1](BEST_PRACTICE_WFB_SGA_ORIGIN_EPOCH_BINDING_REVOCATION_DESIGN.md)と[canonical claim対応台帳draft-0.1](BEST_PRACTICE_WFB_SGA_CANONICAL_ISSUANCE_CLAIM_LEDGER_DESIGN.md)。[全root field台帳draft-0.2](BEST_PRACTICE_WFB_SGA_ROOT_FIELD_REFERENT_LEDGER_DESIGN.md)、[graph境界・値／protocol形状draft-0.1](BEST_PRACTICE_WFB_SGA_GRAPH_BOUNDARY_CANONICAL_PROTOCOL_SHAPE_DESIGN.md)、[L0配置・費目draft-0.1](BEST_PRACTICE_WFB_SGA_INTERNAL_SLOT_LAYOUT_CAPACITY_COST_DESIGN.md)、[writer退出／borrow退役draft-0.2](BEST_PRACTICE_WFB_SGA_BACKING_OWNERSHIP_WRITER_EXIT_DESIGN.md)を維持する。R1直接field・既存CM／LCのclaim位置・wire fieldを変更するものではない。

## 1 対象：実call stackと設計上のcarrierを分離

本書のframeは、固定処理の同一性・進入／退出・保持責務を結合する論理frameと、そのmetadata carrierを指す。実JavaScript call stack、Promise、callback、closure、native frameが各1個になると主張しない。「全field」はF0が宣言するcarrier／capture／dutyの全直接fieldであり、現codeの全捕捉先を照合済みという意味ではない。

値・台帳の実heap探索、任意objectの列挙、getter／Proxy／iterator実行、stack／環境dump、GC観測を行わない。固定producerからの同実参照・非漏出・例外安全な格納をsourceで確認できなければ、metadataの形だけで実frame進入・join・全capture退役を成功扱いしない。

## 2 先行保持の配置案と未接続境界

R1のRG11.inflight_frame_refはwriter／postの直列区間、RG02.active_frame_refはroot側実行境界、OSlot.active_frame_ref／RG06.pending_frame_refはconstructor境界である。これらを同名だから一つへまとめず、一つのRG11参照だけで複数recordのsegment／custodyの保持までcoveredとしない。

| 対象 | F0で提案する先行保持 | 現在の不足・保持条件 |
|---|---|---|
| constructor | 既存親OSlotに結合した非証拠ConstructorDuty 1位置 | root生成より先に成立する親の固定保持が必要。OSlot／duty自身の生成失敗の完全捕捉は未保証 |
| root orchestration | 同rootのprivate issuerが所有するRootDuty 1位置 | RG02との同実参照対応が必要。論理run carrier 1位置を全callback／stack数1としない |
| 各recordの固定4role | 同issuer所有referentに、固定RoleDuty[N,4]を先行準備する追加payload案 | 現R1／LC08にこのgridが実在・接続している保証はない。LC08.originの固定issuer／subject結合から同RoleDutyへ対応させるprivate経路を別途確認する必要 |
| 正規確認物 | 元のLC／RG位置と非証拠Dutyのpending位置を分離 | LC08.enter_evidence等へ空dutyを置いて証拠と見なさない。準備済みと発行済みは別 |

RootDutyとRoleDutyの参照directoryも追加referent payloadの候補で、global map／任意登録口ではない。論理fieldは`layout_tag:T,state:T,root_duty_ref:R,role_duty_refs:R[4N]`だけとする。Tは閉じたtagの1byte、Rは参照位置で幅ρはUnknownというL0候補記法を使う。実配列container・header・参照先容量は別である。

この経路がR1のissuer／subject参照から安全に届くかは未照合で、隠れた既存slotがあると推定しない。実装に新しいLC08／R1直接fieldが必要なら、既存field台帳・容量・費目を別版で改訂するまで接続しない。新payloadの準備・partial生成・失敗保持費をL0部分和や出力予約に含まれているとはしない。

## 3 全直接field列：FrameCarrier／CaptureCapsule／DutyHolder

下表以外のfield・可変長extra／events／capture mapをF0へ追加しない。Iはfield別上限を持つ非負2byte候補。未生成・非適用・保持未確認はstateと生成prefixで区別し、空参照だけで不存在・返却済みとしない。キャリアのstate／kindは発行権限ではなく、正規claim・role・Exitの代用にはならない。

| ID／形状 | scalar／固定state位置 | private参照位置 | 所有・非適用 |
|---|---|---|---|
| FF01 FrameCarrier | `kind:T,phase:T,lifecycle:T,body_state:T,exit_state:T,join_state:T,capture_state:T,failure_state:T,pending_kind:T,record_index:I,role_index:I` | `owner_ref:R,context_ref:R,subject_ref:R,origin_ref:R,epoch_binding_ref:R,canonical_enter_ref:R,terminal_claim_ref:R,duty_ref:R,grant_ref:R,enter_fact_ref:R,exit_candidate_ref:R,join_fact_ref:R,capture_ref:R,pending_ref:R,failure_ref:R,caller_origin_ref:R` | 固定frame owner。constructorやrootにGrant／roleがなければ非適用。未開始のframe carrierから進入確認物を生成しない |
| FF02 CaptureCapsule | `kind:T,scope_state:T`と下記12参照それぞれの固定`capture_status:T` | `root_ref:R,outer_slot_ref:R,context_ref:R,subject_ref:R,holder_ref:R,value_ref:R,packet_ref:R,pending_ref:R,work_ref:R,failure_ref:R,caller_ref:R,upstream_ref:R` | 1frameの宣言済み直接capture。statusは未取得／保持／非適用／退役確認／未確認。kind別許可にない位置は非適用 |
| FF03 DutyHolder | `kind:T,phase:T,prepare_state:T,enter_state:T,body_state:T,exit_state:T,join_state:T,retire_state:T,capture_state:T,fault_class:T,record_index:I,role_index:I` | `owner_ref:R,subject_ref:R,origin_ref:R,epoch_binding_ref:R,canonical_enter_ref:R,terminal_claim_ref:R,frame_candidate_ref:R,frame_ref:R,capture_candidate_ref:R,capture_ref:R,exit_candidate_ref:R,join_fact_ref:R,retire_fact_ref:R,upstream_ref:R` | frame生成／進入前に保持する非証拠shell。元candidate／採用済み同参照を区別し、失敗後も消さない |

stateは未生成／準備中／結合済み／進入未確認／進入確認／finally候補／join未確認／join確認／退役未確認／退役確認の必要な区別を閉じたkind別遷移へ割り当てる案。body_stateは未開始／進入確認／開始未確認／復帰確認を区別する。frame metadataを準備しただけでbody開始・実復帰・退役を確認済みにしない。phase／kind／fault_class等も固定分類で、自由文・raw例外・stackを載せない。

FF02の各capture_statusは上表の参照順の固定12位置とする。rootやcallerへの参照が同じ実体でも各cell費を残す。root_refから親graphへ到達すれば、その先も0byteとは扱わない。実closure・stackがこの12位置以外の参照を持つ場合はsource coverageと容量の不足であり、許可外fieldへ隠したり、宣言にない捕捉先を不存在としたりしない。

FF01／FF03の状態は正規CM／LC／RGからの観測・duty保持のための位置で、第二のconsume口ではない。enter／retireは既存CM11／12、writer joinはLC05、最初の理由は既存RG14または先行OSlotの正規ownerに従う。fault_classは追加の有限分類で、firstを上書きしない。state同士の不一致は単に書き直して再開せず、元値・canonical位置・frame／captureを保持して停止する。

## 4 kind別capture・生成／join／退役境界

| ID／kind | FF02で許す直接capture field | 生成・正規対応 | join／退役の必要条件・費目owner |
|---|---|---|---|
| FK01 constructor | `outer_slot_ref,root_ref,context_ref,subject_ref,pending_ref,work_ref,failure_ref,caller_ref,upstream_ref` | 親OSlot／ConstructorDutyを先行保持。CM00、RG06の後発projection、OSlot.active_frame_ref／RG06.pending_frame_refの同frame対応 | 固定生成継続のreturn／catchと格納prefix・元candidateを同親が確認。root／pendingを引受確認なしにclearしない。OP00／OP02、失敗OP18、保持OP19 |
| FK02 root orchestration | `root_ref,context_ref,subject_ref,packet_ref,pending_ref,work_ref,failure_ref,caller_ref,upstream_ref` | RootDuty／CM01、RG02.active_frame_ref。TERM seal／終端も同rootの固定計画へ結合 | 子duty・予定配送・未確認上位責務が残ればroot join／全cleanupを成功化しない。Promise settleだけを根拠にしない。各主処理OP03〜OP17、失敗OP18、終端OP19 |
| FK03 writer | `root_ref,context_ref,subject_ref,holder_ref,value_ref,pending_ref,work_ref,failure_ref,caller_ref` | RoleDuty[j,writer]／CM11、LC04のprojection、LC05、RG11.inflight_frame_ref | finally候補→同固定caller復帰→in-flight終端／非漏出確認。LC08.writerの退役前にpostへ通常slotを使い回さない。OP13、失敗OP18、退役OP19 |
| FK04 post_check | `root_ref,context_ref,subject_ref,holder_ref,value_ref,work_ref,failure_ref,caller_ref` | writer join／退役確認後、同recordの別RoleDuty／CM11へ。RG11の利用は同参照／元責務の移行確認後 | 固定read継続の復帰・非漏出・post条件を確認し、CM12退役後だけCM10昇格へ。writer factをpost factへ流用しない。OP13／OP19 |
| FK05 segment_build | `root_ref,context_ref,subject_ref,holder_ref,packet_ref,pending_ref,work_ref,failure_ref,caller_ref` | encoded昇格後のRoleDuty[j,segment]／CM11 | 固定参照表構築の復帰と、残したsegment／custody参照の引受を確認。同backingのread資格・参照cellを分離。OP14／OP19 |
| FK06 packet_custody | `root_ref,context_ref,subject_ref,holder_ref,packet_ref,pending_ref,work_ref,failure_ref,caller_ref,upstream_ref` | 同segment・同上位ownerのRoleDuty[j,custody]／CM11 | 同read継続の復帰とborrow／上位保持の責務を別に確認。packet receiptだけでCM12やreclaimへ進めない。OP14／OP19 |

holder_refはLC02等の正規保持元であり、F0に第二のraw backing fieldを作らない。固定writer本体の局所raw viewやpostのread参照が実際にいつ消えるかは、実frame／sourceで別に確認する。metadataからraw参照を公開しないことと、実stack内に一時参照が存在しないことは別である。

packet全体の一つのcallbackが複数recordへ触れる実装でも、FK06のrole用subject・claim・dutyを自動的に一つへまとめない。逆に、4Nの論理role位置が同数のJavaScript callbackを必要とするとも言わない。source上で追加の通知／settle handler・timer／getter／native subframeが独立した同一性／退出責務を持つなら、そのkind・固定slot・捕捉先・費用を追加設計する必要がある。RootDuty 1位置へ無条件に畳み込んで有限保証を作らない。

caught raw exceptionが実catch frameに一時的に残る可能性も、FF01／02へ保存しないという規則だけでは消えない。全文保存・serialize・診断event列化はせず、有限な故障分類へ写す元継続と、その間の実保持を別のUnknownとして残す。callback／任意closureをwork_refへ入れるだけで固定形状の捕捉が完了したとはしない。

## 5 確認物と正規slotの入口対応

以下はimmutable fact／候補の論理形状で、同じfieldを持つobjectを外部から作れば受理される型ではない。固定private issuer・同frame実体・origin／epoch・subject・正規slotの同一性と、その段階の実事実が必要である。未確認のcarrier／dutyは証拠に昇格しない。

| ID／確認物facet | 閉じた論理field列の候補 | 正規slot・確定条件 | 失敗時 |
|---|---|---|---|
| EV01 EnterFact | `kind,state,issuer_ref,subject_ref,origin_ref,epoch_binding_ref,frame_ref,enter_slot_ref` | roleはLC08.enter_evidence、同CM11／同frame進入の固定確認。frame carrier生成やclaim消費だけでは発行しない | enter未確認を同Duty／元slotに保持。別frame／同値copyから生成しない |
| EV02 FinallyCandidate | `kind,state,issuer_ref,subject_ref,origin_ref,epoch_binding_ref,frame_ref,exit_slot_ref` | writerはLC05.exit_candidate。他kindの候補位置は同Dutyのexit_candidate_ref。finally区間での候補事実に限定 | 候補をjoinへ昇格せず、元frame／局所captureの未確認責務を残す |
| EV03 JoinFact | `kind,state,issuer_ref,subject_ref,origin_ref,epoch_binding_ref,frame_ref,exit_candidate_ref,join_slot_ref` | writerの正規状態はLC05.join、他kindの同Duty.join_stateは確認継続との対応が必要。固定callerの同return／catch・後続利用なしを確認 | LC05.joinというstate位置だけで、別のJoinFact objectも存在するとしない。必要な追加object／参照は別容量とsource対応へ |
| EV04 RoleRetireFact | `kind,state,issuer_ref,subject_ref,origin_ref,epoch_binding_ref,frame_ref,enter_slot_ref,retire_slot_ref,join_slot_ref` | LC08.retire_evidenceと同CM12。元enter・同role／同origin・退出／参照返却確認を結合 | retire claim消費済みでも未確認なら返却成功にしない。再貸与・再発行なし |
| EV05 PacketReceipt | `kind,state,issuer_ref,packet_ref,origin_ref,settle_slot_ref` | RG03.accepted_receipt_ref、同CM04・同packetとnAck／h条件を満たす正規受理 | 拒否／取消／時刻不足では受理確認物なし。後着で第二settleなし |
| EV06 RootCustodyFact | `kind,state,issuer_ref,subject_ref,origin_ref,borrow_slot_ref,retire_slot_ref` | RG12.custody_receipt_ref、同CM07・同root・固定引受先に結合。role退役と別の対象 | 上位引受未確認なら元root／duty／OSlot責務を残す。packet receiptを代用にしない |
| EV07 OuterAdmission | `kind,state,parent_ref,oslot_ref,origin_ref,construction_claim_ref` | RG06.outer_admission_ref、同親OSlot／CM00の既存private入場確認 | 後発RG06.claimや診断copyで入場を再生成しない。親未成立なら新rootへ未入場 |

EV01／03／04／05／06／07は各kindの正規条件を満たす確認、EV02は最後までfinally候補という別kindである。共通のstate値を書き換えて相互変換しない。EV03が既存canonical状態と固定継続のfacetで足りるか、追加のimmutable objectを要するかはsource／配置レビューが必要であり、今回はいずれも実装・発行しない。

enter_fact／join_fact／retire_factの参照をF0に設けたことは、実確認物が常に生成できる保証ではない。候補生成途中・slot採用前後の失敗を、元Dutyのcandidate／pending位置へ保持する。同値の二重確認物・未知issuer・異subjectは拒否するが、既に取得した物の保持責務まで消さない。

## 6 固定生成・進入・join・退役順序

| ID | 論理境界案 | 失敗時の固定処理・所有 |
|---|---|---|
| FSF01 | 同OSlot／root／roleの非証拠Dutyと診断／停止・正規claim参照を先行準備 | 準備不足ならCM消費／bodyなし。constructor前の失敗は親保持境界へ。OP00／OP02 |
| FSF02 | FrameCarrier／CaptureCapsule候補を固定producerから生成し、同Dutyのcandidate位置に同実参照を捕捉 | 生成返却前後・格納未確認を分離。元frame／pendingを保持し、第二carrier・第二captureで救済しない。OP00と元処理費 |
| FSF03 | 全field・kind別capture・origin／epoch・subject・保持先を固定検査し、同候補をDuty.frame／captureへ採用 | copyで採用しない。二つのfield同時更新をatomicと仮定せず、partial採用は未確認保持・停止。OP02／OP12 |
| FSF04 | 全前提と元予算・停止を確認し、正規CMを一度扱い、同frameの進入／body開始境界へ | writerはCE01〜05を維持。spentと実進入を分離。消費後失敗をfreshへ戻さない。元OP |
| FSF05 | 正常／throw／取消からfinally候補を同frameへ記録し、write／新規利用資格を閉じる | finally内はまだframeの中。active=0／capture消滅・join済みにしない。元OP／OP18 |
| FSF06 | 固定caller継続が同frameの復帰・後続利用なし・未確認in-flightを合流し、kind別joinを確認 | 任意callback settle／同値Ack／stateだけを代用にしない。source不足・throwなら元frame／Duty／候補保持。元確認費 |
| FSF07 | 各適用roleのCM12・capture／参照返却を確認し、正規retire fact／上位引受へ結合 | CM12消費と退役確認成功は別。未確認は元slot／上位custodyへ、claim再発行なし。OP19 |
| FSF08 | 元参照の解除・carrier保持責務移譲・root終端を確認した階層だけ更新 | metadata解除と実stack／closure／allocator解放を分離。未確認を差し引かず、root終端をprocess全体終了としない。OP19 |

正規claim消費後・進入前に失敗した場合、固定境界からbody未開始と確認できる枝だけを未開始とする。frame未生成・未進入ならEnterFact／finally／joinの成功物を捏造しない。元claimはspent／消費未確認、同Dutyは未開始・保持／未確認を区別し、必要な元参照の固定回収・引受を別に扱う。既に進入した可能性があれば、その不足をUnknownとして残す。

origin／epochのwork失効は新しい通常入場を閉じるもので、元の旧frameの退出／保持確認成功ではない。同旧origin／epoch・先行Duty／Exit・元予算の固定継続だけでlate復帰を扱う。新frame／epoch・追加clock／poll・再claimで通常処理を再開しない。writer正常退出とrecord／batch失敗の違い、TERMの分岐条件も既存設計を維持する。

## 7 多重度と容量算定へ渡す単位

| 対象 | 構造候補 | 算定の限界 |
|---|---|---|
| root／role Duty配置 | root1＋4N＝57／61位置 | 追加referent payload案。constructorの親側1は別で、計58／62。実object数ではない |
| 適用Duty位置 | root1＋(4P+2)＝55／59位置 | 親constructorを含め56／60。TERMの非適用2role位置も配置費は残す |
| frame／capture候補 | 同Dutyあたり各1正規carrier候補、同候補を採用 | 別copy／第二候補を生成しない前提。candidateと採用位置は別edgeだが、同実体ならpayloadは一度。失敗生成物・局所frame・native保持の全数ではない |
| writer／post区間 | 同trial全体で1区間、前record退役前に次取得なし | constructor／root／segment／custody・callback／stackまで同時1とは言わない |
| read role | 同record内segment／custodyは最大2roleが重なり得る候補 | role位置・metadata・上位borrow・実call frame数を区別 |
| 確認物参照先 | 既存enter／Exit／retire／receipt／custodyの固定位置と対応 | slot位置数とimmutable事実object・alias・局所値の数を同一視しない |

L0候補幅をF0の列挙fieldだけへ適用すると、FF01は9tag＋2I＝13 scalar byteと16参照位置、FF02は14tagと12参照位置、FF03は10tag＋2I＝14 scalar byteと14参照位置となる。一組の形式部分和は`41+42ρ`。directory部分は`2+(1+4N)ρ`。これは新しい列挙部分の算定候補で、既存LC05等との実同位置対応や追加実装を確認していない。L0／R1との重複有無を確認せず自動加算・減算しない。

carrier／dutyのタグ群が同じ値を持っても、既存canonical stateとの整合・更新資格が必要であり、複製したfieldが新しいauthorityになることはない。実参照幅ρ、container／配列capacity、JoinFact等の追加payload、captured root／親graph、局所raw view・caught例外・stack／closure／native一時値、partial生成物の実容量はUnknownである。形式部分和から総memory cap・実費・合法最大を導かない。

## 8 故障・保持責務と費目所有

| ID／境界 | 保持・停止 | 主費目・最終owner |
|---|---|---|
| FH01 Duty準備前・親未成立 | 新frame生成／claim消費へ入らず、親の既存未確認責務へ。記録／返却まで必ず成功するとはしない | 準備OP00、結合OP02、別失敗OP18。親owner |
| FH02 frame／capture生成・格納途中 | 元candidate／元frame／pending・部分採用prefixを保持。完全捕捉できなければUnknown、第二保持表なし | 元生成費、OP18／OP19。Duty／OSlot、最終TrialOwner |
| FH03 claim消費後・body前の失敗 | spent／消費未確認を維持し、未開始と不明を分離。成功EnterFactなし | 元OP、OP18／OP19。同canonical slot・Duty |
| FH04 body throw／取消・finally失敗 | 初回理由と旧frame／capture／holderを保持。revokeだけで退出成功・次record許可にしない | 元OP13等、OP18。元owner、退役OP19 |
| FH05 join根拠不足・異frame候補 | 元Exit／Duty／局所参照の未確認責務を残す。候補からjoinへ変換しない | 元確認費、OP18／OP19。固定caller／TrialOwner |
| FH06 post失敗・segment途中／上位引受未確認 | 非公開backing／固定prefix／上位borrowを保持。receiptだけで退役せず再通知・copyで救済しない | 元OP13／OP14、OP18／OP19。SamplerOwner／CustodyOwner |
| FH07 失効後late復帰・重複確認物 | 同旧対象の固定診断／退出確認だけに合流し、新しい通常権限を発行しない | 元継続と固定OP18／OP19。元owner／親終了owner |
| FH08 root終端・元参照解除後もreclaim不明 | metadata退役と実解放を別に保持し、物理live量から未確認分を差し引かない | OP19。確認した引受先と元の未確認責務 |

位置／candidate準備OP00、固定生成元の供給確認OP01、同一性／claim binding OP02、arm OP03、入場OP04、取得／投影／差分／集計OP05〜OP11、受付OP12、writer／post・encoding OP13、segment／通知／receipt OP14、既存追加clock／境界記録OP15、guard／試行分類OP16／OP17、固定失敗OP18、custody／退役OP19へ対応付ける。各更新・確認・保持のoccurrenceに主費目は一つ。元操作失敗の支出と、その後の別失敗処理を分離する。

metadataを共有してもcapture検査・slot格納・join確認・返却のworkは無料にならない。root／親のinclusive費と子の内訳を同軸で二重加算せず、固定戻り境界・非介在・部分更新・同期停止・一時値をsource coverageへ残す。元のQ／R／tail配賦を動かしたり、cleanupの余りへ押し込んだりしない。元5秒・既定並列度・列挙取得62／70を維持し、新clock・実frame採取は行わない。

## 9 独立検証の受入条件案（全て未実施）

| ID | 独立対照 | 必須条件 |
|---|---|---|
| FT01 | FF全field・未知capture・kind違い | 閉じた形状とkind別captureを維持。work_refへ任意closureを隠して有限保証にしない |
| FT02 | 空Duty／carrier・claim spentだけの状態 | EnterFact／join／retireへ昇格せず、準備／消費／実進入を分離 |
| FT03 | 各FSF生成／採用prefixのthrow・格納未確認 | 同candidateの元保持・費用を残し、第二carrier／captureで救済しない |
| FT04 | 同値origin・別frame・constructor／root／writer混同 | 同frameと同callerの根拠がなければjoin拒否。全frameを同時1としない |
| FT05 | finally候補だけ／Promise settleだけ・raw参照漏出 | join／capture退役・reclaim成功を生成せず未確認保持 |
| FT06 | post／segment／custody・上位receiptだけ | roleを区別し、元borrow／上位引受の未確認を保持。次record条件を緩めない |
| FT07 | body未開始の消費後故障・late復帰 | 未開始／進入／不明を固定境界で分類し、claim reset・新epochなし |
| FT08 | join stateだけなのにJoinFact objectも計上／逆に追加object無料扱い | 同位置facetと別payloadを分離し、source未確認はUnknown |
| FT09 | Duty／適用位置／部分field和から総memory成功 | 57／61・58／62・55／59・56／60と41+42ρを区別、局所／親／実配置費を残す |
| FT10 | 二重主費目・新clock／追加時間・正式発行へ昇格 | 費目・期限・閉鎖条件を維持。S／F／R／Aを混同しない |

oracleは対象のframe／capture／issuer／join helperを流用せず、固定field列・capture許可表・正規slot・故障prefixから期待関係を作る計画。今回は文書リンク・表・定数式だけを静的に確認し、追加payload・issuer・合成テスト・実frame／source照合は実装／実行しない。

## 10 未承認事項と今回の範囲

- [ ] F0全field・kind別capture・追加非証拠Duty payloadと既存slot経路のレビュー。
- [ ] enter／finally候補／join／retire／receipt／custodyの生成元・受理条件・同位置対応のレビュー。
- [ ] 生成／採用途中・body未開始・join未確認時の保持責務と例外安全性の確認。
- [ ] 参照先全容量・局所／closure／実stack・source coverage・費目／最大同時保持の有限化。
- [ ] LOAD6／LOAD7・配置／共有／方式／容量と、実装／合成試験／実確認／保管の個別承認。

全て未承認。本MDと親2文書の参照更新だけを行う。元の5秒期限・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは行わない。

文書整合として対象3文書のローカルリンク20件・表26個の列数、FF01〜03／FK01〜06／EV01〜07／FSF01〜08／FH01〜08／FT01〜10のID連番、field名の重複なし・kind別captureの許可範囲、未承認チェック5項目、Duty配置／適用位置と形式部分和41+42ρ、費目OP00〜19、末尾改行・差分空白を静的に確認した。初回の文言検査では「選択」の明示が不足していたため、LOAD6／LOAD7の選択未承認を冒頭へ明記し、再確認した。これは文書・定数の検算のみで、合成試験・実frame／capture照合・発行・実費／容量／最大同時保持の実証ではない。

## 11 後続の確認物・正規slot／確定境界（2026-11-15）

[確認物の正規slot・生成元・確定境界draft-0.1](BEST_PRACTICE_WFB_SGA_EVIDENCE_CANONICAL_SLOT_MAPPING_DESIGN.md)で、EV01〜07の生成元・採用先・事実確認とF0観測edge、constructor／root・4roleの適用を分けた。LC05.joinの状態facetと追加JoinFact payloadは未選択で、元候補・partial採用・未確認責務を保持する。選択未承認、元5秒／既定並列度・各閉鎖条件・Unknown・調査保留を維持し、実装・発行・消費・採取・再実行は行わない。

## 12 後続の確認payload・候補／採用済み保持（2026-11-15）

[確認物の参照先形状・候補／採用済み保持slotの容量境界draft-0.1](BEST_PRACTICE_WFB_SGA_EVIDENCE_REFERENT_HOLD_CAPACITY_DESIGN.md)で、F0の確認参照とEVの直接field・到達先を対応付け、元frameの局所保持・専用候補slot不足・同実体の複数edgeを分離した。確認物から元frameへの保持延長を残し、退役事実だけでcapture／実解放を成功化しない。選択未承認、元5秒／既定並列度・各閉鎖条件・Unknown・調査保留を維持し、実装・発行・消費・採取・再実行は行わない。
