# AP01 NS03：一度限り消費・draft後失効・return／close取消と診断保持の保証レビュー

Version: release-ap01-ns03-consumption-revocation-guarantee-draft-0.4 / Date: 2026-11-18。
Status: **MDによる個別承認前整理。限定リリースの公開方針だけ採用済みで、NS03の保証低下は未承認。** 基準HEADは`ba793d6`。[AP01詳細](BEST_PRACTICE_RELEASE_AP01_LIMITED_SCOPE_DESIGN.md)NS03／RV08を具体化する。旧caseのID・分類・期待値を変更せず、今回の試験成功・保証回復を主張しない。

draft-0.4のレビュー修正：レビュー修正の基準HEADは`afe2841`（修正時のHEADは`afe2841`）。draft-0.3の注記と§7の記録が、取消の条件を持つ行を「N3-C03〜C10」としていたが、N3-C08（SAB-11）は取消ではなく元floorの再確認である。2か所を「取消はN3-C03〜C07・C09・C10、元floor再確認はN3-C08」の形に直した。§3の本文は行IDで指す形のままで、表の本文・旧分類・ID・確認順は変えていない。

draft-0.3のレビュー修正：レビュー修正の基準HEADは`2316550`（修正時のHEADは`2316550`）。§3の重複対応付けの段落が、両文書の条件を誤って要約していた。NS01側のN1AD03〜06の回復条件にforeign履歴不変・同constructor／登録世代は含まれず（それらはN1RG03〜06の条件）、本書側の重複4行（二重消費とclose後再利用）に取消の条件はない（取消はN3-C03〜C07・C09・C10、元floor再確認はN3-C08）。要約をやめ、両文書の該当行の将来回復条件の列を行IDで指す形に改めた。表の本文・旧分類・ID・確認順は変えていない。

draft-0.2のレビュー修正：レビュー修正の基準HEADは`21dffc0`（修正時のHEADは`21dffc0`）。§3のN3-C01／C02／C11／C12は、[NS01レビュー](BEST_PRACTICE_RELEASE_AP01_NS01_BINDING_GUARANTEE_REVIEW.md)§4のN1AD03〜06と同じ旧case（SAB-03・NDB-03・SAB-06・NDB-07）であるのに、本書に重複の対応付けがなかった。将来の個別承認で二重に数えたり、片方だけ更新して条件がずれたりしないよう、§3に対応付けと扱いを追記した。表の本文・旧分類・ID・確認順は変えていない。

正式発行口閉鎖・全体受付無効・C実行入口／body起動閉鎖・通常経路未切替・Unknown・VM／監視／telemetry調査保留を維持する。保証低下・旧試験削除／skip／期待値弱化・friend撤去・設定変更・公開は未承認。実装・発行／claim消費・試験再実行・build／pack・負荷採取・実接続・実通信・実機操作・コミット・Pushは行わない。元の期限・既定並列度とLOAD6／LOAD7選択未承認も維持する。

## 1 対象と正規参照

非提供範囲は、閉鎖status／nativeのprivate消費からdraft採用・外側closeまでを新しい本番経路として提供する部分である。通常source／workerの取消・終了・既存Permitの保証まで延期しない。[NS01レビュー](BEST_PRACTICE_RELEASE_AP01_NS01_BINDING_GUARANTEE_REVIEW.md)の同constructor／core／登録ready世代は前提責務として残し、本書の一度消費だけで回復済みにしない。

正規caseは[移行台帳](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md)の旧fullName・入力・故障位置とする。P＝実classをfake I/Oで使う旧経路、D＝独立開発assembly、U＝無bridge注入単体は別保証であり、合成成功は実認証・実通信・正式発行の証拠ではない。本書は主要12caseと診断・cleanupの隣接6caseを選択した文書レビューで、全SA／SAB／ND／NDB／UNの網羅表や新しい成功件数ではない。

N3-で始まるIDは本書だけの整理IDであり、旧case ID・NS01のN1-ID・製品のphase／診断IDを置換しない。既存台帳の「部分対応／未対応」は引用として維持する。未代替は移行先証拠の不足であり、旧実装が現在壊れているとの判定ではない。

## 2 消費・返却・closeの別々の境界

[source](../src/review/bounded-source.ts)、[session](../src/servicenow/bounded-read.ts)、[旧ND root](../src/review/abort-scope-evidence-native-diagnostic.ts)の本文から、次の区間を区別する。下表は共通状態機械の新設計ではなく、既存の異なるownerの観測位置である。

| ID | 現行位置と保持責務 | まとめて成功扱いにしないもの |
|---|---|---|
| N3-B01 | native分岐のconsumeはconsumeClaimを先に消費し、自issuerのlive terminalを退役してからprovenance・pre/post・bridge.acceptへ進む | claim消費・consume_attemptsとnative counts.consumedは別。foreign側の台帳をlookupして消費しない |
| N3-B02 | source.statusはcheck→release状態確認→consumingへ遷移してからtakeStatusを呼ぶ | 二度目は同状態へ戻れず拒否する。sourceの状態遷移はnative側の最終acceptedとは別 |
| N3-B03 | session.takeStatusは自terminalを削除・退役し、guard・source／snapshot／lease／core／attempt・登録世代・元floorを確認後、session側consumptionsを増やす | 失敗後のterminal返却・再試行はしない。session側の受領数1でも、後続失効でnative側consumedや公開受理が成立しないことがある |
| N3-B04 | sourceはprivate draftをfreezeし、check後にaccepted_statusへ進み同期consumerから返す | draft生成・同期consumer返却は公開成功ではない。native側はbridge.accept復帰後にも元floor／guardを確認してからconsumedを増やす |
| N3-B05 | 旧境界試験のwrapperは本物のconsumer.status復帰後にcancel_postを同期実行、またはgap取消をqueueMicrotaskで予約してdraftを返す | 同期consumerのreturnと、非同期の#probeStatusAcceptance全体のreturnを同じ位置と呼ばない |
| N3-B06 | #probeStatusAcceptanceはguard・consumptions===1・内部summary freeze・最終guardを経てreturn。finallyでcomposition key／自terminal・consumer・会計予約を退役する | inner finallyの予約返却は既発生C/G/Pの払戻しではない。inner完了と外側session closeは別で、借用済み値はまだ公開済みとはしない |
| N3-B07 | 外側await復帰後に#checkComposition。SAはsession close後に最終copyを返し、NDはdriver close／dispose・run診断採取・session close／construction copyへ進む | 表中の旧取消caseではSAはreject、NDはcode／draft=null等のdataへ写像する。全cleanup区間に同じpostがあるとは推定せず、close文字列・reserved=0からreader cleanup confirmedも推定しない |
| N3-B08 | ND公開wrapperにもdriver close／disposeのfinallyがあり、firstFailureを保持する | close／disposeの呼出し回数1を全helperへ一律要求しない。一度限りなのは各claim・受理・resource副作用であり、既存の反復closeと同join／dispose claimを別に確認する |

stopは通常の権限を同期失効させる一方、既に取得したnative readerのcleanup待機は元floor内で継続する。停止したので待機を即打切る、cleanup完了したので候補採用を再開する、というどちらの変換も認めない。外側診断はrun・canonical予算・native上位・constructionの各ownerで採取位置が異なる。

### 注入位置の限界を残す

旧SAB-09／11のObject.freeze spyは、state=status_accepted_closed_gateという形状を見て、原freezeを呼ぶ前に取消またはelapsed更新を行う。sourceのprivate draftとsession内部summaryの双方がその形状を持ち得るが、元testにsite識別・発火回数assertはない。従って「特定の最終summary freeze完了後だけに注入した」とは主張しない。将来その専用postを保証するなら、旧注入を維持した上で別の固定対照を追加する。

旧SAB-10／NDB-06はconsumer.statusの同期返却後に取消を予約する。旧case名のprivate return→outer closeという意図を保持するが、queueMicrotaskだけではN3-B06の非同期returnが完了した後の特定位置へ注入した証拠にはならない。N3-B05とN3-B06→07を分ける位置証拠が追加されるまで、外側gap全体を網羅済み・移行済みにしない。

driver close／dispose中、診断copy生成中・生成後等への専用取消も、この旧queue注入から自動的に確認済みにはしない。現行のfinally・close呼出しの存在を、全ての後段位置に取消の最終postがある証明へ読み替えない。将来提供する際の非公開確定点・停止との順序と、採取済み診断の寿命は別に固定して対照を追加する。

## 3 主要12caseと未代替の残差

元assertionは[status境界試験](../tests/review/source-status-binding-boundary.test.ts)／[native境界試験](../tests/review/native-session-boundary.test.ts)で静的確認した。下表の将来条件は実装・試験実施の承認ではない。

| ID／旧case・正規fullName | 元Pで残すassertion・注入位置 | Dの候補／残差と将来回復条件 |
|---|---|---|
| N3-C01／[SAB-03](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-03) `refuses duplicate consumption before returning any accepted summary` | 本物のconsumer.status復帰後、同tokenをもう一度渡す。外部reject internal_review_error・内部invalid_state、後続fresh runはconsumptions=1 | DN-19は部分対応。元未公開draft・実consumerの二度目拒否と内部／外部写像を同位置で回復し、別run成功を失敗runの再利用許可にしない |
| N3-C02／[NDB-03](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ndb-03) `rejects duplicate at the actual source boundary and retains both diagnostic layers` | 同じ二度目消費で外部code=internal_review_error・run内部invalid_state、native consumed=0・draft=null | DN-19は部分対応。sourceの先行消費とnativeの最終accepted前失敗を別計数で保持し、どちらも一律0へ補正して同値化しない |
| N3-C03／[SAB-04](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-04) `stops at cancel_pre and discards the unpublished result` | 本物のconsumer.statusの前に外部signalを取消。reject cancelled、後続fresh probeのcleanup closed | [DN-20](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-20)は部分対応。元実consumer直前の同期失効と非公開を回復。元caseが内部診断全層・消費数0までassertしたとはしない |
| N3-C04／[SAB-05](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-05) `stops at cancel_post and discards the unpublished result` | 本物のconsumer.status復帰後、wrapper返却前に同期取消。reject cancelled、後続fresh probeのcleanup closed | [DN-28](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-28)は部分対応。Dのsource post-guardと元wrapper復帰後の位置を同一視せず、候補の非公開・先行理由を同位置で回復 |
| N3-C05／[NDB-04](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ndb-04) `discards unpublished drafts at cancel_pre and preserves cancellation` | 本物のconsumer.status直前に同期取消。code=cancelled・draft=null・native upper sealed・run内部cancelled | DN-20は部分対応。元source→bridge→native上位→外側runの理由を連続保持。元caseが全counterを0とassertした扱いにしない |
| N3-C06／[NDB-05](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ndb-05) `discards unpublished drafts at cancel_post and preserves cancellation` | consumer.status復帰後に同期取消。同じ4assertion（code／draft／seal／run内部）を維持 | DN-28は部分対応。proof post-guardだけで元bridge復帰後の失効を代替しない。先行source受領とnative採用・公開を区別 |
| N3-C07／[SAB-09](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-09) `checks revocation after draft construction before publishing acceptance` | 上記freeze spyで取消。reject cancelled・transportConstructor診断primary.cancelled | [DS-31](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-ds-31)／DN-28は部分対応。callback失効に加え、元draft生成区間・次guard・公開禁止を回復。freeze完了後の専用postは旧caseと別対照にする |
| N3-C08／[SAB-11](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-11) `checks the original attempt floor again after draft construction` | 同形状freeze spyでelapsed=10000へ更新し、reject upstream_unavailableを要求 | DN-10は関連参照で未対応。cleanup待機のfloor到達をdraft区間の再clock確認へ読み替えない。元floorを引継ぎ、全run期限との理由差を維持 |
| N3-C09／[SAB-10](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-10) `does not publish a result cancelled between the private return and the outer close` | consumer.status復帰後にcancel_return_gapをqueueMicrotaskで予約。外部reject cancelledを要求 | 新caseなしで未対応。旧queue注入を維持し、N3-B05と非同期return→外側closeの位置を別に固定して回復。元assertに内部診断／全位相の網羅を補完しない |
| N3-C10／[NDB-06](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ndb-06) `discards unpublished drafts at cancel_gap and preserves cancellation` | 同じ同期consumer復帰後のqueue取消。code=cancelled・draft=null・native upper sealed・run内部cancelled | 新caseなしで未対応。NDのnative.run待機・outer await復帰・driver closeをSAと同一視せず、同位置と外側公開抑止を回復。Dのcleanup後withheldだけで代替しない |
| N3-C11／[SAB-06](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-06) `cannot reuse the real source consumer after close or recover a permit from its draft` | 返却後consumer.statusはclosed、releasePortForはundefined、結果凍結・Permit unavailable・terminal fieldなし | DN-19／DS-17は部分対応。実consumerのclose後拒否とPermit回復不可を維持。通常Permitの正規経路は非提供・削除候補へ含めない |
| N3-C12／[NDB-07](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ndb-07) `rejects all source consumers after close and does not return source/core identity handles` | 正常probe後consumer拒否・binding診断と秘密非出力 | DN-19／DS-17は部分対応。実consumerの寿命・非公開handle境界を回復。診断booleanやfreezeは全private graphの解放証拠ではない |

N3-C01／C02／C11／C12は、NS01レビューのN1AD03〜06（SAB-03・NDB-03・SAB-06・NDB-07）と同じ旧caseである。件数は旧case単位で1回だけ数え、片方の文書の回復条件を満たしただけで完了としない。回復時は、本書のN3-C01／C02／C11／C12と、NS01レビューのN1AD03〜06の将来回復条件の列を、同じ元位置で合わせて満たす。どちらかの条件を変えるときは、もう一方の文書も同時に照合する。

DN-19の一度消費／close後proof拒否はDの独自issuerに対する保証である。旧native issuerのconsumeClaim、session receiptの退役、source状態のconsuming、最終公開copyの間を一本化して数えない。二重消費・取消は既に使ったclaimや診断を返却せず、失敗したrunから候補を再採用しない。

## 4 診断・cleanupの隣接6case

元assertionは[status結合試験](../tests/review/source-status-binding.test.ts)／[native結合試験](../tests/review/native-session-composition.test.ts)で静的確認した。これらは全て旧台帳の部分対応で、下位の純粋値・Dの別cleanupからPへの伝播は未代替である。

| ID／旧case・正規fullName | 元assertionと保持する残差 | 将来回復条件 |
|---|---|---|
| N3-D01／[SA-05](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-05) `refuses unconfirmed cleanup and closes without calling fallback` | fake cleanup=unconfirmed申告でreject internal_review_error、timer0・後続probe closed。DN-07のnative cancel拒否は異なる生成条件 | 外部cleanup申告を確認済みとして採用せず、元拒否とtimer回収を維持。実reader異常は別位置で確認し、fallbackを有効化しない |
| N3-D02／[ND-07](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-07) `preserves HTTP 401 and rejected cleanup through actual session closure` | cancel throwでcode=authentication_failed、release.http.status=401・cleanup unconfirmed／cancel_rejected、issued=0・draft=null。constructionはclosed・primary=null・teardown confirmed | DN-08は部分対応。HTTP先行理由・reader cleanup未確認・construction回収を別軸で保持。construction confirmedからreader confirmedへ昇格しない |
| N3-D03／[ND-08](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-08) `preserves HTTP 403 and rejected cleanup through actual session closure` | 同じcancel throwでcode=internal_review_error、release.http.status=403とcleanup未確認、issued=0・draft=null・construction confirmedを保持 | DN-07は部分対応。401の認証失敗と403＋cleanup異常の理由写像を混同せず、旧ND上位slotと実class外側closeへ連結 |
| N3-D04／[ND-16](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-16) `synchronously revokes on external cancel, joins the same cleanup until the original boundary and retains late facts` | pending cancel中にsignal取消、元10秒境界まで進めてcode／native primary=cancelled、consumptions=0・cleanup unconfirmed・cancel=1・stream unlocked。late complete後timer0・fresh成功 | DN-09／10は部分対応。同期失効と同cleanup joinを元位置へ戻す。元ND-16はlate complete後の旧結果再比較を直接assertしていないため、不変copy／late非昇格の専用対照は別途必要 |
| N3-D05／[ND-18](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-18) `uses the canonical clock and does not create a fresh cleanup deadline` | cancel中elapsed=10000で外部／run内部・public=upstream_unavailable、native primary=deadline_exceeded・cleanup unconfirmed、issued=0・timer0 | DN-10／DB-02は部分対応。native window到達とcanonical全run期限を別診断で保持し、cleanup開始時にdeadlineを作り直さない |
| N3-D06／[ND-19](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-19) `keeps deadline_exceeded only when the canonical run deadline itself is reached` | cancel中elapsed=60000で外部code／run public=deadline_exceeded・issued=0 | DN-11は部分対応。N3-D05との対照で全run期限到達だけをdeadline_exceededへ写像し、片方の値一致だけで元理由伝播を回復済みにしない |

## 5 診断保持・未確認責務の承認前チェック

1. SAの外部reject、transportConstructorのprivate primary、NDのrun内部／canonical public、native上位のHTTP／cleanup／acceptance、construction teardownを別欄で記録する。旧caseがassertしない欄は「未assert／追加対照が必要」とし、code一致だけで全層保持としない。
2. native cleanup confirmed／unconfirmedは同readerの事実であり、source消費・whole-run受付・lane teardownやsession cleanup='closed'とは独立する。停止理由・HTTPをcleanup異常で上書きせず、先行取消を後着closedに置換しない。
3. consumerと自terminalの失効、未公開draftの非返却、元会計予約の解放、native reader待機／late結果、外側診断copyをそれぞれ所有ownerへ対応付ける。疑わしい解放・実backing容量はUnknownのまま残す。
4. 同期cancel、queue cancel、freeze区間、元floor等号、外側await復帰、driver close／dispose異常を同じ一件の「post失敗」に集約しない。N3-C09／10の非同期gap位置証拠と、N3-C07／08のfreeze site識別は現時点で不足する。
5. 回復しない旧assertionを受容する場合は、非提供範囲・元case・残差・責務保持先・将来回復条件を個別承認へ渡す。通常経路の停止／解放を一緒に弱めず、AP02〜06の撤去・入力互換変更・試験切替・公開を自動開始しない。

## 6 将来の回復とcompiled境界

各旧caseについてrevision／ID・fullName／入力・注入位置／旧assertion・artifact、新実装／同owner境界・case・artifact、共有部分・未代替残差、独立oracle・負対照、実行結果と終了／cleanup確認を揃える。元のqueue／freeze注入を残し、新たな専用post・非同期gapの位置対照は追加条件として区別する。現在の旧caseをより強い新仕様へ遡及分類しない。

現行[compiled SA](../tests/review/fixtures/compiled-source-status-binding.mjs)は基本受理・unconfirmed申告拒否等、[compiled ND](../tests/review/fixtures/compiled-native-session-composition.mjs)は403／404×body有無と401＋cancel throw等を扱うが、元境界試験のduplicate・cancel_pre／post／gap・draft freeze注入を実行するfixtureではない。既存scriptの存在・過去成功だけで主要12caseのcompiled移行済みとしない。

source fallbackなしの専用artifactと元故障位置のcompiled対照、P／D／U非干渉、配布物の正／負対照は[B-03](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)の別gateである。Uのissue／pre／post・同reader保証も別に残し、Dのwithheldやcleanup後summaryへ置き換えない。故障注入のための新friend・公開writer／診断昇格口・fixture台帳共有は追加しない。

通常並列の元5秒・既定並列度、旧比較childの60秒、製品全体60秒と元attempt floorを区別して維持する。実認証／実通信・正式発行の確認は別承認・未実施であり、元floor内のfake成功から本番提供の承認を推定しない。

## 7 今回の静的確認

旧case台帳、test本文、source／session／native rootと現行compiled2fixtureを静的に読取り、主要12caseと隣接6caseを対応付けた。新しい試験実行・同等移行判定は追加していない。

2026-11-18の静的確認：本書とAP01親文書の2MDについて表6・ローカルlink49・明示anchor27、N3設計ID26（B8／C12／D6）、18旧caseのID・fullNameと正規台帳の一致を確認した。SAB-10／11・NDB-06の未対応と他15件の部分対応は旧分類のままで、queue／freeze注入の本文・既存compiled2fixtureの対象外条件も照合した。末尾改行・差分空白・AP01〜06の未承認欄維持を確認し、tracked差分はAP01親MD1件、新規は本書1MD、stage0、製品・試験・設定の変更0だった。製品moduleのimport／実行、試験再実行、build／packは行っていない。これは文書の静的整合であって、全境界網羅・保証回復・保証低下受容・公開可の証拠ではない。

2026-11-18の静的確認（draft-0.2）：N3-C01／C02／C11／C12とN1AD03〜06の旧case ID・アンカー・fullNameが一致すること、両文書の期待値と回復条件に矛盾がないことを確認した。表の本文・旧分類・設計ID26は変えていない。2MDの表6（列数のずれなし）・ローカルlink50（注記の1件を追加）・明示anchor27の解決、末尾改行・差分空白を再確認した。製品・試験・設定の変更はない。

2026-11-18の静的確認（draft-0.3）：§3の重複段落が、本書N3-C01／C02／C11／C12とNS01のN1AD03〜06の行だけを指し、foreign履歴不変（N1RG05／06）や取消（N3-C03〜C07・C09・C10）や元floor再確認（N3-C08）の条件を持ち込まないことを、両文書の該当行と照合した。上段のdraft-0.2記録の「回復条件に矛盾がない」は、旧要約文の誤りを検出していなかった。表の本文・旧分類・設計ID26は変えていない。2MDの表6（列数のずれなし）・ローカルlink50・明示anchor27の解決、末尾改行・差分空白を再確認した。製品・試験・設定の変更はない。

2026-11-18の静的確認（draft-0.4）：§3の表の行名と期待値から、取消の行がN3-C03〜C07・C09・C10の7行（cancel_pre／cancel_post、freeze区間の取消、cancel_return_gap／cancel_gap）、N3-C08がfreeze spyでelapsed=10000に更新する元floorの再確認であることを照合し、draft-0.3の注記と§7記録の範囲を直した。表の本文・旧分類・設計ID26は変えていない。2MDの表6（列数のずれなし）・ローカルlink50・明示anchor27の解決、末尾改行・差分空白を再確認した。製品・試験・設定の変更はない。
