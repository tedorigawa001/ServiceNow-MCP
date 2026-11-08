# WF-B：scratch受理区間・進行位置・候補確定点の差分設計

Version: draft-0.1 / Date: 2026-11-08 / 読み取り照合基準HEAD: `692b280`。

Status: **設計のみ。(A)の長さだけを扱う独立fakeから、(B)の同scratch・同bytes hashと候補受理へ進むための契約。実装済み証拠ではない。** 親は[private読取・hash設計](BEST_PRACTICE_WFB_PRIVATE_READ_HASH_DESIGN.md)と[固定辞書供給設計](BEST_PRACTICE_WFB_FIXED_DICTIONARY_SUPPLY_DESIGN.md)。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。今回はMDのみ。実装・hash接続・実期待値pin・実source照合・S発行・core接続・実接続・実通信・設定変更・Pushは行わない。以下の内部名は提案であり、本番cap・実backend・実snapshotへの接続を承認しない。

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
| `readCompletedFiles`／`hashAcceptedFiles` | 前者は(A)相当の読取完了観測、後者は§5の確定済みslot数。内部で区別し、前者から後者を導出しない |

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

既存合成上限（32 file、期待総量8,388,608、受信8,388,609、read65,536、retry32）は据え置く。hashはinit／final各最大32、update最大65,536試行で、完了数は試行数以下。予約は同時最大1。新しいguard／候補処理の回数は固定操作表から再計数する。(A)のguard上限131,330をそのまま流用して十分と主張しない。(B)のguard上界と費目検証が確定するまでは実装受付条件未充足であり、実E／S・work／heap実費はUnknown。

## 4 候補生成と確定前の所有権

期待長・EOF・before／after一致・正常hash済長・digest一致が揃った場合だけ、同scopeのprivate FileHashCandidateを作る。candidateは本文／scratch viewを持たず、同session・scope・canonical file・ordinalと比較済み状態へ結合する。candidate生成や固定record準備が失敗した場合も、close責務はscopeが保持する。

状態は`reading → compared_provisional → closing → post_checked → accepted`。途中故障は`discarded`へ一方向に進み、再生成・再受理しない。digest一致は暫定観測にすぎず、close未確認・期限切れ・取消・時計不明ならacceptedへ進めない。digest不一致は`content_mismatch`を先行理由として保持し、cleanup故障で上書きしない。

resourceはscopeがcloseを1回試す。candidate側へclose責務を複製しない。close後、scratchの再使用はcandidate本文破棄・借用退役の後だけとし、確認不能なら次fileへ進まない。hash状態とscratchの参照は固定discardで退役する。参照破棄は物理的なメモリ消去・native解放確認の証明ではない。

## 5 一度限りの確定点と確定後の停止

close確認後、必要な固定record生成を終えて最後の通常post-guardを通す。同owner／scope／file slotが未受理、candidateがliveであることを再検査する。その直後の**固定slotの単一private状態置換**をfile候補の確定点とする。置換先recordにaccepted状態とcandidate消費済み状態を一体化し、別boolと公開値の二重更新を権限根拠にしない。件数は固定slotから整合確認し、途中例外で件数だけ増やさない。

この置換区間にはallocation・copy／freeze・clock・callback・awaitを置かない。post-guard後にそれらが必要になった実装は本契約を満たさず、再設計する。これは単一実行文脈のprivate状態遷移の契約であり、並列共有メモリ・process停止・OOM時の永続atomic性の証明ではない。

| 停止の位置 | 保持／破棄と結果 |
|---|---|
| 当該file確定前 | candidateを破棄、当該fileはincomplete（既観測のcontent_mismatchは保持）。既受信・試行・正常hash済prefix・cleanup診断は残す |
| 一部file確定後、残file未確定 | 確定slotは変更しない。残slotは未開始／incompleteを区別し、sessionは未完了として先行停止理由を保持 |
| 全file hash確定後、集約／最終checkpoint前 | fileのhash_matchを遡及取消しない。取消・期限・時計・上限はstop診断へ残す。集約未実施ならrowを未集約に保つ |
| 全file確定後の終端期限超過／時計不明 | 内容観測の確定と終端の成否を分離。primary内容理由を後着制御理由で上書きせず、session終端は停止／時刻未確認として成功扱いしない |
| 終端record確定後 | 結果不変。再操作は固定closed拒否または既存終端参照を返し、新しい診断・close・hash・受理を追加しない |

最初のprimary理由、制御停止理由、cleanup理由／期限確認を別slotに保持する。確定前hash故障＋取消ならprimary hash_unavailableと取消の両方を残す。全file確定後でも新たなbinding不正は契約違反として保持し、正常完了へ偽装しない。いずれも非実行結果でready=false、authority=none。hash観測が揃ってもmapping／implementation／5 gaps・全体受付を確認済みにしない。

## 6 独立検証の受入条件（未実施）

期待結果を対象実装のhash／進行関数・係数・summaryから計算しない。既知byte列と独立固定digest、別のイベント遷移oracle、上限の手計数を分けて用いる。hash oracleだけで所有権や順序の正しさを証明しない。

| 対照 | 必須確認 |
|---|---|
| SC01 同bytes／scratch | 複数分割・短読取で同digest。n以後に異なる残存byteがあっても結果不変。同値別scratchの混入は拒否 |
| SC02 位置と失敗prefix | 第k updateでthrowし、受信は当該nまで、正常hash済位置はk−1まで。部分update可能性はpoisoned、再読取／finalは0 |
| SC03 停止の区間 | read中の取消／期限到達でも返ったpayloadはupdate 1回、その後停止。区間内clock／cancel hookは0回。pre拒否はread=0 |
| SC04 EINTR／EOF | retryのみ増加し二重hashなし。早EOF／余剰byteはcontent_mismatch、余剰byteは受信のみ。空fileはupdate=0 |
| SC05 枠と計数 | 更新枠不足をread前に拒否。解除と課金を区別し、失敗時refundなし。不正n／read throwの既知prefixと不確実性を保持 |
| SC06 候補identity | 別session／scope／canonical file・同値copy・重複candidate・二重受理を拒否。2回目にhashAcceptedFilesを増やさない |
| SC07 確定点の前後 | record準備失敗、close未確認、最後のpost拒否では未受理。確定後の取消で当該slot不変、未完了session／全file確定後を区別 |
| SC08 診断と退役 | mismatch＋close故障、hash故障＋取消、全file確定後の時計故障で別軸を保持。終端反復で計数／診断／解放数不変、本文非出力 |
| SC09 固定操作上界 | 最大file・1-byte短読取・共有retry境界・各故障prefixで試行／完了／予約とguardを独立計数。cleanup枠が停止で消えない |
| SC10 非目標の負の対照 | (A)旧契約を維持。実file読取・期待値pin・実snapshot採用・S発行・core／runtime接続なし。合成成功を実source証拠へ昇格しない |

privateな混入が通常入口から作れない場合、検査を公開factoryで迂回可能にせず、専用の合成内部対照として到達範囲を明記する。実hash backendの同期消費・非保持、実ReadOpsの部分故障量、実adapterの停止可能性は別検証までUnknown。

## 7 次の実装範囲と未解決事項

次候補は(B)専用合成assemblyで、同scratch書込・固定同期hash境界・二種類の進行計数・同scope候補・固定slot確定を実装すること。既存(A)を上書きせず、操作表とguard上界を先に確定してSC01〜10を検証する。実MapSupplySnapshot借用・行hash集約へのprivate接続は(C)に残す。

実hash実装の選定／保証、実source期待値、実metadataとpath同一性、runtime費用・実E／S導出は未解決。今回の文書はそれらの承認・完了記録ではなく、独立合成試験も未実施である。
