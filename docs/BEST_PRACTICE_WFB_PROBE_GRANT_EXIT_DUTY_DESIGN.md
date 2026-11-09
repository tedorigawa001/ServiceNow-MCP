# WF-B (B)：内部型・one-shot enter／grant捕捉・固定exit責務・公開診断の接続差分

Version: draft-0.3 / Date: 2026-11-10 / 読み取り基準HEAD: `75adab5`（B-01レビュー修正基準HEAD: `0c9e99b`、B-02レビュー修正基準HEAD: `ba84ea4`）。

draft-0.3のレビュー修正：B-02は使用開始後の失敗を理由・境界によらずuse／duty／exit（試行後はgrantも）unconfirmedへ集約しており、§6・§7の「BE01後・BE02前はowed duty＋正規未発行checkpoint」「provisional拒否でも正規履歴の範囲で固定退役」とBG07の区別に反していた。完全に既知の拒否grantまで`unknownObligation`となり、B-03の固定退役を不能にしていた。§13で失敗prefixを3分類に直した。

draft-0.2のレビュー修正：B-01の状態関係判定`probeStateFactsValid()`は19条件中14条件が単独検証されていなかった（既存の不適合shapeが先に評価される別条件で拒否されていた）。§12へ、適合基点から1事実だけを変えた単独不適合shape13種とcompiled単独変異を追加したこと、`duty === 'not_owed'`の一律拒否が等価であることを明記した。

Status: **B-01の先行準備・固定projectionと、B-02の一度限りenter／同grant捕捉・失敗prefix保持を合成依存限定で実装。** B-01は§12と[その検証記録](E2E_BEST_PRACTICE_WFB_PROBE_RUN_PREPARATION_2026-11-10.md)、B-02の基準HEADは`30d91c0`、詳細は§13と[その検証記録](E2E_BEST_PRACTICE_WFB_PROBE_GRANT_CAPTURE_2026-11-10.md)。親は[同startのenter／exit接続差分](BEST_PRACTICE_WFB_PROBE_FRAME_ENTER_EXIT_DESIGN.md)と[正規gate生成・継続入口](BEST_PRACTICE_WFB_GATE_ROOT_CONTINUATION_DESIGN.md)。(A)の実績は[先行cell／同binding検証記録](E2E_BEST_PRACTICE_WFB_PROBE_FRAME_PREPARATION_2026-11-10.md)。内部grant候補の発行・provisional捕捉までで、active資格・probe body・退出記録は未実装。

正式発行口・C実行入口閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。当初作成時は文書のみ、その後の実装・ローカル検証は§12〜13の限定範囲だけ。本書だけでbodyや実接続を承認しない。B-02で合成専用内部grant候補を最大1回発行するが、正式permitや実writer資格ではない。新probe body起動・実接続・実通信・設定変更・Pushを行わない。実writer、request／close実合流、回収claim消費、Journal封印／供給、admission／packet／field clear、GateClosedRecord、root終端も閉鎖のまま。

## 1 (A)との差分と(B)／(C)の分割

現行`ProbeUseCell`はunused／attemptUsed=false、grant／exit cellは参照undefinedだけの型で、実行後の状態を表せない。`frameBoundary`はseed付きstartとprobe_closedをbody前に拒否する。`checkFramePreparation`は先行固定失敗返答があれば処理を返し、inspectは空cellを浅くcopyしている。空の現状から参照漏洩を断定しないが、このままgrantを格納してはならない。

(B)の変更順は、状態型・固定退出責務の先行準備→参照非出力の診断→one-shot enter／grant捕捉→固定probeと退出責務の連続接続とする。新bodyを起動する前に、正常・throw・取消・active後故障のすべてで固定退出処理へ合流する経路を用意する。enterだけを有効化した中間実装ではbodyを閉じる。

(B)で扱う退出は、同grantの局所退役確認と責務の保持まで。正常でも`held_unsealed`（未封印保持）であり、accepted退出記録・finished／確認済みinactiveを生成しない。(C)が親設計PX04〜05の候補受理・同期確定を実装する。局所退役確認と、(C)の確認済みexit・全writer停止・cleanup完了を混同しない。

## 2 配置・private供給と実行入口

同composition lexical root内で、既存ProbeFrameBinding／cell束／同startを再利用する。第2start・第2gate・新scope／epochによる補完をしない。pure WriterGate fakeのbrand・ledger・summaryは別物のまま。新grantはprivateなprobe専用brandで、実payload writerの資格を持たない。

既存seed拒否を単に削除しない。旧seedなしprepareは従来経路、seed付き旧prepareとprobe_closedは恒久拒否を維持する。将来の実行継続は、同start wrapper内の固定private probe入口からのみ、同bindingと先行退出routeを検査して選択する。publicなmode／boolean／任意callbackでbodyを選ばせず、`check()`／`checkLegacy()`をrunnerに変えない。非実行draftの`executable=false`も変えない。

合成実行入口を後に追加する場合は、梱包除外の明示的な新試験入口に限定する。固定scriptと値診断だけで、grant／binding／exit route／任意bodyの登録・返却をしない。旧(A)入口・旧facade・旧試験の保証は維持する。新入口が同start wrapperへ合流することを経路で検証し、似た別assemblyだけで代替しない。

## 3 内部型と整合条件

以下は未実装の型契約。内部実行phaseと公開診断型を分け、`unknown`値のcastで正規参照を補わない。

| 型／slot | 固定内容と合法状態 | 生成／保持・制限 |
|---|---|---|
| ProbeRunLink | private brand、origin、同binding／cell束／frame origin／entry／exit origin、同startへのprivate継続結合 | 同rootがenter前に1つ生成・捕捉しstartも同参照を保持。scope／epochは既存値。外部採用なし |
| ProbeUseStateB | unusedかつattempt未使用、またはentering／active／exiting／unconfirmedかつattempt使用済み | 同cellが唯一の進行元。finishedは(C)専用で(B)の生成関数から除外 |
| CanonicalProbeGrant | private brand、bindingOrigin、gate origin、owner origin、pin、epoch、frame origin、draft、entry／exit origin、phase=probe_only | brand＋固定10field、最大1発行試行。bindingOriginは同RunLinkのorigin。start／source／payload／関数はfieldに入れない |
| ProbeGrantStateB | empty／attempting／provisional／active／revoked／unconfirmed、current／issued／拒否候補、未捕捉責務 | emptyは参照なし。provisional以降は捕捉済み参照を保持し、revokedでも消去しない。unknownをemptyへ戻さない |
| ProbeBodyStateB | not_started／running／returned／threw／cancelled／unconfirmed、固定outcome | 正規固定bodyの実到達で記録。単なるscriptラベルで完了を作らない。raw例外なし |
| FixedExitDuty | not_owed／owed／settling／settled_unsealed／unconfirmed、同RunLink、消費済みflag、phase／boundary | 同ownerの先行slot1つ。attempt使用開始時にowed、退出試行は最大1。再入と再試行を区別 |
| ProbeExitStateB | empty／unsealed／unconfirmed、局所退役確認、body帰還確認、未解決責務 | acceptedは常にundefined。候補／受理済み証拠の発行は(C)まで閉鎖 |
| ProbeFailureStateB | construction／producer／probe／gate／frame各first、refusal、最初の故障位置、未解決責務 | 先行固定slot。firstの上書き・動的履歴list・raw例外参照なし |

型の制約として、attempt未使用とentering、grant未activeでのbody実行、revokedとgrant使用可能、settled_unsealedとacceptedありを合法な組合せにしない。active確定後・body開始前の短い区間は存在するが、そこへの故障はbody未開始のまま固定unwindへ渡し、外部の実行資格にはしない。provisional grantは実行資格ではなく、active時だけ同private継続がbody状態をrunningへ進めて固定bodyを呼べる。

RunLinkとFixedExitDutyは(A)の先行shell／空保持slotを起点に構築するが、現行8段階成功を追加生成済みと読み替えない。RunLink自体に関数fieldや任意callbackを持たせず、同startの固定lexical継続だけから参照する。将来の固定追加scheduleで、RunLink生成→捕捉→同start受領→同参照確認→dutyの未使用確認を記録し、すべてのpost確認後だけenter可能にする。具体的allocation・生成呼出し数・費用は実装時に独立検証する。

## 4 二つのguardと固定退出権限

**通常enter guard**は同rootの構築post、同binding／seed／target／pin／draft current・issued、同start内部owner／claim／binding、正規scope／epoch／packet／frame／entry／exit、gate open・stopなし、unused、追加slot確認済みを検査する。constructionの固定失敗・stop・混入・重複時は新規開始を拒否する。

**固定exit guard**は、同ownerが先に捕捉したRunLink／duty／binding／cell束・同grantの発行履歴・現在phaseを照合する。元firstや通常受付の停止だけを理由に必要な退役確認を省略しない。外部から渡されたbindingやgrantでこのguardを呼ばせず、同startの固定unwind継続だけが利用する。

exit guardは失敗を無視する迂回口ではない。同参照や履歴を確認できなければ未確認責務を保持して停止する。許すのは既存grantの退役確認・固定診断記録だけで、新grant・第2body・accepted退出記録・request／drainを呼ぶ権限は持たない。`#fixed`の返答を返す処理と、退出責務を処理する継続を分離する。

現行`probeMatches()`は`constructionMatches()`の正規回収claim未消費条件も含む。enter前は利用できるが、将来のexit検査をそのまま委譲しない。安定したidentity検査とphase別claim状態を分ける。(B)では回収claimはunusedのまま。将来request合流で正規spentが発生する場合は、別originのspentや二重消費を受理しない追加契約が必要。

## 5 one-shot enter・同grant捕捉の固定順

| ID | 同期操作・保持 | 故障／拒否時 |
|---|---|---|
| BE00 | 参照非出力projection、RunLink／dutyを含む先行slotのpost確認と通常enter guard | grant=0／body=0。元firstとprefix保持 |
| BE01 | attempt使用済み・use=entering・duty=owedを無allocation／hook／awaitで同期固定 | **利用開始点**。以降unused／not_owedへ戻さない |
| BE02 | grant slotをattemptingへ固定し、同RunLinkの固定constructorを最大1回呼ぶ | 呼出し後未捕捉はunknown責務。第2発行なし |
| BE03 | 同返却物を先行slotへ直ちにprovisional捕捉し、current／issued／拒否候補を保持 | 捕捉失敗をgrant未生成に変換しない |
| BE04 | brand・固定field数・current／issued同参照・全11要素と正規origin関係を個別照合しpost確認 | 不一致ではbody=0。固定exit guardで扱える正規履歴だけを処理 |
| BE05 | 同grant／同cellのactiveを同期固定。dutyと同start wrapperの固定exit経路が到達可能であることを最終確認 | active後故障でも退出責務は消えない |
| BE06 | 同start wrapperから固定probe bodyを最大1回だけ呼び、制御帰還／固定例外／取消を捕捉 | 必ず同private unwindへ合流。旧generationFrame／旧requestは呼ばない |

BE01とBE05を通知・任意hookから観測可能な部分更新にしない。同期sectionの保証が不明なら新bodyを起動せずUnknownで止める。grant objectが返っただけではactiveへ進まない。重複enter／再入は副作用のないrefusalとし、進行中の正規退出・先行firstを壊さない。

BE06は「固定exitが完成していなくてもbodyを試してよい」という許可ではない。初期実装ではBE05／06を閉鎖し、BE01〜04と失敗時の保持だけを試験できる。後にBE06を接続する同じ変更で、次節の固定unwind全経路を接続・検証する。

## 6 固定exit責務と(C)への境界

| ID | 固定操作 | 結果の意味 |
|---|---|---|
| BX00 | 同dutyを一度settlingへ進め、固定exit guardとbody開始／帰還履歴を確認 | 退役確認の開始。新bodyは閉じたまま |
| BX01 | 捕捉済み正規grantのcurrent／issued・同bindingOrigin／frame／pin／epoch／exit originを再照合 | 不一致／未捕捉ならunconfirmed、参照を保持 |
| BX02 | 同grantの局所資格をrevokedへ同期固定し、その退役状態とprobe継続の残存なしを確認 | finally到達やcounter=0だけでは代用しない |
| BX03 | body結果・退役確認・残る責務を別slotへ固定し、duty=settled_unsealedまたはunconfirmedへ進める | (B)はaccepted=undefined、finished不可 |
| BX04 | 固定値projectionから未封印／未確認結果を返し、同ownerにRunLink・grant・body結果・dutyを保持 | 新規開始は閉鎖。実drain／借用退役／解放完了は0 |

正常return、固定throw、固定cancelでも同じunwindを通る。throw／cancelの元probe firstは局所退役確認成功で消さない。退出処理のthrowはframe firstへ固定し、元producer／probe理由を上書きしない。再入unwindは進行中refusalで、二度目の退役・別dutyを作らない。終端後は同じ固定結果であり、未確認からの再試行昇格をしない。

body未開始の場合は別prefixとして扱う。BE01後、grant constructor呼出し前と正規に確認できればgrantなしのenter中断を記録できるが、それはbodyを実行して退出した記録ではない。constructor呼出し済み未捕捉ならunknownのまま。provisional捕捉済み・active未達の失敗でも、正規履歴を確認できる場合だけ同grantの局所退役を試みる。foreign候補のmethodやgetterを呼ばない。

物理的にwrapperから戻ったことと、実行資格の確認済み退出を分ける。将来必要なら`wrapperOnStack`を独立した内部事実として記録するが、これがfalseでも(C)前に`frame=inactive`／finishedを成功公開しない。旧legacy finallyの`#frame=false`・`#frameExits++`、旧catchの`failFrame()`／`request()`をprobeへそのまま適用しない。旧経路の意味は維持する。

(C)は同ownerのsettled_unsealedなduty／局所退役済みgrant／同frame・body結果をprivateに受け、追加pre/post検査後に親設計PX04〜05の候補生成・一度限り受理・同期確定へ進む。公開summaryや`held_unsealed`という文字列から復元しない。unconfirmedやunknown prefixは成功入力へ昇格しない。(B)の内部返答をFrameExitRecord・GateClosedRecord・cleanup証拠・RootStopAckとして扱わない。

## 7 所有・失敗prefix・診断保持

| prefix | 元rootが保持するもの | 失敗後に許すこと |
|---|---|---|
| RunLink／duty準備途中 | 先行shell、捕捉prefix、元start／binding、未捕捉責務 | 固定拒否と値診断のみ。第2routeで補完なし |
| BE01前拒否 | 同canonical参照・元first、未使用の実行slot | 新規開始拒否。別scope／epochで再生成なし |
| BE01後・BE02前 | used attempt、owed duty、正規未発行checkpoint | 同prefixを固定。未使用への復元なし |
| grant呼出し後未捕捉 | attempting slot、unknown grant責務、元借用 | 未確認保持。不存在や解放済みとしない |
| provisional拒否／active前故障 | 正規issued／拒否候補・duty・元first | 同正規履歴を確認できる範囲の固定退役のみ |
| active／body故障 | 同grant／body帰還履歴、probe first、固定exit継続 | 退出guardを短絡せず最大1回unwind |
| BX02後・BX03未確認 | revoked履歴・元参照・未確認duty | finished／inactive成功を出さず保持 |
| settled_unsealed後 | 同RunLink／退役grant／body結果／同duty | (C)契約まで保持。借用退役・custody移譲・cleanup成功なし |

先行rootが正規custodyで、startは同cell／RunLinkを借用する。root返答生成・通知・projectionの故障でも元参照とfirstを消さない。未解決実行／借用責務より先にownerを破棄しない。今回fixed discard・外部custody移譲は追加せず、将来移譲契約ができるまで保持する。診断のためにprivate origin・grantを値objectへcopyしない。

## 8 公開診断：grant格納前に置換する固定値契約

現在の(A)はgrant／exitの参照がundefinedなので浅いcopyでも参照は出ない。(B)では最初の参照代入より前に固定allowlist projectionへ置換する。root.inspectだけでなくprepare／run返答・check／close・拒否／故障返答・上位保持結果も対象。`Object.freeze`、spread、JSON stringify／parseによるcopyは非出力保証ではない。

| 公開区分 | 許可する値 | 禁止する値 |
|---|---|---|
| identity診断 | model／schemaの固定版、同一性検査の固定enumまたはboolean | owner／gate／pin／scope／epoch／frame／draft／RunLinkの実値、参照を識別できる派生文字列 |
| use | 固定phase、attemptUsed、refusalの固定enum | cellそのもの・実行継続・grant資格 |
| grant | stage、currentRetained／issuedRetained／rejectedRetained、unknownObligation、局所退役確認のboolean | current／issued／rejectedのobject、private symbol、関数、getter |
| body／exit duty | 固定outcome／duty状態、body帰還確認、localRevocationConfirmed、exitAccepted=false | raw例外・stack・cause・戻り値、候補／accepted record／binding参照 |
| failure／prefix | 固定first／phase／boundary、有限stage列、表現上限内の計数 | 任意message・script原文・本文・token・URL・ログlist・動的key |

public結果はplain dataの新しい有限objectで、全fieldを明示的に生成し、ネスト部分も固定値だけでfreezeする。private cellからのspreadや再帰serializeは禁止。optional fieldも固定schemaで定義し、任意object／例外のhookを呼ばない。不正入力の診断に入力値を埋め込まない。履歴列や失敗ごとのobject listを増やさず、重複要求でも固定slotを使う。

旧(A)入口・旧factoryは旧保証を維持し、grantを入れ得ない旧経路の互換表示と、新(B)入口の版付き固定projectionを区別する。将来新B snapshotのfieldを旧Aの空cell copyへ逆流させない。互換上残すundefined fieldがあっても、その場所へ実objectを格納しない。publicなphase／同一性booleanからprivate grant／RunLinkを復元するAPIは作らない。

## 9 停止・予算と費目所有

停止は新enterを閉じるが、既存owed dutyの固定退役確認を妨げない。stop／close要求を使う将来の合成対照も、同rootの固定latchとpending診断だけに限定する。旧start.request／closeを呼んで回収claimを消費せず、drainは最大1の未消費pendingとして保持する別工程。(B)でrequest実合流を試験済みにしない。

RunLink／duty先行構築、guard、grant生成／捕捉／退役、診断projectionはgate／frame ownerの追加費目。旧producer・回収費を二重所有しない。grant生成試行≤1、body開始≤1、固定unwind試行≤1、同時frame≤1を構造枠とする。拒否／projection呼出し数、追加schedule・unit係数・guard総数・実allocation layout・実OOM・bootstrap実E／SはUnknownで、構造枠を全体work上界へ昇格しない。

共有予算・停止ownerへ将来接続する際は既存D_stop／D_endと同開始点を引き継ぎ、別予算・残時間からの期限再計算を持ち込まない。(A)のpure fakeを実会計・native費用の検証済み証拠にしない。

## 10 独立合成受入条件（実施範囲は§12〜13）

| ID | 受入条件・負の対照 |
|---|---|
| BG01 | 同root／start／binding／cell束／RunLinkと旧wrapperの経路を確認。第2startやpure fake grantで補完する変異を拒否 |
| BG02 | 合法／不正状態組合せを独立表で検査。attempt未使用＋entering、provisional使用、revoked使用、acceptedありの(B)結果を拒否 |
| BG03 | RunLink／duty準備とBE00〜06の前後故障で捕捉prefix・attempt・dutyを比較。使用済み復元、第2grant／bodyを検出 |
| BG04 | grantのbrand＋10field・current／issued同参照を一条件ずつ混入。後段guardにmaskさせず拒否phaseと実呼出しを固定 |
| BG05 | 重複enter／enter中再入／unwind再入／終端後再要求を区別。副作用0・先行first保持と正規退出可能性を確認 |
| BG06 | return／throw／cancel×body帰還確認／退役確認／退出未確認の直積。first guardによるexit省略、旧requestへの迂回を検出 |
| BG07 | grant未捕捉と正規未発行checkpoint、provisional拒否とactive後故障を区別。unknown→empty、返答件数だけで退役成功とする変異を拒否 |
| BG08 | BX00〜04の各故障で参照・duty・元first保持。finally／counter／revokedだけのfinished／inactive／accepted化を拒否 |
| BG09 | 全公開返答を固定schemaで検査。private sentinel参照・symbol・関数・getter・raw例外・任意keyの混入、浅いcopy／freezeだけの変異を検出 |
| BG10 | retained grant／bindingのprivate sentinelを公開object graphへ入れる負の対照。保持有無booleanだけならidentityを復元できないことを確認 |
| BG11 | stopをBE01前／grant未捕捉／active／exiting／unsealedへ配置。新規開始なし・固定unwindのみ・回収claim0・実drain0を確認 |
| BG12 | 旧(A)・旧facade・旧合成試験と梱包除外を維持。grant／route登録口、checkの暗黙runner化、seed付き旧prepareの再開を検出 |
| BG13 | 参照格納前のprojection置換と先行duty捕捉を必須にする。どちらか欠ける時はbody／grant開始0 |
| BG14 | (B)の正常返答もheld_unsealed、acceptedなし。summaryから(C)証拠を復元する変異と正式発行・全体受付の有効化を拒否 |

oracleは本体のbuilder／state表／counterを期待値へimportしない。固定semantic eventsとsentinelで試行・捕捉・使用・退役を独立に記述する。compiled対照では最初の拒否点・実操作回数を検証し、同じ最終失敗だけで前段guardの保証にしない。公開graph検査は既知の固定data propertyを対象にし、検査自体が未知getterや任意hookを実行しないようにする。

private参照の負の対照が必要なら隔離compileしたscratch内だけにsentinel観測を挿入し、配布sourceやfixtureにartifact登録／昇格exportを追加しない。秘密非出力試験もsynthetic sentinelだけで、実token・実session・実通信は使わない。

## 11 実装分割と今回の文書確認

将来の順序は、B-01=状態型／RunLink／dutyの先行準備と固定projection（実行閉鎖）、B-02=一度限りenter／同grant捕捉とprefix保持（body閉鎖）、B-03=同start固定probeとBX00〜04の連続接続、その後に(C)の確認済みexit候補・同期確定。B-02もgrantを作ったまま放棄する契約ではなく、同duty／固定退役責務と元ownerへの保持が必要。B-03は全unwind経路が揃う同じ変更でのみbodyを試験する。今は全工程未実装・未承認実行のまま。

本書と親2文書の参照だけを更新した。ソース・試験・CHANGELOG・設定は変更していない。3文書のローカルリンク17件に欠落なし、BG01〜14の14条件に重複・欠落なし、BE00〜06の7段階とBX00〜04の5段階の順序、差分空白を確認した。composition fixture・probe-frame-preparation試験・同compiled fixtureの3ファイルはSHA-256が開始時と一致する。これは文書整合の確認であり、(B)の試験成功ではない。ビルド・試験・body起動は未実施。本MD変更は未コミット、Pushなし。

## 12 B-01限定実装（2026-11-10）

§11末尾は当初文書化時の記録（後に`345e114`でコミット）。今回は同composition lexical rootと同startに、状態型・先行RunLink／duty・固定projectionだけを追加した。型はunusedとattempt未使用、entering以降と使用済み、body結果と固定outcome、grant状態と参照有無等を分離する。CanonicalProbeGrantはprivate型だけで、constructor／issuerは存在しない。内部退出cellのacceptedは常にundefined、finishedを生成する型／関数は置かない。

新factory `createProbeRunPreparationFake`は(A)の同root・cell束・同ProbeFrameBindingを再利用する。旧(A)・旧facade・旧pure fakeは変更せず、新factoryだけをcompositionの試験用export一覧に追加した。公開APIはprepare／check／checkLegacy／checkState／close／inspect。enter／grant／unwind／任意callbackの登録口はない。checkStateは有限scriptの状態事実または現在の未使用事実を純粋検査する値専用口で、その結果を実cellへ採用しない。

追加4段階は1 bindingOrigin、2 RunLink、3 not_owed duty、4非実行準備descriptor。既存37段階＋(A)の8段階の構築・同binding照合後に、この4段階を生成／捕捉する。RunLinkはbrand＋origin／binding／cells／frame／entry／exitの7要素、dutyはbrand／link／state／attemptUsed／phase／boundaryの6要素、準備descriptorはlink／duty／executable=falseの3要素。すべて同rootのcurrent／issuedと正規fieldを個別照合してから、同startへ最大1回結合しpost確認する。これはroot sealや退出証拠の発行ではない。

RunLink／dutyは同rootが保持し、startも同private参照を捕捉する。二重bindはrefusal、同値copy・foreign fieldは固定失敗で、捕捉済みprefixと借用を消さない。4のpostまでreadyを立てず、ready後もexecution=closed。構築readyはenter受付や利用claim消費を意味しない。useはunused、grant／exitはempty、bodyはnot_started、dutyはnot_owedのまま。BE01〜06／BX00〜04の実遷移・固定exit guard・grant発行・body・退役・accepted退出記録は未実装。

新入口の全返答はallowlist値projection。private cellのspread／serializeを使わず、grant current／issued／拒否候補、退出候補、RunLinkは保持有無booleanだけを返す。各enumは固定許可値へ限定し、snapshotのネストもfreezeする。旧(A)の空cell表示は旧入口だけに残し、B-modeで旧inspectを呼ぶと拒否する二重防御を置いた。公開入口は常に新projectionを使うため、この旧inspect拒否は通常経路では未到達である。

BG01の先行同root結合、BG02の型／値整合、BG03の4段階構築部分、BG05の重複準備／bind部分、BG09〜10の参照非出力、BG12の互換／閉鎖を部分検証した。21個の値専用状態対照、4×4の独立prefix、link9／duty8／descriptor5・receiver2のcompiled対照、型不正6件のsemantic compile-failとprojection負の対照を実施。結果・初回失敗・二重防御の範囲は[検証記録](E2E_BEST_PRACTICE_WFB_PROBE_RUN_PREPARATION_2026-11-10.md)。実enter／固定unwind・停止合流・実費目・E／S・layout・runtimeはUnknownのまま。

状態関係判定の条件別感度は、適合基点（entering／active／exiting／unconfirmed）から1事実だけを変えた単独不適合shapeで確認する。対象はuse列挙（unconfirmed＋finished）、provisional以降の参照必須（active＋参照なし）、unresolvedとgrantの関係、returnedとoutcome、exit列挙、owed dutyの未使用、entering分岐（entering＋active grant）、activeのbody非unconfirmed・exit空、exitingのbody列挙・grant条件（attempting）・duty条件（owed）、unconfirmed分岐（settled duty）の13種。各条件を外したcompiled変異で、その不適合が受理へ変わることを確認する（既存3種と合わせ16種）。`duty === 'not_owed'`の一律拒否は、到達し得るentering／active／exiting／unconfirmedの各分岐がowed以降のdutyを要求するため等価である。

## 13 B-02限定実装：enter／同grant捕捉と同duty保持（2026-11-10）

新factory `createProbeGrantCaptureFake`だけが同root／同binding／RunLink／duty／同startのcapture継続を利用する。旧(A)・B-01入口は引数・公開method・未使用状態を維持し、grantの登録／採用口は追加しない。新入口はprepare／enter／check／checkLegacy／checkState／close／inspectの固定script・値返答だけ。公開modelを`wfb-probe-grant-capture-1`として区別し、execution=closedはbody実行閉鎖の意味を維持する。

enterは先行post・同canonical参照・状態関係をrootで確認し、同startの`frameBoundary('probe_capture')`へ合流する。旧seed拒否を削除せず、probe_capture分岐はgrant準備だけを実行する。startの通常受付は同RunLink／duty current・issuedと同cell、未使用use・not_owed duty・空grant／未開始body／空exitを確認する。同期再入はenter_in_progress、使用済みの重複はduplicate_enterのrefusalで、first・既存資格を壊さない。

固定順序はclaim before→同useをentering／使用済み・同dutyをowedへ無allocationで更新→claim after→issue before→試行開始・attempting→issue attempt→固定constructor→issue issued→capture before→current／receiver-issuedのprovisional捕捉→capture after→validate before→brand＋10field／current・receiver-issued／発行元参照の同一性確認→validate after。9観測点に故障・停止・再入を独立配置する。BE05 activeとBE06 bodyは呼ばない。旧startのframe boolean・finally・frameExits・requestも進めない。

固定issuerは返却より先に同ownerのprivate issued参照を保持する。捕捉前の失敗でも既知のissued候補を失わず、cellのissuedが空の場合だけそこへ補足する。receiver-issued等の既存拒否候補を上書きして消さない。constructor試行開始後、未捕捉なら未知の責務を保持する。grantAttemptsは試行開始の計数で、constructor完了数ではない。grantIssuesは内部候補発行数（不正field対照も含む）で、実行資格の発行数ではない。

正常はuse=entering／grant=provisional／body=not_started／duty=owedで止まり、局所退役もaccepted退出記録もない。失敗時、claim未使用なら未使用のまま固定拒否（prefix=not_claimed）。使用開始後は境界の既知性で3分類する。constructor呼出し前ならuse=entering／duty=owed／grant=empty（claimed_not_issued、正規未発行checkpoint）。issuerが候補を保持していれば、未捕捉ならcellへ同参照を補足し、grant=provisional・unresolved=false・duty=owedのまま拒否候補も保持する（grant_known、B-03の固定退役対象）。constructor呼出し後に返却を捕捉できない場合だけuse／duty／exit／grantをunconfirmed・unknownObligationとする（grant_unknown）。stopと同期faultも境界が既知なら同じ分類で、unconfirmedへ昇格しない。attemptは払い戻さず、dutyのattemptUsedはfalse（固定unwind未試行）、同RunLinkへの責務ありを別booleanで診断する。rootとstartが同じdutyを保持し、参照消去・第2ownerへの補完・cleanup成功化はしない。

closeは新規captureを閉じる同startの固定stop latchにだけ合流し、旧request／close・回収claimへ進まない。正常捕捉後closeでもprovisional grantとowed dutyを保持。途中stopは既存firstを上書きせず固定失敗prefixへ進む。B-03の固定exit guard／退役と(C)の同期確定は引き続き未実装で、通常の固定失敗返答を解除して再開する方式を採らない。

固定projectionを再利用し、capture phase／boundary・試行／発行／検査計数、同duty／責務保持・stop／refusalだけを追加した。実grantやRunLinkを外へ返さない。BG03〜05／07のenter・候補捕捉部分、BG09〜10の実候補保持時の参照非出力、BG11の固定stop部分、BG12〜13の旧入口閉鎖と先行準備を検証した。BG06／08の実body・unwind・局所退役、BG14のbody終了後held_unsealed、全writer停止・実予算接続は未実施。47新試験・関連1,359件・compiled13本の結果は[検証記録](E2E_BEST_PRACTICE_WFB_PROBE_GRANT_CAPTURE_2026-11-10.md)。実費用・E／S・layout・全体work受付はUnknown／無効のまま。
