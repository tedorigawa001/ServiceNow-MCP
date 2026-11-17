# JR-B 固定closure・tupleと段階別post・失敗後writer／終端責務の接続差分設計

Version: native-diagnostic-jrb-handlers-post-terminal-draft-0.1 / Date: 2026-11-17。
Status: 詳細設計のみ。基準HEADは`15e360d`。[先行shell・pin設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_RUNTIME_PIN_DELTA_DESIGN.md)RH07〜09・RS05〜10と[JoinRuntime設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JOIN_RUNTIME_GENERATION_DESIGN.md)§4〜8・10への差分である。先行shell・非実行pinと準備後postの試験補強は既存実装。以下のclosure／tuple生成、段階別writer、Promise生成・観測・失敗終端は未実装である。

正式発行口／新LM03／C実行入口／body起動閉鎖、全体受付無効、通常経路未切替、Unknown、VM／監視／telemetry調査保留、LOAD6／LOAD7選択・AP01〜06未承認を維持する。今回の変更は本書と親2文書のMDだけである。実装・製品moduleのimport／実行・closure／Promise生成・観測登録・試験再実行・build／pack・private公開・dispatch・実接続・実通信・実機操作・設定変更・コミット・Pushは行わない。

## 1 現行と差分、先行実装の上限

[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)のJoinRuntimeShellはexecutor／fulfilled／rejected handler・tuple・candidate／work／settler／ackをnull、観測／settle claimをfalseへ固定している。現行preparedShellMatchedはその全未使用状態と同owner・停止・同record・live pinを併せて検査する。failPreparedJoinは原始failure保持だけで、upper通知・copy・Promise終端は行わない。

本差分は「handlerが存在しても現行postをtrueにする」変更ではない。pin準備postを残し、handler準備・constructor捕捉・候補観測・失敗保持ごとの条件を分ける。3関数＋tupleを準備して固定拒否するPromise生成0の工程は単独で検証できる。その後のPromise生成・拒否観測・固定abort／失敗終端は対で接続し、未観測reject／無期限pendingの解消を後工程へ先送りしない。

`handlers`は3関数・tupleの保持／freeze／全post完了であり、`executor`は将来のconstructor呼出し中のexecutor入場である。handlerを作っただけで入場・work生成を報告しない。型／診断projectionの一致や同値copyから呼出し資格を復元しない。

## 2 内部型・固定slotと同owner結合

以下は未実装の内部field契約である。同role pendingだけを主保持先とし、既存canonical shell／identity／pinのaliasを再利用する。旧anchor直下pending、空seed、run開始claim、primary／revoked／sealed／currentと予算履歴に第二writerを作らない。

| ID | 固定対象 | 型・生成元・照合 |
|---|---|---|
| HC01 | handler準備履歴 | 同shellにhandlersPrepareClaim、準備busy、未開始／準備中／完了／失敗、保持detailと最初のdetail faultを先行配置。既存generation claimとは別の非返却履歴 |
| HC02 | executor closure | 同shell／identity／pin／roleと同role slotをlexicalに捕捉した1関数。caller関数・bind wrapper・Proxy・別ownerの関数へ交換しない。名前／length／文字列は起源証明にしない |
| HC03 | fulfilled closure | 同じcanonical集合を捕捉した1関数。引数はunknownとして無視し、許可された原始観測だけを記録してundefinedで復帰 |
| HC04 | rejected closure | 同集合を捕捉した別の1関数。reason本文を読まず保存・出力しない。fulfilled関数と同一objectを使い回さない |
| HC05 | 観測引数tuple | 同shellへ直接保持したreadonly 2要素、順序はfulfilled／rejected。3関数の実参照が先、tupleは保持後にshallow freeze。cloneや二本目を作らない |
| HC06 | constructor／executor履歴 | constructor未呼出し／呼出し中／復帰／throw、非返却constructor claim、executor entry claim、未入場／入場中／正常退出／異常退出、role別settler保持prefix。関数保持と入場を混同しない |
| HC07 | 観測／callback履歴 | 既存observerClaim・busy・登録状態に、登録呼出し到達、最初のcallback claim、callback中／退出、観測結果・callback faultを固定fieldで分離。fulfilled／rejectedで別々のcallback claimを作らない |
| HC08 | failure drain／終端履歴 | failureDrainClaim、drain中／退出、診断記録・通知・run copy・固定reject payload確保・settleの各試行と成否、実終端、未確認責務。raw例外／可変traceを保存しない |

HC02〜05のcanonical参照は同割当てから一度だけ記録するaliasとし、mutable holderの現在値を期待値へ再採取しない。handler closureをpublic返却物・入力・登録台帳・fixture friendへ渡さない。originは同closureの生成点・保持履歴・private呼出し位置で確認し、関数の形や呼出しstackの推測で認定しない。

保持detailはnone／executor_held／fulfilled_held／three_held／tuple_held／tuple_frozen／completeの有限値とする。途中で失敗すればslot.positionは既存pinのまま、slot.faultAtはhandlers、detail faultはexecutor_hold／fulfilled_hold／rejected_hold／tuple_hold／tuple_freeze／handlers_postの最初の位置である。取得済み参照は残し、最後の完了stepと部分保持を一つのcounterにしない。

将来の保持位置型は既存の有限generation prefixを拡張し、fault位置型は観測・通知・copy・settle等の固定siteも区別する。現在同じJoinPreparationPositionを使うことを理由に、callbackや通知失敗を「最後に生成できたprefix」へ上書きしない。任意文字列・line番号・時刻を新たな診断容量にしない。

## 3 closure・tupleの固定生成順

| ID | 同期操作 | 保持と失敗境界 |
|---|---|---|
| HS01 | 同role pin準備post、未試行・未使用handler fieldを確認 | canonical実参照が先。run停止は拒否、同record cleanupは元のread-only条件。未確認をhandler readyへしない |
| HS02 | handlersPrepareClaim消費→準備busy→準備中 | closure割当て・freeze・callbackより前。重複／再入でclaimを戻さず、自ownerだけを失効 |
| HS03 | executor closureを同shellへ直接保持→detail更新 | 呼び出さない。完了前に次のobjectへ依存せず、割当て失敗は保持済みprefixで停止 |
| HS04 | fulfilled closureを直接保持→detail更新 | 同executorと同shell集合。未知valueを採用する口を作らない |
| HS05 | rejected closureを直接保持→detail更新 | fulfilledとは別参照。原始failure writer以外の依存を捕捉しない |
| HS06 | 同2参照のtupleを直接保持→freeze→固定形状確認 | own 0／1が同2関数、own length=2、穴・余剰fieldなし。freeze前後の候補を失敗時も保持 |
| HS07 | handler準備post→位置handlers→準備完了 | 全field・同owner／pin／停止の最終確認が確定点。executor入場・Promise生成・観測登録・公開は0 |
| HS08 | finallyで準備busyだけ解除 | claim・最初のfault・部分参照を戻さない。正常時もconstructor入口が未接続なら固定拒否で終了 |

各保持後・freeze後に同ownerと段階の条件を確認する。HS03〜06の部分成功を一括clearして再構築しない。tupleは捕捉済み操作でown data descriptorを確認し、後段のReflect.applyに同tupleを使う。spread・iterator・caller配列から再生成せず、関数名・getter・任意callbackを確認のために実行しない。

handler準備の初回試行で既存generation claimを再消費しない。失敗後に条件が元へ戻っても、別handler・別tupleを作って同じrunへ救済しない。constructorや観測が未接続の先行実装では、直接呼出しの試験は固定拒否／原始failure保持だけを許し、native resolver・then登録を模擬成功へしない。

## 4 段階別post：生成資格と観測・終端資格を分ける

全postはforeign／copy／Proxyのfieldを読む前に、canonical root／slot／pending／identity／pin・必要handlerの実参照を比較する。postの成功は値または固定codeだけで、外部へ再投入できるauthority tokenを発行しない。

| ID | 段階 | 必須条件・許される次操作 |
|---|---|---|
| HP01 | pin準備済み | 現行preparedShellMatchedの全null／未使用契約を維持。HS01への入場だけ。handler保持後に同checkerを使わない |
| HP02 | handler準備途中 | 同pending、準備claim済み、所定detail、取得済みの同関数、残りはnull、work／settler／ackなし。次の固定保持だけ |
| HP03 | handlers完了 | 3関数・tupleのcanonical参照とtuple freeze、準備完了・非busy、executor未入場、constructor／observer／settle未試行、live pin。constructor未接続ならここで止まる |
| HP04 | constructor呼出し中／executor入場 | constructor claim済み・呼出し中・同executor・entry未使用。入場を先に消費してrole別関数参照を直接捕捉。queue・native・正常settle・通知0 |
| HP05 | 捕捉／候補保持 | 同executor由来の半pair／正常pairと退出を区別。constructor返却candidateは失敗中でも直保持。生成成功の判定とは別に安全な観測可否を検査 |
| HP06 | 観測登録前後 | 同candidate／work、同tuple、共有observerClaim、同P／thenのlive条件、登録中busyと復帰履歴、ack候補の先行保持。再登録・第二ack・正常公開0 |
| HP07 | callback書込み | 同登録到達履歴と同work／handler、初回callback、登録呼出し中busyではないこと。原始観測だけ。failed_retained／revoked／sealedを一括拒否する生成postは流用しない |
| HP08 | failure保持／drain | 同retained集合と先行fault・root停止を維持。通常生成の成功を要求せず、同安全候補の一度観測・通知・限定終端だけを個別資格で扱う |
| HP09 | settle直前／後 | 同work・同executor起源settler・未試行、必要な観測と安全なpayload。呼出し前claim消費、復帰／throwと実終端観測を分離。未知なら固定拒否・未確認保持 |

HP04のexecutor引数は、同private constructor呼出しの原始履歴と捕捉Pを前提にする。caller関数のtypeofや名前だけでは代用しない。runはreject→resolve、cleanupはresolveだけを保持しreject=null。早過ぎる直接呼出し・二重入場では引数関数を呼ばず、既存settlerを交換しない。通常executorは参照と原始履歴だけを書いてundefinedで退出し、検査拒否のためのError割当て・通知・copyを内部へ持ち込まない。注入／host例外の異常退出も成功へ補完しない。

executor内ではdescriptorを再取得してpin検査をやり直さない。必要なlive検査はconstructor直前のpostで行い、その後にcaller callback／awaitを挟まない。executor入場は保持済みのcanonical参照とconstructor／entryの原始履歴だけで判定する。関数捕捉だけの処理へ検査用の割当てを混入させない。

同ownerの失敗候補が安全に観測できるかは、生成の成功・executor正常退出とは独立に確認する。slot faultやrevokedを消す必要はない。pin状態をreadyへ戻す再pinはせず、同凍結pinの由来とその場のintrinsic条件を再確認するだけである。観測claimが既に消費済みなら、条件が回復しても再登録しない。pin不成立を迂回して未知thenableをawaitすることもない。

## 5 失敗・停止後のwriterと権限の寿命

| ID | writer | 書けるfield／禁止 |
|---|---|---|
| HW01 | handler準備継続 | 同shellのhandler参照・tuple・準備履歴だけ。各保持は一度。constructor／観測／settleの権限を付けない |
| HW02 | 固定executor | 同constructor呼出し中のentry履歴とrole別settler保持・退出履歴。foreign参照や2回目の引数を採用せず、正常body・通知・snapshotを実行しない |
| HW03 | 固定観測closure | 同登録・同workの原始結果、初回callback claim、callback中／退出、固定callback fault。value／reasonを読まず、通知・copy・then登録・setter・throw・thenable返却をしない |
| HW04 | 原始failure writer | 自ownerの最初のfault／位置→元primaryを未設定時だけ固定→同期revoked、同shellの失敗保持。割当て・通知より先。先行理由と実factsを消さず、foreignへ書かない |
| HW05 | 固定failure drain | 先行確保したclaim／成否fieldを使い、生成同期群とcallbackの外で通知・copy・固定payload確保・settleを最大一度ずつ処理。再生成・queue・新clock／floorは禁止 |

callbackではそのclosureが捕捉したcanonical参照と固定dataだけを読み、raw引数・this・reasonのpropertyを読まない。必要fieldは同shellのown writable dataとして先行確保し、登録後にfreeze／accessor化しない。これが成立しないまま観測を始めない。管理されたintrinsicとprivate writerの条件下で非throw・undefined復帰を検証し、任意の内部改変・OOMにも無条件で非throwとはしない。

callback内でpreparedShellMatched・live descriptor検査・snapshotを呼び直さない。登録前に確認した不変originへの実参照と、同登録・同workの原始履歴だけを使う。live pinの再確認と、観測後にどの終端処理へ進めるかの判断は登録／drain側の責務とする。

busy中の同期callback、2回目のcallback、早過ぎる手動呼出しは成功観測にしない。同ownerと登録到達を確認できた初回entryではcallback claimを先に消費し、異常も非返却にする。callback faultは原始値だけで記録し、失敗通知をその場で再入させない。後着callbackが最初の正規entryなら、失敗保持後でも観測事実だけを更新できる。根拠のない直接呼出しを、診断copyの一致で正規化しない。

revoked／primary／診断sealedは新規生成と正常受理を止めるが、既に登録した同workのprivate観測まで退役させる合図ではない。後着の正規観測は公開済みsnapshotやupper sealed診断を変更せず、private結果だけを記録し、fault・claim・readinessを成功へ戻さない。JR-Bではwriterの最終退役・参照clearを実装しない。真の退役後の書込みを許す汎用継続も作らず、最終custody／discardは別gate・Unknownとする。

callbackのoriginは登録時に保持した同workと不変contextであり、新規取得のためのcurrent一致検査をそのまま流用しない。currentが変わった場合も、保持済み同workの終端事実と、現在sourceのcleanup適格性は別である。前者を記録できても後者を承認せず、旧contextや別recordへnative factsを書き戻さない。pending／identity／登録origin自体の同一性が失われた場合は正規観測にしない。

## 6 一度限りのfailure drainと終端責務

次表の各試行fieldをhandler生成より先に配置する。単なるbusy解除は試行権の返却ではない。早い拒否で未試行のfieldが残っても、失敗drainの再呼出しで手順全体をやり直す口にしない。

| ID | 操作 | 固定順・終端との区別 |
|---|---|---|
| HT01 | failure drain入場 | 同retained集合を確認→failureDrainClaim消費→drain中。重複／再入は既存結論だけ、第二drainを作らない。先行faultの書込み自体は後着異常でも先行値を保つ |
| HT02 | upperの診断記録 | roleに応じstop／cleanup stage。未sealedの既存ownerの固定手順だけを一度試み、throwでもローカル理由・後段の責務を保持。既sealedはskippedとしてprivate履歴へ残し、公開診断へ新事実を補写しない |
| HT03 | 既存停止通知 | roleのnotify試行を先に消費し、同RecoveryAnchor.notifiedも再利用。既に試行済みなら再通知せず、その事実を記録。入口試行とbridge呼出し／成功ackは別で、throw・再入を成功通知にしない |
| HT04 | run copy | copy試行を先に消費し、同ownerの実計数・facts・token状態を反映した検証済み終端copyだけを保持。再seal／再copy、CPの0計数copy、正常snapshot fallbackは禁止 |
| HT05 | 固定reject payload | run copy不能時だけ、固定internal_review_errorのpayload確保を最大一度試行し、取得参照を呼出し前に保持。元例外の本文／stackを読まず転用しない。確保不能も再試行せずUnknown |
| HT06 | 同settlerの使用 | まだpendingと扱える安全な同work・同executor起源・必要な観測を確認→settleClaim消費→同settler呼出し→復帰／throwを記録。既終端なら呼出し省略。claimだけで実終端を報告しない |
| HT07 | 観測・退出・未確認保持 | workのfulfilled／rejected観測、callback退出、ackの保持／実終端を別軸で確認。void・busy=false・通知復帰・診断sealだけでcleanup／全解放をconfirmedにしない |

HT03の通知は旧notifyStopの固定入口を使い、新しいbridge／callback入力を作らない。RecoveryAnchor.notifiedは既存入口試行の共有履歴であり、roleごとに別の通知履歴を作って同bridgeを重複呼出ししない。同期通知の戻り値をawait／thenable同化せず、契約不成立を成功へ補正しない。

runのresolve対象は同owner生成の固定形状copyだけとする。Proxy／accessor・未知prototypeを拒否し、resolveで到達するthenがないことを捕捉済みの反射操作で直前確認する。通常Object prototypeを使うcopyでは、その先がnullであることとthen不在も含め、検査とresolveの間にcallback／awaitを挟まない。検証不能ならresolveせず、適格な同rejectと固定payloadの経路だけを検討する。公開copyへ新fieldを足す・別wrapperへcloneすることでこの検査を省略しない。

cleanupは制御失敗を記録したうえで、まだpendingで安全な同resolveがあればundefinedで限定終端する。ただしexecutor異常等で既にrejectした候補は後続resolveで修復したとはせず、実際のrejectedを保持する。観測済み終端ならsettler不足を理由に未終端へ戻さず、settle未試行／既終端による省略／試行済みと、実観測結果を別にする。観測不能・settler不足・payload不能は固定API拒否とprivate終端未確認に分け、未知workへ無期限joinしない。

未観測はpendingの証明ではない。同constructor／executor／settlerの保持履歴から安全な限定呼出しを判断し、実際のfulfilled／rejectedは正規反応を観測してから記録する。未観測の内部状態を覗くための任意then呼出しや新しいobserverは作らず、後続settler呼出しが復帰しただけで先行rejectを否定しない。

通知・copy・payload確保が失敗しても、既取得work・settler・handler・tuple・identity／pin・実recordをclearしない。生成制御失敗をfailConstructionへ戻さず、既存token退役、reader操作、driver close／bytes dispose、実class session close／予約返却の各責務を省略したり確認済みにしたりしない。本書はその接続条件を定めるだけで、既存正常seal／cache・公開結果ownerを置き換えない。

## 7 失敗prefix・保持・拒否の対応

| ID | 失敗位置 | 残すもの／禁止 |
|---|---|---|
| HF01 | handlers入場前・owner混入 | 自ownerの固定拒否と先行診断。foreign field／関数hook 0、既存pin／handler交換0 |
| HF02 | 準備claim後・3 closureの途中 | 準備claim、最後のdetail、取得済み関数。slot.positionはpinのまま、最初のhandlers faultを保持。再割当て0 |
| HF03 | tuple保持／freeze／post | 同tuple候補・3関数とfreeze／確認の区別。部分参照clear・tuple clone・完了markerの先行0 |
| HF04 | constructor／executorの途中 | constructor／entry claim・半pair・正常／異常退出。返れば同candidateを直保持。未返却workや未取得関数を推定しない |
| HF05 | candidate／観測登録・ack途中 | 同candidate／work、共有observerClaim、登録到達、ack候補と未知の復帰状態。別observer／第二ackで救済しない |
| HF06 | 同期／二重／後着callback | 最初のcallback claim・fault・観測事実と退出。成功への巻戻し0、理由本文出力0、callback内drain 0 |
| HF07 | 通知／copy／payload／settle | 各試行の先行履歴と成否、元理由・実計数・同参照。throw後に同手順を再試行せず、架空の終端・cleanup credit 0 |
| HF08 | stop／close・seal後 | 新規生成0。既存正規反応のprivate原始書込みだけを別資格で扱い、sealed公開診断は不変。未確認責務は同ownerに保持 |

不正状態・二重試行はinvalid_state、混入はevidence_binding_mismatch、生成／pin／観測・通知等の制御異常はinternal_review_errorを使い、先行HTTP／取消／期限を上書きしない。stageとpublic写像も元ownerの契約に従う。callbackやfailure drainの成否を別primaryとして採用しない。

## 8 将来の独立合成受入条件

以下は未実行の受入条件である。固定schedule・実参照・原始イベントからoracleを作り、生成側のsummaryを期待値へcopyしない。faultはscratch内の固定siteだけに入れ、製品に関数／constructor／observerの採用口を足さない。

| ID | 対照 | 受入条件 |
|---|---|---|
| HX01 | 同ownerとforeign／copy／Proxyのhandler・tuple | 全段階でcanonical参照が先、hook／foreign書込み0。関数名一致・同値tupleを起源にしない |
| HX02 | 3関数・tupleの全保持／freeze前後 | claim非返却、部分参照・detail・先行faultを保持。handlers完了まではposition=pin、Promise生成0 |
| HX03 | 再入・重複準備、post／return前stop | 3関数・tuple各1以下、第二準備0、run停止と同record cleanupを分離。正常ref復旧後も再利用拒否 |
| HX04 | pin／handler／constructor／観測の段階別post | 現行全null postを弱める変異と、必要field・同record・live pinの省略を拒否。未使用と半捕捉を混同しない |
| HX05 | 早過ぎるexecutor・二重entry・半pair・異常退出 | 正規calling中だけ捕捉。run reject→resolve／cleanup reject=null、queue／通知／正常settle 0。未知関数を呼ばない |
| HX06 | 既reject候補・観測登録throw／復帰喪失 | 生成失敗と観測資格を分離。共有observerClaim 1以下、ack最大1、再登録0。安全性不能をUnknownへ残す |
| HX07 | 同期／二重／後着callback、失敗後／sealed後 | 原始writerだけが動作し、first claim／故障不変、非throw／undefined復帰、raw引数hook 0、公開診断不変 |
| HX08 | failure drain／通知／copyのthrow・再入 | 先行原始停止と非返却試行を確認。同root通知の重複0、copy／seal再試行0、取得参照と実facts不変 |
| HX09 | copy不能／then到達あり／payload不能／settler不足 | 未確認を成功copyで補わず固定rejectまたは固定拒否。未知thenableの同化0、第二work 0 |
| HX10 | settle中再入・後着観測・既終端 | settle呼出し最大1、claimと実終端を分離。既rejectをfulfilledに修復したと報告せず、cleanup confirmedへ昇格0 |
| HX11 | 未dispatch正常候補の固定abort・有限終端 | 安全なwork／ackを試験終了前に確認。無期限pending・listenerによる失敗隠蔽0。確認不能を成功件数に入れない |
| HX12 | source／compiled・意味型・配布の負対照 | role／tuple順序／readonly origin／段階のsemantic不正を拒否。構文正常な省略変異を検出。固定distのみ、旧4export・strict raw・5fault・7permissions=false維持 |

関数割当て・native execution work・observer派生ack・API wrapper・試験用awaitを別に計数する。元の個別5秒・既定並列度、旧比較child60秒、製品全体60秒は変更しない。管理されたrealmと固定callbackでの未処理拒否防止を検証し、任意intrinsic破壊／OOM／process障害での完全回収は保証しない。危険な故障childが必要な場合は有限の終了契約・実施承認なしに起動しない。

## 9 容量・寿命・接続の停止条件

roleごとに準備する関数objectは3、tupleは1で、再試行列を作らない。tuple・確認済み関数のaliasを別生成数へ加算しない一方、閉包がroot／shell／identity／pinを到達可能に保つ寿命は別に計上する。後段の固定reject payloadはrun側の先行slotへ最大1参照で、元例外やstackを診断本文へコピーしない。module基準は共有data、主保持先は同pendingのままとする。

これは論理個数の契約で、Promise内部・閉包・固定Error内部を含む実backing容量の上界ではない。費目所有は同run／単一予算ownerに残し、C/G/P/Rの新しい成功credit・別予算・新sample／時計・floorを追加しない。callback退出、同work実終端、ackと参照責務の確認前にslotを空にせず、seal・busy=false・GCをdiscard証拠にしない。

まずHC／HSとHP01〜03を、Promise生成0・closure未呼出しの境界で実装・検証できる。次にHP04以降とHW／HTの安全な観測・固定abort／失敗終端を対で接続する。handler準備成功だけでRS05後半のconstructorを有効化しない。観測不能・終端不能・未解決の保持先を説明できなければ、その位置で停止する。

JR-Cのprivate公開・最終post、正規published cleanup合流、legacy work統一・dispatch／entry・正常finish、新LM03・friend撤去・AP承認、外側custody／最終discardは別工程である。今回のMD作成はそれらの承認ではない。

## 10 今回の静的確認と未実施範囲

基準HEADのliteral閉鎖field、preparedShellMatched／shellPreparationLive／failPreparedJoin、既存notifyStop・snapshot／execute／closeと、準備後post補強の記録を読み、現行実装と将来の契約を分けた。HC／HS／HP／HW／HT／HF／HXは設計IDであり、試験成功件数ではない。

今回実行するのは文書link／表／IDとsource構文・変更対象の静的確認だけである。製品moduleのimport・closure／Promise生成・試験再実行・build／packは行わない。変更は本書と親2文書の参照・工程境界の明記のみとし、ソース・試験・CHANGELOG・依存・設定を変更せず、コミット・Pushも行わない。
