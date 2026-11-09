# WF-B (C)：WriterGate内部型・frame権限・退出確認とclosed確定点

正規root入口の詳細化（2026-11-09、MDのみ）: [gate生成・同owner結合とframe継続入口draft-0.1](BEST_PRACTICE_WFB_GATE_ROOT_CONTINUATION_DESIGN.md)で、先行gateから同issuer／startへのprivate構築経路、非実行draft保持、probe-only wrapperと正規生成bodyの分離、失敗時の元参照・未確認継続保持を具体化した。純粋fakeからの権限昇格や実writer／Journal供給は接続しない。

Version: draft-0.2 / Date: 2026-11-09 / 読み取り基準HEAD: `a9fa5fa`（純粋fakeレビュー修正基準HEAD: `dcb00e0`）。

draft-0.2のレビュー修正：純粋fakeの失敗処理は理由によらずgateを`unconfirmed`にしており、§3の「実行権限の退役を確認できない終端」という意味と食い違っていた。退出確認後の重複enterでも`unconfirmed`になって閉鎖できず、frame前の入力拒否・pin不一致でも同様だった。§10で`unconfirmed`の条件を限定し、重複要求を状態を変えないrefusalとした。

実装追記（2026-11-09）: §9の第1段階であるgate／pin／grantの型・状態・拒否だけを独立純粋fakeで実装した。[検証記録](E2E_BEST_PRACTICE_WFB_WRITER_GATE_FAKE_2026-11-09.md)。正規frame／writer停止／Journalへの接続・実closed証拠は未実装。

Status: **独立純粋fakeだけ実装。正規WriterGate・実writer停止・frame合流は未接続。** 親は[同start接続差分](BEST_PRACTICE_WFB_SAME_START_SUPPLY_STOP_DESIGN.md)と[private供給・先行保持境界](BEST_PRACTICE_WFB_JOURNAL_ISSUER_SUPPLY_DESIGN.md)。現行SS03は正規issuer／同startのreadonly構築結合だけで、WriterGate保持slotは空。[SS03検証記録](E2E_BEST_PRACTICE_WFB_CANONICAL_SUPPLY_CONSTRUCTION_2026-11-09.md)を本gateの保証に昇格させない。

正式発行口・C実行入口閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。初版はMDだけ、今回の純粋fake実装は§10に限定する。正規frame・実writer・実接続・実通信・設定変更・Pushは接続／実施しない。Journal供給／封印、admission消費、packet生成、値capture、field clear、証拠発行、root終端も接続しない。以下のtokenはprivateな合成契約案であり、OS操作や正式permitの権限ではない。

## 1 現行と追加責務

現行RetirementStartAssemblyはprepareで`#frame`を立て、finallyで退出処理を行う。requestは`#requested`を立ててactive frame中はdeferredとし、inactive時に所有検査後の回収開始claimを消費する。これは再生成抑制の基盤だが、各実writerへの権限台帳やactive writerの退出証拠を持たない。Journalのwrite／release／retireは記録拒否後もoperationを呼ぶため、Journal自体を停止装置としない。

追加するのは、同ownerで一度だけ結合したgate、単一生成frameのprivate grant、実writer入口／出口、停止要求の合流、書込み権限退役の確認である。gate closedは「この生成経路のpayload writerをもう実行できない」という内部状態であり、payload不存在・cleanup完了・全alias解放・Journal成功・CaptureReadyではない。

## 2 内部型・配置と同owner結合

型の発行・消費はcomposition内の正規lexical rootだけが行い、値kernelは状態関係／固定IDの計算だけを扱う。独立shellのbrandやsummaryからgate／grantを採用しない。

| 内部型案 | 固定内容・所有者 | 禁止事項 |
|---|---|---|
| GateBindingPin | gate origin、正規start owner origin、construction／retention／sourceSlot／回収claim origin、正規scope参照、既存capture epoch | payload・実source・実start参照をidentity内に格納しない。新owner／epochで補完しない |
| WriterGate | private state、正規current／issued binding、generation-attempt一度限りslot、stop latch、frame／leaf実行台帳 | 任意登録・再bind・再openなし |
| FrameGrant | gate／binding／frame origin、正規発行slot、generation phase、issued／active／revoked利用状態 | 外へ返さず、object copyやtoken所持だけで実行を許可しない |
| FrameExitRecord | 同grant、entered有無、exit disposition、権限退役確認、未解決実行責務 | finally到達・`#frame=false`だけから発行しない |
| LeafUseSlot | 同frame／固定WriterSite／親継続、not_started／active／exiting／exited／exit_unconfirmed | 別frame・再入writer・外部callbackへ貸さない |
| GateClosedRecord | 同binding／frame終端／closed origin、payload writer権限退役の確認 | root seal・Journal seal・解放証拠として使用しない |
| GateFailureShell | producer／gate／frame／writerの各first、最初の固定phase／WriterSite、既知・未確認責務 | 元理由を上書きせず、origin実値・raw例外・本文を出さない |

FailureShellと各保持slotをstart構築前に確保し、gate本体を構築・捕捉する。start構築後のSS03で、その実owner／issued pin／claimと既存issuerの正規scope／epochへ一度結合する。未結合gateではprepare・frame権限発行不可。途中確保未捕捉を未生成と断定せず、別gate／別startを生成しない。先行owner以前の実OOM・診断必着はUnknown。

scope accessorのfresh wrapperはfield確認用で、正規scope参照へ差し替えない。同scope・owner・construction・retention・sourceSlot・claim・epochとcurrent／issued同参照を別々に検査する。SS03で確認した未消費claim条件と、回収request後に確認する同claimの正規spent条件は別phaseにする。後者へ`constructionMatches()`の未消費条件をそのまま流用しない。spentという値だけで別claimを採用することも禁止する。

## 3 gate状態・frame状態と権限の付与

| gate状態 | 許可すること／拒否すること |
|---|---|
| unbound | 同constructionの一度限りbindだけ。frame／writer不可 |
| open | 正規bind完了後、一度だけ生成frameを開始可能。frame終了後の第2生成は不可 |
| stop_requested | 新frame拒否。同じ確認済みactive frameの固定継続だけが既存処理を終了可能 |
| closed | 全payload writerを実操作前に拒否。frame／grant再発行・再open不可 |
| unconfirmed | 実行権限の退役を確認できない終端。新規開始拒否、残る実行／借用責務を保持。closed recordなし |

frame状態はnot_entered／entering／active／exiting／exited／exit_unconfirmedに限定する。正常生成失敗・取消・例外をgate状態へ混ぜず、結果dispositionとして別保持する。

frame開始のpreflightは同start・正規pin／claim・scope／epoch・gate open・stopなし・generation attempt未使用・frame未開始を検査する。同期でgeneration attemptを使用済みにしenteringへ進め、grant生成→先行slotへprovisional捕捉→同参照確認→activeへ固定する。途中にawait・任意hook・通知を挟まない。grant生成呼出し後未捕捉なら未確認として再発行せず、source準備へ入らない。

FrameGrantはframe内で固定再利用する。同一frameのbinding／source／controlは正規private継続から同grantと同gateへ結合されるが、公開object・関数・callbackの返答からは渡さない。frameがactiveであることに加え、current／issued grant、同gate／binding、未退役、正規継続を毎回確認する。旧grantを保持していても退出後のwriter開始は不可。

active frame中のprepare再入はgeneration_in_progressで副作用0、別frame・別grant・二重生成は拒否する。request／close再入はstop latchと固定deferred状態だけを更新し、回収開始やclosed発行をその場で重複実行しない。

## 4 writerへの実行資格と単一leaf契約

active writerを「prepare全体」のような入れ子の大域callbackで数えず、**直接payload代入／配列変更／live除去のleaf操作**単位で扱う。本段階の契約は同時active leaf最大1。任意深さのstack／要求ごとのtoken生成を持たない。

1. 固定WriterSite（親文書WG01〜WG08配下の実代入位置）と同grant／gateを確認する。新規writerはopen、またはstop_requestedで既にactiveな同frameの固定継続に限る。全coverageの固定site辞書は実装時に別途完成させ、未対応siteは実行不可。
2. current leafなしを確認し、先行LeafUseSlotをactiveへ同期設定する。ここがleaf使用開始点。再入でleaf activeならoperationを呼ばずwriter_in_progressを記録する。
3. 実leafは任意hook・foreign method・awaitなしの固定直接操作だけを行う。Journal beginは実代入より前、完了記録は実代入より後だが、gate検査は両者より先に置く。
4. exit継続で同active slot／grant／siteを照合し、writer結果と退出確認を別に記録してleaf権限を退役させる。operation throwでもfinallyだけからexitedを推論しない。

mintのconstructor呼出し、probe、通知、外部に渡り得る処理はleafの中に含めない。frame配下の固定generation attempt／保持slotとして追跡し、その中の実代入leafは個別にgateを通す。例えばcontrol constructorのlive代入と、返却controlのbinding current／issued代入を別leafにする。array要素追加も参照不変だからと省略しない。

leaf内の任意再入を必要とするwriterが見つかった場合、この最大1契約の適合は未確認である。上限を黙って増やす・parent writerを一括で「完了」にする・siteを対象外へ除くことはせず、そのwriterの固定分割を設計し直す。WG01〜WG08の実装coverageが揃うまで新経路のprepareを有効化しない。

順次leafは同じ保持slotを再利用するが、exited確認済みかつ同frame activeの場合に限り次のactiveへ進める。privateなchecked ordinalを各入口で厳密に1増やし、exitでは同grant／siteに加えて同ordinalも要求する。数値表現の上限でoverflowしたらunconfirmed、wrap／飽和一致で古いexitを採用しない。このordinalはpayloadを持たず、要求ごとのobject tokenを発行しない。最初の故障診断は別slotへ固定し、正常な再利用で消さない。writer site別の総呼出し上界をこの表現上限で代用しない。

## 5 request／close合流とframe退出確認

停止要求の線形化点は同gateのstop latchを立て、新frame発行を閉じる同期置換とする。closeは既存closeRequested／readStopと先行firstも保持し、新epochを作らない。stop_requested中に正規active frameが続行できることは、次のframeを許すことではない。

| 要求位置 | 固定動作 |
|---|---|
| bind前／enter前 | 新frameを拒否。enter未開始の正規履歴を保持。owner未結合ならclosed recordを作らない |
| entering／grant未捕捉 | 新規開始拒否、発行未確認責務を保持。active扱いにもnot_entered扱いにも補完しない |
| active frame／leaf実行中 | deferred_frame。既存正規継続の終了を待ち、別frame・強制clear・その場のclosed発行なし |
| exited確認後 | 同ownerの固定drainから閉鎖判定へ最大1回進む |
| exit_unconfirmed | gate unconfirmed。固定失敗結果、元slot／借用保持。後続Journal供給なし |
| closed後 | 同closed結果のみ。第2record・第2claim消費なし |

frame退出はまずexitingへ進めて新leaf資格を閉じる。active leafがあれば正規exit protocolを完了していることを確認し、current／issued grant・同frame、固定generation attemptの戻り／例外捕捉、継続の残存なしを確認する。grantをrevokedへ固定し、その確認後だけFrameExitRecordを正規slotに発行する。後続drainへframe実体を渡さず、記録と必要なprivate借用責務を同ownerへ残す。

正常return・throw・取消のどれであっても、全実行資格の退役が確認できればexecution exitはexitedにできる。一方、payload生成／Journal記録の不完全さはそのまま残し、Journal封印や供給成功にはしない。退出継続のthrow、grant退役未確認、leaf current不整合、非同期／escaped継続の可能性が残るときはexit_unconfirmedである。「finallyが走った」「active件数0にした」だけでは代用しない。

閉鎖前の既存request／failが再入しても、新frameは再開しない。frame退出後の固定drainだけが既存回収開始へ合流し、claimの正規同一性とphaseを確認して最大1回消費する。供給claim・admission利用claimをこのdrainで消費しない。

## 6 closed確定点と記録の意味

closed判定のpreflightは以下の全条件を同ownerの正規slotから確認する。

- 正規GateBindingPin／scope／既存epoch・current／issued gateが一致し、stop latchあり。
- frameは正規not_entered checkpoint、またはgrant退役確認済みの正規FrameExitRecordを持つ。後者は同frameと一度限りgeneration attemptへ結合する。
- active leafなし、leaf退出未確認なし、generation継続・escaped実行資格の未確認なし。payloadの有無や件数で代用しない。
- binding／source／controlに同gateが結合され、対象writerのcoverageが確認済み。source未生成は正規checkpointで扱い、unknownを未生成扱いしない。
- startの正規pin／claimは現在phaseに整合。回収開始前と開始済みの条件を区別し、第2消費を行わない。

ClosedRecordのdescriptorと結果保持slotは先行確保し、preflight後のgate state→closedと正規closed slotの確定を、無allocation・無hook・無awaitの同期sectionで行う。**この同期確定がclosedの線形化点**。preflight後に再入可能処理や実確保を置かず、同sectionの更新順を外から観測可能にしない。型／実装がこのsectionを保証できなければunconfirmedで止める。

closed確定後は新grant／writerを実操作前に拒否する。拒否の後にJournal wrapperのoperationを呼んではならない。違反診断をsticky保持してJournal readiness／将来のpostへ伝播するが、gate自体をopenへ戻さない。closedは権限の退役を表し、後から観測された不正writer・coverage不備を無視して供給を許可する権限ではない。

GateClosedRecordはroot retirement seal／Journal sealと別物で、既存RootStopAckを偽装しない。Journal終端metadataの限定権限・封印・供給は、これとlive故障なしを後工程で確認してから進む。not_enteredのlocal-onlyでも同owner確認が必要で、root seal／source readerは呼ばない。全writer停止のcoverage未確認状態でclosed成功を公開しない。

## 7 失敗時の保持責務と診断

| 失敗位置 | 同ownerが保持するもの | 禁止する補完 |
|---|---|---|
| gate／pin構築・bind途中 | 捕捉済みgate／正規start・拒否候補・未捕捉構築責務 | 新owner／gateで再生成、prepare開始 |
| generation attempt消費後／grant未捕捉 | used attempt・entering slot・元参照・未知のgrant責務 | 未消費へ戻す、第2grant発行 |
| leaf active／exit途中 | 元field、provisional生成物、同grant／siteの実行責務 | 件数だけ0へ戻しclosed成功 |
| frame結果throw・execution exit確認済み | 元payload／Journal first・不完全生成物とexited記録 | 元生成失敗を成功／absenceに変換 |
| frame退出未確認 | active／exiting grant、既知・未確認継続と借用責務 | frameをinactiveと称する、borrow破棄 |
| closed preflight失敗 | 正規pin／frame終端・gate停止prefix・固定診断 | unconfirmedからclosedへ再試行で昇格 |
| closed後の拒否writer | 元参照不変・closed記録・違反診断 | 再open、第2record、過去成功だけで供給継続 |

ownerの寿命は未解決の実行／借用責務より短くしない。別custodyへの移譲契約がない間は同failure slotが保持し、移譲済み・cleanup済みと報告しない。固定結果への反復要求でref／origin／履歴listを増やさない。診断のfirstはproducer、gate、frame、writer、既存issuerで分離し、元理由を保持する。結果のreturn／通知が失敗しても先行slotの記録を消さず、その故障からwriterを再実行しない。

## 8 独立合成受入条件（未実施）

| ID | 固定期待値・変異条件 |
|---|---|
| GF01 | 先行shell／gate／bindの各故障で元捕捉prefixと未確認責務を保持。未結合prepare0、別gateによる補完0 |
| GF02 | 同owner／scope各field／gate／frame／grant／epochのcopy・混入を一条件ずつ拒否。start内部だけを変える対照を含め、後段guardのmaskingを避ける |
| GF03 | grant生成前後・捕捉前後・active確定前後で一度限りattemptと権限状態を独立oracle照合。未捕捉の第2grantなし |
| GF04 | frame prepare再入・leaf再入・request／close再入を分離。操作実行0／deferred／既存継続のみの各条件を確認 |
| GF05 | stop_requestedで同active frameは終了可能、別frame・退出済みgrantのwriterは実操作0。単にtokenを持つforeign継続を拒否 |
| GF06 | 固定leaf siteの入口／代入／Journal記録／exitの各故障でpayload結果とexecution exitを分離。callbackをleaf内へ入れる変異を検出 |
| GF07 | 正常／throw／取消×退出確認済み／未確認を別表で確認。finally到達や件数0だけでexited／closedにする変異を拒否 |
| GF08 | enter未開始の停止、grant未捕捉、active、exiting、exited、exit_unconfirmedの各位置でstop要求の固定prefixを検査 |
| GF09 | closedの各preflight条件を個別に欠落させ、record0を確認。正規phaseのspentを拒否し続ける誤実装と、第2claim消費を検出 |
| GF10 | closed同期sectionにhook／実確保を挿入する変異、状態だけclosed・record未確定を成功化する変異、再open・再発行を検出 |
| GF11 | WG01〜WG08の各実writerでclosed後の代入／配列変更／live除去／borrow退役0。Journal記録を外してもgateで拒否 |
| GF12 | 元first・未解決責務・秘密非出力・旧root分離・梱包除外を維持。Journal供給0、admission消費0、packet生成0、証拠0、root終端0 |

oracleは本体の状態表・counter・writer catalogueを期待値へimportせず、有限イベントと固定sentinelを独立記述する。compiledでは最終拒否だけでなく狙ったphase・実操作回数を固定する。冗長な等価条件と、未到達／非等価変異未検証は分けて記録する。

## 9 費目・未確認事項・次の実装分割

正規owner1・gate1・binding pin1・frame grant1・generation attempt slot1・同時active leaf1・frame exit record1・closed record1・各結果／failure slot1を構造枠とする。writer siteの固定一覧と呼出し回数、順次leaf利用回数は別途導出する。「同時1」を全試行1や全work1に読み替えない。元producer費用はproducer、追加gate／grant／exit／closed検査と診断はgate owner、回収開始／root sealは既存start／issuerに帰属させる。

共有予算・停止ownerと既存D_stop／D_endを引き継ぎ、別予算や残時間からの期限再計算を導入しない。追加unit係数・実確保layout・guard・bootstrap実E／S、実OOM前後の診断必着、escaped資格を持たないことの実証、全writer catalogueはUnknown。本書の構造枠を全体受付の上界に採用しない。

次の実装は(1)gate／pin／grant・状態と拒否の純粋fake、(2)正規先行構築へ同gate結合とframe enter／exitの合流、(3)実leaf分割・WG01〜WG08の停止coverage、(4)closed同期確定・連続対照の順とする。全coverage未確認の途中段階では既存正規prepareを開かない。Journal終端metadata・封印／供給はその後の別工程である。

今回の参照は`a9fa5fa`の既存start／SS03と親設計に限定した。新MDと親2文書だけを更新し、ビルド・試験・梱包は未実施。3文書のローカルリンク14件、GF01〜GF12の12条件の重複・欠落なし、差分空白を確認した。文書整合の確認であり、未実装gateの試験成功ではない。未コミット、Pushなし。

## 10 第1段階の独立純粋fake（2026-11-09）

開発専用`tests/review/fixtures/writer-gate-fake.ts`に非exportのWriterGateModel／GateBindingPin／FrameGrant／FailureShellを配置。importなし、独自brand／台帳の別assemblyであり、既存issuer・start・WriterGate保持slotは変更しない。新export `createWriterGateFake`は固定scriptとbind／enter／request／check／exit／closeGate／値診断だけを公開する。token・pin・grantや操作callbackは外へ返さず、任意artifactの採用口も持たない。

純粋状態はunbound／open／stop_requested／closed／unconfirmedと、not_entered／entering／active／exiting／exited／exit_unconfirmedを扱う。pinは同owner／scope各field・gate・epochへ結合し、bindは最大1試行。grantも同pin／gate／owner／epoch／frame／phaseへ結合し、generation attemptは最大1、発行途中失敗でも返却しない。current／issued同参照と各fieldを個別に確認する。pin／grantの不正fieldは正規発行slot側にも入れる対照で検査する。

active中のenter再入はgeneration_in_progress、bind中はbinding_in_progress、exit中はexit_in_progressで追加生成しない。requestは同fakeのstop latchを立て、active中はdeferred_frame、既存active grantの資格確認は継続可能、新frameは不可。entering中の停止は未確認として捕捉済みgrantを保持し、active成功にしない。拒否／故障は固定結果・先行理由・phase／boundaryと保持pin／grantを維持する。gateを`unconfirmed`にするのは、操作未確認（operation_unconfirmed）か、frameがentering／exitingの間の失敗だけとする。frame前の入力拒否・pin不一致は固定失敗として記録するがgate状態（unbound／open）を保つ。重複bind／重複enterは何も実行しないrefusalで、gate／frame状態と先行firstを変えず、sticky診断`refusal`だけを残す。退出確認後の重複要求があってもcloseGateへ進める。enter／check／exit／closeGateでのpin／grant再照合、closeGateのrevoked条件、checkのgrantStage条件は、混入がbind／enterで固定拒否されるため純粋fakeでは到達しない二重防御である。

exitはfakeイベントとしてgrantをrevokedへ移し、故障時はexit_unconfirmedに止める。return／throw／cancelは固定outcomeラベルであり、実frameの例外処理や取消を実証したものではない。producer先行理由も別診断として保持する。closeGateのclosed_fakeは状態モデルの遷移だけで、GateClosedRecord／FrameExitRecordを発行せず、closedEvidence=not_issuedを維持する。実coverageや実権限退役の証明ではない。

GF02／GF03／GF04／GF08のモデル部分、GF12の非接続条件だけを部分検証した。実leaf・checked ordinal・同startへのgate結合・退出確認・無allocation closed同期section・coverage・固定drainは未接続。Journal供給／admission消費／packet生成／証拠／root終端は0。正規経路や全体受付をこのモデルで開かない。実OOM・CPU／heap／layout／実E/SはUnknown。

初版§9末尾は文書作成時点の記録（後に`e1258c3`でコミット）。今回分は別の未コミット変更として検証記録へ保持する。
