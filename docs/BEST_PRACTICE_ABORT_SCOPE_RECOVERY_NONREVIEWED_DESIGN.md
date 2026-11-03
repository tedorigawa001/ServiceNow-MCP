# 回復finish 非reviewed受領物・発行元・ゼロcapture 詳細設計

Version: br006-recovery-nonreviewed-draft-0.6 / Date: 2026-11-03。
Status: **NR-A／Bに加え、NR-Cの新合成constructor限定の混合manifest・reviewedゼロ件と同accepted／plan接続を実装。旧root・実originの証拠発行・finish job・親省略は未接続。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

基準HEAD: `0ed7d91`。[内容gate](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_CONTENT_GATE_DESIGN.md)§3・7・12〜13と[RD-C](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_JOB_RDC_DESIGN.md)からの差分案。CG-BP1の現受付はreviewedが1件以上のreviewed／not_processed planだけであり、本書によって受付を広げない。公開JSON・既存契約・元60秒・受信枠・会計は変更しない。

## 1 根拠と分離原則

現状の根拠は[assetOutcomeStructureと集約refinement](../src/review/aggregate-schema.ts)、[adapter](../src/review/update-set-adapter.ts)、[worker](../src/review/review-worker.ts)、[finish pins](../tests/support/review/synthetic-finish-pins.ts)、[局所context検査](../tests/support/review/synthetic-finish-context-values.ts)。§2〜8は設計案、実装範囲はpure値層§9・fresh合成issuer§10・混合接続§11。実originの証拠発行や実機検証の成功を主張しない。

- assetのstateだけから発行元を推定しない。同じrejectedでもmetadata分類・payload上限・worker解析で発行元が異なる。
- AcceptedNonReviewedは「そのstateの結果を同じイベントから受理した」証拠であり、未受信のreviewed本文・解析成功・findingの不存在を証明しない。
- not_processedは受理済みanalyze結果ではなく、未処理inputと固定停止判定の証拠。別型にし、AcceptedNonReviewedへ混ぜない。
- 親でreviewedを受理した後のomissionには元captureが存在する。workerから最初にresult_omittedだけが届いた場合とは別の型・寿命・claimにする。
- 原則は同receiptだが、payload／worker inputが存在しない行では**元のselection row receipt**へ結ぶ。存在しないinput receipt・job・T_iを作らない。

## 2 状態×発行元の保持／拒否表

各variantは既存schemaの全fieldをstrictに保持する。reasonは自由文字列にせず、既存enumと下表の固定producer条件の両方を満たす必要がある。schemaに存在しても固定producerが現状生成しない組合せは初版では未対応拒否とする。

| 外向きstate | 唯一の発行元案・保持値 | 不足／混入時の扱い |
| --- | --- | --- |
| not_applicable | adapterのmetadata分類継続。元rowのaction／name・要求ruleから固定classify相当の判定。ID・asset_type・reason全部 | worker応答としては拒否。任意のasset_typeやno_requested_rulesを自己申告できない |
| skipped_deleted | 同metadata分類継続のDELETE判定。ID・deleted_asset | 0.2だけで検討。0.3 review_targetsでは既存refinementどおり拒否し、deletedを別stateへ変えて救済しない |
| rejected（metadata） | unsupported_action／identity_mismatchの固定分類。ID・reasonと元row origin | worker由来へ付替え不可。現在の分類ロジックと独立oracleの一致が必要 |
| rejected（payload上限） | adapterが同payload取得のpayload_limitを固定写像した継続。ID・reason | schema適合だけでは発行しない。別attemptの失敗・単なるcaller例外からは不可 |
| rejected（analysis） | 同analyzeのprivate envelope／job／input receipt。ID・workerのrejected reason | CG-Aの同JSON文字列検証、相関・pre/post guardが必須。workerが生成可能なreason契約との不一致は拒否 |
| retrieval_failed | 同source／payload attemptまたは取得値検査の固定写像。ID・reason | 現adapterのpayload_unavailable／missing_required_field／changed_during_reviewを初期範囲とする。schemaだけにあるunauthorizedを自動で有効化しない |
| result_omitted（worker analyze時点） | 同analyze応答のresult_omitted／response_limitを受理した継続。元job／inputとID・reason、本文captureなし | worker内でどのstateやfindingsから省略されたかは推測しない。reviewedへの昇格や空findingsの捏造は不可 |
| result_omitted（親受理後） | OriginalReviewedCapture＋後続CG-CのParentOmissionDecision。ID・reasonと元captureの連鎖 | AcceptedNonReviewedへ格下げしない。変換証拠が未実装の間は接続拒否 |
| not_processed | 未処理input／rowの固定停止継続。ID・reason・送信状態／旧世代終了証拠 | 独立のRetainedNotProcessed。完了結果・本文受理済みとはしない。返答がなかったことを任意boolで申告できない |

not_processedの既存JSON enumにはdeadline以外の予算・認証・権限・上流停止もあるが、本SR-Dのsoft回復へ全てを追加する承認ではない。初期接続は既存回復契約のdeadline_exceededに限定する。他reasonの通常adapter結果を改変せず、回復接続ではunsupportedとして停止する。hard取消・全体deadline・終了未確認をnot_processedへ変換してpartialに救済しない。

## 3 内部型・private発行slot

以下の名称は提案であり、公開constructorや既存型へのverified flag追加ではない。

| 型案 | private内容／発行継続 | 寿命・拒否 |
| --- | --- | --- |
| ClassifiedNonReviewed | classification origin、selection window／row receipt、固定要求rule、strict not_applicable／skipped_deleted／metadata rejected | fresh合成metadataイベントからのみ。input／jobなしはnullではなく型上absent |
| RetrievedNonReviewed | 同rowとsource／attempt／用途、失敗または値検査origin、strict retrieval_failed／payload_limit rejected | attemptの一度消費とtyped cleanup／取得終端の整合が前提。異なる用途・未確認終端を代替証拠にしない |
| AnalyzedNonReviewed | 同旧frame／job／id／input receipt／T_i、private delivery origin、strict rejected／元result_omitted | envelopeをpre-guard前に取り外し、同bytes検証後のpost-guardでだけ発行。rawを外へ返さない |
| AcceptedNonReviewed | 上記3型の閉じたunionと受理origin。共通owner／run／session／source／auth／budget／release／windowと同rowに結合 | producer tagのない汎用factoryは作らない。worker／metadata／retrievalを互いに差替え不可 |
| RetainedNotProcessed | 同未処理receiptまたはrow、固定停止origin、未送信／sent-terminalの区別と必要な旧世代終了証拠 | 新たなT_i・analyze jobを作らない。sentで終了未確認なら回復停止 |
| OutcomeManifestSeal | selectedの固定順と、ReviewedCapture／AcceptedNonReviewed／RetainedNotProcessedのprivate slot参照 | 同accepted／planへ全体を一度移譲する。本文入りと本文なしを型で区別 |
| EmptyReviewedManifest | 同OutcomeManifestSealに対するreviewed capture件数0の固定partition検査結果 | 汎用空配列／定数tokenから発行しない。非reviewedの検査を省略しない |

共通bindingは既存private生成継続から供給し、callerがowner／receipt objectを指定して登録する口は作らない。合成issuerは別root内の固定イベントからだけ発行し、runtime／fixture台帳を共有しない。既存root・RD-B04 handle・CG-BP1 summaryを後付け昇格しない。

## 4 固定順・one-shotと失敗分類

1. 同selected rowを固定順で取り出し、producer別の開始claimを一度占有する。pending worker delivery／payload終端はpre-guard前に取り外す。元row／input receiptの参照を保持し、新しい同ID receiptで置換しない。
2. 共通stop／budget ownerをpre-guardする。metadataは固定分類、retrievalは固定写像、analysisはown-data strict envelopeと同JSON文字列のCG-A検証へ進む。任意callerオブジェクトをfreezeして受領物にしない。
3. state×producer・全field・reason・ID・認証／release／selectionと、存在する場合だけinput／job／T_iを照合する。失敗は局所flagとして保持し、post-guardの停止を優先する。
4. post-guardと同originの再確認後だけ、元値のowned immutable正規化copyと別brandの空handleをprivate slotへ発行する。受理claimとplan移譲claimは別にする。
5. selectedを固定順にpartitionする。同rowは厳密に1 slot、unknown／duplicate／missingは拒否する。ParentOmissionDecision付きreviewedは元captureを保持する別variantであり、二重slotではない。
6. 同accepted／planの一度限りsealで全slotを移す。失敗・競合・取消・期限切れ・失効後は再開始／再受理／再移譲を拒否し、先行hardとcleanup責務を保持する。

型付き局所理由案はshape／binding／producer／state／duplicate／missing／unsupported／limit。上位codeは既存の固定失敗と共通停止理由だけに写像し、新しい公開MCP errorを追加しない。元asset.reasonは保存するデータであり、transportやhardの診断codeと混同しない。本文・schema issues・例外cause・資格情報を診断へ残さない。

## 5 reviewedゼロ件の判断

**設計上は許容するが、実装・受付はまだ有効化しない。** ゼロ件をcaptureの成功件数不足と同一視せず、次の全条件が揃った場合だけ専用EmptyReviewedManifestを発行する案とする。

- selectedは既存の最大100件と順序を満たし、全行が検証済み非reviewedまたは固定not_processedにちょうど一度割り当たる。
- 元reviewed受理／reviewed_originが1件もない。後から省略したreviewedがあるならゼロcaptureではなく、元captureを持つomission経路を必要とする。
- 既存soft回復条件とactive未処理input／旧世代終了・新世代ready・同receiptの連鎖を維持する。reviewedが0件でも必要verify・cleanup・full集約schema・同job相関を省略しない。
- not_processedがある回復planをcompleted／analysis_complete:trueにしない。最終statusは元headerと既存full schemaで判定し、reviewedが0という理由だけでpartial／failedを決め直さない。

selected=0／input=0、collection failedで必須active receiptが存在しないケース、未処理inputのない「非reviewedだけで終了した通常実行」は、現在のSR-D回復kernelの前提外。架空のactive receiptやworkerを作らず、本工程の回復接続では拒否する。通常adapterがその結果を返せることと、SR-D回復planとして受理できることは別である。

## 6 合法omission・finish jobへの後続境界

親省略決定証拠とfinalizeの合法変換モデルは[CG-C詳細設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OMISSION_CGC_DESIGN.md)で具体化した。元worker omittedと親受理後のomissionを別variantとし、元captureを保持したまま検証する案である。§11のOM-Aは親計算のpure値層だけ実装済み。証拠／finalizeモデルは未接続で、NR-Cの親omission拒否を解除しない。

元workerのresult_omittedは、その値が届いた事実だけを保持し、worker内部のサイズ判定を親が再現して証明したとは言わない。親受理後の省略にはCG-Cで元capture・固定finding予算順序・省略判断・warning／error副作用が必要。finalizeのfinding／byte省略はさらに別モデルとする。

finish応答で非reviewedのstate・ID・reason・asset_type等を変えること、元omitted→reviewed、未処理→解析済みへの昇格は不可。元reviewed→omittedだけは別の合法変換証拠がある場合に後続で検討する。省略の見かけが同じでもproducerを消さない。

本書のsealはfinish jobを起動・送信しない。後続RC-A〜Cで同新frame／job／idへOutcomeManifestSealを一度移し、同response originからfull検証・内容比較する。非reviewedだけでもschema／時刻／集合／error／limitationsの検証を省略せず、候補factoryを先に作らない。

## 7 費目所有・失効・解放

| 費目 | 所有者・有限構造／未導出 |
| --- | --- |
| 選択行とproducer検査 | 既存window／row ownerと各固定issuer。selected合計100以下。元sourceのbounded metadata前提を再利用し、任意の追加rowデータは保持しない |
| worker結果 | 同analysis受理owner。CG-Aの元B=262144と同文字列decode／schema copy。正規化非reviewed値は固定fieldの小さいvariantだが、実heap費用0とはしない |
| metadata／retrieval値 | 対応する固定owner。既存schemaのID・enum・必要asset_typeをowned値へ一度正規化し、schemaにない自由記述を足さない |
| partition／seal | 同accepted／plan owner。最大100 slot、元receipt索引・variant・originを保持。索引の移譲と本文graphのcloneを区別する |
| guards／discard | 同共通owner。発行pre/post・sealpre/post・claim・比較・clearの費用を別計上し、元C/G/P prefixへ紛れ込ませない |

取得・解析をこの検査のために再実行せず、元T_i／UやS／全deadlineも再採取しない。同期検証の中断粒度・総work／allocation・正規化copyの保持ピークはUnknownで、受付無効のまま。既存局所10,000 node／文字費262144枠に全nonreviewed集合を無条件に押し込めたり、上限を超えた行を削って通したりしない。

source／cleanup開始、hard、close、準備／世代／plan／acceptedの固定discardでpending・受理値・seal参照を同期に外す。正常解放時もacceptedのterminal-only責務とsource／worker両終端の固定確認は維持する。late cleanupは診断だけで、消費済みslotを復活させない。raw payload／codeは保持・表示せず、JS heapの物理消去も主張しない。

## 8 合成受入条件・実装順案

1. **NR-A：strict variantとpure検査（§9の値層のみ実装済み）**。state×producerの表、元omitted／親omittedの別型、必須／absent field、未知reason／余分field、bounded統計を独立oracleで照合する。この段階では証拠を発行しない。
2. **NR-B：fresh合成issuer（§10の単独rootを実装済み）**。metadata／retrieval／analysisの固定イベントと別claimを接続する。同row／存在する同input・job・T_i、pre/post guard、コピー／別root／二重生成／混入／失敗後再利用拒否を検査する。
3. **NR-C：混合manifest・reviewedゼロ**。CG-BP1の別rootからpartition・同accepted／plan一度移譲・ゼロ証拠・同期失効／固定discardを接続する。旧root／旧試験は維持する。

必須対照は、同じrejectedを別producerで発行、workerからmetadata state、別attemptのretrieval失敗、応答未受信からomittedの捏造、schemaだけにあるunauthorized、hard停止からnot_processedへの格下げ、missing／duplicate／順序入替え、親省略後のcapture削除、ゼロ件tokenの再利用、0.3のdeleted、各guardの取消／期限／再入／未知例外。元時刻・会計prefix・必要verify／cleanup回数の不変、秘密非出力、package非同梱とseeded混入検出も維持する。

未確認事項：producer別reason allowlistの固定方法、選択row receiptと現input receiptの型対応、worker受理時点の元omittedのterminal claim、metadataだけの行と未処理inputのpartition接続、既存局所schemaとの互換・追加費用。各実装前に対応sourceと合成oracleを再照合し、unsupportedを暗黙に受理へ変更しない。

初版はMDのみ。NR-Aは§9、NR-Bの合成発行は§10。実originの証拠発行・実接続・実通信・実機操作・設定変更・本番cap／Permit／候補発行・Push・担当者への連絡は行わない。

## 9 NR-A strict値層の実装契約

基準HEAD: `84c3461`。[合成専用pure値層](../tests/support/review/synthetic-recovery-nonreviewed-values.ts)はissuer・owner・claim台帳を持たず、次の3 runtime exportだけを持つ。追加type exportのSyntheticNonReviewedValuesも証拠型ではない。

- RECOVERY_NONREVIEWED_VALUE_LIMITS：nr-state-producer-v1、値root=0の深さ2、object key数4、訪問node16、string／keyのUTF-16長×3合計1024。1値ごとの局所枠であり、混合manifest全体の受付枠ではない。
- projectSyntheticNonReviewedValue(raw)：own-dataをboundedにcopyし、strictな`{schema_version,producer,outcome}`を検査する。parent_omissionだけは`original_state:reviewed`を追加必須とし、他producerでは拒否する。0.2／0.3を値として受けるが、0.3のskipped_deletedはunsupportedで拒否する。
- NonReviewedValueError：shape／limit／unsupportedを固定理由として返し、code／messageはinternal_review_error。raw本文・Zod issues・causeを保持しない。

producerはmetadata／retrieval／analysis／parent_omission／retainedの閉じたunion。metadataは固定2 rejected理由、deleted、およびasset_typeと理由の整合するnot_applicable。retrievalは固定3 retrieval_failed理由とpayload_limit rejected。analysisは現固定ソースとasset schemaの双方が扱う26 rejected理由、および元result_omitted。retainedはdeadline_exceededだけ。parent_omissionはresult_omittedの**非実行draft**であり、OriginalReviewedCapture／ParentOmissionDecisionを持つ証拠ではない。

解析器が返し得るinvalid_result_contextは現assetOutcomeStructureのrejected enumにない。workerではasset parseに失敗してok:falseとなるため、NR-Aでも拒否し、公開schemaやworker動作を拡張しない。schemaにあるunauthorizedをretrievalへ追加することや、既存JSON enumの他not_processed理由を回復へ追加することもしない。reason一覧は固定snapshotで、ソース変更時は独立AST oracleとmodelを再確認する。

返却値は深くfreezeしたcallerデータの正規化copyと局所usageを持ち、caller objectをfreezeしない。categoryはnonreviewed_value／parent_omission_value／retained_valueの別型、scopeはsynthetic_nonreviewed_values、authorityはnone、validation_scopeはstate_producer_values_only。producer_origin／receipt_binding／decision_origin／original_capture／cleanup／manifest／runtime_transportは全て未検証と明示する。DATAのoriginal_stateやproducerが正しい形でも、実際の由来や元captureを証明しない。

getter／Proxy／特殊prototype／array／symbol key／不正primitive／上限超過を拒否し、callbackや時計を呼ばない。この関数はJSON文字列をdecodeせず、同wire・実受信量・job／T_i・metadata分類の事実を証明しない。反復呼出しは許されるpure検査で、one-shot受理ではない。receipt／job／owner／capture等の付加fieldはnullでも拒否し、任意の証拠objectを登録しない。

usageはnodes／character_units／maximum_depth／max_object_keysを同copyから収集する。native key列挙・copy・Zod正規化・freezeの総CPU／heap費用や全体60秒の中断保証ではない。全体work／memoryはUnknown。このpure値だけでは§10の合成発行originを作れず、NR-Cの混合manifest／ゼロcapture条件も有効化しない。[NR-A検証記録](E2E_BEST_PRACTICE_RECOVERY_NONREVIEWED_NRA_2026-11-03.md)参照。

## 10 NR-B fresh合成issuerの実装契約

基準HEAD: `912144c`。[合成issuer](../tests/support/review/synthetic-recovery-nonreviewed-issuer.ts)はconstructorごとに独立した台帳を作る。実session・既存root・外部receiptを登録する口を持たず、runtime／fixtureの台帳を共有しない。共通closureが合成owner／run／windowの所属を表し、元row handleと各input／attempt／jobはそのclosure内だけで生成する。実auth／ReleasePermitへのbindingではない。

### 10.1 constructorとproducer別入口

入力はstrictなkind／schema_version／requested_rule_ids／rows。rowはsys_id／name／action／固定producerで、analysisだけに固定retrieved_atを必須とする。IDは一意・昇順、最大100件。metadataは固定分類で終わる行だけ、retrieval／analysisは分類を通過する対象行だけを受ける。row name≤200／action≤40は既存metadata枠を維持し、任意のoutcome／job／owner fieldを足せない。own-dataをbounded copyし、注入同期guardを一度pinする。後書換え・getter／Proxyを受けない。

| producer | 固定操作・claim | 受理と発行 |
| --- | --- | --- |
| metadata | issueClassifiedで同rowの発行claimをpre guard前に消費 | action／name／固定要求ruleから現classify相当を決定し、NR-Aとpost guard後だけClassifiedNonReviewedを発行。input／job／T_iを生成しない |
| retrieval | beginRetrievalの開始claim、settleRetrievalの終端claim、issueRetrievedの発行claimを分離 | 同rowのinput／attempt／cleanup sinkを生成。同input／attemptの固定errorまたはinvalid_timestampイベントを写像し、cleanup confirmedとpost guard後にだけprivate terminalを発行。terminalを一度取り外して再照合・発行 |
| analysis | beginAnalysisの開始claim、deliverAnalysisの受信claim、issueAnalyzedの発行claimを分離 | 同rowのinput／job／連番idを生成。strict envelopeを同idへ相関し、元json文字列をpin。発行前にdeliveryを取り外し、CG-A同文字列検証・ID・producer／NR-A適合とpost guard後だけAnalyzedNonReviewedを発行 |

retrieval eventはerrorのnot_found_or_not_visible／invalid_response／changed_during_review／payload_limit、またはinvalid_timestamp。固定写像はpayload_unavailable／missing_required_field／changed_during_review／payload_limitで、cleanupはconfirmed以外なら発行しない。callerがasset.state／reasonを指定する汎用入口はない。analysisの非reviewed応答はrejected／元result_omittedだけ。既存schemaの他stateや親省略draftを受理しない。元T_iはconstructorの同analysis rowへpinし、clockで再採取しない。

同rowにclaimは各1回。別producer・別row・別root・コピー・別input／attempt／job／id／terminal／deliveryの混入を拒否し、失敗後の再開は不可。NR-Bは各rowの発行を担当するだけで、集合全体の固定順partition／同accepted／planへの移譲はNR-Cへ残す。親省略・retainedのissuerやmanifest操作は公開しない。

### 10.2 guard・失効・diagnostic-only cleanup

各操作はclaim消費→pre guard→局所検査→post guard→発行commit。局所のschema／相関失敗でもpost guardを通し、その停止と先行hardを優先する。guard再入をcallerが捕捉しても失効は戻らない。発行handleは空の別brandで、本文／private値のgetterはない。

hard／discardでrow slot・pending terminal／delivery・発行値の参照を同期に外す。discardEvidenceは同rootの発行済みhandleを一度消費し、同rowの再発行claimを戻さない。retained raw jsonは発行成功・失敗・discardで外す。JS heapの物理消去は保証しない。

retrieval cleanupの確認は**同attemptの合成イベント**であり、native close／cancelの実証拠ではない。開始後のpending sinkには、失敗・discard後もrecordCleanupで1回だけfixed診断を記録できる。cleanup単独の確認からterminalを作れず、unconfirmedを後からconfirmedへ替えて発行を再開できない。worker終了証拠やacceptedの終端責務は本rootでは作らない。

summaryは固定scope／authority:none、最初のcode／reason、producer別累積発行数、既存enumだけのstate／reason集計、pending数、合成input／job数、cleanup pending／unconfirmed数のみ。row ID・name・T_i・raw body・例外causeを含まない。runtime_origin／native_cleanup／manifest／whole_run_budgetは未保証とする。

### 10.3 有限枠・費目と未接続

- constructor copyは深さ4／object key8／array100／node2000／UTF-16文字費262144。normalized row・rule／versionを保持し、caller rawや元row配列の参照は保持しない。
- row・evidence・terminal・delivery・cleanup台帳は各100以下、input／jobは各rowで最大1。analysisの同jsonはCG-AのB=262144を維持し、100 pendingなら論理bytes和だけでも26,214,400 byteになり得る。
- 操作ごとの2 guard、固定分類／写像、own-data envelope、CG-A decode／copy／freeze、NR-A projection、索引・handle、clearは別費目。metadata発行は2 guard、retrievalとanalysisの基本3段階は各6 guard。元C/G/P prefixや全60秒の期限を延長・更新しないが、総work／heap費用を0とは扱わない。

実transport／実worker・実auth／ReleasePermit、CG-BP1の元receiptとの結合、混合manifest・reviewedゼロ件、親省略・合法omission、finish job／candidateは未接続。全体受付無効・Unknownを維持する。[NR-B検証記録](E2E_BEST_PRACTICE_RECOVERY_NONREVIEWED_NRB_2026-11-03.md)参照。

## 11 NR-C 混合manifest・reviewedゼロ件の合成接続

基準HEAD: `d93908c`。§10.3末尾はNR-B時点の未接続事項であり、本節が新合成rootの差分を定める。[private root](../tests/support/review/synthetic-pinned-recovery-root.ts)のcreateSyntheticMixedRecoveryRootだけが混合集合を受ける。旧pinned／captured rootのAPI・min1／reviewed限定契約・診断は変えず、旧handleを登録・昇格できない。新rootには旧structure-only／captured sealを公開しない。

### 11.1 同constructorのpartitionと供給

同じconstructから作ったprivate pinsのselected・outcomes・input receiptを使う。全selected行に新しい選択行receiptを付け、outcomeは元の参照、inputが存在する行は元のinput参照を保存する。selected順の完全partitionでreviewed＋nonreviewed＋retained＝selectedを要求し、重複・missing・順序差・余剰eventを拒否する。処理済み行には固定順のeventをちょうど1個、not_processedにはeventを渡さない。

| 行 | 新rootの供給・照合 |
| --- | --- |
| reviewed | context／元JSON応答をCG-Bへ渡す。元receipt・accepted outcome・ID・T_i・対象・release・ruleと同じでなければ拒否 |
| metadata | 固定row分類をNR-Bで再実行。inputが存在すれば拒否し、選択行receiptへ結ぶ。input／job／T_iは作らない |
| retrieval | 同rowの合成attempt・cleanupから発行。元inputは任意だが、存在時はcompletedかつanalysis contextなし。元outcomeのstate・reason全体と比較 |
| analysis | 元completed input・非null expected_context・同T_iが必須。同rowの合成jobと元応答JSONから発行し、元outcome全体と比較 |
| retained | 元not_processed inputが必須でdeadline_exceededだけ。既存回復kernelのplanへ保持し、新issuerは作らない |

元workerのresult_omittedはreviewed_origin:nullだけをanalysisで扱う。親がreviewedを受理後に省略するvariantは、元capture／省略decisionの接続が未完了なので拒否する。0.2／0.3を既存strict pinsで検査し、0.3のdeleted拒否を維持する。

NR-Bの通常issuerにmanifest入口は追加しない。別のconstructor-only supplierで、privateに発行した全evidenceを一度取り外し、元pinsから作ったstrict期待値へ固定row順で比較する。pending terminal／deliveryや未確認cleanup、未発行／discard済み行があれば停止する。supplierの返すopaque manifestには値getterがなく、旧証拠handleを外から登録できない。

### 11.2 seal・ゼロ証明・失効とdiscard

sealMixedRecoveryFinishExpectationはclaimを先に占有し、同accepted／plan／handoffの既存kernel sealを実行してからpartitionを再照合する。CG-B captureとNR-B supplierを一度だけ消費し、post guard後に新しい別brandの空handleを公開する。局所不一致・コピー・別owner・二重seal・余分な引数は停止し、部分manifestを公開しない。

reviewed=0でも検査を省略しない。同planと全選択行receiptに結ぶprivate empty proofを新root内部で作る。汎用の空配列tokenや外部summaryから証明を作れない。全件retained・eventゼロは元active inputと既存old closure／新世代ready／accepted検査が通る場合だけ受ける。selectedゼロ、active inputなしは従来どおり拒否する。

sealの固定guardはkernelの2点＋partitionのpre/post2点＋reviewedがある場合のcapture2点＋nonreviewedがある場合のsupplier2点（最大8点）。全点で取消／期限／共通停止と再入を検査し、先行hardを保持する。busy中の変更操作の再入を捕捉されても再開しない。summaryは固定countとstate・authority:noneだけであり、権限・manifest・再利用可能なreceiptを表さない。

source close開始・新世代cleanup開始・hard・preparation／plan／acceptedの固定discardで、capture・supplier値・partition link・seal参照を同期に外す。countだけ診断に残す。既存acceptedのsource／worker終端責務は免除せず、late cleanupは診断だけ更新できる。JS heapの物理消去は保証しない。

### 11.3 有限枠・費用・残課題

selected／event／row／link／manifestは最大100、各入力のown-data／strict検査と既存copy上限を維持する。metadataのinput捏造やretainedへのanalyze eventは拒否する。constructor時のpins生成・partition走査／input検索、producer別発行、NR-A投影、CG-B検証、manifest索引と比較・Map移動用copy、opaque handle、guard・clearが追加費目。最大100件なので走査は有限だが、総work／heap費用の証明ではなくUnknownのままとする。C/G/P prefix・retry・60秒・210試行の本番契約を更新しない。

finish jobへの移譲・full finish内容gate・親省略decision・合法omission・runtime binding・実cleanup証拠・candidate発行は未接続。npmの配布物から新root／supplier／brandも除外し、固定import監査とseeded負の対照で検査する。[NR-C検証記録](E2E_BEST_PRACTICE_RECOVERY_MIXED_MANIFEST_NRC_2026-11-03.md)参照。
