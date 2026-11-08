# WF-B：private読取継続・共有上限・同bytes hashと結果owner

詳細設計追記（2026-11-08）: [共通読取kernelへのprivate供給境界](BEST_PRACTICE_WFB_PRIVATE_KERNEL_SUPPLY_DESIGN.md)へ、(B)のFileとstrict辞書の構造差、canonical参照を維持した期待値／actual bytesの分離、共通化範囲・所有権・停止と独立検証条件を整理した。設計のみで実装・接続・実source照合は行っていない。

準備実装追記（2026-11-08）: [同snapshot開始準備の新合成root](BEST_PRACTICE_WFB_SNAPSHOT_READ_LIFECYCLE_DESIGN.md)で、先行診断owner・private borrow・identity・一度限り開始claimを実装した。[検証記録](E2E_BEST_PRACTICE_WFB_SNAPSHOT_READ_START_2026-11-08.md)。旧Supply／(B)kernelへの接続、実budget・読取／hash・行集約は進めていない。

差分設計追記（2026-11-08）: [同snapshot読取接続の所有・停止契約](BEST_PRACTICE_WFB_SNAPSHOT_READ_LIFECYCLE_DESIGN.md)へ、同一性tuple・重複開始拒否、読取中closeの同期停止とcleanup後の借用退役、上位診断保持・追加費目を整理した。設計のみで、同snapshot接続・行集約・実source照合は未実装のまま。

容量補完（2026-11-08）: [(B)の8file×1MiB・32file×256KiBと上限境界](BEST_PRACTICE_WFB_SCRATCH_CANDIDATE_DESIGN.md)を、独立hash／計数oracleで確認する合成試験を追加した。[検証記録](E2E_BEST_PRACTICE_WFB_READ_HASH_CAPACITY_2026-11-08.md)。固定cap・guard上界は変更せず、同snapshot接続・行集約・実sourceは未対応のまま。

実装追記（2026-11-08）: [(B)の固定操作表・guard上界と合成実装](BEST_PRACTICE_WFB_SCRATCH_CANDIDATE_DESIGN.md)を追加した。独立assemblyで同scratchの受信／hash計数、poisoned時停止、同scope候補のcleanup／post後一度限り受理を検証する。上界は`2(R+7F)+4=131,524`。既存(A)・同snapshot供給・行集約・実sourceは変更しない。[検証記録](E2E_BEST_PRACTICE_WFB_READ_HASH_B_2026-11-08.md)。

差分設計追記（2026-11-08）: [scratch受理区間・進行位置・候補確定点](BEST_PRACTICE_WFB_SCRATCH_CANDIDATE_DESIGN.md)で、受信量と正常hash済prefixの分離、同attemptのupdate予約、close／post後の単一slot確定と確定後の停止診断を具体化した。(A)の`acceptedFiles`をhash確認済みと読み替えず、(B)のguard上界は再計数を要する。設計のみで、hash接続・実source照合は未実施。

Version: draft-0.5 / Date: 2026-11-08 / 読み取り照合基準HEAD: `77255f2` / レビュー修正の基準HEAD: `72e4745`・`e235ec9` / (A)実装基準HEAD: `dfc79ff` / (B)実装基準HEAD: `6fd83d4`。

draft-0.3のレビュー修正: (A)のfakeで、完走してclose確認したfileと途中で放棄したfileが同じ`incomplete`／理由なしになっていた。完走fileは`pending`のまま残して`acceptedFiles`へ数え、after観測前のcloseは`incomplete`をprimary理由にした。全file受理後の期限・取消・時計・上限の停止は`stopReason`だけに残す（§11.1／§11.2）。after読取のsize／identity／kind差とbefore読取のidentity／kind差の固定scenarioを追加した。

draft-0.3: §11の(A)共有上限・停止・単発ReadOps・結果slotを純粋fakeで実装した。bytes／scratch／hash・同snapshot借用・行hash集約は接続しない。[検証記録](E2E_BEST_PRACTICE_WFB_READ_OPS_A_2026-11-08.md)。

draft-0.1のレビュー修正: 行のhash集約へbindingのtests（T／O file）を含め、辞書全体hash軸の状態を定義した（§6）。受理区間内のguard呼出しをなくし、guardを受理区間の前後へ移した（§4／§5）。早いEOF・余剰byteをcontent_mismatchに固定し、読取中変更とは区別しないことを明記した（§3）。cleanup軸のopen未試行とresource未取得を分けた（§6）。RH03／RH04／RH06の対照を追加した。設計のみで、実装・実source照合は変えていない。

Status: **(A)の独立純粋fakeと(B)の独立合成bytes／hash assemblyを実装。同snapshotへの読取接続・実source照合・行集約は未実装。** 親は[固定辞書供給・同map結合](BEST_PRACTICE_WFB_FIXED_DICTIONARY_SUPPLY_DESIGN.md)と[固定source対応・内容照合](BEST_PRACTICE_WFB_FIXED_SOURCE_COVERAGE_DESIGN.md)。供給元のcheckはprivate結合の非実行確認だけで、今回のfakeへ接続していない。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。draft-0.1／0.2はMDだけ、draft-0.3／0.4の実装は§11の純粋fake、draft-0.5は独立(B)の合成hash接続に限定する。同snapshot読取接続・実期待値pin・実sourceのhash採取／照合・S発行・core接続・実接続・実通信・設定変更・Pushは行わない。以下の数値は合成検証用profileで、本番capや時間枠の承認ではない。

## 1 現行からの差分と非目標

現行のMapSupplySnapshot／Supplyはexportせず、facadeはcheck／close／inspectのみ。新しい読取継続も同じ固定constructionの内部で組み立て、publicなmap getter・任意path読取・任意reader登録・summaryからの採用口は作らない。既存pure SourceMapDraftのcopy／freezeと20 carrier値、K0/E fake・旧bridge費目モデルを変更しない。

最初の実装候補は、合成辞書と固定fake ReadOps／clock／cancel・合成bytesだけを使う独立assemblyである。既存syntheticセットの模擬hashは既知ベクトルの正しいdigestとは限らないので、そのままhash成功のfixtureにしない。既知bytesと独立に固定した期待digestを持つ別の合成hash用セットを設計する。実source期待値の代わりにはしない。

実rootからの安全なopen、symlink／祖先path再照合、OS metadata取得、native APIの中断可能性、実source適用、改行設定は後続の別範囲。fakeのkind／identity観測を実OS保証として扱わない。symbol・処理順・費目所有の意味検査もhashとは別で、実E／S要求量と5 gapsはUnknownのままとする。

## 2 同snapshot・同sessionへのprivate結合

| 内部対象（提案） | 保持内容・生成位置 | 寿命と権限 |
|---|---|---|
| ReadSessionOwner | 同Supply内で先行確保する結果slot・共有予算・固定ops・clock／cancel、同snapshotと検査済みvalue／files／rows | 開始前から結果終端までの停止・診断owner。Sやruntime権限は持たない |
| SnapshotReadBorrow | 同snapshotのprivate継続が渡す同value／files／rowsとreviewSetIdへの借用 | 外へ返さず、session終了で失効。同値copy・別snapshot・混入版を拒否 |
| FileReadScope | 同session、辞書のcanonical file要素、固定順ordinal、同resourceとbefore観測、scratch／hash状態 | 同時に1つ。read／metadata／closeを同resourceへ固定する |
| FileHashCandidate | byte長・EOF・digest比較後の暫定結果、同scope／session／snapshotへの参照 | cleanupとpost-guard前は未受理。別file・別scopeへ移せない |
| ReadResultOwner | 固定file slotとrow集約slot、先行理由、停止／cleanup診断、観測会計 | 終端後は不変の非実行診断だけ。本文・resource・snapshotを公開しない |

bindingは同snapshot／同value／同files／同rows、同session、辞書の同canonical要素とordinal、同resourceを組で検査する。file ID・path・expected hash・金額・reviewSetIdの一致だけでは参照混入を許さない。既存検査前の元DATAはcanonicalとして渡さない。

readonly checkの反復許可を、複数読取sessionの同時実行許可にしない。同ownerでは1つだけのactive sessionを許し、再入・重複開始を新規open前に拒否する。失敗sessionを再開・budget再生成して続けない。再検証を許す将来仕様では、新しい明示sessionと独立結果に分け、旧sessionの結果へ混ぜない。自動再試行の開始口は今回設けない。これはreadonly DATAのone-shot claimやcredit台帳を新設する提案ではない。

読取中のSupply.close／失効は同期的に「新規操作禁止」を立てる。現在の借用中resource・結果ownerを即座に消さず、固定unwindへ進み、cleanup／結果確定の後にsnapshot借用を退役する。既存の即時closeをそのまま読取中へ流用しない。再入closeは要求を重複記録せず、終端後closeも二重解放しない。

## 3 固定ReadOpsと操作順

将来の単発境界はopenOnce、observeOnce、readOnce、closeOnce。1呼出し1試行で、adapter内の非表示retry・全file一括読取・任意callback・path探索を禁止する。readerは同resourceへの位置指定readだけを行う。sessionは辞書ID順に処理し、前fileのclose確認前に次fileをopenしない。

各fileの順序は「binding／停止guard → cleanup枠予約 → open → before観測 → 位置指定read反復 → 宣言長位置のEOF probe → after観測 → digest比較candidate → close → post-guard → 同結果slot受理」。全file後に固定row集約と最終checkpointを行い、借用を退役してから終端する。

before／after観測は、regular-kind、同resource identity、size、変更stampを比較する固定fake契約とする。期待sizeとの差はcontent_mismatch、同resourceのidentity／kind／stamp／sizeの途中差はsource_changed。取得不能はsource_unavailable。実adapterの具体stat field・精度・path同一性の保証は未確定で、OS metadata照合済みとは呼ばない。読取中に変わって元へ戻る変更や、全fileが同一時刻のsnapshotであることまでは保証しない。

分類の優先順位は固定する。before観測のsizeが期待値と異なればreadを始めずcontent_mismatch。readの途中で期待長より前のEOF、または宣言位置の余剰byteが出た場合も、before sizeが期待値と一致していたかに関係なくcontent_mismatchを最初のprimary理由とし、after観測を行わずcloseへ進む。この場合は読取中の切詰め・伸長とsource本来の差を区別せず、source_changedとは報告しない。source_changedは、期待長とEOFが一致した後のafter観測でbeforeとの差が見つかった場合だけに使う。

readOnceは現在offsetと要求長、ownerの固定scratchを使い、bytes(n)、eof、interrupted、failedの有限結果を返す。bytesは1≤n≤要求長だけ。eof前の0進捗や過大n・未知variantはoperation_invalidで停止する。不正なnから実受信量を確定できなければunavailableを残し、0や申告nで補完しない。呼出し試行1回という観測は保持する。正の短読取はoffsetをnだけ進め、残量から次要求を作る。期待長より前のEOFはcontent_mismatch。期待長へ達した後はoffset=expectedBytes、要求1 byteのEOF probeを1つ行う（interrupted時は同probeを共有retry枠で再試行）。追加byteが返れば、それも受信費へ計上してcontent_mismatchとし、hashへ追加しない。

openの単発結果はresource取得の有無を明示する。取得後の異常では同resourceをownerへ渡して固定cleanupへ進め、単なるthrowから「未取得」と推定しない。初期fakeは取得なしと取得済みの有限結果を使う。取得有無すら不明な実adapter故障は未対応で、解放済み・resourceなしとは報告できない。後続の実adapter契約で取得未確認の責務を設計するまで採用しない。

interruptedはbytesもoffsetも進めない。共有retry枠を消費し、同resource／offset／要求長の同操作だけを再試行できる。別fileへretry枠を移譲・再生成しない。retry前も停止guardを通る。open／observeの再試行は初版では行わず、失敗を固定分類へ落とす。closeの自動retryも行わない。

## 4 共有上限と時間枠（合成候補）

全file／全rowは1つのsession予算を共有する。各fileへ進むたびにcapをresetしない。以下を固定profileとして合成検証し、public cap引数や既存19項目planへの追加はしない。

| 費目 | 合成候補上限・受付点 |
|---|---|
| 辞書／file bytes | 32 file、各expectedBytes≤1,048,576、期待総和≤8,388,608。借用受理時に事前検査 |
| 受信bytes | session全体8,388,609以下。最初の余剰EOF byteで停止するため、成功payload上限＋1 byte。hash対象量とは別計数 |
| scratch | 65,536 byteを1つ、body全体やchunk履歴を保持しない。要求長はmin(残量, scratch長)、EOF probeは1 |
| read試行 | EOF probe・interrupted・同期throwを含め、全file共有65,536回。呼出し直前に枠を消費 |
| retry | readのinterruptedに対し全session共有32回。上限に達したら次のretryを開始しない |
| open／observe | open最大32試行、before／after観測最大64試行。失敗も1試行を消費 |
| hash操作 | fileごとinit／final各1回、updateは受理したpayload readにつき1回で最大65,536回。対象bytesは期待総和以下 |
| 同時resource／cleanup | open resource最大1。各open前にclose1試行を予約、合計最大32。未使用予約は実試行に数えない |
| 結果／row slot | file最大32、rowちょうど12。固定上限を超えるlistや自由文は保持しない |

極端に細かい短読取では、正当なbyte長でもread試行枠で停止し得る。全分割パターンの受付を保証する上限ではなく、無制限loopを防ぐ契約である。buffer要求を受ける前にサイズを確認し、成功readで返ったnを受信計数へ加算し、同じ受理区間でhash updateまで進めてから後続guardを行う（§5）。失敗しても消費済み試行・受信量をrefundしない。pre-guardで拒否した未実行操作は試行0、呼出しに入った同期throwは試行1とする。

合成clockは整数tickで、session開始T0からD_end=T0+1000、D_stop=D_end−100を一度だけ計算する候補とする。900 tickは通常処理、末尾100 tickはcleanup／結果終端用で、実msや製品の既存期限へ換算・反映しない。全fileで同じ期限を使い、残時間から作り直さない。加算overflow・clock例外・逆行はclock_unavailableとして停止する。

通常操作の前後、hash final直前、candidate受理、row集約、最終checkpointでguardする。readOnceとhash updateの間（受理区間）ではclock／cancelを呼ばない。readOnce直前のguardを通過した後に来たcancel／close要求・期限到達は、受理区間のhash update完了後のguardで観測し、それ以降の新しいread／hash final／open／observeを禁止する。cancel／close要求・now≥D_stopで新しいopen／read／observe／hash final／次のhash updateを禁止する。時刻採取自体も有限の操作表へ含め、guard箇所と回数上界を実装時に独立計数する。今回のprofileはworkモデルではなく、反射・native hash・copy／freeze・CPU／heap／GCの実費上界はUnknown。

cleanupは予約済みcloseを1回だけ試す。cancel・D_stop超過・clock異常で既存resourceの解放をskipしない。cleanupは新規payload操作を始められず、D_endを延長しない。終了がD_end以降・時計未確認ならcleanup確認とは別に終端期限／時計診断を残す。nativeが無期限に戻らない問題をclock guardだけで解決したとは扱わない。実adapterの非blocking性・外側containmentは未検証であり、実時間内の必着保証はしない。

## 5 同bytesの計数・hash・期待値比較

同resourceが書き込んだprivate scratchの[0,n)を、1回の受理区間で受信計数とSHA-256 updateに使う。pathを開き直した別read、decodeした文字列、再encode、summary、別bufferの同値DATAでhashを代用しない。payload offset／hash済bytesを別に記録し、update成功後だけ進める。hash失敗やpost-guard拒否でcandidateを出さず、既受信／既課金の観測は保持する。

固定adapterはscratch参照を保持せず、受理からhash update完了まで外部callback・await・別操作・buffer再利用を挟まない。注入clock／cancelの呼出しもこの区間へ入れず、停止判定はreadOnce直前とhash update完了後のguardで行う（§4）。hash境界は同期的に当該bytesを消費して参照を残さない契約とし、init／update／final失敗を固定hash_unavailableにする。この性質を実backendが満たすかは別途検証する。SharedArrayBuffer・resizable buffer・外部保持viewを受け付ける一般的な注入口は設けない。

期待byte長とEOF、before／after観測、hash済byte数が一致した場合だけfinalを1回行い、同canonical fileのexpectedSha256と固定64桁として比較する。期待値をactualへ合わせて更新しない。copy前後の同bytes保証をmetadataの一致だけで代用せず、受理したscratchを直接hashする。異なるfile IDへのdigest流用・path一致による採用・複数file digestの連結は禁止。

同bytesのhash一致が示すのは観測したbyte列の一致だけで、悪意のあるsourceの安全性・署名・全fileの時間的atomic性・symbol意味・費目所有は示さない。実sourceの内容hash照合はこの設計段階では行わない。

## 6 結果owner・受理・集約

結果ownerは最初のopen前に固定slotと診断領域を準備する。生成途中に失敗した場合は読取を始めず、先行する供給側診断ownerへ固定拒否を渡して部分参照を退役する。結果ownerを作れない故障で無限に代替ownerを生成しない。native確保不能時に必ず返せるという保証は未確認。

file候補は同snapshot／session／scope／canonical fileへ結合し、close確認とpost-guardの後で対応する固定slotへ受理する。二重slot書込み・別scope結果・同値copyを拒否する。close前にdigestが一致しても未受理候補で、cleanup未確認やpost-guard失敗でhash_matchへ昇格しない。途中の内容比較が一致した事実は、固定の観測診断として区別して保持できる。

fileのhash軸はpending／hash_match／content_mismatch／incomplete／not_startedを区別する。cleanup軸はnot_attempted（openを試行していない）／no_resource（open試行の結果resource未取得）／closed_confirmed／close_unconfirmed。最初のprimary理由、後着の停止／時計理由、cleanup理由は別slotとし、content_mismatchをcleanup異常で上書きしない。resource取得なしのclose0回、取得済みのclose1回を確認する。close_unconfirmedなら次fileへ進まない。

行のhash集約の対象は、全binding（reference_onlyを含む）のfileIdと、各bindingのtests（T／O file）の和集合のfile slotとする。implementation bindingはtestsを必須とするため、試験・oracle fileだけの差替えや欠落を行のhash_matchから漏らさない。同じfileを複数行が参照しても再読・二重hashしない。全対象がhash_matchの行だけhash_match、空bindingはnot_applicable、未開始／中断／不一致がある行はそれぞれ非成功とする。

辞書全体hash軸は、行からの参照の有無に関係なく辞書の全file slotを対象とする。全slotがhash_matchの場合だけhash_match、それ以外は非成功とし、file状態ごとの件数と、辞書ID順で最初の非成功fileのIDを固定値で保持する。行から参照されないfileも、この軸から黙って省かない。

hash／mapping／implementation／cleanupとsessionの停止状態を別々に保持する。未実装行が残っていても、他のfile／行のhash_matchという局所観測は保持するが、全体readyにはしない。mappingはshape_only（実symbol／step未検証）、implementationは未実装／missingの状態をそのまま保持し、5 gaps・実E／S要求量Unknownを緩めない。

最終checkpoint後に借用・scratch・hash状態・resource aliasを固定順で退役し、結果を一度だけ終端する。遅着応答／再入／二重finishでslotや先行理由を変更しない。公開できるのは固定file／row ID、有限状態、計数、固定理由だけで、source本文・path全文・raw例外・snapshot／resource参照は出さない。非公開結果からのsummaryを、新sessionや検証済み証拠へ再採用する入口は作らない。

## 7 失敗時停止と責務

| 失敗 | 通常処理 | 保持・cleanup |
|---|---|---|
| binding／開始受付不成立 | open前に拒否。別snapshotへfallbackしない | 先行ownerが拒否保持。resourceなし |
| open／before取得失敗 | 以後の通常操作を停止 | resource取得の有無を保持し、取得済みだけclose予約を使う |
| 早いEOF／余剰byte／digest差 | content_mismatch、後続fileを開始しない | 受信／試行の観測保持。同resourceをclose |
| 中途metadata差 | source_changed | hash候補破棄、先行観測保持、close |
| read／hashの取得不能 | source_unavailable／hash_unavailable | 失敗位置と未完了量を保持し、0で補完しない |
| 操作／byte／retry枠不足 | source_limit、未開始操作を呼ばない | 消費済み量を保持、予約済みcleanupのみ |
| cancel／close要求／期限／clock異常 | 後続通常操作を禁止。再開・deadline再生成なし | 先行理由を保持しcleanup／終端診断を別記録 |
| close／終端checkpoint異常 | 候補未受理、session非成功 | close_unconfirmed等を残し、次fileへ進まない |

本文・受信量・失敗prefixを消して成功へ丸めない。cleanupの1回試行を確認済み解放と同一視しない。将来の実OS resourceで解放未確認が生じた場合の外側保持／隔離は別設計を要し、既存のJS参照だけの退役規則を実FDへ転用しない。

## 8 独立合成受入条件（未実施）

| ID | 独立対照 | 必須判定 |
|---|---|---|
| RH01 | 同snapshotと第2合成set／map wrapper／file要素copy／別session・scope | open前または結果受理前に拒否。公開経路から到達するという主張にはしない |
| RH02 | 既知bytesと別途固定したdigest／byte長、複数chunk分割 | chunk分割に依存せず同digest。本体のhash出力からexpectedを同時生成しない |
| RH03 | 1 byte・改行・BOM・末尾差、早いEOF・宣言位置の余剰byte（before sizeが期待値と一致する場合を含む） | 変換せずcontent_mismatch。after観測を呼ばずsource_changedにしない。余剰byteも受信計数に含む |
| RH04 | 主file一致・helperだけ差替え／欠落、test／oracle fileだけ差替え／欠落、行から参照されないfileだけ差替え、同内容でも別file ID | 全bindingのfileIdとtestsを照合・同file slot受理。主fileだけで行を成功にせず、未参照fileの差は辞書全体hash軸を非成功にする |
| RH05 | 独立イベント表とBigInt計算でbyte・試行・retry・hash・cleanupを照合 | 等値／1超過、短読取多数、EINTR連続、同期throwを検出。refund／二重課金なし |
| RH06 | fake clock／cancelを各pre／post点、hash final直前・候補受理・最終点へ配置。readOnce中にcancel／期限到達を起こす | 期限延長・失敗後再開なし。未dispatch0、呼出しthrow1。受理区間内のclock／cancel呼出し0で、停止はhash update完了後のguardで観測する。cleanupは別診断 |
| RH07 | before／afterのkind・identity・size・stamp差、取得不能 | source_changedとsource_unavailableを区別。実OS同一性を証明したとしない |
| RH08 | bind／scratch／hash init・update・final／結果slotの固定故障 | 部分候補を採用せず、先行理由・観測prefix・cleanup責務を保持 |
| RH09 | close失敗・終端時計異常・遅着read・二重finish・読取中close | 1回cleanup、結果終端後の不変、未確認を成功化しない。active借用を早期破棄しない |
| RH10 | 全hash一致だが未実装行あり、空binding、部分file成功後の失敗 | hash局所結果とimplementation非成功を分離。空行はnot_applicable、5 gapsを維持 |
| RH11 | 本体と別記述したfile集合・row依存集合・意味イベントoracle | 未列挙helper／二重所有／省略を検出。静的意味検証未実装ならunverifiedを残す |
| RH12 | import／梱包と副作用の負対照 | 合成試験のみ。実source読取・実pin・runtime登録・S／core／実通信を0のままにする |

試験対象は通常の固定private継続と同じkernelを使い、別のfake実装だけを合格させない。操作数oracleは本体のcounter／係数をimportして期待値を作らない。native primitive内部の故障へ届くか、境界前後だけかを記録する。実hash照合は採用まで既定npm testに加えず、合成bytesだけの試験と分離する。

## 9 段階分割と未確認事項

次の実装候補は、(A) 共有上限・停止・単発ReadOpsと結果slotの内部型を純粋fake、(B) 注入合成bytesから同scratchの計数／hash・候補受理、(C) 同snapshotのprivate継続と行集約・cleanup／最終終端の連続試験、と分ける。各段階に独立oracleを併走させる。実resource adapter・実期待値pin・実source照合・改行設定は別承認後であり、本書では進めない。

本書の数値profileの最終採用、clock／cancel／guardの全回数上界、hash backendの入力消費保証、物理resourceの安全open・path再照合・解放未確認の外側責務、実費・native非停止対策は未確認。合成成功だけで本番対応・coverage complete・実E要求量導出済みとはしない。

## 10 今回の確認範囲

`77255f2`の供給sourceと親設計を読み取り照合し、このMDと親2文書の参照だけを追加した。文書のローカル参照・空白・変更範囲のみ確認する。code／test／CHANGELOG／設定は変更せず、build・合成試験・実source hash採取／照合は行わない。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。

draft-0.2のレビュー修正では、`72e4745`の本書を`source-map-values-core.ts`のbinding／tests検査と親設計のSC表へ照合し、本書のMDだけを変更した。code／test／CHANGELOG／親設計・設定は変更していない。

## 11 (A) 共有上限・停止・単発ReadOps・結果slotの純粋fake

`tests/review/fixtures/read-ops-fake.ts`を追加した。importは0、file／network I/O・buffer確保・hash・source辞書／snapshot・K0/E fake・core・runtimeのいずれにも接続しない。Resource／OpenOutcome／Observation／ReadOutcome／ReadOps／Slotを内部型とし、非公開Sessionが予算・固定FakeOps／FakeClock・結果slotを所有する。class・resource参照はexportしない。

createReadOpsFakeは固定の2 file（模擬長3／2）だけを使い、factory引数を認めない。createFixedReadOpsFakeは有限scenario名だけを受ける。任意profile／resource／ops／callback・外部DATA注入、未知名・余分引数はbindingで拒否する。facadeはopenOnce(ordinal)／observeOnce()／readOnce(offset, requested)／closeOnce()／advanceTo(tick)／cancel()／finish()／inspect()。時計の変更とcancelは合成依存の制御で、実clockや製品設定へ反映しない。

### 11.1 模擬操作と結果

操作順はopened→before→reading→eof→after→close。scopeは同時1つだけで、ordinal順の同Resourceに全操作を固定する。readはnだけの有限結果を返し、実bytesを返さない。正の短読取・同offset／要求長のEINTR retry、期待長位置の1 byte EOF probeをモデル化する。hash update未接続なので、offsetは模擬bytes受理後に進むだけでhash進行位置ではない。(B)でhashを接続する際は、readとhash受理区間へclock／cancelを挟まない構造にする必要がある。

各ReadOpsは1呼出し1試行、同期throwも1回。予算とFakeOpsの呼出しcounterは別に保持し、内部retryはない。payload／EOF不一致をcontent_mismatchとし、after観測を呼ばずcloseする。beforeのsize差も同分類。期待長／EOFが一致した後のafter観測で、beforeとのsize／stamp差、identity差、kind差をsource_changedにする対照を持つ。before観測のidentity／kind差はbindingとする。不正n／read throwで受信量を確定できなければreceivedState=unavailableとし、budget.receivedは既知prefixを残す。

openのno_resourceは明示された未取得だけを指す。failed_ownedではresourceを保持して停止・close1回。openの非型付きthrowは取得未確認とし、acquisitionUncertain=true／close_unconfirmedを残す。handle不明なのでcloseを作り上げず、cleanup予約も未使用返却したとは扱わない。これは実FD漏れを解決する仕組みではなく、実adapter採用前の未対応を可視化する合成対照である。

file slotのhashはnot_started／pending／incomplete／content_mismatchだけで、hash_matchを発行できない。after観測まで完了し、close確認とpost-guardを通ったfileだけをpending（hash待ち）として受理し、acceptedFilesへ数えて次ordinalへ進む。after観測前のcloseやfinishによる回収はincompleteとし、primary理由がなければ`incomplete`を記録する。post-guardで期限等に達したfileも受理しない。cleanupは§6の4状態。全12 row slotはnot_aggregatedのまま。finishはcleanupと最終clock確認後に不変snapshotを1回だけ確定し、二重finish・終端後cancel／clock変更・操作で診断やslotを変えない。slotの部分生成故障では部分配列を破棄し、slotsState=unavailableで操作開始を拒否する。

### 11.2 共有会計・停止

§4のfile／期待総和／受信量／read・retry・open・observe・cleanup上限を全scopeで共有する。受信枠はread要求長の最大値をdispatch前に受付し、成功nだけを受信prefixへ加算する。EOF probeの最大1 byteも受付対象だが、eofなら受信量は増えない。試行・既受信・cleanup予約の累積数はfile切替や失敗でreset／refundしない。

EINTRの初回試行はread1／retry0。再試行の呼出し直前にretry1を課金し、32 retryなら最大33回のinterrupted readを観測できる。pending retry中の別offset／要求長は拒否する。cleanupReservedは予約累積、cleanupUnusedは明示未取得時の返却、closeは実試行、cleanupOutstandingはその差。未確認取得の予約を0にしない。

固定clockのT0=0、D_stop=900／D_end=1000 tickを全fileで使う。単位は合成tickのみ。clock例外・非整数／NaN／overflow値・逆行はstickyなclock_unavailableとし、後から正常値に戻して信頼を回復しない。cancel・期限・clock異常・上限超過後は新規通常操作を禁止するが、取得済みresourceの予約済みcloseは1回試す。全fileを受理した後に来たこれらの停止は、終端時間帯（D_stop〜D_end）やD_end以降のfinishでもprimary理由にせず、stopReasonとcleanupTimingだけに残す。全file受理後でも、binding等の誤操作はprimary理由にする。

clock採取上限は131,330回（2×(open32＋observe64＋read65,536＋close32)＋最終2）。これは(A)の模擬操作表からの有限なclock呼出し枠で、(B)のhashや(C)の行集約guardは含まない。未dispatch拒否のpre-guard等も同枠を消費し、不足すればsource_limitで止める。cleanup時に採取できなければcleanupTiming=unknownとし、clockを追加生成せずcloseだけを試す。native CPU・heap・実時間上界を表す数ではない。

cleanupはpre／postのD_end観測、postの通常停止観測を同じ採取で扱う。close失敗が期限到達より先に起きればsource_unavailableをprimaryとし、後着deadlineとclose_unconfirmedを別slotに残す。閉じた確認と期限内確認も別軸。close・primary停止・時計／取消の診断を上書き合流しない。

### 11.3 対照と未対応

正常profileとは別に、read枠3／chunk2、受信枠4、retry枠1、guard枠3の縮小profileを有限scenario内だけで使い、共有枠のfile越し消費を対照する。容量対照は32 file×262,144=8MiB、read試行対照は1MiB宣言へ1 byte短読取を65,536回。いずれも実fileや本番capの採用ではない。

正常の全9部分prefixとcleanupを独立の操作イベント表・BigIntと照合する。固定故障はopen／observe／read／close／clock・slot生成の指定点のみで、native primitive内部の全故障やOOMを網羅しない。freeze済み出力は切離しDATAだけ。authority=none、ready=false、hashConnection=not_connected、hashCalls=0、runtimeCoverage／nativeCost／実E・S要求量=unknown、coreInvocation=not_calledを維持する。

同snapshot借用、供給側の読取中close、実scratch・同bytesのhash、FileHashCandidateのpost受理、row依存集合と辞書全体hashの集約、実adapter・期待値pinは未接続。(A)の手動合成操作を通常private読取継続まで接続した保証とは呼ばない。既存5 gaps・正式発行口閉鎖・全体受付無効・調査保留を維持する。
