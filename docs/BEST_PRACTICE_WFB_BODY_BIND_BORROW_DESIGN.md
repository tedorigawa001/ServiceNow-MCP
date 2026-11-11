# WF-B body bind：状態型・phase検査と同startの先行borrow／診断slot

Version: draft-0.9 / Date: 2026-11-11 / 設計基準HEAD: `29c53e1` / レビュー追加: `5ec73dd` / 原始field限定実装基準HEAD: `e6cc8cd` / 原始field実装レビュー修正基準HEAD: `41ac31f` / source生成・停止の設計基準HEAD: `5873d16` / BS／BC分離実装基準HEAD: `f3b3721` / 合成source生成・停止実装基準HEAD: `311d3ef` / (C)pin差分設計基準HEAD: `b3776da` / C-01実装基準HEAD: `554ef9a` / C-02前半実装基準HEAD: `a3f1f66`。

draft-0.2のレビュー修正：`bodyFieldsIntact`のroot側2節（元baseの未使用、BC用shell未生成）は、単独で外しても試験が落ちなかった。root側inspectの`state`／`phase`／`failurePhase`／`reentry`のallowlistと、実body cellから導く`bodyStarts`の投影も観測していなかった。各節の単一注入と除去の対照、4つのallowlistと`bodyStarts`の対照をcompiledへ追加した。最初の失敗位置の上書き防止と、`checkBodyBindFields`冒頭の`#fixed`返却は等価と判断し、§10に記録した。

Status: **内部型・原始先行field・固定診断／projectionと実行拒否、およびBS／BC最小分離・BP00〜01合成source生成／確認・同期停止までを合成依存限定で実装。** 実装範囲は§10・12〜13と[field限定検証記録](E2E_BEST_PRACTICE_WFB_BODY_BIND_FIELDS_2026-11-10.md)・[source生成／停止検証記録](E2E_BEST_PRACTICE_WFB_BODY_SOURCE_ISSUER_2026-11-11.md)を基準とする。pin・claim消費・bindは未接続、§1〜9と各段階の記述は作成当時の範囲で、受入表全体の成功を意味しない。親は[先行slot／固定構築設計](BEST_PRACTICE_WFB_BODY_SLOT_CONSTRUCTION_DESIGN.md)と[live slot／bundle生成設計](BEST_PRACTICE_WFB_BODY_LIVE_SLOT_BUNDLE_DESIGN.md)。前工程の実績は[BC12／13検証記録](E2E_BEST_PRACTICE_WFB_BODY_BUNDLE_DRAFT_2026-11-10.md)を参照する。

`5ec73dd`のBC12／13 mint前base対照と、rejected節の等価性に関する既存レビュー訂正は保持する。同commitで先に取り込まれたlive／bundle親文書の本書への参照も維持する。ソースの生成／保持経路に変更はなく、本書はこれらの検証実績をbind成功の保証へ拡張しない。

正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。本書は実装・構築ready・body起動・実接続・実通信・設定変更・Pushの承認ではない。将来の合成依存限定BD00〜04とその先行準備だけを設計し、BD05のready、BA／body、BU／退出、request／回収・field clear・borrow退役／owner解放・正式証拠・実予算更新は対象外とする。

BP02〜04だけの現行差分設計は[段階別検査・同root／同startのprivate pin接続 draft-0.1](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)と§14を参照する。以下の将来全接続順とは区別し、(C)の正常案もBC00未開始・claim unused／payload空の閉鎖保持で止める。pin・bindの実装状況は変更しない。

## 1 現行からの差分と採用する境界

現行BC12／13は同rootで13行をconfirmedにし、全post後にBC用shellをheldへ固定してbundle_held／ok=falseで止まる。BodyPreparationShellのready／bindAttemptUsed／bindStageはreadonly false／false／not_attempted。bodyLivePrefixMatchesはbuilding／bind未試行を含むため、held後やclaim消費後のbind判定へそのまま流用できない。同RetirementStartAssemblyにはbody専用borrow／診断fieldがまだない。

差分では**BC用shellを広げず、同rootにbind専用の先行状態を追加する**。sourceの新しい利用claimはその状態だけを正とし、旧BC用shellのfalseを実際のbind未試行の証拠として新経路へ読み替えない。旧seed／live／bundle入口と返答・旧検査を維持し、新経路は同構築中rootの固定private継続として別途選択する。既にheldになった旧入口を第2prepareで再開しない。

| 親設計の案 | 本差分で固定する扱い |
|---|---|
| BD01でsource shellのbindAttemptUsedをtrueにする | BC用shellではなく新BodyBindSourceShell.claimをunused→spentとする。第2の利用claimを既存fieldへ重複記録しない |
| 同startのbundle current／issued／初回rejected | bundleとdraftを別々に先行保持する。格納occupancyは両方をまとめて最大1回 |
| 同startの空borrow slot | body専用payload6参照がundefinedかつoccupancy=free。先行expected-source pinが存在してもpayloadは空である |
| 13行全検査 | 安定参照／Initial data検査と、source／receiverのphase別検査を分ける。buildingやunusedの一括OR緩和は禁止 |
| bind後の成功 | BD04後はheld_unreadyだけ。BC用shellもheldにするが、root／shell ready=false・body実行閉鎖を維持 |

## 2 物理配置・内部型と書込み権限

唯一のcustodyは既存CanonicalGateDraftRoot、借用先は同rootのcontext.start＝同RetirementStartAssembly。新root／owner／frame／duty／予算は生成しない。以下は型名・field名の案で、public export／登録APIではない。

### 2.1 同rootの先行BodyBindSourceShell

rootのprivate fieldにsourceIssued／sourceCurrent／sourceRejectedを各1参照、初期undefinedで持つ。bootstrap位置・最初の失敗位置用の固定scalarを先行し、生成済みsourceが検査前なら元root failureとこれらのscalarで診断を保持する。未知のraw source fieldへ診断を書き込んでgetterを実行しない。

BodyBindSourceShellは専用private brandと次の固定fieldだけを持つplain dataとする。

| 区分 | field／有限型・初期値 | writer |
|---|---|---|
| readonly metadata | custodian＝同root自身、construction＝同BC用shell、binding／link／duty／control／start＝元正規参照、rootFailure＝元root failure | 固定producerだけ。新owner objectで代用しない |
| state | initializing／preparing／binding／held_unready／failed。初期initializing | 同rootの固定継続だけ |
| claim | unused／spent。初期unused | BD01の直接同期区間だけがspentへ変更。払い戻し不可 |
| call／stop／post履歴 | pinCallReached／bindCallReached／stopRequested／postConfirmed：boolean、全false | 各固定call直前・同rootのclose・BD04の全post確定点だけ。falseを未捕捉操作の不在証拠にしない |
| 現在位置 | phase＝none／BP00〜BP04／BD00〜BD04、boundary＝none／before／attempt／issued／captured／checked／call／after／held | 同rootだけ。receiverの内部prefixをここへcopyしない |
| 診断 | first、failurePhase／failureBoundary、refusal、deliveryFirst。全none | 同rootの固定記録点だけ。各firstは最初の非noneを保持 |

metadata8参照＋brandの9keyはnon-writable／non-configurable、上表の進行13keyはwritableなdata propertyとし、全shapeをsealする（計22 own key）。issuedをrootへ即時保持してから固定化し、同currentを捕捉・strict確認する。sourceRejectedは初回不一致候補だけを保持する。metadataConfirmedは同rootのprivate scalarで、sourceCurrent＝sourceIssuedとstrict確認後にだけ固定する。これは生成確認であって利用claimではない。postConfirmedもsource側の全post確認の履歴であり、receiver confirmedのmirrorや構築readyではない。

firstの新しい内部語彙はnone／binding_mismatch／state_invalid／closed／construction_unconfirmed／receiver_unconfirmed／post_unconfirmed。refusalはnone／in_progress／duplicate_pin／duplicate_bind／foreign_source、deliveryFirstはnone／delivery_unconfirmedとする。旧ProbeRunFirstへこれらを黙って追加しない。failurePhase／boundaryはnoneの組か、上記の具体的位置の組だけを許す。

### 2.2 同startの先行private field群

下記は同startのclass fieldとしてundefined／固定scalarだけを先行する。新しいreceiver object／配列／Promise／関数をfield initializerで生成せず、既存constructorの副作用を増やして診断前の確保へ移さない。

| 区分 | 固定field／初期値 | writer |
|---|---|---|
| expected-source pin | bodyExpectedSourceIssued／bodyExpectedSourceCurrent／bodyExpectedSourceRejected：各undefined | BP03のmodule-private継続だけ。初回rejectedだけ保持 |
| pin履歴 | pinAttemptUsed=false、pinStage＝empty／attempting／issued／captured／confirmed、初期empty | BP02〜03だけ。失敗で巻き戻さない |
| payload borrow | bodyBundleIssued／bodyBundleCurrent／bodyRejectedBundle、bodyDraftIssued／bodyDraftCurrent／bodyRejectedDraft：各undefined | BD02の固定受領点だけ。sourceの所有権は移さない |
| occupancy | free／used、初期free | BD02のreceiver preflight通過後だけ。bundle／draftで二重に消費しない |
| bindingState | empty／binding／confirmed／failed、初期empty | BD02〜03。失敗でもprefixを消さない |
| prefix | none／occupied／bundle_issued／bundle_current／draft_issued／draft_current／checked、初期none | 各保持直後に同receiverだけが更新 |
| 診断 | first、failurePhase＝none／pin／bind／post、failurePrefix、failureBoundary＝none／before／after、refusal。全none | 同receiverだけ。先行first・初回失敗位置を保持 |

receiver firstはnone／binding_mismatch／state_invalid／closed／receiver_unconfirmed、refusalはnone／in_progress／duplicate_pin／duplicate_bind／foreign_source。failurePrefixは上記prefixと同じ有限集合とし、現在の最後のprefixと最初の失敗位置を分ける。pinの失敗はpinStageを保持し、body payloadを補充しない。

field群は最大9参照で、正常はissued＝current、rejectedは不在。これを別object9個や解放確認済み9件と数えない。body用の診断は既存capture first／旧start first／回収理由を置換しない。原始値の返答生成が失敗しても、先行fieldに理由・prefixを残す。実OOMで診断が必ず返るという保証はUnknown。

## 3 生成順・発行元と先行expected-source pin

追加を選ばない旧入口の生成順・shape・phase番号は維持する。将来の新経路の順は次で固定する。

1. 同rootの既存failure／固定scalarを確保し、既存base37・probe8・run4・exit anchor5までを現行の順序で生成／postする。同startの追加field群はconstructor時点で原始初期値のみ。
2. 同rootのBS00〜14でBC用shell・array・13空carrierを保持する。
3. 下表のBP00〜04でsource状態を先行し、同startへexpected-source pinだけを結合する。claimはunused、payload borrowは空のまま。
4. BC00〜13と全postを行い、sourceのpreparing／unusedを維持したまま、BC用shellをheldへする直前の固定継続からBD00へ進む。
5. BD04まで通ればbindだけのheld_unreadyで止める。BD05へ進めない。BC途中で失敗すればpinと全生成prefixを保持して停止し、BDを呼ばない。

| ID | 固定操作 | 故障時に残す事実 |
|---|---|---|
| BP00 | sourceを固定producerで生成→root sourceIssuedへ即時保持→metadata固定／seal→同sourceCurrent捕捉 | issuedのみ・current・初回rejectedを区別。claim補充なし |
| BP01 | 全metadataの正規参照・shape／descriptor・初期値、同root issued=currentをstrict検査しmetadataConfirmedを固定 | 元root failureと最初の位置、source prefix |
| BP02 | 同startと既存binding／run／exit anchor、pin未試行・payload空を両側でpreflight。source pinCallReachedをcall直前に固定 | claim unused、pin呼出し未確認責務 |
| BP03 | receiverでpinAttemptUsedを最大1回記録→expected-source issuedへ捕捉→同currentへ捕捉→同一性検査→pinStage confirmed | pin到達prefixと元source。copy／foreign候補を初回だけ保持 |
| BP04 | sourceがreceiverのprivate pinと空payload・free occupancyを再検査しstate=preparingへ | 部分pinを消さず停止。BC00開始0 |

sourceの発行元は同rootの固定producerだけ。custodianは同rootの既存instance参照であり、受領側はmodule-privateなroot側照合継続で、実private発行slot・metadataConfirmed・sourceIssued＝sourceCurrent＝当該sourceを確認する。brand／shapeやcurrentとissuedという2つの引数だけを合わせても、同値copyを正規化しない。root照合は未知objectのmethod／getterを呼ばず、正規classのprivate保持を検査する境界とする。

expected-source pinは「このstartが後で受ける唯一の供給元」を先行保持するためのmetadataで、payload借用・body permission・run／dutyの第2claimではない。pinAttemptUsedはmetadata格納の重複防止履歴に限る。source生成確認、pin格納、source利用claim、payload occupancyを同じ成功booleanへ畳み込まない。

private照合・pin・bindは既存module内の固定継続からだけ呼ぶ。public factoryへのsource／bundle引数、artifact登録friend、外部callback・JSONからの復元、別assemblyの台帳共有は設けない。source／startを含むprivate参照graphは循環し得るため、deep freeze／再帰serializeを使わない。固定index・固定fieldだけを比較し、immutable metadataへ未来の子をbackpatchしない。

## 4 安定検査とphase別検査

新経路では次の3区分を分ける。旧bodyLivePrefixMatchesのbuilding／bind未試行条件をORで緩めず、旧入口とcompiled対照は維持する。共有する場合も純粋な安定部分だけを抽出し、source／receiverを同時にゆるく受け付ける汎用checkerを作らない。

| 区分 | 必須条件 | 判定してはいけないこと |
|---|---|---|
| DataStable | 元root／BC用shellの同参照・shape、ready=false／execution=closedと旧bind固定値、13carrierのindex／kind・confirmed／予約／call到達・issued=current／rejectedなし、BC01〜13の全関係／descriptor／Initial値 | source claimがunusedかspentか。BC用shellのbuildingだけでbind可とすること |
| BaseUnused | 既存seed／binding／link／duty／control／run seal／exit anchorと同start、use unused／duty not_owed／grant empty／body not_started／exit empty、capture未呼出し | body／unwind開始済みを許すこと。bindは既存run／dutyを消費しない |
| BindPhase | 新source state／claim／call／stop、実receiver pin／occupancy／prefixと同参照、first／close・現在phaseの許可組 | public summaryのsameOwner／保持件数／receiverの返答だけを証拠とすること |

bindingOwner＝元binding.owner＝同startのprivate owner、cellOwner＝元cells.owner＝同rootのprobeOwnerをそれぞれ検査し、両ownerの等値を新たに要求しない。BodyRoutePinとCanonicalGatePin、body originとframe originも区別する。body childがInitial値のままでも別duty／frame／sourceを受け入れない。

| source state | claim・call履歴 | receiver条件と許す処理 |
|---|---|---|
| initializing | unused、bindCallReached=false、postConfirmed=false | BPだけ。pinの初期／部分prefixを区別し、BC／bindへ進めない |
| preparing | unused、pinCallReached=true、bindCallReached=false、postConfirmed=false | BP04後の正規pin・free occupancy／payload空。BC00〜13→BD00だけ |
| binding | spent、pinCallReached=true、bindCallReached=falseまたはtrue、postConfirmed=false | BD01後。receiverは未呼出し／partial／confirmedを段階に応じて検査 |
| held_unready | spent、両callReached=true、postConfirmed=true | BD04後の正規pin・used occupancy・confirmed、bundle／draftの同参照。新規bind不可 |
| failed | 消費済みflag・call履歴・stop・postConfirmedを保存 | 診断・保持のみ。claim unusedでも再準備不可。後発故障で確認済みpostを消さない |

BC用shellはBD04完了まではbuilding、正常保持後はheld、失敗時はfailedとする。ready=false／execution=closed／旧bind fieldのfalse／not_attemptedは不変。新経路の公開診断は新source claimとreceiver occupancyを明示し、旧BC fieldをbind未試行の表示へ流用しない。

## 5 一度限りの消費と受領schedule

| ID | 同private継続の操作 | 一度限り境界／保持 |
|---|---|---|
| BD00 | DataStable＋BaseUnused＋source preparing／unused／stopなし・元firstなし、正規expected-source pin・空payload／free occupancyを確認 | claim未消費。拒否後もsource failedとして全参照を保持 |
| BD01 | source claimをunused→spent、stateをbindingへ直接同期固定 | allocation／hook／通知／awaitなし。以後払い戻し／第2bind不可 |
| BD02 | 同startの固定receiver呼出し直前にbindCallReached=true。receiverはsource private発行slot／pin・全metadata・BaseUnused／停止・free occupancyを再検査 | sourceのcall到達だけでreceiver捕捉を断定しない |
| BD02.1 | occupancy=used、bindingState=binding、prefix=occupiedを直接記録 | bundle／draftで共通の占有を1回だけ消費 |
| BD02.2 | 正規bundleをbodyBundleIssuedへ即時捕捉、次に同bodyBundleCurrentを保持 | 各保持直後のprefixを分ける。copyを採用しない |
| BD02.3 | 正規draftをbodyDraftIssuedへ即時捕捉、次に同bodyDraftCurrentを保持 | bundleだけ保持・draft未確認を成功化しない |
| BD03 | sourceのBC12／13 issued=current、receiverの両issued=currentと全child／同run seal、DataStable／BaseUnused／pin／停止を再検査しconfirmedへ | 初回不一致bundle／draftだけをrejectedへ保持。元payloadは消さない |
| BD04 | sourceがreceiverの実private保持・pin・used occupancy・confirmedと全参照、DataStable／BaseUnused／停止をpost検査 | 通過後だけsource postConfirmed=true→BC用shell held→source held_unreadyを直接同期固定。readyはfalse |

BD02.1〜BD02.3は独立のsource phaseではなくBD02内のsubstepである。内部境界はentry preflight／occupied／bundle_issued／bundle_current／draft_issued／draft_current。receiverが自分のprefixを記録し、sourceはcallee内部のphaseを想像して上書きしない。source postはmodule-privateな両側参照の再検査で行い、receiverの公開booleanを信用するだけの接続にしない。捕捉後の途中故障でcalleeの返答が届かなくても、両ownerの保持を確認できるまで借用未確認責務を残す。

BD04の3代入の間にallocation／hook／通知／awaitを挟まない。これはbind保持の事実を固定する区間で、BD05の構築ready／terminal commitではない。receiverのpost診断はBD03のconfirmed前の内部検査を指し、BD04のsource post失敗で確認済みreceiverをfailedへ書き換えない。

rootは全13data・source状態のcustodyを持ち続け、startは同bundle／draftを借りるだけ。bindに伴ってlive childをfreeze／cloneせず、BC06〜11のwritable Initial field・BC12／13のshallow freezeを維持する。source利用claimは最大1、receiver occupancyも最大1であり、既存use／duty／capture／回収claimは使用しない。

## 6 失敗prefix・停止と診断保持

| 位置 | 同root／startに残す事実・未解決責務 | 禁止する補完 |
|---|---|---|
| source bootstrap未捕捉／検査前 | 元root failure・bootstrap scalar、捕捉済みissued／current／拒否候補。raw sourceを信頼せず保持 | 診断必着／全allocationなしの断定、別source生成 |
| pin call前／途中 | sourceとpinCallReached、receiverのpinAttemptUsed／pinStage・expected-source prefix、payload空 | pin未実行の断定、pin解除・別sourceへの付替え |
| BC生成途中 | source preparingまたはfailed、先行pin、BCの到達prefix。利用claimはunused | unusedを再準備資格にする、pinを消して別rootで補完 |
| BD00拒否 | 13dataとpin、source failed／claim unused | source再prepare、別start選定 |
| BD01後・callee未確認 | spent、bindCallReachedの有無、全source参照とreceiver未確認責務 | claim返却、「borrowなし」の断定 |
| occupancy後・bundle／draft捕捉途中 | used、最後のprefix、全captured参照・初回候補、残る借用責務 | occupancyをfreeへ戻す、payload片側だけ解放済みにする |
| receiver confirmed後・source post拒否 | receiverの確認済み事実と全参照、source失敗／spent、元firstと失敗位置 | receiver confirmedを消す、別receiver再bind、ready成功化 |
| held_unready後・配送故障／close | 正規bind保持・spent／used・全参照と最初の理由＋delivery／stop | 巻戻し、二重bind、body開始、cleanup証拠化 |

root closeは既存root停止と同source stopRequestedを単調に記録する。source生成前／未確認なら既存停止とroot scalarを保持し、未知raw fieldへ操作しない。receiverは同一性確認済みのsource停止を検査し、close前後の新規pin／payload受領を止める。占有・捕捉済みprefixは消さない。BC07のbodyEntryClosedやBC09の禁止latchをcloseの代用に変更せず、旧start.request／drain／回収へ迂回しない。

進行中の再入・正常保持後の重複は固定refusalとし、元first・元の処理の継続／保持責務を壊さない。foreign source／start／pinは相手の正規payload・診断を変更せず拒否し、正規caller側へ固定理由を残す。expected-source／source claim／occupancyの使用済みを戻さない。

private戻り分類はaccepted／refused_existing／rejected_attemptの固定原始値で区別する。refused_existingを既存の正規sourceのfailへ流して、元処理を中断させない。rejected_attemptは当該callerの失敗として保持する。acceptedも資格証拠ではなく、BP04／BD04の実private参照のpost検査を省略できない。

rootの元construction first、source bind first、receiver first、配送未確認とrefusalを分ける。rootへ伝播するときはbinding不一致→binding_mismatch、不正状態→state_invalid、停止→closed、捕捉／post未確認→construction_unconfirmedの既存語彙へ固定写像し、詳細は新slotに残す。先行root firstがあれば上書きしない。raw例外・message／stack／cause・任意keyを読み取り／保存／出力しない。

## 7 公開診断・有限費目とUnknown

新経路の将来の値返答はok=false／authority=none／execution=closed／formalIssuance=closed／wholeRunAdmission=disabled／implementation=unknown／investigations=on_holdを固定する。source state／claim／call到達・stop・postConfirmed、pinStage、receiver occupancy／bindingState／prefix、固定first／失敗位置／refusal／delivery、保持・同一性のstrict booleanだけを有限schemaへ投影する。新model／列挙値は実装前に固定し、旧modelを拡張して過去のfalse fieldを成功証拠へ変換しない。

source／BC shell／custodian／expected pin／bundle／draft／childの参照・brand・owner派生値は出さない。不在はnot_created、不正値はunconfirmedとし、明示allowlistを通す。値返答・保持件数・summaryからprivate受領物を復元する入口はない。配送失敗でも先行scalarと参照を保持し、返答を作るための別failure owner／動的履歴は生成しない。

構造枠は同rootのsource状態1個（issued／current／初回rejected各最大1参照）、同startのexpected-source3参照＋payload6参照と固定scalar。BPのsource生成・固定化／seal、private発行元検査・pin格納／両側post、BDのpreflight・claim消費・占有／捕捉・strict／全post・保持／診断を有限費目として同gate／frame ownerへ帰属させる。既存BS／BC・use／duty／capture・将来BD05／BA／BUを重複課金しない。

BP5段階とBD5段階には内部prefixがあり、この段階数を実呼出し数／work上界とはしない。実E／S・unit係数・全guard数・allocation／layout／GC／OOM・停止後の保持／解消予約・全体work上界はUnknown。実予算更新・新cap・設定投入・期限緩和を行わない。将来の予算供給も同開始点の全deadlineを引き継ぎ、残時間から再計算しない。

## 8 独立合成受入条件（全て将来・未実施）

| ID | 必須条件・負の対照 |
|---|---|
| BB01 | BP00〜04の生成／固定化／pin各prefixで故障・close・再入。source先行保持とreceiver原始初期値、BC開始0・claim unused／borrow空を独立oracle比較 |
| BB02 | custodianの実private発行slot、source issued=current、metadataConfirmedとexpected-source pinを個別破壊。brand付き同値copy・別root／start・版混入を当該phaseで最初に拒否 |
| BB03 | bindingOwner／cellOwnerを別に検査し、誤った同一化・別binding／link／duty／frame／control／run seal・route pin混同を拒否 |
| BB04 | DataStable／BaseUnused／BindPhaseを独立破壊。claim spentを旧unused checkerのOR緩和で通す変異、held後再prepare、旧入口の型拡張を検出 |
| BB05 | BD00拒否ではclaim未消費、BD01後はspent、receiver occupancyはBD02通過後だけused。2つの消費点・pin格納履歴を混同／返却しない |
| BB06 | BD02内部のentry／occupied／両payload issued・current各prefixで故障。部分bundle／draft・call到達未確認を区別し、両側の参照と未確認責務を保持 |
| BB07 | receiver pin／bundle／draftのissued/current/copy・初回rejectedと全13dataを1要素ずつ混入。child同値copy・不正descriptor・getterを拒否しhook0 |
| BB08 | receiver confirmed後のsource全post故障・stopで、receiverの既知事実／元firstを保持。参照clear／再bind／第2owner補完・ready化を検出 |
| BB09 | 同source再入・重複pin／bind・foreign sourceを区別。元receiverのpayload／firstを壊さずrefusal。正常保持後・失敗後の再開なし |
| BB10 | metadata readonly／狭いclaim状態・不正state組・wrong source／pin型・executable=true・body関数・候補値をsemantic compile-failで拒否。同値copyの拒否はruntimeで補う |
| BB11 | 全公開graphの固定schema／freeze／有限plain data・全allowlistとstrict booleanを検査。source／custodian／bundle漏洩・生の不正値echo・raw例外出力を負の対照にする |
| BB12 | 旧seed／live／bundle・既存A／B／B03-C・compiled対照／旧facadeを維持。新旧診断を混ぜず、runtime friend／fixture梱包混入・grant／active／body／ready／request追加0 |

oracleは本体のbuilder／状態表／counterを期待値へimportせず、固定semantic event列からpin・source claim・occupancyと保持prefixを計算する。単独注入とguard除去で最初の拒否位置／実呼出しが変わることを確認し、後段失敗やanchor不一致だけで単独感度を保証しない。既存の未対照base節と到達不能・等価な防御は範囲外／等価として明記する。

## 9 将来の分割と今回の文書検証

将来の実装承認は、(1) source／receiverの内部型・原始先行field・固定診断／projectionと実行拒否、(2) BP00〜04の正規生成元・private pin・停止／同一性、(3) BD00〜04のone-shot消費・payload捕捉・全post、の順に分ける。各段階で合成依存だけを用い、BD05／構築ready・body実行を含めない。既存13行の保証をbind成功と誤表示しない。

今回は本書と親2文書の参照更新だけを行う。ローカルリンク・表の列数・BP／BD順序、状態／保持条件・差分空白を文書として確認する。ソース／試験／CHANGELOG／設定は変更せず、build・合成／compiled試験・梱包操作は行わない。BB01〜12は未実施であり、成功済みと記録しない。本書作成時点では未コミット・Pushなし。

文書検証結果：本書と親2文書のローカルリンク22件に欠落なし、23表の列数・空白・末尾改行に異常なし。BP00〜04の5段階、BD00〜04の5段階とBD02内3substep、BB01〜12の順序／重複／欠落、sourceの22 own keyとclaim／occupancy／post履歴の区分を確認した。live／bundle親の参照は確認中の`5ec73dd`へ取り込み済みで、同レビュー修正を保持した。文書作成終了時の未コミット差分は本書と構築親の参照更新だけで、ソース／試験／CHANGELOG／設定に未コミット差分なし。こちらでindex登録・コミット・Pushは行っていない。これは文書整合の確認であり、将来のbind／受入試験の成功を意味しない。

## 10 内部型・原始fieldだけの合成限定実装（2026-11-10）

package除外のcomposition fixtureにcreateProbeBodyBindFieldsFakeを追加した。新APIはprepare／check／checkLegacy／close／inspectの5つだけで、model=wfb-body-bind-fields-1、正常でもbind_fields_held／ok=false／authority=none／execution=closed。同既存rootのbase37・probe8・run4・exit anchor5の準備後、body用BS／BCの生成前に止まる。既存baseのgate pin／RunLink等の準備は従来どおり行うが、新しいexpected-source pin・source claim・body bindは接続しない。旧seed／live／bundle経路のhold条件・検査・modelを変えない。

BodyBindSourceShell／狭いInitial型、有限state×claim×call／post履歴、readonly metadata、source／receiverの固定理由型を宣言した。これは型だけであり、private brandのruntime発行・BP00のsource生成・private issuer登録はない。同rootへsource issued／current／rejectedの空参照とmetadataConfirmed=false、field検査の位置／初回失敗位置／状態scalarを先行する。source不在はstate／claimともnot_createdとし、unusedの実体があるように投影しない。予期しないsource参照はunconfirmed・保持booleanだけを出し、未知sourceのgetter／keyを読まない。

同RetirementStartAssemblyには§2.2の9参照をundefined、pinAttemptUsed=false、pinStage=empty、occupancy=free、bindingState=empty、prefix／診断をnoneとして直接先行した。新たなreceiver object／array／Promise／関数をfield initializerに作らない。新module-private継続は初期値のreadonly検査・有限projectionと固定診断記録だけで、pin／payloadの格納継続は存在しない。公開snapshotの配列は診断生成時だけの固定9位置であり、receiver／source参照は外へ出さない。

field検査のbefore／checked／afterはBP／BDではなく、この段階だけの位置である。各点の故障・close・再入で元root firstと最初の失敗位置を保持する。診断専用の有限scriptはreceiver firstをstate_invalidと記録してから後続throwを起こすが、pin／borrowの履歴を捏造しないためreceiver failurePhase／prefix／boundaryはnoneのまま。失敗後の返答は固定し、重複prepareは再生成しない。check／checkLegacyは旧frame wrapperを呼ばず固定拒否し、rootReadyを誤ってtrueにするscratch対照でも実行資格を与えない。

独立テストは9参照のsemantic名・初期値・故障位置を本体からimportせず比較する。compiledはreceiver19field・root source不在4条件を単独破壊し、当該最初の拒否と条件除去による見逃しを対照にする。後段2位置の変化、unknown scalarのallowlist、先行理由、型拒否21行、field initializerが9つの無初期化参照＋10literalだけであることも確認する。scopeは空の先行保持先と実行拒否であり、同値source copyの発行元確認・expected-source pin・BP／BDの状態遷移・payload受領・source診断のruntime発行は未検証のまま。

BB10〜12の型／projection／旧入口維持に関する部分だけを検証し、BB01〜09やBB10〜12全体を合格にしない。実allocation／E／S／OOM時の診断必着・実予算更新・全体work上界はUnknown。pin・claim消費・bind・構築ready・body起動・request／回収・正式発行・実接続は未接続、全体受付無効・調査保留を維持する。

レビュー修正（`41ac31f`）：root側の`bodyFieldsIntact`は、元base未使用とBC用shell未生成の各節がbeforeで単独に拒否することを固定する。root側projectionの`state`／`phase`／`failurePhase`／`reentry`は許可外値を`unconfirmed`へ投影する。`bodyStarts`は実body cellが`running`なら1と投影する。最初の失敗位置の上書き防止は、2回目のfailが同じphaseで起こるため等価とする。`checkBodyBindFields`冒頭の`#fixed`返却は、外側の`bodyBindFieldsReply`が失敗後の返答を必ずcacheするため、公開APIからは区別できず等価とする。

## 11 正規source生成・同期停止の差分設計（2026-11-11、MDのみ）

[正規生成位置・private issuerと同期停止・失敗時保持 draft-0.1](BEST_PRACTICE_WFB_BODY_SOURCE_ISSUER_STOP_DESIGN.md)で、§3のBP00〜01と§6の停止責務を対に具体化した。BS00〜14とBC00以降の最小分離、元literalの即時issued保持・private発行元照合、metadata未確認時のroot-only停止、失敗cache後も先に停止を記録する新経路専用closeを定義する。

既存field限定入口のshell／source不在検査・旧seed／live／bundleの順序／返答と、`5873d16`のレビュー対照は保持する。旧経路で等価とした節の評価を、失敗後close・別BP位置の履歴を持つ新経路へ流用しない。source生成と停止を対で接続する将来案であり、今回実装は行わない。BP02〜04 pin・claim消費・payload bind・構築ready・body起動・正式発行は未接続、全体受付無効・Unknown・調査保留を維持する。

## 12 (A) BS／BCのprivate最小分離（2026-11-11）

[生成・停止設計§11](BEST_PRACTICE_WFB_BODY_SOURCE_ISSUER_STOP_DESIGN.md)と[分離検証記録](E2E_BEST_PRACTICE_WFB_BODY_STORAGE_DATA_SPLIT_2026-11-11.md)の範囲で、BS storageとBC dataをprivate関数へ最小抽出した。旧prepareBodySeedは同frame／同shellを渡す2呼出しのwrapperだけとなり、旧seed／live／bundleの期待値・検査・exportとfield限定入口のsource／shell不在検査を維持する。正規source生成・private pin・新同期停止はまだ実装せず、claim消費・bind・構築ready・body起動・正式発行は閉じたままである。

## 13 (B) BP00〜01の合成source生成／確認・同期停止（2026-11-11）

[生成・停止設計§12 draft-0.3](BEST_PRACTICE_WFB_BODY_SOURCE_ISSUER_STOP_DESIGN.md)と[source検証記録](E2E_BEST_PRACTICE_WFB_BODY_SOURCE_ISSUER_2026-11-11.md)の範囲で、同rootの先行scalar・同BS shellへの結合・固定literalの即時issued保持、9metadata固定化・22key検査とBP01確認を追加した。新しい閉鎖した開発専用factoryだけがsource_held_unpinnedで止まり、旧field限定入口はsource／BS不在のまま、旧seed／live／bundleの生成順・返答・close契約も維持する。

新経路のcloseは失敗返答cacheより先にroot停止を記録し、未確認sourceを読まず、確認済み元issuedだけへ同期反映する。copy／Proxy候補は同参照確認で止め、初回rejectedと部分生成prefix・初回first／位置を保持する。失敗後close・重複生成・再入を旧field限定の等価節へ流用しない。保持は解放確認ではなく、配送／実費用のUnknownは維持する。BP02〜04 pin・claim消費・bind・構築ready・body起動・正式発行は未接続、全体受付無効・調査保留を維持する。

## 14 (C) BP02〜04段階別検査・同startのprivate pin（2026-11-11、MDのみ）

[private pin接続差分設計](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)で、SourceProvenance／BaseUnused／StorageEmpty／PayloadEmptyと、pin前／attempting／issued／captured／confirmed／preparingの狭い検査を分けた。sourceの22keyやmetadataを増やさず、同rootのprivate発行slotと同startの実保持を直接照合する。既存のexpected-source3参照を先行格納に使い、BodyRoutePin・CanonicalGatePinや利用claim・payload occupancyと混同しない。

生成時診断はBP01完了のまま残し、rootのpin進行／初回失敗とreceiverの実操作位置を別に先行する。試行記録・固定call・issued/current保持の順、再入／重複とforeign拒否、失敗後closeの同期停止・部分pin／confirmed保持を定義した。accepted返答だけではBP04を省略できず、正常案もsource preparing／unused・payload空／free・BC00開始0である。

今回の更新は文書だけで、CP01〜14は全て未実施。旧field／seed／live／bundle・(B)入口とレビュー対照を維持し、実装・claim消費・bind・構築ready・body起動・正式発行・実接続を接続しない。費目は論理上の追加分だけを整理し、実E／S／全体work上界はUnknown、全体受付無効・調査保留を維持する。

## 15 C-01の内部型・先行scalarと検査器（2026-11-11）

[private pin設計§11](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)と[C-01検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_CONTRACTS_2026-11-11.md)の範囲だけを実装した。同rootにpin用13scalarと検査準備用6scalar・空返答参照、同startにpin操作位置／初回位置の2scalarを先行する。既存9参照・10scalarの初期値と旧19field検査は変更しない。来歴／安定検査と13段階の値checkerを分け、同ownerへ繋ぐのは未pinentryだけである。

新modelはwfb-body-pin-contracts-1、正常もpin_contracts_held／ok=false。PC01のroute試行記録・固定receiver call・pin格納・claim消費・bindは実行せず、将来pin状態を実ownerへ書いて試験成功にしない。検査失敗は生成診断／pin診断と別に保持し、失敗後closeでも元返答・先行理由を保持する。全CP受入やpin後の資格を保証せず、構築ready・body起動・正式発行閉鎖、全体受付無効・Unknown・調査保留を維持する。

## 16 C-02前半の同start caller資格と固定停止（2026-11-11）

[private pin設計§13](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)と[C-02前半検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_START_2026-11-11.md)の範囲を合成依存限定で実装した。元root／issued=current source／正規startのidentity-first private資格と同frameの一度限り開始を接続し、busyはfinallyで解除するがrouteAttemptedは戻さない。これはcaller sequenceの予約で、receiver pinAttemptUsedやsource利用claimとは異なる。rootごとのbindingOwner／cellOwnerの正規関係を維持する。

PC02の前後と最後のblocked境界で同参照・安定条件・狭い未call組を再検査し、pin_call_not_connected／construction_unconfirmedで固定停止する。生成・C-01準備・pin失敗を別軸で保持し、失敗後closeでも先行診断／返答を維持する。receiver9参照は空、pinAttemptUsed=false／pinStage empty、claim unused、data／grant／duty／body／ready0。PC03固定call・格納・claim消費・bindは未接続、正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。
