# OM-D 混合manifestと内容比較の接続差分

Version: br006-recovery-mixed-content-omd-draft-0.4 / Date: 2026-11-03。
Status: **OD-Aのfresh mixed slot／prefixと、OB-01のstrict DATA・同pins／行対応・準備claimまで合成実装。既存origin・同accepted／planへの移譲・内容比較は未接続。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

基準HEAD: `6405b8b`。[CG-C設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OMISSION_CGC_DESIGN.md)§10・12、[NR-C](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_NONREVIEWED_DESIGN.md)§11、[本文gate](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_CONTENT_GATE_DESIGN.md)§6からの差分。OM-Bの計数／finalizeモデルとRD-Cのfinish jobは設計段階なので、それらを成立済みにせず接続範囲を分割する。

## 1 現在の接続点と変更しない境界

| 現行のprivate owner | 既存保証 | OM-Dで必要な差分 |
| --- | --- | --- |
| [OM-C capture kernel](../tests/support/review/synthetic-recovery-capture.ts) | 同constructorのreviewed列・初期DATA prefix pin・同元captureのkeep／omit決定・固定discard／同期失効 | 非reviewed originを含む固定順prefix、保護された初期／後段prefix、decision＋captureの移譲 |
| [NR-C root](../tests/support/review/synthetic-pinned-recovery-root.ts) | 同pinsの選択row／input・producer別非reviewed発行・同accepted／planのseal。親omittedは拒否 | 親省略slotを別variantで生成し、同receiptの由来を一つの新assemblyで結ぶ |
| [finish kernel](../tests/support/review/synthetic-recovery-kernel.ts) | 同plan／frame／ready／source／cleanup未開始・元acceptedの一度限り封印 | 同private封印slotへ内容manifestも移す固定継続。旧handleの後付け昇格は不可 |
| [CG-A](../tests/support/review/synthetic-recovery-full-json.ts)／[RD-B03](../tests/support/review/synthetic-recovery-finish-values.ts) | 同JSONのbounded full値検査／context・集合・時刻の局所比較 | 同じ正規化値から固定viewを作り、元本文・origin・sealへ結ぶ。局所比較だけで内容一致を主張しない |

OM-Cの公開handleをNR-Cへ登録するadapterや、同じfixtureを二つのrootで生成してID／JSON一致で結ぶ方式は採らない。別constructorではopaque receipt／accepted／planが別物になる。共通private kernelから**一つの新合成assembly**を生成し、旧factory／旧試験のAPI・診断・拒否条件は維持する。

runtime session／auth／ReleasePermit／実workerの台帳を共有しない。新factoryは合成DATAから新slotを作るだけで、既存の実ownerを登録・切替するfriendやbody getterを作らない。初期prefix DATAを既存の実prefix証拠へ昇格しない。

## 2 混合slotと元receiptの固定

selectedの一意sys_id昇順・最大100件を一度pinし、全行を次のいずれか一つへ割り当てる。stateだけからproducerを推定しない。

| variant案 | 必須のprivate連鎖 | 禁止する代用 |
| --- | --- | --- |
| KeptReviewedSlot | 選択row・元input／T_i／job／wire origin、同ReviewedCapture、同KeepDecision、元accepted outcome | 同contextの別本文、別captureのdecision、外部keep bool |
| ParentOmittedSlot | 上記と同じ元capture／input／acceptedに同OmitDecisionを追加。出力はresult_omitted／response_limit | 元captureを捨てた元worker omittedへの格下げ、warningだけで任意omit |
| OriginalWorkerOmittedSlot | 同input／job／wireで最初からomittedを受けたNR-B発行継続。本文captureなし | 未受信reviewed本文・元findings数の推測、空本文捏造 |
| OtherAnalyzedNonReviewedSlot | 同analysis input／job／wire・NR-A strict rejected値・NR-B発行元 | metadata／retrieval由来への付替え |
| Classified／RetrievedSlot | 同選択rowの固定分類、または同payload attempt／terminal／cleanup・値検査origin | metadata行への架空input／job／T_i、別attempt終端 |
| RetainedSlot | 同元not_processed input／receipt・既存送信状態と必要な旧世代終了証拠、deadline_exceeded | hard取消／全deadlineのsoft化、完了結果の未処理化 |

retainedは既存adapterとOM-Aの契約どおり**連続した末尾**に限定する。processed行へ戻る順序、missing／余剰／重複slotは拒否する。0.3のdeleted拒否、producer別reasonの既存範囲、元認証snapshot／release／source／windowと存在するreceiptの同一性を維持する。

ParentOmittedSlotは一行分であり、capture行とomitted行を二重計上しない。出力reviewed数と元capture保有数を別の統計にする。親省略が一つでもあれば元capture保有数は0ではなく、NR-CのEmptyReviewedManifestを使えない。元reviewedを一度も受理していない場合だけ、非reviewed／retained全件を検査した同planのゼロ証明を検討する。

## 3 prefixの供給元と処理順

OM-Cの初期prefix pinは合成DATAである。OM-Dでは次の三段階を別に扱い、最終headerから省略warningを引いて初期prefixを逆算しない。

1. **開始prefix**：同assemblyの固定生成継続が、省略決定前のlimitations／errorsをowned値へpinする。合成issuerはfixtureの初期条件として作れるが、実run originは未保証と明示する。
2. **親受理prefix**：processed行の固定順に、reviewedなら同captureとOM-A決定、元omittedならその受理時のwarning／error、他の非reviewedなら当該stateのまま進む。findings数は保持中reviewedだけから導出する。decision claimはkeep／omit共通で、元capture確定後に一度占有する。
3. **親処理後のdelta**：retained末尾生成・soft停止・verify／consistency等の固定継続が追加するwarning／error／consistencyを、同runの既存soft facts・source originへ結んで反映する。省略由来の費目と混ぜない。

任意のwarnings／errors配列を「後段delta」として登録する口は作らない。供給できないstage／順序／originはunsupportedとして止める。合成DATA pinだけで比較する前段試験と、origin付きdeltaの受理を別の型／検証範囲にする。初回から全通常adapter結果を扱えるとはしない。

prefix配列順と重複は親段階で保存する。現RA／RD-Bのprojectionでは一部rule／limitationsがsortされるため、構造用snapshotだけをbyte省略や配列順比較の入力へ流用しない。固定生成継続で元の順序付き値も保持し、同元headerへの関係を別に照合する。sort／dedupをした後の値から元配列を復元しない。

## 4 内部型と一度限りの移譲

以下はOM-D全体の型案。OD-Aで追加した合成専用の型・slotは§11に分離し、同accepted／planへ移す型・発行口はまだ追加しない。

| 型案 | 内容と発行元 | 消費契約 |
| --- | --- | --- |
| MixedOriginDraft | 同assemblyの元row／input・producer発行物・初期prefix／後段deltaと同owner／run／source／budget／release／window | 全selectedを検査する前の非実行draft。summaryや独立successの寄せ集めで完成しない |
| ParentMixedDecisionSet | 同cursorからの決定・元captureと非reviewed／retainedの完全partition | 各claimは一度。元receipt・固定順・producer／originを維持 |
| BoundMixedManifest | 同元accepted／plan／handoff・新frame／ready・source／cleanup identity・未開始serialに結ぶ全内容 | 元slotを先に取り外し、全検査とpost guard後だけdest slotへcommit |
| ComparisonDelivery | 同manifest・比較要求claim・同元jsonのprivate delivery origin | 外部handle登録や別JSONの差替え不可。finish job未接続時は比較専用originで、worker originとは別 |
| DiagnosticContentMatch | 同deliveryのfull値・固定局所view・元本文比較の成立を保持する非実行結果 | authority:none。候補／Permit／ContentGateCompleteと別brand、固定discardだけ |

新しい移譲継続は同kernel内で元seal slotと内容slotの両方を操作する。外からowner／receipt objectを渡して既存rootへ追加する方式は不可。bind済みの元plan・accepted・frame／ready origin・source／cleanup identityとserial=0をpre/postで再確認し、別root／コピー／消費済み／失効済みを拒否する。既存routeSpentやreadyをunusedへ戻さない。

claim占有→元slot取外し→pre guard→全所属／集合／prefix検査→post guard→dest commitの順。片側だけ移譲済みになった時にrollbackで元claimを復活させない。失敗時は両側を破棄して先行診断とcleanup責務を保持する。途中のhandleや本文を外へ返さず、frame／jobを新たに起動して取り直さない。

## 5 OM-Bがない段階の内容照合

初期の比較は**親処理後manifestの内容照合**だけで、合法finalize全体の証明ではない。OM-Bの計数／finalizeモデル、RD-Cの同job応答がない間は、次を固定subsetとして扱う。

- metadata／retrieval／analysis rejected／元omitted／retainedと、既に証明したParentOmittedSlotは、state・ID・reason・asset_type等を全て保持する。
- keepのreviewedはapplicable_rule_idsとresult全fieldを元private本文に比較する。object key順だけは無視し、array順・文字列code unit・数値（Object.is相当）・null・field有無は一致させる。
- manifestに対する**新しいfinish側omissionは全て拒否**する。必要warningがあることや、RD-B03が許す局所変換を、内容不一致の救済に使わない。
- schema／header／集合／元時刻に不一致があれば非実行matchも返さない。上位codeは既存固定失敗／共通停止だけを使い、内部のunsupported理由とasset.reasonを混同しない。

このsubsetで全本文が一致しても、実finalizeがH=B−256を超えて別の行を省略するか、dedup／coverage再計算をどう行うかは未検証である。full schemaのB以内とHの省略条件は別。比較成功を合法finish・全gate・candidateへ昇格させない。初期successのchecked_scopeはparent_manifest_content_only等へ限定し、finalize_model／job_origin／runtime_transport／whole_run_budgetを未保証として残す。

OM-B成立後にだけ、同元manifest・固定Eから計算したFinalizeOmissionTraceを別型で受け、モデルが選ぶ省略対象・順序・counts／coverage・limitations／errors全体へ比較範囲を広げる。旧診断matchへ後からflagを足して昇格しない。最終送信結果に現れないworker内部の省略前本文を、omittedの値やhashだけから証明したとは言わない。

## 6 同じJSON文字列からのfull検証と局所view

比較要求とdeliveryはclaimを別にし、raw文字列を受け取る前に同ownerの一度限り要求へ結ぶ。strict envelopeの項目・上限は比較専用の固定契約とし、callerが任意のjob／origin／acceptedを同梱しない。元JSONをpinした後にrequest／manifest／deliveryを一度取り外す。

1. pre guardと同seal／accepted終端slot・元plan／新frame・source／cleanup未開始を照合する。
2. 同json文字列をCG-Aでbounded decodeし、0.2／0.3を元headerへ照合してanyAggregateReviewSchemaのnested refinementを含むfull検証を行う。JSON Schema構造検査だけで済ませない。
3. **同じ正規化full値**から固定allowlistでRD-B03用viewを作る。status→run_status、ended_at→E等のmappingを固定し、元S／O／T_i／U／全deadlineと同Eの範囲を既存契約で検査する。時計を読まない。
4. same private expectationと局所viewの比較、元manifestの内容比較を実行する。別JSONを再parseした成功値や独立rootのsuccessを足し合わせない。full値の未知fieldを削除して検証前に救済しない。
5. post guardと同じseal／delivery originを再照合後、限定scopeの非実行matchだけをcommitする。raw JSON・decoded一時値・pending claimを外し、固定終端／discardへ進む。

RD-B03のwarnings各≤200文字・配列≤100件・二入力node／文字費枠やanalysis_complete=false等は維持する。full schemaなら適合するが局所viewでは扱えない値はunsupported／limitで止め、切捨てや黙ったcap拡大をしない。full schemaの「不完全なのにtrueは不可」と、finalizeの実際の再計算は別に扱い、coverageの不一致を正当化する新規則は追加しない。

## 7 終了と診断の保持

source close／cleanup開始・取消／全deadline・hard・固定discardで、mixed draft／決定／元capture／移譲先seal／comparison delivery／matchを同期失効する。旧ownerに値が残る二重保持を終端後まで続けない。現在のOM-CのdiscardDecisionは全ownerの固定終端なので、移譲前に個別discardして残りを再構成する経路は作らない。

acceptedのterminal-only責務とsource／worker両終端の確認は既存kernelに残す。元scalar count・最初のhardとHTTP／worker／cleanup診断を消さず、late cleanupは診断だけ更新する。正常cleanupとcandidate終端後の寿命は後続RD-Dの別責務であり、この比較matchをcandidate終端証拠へ流用しない。

diagnosticは固定state／stage／reasonとcountのみ。ID・時刻・body／findings・prefix本文・handle・raw例外を出さない。JS heapの物理消去は保証しない。未知の外部reasonをそのままMCP codeへ出さない。

## 8 費目所有と未導出の上界

選択row／mixed slot／capture／decisionは各100以下。元本文の保持枠と一時decode／schema copyの枠は別で、最終aggregate Bを元全captureの合計上限へ流用しない。

| 費目 | 所有者と確認条件 |
| --- | --- |
| origin／prefix供給 | 新assemblyの固定issuer。分類／payload終端／同wire・初期pin／後段delta検査、各claim・索引・guardの費用 |
| 親決定 | mixed cursor owner。OM-A再計算・prefix copy／schema／serialize／freeze。OM-Cの最大5050 asset分再計算を無料化しない |
| 同accepted／plan移譲 | private seal継続。元pin／plan再projection・所属／集合／元値照合・取外し／dest commit・失敗clear |
| full受信／比較 | delivery owner。元文字長／UTF-8長・decode・full schema・view生成・RD-B03二入力検査・full body比較 |
| 終了 | 各ownerの固定終端。body参照／pending／claimの破棄、accepted終端確認、late cleanup診断 |

同budget／stopの供給元と費目台帳を一つにする。guard数やhelperの局所usageだけで総work／heapを計測したとは言わない。同期schema／deep比較の中断粒度・copyピーク・canonical budget leaseへの接続はUnknown。元全60秒・210試行・C/G/P／retryを増やさず、枠不足は停止する。再取得・再解析・再finishで救済しない。

## 9 合成受入条件

- reviewed keep／parent omit／metadata／retrieval／analysis rejected／元omitted／retained末尾の混合集合、元capture保有数と出力reviewed数の違い、真のゼロcaptureを独立表で確認する。
- 親OM-Aで超過した後に収まる行、元omitted前後のwarning差、errors99／100、重複warning、初期prefixと後段deltaの順序・不足・捏造を対照にする。
- 別owner／同ID別receipt／captureとdecision入替え／コピー／summary、未発行／二重／競合／期限後／失効後移譲を拒否。旧root／旧handleは変えない。
- seal取外し後の各pre/post取消・再入・throwで両側のpending 0、先行hardとcleanup責務保持を確認。partial sealを公開しない。
- full bodyのissue／impact／recommendation／sources／required_follow_up／target hash／findings順の単一変更を検出し、同contextのまま空findingsや別本文へ差替えられないことを確認する。
- OM-B前は新たなfinish omittedを全件拒否。OM-B後はモデルの対象・順序・副作用と違う省略を拒否し、内容不一致をomittedへ変換して救済しない。
- 同jsonからfull検証・固定局所view・E・body照合を行い、不正full schema、別版、counts／coverage／selection差、B・局所上限の境界でも各stageを省略しない。
- 旧OM-C／NR-C／CG-B／RD-B03／通常worker試験を維持し、新factory／brand／consumerはpackage非同梱、seeded runtime／I/O／clock／worker／漏出の負の対照を実施する。

以上はOM-D全体の接続試験計画。OD-Aの実施済み範囲だけを§11と検証記録に分離し、後段の保証は未成立とする。新たな実transport／実worker／PDIを使わない。

## 10 最初の実装範囲

| 分割案 | 実装対象 | 成功しても開かないもの |
| --- | --- | --- |
| OD-A | 新合成assemblyのstrict mixed slot／prefix段階型・生成／消費claimと同row／receiptの結合。親省略と元omittedを分離 | 同accepted採用・比較・candidate |
| OD-B | [詳細設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_ODB_TRANSFER_DESIGN.md)の同生成元供給・同kernelでの同accepted／planと内容slot一度移譲、失敗時破棄・終端責務保持。設計のみ | finish job・full gate・runtime |
| OD-C | 同comparison deliveryのCG-A→固定view→局所／元本文照合。OM-Bなしでは新finish省略拒否の非実行matchだけ | 合法finalize証明・ContentGateComplete・候補 |
| OD-D | OM-Bの計数／finalize証拠とRD-Cの同job origin成立後に、合法変換・最終gateの統合を別途具体化 | 不足証拠のflag昇格・本番cap／全体受付 |

未確定：開始prefix／後段deltaの固定発行owner、混合slotと既存pinsの生成順、元の配列順を保持するprojection、同budget／停止の供給、移譲途中の終端責務、full値から局所viewの固定型と上限、OM-B／RD-C未成立時の限定結果の型。これらを型・試験で固定してから各段階を実装する。

draft-0.1はMD化だけ。続くOD-Aの実装範囲は以下に限定し、旧拒否条件・実接続・実通信・実機操作・設定変更・token／Permit／候補発行・Pushは変更しない。

## 11 OD-A：fresh合成slotとprefix段階の実装

[新assembly](../tests/support/review/synthetic-omd-slots.ts)と[合成試験](../tests/review/synthetic-omd-slots.test.ts)をtests配下へ追加した。既存OM-C／NR-Cのfactory・台帳・APIは変更しない。同じfixture DATAから二つ生成しても、それぞれのrow／receipt／prefix／slotは別identityである。

### 11.1 受付と由来の範囲

固定kind・model_id・schema_version・selected・prefix・rowsだけを受け付け、OM-Aのbounded DATA投影とstrict state×producer検査へ接続する。selectedは1〜100件・一意sys_id昇順、retainedは連続末尾。0.3のdeleted拒否・各reason・元worker omittedのvariantを維持する。reviewed同士のinstance binding／Update Set／release値の不一致もconstructorで拒否する。空集合は空manifest証明ではなく受付拒否。

constructorは全original値とOM-Aのtraceを一度pinし、各行へ新しいopaque rowとreceiptを発行する。外部row／receipt／capture／runtime ownerを登録する口はない。**元の実row／input／job／wire由来やOM-C captureの採用を保証しない。** 元reviewed DATAを保持したprivate slotと既存capture証拠は別物であり、summaryにもexisting_row_receipt等を未保証として残す。後続OD-Bで必要な同accepted／planのpins供給は未接続。

### 11.2 状態とclaim

| 操作 | 一度限りの入力・状態 | 成立後だけ公開するもの |
| --- | --- | --- |
| begin | constructor内の開始claimを占有、pre／post guard | InitialMixedPrefixとinitial段階 |
| generate | 同cursorのrow＋receipt・initial／parent prefixを先に消費、行の生成claimを占有 | MixedSlot。次prefixはprivateに保持 |
| consume | 同row＋receipt＋生成済みslotを先に取外し、private original参照・未消費・cursorを検査 | ParentMixedPrefix、最終行ならCompletedMixedPrefix |
| discard／source close／cleanup開始／hard | 全private元値・prefix・slotを同期破棄 | 件数と固定診断のみ。cleanupは別sinkで一度だけ確定可能 |

rowが違う同receipt、同IDの別assembly、コピー、別段階prefix、二重begin／generate／consume、順序違反・生成中の次生成を拒否する。生成／消費にはpre／post guardを置き、post stopをbinding不一致より優先する。再入が内部で握り潰されても先行失敗を保持し、claimを復活させない。失効後のlate cleanupは診断だけで、slotやprefixを再生成しない。

private slotはkept_reviewed／parent_omitted／original_worker_omitted／metadata／retrieval／analysis_rejected／retainedの7種。親省略だけは同rowの元reviewed DATA参照を保持する。元worker omittedから本文やfindings数を作らない。最終段階は非実行のprefix完了であり、manifest seal／empty-reviewed proof／正常worker終端／候補ではない。現在の唯一の出口は固定discardまたは同期失効である。

### 11.3 prefixと費目・未対応

開始prefixは合成fixture DATAだけ。任意のpost-loop delta登録は拒否し、元runの後段originを受ける口は追加しない。OM-Aが同全original列から作った固定traceに従い、consume成立後だけcursor／保持finding数／limitations・errorsの順序と重複を進める。親省略後も次に収まる行はkeepでき、元omittedによるresponse_truncatedの先行も維持する。

OD-Aはconstructorでbounded全列投影／OM-A値モデルを一度実行し、generate時に同traceの増分からprivate次prefixを作る。OM-Cの全履歴再計算を追加で繰返す方式ではない。元全値保持・投影／schema copy・trace・行／receipt台帳・prefix配列copy・操作ごとのpre/post guard・失敗時clearは追加費目であり、元100行の上限だけで総work／heapを証明しない。同canonical budget／stopへの接続・中断粒度・総費用はUnknown。guardは注入fakeであり、元60秒・210試行・実C/G/P会計は更新しない。

同accepted採用・OD-Bのprivate値移譲、OD-Cの比較、OM-B／RD-C・全体受付は未成立のまま。[OD-A検証記録](E2E_BEST_PRACTICE_OMD_SLOTS_ODA_2026-11-03.md)に初回失敗・修正と確認範囲を記す。

## 12 OD-Bの供給と移譲契約

[OD-B詳細設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_ODB_TRANSFER_DESIGN.md)で、一つの新constructionによるpins／混合元列の供給、同private kernelの一度限りcommit、順序付きprefixと固定soft／verify deltaの対応を具体化した。standalone OD-Aのhandleや旧rootを後付け登録せず、accepted受理で消費したrouteも再生しない。

正常系のacceptedTerminationとhard失敗時の解放未解決・cleanup診断は別に扱う。現kernelのhard clear後に通常のsource close／accepted discardが使えるとはせず、終了未確認を正常完了へ変換しない。OB-02〜03は設計段階であり、accepted採用以降を実装済みとはしない。

同設計§11のOB-01では、既存kernel module内の別factoryにstrict DATA・OwnedMixedSupply・同pins／行対応・一度限りのprepareを実装した。prepared値は非実行で、同handleの固定discardと同期失効だけを持つ。accepted採用・移譲先seal・固定delta・内容比較は未接続。[OB-01検証記録](E2E_BEST_PRACTICE_OWNED_MIXED_SUPPLY_OB01_2026-11-03.md)参照。
