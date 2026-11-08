# WF-B (C)：共通読取kernelへのprivate供給境界の詳細設計

Version: draft-0.3 / Date: 2026-11-08 / 読み取り照合基準HEAD: `91e4e4e` / レビュー修正の基準HEAD: `ee04dcd` / 機械的抽出基準HEAD: `f6018b5`。

draft-0.3: §11の(B)kernelの機械的抽出と薄い互換factoryだけを実装した。[抽出検証記録](E2E_BEST_PRACTICE_WFB_KERNEL_EXTRACTION_2026-11-08.md)。Cからの実行・private供給表・actual判定への変更は行っていない。

draft-0.1のレビュー修正: 現行(B)の早EOF・余剰byte・before長差・after変更は読取経路内のscenario分岐で起こし、宣言長＝actual（`bytes.length`）であることを明記した。§6のexpectedBytes基準の残量計算とactual source由来のEOF／余剰判定はkernelの挙動変更で、機械的抽出に含めないと§5・§10で区別した。抽出段階はscenario分岐を残したまま移し、actual判定の導入とlegacy adapterの故障script化は別段階とし、その後に(B)既存試験を期待値不変で全件再実行する。設計のみで、実装状態は変わらない。

Status: **(B)kernelの機械的抽出だけを実装。private供給・Cからの読取接続は未実装。** 親は[同snapshotの所有・停止契約](BEST_PRACTICE_WFB_SNAPSHOT_READ_LIFECYCLE_DESIGN.md)と[private読取・hash設計](BEST_PRACTICE_WFB_PRIVATE_READ_HASH_DESIGN.md)。[(B)の候補確定契約](BEST_PRACTICE_WFB_SCRATCH_CANDIDATE_DESIGN.md)、[8MiB合成検証](E2E_BEST_PRACTICE_WFB_READ_HASH_CAPACITY_2026-11-08.md)、[開始準備の検証](E2E_BEST_PRACTICE_WFB_SNAPSHOT_READ_START_2026-11-08.md)の保証範囲を合算して、接続完了とはしない。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。draft-0.1／0.2はMDのみ、draft-0.3は§11の機械的抽出に限定する。実期待値pin・実source照合・S発行・core接続・実接続・実通信・設定変更・Pushは行わない。§11以外の型名・供給状態は内部案であり、生成済み証拠・公開API・採用済みcapではない。

## 1 現行の構造差と設計判断

| 現行 | 接続時の差分 |
|---|---|
| (B)のFileはid／bytes／digestを一体所有し、宣言長にもbytes.lengthを使う | canonical宣言・期待値と、合成sourceの実bytes／実読取量を分ける。接続版の宣言長をactualから作らない |
| C-startのstrict mapはfiles／rowsとexpectedBytes／expectedSha256を所有する | 検査済みmap.filesの同要素をcanonical参照として保持し、再decode／spreadで置き換えない |
| C-startは先頭fileとopaque session／budget originのidentity準備だけ | 全fileのprivate供給表とscopeを結合する。opaque budget tokenを実会計・期限として使わない |
| (B)は独立した予算／停止／結果終端、C-startはresourceなしのdiscard | 同sessionの予算・停止と子kernelの責務を接続する設計を要する。独立した第2予算や終了経路を増やさない |

共通化するのは読取・hash・候補受理の処理であり、単に同じSHA-256関数を呼ぶだけでは不足する。期待長・EOF probe、前後metadata、試行／retry／受信／hash計数、同scratch受理区間、候補のclose／post後一度限り受理、固定unwindと診断保持を同じkernelへ集約する。

実装は合成依存に限定する。旧`source-map-supply-fake.ts`の供給class・模擬期待値を成功用に書き換えず、既存のreadonly供給保証も維持する。新C-start root内のsnapshotから接続することと、旧Supply classを共通化したことは別に記録する。

## 2 canonical参照と期待値の単一供給元

canonical宣言は、同Snapshotが所有する検査済み`map.files[ordinal]`のその参照だけとする。元DATA、同値copy、pathやIDによる再検索結果、(B)用に変換したFileをcanonicalと呼ばない。

内部の`KernelDeclarationView`案は、同owner／snapshot／setId／map／files／rows／borrow／sessionと、ordinal・canonicalFile・同budgetへの結合を保持する。期待値はそのcanonicalFileのexpectedBytes／expectedSha256だけから得る。内部viewにscalarをcacheする場合も、生成時と利用前に同canonical参照・同値との一致を検査し、別の期待値を上書きできる引数は作らない。view自身は宣言の代替でも実行権限でもない。

SourceMapDraft純粋検査が返したcopy／freeze済みvalueをSnapshotが一度所有した後、kernel接続のためにもう一度値検査して別mapを作らない。先行の値検査と、その返値への参照bindingを分ける。readonlyなviewを共有できても、開始／移譲claim・budget・scratchの利用権は共有／複製しない。

strict辞書のexpectedBytesは1〜1MiB、総和8MiB以下、files最大32、rows12という現行契約を維持する。(B)の空file試験はlegacy合成宣言adapterの別brandで維持し、strict辞書へexpectedBytes=0を通すためにschemaを緩めない。2つのadapterを同じ読取kernelへ渡せても、legacy側の成功を同snapshot由来の証拠へ昇格させない。

## 3 合成bytesのprivate供給表

同じ固定constructionで`SyntheticPayloadBinding`案を作る。各要素は同snapshot／setId／canonicalFile参照／ordinalと、そのfile用の非公開合成source recordを保持する。表は辞書順で1対1、最大32要素。bindingの不足・重複・余剰・ordinal差・別snapshot／file参照はkernel取得前に拒否する。ID／pathをkeyに外部sourceを引くloaderや、caller指定bytes・callbackを採用するfactoryは設けない。

同じabc配列を複数fileで共有しても、fileごとのbinding record・originは別にする。同内容／同digest／同長であってもF01用bindingをF02へ移すことは拒否する。共有されるのは不変の合成byte列だけで、scope・resource・候補・受理slotは共有しない。

合成source recordは期待値を持たず、実際に返すbytesと固定metadata／故障scriptを所有する。期待digestと宣言長は§2だけに置く。期待値は独立oracle／既知vectorにより静的に固定した合成値を使い、実行中のactual hashから生成・補正しない。C-startの固定4fileを使う初期接続候補では、各canonical宣言3byte／abc digestへ固定abc sourceを対応させる。差分対照はsource側だけをabd／短読取／余剰等へ変え、期待値を追随させない。

source bytesはprivateに生成・検査した不変の有限配列等に限定し、外部保持view・SharedArrayBuffer・resizable buffer・Proxy・accessorを受け付けない。初期の正常／短縮／余剰1byteという固定recipeでは、actual source長を0〜expectedBytes+1に制限でき、全source長も期待総量＋file数以下に収まる。この範囲は合成sourceの構築subsetで、read受付の成功条件や新たな本番capではない。長さが宣言と違うこと自体をbinding不正にしてreadの不一致対照を消さない。

実際の受信枠は従来どおり8MiB+1を共有し、最初の余剰byteで停止する。合成source配列の保持量と受信／hash課金を混同しない。生成・copy／freeze・配列表の全heap／CPU費はUnknownで、scratch64KiBの保証へ含めたことにしない。

## 4 private継続と一度限りの移譲

接続の正常順序は「先行診断／結果／custody確保 → strict map／Snapshot所有 → 開始claim → private borrowとprepared → 供給表／view準備 → 最後の同一性・停止検査 → private kernel移譲claim → 子kernel生成／受領 → 通常読取」の案とする。preparedだけではopenを許さない。

`KernelSupplyView`案は同prepared／borrow／owner／snapshot／session／budgetと、§2〜3の同表に結合する。外へ返さず、同じmodule内の固定継続だけが消費する。caller callbackへ渡す、private型をexportする、summary／診断／同値copyから再生成する口を作らない。

移譲利用状態はprepared側で`unused → taking → kernel_owned`、失敗時は`discarded`へ一方向に進める。元の開始claimとは別の、同preparedを子kernelへ渡す下位claimであり、新session・credit・第2budgetの発行ではない。takingへ入った後の生成失敗でもunusedへ戻さず、再生成・fallbackしない。重複移譲／別view／別originはopen0で拒否し、元sessionも親の停止契約に従う。

子kernel受領後は元preparedの通常利用slotを空にする。親が保持するborrowは寿命管理と停止／cleanup専用で、同じviewを第2kernelへ渡せない。参照のbookkeepingと通常利用権の唯一性を分ける。生成途中に失敗した子の参照も先行結果ownerが追跡し、既存borrowを失わず固定unwindへ進む。

## 5 共通化の物理境界と互換性

初期案は、test fixture配下の単一共通moduleへ、kernelとprivate issuer／adapter・B root／C-start rootを配置する方式とする。既存fixture pathは診断facade factoryだけをre-exportする薄い互換入口として維持できる。配置名は実装時に固定するが、exportするのは固定scenarioの診断factoryだけで、kernel constructor・ReadOps登録口・borrow／supply view・可変budget・adopt helperはexportしない。C rootからB facadeの公開診断を呼んで成功を合成する方式は不可。

| 共通kernelが所有する処理 | root／adapterが供給する差分 |
|---|---|
| open前のcap受付、同scopeの位置指定read、EOF／metadata比較 | legacy B宣言または同snapshotのcanonical宣言、同file用の固定合成source |
| scratch所有・受信／hash prefix・retry・poisoned状態 | 固定sourceの故障scriptと型付き単発結果。外部callbackではない |
| init／update／final、暫定候補、close／post後のslot確定 | snapshotの期待値、origin binding、同sessionの停止／budget参照 |
| 固定close試行・部分候補discard・終端診断材料 | 親の診断owner／cleanup custody／borrow寿命管理へのprivate受渡し |

kernel内で`mode=Cなら成功`等の比較省略や別の簡易hash経路を作らない。8MiB容量・既知vector・poisoned prefix・不一致・close故障は抽出後の共通処理を試験する。Bの公開model／診断意味と既存oracleを維持し、mechanical抽出とCの挙動追加を分けて検証する。現行(B)では、早EOF・余剰byte・before長差・after変更をread／metadata経路内のscenario分岐で起こし、残量・EOF位置・final前のhash済長は`file.bytes.length`（宣言長＝actual）から計算している。したがって§6のexpectedBytes基準の残量計算とactual source由来のEOF／余剰判定はkernelの挙動変更であり、機械的抽出に含めない。(B)の既存試験は宣言＝actualの経路しか通らないため、このactual判定の正しさを単独では示さない。C側の診断を合わせるためにBの既存期待値を一括変更しない。

strict用adapterとlegacy B用adapterのbrandは別にし、Bのid／bytes／digest recordがstrict canonicalFileへ紛れないようにする。共通処理を使うことと、originが同じということは別である。旧readonly Supply classの共通化はこのmodule移動に暗黙に含めない。配布manifest・src／distにfriendやdevelopment issuerを追加せず、梱包の負の対照を維持する。

## 6 期待長・実読取・同resourceの操作契約

接続版の残量・要求長・EOF位置・final前のhash済長はcanonicalFile.expectedBytesから計算する。`payload.length`はmockのactual sourceを記述するだけで、宣言長やfinalの期待値へ代入しない。kernelは同file bindingから1回openした`SyntheticReadHandle`案をscopeへ保持し、その同handleだけでmetadata／read／closeを行う。

固定producerのreadOnceは、同handleのactual sourceからowner scratchへ最大要求長だけ書き、bytes(n)／eof／interrupted／failedを返す。1呼出し1試行で、source lookupし直し・別fileへの再open・decode／再encode・全file body収集を行わない。妥当なnの受信計上と同scratch[0,n)のhash updateは同じ受理区間で実施し、clock／外部hook／awaitを挟まない。update成功時だけpayload位置と正常hash済prefixを進める。

source metadataも宣言値と独立の固定観測であり、同handle identity／regular-kind／size／stampを扱う。正常観測はactual sourceを表すが、読取中変更の合成対照ではbefore時点の長さと後続read結果が異なるscriptを使える。expectedBytesをmetadataの観測値へコピーして一致を強制しない。beforeの長さ不一致、早EOF、宣言位置の余剰byteはcontent_mismatch。期待長とEOFが一致した後のmetadata差はsource_changedとして従来の分類を維持する。

candidateは同canonicalFile／ordinal／view／borrow／session／scope originと、比較済み期待値へ結合する。resourceはclose確認後には通常利用不可だが、候補照合用のscope originは退役まで保持できる。受理時に「まだopen中」を要求してclose後の正常受理を壊さない。逆にscope originが残ることを再read権にしない。候補の発行元・slot未受理・親停止なしを最終post後に再検査し、既存の単一slot確定点を維持する。

## 7 所有権・失敗時停止・退役

| 時点／故障 | 所有者と停止動作 |
|---|---|
| 供給生成失敗、開始claim前 | 親供給診断が保持。読取状態unused、open0。closeで未開始readの停止診断を新設しない |
| prepared／表／view準備の失敗 | 親が部分参照と先行診断を保持。開始claimを戻さず、kernel移譲／open0でdiscard |
| 移譲claim消費後、子生成／受領失敗 | 親の先行保持slotが未受領分を追跡。第2子・第2budgetへfallbackしない。resource未取得ならclose0 |
| kernel受領後、scope／source混入 | 子kernelの通常処理を停止し、親へ固定binding診断を保持。取得済みresourceだけ予約cleanupへ進める |
| read／hash失敗、不一致、期限／取消 | kernelの先行理由・受信済量・正常hash済prefixを保持。別source探索・期待値補正・位置巻戻し再読取をしない |
| Supply close／重複開始 | 親の同期停止latchを同kernelが観測。受理区間は固定処理を終えてpostで停止し、新しいread／final／候補受理を禁止 |
| cleanup／最終checkpoint異常 | 試行全体のcleanupReason／timingとfile slot状態を分離。未確認責務を先行確保custodyへ保持し、成功扱いしない |

snapshot／mapの寿命は親SupplyReadLifecycle、唯一のread権・scope・scratch／hash・実試行は子kernel、非実行診断と未解決責務の保持は先行上位ownerが所有する。scratch／budgetの可変状態を親子に複製せず、親からの停止は同じlatch／budget ownerへの参照で行う。C-startのopaque tokenだけではこの接続を満たさない。

正常close要求をbinding混入へ丸めずreadStop=supply_closedとして保持する。既存hash_unavailable／content_mismatch等のprimaryを上書きせず、全file確定後の停止でもhash_matchを遡及取消ししない。親の供給失敗・lifecycle拒否・read primary／stop・cleanupを別slotにする。

終端は親の所有・停止契約どおり、resource cleanup／未確認責務保持、暫定候補・viewの通常利用退役、最終診断固定、borrow退役、必要時のsnapshot退役を固定順で行う。payload binding表や合成source参照はkernel側から先に切り離し、親が保持するreadonly snapshotを消した後で借用を使わない。未確認custodyは再read／第2close／再受理の権限を持たない。実FDの回収・隔離をこの合成token退役で証明しない。

## 8 固定検査点・費目所有と未確定上界

| 検査点案 | 有限な呼出し範囲と費目所有 |
|---|---|
| root準備／view生成 | 同snapshot tupleと全payload binding表を開始準備側で1回検査。最大32file／12row。表の生成・copy費も準備側 |
| private移譲前／受領直後 | 同prepared／view／borrow／session／budget、未消費claimと停止をそれぞれ1回検査。移譲側・受領側の費目を二重所有しない |
| 各open pre | 同canonicalFileとordinal、payload bindingのorigin。最大32file。kernel側 |
| 各read pre | 同scope／handle、位置、停止、残枠。実read最大65,536回と最初の拒否prefixを含める。kernel側 |
| 候補受理前／最終post後 | 同file／scope origin／view・発行元・slot未受理と停止。最大32候補、失敗後再実施なし |
| 終端／借用退役前 | 親の同結果owner・責務保持と寿命結合を固定回数で確認。通常処理再開や追加source lookupを行わない |

binding点はread→hash受理区間に入れない。metadata／hash／closeの通常guardも引き続き必要で、上表だけで置き換えない。生成前費用を未取得Eへ後着課金せず、source側表準備とkernel側試行を区別する。Bの共有read／byte／retry／cleanup枠をfileごとに再生成しない。

`G_connected ≤ G_B + G_supply + G_transfer + G_binding + G_terminal`という上界の所有分解を出発点とする。現行Bの131,524は比較基準であって、接続後の値ではない。重複するguardを共有する場合は実操作表で重複を除き、初回拒否・部分生成・unwind／custody異常も独立oracleへ含める。具体係数・実E／S・全heap／native費は未確定で、有限step表と必要枠が確定するまでCからkernelを実行可能にしない。deadlineを延長・再計算して収めることも禁止する。

## 9 独立検証の受入条件（未実施）

| ID | 必須対照 |
|---|---|
| KS01 | 同snapshotの全file要素と、同値copy・再decode・別snapshot／版・legacy Fileを対照。canonical参照が変わればopen前または受理前に拒否 |
| KS02 | 期待値／bytesの供給元を分離。宣言3byteにactual2／4byte、同長abd、before観測は一致する早EOF等で実比較の不一致経路を確認。期待値をactualへ追随させない |
| KS03 | 同内容／digest／長さのF01／F02でsource bindingだけを交換し、digestに頼らずoriginで拒否。binding表のmissing／duplicate／extra／ordinal差も拒否 |
| KS04 | 同preparedのview copy／二重take／別session・budget・borrow混入、子生成途中故障。新規open0、開始権／移譲claimの再発行なし |
| KS05 | 全fileの同handle read／metadata／close、短読取・EINTR、hash失敗prefix、終端後不変。元map／row／payloadへの参照漏れと秘密出力を確認 |
| KS06 | closeを表準備・移譲前後・read中の固定script・digest後・最終postへ配置。停止とidentityを分け、1回cleanup、未確認custodyと借用退役順を確認 |
| KS07 | 既存Bのabc／空file／hello・1byte分割・poisoned prefix・8file×1MiB／32file×256KiBが抽出後も同じkernelを通る。strict側の0byte宣言は拒否し、actual0byteの早EOFとは区別 |
| KS08 | 本体と別記述したcanonical file／source対応表、操作・費目・寿命イベントoracleで正常／全失敗prefixを照合。係数を本体からimportして期待値を作らない |
| KS09 | 公開factory／module exports／梱包の負対照。任意snapshot・source・ops・callback登録口なし、同値summaryからの再採用なし、src／distへのdevelopment authority混入0 |

大容量B試験の合格だけではCの全file対応や寿命を保証しない。逆に小さなC合成セットの成功だけでBの容量保証を置き換えない。共通kernelの機械的抽出、供給境界の拒否対照、接続後の連続試験の3つを別に記録する。

## 10 推奨する実装分割と停止状態

最初は(B)の共通kernel抽出と薄い互換factoryだけを行い、Cからの実行入口は閉じたままBの既存試験・型／梱包保証を移す。この段階ではscenario分岐と`bytes.length`基準の計算をそのまま移し、宣言／actualの分離は行わない。次の段階で、kernelへexpectedBytes基準の残量計算とactual source由来のEOF／余剰判定を導入し、(B)のscenario故障をlegacy adapterの固定source record／故障scriptへ置き換える。その直後に(B)の既存試験を期待値・oracleを変えずに全件再実行し、宣言≠actualの経路はKS02相当の合成対照で別に確認する。次に、同canonical参照・静的期待値とpayload binding表・非実行view・移譲claimの純粋合成検査を実装する。共有budget／停止guard・非空custodyへの接続と上界を確定してから、初めて同snapshot→kernelの連続合成試験へ進む。

機械的抽出だけを§11で実施し、供給表・移譲claim・KS01〜09全体は未実施。C-startのprepared、B単独のhash_matchをS・実装coverage・正常な接続終端へ昇格しない。row集約、旧Supply classの採用、実期待値pin・実source照合・実resource／runtime・core接続は別範囲のまま、正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。

## 11 (B)kernelの機械的抽出・互換factory（部分実装）

`tests/review/fixtures/shared-read-hash-kernel-fake.ts`へ従来(B)の全実装を移した。先頭コメント以外は抽出基準HEADの旧file本文と同一で、class・固定recipe・scenario分岐・constructor・状態遷移・ReadOps相当処理・hash・guard／計数・結果model・factory実装を変更していない。従来の`read-hash-fake.ts`はコメントとcreateReadHashFakeのre-exportだけの2行である。

新moduleのprivate Assemblyが読取kernelの本体を保持する。exportはcreateReadHashFakeという固定診断factoryの1つだけで、raw kernel constructor・generic供給口・C実行口を追加しない。旧pathと新moduleのexportは同じ関数参照を返す。この配置は共通化の物理的な第1段階で、canonical宣言adapter／source判定・C rootとのcolocationや接続まで完了したものではない。

§5のレビュー方針どおり、現行(B)の宣言長＝actual bytes.length、早EOF・余剰byte・before長差・after変更の固定scenario判定を維持する。§6のexpectedBytesとactual sourceを独立させた判定には変更していない。既存Bのmodel／全cap／D_stop900・D_end1000・guard上界131,524と全既存試験の期待値を維持する。

追加のexport／互換／C閉鎖試験は、両入口の同一性、有限のB診断、caller source／callback拒否、Cのprepared／summaryを供給として採用しないこと、終端不変と閉鎖authorityを確認する。両入口の出力比較は互換性の対照であって、独立したhash oracleの代わりではない。既存の既知vector・純粋SHA-256 oracle・8MiB／失敗prefix試験を変更せずに抽出先へ通す。

C-start／旧Supplyの実装・試験とsrc／dist／配布設定は変更しない。CのreadKernel／actualBudgetはnot_connectedのままで、open／read／hash／cleanupも0。(B)のsnapshotConnection／rowAggregationもnot_connected、正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。検証範囲・未確認事項は[抽出検証記録](E2E_BEST_PRACTICE_WFB_KERNEL_EXTRACTION_2026-11-08.md)へ記載する。
