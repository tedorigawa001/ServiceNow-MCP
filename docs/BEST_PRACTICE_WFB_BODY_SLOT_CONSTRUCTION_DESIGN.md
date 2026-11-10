# WF-B B03後半：先行slot物理配置・固定構築schedule・失敗保持

Version: draft-0.4 / Date: 2026-11-10 / 読み取り基準HEAD: `bf63f16`（レビュー修正基準HEAD: `0932af9`、先行seed実装基準HEAD: `b3f1f3e`、先行seedレビュー修正基準HEAD: `55d4347`）。

draft-0.3のレビュー修正：§12は「SC01〜05の先行構築部分を検証」としていた。しかしSC05が求めるBC00 base条件・前段confirmedの個別破壊を含め、BC00／各mint前／bootstrap／最終再検査の大半の節は、単独で外しても試験が落ちなかった。freeze・初回rejectedの同一性・slot stage projectionのallowlistも観測していなかった。各節が最初に拒否する位置を`failurePhase`で固定するcompiled対照20件と、freeze・rejected同一性・stage allowlistの対照を追加した。単独で注入できないbase節（capture試行0・exit slot照合・`matchesRun`）は§12に範囲外として明記した。

draft-0.3：§12で先行shell／13carrier・BC01〜05の内部型と保持だけの限定実装を記録した。§1〜11の「未実装」「文書のみ」は設計作成時点の範囲であり、今回の実装範囲は§12を基準とする。bind・構築ready・body・正式発行は未接続のまま。

draft-0.1のレビュー修正（MDのみ）：§11の「未コミット・Pushなし」はコミット前の時点の記述だったため、作成時点の記録であることを明示し、コミット後の注記を追加した。B03前半の文書から本書へのリンク文言「後半slot物理配置」を本書の表題「先行slot物理配置」へ揃えた。

Status: **先行shell／13carrierとBC01〜05のcontext／origin／sentinel／pinだけを合成依存限定で実装。** §12と[検証記録](E2E_BEST_PRACTICE_WFB_BODY_SLOT_SEED_2026-11-10.md)を参照。BC06〜13・BD／構築ready・BA／body・BU実unwindは未実装。親は[B03後半の固定exit契約draft-0.2](BEST_PRACTICE_WFB_BODY_UNWIND_EXIT_DESIGN.md)と[B03前半の固定exit／同target局所退役](BEST_PRACTICE_WFB_FIXED_EXIT_LOCAL_RETIREMENT_DESIGN.md)。元の所有／費目契約は[(B) grant／固定exit責務](BEST_PRACTICE_WFB_PROBE_GRANT_EXIT_DUTY_DESIGN.md)を維持する。

正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。§12以外の実装・合成body起動・実接続・実通信・設定変更・Pushを行わない。§1〜11の新型／field名は設計案で、未接続経路の実行承認ではない。実grant／permit、実session／transport／worker、実writer、request／drain、Journal供給、admission／packet／field clear、borrow退役／owner解放・root終端は対象外。

## 1 同ownerの意味と既存配置への接続位置

物理的なcustodyは既存CanonicalGateDraftRoot、借用先は同rootが保持するtarget.start＝同RetirementStartAssemblyである。「同owner」はすべてのowner fieldが同じobjectという意味ではない。

| 既存identity | 読み取りで確認した正規参照 | 後半で要求する関係 |
|---|---|---|
| binding側owner | FrameBinding.owner＝target.scope.owner＝同startのprivate owner | context.bindingOwnerはこの同参照。別start／scope由来を拒否 |
| cell束側owner | ProbeCellBundle.owner＝root側の既存probeOwner | context.cellOwnerはこの同参照。bindingOwnerとの等値を新たに要求しない |
| custody | 同rootの先行slot・current／issuedと同startのborrow | source current／issued・borrow bundle・各child参照が同じ正規rootの組であることを検査 |
| frame／RunLink／duty | 同cells.frame、同issuedRunLinkと同issuedRunDuty | 新frame／第2dutyを生成せず、その同参照へ結合 |
| grant保持 | 同cells.grant。準備時はempty／全候補なし | pinは保持slotを参照する。まだ存在しないgrant本体をpinへ補完しない |

現行sourceではrootのconstructorでfailure・各固定配列を準備する。prepareの実順序は、root段階1〜30→probe cell段階1〜7→root段階31〜37とpost→probe binding段階8とbind／post→RunLink／duty段階1〜4とbind／post→exit anchor段階1〜5とbind／post→追加分岐→root readyである。root37段階を終えてからprobe8段階を全部生成する順序ではない。この番号は操作の順序を表し、内部allocation数の確定ではない。

将来の後半専用構築は、これらの先行postが済んだ後、root readyの直接代入より前へ挿入する。B03-Aのimmutable control／retirement／absence／terminal／bundleをanchorとして保持する一方、後半分岐ではB03-BのprepareGuardState／B03-CのprepareLocalStateを呼んでから流用しない。代わりに本書のbody用control・退役live slot・terminalを先行生成する。旧B／C分岐は既存生成順・bind・型・exportを維持する。

分岐の選択は同lexical rootの固定継続だけが行う。公開boolean／任意mode／callback／artifact登録でconstructorを切り替える口は作らない。新経路を実装しても既存check／checkLegacy／closeをbody runnerへ変更しない。

## 2 物理fieldと保持carrier

本書の「物理」はclass field・固定carrier・参照の配置である。byte layout、JS engineのheap block、allocator実測の証明ではない。

| 置き場所 | 新規保持案 | 制限 |
|---|---|---|
| 同rootのprivate field | bodyPreparationShellへの参照1つ。初期undefined。bootstrapのphase／boundary／最初の拒否位置は固定scalar | 新しいowner object・別root・外部registryなし。field初期化でbody用配列／sentinelを先に生成しない |
| 先行BodyPreparationShell | 既存root failureへの参照、slots参照、構築state／ready、bind claim／bind stage、現在／最初の失敗位置、固定refusal／delivery診断 | 子は初期undefined、ready=false、body実行gate=closed。故障ごとのlist／Promise／関数なし |
| shell.slots | 長さ13の固定arrayと13個のBodyConstructionCell | shell保持後にarrayを捕捉し、各cellを固定位置へ順番に捕捉。push／動的増設なし |
| 各BodyConstructionCell | 固定index／kind、stage、attemptReserved／callBoundaryReached、issued／current／rejected参照 | 平常はissued＝current。拒否候補1つまで、再試行・拒否のたびの増設なし |
| 同startのprivate field | bodyBundleCurrent／bodyBundleIssued／bodyRejectedBundle各1参照、bindAttempted／bindingStage等の固定scalar | 既存startへ追加する借用slotでありcustody移譲ではない。初期参照undefined、closed／未試行 |

新fieldの初期値はundefined／boolean／固定enumに限り、子object生成をfield initializerへ隠さない。rootの既存failureが利用可能なprepareの保護区間でbootstrapを開始する。root constructor完了前の既存allocation故障や実OOMについて、必ず診断を返せるとは主張しない。

carrierはindexごとに不変のkindを持ち、BC01〜13と1対1対応する。issuedは生成元が返した同参照、currentは検査対象の同参照、rejectedは初回の不一致候補である。正常時にobjectをcopyして3個生成する意味ではない。検査用counter／保持件数をidentityの代用にしない。

追加専用のBodyConstructionStageはnot_started／attempting／issued／provisional／confirmedの5値を提案する。source全体のfailedと、個々の到達済みstage／参照を分離し、故障時にstageを一律未生成へ戻さない。旧SupplyConstructionStageや旧mintの許可値は広げない。診断上の不正値unconfirmedはこの5値の正規進行へ採用しない。

## 3 Bootstrap：子より先に保持を確立する

| ID | 固定操作 | 直後に元rootが保持するもの |
|---|---|---|
| BS00 | 既存failureとbody bootstrap scalarを先行し、子なしのshellを生成→即時root fieldへ捕捉 | shellと固定診断。slotsは未生成 |
| BS01 | 長さ13・初期holeのslot arrayを生成→即時shell.slotsへ捕捉 | 同array。cell未生成をnot_createdとして区別 |
| BS02〜BS14 | index1〜13の空carrierを生成→即時array[index−1]へ捕捉。対応はBS(01+i)＝index i | 生成済みcarrier prefix。各dataのissued／current／rejectedはundefined |

各操作の観測境界はbefore／attempt／retained／done。attemptは試行予約、retainedは正規生成物の同参照捕捉後、doneは固定関係の確認後である。生成返却から先行fieldへの捕捉までhook／通知／await／別allocationを挟まない。arrayを完成させてからshellへ丸ごと返す方式や、shellのobject literal内で子配列／全cellを先に生成する方式は採らない。

BS02〜14は固定13位置の有限反復で、呼出しごとの再試行はない。途中故障でarrayにholeが残れば未生成のまま保持し、空carrier生成済みと偽らない。全carrierのdone前はBC00へ進めない。BS段階での故障時はdata生成0、start borrow0、grant追加0／active化0／body0。

## 4 Data配置と固定構築順序

BC00は既存baseの正規参照／先行postと、全carrier・shellの同root結合を検査する。準備時のuse=unused／未使用、duty=not_owed／退出未試行・phase none、grant=empty／参照なし、body=not_started／outcome none、exit=empty／候補なし、capture未呼出しを要求する。既存first／close・混入・spentがあればdata生成を開始しない。

以下はBC01〜13の固定data生成順である。carrierは全て先に存在し、parentのcurrentがconfirmedになるまでchildを生成しない。各行は最大1個のdata生成物を保持する論理操作で、V8等の実allocation1回を意味しない。

| ID／carrier | 追加data依存（既存baseは除く） | 生成物と正規field | 初期状態・参照先 |
|---|---|---|---|
| BC01／1 | なし | BodyConstructionContext：private brand、同seed／binding／cells／link／duty／control anchor／同start、bindingOwner／cellOwner、scope／pin／epoch／packet／frame／entry／exit | 既存正規参照のみ。子への参照なし。既存run seal／exit bundleも同組へ照合 |
| BC02／2 | BC01 | FixedBodyOrigin：private brand、context、kind=fixed_probe_body | 同context専用origin。新frame originではない |
| BC03／3 | BC01／BC02 | FixedThrowSentinel：private brand、context、bodyOrigin、kind=throw | body originへ先行結合。不変plain data、raw Error／messageなし |
| BC04／4 | BC01／BC02 | FixedCancelSentinel：private brand、context、bodyOrigin、kind=cancel | throw sentinelとは別identity。不変plain data、外部取消tokenではない |
| BC05／5 | BC01／BC02／BC03／BC04 | FixedBodyRoutePin：private brand、context、bodyOrigin、throwSentinel／cancelSentinel、grantSlot、kind=fixed_body、executable=false | grantSlot＝同cells.grant。grant本体参照・callback／body関数なし |
| BC06／6 | BC05 | BodyProgress：pin、bodyCell、activationConfirmed、callReserved、entryObserved、returnCaptured、callPhase／outcome | 同cells.bodyを参照。全flag=false、body_not_called／none。実body cellも未開始のまま。grant生成器のnot_calledとは別語彙 |
| BC07／7 | BC05／BC06 | BodyRouteClosure：pin、progress、bodyEntryClosed、controlReturned、continuationState | false／false／unobserved。falseを継続残存なしの証明にしない。実行gate閉鎖は別の構築条件 |
| BC08／8 | BC01 | BodyDiagnosticView：context、同root failure・同cells.diagnosticへの参照、probe／exit／delivery first、failure位置・refusal | 新理由はnone、位置none。元capture firstは同start private参照から後に読む。任意読取callbackを格納しない |
| BC09／9 | BC05 | BodyRetirementStorage：pin、同duty／control anchor、kind、used／blocked／confirmed、target／blockedTarget／confirmedTarget | not_attempted・全flag=false・全target undefined。B03-Cの実行済みretirementを採用しない |
| BC10／10 | BC05／BC06／BC09 | BodyTerminalStorage：pin、同duty、progress、retirement、同immutable terminal anchor、kind／prepared／committed、candidate／issued／accepted | none・false／false・退出候補3fieldはundefined固定。originのsentinelを退出証拠にしない |
| BC11／11 | BC01／BC05／BC06／BC07／BC08／BC09／BC10 | BodyUnwindControl：context／pin、progress／closure／diagnostic／retirement／terminal、state／routeUsed／inProgress、phase／boundary、fixedReply | idle・未使用・非進行・none／none・fixedReply undefined。同duty claimを追加生成しない |
| BC12／12 | BC01／BC05／BC06／BC07／BC08／BC09／BC10／BC11 | BodyPreparationBundle：private brand、context／pinとBC06〜11の同参照 | 不変の集約descriptor。別の子copyや関数を作らない |
| BC13／13 | BC12 | BodyPreparationDraft：private brand、bundle、同既存run seal、kind=body_unwind_prepared、executable=false | 非実行draft。publicにbundle／draft参照を返さず、値診断だけを別projectionにする |

immutable dataはplain fieldだけを持ち、生成元がissuedを先行保持した後にfreezeし、同参照をcurrentへ捕捉する。mutable slotのidentity／binding fieldはreadonly契約とし、進行fieldだけを正規private writerが変更する。freeze済みという事実だけで正規性を認めない。

BC11はそれより前の全live slotを参照し、BC12が全体を集約するため、後から参照を埋める循環構築は不要。BC01／05へcontrol等の未来の子を追加してbackpatchする方式は採らない。同duty・同controlの共有は既存参照で表し、body contextのownerを新規生成しない。

## 5 各data操作の固定境界と確認

BC01〜13の各行はbefore→attempt→issued→captured→checked→confirmedの6観測境界を持つ。beforeで同shell／carrier・必要な全前段confirmedと未使用を確認し、attemptでattemptReserved=true／stage=attemptingを固定する。固定producerの唯一の呼出し直前にcallBoundaryReached=trueを記録する。試行予約とcall境界到達は別で、どちらも生成完了の証拠ではない。

固定producerの返却物をcarrier.issuedへ直ちに捕捉しstage=issuedとし、その後にだけissued境界を観測する。immutableならここからfreezeし、同参照をcurrentへ捕捉してstage=provisionalとする。captured境界の後にstrict検査し、checked境界の後にstage=confirmedを固定する。freeze／current捕捉／検査の故障でもissuedは消さない。

strict検査はprivate brand・固定field数・全keyのdata descriptor、列挙値／初期flag、同context／pin／正規先行slot、root側issued=current、拒否候補なしを確認する。同値copy・版違い・余分なfield・foreign owner／originは拒否する。構造検査を行うのは固定producerが生成・先行保持したplain dataに限り、未知入力object／Proxyへ構造検査して資格化する口は作らない。故障注入のgetter付きplain候補もdescriptorとして拒否し、任意method／getterを実行しない。語彙だけで型を合わせるcastやpublicなsameOwner／readyからの復元は禁止。

BDへ進む前に13行を固定index順で再照合する。BC段階のconfirmedは生成物の検査結果であって、body準備ready／利用資格／終端成功ではない。検査後のphase故障は到達済みconfirmed事実を保持し、source全体はfailedにする。

## 6 同startへの一度限りbindと構築確定

| ID | 固定操作・一度限り境界 | 拒否／故障時 |
|---|---|---|
| BD00 | 13行全confirmed、元identity・閉鎖実行gate・未使用baseとstartの空borrow slotをpreflight | claim未消費。source failedで保持、別startへ付替え不可 |
| BD01 | source shellのbindAttemptUsed=true／bindStage=attemptingを直接固定 | sourceからのbind試行は最大1。以後falseへ戻さない |
| BD02 | 同target.startのprivate receiverだけへ進む。receiverは同start／既存binding／link／duty等をpreflight後、未使用occupancyを記録し、同bundleをborrow-issued／currentへ即時捕捉 | 既存borrowがあれば置換せずrefusal。sourceは同bundleを保持。call境界後捕捉未確認ならborrow状態unconfirmed |
| BD03 | receiverが同source shell／13行・bundle／draftと全子関係を再照合しbindingStageをconfirmedへ | 初回不一致候補を保持。borrowをclearして再bindしない |
| BD04 | sourceがreceiverのprivate保持・同参照・occupancyと自分の全slot／閉鎖条件をpost再検査 | targetに借用が残る可能性を失敗診断へ保持。public返答を同一性の証拠にしない |
| BD05 | 同shell prepared／readyとrootの構築readyを固定する直接同期区間 | hook／allocation／freeze／awaitなし。execution gateはclosed、body permissionは生成しない |
| BD06 | source／receiver／保持prefixを有限値へprojection | ready確定後の配送故障は別診断。再bind・再構築で補完しない |

各BD段階はbefore／afterを持つ。BD02内ではreceiver preflight→occupancy記録→borrow-issued捕捉→borrow-current捕捉の各prefixを区別して保持する。source bind claimは「一度供給する権利の消費」、receiver occupancyは「同startの格納場所を二重使用しない状態」であり、第2のrun／duty claimではない。source／receiverの両方の使用済み状態を払い戻さない。

receiverは同bundle経由でrootのdataを借りるだけで、13個の子をcloneしたり新しい別台帳で進めたりしない。start側の診断mirrorを追加しても参照から再計算できる保持boolean等に限り、独立のready／body資格／duty消費を作らない。正規結合は同lexical private bridgeからだけで、source shell／bundleを外から登録するfriendは設けない。

BD05は局所terminal commitや(C)のexit確定ではない。単一のroot readyだけ先に立てる／source readyだけ先に公開することは不可。構築用の同期field順・preflightの全参照を内部型実装時に固定し、BD05内へのthrowし得る操作挿入を対照で検出する。同期保証が不明ならready=falseで停止する。

## 7 失敗prefixと保持条件

| 失敗位置 | 生成／捕捉の事実と元ownerが残すもの | 禁止する処理 |
|---|---|---|
| BS00 before／shell返却未捕捉 | 既存root failureとbootstrap scalar、shell未捕捉の未確認責務 | 全追加allocationなし・診断必着の断定。実OOMはUnknown |
| BS00捕捉後・BS01前 | shell、元failure、ready=false | 子を後から生成して失敗を修復 |
| array／carrier生成途中 | 同shell／array、捕捉済みcell prefix、残りhole、試行位置 | 未生成cellを空生成済みと表示、prefixを捨てて再配列化 |
| BC before／attempt、call境界前 | 既存confirmed data、対象carrier、予約有無、issued未保持 | 予約を呼出し完了扱い、試行の払い戻し |
| call境界後・issued未捕捉 | 上段＋生成結果未確認の固定責務。producer返却参照を再建しない | 「生成なし」「全参照回収済み」への変換、第2producer呼出し |
| issued後・freeze／current捕捉前後 | issued、捕捉済みcurrent、初回rejected、不一致理由 | raw参照消去、同値copyへの置換、拒否候補上書き |
| checked／confirmed後 | 確認済みprefix、対象の到達状態、source first／最初の失敗位置 | 既知の生成事実をunknownや未生成へ巻き戻すこと |
| BD00拒否 | 全data／bundle／draft、claim未消費、source failed | claim未使用を再準備可能と解釈、別start選定 |
| BD01後・receiver捕捉未確認 | sourceの使用済みclaimと全data、borrow未確認責務 | bind未実行の断定、source claim返却、無条件の再bind |
| receiver捕捉後・BD04失敗 | 元root全data＋start側borrow／候補、両側の使用済み状態 | source slot／borrowをclear、receiverだけrelease済みにすること |
| BD05直前 | ready=false、全prefix・借用と未解決責務 | 部分preparedの成功公開、body起動 |
| BD05後・BD06配送故障 | 確定済み構築ready・同参照・元firstとdelivery診断 | ready巻戻し、二重構築／bind、配送失敗からbody試験を始めること |

失敗はsource状態failedと固定返答を最初に確定し、通常受付の第2prepareを閉じる。元root／既存producer firstを上書きせず、現在phase／boundaryと最初の失敗phase／boundaryを別に保持する。返却object生成が失敗しても、それを戻すために新しいfailure ownerや動的履歴を確保しない。

本段階にfield clear／fixed discard／外部custody移譲／borrow退役／owner解放はない。失敗後の「保持」は成功cleanupではなく、後の責務解消契約ができるまで同ownerが参照と未確認責務を失わないという意味。構築ready後の正常closeもここでは保持されたまま新規開始を閉じるだけであり、rootを解放済みとしない。

不一致のforeign参照を破壊／無効化せず、同sourceの候補保持と固定拒否に留める。receiverに既存正規bundleがある重複は、元処理のfirst・参照・退出能力を壊さないrefusal。新sourceの失敗と既存receiverの正常状態を同一視しない。

## 8 close・再入と公開診断

rootの既存構築中frameとstartの実行frameを混同しない。構築中の再prepareはconstruction_in_progress、構築後の重複はduplicate_preparation、失敗後は元固定結果とする。再入で未生成slotを生成したりsource claimを消費し直したりしない。after-closeでも第2startへの供給は不可。

closeは同rootの既存停止要求と固定body入口閉鎖を記録する。BD05前にcloseを確認したらreadyを立てずfailed／closedでprefix保持。bind前後のcloseは新data／bodyを開始させず、receiver捕捉済みならborrowを維持する。BD05後はcloseを別要求として保持し、構築済み事実を消さない。旧start.request／closeへ迂回して回収claimを消費しない。

診断はモデル版、構築state／ready／execution=closed、固定phase／boundary、first／refusal／delivery、13個のindex別stageとissued／current／rejected保持boolean、bind claim／borrowの固定状態だけ。identityはstrict booleanに投影し、owner／origin／grant slot／sentinel／bundle／draftの参照・識別派生値・raw例外は返さない。slots未生成、hole、空carrier、issuedのみを別に表示する。不在はnot_created、許可外はunconfirmedで、ready／confirmed等へ既定値化しない。

13位置は固定indexを列挙して投影し、holeを飛ばすarray.map／filterだけでschemaを作らない。BodyProgressのcallPhase／outcomeは構築中には初期値固定で、将来の実行時も同startの正規writerと実body cellの関係を検査する。rootとstartに独立した完了結果の台帳を作らない。

公開結果は固定plain data・freeze・有限schema。source／receiver参照のspread／serializeや未知getterを使わない。BD06故障後も元firstとsourceの確定状態を保持し、deliveryUnconfirmedを追加する。正式発行口閉鎖・全体受付無効・Unknown・調査保留の固定表示を変更しない。

## 9 構造枠・費目所有とUnknown

本書で固定する構造枠は、同rootへのshell1・長さ13のarray1・carrier13、data生成物13、start側bundle／拒否参照の有限field、source bind試行≤1・receiver occupancy≤1である。これらは論理object／fieldの最大保持数であり、JS runtimeの実heap allocation回数・byte数・GC解放確認ではない。失敗／再入ごとの再生成・appendは置かない。

BSは15の固定構築操作（shell／array／carrier13）、BCは事前検査BC00とdata13操作、BDは7段階。共通境界数に加えBD02内prefixやconstructor call境界があるため、この件数だけを全guard費やwork予約量へ昇格しない。既存37＋8＋4＋5段階は本追加分を含む上界ではなく、選択しないB03-B／Cの追加進行cellを費用へ二重計上しない。

費目所有者は同gate／frame owner。shell／carrier bootstrap、固定data生成／freeze／strict検査、source／receiver preflightとbind、全post、構築commit、診断projection／拒否を別の有限費目にする。既存base構築・capture・将来body／unwind・旧回収を再課金しない。共有guardの呼出しを二重に数えず、実装後に独立oracleで計数を確認する。

unit係数、実E／S要求、bootstrapの実allocation／layout／OOM、診断生成費・停止後の保持／解消予約、共通予算への実課金・全体work上界はUnknown。新cap・設定投入や期限延長は行わない。将来は同開始点のD_stop／D_end・同停止ownerへ結合し、残時間から新deadlineを作らない。本書はbody開放・全体受付の根拠にならない。

## 10 独立受入条件（将来・全て未実施）

| ID | 必須対照と確認点 |
|---|---|
| SC01 | bindingOwner／cellOwnerの各正規参照とsource custodyを別に検査。両ownerを同値へ揃える変異、別root／start／frame／duty／grant slotの混入を拒否 |
| SC02 | BS00〜14のbefore／attempt／retained／done故障で、shell／array／cellの捕捉prefixとholeを独立oracle比較。子を先に生成し後でrootへ返す変異を検出 |
| SC03 | BC01〜13の6境界でissued／current／rejected・予約／call境界を比較。issued前故障の未確認保持、freeze後故障の元issued保持、第2生成0 |
| SC04 | 各dataのbrand／全field／初期variant／固定field数／descriptor・同参照を単独混入。狙ったphaseで最初に拒否し、後段でmaskしない |
| SC05 | BC00の未使用base条件・前段confirmed・BC13後の固定全再検査を個別に壊す。ready／値draftからの実資格昇格0、grant／active／body追加0 |
| SC06 | BD00〜06とBD02内prefixの故障・同値copy／foreign bundle・重複を比較。source claimとreceiver occupancyの意味を分離し、払い戻し・上書き・別receiver再供給0 |
| SC07 | receiver捕捉後のsource post故障で両側参照を保持。source clear／borrow clear／候補喪失・第2ownerへの補完変異を検出 |
| SC08 | BD05直前／直後とprojection故障を区別。部分ready公開・同期区間のallocation／hook挿入・確定後の巻戻し／再bindを検出 |
| SC09 | 全構築境界のclose／再入・失敗後重複を検査。元first／最初の失敗位置／先行prefixと正規receiverを保持し、旧request／回収0 |
| SC10 | 実参照を入れた全公開graphで二段projection・enum既定値の負の対照。hole／空carrier／issuedのみを区別し、symbol／getter／関数／raw例外・secret出力0 |
| SC11 | 既存A／B／B03-C・phase再検査12対照・旧factory／exportを維持。source／receiverfriend登録口・C実行・body／実接続・正式発行・梱包混入0 |
| SC12 | 型試験で不正初期variant／stage、readonly関係の書換え、退出accepted値、executable=true／body起動関数field等を拒否。同値copyの拒否は参照検査SC04／06で担保し、構造的な型検査だけでidentityを証明しない |

oracleは本体の生成表・builder・state表・counterを期待値へimportせず、固定semantic event列からprefixを独立計算する。正規入力では同物理参照を保持し、負の対照はscratch内だけで改変する。最初の拒否phase／実呼出し数が変わることまで検査し、最終失敗だけで再検査を保証しない。到達不能／冗長防御は範囲と隔離方法を明記する。

## 11 次の分割と今回の検証範囲

次の実装を別途承認した場合も、まずshell／固定carrier・context／origin／sentinel／pin等の値型と先行保持に限定し、内部bind／構築readyまでの追加範囲を明示する。BA00〜03のactivation／body・BU00〜10の実unwind、正式証拠、実予算／実接続はその承認に含めない。全body経路とunwindを同じ変更で接続する親契約を維持する。

今回は本書と親2文書の参照だけを変更し、ローカルリンク・ID／表／生成依存順・保持関係と変更範囲・空白を検証する。ソース／試験／CHANGELOG／設定、build・合成／compiled試験・body起動は対象外。受入条件は成功済みとしない。作成時点では未コミット・Pushなし。

文書検証結果：3文書のローカルリンク19件に欠落なし、23表の列数・空白・末尾改行に異常なし。BC01〜13とcarrier1〜13の対応、data依存33辺の先行順／非循環、bootstrap15操作、BD7段階、SC12条件の重複／欠落を確認した。src／tests／CHANGELOG／manifest・lockfile／梱包・TypeScript設定はHEADと差分なし。index登録・実装・build／合成・compiled試験・body起動・実接続・実通信・設定変更・Pushは行っていない。

上記の「未コミット」「index登録…は行っていない」は作成時点の記録である。本書はその後`0932af9`としてコミットされ、draft-0.2のレビュー修正もMDのみで行った（Pushなし）。

## 12 先行seed限定実装（2026-11-10）

新`createProbeBodySeedFake`だけが同既存CanonicalGateDraftRootを利用し、base37段階／probe8段階／run4段階／exit anchor5段階のpost後に追加構築へ進む。B03-Bのguard state・B03-Cのlocal stateを生成／bindせず、body用のstart borrow fieldも追加しない。旧factory・旧分岐は維持する。新APIはprepare／check／checkLegacy／close／inspectの固定script・値返答だけで、run／bind／body／artifact登録口はない。

BS00 shell、BS01長さ13のhole array、BS02〜14の空carrierをrootへ即時捕捉する。各before／attempt／retained／doneの60点と、保持直後の同参照／固定field確認を持つ。shellは既存root failureを参照し、子を先にfield initializerへ確保しない。追加stageは5値、indexは1〜13の有限型。holeと空carrierを分ける固定13位置のprojectionを使う。

BC00でbase未使用・空grant／未開始body・空exit・同shell／carrierを確認する。その後BC01 context、BC02 body origin、BC03 throw sentinel、BC04 cancel sentinel、BC05非実行pinだけを生成。各before／attempt／issued／captured／checked／confirmedの30点を持ち、試行予約とcall境界を分離する。issued保持後にfreeze、同current捕捉、descriptor／brand／field数・全関係検査、confirmedへ進む。初回拒否候補と元issuedは保持し、後続producerを呼ばない。malformed producer対照は発行境界より前に固定候補を作り、copy対照だけは正規issuedと同値copy currentを区別する。

contextのbindingOwnerは同binding／start側owner、cellOwnerは同rootの既存probeOwnerへ照合する。別identityを一つに揃えず、同seed／binding／cells／link／duty／control／start／scope／pin／epoch／packet／frame／entry／exitとrun seal／exit bundleを固定する。pinは同cells.grantを参照し、grant本体は発行しない。sentinelはimmutableな内部値だけで、実throw／cancel／bodyを呼ばない。

正常でもshell.state=held／返答seed_held・ok=falseで止め、root ready／shell ready=false、bind未試行を維持する。carrier6〜13は空、BC06〜13・BD00〜06・BA／BUは未接続。重複prepareはrefusal、失敗後は元固定返答、close／再入は元prefixとfirstを保持し、再生成・clear・borrow解消は行わない。返答とsnapshotはfinite plain data・freeze・許可値／strict booleanだけで参照を返さない。

再検査の単独感度（レビュー修正）：BC00のbase節（use／grant／body／exit）、BC00でのbase照合、各mint前のbase／carrier／stage／予約／call境界／前段confirmed／前段data、bootstrapのfailure同一性／building／shell shape／BS00のslots未生成／BS01のhole／前段carrier未使用、最終再検査のbase／dataの20節は、単一注入で当該phase／boundaryが最初に拒否し、節を外すと拒否位置が移るかseed_heldになることをcompiledで確認する。freeze後の遅延書込みはTypeErrorで止まり、初回rejectedは捕捉したcurrentと同一参照、許可外のslot stageはunconfirmedと投影する。capture試行0・exit slot照合・`matchesRun`は同start側の状態を単独で壊す正規注入点がなく、単独対照の範囲外とする。最初の失敗位置の上書き防止は、現行経路では2回目のfailが同じphase／boundaryで起こるため等価。

新154件、関連25ファイル1,891件、compiled17本等と初回の型エラー／旧文字列anchor衝突は[検証記録](E2E_BEST_PRACTICE_WFB_BODY_SLOT_SEED_2026-11-10.md)。SC01〜05／09〜12の先行構築部分だけの検証で、BD／readyに依存するSC06〜08等の成功は主張しない。全guard・各BC00節・全再検査の単独感度や実allocation／E／S／OOM・全体work上界はUnknown。正式発行口閉鎖・全体受付無効・調査保留を維持する。
