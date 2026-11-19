# AP02／AP03：friend閉包の撤去範囲・通常経路維持と入力／返却互換性

Version: release-ap02-ap03-removal-compatibility-draft-0.3 / Date: 2026-11-19。
Status: **個別承認用の設計案。撤去・互換変更・保証低下・旧試験の処遇は未承認。** 静的読取り基準HEADは`b0d6055`。今回の「具体化」は判断材料のMD化に限り、AP02／03の承認・実装開始を意味しない。

正式発行口閉鎖・通常経路未切替・C実行入口／body起動閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。LOAD6／LOAD7選択、元5秒期限・既定並列度、旧比較child60秒・製品全体60秒・元attempt floorは変更しない。実装・発行／claim消費・試験変更／再実行・build／pack・採取／保管・実process対照・実接続・実通信・実機操作・設定変更・版変更・公開・コミット・Pushは行わない。

## 1 判断の単位と根拠

[保証回復レビューAP02／03](BEST_PRACTICE_RELEASE_GUARANTEE_RECOVERY_SCOPE_REVIEW.md)と[EF-03設計](BEST_PRACTICE_ABORT_SCOPE_KERNEL_ROOT_SEPARATION_EF03_DESIGN.md)の撤去案を、対象の存在・維持境界・互換差・必要証拠へ分ける。[AP01](BEST_PRACTICE_RELEASE_AP01_LIMITED_SCOPE_DESIGN.md)で採用済みなのは限定リリースの公開方針だけで、非提供laneの未代替assertionを失ってよいという決定ではない。

| ID | 今回読む根拠 | 静的に確認できる範囲・限界 |
|---|---|---|
| A23-E01 | [session](../src/servicenow/bounded-read.ts) | 2取得関数・保存slot・static登録・runner、synthetic有無のoverloadとbranch、共有生成・closeを確認。実行・配布物の不在証明ではない |
| A23-E02 | [source](../src/review/bounded-source.ts) | 第3引数のCompositionSourceConstructionとcapture／takeStatus／観測callback、claim helper、通常Permitの別経路を確認 |
| A23-E03 | [client](../src/servicenow/client.ts)・[adapter](../src/review/update-set-adapter.ts) | 通常clientはsnapshotからnew session、adapterは第3引数なしのsource→readParent→resolveReleaseを使う。外部利用者の不在・全動的閉包は未確認 |
| A23-E04 | [status probe](../src/review/abort-scope-evidence-source-status-probe.ts)・[旧ND root](../src/review/abort-scope-evidence-native-diagnostic.ts) | module評価時のfriend取得がある。probe呼出しをしない純粋試験もimport段階で依存し得る |
| A23-E05 | [fake I/O](../src/servicenow/review-composition-fake-io.ts)・[package設定](../package.json)・[build設定](../tsconfig.json) | fake I/Oをruntime sessionが直接importし、現buildはsrc→distへJS／宣言／mapを出す。packageのprobe除外だけではclass内friendを消せない。設定は評価／変更しない |
| A23-E06 | [維持／移行レビューGT・AD・PK](BEST_PRACTICE_RELEASE_FRIEND_TEST_GUARANTEE_REVIEW.md)・[B-03](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md) | 元assertion・P/U/D/I/H・compiled／梱包の責務分離を継承。source検索を全閉包・外部互換性の完全調査としない |

撤去の承認単位は「同revisionの対象閉包＋維持境界＋意図的な互換差＋影響case／artifact＋未代替保証の処遇」とする。exportの名前だけ、群の成功件数だけ、AP番号だけでは承認しない。以下の状態はすべて**候補・未承認**であり、削除済み・回復済みという欄はない。

## 2 AP02：撤去候補と残す所有境界

| ID | 現在の生成／保持位置 | 撤去・分離の候補単位 | 必ず残すもの・止める条件 |
|---|---|---|---|
| A23-R01 | bounded-readのtakeStatusAcceptanceProbe／statusProbe、takeNativeStatusCompositionProbe／nativeStatusProbe | 2exportだけでなく保存slot・static登録・対応型・private fresh runner／driverまで依存を追い撤去 | 別名export・static method・symbol・secret・環境変数・installer・互換shimへ移す案は不可。非exportの取得本体を単に休眠させても撤去完了ではない |
| A23-R02 | 同moduleのsourceConstructionClaim／claimPrivateCompositionSourceとstatic登録 | sourceのcallback branchと対で外部claim入口・登録継続を撤去 | 初期sourceの同session／snapshot／core／lease／ownerへの結合は固定root内に残す。通常sourceのReleasePermit・releasePortFor等へ一括適用しない |
| A23-R03 | sourceのCompositionSourceConstruction、第3引数、capture／take／takeStatus／rejectStatus／observeReleaseUtc／acceptReleaseObservation／check／key | caller由来callback集合とprivate consumerの受渡しを本番constructorから切る。開発rootは自分の新規状態だけを生成 | 通常の2引数constructor・GET由来親値／release判断・元source内Permitを維持。第3引数のJS受付は§4で別審査。callbackを返す代替公開口は作らない |
| A23-R04 | sessionのsynthetic_io付きoverload、pinCompositionFakeIO、#prepareCompositionIO、PreparedSummaryと専用projection／観測／handoff保持 | synthetic専用の入力受付・実行・summary／専用参照を到達辺ごとに切る | startedAt／既存deadlineMs getter／pin済みpolicy・通常sourceの観測まで消さない。共有field／closeの利用を区別できなければ停止 |
| A23-R05 | review-composition-fake-ioの型・pin・固定Response／Streams生成・dispatch／dispose | 本番importとJS／宣言／mapの閉包から除外する候補。開発側は別assembly／別artifactとして設計 | 現moduleをそのまま本番用aliasで温存しない。開発側移行の保証はB-03／AP05で別確認。通常typed dispatch／canonical会計は維持 |
| A23-R06 | status probe／旧ND rootのmodule評価時取得、旧NDのbridgeと純粋／resource層 | 旧rootのfriend依存を切る前に、純粋診断・無bridge注入・実class継続を分離 | 未完成LM03へoptional bridgeをexportして逃がさない。旧ND単体UN62の同reader・window・floor・cleanup／seal保証を放棄しない |
| A23-R07 | #openComposition、#prepareComposition、省略時summary、#compositionStarted／source／revoke等、construction／rollback／run owner | fake専用参照は切るが、共有生成・停止・予約・closeは本番側に維持。fieldごとの利用分類を実装前に確定 | #openCompositionは省略時にも初期source・transport claim・statusBindingと会計を結ぶ。名前にstatus／compositionがあるだけで丸ごと削除しない |
| A23-R08 | compiled fixture、pack script、古いdist／宣言／map、reexport／型／動的edge | 本番Pの正／不在対照とU/Dの連続試験へ分離する候補 | sourceだけの削除・package除外だけ・起動不能による不在成功は不可。旧試験削除／設定変更はAP05／06等の別承認まで保留 |

この表は静的に見つけた根からの候補台帳で、撤去diffの全field・全到達辺の列挙完了ではない。各対象には実装前に「定義／全参照／共有か専用か／生成・停止・解放責務／出力artifact」を結ぶ。未知edge・共有writer・未確認resourceが残れば、その行は停止して再設計する。

初期sourceのkey照合と通常Permit照合は同じ権限ではない。外部claim helperを消す際も、元rootによる初期sourceの一度結合・失敗時の失効と返却を保持する。開発rootの台帳を本番へ共有する、diagnostic／summary／同値copyからbindingを再建する、既存runを外部から採用する口で補わない。

[AP02の撤去範囲基準 draft-0.1](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)で、R01〜08を実名の専用入口／field／実行辺、通常K01〜06、配布／旧試験の責務へ対応付けた。省略時にも使うstatus binding／会計接続を維持し、fake専用の時刻引渡しをsessionから分離しても既存packが期待する値moduleは初回撤去対象外とする。設計範囲の確定のみで、対象patch・全到達辺・実tarball・旧試験処遇は未承認／未確認。

## 3 通常経路で維持するもの

| ID | 維持する契約 | 将来の正対照と不許可の影響 |
|---|---|---|
| A23-K01 | create／直接new／client snapshot生成、既存BoundedReadOptions.fetch・signal・低減limits、認証mode・元startedAt／全deadline・provider pin | [canonical session](../tests/review/canonical-session-migration.test.ts)等のP試験を維持。通常fetch削除・第二予算／時計／枠・期限緩和は不可 |
| A23-K02 | 通常2引数source、readParent→resolveRelease、同source／sessionのPermitと不変release snapshot、foreign／copy／close後拒否 | [source binding](../tests/review/source-release-binding.test.ts)・[release gate](../tests/review/release-gate.test.ts)を維持。新status非提供を理由に通常Permitを撤去しない |
| A23-K03 | legacy release判断と既存C方式の設定・binding・寿命・失敗分類 | [operator fallback](../tests/review/operator-release-fallback.test.ts)を維持。新status fallbackを開けず、合成200限定を通常HTTP全体へ広げない |
| A23-K04 | 通常adapter／worker・0.2／0.3等の出力、取消・終了待ち・本文非露出 | [adapter](../tests/review/update-set-adapter.test.ts)・標準workerのP側対照を維持。Dのunknown／withheldへ通常返値を差し替えない |
| A23-K05 | 最初のconstruction shell・部分rollback・failure copy回収・first reason、run／construction分離、canonical C/G/P・final4予約・admission | [construction transaction](../tests/review/construction-transaction.test.ts)をPのcompiledとともに維持。旧fake固有故障の未代替と通常factory維持を別管理 |
| A23-K06 | prepareNewReviewCompositionのsynthetic省略時の同期ConstructorSummary・固定close | [private composition](../tests/review/private-composition.test.ts)のGT02を維持。C/G/P=0・ready_generation=0／auth_ready=false・constructor_bound／initial_source=bound／transport_claim=claimed・reserved=0／cleanup=closed・dispatch=unavailable／evidence_issuance=disabled、固定key集合／freeze・非権限性を保つ。phase_reserve_msは元limitsからの既存計算を維持 |

K06は「何も生成しない入口」ではない。新規session・同ownerの初期source／claimと一時予約を経て固定closeする現契約を保持し、dispatchやworker／bodyへ進めない。synthetic入力の副作用前拒否（§4）とは別の対照である。これらのP保証をU/Dの別brand成功だけへ移す案は受容しない。

## 4 AP03：入力・返却・例外時点の差分

次は**現sourceの静的分岐**と**未承認の候補仕様**の比較で、元testが全行を直接assertしている表ではない。現行methodはasync宣言ではなく、syntheticなしは同期値、fake pin成功後のlaneだけPromiseを返す。

| ID | 入力／利用位置 | 現在読める契約 | 変更候補・個別判断点 |
|---|---|---|---|
| A23-C01 | options省略／undefined／許可されたsignal・limitsだけ | 同期ConstructorSummary。入力／構築失敗は同期throw。許可snapshot等をpinし新規生成・固定close | K06を維持。method全体をasync化してPromiseへ変えない |
| A23-C02 | own data propertyのsynthetic_ioに正しい固定transcript | options／signal→snapshot／oauth pin→input検査→fake pin／copy→session生成。その後Promise<PreparedSummary>。成功はprepared_only、失敗はPromise拒否 | own keyを未知入力として固定invalid_inputで**同期throw**する候補。正常prepared Promiseの廃止・.then／catch／await／tryの観測差を承認対象にする。候補を採用した場合もD成功値へ置換しない |
| A23-C03 | own synthetic_io=undefined／null／false／0／空文字／不正transcript | fields.synthetic_ioは値ではなくdescriptor。keyがあればfake pinに入り、到達すればinvalid_inputを同期throw。先行signal／snapshot／inputエラーが優先する場合がある | keyの存在で拒否する候補。truthiness判定で省略扱いにしない。snapshotやinputが不正な場合との優先順変更も承認範囲 |
| A23-C04 | synthetic_ioのown getter／setter、未知own key・symbol、options=null等 | descriptor検査等でinvalid_input。descriptor取得自体の挙動とgetter値読取りを混同しない | own accessorを呼ばず拒否する候補。symbol・未知key拒否とK06の許可fieldを維持。proxy等の細部はC05へ分離 |
| A23-C05 | 継承synthetic_io、prototypeを持つoptions、Proxy options | 現optionsはtypeof objectとown descriptorを調べ、snapshot用pinDataObjectと同じstrict plain-object検査ではない。継承fieldはown一覧に入らず、Proxyはdescriptor取得時trapが動き得る | 継承keyの扱い・Proxyをtrap前拒否するか・prototype制約を加えるかは**未選択**。現挙動の静的事実を安全性保証にせず、synthetic own keyの撤去に紛れて無断で変えない。固定方針が決まるまで実装gateは閉鎖 |
| A23-C06 | TypeScript import・overload・返値型、JS／deep import・namespace参照 | synthetic overloadとCompositionFakeIO依存、2取得関数・claim export・source第3引数の型／実体がsourceにある。外部利用実態はUnknown | synthetic overload／専用型依存と取得exportを宣言からも削除する候補。名前付きESM importはlink時失敗、namespace上の不在はプロパティ不在となり、旧2回目takeのruntime codeと非同等。同期invalid_inputだけで全互換影響を説明しない |
| A23-C07 | JSからsource constructorへ第3引数creationを渡す | truthy creationはclaim／callback branch、falsy creationはそのbranchを通らない。現行のguess key拒否は旧私有結合に依存 | 型の第3引数を消すだけではJS余剰引数を拒否できない。引数個数で拒否する案と非undefined値を拒否する案、明示undefined／null／falseの扱いは**未選択**。いずれもcallbackを実行・保持せず、通常2引数を維持。constructor冒頭の固定拒否位置を承認前に確定 |
| A23-C08 | fake lane内のthrow／取消／期限／HTTP失敗とreject／unknown／withheld | fake pin後のPromise側故障と、入口の同期throwは別。Dの非実行draft summaryは別owner／別返値 | 撤去で元laneのfailureを一律unknown成功へ変換しない。AP04の非同等性・AP01の未代替保証を別審査。通常sourceのunknown／mismatchedはK03／04で維持 |

[C07の第3引数・互換差と拒否境界 draft-0.1](BEST_PRACTICE_RELEASE_AP03_C07_SOURCE_CONSTRUCTOR_ARGUMENT_DESIGN.md)に、3個以上拒否と明示undefinedの3個だけ許容の比較、共有の省略時呼出しが現状3引数になる点、型とJS受付・emit順・通常正対照を分けて記録した。第3／第4引数の採用仕様・C05は未選択で、C07の比較は撤去・互換変更・旧試験処遇の承認ではない。

### 副作用前拒否の候補境界

候補C02／03は「既に生成したrunを止める」ではなく、options形状の安全な確認後、snapshot／oauth列挙・policy provider／時計呼出し、input検査、fake bytes取得／copy、session／controller／listener／timer／admission／登録、core／source／claim／予約、dispatch／readerより前に拒否する案である。module importそのものの評価・intrinsic捕捉・既存static登録を0にする意味ではなく、そちらはR01〜06の閉包不在検査が扱う。

複合不正入力では現在の先行エラーからinvalid_inputへ優先順位が変わり得る。synthetic key＋既abort、invalid snapshot／input、投げるpolicy provider等を個別に記録し、元理由を維持したという表現にしない。synthetic keyの有無を見る処理自体がProxy trapやgetterを起動しないかはC04／05の未選択事項を解消してから固定する。

将来の拒否試験では、C/G/P=0だけで生成前停止を証明しない。個別の生成／clock／provider／copy／予約／dispatch観測と、既存Pのactive／principal／診断不変・後続fresh成功を組み合わせる。観測器のために新friend・公開writer・本番台帳取得口は追加せず、同一性と副作用の追加受入条件は元caseの直接assertionから分離する。

## 5 入口caseと失われ得る保証の引渡し

| ID | 正規旧case／artifact | 個別承認へ渡す差分・責務先 |
|---|---|---|
| A23-T01 | [SA-25](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-25) | guess keyで既存sessionへconsumerを付けない旧対照。R02／03・C07の不在／引数拒否は仕様変更で、同じ旧private照合の回復には数えない。AP01／02／03／05 |
| A23-T02 | [SA-26](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-26)・[ND-30](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-30) | 旧一度取得と二度目拒否から、最初からexport／登録本体なしへの変更。module取得順・旧runtime class非露出のassertionごとに処遇を結ぶ。AP02／05 |
| A23-T03 | [ACK-34](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-34)・[ACK-35](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-35)・[ACK-36](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-36) | consumer取得／既存session採用拒否・static verifier置換・実bind成功偽装の旧境界。外部hookを消しても通常初期source結合・Permitが必要。AP02／03、未代替assertionはAP01、旧試験処遇はAP05 |
| A23-T04 | [CR04](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#cr04) | 観測receiverをguess constructor keyで取得しない旧対照。R03で観測callbackを切ることと元実field／guard／時刻owner保証を区別。AP01／02／03／05 |
| A23-T05 | [FR-01](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#o-fr-01)〜[FR-06](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#o-fr-06) | 228行とは別索引。caller-built fake受付・method／bytes／観測schemaと一度take等。全件をexport不在1件へ縮約せず、残す純粋保証・意図的廃止・未代替を各旧assertionへ対応付ける。AP02／03／05 |
| A23-T06 | GT04〜07／AD01〜04、PK01〜03・B-03のFX03〜06 | 入口7行だけで影響全体を完了にしない。private ack・実class連続性・projection／O／handoff・旧ND単体のimport依存、配布fake同梱期待も別artifactへ引渡す。通常GT01／02・SP25を削除候補に含めない |

この表は入口7行＋FR等への責務索引で、未照合assertionの個別レビュー完了ではない。初稿基準HEADの[AP01残差台帳draft-0.5](BEST_PRACTICE_RELEASE_AP01_INDIVIDUAL_APPROVAL_RESIDUAL_LEDGER.md)では閉鎖laneの未レビュー22行・入口未個別照合3行、別gateのUN62が残っていた。旧分類・過去実行結果・個別承認を本書で変更しない。文書対応141という数も移行成功数・保証回復数ではない。

基準`b1b594c`の[入口7件のAP02／03／05個別判断引渡し draft-0.1](BEST_PRACTICE_RELEASE_AP02_AP03_AP05_ENTRY_DECISION_HANDOFF.md)でT01〜04の7件を個別に結び、AP05の元assertion・候補artifactの処遇へ渡した。残差台帳draft-0.14では入口7件の文書照合が揃い、別索引FR6と別gate UN62は従来どおり。T05／06・公開判定の完了ではなく、C05／07の選択、Rの撤去承認、旧試験切替は開始しない。

## 6 将来の受入証拠と停止条件

ここに挙げる実行・故障注入・設定変更は今回行わず、実施前の別承認を要する。元期限は緩めない。

| ID | 固定する受入条件 | 失敗／未確認時の扱い |
|---|---|---|
| A23-V01 | 同revisionの撤去候補R01〜08を定義・参照・JS／宣言／map・static／reexport／dynamic edgeに対応付け、本番許可依存と禁止閉包を別表へ固定 | 未解決動的edge・共有writer・所有不明slotはUnknown／停止。名前の不在だけで合格しない |
| A23-V02 | PのK01〜06正対照。空出力buildと実tarball内の通常import・source／Permit／worker／省略時summaryを確認 | 必要runtime kernel欠落なら失敗。起動不能をfriend不在成功にしない。全体通常並列・終了確認はAP06の別gate |
| A23-V03 | C02〜05の型／JS入力matrix、key存在・accessor非実行・複合不正の優先順、同期throwとPromise観測、拒否前後のP非干渉 | C05／07等の仕様未選択・生成点観測不足なら副作用前拒否を主張せず停止。旧期待値を弱めない |
| A23-V04 | source第3引数・2取得口・claimの型／実体不在とcallback不実行、通常初期sourceの同owner binding・停止／closeを対で確認 | 第3引数の受付仕様が未選択のまま型削除だけでJS拒否とみなす、新installerで代替する場合は不合格。明示undefined等の扱いはC07の承認済み仕様と照合する |
| A23-V05 | B-03のP/U/D/I/H区分、FA01〜24／NC01〜08、PK01〜03の旧fixtureと新artifact、元case／故障位置／assertion／残差を個別に記録 | LM03・専用build・無bridge移行・UN62の保証不足、AP01／04／05未承認を残し、Pのprivate保証回復へ加算しない |
| A23-V06 | EF3-N01〜09とB-03の負対照。alias／shim／動的復活、stale JS／宣言／map、fake同梱／受付復活、必要kernel欠落を各独立変異で検出 | 正常対照0・各変異で意図した理由の非0を分離。単なるimport失敗・検査未起動でkillと数えない |

停止／失敗時は「撤去前の旧仕様と旧試験を保持して再設計」が基本で、未確認を消すためのskip・期待値変更・deadline緩和を行わない。承認後の候補patchにも失敗位置・所有者・未確認resource／custody・最初の診断を引き継ぐ。release notesの非提供説明を、通常経路の責務放棄やcleanup confirmedの代用にしない。

## 7 個別承認票と実施順（全票未承認）

| ID | 判断する範囲 | 未承認／未確定事項と前提 |
|---|---|---|
| A23-D01 | AP02：R01〜03の取得／登録／callback閉包撤去 | 対象revision・全参照・固定root内で残す結合、T01〜05の失われるassertionを固定。実施承認者・日付・対象patchは未記入 |
| A23-D02 | AP02：R04〜08のfake実行・module依存・artifact分離 | LM03／bridge分離とB-03の保証不足を解消または該当APへ差分提示。新friend／同一台帳共有による救済は不可 |
| A23-D03 | AP03：C01〜04のsynthetic overload廃止・同期invalid_input・優先順 | 正常prepared Promiseを失う範囲、型／deep import利用者影響とrelease notesを提示。candidate仕様の受容は未承認 |
| A23-D04 | AP03：C05の継承／Proxy／prototypeとC07のJS第3引数 | 詳細仕様は未選択。明示undefined等のvariant、拒否点と副作用観測を固定してから承認。勝手にstrict化・黙認へ寄せない |
| A23-D05 | AP01／04／05との接続 | 非提供と保証低下、rejectとunknown／withheld、旧case削除と入口不在検査への仕様変更を別票にする。通常K保証への影響不明ならリリース停止 |
| A23-D06 | 実施・検証・配布の順序 | 上記の仕様／残差承認とは別に、対象patchの実装・旧試験切替・build変更／process対照を承認後に実施。AP06の版／最終候補検証／公開はさらに別承認 |

各票は「基準revision／対象patch・影響case／artifact・旧assertion・提案する変更／失う保証・維持K条件・未確認／残差owner・回復条件・検証結果・承認者／日付／除外条件」を必須欄とする。現在は承認者・日付・決定・対象patch・実施結果すべて未記入で、文書やコミットの存在を承認としない。

順序は、(1) T01〜06と残差台帳を使って旧assertion／閉包利用の対応を確定、(2) D03／04で入力・例外・引数仕様を選択する材料を揃える、(3) D01／02とAP01／04／05を個別審査、(4) 別承認後にEF-03C／D・B-03の実装／切替／正負対照、(5) 候補commitの最終検証とAP06、とする。準備を併行してもgateを飛ばさない。

## 8 今回の静的確認範囲

基準HEADでsourceの取得／slot／static登録、2つのmodule評価時取得、synthetic有無の返却分岐とdescriptor判定、source第3引数、通常client／adapterの生成、private composition維持試験、PK01／02の現同梱期待・fixture呼出しを読んだ。package／tsconfigはテキストだけを確認し、設定評価・製品import・friend取得をしない。名前検索は直接参照確認で、完全な推移閉包・外部利用者調査・実tarballの不在証明ではない。

確認対象は本書と親2MDのリンク・表・固定ID・未承認欄・差分範囲。旧case・試験結果・version設定・CHANGELOGは変更しない。今回の記録をbuild／test／pack成功、撤去済み、保証回復、公開可の実績へ加算しない。実施結果は未実施のまま保持する。

2026-11-19の静的確認：本書とAP01／保証回復レビューの3MDについて表14・ローカルlink87・anchor34、本書の固定46行ID（E6／R8／K6／C8／T6／V6／D6）を照合した。入口7旧case・別索引FR6と、残差台帳draft-0.5の閉鎖lane未レビュー22／入口未照合3／別gate UN62の区別、AP01〜06未承認・C05／C07未選択を保持した。sourceの2取得口・slot／登録・callback、第3引数、descriptor存在判定と同期／Promise分岐、通常生成・省略時P期待値を静的に確認した。ローカル参照・表列数・末尾改行・差分空白を確認し、tracked差分は親2MD、新規は本書1MD、stage0、製品・試験・設定変更0だった。

親参照の初回patchに別文書の見出しを誤って含めたため適用前に停止した。対象本文を再確認し、該当箇所だけのpatchへ訂正した。製品の不具合・試験失敗ではなく、未承認条件や元sourceは変更していない。製品module import・試験再実行・build／pack・設定評価・発行・コミット・Pushは行っていない。
