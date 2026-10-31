# AU-BR-006 同attemptのstatus-only終端・cancel-only cleanup詳細設計

Version: br006-status-only-terminal-draft-0.4 / Date: 2026-10-31。
Status: ST-01の§10合成issuer内部契約と、ST-02の§11注入Response／Streamsによるcleanup操作を開発専用に実装。正式証拠・runtime採用と承認は未実施。§8の受入条件は後続接続段階を含み、全件確認済みではない。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

親：[非200 HTTP対応設計](BEST_PRACTICE_ABORT_SCOPE_NON200_HTTP_DESIGN.md) §4／8。既存実装の照合元は[native adapter](../src/servicenow/review-native-adapter.ts)、[body lane](../src/servicenow/review-native-body.ts)、[説明用分類器](../src/review/abort-scope-evidence-http-classification.ts)。本書は実通信での確認記録ではない。

## 1 対象と閉鎖境界

authentication／parent／releaseの同attemptにおいて、真正なResponseのstatusを保持し、bodyを読まずに同resourceの後始末を確認する内部契約を設計する。status-onlyはJSON本文を受理しない終端、cancel-onlyはread／drainを行わない後始末を意味する。

- 200は既存body laneを維持する。429／5xxのdrain・retry／backoff、releaseのfallback受理、final予約枠の移譲は本書で接続しない。
- 純粋分類器の構造一致・raw status・例外codeは証拠にならない。分類器の全permissions=falseも変更しない。
- 同session／認証snapshot／ready世代／source／ReleasePermit binding／canonical lease・元t0に結合する。C上限210、G累計16MiB／1応答4MiB、全体60秒、bootstrap P=0、既存final予約を維持する。
- fixtureの登録・owner・claim台帳はruntimeと共有しない。正式body receipt／ReleasePermitの発行口、現行200限定guard、通常生成経路を開かない。
- 実装・実通信・実機操作・設定変更は対象外。後述の試験は受入条件であり、今回実行済みの試験ではない。

## 2 現行との差分と権限の分離

現行native adapterのcleanupは同じpromiseを共有し、cancel／closed／releaseを確認する。一方、readerなしは取得不明として停止し、null bodyも通常の取得成功にはならない。finish／consumeEndは既存primaryや失効を検査するため、停止後のstatus終端としてそのまま流用しない。body laneはEOFを必須とし、cancel完了をEOFへ変換してはならない。

分離する権限は次の2つ。

1. **業務継続権限**：停止時に同期失効する。未消費status証拠も失効し、cleanup成功で復活しない。
2. **cleanup所有権**：すでに所有する同resourceを片付けるためだけに残る。停止後も後始末できるが、再dispatch・read・証拠再発行はできない。

401等のhard HTTP failureではHTTP主診断を固定し、業務継続権限を失効してから後始末する。cleanupが確認できても**診断専用終端**とし、消費可能なstatus証拠を発行しない。将来承認された回復候補だけが、liveな同世代・cleanup確認・post-guardを満たす場合に内部status証拠の候補となる。現段階でfallbackやretryは許可しない。

## 3 所有者・内部型・発行元

以下は概念上の型名であり、新しい公開APIの宣言ではない。

| 所有点／内部型 | 保持するもの | 移譲・制限 |
|---|---|---|
| run owner | 認証snapshot identity、ready世代、source、lease、元期限、最初のprimary | 資格情報のcopyを証拠へ入れない。停止は同期失効が先 |
| AttemptAnchor | run／source／leaseのopaque identity、ordinal、固定purpose／URL descriptor、元の操作／cleanup期限 | 呼出し側のJSONや文字列一致では生成不可 |
| OwnedHeaderSnapshot | 同deliveryのnative getterから得たstatusとbody有無 | 分類器の申告値とは別物。Response claimと結合 |
| reader owner | 同じreader、固定したread／cancel／release操作、先にcaptureしたclosed | readerの取り直し・別streamへの交換不可 |
| CleanupRecord | 操作事実・pre-release観測・確認可否・固定理由 | freezeした診断copy。権限ではない |
| StatusOnlyTerminalEvidence | 同owner／attempt／descriptor／lease／世代と確認済みCleanupRecordへのprivate結合 | private registryだけが保持。copy／JSON／fixture発行物は不可 |
| terminal consumer | 同ownerのfinish claimとconsume claim | 一度限り。失敗後も戻さず、再発行しない |
| diagnostic owner | HTTP軸、cleanup軸、限定された拒否理由slot | 任意例外・本文・token・headerを保存しない |

正式issuerは将来の固定native ownerに限定する案とする。次の実装で合成issuerを用いる場合も別台帳とし、本物のsession／Responseを採用できる登録口を作らない。外側へ返す診断にはopaque identityや固定URLの実値も出さない。

## 4 状態遷移と一度限りの消費

基本順序は、binding確認→dispatch直前C計上→固定dispatch→真正なheader取得→mode固定→cleanup claim→cleanup終端→証拠候補または診断専用終端→一度限りの消費、とする。C計上とdispatchの間にgetter・await・外部callbackを挟まない。

| 遷移 | 必須条件 | 拒否・停止時 |
|---|---|---|
| header受領→mode固定 | 同attempt／同delivery。cancel_onlyまたは真正なno_bodyを固定 | modeの後変更、body lane／drainへの転用は禁止 |
| cleanup開始 | awaitや外部操作より前にcleanup claimを立てる | stop／close／finishの内部cleanupは同promiseへ合流 |
| finish | finish claimを同期消費し、同cleanup結果を待つ | 明示的な二重finishは拒否。2つ目の証拠は発行しない |
| 終端確定 | 固定事実をfreeze。適格性とcleanup確認可否を別判定 | 遅いsettleでunconfirmedをconfirmedへ昇格しない |
| consume開始 | 自ownerのregistry lookup後、自consume claimをconsumingへ変更 | callback／clockによる再入前にclaimを消費。foreign証拠は変更しない |
| consume完了 | 同anchor／世代／lease、live、期限内、cleanup確認済み、read未開始、post-guard成功 | 自claimは失敗しても戻さず、同attemptを再利用しない |
| stop／close | 業務継続権限・未消費証拠を同期失効後、abort／cleanup | 診断は保持。消費後の証拠を再発行しない |

証拠発行と消費の間の取消・期限切れ・source失効も拒否する。停止後に診断copyを読むことと、status証拠を消費して先へ進むことを混同しない。先行診断を上書きせず、混入／再入／二重消費の固定理由は別の限定slotに保持する。

## 5 cancel-only操作とcleanup判定

### 5.1 bodyがある場合

1. native brand・固定prototype／getter・未使用／未claimのResponseを検査し、同Responseをclaimする。locked／foreign streamを奪わない。
2. 同streamをclaimし、readerを1回だけ取得する。**readは0回**。cancelより前、releaseLockより前に、同readerの真正なclosed promiseをcaptureする。
3. cancel claimを操作前に立ててcancelを1回だけ呼ぶ。同期throwも1試行と数え、再cancelしない。
4. 元のcleanup期限内でcancelとclosedのsettleを観測する。pending readなし、cancel fulfilled、closed fulfilledを確認する。
5. releaseLock前に事実をsnapshotする。releaseLockは1回だけ試行し、throwしても再試行せずreader参照を手放す。release後のclosed変化を事前の成功へ読み替えない。
6. 元clockでpost-guardを行い、同attemptのCleanupRecordを確定する。

getReaderやclosed captureの途中失敗でも、所有できたresourceだけをbest effortで片付ける。二つ目のreaderを取得せず、所有確認が欠ければunconfirmed。取得前に拒否したforeign／locked bodyも、no_bodyやcleanup成功へ変換しない。

### 5.2 真正なno_body

同Responseの固定native getterがnullを返した場合だけno_bodyとする。reader取得・read・cancel・closed capture・releaseLockは全て0回。cancel／closed／releaseはfulfilledではなくnot_applicableとして記録する。no_bodyはEOF・JSON成功・body ackを意味せず、200のbody laneへ渡さない。

### 5.3 期限・中断・取得途中の扱い

- 同canonical lease・元clock・元cleanup floorだけを使い、cleanup開始時に新しい60秒／10秒等を作らない。250msの予約幅と実際に残るcleanup待ち時間は別で、固定250ms待てる保証にしない。
- 停止後も、所有resourceの後始末に限って元の時間観測を使う。ready/live検査の失敗を、cleanupそのものの実行禁止にしない。
- 期限到達・逆行・clock throwでは確認を成立させない。追加の待機・read・再dispatchはせず、finallyで所有resourceへの未実施cancel／releaseを各1回までbest effortで試す。これは期限の延長でも成功証拠でもない。
- late deliveryは既存の隔離・best effort discardに限定し、元attemptの確認を修復しない。rejectを観測して未処理rejectionを残さない。
- cancelによりpending readがdoneになっても、EOFを証明しない。read開始済みならstatus-only証拠は不適格。ただしcleanupが本当に確認できた事実までunconfirmedに書き換えない。

## 6 HTTPとcleanupの二軸診断

HTTP軸はobserved／unseen／失効後の未採用を分け、固定purpose・status・ordinal・分類候補を保持する。cleanup軸はnot_started／confirmed／unconfirmed、kind、cancel／closed／releaseの各事実、read pending、操作数と固定理由を保持する。runの最初のprimaryは別に維持する。

| 観測例 | HTTP軸 | cleanup軸 | 継続・上位診断案 |
|---|---|---|---|
| 401、cancel成功 | auth_failed候補 | confirmed cancelled | hard主診断を保持、診断専用。証拠なし |
| 401、cancel reject | auth_failed候補 | unconfirmed cancel_rejected | auth主診断とcleanup失敗を両方保持 |
| release403／404、cleanup成功・live | 回復候補status | confirmed cancelled／no_body | 将来の内部証拠候補だけ。現行fallback無効 |
| release403／404、cleanup未確認 | 回復候補statusを保持 | unconfirmed | 回復拒否。上位internal_review_error案は承認待ち |
| parent404 | local HTTP候補 | 独立に確認 | local失敗。分類器だけでglobal hardへ変更しない |
| 200、no_body | body不適格 | confirmed no_body | EOF／JSON成功にせず、既存200受理を緩和しない |
| dispatch前拒否 | unseen、C=0 | not_started | status証拠なし |
| dispatch同期throw／settled reject | unseen、C=1 | resource不在を確認できればno_response診断 | status証拠なし。未settleなら確認済みにしない |
| read開始違反後、解放成功 | statusは保持 | confirmed cleanup自体は真 | status証拠は不適格。理由を別slotへ保持 |
| 先行取消後にstatus到着 | 未採用／隔離 | 所有状況に従う | 最初のcancelledを維持。新しい証拠なし |

cleanupの主理由は現行と同じ優先順を基準案にする：reader_owner_unknown→read_pending→cancel_pending→cancel_rejected→closed_pending／closed_rejected→lock_release_failed→cleanup_deadline／observation_invalid。全事実も残し、主理由1つで他の失敗を隠さない。clock throwの例外codeからHTTP成功やcleanup確認を推定しない。

mode／binding／二重消費は適格性・消費拒否理由であり、cleanup事実を偽装しない。raw error message・response body・資格情報・任意headerは診断に含めない。公開終了codeの優先順位・既存上位契約への写像は承認後の別接続とする。

## 7 会計と費目所有

| 費目 | 所有点・不変条件 |
|---|---|
| C | 固定dispatcher直前の単一会計。cleanupは追加dispatchでないのでΔC=0。同期throw／rejectも開始済みなら1 |
| G | cancel-onlyはreaderからchunkを取得しないため追加ΔG=0。すでに取得したbytesがあれば返金しない |
| P／R／予約 | bootstrap P=0、既存retry・final枠を変更／解放／転用しない |
| 時間 | 元t0・単一lease・操作／cleanup floor。別clock・延長timerで救済しない |
| claim／保持物 | attemptごとにheader／mode／cleanup／finish／consumeを有限個保持。診断は固定slot、無制限配列なし |
| reader解放 | 同readerのreleaseLockだけ。canonical会計coreのrelease／closeとは別で、run全体の終了責務を奪わない |

ΔG=0はアプリがreaderから受領したchunkの会計であり、socketのprefetch／ネットワーク受信が0だったという主張ではない。実transportでの検証は未実施。未確認cleanupは新attemptや予約解放の根拠にしない。

## 8 合成受入条件（未実行）

独立oracleは製品のcleanup分類helperを使わず、イベント列と手書き期待表で、要求数と実native操作数・同reader・pre-release順序・C/G差分を照合する。各行の比較件数も検査し、空のfixtureで成功させない。

| ID | 条件 | 期待する確認 |
|---|---|---|
| ST-T01 | 同readerのcancel／closed成功 | read=0、cancel=1、release=1、同attempt終端 |
| ST-T02 | 真正なno_body | 全reader操作=0、not_applicable、EOF化しない |
| ST-T03 | cancel同期throw／reject／pending | 各1試行、未確認、二度目なし |
| ST-T04 | closed reject／pending／capture失敗 | pre-release事実を保持、確認成立なし |
| ST-T05 | releaseLock throw／release後closed変化 | release=1、事前観測の書換えなし |
| ST-T06 | foreign／proxy／used Response、locked stream | 混入拒否、所有しないresourceを奪わない |
| ST-T07 | reader取得途中失敗 | 所有分だけcleanup、reader再取得なし |
| ST-T08 | finish二重・close／cancel同時 | 内部cleanupは合流、終端発行1回 |
| ST-T09 | copy／別owner／別attempt／leaseの証拠 | 拒否、foreign claimは変更しない |
| ST-T10 | consume中の再入・post-guard失敗 | claimを戻さず、再消費・再発行不可 |
| ST-T11 | dispatch前取消・失効後late delivery | C=0または開始済み1を区別、lateから修復しない |
| ST-T12 | hard HTTP停止後cleanup成功 | 二軸診断だけ残し、消費可能な証拠なし |
| ST-T13 | 発行後・消費前に取消／世代失効 | 同期失効、消費拒否、cleanup診断保持 |
| ST-T14 | 期限直前／等号／期限後 | 元期限のみ。等号以後は確認不成立 |
| ST-T15 | clock逆行／throw | 固定理由、追加待機なし、best effortで成功に昇格しない |
| ST-T16 | pending readがcancelでdoneになる | EOFでなく、status証拠不適格とcleanup事実を分離 |
| ST-T17 | HTTPとcleanupの複合失敗・先行primary | 2軸と最初のprimaryを保持、上書きなし |
| ST-T17a | read開始違反（read≠0）をrunへ接続 | 拒否slotの非nullだけでもrun ownerは停止する（または内部primaryとして記録する）。primaryがnullであることを継続可能の根拠にしない。cleanup事実は保持し、terminal・retry・fallbackなし |
| ST-T18 | 会計境界・coreの寿命 | C/G返金なし、cleanupで予算coreを閉じない |
| ST-T19 | 分類器copy／fixture証拠の投入 | runtime証拠として拒否、台帳非共有 |
| ST-T20 | 既存200・固定評価セット・梱包 | body lane不変、正式口閉鎖、fixture非同梱を回帰確認 |

## 9 承認待ちと次の実装境界

全項目が未承認。親設計のA01〜A07を代替・承認済みにしない。

| ID | 承認が必要な内容 | 親との対応 |
|---|---|---|
| ST-A01 | 業務継続とcleanup所有権の分離、hard停止時は診断専用とする型契約 | A01／A02 |
| ST-A02 | 元cleanup期限と確認条件、短い内部subdeadlineの要否・値 | A01／A05 |
| ST-A03 | HTTP primary確定順・部分取得失敗・二軸診断の上位優先順位 | A01 |
| ST-A04 | 回復候補の限定範囲とstatus証拠のprivate consumer | A02。fallbackは別承認 |
| ST-A05 | 固定cleanup理由／適格性拒否と公開終了codeへの写像 | A01／A05 |
| ST-A06 | 合成issuerとruntimeの分離、注入native試験profileの閉鎖境界 | A07 |
| ST-A07 | 既存入口へ採用する条件とretry／drain等の後続工程の分離 | A01〜A07 |

最初の実装候補は、別台帳の合成issuerに限定した型・claim・診断専用終端・消費拒否検査とする。次に注入Response／Streamsだけで同readerのread=0・cancel-onlyを検証する。これらの実装許可は、実session接続・実通信・fallback／retry・正式証拠発行の許可ではない。

draft-0.1は設計と参照更新だけ。後続ST-01の実装範囲と未対応範囲は§10に分け、承認前のruntime分岐は追加しない。

## 10 ST-01：合成issuer限定の内部契約

[実装](../src/review/abort-scope-evidence-status-terminal.ts)は開発専用の独立ownerで、1つの合成bindingをsession／source／lease／ready世代の固定tupleの代理とする。これらの実objectやReleasePermitを受け取らず、本物のbindingを確認できたとは主張しない。ownerごとに最大1 attemptのみ。ordinalを進めるretry ownerは後続工程。

- private WeakSet／WeakMapでbinding／attempt／terminalを照合する。fixtureやruntimeの既存台帳をimport／共有せず、任意sessionの登録口も持たない。
- headerはpurposeと401／403／404、body有無に限定した合成申告。cleanupも固定7項目の合成事実であり、真正なnative取得・操作回数・同readerを証明しない。accessor／proxy／未知keyは拒否する。
- issue／finish／consumeのclaimはcallback前に消費。失敗後の再生成・二重finish・別binding／owner／attempt／証拠copyを拒否する。時計の再入や取消で状態を復活させない。
- 401とauth／parentの403はhard主診断を固定し、cleanup後も診断専用。parent404もlocal診断専用。release403／404のliveな成功は合成terminalだけを返し、その一度限りの消費も診断copyを返すだけで全7権限=false。
- stopは先行primaryを保持して未消費terminalを同期失効。取得済み合成attemptでは停止後もfinishからcleanup事実を格納できるが、継続権限を発行しない。
- cleanup理由とHTTP主診断を分離。read開始違反でも確認済みcleanup事実は保持し、別の拒否slotでstatus不適格を表す。ST-01ではこの違反をprimaryへ記録しないため、後続のnative／run接続ではprimaryだけを停止判定に使わず、拒否slotの非nullでも停止させる（ST-T17a）。no_bodyは全操作not_applicableを必須とし、EOFに変換しない。
- 元remaining観測は上限60秒・単調非増加・元floorへの厳密な`>`を要求。期限・clock例外・再入で証拠を出さず、秘密の例外文字列を保存しない。実canonical budgetや時間待機には接続しない。

nativeのread／cancel／closed／releaseLock、cleanup promiseへの合流、late delivery破棄、C/G更新、Response真正性、同reader／attempt実結合、上位終了codeは未接続。ST-T01〜ST-T20全てを確認済みにせず、ST-A01〜ST-A07と親A01〜A07も未承認のまま。正式発行口・既存200限定guardを変更しない。

[合成テスト](../tests/review/status-terminal.test.ts)と[検証記録](E2E_BEST_PRACTICE_STATUS_TERMINAL_ST01_2026-10-31.md)を参照。既存梱包除外`abort-scope-evidence*`を維持し、[梱包確認](../tests/review/package-http-classification.mjs)でruntime依存なし・fixture非同梱・compiled単独動作を検査する。

## 11 ST-02：注入Response／Streamsのcancel-only cleanup

[実装](../src/review/abort-scope-evidence-status-cleanup.ts)は開発専用の別owner。dispatch関数・URL・認証・session・ReleasePermit・ST-01への証拠発行口を受け取らず、注入されたResponseを最大1 attemptとして採用する。opaque handleとprivate台帳で同owner／同attemptを照合する。これは実session／source／認証snapshot／元のHTTP要求への正式bindingではない。fixture登録台帳は共有しない。

### 11.1 操作と所有権

- Response／stream／readerのnative prototypeとgetter／操作をmodule初期化時に固定する。proxy・偽造・subclass・使用済みResponse・再使用・locked／foreign streamは拒否し、foreign readerを奪わない。
- 同streamからreaderを1回取得し、そのreaderのclosed promiseをcancel前に1回captureする。readを公開も呼出しもせず、操作数は常にread=0。
- stop／close／finishより前に共通cleanup promiseを設置する。cancelとreleaseLockは各操作の前に状態・試行数を更新し、同期throw／rejectでも再試行しない。明示的なfinish claimも一度限り。
- cancelとclosedのsettleを元のcleanup floorまで観測し、releaseLock直前の事実をcopyする。同readerのreleaseを1回試行後、元clockでpost-guardする。release自身によるclosed変化や遅いcancel完了で終端を修復しない。
- no_bodyは固定native getterのnullだけ。reader操作は全て0回、cancel／closed／releaseはnot_applicable、EOFやJSON成功ではない。
- reader取得失敗はreader_owner_unknownで止め、二つ目のreaderを探さない。closed取得失敗後は保持readerをcancel／releaseするが、確認済みにしない。releaseが実際にunlockせずthrowした場合も再試行せず、解放未確認を残す。

操作数はnative操作の**試行数**。closed getterがthrowしてもclosed=1／closed_captured=false、getReaderがthrowしてもget_reader=1／reader_owned=falseとなる。bodyの既存prefetchやsocket受信量はread=0の主張に含まない。

### 11.2 停止・時間・返却

注入readonly budgetのremainingを元deadline（最大60秒）と単調非増加で照合する。固定window originとcleanup floorの幅は最大10秒、floorは既存の最低予約境界以上。開始時も各待機も`remaining > floor`が必要で、別clock・新しい期限は作らない。floor到達・時計異常では追加待機せず、保持resourceへの未実施cancel／releaseをbest effortで各1回だけ試す。確認失敗はHTTPとは別のcleanup理由とwait_issueへ保持する。

401／auth・parent403の先行primary、取消・closed、時刻・混入の先行失敗を上書きしない。取得の取消／拒否状態はprimaryと別のrevoked flagで保持し、hard HTTP診断が先行していても取得完了前の取消を見落とさない。明示stop_reasonも固定slotに残す。このflag自体は実sessionの失効証拠ではない。finishのokは**診断が確定した**という意味だけで、HTTP／cleanup成功の意味ではない。kind=cleanup_diagnostic_only、全7権限=falseで、terminal／consume／body ack／EOF証拠を返さない。cleanup不成立時は必ず非nullのprimaryを残す。

ST-01の合成terminalへnative結果を昇格する接続、実session／leaseとの結合、C/G更新、retry／fallback、公開終了codeへの接続は未実装。既存200限定body adapterとruntime生成口は変更しない。runtimeのfixture claim台帳にも触れない。ST-T17aのrun停止条件を承認済み・接続済みにせず、このownerではread API自体を持たせない。

[合成試験](../tests/review/status-cleanup.test.ts)はnative操作の同reader identity・順序・試行数を外側から観測し、製品の理由判定helperを使わない期待値と照合する。[ST-02検証記録](E2E_BEST_PRACTICE_STATUS_CLEANUP_ST02_2026-10-31.md)に初回の試験組立て失敗と修正も記録した。全体受付無効・調査保留と全承認待ちは継続する。
