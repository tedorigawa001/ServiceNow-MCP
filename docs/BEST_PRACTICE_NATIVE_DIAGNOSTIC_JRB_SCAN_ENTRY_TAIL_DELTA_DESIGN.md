# JR-B同ownerの一度限りscan入場・entry捕捉と固定failure tail／退出の差分詳細設計

Version: native-diagnostic-jrb-scan-entry-tail-draft-0.1 / Date: 2026-11-18。
Status: MDだけの差分設計。基準HEADは`93383af`。閉鎖値契約の実装は`47cb9ec`。[固定台帳・scan設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_FIELD_ADMISSION_SCAN_DELTA_DESIGN.md)SQ01〜03／07〜08・§9、[先行拒否設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_PRECALL_ADMISSION_ALIAS_DELTA_DESIGN.md)PS／PC、[閉鎖値契約の検証記録](E2E_BEST_PRACTICE_NATIVE_JOIN_SCAN_VALUES_2026-11-18.md)への差分である。今回は本書だけを追加し、既存ソース・試験・CHANGELOG・検証記録は変更しない。

正式発行口／新LM03／C実行入口／body起動閉鎖、全体受付無効、通常経路未切替、Unknown、VM／監視／telemetry調査保留、LOAD6／LOAD7選択・AP01〜06未承認を維持する。実装・製品moduleのimport／実行・試験再実行・build／pack・scan実行・alias供給・Promise生成・closure呼出し・private公開・dispatch・実接続・実通信・実機操作・設定変更・stage・コミット・Pushは行わない。

## 1 現行との差分と後続単位の終点

[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)には共有owner／中断bit・role別計数の6scalarとreadonly guardがあるが、writer・入場・entry捕捉はない。role別の拒否ID欄は依然JoinPrecallCheckの5値で、192IDの型／判定から拒否欄への接続もない。現行requestJoinPrecallはownerまたはcomposition拒否を先に確定し、scanを始めない。

次の実装単位は、同creatorのprivate入場・原始拒否・対象固定tail・外側退出を合成依存でつなぐところまでとする。入場を通過しても固定検査へは進めず、最後にcomposition／invalid_stateで拒否する。返却はliteral false、固定検査のprobe／計数更新0、constructor／alias取得／公開0を維持する。空の入場経路の成功を、全field受付・元floor／live pin・生成資格と呼ばない。

## 2 内部型・物理配置・192IDの唯一の保持先

以下は将来の内部型の形状契約で、今回の型実装ではない。型名からhandleやbrand付き証拠を生成しない。

| ID | 内部型・値域 | 物理保持と制限 |
|---|---|---|
| CT01 | ScanRole＝run／cleanup | 同creatorの固定role。raw.kind／slot.roleを読んで選ばない |
| CT02 | ScanEntryIdentity<K> | role、root、recovery、seed、slot、shell、identity、pinの8値。role以外は同creatorのlexical期待参照。shell／identity／pinは未準備nullも表現するが、null一致を正常受理しない |
| CT03 | ScanEntryFacts | started、primary、revoked、sealed、currentの5値。全て同creatorから一度捕捉し、callerのbaseline引数や公開診断copyを採用しない |
| CT04 | ScanEntryPhase | unowned／reserved／owned／refusing／tail／exiting／exited_retained。frame-localの有限値で、通常進行や公開phaseではない |
| CT05 | ScanExitRight／ScanTailClaim | frame-localのboolean各1個。退出権限を先行予約し、tail claimはnative操作より前に消費。一度trueになったclaimを戻して再試行しない |
| CT06 | ScanFailureSite | 既存JoinScanFailureIdの192値だけ。field走査まではowner／busy／attempted／composition／control／scan_state／scan_interrupted等の固定siteを使う |
| CT07 | ScanRefusalPair | role別の既存precallRefusalCheck／Code欄を共有。ID欄2個だけJoinScanFailureIdまたはnullへ型を拡張し、code欄は既存3codeまたはnull。第二台帳・第二primaryを置かない |

CT02／03はreadonlyの概念型であり、runtimeにentry object／tuple／配列を割り当てる要求ではない。実体は同一関数frame内のlocal const／原始値とし、CT04／05と現在siteだけを外側が更新する。計17 local値（8＋5＋phase／退出権／tail claim＋site）を保持する形で、うち参照は8、原始値は9。schema object・callback・可変trace・移譲ticketを生成しない。関数frame／closure等の実backing容量はUnknownである。

rootの先行保持は現行14scalarのまま、共有owner／中断2、role別計数4、role別attempted／busy／ID／codeの8を使う。新しい永続entry cacheやrole別tail台帳は増やさない。元JoinPrecallCheckは5値のまま残し、192IDを旧5値へ圧縮・castしない。slot.faultAtは既存constructor_pre等の有限JoinFaultSiteであり、192ID欄へ拡張しない。詳細IDは同roleの既存拒否欄が唯一の保持先で、上位診断・公開summaryへ複製しない。

192はcontrol9＋field131＋proxy19＋keys13＋frozen11＋prototype2＋alias7というID値域であって、192件の同時保持slotではない。永続保持はrun／cleanupそれぞれ最初のID1個とcode1個、走行中のsiteは外側frame内の1値だけである。17 local値はこの入場制御・捕捉値の台帳であり、raw引数や一時descriptorまで含む関数frameの全容量を算定したものではない。

## 3 entry生成順・入場の線形化点

private入口は同root・同roleに固定し、外部設定やcallback／操作表を引数にしない。raw参照として受けるのはroot／shell／identity／pin／slotだけで、entry facts・seed・recovery・record／anchor・失敗IDをcallerから採用しない。生成・借用は次の順で行う。

| ID | 固定順・確定点 | 失敗時の責務 |
|---|---|---|
| EN01 | role値を確認 | 不正roleはfalseだけ。どちらのowner／診断欄も選ばず、raw propertyを読まない |
| EN02 | 共有scanOwnerを確認 | activeなら§5のinner拒否だけで戻る。entry参照捕捉・新tail・inner finally解除0 |
| EN03 | 当該attempted／busy／拒否pairと初期計数を確認 | 既存履歴が一つでもあれば再入場しない。壊れたpairや非0計数も修復しない。まだ共有ownerを取得せずnative操作0 |
| EN04 | CT02の期待参照→CT03の5値を同frameへ捕捉 | current.anchorやidentity.contextを直接読まない。捕捉自体は同creatorのlexical値だけ。未成立ownerのbootstrap限界はUnknown |
| EN05 | 外側の退出権をtrue、phase=reservedへ先行設定 | 永続writerより前に退出責務を持つ。ここ以降のcatch／finallyで履歴を返却しない |
| EN06 | own attempted=true→own busy=true→interrupted=false→scanOwner=role | 同期原始群。最後のscanOwner書込みを共有入場の線形化点とする。途中にcallback／await／反射／sampleを挟まない |
| EN07 | phase=owned→raw参照を捕捉済み期待参照と照合 | root／slot／shell／identity／pinのforeign・copy・Proxyに触れず拒否。shell／identity／pinのnull期待値は必ずowner拒否 |
| EN08 | 同entryのreadonly guardを確認 | guardへ渡すのは捕捉済み5値だけ。現在値を再採取してpostを成立させない。不整合なら最初の拒否を保持 |
| EN09 | 固定検査未接続としてcomposition拒否 | 現単位の終点。scan probe／alias取得／constructor claimは0のまま対象固定tailへ最大1回移る |
| EN10 | 外側finallyで§7の退出 | local退出権と実際の共有ownerを照合し、共有状態を解放する。attempted・理由・計数は保持 |

EN06の前に退出権を先行予約するのは、attemptedだけ／busyまで／owner公開直後という生成prefixでも回収責務を失わないためである。fault注入で途中に止めた場合、共有ownerがまだnoneならtailを呼ばず原始拒否と実prefixだけを保持する。owner公開済みで、同frame・同role・attempted／busyを確認できた場合だけtail資格へ進める。中間状態を完成済みownedへ補正せず、未消費attemptedを成功扱いで消費し直さない。

entry捕捉・入場群はguardの新規資格ではない。runでもcleanupでもentry時のprimary／revokedを勝手にnull／falseへ戻さない。同cleanupの先行HTTP／失効factsもそのまま捕捉し、同値継続の確認と実停止資格を区別する。currentは参照借用だけで、record／anchor／contextのfield検査は後続の固定検査まで行わない。

## 4 192IDの記録・pair不整合と非返却

正常な最初の拒否は、同roleのID→code→空の場合だけ元primary→revoked=trueの固定原始群で記録する。割当て・反射・呼出し・任意文字列化・例外payload保持を群内へ入れない。IDは当該siteの定数、codeは既存3値。9control IDの分類は既存値契約のままで、field IDのcodeは後続siteの実原因から選ぶ。

同roleのpairが両方非nullなら最初のID／codeを維持する。後着busy・control・compositionで上書きせず、primaryが既にHTTP／取消等ならそれも保持する。slotへの反映はcodeとconstructor_preだけであり、詳細IDの権威はこのprivate欄から移動しない。

IDだけ／codeだけの部分pairは正常なfirst-failureとして補完しない。両欄をそのまま保持し、必要なら元primaryが空の場合だけ固定internal_review_error、同期revokedを残してfalseで止める。native tail・全field post・公開診断への昇格は0。壊れたcodeを外部例外やString変換で正規化しない。部分pairのIDをscan_stateで置き換えることも禁止し、解放不能・診断不足はUnknownに残す。

既存5値のlegacy拒否と192値の新拒否は同じ物理欄を使う。後続実装では、legacyの記録入口もこの「両nullでのみ初回記録／既存pair保持／部分pair非補完」の規則へ合流させる。型だけを広げ、旧nullish代入が部分pairを埋め直す経路を残したままにしない。外部からIDを登録・診断から再発行する口は作らない。

## 5 再入時停止・legacy入口の合流

共有ownerがある間のinnerは、requested roleの最初のbusy拒否とinterrupted=trueだけを原始記録する。own attemptedがfalseでも拒否履歴が残るので、後日そのroleを新規として再開しない。outerは同roleなら先行busyを、peerならscan_interruptedを保持し、通常のentry／固定検査へ戻らない。

| ID | 同creatorの入口 | active時の固定動作・保持 |
|---|---|---|
| RI01 | 新scan入場 | EN02でinner拒否。捕捉・owner取得・tail claim・native操作0、false復帰 |
| RI02 | 旧requestJoinPrecall | role別busy判定より前に共有ownerへ合流。peer経路から旧reflectionを起動せず、false復帰 |
| RI03 | retained executor／fulfilled／rejectedの3closure | origin／shell fieldを読む前に共有拒否へ合流。handler metadataやslotを書かずundefined復帰、settler／観測呼出し0 |
| RI04 | private prepareRunShell／prepareCleanupShell／prepareJoinHandlers | active区間では準備再開・失敗metadata書込みをせず、共有拒否のみでfalse。通常の事前準備経路は維持 |
| RI05 | active終了後のrole拒否履歴 | legacy入口もpair非補完・再試行禁止を守る。最初の192IDを5値へ戻さず、slot／metadataの第二writerで履歴を補正しない |
| RI06 | 別creatorの入口 | そのcreatorの共有scalarだけを扱う。同値root／roleでouterのownerや中断bitを共有しない |
| RI07 | 通常execute／close／全停止event | 本書で新しい接続・抑制を承認しない。実runtime・本番停止／live pinのgateは別に維持する |

RI02〜04は将来必要な最小prefix変更の範囲である。現行の「旧本文byte不変」を、そのまま新入場の再入安全性へ流用しない。各prefixに入る前後のlegacy期待値、定義済み返却値、製品caller／公開surface不変を新旧両方の対照で確認してから接続する。prefix外の制御・通常実行を変更しない。

innerは外側のbusy／owner／tail claim・entry facts・計数を更新せず、descriptorやmetadata helperを呼ばない。よってinnerから次の依存呼出しを介した再帰は作らない。interruptedが既にtrue、primary／revokedが同じ値でも、outerは通常進行へ復帰しない。未知のwriter経路がRI表を迂回して同slotへ触れるなら、入場とtailの接続を完了扱いにしない。

冪等stopのevent捕捉は、entry値の同値比較だけでは保証できない。本書の共有bitはRI01〜04の同root再入に対するもので、全停止入口の調査・VM／監視調査やlive pinを代替しない。通常execute／async closeを再入用の試験bodyとして起動して、この限定単位のPromise生成0を崩すことも行わない。

## 6 固定failure tailへの一度限り移譲

現行reflectJoinPrecallFailureは共有ownerを確認せず、slot確認後に可変のshell期待参照を選び直す。その全体を新tailとして無条件に呼ばない。新tailは同frameの対象を固定し、既存recordJoinExecutionFailureの原始writerだけを再利用する。cold保持は対象固定のprivate継続へ限定抽出し、外部入力・操作表・公開handleを増やさない。

| ID | 順序・条件 | 許可する操作・拒否時保持 |
|---|---|---|
| TL01 | 最初の完全pair確定→phase=refusing | active用のcheck=null guardを再利用しない。先行理由があるため成立しない正常guardを、例外で迂回しない |
| TL02 | frame退出権・実共有owner・同role claim／busy・捕捉参照の継続を照合 | root／recovery／slot／shell／identity／pinの期待参照がentryから変わればnative操作前に止め、元refと未確認を保持。拒否によるprimary／revoked変更は正常guardとの差として許す |
| TL03 | tail claim=true→phase=tail | native操作より前の唯一の消費点。throw・再入・部分結果・catchから二度目を起動しない |
| TL04 | 捕捉slotの非Proxy確認→捕捉subjectの非Proxy可否を固定 | subject不在／不適格はcold不可であり、適格slotへのprimitive反映まで一律放棄する理由にはしない。subject選び直し0 |
| TL05 | faultAt→fault→phaseの3descriptorを順次再取得 | own data／writableと既存の有限fault／phase値域を確認。通常scanの古いwritable結果や正常seed値を再利用しない |
| TL06 | 最後のdescriptor退役→同roleのprimitive failure反映 | 同canonical slotへconstructor_preと保持codeを渡す。元fault／site／primaryを維持。descriptor後からwriterまで未知呼出し0 |
| TL07 | primitive反映済み・対象固定・cold可の分岐だけでreadiness→retention | private継続は捕捉subject／slotとの同一性を先に照合し、対象をroleから再選択しない。各1descriptorとown data／writable guard後のwriteだけ |
| TL08 | 固定tail終了または途中拒否→phase=exiting | native tailの完了・false復帰をcleanup確認済み／全解放へ昇格させない。catchは最初の理由とclaimを保持するだけ |

tail-specific guardは共有中断=trueを許す。中断後の通常進行を再開するのではなく、既に保持した失敗を固定対象へ限定反映する責務である。innerはRI表により対象slot／metadataを変更できないため、tail内の再入でも第二tailや対象変更は起きない。canonical期待参照が実際に変わる・pairが部分化する等の不整合では残りのtailを止める。

cold継続はprimitive反映の直後に対象固定で呼び、旧helperの可変globalからのsubject再選択や未確認slot fieldの直接読取りを持ち込まない。metadata異常は各field独立の未確認保持とし、片方の失敗でslot理由を失わず、もう片方を試す順も固定する。native操作がthrowしても外部message／stack／codeを保存しない。

信頼境界は管理された同realmの捕捉済みnative操作である。合成故障は、その操作のthrow・RI表への再入・操作前から存在する不正dataを扱う。任意のcaller関数が検査済みfieldを直後に差し替える操作表を製品へ注入しない。そのようなintrinsic自体の侵害まで、有限の再確認だけで安全にできたとは扱わない。

## 7 外側退出・失敗prefix・保持責務

| ID | prefix／終了位置 | 外側の固定責務 |
|---|---|---|
| XT01 | EN05前の未入場拒否 | shared owner／busyに触れずfalse。履歴／部分pairの非補完を守り、native tail0 |
| XT02 | reservedだがowner未公開 | 自分の予約した退出範囲だけを閉じる。設定済みown busyを戻すが、attempted・拒否・計数は保持。tail0でUnknown |
| XT03 | owned／refusing／tail | local退出権と実共有owner=当該roleを確認し、尾部完了までownerを保持。元slot／shell等の保持先をnullへ戻さない |
| XT04 | local descriptor／key／借用の退役 | mutable一時結果は先に退役。readonly entry参照はframe退出で使用資格を終えるだけで、明示clear・GC・完全回収済みとは呼ばない |
| XT05 | finallyの最終原始群 | 所有を確認できたframeだけがown busy=false→scanOwner=none。attempted／pair／計数を戻さず、phase=exited_retained、false復帰 |

ownerが別role等へ不正に変わった場合、outerはそのownerやpeer busyを解除しない。自分のbusyも所有不明のまま補正せず、最初の理由・元refを保持してUnknownとする。scopeを再生成して見かけの初期値へ戻さない。

共有interruptedは、退出時に拒否履歴と一緒に消さない。次の適格な別roleの初回入場が、owner=none・自身の履歴なしを確認した後だけfalseへ初期化できる。同roleの再試行、peer busy拒否のあったroleの再利用はない。readonly entryの移譲は同frameからtailへの使用責務だけであり、別owner・後続jobへ移すものではない。

## 8 費用所有・受入条件・実装分割

空の入場単位は固定検査のdescriptor／ownKeys／freeze／prototype取得0、scanEffectAttempts／LastCompletedも0を維持する。tailだけが最大5descriptor・5own tag・2非Proxy＝12 native操作で、元run ownerの既存tail予約に属する。IDの型拡張・primitive記録・entry／退出比較はこのnative操作数へ混ぜず、追加の比較／helper call費としてsource coverageを別に確認する。tail予約を実行済み12と報告せず、実budget更新・clock／sample／remaining／floor変更は0。

再入1callあたりのnative操作は0であり、sourceに新しいcallback／依存呼出しを置かない。ただし外側のnative操作数だけから、任意回数の外部再呼出しを含む全CPU費を上限保証しない。独立合成対照は一行一故障位置・一再入を基本とし、同role／peer・前後2イベントの有限複合対照を追加して、最初の理由と非返却を確認する。外部driverの無制限呼出し・native内部費・backing容量はUnknownで、期限を緩めない。

| ID | 後続の独立合成受入条件 |
|---|---|
| AC01 | fresh同ownerのentry値が一度だけ捕捉され、raw root／4参照のforeign・copy・Proxy・null期待値をhook0で拒否する。caller baselineの採用口0 |
| AC02 | EN05〜07の各生成prefixで停止し、owner未公開ではtail0、公開済みだけ最大1tail。退出権の先行保持と実prefixを別に確認する |
| AC03 | RI01〜04のsame-role／peer再入でinner native0・inner解除0、outerの通常進行停止・最初のbusy／scan_interrupted保持。別creatorは不変 |
| AC04 | 192ID全てが同じ既存role欄へ保持可能で、旧5値へ縮退しない。最初のID／code／primary・拒否siteを上書きせず、部分pairを補完しない |
| AC05 | entry5値の各driftと、同値の先行HTTP／失効factsを分離する。値一致を全停止event検出・本番live pinと報告しない |
| AC06 | tail中の再入・descriptor各位置throw・不適格slot・shell欠落・各metadata異常で、対象選び直し・第二tail・未知helper呼出し0 |
| AC07 | normal guardとtail-specific guardを分離し、拒否後の中断bitがtrueでも固定失敗保持だけが可能。canonical期待参照driftなら残tailを停止 |
| AC08 | 外側finallyの各prefixで、peer owner／busyを解除せず、自role attempted・pair・計数・元refを保持する。解放不明を成功へ補正しない |
| AC09 | 旧request・準備入口・3closureの非active期待値と新prefixの動作を両方確認。source／fixed dist・semantic・構文正常変異・配布の負の対照で新公開口／fixture共有0 |
| AC10 | 全entry通過でもcomposition拒否・false復帰、scan probe／alias供給／constructor／公開／dispatch0。native tail費と追加比較費・予約と実行数を区別 |

実装順は、CTの狭い型・192ID欄の保持規則と先行退出権→同owner入場／entry捕捉・RI合流→対象固定tailと外側finallyの順とする。各段階で固定拒否を維持し、固定検査へ進む前に入場と退出の失敗prefixを対にして確認する。scan・停止／live pin・alias producer・生成／観測／固定終端・root最終discardの接続は別承認の後続単位に残す。

本書は設計だけで、合成試験の実施・safe native取得・実会計・証拠発行を示さない。全体受付無効・Unknown・調査保留と全ての閉鎖条件を維持する。

## 9 今回の静的確認

2026-11-18：基準HEAD `93383af`のsourceと照合し、現行失敗ID判定192値・legacy拒否型5値、本文47設計ID・表6・相対link4の整合を確認した。入場制御17 local値・root14scalar・tail最大12 native操作と192値域の内訳の算術、表の列数・末尾改行・空白も確認した。製品ソースは基準HEADと同一で、tracked差分0・stage0、新規文書は本書1件だけだった。これは文書の静的確認であり、合成試験・compiled検査・build／packは実施していない。実装・scan・発行・コミット・Pushは行っていない。
