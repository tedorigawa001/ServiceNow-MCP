# AU-BR-006 canonical会計とprivate生成位置の差分設計

Version: br006-canonical-session-migration-draft-0.4 / Date: 2026-10-29。
Status: §9〜10のCM-01／02に加え、§11のCM-03で注入native/typedのdispatch直前C計上を単一予算へ接続。native/typed実session採用・実通信は未実施。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実通信・実機操作・設定変更・Pushの承認ではない。

目的は、NA-03の注入native経路を将来接続する前に、会計・停止・時計の唯一の所有者と移行順を決めることである。readonly leaseを更新portに昇格させず、稼働中のlegacy sessionをtypedへ切り替えない。

基準：[接続差分設計](BEST_PRACTICE_ABORT_SCOPE_REAL_TYPED_BINDING_DELTA_DESIGN.md)、[native adapter設計 §15](BEST_PRACTICE_ABORT_SCOPE_NATIVE_ADAPTER_DESIGN.md#15-na-03native終端証拠とrt-b03の同bytes接続)。現行：[session](../src/servicenow/bounded-read.ts)、[lifecycle](../src/servicenow/review-evidence-lifecycle.ts)、[source](../src/review/bounded-source.ts)、[NA-03 bootstrap](../src/servicenow/review-bootstrap-contract.ts)。

## 1 現行の所有点と未接続部分

BoundedReadSessionがrequests／receivedBytes／payloadBytes、元started、limits、stopCode、controller・phase・timer、同時実行枠、credential参照を所有する。#runLeaseはこれらのreadonly viewで、#runOwnerは同snapshot／leaseとready世代・source／ReleasePermitのprepared bindingを保持する。

NA-03はconstructor注入のfake accountingと同leaseでnative終端証拠→同bytes解析→ackを検証した。実session constructorはbootstrap依存を渡しておらず、NA-03の成功を実sessionの会計更新権限にしていない。最新のwindow_origin_ms修正はattempt発行時の形状と後続の期限観測を分離したものであり、この設計でも維持する。

| 費目 | 現行コードの更新点 | 移行先の責務 |
|---|---|---|
| C | session.attemptのrequests++。controller／timer設定・fetch呼出しより前 | 唯一のdispatch計上。legacy位置を先に保存し、typedへの精密化は別工程 |
| G | session.attemptのread後receivedBytes加算。NA-03はaccounting.chunk | 同採用chunkの加算。超過費用を保持し、copy／解析で再課金しない |
| S | session.attemptの局所size、RT-B03の局所保持量 | attempt内の上限。累積Gをリセットしない |
| P | session.chargePayloadBytes | sourceのpayload文字列受領時に一回加算。schema拒否でも返金しない |
| R | legacyの固定4差引き、fake bootstrapのreserve／release | laneごとに一方式だけ選ぶ。両方を重ねない |
| clock | session.startedとperformance.now、remainingMs／phaseRemainingMs | 同じt0・hard期限・phase reserve。再生成しない |
| first stop | session.stopCodeとrun ownerのprimary | 発生順を同期し、cleanup事実と別軸で保持。理由値は§4の写像を維持 |
| admission／credential解放 | session.close | sessionだけが一度返却・破棄。会計ownerやnative ownerは重複解放しない |

## 2 canonical状態と更新port

canonical状態は新session生成時にゼロから一度生成する。既存statsのcopyで別会計を開始せず、移行後も旧fieldと新counterを並行更新しない。legacyの公開statsと既存#runLeaseは同じcanonical状態のsnapshotを読む。

更新portはconstructor内だけに保持するclosureとし、readonly lease、stats、diagnostic、prepared viewから取得できない。lookup-by-session、raw session登録、後付けsetter、公開Optionsへのlane／accounting指定は追加しない。更新operationは固定用途で、任意counter名・減算・初期値・resetを受け取らない。

| 内部operation案 | 固定規則 |
|---|---|
| dispatch commit | live・残C／R・用途を検査してCを一度増加。同期throwも計上後の費用を保持 |
| chunk commit | 検証済みbyte長をGへ一回加算。G超過なら停止し、加算を戻さない |
| payload commit | UTF-8 byte長をPへ加算。総量超過はstop、単体超過は既存payload_limitの扱いを維持 |
| final枠の処理 | legacy固定差引きかtyped予約かを新規runで固定。一度の解放でC/G/Pを減らさない |
| stop | first reasonを先に固定し、採用権限失効→abort／cleanup要求へ進む。後続理由で上書きしない |
| read | C/G/Pと元残時間のimmutable copyのみ。更新・再開・証拠発行の権限を持たない |

限度値は既存BOUNDED_LIMITS以下の低減だけとする。C≤210、G≤16MiB、S≤4MiB、P単体≤2MiB／総量≤8MiB、全体≤60秒、attempt≤10秒を増やさない。Sとchunk数はRT-B03側の既存所有を維持し、canonical側に第二の保持bufferを作らない。

## 3 dispatch計上の移行を二段階に分ける

現行legacyではC加算がfetchより前にある。NA-03も外側accounting.dispatchの後にnative acquireを呼ぶため、後続の入力・clock検査でHTTP未呼出しのままCが計上される余地がある。window_origin_msによる形状修正だけを「未dispatchなら必ずC=0」の証明にしない。

第一段階ではlegacy更新点をそのままcanonical operationへ移し、既存挙動を変えない。正常・HTTP同期throw・期限・低減上限のイベントoracleで移行前後を比較する。公開挙動の精密化やretry変更を同じ変更へ混ぜない。

typed接続段階では固定dispatcherの直前へC commitを置く。NA-02のshape／binding／live preflightを先に済ませ、C commitと注入dispatcher呼出しの間にawait／新しい入力getter／任意callbackを挟まない。未到達のpreflight拒否はC=0、dispatcher呼出しの同期throw／rejectはC=1とする。native acquireと外側bootstrapで二度計上しない。

この固定dispatch境界の変更には個別のRED／GREENが必要で、第一段階のcounter移行成功から自動的に有効化しない。

## 4 停止とcleanupを同じ寿命へ結合する

first stopの固定、ready／source／transportの失効を同期に行ってからHTTP abortとnative cleanupを要求する。

run ownerのprimaryとsession.stopCodeは同一値とは限らない。現行の#syncRunFailureは内部専用のevidence_binding_mismatch／invalid_observation_time／invalid_stateをsession側でinternal_review_errorへ写像する。一本化後もownerのprimaryは内部診断として元の値を保持し、session.stopCodeと公開結果は既存ReadFailureCodeへの写像を通した値とする。写像を省いて内部理由を公開せず、owner側まで写像して内部診断を失わない。run ownerからの失効とsession.stopの同期は一度限りの状態遷移にし、相互callbackの再帰で理由やcleanupを上書きしない。

停止後のreadonly残時間観測はcleanup／最終化用に残せるが、dispatch／chunk採用／candidate／ackを再開できない。NA-03のnative cleanupは元attempt floorを守り、confirmed事実とfirst primaryを分離する。cleanup未確認をordinary closeやrelease unknownへ格下げしない。

通常phase cutoffだけなら新規通常用途を閉じ、受理済みbaselineと予約済みfinalの権限を区別する。認証失敗、取消、hard期限、identity不整合ではfinal用controllerを作り直して復活させない。timer／listener／同時実行枠／token破棄は既存session.closeの一度限りの責務を保持する。

## 5 private生成位置とsourceの順序

session constructorはsourceより先に呼ばれるため、存在しないsource／ReleasePermitを生成時から要求しない。sessionは認証snapshot・canonical状態・readonly lease・run ownerを一度生成し、source初期identityの結合は固定composition継続から一度だけ行う案とする。

固定composition継続は、新sessionとそのsourceを対として生成した呼出し位置に限定する。開始済みsessionを受け取る汎用factoryや、任意sourceを再登録する公開portにしてはならない。新規laneは認証／I/O前に固定し、公開MCP・設定・既存BoundedReadOptionsから選択できない。

初回親→releaseのbootstrapはpermit前に実行し、matchedになった同source内#permit／不変release snapshot／既存private verifierをprepared bindingへ一度結ぶ。metadata前のゲートは維持する。実sourceが発行していないfake resolveReleaseの返却値を、このprivate継続へ持ち込まない。

新しいcomposition関数の具体的なmodule配置と試験入口は、canonical会計移行後の別設計で確定する。単にexportされたsession登録factoryへnative_body依存を渡す方法を、実sessionへの正式接続としない。

## 6 fake I Oによる受入条件

| ID | 入力と観測 | 必須結果 |
|---|---|---|
| CM-A01 | C/G/Pの正常な更新列と独立イベント合計 | stats／leaseが同じ唯一のcounterを読み、copy・hash・ackで増えない |
| CM-A02 | 負数・非整数・overflow・低減上限／等号 | 更新前の不正入力拒否と超過費用保持を区別。reset／返金なし |
| CM-A03 | legacy固定4、typed予約、二重解放 | 一run一方式。C+Rの枠を重ねず、解放は一度 |
| CM-A04 | 元t0・phase／hard等号・window_origin_msと後続時刻の差 | 形状は発行origin、liveは元floorで判定。期限延長なし |
| CM-A05 | legacy更新点だけの置換 | 移行前後の固定イベント列・結果・上限・retryが一致 |
| CM-A06 | typed preflight拒否／実dispatcher同期throw／reject | 精密化工程でそれぞれC=0／1／1。dispatch countと独立照合 |
| CM-A07 | G超過chunk・P単体／総量拒否・解析失敗 | 到着分の費用を保持、第二counter／第二課金なし |
| CM-A08 | 取消／auth失敗／owner失効とpending read、内部専用理由3種でのowner停止 | first reason固定、同期採用拒否、同readerのcleanupだけ継続。ownerは元理由、session／公開結果はinternal_review_error |
| CM-A09 | close連打／late Response／遅延cancel | 枠・token・timerの解放は一度。終端を修復しない |
| CM-A10 | readonly lease／diagnostic／fixtureからの更新要求 | 更新port・raw ownerを取得できず、fixture台帳を共有しない |
| CM-A11 | 別source／permit／snapshot／budgetと失敗後再利用 | 要求先停止、外国run不変、旧claim復元なし |
| CM-A12 | 全体合成・梱包・秘密marker | legacy退行なし、閉鎖gate維持、credential／本文／raw例外非出力 |

数値oracleはfake dispatcherの到達、採用chunkの入力byte長、payload文字列の独立UTF-8長から計算する。製品statsを期待値にcopyしない。実トークン・実URLへの通信・OS設定を必要としない試験に限定する。

## 7 実装の分割と開始条件

1. **CM-01 canonical状態の内部契約と純粋fake試験**。限度・加算・first stop・readonly viewの同一所有を確認する。稼働sessionから値を取り込む口は作らず、実classはまだ置換しない。
2. **CM-02 legacy更新点の中立移行**。旧counterを撤去し、stats／lease／legacy操作を同canonical状態へ移す。native lane、public option、retry／HTTP分類は変えない。
3. **CM-03 typed dispatchの精密な計上境界**。NA-03と同更新portを結び、C commitの単一所有・予約・同期失効をfake I/Oで検証する。実通信は有効化しない。
4. **CM-04 private compositionと固定source採用**。[詳細案draft-0.6](BEST_PRACTICE_ABORT_SCOPE_PRIVATE_COMPOSITION_DESIGN.md)で、CM-04-01／02とCM-04-03の固定200 fake bytes→private ack受理→既存release判定を実装した。現行3生成経路はlegacy固定で、実transport・非200差分・final枠移譲・正式発行は未接続。

CM-01／02は§9〜10、CM-03の注入経路は§11を参照。CM-04以降は別依頼で開始し、合成成功から自動的にnative/typed実sessionを有効化しない。

## 8 未確定事項と維持する停止状態

legacyとtypedで異なるHTTP terminal body・404・403 fallback・dispatch retryの扱いは、更新点移行とは別に差分を承認する。NA-03のconfirmed EOF／ack後だけのretryをlegacyへ無断移植しない。

固定compositionのmodule配置、最低受付Q、native subset／Node最低版、cleanup未確認resourceの運用、追加guard／copy／台帳のwork／heap上界は未確定のままとする。既存100万work等の別モデルで承認済みと見なさず、全体受付は無効を維持する。

本番cap、正式body receipt、選択payload／worker job、実transportの採用、実PDI検証、VM／監視／telemetry調査の再開はこの設計の対象外である。

## 9 CM-01の内部契約と純粋fake検証

実装：[review-canonical-budget.ts](../src/servicenow/review-canonical-budget.ts)。試験：[canonical-budget.test.ts](../tests/review/canonical-budget.test.ts)。詳細な実行結果：[CM-01検証記録](E2E_BEST_PRACTICE_CANONICAL_BUDGET_2026-10-29.md)。

createCanonicalReviewBudgetはゼロ会計と、更新用writer／観測用viewを一組生成する。初期stats・session・snapshot・leaseを受け取る引数はない。constructorはclockと低減limitsだけを許し、clockはremainingMs関数だけを持つplain objectに限定する。実sessionのようなclass instanceをclockとして採用しない。clock／limitsは入力objectのdata propertyとして一度だけ読み、getterは評価せずinvalid_inputで拒否する。検査後に別objectへ差し替えられない。trusted clock関数は固定して借用し、新しいt0／timerを作らない。

| 内部port | CM-01の挙動 |
|---|---|
| writer.dispatch(final=false) | Cを一回加算。legacyの固定4枠差引きだけを再現し、typed予約は未実装。上限拒否はrequest_budget_exceededで、first stopを設定せずfinalを残す |
| writer.chunk(n) | 非負safe integerのGを加算。overflowは加算前拒否、総量超過は費用を残してreceive_budget_exceeded停止 |
| writer.payload(string) | 同文字列のUTF-8長をPへ一回加算。総量超過は停止、単体超過は既存payload_limitの局所エラーでfirst stopを設定しない |
| writer.stop(reason) | 最初の内部理由と公開理由を固定。未知理由はraw値を保持せずinternal_review_errorへ正規化 |
| writer.close | idempotentな採用停止だけ。実timer・token・同時実行枠の解放は実行しない |
| view.stats／lease.read | frozen copy。leaseはreadだけを持ち、writer・reset・refund・登録／発行口を返さない。停止後も会計の観測は可能 |
| view.failure／diagnostic | 公開理由と内部診断を分離。内部専用3理由は公開側でinternal_review_error、内部側では元の値。evidence_issuance=disabled |

clockは有限・非負・deadline以下・非増加で、hard等号ではdeadline_exceededを固定する。異常値は内部invalid_observation_time、取得throwはinternal_review_error、clockからの会計再入は内部invalid_stateとして停止する。観測callbackが停止しても、その後の更新は通らない。停止後もclock自体が読めない場合は固定エラーとなり、callbackなしのstats／diagnosticは保持する。

CM-01のlimitsはC／G／P単体／P総量／deadlineの5費目だけを扱う。S・chunk数・attempt window／phase・typed Rは既存owner側に残し、このcoreで検査済みとしない。低減値をcopyし、既存BOUNDED_LIMITSに対応する上限を増やさない。CM-02の接続時に定数の対応と既存更新順を再検証し、現時点で二重counterを実sessionへ導入しない。

legacyのattempt前G>=cap拒否、phase／busy・認証チェックも実session側に残る。CM-01のdispatch単独を完全なHTTP受付判定として使わず、CM-02でこれらの既存順序を保存する。

新moduleの4artifactは梱包するが、実session／native／sourceからimportしない。fixture台帳・合成issuerも参照しない。CM-A01／02／08／10の内部会計・写像部分と、legacy固定枠／元残時間の部分試験であり、CM-A03〜12全体やactual cleanupを証明したものではない。

## 10 CM-02 legacy単一会計への移行

[BoundedReadSession](../src/servicenow/bounded-read.ts)のrequests／receivedBytes／payloadBytes fieldを撤去し、constructor内の#budgetへ置き換えた。初期statsのcopyや並行更新はなく、statsは同coreのcopy、#runLeaseは同coreのreadonly readを包む固定closureである。CM-01時点の「実sessionからimportしない」は当時の境界で、CM-02ではlegacy会計だけがcoreを採用する。native/typed bootstrap依存は供給しない。

| 点 | 維持する順序と責務 |
|---|---|
| C | session.check→通常／final枠確認→G>=cap事前拒否→canonical dispatch→controller／timer→fetch。C位置の精密化はCM-03へ残す |
| G／S | read後check→局所size加算→canonical G加算→S超過停止。超過費用は保持し、成功bodyだけを既存bufferへ渡す |
| P | session.check後にcanonical payload。単体payload_limitは局所拒否、総量超過はrun停止 |
| error境界 | CanonicalBudgetErrorを既存BoundedReadErrorへ写像。request側のretry／HTTP分類は変更しない |
| readonly時計 | public remainingMs／statsを参照せず、元startedとlimitsから残時間を計算。新t0・timerは生成しない |
| 停止伝播 | canonicalの公開理由をprivate stopCode getterで読む。最初の理由を二重保存せず、#stopPropagatedでowner失効→abortを一度伝播 |
| core観測失敗 | lease・dispatch・chunk・payloadのどの境界でcoreが先に停止しても、同じprivate写像でcoreの内部理由をownerへ先に記録し、既存公開理由をsessionへ反映。owner側までinternal_review_errorへ潰さない |
| close | owner close→canonical close→既存timer／listener／admission／credential解放。会計coreは外部resourceを解放しない |

canonical operationのcommit guardでも同じ元時計を観測するため、観測回数を移行前と一致させるものではない。元期限へ達したcommitを採用せず、新しい期限は作らない。固定fake時刻と到達イベントによる比較では、C/G/P・拒否理由・retry順が一致することを確認した。

試験：[canonical-session-migration.test.ts](../tests/review/canonical-session-migration.test.ts)の21件（レビュー修正で更新境界の内部理由保持2件を追加）。うち15件のlegacy oracleを移行前HEADと移行後で同じ入力・固定期待値により実行した。旧counter名のshadow代入を採用しない試験、readonly leaseで先に観測したhard期限のabort伝播、内部理由保持は追加回帰として区別する。[検証記録](E2E_BEST_PRACTICE_CANONICAL_SESSION_MIGRATION_2026-10-29.md)を参照。

HTTP terminal bodyの早期取消、404、cluster 403 fallback、retry delay、phase controller、busy判定、認証readyPromiseの発行点は既存legacyのままである。実sessionのtyped予約・dispatch採用・正式body receipt・source／worker採用は未接続で、CM-02の成功から許可しない。注入経路だけのCM-03を§11に分ける。

## 11 CM-03 注入typed dispatchと単一予算

実装：[bootstrap budget](../src/servicenow/review-canonical-bootstrap-budget.ts)、[canonical core](../src/servicenow/review-canonical-budget.ts)、[bootstrap](../src/servicenow/review-bootstrap-contract.ts)、[native owner](../src/servicenow/review-native-adapter.ts)。試験と実行結果は[CM-03検証記録](E2E_BEST_PRACTICE_TYPED_DISPATCH_ACCOUNTING_2026-10-29.md)を参照。

### 11.1 生成と更新権限

createCanonicalBootstrapBudgetは新しいゼロ初期化canonical coreを生成し、同じlease・limitsとconstructor用accountingを返す。既存session／core／snapshot／初期statsは受け取らず、lookupや既存runの付替えを行わない。clockと低減limitsはdata propertyとして一度captureし、fixture台帳をimport／共有しない。

accountingはreserve一回→reserved→releaseという一方向で、解放後は再予約・dispatch・chunk更新を拒否する。C/G/Pは同coreだけが持ち、Rはbootstrap用の既存final4枠を表す状態である。bootstrapのC+R検査とcoreの同4枠検査は同じ条件の再確認であり、Rを8枠として差し引かない。releaseはRを0にして更新権限を閉じるだけで、C/Gを返金しない。final slotの実消費／sourceへの移譲や一般的な動的R配賦は対象外。

### 11.2 dispatch直前の順序

native/typed経路だけ、外側の先行accounting.dispatchを撤去した。NA-02はstrict descriptor・発行originの形状・元floor・利用状態を確認した後、固定requestとsignalを先に用意する。constructorでpinしたbeforeDispatchが次を行う。

1. sourceへ渡す固定purpose／method／synthetic descriptorを凍結する。
2. Rと同runのlive／予算を再確認し、元I/O floor以下ならC計上前に拒否する。
3. 同canonical coreのdispatchAt(floor)で、同一観測によるlive・attempt floor・C+4・G余裕を検査してCを一度更新する。
4. scalar状態の保存だけを行い、await・時計再観測・入力getter・任意observerを挟まず固定dispatcherを呼ぶ。

dispatchAtはattempt floor等号をupstream_unavailable、hard期限を既存deadline_exceededとして扱う。C上限・G上限・失効でも更新前に拒否する。通常legacyのdispatch(final)は変更せず、CM-02のC位置は維持する。既存fake操作body／untyped bootstrapの計上位置も変えない。

### 11.3 失敗と費用保持

| 状況 | C | native終端・継続 |
|---|---:|---|
| shape／origin／利用状態の不正、C/R不足、期限・取消のpreflight拒否 | 0 | 未dispatch。commit到達前の拒否はnot_started、reader取得なし |
| canonical commitの拒否 | 0 | 有限NativeDispatchCommitErrorで理由保持。raw例外／未知理由はinternal_review_error |
| 実dispatcher内の同期throw／Promise reject | 1 | no_responseと固定upstream_unavailable。返金・native retryなし |
| dispatcherへ到達してから取消 | 1 | 同run失効、late Responseは既存best effortだけ。Cを戻さない |
| 応答採用・body拒否 | 1/attempt | 同bytesのGを一度課金。candidate／ack／hashでC/Gを増やさない |
| confirmed EOF／ack後の429／5xx retry | 各1 | 最大同用途2試行。累積C/G・元期限・Rを維持 |

計上後のC/G/P整合検査はactual dispatcherの後、body bytes採用前に行う。この検査はdispatch後に同attemptで予算を再観測する経路（body chunk課金・成功応答の採用）だけで実行される。dispatcherの同期throw／reject、chunk課金前の401等で再観測なく終わるattemptでは、finallyで未実行のまま破棄する。これらは再試行しない終端であり、標準factoryの同期canonical accountingではC=1が保持されるが、任意accountingの加算漏れをこの経路で検出するとは主張しない。readerを既に取得していれば同ownerでcleanupする。Cの直後にobserverを呼ぶ旧native順序へ戻さない。commit拒否はupstream throwと別のtry境界で捕捉するため、未dispatchをno_responseと認定しない。

この保証は固定bootstrap継続と同期canonical accountingの組合せについて検証したものである。constructorへ任意の「加算後にthrowするcallback」を与えて同じ保証を主張しない。callbackは外部入力・MCP設定ではなくtrusted依存であり、標準のCM-03 factoryはcommit後に任意callbackを呼ばない。

### 11.4 未接続の権限

CM-03 factoryは実sessionのprivate writerを取得しない。通常の既存BoundedReadSession生成経路はnative/typed依存を渡さない。CM-04-03の新規固定入口だけがfake依存でprivate親／release ackと実sourceのprivate ReleasePermit bindingを検証する。選択payload／worker jobへの正式binding・正式receipt／seal・final移譲は後続に残す。Pの更新portもbootstrap factoryにはない。

全体60秒・210試行・G16MiB／S4MiB・final4枠と低減のみの原則を維持する。追加guard／台帳のworkやnative buffer全heap上界、最低Node版、実ACL、未確認cleanupの運用を承認済みにせず、全体受付は無効のままとする。
