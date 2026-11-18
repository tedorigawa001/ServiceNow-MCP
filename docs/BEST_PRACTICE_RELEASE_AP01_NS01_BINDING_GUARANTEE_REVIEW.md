# AP01 NS01：同constructor・core・登録ready世代と偽ready拒否の保証レビュー

Version: release-ap01-ns01-binding-guarantee-draft-0.1 / Date: 2026-11-18。
Status: **MDによる承認前整理。限定リリースの公開方針だけ採用済みで、NS01の保証低下は未承認。** 基準HEADは`00319b1`。[AP01詳細](BEST_PRACTICE_RELEASE_AP01_LIMITED_SCOPE_DESIGN.md)NS01／RV06を、旧case・残差・将来回復条件へ対応付ける。今回は新しい実行結果・移行同等性判定を追加しない。

正式発行口閉鎖・全体受付無効・C実行入口／body起動閉鎖・通常経路未切替・Unknown・VM／監視／telemetry調査保留を維持する。保証低下・旧試験削除／skip／期待値弱化・friend撤去・設定変更・公開は未承認。実装・発行／claim消費・試験再実行・build／pack・負荷採取・実接続・実通信・実機操作・コミット・Pushは行わない。LOAD6／LOAD7選択や元の各期限・既定並列度も変更しない。

## 1 対象と判定の限界

NS01の非提供方針は、閉鎖status／native laneを実session／sourceへ正式bindingして提供しないという範囲である。既存通常sourceのReleasePermit・C方式・認証・workerを非提供へ追加するものではない。通常経路の維持条件はAP01のKP01〜05を引き継ぐ。

本書でいう同constructorは、同じclass関数名やinstanceofではなく、そのrunのprivate構築継続・transport handle・登録ownerに属することをいう。同coreは同じcanonical会計実体への結合であり、同じbudget数値という意味ではない。登録ready世代は同じ登録owner内のready成立に由来し、別runでも返せる数値1やhookのtrueだけでは代替しない。

P＝実classをfake I/Oで使う旧case、D＝独立開発assembly、U＝無bridge注入単体という区別を維持する。いずれの合成成功も実認証・実通信・正式証拠のprovenanceを証明しない。「部分対応／未対応」は[正規移行台帳](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md)の既存静的分類を引用し、新しい失敗判定・coverage率へ変換しない。旧経路が現在壊れているという指摘でもない。

以下はNS01に直接関係する主要6caseと、消費・close・構築失敗にまたがる隣接8caseのレビューである。SA／SAB／ND／NDBの全caseを再照合した表ではない。NS03の取消gap・元floor、NS02のrelease binding等は責務を引き継ぎ、対象外にしたので保証不要とはしない。

## 2 現行sourceで確認する結合点

下表はsource本文の静的読取りであり、現HEADでの実行成功・完全到達性の証明ではない。

| ID | 現行の生成・検査点 | 根拠と、その値だけでは証明できないもの |
|---|---|---|
| EV01 | [registerReviewEvidenceSession](../src/servicenow/review-evidence-lifecycle.ts) | sessionの二重登録を拒否し、同closureにsnapshot／lease・readyStarted・ready・generationを保持する。owner返値の形状が同じことだけで別sessionへ採用できるとはしない |
| EV02 | 同moduleのmarkReady／claimStatusBinding.inspect | 正規markReadyがcheck後にreadyを生成しgeneration=1へ進む。status用inspectは同handle／snapshot／lease／sourceと継続状態を確認して内部generationを返す。markReadyの戻りtrueを登録完了と同一視しない |
| EV03 | [sessionの#openComposition](../src/servicenow/bounded-read.ts) | source生成→transport claim→initial source binding→status binding→同coreのbootstrap会計接続→construction bindingの順。通常source生成と共有するため、fake laneと一括削除しない |
| EV04 | 同sessionのstatus receipt／takeStatus | private terminalにsource／snapshot／lease／core／attempt／windowを保持し、消費時に実参照とinspectのgenerationを確認する。公開summary copyやDのproofは元terminalではない |
| EV05 | 同sessionのnative checked／診断projection | native分岐はmarkReadyの後・parent dispatchの前にもcheckedを呼ぶ。same_core／same_sourceはともにprogress.boundから作る診断値で、独立した2個の実参照証拠ではない。下位のEV03／04の検査と組み合わせて読む |

EV02のstatus用検査と、通常release用のbindSource／inspectSourceが持つready参照照合は区別する。通常Permitの正対照を、そのまま閉鎖status laneの登録世代保証へ読み替えない。新しいlookup・公開getter・writer・成功申告APIを保証回復のために追加する案ではない。

## 3 最優先の主要6case：旧assertion・残差・回復条件

表順は承認前レビューの推奨順で、実行順・実装承認・case削除順ではない。旧case ID／fullNameは正規台帳を参照し、元test本文で追加確認したassertionだけを記す。

| ID／旧case・fullName | 元Pの検査と保持する期待値 | Dの候補・未代替の残差 | 将来の回復条件 |
|---|---|---|---|
| RG01／[SAB-08](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-08) `does not trust a successful-looking ready hook without the registered ready generation` | [status境界試験](../tests/review/source-status-binding-boundary.test.ts)は実registerの返値を基にmarkReadyだけを`()=>true`へ置換し、probeのreject code=internal_review_errorを要求 | [DS-07](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-ds-07)は二度目ready拒否。登録を進めない「初回hook成功偽装」とは別で、分類は未対応。元SAB-08はC=0や拒否位置まではassertしていない | 同ownerの登録世代が未成立ならhookがtrueでも受理しない。同じ故障注入位置・元rejectを維持し、どの検査で拒否したかは別の固定対照で確認。元caseが既にC=0を保証したとは主張しない |
| RG02／[NDB-08](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ndb-08) `does not trust a successful-looking ready callback without the same registered generation` | [native境界試験](../tests/review/native-session-boundary.test.ts)もmarkReadyだけをtrueへ置換。code=internal_review_error、budget.requests=0、get_reader／closed／cancel／release_lock／read全0を要求 | DS-07は同登録ownerの未更新generationやnative取得前停止を検査しないため未対応。SAB-08のrejectだけでもNDB-08のC=0／native0を代替できない | 正規readyの正対照と、実登録世代を進めない対照を対にする。native分岐の同checked位置でparent dispatch・reader取得より前に停止し、元診断と操作数0を保持 |
| RG03／[SA-01](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-01) `binds the real source and session continuation before close, without a permit or fallback` | [status結合試験](../tests/review/source-status-binding.test.ts)はaccepted_before_close=true、consumptions=1、ready_generation=1、cleanup=closed／reserved=0、requests=2、fallback／正式発行disabled・Permit unavailableと秘密非出力を要求 | [DN-01](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-01)／[DS-32](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-ds-32)は独立sourceでの類似受理。分類は部分対応で、元session・登録lease・実consumerの結合は未代替 | 正規構築から同snapshot／lease／source／core／attemptへ結合し、一度消費・close前受理を元位置で確認。同じsummaryやready_generation=1だけをoracleにしない |
| RG04／[ND-02](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-02) `connects native cleanup and the sole consumer to a fresh real-class session/source before close` | [native結合試験](../tests/review/native-session-composition.test.ts)はsame_core／same_source=true、issued=consumed=1、close前受理・上位seal、requests=2、stream unlock・公開GET／resolveRelease非呼出しを要求 | DN-01の同reader→独立source受理は部分対応。旧ND診断owner／cleanup実装は別で、診断boolean一致は元実参照・同ownerの代替ではない | EV03／04の結合と同reader cleanup→唯一consumer→旧上位診断の連続性を確認。booleanを別々のprivate証拠として数えず、非同一実体を同位置で拒否する負対照も揃える |
| RG05／[SAB-01](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-01) `refuses a terminal from another closed constructor without changing its history` | status境界試験は最初のprobeのterminalを次のrunへ混入。後着runの外部rejectはinternal_review_error、内部理由はevidence_binding_mismatch、元結果不変、元consumerのclose後呼出し拒否 | [DN-16](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-16)／[DS-10](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-ds-10)は別brandのforeign拒否で部分対応。閉鎖済み実constructorの履歴とconsumerを同条件で保持した保証は未代替 | 同じ入力値・世代数でも別constructor／terminalを拒否。先行ownerの履歴を変更せず、自runの内部／外部理由の写像とclose済みconsumerの拒否を保持 |
| RG06／[NDB-01](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ndb-01) `rejects a terminal from a different closed source/core without changing its diagnostic history` | native境界試験は別の閉鎖済みsource／coreのterminalを混入。後着ok=false・内部evidence_binding_mismatch、native consumed=0、cleanup confirmed、先行結果不変・先行consumer closedを要求 | DN-16／[DN-19](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-19)はforeign／closed proofの部分対応。元実core／source・旧ND上位診断の組合せは未代替 | 同core・同source・同attemptを元private消費境界で照合し、foreign側を失効・再消費しない。自runの失敗と先行runの封印履歴・cleanup事実を分離して保持 |

偽readyは「正規readyを一度成立させた後、二度目を拒否」とは独立した故障である。Pの旧fake_readyは本物のregisterを呼んだ上で返却ownerのmarkReadyだけを置換しており、「登録関数自体を呼ばない」入力ではない。この差を消してDの世代1／invalid_stateと一致しただけで回復済みにしない。

RG01／02の元assertionは拒否理由・効果数の異なる強さを持つ。将来、SAB側にも取得前停止を追加保証したい場合は新しい受入条件・故障位置として別記し、旧caseの実績や期限を遡及変更しない。

## 4 隣接8case：同一性保証と消費・失敗保持の接点

次のcaseをNS01の主要6件へ統合・吸収して削除しない。NS03の一度消費／close、AP02／03の入口変更、B-03の実行artifact移行へ残差を渡す。

| ID／旧case・正規fullName | 元assertionと未代替の残差 | 将来回復時に対で残す条件 |
|---|---|---|
| AD01／[SAB-02](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-02) `refuses copy consumption before returning any accepted summary` | 外部reject internal_review_error・内部evidence_binding_mismatchと後続fresh runの一度消費。DN-15のproof copy拒否は部分対応で、実source draft公開は未代替 | 同値terminal copyは私有identityを持たない。元内部／外部写像と未公開のまま停止することを確認 |
| AD02／[NDB-02](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ndb-02) `rejects copy at the actual source boundary and retains both diagnostic layers` | code=internal_review_error・内部evidence_binding_mismatch、native consumed=0・draft=null。DN-15の別proofでは旧二層診断の伝播が未代替 | actual source boundaryでのcopy拒否と旧上位診断を維持。結果のJSON同値を採用資格にしない |
| AD03／[SAB-03](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-03) `refuses duplicate consumption before returning any accepted summary` | 外部reject internal_review_error・内部invalid_state。DN-19は部分対応で、二度目呼出し後の旧未公開draft／失敗写像は未代替 | 同terminalの二度目でrunを失敗させ、先行受理を公開成功へ補正しない。fresh別runの成功と失敗run再利用を区別 |
| AD04／[NDB-03](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ndb-03) `rejects duplicate at the actual source boundary and retains both diagnostic layers` | 内部invalid_state、native consumed=0・draft=null。DN-19の一度消費だけでは同じ旧publish取消条件・countを代替しない | sourceの一度claimとnative側の受理countを別に確認。数値だけを一致させるため、二段の失敗位置を移さない |
| AD05／[SAB-06](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-06) `cannot reuse the real source consumer after close or recover a permit from its draft` | close後consumer拒否、releasePortForからport取得不可、凍結結果・Permit unavailable。DN-19／DS-17では実consumer／Permit境界が未代替 | revoke／close後にtoken・draft・診断からsource consumerやPermitを復元できない。通常Permitの正規発行を変更しない |
| AD06／[NDB-07](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ndb-07) `rejects all source consumers after close and does not return source/core identity handles` | 実consumerのclose後拒否とbinding診断・秘密非出力。Dのclose後proof拒否は部分対応 | 同core／sourceのlive handleを公開せず、元consumerの寿命を閉じる。診断projection不変だけで私有参照の退役を証明したとしない |
| AD07／[SAB-07](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-07) `maps unexpected private-constructor failure to a fixed internal error and releases admission` | creation付き実source constructorでthrow、外部／内部internal_review_error、後続probeのcleanup closed。DRの部分生成faultは部分対応で同実constructor故障／解放は未代替 | ready／bindingが完成する前の失敗で先行診断とadmissionを保持・解放する。後続fresh成功を、個々の解放操作の直接確認へ過大評価しない |
| AD08／[ND-01](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-01) `retains the sealed construction failure before the native owner is created` | 初回clock throwでnative=null・consumptions=0・binding=false・requests=0、constructor診断closed／sealed／clock／teardown confirmed。DRのscalar不正値faultだけでは同copyを代替しない | owner／native未生成prefixと、生成後binding失敗を分ける。先行construction failure copyを固定回収し、未生成を「ready済み」へ補正しない |

AD05／06は元test本文の消費後拒否・出力検査を記したものであり、全private graphが解放された証明ではない。Unknownを診断値やfreezeの有無だけで消さない。

## 5 他群へ残す境界と承認前の確認順

ACK-36の「実source→owner bindの成功偽装」は偽readyに似ているが、release／Permitの別供給点である。NS02およびAP02／03の[正規case](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-36)へ残し、RG01／02の回復で一緒に完了としない。同様にSAB-09〜11／NDB-04〜06のdraft後失効・return gap・元floorはNS03の個別位置として残る。UN62の旧ND単体保証はB-03で別管理する。

個別承認前の推奨確認順は次の通り。

1. KP01〜05を維持したまま非提供laneを分けられるか、EV01〜05と通常sourceの共有生成・会計・closeを確認する。通常経路の保証低下をNS01の非提供へ紛れ込ませない。
2. RG01／02を独立した未対応として残し、正規ready成功と偽ready成功の故障位置・効果0の範囲を区別する。元Pの残すassertionと、新しく必要なものを分ける。
3. RG03〜06で同constructor／core／source／登録世代の供給点とforeign履歴不変を確認し、AD01〜08の消費・失敗・close責務へ渡す。Dの代替不能部分を列単位でレビューする。
4. 失う可能性のある旧assertion、非提供機能、残差の保持先、将来の回復条件を個別記録する。今回レビュー対象外のcaseや未実施試験を「問題なし」へ補完しない。
5. 保証低下を受容するかを別承認へ出す。受容しない残差は回復先行またはリリース停止にし、AP02〜06の撤去・互換変更・試験切替・公開を自動開始しない。

## 6 将来の回復を認めるための記録

元revision／旧case ID・fullName／入力variant／故障位置／期待assertionと診断層、新しい実装境界・case・artifact、共有部分／残差、独立oracle・負対照、実行結果と終了・cleanup確認を揃える。Pの保証をDの成功数へ換算せず、新旧の差は対応表に残す。

sourceの正対照だけでなく、source fallbackなしのcompiled対照が必要である。現行の[compiled SA](../tests/review/fixtures/compiled-source-status-binding.mjs)／[compiled ND](../tests/review/fixtures/compiled-native-session-composition.mjs)は旧入口と基本受理・一部異常を扱うが、RG01／02のmarkReady置換を実行するfixtureではない。これらが存在するだけで偽readyのcompiled保証済みとはしない。新しい専用artifact・同一process非干渉・梱包正／負対照は[B-03](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)の別gateへ残す。

将来の試験は元の期限・既定並列度を維持し、秘密・生token・内部handleを観測出力へ出さない。故障注入のための新friend・汎用installer・公開診断からの昇格口を追加しない。実認証／実通信を要するprovenance確認は別承認・未実施として区別する。

本書を埋めたこと、旧case本文にassertionが存在すること、Dで似た拒否理由が得られることは、NS01の保証低下受容・正式binding回復・公開可の根拠にはしない。NS01の保証低下、旧試験の処遇、friend撤去、設定変更・公開は全て未承認のままである。

## 7 今回の静的確認

正規移行台帳・旧test本文とEV01〜05のsourceを読取り、主要6case／隣接8caseの残差を対応付けた。これは選択した14caseの文書レビューで、全caseの網羅・新旧同等性や試験成功数ではない。

2026-11-18の静的確認：本書とAP01親文書の2MDについて表6・ローカルlink46・明示anchor27、設計ID19（EV5／RG6／AD8）、14旧caseのID・fullNameと正規台帳の一致を確認した。偽ready2件の旧未対応分類、markReady置換とNDB側のrequest／native操作0、DS-07のduplicate ready条件、既存compiled2fixtureに偽ready置換がないことも本文で照合した。末尾改行・差分空白・AP01〜06の未承認欄維持を確認し、tracked差分はAP01親MD1件、新規MDは本書だけ、stage0、製品・試験・設定の変更0だった。製品moduleのimport／実行、試験再実行、build／packは行っていない。保証回復・保証低下受容・撤去・公開を示す実績は追加しない。
