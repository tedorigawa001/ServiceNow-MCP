# AP01：限定リリースの非提供範囲・未代替保証と将来の回復条件

Version: release-ap01-limited-scope-draft-0.10 / Date: 2026-11-19。
Status: **限定リリース案を公開方針として採用。AP01の保証低下・旧試験の処遇は未承認で、公開可の判定ではない。** 読取り基準HEADは`76fa545`。今回のユーザー指示を公開方針の決定根拠とし、個別承認の代行や将来の撤去許可へ広げない。

正式発行口閉鎖・全体受付無効・通常経路未切替・C実行入口／body起動閉鎖・Unknown・VM／監視／telemetry調査保留を維持する。LOAD6／LOAD7選択も未承認のまま。今回はMDと親文書の参照整理だけであり、保証低下・旧試験削除／skip／期待値弱化・friend撤去・実装・発行／claim消費・負荷採取・試験再実行・build／pack・実接続・実通信・実機操作・設定変更・版変更・公開・コミット・Pushは行わない。

## 1 決定した方針と未承認事項

公開方針は「既存の通常本番経路の保証を維持し、開発中の閉鎖laneは本番提供対象へ加えない限定リリース」とする。[保証回復レビュー](BEST_PRACTICE_RELEASE_GUARANTEE_RECOVERY_SCOPE_REVIEW.md)RV06〜11の延期候補を、以下の非提供範囲と回復責務へ具体化する。日付・版・配布物・リリース候補commitは未確定である。

非提供とは、候補リリースで機能や本番保証を約束しないという公開範囲の方針である。現在のsourceに当該入口が存在しない、既に撤去済み、安全性確認済みという実績ではない。未代替保証とは、旧試験の同条件を移行先で回復した証拠が不足している状態であり、旧経路が現在壊れているという意味ではない。旧試験を残している現在から、将来の削除後も同保証があるとは推定しない。

公開方針の採用は、未代替保証を失ってよいという承認ではない。許容できない残差があれば、通常経路の保証を維持したまま回復を先行するか、候補リリースを止めて再審査する。既存friendを残したまま配布してよいという例外も作らない。

| 区分 | 現在の決定／状態 | この文書から導かない権限 |
|---|---|---|
| 公開方針 | 既存通常経路に限定する方針を採用 | 公開可・リリース日・版番号の確定 |
| AP01 | 非提供範囲・未代替保証・回復条件を文書化。保証低下の受容は未承認 | 旧実class保証の放棄、case削除／skip／期待値変更 |
| AP02 | friend・登録slot・fake orchestrationの撤去は未承認 | 別名・shim・隠し取得口による温存も承認しない |
| AP03 | synthetic overload削除と同期／非同期の互換変更は未承認 | 入力schema・返却形状・公開fetch注入境界の変更 |
| AP04 | reject／unknown／withheldの差の扱いは未承認 | draft成功をPermit・review開始・正式証拠へ昇格 |
| AP05 | 旧case／fixture切替・専用artifactの採用は未承認 | 旧試験を新しい成功件数だけで置換 |
| AP06 | 版・最終検証・公開審査は未承認 | 設定変更・配布・公開・Push |

AP01〜06は従来の識別子をそのまま使う。公開方針だけを新たに採用済みと記録し、AP01のチェック欄を完了承認へ変えない。

## 2 限定リリースでも維持する通常経路

以下は将来のリリース前に守る条件であり、今回の再試験成功を表さない。[通常経路の根拠](BEST_PRACTICE_RELEASE_GUARANTEE_RECOVERY_SCOPE_REVIEW.md)EV01〜05／RV01〜05を引き継ぐ。

| ID | 維持対象 | 非提供範囲と混同しない境界 |
|---|---|---|
| KP01 | 通常client／sessionの認証snapshot・startedAt・全deadline・canonical会計・final予約・停止／admission | 開発assemblyへの時刻・auth指定で実class保証を代替せず、第二の予算・枠・起点を作らない |
| KP02 | 通常sourceの同session／ReleasePermit・不変release snapshotと混入／再利用拒否 | 閉鎖status laneの非提供を理由に既存Permitを撤去・再定義しない |
| KP03 | 既存release判断・既存C方式と、その設定・binding・寿命・失敗条件 | 新status用fallbackの有効化ではない。合成200限定guardを通常source全体へ適用しない |
| KP04 | 通常source→worker→既存出力契約（0.2／0.3を含む）・取消／終了・本文非露出 | 新worker job／時刻ownerへのbindingを提供しなくても、通常workerや他の既存出力契約を弱めない |
| KP05 | factory・部分rollback・first reason・run／construction診断分離、省略時compositionのC=0／予約返却／close | fake branchと共通する生成・closeを一括削除しない。通常の既存fetch注入と省略時の閉鎖契約を維持 |

静的には[client](../src/servicenow/client.ts)がsessionを生成し、[adapter](../src/review/update-set-adapter.ts)が通常sourceのreadParent→resolveReleaseを呼ぶ。[session](../src/servicenow/bounded-read.ts)のsynthetic overloadや旧NDのmodule評価時friend取得は別途残っている。この名前・構文の確認だけで配布物の全依存閉包・動的到達性・外部利用者不在を証明しない。

## 3 AP01の非提供範囲と回復責務

正規case参照は[case別移行台帳](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md)にある旧fullName・入力・故障位置とする。次の6群は責務の区分でありcase数ではない。同じcaseが複数群の同一性・失効・診断を確認する場合も、成功数へ重複加算しない。「部分対応／未対応」の既存分類や母集団を今回更新しない。

| ID／対応RV | 今回の本番提供対象へ加えないもの | 未代替保証・正規caseの例 | 将来その範囲を提供する前の回復条件 |
|---|---|---|---|
| NS01／RV06 | 閉鎖status／native laneを同実session／sourceへ正式結合する機能 | SA／SAB、ND／NDBの同constructor・登録ready世代・同core／source。特に[SAB-08](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-08)・[NDB-08](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ndb-08)の偽ready成功と実登録世代の不一致は、Dのduplicate ready拒否と別 | 固定本番生成境界で認証snapshot・ready世代・同owner／core／source／leaseを私有参照に結合。別owner・同値copy・偽ready／bind hookを同位置で拒否し、元classのassertionと診断を保持。新friendを保証回復口にしない |
| NS02／RV07 | fake200のprivate ackからlegacy判断→preparedまでの新しい連続経路の本番採用 | ACK-01〜33／37、ACKBの同bytes課金・private ack・実source準備／Permit連結。入口取得に関するACK-34〜36はAP02／03の境界責務として分離 | 認証→親→release→ackの同bytes・同canonical会計を固定し、既存release判断／Permitを同sourceに結合。初回／最終予約・retry・取消と失敗解放も元位置で確認。純粋matchedやDのsummaryだけでprepared受理を代替しない |
| NS03／RV08 | 閉鎖status／nativeの一度消費・draft採用と外側closeまでの新しい本番経路 | [SAB-09〜11](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-09)、[NDB-04〜07](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ndb-04)。draft後失効、private return→外側close間取消、元floor再確認、HTTP／cleanup／上位理由の連続保持 | issuer→唯一consumer→pre/post guard→private return→外側closeの各境界で同期失効と一度消費を確認。正常cleanupとrun失効を分離し、返却前候補の破棄・元floor・上位診断を保持。confirmedでない解放はUnknownのまま |
| NS04／RV09 | 実session projectionの新しい全入力化・元pin照合経路の本番採用 | SP01〜24の実field・同session・元startedAt／全L／pin済みpolicy。Dのcontext値比較では元実fieldの照合を代替しない。[SP25](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp25)は通常経路維持で、非提供・削除候補へ含めない | 同sessionの既存deadlineMs getter・startedAt・pin済みpolicyからreadonly projectionを供給。残時間から全deadlineを再計算せず、別session・同値copy・停止時取得を拒否。通常sourceの判断・getter呼出し契約も別に維持 |
| NS05／RV10 | 新しい同body bytes／観測UTC receipt・比較候補受理の本番接続 | OU01〜16、CR01〜03／05のguard後一度UTC、空200の内部O保持、clock throw／逆行・取消・元S／L不変。CR04の推測key拒否はAP02／03と連結するが、削除で同等移行済みにはしない | 同source／projectionの同bytesを課金・解析し、取得後guardの後でUTCを一度だけ採取。空200でもOを保持し、時計例外／逆行／失効で再採取せず停止。receiptの一度消費と公開shape・秘密非出力を元位置で検査。Oを事前入力する試験だけでは回復しない |
| NS06／RV11 | 同acceptedから上位時刻owner／worker jobへ移譲する新しい本番経路 | [TH01〜06](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#th01)の元accepted→TimeHandoff→sourceClosed／discardと全post-O故障sweep。元caller rejectとDのunknown／withheldは非同等 | 同receipt／source／run／budgetとworker input／jobの一度claimを結合し、O・T_i／保持U・Eを元起点／全deadlineと整合させる。handoff・source close・discardを跨ぐ同期／queued取消を全元位置で確認し、cleanup所有と上位診断を残す |

NS01〜06は新しい正式発行口を開ける計画の承認ではない。選択window／payload receipt／worker jobの正式binding（旧整理のPC-05）は元の旧caseでも完了していないため、今回の非提供方針で完成済み・保証免除済みにはしない。将来この範囲を追加する際は、入力同一性・単一予算・停止・cleanup・結果の一度受理まで別の受入条件を定める。

旧ND単体のissuer／consumer・注入reader cleanup／provenance／seal（RV12、UN62）は、NS01〜06を非提供にしただけで放棄しない。[B-03](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)の同入力・同故障位置の移行責務として残す。台帳を共有したり、DとUの別cleanup実装の成功を同一実装の保証に数えたりしない。

## 4 将来の回復を判定する記録と境界

各未代替caseの回復記録には、元revision／fullName／入力variant／故障位置・旧assertion・元artifact、新しい実装参照／同一性境界／新case・artifact、共有する部分、残差、独立oracleと負の対照、実行結果と終了／cleanup確認を記載する。未実施は未実施とし、固定summary一致をprivate同一性や権限の証明にしない。

本番classをfake I/Oで確認するP、独立開発assemblyのD、無bridge注入単体のUは別保証である。Dの成功からPの同session bindingを回復したとは判定しない。Pの2枠・principal・会計・先行理由へD／Uが干渉しない同一process対照も、別processの成功だけで置き換えない。

後続の回復判定は次を全て満たすまで閉じる。

1. 対象NS群と元caseが明示され、同一性・同bytes・元起点／全deadline・予約・費目所有を実際の供給点へ対応付ける。
2. 正常・throw・取消・期限等号・再入・重複・foreign／copy・部分生成を同故障位置で確認し、最初の理由と未確認責務を保持する。必要な元sweepを単一faultへ縮めない。
3. 失敗後の再利用・診断／draftからの権限回復・cleanup未確認からの昇格を拒否する。未解決custodyや実backing容量を黙ってconfirmedへ変えない。
4. 旧試験を残したままsourceとcompiledの独立対照を併存させ、専用artifact・実tarball・通常経路の正対照と禁止依存の負の対照を揃える。import不能なだけでは不在成功にしない。
5. 残差と互換影響を再レビューし、該当APの個別承認と正式binding／提供開始の別承認を得る。実認証／実通信の確認を要する範囲は別承認・未実施として明示し、fake成功で実provenanceを主張しない。

実行期限は緩めない。通常並列3件の元5秒・既定並列度、旧比較childの60秒、製品全体60秒を分ける。LOAD6／LOAD7選択・採取／保管／process操作の未承認事項を、公開方針の採用から実施承認へ読み替えない。

## 5 今回の保持責務と次の承認点

現在は旧試験・期待値・friend・sourceの実体を保持する。scopeの選択だけで失われた保証はなく、移行・撤去後に失われ得る保証をNS表へ可視化した段階である。配布境界も未完成のままであり、現状のまま公開可能とはしない。

次の承認対象は、NSごとの未代替assertionと残差を確認した上で「どの保証低下を、どの非提供範囲と将来回復条件の下で受容するか」である。現時点ではその受容は一件も承認済みにしない。受容しない残差には回復責務を残し、保証を消すためのcase統合や件数換算を行わない。

AP01が将来個別承認されても、AP02の撤去、AP03の入力／返却互換変更、AP05の試験切替とbuild変更、AP06の公開を自動開始しない。通常経路の保証・B-03／梱包境界・通常並列timeout・最終審査は引き続き独立した公開前条件である。

## 6 今回の静的確認範囲

既存のRV06〜11・GT04〜07／AD01〜04・正規case台帳を参照し、公開方針の採用と個別保証低下の未承認を分離した。client／adapterの通常生成と、sessionのsynthetic overload・旧NDのmodule評価時friend取得はsourceの静的読取りで確認しただけである。旧caseの同等性分類・成功数・実行結果は更新していない。

2026-11-18の静的確認：本書と親2文書の計3MDについて、表11・ローカルlink83・本書からの明示case anchor6、KP5群・NS6群とRV06〜11の一対一対応、AP01〜06の未承認欄維持、末尾改行・差分空白を確認した。tracked差分は親2MD、新規は本書1MD、stage0で、製品・試験・設定の変更は0。製品moduleの実行・試験再実行・build／packは行っていない。これは方針・参照の静的整合であり、移行完了・保証回復・撤去済み・公開可の証拠ではない。

## 7 NS01の個別レビュー（draft-0.2）

[同constructor・core・登録ready世代と偽ready拒否の保証レビューdraft-0.2](BEST_PRACTICE_RELEASE_AP01_NS01_BINDING_GUARANTEE_REVIEW.md)で、NS01の主要6旧caseと隣接8旧caseを、元assertion・Dの候補・未代替の残差・将来回復条件へ対応付けた。SAB-08の最終rejectとNDB-08のrequest／native操作0の差、DS-07のduplicate readyとの非同等性、same_core／same_sourceの診断projectionと私有実参照の違いを整理する。§6は初稿作成時の履歴で、今回の変更は本追記と別紙MDだけ。保証低下・旧試験削除・friend撤去・設定変更・公開は未承認のままで、新しい試験結果・回復完了・公開可の実績は追加しない。

## 8 NS03の個別レビュー（draft-0.3）

[一度限り消費・draft後失効・return／close取消と診断保持の保証レビューdraft-0.4](BEST_PRACTICE_RELEASE_AP01_NS03_CONSUMPTION_REVOCATION_GUARANTEE_REVIEW.md)で、主要12旧caseと診断／cleanupの隣接6旧caseを、旧assertion・注入位置・残差・将来回復条件へ対応付けた。同期consumerの返却と非同期probeの復帰、freeze spyの形状条件と特定post位置、session受領数とnative最終消費数、cleanup／construction診断を分離する。編集は本追記・版更新と別紙MDのみで、NS01の旧レビューとcase分類・実行結果は維持。保証低下・旧試験削除・friend撤去・設定変更・公開は未承認、各閉鎖条件・Unknown・調査保留を維持する。

## 9 NS02の個別レビュー（draft-0.4）

[同bytes課金・private ack・legacy release判断とPermit結合の保証レビューdraft-0.1](BEST_PRACTICE_RELEASE_AP01_NS02_ACK_RELEASE_GUARANTEE_REVIEW.md)に、ACK-01〜37／ACKB-01〜02の39台帳行を対応付けた。通常Permitの維持と閉鎖laneの未代替連続性、総byte数と同内容性、実snapshot由来authとDの指定値、値matchedと実source／Permit／port・owner binding、入力status拒否とdispatch後非200拒否を分ける。編集は本追記・版更新と別紙MDのみで、旧分類・試験結果とNS01／03のレビューは維持。保証低下・旧試験削除・friend撤去・設定変更・公開は未承認、各閉鎖条件・Unknown・調査保留も維持する。

## 10 NS04の個別レビュー（draft-0.5）

[同sessionのstartedAt・全deadline・pin済みpolicyと実field照合の保証レビューdraft-0.1](BEST_PRACTICE_RELEASE_AP01_NS04_SESSION_PROJECTION_GUARANTEE_REVIEW.md)にSP01〜25の台帳variantを対応付けた。全duration Lと残時間、開始UTC Sとmonotonic起点、元policy参照と同値copy、getter副作用後／pending消費時の現在field再照合、設定expiry等号と実測時limitationsを分ける。SP25は通常source維持で非提供・削除候補へ含めない。編集は本追記・版／日付更新と別紙MDだけで、旧分類・実行結果は維持。保証低下・旧試験削除・friend撤去・設定変更・公開は未承認、各閉鎖条件・Unknown・調査保留も維持する。

## 11 NS05の個別レビュー（draft-0.6）

[観測UTCの一度限り採取・空200保持と比較候補の時刻整合の保証レビューdraft-0.1](BEST_PRACTICE_RELEASE_AP01_NS05_OBSERVATION_COMPARISON_GUARANTEE_REVIEW.md)にOU01〜16／CR01〜05の21台帳variantを対応付けた。開始UTCとOのISO総数、取得後採取と事前入力、空Oの内部保持と公開field不在、値ownerの直接assertと元classの接続、legacy拒否と非実行unknown候補を分ける。CR04はAP02／03の入口責務、上位移譲・worker時刻はNS06の別責務へ残す。編集は本追記・版更新と別紙MDだけで、旧分類・試験結果とNS01〜04のレビューは維持。保証低下・旧試験削除・friend撤去・設定変更・公開は未承認、各閉鎖条件・Unknown・調査保留も維持する。

## 12 NS06の個別レビュー（draft-0.7）

[同acceptedの上位時刻移譲・sourceClosed／discardとpost-O取消の保証レビューdraft-0.1](BEST_PRACTICE_RELEASE_AP01_NS06_TIME_HANDOFF_GUARANTEE_REVIEW.md)にTH01〜06の6台帳variantを対応付けた。同acceptedの一度消費、正常source解放とrun失効、選択3点のsync／queued取消と全post-O同期sweep、固定discard・私有診断を分ける。finally全解放sectionの継続はrollback救済と区別した未確認責務として残し、合成worker issuerの値保証を実session／job・実終了への接続と数えない。編集は本追記・版更新と別紙MDだけで、旧分類・試験結果とNS01〜05のレビューは維持。保証低下・旧試験削除・friend撤去・設定変更・公開は未承認、各閉鎖条件・Unknown・調査保留も維持する。

## 13 個別承認用の残差台帳（draft-0.8）

[未レビュー／重複・通常維持・個別残差台帳draft-0.3](BEST_PRACTICE_RELEASE_AP01_INDIVIDUAL_APPROVAL_RESIDUAL_LEDGER.md)の初稿で、正規228行と6レビューの延べ123行・重複除外119旧caseを文書上で照合した。閉鎖lane候補158行の専用行なし44、入口7行の専用行なし3、通常維持SP25、別gateのUN62を分離し、全caseレビュー完了・移行率にはしない。draft-0.2でSA-02〜04を追加専用行に個別照合し、その時点の文書対応122・閉鎖lane残未レビュー41を記録した。draft-0.3でSA-06〜08のff／完全親のforeign sys_id／余剰scriptを追加し、6レビュー基準は変えず追加6・現文書対応125・閉鎖lane残未レビュー38を別集計する。元3variantの直接assertはinvalid_response拒否と別freshのcleanup=closedで、元失敗runのcleanup完了・診断保持・status操作0を実測した扱いにはしない。拒否位置の静的根拠と、別Dの会計／非露出assert・既存compiled fixtureの未収録variantを分ける。以前の403/404 no_body返値5項目・実prototype4method非再入のレビューも保持。重複4旧case・KP01〜05・処遇未選択／未承認は維持。保証低下・旧試験削除・friend撤去・設定変更・公開は未承認、各閉鎖条件・Unknown・調査保留を維持し、編集はMDだけで実装・Pushは行わない。
