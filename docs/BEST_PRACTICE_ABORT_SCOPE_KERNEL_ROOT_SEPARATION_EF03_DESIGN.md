# AU-BR-006 EF-03：共通kernel・本番／開発root分離・fake friend撤去

Version: br006-kernel-root-separation-ef03-draft-0.14 / Date: 2026-11-01。
Status: **EF-03A、EF-03B B-01／B-02-01〜03を限定実装。開発同reader cleanup／source受理とRC-01／02のrelease純粋値契約・比較を追加し、全case／release判断のsource移行・ビルド設定変更・friend撤去・旧試験置換は未実施。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実接続・実通信・実機操作・設定変更・Pushは行わない。**

基準：`e6f9abc`（EF-02後のrun停止／construction診断分離）、[親設計§7〜§13](BEST_PRACTICE_ABORT_SCOPE_EARLY_DIAGNOSTIC_FRIEND_SEPARATION_DESIGN.md)、[ND設計§13](BEST_PRACTICE_ABORT_SCOPE_NATIVE_STATUS_DIAGNOSTIC_DESIGN.md)。配置・型名・build手順は提案であり、新しい公開APIや承認済み本番bindingではない。

## 1 現在の閉包と撤去対象

| 現在の位置 | 現状 | EF-03の処置 |
|---|---|---|
| `bounded-read.ts`のSA-02／ND-03 friend | export取得関数・module保存slot・static登録・private runner・fake driver型が同梱 | 宣言だけでなく実体・登録・専用branchを削除。別名shimも残さない |
| 同classの`prepareNewReviewComposition` | 省略時のconstructor-bound summaryと、`synthetic_io`の非同期prepared summaryが同居 | 省略時の固定非実行経路を維持。synthetic overload・入力受付・pin・runner・summary型を撤去 |
| `review-composition-fake-io.ts` | 配布runtimeからimportされ同梱 | 開発rootへ移す。配布JS／宣言／mapに残さない |
| `bounded-source.ts`の`CompositionSourceConstruction` | optionalなcallback集合・capture／takeStatusと公開claim helper経由でprivate consumerを渡す | fake orchestration用途を開発assemblyへ移す。通常sourceのconstructorに任意capture／consumer指定を残さない |
| `claimPrivateCompositionSource`とstatic登録 | sourceから実session private状態へ入る生成key照合 | callback branchと対で依存を切る。必要な本番source同一性検査は固定root内で再構成し、公開installerへ置換しない |
| `abort-scope-evidence-source-status-probe`／`native-diagnostic` | 非同梱だが上記friendをimport時に取得 | 開発rootから自分の新規assemblyを生成。配布classへのfriend importを廃止 |

参照：[session](../src/servicenow/bounded-read.ts)、[source](../src/review/bounded-source.ts)、[fake I/O](../src/servicenow/review-composition-fake-io.ts)。EF-03完了前はこの表を撤去実績と読まない。

`BoundedReadSession.create`／直接new／通常のbounded取得・0.2／0.3 JSON・worker経路は維持する。既存`BoundedReadOptions.fetch`は通常HTTP境界の既存依存注入であり、今回のfake orchestration friendと混同して無断削除しない。ただしfetch指定だけで正式証拠の真正性が証明されるとは扱わない。将来の実認証／URL／ReleasePermit bindingは別承認。

## 2 分離単位と依存方向

| 層（配置名は案） | 保持するもの | 外へ出さないもの |
|---|---|---|
| 共通kernel：`src/servicenow/review-kernel/` | 純粋なconstruction状態、固定理由写像、claim遷移、bounded会計／source検査の本番必要部分 | 実session lookup、共有登録singleton、fake flag、fault selector、任意driver orchestration |
| 本番root：既存`bounded-read.ts`／`bounded-source.ts` | 同class constructor、認証snapshot、元clock、admission、実handle、固定停止・解放、通常source生成 | private writer／lease／ownerの外部取得・交換口、test rootへのimport |
| 開発root：`tests/support/review/ef03/` | 独立した新規assembly、注入Response／clock、故障script、非実行summary | 本番sessionの採用、既存本番registryへの登録、正式permit／証拠の発行 |
| 試験：`tests/review/` | ケース、独立oracle、production／developmentの別artifact検査 | test成功数を根拠にした本番brandの同一性主張 |

依存方向は本番root→共通kernel、開発root→共通kernelだけとする。共通kernelから両rootへ戻るimportを禁止する。既存のcanonical budget等の純粋moduleは無条件に移動せず、依存閉包を調べて再利用する。ND-02のnative orchestration等、本番からまだ使わない部品を「共通化」のためだけに配布へ昇格させない。EF-01の合成shellもそのまま本番の証拠にしない。

共有は**実装関数**であり、runの状態や登録台帳の共有ではない。state／WeakMap／claimは各新規生成継続内で確保する。本番のactive／principal admission台帳は本番rootの全instance間で従来どおり共有し上限2を維持する。開発assemblyは別台帳で、本番runの枠・keyを消費／返却しない。純粋kernel factoryをdeep importできても、新しいローカル状態を作れるだけで、既存本番runのportを取得できないことを要求する。

## 3 kernel契約とauthorityの所有

1. kernel creatorは新規状態を作り、その生成呼出しのclosureだけへwriterを返す。既存session・外部seed・登録owner・診断copyを採用する引数を設けない。読み取り用copyは再帰freezeし、再提出からauthorityを復元しない。
2. 本番rootは最初のfieldで純粋construction shellを生成し、EF-02のtry・元clock・入力pin・core→admission→登録ownerの実順序を維持する。callback経由の再入に備える固定停止coordinatorはrootが所有する。class継承やoverrideで本番rootを開発用へ変える方式は採らない。
3. 共通の純粋な検査関数には値を渡せるが、その成功値は正式証拠でない。実source／session／core／leaseの参照検査・token台帳・発行claimは生成rootが所有する。構造一致や同じkernelを使った事実をbrand一致へ昇格させない。
4. sourceの共通部分は固定列schema・release比較・状態遷移に限る。本番sourceは通常のsession GETから得た値を固定経路で扱う。開発assemblyのcapture／terminal consumerは開発root内で閉じ、通常sourceの公開constructorにoptional callback集合を残さない。
5. `prepareNewReviewComposition`の省略時summaryは新規生成・claim・readonly検査・固定closeを維持し、dispatchは0。source生成を固定root内で結合するが、private consumer取得やnative受付を新たに公開しない。`synthetic_io`は未知入力として副作用前に拒否する（削除する開発laneの意図的な互換性変更）。
6. 将来の本番typed transportには固定部品を接続する必要があるが、EF-03で未接続部分をcallback引数・installer・hidden symbol・環境変数で仮開通させない。新native laneは閉鎖を維持する。

kernelが返す可変portは自分が生成した新規状態専用とし、production singletonへ後付け登録するAPIを持たせない。TypeScriptのprivate／非公開exportだけに頼らず、配布JSを直接importした場合も同じ境界を守る。

## 4 停止・診断・cleanupの移行条件

- EF-02のconstruction診断とcommit後のrun診断を分ける。`e6f9abc`の修正を継承し、後段のHTTP失敗・取消をconstruction failureへ戻さない。constructor末尾で発見する事前abortだけはcommit段階の失敗copyとなる。
- first internal reason／公開code、HTTP事実、native cleanup事実、token／claim teardownを別々に保持する。native owner未生成ならnative診断nullでよく、construction copyをnative観測済みへ昇格しない。
- 固定rollbackは継続失効→owner→core→listener→timer→controller→admission→credential参照解除→seal。途中throw／unknownはunconfirmed、他slotの回収を継続し、未取得枠を返さない。二重closeは再解放しない。
- nativeの停止／closeは元cleanup floorまでのreadonly joinを維持する。停止signalだけで即時に成功／完了とせず、release前のcancel／closed事実を用いる。floor到達で元run残時間が正なら上位はupstream_unavailable、canonical期限ならdeadline_exceeded。nativeのcleanup理由は別に残す。
- 同core・元60秒・210試行・既存C/G/P・R予約を維持する。rootを分けるために第二予算・起点・予約を作らない。開発assemblyが本番と同じ会計式を使っても、本番runの実会計を検証したと主張しない。
- factoryの失敗copyの一度回収・破棄、copy確保不能時のnull診断、秘密非出力を維持する。上位caller全体の詳細copy配送はEF-02同様に別課題。

移動したstate・固定slot・claim・copy・解放通知の費目を実装時に列挙し、二重所有／二重計上を確認する。本設計だけでRust work上界や全体受付へ算入しない。可変長trace／ログを製品診断へ追加しない。

## 5 build／配布境界

EF-03の境界は§1の閉包（friend・callback branch・`synthetic_io`・fake I/O・2つの開発probe module）と新設する共通kernel／開発rootに限る。現行の単一`tsconfig.json`は`src`全体を`dist`へ出し、`abort-scope-evidence*`・`r2-*`・`evaluation*`等の既存非同梱moduleは`package.json.files`で除外している。これら無関係なmoduleのbuild構成はEF-03で変えず、本番rootから到達しないことを依存閉包検査で別途確認する。EF-03対象の配布buildは本番rootとその必要kernelだけを入力とし、開発rootは別の専用build出力（例：`.test-build/ef03/`）へ出し、`dist`へは出さない。設定名・出力名は案であり、この作業では作成しない。

`exclude: tests`や`package.json.files`だけを境界の証明にしない。import先は推移的に確認し、再export・barrel・require・dynamic import・型参照・宣言／mapも対象とする。本番から開発root／開発shimへ辿るedgeはbuildまたは配布検査で拒否する。既存workerの固定動的読込等は個別の許可根拠を記録し、解決不能な動的edgeを一括無視しない。

検証は空の生成先でbuildし、offline packの一覧に加え、生成tarballを新規の空directoryへ展開して実体を検査する計画とする。依存の再install／通信やnpm公開は不要。`sourcesContent`に古いfriendが残るmap、古い`.d.ts`、削除済みfake moduleのstale出力も拒否する。pack除外でruntimeの必要importを欠落させた場合も失敗とし、動かないことでfriendが使えない状態を成功にしない。

現行の[canonical梱包検査](../tests/review/package-canonical-budget.mjs)はfake I/O moduleの同梱を期待し、同じscriptから`synthetic_io`付きで配布版`prepareNewReviewComposition`を呼ぶ[compiled ack fixture](../tests/review/fixtures/compiled-private-composition-ack.mjs)も実行する。[status梱包検査](../tests/review/package-http-classification.mjs)はfriendを呼ぶcompiled fixtureを実行する。移行時に前者の同梱期待を非同梱へ反転し、ack fixtureを開発assemblyのcompiled試験へ移す（本番artifact側には`synthetic_io`が副作用前に`invalid_input`となる確認だけを残す）。後者も本番artifact検査と開発assemblyのcompiled試験に分ける必要がある。現行検査の成功をEF-03完了の証拠にはしない。

## 6 試験保証の移行表

| 現行試験群 | 移行先・保証 | 移行で失う／別途必要な保証 |
|---|---|---|
| EF-02 construction transaction／compiled fixture | 本番class・配布artifactで継続。最初のshell、部分失敗、factory回収、run停止との分離 | kernel単体試験で置換不可 |
| 通常bounded source／worker／0.2・0.3・省略時composition summary | 本番classの既存入口で継続。認証固定・予算・停止・固定200・解放 | 新native／status採用の正式bindingは保証外 |
| SA-02／ND-03のprivate friend連続試験 | 新版の開発assembly試験へ移行。同kernelの状態遷移と注入resource、別brandを明記 | **実classのprivate継続との連続保証を失う**。別途固定本番native経路で回復するまで未確認 |
| private composition ack／境界のfault注入 | 開発rootの固定case＋独立oracle。別root token／copy／再入を拒否 | 実class内のfake methodを呼んだ保証は継承しない |
| friend取得が2回目だけ失敗する試験 | 配布artifactにexport／method自体がないことへ変更 | 一度目の取得成功を新仕様に残さない |
| ND-01／02の純粋診断／注入reader単体 | 開発出力で継続。成功件数を本番bindingの件数に加算しない | 本番認証・URL・permit provenanceは未確認のまま |

既存の固定評価セット・過去検証記録は変更しない。新版case／fixtureの対応表に旧ID・新ID・assembly・同一性の差・保留coverage・実行結果を残す。過去版はgit履歴を参照し、実行不能になった旧caseを黙ってskipして全件成功と報告しない。移行対象caseは新rootで実行し、その保証だけを別集計する。実class保証が失われる範囲は明示的な承認待ちであり、承認がなければ分離完了を主張せず設計レビューへ戻す。

## 7 配布物・境界の負の対照（実装時の受入条件）

| ID | 故障を入れる場所／操作 | 期待する失敗と確認点 |
|---|---|---|
| EF3-N01 | 本番rootから開発rootへstatic import／再exportを1辺追加 | build／依存検査が失敗。packで単に落ちるだけでは不足 |
| EF3-N02 | 開発alias・barrel・dynamic import・型参照経由で同edgeを追加 | 解決した閉包で拒否。文字列名変更だけで通らない |
| EF3-N03 | stale distへfake module／旧friend宣言／mapを1つずつ混入 | 空buildとの差分／tarball検査が各々失敗。map内sourceも検査 |
| EF3-N04 | 旧取得関数を別名export、static probe、登録slot、callback受付を復活 | AST／export表／禁止契約検査で失敗。denylist検索だけをoracleにしない |
| EF3-N05 | `synthetic_io` lane／同梱fake I/O依存を復活 | 入力の副作用前拒否またはartifact閉包検査が失敗。data-onlyでも許可しない |
| EF3-N06 | 配布rootだけで旧friendをnamed／namespace／deep importして呼ぶ | 不在を確認。失敗理由が単なる依存欠落でないことを通常import成功と併記 |
| EF3-N07 | runtimeに必要なkernelをtarballから1つ欠落 | 配布rootのimport／通常経路smokeが失敗。fake撤去成功に数えない |
| EF3-N08 | 開発token／claim／copyを本番側の既存公開入力へ再提出 | data schema／private identityで拒否。追加の採用test口を本番に作らない。外国runの枠・状態不変 |
| EF3-N09 | sealed診断・構造copy・別root terminalを開発側の同型consumerへ投入 | lookup前claim消費・再利用拒否・診断保持。成功summaryから実証拠へ昇格0 |

負の対照は検査用の一時artifact／一時source treeだけを変異させ、製品ソース・配布元・実設定へ故障を残さない。各変異に対し検査exitが非0となり、正常対照では0となることを確認する。export表はJS実行時、ASTはJS／宣言、依存閉包はmapを含めて別観点で照合する。単なるgrepで名前がないことを安全性の全証拠にしない。

## 8 実装の分割・承認待ち

1. **EF-03A（限定実装済み、§9）：純粋kernel抽出**。EF-02とrun／construction理由分離を保持し、既存classへ接続。fake rootは撤去していない。writer／singletonの共有は導入しない。
2. **EF-03B（B-01／B-02-01〜03を限定実装）**：[開発rootと試験保証の移行計画draft-0.11](BEST_PRACTICE_ABORT_SCOPE_DEVELOPMENT_ROOT_EF03B_DESIGN.md)。独立生成root・別brand／台帳・固定cleanupを旧試験併存で追加。本番の状態／枠不変を合成確認。[B-02の移行範囲・共通化境界draft-0.10](BEST_PRACTICE_ABORT_SCOPE_DEVELOPMENT_MIGRATION_B02_DESIGN.md)の§7〜9に限定実装、§10に旧case対応表、§11にrelease比較器設計・RC-01構造境界／RC-02純粋比較と非実行draftの参照を記録。全case／release判断のsource移行、開発compiled保証の移行、旧試験の別assembly保証への置換は未実施／承認待ち。
3. **EF-03C：本番friend／callback lane撤去**。§1の閉包をまとめて切り、省略時summaryを維持。`synthetic_io`削除の互換性変更をCHANGELOGに明記。半分撤去して使われないfriend本体を残さない。
4. **EF-03D：空build・tarball・負の対照**。production／developmentのcompiled試験を別実行し、正常・変異双方の検査結果と本番class未確認範囲を記録する。

承認待ち：kernelの最小抽出範囲、source callback branchの移設境界、開発assemblyの別brand化によるcoverage低下、synthetic overload削除、build出力・依存検査の配置。固定本番native接続・正式発行・SA-03／fallback・全体受付・本番cap・実通信は別承認とする。

EF-03Aではnative orchestration／認証／source発行をまとめて共通化しない。限定実装の実績は§9と別の検証記録で分ける。EF-03全体の分離・配布物からの撤去完了を示す記録ではない。

## 9 EF-03A：純粋construction状態と既存classの接続

[construction-state kernel](../src/servicenow/review-kernel/construction-state.ts)へ固定10resourceの状態、固定理由の正規化／公開写像、first reason、commit・copy・sealを抽出した。importは0、factoryは引数なしで自分の新規状態だけを生成する。clock／日時／controller／timer／I/O・session登録・実handle・credentialは持たない。内部3理由は公開internal_review_errorへ写像し、未知の値は読取／文字列化せず固定理由へ正規化する。既存ReadFailureCodeは同じunionの型aliasで維持する。

実session／snapshot／core／lease／owner／sourceの参照、core／sourceのone-shot claimは[既存classのprivate wrapper](../src/servicenow/bounded-read.ts)に残す。参照検査成功後にkernelへ渡すrecordBindingは履歴ラベルだけであり、kernel自身は実bindingを証明しない。deep importで同じラベルを作っても既存session・登録台帳へ採用される口はない。failure WeakMapとfactory回収、admission、元clock、固定rollback、停止coordinatorもroot所有のまま。

class最初のfieldはwrapper→純粋kernel生成だけを行う。構築中／事前abortの理由だけをconstruction側に書き、commit後の取消・HTTP失敗はrun側へ残す既存分離を維持した。解除throwは従来どおりconstruction teardownにも残る。resource受領・解除の会計／callbackはkernelへ移していないため、C/G/P/Rの更新所有者は増えない。

費目：kernel状態用resource10slot・固定reason1slot・binding履歴2bool・固定purpose3項目を保持する。private wrapperのclaim2bool／参照束は従来のroot所有で、委譲用の固定writer objectが1つ、instanceごとのmethod closureが差分で4つ増える。copyごとの固定10slot copy・map用一時配列等は従来と同様であり、可変長traceは追加しない。byte layout／Rust work単位や全体受付用の必要量は未導出のままとする。

[kernel合成試験](../tests/review/construction-kernel.test.ts)、既存EF-02／ND-03回帰、[compiled fixture](../tests/review/fixtures/compiled-construction-kernel.mjs)と[検証記録](E2E_BEST_PRACTICE_CONSTRUCTION_KERNEL_EF03A_2026-11-01.md)を参照。現行pack検査へkernel4artifactの同梱・compiled JSに依存importがないことを確認する限定検査を追加した。EF3-N01〜N09の全変異試験、tarball展開検査、別assembly移行、fake friend撤去は未実施である。

draft-0.2のレビュー修正：canonical梱包検査が`synthetic_io`付きのcompiled ack fixtureも実行しており、EF-03Cの拒否で失敗するため、開発assemblyへの移設を§5に明記した。§5の配布build入力をEF-03対象の閉包に限定し、既存非同梱moduleのbuild構成は変えないことを明記した。

draft-0.4のレビュー修正：EF-03Aのcompiled fixtureでseal済み・無関係のローカル状態へ`fail`していた空の確認を、未seal・resource保持中のローカル状態をfail／sealしても実sessionのconstruction copyが不変であることの比較へ置き換えた。上位設計からの版数リンクも更新した。
