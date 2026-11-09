# WF-B (C)：field別固定回収schedule・失敗prefix・診断契約

停止前提・capture受付の詳細化（2026-11-09、MDのみ）: [停止確認・clear権限・固定capture25cellの生成／確認境界draft-0.1](BEST_PRACTICE_WFB_CAPTURE_ADMISSION_DESIGN.md)で、現行の開始claimを予約として維持し、正規rootの通常利用seal・token-only pin・一度限りadmissionと25cellの同参照確認を具体化した。全25cell確認前のclearを禁止し、失敗時は元slotとprovisional captureを保持する。S00の段階順・S01の受付条件は同差分設計を優先する。実装・field clear・証拠・root終端は追加していない。

Version: draft-0.4 / Date: 2026-11-09 / 開始境界の実装基準HEAD: `ab377c1`（開始境界レビュー修正基準HEAD: `e1e30d3`） / 読み取り照合基準HEAD: `07cc830`（着手時は`d361de6`、途中のレビュー修正を再照合。レビュー修正基準HEAD: `cf7e285`）。

draft-0.3: §11の回収owner／claim・固定診断・generation-wrapper frame境界だけ合成実装した。field clear・capture・空確認・証拠・root終端は未接続。[検証記録](E2E_BEST_PRACTICE_WFB_RETIREMENT_START_2026-11-09.md)。

draft-0.4のレビュー修正：pin field混入（construction／retention／source slot）は`#pin`を別objectへ置換しており、先に同一性検査で拒否されて`matches()`のfield照合を単独で検証していなかった。不正pinを発行pin自身（`#pin`・claim.pinと同参照）として設置し、`matches()`だけが拒否する対照に直した（§11）。生成失敗時にframe内で回収要求を予約しfinally後に開始する経路と、引数付き呼出し拒否時のcontrol停止も固定した。

draft-0.2のレビュー修正：draft-0.1はS08でcapture packet（F24）を放した後のS09でF25〜F27（両receipt・`#context`）をclearしており、§2の「対応captureの同参照記録を確認するまで元slotをclearしない」と§5の失敗prefix（capture確認後・clear前は元field＋確認済みcapture）がこの3項目で成り立たなかった。receipt／context除去をS08、packet解放をS09へ入れ替えた。また検査だけのF29はcaptureしない（名前付きcellは25個）とし、S10の照合根拠をSourceRootSlotとTrustedControlPinに固定した。

Status: **回収開始境界だけ合成実装。field回収・証拠・root終端gateは未実装。** 親は[回収基盤設計](BEST_PRACTICE_WFB_PENDING_CUSTODY_RETIREMENT_DESIGN.md)と[停止・所有境界設計](BEST_PRACTICE_WFB_TRANSFER_TAKING_BOUNDARY_DESIGN.md)。先行実装・試験範囲は[同source／control結合の検証記録](E2E_BEST_PRACTICE_WFB_PENDING_SOURCE_BINDING_2026-11-09.md)。本書は親設計§5〜10を現行private fieldへ対応付ける差分である。

正式発行口閉鎖・C実行入口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。draft-0.1／0.2はMDのみ、draft-0.3は§11の合成開始境界だけ。field clear・証拠発行・root終端・実期待値pin・実source照合・S発行・実接続・実通信・実機操作・設定変更・Pushを行わない。§11で実装済みと明記しない型名・helper・field追加・状態・理由は引き続き設計案。

## 1 現行との差分・適用範囲

現行`PendingSourceBinding`は先行RetentionRootとSourceRootSlotへ同sourceを捕捉し、一度だけcontrolをbindする。close／failureは正規rootを停止するだけで、R1〜R4、元claim、receipt、borrow／Snapshotを保持する。`retireLiveBinding()`はstop済みcontrolのlive cellだけを空にする局所試験で、全回収ではない。`retirement=not_started`、`rootFinish=not_called`、`resourceCleanup=not_started`である。

現在のR1／R2計数は対応fieldの有無、R7はlive有無とlocal alias数、R8はsource／receipt有無を示す診断である。計数0、pending payload空、関係ok、control retiredのいずれもPayloadGoneEvidenceの根拠にしない。回収では各private fieldの実参照を別々に確認する。

新scheduleの対象は**同ownerが既知の固定slotを持つ、未takeの合成経路**だけ。下位claimはunusedのまま、payloadMoves／sourceDetaches／holderPublications／C実行は0。既存source準備失敗時の旧clear、旧factoryのfinish／seal／close挙動は維持し、新経路だけ専用継続へ接続する計画とする。rootにsource準備済みSnapshotがあることと、回収対象のbytes参照が空であることを分離する。

## 2 所有権・先行slot・正規権限

| 設計対象 | 生成・所有者／容量 | 責務と停止線 |
|---|---|---|
| RetirementOwner | 同constructionのRetentionRoot配下、1 | source生成より前に診断・固定表・回収claimを保持。公開facade／summaryは受領しない |
| RetirementAttempt | 同owner、1 | `unused→running→confirmed / unconfirmed`。unusedへ戻さない。下位移譲claimとは別 |
| 正規SourceRootSlot | 現行の同source slot、1 | construction／retention／slot origin／actual source originを独立pin。候補receiptからsourceを取得しない |
| TrustedControlPin | 同issuerのpayload-free control origin、最大1 | source側の同control参照と照合。候補coreだけから期待tokenを作らない。強参照handleは既存issued slot／固定capture cellから一時借用し、別の恒久aliasを増やさない |
| RetirementCapture | 同FailureCustodyの固定live cell、1 | R1〜R4／R7／R8の既知参照を名前付き固定cellへ捕捉。新しい通常利用権・第2holderではない |
| PartialCapture | 同RetentionRootの固定capture cell | custody未生成／捕捉未確認なら元slotが最後の保持先。移譲済みbitを先行させない |
| FrameLease／ScratchCarrier | 同生成・回収frame、各固定1 | 一時source／anchor／payload／claim／receiptを管理。active中は空確認・証拠へ進めない |
| RetirementDiagnostic | 同owner、1 | 原因・停止・回収・root・resource cleanupを別軸で保持。本文参照なし |
| 終端／証拠用slot | 同owner、各1、今回閉鎖 | 後続工程のprivate発行／consumer用。回収結果の公開summaryを採用しない |

captureは既存objectの参照だけを記録する。bytes・map・宣言・digestの再copy／再decode／再hashをしない。各元slotは対応captureの同参照記録を確認するまでclearしない。これは同一の責務を一時的に複数aliasで保持する処理で、下位移譲claim消費や通常slotのdetachではない。

RetirementCaptureはF01〜F13、F15〜F23、F25〜F27に対応する25個の名前付きcellとする。未生成は既知absent、未確認はunknown、捕捉後は同参照presentとして区別する。F14／F29／F30は検査項目（F14／F30は保持を許すunbound metadata、F29はsource側に残すpayload-free controlの確認）で、captureしない、F24はpacket自身、F28はpacketを借りる一時carrierなのでpacketへ自己捕捉しない。F15で捕捉したraw live tupleはcontrol.#liveを空にした後もpacket内に残るため、F24とF28の確認が終わるまで全退役にはならない。capture cellをslot外へ返す入口は作らない。packet（F24）の解放は、capture対象の最後の元slotであるF25〜F27を空確認した後に限る。

root停止・source field clearは、正規SourceRootSlotと同issuerが先に捕捉した権限だけで行う。混入したsource／controlのmethodを呼ばず、その候補を包む自ownerのslotを除去する。source側`#normalControl`はbind済み履歴として残し、undefinedへ戻して再bind可能にしない。controlを残せるのは正規originのcoreがpayload-freeと独立確認でき、liveが空の場合だけである。

生成失敗prefixではcontrol・context・4shellの全てが揃うとは限らない。所有根拠は生成前のconstruction／retention pinと生成時のcapture cellから取り、`#context`の存在やprepare成功を回収の必須条件にしない。control未発行・bind未実施は正規生成履歴からknown-absentとして扱い、存在しないcontrolのmethodを呼ばない。反対に候補receiptの欠落や計数0からknown-absentを推測しない。

TrustedControlPin用のcontrol originは設計上の追加で、現行5fieldのcoreには含まれていない。将来はcontrolのlive cell生成より前に別の空opaque tokenとして確保し、private accessorで同controlへ結合する。coreの5field契約を変更せず、final auditではsource側control自身のoriginをtoken-only pinと照合する。pinのためにcontrol強参照を回収後まで残す実装は不可。この追加確保費もUnknownである。

### 不正core／receiptを残さない

現行の固定故障には`core_source`、`core_claim`、`core_extra_payload`があり、拒否したcontrolのreadonly `identity`自体がsource／元claim／payloadを参照し得る。liveを消してもこの参照は消えない。凍結coreをcastで書き換えず、拒否候補を保持するlocal／issued control aliasとreceiptごと除去する。正常にbindされた正規controlのpayload-free coreだけは残せる。候補controlを内包するreceiptも同様で、候補のretire関数を呼んだことを回収条件にしない。

R6のcapture packetが同じ不正候補を一時保持するなら、packet自身も回収対象である。検査不成立のcore／receiptを不変診断へ格納しない。正規source側にpayload-containingなcontrolが残る等、独立空確認を満たせない状態はunconfirmedとし、通常利用停止・root保留を維持する。

## 3 生成frameと回収開始点

現行prepareには`const source`、`scope`、`a`、`core`等の一時参照がある。class fieldだけを空にしても、同frameからanchor→table→bytesへ到達し得る。したがって生成途中のclose／再入からその場で回収完了・証拠発行へ進めない。

生成本体をprivate frameへ分け、固定入口wrapperが本体return／throwを回収してから回収driverへ進む。内部のclose／failureは通常gateを同期停止し、`retirementRequested`を一つ記録するだけ。frame内では`deferred_frame`を返し、回収claimはまだunused。wrapperは固定finallyでFrameLeaseを退役し、生成本体の返却値・catch保持物にprivate参照がないことを確認する。その後にのみdriverを呼ぶ。callback登録・非同期queue・外部sinkは作らない。§11の保守的wrapperと開始予約までは合成実装済みで、capture／field回収driver・final auditは未実装である。

回収受付順は、終端固定済み→先行診断→回収要求／正規owner→SourceRootSlot・controlの所有権→frame inactive→attempt状態。条件成立後の`unused→running`同期置換が唯一の回収開始点。開始後は再入・close・failure・二重要求でも試行を追加しない。running中の返答はin_progress、confirmed／unconfirmed後は固定結果を返す。通常closeはcleanup権限の失効ではない。

不正候補のため通常受理できなくても、自ownerの正規保持表に基づく回収は可能。反対に正規sourceの捕捉自体が不明なら、候補から補完してrootを呼ばない。所有権検査に失敗した回収要求は`binding_rejected`でclaim0、通常gateは閉じ、責務を保持する。正規入口の失敗終端として固定し、同要求の反復で再検査・再開始しない。

## 4 固定schedule：field・順序・完了条件

S00〜S10は固定phase、F01〜F30は固定field項目。表の順序を実行順とし、同一objectを指してもslot確認を省略しない。各項目は`present_at_entry`、`write_attempted`、`empty_confirmed`を別に記録する。最初から空ならwriteは0、empty確認は必要。表の「新」は設計上の追加であり現行fieldではない。

| Phase | ID・群 | 実field／対象 | 固定操作・確認 |
|---|---|---|---|
| S00 | 開始 | 通常gate・正規root停止・FrameLease・回収claim | 実装済みの開始予約S00aを一度確保し、S00bで正規停止を確認、S00cでcapture受付へ進む。予約claimを再消費せず、確認前はclear不可。旧source clear／finishは呼ばない |
| S01 | 捕捉 | 正規SourceRootSlot、TrustedControlPin、RetirementCapture（新） | 既知aliasの同参照捕捉をfieldごとに確認。未知を空として扱わない |
| S02 | F01〜F06・R1 | source `#registry`, `#table`, `#view`, `#buildingRegistry`, `#buildingBindings`, `#buildingDeclarations` | 左から一つずつundefinedへ。各元slotの空を確認 |
| S03 | F07〜F11・R2 | source `#envelope`, `#issuedTable`, `#issuedView`, `#issuedDeclarations`, `#tableOrigin` | 左から一つずつ空確認。発行済みaliasも含める |
| S04 | F12〜F13・R3 | binding `#payload`, `#issuedPayload` | current／issued両方を除去し空確認 |
| S05 | F14・R5 | 同pendingActiveのpayload | 現行UnboundSlot.payloadはundefinedで凍結。書込みなしで正規cellから空／既知未生成を確認。不正payload・捕捉不明ならunconfirmedで保持し、将来held経路を勝手に扱わない |
| S06 | F15・R7 | 正規control `#live` | 所有pinと停止を確認し、一度だけretire。既に空なら再実行せず空確認。candidate methodは呼ばない |
| S06 | F16〜F18・R7 | binding `#claim`, `#issuedClaim`, `#extraClaim` | 元claim objectへの各直接aliasを除去。claim stateを消費済みへ変更しない |
| S06 | F19〜F21・R7 | binding `#control`, `#issuedControl`, `#extraControl` | local aliasを各除去。source側正規control履歴は残す。候補core経由の参照はobjectごと放す |
| S07 | F22〜F23・R4 | binding `#anchor`, `#issuedAnchor` | 各aliasを除去。wrapper／claimから再生成しない |
| S08 | F25〜F26・R8 | binding `#receipt`, `#issuedReceipt` | sourceSlot／control／core／slotsを内包する両receiptを除去。copyも同様 |
| S08 | F27・R8 | binding `#context` | scope／owner／4slot配列への借用を終了。正規originは先にpayload-free pinへ保存 |
| S09 | F24・R6 | RetirementCaptureのlive packet（新） | F25〜F27を含む全capture対象fieldの空確認後に固定packetを放す。packetの自aliasもScratchCarrierへ残さない |
| S09 | F28・R8 | ScratchCarrier／helper返却値／回収中の一時packet（新） | 参照なしのfixed metadataだけを返す。driver frame退出後にfinal auditへ進む |
| S10 | F29・R7 | source `#normalControl` | captureせず、正規SourceRootSlot経由のprivate accessorでfieldを読み、TrustedControlPin（token）と照合する。bind済みなら同正規control・live空・coreの正規5field対応を確認。bind前は正規履歴とfield空を確認。field自体をclearしない |
| S10 | F30・R8 | RetentionRootの4capture cell・固定結果slot | 各cellの既知未生成／同constructionのunbound値・対応親・payload空を直接確認。捕捉不明を空へ補完しない。保持を許すshell/originと、禁止する本文参照を区別する |
| S10 | 全8群 | F01〜F30とcapture残存、生成／回収frame inactive | private final audit。全確認成立ならpayload_confirmed。証拠／root gateはまだ閉鎖 |

S08でR8のreceipt／contextを空にしても、R6のpacketとF28の一時carrierがpayloadを保持し得るため、S08・S09時点を回収完了としない。S02〜S09の途中はalias退役の進捗であり、全payload退役ではない。空確認には同source専用のprivate accessorを使い、`inspect()`の計数・aggregate mask・旧clear履歴を入力にしない。F29は五つの正規tokenとの同一性と余分fieldなしを確認し、許可tokenのどれかという値集合だけの検査にしない。

S10は回収本体が終了した後の固定finalizer frameで行う。finalizerはSourceRootSlotとpayload-free pinから対象を特定し、source context／anchor／元claimを再取得しない。core確認は5field・異なるtoken4個（owner＝construction）との正確な対応を検査する。ScratchCarrierが空でも生成／回収frameがactiveなら確認を完了させない。これは管理された保持経路の論理退役であり、GC完了・物理メモリ消去・実行engine内の全stack探索を保証しない。

### 最後に残せるもの

正規SourceRootSlot、sourceのreadonly `#root`、独立確認済みpayload-free `#normalControl`、origin、空shell、固定理由／bit／計数のみ。sourceの`#state`等は通常利用を不可逆に閉じる専用状態で表し、旧`discarded`／旧discard履歴へ混算しない。既存source `#terminal`は公開診断であり、回収権限・空確認の根拠にはしない。Snapshot／borrowの退役はこのscheduleに含めず、後続root gateが所有する。

## 5 field単位の失敗prefixと未確認保持

各F項目の故障点は、capture前／capture格納後確認前／capture確認後clear前／write後空確認前／空確認後の5区分。clearしてからcaptureする実装は禁止する。固定失敗scriptは各fieldを個別に狙い、他の関係を整合させる。

| 失敗prefix | 最後の保持者・記録 | 後続処理 |
|---|---|---|
| source既知未生成 | RetentionRootの既知shell。SourceRootSlot=empty | localだけ確認可能。rootはnot_created、root用証拠はnot_issued。root_finishedへ補完しない |
| source呼出し後に未捕捉 | SourceRootSlot=unknown、内部責務もUnknown | 捕捉済みlocalのみ追跡。payload_unconfirmed、root_not_started。別sourceを生成しない |
| 正規source捕捉後、control未生成／bind前 | 正規sourceと既知local slot | control不存在は既知状態として記録。全field検査を省略せず、専用停止継続から回収する |
| capture前の失敗 | 元fieldを保持、custodyへ未移譲 | capture_unconfirmed。元fieldをclearせず、claimは開始済みならspentのまま |
| capture格納後・確認前 | 元fieldとprovisional captureの両方 | 確認済みbitを立てない。両保持先を残す |
| capture確認後・clear前 | 元field＋確認済みcapture | その状態を保持しunconfirmed。通常利用を復活させない |
| write後・空確認前 | captureと、実際に残る元slot | write_attemptedのみ。空だと推測せず、消した参照も復元しない |
| 空確認後の故障 | 先行empty確認は維持、残りはcapture／元slot | 確認済みprefixを巻き戻さず、全群完了へ補完しない |
| F24のpacket除去途中 | 残るpacket／R8または未確認状態 | 既に消したpacketを再構築しない。残存参照なしを確認できなくても診断は保持 |
| S10のfinal audit不一致 | 残る正規source／既知slot。残存がなくても確認未成立を保持 | payload_unconfirmed。再clear・再確認で成功化しない |
| payload確認後の結果固定失敗 | SourceRootSlotと先行mutable診断 | payload_confirmedとresult_unconfirmedを分離。証拠再発行・root自動開始なし |

最初のunsafe／未確認操作でforward clearを止める。安全な後続fieldがあるという理由で未確認部分を飛ばして全群成功にしない。後着close／failureは停止要求と先行理由保持だけで、同attemptを再実行しない。別の再回収・外側隔離は本書の範囲外。

slotが既にundefinedなら「実参照を保持中」と虚偽報告しない。逆に最後の観測がpresentだったbitを現在のpresentと断定しない。known-present／confirmed-empty／unconfirmedを区別し、所有先を確認できない場合はUnknownのままとする。custodyが失敗したときに存在しないcustodyへ移譲済みとしない。

## 6 診断契約・理由の優先順

診断は固定enum／数値／bitだけで、本文・digest・file名／path全文・source／anchor／claim／control／raw例外を含めない。既存source.inspect全体を新終端へそのままコピーしない。元診断はprivate readerから固定理由だけ採取し、停止前後の観測位置を明記する。

| 軸 | 設計値・意味 |
|---|---|
| 通常処理 | 既存firstReasonとcloseRequested、元supplyFirst／lifecycleFirst／readFirst／readStop。先行値を上書きしない |
| 回収要求 | none／requested／deferred_frame。要求回数をlist化しない |
| 回収受付 | not_started／binding_rejected／running／confirmed／unconfirmed、attempts=0または1 |
| 回収理由 | none／ownership_mismatch／source_capture_unknown／capture_unconfirmed／field_clear_unconfirmed／field_check_failed／frame_unconfirmed／result_unconfirmed |
| 位置 | phase S00〜S10、field F01〜F30またはnone、boundary enum。最初の回収失敗位置を固定 |
| field記録 | 30項目の固定表：entry presence三値、write_attempted、empty_confirmed。進捗件数はこの表の診断projectionだけ |
| 群確認 | R1〜R8のunverified／confirmed_empty／allowed_metadata／unconfirmed。bit単独では証拠にならない |
| payload | not_started／confirmed／unconfirmed。source未捕捉ならunconfirmed。空pendingだけではconfirmed不可 |
| root | not_created／not_started／unconfirmed。今回root_finishedを返す入口は作らない |
| Snapshot／borrow | not_observed／retained／retired／unconfirmedをprivate観測に基づいて分離。payloadから推定しない |
| resource cleanup | not_started固定。参照退役をread／cancel／OS cleanup成功にしない |
| 証拠・受付 | proofIssuance=closed、formalIssuance=closed、wholeRunAdmission=disabled、Unknown項目維持 |

返答の代表理由は「既存firstがあればそれ、なければ回収の固定失敗理由、正常回収なら原因なし」。closeはfirstがないときだけ既存の開始前／開始後方針に従う。回収で別の失敗が起きても元原因を隠さず、両軸を返す。rootに原因がある場合はroot側の先行値を保持し、上位firstがnoneだから正常とみなさない。

`07cc830`で現行`sourceStopOwned`は写像済みの理由を受けるよう修正された。generation_unavailableはread_prepare_unavailable、同一性不正・重複はbinding_mismatch、正規closeはcloseへ写し、source_rejectedでは元sourceの供給診断にroot binding理由を重ねない。回収接続でもこの写像と元診断を維持する。回収不成立は回収診断軸だけへ記録し、元の取得失敗へ置換しない。上位generation_unavailable／source_rejectedを別に残し、旧factoryの既存理由を変更しない。

confirmed／unconfirmedの終端結果は一度だけ固定し、その後のclose／回収要求は同じ結果を返す。結果構築自体の実OOMで不変結果が作れない場合、先行mutable診断と所有責務を維持するが、診断必着・同object返答はUnknown。検査不能を成功へ補完しない。

## 7 費目所有と有限構造上限

新ownerが先行回収cell／capture packet／slot確認／参照除去／結果準備を所有する。sourceの通常準備・元失敗clearは元owner、borrow／Snapshotとroot終端はroot lifecycleの費目とする。旧discardPasses／supply_references_clearedは新回収で増やさず、新回収のfield試行数を専用固定counterへ分ける。

旧計数は回収入口のbaselineとの差分で照合する。元source_rejectedで既存clearが起きていれば、その履歴を0へ戻さず保持し、新回収による旧discard増分が0であることを確認する。全失敗prefixの旧discard絶対値を一律0に固定しない。

固定構造はphase11、field項目30、field記録30、群8、attempt1、capture packet1（名前付きcell25）、source slot1、result slot1。fieldのwrite試行は各最大1、空確認は各段階の1回とfinal auditの固定再確認を区別する。同一controlのlive退役はobject同一性で最大1、local／issued／extraのslot確認はそれぞれ実施する。下位移譲claim消費0と回収attempt1を混算しない。

F14／F29／F30はwriteではなく検査項目、F15は専用cell操作、F24／F28は追加carrierの解放なので、30を実際のwrite回数やworkへ読み替えない。各private helperの検査回数、25cellのcapture／確認費、frame／結果準備費・unit係数は実装前に別の有限操作表として確定する。固定scheduleの存在だけで実E／S・全CPU／heap・layout・OOM保証をKnownへ上げない。Bのcap、D_stop900／D_end1000、guard131,524、実行／テスト期限を変更しない。

## 8 独立合成・compiled受入条件（未実施）

| ID | 受入条件 |
|---|---|
| FR01 | 正常、開始前close、bind前／後失敗、source未生成／未捕捉／捕捉済みを分離。元診断・claim0／1・root保留を独立oracleで確認 |
| FR02 | F01〜F30の各非空field／意味のある故障境界を個別注入。空fieldも対応するpresent基点を作り、未到達／非該当は明記 |
| FR03 | 独立の参照グラフfixtureでcurrent／issued／候補／capture packetからのaliasを別々に追跡。期待値に本体の保持表・clear helper・群bitをimportしない |
| FR04 | malformed coreにsource／元claim／payloadを残す、receipt.controlを別候補へ替える、R6 packetにaliasを残す変異を検出。live空だけで成功しない |
| FR05 | source #normalControlをundefinedへ戻す変異・retired gate漏れを検出。同sourceの再bind／通常利用は不可逆に拒否 |
| FR06 | capture前clear、capture確認bit先行、write後の空確認省略、currentだけclear、群bit偽装、final audit省略を単独変異で検出 |
| FR07 | 生成frame active／close再入、回収running再入、各field前後のclose／failureを確認。frame終了前の空確認・証拠・root finishが0 |
| FR08 | unconfirmed後の再試行・元参照復元・第2source生成・結果差替えを拒否。先行empty prefixと元理由・回収理由を同時保持 |
| FR09 | root finish／retireFailedの先行呼出し、旧source clear／finish呼出し、旧discard混算を検出。新工程でもroot終端・証拠は未実行 |
| FR10 | 正常payload確認後の結果準備故障を分離。Snapshot保持／resource cleanup成功へ昇格しない。秘密marker／raw例外を診断に出さない |
| FR11 | 旧unbound74件・レビュー修正後binding46件・旧関連回帰とcompiled保証を維持。新入口／型／fixtureが配布物に入るseeded負対照を追加 |

全prefixを完了件数だけで照合せず、field別presence／write／確認、最後の保持先と未確認責務を比較する。FR03の独立参照グラフは自ownerが管理する固定経路に限定し、任意JS heap走査やGC保証とはしない。未捕捉constructor内部の実状態は合成script成功でもUnknownのまま。

## 9 次の実装分割と停止線

1. **回収owner／claim／固定診断・frame境界**：source／control結合の正規pinを再利用し、回収開始0／1・deferred_frame・再入拒否・先行理由を純粋fakeで検証。まだfield clearしない。
2. **固定capture・field回収・未確認保持**：S01〜S10をprivate継続へ接続。各fieldの有効基点・故障prefix・不正core／receipt・一時aliasを検証し、payload確認まで。証拠／root gateは閉鎖。
3. **別工程で証拠・root終端gate**：全8群のprivate final audit後だけPayloadGoneEvidenceを発行／消費し、正規root finishと必要なretireFailedへ一度接続。正常readonly Snapshotと失敗退役方針を検証する。本書だけでは実装しない。

下位claim消費・pendingへの通常payload記録・normal slot集約／detach・非実行holder公開・C→kernel実行は上記の完了と別の承認／検証まで閉じる。今回の設計では旧v1・既存factoryの挙動や期限を変更せず、未導出量を受付へ投入しない。

## 10 今回の文書確認

`d361de6`のSupplyUseControl、CanonicalSupplyAssembly、PendingRetentionRoot、PendingSourceBindingと既存root lifecycleを読み取り照合した。途中で反映された`07cc830`の理由写像・close／retired gate・claim receiver対照と、payload-free coreが5field・異なるtoken4個（owner＝construction）である訂正も再照合した。`#retiredGateProbe`は固定文字列の診断で本文参照を持たず、保持を許すmetadataとして扱う。46件等の過去の試験記録は同source結合段階の証拠で、本scheduleの成功証拠ではない。今回はソース・fixture・CHANGELOGを変更せず、ビルド・合成試験・梱包・実費検証は再実行していない。関連3文書のローカルMDリンク19件、11phase・11受入条件の記載、fenceの対応、`git diff --check`を確認した。未コミット、Pushなし。

## 11 回収開始境界の合成実装（draft-0.3）

`createRetirementStartFake`を同compositionへ追加し、薄い`retirement-start-fake.ts`は同factoryだけを再exportする。private RetirementStartAssemblyは先行owner token・固定30field／8group診断を用意し、同PendingSourceBindingの生成前scopeとSourceRootSlot originへprivateにpinする。RetirementStartClaimは同owner／pin、正規発行claimの同参照と未消費を検査する。既存のunbound／binding factoryを呼出し可能な状態で外へ返したり、公開summaryからownerを採用したりしない。constructor・claim・pin・継続は非export。

新facadeはprepare／request／close／inspectの固定診断だけ。prepareはprivate generationFrameをwrapperで囲み、active中のrequest／close／準備失敗はdeferred_frame、claim unused・starts0。固定finallyで生成frameを退出した後だけrequestをdrainする。既存PendingSourceBinding.prepare内部の一時参照はそのreturn前に閉じ、外側は保守的にwrapper全体をactiveとして扱う。既存prepare本体への任意hook追加や、JS engineの全stack探索は行わない。固定frame_exit_failureは終了未確認のまま止め、開始0・再prepare拒否・frame_unconfirmedを保持する。

inactive後の正規requestは同claimを一度だけ消費し、attempt=running、blocked_field_clearへ固定停止する。これはS00の所有／lease／claim部分だけであり、S00全体のroot停止・S01以降の完了証拠ではない。通常requestは正規controlの通常利用gateだけを停止し、root自身を正常終端・close済みとは報告しない。正規close／生成失敗は既存のprivate結合経路を通ってrootへ伝わる。source未捕捉でも開始できるのは局所claimの受付だけで、sourceCapture=unknownを保持し、payload確認やroot操作の権限を付けない。

runningへの同期置換後の再request／同期再入はin_progress、開始は1のまま。生成中のprepare再入はpreparation_in_progressで新frameを作らない。owner／claim／pinの混入はclaim0・binding_rejectedとなり、その固定拒否結果を以後のrequest／closeも同参照で返す。元のfirstReason、retirementFirst、sourceの供給／lifecycle理由を別に保持する。生成失敗はread_prepare_unavailable、source_rejectedは元source診断を維持し、後着closeで上書きしない。不明frameは通常activeと区別する。pin field混入3種は不正pinを正規発行pin自身として設置するので、`#pin`／発行pin／claim.pinの同一性は成立し、private `matches()`のconstruction／retention／source slot照合だけが拒否する（pin copyは同一性検査だけを狙う別対照）。生成失敗（throw／準備失敗）ではframe内の回収要求がdeferred_frameとなり、`prepare()`だけでfinally後に一度開始する。

30fieldのpresenceはnot_observed、writeAttempted／emptyConfirmedはfalse、8groupはunverifiedのまま。RetirementCapture25cell・TrustedControlPinによるclear権限・field clear・final audit・証拠・root gateは生成／接続しない。既知参照・borrow／Snapshotを保持し、新経路による旧discard増分0、fieldWrites0、payload=not_started、proofIssuance=closed、rootFinish=not_called、resourceCleanup=not_startedを維持する。回収claimのspent／starts1と下位移譲claim消費0を混同しない。実費・全heap／work・実E／S・診断必着はUnknown。
