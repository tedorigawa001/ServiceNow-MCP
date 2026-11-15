# WF-B SG-A後：origin／epochの生成元・結合・失効範囲と共有条件

Version: draft-0.1 / Date: 2026-11-15 / 読取り基準HEAD: `887fbc0`。

Status: **生成元・同一性・失効／共有の詳細設計のみ。LOAD6／LOAD7・以下の対応案／共有方式・内部配置・容量capは未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[canonical発行／消費対応台帳draft-0.1](BEST_PRACTICE_WFB_SGA_CANONICAL_ISSUANCE_CLAIM_LEDGER_DESIGN.md)と[graph境界・値／protocol形状draft-0.1](BEST_PRACTICE_WFB_SGA_GRAPH_BOUNDARY_CANONICAL_PROTOCOL_SHAPE_DESIGN.md)。[全root field台帳draft-0.2](BEST_PRACTICE_WFB_SGA_ROOT_FIELD_REFERENT_LEDGER_DESIGN.md)、[L0配置／費目所有draft-0.1](BEST_PRACTICE_WFB_SGA_INTERNAL_SLOT_LAYOUT_CAPACITY_COST_DESIGN.md)、[writer退出／borrow退役draft-0.2](BEST_PRACTICE_WFB_SGA_BACKING_OWNERSHIP_WRITER_EXIT_DESIGN.md)、[固定schedule draft-0.3](BEST_PRACTICE_WFB_SGA_FIXED_SCHEDULE_SLOT_ENCODING_DESIGN.md)を保つ。R1直接field・canonical claim位置・wire fieldを追加変更せず、参照先facetの意味と必要条件を具体化する。

## 1 分離する四つの同一性

| 概念 | 意味・必要な結合 | 同じと推定しないもの |
|---|---|---|
| origin | 固定private生成元と意味上の発生site／subjectを示す、同ownerの不変な由来 | 実body開始、clock時刻、claim消費済み、成功結果。label・hash・同値objectから再生成不可 |
| generation pin | 同private issuerの一つの世代を識別する不変のpin／その生成根拠 | 数値が等しい別issuerのepoch、wrap後の再利用、同名profile |
| validity domain／binding | pinと同root／record／role、正規claim・停止／失効stateへの結合 | pin一致だけで許可される汎用権限。親が同じでも子のrole／subjectは別 |
| provider／clockのepoch・domain | CPU counterの累積epoch／scope、clockの単位・domain・精度根拠 | capabilityの世代・承認・信頼根拠。counter非逆行やUTC一致だけでissuer世代を確認しない |

originのkind／phaseは固定siteの識別で、実行中の現在phaseや終了時刻で書き換えない。実際に進入したか、finallyが返ったか、退役が確認されたかは既存のenter／Exit／retire位置へ別に記録する。後続eventに合わせて同originを別kindへ再bindしない。

FS08と、FS08未到達時にFS13で行う早期診断batchは、同CM09の排他的な実行branchである。encode originの固定siteを共有し、実到達branchは既存Control／進行位置に記録する。FS13用の新しいorigin／epoch／claimを生成してFS08の失敗を再試行する経路は作らない。

本稿のdomain・pinは論理facetの候補である。LC04／LC08のepoch参照が指すbindingと、そのbindingが参照する不変pinを区別する。既存fieldから一つの小objectへ到達できると実証したものではなく、追加のreferent field・wrapper・owner graphが必要なら容量／source対応を別算定する。

## 2 private生成元・既存canonical位置との結合

以下の生成位置は準備／pinの設計上の位置で、実発行口や新しいone-shot claimを作るものではない。各固定位置は未生成／準備途中／結合済み／結合未確認を区別し、二度目の生成要求で別pinを作って救済しない。既存正規位置のreadonly参照を返す操作も、再発行・再開始とは分ける。

| ID／対象 | 生成元・生成位置案 | 結合・正規位置 | 失敗時の元保持先 |
|---|---|---|---|
| OE01 construction origin／domain | 既存親の固定private入場継続。OSlot確認後、最小shell取得より前の先行位置 | 親owner・同construction・CM00のOSlot.claim。RG06.claimは後発projectionだけ | OSlot／固定constructor frame。親未成立なら新rootへ未入場 |
| OE02 root generation／domain | 同親に由来する固定root準備継続。R1 Contextの同owner／source／版へ結合 | 同root／trial・parent owner pin・CM01〜07の正規位置。run claim未消費を生成成功の代用にしない | OSlot／RG01／RG02と同rootのFailure。結合不足ならrunなし |
| OE03 record domain／attempt | 同rootの固定record準備継続。LC01／LC09の先行位置に一度結合 | 同Anchor[j]／B[j]・同root・同record。CM08／09／10は別の意味のclaim | LC01／LC09／元pending。CM09消費前でもidentity準備は別、未消費を開始許可にしない |
| OE04 role binding／origin | 同recordの固定role準備継続。LC08[j,role]の先行位置 | 同Anchor・role・CM11／12・正規enter origin。writerのLC04.origin／epochは同writer bindingの参照 | LC08／LC04／LC05・元frame。別role／recordへ再bindなし |
| OE05 claim関連root／record origin | 各CMの固定owner継続。対象canonical siteへ消費前にpin | CM01〜07、各recordのseal／encode・取得／publishのsiteを区別。projectionは同siteを観測 | 元canonical位置／projection／Failure。新しいoriginを作ってfreshへ戻さない |
| OE06 時刻の観測origin | 同clock供給元に結合した固定観測継続の先行位置 | RG13のa・各n／begin／end・UTCの固定位置。h等は同元観測のalias | RG13／RG08／Failure。観測例外後の再clock・新originでの再採取なし |

生成元の限定はsourceで確認する必要があり、名称・型宣言・`readonly`だけで保証しない。外部object／JSON／diagnostic／summary／任意callback・fixture登録から正規origin／pin／domainを構成する入口は設けない。合成と実runtimeの登録・owner・claim台帳を共有せず、合成一致を実pinの正当性へ昇格しない。

provider／clock／親ownerから既に供給されたpinも、参照先が既存だから保持費0とはしない。親pinが現在有効か、同runに使われたか、信頼承認があるかは別の証拠で、今回は新規のsource照合・内容hash・実load／getter確認を行わない。

## 3 同一性と二種類の親edge

| ID | 正規に確認する組 | 拒否・保持 |
|---|---|---|
| EB01 origin binding | private issuer実参照・固定site kind・同root／trial／source／schema／配置版／profile・subject実参照 | label・時刻・hash・同値copy一致だけでは受理しない。別issuer／版は拒否 |
| EB02 generation binding | pin実参照または同issuerの正規世代識別根拠、同失効元、同subject／role、canonical slot | 同じ整数epochを正規pinへ変換しない。根拠不足はUnknown、既存履歴を保持 |
| EB03 writer alias | LC04.origin／epochとLC08[writer_frame].origin／epochは同enter domain／pinへ結合 | LC04.enter_claimはprojection。LC08.enter_claim以外の第二消費口なし |
| EB04 retire cause | roleの退役は同enter実体・同origin／epochとCM12へ結合 | originが同じでもCM11 enterとCM12退役は別claim。退役に合わせoriginを書き換えない |
| EB05 cause parent | 生成元・由来をたどる不変の親edge | constructionが正常に終了した事実だけでrunを失効させない。由来の親を全てwork許可のAND条件にしない |
| EB06 revocation parent | 当該操作の失効を伝える正規owner／domainへのedge | root失効が子の通常操作を閉じることと、子roleだけの終了を分離。由来の親と一致すると無条件に仮定しない |

construction domainは由来としてrootへ結合するが、constructorの通常作業終了をroot runの失効条件にしない。rootの失効元は同既存親ownerの有効性／停止根拠へ別に結合する。親ownerが失効した場合はrootの通常操作も閉じる。どのsource stateがその正規根拠かを確認できなければ入場を拒否し、由来edgeだけで有効扱いしない。

recordの通常失効親は同root、roleの通常失効親は同recordとする論理階層を候補とする。ただしwriter終了時に閉じるのはwriter Grant／roleの新write資格であり、正常join後のpostやpacket構築を一律に失効させる規則ではない。writerのthrow／失敗は既存batch停止へ合流し、次record・成功post／publishで救済しない。

## 4 失効の目的別判定と保持責務

単一の`isLive`値を通常開始・TERM・退出確認に共用しない。判定目的は、通常操作、既存計画の固定terminal処理、同旧attemptの退出／保持確認の三つへ分ける。どの目的でも同private owner／subjectの結合が必要で、単に「cleanup」という名前の外部呼出しを通さない。

正規の失効／段階判定元は、同親ownerのprivate pin根拠、RG02の停止／close状態、LC01／LC09のrecord状態、LC04のGrant revoke、LC08のrole／claim、RG04のtail状態・既存予約、LC05／OSlotの未確認責務へ対応付ける。domainのstateという名前の第二の自由なalive cacheをauthorityにしない。各目的で必要な正規stateのsource対応・非介在を確認できなければ、その目的の入場を拒否する。新しいstate位置が必要ならfield・容量・費用の別版改訂が必要である。

| ID／原因・境界 | 新しい通常操作 | 固定terminal処理 | 同旧対象の退出／保持・診断 |
|---|---|---|---|
| RV01 constructor完了 | constructorへの再入なし。正規rootは別CM01と親owner条件で判定 | 通常のsampler TERM条件を別に判定 | constructorの元frame／OSlot責務は確認した階層だけ退役 |
| RV02 writer正常復帰・Grant revoke | 同writerの新token／再enterなし。parent recordが有効でjoin済みなら、別roleのpostは従来前提で判定 | TERMも独立したrecord／role前提を満たす必要 | 同writerのfinally候補→join→CM12を確認。revokeだけで退出済みにしない |
| RV03 record／writer失敗・batch停止 | 当該record・次recordの通常取得／write／publishを開始しない | 既存FS13のz・TERM封印だけを許す分岐を維持。batch途中失敗ではTERM encoding／z_postなし | partial backing・sealed値・元origin／epoch・未確認frameを保持 |
| RV04 root close／取消・期限到達 | 新しいsample／getter／通常role入場・再通知等を閉じる | 同owner・元の固定計画／tail予約・同期限で許される名前付きTERM処理だけを別判定。閉鎖を理由に追加時間を与えない | 正規の既存duty／Exit／OSlotに限る。停止は即時中断・全退役成功ではない |
| RV05 issuer／parent pin失効・binding混入／未確認 | 新入場・再bind・再発行なし | 正規同一性を確認できない新terminal入場も拒否。必要値が欠ければ生成不能／未試行を残す | 古いpinを保持したまま、同旧対象の事実を確認できる範囲だけ扱う。同一性自体が不明なら元slotを未確認保持し成功証拠を発行しない |
| RV06 terminal完了 | 通常操作を再開しない | 第二のTERM seal／encode／通知なし | 残るborrow・custody・reclaimを別に保持。TERM完了をprocess全体終了にしない |
| RV07 cleanup gate終端 | 新通常操作なし | 新terminal操作なし | 未完dutyを完了扱いにして閉じない。正規終端後の重複／foreign通知からcanonical状態を再開・書換えしない |

RV04のterminalは汎用的な例外口ではない。既存TERM slot・CM08のseal、分岐が許す場合のCM09 encode・CM11 writer／post・CM10 publish・CM12退役だけを、元のB[TERM]と予約・停止理由・strict値／同一性へ結合する候補とする。期限不足・pin不足・batch失敗などの禁止条件があれば実行しない。新しいterminal epoch／issuer、再試行、予算の取り直し、追加clockで穴埋めしない。

退出確認も通常の再入ではない。同旧origin／epoch・実frame・先行Exit／retire位置・正規復帰継続に結合し、CM12消費後の遅い復帰は同試行の診断／事実確認へだけ合流する。停止後に許される固定書込み資格・元予算の残条件が不足すれば、記録／退役の成功を保証せず未確認責務を残す。rootやpinを作り直して確認済みにしない。

現在の正式発行口・body起動・全体受付の閉鎖は、本表の将来条件とは別の上位gateである。本MDの「判定できる」「残す」を現在の実装・発行・消費・TERM実行・実cleanupの許可と解釈しない。

## 5 epoch共有条件：不変pinと可変失効domainを混同しない

| 共有対象 | 必須条件 | 禁止例・未確認時 |
|---|---|---|
| 同writerを指す複数edge | LC04とLC08.writerが同private binding／pin・同Anchor／originへ結合 | projection未更新を別epochへ再bindして救済しない。edge費は両位置分残る |
| role間の不変generation pin | 同issuer・同世代根拠・同親domain／版、pin自体が不変。role／subject・canonical claim・個別の失効／借用状態を必ず別に検査 | pin一致だけでpost／custodyへ入場しない。pinがrole固有情報を持つ表現なら、そのまま異roleへ共有不可 |
| 可変domain／失効state | 対象・失効原因・有効期間・許す操作／terminal／cleanup範囲・writerが全て同じと根拠付きで確認できる | writerの終了とpostの生存条件は異なる。便宜的に一つのrevoke flagへ統合しない |
| 異record／異root・異trial | 別subject／ownerとして結合・失効範囲を維持 | 同じ数値／同じissuer名／同じデータで共有を許可しない。rootを跨ぐpin共有方式は本書で提案・採用しない |
| capabilityとprovider／clockのepoch | 用途・issuer・domainが異なることを保持 | counterの世代や単調時刻をcapability epochへ流用しない |

共有方式は未承認で、少なくとも次の二候補を比較対象に残す。Dはroot・record・roleの不変pinも分ける候補、Sは同record内の不変pin材だけを共有し、role bindingと各roleの失効／claim判定を分ける候補である。どちらもLC04のwriter参照は同writer roleへaliasする。shared物を一つのmutable許可objectとして扱う方式ではない。

| 対象の論理位置 | D：pin分離候補 | S：同record内pin共有候補 |
|---|---|---|
| root・record・role binding／domain | 1+N+4N＝1+5N | 同じ1+5N。roleごとの判定・保持位置を消さない |
| 上記不変pinの識別位置 | 1+5N＝71／76 | root1＋record N＝15／16を共有できる場合の候補 |
| 直接LC04／LC08 epoch参照 | 5N＝70／75 | 同じ70／75。参照先bindingと、その中のpin材の共有は別 |
| constructor／親OSlot | 上記root内とは別の1論理domainを保持 | 同じく別。constructor完了とroot失効を統合しない |

1+5Nの内訳はroot1、record N、role4Nである。TERMの非適用2roleの位置を含む候補なので、適用domainは1+N+(4P+2)＝69／74。不変pin共有による識別位置の減少は、runtime object／allocationやbyte量が同じだけ減る証拠ではない。実装が埋込み・別wrapper・別closureを要する場合は別容量／費目が必要で、L0／R1の既出field費を減算しない。

pinのobject表現・counter方式・整数幅・参照幅ρ・実sourceの共有可能性はUnknown。counter方式なら固定上限・overflow拒否・同世代pinの安定性が必要で、wrap／reset・owner再生成・旧tokenへの再bindは拒否する。方式が決まっていない現在、Sが実現できる、Dが容量内に収まると結論しない。

## 6 originの多重度と共有してよい範囲

| origin site群 | 正規位置候補・生成元 | LOAD6／LOAD7・共有の意味 |
|---|---|---|
| root operation | CM01〜07それぞれの固定site／owner | 7／7。notifyとsettle等の別kindを同じoriginへ自動統合しない |
| record operation | record seal・encode／取得・publishの各固定site | 3N＝42／45。LC01.claimは同encode originのprojectionで、第二のattempt originなし |
| role lifecycle | 各recordの4roleの固定enter cause site | 4N＝56／60。enter事実・同role退役は同cause originへ結合するが、CM11とCM12は別claim。origin.phaseを書換えない |
| 上記protocol origin配置 | 7+3N+4N＝7+7N | 105／112。適用位置は7+3N+(4P+2)＝103／110。非適用roleは未生成／非適用のまま |
| 時刻観測origin | RG13のmono m=26／29、UTC u=6／7の固定観測site | m+u＝32／36。h・S.entered等のaliasから別originを生成しない。時計値が等しいことでは共有しない |
| constructor origin | CM00の既存親／同construction site | 親側1／1。MP01から追加originを作らない |

上記protocolと時刻の固定site位置を足した部分はroot内137／148、constructorも含め138／149となる候補である。これはsiteの台帳上の個数で、実origin object数でも、provider scope／CPU戻り値・その他のsource由来を全て列挙した総数でもない。参照先全field・slot共有・実allocation・局所captureは未導出のまま残す。

role originはenterを起点とする同role lifecycleの由来とし、退役側はそのoriginを返す確認として結合する。退役という別claim kindを同enter claimへ統合する意味ではない。実sourceのorigin定義がこの対応と一致するかは未確認で、既存codeの型・生成元を黙って読み替えない。対応できない場合は別版でsite／field／費用を改訂するまで閉鎖を維持する。

originのimmutable identityを共有できるのは同じ意味上のsite／subjectへの正規aliasと確認できる範囲に限る。別kind／別record／別roleのoriginを同値copyやissuer一致でまとめない。形式上同じfield名を持つobjectでも、発生元・subject・epochの根拠が不足すれば別扱いの未確認であり、都合のよいdedupや物理的別allocationの断定をしない。

## 7 固定境界・失敗prefixと元保持責務

| ID | 境界・故障 | 固定の処理・保持 |
|---|---|---|
| EH01 | 親pin／OSlotの準備前・失効／busy | 新root・domainを生成しない。既存親の停止／未確認責務へ残し、緊急shellの再帰生成なし |
| EH02 | pin／origin候補の生成前後・格納途中throw | 生成候補・元pending／frameと成否を区別。取得／捕捉未確認を0件・保持成功にせず、同siteの再生成なし |
| EH03 | 同subjectへの二度目の生成・別domain混入 | 新しいpinでfreshへ戻さず停止。正規元と混入候補の責務を保持、同値コピーから受理しない |
| EH04 | binding確認後・claim消費前の親失効 | 通常開始を拒否。未消費でも停止済みownerは再利用不可。失効確認と入場の非介在が証明不能なら実行なし |
| EH05 | claim消費後・projection前／frame前の失効 | spent／消費未確認を維持。第二claim・新epochで再開せず、body未開始／未確認を分離 |
| EH06 | 実write／frame中にrevoke、finally／join未確認 | 新writeを閉じるが即時退出成功としない。旧origin／epoch／backing／Exitを保持し、次recordへ進まない |
| EH07 | 共有pinでwriter終了、post／他roleが未開始 | writer gateだけを閉じる。parent・正規post前提が有効なら別roleとして判定し、共有flagで誤失効・誤入場させない |
| EH08 | 旧epochのlate応答・重複retire・後着receipt | 同旧対象の固定診断／退出確認の範囲にだけ合流。新しい通常操作・証拠系列・再settleなし |
| EH09 | root／parent失効、上位custody／元frameの引受未確認 | pin・元参照・初回理由・支出prefixを保持。引受確認前にclear／credit再利用をしない |

保持は実allocator解放や診断永続化の保証ではない。OSlot自体の未成立・process全体OOM／強制終了・捕捉不能では全参照捕捉／返却成功を保証せずUnknownとする。終了時にepoch metadataを消したから旧frame／上位保持もなくなったとはしない。

## 8 費目所有・容量／同時保持への受渡し

| 対象 | 主費目・責任owner | 保持／費用の条件 |
|---|---|---|
| 固定domain／origin位置・pin候補・空slot・partial保持 | OP00、TrialOwner／既存親owner | 位置準備・候補生成・格納を分離。D／Sどちらでも参照cell・親の保持・container費を0にしない |
| 親／provider／clockの固定供給とpin根拠 | OP01、PinOwner、全体TrialOwner | static宣言・内容一致・同trial使用・信頼承認は別。新規pin／hash照合は今回未実施 |
| 同issuer／domain／subject・canonical位置へのbinding | OP02、固定issuer／TrialOwner | 二度目生成・alias照合・partial bindingのworkを含む。元CM00／01等の一度の消費と重複させない |
| 時刻観測・sample／値の由来 | arm OP03、入場OP04、取得OP05／OP06／OP07／OP11、投影／差分／集計OP08／OP09／OP10、受付OP12 | 既存位置へのorigin bindingだけで追加clockなし。snapshot・変換・元provider戻り値の保持は別費用 |
| record／role pin照合・writer／post | 受付OP12、encoding／固定確認OP13、SamplerOwner／固定caller | claim消費・projection・失効判定・frame進入を分離。前record退役前の次取得なし |
| segment／custody入場・notify／settle | OP14、CustodyOwner、未受理はSamplerOwner | role別domain確認、上位保持、queue／候補の費用を除外しない |
| 停止境界・最終guard／試行分類 | OP15の境界／診断記録、guard OP16、分類OP17、TrialOwner | 新しいepoch確認clock／poll・残期限再計算を足さない。実callは未接続 |
| 失効伝播・未確認保持・late復帰・固定退役 | 別の失敗処理OP18、custody／退役OP19、元owner／親終了owner | 元操作の支出は元OPに残す。失効・移譲・退役で費用や履歴をresetしない |

同一occurrenceには主費目一つ。pinを共有しても照合・参照保持・各roleのgate確認は別workで、共有率から実時間短縮を推定しない。root停止を子へ反映するための実装上の全走査・関数呼出し・非介在・部分更新の費用は未導出で、同期に失効する根拠がなければその保証を成功扱いしない。

次の容量算定には、origin site・logical domain・binding参照位置・不変pin識別位置を別列で渡す。D／Sの未選択、参照先の追加field・issuer／parent graph・旧frame／partial pinの保持、各失敗prefixを残す。70／75参照位置や105／112 siteから実object数／byte量を導かず、実参照幅ρ・全source対応・最大同時保持・実allocator費はUnknownとする。元5秒・既定並列度、列挙取得62／70、既存出力／scratch予約を変更しない。

## 9 独立検証の受入条件案（全て未実施）

| ID | 独立対照 | 必須条件 |
|---|---|---|
| EO01 | 同じepoch整数・別issuer／版／root／role | 同一性を拒否し、元claim／originを保持。値から正規pinへ昇格なし |
| EO02 | constructor完了・親owner失効 | 由来の親と失効の親を区別。前者だけでrun失効せず、後者を由来一致だけで通さない |
| EO03 | writer正常終了とthrow、post前提 | 正常revokeとrecord／batch失敗を分離。postの誤失効／誤入場を拒否 |
| EO04 | D／S候補・共有不変pin・共有mutable flag | 共有してもsubject／role／claim／失効条件を保持。方式未選択のまま |
| EO05 | root close／期限・TERM／cleanup目的の混入 | 名前付き旧計画・元予約／期限に限る。新epoch・追加時間・再試行なし |
| EO06 | batch j失敗・pin結合不足 | TERM encoding／z_postを捏造しない。旧slot／元frame／sealed値の責務を残す |
| EO07 | 各EHの格納／消費／進入途中失敗・再生成 | 消費済み・消費未確認・body未開始／未確認を分離し、freshへ戻さない |
| EO08 | late復帰・重複retire・receiptだけで解放 | 旧対象の退出確認と新規権限を分離。origin／epoch・支出prefix保持 |
| EO09 | 70／75参照、domain・pin・origin site・非適用位置 | 各単位の定数関係を独立算定し、heap object数や全memory上界へ変換しない |
| EO10 | 新clock／epoch再採取・source不足／実費0扱い | 元schedule／期限・費目を維持し、未導出はUnknown・全gate閉鎖 |

oracleは対象のepoch／identity／共有／失効helperを流用せず、固定生成位置・親edge区分・目的別判定・D／S候補・故障prefixの別表から期待関係を作る計画。今回はMDリンク・表・定数式だけを静的に確認し、実装・発行・claim消費・合成試験・実pin／source照合・実退出確認は行わない。

## 10 未承認事項と今回の範囲

- [ ] origin生成site・不変identity・claim kind／role lifecycleの対応のレビュー。
- [ ] construction／root／record／roleの結合・目的別失効・停止後の固定書込み資格のレビュー。
- [ ] D／S・pin表現／counter方式と、共有条件・個数・参照先容量の有限化。
- [ ] source供給元・非介在／同期失効・費目work／時間・phase別同時保持の確認。
- [ ] LOAD6／LOAD7・対応案／方式／容量と、実装／合成試験／実確認／保管の個別承認。

全て未承認。本MDと親2文書の参照更新だけを行う。元の5秒期限・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・発行・claim消費・body起動・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは行わない。

文書整合として対象3文書のローカルリンク20件・表28個の列数、OE01〜06／EB01〜06／RV01〜07／EH01〜09／EO01〜10のID連番、未承認チェック5項目、D／S候補のdomain・pin・epoch参照位置とprotocol／時刻origin siteの定数関係、費目OP00〜19の記載、末尾改行・差分空白を確認した。文書と定数の静的検算のみで、実装・発行・claim消費・合成試験・負荷採取・試験再実行・実pin／source同一性／同期失効／実object数／最大同時保持／実費の実証ではない。
