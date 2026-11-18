# AP01 NS06：同acceptedの上位時刻移譲・sourceClosed／discardとpost-O取消の保証レビュー

Version: release-ap01-ns06-time-handoff-guarantee-draft-0.1 / Date: 2026-11-19。
Status: **MDによる個別承認前整理。限定リリースの公開方針だけ採用済みで、NS06の保証低下は未承認。** 基準HEADは`c1df154`。[AP01詳細](BEST_PRACTICE_RELEASE_AP01_LIMITED_SCOPE_DESIGN.md)NS06／RV11を、旧case・未代替残差・将来回復条件へ対応付ける。今回の試験成功・移行同等性判定は追加しない。

正式発行口閉鎖・全体受付無効・通常経路未切替・C実行入口／body起動閉鎖・Unknown・VM／監視／telemetry調査保留を維持する。保証低下・旧試験削除／skip／期待値弱化・friend撤去・設定変更・公開は未承認。実装・発行／claim消費・負荷採取・試験再実行・build／pack・実接続・実通信・実機操作・コミット・Pushは行わない。元5秒期限・既定並列度、旧比較childの60秒・製品全体60秒・元attempt floorとLOAD6／LOAD7選択未承認も維持する。

## 1 範囲と保証の分離

非提供対象は、同acceptedから上位時刻owner／worker jobへ移譲する新しい本番経路である。既存の通常source→worker→出力・終了待ちを非提供／削除対象にしない。[NS04](BEST_PRACTICE_RELEASE_AP01_NS04_SESSION_PROJECTION_GUARANTEE_REVIEW.md)の同session・元startedAt S／全duration L／pin済みpolicyと、[NS05](BEST_PRACTICE_RELEASE_AP01_NS05_OBSERVATION_COMPARISON_GUARANTEE_REVIEW.md)の同rows／観測UTC O・比較候補受理を前提に分ける。acceptedは非実行比較値の内部状態であり、Permit・正式発行・worker起動の権限ではない。

[正規台帳](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md)のTH01〜06の6variantを本書へ一度ずつ対応付ける。旧分類は部分対応2／未対応4のままで、同等移行済みへ変更しない。TH04／05内部の3点、TH06内部の動的sweep位置を独立case数へ加算しない。N6-IDは本書内の整理IDであり、旧宣言・variant・fullNameを置換しない。元class＋fake I/O（台帳のP）、独立開発assembly D、値owner単体、合成worker issuerは別保証である。会計C／G／Pはrequests／received_bytes／payload_bytesで、経路Pと区別する。

| 記号／境界 | 元値・現在の限定保証 | 未接続／非主張 |
|---|---|---|
| S／L | 元sessionの開始UTC／全duration。remainingから再計算せず元runに固定 | worker応答やcleanup時刻に合わせて開始・deadlineを更新しない |
| O／U | 同acceptedから消費するO。上位timeのlast_utc=U=O、S <= O=U <= S+L | TB-BではT_iを採らず、Uを次の入力へ進めない。値の等号許容はmono guardの期限免除ではない |
| 正常sourceClosed | 移譲後のprivate protocolで下位receipt／source用guardを退役し、同run guardへ切替 | 実source全体に汎用close APIがある証拠、run停止、実worker終了確認ではない |
| 固定discard | 正常source側解放後の上位時刻値の一度限り終端。現prepared-only継続内で消費 | 閉じたsessionを越えるworker lease・job claimへの移譲ではない |
| T_i／E | 将来同inputに結合するretrieved_atと、workerが採るended_at | 既存reviewed_atはT_iを使用する契約。解析終了時刻へ変更しない。THはS <= O <= T_i <= Eを検査していない |

## 2 現行の供給・所有・停止境界

[時刻owner設計](BEST_PRACTICE_ABORT_SCOPE_RELEASE_TIME_OWNER_CTB_DESIGN.md)のTB-A／B限定実装と、現sourceを照合した。設計上の将来条件と実装済みの固定fake準備継続を混同しない。

| ID | 静的に確認した固定順序・所有 | 未代替保証／失敗時保持の制限 |
|---|---|---|
| N6-E01 | [session](../src/servicenow/bounded-read.ts)の同projection消費済みfake-200継続で[bridge](../src/servicenow/review-kernel/release-time-handoff.ts)を生成。同release ack・元runOwner／budget／releaseInputOriginを固定 | callerから完成bridge・O・draftを受け取らない。値factory自体は任意fakeから生成でき、実sessionの真正性・run全体の唯一生成を単体で認定しない |
| N6-E02 | bridgeは[receipt owner](../src/servicenow/review-kernel/release-comparison-receipt.ts)と[time scope](../src/servicenow/review-kernel/release-time-owner.ts)を固定生成。bindingはrun／session／source／key／origin／budget・S／全Lの8項目、上位slotは先にallocate | 新budget／timer／時計／GETを作らない。source側で同policy・実fieldもcheckするが、上位time値がpolicy／rows／比較draft自体を引き継ぐ設計ではない |
| N6-E03 | source hookでissue→compare→acceptし、acceptedに同Oを保持。legacy matched・bootstrap contract成功後だけsessionがhandoffを呼ぶ | pure bridgeのunknown空200受理と、元classのlegacy非admitted停止は別。新候補を既存Permitへ採用・設定代替成功へ昇格しない |
| N6-E04 | handoffはsource→transferringを先行消費、pre-check・同projection参照を照合。takeAcceptedTimeはacceptedを先に空にしてtransferring→pre/post→transferred後だけOを返す | inspect／公開evidence／serialized draftを元acceptedへ戻さない。失敗後も原slotを復元せず、別ownerでの再発行を救済口にしない |
| N6-E05 | 同Oでtime.observe→issue→acceptを同期実行。scopeのissueはdonor→pending、acceptはhandle／pendingを先に外しreceiving→pre/post後にheld。bridgeの最終check後transferred | awaitや外部I/Oを追加しない。同期区間外の取消を任意命令位置で強制中断する保証ではなく、固定guardで観測する。copy／foreign／再入拒否は元供給点との連続性が別に必要 |
| N6-E06 | #prepareCompositionIOのfinallyで、移譲済みならsourceClosed。pre-check後receipt.close・sourceProjection／sourceCheckを退役、sourceReleased=true、runCheckによるpost-check後source_closed | 正常下位解放で上位Oを消さない。bindingのsource等identityはdiscardまで保持し、全source graphへの到達不在やheap物理消去を主張しない |
| N6-E07 | 同finallyは観測slot、projection／key、consumer、contract、会計予約を固定順序で退役／解放。上位checkRunは元run生存と同origin／source・現在S／全Lを確認 | 解放sectionの継続を末尾rollback救済と区別する。固定順序のコード存在・timer0だけで全section実行を確認済みにしない。sourceClosedは実資源解放そのものではない |
| N6-E08 | #prepareCompositionIO復帰後、外側thenが#finishCompositionTime→bridge.discard→#clearReleaseComparison→session.close→凍結prepared summary。外側finallyもfake.dispose／session.close | 現行はworkerへ進まない。discard失敗を握り潰して正常summaryを返さない。成功discard後のscopeは後着revoke／誤呼出しでfailedへ書き換えず、後続操作は拒否 |
| N6-E09 | session.stopがsource用hookの有無に依存せず#clearReleaseComparisonを直接呼び同期失効。rollback／異常closeも上位参照を破棄 | 正常source解放とrun取消／異常closeを分ける。source用guardが退役した後も失効が届く必要があり、hook解除を保持権限にしない |
| N6-E10 | bridgeはpendingErrorの先行causeをrejectへ戻し、time診断はcancelled／deadline_exceeded以外をinternal_review_errorへ正規化。sessionは上位固定診断の最初の非null値をprivate slotへcopyしてbridge参照を退役 | 元runのaccess_denied等と正規化time診断は同一codeとは限らない。HTTP／cleanupの既存診断ownerを上書きしない。THはprivate診断copyを直接取得して全層同値assertしたものではない |

## 3 旧TH6variantの対応

直接assertの根拠は[release-time-handoff-session.test.ts](../tests/review/release-time-handoff-session.test.ts)。候補DAの元入力・注入点は[正規台帳](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md)と[開発adoption試験](../tests/review/development-release-adoption.test.ts)を参照し、旧it.eachの%#／%sを推測展開したfullNameは作らない。

| ID／旧case・入力／故障位置 | 元classで直接assertする範囲 | 残差・将来回復条件（旧分類維持） |
|---|---|---|
| N6-T01／[TH01](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#th01) rows=[]・有効Australia設定 | prepared_only／cleanup closed／reserved0／dispatch unavailable／issuance disabled、C=2・G=親＋release bytes・P=0、ISO合計2・fetch未呼出し・timer0、PRIVATE／Time／upper／handoff／projection／comparison非出力、空evidenceのobserved_atなし | 部分対応DA16。同classの採取S1＋O1・旧summaryの指定field・同会計／予約と非露出を回復。runtime内部O／held／discardを直接inspectしていないため、値ownerの保持保証と合算して私有状態assert済みにしない |
| N6-T02／[TH02](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#th02) Australia実測 | TH01のprepared／会計／閉鎖／ISO／fetch／timer／非出力群。空evidence専用assertは適用しない | 部分対応DA16。実測variantを独立に維持。元caseには実測observed_at値の直接assertはなく、NS05のOU04と分離する。summary全fieldを旧版とdeep equalした試験でもない |
| N6-T03／[TH03](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#th03) 空200・設定なし | reject release_not_admitted、timer0。その後、設定を持つ別fresh compositionはcleanup closed | 未対応DA11。Dはunknown非実行draftを公開できる別結果。元非admittedをhandoff成功へ変えない。元caseの直接観測はcaller拒否／fresh成功で、handoff呼出し0・private候補破棄をspyしたものではない |
| N6-T04／[TH04](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#th04) post-Oの選択3点でsync abort | 正常runでpost-O performance.now読取総数total>30を得る。各targetでfired=true、reject cancelled・timer0、同snapshotのfresh compositionがcleanup closed。loop後prototypeのTime／Handoff／Accepted名なし | 未対応DA09／21／24は関連参照。targetはfloor(total/2)・total-30・total-15で、handoff等の特定関数名を直接spyしない。元位置と同期失効・外側caller拒否を回復し、Dの単一post fault／withheldへ縮めない |
| N6-T05／[TH05](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#th05) 同選択3点でqueueMicrotask abort | TH04と同じtotal・fired／caller拒否／timer／fresh／prototype群。abortは選択読取中に予約し、microtaskで実行 | 未対応DA09／21／24。予約したclock位置と実際の取消発火位置を同一視しない。await／microtask順序と同TimeHandoffの保持区間を回復。全post-O位置へのqueued sweepを実行したとは数えない |
| N6-T06／[TH06](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#th06) 正常経路の全post-O clock読取でsync abort | total>30、target=1〜totalを順に注入し、各点fired=true・reject cancelled・timer0・同snapshotのfresh compositionはcleanup closed | 未対応DA09／24。最終読取までの動的sweepと同runのhandoff／sourceClosed／discard継続を回復。1つのdeclared case内の反復で、全入力／全branch・全取消方式の網羅ではない。prototype非露出の直接assertはTH04／05側にあり、TH06へ足さない |

totalは各試験の正常fake空200経路で、2回目ISO変換以後のperformance.now読取を数えた値である。現在の総数を実行して再採取しておらず、過去記録の54等の番号を現HEADの固定座標にしない。時計・counterは試験の相関境界であってruntime公開の観測口ではない。fresh成功は同じ失効runの再利用ではなく、新runのadmission回復を外から確かめる条件で、private台帳や全cleanup sectionの直接検査に置換しない。

## 4 値単体・compiled保証と未代替残差

以下は6variantを補う別保証であり、THの移行完了数・実classの直接assertへ加算しない。

| 根拠・直接検査 | 元classへの接続で残る条件 |
|---|---|
| [donor／bridge試験](../tests/review/release-time-handoff.test.ts)：CT-A acceptedのtakeAcceptedTimeは同Oを一度返し、その後state=transferred／O・comparison=null。消費pre/post2点で取消・両側破棄 | 同sourceの同accepted由来を私有継続に結合し、inspectの再入力を拒否。THのsummaryから消費claimの状態を直接確認したとはしない |
| 同bridgeの空200：handoff→sourceClosed後upper heldにS／L／O／last_utc=O、comparison=null。sourceGone後もrun guardでdiscard可能。run revokeではtime=null／cancelled診断 | 正常下位解放と元run失効を別イベントに保つ。純粋bridgeはpolicyなしのunknown空200も運べるが、実classのTH03はlegacyで止まる。closeした実sessionを越えるleaseは発行しない |
| 同bridgeのtransfer10guard、sourceClosed／discard各pre/post、重複3操作、非accepted／foreign projection／early close／copied draft、contextのrun／budget／origin変更、caught reentry／読めない例外 | 同owner・同供給点・同失敗prefixへ対応付ける。unitの10guardとTHのperformance.now総数は異なる母集団。access_denied／phase_deadline_exceededの元throwとtime側internal_review_errorの分離も維持 |
| [time scope試験](../tests/review/release-time-owner.test.ts)：8fieldの同binding／descriptor pin、clone／foreign／getter拒否、S／L／O区間・等号、donor→pending→upper一度消費、guard中revoke／再入、正常discard終端不変・固定最初の診断 | 任意fakeから作れる非実行scopeであり、scope内allocate一度は同run全体の唯一生成証拠ではない。出力inspectは凍結dataで、source／job権限へ戻せない。descriptor方式の存在を任意Proxyの全trap無副作用保証にしない |
| [compiled time scope](../tests/review/fixtures/compiled-release-time-owner.mjs)の固定値移譲・discard／取消、[compiled handoff](../tests/review/fixtures/compiled-release-time-handoff.mjs)の空O保持／source guard退役とAustraliaの元class正常fake | 固定Oの値bridgeと実class正常例は別部分。両fixtureはTHのsync／queued・全post-O faultを実行しない。専用開発artifact・B-03・通常依存の梱包正対照／禁止閉包負対照は未完の別gate |
| [梱包検査source](../tests/review/package-http-classification.mjs)：stopから上位clearを直接呼ぶAST、private宣言非露出、値kernelの固定依存／時計・I/O禁止を検査するコード | 検査コードを読んだだけで今回のdist／tarball合格にしない。AST／字句上の限定検査を全動的到達性・閉包不在の証明にしない |

[TB-B検証記録§6](E2E_BEST_PRACTICE_RELEASE_TIME_HANDOFF_TBB_2026-11-01.md)は重要な残差である。旧選択3点の取消だけでは後半の新guardへ同期到達せず、全post-O sweepを追加した。discard失敗を握り潰す変異は追加sweepで検出した一方、finally先頭失敗で後続解放sectionを飛ばす変異はrollbackの再解放に隠れ、既存試験が成功した。この過去の反例を維持し、最終timer0・fresh成功を全解放section継続の証拠にしない。元finallyの継続と後段rollback救済を独立に識別できる対照は将来回復条件へ残し、新friend／public観測口は作らない。今回これらの変異・試験を再実行したわけではない。

## 5 worker jobへの未接続保証と将来条件

[worker job設計](BEST_PRACTICE_ABORT_SCOPE_WORKER_TIME_BINDING_DESIGN.md)は既存prepared-onlyのdiscardを削除せず、WJ-D／CT-Cの正式供給・連続fake接続を別承認へ残す。合成WJ／回復／finishの値保証が存在することと、同session由来の接続があることを区別する。

| ID | 現在の静的根拠と未接続点 | 将来提供前に揃える条件 |
|---|---|---|
| N6-W01 | TB-Bは同S／全L／O／Uを固定discardしsession.closeで終了。[合成job issuer](../tests/support/review/synthetic-worker-job.ts)はfakeのseed／台帳を使い、TB-B acceptedの移譲先ではない | 同run／session／source／key／origin／canonical budgetの私有leaseを固定生成元から一度移し、同ready世代／supervisor／worker／input receipt／job claimへ結合。別seed・同値copy・idだけの一致を正式bindingにしない |
| N6-W02 | [通常adapter](../src/review/update-set-adapter.ts)は通常sourceを生成し、analyze入力でretrieved_at=T_iを採る。[payload処理](../src/review/payload-review.ts)は同T_iをreviewed_atへ使う。TB-Bの非公開O／Uを受け取る継続ではない | 同inputのT_iをready前にも一度受理し、S <= O <= U <= T_i <= S+Lとpost-guard後U更新を確認。startup／送信失敗・omissionでUを巻き戻さない。元S／全L／policyは再pin・再計算しない |
| N6-W03 | [合成time issuer](../tests/support/review/synthetic-worker-time.ts)は同input期待値／U・通常finishのE／集合検査を持つが、実supervisor／workerからの証拠ではない。[実supervisor](../src/review/worker-supervisor.ts)はlocal kind別のready／result形状、id・bounded JSON等を検査するが、応答のkind echoは要求しない | 実応答を同jobの期待target／release context／T_i・世代へ結合し、返却EとS <= O <= U <= E <= S+Lを確認。空200／解析0件も下限Oを省略しない。既存protocol成功だけで新しい私有時刻照合済みにせず、新wire field追加も承認しない |
| N6-W04 | [実worker](../src/review/review-worker.ts)が[finalize](../src/review/aggregate-finalize.ts)でEを採りfull schemaを検査。通常adapterはworker.close待ち→session.close→元remaining／取消を確認。これはTHのfake終端では実行しない | Eを親で再採取・補正せず、同finish候補の一度消費・実worker終了／session cleanup・最終guardへ連続結合。sourceClosedを実worker終了証拠にせず、終了未確認／cleanup異常はUnknownのまま公開を止める |
| N6-W05 | 合成回復plan／finish比較・後続の非実行候補保証は、実回復route／新世代起動／実cleanupへの接続を証明しない。通常のsoft回復・停止後部分finishは既存の別契約 | 同generation／集合・元S／L／O／保持Uを失効後再開不能に結合。正常source解放後は既存pendingの返却検査・終了／固定終端だけとし、新job／世代／GETを作らない。停止後finishへの新時刻契約は別設計／別承認に残し、既存部分集約を無断で失敗へ変えない |

WJ側の異常停止後に保持するUTC dataだけの終端slotと、TB-Bがrun失効で上位timeを破棄する現在の責務は異なる。WJのU保持を理由にTB-Bの失効・discardを無効化しない。既存full schemaは空200の非公開O／Uを入力として持たず、その下限整合まで検査済みとはしない。input／選択window／payload receiptの実供給元・低減実効Lと出力JSON宣言deadlineの整合・日時長cap・exact layout／全費目上界も未解決／Unknownのままである。実workerの存在自体やschema合格を、本節の新binding完了に数えない。

## 6 個別承認前の優先順・回復記録

1. TH01〜03と通常adapterの既存公開shape／Permit・設定代替／終了待ちを守り、正常下位解放とrun停止を区別する。純粋unknown、元caller拒否、Dのcleanup後withheldを同等と扱わない。DA09／21／24の関連assertは元TimeHandoffの代替ではない。
2. TH04／05の選択点とqueued発火順、TH06の最終読取までの同期sweepを同入力・同供給点で回復する。元totalの正常経路・注入先・実発火確認・各cancel後のfresh確認を記録し、内部反復数でcase数を増やさない。最後のdiscard失敗を握り潰す負対照も別に維持する。
3. 同accepted消費→上位held→sourceClosed→固定discard、元run失効・最初の診断保持・未確認責務を連続確認する。finallyの固定全解放sectionとrollback救済を独立対照で分け、観測不能は未確認として残す。元source参照や既取得copyの全graph／heap解放を主張しない。
4. worker接続はN6-W01〜05の実供給・所有・時刻／集合・一度claim・終了境界を別承認で満たすまで閉じる。[B-03](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)の専用artifact、source fallbackなしのcompiled故障対照、通常依存を欠落させない梱包正対照と禁止閉包不在の負対照も独立gateである。
5. 回復記録に元revision／TH-ID・宣言テンプレート／入力variant／正常経路と注入位置／直接assertion・artifact、新境界／同一性／新case・artifact、共有部分・未代替残差、独立oracle／負対照、実行結果と終了／cleanup確認を揃える。保証低下を受容するなら失うassertionと非提供範囲・将来回復条件を個別承認へ渡す。受容できなければ回復先行またはリリース停止とする。

NS01〜05の同constructor・core・ready／同bytes・ack／一度消費・失効／元pin・観測保証を本書だけで一括回復しない。AP01〜06の保証低下・旧試験削除・friend撤去・互換変更・設定変更・公開は未承認。新friend・診断からの昇格口・closed sessionからの再発行を回復口にしない。正式発行口閉鎖・全体受付無効・Unknown・調査保留と、実接続・実通信・Push未実施を維持する。

## 7 今回の静的確認

元TH試験・正規台帳、accepted消費／bridge／time scopeと元sessionの生成・handoff／finally／discard／stop／rollback、値単体・compiled2fixture、開発DAの該当本文、worker設計と実adapter／supervisor／worker・合成issuerの該当境界を静的に読んだ。THの直接assert、unitの保持保証、未確認の全解放sectionと未接続worker保証を分けた。今回の実装・試験再実行・製品moduleのimport／実行・build／pack・保証回復判定は行っていない。

2026-11-19の静的確認：本書とAP01親文書の2MDについて表8・ローカルlink52・明示anchor12、N6設計ID21（E10／T6／W5）、TH01〜06の対応に重複・欠落がないことを確認した。旧分類は部分対応2／未対応4のままで、移行完了・最新成功数ではない。元variant／選択点と全位置sweep・queued予約、accepted先行消費／同Oの移動・guard切替、元stopの直接失効・診断copy、通常adapterの終了順とTB-B後段未接続を静的照合した。初回の文書checkerは本文参照N6-W01〜05も宣言IDへ加算して失敗したが、表の宣言5行と本文の範囲参照を切り分け、宣言行だけの照合へ訂正して再確認した。製品の不具合・試験失敗・保証回復結果には数えない。AP01〜06未承認欄、末尾改行・表列数・差分空白を確認し、tracked差分はAP01親MD1件、新規は本書1MD、stage0、製品・試験・設定の変更0だった。各閉鎖条件・Unknown・調査保留を維持し、保証低下受容・撤去・公開可の証拠は追加しない。
