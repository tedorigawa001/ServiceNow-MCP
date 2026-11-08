# WF-B (C)：同canonical fileのprivate供給表・非実行viewの差分設計

Version: draft-0.5 / Date: 2026-11-08 / 読み取り照合基準HEAD: `e1b3978`（レビュー修正基準HEAD: `fc0c2f3`、配置移行基準HEAD: `3a6b401`、供給準備実装基準HEAD: `98702a9`、供給準備レビュー修正基準HEAD: `70a8d0c`）。

draft-0.5のレビュー修正：post検査の各条件に、その条件だけが外れる固定selector（post_*の21種と有効基点2種）を加え、親lifecycleへの理由写像・claim前close・構築失敗後の直接準備・終端後応答・building slot解放を試験で固定した。table originの保持を`retainedTableOrigin`として診断へ出す。envelopeの10項目照合と`borrow.matches(e)`は相互に冗長で、単独除去は等価、組での除去は全検出とする（§10）。

draft-0.4: §9手順2の正規registry・全fileのprivate供給表・非実行viewと供給準備claimを、新しい合成診断factoryだけへ実装した。同moduleのprivate継続から同C constructionのprepared／borrowを参照し、旧公開診断から再構築しない。[検証記録](E2E_BEST_PRACTICE_WFB_CANONICAL_SUPPLY_VIEW_2026-11-08.md)。下位移譲claim・C実行・実budget／停止guard接続は未実装。

draft-0.3: §9手順1の配置移行だけを実装した。B本体はimport／先頭コメントを除き同一、C-startは衝突回避の内部名3つだけを変更し、同composition moduleへ移した。旧入口のexport・factory参照・既存結果を維持する。compiled対照も§2.2どおりscratch ESMへ移行した。[検証記録](E2E_BEST_PRACTICE_WFB_COMPOSITION_MOVE_2026-11-08.md)。供給表・view・下位移譲claimは生成しない。

draft-0.2のレビュー修正：配置移動時に既存compiled対照（`compiled-declared-actual.mjs`）の変異元source読込・module解決・export集合検査が壊れる点を§2.2に明記し、§9手順1の受入条件へ追加した。

Status: **合成registry／供給表／非実行view・準備claimまで実装。下位移譲・C実行は未実装。** 親は[共通kernelのprivate供給境界](BEST_PRACTICE_WFB_PRIVATE_KERNEL_SUPPLY_DESIGN.md)と[同snapshotの所有・停止契約](BEST_PRACTICE_WFB_SNAPSHOT_READ_LIFECYCLE_DESIGN.md)。[宣言／actual分離](BEST_PRACTICE_WFB_DECLARED_ACTUAL_SCRIPT_DESIGN.md)と[その検証記録](E2E_BEST_PRACTICE_WFB_DECLARED_ACTUAL_2026-11-08.md)はlegacy Bの合成保証として維持し、Cからkernelへの供給済み証拠にしない。

C実行入口・正式発行口閉鎖、全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。今回は合成fixtureの供給準備・検証と文書だけ。実期待値pin・実source照合・S発行・core接続・実接続・実通信・設定変更・Pushは行わない。§5の下位移譲型・状態は未実装の内部案で、実行権限の追加ではない。

## 1 現行との差分と到達させない状態

現行Bは不変のlegacy File（id／declaredBytes／digest／origin）と、期待値を持たないSourceRecord／SourceOpsを分離した。しかしBのoriginはCのcanonical fileを表さず、B factoryから返る診断をCが採用する口もない。

現行C-startはstrict検査の返値をSnapshotが所有し、先頭fileの同一性だけをBorrowへ結合する。preparedは同borrow／session origin／budget originを保持するが、全fileのpayload対応表・実会計・停止guard・resource・kernelは持たない。budget originはopaque tokenであり、cap／期限・credit・実Eではない。

今回具体化するのは、このpreparedと同construction内にある全canonical fileへの供給表、期待値を別供給しない非実行view、そのprivate所有と失効・discardである。schemaを緩めず、未参照fileも含め辞書全体を対象とする。rowsのunimplemented／missingはそのまま保持し、行hash集約・実装coverageの充足にしない。

Cの供給準備／非実行移譲段階はopen／observe／read／hash／resource cleanupをすべて0に保つ。source recordやviewの生成をopen、論理参照消去をclosed_confirmed、非実行holderへの移譲をkernel_ownedと呼ばない。CのreadKernel／actualBudgetはnot_connected、ready=false／authority=noneのままとする。独立Bの既存read／hash試験を停止する意味ではない。

## 2 生成元・配置境界

### 2.1 private値を生成する唯一の経路

同constructionの先行DiagnosticOwner・結果slot・空custody → 固定合成DATAのstrict検査 → Snapshotによる返値の所有 → 開始claim → 同borrow／prepared → 下記供給準備claim → 全fileの表と非実行view、の順とする。前段を成功summaryから再構築しない。

strict検査でcopy／freezeされたmapの返値をSnapshotが一度所有した後は、再decode／再検査で新mapを作らない。`snapshot.map.files[i]`のその参照が唯一のcanonical fileである。raw DATA・同値copy・legacy File・ID／path再検索の結果を代用しない。

初期合成セットは現行C-startの4file／12row、各fileの宣言3byte・既知abc digestを用いる。期待値の供給元は同canonical fileだけ。sourceは固定recipeが独立に生成するabc／abd／可視長変化等で、actual hashから期待値を生成・補正しない。これは合成値であり、実sourceの期待値pinではない。

### 2.2 配置の選択と互換入口

privateなSnapshot／Borrow／preparedをmodule間のadopt関数で受け渡す案は採らない。`tests/review/fixtures/snapshot-read-composition-fake.ts`という単一moduleへ、B kernel／SourceOpsとCのconstruction／lifecycleの既存本体だけを移した。供給表issuer／view／移譲consumerは将来同じlexical境界に置く案のままで、生成・接続しない。

| 対象 | 移行時の扱いとexport境界 |
|---|---|
| read-hash-fake.ts | 従来のcreateReadHashFakeだけを維持する互換入口 |
| shared-read-hash-kernel-fake.ts | 物理移動後もcreateReadHashFakeだけをre-exportし、既存export集合・関数参照互換を保つ |
| snapshot-read-start-fake.ts | 従来のcreateSnapshotReadStartFakeとfacadeを維持する互換入口 |
| 新composition module | private class／表／view／claimを共有。exportは固定合成scenarioの診断factoryだけ。constructor・ops・borrow・adopt helper・可変budgetはexportしない |
| 新しい供給view試験用入口 | 固定selectorのみの診断facadeを薄くre-exportする案。任意map／bytes／callback・戻されたviewを引数に取らない |
| source-map-values-core.ts | 既存の純粋値検査だけを再利用。private originや実行権限の発行元に変えない |

旧C-start facadeを呼んで返された公開診断から表を作る方式は禁止する。旧C-startと新試験用factoryは、同じprivate construction手順を利用できるが、factory呼出しごとのoriginは別であり、互いのpreparedを採用できない。新factory内では最初に所有した同Snapshot／Borrowを使う。別assemblyの保証を既存C-startの追加保証へ自動的に合算しない。

配置移行は挙動追加より先に別工程として照合する。B／旧C-startのclass内部状態・既存結果schema／計数・期待値を変えず、新入口を使わない場合は追加の表／sourceを生成しない。移動時のclass名衝突等は内部改名に限り、既存cap・期限・検査順を変えない。private値をexportするために梱包設定やsrc／distへfriendを追加しない。

compiled対照の維持は「実行して通る」ことで確認し、文面上の互換扱いにしない。移動前の`compiled-declared-actual.mjs`は`./shared-read-hash-kernel-fake.ts`の本文を読み、8種の文字列変異（各変異位置が1回だけ現れることを`mutation site drift`で検査）を加えて単一fileをtranspileし、`data:` URLのESMとしてimportしていた。物理移動ではこの前提が3点で崩れるため、以下を実装した。

1. 読込先がre-export 1行になり、変異位置が0回となってdrift検査で停止する。読込先は移動先のcomposition moduleへ切り替え、8変異の置換元が移動後も各1回だけ現れることを確認する。
2. composition moduleはC-start由来の`./source-map-values-core.js`相対importを含むため、`data:` URLからは解決できない（Nodeは`ERR_UNSUPPORTED_RESOLVE_REQUEST`）。移動工程では、依存moduleを含めて一時directoryへtranspile出力してfile URLでimportする等、相対importを解決できる方式へ改める。composition moduleから相対importを除くために純粋値検査を複製・内包することはしない。
3. 同fixtureはcompile結果のexport集合が`['createReadHashFake']`だけであることも検査する。composition moduleはC-start等の既存factoryも持つため、移動後はcompile対象のexport集合を移動先の固定集合として明示照合し、`shared-read-hash-kernel-fake.ts`のre-export集合が`createReadHashFake`だけであることは別に照合する。片方の検査で他方を代用しない。

一時出力はscratch相当の作業領域に限り、tests／src／distや梱包対象へ残さない。変異の内容・数・期待する失敗は移動前と同一とし、移動を理由に削除・弱化しない。

## 3 private供給表の所有契約

内部候補`CanonicalPayloadTable`は同preparedに1つだけ発行する。rootに発行済みtableの同参照を保持し、Object.freezeだけを発行証拠としない。表本体・各bindingもreadonlyで、通常利用権は親のprivate slotに1つだけ置く。

| 対象 | 保持内容・所有者 |
|---|---|
| table envelope | 同owner／Snapshot／setId／map／files／rows／prepared／borrow／session origin／budget originと、発行済みtable参照。供給準備ownerが所有 |
| binding[i] | ordinal i、`files[i]`そのもの、同table origin、file固有source origin、同rootが当該ordinalへ発行したSourceRecord参照 |
| source registry[i] | canonical file参照・ordinal・source origin・SourceRecordの正規の組。rootが一度pinする非公開identity台帳で、候補表から期待組を作り直さない |
| SourceRecord | 不変backing bytes、初期可視長、有限metadata／故障script。期待長／期待digest、map／view／session／budgetを保持しない |

ここでregistryのpinとは合成construction内の参照固定であり、実期待値・実artifactのpinではない。表の正しさを確認する基準は、同Snapshotのcanonical配列と、同生成元が固定したregistryである。比較対象のbindingを入れ替えた後、その同じ表から正規registryも作り直して検査を無効化しない。

表は`files`の原順序でN要素（N≤32）。要素iについて、canonical参照===files[i]、ordinal===i、registry[i]の全origin／record参照との一致を検査する。表をID／pathで再索引・sort／dedupして欠落や順序違反を補正しない。既存strict値検査が決めた順序・shapeは維持する。

F01／F02が同じabc配列・長さ・digestでもbinding／source origin／SourceRecordは別にする。不変bytesだけは共有可能だが、origin・handle進行・event消費・候補・結果slotを共有しない。recordだけ、originだけ、または両方を別fileと交換してもregistryとの組合せ不一致で拒否する。

source構築subsetは0〜expectedBytes+1の可視長、各record最大4event、全source容量は期待総量＋N以下を基準にする。strict宣言は1〜1MiB／総和8MiB／最大32fileを維持する。actual≠expected自体はidentity不正ではなく、将来のread／metadata比較で停止させるための正当な合成対照である。外部配列・Proxy・accessor・SharedArrayBuffer・resizable bufferを受領する入口は作らず、固定recipe以外をconstructorへ渡せないようにする。

## 4 非実行viewと同一性

`CanonicalDeclarationView[i]`候補はtable／binding[i]／ordinal／canonical fileを同参照で保持する。期待値はcanonical fileのexpectedBytes／expectedSha256へ直接参照し、初期版ではscalarの重複cacheを設けない。source長・source digest・legacy Fileへ変換した値から期待値を取らない。

`KernelSupplyView`候補は同envelopeと同table／全declaration view、発行元のprivate view identityを束ねるだけである。open／read／hash／takeメソッドやcallbackを持たせず、通常利用の状態はprepared owner側に置く。readonlyという型だけでは同origin・未消費を証明しない。

利用時の検査は、発行済みviewそのもの、同prepared／borrow、同owner／Snapshot／setId／map／files／rows／session／budget origin、同発行table、各canonical／registry対応を照合する。文字列setId・file ID・path・digest一致だけでは受理しない。同値copy・再freeze・再decode・配列wrapper・別constructionの正常viewは拒否する。

将来のkernel宣言adapterはlegacyとcanonicalの別brandを持ち、canonical側はこの同view／file参照を保持する必要がある。現在のB Fileへ値をコピーしてcanonicalだと呼ぶadapterは作らない。本段階でそのadapterをkernelへ渡したり、Bの予算・scratch・SourceOpsをC用に生成したりしない。

## 5 供給準備claim・移譲claimの消費点

開始claim、供給準備claim、下位移譲claimは目的・slotを分ける。いずれも同constructionの利用排他であり、K0／E／S・permit・creditの発行ではない。prepare済みであることだけを移譲・実行の許可にしない。

| 状態系 | 遷移候補・不可逆点 |
|---|---|
| 供給準備 | unused → preparing → prepared。失敗はdiscarded。preparingへの同期置換が1回の準備claim消費点で、表／viewの部分生成失敗でも戻さない |
| 非実行移譲 | unused → taking → held_for_discard → discarded。最後の同一性／停止検査後、takingへ同期置換する点が移譲claimの消費点 |
| 将来の実kernel受領 | 親設計のkernel_ownedは未接続。非実行holderをkernel_ownedへ昇格する分岐を実装しない |

初期の移譲試験で発行するclaimは`NonExecutingSupplyTransfer`という別brand候補とし、固定の非実行holder／discard consumerしか消費できない。将来のkernel用claim・受領証拠と互換にしない。非実行移譲済みの同viewを後で再takeしてkernelへ渡すことは不可であり、summaryも再利用できない。

固定の移譲順序は次とする。

1. 同ownerの受領用空slot・部分生成保持slotを先行確保する。slot確保失敗はviewを外へ渡さず拒否し、移譲claim消費0。
2. 先行拒否、同prepared／borrowとtable／view、供給open／closeRequested、未消費claimを検査する。元sessionが失効していればbinding混入とは区別して停止する。
3. 同期区間でclaimをtakingへ置換する。この時点以後、再入／二重take・生成失敗・post拒否でもunusedへ戻さない。新session／budget／borrow・viewを再発行しない。
4. 元ownerの通常利用slotを空にし、同table／view参照を先行確保したpending保持slotへ移す。外部callback・await・source操作を挟まない。親の寿命管理用borrowと診断参照は消さない。
5. 同owner／発行物・停止のpost検査後、固定slot置換で非実行holderへ受理する。これは移譲の公開点で、step3のclaim消費点とは別。公開といってもprivate consumerから見える位置であり、facadeへ参照を返す意味ではない。
6. 非実行holderの固定discardだけを実施し、source／view／table参照を退役する。kernel生成・scratch確保・open／hashは0。終端診断は非実行移譲／discardの状態だけを示す。

pre検査拒否ではclaimの消費計数を増やさないが、準備ownerは失敗終端へ進むため再利用可能にはならない。準備claimと開始claimも戻さない。taking中の二重takeは新たな移譲0で拒否し、元処理もfail-closedで破棄へ進める。終端後の反復は非記録の固定拒否だけを返し、先行終端を変更しない。

## 6 停止・失敗責務と寿命

| 停止位置 | 保持者・破棄責務・診断 |
|---|---|
| 供給生成失敗、開始claim前 | 既存supplyFirstを保持。読取unused、open0。供給closeで未開始readStopを新設しない |
| 表／registry／viewの部分生成失敗 | 供給準備ownerが作成済み参照を保持し固定discard。既存read_prepare_unavailableを候補理由とし、開始／準備claimを戻さない |
| 同一性不一致・未発行copy | lifecycleFirst=binding_mismatch、readFirst未設定ならbinding。元sourceを探索し直さず、表を補正せず停止 |
| 正規close／元run失効 | 同期close latchを保持。開始claim発行後のreadStop=supply_closedは先行理由を上書きしない。cleanupに必要な旧identityは壊さない |
| taking後、pending／受領post失敗 | 親の先行pending保持slotが未受領分を追跡し、通常利用slotへ返さずdiscard。同上位診断ownerを使い、第2holder／第2budgetへfallbackしない |
| held_for_discard後の停止 | holderが参照退役を担当し、親は寿命管理と先行診断を保持。受領済みを巻き戻して別consumerへ渡さない |
| 最終discard／結果準備異常 | 未退役責務を親の先行保持slotへ残しretirement=unconfirmedとする。cleanup確認済み・退役完了へ補完しない |

下位の表／view通常利用を止め、同holder／pendingの参照を切り離し、非実行結果を固定してからborrowを退役する。供給close／供給失敗があれば、その後にSnapshotを退役する。正常discardでは既存readonly check用Snapshotを残せるが、開始／準備／移譲の各claimは消費済みまたは終端拒否のまま。

親の寿命管理参照はsourceを再供給する権限ではない。SourceRecord／表の通常利用参照を複製して、discard済みviewを復元しない。終端後のGCや物理ゼロ化・実FD解放は証明しない。本段階にresourceはなくcleanupDisposition=not_started、resource custodyは空であり、非実行pending保持slotと混同しない。

supplyFirst／lifecycleFirst／readFirst／readStop・参照退役状態を別に保持し、最初の理由だけを記録する。供給準備失敗等の新しい有限診断分類を設ける場合も、旧C-startやBの既存reason unionへ無断で混ぜず、新診断factoryのschemaとして別途固定する。source bytes・digest・path全文・raw例外・private参照は出力しない。

## 7 費目所有・有限境界・未確認事項

| 費目 | 所有者・有限な対象 |
|---|---|
| 先行owner／結果／custody、strict map／Snapshot、開始borrow／prepared | 既存C construction。新表側で第2回の生成として課金・計数しない |
| registry／binding表／declaration view生成と全件照合 | 供給準備側。N≤32・rows12、1回の準備claim内で原順序走査。拒否後の再走査loopなし |
| private移譲pre／postとpending／holder | 移譲側。発行identity・同tuple・停止、全表の照合回数を固定scheduleへ明示し、準備側と二重所有しない |
| 通常利用停止・表／view／source参照退役 | それぞれの通常利用owner。親のborrow／Snapshot退役とは別に、最大1の論理退役として計数 |
| read／hash／retry／受信／resource close | 本段階は0。Bの成功計数・guard・cleanup証拠を流用しない |

上限32／12・event最大4は構造枠であり、実work／実Eの導出済み上界ではない。内部scheduleの各検査点・走査・割当・拒否prefix・固定discardを独立event oracleで数える必要がある。生成前費用を未取得Eに後着課金せず、K0／seed側bootstrapの未確認事項はUnknownのまま。

現行Cのbudget／session origin一致はidentityだけを示す。本段階で実clockを呼んだ・期限を守ることを実証したとはしない。将来の同budget／停止owner連結は別工程で、既存BのD_stop900／D_end1000・cap・guard上界131,524を延長・再計算して接続費を吸収しない。C接続全体のguard／CPU／heap／native上界、実E／Sは未確認。

## 8 独立合成受入条件（実施範囲は§10）

| ID | 必須対照 |
|---|---|
| CV01 | 同Snapshotの4file全件を原順序で表へ対応させる。rowsから未参照でも辞書fileを省かず、全rowsのunimplemented／missingを保持 |
| CV02 | raw DATA・再decode・同値map／files／rows／file copy、別Snapshot／setId／owner／session／budget／borrow／preparedを個別に混入し拒否 |
| CV03 | missing／duplicate／extra／ordinal差・表の順序交換を拒否。sort／dedup／ID再検索を足す変異が通らない |
| CV04 | 同一abc bytes／長さ／digestの2fileでrecordのみ・originのみ・両方を交換し拒否。比較する表から正規registryも作り直す変異を検出 |
| CV05 | 宣言3にactual2／4・同長abd、正常before後の縮伸scriptを準備できる。actual差をbinding拒否にして将来の読取対照を消す変異を検出。期待値をactualへ補正しない |
| CV06 | 同値freeze済みtable／view copy、診断summary、旧B File／正常B結果、別constructionの正常viewを未発行として拒否 |
| CV07 | 供給準備の順序違反・二重準備・再入・全生成失敗prefix。claim最大1、先行理由保持、同origin／map／view再生成なし |
| CV08 | 移譲pre拒否は移譲claim0、taking後故障は1のまま。二重take／再入／post拒否／別pending・holderを拒否し、第2受領・元slot返却なし |
| CV09 | closeを開始前・prepared後・表生成途中・移譲pre前・taking中・受領post前後・終端後へ固定scriptで配置。正規closeとidentity不正を分離し、claimと先行診断を保持 |
| CV10 | 全失敗prefixで通常利用slot→pending／holder→診断固定→borrow退役→必要時Snapshot退役を独立寿命oracleと照合。未退役責務の保持失敗を退役成功にしない |
| CV11 | 全caseでopen／observe／read／hash／resource cleanup0、readKernel／actualBudget未接続。非実行holder／claimからkernel_ownedやSを発行しない |
| CV12 | 旧B・C-startの結果／計数・期待値不変、旧export集合・関数参照互換、strict／compiled負対照、tests／新composition／viewの梱包混入0 |

独立oracleは本体の表／registry生成・係数をimportして期待値を作らず、固定canonical ordinalと正規source対応、claim・所有・退役イベントを別記述する。任意のcaller object・callbackを受け入れる試験口は作らず、混入は固定内部scenarioのみ。Cでhashしていないため、正常viewの準備成功を内容一致の証拠にしない。

## 9 推奨する実装分割と停止線

1. 配置だけを移し、既存B／C-startの全挙動・export・compiled／梱包保証を維持する。compiled対照は§2.2のとおり読込先とmodule解決方式を移動先へ合わせ、8変異すべてが移動後も検出されることを`package-http-classification.mjs`経由で確認する。新規private値の生成はまだ行わない。
2. 同constructionの正規registry／全file供給表・非実行viewと準備claimを実装する。CV01〜07の純粋identity／生成故障対照を優先し、旧facadeからのpublic再採用は不可とする。
3. 別brandの非実行移譲claim・pending／holder・固定discardを実装し、CV08〜12と失敗時診断／寿命を確認する。kernel生成／受領は0のまま。
4. 同budget／停止owner／非空cleanup custodyと接続費目の設計・検証を別途完了してから、改めてC→kernelの実行接続を検討する。非実行holderをそのまま昇格することはしない。

手順1の配置移行と手順2の非実行供給準備を実施した。手順3以降の下位移譲・pending／holder、実budget／stop／custody接続は未実施であり、view準備をC接続完了にしない。実期待値pin・実source照合・行hash集約・S発行・core／runtime接続は別範囲。C実行入口・正式発行口閉鎖、全体受付無効・Unknown・調査保留を維持する。

## 10 draft-0.4の供給準備実装

`snapshot-read-composition-fake.ts`にprivateなCanonicalSupplyAssembly／registry／binding／table／viewを追加した。module内の非export継続`canonicalSupplyAccess`はCStartAssemblyのstatic blockで設定し、同instanceのprivate prepared／Snapshot／Borrowとliveなtupleを参照する。公開facade・診断summaryからの採用、genericなconstructor／adopt helper・外部friend登録口は作らない。旧C-startのinstance field・既存method本体とB本体は変更しない。moduleのstatic定義は増えており、その初期化費用を既存Bのguardへ計上済みとはしない。

追加exportは固定selector限定の`createCanonicalSupplyViewFake`だけで、薄い`canonical-supply-view-fake.ts`からも同関数をre-exportする。composition moduleは合計3診断factoryとなるが、旧B／C-startの3入口は従来の単独export／facadeのまま。新facadeはcheck／begin／prepare／prepareSupply／close／finish／inspectだけで、viewそのもの・移譲／take／execute操作を返さない。

新rootは同CStartAssemblyによるstrict検査1回・Snapshot1つ・開始claim1回・borrow／preparedを再利用する。prepareSupplyはunused→preparingの同期置換で専用claimを1回消費し、全4fileを原順序でregistry→bindings→table→declarations→viewへ構築する。各部分生成物はprivate building slotへ直ちに保持し、失敗時に通常・発行済み参照と共に消去する。

正規registryを候補表とは別に固定し、同tuple・同発行table／view・各file／ordinal／record／source originをpostで全件照合する。viewの期待値は同canonical fileへの参照でありscalar cacheを持たない。同内容のsourceの交換でも拒否する。actual0／2／4byte・同長abd・before後の縮伸scriptは、構築subset内ならidentity検査を通るがhashは実行しない。sourceShapes診断のbyte数は初期可視長／backing容量で、受信済量やhash済量ではない。

二重・再入準備はduplicate_preparationを新診断へ固定し、親C lifecycleも停止させる。source／owner生成失敗では親supplyFirst・読取unusedを保持し、準備claim0、未開始readStopを新設しない。正規closeはsupply_closedとしてbinding拒否と分け、未受理の表／viewを同期破棄する。失敗後の再準備・新origin・第2budget生成はない。

新ownerのfinishは、供給参照clear → 内側Cの非実行終端固定／borrow退役 → 必要時Snapshot退役 → 外側の不変診断固定、の順とする。生成失敗時は専用private継続でborrow退役後のSnapshotも退役し、偽のclose要求／readStopは追加しない。正常discardでは従来どおりreadonly用Snapshotを残せるが、再準備は許さない。retirementOrderは最大3件の固定論理イベントで、GC／物理解放・resource cleanup確認ではない。

CV01〜07、CV09の準備段階close、CV10の部分生成参照／borrow退役、CV11の非実行部分とCV12の旧互換・compiled／梱包を確認した。CV08と移譲後のCV09〜11、未確認責務のpending／holder保持・retirement unconfirmedは手順3に残す。生成17prefix・長さ4の625操作列を独立oracle／不変条件で確認し、compiledでは従来8変異に新供給6変異を加えた。

post検査はenvelope／発行済み同参照・長さ・registry・binding・declarationの各条件を固定post_* selectorで単独に外して確認する。envelopeの各項目照合は同borrowの`matches(e)`と重複して働き、`matches(e)`は各項目一致とcontext側の`matches`検査から導かれるため、片方だけの除去は等価変異として扱う。

新countsは生成／検査の局所計数（validationPassesは全表post検査）であり、全CPU・確保試行・追加private context参照や負対照copyの費用を網羅したwork上界ではない。rootのopaque budgetは引き続きidentityだけ。実会計・実clock・共有期限・実E／Sの導出はUnknownのままとする。
