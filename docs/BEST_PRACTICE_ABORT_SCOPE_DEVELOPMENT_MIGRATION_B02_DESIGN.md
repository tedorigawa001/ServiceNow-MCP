# EF-03B B-02：source・会計・nativeの移行範囲と共通化境界

Version: br006-development-migration-b02-draft-0.1 / Date: 2026-11-01。
Status: **設計のみ。旧試験をすべて残す。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実装・friend撤去・実接続・実通信・実機操作・設定変更・Pushは行わない。**

基準：`5e79b21`。B-01の生成順はbusy事前判定→core→admission→登録ownerに修正済みであり、その前の順序へ戻さない。[移行親設計](BEST_PRACTICE_ABORT_SCOPE_DEVELOPMENT_ROOT_EF03B_DESIGN.md)のB-02を細分化する。以下の型名・配置・試験は提案であって実装済みではない。

## 1 現在地と今回の境界

[開発assembly](../tests/support/review/ef03/assembly.ts)はconstruction-onlyで、共有construction kernelと新規canonical coreを使うが、source・ready世代・ReleasePermit・readerを持たない。C/G/P=0、final予約も未実施である。B-02はこれを新規開発runの内部で拡張し、既存実sessionの採用機能を追加する工程ではない。

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

実装前に確認する事項は、最小共有schema／native kernelの抽出閉包、factory越えのresource再使用拒否、固定cleanupの挿入順と未確認時のjoin、全旧caseの対応である。これらを満たす設計がなくても旧試験を消して先へ進まない。次の最初の実装候補は**B-02-01の値検査と開発lifecycle**であり、本書は実装開始・保証削減・本番bindingの承認ではない。
