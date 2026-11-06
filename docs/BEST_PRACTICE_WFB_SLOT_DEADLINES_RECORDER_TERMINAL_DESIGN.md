# WF-B：slot固定期限表・保存経路閉鎖後recorder終端の接続差分

Version: draft-0.6 / Date: 2026-11-05 / 基準HEAD: `31712a6` / レビュー修正の基準HEAD: `9f8507b` / DT-A実装基準HEAD: `eb642a2` / DT-B実装基準HEAD: `aa575f3` / DT-C実装基準HEAD: `e4b87d7` / DT-Aレビュー修正の基準HEAD: `0fd1919`。

draft-0.5のレビュー修正: 1つの期限表から作れるStoreを1つに限定し、sticky失敗後の作り直しでmanifestへ進めないようにした。Proxy入力、表のない`budget`、同じobjectのrun／budgetを拒否した。期限の計算と区分の選択は変更していない。

draft-0.5: **DT-Cの固定連続transcriptと構造費目を合成検証**。通知throwと部分生成のRED対照から、試験専用kernelの通知分離・受付閉鎖・実状態の診断を補完した。[検証記録](E2E_BEST_PRACTICE_WFB_RECORDER_CONTINUOUS_DTC_2026-11-05.md)と§8.3を参照。実時間／heap／任意呼出し列の上界や運用capの承認ではない。

draft-0.4: **DT-Bを合成実装**。先行terminal slot・同owner identity・一度限りclaim・安全なPending・queue／四軸を変えないprivate commitと、閉鎖後clock不正のStore一度限り取消を接続した。[検証記録](E2E_BEST_PRACTICE_WFB_RECORDER_TERMINAL_DTB_2026-11-05.md)を参照。DT-Cの連続対照・最終費目は未実施。

draft-0.3: **DT-Aだけを合成実装**。固定2区分の純粋計算・厳密DATA検査・同run／budget結合をsave／receipt消費／closeへ接続した。[検証記録](E2E_BEST_PRACTICE_WFB_SLOT_DEADLINES_DTA_2026-11-05.md)を参照。DT-B／DT-Cは未実装。

draft-0.2のレビュー修正: Pendingの条件をownerのすべての同期区間とclock読取中へ広げた。`D_save`閉鎖後に残るrecorderの状態ごとの終端を定めた。`Closed`後のclock不正ではStoreを取消す。期限切れのevidence保存はstickyとし、manifestも不可とする。manifestの試験方法と親§7の残項目との対応を追加した。

Status: **DT-A／DT-BとDT-Cの固定連続経路・構造上界をメモリ内で合成検証済み。実保存・実時間／heap上界・運用capは未対応／未承認。** 正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。保存先・保持期間・運用cap／時間枠・停止方式は未承認。再採取・既存証拠copy／保管操作・実接続・実通信・設定変更・Pushは行わない。

親は[Store／recorder接続設計](BEST_PRACTICE_WFB_STORE_RECORDER_BRIDGE_DESIGN.md)と[EvidenceStore契約](BEST_PRACTICE_WFB_EVIDENCE_STORE_FAKE_CONTRACT.md)。既存SB-A／SB-B・試行別結果とレビュー修正を維持する。実装境界はDT-Aが§8.1、DT-Bが§8.2。運用側のfacade／保存／ProcessOwnerへの接続は未実装。

## 1 差分・非目標

| 現状 | 必要な差分 |
|---|---|
| Storeの全slotでdeadline／cleanupDeadlineが1組 | 生成時に2区分の期限表をpinし、保存・receipt消費・closeが同じ区分を使う |
| bridgeのD_save閉鎖はStoreを取消さないが、後続manifestも同じ期限に阻まれる | 健全Storeに限りmanifest専用枠を残す。checkpointの閉鎖と全Storeの致命的停止を分ける |
| bridgeがClosed／Stoppedになると通常操作・observeStopが拒否される | 保存用guardとは別のprivate終端入口で、同recorderを一度だけClosedへ進める |
| public abandonは停止checkpointを追加し得る | 閉鎖後はqueueを変更しない専用terminal sectionを使い、停止不足を診断へ残す |
| Store試行別結果は既に凍結DATAとして保持 | 期限区分を付加しても主理由／cleanup／先行結果を上書きしない |

範囲は試験専用kernel・注入clock・メモリdriverだけ。manifest内容／必須集合・session票・実観測本文・ProcessOwner・OS backend・実承認は対象外。manifest期限が到達可能であることを、manifest発行口やrun保全成功の有効化とは呼ばない。

## 2 期限の供給元・固定表

元のRunBridgeOwnerがpinした同run／budget origin・開始時点・単調clock・planTimeを唯一の供給元とする。入力の数値・予約・必要なgetterは一度だけ読み、検査からprivate copyまで任意callbackを挟まない。外部Recordへ任意slot／期限を追加させず、2区分と14固定名の対応を内部定義する。

`D_confirm=stages[2]`、`D_flush=stages[3]`、`D_manifest=stages[4]`、`D_all=stages[5]`。既存工程内を切り分ける正の有限予約`C_store`／`C_manifest`から計算する。

| 区分 | 固定名 | 操作期限 | cleanup期限 |
|---|---|---|---|
| evidence | conditions.json、source写し3点、report.partial.0001〜0006、report.final.json、termination.json、analysis.json | D_save = D_flush − C_store | D_flush |
| manifest | manifest.jsonだけ | D_manifest_save = D_manifest − C_manifest | D_manifest |

`D_confirm < D_save < D_flush < D_manifest_save < D_manifest < D_all`を要求する。safe integer・正の予約・加減算overflow・空の処理枠・未知区分・欠落／重複した対応を拒否する。元planの受付条件と、観測可能窓が218秒＋承認済み正の余裕より大きい条件も維持する。**数値の運用既定値は新設しない。**

表の各rowと全体をprivateに複製・凍結し、同run／budget／版のoriginへ結ぶ。残時間から期限を再計算しない。後からC_store・C_manifest・clockを差替えない。旧単体fakeの1組capは互換の試験経路として残せるが、新bound経路へ暗黙fallbackしない。

### 2.1 各操作への適用

- saveは固定slot名から区分を内部選択し、その呼出しの最後まで同rowを保持する。write／flush／再読・receipt発行の前後guardは操作期限、取得済みhandleのclose確認は同rowのcleanup期限を使う。
- Savedのprivate情報へ区分／期限表originを結ぶ。公開consumeとprivate consumerは**receiptの内部情報から**同rowを選び、callerに区分を指定させない。checkpoint receiptへmanifest期限を借用させない。未知／foreign receiptは従来どおり拒否する。
- 正常closeと失敗後finallyのcloseは同rowを使う。close前に期限を確認し、返答後もconfirmed／late／unconfirmedを判定する。遅い返答・読めない時計をconfirmedへ補完しない。期限表は同期処理を強制中断する仕組みではない。
- 試行結果は従来のdisposition・create／handle／close flag・予約byte・主理由・cleanup理由を維持する。区分・表版の固定診断を追加するなら当該試行にのみ記録し、実pathや私的originを出さない。

## 3 閉鎖とStore失敗の分離

`D_save`をbridgeのguardが先に検出した場合、checkpoint受付だけをClosedにする。Storeのsave／consume／cancelは呼ばず、既存queueをretire診断として残す。健全なStoreなら、将来の限定manifest writerはmanifest区分の期限まで到達可能である。現段階の結合入口は引き続きcheckpointだけで、manifest writerを追加しない。

保存／消費中にStoreのguardが期限を検出すれば、従来どおりStoreのsticky失敗と致命的停止になる。**期限表を切り替えても、この失敗を解除してmanifestへ進めない。** 新run keyや別Storeを同rootへ作り直す回避も許さない。同じ境界時刻でも、bridge閉鎖とStore失敗は理由と残責務を別に保持し、どちらもackしない。

期限切れのevidence slotへの保存要求がStoreへ届いた場合も同じで、slotと予約を消費してstickyな`deadline`とする。bridgeの手前で拒否する受付経路は作らない。このため、保存が`D_save`をまたぐか、遅れた保存が1件届くと、manifestを残せないrunが生じる。そのrunはUnknownのまま扱い、救済の経路を作らない。

`Closed`の後でも、共有clockの読取が例外・逆行・不正値となったら、Storeを一度だけ取消してmanifest枠を閉じる。一度だけの不正で後の読取が正常に戻っても再開しない。phaseは`Closed`のままで`Stopped`へ移さず、bridge first reasonが空なら`clock`を記録する。先行するreasonは置換しない。取消は新規の保存と消費を止めるだけで、取得済みhandleのcleanupは続ける。この規則は終端のpre／post-clockを含むすべての読取に適用する。

明示取消・D_stop・通常の観測停止ではStoreを取消さず、保存受付が開いている間はstop_requestedを含む残queueをFIFOで処理する。致命的停止だけがStore.cancelへ進む。共有clockの読取・検証はどの閉鎖後も残し、Store所有handleのcleanupを妨げない。不正値・逆行を無視してよいという意味ではない。

## 4 二つの状態面・終端入口

| 状態面 | 状態・責務 |
|---|---|
| checkpoint保存受付 | Idle／InFlight／Closed／Stopped。Closed／Stoppedからsave・receipt受理・ackへ戻らない |
| recorder終端 | NotRequested／Pending／Entered／Committed／Failed。先行確保した1 slot・1 claimだけを使う |

RunBridgeOwnerは子生成前にterminal診断slotとclaimを確保する。終端identityは同owner／run／recorder／budgetへ結び、保存の停止epochとは別に保持する。保存epochの進行を理由にcleanupやrecorder終端まで失効させない。診断には要求時／完了時の保存epochを残し、他ownerへ移譲しない。

合成限定facadeの`finishRecorder(run, recorder, store)`は同ownerのopaque参照だけを受け、callerが時刻・成功bool・四軸・queue・終端理由を供給するAPIにしない。内部owner状態から固定理由を選ぶ。通常の保存用enter／guardを迂回する**終端専用のprivate継続**であり、保存権限を迂回するfriendではない。runtimeの入口へは接続しない。

- 保存受付がまだ健全に開いている要求はnot_readyで拒否し、終端claimを消費しない。観測停止を勝手に保存閉鎖へ昇格させない。
- Closed／Stoppedで、ownerの同期区間の途中ならclaimを取りPendingだけを記録する。同期区間は保存・消費に限らず、recorderコマンド、`checkpoint`、`prepare`、`discard`、共有clockの読取を含む。未解決handleはStoreが所有したまま。Storeのfinally、bridge消費中slotの回収、実行中のrecorderコマンド、clock読取のいずれかが戻るまでrecorder終端sectionへ入らない。これにより、読取中の再入がterminal.clockの異常として記録されることと、recorderの時刻判定の途中で閉じることを防ぐ。
- Pendingは1件だけで再入・再要求をqueueへ積まない。最も外側の同期区間のfinallyを安全な固定unwind点としてEnteredへ進める。同期待originを再確認するが、正常save用のD_save guardは呼ばない。
- 要求時のrecorderの状態ごとの扱いは§5.1の表に従う。
- `Failed`は、同owner内のclaim／identityの内部不整合に限る。recorderに触れず、Committedにしない。clock不明や期限後は`Failed`ではなく§5の診断である。
- 二重要求・コピー・foreign owner・summaryからの終端再構成を拒否する。失敗してもclaimは返さず、自動retryしない。診断DATAは再実行権限ではない。

同期操作が永久に戻らなければPendingの完了も保証できない。実host／ProcessOwnerでの強制停止は別課題で、ここでは終了確認をUnknownのまま残す。

## 5 一度限りのterminal section・共有時間枠

終端の記録／判定費は元planのfinal予約（D_manifestからD_allまで）へ一度だけ所有させ、Storeのcleanup予約と二重に使わない。要求は保存閉鎖直後から行えて、D_allまで待つ必要はない。早く実行しても新しい時間枠を足さず、manifest／session票の締切を後ろへ動かさない。具体work／時間費用の上界は後続で確認し、未導出を受付可能とはしない。

1. 同identity・eligible状態・安全なunwindを確認してclaimをEnteredへ進める。元の状態・四軸・queue件数／参照順・既存診断を先行slotへ保持する。
2. 同共有clockを最大1回読む。例外・逆行・不正値はterminal.clock診断へ固定し、§3のとおりStoreを取消す。先行Store／bridge reasonを上書きしない。新clockへのfallbackをしない。
3. callback・await・clock・IO・public abandon／verify／publishを呼ばないprivate sectionで、同recorderの観測受付を閉じてClosedへ進める。queueは追加・除去・並替えしない。四軸・test異常・first reason・保存claim／予約をそのまま保持する。
4. pre-clockが有効だった場合だけ、最大1回のpost-clockでD_all内／等値以降／時刻不明を診断する。等値はlate。Committedというメモリ状態は後から巻き戻さない。post-clock中の再要求も元claimへ新たな権限を与えない。
5. 完了DATAは同ownerに固定する。clock不明や期限後でも、新規IOをせず可能なメモリ閉鎖を行うが、枠内完了・process終了・保存完了とは扱わない。有限回の記録であり、実wall-time内の実行保証ではない。

public abandonをそのまま使わない理由は、停止checkpoint追加とreason更新を伴い得るため。保存経路閉鎖後に新しいstop_requestedを捏造しない。D_stop通知が抜けてObservingのままなら、forced_from_observing／stop_not_observedを終端診断へ残す。試験未終端のincomplete軸をpassedへ変えず、試験終端後のcomplete軸もcleanupの都合で変更しない。

終端後も共有clock・Storeの既存cleanupを無効化しない。manifest区分の存在とrecorder Closedは独立であり、後続manifestがrecorder状態を記録しても、それだけでrun保全を成立させない。本書はmanifest／正常run終端の発行口を有効化しない。

### 5.1 要求時のrecorder状態

`D_save`閉鎖はrecorderの時計を読まないので、recorderは閉鎖時の状態のまま残る。観測前の`Gated`／`Reserved`も到達できる。

| 要求時の状態 | 固定理由 | 扱い |
|---|---|---|
| Gated／Reserved | observation_not_started | Closedへ進める。観測は始まっていない。Reservedのconditions_readyはqueueに残す |
| Observing | forced_from_observing／stop_not_observed | Closedへ進める。新しい`stop_requested`は発行しない |
| Draining／Verifying | closed_after_drain／closed_after_verify | Closedへ進める。verifyやpublishは実行しない |
| Published | closed_after_publish | Closedへ進める。確定済みのpreservationを保持する。現行のfacadeは`publish`を公開しないので、生recorderで準備するbranch対照だけで確認する |
| Closed | already_closed | 既存結果を保持し、診断だけでCommittedとする |
| 未生成 | not_constructed | Closedになったと捏造しない |

生成に失敗した`create`はownerを返さないので、`finishRecorder`の経路を新設しない。terminal slotを生成失敗の診断へ含め、recorderが未生成ならnot_constructedを記録する。recorder生成後のStore生成失敗では、既存の致命的停止でGatedからClosedになっているので、already_closedとなる。

## 6 queue・未受理件数・診断

terminal section前後で元queueの参照と順序を保持する。ownerの`unacknowledged`は常にqueue件数。recorder Closed後は`unsaved`も同件数になり、保存済み未ack・partial・未試行の区別は既存`saves[].attempt`／dispositionから読む。**未受理件数はbytes不存在を意味しない。**

ack済み件数・成功slot・消費済みreceipt・失敗claim・累積予約は不変。終端を通って再保存／再ackできない。新しい停止checkpointを後から発行しないため、終端だけでqueue件数が増減することもない。保存済み未ackから新たなreceiptを再発行しない。

terminal slotは固定理由・元状態／最終状態・clock診断・late・要求／完了状態・queue件数・保存epochだけを持つ。試行別主理由とcleanup理由、Store-wide first reason、bridge first reason、試験異常は別に保持する。cleanup confirmedはfake handleの返答、recorder Closedはメモリの受付閉鎖で、どちらもProcessOwnerのtermination confirmedではない。

未知の通知結果・未解決handle・clock不明はUnknownのまま。未確認の解放責務／leaseは診断とは別に所有元へ残し、terminal helperにそれを破棄する権限を与えない。OS leaseの具体方式は未実装である。必要なidentityが欠ける場合はFailed、recorderが未生成ならnot_constructedを記録し、成功boolで埋めない。payload／私的証拠別名は固定unwindで外すが、診断・queueを削除／無限複製しない。raw例外・bytes・実path・環境・認証情報は出さない。

## 7 合成受入条件（実施範囲・限界は§8.1〜§8.3）

| ID | 対照 | 必須結果 |
|---|---|---|
| DT01 | 表の欠落／未知／重複、0／負／非整数／overflow、予約順序違い | 生成前拒否。旧legacy capへfallbackしない |
| DT02 | 生成後の入力・getter・clock差替え、別run／budget表の混入 | pin値不変、同生成元以外を拒否 |
| DT03 | 各rowの操作／cleanup期限の直前・等値・直後 | save／consume／closeの選択rowが一致。等値拒否／late、借用0 |
| DT04 | D_save後のcheckpointとmanifest、checkpoint receiptへmanifest期限の指定 | 健全Storeのmanifest rowだけ到達可能。receiptの期限借用0。必須集合の証明とは数えない |
| DT05 | 保存／消費中に期限切れ、期限切れのevidence保存要求、先行sticky失敗後のmanifest | evidence保存要求はslot・予約を消費してsticky `deadline`。manifest拒否。failure解除0、別root ownerによるやり直し0 |
| DT06 | D_stop→FIFO保存→D_save閉鎖→recorder終端 | 保存締切と観測停止を区別。未受理queueの参照順・四軸保持 |
| DT07 | 閉鎖後にGated／Reserved／Observing／Draining／Verifying／Published／既Closedのrecorderを終端。recorder未生成とStore生成失敗の`create` | §5.1の固定理由どおり。生成済みは一度だけClosed。新checkpoint・ack・IOなし。既結果とPublishedのpreservationを上書きしない。未生成をClosedと捏造しない |
| DT08 | not_ready要求、二重／再入／foreign終端、入力DATAからの再構成、保存以外の同期区間（recorderコマンド・`checkpoint`・`prepare`・`discard`）とclock読取中の要求 | eligible時だけ1 claim。同期区間の途中はPendingで、最も外側のunwindまでEntered 0。読取中の再入をterminal.clockの異常に数えない。Pending増殖・再実行・保存権限復活0 |
| DT09 | 取得handleのcleanup中に終端要求、通知throw・部分生成失敗、試験終端後のcleanup失敗、停止checkpointの保存失敗 | Storeの1回の回収試行と結果固定を先に終える。未確認責務・主理由とcleanup結果を保持。二重close0。`stop_requested`の再発行0 |
| DT10 | pre-clock例外／逆行、D_all等値／超過、post-clock失敗、`Closed`後に一度だけのclock不正 | 有限read回数、期限延長0。可能なメモリ閉鎖と時刻不明／lateを分離。`Closed`後の不正でStore取消1回、phaseは`Closed`のまま、空のbridge reasonは`clock`、後の読取が正常でもmanifest拒否、取得済みhandleのcleanupは継続 |
| DT11 | 保存済み未ack／partial／未試行が混在する閉鎖 | queue／未受理数・成功slot不変。終端後のunsavedを0へ補正しない。閉鎖後は`evidenceIssued`がfalseで、私的証拠別名とslotのbindingが残らない |
| DT12 | 終端後のmanifest側cleanup、全header ack済み、raw例外／秘密 | 共有clock読取可能。保全／process終了への昇格0。秘密反射0 |

oracleは表生成器やterminal helperを呼ばず、手書きのrow／境界値／状態・queue順序表を使う。狙った故障点への到達をassertし、前段拒否で後段試験を成功扱いしない。生recorderでVerifying等を準備する場合はbranch対照と明示し、bound成功と区別する。compiled／梱包の負の対照も別に確認し、試験driverを配布物へ入れない。

本段階はmanifest writerを追加しないので、DT04・DT05・DT10・DT12のmanifest保存は、`FakeEvidenceStore.create`のspyで得た子StoreとrunOriginから直接呼ぶ。これは期限rowと拒否の対照で、bound経路の成功実証やmanifest発行口とは数えない。

親設計§7の残項目との対応は次のとおり。

| 残項目 | 対応 |
|---|---|
| BR06 停止checkpointの非再帰 | DT09 |
| BR07 別clock | DT02 |
| BR08 通知throw・部分生成 | DT09 |
| BR09 試験終端後のcleanup失敗 | DT09 |
| BR10 閉鎖後のpayload破棄 | DT11 |
| BR11、BR12 `D_stop`から閉鎖までの連続対照 | DT06 |
| BR13 slot区分別期限 | DT01、DT03、DT04 |
| BR02 encoding版の不一致、BR03 成功分の二重消費、BR10 bound経路の可変buffer | 本書の対象外。親設計§7に残す |

## 8 後続の順序・未確認事項

1. **DT-A（合成実装済み）**: 固定表の純粋計算・strict構造検査・同run／budget binding。メモリStoreのsave／consume／closeへ接続し、legacy単体入口を維持する。
2. **DT-B（合成実装済み）**: privateな終端slot／claim・安全なPending／固定terminal section。queue不変・四軸・診断保持を確認し、save-lane guardから独立させる。
3. **DT-C（固定経路の合成検証済み）**: D_stopから保存完了／閉鎖／終端まで、通知throw／部分生成失敗を含む連続fakeと構造費目を確認した。manifest rowは到達性だけで、正式writerの発行へ進めない。実時間・heap・任意呼出し列と統合work会計は未確認。

全段階とも別の明示実装指示を要する。期限の具体値・terminal費用・正式保存先・保持／削除・OS backend・実承認は未承認／未確認。本文・容量モデル・ProcessOwner・manifest集合・session台帳・実採取は別課題であり、本書作成で状態を進めない。

### 8.1 DT-A実装境界

実装は試験専用`store-recorder-kernel.ts`、旧`fixed-evidence-store.ts`から再exportする。`planSlotDeadlines(unknown)`は固定keyのown enumerable DATAだけを受理し、getterを実行しない。未知／欠落／symbol／Proxy／独自prototype／accessor、非safe整数・空の工程枠・元planの上限違反を拒否する。外部からrow配列を受け取らず、14固定名のうち`manifest.json`だけをmanifestにするため、区分対応の欠落・重複を入力で作れない。

`createFakeDeadlineTable`は同run／budget originと凍結planをmodule-private WeakMapに結ぶ合成専用issuerで、runtime台帳とは共有しない。summaryやtokenのcopyは表として受理しない。bound ownerは非公開run／budget originを先行確保し、元timing・`cleanupMs`・必須`manifestCleanupMs`を一度読み、同じtableをStoreへ渡す。運用既定値や別budgetは作らない。ここでのbudget originは合成identityであり、実予算の配賦・費用課金・承認を証明しない。

table-mode Storeは同run／budgetを生成時照合し、期限表の不正入力から旧pairへfallbackしない。表は照合を通った時点で消費し、以後の上限検査で失敗しても戻さない。これによりsticky失敗後の作り直しや、byte枠を分けた同時Storeを防ぐ。run／budgetの不一致は消費しない。表のない`budget`は旧pairとして受理せず、runとbudgetが同じobjectの表は発行しない。旧単体fakeの`StoreCaps` pairは互換入口として残す。saveはslotからrowを内部選択し、同rowを操作・通常close・失敗finallyに保持する。receiptには同rowとtable originをprivateに保存し、public／private consumerはそれを再照合する。公開consume DATAはslot／size／digestのみで期限借換え口を追加しない。table-modeの当該attemptだけに`deadlineClass`／`deadlineVersion`を追加し、旧単体結果の形は維持する。

DT01〜DT05の期限表部分を実施した。直前／等値／直後、途中期限到達、cleanup予約切れ・late、別run／budget・summary／継承table混入、evidence sticky後のmanifest拒否を独立oracleで確認した。bound checkpoint laneの閉鎖後のmanifest保存は、§7のspy-only子Store対照に限る。必須集合・manifest writer・run保全／process終了へ昇格しない。

DT-A単独時点ではrecorder終端・Pending・閉鎖後clock不正のStore取消は未実装だった。これらのDT-Bでの範囲は次節。状態別連続対照・最終費目はDT-Cへ残す。

### 8.2 DT-B実装境界

同じ試験専用kernelに先行`TerminalSlot`を確保し、子recorder生成後に同owner／run origin／budget origin／recorderを一度結ぶ。保存epochはidentityへ使い回さず、要求／完了epochを限定DATAへ残す。保存受付が健全なら`not_ready`でclaim 0、foreign参照・copy・診断DATAは`rejected`でclaim 0。eligible要求だけ1 claimを取り`Pending`となり、以後の要求・再入は再実行しない。

ownerの成功操作だけでなく入口拒否／fatal区間にもdepthを置く。recorderコマンド・checkpoint・prepare・discard・persist・observeStopの最外側unwind、共有clockの読取／検証終了、Storeの単発試行結果凍結／cleanup／消費finallyの完了を待つ。Storeのbusy照会・固定unwind取付けはmodule-private継続で、公開friend／登録口を作らない。raw子Storeを使う試験対照でもStore busy中はPendingのままである。

安全な位置でidentityを再照合し`Entered`、元state／queue件数を先行slotへ記録する。private commitはrecorderのstateをClosedへ変更するだけで、clock・IO・callback・public abandon／verify／publishを呼ばない。queue配列・要素参照／順序・issued・first reason・testFailure・四軸は書き換えない。公開snapshotだけを追加し、終端権限を返さない。

同clockはpre 1回、preが読めたときだけpost 1回まで。読めなくてもメモリ閉鎖はCommittedとし、`clock=unknown`、時刻未確定は`late=undefined`にする。D_all等値以降はlate。post失敗でもCommittedを戻さず、枠内完了・保存・process終了へ昇格しない。閉鎖後clock異常はphaseを保ち、空ならbridge理由clock、Store取消は一度だけ。後の正常clockはcleanup用に読めるが、Storeの受付は戻らない。

生成失敗は新facadeを返さない。terminal slotは`NotRequested`／claim 0のまま、未生成なら`not_constructed`、recorder生成後のStore生成失敗は既存fatal後の実stateから`already_closed`を記録する。これを終端claimの成功やProcessOwnerの終了確認と数えない。

DT-C訂正: recorderが生成済みでも停止通知がthrowするとGatedのままの場合がある。その場合は`observation_not_started`と実際のfrom／toを記録し、`already_closed`へ補完しない。

DT07の7状態、DT08のnot_ready／混入／二重／再入／各同期区間、DT09の取得handle回収・未確認closeと試行結果保持、DT10のpre／post clock・D_all境界、DT11のack済み／保存済み未ack／未試行混在、DT12のspy-only manifest区分の到達性を局所合成対照で確認した。Published／Verifyingの準備はraw recorderのbranch対照で、bound成功ではない。DT06のD_stopからの全経路、通知throw／部分生成と終端の全組合せ、費目／上界の連続検証はDT-Cへ残し、§7全体の完了とは呼ばない。

### 8.3 DT-C連続検証・通知と費目

`recorder-continuous.test.ts`で元ownerのreserve→conditions保存→startから進める。D_stopでのpoll停止と明示observeStop、FIFO全部保存と0／1／3件保存後のD_save閉鎖、固定terminalまでを連続確認する。既存DT-Bの7状態対照も維持する。試験終端後のpartial write、create失敗、stop_requested自身の保存失敗、closeのfalse／throw／lateを確認し、保存済み／未受理・四軸と元queue参照順を保持する。

通知throwは、固定の通知境界だけをspyで故障注入するbranch対照である。内部実装全般をmockして正常経路の証明に置き換えない。Store受付のprivate閉鎖を通知前に行い、通知のthrowで再開させない。Store取消・recorder致命的通知・観測停止通知は各1 claimと固定slotを持ち、`not_requested／not_present／attempted／returned／threw`を区別する。returnedは返答があっただけでcleanup confirmedではない。片方のthrowで他方を省略せず、両方throwでも主理由・Unknownを保持する。観測停止通知throwは`notification`理由で致命的停止へ合流する。constructor失敗はownerを公開せず、未生成と生成済み未閉鎖を区別する。

構造式の対象は固定transcript、通常の単発fake境界、最大6個の固有checkpoint、1保存あたり宣言header上限H=95 ASCII byteである。callerのsnapshot／not_ready／空checkpoint等を任意回数許す列や、無限の再入・同期操作停止不能は対象外。以下の数値は試験値で、runtimeのwork_model_id／受付capではない。

| 費目 | 所有・上界 |
|---|---|
| write試行 W | Store。A=明示attempt cap、R=EINTR capとして `W≤min(A,H+R)`。正のshort writeは1 byte以上進む。拒否まで進む場合は進行writeが最大H−1なので、最後の超過EINTR／throwを含めても`(H−1)+(R+1)=H+R`。非空headerのモデルに限る |
| create／flush／close／再読 | Store。各保存につき各≤1。正常closeとfinally closeは同じ1枠で、二重に加算しない |
| identity | Storeとreceipt検査。保存成功で`2W+11`、拒否／中断はその以下 |
| clock読取 | ownerのcheckpoint／prepare／persist、Store、private consumeを合わせ成功`4W+30`。失敗finallyを保守的に含め`≤4W+32`。terminalのpre／post≤2はfinal予約へ一度だけ別所有 |
| header予約 | Store。Q≤6保存で`ΣH_i≤6×95=570 byte`。失敗予約を返さない |
| hash入力 | bridge期待hash H_i＋Store owned hash H_i＋再読hash≤H_i、計≤`3ΣH_i`。private consumeにhashを再課金しない（経路のソース照合による上界） |
| private copy／encoding | bridge encoding H_i、Store owned copy H_i、write用残りsliceの累積≤W_i H_i。再読driverのcopyと文字列生成は別費目であり、無料扱いしない |
| 通知／terminal／clear | 3固定通知が各≤1、terminal commit≤1、retireは通常閉鎖／fatalとterminalで各≤6 slot。再要求を新費目へ展開しない |

固定6checkpoint対照のA=128、R=2、W≤97では、単発IO≤606、identity≤1230。追加clock-bearing recorder操作M≤8、guard-only checkpoint G≤2とterminal 2読取を含む保守的clock上界は2532。write sliceの累積内容量≤55290 byte、hash入力≤1710 byte。最後の超過EINTR／throwを含む拒否列も上のW式で覆い、失敗・短書込／retry境界の別対照で照合する。

上界の根拠は個別の有限loop／一度限りclaimと独立操作計数であり、統合したCPU work unit・実wall-time・JS allocator／heap／RSSの保証ではない。driver内部のcopy／callback費用、snapshot呼出し上限、OS lease回収、manifest内容／容量・必須集合、ProcessOwner、実capの導出・承認は未確認のまま。全体受付へ採用しない。
