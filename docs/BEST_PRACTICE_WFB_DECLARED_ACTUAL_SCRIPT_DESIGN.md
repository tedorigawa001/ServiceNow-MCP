# WF-B：宣言長とactual判定の分離・legacy source故障script化の実装境界

Version: draft-0.3 / Date: 2026-11-08 / 読み取り照合基準HEAD: `375826f` / レビュー修正の基準HEAD: `7a40526` / 実装基準HEAD: `1827327`。

draft-0.3: legacy B内の宣言／actual分離・有限source scriptを合成依存限定で実装した。既存のfactory／model／期待値・cap・期限は変更せず、private producerはoriginとactual recordだけを持ち、宣言長・期待digest・停止ownerを保持しない。[検証記録](E2E_BEST_PRACTICE_WFB_DECLARED_ACTUAL_2026-11-08.md)。Cの供給・実行とshared budget連結は未実装のまま。

draft-0.1のレビュー修正: §6のread pre順序で、update枠の上限受付と予約計上を分けた。read枠・retry枠・受信余裕・update上限・宣言位置をすべて受け付けた後に、予約計上とretry／read試行課金を行う（現行どおり）。また、deadline_during_read／close_lateの時刻更新とcancel_during_read等の取消を、producerが停止ownerの時計・取消状態へ直接書くのでなく、型付き単発結果の固定停止signalとして返し、kernelが同じ受理位置で停止ownerへ反映すると定めた（§3／§5）。設計のみで、実装状態は変わらない。

Status: **宣言／actual分離・source scriptをlegacy Bの合成依存だけへ実装。** 親は[private供給境界](BEST_PRACTICE_WFB_PRIVATE_KERNEL_SUPPLY_DESIGN.md)と[private読取・hash設計](BEST_PRACTICE_WFB_PRIVATE_READ_HASH_DESIGN.md)。[kernel機械的抽出の検証](E2E_BEST_PRACTICE_WFB_KERNEL_EXTRACTION_2026-11-08.md)は、今回の挙動変更の証拠へ転用しない。

C実行入口・正式発行口閉鎖、全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。今回は合成fixture・試験と文書だけ。実期待値pin・実source照合・S発行・core接続・実接続・実通信・設定変更・Pushは行わない。既存のcap・期限・APIを変更したものではない。

## 1 今回具体化する範囲

分離前の`shared-read-hash-kernel-fake.ts`は、宣言長・残量・EOF位置・final前のhash済長を同じFile.bytes.lengthから計算していた。早EOF・余剰byte・before長差・after変更はkernel内のscenario分岐で結果を強制していた。以下§2〜9は実装の受入契約として維持し、実装との対応は§10に示す。

次の実装範囲は、legacy B内で宣言と合成sourceを分離し、read／metadataの故障だけを非公開producerの有限scriptへ移すこと。kernelはscenario名でcontent_mismatchやsource_changedを決めず、宣言と単発観測結果から判定する。Bの既存factory・model・結果schema・全既存期待値・guard配置・固定期限は維持する。

hash init／update／finalの故障、候補identity・生成途中故障、縮小cap・時計故障等は、このsource scriptへの移管対象ではない。それぞれ既存の固定対照を維持し、source producerへhashや候補受理の権限を渡さない。汎用C adapter、canonical供給表・view・移譲claim、shared budget／custody接続、行集約は次工程に残す。

## 2 分離する内部値と所有者

| 内部対象案 | 所有・意味 | 禁止する代用 |
|---|---|---|
| LegacyDeclaration | legacy rootが生成する同file origin・ID・declaredBytes・expectedDigest。生成後不変 | 実行中にactual長／digestへ追随して更新しない |
| SyntheticSourceRecord | 同file origin用の不変backing bytes・初期可視長・before／afterの固定観測・有限script | expectedDigestを持たず、kernelの比較結果を返さない |
| SourceHandle | 同source record／owner originに結合し、可視長・script進行・closed状態を非公開で保持 | 宣言copyやID一致だけで別sourceを採用しない |
| Kernel scope | 同宣言／同handle、position・hash済prefix・retry条件を保持 | requested／EOFをactual長から決めない |
| 固定profile／停止owner | 従来と同じ共有試行・受信・retry・cleanup・clock枠 | producer内でretry・guard・予算resetを行わない |

legacy rootは固定recipeからdeclaredBytesとsourceを別々に生成する。正常recipeで同値でも、kernelのconstructorやreadがsource.lengthを読んで宣言を作り直さない。期待digestは既存の静的vectorをそのまま使う。宣言のfile数／各byte長／総量を先に受付し、actualの短縮・伸長を宣言上限チェックの代わりに使わない。

legacyの空fileはdeclaredBytes=0として引き続き扱う。strict SourceMapDraftのexpectedBytes≥1とは別brandであり、strict schemaを緩めない。Cのcanonical参照・期待値bindingをこのlegacy宣言から発行することもない。

初期scriptは同時resource最大1・1file当たり0〜declaredBytes+1の可視長に限定し、backing bytesも固定有限recipeで用意する。これは合成故障の表現subsetで、実file長や本番capの承認ではない。配列／script／handle生成のheap・native費はUnknownを維持する。

## 3 producerの単発境界とactual判定

非公開producerの操作はopenOnce、observeOnce(handle, before/after)、readOnce(handle, offset, requested, ownedScratch)、closeOnceに限定する。呼出し1回につき1試行で、内部retry・clock採取・外部callback・宣言lookup・hashを行わない。producerは停止ownerの時計値・取消状態への参照を持たず、書き込まない。固定の停止事象は、単発結果に付く有限の`stopSignal`（none／cancel／advance_to_stop／advance_to_end）として返すだけとする。外部からproducerやscriptを登録するexportは作らない。

readOnceの正常動作は、scriptの当該イベントを適用した後、同handleの現在actual可視長Aとoffset Pを使って判定する。

- P≥Aならeof。bytes(0)で表さない。
- P<Aならn=min(requested, A−P)をownedScratch[0,n)へ書き、bytes(n)を返す。
- 同じbacking配列を複数fileで共有してもhandle・origin・script進行は別。同fileの操作中に別sourceへ引き直さない。

kernelはdeclaredBytes Dとposition Pからremaining=D−Pを計算する。P<Dではmin(remaining, 65,536)を要求し、P=Dでは1byteのEOF probeを要求する。要求長をactual残量へ切り詰めない。受信枠は返却nを予測して使うのでなく、従来どおり要求長の最大値を呼出し前に受付する。

P<Dでeofなら早EOF、P=Dでbytes(n)なら余剰としてcontent_mismatch。余剰byteは受信へ課金するがhashしない。P=Dのeofだけが宣言位置のEOF確認であり、after観測へ進める。actual長を見てEOF probe自体を省略することは禁止する。

返却variantとnの検査はkernelに残す。妥当なbytesは1≤n≤requestedかつscratch範囲内。未知variant・0／過大／非整数nはoperation_invalidとし、不明量を0で補完しない。不正n対照scriptはscratch範囲外へ書かず、不正な返却量だけを表す。

## 4 metadataと可視長の時間差

metadataは同handleのregular-kind／identity／size／stampを返す固定観測で、kernelが宣言と比較する。正常scriptではsizeはその観測時点のactual可視長を表す。宣言値を常にmetadataへ代入して成功を強制しない。

早EOF／余剰のlegacy試験は、beforeを宣言と一致させたまま後続readで短縮／伸長を観測する必要がある。単に初期actual長を変えるとbefore不一致でread0になり、既存期待値を壊すため、source側の可視長イベントとして表す。

| legacy対照 | producer側の固定事象 | kernelが行う判定 |
|---|---|---|
| normal／空file | 初期可視長とbefore／after sizeがD、同identity／stamp | 通常read・EOF・前後一致・digest比較 |
| early_eof | before時点はD、最初のpayload read前に可視長0へ短縮 | readがeofを返し、早EOFとして停止。afterを呼ばない |
| extra_byte | beforeとpayload期間はD、offset Dのprobe直前に可視長D+1へ伸長 | probeが1byte返し、受信だけ+1、余剰として停止 |
| capacity_8m_*_extra | 上記伸長イベントを最後のfileだけへ設定 | 前fileの受理を保持し、総受信8MiB+1・hash済8MiBで停止 |
| before_size | before前のactual可視長／sizeをD+1とする | before長不一致でread／init0、content_mismatch |
| after_changed | 長さ・bytesはDのまま、afterのstampをbeforeと異ならせる | expected長とEOF確認後の観測差をsource_changedにする |

固定scriptのイベントはproducerだけが消費する。例えば「最初のpayload read直前」「backingの通常prefix終端offsetでの最初のprobe」の有限位置を持ち、一度消費した伸縮イベントをretryで再適用しない。現在可視長を単調にする一般条件は設けず、指定した有限事象だけを許す。実OSの変更検出・時刻精度の保証ではない。

初期内部表現は、handle当たり最大4個の固定eventと消費bit、可視長・stamp・closed状態、最大返却長、有限のread故障modeで足りるsubsetに限定する。interrupt_onceの消費latchはsessionに1つ、interrupt_alwaysは固定modeとし、試行ごとのevent履歴を追加しない。event表の最大128個という構造枠は合成recipe用で、本番policyや受信capではない。

伸縮／stamp更新・固定停止signal・interrupted／throw／failed／不正nという有限事象は許すが、force_eof／force_mismatch／force_matchのような正常判定を代行するeventを作らない。正常eofとbytes(n)は可視長に基づく同じproducer処理からだけ返す。eventの具体schemaと境界外値拒否も実装時の純粋対照へ含め、任意scriptをcallerから受け付けない。

新しい宣言≠actual対照では、beforeで3byteを観測した後にread可視長を2／0へ短縮するcase、3byte payload後のprobeで4へ伸長するcaseを分ける。初期actual2／4をそのまま観測したbefore不一致caseも別に確認し、早EOF／probe経路を通った証拠と混同しない。

## 5 legacy故障の移管表と変えない責務

| 既存対照 | script／producerの責務 | kernelに残す責務 |
|---|---|---|
| one_byte／long_short_reads／second_update_throw | 正常返却のnを最大1byteに制限 | 要求長・進行・上限課金。second_update_throwのhash故障は既存hash側 |
| interrupt_once | session全体で最初のreadだけinterrupted。fileごとにresetしない | 初回read1／retry0、retry直前の課金、同位置／要求長の再試行 |
| interrupt_always | 各readへinterruptedを返す | 初回＋32retryで33試行、次試行をsource_limitで拒否 |
| read_throw／read_failed | 固定throw／failed結果。部分受信量の確実性を保証しない | read試行1、receivedState=unavailable、先行量保持、cleanup |
| invalid_n | requestedを超える返却nを固定対照として返す | operation_invalid、受信量不確実性、hash0 |
| cancel_during_read／deadline_during_read／hash_throw_cancel | 妥当なpayload返却中の固定停止signal更新。時計を呼ばず、hashは呼ばない | 同区間の受信・update後にpostで停止。hash_throw_cancelのhash故障と二軸保持 |
| open_none／open_owned_failure | 取得なし／同handle取得済み失敗の型付き結果 | cleanup予約・明示未取得返却・取得済みclose1 |
| close_failure／close_throw／close_late | false／throw／固定時刻更新を伴うclose結果 | 予約closeを1回試し、cleanup理由と終端時刻を分離 |
| mismatch_close_failure | abdという実bytesと失敗closeを組で供給。比較結果を返さない | abcの固定期待digestとの実比較でmismatch、cleanup異常を別保持 |

`stopSignal`の反映はkernelが行う。readでは返却結果の受理時、すなわち妥当なpayloadの受信計上の直後・hash update前（現行の`deadline_during_read`／`cancel_during_read`と同じ位置）に、closeではclose結果の受理時（現行の`close_late`と同じ位置）に、停止ownerの取消latch／固定時計値を1回だけ更新する。停止の観測は従来どおり次のpost guardで行い、受理区間内にguard・clock採取を追加しない。signalを伴う結果が不正・失敗variantの場合も同じ固定位置で反映し、別位置への遅延や二重反映をしない。

producer側の固定signal／scriptは呼出し元が与える任意関数ではない。既存の同期停止対照を表すための非公開依存であり、kernelがpublic callbackへ制御を渡す口を作らない。

kernelから除くのは、source／metadataのscenario名に基づく不一致・EOFの強制判定である。hash故障・候補copy／origin／生成故障、guard_cap・read_cap等の縮小profile、時計例外・逆行、開始／終端誤用の既存対照は別責務として維持する。全faultを同時に汎用化・統合するrefactorは本範囲へ含めない。

## 6 同scratch受理区間・課金順序の維持

read preの順は停止guard → 受付（read枠 → retry枠 → 要求長ぶんの受信余裕 → payload予定時のupdate枠上限 → 宣言位置加算）→ payload予定時のupdate予約計上 → retry／read試行課金 → producer単発呼出し。受付のどれかで拒否した場合はsource_limitとし、予約・試行課金は0で、解除すべき予約を作らない。producerがeofを返す可能性があっても、宣言上payload予定なら全受付後にupdate予約を計上する。

妥当なpayload bytes(n)を受けたら、同じ受理区間で受信nを加算し、同scratch[0,n)を1回updateする。成功後だけposition／正常hash済prefixをn進める。producer呼出しからupdate完了まで、追加clock／停止hook／別source操作／awaitを入れない。hash失敗時は既知受信量を保持し、poisonedと直前の正常prefixを残して再read／finalへ進まない。

eof／interrupted／failed／不正結果では未使用update予約を解除するが、実read／retry・既受信・呼出し済みupdateはrefundしない。probeで返った余剰byteは受信だけに計上し、payload位置・hash済量を増やさない。metadata不一致やread失敗後にafter観測を補完して成功化しない。

metadata・read・hash・close・受理のpre／post位置とfinishの2checkpointを変えない。producer内部はclock採取0、guard0、隠れretry0。したがってBの既存8phaseと`G_B≤2(R+7F)+4=131,524`を維持する前提で実装する。追加guardが必要になった場合はこの受入条件を満たさないとして停止し、既存期待値や期限を緩めて通さない。

## 7 期待値不変のlegacy受付条件

旧factory path・新共通module pathのexport／関数参照互換、Bのmodel・診断schema・immutable終端を維持する。既存試験file・oracleの期待値は変更しない。次の値は固定の互換判定点であり、ここでの試験実行結果ではない。

| 既存case | 必須保持値（抜粋） |
|---|---|
| normal | received=hashed=8、read5／update2／accepted3、guard54 |
| one_byte | received=hashed=8、read11／update8／accepted3 |
| early_eof（最初のfile） | received=hashed=0、read1／observe1／init1／update0／final0／close1、未使用update解除1 |
| extra_byte（最初のfile） | received4／hashed3、read2／observe1／update1／final0／close1 |
| interrupt_always | read33／retry32、received0／update0、終端で現予約0、close1 |
| before_size／after_changed | 前者はread0／init0でcontent_mismatch、後者はafter差でsource_changed、いずれもaccepted0 |
| 8file×1MiB／32file×256KiB | received=hashed=8,388,608、update128、read136／160、guard386／770 |
| 上記の最終余剰byte | received8,388,609／hashed8,388,608、accepted7／31、guard380／764 |
| 宣言総量8MiB+1／1file 1MiB+1／33file | open／read／hash／cleanup予約0、source_limit |

全cap（files32・1file1MiB・期待総量8MiB・受信8MiB+1・scratch64KiB・read65,536・retry32）、D_stop900／D_end1000と末尾cleanup枠を維持する。script状態・可視長の追加保持を、実work／heap上界の導出や実E／S充足に数えない。

## 8 新規の独立合成対照（実施対応は§10）

独立oracleは宣言D・source可視長の事象・返却結果・課金／hash／寿命イベントを本体とは別に列挙する。sourceとkernelが同じ誤ったactual長を使って合格しないよう、宣言とactualを意図的に違わせる。既存の独立SHA-256 vector／容量oracleはそのまま使い、actualから期待digestを作らない。

| ID | 追加する受入条件 |
|---|---|
| DA01 | D=3／before size3／read actual2。readは2byteを返した後にeof、受信=hash済2、update1、read2、after／final／受理0、content_mismatch。actual2へ宣言を縮める変異を検出 |
| DA02 | D=3／before3、最初のreadでactual0。eof variantにより早EOF、受信0／update0。bytes(0)は別の不正返却として拒否 |
| DA03 | D=3、payload完了後にactual4。要求はpayload3＋probe1で、受信4／hash済3、update1、after／final／受理0。probe省略や余剰byteのhash混入を検出 |
| DA04 | D=3、actual3のabd、前後metadata一致。実digest比較だけで不一致。scenario名でmismatchを強制する処理を許さない |
| DA05 | legacy D=0／actual0はupdate0で正常。legacy D=0でbefore0→probe actual1は受信1／hash0で不一致。strict宣言0の拒否は維持 |
| DA06 | 同じactual source3に宣言2／4を組み合わせる内部対照。before size3で宣言不一致を検出し、read0。D=actualへの補正を検出 |
| DA07 | 同offsetのEINTR retryと可視長イベントを組み合わせ、event消費1回・byte／update二重計上なし。失敗後のscript巻戻し・別handle混入を拒否 |
| DA08 | 不正variant／0・過大n／throw／failed、hash update部分故障、取消・期限のpost観測。既知prefix・不確実性・予約保存則とclose1を独立計数 |
| DA09 | before差・早EOF・probe余剰・after差を別々に到達させる。actual2／4の初期before不一致を、read経路の早EOF／余剰の保証へ代用しない |
| DA10 | producer内の固定小グリッド（actual長0〜4、offset0〜4、要求1〜3）を、同じ正常bytes／eof処理へ通して独立なmin／EOF oracleと照合。宣言長参照、EOF条件、余剰判定、hash対象n、after移行、retryのevent再適用に対する負の対照／変異が失敗することも確認 |
| DA11 | 全legacy既存試験・新旧入口・型／compiled／梱包対照を期待値不変で成功させる。C rootはreadKernel／actualBudget未接続、任意source／ops／callbackの登録口なし |

新しいD≠actualのcaseは固定内部合成recipe／診断factoryでだけ作る。任意宣言・bytes・scriptやexpectedDigestをcallerが与えられる入口を増やさない。互換確認のために既存caseを単なる固定結果返却へ置き換えることも禁止する。

## 9 失敗時停止と段階の完了条件

producer生成・宣言受付・同handle結合の失敗は、取得有無と既存先行理由を保持して通常処理を停止する。取得なしはclose0、取得済みは予約close1。不一致・read／hash失敗後は別source探索、script再生成、宣言補正、budget／期限再生成で再開しない。close異常はcontent_mismatch／hash_unavailable等のprimaryを上書きしない。

この段階の完了条件は、legacy Bの期待値不変、宣言／actualを分けたDA01〜11の対照、source側scriptとkernel判定の責務分離、同scratch・同handleと共有予算の維持が確認できること。型が分かれただけ、または旧Bだけが合格した状態ではactual判定の完了にしない。

本段階でもC供給表・非実行view・移譲claimとC実行は引き続き閉じ、実期待値pin・実source照合・S発行・core／runtime接続・実通信・設定変更・Pushには進まない。row集約、接続全体のguard上界、native非停止対策・実E／Sも未確認のままとする。

## 10 draft-0.3の実装対応

- rootが固定seedから不変の`File {id, declaredBytes, digest, origin}`と、別の`SourceRecord`を構築する。kernel scopeは同宣言／同handleを保持し、producerへ渡すのはprivate originだけ。producerの台帳に宣言／期待digestは入れない。
- `SourceOps`のopen／observe／read／closeは単発。handleのWeakMapとoriginの開始済みWeakSetを分離し、別origin・別handle・二重open／close・close後readを拒否する。metadata差はkind／identity／size／stampをkernelが比較する。
- 最大4event／handle、可視長・stamp・消費bit、短読取上限と有限故障modeを実装。イベントのstrict項目、値域、5eventの拒否を純粋対照で確認する。retry再適用を観測可能にする固定対照だけは、可視長を相対−1にするeventを使用し、消費bitを外す変異を検出する。
- source側が正常EOF／bytesをactual長から返す。kernelのremaining／要求長／update予約／probe／final前prefixはdeclaredBytesだけを使う。妥当な返却n以外はhashせず、余剰は受信だけ課金する。停止signalはkernelが固定受理点で反映し、producerから停止ownerへの参照を持たせない。
- 固定selectorの`da_source_probe`だけは、独立した有限producer対照の75件gridと拒否booleanを`sourceProbe`診断として返す。bytes／digest／handle／opsや任意scriptの登録口は返さない。このgridの費用は通常Bの会計へ合算せず、本番work／E／Sの証拠にしない。旧49selectorにはこの診断fieldを追加しない。
- DA01〜03／05〜07／09は宣言・可視長の固定対照と独立event oracle、DA04／08は既存digest／故障・停止試験と追加の不正variant／0・小数n／失敗signal、DA10は75件grid・8件不正event・8種変異、DA11は既存試験・新旧入口・strict／compiled／梱包確認へ対応させた。strict SourceMapDraftのexpectedBytes=0拒否は既存試験を維持する。

同snapshotのprivate供給・C用非実行view・移譲claim、行hash集約、実E要求量・S発行はこの実装へ含めていない。
