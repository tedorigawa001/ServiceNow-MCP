# AU-BR-006 CD-04：HTTP失敗分類・同purpose retryの合成検証

Date: 2026-10-28 / Scope: CD-03のfake dispatcher・注入Response／Streams・fake clock／scheduler限定。

設計：[draft-0.4 §13](BEST_PRACTICE_ABORT_SCOPE_CLOSED_DISPATCH_SIGNAL_DESIGN.md#13-cd-04http失敗分類cleanup確認後の同purpose-retry)。
実装：[固定HTTP分類・Response監督](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts)、[閉鎖gate](../src/review/abort-scope-evidence-closed-body-gate.ts)、[同ReadState](../src/review/abort-scope-evidence-closed-read-state.ts)。
試験：[CD-04追加39件](../tests/review/closed-http-status.test.ts)、[CD-03互換試験](../tests/review/closed-response-reader.test.ts)。

## 1. 今回の接続

CD-03のResponse-reader経路にだけ、native statusの固定分類を追加した。429はrate_limited、500〜599はserver_errorで局所upstream_unavailableとし、所有を確認したerror bodyのcancelが期限内に確認できた場合だけ同opaque requestの2回目を受付可能にする。自動再送はしない。

401はauthentication_failed、403はaccess_deniedで直ちにrun停止。3xxはredirect、その他の非200 2xxはunsupported_success、その他4xxはclient_error、Response.errorの0等はinvalid_statusとしてinvalid_responseで停止する。404からrecordの存在／不可視を断定しない。

非200はreaderへ渡さず、Location・Retry-After・error本文・raw例外を読んだり結果へ出したりしない。未読量をG/Sへ見積り課金せず、既存G/Cを返金・resetしない。fetch内部bufferや実通信の全byte計測を証明したとは扱わない。

HTTP履歴は最初のhttp_failureと直近のlast_http_failureを別々に凍結する。各slotはstatus／固定classification／code／syntheticだけ。最初の局所失敗attempt_failure、最初のglobal停止primary、cleanupは従来どおり別軸に保持し、履歴を現在のretry権限やrun成功／失敗の代わりにしない。

## 2. RED→GREENと互換変更

最初の429 tracerは旧実装がinvalid_responseを返すため失敗した。固定分類→局所失敗→cancel確認→同ReadStateのretryable終端を接続し、同URL／auth context・新signal／ordinalで2回目の200を解析する経路が成功した。

既存CD-03試験の429／500の2件は一律invalid_responseという初期subsetの期待だったため、今回承認したupstream_unavailableへ更新した。本文不採用・read/release回数0・cancel確認の条件は維持。CD-02のwait/discard試験は変更せず、従来の非200 invalid_responseのまま成功する。

本番bounded-readのrequest()が行う自動retry／固定250ms backoffやdispatch rejectのretryまで移植したものではない。今回、同期throw／自発dispatch rejectは従来どおりglobal upstream_unavailableで停止させ、過去のHTTP transient履歴で新たな再試行を認めない。

## 3. 独立観測と拒否境界

| 観点 | 検証 |
|---|---|
| transient | 429、500／501／503／599を分類。cleanup確認後だけcaller起点の2回目へ進み、同URL／context・新signal／ordinalを保持 |
| auth／権限 | 401／403はcancelが未決着でもprimaryを確定。cleanup期限後・late決着後も認証失敗／権限不足を保持し、再認証／再送しない |
| redirect | 300／301／302／303／304／307／308を追跡せず拒否。headers getter・Location・巨大Retry-Afterを使わない |
| その他 | 201／204／206、400／404／408／418／422、status=0は固定分類で停止 |
| cleanup | transientでもcancel pending／reject、外国lock／所有不明ではretry不可。返却済み未確認をlate決着で修復しない |
| 所有権優先 | 外国lock／使用済みResponseの401／403は`evidence_binding_mismatch`。statusをhttp_failure／primaryへ記録しない |
| 診断 | 429→403で先行429と直近403・primary access_deniedを同時保持。秘密のerror body／header／exceptionは非露出 |
| 上限 | HTTPだけ、timeout＋HTTPを混ぜた場合とも通算2試行。3回目・予算不足・元phase cutoffで新Cを計上しない |
| final枠 | 初回200→final 503→final 200を同slotで実行し、requests=3／reserved=2。Gは成功本文2件分でresetしない |
| 再入・late | HTTP transientのabort listenerがcancelへ再入した場合はcancelledがprimary。timeout後のlate 401を新しい認証失敗へ分類しない |
| stale履歴 | 429後の自発dispatch rejectを、先行HTTP履歴でretry可能へ戻さない |

fake絶対時刻・dispatcher回数・signal／context参照・underlying cancel回数・既知body長を試験側で独立に観測する。製品のHTTP classifierを期待値oracleへ流用しない。

## 4. 検証結果

| 確認 | 結果 |
|---|---|
| CD-04追加試験 | 39 tests成功（初回35件＋§6の4件） |
| HTTP＋CD-03＋CD-02＋CD-01＋supervisor＋stream＋body＋ReadState＋gate | 9 files／331 tests成功 |
| `npm run build` | 成功 |
| 変更した3実装・新規／更新試験のESLint | 成功 |
| 全体 `vitest run --maxWorkers=3` | 177 files／5,343 tests成功、35.82秒 |
| offline package-worker smoke | production-only install・解析・集約成功、377 files |
| 関連MDの相対参照先 | 4 files／78 linksの存在確認成功（見出しanchorの自動検証ではない） |
| `git diff --check` | 成功 |

全体試験では既存ローカル合成待受を許可した。実PDI／外部サービスへの通信はなく、製品／テストの期限は緩めていない。

## 5. 未接続・未承認

追加語彙authentication_failed／access_deniedとHTTP診断はpackage除外の閉鎖module内だけ。公開MCP 0.2／0.3契約・既定規則・AU-BR-006登録・正式body receipt発行は変更しない。

本番の自動retry／backoffとの同等化、実AuthSnapshotIdentity／ReleasePermit／固定source・選択metadata／payload／worker job・上位正式JSONへのbinding、初回／最終親の意味的安定性、全体work／heap・本番cap・実時間host終了は別途検証が必要。

正式発行口閉鎖・Unknown・全体受付無効、VM／監視／telemetry保留を維持する。実transport・実機操作・token発行・設定変更・Pushは行わない。

## 6. レビュー修正：所有権検査をHTTP分類より前へ（2026-10-29）

初版はResponseのstatus分類を、外国lock／使用済み／再利用の所有権検査より先に行っていた。このため所有を確認できない401／403 Responseが`authentication_failed`／`access_denied`をprimaryへ確定し、429／503でもhttp_failureへstatusが残った。CD-03までの順序（所有権→URL／status）と§13.1の「live検査に失敗した応答を新しい認証／HTTP障害の証拠にしない」に反する。

所有権検査をURL／HTTP分類の前へ戻し、所有確認後だけ分類する。外国lock 503試験の期待値を`http_failure:null`／primary `evidence_binding_mismatch`へ改め、外国lock／使用済みの401／403の4件を追加した。修正前の順序では5件が失敗する。
