# WF-B：同issued/current格納・private実参照照合と初回rejected保持の接続差分

Version: draft-0.4 / Date: 2026-11-12 / 読み取り基準HEAD: `1f41240`（格納前準備実装: `10e2f96`、等価判断の文書更新: `1f41240`、draft-0.1レビュー修正基準HEAD: `5525b2f`、§14の限定実装基準HEAD: `ad00f28`、§15の完了／未接続停止差分設計基準HEAD: `ebe739e`）。

draft-0.1のレビュー修正：§5の表のrejected_before行は、現在境界をどうするかを書いていなかった。RW05の時点で境界はすでにafterなので、G_Jの「境界after」が何の変化を記録するのかが読み取れなかった。§4の「各beforeでは最後のstepを維持して境界before」と揃え、rejected_beforeでstep currentのまま境界をbeforeへ移してから資格を再確認すると明記した。G_Jの記録内容と初回失敗位置（failureStep current／failureBoundary after）は変えない。

Status: **§14の参照writer・実照合・初回rejected保持を合成依存限定で実装。pin confirmed・PC08・C-03は未接続。** 親は[格納・PC08未接続停止設計](BEST_PRACTICE_WFB_BODY_PIN_STORAGE_RETURN_STOP_DESIGN.md)と[private pin設計](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)。前段実績は[準備検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_STORAGE_PREPARATION_2026-11-12.md)、今回実績は[格納・保持検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_REFERENCE_STORAGE_2026-11-12.md)。§1〜13はdraft-0.1／0.2時点の設計／文書確認であり、未実装・未実施の記述は当時の状態。最新の限定範囲を§14で区別する。

正式発行口・既存C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装は§14の合成依存に限り、実接続・実通信・実機操作・設定変更・Pushは行わない。

## 1 現行との差分と閉鎖到達点

現行createProbeBodyPinStorageFakeは元constructor／prepare／frameから同receiverへ入り、trialを一度記録するが、before_issuedの再検査後にpin_storage_not_connectedで止まる。receiverはattempting／step attempt／境界before、9参照は空である。値専用10variantのうち格納後7variantは実slotの証拠ではない。

将来の本差分にはconstructor固定の別合成継続を用いる。仮称createProbeBodyPinReferenceStorageFake／wfb-body-pin-reference-storage-1とし、既存factory・script・返答・期限・runtime／旧facade exportの期待値を維持する。新factoryもpackage除外の開発入口に限定する。任意boolean／callback／登録APIで返却済みrootを昇格させない。元before_issued検査までを再利用し、旧blocked／固定拒否より前のprivate分岐だけから入る。

本差分の正常中間到達点はissued=current=元source、rejected空、stage captured／step current／境界afterまで。実参照postを通した後もreceiver_unconfirmed／rejected_attemptで固定停止し、rootはconstruction_unconfirmed、別modeの固定返答はpin_confirmation_not_connectedを予定する。これは確認未接続の診断であり、accepted・pinStage confirmed・checkedへの進行・PC08・BP04・C-03・readyを与えない。既存callerのaccepted拒否は維持する。新返答の分類も同新modeの厳密な中間状態に限り、旧attempting用分類を広げない。

## 2 正規生成元・同一性と所有権

記号Rはlexicalな元root、SはRの正規source、Tは同binding.target.start、I／C／JはTのexpected-source issued／current／rejected実slotとする。元rootのsource issued=current=S、source rejected不在、metadata9・進行13field／22keyの正規構造、同shell／frame／binding／link／duty／control／failureの既存関係を検査する。bindingOwnerとcellOwnerの元関係を保ち、両者を新たな単一ownerへ置換しない。

RがSの所有者であり、I／C／JはTが同試行の責務として保持する借用参照である。格納でsource利用claimを消費せず、別source owner・claim台帳・friend・実sessionの発行元を作らない。通常経路のS供給元は元rootのprivate実発行slotだけ。公開projection・同値copy・brand／同ownerの自己申告は供給根拠にならない。

元root／同startを固定accessで先に認証し、その後だけTのprivate fieldを読む。候補S／C／Jから.custodian等を探索せず、getter・Proxy trap・任意method・reflection・deep equalityを呼ばない。foreign入場は相手の参照・診断・試行履歴へ書く前に拒否する。

## 3 内部境界・先行fieldとprivate照合

既存の先行9参照・trial／stage／step／現在境界・first／失敗位置を再利用する。private owning checkerの既存entry／attempted／before_issuedを維持し、必要なissued／before_current／capturedだけを追加する。checked／confirmedは値検査のままにする。初期9参照全空checkerを格納後へ流用せず、SourceProvenance・未使用base・空BS13carrier・空payload6参照とfree／empty／prefix noneを安定部分として使う。

新private readonly照合は元module内の固定accessに置き、実I===S、実C===IかつC===S、実J不在を直接確認する。公開viewのissuedSame等を受け取って真とする入口は作らない。原始値checkerの正例と、同ownerの実fieldを読む正例は別の保証として記録する。

初回rejectedの確認区分には、先行literalの内部scalar RejectedHoldState=`not_started | retained_unconfirmed | confirmed`を提案する。後2つは「既に捕捉した候補参照の局所保持」の区分だけで、pin confirmed・解放完了・cleanup証拠ではない。新raw参照slot／receipt／外部claimは増やさない。公開時はstrictな固定enumへ投影し、不正値はunconfirmedとする。この追加scalarと新modeの返答cache／有限観測点は次回実装で明示的に計上し、既存実装済みとは扱わない。

## 4 格納の固定scheduleと同期群

検査順は、正規R/S/T→既存停止／first→同call区間・busy／trial→元来歴・安定部分→狭いphase／原値→実参照とする。同一性未確認の候補から他のfieldを読まない。停止後は新格納せず、最初の理由と既存prefixを保持する。

| ID | 操作と確認 | 完了後の保持prefix |
|---|---|---|
| RW01 | 元before_issuedの全検査。I/C/J空、trial=true、attempting／attempt、境界beforeを確認 | A：参照なし |
| RW02 | G_I：I=S→step=issued→stage=issued→境界afterを直接記録 | I：I=Sだけ |
| RW03 | issued後の許可観測→同owner／実I／空C/Jをpost確認。境界beforeへ進め、before_currentで再確認 | I、境界before |
| RW04 | G_C：C=I→step=current→stage=captured→境界afterを直接記録 | C：I=C=S |
| RW05 | captured後の許可観測→同owner／実I/C/Jと安定部分をpost確認。不一致は§5へ分岐 | C又は失敗prefix |
| RW06 | 正規Cだけで固定未接続診断を一度記録し、rejected_attemptで復帰。callerは新mode限定の固定停止へ合流 | capturedのまま、ready=false |

G_I／G_Cは既に入った保護区間内の固定private fieldへのliteral／同参照代入だけとする。群内にhook・guard・script・allocation・access呼出し・reflection・await・任意callbackを挟まない。試験観測は群の直前又は全代入後だけに置く。群途中の通常script故障を許容prefixにしない。これは同期的な非介在の契約であり、OOM・プロセス停止等に対する物理atomicityの証明ではない。

各beforeでは最後のstepを維持して境界before、群完了後は新step／afterとする。RW05後にstep checkedへ進めたり、成功を通知したりしない。finallyで解除するのは既存receiver entryBusyとcaller callActiveだけであり、参照・trial・stage・firstは解除しない。

RW05では正常checkerのfalseを先に一律state_invalidへ変換しない。元来歴・停止・狭いphase・Iの正規性を確認した後、実Cの一致／欠落／不一致とJの占有を区別する。不一致だけが§5の資格検査へ進み、欠落・他の不正は既存slotを保持して固定拒否する。正常checkerそのものへ「C不一致でも正常」という条件を足さない。

## 5 初回rejectedの資格・記録点と確認

通常writerは常にC=Iを記録する。C不一致の負の対照には、有限合成scriptであらかじめ作った同値copy QをRW04完了後の許可観測点でcurrentへ差し替える。未知候補の任意注入API・正規source／issued差替えを正常経路へ加えない。Qの属性は読まず、既に捕捉済みの実参照として比較する。

rejectedを記録できる条件は、正規R/S/T・同call／trialが活動中、元来歴とI===Sが有効、stage captured／step current、Cが非空かつI/Sと不一致、J空、hold state not_started、既存停止／firstなしである。C欠落・I不一致・不正phase・foreign入場はこの資格を満たさず、候補を新たにJへ格納しない。Jが既にあれば同じQでも再代入・第2候補の補完・交換はしない。

資格を満たした実Cだけを同期frame内の局所参照qとして捕捉し、G_Jの直前にはC===q、保持postにはC===qかつJ===qを照合する。qの供給をcaller引数や公開viewで代用しない。qは既存Cを保持した比較用借用であって新owner／永続slotではなく、失敗後にqだけを捨てて元C/Jを解放済みにする根拠にもならない。

| 境界 | 固定処理と責務 |
|---|---|
| rejected_before | step currentを維持して現在境界をbeforeへ移し、許可観測の後に上記資格を最後まで再確認。close／priorがあれば追加保持せず、既存Cと未確認責務・境界beforeを残す |
| G_J | J=C→hold state retained_unconfirmed→境界after→receiver初回binding_mismatch／phase pin／failurePrefix none／failureStep current／failureBoundary afterを固定記録 |
| rejected_after | 失敗専用postで同owner・元I・C/J同参照・狭い保持状態／既知診断を照合。成功した直後にhold state confirmedとする |
| 固定復帰 | 必ずrejected_attempt。保持確認済みでも通常比較・pin confirmed・PC08へ戻さない |

G_Jにも§4の非介在条件を適用する。資格確認からG_Jまでの間に外部hookを置かず、最初のbinding_mismatchはG_J内で記録する。先にreceiver firstを失敗へ変えてから「自分の理由だから停止を無視する」という経路は作らない。判定中の局所理由は権限／保存済み診断ではなく、再試行にも持ち出さない。

rejected_afterは正常checkerへの広いORではなく、binding_mismatchが既に同G_Jで記録済みであることだけを許す失敗専用契約とする。root／sourceの先行停止・別firstを許す根拠にはしない。実J===実Cとその時点のCが保持対象Qのままであることをprivateに確認する。照合からconfirmed代入の間もhookを置かない。post前のclose・throw・不一致ではJをclearせずretained_unconfirmedのまま保持する。ここでconfirmedでも解放や利用可能性を与えない。

## 6 失敗prefix・元slotと未確認責務

| 失敗位置 | 最後の実保持 | 失敗後の固定責務 |
|---|---|---|
| RW01前／格納前 | I/C/J空、attempting | trial・初回位置を保持し、格納を開始しない |
| G_I後／RW03 | I=S、C/J空、issued | Iを元slotに保持。currentを補完せず、巻戻し／再試行なし |
| G_C後／RW05の通常失敗 | I=C=S、J空、captured | 両参照を保持。checked／confirmedへ進めない |
| C=Q検出後、G_J未開始 | I=S、C=Q、J空 | 停止／firstがあればJへの追加格納をしない。C由来の未確認責務をTと元Rが保持 |
| G_J後、保持post未確認 | I=S、C=J=Q、retained_unconfirmed | 元C/J・最初のbinding_mismatchと確認未了を保持。clear／置換／再確認試行なし |
| 保持post確認済み | I=S、C=J=Q、hold confirmed | 局所保持確認だけを残す。失敗を成功へ戻さず同固定拒否へ合流 |

I不一致はbinding_mismatch、phase／原値・空であるべきslotの不正はstate_invalid、停止は既存理由／closedを保持し、未知throwはreceiver_unconfirmedとする。複数不正時は§4の検査順を優先し、未読候補の推測で理由を上書きしない。既に記録済みのfirstは分類より優先する。

catch・close・返答生成失敗でも元slotは修復／空化しない。元rootはSの所有を保ち、同startはI/C/Jと局所未確認責務を保持する。root返答だけで責務を消したり、sourceの自己申告ownerへ返したりしない。固定clear／最終discard／root終端gateは別工程であり、本差分では解放完了を主張しない。

## 7 診断・停止と復帰位置の保持

receiverは最初のfirstとphase pin／failurePrefix none／実step／実境界を保持する。現在step／境界は初回失敗位置と別であり、後発観測点で初回位置を動かさない。格納前準備の境界noneを不正にbeforeへ丸めない規則も維持する。reentryはbusy／trialで拒否し、固定refusalだけを初回保持する。外からの拒否がI/C/Jや元firstを変える経路は作らない。

callerは固定primitiveが戻る前はBP03／call／before、戻った後だけcall／afterである。sourceはBP03／call・claim unusedのまま、source boundaryをcallerのafterへ同時更新しない。callee捕捉後でもPC08 returned照合・source preparing・BP04は未接続である。

receiver_unconfirmedはroot construction_unconfirmedへ写像し、binding_mismatch／state_invalid／closedは既存写像を保つ。ただしroot／source／receiverの初回理由は独立に先行保持する。例えばG_Jのreceiver binding_mismatchの後、復帰前closeがroot closedを先に記録した場合、rootをbinding_mismatchへ上書きせず、child理由と未確認保持を併記する。source metadata未確認ならsourceへの診断書込みを増やさずrootが未確認責務を保持する。

診断・返答cache・trial／call履歴はclose後も返却しない。同期closeはcache返却より先に通常利用を閉じ、新writerを拒否する。公開projectionは固定enum／strict boolean／保持の有無だけで、S/Q・owner・brand・Error／message・任意source値を出力しない。保持確認stateは新mode限定で投影し、旧allowlist／返答を変えない。

## 8 実装配置・権限と旧経路の維持

将来writerは既存package除外composition内の同receiver classに限定する。root側はconstructor固定mode・元canonical source／startの資格・新modeの固定停止／投影を担当し、receiverの実参照更新を公開writerへ委譲しない。固定accessはmodule-privateの同class static初期化で一度だけ定義し、そのexport・fixture登録口・runtime friendを加えない。開発factoryからも実参照型／格納accessは出さない。

通常writerの許可はIのRW02、CのRW04だけ。Jは§5のG_Jだけ。負の対照によるC差替えは新modeの列挙scriptに限定し、通常writerやruntimeへ流さない。source claim・payload6参照・BC13carrier・ready・body・Journal／clear・root終端のwriterは禁止する。旧call／準備factoryは従来の空参照固定拒否を維持する。

## 9 等価判断の再評価

[親§14](BEST_PRACTICE_WFB_BODY_PIN_STORAGE_RETURN_STOP_DESIGN.md)の5節は格納前準備だけの等価判断である。本差分で自動的に「非等価」へ反転させるのでも、無条件に継承するのでもない。

| 再評価対象 | 必要な個別対照 |
|---|---|
| receiver first noneの初回保持 | G_J→保持post故障→catch／closeで後発診断要求が発生するかを実経路で確認。最初の理由／step／境界の差を比較する |
| storageModeのidentity | 唯一の元組だけが到達し続けるか、新分岐／供給経路が増えるかを特定。旧call modeの固定mode節は別の非等価対照を維持 |
| storageEventのmode節 | 新writer入口がconstructor固定modeからしか来ない根拠と、旧modeの無書込みを独立確認 |
| storageEvent／storagePointの各identity | 最終照合とwriterの間に許可観測／差替えが入る場所を区別。重複のままならその区間を記録 |
| source／receiver postの実参照節 | 値viewだけでなく実I/C/Jの単独故障で最初の拒否点又は保持prefixが動くことを比較 |

節除去で後段の一律拒否だけが同じなら意味的killとはしない。型／構文失敗・anchor消失・外側timeoutもkillに数えない。未観測の節は未確認、重複防御は条件付き等価として残し、全節感度や全所有権保証の完了を主張しない。

## 10 独立合成・compiledの受入条件（すべて未実施）

| ID | 必須条件と負の対照 |
|---|---|
| RE01 | 旧call／準備入口の返答・script・期待値・期限・空9参照を維持。新中間正例だけI=C=Sを実保持しcapturedで固定停止 |
| RE02 | R/S/T・元metadata9／進行13field・別owner種の関係を単独混入。同値copy／Proxyでもhook 0、foreign相手のslot／first／trial不変 |
| RE03 | 独立event oracleでRW01〜06のI/C/J・stage／step／境界・trial／busyを予測。群内観測／allocation／任意callなしを構造対照でも確認 |
| RE04 | 各許可観測点×throw／close／prior／再入で失敗prefixと未実施suffixを比較。finally除去はbusy残留を検出し、参照clear／履歴返却も検出 |
| RE05 | 実I不一致／C欠落／実C同値copy／J既存／phase不正を区別。値checkerのissuedSame等だけを偽装してもprivate照合を通さない |
| RE06 | captured Qだけを初回Jへ保持。foreign入場・停止後・first既存・I不正では新Jなし。同じ候補でも2回目代入／第2候補置換／再試行なし |
| RE07 | G_J直後のhold未確認とpost確認済みを区別。post前のclose／throw／参照不一致でJと初回binding_mismatchを保持し、pin confirmedに昇格しない |
| RE08 | root先行state_invalid／closeとchild binding_mismatchの組合せ、BP01生成診断・caller before/after・source callを個別比較。初回軸／返答cacheを保持 |
| RE09 | semantic compile-failでprivate access／writerの外部呼出し、不正phase／状態組、readonly metadata更新、公開診断からの実参照復元を拒否 |
| RE10 | 新projectionの固定allowlist／strict値・凍結有限graph・raw参照／秘密非出力。新model以外のallowlist／exportを拡張しない |
| RE11 | class／method／field単位の書込み監査、source claim／payload／BC／ready／body等の禁止書込み0、配布物のfixture混入0と負の対照 |
| RE12 | 中間capturedやhold confirmedをaccepted／PC08／C-03へ昇格できない。各拒否後の第2prepare／再入／closeでも元prefix・Unknown・閉鎖不変 |

oracleは実装のbuilder／schedule／checker／counterをimportせず、原始event列と独立条件式から期待値を算出する。実I/C/Jを変える対照と原始値270field等の既存対照を分け、旧実績を新writer成功の件数へ足さない。新modeの成功とは閉鎖中間モデルの期待どおりの停止だけであり、正式な受理・解放確認・全体受付成功ではない。

## 11 追加費目とUnknown

追加論理費目は新modeの先行scalar／cache、保持確認scalar、狭いphase／private実参照照合、G_I／G_C／資格を満たすG_J、失敗専用post、初回診断と固定拒否・投影である。候補Qの構築は合成故障準備の費目として分離する。既存root／source／frame／duty／receiver9参照・busy／trial・PC01／CR04予約を再発行／二重計上しない。

固定個数のslot／22key／metadata9／13carrierだけを有限に検査し、任意長履歴・探索・retryを追加しない。群の代入回数を実allocation量又は全work証明へ読み替えない。実E／S要求量、unit係数・layout／GC／OOM、全guard数・停止後解消予約・診断必着・全体work上界はUnknown。既存期限を延ばさず、残時間からdeadlineを再計算せず、実予算・capを更新しない。

## 12 次段階へ残す境界

checked／confirmedのwriter・全postとcallee accepted、PC08の同source／同start・実保持／confirmed・両busy解除後の復帰照合、C-03のBP04、source利用claim消費・payload借用／bind・構築ready・bodyは別承認とする。本書の中間固定停止から自動再開しない。

J保持は元候補を失わない措置であり、元slotのclear・cleanup・解放・最終discardではない。局所未確認責務の回収とroot終端gateの接続も別工程に残す。親の通常完了例receiver first none／pin_return_not_connectedは将来の全確認後の契約であり、本差分のcaptured／receiver_unconfirmedと混同しない。

## 13 今回の変更範囲と文書検証

今回は本書と親2文書のMarkdownだけを更新する。ソース・試験・compiled fixture・CHANGELOG・既存検証記録・manifest／lockfile・設定は変更せず、build・合成／compiled試験・梱包・index登録・コミット・Pushは行わない。RE01〜12は将来の受入条件で、未実施のままとする。

文書検証結果（2026-11-12）：変更3文書のローカルリンク29件に欠落なし、20表の列数・末尾改行・行末空白に異常なし。本書13節・親15／19節の順序とRW01〜06／RE01〜12の重複・欠落なしを確認した。現行sourceの空9参照・格納前固定停止・private checkerの3phase・accepted拒否／caller位置写像と、親§14の5等価判断を読み取り照合した。差分はMarkdown3文書だけ、indexは空、HEADは`1f41240`から変更していない。これは文書整合の確認であり、新writer・保持post・全費用の受入成功ではない。

## 14 同issued/current格納と初回rejected保持の限定実装（2026-11-12）

package除外のcreateProbeBodyPinReferenceStorageFake／wfb-body-pin-reference-storage-1を追加した。constructor固定modeから元before_issuedまでを再利用し、同R/S/T・未停止・同call／busy・狭い段階・空payload／BSを検査する。G_I／G_Cは同sourceを既存slotへ直接保持し、issued／before_current／capturedの値検査とprivate実I/C/J照合を組にした。旧call／準備factoryの参照空・返答・期限は維持する。

有限script用copyは正規sourceを確認した区間で、参照記録群より前に準備する。負の対照のcurrent差替え／欠落は専用private fault methodだけ。正常writerはC=Iであり、同値copyを正規Sとして採用しない。captured後はC欠落・I不一致・phase不正・J既存を通常不一致候補から分離し、正規trialの既存CだけをG_Jで保持する。rejected_beforeはstep current／境界before、G_J後はafter。保持post確認済みのhold confirmedはpin confirmed／cleanup確認ではない。

新startにはhold stateに加え、literal falseのreferencePostCheckedを先行配置した。これはcapturedとblockedの実照合を両方通した直後だけtrueにする局所中間診断で、権限・receiptではない。captured直後のthrowでも実I/Cが存在するため、stage／同一性だけで通常返答を選ぶと未確認prefixまでpin_confirmation_not_connectedになることを回帰で検出した。新modeの通常返答はこの原値trueも必須とし、途中throwはconstruction_unconfirmedで区別する。旧caller分類と旧projectionは変更しない。

catch／close／再入後もI/C/J・trial・初回理由／step／境界・未確認責務を残す。G_J後のthrowでreceiver binding_mismatchを後発receiver_unconfirmedへ上書きしない。元root closed／state_invalidが先行する場合は別軸で残す。finallyは元の両busyだけを解除し、元slotのclear・source claim払い戻しはない。

[今回の検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_REFERENCE_STORAGE_2026-11-12.md)に、独立prefixの新50件、実slot故障・値view偽装の対照、固定3群・先行5scalar・private型拒否等を記録する。RE条件はこの中間範囲だけで照合し、全費用・全節感度・正式発行の証明にはしない。前段の診断初回guardはG_J→throw→catchの新経路で非等価となり、除去で先行理由喪失を確認した。他の4重複identity／mode節の旧等価判断は新caller増設だけで一律変更せず、固定組・固定modeの前提が続く範囲に限定する。

追加保持はstartのhold／中間post完了2scalar、rootの観測点／初回失敗点／再入結果3scalar・空返答参照と固定mode。新private検査・固定走査／診断・合成copy準備の費目を分け、既存owner／source22field／BS13carrier／9参照／call・trial予約を二重計上しない。実E／S・unit係数・layout／GC／OOM・全guard数／全体work上界はUnknown。pin checked／confirmed・accepted・PC08・C-03・claim消費・payload借用／bind・ready・body起動・Journal供給・clear／root終端・正式発行は未接続、全体受付無効・調査保留を維持する。

## 15 pin confirmed・最終postとPC08未接続停止の差分設計（2026-11-12）

[完了・未接続停止の接続差分draft-0.1](BEST_PRACTICE_WFB_BODY_PIN_CONFIRM_RETURN_DESIGN.md)で、§12の次段階のうちchecked／confirmed・最終postとcallerの固定未接続停止を対にした。新継続の入口は同格納の中間post成功直後・既存receiver_unconfirmed記録前だけとし、失敗済みrootの再開やreferencePostCheckedの意味変更は行わない。hold confirmed・pinStage confirmed・最終post履歴も区別する。

before_final_postをconfirmed／step confirmed／境界beforeの専用phaseとして明示し、最終成功後は境界after・先行最終marker trueの固定群からliteral acceptedへ直結する。wrapperの復帰とfinallyは既存busy解除だけで、callback／allocation／新観測点を挟まない。callerは実primitiveとprivate原値の最小分類だけでPC08未接続停止へ合流し、returnedの全検査やBP04へ進まない。

現行callerのreceiver first none→receiver_unconfirmed写像・accepted一律拒否と、割当てを含む失敗位置生成は新modeで専用に分離する。上位の初回理由／実位置・sourceReasonを非割当てで先に固定し、返答生成失敗でも元参照・callee正常完了・未確認責務を残す。既存の初回J保持はcapturedの前段条件のままで、checked／confirmedの混入を新Jへ追加しない。

本節と子設計は文書だけ。§14の実装・旧factory・期限は変えず、新最終marker／確認writer／返却・caller分岐は未実装、FC／FEは未実施である。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。
