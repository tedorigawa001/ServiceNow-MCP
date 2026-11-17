# JR-B 先行runtime・失敗保持先とPromise固定pin・観測前提の接続差分設計

Version: native-diagnostic-jrb-runtime-pin-delta-draft-0.1 / Date: 2026-11-17。
Status: 詳細設計のみ。基準HEADは`2db2da5`。[JoinRuntime設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JOIN_RUNTIME_GENERATION_DESIGN.md)§2〜6・8・10・12と[構築・Join設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_CONSTRUCTION_JOIN_DELTA_DESIGN.md)§2・5〜7への差分である。JR-Aの型・claim・資格検査と同期失効の試験補強は既存実装であり、本書のruntime実体・pin・観測・失敗終端は未実装である。

正式発行口／新LM03／C実行入口／body起動は閉鎖、全体受付無効、通常経路未切替、Unknown、VM／監視／telemetry調査保留、LOAD6／LOAD7選択・AP01〜06未承認を維持する。今回は本書と親2文書だけを更新する。実装・製品moduleのimport／実行・Promise生成・観測登録・試験再実行・build／pack・private公開・dispatch・実接続・実通信・実機操作・設定変更・コミット・Pushは行わない。

## 1 現行の事実と差分の限界

| 対象 | 基準HEADの事実 | 本差分で具体化するもの |
|---|---|---|
| CP00の先行保持 | [旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)のRecoveryAnchorにrun／cleanup各1個のRoleGenerationSlotがあり、pending／publishedはliteral null | role slotのpendingだけを同runtimeの主保持先にする。publishedはJR-Bでもnull |
| JR-A型 | JoinRuntimeは型だけ。observerAckはあるが登録claim・登録中・観測結果・ack未確認の独立履歴はない | runtime shellと観測用の固定fieldを先行確保し、意味を分離する。現在の型をassertionで実体化しない |
| 拒否 | slot fault・phase→元primary→同期revoked。upper通知・終端は未接続 | この先行順を維持し、通知不能でもprefixと参照を失わない失敗入口へつなぐ |
| Pの捕捉 | moduleでP／promiseThen等を捕捉している | 同じP／thenを基点にprototype・constructor・speciesと反射操作の固定条件を定める。第二のPromise constructorを導入しない |
| 旧observe | Proxy／native Promise／prototype／own constructor等を確認した後、別のPを生成して観測を包む | 新生成validatorへ流用しない。新観測は同workへの一度の登録と最大1個の派生ackに限定 |
| 旧実行 | runWork／record.cleanupWorkのexecutorがenqueueする | 旧処理は変更しない。新旧workを同じ実runへ二重割当てしない |

JR-Aの[記録](E2E_BEST_PRACTICE_NATIVE_JOIN_GENERATION_JRA_2026-11-17.md)にある同期revokedの12番目の変異を保持する。phase値の成功、既存全体回帰、recordを使う別assemblyのfake試験を、新runtime・pinの保証へ加算しない。

## 2 唯一の保持先・同owner結合

主保持先は`RecoveryAnchor.runGeneration.pending`／`cleanupGeneration.pending`とする。これは設計上の選択で、今回は型を変更しない。旧`RecoveryAnchor.runPending`／`cleanupPending`は未接続のnull fieldのまま残し、第二のmutable writerや同runtimeの独立cacheにはしない。将来削除・読取りprojectionへ変える場合も別差分とする。親設計にある「pending」は以下のrole slotの主保持先を指す。

| ID | 保持対象・生成元 | 固定field・参照の条件 |
|---|---|---|
| RH01 | 同CP00のRoleGenerationSlot | readonly role、非返却claim、最後に保持した位置、最初のfaultとfault位置、pending、published=null。runtime未保持の失敗もここへ記録する |
| RH02 | JoinRuntimeShell | 同anchor／root／seed／roleの実参照、phase、保持prefix、executor履歴、identity候補、context候補、pin、candidate、work、settler、観測履歴、settle履歴、固定fault。初期参照はnull／未取得 |
| RH03 | cleanup context | 同closureのcurrent recordと同anchorを先に照合。shellへ実参照を直接保持してからcontext objectを生成・同shellへ保持する。callerやpublic診断から採用しない |
| RH04 | JoinIdentity | 同shellに保持したcontextと同anchor／root／seed／role。候補を同shellへ保持してからshallow freeze・全postを行う。run contextはnull |
| RH05 | OwnerPromisePin | 同shell／identityと同module基準へのreadonly参照。候補をshellへ保持してから確認・freezeする。可変のpin状態と最初のpin失敗位置はshell側へ先行配置し、freezeしたpinへ後書きしない。owner間で移譲・再利用しない |
| RH06 | candidate／work | constructorから戻ったunknownをcandidateへ直ちに保持。検査済みworkは同参照のaliasだけ。work不足を別Promiseで補わない |
| RH07 | executor・role別settler | 固定executor closureを同shellへ先行保持。settlerは同executorが直接記録した関数だけ。runはreject→resolve、cleanupはresolveだけでreject=null。形・名前・lengthから発行元を認定しない |
| RH08 | 観測slot | 固定fulfilled／rejected closureと2要素の引数tuple、登録claim、登録状態、busy、work観測結果、callback異常、ack候補／確認済みack。callbackとtupleはPromise生成前に直接保持し、登録開始後に保持用objectを作らない |
| RH09 | 失敗終端slot | 通知試行、copy試行、settle claim／呼出し成否、work実終端の観測、未確認責務を別の有限値にする。先行root primaryを複製・上書きする第二ownerではない |

shell自体を割り当てられなければRH01のclaim・位置・faultだけが保持先である。shellを作れたらpendingへ直ちに保持し、identity／context／pinの生成やfreezeより前に到達可能にする。それ以降の失敗でshellをnullへ戻さない。部分生成物は同shellの固定fieldへ直接代入してから次操作へ進み、未保持pairやfreeze返却待ちの一時objectへauthorityを置かない。

先行shellはidentity必須の既存JoinRuntime型とは別の初期variantとする。shellの準備状態はshell／identity_ready／pin_ready／failed_retainedの有限値で、identityとpinの不在をnullとして明示する。同じobjectを保持したまま実fieldを確認し、identityとpinが揃ってからbuilding variantへ進む。非null assertionや別完成objectへの差替えで準備を省略しない。RoleGenerationSlotの将来形はempty／claimed_unheld／building／checked／failed_retainedまでとし、published variantはJR-Bで作らない。位置には既存claimedに加えてruntime／context／identity／pin／handlers／executor／reject／resolve／candidate／checkedを固定列挙し、最後の保持位置と最初の失敗位置を混ぜない。これらは未実装の型差分である。

照合はcanonical anchor／root／seed／role slot／pending実参照が先で、その後に自分の固定dataだけを読む。同値copy・foreign・Proxyのpropertyを読まない。元EmptyJoinCell／ResourceDutyのnull fieldを実recordへ書き換えず、既存primary／revoked／sealed／started／current／sample履歴も増やさない。

identity／context／確認済みpinのdataはshallow freeze対象だが、runtimeと観測の原始fieldは固定のprivate writerが更新するためfreezeしない。observerが書くfieldを途中でaccessor化・readonly化する設計にはしない。freeze自体の失敗も取得済み候補を保持した失敗である。

## 3 module基準とowner pinの生成・信頼境界

基準realmのP／thenは既存moduleの捕捉を再利用する。将来追加するprototype／descriptor／反射・predicateの基準も同moduleの固定初期化位置で一度だけ捕捉し、constructor引数やraw入力から期待値を受けない。per-ownerに現在のglobal値を再採取して「新しい正規値」にしない。共有するのはこの基準dataだけで、owner pin・生成claim・観測claim・pendingは共有しない。

module初期化前にrealm全体が既に改変されていた場合、現在値の自己比較・descriptorの形・関数の文字列だけで真正性を証明できたとはしない。基準捕捉は管理された同realmという前提に依存する。その前提を成立させられない配置ではJR-Bを接続しない。module基準の捕捉前／途中に失敗してimport自体が成立しない場合は、owner未成立・診断未取得のbootstrap限界としてUnknownを残す。別realm・現在globalへのfallbackやmodule再初期化で救済しない。

| ID | 固定pinの対象 | 捕捉とlive確認の契約 |
|---|---|---|
| PI01 | Pと同Promise prototype | 既存捕捉Pとそのprototypeの正規実参照。Pのprototype propertyをgetter経由で再取得せず、own data descriptorのvalue・flagsまで照合 |
| PI02 | prototypeのconstructor | own data descriptorでvalueが同P。accessor化・削除・別constructor・flags変更を拒否。候補自身のown constructorも許可しない |
| PI03 | prototypeのthen | own data descriptorで既存捕捉promiseThenと同参照・同flags。candidate.thenを取得・呼出ししない |
| PI04 | PのSymbol.species | 同基準のown accessor descriptorのget／set・flagsを照合。確認中にgetterを実行しない。getterなし／別getter／data化／継承への変更を拒否 |
| PI05 | 必要なprototype連鎖 | PとPromise prototypeの基準の直接prototypeを実参照照合し、未確認の継承経路を正規条件として補わない。graph全体や任意realmの安全性を保証しない |
| PI06 | 反射・predicate・呼出し | own descriptor／own property／prototype確認、freeze／isFrozen、Reflect.apply、node:utilのisProxy／isPromise等は基準で直接捕捉した固定関数を使用する。検査のためにcaller hookを呼ばない |
| PI07 | ownerとの結合・寿命 | 同shell／identityと同module基準への実参照。pinは未準備→確認中→readyまたはrejectedで一度だけ。失敗後の基準差替え・再pin・別owner採用は禁止 |

descriptorの比較はdata／accessorの別、valueまたはget／setの実参照、writable／enumerable／configurableを含む。期待descriptorは外部に渡さず、固定fieldへ分解して保持する。live descriptor取得が返す一時dataは順番に扱い、可変traceへ蓄積しない。必要操作と一時保持数を実装時のsource／compiledで列挙できなければ受付しない。

新JR-Bの不変checkerは、既存sameControlOwnerと同じcanonical参照・全readonly fieldを、捕捉済み操作で確認する。旧checkerはliveなObject.isFrozen等を使っているため、その呼出しだけで新しい固定pin契約を満たしたとはしない。旧execute／cleanの挙動は維持し、新生成同期群へ未固定のglobal lookupを持ち込む・旧checkerを無条件trueへ緩める変更を禁止する。必要な最小抽出を行う場合も、旧対照と新pin対照をそれぞれ維持する。

pin readyは一回の生成が終了まで安全という免許ではない。constructor直前、candidate確認、then登録直前・復帰直後に必要なlive条件を再確認し、ずれは同slotの制御異常として停止する。新しいbudget.read／clock／bridge／schedulerは呼ばず、これを元taskの期限検査の代替にもしない。旧observeがPI04まで検証済みと記述することはしない。

## 4 生成成功と「安全に観測できる候補」の分離

生成成功には同owner・正規claim／prefix、executor一度入場・正常退出、role別settler、同candidate／work、観測登録の全確認が必要である。一方、executor内の故障等で候補がrejectしていても、同owner由来のcandidateが安全な同realm native Promiseでありpin条件を満たせば、失敗保持のための拒否観測を許す。生成成功ではないという理由だけで観測を省略しない。

安全性の検査は、同pendingとcandidateへの実参照を最初に確認し、捕捉済みpredicateでProxyを拒否→native Promise判定→同prototype→own constructorなし→PI条件の順とする。unknownのthen／constructor getterやinstanceof・thenable同化は使わない。別owner由来candidateを同prototypeという理由で採用せず、同生成呼出しから保持した候補という関係も必要である。

この観測資格は新規run資格ではない。自ownerの同期revoked・先行理由・failed_retainedは維持したまま、取得済みの安全な候補の観測と限定終端だけを可能にする。foreign照合失敗やpin不成立を迂回する口ではなく、別workの生成・正常受理・private公開は許可しない。

## 5 固定生成scheduleと保持確定点

| ID | 固定操作 | 保持・停止境界 |
|---|---|---|
| RS01 | 同ownerとJR-Aのrole別新規資格を照合し、元started／生成claimを消費 | 同期拒否のprimary／revokedを維持。runと停止下cleanupを混同しない。claim消費前の拒否で成功資格を補わない |
| RS02 | 初期JoinRuntimeShellを同role pendingへ直接保持 | 次のcontext／identity／pin割当て・freeze・constructorより前。保持不能ならRH01のclaimed_unheld失敗だけを残す |
| RS03 | 同context候補→同identity候補を順に保持・確認・shallow freeze | 正規参照を失敗prefixにも残す。runはrecordなし、cleanupは同current／anchorのみ |
| RS04 | 同OwnerPromisePin候補を保持し、PI01〜07を確認 | rejectedならPromise生成0。期待値の再採取・第二pin生成で救済しない |
| RS05 | 固定executor・2観測closure・引数tupleを順に直接保持／確認→生成中専用post→同Pで一度だけconstructor呼出し | 保持前／途中の割当て失敗ならPromise生成0。tupleは保持後にfreezeする。claim済みstarted=trueを新規資格として再消費せず、run／cleanup別停止条件を維持。caller callback／await／sample／native 0 |
| RS06 | executor入場履歴→run reject／resolveまたはcleanup resolveを直接記録→退出履歴 | executorはqueue・正常settle・外部通知を呼ばない。半捕捉・二重入場・異常退出も保持し、正常退出と補完しない |
| RS07 | constructor復帰参照をcandidateへ即保持→観測安全性を確認 | 既に失敗していても候補を消さない。失敗候補の観測資格と生成成功を分ける。constructor未復帰なら候補を推定しない |
| RS08 | 安全な同candidateへのwork alias→一度の拒否観測登録とack保持 | workは同候補だけ。登録claim／busyを先に更新し、ack返却参照は検査より前に保持する |
| RS09 | 復帰後の同owner／pin／prefix／登録履歴・全fieldを確認 | 全条件正常ならprivate pending内のcheckedまで。失敗なら同prefixのfailed_retained。publishedはnull、dispatch／entry=false |
| RS10 | 合成試験終了時は固定abort／失敗終端へ一度だけ進める | 未dispatchの正常workも無期限pendingで放置しない。終端を実装・検証できなければRS05以降を接続しない |

RS02以降で「最後に保持したprefix」と「最初のfault位置」を別にする。例えばexecutor異常後にconstructorがcandidateを返した場合、先行fault位置はexecutorのまま、取得済みprefixはcandidate保持まで進む。故障後に追加の通常処理を進める意味ではなく、既に返却された参照を失わないための記録である。

RS05の生成中postはJR-Aの未使用slot checkerと別にする。claim=true・同pending・所定prefixという状態を検査し、JR-Aのbeginを二度呼ばない。連続同期群の途中に任意callback／await／通知／外部依存を挟まない。通常経路は旧workのまま、将来の試験用継続もscratch側だけで導出し、新runtimeの製品受付口を作らない。

## 6 一度限りの拒否観測とackの境界

観測状態は未開始／登録中／登録確認済み／登録失敗とし、workの未観測／fulfilled／rejected、callback異常、ackの未取得／候補保持／確認済みとは別にする。observing busyは登録呼出し中だけで、finallyはbusyだけを解除し、claim・失敗・取得参照を戻さない。

登録claim→busy=true→必要live条件の最終照合→捕捉済みthenを同workと先行引数tupleに一度適用→ack候補を直保持→同参照／pin／登録post→busy=falseの固定順を使う。ここで新しいcallbackや引数配列を割り当てない。claim後の中断も再登録しない。PI04の確認はgetter実行を伴わず、登録で使用される既知の基準getter以外の任意getterを許す条件にはしない。

callbackは当該shellを直接捕捉し、引数の値・理由本文を保存・出力せず、固定の原始観測だけを書いてundefinedで復帰する。通知・copy・setter・thenable返却・throw・別observer登録をしない。busy中の同期callback、二度目のcallback、誤owner／prefixの観測は固定異常として残し、成功や再試行へ変えない。失敗保持後の正規後着callbackは観測事実だけを記録でき、fault・claim・公開状態を戻せない。

同then適用から返る派生ackは最大1個で、第二execution workではない。ack候補と検査済みackも同objectのaliasとする。ackを観測するために更にthenを付けて列を増やさない。正常callbackを非throw・非同化に限定してackの予期しないrejectを避けるが、callback実行や登録正常復帰だけでack実終端を確認したとはしない。runtime上の未確認と、将来のscratch試験が安全に保持したackを有限にawaitして確認することは別保証である。

登録後throw／復帰参照の喪失では、workにhandlerが付いた可能性とack未取得を分けて保持する。再登録・別observer・process全体のunhandledRejection listener・新timerで見かけの成功へ戻さない。安全な観測が成立しない候補を無理にawaitせず、未確認をUnknownにする。任意intrinsic破壊やOOM下でも全rejectionを抑制できるという保証はしない。

## 7 失敗時の保持と後段への受渡し

| ID | 失敗位置 | 保持・後段へ渡す責務 |
|---|---|---|
| RF01 | 資格／同一性拒否 | 自roleの最初のfault・位置、元primary・同期revoked。foreignへの書込み0。未消費claimでも再利用不可 |
| RF02 | claim後・shell未保持 | RH01の非返却claimとclaimed_unheld位置。runtime／workなしを推定成功へ変えず、二度目の割当て0 |
| RF03 | context／identity／pin／固定closure・tupleの部分生成・確認失敗 | 同pendingと保持済み候補・実record参照。失敗freezeを取り消すためのclone／再生成0、Promise生成0 |
| RF04 | constructor／executor異常・半pair | 同shell、実際のsettler、executor履歴。constructorが返ればcandidateを保持し、安全な拒否観測だけを検討する |
| RF05 | candidate不適格・pin drift | 同unknown candidateと先行fault。then getter／同化／未知workへのjoinをしない。実終端未確認を保持する |
| RF06 | 観測登録・ack保持／post失敗 | 同work・claim・登録prefix・ack候補・callback観測を保持。再登録／第二ack／公開0 |
| RF07 | 通知／copy／settler呼出し失敗 | 元理由・実計数・HTTP／native factsを保持。試行履歴と実終端を分離し、copy／settleを再試行しない |
| RF08 | close／停止／後着callback | 新規run・通常利用は同期失効。既存安全候補の観測と同recordの必要read-only責務を別扱いにし、slot clear／架空の解放creditを付けない |

失敗入口はfault位置・元primary・revokedを原始値へ先に固定してから、生成同期群の外で既存の固定通知・role別終端へ渡す。ローカル不正はinvalid_state、混入はevidence_binding_mismatch、pin／constructor／観測の制御異常はinternal_review_errorとし、先行HTTP／取消／期限を上書きしない。runはstop、cleanupはcleanup stageを維持する。新しいbridge call siteや任意通知portは作らない。

後段のrun終端は同ownerの検証済み実snapshotをresolveし、copy不能なら保持済みrejectを一度だけ使う。cleanupは制御異常を記録して同resolve(undefined)へ進めるが、void終端はcleanup confirmedではない。必要settlerや安全な観測が不足する場合は固定拒否とprivate終端未確認を分け、別Promise・CPの0計数copy・正常snapshot fallbackで代替しない。settle claimは呼出し前、実終端は観測後である。

このrole別settle方針は、同workがまだpendingで安全なsettlerを保持する場合に限る。executor異常等で既にrejectした候補は、resolve(undefined)や後続rejectを呼んで正常終端へ修復したとは報告しない。観測済みrejectedを実際の失敗終端として保持し、cleanup confirmedやfulfilledのcreditを付けず、第二workも作らない。逆に、既に実終端を観測していればsettler不足だけで未終端へ戻さない。限定終端の未試行／呼出し済み／既終端による省略と、実際のfulfilled／rejected／未確認を分ける。

これは失敗終端の受渡し条件であり、本書で終端helperや正常runのseal・copy cacheを実装／公開する許可ではない。特にcleanup contextを持つ失敗をfailConstructionへ戻して正常ownerをfailure facadeに差し替えない。token退役、reader操作、driver close／bytes dispose、session close／予約返却は別責務のまま残す。

## 8 有限保持・退役・費目

各roleの主保持slot 1、runtime shell 1、cleanup context候補最大1、identity候補1、owner pin候補1、固定executor／2観測closureの計3関数objectと引数tuple 1、candidate／workの同参照1組、run settler 2参照またはcleanup 1参照、観測ackの同参照最大1組と固定scalarだけを持つ。確認済みidentity／context／pinは各候補へのaliasで、成功時にcloneを増やさない。module基準は共有dataで、owner数分の新基準を作らない。例外・診断の本文や可変履歴は保持しない。

これは論理object／参照の個数であり、Promise内部・閉包・native resource・反射一時objectを含む実backing byte上限や完全回収の証明ではない。生成・検査・観測・失敗通知・copyの費用所有は同run ownerに残し、native C/G/P/Rの成功creditや別予算を追加しない。新しいsample・起点・floor・10秒／60秒を作らず、元task／cleanupの期限検査は元の位置で別途行う。

producer退出、同workの実終端、observer callbackの退出、ackと参照の責務退役を確認できるまではpendingと候補を保持する。診断seal・work settleの呼出し・busy=false・GCを最終discardと数えない。確認手段のないackや未知candidateの退役、外側custody／最終discardは別gate・Unknownであり、JR-Bで全解放を宣言しない。

## 9 将来の独立合成受入条件

次表は将来の受入条件で、今回は実行しない。JSの固定生成順・参照関係と原始イベントから独立oracleを作り、実装の返却summaryを期待値へcopyしない。新product friendやconstructor／descriptor／observerの注入受付は作らず、故障はscratch copy内の固定位置に限定する。

| ID | 正負対照 | 受入条件 |
|---|---|---|
| RT01 | JR-Aの資格・混入・同期失効 | 既存27／32／121と12変異を保持。root／slot／seed／context／runtime／pin copy・foreign・revoked Proxyを追加し、foreign hook／書込み0 |
| RT02 | claim→shell保持→context／identity／pin／固定closure・tupleの各割当て・freeze・post | 全prefixでclaim非返却、保持済み参照・先行fault・同期revokedを確認。Promise生成前の準備失敗ではwork 0、未取得を補わず公開／dispatch 0 |
| RT03 | run／cleanup role・contextと停止 | 同current cleanup正対照と別record拒否を分離。停止したrunはPromise生成0、必要read-only観測を停止理由だけで拒否しない |
| RT04 | PI01〜07のdescriptor／prototype／intrinsic改変 | 基準捕捉前と後を分ける。変更した期待値の再pinは禁止。getter hook 0、caller期待値の受付0。不成立ならconstructor前で停止 |
| RT05 | 同Pの一度生成・run reject→resolve・cleanup resolve | execution work各1以下、同executor起源・正常退出、candidate／work aliasを確認。二重executor・半pair・別settler・別realmを拒否 |
| RT06 | executor throw後に返る既にrejectした候補 | 生成失敗を保持しつつ、安全な同候補の観測は一度行う。生成成功0と観測成立を別に数え、理由本文出力0。cleanupでも既rejectを後続resolveでfulfilledへ修復したと報告しない |
| RT07 | thenable／Proxy／own constructor／候補差替え | 未検査候補のthen・constructor hook／同化0。同prototypeのforeign Promiseでも同生成関係がなければ拒否 |
| RT08 | 観測前reject、登録throw／登録後throw、ack喪失・不適格 | claim 1以下・再登録0、work／ack候補の保持prefixを確認。未取得ackを終端済みにせず、正常条件で未処理拒否を残さない |
| RT09 | 同期／二重／後着callback・登録中stop／再入 | busy中を成功と扱わず、first fault／primary／revokedを保持。後着は観測事実だけ。公開／dispatch／正常受理0 |
| RT10 | 通知throw・run copy不能・必要settler不足・settle中再入 | 同work・実計数・元理由を保持。copy／settle各一度、実終端と未確認を区別。CP failure copy流用と第二workを拒否 |
| RT11 | 未dispatch正常候補の固定abortとclose | 全試験で生成済みの安全なwork／ackを有限に終端確認。未知は不成立と記録し、成功件数へ入れない。新floor／timer再計算0 |
| RT12 | source／compiled／配布の負対照 | pin照合省略、pending保持遅延、claim返却、観測再試行、同期失効省略、未知をconfirmedとする構文正常変異を拒否。固定distのみ、旧4export・strict raw・5fault・7permissions=false維持 |

work生成とobserver由来ack、API wrapper、試験用awaitの内部Promiseを区別して計数する。正常な捕捉P／thenと固定callbackの条件下でunhandled rejectionを残さないことを将来の合成対照で確認し、任意intrinsic破壊時まで無条件に保証しない。登録後の復帰喪失などを本当に安全に実行できない対照は、有限な別child／終了契約の承認・整備前に実施しない。process全体listenerで失敗を隠さない。

元の個別5秒・既定並列度、旧比較child60秒、製品全体60秒を変更しない。故障対照のために期限を延ばす・global条件を変更したまま後続caseへ進むことは禁止する。実native resource・実sessionへ接続する保証はこの表に含めない。

## 10 次工程と停止gate

最初にRHの先行shell／固定slotとPIの非実行pin検査・失敗保持を対にして実装・検証する。これが成立してから、RS05〜09の同P生成・安全な候補観測と、RS10の固定abort／失敗終端を対に接続する。Promiseだけを先に作って未観測reject／無期限pendingを後工程へ残す分割はしない。

module基準の信頼、同ownerの保持、失敗候補の観測条件、ackの有限保持、通知／終端失敗時の責務を説明・検証できなければ、その位置で接続を止める。未来のphase値成功やintrinsic descriptor一致だけで停止gateを通過しない。

JR-Cのprivate公開・最終post、正規published cleanup再合流、legacy work統一・dispatch／entry・正常finish、外側custody、新LM03・旧UN62移行・friend撤去・AP承認は別工程である。既存のruntime friendを新rootへ持ち込む・本番受付を開く承認は含まない。

## 11 今回の確認範囲

基準HEADのRecoveryAnchor／RoleGenerationSlot／JoinIdentity／JoinRuntime、JR-Aの資格・同期拒否、moduleのP／then捕捉、旧observe／clean／run executor、CP00の割当てを読み、現行と未実装契約を分けた。sourceのAST・文書link／表・ID・変更対象だけを静的確認する。RH／PI／RS／RF／RTは設計IDで、試験成功件数ではない。

3文書のlocal link 24件・表20個、RH 9／PI 7／RS 10／RF 8／RT 12の計46設計行に欠落・重複・列ずれがないことを確認した。source ASTでは新JR-A継続への製品call 0、旧anchor直下pendingのnull初期値2か所と、sourceがHEADと同一であることを確認した。末尾改行・差分空白を確認し、stageは行っていない。

既存のsource／compiled成功件数や全体回帰は履歴であり、本書の新契約の成功とはしない。今回は実装・製品moduleのimport／実行・Promise生成／観測・試験再実行・build／packを行わない。変更は本書と親2文書の参照・pending保持先・既reject候補と工程境界の訂正だけで、ソース・試験・CHANGELOG・依存・設定を変更せず、コミット・Pushも行わない。
