# WF-B B03後半：active後・body未開始／完了と同duty固定exit契約

Version: draft-0.2 / Date: 2026-11-10 / 読み取り基準HEAD: `5939864`（レビュー修正基準HEAD: `42e3053`）。

draft-0.1のレビュー修正（MDのみ）：§5表の1行目「正規未呼出し」は、B03-Cの`not_called`（grant生成器の未呼出し）と同じ語でbody未呼出しを表していた。この行はgrantなしと正規provisionalの両方を含むため、「body未呼出し」へ改めた。§12のコミット前の記述には、コミット後の注記を追加した。

Status: **詳細設計のみ。未実装・受入試験未実施・body起動未承認。** 親は[B03前半・同target局所退役](BEST_PRACTICE_WFB_FIXED_EXIT_LOCAL_RETIREMENT_DESIGN.md)と[(B) grant／固定exit責務](BEST_PRACTICE_WFB_PROBE_GRANT_EXIT_DUTY_DESIGN.md)。(C)との境界は[同startのenter／確認済みexit](BEST_PRACTICE_WFB_PROBE_FRAME_ENTER_EXIT_DESIGN.md)、前工程の実績は[B03-C検証・再検査レビュー](E2E_BEST_PRACTICE_WFB_PROBE_LOCAL_EXIT_2026-11-10.md)を参照する。

正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。本書は将来の合成依存限定仕様案であり、実装・合成body起動・実接続・実通信・設定変更・Pushの承認ではない。実session／transport／worker・実writer・正規generation・Journal供給・admission／packet・field clear・borrow退役・owner解放・GateClosedRecord／root終端は対象外。

先行配置の詳細化（2026-11-10、MDのみ）: [先行slot物理配置・固定構築schedule・失敗保持draft-0.1](BEST_PRACTICE_WFB_BODY_SLOT_CONSTRUCTION_DESIGN.md)で、`bf63f16`を基準に§2／§11-1の配置を具体化した。binding ownerとcell ownerの正規結合を区別し、先行shell／13carrier・data生成順・source／receiver bind・未確認prefix保持を定義する。body／active継続・実unwindは未実装／未承認のまま。

先行seed限定実装（2026-11-10）: 上記配置設計§12で、同rootの先行shell／13carrierとBC01〜05のcontext／origin／sentinel／pinだけを合成依存限定で実装した。[検証記録](E2E_BEST_PRACTICE_WFB_BODY_SLOT_SEED_2026-11-10.md)。正常でもready=false／bind未試行／body0で保持する。BC06以後、BD／構築ready、BA／body、BU実unwindと正式発行は閉鎖のまま。

live構築境界の詳細化（2026-11-10、MDのみ）: [BC06〜11の内部型・更新権限とBC12／13のbundle／draft生成境界draft-0.1](BEST_PRACTICE_WFB_BODY_LIVE_SLOT_BUNDLE_DESIGN.md)で、§2の先行slotを同owner／dutyの初期variant・固定生成順へ落とし込んだ。構築中は進行更新0、将来のBA／BU writerは未接続とし、元診断参照と失敗prefixを保持する。live storageのsealとimmutable aggregateのfreezeを区別する設計であり、構築ready・bind・body起動を許可しない。

## 1 現行との差分と流用禁止

`5939864`のB03-Cは同startのcapture実帰還からguard／同duty settling／同target局所退役へ進み、body未開始のheld_not_startedを保持する。phase再検査12対照は追加済みで、本書では未対応扱いに戻さない。

| 現行の境界 | 後半の追加契約 |
|---|---|
| `guardHistoryBoundary`／`localRouteAbsent`がbody not_started・outcome noneを要求 | 安定identityとphase別body履歴を分離。旧条件の削除や全体のOR緩和では対応しない |
| `localHistoryMatches`のknownはprovisional grantを要求 | active確定前、active後未呼出し、body帰還後を別の履歴variantとして検査 |
| live LocalAbsenceStorage／LocalTerminalStorageはnot_started専用 | 同ownerの先行body履歴／後半terminalを追加提案。旧slotへcompletedをcastしない |
| 完了・held_unsealedの値型は存在するが、live発行経路はない | 値型やpublic summaryを実帰還・内部資格へ昇格しない |
| 旧wrapperのfinallyがframe=false／frameExitsを更新し、catchがrequestを呼ぶ | 後半probeは同startの独立したprivate分岐。旧generation／request／drainは呼ばない |

B03-Cのrunを完了してからbodyを追加起動する順序は不可。既に同dutyとretirementが消費され、対象がrevokedだからである。将来の新しい合成入口では、同一run内のcapture→activation／固定body→固定unwindを構成する。旧A／B／B03-Cのfactory・拒否・型・試験は維持し、公開check／closeをrunnerに変えない。

## 2 所有・生成元・先行準備

唯一のcustodyは既存CanonicalGateDraftRoot、借用者はその同RetirementStartAssembly。同gate／scope／epoch／packet／binding／cell束／ProbeRunLink／FixedExitDutyを再利用する。第2root／start／duty／予算、pure WriterGate fakeのgrant、同値copyによる補完は許可しない。以下は内部型名案で、public export／証拠発行型ではない。

| 先行slot／型案 | 固定内容と最大保持 | 生成元・書込み権限 |
|---|---|---|
| FixedBodyRoutePin | private brand、同owner／start／link／frame／grant保持slot／duty／entry／exitと固定body origin。同rootに先行結合したthrow／cancel sentinelの保持。1組 | 同rootの正規構築継続だけ。origin／sentinelは呼出しごとに再生成しない。callback／body関数／URLを格納しない |
| BodyProgress | 同pin、callReserved、entryObserved、returnCaptured、固定body状態／outcome。1組 | 同startの固定call siteと固定body先頭／帰還捕捉点だけ。外部値の採用なし |
| BodyRouteClosure | 同pin、body新規開始禁止latch、unwindへ移った正規制御位置、継続保持なしの限定事実。1組 | 同private wrapper。stop要求・退役latch・確認済みinactiveとは別軸 |
| BodyUnwindControl | 同control anchor／RunLink／duty、有限phase、進行中／一度限りroute、固定first／refusal。1組 | 同rootが先行保持し、同startへ一度だけprivate bind。別のduty claimを作らない |
| BodyTerminalStorage | none／held_not_started／held_unsealed／exit_unconfirmedのvariant、同body履歴／退役／dutyへの参照、prepared／committed。1組 | 同固定unwindだけ。candidate／issued／acceptedは常にundefined |
| BodyDiagnosticView | 元producer／capture／probe理由とexit／delivery理由の固定slotへの結合。1組 | 同ownerの診断。元firstを別ownerへcopyして捨てない。動的履歴listなし |

同target退役のused／blockedTarget／confirmedTargetと参照保持方式はB03-Cと共通化候補にするが、完了済みのC結果を採用しない。後半のterminal／body履歴と同じ先行owner・同dutyへ結合した未使用slotから始める。Aのimmutable controlと初期slotはanchorのまま変更しない。

論理的な生成順は、既存先行failure／custody→既存binding／RunLink／duty／control→route pin→body progress／closure→unwind control／terminal／診断結合→同start private bind→全post→構築ready。途中失敗はready=false、grant追加0／active化0／body呼出し0。捕捉済みprefix・未捕捉責務・拒否候補を同rootへ保持する。表の6区分を6allocationや承認済みEへ読み替えず、物理配置・厳密な生成schedule／費用は実装前の別分割で固定する。

既存use claimはBE01、同dutyの退出試行claimはBU00、同targetの退役試行はBU03で各最大1回。body callReservedは1箇所の呼出しを二重にしない補助履歴で、追加のrun資格・第2grant・dutyの払い戻し口ではない。

## 3 同一性と二つのguard

安定guardはroot／startのcurrent・issued binding／cell束／link／duty／control、同owner／scope／pin／epoch／packet／frame／entry／exitとroute pinを参照同一性で検査する。grantはprivate issuer＝current＝receiver-issued、private brand＋固定field数・全binding fieldを再照合する。body origin・履歴slot・unwind control・terminalも同pin／同frame／同dutyでなければ拒否する。private参照からだけ供給し、summaryのsameOwner=trueや保持件数で補わない。

通常body開始guardは、正規capture帰還／post、grant正規provisional、use entering・use使用済み、duty owed・退出未試行、先行unwind route準備済み、body未呼出し、未使用body予約、全body利用latch開、通常first／stop／closeなしを要求する。構築readyだけでは足りない。元draftのexecutable=falseをtrueへ書き換えず、正規lexical固定継続でだけbodyへ進む。

固定exit guardは同identity・既存使用履歴・phase別の帰還／未呼出し事実を検査する。元firstなし・stopなし・gate open・use unused／duty not_owedを要求して必要処理を短絡しない。ただし混入・履歴未確認を無視する迂回路でもない。foreign dutyや候補へ操作せず、同canonical custodyの拒否診断と責務を保持する。

回収claimの同origin・同issuedとの結合と、本段階のunused条件は独立して確認する。`probeMatches`等の準備／construction判定だけへ丸ごと委譲せず、安定検査とphase条件を明示する。本段階は回収claimを消費しない。将来spentを許す契約はrequest合流時の別工程であり、本書では成功条件を拡張しない。

## 4 active確定・body呼出し・帰還の境界

以下は将来の接続順。現在はBA00以降の実行口も閉じたまま。

| ID | 正規制御点・同期記録 | 故障／停止時 |
|---|---|---|
| BA00 | §3の開始guardと先行unwind／body slotの全postを検査 | 新active／body=0。BE01後なら元dutyは残し、既存prefix相応の固定exitへ |
| BA01 | 同use／grantをactiveへ直接同期固定し、activationConfirmedを記録 | allocation／hook／awaitなし。直後故障でもbodyを開始せず、active後未呼出しvariantへ |
| BA02 | 同latch／target・active／body未使用を再検査。body callReservedを一度消費し、固定call siteだけから呼ぶ | 予約と実到達を区別。同body先頭の最初の固定同期区間で、同originのentryObservedと実body cellのrunning／outcome noneを記録する。予約後未到達は独立prefix |
| BA03 | 同call siteでnormal return／正規throw捕捉／正規cancel帰還を確認し、同BodyProgressと実body cellへ固定outcomeを記録 | 観測故障・foreign結果／例外・帰還不明はunconfirmed。必ず同private unwindへ合流し、raw値を保存しない |

BA02の予約から唯一のprivate呼出しまでに任意hook／通知／awaitを挟まない。fault injectionはこの境界をbefore／afterとbody先頭到達前後へ分けて検証する。callReserved=trueはbody実行の証拠ではなく、entryObserved=trueも完了の証拠ではない。body先頭未到達を確認するには、同call siteの正規制御帰還・入口閉鎖・同origin・呼出し履歴全体の整合が必要。false flag／bodyStarts=0だけから未開始を発行しない。

固定bodyはlexicalに選択する有限なreturn／throw／cancelと再入用合成イベントだけ。任意body関数・callback・Promise／thenable・generator・非同期継続・外部timer・実writerを受け取らず、継続をfieldへ保存しない。未知の戻り値を検査するためにthen／iterator等のpropertyを読まない。正規制御点で固定variantと確認できなければ未確認とする。

## 5 結果variantとactive後未開始の扱い

三つの独立軸は、grant生成結果の既知性、同targetの局所退役確認、bodyの実開始／帰還確認である。activeはbody開始・完了を意味せず、body失敗もexit失敗と同義ではない。

| 履歴variant | 必須のprivate事実 | body結果／理由 | 全post後にだけ許す局所終端 |
|---|---|---|---|
| capture後・active未達のbody未呼出し | 既存B03-C相当の正規履歴。grantなし、または正規provisional | not_started／none。元capture first保持 | 既存held_not_started。grantなしはnot_required、それ以外は同target退役確認が必要 |
| active後・body call未予約 | 同grantのactivationConfirmed、同固定入口での未呼出し確認、入口閉鎖 | not_started／none。active後故障／stopは別診断 | 退役confirmed＋settled_not_started／held_not_started。body完了型へcast不可 |
| body予約済み・先頭未到達を確認 | 上段＋callReserved=true、同call siteから呼ばれなかった正規prefix | not_started／none。予約は払い戻さない | 同上。未到達を確認できなければ次の未確認枝 |
| 正常return | 同body originで実entry、同call siteへのnormal帰還と捕捉を確認 | returned／return、probe理由none | 退役confirmed＋settled_unsealed／held_unsealed |
| 固定throw | 同bodyの実entryと、先行private throw sentinelを同catchで捕捉 | threw／throw、probe理由probe_throw | 上と同じ局所終端は可能だが、probe失敗は不変 |
| 固定cancel | 同bodyの実entryと、先行private cancel sentinelの同call siteへの帰還 | cancelled／cancel、probe理由probe_cancel | 上と同じ局所終端は可能だが、取消結果は不変 |
| 開始／帰還／残存継続が未確認 | 予約後の所在不明、entry後の帰還未捕捉、unknown／foreign結果等 | unconfirmed。確認済みoutcomeがあれば別軸で保持 | exit_unconfirmed。通常の退役成功系列へ入れず、全参照・残る責務を保持 |

throw sentinelとcancel sentinelは同root／route pin／body originへ先行結合し、実値を返さない。外部のError名／message／cause／codeや「cancel」という文字列で分類しない。固定body以外の例外・帰還観測コードのthrowを正規body throwへ変換せず、probe／frameの未確認理由として分離する。catchでは未知例外のproperty／getter／stackを読まず、保存・serializeもしない。

stop／closeは新規開始の禁止要求であり、body取消完了ではない。BA01後でもBA02前のstopを確認したらbodyを呼ばず、active後未開始としてunwindする。body中の固定イベントによるstopはlatchだけを記録し、正規cancel sentinelで実帰還した場合にだけcancelledとする。return後のstopでoutcomeをcancelへ書き換えない。合成cancelは実I/O取消／worker終了の証明ではない。

帰還未確認枝は保守的に停止する。同identityとknown grantを保持していても、確認できないbody継続を無視して退役confirmed／heldへ進めない。局所結果が後段の故障以前に確認済みならその事実・参照は巻き戻さず、全exitだけ未確認にする。別targetを選び直す部分退役／再試行は導入しない。

BU04前のgrant stageの許可値は、capture段階の未発行ならempty、active未達の正規既知ならprovisional、activationConfirmedを持つactive後未呼出し／body完了ならactiveに限定する。active履歴とbody entry／帰還履歴も同pinから再確認する。BU04より前のrevoked、activation未確認のactive、completedなのにprovisional等は不正として拒否する。既に使用済みのB03-C退役結果を後半へ流し込めない。

## 6 同duty固定unwind：有限scheduleと一度限りの消費

後半の入口は同startのlexical wrapperからだけ。同body呼出しを囲む単一のunwind機構へ、正常／throw／cancel／active後未開始／観測故障を必ず合流させる。元固定返答・probe失敗による早期returnより外側で責務を処理する。finallyは合流機構であって成功証拠ではない。旧generationFrame／failFrame／request／drainは呼ばない。

| ID | 同private slotへの操作・確認 | 失敗時の保持 |
|---|---|---|
| BU00 | 同control進入・同identity・未使用route／同dutyを確認。body新規開始を閉じ、同duty attemptUsed=true／settlingとuse=exitingを直接固定 | この点前は退出試行0、後は1。foreign dutyは変更せず、再入はrefusal |
| BU01 | §5の履歴variantと同body origin／capture帰還／実call履歴を照合 | 未確認なら同dutyの未確認を固定し停止。元body／grantの既知性を消さない |
| BU02 | 正規target＝private issuer＝current＝receiver-issued、brand／全field、phase別grant状態と全slot結合を再確認 | 不正／unknownを別targetで補完せず、退役操作0 |
| BU03 | 同retirementの未使用を確認し最大1回used。targetを捕捉、同targetの禁止latchとblockedTargetを固定 | used／禁止対象を払い戻さず、後続body／grant使用は拒否 |
| BU04 | 同grant cellをrevokedへ直接固定 | immutable grant objectは変更しない。raw method／foreign getterは呼ばない |
| BU05 | 同target／blockedTarget、同issuer・receiverと全field、禁止latchが閉じた事実・実revokedを再確認。confirmedTargetを保持 | 単なるrevoked代入／counter／finallyでconfirmedにしない |
| BU06 | 同履歴variantのnot_started、またはcompletedと固定outcome、同body入口閉鎖・継続非保持の限定事実を確認 | body完了とcapture帰還、物理wrapper帰還を混同しない |
| BU07 | 同body履歴／retirement／dutyに結合した非公開terminalをpreparedへ | 部分preparedは成功公開しない。既知prefix保持 |
| BU08 | 同identity、body履歴、同duty使用済み、target退役、候補なし等の全post | 退役／bodyの確認済み事実は保持し、全exitは未確認 |
| BU09 | commit直前にBU08を再検査。固定直接代入だけで局所terminal／同dutyを同期確定 | commit前の故障とcommit後の配送故障を分離 |
| BU10 | 固定allowlist projectionを生成。wrapperの物理的帰還と資格退出を別に保持 | 確定後の診断生成故障はdeliveryUnconfirmed。再退役／再bodyなし |

表はknown targetの11段階・各before／afterを持つ設計上のscheduleで、全guard呼出し数・実work費ではない。capture段階の正規未発行枝だけは退役not_requiredを許す。active後／body完了枝ではgrantが必要なのでnot_requiredへの迂回は不可。後半でも同dutyの退出試行は1回で、既存B03-C処理を呼んでから第2のunwindへ進まない。

対象の局所退役、body入口閉鎖、利用者stopは別latch／別事実。退役処理のためにcaptureStop由来のclosedを新たなprobe firstへ記録しない。将来の全probe利用境界は同targetの禁止latchを確認し、revoked grantや確認済みtargetを再active化しない。

## 7 全post・局所終端と(C)との分離

BU08／BU09は同owner／start／link／duty／frame／control／body pin・各live slotの参照を再照合する。body開始claim・body履歴・variant、同dutyのsettling／使用済み、use exiting／使用済み、退出cell empty、candidate／issued／acceptedなし、prepared terminal、正規grant退役とtarget履歴の全整合を要求する（capture段階の正規未発行枝だけはnot_requiredと全grant参照不在）。phaseごとの検査は後段だけの失敗で代替せず、そのphaseで最初に拒否する対照を置く。

| 局所終端 | bodyとgrant | 同duty／use／退出cell | 許可しない読み替え |
|---|---|---|---|
| held_not_started | activation前または後の未呼出しを正規確認。grantは正規未発行か、同target退役confirmed | settled_not_started／exiting／unsealed | completed、正常body成功、held_unsealed |
| held_unsealed | 同body originの実帰還confirmed・return／throw／cancelを保持、同grant退役confirmed | settled_unsealed／exiting／unsealed | probe throw／cancelの成功化、accepted／finished／確認済みinactive |
| exit_unconfirmed | 元body outcome／grant knowledge／退役prefixを独立保持 | 同duty／use／退出cellは未確認、消費済みflagは不変 | 未生成・不存在・cleanup済み・再試行可能 |

BU09は既存先行plain slotへの直接代入だけ。allocation／freeze／hook／通知／awaitを挟まず、terminal kind／committedと同duty／use／退出cellを同期固定する。具体的field順は実装前に独立した線形化契約・対照で固定する。中間状態を外部観測させる実装や同期保証不明ならbodyを開かずUnknownで止める。

同body呼出しが帰還し、専用call-siteからunwindへ移り、await／callback保持／再開口なし・入口閉鎖という限定された継続非保持事実を検査する。public bodyStarts、wrapperOnStack=false、frameExits、finallyだけでは代用しない。物理wrapperはunwind中にstack上にあり得る。物理帰還flagを記録しても、(C)前に資格上のinactiveを公表しない。実runtime全体のescaped継続なしはUnknown。

held_unsealedは(B)内の保持終端であり、(C)への証拠やFrameExitRecordを発行しない。candidate／issued／acceptedは型でもundefined。後工程のprivate受領物・一度限り移譲・PX04〜05の同期確定は別設計／承認とする。public summaryからの復元は不可。body未開始variantを(C)へ渡す必要が生じてもcompleted型へcastせず別契約にする。

既存B-01の`probeStateFactsValid`、B03-Aの値専用`probeExitAxesValid`、B03-Cのlive未開始経路は変更しない。後半のlive関係検査を別の明示variantで設計し、旧条件を緩めない。値検査passをlive証拠へ昇格しない。

## 8 失敗prefix・一度限り結果と診断保持

| 故障位置 | 同ownerが保持する事実・責務 | 再実行／成功化の禁止 |
|---|---|---|
| 先行生成／bind途中 | 元shell、全捕捉prefix、拒否候補・未捕捉構築責務 | 第2ownerの補完、active／body開始 |
| active前またはactive直後・未呼出し | 正規activation履歴、not_started、元grant／duty、開始停止理由 | activeをbody開始扱い、grantなしへ戻すこと |
| body呼出し予約後・entry不明 | callReserved使用済み、同pin／grant、未知の開始責務 | flagだけの未開始証明・body再呼出し |
| 正規throw／cancel帰還後 | 固定outcomeと元probe理由、同grant／duty、残るexit責務 | probe理由をexit成功で消す、元firstによるexit短絡 |
| 帰還捕捉／exit guard故障 | 確認できた開始／outcome、未確認の帰還責務、元借用 | foreign throwを正規throwへ分類、unknownをcompletedへ昇格 |
| 禁止／revoked／confirm途中 | used、target／blockedTarget／confirmedTargetと到達済み事実 | latch再open、confirmed消去、別target再選定 |
| confirm後・BU09前 | 確認済み退役とbody outcome、未確定terminal、同duty | held成功の先行公開、再退役 |
| BU09後・projection故障 | 元committed terminal／duty・全参照・最初の故障位置＋delivery診断 | 巻戻し、二重commit、body／exit再実行 |

元construction／producer／capture firstは既存slotに保持し、probe理由・exit理由・配送理由・refusalを別固定slotで扱う。probe理由案はnone／probe_throw／probe_cancel／body_entry_unconfirmed／body_return_unconfirmed。exit理由案はbinding_mismatch／state_invalid／body_history_unconfirmed／local_retirement_unconfirmed／terminal_unconfirmed／internal_unconfirmed。これは新しい版の診断案で、既存ProbeRunFirstやrunFirstの許可値を黙って広げない。

最初の理由・最初のfailurePhase／boundaryと最後の到達prefixは別に保持し、各firstは最初の非noneから上書きしない。raw戻り値・例外・message／stack／cause・任意key・origin派生文字列は保持／出力しない。throw／cancelかつexit局所確認済みは合法で、body結果とexit結果を一つのokへ畳み込まない。

body中再入、unwind中再入、終端後重複を区別する。進行中は固定refusalだけでcanonical first・元処理の退出能力を壊さず、body／grant／duty／retirement追加0。終端後は同固定結果・全参照保持で、未確認からの再開口を作らない。projection失敗で返答を配送できなくても、先行ownerに終端・診断を保持する。

公開診断は新しい有限schemaを設計し、実body開始／帰還・退役試行・終端確定を実slotから0／1で投影する。旧B03-Cの固定bodyStarts=0やexecution=closedをbody実行後の表示へ流用しない。将来の合成実行表示はsynthetic_only等の別版とし、authority=none・formalIssuance=closed・wholeRunAdmission=disabled・implementation=unknown・investigations=on_holdを維持する。現在はその入口／schema自体も未実装。全返答graphのenum許可値・strict boolean・freeze・有限plain dataを検査する。

固定discard／外部custody移譲／borrow退役は追加しない。bodyが局所終了しても未封印・未確認の責務と元参照を先行rootから解放せず、cleanup証拠・RootStopAck・全writer停止へ昇格しない。

## 9 停止・予算・追加費目

stop／closeは新規body／grant使用を閉じる。同じstartのfixed exitだけは既存dutyの限定処理として許すが、identity／履歴不明を無視せず未確認停止する。exit中stopだけを理由に処理を短絡せず、正規退役の禁止latchを利用者取消と混同しない。旧request／close実合流・drain・回収claim消費は0のまま。

費目所有者は同gate／frame owner。追加pin／body履歴／terminalの先行構築、activation前後guard、固定body呼出し／捕捉、unwind guard、局所退役、終端commit、診断projectionを別費目として列挙する。既存root構築／grant発行・capture、旧producer／回収費を二重に所有しない。共有化するguard／retirementの実呼出しは一度だけ計上する契約を実装時に固定する。

構造枠は同root・同frame各1、grant constructor試行≤1、body予約／呼出し≤1、duty退出試行≤1、局所退役試行≤1、局所terminal確定≤1、正式退出候補発行0。fault後も払い戻さず、retry・呼出しごとのslot増設を導入しない。publicな任意回数の拒否／inspect全体を有限workと主張しない。

物理allocation、全guard数／unit係数、停止後必要枠の厳密予約、E／S、layout／OOM、実会計と全体work上界はUnknown。共有予算へ将来接続するときは同開始点のD_stop／D_endと停止ownerを引き継ぎ、別予算・残時間からの期限再計算・期限緩和をしない。枠不足・診断生成不能を処理済み／解放確認済みへ変換しない。本書でcapを設定／承認しない。

## 10 独立合成受入条件（全て将来・未実施）

| ID | 必須条件・負の対照 |
|---|---|
| BH01 | 同root／start／control／link／duty／frame／body origin／grant・各live slotのcurrent／issuedを1要素ずつ混入。対象phaseで最初に拒否し、操作prefixが独立期待値と一致 |
| BH02 | 先行生成／bind／postの各前後故障でactive／body=0、捕捉prefixと未捕捉責務保持。ready・pinだけでbodyが開く変異を拒否 |
| BH03 | BA01前／後、BA02予約前／後・実entry前／後、BA03帰還前／捕捉前／後を区別。active後未開始とcompleted、予約と実呼出しの混同を検出 |
| BH04 | normal／throw／cancel×帰還confirmed／未確認×局所退役prefix×terminal確定前後の到達可能な組合せを独立表で確認。不可能組合せは値／型の不適合対照にする |
| BH05 | 固定bodyの実entry／同call site帰還・private sentinelによる分類を検証。script結果ラベル、stopだけ、任意Error名・戻り値からの完了生成を拒否。未知objectのhook実行0 |
| BH06 | 全経路が同unwindへ1回合流。元capture／probe first、早期return、throw／cancel、観測throwでも責務を省略しない。旧request／generationへの迂回をsentinel検出 |
| BH07 | BU00〜10の各before／afterへ故障／stop／再入。履歴・claim・target・全postの再検査をphase直前で壊し、後段maskingでなく最初のfailurePhaseと実操作回数を固定 |
| BH08 | 同targetの禁止前／後、revoked後／confirm後を区別。latch open、receiver／issuer copy、target差替え、confirmed消去・第2退役・revoked再active化を個別検出 |
| BH09 | body中／unwind中再入、終端後重複、close前後を分離。body／duty／retirement／commitは各最大1、元first・未確認責務・元返答同一性を保持 |
| BH10 | return／throw／cancelの各outcomeを退役／記録故障で消さず、BU09後projection故障はdeliveryだけ。finally・counter・frame flag・stage代入だけの成功化を拒否 |
| BH11 | held_not_started／held_unsealed／exit_unconfirmed、帰還不明／known不正／unknown grant、accepted／finished／inactiveをstrict値型とsemantic compile-failで交差禁止 |
| BH12 | 実参照を保持した全公開graphへsentinelを漏らす二段projection変異・enum既定値変異を検出。getter／symbol／関数／raw例外なし、未生成not_created・不正unconfirmed |
| BH13 | 旧A／B／B03-C・既存phase再検査12対照と旧factory export／拒否不変。新fixtureの梱包混入0、artifact／callback登録口0、実writer／Journal／回収／(C)／実通信0 |
| BH14 | 同予算／停止owner・同開始点を維持する契約、二重費目／claim返却／期限延長／新cap投入を拒否。未導出費はUnknown、全体受付無効のまま |

oracleは本体のbuilder／state表／schedule／counterを期待値へimportしない。有限semantic event列から、active確定・予約・実entry・帰還捕捉・duty開始・退役・terminalのprefixを独立計算する。試験だけの値shapeや合成ラベルをlive証拠の代わりに供給しない。

compiledはscratch内だけで故障注入し、個々のguardを外すと「そのphaseの拒否が失われる」対照を持つ。単に最終的に失敗しただけ、同時に複数防御を外しただけ、到達しない比較を単独保証に数えない。冗長防御を隔離する場合は隔離した節と到達限界を記録する。実runtimeにfriend／fixture台帳・任意登録口を持ち込まない。

## 11 実装順序とbody開放前の受入gate

1. 本書の先行生成・phase／variant・診断契約を基に、物理slot配置・固定構築schedule・失敗回収／保持条件を詳細化する。bodyは閉鎖。
2. 内部型・先行slot／同owner bind・値専用比較／projectionを合成依存限定で実装する場合も別承認。旧入口を維持し、body／active継続は閉鎖のまま。
3. 固定probe起動を別途承認した場合だけ、BA01〜03とBU00〜10の全unwind・正常／throw／cancel・active後未開始・再入／stop・故障・秘密非出力を**同じ変更で**連続接続し検証する。bodyだけを先行開放した中間状態を出さない。全受入条件が揃わなければ実行入口は閉じたまま。
4. (C)のprivate受領物／候補／同期exit確定、request合流、実writer・実予算・全体受付はそれぞれ後工程。局所body試験成功で承認済みにしない。

## 12 今回の文書検証と未実施事項

今回は本書と親2文書の参照だけを変更する。確認対象はローカルリンク、BA00〜03／BU00〜10／BH01〜14のID整合、前工程からの変更範囲、差分空白。ソース・試験・CHANGELOG・設定は変更せず、build／合成・compiled試験・body起動を行わない。§10は将来の受入条件であり、成功済み記録ではない。未コミット・Pushなし。

文書検証結果：3文書のローカルリンク26件に欠落なし。BA4段階・BU11段階・BH14条件の順序／重複／欠落なし、全22表の列数と新規文書を含む空白／末尾改行に異常なし。src／tests／CHANGELOG／package manifest・lockfile／梱包・TypeScript設定はHEADと差分なし。index登録・ソース変更・試験実行・body起動は行っていない。

上記の「未コミット・Pushなし」「index登録は行っていない」はコミット前の記録である。本書はその後`42e3053`としてコミットされ、draft-0.2のレビュー修正もMDのみで行った（Pushなし）。
