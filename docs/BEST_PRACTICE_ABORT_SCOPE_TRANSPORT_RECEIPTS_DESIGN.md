# AU-BR-006 実transport：用途別body receipt・cleanup証拠・単一予算の接続詳細設計

Version: br006-transport-receipts-draft-0.1 / Date: 2026-10-26。
Status: **設計のみ・未実装・未承認。正式な証拠発行口は閉鎖を維持**。
親：[実session／private受領物](BEST_PRACTICE_ABORT_SCOPE_REAL_SESSION_RECEIPTS_DESIGN.md)、[bounded予算](BEST_PRACTICE_ABORT_SCOPE_BOUNDED_BUDGET_DESIGN.md)、[固定source issuer](BEST_PRACTICE_ABORT_SCOPE_FIXED_SOURCE_ISSUER_DESIGN.md)。

## 1. 範囲と不変条件

実BoundedReadSessionの認証・受信・中断・cleanupに用途を結び、同じC/G/E/R/clockから一度だけ受領物を発行するための設計。既存prepared owner／draft／fake完了票は本番証拠に昇格させない。実装・実機操作・トークン発行・設定変更・cap投入・公開規則登録・Pushは行わない。VM／監視／telemetryは保留、Unknown・全体受付無効を維持する。

- HTTP全210試行、全受信16MiB、通常1応答4MiB、payload単体2MiB／累計8MiB、全体60秒の既存上限を上げない。低減設定も尊重する。
- 認証snapshot／originは同sessionで固定。per-userからservice-accountへ切り替えず、別client／sessionで予算や認証を作り直さない。
- sourceは選択と意味検査、transportは実試行・chunk・cleanup、supervisorはworker／IPCを所有する。意味検査やreceipt消費でC/G/Eを再加算しない。
- 正常body受領、JSON構文受理、sourceの行／版検査、workerの比較、上位completionは別の事実。一つのreceiptから残りを推定しない。
- 公開0.2/0.3・既存14明示／3既定規則と非BR-006経路を維持する。同process内の侵害コードを隔離する仕組みではない。

## 2. 現行差分と公式仕様の確認

現行bounded-read.tsのattemptはCを消費してfetchし、readでS/Gを課金、JSON.parse後に値を返す。finallyはcancelをbest-effortで要求するだけで、完了確認／releaseLock／typed受領物を返さない。現行final=trueと固定4予約では用途別slotを証明できない。sessionのprepared lifecycle hookがあっても、この不足は解消済みではない。

公式資料のAI読み取り：2026-10-26。資料が述べるAPIの意味と、本書が追加する保守的policyを分ける。

| 根拠 | 該当箇所・確認した範囲 |
|---|---|
| [WHATWG Streams §4.3.3](https://streams.spec.whatwg.org/#generic-reader-cancel)／[§4.4.3](https://streams.spec.whatwg.org/#default-reader-release-lock) | cancelのPromise、closed、read、lock解放の役割。lock解放時に残っているreadはrejectされ得るため、解放だけを未処理read完了の証明にしない |
| [WHATWG stream.cancel](https://streams.spec.whatwg.org/#rs-cancel) | cancelの成功／失敗とlocked streamの制約。reader所有中にbody.cancelを重複実行しない |
| [Node.js 22.x Web Streams](https://nodejs.org/docs/latest-v22.x/api/webstreams.html#class-readablestreamdefaultreader) | cancel／closed／releaseLock。取得時の表示はv22.23.4。最低対応22.12を含む実Node／fetch実装での競合試験は未実施 |

これらはsocket／TLS／OS bufferの消失を保証する根拠ではない。後述のconfirmedはプロジェクトの**API観測範囲の終了確認**に限る。未読の回線量、fetch内部buffer、物理ゼロ化、実機のcleanup成功は未確認。

## 3. 所有者・型付き受領物

名称は内部提案。型brandだけではなく、実session内の非公開台帳と参照一致で認識する。JSON／hash／ID／URL一致から登録するfactory、任意callbackにbodyを貸すgetter、fake namespaceとの互換castは設けない。

| 提案型 | 発行元・結合 | 消費・寿命 |
|---|---|---|
| TransportPurposePermit | 固定source＋sessionのprivate入口。実session/auth/source、用途、選択／payload／plan、phase世代、slotへ結合 | 1論理取得だけ。retryは同permit内の別attempt。close／phase失効で発行禁止 |
| HttpAttemptClaim | 同一budget ownerのdispatch transaction。用途permit、ordinal=1/2、Cとslot消費を固定 | fetch呼出し1回。同期throw／失敗でも戻さない |
| TransportCleanupEvidence | attempt内の固定cleanup section。fetch／reader／pending read／cancel／lockの観測、終了時刻、残予算 | 固定状態のみ。bodyや生例外を持たず、同attempt外へ付替え不可 |
| BoundedBodyReceipt | 成功応答のEOF／byte枠／JSON受理、cleanup確認、active/phase再検査を満たした実transportだけ | 同source／用途／attemptに一度だけ引渡す。private body参照を保持し、消費／破棄／失効で外す |
| BoundedReadOutcome | 404／枯渇／構文不正／下位不足など、body receiptが成立しなかった固定結果 | 未取得／不明と正常受領を区別。成功HTTPやrowsを捏造しない |

body receiptのJSON値はprivateに保持し、固定sourceが必要列へ射影する。JSON構文受理だけで選択行・版・scopeの正しさを認定しない。sourceはreceiptのclaimを先に消費してから射影し、失敗後の再利用を拒否する。HTTP header／Response／reader／認証参照をsourceやworkerへ返さない。

OAuth応答は同budgetで扱うが、token本文を一般body receiptとして外へ出さず、同sessionの認証処理だけが消費する。AuthReadyGenerationを要する取得と、まだ生成されていないOAuth用途を区別する。

## 4. 用途と発行前提

| 用途 | 必須前提・固定取得 | 費目／phase |
|---|---|---|
| oauth | 同snapshotの既存OAuth交換。caller指定endpoint不可、per-userはこの用途へfallbackしない | C/G/S、通常枠。release permitは不要 |
| parent_initial / release_rows | 同sourceのbootstrap経路。親の固定ID／必要列、releaseはbuild_nameだけ | C/G/S、通常枠。release判定前なのでmatched permitを要求しない |
| metadata_initial | 同親、matchedの実#permit、固定selection policy・max_records・lookahead | C/G/S、通常枠。選択成立前の限定bootstrap権限 |
| payload | 同実選択行の開始claim、同#permit、固定ID／所属条件 | C/G/S＋既存payload課金、通常枠 |
| table_initial | 実payload受領物に結ぶ検証済みworker計画／collection、同source/#permit、table受付 | C/G/S/EとT/R、通常枠 |
| parent_final / metadata_final | 同sourceのfinal開始claim、同選択policy／親、同#permit | C/G/S、自身のfinal slot、整合phase |
| table_final | 同tableの初回・必要job・実計画、同source/#permit | C/G/S/E、自身のtable slot、整合phase |

bootstrapは循環依存を避けるための限定用途で、prepared ownerの外部ready値から作れない。実source生成部が認証／親／release／選択の既存取得に組み込み、table用途へ転用しない。table GETは実worker planとの結合が完成するまで禁止する。

fixed descriptorのmethod/path/query/fields/limit/order/selection identityは用途permitから生成する。body receipt消費時にも一致を検査する。sys_db_objectを汎用get allowlistへ追加するだけの経路、callerのfinal boolean、任意table／fields引数は作らない。

## 5. 単一C/G/E/R/clock

### 5.1 modeと予算の所有

将来のevidence modeはsession作成時、認証交換より前に固定する。公開ツール引数に任意のmode／capを追加しない。legacy modeは従来の固定4予約を維持し、同session内で両方式を混在させない。evidence modeでも認証・親・release・選択・payload・table・retry・finalは同じcounter／単調時計を参照する。

新台帳をstats.requestsで初期化したり、過去G/payload/時刻を捨てて作り直したりしない。実装時は既存counterを唯一のbudget stateへ一体化するか、その同一所有物を借用する。C/Gのコピーを並行更新する方式は禁止。Eは最初のtable受信前から同stateに存在し、payloadと証拠JSONは別用途として課金する。

### 5.2 費目所有とdispatchの線形化点

| 量 | 課金／状態変更 |
|---|---|
| C | 固定requestを検査・構築し、buffer等のpreflightを終えた後、fetch直前に1回。認証／同期throw／失敗／retryも含む |
| G/S | 採用する各read完了chunkのbyteLengthを1回。超過chunkも加算し、保持前に拒否。Sだけ試行ごとにreset |
| E | table用途の同じchunkだけに1回。Gへ二重加算しない。retry／失敗／最終を含めrun累積 |
| payload | 同payload受領文字列に対し既存source境界で1回。後続schema不適合でも返金しない。IPC/hashでは再課金しない |
| R/T | session予約ownerだけが受付／slot消費／解放。sourceやworkerが数値を書き換えない |
| clock | session開始のperformance.now系単調時計と絶対deadlineのみ。wall-clockは報告用時刻で、予算を延長しない |

正常dispatchはC+1+R<=Q、finalはC<Qかつ自身のr_i>0を検査する。finalのC+=1/r_i-=1は原子的に行いC+Rを保つ。新tableはC+R+4<=QとT<8等を満たすときだけ、T／予約slot／初回logical readを一体更新する。受付失敗時に半端なslotを残さない。実値・式は親bounded設計に従う。

最終順序は親→metadata→table受付順。初回不足やE閉鎖のfinal skipはC/G/E=0で理由付き終端化し、未使用予約を一度だけ解放する。解放後に通常phaseへ戻らず、別slot流用／3回目／別sessionからの借用は禁止。

Cのcommitからfetch呼出しの間にawait／user callback／再入可能な可変request生成を置かない。停止がcommit前ならdispatchなし・C増加なし、fetchが同期throwすれば1試行使用済み。URL／header構築失敗はcommit前に分類する。

### 5.3 chunk・retry・保持

chunkの処理線形化点でowner/phase/attemptのactiveを検査し、採用したread完了だけをG/S/Eへchecked加算する。停止通知が先ならlate chunkを破棄してreceiptを発行しない。chunk処理が先なら加算済みを返金しない。observerやfinallyから再課金しない。同じchunk objectが別readで返った場合も、参照重複除去ではなく別のread受領として数える。

Gまたは通常S上限超過は全体停止。tableの下位S/Eだけの超過は局所不足として扱うが、同時にGも超えたら全体停止を優先する。既存primaryが先行すればその理由を保持する。Content-Lengthでは代用せず、未読の回線量は消費済みと見積もらない。

成功statusは用途cap内の固定サイズscratchへコピーし、chunk列を無制限に保持しない。失敗statusのbodyは課金するが保持しない。大きすぎるchunkは加算後・コピー前に止める。既にfetchから渡された単一巨大chunkのメモリ自体をcap内に制限したとは言わない。

empty chunkによる無制限制御loopを避けるため、**1試行あたりempty read合計16回まで**を未承認の候補値とする。非空readは最小1byteなので、S_cap内の受領／最終超過／EOFを合わせたread回数上界はS_cap+18以下。超過時は固定invalid_response（内部detailはempty_chunk_limit）でretryせず中断する。全read前後で時計も検査する。保持scratch／decode後JSONの実メモリ・work上界は独立検証が必要で、全体受付の証明にはしない。

retryは同logical read最大1回。C/G/Eは保持し、Sとattempt-local scratchだけをresetする。前試行のcleanupがconfirmedで、同permit／phase／slot／残時間が有効な場合だけ進む。cleanup不明を別attemptで救済しない。

## 6. clockとcleanup用の内側期限（提案）

D_hard=t0+session.deadlineMsを固定する。通常／整合のcutoffは既存比例reserve（60秒時は50秒／55秒）を使い、残りは既存の集約／worker終了処理に充てる。evidence I/O・retry・cleanup・受領物発行後checkpointを同じ期限に含める。

1試行のdispatch直前時刻をt、D_attempt=min(t+requestTimeoutMs,D_phase,D_hard)、L=D_attempt-tとする。新modeの候補policyは次のとおり。**採用・実装済みではない**。

- cleanup候補予約K=min(250ms,floor(L/4))。K<=0またはI/O残時間なしならCを消費せず開始しない。
- D_io=D_attempt-Kでfetch/readを中断し、cleanupはD_attemptまでの残時間だけ待つ。
- cancelを開始した時刻+250msを新しいdeadlineにしない。D_hard／D_phaseを越えてcleanup待ちを延長しない。
- retry backoffも同phase内で、次試行のKを確保できる場合だけ開始する。残時間がなければ未確認として終端化する。

この分割は最大10秒を延長せずI/O側を短くする保守的案。低減deadline／timeoutの端数やtimerの遅延はpost-awaitの単調時計で再検査する。APIの完了が期限後なら成功へ丸めない。cleanup待ちは既にabortしたI/O signalへ単純raceせず、同じsession時計から作る限定cleanup待機へ合流する。hard stop後でも最終D_hard内の後始末だけは観測し、証拠発行は再開しない。

同期JSON.parseや長いJS実行をtimerだけで物理的にpreemptできたとは扱わない。decode/parse前後の時計検査で期限後発行を禁止するが、厳密なwall-clock返却上限・保持/workの実証は別途必要。解消前に全体60秒の強制終了を検証済みとしない。

## 7. cleanup証拠の意味と手順

### 7.1 固定状態

| 状態 | 意味と発行可否 |
|---|---|
| not_started | fetch前の拒否等でtransport resourceを開始していない。正常bodyを発行しない |
| confirmed / eof | EOF、pending readなし、release前に取得したreader.closedがfulfilled、lock解放成功、期限内を観測 |
| confirmed / cancelled | 必要なcancelがfulfilled、全pending fetch/readがsettled、readerがあればclosed fulfilled＋lock解放成功、期限内を観測 |
| confirmed / no_response | fetch自体がrejectでsettledし、Response／readerが取得されていない。body成功の証拠にはしない |
| confirmed / no_body | fetchはsettled、Response.body=nullでreader／pending readなし。JSON受領の証拠ではなく、body必須用途ならinvalid_response |
| unconfirmed | cancel拒否／無応答、fetch未決着、read未決着、closed未確認、lock解放失敗、確認期限切れ等。正常body／sealなし |

confirmedはAPI観測範囲に限定する。abortSignal.aborted、done=trueだけ、cancelを呼んだだけ、lockを解放しただけ、Map削除、slot残0だけではconfirmedにしない。例外message／stackは保存せず、固定のcleanup reasonとprimitive観測結果だけを保持する。

### 7.2 単一のcleanup section

- fetch Promiseを登録した時点から、late responseを含めattemptに結ぶ。reader取得時にclosedとreject handlerを登録し、pending readは最大1つを追跡する。
- 正常EOFではclosed完了を確認してlockを解放する。EOF済みに不要な二重cancelを重ねない。closedのPromiseはrelease前に取得し、release後のreader表示を終了証拠へ流用しない。
- 未完了bodyの中断ではreader所有中はreader.cancelだけを一度要求する。readerなしのunlocked bodyだけにbody.cancelを一度要求する。既にlockedだが所有readerが不明ならunconfirmedで拒否し、別readerを取得して救済しない。
- 正常EOFやrun停止ではない404等の処理で、現在のfinallyのように一律にcontroller.abortしてからcancelを確認する順序にはしない。local cleanupはcancel／closed／lockの観測を先に開始し、完了または確認期限でcontrollerを終端化する。hard stop／D_ioでは即座にabortし、その後のcancel失敗を成功へ補正しない。
- 全pending readの決着を確認してからreleaseLockする。本policyは仕様がpending readをrejectさせ得ることより保守的であり、releaseLockを「強制完了」の代用品にしない。
- reader.cancel／closedの必要条件が満たせないstream errorはunconfirmedとし、実装都合で自動confirmedにしない。このため新modeでは一部の通信失敗が従来retryより保守的に停止し得る。
- resourceごとのcancel-once／release-onceをprivateに記録する。finally／timeout／late observer／closeの競合でも同じ操作を重複実行しない。

401／通常用途の403等はbodyを開かず、primaryを先に固定・owner失効してcleanupへ進む。例外は既存C方式の固定release_rows用途の403だけで、cleanup確認後にaccess_deniedの局所outcomeとしてsourceへ返し、運用者設定fallbackの既存条件を維持する。この例外をtable／payload／他URLへ流用しない。404等の局所結果もcleanup確認後に終端化する。429/5xxはbodyを数え、前試行cleanup確認前にretryしない。正常EOF後でもcleanup条件が欠ければBoundedBodyReceiptを発行しない。

### 7.3 late・未確認・終了

期限内に決着しないfetch/read/cancelはunconfirmedをstickyに保持する。late responseには一度だけcancelを要求するが、古い診断を成功へ書き換えず、新receipt／retry／別job配送を再開しない。late chunkは保持・再課金しない。Promise rejectionは必ず観測して秘密を出さずに捨てる。

cleanup不明はrun停止・正式発行不可とする。session.closeは同時実行枠／timer／token参照を一度だけ解放する所有者であり、source／receipt側でカウンタを重複操作しない。ただし**現行active枠の返却だけでは物理I/O終了を証明できない**。未確認resourceを抱えたprocessでの次run受付（隔離／quarantine／外側終了）のpolicyは承認待ちで、解消前に本番有効化しない。

## 8. 受領物の発行・消費順

dispatch済み→stream受領→EOF／上限検査→cleanup確認→UTF-8/JSON受理→単調時計・source/permit/用途/phase再検査→receipt登録→同固定sourceへ一度だけ消費、の順とする。cleanup確認前に解析済みであっても、暫定値は外へ出さず最後の発行条件を必須にする。

transportは未消費bodyを同時に最大1件だけ保持し、次のlogical GET前にconsume/discardを要求する。sourceの固定処理が直ちに必要列を射影し、raw body／scratch参照を外す。再入による二重consume、他source／slot／用途／phaseへの移植、clone、失効後の受理を拒否する。

正常body receiptは実tableの意味を保証しない。0件／曖昧／必要列不足はsourceのunavailable、別name／版／所属は親契約の固定分類へ渡す。成功のためにHTTP200・行・時刻を生成しない。OAuthの秘密応答や余分な列を一般receipt view／ログへ出さない。private JSONを外部mutable objectへ公開しない。

## 9. 失敗・互換・診断

| 事象 | 固定扱い |
|---|---|
| 用途／source／auth／slot／phase混入、二重consume | owner停止、内部evidence_binding_mismatch／invalid_state。claimを戻さない |
| 401／release_rows以外の403、G／総payload超過、取消、hard deadline | 先行の既存全体理由を保持して全発行失効。下位不足へ格下げしない |
| 固定release_rows用途だけの403 | cleanup確認後に既存C方式のfallbackへ渡す。releaseの未実測等の制限を保持し、他用途へ例外拡大しない |
| 下位S/E、table受付不足 | scope_evidence_limit等の内部理由。当該BR-006未評価、正常receiptなし。cleanup確認が前提 |
| 404／JSON不正／2試行枯渇 | 固定unavailable outcome。同phase新GET／別APIでの補完禁止 |
| cleanup不明でprimaryなし | 固定internal_review_error＋unconfirmedで停止。新公開codeをこっそり追加しない |
| primary後のcleanup不明 | primaryを維持し、別のcleanup dispositionを上位に保持。confirmed／成功へ変換しない |
| phase cutoff | 新通常取得／prepareを止め、同final予約へ一方向遷移。旧phaseのlate完了から新receiptを作らない |

旧modeのget(path,final)と新modeのpermit入口を同じsessionで混用しない。新modeでlegacy verifyを先に呼んで親／metadataを追加再読する方式は禁止。実sourceの同selection policy／max_records／lookahead／state/application/type/actionを維持する。合成版の固定100件・省略列を実経路へ転用しない。

## 10. 合成検証と独立oracle

| 区分 | 必須条件 |
|---|---|
| 発行 | active同sourceのみ、JSON return／fake票／clone／別realm・用途・slot・phaseから発行不可 |
| 認証bootstrap | per-userとOAuth、release判定前の親、release_rows限定403のC方式fallback、matched後のmetadata、tableには実plan必須。秘密応答を外へ出さない |
| 会計 | OAuth／失敗／retry／overshootを含むC/G/E、Sだけreset、slot専用消費／skip／解放。拒否時のT/R不変 |
| byte | 等号／1超過／同chunk G/E超過、1byte分割／巨大chunk／空chunk上限、content-length不一致、停止とchunkの順序競合 |
| cleanup | EOF、cancel fulfilled/rejected/pending、closed未決着、releaseLock失敗、未所有lock、pending read、late response、二重closeを区別 |
| 時間 | D_io/D_attempt/D_phase/D_hardの等号／前後、低減設定、cleanup予約不足、retry待ち、post-parse超過、停止後cleanup確認でも発行ゼロ |
| 消費／互換 | 一度だけのconsume/discard、未消費2件目拒否、legacy0.2/0.3・既存選択／予算の非変更 |

oracleは製品計数器を再利用せず、dispatch／accepted-read／cleanup操作／clockイベントから集計する。C=fetch呼出し開始数（同期throw含む）、G=線形化点で採用した全chunk合計、E=table用途の内数、R=未完了slot残数合計。各イベントでC+R<=Qを検査する。cleanupは呼出し数とPromise決着・lock解放・時刻を別々に観測し、要求しただけでconfirmedと期待しない。

## 11. 実装順・承認待ち

1. 用途／attempt／cleanup dispositionとreceipt内部型・状態遷移を、fake I/O＋clockで実装する。正式発行口は閉じたまま。
2. 単一budget ownerと実sessionのcounter／phase世代へのbinding、dispatch／chunkの原子的な会計をfake依存で検証する。合成台帳を再生成して流用しない。
3. bounded read／cancel／pending Promise／lock観測と絶対期限への合流を実装し、cleanup未確認を保持する。
4. 固定sourceの用途permit・同親／選択／payload受領物・実planへ順に接続する。tableはplan接続前に動かさない。
5. 実worker／上位結果／終了保証・承認済みcapを揃えた後に、別途有効化・読み取り専用実機検証を判断する。

承認待ち：既存提案の8table／16KiB／256KiB、新提案のcleanup予約最大250ms／Lの1/4とempty read16回、実Node/fetchでのAPI終了観測、保持／control work上界、同期parseの期限保証、未確認resourceと次run受付の扱い、source/bootstrapと最終verifyのprivate境界。公式仕様はこれらの値やpolicyを推奨したものではない。

今回の確認は現行ソース・設計・公式資料の読み取りと文書検証のみ。新規実装／テスト作成・実行／実機操作は行わない。
