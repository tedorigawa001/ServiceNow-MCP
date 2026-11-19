# AP05：候補検証の固定終了観測点と費目台帳の入口

Version: release-ap05-candidate-observation-cost-ledger-draft-0.2 / Date: 2026-11-19。
Status: **詳細設計のみ。上限・係数・時間の数値、観測provider、保全方式・保全先、実行は未承認。** 静的照合基準は `c637ddc`。候補revisionの実測・終了確認はない。

[外側時間枠・cleanup予約設計 draft-0.2](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_OUTER_BUDGET_CUSTODY_DESIGN.md)のAP5-O01〜04／C01〜07と、[共通受入設計](BEST_PRACTICE_RELEASE_AP05_PK01_PK04_CANDIDATE_ACCEPTANCE_DESIGN.md)のAP5-T01〜04を結ぶ。対象はPK01〜04の候補P系列。H／D・UN62／LM03・AP06の通常並列対照は別枠。[B-03](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)の終了・有限保持契約を維持する。

先行AP03の未コミット差分、通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回はMDのみ。実装・旧試験変更・試験実行・build／梱包／展開・process／保全操作・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 現行で読める境界と、新たに必要な観測点

「現行」はsourceの静的確認であり、候補配布物での取得実績ではない。PK01〜03の対象compiled childは `execFileSync`／`stdio: 'inherit'` で、child起動に明示timeoutの指定はない。pack dry-runの stdout／stderr pipeと `maxBuffer` はこのcompiled childには適用されない。PK04は外部コマンドとsmoke childに個別timeoutを指定するが、全系列の外側枠・孫process・thread・保全の確認点ではない。現在の各設定・assertionは変更しない。

| 観測ID／対象 | 現行sourceで確認できる範囲 | 候補Pで追加が必要な観測点｜受入条件 |
|---|---|---|
| AP5-V01／runner・command（T01） | [PK01](../tests/review/package-canonical-budget.mjs)・[PK02／03](../tests/review/package-http-classification.mjs)は同期呼出しの復帰／throwを利用。 [PK04](../tests/review/package-worker.mjs)では同期戻り値をassertし、外部コマンドとsmoke childで個別timeoutを持つ | spawn前に同候補／slot／attemptと終端用の保持欄を確保。spawnの呼出し直前、同handle受領、停止要求、exit観測、回収確認を別に観測する。復帰／throw・timeout・停止要求を一律にexitや未生成にしない。PID単独・別attemptからの通知は不可 |
| AP5-V02／子・孫・worker thread（T02） | [ReviewWorker](../src/review/worker-supervisor.ts)は内部Workerの `error`／`exit` を扱い、`close()` は `terminate()` の正常解決後にlistener／streamを処理する。[adapter](../src/review/update-set-adapter.ts)は内部の `cpu.close()` を待つ。PK04のsmoke出力は解析／集約等のassert成功であり、外側台帳のjoin記録ではない | 親に結び付いた作成試行・handle／generation受領・退出／joinを対象ごとに記録し、生成側の受付閉鎖と登録集合の完全性を照合する。processの親子identityとthreadのowner／generationを区別。runner exit、ready／finish返答、既知件数ゼロで未登録tailを消さない。確認済み未生成には正規生成点の未通過または生成しなかった証拠が要る |
| AP5-V03／stdio（T03） | PK01〜03のcompiled childはinheritであり、scriptに各streamの独立終端記録はない。PK04はsmokeのstdout文字列をassertする。ReviewWorkerの内部stdout／stderrは `resume()` で流し、closeの正常経路で `destroy()` する | 起動前にstdinの所有mode・stdout／stderr個別の観測枠を確保し、親のcommand pipeとworker側streamを混同しない。取得可能ならEOF／close、error、保持打切りを別々に記録し、所有stdinのcloseまたは非所有の根拠を確認。listener解除・destroy要求・exit・成功文字列は正常EOFの代用にしない。保持停止とdrain停止は別 |
| AP5-V04／保全・解放（T04） | PK04は一時展開先を `finally` の `rmSync` で処理する。現行のpack／smoke結果には、上位受理・排他的な処理権限交替・所有範囲の空確認の個別結果はない | 起動前の上位枠確保、資源の棚卸し、同slotの受理commitとreceipt照合、唯一のownerでの許可済み処理と独立した空確認、最終記録封印を分けて観測する。受理不明・消去途中・親喪失では既知prefixと未解決責務を保持。ackや削除要求だけを解放成功にしない |

共通相関は候補pin／系列／slot／attemptを根にし、command handle・worker generation・stream役割・上位receiptをそれぞれ先行欄に結ぶ。source側の観測点で登録・終端を捕捉する経路と、外側ownerで同対象を受理する経路を区別する。外側の期限監視を、監視対象の同期呼出しの復帰や同runner内の通知だけに依存させない。生成後のPID列挙や出力の文字列一致だけで登録の欠落を補わない。B-03や既存WF-Aの記録を参照しても、候補Pで使える正規供給点・検査器上の捕捉方法・権限は未確定。観測のために本番friend、公開診断口、fixture台帳の共有は追加しない。

時刻判定は外側の同じ単調時計で受理時点を記録し、producer時刻は相関用に限る。期限以前に起きたと申告されても、同identityの証拠を期限内に受理できなければ「期限内確認」にはしない。`confirmed`／`confirmed_not_created`／`unconfirmed`／`not_applicable` は区別し、後二者のうち `not_applicable` には固定planと所有modeによる根拠を要する。重複・foreign・曖昧な通知、観測開始前に失った通知は固定診断とし、再受理・無制限な照会は行わない。late通知は元判定を書き換えず解放記録としてのみ扱う。

## 2 費目台帳の入口：回数・件数・bytes・待受は別の列

費目の主キーは「候補plan版／slot種別／正常・失敗prefix／費目ID／操作種別」。固定scheduleの操作ごとに、担当owner、生成・消費点、回数上限 `Q`、対象件数上限 `N`、総通過byte上限 `B_io`、最大同時保持bytes `B_live`、最長待受 `L`、上限の由来、超過時の保持先を記録する。ひとつの外部呼出しを一回と数えても、内部で生成した対象・処理bytes・終端待ちは別勘定。費目表の待受は**観測・受理を待つ上界**であり、対象が物理的に完了する時間の保証ではない。

| 費目／対応 | 回数・件数の根拠 | bytesの根拠 | 待受上限の根拠・不足時 |
|---|---|---|---|
| AP5-L01／O01：先行保持・pre-pin | 固定manifestのルート／ファイル／依存ごとの走査・解決・hashと、系列／slot登録の試行を列挙。symlink等の到達範囲・重複排除を先に確定 | pinned実体の件数と個別・総読取cap、manifest encodingとscratchを別計上。hashの入力bytesをdigestサイズに置き換えない | 走査／I/Oと上位枠の応答に別の有限待受。必要なpinや登録が不明ならbuild 0 |
| AP5-L02／O02：build・pack | 固定コマンド起動／出力manifest／tarball pinを別行。コマンド内のchildはV02の上界と生成台帳が必要 | buildの入出力、tarball、manifest読取・hash、stdioを別計上。複数passなら各passの処理bytesを足す | 固定コマンド上限＋exit／stdio／post-pinと通常退出費。既存command timeoutでは足りず、未知childが残ればpack／展開0 |
| AP5-L03／O03：展開・依存・添付 | tarball entry／展開対象、ローカル本番依存と実解決辺、添付物の固定リストの各pass。展開前に数えるだけで終えず、実展開側も照合 | archive bytes、展開後の実bytes、依存copy・fixture添付・manifestのbytesを独立上限。膨張や追加参照は観測中に上限を越えさせない | 展開／ローカル依存準備／解決・post-pinの待受を区別。欠落や期限超過で代替loader・registryに切り替えない |
| AP5-L04／O04：P+／P0／PΔ | 正規対照IDの一覧、PΔ一変異ごとの隔離copy、固定entryの起動・assert・同identityの結果受理を列挙。必要物欠落の対照も独立slot | 元配布物の走査、隔離copy、差分、試験の固定入力／結果、stdioの流量と保持の上限を別計上 | slotの `W_i` は起動・検査・所定理由・通常の終端／保全まで。P+／P0不成立でPΔを実行しない |
| AP5-L05／C01・R1：停止通知（V01） | 同attemptの受付閉鎖・先行理由確定、承認済みの通常停止要求と応答観測。停止対象は既知owner台帳から選び、再送で枠を増やさない | 同identityと固定理由の制御値、および通知結果のrecord上限 | 送信・受理確認を固定cutoffまで。応答なしは未達／未確認。強制停止は別承認で既定費目へ暗黙追加しない |
| AP5-L06／C02・R2：runner／worker退出（V01／02） | 同系列のcommand数と同slotのprocess／thread上限、対象ごとの登録・退出・join／回収回数を分ける。先に起動manifestから候補上界を導き、生成時の上限と照合 | 実行側のhandle保持欄と、保全する固定識別・終端情報、registryと要約の最大同時保持を分ける。handleそのものは保全記録へ直列化しない。未到達用の欄も予約する | 個別joinの待受と集合確定のcutoffを分ける。欠落や未登録tailはUnknownで、全子終了まで無期限に待たない |
| AP5-L07／C03・R3：stdio（V03） | 対象数×固定stream役割から件数を導く。read／drainの回数・一回処理量・終端通知の受理回数を別に制限。出力chunk数をstdoutのline数で推定しない | `通過・廃棄したbytes`、`保持bytes`、受信bufferのpeak、固定要約を別計上。上限超過を0bytesにしない | 読取と終端待ちのcutoff。保持打切り後も承認済みの処理量・時間内でdrainを観測し、そこで未closeなら責務を保持。timerや `maxBuffer` をEOF証拠にしない |
| AP5-L08／C04・R4：post-pin／棚卸し（V04） | 生成prefixごとに必要なmanifest／所有台帳を選び、ファイル確認・再hash・未解放照合のpass数を固定。通常終了で済んだ同確認は繰り返さない | 残存owner欄、照合対象bytes、copyなしの要約と必須scratch。基準artifact・依存原本の全面走査を暗黙加算しない | 所有・安全な読取を確認できる場合だけ所定cutoffまで。未終端により確認不能なら未確認としてR5へ |
| AP5-L09／C05・R5：上位受理（V04） | 同slotの固定候補作成・一度限りcommit、同receiptの有限照会を別計上。照会は再commitではない | 厳密fieldのencoded上界×記録件数＋上位保持と移譲中の重複保持。raw stdout・token・URL・payloadは保全しない | commitとreceipt照会の待受を分ける。上限内の具体費用は方式未選定のため不明。ackなし・一致不能で削除0 |
| AP5-L10／C06・R6：固定discard（V04） | 受理後の唯一のownerに限定し、事前台帳上の対象ごとに処理・結果確認を別計上。再帰的処理は内部の対象件数／深さが固定できなければ認めない | 所有一時領域の件数・bytesと削除確認のためのmetadata／台帳bytesを別記。共有原本は対象外 | 事前照合・処理・独立した空確認の待受。失敗／部分処理で再削除せず、上位に残す |
| AP5-L11／C07・R7：判定封印（V04） | slot結果と系列結果を区別し、対象欄ごとに固定回数の確定を行う。R7で前段のwaitをやり直さない | PK／対照ID、先行理由、終了四軸・欠落／残存責務の固定型とencode scratch。late記録は隔離し、予算を流用しない | 最終記録までの予約を前段に貸さない。`D_end` 到達・記録不達は上位の先行欄でUnknown。封印未達を成功にしない |

## 3 上界の導出と親時間枠への接続

1. **構造上界を先に作る。** 固定slot列、各操作の呼出しsite・最大通過回数、生成prefixごとの同時／累積対象台帳、manifest・固定recordのencodedサイズから `Q/N/B_io/B_live` を導く。固定オブジェクトサイズやファイルの宣言長だけで実通過bytesを代用しない。加算・乗算を上限付きで先に検査し、不正・超過は実処理の前で拒否する。試行は呼出し前に計上し、失敗・timeout・未確認によって回数や既観測bytesを戻さない。
2. **待受と処理費を区別する。** `L` は同ownerが観測を待つ固定上限。CPU処理・encode・copy・通知配送・計数・監視／drainの費用は、件数／bytesと実装上の中断点・対応環境を根拠に別途見積もる。独立に並走でき、競合と同期点も押さえた待受だけを共通窓で計上する。根拠がなければ直列の保守和を使い、上界のない操作を足して「有限」とはしない。処理を中断できない外部操作は、observerの待受を閉じても未終端責務を残す。
3. **通常と失敗の予約を二重使用しない。** 正常slotの必須退出・通常受理／回収は各 `W_i`、失敗時の未完了prefixと系列共有物は一度だけの `R_cleanup` に載せる。同じ費目は「正常完了済み」か「残存」のどちらかへ結び、既処理の再実行をしない。他方、失敗した命令が止まるまでに消費する費用と、残存責務を観測・保全する費用は別。親の `D_obs`／`D_end`、各 `Rk` cutoff、厳密不等号の入場条件を変えない。
4. **由来を明記する。** 行ごとに「固定表から導出」「設定により強制する上限」「観測した値」「未導出」を区別する。現行timeout／過去の成功時間・平均は承認済み上界ではなく、処理の停止遅延・出力超過・子の退出遅延・保全不通のときも、先行理由と未確認を確定できるかを別に審査する。観測供給元や保全方式が未選定のため単価・待受・保全成立が不明な行を、未実施の合成試験や類似機構で埋めない。

台帳の算定例（全て記号）：同slotのstream件数は所有対象種別ごとの `累積生成対象数 × 対象当たりの対象stream数` の和。同時保持bytesは、重なるphaseで生きているstream buffer・registry・要約・encode scratch・移譲中のcopyを足した最大とする。同じbackingの借用は所有と寿命を証明できる場合だけ一重計上し、別copy・保持延長とは区別する。`B_io` は操作ごとのpassで実際に通すbytesの和、保全のencoded上界は `固定framing + Σ(記録種別の件数上限 × 個別encoded上限)`。registryや保持bufferの容量を、未登録tailがないことやpipeが流した累積bytesの根拠にしない。

## 4 後続レビューの入口（未実行）

- **観測点の受入案：** runner code 0先行＋worker未join、stdio片側EOF／他方未close、未登録tail、spawn後handle未着、同receiptのack欠落・別slot混入、削除途中・時計故障、遅いexit／EOFを別対照にする。一つの確認を他軸に転記せず、上界到達・正規未生成・未観測を判別する。
- **費目の受入案：** 固定slotとサイトから作る独立の数え上げで、境界の直前／一致／超過、未開始suffix、部分生成、shiftなしのcutoff、保持打切り後の有限drain、正常とcleanupの二重計上／漏れを照合する。費目漏れや不明値のゼロ補完は起動拒否とする。
- **別途決めること：** 正規観測providerと通知の到達・完全性、対象同一性の実際の供給点、操作・件数・bytes・待受の数値と根拠、保全方式／保全先・保持期間・移譲と削除の権限、観測不能時の責務の独立保持。これらが揃うまでは候補Pを起動しない。この設計はAP05検証・旧試験切替・AP06・閉鎖条件の解除を承認しない。

[観測手段比較・取得証拠と費目の対応 draft-0.2](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_OBSERVATION_METHOD_COMPARISON.md)で、V01〜04ごとの観測手段を直接候補・補助・現行のみに分け、取得できる証拠・欠落時の扱い・対応するL行を比較した。観測provider・数値・採用は未承認のまま。
