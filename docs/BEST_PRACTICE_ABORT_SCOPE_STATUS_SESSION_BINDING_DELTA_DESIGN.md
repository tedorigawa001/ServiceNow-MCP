# AU-BR-006：ST-03C後の実session binding・単一予算・停止owner接続差分

Version: br006-status-session-binding-delta-draft-0.2 / Date: 2026-10-31。
Status: **§10の同constructor内部binding・同期失効・診断保持をfake依存で実装。status終端の実接続は未実装。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実sessionへのstatus transport採用・実通信・実機操作・設定変更の承認ではない。**

基準：[ST-03接続設計の§12](BEST_PRACTICE_ABORT_SCOPE_STATUS_TERMINAL_CONNECTION_DESIGN.md)、[private composition設計](BEST_PRACTICE_ABORT_SCOPE_PRIVATE_COMPOSITION_DESIGN.md)、[実session差分設計](BEST_PRACTICE_ABORT_SCOPE_REAL_TYPED_BINDING_DELTA_DESIGN.md)。本書の段階名・検査表は内部契約案であり、新しいexport・権限・実装済み機能を意味しない。

## 1 現状と今回の差分

ST-03Cは、注入Response→同readerのcancel-only cleanup→private発行→一度限り消費を確認した開発専用経路である。`workflow.consumption`の7権限はすべてfalseで、実認証・source・ReleasePermit・canonical予算を証明しない。これを正式receiptやfallback権限として取り込まない。

一方、CM-04-03には新規sessionの固定compositionでfake bytes→private ack→同sourceの既存release判定を行う経路がある。今回はこの生成・会計・失効の根を再利用し、status-only側の不変条件を同じ根へ結ぶ差分を定める。固定200受理を緩める実装や、既存公開経路のlane変更は行わない。

| 現行の根 | 再利用するもの | 追加で証明する差分 |
|---|---|---|
| [session](../src/servicenow/bounded-read.ts)の`#openComposition` | 同`#snapshot`・`#runOwner`・`#runLease`、transport claim、source初期結合 | 同生成継続内でstatus終端の発行元を捕捉。任意sessionの登録／後付け切替なし |
| [canonical core](../src/servicenow/review-canonical-budget.ts) | `construction.takeBootstrapAccounting()`・dispatch／chunk・first primary | 第二core／counter／clockを作らず、同attemptの終端まで会計を継続 |
| sessionの`#prepareCompositionIO` | private key、ack用WeakMap、source consumer捕捉、pre／post guard | status-only終端はbody ackと別種にする。同じprivate生成元・attemptを検査し、診断copyから再発行しない |
| [source](../src/review/bounded-source.ts) | `CompositionSourceConstruction`、`claimPrivateCompositionSource`、既存release判定・private permit verifier | 同sourceへ用途別に受理。status-onlyをraw release JSONやEOFに偽装しない |
| ST-03Cの注入owner | 同reader所有・元window・一度限りclaim・二軸診断の不変条件 | 契約を再利用するが、開発用owner／台帳／token／`fake_io`申告を実発行元として共有しない |

## 2 生成元・所有権・一度限りの取得

1. 新規固定compositionが入力・target・低減limitsを検査し、認証／I/O前にlaneを固定する。既存公開3経路はlegacyのまま。公開引数・設定・mode setterを追加しない。
2. session constructorの同じ`#snapshot`・`#budget`・`#runOwner`・`#runLease`を使う。`createCanonicalBootstrapBudget`等のfresh factoryを既存sessionへ追加しない。
3. `#openComposition`のtransport claim→initial source結合→同core accounting取得を再利用する。keyは当該生成scopeだけが保持し、sourceはfriend関数で同session・key・未消費を検査する。公開friend関数はboolean消費だけで、登録口・mutable port getterではない。
4. 初回claimをI/O・注入callbackより前に消費する。失敗後はclaim／lane／ready世代を戻さず、別ownerや別permitを作って再開しない。外国runのclaimを探索・消費しない。
5. readonly lease・stats・summaryは権限を供給しない。bootstrapにはownerに登録した`#runLease`そのものを渡す。`core.view.lease`への置換や構造一致copyは拒否する。

現行accountingの`release()`は単なる予約返却ではなく、その利用を閉じる。bootstrapのfinallyでreleaseしてからmatched後に再取得する設計は不可。将来の継続が必要なら同ownerの寿命を明示して設計・検証し、今回のprepared限定経路から暗黙に延長しない。

## 3 permit前bootstrapとmatched後の境界

```text
新規生成・claim・同source初期identity結合（permitなし）
  → 認証ready（既存の0→1）
  → 固定親GET／private親snapshot受理
  → 固定release GET／用途別private終端受理
  → 同sourceの既存C方式release判定
      ├ unknown／mismatched／失敗 → 停止・診断保持、metadata取得0
      └ matched → 同sourceの#permit・不変release snapshot結合
                   → prepared_only（正式発行はdisabled）
```

permit前はconstructor由来のbootstrap継続が認証・親・releaseの固定用途だけを所有する。まだ存在しないReleasePermitをbootstrapの前提にせず、逆に「permit不要」を汎用GETへ拡張しない。tokenはsessionの認証consumerだけが保持する。

matched後はsource内の`#permit`そのもの、同session、既存private release port／snapshotを照合する。decisionや不変snapshotのcopyだけでは通さない。`bindReviewReleaseSource`等の既存prepared検査を再利用し、別source・別permit・失効したready世代を拒否する。

matchedは一覧／payload／worker jobの正式発行許可ではない。最初の受入範囲はprepared限定まで。選択window・payload receipt・job・final予約の移譲は後続条件とする。

### 3.1 body ackとstatus-only終端

| 入力 | private受理の意味 | 禁止する昇格 |
|---|---|---|
| 固定200のbody ack | 同attemptのbytesから課金・解析・cleanup・post-guard済みの値を同sourceへ一度受理 | 外部JSONの再提出、別用途ack、二重消費 |
| release403／404のstatus-only終端 | 同attempt・同reader／no_body・cleanup事実の確認。既存C方式へ渡す将来の受理契約候補 | EOF／body ack／matched／fallback許可への自動変換 |
| hard HTTP・parent404・cleanup未確認 | 既存のhard／local分類とcleanup診断を保持して停止 | release用の回復候補としての流用、late settleによる確認昇格 |

release403／404をC方式へ採用する挙動はSTC-A02／親A02等の承認待ち。現行200限定guardは維持する。採用設計ではbodyの欠落を一般のinvalid_responseに潰してfallback可否を変えず、用途別HTTP事実とcleanup確認を別々に検査する。operator_configのasserted由来・期限・binding・競合limitationsを既存判定どおり保持し、実測resolvedへ昇格させない。

## 4 identityの検査点

| 結合 | 生成／検査の根 | 必須検査点 |
|---|---|---|
| session・auth snapshot・ready世代 | 同constructor／既存lifecycle | claim、認証完了、dispatch前、private受理前後 |
| core・lease・clock・元deadline・phase | 同sessionのprivate参照。phase reserveの正は一つ | 会計取得、各試行、chunk、cleanup、発行／消費のpre／post |
| source・target | constructor時の初期claim | 親／release受理、matched binding、後続要求 |
| purpose・固定URL・認証・attempt・元window | 同transportの固定dispatch生成元 | dispatch前、Response受領、cleanup終端、消費前後 |
| permit・release snapshot | matched後の同source private verifier | prepared検査と将来のmetadata／payload用途 |

同origin・同token文字列・同counter値・同じJSON構造はobject identityの代用にならない。認証snapshotの一致は本人sys_idの証明でもない。status-only cleanupは同readerの操作を固定し、no_bodyは明示的なnot_applicableであってEOFではない。

## 5 単一予算と費目所有

既存の全体60秒、最大210試行、response 4MiB／総受信16MiB、payload 2MiB／総payload8MiBを維持する。低減は可能だが増枠しない。時計の起点・phase reserve・attempt window・cleanup floorは再生成せず、等号境界でも元の拒否条件を使う。

| 費目／resource | 唯一の所有部と計上点 | 禁止事項 |
|---|---|---|
| C（HTTP試行） | 同core accounting、固定dispatchの直前。未dispatch拒否0、同期throw／rejectも1 | native owner／sourceで再計上、失敗時返金 |
| G（受信chunk） | 同readerから取得したchunkを同coreへ一度課金。解析も同bytesを使用 | 別bytesの課金、再読による二重計上、破棄chunkの返金 |
| P（payload） | 既存sourceのpayload境界 | bootstrap／status-onlyで代用課金・リセット |
| R（予約4枠） | 同laneの予約台帳。legacy固定枠とtyped枠は択一 | 解放後4枠を再補充、preparedをfinal移譲済みとみなす |
| cleanup／reader | 同attempt native ownerがcancel・closed・releaseLockを一度確認 | session／sourceが同readerを二重解放、確認不能を成功扱い |
| timer／listener／admission／token参照 | sessionの固定close | transportやsourceからの二重返却、別sessionへの移譲 |

認証交換が必要なら同t0・C/Gへ含める。per-user／有効cacheでは追加交換しない。cancel-onlyではread=0・取得chunk由来G=0だが、socket受信0の主張ではない。status消費それ自体によるdispatch／retry／予約返金は行わない。

## 6 同期失効とcleanupの順序

停止はfirst primaryを確定し、同じrunの新規利用を同期的に無効化してから外部abort／cancelへ進む。既存`#adopt`／`#syncRunFailure`／`stop`／`#compositionRevoke`を再利用し、対向通知の再入で停止を繰り返さない。

1. canonical／run ownerの最初の内部理由と公開写像を固定する。後発のcleanup／closedで上書きしない。
2. 同runのtransport・ready利用・source consumer・未受理ack／status claimを同期失効する。消費済みclaimをavailableへ戻さない。
3. 元attemptのabort／cancelとcleanup待ちへ合流する。停止後もcleanup診断の確定は許すが、業務受理・新発行・retryは許さない。
4. 元期限内の固定終了処理でsession resourceを一度解放し、token参照を破棄する。late応答は受理せず、cleanup未確認の結果を後からconfirmedへ昇格しない。

通常closeでも同じprivate authorityを先に失効させる。cleanup待ちのためにrunを再有効化せず、元floor・元hard deadlineを延長しない。既に確定した消費成功は履歴として保持するが、停止後の権限は持たない。

## 7 上位診断の保持契約

上位ownerは、最初のprimary（内部／公開理由）、最初の拒否と停止理由、HTTP事実（用途・status）、cleanup終端（confirmed／unconfirmed／not_applicableと固定理由）、元stageを分離して保持する。最新phaseだけで最初の終端を置換しない。

binding不一致・二重消費・取消・期限切れを単なるcleanup失敗へ潰さない。cleanup成功でもHTTP失敗は消さず、HTTP失敗でもcleanup未確認を隠さない。外国ownerへの混入は当該要求を拒否し、外国ownerの状態を変更しない。対象runの停止要否は既存binding契約に従う。

公開・記録用には固定コード・件数・限定summaryだけをcopyし、credential・body・opaque token・lease・key・consumer・URL queryの秘密を返さない。外部からの診断再提出は受理口にならない。新しい公開JSON enumをこの設計だけで追加しない。

## 8 fake I/O受入条件と段階

| ID | 負の対照／成功条件 | 独立した観測・必須結果 |
|---|---|---|
| SB-T01 | 新規固定生成／既存legacy後付け／二重生成 | fake呼出しログでI/O前claimを確認。後付け・再生成はdispatch0 |
| SB-T02 | 別snapshot／lease／source／target／permit・copy | private受理なし。外国run不変、診断保持 |
| SB-T03 | 認証→親→release固定200→matched | 同core・同leaseを継続、ready1、同sourceだけprepared。正式発行0 |
| SB-T04 | permit前bootstrap／matched後要求 | bootstrapはpermitなしの固定用途のみ。unknown／mismatchedはmetadata0 |
| SB-T05 | dispatch前拒否／同期throw／reject・chunk破棄 | 独立イベントoracleでC=0／1、G実長一致、返金なし |
| SB-T06 | status-only release403／404、no_body、hard／local失敗 | 現段階は診断・非実行候補のみ。承認前fallback0、read0、no_body≠EOF |
| SB-T07 | guard内再入／取消／期限等号／失効後late settle | callback直後にも検査。claim復元なし、private受理なし |
| SB-T08 | HTTP失敗＋cleanup失敗／close連打 | 二軸診断とfirst primary保持。reader・session resource解放は各一度 |
| SB-T09 | R解放・再取得／accounting終了後再利用 | 再補充・再取得拒否。最初の費用・失敗を保持 |
| SB-T10 | fixture台帳／ST-03C診断copy／秘密marker | runtime authorityへの昇格0、秘密非出力、開発専用module非同梱 |

将来の最初の実装単位は、(1)同constructorのbinding・失効・診断契約、(2)同canonical accountingと停止のfake接続、(3)同attemptのstatus終端と固定source受理のfake接続に分ける。既存200経路とlegacy互換を各段階で検証する。実通信は受入試験の代用にせず、別途明示承認を要する。

## 9 承認待ち・未確認事項

- STC-A01〜A05／親ST-A01〜A07／非200設計A01〜A07のruntime承認は未完了。とくにrelease403／404のsource採用、attempt-local retryとrun停止、cleanup確認不能時の扱いを先に確定する。
- status terminal専用のprivate受理形と、既存body ackとの共通identityの実装表現は未決。外部mutable port／fixture registryを導入しないことをレビューする。
- accountingの閉鎖と将来のfinal予約移譲の寿命は未接続。今回のprepared成功を予約移譲・選択payload・worker jobの完了にしない。
- 同固定URL／認証snapshot／実dispatchと注入Responseの発行元bindingは未検証。合成成功から実transport接続済みと主張しない。
- 上記の承認待ちの判断材料は[承認判断用の比較資料](BEST_PRACTICE_ABORT_SCOPE_NON200_APPROVAL_COMPARISON.md)を参照。3つの判断に整理した比較であり、承認ではない。
- §1〜9は設計契約、§10はfake依存の内部契約実装である。正式発行口閉鎖・Unknown・全体受付無効・調査保留を変更しない。

## 10 同constructor内部契約のfake実装

[lifecycle](../src/servicenow/review-evidence-lifecycle.ts)の既存`transportConstructor`へ`claimStatusBinding`を追加した。別registry／session登録口は作らず、既存transport handle・同snapshot／lease・初期source claimを使う。生成claimはcallback前にconsumingとなり、lease観測後にも同一性・ready未開始・ゼロ会計・claim未変更を再検査する。生成中失敗はfailed、生成済みの重複要求はrun停止となり、初回contextの交換や再生成を認めない。

返すprivate closureは`inspect`と`diagnostic`だけ。body／status token・consumer・writer・dispatch・permit発行口は持たない。inspectは同handle／snapshot／lease／sourceをpre／post検査し、ready世代0→1は既存ownerだけが管理する。別ownerの参照は当該runで拒否し、外国ownerを変更しない。

既存`revoke`の同期sectionでcontextを失効させ、最初の終端理由・primary・拒否理由を保持する。closeや後発失敗で上書きせず、lease取得失敗後に値が回復しても復帰しない。ここではHTTP／cleanup終端を新規生成しないため、二軸診断の輸送は後続工程のままである。

[session](../src/servicenow/bounded-read.ts)の`#openComposition`が同claimを取得し、既存fake compositionが認証前にinspectする。既存private生成継続と同`#runOwner`を再利用し、第二budget・lease・clockは生成しない。公開summaryへcontextやその診断を返さず、既存公開legacy経路は切り替えない。

[合成テスト](../tests/review/status-constructor-binding.test.ts)と[検証記録](E2E_BEST_PRACTICE_STATUS_CONSTRUCTOR_BINDING_2026-10-31.md)を参照。単一会計へのstatus終端接続、同reader cleanup／private発行のruntime採用、固定sourceの非200受理、matched後の予約移譲／payload／workerは未実装である。承認待ちと正式発行口閉鎖・全体受付無効・調査保留を維持する。
