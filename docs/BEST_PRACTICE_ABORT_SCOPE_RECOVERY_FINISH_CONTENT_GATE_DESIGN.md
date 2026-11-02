# 回復finish 本文capture・full schema・同bytes検証gate 詳細設計

Version: br006-recovery-finish-content-draft-0.1 / Date: 2026-11-03。
Status: **設計のみ。capture／full応答gate／候補発行は未実装。合成依存限定、正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry保留を維持する。**

基準HEAD: `43223b9`。[RD-C](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_JOB_RDC_DESIGN.md)§5・7・10〜11の内容gateを具体化する。以下の型・操作・数値モデルは未実装の内部案で、本番cap・通常経路の受付変更・実通信・実機操作・設定変更・Pushの承認ではない。

## 1 「本文」と現状の不足

本書の本文は**受理済みreview結果JSON全体**を指し、ServiceNowのscript／payload本文ではない。code_return_mode=noneを維持し、ソースコードを新たにcapture・出力しない。findingsの自由記述も機微情報を含み得るものとして内部保持し、診断・ログ・summaryへ出さない。

| 現行の根拠 | 保証すること | 不足 |
| --- | --- | --- |
| [finish pins](../tests/support/review/synthetic-finish-pins.ts) | 同ID／T_i／expected_contextを持つdescriptor参照 | 元result／findings本文のsnapshotではない。名前のaccepted／originalだけで本文証拠にしない |
| [RD-B03](../tests/support/review/synthetic-recovery-finish-values.ts) | 局所context・集合・時刻・omission時のerror差分 | 本文の改変、full集約schema、同wireからの検証は未接続 |
| [実worker](../src/review/review-worker.ts) | analyze時の構造parse、finish時のfinalizeとfull集約検証、json文字列のbyte長確認 | 同親ownerのpost-guard受理captureではない。analyzeのassetOutcomeStructureだけではreviewResultV2Schemaのrefinementを全実行しない |
| [実監督](../src/review/worker-supervisor.ts) | messageのid／ok／jsonとbyte長、parse後の限定的なprotocol拒否 | 親でのfull結果検証・duplicate member検出・capture台帳はない |
| [集約schema](../src/review/aggregate-schema.ts) | nested refinement・出典／rule適用・counts／selection／provenance／制限／再serialize上限 | 元analyzeと同じ本文であること、raw jsonの元長、受信originは別証拠 |

schema適合・本文不変性・同job由来・実生存・findingの正しさは別保証である。source_approval_pending、findingのcandidate／info／low、verification_evidence空を維持し、契約検証成功をServiceNow上の正しさの確認にしない。

## 2 採用案と所有権

初期案は**固定受理継続が所有するschema-normalized結果を一度だけ保護snapshot化**する。caller objectの参照を預かってfreezeする案と、digestだけを比較する案は採らない。

| 案 | 評価 |
| --- | --- |
| callerのmutable結果参照を保持／その場でfreeze | alias・後書換え・callerへの副作用の証明がない。不可 |
| context／code_hash／payload_hashや結果digestだけを保持 | code／payloadのhashはresult本文を表さない。結果digestも発行元・full schema・omission意味を単独で証明しない。初期の主証拠にしない |
| 同受信originからdecode・full検証したowned値をprivateに保持 | 採用案。schemaの正規化copyと一時値の費用を明示し、mutable alias・getter・再serializeした別入力からの差替えを防ぐ |

full schemaのparseがcopyを作る費用は隠さない。その出力をcaptureの唯一のowned値とし、追加のJSON round-trip／任意deep cloneを重ねない。private graphを深くfreezeし、外側へ渡すのは別brandの空handleだけ。内部のrun組立ても同ownerの固定継続がreadonly viewを借りる方式とし、capture getterやpublic登録口を作らない。

これは旧親設計の「親でfindingsを複製しない」を、**任意の複製はしないが、保護された正規化copyの初期費用は必要**と具体化する設計差分である。既存mutable値を無条件にimmutableと呼ぶことで費用を0にしない。総メモリ・work受付の承認までは実経路へ投入しない。

## 3 内部型・発行元・一度限りの移譲

| 役割案 | 唯一の発行継続・private内容 | 寿命／拒否 |
| --- | --- | --- |
| AnalysisWireReceipt | 同analyze job受信。owner／run／session／source／auth key／budget／release／window、旧frame／job／id／receipt／T_i、元json originと長さ | 他job／copy／自己申告contextは不可。本文受理後にraw文字列の保持を終え、由来の内部連鎖だけ残す |
| OriginalReviewedCapture | 同wireのbounded decode・full nested検証・元context比較とpost guard後。full reviewed asset（applicable_rule_idsとresult全列）、receipt／T_i／受理origin | receiptごと最大1。失敗・二重受理で戻さない。後から応答を使って作らない |
| AcceptedNonReviewed | rejected等のfull strict variant、またはanalyze時点で既にresult_omittedだった事実 | 未受信reviewed本文を持つとは主張しない。元reason／IDを保持 |
| ParentOmissionDecision | 親のfinding上限処理の固定継続。元capture、順序と保持findings数・上限、変換後のomitted／warning／error | captureより前に判定を作らない。任意bool／caller指定理由では発行しない |
| CaptureManifestSeal | 同plan／accepted／sealed期待値へ同capture集合を一度移すprivate slot | descriptor pinとの取り違えを静的brand／slotで拒否。raw配列やsummaryからの昇格なし |
| FinishWireReceipt | RD-Cの同job・send origin・新frameに結ぶ同jsonの受領物 | pendingと一度消費。前回応答や再serialize結果を登録しない |
| FullAggregateValidated／ContentMatched | 同finish receipt由来のfull schema・元本文／合法omission比較・RD-B03結果を内部で結ぶ | 独立のtrueや検証summaryを足し合わせない。同job／origin／期待値世代の一致が必要 |

型名は案であり、現在のdescriptor／RD-B03型にverified flagを足す実装ではない。実source用とfixture用の台帳は共有しない。合成issuerはfresh assemblyの固定constructor／analyze受理イベントからだけ発行し、既存の実sessionを登録・切替するfriendを作らない。

## 4 analyze受理から封印までの固定順

1. 同job／input receiptをpre-guard前に一度取り外す。元T_i・期待contextを固定し、新しいreviewed_atやreceiptを作らない。
2. 同AnalysisWireReceiptの文字列を§5でboundedに読む。strict assetOutcomeStructureに加え、reviewedなら**reviewResultV2Schemaのrefinementも**実行する。元target／binding／release／rule／T_iとの一致はschemaとは別に検査する。
3. 不一致を局所flagへ保持し、post guardと同job／inputの再確認後だけcapture slotを公開する。失敗ならraw値／Zod issueを残さず、先行hardとcleanup責務を保持する。
4. 親のfinding上限処理はcapture確定の後。元reviewedを省略する場合は同captureにParentOmissionDecisionを結ぶ。descriptorだけを先にacceptedとして後で本文を補う経路は不可。
5. soft回復時は同receipt群・accepted起源・固定順をplanへ移す。not_processedにcaptureを捏造せず、元analyzeで既にomittedならその事実を保持する。
6. 同acceptedをsealする固定継続がCaptureManifestSealも一度移す。RD-B04の既存structure-only handleを後付けで本文検証済みに書換えない。内容gate対応の別private契約を設計し、旧fixtureは非実行check／discard専用で維持する。

旧世代の正常終了後も、受理済みcaptureは同run／plan ownerが保持する。新しいfinish frameが旧analyzeと異なることは正常だが、元receipt／受理originと新jobへ渡すplanの連鎖を要求する。旧workerの消滅を理由にraw結果を再登録しない。

## 5 同じJSON文字列・論理bytesへの結合

現プロトコルはMessagePortの構造化cloneで届く`json:string`であり、独立したネットワークbyte streamではない。本設計のwire長は**その文字列をUTF-8化した論理bytes**。IPC envelope・clone・文字列生成前のメモリ上限や実受信総量を証明するものではない。

固定受信継続はown-dataのstrict `{id,ok:true,json}`を確認し、元文字列とprivate delivery originを一度pinする。巨大文字列を新たにencodeする前に、UTF-16長がB=262144を超えるものを早期拒否する。その後、同文字列のUTF-8長をB以下であることまで検査する。短いUTF-16長でも多byte文字で超過するケースを独立に拒否する。

bytesが必要なdecoder案では、B以内と確認した後にprivate所有のUTF-8 bufferを一度作り、**そのbufferだけ**からdecodeする。mutable Uint8Array viewをcallerへ貸さない。元文字列とのround-trip不一致を拒否し、暗黙の置換文字・Unicode正規化で別データへ変えない。JSON escapeとして表された文字列値はcode unitをそのまま保持し、body比較時も正規化しない。実装時にこのUnicode方針と既存workerのJSON.stringify出力との互換性を試験する。

strict decoderは、深さ／array長／object key数／node／文字費とworkを確保前・反復前に検査し、重複memberを**escape解決後の同一key**で拒否する。last-winsで隠れた元fieldを見落とさない。plain dataをnull-prototype等の安全な格納先へ作り、accessor／Proxy／疎配列／任意prototypeを受理しない。数値は現full schemaが使うsafe integerの範囲を保ち、body比較ではObject.is相当で値を比較する。これらは回復用の新契約案で、現実監督のJSON.parseを今回置換しない。

wire receipt、decoded tree、schema正規化値、局所projectionは同じprivate originへ結ぶ。別objectをもう一度parseした結果や、検証後に再serializeした長さを元wireの証拠として受けない。後者は既存aggregate schemaが行う**出力表現の上限検査**としては必要だが、元受信bytesの検査とは別費目である。

### 5.1 full結果用の有限shape案

RD-B03の10,000 node／文字費262144は**局所context用**であり、full本文へ無条件に流用しない。full schemaに適合する大きなfindings／sourcesをその枠に収めるため切り捨てることも禁止する。

| 項目 | 初期の保守的モデル案・根拠 |
| --- | --- |
| B | 元jsonのUTF-8上限262144。既存wire制限を維持 |
| array／object | array≤100、object key≤30を各schemaに照合する。schema固有の14／20／5等の上限は後段でも適用 |
| 深さ | JSON本体root=0で、現reviewed assetは最大6、集約は最大8（assets→result→findings→sourcesの末端）。origin metadata wrapperはこの深さに混ぜず別fixed契約にする |
| node | 値nodeだけなら保守的に≤B。各nodeに元JSONの少なくとも1 byteが必要という粗い上界。keyや後段copyのnodeを無料に合算しない |
| 文字費 | decoded string／keyのUTF-16 length×3について保守的に≤3B。wire byte数やJS heap byte数ではない |

これは受付を有効化する承認値ではない。現schemaの全variant・escape・数値を独立oracleで照合し、schema拡張で証明が崩れたらmodel_idを改版する必要がある。既存局所projectionは既存枠のまま別に実行し、full schemaには適合しても局所契約が扱わない値（例：長いlimitations）を黙って短縮しない。不足・非対応はgate不成立とする。

## 6 full検証と局所比較・内容一致の順序

同finish deliveryで次を順に行う。各段階でprivate slotを一致させ、post guard前に候補を公開しない。

1. RD-Cのjob／frame／send originとstrict envelope相関。
2. §5の元wire上限・bounded strict decode。
3. schema 0.2／0.3を元sealed headerと照合し、**anyAggregateReviewSchema**を適用。公開JSON SchemaやaggregateReviewStructureだけをfull検証と呼ばない。nested reviewResultV2Schema、counts／適用rule／出典／selection／collection／release／provenance／時刻／findings上限等のrefinementを実行する。
4. 同normalized aggregateから固定allowlistでRD-B03用の局所viewを作る。run_statusはstatus、Eはended_atから固定mappingし、勝手な時刻・field省略・結果補完をしない。元のfull値は別に保持する。未知fieldを削ってfull検証を通す順序は不可。
5. 元sealed期待値と局所viewをRD-B03で比較。現PoCのsource_approval_pending・partial・finding candidate/low/info等を維持する。旧context-only fixtureはfull値を持たないため、このgateでは失敗してよい。偽の空findingsでfull値へ変換しない。
6. CaptureManifestSealの各full reviewedと応答をIDで照合。reviewedのままなら、applicable_rule_idsと**result全field**を型付きdeep比較する。object member順だけは無視、array順・文字列code unit・数値・null・有無は一致させる。既存finalizeはnested bodyを変更しないため、初期案ではnested rule配列の並替え等も許可しない。局所比較の集合同値より強い別gateであり、通常経路の受付は変更しない。
7. omittedなら§7の固定変換証拠を確認。その他stateの昇格／理由・asset_type差替えを拒否する。
8. 同capture／plan／sealed origin・job／delivery・検証済みaggregate・各検証receiptの全一致と元post guardが成立した場合だけ、後続RC-Dで候補発行を検討できる。未実装の候補factoryを先に追加しない。

JSONはデータとして扱い、review対象のJavaScriptを実行しない。full schema成功はfindingの真偽・ServiceNowの実設定／出典承認を保証せず、検証後もsource_approval_pendingを削除しない。

## 7 三つのomissionと合法変換

| 省略点 | 現行動作 | 本文gateで必要な根拠 |
| --- | --- | --- |
| worker analyze | assetを構造parseした後、serialize長がB−256を超えればresult_omittedだけを送る | 親はfull reviewedを受信していない。AcceptedNonReviewedとして元omittedを保持し、reviewed本文captureありとはしない |
| 親adapterのfinding上限 | reviewed受領後、累積findings+当該結果がmax_findingsを超えれば全結果をomittedへ変える | 変換前のOriginalReviewedCaptureと固定ParentOmissionDecisionを保持する。captureを捨ててから起源を捏造しない |
| finalizeAggregate | finding上限の順走査後、serialize量がB−256を超える間、末尾のreviewedから全結果単位でomit | 元finish入力の固定順・元body・同Eを使う独立した純粋omissionモデルで対象集合と副作用を照合する |

analyzeで既にomittedだった結果に、未到達の本文の一致を要求したり、逆に元本文が存在したと主張したりしない。元reviewedのcaptureがある場合はomissionでもその起源を消さない。元omitted→reviewed、findingsの一部削除・修正でサイズを合わせる変換は不可。

純粋omissionモデルは現[finalizeAggregate](../src/review/aggregate-finalize.ts)に合わせ、canonicalな元finish入力からfinding予算順走査→recount／analysis_complete→末尾reviewedのbyte予算省略→limitations dedupを扱う。返信Eは同deliveryの時刻検証後にだけ固定入力へ入れ、親時計は読まない。応答のbody／counts／headerを使って期待本文を組み立てない。現在時刻を採って入力を書換える実finalizeAggregateを親側で再実行する案は採らない。

各omitはstate=result_omitted／reason=response_limit、response_truncated、最初のoutput/response_limit error、errors=100ならerror_details_truncated、finding起点のfinding_budget_exceeded等を現ソースの**分岐順と条件のまま**扱う。親adapterとfinalizeは警告追加条件が同一ではないため、共通化で挙動を平準化しない。元errors prefixと最新RD-B03の追加error規則も保持する。

「必要warningがあるから任意のreviewedをomitしてよい」という局所許容だけでは内容gateを通さない。モデルが未実装・未検証なら合法omissionの全検証もUnknown。変更されたfindingsをomitして比較不足を隠す救済は不可とする。worker／adapter／finalizeの処理変更時は固定omission_model_idと独立oracleを改版し、旧modelを黙って再利用しない。

## 8 保持寿命・解放・費目

captureとwireの一度限り消費は別claimで管理する。captureは受理→同plan封印→同finish jobへ最大一度移譲し、別jobへの借用や再発行をしない。immutable値を内部比較で読むことと、authorityを再利用することを区別する。

- analyzeの元raw json／bufferはcaptureのpost-guard確定後に解放可能。由来receiptとowned normalized本文を残す。失敗時は未公開capture・一時値を破棄する。
- capture本文はfinish比較がcommitするかhard／discardで失効するまで保持する。候補成立後に元本文を解放する場合も、同jobの固定照合receiptと唯一の検証済みaggregate所有権を候補へ原子的に移す。実装前にその移譲を別途確認し、途中で責任者を空にしない。
- source／cleanup開始・hard時のpending失効、候補成立後の正常cleanupとterminal-only保持の区別はRD-C／RD-Dと共有する。遅延cleanupのconfirmedでcapture／candidateを復活させない。
- 終端／discardはraw bytes・本文・decoded tree・capture／検証receiptをprivate slotから外す。scalar診断だけ残し、JS heapの物理消去は保証しない。

費目はwire文字長／byte長走査・buffer確保・strict decode・schema正規化copy・freeze・capture索引／handle・plan移譲・full比較・局所projection／比較・omissionモデルの複数回serialize／recount・guard／解放へ分ける。各費目を誰が何回行うかの台帳が必要で、元C/G/PやRD-B04 usageへ紛れ込ませない。

元reviewed captureが最大100件で各serialize上限がB−256なら、元JSON長合計の理論上界だけでも26,188,800 byteになる。最終aggregateのBやfindings≤100を、**元capture全体の保持量**に適用してよいわけではない。decoded graph・Zod copy・send用clone・同時保持・omissionの一時serializeは別途必要である。実heap／layout・総work・全体受付の必要量は未導出／Unknown。元60秒を延長せず、予算不足ならcapture途中からgateを未成立のまま停止し、bodyの切捨てや偽digestで候補を作らない。

## 9 合成受入条件・独立検証

- 同analyze job／receipt／T_i／受理originから一度capture。コピー・別root・同ID別job・失敗後再受理・後書換え・callerのfreeze副作用を拒否。descriptor pin／RD-B03 summaryでは発行できない。
- 各pre/post guardの取消・期限切れ・再入・未知例外を確認し、比較不一致よりpost guardの停止と先行hardを優先する。本文は診断へ出さない。
- contextが同じでもissue／impact／recommendation／sources／required_follow_up／findings順・件数・位置・target hash等の単一変更を検出。元本文の代わりに空findingsを渡しても候補0。
- UTF-8 byte長とUTF-16長・局所文字費を独立oracleで比較。B−1／B／B+1、多byte、escape、raw文字列のround-trip、重複key（escape同値含む）、深さ／node／key／array上限、不正数値を検証。
- full schemaの各refinementを独立に壊し、構造JSON Schemaだけなら通るcounts／出典／rule適用／provenance／selection／時刻等も拒否する。0.2／0.3で正しいfixtureを用意し、既存context-only fixtureを流用して証拠を水増ししない。
- body一致・full schema・wire・job由来のどれか一つだけ欠けてもgate未成立。別originの成功receiptを足し合わせる昇格、後からlocal checkを候補へ変える操作を拒否。
- analyze時omitted、親finding省略、finalizeのfinding／末尾byte省略を個別に検証。閾値B−256／Bと100 findingsの境界、error満杯、元response_truncated有無、最終recountとEの再採取0を独立表で確認。
- 元S／全L／O／T_i／Uと元会計prefixは不変。schema検査・比較中の期限超過でも新解析／payload再取得・再finishは0。
- 通常worker／adapter／WJ-CとRD-B01〜04の旧試験を維持。新合成root・brand・methodはpackageから除外し、runtime／I/O／clock／worker混入の負の対照を実行する。

以上は後続試験の計画であり、今回実行済みの保証ではない。

## 10 実装分割・未承認事項

| 分割案 | 最初の範囲 | まだ発行しないもの |
| --- | --- | --- |
| CG-A | 完全schemaのshape導出・bounded strict decoder／同json origin・純粋なfull body値契約。独立oracleで上限と同bytesを検証 | capture証拠・候補・実受信保証 |
| CG-B | 同analyzeのprivate capture owner／post-guard受理・一度限り移譲をfresh合成issuer限定で実装 | descriptor／rawからの昇格、実session登録 |
| CG-C | 三つの省略点の固定決定証拠と純粋omissionモデル、full aggregate＋RD-B03＋元本文比較 | 不足gateの候補化 |
| CG-D | 全receiptが同job／planに揃う一度限りgate。RC-Dへ渡すprivate契約を検証 | RD-Dの正常終端・実review結果／Permit発行 |

名前・上界モデル・copy方式は設計案。まずCG-Aのschema形状上界と同bytes境界から、別途指示を受けて実装する。現在のRD-B04 handle／pin／content_evidenceのUnknownをそのままverifiedへ書換えない。

未確認事項はschema全variantからの形状証明、既存JSON.stringify出力とのdecoder互換性、元bodyの保持／cloneピーク、checkpointの配置と同期schema検証の中断粒度、omissionのserialize総費用、body／job／終端ownerの同時寿命、本番cap／全体work上界。これらを未導出のまま実経路や候補gateを開かない。

本書はMDのみ。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持し、実装・worker起動・実通信・実機操作・トークン発行・設定変更・Permit／候補発行・Pushは行わない。
