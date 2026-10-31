# AU-BR-006 ST-03：private status-only終端・一度限り消費・失効の接続詳細設計

Version: br006-status-terminal-connection-draft-0.6 / Date: 2026-10-31。
Status: ST-03A／Bの§10〜11合成契約と、ST-03Cの§12注入Response／Streamsからのprivate発行・消費を実装。実session／実transportへの接続とruntime承認は未実施。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

親：[status-only終端詳細設計](BEST_PRACTICE_ABORT_SCOPE_STATUS_ONLY_TERMINAL_DESIGN.md) §4／9〜11、[非200 HTTP設計](BEST_PRACTICE_ABORT_SCOPE_NON200_HTTP_DESIGN.md) §8／10。
基準：[ST-01](../src/review/abort-scope-evidence-status-terminal.ts)、[ST-02](../src/review/abort-scope-evidence-status-cleanup.ts)、[ST-02検証記録](E2E_BEST_PRACTICE_STATUS_CLEANUP_ST02_2026-10-31.md)。Promise固定の追加修正`e277e88`を含む現行ソースを読み取り照合した。実通信や実sessionの検証記録ではない。

## 1 目的・現在との差分

ST-02は同readerのcancel-only cleanupを実行できるが、finishはcleanup_diagnostic_onlyを返すだけで、終端token／consumeを持たない。ST-01は合成申告から作る別owner・別台帳の試験モデルであり、そのfinishへST-02の診断をコピーしても、同attempt・同clock・停止状態の証明にはならない。

本案は、ST-02が所有するprivate recordから、注入試験専用の終端を1回だけ生成し、同じownerの固定consumerで1回だけ消費する接続を定める。発行後の取消・失効・期限切れを拒否しながら、HTTP／cleanup診断を失わないことを①〜③の共通要件とする。

- scopeは注入Response／Streamsだけ。固定HTTP dispatch、実session／source／ReleasePermit／認証snapshot／canonical予算には接続しない。
- 全7権限（dispatch／read_body／retry／fallback／body_ack／release_permit／formal_issuance）はfalseを維持する。tokenの「消費」は内部試験結果の確定であり、HTTP処理を続ける権限ではない。
- 200限定guard、既存body adapter、公開JSON／MCP／設定schema、ST-01の合成issuerを変更・開放しない。retry／drain／final枠移譲も別工程。
- read=0、元deadline最大60秒・元cleanup floor・単調remainingを維持し、発行／消費用の新しい60秒／10秒／250msを作らない。
- 本文・資格情報・header・native resource・opaque identityをsummaryへ出さない。開発専用の既存梱包除外を維持する。

## 2 接続の形：private recordが唯一の発行元

ST-03C（§12）では、同じ固定生成経路の中でST-02 ownerと固定consumerを一緒に生成する。private constructor継続はその生成経路だけが捕捉し、外から任意callback／consumer／既存owner／registryを渡す引数を作らない。実session／実transportの採用は別工程とする。

外側の診断APIは従来どおりcopyを返し、終端tokenの取得APIを追加しない。固定consumerへ渡すのはclosure内のopaque tokenだけ。内部で複数moduleに分ける場合もconstructor keyと発行元を限定し、公開exportでのraw登録・採用を禁止する。

ST-01の関数をnative用issuerとして流用せず、ST-01は合成契約の参照試験として残す。ST-02の外部診断、JSON復元物、構造一致のobject、分類器の結果、ST-01のterminalは、いずれもnative接続用のprivate tokenを作れない。

| 概念上の内部型／所有点 | 発行元・保持内容 | 禁止する入力／出力 |
|---|---|---|
| InjectedTerminalContext | 固定constructorが作るowner identity・readonly budget参照・固定clock・元deadline・local世代identity | callerのbinding JSONや実sessionの登録を受けない |
| AttemptAnchor | 同ST-02 record／handle・ordinal=1・固定purpose／window・context identity | 文字列の一致や診断copyで代替しない |
| OwnedStatusRecord | 同Responseから固定getterで採取したprivate headerと、同readerから確定したcleanupへの参照 | status／body有無の自己申告や別readerの事実を受けない |
| InjectedStatusTerminal | 同context／anchor／世代／確定recordへのopaque結合 | 外部に返さず、serialize／cloneによる再生成なし |
| ConsumeSlot | 同constructor内の固定consumerが持つ1回用claimと期待context／anchor | 任意callback・source hook・public consumerを受けない |
| DiagnosticSlot | HTTP／cleanupのimmutable事実、first primary、拒否stage／理由、失効状態 | raw例外・可変配列・token／identityの列挙なし |

Contextのbudget参照・clock・local世代は**注入試験内の同一性**だけを示す。実canonical lease、source／ready世代、ReleasePermitやURLへの結合ができたと解釈しない。後続の実bindingは別の発行前提として追加検証を要する。

## 3 生成前の結合と費目所有

固定constructorはprivate contextとconsumer slotを先に確保する。ST-02がreaderを取得する前に同contextへ結合し、cleanup完了後に別のbudget／clock／windowを差し込めないようにする。

local世代identityは生成時に1個だけ作り、revokedを単調な失効状態として持つ。単一attemptの本段階で世代を増やして再開せず、stop後に新しい世代／token／ownerを同じ入力で作り直す回復口を設けない。

| 費目 | 所有者と上限 |
|---|---|
| native取得・closed／cancel／release | ST-02 record。ST-03で再取得／再cleanupせず、既存の一度限り処理へ合流 |
| 発行claim／consumer claim | 同attemptにつき各1個。外部callback／clock呼出し前に消費 |
| 保持object | context 1、anchor／header／cleanup各1、terminal最大1、consume slot 1。履歴配列・token一覧なし |
| 観測と時間 | 元の固定clock／remaining検査をprivate context経由で再利用。別last値の時計を新設して単調性を再初期化しない |
| C/G/P/R | この段階は更新口なし。発行・消費でdispatch／read／予約移譲・返金をしない。ΔG=0はreader取得chunkの意味で、socket受信量の主張ではない |
| 解放 | readerはST-02が解放済み。token消費はlease／budget coreのrelease・session closeではない |

論理claim・保持上限の検査は必要だが、ここでRust側のwork modelや全体受付へ費用を追加・承認したとはしない。実runへの費目配賦は未接続のまま。

## 4 発行条件とprivate終端の確定

finishの一度限りclaimを立て、既存cleanup promiseを待った**同じ固定経路**からだけ発行判定する。診断の外部返却を経由して再入しない。発行claimはclock呼出しより前に消費し、どの結果でも未発行状態へ戻さない。

発行には全てを必要とする。

1. 同constructorのcontext／同record／同anchor／同local世代が有効で、revoked=false、first primary=null、refusal=nullである。
2. native headerのpurpose=release、status=403または404。ST-02が持つ元header参照を使う。
3. 同recordのcleanupが確定・confirmedで、wait_issue／reasonがnull。late settleで修復した結果を使わない。
4. bodyあり：同reader所有・closed capture済み・cancel fulfilled・pre-release closed fulfilled・release succeeded、read_started=false／read_pending=false。getReader／closed／cancel／release各試行1、read=0。
5. 真正no_body：元headerのbodyなしと結合し、reader所有なし、全native操作0、cancel／closed／releaseはnot_applicable。EOF・空JSONへ変換しない。
6. 元remainingが元floorより厳密に大きく、固定clockの検査直後にも①の状態・claim・同一性が維持される。clock callback中のstop／再入も拒否する。

条件を満たす場合のみ、private recordを参照するopaque tokenを1個作り、同じownerのprivate registryと固定consumerへ渡す。tokenにはsecretやresourceを公開fieldとして入れない。固定consumerへ渡すまでにawait／任意callbackを挟まない構造を初版の前提とするが、消費自体でも失効・時刻を再検査する。

401、auth／parent403、parent404、未知status、cleanup未確認、read開始違反は診断専用。hard HTTP失敗や取消を解除して発行しない。parent404を全用途共通のhard primaryに変更せず、local失敗として終える既存方針を維持する。

## 5 一度限りの消費順序

固定consumerは、同constructorが保持する期待context／anchorとtokenをprivateに受け取る。診断objectをconsumer引数とする口を作らない。

1. 自ownerのregistryでopaque identityをlookupし、期待context／anchorへの参照結合を確認する。foreign registryやtokenを変更・消費しない。
2. 自ownerに属するtokenの消費claimを未開始→consumingへ**同期変更**し、registryの再消費権限を外す。clock／callbackより先に行う。
3. 同local世代・未失効・primary／refusalなし、同元window／budget／固定clock、確定cleanupへの同一参照を検査する。
4. 元remainingを検査し、そのcallback後に③の条件とconsuming状態を再検査する。
5. 同private header／cleanupと発行時の適格性を再照合する。JSONで再解析・caller側で再計算せず、ST-02からのprivate事実を使う。
6. 最終remaining検査と、直後の失効／claim／同一性のpost-guardを行う。成功commitまでawait／callback／caller getterを挟まない。
7. consuming→consumedへ変更し、固定された注入試験用の限定結果だけを確定する。tokenやconsumerを結果へ返さない。

lookup失敗では受信側ownerを停止・自分の未消費tokenを失効させるが、foreign ownerのclaimは触らない。自tokenの消費開始後は、期限・取消・混入・再入・post-guard失敗のどれでもfailedへ進め、claimを戻さない。失敗後の別tokenへの差替え・同attemptの再発行も禁止する。

結果は概念上kind=injected_status_consumed、scope=injected_onlyとする案。全7権限=falseを保ち、release判定・fallback・retry・prepared・body ack／EOFの成功へ接続しない。成功した診断のcopyを再入力してもtokenにはならない。

## 6 状態遷移・発行後の失効

状態はprivateに保持し、外部からsetterで変更できない。

| 状態／遷移 | claimと作用 | 停止時の扱い |
|---|---|---|
| ContextBound→CleanupRunning | 同contextへ結合し、ST-02の既存cleanupへ合流 | resourceの後始末は継続するが発行は不可 |
| CleanupRunning→DiagnosticOnly | hard／local失敗・未確認・適格性不足 | cleanup事実と先行診断を保持。新tokenなし |
| CleanupRunning→TerminalIssued | 発行claimを消費し、全条件を通過 | 同時取消・再入・期限ではDiagnosticOnly／Failedへ |
| TerminalIssued→Consuming | 自registry照合後、消費claimを同期消費 | ここからの失敗も未開始へ戻さない |
| Consuming→Consumed | pre／post-guardを通過し、固定結果を確定 | 後から再消費できない |
| TerminalIssued／Consuming→Revoked／Failed | stop／close／期限・clock異常・拒否で消費権限失効 | 確定HTTP／cleanup事実は書き換えない |
| Consumed後のstop／close | ownerは失効し、次操作を拒否 | 既返却の診断copyは過去の事実として残るだけ。権限を持たない |

stop／closeでは、primaryとは独立したrevokedを先に立て、未消費terminalとconsumer slotを同期失効してから既存cleanupへ合流する。先行authentication_failed等があっても、primaryの文字列だけで「失効していない」と推測しない。

発行後に時間が進むだけの場合も、消費時の元clockで期限切れを拒否する。新しいexpiry timerは追加しない。持ち主のclose／取消による同期失効と、時間経過の消費時判定を区別する。

no_bodyはcleanupするreaderがなくても同じ失効・時間検査を受ける。消費失敗後にcleanupを再実行してtokenを作り直したり、cleanup確認済みだから業務権限を戻したりしない。

## 7 診断保持と失敗分類

HTTP軸（native header／用途／status）とcleanup軸（confirmed／unconfirmed／kind／reason／wait_issue／pre-release facts／操作数）は、ST-02が確定したimmutable事実への参照を保持する。発行／消費拒否でconfirmedをunconfirmedへ偽装せず、未確認cleanupをconfirmedへ修復しない。

接続側は有限の別slotに拒否stage（issue／lookup／pre_guard／post_guard／consume）・固定理由・失効状態を保持する。既存primary・refusal・stop_reasonを上書きしない。上位への接続時はprimaryだけでなくrefusal／revoked／消費結果の失敗でも停止し、ST-T17aの「read開始違反はprimaryがnullでも継続しない」を維持する。

| 条件 | 終端／消費 | 保持する診断・固定理由案 |
|---|---|---|
| release403／404、cleanup確認済み・live | 注入private token候補。消費後も全権限false | 元HTTP／cleanupは不変 |
| 401／auth・parent403、cleanup成功または失敗 | tokenなし、診断専用 | first HTTP primaryとcleanupの両方 |
| parent404 | tokenなし、local診断専用 | not_found_or_not_visible相当の局所候補。公開code変更は別承認 |
| cleanup未確認／read開始済み | tokenなし。拒否slotが非nullでも停止 | 元cleanup＋invalid_state等の固定拒否 |
| foreign／copy／別anchor・context | 受信ownerを停止、foreign claim不変 | evidence_binding_mismatch |
| 自token二重消費／発行再入 | 自ownerを停止し再発行不可 | invalid_state |
| 発行後cancel／close | 同期失効、消費拒否 | first primary優先、stop_reasonも保持 |
| 元floor到達・超過 | 消費拒否、claimは戻さない | deadline_exceeded。等号も拒否 |
| clock逆行・非数値／範囲外／throw | 確認不成立、消費拒否 | invalid_observation_time／internal_review_error。例外本文なし |
| 消費成功後の再投入 | 消費済みを拒否 | 既返却のcopyは権限なし、成功履歴を再実行しない |

表の理由は内部接続案であり、既存MCP JSONへ新しいenumや優先codeを追加したという意味ではない。公開終了code・sourceへの写像はST-A03／ST-A05等の承認と後続接続を要する。

## 8 合成受入条件（段階別・全条件の達成は未確認）

ST-03A〜Cで実行した試験は§10〜12と各検証記録を参照。本表は実session等の後続bindingも含むため、注入経路の成功から全条件を確認済みへ変更しない。

既存ST-01／ST-02試験を維持し、追加の注入専用試験ではprivate recordの経路を通す。負の対照のためのprivate fixtureは開発専用に閉じ、runtime登録口を追加しない。期待値は製品の発行適格性helperをimportしない手書き表・イベント観測で照合し、件数と各ケースの実行を検査する。

| ID | 条件 | 必須の結果 |
|---|---|---|
| STC-T01 | release403／404＋bodyのcleanup成功 | 同recordのtoken最大1、read=0、native操作の追加なし |
| STC-T02 | release403／404＋真正no_body | 操作0・NA維持、同anchorで1回消費、EOF／JSON化なし |
| STC-T03 | hard401／auth・parent403＋cleanup成功／失敗 | tokenなし、HTTP／cleanup診断保持 |
| STC-T04 | parent404・200・429／5xx・未知status | 対象外／local診断専用、retry／fallbackなし |
| STC-T05 | 未確認cleanup・late cancel／closed settle | 発行なし、事後の確認昇格なし |
| STC-T06 | 診断copy・JSON復元・分類器結果・ST-01 terminal | lookup拒否。native発行物として採用しない |
| STC-T07 | 別owner／attempt／window／budget contextの混入 | 受信側停止、foreign claimの消費なし |
| STC-T08 | reader取得／cleanup中の取消・close | 後始末を1回に合流、発行なし |
| STC-T09 | 発行guardのclock callbackからstop／再入 | 発行claimを戻さず、tokenなし |
| STC-T10 | 発行後・消費開始前の取消／close | 同期失効、消費拒否、cleanup事実保持 |
| STC-T11 | 消費pre-guard中の再入／取消 | claimを先に消費し、失敗後の再消費不可 |
| STC-T12 | 消費post-guard中の再入／取消 | 成功commitなし、診断保持、再発行不可 |
| STC-T13 | 発行／消費が元floor直前・等号・期限後 | 等号以後拒否。no_bodyも同条件 |
| STC-T14 | cleanup後・発行後のclock逆行／throw | 同じ単調観測を継続、last再初期化なし |
| STC-T15 | 同token／同attemptの二重finish・消費 | 1回目の事実保持、追加native操作・tokenなし |
| STC-T16 | read開始違反を模擬するprivate負の対照 | primary=nullでも拒否slotで停止、cleanup事実は保持 |
| STC-T17 | HTTP失敗と取消・消費失敗が重なる | first primaryと別拒否stage・二軸診断が残る |
| STC-T18 | 終了後に保持したtoken／成功診断を再投入 | 失効／消費済み拒否、closeでcore再openなし |
| STC-T19 | 同reader・native Promise操作の外側観測 | ST-02の一度限り処理・固定Promise・timer解放を維持 |
| STC-T20 | compiled／梱包・秘密marker・既存200経路 | 全7権限false、開発専用除外、本文非出力、runtime未接続 |

STC-T07等の不可能な内部状態の負の対照は、test専用の限定fixture内でのみ作る。公開factoryへ任意window／budget／registryの差替え口を増設しない。これらの試験計画は、実session・世代・正式leaseを確認した証拠ではない。

## 9 承認待ち・次の実装単位

本書への記載は承認そのものではない。親ST-A01〜ST-A07／A01〜A07は未承認のまま。

| ID | 承認待ち事項 | 対応する親要件 |
|---|---|---|
| STC-A01 | 固定constructor／private継続と注入tokenの発行元・scope | ST-A01／ST-A06 |
| STC-A02 | release403／404だけの適格性と診断専用の区別 | ST-A03／ST-A04、A02 |
| STC-A03 | 同clock／window・local世代の結合、claimを戻さない消費順 | ST-A01／ST-A02、A05 |
| STC-A04 | 同期失効・拒否slot・HTTP／cleanup診断の保持と停止判定 | ST-A03／ST-A05、A01 |
| STC-A05 | 注入試験／private負の対照・梱包除外とruntime非採用 | ST-A06／ST-A07、A07 |

実装の段階は以下の順序。ST-03A／Bの合成内部契約とST-03Cの注入native連続接続を§10〜12まで実装したが、実session／実transportへの接続済みとはしない。

1. **ST-03A**：同constructorのprivate context／anchor／発行claimと診断保持の内部契約。合成負の対照で混入・重複生成を先に検査し、外部診断からの昇格口は作らない。
2. **ST-03B**：一度限りconsumerと発行後失効を同じ状態機械へ接続。pre／post-guard・再入・取消・期限・first diagnostic保持をfake clockで検査する。
3. **ST-03C**：注入Response→同reader cleanup→private発行→固定消費の連続合成試験。ST-02の操作数・未確認時停止・Promise固定・梱包除外を回帰確認する。

実session／ReleasePermit／単一予算／固定sourceへの正式binding、status consumerのsource採用、retry／fallback、実通信はその後の別工程。正式発行口閉鎖・全体受付無効・調査保留を維持する。

ST-03C後の次工程は[実session binding・単一予算・停止owner接続差分draft-0.2](BEST_PRACTICE_ABORT_SCOPE_STATUS_SESSION_BINDING_DELTA_DESIGN.md)を参照。§10の内部binding・同期失効・診断保持をfake依存で実装。注入token／診断の正式権限への昇格やruntime承認は行わない。

## 10 ST-03A：合成依存限定の内部契約

[実装](../src/review/abort-scope-evidence-status-context.ts)は既存ST-01／ST-02とは別の開発専用module。private constructorでcontext／owner・local世代／readonly budget／固定clock／元windowを生成し、同じclosureでanchor・合成record・発行claim・診断slotを保持する。context／anchor／record／発行claimは各1回、発行draftは最大1個。ST-03A時点ではconsumer slotは予約だけで、消費操作は後続ST-03B（§11）に分けた。

外にexportするのは固定scenario名1項目だけを受け付ける閉鎖合成fixture。外部callback・consumer・既存owner・raw context／anchor／record・診断・session・registryを受け取る口はない。成功時もprivate identity／draft／token／更新portは返さず、scope=synthetic_contract_onlyのfreezeした限定診断・有限件数・全7権限=falseだけを返す。native用の発行口ではない。

fixtureの別呼出しは独立した合成事例であり、失敗した実run／実sessionを新しいownerで再開する口ではない。同じ合成owner内での再生成・再発行は拒否する。

- anchor生成は同contextを要求し、発行は同context／anchor／record／local世代／budget参照／clock／windowの参照結合を検査する。構造が同じrecord copy・診断copy・JSON復元診断も拒否する。
- context／anchor／record／発行claimをcallback前にstartedへ進め、終了時はspentとする。重複生成・混入・再入は停止し、失敗後の発行再試行でもclaimを戻さない。foreign ownerのclaim・診断は変更しない。
- 記録生成と発行は同じ単調remainingを使い、元floorの等号・期限切れ・逆行・clock throwで拒否する。発行clock中の取消・再入の後にもrevoked／first primary／refusal／同一性を検査する。
- 合成recordにおけるrelease403／404の適格な状態は、privateな**非実行draft**としてだけ保持する。hard401・local parent404・未確認cleanupは診断専用。read開始違反はprimaryが未設定でもrefusalから停止させ、cleanup確認事実は保持する。
- HTTP／cleanupはrecord内のimmutable参照を保持し、発行拒否・停止で書き換えない。first primaryとfirst refusal／stageを有限slotに残す。phaseは最後に書いた状態を示すだけなので、最初の終端状態（diagnostic_only／failed／revoked）を`first_terminal`としてfirst-winsで別に保持し、§6のFailed／Revoked区別はphaseではなくこのslotとprimary／revokedで判定する。stopはdraftを落とし、診断と過去の発行件数を残すが、復活・再発行しない。

fixtureのrecordは固定presetによる**合成事実**であり、ST-02のnative header／cleanupを受領した記録ではない。consumerのpre／post-guard・一度限り消費・発行後失効はST-03Bの§11へ進め、注入Responseからのprivate record連続受領はST-03Cに残る。local budget／世代を実canonical lease／source／ReleasePermitの証拠に昇格せず、§8の20条件全体の達成とも主張しない。

[合成テスト](../tests/review/status-context.test.ts)は製品のscenario一覧・適格性helperを使わない34ケースの期待表と、invalid／getter／proxy／権限／native非呼出し等、最初の終端状態保持6件を含む71件。[ST-03A検証記録](E2E_BEST_PRACTICE_STATUS_CONTEXT_ST03A_2026-10-31.md)と[梱包確認](../tests/review/package-http-classification.mjs)を参照。runtimeの発行前提・STC-A01〜A05／親承認は未承認のままとする。

## 11 ST-03B：合成consumer・発行後失効

同じprivate constructor内の`claims.consume`を消費slotとし、最大1回の消費を追加した。外部exportは従来と同じscenario名だけの閉鎖fixtureで、consume／token取得／registry提出口を増やさない。ST-03Aの発行試験ではdraft保持まで、追加の`consume_*`固定事例だけが内部の固定consumerを呼ぶ。

### 11.1 identityと消費順序

発行時はopaque identity→private draftの結合を自ownerのWeakMapへ1件だけ記録する。この表は**発行identityの履歴**であり、liveな消費権限ではない。live draftは別slotに保持し、stop／失敗／消費開始で直ちに落とす。履歴が残っていてもrevoked／claim／元clockの検査を省けず、再発行もできない。

consumerは自registryのopaque identityと期待context／anchor／record／local世代／budget／clock／windowを照合してから、claimをavailable→startedへ同期変更し、live draftを外す。foreign／コピー／診断を渡したlookup失敗では自ownerだけを停止し、未使用の自claimもspentとして診断と停止状態を一致させる（以後の正規token再試行もclaim前に拒否）。foreign claimは変更しない。自claimはlookup後の全失敗でfinallyからspentへ進め、再試行・巻戻しを認めない。

pre-guardでは未失効・primary／refusalなし・同一性・issue claim済み・consuming状態・record適格性を確認し、元clockを観測した**直後にも**同条件を再検査する。post-guardでも元clockと直後の条件を検査し、その後の成功commitまでawait／任意callback／caller getterを挟まない。record／発行／消費は同じ単調remainingと元floorを共有し、境界は厳密な`>`、等号は拒否とする。

### 11.2 失効と診断

stop／close相当の内部停止はrevokedを先に立て、live draftを落とす。既知の発行identityで消費を試しても、消費前やclock callback後のguardが拒否する。再入の消費もstarted claimを見て失敗し、外側の消費が成功へ戻ることはない。

HTTP／cleanupのimmutable事実、first primary／refusal／stage、stop_reason、first_terminalを保持する。`phase`は最新状態、`first_terminal`は最初の終端状態として独立に維持し、Consumed後の二重消費／停止でも最初のconsumedを消さない。拒否slotがある場合、primaryのnullだけを根拠に継続しない。

成功はkind=synthetic_status_consumed、scope=synthetic_contract_onlyの限定されたimmutable履歴を1件だけ残す。用途release・status403／404・body_mode cancelled／no_bodyと全7権限=falseだけで、token・identity・resource・source consumerは返さない。後から失敗／停止した場合も成功履歴は過去の事実として保持するが、再入力は拒否する。no_bodyをEOF／body ackへ変換しない。

### 11.3 合成確認と残課題

[consumer試験](../tests/review/status-consumer.test.ts)は製品のcase一覧／guard helperを使わない42ケースの期待表と詳細確認を含む60件。既存ST-03Aの71件を維持し、pre／post再入・取消・close・例外・期限・逆行、foreign／copy／JSON診断、二重消費／再発行、失敗後再試行、first diagnosticと成功履歴の保持を確認する。[ST-03B検証記録](E2E_BEST_PRACTICE_STATUS_CONSUMER_ST03B_2026-10-31.md)を参照。

ST-03Bは固定presetの合成recordからの消費である。注入Response→同reader cleanup→private発行→消費はST-03Cの§12へ進め、実session／認証snapshot／source／ReleasePermit／canonical予算へのbinding・runtime採用はさらに別工程。正式発行口閉鎖・Unknown・全体受付無効・調査保留とSTC-A01〜A05／親のruntime承認待ちを維持する。

## 12 ST-03C：同native constructorでの連続接続

[実装](../src/review/abort-scope-evidence-status-cleanup.ts)のprivate constructorへ固定issuer／consumerを結合した。既存`createInjectedStatusCleanupOwner`は従来の診断専用、追加の`createInjectedStatusWorkflowOwner`だけが同recordのcleanup後にprivate発行・消費を行う。modeは固定wrapperが決め、callerのmode／record／callback／consumer／registry／session設定では切り替えない。両entryとも開発専用でruntime非同梱。

ST-03A／Bは閉鎖合成モデルとして回帰用に維持する。そこへnative診断を再入力したりmutable issuerをexportしたりせず、ST-03Bで検査したguard契約をST-02の同private closureへ適用する。共有するのは契約であり、ST-03Bの合成presetを実recordに昇格する接続ではない。今後の契約変更では、合成参照モデルとnative固定経路の両方を回帰確認する。

### 12.1 生成・所有権・元clock

reader取得前にowner／local世代identity・元deadline・readonly budget参照・固定したbudget readをcontextへ保持する。同native Responseから得たprivate header、固定window／handle、同contextをanchorへ結合する。外部へ返す診断からではなく、同Record／anchor／header／cleanup参照をissuerとconsumerが直接使用する。

新entryのconstructor入力はfake_io／deadline_ms／budget／scheduleのdata-only固定4項目、budgetはdata-onlyのread関数だけ。proxy／accessor／余分なrecord・consumer・session等は採用せず、最初のacquireをI/O前にinvalid_inputで拒否する。clock／schedulerは合成I/Oの信頼済み依存であり、業務consumerを渡す口ではない。取得後のread method差替えや外側の入力deadline変更は、固定済み観測元を置換しない。

nativeのacquire・cleanup・issue・consumeは**同じsample関数とlast値**を継続する。元windowのcleanup floorへの厳密な`>`、最大60秒の元deadline、元の最大10秒windowを維持し、発行・消費用の新clock／timer／猶予は作らない。これは注入依存での論理期限検査であり、任意の同期callbackをOSレベルで強制中断する実装ではない。

### 12.2 private発行・固定消費

finishの一度限りclaim→同cleanup promiseの完了→private issue→固定consumeの順で進む。bodyありはread=0、同reader所有・closed取得・cancel／closed fulfilled・release成功と各操作1回を要求する。no_bodyは真正なnative null・全操作0・not_applicableを要求し、どちらもconfirmed／reason=null／wait_issue=nullだけを受け付ける。

同owner／record／anchor／context／元windowとrelease403／404を確認し、issue claimをclock前に開始する。観測直後にも未失効・primary／refusalなし・claim／phase／同一性を検査してからopaque tokenを最大1個だけprivate WeakMapへ登録する。issue claimをspentにしてから、await／任意callbackを挟まず同constructorの固定consumerへ渡す。

consumerはprivate tokenと保持recordを照合し、消費claimを開始・live tokenを除去してからpre／postの元clockと直後guardを検査する。取消・close・再入・期限・時刻異常では成功commitせず、claimをspentのままにする。lookup／native取得拒否等で未開始のclaimが残る場合も、停止時にspentとして再利用を拒否する。tokenとconsume APIは外へ公開しない。

結果はworkflow.consumptionのkind=injected_status_consumed、scope=injected_onlyで、用途release・status403／404・body_modeと全7権限=falseだけ。body ack／EOF・retry／fallback・ReleasePermit・prepared・実sourceへの採用を許可しない。外側finishのokは診断の確定であり、consumption=nullやHTTP失敗もあり得る。

### 12.3 停止と診断

同じrevoked・first primary／refusal／stop_reasonでnative取得とissue／consumeを停止する。hard HTTPは診断専用、未確認cleanupはprivate発行なし。stop／close／二重finish／foreign handleは所有resourceのcleanupへ一度だけ合流し、foreign ownerを変更しない。既存診断専用entryで取得・解放したResponse／handleも、新workflowへ再採用しない。

HTTPとcleanupのimmutable事実は消費失敗でも変更しない。phaseは最新状態、first_terminalは最初の終端として保持する。成功後のstop／二重finishでもfirst_terminal=consumedと限定された成功履歴を残すだけで、再発行・再消費・権限復活はない。遅いcancel／closed settleやrelease後のclosed変化で終端を格上げしない。

[連続合成テスト](../tests/review/status-workflow.test.ts)の49件と[ST-03C検証記録](E2E_BEST_PRACTICE_STATUS_WORKFLOW_ST03C_2026-10-31.md)を参照。初回の型エラーも記録した。STC-T07の実source／認証等のbindingやSTC-T11等の実dispatch費目は今回証明しておらず、全受入条件・runtime承認の完了とは主張しない。

実session／認証snapshot／source／ReleasePermit／canonical C/G/P/R予算の正式bindingと実transport採用は未接続。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留、STC-A01〜A05／親のruntime承認待ちを維持する。
