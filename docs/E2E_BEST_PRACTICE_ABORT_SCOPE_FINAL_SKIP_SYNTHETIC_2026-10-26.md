# AU-BR-006 局所失敗後のfinal skip・予約解放 合成検証

Date: 2026-10-26 / fake I/O・fake timers限定。

## 1. 範囲と結論

[transport設計draft-0.4 §14](BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_RECEIPTS_DESIGN.md)に基づき、同session会計ownerが保持する初回結果から、理由付きfinal skipと未使用予約の一度限りの解放を実装した。前工程のsession binding／単一会計を前提とする。前工程の896件の記録は当時の実行記録として変更しない。

**fake接続のみ。正式な証拠発行口・全体受付は閉鎖／無効を維持する。** Unknown、VM／監視／telemetry保留を維持し、実transport／worker接続・実機操作・設定変更・有効化は行っていない。

## 2. 状態と会計

- settleの入力を型付き`PreparedAttemptSettlement`へ変更。retryable・固定outcome・cleanup dispositionを別々に保持する。
- table初回はpending → retryable／available／unavailable。confirmed cleanup済みのretry待ちをfinal遷移で打ち切る場合はnot_completedへ進める。
- `skipFinal`は同source・phase・table slot・targetを照合する。ownerがinitial_unavailable／initial_not_completed／evidence_budget_exhaustedを導出し、呼出側の理由申告を受け付けない。初回の固定outcomeも別に返す。
- skip対象はfinal cursorにあるtableだけ。親・metadata、未知／未受付table、別source・clone、通常phase、順序違反、active I/O、未消費body、停止／期限切れ、二重skipを拒否する。
- slotの残りだけRから引く。未開始なら2、最終初回試行後にEが閉じたretry待ちは1を解放する。C/G/E/payloadを返さず、skipそのものはdispatchもchunk課金もゼロ。
- slot終端化後はcursorを進め、既存final permitのretryを閉じる。skip済みslotから新permitも発行しない。後続tableの順序を変更しない。
- cleanup未確認は全体停止のままで、skipや成功へ変換しない。availableはtransport本文の受領だけを意味し、sourceの意味確認済みではない。

## 3. 回帰テスト

`abort-scope-evidence-transport-budget.test.ts`へ21件追加し、同ファイルは27→48件。

| 分類 | 検証した内容 |
|---|---|
| 局所継続 | table Aの404後に理由付きskip、Rを2だけ解放しtable Bのfinal読取へ進む |
| 原因保持 | 構文不正・単体E超過、first retry待ち打切りの固定outcomeを保持 |
| 独立会計 | fixtureのC/G/E/payload/Rをイベントから期待値として固定し、skip前後でR以外が完全不変・dispatch増加ゼロと比較 |
| E閉鎖 | 8tableの累計E枯渇後、全slotを順にzero-dispatchでskip。初回availableでも最終retry前にEが満杯なら残り1だけ解放 |
| 一度限り | 二重skip、skip後のfinal retry拒否。既に使用したCやbytesは保持 |
| 拒否 | 成功tableの任意skip、順序違反、未知table、normal、親、別source、clone、active I/O、pending body、取消・close・期限後 |
| 停止保持 | 未所有lock等でcleanup不明ならskip拒否。失敗tableへの直接final dispatchも拒否し、skip手順を飛ばさせない |

### 初回失敗と修正履歴

1. 実装前に追加した17件は未実装のskip入口で拒否され、44件中27成功・17失敗を確認した。
2. 実装後は43成功・1失敗。失敗はcleanup不明で停止した後にtest helperが新slotを取得しようとしていたもの。停止前のslotとphaseを使い、skip自体の拒否と会計不変を検証する形へ修正した。
3. ビルドでsettle引数の型注釈不足（TS7006）を確認し、内部契約型を明記して再実行した。
4. fixtureのcancel済み状態を全resourceで共有していたため、各resource固有の観測へ修正した。cleanup後に次のresourceへ進むケースで、前resourceのcancelを誤って引き継がないための修正。cancel呼出し総数の観測は維持した。

製品・テストの期限や既存capは緩めていない。

## 4. 実行結果

すべて`bdo`経由で実行。

| 検証 | 結果 |
|---|---|
| transport-budget＋transport-state | 2ファイル・105件成功（48＋57） |
| 上記＋owner／selection／source-stream／final-stream／reservations／channel／bounded-source／release／adapter／target-selection／soft-deadline／R2等 | 22ファイル・917件成功、8.44秒 |
| `npm run build` | 成功 |
| 変更実装4ファイル＋対象testのESLint | 成功、指摘なし |
| `npm pack --dry-run --json --ignore-scripts`＋一覧検査 | 377ファイル、`dist/review/abort-scope-evidence*`同梱0件 |
| `git diff --check` | 成功 |

全合成テスト・実機E2Eを実行したという主張ではない。

## 5. 残課題

- 固定sourceの最終orchestrationからこのskipへ自動接続し、上位結果へreason／limitationsを保持する処理。
- sourceの版／scope等の意味検査で初回をunavailableへ落とす、由来付きのprivate入口。現時点ではtransport結果だけで判定する。
- 実read／cancel／reader.closed／pending Promise／lockと絶対期限への接続。fake snapshotを実cleanup証拠としない。
- 実ReleasePermit・選択receipt／payload・worker plan・phase世代、OAuth bootstrap・cap承認・実worker／公開JSONへの統合。
- skip票は凍結した固定診断だけであり、正式な証拠や成功completionには昇格しない。
