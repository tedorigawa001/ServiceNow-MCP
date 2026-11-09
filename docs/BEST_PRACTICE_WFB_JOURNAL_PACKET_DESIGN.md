# WF-B (C)：AbsenceJournal記録点・内部型とadmission消費／packet生成

既存issuer供給の差分（2026-11-09、MDのみ）: [private供給・先行保持境界draft-0.1](BEST_PRACTICE_WFB_JOURNAL_ISSUER_SUPPLY_DESIGN.md)で、同startからの正規Journal供給、既存scope／epochの再利用、先行slot生成順、停止／封印／発行の二段階結合、借用と固定discardを具体化した。独立JournalAssemblyの診断から昇格せず、admission消費・packet生成・正式発行は閉鎖のままとする。

Version: draft-0.3 / Date: 2026-11-09 / 読み取り照合基準HEAD: `bbc1426`（レビュー修正基準HEAD: `c839766`、Journal実装レビュー修正基準HEAD: `908fc16`）。

draft-0.2のレビュー修正：§6の受付順は「retirement sealと生成frame終了」を必須段階としていたが、root_not_created由来のlocal_onlyにはseal対象のrootがなく、現行issuerもsealを呼ばない（sealAttempts=0）。§5の「正常利用をsealする前に記録を完了」もlocal_onlyの記録完了点が未定だった。local_onlyではseal段階を正規生成履歴のknown-not-created checkpoint確認と生成frame終了で置き換えると§5・§6に明記した。

draft-0.3のレビュー修正：(1) control live退役（`retireLiveBinding()`）がC14を空にする実書込みなのにJournalを通らず、退役後もC14が`present`のままsealできた。(2) `legacy_clear`対照はroot retirement seal後に旧clearを実行しJournalがfactとして受理しており、§5の「seal後は旧clearを拒否」と逆順だった。旧`CanonicalSupplyAssembly.clear()`自体もretirement sealで止まらず、Journal seal後の書込み拒否も未検証だった。§11へ`released`段階、旧clearのseal gate、対照の順序を明記した。

実装追記（2026-11-09）: §10の第1段階だけを合成依存限定で接続した。固定11+14のJournal内部型・writer記録点・候補commit・先行診断・合成owner／epoch結合を実装。admission consumer・packet生成・既存admission epochへの接続は未実装。[今回の検証記録](E2E_BEST_PRACTICE_WFB_ABSENCE_JOURNAL_2026-11-09.md)。

Status: **Journal第1段階は合成実装、admission consumer・packet生成は未実装。** 親は[停止確認・capture受付設計](BEST_PRACTICE_WFB_CAPTURE_ADMISSION_DESIGN.md)と[field別固定回収schedule](BEST_PRACTICE_WFB_FIXED_RETIREMENT_SCHEDULE_DESIGN.md)。先行実装は[内部issuer検証記録](E2E_BEST_PRACTICE_WFB_CAPTURE_ADMISSION_2026-11-09.md)。本書は生成履歴の真正な記録と空packet生成までを具体化し、25cellの値読取・同参照確認・CaptureReadyは次の工程とする。

正式発行口閉鎖・C実行入口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。初版は文書のみ、今回の実装は§11に限定し、capture値読取・新field clear・payload退役証拠・root終端・実接続・実通信・実機操作・設定変更・Pushを行わない。以下の型・slot・継続・状態・理由は設計案または合成内部契約であり、正式なpermitや実resource操作の権限ではない。

## 1 現行との境界

現行CaptureAdmissionAssemblyは同ownerのRootStopAck／TrustedControlPin／CaptureAdmissionを内部発行し、非実行PreparedClearAuthorityDraftを保持する。admissionを消費する口はなく、packet originは空tokenだけで、packet／25cellは存在しない。ControlMintJournalの局所記録を、building／extra／wrapper等のabsence証拠へ流用しない。

次段階では、同issuerに先行のpacket保持slot・固定layout・失敗診断を置き、正規admissionを一度消費してpacketと25個の空cellを生成する。成功はallocated_onlyであってcapture成功ではない。全cellはunobserved、fieldWrites=0、emptyConfirmed=false、群はunverifiedのまま。元slotから参照を移動・除去せず、clear draftのready=falseも維持する。

## 2 同owner／epochと内部型

生成時点のepochと、後から停止確認して使うcapture epochは別にする。sourceは自身の生成origin／producer epochをsource側の失敗し得る処理より前に確保し、bindingもconstruction／retentionに結合したproducer epochを先行保持する。過去の記録へ後からcapture epochを貼り直さない。

停止後にprivateなGenerationEpochBindingを一度固定し、同RetirementOwner／construction／retention／SourceRootSlot・実source origin・source producer epoch・binding producer epoch・既存CaptureAdmission epochを結合する。source未生成はlocal_only variantとしsource origin／source producer epochを禁止する。source未知は結合を確認できず、既存issuerと同様に先へ進めない。source生成時の記録はこの正規結合が確認されるまで特定の上位ownerに対する使用権限を持たない。

| 内部型案 | 必須内容・所有者 | 許すこと／禁止事項 |
|---|---|---|
| ProducerJournalScope | source／bindingのprivate issuer、各1 | producer origin・generation epoch・schema版。source instance・本文を記録に格納しない |
| FieldHistoryCell | C01〜C25対応、固定25枠 | writer段階・write stamp・absence candidate／確定fact。任意履歴listを作らない |
| AbsenceFact | private writer発行、対象slot単位 | kind、producer scope、field ID、record origin、write stamp、commit checkpoint。公開診断から生成しない |
| GenerationEpochBinding | 同capture owner、1 | generation scopeとcapture epochの正規な結合。foreign source／別世代を再採用しない |
| SealedJournalView | 同owner、最大1 | 停止時点の固定metadataへのprivate借用。scope結合の確認とfactの完全性は別。payload／元参照を返さない |
| AdmissionUseSlot | 同issuerに先行確保、1 | unused／consumed、正規admission origin・epoch・packet origin・consumer originを保持。spentへ一度だけ移る |
| PacketOwnerSlot | 同RetentionRoot配下に先行確保、1 | not_started／attempting／provisional／allocated／unconfirmedと実packet参照。候補packetから保持先を選ばない |
| CapturePacket／CellSlot | 同packetの固定25枠 | 同layout／C→F対応／owner／epoch／packet origin、生成段階・cell参照。値は未観測のまま |
| PacketAllocationReceipt | 同private generation slot、最大1 | allocated_onlyのtoken-only結果。CaptureReadyではなく、clearや通常利用を許可しない |

AbsenceFactは4variantに限定する。preparation_completed、alias_never_assigned、legacy_discard_executed、not_minted。variantごとに必要なcheckpoint／producer種を固定し、余剰key・無関係field・別版を拒否する。not_mintedは既存control用記録だけでは全local slotを説明できないため、後続実装では対象producerをcontrol／scope_context／anchor／payload_wrapper／transfer_claim／binding_receipt／source_supplyに区別したProducerSlotJournalへ拡張する設計とする。既存ControlMintJournalを暗黙に他producerの根拠へ昇格させない。

factは「そのfieldがそのwrite stampでabsenceになった／未発行が確定した」根拠で、本文不存在・全alias退役の証明ではない。同じfactのfield集合を広げたり、異なるfieldの同じundefinedを代用したりしない。RootStopAckのroot_not_createdはsource不存在の別根拠であり、AbsenceJournalへ架空のsource履歴を作らない。

## 3 writer側の固定記録点

全ての実書込み経路で、書込み前に対象fieldの古いfactを無効化しwritingへ進める。実slotへの書込み後にwriterの完了を記録する。書込みと履歴確定の間の失敗はunconfirmedで、元factを復活させない。履歴は当該private writer内だけで更新し、consumerがundefinedを見て過去の操作を後付けしない。

Journal更新の故障は先行metadata診断へstickyに記録し、元のsource処理のfirst／返答を上書きしない。Journalを埋め直すために旧fail→clearを再帰的に呼んだり、元writerを再実行したりしない。元の成功／失敗処理は既存契約を維持し、新consumer側をJournal未確認として停止させる。実OOMで診断自体を保持できる保証はUnknownである。

| 記録点 | 対象 | candidateから確定factへの条件 |
|---|---|---|
| registryを凍結し`#buildingRegistry = undefined`とする位置 | C04／F04 | 当該release後はprovisional。最終post検査成功・source prepared確定後にpreparation_completedへcommit |
| bindings生成・probe後に`#buildingBindings = undefined`とする位置 | C05／F05 | 同上。probeがthrowした場合やpost失敗を準備成功にしない |
| declarationsを凍結し`#buildingDeclarations = undefined`とする位置 | C06／F06 | 同上。後続view生成・strict検査まで成功したことが必要 |
| `prepareSupply`の最終validate成功・prepared確定点 | C04〜C06 | 3つのrelease候補・同producer epoch／stampを確認し、各fieldの成功factを固定。途中faultでは確定しない |
| bindingのextra alias代入機会が終了する位置 | C17／F18、C20／F21 | 実代入のwriterを一度も開始せず、以後の代入経路がsealで閉じた場合だけalias_never_assignedを確定 |
| 元CanonicalSupplyAssembly.clearの実代入と完了位置 | C01〜C11 | 11fieldの代入完了・各private slot空・同source generationを確認してlegacy_discard_executedを確定 |
| 各producerの生成開始／返却／発行slot格納 | 該当するlocal slot、source supply slot | 未開始のままproducerが閉じた、または明示的な非発行returnが確定した場合だけnot_minted。呼出し後の未捕捉throwはunknown |

building 3slotが空になるのは最終成功前である。release候補だけをpreparation_completedとして発行しない。成功前の故障で元sourceの旧clearが実行された場合は、旧clear側で実際に確認したfactだけを使用する。

extra aliasはscenario名や初期undefinedを根拠にしない。通常・故障scriptの全代入箇所でwriter段階を更新し、branchを通過した／producerが永久に閉じたという実際の経路でnever-assignedを確定する。代入が一度でも開始したのに未捕捉ならunknownであり、「現在空だからnever-assigned」には戻さない。

旧clearのdiscardPassesやretirementOrderは代入前に記録され得るのでfactにしない。issued aliasだけが残った場合も含め、C01〜C11の実fieldを全て確認する。旧clearが全て空のfieldへ実行され、旧計数が増えなくても、実代入と完了確認があればfield限定のfactを記録できる。反復noop clearは有効な同stampのfactを再発行せず、固定枠を保持する。新retirement経路から旧clearを呼んでJournalを埋めることは禁止する。

not_mintedはproducer全体が未実行かどうかだけでなく、対応するslotのwriter段階を確認する。例えばcurrent wrapperは捕捉済みでもissued wrapperへの代入前に失敗し得るため、2slotを一つのbitで処理しない。scope_contextのprivate helperが意図的にundefinedを返した場合の非発行returnと、throwで返却を確認できない場合も分離する。

## 4 cell別のabsence根拠と未導出の扱い

| Cell群 | 正常の状態 | 許すabsence根拠 |
|---|---|---|
| C01〜C03、C07〜C11 | present | 対象field付きlegacy_discard_executed、対象slotのsource_supply not_minted、またはroot_not_created。推測で補完しない |
| C04〜C06 | absent | preparation_completed。失敗prefixでは対象field付きlegacy_discard_executed／source_supply not_mintedも可 |
| C12〜C13 | present | payload_wrapperのslot別not_minted |
| C14、C18〜C19 | live tuple／control present | controlのslot別not_minted。既発行controlのlive退役はnot_mintedで説明しない |
| C15〜C16 | claim present | transfer_claimのslot別not_minted。claim unusedはabsence根拠ではない |
| C17、C20 | absent | alias_never_assigned。単にextra aliasが空という診断は不可 |
| C21〜C22 | anchor present | anchorのslot別not_minted |
| C23〜C24 | receipt present | binding_receiptのslot別not_minted |
| C25 | context present | scope_contextの未開始／確認済み非発行returnに結合したnot_minted |

root_not_createdのlocal_onlyではsource producerを作らずC01〜C11を専用variantで扱う。root_capturedだがconstructor／controlが未捕捉のときは、RootStopAck／admissionの既存拒否条件を維持する。その他の記録不足もabsentへ補完せず、後続captureで当該cellをunconfirmedとする。

SealedJournalViewのscope結合が確認できることと、全fieldに必要なabsence factが揃うことは別である。packetの空cell生成にはscope結合とJournal故障なしを要求し、writer未確認・producer型未対応・必須metadata欠落なら消費前に止める。一方、presentとして記録されたfieldにabsence factを要求する必要はなく、packet生成だけで全25cellのabsence成功を宣言しない。実fieldとfactの一致は後続の値captureで改めて確認する。C04〜C06／C17／C20以外も全prefixが自動的に確認済みになったとは扱わない。

## 5 generation epochからcapture epochへの封印

同ownerの停止確認後に、正規private source／binding readerからJournal scopeと既存recordを借りる。GenerationEpochBindingは正規source origin・両producer epochと既存admission scope／epochを一度結合し、任意sourceや公開snapshotを受け付けない。正常利用をsealする前に記録を完了し、seal後はproducerのpresent代入・旧clear・新しいmintを拒否する。local_only（root_not_created）にはsealするrootがないため、記録完了点はsource生成を行わずに生成frameが終了し、known-not-created checkpointを固定した時点とする。以後のsource生成・present代入・旧clear・新しいmintは同checkpointに反するため拒否する。

記録には固定write stampを付け、candidate作成時・commit時・seal時の同fieldを照合する。stampは有限のwriter段階／ordinalで、数値を使う場合はchecked演算・overflow時unconfirmed、wrapや飽和を同一世代と認定しない。反復要求に応じた新token／履歴list追加はしない。捕捉したJournalをcapture epochに書き換えず、正規bindingを介して照合する。

通常closeがcloseRequested／readStopを記録しても、retirement sealとcapture epochを自動失効させない。post条件はseal・epoch・元slot／mint／Journal状態の安定性であり、close理由そのものの変化ではない。closeから旧source.clearを呼ぶ変異やJournalを更新してabsenceを作る変異は拒否する。

## 6 admission一度限り消費の内部契約

consumerは既存issuerのprivate生成継続として同assembly内へ置き、正規issuedAdmissionを値で外へ渡さない。候補、Ack、pin、非実行clear draft、Journal bindingを同ownerの先行slotから借りるだけで、public inspectやfactoryの返答から再構築しない。

受付順は、固定終端→既存first保持→同owner／scope→issuer issued状態→正規current／issued admission同参照→variant／epoch／origin／packet origin→Ack／pin／draftの結合→retirement sealと生成frame終了（local_onlyではsealの代わりに正規生成履歴のknown-not-created checkpointと生成frame終了を確認する）→Journal scope結合・必須metadata・故障なし→未消費／packet未開始。local_onlyではroot／source readerを呼ばず、対応するknown-not-created checkpointを確認する。source unknown・失効epoch・wrong variant・同値copy・別ownerは消費前に拒否する。

全条件成立後の`AdmissionUseSlot.unused→consumed`と`PacketOwnerSlot.not_started→attempting`の同期確定を消費点とする。途中にawait・任意hook・clock・外部通知を置かない。これは既存の回収開始claimとは別の内部利用状態で、回収開始回数を増やしたりCaptureAdmissionを再発行したりしない。

消費後はpacket生成が失敗してもunusedへ戻さない。再入はpacket_build_in_progress、生成済み／失敗後の反復は固定結果のみ。入力・結合拒否はadmissionUse=unused、packetBuild=rejectedの固定結果で、正規元slotを保持する。将来のfield clear consumer・CaptureReady consumerは今回のadmission consumerと区別し、まだ作らない。

## 7 先行保持slotとpacket／25cell生成

既存のpacketOriginと静的C→F layoutは生成前のdescriptorで、実packet／cell objectではない。今後のconsumerより前、source生成前にPacketOwnerSlot、固定25個のcell保持slot、結果／失敗shellを確保する。実packet shellと各cell objectはadmission消費後に一度だけ生成し、返却参照を次の故障点より前に先行slotへ捕捉する。この二層を「25cellが既に生成済み」と混同しない。

既存issuerはprepare時にsourceを生成するため、先行slotはそのprepareより前のprivate構築区間へ置く。consumerを後から作る際に先行slotも初めて確保してはならない。先行slot生成失敗は既存ownerの固定失敗診断へ捕捉し、admission消費0・元source生成を起動しない状態で止める。先行ownerより前の実確保失敗はUnknownである。

固定順序は、packet shell生成→owner slotへprovisional捕捉→同owner／admission／epoch／packet originの確認→C01〜C25を順に生成・捕捉・確認→全固定配置のpost検査→PacketAllocationReceiptを固定する。各cellは同layout origin・C ID・F ID・親packet origin・scope／epochに結合する。copy・別packet・重複cell origin・親違い・順序差を拒否し、sort／dedupで補正しない。

cellの値保持部はunobserved tagと未格納状態だけで、presence／referenceConfirmed／emptyConfirmedを立てない。C01〜C25の配置確認は値読取や同参照確認ではない。packetがallocatedになっても元source・wrapper・claim・anchor・receiptを一度も読取／copy／clearせず、captureStarted=false、CaptureReady未発行、clear draft ready=falseを維持する。

packet slotと25個のcell捕捉slotは自ownerの最後の保持先である。packetへ組み込む前のcellも先行slotで保持し、部分生成の参照が一時ローカルだけに残らないようにする。生成本体をprivate frameへ閉じ、終了後の固定finalizerで配置を確認する。frame未確認ならallocated結果を公開せず、生成claim consumedと部分参照を保持する。参照を持たないPacketAllocationReceiptだけを診断にprojectionし、実packetはprivate ownerから持ち出さない。

## 8 失敗prefixと所有責務

| 位置 | 保持者・利用状態 | 禁止する補完／再試行 |
|---|---|---|
| Journal writer開始前／書込み後・記録確認前 | 正規producerが元slotと固定履歴cellを保持 | 記録不明をabsenceにしない。旧factを復活させない |
| generation／capture epoch結合不一致 | 元source／bindingと既存issuerが全参照を保持、admission unused | consumerが新scopeを採用したり再pinしたりしない |
| admission消費前の確認／先行shell失敗 | 元slot・捕捉済みshellは同owner、admission unused | 拒否を固定し、packet生成や第2準備へ進まない |
| 消費直後、packet生成呼出し前 | admission consumed、PacketOwnerSlot attempting、元slotは全て保持 | 未消費へ戻さない。生成試行と生成成功を区別する |
| packet生成が戻らない | owner slotはallocation_unconfirmed、元slotは保持 | packet未生成と断定しない。別packetを生成しない |
| packet参照格納後・確認前 | 同ownerがprovisional packetを保持、consumed | 参照を放さず、allocated扱いにしない |
| C_i生成前／呼出し後未捕捉 | packetと確認済みcell prefix、対象の未知責務を保持 | 残りcellを作って成功へ補完しない |
| C_i捕捉後・同scope確認前 | provisional cellと親packetを固定slotに保持 | wrong cellを別の正規cellで上書きしない |
| 全cell確認後、post／結果生成失敗 | 全packet／cellを同ownerが保持、consumed | 第2結果発行・CaptureReady・field clearへ進まない |
| generation frame未確認 | 既知部分参照と未知の借用責務を保持 | 空／allocated／回収済みへ補完しない |

全失敗prefixで元25対象fieldは無変更。存在しないpacket／custodyへ移譲済みと報告せず、packet内への値参照移譲もまだ行わない。異常終了したobjectを再利用可能なnormal slotへ戻さず、固定失敗結果を維持する。後日の再回収・外側隔離・実OOM時の全参照捕捉は別契約でありUnknown。

## 9 診断・費目・独立受入条件

固定診断は元first／stop、journalReason、admissionUse、packetBuild、最初のphase／C ID／boundary、packet捕捉の有無、cell生成／確認の25固定slot、既知／未確認責務を分離する。元の取得失敗をJournalやpacket理由で上書きしない。writer／epoch／object originの実値、source／packet参照、本文・digest・path全文・raw例外を出さない。

Journalは25固定field枠、source／bindingのproducer scope各1、epoch binding1、packet1、cell25、admission use1、結果／失敗slot各1が構造上限。recordのattempt・commitは有限writer段階、packet／各cell生成試行と結果発行は各最大1。Journal metadataのscope読取と、将来のcapture値readerを別費目にし、元source準備・旧clear、新ownerの利用確認／生成・結果固定を混算しない。新回収による旧discard増分は0。全CPU／heap／layout・unit係数・実E／S・診断必着はUnknownのまま、既存cap・期限・D_stop／D_end・guard上界を変更しない。

| ID | 合成／compiled受入条件（未実施） |
|---|---|
| JP01 | building 3slotのrelease候補→post成功commitを確認。途中view／validate失敗でpreparation_completedを立てる変異を検出 |
| JP02 | extra alias未代入・実代入・代入未確認を分離。scenario名・undefined・計数0だけでfactを作る変異を拒否 |
| JP03 | 旧clearの全11fieldとissued-only保持を個別に検査。代入前の計数／履歴、対象field集合の欠落、noop clearの過剰発行を検出 |
| JP04 | producer slot別not_minted／明示非発行／未捕捉throwを区別。currentとissuedの自己照合、unknownの空補完を拒否 |
| JP05 | owner／generation epoch／capture epoch／field／stamp／record origin／variantを各1項目混入し、scope結合前とfact確認段階を別に拒否 |
| JP06 | admissionのcopy・別issuer・既消費・epoch差・local_only昇格・Ack／pin／draft不一致を消費前に拒否。固定返答・元slot保持を確認 |
| JP07 | consume前後・packet生成前後・25cell各生成／捕捉／確認前後へfault・close・再入を注入し、利用0／1と独立prefix表を照合 |
| JP08 | C→F対応・cell originの区別・同親参照を生成helperと独立した表で確認。生成側と検査側の同じ誤りを通す変異を検出 |
| JP09 | 部分参照を落とす／未確認を未生成にする／消費を戻す／第2packet生成／frame未確認成功化を個別変異で検出 |
| JP10 | allocated_onlyでも値reader0・fieldWrites0・CaptureReady0・payload証拠0・root終端0。秘密非出力、旧issuer・compiled・梱包除外を維持 |

独立oracleは本体のJournal builder・layout・phase counterを期待値にimportせず、実writer位置とC01〜C25の固定対応を別記述する。root／producer初期化前の実確保失敗や全heapを網羅する保証ではない。未到達・型未対応・非等価変異未確認は明記し、過去の1,709件成功を新consumerの代替証拠にしない。

## 10 次の実装分割・今回の文書確認

1. **Journalの内部型・writer記録点**：source／binding生成scopeとfield履歴を合成依存で接続。成功・失敗時の候補／commitとepoch結合を検証し、admission消費はまだ閉じる。
2. **同admission消費・空packet／cell生成**：既存issuerのprivate継続へ一度限りconsumerを追加。部分生成・再入・未確認保持を検証し、値読取・CaptureReady・clearは閉じる。
3. **別工程の値capture**：25cellの読取→格納→再読→Journal／epoch post確認へ進む。全25cell確認後だけCaptureReadyを検討する。field clear・証拠・root終端はさらに別工程。

`bbc1426`のsource準備・旧clear、bindingのcontext／anchor／wrapper／claim／control／receiptとextra aliasの代入位置、内部issuerの部分生成保持を読み取り照合した。今回は新設計書と親文書だけを更新し、ビルド・合成試験・梱包・実費検証を行わない。3文書のローカルリンク16件、C01〜C25の重複・欠落なし、absenceの4 variant、JP01〜JP10の存在と差分空白検査を確認した。これは文書整合の確認であり、未実装のJournal／consumer／packetの試験成功を意味しない。未コミット、Pushなし。

## 11 Journal第1段階の合成実装境界（2026-11-09）

- 配置は開発専用の`tests/review/fixtures/snapshot-read-composition-fake.ts`。AbsenceJournal／FactBase／4variant／FieldHistoryCell／GenerationEpochBindingは非export。公開する新factoryは`createAbsenceJournalFake`だけで、`prepare／seal／inspect`の固定操作・値だけの診断を返す。既存互換factoryのexport・関数同一性は維持し、共通moduleのexport集合にはこの新factoryを明示追加する。
- source11枠とbinding14枠で合計25枠。field別stampは0〜64、上限でwrap／飽和同一視せずunconfirmed。scopeとgeneration epochはproducer生成処理前に確保し、合成先行ownerのcapture epochへprivateに一度だけ結合する。local-onlyはsource scopeを持たず、source attempt未捕捉は結合拒否。既存CaptureAdmissionの発行slotやepochは変更・消費しない。その継続への供給は後工程である。
- 実slot代入前にbegin、代入後にcomplete。C04〜C06はrelease候補にとどめ、最終validate成功・prepared確定後に3枠一括preflightしてcommit。Journalの故障はstickyな別診断にし、元writerや元firstを変更せず、consumer候補側を拒否する。旧clearは実代入後に11個の空booleanを確認し、issued-onlyを含む欠落を拒否。反復noopは同fact／stampを保持する。
- extra aliasは正規writer開始を記録し、永久に生成入口を閉じたsealでだけ未開始をalias_never_assignedへ確定。各slotのnot_mintedは未開始、または正規helperの確認済み非発行returnから作る。present siblingやcontrolの既存局所記録を流用しない。未捕捉writerはunconfirmedで、先行slotを消去しない。
- 既存の値混入probeは対象のpresent群を保守的にbegin／completeで囲み、通常のabsence候補へ使わない。故障scriptはJournal生成権限ではない。通常の合成sealは旧clearを呼ばず、`legacy_clear`対照だけが既存writerを明示実行する。新field clear回数は0である。
- control live退役はC14への実書込みとしてbegin後に`released`段階へ記録する。absenceの4variantのどれにも当たらないためfactは作らず、後続captureでは当該cellをunconfirmedとして扱う。`released`は書込み履歴が記録済みであることを示し、Journal seal／scope結合を妨げない。
- root retirement seal後の旧`clear()`は実行しない（元sourceの参照を保持）。拒否した旧writerはJournalの通常受付を通して記録し、Journal seal済みなら`journal_sealed`、未sealなら`journal_unconfirmed`とする。`legacy_clear`対照はretirement sealより前に旧writerを実行し、seal後の旧clearは`legacy_clear_after_seal`対照で拒否を確認する。旧factoryはsealしないので挙動は変わらない。
- JP01〜JP05のJournal段階と、元slot不変・秘密非出力・旧入口維持を部分検証した。JP06〜JP09のadmission消費／packet生成、JP10の新packet経路は未到達。PacketOwnerSlot／SealedJournalView／PacketAllocationReceiptの発行・値capture・CaptureReady・新field clear・root終端は未実装。費用の実モデル・heap/layout・実E/SはUnknownで、既存期限／capは変更しない。

初版§10末尾の「未コミット」は初版作成時点の記録（後に`c839766`で文書をコミット）。今回の実装は別の未コミット変更として扱う。draft-0.2のlocal_onlyレビュー修正を維持し、root未生成時はroot sealを呼ばず正規not-created checkpointで確認する。検証の範囲・初回失敗・未実施事項は上記検証記録へ保持する。
