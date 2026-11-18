# AP01 NS05：観測UTCの一度限り採取・空200保持と比較候補の時刻整合の保証レビュー

Version: release-ap01-ns05-observation-comparison-guarantee-draft-0.1 / Date: 2026-11-19。
Status: **MDによる個別承認前整理。限定リリースの公開方針だけ採用済みで、NS05の保証低下は未承認。** 基準HEADは`f360198`。[AP01詳細](BEST_PRACTICE_RELEASE_AP01_LIMITED_SCOPE_DESIGN.md)NS05／RV10について、旧case・未代替残差・将来回復条件を対応付ける。今回の試験成功・移行同等性判定は追加しない。

正式発行口閉鎖・全体受付無効・通常経路未切替・C実行入口／body起動閉鎖・Unknown・VM／監視／telemetry調査保留を維持する。保証低下・旧試験削除／skip／期待値弱化・friend撤去・設定変更・公開は未承認。実装・発行／claim消費・負荷採取・試験再実行・build／pack・実接続・実通信・実機操作・コミット・Pushは行わない。元5秒期限・既定並列度、旧比較childの60秒・製品全体60秒・元attempt floorとLOAD6／LOAD7選択未承認も維持する。

## 1 対象と保証の分離

NS05の非提供対象は、新しい同body bytes／観測UTC receipt・比較候補受理の本番接続である。通常sourceの既存release判断・C方式・設定代替・ReleasePermitや既存公開shapeまで非提供／削除対象にしない。[NS04レビュー](BEST_PRACTICE_RELEASE_AP01_NS04_SESSION_PROJECTION_GUARANTEE_REVIEW.md)の同session・元startedAt S／全duration L／pin済みpolicyを引き継ぎ、観測UTC Oを新しい開始時刻・期限・policy再pinの根拠にしない。

[正規case台帳](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md)のOU01〜16とCR01〜05の計21variantを本書へ一度ずつ対応付ける。CR04はAP02／03の入口・撤去責務を持つ隣接caseとして明示し、削除で移行済みにしない。旧分類はOUが部分対応8／未対応8、CRが部分対応4／未対応1、合計部分対応12／未対応9で、同等移行済み・通常経路維持への分類変更はない。これは静的台帳の引用であり、最新test発見数・成功数・coverage率ではない。N5-IDは本書内の整理IDで、旧宣言・variant・fullNameを置換しない。

| 値／観測 | 意味と必要な照合 | 代替にしないもの |
|---|---|---|
| S／L | 元sessionの開始UTC／元run全duration。Oの許容区間はS <= O <= S+L | remainingMs、後段のUTC、公開JSONの宣言deadlineから再計算しない |
| O | 同sourceの有効なcomplete_200行projectionを受理し、取得後guardの後に一度採るクライアント側UTC | PDI時計・外部認証時刻・解析終了UTC・caller指定observed_atではない |
| ISO呼出し数 | OU／CRの対象条件で合計2はconstructorのS1回＋O1回。合計1はO未到達 | 全runの全時計読取回数や、Date生成・getTime回数を直接assertしたものではない |
| 空200の保持 | assertion／source:noneの公開evidenceにOがなくても、private receipt／候補は同Oを保持 | 公開field追加、観測なしを実測と偽ること、summaryからの時刻権限復元をしない |
| 値比較候補 | 同projection／ack／rows／Oから得る非実行draft。実測／conflict evidenceは同Oを使う | matched値だけでlegacy採用・Permit・正式発行を成立させない |

元class＋fake I/O（台帳のP）、独立開発assembly（D）、値kernel単体は別保証である。会計のC／G／Pはrequests／received_bytes／payload_bytesであり、台帳の経路Pとは区別する。policyは略号Pとせずpolicyと記す。特にDの[conditions](../tests/support/review/ef03/release-conditions.ts)はstarted_at／observed_at／policyの事前入力をpinし、取得済みrowsを固定比較へ渡す。元classの取得後clock・採取位置・同originの再照合を実行するものではない。

## 2 現在の実装境界と保持責務

| ID | 静的に確認した順序・保持先 | 未代替保証を読む時の制限 |
|---|---|---|
| N5-E01 | [session](../src/servicenow/bounded-read.ts)のfixed fake-200継続でrelease status200を確認→元projectionを一度消費→観測ownerを生成。同session／source／keyと元origin・現在S／L／policyをcheckで照合 | 通常source差替えではない。新しい公開clock supplierや独立予算を作っていない。生成しただけではOを採取しない |
| N5-E02 | 同release ackをmintし、同projection／ackとrun／budget／originへ比較・時刻handoff ownerを結合→source consumerへackを渡す | 同bytesの取得／課金・解析は既存typed継続の責務。Oの一致だけでは同bytes・cleanup完了・実認証を証明しない |
| N5-E03 | [source](../src/review/bounded-source.ts)で同ackを消費し、result配列・最大21行・build_nameのprojection→guard→観測hook→guard→receipt受理hook→guard→既存legacy分岐 | 不正projectionはhook前で止まる。21行sentinelは有効projectionとしてOを採るが、22行・不正fieldは同じではない。binding不一致は行読取前にunknownとなり、この旧fixed transcriptのrelease GET=0を意味しない |
| N5-E04 | [観測値owner](../src/servicenow/review-kernel/release-observation.ts)はfresh→samplingをpre-guard前に消費。guard→固定clockの同Dateからepoch／ISO→形式・S〜S+L照合→post-guard→sampled | 一度だけのO。失敗／caught reentry／closeから再採取しない。O=S+Lを値として許してもmonotonic guardの期限を免除しない。未観測の時計変動・絶対時刻精度は保証しない |
| N5-E05 | [receipt owner](../src/servicenow/review-kernel/release-comparison-receipt.ts)が同projection／session／source／key／timing参照／policy参照と元ackを固定。issueでrows／Oをstrict値copyし、OのS〜S+Lを検査してopaque receiptへ保持 | 純粋比較器の構造parserはcomplete_200とOの有無を検査するが、Oの区間比較を単独で代替しない。元policyは再pinせず、unset optionalだけ値projectionで省略し未知fieldは残して拒否する |
| N5-E06 | compareはreceiptをMapから先に削除→pre-check／binding→[固定比較器](../src/servicenow/review-kernel/release-comparison.ts)→post-check／binding。candidateにdraftと同入力Oを保持。acceptもcandidateを先に削除しpre/postを通った後だけacceptedへ保持 | issue／compare／acceptは各一度で、foreign／copy・serialized draft・再入を復活口にしない。空／unknownのdraftにも同Oは保持するが、そのdraftをlegacy不許可の救済に使わない |
| N5-E07 | 実測／conflictのlegacy evidenceはhookからの同Oを使用し、追加new Dateを実行しない。空／全空は既存fallback、未知／不完全／上限は既存unknown。preparedはlegacy matched時だけ進む | 元callerのrejectとDの公開unknown／withheldは非同等。空200でOを追加採取する旧閉鎖laneの挙動を、通常sourceにも既に導入済みと説明しない |
| N5-E08 | 比較正常accept後はdraft＋Oを私有保持し、成功時に[TimeHandoff](../src/servicenow/review-kernel/release-time-handoff.ts)へOを一度移譲。sourceClosedでreceipt／source参照を退役し、上位時刻は別ownerがdiscardまで保持 | CT-A当時の「closeで破棄」とTB-B後の「上位へ移譲」を区別する。現在の元classの内部OをOU／CR session試験が直接取得・assertするわけではない。NS06の全post／worker job保証を合算しない |
| N5-E09 | failでreceipt／candidate／acceptedを破棄しfailed、closeはclosed。観測失敗は同sessionの#failReleaseInputへ渡し先行停止理由を保持。finally／rollback／revokeが観測・比較参照を退役 | timer0・reserved0・参照破棄と、全backing解放／実worker cleanup／同期強制中断は別。元assertにない解放・診断はUnknownのまま |
| N5-E10 | 通常resolveReleaseはhookなしの既存#observeReleaseを使う。空200等は既存fallback、実測／conflictは既存の分岐内UTC採取 | 通常経路のguard・出力・既存Permitを維持。旧閉鎖laneのO一度採取保証の非提供は、通常の設定代替や時計処理を削除する承認ではない |

## 3 旧OU16variantの対応

直接assertの根拠は[release-observation-session.test.ts](../tests/review/release-observation-session.test.ts)。同じ宣言のvariantは入力・注入位置で分ける。元it.eachの$expected／%#／%sを推測展開したfullNameは作らない。候補DA／DCの原式・差分は[正規台帳](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md)と[開発adoption試験](../tests/review/development-release-adoption.test.ts)を参照する。

| ID／旧case・入力／故障位置 | 元classで直接assertする範囲 | 残差・将来の回復条件（旧分類維持） |
|---|---|---|
| N5-O01／[OU01](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#ou01) 空200・2回目toISOString throw | reject internal_review_error、ISO合計2・timer0 | 未対応。S後のO変換失敗を同取得後位置で回復し、空200でも設定代替で救済・再採取しない。clock関数自体throwの単体試験とは注入位置が異なる |
| N5-O02／[OU02](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#ou02) rows=[]・有効Australia設定 | source=operator_config、公開observed_atなし、C=2・G=親＋release bytes・P=0、reserved0／cleanup closed／dispatch unavailable／issuance disabled、PRIVATE非出力、ISO合計2・timer0 | 部分対応DA13／NR17。Dの空配列・asserted warning順だけでは実設定pin／O一度と旧prepared shapeを代替しない。空Oの内部保持は別の値owner直接検査と接続確認が必要 |
| N5-O03／[OU03](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#ou03) build_name=null | OU02と同じ成功assertion群 | 部分対応DA13。候補は空配列で元はnull行。両variantのprojection／O採取・公開shapeを保持し、同じfallback結果だけで一件へ統合しない |
| N5-O04／[OU04](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#ou04) Australia実測 | source=sys_cluster_state.build_name、observed_at=start、OU02の会計／閉鎖／秘密・ISO／timer群 | 部分対応DA01／12。同Oが実測evidenceへ入ること、C/G/P・予約と旧class採取位置を回復。事前入力Oを出力したD成功は取得後時計の代替ではない |
| N5-O05／[OU05](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#ou05) PRIVATE_UNKNOWN | reject release_not_admitted、ISO合計2・timer0 | 部分対応DA11。DはSECRET_UNKNOWN等の別値・設定なしでunknown draftを公開する。元rejectと同条件にせず、同位置のO一度と不採用後破棄を回復。宣言のexpected=noneは実返却assertではない |
| N5-O06／[OU06](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#ou06) Australia＋null | reject release_not_admitted、ISO合計2・timer0 | 部分対応DA11。incomplete値だけで元caller拒否を代替しない。O採取後の非採用・同owner停止と公開shapeの差を維持 |
| N5-O07／[OU07](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#ou07) Australia21行 | reject release_not_admitted、ISO合計2・timer0 | 部分対応DA11。候補はnull21行で設定も異なる。21行を有効sentinelとして採取する位置・元rejectを回復し、22行の採取0と分ける |
| N5-O08／[OU08](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#ou08) Australia＋Zurich実測競合 | reject release_not_admitted、ISO合計2・timer0 | 部分対応DA14。候補はAustralia実測＋期限切れZurich設定で別条件。元の2family実測と有効Australia設定を維持し、expected=conflictを公開成功と数えない |
| N5-O09／[OU09](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#ou09) Australia22行 | reject release_not_admitted、ISO合計1・timer0 | 未対応DA15は差分参照。Dのinvalid_responseと元caller codeは異なる。同不正projectionでO未到達を確認し、invalid_observation用Oを捏造しない |
| N5-O10／[OU10](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#ou10) build_name=42 | OU09と同じ拒否・ISO合計1・timer0 | 未対応DA15は差分参照。行型不正の注入を別variantで維持。フォーマット拒否だけで採取前順序・元rejectを代替しない |
| N5-O11／[OU11](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#ou11) release delay1000中にUTCをstart-1001へ変更 | reject internal_review_error、timer0 | 未対応DC11は入力形状の関連参照。実時計逆行を同位置で拒否し、S／Lの補正・O再採取・mono期限延長をしない。元caseはS／L実fieldやISO回数を直接assertしていない |
| N5-O12／[OU12](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#ou12) 同待機中にUTCをstart+60001へ変更 | reject internal_review_error、timer0 | 未対応DC11。wall-clock上界不整合とmonotonic deadlineを区別し、deadline_exceededへ読み替えない。元S／L不変は実field接続と単体区間検査も併せて回復する |
| N5-O13／[OU13](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#ou13) 2回目ISO内cancel | reject cancelled、ISO合計2・timer0 | 未対応DC03／DA09。観測変換内部の同期失効と後guardの組合せを回復し、一般first stop／cleanup後guardだけに置換しない |
| N5-O14／[OU14](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#ou14) 同cancel→throw | reject cancelled、ISO合計2・timer0 | 未対応DC03／DA09。後着時計例外より先行取消を維持。元caseに全診断層の同値assertや例外非出力assertはないため足して数えない |
| N5-O15／[OU15](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#ou15) 同ISO内でperformance.nowを元値＋60000へ進める | reject deadline_exceeded、ISO合計2・timer0 | 未対応DC03／DA09。正しいOが返り得ても同canonical mono guardで停止。UTC上界のinternal_review_errorとは独立に回復 |
| N5-O16／[OU16](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#ou16) release delay1000・O前cancel | reject cancelled、ISO合計1・timer0 | 部分対応DB-37。body待機取消・解放だけでなく、O未到達の順序を同位置で回復。O採取後取消caseへ統合しない |

## 4 旧CR5variantの対応

直接assertの根拠は[release-comparison-receipt-session.test.ts](../tests/review/release-comparison-receipt-session.test.ts)。CR01／02は同宣言の空／実測variantであり、内部Oを直接読む試験ではない。

| ID／旧case・入力／故障位置 | 元classで直接assertする範囲 | 残差・将来の回復条件（旧分類維持） |
|---|---|---|
| N5-C01／[CR01](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#cr01) rows=[] | prepared_only、C=2／G=親＋release bytes／P=0・reserved0／cleanup closed／dispatch unavailable／issuance disabled、ISO合計2、PRIVATE／comparison／receipt／projection非出力、空evidenceのobserved_atなし、prototypeのreleaseComparison／Receipt名なし、timer0 | 部分対応DA01／16。旧public shape・採取回数・private非公開境界を回復。名前検査は全capability閉包不在を証明せず、class内部acceptedのOを直接assertしたとも数えない |
| N5-C02／[CR02](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#cr02) rows=Australia | CR01のprepared／会計／閉鎖／ISO／秘密／prototype／timer群。空evidence専用assertは適用しない | 部分対応DA01／16。実測variantも独立に維持。元caseは実測observed_at値の直接assertを持たず、その値保証はOU04等と分ける |
| N5-C03／[CR03](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#cr03) 開始直後release元bytesをfill(0)、別呼出しで外部candidate field注入 | 改変後もprepared_only・改変前計算のreceived_bytes。外部candidate入りsynthetic_ioは同期invalid_input | 部分対応DB-35／DA02。同内容のpinと同source receipt連続性・厳密入口を回復。Gの総量一致だけでは同bytesの証明にせず、成功／値copy検査も必要。元caseは外部candidate拒否時の各副作用spy=0を直接assertしていない |
| N5-C04／[CR04](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#cr04) 実source constructorに推測keyとcapture／observe／accept hook | invalid_inputをthrow、capture／observe／accept全未呼出し、finallyで元session.close | 未対応。Dのschema拒否とは別の実private生成境界。AP02／03の撤去・export／配布物不在対照へ残し、削除だけで入口保証回復にしない |
| N5-C05／[CR05](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#cr05) release待機cancel→新しいrun | 元pendingはcancelled・timer0、別fresh compositionはcleanup closed | 部分対応DB-37／DC17。元runの失効・candidate一度消費は別境界も必要。fresh成功は元runの再利用成功ではなく、元caseにprivate消費回数の直接assertはない |

## 5 内部保持・時刻整合の直接保証と残差

以下はOU／CRの直接assertを補う既存値試験の参照であり、21variantへ加算せず、旧caseの移行分類も引き上げない。[観測UTC契約](BEST_PRACTICE_ABORT_SCOPE_RELEASE_OBSERVATION_UTC_DESIGN.md)・[CT-A検証記録](E2E_BEST_PRACTICE_RELEASE_COMPARISON_CTA_2026-11-01.md)の過去実績は今回の再実行結果ではない。

| 既存試験と直接条件 | 回復判断へ残す接続保証 |
|---|---|
| [観測値単体](../tests/review/release-observation.test.ts)：guard→clock→guard、O=S／S+L、O=S-1／S+L+1／Invalid Date、pre／post guard拒否、caught reentry、close、元timing／依存のpin、失敗後再読なし | 任意fake依存の値owner保証。実constructorのSと観測O、同source取得後guard・元停止ownerとの接続はOU／SPで別に確認する。O=S+Lの許容はmono guardの期限等号成功ではない |
| [receipt値単体](../tests/review/release-comparison-receipt.test.ts)の空200受理：inspectのobserved_atは入力O、operator_config evidenceにobserved_atなし、権限4項目false。unknown理由4variantも同O保持 | 内部O保持の直接assertはこの値owner上にある。実sessionのopaque receiptを外から読んだ保証ではない。通常公開fieldを増やさず同Oが同originの継続を通ることを別に回復 |
| 同値単体の元rows後変更、foreign projection／ack／receipt／candidate、issue／compare／accept重複、serialized draft・caught reentry、6guard位置、close後O／draft=null | 同identity／一度消費と失敗破棄は値ownerの条件。元source ack／canonical会計／失効・上位診断への連続性と全解放を独立に回復。値inspectを実sessionのauthority取得口へ昇格しない |
| 同値単体の5family・unknown・raw22／policy矛盾・O逆行／上界、元L60000／O45秒後でも設定validity_insufficient、比較post取消優先、未知policy field拒否／unset optional省略 | 比較入力の同S／全L／policy・同rows／Oを維持し、既存判断との結果差を隠さない。比較器単独の構造parse／policy整合だけでは観測の区間・実時計採取位置を保証しない |
| [compiled比較](../tests/review/fixtures/compiled-release-comparison-contract.mjs)は固定Oで値copy／policy・warnings・非実行性、[compiled handoff](../tests/review/fixtures/compiled-release-time-handoff.mjs)は値bridgeの空O保持／discardと元classのAustralia正常fake、[compiled private ack](../tests/review/fixtures/compiled-private-composition-ack.mjs)も正常fakeを含む | 読取った3fixtureはOUのISO spy／clock故障16variant・CRの全入口／取消を同条件で実行しない。固定Oの橋と実class正常例を合算して空200の実clock→receipt→候補のcompiled保証としない |

同sourceの同rowsとOから比較されたこと、候補の時刻が同Oであること、空200でOを私有保持すること、受理後に同上位ownerへ移譲することは別の確定点である。NS05では前3点の未代替保証を記録し、上位ownerのsourceClosed／discard・T_i／保持U／E・worker job bindingは[NS06の責務](BEST_PRACTICE_ABORT_SCOPE_RELEASE_COMPARISON_TIME_BINDING_DESIGN.md)として残す。OU／CR成功だけでS <= O <= T_i <= Eを確認済みにしない。既存schemaや通常adapterの時刻fieldを緩和・再採取・補正しない。

## 6 個別承認前の優先順・将来回復条件

1. 通常source／設定代替／Permit・旧公開shapeを維持する範囲を先に固定する。OU05〜10の元caller拒否とDのunknown／invalid_response、DA09のcleanup後withheldを非同等のまま扱い、保証低下や互換変更の承認へ無断転用しない。
2. OU01〜16の元入力・故障位置で、projection→取得後guard→O一度→post-guard→receipt／比較を回復する。ISO総数とOの回数を分け、空／全null／実測／未知／不完全／21行、raw22／型不正、O前／中の取消・時計例外を同じ期待のまま残す。単体の1ms境界と元sessionの注入値も置換せず併記する。
3. CR01〜03／05と値owner対照で、同projection／source／元ack・元S／全L／policy・同rows／Oの一体受理、receipt／candidateの一度消費、空O保持、失効／close時破棄を接続する。未確認slot・backing容量・実cleanupをconfirmedへ変えず、診断の最初の理由を保持する。新friend・公開supplierを回復口にしない。
4. CR04は生成key・hook未呼出しの保証と、将来のAP02／03撤去・非露出検査を別に記録する。専用artifact・source fallbackなしのcompiled対照、通常依存を保つ梱包正対照／禁止閉包不在の負対照は[B-03](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)の独立gateへ残す。今回の静的読取をbuild／tarball成功に数えない。
5. 回復記録には元revision／OU・CR-ID／宣言テンプレート／入力variant／故障位置／直接assertion・artifact、新境界／同一性／case・artifact、共有部分と未代替残差、独立oracle・負対照、実行結果と終了／cleanup確認を揃える。保証低下を受容するなら失う保証・非提供範囲・将来回復条件を個別承認へ渡す。受容できなければ回復先行またはリリース停止とする。

NS04の元S／L／policy、NS02の同bytes／private ack／実Permit、NS03の消費後失効・return／close取消も隣接する独立責務である。NS05の値整合だけで一括回復しない。設定日時長cap・実source差替え・worker／runtime接続・実認証／実通信は別承認・未実施。AP01〜06の保証低下・撤去・互換変更・旧試験切替・設定変更・公開の未承認と、正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。

## 7 今回の静的確認

旧OU／CRの本文・正規台帳、観測／receipt／比較／handoffの値kernelと元session／sourceの固定hook、開発conditions／adoptionの該当本文、既存compiled3fixtureを静的に読み、直接assertと実装上の接続・追加回復条件を分けた。今回の実装・試験再実行・製品moduleのimport／実行・build／pack・保証回復判定は行っていない。

2026-11-19の静的確認：本書とAP01親文書の2MDについて表8・ローカルlink62・明示anchor27、N5設計ID31（E10／O16／C5）、OU16／CR5variantの対応に重複・欠落がないことを確認した。旧分類は部分対応12／未対応9のままで、移行完了・試験成功数ではない。元variant・ISO回数／時計注入・bytes改変／外部candidate／推測keyのassertion、観測のclaim順・epochとISO照合・receipt消費／O保持・sourceのlegacy分岐前採取を静的照合した。AP01〜06未承認欄、末尾改行・表の列数・差分空白を確認し、tracked差分はAP01親MD1件、新規は本書1MD、stage0、製品・試験・設定の変更0だった。各閉鎖条件・Unknown・調査保留を維持し、保証低下受容・撤去・公開可の証拠は追加しない。
