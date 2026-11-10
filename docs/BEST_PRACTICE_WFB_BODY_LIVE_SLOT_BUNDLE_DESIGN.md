# WF-B B03後半：BC06〜11 live slotとBC12／13 bundle／draft生成境界

Version: draft-0.1 / Date: 2026-11-10 / 読み取り基準HEAD: `94d7fde`。

Status: **詳細設計のみ。BC06〜13は未実装・受入試験未実施。** 親は[先行slot物理配置・固定構築schedule・失敗保持](BEST_PRACTICE_WFB_BODY_SLOT_CONSTRUCTION_DESIGN.md)と[B03後半の固定exit契約](BEST_PRACTICE_WFB_BODY_UNWIND_EXIT_DESIGN.md)。現行の先行seedと再検査レビューは[検証記録](E2E_BEST_PRACTICE_WFB_BODY_SLOT_SEED_2026-11-10.md)を参照する。

正式発行口・C実行入口・body起動は閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。本書は実装・構築ready・body起動・実接続・実通信・設定変更・Pushの承認ではない。BDのbind／借用field追加、BAのactive／body、BUの退役／終端、実grant／Permit発行、実session／transport／worker・実writer・Journal／packet・field clear・root終端は対象外。

## 1 現行と今回固定する差分

現行は同CanonicalGateDraftRootにshell／13carrierを先行し、BC01 context・BC02 origin・BC03 throw sentinel・BC04 cancel sentinel・BC05非実行pinを保持する。正常でもseed_held／ok=false、root／shell ready=false、bind未試行で止まる。carrier6〜13は空で、body用start borrowは存在しない。

本書は将来の合成専用構築で、その同じ構築中rootのBC05確認後からBC13確認後までを具体化する。既存seed factoryのprepare完了後に第2prepareで追記する再開口は作らない。旧seed入口・試験はBC05までの保証として維持し、追加経路の選択は別途承認する固定lexical継続に限定する。任意mode／callback／公開artifact登録による切替は設けない。

| 現行実装の制約 | 追加経路で必要な境界 |
|---|---|
| bodySeedCarriersMatchはindex6〜13を常に空とする | BC06〜13専用のphase別prefix検査。旧検査の空条件を一括削除しない |
| bodySeedMintは生成物を全体freezeする | BC06〜11のlive storageとBC12／13のimmutable descriptorを区別。旧BC01〜05のfreezeを外さない |
| BodyPreparationShellのready／bindAttemptUsed／bindStageはfalse／false／not_attemptedの狭い型 | 追加構築でもこの型を維持。bind用へ広げるのは別工程 |
| BodySeedReply／ProbeRunFirstは既存の有限語彙 | 新body診断は別版の内部型。既存runFirstや公開replyを黙って拡張しない |

## 2 同owner／dutyの参照閉包と所有権

唯一のcustodyは同rootであり、BC01〜05・13carrier・元failureを保持し続ける。BC06〜13が別root／owner／start／frame／duty／予算を確保することはない。ここではstartは参照先であって、新slotの借用者にはまだならない。

| 検査する関係 | 正規参照・禁止事項 |
|---|---|
| binding側owner | context.bindingOwner＝context.binding.owner＝context.scope.owner＝同startのprivate owner |
| cell束側owner | context.cellOwner＝context.cells.owner＝同rootのprobeOwner。bindingOwnerとの等値は要求しない |
| 同run／duty | context.link＝元issuedRunLink、context.duty＝元issuedRunDuty、link.binding＝context.binding、link.cells＝context.cells、duty.link＝link |
| 同control／anchor | context.control＝元exit bundle.control、exit bundleのlink／duty／startも同組。旧immutable controlをlive unwindへ変換しない |
| 同body／grant保持slot | progress.bodyCell＝context.cells.body、route pin.grantSlot＝context.cells.grant。grant本体や別body cellを補充しない |
| 同bundleとdraft | bundleの全child＝各carrierのissued＝current、draft.bundle＝同bundle、draft.runSeal＝context.runSeal |

子が持つpinはBC05のFixedBodyRoutePinであり、context.pinのCanonicalGatePinとは別型・別参照である。body originもframe originとは別の既存BC02である。名前や保持数・public sameOwner=trueを参照検査の代用にしない。

構築中の各producerは依存childを借り、返却物は同carrierのissuedへ即時捕捉する。BC12／13は新しいcustody ownerや所有権移譲receiptではなく、同rootの参照集約にすぎない。将来BDで同startが借りるまで、start側への格納／occupancy消費は0のまま。

## 3 内部型・固定fieldと初期値

以下は未実装の内部型契約。各型は専用の非公開brandを1つ持ち、表のfieldだけを許す。brand・identity／binding参照はreadonly、進行fieldは有限値型として区別する。公開export・外部生成・任意setter／callback fieldは設けない。

| ID／内部型 | readonlyの参照／固定field | 進行fieldの構築時variant（全て厳密一致） |
|---|---|---|
| BC06 BodyProgress | pin、bodyCell | activationConfirmed=false、callReserved=false、entryObserved=false、returnCaptured=false、callPhase=body_not_called、outcome=none |
| BC07 BodyRouteClosure | pin、progress | bodyEntryClosed=false、controlReturned=false、continuationState=unobserved |
| BC08 BodyDiagnosticView | context、rootFailure、cellDiagnostic | probeFirst=none、exitFirst=none、deliveryFirst=none、failurePhase=none、failureBoundary=none、refusal=none |
| BC09 BodyRetirementStorage | pin、duty、control | kind=not_attempted、used=false、blocked=false、confirmed=false、target=undefined、blockedTarget=undefined、confirmedTarget=undefined |
| BC10 BodyTerminalStorage | pin、duty、progress、retirement、terminalAnchor | kind=none、prepared=false、committed=false。candidate／issued／acceptedはreadonly undefined |
| BC11 BodyUnwindControl | context、pin、progress、closure、diagnostic、retirement、terminal | state=idle、routeUsed=false、inProgress=false、phase=none、boundary=none、fixedReply=undefined |
| BC12 BodyPreparationBundle | context、pin、progress、closure、diagnostic、retirement、terminal、unwind | 進行fieldなし。全field readonly |
| BC13 BodyPreparationDraft | bundle、runSeal、kind=body_unwind_prepared、executable=false | 進行fieldなし。全field readonly |

rootFailureは元root failureそのもの、cellDiagnosticはcontext.cells.diagnosticそのもの。BC09 controlはcontext.control、BC10 terminalAnchorはcontext.exitBundle.terminalを指す。BC11の各参照はBC06〜10の当該currentへ結合する。BC12のunwindはBC11、BC13のrunSealは元BC01のrunSealである。

固定shapeは専用brand＋上記の明示fieldだけで、任意key／追加symbol／getter／setter／独自prototypeを拒否する。BC06〜11のbinding参照を後から埋め直すbackpatchや、BC01／05へ未来の子を追加する循環構築は採らない。

brandを含むown key数はBC06から順に9／6／10／11／12／14／9／5とする。optional fieldを省略せず、undefinedも明示data propertyとして持つ。key数だけで正規性を判断せず、全key・descriptor・値・参照を照合する。

### 3.1 初期variantと将来状態を混同しない

構築producerの返却型・構築検査は上表のInitial variantだけを許す。live storageの将来更新は親のBA／BU契約に従う別工程であり、Initialのreadonly falseをcastでtrueへ書く方式、booleanを無制限に広げて不整合を許す方式を採らない。将来の更新用状態union・private writerは実行経路と同じ別変更で定義・検証する。

特にbody_not_calledはgrant生成器のnot_calledとは異なる。BC06のfalse群は未開始証拠ではなく未観測の初期値、BC07のfalse／unobservedは継続残存なしの証拠ではない。BC09のnot_attemptedは退役不要／解放確認済みではなく、BC10のnoneはterminal成功ではない。既存ProbeBodyCellの実状態もnot_started／noneから変更しない。

## 4 更新権限：構築writerと将来writerの分離

| 対象 | 今回設計する構築writer | 将来だけ許す限定writer（未接続） |
|---|---|---|
| carrier.stage／予約／issued／current／rejected | 同rootの固定構築継続だけ。各位置1試行、初回候補だけ保持 | body／exit writerから変更不可 |
| BC06 | producerの初期値設定だけ | 同startのBA01 active確定、BA02固定call site／同body先頭、BA03同origin帰還捕捉。対応する実body cellと整合させる |
| BC07 | producerの初期値設定だけ | 同private wrapper／固定unwindの正規制御点。利用者stop、target禁止、確認済みinactiveとは別軸 |
| BC08 | producerの初期値設定だけ。構築失敗は元root failureへ | 同ownerの固定probe／exit／delivery／refusal記録点。first非noneは上書き禁止 |
| BC09 | producerの初期値設定だけ | 同dutyのBU03〜05。target捕捉→禁止→実revoked確認のprefixだけ。旧B03-Cの使用済み結果を流用しない |
| BC10 | producerの初期値設定だけ | 同固定unwindのBU07準備／BU09同期確定。candidate／issued／acceptedは常にundefined |
| BC11 | producerの初期値設定だけ | 同startの単一unwind入口・phase／終端記録点。duty claimを追加生成／返却しない |
| BC12／13 | 同rootの固定producerだけ | 更新writerなし。childが将来進行してもdescriptor自体を更新しない |

同root内に存在するだけで書込み権限を得たとはしない。公開prepare／inspect／check／closeからlive進行を変更せず、closeは既存rootの停止要求・構築失敗だけを記録する。構築経路からBC07.bodyEntryClosedやBC09.blockedを「close相当」として代入しない。将来のbody／unwind writerが存在しない段階で、grant／duty／body利用の資格を新たに生成しない。

### 4.1 freezeとlive storageの固定方法

BC01〜05・BC12／13はissued捕捉後にshallow freezeし、同currentへ捕捉する。liveな子へ再帰freezeをかけない。BC06〜11は将来更新fieldを持つため、既存mintの無条件Object.freezeをそのまま適用しない。

BC06〜11では返却物をissuedへ捕捉した後、identity参照・brandとBC10のcandidate／issued／accepted固定undefinedをnon-writable／non-configurableのdata propertyへ固定し、進行fieldだけをwritableのdata propertyとして残し、shapeをsealしてから同currentへ捕捉する。未知入力へこの操作を適用せず、同固定producerの先行保持済みplain objectだけを対象にする。固定化／sealの途中故障もissuedを保持する。これらの操作はBCのissued〜captured区間内の固定substepで、追加の正規hook／通知／awaitを挟まない。

TypeScriptのreadonlyだけでruntime不変を証明せず、descriptor／sealed状態も検査する。ただしseal／freeze済みだけでidentityを認めない。専用構築検査と旧immutable検査の処理区分を明示し、種別のpublic値で操作を選択する汎用factoryは作らない。live fieldがwritableでもpublic参照・writer能力を渡さず、構築全postで初期値を再照合する。

## 5 診断の所有・語彙と失敗位置

元construction／producer firstはrootFailure、元frame／producer／capture系のcell診断はcellDiagnostic、同startのcapture firstは既存private slotに残す。BC08へ成功／失敗のcopyを作って元slotを捨てない。capture firstの読み取りcallbackや同startを外部から呼べる関数をfieldに保存しない。構築段階はcapture未呼出しを検査するだけで、新たなcapture read能力を発行しない。

BC08の新語彙は別版の内部body診断として予約する。probeFirstはnone／probe_throw／probe_cancel／body_entry_unconfirmed／body_return_unconfirmed、exitFirstはnone／binding_mismatch／state_invalid／body_history_unconfirmed／local_retirement_unconfirmed／terminal_unconfirmed／internal_unconfirmed、deliveryFirstはnone／delivery_unconfirmed、refusalはnone／duplicate／reentry／closed／state_invalidに限定する。現在の構築では全てnoneだけが合法であり、構築故障を正規body throw／cancel／exit失敗としてBC08へ記録しない。

failurePhase／failureBoundaryは新body経路の最初の故障位置用であり、構築shellの現在／最初のBC位置とは別用途。初期はnone／noneのみ。将来の許可値は親のBA00〜03／BU00〜10とbefore／afterの組から定義し、構築時点で任意stringを許さない。旧ProbeRunFirst／runFirstへ新語彙を足さず、公開旧replyへ戻す必要がある場合は別途明示projectionを設計する。

BC08生成前に失敗すれば診断slotを補充生成しない。BC08生成後の構築失敗でも、元root firstとshellの最初のphase／boundaryを保持し、新しい診断ownerを確保しない。投影の故障は既知の構築事実を巻き戻さず配送未確認として分離し、raw Error／message／stack／cause・未知結果を保持／出力しない。

## 6 固定生成順と各phaseの受付

同構築中rootでBS00〜14・BC00〜05が正規prefixであることを確認してから、以下の順にだけ進む。各phaseのbeforeでは対象carrierが空・予約なし、全前段confirmed／issued=current／rejectedなし、全後段が空、元base未使用・停止なしを要求する。依存行だけでなく、その時点の全前段を再照合する。

| phase | carrier／固定producer | 直接依存（BC番号） | 確認してからだけ進む先 |
|---|---|---|---|
| BC06 | 6／BodyProgress | 05 | BC07 |
| BC07 | 7／BodyRouteClosure | 05、06 | BC08 |
| BC08 | 8／BodyDiagnosticView | 01 | BC09 |
| BC09 | 9／BodyRetirementStorage | 05 | BC10 |
| BC10 | 10／BodyTerminalStorage | 05、06、09 | BC11 |
| BC11 | 11／BodyUnwindControl | 01、05、06、07、08、09、10 | BC12 |
| BC12 | 12／BodyPreparationBundle | 01、05、06、07、08、09、10、11 | BC13 |
| BC13 | 13／BodyPreparationDraft | 12、既存run seal | 固定全再検査のみ |

各行の6境界はbefore→attempt→issued→captured→checked→confirmed。attemptで予約／attempting、唯一の固定producer直前でcallBoundaryReachedを記録し、返却物を即時issuedへ保持する。その後に§4.1の固定化、同current捕捉／provisional、全field・初期variant・参照・descriptor検査、checked後にconfirmedを記録する。故障scriptの選択はproducerより前に固定し、外部callbackを返却とissued捕捉の間へ入れない。

BC12はBC06〜11の初期値・同参照を集約するdescriptorであり、copy／spreadで子を複製しない。BC13は同BC12と既存run sealだけへ結合する。別shell／別snapshotの同値bundle、旧B03-Cのterminal／retirement、public summaryを入力へ採用しない。BC12後に子が変化すればBC13前に拒否し、BC13後も13位置全体を独立に再検査する。

全再検査後に許すのは同shellのheldと有限な非実行値診断だけ。rootReady／shell.ready=false、execution=closed、bindAttemptUsed=false／not_attempted、start body borrowなし、use unused／duty not_owed／grant empty／body not_started／exit emptyを維持する。bundle／draft参照を返さず、BD00すら呼ばない。既存seed_heldを13行の資格証明に読み替えず、新しい公開schema／版が必要なら実装前に明示する。

## 7 失敗prefixと回収しない保持責務

| 位置 | 同rootが保持するもの | 禁止する補完／成功化 |
|---|---|---|
| BC06 before以前 | 元shell／13carrier／BC01〜05・first | live slotを先にfield initializerで生成、seedを再prepareして継続 |
| before／attempt、call前 | 確認済みprefix、対象の予約／stage、未呼出し事実 | attemptを生成完了扱い、予約返却 |
| call到達後・issued未捕捉 | 元prefix、call境界、結果捕捉未確認責務 | 生成なし／解放済みの断定、第2producer |
| issued後・固定化／seal／current捕捉途中 | 元issuedと到達済みcurrent、固定化の未確認責務 | 全freezeで修復、同値copy置換、元参照消去 |
| strict拒否 | issued、current、最初のrejectedと最初のBC位置 | rejected上書き、後段生成で不一致をmask |
| checked／confirmed後の故障 | 確認済みprefixと対象のstage、元first | 全stageのnot_started化、confirmed事実の消去 |
| BC12／13途中 | 全live slot、捕捉済みbundle／draft、未生成suffix | bundleだけ破棄して再生成、別rootへ移す |
| 全再検査／held後のclose・配送故障 | 全参照・元held事実・停止／配送診断 | 構築ready、bind、body起動、保持をcleanup確認へ昇格 |

最初の失敗でsourceをfailedにし、後続producer・第2prepareを閉じる。失敗時にBC06〜11の進行fieldを将来のunconfirmed variantへ書き換えて初期生成の事実を消さず、構築失敗／prefixはshell／carrierで表す。foreign候補は保持・拒否に留め、foreign側のduty／live slotを変更しない。

close／再入は各6境界と固定化substepの前後で検証する。close後は後続生成0、再入は固定refusalで元first／参照を壊さず、元処理も停止を確認する。旧start.request／drain／回収claim、field clear・fixed discard・custody移譲・borrow退役・owner解放は行わない。保持は解放確認ではなく、未解決責務を同rootへ残すという意味である。実OOMや返却不能時の診断必着はUnknown。

## 8 論理枠・費目所有と未導出範囲

新規dataの固定producer試行はBC06〜13の8回以下、各carrier1回。既存のshell1・array1・carrier13とBC01〜05を再確保しない。追加live storageは6個、immutable aggregateは2個で、これは論理data数であり実allocation数／byte上界ではない。異常時は各carrierの初回rejected最大1を保持し、通常時のissued=currentを別object2個として数えない。

費目は同gate／frame ownerの構築費へ帰属し、phase preflight、固定producer、identity descriptor固定／sealまたはfreeze、current捕捉、strict／全再検査、first／拒否／有限projectionを分ける。元base／BC01〜05・将来BD／BA／BU・旧回収費を重複課金しない。追加48観測境界（8行×6）だけを全guard回数／work上界と主張しない。固定化substepとphaseごとのprefix走査も独立検証対象である。

実E／S・unit係数・全guard費・停止後保持予約・実heap／layout／GC／OOM・全体work上界はUnknown。予算更新・新cap・期限緩和はなく、将来の供給では同開始点／全deadlineを引き継ぎ、残時間から再計算しない。無制限な公開inspect／拒否呼出し全体を有限workとしない。

## 9 独立合成受入条件（将来・未実施）

| ID | 必須条件・負の対照 |
|---|---|
| LB01 | BC06〜13の全brand／field／初期variant／descriptorと余分なkeyを単独破壊。同値copy、別root／start／frame／link／duty／owner域の混入を当該phaseで最初に拒否 |
| LB02 | 8行×6境界の故障とproducer throw、固定化／seal／freeze途中の故障を区別。issued／current／rejected・予約／call境界・suffix未生成を独立prefix oracleと比較 |
| LB03 | BC06実body cell、BC08元failure／cell診断、BC09元control、BC10元terminal anchor、BC11全子、BC12全child、BC13同bundle／run sealの各参照を個別に壊す |
| LB04 | bindingOwnerとcellOwnerを誤って同一化する変異、BodyRoutePinとCanonicalGatePin／body originとframe originの混同を検出 |
| LB05 | 各mint前の全前段confirmed／初期値／issued=current／後段空を個別に破壊。BC12後・BC13後のlive変更を検出し、後段maskでなく最初の失敗位置を固定 |
| LB06 | live binding fieldはruntime変更不可・shape sealed、進行fieldは構築中初期値のまま。live全freeze／descriptor差替え／余分field追加、aggregate再帰freezeの変異を検出 |
| LB07 | 構築失敗がroot firstを保持し、元診断をcopyして消さず、BC08を補充生成せず、probe／exit firstへ偽装されないこと。診断前後故障と配送故障を分離 |
| LB08 | 各境界のclose／再入／重複／失敗後prepareで生成再開・claim返却・後続producerなし。確認済みprefix・未確認責務・返答保持を比較 |
| LB09 | 正常BC13後もready=false／bind未試行／borrow0／grant追加0／active0／body0／duty退出0／旧request0。bundle／draftの資格昇格口・任意writer／callback登録口なし |
| LB10 | semantic compile-failで不正Initial variant、binding readonly違反、terminal候補値、executable=true、関数field、別型pin／bundle／draftを拒否。型だけでは同値copy identityを証明しない |
| LB11 | 全公開graphは固定有限plain data・freeze、参照／symbol／関数／raw例外なし。13位置のhole／空carrier／issuedのみ／confirmedを区別し、不正値をconfirmedへ既定値化しない |
| LB12 | 旧seed154件・再検査compiled対照・既存A／B／B03-Cとexportを維持。旧空suffix／freeze検査を広域緩和しない。fixture梱包混入0、runtime friend／正式発行口追加0 |

oracleは本体のbuilder／生成表／関係表／counterを期待値へimportせず、手書きsemantic event列から参照対応・生成順・prefixを計算する。compiled故障注入はscratch限定とし、単一guard除去で最初の拒否位置が移る／拒否が消えることまで確認する。正規に単独注入できない元base節は、既存レビューの範囲外注記を維持し、全guardを検証済みとしない。

## 10 実装の分割gateと今回の文書検証

将来実装を承認する場合は、(1) BC06〜11のInitial内部型・live固定化と全前段検査、(2) BC12／13のimmutable同参照集約と全post、の順とする。どちらも構築held止まりで、BDのsource claim／receiver borrowと構築readyを含めない。body開始は親契約どおりBAと全BUを同じ別変更で検証するまで閉じる。

今回の変更は本書と親2文書の参照に限定する。文書のローカルリンク・表列数・生成依存順・全8行／48境界の対応・保持条件・差分空白を確認し、結果は文書検証としてのみ記録する。ソース／試験／CHANGELOG／設定は変更せず、build・合成／compiled試験・梱包操作は行わない。LB01〜12は未実施であり、実装済み／合格とは記録しない。コミット・Pushも行わない。

文書検証結果：3文書のローカルリンク16件に欠落なし、22表の列数・末尾改行・空白に異常なし。BC06〜13の8行とcarrier番号、直接依存の先行順、48観測境界、LB01〜12の重複／欠落を確認した。作成時点の変更は本書と親2文書のみで、ソース／試験／CHANGELOG／設定はHEADと差分なし。これは文書整合の確認であり、将来の実装・受入試験の成功を意味しない。
