# WF-B (C)：停止前提・clear権限・固定capture25cellの生成／確認境界

Version: draft-0.1 / Date: 2026-11-09 / 読み取り照合基準HEAD: `1d8e3f7`。

Status: **MDのみ。停止確認・clear権限・captureは未実装。** 親は[field別固定回収schedule](BEST_PRACTICE_WFB_FIXED_RETIREMENT_SCHEDULE_DESIGN.md)と[回収基盤設計](BEST_PRACTICE_WFB_PENDING_CUSTODY_RETIREMENT_DESIGN.md)。先行実装は[回収開始境界の検証記録](E2E_BEST_PRACTICE_WFB_RETIREMENT_START_2026-11-09.md)。本書はS00の残りとS01を具体化し、S02以降のfield clearを接続しない。

正式発行口閉鎖・C実行入口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。今回は文書だけを更新し、実装・合成試験・field clear・証拠発行・root終端・実期待値pin・実source照合・S発行・実接続・実通信・実機操作・設定変更・Pushを行わない。以下の型・flag・issuer・状態・固定操作は設計案であり、正式なpermitや実resource操作の権限ではない。

## 1 現行の開始claimとS00の分解

現行RetirementStartAssembly.requestはframe inactiveと同owner／pinを検査し、一度だけclaimを消費してrunning／blocked_field_clearで止まる。通常requestは同controlのgateを停止するだけで、root close／finishやcaptureを呼ばない。したがってstarts=1・claim spentをclear許可の代わりにしない。30fieldはnot_observed、8groupはunverifiedのままである。

既に実装した開始claimを戻したり第2回消費したりせず、S00を次の三境界として扱う。親scheduleの「停止確認してclaim開始」という抽象順序は、開始境界実装後はこの段階分離へ読み替える。

| 境界 | 前提と確定点 | まだ許可しないもの |
|---|---|---|
| S00a 開始予約 | 現行の同RetirementOwner／claimによる一度限りrunning | root停止済みの認定、capture／clear |
| S00b 正規停止確認 | 同SourceRootSlot・frame終了・通常利用の不可逆停止をprivateに確認 | 元slotの除去、root終端 |
| S00c capture受付 | 同停止確認・生成履歴・control originからcapture admissionを一度だけ発行／消費 | 全25cell確認前のclear、公開summaryへの権限移譲 |

S00b／cが失敗しても開始claimはspent、startsは1のまま。再request・close・再入で別captureを開始しない。現行のownership拒否／frame未確認で開始0の経路にはS00bへ進む権限がない。rootの停止確認とroot finishは別操作である。

## 2 正規停止の意味・理由保持

停止は次の三点を別々に確認する。

1. **供給ownerの通常gate**：同正規controlがstopped／retired、またはcontrol発行前なら正規生成履歴が通常入口閉鎖を示す。candidate controlの状態を根拠にしない。
2. **rootの通常取得gate**：同sourceのreadonly `#root`だけに新しいprivate retirement sealを設け、context／open／通常begin・prepare・checkが再利用できないことを確認する。
3. **生産frameの終了**：生成wrapperがinactiveで、返却値・catch・貸出carrierにprivate参照を外へ持ち出していない。未確認frameは停止確認を完了できない。

通常回収で既存root.closeを代用しない。現行closeはcloseRequested／readStop等を書き、Snapshotの失敗退役方針にも影響するためである。新private sealは単調なretirement専用flagとし、通常利用を拒否するが、既存first／closeRequestedを成功都合で書き換えず、borrow／Snapshotを退役しない。旧factoryはsealを使わない限り既存挙動を維持する。seal後の通常入口拒否は読み取り用の固定返答であり、新しい取得失敗を先行診断へ重ねない。新flag・各gateの変更は後続実装案で、現行に存在しない。

正規close／生成失敗では既存の理由と停止状態を維持した上でretirement sealを確認する。generation_unavailable→read_prepare_unavailable、binding／重複→binding_mismatch、source_rejectedでは元source理由を維持する。sealを確認するために再度close／failを呼ばず、理由の追加や旧discardを発生させない。既存停止があっても、通常gateが全て閉じた事実の確認は省略しない。

停止確認helperは正規SourceRootSlot→同source origin→同source内部のreadonly rootの順で対象を特定する。anchor・receipt・core・公開inspectからrootを引かず、foreign候補のmethodを呼ばない。sourceがunknownならroot呼出し0で停止確認をunconfirmedとする。emptyの場合は正規生成履歴とslot空を確認してknown-not-createdとし、root停止済み／root終了済みへ補完しない。

seal試行・Ack発行のslotは各一度限りで、途中throw／確認不成立でも未開始へ戻さない。通常停止が必要であることと、その停止を確認できたことは別に記録する。source／rootのmint origin自体を捕捉できなければAckを推測発行しない。

## 3 private内部型・発行元・所有寿命

全型は同compositionのlexical境界内だけで生成する。constructor／brand／issuer／reader／consumerをexportしない。公開diagnostic factoryは固定selectorと返答だけで、外部object・callback・権限tokenの注入口を追加しない。

| 型案 | 発行元／内容 | 寿命・禁止事項 |
|---|---|---|
| RootStopAck | 正規source／rootのprivate停止helper。owner／construction／retention／source-slot／source／root-origin／stop-epoch token、rootDisposition | 一度だけ同capture受付で照合。root instance・anchor・本文・raw claimを保持しない。root known-absentは専用variant |
| TrustedControlPin | 正規control issuer。control-origin tokenとmint状態、同scope／source-slot origin | coreの5fieldとは別の空origin。候補coreから発行しない。actual control強参照は元slot／capture cellから一時借用するだけ |
| ControlMintJournal | 同binding issuerの固定記録 | control生成前／捕捉済み／未確認、sourceへのbind前／後を区別。公開件数から再構築しない |
| CaptureAdmission | 同RetirementOwnerのprivate補助slot。開始claim origin・StopAck origin・scope／source／controlのpin・capture epoch | 正規停止確認後に一度発行・一度消費。copy・別owner・別epochを拒否。clearそのものは実行しない |
| CapturePacketShell | 同RetentionRoot配下、capacity1。packet originと25cellの固定配置 | source生成前に空の保持slotを用意し、生成参照を返す前に捕捉する。runtime登録口を持たない |
| CaptureCell | 対応するC01〜C25／F項目、stage・presence・値参照1・確認bit | 同cellへ一度だけ格納。overwrite／sort／ID再検索／再生成なし。段階と参照捕捉を別に記録 |
| CaptureReady | 全25cellの同参照／既知absence確認後のprivate issuer | 同packet／admission／epochへ結合する非実行値。本文なし。後続の固定clear入口だけが一度利用する予定 |
| PreparedClearAuthority | 同ownerの固定補助slot。StopAckとTrustedControlPin・epochへのtoken-only結合 | CaptureReadyと同時照合する将来のclear前提。単独ではclear不可。今回は生成契約までの設計で、clear consumerを接続しない |

control originはlive生成より前にprivate fieldへ付け、実際のcontrolからprivate accessorで読む。payload-containingなcoreを発行した拒否対照でも、coreとは独立したmint originで「自ownerが捕捉したcontrolのlive cellを除去できること」と「そのcoreを正常に残せること」を分離する。前者が成立しても後者の正規5field照合は別に必要である。

source `#normalControl`はbind済み履歴として残し、通常利用復活を防ぐ。bind済みでは同control origin、bind前はjournalと実field空を確認する。未発行と捕捉未確認を同じvariantにしない。candidate receipt.controlは外側receiptの参照としてcaptureするだけで、そのmethodを呼ばない。元／issued controlやmint記録以外のobjectを正規controlへ昇格させない。

RootStopAckのsource／root originは正規slotからprivateに固定する。新token／flag／補助slotの確保は実装前に費用へ加える必要があり、現行予算へ未導出の後着課金をしてよいという意味ではない。

Ackはroot_captured／root_not_createdのstrict variantに分ける。前者だけがsource-origin／root-origin／seal-epochを必須にし、後者は正規生成履歴のabsence-checkpointを必須にしてsource／root originを禁止する。unknownはAck variantとして発行しない。TrustedControlPinもminted（control-origin必須）／not_minted（mint-journal originとabsence-checkpoint必須、control-origin禁止）に分け、未確認値をnot_mintedへ変えない。

CaptureAdmissionとPreparedClearAuthorityはsource_backed／local_onlyを区別する。known-not-createdから得たlocal_onlyは元source reader・source field操作を許可せず、対象なしのsource側cellと既知localの確認だけに使う。variant／owner／開始claim origin／epoch／packet対応は発行slotの同参照と各fieldで照合する。flagの書換え・同値copy・JSON再構築でsource_backedへ昇格できない。

## 4 固定capture25cellと読取元

左からC01→C25の固定順で扱う。F14／F29／F30は検査項目、F24はpacket自身、F28は一時carrierなのでcapture cellに含めない。F29は後続final auditで正規SourceRootSlot経由のcontrol fieldとTrustedControlPinを照合する。

| Cell | 元F | 正規の読取元 |
|---|---|---|
| C01 | F01 | source `#registry` |
| C02 | F02 | source `#table` |
| C03 | F03 | source `#view` |
| C04 | F04 | source `#buildingRegistry` |
| C05 | F05 | source `#buildingBindings` |
| C06 | F06 | source `#buildingDeclarations` |
| C07 | F07 | source `#envelope` |
| C08 | F08 | source `#issuedTable` |
| C09 | F09 | source `#issuedView` |
| C10 | F10 | source `#issuedDeclarations` |
| C11 | F11 | source `#tableOrigin` |
| C12 | F12 | binding `#payload` |
| C13 | F13 | binding `#issuedPayload` |
| C14 | F15 | 自issuerが捕捉した正規control `#live` |
| C15 | F16 | binding `#claim` |
| C16 | F17 | binding `#issuedClaim` |
| C17 | F18 | binding `#extraClaim` |
| C18 | F19 | binding `#control` |
| C19 | F20 | binding `#issuedControl` |
| C20 | F21 | binding `#extraControl` |
| C21 | F22 | binding `#anchor` |
| C22 | F23 | binding `#issuedAnchor` |
| C23 | F25 | binding `#receipt` |
| C24 | F26 | binding `#issuedReceipt` |
| C25 | F27 | binding `#context` |

各readerは固定のprivate fieldを直接読む専用継続とする。外部field名・reflection・任意getter・汎用callbackを受けず、公開inspect・sourceRetentionの合計・claim state・関係okだけを読取根拠にしない。C14はmint journalと同control originを確認してからprivate live cellを読む。元controlがknown-absentならmethodを呼ばずabsenceを確認し、unknownなら未確認とする。

seal後は通常のcanonicalSupplyAccess.context／openが拒否するため、captureの成立に通常contextの再取得やsupplyTransferAccess.matchesの成功を要求しない。必要な正規scope／mint根拠は停止前にtoken-only pinへ固定し、停止後は専用readerで元fieldを読む。正常利用のstrict検査を外すのではなく、正常受理と回収所有権を分離する。不正candidateの内容を正規宣言として採用せず、自ownerが保持する参照として捕捉するだけである。

sourceがknown-not-createdならC01〜C11は正規source生成履歴とSourceRootSlotの空を根拠にknown-absentを確認し、root／source readerを呼ばない。sourceがunknownならS00bで停止確認をunconfirmedとし、CaptureAdmissionを発行しないためC01〜C25の新readerを呼ばない。既存bindingのlocal保持はそのまま残し、C01〜C11をconfirmed-absentへ補完しない。unknownのまま局所captureだけを救済する別経路は本書では設けない。

## 5 packet生成・一度限りcapture・同参照確認

先行ownerはpacket保持slot、25cell配置、capture受付slot、固定診断をsource生成前に用意する。空slotがあることとpacket生成成功を分け、packetの生成開始前はnot_started、生成呼出し後に返らなければallocation_unconfirmed、返った参照を同ownerへ記録した直後はprovisionalとする。実OOMでこの先行owner自体を確保できない場合はUnknownで、診断必着を保証しない。

CaptureAdmissionは同runningの開始claim・inactive frame・RootStopAck／known-not-created・正規control mint状態を確認して一度だけ発行する。正規発行slotとの同参照と全tokenをconsumerで照合し、unused→capturingの同期置換がcapture開始点。既存の回収開始claimは追加消費しない。再入はcapture_in_progress、完了／失敗後は固定結果を返し、packet再生成・再準備をしない。

各cellの固定手順は次の通り。

1. 同packet origin、cell位置、F対応、capture cursor、同owner／epoch、通常gate停止、frame inactiveを確認する。
2. 正規readerで元slotを一度読み、presenceと参照を同cellへ格納する。格納前にconfirmed bitを立てない。
3. 元slotを同じ正規readerで再読し、objectなら`===`による**同参照**、undefinedなら正規生成履歴を伴う**既知absence**を確認する。同値copy・別cell・候補slot・別epochは拒否する。
4. 停止とepochをpost確認してからconfirmedへ進め、cursorを一つだけ進める。失敗なら元slotへ書き込まず、provisionalな参照をcellへ保持する。

cellのstageはnot_started／reading／provisional／confirmed_present／confirmed_absent／unconfirmedとする。readingでthrowし値が捕捉できなければunknown、格納後なら参照ありのunconfirmedであり、同じ状態へ潰さない。undefinedという読取結果だけでabsenceを認定せず、not_mintedまたは既存source discardの確認済み履歴と突き合わせる。旧discard計数だけでは確認済み履歴にならない。

capture epochは通常利用と生成frameを閉じた後に同ownerのprivate発行slotへ一度固定する。両readerの間に元slot・停止・mint状態が変われば同参照確認を拒否する。確認中にawait・clock採取・任意通知・外部hookを挟まない。固定故障scriptで元slotのcopy差替えやepoch差を作り、確認感度を試験する計画とする。

ここでinactiveを要求するframeは生成wrapperと前段の借用frameであり、現在実行中のcapture frame自体ではない。capture frameは自ownerのScratchCarrierへ参照を閉じ、退出前にreadyの固定token-only返答以外を外へ出さない。後続final auditはこのcapture frameと後続clear frameの退出も別に確認する。

capture中の正規closeは二つ目のcaptureを開始しない。通常停止要求を保持し、親の理由優先順に従ってclose理由を記録するだけで、cleanup用epochを通常closeだけで失効させない。同じ停止・元slotが安定していれば現captureは継続可能とする。closeと同時に元slot・mint状態・権限epochが変わった固定対照ではpost確認が不成立となりunconfirmedで止まる。通常closeから旧source.clear／finishへ迂回することは禁止する。

**全25cellの確認が終わるまで、一つも元fieldをclearしない。** これは親設計の「対応capture確認後だけclear」を強めたS01の固定境界である。presentとknown-absentを合わせて全25cellがconfirmed、cursor=25、同epoch・停止・frame条件が成立したときだけCaptureReadyを一度作る。cursorや確認件数だけでreadyにせず、各private cellと正規発行slotを確認する。

CaptureReady／PreparedClearAuthorityは本文を含めないが、packet自体は強参照を持つ。readyであってもpayload_retiredとはならず、root gateも開かない。後続clearは同epoch・同packetのreadyとauthorityを同時に消費する別実装であり、public summaryや件数から再発行できない。

## 6 失敗prefix・最後の保持者

| 失敗位置 | 元slot／captureの責務 | 拒否後の状態 |
|---|---|---|
| S00a前のowner／pin拒否 | 元ownerが全参照を保持。開始claim0 | 既存binding_rejectedを維持。新sourceへ触れない |
| S00bのseal呼出し／確認失敗 | 正規SourceRootSlotと元fieldを保持 | 開始claim1、stop_unconfirmed。capture受付・clear0、root終端0 |
| source未知・frame未確認 | 元slotの既知参照とUnknown責務を保持 | readyなし。claim値は実際の開始段階を維持し、unknownから空を推定しない |
| packet生成が返らない | 先行slotはallocation_unconfirmed、元fieldを保持 | packet不存在と断定しない。生成再試行なし |
| packet参照捕捉後・確認前 | 元field＋provisional packetを同RetentionRootが保持 | capture_unconfirmed。custody移譲完了と報告しない |
| C_i読取前／読取throw | C_1〜C_(i−1)の確認prefixと全元field、C_iの未知責務 | 後続capture停止。対象をknown-absentにしない |
| C_i格納後・確認前 | 全元field＋同cellの格納参照 | provisional retained、confirmed bitはfalse |
| C_i再読のcopy差／epoch差 | 元slotの実際の参照＋元のcapture値 | 両方を自ownerの固定経路で保持。元slotをcapture値へ復元しない |
| C_i確認後・次cell前 | 確認済みprefix＋全元field | prefix確認を維持しつつ全体unconfirmed、readyなし |
| ready生成途中／発行後結果失敗 | 全元field＋全packet | cell確認済みとready未確認を分離。ready再発行・clear開始なし |

この工程はfieldWrites=0である。どの失敗でも元slotをclearせず、第2packet・第2sourceを生成しない。元slotが外部故障scriptで既に変わっていれば「元値が元slotに残る」と虚偽報告せず、元slotの現在値とcapture値の別責務を記録する。capture自体を放して参照の最後の保持先を失う、無確認でFailureCustodyへ移譲済みとすることを禁止する。

FailureCustodyのlive cellがまだ未生成／未結合なら、RetentionRootがpacketを保持し続ける。確認済みcustodyへの同参照捕捉を将来接続するまで、owner名だけを置き換えて移譲完了としない。unconfirmed後の反復request／closeは通常停止と同診断返答のみで、seal／reader／capture／ready発行を再実行しない。closeが必要な理由を新たに持った場合も、既存firstとcapture失敗を別軸で残し、失敗終端を成功へ変えない。

## 7 診断・停止理由・非出力

通常first／stop、rootの元理由、stop確認、capture受付、cell確認、ready発行を別軸とする。既存のfirstを後着のstop_unconfirmed／capture_unconfirmedで上書きしない。代表返答は既存firstがあれば優先し、capture側の失敗位置も常に固定fieldへ保持する。

新診断案はstopDisposition=not_started／confirmed／known_not_created／unconfirmed、captureDisposition=not_started／capturing／ready／unconfirmed、allocationStage、cursor0〜25、25cellのstage／presence／referenceConfirmed、firstCell C01〜C25またはnone、failureBoundary、readyState=not_issued／issued／unconfirmedとする。起動回数／発行・消費は各0／1。追加理由はstop_unconfirmed／capture_binding_mismatch／capture_allocation_unconfirmed／capture_read_unconfirmed／capture_reference_mismatch／capture_epoch_mismatch／capture_ready_unconfirmedの固定enumとする。

診断へobject identity値、source／root／control／元claim／packet参照、bytes・digest・path全文・raw例外を含めない。referenceConfirmedはprivate照合の出力にすぎず、clear権限や証拠へ再入力できない。fieldのemptyConfirmedと群のconfirmed_emptyは全てfalse／unverifiedのままにする。payloadはnot_started、rootFinishはnot_called、resourceCleanupはnot_startedを維持する。

## 8 有限費目・独立受入条件

packet1・cell25・capture claim1・StopAck1・TrustedControlPin1・ready slot1・authority slot1を固定容量とする。各cellの開始・格納・確認は最大1、readerは初回と確認用の最大2回、停止／epochのpre／post確認は固定回数として別に数える。source known-not-created／control known-absentではreaderを呼ばず、専用の履歴／空確認を数える。無制限retry・拡張list・要求ごとのpacket追加はしない。

これは構造上限であり、25×2を全workとして扱わない。origin／pin生成、root seal／gate確認、履歴確認、scope／cursor／cell対応照合、packet生成・結果固定・一時carrier退役を費目所有表へ追加する。旧discardは入口baselineからの増分0を確認し、実E／S・CPU／heap／layout・実OOM時診断必着はUnknownのまま。既存cap・期限・D_stop900／D_end1000・guard131,524は変更しない。

| ID | 合成・compiled受入条件（未実施） |
|---|---|
| CA01 | 正常回収sealでfirst／closeRequestedを変更せず、全通常gateを拒否。close／失敗済みでは元理由とborrow／Snapshot保持を維持 |
| CA02 | owner／scope／source slot／source／root／control origin／epoch／claim／発行slotを一条件ずつ混入。狙う条件以外は整合し、foreign method呼出し0を確認 |
| CA03 | 25cellのC→F対応を独立表で検証。順序入替え・同値copy・同参照だが別field・別packetを拒否。aliasが同じでもfield確認をskipしない |
| CA04 | 元fieldに別々のsentinelを置いた有効基点で初回読取・格納・再読・post確認を個別に故障注入。元slot無変更とprefix／未確認保持を確認 |
| CA05 | source empty／unknown、control未発行／未捕捉、既存discard済みを分離。absence bitだけの偽装とunknownの空補完を検出 |
| CA06 | admission発行／消費・cell途中・ready生成前後へ再入／closeを配置し、各試行≤1、ready再発行なし、開始claimの追加消費0を確認 |
| CA07 | packet／mint／StopAck／ready途中生成失敗を区別し、未捕捉を未生成と認定しない。元slot＋provisional packetと未解決責務を保持 |
| CA08 | 確認bit先行、reader再読省略、epoch／stop post省略、cursorだけのready、25cell確認前clearを変異で検出 |
| CA09 | malformed core／receipt.control・raw live tuple・一時carrierが参照を持つ対照で、capture成功をpayload退役にしない。clear／proof／root finish呼出し0 |
| CA10 | 元理由と停止／capture理由・field位置を保持し秘密非出力。旧factory／開始境界の単独混入対照・compiled・梱包除外を維持 |

独立oracleは本体のcell配列・reader dispatch・確認bit・係数をimportせず、元slot→capture値の参照関係と失敗prefixを別記述する。現在の固定fixtureで空のbuilding／extra fieldにも非空の有効基点を作る。代表fieldだけの試験を25cell全体のcoverageとせず、非該当・未到達も明記する。GC完了・任意JS heap全体・実native停止は保証対象外である。

## 9 次の実装分割・今回の確認

1. **停止確認・権限の内部型**：同ownerのStopAck／TrustedControlPin／capture admissionと正規private生成継続を合成依存で整備する。通常回収とcloseの理由を分離し、captureはまだ閉じる。
2. **25cell生成・格納・同参照確認**：固定packet・reader・epoch・一度限りreadyへ接続し、全失敗prefixを検証する。元slotは全て保持し、field clearは0のまま。
3. **別工程のclear**：同ready／authorityを固定consumerで消費し、親schedule S02以降へ進む。packetは両receipt／contextの空確認後まで保持する。証拠／root終端はさらに別工程。

`1d8e3f7`の開始境界・private pin／stop継続、sourceのreadonly rootとcontrol／claim／receiptの保持経路、root close／finishの診断副作用を読み取り照合した。先行試験の成功を本契約の実装証拠に転用しない。今回は新設計書と親文書だけを更新し、ビルド・試験・梱包・実費検証は行っていない。関連3文書のローカルMDリンク17件、C01〜C25の一意な25field対応、受入条件10件、fence対応、`git diff --check`を確認した。ソース・fixture・CHANGELOGの変更なし。未コミット、Pushなし。
