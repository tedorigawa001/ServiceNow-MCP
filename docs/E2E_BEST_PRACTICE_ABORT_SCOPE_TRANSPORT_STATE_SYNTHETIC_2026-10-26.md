# AU-BR-006 用途permit／attempt／cleanup／body receipt 合成検証

Date: 2026-10-26 / Scope: fake I/O・clockのみ。

## 1. 対象と結論

[transport詳細設計draft-0.2](BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_RECEIPTS_DESIGN.md)の第1段階として、開発専用の`abort-scope-evidence-transport-state.ts`と同名テストを追加した。用途permit・attempt claim・cleanup証拠・body receiptを同factoryのprivate台帳へ結合し、再利用・混入・停止後の発行を拒否する。

**正式な証拠発行口は常に拒否。実transport／worker・実機操作・設定変更は実施していない。** Unknown・全体受付無効、VM／監視／telemetry保留を維持する。fake factsは実session・認証snapshot・ReleasePermit・選択／planの証拠ではない。

## 2. 実装と合成観測

| 観点 | 確認内容 |
|---|---|
| 用途・状態 | OAuthを含む9用途、normal→final一方向遷移、旧phase拒否、同用途の二重生成拒否、同permit内だけ最大2attempt |
| 結合 | 同factory source／phase／slot／target、permit／attempt／cleanup／bodyのclone・別factory・付替え拒否、I/O resource再利用拒否 |
| cleanup | EOFとclosedを別観測。pending read、cancel pending／rejected、release失敗、未所有lock、cancel要求だけをconfirmedにしない。no_response／no_bodyを区別 |
| 時刻 | 注入clockの逆行・throw・hard期限、I/Oとcleanupの絶対期限、post-parseと最終abort後の再検査。新しい時間枠を作らない |
| 失敗保持 | 401／用途限定でない403のprimaryを保持し、cleanup不明を別保持。release_rowsの403だけ局所扱い。停止後の再開・新receiptを拒否 |
| body | 一度限りのconsume／discard、未消費最大1件、停止時private参照解除、構文不正・byte上限超過拒否。OAuthは一般receiptを作らない |
| 秘密非出力 | 不透明handleと固定診断／byte数のみ。fake本文や生例外を戻り値へ含めない。正式発行APIは常に拒否 |

dispatch前はattempt／cleanup証拠を発行しない。dispatch後のconfirmedはfakeのAPI観測範囲に限り、OS資源解放や実Promiseの観測済みという意味ではない。

## 3. 初回失敗と修正の履歴

初回54件では51成功・3失敗。次を修正して同じ回帰テストを再実行した。

1. dispatch中に再入停止し、I/O参照が後から返るとabortされなかった。resource未取得時にはabort済みと記録せず、返却後に実行する。
2. 最終abortのcallbackでclockが期限を超えてもbodyを出し得た。abort後にclockを再検査し、最終outcomeを使って発行可否を判定する。
3. abortのthrowをcleanup確認済みとし得た。abort失敗を別保持しunconfirmedとして停止する。

追加の不正resource回帰で、55件中54成功・1失敗を再現。method getterがthrowした返却resourceをdispatch自体のthrowと同じno_responseにしていた。dispatchと返却resource検査を分離し、後者はbinding拒否＋cleanup未確認とした。修正後55件すべて成功。

## 4. 再実行結果

すべて`bdo`経由で実行。

| 検証 | 結果 |
|---|---|
| `npx vitest run tests/review/abort-scope-evidence-transport-state.test.ts` | 1ファイル・55件成功 |
| 上記＋selection-claims／session-owner／final-stream／source-stream／fixed-source／stream／reservations／channel／comparison-owner／phases／owner／evidence、bounded-source／release-gate／operator-release-fallback／update-set-adapter／target-selection／soft-deadline／r2-session／r2-oauth-session | 21ファイル・867件成功、8.69秒 |
| `npm run build` | 成功 |
| 新規実装・テスト2ファイルのESLint | 成功、指摘なし |
| `npm pack --dry-run --json --ignore-scripts`＋一覧検査 | 373ファイル。`dist/review/abort-scope-evidence*`の同梱0件 |
| 差分・文書検査 | `git diff --check`成功。3文書のローカルリンク16件が存在、新規ファイルを含む末尾空白検査成功 |

全リポジトリの全合成テストや実機E2Eを実行したという主張ではない。製品／テストの既存期限・実予算は変更していない。

## 5. 制限と次工程

- fake snapshotの決着値を注入している。実read／cancel Promise／reader.closed／socket／TLS終了や実timerの強制中断は未検証。
- 単一C/G/E/Rと実clock、動的最終予約、finalの固定順序、chunk課金・overshoot・空chunk・payload専用枠は未接続。fake構造上限210permit／10slotは実受付証拠ではない。
- fake JSON文字列の防御的上限は通常4MiB／table16KiB。実streamの受信上限の保証やcap採用承認ではない。同期parseの強制中断も未実装。
- 認証・選択・plan等のboolean fixture、同namespace内のopaque票を正式証拠へ昇格させない。既存の合成予約台帳／stream会計ともまだ接続しない。
- private参照の解除は物理ゼロ化を保証しない。不正返却resourceやcleanup未確認時は停止するが、実資源が解放された証明はない。
- 公開規則・JSON契約・既存0.2／0.3取得経路は変更なし。次は単一budget ownerと実sessionのbindingをfake依存で検証する。
