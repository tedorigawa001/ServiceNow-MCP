# AU-BR-006 非200／status終端：承認判断用の比較資料

Version: br006-non200-approval-comparison-draft-0.2 / Date: 2026-10-31。
Status: 判断材料のみ。本書は承認ではなく、ソース・試験・runtime gateを変更しない。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実通信・実機操作・設定変更・Pushの承認でもない。

基準commit：`9afbcc1`（draft-0.2で`f53a0ca`までの進捗を§8へ反映）。対象設計：[非200 HTTP設計](BEST_PRACTICE_ABORT_SCOPE_NON200_HTTP_DESIGN.md) §8（A01〜A07）、[status-only終端設計](BEST_PRACTICE_ABORT_SCOPE_STATUS_ONLY_TERMINAL_DESIGN.md) §9（ST-A01〜A07）、[ST-03接続設計](BEST_PRACTICE_ABORT_SCOPE_STATUS_TERMINAL_CONNECTION_DESIGN.md) §9（STC-A01〜A05）、[session binding差分設計](BEST_PRACTICE_ABORT_SCOPE_STATUS_SESSION_BINDING_DELTA_DESIGN.md) §9、[固定source status受理差分設計](BEST_PRACTICE_ABORT_SCOPE_STATUS_SOURCE_ACCEPTANCE_DELTA_DESIGN.md) §9。

## 1 結論の要約

承認IDは19件あるが、実質的な判断は次の3点に集約される。残りは既に実装・試験済みの内部契約の追認か、推奨案に異論が出にくい項目である。

| 判断 | 内容 | 推奨 | 主な対応ID |
|---|---|---|---|
| D1 | cleanupを確認できない場合の扱い | **1B**：元window内の確認を必須にし、未確認なら回復候補を使わず停止 | A01、ST-A01〜A03、ST-A05、STC-A04 |
| D2 | release 403／404を既存C方式（運用者設定）へ渡すか | **2B**：cleanup確認済みのstatus-only終端だけを同sourceへprivate受理 | A02、ST-A04、STC-A02 |
| D3 | 失敗attemptのretry | **3B**：確認済みの静止後だけ、250ms・最大2試行。bodyなし429／5xxのretryは無効のまま | A03、A04、A05 |

D2とD3は独立していない。legacyではreleaseの上流失敗（2回とも失敗）もC方式fallbackの入口になるため、D3を採るとD2の対象範囲も広がる（§6）。

推奨の組合せ（1B＋2B＋3B）は、legacyより**厳しい**側への変更である。legacyで成功していた要求が、cleanup未確認を理由に失敗する場合がある。逆に、legacyで失敗していた要求が新たに成功する変更は含まない。

## 2 現状（基準commit時点）

| 項目 | legacy（公開3経路） | 新規固定入口（CM-04-03） | 開発専用ST-01〜03C |
|---|---|---|---|
| 非200 | 用途別に分類（[差分照合試験](../tests/review/http-classification-legacy.test.ts)で1,594件一致を確認） | parent／release hookで200以外を`invalid_response`（`6a1fcd1`） | release403／404・cleanup確認済みだけ診断用の合成／注入tokenを発行・消費。全7権限false |
| release 403 | 取消要求のみで`access_denied`を局所化し、C方式fallback | 非200として拒否 | 同上 |
| cleanup | `finally`で`cancel()`を要求するが完了を待たない | 固定200のみのため対象外 | cancel／closed／releaseLockを元floor内で確認。未確認は`internal_review_error` |
| retry | `upstream_unavailable`なら250ms待機後に最大2試行 | contractは確認済み429／5xxを最大2試行するが**待機なし** | 対象外 |

承認がない限り、現行の200限定guardと開発専用moduleの非同梱を維持する。

## 3 D1：cleanupを確認できない場合

### 選択肢

| 案 | 内容 |
|---|---|
| 1A legacy同等 | 取消を要求するだけで完了を待たない。cleanupは成功条件にしない |
| **1B 推奨** | 元window・元cleanup floor内で同readerのcancel／closed／releaseLockを確認する。確認できなければ回復候補（release403／404、retry）を使わず停止する。hard HTTP（401、auth／parent403）の主理由は保持し、cleanup失敗で上書きしない |
| 1C 診断のみ | 確認を試みるが、未確認でも回復候補の利用を許す。未確認は診断に記録するだけ |

### 比較

| 観点 | 1A | 1B | 1C |
|---|---|---|---|
| 所有権が不明なreaderを残したまま次の処理へ進む危険 | 残る | 残らない | 残る（診断で見えるだけ） |
| legacyとの差 | なし | 未確認時に失敗が増える | 返却が遅くなる |
| 応答時間 | 最短 | 確認待ちの分だけ遅くなり得る（元window内に限る） | 1Bと同じ |
| 公開code | 変化なし | 回復候補の未確認は`internal_review_error`（hard HTTPは元の理由を維持） | 変化なし |
| 実装状況 | — | ST-02／ST-03Cが既にこの意味で実装・試験済み | 新規の緩和が必要 |
| 既存試験への影響（見込み） | 開発専用ST試験の期待値を緩める必要 | なし | ST-02の未確認系試験の期待値変更 |

### 未決の付随事項

- cleanup専用の短いsub-deadlineを設けるか（ST-A02）。推奨は「当面は設けず、元cleanup floorだけを使う」。値を決める根拠となる実測がまだないため。
- 公開終了codeへの写像（ST-A05）。推奨は既存codeのみ使用し、新しい公開enumを追加しない。

## 4 D2：release 403／404をC方式へ渡すか

C方式fallbackは、`sys_cluster_state`を読めない環境で運用者設定のrelease（`operator_config`／`asserted`）を使う既存の仕組みである。実測ではなく申告値であり、期限・binding・競合limitationsは既存判定どおり付く。

### 選択肢

| 案 | 内容 |
|---|---|
| 2A 現状維持 | 新規固定入口は200限定のまま。release403／404は`invalid_response`で停止する。legacy経路は従来どおりfallbackする |
| **2B 推奨** | 同attempt・同reader（またはnative no_body）・cleanup確認済みのstatus-only終端だけを、同sourceのprivate consumerへ一度だけ渡し、既存`#observeRelease`相当でC方式判定する。raw例外codeや診断copyでは受理しない |
| 2C legacy同等 | `access_denied`／`not_found_or_not_visible`例外を捕まえてfallbackする。cleanupは問わない |

### 比較

| 観点 | 2A | 2B | 2C |
|---|---|---|---|
| clusterを読めない環境での新規入口の可用性 | 失敗する（legacyより後退） | legacy並み（cleanup確認が条件） | legacy並み |
| 偽の403／404でfallbackへ誘導される危険 | なし | 低い（native header・同reader・一度限り消費が必要） | 例外codeだけで入れる |
| 申告値（asserted）への依存 | なし | あり（既存limitationsを保持） | あり |
| 実装状況 | 実装済み | 終端・消費はST-03Cで注入試験済み。source受理とC方式接続は未実装 | 新規 |
| 既存試験への影響（見込み） | なし | [private-composition-boundary.test.ts](../tests/review/private-composition-boundary.test.ts)の「non-200 release」試験の期待値をcleanup確認の有無で分ける | 同左に加え、status終端試験の前提と矛盾 |

### 承認時の条件案

- 対象はreleaseの403／404のみ。authentication／parentの403は従来どおりhard停止、parent404はlocal失敗。
- 同runでparent受理済み・認証ready済みであること。
- fallback結果は`operator_config`／`asserted`のまま記録し、実測`resolved`へ昇格させない。matchedでもprepared限定で、metadata／payload／workerの発行許可にしない。

## 5 D3：失敗attemptのretry

### 選択肢

| 案 | 内容 |
|---|---|
| 3A 現状 | contractは確認済み429／5xxを待機なしで最大2試行。native失敗はsticky stopのため実質retryしない |
| **3B 推奨** | 前attemptのstatus／応答なし終端を一度消費し、cleanup確認・pending fetch／read／lockなし・run未停止を満たす場合だけ、250ms待機後に2回目を出す。bodyありはbounded drain（G課金・返金なし）。bodyなし429／5xxのretryは承認まで無効 |
| 3C legacy同等 | `upstream_unavailable`なら確認なしで250ms後に再試行（timeoutを含む） |

### 比較

| 観点 | 3A | 3B | 3C |
|---|---|---|---|
| 一時的な429／5xxへの耐性 | contract経路のみ | legacy並み（確認が条件） | legacy並み |
| 前attemptのresourceが残ったまま次を出す危険 | 低い | なし | あり（late応答・未解放lock） |
| 上流への負荷 | 待機なしの連続2回 | 250ms間隔、最大2回 | 250ms間隔、最大2回 |
| C／G会計 | 各試行C=1、G累積 | 同左。待機自体はC加算なし | 同左 |
| 実装状況 | 実装済み | attempt-localな終端型とsticky stopの分離が必要（未実装） | 新規 |
| 既存試験への影響（見込み） | なし | [native-body-bootstrap.test.ts](../tests/review/native-body-bootstrap.test.ts)の503 retry試験に250ms待機が入る（timer前提の変更） | 同左に加え、確認なしretryの負の対照を外す必要 |

### 付随（A05）

待機の受付と各境界の検査は、同leaseの元期限で行い等号は拒否する。phase／quotaの局所codeは`internal_review_error`へ潰さない（`6a1fcd1`の回帰条件）。推奨案どおりで異論は出にくい。

## 6 D2とD3の連動

legacyでは、releaseの読取が2回とも`upstream_unavailable`で終わった場合もC方式fallbackへ進む。

| D2＼D3 | 3A | 3B | 3C |
|---|---|---|---|
| 2A | fallbackなし | retryのみ追加。枯渇は停止 | 同左（確認なし） |
| 2B | 403／404のみfallback | 403／404に加え、確認済みretry枯渇もfallback候補にするかを別途決める必要 | 組合せ非推奨（確認の有無が不整合） |
| 2C | 403／404のみfallback | 組合せ非推奨 | legacy同等 |

推奨は「2B＋3B、ただしretry枯渇によるfallbackは初版では対象外とし、403／404だけ」。枯渇fallbackは要求の性質が異なる（上流障害時に申告値で進む）ため、別承認に分けることを勧める。

## 7 異論が出にくい項目（推奨どおりの追認を提案）

| ID | 推奨 | 現状 |
|---|---|---|
| A06 | 初版は200のみ成功。3xxは追従しない。他の2xxは別承認 | 実装と一致 |
| A07／ST-A06／STC-A05 | 合成・注入試験は版別の閉じたprofile。開発専用moduleは非同梱 | 梱包確認で非同梱を検査済み |
| STC-A01 | 固定constructor／private継続だけが注入tokenを発行する | ST-03A〜Cで実装・試験済み |
| STC-A03 | 同clock／window・local世代に結合し、claimを戻さない消費順 | 同上 |
| ST-A07 | 既存入口への採用条件と、retry／drain等の後続工程を分離する | 本書の段階案と一致 |

## 8 承認された場合に進める実装と、閉じたままのもの

開発専用fake構成・非実行の内部契約は承認を待たずに進め、承認はruntime採用とC方式判定への接続だけを開く。既に、status binding・単一会計・停止owner（`6695baa`）と同attempt終端／cleanupの連続fake接続（`53c1586`）を実装済み。固定sourceの非実行private受理（[SA-01／02](BEST_PRACTICE_ABORT_SCOPE_STATUS_SOURCE_ACCEPTANCE_DELTA_DESIGN.md)）も承認前の段階として設計されている。これらはfallback・permit・正式発行を生まない。

| 承認 | 進められる実装 | 引き続き閉鎖 |
|---|---|---|
| D1（1B） | 確認済みcleanupを条件とするstatus終端のruntime採用（fake接続は実装済み） | 実transport、実通信 |
| D2（2B） | SA-03：同消費処理からのC方式判定、fixed入口の合成E2E（非実行受理のSA-01／02は承認前） | metadata／payload／worker、final予約移譲、正式発行 |
| D3（3B） | attempt-local終端型、sticky stopの分離、250ms待機の結合 | bodyなし429／5xxのretry、retry枯渇fallback（別承認） |

どの組合せでも、全体受付無効・正式発行口閉鎖・Unknown・調査保留は変更しない。

## 9 承認記入欄

| ID | 判断（推奨案／別案／保留） | 条件・コメント | 日付 | 承認者 |
|---|---|---|---|---|
| D1：A01、ST-A01〜A03、ST-A05、STC-A04 | | | | |
| D2：A02、ST-A04、STC-A02 | | | | |
| D3：A03、A04、A05 | | | | |
| retry枯渇fallback（§6） | | | | |
| A06 | | | | |
| A07、ST-A06、STC-A05 | | | | |
| STC-A01、STC-A03、ST-A07 | | | | |
