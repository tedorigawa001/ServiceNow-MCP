# WF-B：scratch受理区間・進行位置・候補確定点の差分設計

Version: draft-0.6 / Date: 2026-11-08 / 読み取り照合基準HEAD: `692b280` / レビュー修正の基準HEAD: `d80f817`・`2eb2b76`・`7eac019` / (B)実装基準HEAD: `6fd83d4` / 容量補完基準HEAD: `92523f2`。

draft-0.5のレビュー修正: update予約の同時最大数を定数1の代入で示しており、二重予約を検出できなかった。予約直後の現在予約数から最大値を実測し、容量計数oracleも予約・解除を別に数えて照合する（§8）。

draft-0.5: §9の最大8MiB成功走査・最終fileの余剰byte・宣言上限拒否を合成試験で補完した。[容量検証記録](E2E_BEST_PRACTICE_WFB_READ_HASH_CAPACITY_2026-11-08.md)。同snapshot接続・行集約は進めていない。

draft-0.3のレビュー修正: (B)のdigest不一致対照がscenario名で不一致を強制しており、実digest比較を外しても検出できなかった。対照のpayloadを1 byte変え、固定abc digestとの実比較だけで不一致にした。全file確定後の誤用は後着停止の有無にかかわらず`binding`として保持する。入口は引数0個（normal）または固定scenario文字列1個だけを受け付ける。sticky停止後の直接step、900／1000の固定時刻境界、時計逆行、先行制御理由の保持、guard枠切れ時のcleanup時刻unknownの対照を追加した（§8）。

draft-0.3: §8の(B)独立合成assemblyを実装した。§1〜7の契約に対する実施範囲・残差を§8と[検証記録](E2E_BEST_PRACTICE_WFB_READ_HASH_B_2026-11-08.md)で区別する。

draft-0.1のレビュー修正: 固定上限ではupdate枠がread枠より先に尽きないことを導出し、update枠拒否の検証を縮小profileの合成内部対照へ限定して検査順と理由を固定した（§3／SC05）。`readCompletedFiles`の加算点をafter観測一致へ固定し、(A)の`acceptedFiles`と同義にしない（§2）。固定record準備をclose確認後・最後のpost-guard前の`record_ready`段に一本化した（§4／§5）。全file確定後の取消・上限停止もsession成功扱いしないと明記した（§5）。SC02の位置をbyte累計で表した。

Status: **(B)の同scratch・同bytes hashと候補受理を独立合成assemblyで実装。実source／同MapSupplySnapshotへの接続・行集約は未実装。** 親は[private読取・hash設計](BEST_PRACTICE_WFB_PRIVATE_READ_HASH_DESIGN.md)と[固定辞書供給設計](BEST_PRACTICE_WFB_FIXED_DICTIONARY_SUPPLY_DESIGN.md)。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。draft-0.1／0.2はMDのみ、draft-0.3の実装は§8の合成bytesに限定する。実期待値pin・実source照合・S発行・core接続・実接続・実通信・設定変更・Pushは行わない。本番cap・実backend保証・実snapshotへの接続を承認しない。

## 1 差分と所有境界

(A)は`bytes(n)`だけを受け、成功read直後にoffsetを進める。`acceptedFiles`はbefore／read／EOF／after／closeとpost-guardを完了した件数で、fileのhash軸は`pending`（hash待ち）のままである。途中closeは`incomplete`、全file受理後の制御停止は`stopReason`へ保持する。この既存契約をhash確認済みへ読み替えない。

(B)ではsessionが固定長65,536 byteのscratchを1つ所有し、同scope・同resourceの固定ReadOpsだけが書き込む。外部buffer／view・SharedArrayBuffer・resizable buffer・任意callback／reader登録は受け付けない。readerとhash adapterはscratch参照を保存せず、各呼出しが終わると借用を返す。実backendがこの性質を満たすかはUnknown。

FileReadScopeは同session・canonical file要素・ordinal・resourceと、before観測・進行位置・hash状態を保持する。hash candidateはそのscopeでのみ生成し、同値copy・別scope・別resource・IDやdigestだけが等しい値を採用しない。実MapSupplySnapshotのprivate借用への接続は後続(C)であり、(B)の合成originを実供給の証拠へ昇格しない。

## 2 進行位置と計数の分離

| 状態／計数（内部名案） | 更新点・失敗時の意味 |
|---|---|
| `readAttempts`／`retryAttempts` | 実呼出し直前に課金。pre拒否は0、呼出し内throwは1。retryは実際の再試行直前だけ課金 |
| `receivedBytes`と受信量の確実性 | 妥当な`bytes(n)`を観測したら直ちにn加算。hash失敗でも戻さない。不正n／取得量不明のthrowは確実性をunavailableにし、既知prefixは保持 |
| `payloadPosition` | 次のpayload readの位置。初期0、hash update成功後だけn進める。成功区間ではhash済prefix長と一致 |
| `hashedPrefixBytes` | 正常完了したupdateの対象byte数。失敗updateによるbackend内部の部分進行は含めず、別の`hashState=poisoned`で不確実性を示す |
| `hashUpdateAttempts`／`hashUpdateCompleted` | update呼出し直前／正常復帰後にそれぞれ加算。throwは試行のみ増える。既知完了量をbackendの総処理量と呼ばない |
| `readCompletedFiles`／`hashAcceptedFiles` | 前者は宣言位置のEOF確認とafter観測一致を観測した時点で1加算し、close確認・post-guard・primary理由の有無を含まない。後者は§5の確定済みslot数。前者は(A)の`acceptedFiles`（close確認・post-guard・理由なしまで含む）と同義ではない。内部で区別し、前者から後者を導出しない |

受信量はsession累積で、payloadとEOF余剰byteを含む。hash済量はfileごとの正常完了prefixとsession合計を持ち、EOF余剰byteを含まない。受信量と位置の一致は一般には要求しない。全加算を有限上限・safe整数で事前検査し、overflowで丸めない。

hash updateがthrowした場合、既知受信nは残るがposition／正常hash済prefixは直前の値を保つ。hash内部が変更済みかは不明なのでpoisonedをstickyにし、同位置の再読取・update再試行・final・候補生成を禁止してcleanupへ進む。位置が進まなかったことをretryの許可にしない。

## 3 scratch受理区間と受付順

payload readは以下の固定順にする。

1. 同scope／resource・位置・stage・retry条件を検査する。pre-guardで停止を確認する。
2. read試行・retry・要求長ぶんの受信余裕、hash update 1試行の余裕、同位置の進行加算をdispatch前に検査する。updateの予約は同attempt専用で、別readへ流用しない。cleanup予約はopen前に確保済みであることを要求する。
3. 試行を課金し、同resourceからowner scratchへ単発readする。ここから受理区間に入り、結果判別・n検査・受信計上・同期hash update・位置確定までを固定処理で行う。
4. 正常payloadならscratchの`[0,n)`だけをupdateし、成功後にhash完了計数とpositionを同じ内部遷移で進める。末尾の残存bytes・要求長までの未書込領域・別bufferをhashしない。
5. 区間を抜けてpost-guardを行う。取消・期限・失効が観測されたら次のread／observe／finalを禁止し、候補未受理のままcleanupへ進む。

受理区間にはclock／cancel取得・外部通知・await・再入可能な利用者hook・scratch再利用を挟まない。ReadOpsと同期hashの呼出し自体は固定された信頼境界であり、任意の注入関数へこの保証を拡張しない。read中に到達した取消／期限は、妥当なpayloadの受信計上とupdateを1回終えた後に観測する。hash失敗時も後続guardで停止診断を保持するが、失敗hashの再実行はしない。

予約は実行数ではない。interrupted／eof／failedでは未使用update予約を解除し、update試行は0のままにする。呼出し済みupdate・read・retry・受信bytesをrefundしない。予約の二重解除や解除によるcap再生成を拒否する。EOF probeはpayload updateを予定しないためupdate予約不要だが、受信余裕1 byteとread枠を要する。

| read結果 | 受信／hash／位置と後続 |
|---|---|
| 妥当な正の短読取 | nを受信計上、update 1回、成功時だけ位置+n。残量から次要求を作る |
| interrupted | 受信・hash・位置は不変。同resource／位置／要求長だけを共有retry枠で再試行可能 |
| 期待長前のeof | `content_mismatch`。updateなし、after観測をskipしてclose |
| 宣言位置のeof | EOF確認。updateなし、guard後にafter観測へ進む |
| 宣言位置のbytes(1) | 受信だけ+1、hash・位置は不変。`content_mismatch`としてafterをskip |
| 不正variant／n | `operation_invalid`、受信量不確実性を保持。hashなし、再読取禁止 |
| read throw／failed | `source_unavailable`。不明量を0とみなさずcleanup。型付きfailedが既知0を保証する範囲は固定adapter契約で明示 |

hash initはpayload前に1回、finalは期待長・EOF・after観測・hash済長一致の後に1回だけ実行する。空fileもinit／EOF probe／after／finalを通し、updateは0回。init／update／finalの故障は`hash_unavailable`として停止し、backendの例外本文やscratch内容を診断へ出さない。

既存合成上限（32 file、期待総量8,388,608、受信8,388,609、read65,536、retry32）は据え置く。hashはinit／final各最大32、update最大65,536試行で、完了数は試行数以下。予約は同時最大1。

update試行の前には必ず課金済みpayload readが1回あり、EOF probe・interrupted・eof／failed等のreadもread枠を消費するため、update試行数 ≤ payload read数 ≤ read試行数 ≤ 65,536 となる。update枠が尽きるのはread枠も同時に尽きた場合（全readがpayload）に限られ、次のreadは先行するread枠検査で拒否される。したがって固定上限ではupdate枠不足の拒否は通常入口から到達しない。dispatch前の検査順はread枠・retry枠・受信余裕・update予約・位置加算の順に固定し、いずれも理由は`source_limit`、read=0・受信不変とする。update枠拒否は、update上限だけを縮めた専用の合成profileによる内部対照としてのみ検証し、その到達範囲を記録する。固定上限で同じ結果が出たことの証拠にしない。新しいguard／候補処理の回数は固定操作表から再計数する。(A)のguard上限131,330をそのまま流用して十分と主張しない。(B)のguard上界と費目検証が確定するまでは実装受付条件未充足であり、実E／S・work／heap実費はUnknown。

## 4 候補生成と確定前の所有権

期待長・EOF・before／after一致・正常hash済長・digest一致が揃った場合だけ、同scopeのprivate FileHashCandidateを作る。candidateは本文／scratch viewを持たず、同session・scope・canonical file・ordinalと比較済み状態へ結合する。candidate生成はclose前に行い、失敗した場合もclose責務はscopeが保持する。確定用の固定record準備はclose確認後だけに行う（§5）。

状態は`reading → compared_provisional → closing → record_ready → post_checked → accepted`。`record_ready`はclose確認後に固定record準備を終えた段で、close未確認では入らない。record準備失敗は`discarded`、cleanupは`closed_confirmed`のまま、当該fileはincompleteとする。途中故障は`discarded`へ一方向に進み、再生成・再受理しない。digest一致は暫定観測にすぎず、close未確認・期限切れ・取消・時計不明ならacceptedへ進めない。digest不一致は`content_mismatch`を先行理由として保持し、cleanup故障で上書きしない。

resourceはscopeがcloseを1回試す。candidate側へclose責務を複製しない。close後、scratchの再使用はcandidate本文破棄・借用退役の後だけとし、確認不能なら次fileへ進まない。hash状態とscratchの参照は固定discardで退役する。参照破棄は物理的なメモリ消去・native解放確認の証明ではない。

## 5 一度限りの確定点と確定後の停止

close確認後、必要な固定record生成を終えて（`record_ready`）最後の通常post-guardを通す。同owner／scope／file slotが未受理、candidateがliveであることを再検査する。その直後の**固定slotの単一private状態置換**をfile候補の確定点とする。置換先recordにaccepted状態とcandidate消費済み状態を一体化し、別boolと公開値の二重更新を権限根拠にしない。件数は固定slotから整合確認し、途中例外で件数だけ増やさない。

この置換区間にはallocation・copy／freeze・clock・callback・awaitを置かない。post-guard後にそれらが必要になった実装は本契約を満たさず、再設計する。これは単一実行文脈のprivate状態遷移の契約であり、並列共有メモリ・process停止・OOM時の永続atomic性の証明ではない。

| 停止の位置 | 保持／破棄と結果 |
|---|---|
| 当該file確定前 | candidateを破棄、当該fileはincomplete（既観測のcontent_mismatchは保持）。既受信・試行・正常hash済prefix・cleanup診断は残す |
| 一部file確定後、残file未確定 | 確定slotは変更しない。残slotは未開始／incompleteを区別し、sessionは未完了として先行停止理由を保持 |
| 全file hash確定後、集約／最終checkpoint前 | fileのhash_matchを遡及取消しない。取消・期限・時計・上限はstop診断へ残し、sessionは停止として成功扱いしない。集約未実施ならrowを未集約に保つ |
| 全file確定後の終端期限超過／時計不明 | 内容観測の確定と終端の成否を分離。primary内容理由を後着制御理由で上書きせず、session終端は停止／時刻未確認として成功扱いしない |
| 終端record確定後 | 結果不変。再操作は固定closed拒否または既存終端参照を返し、新しい診断・close・hash・受理を追加しない |

最初のprimary理由、制御停止理由、cleanup理由／期限確認を別slotに保持する。確定前hash故障＋取消ならprimary hash_unavailableと取消の両方を残す。全file確定後でも新たなbinding不正は契約違反として保持し、正常完了へ偽装しない。いずれも非実行結果でready=false、authority=none。hash観測が揃ってもmapping／implementation／5 gaps・全体受付を確認済みにしない。

## 6 独立検証の受入条件（実施範囲は§8と検証記録）

期待結果を対象実装のhash／進行関数・係数・summaryから計算しない。既知byte列と独立固定digest、別のイベント遷移oracle、上限の手計数を分けて用いる。hash oracleだけで所有権や順序の正しさを証明しない。

| 対照 | 必須確認 |
|---|---|
| SC01 同bytes／scratch | 複数分割・短読取で同digest。n以後に異なる残存byteがあっても結果不変。同値別scratchの混入は拒否 |
| SC02 位置と失敗prefix | 第k updateでthrowし、受信は当該nまで、正常hash済位置は第k−1 updateまでの累計bytes。部分update可能性はpoisoned、再読取／finalは0 |
| SC03 停止の区間 | read中の取消／期限到達でも返ったpayloadはupdate 1回、その後停止。区間内clock／cancel hookは0回。pre拒否はread=0 |
| SC04 EINTR／EOF | retryのみ増加し二重hashなし。早EOF／余剰byteはcontent_mismatch、余剰byteは受信のみ。空fileはupdate=0 |
| SC05 枠と計数 | 固定上限ではread枠拒否が先行することを確認。更新枠不足のread前拒否は縮小profileの合成内部対照で確認し、検査順と`source_limit`・read=0を固定。解除と課金を区別し、失敗時refundなし。不正n／read throwの既知prefixと不確実性を保持 |
| SC06 候補identity | 別session／scope／canonical file・同値copy・重複candidate・二重受理を拒否。2回目にhashAcceptedFilesを増やさない |
| SC07 確定点の前後 | close前のcandidate生成失敗、close確認後のrecord準備失敗（cleanupは確認済みのまま）、close未確認、最後のpost拒否では未受理。確定後の取消で当該slot不変、未完了session／全file確定後を区別 |
| SC08 診断と退役 | mismatch＋close故障、hash故障＋取消、全file確定後の時計故障で別軸を保持。終端反復で計数／診断／解放数不変、本文非出力 |
| SC09 固定操作上界 | 最大file・1-byte短読取・共有retry境界・各故障prefixで試行／完了／予約とguardを独立計数。cleanup枠が停止で消えない |
| SC10 非目標の負の対照 | (A)旧契約を維持。実file読取・期待値pin・実snapshot採用・S発行・core／runtime接続なし。合成成功を実source証拠へ昇格しない |

privateな混入が通常入口から作れない場合、検査を公開factoryで迂回可能にせず、専用の合成内部対照として到達範囲を明記する。実hash backendの同期消費・非保持、実ReadOpsの部分故障量、実adapterの停止可能性は別検証までUnknown。

## 7 次の実装範囲と未解決事項

次候補は(B)専用合成assemblyで、同scratch書込・固定同期hash境界・二種類の進行計数・同scope候補・固定slot確定を実装すること。既存(A)を上書きせず、操作表とguard上界を先に確定してSC01〜10を検証する。実MapSupplySnapshot借用・行hash集約へのprivate接続は(C)に残す。

実hash実装の保証、実source期待値、実metadataとpath同一性、runtime費用・実E／S導出は未解決。§1〜7だけでは承認・完了記録にならない。

## 8 (B)固定操作表・合成実装と残差

`tests/review/fixtures/read-hash-fake.ts`は、既存(A)をimport／変更しない独立assemblyである。入力は引数なし（normal）か固定scenario文字列1個だけで、`undefined`や追加引数は`binding`で拒否する。公開facadeはstep／run／inspect／finish／cancel／advanceToのみ。file・buffer・reader・clock callback・candidate・snapshotの登録／採用口を作らない。合成abc・空列・helloの期待digestは静的な既知ベクトルで、actualから生成しない。digest不一致の対照はpayloadを1 byte変えた`abd`を固定abc digestと実比較して作り、scenario名で比較結果を上書きしない。全file確定後のstepは、後着の取消・期限・時計停止がstopReasonに残っていても`binding`として記録する。

| 固定phase | session最大操作数 | guard／費目 |
|---|---|---|
| open | F≤32 | 通常pre／post各1、open1・cleanup予約1。取得なしは未使用予約返却 |
| before | F | 通常pre／post各1、observe1 |
| init | F | 通常pre／post各1、init試行1 |
| read（payload／EOF／EINTR／throw） | R≤65,536 | 通常pre／post各1。readとupdate間0。payload予定時にupdate1枠を一時予約 |
| after | F | 通常pre／post各1、observe1。早EOF／余剰byteでは未実施 |
| final | F | 通常pre／post各1、final試行1、正常比較でprivate candidate1 |
| close | F | cleanup pre／post各1、予約済みclose1。停止／時計異常でも呼出しを省略しない |
| accept | F | 通常pre／post各1。record準備・origin検査はpost前、単一slot置換はpost後 |
| 最初の拒否操作 | 最大1 | 未実行read上限拒否などで最大2 guard。sticky停止後は追加操作なし |
| finish | 最大1 | 通常1＋cleanup終端1。途中resourceのcloseは上のF枠に含む |

したがって`G ≤ 2(R + 7F) + 2 + 2 = 131,524`。失敗postも当該操作の2枠に含み、preで停止した場合の未使用postを追加枠へ数えない。readとhash updateの間のguardは0。scheduler上限は`R+7F+1` stepで、最初の拒否用stepを含む。guard予算自体を消費し切った場合は追加時計採取を行わず停止し、cleanupの時間確認はunknownでもcloseを1回試す。

同じsession内でopen・observe・close・init・finalはphase順序により上限を守り、read／retry／受信／updateはdispatch前に枠を検査する。公開の任意順ReadOps操作はなく、再入可能な外部hookもない。update予約は同時最大1で、最大値は予約直後の現在予約数から実測する（定数代入で示さない）。`予約累計 = update試行 + 未使用解除 + 現在予約`、cleanupは`予約累計 = close試行 + 未使用返却`を合成oracleで検査する。init／final成功の計数は今回別slot化せず、init試行・final試行とhashStateで失敗を区別する。

固定Node SHA-256境界はprivate scratchのsubarrayを同期updateする。Nodeのhash実装を別実装のhashで再検証したものではなく、独立固定ベクトル・分割差・残存tail対照が今回の保証範囲。hash内部の非保持・nativeコスト・OOM／process停止・実時間内の完了保証はUnknown。実sourceのhash採取は行わない。

fixtureの静的合成source配列はmock読取元で、受信chunk履歴ではない。この配列やNode hashの内部heapをscratch上限65,536 byteへ含めて実測したものではなく、session全heapの上界はUnknown。終端のretained判定はscope／candidate／issued／record参照の退役であり、固定fixture配列のGCや物理消去を意味しない。

同scopeに保持するresource tokenと合成byte列はowner内部に閉じる。metadata取得は固定fake観測であり実OS保証ではない。candidateの発行元参照を別private slotで保持し、copy・別owner／scope／fileを拒否する。slot置換後の候補／発行元／record退役は外部hookなしの固定同期処理で、再受理は失敗する。readCompletedFilesはafter観測一致の時点で加算する。全file確定後の取消・期限・時計異常はfirstReasonを変えずstopReason／terminalDispositionへ記録し、確定済みhash_matchを維持する。部分完了時はincomplete／先行理由を保持する。

SC01の別scratch混入は公開factoryがbuffer／supplierをhook非実行で拒否する負の対照であり、任意readerの悪意を監視した試験ではない。SC06のorigin混入は固定内部scenario専用。update_capは§3の縮小profile専用で、固定profileでの到達を主張しない。SC09の65,536回短読取・32file・retry32と縮小cap対照に加え、最大期待総byte数の(B)成功走査を§9で補完した（(A)の容量試験を(B)hashの保証へ流用しない）。rowsは全12件not_aggregated、5 gapsとruntime／native／E／Sはunknownを固定する。

後続(C)の同MapSupplySnapshotへの借用・辞書全fileのhash／行集約、実source読取・実期待値pinは引き続き未実装。合成成功を供給済みSや実装coverageへ昇格しない。

## 9 最大8MiB成功走査・上限境界の合成補完

新しい固定scenarioだけを追加し、profile・guard上界・操作順は変更しない。`capacity_8m_8`は8file×1,048,576 byte、`capacity_8m_32`は32file×262,144 byte。各fileはbyte 0x61の反復で、同サイズの固定source配列をfile間で共有しても、canonical file要素・scope・候補・slotは別物である。ownerの同scratchへ写したbytesを従来と同じNode hash境界へ通し、digest一致だけで受理する。既存の96byte対照を8MiBの証拠へ読み替えない。

合成期待digestは1MiBが`9bc1b2a288b26af7257a36277ae3816a7d4f16e89c1e7e77d0a5c48bad62b360`、256KiBが`dd3dde87623d9a6b354c68c943d189c89c63652d945e7bbdf0986cae91a49521`。実sourceの期待値ではない。別moduleのboundedな純粋SHA-256 oracle（Node crypto／本体をimportしない）で再構成し、空列・単一a・100万aの既知vectorとの一致も確認する。本体はoracleをimportせず、実行時にactual digestから期待値を作らない。

| 合成shape | 受信／正常hash済bytes | read／update | open／observe／init／final／close／受理 | guard |
|---|---|---|---|---|
| 8×1MiB | 8,388,608／8,388,608 | 136／128 | 8／16／8／8／8／8 | 386 |
| 32×256KiB | 8,388,608／8,388,608 | 160／128 | 32／64／32／32／32／32 | 770 |
| 8fileの最終EOF位置に余剰1byte | 8,388,609／8,388,608 | 136／128 | 8／15／8／7／8／7 | 380 |
| 32fileの最終EOF位置に余剰1byte | 8,388,609／8,388,608 | 160／128 | 32／63／32／31／32／31 | 764 |

余剰byteは受信上限ちょうどまで課金してcontent_mismatchで停止し、hashには追加せず、当該fileのafter／final／候補受理を行わない。既に確定した前fileのhash_matchと、全resourceのclose確認を保持する。最初の余剰で停止するため、受信上限を実際に2byte超過させる経路の試験ではない。受信capの変更や上限超過を許可しない。

宣言総量8MiB+1（8×1MiB＋1byte）、1file=1MiB+1、33fileは、constructorでsource_limitを保持しopen／read／hash／cleanup予約0で拒否する。期待総量と1file・file数の等値／1超過を別々の固定shapeで確認する。計数oracleは本体のLIMIT／係数／counterをimportせず、別記述の操作イベントとBigInt積で照合する。

今回確かめたのは65,536byte chunkの固定分割だけで、全短読取分割の成功や実期限内の処理時間を保証しない。全heap／native費・GC／同期hashの非保持性もUnknown。metadataは合成のまま、snapshotConnection／rowAggregationはnot_connected、全rowはnot_aggregated。S発行・core／runtime接続・実期待値pin・実source照合・実通信・設定変更・Pushは行わない。
