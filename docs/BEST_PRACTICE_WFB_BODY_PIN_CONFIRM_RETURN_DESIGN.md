# WF-B：pin confirmed・最終postとPC08未接続停止の接続差分

Version: draft-0.8 / Date: 2026-11-12 / 読み取り基準HEAD: `ebe739e`（§14の(A)限定実装基準HEAD: `d7d3055`、§14実装のレビュー修正基準HEAD: `1b74bff`、§16の(B)限定実装基準HEAD: `201b1f7`、§16実装のレビュー修正基準HEAD: `7343af3`、§21の(C-c)限定実装基準HEAD: `b4a0c67`）。

draft-0.4のレビュー修正：§16の(B)実装（`7343af3`）に34件の一時変異を入れたところ、9件がVitest・compiledの両方を通った。そのうち検出できたのは、段階継続へ入る分岐の`valid &&`条件である。prepared検査が失敗した場合、この条件を外しても最初の理由は同じstate_invalidだが、段階継続へ進んで`stages.point`がbefore_checkedへ動く。compiledにprepared検査直前でbusyを落とす対照を追加し、`stages.point`がnoneのまま、receiver first state_invalid・prepared falseであることを確認してkillした。残る8件は§17で等価と判断した。fixtureの挙動は変えていない。

draft-0.2のレビュー修正：§14の(A)実装（`1b74bff`）に43件の一時変異を入れたところ、24件がVitest・compiledの両方を通った（うち1件は型エラーでだけ落ちたため生存扱い）。参照点の失敗でprepared未成立ならconstruction_unconfirmedを返す分類、BP02失敗時のsource境界checked、BS shellのfailed、返答再materializationの拒否、prepared検査のbusy／active節とstate_invalid写像・pin first、primitive未復帰時のreturned判定である。Vitestは参照点ごとのdisposition・source境界・shell状態を比較し、返答再試行のErrorを完全一致にした。compiledにはprepared検査直前の一点注入3件と、bodyPinEnter後に復帰を失わせる局所対照を追加し、この9件を意味的なassertでkillした。残る15件は§15で等価と判断した。fixtureの挙動は変えていない。

Status: **§14の(A)・§16の(B)と既存レビューを維持し、§21の(C-c)最終post・内部accepted・元caller固定未接続停止を合成依存限定で接続。PC08／C-03は未接続。** 親は[格納・初回rejected保持設計](BEST_PRACTICE_WFB_BODY_PIN_REFERENCE_STORAGE_DESIGN.md)と[全確認・未接続停止設計](BEST_PRACTICE_WFB_BODY_PIN_STORAGE_RETURN_STOP_DESIGN.md)。前段実績は[格納・保持検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_REFERENCE_STORAGE_2026-11-12.md)、(A)実績は[(A)準備検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_CONFIRMATION_PREPARATION_2026-11-12.md)。(B)実績は[段階別post検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_CONFIRMATION_STAGES_2026-11-12.md)。既存の[private pin全体schedule](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)のPC07までと、PC08未接続時の失敗合流を対にする。PC08そのもの・BP04／C-03は接続しない。

正式発行口・既存C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。§1〜13はdraft-0.1の将来契約／文書検証履歴、限定実装は§14／16／19〜21で区別する。実接続・実通信・実機操作・設定変更・Pushは行わない。

## 1 現行との差分と正常停止点

現行createProbeBodyPinReferenceStorageFakeは同R/S/TのI=C=S・J空を実照合し、stage captured／step currentでreferencePostChecked=trueを記録した後、receiver_unconfirmed／rejected_attemptへ固定停止する。callerはacceptedを一律state_invalidとして拒否する。BodyPinReferencePhaseはissued／before_current／capturedだけであり、checked／confirmedの正例は値専用である。

将来の新入口案はpackage除外のcreateProbeBodyPinConfirmationFake／wfb-body-pin-confirmation-1。constructor固定の別合成modeとし、元constructor／prepare／frame・同source／同startの格納を再利用する。現行の中間post成功直後、**receiver_unconfirmedを記録する前**だけから新継続へ分岐する。返答済み／失敗済みrootの再開・firstの解除・claim再発行はしない。旧reference／storage／call入口の挙動・返答・期限・runtime／旧facade exportは維持する。

新しい正常到達はcalleeのpin confirmed＋最終post成功まで。literal acceptedは内部完了通知だけで、callerがPC08を受理した証拠ではない。callerはpin_return_not_connected／construction_unconfirmedで固定停止し、ok=falseを返す。receiver firstはnoneのまま、sourceは確認済みの場合だけfailedへ移る。preparing・ready・bodyへは進まない。

## 2 同一性・所有と三つの完了指標

Rは元root、Sはその正規source、Tは同binding.target.start、I/C/JはTのexpected-source issued/current/rejected実slot。元rootのsource issued=current=S・rejected不在、同shell／binding／link／duty／control／failure／frameとmetadata9／進行13fieldの正規関係を保つ。bindingOwnerとcellOwnerは各元関係で検査し、同一objectへ統一しない。RはSの所有者、TのI/C/Jは借用と未解決の保持責務である。

| 指標 | 意味 | 新確認経路での扱い |
|---|---|---|
| referencePostChecked | captured／blockedまでの既存中間照合 | trueが新継続の入口条件。最終post成功へ読み替えず、意味／旧writerを変えない |
| rejected hold confirmed | 初回Jの局所保持を確認済み | 失敗経路専用。J又はholdが非初期なら新確認へ入れない |
| pinFinalPostChecked（新案） | 当該T／同試行の最終post成功履歴 | constructor前のliteral false。最後のpost通過後だけtrue。公開値・引数から供給しない |

pinStage confirmedは「confirmed記録群まで到達した」という事実で、pinFinalPostCheckedと別である。新scalarはTの既存一度限りtrialと正規R/S/Tに結合し、新owner／receipt／token／source利用claimではない。sourceの22keyに追加せず、source.postConfirmedやrootのBP04用pinPostCheckedも変更しない。

## 3 狭い段階型とprivate実参照検査

新継続専用の有限phaseを提案する。全行でreferencePostChecked=true、hold not_started、J空、I=C=S、trial=true、receiver診断初期値・payload6参照空を要求する。rootは同活動frame／running／BP03 call before／callActive=true、TはentryBusy=true、Sはinitializing／unused／BP03 call／pinCallReached=true・bindCall／post=false・未停止／firstなしである。

| phase案 | stage／step | 現在境界 | pinFinalPostChecked |
|---|---|---|---|
| captured_ready | captured／current | after | false |
| before_checked | captured／current | before | false |
| checked | captured／checked | after | false |
| before_confirmed | captured／checked | before | false |
| confirmed | confirmed／confirmed | after | false |
| before_final_post | confirmed／confirmed | before | false |
| post_returning | confirmed／confirmed | after | true |

post_returningは返却直前の固定記録後の到達値であり、return前に追加checkerを呼ぶためのphaseではない。callerが停止してsource failed／busy解除となった後のinspectは履歴であり、この活動中の値契約を再利用して受理しない。before_final_postは既存10variantにないconfirmed／beforeの組なので、新専用型／値検査で明示する。旧BodyPinStorageStateのconfirmed／afterを緩めず、旧positive／negativeを維持する。

正規R/S/Tの最小同一性を候補field読取りより先に確認し、元来歴・停止／先行first・未使用base・空BS13carrier・空payload・当該phase原値と実I/C/Jを固定に再検査する。現在のprivate reference checkerはreferencePostChecked=falseを要求するため、後段へそのまま流用しない。新checkerは同じ元安定境界と実slotを再利用し、初期全空checkerや公開sameReference／strict booleanで代用しない。未知候補の属性探索・getter／Proxy trap・deep equalityは禁止する。

## 4 固定確認scheduleと同期群

FC01〜09は有限な操作種別であり、全guard数／実費の確定値ではない。sourceの位置は最後までBP03／call、claimはunusedである。

| ID | 固定処理 | 直後の事実 |
|---|---|---|
| FC01 | 同格納の中間post成功→referencePostChecked=trueの直後だけ新継続へ入り、captured_readyを照合 | 同I/C、stage captured／step current、final=false |
| FC02 | 境界before→before_checked観測→全条件／実参照を再照合 | current／before。次stepを先取りしない |
| FC03 | G_K：step checked→境界afterの2直接代入。checked観測後にchecked専用post | stage captured／step checked |
| FC04 | 境界before→before_confirmed観測→checked／同参照／全安定／停止を再照合 | checked／before |
| FC05 | G_M：stage confirmed→step confirmed→境界afterの3直接代入 | confirmed記録済み、final=false |
| FC06 | confirmed観測後にconfirmed専用post。境界before→final_post_before観測 | confirmed／before、最終post未確認 |
| FC07 | before_final_postで最終の全条件／実参照を照合。成功時G_P：境界after→pinFinalPostChecked=true、直ちにliteral acceptedをreturn | post_returning、receiver first none |
| FC08 | 既存の固定wrapperを復帰し、receiver finallyはentryBusy=false、dispatcher finallyはcallActive=falseだけ。実primitiveをrootへ格納→callPhase returned／route境界after | BP03／route step callのまま。PC08未受理 |
| FC09 | 新modeの最小結果分類→無割当ての上位未接続診断固定→その後だけ返答生成／cache | route failed／pin_return_not_connected。BP04未開始 |

G_K／G_M／G_Pは既知private fieldへのliteral代入だけとし、群内にguard・allocation・access呼出し・getter・script・通知・callback・awaitを挟まない。I/Cを書き直さず、J保持やsource claim消費も行わない。群途中を通常の故障checkpointにせず、before又は全代入完了後のprefixだけを観測する。同期的な非介在の契約であり、OOM／プロセス停止等に対する物理atomicityは保証しない。

## 5 最終postからreturnまでの非介在

最後の許可観測はfinal_post_beforeで、境界beforeを記録してから実行する。その後に最終checkerが停止・first・同owner・実I/C/J・phase原値・未使用／空の全条件を再確認する。観測点でclose／throw／priorが起きればconfirmedは保持するがG_P／acceptedは実行しない。

最終checkerのtrueからG_P・literal returnまで、追加post／projection／返答生成／診断通知／clock読取り／script／hook／awaitは置かない。確認後のmarker trueを外部へ渡す関数も呼ばない。G_Pの直後に許可されたpost_after観測点は作らず、完了は復帰後の診断からだけ観測する。

store→格納準備wrapper→receiver入口→dispatcherは固定primitiveをそのまま返す既存同期鎖を再利用する。中間wrapperで結果を変換・再構築・消費せず、finallyは自分の既知busyへのfalse代入だけとする。参照・trial・最終post履歴・firstはclearしない。正常鎖のfinallyは既知thisのprivate代入だけであり、任意の退出callbackを導入しない。

finallyへのthrow挿入・返却値差替えは局所compiled負の対照に限る。実装へ配送故障hookを追加してこの区間を観測可能にしない。finally等で実primitiveがrootへ戻らなければ、calleeのfinal=trueだけからacceptedを復元せず、callerはcall beforeの復帰未確認として止める。両busyの解放未確認をfalseへ補完しない。

## 6 callerの最小分類とPC08未接続境界

現行prepareBodyPinCallは、primitive復帰後にbodyPinValuesのobjectを生成し、receiver first noneもreceiver_unconfirmedへ畳み、acceptedをstate_invalidとして拒否する。新modeはこの既存共通分岐の**前**に専用分類を置く。旧modeのaccepted拒否や旧途中失敗の期待値は変更しない。

分類に使えるのはconstructor固定mode、実固定call数、当該callから格納されたprimitive、実呼出し対象Tのprivate final marker／firstという有限の原始値だけ。Tはcall前に正規供給された同targetであり、公開診断から再取得しない。private読取りは固定accessの非割当て・非hookな原値読取りに限る。

| 実結果 | 新modeの固定分類 |
|---|---|
| accepted・実call=1・同Tのfinal marker原値true・receiver first原値none | 内部完了通知の経路だけを識別し、PC08未接続停止へ。source／rootの先行理由があればそれを保持 |
| acceptedだがmarker false／不正、receiver first既存、実callなし等 | 完了通知不整合としてstate_invalid又は元binding不一致で拒否。先行理由を保持し、confirmed／完了履歴を補完しない |
| rejected_attempt | 同Tの既知firstと元root／sourceの先行理由を保持。receiver_unconfirmedだけをroot construction_unconfirmedへ写像 |
| nested refused_existing | 元callの成功へ混ぜず、既存refusal／元prefixを保持。第2call／再pinなし |
| throwで実結果未格納 | 最後のcaller位置を保持してconstruction_unconfirmed等へ。final marker／call回数から復帰成功を推定しない |

marker読取りは完了通知の最小分類であり、PC08のreturned checkerではない。復帰後のsource／metadata／実保持の全再検査、root route step returned、source境界after、BP04への受理は一切行わない。markerだけ又はliteral acceptedだけを偽装した対照でも、PC08／ready／C-03へ進む経路はない。

FC08の実復帰記録からFC09の初回診断固定まで、任意checkpoint・reentry／close script・projection・reply生成を挟まない。必要な先行理由の原値読取りと固定分類以外の観測は、診断固定後だけに置く。最小分類で不整合を認めた場合も同じ診断先行順を使う。

## 7 上位診断の固定と返答生成の分離

現行failはroot firstを更新した後、failBodyPinBridge→bodyPinFailurePositionのobject／Object.freezeを経てsource診断やcacheを生成する。そのままでは割当て失敗が上位の位置・sourceReason固定より先に起き得る。新modeは既存rootの先行failure slotを再利用し、**非割当ての固定診断writer**と、その後の返答materializationを分ける。別FailureOwner／slot予約／結果tokenは作らない。

| 軸 | 正常な完了通知→未接続停止の固定値と順序 |
|---|---|
| 元firstの選択 | 既存root firstを最優先。確認済み元source first・既存停止があれば尊重し、なければconstruction_unconfirmed。receiver first noneを失敗理由へ変換しない |
| root | 共通firstを先行保持し、pin初回理由／実caller位置・call側sourceReason・route failedを固定。通常はBP03／call／after、callPhase returned。BP04用preparingConfirmed／pinPostCheckedはfalse |
| source | metadata確認済みかつ元issued/currentが同Sである既知の範囲だけ、first noneならconstruction_unconfirmed・failurePhase BP03／boundary callを記録し、state failed。既存first／位置は不変 |
| BS shell | 既存storage確認済みの元shellだけを既存失敗契約に沿って保持／failedへ。13carrierやdataを生成しない |
| receiver | stage／step confirmed、I=C=S・J空・final=true、first／failure位置noneのまま。上位停止をcalleeの新失敗へ強制伝播しない |
| 返答 | 上記固定後だけ、model案wfb-body-pin-confirmation-1、ok=false、pin_return_not_connected、first construction_unconfirmedと閉鎖定数を凍結／cache |

固定診断writerは既存の原始fieldと確認済みplain data fieldへの条件付き直接代入だけ。位置は実際に保持するcaller before／afterから選び、allocatingなposition object／配列／view、Object.freeze、Error生成、任意method／通知を呼ばない。すでにあるfirst・初回位置・sourceReasonは後発要求で上書きしない。未確認sourceはfield読取り／書込みを増やさず、元root側が既知診断と未確認責務を保持する。

call側sourceReasonはroot firstの単純copyにしない。rejectedでは実Tの既知firstを独立に残し、正常acceptedでT first noneならconstruction_unconfirmedとする。例えばT binding_mismatchの後にroot closedが先行記録されれば、root closed・T binding_mismatch・既存source firstを各軸で保持する。現行reason helperはroot firstなしの場合にsource.firstを読むため、metadata確認を失った新modeの経路へ無条件流用しない。固定の信頼確認と原値分類を先行させる。

新modeには先行空のprivate返答cacheを一つ用意する案とする。既存の先行失敗cacheがあれば尊重し、同じ失敗の返答を後から別理由へ差し替えない。新規返答の割当て・凍結が成功した後だけcacheへ保持し、必要な既存generic cacheとの結合も同じ返答参照で行う。生成throw／OOMでは診断・位置・元参照が先に残り、再prepare／再pinの資格を作らない。固定返答の必着・inspectの割当て成功はUnknownである。

診断固定後の返答前観測・materialization故障・後発closeは、元root／source firstとcallee完了履歴を維持する。closeは既存どおりcache返却より先に停止を単調記録し、失敗をclose扱いへ作り替えない。配送／refusalが記録可能な場合は既存の別軸を用い、pinの最初の操作位置へ上書きしない。

## 8 失敗prefixと保持責務

| 失敗位置 | Tに残すprefix | 上位の扱い・禁止 |
|---|---|---|
| 新継続前／captured_ready | captured／current・I/C・referencePostChecked=true、final=false | 固定失敗済みrootへ後付け接続しない |
| before_checked | captured／current／before | checkedを先取りせず元I/Cと最初の理由を保持 |
| G_K後／checked post | captured／checked／after | stage capturedとstep checkedを区別。G_Mへ進めない |
| before_confirmed | captured／checked／before | 元prefixを払い戻さず同duty／ownerへ保持 |
| G_M後／confirmed post | confirmed／confirmed／after・final=false | confirmedをempty／capturedへ戻さず、acceptedも出さない |
| final_post_before／最終検査失敗 | confirmed／confirmed／before・final=false | 実境界beforeを初回位置へ保持。最終post完了と推定しない |
| G_P後・primitive復帰未確認 | confirmed／after・final=true、実I/C。callee自身に失敗がなければfirst none | caller call before、復帰未確認。markerからacceptedを復元しない |
| 実accepted復帰・PC08未接続 | confirmed／after・final=true・receiver first none | root call afterの固定未接続停止。source failedとreceiver正常完了を併存させる |
| 上位診断固定後・返答生成／配送失敗 | 全到達履歴・参照・callee診断を維持 | 上位first／位置と未確認配送・未解決責務を残す。cache未生成を再試行許可にしない |

途中の実I不一致・C copyはbinding_mismatch、phase／原値・空slot条件の不正はstate_invalid、停止は元理由／closed、未知確認throwはreceiver_unconfirmed→root construction_unconfirmedを基本とし、先行firstを優先する。callee正常完了後のwrapper離脱失敗はcalleeの新receiver_unconfirmedにせず、上位の復帰未確認として区別する。

既存J保持はcaptured／step current・referencePostChecked=falseの正規試行に限る。新継続のchecked／confirmedでC混入を見つけても、旧retainerを緩めて新Jへ格納しない。実I/C・既存Jと未確認責務を元slotに残して停止し、Cを元Sへ修復しない。Rは元Sを、Tは各保持参照と局所責務を保持する。clear／cleanup確認／最終discard／root終端は別工程である。

## 9 非昇格・旧契約と公開診断

旧reference入口の正常固定停止・新50件の中間post区分と、旧storage／call入口の空参照・accepted拒否を維持する。新constructor固定mode以外に最終確認継続を供給せず、runtime friend／登録口／外部callbackを作らない。既存source22key・metadata9、利用claim unused、payload6参照空・free／empty／bind prefix none、BC00／ready／body開始0を維持する。

新公開projectionは有限enum・strict boolean・保持有無・閉鎖定数だけとする。中間post・hold確認・最終post・caller primitive実復帰・PC08未受理を別項目で示し、pin confirmedだけで最終post成功を表示しない。raw参照・owner／brand・source値・Error／message・秘密は出力せず、診断からprivate資格を復元する入口も作らない。旧projectionのallowlistは変更しない。

## 10 等価判断の再評価

[親の等価判断](BEST_PRACTICE_WFB_BODY_PIN_STORAGE_RETURN_STOP_DESIGN.md)は元到達範囲に限定する。格納段階で非等価を確認済みのreceiver初回guardは維持する。残る重複mode／identity節は、元固定tuple・唯一caller・非介在が続く箇所と、新しい段階／結果分岐で再検査を要する箇所を個別に区別する。

特に、receiver first none→上位未接続、confirmed記録後のcallee失敗、final=trueだがprimitive未復帰、復帰後の先行root／source理由、返答生成失敗では軸が分かれる。receiverReason／sourceReasonの同値写像やcatchの到達不能という旧根拠を自動継承しない。節除去の対照は、最初の理由・実位置・最後のprefix・最終marker・未実施suffixの変化を比較し、構文／型エラー・anchor消失・外側timeoutや単なる後段固定拒否だけをkillに数えない。

## 11 全接続時の独立合成・compiled受入条件（限定結果は§14／16）

| ID | 必須条件と負の対照 |
|---|---|
| FE01 | 旧reference／storage／callの正常停止・copy保持・script・期限・export期待値を維持。新modeだけ同callでcaptured→checked→confirmed→最終postへ |
| FE02 | R/S/Tと元来歴・各owner関係・I/C/Jを個別混入。public confirmed／同値copy／Proxyから昇格せず、相手のslot／first不変、hook 0 |
| FE03 | 独立原始event oracleで各許可点×throw／close／prior／再入のstage／step／境界・marker／first・未実施suffixを予測。confirmed後の最終post失敗を分離 |
| FE04 | G_K／G_M／G_Pの直接代入・固定順と、最終true→G_P→literal return→固定wrapper／finallyの非介在をASTと実経路で確認。禁止区間へ故障hookを追加しない |
| FE05 | 最終post前の実slot／原値・source停止／firstを単独故障。最終checker省略で誤accepted／marker trueとなる対照。marker trueだけを最終post実行の証明にしない |
| FE06 | before_final_postのconfirmed／beforeを新型で受け、旧confirmed／afterを維持。不正stage／step／境界／boolean、marker初期trueを拒否し、public strict化で原値を丸めない |
| FE07 | 実primitive accepted＋同Tのfinal原値trueを新modeだけで分類。callee省略・marker false／不正・結果差替え・第2call／nested refusalでPC08／C-03／readyへ進めない |
| FE08 | finallyへの局所compiled throw／返値上書きで実復帰未確認を再現。final=trueでもcaller beforeを保持し、実結果／busy解除を補完しない |
| FE09 | 正常callee first noneとroot／source construction_unconfirmedの併存、上位先行closed／state_invalid・source先行理由・生成BP01位置を個別確認。新writerの初回guard除去で理由／位置喪失を検出 |
| FE10 | 診断固定前のallocating view／position／replyがないことを構造確認。診断固定後の返答生成throwでfirst／位置・参照・履歴を保持し、キャッシュ又は再prepareから再開不可 |
| FE11 | semantic compile-failでprivate継続／最終checker／診断writer利用、狭いphase不正組、source metadata更新、診断／markerからの実資格復元を拒否 |
| FE12 | 新projectionのallowlist／strict値・有限凍結plain graph・秘密非出力。class／method／field単位のwriter監査、禁止書込み0、配布物fixture混入0と負の対照 |

oracleは実装のbuilder／schedule／checker／counterをimportせず、固定原始eventと独立条件式から期待値を計算する。実slot故障と値view偽装を分け、旧値専用positiveや前段2,894件／compiled28本の実績を新完了経路の成功数へ足さない。全FE・正式発行・全費用の受入成功は未確認のままである。

## 12 追加費目・実装の分割と未接続

追加論理費目はTの先行最終post scalar、新rootのconstructor固定mode・有限観測点／初回点／再入結果・空返答cache、固定private原値access、各phase／実参照の検査、G_K/G_M/G_P、非割当て診断固定と返答生成／投影である。元owner／source22field／BS13carrier／receiver9参照・中間post／hold scalar／call・trial予約は再発行／二重計上しない。非割当て区間の設計を、runtime全体の無割当て保証へ広げない。

実E／S、unit係数・実layout／allocation／GC／OOM、全guard数／全体work上界・停止後解消予約・診断必着はUnknown。期限・開始時刻／全deadline・設定・本番capは変えない。PC08の全returned検査、BP04／C-03、source利用claim消費・payload借用／bind・BC00・構築ready・body・Journal供給・field clear／root終端・正式発行は未接続のまま。

別承認後の分割案は、(A)狭い状態型・最終marker先行field・新caller分類／非割当て診断契約を実行閉鎖で準備、(B)同ownerのchecked／confirmedと各postを固定拒否まで接続、(C)最終post→literal returnとPC08未接続停止を対に接続して全prefixを検証、の順とする。途中版でacceptedだけを先に解禁せず、旧失敗済みsequenceを使い回さない。各段階でテスト・compiled・CHANGELOG・設計／検証記録・梱包除外を更新する。

## 13 draft-0.1の文書検証履歴

今回は本書と親2文書のMarkdownだけを更新する。ソース・テスト・compiled fixture・CHANGELOG・既存検証記録・manifest／lockfile・設定は変更せず、build・合成／compiled試験・梱包・index登録・コミット・Pushは行わない。FC01〜09／FE01〜12は将来の操作／受入条件であり、現行の実装・試験結果とは区別する。

文書検証結果（2026-11-12）：当方が編集した3文書のローカルリンク23件に欠落なし、21表の列数・末尾改行／行末空白に異常なし。本書13節・親15／17節の順序、FC01〜09／FE01〜12の重複・欠落なしを確認した。照合基準`ebe739e`の中間post後固定拒否・実checkerの3phase・accepted一律拒否・receiver／dispatcher finally、失敗位置／返答生成の割当てを読み取り確認した。当方の編集はMarkdown3ファイルだけ。最終確認時に別の作業中変更がcomposition fixture・reference試験・reference compiledの3ファイルへ現れたため、その内容は変更せず保持し、本書の実装根拠へは含めない。indexは空、HEADは`ebe739e`から変更していない。これは文書整合の確認で、新確認経路・非割当てwriter・全FE／費用の検証成功を意味しない。

## 14 (A)狭い値契約・先行marker・閉鎖caller準備（2026-11-12）

package除外のcreateProbeBodyPinConfirmationPreparationFake／wfb-body-pin-confirmation-preparation-1を追加した。constructor固定の別合成modeで、元root／source／startと参照格納・中間postを再利用する。実ownerが照合するphaseはcaptured_readyだけであり、正常でもcaptured／step currentのままreceiver_unconfirmed／rejected_attempt、上位construction_unconfirmed／pin_confirmation_not_connectedで停止する。checked／confirmedのwriter・G_K／G_M／G_P・最終post・literal acceptedは実装していない。

BodyPinConfirmationStateは§3の7組を狭いunionにし、source13／receiver14の全原値・境界・中間post／hold／markerを純粋に検査する。before_final_post等の後段正例は値専用で、実ownerを進める資格ではない。同startのpinFinalPostCheckedはconstructor前のliteral falseで、初期化後のwriterは0。既存referencePostChecked・rejected hold confirmed・source22fieldの意味を変えない。

新callerの分類器はprimitiveだけを受ける。accepted＋call=1＋final=true＋receiver first noneの値正例もcompleted_value_onlyであり、実callerではacceptedを引き続きstate_invalidへ固定拒否する。元callの結果を格納した後、raw private first／markerだけを読み、診断前にallocatingなreceiver view・position・replyを生成しない。実結果noneはunreturnedのまま、call数やmarkerから返却成功を補完しない。

非割当てwriterは既存rootのfirst／pin初回位置／sourceReason／route失敗と、metadata確認済みの**元Sがissued/currentと双方同参照**である範囲だけのsource診断を直接保持する。issued=currentを同値copyへ同時置換しても相手を更新しない。未確認sourceは属性を読まない。実位置はBP02／preflight又はBP03／callとbefore／afterの正規組だけ、それ以外は全noneとし、BP03／preflight等の既知位置を捏造しない。先行root／source firstとsourceReasonは後発理由で上書きしない。

診断固定後に既存generic返答と新modeの閉鎖返答を生成する。今回の(A)は既存generic cacheを維持して新modeの先行空cache／終端返答試行scalarを足す準備実装であり、§7の将来の同一返答参照への統一は未接続。失敗first又はcloseがある終端だけをcacheし、未開始check／checkLegacyは終端試行を消費しない。開始前closeはfirst noneでも終端として保持する。新終端返答生成throwでは診断・I/C/J・元source／未確認責務を保持し、その返答の再materializationを拒否する。診断必着・OOM／inspect成功・全runtimeの無割当ては保証しない。

[(A)検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_CONFIRMATION_PREPARATION_2026-11-12.md)に新50件、値7組／field189／cross49・caller80／不正7、private型拒否10行、原値読取り／非割当て構造・元S限定／初回guardの対照と回帰を記録する。前段`d7d3055`の一点注入16件と親§16の12等価節は保持した。今回追加writerのfirst／sourceReason guardは別の後発要求対照で必要性を確認したが、旧12節や全FE／全費用を一律に非等価・検証済みとしない。

追加費目はstartの1scalar、rootのprepared／診断記録／分類／返答試行4scalar・空cacheと固定mode、原値access・7状態検査・固定診断／返答／投影である。元source所有・receiver借用・call／trial予約を再発行しない。実E／S・unit係数・実layout／GC／OOM・全guard数／全体work上界はUnknown。次は(B)のchecked／confirmedと各post、続いて(C)の最終post→返却と未接続停止を別承認で扱う。PC08・C-03・source利用claim・payload借用／bind・ready・body・Journal供給・clear／root終端・正式発行は未接続のままである。

## 15 §14実装レビューの等価判断（2026-11-12）

(A)の現行所有経路だけでの判断である。(B)以降でfinal post・accepted復帰・第2のwriterを接続するときは単独対照で改めて評価する。

| 節 | 等価の根拠 |
|---|---|
| prepared検査とconfirmationPreparationModeの固定mode節（2） | 呼出し経路がconstructor固定modeの継続だけで、旧modeからは到達しない |
| confirmationPreparationModeのidentity | 唯一の呼出し元が直前の参照照合で同じ組の同一性を確認済み |
| prepared検査の実参照節`bodyPinConfirmationReferences` | 同じ検査内のcaptured値checkerがissuedSame／currentSame／rejected空を同時に要求する。rejected slotを注入しても値checkerが先に拒否した |
| callerのreceiver first読取りの`calls === 1`条件 | call 0ではreceiverに書込みがなく、firstは常にnone |
| 分類の初回保持guard | 新callerは1回のprepareで1回だけ分類する |
| inheritedのtrusted source.first、mixed→binding_mismatch、source信頼条件の`=== current` | 新callerへ渡るsourceは常に元issued=currentで、root firstなしにsource firstだけが立つ経路もない |
| reasonのclosed分岐 | closeは既存経路でroot firstをclosedに記録しており、先のinherited分岐が受ける |
| dispositionのclassification条件 | preparedが立つのはreceiverが全照合後にreceiver_unconfirmedを記録した経路だけで、分類は常にreceiver_unconfirmed |
| 記録writerのfailureRecorded guard | 2回目の要求（cp_later_reason）でも同じ位置・pin firstを再計算するだけで値が変わらない |
| 記録writerの位置妥当性guard | 新callerに来るroute位置は常にBP02 preflight又はBP03 callのbefore／after |
| source firstの初回guardと理由写像 | 先行のfail経路が既にsource firstを同じ値で記録しているか、写像前後が同値になる。写像の除去は型エラーでだけ検出される |

## 16 (B)同ownerのchecked／confirmedと段階別postの限定接続（2026-11-12）

package除外のcreateProbeBodyPinConfirmationStagesFake／wfb-body-pin-confirmation-stages-1を追加した。constructor固定の別合成modeで、同R/S/T・(A)のcaptured_ready照合成功直後だけから継続する。旧(A)・reference／storage／call入口の動作・期待値・期限は不変。失敗済みrootの再開や、新source／claim／ownerの発行はしない。

| Bの観測点 | 到達prefix／現在境界 | checked後post／confirmed後post |
|---|---|---|
| before_checked | captured／current／before | false／false |
| checked | G_K後のcaptured／checked／after | false／false。この後の照合成功でchecked後post=true |
| before_confirmed | captured／checked／before | true／false |
| confirmed | G_M後のconfirmed／confirmed／after | true／false。この後の照合成功でconfirmed後post=true |
| blocked | confirmed／confirmed／after | true／true。固定拒否前に同条件を再照合 |

G_Kはstep checked→境界afterの2直接代入、G_Mはstage confirmed→step confirmed→境界afterの3直接代入。群内に呼出し・hook・allocation・観測を挟まない。I/C/Jは書き換えず、source claimはunused、payload6参照とBS13carrier dataは空のまま。before_final_postへの移行・G_P・最終marker true writer・literal acceptedはない。

新checkerは同mode・(A)準備履歴・現在観測点・元source/startの活動binding・entry busy・実I=C=S／J空と、狭い段階の全原値・各post履歴を組にする。元来歴・未停止／firstなし・同frame／link／duty／control・空payload／BSは既存active検査から再利用する。current欠落はstate_invalid、存在する不一致I/Cはbinding_mismatchとして拒否し、元slotを修復／clearしない。J既存も拒否し、新段階から旧rejected保持へ流さない。正しい値viewを偽装しても実参照検査を省略しない。

startへliteral falseのcheckedPostChecked／confirmedPostCheckedを先行配置し、各専用post成功直後だけtrueにする。rootのstages.completedはblocked再照合済みという**中間範囲だけの履歴**であり、最終post・accepted／PC08・run完了ではない。通常もreceiver_unconfirmed／rejected_attempt、root construction_unconfirmed／pin_final_post_not_connectedで停止する。preparedだけが立った途中失敗は通常返答へ分類しない。

throw／close／prior後も到達段階・post履歴・I/C/Jを保持する。新rootの観測点／初回点／再入結果・中間完了は先行scalar。段階別失敗位置は共有非割当てwriterだけでなく、close／priorが先に診断を確定する既存failBodyPinBridgeの初回区間でも保持する。後発理由で上書きせず、返却後は(A)のprimitive分類・診断先行順を再利用する。新終端返答throwでも元参照・三者診断・履歴を残し、再materializationを拒否する。既存finallyは元busy解除だけ。

[(B)検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_CONFIRMATION_STAGES_2026-11-12.md)に新48件、実field故障50件・checker省略5対照・安定境界8件・実slot／値view対照・固定2群・型拒否7行等を記録する。§15は(A)の元範囲に保持し、Bの新checker／post履歴／分類を自動的に等価としない。既存の一点注入・復帰喪失対照も維持する。全新節感度・全FE／費目の証明ではない。

追加費目はstartの2scalar、rootの観測点／初回点／再入結果／中間完了4scalar・空返答cacheと固定mode、5回の段階検査／有限event・診断／投影。(A)の終端返答試行scalarを再利用し、元owner・source22field・BS13carrier・9参照・call／trialを二重発行しない。実E／S・unit係数・実layout／GC／OOM・全guard数／全体work上界・解消予約はUnknown。(C)の最終post→accepted返却・PC08未接続停止は別承認に残し、正式発行口閉鎖・全体受付無効・調査保留を維持する。

## 17 §16実装レビューの等価判断（2026-11-12）

(B)の現行所有経路だけでの判断である。(C)以降でfinal post・accepted復帰を接続し、呼出し元や段階が増えるときは単独対照で改めて評価する。

| 節 | 等価の根拠 |
|---|---|
| 段階matcherの`#bodyPinConfirmationPrepared`節 | 段階継続へ入る分岐の`valid &&`がprepared成立を先に要求し、その分岐はcompiled対照で検出される |
| 段階matcher・confirmationStagesMode・bodyPinConfirmationStagePointの固定mode節（3） | 呼出しはconstructor固定modeの継続からだけで、旧modeからは到達しない |
| 段階matcherの観測点一致節 | 常に同じpointのevent直後に呼ばれ、event内の再入（refused_existing）はpointを変えない |
| confirmationStagesModeとbodyPinConfirmationStagePointのidentity（2） | 確認済みの元root／source／startの組だけで呼ばれ、途中で組を差し替える経路がない |
| dispositionのclassification条件 | stagesCheckedが立つのはreceiverが全段階後にreceiver_unconfirmedを記録した経路だけで、分類は常にreceiver_unconfirmed（§15と同じ構造） |

## 18 (C)最終post・内部返却と単一cache所有の差分詳細設計（2026-11-12）

[最終返却・診断・cache所有の差分詳細設計draft-0.1](BEST_PRACTICE_WFB_BODY_PIN_FINAL_RETURN_CACHE_DESIGN.md)で、§16の成功したblocked再照合直後・固定拒否前からfresh C modeだけを分岐する契約を具体化した。最終post→G_P→literal acceptedと、実primitive復帰後のPC08未接続停止を対に扱い、Bの失敗済みinstanceを再開しない。callee first noneと上位construction_unconfirmed、final trueだがprimitive未復帰というprefixを別に保持する。

C終端objectは元rootの既存#fixedだけが所有し、mode別cacheへ複製しない。診断seal・一度限りの生成・非公開保持・外側入口の実復帰確認・公開を分ける。生成throwとcache保持後の外側finally throwは別状態で保持し、generic fail／catch／早期cache読取りもC専用方針へ集約する。開始前closeの確定first none、後発close／入力拒否、非終端view、元source／I/C/Jの未解決責務を区別する。

本節は開始時のdraft-0.5レビュー変更を保持した参照追記であり、同レビューは別作業で`7eb7b9b`へ保存された。§17までの内容は変更せず、既存A/B実装・期待値・期限は不変である。新Cの全writer／reader・外側公開gate・最終post／返却は未実装、FRC／FRT条件も未実施。PC08・BP04／C-03・claim消費・構築ready・body・正式発行は接続せず、全体受付無効・Unknown・調査保留を維持する。

## 19 (C-a)型・seal・単一cacheと公開閉鎖契約（2026-11-12）

[C詳細設計draft-0.2 §15](BEST_PRACTICE_WFB_BODY_PIN_FINAL_RETURN_CACHE_DESIGN.md)の合成契約shellだけを実装した。同rootにconstructor固定flag・先行10scalarを置き、既存#failure／#fixedを使って診断seal・最大1回のprivate cache生成・失敗後の保持を検証する。first noneでの開始前closeを後発inputで変えず、delivery診断を分離する。旧prepare／fail／reply／closeへのroutingは行わず、旧A/Bのmode別cacheはそのまま維持する。

公開APIは有限原始codeと非終端projectionだけで、実cacheを返さない。replayableの正例は値検査のみ、公開入場／実退出／公開writerは0。保持直後の合成throwを実outer finallyの検証とは扱わない。[(C-a)検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_FINAL_CONTRACTS_2026-11-12.md)に合成・compiled・梱包結果を分離して記録する。C-bの全入口routingと外側frame、C-cの最終post・accepted返却・PC08未接続停止は次段階で、今回接続しない。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。§15／17の過去の等価判断をC全体へ転用しない。

## 20 (C-b)fresh入口・固定終端・元外側復帰の合成接続（2026-11-12）

[C詳細設計§17](BEST_PRACTICE_WFB_BODY_PIN_FINAL_RETURN_CACHE_DESIGN.md)を実装した。別のconstructor固定modeから既存構築へ入り、generic fail／reply・check・closeを終端cacheより先に分岐する。active中のclose／inputは先行診断だけを記録し、元calleeの返値分類後、prepare内の固定終端でseal／単一生成へ合流する。未確認metadata候補を読まず、既存A／BとC-aの非echo修正を保持する。

同public入場に属する固定入口が実際に戻り、frame=false・元#fixed同参照・private_cached等を確認した後だけ、ok=falseの同じ閉鎖診断を再読できる。外側finally throw／異なる返答参照／活動frameでは非公開のまま保持する。これは実行・正式発行・外部受領ackではない。最終post・accepted返却・PC08・C-03・bodyは未接続、全体受付無効・Unknown・調査保留を維持する。[C-b検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_FINAL_ENTRY_2026-11-12.md)を参照。

## 21 (C-c)最終post・内部acceptedと上位未接続停止（2026-11-12）

[C詳細設計§19](BEST_PRACTICE_WFB_BODY_PIN_FINAL_RETURN_CACHE_DESIGN.md)を別のfresh合成modeへ実装した。B blocked成功直後の同root／source／startを最終checkerで照合し、G_Pの境界after・既存marker true・literal acceptedだけを連続実行する。原始値の実復帰を元callerが分類し、callee first noneのままroot/source construction_unconfirmed・pin_return_not_connected／ok=falseで固定停止する。PC08のreturned全照合は行わない。

最終post前close／priorは先行診断とbefore位置だけを同ownerへ保持する。C-bの前段failRecord単一経路を変更せず、旧入口は最終marker false・accepted拒否を維持する。marker true後のprimitive喪失・finally未完了を成功へ補完しない。返答生成／外側復帰失敗は既存単一cacheのfailed_empty／failed_cachedへ分離し、元借用・未確認責務を保持して再生成しない。

[C-c検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_FINAL_POST_2026-11-12.md)に関連合成・compiled・梱包と初回失敗を記録する。§15／17と子設計の過去の等価判断を新最終checker全体の保証へ転用しない。PC08・BP04／C-03・利用claim消費・payload借用／bind・構築ready・body・正式発行は未接続、全体受付無効・Unknown・調査保留を維持する。
