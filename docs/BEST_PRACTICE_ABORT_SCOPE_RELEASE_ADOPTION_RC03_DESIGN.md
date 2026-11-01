# RC-03：release比較器の固定採用境界・接続差分設計

Version: br006-release-adoption-rc03-draft-0.14 / Date: 2026-11-01。
Status: **RC3-D01／D02／D03を開発assemblyだけに限定実装。同sourceの200行ackの固定比較、またはdispatch前binding不一致のnot_requestedから、guard・seal後の非実行summaryへ接続。R差替えは未実装／未承認。旧試験・正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実Permit発行・実接続・実通信・実機操作・設定変更・friend撤去・Pushは行わない。**

基準：`a61d90a`。[純粋比較器設計draft-0.6](BEST_PRACTICE_ABORT_SCOPE_RELEASE_COMPARATOR_DESIGN.md)のRC-03を具体化する。以下の追加field・状態・試験ID・分割単位は案であり、存在するAPIや検証済み保証ではない。

## 1 現在の接続点と不足

| 経路 | 現在の供給／消費 | RC-03で必要になる差分 |
|---|---|---|
| [実source](../src/review/bounded-source.ts) | `resolveRelease`／private release consumer→`#observeRelease`→既存値判定→`#completeRelease` | 同source内部で比較入力を組み立て、比較後guardを通った値だけを固定分岐へ渡す。公開draftの採用口は作らない |
| [実session](../src/servicenow/bounded-read.ts) | readonlyの`startedAt`、pin済み`releasePolicy`、既存`get deadlineMs()`、`assertActive`、private生成継続の`check`。getterは設定pinと同じ`limits.deadlineMs`を返す | getterを新設せず、同sessionの開始UTC／全deadline／policyを比較器へ結合する（未接続）。別session値や残時間による再計算は禁止 |
| [開発source](../tests/support/review/ef03/source.ts) | 同realmのcontext・private ackをissue／consume。D02 opt-inだけ同じrelease projectionを一度退避し、private取得後に破棄 | 通常profileは従来どおり破棄。実source証拠への昇格は禁止 |
| [開発assembly](../tests/support/review/ef03/assembly.ts) | contextはrun identity／snapshot／canonical lease。D01の固定UTC／policyにD02の固定比較・guard・seal後summary、D03のdispatch前no-requestを接続 | monotonic clockをUTCとして解釈しない。Rは未接続 |
| [開発bootstrap](../tests/support/review/ef03/bootstrap.ts) | 同coreでC/G/P、final4予約、固定200 bytes→decode→accept。release_matchはnot_evaluated | opt-inの比較結果は別の非実行summaryとして公開する。省略時の既存結果・予約／cleanupは不変 |

純粋比較器の成功は値の整合だけで、同sessionの真正な証拠ではない。hex binding、JSON、family文字列、公開summary、draftの形が一致しても生成元の証明へ昇格しない。

## 2 二つの接続を分離する

**D：開発assemblyの追加試験を先行**する。package-excluded root／別brand／別台帳の中だけで、同coreの固定200 transcriptと比較器を接続する。実class保証・本番admission・Permit発行を回復したとは数えない。旧profile／summaryは互換のまま残す。

**R：実sourceの値判定差替えは別承認**とする。既存classの通常private継続にfake fetch／Responseを注入する回帰で設計を確認する案だが、実装・本番切替・実通信は本書では行わない。D用のcontext・claim・fake時計・policy供給口をruntimeへ移植せず、新friendも作らない。

本番cap投入・入力上界が未確定のままRを有効化しない。D／Rの結果と件数は別集計し、B-03の保証表確定、EF-03C/Dのfriend撤去・配布負の対照を先取りしない。

## 3 供給元・所有権・identity

| 値／権限 | Dの供給元・所有者 | Rでの固定供給元 | 禁止する代替 |
|---|---|---|---|
| run開始UTC・全deadline | rootが開始前に固定したtest-only値／実際のroot deadline_ms | 同`#session.startedAt`と既存`#session.deadlineMs` getter。設定pinと同じ元の全durationを使う（比較器への結合・検証は未実施） | 観測時刻・remaining_ms・callerの新deadline |
| policy projection | rootがstrict copyした模擬値。実設定の真正性は主張しない | 同sessionのpin済み`releasePolicy` | raw設定・providerの再実行・別session policy |
| complete_200の観測 | 同sourceが消費するrelease ack内の同bytes由来projection | `#readReleaseRows`、または同constructorの`take(ack,'release')` | 別source ack・公開rows／draftの再投入 |
| 観測UTC | rootの固定test-only観測文字列 | 同ownerがguard後に一度採取するUTC値 | 比較器の現在時計、monotonic値のISO変換 |
| 停止／予算 | context内の同run／lease、既存guard／stop | 通常は`assertActive`、private生成継続では既存`check` | 新budget・新timer・外部summaryのprimary |
| 採用claim | source固有のrelease consume状態。ackをguard前に消費 | 既存private consumerのstate／releaseRead／cached promise | draft内boolや公開claim、D/R共通registry |

追加D条件はroot内で同じrun・source・snapshot・lease・ready世代へ一度だけ束縛する。wrapper objectの一致だけでなく、それを作ったrootが所有する各identityを確認し、copy／proxy／別realmを拒否する。値copy自体をidentity tokenにしない。

## 4 Dの追加条件と状態遷移案

test-only profileに明示opt-inの`release_comparison`を追加する案とする。内容は固定`started_at`、`observed_at`、policy projectionだけ。`deadline_ms`は既存rootの実値から取り、profileに重複fieldを設けない。comparison modelも実装の固定値を使い、callerのmatched／draft／Permit／callbackは受けない。

既存`source`／固定200`transcript`経路のみを対象にする。`native`の403／404 status-only laneと併用したprofileは開始前にinvalid_inputで拒否し、status終端を空200へ変換しない。D01／D02時点ではbinding不一致profileを開始前に拒否したが、D03では§13の専用no-request分岐へ限定接続した。矛盾したissue指定は引き続き開始前にinvalid_inputとする。誤って固定transcriptのrelease dispatchを行ってからnot_requestedにする経路を作らない。本番policyの判定変更ではなく、開発opt-inの段階的な対象制限である。

現在の`pinDevelopmentSourceProfile`の65,536文字枠を、新しいpolicy日時の承認済み上限として流用しない。比較条件は別のstrict data-only copyで固定し、getter／Proxy／特殊prototype・余剰keyを拒否する。日時長の未承認問題は残し、開発成功から本番のbounded入力を認定しない。

状態案：`release`→`consuming`→`comparing`→`value_accepted`→`done`→`closed`→`sealed`。

1. 元ackをMapから削除してからcontext／状態／guardを確認する。失敗してもackを戻さない。
2. 同sourceの行と束縛済み条件だけからRC-01入力を作る。比較前guardを行う。
3. 固定`compareRelease`を同期呼出しする。比較器・判定済みdraftを引数注入する口は作らない。
4. 比較後guardを行い、返値がinvalid_inputなら固定内部失敗として停止する。post-guardの停止理由があれば、その先行primaryを上書きしない。
5. 正常値だけをprivateに格納し、doneへ進む。同じack／contextで二度目のconsume・別sourceへの採用を拒否する。
6. 正常doneの候補は、rootの一度限りの診断slotへdata-only copyとして退避する。sourceのrevoke／closeではacks・rows・比較条件・元draft参照を無効化する。退避値は採用handleではなく、cleanupと終端結果が確定した後のsealでだけ公開する。停止・解放未確認ならslotの候補も破棄し固定診断だけを残す。closeで消した参照から後で値を復元する設計にはしない。

summary案は`release_comparison`という非実行の区分を追加し、固定scopeと権限falseを表示する。省略時の旧summary／bootstrap.release_match=not_evaluatedは変更しない。unknown／mismatchedも値比較の成功であり、このD経路のok=trueはレビュー開始可能を意味しない。prepared要求を設ける工程では別にrelease_not_admittedへ停止する必要がある。

## 5 Rのprivate入力生成とguard配置案

Rを後日実装する場合も、public `resolveRelease`にrows／policy／draft等の新引数は追加しない。通常取得とprivate ack取得の両方が、同sourceの固定private処理へ集まる構造を維持する。

固定順序案：既存入口guard／parent検査→同sessionのtiming・policy固定参照→binding不一致ならnot_requested（GET=0）→同sourceの200取得／projection→取得後guard→観測UTCの一度だけの採取→pure compare→比較後guard→private採用直前guard→既存結果生成。

timing供給は[既存deadlineMs getter再利用契約draft-0.6](BEST_PRACTICE_ABORT_SCOPE_RELEASE_DEADLINE_REUSE_DESIGN.md)に従う。構築時の設定pinと同じstartedAt／全deadlineを使い、同sessionのpin済みpolicyと対にして一度採取する。getter新設・残時間からのL再計算・設定provider再呼出しは行わない。getterの存在／setterなしを生存・identity・実行時改変耐性の証明にはしない。RP-01時点では既存固定fake-200継続のprivate projection生成／消費だけを限定実装し、比較器への入力化・通常実source差替えは行っていない。

通常経路のguardとprivate生成継続のguardを入れ替えない。callerが任意guard／時計／comparatorを渡す新公開APIを作らず、既存の生成継続とテスト用外部I/O注入だけを用いる。`releaseRead`、private consumerのconsuming、`#decision`のcached promiseを維持し、取消や失敗後の再試行で別の結果を採用しない。

### 同期処理と時計の限界

pure比較の途中にawaitはなく、JSイベントループの取消を同期計算の途中で強制実行できるとは主張しない。fake guard／元clockが進む境界でpre/post検査を試験する。設定日時長／総work上界が未確定なので、長い同期処理が全体60秒に必ず収まる証明にもならない。R有効化前の判断事項として残す。

現在の実sourceはresolved／conflict分岐でUTCを採取し、空値fallbackでは採取しない。一方、RC-01入力はcomplete_200なら空値でもobserved_atが必要である。R案では取得後guardと比較の間で一度採取するが、この追加採取・採取位置の差を無変更と偽らない。戻り値の時刻、壁時計逆行と上位reviewed_atの整合、時計失敗時の固定分類をfake試験で確認し、切替前に承認する。Dは固定UTC値を使うため、このR保証の代替ではない。

[観測UTC契約draft-0.5](BEST_PRACTICE_ABORT_SCOPE_RELEASE_OBSERVATION_UTC_DESIGN.md)に具体化した。complete_200は空200も含めprojection・取得後guardの後にOを一度採取し、再guardを通す。OU-01でこの部分を固定fake継続だけに限定実装した。not_requested等でOを捏造しない。S／全L／policyは不変。時計例外・検出した逆行は先行停止を保持した固定内部失敗とし、上位T_i／Eとの順序を時刻補正や証拠削除で救済しない。現行reviewed_atは取得時刻、ended_atはworker集約時刻であること、および低減LとJSON宣言deadlineの差も明記した。上位private UTC保持・上位結合とその試験は未実装／未実施で、本番差替えの承認ではない。

### 比較器入力・上位時刻の結合

CT-B前半は[上位時刻owner・終端移譲詳細設計draft-0.1](BEST_PRACTICE_ABORT_SCOPE_RELEASE_TIME_OWNER_CTB_DESIGN.md)へ分離した。同runの正常継続だけでS／全L／空200を含むOを一度移譲し、正常source解放と元run失効を区別する案。TB-A／B、上位時刻owner・worker job結合は未実装で、実source採用・正式発行を有効化しない。

CT-Aで、この契約の同projection／元ack／sourceのrows・O受領物→固定比較器→一度限りのprivate非実行候補受理だけをfixed fake継続へ限定実装した。空200のOも候補ownerに保持するが、cleanupで破棄し、TimeOwner／worker jobへの上位移譲は未実装。通常実source・legacy結果・Permitへ候補を採用しない。詳細・初回失敗と試験保証の区別は接続契約§10と[CT-A検証記録](E2E_BEST_PRACTICE_RELEASE_COMPARISON_CTA_2026-11-01.md)へ分離する。

[接続契約draft-0.3](BEST_PRACTICE_ABORT_SCOPE_RELEASE_COMPARISON_TIME_BINDING_DESIGN.md)で、同projection／sourceのrows・O受領物と、一度限りの固定比較、空200のprivate UTC保持、同worker世代／jobのT_i・E照合を対にした。現状のUTC文字列hookやworker数値idだけで同一性を認めず、親側のprivate claim・固定継続に結合する。役割型の全体結合とCT-B／Cは設計案で、上位owner・job claimは未実装。legacy／Permit採用・通常source差替えを行わず、soft partialとhardなbinding／時刻失敗を分ける。

## 6 draftから既存結果への変換――二重warningとPermitの境界

| 比較結果 | D | Rの将来案 |
|---|---|---|
| invalid_input | guardの先行理由を保持し、それがなければ固定内部失敗。draft非公開 | trustedな内部projectionの矛盾として停止。通常のunknownへ格下げしない |
| ok／unknown・mismatched | 権限なしの値summaryだけ | evidenceをfresh clone、limitationsを新規copyして既存の非matched公開decisionを返す。`#completeRelease`へ再投入しない |
| ok／matched | 同様に非実行。Permit生成・実source登録なし | freshなevidence／warning copyを既存private`#completeRelease`へ渡す案。Permit blockは既存class内だけで、別承認前にこの分岐を有効化しない |

既存`#completeRelease`は非matchedでrelease_unknown／release_mismatchを追記する。比較器の完成済みlimitationsを丸ごとこの分岐へ渡すとwarningが重複するため禁止する。単なる文字列の包括的な削除／sortで補正する方式も禁止し、上表の固定分岐で順序を保存する。

pure draftはdeep freezeされているが、既存公開ReleaseDecisionのevidenceは可変のまま独立したprivate snapshotを持つ。Rではpure値→公開用fresh clone→既存private snapshotを分離する。[旧snapshot試験](../tests/review/source-release-binding.test.ts)の公開raw_buildname変更がthrowするような凍結強化を混ぜない。

matchedのprivate生成中・bind直後の失敗も、返却前に同session停止で権限を無効化し、未公開結果を返さない必要がある。既存binding側のcheck・同期revoke・closeとprivate fieldsの解放を追跡し、対応不能ならRを有効化しない。新しいpublic revoke／draft adoption／friendで穴を埋めない。cached promiseが拒否された後に新Permitを作り直す救済も行わない。

## 7 失敗層・診断の保持

| 元の事実 | 本設計での扱い |
|---|---|
| Dの不正profile／条件の構造不正 | 開始前invalid_input。入出力にraw値を出さない |
| identity混入・二重consume・内部policy矛盾 | D内部は順にevidence_binding_mismatch／invalid_state／internal_review_error、公開codeはいずれもinternal_review_error。Rは既存run ownerの先行診断を保持してinternal_review_errorへ停止。新たな公開codeを増やさない |
| ownerのUTC採取失敗／非有限clock | D内部invalid_observation_time→公開internal_review_error。Rの停止ownerへの結合は切替前の確認事項。一般のinvalid_observationにしない |
| cancel／closed／deadline／phase deadline／receive cap／auth | 元の固定停止理由を保持。invalid_observationやfallbackへ変換しない |
| R legacy readRows／projectionのinvalid_response | 既存の限定catch境界でのみinvalid_observation→observation_incomplete案。raw22行と有効21行sentinelを区別 |
| D旧profileでの不正projection／bootstrapのUTF-8／JSON不正 | 既存どおりinvalid_responseで停止。比較器まで届く値に勝手に変換しない |
| legacy非200のaccess_denied等 | 現在のcatch／設定代替を据置き。RC-03の200値移行へ混ぜない |
| native status-only／cleanup未確認 | 既存status／cleanup二軸を保持。200・空配列・invalid_observationに偽装しない |

ordinary unknownはrun stopとは別である。正常な比較値で先行HTTP／cleanup／run primaryを消さず、post-guard失敗なら計算済みdraftより停止を優先する。revoke・解放後に診断の固定copyだけを残し、資格情報・raw bytes・例外本文・identity handleをsummaryへ出さない。

## 8 費目所有と上限

既存GETのC、同bytesのG／P、final4予約、retry、reader cleanupは既存ownerのまま。pure比較・値採用のためにdispatch／chunk／reserve／releaseを追加実行しない。D固定200のparent／releaseは従来どおりC=2、exchangeがあればC=3、P=0、Gは実際の受信bytesの合計とする。最終予約は成功・拒否・取消で一度だけ返却し、新たに取り直さない。

観測rows最大21・build_name最大40・既知family最大5・limitations最大5はRC-01／02どおり。比較入力copy・結果copy・guard費用と設定日時の未承認長を、未実装の全体work／allocationモデルへ確認済みとして加えない。最初のD試験で会計不変を検証しても、本番の受信量／同期実行時間上界の証明にはしない。

## 9 fake I/O受入条件案

| ID | 独立に期待する条件 | D／Rと残る限界 |
|---|---|---|
| RC3-INPUT | 同run開始・全deadline・policyが途中で置換されず、残時間でexpiry判定を変えない | D固定値／R同sessionを別集計 |
| RC3-IDENTITY | foreign run／source／lease／snapshot／世代、copy／Proxy、公開draft混入を拒否。別rootの状態不変 | D成功だけでR保証にしない |
| RC3-ONCE | 同ack二度・consume再入・失敗後再開・close後採用を拒否。claim復活なし | 比較器自体の反復可能性とsource採用claimを区別 |
| RC3-GUARD | 取得後・比較前／後・公開直前の取消／元deadline／closeでdraft非公開、先行理由を保持 | 同期関数の強制preemptionは主張しない |
| RC3-VALUES | 5family、空／不完全／未知／21／raw22、期限切れ競合、全limitations順序を固定期待値で確認 | 新旧同じ関数の差分比較だけをoracleにしない |
| RC3-CLOCK | UTC採取回数・採取失敗・逆行を確認。観測時刻でpolicy期限を延ばさない | Rの新採取位置は未承認 |
| RC3-BOUNDARY | body decode／projection／非200／cleanupの原因層を区別。設定で取消等を救済しない | 非200の挙動変更は対象外 |
| RC3-ACCOUNT | 同coreのC/G/P・final4予約／返却・cleanup回数が比較追加で増減しない | D／Rの元入力／retry条件ごとに期待値を独立記述 |
| RC3-OUTPUT | Dはseal後の非実行summaryのみ。Rの公開可変copyとprivate immutable snapshotを分離。warning二重付与なし | 実Permit結合は別承認 |
| RC3-PACK | dev root／claim／fake時計が本番import・宣言・mapへ混入せず、旧compiled回帰も維持 | 専用開発compiled保証はB-03 |

旧試験は削除／skip／期待緩和しない。旧caseの対応表は新しい実在caseと未代替保証を確認してから更新し、本書だけで分類・件数を変更しない。期限やACL要件を緩めず、全体テストの重複起動も避ける。

## 10 次の分割単位と承認待ち

1. **RC3-D01（限定実装済み、§11）**：同rootのtest-only時刻／policy条件・private bindingと一度限りclaimを追加。まだ比較を実行／公開せず、旧profile・summary不変と混入／失敗停止を確認。
2. **RC3-D02（限定実装済み、§12）**：同sourceの200行ack→固定比較→pre/post guard→非実行summaryを接続。会計／予約／cleanupの継続を確認。status-onlyは除外。
3. **RC3-D03（限定実装済み、§13）**：no-requestのbinding不一致分岐を固定transcriptのdispatch前へ接続し、release GET=0・予約返却を確認。設定代替・競合の連続caseを追加。
4. **RC3-R01（別承認）**：実source採用差分のfake-I/O試験を先行。下表の保留が解決するまで通常入口へ切り替えない。
5. **B-03**：保証表と専用開発compiled試験を別工程で確定。friend撤去・本番切替・実通信は別承認。

| 承認／未確認項目 | 現在の扱い |
|---|---|
| 設定日時文字数の有限上限／長い小数秒の互換方針 | 承認待ち。Dでも本番上限を認定せず、新capを投入しない |
| 全入力byte／work・同期比較の時間上界 | Unknown。全体受付・R有効化の根拠にしない |
| Rのcomplete_200 UTC採取位置・空観測時の追加採取 | 観測UTC契約draft-0.5のOU-01で固定fake継続の採取／guardだけを部分確認。通常source差替え・上位整合・採用は未実施／承認待ち。D固定値で代替しない |
| Rのtrusted入力矛盾の停止owner・bind中失敗の無効化／解放 | 既存private lifecycleとの追跡が未完了。公開新入口で代替しない |
| Dの条件profile／非実行summary追加 | 本書の提案。省略時互換、package除外を実装時に検証 |
| Rの全deadline再利用契約（既存getterと、`pinReviewReleaseConfig`へ渡す`limits.deadlineMs`の同値性） | getterは実在。RP-01で同sessionのprivate projectionと固定fake継続の一部動的検証を追加。比較器への結合・通常実source差替え・全受入条件の完了は未実施。private `limits`の公開・残時間再計算・caller指定で代替しない |
| 本番値判定差替え・実Permit経路・非200移行 | 未承認。現状を維持 |

この設計の作成を実装・採用・鍵／設定・通信の承認へ読み替えない。調査保留と正式発行口閉鎖を維持する。

draft-0.2では供給口を未実装と訂正したが、このAPI不在の説明は誤認だった。draft-0.8の静的再照合で既存`get deadlineMs()`を確認し、§1／§3／§10を再訂正した。未実装差分はgetterの新設ではなく、同sessionのstartedAt／pin済みpolicyと組にして比較器へ結合・検証すること。[再利用契約draft-0.6](BEST_PRACTICE_ABORT_SCOPE_RELEASE_DEADLINE_REUSE_DESIGN.md)に現状根拠・残時間との区別・受入条件とRP-01の限定実装範囲を記録する。R切替の承認状態や過去の試験履歴は変更しない。

## 11 RC3-D01の限定実装

基準`44ab4de`。[開発条件module](../tests/support/review/ef03/release-conditions.ts)はrootごとのWeakMap／WeakSetを持ち、`release_comparison`の固定3field（started_at／observed_at／policy）をRC-01構造parserでfresh copyする。deadlineはrootの既存deadline_msだけから取る。条件handleはopaqueで、bind前に一度限り消費する。日時長capは追加せず、policy期限／issueの意味比較はD02へ残す。binding値の相違、またはbinding不一致issueのprofileは開始前に拒否する。

同じ開発source realmのprivate WeakMapに登録されたsource／contextだけを認め、context内のrun／snapshot／lease、元deadlineを結合する。bindはsourceのnew／世代0、claimはready後のparent／世代1を要求し、claimingをguard前に立てて再入を拒否する。成功も失敗もclaim・handle・run世代を再利用せず、元の固定診断を保持する。別realm／copy／Proxy／別source／別lease混入は認めない。新たなruntime registryやfriendは作らない。

rootはsource生成後にbindし、同じready継続の直後にclaimする。停止・finallyで参照を破棄し、summaryには条件・owner・claim・比較draftを追加しない。省略時だけでなくD01 opt-in時も旧source／transcript summaryとdeep equalになることを確認した。nativeとの併用はdeliveryをpin／消費するより前に拒否し、そのdeliveryは元の旧native profileで引き続き使用可能とする。

`compareRelease`は呼ばず、release行は従来どおり消費して破棄する。条件を保持することと、設定の真正性・比較結果・本番bindingの証明を区別する。C/G/P・final4予約／返却は元ownerのまま。[D01検証記録](E2E_BEST_PRACTICE_RELEASE_CONDITIONS_D01_2026-11-01.md)に新規31件、既存回帰、型／梱包／全体確認を記録する。実sessionの既存deadline getterの比較器への結合を含むR側の保留は解消していない。

## 12 RC3-D02：同sourceの行ackからseal後summaryへ

基準`6c3d8f3`。§11はD01時点の履歴であり、D02では明示opt-inに限って次を追加した。通常profileのsummaryやsourceのrow破棄動作は維持する。

1. 同realm／contextにbindする際、sourceのprivate観測slotを一度armする。元release ackは従来どおりguard前に消費し、その同じprojectionだけをslotへ退避する。callerのrows／draftを比較引数として受けない。
2. 同sourceのrelease consume完了・世代1・停止なしを確認してownerをcomparingへ遷移させる。観測slotはguard前に一度消費し、固定`compareRelease`を呼ぶ。取得後・比較後にもownerとsourceの失効／先行primaryを再確認する。post-guardがsourceだけをrevokeしても採用しない。
3. pure不正入力はinternal_review_errorとして停止する。ただしpost-guardの取消等が先行すれば、その理由を優先する。ordinary unknown／mismatchedは非実行値として受理する。UTF-8／JSON／projection不正は従来のinvalid_responseで停止し、値unknownへ格下げしない。
4. rootの正常body完了時、ownerのtakeForCloseを一度だけ消費してfresh deep-frozenのdata-only候補をroot内slotへ退避する。source／ownerのrevokeで行・条件・元draftを破棄する。別source・再入・二重compare／transfer・失敗後再開は認めない。
5. sourceのclosed／sealed、constructionのcleanup confirmed、先行失敗なしを必要とする。cleanup直前の同canonical leaseの残時間を保持し、cleanup後は元のmonotonic開始・全deadlineと外部signalを再確認する。残時間が最後の観測より増える逆行（開始時刻より後でも）、時計失敗・期限切れ・取消なら候補を捨てる。時計callback中の取消も再確認する。既存primaryを後の値で消さない。cleanup後の再確認はteardown確定後なので、候補を捨てて固定の`release_comparison_withheld`理由を付けるだけとし、run全体のok・code・run_primaryを書き換えない（opt-inの有無で既存summaryが変わらない）。

実際の状態所有は、sourceのrelease→consuming→done→closed→sealedと、条件ownerのclaimed→comparing→compared→transferring→transferred→closedに分離した。比較器・時計provider・cleanup stackを新たにprofileから注入する口はない。既存のtest-only clock／waitだけで境界試験する。

成功時だけroot summaryに`release_comparison`を追加する。scopeは固定release_value_comparison_only、kindはrelease_comparison_draft、権限4項目はfalseで、全階層freezeする。rootの既存scope／permissions、bootstrap.release_match=not_evaluatedは変えない。省略時は新field自体がない。matchedやok=trueもレビュー開始可能・実Permitを意味しない。

会計・final4予約／返却・native cleanupは既存ownerから動かさず、比較のための再dispatch／再課金をしない。native／status-onlyとbinding不一致no-requestは引き続き未対応profileとしてI/O前に拒否する。空200の設定代替は純粋な値判定であり、実HTTP fallbackを有効化したものではない。

[D02検証記録](E2E_BEST_PRACTICE_RELEASE_ADOPTION_D02_2026-11-01.md)に新規44件と既存を含む関連202件、型／梱包／全体結果を記録する。D01のopt-in互換4ケースは「新fieldを除く既存部分のdeep equality＋新fieldの固定値確認」へ明示的に更新し、旧profileの期待を緩めていない。専用開発compiled保証・実class正式binding・Rの既存deadline getterの結合・日時長cap承認待ちは残す。

draft-0.5のレビュー修正：cleanup後の時計・取消・期限の再確認が候補の破棄に加えてrunの`stopped`／`run_primary`を設定し、teardown確定済みで本体が正常終了したrunを`cancelled`等へ書き換えていた。§12-5の「候補を捨てる」と「後の値で消さない」に合わせ、候補の破棄と固定の`release_comparison_withheld`だけに限定した。上位設計からの版数リンクも更新した。

## 13 RC3-D03の限定実装：dispatch前no-request

基準`0f14dc4`。D01／D02のprivate条件ownerへ`beforeRelease`を追加し、同context／source／lease・ready世代・親consume済み／release未開始を確認する。claim済み→decidingをguard前に消費し、通常経路はrequestedへ、不一致経路はcomparedへ進む。二重判断・再入・別source／context・失敗後再開は拒否する。比較器や結果の注入口を追加しない。

1. profileの3field・日時形式・strict copyは維持する。assertionのbinding値不一致と`issue=config_binding_mismatch`が同時に成立するものだけがno-request対象。値とissueの矛盾（不一致だがissueなし等）は従来どおりclock／I/O前にinvalid_inputとする。profileの`observed_at`は互換のため引き続き必要・形式検査対象だが、この分岐では比較入力・出力に入れず、観測したと主張しない。
2. per-user／cachedの既存ready、またはexchangeの認証受理→ready、親200の同bytes課金／private consumeを完了してから固定入口で判断する。認証・親の失敗や先行停止をbinding不一致で隠さない。
3. 不一致なら元started_at／全deadline／policyと`observation:{kind:not_requested}`を固定比較器へ渡す。pre/post guardとpolicy日時整合は維持する。sourceの同realm専用終端でrelease未consumeのままdoneへ進め、完了後guardを確認してからprivate候補を保持する。空200・実測・status-onlyの証拠にはしない。
4. transcriptのrelease行の`observe→dispatch→C増加`より前にfalseを返し、delivery・timer・chunk課金・decode・projectionを実施しない。C/G/Pは認証／親だけの実績、release GET=0。source値profileでもrelease projectionを省略するが、profile全体の安全なpinは省略しない。未使用bytesは既存disposeで破棄する。
5. 既存bootstrap会計ownerのfinallyがfinal4予約を一度だけ返し、reserved=0にする。`bootstrap.release_attempts`は予約返却試行の既存名称であり、release GETの回数ではない。予約・cleanupの別ownerや予算を追加しない。
6. rootへの一度限りtakeForClose、同leaseのcleanup直前残時間、固定cleanup・source seal、最終公開guardはD02のまま。cleanup後の失敗は`0f14dc4`どおり候補だけをwithheldにし、確定済みrun診断を書き換えない。結果はunknown／config_binding_mismatchの非実行summaryだけで、権限4項目はfalse。

同じbindingの設定代替・実測／設定競合はreleaseを取得してから従来の比較を行う。別のbindingなのに「実測が一致すれば救済する」処理はない。[D03検証記録](E2E_BEST_PRACTICE_RELEASE_NO_REQUEST_D03_2026-11-01.md)に独立会計oracle・停止／再入／混入・上限と予約返却を記録する。実source／session・Permit・本番fallbackの移行、B-03専用compiled保証、日時長cap・work上界の承認は残す。

draft-0.7のレビュー修正：条件ownerの`compare`が`requested`に加えて`claimed`からも開始でき、`beforeRelease`のrelease要求判断を経ずに比較できる余地が残っていた。開始状態を`requested`だけに限定し、claimed→deciding→requested→comparingの順序を固定した。

draft-0.14の版数整理：CT-B前半の[上位時刻owner設計](BEST_PRACTICE_ABORT_SCOPE_RELEASE_TIME_OWNER_CTB_DESIGN.md)への参照を本文へ追加した変更で版数を上げていなかったため、版を上げ参照元のリンクを更新した。
