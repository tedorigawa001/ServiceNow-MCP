# WF-B B-03前半：固定exit・局所退役・同duty責務保持の接続差分

Version: draft-0.2 / Date: 2026-11-10 / 読み取り基準HEAD: `08e8fa6`（B03-Aレビュー修正基準HEAD: `50c31be`）。

draft-0.2のレビュー修正：B03-Aの公開projectionは不在のslotや許可外の値を肯定的な状態へ既定値化していた（未生成dutyを`not_owed`、未構築のknowledgeを`callStarted=false`の`unknown`、未生成slotを`unconfirmed`）。dutyの許可値に`settled_not_started`がなく、将来その状態を`not_owed`と誤報する余地もあった。§12で既定値の規則を明記した。

Status: **B03-Aの先行準備とB03-Bの安定identity／履歴guard・同dutyの一度限りsettlingを合成依存限定で実装。** B03-Aは§12と[その検証記録](E2E_BEST_PRACTICE_WFB_PROBE_EXIT_PREPARATION_2026-11-10.md)、B03-Bの基準HEADは`dd9108b`、範囲は§13と[その検証記録](E2E_BEST_PRACTICE_WFB_PROBE_EXIT_GUARD_2026-11-10.md)。§1〜11は当初の差分設計で、退役・terminal成功・body起動の承認ではない。親は[(B) grant／固定exit責務](BEST_PRACTICE_WFB_PROBE_GRANT_EXIT_DUTY_DESIGN.md)と[同startのenter／確認済みexit](BEST_PRACTICE_WFB_PROBE_FRAME_ENTER_EXIT_DESIGN.md)。B-02の実績とレビュー修正は[捕捉検証記録](E2E_BEST_PRACTICE_WFB_PROBE_GRANT_CAPTURE_2026-11-10.md)を参照する。本書は親のBX00〜04をbody未開始経路から詳細化し、BE05／06と(C)の候補・同期確定は追加承認まで閉じる。

正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実接続・実通信・設定変更・Pushを行わない。実writer、request／close実合流、回収claim、Journal封印／供給、admission／packet、field clear、borrow退役・owner解放、GateClosedRecord・root終端も対象外。

## 1 基準差分と前回答からの訂正

`ba84ea4`後に`08e8fa6`でB-02の失敗分類が修正された。本書はこの修正を取り込み、既知prefixを一律unconfirmedにする旧挙動へ戻さない。

| 現行の事実 | B-03前半で追加する契約 |
|---|---|
| `captureFailure()`はclaim前をnot_claimed、使用後をclaimed_not_issued／grant_known／grant_unknownに分類する | 同private履歴をexitへ供給。公開prefix文字列や単なる件数を証拠として採用しない |
| `#grantCallStarted`はconstructor直前、`#grantIssued`は返却前に記録される | 試行予約と実呼出し、発行元保持と受信側捕捉を別事実として保持 |
| 既知失敗はentering／owed、既知grantはprovisional／unresolved=falseを保持する | knownは所在・生成結果の既知性。正規field照合済みや局所退役済みとは別 |
| root／startに固定失敗返答があり、closeはstop latchだけを扱う | 通常受付の固定返答を解除せず、必要な固定exitだけを同startのprivate継続へ合流 |
| `FixedExitDuty.phase/boundary`はnone固定。exit試行は未実装 | 同dutyの有限prefix・一度限りのsettlingを型に追加 |
| 現行状態検査はsettled_unsealedにbody完了とrevoked grantを要求する | body未開始専用のsettled_not_startedを追加提案。body完了を捏造して既存条件を通さない |

親文書の当初設計・B-01実績にある「全工程未実装」「grantなし」はその段階の記録である。最新の実装範囲は親§13と本節を基準とし、本書の提案型・scheduleを実装済みと読まない。

## 2 入口・所有・先行生成

同composition lexical root、同`CanonicalGateDraftRoot`、同`RetirementStartAssembly`、同binding／cell束／RunLink／FixedExitDutyを再利用する。先行rootが唯一のcustodyで、startは同参照を借用する。pure WriterGate fake・第2root／gate／start／duty・copyされた同値objectで補完しない。

後続実装での生成順は、先行Failure／固定診断shell→既存cell／binding→既存RunLink／duty→同dutyに結合した空ExitControl／LocalRetirement／NotStartedTerminal slot→同startへのprivate結合とpost確認→新入口のready、とする。追加slotの生成失敗は捕捉prefixを保持し、grant／exit開始0で拒否する。既存37＋8＋4段階を追加slot込みの確保上界にはしない。

新経路は梱包除外の合成入口だけとする。将来の名前例は`createProbeFixedExitFake`。固定scriptと値診断だけで、任意grant／duty／callback／body／exit routeの採用口を持たない。旧B-02のprepare／enter／check／closeの意味・固定返答・試験を維持する。check／checkLegacyをrunnerへ変えない。

連続試験の入口は同start wrapperの明示的なprivate経路で、B-02のcaptureを呼び、その実呼出しが戻った後に同exit継続へ一度合流する。capture失敗返答だけで外へ早期returnしない。旧generationFrame・旧catch／finally・requestへの流用はしない。新bodyを呼ぶ分岐は存在させず、既存draftもexecutable=falseのまま。別assemblyの似たexitで「同start保証」を代替しない。

## 3 private内部型と三つの独立軸

以下は提案型であり、新たな証拠発行型・public exportではない。

| 型／slot | 固定内容・合法状態 | 所有と変更制限 |
|---|---|---|
| ExitControl | 同RunLink／duty／binding／cell／start origin、idle／checking／settling／terminal、固定first／refusal、capture帰還事実 | enter前に1組。通常返答とは別。checking以降は再入・二重要求で再実行しない |
| DutyExitProgress | 同既存dutyのphase=none／guard／history／retire／record／project、boundary=none／before／after | 別dutyを生成しない。最初の失敗位置と到達済みprefixを別に保持 |
| GrantKnowledge | not_called／known／unknown、constructor直前flag、private issuer参照、current／receiver-issued／rejectedの既知参照 | 現行の正規履歴を参照するview。public値・summaryから復元しない |
| LocalRetirement | not_attempted／not_required／confirmed／unconfirmed、同issuer target、試行済みflag、同ownerの禁止latch、確認済みprefix | 最大1試行。targetは正規issuerに限る。knownとretirement確認を混同しない |
| BodyAbsence | not_started確認、同capture呼出しの帰還、同wrapperの固定閉鎖経路、body権限の新規付与禁止 | body完了・return／throw／cancelを表さない。publicなbodyStarts=0だけでは生成不可 |
| NotStartedTerminal | none／held_not_started／exit_unconfirmed、grantなし中断／既知grant局所退役の区分、同dutyとBodyAbsenceへのprivate結合 | body未開始専用。候補・issued・accepted退出記録は常にundefined |
| ExitDiagnostics | 元capture first・frame/exit first・失敗位置・重複refusal・知識不足と退役不足の固定区分、結果配送の未確認flag | 先行固定slot。raw例外・本文・origin・動的listを保持／出力しない |

三軸は独立である。(1)grantの生成結果がknownかunknownか、(2)同grantの局所退役が確認できたか、(3)bodyの未開始／完了を確認できたか。knownな不正候補の退役guardが拒否しても、生成結果までunknownへ戻さない。逆にunknownをbody未開始・返答件数0でknownへ昇格させない。

既存grant cellの`unresolved`は生成結果の未知責務を表す。退役拒否だけでこれをtrueへしてはならない。B-03のretirement未確認は別slotへ記録し、状態検査にこの区別を追加する。既知候補のstage／参照／拒否履歴を消したり、成功条件に合う参照へ置換したりしない。

既存dutyへ追加する終端候補は`settled_not_started`（attemptUsed=true）。既存の`settled_unsealed`はbody完了後専用のまま。前者も責務の全解消ではなく、この一度限りの局所処理が確認できたという意味だけで、同rootの保持・将来の移譲責務は残る。unconfirmed dutyのattemptUsed=falseはexit未試行、trueは試行後未確認を表す。use.attemptUsedとは別のclaimである。

## 4 固定exit権限と一度限りの開始点

通常enter guardは従来どおりstop／first／closeを理由に新規開始を閉じる。固定exit guardは、既存責務を処理する限定権限であり、通常guardの無条件流用や全guardの省略ではない。

1. ExitControlが同rootのissued slotに結合され、同startの正規capture呼出しが帰還したことを確認する。idle以外は進行中refusalまたは既存終端を返す。外部引数から同一性を補わない。
2. 同root・startのcurrent／issued RunLink・duty・binding・cell束とscope／owner／pin／epoch／frame／entry／exit originを照合する。安定したidentityを、not_owed／unusedを要求する準備用`runDutyMatches()`／`runSealMatches()`から分離する。`probeMatches()`の回収claim未消費条件をexit資格の唯一の根拠にしない。
3. grant未発行・正規既知・未知・不正既知の履歴を検査する。body未開始、capture非進行中、body起動経路閉鎖、旧回収claim未消費を確認する。firstなし、gate open、stopなしをexitの必要条件にはしない。
4. 確認できた同dutyがowed（またはunknown履歴を保持するunconfirmed＋未試行）であることを確認し、同dutyのattemptUsed=true／state=settling、use=exitingを無allocation・無hook・無awaitで固定する。**ここがdutyの一度限りの退出試行開始点**。以降false／owed／unusedへ戻さない。

not_claimedで同dutyが正規not_owedの場合は3の分類でnot_enteredへ分岐し、4を行わない。未知grantを処理する枝も、同identityが確認できれば退出試行開始時にuse=exitingとするが、knowledge=unknown・grant未確認を保持する。これは局所退役を許す資格ではなく、未確認責務を一度記録するphaseだけである。

ExitControlのcheckingは同要求の再入を閉じる進行状態であり、別の退役claim・別予算・別責務ではない。identityを確認できないままforeign dutyを変更しない。その場合、先行canonical slotと不一致候補を保持し、ExitControlを固定exit_unconfirmedへ終端する。dutyの試行flagは未変更でも、このrouteを再試行する公開／private再開口は作らない。

通常返答の`#fixed`／`#captureFixed`を消去・再生成しない。合成B-03のprivate継続は、それらの返答選択より外側に責務処理を置く。元のenter失敗返答は同じfirstのままで、別の版付き固定projectionだけがexitの進行・局所結果を示す。これを失敗後のenter再開・第2発行の入口にしない。

## 5 prefix別の処理と退役対象の選定

| privateに確認するprefix | duty／許可する固定処理 | 終端・保持 |
|---|---|---|
| not_claimed、use未使用、constructor未呼出し | not_owedのまま。退出試行・退役試行0 | not_entered診断。held_not_started terminalを生成しない。元first／未使用slot保持 |
| claimed_not_issued、実呼出し前の正規checkpoint | 同dutyを一度settlingへ。局所退役はnot_required | body未開始と未呼出しをpost確認できた場合だけsettled_not_started／held_not_started。grant emptyを不存在の一般証明へ広げない |
| 試行予約後だがconstructor直前flag=false | grantAttempts=1でも実呼出しなしとして上段と同じ | 試行予約・計数は払い戻さない。件数だけで分類しない |
| issuer保持後・receiver捕捉前の既知失敗 | B-02が補足した同参照とissuer履歴を再検査し、全関係が正規なら最大1局所退役 | 同targetと元firstを保持。補足済みの参照を別copyへ置換しない |
| 正規provisional、body未開始、first有無を問わない | current=receiver-issued=private issuer、brand＋10field・全originを再検査して同grantを局所退役 | post確認後だけsettled_not_started／held_not_started。正常captureをbody完了扱いしない |
| grant_knownだがcopy／brand／field／origin不正、拒否候補あり | 固定exit guardで正規関係を確認できないので退役成功にしない。候補のmethod／getterを呼ばない | knowledge=knownのままretirement=unconfirmed、duty／exit未確認。全current／issued／rejected／issuerを保持 |
| grant_unknown（実呼出し後、issuer参照未捕捉） | 同dutyの未確認処理を一度記録。対象不明なので退役操作0 | knowledge=unknown・元借用・未捕捉責務を維持。empty／not_required／settledへ昇格不可 |
| 同RunLink／duty関係不一致、capture帰還未確認、body開始の疑い | 不一致の参照を変更せず、必要な責務が未確認であることだけを固定 | 元canonical slot・拒否候補・first保持。新target／新dutyによる補完なし |

本案は意図的に保守的である。valid issuerだけを選び直してreceiver側の不一致を無視する「部分退役」や、不正issuerの登録だけを閉じる成功経路は導入しない。後に必要なら別契約・独立対照が必要。`grant_known`は固定exitへの検査対象だが、全候補が退役成功できるという意味ではない。

## 6 BX00〜04の固定schedule・局所退役の確認点

| ID | 固定処理と前後境界 | 失敗位置の責務 |
|---|---|---|
| BX00 | 先行ExitControlへ進入、同identity・capture帰還・一度限り条件を検査。not_claimedはnot_entered、義務ありは同dutyをsettlingへ | claim前拒否とclaim後故障を別prefixで保持。義務をnot_owedへ戻さない |
| BX01 | private発行履歴・同grant全field／同参照・body未開始・起動禁止条件を再照合。未発行枝は正規未呼出しcheckpointを照合 | 正規の所在が不明ならretirement未確認。knowledgeは独立保持 |
| BX02 | 正規既知枝だけで同ownerのgrant利用禁止latchを閉じ、同targetの局所退役を同期固定し、同状態・同targetをpost再確認 | 禁止latch設定前／設定後／退役記録後／確認後を区別。失敗でも再open・再試行・target消去なし |
| BX03 | body=not_started・outcome=noneを再確認し、局所退役confirmedまたは正規not_requiredと同dutyを結合。未公開terminal slotへ固定 | 未確認ならsettledへ進めない。退役確認済み事実だけは後段故障で巻き戻さない |
| BX04 | 全post後、同duty=settled_not_started／use=exiting／exit=unsealed＋body未開始区分とheld_not_startedを同期確定し、固定値projection | 公開配送失敗は別診断。既に確定した局所事実・同参照・元firstを消さない |

BX02の禁止latchは同private slotの事実で、frozen grant objectのfieldを書き換える操作ではない。将来の全probe利用判定が同latch・同targetを必ず確認する契約を先に置く。本前半に利用可能なbody入口は存在しない。局所退役は同cell／owner内だけの資格禁止で、実OS資源・worker・実writerの解放や停止を表さない。

この局所利用禁止と、利用者からのstop／close要求・元firstは別軸とする。正常な局所退役のための禁止操作を`capturePoint()`の停止例外へ流し、元firstへ新たなclosedを記録する方式にはしない。

局所退役の試行flagは、BX01が正規targetを確認した後、BX02の禁止latch操作直前に同LocalRetirement slotで一度消費する。guard拒否・not_required・unknown枝の局所退役試行は0。dutyの退出試行と局所操作の試行は別費目で、どちらもfault後に払い戻さない。

確認は単なる`grant.stage=revoked`の代入では終わらない。同target、同issuer／receiver参照、禁止latch、同dutyとの結合、capture帰還、body起動経路閉鎖をprivateに再確認してからconfirmedを記録する。正規枝ではgrantのcurrent／issued／拒否履歴を保持したままrevokedとする。不一致枝に同値copyを採用してrevokedへ揃えない。

「probe継続残存なし」は、同capture呼出しが戻り、capture進行flagが閉じ、当該body閉鎖routeにawait／外部hook／body継続を保存するfieldがなく、再入が固定拒否されるという限定された事実として検査する。finally到達、public counter=0、wrapperの旧frame=falseだけでは代用しない。実runtimeのescaped継続なしは依然Unknown。

BX04の同期区間に確保・freeze・通知・hook・awaitを置かず、先行private slotだけを直接更新する。proposalとして同duty／terminalを相互に結合してから確定flagを立て、公開projectionは確定後に生成する。これは**body未開始の局所終端確定点**であり、親(C)のPX05／atomicなaccepted退出確定ではない。

## 7 body未開始の合法状態と失敗時の保持

| 状態 | use／grant／body | 同duty／exit | 許されない昇格 |
|---|---|---|---|
| not_entered | unused／empty／not_started・none | not_owed・未試行／empty | enter済み・body完了・退出確認 |
| settling・既知／未発行 | exiting／正規provisionalまたはempty／not_started・none | settling・退出試行済み／empty | post前のheld成功・body開始 |
| settling・未知／不正既知 | exiting／unconfirmedまたは拒否候補を保持するprovisional／not_started・none | settling・退出試行済み／emptyまたは既存unconfirmed | 局所退役資格・Unknown解消・settled成功 |
| held_not_started・未発行 | exiting・use claim使用済み／empty／not_started・none | settled_not_started・退出試行済み／unsealed、not_required | 未使用への復元、grant退役済みという虚偽 |
| held_not_started・局所退役 | exiting・use claim使用済み／revoked・全参照保持／not_started・none | settled_not_started・退出試行済み／unsealed、confirmed | body returned、settled_unsealed、accepted、finished／確認済みinactive |
| exit_unconfirmed・既知 | unconfirmed／provisionalまたは確認済みrevokedの履歴保持／not_started・none | unconfirmed／unconfirmed、局所confirmed事実は保持 | 既知結果のunknown化、退役未確認の成功化、再試行 |
| exit_unconfirmed・未知 | unconfirmed／unconfirmed・unknown責務／not_started・none | unconfirmed／unconfirmed | 未生成・解放済み・not_required |

状態検査は新たなterminal kind・grant knowledge・local retirementの事実を受け、旧B-01の各状態条件を丸ごと緩めない。上表の新しいsettling枝は同ExitControl=settling・body閉鎖・同identity・退出試行済みを必須にし、grant未確認を任意のexitingへ一般許可しない。`exiting＋settled_not_started＋body not_started`にも専用条件を設け、body完了経路のsettled_unsealed条件は維持する。knownかつ退役未確認の組合せを、生成結果unknownを意味する既存grant unconfirmedの型へ無理にcastしない。具体的なdiscriminated unionはこの表に従って実装時に決め、semantic compile-failで交差禁止を裏付ける。

途中故障では、局所的に完了した事実と全exitの未確認を両方残す。BX02後の記録故障なら再openせずlocal confirmed／known revokedを保持し、terminalだけexit_unconfirmedとする。BX04後のprojection故障ならterminal確定を巻き戻さずdeliveryUnconfirmedだけを追加する。元first／最初の故障位置／最後の完了prefixを相互に上書きしない。

元rootは全参照と未解決責務を保持し、startの借用も継続する。固定discard・外部custody移譲・owner解放は追加しない。局所義務の処理が確認できても、保持・後工程への引継ぎ責務がなくなるわけではない。

## 8 stop・first・再入・結果の契約

| 事象 | 固定規則 |
|---|---|
| stop／closeがenter前 | grant／body追加0、not_owedを維持 |
| stop／capture firstが利用開始後 | 新規開始は閉じ、同private exitだけ最大1回。元firstとprefixを維持 |
| exit中のstop | stopだけを理由に局所退役を中断／省略しない。ただしidentity・履歴の未確認は無視しない |
| 同exitへの同期再入 | exit_in_progressのrefusal。先行first・進行中duty・試行数を変更しない |
| 終端後の重複 | 同じ固定exit結果／診断を返す。unknownからの再試行・別dutyの補完なし |
| exit guard／退役／記録でthrow | frame/exit firstと固定位置に記録し、元capture／producer／probe firstは不変。raw message／stack／causeは非保持・非出力 |
| 通常固定返答が先に存在 | その返答は同一のまま。exit継続まで早期returnする変異を受入試験で拒否 |

現行closeは先行固定返答があればそのまま返す。本書はcloseを新しい実行入口に変更しない。連続private経路が責務を処理し、stop／closeは同latchへ固定要求する範囲だけ。旧request・回収claim・drainは0のまま。

新B-03の公開診断は版付き固定schemaで、元first、exit first、有限phase／boundary／prefix、refusal、knowledge／retirement／terminalの固定enum、同duty保持・参照保持のboolean、試行0／1だけを返す。既存B-02のobligationOwedはuse claim使用済みの指標なので「未解決義務件数」と読み替えず、新診断ではenterUsed／exitAttemptUsed／局所処理結果／保持責務を区別する。private参照・origin派生値・grant／duty・getter・任意key・例外は出さない。

held_not_startedの値summaryは退出候補や後工程の権限ではない。(C)へ渡すprivate受領物は今回作らない。将来body未開始中断を(C)へ渡す必要があれば、body完了型とは別variantと受理条件を別設計する。

## 9 費目所有・構造上限とUnknown

追加ExitControl／retirement／terminal slot、identity guard、履歴検査、同target局所退役、固定診断はgate／frame ownerの費目とする。B-02の既存grant発行・capture／root構築と、旧producer／回収費を再計上しない。private witness・追加slotの生成も無料にせず独立scheduleで数える。

本前半の構造枠は同root・同duty・同時exit各1、duty退出試行≤1、局所退役試行≤1、terminal確定≤1、新body開始=0、新たなexit候補発行=0。全処理は固定BX00〜04の分岐だけで、retry・走査list・再入毎のslot増加を置かない。publicメソッドの無制限な再呼出し全体を有限workと主張しない。

追加slot数・全guard数・unit係数・実allocation layout・OOM・実E／S・共有予算への実課金・全体work上界は未導出のUnknown。実装時にprefix別の計数を独立oracleと比較する。将来の予算接続は既存停止ownerと同開始点のD_stop／D_endを再利用し、別予算・残時間からの期限再計算・期限緩和を行わない。停止後に必要な局所処理の枠は先行予約が必要で、枠不足でも処理済み・解放済みと断定しない。

## 10 独立合成受入条件

以下は未実施の条件。期待値は本体のprefix builder／state表／counterからimportせず、独立イベント列・元順序・private sentinelで計算する。

| ID | 受入条件・単独負の対照 |
|---|---|
| FX01 | 同root／start／binding／cell／RunLink／dutyのcurrent・issued各関係を個別に混入。参照同一性とfield不正を分け、拒否phase・退出試行・退役操作回数を検査 |
| FX02 | not_claimed／claimed_not_issued／予約済み未呼出し／issuerのみ保持／正規provisional／不正既知／grant_unknownの独立表。known集約・unknown成功化・callStartedとattempt件数の混同を検出 |
| FX03 | 先行first／stop／closeをcapture前後とBX00〜04へ配置。同dutyの必要処理が短絡されない。元first・通常固定返答同一性を保持 |
| FX04 | BX00〜04のbefore／after、BX02の禁止前／禁止後／退役記録後／post確認後に個別故障。最後の完了prefix・全参照・同duty・局所事実を独立比較 |
| FX05 | 退出進行中再入・終端後重複・identity拒否後の再要求を分離。第2試行・claim払い戻し・新duty・再open・同値copy採用を検出 |
| FX06 | brand＋10field／current・receiver-issued・private issuerの各単独不一致。不正候補はknown保持だが退役成功0。候補method／getter実行0 |
| FX07 | 正規未呼出し枝はretirement not_requiredであってrevokedではない。body未開始・同capture帰還・閉鎖routeを確認し、counterだけ／finallyだけ／revoked代入だけの成功化を検出 |
| FX08 | held_not_startedとsettled_unsealedを区別。body returned／active／accepted／finished／確認済みinactiveの混入を値検査とsemantic compile-failで拒否 |
| FX09 | 局所確認後の記録故障とterminal確定後のprojection故障を分離。confirmed事実・元first・元参照は保持し、配送故障で再退役しない |
| FX10 | 同参照を実際に保持した全返答graphの固定schemaを検査。current／issued／rejected／duty／terminal参照・symbol・関数・getter／例外の漏洩変異をscratch内だけで検出 |
| FX11 | 旧factory／facade／seed拒否・旧B-02試験不変。body／generationFrame／旧request／drainへの到達をscratch sentinelで拒否し、追加試験入口の梱包混入0を確認 |
| FX12 | unknown・未確認・未封印から(C)候補・cleanup証拠・RootStopAck・GateClosedRecord・Journal供給・root終端・全体受付へ昇格する経路なし |

compiled単独変異は「最終的に失敗した」だけでなく、狙ったguardを外した時の到達点・局所操作回数が変化する対照を用意する。二重防御・未到達節は単独保証と区別して記録する。診断試験は既知data descriptorを検査し、検査側が未知getterを実行しない。synthetic sentinelだけを使用し、実鍵・token・実session・実通信は使わない。

body return／throw／cancelの直積、BE05 active後故障、実body帰還・継続残存なしは後半の未実施条件として残す。前半のbody未開始試験をそれらの成功に読み替えない。

## 11 次の実装分割と本書の検証範囲

| 順序 | 合成依存だけの実装候補 | その段階で閉じるもの |
|---|---|---|
| B03-A | 同dutyの有限phase／ExitControl・三軸値契約・先行slotとprivate結合、固定拒否／projection | 退役実操作・terminal成功・body・正式証拠 |
| B03-B | 安定identity＋履歴guard・一度限りsettling、正規未呼出し／known／unknown／不正の分岐 | body・(C)・旧request／drain。既知性と退役確認を分離 |
| B03-C | 同target局所退役・全post・body未開始terminal、同start capture→固定exitの連続試験・compiled対照 | body開始・active・(C)候補・同期exit確定・正式証拠 |
| 後半・別承認 | 全unwind経路を揃えてからBE05／06の固定probe、return／throw／cancel・active後故障を同じ変更で検証 | 実writer・実接続と(C)以降は引き続き別工程 |

本書と親2文書の参照だけを更新する。今回の検証はローカルリンク・ID／scheduleの文書整合・差分空白・source／試験内容の不変確認に限る。ビルド・合成／compiled試験・body起動は行わず、受入条件を成功済みにしない。未コミット、Pushなし。

文書検証結果：3文書のローカルリンク20件に欠落なし、FX01〜12の12条件とBX00〜04の5段階に重複・欠落なし、差分空白エラーなし。開始時からcomposition fixture・B-02試験・同compiled fixtureのSHA-256が一致することを確認した（順に`ff07a0a249fc3b914e5ae38b4279dd835dec4e59b9e6e28361b2e9506c0f288d`、`b6a57616cd7a19cc9db3642d2d7f75634491435aabff905a2652e7c3a822eee3`、`2baa15df55334f22876f7025877701439157c5c8867f0966f276dd7557d82411`）。これは文書と変更範囲の検証であり、未実装exit／退役の試験成功ではない。

## 12 B03-A限定実装（2026-11-10）

§11末尾は設計作成時の記録（`297570a`でコミット）。今回は同composition lexical root・既存CanonicalGateDraftRoot／RetirementStartAssemblyを再利用し、新`createProbeExitPreparationFake`だけを追加した。旧factory／facade／B-02の同grant捕捉と既知prefix分類は維持する。公開methodはprepare／check／checkLegacy／checkAxes／close／inspectで、enter／exit／settle／retire／任意body・artifact登録口はない。

追加先行scheduleは1 idle ExitControl、2 not_attempted LocalRetirement、3 unobserved BodyAbsence、4 none NotStartedTerminal、5同参照bundleの5段階。同rootの既存failure shell・固定診断fieldを先行させ、既存37＋8＋4段階・同RunLink／duty結合後に追加slotを生成／捕捉する。各段階before／attempt／after／done／checkと最終bind／postの27点を固定し、最後の受領postまでreadyを立てない。これは実allocation数や実Eの確定ではない。

slotは同duty／controlへ直接結合する。controlはbrand／link／duty／binding／cells／同start／idle／captureReturned=falseの8要素、retirementは6要素、absenceは5要素、terminalは7要素、bundleはbrandを含む8要素。rootのcurrent／issued同参照・固定field数・全関係を段階ごとに検査し、同startもbundleを一度だけprivate捕捉する。初回拒否候補・部分生成prefix・受領後post失敗の借用を保持し、二重bindは何も置換せずrefusalとする。

同既存FixedExitDutyのphaseをnone／guard／history／retire／record／project、boundaryをnoneまたはbefore／afterへ有限化し、none/noneと非none/before-or-afterの組合せを型で分離した。値専用のExitControl状態型・GrantKnowledge／LocalRetirement／BodyAbsence／terminal型は将来の合法variantを表すが、live control／retirement／absence／terminal slotの型と生成関数はidle／not_attempted／unobserved／noneだけ。dutyはnot_owed・attempt未使用・none/noneから動かず、body未開始の確認証拠すら生成しない。

checkAxesは50固定shape（適合9・不適合41）と10個のphase/boundary適合対照を純粋検査し、authority=none・value_only・validだけを返す。held_not_started／held_unsealed等が適合する値例でも、同rootのslotへ採用せず、成功terminal・proof・後工程権限にしない。生成結果known、退役未確認、body未観測を別軸として扱う。既存B-01の状態検査は変更していない。

新projectionは全fieldを明示した有限plain dataで、参照は保持有無booleanだけ。既知不正slotのused／blocked／started／returned等の故障値を隠さず保持するが、ready=false・binding_mismatchであり実操作の証明ではない。実操作計数と別に扱い、terminalの不正accepted候補はacceptedRetainedだけへ投影し、exitAcceptedはfalse固定。全返答・拒否・closeの先行firstとprefixを保持する。任意object／Proxy／callbackはhookを実行せず拒否する。

FX01の先行結合・混入、FX02の三軸値区別、FX03〜05の構築故障／stop／再入／重複結合、FX08の値・型上の交差禁止、FX10〜12の参照非出力・旧経路閉鎖を部分検証した。188新試験・関連1,547件・compiled14本・strict／build／lint・梱包の結果と初回問題は[検証記録](E2E_BEST_PRACTICE_WFB_PROBE_EXIT_PREPARATION_2026-11-10.md)。BX00のsettling・実履歴供給・固定exit継続、局所退役・terminal成功・BE05／06・(C)・実会計は未接続。実E／S・work／layout／OOMはUnknown、全体受付は無効のまま。

## 13 B03-B限定実装：安定identity・履歴guardとsettling（2026-11-10）

新`createProbeExitGuardFake`だけが同既存root／start／RunLink／dutyとB03-Aの先行5slotを利用する。B03-Aのimmutable controlは同一性anchorのまま保持し、同controlへ直接結合したprivate進行cellを1つ先行生成・捕捉・同startへ結合してからreadyにする。進行cellは別owner／別duty／別予算ではない。旧controlのidle型を広げず、旧Aのclosed入口・試験・projectionのnot_created／unconfirmed規則を維持する。

新APIはprepare／run／check／checkLegacy／close／inspect。runは同start wrapperのprobe_guard経路から既存B-02 captureを最大1回呼び、その実帰還後に同private guardへ進む。capture firstや固定失敗返答を再開・消去せず、その返答自体も同進行cellに保持する。任意artifact／body／callbackの登録口はない。checkとcloseはrunにならず、seed付き旧prepare・旧body／finally／requestは閉鎖のまま。

固定順序はcapture before→capture実帰還→return after→identity before/after→history before/after→claim before→無allocationの同duty settling固定→claim after→branch before/afterの10観測点。exit処理では通常enterのfirstなし・stopなし・not_owed条件を再使用しない。安定guardはcurrent／issued進行cell・同bundle／control／link／duty／binding／cell束・gate／scope／owner／pin／epoch／packet／frame／entry／exitを照合する。body未開始・capture帰還と非進行中・回収claim未使用・use/duty phase・空候補／acceptedなし・局所退役前を別の履歴境界として照合する。

privateなconstructor呼出し直前flag、issuerの保持参照、current／receiver-issued／rejected、同grantの全fieldを使い、未呼出し／known／unknown／不正を分類する。予約件数やpublic prefixを発行証拠にしない。not_claimedはnot_entered診断のみでduty claimを消費しない。正規未呼出しとknownは同dutyをsettlingへ進めたまま保持する。unknown／不正既知も、安定identityと履歴境界を確認できる場合だけ同dutyの一度限り試行を記録し、未確認で停止する。知識unknownはunknown、既知の不正候補はprovisional／unresolved=falseと全参照を保持する。identity／body境界自体の不一致はclaim前に停止し、canonical dutyを変更しない。

利用開始時のuse claimと退出試行時のduty claimは別。後者の開始点で同dutyのstate=settling／attemptUsed=true／guard-afterとuse=exiting、進行cellのexitUsed mirrorを同期固定する。mirrorは第2の利用資格ではなくprefix診断用で、独立対照でcanonical dutyとの一致を確認する。途中故障はclaim前後を区別し、claim後だけ同canonical duty／use／exitを未確認へする。claimを払い戻さず、grant生成結果の既知性や先行firstを消さない。再入はrun_in_progress、完了した一度のrunは同一の固定返答で再実行しない。失敗後の参照破棄・owner解放も追加しない。

正規分岐でも返答はok=false／settling_heldで、成功terminalではない。retirement slotはnot_attempted、body確認slotはunobserved、terminal slotはnoneのまま。局所退役、not_requiredの確定、settled_not_started、held_not_started、accepted／finished／確認済みinactiveは生成しない。stopは新規captureを閉じるが、既存使用後のguardを止める条件にはせず、元capture firstとguard firstを分離する。

新projectionはA全体の固定0計数を流用せず、anchor部分と実進行を分け、発行／試行数と保持booleanをprivate状態から投影する。未生成はnot_created、許可外はunconfirmed。private first／参照を外へ出さない。identity17条件、capture後のgrant14条件、履歴境界9条件のcompiled対照、呼出し境界／unknown誤昇格／first短絡／再入／非返却／参照保持／二段projectionの負の対照、型拒否5件を追加した。76新試験・関連1,624件等は[検証記録](E2E_BEST_PRACTICE_WFB_PROBE_EXIT_GUARD_2026-11-10.md)。B03-Cの実退役・全post・terminal確定、BE05／06、(C)、実会計・全体受付は未接続／無効、費用・実E／S・layout・OOMはUnknownのまま。

公開projectionの既定値規則：slotやreceiverが存在しない場合は`not_created`、存在するが許可値外の場合は`unconfirmed`とし、`not_owed`・`unknown`等の肯定的または意味を持つ状態へ既定値化しない。dutyの許可値には本書で追加した`settled_not_started`を含める。prepare前のinspect、許可値外dutyの注入、`settled_not_started`の注入を独立対照で確認する。
