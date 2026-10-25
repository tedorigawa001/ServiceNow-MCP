# AU-BR-006 bounded取得：証拠受信上限・動的最終予約

Version: br006-bounded-budget-draft-0.1 / Date: 2026-10-25。
Status: **純粋な予約台帳・試行費目型・独立イベントoracleを合成実装。stream課金・cap採用承認・実source/worker接続は未実施**。
親：[証拠取得設計](BEST_PRACTICE_ABORT_SCOPE_EVIDENCE_DESIGN.md)、[接続契約](BEST_PRACTICE_ABORT_SCOPE_CONNECTION_CONTRACT_DESIGN.md)。

## 1. 現状と変更の境界

現行`BoundedReadSession`は全体60秒、HTTP最大210試行、1応答4MiB/累計16MiB、payload単体2MiB/累計8MiBを持つ。実HTTPの前に試行を課金し、429/5xx/通信失敗等のupstream_unavailableだけ最大1retryする。通常取得から最終親/metadata用4試行を残し、固定sourceのverifyは親→一覧を再読する。実装の`get(path, final:boolean)`と固定予約4だけでは、本案のtable別予約・下位受信枠を保証できない。

本案はAU-BR-006用の内部読取モードを将来追加する設計であり、既存0.2/0.3・既定3/明示14規則の実経路を変更しない。table/query/fields/final flagや上限をMCP引数に追加しない。`sys_db_object`を汎用allowlistへ足すだけの対応もしない。

全体上限は**60,000ms・210 HTTP試行のまま**。認証交換・初回取得・retry・再読・worker/集約/終了は同じsession/全体期限に含める。別session・別token・別APIで予算を作り直さない。

## 2. capと費目所有

以下の下位枠は未承認の設計値。合成channelにあるIPC定数をHTTPの承認済みcapへ昇格させない。

| 費目 | 上限/単位 | 所有者・課金境界 |
|---|---|---|
| 全HTTP試行C | sessionのQ<=210 | session transport。OAuth/通常/final/失敗/retryすべて、fetchを呼ぶ直前に1回 |
| 全受信G | 16MiB以下（既存の低減設定も尊重） | transportのbody読取。実際に返ったchunk.byteLengthを1回 |
| 応答受信S | 通常4MiB以下、証拠はmin(既存応答上限,16KiB) | transportの1 HTTP試行ごとに0へ初期化 |
| 証拠受信E | 全run累計256KiB以下、retry/失敗/最終も内数 | transport内の証拠専用台帳。同じchunkをG/Eへ各1回。EをGにもう一度加算しない |
| payload | 既存2MiB/8MiB | 既存source/chargePayload。証拠JSONをpayloadとして二重課金しない |
| table受付T | run最大8名（正規化済みname完全一致） | 固定sourceが用途を判定、session内予約台帳が原子的に登録/承認 |
| 最終予約R | 親2・一覧2・受付table各2の残枠合計 | session内のprivate予約台帳。source/callerが数値やbooleanで上書きしない |
| 時間 | 通常50秒/整合55秒/全体60秒 | sessionの単調時計・phase/signal。source/workerは残時間を借用するだけ |
| IPC/計画/出力 | 接続契約の別費目 | supervisor/owner/集約。HTTP台帳のbyteや試行を流用しない |

`ScopeReadBudget`等の提案名はprivateなsession内台帳を指す。固定sourceはtable/用途/phaseと実受領物を所有し、transportは試行/受信/中断を所有する。sourceがHTTPカウンタを別途増やしたり、workerが予約を発行したりしない。reader.cancel/worker終了はHTTP試行には数えないが、同じ残時間で後始末する。

## 3. 証拠専用の固定取得入口

接続契約のprepare計画から得た検証済みcollectionだけを受け付ける。matched ReleasePermit・同じ実source/session・選択jobへの結合を先に検査する。Globalの推定や利用者申告の値では発行しない。

- 固定GET：`sys_db_object`、query=`name=<検証済みname>^ORDERBYsys_id`、limit=2、offset=0、no_count=true。
- fieldsは`sys_id,name,sys_scope,sys_updated_on,sys_mod_count`だけ、display_value=false、exclude_reference_link=true。name/fields/queryは呼出し入力で自由指定できない。
- 同じtableは初回1論理GET・最終1論理GETだけ。各論理GETは最大2 HTTP試行。別assetからのcache参照はGETを増やさない。
- 初回は通常phase、最終は整合phase専用。receiptはsession/source/table/phase/時刻/版へ結合し、各asset contextに一度ずつ結び直す。

将来の専用transport入口はprivateな用途permitを要求する。path一致だけで証拠枠へ入れたり、任意GETをfinal扱いにしたりできないようにする。旧`final=true`による迂回を残したまま動的予約を接続しない。

## 4. ストリーム課金・下位上限・中断

### 4.1 1試行の順序

1. 同session/用途permit/phase/停止状態を検査する。残時間・試行許可・必要な最終予約・G/Eの残量を確認する。
2. 試行claimとC（finalならslot残数も）を消費してfetchする。送信に失敗しても返金しない。許可されなかった試行はCを増やさない。
3. terminal status（401/403/404等）は現行同様bodyを開かずcancelする。この場合読んでいないbodyはG/Eに見積り加算しない。試行は1回使用済み。
4. bodyを読むstatusでは、各chunkのbyteLengthをS/G、証拠ならEへ加算し、上限を比較する。**上限超過chunkも受領済みの量として計上**し、成功chunk列へ追加する前に停止する。
5. EOFまで枠内だった正常応答だけをdecode/JSON.parseする。失敗statusのbodyは数えるが保持・JSON解析しない。成功であっても全量読取後だけの16KiB検査にはしない。
6. 固定射影/rows/版検査後、privateな受領物を発行する。原レスポンス・HTTP header・余分な列を証拠/ログへ残さない。

Gが全体上限を超えるchunkはreceive_budget_exceededを優先する。同じchunkでE/Sも超えていても全体停止を下位の未評価へ格下げしない。既に記録した取消/期限/認証等のprimaryがあれば上書きしない。加算はchecked arithmeticとし、overflow/非正規chunkは固定内部失敗で止める。

正確に上限と等しいEOFは受理可能。E/Gが残0になった後は次のHTTP試行を始めない。進行中試行のEOF確認readは許すが、非空chunkが続けば加算して直ちに超過停止する。chunkを受け取る前にOS/fetch内部でbufferingが起き得るため、16KiBは「累計読取/保持/受理」の制約であって、既に配達された単一巨大chunkやfetch内部メモリを16KiBへ制限する保証ではない。

Content-Lengthはbody上限の代替にしない。欠落・過少申告・圧縮応答でも実際にreaderから得たbyteを数える。過大申告を早期拒否に使う場合も実未読byteを消費済みにしない。圧縮前のネットワーク転送量・header量はこのbyte会計の保証外。

### 4.2 下位超過とretry

| 事象 | 試行/受信会計と継続 |
|---|---|
| 証拠1応答S超過、E/Gは枠内 | 当該論理GETをevidence_limitで未評価。reader/HTTPを中断、application側の再GET/retryで回避しない。他tableはE/時間/試行が許せば処理可能 |
| 証拠累計E超過/残0 | 証拠受付/GETをstickyに閉じる。未完了BR-006はevidence_limit、最終比較のknownを生成しない。他規則の通常取得はG/全体予算の範囲内でのみ継続可能 |
| G/通常応答上限/全体payload枠超過 | 既存の全体停止を維持。証拠専用の理由へ置換しない |
| 429/5xx/通信失敗 | 最大1retry。失敗bodyもS/G/Eへ課金し、retryでSだけを0へ戻す。retry前に時間・E/G・試行枠を再検査 |
| EOF前のtimeout/通信中断 | 読取済みbyteと試行を返金しない。既存のupstream_unavailable retry方針の範囲だけで再試行 |
| JSON/rows/版不正 | 固定invalid_observation等。単なる解析失敗をupstream_unavailableへ変えてretryしない |

同じbytesを再読したretryも別HTTP受信として新たに計上する。cancel/late response経路から同じread完了を二度計上しない。全体停止で受理しない遅延bodyはcancelし、証拠receipt/解析結果を発行しない。測定対象は実際に読取完了として処理したchunkだけで、未読の通信量を計測済みとはしない。

## 5. 最終再読の動的予約モデル

Q=有効な全HTTP上限（最大210）、C=消費済みHTTP試行。最終slotは`parent`、`metadata`、`table:<受付番号>`。各slotは残試行r_i（初期2）、logical状態、同session/source/用途へのbindingを持つ。

最終開始前の上界は **R(T)=4+2T**。一般にはR=未完了slotの残試行合計。常に`C + R <= Q`を維持する。予約は物理試行の事前課金ではなく、通常取得が使えない将来枠であり、stats.requestsには加算しない。

### 5.1 初期化と通常取得

- 初期parent/metadata再読slotを各2確保する（R=4）。新モードの受付時点で`C+4<=Q`を満たせなければ追加取得前に拒否する。低減テスト上限が4未満なら新モードは受付不能。既存非BR-006経路の振舞いは変更しない。
- 通常/認証/初回の実試行ごとに`C+1+R<=Q`を検査してCを増やす。最大値なら拒否。OAuth交換も通常枠で数え、final枠から借りない。
- 通常枠不足は新規payload/初回取得を止める理由であり、予約済みfinalまで使えないglobal cancelとは区別する。既存のpartial/最終照合経路へ移り、Rを0にして通常取得を再開しない。

### 5.2 新しいtableの受付

sourceが正規化済みnameを重複確認し、session台帳がbusyでないときに、受付claim・slot・Tを一体で更新する。新規tableについて、初回最大2試行に加え最終slot2試行を確保できることを要求する：

`C + R + 2(initial allowance) + 2(new final reservation) <= Q`

通ればTを1増やしfinal slot（r=2）を発行する。初回2試行分は**admission判定の余裕**であって、初回を始める前にCへ課金しない。逐次transportのbusy境界内で初回GETを開始し、間に別の通常GETを差し込ませない。初回が1試行で成功した残り1は通常余裕のまま。

同名cache hitではT/Rを増やさず、過去に失敗した初回を新論理GETとしてやり直さない。9名目・余裕不足・E枠閉鎖・通常phase終了なら受付しない。Tやslotだけを先に増やして失敗時に残す半端な更新を禁止する。拒否したnameを別名/別APIで再受付しない。

初回0件/曖昧/不正/取得不能はUnknownのまま保持する。そのtableのfinal slotは直ちに通常枠へ戻さず、整合phaseで「初回証拠が成立しないためfinal GET不要」と一度だけ終端化できる。未取得の最終を成功/安定観測にせず、final unavailable/not_collectedを発行する。不要な再読をしてUnknownをknownへ昇格させない。

この未取得finalのobserved_atは未実施判定を固定した内部時刻であり、外部tableを再観測した時刻ではない。unavailable状態/理由と一体でのみ渡し、rowsの観測時刻へ転用しない。

### 5.3 final slot消費と解放

通常phase→整合phaseは一方向。固定sourceのfinal開始claimを取った後、新規table/初回/payloadを禁止する。実行順は既存の親→metadata、その後table受付順。各tableの比較は最終受領後、すべて55秒までに終える。

final試行は同slot専用のprivate permitを要求する。`r_i>0`、同source/path/table/phase、同論理GET、retry回数、C<Qを検査する。原子的に`C+=1; r_i-=1`（従ってRも1減）してからfetchする。これによりC+Rは不変。失敗/timeoutでも戻さない。

- 1試行目で成功またはretryしない終端なら、そのslotの未使用r_iを0にして解放する。r_iは復活しない。
- retryは同slotの残り1だけ。親がmetadata/tableの枠を使ったり、table AがBの枠で3回目を試みたりできない。
- 解放した余裕で通常phaseへ戻らず、完了slotの再GETや別slotの最大2試行超えも認めない。
- 初回不足でfinal不要、E枠閉鎖、整合phase期限等で未実施なら、固定理由付きの未確認でslotを終端化する。試行は0、受信も0。枠解放だけでGETしたことにしない。
- 全体停止後は予約の有無にかかわらず新fetchを禁止し、残slotを失効させる。解放は後始末であり、予算を借り直す操作ではない。

現行のfinal booleanとこのpermit経路を混在させない。新モードでは旧親/metadata verifyも自身の専用slotを通し、無印の`get(path,true)`で全残枠を利用できる迂回を拒否する。非BR-006の固定4予約は互換経路として別途維持する。

### 5.4 境界例

| 状態 | 判定 |
|---|---|
| Q=210、T=0、R=4、C=202 | 新table受付は202+4+2+2=210で可。R=6、初回2試行後C=204で通常余裕0、final6試行は残る |
| 同条件でC=203 | 211となりtable受付不可。T/R不変。既存予約4は維持 |
| T=8、R=20、C=190 | 新たな通常試行不可。予約slotに限り最大20試行が可能（時間/受信枠は別条件） |
| final直前C=190/R=20、親が1試行で成功 | dispatch後C=191/R=19、親の未使用1解放でR=18。metadata/tableは自分の枠だけを使う |

最悪244試行（既存認証2+初回親/リリース/一覧6+既存final4+payload200+table初回/最終32）は210内に入らない。100 payload/8 table/全retryを完遂する保証はしない。予約は試行を確保するだけで、時間/受信量/アクセス権/正常応答を保証しない。

## 6. 時間・失敗分類・診断保持

通常50秒・整合55秒・全体60秒は、sessionの既存単調時計と低減期限に従う。低減設定では現行の比例reserve（通常は期限の1/6、整合はその半分を残す）を尊重し、固定50/55秒を新しい延長として使わない。HTTP timeoutはmin(10秒,phase残時間)。retry待ちも同じphase/全体期限に含める。

50秒で新初回/payloadを止め、55秒で未完了final/比較を未確認にする。残りは集約/worker終了確認に使い、終了後checkpointまで全体60秒に含める。最終slotが残っていても延長しない。接続済みworkerがない本工程では、worker中断済みという証拠を捏造しない。

| 停止/不足 | 固定理由と上位での扱い |
|---|---|
| 下位table/予約admission/証拠受信枠不足 | 内部scope_evidence_limit、観測はevidence_limit。当該BR-006を未評価/partial。既存他規則は従来契約の範囲で保持 |
| 初回/最終の404・列/shape不足・曖昧・上流2試行失敗 | 固定unavailable理由。knownに補完しない。最終不能なら暫定BR-006候補を撤回 |
| 通常試行枠不足 | request_budget_exceeded。通常を止めて予約finalへ進める範囲を保持。新session/retry増加は禁止 |
| 401/403 | authentication_failed/access_deniedで既存全体停止。sys_db_objectにcluster_state専用403例外を流用しない |
| 全体受信/payload枠・取消・全体期限 | 既存のreceive_budget_exceeded/payload_budget_exceeded/cancelled/deadline_exceeded。下位Unknownへ格下げしない |
| source/用途permit/slot混入、二重final、不正状態 | evidence_binding_mismatch/invalid_state等でowner停止。生例外ではなく接続契約の固定診断へ渡す |
| 親/一覧再照合失敗・版変更 | 既存のconsistency unverified/changedを保持。tableだけ安定していてもBR-006を確定しない |
| reader/worker終了未確認 | primaryを維持してcleanup未確認を保持。予約解放済みだけでcleanup成功と認定しない |

primaryは最初のstage/codeを保持し、後のclose・枠解放・late responseで上書きしない。下位枠の既存公開JSONへの正式対応は次版契約の前提であり、現在のerrors列挙へ新codeをこっそり追加しない。

## 7. 後始末と未保証

失敗時はまず用途permit/ownerを失効させ、pending fetch/read/retry待ちを中断する。reader.cancel・body.cancelの拒否/遅延を無期限に待たない。late fetch responseにもcancelを要求し、handle/receiptを発行しない。listener/timer/slot/台帳の解放はidempotentにし、session.closeによる同時実行枠/token snapshot解放を二重実行しない。

現在のtransportはreader.cancel等を待たずにbest-effortで呼ぶ。本案のcleanup確認を対応済みとはしない。実際の終了確認と残予算への合流、未確認時の固定表現は接続工程で合成検証する。JSメモリの物理消去・未読の回線量・fetch内部buffer上限は保証しない。

## 8. 必須合成テストと独立oracle

| 区分 | 条件・確認 |
|---|---|
| byte境界 | S=16KiBちょうど/超過、E=256KiBちょうど/超過、G/低減応答上限の先行超過、同chunkの同時超過。超過chunkの課金・保持前停止 |
| 分割と申告 | 同bodyの1byte分割/単一巨大chunk、空chunk、Content-Length欠落/過少、圧縮後readerのbyte。JSON成功でもstream枠違反は受理しない |
| retry/失敗 | 429/5xxのbody後retry、途中timeout/通信失敗、2試行失敗。Sだけreset、C/G/Eは返金なし。401/403のstall bodyは読まず停止 |
| admission | T=0/1/8/9、同名hit、C+R+4の等号/1不足、低減Q<4、受付途中失敗。拒否時のT/R不変・初回前の原子性 |
| slot | 親/metadata/table別2枠、1回成功の余剰解放、最終retry2回、別slot流用/3回目/旧final=true/別session permitを拒否 |
| 事実の区別 | 初回不足でfinal不要、E枠閉鎖でfinal未実施、slot失効。未試行を安定観測にしない。HTTP0回/受信0と理由を対応 |
| 時間/取消 | 通常/整合/全体の境界ちょうど、retry待ち中・read中・dispatch直前の取消、低減期限。枠を理由に延長しない |
| 解放/診断 | late response/read、cancel拒否/無応答、二重close、停止後再入。primary不変・cleanup未確認の非上書き・二重課金なし |
| 結合/互換 | matched同sourceだけ、asset/table/job/phase混入拒否、別認証cacheなし。旧固定4/旧JSON/既存上限の非変更 |

oracleは製品の予約/課金関数を再使用せず、合成fetch/readのイベント列から独立集計する。`C=実fetch開始数`、`G=処理した全chunkの合計`、`E=そのうち証拠用途chunkの合計`、`R=未完了slot残数合計`を照合する。各イベントでC+R<=Q、slot残0..2、T<=8、通常dispatch時の予約不侵害を確認する。超過試験ではcounterがcapを越えた事実と受理停止を確認し、capへ丸めて誤って一致させない。

## 9. 承認待ち・次の実装単位

未承認：8 table/16KiB/256KiB、R(T)とadmission余裕4、初回不足時のfinal不要終端、固定順序、下位/全体停止の上位表現。本書だけで本番policy/capを投入しない。sys_db_objectの実fields/ACL/Global応答、実ネットワークのchunk/取消挙動は未確認。

最初は**純粋な予約台帳・費目の内部型・合成イベントoracle**から実装し、次に合成stream/transportへ下位課金と中断を接続する。その後に固定source/実worker/上位JSONへ進む。先に汎用GETへsys_db_objectやfinal例外だけを追加しない。

本工程は文書のみ。VM/監視/telemetry保留・Unknown・全体受付無効を維持し、実装・実worker接続・実機操作・トークン発行・設定変更・permit発行は行わない。

## 10. 純粋台帳の限定実装

`abort-scope-evidence-reservations.ts`は独立した合成台帳ごとにread/table/slot/attemptのopaque handleを発行する。Qと既存消費Cは合成fixtureとしてstrictに受け付け、Q<=210・C+4<=Qを受付条件とする。実sessionからの受領証明ではなく、新台帳を自由に作れるので本番の予算保護には使えない。

初期予約は親/metadata各2。table受付はC+R+4とT<=8を検査して、slotと初回readの占有を一体で登録する。初回が終わるまで別通常readを差し込めない。cache hitは同じtable handleを返すが、初回readを再開始できない。受付不足はT/R/Cを変えず証拠受付を閉じ、通常枠不足は通常readを閉じる。これらは非terminalの固定拒否で、既存final予約を失効させない。

費目型`ScopeReservationCost`は合成のHTTP試行1回・lane・論理read内の1/2回目・final slot番号を表す。`ScopeReservationDimensions`はC/R/Tを区別する。予約はCに数えず、dispatch相当のstartだけがCを増やす。retry待ちに移っても返金せず、同logical readは最大2試行。成功/非retry終端で残slotを0へ解放する。doneは論理処理の終端であり、HTTP成功や証拠安定の認定ではない。

finalへは一方向に遷移し、親→metadata→受付table順で自身のslotだけを使える。別台帳/clone/別table/旧booleanの流用、二重開始/完了、3回目の試行はterminal停止。first primaryを保持して全未使用slotを失効させるが、Cは戻さない。初回unavailableのtableだけfinalを未実施でskipでき、final attempt=0・state=skippedを保持する。実観測receiptや安定性は発行しない。

独立oracleはtest fixture内だけに置き、製品型/会計関数をimportせず、イベントprefixからC/R/Tとslot残数/試行数を再構築する。32本の正常traceと拒否/中断trace、Q=210の境界で照合する。実fetchがないため、oracleのdispatchは**合成fetch開始イベント**であり実通信の測定ではない。

G/E/Sのbyte課金・stream/EOF・下位受信cap・実clock/期限/signal・ReleasePermit/実source/実worker/上位ownerへの接続は未実装。取消/期限は合成のstop通知だけ。従来transportの固定4予約や60秒/210試行、公開0.2/0.3は変更しない。費目型の存在で実resource/終了証拠が得られたとは扱わない。byte oracleはstream工程で追加する。

検証は[純粋予約台帳・oracle記録](E2E_BEST_PRACTICE_ABORT_SCOPE_RESERVATIONS_SYNTHETIC_2026-10-25.md)を参照。新moduleも既存`!dist/review/abort-scope-evidence*`のnpm除外対象。運用cap承認・全体受付・本番permitは有効化せず、VM/監視/telemetry調査保留を維持する。
