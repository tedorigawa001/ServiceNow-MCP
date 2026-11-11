# WF-B body source：正規生成位置・private issuerと同期停止・失敗時保持

Version: draft-0.5 / Date: 2026-11-11 / 設計基準HEAD: `5873d16` / (A)最小分離実装基準HEAD: `f3b3721` / (B)合成source実装基準HEAD: `311d3ef` / (B)レビュー修正基準HEAD: `c28b423` / (C)差分設計基準HEAD: `b3776da`。

draft-0.3のレビュー修正：BP00 attemptの2回目の発行前検査と`!creationAttempted`節、BP01の`bodySourceDataMatches`にある来歴4節（creationAttempted、fixedCount=9、metadataConfirmed、buildStage）と安定再検査の呼出しは、単独で外しても試験が落ちなかった。既存のstable対照はBP00の発行前検査に掛かる位置へ注入していたためである。metadata／進行fieldの`enumerable`節を単独で破るfaultもなかった。sourceが無いときの`first`等7軸は`unconfirmed`を返し、「不在→not_created」の規則と食い違っていた。各節への単一注入対照、非列挙field対照を追加し、不在の投影を`not_created`へ直した。§12に等価・観測不能な節を記録した。

Status: **(A)のBS／BC最小分離と(B)のroot先行scalar・BP00〜01正規生成／確認・同期停止／失敗保持を合成依存限定で実装。** 実装範囲は§11〜12と[分離検証記録](E2E_BEST_PRACTICE_WFB_BODY_STORAGE_DATA_SPLIT_2026-11-11.md)・[source生成／停止検証記録](E2E_BEST_PRACTICE_WFB_BODY_SOURCE_ISSUER_2026-11-11.md)を基準とする。§1〜10はdraft-0.1作成時の接続設計・文書検証であり、当時の「型だけ」「将来」「未実装」はその時点の記録。(C)private pinと受入条件全体は未実装・未実施のまま。親は[bind状態型・先行borrow設計](BEST_PRACTICE_WFB_BODY_BIND_BORROW_DESIGN.md)と[先行slot・固定構築設計](BEST_PRACTICE_WFB_BODY_SLOT_CONSTRUCTION_DESIGN.md)。先行実装とレビューは[field検証記録](E2E_BEST_PRACTICE_WFB_BODY_BIND_FIELDS_2026-11-10.md)を参照する。`5873d16`のroot側検査・projection対照と、等価と判断した節の注記は維持する。

正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。本書は実装・実接続・実通信・設定変更・Pushの承認ではない。将来も合成依存だけとし、今回の設計範囲はBS／BCの最小分離、BP00〜01のsource生成／確認とその前後の同期停止・保持まで。BP02〜04のprivate pinは接続先の前提だけを定義し、pin実行・source利用claim消費・payload借用／bind・構築ready・body／退出・正式証拠・実予算更新は含めない。

(C)の詳細化（MDのみ）は[BP02〜04段階別検査・同root／同startのprivate pin接続差分 draft-0.1](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)と§13を参照する。生成診断とpin位置の分離・private call／試行／停止保持を具体化しただけで、pinは引き続き未実装。BP04後もBC00へ進めない閉鎖保持を設計上の到達点とする。

## 1 現行から必要になる差分

現行のcreateProbeBodyBindFieldsFakeはbase37・probe8・run4・exit anchor5を準備後、source／BC shell不在とreceiver原始初期値を確認してbind_fields_heldで止まる。BodyBindSourceShellは型だけで、brandもdeclareでありruntime発行はない。sourceの3参照とmetadataConfirmed=false、receiverの9空参照と10scalarは先行済みである。

prepareBodySeedはBS00〜14とBC00以降を同じprivate関数で連続実行する。将来sourceのconstruction metadataには正規BC用shellが必要だが、sourceをBC01 contextの生成後に置くと先行pinの順序に反する。この循環は**BSだけを先に完了し、その同shellをsourceへ結合する**ことで解消する。後からshellを差し替えたり、metadataへ未来のcontext／bundleをbackpatchしたりしない。

現行closeは#fixedがあればroot停止代入より前に返る。sourceが存在しない旧経路では現行契約を維持するが、将来sourceを持つ新経路では「固定失敗返答を返す」と「同root／確認済みsourceへ停止を伝える」を別にする。返答cacheを捨てて再生成することで停止を表現しない。

## 2 物理配置・BS／BCの最小分離

新型・private発行／照合・停止継続は既存のpackage除外composition module内、同CanonicalGateDraftRootに置く。同RetirementStartAssemblyを借用先とし、新root／owner／frame／duty／予算を作らない。新経路の選択は固定private構築継続だけで行い、public booleanモード・source引数・callback・friend／artifact登録を追加しない。

| 境界 | 将来の最小変更 | 維持する保証 |
|---|---|---|
| BS storage | prepareBodySeed冒頭のBS00 shell、BS01 hole array、BS02〜14の13空carrierをprivate storage継続へ切り出す | 元rootへ保持してから検査する順序、15段階と各before／attempt／retained／done、元failure参照を維持 |
| BC data | BC00から先をprivate data継続に分け、既に保持する同shellだけを使う | BC00〜13の番号・前段／base検査、freeze／seal、旧seed／live／bundleの止まり方を維持 |
| 旧入口 | 旧prepareBodySeedは同じ保護frame内でstorage→dataを連続呼出し | public API・model・返答cache・旧script・prefix・空suffixを変えない |
| 新source入口 | 同frameでstorage→BootstrapReady再検査→BP00〜01へ進む | BC00をまだ呼ばず、既存field限定入口も変更しない |

BootstrapReadyは元base未使用、元firstなし・root未close、同root failureに結合したbuilding shell、ready=false／execution=closed／旧bind固定値、正規の長さ13 arrayと全carrierのshape／index／kindを検査する。**13行すべてがnot_started・予約false・call未到達・issued／current／rejected不在**であることを独立に確認する。現行bodySeedCarriersMatchは先頭5行の未生成を単体では保証しないため、そのまま「全13行空」の証拠にしない。sourceの発行3slot不在・metadataConfirmed=false、receiver9参照と履歴／診断の原始初期値も要求する。

生成順は「元base／probe／run／exit anchor→BS00〜14→BootstrapReady→BP00→BP01→未pinで閉鎖保持」。将来BP02〜04を別途接続するときだけ、BP01から同呼出し中に継続し、そのpost後にBC00へ進める。いったん返した旧held rootや新未pin保持を第2prepareで再開しない。BS失敗時はBP未呼出し、BP失敗時はBC00未呼出しで止める。genericな任意continuation引数や再開tokenを作らない。

## 3 rootの先行scalar・権限の分離

既存sourceIssued／sourceCurrent／sourceRejectedとmetadataConfirmedは再利用する。sourceIssuedは固定producerが作った元literalへの唯一の発行slotで、1回だけ書き、copy候補・receiver戻り値で差し替えない。sourceCurrentは確認候補、sourceRejectedは初回不一致候補であり、どちらも発行権限の供給元ではない。

将来追加するroot側の記録は原始scalarだけとする。以下の型／名称は設計上の案で、まだfieldを追加していない。

| 記録 | 有限値・初期状態 | 意味 |
|---|---|---|
| sourceCreationAttempted | boolean、false | BP00のproducer呼出し直前に1回だけtrue。source不在でも「未呼出し」と「呼出し後未捕捉」を分ける |
| sourceBuildStage | not_started／attempting／issued／hardened／captured／confirmed、初期not_started | 最後に確認できた生成prefix。失敗してもfailedで上書きしない |
| sourceBuildPhase／Step／Boundary | phaseはnone／BP00／BP01。stepは§4の固定観測点、boundaryはnone／before／after、初期すべてnone | 未確認sourceのfieldを読まずに現在位置を記録する |
| sourceMetadataFixedCount | 整数0〜9、初期0 | definePropertyから正常に戻って保持した固定化prefix。次の操作の成否を推定しない |
| sourceFailureRecorded／Phase／Step／Boundary | booleanと同有限位置、初期false／none／none／none | 最初の失敗位置。2回目のfail・closeで上書きしない |
| sourceStopRequested／stopFirst | false、none／closed | sourceの有無・確認状態と独立したroot停止履歴。trueを戻さず、元construction firstを置換しない |
| sourceDeliveryFirst | none／delivery_unconfirmed | 新経路の値配送未確認。raw例外を保持しない |

sourceCreationAttemptedは呼出し到達履歴／重複生成防止であり、単なる予約やBodyBindSourceShell.claimの代用品ではない。publicの重複prepare拒否に加え、private発行継続も未試行・全発行slot空・未失敗・未停止を要求する。producer throw後にsourceが不在でも試行を返却／再生成しない。これらを新claim object・Map台帳・第2failure ownerへ分散しない。

rootの既存firstと新しい生成位置／停止／配送記録、確認済みsourceのfirst、receiverのfirstは別である。先行diagnosticがあれば保持し、元rootへの伝播はbinding不一致→binding_mismatch、状態不正→state_invalid、停止→closed、未捕捉／固定化／確認未完了→construction_unconfirmedの既存語彙へ写像する。旧ProbeRunFirstへ新語彙を足さない。

## 4 BP00〜01の固定schedule・発行元

runtime brandは将来同moduleのprivate symbolとして1つ定義し、外へexportしない。brandだけで発行元確認を完了しない。固定producerはroot内でplain literalを作り、元literalをsourceIssuedへ即時保持する。保持までの間にhook／通知／await・copy加工・hardeningを挟まない。producerの外から任意objectを返す差替え口は設けない。合成のcopy／foreign／Proxy候補は、元issuedを保持した後のcurrent候補としてのみ混入させる。

sourceの22 own keyは親設計どおり、brand＋8 metadataと13進行fieldである。metadataはcustodian＝同root、construction＝同BS shell、binding／link／duty／control／startとrootFailure＝元正規参照。sourceにBC01 context／将来bundle／draft／callbackを追加しない。初期値はBodyBindSourceInitialどおりstate=initializing／claim=unused、全call／stop／post=false、位置・診断noneである。

| 順序 | root側観測点 | 固定操作・保持 |
|---|---|---|
| 1 | BP00.before | BootstrapReady、発行未試行・slot空・未停止を再検査 |
| 2 | BP00.attempt | sourceCreationAttempted=true、buildStage=attemptingをproducer直前に直接記録 |
| 3 | BP00.issued | literal生成→sourceIssuedへ即時保持→buildStage=issued。その後にだけ故障／close観測点 |
| 4 | BP00.fix_0〜fix_8 | brand、custodian、construction、binding、link、duty、control、start、rootFailureの順にnon-writable／non-configurable・enumerable data propertyへ固定 |
| 5 | BP00.sealed | 13進行fieldがwritableなdata propertyであることを保ち、全shapeをseal→buildStage=hardened |
| 6 | BP00.captured | 同literalをsourceCurrentへ捕捉→buildStage=captured。同値copyはcurrentだけを置換する負の対照 |
| 7 | BP01.before／checked | §5のidentity-first確認と全shape／descriptor／Initial値・元base／BS／receiver初期値を検査。失敗時は元slotと初回候補を保持 |
| 8 | BP01.after | root未停止を再確認し、metadataConfirmed=true／buildStage=confirmedをhook／通知／awaitなしで固定。確認済みsourceの位置をBP01／afterへ進め、固定post検査後に閉鎖保持 |

fix_0〜8／sealed等は**root側の細粒度step**であり、既存BodySourceBoundaryへ無断追加しない。sourceは確認前にはInitial値のままで、BP00の位置をraw sourceへ書き込まない。root側でattempt／issued／captured等の履歴を保持することで、source metadataの確認前に状態fieldへ触れずに診断できる。metadataConfirmed直後の観測点でcloseされた場合は、§6の確認済み停止を適用して成功保持へ進めない。

各stepは操作前／後をroot側boundaryで区別する。特にfix_0〜8はbefore→固定化call→FixedCountを1増分→afterの順とし、次の固定化前にroot停止／firstを再確認する。throw／closeで次のdefineProperty・seal・current捕捉へ進まない。途中故障ではFixedCountと最初の位置を保持し、raw sourceの実属性を走査し直してprefixを補完しない。BP00.attemptの観測は呼出し到達flagを立てる前に置き、flag記録→producer呼出し→literalのissued即時保持の間には観測hook／通知／awaitを置かない。producer内部の固定throwは結果未捕捉として記録し、attempt後の新しいclose挿入で「flagだけtrue・producer未呼出し」を作らない。

BP01.afterのpostは「確認済み・位置BP01／after」の狭い検査を使い、phase=noneを求めるInitial検査をORで緩めない。metadataConfirmedの確定後に故障してもその確認済み事実を巻き戻さず、元sourceへの失敗記録とrootの失敗／停止guardによる後続拒否を適用する。通常の失敗記録とclose要求は区別し、失敗しただけでcloseを受けたという履歴を捏造しない。

この段階の正常到達点は「metadata確認済み・未pin」の閉鎖保持である。sourceはinitializing／unused、pinCallReached=false／bindCallReached=false／postConfirmed=false、receiverは9参照空・pin未試行・free／empty。preparingへ進むのは将来のBP04後だけとし、BP01でpreparing／held_unready・BC用shell held・root readyを先取りしない。将来の開発専用返答案はmodel=wfb-body-source-issuer-1／source_held_unpinned／ok=falseで、旧modelを拡張しない。

## 5 private issuer照合と未確認source

発行元の照合は既に捕捉している正規rootを直接受けるmodule-private継続だけとする。候補のcustodianを読んで呼出し先を探したり、candidate.matches等を呼んだりしない。public summary・brand・shape・同値copyから正規rootを登録／復元する口はない。

最初に候補とroot sourceIssued／sourceCurrentの参照同一性を比較し、root内の発行到達履歴を確認する。不一致なら候補へReflect／descriptor／getter／ownKeys／prototype操作をせず、初回sourceRejectedへ参照だけを保持して拒否する。元sourceIssuedは変更しない。その後だけ、固定producer由来の元literalを固定22keyで調べる。Proxyをdescriptor検査だけで「非Proxy」と証明できるとはしない。安全に検査できる根拠は、元literalをcopy／任意producerで置き換えないprivate生成経路である。

確認するのはplain prototype・余分／欠落keyなし・全own data descriptor、metadata9keyの固定属性、進行13keyの属性とInitial値、同root issued=current、同BS shell／failure・元binding／link／duty／control／start、元base／全13空carrier／receiver初期値／未停止である。metadataConfirmedはこれらを完了してからだけtrueにする。型assertion／Object.isSealed／brandのどれか単独を資格証拠にしない。

BootstrapReadyの「source未発行／slot空」はBP00前だけの条件である。BP01では元base・BS・receiverの安定部分を再検査し、sourceは別のissued／current／初期状態検査へ明示的に切り替える。全条件を一つのcheckerでOR緩和せず、既存bodyFieldsIntactのshell／source不在条件も変更しない。

bindingOwner＝binding／start側ownerとcellOwner＝cells／root probeOwnerは別々の正規関係を照合する。両者を等しいownerへ統一しない。新sourceのcustodianはroot自身であり、この2つのownerを置換しない。新経路でまだ存在しないBodyRoutePinと、既存CanonicalGatePin／controlの混同も拒否する。

停止・失敗処理は以下の信頼区分だけを使う。

| rootが保持する区分 | 停止／失敗時に触れてよい対象 | sourceの公開投影 |
|---|---|---|
| producer未呼出し／未捕捉 | rootのscalar・元failure・既存BS prefixだけ | 不在はnot_created。呼出し未確認は別root履歴で区別 |
| issuedのみ・固定化途中・current捕捉済みだがmetadataConfirmed=false | root scalar、元issued／current／初回rejectedの参照保持だけ。sourceのfieldは読み書きしない | 非空でもunconfirmed。unused／停止済みを推定しない |
| 正規metadata確認済み | private発行slotに保持する元sourceIssuedの固定進行fieldだけ | 許可値とstrict boolean。別current候補は正規化しない |

metadataConfirmedがfalseのまま停止／失敗したsourceを、close処理で追加検査して確認済みへ昇格させない。停止後に「安全な書込み先を探す」ためにgetterやdescriptorを実行せず、root停止を正として以後の全処理を拒否する。停止のための確認再試行／第2source生成はない。

## 6 同期停止・失敗後closeの順序

source経路を選択したrootだけに、固定返答より先に走る専用の停止継続を置く。経路選択は構築時のprivate固定値であり、非空sourceの有無・外部引数から切り替えない。旧field限定・seed／live／bundle等のclose順序／返答は変更しない。

停止継続は、(1) root #closedとsourceStopRequestedをtrue・stopFirstを初回closedへ記録、(2) metadata確認済みなら元sourceIssuedへstopRequested=trueと必要なfailed／最初のsource理由を記録、(3) その後に既存固定返答を返すかdeferred／closedを分類、の順とする。root scalarの停止記録が、この新経路の停止受付の線形化点である。sourceへの反映は同同期呼出しの終了までに行い、新規操作のguardは常にroot停止も検査する。root停止後・source反映前の区間を新しい受付窓にしない。

上の直接代入区間にallocation／hook／通知／awaitを挟まない。metadata確認済みsourceは元producer由来・進行fieldがwritableなsealed dataであることを前提にし、sourceCurrentが別候補へ変わっていても未知候補へ書かない。元sourceIssuedへの権限を確認できない破損はroot停止／未反映診断で保持し、無理にsource停止済みと表示しない。実OOM・実行系故障で診断必着を保証するものではない。

| close位置 | 同期記録・返答 | 残す状態／責務 |
|---|---|---|
| prepare前 | root停止。従来どおりfirst=none／closedを返し、生成を開始しない | 全source slot空・試行false |
| BS生成中 | root停止。frame中はdeferred_frame、次の固定guardで停止 | 捕捉済みshell／carrier・元first、source未呼出し |
| BP00呼出し前／producer未捕捉 | root停止。producerを新規に呼ばず、既に呼出し済みなら未捕捉責務を記録 | 試行履歴を戻さず第2producerなし |
| metadata未確認 | root停止だけを確定。raw sourceには触れない | 部分hardening／issued／current／rejectedを保持、BC未開始 |
| metadata確認済み | root停止＋元sourceへの同期反映。sourceはfailed、claim unusedを保持 | 原因noneならsource first=closed。先行理由／位置は上書きしない |
| 失敗返答が既にcache済み | **停止記録を先に行い、返答は元と同一参照で返す** | root／sourceの先行first・初回失敗位置・全prefixを保持 |
| 2回目以降 | 同じ停止履歴を保持するだけ。再生成・再配送をしない | 先行返答・保持参照・未反映責務を壊さない |

「元first=xの固定返答」と「後から停止要求を受けた」は同時に成立する。freeze済み返答へclosedやsource状態を書き足さず、新しいinspectの固定値で停止履歴と反映の有無を示す。返答cacheと停止状態を同じbooleanに畳み込まない。closeでclaim／occupancyを返却したり、start.close／request／drain・回収・field clear・Journal供給へ迂回したりしない。

失敗はroot firstと初回生成失敗位置を先に固定し、確認済みの元sourceだけをfailedへする。未確認sourceは見かけ上のstate／firstを修正せず、root側の失敗を正とする。reentry／duplicateは元発行を壊さないrefusal、foreign候補は当該callerの拒否として分ける。別rootの正規source・診断へ失敗を伝播しない。

同rootの正規BS storageとして検査済みのshellは、親契約どおりstate=failedを記録するが、failure参照・slots／carrier・元prefixを消さない。BS途中でshell自体が未捕捉／未確認なら、失敗処理でそのfieldを再検査／補修せずroot scalarと捕捉済み参照だけを保持する。source用失敗継続を足すために旧BC shellのreadonly ready／bind fieldや既存failure写像を広げない。

## 7 保持・再利用拒否と将来pinへの引渡し

BS部分生成物・sourceIssued／sourceCurrent／初回sourceRejected・確認済みmetadataは同rootに残し、失敗／closeでclear・copy補完・再生成しない。未確認fieldを触らないため、raw object内に初期stateが残っていても再利用資格にはならない。rootの試行・失敗・停止とprivate発行slotの履歴が以後のprepare／発行／pinを拒否する。保持はcleanup確認／解放済みの証拠ではない。最終discard・borrow退役・root終端は別設計に残す。

将来BP02への入力は同呼出し中の正規root／元source／同startのprivate継続だけ。少なくともroot未停止・未失敗、metadataConfirmed、正規issued=current、source initializing／unused・pinCallReached=false・bind未到達／post=false、同base／全BS空carrier・receiver9参照空／pin未試行を再検査する。BP02でpinCallReachedを立てる位置以降は別契約とし、本範囲では実行しない。

source確認を通っただけでreceiverのexpected-source参照を補充したり、pinAttemptUsed／occupancyを進めたりしない。新source利用claim・既存run use／exit duty・回収claimはすべて未消費のまま。source確認済みという公開値からBP02を呼ぶ復元口は作らない。後続private pin・BC・BDを接続する場合も、旧intactのshell不在節や未使用判定をORで広域緩和しない。

## 8 公開診断・有限費目とUnknown

新経路の将来の値返答はauthority=none／execution=closed／formalIssuance=closed／wholeRunAdmission=disabled／implementation=unknown／investigations=on_holdを固定する。rootのsourceBuildStage／有限位置・初回失敗位置／試行／停止／配送、sourceの信頼区分・保持boolean、確認済みsourceだけの有限進行値、未pin／未消費・BC開始0を投影する。未確認sourceのstate／claim／stopを直接読まない。source不在をunused、停止要求だけをsource反映済みと表示しない。

public graphにroot／source／shell／start／owner／brand／descriptor・raw Error／message／stack／causeを出さない。初回拒否候補も参照保持booleanだけで、任意keyを列挙しない。値出力失敗は先行scalarで保持し、失敗返答を作るための別ownerや動的履歴を追加しない。

追加費目は同構築rootへ帰属する。BSの確保／検査は既存分を再利用し二重計上しない。新規はsource1literal、固定22key検査、metadata9固定化・seal、issuer同一性／両側初期値検査、各固定guard、source停止反映と診断projection／失敗保持である。未確認時の反射／再探索・任意長loopは費目に入れず、実装自体を禁止する。

これらは論理上の有限枠で、実allocation数／layout・全guard数／E／S係数・実予算・停止後解消予約・全体work上界の証明ではない。Unknownを維持し、実予算更新・cap投入・新期限・残時間からのdeadline再計算を行わない。

## 9 設計時点の独立合成受入条件（現行の部分検証は§12）

| ID | 必須条件と負の対照 |
|---|---|
| SS01 | BS／BC分離だけで旧seed／live／bundleの全script・prefix・model／export・compiled対照が不変。旧field限定のsource／shell不在検査とroot側レビュー対照も維持 |
| SS02 | BS15段階の部分生成失敗ではsource call=0。BP00〜01の各固定観測点ではBC00 call=0、生成済み参照・試行／stageを独立event oracleで比較 |
| SS03 | producer throw／issued捕捉／各9固定化／seal／current捕捉の故障・close・再入。元issuedを即時保持し、未確認objectのgetter／ownKeys／method実行0 |
| SS04 | 22key・9metadata属性／全関係・13Initial値／属性を個別破壊。全BS13行空・元base／receiver初期値の単独破壊を、当該guardが最初に拒否することまで確認 |
| SS05 | brand付き同値copy・別root／start／binding／duty／control／shell／failure、currentだけのProxy混入をidentity-firstで拒否。元issuer slotとforeign rootの診断は不変 |
| SS06 | metadata確認前の各位置でclose後にsource fieldアクセス0。root停止は確定し、元sourceに追加検査して確認済みへ昇格・再生成・再prepareしない |
| SS07 | metadata確認済みsourceはclose同期呼出し終了前にstop反映。root停止guardを省く変異とsource反映を省く変異を別々に検出 |
| SS08 | first=xの固定失敗後closeで返答同一参照・first／初回失敗位置不変、root停止true。確認済み／未確認の反映差を比較。既存#fixed早期return流用の変異を検出 |
| SS09 | 生成確認直後のclose・二重close・重複private発行・再入・foreign拒否でも元prefix／責務を保持。claim unusedを再試行資格にする変異や初回rejected上書きを拒否 |
| SS10 | metadata readonly／不正state×claim履歴・診断位置の型拒否、runtime strict検査・allowlist／strict boolean・公開graph有限性／秘密非出力の負の対照 |
| SS11 | BP01正常でもsource initializing／unused／未pin、receiver9空参照、BC data生成・grant／body／duty消費・構築ready・正式証拠0。source summaryの資格昇格口なし |
| SS12 | fixture梱包混入0、旧API／package設定不変。同root／frameだけを使い、追加BS／sourceの二重計上・実予算更新・runtime friend共有なし |

oracleは本体のbuilder／schema／状態表を期待値へimportしない。固定event列から元BS prefix、producer未呼出し／未捕捉／issued／current／確認、停止要求／反映と初回失敗を別々に計算する。単一故障注入とguard除去で最初の拒否位置・後続呼出しが変わることを要求し、後段失敗や文字列anchor消失だけを感度保証としない。

`5873d16`で等価とした旧field限定の初回失敗位置／#fixed節はその経路に限る。新経路には失敗後close・異なるBP位置の履歴があるため、同じ等価性を移植せずSS08〜09で別途確認する。既存の未対照base節・全体work capのUnknownも維持し、全guard検証済みとはしない。

## 10 将来の実装分割と今回の文書検証

将来の承認単位は、(A) BS／BCの最小配置分離と旧挙動維持、(B) root先行scalar・BP00〜01の正規生成／確認と同期停止・失敗保持、(C) 別承認のBP02〜04 private pin、の順とする。Bでは生成と停止を対で接続し、先にsourceだけを公開しない。どの段階もsource利用claim消費・payload bind・構築ready・body起動は含めない。

今回は本書と親2文書の参照更新だけを行う。ローカルリンク・表列数・固定22key／9metadata／13進行field・BP観測順・BS／BC分離と停止／所有条件・差分空白を文書として確認する。ソース／試験／CHANGELOG／設定は変更せず、build・合成／compiled試験・梱包操作は行わない。SS01〜12は未実施であり、実装済み・受入成功と記録しない。本書作成時点では未コミット・Pushなし。

文書検証結果：本書と親2文書のローカルリンク24件に欠落なし、22表の列数・末尾改行／空白に異常なし。本書の10節・SS01〜12・schedule8行の順序／重複／欠落を確認し、現行内部型からmetadata9keyと進行13fieldの計22keyを照合した。現行ソースのBS→BC連続配置とcloseの#fixed早期返却も読み取りで再確認した。作業中の差分は新設計書と親2文書だけで、ソース／試験／CHANGELOG／manifest・lockfile／設定はHEADから変更していない。これは文書整合の確認であり、将来の生成・停止・受入試験の成功を意味しない。index登録・コミット・Pushは行っていない。

## 11 (A) BS／BCの最小分離だけの実装（2026-11-11）

既存composition fixture内のprepareBodySeedを2呼出しのprivate wrapperにし、prepareBodyStorageがBS00〜14を実行して元shellをそのまま返し、prepareBodyData(shell)がBC00以降を実行するよう最小抽出した。追加の実装行は7行で、元の生成操作・検査・checkpoint・holdを移動しただけである。wrapperから同shellを直接引数で渡し、再読取による別shellへの付替え・copy・新receipt／callback・汎用runnerを追加しない。

旧seed／live／bundleは同じ既存保護frame内でstorage→dataを1回ずつ続けて呼ぶ。BSの例外は元の外側catchへそのまま伝わり、dataを呼ばない。dataの例外も元のcatch／finallyと最初の失敗位置・返答cacheで処理する。正常5／11／13dataの旧hold・model／API／export、途中prefix、close／再入、元base・descriptor／freeze検査は維持する。BS／BC間にhook・await・新たな公開観測点を挟まない。

compiledはscratch内だけに有限event観測を足し、正常3経路の全checkpoint列と同shell／同frameの受渡しを独立oracle比較する。storage直後とBC00 beforeで故障させる計6対照により、全13空carrierを保持したままdata未呼出し／未生成で止まることを確認する。storage／data省略・二重呼出し、返却／引数のcopy、storage側の早いBCを検出し、2つの抽出methodへの外部呼出しをsemantic compile-failで拒否する。copy対照は受渡しの同参照観測を失うことで検出し、任意入力のruntime拒否を追加したという保証ではない。

旧compiled-probe-body-seedの5箇所は、移動したdata操作への注入先をprepareBodySeedからprepareBodyDataへ変更しただけで、assert・期待値・20再検査対照を削除／緩和していない。旧export期待値も変更していない。結果と初回REDは[分離検証記録](E2E_BEST_PRACTICE_WFB_BODY_STORAGE_DATA_SPLIT_2026-11-11.md)を参照する。

SS01の最小分離に関する範囲だけを確認し、SS02〜12のsource生成／停止／pin依存条件を合格へ昇格しない。新source用BootstrapReady・BP00〜01・同期停止・BP02〜04・claim消費・bind・構築ready・body起動は未接続。field限定入口は引き続きBS未生成・source不在で停止する。rootのデータ生成数／順序は同じだが、追加private call／moduleのmethod配置を実allocation・E／S／work上界の同一性証明にはしない。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。

## 12 (B) 正規sourceの生成／確認・同期停止・失敗保持（2026-11-11）

package除外の同composition moduleにcreateProbeBodySourceIssuerFakeを追加した。固定scriptだけを受ける閉鎖factoryで、APIはprepare／check／checkLegacy／close／inspectの5つ、model=wfb-body-source-issuer-1、正常もsource_held_unpinned／ok=falseである。先行scalarは同CanonicalGateDraftRootに直接置き、同RetirementStartAssembly・元binding／link／duty／control／failure・同BS shellを再利用する。別root／owner／frame／予算・登録台帳・任意producer／callbackを追加しない。BS00〜14後に全13carrierの未生成と元base／receiver初期値を検査し、BC00は呼ばない。

private symbolと同rootの固定literal producerで22keyのsourceを一度だけ生成し、hardeningや故障観測より先に元literalをissuedへ保持する。brand＋8metadataを固定順にreadonly化し、進行13fieldをwritableなdata propertyのままsealする。currentの捕捉後、issuedとの同参照を反射より先に検査し、元literalのshape／descriptor・全metadata関係／Initial値を確認する。BP01 afterはInitialと明示的に区別した確認済みvariantを使い、確認済み事実を後の故障で巻き戻さない。初回不一致candidateは最後のpost検査でもrejectedへ参照だけを保持する。issuedはcopy／Proxy候補で置換しない。

root側の32固定位置で故障・close・再入を区別する。producer throwは試行済み・未捕捉で止まり、source不在／claim unusedを再生成資格にしない。二重private発行は既存sourceを壊さないduplicate_creation拒否。正常のsourceはinitializing／unused、pin／bind／post未到達、receiver9参照空・free／empty、BS shellはbuilding・13carrier空のまま保持する。準備後の再prepareでも先へ継続しない。

新経路のcloseだけは返答cacheの前にroot停止を同期記録する。metadata未確認のissued／current／rejectedはfieldを読み書きせず保持し、確認済みの場合だけ元issuedの進行fieldへ停止／failedを反映する。失敗だけでclose履歴を捏造しない。先行first・初回生成位置・元返答同一性を保持し、失敗後closeでもroot停止が省略されない。同rootとして検査済みBS shellだけをfailedにし、BS途中の未確認shellは補修／再検査しない。保持はcleanup完了／解放済みを意味しない。

公開診断は有限enum／strict boolean・0〜9の固定化数（許可外は-1）と参照保持booleanだけ。未確認sourceのstate／claimはunconfirmedで、元参照・symbol・raw例外・任意入力は出さない。既存旧factory／model・close順序・field限定のsource不在検査は維持する。module export期待値に新しい開発専用factory名を1件だけ追加し、配布物のexport／設定は変更しない。

独立合成200件とcompiled対照の範囲・初回失敗／重複guardの観測訂正は[source検証記録](E2E_BEST_PRACTICE_WFB_BODY_SOURCE_ISSUER_2026-11-11.md)を参照する。SS02〜11の本段階に該当する部分を検証しただけで、全guard・全SS合格とはしない。getter拒否のshapeとwritable descriptorの重複防御は、各単独除去でも安全な場合を明記し、二重除去対照と区別する。固定metadata／進行fieldの不正関係・属性、全13空carrier・元base／shell／receiver初期値の対照はあるが、あらゆる私有slotの任意破損や任意foreign rootへの書込み安全性を証明するものではない。

BP02〜04 pin・source claim消費・payload borrow／bind・構築ready・body起動・回収／Journal・正式証拠は未接続。実allocation／layout・全guard費・E／S係数・実予算・OOMでの診断配送必着はUnknown。sourceDeliveryFirstは予約された有限診断scalarであり、実配送失敗の保証は追加しない。正式発行口閉鎖・全体受付無効・調査保留を維持する。

レビュー修正（`c28b423`）：BP00 attemptとBP01の再検査は、各節への単一注入で最初の拒否位置（`failurePhase`／`failureStep`／`failureBoundary`）を固定する。非列挙のmetadata／進行fieldは、それぞれの`enumerable`節だけが拒否する。source不在時は、state／claimに加えてfirst／phase／boundary／failurePhase／failureBoundary／refusal／deliveryFirstも`not_created`と投影し、`unconfirmed`は発行済み・metadata未確認の場合に限る。`bodySourceDataMatches`の`rejected`節は、rejectedが失敗時にだけ付き構築が止まるため等価とする。sourceの最初の失敗位置の上書き防止は、新経路でも2回目のfailが同じ位置か、close後は`#fixed`返却、held後は初回failになるため等価と確認した。shellのfailed化をstorage確認済みに限るgateは、未確認shellがinspectで常に`unconfirmed`と投影されるため外部から観測できず、防御条件として残す。

## 13 (C) 段階別検査・private pin呼出し境界（2026-11-11、MDのみ）

[private pin接続差分設計](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)で、同root／同start・同sourceの来歴確認とBP02〜04の狭い検査、call到達／receiver試行／参照保持／確認を分けた固定scheduleを定義する。現行(B)の全空／BP01専用検査をpin後へOR緩和せず、生成時のsourceBuild／sourceFailure位置を保存したままpin専用位置・初回理由を記録する。生成側failure writerをそのままpin失敗へ流し、BP01の失敗と誤記録する接続は禁止する。

固定private call・同startの既存expected-source3参照とpin履歴だけを利用し、source利用claim消費・payload6参照／occupancyの変更は行わない。試行後の失敗／closeでpin解除・試行返却／別source補完をせず、confirmedは後発失敗でも保持する。BP04後の正常案はsource preparing／unused・pin confirmed・payload空／free・BC00未開始の閉鎖保持で、構築ready／body起動の成功ではない。

本節と差分設計は文書のみであり、実装・pin試験の受入成功を示さない。`b3776da`の再検査／不在projection訂正と等価・観測不能の範囲を保持し、その評価を新pin経路へ自動移植しない。正式発行口閉鎖・全体受付無効・Unknown・調査保留、実接続／実通信・設定変更・Pushの禁止を維持する。
