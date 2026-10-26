# AU-BR-006 実transport：用途別body receipt・cleanup証拠・単一予算の接続詳細設計

Version: br006-transport-receipts-draft-0.8 / Date: 2026-10-26。
Status: **fixture分離を維持し、注入Responseのread／cleanupと未認証fixtureのOAuth bootstrap・固定診断を接続。実HTTP／本番sessionへの接続・cap承認・正式発行は未実装／閉鎖**。

**現行実装の境界は§15〜§17と[固定source設計§13](BEST_PRACTICE_ABORT_SCOPE_FIXED_SOURCE_ISSUER_DESIGN.md#13-固定sourceとweb-streams受領物の結合fixture限定)を優先する。** §13のfixtureから実session会計へ接続する経路は廃止した。以前の検証記録は当時の実行記録であり、安全な本番接続の証拠として使わない。
親：[実session／private受領物](BEST_PRACTICE_ABORT_SCOPE_REAL_SESSION_RECEIPTS_DESIGN.md)、[bounded予算](BEST_PRACTICE_ABORT_SCOPE_BOUNDED_BUDGET_DESIGN.md)、[固定source issuer](BEST_PRACTICE_ABORT_SCOPE_FIXED_SOURCE_ISSUER_DESIGN.md)。

## 1. 範囲と不変条件

実BoundedReadSessionの認証・受信・中断・cleanupに用途を結び、同じC/G/E/R/clockから一度だけ受領物を発行するための設計。既存prepared owner／draft／fake完了票は本番証拠に昇格させない。今回の実装範囲は§12のfake限定モデルだけで、実機操作・トークン発行・設定変更・cap投入・公開規則登録は行わない。VM／監視／telemetryは保留、Unknown・全体受付無効を維持する。

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

1試行のdispatch直前時刻をt、D_attempt=min(t+requestTimeoutMs,D_phase,D_hard)、L=D_attempt-tとする。新modeの候補policyは次のとおり。**本番での採用・実装は未実施。§16の開発専用経路だけで試験する**。

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

draft-0.1時点は読み取り・文書検証のみ。draft-0.2では次の限定実装と合成試験を追加した。

## 12. fake限定の内部型・状態遷移（実装済み範囲）

`src/review/abort-scope-evidence-transport-state.ts`を独立した開発専用namespaceとして追加。既存の`abort-scope-evidence*`梱包除外を維持し、実BoundedReadSessionやworkerからimportしない。

| 内部型／状態 | 限定実装 |
|---|---|
| FakePurposePermit | 同factoryのsource／phase／用途／target／final slotへ結合。issued → inflight → retryable／done。同論理用途の再生成を拒否し、retryは同permitの最大2attempt |
| FakeAttemptClaim | dispatch前に一度だけ消費。io → cleanup → settled。別factory・clone・二重poll・同I/O resource再利用を拒否 |
| FakeCleanupEvidence | confirmed／unconfirmedを別保持。eof／cancelled／no_response／no_bodyを区別し、要求だけで確認済みにしない。先行primaryとcleanup不明を別保持 |
| FakeBodyReceipt | EOF・JSON受理・cleanup確認・終了後clock再検査後だけ生成。同permitへ一度だけconsume／discard。未消費最大1件、停止時はprivate参照を外す |

handleは凍結した空objectと非公開WeakMapで認識する。fixtureのraw JSONや秘密、Response／readerを返さず、body消費はbyte数と`synthetic: true`／`evidence_issuance: disabled`だけ返す。OAuthはauth_onlyで一般body receiptを作らない。`issueEvidence()`は常に拒否する。参照解除は物理ゼロ化を保証しない。

clockは注入した同期値を観測し、逆行・非有限値・throw・絶対期限到達を停止として保持する。D_attemptとD_io、cleanup予約最大250ms／残時間1/4、normal／final cutoffをfakeモデルで検証するが、実timerによる強制中断の証拠ではない。fake cancelの決着・pending read・closed・lock解放は別観測で、cancel要求だけ／EOFだけではconfirmedにしない。最後のabortで失敗・期限超過した場合も未確認とする。不正な返却resourceは通信開始throwによるno_responseと区別し、未確認で停止する。

### 第1段階単体の未接続・未保証（第2段階との差分は§13）

- auth_ready／parent_ready／release_match／selection_ready／plan_readyは**呼出側のfixture値**であり、実認証・ReleasePermit・選択受領物・worker planの証拠ではない。
- slot最大10・permit最大210はfake構造上限だけ。dispatch数はfakeイベント数で、実C/G/E/R課金・slot動的予約・final順序・同session予算の証明ではない。
- bodyTextはfake文字列。通常4MiB／table16KiBの防御的parse上限はあるが、chunk課金、payload専用枠、空chunk、実UTF-8 stream、overshoot会計は未接続。既存合成stream会計とは別namespaceであり、統合済みとしない。
- pollはfakeの観測値を検査するだけ。実Promiseの決着・reader所有・socket終了・待受解放は未確認。実transport／worker・source意味検査・上位結果への接続、公開失敗理由への写像は別工程。
- 旧0.2／0.3、既存規則・認証・取得上限は変更しない。Unknown・全体受付無効・正式発行口閉鎖、VM／監視／telemetry保留を維持する。

検証：[fake transport状態遷移の記録](E2E_BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_STATE_SYNTHETIC_2026-10-26.md)。fake factsや診断件数を正式発行証拠へ昇格させない。

## 13. 実session binding・単一会計のfake接続（旧接続・廃止）

`createSessionBoundFakeTransport`は、登録済み実`BoundedReadSession`とprepared ownerを引数に取り、lifecycle内の同session／AuthSnapshotIdentity／ready世代／fake source・permit結合を検査する。同session側のtransport claimを先に一度だけ消費し、再生成や失敗後の再準備を拒否する。実source／ReleasePermitの証明へは昇格させない。

sessionはprivate closureで会計portを生成する。**既存requests／receivedBytes／payloadBytesを直接使い、statsのコピーを新台帳へ移さない。** baselineの認証／親取得も同じ累計に残る。portは認証情報・URL・snapshotを返さない。claim後は従来getを拒否し、busy中のclaimも拒否する。MCP／実sourceから呼ぶ入口は追加しない。

sessionの固定abort signalを同じ状態機械へ結び、取消／close／hard期限の通知で同期失効する。未消費fake本文参照を外し、signal listenerは停止時に解除する。これは物理ゼロ化や実I/O終了の証拠ではない。

| 費目 | 今回の接続 |
|---|---|
| C | fake dispatch直前に1加算。同期throwも戻さず、同permitの最大2attempt。通常はC+1+R<=Q、全体Q<=210と低減設定を維持 |
| R | 初期の親／metadata各2、table初回受付時に最終2を追加し初回2も含む空きを確認。最大8table。final順序は親→metadata→受付順table。最終試行開始で1消費し、retry不要なら残枠を解放 |
| G／S | 同attemptの連番chunkを1回だけ線形化し、全受信・応答内受信へ加算後に超過を検査。等号は許可、overshootは戻さない。次dispatch時にGが満杯なら停止 |
| payload | 応答chunkはG/Sだけに課金し、payload累計へは加算しない。成功したpayload試行の後に一度だけ、source境界でデコード済みpayload文字列を既存payload累計へ加算する（従来chargePayloadと同じ計測・単体2MiB／累計8MiB・低減設定）。次のdispatchで課金窓を閉じる |
| E | table用途をGの内数として加算。単体16KiB／累計256KiBはfake検証用の未承認候補値。E満杯後の新table dispatchを拒否 |
| clock | portはsession開始からの単調経過と元のhard期限・request timeoutを使う。fake timersで実sessionの時計を進める。claim時に60秒を再設定しない |

chunkは`chunk(attempt, sequence, Uint8Array)`としてfakeから供給する。0始まり連番、同current attempt、I/O cutoff前だけ採用。停止・clone・重複・順序飛びでは再課金しない。空chunkは連続16回までの候補制限。bytesは保持せずincremental SHA-256へ反映し、fake bodyTextのbyte数・digest一致をJSON構文受理前に確認する。同じ長さの別本文も受理しない。消費・parse・診断でC/G/Eを再加算しない。

通常C枠不足／table受付不足は新dispatchを行わず、permitは再利用不可にしてfinal予約を残す。S/G・payload累計の全体失敗はsession側停止へ伝播。table下位枠の不足は当該attemptをcleanupへ進め、未確認なら全体停止する。payload単体超過はsource境界の課金時に従来どおり局所の`payload_limit`、累計超過は`payload_budget_exceeded`で全体停止する。cleanup後の局所outcomeは現状scope_evidence_limitへ保守的に集約し、payload専用の上位分類は未接続。

### 維持する閉鎖と次工程

- adapterはfake依存だけ。selection_ready／plan_ready等はfake前提であり、実選択receipt／worker planではない。実sessionでauth-readyでも実table GETは実装しない。
- portの認証modeはsessionから取得する。OAuthはこのadapterの生成前に既存sessionで完了している前提で、未認証OAuth bootstrapのfake接続は次工程。既存OAuth費用をリセットしない。
- 実read／Promiseとchunk発生源の証明、pending／cancel／reader.closed／lockの実観測は未接続。hash一致だけを実取得証拠にしない。
- 局所失敗tableのfinal skipとR解放は§14のfake接続まで実装。実phase世代・動的cap承認、実sourceの固定plan／意味検査、worker／上位結果への接続は残課題。
- 正式発行APIは常に拒否。公開0.2／0.3・規則登録・既存通常GETの未claim時挙動は維持する。VM／監視／telemetryは保留、Unknown・全体受付無効。

検証：[単一会計・session bindingの合成記録](E2E_BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_BUDGET_SYNTHETIC_2026-10-26.md)。

## 14. 局所失敗tableのfinal skipと予約解放

会計portのsettleをbooleanから`PreparedAttemptSettlement`へ変更し、retry可否・固定outcome・cleanup confirmed/unconfirmedを別々に渡す。table初回の状態はpending → retryable／available／unavailableとし、normal phase終了時のpending／retryableはnot_completedにする。availableは**transportの本文受領だけ**であり、tableの意味・scopeの整合確認済みを表さない。

`skipFinal(slot, {source, phase, target})`は同factoryのtable slot・source・final phase・targetを照合してから同session会計ownerへ委譲する。理由を呼出側から受け取らず、ownerが保持する状態から次の固定値を導出する。

| 理由 | 条件・保持する初回outcome |
|---|---|
| initial_unavailable | confirmed cleanup後の初回結果が本文受領でなかった。404・構文不正・下位枠不足・retry枯渇等の固定outcomeを保持 |
| initial_not_completed | cleanup確認済みのretry待ちをnormal phase終了で打ち切った場合等。既に受信／試行した費用は保持 |
| evidence_budget_exhausted | E累計枠が閉鎖済み。初回availableでも最終table読取を開始せず、不明のまま終了させる |

E閉鎖理由を優先し、初回outcomeは別列`initial_outcome`として保持する。親・metadataはskip不可。final cursorにあるtableだけが対象で、未知table／未受付slot・順序違反・同slotの二重消費・通常phase・active I/O・未消費body・停止済みsessionを拒否する。cleanup未確認はowner停止のままで、skipへ格下げしない。

成功時は残っているslot枠だけをRから引き、slotを終端化してcursorを一つ進める。通常は2、最終初回試行後にEが閉じretry待ちを打ち切る場合は1だけ解放する。C/G/E/payloadは一切返さず、skip中のdispatch・chunk課金はゼロ。発行済みのfinal permitもdoneにし、skip済みslotでの新規permit・retryを拒否する。後続tableの受付順は変えない。

結果は`state: skipped`・固定reason・initial_outcome・released_attemptsと、`synthetic: true`／`evidence_issuance: disabled`だけの凍結診断票。本文・秘密・正式証拠・成功completionは発行しない。最終固定sourceからの自動skip、sourceの意味検査で初回をunavailableへ落とす経路、実worker／公開JSONへの写像は未接続である。

検証：[final skip／予約解放の合成記録](E2E_BEST_PRACTICE_ABORT_SCOPE_FINAL_SKIP_SYNTHETIC_2026-10-26.md)。

## 15. fixtureと実sessionの権限分離

旧経路は、梱包対象のlifecycleにfixture登録口が残り、fixtureのfacts／permitから生成したownerで実sessionのtransport factoryを呼べた。wrapperの梱包除外だけではこのraw exportを防げなかった。同processで実session参照を持つコードからの経路であり、外部MCP入力からの到達やリモート悪用を実証したものではない。

現行は登録・source・owner・draft・claimのWeakMapを`abort-scope-evidence-fixture-lifecycle.ts`へ移動し、既存prefixでnpm梱包から除外する。実sessionのlifecycleは別WeakMapで登録・auth-ready・失効だけを扱い、fixture登録・owner生成・transport claimのexportを持たない。実`BoundedReadSession`からtransport factory・transportOwned・fixture専用会計処理を撤去した。fixture ownerを渡すだけで実sessionのmode・counter・stop権限を得る入口はない。

- `FixtureAccountingSession`は合成baselineイベントから始まる独立した台帳で、実sessionのstatsをコピーしない。C/G/E/payload/R・retry・final skip・期限・取消の実験はこのfixtureだけで行う。本番の単一budget owner接続は**未実装へ戻す**。
- `FixtureReadSession`はテストで実GETのfake依存結果を観測するラッパー。ラッパー自身をfixture台帳へ登録し、内包する実sessionは登録しない。fixture失敗は実sessionのclaimやfailureを書き換えない。auth／cancel／deadline／payload累計失敗は観測用fixtureへ伝え、最初の失効理由を保持する。
- fixture登録は生の`BoundedReadSession`を拒否する。fixture owner・clone・別sessionの混入で実sessionのGET・payload課金・phase操作を止めたり会計を変更したりしない。
- 本番側に残るtransport契約の型宣言はfactoryや権限を持たない。fixtureと実用issuerの型cast・mode flag・環境変数による昇格口は設けない。
- npm梱包後もfixture exportが無いこと、実sessionにtransport factoryが無いこと、通常のGET／payload課金／phase操作が動くことを合成依存で確認する。

今後の本番接続には、実source／ReleasePermit／選択・payload／worker planから生成する専用issuerと非共有claim台帳が必要。現在はその生成口を作らず、正式な証拠発行口・全体受付は閉鎖／無効を維持する。VM／監視／telemetryは保留、実機操作・設定変更・有効化は行わない。

## 16. 注入Responseの実Web Streams API接続（開発専用）

`createFixtureWebStreamTransport`はfixture ownerだけを受け付け、固定用途descriptorとAbortSignalからResponseを返す注入関数を使う。global fetch・URL・認証header・実session登録は追加しない。実際のResponse／ReadableStreamDefaultReaderを操作するが、HTTP通信や実sourceの由来を検証したものではない。モジュールは既存の`abort-scope-evidence*`梱包除外を維持する。

1. 同じstate machineがCを消費し、同期的にsourceを一度呼ぶ。io/attemptの絶対期限と同じ単調時計を第2内部引数で渡し、呼出側のdeadline申告は受け付けない。
2. statusとbody参照をそれぞれ受領時に一度だけ捕捉し、後続のread／cancelでgetterを再評価しない。成功／429／5xxはreaderを一つだけ取得し、release前のclosed Promiseへ即座に両決着handlerを付ける。pending readは最大1件。401/403/404等は本文をreadせず捕捉したunlocked bodyをcancelする。
3. read完了chunkを同attempt連番で一度だけ課金する。超過分も保持し、採用された成功bodyだけ通常4MiB／table16KiBとownerの低減responseBytesの小さい方を上限とするscratchへコピーする。容量は同ownerが固定した内部試行情報から受け取り、caller指定capへ置換しない。失敗statusのbodyは課金するが保持しない。Content-Lengthは代用しない。
4. EOF後にfatal UTF-8 decodeし、state machineがcleanup／JSON／同byte数・digest／時刻を再検査してfake receiptを作る。decode失敗でもcleanupを先に確認する。返すのはopaque handleだけで本文は表示しない。
5. 取消／全体失敗／D_io到達ではcontrollerを即abortする。局所的な下位枠不足や不正応答では先にcancel／closed／releaseを観測してからcontrollerを終端化し、不要なabortでcancelを失敗させない。reader所有中はreader.cancel、未取得なら捕捉したbody.cancelを一度だけ要求する。cancel fulfilled・pending read settled・closed fulfilled・release成功が揃わなければconfirmedにしない。待機timerは元のD_attemptを使い、新しい時間枠を作らない。
6. revocation後はclock-onlyのobservationNowでcleanup時刻だけを観測できる。dispatch／chunk／consumeのactive検査は緩めず、取消後にbodyを発行しない。hard期限／attempt期限を越える終了は未確認とする。
7. 未確認はsticky。late Responseのbodyを一度だけbest-effort cancelしても既存cleanup票を更新しない。終了後のlock解放は所有readerかつpending read決着後だけのbest effortであり、解放だけで成功証明にしない。例外message／stackを返さず、background pumpの拒否も観測して停止する。

空readは非空readを挟んでも**1試行合計16回まで**とし、17回目は局所invalid_responseとしてcancel／cleanupへ進み、retryしない。従来の連続回数resetは廃止した。scratch／text参照はrun終端で外し、timerは一度だけ解除する。物理ゼロ化やfetch内部bufferの上限証明ではない。

同じadapterで同時runを行わず、未消費bodyの次取得も既存state machineが拒否する。retryは同permitで明示的に行い、前回cleanup confirmedが必須。payloadはHTTP JSON bytesのG/Sとは別に、従来どおりsource境界のdecoded payload文字列を一度課金する。actual source／schemaとの結合は未接続のため、fixtureの文字列申告を本番のpayload証拠としない。

検証：[実Web Streams接続の合成記録](E2E_BEST_PRACTICE_ABORT_SCOPE_WEB_STREAM_SYNTHETIC_2026-10-26.md)。実HTTP／最低対応Node 22.12／実worker／本番issuer・終了隔離policy／保持work全体上界は未確認であり、全体受付を有効化しない。

## 17. 未認証fixtureのOAuth bootstrapと固定失敗分類

`FixtureAccountingSession`の明示的な`oauthBootstrap:true`は認証未完了・C/G=0から始まるservice-account専用fixture。従来のper-user baselineと混在させない。`claimFixtureBootstrapTransport`はfixture台帳の同session参照・active・未ready・未owner・未claimを要求し、prepared ownerとは別の未認証入口から**同じ一度限りのtransport claim**を消費する。providerがないper-user、既にready、実BoundedReadSession、clone／再生成／生成失敗後の再使用を拒否する。実台帳への登録やtype castによる昇格はない。

`createFixtureOAuthBootstrap`はPOST `/oauth_token.do`・client_credentials・ordinalの凍結合成descriptorだけを注入Response供給関数へ渡す。credential／フォーム本文／endpoint引数・global fetchは持たない。実OAuth交換やcredentialの検査を実装したという意味ではない。低水準fixture adapterでは同machineを維持して後続の合成GETへ進め、C/G/R／開始時計を作り直さない。固定source compositionへownerとtransportを安全に移譲する入口は**未接続**。認証後に二つ目のtransport factoryを作って予算をリセットする方式は禁止する。

OAuth JSONはEOF／受信枠／digest／cleanup確認後に、固定の純粋policyで検査する。access_tokenは非空・空白のみ不可・CR/LFなし・最大8,192文字、expires_inは有限の正数、寿命msが同runの全deadline_msより厳密に長いことを要求する。token_type省略は既存bounded経路と互換にし、指定時はstringのBearerを大小文字非区別で比較する。errorを持つ成功応答は拒否する。scope／ユーザー本人性／Table API権限を認定せず、R-2の認可code／PKCE／scope契約を変更しない。これらはfixtureの保守的policyで、本番policy承認ではない。

token／refresh_token／error_description／余分な列は一般body receipt・戻り値・診断へ出さず、fixtureではtokenを保存・header利用しない。cleanup・終端clock確認済みのauth_only settlement後だけ、同予算portが同sessionのfixture AuthReadyGenerationを一度生成する。primaryが立った時点やcontroller終了中の再入closeではauth_onlyをstoppedへ落とし、readyへ進めない。token本文の参照を外すが、物理ゼロ化は保証しない。

| 原因 | 固定結果と扱い |
|---|---|
| OAuthの400／401／403／404など非retry status | authentication_failed／oauth_http_error。token本文をreadせずcleanupし、per-userや別endpointへfallbackしない |
| JSON／UTF-8／body必須／token必須項目不正 | authentication_failed／oauth_response_invalid。一般body receiptなし |
| token寿命がrun枠以下 | authentication_failed／oauth_lifetime_insufficient。短縮deadlineでも等号を拒否 |
| 429／5xx／fetch reject等でcleanup confirmed | 同permit内で最大2試行。費用を保持し、枯渇はupstream_unavailableとして固定。認証応答拒否と混同しない |
| 試行枠不足／通常phase残不足／hard期限／G・S超過／取消 | 元のbounded codeを保持し、authentication_failedへ丸めない。開始前拒否ならC/Gを増やさない |
| cleanup未確認、先行primaryなし | internal_review_error／cleanup_unconfirmed、全停止・readyなし |
| primary後のcleanup未確認／close | primary／primary_detailを保持し、cleanup_unconfirmedを別軸でstickyに保持 |
| 非OAuthの401／通常403／release_rows限定403 | 既存分類を維持。OAuthの403例外や認証済みへの昇格に流用しない |

machineの`diagnostics()`は固定primary／primary_detail、最後の失敗試行snapshot、cleanup不明、fixture auth_readyだけを返す。last_failureのretryableは**そのsettlement時点の記録**であり、現時点の再試行permitではない。成功後も以前の上流障害を保持できるが、beginは同用途票／phase／期限／最大試行／cleanupを改めて検査する。OAuth枯渇や開始拒否の終端化も、実際に観測した同permitの状態からだけ導き、caller申告の失敗codeを採用しない。closeで先行上流障害を上書きしない。

残課題は、認証後の固定sourceへのone-shot移譲、実source／選択payload／worker・ReleasePermitへの結合、実credential／tokenのprivate管理、実HTTP／本番専用claimとscope／権限検証。本module群は非同梱prefixを維持し、正式証拠発行口・全体受付は閉鎖／無効。VM／監視／telemetry保留を維持する。

検証：[OAuth bootstrap・失敗分類の合成記録](E2E_BEST_PRACTICE_ABORT_SCOPE_OAUTH_BOOTSTRAP_SYNTHETIC_2026-10-26.md)。

次段の[OAuth後の同transport→固定source移譲詳細設計draft-0.1](BEST_PRACTICE_ABORT_SCOPE_OAUTH_SOURCE_HANDOFF_DESIGN.md)で、単一run owner・固定dispatcher・session側handoff claim・認証世代とdestinationに結ぶlease移動を具体化した。設計のみで移譲口は未実装。counter／時計／transportを再生成せず、古いbootstrap facadeとroot取消の権限を分離する。
