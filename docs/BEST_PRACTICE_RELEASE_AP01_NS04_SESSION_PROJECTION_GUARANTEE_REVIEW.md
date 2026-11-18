# AP01 NS04：同sessionのstartedAt・全deadline・pin済みpolicyと実field照合の保証レビュー

Version: release-ap01-ns04-session-projection-guarantee-draft-0.1 / Date: 2026-11-19。
Status: **MDによる個別承認前整理。限定リリースの公開方針だけ採用済みで、NS04の保証低下は未承認。** 基準HEADは`f9aeb67`。[AP01詳細](BEST_PRACTICE_RELEASE_AP01_LIMITED_SCOPE_DESIGN.md)NS04／RV09を、旧case・未代替残差・将来回復条件へ対応付ける。今回の試験成功・移行同等性判定を追加しない。

正式発行口閉鎖・全体受付無効・C実行入口／body起動閉鎖・通常経路未切替・Unknown・VM／監視／telemetry調査保留を維持する。保証低下・旧試験削除／skip／期待値弱化・friend撤去・設定変更・公開は未承認。実装・発行／claim消費・試験再実行・build／pack・負荷採取・実接続・実通信・実機操作・コミット・Pushは行わない。元期限・既定並列度とLOAD6／LOAD7選択未承認も維持する。

## 1 非提供範囲と固定値の意味

NS04は、実session projectionの新しい全入力化・元pin照合経路を本番へ採用しない範囲である。通常sessionの開始時刻・設定pin・canonical予算・通常source判断まで非提供／削除対象にしない。SP01〜24の閉鎖fake継続と、SP25の通常source維持を分ける。[旧case台帳](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md)の25variantを全て本書へ一度ずつ対応付けるが、これは現HEADのtest発見数・成功数・同等移行数ではない。

ここで「全deadline」は、既存deadlineMs getterが返す元runの全duration Lという一つの数値である。残時間、UTCの終了日時、複数phaseの期限一覧を意味しない。[既存getter再利用契約](BEST_PRACTICE_ABORT_SCOPE_RELEASE_DEADLINE_REUSE_DESIGN.md)に沿い、新getter・公開supplier・独立deadlineを追加しない。

| 記号 | 元の供給位置・意味 | 代替にしない値・権限 |
|---|---|---|
| S | 同sessionの構築時startedAt（開始UTC文字列） | 後の観測UTC・callerのstarted_at・別sessionの同値文字列から同session identityを推定しない |
| L | 同sessionのlimits.deadlineMsを返す既存getter。元全duration | remainingMsや取得時刻から再計算しない。getterの値一致だけでは生存・同sourceを証明しない |
| P | 同sessionのreleasePolicy。元S／Lでpinしたpolicyの同参照 | provider再呼出し・同値copy・別session policy・公開診断を採用しない |
| M | 元sessionのmonotonic開始。core／hard timer／remainingに使う | Sとの相互変換や、取得後の新しい起点にしない。SとMが同一時計であるとは主張しない |
| O | release取得後guardに続く観測UTC | NS05の別責務。S／L・policy有効期間を更新する入力には使わない |

設定expiryをE_cfgとすると、binding一致・日時整合済みの設定を元run全体に有効とするにはE_cfg > Date.parse(S)+Lが必要である。S < E_cfg <= S+Lはconfig_validity_insufficient、E_cfg <= Sはconfig_expiredで、等号を残時間やOで救済しない。この必要条件はassertionの有効性であって、実測releaseが得られる全経路を一律停止する規則ではない。

元classをfake I/Oで使う経路（旧台帳の区分P）と、独立開発assembly（D）は別保証である。本書では前者を「元class」と記し、上表のpolicy記号Pと区別する。以下の「部分対応／未対応／維持」は旧静的分類を引用し、変更しない。N4-IDは本書内だけの整理IDで、旧SP-ID・元testの宣言やvariantを置換しない。合成成功を実認証・実通信・正式発行の証拠にしない。

## 2 現行の生成順・実field照合と失敗保持

| ID | 現行sourceの位置・順序 | 未代替保証を読む時の制限 |
|---|---|---|
| N4-E01 | [session constructor](../src/servicenow/bounded-read.ts)でlimitsをcopy・低減検査→M採取→S採取 | caller options参照を採用しない。TSのreadonlyと、実field／limits全体の実行時freeze・任意改変耐性を同一視しない |
| N4-E02 | [pinReviewReleaseConfig](../src/servicenow/review-release-config.ts)へ同S／元limits.Lを渡し、Pを保持→private origin={session,S,L,P}をfreeze | provider使用時の採取位置は構築時である。originは通常sessionにも確保するが、通常sourceから新projectionの生成／消費を呼ぶこととは別 |
| N4-E03 | 固定fake-200継続の親ack受理後、release dispatch前にfresh→capturing。guard→local S→既存getter L→Pの順で採取→guard | getterは当該captureで一度だけ読む。Sをlocalに読んだ後でgetterが現在fieldを改変する故障もあり、local値一致だけで済ませない |
| N4-E04 | 同origin／session／source／composition key、local S／L／Pと現在startedAt／limits.L／releasePolicyを照合→projection／timingをfreeze→pending | Pの同値copyでも同参照でなければ拒否。projectionは私有借用値であり、公開authority・全fieldのdeep copyではない |
| N4-E05 | release200受理後・source consumer.releaseの前、slotを先に空にしpending→consuming。guard・同projection／origin／現在field再照合→guard→consumed | getterを再読・policyを再pinしない。slotを戻して再消費しない。旧SPは直接二重consumeを呼ぶprivate口を持たず、全claim故障の実行保証は別に必要 |
| N4-E06 | 同projectionを観測UTC・receipt比較・上位時刻handoffの継続へ渡し、同origin／fieldをguardでも確認 | NS05／06の後段は別承認・別故障位置である。SPの成功だけで全O／worker時刻・全postの照合まで保証しない |
| N4-E07 | #failReleaseInputはslotを破棄しstate=closed。先行stopCode、disposed時closed、それ以外の固定理由を選んで同ownerを停止。取消継続・finally・rollbackも私有slotを退役 | first reasonをgetter例外で上書きせず、freshへ戻さない。外側closeでoriginを退役しても、全backing解放・完全preemptionを証明したとはしない |
| N4-E08 | 通常のsource.readParent→resolveReleaseはlegacy判断を維持 | SP25のgetter未呼出しは新projectionを使わない正対照。constructorのorigin割当てまで存在しないという意味ではない。通常Permit・C方式を一括撤去しない |

Sは値として照合する一方、session／source／keyとPは同一性も照合する。Dの[conditions](../tests/support/review/ef03/release-conditions.ts)はstarted_at／observed_at／policyを入力値としてpinし、独立context・source・handleとdeadline引数を検査する。これは元sessionのgetter・provider採取位置・実field差替え後の再照合とは別である。

## 3 旧SP25variantの対応表

元assertionは[release-session-projection.test.ts](../tests/review/release-session-projection.test.ts)を静的に確認した。元宣言・入力variantは各正規リンクを参照し、it.eachの実行時fullNameを捏造しない。候補DC／DAは[移行台帳のDカタログ](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md)・[開発conditions試験](../tests/review/development-release-conditions.test.ts)を参照する。

| ID／旧case・入力／故障位置 | 元classで直接assertする範囲 | 未代替残差と将来回復条件 |
|---|---|---|
| N4-S01／[SP01](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp01) pin全L=60000・getter=10000 | reject internal_review_error | DC06は関連参照で未対応。実getter値と構築pin時Lの同値照合を同capture位置で回復。Dのbind deadline引数不一致だけでは代替しない |
| N4-S02／[SP02](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp02) 全L=60000 | getter1回・同receiverの元getter値60000、prepared／closed／reserved0・requests2／payload0、指定private名／秘密のJSON非出力、prototypeのreleaseInput／Projection名なし | DB-01／DC15／DA16は部分対応。同session getter一度・元S／P／Lの結合と非公開projectionを回復。出力名検査を全capability graph不在としない |
| N4-S03／[SP03](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp03) 低減全L=10000 | SP02と同じassertion群。元getter値は10000 | 同候補の部分対応。既定60秒成功から低減Lの同pin・全duration一致を推定せず、独立variantで回復 |
| N4-S04／[SP04](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp04) 親delay1000後、getterをremainingMsへ置換 | reject internal_review_error、getter1回・timer0 | DB-02は別の元clock cutoffで未対応。取得後の残時間を全Lへ縮めた場合の拒否を同位置へ戻し、新しいS／Lを生成しない |
| N4-S05／[SP05](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp05) getter throw | reject internal_review_error、owner.stats.requests=1・run primary同code、timer0 | DC03／09は未対応の関連参照。getter境界の先行診断とrelease進行前停止を回復。元caseの直接assertは総requests1で、purpose別spyではない |
| N4-S06／[SP06](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp06) getter内cancel | reject cancelled、requests1・run primary.cancelled、timer0 | 同候補は未対応。実getter中の同期失効を同位置で保持し、別owner guardの取消だけで代替しない |
| N4-S07／[SP07](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp07) getter内monotonicを全run期限へ進める | reject deadline_exceeded、requests1・run primary同code、timer0 | 同候補は未対応。元M／Lの期限で止まり、getterの戻りLが正しくても生存確認を省略しない |
| N4-S08／[SP08](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp08) getter中にthis.startedAtを別UTCへ差替え | reject internal_review_error、requests1 | DC05／06は関連参照で未対応。getter前local Sと元originだけでなく、getter後の現在fieldを再照合する。元caseに全後段の改変耐性を足さない |
| N4-S09／[SP09](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp09) getter中にreleasePolicyを凍結した同値copyへ差替え | reject internal_review_error、requests1 | 同候補は未対応。内容一致で通さず、元Pの参照と現Pを同位置で照合。policy再pinで救済しない |
| N4-S10／[SP10](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp10) capture getterだけL=10000へ差替え | reject internal_review_error、requests1 | 同候補は未対応。origin.L・local getter.L・現limits.Lを同sessionに結合して照合。callerから別の全Lを指定させない |
| N4-S11／[SP11](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp11) capture後・release待機中にstartedAt差替え | reject internal_review_error、requests2・timer0 | DC17は入力pin後のcaller変更／取消で別方向の未対応。同pendingのconsume時に元Sと現fieldを再照合し、再capture・新deadlineで再開しない |
| N4-S12／[SP12](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp12) 同待機中にpolicy同値copyへ差替え | reject internal_review_error、requests2・timer0 | 同候補は未対応。同P参照の再照合と失敗slotの退役を回復。取得済みbodyがあることを採用資格にしない |
| N4-S13／[SP13](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp13) 前のsessionが保持したpolicyを別sessionへ移植 | reject internal_review_error | DC05は別context拒否の関連参照で未対応。同じ設定profileでも別sessionのPは採用しない。旧case名の同値性と、元P参照の差替えを別のD handle混入へ置換しない |
| N4-S14／[SP14](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp14) L=10000・E_cfg=S+L-1 | provider1回・owner.startedAtは固定S、policy.issue=config_validity_insufficient、limitationsはrelease_visible_nodes_only＋同issue | DC10のissueラベル整合は関連参照で未対応。実provider採取・元S／Lでのpin境界を回復。元caseは実測Australia結果を返しており、一律config_invalid／release_not_admittedへ変えない |
| N4-S15／[SP15](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp15) E_cfg=S+L等号 | SP14と同じprovider／S／issue／limitationsのassertion | 同候補は未対応。等号は不足を維持し、残時間が短くなったので有効と再判定しない |
| N4-S16／[SP16](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp16) E_cfg=S+L+1 | provider1回・固定S、policy.issueはundefined、limitationsはrelease_visible_nodes_onlyのみ | 同候補は未対応。前2境界との対照を維持。これだけでE_cfg<=S、未来asserted_at、全binding条件を網羅したとはしない |
| N4-S17／[SP17](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp17) caller limits.Lをpin後1へ変更、remainingMs=1 | prepared・requests2、getterは10000を返す、remainingMs未呼出し・timer0 | DB-35のbytes pinは対象が異なり未対応。元options copy・getter全L・remaining非使用を同じsessionで回復し、追加deadlineを作らない |
| N4-S18／[SP18](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp18) release delay中cancel | reject cancelled、timer0・fresh run closed | DB-37／DC17は部分対応。実pending projectionの同期失効・非再開を同位置で回復。元assertに失敗budgetや直接slot観測はなく、全解放済みへ補完しない |
| N4-S19／[SP19](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp19) getter=0 | reject internal_review_error | DC06は異なる入力・境界で未対応。元Lと不一致のgetter値を拒否。constructor optionsのinvalid_inputと混同しない |
| N4-S20／[SP20](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp20) getter=NaN | 同じreject internal_review_error | 同候補は未対応。NaNを通常Lや残時間へ丸めず拒否し、旧不正getter variantを独立して維持 |
| N4-S21／[SP21](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp21) getter=Infinity | 同じreject internal_review_error | 同候補は未対応。無限値の置換で期限を無効化・更新せず、同captureの固定失敗へ戻す |
| N4-S22／[SP22](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp22) getter=60001 | 同じreject internal_review_error | 同候補は未対応。既存最大値超えを別Lとして受け入れない。元caseは不正optionsの上限検査を実行したものではない |
| N4-S23／[SP23](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp23) getter内cancel→throw | reject cancelled | DC03は一般first stopの関連参照で未対応。同getter内の順序を保持し、後着例外をinternal_review_errorへ優先させない。全診断層の同値assert済みとはしない |
| N4-S24／[SP24](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp24) release待機中に実session.close | reject closed、timer0・fresh run closed | DS-17／DC04は関連参照で未対応。元pendingのclosed拒否・timer回収を維持。close後にgetterを読めることをprojection再開権限にしない |
| N4-S25／[SP25](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp25) 通常source・getter=1 | 通常readParent→resolveReleaseはmatched、getter未呼出し・requests2 | 分類は維持。非提供・削除・Dへの移行対象にしない。通常sourceの既存fetch境界・legacy判断を残す。1正対照で通常経路全体の網羅とはしない |

SP02／03／18だけが旧台帳上の部分対応であり、SP25は通常経路維持、他21variantは未対応のままである。この引用範囲の集計を移行完了率・最新成功数へ変換しない。SP14〜16のprovider一度は元testが直接assertする一方、getter一度の直接assertはSP02／03等の別caseにあり、1caseで全条件を確認済みとはしない。

## 4 個別承認前に確認する残差

1. 最初にSP25と通常sessionの設定pin・元clock・単一会計を維持する。非提供なのは閉鎖継続の本番採用で、getter自体・startedAt・releasePolicyやconstructorの共有部分を一括撤去する方針ではない。
2. SP01〜04／17／19〜22で、同sessionの全durationと残時間・caller optionsを分離する。sourceのguard・phase／cleanup floorは残時間を使えるが、比較入力のLと設定有効期間は作り直さない。
3. SP08〜13で、採取前local値・getter副作用後の現在field・元origin・pending consume時の実fieldの比較位置を固定する。Dのcontext／handle identity検査やcaller入力copyだけでは逆向きの実field破損を代替できない。
4. SP14〜16で、実provider一度・元S／Lのexpiry境界と公開limitationsを対応付ける。issueなし／ありと実測releaseの可否は別であり、policyラベルの値整合試験だけを元pin実行保証にしない。E_cfg<=S等の隣接境界は別対照に残す。
5. SP05〜07／18／23／24で、同ownerの最初の理由・予約・timerとprojectionの非再開を確認する。元caseが直接観測しないslotや失敗計数・全backing容量は未確認／Unknownのままにする。

元private継続への直接capture／consumeや失効後再試行を旧SP試験が全て呼び分けるわけではない。完全な一度claim・同projection／source／key混入拒否の保証を主張する際には、旧caseに加えた独立対照が必要である。新friend・公開projection取得口・汎用supplierや診断からの昇格口は追加しない。任意のローカルcode改変に対する完全防御、同期処理の強制中断、実layout／allocation上界は主張しない。

## 5 将来の回復条件と隣接群

回復記録は元revision／SP-ID・宣言テンプレート・入力variant・注入位置／旧assertion・artifact、新実装の同session／origin／source／key・case・artifact、共有部分と残差、独立oracle・負対照、実行結果と終了／cleanup確認を揃える。旧テンプレートの%+i等を実行時fullNameへ推測変換せず、元variantを保つ。保証低下を受容するなら失うassertionと将来条件を個別承認へ渡し、受容できなければ回復先行またはリリース停止とする。

[NS02](BEST_PRACTICE_RELEASE_AP01_NS02_ACK_RELEASE_GUARANTEE_REVIEW.md)の同bytes／private ack／実Permit、[NS03](BEST_PRACTICE_RELEASE_AP01_NS03_CONSUMPTION_REVOCATION_GUARANTEE_REVIEW.md)のstatus消費・return／close取消は別経路である。NS04のS／L／P整合でこれらを一括回復したとはしない。観測UTC Oの一度採取・空200と比較候補の時刻整合はNS05、上位時刻・worker jobへの移譲はNS06へ残す。設定日時の長さcap追加・policyの再pin・実source値判断差替えも承認しない。

本書で読んだ[compiled private ack](../tests/review/fixtures/compiled-private-composition-ack.mjs)と[compiled time handoff](../tests/review/fixtures/compiled-release-time-handoff.mjs)には、元classの正常fake継続がある。一方、[compiled純粋比較](../tests/review/fixtures/compiled-release-comparison-contract.mjs)は固定timing／policy値を使う。これらはSP01〜24のgetter置換・実field差替え・provider expiry境界・pending closeを全て実行するfixtureではない。存在や過去成功からSPのcompiled保証回復を推定しない。

source fallbackなしの専用artifact、元故障位置のcompiled対照、元class／Dの非干渉、通常依存を欠落させない梱包正対照とfake閉包不在の負対照は[B-03](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)の別gateへ残す。元5秒・既定並列度、旧比較childの60秒、製品全体60秒・元attempt floorは区別して維持する。実認証／実通信の確認は別承認・未実施であり、AP01の保証低下・AP02〜06の撤去／互換変更／試験切替・設定変更・公開も未承認のままである。

## 6 今回の静的確認

元SP試験・移行台帳、sessionの構築／capture／consume／停止と設定pin、Dのconditionsと既存compiled3fixtureを静的に読み、SP01〜25を対応付けた。新しい試験実行・同等性分類は追加していない。

2026-11-19の静的確認：本書とAP01親文書の2MDについて表6・ローカルlink57・明示anchor31、N4設計ID33（E8／S25）、SP01〜25の対応に重複・欠落がないことを確認した。旧分類は部分対応3／未対応21／通常経路維持1のままで、移行済み件数や試験成功数ではない。元getter・field照合順、expiry等号の設定pin、元variant・provider／remaining／通常経路のassertionと、読取り対象compiled3fixtureの限定範囲も照合した。末尾改行・差分空白・AP01〜06の未承認欄維持を確認し、tracked差分はAP01親MD1件、新規は本書1MD、stage0、製品・試験・設定の変更0だった。製品moduleのimport／実行、試験再実行、build／packは行っていない。保証回復・保証低下受容・撤去・公開可の証拠は追加しない。
