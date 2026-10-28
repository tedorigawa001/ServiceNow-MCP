# 親安定性：private型・workflow owner・固定比較器の合成検証

Date: 2026-10-29 / Scope: 独立synthetic issuer／fake clock限定。実transport・bytes parser未接続。

設計：[draft-0.2 §11](BEST_PRACTICE_ABORT_SCOPE_PARENT_STABILITY_DESIGN.md#11-合成issuer限定内部型固定比較器one-shot初期実装)。
実装：[合成issuer](../src/review/abort-scope-evidence-parent-stability.ts)。
試験：[65件](../tests/review/parent-stability-model.test.ts)。

## 1. 実装範囲

独立したissuer内でContext／Owner／Use／Draft／Snapshot／Comparisonをprivate型として持ち、公開するのは空の凍結handleと固定結果／診断だけ。WeakMapの同一参照を検査し、同値sys_id・コピー・外国issuer／ownerのhandleをauthorityにしない。Session側のowner生成claimはclock検査前に一度消費する。

初回と最終は同Contextの別request／attempt／slotを持つ。strictな5列のown data propertyだけをprimitive projectionへコピーし、initial受理・final比較準備・比較確定を分離する。各操作はpre-guard→private prepare／claim消費→post-guard→固定同期commit。最終guardで失敗したdraftからsnapshotやstable／changedを公開しない。

比較器はprivate純粋関数で、固定順の5 fieldを必ず完全一致検査する。counterのNumber変換や日付・scopeの正規化はしない。対象ID差分はschema／target検査でinvalid_response、残り4列の差分はchanged_during_reviewで合成runを停止する。これは本番の暫定結果返却とは異なる閉鎖モデルの選択であり、本番verify／adapterは変更していない。

## 2. RED→GREEN・拒否分類の修正

- 最初のtracerはmodule未実装で失敗。初回draft受理→別final observation→比較draft→stable確定を接続して成功した。
- 自ownerの消費済みdraftを再提出すると、active useが変わったためbinding不一致に分類される回帰を再現。既知かつ自ownerの使用済みhandleはinvalid_state、外国／コピーはevidence_binding_mismatchへ分離した。どちらも停止し、外国ownerは変更しない。
- cancel後にowner生成を再要求するとprimaryはcancelledのままでもstateがnot_verifiedに変わる回帰を再現。stateも先行primaryから決め、revokedを維持するよう修正した。
- 初期clock例外を入力不正へまとめる回帰を再現。入力検査とclock例外の扱いを分け、clock失敗はinternal_review_errorとし秘密の例外本文を出さない。
- 追加fixtureに括弧の構文誤りがあり、試験が読み込めない実行が1回あった。fixtureを訂正し、全65件を再実行した。途中の未使用変数／importの静的検査も最終状態で解消した。製品／試験の期限は変更していない。

## 3. 主な観測

| 観点 | 結果 |
|---|---|
| 固定比較 | stable、他4列の非空差分15組合せを独立oracleで確認。field順固定、比較数は常に5 |
| 非正規化 | 20桁counter、JS数値精度を越える差、先頭ゼロ、時刻巻戻り、空文字／global等を文字列のまま比較 |
| 生成claim | session当たりowner1回、初回／final開始・draft発行・consume・比較確定各1回。失敗後の再生成不可 |
| binding | 外国session／issuer／owner／role／use、コピーdraft／comparisonを拒否。外国ownerの診断・保持数は不変 |
| 入力 | 欠落・余剰・型・長さ・target不正、wrapper JSON、Proxy／accessorを拒否。getter／trapを呼ばない |
| guard | 初回受理・比較準備・比較確定のpost-guardで取消。比較準備／確定のpost-guardで期限切れ。未受理の結果を出さない |
| 再入 | owner処理中のclock再入と、owner生成clock内の重複生成を拒否。claimは復元しない |
| 時間 | 生成を遅らせても元のsynthetic deadlineを更新しない。非有限・逆行・例外で停止 |
| 保持 | 初回draft1→baseline1→final draftと合わせ2→比較準備0。stop／closeでstale handleからもrecordをdrop |
| 診断 | 先行primaryとstable／changedの観測履歴を保持。値・対象ID・URL・auth・secretは返さず、差分field名だけ |
| 閉鎖 | 全handleは空の凍結object。global fetchを呼ばず、正式発行disabled、実session登録なし |

独立oracleは試験側の5列fixtureと、4つの差分field名の固定順・bitmaskから期待値を作る。製品比較器を期待値計算へ流用しない。

## 4. 検証結果

| 確認 | 結果 |
|---|---|
| 新規モデル試験 | 65 tests成功 |
| 新モデル＋HTTP／CD-03／CD-02／CD-01／supervisor／stream／body／ReadState／gate | 10 files／396 tests成功 |
| `npm run build` | 成功 |
| 新実装・新試験のESLint | 成功 |
| 全体 `vitest run --maxWorkers=3` | 178 files／5,408 tests成功、33.27秒 |
| offline package-worker smoke | production-only install・解析・集約成功、377 files |
| 関連MDの相対参照先 | 4 files／69 linksの存在確認成功（見出しanchorの自動検証ではない） |
| `git diff --check` | 成功 |

既存ローカル合成待受を許可して全体試験を実行した。PDI／外部サービスには通信していない。新moduleは既存の!dist/review/abort-scope-evidence*除外に入り、梱包テストでも同prefixの非同梱を確認している。

### コミット対象のみの再検証

2026-10-29、HEAD（a0ff78d）に今回の7ファイルだけを重ねた一時snapshotで再実行した。無関係な`.vscode/`と`CLAUDE.md`は含めていない。build・新実装／試験のESLint・全体178 files／5,408 tests（35.41秒）・offline package-worker smoke（377 files）が成功した。関連4文書の相対参照69件の存在と`git diff --check`も確認した。製品／試験の期限は変更していない。

## 5. 未接続・未証明

synthetic issuerはテスト用の5列fixtureを受け付けるだけで、実body・EOF・cleanup・認証snapshotの由来を証明しない。新モデルを既存consumeの返却summaryから生成したり、実session台帳へ登録したりしていない。同bytesの固定private projectionとpost-guard受理、CD-03／CD-04の実際のowner停止／final slotとの接続は次段階。

Contextのcore／budget／auth／generationは合成identityで、実AuthSnapshotIdentity／ReleasePermit／Readonly lease・C/G会計ではない。synthetic deadlineは操作時の検査だけで、自動timer・50／55秒phaseやHTTP attemptの終了保証に接続していない。readonly statusは最後に観測した状態で、現時点のauthorityを認定しない。

保持record数・固定field比較数は論理操作の計数で、GC／物理消去・engine内部heap／work上界の証明ではない。raw JS fixtureのown key列挙前allocationにも上界受付を導入していない。本番cap／全体受付は無効のまま。

正式発行口閉鎖・Unknown・全体受付無効、VM／監視／telemetry保留を維持。実通信・実機操作・token発行・設定変更・Pushは行わない。
