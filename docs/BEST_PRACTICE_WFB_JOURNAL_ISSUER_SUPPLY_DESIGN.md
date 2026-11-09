# WF-B (C)：既存issuerへのJournal private供給・先行保持境界

Version: draft-0.1 / Date: 2026-11-09 / 読み取り照合HEAD: `d18f4dc`。

実装追記（2026-11-09）: §9の第1段階の内部型・生成順だけを独立合成assemblyで実装した。既存issuerへのprivate供給・admission消費・packet生成は未接続。[shell検証記録](E2E_BEST_PRACTICE_WFB_JOURNAL_SUPPLY_SHELL_2026-11-09.md)。

Status: **先行shell／空保持slot・非実行descriptor／未消費claimは合成実装。既存issuerへのprivate供給・admission消費・packet生成は未実装。** 親は[Journal／packet設計](BEST_PRACTICE_WFB_JOURNAL_PACKET_DESIGN.md)と[停止確認・capture受付設計](BEST_PRACTICE_WFB_CAPTURE_ADMISSION_DESIGN.md)。先行の[Journal検証記録](E2E_BEST_PRACTICE_WFB_ABSENCE_JOURNAL_2026-11-09.md)は独立合成ownerの保証であり、本書の接続試験を代替しない。

正式発行口・C実行入口閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。初版はMDのみ。今回の合成実装は§10に限定し、既存issuer接続・admission消費・packet生成・値capture・field clear・証拠発行・root終端・実接続・実通信・設定変更・Pushを行わない。以下の型・理由・継続名は設計案または非実行の合成契約である。

## 1 現行差分と接続対象

現行は二つの別constructionである。

| 現行 | 所有と未接続点 | 本差分での方針 |
|---|---|---|
| CaptureAdmissionAssembly | 自身の`#start`・正規`#scope`・`#epoch`・Ack／pin／issuedAdmission／clear draftを保持。Journal供給はない | このconstructionだけを供給先にする。新しいowner／capture epochを採番しない |
| RetirementStartAssembly | `#binding`・正規pin／回収開始claim・生成frameを所有 | 同instanceのprivate継続からbinding／sourceのmetadataだけを供給する |
| JournalAssembly | 別PendingSourceBinding・別owner／capture epochでJournalを検証 | 診断・回帰対照として維持するが、結果や`generationBound`を既存issuerの権限に昇格させない |
| AbsenceJournal | source11枠＋binding14枠。sealed／first／各field履歴を保持 | 同producerの正規参照を借りる。再収集・copy・別factoryへの取替えをしない |

private経路は「CaptureAdmissionAssembly → 自身のRetirementStartAssembly → 自身のPendingSourceBinding → source slotの実source／両Journal」と固定する。公開factory／inspect／JSON／診断値を入口にせず、任意Journal・source・epochの登録口は作らない。source未生成ならsource readerを呼ばない。attempting／unknownをlocal-onlyへ落とさない。

`captureStartAccess.scope()`は呼出しごとに新しいwrapperを返す現行実装である。issuerが構築時に保持する`#scope`を正規供給先参照とし、以後の新wrapperと参照等価になることを要求しない。start側の正規owner・pin・claim fieldをprivateに再検査することと、issuer内の`#scope`／issued artifactの同参照検査を分ける。scope copyを採用する理由には使わない。

## 2 先行生成順と保持者

sourceを生成するのは`#start.prepare()`内であり、constructorの`new RetirementStartAssembly`だけではsourceを生成しない。ただしstart／binding構築も失敗し得るため、成功返却後にしか作れない診断ownerを「先行」と扱わない。

| 順序 | 生成／固定内容 | 失敗時 |
|---|---|---|
| B00 | 最小のSupplyFailureShellと固定結果slot。owner未結合でもconstruction段階を記録可能 | この確保以前の実OOM・診断必着はUnknown |
| B01 | JournalSupplySlot、未結合の空PacketOwnerSlot、静的C→F layout、固定25個の空cell保持slot、将来のAdmissionUseSlot | source生成0。捕捉済みshell／slotと未確認確保責務を保持し固定拒否 |
| B02 | 既存startを一度構築し返却を捕捉。既存の正規scope・issuer epoch／packet originを固定 | start未捕捉ならunknown。別startで補完しない |
| B03 | B01のslotを同construction・正規scope／epochへ一度結合 | 不一致・二重結合は拒否。prepareへ進まない |
| B04 | 既存prepare／生成frameを実行。producer Journalは既存writerで更新 | 元producer firstとJournal firstを別保持 |
| B05 | 回収開始要求・frame終了確認・source variant確認・停止境界の固定 | 回収開始claimは既存経路だけで最大1回。供給用に追加消費しない |
| B06 | producer入口閉鎖→Journal封印→既存Ack／pin／admission発行完了後のprivate結合・view受理 | 下記§4の順序で固定。admission消費0、packet生成0 |

B00〜B03はfield initializerの暗黙順序に依存せず、保護されたprivate construction区間で実装する方針。既存constructorの副作用を実装時に再点検する。未結合slotは使用不可で、仮ownerや仮epochを後から正規扱いしない。全empty slot確保が完了するまでprepareを開かない。

空cell保持slotと実cell objectは別物である。本段階ではpacket参照・cell参照を全て未格納のままにする。B01で25個の実cellやCapturePacketを生成してはならない。既存の`packetOrigin`もdescriptorであって実packetではない。

## 3 private内部型と一度限りの結合

| 型案／slot | 必須内容・variant | 使用境界 |
|---|---|---|
| JournalSupplySlot | unbound／bound／preparing／prepared／rejected／unconfirmed／retired、正規current／issued参照 | 一度の供給開始と固定結果。admissionの利用claimとは別 |
| JournalSupplyAnchor | 同issuer construction、正規scope、既存capture epoch、packet origin、正規issued admission origin | issuer内だけで固定。任意anchorのadopt口なし |
| GenerationEpochBinding | 正規scope／capture epoch、binding producer scope／epoch、下記source variant | 既存の値比較ロジックを最小共有できるが、JournalAssemblyのinstanceや返答を移植しない |
| source_backed binding | 正規source slot・実source origin・source producer scope／epoch、RootStopAckと同root origin | source参照をmetadata artifact内へcopyしない。実source借用はstart側の既存ownerに残す |
| local_only binding | 正規source slotのknown-not-created checkpoint、binding scope／epoch | source origin／source Journal／source producer epochのfieldを禁止 |
| SealedJournalView | 同anchor／binding、固定field履歴へのprivate借用、current／issued view origin | 履歴の新しいwriter・故障を再確認できる形にする。公開inspect snapshotを保存しない |
| SupplyFailureShell | producer first、Journal first、supply first、最初のphase、借用／frame／未確認責務 | raw例外・本文・token実値・source参照を診断に出さない |

余剰field・variant違い・別版・同値copyは拒否する。factの生成元は既存private writerに限り、供給側はfactを追加・修復しない。metadataの封印が有効でも、全cellのabsenceが確認済みとは限らない。`released`は記録済みwriterとしてscope検査を通し得るが、absence factを持たず、将来の値captureではunconfirmedを維持する。4種のfactへ勝手に変換しない。

供給claimの消費点はpreflight成立後の`bound→preparing`の同期置換。途中にawait・通知・任意hookを挟まない。preflight拒否も同slotへ固定し、繰返しを新しい供給試行にしない。開始後の故障でもboundへ戻さず、reentryはsupply_in_progress、終端後は同じ固定結果を返す。生成frame中は供給を開始せずdeferred扱いとし、確認済みframe退出後だけ既存の固定drainから進める。未確認frameは終端拒否する。

ここでのpreflightは同startのrunning／frame終了・正規scope／epoch・先行slot結合を対象とし、まだ発行していないadmissionを要求しない。開始は既存admitの固定private継続だけに限定する。B03で固定するのは供給先descriptorであり、発行済みadmission originを含む最終JournalSupplyAnchorは§4の第5段階で初めて確定する。生成途中のdescriptorをprepared anchorとして使用しない。この二段階で「Journal封印にadmissionが必要、admission発行にJournal封印が必要」という循環を解消する。

このclaimは回収開始claim・将来のAdmissionUseSlotと別台帳である。供給preparedでもadmission利用はunused、packetBuildはnot_startedのまま。外へ出せるのは参照を含まない診断だけで、preparedを実行権限にしない。

## 4 停止・封印・発行の順序

循環を避けるため、producerを閉じてJournalを封印する段階と、発行済みadmissionに結合する段階を分ける。

1. 同startの回収開始がrunning、正規pin／claim、生成frame inactive・終了確認済みであることを検査する。startの既存requested gateとprivate producer閉鎖を確認し、bindingの新生成・present代入・mintを以後許可しない。Journal sealだけをwriter停止の代わりにしない。
2. source_backedは同実sourceのroot retirement sealを既存経路で一度固定する。seal前に既存writerが行ったrelease／commit／旧clear履歴だけを使用し、ここで旧clearを呼ばない。bindingのnever-assigned等の終端factは正常入口が閉じた後に確定する。
3. local_onlyは正規known-not-created checkpointとframe終了で代替し、source／root readerもroot sealも呼ばない。source capture unknown・control mint未確認をlocal_onlyへ変換しない。local-only固定後のprepare／source生成要求は同gateで拒否する。
4. 両variantでbinding Journal、source_backedだけsource Journalを封印する。firstなし、同producer scope／epoch、writer未確認・candidate残存なしを確認する。片方だけ封印後の失敗では部分封印を保持し、unsealや第2producerで補完しない。
5. 既存issuerが正規Ack／pin／admission／非実行clear draftを発行・確認しissuedになった後、正規scope／epoch／packet origin・同current／issued artifactをanchorへ結合する。1〜4を行う位置は既存seal段階のprivate継続とし、回収要求やroot sealの第2経路を作らない。
6. view生成→同先行slotへprovisional捕捉→post検査→preparedへ固定する。postではframe・gate・variant・epoch／Journal readinessと先行診断を再検査する。成功を固定する前に、Journalへの拒否writerによる新しい故障も検出する。

現行issuerのadmitと供給の結果は別に保持する。例えば内部admissionがissuedになった後に供給が失敗しても、issuer状態を未発行へ巻き戻さず、supplyを拒否し将来のconsumerを閉じる。issuer側の既存失敗では供給をpreparedにしない。producerの先行失敗は回収を必要とする理由として保持し、正常生成成功へ書き換えない。

`d18f4dc`の旧clear gateを維持する。root seal後の旧clearは元slotを変更せず、Journalにjournal_unconfirmed／journal_sealedを残す。そのためsealed viewは不変copyだけでは不十分であり、供給postと将来のconsumer preでlive Journalのfirst／readyも確認する。以前のpreparedを理由に新しい故障を見逃さない。

## 5 借用寿命・close・固定discard

producerのsource／binding／Journalの所有権は同start配下に残す。供給はmetadataへのprivate借用を同issuerの先行slotへ保持するだけであり、payload移譲・元slot detachではない。準備中はprivate供給frameが借用責務を持ち、返却後は同issuerのprepared／failure slotが保持する。借用先より前に元ownerを破棄しない。

closeは既存のcloseRequested／readStop・firstを保持する停止通知であって、通常のretirement epochを自動的に新しくしない。closeだけを理由にviewを別epochで再発行しない。closeから旧clearを追加呼出ししない。frame active時のclose／discardは固定deferred状態を残し、frame未確認なら借用を退役済みと報告しない。

固定discardは同owner・同slotで最大1回、private供給frameがinactiveと確認された後に、供給view／anchorの借用参照だけを退役させる。空PacketOwnerSlot／cell保持slotを確認し、元25fieldやJournal履歴をclearしない。供給失敗でも元診断・失敗prefix・未確認責務を消さない。ownerに保持した別のpayload参照があるなら本discardの対象外と明示し、全alias退役・resource cleanup・root終端の証明にしない。

将来consumerへ渡す際のborrow handoffは別工程。本段階では外部にviewを返さず、固定discard後は再借用・再pin・再準備を拒否する。actual allocation未捕捉／frame未確認の責務は同failure slotに残し、正規custodyへの移譲契約なしに「移譲済み」としない。

## 6 失敗prefix・固定診断

| 位置 | 保持内容 | 禁止事項 |
|---|---|---|
| B00以前 | 診断owner自体の実確保はUnknown | 診断必着を主張しない |
| B01／B02途中 | 捕捉済みslot／startと未捕捉構築責務 | sourceを起動しない、第2startで補完しない |
| owner／scope preflight | 元source／binding・正規issued artifact・供給拒否結果 | 同値copy採用・scope再生成・claim再発行なし |
| claim消費後／producer停止前後 | preparing slot・元履歴・停止到達prefix | boundへ戻さず、旧clearで履歴を埋めない |
| 片Journalだけseal済み | 封印済みmetadataともう片方の未確認責務 | unseal・Unknownのabsence化なし |
| issuer発行後／view未捕捉 | issued admission、供給unconfirmed、元slot | admissionを未発行に戻さない、packetを作らない |
| provisional view／post故障 | 同ownerのview参照と先行理由 | 第2viewを生成して上書きしない |
| discard中／frame未確認 | 未退役の借用責務、固定診断 | 空／解放確認済みと報告しない |

固定supply理由案はbinding_mismatch、not_ready、source_unconfirmed、journal_unconfirmed、supply_unconfirmed、input_rejected。既存producer／issuerのfirstとは別slotに最初の理由を保存する。再入／二重準備／retiredは操作dispositionとして区別し、先行理由を上書きしない。origin・epoch実値・path・本文・raw例外は非出力。

## 7 費目所有・有限上限・未確認事項

既存writer費用はproducer、回収開始・root sealは既存start／issuer、追加のscope照合・Journal封印／private借用・view生成／post／discardは供給ownerに帰属させる。同じ回収開始やsealを両側で試行・計上しない。元source準備の再実行や予算の新規取得は許可しない。

構造枠は供給slot／claim／anchor／結合／view各最大1、packet保持slot1、cell保持slot25、利用状態slot1、固定layout1、結果／失敗shell各1。これはmetadata枠数であり、実packet／cellの生成数はいずれも0。既存Journalの25枠を供給側で複製しない。開始拒否後も履歴listやoriginを要求ごとに増やさない。

将来の共有予算・停止ownerから既存D_stop／D_endを供給し、残時間から期限を作り直さない方針を維持する。ただし追加unit係数・guard件数・確保layout・実E／Sとbootstrap費用の実証はUnknown。今回の構造上限をwork受付に使用しない。通知・保存・新resource cleanup費用も確認済みとしない。

## 8 独立合成受入条件（全て未実施）

| ID | 独立期待値・拒否点 |
|---|---|
| JS01 | 新JournalAssemblyを作らず、同issuerの同start／binding／sourceだけから供給。別factoryのinspect／generationBoundを採用しない |
| JS02 | source生成前の各先行slot faultでprepare0・admission消費0・packet0。捕捉済みprefixと未知責務を別表で確認 |
| JS03 | 同owner／construction／retention／sourceSlot／claim／producer epoch／capture epoch／packet originを個別混入し、供給開始前後の拒否段階を固定 |
| JS04 | scope accessorのfresh wrapperと正規`#scope`を区別。正規値再確認を省略する変異、scope copyを正規参照へ昇格する変異を検出 |
| JS05 | source_backed／local_only／source unknown／control mint未確認を分離。local_onlyのroot reader／seal回数0、source生成0 |
| JS06 | root seal・producer gate・Journal seal・issuer issued・供給postの順序を独立イベント表で検査。旧clearでabsenceを作る変異を拒否 |
| JS07 | 部分封印・view生成未捕捉・provisional捕捉後fault・post faultで元slotと未確認責務を保持。第2view生成なし |
| JS08 | 供給再入・二重要求・失敗後・discard後でclaim消費最大1、結果固定。既存回収開始／admission発行回数は不変 |
| JS09 | seal後の旧clear拒否／Journal新故障をpostで検出。実closeだけでepochを作り直さない。元firstと供給firstを別保持 |
| JS10 | C14 releasedをmetadata履歴として保持するがabsence／CaptureReadyへ昇格させない。missing factをundefinedから補完しない |
| JS11 | frame activeのclose／discardはdeferred、frame unknownは借用退役未確認。inactiveの固定discardは同借用だけを最大1回退役 |
| JS12 | 全経路でadmission利用unused、packet／cell生成0、元field clear増分0、証拠0、root終端0、秘密非出力、旧互換入口と梱包除外を維持 |

oracleは本体layout・builder・state counterを期待値にimportせず、構築／停止／封印の固定prefixとC01〜C25対応を別記述する。compiledでは単なる最終拒否だけでなく、拒否段階・回数を確認し後段guardのmaskingを避ける。未到達・非等価変異・実OOM未確認を記録する。

## 9 次の実装分割と今回の確認範囲

1. 先行shell／空保持slot・private anchor／供給claimの内部型と生成順。既存issuerへの接続前に故障prefixを確認。
2. 同startからの正規metadata供給・停止／封印・同既存scope／epochへの結合・viewのpost受理。旧合成factoryは別対照として維持。
3. 借用寿命・固定discard・再入／close／新Journal故障の連続試験。ここまででもadmission消費・packet生成は閉じる。

次のadmission consumerは別工程で、上記preparedと将来のlive pre検査を前提にする。packet生成はそのさらに後である。公開APIの実source差替えや正式発行口を開く工程は含まない。

今回は`d18f4dc`のproducer Journal、control live退役、旧clear gate、既存issuer／start／独立JournalAssemblyを読み取り照合した。新文書と親2文書だけを更新し、ビルド・試験・梱包は行わない。実装済み保証や過去の591件を本接続の成功へ昇格させない。3文書のローカルリンク14件、生成順B00〜B06の7段階、JS01〜JS12の12条件の重複・欠落なしと差分空白検査を確認した。これは文書整合の確認であり、未実装経路の試験成功ではない。未コミット、Pushなし。

## 10 第1段階の独立合成実装（2026-11-09）

配置は`tests/review/fixtures/journal-supply-shell-fake.ts`。runtime・既存issuer・Journalのimportはなく、別brand／別台帳の独立assemblyである。新exportは`createJournalSupplyShellFake`だけで、prepare／check／close／値診断のみを公開し、任意artifactのadopt・登録・consume口を持たない。既存factory・実classのソースを変更していない。

固定順は、先行FailureShellと34枠の捕捉台帳→結果shell(1)→供給slot(2)→空packet保持slot(3)→静的layout(4)→空cell保持slot25個(5〜29)→未使用admission slot(30)→**合成start代役**(31)→private target descriptor(32)→未消費供給claim(33)→同descriptorの結合先slot(34)。同参照・brand・variant・scope／epoch／packet originを確認後、供給slotをunboundからboundへ一度だけ固定する。B02の実RetirementStartAssembly接続を実装したという意味ではない。

descriptorはB03用の非実行供給先記述であり、issued admission originを持つ最終JournalSupplyAnchorではない。供給claimもunusedで保持するだけで、bound→preparingは未実装。checkはblocked_supplyを返す。packet／cell objectは存在せず、保持slotのreferenceは全てundefined。C→F layoutは親文書の固定25項目（F14・F24等を誤って連番補完しない）を使用する。

各生成点はbefore→attempting→返却参照のprovisional捕捉→confirmedを分離する。故障後は先行first・phase／boundary、捕捉済みprefixとattempt未捕捉の責務を保持し、第2構築を拒否する。最初のFailureShell／固定台帳・module layout自体の実確保失敗や実OOM時の診断必着はUnknown。生成frame中のcloseはdeferred通知で、frame退出までに新start生成を止める。close後も保持slotをclearせず、discard／cleanup確認を主張しない。

JS02の先行保持prefixとJS03／JS08／JS12の非接続部分だけを検証した。合成scopeは参照で照合し、start側の実field再検証、producer Journal借用、frame／停止／封印、同既存admission epochへの結合、live post、固定discardは後工程。別assemblyの成功を実class保証や本番bindingに昇格しない。実費用・layout・E／S・全体work受付はUnknownのままである。

初版§9末尾は初版作成時の記録（文書コミット`f51e246`）。今回の実装は別の未コミット変更として検証記録へ保持する。
