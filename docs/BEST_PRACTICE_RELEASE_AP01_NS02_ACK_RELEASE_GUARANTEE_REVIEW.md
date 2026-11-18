# AP01 NS02：同bytes課金・private ack・legacy release判断とPermit結合の保証レビュー

Version: release-ap01-ns02-ack-release-guarantee-draft-0.1 / Date: 2026-11-18。
Status: **MDによる承認前整理。限定リリースの公開方針だけ採用済みで、NS02の保証低下は未承認。** 基準HEADは`a5687ba`。[AP01詳細](BEST_PRACTICE_RELEASE_AP01_LIMITED_SCOPE_DESIGN.md)NS02／RV07の非提供範囲・未代替保証・将来回復条件を旧caseへ対応付ける。新しい試験成功・移行同等性判定は追加しない。

正式発行口閉鎖・全体受付無効・C実行入口／body起動閉鎖・通常経路未切替・Unknown・VM／監視／telemetry調査保留を維持する。保証低下・旧試験削除／skip／期待値弱化・friend撤去・設定変更・公開は未承認。実装・発行／claim消費・試験再実行・build／pack・負荷採取・実接続・実通信・実機操作・コミット・Pushは行わない。元期限・既定並列度とLOAD6／LOAD7選択未承認も維持する。

## 1 通常Permitと閉鎖laneの未代替保証を分ける

非提供対象は、新しいfake200連続経路を本番へ採用する機能である。通常sourceのReleasePermit・不変release snapshot・既存C方式・通常workerを撤去／延期する方針ではない。[通常source binding試験](../tests/review/source-release-binding.test.ts)には、同session／source／Permit・独立snapshot、foreign／copy混入、取消／close、C方式のlimitations等の維持対象がある。存在の静的確認を今回の試験成功とはしない。

NS02で未代替なのは、実classのsnapshot起点で認証modeを導出し、同canonical会計のbodyを解析・cleanup・ackし、その値を同sourceのlegacy release判断・実Permit／port・登録ownerのprepared検査へ連続して結ぶ保証である。Dの合成auth指定や純粋matchedだけではこの連続性を回復しない。実classを使う旧caseもfake I/Oであり、実認証・実通信・正式発行のprovenanceの証拠ではない。

正規参照は[旧case移行台帳](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md)のACK-01〜37／ACKB-01〜02の39行である。本書では全39行を一度ずつ主表へ対応付け、旧fullNameは各リンク先を正規とし、ここでは入力variantを明記する。行数は台帳の責務単位で、現HEADのtest発見数・実行成功数・移行済み件数ではない。旧「部分対応／未対応」分類は変えず、N2-IDは本書内だけの整理IDとする。

## 2 現行のprivate連続境界と証拠の限界

| ID | sourceの生成・消費点 | 保持する保証と、同一視しないもの |
|---|---|---|
| N2-E01 | [session入口](../src/servicenow/bounded-read.ts)と[固定fake供給](../src/servicenow/review-composition-fake-io.ts) | snapshot／oauthをpinし、全transcriptのcaller bytesをawait前にcopy。authは元snapshotのtoken・expiryとDate.now＋全deadlineからper-user／cached／exchangeを選ぶ。Dのauth文字列指定は同じ導出ではない |
| N2-E02 | sessionの#openComposition→[bootstrap契約](../src/servicenow/review-bootstrap-contract.ts) | 同source・transport handle・snapshot／lease・canonical bootstrap accountingを結合し、final4枠を予約。第二core・予算・期限を生成しない。予約返却と既発生C/G/Pの返金は別 |
| N2-E03 | [native body](../src/servicenow/review-native-body.ts)→[body lane](../src/servicenow/review-bootstrap-body.ts) | 同attemptのcopyされたchunk長を同会計へ課金し、その保持chunkを連結してfatal UTF-8／JSON解析・hash化。typed cleanup終端後のcandidate→draft→ackと、後段のsource ackは別の消費境界。hashやbyte総量だけは採用権限でない |
| N2-E04 | sessionのmint／take→[sourceのprivate consumer](../src/review/bounded-source.ts) | 同key内のWeakMapでpurposeと値を結び、takeでguard・自ack削除・purpose確認。parentは同targetのstrict行として受理し、releaseには同body由来のr.valueを渡す。caller JSONや公開methodをprivate ackとして採用しない |
| N2-E05 | sourceの#observeRelease | readRows後guard・UTC採取・receipt側比較を経ても、legacy判断は同source内で行う。20／21境界・空／不完全・family競合・policyを扱う。側方の純粋比較候補がmatchedでもPermitを発行する根拠に置き換えない |
| N2-E06 | sourceの#completeRelease→session.bindReviewReleaseSource | legacy matchがmatchedの時だけ同sourceがprivate Permit・独立snapshot・portを生成して登録ownerへbind。port.matchesは元Permit／snapshotの同一性を見る。書換え可能な公開decisionやPermit形JSONから復元しない |
| N2-E07 | bootstrapのbind／prepared→[lifecycle](../src/servicenow/review-evidence-lifecycle.ts)のinspectSource／inspectPrepared | 同source／Permit／port・登録ready参照・snapshot／lease・同transportを再確認し、固定prepared copyへ進む。公開bind hookの成功らしい返却だけでは不十分。実source→owner結合はNS01のready保証とも別に確認 |
| N2-E08 | inner finally→handoff終端→外側close | consumer／contract・観測ownerを失効し、予約返却・元会計・最初の理由を保持。公開prepared_onlyはauthorityなしで、Permit・live handleを返さない。時刻projection／O／handoffの元位置はNS04〜06の未代替責務として残す |

同bytesとはcopyを禁止する意味ではなく、課金した受領内容を元attemptに保持し、その同じ内容から解析・candidate／ackを導出することをいう。総byte数の一致だけでは内容・purpose・同sourceの一致を証明できない。旧ACK-01／03／04／22の総量assertとN2-E03のsource順序を区別し、将来の取得・cleanup失敗時の計数は別の対照で確認する。

Permitは既存release gateへの入場証であり、新しい正式証拠・実測Australia・table ACL・正式transport開始の証明ではない。この意味を限定リリースのために強めたり、既存C方式を新status用fallbackへ拡張したりしない。

## 3 会計・認証・親受理の18行

元assertionは[private ack試験](../tests/review/private-composition-ack.test.ts)を静的に読む。DのDB／DS候補とDA／DC追加参照の正規名・分類は移行台帳を継承する。

| ID／旧case・入力variant | 元Pのassertion | 未代替残差と将来回復条件 |
|---|---|---|
| N2-A01／[ACK-01](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-01) parent＋release Australia | prepared_only・auth_ready・generation1、requests2・received_bytes=2body合計・payload0、closed／reserved0、正式発行disabled・dispatch unavailable・秘密／Permit非出力 | DB-01／DS-32／DA01／16は部分対応。元body→private ack→実source Permit→owner preparedの連続性を正負対照で回復。summary一致だけで同参照を証明しない |
| N2-A02／[ACK-02](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-02) 公開GET／source read／remainingMs／stats／closeを置換 | 置換された公開取得methodで失敗せずprepared・requests2。公開close未呼出し・timer0 | DB-17は部分対応。公開値の999やremaining0に依存せず元private供給を使う位置を回復。元caseは全spyの未呼出しを個々にassertしておらず、結果とthrow spyの証拠を分ける |
| N2-A03／[ACK-03](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-03) service-account・有効cached token | generation1、requests2・全body bytes・payload0、秘密非出力 | DB-19／DA16／DC15は部分対応。Dのcached指定ではなく、pin済み実snapshotのexpiryからmodeを導出し同会計へ結ぶ元位置を回復 |
| N2-A04／[ACK-04](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-04) service-account・exchange用OAuth応答 | generation1、requests3・認証を含む全body bytes・payload0、秘密非出力 | DB-20／DA16／DC15は部分対応。元snapshot→exchange選択→認証body解析→ready→parentを回復し、authを後から差替えない |
| N2-A05／[ACK-05](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-05) access_token空 | reject authentication_failed | DB-32は部分対応。元OAuth入力・認証完了前の停止位置・ready未成立を固定し、未assertの全効果0を旧実績へ追加しない |
| N2-A06／[ACK-06](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-06) expires_in=0 | reject authentication_failed | DB-33は部分対応だが新入力はexpires_in=60の等号。0と全run期限等号を別variantとして回復 |
| N2-A07／[ACK-07](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-07) token_type=mac | reject authentication_failed | DB-34は部分対応。合成token検査だけでなく元classのready失敗伝播と秘密非出力を同位置へ戻す |
| N2-A08／[ACK-17](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-17) 異なるparent sys_id | reject invalid_response | DB-30は部分対応。同target・strict親とrelease binding前の停止を回復し、foreign親なら全予算0だったと推定しない |
| N2-A09／[ACK-18](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-18) sys_mod_count欠落 | reject invalid_response | SV-03／DB-30は部分対応。欠落field以外を正規にした同入力で、元parent ackからreleaseへの進行を拒否 |
| N2-A10／[ACK-19](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-19) 親に余剰script列 | reject invalid_response | DB-31は部分対応。余剰列のstrict拒否を同private親受理位置へ戻し、本文をdiagnosticへ保持しない |
| N2-A11／[ACK-20](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-20) UTF-8 c3 28 | reject invalid_response | DB-29は部分対応。別の不正byte列の成功で代替せず、同bytesの課金・fatal decode・失敗後cleanupを確認 |
| N2-A12／[ACK-21](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-21) UTF-8有効・不正JSON | reject invalid_response | 移行先なし・未対応。decode成功後のparse失敗を独立variantとして回復。元assertはcodeであり、例外本文非出力の全欄検査を済みとはしない |
| N2-A13／[ACK-22](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-22) run呼出し直後にcaller全bytesを0化 | prepared_only・received_bytesは変更前の合計 | DB-35は部分対応。await前pinと同内容からの元解析／ackを回復。総量一致から全field内容の完全照合を推定しない |
| N2-A14／[ACK-25](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-25) totalBytes=1 | reject receive_budget_exceeded・後続fresh run closed | DB-26は部分対応。元classの課金後超過・失敗計数保持を同会計で回復。元Pのcaseは失敗budgetの実数を直接assertしていない |
| N2-A15／[ACK-26](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-26) responseBytes=1 | 同上のrejectとfresh cleanup | DB-27は部分対応。responseとaggregateの上限を別に検査し、Dの失敗計数をPへ加算しない |
| N2-A16／[ACK-27](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-27) request cap4 | reject request_budget_exceeded・後続fresh run closed | DB-21は部分対応。元ownerでfinal4枠を侵食しない受付と予約返却を確認。元caseが予約peak4や全失敗prefixを直接assertしたとはしない |
| N2-A17／[ACK-28](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-28) request cap5 | 同じrejectとfresh cleanup | DB-22は部分対応。cap4とcap5の進行prefixを同一視せず、費目・残予約・先行理由を回復 |
| N2-A18／[ACK-37](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-37) pending親・dispatch後elapsed=60000 | reject deadline_exceeded・timer0 | DB-04は部分対応。元全run期限等号・遅延I/O取消と実class closeを回復。新deadlineで救済しない |

ACK-25〜28の旧titleにあるcharged overshoot／final-fourという目的と、本文が直接assertするcode・fresh runの成功は分ける。sourceの課金順・予約条件は静的根拠として補い、未assertの失敗budget・全解放操作を旧caseの成功保証として遡及加算しない。

## 4 legacy release判断・実Permit結合の11行

| ID／旧case・入力variant | 元Pのassertion | 未代替残差と将来回復条件 |
|---|---|---|
| N2-R01／[ACK-08](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-08) Zurichのみ | reject release_not_admitted・後続fresh run closed | DA12はmismatched非実行draftの関連参照で未対応。元sourceの不許可→prepared拒否を回復。Dのok=trueをPの成功へ変換しない |
| N2-R02／[ACK-09](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-09) nonsense family | 同じ拒否とfresh cleanup | DA11のunknownとは入力／返却契約が異なり未対応。同文字列・同legacy判断とPermit未採用を回復 |
| N2-R03／[ACK-10](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-10) build_name=null・assertionなし | 同じ拒否とfresh cleanup | DA11／13は関連参照で未対応。null行と空観測／有効assertionを混同せず、元policy条件で拒否 |
| N2-R04／[ACK-11](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-11) result=[]・assertionなし | 同じ拒否とfresh cleanup | DA11はunknown draftを返せる別契約で未対応。元classのrelease_not_admittedを維持し、空200だけでC方式を有効化しない |
| N2-R05／[ACK-12](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-12) Australia＋Zurich | 同じ拒否とfresh cleanup | DA14の実測／設定conflictは実測2familyと別で未対応。元rowsとlegacy conflict→prepared拒否を回復 |
| N2-R06／[ACK-13](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-13) Australia 21行 | 同じ拒否とfresh cleanup | DA11の21null行は同入力でなく未対応。source projectionの21受付とlegacy観測上限20を分け、limit判断後にPermitを採用しない |
| N2-R07／[ACK-14](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-14) trim／大小文字とaddress／certificate余剰値 | family Australia・raw_buildname='australia'、PRIVATE非出力、instance_release／limitations凍結 | SV-08／DS-01／DA02／12は部分対応。同sourceのprojection・legacy正規化と独立snapshotを回復。元caseは全warningsの順序を比較していない |
| N2-R08／[ACK-15](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-15) 空200＋有効Australia設定 | source=operator_config・resolution_status=asserted、limitationsにrelease_config_may_be_stale | DA13／NR17は未対応の関連参照。実policyのinstance binding／期間pin→legacy C方式→同Permit結合を回復。1正対照で全fallback条件・全warning順の網羅を主張しない |
| N2-R09／[ACK-16](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-16) 実測Australia・有効Zurich設定 | reject release_not_admitted | DA14／NR17は関連参照で未対応。元の有効設定とexpired設定の差、unknown draft公開と旧rejectの差を残して回復 |
| N2-R10／[ACK-29](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-29) body JSONにrelease_match／instance_release／permitを偽装 | reject release_not_admitted | DS-21の入力envelope拒否とは別で未対応。bodyを通常観測として扱う元位置で、caller製Permit・matched申告を採用しない |
| N2-R11／[ACK-36](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-36) bindReviewReleaseSourceをno-opへ置換 | reject internal_review_error | 同条件の移行先なし・未対応。#completeReleaseが公開hookを呼んだだけでは足りず、登録ownerの実source／Permit／port／ready結合をpreparedで再検査する。元caseは内部理由・効果数・拒否siteを直接assertしていない |

legacy比較をDの値比較器へ差し替える承認ではない。[開発release比較試験](../tests/review/development-release-adoption.test.ts)はunknown／mismatchedでも非実行結果を返せる。[同bindingの開発試験](../tests/review/development-release-no-request.test.ts)はrelease消費後もbootstrap.release_match=not_evaluatedを保つ。これらの値保証と元prepared受理／拒否・実Permit結合を別に集計する。

ACK-15は空resultと有効設定の1正対照である。「only」という旧titleだけから、空白／不完全行・HTTP差分・失効設定等の全組合せが元caseで検証済みとはしない。通常sourceの既存C方式は維持し、閉鎖transcriptの200限定guardも緩めない。ACK-36のbind偽装拒否は[NS01](BEST_PRACTICE_RELEASE_AP01_NS01_BINDING_GUARANTEE_REVIEW.md)のmarkReady偽装拒否と別供給点の責務である。

## 5 取消・入力境界・HTTP差分の10行

| ID／旧case・入力variant | 元Pのassertion | 未代替残差と将来回復条件 |
|---|---|---|
| N2-X01／[ACK-23](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-23) pending親のdelay中取消 | reject cancelled、timer0・fresh run closed・timer0 | DB-36は部分対応。元parent待機・同期停止・実class回収を維持。予約解放から費目返金を推定しない |
| N2-X02／[ACK-24](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-24) pending releaseのdelay中取消 | 同じ拒否・timer／fresh cleanup | DB-37は部分対応。親受理後のrelease待機を独立位置として残し、受理前取消に集約しない |
| N2-X03／[ACK-30](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-30) 空transcript object | 同期throw invalid_input | DB-08は部分対応。同入口のpin前段拒否と同期／非同期の返却差を回復。元caseはC=0を直接assertしていない |
| N2-X04／[ACK-31](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-31) parent・release・releaseの3応答 | 同期throw invalid_input | 移行先なし・未対応。件数だけでなくpurpose順序・余剰releaseを同入力で拒否 |
| N2-X05／[ACK-32](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-32) dispatch=function追加 | 同期throw invalid_input | DB-13は部分対応。旧schema・callback非採用を維持。別rootの余剰field拒否を同入口保証へ換算しない |
| N2-X06／[ACK-33](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-33) parent responseへstatus=403追加 | 同期throw invalid_input | DB-06は部分対応。固定200 transcriptの入力拒否を維持し、後述dispatch後HTTP拒否と混同しない |
| N2-X07／[ACK-34](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-34) 推測construction key（object／undefined／null） | claimPrivateCompositionSource=false、creation付きsourceはinvalid_input・capture未呼出し、既存sessionはpayload1を計上可能 | 未対応。元private key／既存session採用不可と被害側不変を維持。入口撤去後の不在検査はAP02／03の意図的仕様変更で別承認 |
| N2-X08／[ACK-35](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-35) static verifierを成功関数へ置換 | creation付きsourceはinvalid_input、capture未呼出し | 未対応。置換したpublic staticを採用せず元private verifierを使う位置を回復。新friend／互換shimで保証を再導入しない |
| N2-X09／[ACKB-01](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ackb-01) 親のstructuredClone時にelapsed=50000 | [境界試験](../tests/review/private-composition-boundary.test.ts)はreject phase_deadline_exceeded | DB-03は関連参照で未対応。待機timeoutではなく親受理後guardが上げる非停止phase cutoffの理由を保持。旧caseがrun停止なしを全診断で直接assertしたとはしない |
| N2-X10／[ACKB-02](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ackb-02) release JSON={}・dispatch完了後、同bodyを使うResponseのstatusを403へ置換 | 同境界試験はreject invalid_response。bodyなしResponseを渡す対照ではない | DB-06のstatus入力事前拒否と別で未対応。sessionのresolveRelease継続の先頭で非200を拒否し、source consumer.releaseの観測／C方式へ渡さない元位置を回復 |

全39行は旧assertionを保存する責務の対応であって、全retry・typed cleanup・一度ackの故障matrixを網羅した表ではない。retry回数・故障位置・同attempt・lease・費目の上界は既存契約と別の対照へ残し、正常な1応答列の成功だけで回復済みとしない。

## 6 個別承認前の確認順と将来回復条件

1. 通常sourceのPermit・C方式・private snapshot・取消／closeの正負対照と、非提供transcriptの連続性を分離する。通常KP01〜05の保証低下をNS02の延期へ紛れ込ませない。
2. N2-R11の実bindとN2-E06／07の供給点を確認し、public hook成功・公開matched・Permit形JSON・別Dのsummaryからの昇格を拒否する。N2-R01〜06／08〜10の元rejectとDの値結果を対応付け、差を受容するかは別承認へ残す。
3. N2-A01／03／04／13を基点に、同snapshot→mode→課金したbody→typed終端／ack→source ackの所有と同内容性を確認する。総量だけでなく内容差替え・foreign／copy／重複・用途混入・失敗後再採用の独立対照が必要である。
4. 失敗時のC/G/P・予約・retry・先行理由・診断とcleanup責務を実供給点へ対応付ける。元Pが直接assertしていない費目や完全回収は未確認のままにし、Unknownをfresh run成功やsummaryで消さない。
5. 元revision／旧ID・fullName／入力variant／注入位置／旧assertion・artifact、新実装・新case／artifact、共有部分・残差、独立oracle・負対照、実行結果と終了／cleanup確認を揃える。回復しない保証を受容するなら非提供範囲・責務先・将来条件を個別承認へ渡す。承認できなければ回復先行またはリリース停止であり、旧caseを黙って削除しない。

[NS03](BEST_PRACTICE_RELEASE_AP01_NS03_CONSUMPTION_REVOCATION_GUARANTEE_REVIEW.md)の消費・失効・closeはstatus用の別consumerであり、その取消対照をACK経路の消費や返却gapへ流用しない。元UTC／projectionと上位時刻handoffはNS04〜06へ残し、NS02の表が揃っただけで一括承認しない。

## 7 compiled・配布境界と未承認事項

現行[compiled private ack](../tests/review/fixtures/compiled-private-composition-ack.mjs)はper-user・Australiaの基本prepared／同byte合計・closed／reserved0・非公開handleを確認するが、cached／exchange・6つの不許可観測・C方式・bind hook偽装・post-dispatch非200等の全39行を実行するfixtureではない。過去のpack成功やscriptの存在からcompiled移行済みとしない。

[B-03](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)の本番／開発別artifact・source fallbackなし・同一process非干渉、通常依存を欠落させない正対照とfake閉包不在の負対照、実tarball検査を別gateへ残す。保証回復のための新しい公開writer・汎用installer・診断昇格口・fixture台帳共有を追加しない。

AP01の保証低下受容、AP02のfriend撤去、AP03のsynthetic overload／同期返却互換変更、AP04のreject／unknown／withheld差、AP05の試験切替・build変更、AP06の版・公開は未承認のままである。元5秒・既定並列度、旧比較childの60秒、製品全体60秒を区別し、実認証／実通信の確認も別承認・未実施とする。

## 8 今回の静的確認

元private ack／境界試験、正規移行台帳、session／bootstrap／body／source／lifecycleとcompiled fixtureを静的に読取り、ACK37行＋ACKB2行を対応付けた。新しい試験実行・同等性分類は追加していない。

2026-11-18の静的確認：本書とAP01親文書の2MDについて表7・ローカルlink73・明示anchor45、N2設計ID47（E8／A18／R11／X10）、ACK-01〜37／ACKB-01〜02の39行に重複・欠落がないことを確認した。この引用範囲の旧分類は部分対応23／未対応16のままで、移行済み数・試験成功数へ換算しない。元caller bytes改変・bind hook偽装・親受理後phase cutoff／dispatch後403の本文と、既存compiledの限定範囲も照合した。末尾改行・差分空白・AP01〜06の未承認欄維持を確認し、tracked差分はAP01親MD1件、新規は本書1MD、stage0、製品・試験・設定の変更0だった。製品moduleのimport／実行、試験再実行、build／packは行っていない。これは文書の静的整合で、保証回復・保証低下受容・撤去・公開可の証拠ではない。

### コミット前レビュー（2026-11-19）

旧test・bootstrapのprepared検査、sourceのlegacy判断／Permit生成、現行compiled fixtureを再照合した。N2-X10を、bodyなしではなくJSON={}を持つResponseのstatus403置換と明確化し、拒否位置をsessionのresolveRelease継続の先頭・source consumer.releaseの前と記した。旧code期待値・case分類・公開方針と各未承認事項は変更しない。製品・試験・設定を編集せず、試験再実行・build／packは行わない。

再確認でも39旧台帳行の重複・欠落0、既存分類23／16、N2-ID47、2MDの表7・ローカルlink73・明示anchor45、差分空白・末尾改行とAP01〜06の未承認欄維持を確認した。修正対象は本書とAP01親文書だけで、他のsource・試験・設定変更は含めない。
