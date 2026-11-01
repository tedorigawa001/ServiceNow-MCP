# EF-03B B-02：source・会計・nativeの移行範囲と共通化境界

Version: br006-development-migration-b02-draft-0.13 / Date: 2026-11-01。
Status: **B-02-01〜03の値検査・同core会計・注入同reader cleanup／source受理を限定実装（§7〜9）。RC-01／02のrelease純粋値契約・比較を追加（§11）。旧試験をすべて残す。全case移行・release判断のsource移行・friend撤去・実接続は未実施。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実通信・実機操作・設定変更・Pushは行わない。**

設計基準：`5e79b21`。B-01の生成順はbusy事前判定→core→admission→登録ownerに修正済みであり、その前の順序へ戻さない。[移行親設計](BEST_PRACTICE_ABORT_SCOPE_DEVELOPMENT_ROOT_EF03B_DESIGN.md)のB-02を細分化する。§1〜6は初版の計画・受入条件、限定実装と未対応の区分は§7〜9を参照する。

## 1 現在地と今回の境界

B-01時点の[開発assembly](../tests/support/review/ef03/assembly.ts)はconstruction-onlyで、共有construction kernelと新規canonical coreを使うが、source・ready世代・ReleasePermit・readerを持たない。C/G/P=0、final予約も未実施だった。B-02はこれを新規開発runの内部で拡張し、既存実sessionの採用機能を追加する工程ではない。

現在の依存は次のように分かれている。

| 現行箇所 | 再利用できる候補 | そのまま開発rootへ持ち込まないもの |
|---|---|---|
| [bounded-source](../src/review/bounded-source.ts) | 固定5列の親検査、build_name projection、純粋なrelease値比較 | classのprivate parent／permit、CompositionSourceConstructionのcapture／takeStatus、実session claim |
| [canonical budget](../src/servicenow/review-canonical-budget.ts) | 新規core生成、同lease観測、bootstrap会計portの唯一取得と予約 | 既存runのcore／portの受入れ、初期counter指定、writerとbootstrap portの併用 |
| [lifecycle](../src/servicenow/review-evidence-lifecycle.ts) | 追加抽出を検討する固定理由・状態遷移 | moduleのregistered WeakSet、実session登録関数、実source／permitへのlookup |
| [native診断](../src/review/abort-scope-evidence-native-diagnostic.ts) | 固定purpose slot・HTTP／cleanup二軸診断、同reader操作の最小kernel候補 | module全体のimport。末尾のimport時friend取得と実class向けdriverを含むため |
| [fake I/O](../src/servicenow/review-composition-fake-io.ts) | data-only transcriptの有限構造・bytes pinの規則 | 同梱fake moduleの恒久的流用、任意dispatch callbackを本番へ残す方式 |

`result-schema-v2`等を共有する場合もruntime importの推移閉包を確認する。型だけの参照と実行時依存を分け、type-onlyのbounded-read参照を理由にruntime classをimportしない。検査コードの共有は実classの参照同一性を証明しない。

## 2 共通化する部分／rootに残す部分

| 境界 | 共通kernel候補 | rootごとの所有と禁止事項 |
|---|---|---|
| 値検査 | 入力値→固定schemaの成功／固定理由、親5列の比較、build_nameだけのprojection | bytesの取得・pin・消費、targetとの結合、private snapshotへの採用は各root。任意の判定結果をackへ昇格しない |
| 会計 | 既存canonical creatorを再利用。必要ならbootstrapの純粋状態だけ追加抽出 | core・lease・唯一port・停止通知先は同run生成。別coreのstatsコピーや同じ数値をbindingに使わない |
| lifecycle | 純粋なready／claim遷移と固定失敗写像だけを候補化 | realm・identity・WeakMap／Set・世代の参照・source／attempt／windowは各rootのprivate closure。共通singleton登録は使わない |
| native | 同readerの操作順／cleanup factsの固定処理を最小候補として検討 | Response／readerの取得と再使用台帳、元window、終端issuer／consumerは開発root所有。実classのdriverやfriendに委譲しない |
| 診断 | construction kernel、必要な固定slotの純粋copy／seal | run停止・cleanup失敗・construction失敗を分離。診断copyはlive terminalでもcapabilityでもない |

共通kernelは両rootをimportせず、session lookup・認証snapshot採用・fault selector・任意installerを持たない。状態遷移の大きなコピーが必要なら実装を止め、最小抽出を別差分として先にレビューする。本番未使用の開発orchestrationを「共有」のためだけに配布kernelへ置かない。既存classを継承／mockして別assemblyと呼ぶ方式も採らない。

## 3 移行の順序と実装単位案

### B-02-01：source値検査の最小抽出と開発lifecycle

親の固定5列（sys_id、state、application、sys_updated_on、sys_mod_count）、同target、release行最大21件・build_name projectionの成功／拒否を現行と一致させる。意図的に落としている追加node列と、strict親schemaの余剰列拒否を混同しない。純粋検査を抽出する場合は既存classも同関数へ接続し、本番回帰を別に実行する。

開発runだけが新しいsource identityとready世代を生成する。transport／sourceのclaimは同realm・同run・同snapshot・同leaseを参照で照合し、失敗時もclaimを戻さない。親→releaseの順を固定し、consumerは未開始→consuming→受理／失敗→失効とする。pre-guard前に開始claimを消費し、post-guard後だけ結果を受理する。外部のsource／consumer／permit／生成keyは受け付けない。

まずB-SAの値・順序・foreign／copy・二重消費の対応試験を追加する。公開summaryの文字列やhistorical binding boolからidentityを作らない。実ReleasePermitは発行せず、必要な開発側の後段結合は非互換brandの内部tokenに限定し、結果は非実行draftにする。

### B-02-02：同coreの会計・固定200 transcript

B-01で作る同coreから`takeBootstrapAccounting()`を一度だけ取り、同portへ停止ownerを接続してfinal4枠を予約する。snapshotからの認証mode選択は合成データのみとし、旧B-ACKのcached／exchange条件を明示したprofileに固定する。実token・URL・provider・既存sessionは入力にしない。未知field、getter、proxy、共有storage、過大件数／bytes／遅延は待機前に拒否する。

固定順は合成authentication（必要時）→親→release。dispatch直前だけCを1加算し、同期throw／rejectもその1回に含める。dispatch前拒否はC=0。同じpin済みchunkをGへ一度課金し、そのbytesをUTF-8／JSON解析してprivate ack候補へ渡す。上限超過のchunk会計は既存coreの順序を維持する。bootstrapのPは0で、GをPへ重複課金しない。retryの追加・非200 fallbackの有効化は行わない。

portのreserve／dispatch／chunk／releaseを外へ返さず、legacy writerで二重課金しない。元60秒・210試行および各受信上限は拡張せず、低減したcapも維持する。元clockからfloorを計算し、cleanup／取消の時点で新たな起点を作らない。release比較は既存C方式の値判断だけを共有候補にし、200の空観測と403／404のstatus受理を別経路に保つ。どちらも正式証拠発行の許可ではない。

B-ACKの固定200群を追加し、予約4・残C・G・Pを手計算oracleと照合する。予約releaseは一度だけ、失敗前のcounterとfirst reasonを保持する。source消費と会計接続が揃うまでnative群を接続しない。

### B-02-03：注入Response／同reader cleanupとsource受理

診断ownerをresource取得前に確保する。開発root内部のResponse delivery／attempt／windowへreader所有を結合し、read=0のcancel-only経路でcancel・closed取得／join・releaseLockを一度ずつ処理する。bodyなしはno_bodyでありEOF／JSON ackではない。取得途中のthrowも取得済みresourceだけを固定回収し、不明な取得をconfirmedへ変えない。

同Response／readerの再使用は開発専用台帳で拒否する。台帳の寿命は開発factory内のrunをまたぐ範囲を含め、factoryを越える再使用も試験範囲にする場合は、外部既存handleの採用口ではなく開発専用delivery発行境界を先に設計する。module singletonの本番resource台帳を共有して解決しない。このfactory越えの方式は実装前確認事項とする。

typed cleanupのconfirmed終端だけを同sourceの唯一consumerがclose前に消費する。取消・期限・foreign attempt・二重消費は停止し、発行済み終端も同期失効する。HTTP理由、cleanup未確認、受理拒否、teardownを固定slotに別保持し、後段の取消で先行HTTP診断を上書きしない。元cleanup floorまでのjoinと全run deadlineを区別する。B-ND群とB-UNIT群の依存を棚卸し、ND moduleのimport時friendに触れない入口から試験する。

## 4 固定cleanupと診断の所有

開発rootのclose開始を先に立て、新しいdispatch／消費を禁止する。source／ack／terminal継続を同期失効し、取得済みreaderのcleanupを元window内でjoinした後、会計予約release・core close・listener／timer／controller・自分のadmissionの固定解放へ進む。具体的な挿入点はB-01のowner先行rollbackと整合させ、部分生成／再入でも未開始slotを解放したと数えない。

生成中の失敗はconstruction、commit後はrun primary、HTTP／readerはpurpose slot、解除失敗はteardownに保持する。copy／sealは解放結果を反映した後とし、late settleで変更しない。cleanup未確認でも後続slotを試行し、reservationやadmissionを他runから返さない。文字列の物理消去や強制GCは保証せず、参照解除とbytesの所有範囲内の破棄を区別する。

## 5 保証区分と旧試験の併存

| 報告区分 | B-02で追加する証拠 | その成功から主張してはいけないこと |
|---|---|---|
| shared-kernel | 同じ純粋関数の値／状態／会計の独立oracle照合 | 実sessionと実sourceのprivate参照結合 |
| development-assembly | 開発brandのsource→同core→同reader→consumer→close | 実classのready世代／ReleasePermit／認証snapshotの同一性 |
| production-class-fake-I/O | **残す旧B-SA／B-ACK／B-ND／B-EF等**が直接通る実class経路 | 実認証・実通信の確認、正式発行口開放 |
| production-formal-binding | 現時点では未完了（親設計PC-01〜05で管理） | 開発summaryや成功数による補完 |

旧testの削除・skip・期待緩和・friend撤去・compiled fixture置換はB-02の完了条件に含めない。旧fullName→新ID→共有部分→root固有部分→未代替保証を対応表に残す。「移行」はこの段階では追加併存を意味する。件数を足して実class coverageが増えたと集計しない。実class保証を減らす変更はB-03の対応表・別承認を経る。

最低受入条件：

- 同じ合成principalで本番2枠保持中／開発2枠保持中の両方向に、実classの枠・construction・run reason・statsが不変。失敗／取消／部分rollbackも含める。
- 値検査のvalid／malformed UTF-8／JSON・余剰列・foreign target、親→release順、copy／foreign／二重consumeを独立期待で確認。
- Cは操作回数、Gは合成bytes長の和、P=0、final予約4→0を別oracleで確認。4／5試行cap・各byte境界・同chunk過大時の実会計順を確認。
- nativeはread=0、cancel／closed／release各試行数、no_body、取得途中throw、pending／reject、元floor等号・取消・late settleを確認。cleanupの観測事実と受理結果を別assertする。
- getter／proxy／外部session／source／core／lease／driver／consumer／診断copyの混入拒否と、例外本文・token・親bytesのsummary非露出を確認。
- 共通kernelの依存閉包にruntime登録／friend取得がなく、開発rootから実classをimportしないことを検査。実classを比較観測するtest fileとは区別する。

## 6 費目・build・保留事項

開発rootの追加所有はrunごとのsource identity、ready／source／transport claim、private ack／terminal台帳、同coreのbootstrap port、固定purpose3診断slot、同reader1所有束とcleanup待機である。transcriptは有限2〜3応答、pin済みbytesと解析valueが重なる寿命を記録する。全件traceや無制限retryは追加しない。正確な割当byte layout・Rust work・必要量projectionは未導出でUnknownを維持し、全体受付へ加算済みとしない。

B-02の各段階で対象typecheck・新旧関連回帰・必要な本番buildを順次確認する。全体試験は重複起動せず、失敗時は元期限のまま記録して切り分ける。専用開発build／compiled保証はB-03、配布friend撤去はEF-03C、artifact負の対照はEF-03Dに残す。現行のcompiled ackがsynthetic_ioを使う依存を先に切らない。

初版で実装前確認事項としたのは、最小共有schema／native kernelの抽出閉包、factory越えのresource再使用拒否、固定cleanupの挿入順と未確認時のjoin、全旧caseの対応である。これらを満たす設計がなくても旧試験を消して先へ進まない。本書は保証削減・本番bindingの承認ではない。

## 7 B-02-01の限定実装と保証範囲

[source-values kernel](../src/servicenow/review-kernel/source-values.ts)へ、親5列strict schema・target一致とbuild_nameだけのprojectionを抽出した。runtime importはzodのみで、session・登録・friend・consumerを参照しない。[実source](../src/review/bounded-source.ts)のprivate受理と通常の親取得／最終再読で同じ検査を使い、固定invalid_responseを既存BoundedReadErrorへ写像する。親余剰列拒否、releaseの余剰node列破棄、欠落build_name→null、既存呼出し元の件数上限を維持する。release行数・envelope検査は呼出し元所有であり、projection単独にbounded取得全体の保証はない。C方式判断・実permit発行部分は抽出／変更していない。

[開発source](../tests/support/review/ef03/source.ts)はfactoryごとの生成WeakSetを持ち、wrapperでなくrun identityをキーに一度だけ生成する。bindingはroot内部で固定した同run／snapshot／leaseのcontext参照。prepare→ready世代1→親→releaseの順、pending ack最大1個、private Mapの同ack／purpose、一度限りの削除・pre／post guardで検査する。guardの再入や最終callback内失効でも状態を復活させない。失敗後の再prepare・同run再生成を拒否する。別run／rootの台帳や実登録singletonへ触れない。

開発assemblyの任意`source` profileはtarget・parent・releaseのdata-only値に限定し、待機前にpinする。深さ5、node512、文字・key合計65,536、object／array最大64 key（arrayは63要素）で`invalid_input`として拒否する。これは資源上限であり、release行21件の上限はpinでなく共通値検査に残すため、22行は本番と同じく`invalid_response`となる。getter／proxy／特殊prototype／sparse array／外部consumer等は採用しない。この開発profileの有限上限は実transportの受信枠ではない。生成するcontext／ack／guardはroot内部だけにあり、runの返値は`source_values_only`と解放後の固定summary。開発helperのtrusted生成引数を、本番sessionを採用する入口と扱わない。

sourceはcommit後に開始し、取消時は同期revoke、finallyではrevoke→sealを先に行ってからB-01の固定解放へ進む。construction primaryとrun primaryを分け、sourceの最初の固定理由と消費数はseal後も保持する。値はprivate ack消費で破棄し、contextの参照はrun終了で手放す。公開診断には値／ack／source／leaseを返さない。sourceの状態は開発realmの事実であり、constructionのhistorical source_boundや実classのsource結合へ昇格させない。

保証はshared-kernel単体、development-assembly、旧production-class-fake-I/O回帰の3区分。旧試験は無変更・併存し、移行完了数へ加算しない。B-SAの順序／混入／consumeに対応する限定試験を追加したが、旧fullName対応表全体・B-ACKの会計／C方式連続試験・B-NDの同reader試験は未移行。C/G/P=0・R未予約、readyは合成世代であって認証証明ではない。native・Response台帳・実ReleasePermit・選択payload／workerは未接続。

[新source試験](../tests/review/development-source.test.ts)、[共通値試験](../tests/review/source-values.test.ts)、[compiled値fixture](../tests/review/fixtures/compiled-source-values.mjs)、[検証記録](E2E_BEST_PRACTICE_DEVELOPMENT_SOURCE_B0201_2026-11-01.md)を参照。compiled fixtureは共通値検査だけであり、開発assemblyのcompiled保証はB-03に残す。後続のB-02-02は§8、B-02-03は§9に分離し、全体受付や正式発行は開かない。

draft-0.3のレビュー修正：開発profileのpinが全配列を21要素に制限しており、22行のreleaseが値検査へ届かず`invalid_input`となって本番の`invalid_response`と一致しなかった。pinの配列上限をkey上限の資源境界へ戻し、21行上限は共通値検査だけで判定する。また開発sourceの`reject()`がrevoke済みの`closed`を`failed`へ上書きし、その後の`seal()`が`invalid_state`で失敗し得たため、revokeを終端状態として保持するよう修正した。上位設計からの版数リンクも更新した。

## 8 B-02-02：同core bootstrap会計と固定200 transcript

[開発bootstrap](../tests/support/review/ef03/bootstrap.ts)を開発root内部でpin・実行する。profileはtarget、合成auth（per-user／cached／exchange）、固定順の2〜3 response、低減limitsだけ。responseはpurpose・bytes・delay_ms（0〜10,000）・固定outcome（ok／throw／reject）を受け、status／URL／fetch／core／writer等の入力は拒否する。すべて成功応答を200相当として扱い、throw／rejectは通信を行わないdispatch失敗の負の対照である。source値profileとの併用を拒否する。

bytesはnative accessorで長さ・bufferを検査し待機前に別Uint8Arrayへコピーする。getter／proxy／sparse／SharedArrayBufferを拒否する。1応答4MiB、最大3応答、最大コピー12MiBの有限上限。requestsは4〜210、total_bytesは1〜16MiB、response_bytesは1〜4MiBの低減のみ。profileの既定上限は実transportを動かす権限ではない。入力への参照を診断closureへ残さず、終了時は保有bytesをzero-fillして破棄する。呼出し元のbytesは変更しない。

rootの既存canonical coreから一度だけbootstrap portを取り、同portへstop ownerを結合しfinal4枠を予約する。counter seed／別core／別leaseは受け付けない。dispatch直前にCを計上し、拒否はC=0、同期throw／rejectはC=1でretryなし。受領した同bytesをGへ一度課金してからUTF-8／JSON解析し、B-02-01のprivate ackへ渡す。受信上限超過chunkも既存coreと同順に課金し、bootstrapではP=0を維持する。各試行のC差分1・G/P不変を観測して確認し、chunk後もGがそのbytes長だけ増えC/Pが不変であることを本番bootstrap契約と同じく確認する（不一致は`internal_review_error`）。

合成exchangeだけauthentication→親→release、他modeは親→release。合成tokenはaccess_token・expires_in・token_typeを既存条件に合わせて検査し、run全期限を覆う有効時間とBearerの大小文字を確認した後にready世代1へ進む。これは合成modeの試験であり、実認証snapshotの由来／cached token期限の実証拠ではない。token・parsed値・ackを返さない。

元deadline（最大60秒）と同leaseを使用し、phase予約はmin(10秒, deadline/6)、試行floorはmax(phase予約, 試行開始時remaining−10秒)。run期限→phase期限→試行floorの順で固定理由を保持する。delay待機は元floorのtimerと同signalへ結合し、取消・拒否でもtimer／listenerを解除する。新しいclock起点やcleanup猶予は作らない。native cleanupの証明ではない。

port取得後は成功・失敗・取消のfinallyでreleaseを一度だけ試行し、sourceを同期失効してからB-01の固定解放へ進む。summaryは`bootstrap_transcript_only`、C/G/P、claim・予約peak・残予約・release試行数・dispatch数の固定copyだけ。bootstrapのfinallyでportが閉じた後の外側waitは会計操作を行わず、取消と最終解放だけを扱う。省略時とsource値専用経路はC/G/P=0・R未予約のまま維持する。

releaseは固定envelope／projectionまでを消費し、結果は明示的に`release_match: not_evaluated`とする。Australia以外や空の有効行を受理しても、それは値検査の成功だけ。既存C方式のrelease判断・operator config・permit／prepared結合はまだ移行していない。B-ACK全caseの移行完了とは数えず、旧実class試験を残す。注入nativeの限定接続はB-02-03（§9）、開発compiled保証はB-03、friend撤去はEF-03Cへ分離する。

[新規bootstrap試験](../tests/review/development-bootstrap.test.ts)と[検証記録](E2E_BEST_PRACTICE_DEVELOPMENT_BOOTSTRAP_B0202_2026-11-01.md)を参照。実class保証と別assembly保証を分け、Unknown・全体受付無効・正式発行口閉鎖を維持する。

## 9 B-02-03：注入Responseの同reader cleanupとprivate source受理

[開発native境界](../tests/support/review/ef03/native.ts)は実ResponseからEF-03専用のopaque deliveryを発行する。同Responseの二重登録を拒否し、pin時のtakeでdeliveryを消費する。raw Response／proxy／コピー／診断はrootのdeliveryとして受け付けない。profileはtarget・parent_bytes・deliveryの3項目だけで、source値／通常transcriptとの併用を拒否する。delivery登録はreader所有の証明ではなく、reader所有は後段の取得成功から始まる。

[既存cleanup部品](../src/review/abort-scope-evidence-status-cleanup.ts)の操作・事実収集を再利用する。新しい開発専用realmはResponse／streamのWeakSetを別生成し、EF-03の複数root間で再使用を拒否する。ST-02／ST-03の既存台帳や、実session／runtimeの登録台帳とは共有しない。この開発moduleの依存はnodeのStreams／utilとzodで、import時friend取得を行うND moduleは読み込まない。旧cleanup／workflow入口は元の公開method集合を維持し、新proof methodを露出しない。

root生成の同core・同leaseからnative ownerをparent取得前に確保し、同sourceのprivate生成継続へ参照を渡す。B-02-02の同portで親C=1・G=parent bytes長、releaseの注入試行C=1を計上する。release bodyはread=0でcancel-onlyにし、Gへ未読bytesを足さない。内部の空release bytesはこの分岐では解析・ack化しない。final4枠はcleanup join後にbootstrapのfinallyで1回返却する。

native操作は捕捉したprototype操作だけで、同readerのgetReader→closed取得→cancel→元floor内join→releaseLock。readerが分かる取得途中失敗ではそのreaderを回収し、handleが返る前のthrow／closed取得不能／解除throwはunconfirmedにする。callerが既にlockを所有するstreamを勝手に解除しない。bodyなしは操作0・no_bodyであり、EOF／body ackを意味しない。許容受理はreleaseの403／404だけで、401はhard HTTP、その他は本subsetではinvalid_responseの診断対象。一般HTTP意味論の変更ではない。

proofは同owner内のrecord／anchor／header／cleanup／元window参照に私有Mapで結合する。発行claim・消費claimは各1回。元windowのboundsは解析時のimmutable copy、相関は元descriptor参照で確認する。sourceは固定生成時に保持したownerだけを使い、開始状態とproofをguardより前に消費するため、pre／post guard拒否後も再利用できない。外部診断をproofへ変換する関数、任意consumer／verifierをrootへ渡す口はない。成功してもsourceのstatus_consumptions=1だけで、release_consumptions／permit／fallbackは増やさない。

取消はsourceとnative発行継続を同期失効するが、既に所有したreaderのcleanupは同lease・元floorまでjoinする。signalやcleanupの時点で期限を更新しない。source受理はclose前だけ、closeで未消費proofを失効し、reader処理は同じjoinを再使用する。native側のcancelledという制御理由と実runの期限／先行理由は別なので、summaryのrun_stopへ実run理由を保持する。HTTP、cleanup facts、source拒否、construction teardownを相互に上書きしない。

native summaryは解放後のclosed／revoked=true、固定HTTP／操作数／cleanup factsとclose前の先行理由を保持する。正常closeのclosed理由で先行観測を置換せず、construction teardownがconfirmedでもnative cleanup未確認をconfirmedと解釈しない。元floorで待機を打ち切った後のPromise settleはcleanup copyを昇格させない。基になるPromiseの強制停止・GCや、返らなかった未知readerの物理解放まで保証するものではない。

追加費目はrun当たりnative owner1、delivery1、Response／stream各1のweak登録、proof最大1、同reader1と固定facts、cleanup timer最大1。既存のdefault開発ownerにもprivate proof用の固定状態が増えるが、本番配布closureは変えない。正確なbyte layout／work／必要量はUnknownのまま。新規[28試験](../tests/review/development-native.test.ts)と[検証記録](E2E_BEST_PRACTICE_DEVELOPMENT_NATIVE_B0203_2026-11-01.md)を参照する。

これはdevelopment-assemblyの連続保証であり、旧実class試験は削除・skip・緩和しない。旧case対応表は次節の静的照合案として整理したが、全case移行の承認、実classの正式binding、release判断、開発compiled保証（B-03）、friend撤去（EF-03C）・artifact変異（EF-03D）は未完了。正式発行口・全体受付を開かず、調査保留を維持する。

## 10 B-02-03後のcase単位照合案

[旧case対応表draft-0.1](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md)は、既存JSONと基準sourceから旧330件・新139件のfullNameを記録し、同名パラメーターを条件で識別する。「維持」148は旧位置の継続、「部分対応」109は一部assertionの相当試験、「未対応」73は同条件の新caseなし／差分比較のみ。全旧試験を維持し、未対応を実装不在とも、部分対応を実class保証の代替とも即断しない。新しいテスト実行・実装・削除承認を本表から推認しない。

優先する残差はrelease判断、draft公開直前の取消／最終guard、native各点の期限・再入・特定入力である。B-03はこの対応表の残差と実class保証を別に保持したまま専用compiled試験を設計する。現在の全体テスト／梱包成功を別assemblyのcompiled保証へ読み替えない。

## 11 release純粋比較器の設計案

[release比較器詳細設計draft-0.6](BEST_PRACTICE_ABORT_SCOPE_RELEASE_COMPARATOR_DESIGN.md)に、family判定、空／不完全／21行sentinelとraw応答上限の区別、期限切れ設定を保持した競合判定、固定limitations順序を整理した。RC-01の構造入力・型・family境界に加え、RC-02のpolicy整合・意味比較・非実行draft生成を純粋値として実装した。実source／開発sourceへの採用は未接続で、実Permit・private snapshot／port・採用claimは生成しない。既存の非200 legacy catchと、bootstrapのdecode／cleanup失敗は同時に移さない。

設定日時文字列長の上限は承認待ちで新制限を加えず、壁時計逆行等は未確認とする。family閉包はimportなしの値moduleへ限定し、比較器はrootをimportしない。RC-03は未実装で、RC-01／02の合成／compiled確認を旧release判断caseの対応済みへ数えない。旧試験・対応表の分類、not_evaluated、正式発行口閉鎖・全体受付無効・調査保留を維持する。[RC-01検証記録](E2E_BEST_PRACTICE_RELEASE_CONTRACT_RC01_2026-11-01.md)・[RC-02検証記録](E2E_BEST_PRACTICE_RELEASE_COMPARISON_RC02_2026-11-01.md)参照。

draft-0.5のレビュー修正：開発bootstrapはdispatch後のC差分だけを確認し、本番bootstrap契約が行うchunk後のG差分（＝bytes長）とC/P不変の確認がなかったため追加した。上位設計からの版数リンクも更新した。

## 12 RC-03採用境界の差分設計

CT-Aの値receipt ownerと実classの固定fake継続を限定接続した。unitの混入／one-shot／候補値保証と、実classのprivate hook・既存結果／会計維持の保証を別に扱う。[CT-A検証記録](E2E_BEST_PRACTICE_RELEASE_COMPARISON_CTA_2026-11-01.md)は当時の結果で、後続TB-Bの時刻移譲は下記接続契約へ分離する。通常source採用・worker job／T_i／E・CT-C・B-03は未実施。

[比較器入力・上位時刻の接続契約draft-0.5](BEST_PRACTICE_ABORT_SCOPE_RELEASE_COMPARISON_TIME_BINDING_DESIGN.md)へ、同projection／source／job結合、一度限り受領物・空200のUTC保持と終端移譲、失敗時の停止を分離した。CT-AとTB-A／Bは固定fake継続だけで限定接続し、worker job／T_i／E・CT-Cは未実装。旧実class保証・Dの別assembly保証・B-03専用compiledは別集計し、本番差替えやfriend撤去の承認としない。

[固定採用境界・接続差分draft-0.16](BEST_PRACTICE_ABORT_SCOPE_RELEASE_ADOPTION_RC03_DESIGN.md)に、Dのtest-only時刻／policy binding・同ackのconsume・pre/post guardと非実行summary、Rの同session条件・公開copy／private snapshot・失敗owner／解放を分離した。Dの最初の候補はRC3-D01（条件とclaimのみ）で、比較公開はD02、GET前のbinding不一致はD03とする。R差替え・実Permit経路・非200移行は未承認。旧case分類・件数・旧試験・全体受付無効・正式発行口閉鎖は変更しない。

RC3-D01の条件とclaimだけを限定実装した。開発rootごとの条件handle／run生成枠と同realm source照合を追加し、旧summary・会計・final4枠は不変。比較結果は公開せず、次はD02である。[D01検証記録](E2E_BEST_PRACTICE_RELEASE_CONDITIONS_D01_2026-11-01.md)参照。実classの正式bindingや旧case移行完了へ読み替えない。

RC3-D02では、同sourceの200行ack・固定比較・guard・seal後の非実行summaryまでを限定接続した。D01時点から新fieldを明示opt-inにだけ追加し、既存field・省略時出力・C/G/P・予約返却は維持する。[D02検証記録](E2E_BEST_PRACTICE_RELEASE_ADOPTION_D02_2026-11-01.md)参照。D03のno-requestとR差替えは未実施で、正式発行口・全体受付を開かない。

後続RC3-D03で、同source／条件ownerの一度限りdispatch前判断とnot_requestedを限定接続した。整合したbinding不一致は認証・親の受理後にrelease GET=0で値unknownを返し、同canonical会計・final4予約返却を維持する。[D03検証記録](E2E_BEST_PRACTICE_RELEASE_NO_REQUEST_D03_2026-11-01.md)参照。R差替え・実Permit・native/status-only・正式発行は未実施／閉鎖を維持する。

[既存deadline getter再利用契約draft-0.6](BEST_PRACTICE_ABORT_SCOPE_RELEASE_DEADLINE_REUSE_DESIGN.md)に、Rの設定pin／比較器への同startedAt・元全deadline供給を整理した。getterは既存であり、新設待ちという旧記述は誤認。RP-01時点では固定fake継続にprivate projection生成／消費を限定追加したが、比較器への入力化・通常source差替えは未実施で、残時間再計算・provider再呼出しはしない。B-03の専用compiled保証・旧case対応表とは別に検証する。

[観測UTC契約draft-0.5](BEST_PRACTICE_ABORT_SCOPE_RELEASE_OBSERVATION_UTC_DESIGN.md)のOU-01で、固定fake継続の取得後guard・一度限り採取・空200・時計例外／逆行を部分確認した。D固定UTCの試験結果をRの時計保証へ流用せず、通常sourceの切替・reviewed_at／ended_atへの上位結合は未実装／未検証のままとする。
