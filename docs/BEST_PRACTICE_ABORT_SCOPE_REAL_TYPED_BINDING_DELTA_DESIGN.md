# AU-BR-006：実session／ReleasePermitとtyped取得の接続差分・fake I/O受入条件

Version: br006-real-typed-binding-delta-draft-0.3 / Date: 2026-10-29。
Status: **§10のRT-B01と§11のRT-B02 bootstrap内部contractをfake依存で実装・検証。実classのcanonical更新点移行・typed lane／cleanup実接続は未実装。正式発行口閉鎖・Unknown・全体受付無効、VM／監視／telemetry調査保留を維持する。実通信・実機操作・設定変更・Pushの承認ではない**。

基準：[session／transport／body境界](BEST_PRACTICE_ABORT_SCOPE_SESSION_TRANSPORT_BODY_BINDING_DESIGN.md)、[実run lifecycle・ReleasePermitのprepared結合§14〜15](BEST_PRACTICE_ABORT_SCOPE_RUN_OWNER_BINDING_DESIGN.md#14-実session-private-lifecycle接続fake-io検証)、[CD-03／04の親workflow接続§13](BEST_PRACTICE_ABORT_SCOPE_PARENT_STABILITY_DESIGN.md#13-cd-03cd-04private-owner停止final-slot接続fake依存)。
後工程：[選択window／payload受領物](BEST_PRACTICE_ABORT_SCOPE_REAL_SESSION_RECEIPTS_DESIGN.md)、[worker接続契約](BEST_PRACTICE_ABORT_SCOPE_CONNECTION_CONTRACT_DESIGN.md)。

## 1. 目的と非対象

既存のprepared bindingを再実装せず、**実sessionが所有する同じ認証・予算・停止・時計から、typed取得のprivate継続を生成するための差分**を定義する。次工程の試験は実class＋fake I/Oに限り、正常bindingでもprepared／検証用candidateまでに留め、正式BoundedBodyReceipt・SourceRunEvidenceを発行しない。

新しい型名・operation名・状態は本書の内部契約案であり、既存exportや実装済み機能ではない。MDの承認・合成試験成功を、gateの解除やcap／実行permitの発行条件にしない。

非対象：選択window／payload receiptの正式発行、worker job配送、table観測の実行、AU-BR-006の公開規則登録、公開JSON変更、本番のchanged→暫定結果処理の差替え、実認証／トークン発行、PDIアクセス。既存14規則・0.2／0.3・selection_mode省略互換は維持する。

## 2. 現行ソースとの差分

| 箇所 | 再利用する現状 | 追加設計する差分 |
|---|---|---|
| [BoundedReadSession](../src/servicenow/bounded-read.ts) | constructorの#snapshot／#runOwner／#runLease、readyPromise、C/G/P・時計・stop／close、legacy GET | 認証／最初のHTTP前に固定するtyped lane、同counterへのprivate更新port、用途／attempt／予約とtyped cleanupの一度限りの所有 |
| [実lifecycle](../src/servicenow/review-evidence-lifecycle.ts) | session登録、ready世代、同snapshot／lease検査、source claim、同期失効 | 同constructorのtransport identity／利用claimと停止先の結合。readonly leaseを更新APIにしない |
| [BoundedUpdateSetSource](../src/review/bounded-source.ts) | 同session、matchedの#permit／不変release snapshot／private verifier、既存の親／metadata／payload版照合 | bootstrap由来のprivate親・release受理事実を同sourceへ結ぶ固定継続。将来metadataへ渡す用途だけをprepared状態で固定 |
| [closed Reader／gate／ReadState](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts) | fake内の同bytes課金・strict projection・停止・final slot・ack／cleanup | 検証済みの不変条件を実ownerの内部契約へ移す。fake handle・台帳・counter・opaque authを実sessionへ採用しない |
| 現行attemptのfinally | abort／cancel要求と既存timer／listener解除 | 要求と完了の区別。pending read、captured closed、cancel決着、releaseLockを同attemptで確認する境界 |

現在のlegacy attemptはJSON値を返し、finallyのcancelをawaitした型付き終了証拠は返さない。その正常returnを正式receiptへ登録するadapterは作らない。実lifecycleのprepared検査成功も、transport更新・body取得・receipt発行の権限ではない。

## 3. private生成・bindingの契約

### 3.1 発行元とlane固定

- 新規session constructorの固定継続だけが、同runのtyped所有部と利用claimを生成する。開始済みlegacy sessionを渡して切り替える入口はない。
- laneは認証／I/O前にlegacyまたはtypedへ固定。公開MCP引数・設定・setter・任意sessionの登録factoryを追加しない。既存公開経路はlegacyのまま。
- 既存run登録／source claimは再利用し、同じ意味のclaimを別moduleで二重発行しない。不足するtransport利用・用途・attempt・受領／消費・ackだけを同ownerへ追加する。
- transport claimはI/O依存や観測callbackを呼ぶ前にunclaimed→consuming。成功後claimed、途中失敗はfailedとし、close・catch・再認証・別permitで未使用へ戻さない。
- 健全ownerへの通常の二重生成要求は新要求を拒否して既存ownerを交換しない。既知ownerへの別transport／budgetの混入は、その要求先runを停止する。外国runのclaimを探索・消費・停止しない。

### 3.2 必須identityと寿命

| 結合対象 | 生成元・検査対象 | 寿命／失効 |
|---|---|---|
| session／run／auth snapshot／budget | 実constructorのprivate参照。#runLeaseの同一性を含む | session lifetime。診断copyや同値token／originを代用しない |
| ready世代 | 同snapshotの既存readyPromise成功継続 | 既存の0→1を維持。再認証で交換しない。本人sys_idの証明ではない |
| transport／ReadState／lane | 同constructorの生成継続・一度限りのclaim | stop／closeで同期失効。更新portを返却しない |
| source初期identity／target | 同sessionの固定source生成部。bootstrap前にpin | 別source／Update Setへ付替え不可 |
| ReleasePermit／release snapshot | source内#permitそのものとprivate verifierの不変copy | matched成立後のみ。返却decisionの再提出・書換えで更新不可 |
| logical read／attempt／phase／slot | 同ReadStateの用途台帳・controller／reader所有部 | retryは同用途内ordinal2まで。新世代へlate応答を移さない |
| body／親projection／ack | 同attemptのprivate bytesと固定consumer | 同bytes・一度の解析、post-guard受理。ackまで同windowを保持 |

各await後と最終commit直前に、live・同identity・予定state・期限を再検査する。最後のguardからcommitまでawait／任意callback／入力getterを挟まない。private参照を返すlookup-by-sessionやtoken／body getterを設けない。

## 4. bootstrapとmatched後の用途を分ける

| 用途 | 開始前提 | 受理先と禁止する昇格 |
|---|---|---|
| per-user／有効OAuth cacheの認証準備 | 固定snapshot／同run | HTTPがなければC/G=0、同ready世代へ。service-account fallbackや本人認定はしない |
| OAuth交換（将来のfake試験だけ） | 同runのauth専用用途、固定origin／endpoint／method | 同C/G・時計で交換を計上し、auth consumerだけが応答を消費。tokenを一般body／source／workerへ渡さない |
| 初回親GET | 同source初期identity・固定Update Set、認証ready | fixed5列private snapshotへ。まだReleasePermitを要求しない |
| release GET／C方式判定 | 同source・同sessionの固定用途 | 実測／運用者設定・binding／期限／競合・limitationsを既存方針でpin。matchedだけ既存#permitへ |
| metadata／final親・metadata | 同sourceのprepared binding・同#permit・ready／transport／budget | 用途記述の準備まで。今回の閉鎖gateでは正式body receiptを発行しない |
| payload／table／worker | 選択行／payload receipt／同job・planの正式bindingがさらに必要 | 後工程。前提が無い間は用途自体を発行しない |

親・releaseのbootstrapはmatched前に必要なので、存在しないpermitを要求する循環を作らない。matched成立後はbootstrap受理事実の**発行元identity**をprepared bindingへ引き継ぐだけで、過去のbodyへ正式receiptを遡及発行しない。unknown／mismatched／conflictならmetadataをdispatchする前に止める。

C方式のcluster照会403等の限定fallbackは既存release判定の範囲だけで維持する。それ以外の401／403や認証失敗・cleanup不明をrelease unknownへ格下げして継続しない。operator_configのasserted／未実測／陳腐化limitationsを保持し、ACL／scope一致を証明したことにしない。

## 5. 単一予算・費目所有の差分

ReadStateの新しいcounterを現行statsから初期化して並行更新しない。将来の実装ではsessionが唯一のcanonical stateを持ち、legacy／typedの固定laneが同じ更新点を使う。readonly leaseは観測専用のままで、構造一致や正常read()から更新権限を発行しない。

| 費目 | 唯一の更新点と規則 | fake受入条件 |
|---|---|---|
| C／Q | 同dispatch commit。OAuth・親・release・metadata・payload・final・retryを共有。未dispatch=0、呼出し後同期throw=1 | イベントoracleと一致。claim／ack／hashで再課金しない。Qは既存210以下・低減だけ |
| G／S | read completionの採用commit。private copyの同bytesで加算し解析 | G<=16MiB、S<=4MiBおよび低減値。超過chunkは費用を残して拒否、Sだけattemptごとにreset |
| P | sourceのpayload文字列受領境界。単体2MiB／累計8MiB以下 | 将来の版／schema拒否分も課金。receipt／hash／IPCで二重加算・返金しない。今回は用途未接続 |
| E | table受信のG内数 | 二重G加算なし。16KiB／256KiB等の候補値を本番承認値にしない。今回table用途は閉鎖 |
| R／T | 同用途slot台帳。親／metadata final各2を一度予約 | C+R<=Q。legacy固定4と重ねない。final消費／skip／stopで一度だけ解放しC/Gを返金しない |
| clock／phase | 元t0・hard／phase／attempt windowの同参照 | 最大60秒、10秒attempt、元のreserve式と50/55/60秒・低減境界を維持。ackまで同window |
| copy／decode／projection／guard／ack／cleanup | 別の制御work・保持費目として所有部を特定 | HTTP bytesで代用しない。全体work／heap受付は無効のまま |

typed予約が無いままbootstrapを始め、後で残枠を予約する方式は採らない。Q<4は型付き予約を開始できず、Q=4等の完遂不能な低減値はdispatch前の固定拒否を確認し、枠を補充しない。固定workflowの最低受付Qを7／8等へ引き上げるかは既存設計の承認待ち事項のままで、本書で変更しない。

chunkの採用より前にstopが確定したlate bytesは不採用。採用commit後なら取消やschema拒否でも費用を戻さない。Content-Length・未読量・fetch内部bufferから受信量を推定しない。retryは同logical用途・元の期限・残予約で最大2試行、前試行cleanup confirmedの固定retryable結果だけを許可する。

## 6. 停止・ordinary close・cleanup・ack

### 6.1 同期失効の順序

1. 実sessionの最初のprimaryを固定する。
2. await／observer callbackより前にready・source binding・transport利用・用途／pending body・将来の発行／移譲を同期失効する。失敗claimを復元しない。
3. その後にHTTP abort／必要なreader cancelを一度要求する。後工程のworker停止も同runへ合流するが、未開始workerを終了済みと認定しない。
4. 元の残予算の観測専用viewで終了を確認する。観測viewはGET／新body／再開の権限を持たない。
5. closeは既存sessionがtimer・listener・同時実行枠を一度だけ解放し、credential参照を破棄する。ownerが同じ枠を重複返却しない。

通常cutoffのordinary closeは全体stopと区別する。新規通常用途・未受理draftを失効させ、受理済みbaselineとreadonlyな発行元identityは予約済みfinalへ残せる。session停止や失効済み認証を、新phase controller／同値tokenで回復させない。final cutoff後は比較・発行を未確認とし、新期限で救済しない。

### 6.2 cleanup終端とbody受理

typed cleanupは同attemptの実際のresource操作から作る。任意のconfirmed boolean・finally実行・abort要求・slot返却・Map削除・session.closeだけでconfirmedにしない。

- 成功body：同readerのpending readなし、EOF、捕捉したreader.closedの成功、releaseLock成功、期限内の最終guard／ackを要求する。
- cancelあり：cancelの決着とpending read／closed／lockを別々に確認する。EOFと同一視せず、confirmed/cancelledから成功bodyを発行しない。
- dispatch前拒否：not_started。fetch／readerが存在しない事実をeofやlock解放へ読み替えない。
- fetch開始後に応答不明、read／cancel未決着、closed拒否、release失敗：unconfirmed。遅い成功でも確定した未確認診断を消さず、新body／retryを許可しない。

primaryとHTTP／worker cleanupを別軸で保持する。cleanupの観測後の記録は可能でも、期限後の新しい権限・body受理へ昇格しない。cleanup reserve250ms／残量1/4・empty read16等はCDの合成profileであり、本番policy承認・OS実時間終了保証ではない。

同bytesのconsume中は、bytes参照を破棄してもpending／attempt deadlineを保持する。async継続を越える際は同成功attemptのprivate ack claimを一度消費し、元window・同owner・role／slot・受理状態を前後guardで再検査する。返却直前の取消・期限切れでは成功summaryを返さない。過去にcommitした観測履歴と現在のlive権限を分ける。

### 6.3 固定失敗理由・互換性

| 事象 | 内部診断と停止 | 公開側の扱い |
|---|---|---|
| 実source／permit／snapshot／transport混入 | evidence_binding_mismatchを保持し要求先runを停止。外国run不変 | 現行の実session写像internal_review_errorを維持。新公開codeを暗黙追加しない |
| cleanup未確認 | cleanup_unconfirmedとHTTP axisを保持。先行auth／cancel理由を上書きしない | 有効化前に正式写像を再確認。現行契約内の固定失敗へ写像し、成功へ降格しない |
| attempt期限 | 内部windowの理由とordinal・残時間を保持。cleanup確認なしretry不可 | legacy理由・retry契約を無断変更せず、typed公開接続は後工程 |
| release unknown／mismatched／conflict | matched用途の発行前に拒否。limitations保持 | 既存release未評価契約を維持 |
| 親／metadata changed | CDの閉鎖fakeはchanged_during_reviewで停止する履歴あり | 実sourceは既存のchanged／provisional_resultsを維持。fakeのfail-closedを本番へそのまま移植しない |
| formal gate閉鎖／profile未承認 | 正式receiptを常に拒否。preparedは権限ではない | AU-BR-006を評価済み／clear／findingへ追加しない |

## 7. fake I/Oの受入条件

将来の試験は実class／固定private callerの制御フローを使い、依存境界だけをfake化する。既存`BoundedReadOptions.fetch`等の信頼済み注入とfake clock／scheduler・Response／Streamsを使用し、global fetch・PDI・実OAuth・実workerは使わない。新しい試験用境界の配置は実装前に確定し、npmへfixture登録／既存session採用口を梱包しない。

| ID | 合成入力・操作 | 必須の受入結果 |
|---|---|---|
| RT-A01 | 認証／HTTP前のlane生成、重複生成、legacy開始後の採用要求 | transport claimは一度だけ。第二portなし、既存owner置換なし、C=0の拒否を区別 |
| RT-A02 | 同値snapshot／token／lease／sourceのcopy、foreign session／permit | 参照の混入を拒否。外国owner・会計・claimは不変 |
| RT-A03 | per-user、有効cache、fake OAuth成功／失敗／遅い成功 | 同snapshot・ready0→1のみ。HTTPなしC/G0、交換分は同予算、停止後ready復活なし |
| RT-A04 | bootstrap parent／releaseをmatched前に実行 | 存在しないpermitを要求せず、private受理だけ。tokenやraw bodyの汎用consumerなし |
| RT-A05 | unknown／mismatched／設定競合、cluster403の既存限定fallback | metadata dispatch=0、正式receipt=0。C方式の期限・limitationsを保持 |
| RT-A06 | 同source matched #permit、返却decisionのnested改変、別permit | preparedだけ。canonical snapshot不変、違反claimは再利用不能 |
| RT-A07 | dispatch同期throw、429／5xx、read失敗、上限超過chunk | C/Gの独立oracleと一致。未dispatchC0、失敗課金・超過課金の返金なし |
| RT-A08 | 元chunk変更、split／empty chunks、不正UTF-8／JSON | 同private bytesで課金・解析・hash。二重parse／再consume／summaryからの復元不可 |
| RT-A09 | C+R=Q、超過、Q<4／Q=4等、skip／stopの重複 | 二重予約なし、上限前停止、R解放1回、C/G不変。完遂不能を成功にしない |
| RT-A10 | ordinary close前後と50/55/60秒・低減期限の等号 | 受理済みbaselineは所定finalへ。hard／final期限後の発行・延長・新通常用途は不可 |
| RT-A11 | constructor／認証／bind／chunk／consume／ack直前の取消・再入 | 先行primary固定、同期失効がabortより先。最後のguard後に未受理結果なし |
| RT-A12 | pending read／cancel、closed拒否、release失敗、遅い応答 | typed unconfirmed保持、retry／body発行不可。late成功で診断修復なし |
| RT-A13 | bytes破棄直後・async return中の取消／期限切れ | 同attemptの一度限りackで拒否。過去の観測をlive証拠にしない |
| RT-A14 | 二重close、初期化失敗、既存同時実行枠の再利用 | timer／listener／枠返却は既存session責務で一度だけ。cleanup未確認を枠返却で確認済みにしない |
| RT-A15 | plain JSON・stats・hash・fixture candidateの正式発行要求 | 正式発行0、window／payload／job／seal発行0、公開AU-BR-006評価0 |
| RT-A16 | ログ／結果／例外／status／梱包、legacy回帰 | 資格情報・本文・private handle非出力、fixture→実session採用口なし、legacy0.2/0.3・14規則不変 |

oracleは製品counter／課金関数から期待値を逆算せず、試験側のdispatch・採用chunk・source受領・slot消費／解放・resource決着のイベント列で独立計数する。失敗時も費目を残し、未開始・開始済み・確認不能を分ける。試験票には各IDの未実施／成功／失敗・固定理由・cleanup軸・残予約・未証明事項を記録し、試験未実施を成功扱いにしない。

## 8. 次の実装範囲と承認待ち

本書からの次工程は小さく分け、各工程でも正式gateを閉じたままにする。

1. **RT-B01：constructor継続・transport claim・診断の内部契約**。§10で非dispatchの内部型／継続を実装し、既存prepared bindingの検査を再利用した。実ownerを再登録・採用せず、typed laneはまだ生成しない。
2. **RT-B02：同canonical予算・停止・bootstrap継続**。§11で同lifecycleのreadonly leaseとconstructor固定のfake会計更新点を結び、fake認証→親→release→preparedを確認した。実classの更新点移行と正式body・metadata消費は開かない。
3. **RT-B03：typed cleanup・同bytes candidate・ack**。同resourceの終了確認とpost-guard受理をfakeで検証。正式receiptはdeny-onlyのまま。
4. 選択window／payload／worker job・final統合と公開結果は別設計・別承認。正式発行有効化・本番cap・実機検証も別の判断とする。

承認待ち／未確認：private module／試験境界の配置、canonical stateへの移行方法と失敗時rollbackではなく停止する責務、Q受付下限、用途capture／E/R・cleanup／empty-read profile、追加work／heap・IPC・終了保証、未確認resourceの再受付policy、typed内部理由の公開写像、本番changedの統合、実ACL／field応答。これらをUnknownのまま扱い、合成profileで承認済みに埋めない。

draft-0.1で実施したのは既存ソース・設計との読み取り照合とMD更新だけ。後続のRT-B01実装・検証は§10と区別する。正式発行口閉鎖・全体受付無効・調査保留を維持する。

## 9. draft-0.1文書確認（2026-10-29）

draft-0.1作成時、新規本書と参照更新した既存3文書の計4MDについて、相対参照76件の参照先存在・行末空白なし、RT-A01〜RT-A16の16受入条件の重複なしを確認した。見出しanchorの自動検証ではない。`git diff --check`成功。当時の変更対象はMD4ファイルのみで、ソース・テスト・package・設定は変更していない。

## 10. RT-B01：constructor transport内部contract（fake依存限定）

[既存lifecycle](../src/servicenow/review-evidence-lifecycle.ts)に内部型ConstructorTransportHandleとtransportConstructor継続を追加した。[新規35件](../tests/review/real-typed-constructor-contract.test.ts)、[検証記録](E2E_BEST_PRACTICE_REAL_TYPED_CONSTRUCTOR_CONTRACT_2026-10-29.md)を参照する。§2〜§8のtyped取得全体が完成したという意味ではない。

### 10.1 生成元・一度限りのclaim

実sessionはconstructorで既存registerReviewEvidenceSessionを一度だけ呼び、その返却closureを従来どおり#runOwnerへ保持する。新継続もそのclosure内に留まり、sessionのgetter／mode引数／登録exportは追加しない。既存sessionの再登録は従来のWeakSetで拒否する。

claim(snapshot, lease)は同constructorのsnapshot／readonly leaseの参照を検査し、認証ready開始前・state=created・source未claim・既存C/G/P=0だけで受理する。claimを先にconsumingへ進め、lease観測の前後で検査し、最後のguard後に空の凍結handleを一つだけcommitする。通常の同binding重複は新要求の固定refusalだけ記録して既存ownerを保持し、別snapshot／leaseの重複はbinding不整合として要求先ownerを停止する。

途中失敗はfailed、成功後stop／closeはclaimedという由来を残してstate=revoked・handle参照なしにする。一度もclaimしないままstop／closeした場合もclaim=unclaimedのままstate=revokedとなり、以後のclaimは先行primaryで拒否する（unclaimed＋revokedは「未使用のまま失効」を表し、claim成功の痕跡ではない）。再生成・再利用・close後の再登録で救済しない。依存からのclaim／inspect再入はbusy／consumingで拒否し、lease callbackから停止された後に成功handleやviewを返さない。

### 10.2 prepared bindingの再利用・診断

inspectは同ownerのhandle／snapshot／leaseと元の観測予算を検査するだけで、identity_only／dispatch=unavailable／evidence_issuance=disabledの固定viewを返す。inspectPreparedは新しいsource claimを生成せず、既存inspectSourceを共通private関数として再利用する。同source／permit／port／ready世代／不変release snapshotを従来どおり照合し、最後にtransport失効をcallbackなしで再検査してprepared_onlyの独立copyだけを返す。

新規fake試験は既存登録関数の**孤立したテスト用contextとlease／source port**を使う。偽のmatched portを実sourceの#permitと認定する試験ではない。実classのconstructor確認ではfetch spyを一度も呼ばず、継続が公開されないこと・再登録できないこと・同期失効だけを検証する。既存の実source verifierを迂回するfactoryやfixture台帳への実session登録を追加していない。

最初のprimaryと、通常重複要求のrefusalを別slotに保持する。transport_claim／transport_stateを既存の内部readonly診断へ追加するが、handle・snapshot・lease・source・permit・tokenは返さない。diagnosticは最後の状態を読むだけでclockを更新せず、有効性確認のauthorityではない。

内部invalid_stateは固定診断として保持し、実sessionの既存#syncRunFailureではinternal_review_errorへ写像する。ReadFailureCode・公開JSONのcode列挙・MCP schemaは増やさない。binding／観測不整合の従来の写像と先行primary保持を維持する。

### 10.3 dispatchなし・同梱境界・費目

継続のoperationはclaim／inspect／inspectPrepared／diagnosticのみ。dispatch・fetch・chunk・予算更新・予約・body・cleanup・receipt／job発行のoperationは存在しない。readonly leaseを更新portへ変換せず、C/G/Pは変更しない。HTTP／workerを開始していない本contractを、他のlegacy経路のHTTP cleanup=confirmedという意味にしない。

実BoundedReadSessionの公開legacy経路は継続を呼ばない。transport_claimはunclaimedのまま、typed laneへのswitchはなく、legacy GETを始めたsessionを後から採用できない。claimがready開始前とC/G/P=0を要求するのもそのためであり、RT-B02でconstructorからの固定使用継続を別に接続する。

lifecycle moduleは既存runtime依存としてnpm同梱済みであり、新内部contractも同じファイル内に含まれる。一方、sessionのprivate継続を得る公開口はない。既存abort-scope-evidence fixture群の非同梱方針は変更せず、[梱包fixture](../tests/review/fixtures/compiled-fixture-boundary.mjs)でsessionの取得口がなくlegacy前後とも未claimであることを確認する。非同梱の合成issuerから実ownerを採用しない。

claim成功はlease最大2観測、inspectは最大2、inspectPreparedはtransport2＋既存source2の最大4観測と既存bounded release copy1件。通常重複claimは追加観測0。handle最大1・refusal最大1・busy stateを保持し、失効でcanonical handle参照を捨てる。これらは追加制御費であって、全体work／heap上界の証明・物理消去・自動タイマー／OS終了保証ではない。

RT-A01／02／06／11／15／16の関連部分を限定検証しただけで、16受入条件全体の合格とはしない。後続のfake bootstrapは§11を参照。RT-B03の実resource cleanup・同bytes受理／ack、選択payload／worker job・formal receiptは未接続。正式発行口閉鎖・Unknown・全体受付無効・調査保留を維持する。

## 11. RT-B02：同canonical予算・停止とbootstrap継続（fake I/O限定）

[内部bootstrap contract](../src/servicenow/review-bootstrap-contract.ts)、[37件の合成テスト](../tests/review/real-typed-bootstrap.test.ts)、[検証記録](E2E_BEST_PRACTICE_REAL_TYPED_BOOTSTRAP_2026-10-29.md)を追加した。§10.3の「dispatchなし」はRT-B01単体の範囲であり、本節は新規のconstructor依存を与えた孤立contextに限る追加段階である。

### 11.1 生成・canonical会計・停止の所有

既存registerReviewEvidenceSessionの新規context作成時にだけ、任意の第四引数としてfake_io=trueの依存を固定する。依存は同readonly lease・source・target、認証方式、Q/G/S/deadline上限、会計更新callback、fake dispatch、fake release resolver、fake scheduler。callbackと上限値を生成時にpinし、await後に注入objectの差替えを採用しない。

実BoundedReadSessionのconstructorは従来の3引数登録のままで依存を渡さず、private #runOwnerを公開しない。そのため実sessionにはbootstrap実行経路がなく、既存sessionの再登録／後付け採用も拒否される。新しいfixture登録台帳や実session用mode切替を追加しない。lifecycleから参照する新moduleはnpmに同梱される内部contractであり、非同梱PoCとの誤記はしない。

孤立contextではfake会計ownerがC/G/Pを一つだけ保持し、既存lifecycleとbootstrapが同じleaseで読む。更新はconstructor固定のdispatch／chunk callbackだけで、readonly lease自体を更新authorityへ昇格しない。callback前後でC+1・G+chunk長・他軸不変を検査する。全sampleを既存lifecycleのobserveBudgetへ通し、負数・counter巻戻り・残時間延長の診断を共有する。別の費用counterや開始時計で救済しない。

停止は同lifecycleのfirst primaryを保持し、ready／source／transportを同期失効させてからbootstrapのAbortControllerへ通知する。予約解放は一度だけ。失効後の遅い成功は追加G課金・source bind・ready復活を起こさない。diagnosticは固定state／reason／予約状態だけで、token・親本文・source／permit／snapshot／leaseを返さない。

### 11.2 固定順序とprepared境界

1. B01 handle／snapshot／leaseを検査し、bootstrapをrunningへ一度だけ進める。同時二重開始は停止、終了後の再呼出しは拒否する。
2. C/G/P=0からfinal用R=4を予約。全dispatchでC+1+R≤Qを検査し、失敗分C/Gを返金しない。
3. per-user／cachedはOAuth I/Oなし。exchangeはfake authentication POST一回から開始し、token形・期限・大文字小文字を区別しないBearerを検査する。同snapshotのready世代0→1を一度だけ進める。tokenは認証判定後に保持しない。
4. 固定parent GETを解析し、sys_id／state／application／sys_updated_on／sys_mod_countの5列とtarget一致を検査する。本段階の親projectionは局所判定のみで、CDの初回／最終安定性証拠や正式snapshotを発行しない。
5. 固定release GETの200／指定cluster403をconstructor固定のfake resolverへ渡す。resolverが返すsource参照もconstructor sourceと一致必須。不明・非matchedは停止。既存bindSource／inspectPreparedで同source／permit／port・ready世代・不変release copyを再検査し、prepared_only／dispatch=unavailable／evidence_issuance=disabledのviewだけ返す。

fake descriptorはpurpose／固定method／synthetic=trueのみで、利用者URL・header・認証overrideやglobal fetch fallbackを持たない。実URL／Authorization snapshotの捕捉、実sourceの#permit発行元とC方式設定のbinding・期限・競合検査は本段階の証明対象ではない。asserted releaseのlimitationsを保持する試験は信頼済みfake resolverの結果伝播であり、運用者設定を実際に承認した意味ではない。

### 11.3 上限・再試行・中断と未確認cleanup

Q≤210、G≤16MiB、S≤4MiB、deadline≤60秒。R=4に対する受付下限Q=4は予約可能だがbootstrap一件もdispatchできず理由付き停止となる。各attemptは元leaseの残時間を基準に最大10秒、通常phaseは元の全体期限よりmin(10秒, deadline/6)早く止める。独自の開始時刻を設定せず、fake schedulerが元残予算の境界で起こし、guardで再検査する。上限を緩めない。

fake応答はstatusと単一Uint8Arrayの完了イベント。private copyを会計callbackの前に作り、同copyを一度JSON decodeする。S/G超過byteもGに一度課金して停止する。429／5xx・settled fake失敗だけ同用途最大2試行、未決着attemptのtimeoutは再試行せず停止する。**settledは合成モデル上の前提であり、HTTP body cancel／closed／releaseLockの確認ではない**。cleanup軸は常にnot_observed。本段階から実transportにこのretry規則を流用してはならない。

通常phase／request枠枯渇はordinary_closedとして予約を解放し、主ownerのglobal primaryを設定せず当bootstrapの再開を拒否する。hard期限／取消／混入／不正応答／G超過は同ownerを停止する。成功はRを維持したままpreparedへ進み、close／stopでRを一度解放する。metadata／payload／final再読は未開始なので、R保持をfinal完遂・typed cleanup確認と解釈しない。

### 11.4 費目と残課題

追加制御状態はbootstrap一つ・AbortController一つ・一度限りの予約状態・進行中timer最大一つ・private body copy最大S、JSON decode一回／200応答。失敗の超過chunkは保持せず課金する。これは追加制御費の記述であり、全体work／heap上界・物理秘密消去・OS終了保証の証明ではない。

RT-B03へ残すもの：native Response／Streamsのread・cancel・closed・releaseLockとtyped cleanup、同attempt candidate／ack、partial chunks／empty quota／retry cleanup、終了後のprivate bytes解放証拠。さらに実BoundedReadSessionのcanonical更新点の移行・固定source bootstrapへのprivate接続、実認証snapshot／ReleasePermitの発行元照合、選択window／payload／worker jobへの正式bindingは未接続。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。
