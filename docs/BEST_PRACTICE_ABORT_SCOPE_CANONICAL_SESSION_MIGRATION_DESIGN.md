# AU-BR-006 canonical会計とprivate生成位置の差分設計

Version: br006-canonical-session-migration-draft-0.1 / Date: 2026-10-29。
Status: 設計案。実装・実session接続・実通信は対象外。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実通信・実機操作・設定変更・Pushの承認ではない。

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
4. **CM-04 private compositionと固定source採用の詳細設計**。実認証snapshot／source初期identity／既存permitの発行元を結ぶ。配置・試験境界を承認後に小さく実装する。

各工程の実装は別依頼で開始する。現在の変更はMDだけで、CM-01の内部型も未実装である。

## 8 未確定事項と維持する停止状態

legacyとtypedで異なるHTTP terminal body・404・403 fallback・dispatch retryの扱いは、更新点移行とは別に差分を承認する。NA-03のconfirmed EOF／ack後だけのretryをlegacyへ無断移植しない。

固定compositionのmodule配置、最低受付Q、native subset／Node最低版、cleanup未確認resourceの運用、追加guard／copy／台帳のwork／heap上界は未確定のままとする。既存100万work等の別モデルで承認済みと見なさず、全体受付は無効を維持する。

本番cap、正式body receipt、選択payload／worker job、実transportの採用、実PDI検証、VM／監視／telemetry調査の再開はこの設計の対象外である。
