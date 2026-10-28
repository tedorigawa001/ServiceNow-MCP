# AU-BR-006 CD-02：Response待機・同signal・破棄cleanupの合成検証

Date: 2026-10-28 / Scope: fake dispatcher・clock／scheduler、注入native Response／Streams限定。

設計：[draft-0.2 §11](BEST_PRACTICE_ABORT_SCOPE_CLOSED_DISPATCH_SIGNAL_DESIGN.md#11-cd-02同attemptのresponse待機signal破棄cleanup)。
実装：[同coreのResponse待機](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts)、[同ReadState](../src/review/abort-scope-evidence-closed-read-state.ts)、[未開始bodyの終端](../src/review/abort-scope-evidence-closed-body-candidate.ts)。
試験：[CD-02 32件](../tests/review/closed-response-wait.test.ts)。

## 1. 今回の接続

`createInjectedClosedParentResponseWait`は固定親GET・不変fixture auth context・opaque request handleを同coreへ結ぶ。元のReadState／t0／C・予約・attempt windowを使い、Response待機中も同D_ioで失効・同signalをabortする。新しい予算・別10秒・時計起点を作らない。

native Promiseの両settlementを観測し、callerのthen／thenableは呼ばない。受領したResponseはnative getterで検査し、所有確認済みbodyだけnative cancelで破棄する。reader・text/json decode・本文課金・body候補発行へは進まない。summaryのresponse_wait_completedは、待機と破棄確認の完了だけを表し、親record／レビューの成功ではない。

status=200＋bodyあり以外はinvalid_responseで拒否する限定subset。3xxを追跡せず、429／5xxのretryは今回未実装。空でないnative response.urlは固定URLと補助照合するが、本文のHTTP由来や実認証の証拠にはしない。caller getterによる表示値は使わない。

## 2. RED→GREEN・切り分け

1. Response未到達のtracerはfactory未実装で失敗。同ReadStateに基づく9750msのabort・10000msのdispatch_pending未確認終端を接続して成功した。
2. timeoutのabortに応答したrejectがupstream_unavailableへ上書きされ、局所retryできない回帰を再現。失効後のrejectはdispatch終了事実としてだけ観測し、先行attempt_deadline_exceededを保持して修正した。自発reject／同期throwは従来どおり固定通信失敗。
3. Promise.resolveによるthenable assimilationがcallerのthenを呼ぶことを回帰試験で検出。native Promiseだけをpinnedなthenで観測し、それ以外は直接Response受領検査へ送ることで、thenable／overrideの呼出しをなくした。
4. getter override試験の初回失敗はfixture起因。最小再現でNode v24.18.0のResponseコンストラクター自身がサブクラスstatus getterを呼ぶことを確認した。構築済みResponseのprototypeを差し替えるfixtureへ訂正し、adapter受領時のnative getter固定だけを評価した。

## 3. 独立観測と結果

試験側はfake clockの絶対時刻、dispatcher呼出し／signal／context参照、underlying sourceのcancel回数を独立に観測する。製品statsを使って期待deadlineを再計算しない。

| 観点 | 確認内容 |
|---|---|
| 未到達 | D_ioでabort、D_attempt等号でdispatch_pending。未確認からretry不可 |
| 局所timeout | abortによるrejectで期限内に決着した場合だけ同purposeの2回目。URL／context／C共有、新signal、3回目拒否 |
| 取消／close | pending時に同signalへ通知、一次codeを保持。二重waitもC=1で停止 |
| Response cleanup | native cancel pending／rejectとdispatch pendingを区別。期限等号で未確認。EOF／released readerを捏造しない |
| late応答 | 旧resourceの自owner bodyだけbest-effortで破棄。外国lockを操作せず、返却済みcleanup／primary・受信量を修復しない |
| 所有 | Response／body一度限り、foreign／copy request、Proxy／偽Response／caller getterの拒否または不使用 |
| 未開始終端 | unavailable／retryableのみ。success・ゼロbyteを含むappend後・二重終端を拒否し、候補・decodeを作らない |
| 非露出・閉鎖 | 本文／資格情報sentinel／URLを結果に出さず、global fetchを使わない |

late best-effortの実際のcancel操作数は増え得るが、正式な終了証拠や成功候補に変換しない。active_readersやreader releaseの架空counterも追加しない。

## 4. 検証結果

| 確認 | 結果 |
|---|---|
| CD-02追加試験 | 32 tests成功 |
| CD-02＋dispatcher＋stream＋supervisor＋body＋ReadState＋gate | 7 files／262 tests成功 |
| `npm run build` | 成功 |
| 変更した3実装・追加試験のESLint | 成功 |
| 全体 `vitest run --maxWorkers=3` | 175 files／5,274 tests成功、31.69秒 |
| offline package-worker smoke | production-only install・解析・集約成功、377 files |
| 関連MDの相対参照先 | 4 files／71 linksの存在確認成功（見出しanchorの自動検証ではない） |
| `git diff --check` | 成功 |

既存ローカル合成待受は許可して全体試験を実行した。PDI／外部サービスへの通信はなく、製品・テストの期限は変更していない。新factoryも既存package除外prefix内で、npmへの正式採用口を増やしていない。

## 5. 残る境界

CD-02は待機／破棄専用。Response→native reader→同private bytes採用はCD-03へ残す。親最終readも今回のfactoryには公開しない。成功した待機であってもReadState上は本文未採用・unavailableとして終端化し、親の成功証拠へ昇格しない。

finishUnopenedは、coreが既に確認したcleanup後に使う閉鎖fixture内部操作。論理的な未開始制約を確認するだけで、単独で物理cleanupを認定する本番authorityではない。native Responseだけでは、信頼するfake dispatcherが未知の別要求の本文を返したことまでは識別できない。

時計／schedulerはfake依存。未決着Promiseの強制決着・非協力的OS処理・event loop停止を含む実時間終了保証、全体work／heap上界は未証明。実AuthSnapshotIdentity／ReleasePermit／選択payload／worker job、公開JSON、本番cap、正式証拠発行は未接続／未承認。

正式発行口閉鎖・全体受付無効・Unknown、VM／監視／telemetry保留を維持。実transport・実機操作・token発行・設定変更・Pushは行わない。
