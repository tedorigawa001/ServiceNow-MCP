# RD-C 封印期待値からfinish job・応答相関への接続 詳細設計

Version: br006-recovery-finish-job-rdc-draft-0.6 / Date: 2026-11-03。
Status: **設計のみ。RD-Cのjob／応答／候補は未実装。合成依存限定、正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

基準HEAD: `04eef33`（RD-B04実装`4533f49`と検証記録レビューを含む）。[親SR-D](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_SRD_DESIGN.md)§3・5〜10と[RD-B draft-0.6](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_VALUES_RDB_DESIGN.md)§13〜14からの差分。以下の型・操作・phase名は提案であり、現存API・承認済みruntime経路ではない。実装・実worker／runtime接続・実通信・実機操作・設定変更・Pushの許可を含まない。

## 1 現状と今回の境界

| 現行根拠 | 再利用するもの | まだ供給できないもの |
| --- | --- | --- |
| [回復kernel](../tests/support/review/synthetic-recovery-kernel.ts)のsealedFinish | 同accepted／plan／run・source／window／release／新frameと元時刻・集合のprivate期待値。一度seal済み | job ID台帳、dispatch、pending応答、候補 |
| 同source／readyOrigin／liveCleanup | 同owner・ready受理origin、source open、cleanup未開始serial=0、元sink | 実source・workerの生存証明。公開inspectを証拠として再登録しない |
| [RD-B03比較器](../tests/support/review/synthetic-recovery-finish-values.ts) | 二入力共有枠・集合／context／T_i・U・E・header比較。既存finalizeのomission error差分も維持 | 応答由来・元reviewed本文／findings一致・full集約schema／wire保証 |
| [通常WJ-A](../tests/support/review/synthetic-worker-job.ts) | generation／supervisor／worker／kind／id相関の参考 | SC2-Cの新frameは同台帳に登録されていない。新しいownerへbindして救済しない |
| [実監督](../src/review/worker-supervisor.ts) | 参考のwire `{id,ok,json}`、262144-byte上限、readyを含むsequenceの消費 | 本設計のfake jobと実監督の同一性・実終了保証 |
| acceptedTermination／RA-03-B | 元acceptedを使う同source／新frameの固定discard責務 | 候補消費用の正常終了証拠・最終checkpoint。RD-Dで別に設計する |

初期対象は既存のworker期限型の同kernelだけ。phase型summary、通常WJ-C、旧SC2-Dのdata-only handoffに可変modeを追加しない。公開JSON／既存workerプロトコルは変更しない。

## 2 同owner内のprivate契約

| 役割案 | 発行元・保持内容 | 禁止する昇格・再利用 |
| --- | --- | --- |
| RecoveryFinishStart | 同kernelがsealedFinishを取り外す固定開始claim。元sealed origin・accepted origin・plan・frame・期待値の所有権 | callerからraw期待値／frame／id／E／callbackを登録しない。失敗でもsealへ戻さない |
| FrameSequence | 新frame生成から継続するprivate ID台帳。frame参照・ready交換の消費ID・lastId | ready_eventsやsummaryから再構築しない。旧世代counterを借りない |
| RecoveryFinishJob | 同開始claim・同FrameSequenceから最大一つ。owner／run／session／source／key／origin／budget／release／window／plan／frame／kind=finish／idと期待値 | 数値idだけ、copy handle、別root、古いready／analyze jobを受けない |
| RecoveryFinishDelivery | 同pending jobに紐付く固定fake受信継続が発行。job origin・frame参照・send origin・wire受領物 | JSON中の自己申告supervisor／worker／generationを由来として採用しない |
| RecoveryFinishLocalCheck | 同jobの相関とRD-B03比較を両guard内で終えた非実行結果 | authority:none／context_and_manifest_only。候補・本文検証・正常close権限へ変換しない |
| RecoveryFinishCandidate（後続gate） | 同jobに加え§7の内容・full schema／wire証拠が全て揃った固定継続だけ | 不足をboolやwarning、同context、omissionで救済しない。現時点では発行口を作らない |

slotは同kernelのguard／busy／first hard／source／cleanupに所属させる。private child moduleを分けても別owner／budget／停止時計・登録台帳を作らない。sealed値のgetterや、公開summaryをpendingへ戻す入口は設けない。実sessionや既存ownerを受け入れるfriendも追加しない。

合成I/Oは新規rootの固定constructor継続が内部で構成する。操作ごとの任意dispatcher callbackや、生成済みrootのmode切替は不可。失敗／遅延等のfixture dataを扱う場合もstrict boundedにpinし、元private参照をfixtureが書換えられないことを要求する。

固定操作案は次に限定する。いずれも現時点では存在しない。

| 操作案 | 入力／結果・責務 |
| --- | --- |
| `beginRecoveryFinish(binding, sealed)` | 同sealedを取り外しIDを確保、post guard後だけ同jobの空handleを返す。dispatchは0 |
| `dispatchRecoveryFinish(binding, job)` | 同pending jobを使い、内部固定fake sendを一度呼ぶ。dispatcher／frame／id／期待値を引数で受けない |
| `consumeRecoveryFinishReply(binding, job, delivery)` | 固定受信継続のprivate deliveryを一度消費し、相関・E・局所比較を行う。初期段階は非実行local checkまで |
| `consumeRecoveryFinishFailure(binding, job, failureDelivery)` | 同send由来の固定reject／失敗イベントを一度消費し停止。任意raw例外や自己申告codeを正常能力へ変換しない |
| 既存のsource／cleanup・`discardAcceptedFinishContext` | 元責務の解放と非実行discard。新しいjob用closeを追加して二重解放しない |

raw JSON／失敗eventの合成注入はconstructor側の固定fixture supplierに限り、そのdataからprivate deliveryを発行する継続を別に検証する。deliveryを発行した事実だけで実workerからの受信と呼ばない。

## 3 要求IDと生成時からの継続

現回復kernelには新frameの要求sequenceがない。実監督では`exchange('ready')`もsequenceを消費する一方、通常WJ-AのreadyはIDを消費しない。従ってWJ-Aをそのまま移植したり、現在のready回数から`lastId`を計算したりしない。

新しい合成接続では、**同frame生成時**にFrameSequenceを作り、元start／ready交換の開始claimでそのcounterを一度消費して、成功したready originに結ぶ。最初からその規則で構成したfixtureではready交換=1、最初のfinish=2になるが、finish入口で2をハードコードして復元しない。外部にID採番APIを公開しない。

finishではsafe integer・同frame・ready受理済み・cleanup未開始・pendingなしを検査し、次IDを一度確保する。overflow、不足したsequence証拠、旧frameのcounter、既消費値は固定拒否。claim後にpre-guard／送信／応答が失敗しても、lastIdやfinish開始claimは戻さない。新世代起動・ready再発行は0。

既存のlegacy／lifecycle／pinned試験の外部API・診断・世代回数は維持する。旧fixtureを「ID証拠あり」と暗黙に扱わず、後続実装では同じ生成継続にprivate記録を追加してからjob入口を接続する。この追加自体も未実装である。

## 4 固定状態遷移とdispatch境界

次の状態は概念上のRD-C専用slot。現root全体の`state='consumed'`を成功候補と誤認しない。

| RD-C状態案 | 処理 | 一度限りの消費・失敗 |
| --- | --- | --- |
| sealed | RD-B04の同sealed slotとlive routeがある | caller指定値で期待値を置換しない |
| start_claimed | busy／owner検査後、最初の外部guard前に開始claimを占有しsealed slotを局所pendingへ取り外す。同frameのIDを確保 | 開始失敗でもslot／IDを戻さない。未dispatchなら送信数0 |
| job_pending | 開始操作のpre-guardと固定同一性検査を経て同jobを登録し、post guard後だけhandleを公開 | まだ応答を受理しない。dispatch未開始のreplyやsend中の再入を拒否 |
| dispatched | 固定fake send呼出しの直前にdispatch試行を計上。post guard後だけ配送受理可能にcommit | 呼出しがthrow／後でrejectでも試行1。再送0、追加回復0。send中の同期応答はbusyで止める |
| reply_checking | 同delivery／pending jobをclaimで取り外し、strict相関→bounded応答検査→局所比較 | 不正・重複・遅延・copyでもpendingを戻さない。post-guard停止を優先 |
| checked_non_executable | 本文証拠等が未実装の試験段階で保持できる非実行の検査結果だけ | 後から証拠を継ぎ足して候補へ昇格しない。固定discardへ進む |
| candidate_held（後続） | §7の全gateとpost guardに通った同jobの候補slot | getter／JSON／summaryから生成不可。RD-Dの一度消費にだけ移す |
| failed／discarded | 初回hardとcleanup診断を保持、private job／期待値／応答を破棄 | sealedへの巻戻し、再job、再解析、新rootへの移送は禁止 |

同一性検査は元binding・run／session・source参照／identity・認証key／origin・budget／release／window・元accepted／sealed origin・plan・新frame／ready origin・cleanup identity／serial=0／sinkを継続させる。生存を公開診断のready_events=1で代替しない。

fake sendはI/Oを行わない有限イベントとする。同期throw、送信直後の失敗、後続reject／応答を区別して同jobへ記録する。busyを保持したまま待ち続ける実装や、任意Promise／thenableを無制限にawaitする口は作らない。待機はpending slotとして表し、後続fake delivery／rejectは固定継続の別保護区間で受理する。busy中の同期再入はcatchされても外側を失敗させる。実非同期adapterのtask／listener／Promise解放は別接続時の課題であり、fake成功をその証明にしない。

## 5 strict応答・相関・Eの一度受理

相関は**private受信origin**と**strict data**を分ける。

- originは同ownerのpending job・send origin・元sealed／accepted・同frame／supervisor／worker／generationと固定継続からの配送であることを比較する。任意objectやJSONにある同名fieldをoriginへ昇格しない。
- wire成功形は参考としてown dataのexact `{id, ok:true, json}`に固定する。idは正のsafe integerでpending IDと一致、jsonはstring。不足／余分key・配列・accessor・Proxy・不正型を拒否し、getter／trapを呼ばない。失敗応答やready／analyzeを成功形へ読み替えない。これは将来の合成契約案で、現実監督の受付仕様は変更しない。
- 同じIDでも別frame／旧generation／別supervisor／worker・別job・別send originは拒否。同jobは最大一つの配送を消費し、不正応答を捨てて次の応答を待つ動作にしない。
- jsonはUTF-8 byte数で262144以下を**parse前**に確認する。局所projectionの文字費262144と同一保証にしない。JSON parse後にも有限構造枠・strict full schema・固定projectionを適用する必要がある。将来の受信境界では巨大string生成／取得前の制約も別に扱い、byte長を調べただけで受信全体がboundedとは主張しない。
- data-only集約のschemaは同sealed期待値の0.2／0.3と一致させる。元jsonのfull検証が済む前に必要fieldだけ取り出して不足を隠さない。[内容gate設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_CONTENT_GATE_DESIGN.md)§11のCG-Aで、形状上界・同JSON文字列のstrict bounded decode・full schema値検証を合成限定実装した。受信origin・job・captureへの接続と全体費用は未検証で、通常経路の受付範囲は変更しない。
- Eはこの同deliveryの集約`ended_at`から一度受けるms精度UTC。元S／全L／O／Uを固定し、RD-B03で全T_iと`U≤E≤S+L`を検査する。親時計による補完・再採取・clampは禁止。operator_configのexpiry>S+60000も維持する。
- 相関・値不一致・parse／projection失敗は局所固定flagとして保持し、元post guardの取消／期限切れ・先行hardの後で拒否する。pre-guard前のclaimが失敗した場合や再入時のfirst hardは復元しない。途中のE／結果をinspect・戻り値へ公開しない。

## 6 停止・診断・cleanup責務

| 原因 | 固定分類・消費 | 解放の扱い |
| --- | --- | --- |
| 誤handle／不足sequence／混入／二重開始／相関・schema・集合・時刻不正 | internal_review_error。開始claim／ID／pendingのうち消費済みのものを戻さない | 取得済みprivate値を同期破棄、元cleanup sinkは責務用に維持 |
| 元guardのcancelled／deadline_exceeded | 最初のhardを保持、正常値や不一致よりpost guard優先 | 遅延応答・後続confirmedでjob／候補を復活しない |
| fake send同期throw／reject／未知例外 | 未知理由はinternal_review_error。固定継続が既存worker_unavailableを供給する場合だけその分類を保持 | dispatch試行は最大1。再送・再起動・第二soft回復なし |
| source close開始／新cleanup開始 | 未消費sealedとpending job／期待値を同期失効 | 既存RA-03-B責務のsourceと新frameを別軸で回収 |
| source失敗／cleanup未確認 | 先行hardを保持し、source／新cleanupのscalar診断を分離 | 正常候補消費・normal closeは拒否。診断sinkは正常終了証拠ではない |

RD-Cの局所検査を終えた非実行経路では、元accepted handleの固定discard→normal closeを継続する。jobへ移した期待値を失効させてもacceptedTermination／sinkを重複所有・二度closeせず、責任者を空にしない。途中hard後は既発行sinkによる診断回収だけを許す。

**候補が将来成立した場合の相違：** 現RD-B04はsource／cleanup開始でsealedを破棄する。RD-Cではjob消費時にsealedから期待値の所有権を取り外し、post-guard後の候補は別slotとする。正常cleanup開始は既消費jobを失効させても、候補のterminal-only所有権を無条件に消してはならない。hard／cleanup失敗では候補を失効させる。どの情報をRD-Dへ一度移すかは専用終端契約で実装し、現RA-03-Bのdiscard完了受領情報をそのまま候補用SourceClosed／NewCleanupConfirmedに転用しない。

## 7 本文／full schema／wire不足による候補発行停止

保護capture・所有権・同bytes・full schema・三つのomissionの差分は[内容gate詳細設計draft-0.6](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_CONTENT_GATE_DESIGN.md)で具体化する。CG-A／Bと、別constructorから既存accepted／plan kernelへ同receiptを結ぶCG-BP1は合成限定実装済み。finish jobへの連結と以下のgate全体はまだ成立していない。

現`synthetic_original_outcome_pin`はdescriptorとcontextの参照で、受理済み元結果本文／findingsのcaptureやdigestではない。RD-B04の封印とRD-B03のmatches:trueを足しても、本文改変を検出できる証拠にはならない。

候補を作る前提は次の全項目を、同jobからのprivateな検証継続へ結ぶこと。callerの`verified:true`や空body／ダミーdigestで満たさない。

1. 元analyzeのpost-guard受理継続で同receipt／T_i／受理originに結んだimmutable本文の保護capture。結果を送信後の応答から逆算して作らない。
2. 同deliveryのfull集約schema（0.2／0.3）、counts／coverage／selection／findings／omission整合の検証。
3. 同じjson bytesのwire長とbounded decode／strict projectionの結合。
4. 元reviewed本文と応答内容の一致、または既存finalize相当の全結果単位omissionだけを許す比較。omission error／truncation差分は最新RD-B03の規則を維持する。
5. 全体の元guard／deadline・source／新frameのlive条件とpost guard。

これらの型・発行元・寿命・費用は内容gate設計のCG-A〜Dで別実装・検証が必要。最初の合成job試験は非実行local checkとdiscardまでに限定し、候補slotのfactoryを先に作らない。後で欠損を埋めて同local checkを候補へ昇格する経路も不可。reviewedが0件でもfull schema／wire等のgateを省略しない。元結果body／codeをログやsummaryへ出さない。

## 8 費目所有・有限イベント上界

| 費目 | 所有者・計上時点 |
| --- | --- |
| 開始claim／sealed取り外し／ID確保 | 同kernel。owner検査後の最初のclaimで一度。pre-guard失敗も返却なし |
| fake send | 固定dispatcher。実際の呼出し直前に1。非dispatch拒否0、同期throw／rejectは1 |
| pending／delivery／応答消費 | 同job slot。pending最大1、有効受理最大1。拒否試行も有限のfixtureイベントとして数える |
| byte長／decode／full schema／projection／比較 | 同受信継続。ただし各費目を分離し、重複projectionやZod copyも無料にしない |
| E受理・候補slot（後続） | 同job。E最大1、候補格納最大1。不成立時は公開0 |
| cleanup要求／確認／遅延診断 | 既存source／新frameの固定owner。sinkを複製せず二重close0 |

開始claim≤1、採番finish ID≤1、dispatch≤1、pending≤1、応答消費≤1、新HTTP／input／analyze／verify／generation／ready／retry=0を初期モデルとする。失敗した入力操作を成功件数だけで隠さない。元C/G/P・retry prefixは不変で、fake sendをHTTP Cへ加算しない。

開始Sと全L（最大60000ms）を継続し、remainingから別deadlineを作らない。外側の385秒等の別工程の期限を流用しない。追加work・layout／allocation・保持byte、decoder／full schemaの総費用、実cleanup待ちの上限はUnknown。RD-B04 usageを総費用に読み替えず、本番cap・全体受付を有効化しない。

## 9 合成受入条件と独立oracle

- 同sealed／owner／新frameだけ通す。copy／別root／summary／RD-B03結果・別accepted／旧frame・同じ数値ID／別jobを一要素ずつ差替えて拒否。他rootと元会計は不変。
- readyのprivate採番継続、finish IDの単調一度消費、overflow／不足台帳の停止。新しいbind／start／readyを呼んで救済しない。
- 固定イベント表からclaim・ID消費・dispatch・応答消費・E受理を独立に数える。pre-guard拒否・send前拒否はdispatch0、同期throw／rejectは1。二重送信／二重応答／再入は再開しない。
- 各pre/post guardの取消・期限切れ・再入・未知例外、正常値と不一致双方のpost-guard優先。遅延ready／analyze／旧job応答を取り込まない。
- strict wireのmissing／extra／accessor／Proxy・不正JSON・schema違い・境界byte長±1を確認。byte数と文字費の独立oracleを使い、同一bytesからの検証を確認する。
- S／O／全T_i／U／Eの等号と±1ms、短いL、operator expiry=S+60000の拒否、元0.3制限、omission error差分を維持。
- 元本文がない／findingsが異なる／full schemaやwireが未検証なら、局所比較が成功しても候補0。cleanupと非実行discardまでの保証と、将来の候補保証を別試験にする。
- source／cleanup開始・hard後のpending失効と遅延確認、sink一度回収、秘密非出力、正常close前の責務残存拒否を確認。
- 通常WJ-A/B/C、旧SC2-A〜D、RA-03-B、RD-B01〜04とlegacy API／型を維持。配布物のJS／d.ts／mapに新root・brand・methodを含めず、I/O／clock／worker依存の注入対照を実行する。

ここにあるのは後続試験の受入条件であり、今回実行済みの新試験ではない。

## 10 実装の優先順

| 分割案 | 最初に実装する範囲 | まだ有効にしないもの |
| --- | --- | --- |
| RC-A | 同kernelの開始／job内部型、生成時からのFrameSequence継続、sealed one-shot移譲・live binding・失効 | dispatcher・応答・候補。旧APIは維持 |
| RC-B | 固定fake dispatchとイベント会計、send throw／rejectとcleanup責務 | 実通信・実worker・候補 |
| RC-C | private delivery相関、一度応答消費・E・RD-B03への限定比較接続 | 本文等のgate未充足時の候補発行。非実行check／discardまで |
| 内容gate（CG-A／B／BP1合成限定実装） | [CG-A〜D](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_CONTENT_GATE_DESIGN.md)。値検証・captureに加え、別rootから既存accepted／plan kernelとの結合まで実装。finish job・実受信origin、omission／full比較、一度限りgateは後続 | 旧root／descriptor pinの後付け昇格、未知費目の確認済み化 |
| RC-D（gate成立後のみ） | 同jobからの候補一度格納・失効・RD-Dへのprivate終端移譲 | 正常終端証拠の代用、実review結果・Permit発行 |

名称・分割は設計案。RC-A以降の実装は個別に指示を受ける。phase型拡張、実session／ReleasePermit／payload／workerへの正式binding、実OS終了・外側監督、B-03 compiled保証、全体work受付は別工程とする。

CG-BP1後の先行項目は[非reviewed受領物詳細設計draft-0.1](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_NONREVIEWED_DESIGN.md)。producer別のAcceptedNonReviewed、RetainedNotProcessed、reviewedゼロ件のpartition証拠をNR-A〜Cで合成実装する案とし、workerに存在しないjob／T_iをmetadata行へ捏造しない。元omittedと親受理後のomissionを分けた上で、CG-Cの合法変換モデル、RC-A〜Cの同job通信相関へ進む。これは設計順の追加だけで、現rootの受付・job起動・候補発行を変更しない。

## 11 承認待ち・未確認事項

- FrameSequenceの具体配置とready交換の最初のclaim位置。既存合成ready試験・実監督との対応は実装時に再確認する。
- 構造化cloneで受けたjson文字列のUTF-8論理bytesと実IPC受信量は別保証。CG-Aの固定shape／decoder互換試験とCG-Bのfresh合成captureは内容gate§11〜12で実装したが、実IPC由来と全体費用は未検証。通常経路の受付は変更しない。
- 内容gate§2では同wire由来のschema-normalized owned本文をprivate snapshotにする案を選ぶ。正規化copy・保持ピークとworkの受付は未承認。hashや現descriptor pinだけで意味／由来／full schemaを証明しない。
- 元cleanup責務を候補の終端ownerへ一度移す具体型。RA-03-Bのdiscard経路と競合せず、hard後のsink回収も失わせないこと。
- 総work／allocation・本番cap・全体受付、実clock／send／terminateの上限は未導出。候補gateを将来開く判断とともに別途レビューする。

本書はMDだけの追加。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持し、実装・fake dispatch実行・実接続・実通信・実機操作・トークン発行・設定変更・Push・担当者への連絡は行わない。
