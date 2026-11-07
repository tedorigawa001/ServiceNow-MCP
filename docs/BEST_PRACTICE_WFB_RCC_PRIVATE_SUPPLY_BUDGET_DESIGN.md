# WF-B RC-C：同root／同planのprivate供給・所有とbridge費／破棄予約

Version: draft-0.1 / Date: 2026-11-07 / 照合基準HEAD: `692d9ae`。

Status: **詳細設計のみ。新しい型・生成口・profile・予約台帳・parser/core接続は未実装。** 親は[RP-C差分設計](BEST_PRACTICE_WFB_RPC_PRIVATE_VALUE_BRIDGE_DESIGN.md)、[raw parser契約](BEST_PRACTICE_WFB_BOUNDED_RAW_JSON_PARSER_DESIGN.md)。RC-Aの詳細結果とRC-Bの純粋受付を、同じ構文解析の生存区間へ接続するための契約を具体化する。費目の数値unitとreadyなbridge profileはUnknown／未導出のまま。旧v1・正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持する。実装・実接続・実通信・実機操作・証拠発行・本文保存・設定変更・Pushは行わない。

## 1 現行との差分と固定する入口

| 照合した現行点 | 接続で必要な差分 |
|---|---|
| `raw-json-boundary.ts`の`runBoundary`が19 fieldをstrict検査・copy／freezeし、meterを作る | この元planと元meterを同invocationのprivate ownerへ保持。callerのlimitsをもう一度読む口を作らない |
| `SyntaxParser.run`がroot確認・`frame()`の直後にfinallyでroot／stackを外す | frame成功後・同finally前に固定継続を置く。構文／frame失敗から継続しない |
| parserはnode開始時に`nodeReservations`と`nodeCleanup`を前払いする | 同じASTをbridgeで再走査して退役費を再計上しない。新しいcontext／候補aliasの退役は別費目 |
| RC-Bのpublic純粋入口はplanのstrict pinとwork配賦和を再計算する | private経路での再pin／再配賦確認を省くなら、その内部共通化と既存wrapper互換を明示検証する。元の4算術試行を接続先で自動加算しない |
| coreは固定7項目ValueLimitsを厳密検査してからmeterを保持する | core API・既存課金順は維持。7項目の固定bootstrap処理など既存work外の追加費目をbridge profileで所有する |
| coreの成功wrapperはfreeze済み値とworkを持つ | wrapperからの候補採用・post・一度move・全alias破棄をprivate ownerで管理する |

将来の合成専用入口は`parseCheckpointBytes(bytes, limits)`の2引数だけとする。公開済み`inspectCheckpointBoundary`／`inspectCheckpointSyntax`は残し、旧modeでは新bridgeの生成・費用・core呼出しを一切始めない。選択modeは内部の固定入口で決め、callerからmode・root・V・plan receipt・meter・core関数・fault callbackを受けない。

実装配置案は、既存byte／parser ownerの同module内にprivateな固定継続を置き、coreと算術kernelを固定importする方式とする。bridge専用の内部pure helperを抽出しても、trusted root／planの発行口や任意consumerをexportしない。tests配下の別assemblyとruntimeの台帳・brandは共有せず、runtime export／package入口は追加しない。

## 2 同生成元のprivate入力とbinding

以下の名前は内部契約上の仮名であり、公開型・実装済みAPIではない。

| 内部slot | 生成元・結合 | 許可しない代替 |
|---|---|---|
| `InvocationOwner` | 1回の入口で新規生成する非公開identity。plan・meter・byte owner・parser ownerを同時に結ぶ | 公開digest、連番、件数一致で別ownerを採用 |
| `PinnedPlan` | 入口で元limitsを一度strict検査して得た同じfreeze済みobject。19項目・固定順を維持 | 元caller objectの再読、後着limits、残量からの再生成 |
| `FramedRootBorrow` | 同parserが構築したroot参照・同countsの完了V・同plan／meter／ownerを一つのprivate slotに結ぶ | JSON.parse、別inspect結果、公開summaryのV、再parse結果からの作成 |
| `SourceLength` | 元byte ownerのN（元viewの可視byte長、末尾LF込み）と同じowned copyへのbinding | backing全長Aやparserカーソル・EOF probe回数からのN再計算 |
| `CoreCallClaim` | 同ownerにだけ属する未使用／消費済みの利用状態 | 値が同じ別claim、失敗後の返却・再発行 |
| `CandidateSlot`／`ReturnPending` | 同claimのcore戻り値だけを一度採用。post前と外側finally前は非公開 | legacy結果・手作りsummary・別呼出しの正常copyの昇格 |
| `DiagnosticSlot` | owner生成時に固定項目を確保。first reason、呼出し状態、計数の観測可否、後処理診断を分離 | AST・本文・raw例外・key／offset・mutable meterの格納 |

bindingはprivate参照の組で検査し、structural equalityだけで認めない。型のreadonly／nominal markerだけをruntimeの生成元証拠にせず、ownerが保持する同じ参照と状態を照合する。private root借用は同期区間だけで、await・ユーザーcallback・非同期queue・外部observerを挟まない。外部へroot getter、取出し可能なborrow、adopt用friend、任意継続の登録口を設けない。

Vは構文・framing成功時の完了`valueNodes`だけを使う。失敗prefixの開始予約数をcore受付のVに使わない。rootがobject、parser stackが空、frameが単一LF／EOFまで成功していることを固定条件にする。未完了value予約が残らないことは独立試験で確認し、件数の名前だけから成功を推測しない。

現行`frame()`はEOF probeでもカーソルを進めるため、終了後のpositionは入力長の証拠にならない。Nはbyte ownerが既に確定した値を一度引き継ぎ、postの`N ≤ upper.encoded`にも同じ値を使用する。owned bytesの再decode・再hash・再copyは追加しない。

## 3 生成順・所有権・状態遷移

状態案は`Prepared → Parsing → Framed → AdmissionChecked → TailReserved → CoreClaimed → CoreReturned → PostAccepted → ReturnPending → Returned`。どの未返却状態からも`Rejected → Retired`へだけ停止し、再開しない。

1. 元planのstrict検査と元meterを確立する。新profileのmodelとready状態を固定内部定数で確認し、context／診断slotの準備・早期unwindに必要な費用を先行確保してから新しいslotを生成する。bootstrap前の失敗は既存固定理由を保持し、profile不明を0費用として通さない。
2. 既存の一度copy・UTF-8・構文・framingを元meterで継続する。失敗ならcoreを呼ばず、元AST／bytesの元finallyを実行する。
3. 同parserの生存rootを固定継続へ同期借用し、元owner／plan／meter／完了V／Nの組を確認する。受付に必要なbridge処理費を先行確保してから、RC-Bと同じ2V・3V+10の判定を行う。ここでの不足・overflowはcore未呼出しで停止する。
4. 受付成功後もまだcoreを呼ばない。core bootstrapとpre、core戻り値の処理、post、全候補aliasのunwind、診断・結果確定を覆う残りのtail予約を同meterで確立する。予約失敗ならclaimを消費せず終端拒否し、contextは再利用不可とする。
5. 同owner／model／予約成立をpreで確認し、`CoreCallClaim`を未使用から消費済みへ同期に変えてから固定detailed coreを一度だけ呼ぶ。同期throwも呼出し1回で、claimは返さない。
6. core拒否は5理由の1対1写像と観測計数を診断へ保持し、成功用postを実行せず固定unwindへ進む。成功wrapperだけを同claimの非公開候補slotへ採用し、§7のpostを行う。
7. post成功後、同じnormalized treeを`ReturnPending`へ一度moveする。parserのfinallyでroot／stack、外側byte finallyでowned参照を一度外してから返却用DATAを確定する。finally前の値をcallerへ公開しない。
8. freeze・診断snapshot・checked合計など失敗し得る返却準備は公開前に終える。返却確定を線形化点とし、それ以降に業務post・課金・外部通知・新allocationを予定しない。途中失敗ならReturnPendingも固定破棄する。

claim未消費の拒否でもcontextは終端化し、再準備しない。消費済みの拒否では再core呼出し・別schema／旧v1 fallback・cap引上げはしない。新しい独立pure invocationを呼ぶ行為まで禁止するruntime admission台帳ではない。

| 対象 | 所有者・終了条件 |
|---|---|
| caller view／backing | callerのまま。破壊・detach・zero化せず、既存copy後の検査以降は再読しない |
| owned bytes | 元byte owner。成功／失敗とも同じ外側finallyが一度retire。bridgeはNとidentityだけ借用する |
| AST／stack／parser scratch | 元parser。借用終了後も同じfinallyがroot／stackを外す。bridgeで別treeへcloneしたり二重退役しない |
| coreの途中copy／索引 | coreの局所責務。拒否で部分値を返さない。既存抽象copy費と、実heapのUnknownを区別する |
| detailed成功wrapper／candidate／ReturnPending | 同treeを指すalias群。所有者slotを一度moveし、失敗時はwrapper・local・slotを含む全aliasを外す。診断slotへ値参照を保存しない |
| 最終normalized copy | 全guardとfinally後にcallerが非実行DATAとして受領する。capture／Store／permit権限にはならない |

ここでの破棄は境界から参照を持ち出さず責務を終えることであり、即時GC・ゼロ化・RSS返却・OS cleanupの証明ではない。

## 4 同planの再利用とRC-B共通化境界

設計上の採用案は、RC-Bの公開純粋wrapperをそのままbridgeから再呼出しするのではなく、**算術・projectionの値kernelを最小共有**する方式とする。wrapperのstrict入力・理由・4算術試行・freeze済み結果・modelは維持し、新経路は元のprivate planから必要な固定値だけを供給する。

- 元parserが既に計上した19項目bootstrapの抽象plan64とwork配賦和1を、新経路で再実施／二重計上しない。元planをtrusted扱いできるのは同private ownerの継続だけ。公開された同値のRC-B成功DATAから継続を作れない。
- 値kernelは2V、3倍、+10のchecked算術と固定7項目projectionを共有する。pure算術helperの返値自体は証拠でなく、root供給／claim／model検査はbridge ownerだけが所有する。helperに公開のtrusted-plan発行機能を足さない。
- 新経路の算術試行は、既存の配賦和1とbridge側の残り3を費目所有表で区別する。旧RC-Bの4という診断値を、そのまま元parserのworkに上乗せしない。失敗prefixでは実施した処理だけを記録する。
- ValueLimitsは固定順の元6項目と`max_work=plan.max_value_work`。coreが行う7項目の再検査は既存API互換のため残し、その固定bootstrapの追加費用をbridge側の専用費目で先行所有する。core初期8 unitや5内訳を変更せず、同じ操作を両予算へ重複課金しない。
- pure wrapperとprivate経路が共通の値kernelを使うこと、19項目／7項目の値・順序・理由が維持されることを独立試験で確認するまで、この抽出は実装済みとしない。特にraw/coreのつなぎ込みを単なる既存public関数の直列実行で代替しない。

## 5 費目所有とprofileの必須coverage

下表のunit係数はすべて未導出。有限な処理範囲を固定するための費目表であり、空欄を0／1などの仮値で埋めてprofileをreadyにしない。

| 費目ID | 対象と有限範囲 | 所有・重複禁止 |
|---|---|---|
| P-existing | plan64、配賦和、input・copy・UTF-8・syntax・frame・stack | 元parserの同meter／既存model。元prefixをreset／再parseしない |
| P-byte-retire | 既存copy前のcleanup予約1 | 元byte finally。bridgeで同じowned bytesを再課金しない |
| P-node-retire | 既存node開始ごとのnodeCleanup予約 | 元parser。Vを使った追加のAST退役走査・予約を重ねない |
| B-seed | private owner、固定診断／claim／候補slot、初期model確認、早期終端 | parser側の新bridge内訳。可変本文を保持する診断や動的slot一覧は作らない |
| B-bind | 同owner／plan／meter／root／V／Nと状態の固定比較 | 元生成元だけを確認。digest計算・全tree identity走査なし |
| B-admit | 2V・3倍・+10のchecked算術、V／各cap、同model検査 | RC-Bと共通値kernel。算術の試行数だけで周辺処理全体を計上済みにしない |
| B-project | 固定7項目の読取・projection・freeze、受付wrapperの必要処理 | 元planから一度生成。caller limitsの再検査・二重cloneなし |
| B-core-bootstrap | core内の固定7項目limits読取／厳密検査・copy／freeze、追加accounting owner／wrapper処理 | 現行core work外の分だけをbridgeで所有。初期structural8・既存copy等は含めない |
| B-pre-claim | 予約確認、固定pre、claim遷移・固定core呼出し境界 | 消費は一度。同期throw／拒否も使ったclaimを戻さない |
| V-core | structural／relation／arithmetic／number_formatting／copies | 既存coreの`max_value_work`枠。bridgeやparserの余りを借りない |
| B-diagnostics | core呼出し状態・first reason、5内訳＋total・観測可否・二次診断 | 固定metadataのみ。snapshot不能を0へ補完せず、例外／本文は持たない |
| B-post | 成功wrapper/model・同claim、6計数の型／checked和／cap、Nとencoded、固定形状項目 | 全tree再walk／再validate／JSON.stringifyはしない。失敗結果に成功postを適用しない |
| B-move-return | 候補の一度move、最終固定metadata／結果wrapper・freeze・checked合流 | 同treeを再cloneしない。finalizeは公開前に完了 |
| B-unwind | borrow、受付projection、detailed wrapper、候補・ReturnPending、ownerの固定alias slotを外す | P-byte／P-nodeと別。全treeの物理解放／GC費とはしない |
| B-reserve-control | 上界算術、予約の一度取得／利用／退役・診断 | 予約操作自体も固定profileへ含める。課金primitiveの内部へ無限の自己課金を再帰させない |

core成功・拒否のwrapper処理やValueLimits bootstrapは、現行RC-A/RC-Bで実CPU費を証明していない部分である。bridge側へ費目を割り当てることと、native反射・allocationの実時間／実heapに上界があることは別である。profileは新しい抽象modelとして導出し、旧RP-A100／RP-B110／312・core74などの対照に処理を無料で押し込まない。

新bridge model案`wfb-raw-value-rpc-1`と費用profile版・coverageを固定importで結ぶ。19項目planへ自由なmodel欄を追加せず、callerが任意profile／係数／単位を渡して検査器を選べない。readyの条件は、全B費目の係数・有限slot数・全終端経路のcoverageが導出され、独立検証を通ること。未導出の項目が一つでもあればprofileはUnknownであり、core呼出しを許可しない。

## 6 予約式・一度限り会計・失敗後の固定unwind

記号は全て非負safe整数としてchecked演算する。数値係数は未導出である。

- `P`：元parser側の既存累積課金。既存cleanup前払いを既に含む。
- `B`：同meterのbridge内訳の累積課金。即時費と前払い予約を含み、Pと重ならない。
- `R_seed`：context生成前に確保する初期・早期失敗の診断／alias退役費。
- `C_admit`：binding・受付・projectionまでの固定最大経路費。
- `R_tail`：core開始前に必要なcore bootstrap・preと、戻り値受理から全終端までの最大経路費。

各予約は`R ≤ max_parse_work − (P+B)`を確認してから一度同meterへ課金し、専用private credit slotへ記録する。和・差・経路費の計算もprofileの算術費へ含める。予約不足は`raw_work`、上界算術overflowは`raw_overflow`。profileの未導出／版・coverage不成立は`raw_limits`で閉じ、cap不足を勝手に拡張しない。

`R_tail = C_core_bootstrap + C_pre_claim + max_{σ∈合法な終端経路}(Σσ C_step)`を候補式とする。σは正常post→move→最終finally→返却、core拒否→診断→unwind、core throw／不正結果→診断→unwind、postの各途中拒否→先行post費＋拒否診断＋全破棄、返却準備途中失敗→全破棄を含む。途中postを使ってから失敗枝へ移る経路も含め、単なる「成功費と失敗費の大きい方」で済ませない。全aliasを外す費用と外側finalizeも各経路の中に一度だけ含める。

seed／受付／tailにまたがる同じ操作を二重予約しない。実装前に各stepを一つの費目・一つのcreditへ割り当てる。前段のcreditを後段へ流用せず、各slotは`unreserved → reserved → in_use → retired`だけに進む。部分実行／拒否でも再取得・再消費を許さない。利用時は前払いcreditを消費したという有限イベントを記録し、同じ操作をmeterへもう一度課金しない。

既存parserとの整合のため、予約の未使用分はbudgetへ返却・借用せず、課金済みのまま保持する。`B_charged = 即時課金 + 一度取得した予約の和`であり、別の`executed`／`prepaid_unused`診断を必要とする。core・parser・bridgeの「観測課金total」は抽象課金の合計で、予約を含む既存workの意味を維持する。実行操作数・実CPU費と呼ばず、予約上界を合計へ再加算しない。

coreを呼ぶ前にtail全体が予約済みであることを必須とし、core失敗後に「不足なら追加課金してから診断／破棄する」順序を許可しない。先行失敗後は成功postなど新しい業務検査を止め、該当creditの固定診断・unwindだけを行う。既存のAST／byte finallyも実行するが、前払い済み費を再度要求しない。

`max_parse_work + max_value_work ≤ max_total_work`を元planで維持し、`P+B ≤ max_parse_work`、`V_core_charged ≤ max_value_work`を分離する。両者が観測できる時だけchecked和を返す。core計数unavailableや診断snapshot故障なら既知成分・予約記録・first reasonを残し、観測totalはUnknownとする。未呼出しのcoreは`not_called`で表し、unavailableと同一視しない。

旧profileのbootstrap native reflection、未知objectのown-key列挙やallocation／freeze故障に対する完全な実時間・メモリ上界は未確認。abstract creditを確保したことだけで、OOM下でも必ず結果objectを生成できると保証しない。故障時に保持できた先行診断と、結果取得不能／後処理異常を分ける。

## 7 pre/post・固定結果と破棄

preは同owner、未失効borrow、元plan／meter、frame成功、完了V／N、採用model群、受付成功、tail成立、未使用claimを固定項目で確認する。公開されたRC-B結果の値一致だけでpreを通さない。core呼出し直前にclaimを消費する。

成功postは固定producerが返した結果に限定し、modelと成功variant、観測済み6計数の非負safe整数性・checked和・上限、同claimのcandidate、型付きshape／upperの固定項目、元Nと`upper.encoded`を確認する。固定metadataを読む際もgetter／Proxyへ救済せず、own data descriptor等の有限検査に限定する。全field／局所関係の値検査はcoreの一度だけの実行が所有し、postでtreeを再walkしない。入力bytesを返却copyから再encodingして照合する処理も追加しない。

| 位置 | stage／固定理由・診断 | 固定処理 |
|---|---|---|
| 元input／UTF-8／syntax／frame拒否 | 元stage／reason | 元finallyだけ。core未呼出し |
| 初期profile／model不成立 | plan段`raw_limits` | 新context／parse／core開始0。bootstrap診断だけを保持 |
| Framed後の生成元／model／profile不成立 | parse段`raw_limits`。内部生成状態の予期しない破損は`raw_internal` | 後段開始0、seedで診断・alias退役 |
| 2V／structural不足・overflow | parse段`raw_limit`／`raw_overflow` | core未呼出し、同contextを終端化 |
| bridge予約不足 | seedはplan段、Framed後の受付／tailはparse段の`raw_work` | core未呼出し、既存creditと元finallyで固定unwind |
| coreの5拒否理由 | value段`value_schema / value_relation / value_limit / value_overflow / value_invalid` | first reasonとcore計数を先に保持。成功postなし、候補なし、再呼出しなし |
| core呼出しthrow／結果variant・model不成立 | value段`raw_internal` | claim消費済み。取得できた計数を保持し、後続成功なし |
| success post不成立（N超過等） | value段`raw_internal` | 成功workは保持、全candidate aliasを外す |
| 先行失敗後のsnapshot／退役診断異常 | first reasonを維持、二次診断に別保持 | 先行理由を置換せず、値を返さない |

既存RawStageへ無断でvalueを追加して旧RP-A／RP-Bを変更せず、新接続結果だけに値段の型を設計する。`limit`から不足費目を推測する新分類も追加しない。

core拒否に対する診断整合確認は、first reasonを確定してから固定metadataに限定して行う。snapshot不成立を成功へ補完せず、観測できるprefixだけを残す。core successで計数がunavailableなら結果契約不成立として拒否し、候補値は出さない。副診断や予約不足を理由に、coreの先行拒否を後着の`raw_work`へ置き換えない。

## 8 合成受入条件・独立oracle

以下は将来の必須試験で、今回は実施していない。

| ID | 対照と合格条件 |
|---|---|
| CC01 | 同root／plan／meter／V／Nを固定内部継続でだけ供給。別invocation・同値copy・公開summary・再parse混入はpre拒否。caller callback／getter／iterator実行0 |
| CC02 | syntax・LF／EOF完了前の失敗ではcore呼出し0。正常Vは独立tree数と一致。NはLF込みの元長さで、EOF後positionと混同した変異を検出 |
| CC03 | public RC-B wrapperの既存全対照を維持し、内部共通値kernelとの差は再pin／配賦和の既存所有だけ。19項目／7項目の値・順序を照合、parser prefixのreset／二重配賦確認なし |
| CC04 | seed・受付・tailの各等値／1不足・overflowをBigInt別計算と比較。credit利用／未使用／退役イベントとmeter差分を独立集計し、二重予約・二重課金・流用・refundを拒否 |
| CC05 | 正常・core拒否・同期throw・post各途中拒否・返却準備失敗を有限経路表から列挙。各経路の実行費が予約内、post成功prefix＋失敗後処理も上界内。source課金点の変更／再walk・費目欠落の変異を別途検証 |
| CC06 | 同claimを一度だけ消費し、再入／二重call／失敗後再開を拒否。pre失敗は0 call、throw含むcore開始後は1 call。試験専用assemblyは固定scenarioで、public APIへfault supplierを足さない |
| CC07 | core5理由・観測済み0・途中prefix・unavailable・snapshot異常を保持。core未呼出しと取得不能を分離し、Unknown totalを0にしない。後着異常でfirst reasonを書き換えない |
| CC08 | 全10 variant・全row、Nとencodedの等値、schema／関係／byte拒否、core cap境界、post N超過を検査。bytesで到達しないcore故障・post拒否は別assemblyで明記し、実到達扱いしない |
| CC09 | borrow→pending→ReturnPending→結果ownerの同tree一度move。copy追加・再validateなし。post／返却準備の各故障でwrapper／local／slotの全aliasと元root／bytesが境界から持ち出されない。GC確認へ昇格しない |
| CC10 | 秘密canary・例外・key／offset／stackの非出力。診断に固定理由・計数以外の本文を残さない。旧v1・RP-A100／RP-B110／312・legacy core・RC-B・梱包負対照を維持 |

独立oracleは、手計数の小さいwire、JSON構造の別計数、BigInt算術、費目別イベントの別集計を使う。profile係数や予約式をそのままコピーしたoracleだけで成立を主張しない。sourceの課金点を変えるmutation検証と、診断数値だけを変える対照を区別する。

## 9 後続の実装順と未確認事項

1. **費目・予約model先行**：本表を有限step／slotと実施点へ落とし、bootstrap・post各prefix・unwindを含むunit係数と経路上界を導出する。純粋計算と独立oracleで検証するまでprofileはUnknownで、core接続を許可しない。
2. **private供給／共通kernel境界**：元parser生存区間の内部型・同plan／meter・claimと最小算術共有を合成依存で実装する。旧入口を残し、profile未readyならcore未呼出しで停止する。
3. **予約済み固定core／pre/post接続**：一度だけのcore、pending管理・理由合流・元finally後の返却を連続合成試験で確認する。正式発行・runtimeとは分離する。

bridge unit係数、有限alias slotの具体数・ABI、全経路の独立計数、core work外のbootstrap／wrapper費、scratch／内部一時container・運用cap、native故障・実heap／CPU／GC／ゼロ化は未導出／未確認。実source・共有期限／取消の正式owner、encoder・capture／custody／本文保存は別の未対応範囲である。純粋な受付成功や非実行結果の存在から、これらを確認済み／承認済みにしない。

## 10 今回の確認範囲

`692d9ae`のローカルsource・親設計・RC-A／RC-B記録を読み取り照合した。MDのローカル参照と差分空白を確認する範囲であり、新profileの実装・ビルド・合成試験・parser実行・再採取を実施した記録ではない。既存928件成功のRC-B記録を、未実装CC01〜10の成功として流用しない。
