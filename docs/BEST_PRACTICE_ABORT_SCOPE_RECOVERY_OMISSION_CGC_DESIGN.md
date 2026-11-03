# CG-C 親省略決定証拠・合法omissionモデル 詳細設計

Version: br006-recovery-omission-cgc-draft-0.8 / Date: 2026-11-03。
Status: **OM-A値層とOM-Cのreviewed列限定fresh合成決定ownerを実装。混合origin・finalizeモデル・同accepted／plan／manifest／finish job接続は未実装。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

基準HEAD: `fd5ddb9`（NR-Cの追加対照を含む）。[内容gate設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_CONTENT_GATE_DESIGN.md)§3・7・8と[非reviewed設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_NONREVIEWED_DESIGN.md)§6・11からの差分。現NR-Cは親受理後のomissionを拒否する。このMDはその拒否を変更せず、実装・実接続・実通信・実機操作・設定変更・本番cap／Permit／候補発行・Pushの承認ではない。

## 1 根拠・目的と対象外

照合したローカル根拠：

- [worker](../src/review/review-worker.ts)：analyzeのserializeサイズ省略とfinish後のwire上限。
- [親adapter](../src/review/update-set-adapter.ts)：受理後の累積finding上限、元worker omitted受理時の警告、soft回復への引継ぎ。
- [finalizeAggregate／addReviewError](../src/review/aggregate-finalize.ts)：finding順走査・recount・analysis_complete・末尾byte省略・limitations dedup・full schema。
- [集約schema](../src/review/aggregate-schema.ts)：0.2／0.3・counts／nested result／provenance／上限refinement。
- [既存局所比較器](../tests/support/review/synthetic-recovery-finish-values.ts)：context／集合／時刻・許容error差分。ただし本文と省略対象の正当性は未検証。
- [CG-B capture](../tests/support/review/synthetic-recovery-capture.ts)と[NR-C root](../tests/support/review/synthetic-pinned-recovery-root.ts)：private本文・同receipt／accepted／plan、同期失効とdiscard。

目的は「必要warningがあれば任意のreviewedをomitできる」を避け、固定処理が選ぶ全結果単位の変換だけを許すこと。source承認・findingの妥当性・元worker内部のサイズ判断・実worker応答originは証明しない。今回、公開JSON・runtimeロジック・旧fixture／root／比較器を変更しない。

## 2 三つの省略点を分離する

| 点 | 元受領物／決定主体 | 変換と扱い |
| --- | --- | --- |
| worker analyze | 元wireで既にresult_omitted。worker内部でasset serialize長が262144−256を超えると変換 | NR-B／CのAnalyzedNonReviewed。元reviewed本文・findings数・元stateを推測せず、新たなcapture／ParentOmissionDecisionを作らない |
| 親adapter | 同analyzeでfull reviewedを検証・captureした後、選択順の既保持finding数で判断 | 同captureを保持したParentOmissionDecision。省略後の見かけが同じでも元worker omittedへ格下げしない |
| finish finalize | 同planの親受理後入力に対するfinding順走査、続く全runのbyte上限処理 | 別のFinalizeOmissionTrace。元capture・親決定・元nonreviewed／retainedを維持し、finish E・同job受領物との接続は後工程 |

result_omittedは既存のstate／reason=response_limitだけ。findingsの一部分割・内容修正・空配列化で合わせる変換は不可。metadata／retrieval／rejected／retained／元omittedをreviewedへ昇格しない。親で省略された行は「captureゼロ」の証明対象ではなく、出力reviewed=0でも保持captureが存在する別状態である。

## 3 固定モデルの値入力と保護された供給元

モデル識別子案は`recovery-omission-v1`。実装前に固定sourceの各分岐・full schemaの仕様と対にしてpinする。source変更を自動追従して許容を広げず、識別子とoracleを再審査する。

### 3.1 純粋値層（非実行draft）

strict入力はmodel_id・schema_version・固定limits・canonical選択順・元asset値・開始時点のrun header／errors／limitationsとする。親段階とfinalize段階は別入力型にする。各fieldは既存schemaの値と有限枠だけを使い、任意callback／identity／verified flag／clock／serializerを受けない。

純粋関数はbounded copy／検査済みのown-dataだけを読む。出力はkeep／omitの固定順trace、派生counts／coverage／errors／limitations、比較用の非実行期待値。型名にevidenceを使わずauthority:noneとし、反復計算できる値をone-shot証拠と呼ばない。元bodyを診断・summaryへ返さない。最大100行だが、総work／heap受付を満たしたとは扱わない。

### 3.2 後続の合成private供給

固定ownerが同constructorのcapture／NR-B evidence／元retained receiptから入力を作る。値だけのmodel draftや外部summaryを証拠として登録しない。親prefixはcallerが保持finding数だけを申告する方式にせず、同selected順の既受理slotから導出する。

limitations／errorsはサイズ判断にも影響する。非省略由来のerror・soft停止・consistency結果等は、同runの固定継続がpinした前段prefixを供給する。返信のcounts／warnings／errorsから期待入力を逆算しない。親の各受理イベント間に他の副作用が入る場合、その順序を保護されたprefix originで表す。供給できないfieldや順序はUnknownとして接続を拒否する。

finalize入力は親処理後の同plan値そのもので、親省略前の全reviewedを再投入しない。親で省略済みのcaptureは内容証拠として別slotに保持するが、finalizeのfinding予算には加えない。Eは後続の同finish responseからU≤E≤S+L等の既存時刻検査後に渡す固定値。モデルはUTCを採取せず、S／O／T_i／U／全deadlineを変更しない。E供給とfinish job originがまだない段階では、純粋値draftだけに止める。

## 4 親adapterモデルの正確な順序

選択順に受理済みassetを処理する。prefixのfinding数Fは、その時点で保持されたreviewedのfindings.lengthの和だけ。省略済み結果・元omitted・その他stateは0。

1. reviewedでF＋nがmax_findings（現契約100）を**超える**と、当該全assetをresult_omitted／response_limitへ変換する。Fは増やさない。後続の小さいreviewedは再び収まる可能性があり、一律に残り全部をomitしない。
2. この親finding省略でresponse_truncatedがまだなければ、limitationsへresponse_truncatedとfinding_budget_exceededをその順にpushし、固定output／response_limit errorを追加する。既にresponse_truncatedがある場合は、finding_budget_exceededもerrorもこの分岐では追加しない。
3. 収まるreviewedはfull値のまま保持する。元worker omittedを受けた場合は、その値を保持し、response_truncatedがまだなければそれだけをpushして固定errorを追加する。finding_budget_exceededは加えない。
4. 親段階でlimitationsをdedupしない。既存warningの有無とpush順、重複、errors prefixを正確に保持する。親処理だけでcounts／status／analysis_completeをfinalize相当に書換えない。

addReviewError相当はerrors.length<100なら固定errorを末尾へ追加、満杯なら未存在のerror_details_truncatedをlimitations末尾へ追加する。codeが同じerrorの存在によるdedupはしない。response_truncatedがあるため追加自体が呼ばれない場合と、呼ばれたがerrors満杯の場合を区別する。

## 5 finalizeモデルの正確な順序

実finalizeAggregateは時計を読むので、親モデルからそのまま呼ばない。固定Eを受ける独立した純粋モデルとして次を再現する。

1. ended_atを同Eへ設定する。その他の前段header／status／consistency／assets順／errors prefixは同入力を使う。
2. reviewedだけを先頭から走査。retained finding数にnを足すとmax_findingsを超える行を全結果単位でomitする。この分岐ではresponse_truncatedの既存状態に関係なく、finding_budget_exceededがなければ追加する。収まる後続行は保持する。
3. 各omitは当該行をresult_omittedへ替え、response_truncatedがなければpushしてaddReviewError相当を呼ぶ。analysis_complete=false、全state counts／findingsをrecountする。
4. finding走査後にrecountし、現sourceの条件でanalysis_completeを再計算する。collection・truncated・0.3 selected>0・consistency・release・errors・全asset state・skipped_rules・固定unresolved limitations一覧をそのまま使う。statusは再計算しない。nested resultのreview_status等は最後のfull schemaでも別に検査する。
5. **dedup前**のrun serialize長がH=B−256（現B=262144）を超える間、末尾から最後のreviewedを探して全結果単位でomitし、手順3の副作用とrecount後に再測定する。Hちょうどなら省略しない。前からの省略や最大結果の選別は不可。reviewedが残っていないのに超過なら固定失敗で止める。
6. 最後にlimitationsを初出順でdedupし、既存full aggregate schema（nested refinementを含む）へ適合することを要求する。dedup後なら収まるという理由で手順5を先に省略しない。

analysis_completeに影響するunresolved一覧は現sourceを固定snapshotとして別費目で比較する。schemaの「不完全なのにtrueは不可」と、finalizeがどの値へ再計算するかは同一検査ではない。既存RD-B03のcoverage完全一致前提と現sourceとの差が生じる入力は、後続接続設計で適合範囲を決めるまでunsupportedとして拒否し、局所比較器を黙って緩めない。

workerの最終wire上限Bと、モデル内のHによる省略判断を区別する。full schema後の同finish JSONをCG-Aで測ることと、期待runのserialize長を省略判断に用いることも別の費目・別originである。

## 6 内部証拠型・one-shot境界案

名称は案。今回のMDだけでは型も入口も発行しない。

| 型案 | private内容／発行前提 | 消費／保持 |
| --- | --- | --- |
| ParentPrefixCursor | 同owner／run／session／source／auth／budget／release／window、選択順cursor、既受理slot集合、保持finding数、warning／error prefix origin | 次の同row以外を拒否。失敗後のcursor巻戻し不可 |
| ParentOmissionDecision | 同row／input receipt／job／T_i／受理origin・元ReviewedCapture、モデル版・ordinal・F／n／cap・変換と副作用 | 検証済みcaptureの後だけ発行。caller bool／任意reasonからは不可。同rowの決定claimはkeep／omit共通で一度 |
| ParentOmittedSlot | 同capture＋同decision＋変換後strict省略値 | 元AnalyzedNonReviewedとは別variant。元captureを捨てず同manifestへ一度移す |
| FinalizeOmissionTrace | 同入力manifest／plan／accepted・モデル版・固定E、finding走査とbyte反復の順序・対象・副作用 | 値モデルのsummaryから昇格不可。同finish input／responseの連結後だけ証拠を検討 |
| ModeledAggregateExpectation | 同manifestと上記traceからのfull期待値。元reviewedは不変参照、変換は全結果単位のみ | 外部getterなし。後続同job content比較へ一度移譲、現段階は非実行draft |

親受理claim→capture受理→決定claim→pre guard→F／n／cap・順序・同一性検査→post guard→keep／omit commitの順。局所不一致はpost guardまで保持し、共通停止・先行hardを優先する。claimは失敗でも戻さず、再入をcallerが捕捉しても失効を戻さない。

manifestへの移譲は同receipt／accepted／planの一度限り。親omittedをmixed rootへ追加する際も、元selected行を二重に数えず、capture保有数と出力reviewed数を別にする。NR-Cの既存empty proofを親omissionへ流用しない。旧root・公開APIは維持し、新合成constructorの生成時からのみ組み立てる。

## 7 保持寿命・失敗・discard

親省略前のcaptureはfull内容比較の根拠として保持する。wire文字列を再登録したり、omittedから本文を作り直したりしない。同manifestへ所有権を移すと元ownerのpending slotを空にする。移譲後もcleanup sink／終端責務だけは別slotに残す。

source close／cleanup開始・取消・期限・hard・固定discardでpending決定／prefix／本文参照／trace／期待値を同期失効する。正常cleanupと終端候補のterminal-only寿命の区別は既存RD-C／RD-Dに従うが、今回候補は作らない。late cleanup confirmedは診断だけ更新し、失効済みcapture／decision／manifestを復活させない。JS heap物理消去は保証しない。

内部失敗案はshape／binding／state／order／duplicate／missing／unsupported／limit／model_mismatch／content_mismatch。上位codeは既存の固定失敗・共通停止だけに写像する。本文・field値・schema issues・serialize結果・例外causeは診断へ出さず、固定count／stage／first failureだけ残す。hard停止をresult_omittedやnot_processedへ変換して救済しない。

## 8 bounded解析・費目所有とUnknown

| 費目 | 所有者／必要な上界 |
| --- | --- |
| 元full値・context・非reviewedの検査／保持 | 各既存capture／issuer。100行・各元JSON B以内等の局所枠を維持。合計graph・copyピークをB一個分と見積もらない |
| prefix導出・親決定 | 親モデルowner。最大100行のcursor／trace、finding数加算はsafe integer checked、元保持数は同slotから導出 |
| finding順走査・recount・coverage | finalizeモデルowner。最大100行、各omit後のrecountと固定条件費を明示。上限100を理由に無料にしない |
| byte測定・末尾探索・再測定 | finalizeモデルowner。成功するbyte省略は元reviewed数R以下、測定は初回込みR+1以下。各回のrun graph・escaping・UTF-8費を別課金 |
| full schema・元本文比較・copy／freeze | 内容gate owner。CG-A局所検査／RD-B03と二重計上・未計上を区別する |
| handle・claim・移譲・guard・discard | 各owner。最大100の索引と固定操作、停止時の解放費も含む |

巨大な期待runを毎回JSON.stringifyして一時巨大文字列を作る方式は未承認。純粋モデルの最初の実装前に、own-data限定のbounded count-only JSON size計算器を具体化する。callback／toJSON／getterを呼ばず、JSON.stringifyと同じescape／number／UTF-8の規則を独立corpusで確認する。測定はexact length≤Hまたはover_Hの別variantとし、早期超過を架空のexact lengthへ変えない。traceもその区別を保持する。

OM-Bの受付／計数分離・数値候補・256-unit checkpoint・epoch／同budgetと固定Eへの接続は[サイズ計数器詳細契約](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_JSON_SIZE_OMB_DESIGN.md)で具体化した。設計のみで、候補cap／work式は未検証・本番未承認。OM-Aの事後serialize検査も変更しない。

計数器は有限depth／node／key／array／文字費、checked arithmetic、checkpointを反復・確保前に要求する。全runの中間表現は最終出力Bを超え得るため、CG-Aの最終aggregate枠へ無条件に押し込めない。元capture集合＋header／error／warningsの有限上界から別途導出し、超過時は省略をでっち上げず停止する。数値cap・総work／heap・同期schema検証の中断粒度はUnknown、全体受付無効を維持する。

元60秒・210試行・C/G/P／retry prefix、全deadlineを維持し、model検証のための再取得・再解析・再finishをしない。純粋値計算とauthority-bearing証拠の発行を分離したまま実装を進める。

## 9 合成受入条件・独立oracle

1. 親finding：F+n=99／100／101、ゼロfindings、超過行の後に小さい行、metadata／rejected／retained／元omittedが挟まる順序。全結果単位だけが変わり、元captureの全fieldは保持される。
2. 既存response_truncatedなし／あり、finding_budget_exceededだけ既存、同code errorだけ既存、重複warning、errors=99／100の組合せ。親とfinalizeの異なる警告条件を固定表で別検査する。
3. finalize：finding順走査後のcounts／coverage、0.2／0.3、unresolved一覧・skipped_rules、末尾reviewed探索、H−1／H／H+1とB、dedup前／後の差、全reviewedを省略しても収まらない固定失敗。
4. UTF-8多byte・制御文字・quote／backslash・Unicode escape／surrogate、正当な数値、key順・array順、optional fieldの有無を独立JSONサイズcorpusで検査。値が同じでも許可外field／prototype／accessor／Proxyは拒否する。
5. 別root／receipt／capture／decision／plan／model、コピー・順序違い・重複・二重決定／移譲・失効後再利用、全pre/post guardの取消／期限／再入／未知例外。比較不一致よりpost停止・先行hardを優先し、部分結果を発行しない。
6. reviewed本文の一field／findings順／sources／recommendationだけを変える対照は、合法omissionに見せても通らない。元worker omittedに空本文を捏造する対照、親omittedのcaptureを削除してempty proofへ替える対照も拒否する。
7. count／副作用の独立oracleは固定fixtureの明示表から期待値を作り、モデル関数自身や受信応答から生成しない。別途、隔離した合成時計で現finalizeのended_atを固定する差分試験を計画する。本番sourceは改変せず、単に同関数を二度呼ぶだけを独立oracleとしない。
8. sourceの対象分岐・unresolved一覧・固定上限の変更をAST／固定snapshot対照で検出し、意図的な省略対象／比較演算子／warning順の変異でも試験が失敗することを確認する。旧試験・0.2互換性・0.3制約・package非同梱とseeded混入負の対照を維持する。

これは試験計画であり、今回実行済みの保証ではない。実worker／実transportや実PDIは使わない。

## 10 実装順と未確認事項

| 段階案 | 最初の範囲 | まだ開かないもの |
| --- | --- | --- |
| OM-A（§11の値層のみ実装） | strict値型・親prefix／keep／omitの純粋計算と副作用表。別producerの元omittedを区別する | 決定証拠・manifest拡張・finish job |
| OM-B（計数詳細契約のみ追加） | [MB-A〜C](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_JSON_SIZE_OMB_DESIGN.md)：strict準備値→count-only core→固定Eのfinalizeモデル。同budget・epoch・独立oracle | 総work受付・runtime・候補 |
| OM-C（§12のreviewed列限定で実装） | fresh合成ownerから同captureへ親決定を結合し、one-shot・失効・discardと別brandを検証。非reviewed混合は後続 | 旧root昇格・正式発行・本番binding |
| OM-D | [接続差分設計§11](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_MIXED_CONTENT_OMD_DESIGN.md)のOD-Aでfresh合成DATA slot／prefix段階／claimを実装。[OD-B供給・移譲契約](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_ODB_TRANSFER_DESIGN.md)は設計のみ。同accepted移譲・比較は未実装 | 同job／wire／全gate未成立の候補化 |

未確認：保護された親prefixの発行owner、元captureを内部で借用する固定継続、親決定の移譲とsource／cleanupの同時寿命、size計数器のescaping互換・中間graph上界、coverageの局所契約との接続、omission追加費目・共有budgetの中断点、同finish job／E／response originの発行元。未実装の型や数値を確認済みにせず、各段階の実装前に固定sourceと照合する。

初版はMDだけを保存した。OM-Aの合成値層の実装範囲は§11で定める。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持し、実接続・実通信・実機操作・設定変更・鍵承認・担当者連絡・Pushは行わない。

## 11 OM-A 合成pure値層の実装契約

基準HEAD: `bb47b63`。[pure helper](../tests/support/review/synthetic-parent-omission-values.ts)はPARENT_OMISSION_VALUE_LIMITS、ParentOmissionValueError、modelSyntheticParentOmissionの3 runtime exportだけを持つ。owner／claim／registry／guard callback／clock／native操作は持たない。反復計算は可能だが、証拠の再発行ではない。旧NR-Cの親omission拒否は変更していない。

### 11.1 strict入力・保持値と検査の範囲

入力はstrictなkind=synthetic_parent_omission_values_v1、model_id=recovery-omission-v1、schema_version=0.2／0.3、limits:{max_findings:100}、selected、prefix:{limitations,errors}、rows。各rowはproducer／outcomeだけで、producerはanalysis／metadata／retrieval／retainedの閉じたunion。selectedは32桁sys_idの一意昇順・最大100、rowのID・順序・件数が完全一致しなければ拒否する。retainedは連続した末尾だけを許し、retainedの後に別producerの行が来れば拒否する（adapterはループ中断後に残り全行をnot_processedとして末尾へ追加し、その停止warning／errorもループ後に加えるため）。keep前のfinding数を外から入力するfieldはない。

reviewedはanalysisだけで、assetOutcomeStructureとreviewResultV2Schemaのrefinementを検査する。外側asset ID＝内側target ID、applicable rule集合＝nested requested集合・重複なしを追加で確認する。header／auth／release／source／job／receiptとの実bindingを証明する検査ではない。非reviewedはNR-Aへ渡し、producer別variant／reason・0.3 deleted拒否をそのまま再利用する。parent_omissionは入力producerとして拒否し、元omittedはanalysisに限る。retainedはdeadline_exceededだけ。

OM-Aでは§3.1のrun header案を、親計算が実際に参照するprefixと固定finding capへ限定する。counts／coverage／status／E／最終aggregate／全run contextは入力も出力もしない。prefixのerrorsは同版aggregateのstrict構造を使うが、stageとcollection等の全体semantic整合は未検証。retainedのstop warning等も上位run契約の責務であり、OM-Aだけでfull schema適合を主張しない。

返却値はauthority:none、checked_scope:parent_finding_values_only、別のvalue-only brandを持つ。valueにはinitial_prefix、変換後prefix、original_rows、変換後assets、固定順trace、kept_findings等を保持する。各traceはordinal／producer／元state／keepまたはparent_omit／before・incoming・afterと追加limitations・error件数だけ。full原値はpure DATAのoriginal_rowsへ保持し、親省略後のassetsと分離する。同じowned値をkeep結果にも参照し、追加のJSON round-tripで複製しない。callerのgraphをfreezeせず、出力はdeep readonly／freezeした正規化copyである。

元bodyを隠すprivate getter契約ではなく、入力されたpure値の正規化結果を返す**開発専用値関数**である。これはOM-Cの保護capture／証拠ownerの代用品ではない。producer／capture／context／prefix／receipt／decision／manifest／finish job／finalize／全体予算はunverifiedのまま。空入力も純粋計算としては返せるが、NR-Cのempty proof・active input・回復条件の成立は意味しない。

### 11.2 副作用・中間枠・費用

§4の親分岐を維持し、F＋n>100のときだけ全assetをomitする。n≤100・F≤100は検査／計算から導かれ、加算の最大値200はsafe integer内である。超過行の後の小さいreviewedは収まればkeepする。元omittedやその他stateはfinding数0。元omittedの警告追加と親finding省略の警告追加を別条件に保ち、親段階ではdedupしない。

prefix入力はlimitations≤100（各2000文字）／errors≤100、bounded copyは深さ3／node2500／文字費650000。キーの列挙はplain own-dataに限定し、getter／Proxy／特殊prototype／疎配列・余分keyを拒否する。各asset copyはCG-A由来の現analyze depthとarray≤100／object key≤30、node262144／文字費786432を上限とし、strict正規化後のJSON論理UTF-8長がB=262144以下であることも検査する。元wire origin・worker内のH省略を証明するbytesではない。

親段階の出力limitationsは、初回response_truncated＋finding_budget_exceeded、error満杯時のerror_details_truncatedで最大3増えるため、**中間上限103**とする。既存warningや重複を削って100件へ戻さない。finalizeのdedup／full schema前の中間DATAであり、103件を公開JSONとして受理する変更ではない。

usageはprefix／asset copyのnode・文字費と行数を同copyから数えるだけで、総work／heapではない。top-level検査・配列／key列挙、strict schema／refinementのcopy、各assetのサイズ検査用serialize／UTF-8走査、NR-A再投影、original／変換後の参照索引、trace／prefix copy、freeze（共有値の再訪を含む）も別費目。Bはserialize後の検査であり、拒否されるassetの一時serialize文字列をB以下に抑える確保前保証ではない。その中間構造はcopy枠で有限に制限するだけで、総allocation上界は未導出。最大100 assetそれぞれにBを用いるため、集合全体の保持・serialize合計をBで制限したとは扱わない。

OM-Aには共有budget／期限／取消のcheckpointはまだ接続していない。有限の局所枠で止めるpure値層であり、全60秒の強制中断・総費用を保証しない。bounded count-only計数器・finalizeモデルはOM-Bへ残し、実経路・全体受付へ投入しない。

### 11.3 固定失敗・検証・残課題

失敗はshape／limit／model／order／unsupportedを固定code・message=internal_review_errorへまとめ、raw値・schema issues・causeを保持しない。途中までのprefix／asset／traceは返さない。stateful ownerではないため失敗後の再利用claimや失効証拠を作らず、後続OM-Cで対応する。

独立の明示finding表・warning／error境界表、B境界、caller後書換え・deep readonly、strict入力とproducer対照を検査した。親adapterのfinding分岐・元omitted分岐・prefix reduce・addErrorは実行せずASTで固定照合し、比較演算子／warning順／reason／prefix／error capの変異を負の対照にした。これは現在sourceへの一致検査であり、共有runtime kernelへの置換ではない。

[OM-A検証記録](E2E_BEST_PRACTICE_PARENT_OMISSION_OMA_2026-11-03.md)参照。OM-B以降のsize／finalizeモデル、実captureからのprefix供給、ParentOmissionDecision・one-shot／同期失効／discard、同accepted／plan／finish jobとのbinding、full比較・候補・全体予算は未接続。npmへ同梱せず、固定importとseeded漏出／I/O／clock／workerの負の対照を維持する。

draft-0.4のレビュー修正：OM-A初版はretained行の後に処理済み行が続く順序を受理しており、既存試験もその順序で親計算を行っていた。adapterではnot_processed行は常にループ中断後の連続した末尾で、停止由来の副作用もループ後に追加されるため、「開始prefix＋省略副作用」だけのモデルが成立するのはこの順序に限られる。§11.1へ末尾連続の要求を追加した。他の契約・費目・未接続事項、OM-Bの計数契約は変更しない。

## 12 OM-C reviewed列限定のfresh合成決定owner

基準HEAD: `747084e`。§11末尾はOM-A時点の未接続事項。[CG-Bと同じprivate kernel](../tests/support/review/synthetic-recovery-capture.ts)へ新constructorを追加し、元capture内部値を外へ返さず親決定へ結合した。OM-Bの実装は先行させていない。初回subsetはreviewed列だけで、非reviewed／元omitted／retainedとの混合は未対応として止める。

### 12.1 strict生成・別brand・同capture

createSyntheticParentOmissionAssemblyのstrict入力はkind=synthetic_parent_omission_owner_v1、model_id、schema_version（0.2／0.3）、prefix:{limitations,errors}、contextsだけ。初期prefixはOM-Aの空行pure検査でowned immutable DATAへpinする。実runの前段origin証拠ではない。contextsは既存CG-Bのbounded投影で1〜100件・一意sys_id昇順・同binding／対象Update Set／releaseへ固定し、任意のkept_findingsや既存ownerを登録できない。

新constructorは依存objectもplain own-data／guardだけに限定し、guard関数を一度pinする。旧createSyntheticRecoveryCaptureAssemblyのAPI・診断は維持し、新側にはtransfer／manifest／body getterを公開しない。入力／wire／reviewed capture／decision／cleanup sinkは空の別brand。旧capture・外部pureモデル／summaryからの昇格は拒否する。

private recordは同CG-B slot（固定context／連番id／input所属）と同wireのfull JSONから検証・post-guard受理した**同じimmutable reviewed値**を保持する。実auth／session／ReleasePermit／実worker jobへのbindingではなく、fresh合成constructor内の同一性である。

### 12.2 固定順・one-shot発行・消費

各行はdeliver→accept→decide。次行のcaptureをacceptする前に前行の決定が必要。元入力の開始claim／受理originに加え、keep／omit共通のdecision_startedをpre guard前に占有する。

decideは同captures mapから元参照を取り、pre guard後に同owner／slot・ordinal・受理数を照合する。初期pinと決定済み同capture列＋当該captureだけでOM-Aを固定呼出しし、最後のtraceのbefore＝保持finding数、incoming＝元captureのfindings.lengthを確認する。callerによるmodel／callback／prefix数値の差替えはない。

初回実装は履歴全体のpure再計算。OM-Aの正規化copyを決定の由来へ置換せず、recordは元capture handle・同slot・同元値と当該traceへ結ぶ。keep／omit双方で元captureを残し、出力reviewed=0でもcaptureゼロ証明にしない。局所binding／二重開始／余分引数の不一致はpost guardまで保持して、その停止を優先する。post後のmap再照合と先行hard確認後だけ空decisionを発行する。失敗・競合後の再開始／再発行は不可。

消費口はdiscardDecisionだけ。同ownerの発行済みhandleを一度取り外し、全ownerを固定discardへ終端して他のpending決定・本文／wire／prefix／履歴も外す。個別discard後にprefix処理を続ける口や、同accepted／planへ移す口は未実装。OM-Dへ残す。

### 12.3 同期失効・診断・cleanup

beginSourceClose／beginCleanupでbody／決定／履歴／prefix参照を同期に外す。beginCleanupが返す同ownerの合成sinkは、失敗・discard後もrecordCleanupでconfirmed／unconfirmedを一度だけ記録できる。native resourceの取得／解放証拠ではなく、late confirmedから決定を復活させない。未開始・別sink・未知status・二重開始／記録は拒否する。

取消／期限・throw・未知停止・再入はfail-closed。guard内で例外を捕捉されても失効は戻らない。capture受理2点＋親決定2点のguardを持つが、OM-A内部の長い同期parseを途中中断できる保証ではない。エラーは既存RecoveryCaptureErrorの固定message／code=internal_review_errorと固定reasonのみで、raw例外・本文・causeを残さない。

summaryはstate／first_failure／累積accepted・decided・keep・omit・保持finding数・consume回数・pending数・warning／error件数・source／cleanup状態だけ。row ID・T_i・本文・trace値・内部handleを含めず、失効後もscalarと最初のreasonを保持する。runtime／初期prefix origin／非reviewed origin／receipt／manifest／finish job／content gate／全体予算は未保証。JS heapの物理消去も主張しない。

### 12.4 費目・未対応

入力／capture／決定／履歴は各100以下、prefixとfull結果には既存CG-B／OM-A局所枠を適用する。1行ごとのcapture検査に加え、k行目の決定でk行のOM-A copy／schema／serialize／freezeを再計算し、100行なら最大5050 asset分のpure検査になる。元private本文とモデル一時copy、prefix／trace、guard、Map／handle、clearは別費目。総work／memory・canonical budget／中断粒度はUnknownで、元C/G/P／retry・210試行・全60秒を変更せず、runtimeにも投入しない。

非reviewed／元worker omitted／retainedと同receiptで混合する供給元、同accepted／plan移譲、OM-B size／finalize、同finish job／E／応答内容gate・候補・正常終端は未接続。NR-Cの親omission拒否を解除せず、実origin発行口閉鎖・全体受付無効・調査保留を維持する。[OM-C検証記録](E2E_BEST_PRACTICE_PARENT_OMISSION_OMC_2026-11-03.md)参照。

[OM-D接続差分](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_MIXED_CONTENT_OMD_DESIGN.md)で、同一の新合成assembly内の混合origin・prefix段階・private移譲・同JSON内容照合を具体化した。OM-B前は新finish省略を拒否する限定的な非実行照合だけを設計し、合法finalize／同finish job／全gateの成立とは区別する。同書draft-0.2§11のOD-Aは別台帳のfresh合成DATAだけで混合slotとprefixの生成／消費を実装した。既存OM-C captureやNR-C receiptの採用ではなく、同accepted／plan・内容比較・finishへの未接続は維持する。[OD-A検証記録](E2E_BEST_PRACTICE_OMD_SLOTS_ODA_2026-11-03.md)参照。
