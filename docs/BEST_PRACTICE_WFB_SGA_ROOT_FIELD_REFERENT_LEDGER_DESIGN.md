# WF-B SG-A後：全root field台帳・参照先分類と最小shell失敗責務

Version: draft-0.2 / Date: 2026-11-15 / 読取り基準HEAD: `e276ea1` / レビュー修正基準HEAD: `102ad86`。

draft-0.1のレビュー修正：数値の誤りはなかった。§1の記法Iが12Nの上限を「record管理群位置」と呼んでいたが、本書のRG09と親の論理配置設計§3では「管理群」をLC01〜07の7N位置に使い、12Nは管理7群・4role・値cellを合わせたrecord群位置である。上限値12Nは変えず、名称を「record群位置（管理7群・4role・値cell）」へ改め、管理7群の上限7Nを併記した。選択状態・field列・定数は変えていない。

Status: **field台帳・所有境界の詳細設計のみ。LOAD6／LOAD7の選択・内部配置・storage／writer方式・容量capは未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[内部slotの論理配置・容量算定と費目所有draft-0.1](BEST_PRACTICE_WFB_SGA_INTERNAL_SLOT_LAYOUT_CAPACITY_COST_DESIGN.md)と[phase別保持・内部slot最小値域draft-0.2](BEST_PRACTICE_WFB_SGA_PHASE_RETENTION_SLOT_DOMAIN_DESIGN.md)。[固定schedule draft-0.3](BEST_PRACTICE_WFB_SGA_FIXED_SCHEDULE_SLOT_ENCODING_DESIGN.md)と[provider／clock・費目所有設計](BEST_PRACTICE_WFB_SGA_PROVIDER_CLOCK_COST_OWNERSHIP_DESIGN.md)を維持する。正規root・shell・claim・getter・保存口を生成するものではない。

## 1 「全field」の範囲と配置案R1

本書の「全」は、**非実行の配置案R1がroot直下およびroot所有の管理groupに置くfield名の全列挙**を意味する。現実装の全fieldを調査・照合したという意味ではない。参照先の値object・外側owner・closure・runtime内部まで全byteを算定したとも言わない。R1の閉じた列にないfieldが必要なら、版を上げて台帳・費目・保持を更新し、追加fieldを無償のcatch-allへ入れない。

配置はroot directory、12個の追加管理group、既出のTiming／Failure／Countsの計15個の参照先groupに分ける案。directory自体も別に列挙する。参照による境界であって、16個のheap objectを選択・確保する設計決定ではない。既存classへの埋込み・共有・配列の実配置は未確認である。

| 記法 | R1の論理値域・数え方 | 制約 |
|---|---|---|
| T | 閉じたtagの1byte候補 | stateは未開始／準備中／保持／確認済み／拒否／失敗／未確認／退役／非適用の有限区別。phaseはFS、subphaseはWX、原因は固定理由、kindは固定分類。field別の合法遷移を満たさない値は拒否し、tag幅だけで通さない |
| B | Boolの1byte候補 | 初期falseは未発生の意味だけ。確認物の代用にしない |
| I | 非負整数の2byte候補 | field別上限を併用。record位置≤N、role位置≤4N、record管理群位置≤7N、record群位置（管理7群・4role・値cell）≤12N、出力credit≤既存予約和。overflow／clipなし |
| R | private参照保持位置1個、幅ρはUnknown | 未生成／保持未確認を周辺state・生成prefixと対で扱う。nullだけで不存在・解放済みと判定しない |
| R[k] | 固定indexの参照保持位置k個 | 論理上のinline位置としてkρ。実装で別配列objectを使う場合のcontainer参照・header・capacityは別算定。可変長map／growを許す記法ではない |

Tの共通state集合は自由な状態遷移を許すものではない。claimは未試行／消費済み／消費未確認の一方向、承認は未承認／承認済み、証拠S／F／Rは未確認／整合／不足／失敗を別欄にする。表中のschema／配置版・profileは版固定の閉じた識別値で、profileの未選択をLOAD6へ補完しない。正規binding・開始には別途必要な承認・証拠が必要で、今回は全て未取得のままである。

## 2 root直下・管理groupの全field列

各行に書いたfieldだけをR1の直接保持位置とする。型名・内部field名は候補であり、実codeへの追加ではない。N=14／15、P=N−1、mono結果数m=26／29、UTC結果数u=6／7。profileによる配列長は比較候補の二通りで、選択は行わない。

| ID／group | scalar field列 | 参照field列 | writer・費目所有 |
|---|---|---|---|
| RG00 Directory | `layout_tag:T, root_state:T` | `context:R, control:R, receipt:R, budget:R, progress:R, construction:R, failure_extension:R, time_aliases:R, registries:R, scratch:R, work:R, custody:R, timing:R, failure:R, counts:R` | 先行構築OP00、TrialOwner。生成済み参照を失敗後も保持 |
| RG01 Context | `state:T, schema_tag:T, layout_tag:T, profile_tag:T, approval_tag:T, evidence_S:T, evidence_F:T, evidence_R:T` | `owner_ref:R, trial_ref:R, plan_ref:R, source_ref:R, pin_ref:R, schema_ref:R, profile_ref:R, provider_ref:R, clock_ref:R, stop_ref:R, budget_owner_ref:R, requirements_ref:R, approval_ref:R, outer_owner_ref:R` | 空位置OP00、固定供給確認OP01、同一性binding OP02、TrialOwner／PinOwner。固定後に別実体へ再bindしない |
| RG02 Control | `phase:T, subphase:T, stop_state:T, stop_cause:T, run_claim:T, packet_seal_claim:T, notify_claim:T, close_claim:T, frame_state:T, guard_state:T, call_attempt:T, terminal_state:T` | `active_origin_ref:R, active_frame_ref:R, stop_origin_ref:R` | 初期化OP00、開始OP02、予定入場OP04、境界更新OP15、guard／試行分類OP16／OP17、失敗OP18、終端OP19。全体TrialOwner |
| RG03 Receipt | `state:T, settle_claim:T, notify_return:T, revoke_state:T, late_seen:B, duplicate_seen:B` | `packet_ref:R, receipt_origin_ref:R, accepted_receipt_ref:R` | 初期化OP00、通知／最初のsettle OP14、失効／保持OP18／OP19。CustodyOwner、受理未確認はSamplerOwner、全体TrialOwner |
| RG04 Budget | `state:T, tail_state:T, guard_claim:T, allocation_state:T, total_output:I, reserved_output:I, charged_output:I` | `policy_ref:R, tail_reservation_ref:R, cleanup_reservation_ref:R, budget_origin_ref:R, parent_deadline_ref:R, load6_deadline_ref:R, light_fresh_deadline_ref:R` | 準備OP00／OP02、原起点の結合OP03、受付OP12、record取得支出OP13、最終guard OP16、失敗／責務OP18／OP19。同canonical予算ownerを維持 |
| RG05 Progress | `batch_mode:T, last_role:T, source_projection_state:T, sample_prefix:I, interval_prefix:I, encoded_prefix:I, current_record:I` | `active_anchor_ref:R, active_exit_ref:R` | 初期化OP00、取得／投影OP04〜OP12、encoding OP13、失敗OP18、責務確認OP19。SamplerOwner、最終TrialOwner |
| RG06 Construction | `state:T, claim:T, pending_kind:T, assign_state:T, joined:T, root_group_prefix:I, record_index:I, record_group_prefix:I, role_index:I, role_group_prefix:I` | `outer_admission_ref:R, pending_ref:R, pending_frame_ref:R` | OP00の生成prefix、OP02のbinding。失敗処理は別occurrenceのOP18、退役確認はOP19。親保持境界とTrialOwnerを結合 |
| RG07 FailureExtension | `construction_fault:T, capacity_fault:T, binding_fault:T, exit_fault:T, custody_fault:T, preservation_state:T` | `secondary_origin_ref:R, unconfirmed_holder_ref:R` | 先行位置OP00、発生処理の固定分類・保持OP18、未確認責務OP19。最初の理由はRG14から分離しない |
| RG08 TimeAliases | `state:T` | `h_ref:R, sample_entered_refs:R[6], summary_entered_ref:R, terminal_notify_ref:R, terminal_ack_ref:R, terminal_guard_ref:R, terminal_call_ref:R, terminal_seal_ref:R` | 位置OP00、元観測の結合OP04／OP12／OP14／OP15／OP19の対応occurrence。追加clockなし、TrialOwner |
| RG09 Registries | `state:T, record_count:I, pre_count:I` | `record_cells:R[N], management_groups:R[7N], role_cells:R[4N], mono_cells:R[m], utc_cells:R[u], scheduled_cells:R[6]` | 固定位置OP00、binding OP02、参照退役OP19。canonical参照表であり値／slotの別copyではない |
| RG10 ScratchHeads | `state:T, previous_state:T, current_state:T, scope_state:T, previous_cpu_count:I, current_cpu_count:I` | `previous_ref:R, current_ref:R, scope_origin_ref:R, provider_pending_ref:R` | 位置OP00、getter戻り値OP06／OP07／OP11、投影／差分OP08／OP09、失敗／退役OP18／OP19。SamplerOwner |
| RG11 WorkHolders | `state:T, write_state:T, wide_state:T, token_state:T, record_index:I` | `workspace_anchor_ref:R, token_ref:R, wide_work_ref:R, inflight_frame_ref:R` | 位置OP00、集計OP09／OP10、encoding OP13、失敗／退役OP18／OP19。固定処理のowner、最終TrialOwner |
| RG12 RootCustody | `state:T, transfer_claim:T, settle_state:T, root_borrow_state:T, local_retire:T, reclaim:T, os_return:T` | `parent_ref:R, packet_ref:R, terminal_ref:R, custody_receipt_ref:R, unresolved_registry_ref:R` | 位置OP00、packet受理OP14、上位保持・退役・終了確認OP19。CustodyOwner／終了owner、全体TrialOwner |
| RG13 Timing（既出） | mono各位置のstate＋U64候補payload、UTC各位置のstate＋24 ASCII候補payload、予定S各位置のstate＋U64候補payload | mono／UTC各位置の`origin_ref:R`。予定Sには追加origin参照を置かないL0案 | OP03／OP05／OP11／OP15。既出`438+32ρ`／`490+36ρ`を再列挙したもので追加分ではない |
| RG14 Failure（既出） | `first_state:T, reason:T, fs:T, op:T, provider:B, clock:B, scope:B, capacity:B, encoding:B, receipt:B, duplicate:B, cancelled:B, late:B, binding:B, cleanup:B, timing:B` | `origin_ref:R` | 位置OP00、最初の理由・二次flagの固定失敗処理OP18、境界での記録OP15、未確認責務OP19。既出`16+ρ`、先行理由を上書きしない |
| RG15 Counts（既出） | `group_state:T, cpu_getter:I, light_getter:I, mono_read:I, utc_read:I, sample_visit:I, delta_visit:I, encode_attempt:I, notify_attempt:I, record_seal:I` | `budget_ref:R` | 位置OP00、各元操作の計数更新。既出`19+ρ`。9上限とwire U64文字列を変更しない |

RG13のmono位置は`a, nS[0..5], bS[0..5], eS[0..5], nA, nN, nAck, g, i, z, z_post`の26位置、LOAD7だけ`nL, bL, eL`の3位置を加える。UTCは`utcS[0..5]`、LOAD7だけ`utcL`。予定Sは`scheduled[0..5]`。時刻domain・単位・精度不足をtagで保持し、再clockしない。

RG08はh→nAck、sample_entered[k]→nS[k]、summary_entered→nA、TERMのnotify／ack／guard／call／seal→nN／nAck／g／i／zへの13参照位置。aliasを置く位置の費用は新たに数えるが、元観測payloadを13個copyしたことにはしない。wire record内のsnapshot／参照表現の容量は参照先分類側へ残す。

RG04の出力creditは同record予約B[j]の一つの台帳の集計で、第二の予算ownerを作らない。charged_outputは取得attemptへ一度課金した予約prefix、allocation_stateは実容量／取得成否の確認状態とする。取得失敗でもcreditを戻して再試行せず、不明・超過のallocationをcharged_output内に収まった実memoryとして扱わない。deadline参照は同じ原起点の正規値へ結合するだけで、残時間から再計算・追加clock採取をしない。

RG05のsample／interval prefixは0〜6／0〜5、encoded prefixは0〜N、current_recordは未開始0と1〜Nを区別する。RG06のroot_group_prefixはdirectory後の15group、record_group_prefixは1recordの12群位置、role_indexは固定4role、各indexは未開始／生成済み／格納未確認と対で扱う。prefixはcanonical状態との整合が必要であり、それだけでWX08やborrow退役の確認物を代用しない。

## 3 既出fieldとの対応・重複と権限の分離

| 対応 | canonical位置・追加位置 | 算定／更新の規則 |
|---|---|---|
| L0管理7群・4role・RecordCell | LC01〜09のfieldはそのまま。RG09はそれらを指すindex位置 | 既出`63+45ρ`×Nを再加算しない。RG09の新しい参照保持位置は別に数える |
| Timing／Failure／Counts | RG13〜15はL0で列挙済みの同位置 | L0部分和へ加える差分はRG00〜12だけ。既存16byte診断と9計数を二重化しない |
| h・時刻alias | 元値RG13、root側保持位置RG08 | 同じ値でも別参照cellは数える。h成立条件を省略せず、値copyで新しいclock証拠を作らない |
| Control・Receipt claim | notifyの開始はRG02.notify_claim、応答の最初のsettleはRG03.settle_claim | 別意味のone-shot。二つのnotify許可／二つのsettleを作らない。LC09のrecord encode／seal claimも代用不可 |
| run／packet／TERM終端 | run claimとpacket全体封印はRG02。各recordのsealはLC09、TERMも同じLC09の固定位置 | rootに第二のTERM seal claimを設けない。RG02.terminal_stateはsampler終端の状態であり、全process終了証拠ではない |
| frame／workspace | RG02はroot側実行境界、LC05は同recordのwriter退出、RG11は同Anchor／同frameの保持位置 | raw backingの正規保持元はLC02。rootに別workspace backingを取得しない。frame名が似ていても確認境界を混同しない |
| first／追加故障 | 最初の理由はRG14。RG07は有限な不足分類・追加origin保持 | firstを上書きしない。RG07の1参照で全未確認物を保持できたとせず、他は元canonical slot／外側pendingに残す |
| Context・budget／custody alias | RG01・RG04・RG12から既存owner／同実体を参照 | cellは各位置分、参照先payloadは同一実体なら一度。上位所有のobjectでも保持費0とはしない |

rootの追加直接field部分は、R1の型幅条件が成立する場合に`Σ(RG00..12)`としてL0部分和と接続する。RG09の参照位置数は`12N+m+u+6`＝206／222、RG08は13という構造検算ができる。ただしρ・参照先容量・配列container・実配置差分はUnknownであり、この式を全memory／最大同時保持の上界へ昇格しない。

## 4 参照先分類の入口

参照先の全field・容量は今回完了させず、各root fieldを以下の固定分類へ対応付ける。分類名を信頼・承認・実証の成功flagにしない。直接fieldが列挙済みでも、その先に別のownerや大きな値が残れば保持算定は未完了である。

| ID／分類 | 参照元 | 次に必要な形状・容量・寿命の確認 | 不足時の保持責任 |
|---|---|---|---|
| RF01 既存の外側owner／trial・停止／予算／承認 | RG01のowner・trial・stop・budget・approval・outer、RG04の各予約・deadline、RG12.parent、RG15.budget | 同一owner・原起点・失効連動、参照先graphの境界。承認と証拠を分離 | 親owner／TrialOwner。外部labelから正規参照へ昇格なし |
| RF02 固定source／pin／schema／plan／profile／requirements／provider／clock | RG01の対応field、RG04.policy | 同版の閉じた値・供給元、共有先、label／仕様objectの実保持 | PinOwner／TrialOwner。静的宣言と実体pinを別にし、今回は新規照合なし |
| RF03 同rootの管理cell・index・registry | RG00、RG08、RG09、RG05のAnchor／Exit、RG11.workspace_anchor、RG12.unresolved_registry | LC／RGへの同実参照対応、空位置と部分生成prefix、全参照位置 | 元root／外側保持slot。別root・同値copyは拒否 |
| RF04 canonical値・sealed入力・packet／segment／TERM snapshot | LC09、RG03.packet、RG12.packet／terminal、各Publish | strict入れ子・label・固定segment表、copyとalias、旧draftの同時保持 | SamplerOwner／CustodyOwner／TrialOwner。wire長だけで内部容量としない |
| RF05 origin／epoch／attempt／frame／claim／確認物 | LCの対応field、RG02のorigin／frame、RG03のreceipt関連、RG04.budget_origin、RG06.outer_admission／pending_frame、RG07.secondary_origin、RG10.scope_origin、RG11.inflight_frame、RG12.custody_receipt、RG13／14のorigin | 生成数・捕捉先・失効後寿命・private発行元。epoch方式は未承認 | 元frame／同owner。退役未確認をsummaryから復元・成功化しない |
| RF06 出力backing／view | LC02／03／06、RG11.workspace_anchorからの正規参照 | request／view／extent／allocatorを分離、同bytes・copy有無・退出と退役 | LC02 Holderと未確認の上位custody。workspace→encodedは同backing |
| RF07 scratch／provider戻り値 | RG10.previous／current／provider_pending／scope_origin | 2面・C上限・5bucket、provider配列とprojectionの別保持・scope根拠 | SamplerOwner。20,480 logical byteでprovider戻り値全体をcoveredとしない |
| RF08 token／wide演算workspace・局所捕捉 | RG11.token／wide_work／inflight、各frameの局所参照 | 128／256-bitの同時位置数、token／文字列・closure／stack・部分writeの保持 | 固定処理owner／TrialOwner。幅だけで実一時容量を断定しない |
| RF09 construction途中の候補・未確認物 | RG06.pending、RG07.unconfirmed_holder、外側OSlotのpending／frame | pending_kind別の上記分類、返却前後・格納前後・同参照確認 | 外側owner／元frame。kind不明はUnknown、無制限dump・第二保持表なし |

RG08の参照先はRF03のRG13 cellである。RG06.outer_admissionはRF01／RF05にまたがる同外側ownerのprivate確認物で、RF05で確認物自体、RF01でそのowner参照先を追う。RF09は任意objectを安全に受理できる包括型ではなく、固定生成元の候補の分類入口である。分類未確定なら次生成・採用を止める。

複数分類に同じ実体が出る場合、元のcanonical位置・同参照の根拠・各保持位置を併記する。graphの循環・既存ownerへの逆参照は、同じpayloadを無限加算しない一方、親の全graphを無料として除外する根拠でもない。どこまでを同trialの追加保持として数えるか、別trial／上位ownerが継続保持する分との境界は後続容量台帳で固定する。

## 5 最小shell生成前の外側保持境界

最小shellを生成してからその失敗記録先を作る循環を避ける。候補は、**既に存在する親ownerの固定OSlotが確認済みであることを、root constructionへ入る前提**とする。OSlotを「常に割当て可能な緊急buffer」とはしない。親自身の生成・容量・失敗処理・寿命のsource保証は未確認であり、本設計で新規の実発行口や実接続を開かない。

| 外側位置 | field候補・状態 | rootとの境界・費目 |
|---|---|---|
| OSlot scalar | `state:T, claim:T, stage:T, first_reason:T, first_op:T, secondary_fault:T, keep_state:T, entry_guard:T, diag_owner_state:T` | 親が先行保持。claimは同construction一度限り、状態は未入場／生成中／失敗保持／引受確認／未確認を区別 |
| OSlot参照 | `parent_ref:R, admission_origin_ref:R, root_candidate_ref:R, pending_ref:R, active_frame_ref:R, canonical_failure_ref:R` | 新rootのRG00に含めず親側管理として別計上。既存だから0byteとはしない。初期準備／入場はOP00／OP02、失敗はOP18、最終責務はOP19 |

OSlotの幅・参照先・親の実capacityはUnknown。外側の親にも生成失敗があり得るので、「さらに外側のshellをその場で作れば必ず記録できる」と再帰しない。OSlotが未成立・別owner・busy・失効・容量未確認ならroot生成へ入らず、既存親の停止／未確認責務へ残す。その拒否の記録・返却まで必ず成功するという保証はない。process全体のOOM／強制終了では診断永続化・全参照捕捉・回収完了を保証せず、未確認のまま扱う。

OSlotのstageはRS01〜07の固定位置、first_opは既存OP00〜19、first_reasonは内部の`none,construction_unconfirmed,capture_unconfirmed,binding_mismatch,cancelled,deadline_unconfirmed,preservation_unconfirmed`の候補とする。throwだけでOOMやallocator原因を断定しない。この内部理由を新しいwire reasonへ自動追加せず、正規値が作れない場合は記録不能／未試行を残す。生成元は親の固定private継続に限り、任意の外部object／診断からOSlotやadmissionを作る登録口を設けない。将来の合成台帳と実runtime台帳も共有・相互昇格しない。

| ID | 故障位置 | 保持・停止・診断の規則 |
|---|---|---|
| SF01 | OSlot成立前／親自身の生成失敗 | child root生成・getter・timer・通知を始めない。親の既存責務のみ。失敗を正常な空結果／完了証拠へ変えない |
| SF02 | OSlot admission後、最小directoryの取得前／途中 | 同OSlotのstage・firstへ固定分類。claimを戻さず、第二shell・logger・動的診断列で救済しない。返却前allocationの有無／capacityはUnknownを許す |
| SF03 | 最小shell返却後、OSlot.root_candidateへ記録する前／途中 | 固定生成frameが候補実参照を保持し、格納未確認なら元frame／OSlotの責務を残す。全参照捕捉を確認できなければkeep_stateを未確認、保持成功としない |
| SF04 | directory保持後、Construction／Failure等のgroup部分生成 | OSlotに同root、pending、元frameを先行保持。生成prefixと格納確認を分離。失敗後に未生成groupを診断目的で追加構築しない |
| SF05 | canonical Failure ready後の構築／binding失敗 | 同private継続が結合済みならRG14へ初回理由を一度記録し、OSlotはcanonical_failure_refへ結合。結合前はOSlotのfirstが正規位置。自由な診断copyからRG14を作らない |
| SF06 | 失敗通知・finally・格納確認自身のthrow／取消 | 最初の理由を維持し、既存secondary_fault／RG07へ有限分類。元root／pending／frameをclear・再利用しない。追加入力採取・再clockなし |
| SF07 | 上位への保持責務移譲・退出／参照退役未確認 | 引受確認前に元OSlot／root／frame責務を解除しない。receiptだけで退出／reclaimを成功化せず、費用・保持履歴をresetしない |

diag_owner_stateは、OSlotのfirstが正規か、同rootのRG14が正規か、結合未確認かを示す。二つのfirstを独立更新しない。既にOSlotに最初の理由がある場合、その失敗constructionを停止し、後からRG14を構築して移し替える経路は設けない。RG14が先にreadyで同一性結合済みの場合だけ、その後の失敗をRG14で扱い、OSlotへ別のfirstを作らない。ここでの保持は内部責務で、保存receipt・外部証拠・実終了の成功ではない。

## 6 固定生成順・参照確認と費目

| ID | 非実行の固定順序案 | 費目・未確認時 |
|---|---|---|
| RS01 | 既存親のOSlot・同owner・entry_guard・一度限りclaimを先に照合 | OP00／OP02の別occurrence。前提不足ならSF01。確認物発行／消費は今回は行わない |
| RS02 | 副作用を持たない最小directory候補を返し、OSlotが同実参照を捕捉して確認 | OP00。root_candidate確認前にgroup／外部resourceを続けて作らない。SF02／03で停止 |
| RS03 | Construction→Failure→Counts→FailureExtensionを順に候補生成し、各回pending捕捉→directoryへ同参照格納→格納確認 | OP00、正規同owner結合はOP02。各pendingのcapture／release確認を分け、失敗後の再生成なし |
| RS04 | Context→Control→Budget→Receipt→Progress→TimeAliases→Registries→ScratchHeads→WorkHolders→RootCustody→Timingの順で残りgroupを同じ方式で保持 | OP00、固定bindingはOP02。これは生成順候補で、source・callback／getterを起動しない。Failureのbinding確認まではOSlotが診断owner |
| RS05 | LC01〜09の12N群位置と既存Timingの固定位置を準備し、RG09から同参照を結合。alias／予算／進行を正規位置へ結ぶ | OP00／OP02。raw provider値・出力backing取得やbody起動を先行構築に混ぜない |
| RS06 | 全direct fieldの生成状態・同owner・参照表・既出位置との重複・残る未確認を固定postで確認 | OP02のbinding、OP12の受付を別occurrenceへ。閉鎖条件・未承認選択がある現在は実行readyへ進めない |
| RS07 | 正常／失敗の終端で同OSlot／rootへの責務を固定合流し、確認済みの階層だけ退役 | 主処理の支出は元OP、別の失敗処理OP18、custody／退役OP19。全体TrialOwner／親終了owner |

最小directoryもscalar／参照field自体の初期化が失敗し得る。RS02を不可分・無失敗のallocator操作と仮定せず、返却前の内部部分生成物を全てOSlotが捕捉できる保証は未確認とする。root_group_prefixは15個の参照先groupの確認済みprefixを表し、RG00自身の成否はOSlotで先に扱う。prefix更新済みでも新規write／借用資格を生成する根拠にはしない。

Construction group自身が未成立の段階は、そのpending_ref／pending_kindを記録先として期待せず、先行OSlotと固定生成frameを使う。候補のkindは固定stage／生成元から対応付け、確認不能ならRF09のUnknownとする。RG06が同参照で保持・結合された後も、元OSlotの責務を確認なしに解除しない。

bindingで必要なRG13への参照をRG13生成前に成功値として置かず、空位置と未確認tagを使う。RG08／09の時刻結合はRS05で行う。非同期配送・timer／callback登録・closed／cancel／joinの機構、各退役の全source対応は今回実装・確証しない。

OP03（arm）、OP04（予定入場）、OP05〜OP11（既存取得／演算）、OP13（encoding）、OP14（segment／通知／receipt）、OP15（追加clock・境界記録）、OP16／OP17（最終guard／試行分類）は既存scheduleのまま。fieldが二か所へalias保持されてもclockは増やさず、同occurrenceの主費目を二重にしない。上位引受はOP19で、receipt照合OP14と混同しない。構築はarm前でも無料ではなく、OSlot側の費用も別scopeへ記載し、後から外側cleanupの余りへ押し込まない。

## 7 最大同時保持へ渡すもの・残るUnknown

R1のdirect field列、L0との同位置対応、RF01〜09の参照先class、OSlotと元frameの保持、RS／SFの各prefixを、phase表のPH01〜11へ対応付けるのが次工程。未生成を0payloadと説明できる場合でも、先行空位置の管理費・生成未確認・元frame／親ownerの保持は残す。

root直接fieldの列挙が閉じても、参照先の全形状／同時位置数・実配列container・ρ・実allocator chargeはUnknown。L0部分和＋R1追加field＋出力13,400／14,309byte＋scratch20,480byteという加算だけで総memory capや合法最大を成立させない。上位保持・rootからの逆参照・部分生成物を含むgraph境界と、同時に成立する保持集合の根拠が必要である。

実source上のfield対応・例外安全な格納・非漏出・非割当て診断・停止連動は未照合。S／F／R／Aを分離し、文書の整合を実capacity・実cleanup・実終了へ昇格しない。slot／field追加が必要なら同版の費用・予約・最大保持を改訂し、選択や期限を実行中に緩めない。

## 8 独立検証の受入条件案（全て未実施）

| ID | 独立対照 | 必須条件 |
|---|---|---|
| RT01 | 全RG行・schema外field・同名fieldの混同 | RG00〜15のdirect fieldだけ。未知keyをcatch-allへ収容せず、field追加は版更新 |
| RT02 | L0のTiming／Failure／Counts・LC群の再列挙 | 既出位置の二重加算なし。RG08／09の別参照位置は省略しない |
| RT03 | m／u／N・LOAD6空L・TERM非適用role | 13 alias、206／222 registry参照位置、既存56／60 role位置を区別。profile選択なし |
| RT04 | 同値copy・別root・異版・deadline再計算 | private同一性拒否、元slotの責務保持。新clock／再bindなし |
| RT05 | OSlotなし／busy／失効・親生成失敗 | rootへ未入場。緊急shellの再帰生成・成功診断の捏造なし |
| RT06 | 最小shellの返却前後・親への格納途中の故障 | stage・pending／元frame・格納未確認を分離。捕捉未確認なら保持成功としない |
| RT07 | 各RS生成prefix・失敗後のFailure追加構築 | 元root／parent／pending保持、失敗後生成なし。diag ownerの二重化なし |
| RT08 | finally／通知throw・遅い復帰・custody未確認 | 初回理由維持、退出未確認／引受未確認を成功化せず元責務を解かない |
| RT09 | rootのdirect fieldだけで総容量成功とする判定 | RF参照先・配列container・ρ・外側slot／局所frameの不足をUnknownに残す |
| RT10 | fee ownerの入替え・clock追加・外側費の未計上 | 各固定occurrenceに主費目一つ。元5秒・既定並列度・既存62／70列挙不変 |

独立oracleは対象のregistry／alias／費目helperを再利用せず、固定field名・参照先分類・生成順・失敗prefixの別表を使う計画。今回はその検査器・fixture・合成テストを実装／実行しない。文書のリンク・表・定数関係だけを静的に確認する。

## 9 未承認事項と今回の範囲

- [ ] R1の全direct field・状態／範囲・L0との同位置対応のレビュー。
- [ ] OSlot成立前／最小shell生成失敗時の保持責務・source保証と限界のレビュー。
- [ ] RF01〜09の参照先形状・共有境界・同時保持・実容量の有限化。
- [ ] RS／SF／OPの生成・格納・失敗・custodyと費目／時間配賦の確認。
- [ ] LOAD6／LOAD7・配置／方式／容量と、実装／合成試験／実確認／保管の個別承認。

全て未承認。本MDと親2文書の参照更新だけを行う。元の5秒期限・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは行わない。

文書整合として対象3文書のローカルリンク17件・表22個の列数、RG00〜15／RF01〜09／SF01〜07／RS01〜07／RT01〜10のID連番、未承認チェック5項目、group内のfield名重複なし、directoryの15参照先と生成順の一致、alias13位置・registry206／222位置の定数関係、末尾改行・差分空白を確認した。文書と定数の静的検算のみで、実装・合成試験・負荷採取・試験再実行・実参照先容量／最大同時保持／診断保存／回収／終了保証の実証ではない。

## 10 後続のgraph境界・canonical値／protocol形状（2026-11-15）

[graph境界とcanonical値／protocol参照先の形状契約draft-0.1](BEST_PRACTICE_WFB_SGA_GRAPH_BOUNDARY_CANONICAL_PROTOCOL_SHAPE_DESIGN.md)で、共有・寿命延長・追加保持と、RF04／05の値snapshot／private bindingを分けた。parent graphを境界外で0にせず、封印値の可変root参照・二重claim・上位引受未確認を具体化する。選択未承認・元5秒／既定並列度・各閉鎖条件・Unknown・調査保留を維持し、実装・採取・再実行は行わない。
