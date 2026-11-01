# CT-B前半：上位時刻owner・一度限りの終端移譲

Version: br006-release-time-owner-ctb-draft-0.3 / Date: 2026-11-01。
Status: **TB-Aの非実行値scope・内部型・一度限りの移譲claim／discardだけを純粋fakeで限定実装（§9）。TB-BのCT-A／session接続・正常cleanupと元run失効の実結合は未実装。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実source差替え・実接続・実通信・実機操作・設定変更・Permit発行・Pushの承認ではない。**

基準はCT-Aコミット`d32a412`。[接続契約](BEST_PRACTICE_ABORT_SCOPE_RELEASE_COMPARISON_TIME_BINDING_DESIGN.md)§4〜6のうち、時刻のprivate保持・正常終端移譲だけを具体化する。worker job、T_i／Eの実応答照合はCT-B後半、連続fake試験はCT-C、専用開発compiled保証はB-03に残す。

## 1 現状との差分

[CT-A owner](../src/servicenow/review-kernel/release-comparison-receipt.ts)は同projection／元ackから比較候補とOを保持し、失敗／closeで消す。[session](../src/servicenow/bounded-read.ts)の同期revoke・finally・rollbackもownerをcloseする。上位へ渡すprivate消費口はない。unit用inspectの値、公開release evidence、UTC文字列の一致から移譲証拠を再構築しない。

今回設計する差分は、固定fake継続内のaccepted状態からだけ、同runの上位終端ownerへS／全L／O／Uを渡すprivateな一度限りの境界。legacyの非admitted停止を正常移譲へ変換せず、比較候補をPermit・source登録・fallback成功へ昇格させない。

## 2 内部役割・供給元と所有権

以下は役割名案で、実在API名ではない。外部登録・汎用friend・任意callbackによる発行口は追加しない。

| 役割 | 固定供給元・所有者 | binding・保持内容 |
|---|---|---|
| TimeBinding | 同sessionが消費した元projectionの固定継続 | 同run／session／source／composition key／projection originと元停止owner。S・全Lはpin時と同じ値 |
| ObservationTransfer | CT-A accepted slotのprivate consuming継続だけ | 元candidate受理済みclaimと同TimeBindingに結合。S／L／O／Uだけ。clone不可・一度限り |
| UpperTimeOwner | 同runの固定上位継続で、移譲前に確保する唯一の受理slot | vacant→receiving→held。受理済みbindingと時刻だけを所有。rows／P／body／比較draftを引き継がない |
| TerminalTimeDiagnostic | 元runの既存診断owner | 固定理由・phaseだけ。UTC値・identity・例外本文・秘密を公開診断へ追加しない |

時刻ownerを別budgetとして作らない。monotonic期限・取消は元runのguardへ従属する。同じS／L文字列・数値であっても別run／source／projectionは拒否する。型の移動に加え、private claim状態でalias・再入・二重開始を拒否する。

## 3 保持する時刻と不変条件

- S＝構築時の開始UTC、L＝既存deadlineMs getterの全deadline。remainingからの再計算、provider再呼出し、新しい開始UTCは不可。
- complete_200のOはOU-01でpost-guardを通過しCT-Aが受理した同値だけ。空200・全空・unknown／mismatchedでもOを省かない。ただしlegacyが停止したrunは上位へ進めない。
- Uは最後に受理したUTC。概念上の初期値Sから、移譲時はU=Oへ進む。CT-B前半ではT_iを採らずUをOのまま保持する。
- 有限のUTC値・有効なLと、S <= O = U <= S+Lを固定値で検査する。等号を許可し、1ms逆行／超過は内部停止。UTCで元monotonic期限を延長しない。
- not_requestedや非200・不正応答・cleanup未確認を空200として受理しない。Oなしの別枝は今回の移譲対象外であり、SをOの代わりにしない。

将来のT_i／E更新には同worker job claimが必要で、任意日時を受け取る公開setterは設けない。前半だけの成功をS <= O <= T_i <= Eの全保証とはしない。

## 4 正常終端の一度限り移譲

1. 同runの上位owner／vacant slotを先に確保する。生成claimをcallbackより前に消費し、失敗しても再生成可能に戻さない。
2. sourceが生存する固定正常継続でpre-guard。同binding、CT-A accepted、先行停止なし、必要な取得／cleanup確認済みを検査する。任意のclose呼出しを正常終了の証拠としない。
3. 原slotをtransferringへ進め、元accepted値を先に取り外す。移譲物は同private継続だけで作り、同期的に上位slotへ一度渡す。原slotからの新比較・再発行を禁止する。
4. 上位slotをreceivingとして先にclaimを消費し、binding・時刻不変条件・元run生存をpre/post guardで確認する。再入でstateが変わった場合も拒否する。
5. post-guard成功後だけheldへcommitする。原slotはtransferredとして参照を破棄し、その後の通常source cleanupは移譲先の正常保持を取り消さない。
6. 失敗時は両側をterminalにして時刻／identity参照を破棄する。先行停止を保持し、移譲失敗を正常close・新owner生成で救済しない。

移譲区間にawaitや外部I/Oは追加しない。同期中のOS取消の即時実行は保証せず、固定guard境界の観測で停止する。正常source資源解放と、元runの取消／異常closeは別イベントにする。後者は移譲中・移譲後も上位ownerを同期失効させる。両者を識別するprivate継続を実装レビューで確定できなければ接続しない。現在のfinallyを単に無効化してOを残す変更は禁止する。

## 5 上位ownerの寿命・停止・診断

heldは新しい解析／dispatchの権限ではなく、将来の同jobの終端照合に必要な値の保持だけ。sourceを参照してclose後に証拠を新発行しない。worker jobをまだ結合しない前半試験では、固定discardで終端にし、通常結果の成功／公開へ接続しない。

元runの取消・異常close・期限切れ・binding矛盾でfailed／closedへ進み、heldへ戻さない。取消／期限等の先行理由を優先し、新たな内部矛盾は既存internal_review_errorに写像する。HTTP／cleanupの診断を上書きせず、cleanup未確認は成功扱いにしない。失敗後は固定cleanupと診断copy回収だけを許す。

将来の終端消費／失敗／closeでS／L／O／Uとidentity参照を消す。生存期間を延ばすためにrows・policy・raw bytesを保持しない。private値の移動でJS heapの物理消去を保証したとはしない。

## 6 費目所有・上限

追加費目はbinding検査、最大1個ずつの上位slot／移譲claim、固定4時刻項目の値保持・検査、pre/post guard、失効／discard、診断copy。新しいGET／時計採取／decode／rows copyを行わず、C/G/P・final予約／返却・retry・native cleanupを再計上しない。上位slot確保は移譲前、失敗時解放も同固定ownerに帰属する。

元60秒・210試行・既存受信上限を変更しない。exact layout・work単価／全体上界はUnknownで、有限slot数だけを全体受付の根拠にしない。

## 7 合成受入条件（TB-Aの値／状態境界だけ確認、実class保証は未実施）

| ID | 独立に確認する期待 |
|---|---|
| TB-01 | 同bindingの非空／空200を受理し、S／全L／同Oが不変、U=O。時計呼出し・GET・decode追加0 |
| TB-02 | 別run／session／source／key／origin、copy／inspect値からの移譲を拒否。他runのslotは不変 |
| TB-03 | 生成・移譲・受理・discardの二度目と再入を拒否。claimは失敗後も戻らない |
| TB-04 | 各pre/post境界の取消・期限切れ・異常closeで両側停止、先行理由とHTTP／cleanup診断を保持 |
| TB-05 | S=O、O=S+Lは値境界として許可し、O<S／O>S+Lを拒否。別途元guardの期限切れは必ず停止 |
| TB-06 | 正常移譲後のsource資源解放では上位値を保持。元run失効では上位値も同期破棄。移譲前closeは拒否 |
| TB-07 | 非accepted／legacy非admitted／非200／cleanup未確認から発行しない。空200のO削除やS代用で救済しない |
| TB-08 | 固定discard後に時刻・identity参照を保持しない。公開summary／JSON／Permit・会計・予約返却は旧仕様不変 |

値owner単体の合成保証と、実classの固定fake継続の所有権保証は別集計。新friendでprivate時刻を公開しない。旧試験を残し、B-03のcompiled保証や実接続済みへ読み替えない。

## 8 推奨実装分割・承認待ち

1. **TB-A（限定実装済み）**：内部binding・上位owner／slot・one-shot移譲claimと固定discardを純粋fakeで実装。TB-01〜05／08の値・状態境界だけを確認（§9）。空200由来・元run・HTTP／cleanup診断との真正な接続はまだ保証しない。
2. **TB-B**：CT-A accepted slotのprivate生成継続と元run失効へ接続し、正常cleanupとの区別・失敗時両側解放をfake I/Oで確認。TB-06／07と旧回帰を検証。
3. その後にCT-B後半のworker世代／job claim・T_i／E、CT-Cの連続試験へ進む。B-03専用build／compiled・friend撤去は別工程。

正常資源解放とrun失効のprivateイベント境界、上位失効hookの固定所有者、追加work上界はTB-B以降の実装レビューの確認事項。低減LとJSON宣言deadline、日時長cap、本番採用も未解決。draft-0.1は設計文書のみ、draft-0.2の限定実装・試験結果は次節と検証記録に分離する。

## 9 TB-Aの限定実装と保証範囲

[release-time-owner](../src/servicenow/review-kernel/release-time-owner.ts)はrootをimportしない非実行の値scope。任意のfake identityから生成可能であり、実session／CT-A acceptedの証拠ではない。生成を一度に制限するclaimは各scope内のallocate状態で、同じbindingから別scopeを作る行為を実runの重複生成拒否と取り違えない。実run側の唯一の生成継続／claimとの接続はTB-Bに残す。runtime登録台帳を共有・追加せず、既存classからも呼ばない。

scopeは同binding objectとrun／session／source／key／origin／budget・S／全Lをdescriptorでpinし、各guardで再照合する。getterは実行せず拒否し、取得例外は固定内部失敗にする。private入力のdata契約であり、Proxy trapを無副作用で阻止できるとの保証はしない。開始／観測UTCは元のISOミリ秒UTC形式、Lは正整数1〜60000として値検査し、時計採取は行わない。

allocate→observe→issue→accept→discardを固定順序で消費する。observeは合成値のOだけを受け、S<=O<=S+L、U=Oを固定する。rows／policy／比較draftは受けないため、空200・非空200の由来は認定しない。issueでdonor値を取り外し、opaque handleとpendingへ移す。acceptはhandle／pendingを先に取り外してreceivingへ進め、同identityとpre/post guard成功後だけupper値を保持する。inspectは凍結された非実行dataだけで、移譲証拠へ戻せない。

全操作の開始claimはguardより前に消費し、guard中の捕捉された再入・同期revokeでも復帰しない。失敗は最初の固定code／phaseを保持し、後続失敗で上書きしない。正常にdiscardを終えたscopeはrevokeと同じく終端のまま保ち、後から誤って呼ばれた操作は拒否するがdiscardedを失敗へ書き換えず診断も追加しない。discard／失敗でdonor・pending・upper・handle・binding／pin参照を消す。外部が既に取得したinspect copyや注入checkの内部参照、heapの物理消去まで保証しない。revokeは純粋な明示イベントで、実runへのhookは未接続。

費目は固定8fieldのdescriptor収集・照合、生成時1回／各pre/post guardの一時copy、最大1つずつのdonor／pending／upper位置（同時に値を所有する位置は1つ）、handle、固定診断。新たなGET／時計／rows decode・C/G/P再課金はない。exact layout／workは引き続きUnknown。試験・型・compiled値fixtureと初回失敗は[TB-A検証記録](E2E_BEST_PRACTICE_RELEASE_TIME_OWNER_TBA_2026-11-01.md)を参照。TB-B／worker job・T_i／E・CT-C・B-03は未実施。

draft-0.3のレビュー修正：正常discard後のscopeに対し、accept／issue／discard等を後から誤って1回呼ぶだけで`state`が`failed`、診断が`internal_review_error`へ書き換わっていた（revokeだけは`discarded`を保っていた）。discard後の呼出しは拒否するだけで終端状態と診断を変えないよう統一した。上位設計からの版数リンクも更新した。
